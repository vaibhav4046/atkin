/**
 * Exports.
 *
 * The export is the product. Nobody wants a screening tool, they want the thing
 * they were going to spend Saturday making: a table they can paste into a chapter,
 * a spreadsheet their supervisor can open, and the counts a methods section has to
 * state. So every format carries the quote and whether it checked out, and the
 * ones a person overrode are marked as theirs rather than quietly absorbed.
 */
import type { Criterion, Preset, Row, Verdict } from './types';

/** Columns every export carries, whatever the preset asked for. */
const SPINE = ['name', 'decision', 'criterion', 'reason', 'quote', 'evidence_checked'] as const;

export function columnsFor(preset: Preset): string[] {
  const rest = preset.exportColumns.filter((c) => !SPINE.includes(c as (typeof SPINE)[number]));
  return [...SPINE, ...rest];
}

export function verdictLabel(verdict: Verdict, preset: Preset): string {
  if (verdict === 'include') return preset.decisionLabels.include;
  if (verdict === 'exclude') return preset.decisionLabels.exclude;
  if (verdict === 'maybe') return preset.decisionLabels.maybe;
  return 'Needs review';
}

function criterionLabel(id: string | null, criteria: readonly Criterion[]): string {
  if (id === null) return '';
  return criteria.find((c) => c.id === id)?.label ?? id;
}

/** One flat record per document, keyed by export column name. */
export function buildRecord(row: Row, preset: Preset, criteria: readonly Criterion[]): Record<string, string> {
  const s = row.screening;
  const record: Record<string, string> = {
    name: row.doc.name,
    decision: verdictLabel(row.finalVerdict, preset),
    criterion: criterionLabel(s.criterionId, criteria),
    reason: row.override !== null ? row.override.note || s.reason : s.reason,
    quote: s.evidence?.quote ?? '',
    evidence_checked:
      s.evidence === null ? 'no quote given' : s.evidence.verified ? 'found in document' : 'NOT FOUND in document',
    confidence: s.confidence === null ? '' : s.confidence.toFixed(2),
    overridden: row.override !== null ? 'yes, by you' : '',
    source: s.producedBy === 'sample' ? 'worked example' : s.producedBy === 'machine' ? 'not read' : 'model',
    note: s.note ?? '',
  };
  for (const [id, field] of Object.entries(row.extraction?.fields ?? {})) {
    record[id] = field.value;
  }
  return record;
}

function csvCell(value: string): string {
  // A leading =, +, - or @ makes Excel treat the cell as a formula. Prefix a
  // single quote so a document title starting with a dash cannot execute.
  const guarded = /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
  return /[",\r\n]/.test(guarded) ? '"' + guarded.replace(/"/g, '""') + '"' : guarded;
}

export function toCsv(rows: readonly Row[], preset: Preset, criteria: readonly Criterion[]): string {
  const columns = columnsFor(preset);
  const lines = [columns.map(csvCell).join(',')];
  for (const row of rows) {
    const record = buildRecord(row, preset, criteria);
    lines.push(columns.map((c) => csvCell(record[c] ?? '')).join(','));
  }
  // The byte order mark is what makes Excel read this as UTF-8 rather than
  // turning every accented author name into mojibake.
  return '﻿' + lines.join('\r\n') + '\r\n';
}

function mdCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

export function toMarkdown(rows: readonly Row[], preset: Preset, criteria: readonly Criterion[]): string {
  const columns = columnsFor(preset);
  const head = '| ' + columns.join(' | ') + ' |';
  const rule = '| ' + columns.map(() => '---').join(' | ') + ' |';
  const body = rows.map((row) => {
    const record = buildRecord(row, preset, criteria);
    return '| ' + columns.map((c) => mdCell(record[c] ?? '')).join(' | ') + ' |';
  });
  return [head, rule, ...body].join('\n') + '\n';
}

export type Flow = {
  identified: number;
  screened: number;
  included: number;
  excluded: number;
  maybe: number;
  review: number;
  overridden: number;
  unverifiedEvidence: number;
  excludedByCriterion: { id: string; label: string; count: number }[];
};

export function computeFlow(rows: readonly Row[], criteria: readonly Criterion[]): Flow {
  const counts = new Map<string, number>();
  let included = 0;
  let excluded = 0;
  let maybe = 0;
  let review = 0;
  let overridden = 0;
  let unverifiedEvidence = 0;

  for (const row of rows) {
    if (row.override !== null) overridden++;
    if (row.screening.evidence !== null && !row.screening.evidence.verified) unverifiedEvidence++;
    switch (row.finalVerdict) {
      case 'include':
        included++;
        break;
      case 'exclude': {
        excluded++;
        const id = row.screening.criterionId;
        if (id !== null) counts.set(id, (counts.get(id) ?? 0) + 1);
        break;
      }
      case 'maybe':
        maybe++;
        break;
      default:
        review++;
    }
  }

  const excludedByCriterion = criteria
    .map((c) => ({ id: c.id, label: c.label, count: counts.get(c.id) ?? 0 }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);

  const unattributed = excluded - excludedByCriterion.reduce((n, c) => n + c.count, 0);
  if (unattributed > 0) {
    excludedByCriterion.push({ id: '', label: 'No single criterion named', count: unattributed });
  }

  return {
    identified: rows.length,
    screened: rows.length,
    included,
    excluded,
    maybe,
    review,
    overridden,
    unverifiedEvidence,
    excludedByCriterion,
  };
}

/**
 * The decision log.
 *
 * This is the file that goes in an appendix. It states what was screened, on what
 * rules, by what, and it does not round off the parts that went wrong.
 */
export function toDecisionLog(
  rows: readonly Row[],
  preset: Preset,
  criteria: readonly Criterion[],
  meta: { startedAt: string; producedBy: string },
): string {
  const flow = computeFlow(rows, criteria);
  const out: string[] = [];

  out.push('# Screening decision log');
  out.push('');
  out.push(`Screened with Atkin, ${preset.name} preset, on ${new Date(meta.startedAt).toUTCString()}.`);
  out.push(`Decisions produced by: ${meta.producedBy}.`);
  out.push('');
  out.push('## The question');
  out.push('');
  out.push(preset.decisionQuestion || 'Not stated.');
  out.push('');
  out.push('## Criteria applied');
  out.push('');
  for (const c of criteria.filter((c) => c.value.trim().length > 0)) {
    out.push(`- **${c.label}.** ${c.value.trim()}`);
  }
  out.push('');
  out.push('## Counts');
  out.push('');
  out.push(`- Documents put in: ${flow.identified}`);
  out.push(`- Screened: ${flow.screened}`);
  out.push(`- Included: ${flow.included}`);
  out.push(`- Excluded: ${flow.excluded}`);
  out.push(`- Borderline: ${flow.maybe}`);
  out.push(`- Needing review: ${flow.review}`);
  if (flow.overridden > 0) out.push(`- Changed by hand afterwards: ${flow.overridden}`);
  if (flow.unverifiedEvidence > 0) {
    out.push(
      `- Decisions whose quoted evidence was not found in the document, and were therefore not accepted: ${flow.unverifiedEvidence}`,
    );
  }
  out.push('');

  if (flow.excludedByCriterion.length > 0) {
    out.push('### Exclusions by criterion');
    out.push('');
    for (const c of flow.excludedByCriterion) out.push(`- ${c.label}: ${c.count}`);
    out.push('');
  }

  out.push('## Every decision');
  out.push('');
  out.push(toMarkdown(rows, preset, criteria));

  const review = rows.filter((r) => r.finalVerdict === 'review');
  if (review.length > 0) {
    out.push('## Still needing a person');
    out.push('');
    for (const row of review) {
      out.push(`- **${row.doc.name}.** ${row.screening.note ?? 'No reason recorded.'}`);
    }
    out.push('');
  }

  return out.join('\n');
}

/**
 * The screening engine.
 *
 * One pass over a pile of documents, cheap stage first. Every document gets
 * screened against the criteria using its abstract or opening pages, and only the
 * ones that survive get read in full for field extraction. That ordering is the
 * difference between a run that costs pennies and one that does not, and it is
 * also how a person would do it.
 *
 * The engine never produces a decision it cannot back. A model reply that fails to
 * parse, or that quotes a sentence which is not in the document, becomes `review`
 * with a note saying why. Silence would be worse than a wrong answer here: the
 * whole point is that the user can trust the greens without rereading the pile.
 */
import type {
  Criterion,
  Doc,
  Evidence,
  ExtractionField,
  Extraction,
  Preset,
  Produced,
  RunResult,
  RunUsage,
  Screening,
} from './types';
import { buildExtractPrompt, buildRepairPrompt, buildScreenPrompt } from './prompt';
import { findQuote, normalizeWithMap } from './verify';
import type { ParseResult } from './validate';
import { parseExtractPayload, parseScreenPayload } from './validate';

export const LIMITS = {
  /** Refuse a bigger pile rather than run up a bill nobody agreed to. */
  maxDocs: 120,
  /** Characters of each document sent for screening. */
  screenChars: 6_000,
  /** Characters of each included document sent for extraction. */
  extractChars: 24_000,
  /** Below this a file has no usable text layer and must not be judged. */
  minDocChars: 40,
  concurrency: 3,
  /** One retry, then give up and say so. */
  maxRepairs: 1,
} as const;

export type ModelClient = {
  id: string;
  label: string;
  /** What the interface should say produced these answers. */
  kind: Produced;
  complete(prompt: string, signal: AbortSignal | undefined): Promise<string>;
};

export type Progress = {
  stage: 'screen' | 'extract' | 'done';
  done: number;
  total: number;
  docName: string;
};

export type RunOptions = {
  preset: Preset;
  criteria: readonly Criterion[];
  docs: readonly Doc[];
  client: ModelClient;
  extract: boolean;
  onProgress: ((p: Progress) => void) | null;
  signal: AbortSignal | undefined;
};

type MutableUsage = { -readonly [K in keyof RunUsage]: RunUsage[K] };

/**
 * The part of a paper worth screening on.
 *
 * A title plus an abstract decides most screening calls, and it is a twentieth of
 * the tokens of a full paper. When there is no abstract heading, the opening of
 * the document is the next best thing.
 */
export function screeningExcerpt(text: string, cap: number = LIMITS.screenChars): string {
  const head = text.slice(0, 400);
  const marker = /^[ \t]*(abstract|summary|s u m m a r y)\b[:.\s]*/im.exec(text);

  if (marker?.index !== undefined) {
    const from = marker.index;
    const rest = text.slice(from);
    // Stop at the next major heading so the introduction does not come along.
    const stop = /\n[ \t]*(?:\d+[.)]\s*)?(introduction|background|keywords|key words|1\s+introduction)\b/i.exec(rest);
    const body = stop?.index !== undefined ? rest.slice(0, stop.index) : rest.slice(0, cap);
    const joined = from > 400 ? head + '\n\n' + body : body;
    return joined.slice(0, cap);
  }
  return text.slice(0, cap);
}

async function pool<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const width = Math.max(1, Math.min(limit, items.length));
  await Promise.all(
    Array.from({ length: width }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i] as T, i);
      }
    }),
  );
  return out;
}

type Asked<T> = { ok: true; value: T; ms: number } | { ok: false; error: string; ms: number };

/** Call the model, validate, allow exactly one repair round, then give up honestly. */
async function askJson<T>(
  client: ModelClient,
  prompt: string,
  parse: (raw: string) => ParseResult<T>,
  usage: MutableUsage,
  signal: AbortSignal | undefined,
): Promise<Asked<T>> {
  const started = Date.now();
  let raw: string;
  try {
    usage.modelCalls++;
    raw = await client.complete(prompt, signal);
  } catch (e) {
    return { ok: false, error: 'could not reach the model: ' + (e as Error).message, ms: Date.now() - started };
  }

  const first = parse(raw);
  if (first.ok) return { ok: true, value: first.value, ms: Date.now() - started };

  for (let attempt = 0; attempt < LIMITS.maxRepairs; attempt++) {
    let retryRaw: string;
    try {
      usage.modelCalls++;
      usage.repairCalls++;
      retryRaw = await client.complete(buildRepairPrompt(prompt, raw, first.error), signal);
    } catch (e) {
      return { ok: false, error: 'could not reach the model: ' + (e as Error).message, ms: Date.now() - started };
    }
    const again = parse(retryRaw);
    if (again.ok) return { ok: true, value: again.value, ms: Date.now() - started };
    raw = retryRaw;
  }

  return {
    ok: false,
    error: 'the model did not return usable JSON, even after being asked again: ' + first.error,
    ms: Date.now() - started,
  };
}

function checkQuote(quote: string, docText: string): Evidence {
  const hit = findQuote(quote, normalizeWithMap(docText));
  return hit === null
    ? { quote, verified: false, start: null, end: null }
    : { quote, verified: true, start: hit.start, end: hit.end };
}

const emptyScreening = (docId: string, note: string, ms: number): Screening => ({
  docId,
  verdict: 'review',
  criterionId: null,
  reason: 'Atkin could not decide this one.',
  evidence: null,
  confidence: null,
  note,
  producedBy: 'machine',
  ms,
});

export async function screenDoc(
  client: ModelClient,
  preset: Preset,
  criteria: readonly Criterion[],
  doc: Doc,
  usage: MutableUsage,
  signal: AbortSignal | undefined,
): Promise<Screening> {
  // A file with no text layer is not an exclusion, it is an unread document. Say
  // so without spending a call on it.
  if (doc.text.trim().length < LIMITS.minDocChars) {
    return emptyScreening(
      doc.id,
      'There was almost no readable text in this file. If it is a scan, it needs running through OCR first.',
      0,
    );
  }

  const excerpt = screeningExcerpt(doc.text);
  usage.screenChars += excerpt.length;

  const ids = criteria.map((c) => c.id);
  const asked = await askJson(
    client,
    buildScreenPrompt({ preset, criteria, docName: doc.name, docText: excerpt }),
    (raw) => parseScreenPayload(raw, ids),
    usage,
    signal,
  );

  if (!asked.ok) return emptyScreening(doc.id, asked.error, asked.ms);

  const payload = asked.value;
  const evidence = checkQuote(payload.quote, doc.text);

  if (!evidence.verified) {
    return {
      docId: doc.id,
      verdict: 'review',
      criterionId: payload.criterionId,
      reason: payload.reason,
      evidence,
      confidence: payload.confidence,
      note: 'The sentence quoted as evidence does not appear in this document, so the decision behind it cannot be trusted.',
      producedBy: client.kind,
      ms: asked.ms,
    };
  }

  return {
    docId: doc.id,
    verdict: payload.decision,
    criterionId: payload.criterionId,
    reason: payload.reason,
    evidence,
    confidence: payload.confidence,
    note: null,
    producedBy: client.kind,
    ms: asked.ms,
  };
}

export async function extractDoc(
  client: ModelClient,
  fields: readonly ExtractionField[],
  doc: Doc,
  usage: MutableUsage,
  signal: AbortSignal | undefined,
): Promise<Extraction> {
  const text = doc.text.slice(0, LIMITS.extractChars);
  usage.extractChars += text.length;

  const asked = await askJson(
    client,
    buildExtractPrompt({ fields, docName: doc.name, docText: text }),
    (raw) => parseExtractPayload(raw, fields.map((f) => f.id)),
    usage,
    signal,
  );

  if (!asked.ok) {
    return { docId: doc.id, fields: {}, note: asked.error, producedBy: 'machine', ms: asked.ms };
  }

  const out: Extraction['fields'] = {};
  for (const [id, entry] of Object.entries(asked.value.fields)) {
    out[id] = {
      value: entry.value,
      evidence: entry.quote.length > 0 ? checkQuote(entry.quote, doc.text) : null,
    };
  }
  return { docId: doc.id, fields: out, note: null, producedBy: client.kind, ms: asked.ms };
}

export async function runScreening(opts: RunOptions): Promise<RunResult> {
  const { preset, criteria, docs, client, extract, onProgress, signal } = opts;
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  const usage: MutableUsage = { modelCalls: 0, repairCalls: 0, screenChars: 0, extractChars: 0, ms: 0 };
  const capped = docs.slice(0, LIMITS.maxDocs);
  const stoppedReason =
    docs.length > LIMITS.maxDocs
      ? `Only the first ${LIMITS.maxDocs} of ${docs.length} documents were screened. Split the pile and run it again.`
      : null;

  let done = 0;
  const screenings = await pool(capped, LIMITS.concurrency, async (doc) => {
    const result = await screenDoc(client, preset, criteria, doc, usage, signal);
    done++;
    onProgress?.({ stage: 'screen', done, total: capped.length, docName: doc.name });
    return result;
  });

  let extractions: Extraction[] = [];
  if (extract && preset.extractionFields.length > 0) {
    const includedIds = new Set(screenings.filter((s) => s.verdict === 'include').map((s) => s.docId));
    const targets = capped.filter((d) => includedIds.has(d.id));
    let extracted = 0;
    extractions = await pool(targets, LIMITS.concurrency, async (doc) => {
      const result = await extractDoc(client, preset.extractionFields, doc, usage, signal);
      extracted++;
      onProgress?.({ stage: 'extract', done: extracted, total: targets.length, docName: doc.name });
      return result;
    });
  }

  usage.ms = Date.now() - t0;
  onProgress?.({ stage: 'done', done: capped.length, total: capped.length, docName: '' });

  return {
    runId: 'run_' + Date.now().toString(36),
    startedAt,
    presetId: preset.id,
    criteria: criteria.map((c) => ({ ...c })),
    screenings,
    extractions,
    usage,
    stoppedReason,
  };
}

/**
 * Validation for model output.
 *
 * Everything a model returns is untrusted input that happens to be shaped like an
 * answer. It gets parsed and checked here, or it does not get used. There are no
 * unchecked casts downstream of this file.
 */

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const fail = <T,>(error: string): ParseResult<T> => ({ ok: false, error });

/**
 * Pull a JSON object out of a reply that may be wrapped in prose or a code fence.
 *
 * Brace counting rather than a regular expression, because a regular expression
 * cannot match nested braces and the payloads carry quoted document text with
 * braces in it often enough to matter.
 */
export function extractJsonBlock(raw: string): string | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const body = fenced?.[1] ?? raw;

  const start = body.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < body.length; i++) {
    const ch = body[i] as string;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      if (inString) escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return body.slice(start, i + 1);
    }
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asTrimmedString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, max);
}

export type ScreenPayload = {
  decision: 'include' | 'exclude' | 'maybe';
  criterionId: string | null;
  reason: string;
  quote: string;
  confidence: number | null;
};

const DECISIONS = new Set(['include', 'exclude', 'maybe']);

export function parseScreenPayload(raw: string, criterionIds: readonly string[]): ParseResult<ScreenPayload> {
  const block = extractJsonBlock(raw);
  if (block === null) return fail('the reply contained no JSON object');

  let parsed: unknown;
  try {
    parsed = JSON.parse(block);
  } catch (e) {
    return fail('the JSON did not parse: ' + (e as Error).message);
  }

  const obj = asRecord(parsed);
  if (obj === null) return fail('the JSON was not an object');

  const decision = typeof obj['decision'] === 'string' ? obj['decision'].trim().toLowerCase() : '';
  if (!DECISIONS.has(decision)) {
    return fail('decision was ' + JSON.stringify(obj['decision']) + ', expected include, exclude or maybe');
  }

  const reason = asTrimmedString(obj['reason'], 600);
  if (reason === null) return fail('reason was missing or empty');

  const quote = asTrimmedString(obj['quote'], 1200);
  if (quote === null) return fail('quote was missing or empty');

  // An unknown criterion id is an invented one. Drop it rather than trust it: the
  // decision can still stand on its quote, it just loses the attribution.
  const rawCriterion = typeof obj['criterionId'] === 'string' ? obj['criterionId'].trim() : '';
  const criterionId = criterionIds.includes(rawCriterion) ? rawCriterion : null;

  const rawConfidence = obj['confidence'];
  const confidence =
    typeof rawConfidence === 'number' && Number.isFinite(rawConfidence)
      ? Math.min(1, Math.max(0, rawConfidence))
      : null;

  return {
    ok: true,
    value: { decision: decision as ScreenPayload['decision'], criterionId, reason, quote, confidence },
  };
}

export type ExtractPayload = { fields: Record<string, { value: string; quote: string }> };

export function parseExtractPayload(raw: string, fieldIds: readonly string[]): ParseResult<ExtractPayload> {
  const block = extractJsonBlock(raw);
  if (block === null) return fail('the reply contained no JSON object');

  let parsed: unknown;
  try {
    parsed = JSON.parse(block);
  } catch (e) {
    return fail('the JSON did not parse: ' + (e as Error).message);
  }

  const obj = asRecord(parsed);
  if (obj === null) return fail('the JSON was not an object');

  const fieldsRaw = asRecord(obj['fields']);
  if (fieldsRaw === null) return fail('fields was missing or not an object');

  const fields: Record<string, { value: string; quote: string }> = {};
  for (const id of fieldIds) {
    const entry = asRecord(fieldsRaw[id]);
    if (entry === null) continue;
    const value = asTrimmedString(entry['value'], 800);
    if (value === null) continue;
    fields[id] = { value, quote: asTrimmedString(entry['quote'], 1200) ?? '' };
  }

  if (Object.keys(fields).length === 0) return fail('none of the requested fields came back with a value');
  return { ok: true, value: { fields } };
}

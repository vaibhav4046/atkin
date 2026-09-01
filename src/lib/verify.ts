/**
 * Quote verification.
 *
 * A model asked for evidence will happily produce a quotation that reads perfectly
 * and does not exist. This module is the check: normalise both sides the way a PDF
 * mangles text, then require the quote to actually occur in the document.
 *
 * The normalisation has to survive real documents, not clean ones:
 *   - PDF text layers break words across lines with a hyphen, "regres-\nsion"
 *   - copy-paste turns quotes curly and hyphens into en dashes
 *   - ligatures come through as single codepoints
 *   - non-breaking and thin spaces look like spaces and are not
 *
 * Everything folds to a lowercase, single-spaced form, and a parallel index map
 * carries each normalised character back to where it came from so the interface
 * can highlight the real passage.
 */

/** Below this many characters a "quote" is not evidence, it is a coincidence. */
export const MIN_QUOTE_CHARS = 12;

const FOLD: Record<string, string> = {
  '‘': "'",
  '’': "'",
  '‚': "'",
  '‛': "'",
  '“': '"',
  '”': '"',
  '„': '"',
  '‟': '"',
  '–': '-',
  '—': '-',
  '―': '-',
  '−': '-',
  'ﬀ': 'ff',
  'ﬁ': 'fi',
  'ﬂ': 'fl',
  'ﬃ': 'ffi',
  'ﬄ': 'ffl',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  '　': ' ',
  '…': '...',
};

/** Zero-width and directional marks, deleted outright. */
const INVISIBLE = /[​‌‍⁠﻿­‎‏‪-‮]/;

/** Hyphen-like characters that can end a wrapped line. */
const HYPHENS = new Set(['-', '‐', '‑']);

export type Normalized = { text: string; map: number[] };

/**
 * Fold `src` to a comparable form, keeping a map from each output character back
 * to its index in `src`.
 */
export function normalizeWithMap(src: string): Normalized {
  const out: string[] = [];
  const map: number[] = [];
  let pendingSpace = false;

  const push = (s: string, at: number): void => {
    if (pendingSpace) {
      if (out.length > 0) {
        out.push(' ');
        map.push(at);
      }
      pendingSpace = false;
    }
    for (const ch of s) {
      out.push(ch);
      map.push(at);
    }
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i] as string;

    if (INVISIBLE.test(ch)) continue;

    // A hyphen immediately before a line break is word wrapping, not punctuation.
    // Drop it and the whitespace after it so the two halves join up.
    if (HYPHENS.has(ch)) {
      let j = i + 1;
      while (j < src.length && (src[j] === ' ' || src[j] === '\t' || src[j] === '\r')) j++;
      if (j < src.length && src[j] === '\n') {
        while (j < src.length && /\s/.test(src[j] as string)) j++;
        i = j - 1;
        continue;
      }
    }

    const folded = FOLD[ch] ?? ch;
    if (/^\s+$/.test(folded)) {
      pendingSpace = true;
      continue;
    }
    push(folded.toLowerCase(), i);
  }

  return { text: out.join(''), map };
}

export function normalize(src: string): string {
  return normalizeWithMap(src).text;
}

export type QuoteHit = { start: number; end: number };

/**
 * Find `quote` inside `doc`.
 *
 * Models like to elide the middle of a long passage with an ellipsis. That is a
 * fair quotation, so a quote containing "..." is split and each fragment must
 * appear, in order. The returned span covers the first fragment through the last.
 */
export function findQuote(quote: string, doc: Normalized): QuoteHit | null {
  const fragments = quote
    .split(/\s*(?:\.\.\.|…)\s*/)
    .map((f) => normalize(f).trim())
    .filter((f) => f.length > 0);

  if (fragments.length === 0) return null;
  // Every fragment must be substantial, otherwise "the ... of" would verify.
  if (fragments.some((f) => f.length < MIN_QUOTE_CHARS)) return null;

  let cursor = 0;
  let first: number | null = null;
  let last = 0;

  for (const fragment of fragments) {
    const at = doc.text.indexOf(fragment, cursor);
    if (at === -1) return null;
    if (first === null) first = at;
    last = at + fragment.length;
    cursor = last;
  }

  if (first === null) return null;
  const start = doc.map[first];
  const endMapped = doc.map[last - 1];
  if (start === undefined || endMapped === undefined) return null;
  return { start, end: endMapped + 1 };
}

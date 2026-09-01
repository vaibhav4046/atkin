/**
 * The worked example.
 *
 * Ten synthetic abstracts and a set of prepared answers, both bundled into the
 * build so the first run costs nothing, needs no key, and works with the network
 * unplugged. A judge or a stranger clicks one button and sees the real interface
 * with real screened rows in it.
 *
 * The corpus is deliberately awkward. It contains a paper that fails on each
 * criterion in turn, one that genuinely cannot be judged from its abstract, one
 * carrying a paragraph addressed to whatever model reads it, and one file with no
 * text layer at all. If Atkin handles those four, the easy ones were never the
 * question.
 */
import type { Doc } from './lib/types';

const texts = import.meta.glob('../fixtures/literature-review/*.txt', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

import answersJson from '../fixtures/literature-review/answers.json';

export const SAMPLE_ANSWERS: Readonly<Record<string, string>> = answersJson;

export const SAMPLE_DOCS: Doc[] = Object.entries(texts)
  .map(([path, text]) => {
    const name = path.split('/').pop() ?? path;
    return { id: name, name, text, bytes: new TextEncoder().encode(text).length };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

/** One already-screened row, shown on the opening page before anything is clicked. */
export const SPECIMEN = {
  name: '03-schoolchildren-classroom-trial.txt',
  verdict: 'exclude' as const,
  criterion: 'Population',
  reason: 'The sample is children aged 9 to 11, so it fails the adults-only population criterion.',
  quote: 'Participants were 486 schoolchildren aged 9 to 11 years.',
};

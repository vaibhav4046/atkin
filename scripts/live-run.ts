/**
 * Run the worked-example corpus through a real model.
 *
 *   pnpm tsx scripts/live-run.ts qwen3:4b-instruct
 *
 * The offline checks prove the machinery: what happens to a fabricated quote, an
 * unparseable reply, a document giving orders. They do not prove that a real model
 * pointed at real criteria produces sensible verdicts, because every answer in
 * them is one this file wrote.
 *
 * This closes that gap. It screens the ten fixtures with an actual local model and
 * prints what came back against what a person would say, including the ones it got
 * wrong. Disagreement is not a failure of the harness, it is the measurement, and
 * a small local model is expected to disagree sometimes.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScreening } from '../src/lib/engine';
import { ollamaClient } from '../src/lib/providers';
import { computeFlow } from '../src/lib/export';
import { normalize } from '../src/lib/verify';
import type { Criterion, Doc, Preset, Row, Verdict } from '../src/lib/types';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const FIXTURES = join(ROOT, 'fixtures', 'literature-review');

const preset = JSON.parse(readFileSync(join(ROOT, 'presets', 'literature-review.json'), 'utf8')) as Preset;
const criteria: Criterion[] = preset.criteriaTemplate;

/** What a person screening this corpus by hand would say. */
const HUMAN: Record<string, Verdict> = {
  '01-sit-less-rct.txt': 'include',
  '02-standing-desks-cohort.txt': 'include',
  '03-schoolchildren-classroom-trial.txt': 'exclude',
  '04-editorial-we-must-stand.txt': 'exclude',
  '05-2009-workstation-pilot.txt': 'exclude',
  '06-protocol-sedentary-staff.txt': 'exclude',
  '07-qualitative-barriers-interviews.txt': 'exclude',
  '08-brief-conference-note.txt': 'maybe',
  '09-embedded-instruction.txt': 'exclude',
  '10-scanned-no-text-layer.txt': 'review',
};

const docs: Doc[] = readdirSync(FIXTURES)
  .filter((f) => f.endsWith('.txt'))
  .sort()
  .map((name) => {
    const text = readFileSync(join(FIXTURES, name), 'utf8');
    return { id: name, name, text, bytes: Buffer.byteLength(text) };
  });

const model = process.argv[2] ?? 'qwen3:4b-instruct';
const base = process.env['OLLAMA_HOST'] ?? 'http://localhost:11434';

console.log(`\nScreening ${docs.length} documents with ${model} on ${base}\n`);

const result = await runScreening({
  preset,
  criteria,
  docs,
  client: ollamaClient({ base, model }),
  extract: true,
  onProgress: (p) => {
    if (p.stage !== 'done') process.stdout.write(`\r  ${p.stage} ${p.done}/${p.total}   `);
  },
  signal: undefined,
});
process.stdout.write('\r' + ' '.repeat(40) + '\r');

let agreed = 0;
let unverified = 0;

for (const doc_ of docs) {
  const doc = doc_;
  const s = result.screenings.find((x) => x.docId === doc.id);
  if (s === undefined) continue;
  const want = HUMAN[doc.id];
  const same = s.verdict === want;
  if (same) agreed++;
  if (s.evidence !== null && !s.evidence.verified) unverified++;
  const flag = same ? '  ' : '!!';
  console.log(`${flag} ${doc.name.padEnd(38)} ${s.verdict.padEnd(8)} (a person would say ${want})`);
  if (!same || s.note !== null) {
    console.log(`     ${s.reason.slice(0, 110)}`);
    if (s.note !== null) console.log(`     note: ${s.note.slice(0, 110)}`);
    if (s.evidence !== null && !s.evidence.verified) {
      // Dump the rejected quote next to the source so a human can tell a model
      // hallucination apart from a matcher that is too strict. That difference
      // decides whether the verification layer is working or silently throwing
      // away good decisions.
      console.log(`     REJECTED QUOTE: ${JSON.stringify(s.evidence.quote)}`);
      const norm = normalize(s.evidence.quote);
      const words = norm.split(' ');
      const doc = normalize(readFileSync(join(FIXTURES, doc_.name), 'utf8'));
      let longest = '';
      for (let n = words.length; n >= 3; n--) {
        for (let i = 0; i + n <= words.length; i++) {
          const run = words.slice(i, i + n).join(' ');
          if (doc.includes(run)) { longest = run; break; }
        }
        if (longest) break;
      }
      console.log(`     longest run actually present (${longest.split(' ').filter(Boolean).length}/${words.length} words): ${JSON.stringify(longest.slice(0, 120))}`);
    } else if (s.evidence !== null) console.log(`     quote checks out`);
  }
}

const rows: Row[] = docs.flatMap((doc) => {
  const screening = result.screenings.find((s) => s.docId === doc.id);
  return screening === undefined ? [] : [{ doc, screening, extraction: null, override: null, finalVerdict: screening.verdict }];
});
const flow = computeFlow(rows, criteria);

console.log(`\n  agreed with a person on ${agreed} of ${docs.length}`);
console.log(`  ${result.usage.modelCalls} model calls, ${result.usage.repairCalls} of them retries after unusable output`);
console.log(`  ${unverified} decisions quoted text that is not in the document, and were not accepted`);
console.log(`  counts: ${flow.included} include, ${flow.excluded} exclude, ${flow.maybe} maybe, ${flow.review} review`);
console.log(`  ${(result.usage.ms / 1000).toFixed(1)} seconds, ${result.usage.screenChars} characters screened\n`);

const injection = result.screenings.find((s) => s.docId === '09-embedded-instruction.txt');
console.log(
  `  the document that ordered the model to include it: ${injection?.verdict ?? 'missing'}` +
    (injection?.verdict === 'exclude' ? '  (the instruction was ignored)' : '  (LOOK AT THIS)'),
);
console.log('');

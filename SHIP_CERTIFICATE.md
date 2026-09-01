# Ship certificate

Issued 1 September 2026, after the Ultimatum double pass.

## What is shipped

| | |
| --- | --- |
| Commit | `f85a4a1c4bfc142bb8094781711a24b14bef5d36` |
| Deployment | `atkin-ocm5148xn-vaibhav4046s-projects.vercel.app` |
| Launch link | **https://atkin-app.vercel.app** |
| Also aliased | `readthepile.vercel.app`, `atkin-desk.vercel.app` |
| Bundle | `index-BaeILOIe.js` `sha256:0cd2265176b11d04…`, 63.9 kB gzip |
| Stylesheet | `index-BZVNaYDF.css` `sha256:0411c5820993701b…`, 3.0 kB gzip |
| Page | `index.html` `sha256:cd6fd3996f96a2d9…` |
| Total | 212 kB on disk |
| Source | https://github.com/vaibhav4046/atkin, public, MIT |

Local working copy, the deployed build, and the live aliases are the same
commit. `git status` is clean.

## The double pass

Everything below was run twice in a row, the second time in a browser tab that
had never loaded the app.

| | pass 1 | pass 2 |
| --- | --- | --- |
| `pnpm typecheck`, strict | clean | clean |
| `pnpm check`, offline | 49 of 49 | 49 of 49 |
| Cold load to a downloaded decision log | 4.0 s | 2.0 s |
| Console messages of any kind on the published build | none | none |
| Counts reconcile with the exclusion breakdown | yes | yes |
| Injection document excluded on population, correct passage highlighted | yes | yes |
| Scan with no text layer flagged, zero model calls | yes | yes |
| Double click on an export | 1 save | 1 save |
| Token spend | zero | zero |

`pnpm check:live` adds a fiftieth check that posts `atkin.ollama.pipe` to a
running `rocketride-server` v3.3.1 and asserts it is accepted and issued a `tk_`
task token. It passes.

## Fixes, with before and after

Full evidence in `QA_LEDGER.md`. The three that mattered:

**D8, P0, spend without consent.** Three fast clicks on Run started three
concurrent runs. The guard was the `disabled` attribute, which is React state and
does not apply until the next render, so all three handlers ran first and all
three passed. The last result was displayed, so nothing looked wrong. Measured in
the browser by counting `fetch` calls with the model pointed at a countable URL:

```
before   27 model calls for one triple click
after     9 model calls   (nine, not ten: the empty scan never calls a model)
```

**D9, P1, decisions built on nothing.** With every criterion deleted, the run
went ahead and returned confident include and exclude verdicts, the model having
been asked to judge each paper against an empty list. Now refused, with copy.

**D1, P1, a false claim the user could check.** A real local model returned the
single word `"Abstract"` as its quote. The message said the quote "does not
appear in this document". That word does appear. The two failures now read
differently: too short to check, versus genuinely absent. Two checks hold the
distinction apart.

Also fixed: D0 deploy drift, D2 sample answers replaying under the wrong preset,
D3 a provenance line that contradicted itself, D4 a prepared quote that ran past
its sentence and cited the injection paragraph beneath it, D5 an em dash in the
page title, D10 and D13 focus rings falling back to the browser default on every
control that was not wearing `.btn`, D11 a double click saving the same export
twice, D12 an object URL revoked in a way that races the download.

## Waived, with reasons

**D6, P1, the quote check proves existence and not support.** A 2009 paper was
included by the live model with a genuine, verified quote, because the model
misread the date criterion. This cannot be fixed by the verification layer, and
claiming otherwise would be the dishonest move. It was written into the known
limits of `SUBMISSION_FACTS.md` before it was observed. Mitigated by the product's
shape: the sentence is shown in place, so a reader sees "Ergonomics in Practice,
2009" and catches it immediately.

**D7, P3, run to run variation at temperature zero.** A property of the model,
not of Atkin. Noted, not chased.

**Suite B ingestion, mostly not applicable.** There is no PDF, DOCX or zip
support to torture. What exists is covered: zero byte files, no text layer, the
document cap, and a check that the picker and the drop handler accept the same
types.

**Suite H platform, blocked.** There is no `.rocketride` workspace, extension or
CLI on this machine, so no RocketRide app can be deployed, published or
eyeballed. See `HUMAN_TODO` items 1 and 2. The pipelines themselves are proven
against a real engine.

## Token spend

**Zero, itemised.**

| what | cost |
| --- | --- |
| Judge path, worked example | 0. No model is called. Prepared answers are replayed and the interface says so on the results panel. |
| Live model verification, 12 calls over 10 documents | 0. Ran on Ollama, on this machine. |
| RocketRide pipeline check | 0. Posted to a local engine. |
| Rationed live platform runs used | 0 of 3. None were needed and none were possible. |

The three-run ration is untouched. The default pipeline is `llm_ollama`, which
consumes no platform tokens by design rather than by luck.

## Honest state of the product

Atkin does one thing and does it properly: it screens a pile of documents against
rules you wrote and shows you the sentence it decided on, having first checked
that sentence is really in the document. That verification layer is not a claim,
it is measured. Run against a real 4B model, four of ten decisions came back
citing text that did not exist, including one that invented "12 primary schools"
and "aged 6 to 12" for a paper describing twenty-two classes and 486 children
aged 9 to 11, and all four were refused. The interface is finished, the cold path
is two clicks and a few seconds at zero cost, the exports are checked by parsing
them rather than by eye, and 49 offline checks cover the ways it could quietly
lie to somebody. What it is not: it does not read PDFs, it remembers nothing
between visits, it is one screener rather than two, and it has never been used by
anybody other than its author. The quote check proves a sentence exists, not that
it supports the decision, and that limit is stated wherever a user might rely on
it. It has not been published to the RocketRide platform, because that needs a
browser sign-in nobody has done yet.

## Three moments for the sixty second video

1. **The fabricated quote.** Open the live run output. A model invented a
   sentence that reads perfectly and is not in the paper, and the row says so
   instead of showing a verdict. This is the whole product in one frame.
2. **The paper that gives the model orders.** Open `09-embedded-instruction.txt`.
   It contains a paragraph telling the reading model to mark it Include. It is
   excluded, on its population, and the highlighted evidence is the sentence
   about the children's ages, not the instruction.
3. **The scan with nothing in it.** `10-scanned-no-text-layer.txt` is not
   excluded. It says the file has no readable text and needs OCR, and it cost
   zero model calls. An unread document is not a rejected one.

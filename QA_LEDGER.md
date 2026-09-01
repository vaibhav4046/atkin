# Atkin QA ledger

Started 1 September 2026. Every claim below was reproduced at the time it was
written. Nothing here is carried over from the build agent's own report.

---

## HUMAN_TODO

Ordered by what blocks the most.

1. **Answer the publish-rung question first.** Everything else in the RocketRide
   half of this is blocked on it. In Discord `#support`: *"Which rung do I publish
   to so somebody outside my team can launch my app, given @public review is not
   needed for the hackathon?"* A perfect app nobody can open fails the core
   criterion.
2. **Connect the extension to staging.** RocketRide settings, Development,
   Connection mode `RocketRide Cloud`, tick `Use custom server`, enter
   `https://staging.rocketride.ai`, sign in through the OAuth window, then
   **Save**. Nothing applies until you press Save. Until this is done there is no
   RocketRide app to deploy, publish, or eyeball, and suite H cannot run at all.
3. **Decide the scope question in the next section.** It changes what the
   remaining days are spent on, and it is your call, not mine.
4. **Register the developer id** `atkin_labs` on a *scratch* app's Deploy tab, not
   on Atkin. Claiming it changes the namespace for every future app.
5. **Ask the token-economics question** in `#support`: *"Roughly how far do 5,000
   tokens go for LLM pipeline runs?"*
6. **Try the second promo code.** Two docs list `INDIAHACK` and `INDIAHACK1`.
7. **Eyeball the live app cold** at https://atkin-app.vercel.app in a browser you
   have never opened it in. Under 60 seconds, click to downloaded export. Tell me
   where you hesitated.

---

## The scope question, stated plainly

The Ultimatum audits a product that is partly not the product that exists. It
asks me to verify xlsx and docx exports, PDF and DOCX ingestion, a run history
with cached resume, a 25 document cap, budget-stop refusal, RocketRide launcher
design tokens (`#EEEDE7`, vermilion `#F93822`), a Readiness panel, and a
`.rocketride/docs/` folder.

**None of those were in the master prompt I was given, and none of them are
built.** The master prompt specified four presets over one engine, a two stage
cheap-first pipeline, schema-validated model output with one repair, hostile
document handling, a token budget that survives, and clean exports. That is what
was built and that is what the 37 checks cover.

I am not going to quietly audit things that do not exist and report them green.
Nor am I going to silently narrow the Ultimatum. So here is the honest choice,
and it is yours:

| Option | What it means | Time |
| --- | --- | --- |
| **A. Harden what exists** | Keep the current surface. Run every Ultimatum suite that applies to it, fix everything found, get the Vercel app to the double-pass bar. | The rest of today |
| **B. Build the missing surface** | Add xlsx and docx export, PDF and DOCX ingestion, run history with cache and resume, budget-stop. Then harden all of it. | Two to three days, and it is 5 days to deadline |
| **C. RocketRide platform** | Requires HUMAN_TODO 1 and 2 before a single step is possible | Blocked on you |

**Decided: option A, harden what exists.** RocketRide: both, with the Vercel app
as the guaranteed link and a platform publish added once HUMAN_TODO 1 and 2 are
done.

---

## Phase 0 self-audit

### What I could not verify, and why

| Claim in the Ultimatum | Reality on this machine |
| --- | --- |
| `.rocketride/docs/`, `schema/`, `services-catalog.json` as platform authority | No `.rocketride/` workspace exists. Recorded in `BUILDLOG.md` on day one. I substituted the live `/services` catalog of a real `rocketride-server` v3.3.1 running on `localhost:5565`, saved to `schema/services-catalog.json`. That is the same catalog the server validates against. |
| `pnpm exec rocketride login` | No RocketRide CLI or extension is installed. |
| Deployed version vs published version vs launcher | There is no RocketRide app. What is deployed and verifiable is the Vercel web app. |
| Readiness panel, publish rung, dev overlay | Do not exist here. Suite H is blocked on HUMAN_TODO 1 and 2. |
| `ATKIN_MASTER_PROMPT.md` | Never existed as a file. The master prompt was a chat message. |

### Baseline, recorded as a baseline and not as proof

- `pnpm check`: **49 of 49 pass**, offline, no model called.
- `pnpm check:live`: 50 of 50, the extra one posting the pipeline to the running
  engine and asserting it is accepted and issued a `tk_` task token.
- `pnpm typecheck`: clean, strict, `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes` both on.
- `pnpm build`: clean. 196 kB raw, **63.7 kB gzip**.

### Drift

**D0 was a P0 and is now closed.** At the moment the Ultimatum arrived, the local
working copy was ahead of the deployed Vercel build by four fixes. Resolved by
deploying, below.

### DO NOT BREAK list

Re-checked after every deploy from here on. Each was verified working before it
went on this list.

1. Cold load of https://atkin-app.vercel.app reaches screened results in two
   clicks, with no account, no key, and no network access needed.
2. The worked example produces 2 include, 6 exclude, 1 borderline, 1 review, and
   those reconcile with the per-criterion breakdown: population 2, study type 2,
   date range 1, outcome 1.
3. `09-embedded-instruction.txt` is excluded on population, and the highlighted
   evidence is the sentence about the children's ages, not the injected paragraph.
4. `10-scanned-no-text-layer.txt` is flagged for OCR and consumes zero model calls.
5. Every screening decision carries a quote, and the quote is verified against the
   source before the verdict is shown.
6. Zero console errors or warnings on the published build.
7. 375 px viewport, no horizontal overflow, both colour schemes legible.
8. Exports: CSV with a formula guard, markdown table, decision log with counts.
9. Strict types on, no runtime dependency but React.

---

## Defects

| id | sev | screen | what | status |
| --- | --- | --- | --- | --- |
| D0 | P0 | build | Local ahead of deployed by four fixes | **proven fixed** |
| D1 | P1 | results | Evidence note said a quote "does not appear in this document" when the model had returned the single word `"Abstract"`, which does appear. A false claim the user could check. | **proven fixed** |
| D2 | P1 | results | Sample answers keyed by document name would replay under a different preset, screening ten abstracts and labelling them Reimbursable | **proven fixed** |
| D3 | P2 | results | Provenance line said "no model was called" and "11 calls" in one sentence | **proven fixed** |
| D4 | P2 | worked example | A prepared quote ran past its own sentence and quoted the injection paragraph beneath it, as evidence for an exclusion | **proven fixed** |
| D5 | P2 | page title | Em dash in the `<title>`, the first thing in the browser tab | **proven fixed** |
| D6 | P1 | engine | The quote check proves a sentence exists, not that it supports the decision. Seen live: a 2009 paper was included with a genuine verified quote, because the model misread the date criterion. | **open, documented limitation** |
| D7 | P3 | engine | Two runs of the same corpus at `temperature: 0` gave different verdicts. A model property, not an Atkin defect. | **waived**, noted |
| D8 | **P0** | run button | Three fast clicks started three concurrent runs and made 27 model calls where one run makes 9. Spend without consent. | **proven fixed** |
| D9 | P1 | rules panel | With every criterion deleted, the run went ahead and returned confident include and exclude verdicts. The model was judging papers against an empty list. | **proven fixed** |
| D10 | P2 | all screens | Links and `summary` fell back to the browser default focus ring instead of the designed one | **proven fixed** |
| D11 | P2 | exports | A double click on an export saved the same file twice | **proven fixed** |
| D12 | P2 | exports | The object URL was revoked on the next line, which races browsers that have not started reading the blob | **proven fixed** |
| D13 | P2 | all screens | The focus rule was scoped to `.btn`, so the preset cards, filter chips, remove buttons and document rows all sat on the browser default ring. The check meant to catch D10 was too weak to see it. | **proven fixed** |

### D1, the evidence for it

The finding that matters most in this ledger, because it is the one that proves
the product's central claim rather than asserting it.

Ran the ten fixture documents through a real local model, `qwen3:4b-instruct`,
via Ollama. `pnpm tsx scripts/live-run.ts`. Not a mock. 31.3 seconds, 12 model
calls, zero platform tokens.

**Four of ten decisions came back quoting text that is not in the document. All
four were caught and refused.**

```
03-schoolchildren-classroom-trial.txt   review   (a person would say exclude)
  REJECTED QUOTE: "A randomized controlled trial was conducted in 12 primary
                   schools involving schoolchildren aged 6 to 12 years."
  longest run actually present (0/17 words): ""

06-protocol-sedentary-staff.txt         review   (a person would say exclude)
  REJECTED QUOTE: "This is a protocol for a study on sedentary staff."
  longest run actually present (3/10 words): "this is a"

01-sit-less-rct.txt                     review   (a person would say include)
  REJECTED QUOTE: "Abstract"
09-embedded-instruction.txt             review   (a person would say exclude)
  REJECTED QUOTE: "Abstract"
```

The real text of `03` says twenty-two classes and 486 children aged 9 to 11. The
model invented "12 primary schools" and "aged 6 to 12": plausible numbers, zero
of seventeen words present in the source. This is the exact failure mode Atkin
exists to catch, caught, on the first real run, without being staged.

The defect this surfaced is narrow and was fixed: `"Abstract"` is a word that
**is** in the paper, so the message insisting it was absent was wrong. Now the
two failures read differently. A quote that is too short says so and tells the
user to screen it themselves or try a larger model. A quote that is genuinely
absent still says it is absent. Two new checks hold the distinction
(`scripts/check.ts`, "a one-word quote is reported as too short, not as missing"
and "an absent quote is still reported as absent").

### D8, the one the double-clicker found

Suite A persona 3, the impatient user who clicks everything twice. This is the
defect I would not have found by reading the code, because the code looks right.

The run button carries `disabled={... || progress !== null}`. That guard is React
state, and state does not update until the next render. Three clicks dispatched
inside a single tick all run their handler before any re-render happens, so all
three see `progress === null`, all three pass, and all three call `runScreening`.
The last one to finish sets the result, so the interface looks completely normal.
Nothing is visibly wrong. The bill is three times what the user agreed to.

Measured in the browser, counting calls by wrapping `window.fetch`, with the
model pointed at a local URL so every call was countable:

```
without the guard   27 model calls   (three concurrent runs)
with the guard       9 model calls   (one run; nine, not ten, because the
                                      empty scan never calls a model)
```

The fix is four lines: a `useRef` checked and set synchronously at the top of
`run`, released in `finally`. A ref updates immediately, so the second click sees
it. `scripts/check.ts` now asserts the guard exists, is checked first, and is
released, because the plausible regression here is somebody removing it on the
grounds that the button is already disabled.

### D6, why it is open rather than fixed

`05-2009-workstation-pilot.txt` was included by the live model, with a quote that
verified correctly. The paper is from 2009 and the criterion says 2015 onward. The
quote check did its job: the sentence is real. The model's reasoning about it was
wrong.

This is not fixable by the verification layer, and pretending otherwise would be
the dishonest move. It is stated in the known limits of `SUBMISSION_FACTS.md`,
written before this run happened, and the live run confirms it rather than
contradicting it. The mitigation is the product's shape: the sentence is shown in
place, so a user reading the row sees "Ergonomics in Practice, 2009" and catches
it in a second.

---

## Suites run so far

| suite | status |
| --- | --- |
| D, model output chaos | **green.** Invalid JSON, one repair then review. Wrong enum rejected not coerced. Non-verbatim quote downgraded. Confidence of 47 clamped. Unreachable model becomes review with the real error text, never a silent exclusion. |
| E, injection and XSS | **green.** Hostile fixture inert, verdict driven by criteria only. Script payloads carried as inert text through CSV and markdown, no row breakout. Static check that nothing in the interface reaches for `dangerouslySetInnerHTML`. |
| F, export torture | **green.** The CSV is now checked by parsing it back, not by eyeball: commas, quotes, newlines, unicode and tabs inside cells all survive a round trip, row counts match the table in both formats, exports are byte identical when repeated, an export with nothing included says so rather than being blank, a 200 character name with quotes stays in one cell, and an override follows the person into both the CSV and the decision log. Double click found D11 and D12. **Not applicable:** xlsx and docx do not exist. |
| J, copy and jargon | **green.** Zero banned words across the interface, presets, README, submission facts and showcase. Zero em or en dashes, after D5. Every failure message names what happened and what to do next. |
| A, personas | **green.** Cold path under two clicks, console completely silent on the published build, 375 px with no overflow, the live model run, the impatient double-clicker (found D8), and keyboard-only (found D13, and the designed ring is now confirmed on a real Tab press against production). Returning user is not applicable: nothing persists by design. |
| B, ingestion torture | **green on what applies.** Zero byte file, no text layer, the document cap telling the user how many were left out, and a check that the file picker and the drop handler accept exactly the same types. **Not applicable:** no PDF, DOCX or zip support exists to torture. |
| C, criteria abuse | **green on what applies.** Deleting every criterion found D9. Unicode and emoji in a criterion label and rule round trip through the run, the exclusion breakdown and the export. Contradictory criteria need a live model and are not worth a rationed run. |
| G, state chaos | **not applicable.** Nothing persists between visits by design. |
| H, platform | **blocked** on HUMAN_TODO 1 and 2. |
| I, cost | **green on the part that can be measured.** The judge path fires zero model calls, proven by the sample provider being the only client and by `usage.modelCalls` being replays. The live run cost zero platform tokens because it ran on Ollama. |

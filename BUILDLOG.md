# Atkin build log

## HUMAN_TODO

These need a browser or an IDE panel. Nothing else is blocked on you.

1. **Connect the extension to staging.** RocketRide settings, Development, Connection
   mode `RocketRide Cloud`, tick `Use custom server`, enter `https://staging.rocketride.ai`,
   sign in through the OAuth window, then **Save** (nothing applies until you save).
2. **Register the developer ID** `atkin_labs` on a *scratch* app's Deploy tab, not on
   Atkin. Claiming it changes the namespace for every future app. Letters and
   underscores only.
3. **Scaffold the app** if the toolchain still cannot: Monitor, Apps, + New app,
   Full screen, name `atkin`.
4. **Ask in Discord #support** (the second one decides Phase 7):
   - "How far do 5,000 tokens go, roughly, for LLM pipeline runs?"
   - "Which rung do I publish to so someone outside my team can launch my app, given
     @public review is not needed for the hackathon?"
5. **Try the second promo code.** Two docs list `INDIAHACK` and `INDIAHACK1`. You
   redeemed one; try the other in the same promo bar.

---

## 2026-09-01 — Phase 0: Preflight

**The brief's premise did not hold, and this is the first thing to know.** It states
the work happens "inside his RocketRide staging workspace in VS Code, with the
RocketRide extension connected to staging". Verified, and none of that exists:

| Claim | Reality |
| --- | --- |
| `.rocketride/docs/` in the workspace | does not exist anywhere on this machine |
| `services-catalog.json` | not present |
| `schema/` | not present |
| Extension connected to staging | no extension state at all; not connected |
| `staging.rocketride.ai` | reachable, HTTP 200 |

Rule 1 says ground truth before code and that guessing produces code which looks right
and fails on the server. So rather than guess, I substituted a **better** authority
than the missing docs: a real RocketRide engine, running locally, answering for itself.

**Ground truth actually used:** `rocketride-server` v3.3.1, the vendor's own public
release, running on `http://localhost:5565`. Its live `GET /services` returns **124
services** with full config schemas, lanes, profiles and required fields. That is the
same catalog the server validates against, captured to `schema/services-catalog.json`.

### Services selected per stage

Chosen from the live catalog, with lanes checked so the graph actually connects.

| Stage | Service | Lanes |
| --- | --- | --- |
| Intake (parse, chunk) | `preprocessor_langchain` | `text`/`table` to `documents` |
| Screen (guard in) | `guardrails` | `questions` to `questions` |
| Screen (decide) | `llm_ollama` | `questions` to `answers` |
| Screen (guard out) | `guardrails` | `answers` to `answers` |
| Extract | `extract_data` | `text`/`table` to `answers`/`documents` |
| Return | `response_answers` | `answers` sink |
| Source | `webhook` | emits `questions`, `text`, `documents` |

Config shapes confirmed from the catalog, not assumed: every node takes `profile` at
the top level and nests the rest under an object named after the chosen profile.
`guardrails` `custom` requires all ten fields. `webhook` requires `hideForm`, `type`
and `mode`. `response_answers` requires `laneName`.

### Cost model, and the decision it forces

I could not read the org token balance: that needs the staging connection in
HUMAN_TODO item 1. So I designed the balance out of the critical path instead.

**`llm_ollama` is in the catalog and costs zero platform tokens.** It runs the model
on the machine. The hackathon guide states plainly that "runs on Ollama, no API cost"
is a valid answer to the cost question. So:

- **Default pipeline: `atkin.ollama.pipe` on `llm_ollama`.** Zero platform tokens,
  and the user's documents never leave their machine, which matters when the documents
  are an unpublished dissertation.
- **Hosted variant: `atkin.pipe` on `llm_openai`/`llm_anthropic`,** key from
  `${ROCKETRIDE_*}`, for anyone who wants speed over locality.
- **The judge's cold launch costs zero regardless,** because the sample project serves
  precomputed cached results.

Estimated worst case for a 25-document run is computed in Phase 5 against real caps
and written into the F9 footer. Until a live staging run is possible, the honest
number to show is the Ollama one: zero platform tokens.

### Phase 0 summary

Ground truth established from a live engine rather than the missing docs, and the
five browser-gated items are in HUMAN_TODO. Token-budget risk removed by making the
local model the default rather than a fallback.

---

## 2026-09-01 — Phases 1 to 9

Built, checked, pushed and deployed. What follows is what actually happened,
including the two things that were wrong and had to be fixed.

### What shipped

| | |
| --- | --- |
| Live | https://atkin-app.vercel.app |
| Repository | https://github.com/vaibhav4046/atkin (public, MIT) |
| Bundle | 195 kB raw, **63.4 kB gzip**, no runtime dependency but React |
| Checks | **30 offline, 31 with the live engine.** All passing. |

`atkin.vercel.app` was already taken by somebody else, so the canonical host is
`atkin-app.vercel.app`, with `readthepile` and `atkin-desk` aliased to the same
deployment. The SSO wall is off, verified by loading production in a clean tab.

### The design decision the whole thing rests on

Every screening call must return a verbatim quote, and the quote is searched for
in the source document before the verdict is shown. No quote, no decision. Quote
not found, no decision. The verdict becomes `review` with a note saying the
evidence did not check out.

This is the answer to the failure mode that makes AI screening useless for work
you have to defend: a model asked to justify itself produces a quotation that
reads perfectly and is not in the paper. A substring search is a dull, mechanical
answer to it, and it cannot be talked out of.

The matcher had to survive real documents rather than clean ones, so it folds
PDF hyphenation across line breaks, curly quotes, en dashes, ligatures,
non-breaking spaces, and quotes elided with an ellipsis, where each fragment must
appear in order. An index map carries every folded character back to its original
offset so the interface can highlight the real passage in place.

### Two things were wrong, and both are now checks

**The evidence for one exclusion was quoting the attack.** The prepared answer for
`09-embedded-instruction.txt` cited a quote that ran on past its own sentence and
swallowed the injection paragraph printed underneath it. It verified, because it
was genuinely verbatim, and it was still wrong. Cause: the fixture generator
looked for the literal `". "` as a sentence boundary, which misses a sentence
ending at a line break and runs into the next paragraph. Fixed with a proper
boundary regex, plus an assertion in the generator and two new cases in
`scripts/check.ts`: no prepared quote may span a paragraph break, and the
highlighted span may not be longer than the quote it marks.

**The results panel contradicted itself.** It said "no model was called" and
"11 calls" in the same sentence. On the worked example it now says "11 prepared
answers replayed". Small, and exactly the kind of thing this product exists to
refuse to do.

### Verified, not assumed

- Production loaded in a fresh browser tab, worked example run end to end:
  2 include, 6 exclude, 1 borderline, 1 needing review, counts reconciling with
  the per-criterion breakdown (population 2, study type 2, date range 1,
  outcome 1).
- The injection document is excluded on population, and the highlighted evidence
  is the sentence about the children's ages, not the instruction paragraph.
- The empty scan is flagged for OCR and consumed zero model calls.
- `pnpm check:live` posted `atkin.ollama.pipe` to the running engine on
  `localhost:5565`; it was accepted and issued a task token.
- 375 px viewport, no horizontal overflow, both colour schemes legible.

### Still not done, and why

The RocketRide platform deploy is the one thing outstanding, and it is genuinely
browser-gated: the extension has to be pointed at staging and signed in through an
OAuth window. See HUMAN_TODO at the top. The pipelines themselves are proven
against a real engine, so what remains is the sign-in and the publish rung, not
the work.

No user testing has happened. Nobody outside this machine has run it. Anything
said about what users think would be invented, so `SUBMISSION_FACTS.md` says
there is none.

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

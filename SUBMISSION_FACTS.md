# Atkin, submission facts

Everything here is checkable. Nothing in this file is aspirational, and where
something is not done it says so.

## The one line

**Atkin reads the pile so you can decide.** Screening, evidence extraction, and
clean exports for anyone facing a stack of documents and a deadline.

## Links

| | |
| --- | --- |
| Live | https://atkin-app.vercel.app |
| Also | https://readthepile.vercel.app, https://atkin-desk.vercel.app |
| Source | https://github.com/vaibhav4046/atkin |
| Pipelines | `pipelines/atkin.ollama.pipe`, `pipelines/atkin.pipe` |

No account. No key. No card. Works with the network unplugged.

## Sixty seconds, as a judge

1. Open the link.
2. Click **Screen ten papers now**.
3. Click **Screen 10 documents**. It finishes in under a second.
4. Open the row `09-embedded-instruction.txt`. That paper contains a paragraph
   ordering the reading model to mark it Include. It is excluded, on its
   population, and the highlighted evidence is the sentence about the children's
   ages, not the instruction.
5. Open `10-scanned-no-text-layer.txt`. It is not excluded. It says the file has
   no readable text and needs OCR, and it cost zero model calls.
6. Click **Decision log**. That markdown file is the thing the user actually came
   for: criteria, counts, exclusions broken down by reason, every decision with
   its quote, and a list of what still needs a person.

## What is real

- **The screening engine.** Two stage, abstracts first, full text only for the
  documents that survive. Runs against Ollama on your own machine, any endpoint
  speaking the OpenAI chat shape with your key, or the bundled worked example.
- **Quote verification.** Every decision must carry a verbatim quote. The quote is
  searched for in the source before the verdict is shown, with normalisation that
  survives PDF hyphenation, curly quotes, ligatures and elisions. Fail the search
  and the decision is discarded.
- **The RocketRide pipelines.** `webhook -> guardrails -> llm -> guardrails ->
  response_answers`. Built against the engine's own live `/services` catalog, and
  `pnpm check:live` posts one to a running engine and asserts it is accepted and
  issued a task token. That check passes.
- **49 checks**, offline, in `scripts/check.ts`. All passing.
- **The four presets** are JSON config over one engine, not four codebases.

## Proved against a real model, not a mock

The prepared answers demonstrate the interface. They do not prove the engine, so
the fixture corpus was also run through a real local model, `qwen3:4b-instruct`
on Ollama, with `pnpm tsx scripts/live-run.ts`.

**Four of ten decisions came back quoting text that is not in the document, and
all four were refused.** One of them invented "12 primary schools" and "aged 6 to
12" for a paper that says twenty-two classes and 486 children aged 9 to 11: zero
of seventeen words present in the source. Plausible, fluent, and entirely made
up. That is the failure this product exists to catch, caught on the first real
run, unstaged.

It also cost nothing. Ollama runs on the machine, so the measurement drew no
platform tokens.

## What is not real, stated plainly

- **The worked example is prepared answers, not a live model run.** It is labelled
  as such in the interface, on the results panel, every time. It exists so a cold
  visitor sees the real product working in four seconds at zero cost. Point it at
  Ollama or a hosted key and the same engine runs for real.
- **The ten sample abstracts are synthetic.** Each one says so in its own text.
  They describe no real study and cite no real journal.
- **No user testing has happened yet.** Nobody outside this machine has run it.
  Any claim about what users think would be invented, so there is none.
- **It has not been deployed to the RocketRide platform.** That needs the VS Code
  extension pointed at staging and an OAuth sign-in through a browser window,
  which is in `BUILDLOG.md` under HUMAN_TODO. The pipelines are proven against a
  real engine locally; the platform deploy is a browser step nobody has taken yet.

## Cost

Zero, on the default path, and this is a design decision rather than a lucky one.

- The worked example calls no model at all.
- The default pipeline runs on `llm_ollama`, which executes on the user's machine
  and consumes no platform tokens. That also means an unpublished thesis or a
  client's invoices never leave the building.
- The hosted option uses the user's own key, and the engine refuses a pile over
  120 documents rather than quietly running up a bill.

Screening sends roughly 6,000 characters per document, not the whole paper.
Extraction runs only on the documents that were included. On the ten-document
worked example that is 10 screening calls and 2 extraction calls, not 20.

## Where it maps to the judging criteria

**A real returning user.** The person screening two hundred abstracts in the week
before a dissertation deadline. They come back because the pile is not done in one
sitting, and because the decision log is what goes in the appendix. The same
engine does job applications and receipts, which are the same shape of problem.

**A specific problem.** Not "AI for documents". First-pass screening against
written criteria, where the output has to be defensible to a supervisor.

**Listed and working.** Live at the link above, no signup, verified working in a
fresh browser at production. The repository is public and MIT.

**Bad input, sane cost.** This is the part with the most work in it. A fabricated
quote, an unparseable reply, an unreachable model, a scan with no text, a document
giving orders, a spreadsheet formula in a filename, and a pile that is too large
all have defined, tested behaviour. None of them produce a confident wrong answer.

**Not a wrapper with a landing page.** The landing page is the app. There is no
marketing route. The thing that is not a wrapper is the verification layer: the
model's answer is treated as a claim to be checked, not an output to be displayed.

## Known limits

- Reads text, not PDFs. Convert first.
- Nothing persists between visits. The export is the durable artefact.
- One screener, not two. A protocol demanding dual independent human screening
  needs to say Atkin was used and how.
- The quote check proves a sentence exists in the document. It does not prove the
  sentence supports the decision. That judgement is still the user's, which is why
  the sentence is shown in place rather than summarised.

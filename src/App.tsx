/**
 * Atkin.
 *
 * One screen, two halves. On the left the rules: which preset, what the criteria
 * are, where answers come from. On the right the pile, and after a run, the
 * decisions with their evidence.
 *
 * Nothing is hidden behind an account. The worked example runs offline against
 * prepared answers, so the first thing anybody sees is the real interface with
 * real rows in it rather than a marketing page and a sign-up form.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import type { Criterion, Doc, Preset, Row, RunResult, Verdict } from './lib/types';
import { runScreening, LIMITS } from './lib/engine';
import type { ModelClient, Progress } from './lib/engine';
import { ollamaClient, openAiClient, sampleClient, OPENAI_PRESETS } from './lib/providers';
import { computeFlow, toCsv, toDecisionLog, toMarkdown, verdictLabel } from './lib/export';
import { SAMPLE_ANSWERS, SAMPLE_DOCS, SPECIMEN } from './sample';
import { DocRow } from './ui/DocRow';

import litJson from '../presets/literature-review.json';
import appsJson from '../presets/applications.json';
import receiptsJson from '../presets/receipts.json';
import customJson from '../presets/custom.json';

// The presets are data files, read here with a single assertion each. Their shape
// is checked by scripts/check.ts against the same types the engine uses.
const PRESETS: Preset[] = [litJson, appsJson, receiptsJson, customJson].map((p) => p as unknown as Preset);

type Source =
  | { kind: 'sample' }
  | { kind: 'ollama'; base: string; model: string }
  | { kind: 'hosted'; provider: string; key: string };

const uid = (): string => Math.random().toString(36).slice(2, 9);

/**
 * Hand the user a file.
 *
 * Two details that are easy to get wrong and annoying to debug. Revoking the
 * object URL on the next line races the download in browsers that have not
 * started reading the blob yet, so the revoke waits a beat. And a double click
 * on an export button is one intention, not two, so a repeat inside a second is
 * ignored rather than saving the same table twice with a (1) after it.
 */
let lastExport = { name: '', at: 0 };

function download(name: string, body: string, mime: string): void {
  const now = Date.now();
  if (name === lastExport.name && now - lastExport.at < 1200) return;
  lastExport = { name, at: now };

  const url = URL.createObjectURL(new Blob([body], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

const FILTERS: { id: Verdict | 'all'; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'include', label: 'Included' },
  { id: 'exclude', label: 'Excluded' },
  { id: 'maybe', label: 'Borderline' },
  { id: 'review', label: 'Needs review' },
];

export default function App() {
  const [preset, setPreset] = useState<Preset>(PRESETS[0] as Preset);
  const [criteria, setCriteria] = useState<Criterion[]>(() => (PRESETS[0] as Preset).criteriaTemplate.map((c) => ({ ...c })));
  const [docs, setDocs] = useState<Doc[]>([]);
  const [source, setSource] = useState<Source>({ kind: 'sample' });
  const [result, setResult] = useState<RunResult | null>(null);
  const [overrides, setOverrides] = useState<Record<string, { verdict: Verdict; note: string; at: string }>>({});
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Verdict | 'all'>('all');
  const [over, setOver] = useState(false);
  const [paste, setPaste] = useState('');
  const abort = useRef<AbortController | null>(null);
  // Guarded with a ref, not with the disabled attribute. Three clicks inside one
  // tick all see the old state and all pass, so the button being disabled on the
  // next render stops nothing: it started three concurrent runs and showed the
  // last. Harmless on prepared answers, three times the bill on a hosted model.
  const running = useRef(false);

  const usingSample = docs.length > 0 && docs.every((d) => SAMPLE_DOCS.some((s) => s.id === d.id));

  const choosePreset = useCallback((p: Preset) => {
    setPreset(p);
    setCriteria(p.criteriaTemplate.map((c) => ({ ...c })));
    setResult(null);
    setOverrides({});
  }, []);

  const loadSample = useCallback(() => {
    const lit = PRESETS[0] as Preset;
    setPreset(lit);
    setCriteria(lit.criteriaTemplate.map((c) => ({ ...c })));
    setDocs(SAMPLE_DOCS.map((d) => ({ ...d })));
    setSource({ kind: 'sample' });
    setResult(null);
    setOverrides({});
    setError(null);
  }, []);

  const addFiles = useCallback(async (files: FileList | null) => {
    if (files === null) return;
    const accepted: Doc[] = [];
    const rejected: string[] = [];
    for (const file of Array.from(files)) {
      if (!/\.(txt|md|markdown|csv|json)$/i.test(file.name)) {
        rejected.push(file.name);
        continue;
      }
      const text = await file.text();
      accepted.push({ id: uid() + '-' + file.name, name: file.name, text, bytes: file.size });
    }
    if (accepted.length > 0) {
      setDocs((prev) => [...prev, ...accepted]);
      setResult(null);
      setOverrides({});
    }
    setError(
      rejected.length > 0
        ? `Atkin reads text. These were not added: ${rejected.join(', ')}. Export or save them as .txt or .md first, or paste the text in.`
        : null,
    );
  }, []);

  /**
   * Paste one in.
   *
   * Not everything worth screening is a file. An abstract copied off a journal
   * page, a job advert, the text of a receipt: making somebody save that to disk
   * first is a step invented by the software, not by the work.
   */
  const addPasted = useCallback(() => {
    const text = paste.trim();
    if (text.length === 0) return;
    const firstLine = text.split('\n', 1)[0] ?? '';
    const name = (firstLine.trim().slice(0, 70) || 'Pasted text') + (firstLine.length > 70 ? '…' : '');
    setDocs((prev) => [...prev, { id: uid() + '-pasted', name, text, bytes: new TextEncoder().encode(text).length }]);
    setPaste('');
    setResult(null);
    setOverrides({});
    setError(null);
  }, [paste]);

  const client = useMemo((): { client: ModelClient; problem: string | null } => {
    if (source.kind === 'sample') {
      const unknown = docs.filter((d) => SAMPLE_ANSWERS['screen:' + d.id] === undefined && d.text.trim().length >= LIMITS.minDocChars);
      // The prepared answers are keyed by document name, so with the sample pile
      // loaded they would happily replay under a different preset's labels and
      // produce a receipt run that was really a literature review.
      const wrongPreset = preset.id !== 'literature-review';
      return {
        client: sampleClient(SAMPLE_ANSWERS),
        problem: wrongPreset
          ? 'The worked example is a literature review. Switch back to that preset, or pick Ollama or a hosted model to run ' +
            preset.name.toLowerCase() +
            ' for real.'
          : unknown.length > 0
            ? 'The worked example only has prepared answers for its own documents. Pick Ollama or a hosted model to screen your own.'
            : null,
      };
    }
    if (source.kind === 'ollama') {
      return {
        client: ollamaClient({ base: source.base, model: source.model }),
        problem: source.model.trim().length === 0 ? 'Name the Ollama model to use.' : null,
      };
    }
    const cfg = OPENAI_PRESETS[source.provider];
    if (cfg === undefined) return { client: sampleClient({}), problem: 'Pick a provider.' };
    return {
      client: openAiClient({ base: cfg.base, model: cfg.model, apiKey: source.key }),
      problem: source.key.trim().length === 0 ? 'Paste your ' + cfg.keyName + ' to run against a hosted model.' : null,
    };
  }, [source, docs, preset]);

  /**
   * Everything standing between the user and a run.
   *
   * Screening against zero criteria is the one that matters. Nothing stopped it:
   * the run went ahead, the model was asked to judge a paper against an empty
   * list, and it returned confident verdicts anyway. A user who clears the rules
   * to start fresh would have got a full green screen built on nothing.
   */
  const blocker = useMemo((): string | null => {
    if (criteria.every((c) => c.value.trim().length === 0)) {
      return 'Atkin has no rules to screen against. Write at least one criterion, or pick a preset to start from.';
    }
    return client.problem;
  }, [criteria, client]);

  const run = useCallback(async () => {
    if (running.current || docs.length === 0 || blocker !== null) return;
    running.current = true;
    const controller = new AbortController();
    abort.current = controller;
    setError(null);
    setResult(null);
    setOverrides({});
    setProgress({ stage: 'screen', done: 0, total: docs.length, docName: '' });
    try {
      const out = await runScreening({
        preset,
        criteria: criteria.filter((c) => c.value.trim().length > 0),
        docs,
        client: client.client,
        extract: true,
        onProgress: setProgress,
        signal: controller.signal,
      });
      setResult(out);
    } catch (e) {
      setError('The run stopped: ' + (e as Error).message);
    } finally {
      running.current = false;
      setProgress(null);
      abort.current = null;
    }
  }, [docs, client, blocker, preset, criteria]);

  const rows = useMemo((): Row[] => {
    if (result === null) return [];
    return docs.flatMap((doc) => {
      const screening = result.screenings.find((s) => s.docId === doc.id);
      if (screening === undefined) return [];
      const extraction = result.extractions.find((e) => e.docId === doc.id) ?? null;
      const override = overrides[doc.id] ?? null;
      return [{ doc, screening, extraction, override, finalVerdict: override?.verdict ?? screening.verdict }];
    });
  }, [result, docs, overrides]);

  const shown = filter === 'all' ? rows : rows.filter((r) => r.finalVerdict === filter);
  const flow = useMemo(() => computeFlow(rows, criteria), [rows, criteria]);

  const onOverride = useCallback((docId: string, verdict: Verdict | null, note: string) => {
    setOverrides((prev) => {
      const next = { ...prev };
      if (verdict === null) delete next[docId];
      else next[docId] = { verdict, note, at: new Date().toISOString() };
      return next;
    });
  }, []);

  const producedBy =
    source.kind === 'sample'
      ? 'the worked example, prepared answers, no model was called'
      : source.kind === 'ollama'
        ? 'Ollama running on this machine, model ' + source.model
        : (OPENAI_PRESETS[source.provider]?.model ?? source.provider) + ', called with your own key';

  const stamp = new Date().toISOString().slice(0, 10);

  return (
    <>
      <header className="masthead">
        <span className="wordmark">
          Atkin<span>.</span>
        </span>
        <p>Reads the pile so you can decide.</p>
        <nav>
          <button className="btn" onClick={loadSample}>
            Load the worked example
          </button>
          <a className="btn" href="https://github.com/vaibhav4046/atkin" target="_blank" rel="noreferrer noopener">
            Source
          </a>
        </nav>
      </header>

      <main>
        {result === null && docs.length === 0 && (
          <section className="opening">
            <div>
              <h1>You have a stack of documents and a deadline.</h1>
              <p className="lede">
                Atkin screens each one against rules you write, and shows you the sentence it decided on.
              </p>
              <p className="who">
                <strong>Built for the person doing a first-pass sort.</strong> Two hundred abstracts against your
                inclusion criteria. Forty job descriptions against your CV. A shoebox of receipts against an expense
                policy. Atkin does the reading and hands back a table, a reason for every call, and the count your
                methods section needs. You still decide. It just stops you starting from nothing.
              </p>
              <p style={{ marginTop: '1.5rem' }}>
                <button className="btn primary big" onClick={loadSample}>
                  Screen ten papers now
                </button>
              </p>
              <p style={{ fontSize: '0.8125rem', color: 'var(--ink-faint)' }}>
                No account, no key, works offline. About four seconds.
              </p>
            </div>
            <div className="specimen">
              <p className="cap">What a decision looks like</p>
              <p className="title">{SPECIMEN.name}</p>
              <p style={{ margin: '0 0 0.6rem' }}>
                <span className="verdict exclude">Exclude</span>
              </p>
              <p style={{ margin: '0 0 0.6rem', color: 'var(--ink-soft)' }}>{SPECIMEN.reason}</p>
              <p className="evidence-head">
                Evidence <span className="ok">found in the document</span>
              </p>
              <div className="passage">
                Methods. Twenty-two primary school classes were randomised to a movement-break programme or usual
                timetable. <mark>{SPECIMEN.quote}</mark>
              </div>
              <p style={{ margin: '0.75rem 0 0', fontSize: '0.75rem', color: 'var(--ink-faint)' }}>
                Every decision carries a quote, and Atkin checks the quote is really in the document before it shows
                you the decision. When it is not, the row says so instead.
              </p>
            </div>
          </section>
        )}

        <div className="desk">
          <div className="rail">
            <div className="panel">
              <h2>What are you sorting?</h2>
              <p className="hint">Each preset is a starting set of rules. Change any of them.</p>
              <div className="presets">
                {PRESETS.map((p) => (
                  <button key={p.id} className="preset" aria-pressed={p.id === preset.id} onClick={() => choosePreset(p)}>
                    <b>{p.name}</b>
                    <small>{p.tagline}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="panel">
              <h2>The rules</h2>
              <p className="hint">Plain sentences. These go to the model exactly as written.</p>
              <div className="field">
                <label htmlFor="question">The question</label>
                <textarea
                  id="question"
                  value={preset.decisionQuestion}
                  onChange={(e) => setPreset({ ...preset, decisionQuestion: e.target.value })}
                />
              </div>
              {criteria.map((c, i) => (
                <div className="criterion" key={c.id}>
                  <div className="criterion-head">
                    <input
                      aria-label={'Criterion ' + (i + 1) + ' name'}
                      value={c.label}
                      onChange={(e) =>
                        setCriteria(criteria.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                      }
                    />
                    <button
                      className="icon-btn"
                      aria-label={'Remove ' + c.label}
                      onClick={() => setCriteria(criteria.filter((_, j) => j !== i))}
                    >
                      ✕
                    </button>
                  </div>
                  <textarea
                    aria-label={c.label + ' rule'}
                    value={c.value}
                    onChange={(e) => setCriteria(criteria.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                  />
                </div>
              ))}
              <button
                className="btn"
                style={{ marginTop: '0.75rem' }}
                onClick={() => setCriteria([...criteria, { id: 'c' + uid(), label: 'New rule', value: '' }])}
              >
                Add a rule
              </button>
            </div>

            <div className="panel">
              <h2>Where answers come from</h2>
              <p className="hint">
                Your key stays in this tab and is never saved or sent anywhere but the provider you pick.
              </p>
              <div className="field">
                <label htmlFor="src">Source</label>
                <select
                  id="src"
                  value={source.kind}
                  onChange={(e) => {
                    const k = e.target.value;
                    if (k === 'sample') setSource({ kind: 'sample' });
                    else if (k === 'ollama') setSource({ kind: 'ollama', base: 'http://localhost:11434', model: 'llama3.1:8b' });
                    else setSource({ kind: 'hosted', provider: 'Groq', key: '' });
                  }}
                >
                  <option value="sample">Worked example, prepared answers</option>
                  <option value="ollama">Ollama on this machine, free</option>
                  <option value="hosted">A hosted model, your key</option>
                </select>
              </div>
              {source.kind === 'ollama' && (
                <>
                  <div className="field">
                    <label htmlFor="obase">Server</label>
                    <input id="obase" type="url" value={source.base} onChange={(e) => setSource({ ...source, base: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor="omodel">Model</label>
                    <input id="omodel" type="text" value={source.model} onChange={(e) => setSource({ ...source, model: e.target.value })} />
                  </div>
                  <p className="hint" style={{ margin: 0 }}>
                    Nothing leaves your machine. Start Ollama with CORS allowed:
                    <code style={{ display: 'block', fontFamily: 'var(--mono)', fontSize: '0.75rem', marginTop: '0.3rem' }}>
                      OLLAMA_ORIGINS=* ollama serve
                    </code>
                  </p>
                </>
              )}
              {source.kind === 'hosted' && (
                <>
                  <div className="field">
                    <label htmlFor="prov">Provider</label>
                    <select id="prov" value={source.provider} onChange={(e) => setSource({ ...source, provider: e.target.value })}>
                      {Object.keys(OPENAI_PRESETS).map((k) => (
                        <option key={k} value={k}>
                          {k} ({OPENAI_PRESETS[k]?.model})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="key">{OPENAI_PRESETS[source.provider]?.keyName ?? 'API key'}</label>
                    <input
                      id="key"
                      type="password"
                      value={source.key}
                      autoComplete="off"
                      onChange={(e) => setSource({ ...source, key: e.target.value })}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          <div>
            <div className="panel">
              <h2>The pile</h2>
              <p className="hint">
                {docs.length === 0
                  ? 'Text files, up to ' + LIMITS.maxDocs + ' at a time.'
                  : docs.length + ' document' + (docs.length === 1 ? '' : 's') + ' ready' + (usingSample ? ', the worked example' : '')}
              </p>
              <div
                className={'dropzone' + (over ? ' over' : '')}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(true);
                }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(false);
                  void addFiles(e.dataTransfer.files);
                }}
              >
                <p>Drop text files here.</p>
                <label className="btn" style={{ display: 'inline-block' }}>
                  Choose files
                  <input
                    type="file"
                    multiple
                    accept=".txt,.md,.markdown,.csv,.json"
                    className="sr-only"
                    onChange={(e) => void addFiles(e.target.files)}
                  />
                </label>{' '}
                <button className="btn" onClick={loadSample}>
                  Use the worked example
                </button>
                {docs.length > 0 && (
                  <button
                    className="btn"
                    onClick={() => {
                      setDocs([]);
                      setResult(null);
                      setOverrides({});
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>

              <details style={{ marginTop: '0.9rem' }}>
                <summary style={{ cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--ink-soft)' }}>
                  Or paste one in
                </summary>
                <div style={{ marginTop: '0.6rem' }}>
                  <textarea
                    aria-label="Paste a document"
                    placeholder="Paste an abstract, a job description, a receipt. The first line becomes its name."
                    value={paste}
                    style={{ minHeight: '7rem' }}
                    onChange={(e) => setPaste(e.target.value)}
                  />
                  <button className="btn" style={{ marginTop: '0.5rem' }} disabled={paste.trim().length === 0} onClick={addPasted}>
                    Add to the pile
                  </button>
                </div>
              </details>

              {error !== null && (
                <div className="warnbox" style={{ marginTop: '0.9rem' }}>
                  {error}
                </div>
              )}
              {blocker !== null && docs.length > 0 && (
                <div className="warnbox" style={{ marginTop: '0.9rem' }}>
                  {blocker}
                </div>
              )}

              <div className="toolbar" style={{ marginTop: '1.1rem', paddingBottom: 0, borderBottom: 0 }}>
                <button className="btn primary big" disabled={docs.length === 0 || blocker !== null || progress !== null} onClick={() => void run()}>
                  {progress !== null ? 'Reading…' : 'Screen ' + (docs.length || '') + ' document' + (docs.length === 1 ? '' : 's')}
                </button>
                {progress !== null && (
                  <>
                    <span className="progress">
                      {progress.stage === 'extract' ? 'pulling fields' : 'screening'} {progress.done} of {progress.total}
                    </span>
                    <button className="btn" onClick={() => abort.current?.abort(new Error('you stopped the run'))}>
                      Stop
                    </button>
                  </>
                )}
              </div>
            </div>

            {result !== null && (
              <>
                <div className="provenance">
                  <b>These decisions came from {producedBy}.</b>{' '}
                  {source.kind === 'sample'
                    ? `${result.usage.modelCalls} prepared answers replayed`
                    : `${result.usage.modelCalls} model call${result.usage.modelCalls === 1 ? '' : 's'}` +
                      (result.usage.repairCalls > 0 ? `, ${result.usage.repairCalls} of them a retry after unusable output` : '')}
                  , in {(result.usage.ms / 1000).toFixed(1)} seconds.
                  {flow.unverifiedEvidence > 0 && (
                    <>
                      {' '}
                      <b>
                        {flow.unverifiedEvidence} decision{flow.unverifiedEvidence === 1 ? '' : 's'} quoted text that is
                        not in the document and {flow.unverifiedEvidence === 1 ? 'was' : 'were'} not accepted.
                      </b>
                    </>
                  )}
                  {result.stoppedReason !== null && <> {result.stoppedReason}</>}
                </div>

                <div className="counts">
                  <div className="tally include">
                    <b>{flow.included}</b>
                    <span>{preset.decisionLabels.include}</span>
                  </div>
                  <div className="tally exclude">
                    <b>{flow.excluded}</b>
                    <span>{preset.decisionLabels.exclude}</span>
                  </div>
                  <div className="tally maybe">
                    <b>{flow.maybe}</b>
                    <span>{preset.decisionLabels.maybe}</span>
                  </div>
                  <div className="tally review">
                    <b>{flow.review}</b>
                    <span>Needs review</span>
                  </div>
                </div>

                <div className="bar" role="img" aria-label={`${flow.included} included, ${flow.excluded} excluded, ${flow.maybe} borderline, ${flow.review} needing review`}>
                  {(['include', 'exclude', 'maybe', 'review'] as const).map((k) => {
                    const n = k === 'include' ? flow.included : k === 'exclude' ? flow.excluded : k === 'maybe' ? flow.maybe : flow.review;
                    return n > 0 ? <i key={k} className={k} style={{ flex: n }} /> : null;
                  })}
                </div>

                {preset.flowCounts && flow.excludedByCriterion.length > 0 && (
                  <ul className="reasons">
                    {flow.excludedByCriterion.map((c) => (
                      <li key={c.id || c.label}>
                        <span>Excluded on {c.label.toLowerCase()}</span>
                        <b>{c.count}</b>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="toolbar">
                  <div className="filters">
                    {FILTERS.map((f) => (
                      <button key={f.id} className="chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                        {f.id === 'all' ? f.label : verdictLabel(f.id, preset)}
                      </button>
                    ))}
                  </div>
                  <span className="spacer" />
                  <button className="btn" onClick={() => download(`atkin-${preset.id}-${stamp}.csv`, toCsv(rows, preset, criteria), 'text/csv')}>
                    CSV
                  </button>
                  <button
                    className="btn"
                    onClick={() => download(`atkin-${preset.id}-${stamp}.md`, toMarkdown(rows, preset, criteria), 'text/markdown')}
                  >
                    Table
                  </button>
                  <button
                    className="btn primary"
                    onClick={() =>
                      download(
                        `atkin-decision-log-${stamp}.md`,
                        toDecisionLog(rows, preset, criteria, { startedAt: result.startedAt, producedBy }),
                        'text/markdown',
                      )
                    }
                  >
                    Decision log
                  </button>
                </div>

                <ul className="pile">
                  {shown.map((row) => (
                    <DocRow key={row.doc.id} row={row} preset={preset} criteria={criteria} onOverride={onOverride} />
                  ))}
                </ul>
                {shown.length === 0 && <p style={{ color: 'var(--ink-soft)' }}>Nothing in that pile.</p>}
              </>
            )}
          </div>
        </div>
      </main>

      <footer>
        <span>Atkin reads the pile so you can decide.</span>
        <span>Built on RocketRide.</span>
        <a href="https://github.com/vaibhav4046/atkin">Source and the pipelines</a>
      </footer>
    </>
  );
}

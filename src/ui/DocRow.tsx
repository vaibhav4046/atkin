/**
 * One document in the pile.
 *
 * Collapsed it is a verdict, a name and a reason. Opened it shows the passage the
 * decision was made from, in place, inside the surrounding paragraph, with the
 * quoted span marked. That is the point of the whole tool: you are not asked to
 * trust the summary, you are shown the sentence and where it sits.
 *
 * When the quoted sentence turns out not to be in the document, the row does not
 * quietly downgrade its confidence. It says so, in the largest thing on the card.
 */
import { useId, useState } from 'react';
import type { Criterion, Preset, Row, Verdict } from '../lib/types';
import { verdictLabel } from '../lib/export';

const WINDOW = 420;

type PassageProps = { text: string; start: number; end: number };

function Passage({ text, start, end }: PassageProps) {
  const from = Math.max(0, start - WINDOW);
  const to = Math.min(text.length, end + WINDOW);
  return (
    <div className="passage">
      {from > 0 ? '…' : ''}
      {text.slice(from, start)}
      <mark>{text.slice(start, end)}</mark>
      {text.slice(end, to)}
      {to < text.length ? '…' : ''}
    </div>
  );
}

type Props = {
  row: Row;
  preset: Preset;
  criteria: readonly Criterion[];
  onOverride: (docId: string, verdict: Verdict | null, note: string) => void;
};

const CHOICES: Verdict[] = ['include', 'exclude', 'maybe'];

export function DocRow({ row, preset, criteria, onOverride }: Props) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const { screening: s, doc } = row;
  const criterion = criteria.find((c) => c.id === s.criterionId);
  const evidence = s.evidence;
  const displayReason = row.override !== null ? row.override.note || s.reason : s.reason;

  return (
    <li>
      <button className="row" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={panelId}>
        <span className={'verdict ' + row.finalVerdict}>{verdictLabel(row.finalVerdict, preset)}</span>
        <span>
          <span className="name">{doc.name}</span>
          <span className="why">{displayReason}</span>
        </span>
        <span className="flag">
          {row.override !== null ? 'yours' : evidence !== null && !evidence.verified ? 'quote not found' : ''}
        </span>
      </button>

      {open && (
        <div className="detail" id={panelId}>
          {s.note !== null && (
            <div className="warnbox">
              <b>Atkin did not accept this one.</b>
              {s.note}
            </div>
          )}

          {evidence !== null && (
            <div>
              <p className="evidence-head">
                Evidence
                {evidence.verified ? (
                  <span className="ok">found in the document</span>
                ) : (
                  <span className="bad">not found in the document</span>
                )}
              </p>
              {evidence.verified && evidence.start !== null && evidence.end !== null ? (
                <Passage text={doc.text} start={evidence.start} end={evidence.end} />
              ) : (
                <div className="passage unfound">{evidence.quote}</div>
              )}
            </div>
          )}

          {criterion !== undefined && (
            <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--ink-soft)' }}>
              Decided on <b style={{ color: 'var(--ink)' }}>{criterion.label}</b>: {criterion.value}
            </p>
          )}

          {row.extraction !== null && Object.keys(row.extraction.fields).length > 0 && (
            <dl className="fields">
              {preset.extractionFields.map((f) => {
                const value = row.extraction?.fields[f.id];
                if (value === undefined) return null;
                return (
                  <div className="f" key={f.id}>
                    <dt>{f.label}</dt>
                    <dd>
                      {value.value}
                      {value.evidence !== null && !value.evidence.verified && (
                        <em style={{ color: 'var(--review)' }}> (quote not found, check this one)</em>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          )}

          <div className="overrides">
            <span>Your call:</span>
            {CHOICES.map((v) => (
              <button
                key={v}
                className="chip"
                aria-pressed={row.override?.verdict === v}
                onClick={() => onOverride(doc.id, row.override?.verdict === v ? null : v, '')}
              >
                {verdictLabel(v, preset)}
              </button>
            ))}
            {row.override !== null && (
              <input
                type="text"
                placeholder="Why, for the log"
                defaultValue={row.override.note}
                style={{ maxWidth: '18rem' }}
                onBlur={(e) => onOverride(doc.id, row.override?.verdict ?? null, e.target.value)}
              />
            )}
          </div>
        </div>
      )}
    </li>
  );
}

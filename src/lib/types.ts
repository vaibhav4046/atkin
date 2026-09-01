/**
 * Atkin domain types.
 *
 * The one that matters is Verdict. `include`, `exclude` and `maybe` are things a
 * model said. `review` is something Atkin decided: the answer could not be trusted,
 * so a person has to look. Keeping those apart is the whole reason this tool is
 * different from pasting documents into a chat window.
 */

export type Verdict = 'include' | 'exclude' | 'maybe' | 'review';

export type Criterion = { id: string; label: string; value: string };
export type ExtractionField = { id: string; label: string; hint: string };

export type Preset = {
  id: string;
  name: string;
  icon: string;
  tagline: string;
  decisionQuestion: string;
  decisionLabels: { include: string; exclude: string; maybe: string };
  criteriaTemplate: Criterion[];
  extractionFields: ExtractionField[];
  exportColumns: string[];
  sampleCopy: string;
  flowCounts: boolean;
};

export type Doc = {
  id: string;
  name: string;
  text: string;
  /** Bytes of the original upload, before any text extraction. */
  bytes: number;
};

/**
 * A quotation from the document, and whether it is really there.
 *
 * `verified: false` is not a warning decoration. It downgrades the whole decision
 * to `review`, because a reason supported by an invented quote is not a reason.
 */
export type Evidence = {
  quote: string;
  verified: boolean;
  /** Character offset into the original document text, for highlighting. */
  start: number | null;
  end: number | null;
};

export type Produced = 'model' | 'sample' | 'machine';

export type Screening = {
  docId: string;
  verdict: Verdict;
  /** Which criterion decided it. Null when the model named none, or on review. */
  criterionId: string | null;
  reason: string;
  evidence: Evidence | null;
  /** The model's own stated confidence, 0 to 1. Advisory only, never a gate. */
  confidence: number | null;
  /** Why this landed in review. Null when it did not. */
  note: string | null;
  producedBy: Produced;
  /** Milliseconds the call took, for the cost panel. */
  ms: number;
};

export type FieldValue = { value: string; evidence: Evidence | null };

export type Extraction = {
  docId: string;
  fields: Record<string, FieldValue>;
  note: string | null;
  producedBy: Produced;
  ms: number;
};

export type Override = {
  verdict: Verdict;
  note: string;
  at: string;
};

export type RunUsage = {
  modelCalls: number;
  repairCalls: number;
  screenChars: number;
  extractChars: number;
  ms: number;
};

export type RunResult = {
  runId: string;
  startedAt: string;
  presetId: string;
  criteria: Criterion[];
  screenings: Screening[];
  extractions: Extraction[];
  usage: RunUsage;
  /** Set when the run stopped early. */
  stoppedReason: string | null;
};

/** The final state of one document after any human override. */
export type Row = {
  doc: Doc;
  screening: Screening;
  extraction: Extraction | null;
  override: Override | null;
  /** Override wins when present. This is what exports and counts use. */
  finalVerdict: Verdict;
};

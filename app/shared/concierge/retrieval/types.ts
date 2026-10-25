export const EVIDENCE_SOURCES = ['prod_catalog', 'blog', 'help'] as const;
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number];

export type EvidenceRecord = {
  source: EvidenceSource;
  objectID: string;
  contentHash: string;
  retrievedAt: string;
  evidenceRef: string;
  record: Record<string, unknown>;
};

export type EvidenceConstraint = {
  field: string;
  operator: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte';
  value: string | number;
};

export type ProductEvidenceInput = {
  source: 'prod_catalog';
  query: string;
  count: number;
  exactObjectIDs: string[] | null;
  missionId: string;
  expectedRevision: number;
  turnId: string;
  target: { kind: 'item'; itemKey: string; productType: string } | null;
};

export type BlogEvidenceInput = {
  source: 'blog';
  query: string;
  count: number;
  exactObjectIDs: null;
  missionId: string;
  expectedRevision: number;
  turnId: string;
  target: null;
};
/** Help evidence (help_content index): policy/FAQ content. Blog-like
 * semantics: free-text query only, no item target, no exact-ID lookup, no
 * compiled brief filters. Citation-only: help records are never presentable
 * product lines and never persisted as committed evidence. */
export type HelpEvidenceInput = {
  source: 'help';
  query: string;
  count: number;
  exactObjectIDs: null;
  missionId: string;
  expectedRevision: number;
  turnId: string;
  target: null;
};
export type RetrieveEvidenceInput = ProductEvidenceInput | BlogEvidenceInput | HelpEvidenceInput;

export type RetrievalStatus =
  | 'invalid_input'
  | 'ok'
  | 'zero_hits'
  | 'stale_revision'
  | 'unsupported_constraint'
  | 'requirement_unavailable'
  | 'timeout'
  | 'aborted'
  | 'incomplete_evidence'
  | 'upstream_failure';

export type EffectiveFilter =
  EvidenceConstraint | { field: string; operator: 'in'; value: string[] };

export type UnavailableRequirement = {
  /** Brief fact field the shopper stated (e.g. product_type). */
  field: string;
  /** Catalogue attribute the fact compiled against. */
  attribute: string;
  /** Requested values that do not exist in the live catalogue vocabulary. */
  requested: string[];
  /** What the live catalogue does offer for that attribute. */
  availableValues: string[];
};

/** Read-only, brief-filtered style overview. Facet counts are candidate
 * signals, never proof of eligibility: material, fit, condition, availability
 * and other record-level checks still apply to the per-style searches. */
export type StyleOverviewColumn = {
  attribute: string;
  values: Array<{ value: string; count: number }>;
};

/** One style-direction search outcome inside a batched discovery request. */
export type StyleBatchResult = {
  attribute: string;
  value: string;
  requestedCount: number;
  eligibleCount: number;
  rejected: Array<{ objectID: string; reason: string }>;
  backfillUsed: boolean;
};

export type RetrieveEvidenceResult = {
  status: RetrievalStatus;
  source: EvidenceSource;
  missionId: string;
  revision: number;
  turnId: string;
  expectedRevision: number;
  effectiveFilters: EffectiveFilter[];
  records: EvidenceRecord[];
  unresolved: Array<{ field: string; reason: string }>;
  /** Present when status is requirement_unavailable: shopper-facing disclosure data. */
  unavailableRequirements?: UnavailableRequirement[];
  /** Present on styleOverview requests: candidate style values per attribute. */
  styleOverview?: StyleOverviewColumn[];
  /** Present on styleBatches requests: per-style eligibility outcome. */
  styleResults?: StyleBatchResult[];
  error?: { code: string; message: string; upstreamStatus?: number };
};

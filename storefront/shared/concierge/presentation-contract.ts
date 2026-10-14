import { z } from 'zod';
import type { EvidenceRecord } from './retrieval/types.js';

const id = z.string().trim().min(1).max(300);
const selectedLine = z
  .object({
    evidenceRef: id,
    objectID: id,
    contentHash: id,
    quantity: z.number().int().min(1).max(20),
    componentSlot: id,
    explanation: z.string().trim().min(1).max(500),
  })
  .strict();
export const CATALOGUE_GROUP_BASIS_ATTRIBUTES = [
  'Catalog_WatchCaseSize',
  'Catalog_WatchCaseShape',
  'Catalog_WatchStyle',
  'Catalog_ProductType',
  'Catalog_RingType',
  'Catalog_EarringType',
  'Catalog_BraceletType',
  'Catalog_NecklaceType',
  'Catalog_GemstoneInformation.GemstoneColorGroup',
  'Catalog_JewelryMaterialNavigationName',
] as const;
export const catalogueGroupBasisSchema = z
  .object({
    attribute: z.enum(CATALOGUE_GROUP_BASIS_ATTRIBUTES),
    value: z.string().trim().min(1).max(160),
  })
  .strict();
export const PRESENTATION_MODES = ['three_style_grid', 'focused_choice'] as const;
export type PresentationMode = (typeof PRESENTATION_MODES)[number];
const gridGroup = z
  .object({
    basis: catalogueGroupBasisSchema,
    items: z.array(selectedLine).min(2).max(3),
  })
  .strict();
const focusedGroup = z
  .object({
    basis: catalogueGroupBasisSchema,
    items: z.array(selectedLine).min(1).max(3),
  })
  .strict();
const legacyGroup = z
  .object({
    basis: catalogueGroupBasisSchema,
    items: z.array(selectedLine).min(1).max(2),
  })
  .strict();
const threeStyleGrid = z
  .object({
    kind: z.literal('product_groups'),
    mode: z.literal('three_style_grid'),
    groups: z.array(gridGroup).min(3).max(3),
    alternatives: z.null(),
  })
  .strict()
  .refine(
    (body) =>
      new Set(body.groups.map((group) => `${group.basis.attribute}\u0000${group.basis.value}`))
        .size === body.groups.length,
    { message: 'Style columns must be distinct' },
  );
const focusedChoice = z
  .object({
    kind: z.literal('product_groups'),
    mode: z.literal('focused_choice'),
    groups: z.array(focusedGroup).min(1).max(1),
    alternatives: z.null(),
  })
  .strict();
// Deprecated migration shape: the pre-repair contract without a mode. Kept so a
// presentation from an agent configured before the coordinated save still
// validates; the published instructions stop using it for open-ended discovery.
const legacyProductGroups = z
  .object({
    kind: z.literal('product_groups'),
    groups: z.array(legacyGroup).min(1).max(3),
    alternatives: z.null(),
  })
  .strict();
const completeLooks = z
  .object({
    kind: z.literal('complete_looks'),
    groups: z.null(),
    alternatives: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(160),
            lines: z.array(selectedLine).min(1).max(3),
          })
          .strict(),
      )
      .min(1)
      .max(3),
  })
  .strict();
const strictPresentationBody = z.union([
  threeStyleGrid,
  focusedChoice,
  legacyProductGroups,
  completeLooks,
]);
const envelope = z
  .object({
    missionId: id,
    expectedStateRevision: z.number().int().nonnegative(),
    expectedEvidenceBatchRevision: z.number().int().nonnegative(),
    turnId: id,
    proposalId: id,
  })
  .strict();
export const presentChoicesSchema = envelope.extend({ body: strictPresentationBody });
export type SelectedLineInput = z.infer<typeof selectedLine>;
export type CatalogueGroupBasis = z.infer<typeof catalogueGroupBasisSchema>;
export type PresentationBody = z.infer<typeof strictPresentationBody>;
export type PresentChoicesInput = z.infer<typeof presentChoicesSchema>;
export type PresentationMoneyBound = {
  currency: string;
  basis: 'per-item' | 'total';
  operator: 'lt' | 'lte' | 'gt' | 'gte' | 'around';
  cents: number;
};
export type PresentationUnresolved = {
  objectID?: string;
  reason: 'packaged_contents' | 'owned_context' | 'currency' | 'price' | 'other';
};
export type PresentationEvidence = EvidenceRecord & {
  missionId: string;
  stateRevision: number;
  evidenceBatchRevision: number;
  turnId: string;
  contentsVerified?: boolean;
};
export type PresentationIssue =
  | {
      kind: 'missing_anchor';
      alternativeIndex: number;
      objectID: string;
      count: number;
    }
  | {
      kind: 'duplicate_component_slot';
      alternativeIndex: number;
      componentSlot: string;
      objectIDs: string[];
    }
  | {
      kind: 'budget_conflict';
      basis: PresentationMoneyBound['basis'];
      operator: PresentationMoneyBound['operator'];
      boundCents: number;
      subtotalCents: number;
      alternativeIndex?: number;
      objectID?: string;
    };
export type PresentationContext = {
  missionId: string;
  stateRevision: number;
  evidenceBatchRevision: number;
  turnId: string;
  evidence: readonly PresentationEvidence[];
  bounds?: readonly PresentationMoneyBound[];
  budgetContextVerified?: boolean;
  acceptedAnchorIds?: readonly string[];
  unresolved?: readonly PresentationUnresolved[];
  priorProposal?: StagedPresentation | null;
  aborted?: boolean;
  /** Verified by the runtime against mission state: an accepted exact item or a
   * shopper-confirmed narrow style scope. Required for focused_choice mode. */
  focusedScopeVerified?: boolean;
};
export type StagedLine = {
  evidenceRef: string;
  objectID: string;
  contentHash: string;
  quantity: number;
  componentSlot: string;
  explanation: string;
  unitPriceCents: number | null;
  lineSubtotalCents: number | null;
};
export type StagedGroup = { title: string; lines: StagedLine[]; itemSubtotalCents: number | null };
export type StagedPresentation = {
  missionId: string;
  stateRevision: number;
  evidenceBatchRevision: number;
  turnId: string;
  proposalId: string;
  kind: PresentationBody['kind'];
  mode: PresentationMode | null;
  groups: StagedGroup[];
  combinedItemSubtotalCents: number | null;
  assessment: {
    perItem: 'accepted' | 'unresolved' | 'conflict';
    total: 'accepted' | 'unresolved' | 'conflict';
    reasons: string[];
  };
};
export type PresentationResult =
  | {
      status: 'staged';
      proposal: StagedPresentation;
      reasons: string[];
      details?: PresentationIssue[];
    }
  | {
      status:
        | 'invalid_input'
        | 'stale_state'
        | 'stale_evidence'
        | 'invalid_evidence'
        | 'unresolved'
        | 'budget_conflict'
        | 'aborted';
      proposal: StagedPresentation | null;
      reasons: string[];
      details?: PresentationIssue[];
    };
export type PresentationTurnStatus =
  'active' | 'completed' | 'aborted' | 'error' | 'exhausted' | 'stale';

export function exactPriceCents(record: Record<string, unknown>): number | null {
  const price = record.Pricing_ActivePrice;
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) return null;
  const raw = price * 100,
    cents = Math.round(raw);
  return Number.isSafeInteger(cents) && Math.abs(raw - cents) < 1e-7 ? cents : null;
}
export function addCents(a: number | null, b: number | null): number | null {
  return a === null || b === null || !Number.isSafeInteger(a + b) ? null : a + b;
}
export function boundPasses(cents: number, bound: PresentationMoneyBound): boolean {
  switch (bound.operator) {
    case 'lt':
      return cents < bound.cents;
    case 'lte':
      return cents <= bound.cents;
    case 'gt':
      return cents > bound.cents;
    case 'gte':
      return cents >= bound.cents;
    case 'around':
      return false;
  }
}

const CATALOGUE_GROUP_BASIS_LABELS: Record<CatalogueGroupBasis['attribute'], string> = {
  Catalog_WatchCaseSize: 'Watch case size',
  Catalog_WatchCaseShape: 'Watch case shape',
  Catalog_WatchStyle: 'Watch style',
  Catalog_ProductType: 'Product type',
  Catalog_RingType: 'Ring style',
  Catalog_EarringType: 'Earring style',
  Catalog_BraceletType: 'Bracelet style',
  Catalog_NecklaceType: 'Necklace style',
  'Catalog_GemstoneInformation.GemstoneColorGroup': 'Gemstone color',
  Catalog_JewelryMaterialNavigationName: 'Material',
};
/**
 * Discover headings carry a category label, never a schema readout. A
 * product-type basis IS the label ("Necklace", "Hoop Earrings"); other bases
 * keep their plain-language dimension prefix ("Watch case size: 36mm"). The
 * basis attribute stays available to the agent and validation through
 * CatalogueGroupBasis.
 */
export function deriveCatalogueGroupTitle(basis: CatalogueGroupBasis): string {
  if (basis.attribute === 'Catalog_ProductType') return basis.value || 'Product type';
  return `${CATALOGUE_GROUP_BASIS_LABELS[basis.attribute]}: ${basis.value}`;
}

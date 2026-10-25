import { z } from 'zod';
import { briefStateV3Schema } from '../briefSchema.js';
const iso = z
  .union([z.string().date(), z.string().datetime({ offset: true })])
  .nullable();
const raw = z.record(z.string(), z.unknown());
const common = {
  sourceIndex: z.literal('prod_catalog'),
  objectID: z.string().min(1),
  raw: raw.refine((r) => typeof r.objectID === 'string'),
  quantity: z.number().int().min(1).max(10),
  observedAt: iso,
};
export const evidenceBoundProductSchema = z
  .object({
    ...common,
    binding: z.literal('evidence_bound'),
    contentHash: z.string().min(1),
    evidenceRef: z.string().min(1),
  })
  .strict()
  .refine((product) => product.raw.objectID === product.objectID, 'Raw product identity mismatch');
export const legacySavedProductSchema = z
  .object({
    ...common,
    binding: z.literal('legacy_unbound'),
    contentHash: z.null(),
    evidenceRef: z.null(),
  })
  .strict()
  .refine((product) => product.raw.objectID === product.objectID, 'Raw product identity mismatch');
export const savedProductSchema = z.discriminatedUnion('binding', [
  evidenceBoundProductSchema,
  legacySavedProductSchema,
]);
export type EvidenceBoundProduct = z.infer<typeof evidenceBoundProductSchema>;
export type LegacySavedProduct = z.infer<typeof legacySavedProductSchema>;
export type SourceBoundProduct = EvidenceBoundProduct | LegacySavedProduct;
const receipt = z
  .object({
    operationId: z.string().min(1),
    payloadDigest: z.string().min(1),
    result: z.object({ status: z.string() }).passthrough(),
  })
  .strict();
/* Simplification 2026-10-22 (decisions D1 to D3): the session no longer holds
 * saved products, compare selections, the active workspace view or a committed
 * proposal. The workspace shows discovery columns and links to the PDP; Save
 * and Compare live on jtv.com (Love List, cart), not in this app. A session
 * carries the brief, the identity-verified selection records the agent's tools
 * reference, receipts and the evidence ledger. */
export const conciergeSessionSchema = z
  .object({
    version: z.literal(3),
    missionId: z.string().min(1),
    brief: briefStateV3Schema,
    selectionRecords: z.array(savedProductSchema).max(12),
    receipts: z.array(receipt).max(200),
    evidence: z
      .array(
        z
          .object({
            evidenceRef: z.string().min(1),
            sourceIndex: z.literal('prod_catalog'),
            objectID: z.string().min(1),
            contentHash: z.string().min(1),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();
export type ConciergeSession = z.infer<typeof conciergeSessionSchema>;
export function validateConciergeSession(value: unknown): ConciergeSession | null {
  try {
    const parsed = conciergeSessionSchema.parse(value);
    const selectionIds = new Set(parsed.selectionRecords.map((product) => product.objectID));
    if (selectionIds.size !== parsed.selectionRecords.length) return null;
    const registry = new Map<string, SourceBoundProduct>();
    for (const product of parsed.selectionRecords) {
      const existing = registry.get(product.objectID);
      if (existing && JSON.stringify(existing) !== JSON.stringify(product)) return null;
      registry.set(product.objectID, product);
    }
    for (const evidence of parsed.evidence ?? []) {
      const product = registry.get(evidence.objectID);
      if (
        !product ||
        product.binding !== 'evidence_bound' ||
        product.evidenceRef !== evidence.evidenceRef ||
        product.contentHash !== evidence.contentHash
      )
        return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

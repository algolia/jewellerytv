import { z } from 'zod';
import {
  briefStateSchema,
  briefStateV3Schema,
  type BriefFactV3Input,
  type BriefState,
  type BriefStateV3,
} from '../../briefSchema.js';
import { applyBriefOperationsV3, migrateBriefStateV2ToV3 } from '../../briefState.js';
import type { CatalogVocabulary } from '../vocabularyContract.js';
import {
  SUPPORTED_FACET_ATTRIBUTES,
  SUPPORTED_GEMSTONE_FACET_ATTRIBUTES,
  SUPPORTED_PEARL_FACET_ATTRIBUTES,
  MATERIAL_COLOR_EXCLUSION_ATTRIBUTE,
  WATCH_BAND_MATERIAL_FAMILIES,
} from '../catalogueFactContract.js';

const factId = z.string().min(1).max(120);
const sourceId = z.string().min(1).max(150);
const textValue = z.object({ kind: z.literal('text'), text: z.string().min(1).max(500) }).strict();
const moneyValue = z
  .object({
    kind: z.literal('money'),
    cents: z.number().int().min(0).max(100000000),
    currency: z.string().regex(/^[A-Z]{3}$/),
    operator: z.enum(['lt', 'lte', 'gt', 'gte', 'around']),
    basis: z.enum(['total', 'per_item', 'unresolved']),
  })
  .strict();
const facetValue = z
  .object({
    kind: z.literal('facet'),
    attribute: z.string().min(1).max(160),
    values: z.array(z.string().min(1).max(160)).min(1).max(20),
    operator: z.enum(['any', 'all', 'none']),
  })
  .strict();
const measurementValue = z
  .object({
    kind: z.literal('measurement'),
    value: z.number().finite().min(0).max(1000000),
    unit: z.enum(['mm', 'cm', 'in', 'ring_us', 'ring_uk', 'unknown']),
    component: z.string().max(120).nullable(),
  })
  .strict();
const productRefValue = z
  .object({
    kind: z.literal('product_ref'),
    objectID: z.string().min(1).max(150),
    sourceIndex: z.literal('prod_catalog'),
    relationship: z.enum([
      'liked',
      'rejected',
      'saved',
      'compared',
      'accepted',
      'owned',
      'reference',
    ]),
  })
  .strict();
const materialAlternativesValue = z
  .object({
    kind: z.literal('material_alternatives'),
    alternatives: z
      .array(
        z
          .object({
            // Free strings here; live-vocabulary validation happens in
            // toBriefFact so the accepted values follow the index, not code.
            type: z.string().max(160).nullable(),
            color: z.string().max(160).nullable(),
            purity: z.string().max(160).nullable(),
            plating: z
              .object({
                presence: z.enum(['required', 'forbidden']),
                purity: z.string().min(1).max(160).nullable(),
              })
              .strict()
              .nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(4),
  })
  .strict();
const watchBandFamilyValue = z
  .object({ kind: z.literal('watch_band_family'), family: z.enum(WATCH_BAND_MATERIAL_FAMILIES) })
  .strict();
const inputValue = z.union([
  textValue,
  moneyValue,
  facetValue,
  measurementValue,
  productRefValue,
  materialAlternativesValue,
  watchBandFamilyValue,
]);
const inputFact = z
  .object({
    id: factId,
    field: z.enum([
      'recipient',
      'occasion',
      'product_type',
      'design',
      'material',
      'gemstone',
      'pearl',
      'necklace_type',
      'earring_backing',
      'product_audience',
      'watch_dial_color',
      'watch_band_type',
      'watch_band_material',
      'condition',
      'exclusion',
      'wearability',
      'budget',
      'fit',
      'item_reference',
      'education_depth',
      'selection',
      'other',
    ]),
    value: inputValue,
    scope: z
      .object({
        kind: z.enum(['mission', 'recipient', 'item', 'component']),
        key: z.string().max(120).nullable(),
      })
      .strict(),
    strength: z.enum(['requirement', 'preference', 'context']),
    certainty: z.enum(['explicit', 'tentative']),
  })
  .strict()
  .superRefine((f, ctx) => {
    if (f.scope.kind === 'mission' && f.scope.key !== null)
      ctx.addIssue({ code: 'custom', message: 'Mission scope key must be null' });
  });
const inputOperation = z
  .object({
    action: z.enum(['add', 'replace', 'retract']),
    // An add names no existing facts; the published sheet marks this optional, so absent means [].
    factIds: z.array(factId).max(24).default([]),
    fact: inputFact.nullable(),
    sourceQuote: z.string().min(1).max(2000),
  })
  .strict()
  .superRefine((o, ctx) => {
    if ((o.action === 'add' || o.action === 'replace') && !o.fact)
      ctx.addIssue({ code: 'custom', message: 'Add and replace require fact' });
    if (o.action === 'retract' && o.fact !== null)
      ctx.addIssue({ code: 'custom', message: 'Retract requires null fact' });
    if (o.action === 'add' && o.factIds.length !== 0)
      ctx.addIssue({ code: 'custom', message: 'Add requires empty factIds' });
    if ((o.action === 'replace' || o.action === 'retract') && o.factIds.length === 0)
      ctx.addIssue({ code: 'custom', message: 'Replace and retract require factIds' });
  });
export const updateShoppingStateInputSchema = z
  .object({
    missionId: z.string().min(1).max(120),
    expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    operationId: z.string().min(1).max(120),
    sourceMessageId: sourceId,
    operations: z.array(inputOperation).max(12),
  })
  .strict();
export type UpdateShoppingStateInput = z.infer<typeof updateShoppingStateInputSchema>;

export type ShopperMessage = { id: string; text: string };
export type ShoppingState = {
  brief: BriefState | BriefStateV3;
  receipts: readonly OperationReceipt[];
};
export type OperationReceipt = {
  operationId: string;
  payloadDigest: string;
  result: UpdateShoppingStateResult;
};
export type UpdateShoppingStateResult = {
  status: 'applied' | 'replayed' | 'stale_revision' | 'operation_conflict' | 'invalid_input';
  missionId: string;
  previousRevision: number;
  revision: number;
  operationId: string;
  appliedFactIds: string[];
  retractedFactIds: string[];
  currentStateDigest: string;
  failure: null | { code: string; message: string; currentRevision: number };
};

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
    .join(',')}}`;
}
async function digest(value: unknown): Promise<string> {
  const hash = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonical(value)),
  );
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export const canonicalSha256 = digest;
async function failure(
  input: Partial<UpdateShoppingStateInput>,
  brief: BriefState | BriefStateV3,
  status: UpdateShoppingStateResult['status'],
  code: string,
  message: string,
): Promise<UpdateShoppingStateResult> {
  return {
    status,
    missionId: input.missionId ?? brief.missionId,
    previousRevision: brief.revision,
    revision: brief.revision,
    operationId: input.operationId ?? '',
    appliedFactIds: [],
    retractedFactIds: [],
    currentStateDigest: await digest(brief),
    failure: { code, message, currentRevision: brief.revision },
  };
}
/** CLASSIFICATION evidence (sister-fix-retrieval-2026-10-14, derived from
 * compile() in server/concierge/retrieveEvidence.ts:346-741, not assumed): the
 * field x value-kind pairs an active requirement+explicit fact can occupy that
 * fall through every compile() branch into `unresolved`. One unresolved entry
 * makes EVERY later prod_catalog call return unsupported_constraint with zero
 * records until the fact is retracted, so the writer refuses them up front.
 * Fields omitted here are safe by compile() construction: recipient, occasion,
 * design, style, selection and item_reference are skipped as context before
 * any value branch (selection carries the presentation contract's explicit
 * single focus, never a search filter); product_type resolves through the
 * mission types before the value branches; text/measurement/product_ref pairs
 * not listed either compile (fit measurements, exclusion money) or are already
 * refused by the specific gates above (product_type text, pearl/necklace_type/
 * product_audience non-facet, exclusion text requirements). */
const TEXT_REQUIREMENT_POISON_FIELDS = [
  'material',
  'gemstone',
  'watch_dial_color',
  'watch_band_type',
  'condition',
  'wearability',
  'budget',
  'fit',
  'education_depth',
  'other',
] as const;
const MEASUREMENT_REQUIREMENT_POISON_FIELDS = [
  'material',
  'gemstone',
  'watch_dial_color',
  'watch_band_type',
  'condition',
  'wearability',
  'budget',
  'exclusion',
  'education_depth',
  'other',
] as const;
const PRODUCT_REF_REQUIREMENT_POISON_FIELDS = [...MEASUREMENT_REQUIREMENT_POISON_FIELDS, 'fit'];
/** Fields that resolve or skip before compile()'s money branch, where a money
 * value is context and can never be marked unresolved. On every other field an
 * explicit money requirement must be an exact USD bound: the around operator
 * and foreign currencies are marked unresolved by compile() and would block
 * every search. basis unresolved is deliberately absent: the fact schema
 * (briefSchema.ts) downgrades it to tentative status, which the compiler
 * skips, so it defuses itself. */
const MONEY_CONTEXT_FIELDS = [
  'recipient',
  'occasion',
  'design',
  'item_reference',
  'product_type',
] as const;
/** When one exists, the exact encoding the compiler DOES support for the same
 * meaning; the refusal names it before the universal fallbacks. */
const TEXT_REQUIREMENT_EXACT_ENCODING: Partial<Record<string, string>> = {
  budget: 'an exact USD money bound (operator lt, lte, gt or gte)',
  fit: 'a typed measurement with unit in, cm, mm or ring_us',
  material: 'the material_alternatives encoding with live catalogue values',
  gemstone:
    'a facet on Catalog_GemstoneInformation.GemstoneColorGroup or Catalog_GemstoneInformationPrimary.GemstoneName with live catalogue values',
  watch_dial_color: 'a facet on Catalog_WatchPrimaryDialPrimaryColor with exactly one live value',
  watch_band_type: 'a facet on Catalog_WatchBandType with exactly one live value',
};
const MEASUREMENT_REQUIREMENT_EXACT_ENCODING: Partial<Record<string, string>> = {
  material: 'the material_alternatives encoding with live catalogue values',
  exclusion:
    'a none-operator facet on Catalog_ProductType, Catalog_Motif, Catalog_MaterialInformation.MaterialColor or Catalog_GemstoneInformation.GemstoneColorGroup',
};
const REQUIREMENT_FALLBACK_ALTERNATIVES =
  'record the meaning with strength preference or strength context, or with certainty tentative';

/** Returns the full structured refusal detail for a requirement+explicit fact
 * the compiler can never compile, or null when the encoding is supported.
 * Thrown by toBriefFact and converted by updateShoppingState's existing
 * handler into a structured invalid_input result, so the agent always receives
 * an actionable outcome and never an error surface. */
function requirementEncodingRefusal(
  f: NonNullable<UpdateShoppingStateInput['operations'][number]['fact']>,
): string | null {
  if (f.strength !== 'requirement' || f.certainty !== 'explicit') return null;
  const refuse = (alternatives: string) =>
    `UNSUPPORTED_REQUIREMENT_ENCODING:${f.id}:${f.field}:${f.value.kind}: an explicit ${f.field} requirement with a ${f.value.kind} value has no supported catalogue encoding and would block every later catalogue search until retracted. Supported alternatives: ${alternatives}.`;
  const kind = f.value.kind;
  if (kind === 'text' && (TEXT_REQUIREMENT_POISON_FIELDS as readonly string[]).includes(f.field)) {
    const exact = TEXT_REQUIREMENT_EXACT_ENCODING[f.field];
    return refuse(
      exact
        ? `${exact}, or ${REQUIREMENT_FALLBACK_ALTERNATIVES}`
        : REQUIREMENT_FALLBACK_ALTERNATIVES,
    );
  }
  if (kind === 'measurement') {
    if (f.field === 'fit') {
      if (f.value.unit === 'ring_uk' || f.value.unit === 'unknown')
        return refuse(
          'a typed measurement with unit in, cm, mm or ring_us, or ' +
            REQUIREMENT_FALLBACK_ALTERNATIVES,
        );
      return null;
    }
    if ((MEASUREMENT_REQUIREMENT_POISON_FIELDS as readonly string[]).includes(f.field)) {
      const exact = MEASUREMENT_REQUIREMENT_EXACT_ENCODING[f.field];
      return refuse(
        exact
          ? `${exact}, or ${REQUIREMENT_FALLBACK_ALTERNATIVES}`
          : REQUIREMENT_FALLBACK_ALTERNATIVES,
      );
    }
  }
  if (
    kind === 'product_ref' &&
    (PRODUCT_REF_REQUIREMENT_POISON_FIELDS as readonly string[]).includes(f.field)
  )
    return refuse(REQUIREMENT_FALLBACK_ALTERNATIVES);
  if (kind === 'money' && !(MONEY_CONTEXT_FIELDS as readonly string[]).includes(f.field)) {
    if (f.value.operator === 'around' || f.value.currency !== 'USD')
      return refuse(
        'an exact USD money bound (operator lt, lte, gt or gte with basis total or per_item), or ' +
          REQUIREMENT_FALLBACK_ALTERNATIVES,
      );
  }
  if (kind === 'facet') {
    if (
      (f.field === 'watch_dial_color' || f.field === 'watch_band_type') &&
      f.value.values.length > 1
    )
      return refuse(
        'one live catalogue value per watch facet fact (operator any), or ' +
          REQUIREMENT_FALLBACK_ALTERNATIVES,
      );
    if (f.field === 'necklace_type' && f.value.values.length > 1)
      // The compile() multi-value OR tail is pearl and gemstone only; a
      // multi-value necklace_type any lands in the single-value unresolved
      // tail and would block every search.
      return refuse(
        'one live catalogue value per necklace_type facet fact (operator any), or ' +
          REQUIREMENT_FALLBACK_ALTERNATIVES,
      );
    if (f.field === 'gemstone' && f.value.operator === 'all')
      return refuse(
        'operator any with the wanted values (the compiler treats them as alternatives), or ' +
          REQUIREMENT_FALLBACK_ALTERNATIVES,
      );
  }
  return null;
}

function toBriefFact(
  f: NonNullable<UpdateShoppingStateInput['operations'][number]['fact']>,
  sourceMessageId: string,
  quote: string,
  vocabulary: CatalogVocabulary | undefined,
): BriefFactV3Input {
  /** Live-vocabulary value gate. The index is the only source of truth for
   * which values exist; a fact the writer cannot verify against the live
   * vocabulary is refused with a distinct, agent-readable code. */
  const liveValues = (attribute: string): string[] => {
    if (!vocabulary) throw new Error(`VOCABULARY_UNAVAILABLE:${f.id}:${f.field}`);
    return vocabulary.availableValues(attribute);
  };
  const requireLiveValue = (attribute: string, value: string) => {
    if (!liveValues(attribute).includes(value))
      throw new Error(`VALUE_NOT_IN_LIVE_VOCABULARY:${f.id}:${f.field}:${attribute}:${value}`);
  };
  if (f.field === 'material' && f.value.kind === 'facet')
    throw new Error(`UNSUPPORTED_FACT_ENCODING:${f.id}:${f.field}`);
  if (f.field === 'product_type' && f.value.kind === 'text')
    throw new Error(`UNSUPPORTED_FACT_ENCODING:${f.id}:${f.field}`);
  // Pearl requirements accept only the typed facet encoding (Craig Task 01):
  // a text pearl fact is exactly the encoding that left the shopper with an
  // unverified "cannot verify pearls" answer, so the writer refuses it up
  // front instead of letting it fail later at compile time.
  if (f.field === 'pearl' && f.value.kind !== 'facet')
    throw new Error(`UNSUPPORTED_FACT_ENCODING:${f.id}:${f.field}`);
  if (f.field === 'necklace_type' && f.value.kind !== 'facet')
    throw new Error(`UNSUPPORTED_FACT_ENCODING:${f.id}:${f.field}`);
  // Product-audience requirements accept only the typed facet encoding on the
  // authoritative Catalog_Gender attribute (Craig Task 02, verified live
  // 2026-10-13: Catalog_Gender is a filterable facet carrying exactly Female,
  // Male, Unisex). A text audience fact ("men's") is exactly the encoding
  // that cannot be compiled into an eligibility gate, so the writer refuses
  // it up front; Catalog_TargetConsumer stays a record-level cross-check and
  // is never an accepted brief attribute. The accepted VALUE SET (e.g. Male
  // plus Unisex for an explicit men's scope) is the agent's stated choice;
  // each value must exist in the live vocabulary below.
  if (f.field === 'product_audience' && f.value.kind !== 'facet')
    throw new Error(`UNSUPPORTED_FACT_ENCODING:${f.id}:${f.field}`);
  // Earring backing type (backing-type lane, verified live 2026-10-14:
  // Catalog_BackingType is a filterable facet carrying twenty live values
  // including Clip-On, Fish Hook, Leverback and Push Back). The requirement
  // encoding is a facet on Catalog_BackingType whose values are the agent's
  // meaning-mapped choices validated against the live vocabulary ("clip-ons",
  // "her ears are not pierced" -> Clip-On). A backing meaning with no live
  // value is never a bogus facet: it stays as a text CONTEXT fact the
  // conversation can still use, so the only accepted text encoding here is
  // strength context. A backing requirement never compiles against a necklace
  // or any other product direction; the compiler enforces that direction gate.
  if (
    f.field === 'earring_backing' &&
    f.value.kind !== 'facet' &&
    !(f.value.kind === 'text' && f.strength === 'context')
  )
    throw new Error(`UNSUPPORTED_FACT_ENCODING:${f.id}:${f.field}`);
  if (f.field === 'exclusion' && f.value.kind === 'text' && f.strength === 'requirement')
    throw new Error(`UNSUPPORTED_FACT_ENCODING:${f.id}:${f.field}`);
  if (f.field !== 'material' && f.value.kind === 'material_alternatives')
    throw new Error(`UNSUPPORTED_FACT_ENCODING:${f.id}:${f.field}`);
  if (f.field !== 'watch_band_material' && f.value.kind === 'watch_band_family')
    throw new Error(`UNSUPPORTED_FACT_ENCODING:${f.id}:${f.field}`);
  if (f.field === 'watch_band_material' && f.value.kind !== 'watch_band_family')
    throw new Error(`UNSUPPORTED_FACT_ENCODING:${f.id}:${f.field}`);
  // General classification gate (sister-fix-retrieval-2026-10-14): an active
  // requirement+explicit fact the compiler can never compile poisons every
  // later catalogue search, so it is refused here, at the only layer that sees
  // the fact before it enters state. The refusal is a structured, agent-readable
  // outcome naming the supported alternatives; preference strength, context
  // strength and tentative certainty encodings stay accepted by design.
  const requirementRefusal = requirementEncodingRefusal(f);
  if (requirementRefusal) throw new Error(requirementRefusal);
  if (f.value.kind === 'material_alternatives') {
    for (const alternative of f.value.alternatives) {
      if (alternative.type !== null)
        requireLiveValue('Catalog_MaterialInformation.MaterialType', alternative.type);
      if (alternative.color !== null)
        requireLiveValue('Catalog_MaterialInformation.MaterialColor', alternative.color);
      if (alternative.purity !== null)
        requireLiveValue('Catalog_MaterialInformation.MaterialPurity', alternative.purity);
    }
  }
  if (f.value.kind === 'facet') {
    const facet = f.value;
    const expected =
      f.field === 'product_type'
        ? SUPPORTED_FACET_ATTRIBUTES.product_type
        : f.field === 'gemstone'
          ? SUPPORTED_GEMSTONE_FACET_ATTRIBUTES.find((attribute) => attribute === facet.attribute)
          : f.field === 'pearl'
            ? SUPPORTED_PEARL_FACET_ATTRIBUTES.find((attribute) => attribute === facet.attribute)
            : f.field === 'necklace_type'
              ? SUPPORTED_FACET_ATTRIBUTES.necklace_type
              : f.field === 'product_audience'
                ? SUPPORTED_FACET_ATTRIBUTES.product_audience
                : f.field === 'earring_backing'
                  ? SUPPORTED_FACET_ATTRIBUTES.earring_backing
                  : f.field === 'watch_dial_color'
                    ? SUPPORTED_FACET_ATTRIBUTES.watch_dial_color
                    : f.field === 'watch_band_type'
                      ? SUPPORTED_FACET_ATTRIBUTES.watch_band_type
                      : f.field === 'exclusion' && facet.attribute === 'Catalog_ProductType'
                        ? 'Catalog_ProductType'
                        : f.field === 'exclusion' && facet.attribute === 'Catalog_Motif'
                          ? 'Catalog_Motif'
                          : f.field === 'exclusion' &&
                              facet.attribute === MATERIAL_COLOR_EXCLUSION_ATTRIBUTE
                            ? MATERIAL_COLOR_EXCLUSION_ATTRIBUTE
                            : f.field === 'exclusion' &&
                                facet.attribute === SUPPORTED_FACET_ATTRIBUTES.gemstone
                              ? SUPPORTED_FACET_ATTRIBUTES.gemstone
                              : undefined;
    if (!expected || facet.attribute !== expected)
      throw new Error(`UNSUPPORTED_FACT_ENCODING:${f.id}:${f.field}`);
    if (
      (f.field !== 'watch_dial_color' &&
        f.field !== 'watch_band_type' &&
        f.field !== 'gemstone' &&
        f.field !== 'pearl' &&
        f.field !== 'necklace_type' &&
        f.field !== 'earring_backing' &&
        f.field !== 'product_audience' &&
        f.field !== 'product_type' &&
        f.field !== 'exclusion') ||
      (f.field === 'watch_dial_color' && facet.operator !== 'any') ||
      (f.field === 'watch_band_type' && facet.operator !== 'any') ||
      // Pearl and necklace-type requirements are always positive selections;
      // a none-operator pearl exclusion is a different product conversation.
      // The same holds for audience scope: excluding a gender is not a
      // product conversation this contract supports, and neither is excluding
      // a backing type.
      ((f.field === 'pearl' ||
        f.field === 'necklace_type' ||
        f.field === 'earring_backing' ||
        f.field === 'product_audience') &&
        facet.operator !== 'any')
    )
      throw new Error(`UNSUPPORTED_FACT_ENCODING:${f.id}:${f.field}`);
    if (
      f.field === 'product_type' &&
      (facet.operator !== 'any' ||
        facet.values.some((value) => !liveValues('Catalog_ProductType').includes(value)))
    )
      throw new Error(
        facet.values.some((value) => !liveValues('Catalog_ProductType').includes(value))
          ? `VALUE_NOT_IN_LIVE_VOCABULARY:${f.id}:${f.field}:Catalog_ProductType:${facet.values.find((value) => !liveValues('Catalog_ProductType').includes(value))}`
          : `UNSUPPORTED_FACT_ENCODING:${f.id}:${f.field}`,
      );
    if (f.field === 'exclusion') {
      if (facet.operator !== 'none')
        throw new Error(`UNSUPPORTED_FACT_ENCODING:${f.id}:${f.field}`);
      if (facet.attribute === 'Catalog_ProductType') {
        facet.values.forEach((value) => requireLiveValue('Catalog_ProductType', value));
      } else if (facet.attribute === 'Catalog_Motif') {
        // Catalog_Motif is not exposed as a scannable facet; the single verified
        // exclusion value remains a literal naming-map entry, not a frozen copy.
        if (facet.values.some((value) => value !== 'Heart'))
          throw new Error(`UNSUPPORTED_FACT_ENCODING:${f.id}:${f.field}`);
      } else if (facet.attribute === MATERIAL_COLOR_EXCLUSION_ATTRIBUTE) {
        facet.values.forEach((value) =>
          requireLiveValue(MATERIAL_COLOR_EXCLUSION_ATTRIBUTE, value),
        );
      } else if (facet.attribute === SUPPORTED_FACET_ATTRIBUTES.gemstone) {
        // The compiler turns this into a plain not-this-value filter on the
        // filterable gemstone colour facet; values must exist in the live index.
        facet.values.forEach((value) =>
          requireLiveValue(SUPPORTED_FACET_ATTRIBUTES.gemstone, value),
        );
      }
    }
    if (f.field !== 'exclusion') {
      if (
        f.field === 'gemstone' ||
        f.field === 'pearl' ||
        f.field === 'necklace_type' ||
        f.field === 'earring_backing' ||
        f.field === 'product_audience' ||
        f.field === 'watch_dial_color' ||
        f.field === 'watch_band_type'
      )
        facet.values.forEach((value) => requireLiveValue(facet.attribute, value));
    }
  }
  if (f.scope.kind !== 'mission' && !f.scope.key) throw new Error('unsupported_scope_key');
  const value: BriefFactV3Input['value'] =
    f.value.kind === 'money' && f.value.basis === 'per_item'
      ? { ...f.value, basis: 'per-item' as const }
      : (f.value as BriefFactV3Input['value']);
  return {
    id: f.id,
    field: f.field,
    value,
    scope: f.scope,
    strength: f.strength,
    certainty: f.certainty,
    origin: 'spoken',
    evidence: {
      messageId: sourceMessageId,
      quote,
      explicit: f.certainty === 'explicit',
      verified: false,
      sourceValidation: 'exact_user_message_substring',
    },
  };
}

export async function updateShoppingState(
  state: ShoppingState,
  rawInput: unknown,
  currentMessage: ShopperMessage,
  vocabulary?: CatalogVocabulary,
): Promise<{ state: ShoppingState; result: UpdateShoppingStateResult }> {
  const brief: BriefStateV3 =
    state.brief.version === 2
      ? migrateBriefStateV2ToV3(briefStateSchema.parse(state.brief))
      : briefStateV3Schema.parse(state.brief);
  const parsed = updateShoppingStateInputSchema.safeParse(rawInput);
  if (!parsed.success)
    return {
      state,
      result: await failure(
        {},
        state.brief,
        'invalid_input',
        'schema_invalid',
        'Input failed strict callback validation',
      ),
    };
  const input = parsed.data;
  if (input.operations.length === 0)
    return {
      state,
      result: await failure(
        input,
        state.brief,
        'invalid_input',
        'NO_OPERATIONS',
        'No operations supplied',
      ),
    };
  const existing = state.receipts.find((r) => r.operationId === input.operationId);
  const payloadDigest = await digest(input);
  if (existing)
    return existing.payloadDigest === payloadDigest
      ? { state, result: { ...existing.result, status: 'replayed' } }
      : {
          state,
          result: await failure(
            input,
            state.brief,
            'operation_conflict',
            'operation_id_reused',
            'operationId was previously used with a different payload',
          ),
        };
  if (input.missionId !== brief.missionId)
    return {
      state,
      result: await failure(
        input,
        state.brief,
        'invalid_input',
        'mission_mismatch',
        'missionId does not match current brief',
      ),
    };
  if (input.expectedRevision !== brief.revision)
    return {
      state,
      result: await failure(
        input,
        state.brief,
        'stale_revision',
        'revision_mismatch',
        'expectedRevision does not match current brief',
      ),
    };
  if (input.sourceMessageId !== currentMessage.id)
    return {
      state,
      result: await failure(
        input,
        state.brief,
        'invalid_input',
        'message_mismatch',
        'sourceMessageId is not the current shopper message',
      ),
    };
  if (input.operations.some((o) => !currentMessage.text.includes(o.sourceQuote)))
    return {
      state,
      result: await failure(
        input,
        state.brief,
        'invalid_input',
        'quote_mismatch',
        'sourceQuote is not an exact substring of the current shopper message',
      ),
    };
  try {
    const operations = input.operations.map((o) =>
      o.action === 'retract'
        ? { type: 'retract' as const, factIds: o.factIds }
        : o.action === 'add'
          ? {
              type: 'add' as const,
              fact: toBriefFact(o.fact!, input.sourceMessageId, o.sourceQuote, vocabulary),
            }
          : {
              type: 'replace' as const,
              factIds: o.factIds,
              fact: toBriefFact(o.fact!, input.sourceMessageId, o.sourceQuote, vocabulary),
            },
    );
    if (
      input.operations.some((o) => (o.action === 'add' || o.action === 'replace') && !o.fact) ||
      input.operations.some((o) => o.action === 'retract' && o.fact !== null)
    )
      throw new Error('operation_shape');
    const next = applyBriefOperationsV3(brief, {
      missionId: input.missionId,
      expectedRevision: input.expectedRevision,
      turnId: input.operationId,
      operations,
    });
    const appliedFactIds = input.operations.flatMap((o) =>
      o.action === 'add' || o.action === 'replace' ? [o.fact!.id] : [],
    );
    const retractedFactIds = input.operations.flatMap((o) =>
      o.action === 'retract' || o.action === 'replace' ? o.factIds : [],
    );
    const result: UpdateShoppingStateResult = {
      status: 'applied',
      missionId: input.missionId,
      previousRevision: brief.revision,
      revision: next.revision,
      operationId: input.operationId,
      appliedFactIds,
      retractedFactIds,
      currentStateDigest: await digest(next),
      failure: null,
    };
    return {
      state: {
        brief: next,
        receipts: [
          ...state.receipts,
          { operationId: input.operationId, payloadDigest, result },
        ].slice(-200),
      },
      result,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'operation_rejected';
    const unsupported = detail.startsWith('UNSUPPORTED_FACT_ENCODING');
    const unsupportedRequirement = detail.startsWith('UNSUPPORTED_REQUIREMENT_ENCODING');
    const notLive = detail.startsWith('VALUE_NOT_IN_LIVE_VOCABULARY');
    const noVocabulary = detail.startsWith('VOCABULARY_UNAVAILABLE');
    const itemScopeCollision = detail === 'ITEM_SCOPE_KEY_COLLISION';
    return {
      state,
      result: await failure(
        input,
        state.brief,
        'invalid_input',
        notLive
          ? 'VALUE_NOT_IN_LIVE_VOCABULARY'
          : noVocabulary
            ? 'VOCABULARY_UNAVAILABLE'
            : unsupported
              ? 'UNSUPPORTED_FACT_ENCODING'
              : unsupportedRequirement
                ? 'UNSUPPORTED_REQUIREMENT_ENCODING'
                : itemScopeCollision
                  ? 'ITEM_SCOPE_KEY_COLLISION'
                  : 'operation_rejected',
        itemScopeCollision
          ? 'Item scope key differs only by case from another live item; use its exact key or retract the conflicting scope'
          : detail,
      ),
    };
  }
}

export const applyShoppingStateUpdate = updateShoppingState;

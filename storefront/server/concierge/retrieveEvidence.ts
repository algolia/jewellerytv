import { createHash } from 'node:crypto';
import { briefStateV3Schema, type BriefStateV3 } from '../../shared/briefSchema.js';
import { retrieveEvidenceInputSchema } from '../../shared/concierge/retrieval/schema.js';
import type {
  EffectiveFilter,
  EvidenceRecord,
  EvidenceSource,
  RetrievalStatus,
  RetrieveEvidenceResult,
  StyleBatchResult,
  StyleOverviewColumn,
} from '../../shared/concierge/retrieval/types.js';
// Re-export for sibling evidence search modules; the type's single source
// stays retrieval/types.js.
export type { EffectiveFilter };
import type { RetrieveEvidenceInput } from '../../shared/concierge/retrieval/schema.js';
import { materialMatch as verifyMaterial, type MaterialRequirement } from './materialEvidence.js';
import type { CatalogVocabularyCache, CatalogVocabularySnapshot } from './catalogVocabulary.js';
import type { UnavailableRequirement } from '../../shared/concierge/retrieval/types.js';
import { makeResult } from './retrievalResult.js';
import {
  AUDIENCE_CONSUMER_CHECK,
  METAL_WATCH_BAND_MATERIALS,
  PRODUCT_AUDIENCE_ATTRIBUTE,
  SUPPORTED_FACET_ATTRIBUTES,
} from '../../shared/concierge/catalogueFactContract.js';
import { CATALOGUE_GROUP_BASIS_ATTRIBUTES } from '../../shared/concierge/presentation-contract.js';

const INDEXES: Record<EvidenceSource, string> = {
  prod_catalog: 'prod_catalog',
  blog: 'blog',
  help: 'help_content',
};
const PRODUCT_FIELDS = new Set([
  'Catalog_ProductType',
  'Catalog_Brand',
  'Catalog_ConsumerProductCategories',
  'Catalog_ConsumerProductCategoryDisplayNames',
  'Catalog_PrimaryGemstoneAndPearlColorGroups',
  'Catalog_GemstoneInformation.GemstoneColorGroup',
  'Catalog_GemstoneInformationPrimary.GemstoneName',
  'Catalog_PearlInformationPrimary.PearlFullName',
  'Catalog_PearlInformation.PearlFullName',
  'Catalog_NecklaceType',
  'Catalog_Motif',
  'Catalog_WatchPrimaryDialPrimaryColor',
  'Catalog_WatchBandType',
  'Catalog_WatchCaseShape',
]);
const MATERIAL_FIELDS = new Set(['material', 'Catalog_Material', 'Catalog_Materials']);
const MATERIAL_ATTRIBUTE_PATHS = new Set([
  'Catalog_MaterialInformation.MaterialType',
  'Catalog_MaterialInformation.MaterialColor',
  'Catalog_MaterialInformation.MaterialPurity',
]);
const PRODUCT_PROJECTION = [
  'objectID',
  'Catalog_ProductNumber',
  'Catalog_SKUNumbers',
  'Catalog_TitleDescription',
  'Catalog_LongDescription',
  'Catalog_ProductType',
  'Catalog_Condition',
  'Catalog_Motif',
  'Catalog_JewelryMaterialNavigationName',
  'Catalog_JewelryMaterialNavigationPurity',
  'Catalog_JewelryMaterialNavigationColor',
  'Catalog_MaterialInformation',
  'Catalog_GemstoneInformation',
  'Catalog_GemstoneInformationPrimary',
  'Catalog_PearlInformation',
  'Catalog_PearlInformationPrimary',
  'Catalog_BeadInformation',
  'Catalog_OtherMaterialInformation',
  'Catalog_BackingType',
  'Catalog_WatchDialInformation',
  'Catalog_WatchPrimaryDialPrimaryColor',
  'Catalog_WatchBandType',
  'Catalog_BandMaterialInformation',
  'Catalog_WatchCaseSize',
  'Catalog_WatchCaseShape',
  'Catalog_WatchStyle',
  // Watch evidence projection repair (STAGE2-WATER-RESISTANCE-PROJECTION-DESIGN,
  // red test first): the exact catalogue records carry both fields (measured on
  // 1W9E1B and 1DXZHA); the projection previously discarded them, so the agent
  // could not ground a stated water-resistance rating or a previously-owned
  // check. Query-level attributesToRetrieve only; no index setting changes.
  'Catalog_WaterResistanceRating',
  'Catalog_PreviouslyOwned',
  'Catalog_EarringType',
  'Catalog_NecklaceType',
  'Catalog_PendantType',
  'Catalog_RingType',
  'Catalog_BraceletType',
  'Inventory_AvailableSkuSizes',
  'Inventory_AvailableSkuSizeNames',
  'Inventory_InStock',
  'Pricing_ActivePrice',
  'Pricing_PriceRange',
  'Pricing_PriceLabelName',
  'Media_Images',
  'Ratings_AverageRating',
  // Audience projection (Craig-feedback Task 02, red test first): the exact
  // catalogue records carry both audience fields (verified live 2026-10-13 on
  // JRJ802A, 1ZPF6B and the 2026-10-12 Craig repro exact reads); the
  // projection previously discarded them, so no downstream identity check or
  // card display could ground an accepted men's audience scope. Query-level
  // attributesToRetrieve only; no index setting changes.
  'Catalog_Gender',
  'Catalog_TargetConsumer',
];
const BLOG_PROJECTION = [
  'objectID',
  'article_id',
  'title',
  'heading_path',
  'content',
  'scope_text',
  'canonical_url',
  'source_role',
  'author',
  'published_at',
  'modified_at',
  'content_hash',
  'category',
  'tags',
  'language',
  'run_id',
  'fetched_at',
  'schema_version',
];
const BLOG_REQUIRED = [
  'article_id',
  'title',
  'content',
  'canonical_url',
  'source_role',
  'content_hash',
] as const;
// help_content record attributes verified live 2026-10-12
// (scripts/verify-help-index.mjs): document_id, title, content, heading_path,
// scope_text, canonical_url, source_role, topic, content_hash, fetched_at,
// modified_at. Same completeness contract as blog, with document_id in place
// of article_id.
const HELP_PROJECTION = [
  'objectID',
  'document_id',
  'title',
  'heading_path',
  'content',
  'scope_text',
  'canonical_url',
  'source_role',
  'topic',
  'content_hash',
  'fetched_at',
  'modified_at',
];
const HELP_REQUIRED = [
  'document_id',
  'title',
  'content',
  'canonical_url',
  'source_role',
  'content_hash',
] as const;
const PROJECTIONS: Record<EvidenceSource, string[]> = {
  prod_catalog: PRODUCT_PROJECTION,
  blog: BLOG_PROJECTION,
  help: HELP_PROJECTION,
};
export type EvidenceSearchRequest = {
  source: EvidenceSource;
  query: string;
  count: number;
  exactObjectIDs?: readonly string[] | null;
  filters: readonly EffectiveFilter[];
  signal: AbortSignal;
};
export type EvidenceSearch = (
  request: EvidenceSearchRequest,
) => Promise<readonly Record<string, unknown>[]>;
/** Read-only facet-count interrogation for the discovery style overview.
 * Counts are candidates, never proof of eligibility. */
export type EvidenceFacetRequest = {
  source: EvidenceSource;
  query: string;
  filters: readonly EffectiveFilter[];
  facets: readonly string[];
  signal: AbortSignal;
};
export type EvidenceFacetSearch = (
  request: EvidenceFacetRequest,
) => Promise<Record<string, Record<string, number>>>;
export type EvidenceRetrieverOptions = {
  search: EvidenceSearch;
  currentState: (missionId: string) => BriefStateV3 | Promise<BriefStateV3>;
  now?: () => string;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Live catalog vocabulary (filterable attributes + values). Optional for
   * backward compatibility: without it the compiler behaves exactly as before
   * the runtime-vocabulary change. */
  vocabulary?: CatalogVocabularyCache;
  /** Optional facet-count search backing the discovery style overview. */
  facetSearch?: EvidenceFacetSearch;
};
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(',')}}`;
}
export function hashEvidenceRecord(record: Record<string, unknown>): string {
  return createHash('sha256').update(canonical(record)).digest('hex');
}
export function evidenceRef(source: EvidenceSource, objectID: string, contentHash: string): string {
  return `${source}/${encodeURIComponent(objectID)}/${contentHash}`;
}
export function projection(
  source: EvidenceSource,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const fields = PROJECTIONS[source];
  return Object.fromEntries(
    fields.filter((field) => Object.hasOwn(raw, field)).map((field) => [field, raw[field]]),
  );
}
function watchFeatureStatus(
  record: Record<string, unknown>,
  filters: readonly EffectiveFilter[],
): 'match' | 'unknown' | 'conflict' {
  for (const filter of filters) {
    if (
      filter.field !== 'Catalog_WatchPrimaryDialPrimaryColor' &&
      filter.field !== 'Catalog_WatchBandType' &&
      filter.field !== 'Catalog_BandMaterialInformation.WatchBandMaterialName'
    )
      continue;
    const values =
      filter.field === 'Catalog_BandMaterialInformation.WatchBandMaterialName'
        ? Array.isArray(record.Catalog_BandMaterialInformation)
          ? record.Catalog_BandMaterialInformation.flatMap((entry) =>
              entry &&
              typeof entry === 'object' &&
              typeof (entry as Record<string, unknown>).WatchBandMaterialName === 'string'
                ? [(entry as Record<string, string>).WatchBandMaterialName]
                : [],
            )
          : []
        : typeof record[filter.field] === 'string'
          ? [record[filter.field] as string]
          : [];
    if (!values.length) return 'unknown';
    if (filter.operator === 'in') {
      if (!values.some((value) => filter.value.includes(value))) return 'conflict';
    } else if (filter.operator === 'eq') {
      if (!values.includes(String(filter.value))) return 'conflict';
    } else return 'unknown';
  }
  return 'match';
}
/** Per-record audience exclusion (Craig-feedback Task 02, red test first).
 * The compiled Catalog_Gender requirement is the authoritative gate, but the
 * exact failure Craig saw was records staged despite their recorded audience,
 * so every returned record is verified against the accepted scope itself:
 * - a record with no readable Catalog_Gender is 'unknown' and never staged as
 *   a match (a missing gender never invents one);
 * - a record whose gender is not among the accepted values is 'conflict';
 * - defense in depth: a record whose own Catalog_TargetConsumer names no
 *   audience compatible with the accepted scope is a 'conflict' even if its
 *   Gender value matched (the mislabel case). Missing TargetConsumer never
 *   rejects: the authoritative field decides. See AUDIENCE_CONSUMER_CHECK in
 *   catalogueFactContract for the verified field roles. */
function audienceStatus(
  record: Record<string, unknown>,
  filters: readonly EffectiveFilter[],
): 'match' | 'unknown' | 'conflict' {
  for (const filter of filters) {
    if (filter.field !== PRODUCT_AUDIENCE_ATTRIBUTE) continue;
    if (filter.operator !== 'in' && filter.operator !== 'eq') continue;
    const accepted = filter.operator === 'in' ? filter.value : [String(filter.value)];
    const gender = typeof record.Catalog_Gender === 'string' ? [record.Catalog_Gender] : [];
    if (!gender.length) return 'unknown';
    if (!gender.some((value) => accepted.includes(value))) return 'conflict';
    const consumers = Array.isArray(record.Catalog_TargetConsumer)
      ? record.Catalog_TargetConsumer.filter((value): value is string => typeof value === 'string')
      : [];
    if (consumers.length) {
      const compatible = accepted.flatMap((value) => AUDIENCE_CONSUMER_CHECK[value] ?? []);
      if (compatible.length && !consumers.some((value) => compatible.includes(value)))
        return 'conflict';
    }
  }
  return 'match';
}
function missionProductTypes(state: BriefStateV3): string[] {
  const fact = state.facts.find(
    (f) =>
      f.status === 'active' &&
      f.field === 'product_type' &&
      f.scope.kind === 'mission' &&
      f.strength === 'requirement' &&
      f.certainty === 'explicit' &&
      f.value.kind === 'facet' &&
      f.value.attribute === 'Catalog_ProductType' &&
      f.value.operator === 'any',
  );
  return fact?.value.kind === 'facet' ? fact.value.values : [];
}
function targetAllowed(state: BriefStateV3, itemKey: string, productType: string): boolean {
  return (
    state.facts.some(
      (f) =>
        f.status === 'active' &&
        f.scope.kind === 'item' &&
        f.scope.key === itemKey &&
        f.strength === 'requirement' &&
        f.certainty === 'explicit' &&
        f.field === 'product_type' &&
        f.value.kind === 'facet' &&
        f.value.attribute === 'Catalog_ProductType' &&
        f.value.operator === 'any' &&
        f.value.values.includes(productType),
    ) ||
    (itemKey === productType && missionProductTypes(state).includes(productType))
  );
}
function hasAmbiguousItemScope(state: BriefStateV3, itemKey: string): boolean {
  const foldedTarget = itemKey.normalize('NFKC').toLowerCase();
  const matchingKeys = new Set(
    state.facts.flatMap((fact) =>
      (fact.status === 'active' || fact.status === 'tentative') &&
      fact.scope.kind === 'item' &&
      fact.scope.key?.normalize('NFKC').toLowerCase() === foldedTarget
        ? [fact.scope.key]
        : [],
    ),
  );
  return matchingKeys.size > 1;
}
function compile(
  state: BriefStateV3,
  target: { itemKey: string; productType: string } | null,
  vocabulary?: CatalogVocabularySnapshot,
): {
  filters: EffectiveFilter[];
  unresolved: Array<{ field: string; reason: string }>;
  material: MaterialRequirement[];
  fit: Array<{ field: 'fit'; expectedInches: number; ringSize?: string; factId: string }>;
  unavailable: UnavailableRequirement[];
} {
  const filters: EffectiveFilter[] = [];
  const unresolved: Array<{ field: string; reason: string }> = [];
  const material: MaterialRequirement[] = [];
  const fit: Array<{ field: 'fit'; expectedInches: number; ringSize?: string; factId: string }> =
    [];
  const unavailable: UnavailableRequirement[] = [];
  const missionTypes = missionProductTypes(state);
  // Live-vocabulary validation: a requested product type that does not exist in
  // today's catalogue is not an unsafe filter — it is a disclosure candidate.
  // Only values that exist become filters; the missing ones ride out as
  // unavailableRequirements for the agent's conversation.
  const liveMissionTypes =
    vocabulary && missionTypes.length
      ? missionTypes.filter((value) => {
          const exists = vocabulary.hasValue('Catalog_ProductType', value);
          if (!exists)
            unavailable.push({
              field: 'product_type',
              attribute: 'Catalog_ProductType',
              requested: [value],
              availableValues: vocabulary.availableValues('Catalog_ProductType'),
            });
          return exists;
        })
      : missionTypes;
  const isWatch =
    (target?.productType ?? (liveMissionTypes.length === 1 ? liveMissionTypes[0] : '')) ===
    'Wrist Watch';
  if (target) {
    if (vocabulary && !vocabulary.hasValue('Catalog_ProductType', target.productType))
      unavailable.push({
        field: 'target',
        attribute: 'Catalog_ProductType',
        requested: [target.productType],
        availableValues: vocabulary.availableValues('Catalog_ProductType'),
      });
    else filters.push({ field: 'Catalog_ProductType', operator: 'eq', value: target.productType });
  } else {
    if (liveMissionTypes.length === 1)
      filters.push({ field: 'Catalog_ProductType', operator: 'eq', value: liveMissionTypes[0] });
  }
  for (const f of state.facts) {
    if (
      f.field === 'recipient' ||
      f.field === 'occasion' ||
      f.field === 'design' ||
      f.field === 'style' ||
      f.field === 'item_reference'
    )
      continue;
    if (
      f.status !== 'active' ||
      f.strength !== 'requirement' ||
      f.certainty !== 'explicit' ||
      f.scope.kind === 'recipient' ||
      f.scope.kind === 'component'
    ) {
      if (
        f.strength === 'requirement' &&
        f.certainty === 'explicit' &&
        (f.scope.kind === 'recipient' || f.scope.kind === 'component')
      )
        unresolved.push({
          field: f.field,
          reason: 'Recipient or component scope is not provably bound to this item target',
        });
      continue;
    }
    if (f.scope.kind === 'item' && !target) {
      unresolved.push({
        field: f.field,
        reason: 'Item-scoped hard requirement needs an explicit item target',
      });
      continue;
    }
    if (f.scope.kind === 'item' && f.scope.key !== target?.itemKey) continue;
    if (f.field === 'product_type') {
      if (
        !target &&
        f.scope.kind === 'mission' &&
        f.value.kind === 'facet' &&
        f.value.values.length > 1
      )
        unresolved.push({
          field: f.field,
          reason: 'Multi-type product discovery needs an explicit target',
        });
      continue;
    }
    if (f.value.kind === 'money') {
      if (
        f.value.currency !== 'USD' ||
        f.value.basis === 'unresolved' ||
        f.value.operator === 'around'
      ) {
        unresolved.push({ field: f.field, reason: 'Only exact USD numeric bounds are supported' });
        continue;
      }
      filters.push({
        field: 'Pricing_ActivePrice',
        operator: f.value.operator,
        value: f.value.cents / 100,
      });
      continue;
    }
    if (f.field === 'watch_band_material') {
      if (!isWatch || f.value.kind !== 'watch_band_family' || f.value.family !== 'metal')
        unresolved.push({
          field: f.field,
          reason: 'Watch band material family is not supported for this target',
        });
      else if (vocabulary) {
        // Live truth: expand the family into whatever band-metal names the
        // catalogue actually carries today. Empty live list = attribute not
        // filterable any more — an honest structural failure, never a guess.
        const live = vocabulary.availableValues(
          'Catalog_BandMaterialInformation.WatchBandMaterialName',
        );
        if (live.length)
          filters.push({
            field: 'Catalog_BandMaterialInformation.WatchBandMaterialName',
            operator: 'in',
            value: live,
          });
        else
          unresolved.push({
            field: f.field,
            reason: 'Watch band material attribute is not filterable in the live catalogue',
          });
      } else
        filters.push({
          field: 'Catalog_BandMaterialInformation.WatchBandMaterialName',
          operator: 'in',
          value: [...METAL_WATCH_BAND_MATERIALS],
        });
      continue;
    }
    if (f.field === 'watch_dial_color' || f.field === 'watch_band_type') {
      const expected = SUPPORTED_FACET_ATTRIBUTES[f.field];
      if (
        !isWatch ||
        f.value.kind !== 'facet' ||
        f.value.attribute !== expected ||
        f.value.operator !== 'any' ||
        f.value.values.length !== 1
      )
        unresolved.push({
          field: f.field,
          reason: 'Watch feature is not an exact supported catalogue value',
        });
      else if (vocabulary && !vocabulary.hasValue(expected, f.value.values[0]))
        unavailable.push({
          field: f.field,
          attribute: expected,
          requested: [f.value.values[0]],
          availableValues: vocabulary.availableValues(expected),
        });
      else filters.push({ field: expected, operator: 'eq', value: f.value.values[0] });
      continue;
    }
    // Explicit product-audience scope (Craig-feedback Task 02, red tests
    // first): one OR group over the accepted Catalog_Gender values, every one
    // a live-verified value. The live vocabulary decides what exists —
    // without it this path stays closed (no frozen gender list), and a value
    // the catalogue does not carry is disclosed, never silently matched.
    // Catalog_TargetConsumer is deliberately NOT compiled as a second filter:
    // unisex records legitimately target both audiences, so the second field
    // is enforced per record by audienceStatus instead.
    if (f.field === 'product_audience') {
      if (
        f.value.kind !== 'facet' ||
        f.value.attribute !== PRODUCT_AUDIENCE_ATTRIBUTE ||
        f.value.operator !== 'any' ||
        f.value.values.length === 0
      ) {
        unresolved.push({
          field: f.field,
          reason: 'Audience scope is not an exact supported catalogue encoding',
        });
        continue;
      }
      if (!vocabulary) {
        unresolved.push({
          field: f.field,
          reason: 'Audience scope needs the live catalogue vocabulary',
        });
        continue;
      }
      const missing = f.value.values.filter(
        (value) => !vocabulary.hasValue(PRODUCT_AUDIENCE_ATTRIBUTE, value),
      );
      if (missing.length) {
        unavailable.push({
          field: f.field,
          attribute: PRODUCT_AUDIENCE_ATTRIBUTE,
          requested: missing,
          availableValues: vocabulary.availableValues(PRODUCT_AUDIENCE_ATTRIBUTE),
        });
        continue;
      }
      filters.push({
        field: PRODUCT_AUDIENCE_ATTRIBUTE,
        operator: 'in',
        value: [...f.value.values],
      });
      continue;
    }
    // Earring backing type (backing-type lane, verified live 2026-10-14, red
    // tests first): one OR group over the accepted Catalog_BackingType values,
    // every one a live-verified value. The strength law: an explicit backing
    // requirement compiles ONLY when the accepted product direction includes
    // earrings (an Earrings item target, or a mission product_type fact that
    // includes Earrings). Against a necklace, another product type, or an
    // unstated direction the fact stays conversation context — no filter, no
    // failure noise, never compiled against jewellery it does not describe.
    // Without the live vocabulary the path stays closed (no frozen backing
    // list), and a value the catalogue does not carry is disclosed through the
    // requirement_unavailable path, never silently broadened.
    if (f.field === 'earring_backing') {
      const earringsDirected =
        target?.productType === 'Earrings' ||
        (!target && liveMissionTypes.includes('Earrings'));
      if (!earringsDirected) continue;
      if (
        f.value.kind !== 'facet' ||
        f.value.attribute !== SUPPORTED_FACET_ATTRIBUTES.earring_backing ||
        f.value.operator !== 'any' ||
        f.value.values.length === 0
      ) {
        unresolved.push({
          field: f.field,
          reason: 'Earring backing is not an exact supported catalogue encoding',
        });
        continue;
      }
      if (!vocabulary) {
        unresolved.push({
          field: f.field,
          reason: 'Earring backing needs the live catalogue vocabulary',
        });
        continue;
      }
      const missing = f.value.values.filter(
        (value) => !vocabulary.hasValue(SUPPORTED_FACET_ATTRIBUTES.earring_backing, value),
      );
      if (missing.length) {
        unavailable.push({
          field: f.field,
          attribute: SUPPORTED_FACET_ATTRIBUTES.earring_backing,
          requested: missing,
          availableValues: vocabulary.availableValues(
            SUPPORTED_FACET_ATTRIBUTES.earring_backing,
          ),
        });
        continue;
      }
      filters.push({
        field: SUPPORTED_FACET_ATTRIBUTES.earring_backing,
        operator: 'in',
        value: [...f.value.values],
      });
      continue;
    }
    if (f.value.kind === 'material_alternatives') {
      material.push({ alternatives: f.value.alternatives, factId: f.id });
      continue;
    }
    if (
      f.field === 'material' ||
      MATERIAL_FIELDS.has(f.value.kind === 'facet' ? f.value.attribute : '') ||
      (f.field === 'exclusion' &&
        f.value.kind === 'facet' &&
        MATERIAL_ATTRIBUTE_PATHS.has(f.value.attribute))
    ) {
      // Defense in depth: an exclusion fact with any non-none operator must
      // never silently compile as an inclusion. The writer gate already
      // rejects it; the compiler rejects it independently (independent review
      // of the C4 repair, finding d).
      if (f.field === 'exclusion' && f.value.kind === 'facet' && f.value.operator !== 'none') {
        unresolved.push({
          field: f.field,
          reason: 'Exclusion facts on material attributes require operator none',
        });
        continue;
      }
      if (f.value.kind === 'facet' && MATERIAL_ATTRIBUTE_PATHS.has(f.value.attribute)) {
        material.push({
          attribute: f.value.attribute.split('.').at(-1) as
            'MaterialType' | 'MaterialColor' | 'MaterialPurity',
          values: f.value.values,
          exclude: f.value.operator === 'none',
          factId: f.id,
        });
      } else
        unresolved.push({
          field: f.field,
          reason:
            'Material/component correlation is not safely established by independent top-level facets',
        });
      continue;
    }
    // Fit measurement branch (STAGE3-FIT-COMPILER-REPAIR-PLAN-2026-10-07,
    // red tests first; ring_us added with the live-vocabulary change, probe-
    // confirmed 2026-10-08). A typed measurement fit compiles as a POST-search
    // verification against the returned record's own
    // Inventory_AvailableSkuSizeNames vocabulary, never as an Algolia filter
    // and never by inventing a size string. Lengths: in directly, cm and mm
    // by the recorded rule 1 in = 2.54 cm exactly, Necklace targets only.
    // Ring sizes: unit ring_us, Ring targets only, matched against the
    // catalogue's own 'Size N' strings; ring_uk and unknown stay out of scope;
    // a mission-scoped fit without an item target stays unresolved.
    if (f.field === 'fit' && f.value.kind === 'measurement') {
      const measurement = f.value;
      if (measurement.unit === 'ring_us') {
        if (!target) {
          unresolved.push({
            field: f.field,
            reason:
              'Fit requires an explicit item target; mission-scoped fit stays unresolved until the exact item is named',
          });
          continue;
        }
        if (target.productType !== 'Ring') {
          unresolved.push({
            field: f.field,
            reason: `Fit mapping ring_us is not configured for product type '${target.productType}'`,
          });
          continue;
        }
        const sizeValue = `Size ${
          Number.isInteger(measurement.value) ? measurement.value : String(measurement.value)
        }`;
        if (vocabulary && !vocabulary.hasValue('Inventory_AvailableSkuSizeNames', sizeValue)) {
          unavailable.push({
            field: f.field,
            attribute: 'Inventory_AvailableSkuSizeNames',
            requested: [sizeValue],
            availableValues: vocabulary.availableValues('Inventory_AvailableSkuSizeNames'),
          });
          continue;
        }
        fit.push({ field: 'fit', expectedInches: Number.NaN, ringSize: sizeValue, factId: f.id });
        continue;
      }
      if (measurement.unit !== 'in' && measurement.unit !== 'cm' && measurement.unit !== 'mm') {
        unresolved.push({
          field: f.field,
          reason: `Fit unit '${measurement.unit}' is not supported by the size mapping`,
        });
        continue;
      }
      if (!target) {
        unresolved.push({
          field: f.field,
          reason:
            'Fit requires an explicit item target; mission-scoped fit stays unresolved until the exact item is named',
        });
        continue;
      }
      if (target.productType !== 'Necklace') {
        unresolved.push({
          field: f.field,
          reason: `Fit mapping is not configured for product type '${target.productType}'`,
        });
        continue;
      }
      const expectedInches =
        measurement.unit === 'in'
          ? measurement.value
          : measurement.unit === 'cm'
            ? measurement.value / 2.54
            : measurement.value / 25.4;
      fit.push({ field: 'fit', expectedInches, factId: f.id });
      continue;
    }
    if (
      f.value.kind !== 'facet' ||
      !(vocabulary
        ? vocabulary.isFilterable(f.value.attribute)
        : PRODUCT_FIELDS.has(f.value.attribute))
    ) {
      unresolved.push({
        field: f.field,
        reason: 'Constraint is not in the approved exact catalogue vocabulary',
      });
      continue;
    }
    const attribute = f.value.attribute;
    if (f.value.operator === 'none')
      // Excluding a value that no longer exists in the catalogue is trivially
      // satisfied — no live-vocabulary check needed, the filter is safe.
      filters.push(
        ...f.value.values.map((value) => ({
          field: attribute,
          operator: 'neq' as const,
          value,
        })),
      );
    else if (f.value.operator === 'any' && f.value.values.length === 1) {
      if (vocabulary && !vocabulary.hasValue(attribute, f.value.values[0]))
        unavailable.push({
          field: f.field,
          attribute,
          requested: [f.value.values[0]],
          availableValues: vocabulary.availableValues(attribute),
        });
      else filters.push({ field: f.value.attribute, operator: 'eq', value: f.value.values[0] });
    } else if (f.value.operator === 'any' && (f.field === 'pearl' || f.field === 'gemstone')) {
      // Multi-value pearl and gemstone requirements ride the full live
      // vocabulary as one OR group (pearl: Craig-feedback Task 01; gemstone
      // parity from the 2026-10-13 ground-truth audit F5). Every value the
      // writer accepted is an exact value the index carries today. Without a
      // live vocabulary this path stays closed — a frozen copy of the value
      // list is exactly what the runtime-vocabulary law forbids.
      if (!vocabulary)
        unresolved.push({
          field: f.field,
          reason: 'Multi-value selection needs the live catalogue vocabulary',
        });
      else {
        const missing = f.value.values.filter((value) => !vocabulary.hasValue(attribute, value));
        if (missing.length)
          unavailable.push({
            field: f.field,
            attribute,
            requested: missing,
            availableValues: vocabulary.availableValues(attribute),
          });
        else filters.push({ field: attribute, operator: 'in', value: [...f.value.values] });
      }
    } else
      unresolved.push({
        field: f.field,
        reason: 'Only exact single-value facet comparisons are supported',
      });
  }
  return { filters, unresolved, material, fit, unavailable };
}
export function createEvidenceRetriever(options: EvidenceRetrieverOptions) {
  const now = options.now ?? (() => new Date().toISOString());
  /** A shopper-facing Discovery request is purchase-oriented: in-stock is a hard
   * requirement. Pre-owned pieces are excluded unless the accepted brief states
   * a condition preference that supports them; when both qualify, first-quality
   * candidates are ordered first. */
  function styleEligibility(
    record: Record<string, unknown>,
    preOwnedSupported: boolean,
  ): string | null {
    if (record.Inventory_InStock !== true) return 'out_of_stock';
    const condition = typeof record.Catalog_Condition === 'string' ? record.Catalog_Condition : '';
    return /pre.?owned/i.test(condition) && !preOwnedSupported ? 'pre_owned_not_requested' : null;
  }
  function briefSupportsPreOwned(state: BriefStateV3): boolean {
    return state.facts.some(
      (fact) =>
        fact.status === 'active' &&
        fact.field === 'condition' &&
        fact.certainty === 'explicit' &&
        (fact.strength === 'requirement' || fact.strength === 'preference') &&
        ((fact.value.kind === 'facet' &&
          fact.value.values.some((value) => /pre.?owned/i.test(value))) ||
          (fact.value.kind === 'text' && /pre.?owned/i.test(fact.value.text))),
    );
  }
  return async function retrieveEvidence(raw: unknown): Promise<RetrieveEvidenceResult> {
    let input: RetrieveEvidenceInput;
    try {
      input = retrieveEvidenceInputSchema.parse(raw) as RetrieveEvidenceInput;
    } catch {
      const candidate = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
      return {
        status: 'invalid_input',
        source:
          candidate.source === 'blog'
            ? 'blog'
            : candidate.source === 'help'
              ? 'help'
              : 'prod_catalog',
        missionId: typeof candidate.missionId === 'string' ? candidate.missionId : '',
        revision: 0,
        turnId: typeof candidate.turnId === 'string' ? candidate.turnId : '',
        expectedRevision:
          typeof candidate.expectedRevision === 'number' ? candidate.expectedRevision : 0,
        effectiveFilters: [],
        unresolved: [],
        records: [],
        error: { code: 'INVALID_INPUT', message: 'Evidence request failed strict validation' },
      };
    }
    let state: BriefStateV3;
    try {
      state = briefStateV3Schema.parse(await options.currentState(input.missionId));
    } catch {
      return makeResult(input, input.expectedRevision, 'upstream_failure', [], [], [], {
        code: 'STATE_UNAVAILABLE',
        message: 'Current mission state could not be resolved',
      });
    }
    if (state.missionId !== input.missionId || state.revision !== input.expectedRevision)
      return makeResult(input, state.revision, 'stale_revision', [], [], [], {
        code: 'STALE_REVISION',
        message: 'Evidence request revision is no longer current',
      });
    if (
      input.source === 'prod_catalog' &&
      input.target !== null &&
      hasAmbiguousItemScope(state, input.target.itemKey)
    )
      return makeResult(
        input,
        state.revision,
        'unsupported_constraint',
        [],
        [{ field: 'target', reason: 'Accepted item scopes differ only by case' }],
        [],
        {
          code: 'ITEM_SCOPE_KEY_COLLISION',
          message: 'Item target is ambiguous in the accepted brief',
        },
      );
    if (
      input.source === 'prod_catalog' &&
      input.target !== null &&
      !targetAllowed(state, input.target.itemKey, input.target.productType)
    )
      return makeResult(
        input,
        state.revision,
        'unsupported_constraint',
        [],
        [
          {
            field: 'target',
            reason: 'Target is not an accepted item scope or mission product type',
          },
        ],
        [],
        { code: 'TARGET_MISMATCH', message: 'Product target is not bound to the accepted brief' },
      );
    const vocabularySnapshot: CatalogVocabularySnapshot | undefined =
      input.source === 'prod_catalog' && options.vocabulary
        ? await options.vocabulary.get().catch((error: unknown) => {
            // Fail open: the vocabulary scan is validation, not availability.
            // A transient scan failure must not take search down — fall back to
            // the legacy constants, loudly.
            console.error('jtv_catalog_vocabulary_unavailable', {
              error: error instanceof Error ? error.message : String(error),
            });
            return undefined;
          })
        : undefined;
    const compiled =
      input.source === 'blog' || input.source === 'help'
        ? { filters: [], unresolved: [], material: [], fit: [], unavailable: [] }
        : compile(
            state,
            input.target
              ? { itemKey: input.target.itemKey, productType: input.target.productType }
              : null,
            vocabularySnapshot,
          );
    if (compiled.unavailable.length)
      // Disclosure model: a requirement the live catalogue cannot satisfy is
      // conversation data for the agent, never a silent block and never a
      // silent substitution. The agent discloses what exists and asks.
      return makeResult(
        input,
        state.revision,
        'requirement_unavailable',
        compiled.filters,
        [],
        [],
        {
          code: 'REQUIREMENT_UNAVAILABLE',
          message: 'One or more stated requirements are not available in the catalogue',
        },
        compiled.unavailable,
      );
    if (compiled.unresolved.length) {
      // Classify, not veto (Arijit directive, 2026-10-14; sister-fix diagnosis
      // .checkpoint/runs/sister-fix-retrieval-2026-10-14): one accepted fact
      // the compiler cannot turn into a safe filter must never zero a search
      // that has a compilable basis. When at least one filter compiled, or the
      // assistant supplied a query, or an exact-ID lookup was requested, or a
      // post-search verification requirement (material, fit) compiled, the
      // search proceeds on the compilable subset and the un-compilable facts
      // ride out as structured unresolved entries for the agent to disclose.
      // unsupported_constraint is reserved for a brief where nothing at all is
      // searchable. The requirement_unavailable path above is unchanged.
      const hasSearchBasis =
        compiled.filters.length > 0 ||
        input.query.trim().length > 0 ||
        Boolean(input.exactObjectIDs?.length) ||
        compiled.material.length > 0 ||
        compiled.fit.length > 0;
      if (!hasSearchBasis)
        return makeResult(
          input,
          state.revision,
          'unsupported_constraint',
          compiled.filters,
          compiled.unresolved,
          [],
          {
            code: 'UNSUPPORTED_CONSTRAINT',
            message: 'One or more accepted constraints could not be compiled safely',
          },
        );
    }
    const wantOverview = input.source === 'prod_catalog' && input.styleOverview === true;
    const styleBatches =
      input.source === 'prod_catalog' && input.styleBatches?.length ? input.styleBatches : null;
    if (wantOverview || styleBatches) {
      const controller = new AbortController();
      const parentAbort = () => controller.abort();
      if (options.signal?.aborted)
        return makeResult(input, state.revision, 'aborted', compiled.filters, [], [], {
          code: 'ABORTED',
          message: 'Evidence retrieval was cancelled',
        });
      options.signal?.addEventListener('abort', parentAbort, { once: true });
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, options.timeoutMs ?? 15000);
      const mapError = (error: unknown) => {
        const status =
          error &&
          typeof error === 'object' &&
          'status' in error &&
          Number.isInteger((error as { status?: unknown }).status)
            ? Number((error as { status: number }).status)
            : undefined;
        const upstreamStatus =
          status !== undefined && status >= 400 && status <= 599 ? status : undefined;
        return {
          status: (timedOut
            ? 'timeout'
            : options.signal?.aborted
              ? 'aborted'
              : 'upstream_failure') as RetrievalStatus,
          error: {
            code: timedOut
              ? 'TIMEOUT'
              : options.signal?.aborted
                ? 'ABORTED'
                : upstreamStatus
                  ? `UPSTREAM_HTTP_${upstreamStatus}`
                  : 'UPSTREAM_FAILURE',
            message: timedOut
              ? 'Evidence retrieval timed out'
              : options.signal?.aborted
                ? 'Evidence retrieval was cancelled'
                : upstreamStatus
                  ? 'Evidence source returned an upstream HTTP error'
                  : 'Evidence source failed',
            ...(upstreamStatus ? { upstreamStatus } : {}),
          },
        };
      };
      try {
        // A timeout or an upstream failure is never reported as "no inventory":
        // the structured status travels to the agent so it can be honest with
        // the shopper instead of reading an error as an empty catalogue.
        if (wantOverview) {
          if (!options.facetSearch)
            return makeResult(input, state.revision, 'upstream_failure', compiled.filters, [], [], {
              code: 'FACET_SEARCH_UNAVAILABLE',
              message: 'Style overview is not available in this deployment',
            });
          const attributes =
            vocabularySnapshot && Object.keys(vocabularySnapshot.values).length
              ? CATALOGUE_GROUP_BASIS_ATTRIBUTES.filter((attribute) =>
                  vocabularySnapshot.isFilterable(attribute),
                )
              : [...CATALOGUE_GROUP_BASIS_ATTRIBUTES];
          if (!attributes.length)
            return makeResult(
              input,
              state.revision,
              'unsupported_constraint',
              compiled.filters,
              [],
              [],
              {
                code: 'NO_STYLE_ATTRIBUTES',
                message: 'No style attributes are filterable in the live catalogue',
              },
            );
          const counts = await options.facetSearch({
            source: input.source,
            // The overview answers "which style families exist under the
            // accepted brief filters", so facet counts are scoped by the
            // compiled filters only. The conversational query text must not
            // restrict the counts: it carries recipient and phrasing words
            // ("for a younger sister") that text-match nothing and would
            // zero every column, which reads to the agent as an empty
            // catalogue. Record retrieval (the batched branch below) keeps
            // the query for ranking and backfills when it matches nothing.
            query: '',
            filters: compiled.filters,
            facets: attributes,
            signal: controller.signal,
          });
          if (options.signal?.aborted)
            return makeResult(input, state.revision, 'aborted', compiled.filters, [], [], {
              code: 'ABORTED',
              message: 'Evidence retrieval was cancelled',
            });
          const styleOverview: StyleOverviewColumn[] = attributes.map((attribute) => ({
            attribute,
            values: Object.entries(counts[attribute] ?? {})
              .map(([value, count]) => ({ value, count }))
              .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
          }));
          return makeResult(
            input,
            state.revision,
            'ok',
            compiled.filters,
            compiled.unresolved,
            [],
            undefined,
            undefined,
            { styleOverview },
          );
        }
        // Batched style-direction search: one request per chosen style value,
        // each with the brief's compiled hard filters plus the style facet, up
        // to 12 candidates per style, one bounded broad-query backfill for a
        // deficient style. Eligibility is verified per record; counts never
        // claim more than verified records.
        const styleResults: StyleBatchResult[] = [];
        const styleUnavailable: UnavailableRequirement[] = [];
        const records: EvidenceRecord[] = [];
        const seenIds = new Set<string>();
        const seenSignatures = new Set<string>();
        const preOwnedSupported = briefSupportsPreOwned(state);
        // 24 candidates per style: per-record verification (stock, condition,
        // material, fit) can only keep what the search returned, and a small
        // candidate pool starves verification when the catalogue's natural
        // order is homogeneous (measured 2026-10-13: a 12-deep all-silver ring
        // pool kept zero gold pieces though the index holds thousands).
        const candidateCap = 24;
        for (const batch of styleBatches!) {
          if (vocabularySnapshot && !vocabularySnapshot.isFilterable(batch.attribute)) {
            styleResults.push({
              attribute: batch.attribute,
              value: batch.value,
              requestedCount: input.count,
              eligibleCount: 0,
              rejected: [{ objectID: '', reason: 'style_attribute_not_filterable' }],
              backfillUsed: false,
            });
            continue;
          }
          // G2 hardening (ground-truth audit 2026-10-13): a style value the live
          // catalogue does not carry can never match; refuse it with the valid
          // options instead of burning a search that reads as an empty style.
          if (vocabularySnapshot && !vocabularySnapshot.hasValue(batch.attribute, batch.value)) {
            styleUnavailable.push({
              field: 'style_batches',
              attribute: batch.attribute,
              requested: [batch.value],
              availableValues: vocabularySnapshot.availableValues(batch.attribute).slice(0, 20),
            });
            styleResults.push({
              attribute: batch.attribute,
              value: batch.value,
              requestedCount: input.count,
              eligibleCount: 0,
              rejected: [{ objectID: '', reason: 'style_value_not_in_live_vocabulary' }],
              backfillUsed: false,
            });
            continue;
          }
          const filters: EffectiveFilter[] = [
            ...compiled.filters,
            { field: batch.attribute, operator: 'eq', value: batch.value },
          ];
          const rejected: Array<{ objectID: string; reason: string }> = [];
          let eligibleCount = 0;
          let backfillUsed = false;
          const accept = (rawHits: readonly Record<string, unknown>[]) => {
            for (const raw of rawHits) {
              if (eligibleCount >= input.count) return;
              const record = projection(input.source, raw);
              const objectID = typeof record.objectID === 'string' ? record.objectID : undefined;
              if (!objectID) {
                rejected.push({ objectID: '', reason: 'missing_object_id' });
                continue;
              }
              if (seenIds.has(objectID)) {
                rejected.push({ objectID, reason: 'duplicate_product' });
                continue;
              }
              const reason = styleEligibility(record, preOwnedSupported);
              if (reason) {
                rejected.push({ objectID, reason });
                continue;
              }
              const audienceCheck = audienceStatus(record, compiled.filters);
              if (audienceCheck === 'unknown') {
                rejected.push({ objectID, reason: 'audience_unknown' });
                continue;
              }
              if (audienceCheck === 'conflict') {
                rejected.push({ objectID, reason: 'audience_conflict' });
                continue;
              }
              const materialStatus = verifyMaterial(record, compiled.material);
              if (materialStatus === 'unknown') {
                rejected.push({ objectID, reason: 'material_unknown' });
                continue;
              }
              if (materialStatus === 'conflict') {
                rejected.push({ objectID, reason: 'material_conflict' });
                continue;
              }
              if (compiled.fit.length) {
                const sizes = record.Inventory_AvailableSkuSizeNames;
                const sizeStrings = Array.isArray(sizes)
                  ? sizes.filter((entry): entry is string => typeof entry === 'string')
                  : [];
                const parsedSizes = sizeStrings.map((entry) => Number.parseFloat(entry));
                const unmet = compiled.fit.filter((entry) => {
                  if (entry.ringSize !== undefined) return !sizeStrings.includes(entry.ringSize);
                  return !parsedSizes.some(
                    (parsed) =>
                      Number.isFinite(parsed) && Math.abs(parsed - entry.expectedInches) < 1e-9,
                  );
                });
                if (!Array.isArray(sizes) || sizes.length === 0) {
                  rejected.push({ objectID, reason: 'fit_unknown' });
                  continue;
                }
                if (unmet.length) {
                  rejected.push({ objectID, reason: 'fit_conflict' });
                  continue;
                }
              }
              const watchStatus = watchFeatureStatus(record, compiled.filters);
              if (watchStatus === 'unknown') {
                rejected.push({ objectID, reason: 'watch_feature_unknown' });
                continue;
              }
              if (watchStatus === 'conflict') {
                rejected.push({ objectID, reason: 'watch_feature_conflict' });
                continue;
              }
              const title = record.Catalog_TitleDescription,
                description = record.Catalog_LongDescription;
              if (
                typeof title === 'string' &&
                title.trim() &&
                typeof description === 'string' &&
                description.trim()
              ) {
                const signature = `${title.trim().toLocaleLowerCase()}\u0000${description.trim().toLocaleLowerCase()}`;
                if (seenSignatures.has(signature)) {
                  rejected.push({ objectID, reason: 'duplicate_variant' });
                  continue;
                }
                seenSignatures.add(signature);
              }
              seenIds.add(objectID);
              const contentHash = hashEvidenceRecord(record);
              records.push({
                source: input.source,
                objectID,
                contentHash,
                retrievedAt: now(),
                evidenceRef: evidenceRef(input.source, objectID, contentHash),
                record,
              });
              eligibleCount += 1;
            }
          };
          const firstHits = await options.search({
            source: input.source,
            // The assistant decides how to phrase the stockroom question; the
            // retrieval layer does not overrule it. The agent's query rides the
            // text search (attribute words like "yellow gold" match instantly),
            // and the bounded broad-query backfill below remains the safety net
            // when a phrasing matches nothing. The manager's checks (stock,
            // condition, material, fit) still verify every candidate after.
            query: input.query,
            count: candidateCap,
            exactObjectIDs: null,
            filters,
            signal: controller.signal,
          });
          accept(firstHits);
          if (eligibleCount < 2) {
            // One bounded backfill: broaden the query, keep every hard filter.
            backfillUsed = true;
            const backfillHits = await options.search({
              source: input.source,
              query: '',
              count: candidateCap,
              exactObjectIDs: null,
              filters,
              signal: controller.signal,
            });
            accept(backfillHits);
          }
          styleResults.push({
            attribute: batch.attribute,
            value: batch.value,
            requestedCount: input.count,
            eligibleCount,
            rejected: rejected.slice(0, 12),
            backfillUsed,
          });
        }
        if (options.signal?.aborted)
          return makeResult(input, state.revision, 'aborted', compiled.filters, [], [], {
            code: 'ABORTED',
            message: 'Evidence retrieval was cancelled',
          });
        try {
          state = briefStateV3Schema.parse(await options.currentState(input.missionId));
        } catch {
          return makeResult(input, state.revision, 'upstream_failure', compiled.filters, [], [], {
            code: 'STATE_UNAVAILABLE',
            message: 'Current mission state could not be resolved',
          });
        }
        if (state.missionId !== input.missionId || state.revision !== input.expectedRevision)
          return makeResult(input, state.revision, 'stale_revision', compiled.filters, [], [], {
            code: 'STALE_REVISION',
            message: 'Mission changed during evidence retrieval',
          });
        return makeResult(
          input,
          state.revision,
          records.length ? 'ok' : 'zero_hits',
          compiled.filters,
          compiled.unresolved,
          records.slice(0, 36),
          undefined,
          styleUnavailable.length ? styleUnavailable : undefined,
          { styleResults },
        );
      } catch (error) {
        const mapped = mapError(error);
        return makeResult(
          input,
          state.revision,
          mapped.status,
          compiled.filters,
          [],
          [],
          mapped.error,
        );
      } finally {
        clearTimeout(timeout);
        options.signal?.removeEventListener('abort', parentAbort);
      }
    }
    const controller = new AbortController();
    const parentAbort = () => controller.abort();
    if (options.signal?.aborted)
      return makeResult(input, state.revision, 'aborted', compiled.filters, [], [], {
        code: 'ABORTED',
        message: 'Evidence retrieval was cancelled',
      });
    options.signal?.addEventListener('abort', parentAbort, { once: true });
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, options.timeoutMs ?? 15000);
    const candidateCount = Math.min(36, input.count * 3);
    try {
      const hits = await options.search({
        source: input.source,
        query: input.query,
        count: input.exactObjectIDs?.length ?? candidateCount,
        exactObjectIDs: input.exactObjectIDs,
        filters: compiled.filters,
        signal: controller.signal,
      });
      if (options.signal?.aborted)
        return makeResult(input, state.revision, 'aborted', compiled.filters, [], [], {
          code: 'ABORTED',
          message: 'Evidence retrieval was cancelled',
        });
      try {
        state = briefStateV3Schema.parse(await options.currentState(input.missionId));
      } catch {
        return makeResult(input, state.revision, 'upstream_failure', compiled.filters, [], [], {
          code: 'STATE_UNAVAILABLE',
          message: 'Current mission state could not be resolved',
        });
      }
      if (options.signal?.aborted)
        return makeResult(input, state.revision, 'aborted', compiled.filters, [], [], {
          code: 'ABORTED',
          message: 'Evidence retrieval was cancelled',
        });
      if (state.missionId !== input.missionId || state.revision !== input.expectedRevision)
        return makeResult(input, state.revision, 'stale_revision', compiled.filters, [], [], {
          code: 'STALE_REVISION',
          message: 'Mission changed during evidence retrieval',
        });
      const retrievedAt = now();
      const incomplete: Array<{ field: string; reason: string }> = [];
      const materialUnknown: Array<{ field: string; reason: string }> = [];
      const audienceIssues: Array<{ field: string; reason: string }> = [];
      const watchUnknown: Array<{ field: string; reason: string }> = [];
      const fitUnknown: Array<{ field: string; reason: string }> = [];
      const exactIDs = input.exactObjectIDs ? new Set(input.exactObjectIDs) : null;
      const records = hits.flatMap((raw): EvidenceRecord[] => {
        if (exactIDs && (typeof raw.objectID !== 'string' || !exactIDs.has(raw.objectID)))
          return [];
        const record = projection(input.source, raw);
        const materialStatus =
          input.source === 'prod_catalog' ? verifyMaterial(record, compiled.material) : 'match';
        if (materialStatus === 'unknown') {
          materialUnknown.push({
            field: 'material',
            reason: 'Catalog_MaterialInformation is missing or incomplete',
          });
          return [];
        }
        if (materialStatus === 'conflict') return [];
        // Per-record audience exclusion (Craig Task 02): the same gate the
        // batched flow applies. A record whose audience is unreadable or
        // conflicts with the accepted scope is dropped with its reason, and
        // when nothing eligible remains the reasons surface as incomplete
        // evidence instead of reading as an empty catalogue.
        if (input.source === 'prod_catalog') {
          const audienceCheck = audienceStatus(record, compiled.filters);
          if (audienceCheck === 'unknown') {
            audienceIssues.push({
              field: 'audience',
              reason:
                'Audience evidence missing: Catalog_Gender is absent or unreadable on this record',
            });
            return [];
          }
          if (audienceCheck === 'conflict') {
            audienceIssues.push({
              field: 'audience',
              reason:
                'Audience conflict: this record does not satisfy the accepted product audience scope',
            });
            return [];
          }
        }
        // Fit verification (fail closed, ALL compiled fit expectations): the
        // returned record's own size vocabulary must contain every expected
        // measurement. A record without the size field, or without a matching
        // size for any compiled fit fact, is a verification failure, never a
        // silent pass (round-3 review P2: fit[0]-only was fail-open).
        if (input.source === 'prod_catalog' && compiled.fit.length) {
          const sizes = record.Inventory_AvailableSkuSizeNames;
          const sizeStrings = Array.isArray(sizes)
            ? sizes.filter((entry): entry is string => typeof entry === 'string')
            : [];
          const parsedSizes = sizeStrings.map((entry) => Number.parseFloat(entry));
          const unmet = compiled.fit.filter((entry) => {
            // Ring sizes are exact catalogue strings ('Size 6'), never parsed
            // numbers — a parsed match could confuse 6 with 6.5's prefix.
            if (entry.ringSize !== undefined) return !sizeStrings.includes(entry.ringSize);
            const match = parsedSizes.some(
              (parsed) => Number.isFinite(parsed) && Math.abs(parsed - entry.expectedInches) < 1e-9,
            );
            return !match;
          });
          if (!Array.isArray(sizes) || sizes.length === 0) {
            fitUnknown.push({
              field: 'fit',
              reason: `Required size evidence missing: Inventory_AvailableSkuSizeNames is absent or unreadable on this record (fact ${compiled.fit[0].factId})`,
            });
            return [];
          }
          if (unmet.length) {
            fitUnknown.push({
              field: 'fit',
              reason: `Required size evidence mismatch: record sizes ${JSON.stringify(sizes)} do not contain the expected size(s) ${unmet
                .map(
                  (entry) => entry.ringSize ?? Number(entry.expectedInches.toFixed(6)).toString(),
                )
                .join(', ')} (fact ${unmet[0].factId})`,
            });
            return [];
          }
        }
        if (input.source === 'prod_catalog') {
          const watchStatus = watchFeatureStatus(record, compiled.filters);
          if (watchStatus === 'unknown') {
            watchUnknown.push({
              field: 'watch_feature',
              reason: 'A required watch feature is missing from this product record',
            });
            return [];
          }
          if (watchStatus === 'conflict') return [];
        }
        if (input.source === 'blog' || input.source === 'help') {
          const required = input.source === 'blog' ? BLOG_REQUIRED : HELP_REQUIRED;
          const missing: string[] = required.filter(
            (field) => typeof record[field] !== 'string' || !record[field].trim(),
          );
          // Passage locator: blog records carry heading_path as a string;
          // help_content records carry it as an array of path segments.
          const hasPassageLocator =
            (typeof record.heading_path === 'string' && !!record.heading_path.trim()) ||
            (Array.isArray(record.heading_path) && record.heading_path.length > 0) ||
            (typeof record.scope_text === 'string' && !!record.scope_text.trim());
          if (!hasPassageLocator) missing.push('heading_path or scope_text');
          if (missing.length) {
            incomplete.push({
              field: input.source,
              reason: `Required evidence fields missing: ${missing.join(', ')}`,
            });
            return [];
          }
        }
        const id =
          typeof record.objectID === 'string'
            ? record.objectID
            : typeof record.article_id === 'string'
              ? record.article_id
              : undefined;
        if (!id) return [];
        const contentHash = hashEvidenceRecord(record);
        return [
          {
            source: input.source,
            objectID: id,
            contentHash,
            retrievedAt,
            evidenceRef: evidenceRef(input.source, id, contentHash),
            record,
          },
        ];
      });
      const returned = records.slice(0, input.count);
      if (
        (incomplete.length || audienceIssues.length || watchUnknown.length || fitUnknown.length) &&
        !returned.length
      )
        return makeResult(input, state.revision, 'incomplete_evidence', compiled.filters, [
          ...compiled.unresolved,
          ...incomplete,
          ...materialUnknown,
          ...audienceIssues,
          ...watchUnknown,
          ...fitUnknown,
        ]);
      return makeResult(
        input,
        state.revision,
        returned.length
          ? 'ok'
          : materialUnknown.length ||
              audienceIssues.length ||
              watchUnknown.length ||
              fitUnknown.length
            ? 'incomplete_evidence'
            : 'zero_hits',
        compiled.filters,
        [
          ...compiled.unresolved,
          ...incomplete,
          ...materialUnknown,
          ...audienceIssues,
          ...watchUnknown,
          ...fitUnknown,
        ],
        returned,
      );
    } catch (error) {
      const status =
        error &&
        typeof error === 'object' &&
        'status' in error &&
        Number.isInteger((error as { status?: unknown }).status)
          ? Number((error as { status: number }).status)
          : undefined;
      const upstreamStatus =
        status !== undefined && status >= 400 && status <= 599 ? status : undefined;
      return makeResult(
        input,
        state.revision,
        timedOut ? 'timeout' : options.signal?.aborted ? 'aborted' : 'upstream_failure',
        compiled.filters,
        [],
        [],
        {
          code: timedOut
            ? 'TIMEOUT'
            : options.signal?.aborted
              ? 'ABORTED'
              : upstreamStatus
                ? `UPSTREAM_HTTP_${upstreamStatus}`
                : 'UPSTREAM_FAILURE',
          message: timedOut
            ? 'Evidence retrieval timed out'
            : options.signal?.aborted
              ? 'Evidence retrieval was cancelled'
              : upstreamStatus
                ? 'Evidence source returned an upstream HTTP error'
                : 'Evidence source failed',
          ...(upstreamStatus ? { upstreamStatus } : {}),
        },
      );
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', parentAbort);
    }
  };
}
export function retrieveEvidence(raw: unknown, options: EvidenceRetrieverOptions) {
  return createEvidenceRetriever(options)(raw);
}
/** Read-only facet-count interrogation for the discovery style overview: a
 * regular query-level `facets` request, brief filters applied as facet/numeric
 * filters. No index settings are read or changed. */
export function createAlgoliaFacetSearch(options: {
  appId: string;
  searchOnlyApiKey: string;
  fetch?: typeof fetch;
}): EvidenceFacetSearch {
  if (!/^[A-Za-z0-9]+$/.test(options.appId) || !options.searchOnlyApiKey.trim())
    throw new Error('Search-only Algolia credentials are required');
  const request = options.fetch ?? fetch;
  const numericOperator: Record<string, string> = {
    lt: '<',
    lte: '<=',
    gt: '>',
    gte: '>=',
    eq: '=',
  };
  return async ({ source, query, filters, facets, signal }) => {
    const numeric = filters
      .filter((f) => f.field === 'Pricing_ActivePrice')
      .map((f) => `${f.field}${numericOperator[f.operator]}${f.value}`);
    const facetFilters = filters
      .filter((f) => f.field !== 'Pricing_ActivePrice')
      .map((f) =>
        f.operator === 'in'
          ? f.value.map((value) => `${f.field}:${value}`)
          : `${f.field}:${f.operator === 'neq' ? '-' : ''}${String(f.value)}`,
      );
    const params = new URLSearchParams({
      query,
      hitsPerPage: '0',
      attributesToRetrieve: JSON.stringify(['objectID']),
      facets: JSON.stringify([...facets]),
      analytics: 'false',
      clickAnalytics: 'false',
      ...(numeric.length ? { numericFilters: JSON.stringify(numeric) } : {}),
      ...(facetFilters.length ? { facetFilters: JSON.stringify(facetFilters) } : {}),
    });
    const response = await request(`https://${options.appId}.algolia.net/1/indexes/*/queries`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-algolia-application-id': options.appId,
        'x-algolia-api-key': options.searchOnlyApiKey,
      },
      body: JSON.stringify({
        requests: [{ indexName: INDEXES[source], params: params.toString() }],
      }),
      signal,
      redirect: 'error',
    });
    if (!response.ok) throw new UpstreamFacetHttpError(response.status);
    const payload = (await response.json()) as {
      results?: Array<{ facets?: Record<string, Record<string, number>> }>;
    };
    return payload.results?.[0]?.facets ?? {};
  };
}
class UpstreamFacetHttpError extends Error {
  constructor(readonly status: number) {
    super(`Algolia upstream HTTP ${status}`);
  }
}
export function createAlgoliaEvidenceSearch(options: {
  appId: string;
  searchOnlyApiKey: string;
  fetch?: typeof fetch;
}): EvidenceSearch {
  if (!/^[A-Za-z0-9]+$/.test(options.appId) || !options.searchOnlyApiKey.trim())
    throw new Error('Search-only Algolia credentials are required');
  const request = options.fetch ?? fetch;
  class UpstreamHttpError extends Error {
    constructor(readonly status: number) {
      super(`Algolia upstream HTTP ${status}`);
    }
  }
  const numericOperator: Record<string, string> = {
    lt: '<',
    lte: '<=',
    gt: '>',
    gte: '>=',
    eq: '=',
  };
  return async ({ source, query, count, exactObjectIDs = null, filters, signal }) => {
    if ((source === 'blog' || source === 'help') && exactObjectIDs !== null)
      throw new Error('Exact object lookup is only supported for prod_catalog');
    if (exactObjectIDs?.length) {
      const records = await Promise.all(
        exactObjectIDs.map(async (objectID) => {
          const params = new URLSearchParams({
            attributesToRetrieve: PROJECTIONS[source].join(','),
          });
          const response = await request(
            `https://${options.appId}-dsn.algolia.net/1/indexes/${encodeURIComponent(INDEXES[source])}/${encodeURIComponent(objectID)}?${params.toString()}`,
            {
              method: 'GET',
              headers: {
                'x-algolia-application-id': options.appId,
                'x-algolia-api-key': options.searchOnlyApiKey,
              },
              signal,
              redirect: 'error',
            },
          );
          if (response.status === 404) return null;
          if (!response.ok) throw new UpstreamHttpError(response.status);
          const record = (await response.json()) as Record<string, unknown>;
          return record.objectID === objectID ? record : null;
        }),
      );
      return records.filter((record): record is Record<string, unknown> => record !== null);
    }
    const numeric = filters
      .filter((f) => f.field === 'Pricing_ActivePrice')
      .map((f) => {
        if (f.operator === 'in') throw new Error('Unsupported numeric operator: in');
        const operator = numericOperator[f.operator];
        if (!operator) throw new Error(`Unsupported numeric operator: ${f.operator}`);
        return `${f.field}${operator}${f.value}`;
      });
    const facets = filters
      .filter((f) => f.field !== 'Pricing_ActivePrice')
      .map((f) =>
        f.operator === 'in'
          ? f.value.map((value) => `${f.field}:${value}`)
          : `${f.field}:${f.operator === 'neq' ? '-' : ''}${String(f.value)}`,
      );
    const params = new URLSearchParams({
      query,
      hitsPerPage: String(count),
      attributesToRetrieve: JSON.stringify(PROJECTIONS[source]),
      analytics: 'false',
      clickAnalytics: 'false',
      // Education passages are short, so one agent-crafted word absent from every
      // passage zeroes an otherwise well-aimed query (measured 2026-10-13:
      // "choosing chain necklace guide" -> 0 live blog hits; with allOptional it
      // returns 871 and well-matched queries keep identical hits, see
      // .checkpoint/runs/article-audience-2026-10-13/probe/f-mitigation-allOptional.json).
      // Query-level parameter only; the index setting stays untouched (read-only
      // boundary). prod_catalog keeps strict AND semantics.
      ...(source === 'prod_catalog' ? {} : { removeWordsIfNoResults: 'allOptional' }),
      ...(numeric.length ? { numericFilters: JSON.stringify(numeric) } : {}),
      ...(facets.length ? { facetFilters: JSON.stringify(facets) } : {}),
    });
    const response = await request(`https://${options.appId}.algolia.net/1/indexes/*/queries`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-algolia-application-id': options.appId,
        'x-algolia-api-key': options.searchOnlyApiKey,
      },
      body: JSON.stringify({
        requests: [{ indexName: INDEXES[source], params: params.toString() }],
      }),
      signal,
      redirect: 'error',
    });
    if (!response.ok) throw new UpstreamHttpError(response.status);
    const payload = (await response.json()) as {
      results?: Array<{ hits?: Record<string, unknown>[] }>;
    };
    return payload.results?.[0]?.hits ?? [];
  };
}
export { INDEXES };

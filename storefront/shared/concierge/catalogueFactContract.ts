export const SUPPORTED_FACET_ATTRIBUTES = {
  product_type: 'Catalog_ProductType',
  gemstone: 'Catalog_GemstoneInformation.GemstoneColorGroup',
  watch_dial_color: 'Catalog_WatchPrimaryDialPrimaryColor',
  watch_band_type: 'Catalog_WatchBandType',
  necklace_type: 'Catalog_NecklaceType',
} as const;
export const SUPPORTED_GEMSTONE_FACET_ATTRIBUTES = [
  SUPPORTED_FACET_ATTRIBUTES.gemstone,
  'Catalog_GemstoneInformationPrimary.GemstoneName',
] as const;
/** Pearl identity lives in the index's dedicated pearl attributes, never in a
 * gemstone name (Craig-feedback Task 01, verified live 2026-10-12: ten
 * PearlFullName facet values on both attributes). Primary = the piece's own
 * pearl; the un-suffixed attribute matches pearls anywhere in the record
 * (accents and sets). Values always come from the live vocabulary. */
export const SUPPORTED_PEARL_FACET_ATTRIBUTES = [
  'Catalog_PearlInformationPrimary.PearlFullName',
  'Catalog_PearlInformation.PearlFullName',
] as const;
export const WATCH_BAND_MATERIAL_FAMILIES = ['metal'] as const;
/** LEGACY fallback, used only when no live vocabulary reaches the compiler.
 * Delete alongside the no-vocabulary compiler path. */
export const METAL_WATCH_BAND_MATERIALS = [
  'Stainless Steel',
  'Titanium',
  'Sterling Silver',
  'Brass',
  'Aluminum',
  'Alloy',
  'Base Metal',
  '10K Gold',
  '14K Gold',
  '18K Gold Over Bronze',
] as const;
/** Catalog_MaterialInformation.MaterialColor is a nested, non-faceted attribute.
 * Its exclusion VALUES come from the live vocabulary
 * (Catalog_MaterialInformation.MaterialColor), never from a frozen copy. */
export const MATERIAL_COLOR_EXCLUSION_ATTRIBUTE =
  'Catalog_MaterialInformation.MaterialColor' as const;
export const EXCLUSION_MATERIAL_COLORS = [
  'Black',
  'Blue',
  'Brown',
  'Gray',
  'Green',
  'Multi-color',
  'No Color',
  'Orange',
  'Pink',
  'Purple',
  'Red',
  'Rose',
  'Tri-color',
  'Two-tone',
  'White',
  'Yellow',
] as const;

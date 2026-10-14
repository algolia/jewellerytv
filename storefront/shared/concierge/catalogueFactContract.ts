export const SUPPORTED_FACET_ATTRIBUTES = {
  product_type: 'Catalog_ProductType',
  gemstone: 'Catalog_GemstoneInformation.GemstoneColorGroup',
  watch_dial_color: 'Catalog_WatchPrimaryDialPrimaryColor',
  watch_band_type: 'Catalog_WatchBandType',
  necklace_type: 'Catalog_NecklaceType',
  product_audience: 'Catalog_Gender',
  /** Earring fastening type (backing-type lane, verified live 2026-10-14,
   * read-only probe in .checkpoint/runs/backing-type-2026-10-14/): the index's
   * dedicated fastening facet carries twenty live values (Clip-On, Fish Hook,
   * Leverback, Push Back, Screw Back, Omega, ...). Accepted values always come
   * from the live vocabulary, never from a frozen copy, and the compiler
   * applies the filter only when the accepted product direction includes
   * earrings, never against necklaces or other product types. */
  earring_backing: 'Catalog_BackingType',
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
/** Product-audience fields (Craig-feedback Task 02, verified live 2026-10-13,
 * read-only probe in .checkpoint/runs/mens-watch-2026-10-13/). The two
 * catalogue fields and their roles:
 *
 * - Catalog_Gender is the AUTHORITATIVE accepted-brief attribute and search
 *   filter. It is a filterable facet carrying exactly Female, Male, Unisex
 *   (wrist watches: Female 1192, Male 1758, Unisex 81). A shopper's explicit
 *   "men's" scope is encoded as the accepted Gender values, with Unisex
 *   INCLUDED (unisex pieces are marketed to both audiences; verified live:
 *   every Unisex record targets a male audience value too, e.g. 1ZPF6B
 *   targets Men and Women). A Female/Women-only record may never satisfy an
 *   explicit men's request.
 * - Catalog_TargetConsumer is the RECORD-LEVEL cross-check field only. It is
 *   also facetable (Men, Women, Boys, Girls) but must not be a second search
 *   filter: Unisex records legitimately target both audiences (1ZPF6B carries
 *   Men and Women), so AND-filtering it would wrongly exclude genuine men's
 *   matches. Instead, a returned record whose own targeting names no audience
 *   compatible with the accepted Gender scope contradicts the accepted brief
 *   and is excluded even though its Gender value matched. The map below is a
 *   naming map (our language mapping Gender value to consumer values), not a
 *   frozen value inventory; the consumer VALUES are validated live wherever a
 *   shopper-facing fact is written. Missing TargetConsumer never rejects:
 *   the authoritative field decides. Age narrowing (Boys versus Men) is
 *   deliberately not encoded here; that is a separate explicit decision. */
export const PRODUCT_AUDIENCE_ATTRIBUTE = 'Catalog_Gender' as const;
export const AUDIENCE_CONSUMER_CHECK: Record<string, readonly string[]> = {
  Male: ['Men', 'Boys'],
  Female: ['Women', 'Girls'],
};
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

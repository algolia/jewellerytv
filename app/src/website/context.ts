export interface PageContextState {
 selectedProductId?: string | null;
 selectedSize?: string | null;
 productHit?: ProductHit | null;
}

interface ProductHit {
 objectID: string;
 Product_Name?: string;
 Product_LongDescription?: string;
 Catalog_ProductCategoryDisplayName?: string;
 Material_Information?: string;
 Stone_Information?: string;
 Metal_Purity?: string;
 Pricing_SalePrice?: number;
 Pricing_DiscountPercent?: number;
 Jewelry_ApproximateLength?: string;
 Jewelry_ApproximateWeight?: string;
 [key: string]: unknown;
}

const bytes = (value: string) => new TextEncoder().encode(value).length;

/** Filter full product record to essential fields only */
function slimProduct(hit: ProductHit): Record<string, unknown> {
 return {
  objectID: hit.objectID,
  name: hit.Product_Name,
  description: hit.Product_LongDescription,
  category: hit.Catalog_ProductCategoryDisplayName,
  material: hit.Material_Information,
  stone: hit.Stone_Information,
  metal: hit.Metal_Purity,
  price: hit.Pricing_SalePrice,
  discount: hit.Pricing_DiscountPercent,
  length: hit.Jewelry_ApproximateLength,
  weight: hit.Jewelry_ApproximateWeight,
 };
}

/** Capture an immutable, bounded snapshot. Oversize constraints are an explicit error. */
export function buildContext(state: PageContextState): Record<string,string> {
 const result: Record<string,string> = {};
 const add = (key: string,value: string | undefined | null) => {
  if (!value) return;
  if(bytes(value)>1024) throw new Error(`Page context ${key} exceeds 1024 UTF-8 bytes. Reduce active constraints before sending.`);
  result[key]=value;
 };

 // Always include datetime and timezone
 add('currentDateTime', new Date().toISOString());
 add('userTimezone', Intl.DateTimeFormat().resolvedOptions().timeZone);

 // Include product details only when on PDP
 if(state.productHit) {
  add('product', JSON.stringify(slimProduct(state.productHit)));
 }

 if(Object.keys(result).length>32) throw new Error('Page context exceeds 32 fields.');
 // Counting the JSON envelope is deliberately stricter than summing value bytes alone.
 if(bytes(JSON.stringify(result))>4096) throw new Error('Page context exceeds 4096 UTF-8 bytes. Reduce active constraints before sending.');
 return result;
}

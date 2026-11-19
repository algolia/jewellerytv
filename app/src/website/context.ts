export interface PageContextState {
 selectedProductId?: string | null;
 selectedSize?: string | null;
 productHit?: {objectID: string; [key: string]: unknown} | null;
}

const bytes = (value: string) => new TextEncoder().encode(value).length;

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

 // Include product ID only when on PDP
 if(state.productHit?.objectID) {
  add('product', state.productHit.objectID);
 }

 if(Object.keys(result).length>32) throw new Error('Page context exceeds 32 fields.');
 // Counting the JSON envelope is deliberately stricter than summing value bytes alone.
 if(bytes(JSON.stringify(result))>4096) throw new Error('Page context exceeds 4096 UTF-8 bytes. Reduce active constraints before sending.');
 return result;
}

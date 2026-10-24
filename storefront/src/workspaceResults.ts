import type {Product} from './catalog';
export type WorkspaceGroup={
 title:string;
 why?:string;
 /** Presentation hint: `search_results` marks the chips-native single-group
  * display, which the workspace renders at its full tile cap instead of the
  * grouped-presentation two-per-group cap. */
 mode?:'search_results';
 items:{product:Product;why?:string;assessment?:'compliant'|'unknown'}[]};

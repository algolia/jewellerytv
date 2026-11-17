import {describe,it,expect} from 'vitest';
import {buildContext} from '../src/website/context';

describe('per-turn context',()=>{
 it('includes datetime and timezone by default',()=>{
  const c=buildContext({});
  expect(c.currentDateTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  expect(c.userTimezone).toBeDefined();
  expect(typeof c.userTimezone).toBe('string');
  expect(Object.keys(c)).toEqual(['currentDateTime','userTimezone']);
 });

 it('includes product details when on PDP',()=>{
  const hit={objectID:'123',Product_Name:'Test Ring',Product_LongDescription:'A beautiful ring',Pricing_SalePrice:99.99,Catalog_ProductCategoryDisplayName:'Rings'};
  const c=buildContext({productHit:hit});
  expect(c.currentDateTime).toBeDefined();
  expect(c.userTimezone).toBeDefined();
  expect(c.product).toBeDefined();
  const product=JSON.parse(c.product);
  expect(product.objectID).toBe('123');
  expect(product.name).toBe('Test Ring');
  expect(product.description).toBe('A beautiful ring');
  expect(product.price).toBe(99.99);
  expect(product.category).toBe('Rings');
 });

 it('respects 1024-byte field limit',()=>{
  const longDesc='x'.repeat(2000);
  const hit={objectID:'123',Product_LongDescription:longDesc};
  expect(()=>buildContext({productHit:hit})).toThrow(/1024/);
 });

 it('product field cannot exceed 1024 bytes',()=>{
  const hit={objectID:'123',Product_LongDescription:'a'.repeat(900),Material_Information:'b'.repeat(200)};
  expect(()=>buildContext({productHit:hit})).toThrow(/1024/);
 });

 it('omits undefined product fields',()=>{
  const hit={objectID:'123',Product_Name:'Test'};
  const c=buildContext({productHit:hit});
  const product=JSON.parse(c.product);
  expect(product.name).toBe('Test');
  expect(product.description).toBeUndefined();
  expect(product.material).toBeUndefined();
 });
});

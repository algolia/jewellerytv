import {describe,it,expect} from 'vitest';
import {buildContext} from '../src/website/context';

describe('per-turn context',()=>{
 it('includes datetime and timezone by default',()=>{
  const c=buildContext({});
  // Day precision only (YYYY-MM-DD) for cache-friendly context
  expect(c.currentDateTime).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(c.userTimezone).toBeDefined();
  expect(typeof c.userTimezone).toBe('string');
  expect(Object.keys(c)).toEqual(['currentDateTime','userTimezone']);
 });

 it('includes product ID when on PDP',()=>{
  const hit={objectID:'BFJ768',Product_Name:'Test Ring'};
  const c=buildContext({productHit:hit});
  expect(c.currentDateTime).toBeDefined();
  expect(c.userTimezone).toBeDefined();
  expect(c.product).toBe('BFJ768');
  expect(Object.keys(c)).toEqual(['currentDateTime','userTimezone','product']);
 });

 it('omits product when no productHit',()=>{
  const c=buildContext({selectedProductId:'123'});
  expect(c.currentDateTime).toBeDefined();
  expect(c.userTimezone).toBeDefined();
  expect(c.product).toBeUndefined();
  expect(Object.keys(c)).toEqual(['currentDateTime','userTimezone']);
 });
});

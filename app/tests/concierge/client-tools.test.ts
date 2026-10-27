import { describe, expect, it } from 'vitest';
import {
  modelVisiblePresentOutput,
  presentShadowReceipt,
  stashPresentShadowReceipt,
} from '../../src/concierge/clientTools';
import type { PresentProductsOutput } from '../../src/concierge/tools/presentProducts';

/* Arijit caught the model narrating the tool's forensics to a shopper twice
 * on 2026-10-27 ("the display tool is checking material against the gemstone
 * name Pearl… so the pieces the shopper actually wants can pass through").
 * The forensics in the tool result WERE the fuel: the model paraphrased
 * `enforced` and `dropped` almost word for word. The model now sees the
 * shelf only; the shadow diagnostics ride a side channel it never reads. */

const fullOutput: PresentProductsOutput = {
  status: 'ok',
  objectIDs: [{ objectID: 'a', name: 'Pearl strand', price: 500, image: 'https://x/a.jpg' }],
  dropped: [{ objectID: 'b', reason: 'requirement_mismatch' }],
  displayFacets: ['Catalog_ProductType'],
  enforced: { attribute: 'Catalog_GemstoneAndPearlNavigationName', values: ['Pearl'] },
  declared: { material: [], gemstone: ['pearl'], brand: [], priceMax: 1000 },
  declaredVerbatim: false,
  priceOverBudget: [],
  poolSize: 12,
};

describe('present_products model-visible output split', () => {
  it('the model sees the shelf, not the forensics', () => {
    const visible = modelVisiblePresentOutput(fullOutput);
    expect(visible).toEqual({
      status: 'ok',
      objectIDs: fullOutput.objectIDs,
      displayFacets: ['Catalog_ProductType'],
    });
    expect(JSON.stringify(visible)).not.toContain('requirement_mismatch');
    expect(JSON.stringify(visible)).not.toContain('declared');
    expect(JSON.stringify(visible)).not.toContain('enforced');
  });

  it('an empty or invalid outcome still carries its status to the model', () => {
    const empty: PresentProductsOutput = { ...fullOutput, status: 'empty', objectIDs: [] };
    expect(modelVisiblePresentOutput(empty).status).toBe('empty');
    const invalid: PresentProductsOutput = {
      status: 'invalid_input',
      reason: 'objectIDs must be a non-empty array',
      objectIDs: [],
      dropped: [],
      displayFacets: [],
    };
    expect(modelVisiblePresentOutput(invalid)).toEqual({
      status: 'invalid_input',
      objectIDs: [],
      displayFacets: [],
    });
  });

  it('the shadow receipt keeps the diagnostics the model never saw', () => {
    const receipt = presentShadowReceipt(
      { understood: fullOutput.declared },
      fullOutput,
    );
    expect(receipt.status).toBe('ok');
    expect(receipt.declared).toEqual({ material: [], gemstone: ['pearl'], brand: [], priceMax: 1000 });
    expect(receipt.declaredVerbatim).toBe(false);
    expect(receipt.enforced).toEqual({ attribute: 'Catalog_GemstoneAndPearlNavigationName', values: ['Pearl'] });
    expect(receipt.dropped).toEqual([{ objectID: 'b', reason: 'requirement_mismatch' }]);
  });

  it('the shadow log appends and caps at fifty entries', () => {
    const backing = new Map<string, string>();
    const storage = {
      getItem: (key: string) => backing.get(key) ?? null,
      setItem: (key: string, value: string) => void backing.set(key, value),
    };
    for (let i = 0; i < 55; i++)
      stashPresentShadowReceipt({ at: `t${i}`, status: 'ok' }, storage);
    const stored = JSON.parse(backing.get('jtv-present-shadow') ?? '[]') as { at: string }[];
    expect(stored).toHaveLength(50);
    expect(stored[0].at).toBe('t5');
    expect(stored[49].at).toBe('t54');
  });
});

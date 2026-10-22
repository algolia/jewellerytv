// A supported conversation may contain an unsupported catalogue currency.
// Preserve it without conversion, USD comparisons, accidental edit conversion or hidden display limits.
import { expect, it } from 'vitest';
import { createBriefState, applyBriefOperations } from '../shared/briefState';
import { formatBriefValue } from '../shared/briefSchema';
import { compileBriefConstraints as compileBriefConstraintsBase, checkBriefConflicts as checkBriefConflictsBase } from '../shared/briefConstraints';
const foreign = {
  id: 'gbp',
  field: 'budget' as const,
  value: {
    kind: 'money' as const,
    cents: 15000,
    currency: 'GBP',
    operator: 'lte' as const,
    basis: 'total' as const,
  },
  scope: { kind: 'mission' as const },
  strength: 'requirement' as const,
  status: 'active' as const,
  origin: 'spoken' as const,
  evidence: {
    messageId: 'm1',
    quote: '150 pounds for a bracelet, including delivery',
    explicit: true,
    verified: true,
  },
};
function state() {
  const initial = createBriefState('currency');
  return applyBriefOperations(initial, {
    missionId: 'currency',
    expectedRevision: 0,
    turnId: 'm1',
    operations: [{ type: 'add', fact: foreign }],
  });
}
it('retains stated GBP while withholding USD numeric filters', () => {
  const s = state();
  expect(s.facts[0].value).toMatchObject({ currency: 'GBP', cents: 15000 });
  const compiled = compileBriefConstraints(s);
  expect(compiled.filters).toBeUndefined();
  expect(compiled.appliedFactIds).toEqual([]);
  expect(compiled.context[0].reason).toContain('currency');
  expect(compiled.consultationBrief).toContain('GBP');
});
it('leaves affordability unknown without a currency conversion', () => {
  const s = state();
  expect(checkBriefConflicts(s, { objectID: 'usd-item', Pricing_ActivePrice: 10 }).status).toBe(
    'unknown',
  );
});
it('keeps a stated foreign currency out of USD-only display limits', () => {
  const s = state();
  // The retired workspace budget adapter was removed with Save (D1, 2026-10-22);
  // the brief itself must keep the foreign currency intact, never a USD number.
  expect(s.facts[0].value).toMatchObject({ currency: 'GBP', cents: 15000 });
  expect(JSON.stringify(s.facts[0].value)).not.toContain('$');
});
it('an explicit USD correction replaces the foreign limit and compiles normally', () => {
  let s = state();
  s = applyBriefOperations(s, {
    missionId: s.missionId,
    expectedRevision: s.revision,
    turnId: 'm2',
    operations: [
      {
        type: 'replace',
        factIds: ['gbp'],
        fact: {
          ...foreign,
          id: 'usd',
          value: { ...foreign.value, currency: 'USD', cents: 12000, basis: 'per-item' },
          evidence: { ...foreign.evidence, messageId: 'm2', quote: 'US $120 per item' },
        },
      },
    ],
  });
  expect(compileBriefConstraints(s).filters).toBe('Pricing_ActivePrice <= 120.00');
  expect(s.facts.find((f) => f.id === 'usd')?.value).toMatchObject({ currency: 'USD' });
});
it('formats USD compatibly while preserving a different explicit currency', () => {
  expect(formatBriefValue({ ...foreign.value, currency: 'USD' })).toBe('Up to $150.00 total');
  expect(formatBriefValue(foreign.value)).toBe('Up to GBP 150.00 total');
});

// Fixture live vocabulary (values observed by read-only index interrogation;
// the runtime receives them from /api/catalog-vocabulary). The frozen JSON
// fallback these tests previously relied on is retired.
const testVocabValues:Readonly<Record<string,readonly string[]>>={
 'Catalog_ProductType':['Ring','Earrings','Necklace','Bracelet','Pendant','Wrist Watch'],
 'Catalog_JewelryMaterialNavigationName':['Silver','Gold','Platinum'],
 'Catalog_JewelryMaterialNavigationColor':['White','Yellow','Rose'],
 'Catalog_GemstoneInformation.GemstoneShape':['Round','Heart','Flower'],
 'Catalog_GemstoneInformation.GemstoneColorGroup':['Blue','White','Red'],
 'Catalog_EarringType':['Stud'],
};
const compileBriefConstraints=(...args:Parameters<typeof compileBriefConstraintsBase>)=>compileBriefConstraintsBase(args[0],args[1],testVocabValues);
const checkBriefConflicts=(...args:Parameters<typeof checkBriefConflictsBase>)=>checkBriefConflictsBase(args[0],args[1],testVocabValues);

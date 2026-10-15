#!/usr/bin/env node
/**
 * Build the candidate tools JSON for the gold-hoop sufficiency repair:
 * widen material_alternatives item type/color/purity to nullable strings,
 * mirroring shared/concierge/state/updateShoppingState.ts (the app already
 * accepts nulls and materialMatch already treats null as "not constrained").
 * Everything else in the published tools stays byte-identical.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const dir = 'docs/config/concierge-development/candidates/gold-hoop-sufficiency-typed-color-2026-10-14';
const tools = JSON.parse(readFileSync(`${dir}/rollback-tools.json`, 'utf8'));
const uss = tools.find((t) => t.name === 'update_shopping_state');
if (!uss) throw new Error('update_shopping_state tool not found in published tools');
const items = uss.inputSchema.properties.operations.items;
const fact = items.properties.fact;
const variants = fact.oneOf ?? fact.anyOf ?? fact;
const list = Array.isArray(variants) ? variants : [variants];
const ma = list.find((o) => JSON.stringify(o).includes('material_alternatives'));
if (!ma) throw new Error('material_alternatives variant not found');
const valueVariants = ma.properties.value.oneOf ?? ma.properties.value.anyOf;
const valueList = Array.isArray(valueVariants) ? valueVariants : [valueVariants];
const maValue = valueList.find((o) => JSON.stringify(o).includes('material_alternatives'));
if (!maValue) throw new Error('material_alternatives value variant not found');
const alt = maValue.properties.alternatives.items.properties;
for (const field of ['type', 'color', 'purity']) {
  if (alt[field]?.type !== 'string') throw new Error(`Unexpected published shape for ${field}`);
  alt[field] = { type: ['string', 'null'], maxLength: 160, description: alt[field].description };
}
writeFileSync(`${dir}/agent-tools.candidate.json`, `${JSON.stringify(tools, null, 2)}\n`);
console.log(
  'tools candidate written; nullable fields:',
  ['type', 'color', 'purity'].map((f) => `${f}=${JSON.stringify(alt[f].type)}`).join(' '),
);

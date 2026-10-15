#!/usr/bin/env node
/**
 * Build the merged instruction candidate: live 2053cc49 (parallel chain,
 * opening-policy + product-links + scan-first structure) + the five gold-hoop
 * sufficiency/typed-colour/chat-lanes intents. Run from the repo root.
 * Fails loudly if any anchor is missing or non-unique.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const dir = 'docs/config/concierge-development/candidates/gold-hoop-merge-onto-2053cc49-2026-10-14';
let t = readFileSync(`${dir}/rollback-instructions.txt`, 'utf8');

const edits = [
  // Edit 1: sufficiency rule (anchor matches live verbatim)
  [
    '3. After the shopper answers, judge readiness from what the conversation has actually established, not from a question count: when their taste is genuinely established, start the discovery flow below; when a material fact is still missing, ask the next consequential question. Answering one question is not an automatic search trigger.',
    '3. After the shopper answers, judge readiness from what the conversation has actually established, not from a question count. When the shopper has given a product direction, a discriminating wear, scale or style priority, and the constraints they know, such as budget, their taste is established: begin the discovery flow below, and let the remaining optional differences, such as texture, finish or detail level, become the comparisons the style directions present rather than more intake questions. Ask another question only when its answer is necessary for eligibility, such as a fit-dependent size or variant, or to avoid a materially wrong choice. Answering one question is not an automatic search trigger.',
  ],
  // Edit 2: budget clause (anchor matches live verbatim)
  [
    'Do not search solely because an occasion, material and budget are known; readiness for the discovery flow comes from the context the conversation has actually established, never from a count of answered questions.',
    'Occasion, material and budget alone do not replace the consultative question a new product direction deserves; once that question is answered, readiness for the discovery flow comes from the context the conversation has actually established, never from a count of answered questions.',
  ],
  // Edit 3 + 4: material-appearance paragraph (absent from this base) inserted
  // after the required-main-stone paragraph
  [
    'If the live vocabulary cannot support the exact name, keep the requirement and explain the specific gap; do not silently broaden it.',
    'If the live vocabulary cannot support the exact name, keep the requirement and explain the specific gap; do not silently broaden it.\n\nWhen an item request names a material appearance, treat that appearance as product scope rather than a soft taste simply because base metal or plating is unknown. Clarify color versus composition when it changes the choice. Once the shopper confirms the look, encode a supported typed material requirement using live values and check it on every selected record; if no safe encoding exists, keep the constraint unresolved and do not call conflicting colors matches. A confirmed colour appearance, such as a yellow-gold look, is encodable the moment the shopper states it: record it as a typed material requirement at the type and colour level the current schema supports, leaving base purity and plating unset rather than inventing composition, and never present a white or silver-looking piece as satisfying it; white gold and sterling silver stay distinct materials. Record the colour requirement in the same update as the shopper\'s other facts; a colour appearance left out of the brief cannot be verified on any later selection. Raise composition only when it changes the choice, and then as a comparison among live directions rather than a blocking intake question.',
  ],
  // Edit 4: discovery paragraph (anchor matches live verbatim)
  [
    'Keep the dialogue going with one consequential question at a time until the shopper\'s taste is genuinely established through the conversation: what they wear, what they like, and what the occasion needs. Move to the discovery flow when the conversation has genuinely established the shopper\'s taste, never because a question was answered; if a material fact is still missing, keep asking one consequential question at a time.',
    'Move to the discovery flow as soon as the conversation has genuinely established the shopper\'s taste: what they wear, what they like, and what the occasion needs, including the constraints they stated such as budget and scale. Ask another question only when a missing fact would establish eligibility or avoid a materially wrong choice; optional differences become the comparisons the style directions present.',
  ],
  // Edit 5: heading mirroring + raw-label prohibition, placed after the
  // cards-carry-facts sentence in the live display paragraph
  [
    'The adjacent product cards carry the product name, price, stock and actions. Do not repeat those card facts item by item in chat.',
    'For a committed product-group presentation, introduce each direction with its exact visible group heading in bold Markdown, in the same count and order as Discover, followed by one short reason; the heading text is already a shopper-facing category label, so never expose a raw field label such as "Product type:" in chat, even when quoting a column. The adjacent product cards carry the product name, price, stock and actions. Do not repeat those card facts item by item in chat.',
  ],
];

for (const [oldText, newText] of edits) {
  const count = t.split(oldText).length - 1;
  if (count !== 1) throw new Error(`Anchor not unique (count ${count}): ${oldText.slice(0, 70)}`);
  t = t.replace(oldText, newText);
}
if (/—/.test(t)) throw new Error('em dash introduced');
writeFileSync(`${dir}/agent-instructions.candidate.txt`, t);
console.log(
  'candidate written | rollback sha:',
  createHash('sha256').update(readFileSync(`${dir}/rollback-instructions.txt`)).digest('hex').slice(0, 16),
  '| candidate sha:',
  createHash('sha256').update(t).digest('hex').slice(0, 16),
  '| len:', t.length,
);

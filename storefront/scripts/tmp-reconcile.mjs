import { readFileSync } from 'node:fs';
const live = JSON.parse(readFileSync('/tmp/jtv-live-dev-now.json', 'utf8'));
const mine = JSON.parse(readFileSync('/tmp/jtv-dev-agent-new.json', 'utf8'));

// 1. Is my two-phase systemPrompt still byte-identical on the live dev agent?
console.log('sysprompt intact (byte-exact vs my apply):', live.systemPrompt === mine.systemPrompt);

// 2. Did my aim-discipline bullet survive their instruction rounds?
const aimBullet = 'Build each direction on its own aimed search: choose the directions from the facet counts your search returns, give each direction a search with its own facet filter, and never subdivide one assorted result set into directions.';
console.log('aim bullet in live instructions:', live.instructions.includes(aimBullet));

// 3. Their round-3 teaching edits present?
console.log('their narration rule present:', live.instructions.includes('Between tool steps speak only when the shopper is left waiting'));
console.log('their conciseness test present:', live.instructions.includes('Never announce what you are about to show; show it.'));

// 4. My purity note + scenario rewrite (systemPrompt) and shortfall scenario present?
console.log('purity note present:', live.systemPrompt.includes('A purity value is the karat of the gold a record names'));
console.log('shortfall regroup scenario present:', live.systemPrompt.includes('read the surplus report first'));

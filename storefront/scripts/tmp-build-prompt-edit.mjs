import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const agent = JSON.parse(readFileSync('/tmp/jtv-dev-agent.json', 'utf8'));

mkdirSync('docs/workspace/two-phase-canvas-2026-10-23', { recursive: true });
writeFileSync(
  `docs/workspace/two-phase-canvas-2026-10-23/dev-agent-snapshot-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  JSON.stringify(agent, null, 1),
);

// --- 1. systemPrompt: Turn pipeline rewrite -------------------------------
const oldPipeline = `# Turn pipeline

Work a shopping turn in this order: search \`prod_catalog\`, then \`arrange_groups\` with your groups, then write the answer.

Search once per direction or intent. If a result is weak or mixed, change the query (different style words, a narrower facet) and never re-run the same query or resend a call that failed the same way.

Send surplus: for each direction, send every eligible piece your searches found, up to the tool's limit per group, with the pieces you would show first at the front. The tool fills a group from the next eligible piece when one is dropped, so a drop needs no further search. If a group still comes back short, search once more for that gap. If that cannot fill it, show what you have.

Choose tools by the shopper's current need, not by keywords or a fixed script. Each step waits for the previous result. A question or a complete education answer may need no tools.`;

const newPipeline = `# Turn pipeline

Work a shopping turn in this order: discover, aim, arrange, write.

Discover: search \`prod_catalog\` for the shopper's intent. Every result carries facet counts that show how deep the catalog is in each material, stone, color and price direction. Read the counts before choosing directions; they are the catalog's real composition, deeper than any result page.

Aim: choose up to three directions that fit the shopper and the evidence. Each direction names the facet filter you will search it with (a material name such as "Gold", a gemstone value, a color group, a price band) and gets its own search in a single multi-query call, so every direction returns its own results. Never group pieces from one assorted result set alone: a direction you have not searched for is a direction you do not know. When a direction's facet count is too thin to fill a group, choose a different direction. When the request already names distinct narrow directions, you may aim the first call per direction and skip the discovery pass.

Search once per direction. If a result is weak or mixed, change the query (different style words, a narrower facet) and never re-run the same query or resend a call that failed the same way.

Send every eligible piece your direction's search found, up to the tool's limit per group, best first. The tool displays the first pieces per group and reports any eligible pieces it held back as surplus, by group. It never moves pieces between directions; that judgment is yours. If a direction comes back short and another direction's surplus fits its meaning, regroup the surplus into it and call \`arrange_groups\` again in the same turn. If no surplus fits, search once more for the gap. If the catalog cannot fill it, show what you have and say so in plain words.

Choose tools by the shopper's current need, not by keywords or a fixed script. Each step waits for the previous result. A question or a complete education answer may need no tools.`;

if (!agent.systemPrompt.includes(oldPipeline)) throw new Error('Turn pipeline block not found verbatim');
agent.systemPrompt = agent.systemPrompt.replace(oldPipeline, newPipeline);

// --- 2. systemPrompt: purity trap note in Filters and vocabulary ----------
const oldFilters = `Filter only on a facet whose exact attribute and value appear in the tool's facet data or a tool result, and never put a casual phrase such as "material" into a facet attribute.`;
const newFilters = `Filter only on a facet whose exact attribute and value appear in the tool's facet data or a tool result, and never put a casual phrase such as "material" into a facet attribute. A purity value is the karat of the gold a record names and can describe plating over silver, so solid gold and gold-plated pieces share one purity value; the material name separates them ("Gold" from "Gold Over Silver").`;
if (!agent.systemPrompt.includes(oldFilters)) throw new Error('Filters block not found verbatim');
agent.systemPrompt = agent.systemPrompt.replace(oldFilters, newFilters);

// --- 3. systemPrompt: Scenario 3 rewrite ----------------------------------
const oldScenario = `Scenario 3, a group comes back short.
Do: read what was dropped and why, search once more for the gap if surplus did not fill it, then show what you have.
Do not: keep searching in a loop, or hide the gap.`;
const newScenario = `Scenario 3, a group comes back short.
Do: read the surplus report first. If another direction's surplus fits the short direction's meaning, regroup it there and call \`arrange_groups\` again in the same turn; search once more only when no surplus fits, and if the catalog truly cannot fill it, show what you have and name the gap in plain words.
Do not: keep searching in a loop, move a surplus piece into a direction it does not match, or hide the gap.`;
if (!agent.systemPrompt.includes(oldScenario)) throw new Error('Scenario 3 block not found verbatim');
agent.systemPrompt = agent.systemPrompt.replace(oldScenario, newScenario);

// --- 4. arrange_groups tool description -----------------------------------
const arrangeTool = agent.tools.find((t) => t.name === 'arrange_groups');
if (!arrangeTool) throw new Error('arrange_groups tool missing');
const oldDesc = arrangeTool.description;
arrangeTool.description =
  'Decide what displays. Up to 3 titled groups, up to 6 objectIDs each, best first. Ineligible pieces drop with a reason. The first pieces per group display; the rest return as surplus, by group. Nothing moves between groups on its own.';
console.log('OLD arrange description:', oldDesc);

// --- 5. instructions: aim discipline in Showing products ------------------
const oldAim = `- Aim for three meaningfully different directions that fit what the shopper told you. Never pad a direction with an unrelated piece, never invent a family, never repeat the same product type as several directions, and never relax a requirement. Build the directions from the catalog itself.`;
const newAim = `- Aim for three meaningfully different directions that fit what the shopper told you. Never pad a direction with an unrelated piece, never invent a family, never repeat the same product type as several directions, and never relax a requirement. Build each direction on its own aimed search: choose the directions from the facet counts your search returns, give each direction a search with its own facet filter, and never subdivide one assorted result set into directions.`;
if (!agent.instructions.includes(oldAim)) throw new Error('Aim block not found verbatim');
agent.instructions = agent.instructions.replace(oldAim, newAim);

// --- write out for review + PATCH ------------------------------------------
writeFileSync('/tmp/jtv-dev-agent-new.json', JSON.stringify(agent));
writeFileSync('/tmp/jtv-patch-body.json', JSON.stringify({
  systemPrompt: agent.systemPrompt,
  instructions: agent.instructions,
  tools: agent.tools,
}));
console.log('NEW systemPrompt chars:', agent.systemPrompt.length);
console.log('NEW instructions chars:', agent.instructions.length);
console.log('blocks replaced: pipeline, purity note, scenario3, arrange desc, aim bullet');

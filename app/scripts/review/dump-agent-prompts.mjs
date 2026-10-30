/* dump-agent-prompts.mjs: READ-ONLY review aid for the 2026-10-26 prompt review.
 * Fetches the live dev and production agents and writes instructions/systemPrompt/tools
 * to a dated review folder. Never writes to Algolia. Run:
 *   NODE_USE_SYSTEM_CA=1 node app/scripts/review/dump-agent-prompts.mjs
 */
import {mkdirSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {loadSettings} from '../baseline/settings.mjs';

const S = loadSettings();
const url = (id) => `https://${S.appId}.algolia.net/agent-studio/1/agents/${id}`;
const get = async (id) => {
  const r = await fetch(url(id), {headers: {'x-algolia-application-id': S.appId, 'x-algolia-api-key': S.searchKey}, redirect: 'error', signal: AbortSignal.timeout(20000)});
  if (!r.ok) throw new Error(`GET ${id} ${r.status}`);
  return r.json();
};
const sha8 = (v) => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex').slice(0, 8);

const outDir = resolve(S.root, 'docs/workspace/prompt-review-2026-10-26/live');
mkdirSync(outDir, {recursive: true});

for (const [label, id] of [['dev', S.devAgentId], ['prod', S.productionAgentId]]) {
  const a = await get(id);
  const meta = {
    id: a.id, name: a.name, status: a.status, model: a.model, providerId: a.providerId,
    instructionsSha8: sha8(a.instructions), systemPromptSha8: sha8(a.systemPrompt),
    instructionsChars: a.instructions?.length, systemPromptChars: a.systemPrompt?.length,
    tools: (a.tools ?? []).map((t) => ({name: t.name, type: t.type})),
    updatedAt: a.updatedAt, lastUsedAt: a.lastUsedAt,
  };
  writeFileSync(resolve(outDir, `${label}-meta.json`), JSON.stringify(meta, null, 2));
  writeFileSync(resolve(outDir, `${label}-instructions.md`), a.instructions ?? '');
  writeFileSync(resolve(outDir, `${label}-systemPrompt.md`), a.systemPrompt ?? '');
  writeFileSync(resolve(outDir, `${label}-tools.json`), JSON.stringify(a.tools ?? [], null, 2));
  console.log(label, id, 'instr', meta.instructionsChars, 'chars sha', meta.instructionsSha8, '| sys', meta.systemPromptChars, 'chars sha', meta.systemPromptSha8, '| tools', meta.tools.map((t) => t.name).join(','));
}
console.log('wrote to', outDir);

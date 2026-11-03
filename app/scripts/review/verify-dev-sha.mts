import { createHash } from 'node:crypto';
import { loadSettings } from '../baseline/settings.mjs';

const S = loadSettings();
const r = await fetch(`https://${S.appId}.algolia.net/agent-studio/1/agents/${S.devAgentId}`, {
  headers: { 'x-algolia-application-id': S.appId, 'x-algolia-api-key': S.searchKey },
});
const a: any = await r.json();
const sha = createHash('sha256').update(a.instructions).digest('hex').slice(0, 8);
console.log(JSON.stringify({ liveDevSha: sha, expected: 'b9f9ac4c', match: sha === 'b9f9ac4c', chars: a.instructions.length, status: a.status }));

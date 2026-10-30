import { createAgentStudioClient, loadCredentials } from '../conversation-reader/agentStudio.ts';
import { loadSettings } from '../baseline/settings.mjs';

const S = loadSettings();
for (const [label, id] of [['DEV', S.devAgentId], ['PROD', S.productionAgentId]]) {
  const c = createAgentStudioClient(await loadCredentials(), id);
  const l = await c.listConversations(5);
  console.log('==', label, 'latest:');
  for (const row of (l.conversations ?? []).slice(0, 5)) console.log('  ', row.createdAt, '| msgs', row.messageCount, '|', String(row.title).slice(0, 55));
}

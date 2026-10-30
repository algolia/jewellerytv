import { createAgentStudioClient, loadCredentials } from '../conversation-reader/agentStudio.ts';
import { loadSettings } from '../baseline/settings.mjs';

const S = loadSettings();
const c = createAgentStudioClient(await loadCredentials(), S.devAgentId);
try {
  const conv = await c.fetchConversation('mission-f60631a4-0bd3-4a46-866c-0e136d1dbd60');
  console.log('fetch-by-id OK | title:', conv.title, '| turns:', (conv.turns ?? []).length);
} catch (e) {
  console.log('fetch-by-id FAILED:', String(e).slice(0, 200));
}

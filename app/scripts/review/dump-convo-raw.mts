import { createAgentStudioClient, loadCredentials } from '../conversation-reader/agentStudio.ts';
import { loadSettings } from '../baseline/settings.mjs';

const S = loadSettings();
const c = createAgentStudioClient(await loadCredentials(), S.devAgentId);
const conv: any = await c.fetchConversation('mission-f60631a4-0bd3-4a46-866c-0e136d1dbd60');
console.log('keys:', Object.keys(conv));
for (const k of Object.keys(conv)) {
  const v = (conv as any)[k];
  console.log(k, '=', typeof v === 'string' ? JSON.stringify(v.slice(0, 80)) : Array.isArray(v) ? `array[${v.length}]` : JSON.stringify(v)?.slice(0, 100));
}

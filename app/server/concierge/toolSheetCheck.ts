import { toolNamesFromAgent, unansweredTools } from '../../shared/concierge/toolSheetGuard.js';

export type ToolSheetState =
  | { status: 'match'; unanswered: []; agentTools: string[]; checkedAt: number }
  | { status: 'mismatch'; unanswered: string[]; agentTools: string[]; checkedAt: number }
  | { status: 'unknown'; unanswered: []; agentTools: []; checkedAt: number };

export type ToolSheetCheckOptions = {
  appId: string;
  apiKey: string;
  agentId: string;
  fetch?: typeof fetch;
  now?: () => number;
  logger?: (message: string, detail: Record<string, unknown>) => void;
  /** How long a readable result is reused. */
  ttlMs?: number;
  /** How long an unreadable result is reused before trying again. */
  unknownTtlMs?: number;
};

/** Compares the tools the Agent Studio agent declares with the tools this app
 * answers. Read-only (one GET with the search key). An agent that cannot be
 * read is reported as unknown and never blocks a turn: the check exists to
 * name a known mismatch, not to become a new way for a healthy app to fail. */
export function createToolSheetCheck(options: ToolSheetCheckOptions) {
  const upstream = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? 30_000;
  const unknownTtlMs = options.unknownTtlMs ?? 10_000;
  const log =
    options.logger ?? ((message: string, detail: Record<string, unknown>) => console.error(message, detail));
  let cached: ToolSheetState | null = null;
  let inflight: Promise<ToolSheetState> | null = null;
  let loggedMismatch = '';

  const read = async (): Promise<ToolSheetState> => {
    const checkedAt = now();
    try {
      const response = await upstream(
        `https://${options.appId}.algolia.net/agent-studio/1/agents/${options.agentId}`,
        {
          headers: { 'x-algolia-application-id': options.appId, 'x-algolia-api-key': options.apiKey },
          redirect: 'error',
          signal: AbortSignal.timeout(5_000),
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        return { status: 'unknown', unanswered: [], agentTools: [], checkedAt };
      }
      const agentTools = toolNamesFromAgent(await response.json());
      if (!agentTools) return { status: 'unknown', unanswered: [], agentTools: [], checkedAt };
      const unanswered = unansweredTools(agentTools);
      if (unanswered.length === 0) return { status: 'match', unanswered: [], agentTools, checkedAt };
      const key = unanswered.join(',');
      if (key !== loggedMismatch) {
        loggedMismatch = key;
        log('jtv_tool_sheet_mismatch', { agentId: options.agentId, unanswered, agentTools });
      }
      return { status: 'mismatch', unanswered, agentTools, checkedAt };
    } catch {
      return { status: 'unknown', unanswered: [], agentTools: [], checkedAt };
    }
  };

  return {
    async get(): Promise<ToolSheetState> {
      if (cached && now() - cached.checkedAt < (cached.status === 'unknown' ? unknownTtlMs : ttlMs)) return cached;
      inflight ??= read().then((state) => {
        cached = state;
        inflight = null;
        return state;
      });
      return inflight;
    },
  };
}

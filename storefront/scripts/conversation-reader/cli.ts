import {
  createAgentStudioClient,
  errorMessage,
  liveAgentId,
  loadCredentials,
} from './agentStudio.ts';
import { analyzeConversation, analyzeListItem, activeWithin, type ListRow } from './analysis.ts';
import { conversationJson, listJson, renderConversation, renderList } from './render.ts';

/**
 * CLI entry point for the conversation reader (briefs A2, A2b, A2c).
 *
 * Usage (NODE_USE_SYSTEM_CA=1 is required on this machine):
 *   NODE_USE_SYSTEM_CA=1 npx tsx scripts/conversation-reader/cli.ts read <conversationId> [--json] [--full] [--turn N] [--no-cap] [--agent <agentId>]
 *   NODE_USE_SYSTEM_CA=1 npx tsx scripts/conversation-reader/cli.ts read --list --since 30m [--limit 25] [--json] [--agent <agentId>]
 *
 * --full prints the complete input and complete output of every tool call
 * (one output capped at 4000 characters with an explicit marker unless
 * --no-cap). --turn N shows a single turn. Both also work with --json.
 *
 * Read-only: GET requests only. Never creates, changes or deletes anything.
 */

interface CliOptions {
  conversationId: string | null;
  list: boolean;
  json: boolean;
  agentId: string;
  since: string | null;
  limit: number;
  full: boolean;
  noCap: boolean;
  turn: number | null;
}

const SINCE_PATTERN = /^(\d+)([smhd])$/;
const UNIT_MS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

export function parseSinceMs(since: string): number {
  const match = SINCE_PATTERN.exec(since);
  if (match === null) {
    throw new Error(`--since must look like 30m (number + s|m|h|d), got "${since}"`);
  }
  const amount = Number(match[1]);
  const unit = match[2] ?? '';
  return amount * (UNIT_MS[unit] ?? 0);
}

function parseOptions(argv: string[]): CliOptions {
  const options: CliOptions = {
    conversationId: null,
    list: false,
    json: false,
    agentId: liveAgentId,
    since: null,
    limit: 25,
    full: false,
    noCap: false,
    turn: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    if (arg === '--list') options.list = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--full') options.full = true;
    else if (arg === '--no-cap') options.noCap = true;
    else if (arg === '--agent') options.agentId = argv[(index += 1)] ?? '';
    else if (arg === '--since') options.since = argv[(index += 1)] ?? '';
    else if (arg === '--limit') options.limit = Number(argv[(index += 1)] ?? '');
    else if (arg === '--turn') {
      const raw = argv[(index += 1)] ?? '';
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error(`--turn must be a whole number of 1 or more, got "${raw}"`);
      }
      options.turn = parsed;
    } else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
    else if (options.conversationId === null) options.conversationId = arg;
    else throw new Error(`Unexpected extra argument "${arg}"`);
  }
  if (options.agentId === '') throw new Error('--agent needs a value');
  if (!options.list && options.conversationId === null) {
    throw new Error(
      'Missing conversation id. Usage: read <conversationId> | read --list --since 30m',
    );
  }
  if (options.list && options.since === null) {
    throw new Error('--list requires --since, e.g. --since 30m');
  }
  if (options.list && (options.full || options.noCap || options.turn !== null)) {
    throw new Error('--full, --turn and --no-cap apply to reading one conversation, not --list');
  }
  if (!Number.isFinite(options.limit) || options.limit <= 0) {
    throw new Error('--limit must be a positive number');
  }
  return options;
}

function usage(): string {
  return [
    'Conversation reader (read-only, briefs A2/A2b/A2c)',
    '',
    '  read <conversationId> [--json] [--full] [--turn N] [--no-cap] [--agent <agentId>]',
    '  read --list --since 30m [--limit 25] [--json] [--agent <agentId>]',
    '',
    '  --full     complete input and complete output of every tool call',
    '  --turn N   show only turn N (1-based)',
    '  --no-cap   lift the 4000-character cap on one printed output in --full mode',
    '',
    'Run with NODE_USE_SYSTEM_CA=1. Read-only GETs; zero paid completions.',
  ].join('\n');
}

async function run(argv: string[]): Promise<void> {
  const options = parseOptions(argv);
  const client = createAgentStudioClient(loadCredentials(), options.agentId);

  if (!options.list) {
    const conversation = await client.fetchConversation(options.conversationId ?? '');
    const analysis = analyzeConversation(conversation);
    const renderOptions = { full: options.full, noCap: options.noCap, turn: options.turn };
    if (options.json) {
      console.log(JSON.stringify(conversationJson(conversation, analysis, renderOptions), null, 2));
    } else {
      console.log(renderConversation(conversation, analysis, renderOptions));
    }
    return;
  }

  const sinceMs = parseSinceMs(options.since ?? '');
  const cutoff = Date.now() - sinceMs;
  const list = await client.listConversations(options.limit);
  const rows: ListRow[] = [];
  for (const item of list.data) {
    if (!activeWithin(item, cutoff)) continue;
    const conversation = await client.fetchConversation(item.id);
    rows.push(analyzeListItem(item, analyzeConversation(conversation)));
  }
  if (options.json) {
    console.log(JSON.stringify(listJson(rows, options.agentId, options.since ?? ''), null, 2));
  } else {
    console.log(renderList(rows, options.agentId, options.since ?? ''));
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    console.log(usage());
    return;
  }
  if (process.env.NODE_USE_SYSTEM_CA !== '1') {
    console.error('warning: NODE_USE_SYSTEM_CA=1 is not set; TLS may fail on this machine');
  }
  const command = argv[0];
  if (command !== 'read') {
    console.error(`error: unknown command "${command ?? ''}" — expected "read"`);
    process.exitCode = 1;
    return;
  }
  try {
    await run(argv.slice(1));
  } catch (error: unknown) {
    console.error(`error: ${errorMessage(error)}`);
    if (error instanceof Error && error.cause !== undefined) {
      console.error(`caused by: ${errorMessage(error.cause)}`);
    }
    process.exitCode = 1;
  }
}

await main();

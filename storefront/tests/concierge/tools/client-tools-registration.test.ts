import { describe, expect, it } from 'vitest';
import { findTool } from 'instantsearch-ui-components';
import { buildClientTools } from '../../../src/concierge/clientTools';

/**
 * Registration contract for the client tools (DIAG-6, 2026-10-21).
 *
 * The chat connector resolves EVERY tool call through findTool and, when no
 * tool claims the name, submits "No tool implemented for <name>." as the
 * result (connectChat.js onToolCall, !tool branch). That submission replaced
 * the streamed native search output in the follow-up request history — the
 * model saw "No tool implemented for algolia_search_index_prod_catalog." and
 * searched again from scratch (measured in the V6 smoke captures,
 * results/P4/diag-2026-10-21/smoke/v6-smoke-requests.txt).
 *
 * So the registration must CLAIM the native search tool names (so findTool
 * resolves them) while carrying NO onToolCall (the connector then leaves the
 * server-owned streamed output untouched). The deterministic tools keep
 * their executors; the check tools were removed (D2, 2026-10-21).
 */

const tools = buildClientTools(async () => {
  throw new Error('not used in this test');
});

describe('client tools registration claims the native search tool', () => {
  it('claims algolia_search_index_<index> tool calls without an executor', () => {
    const claimed = findTool('algolia_search_index_prod_catalog', tools as never) as
      | { onToolCall?: unknown }
      | undefined;
    expect(claimed).toBeDefined();
    expect(claimed?.onToolCall).toBeUndefined();
  });

  it('claims the bare native tool name too', () => {
    expect(findTool('algolia_search_index', tools as never)).toBeDefined();
  });

  it('still binds the remaining deterministic tools with executors', () => {
    for (const name of ['refresh_products', 'arrange_groups']) {
      const tool = findTool(name, tools as never) as { onToolCall?: unknown } | undefined;
      expect(tool, name).toBeDefined();
      expect(typeof tool?.onToolCall, name).toBe('function');
    }
  });

  it('no longer registers the removed check tools (D2)', () => {
    for (const name of ['check_price', 'check_stock']) {
      expect(findTool(name, tools as never), name).toBeUndefined();
    }
  });
});

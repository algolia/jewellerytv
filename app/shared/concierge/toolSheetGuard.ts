/* One list of the tools this app can answer, shared by the browser tool
 * registry (src/concierge/clientTools.ts) and the server tool-sheet check.
 * An Agent Studio agent that declares a tool outside this list gets the
 * connector fallback "No tool implemented for <name>" at run time, so every
 * turn fails in a way that reads like an agent fault (2026-10-21: a new
 * agent config against an older build). */

/** Client-side executors the app registers (chips-native cut: arrange_groups
 * is gone; present_products is the curation step — the model picks the pieces
 * from the search result, the tool verifies them). */
export const APP_ANSWERED_TOOL_NAMES = ['refresh_products', 'present_products'] as const;

/* Answered by the rebuilt panel's own library tools, never by this registry,
 * so it is deliberately absent from APP_ANSWERED_TOOL_NAMES: that list is the
 * registry's contract and a test holds it to it. Listed here only so the guard
 * does not 503 the old panel while both run side by side. Leaves with the
 * server. */
export const LIBRARY_ANSWERED_TOOL_NAMES = ['algolia_grouped_results'] as const;

/** The native search tool is answered by Agent Studio itself; the app only
 * claims the name. The runtime name carries an index suffix. */
export const SEARCH_TOOL_PREFIX = 'algolia_search_index';

export function appAnswersTool(toolName: string): boolean {
  return (
    (APP_ANSWERED_TOOL_NAMES as readonly string[]).includes(toolName) ||
    (LIBRARY_ANSWERED_TOOL_NAMES as readonly string[]).includes(toolName) ||
    toolName.startsWith(SEARCH_TOOL_PREFIX)
  );
}

/** Declared tools this app cannot answer, in declaration order. */
export function unansweredTools(agentToolNames: readonly string[]): string[] {
  return agentToolNames.filter((name) => !appAnswersTool(name));
}

/** Declared tool names from an Agent Studio agent record, or null when the
 * record does not have the expected shape. */
export function toolNamesFromAgent(agent: unknown): string[] | null {
  const tools = (agent as { tools?: unknown } | null)?.tools;
  if (!Array.isArray(tools)) return null;
  const names = tools.map((tool) => (tool as { name?: unknown } | null)?.name);
  return names.every((name): name is string => typeof name === 'string') ? names : null;
}

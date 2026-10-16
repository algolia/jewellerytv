import { describe, expect, it, vi } from 'vitest';
import { createSdkClientTools } from '../../src/concierge/sdkTools';
import type { createConciergeToolRuntime } from '../../src/concierge/toolRuntime';

/**
 * Contract between the published agent tool schemas and the app's input validators.
 * Source of the nullable fields below: the live Agent Studio snapshot of agent
 * 0bdf59fe (retrieve_evidence: exactObjectIDs, target, styleBatches; update_shopping_state:
 * operations[].fact and sourceQuote; present_choices: body, groups, alternatives).
 * Whatever the published schema allows, the app must accept; otherwise a legal call
 * is rejected and the agent reports a catalogue outage that does not exist.
 */
type Runtime = Pick<
  ReturnType<typeof createConciergeToolRuntime>,
  | 'updateSemantic'
  | 'retrieveSemantic'
  | 'presentSemantic'
  | 'getActiveTurnToken'
  | 'notePresentationAttempt'
>;
type Tool = ReturnType<typeof createSdkClientTools>[string];
type ToolCall = Parameters<NonNullable<Tool['onToolCall']>>[0];

function setup(
  overrides: { retrieve?: () => Promise<unknown>; update?: () => Promise<unknown> } = {},
) {
  const runtime = {
    updateSemantic: vi.fn(overrides.update ?? (async () => ({ status: 'applied' }))),
    retrieveSemantic: vi.fn(overrides.retrieve ?? (async () => ({ status: 'ok' }))),
    presentSemantic: vi.fn(async () => ({ status: 'staged' })),
    getActiveTurnToken: vi.fn(() => 1),
    notePresentationAttempt: vi.fn(() => true),
  };
  const tools = createSdkClientTools(runtime as unknown as Runtime);
  return { runtime, tools };
}
async function invoke(
  tools: ReturnType<typeof createSdkClientTools>,
  name: string,
  input: unknown,
) {
  const addToolResult = vi.fn(async (_result: unknown) => {});
  await tools[name].onToolCall!({
    input,
    signal: new AbortController().signal,
    addToolResult,
    toolCallId: 'call-1',
    toolName: name,
  } as ToolCall);
  return addToolResult.mock.calls[0]?.[0] as { output: Record<string, unknown> } | undefined;
}

const retrieveBase = {
  source: 'prod_catalog',
  query: 'gold hoop earrings',
  count: 6,
  target: null,
  exactObjectIDs: null,
};
const item = { evidenceRef: 'ev_a_1', quantity: 1, componentSlot: 'a', explanation: 'x' };
const group = { basis: { attribute: 'Catalog_ProductType', value: 'Earrings' }, items: [item] };
const presentBase = {
  missionId: 'm',
  expectedStateRevision: 0,
  expectedEvidenceBatchRevision: 0,
  turnId: 't',
};

describe('retrieve_evidence accepts every input the published schema allows', () => {
  it('treats styleBatches: null with styleOverview as an overview request', async () => {
    const { runtime, tools } = setup();
    const result = await invoke(tools, 'retrieve_evidence', {
      ...retrieveBase,
      styleOverview: true,
      styleBatches: null,
    });
    expect(runtime.retrieveSemantic).toHaveBeenCalledOnce();
    const passed = (runtime.retrieveSemantic.mock.calls[0] as unknown[])[0] as Record<
      string,
      unknown
    >;
    expect(passed.styleOverview).toBe(true);
    expect('styleBatches' in passed).toBe(false);
    expect(result?.output).toEqual({ status: 'ok' });
  });

  it('accepts styleBatches: null on an exact-product refresh by id (Compare and Save detail)', async () => {
    const { runtime, tools } = setup();
    const result = await invoke(tools, 'retrieve_evidence', {
      ...retrieveBase,
      query: '',
      count: 3,
      exactObjectIDs: ['PW186', 'MFP105A'],
      styleBatches: null,
    });
    expect(runtime.retrieveSemantic).toHaveBeenCalledOnce();
    expect(result?.output).toEqual({ status: 'ok' });
  });

  it('accepts styleOverview: null and an omitted styleBatches', async () => {
    const { runtime, tools } = setup();
    await invoke(tools, 'retrieve_evidence', { ...retrieveBase, styleOverview: null });
    await invoke(tools, 'retrieve_evidence', { ...retrieveBase });
    expect(runtime.retrieveSemantic).toHaveBeenCalledTimes(2);
  });

  it('still passes a real styleBatches array through unchanged', async () => {
    const { runtime, tools } = setup();
    const batches = [{ attribute: 'Catalog_ProductType', value: 'Earrings' }];
    await invoke(tools, 'retrieve_evidence', { ...retrieveBase, styleBatches: batches });
    const passed = (runtime.retrieveSemantic.mock.calls[0] as unknown[])[0] as Record<
      string,
      unknown
    >;
    expect(passed.styleBatches).toEqual(batches);
  });
});

describe('update_shopping_state and present_choices accept their nullable fields', () => {
  it('accepts a retract with fact: null and sourceQuote: null', async () => {
    const { runtime, tools } = setup();
    await invoke(tools, 'update_shopping_state', {
      operations: [{ action: 'retract', factIds: ['f1'], fact: null, sourceQuote: null }],
    });
    expect(runtime.updateSemantic).toHaveBeenCalledOnce();
  });

  it.each([
    [
      'wrapped body with alternatives: null',
      {
        ...presentBase,
        body: {
          kind: 'product_groups',
          mode: 'focused_choice',
          groups: [group],
          alternatives: null,
        },
      },
    ],
    [
      'flattened fields with body omitted',
      { ...presentBase, kind: 'product_groups', mode: 'focused_choice', groups: [group] },
    ],
    [
      'flattened fields with body: null',
      {
        ...presentBase,
        body: null,
        kind: 'product_groups',
        mode: 'focused_choice',
        groups: [group],
      },
    ],
    [
      'complete_looks with groups: null',
      {
        ...presentBase,
        body: {
          kind: 'complete_looks',
          groups: null,
          alternatives: [{ title: 'a', lines: [item] }],
        },
      },
    ],
  ])('present_choices reaches the runtime for %s', async (_label, input) => {
    const { runtime, tools } = setup();
    await invoke(tools, 'present_choices', input);
    expect(runtime.presentSemantic).toHaveBeenCalledOnce();
  });
});

describe('failures tell the agent what was wrong without exposing internals', () => {
  it('returns a structured invalid_input with field paths for a malformed retrieve', async () => {
    const { runtime, tools } = setup();
    const result = await invoke(tools, 'retrieve_evidence', { ...retrieveBase, count: 99 });
    expect(runtime.retrieveSemantic).not.toHaveBeenCalled();
    expect(result?.output).toMatchObject({
      status: 'invalid_input',
      paths: [{ path: 'count', code: expect.any(String) }],
    });
    expect(JSON.stringify(result?.output)).not.toContain('99');
  });

  it('returns a structured invalid_input for a malformed update instead of an opaque tool_failure', async () => {
    const { runtime, tools } = setup();
    const result = await invoke(tools, 'update_shopping_state', {});
    expect(runtime.updateSemantic).not.toHaveBeenCalled();
    expect(result?.output).toMatchObject({ status: 'invalid_input' });
    expect(result?.output.status).not.toBe('tool_failure');
  });

  it('accepts a body wrapper together with a top-level explanation, as the published schema allows', async () => {
    // Logged 2026-10-16: the agent sent {body:{...}, explanation:'...'} and the app answered
    // semantic_presentation_unknown_field, which surfaced as a visible system notice.
    const { runtime, tools } = setup();
    const group = (value: string) => ({
      basis: { attribute: 'Catalog_EarringType', value },
      items: [item, { ...item, evidenceRef: 'ev_a_2' }],
    });
    const result = await invoke(tools, 'present_choices', {
      body: {
        kind: 'product_groups',
        mode: 'three_style_grid',
        groups: [group('Drop'), group('Stud'), group('Hoop')],
      },
      explanation: 'Three clip-on directions.',
    });
    expect(result?.output.status).not.toBe('invalid_input');
    expect(runtime.presentSemantic).toHaveBeenCalledTimes(1);
  });

  it('keeps runtime exceptions opaque: a code only, never the thrown message', async () => {
    const boom = vi.fn(async () => {
      throw new Error('secret-internal-detail');
    });
    const { tools } = setup({ retrieve: boom, update: boom });
    const retrieve = await invoke(tools, 'retrieve_evidence', { ...retrieveBase });
    const update = await invoke(tools, 'update_shopping_state', {
      operations: [{ action: 'retract', factIds: ['f1'] }],
    });
    expect(retrieve?.output).toEqual({ status: 'tool_failure', code: 'RETRIEVAL_CALLBACK_FAILED' });
    expect(update?.output).toEqual({ status: 'tool_failure', code: 'STATE_CALLBACK_FAILED' });
    expect(JSON.stringify([retrieve, update])).not.toContain('secret-internal-detail');
  });
});

import { describe, expect, it } from 'vitest';
import {
  extractNativePresentation,
  NOTE_ECHO_ENABLED,
  stripTrailingNote,
} from '../../src/concierge/nativeResults';

/* Part shapes mirror the raw C2 capture s-02-t1 (results/P4/c2/s-02/capture/):
 * search parts carry `output.hits`, the grouped part carries the groups on its
 * INPUT and `{status:"success"}` on its output. */

const userMessage = (text: string) => ({
  id: 'u1',
  role: 'user',
  parts: [{ type: 'text', text }],
});

const searchPart = (hits: unknown[]) => ({
  type: 'tool-algolia_search_index_prod_catalog',
  toolCallId: 'call-1',
  state: 'output-available',
  input: { queries: [{ query: 'tanzanite ring' }] },
  output: { hits },
});

const hit = (objectID: string, extra: Record<string, unknown> = {}) => ({
  objectID,
  Catalog_TitleDescription: `Product ${objectID}`,
  Pricing_ActivePrice: 635.11,
  Inventory_InStock: false,
  Media_Images: ['https://example.com/a.jpg'],
  ...extra,
});

const groupedPart = (
  groups: unknown[],
  intro = 'An intro line',
  output: unknown = { status: 'success' },
) => ({
  type: 'tool-algolia_grouped_results',
  toolCallId: 'call-2',
  state: 'output-available',
  input: { intro, groups },
  output,
});

const group = (title: string, ids: string[], why?: string) =>
  why === undefined
    ? { title, results: ids.map((objectID) => ({ objectID })) }
    : { title, why, results: ids.map((objectID) => ({ objectID })) };

describe('extractNativePresentation', () => {
  it('reads group names, order and objectIDs from the grouped call input', () => {
    const messages = [
      userMessage('show me tanzanite rings'),
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          searchPart([hit('WPG776'), hit('WPG777')]),
          groupedPart([group('Solo tanzanite statement stones', ['WPG776', 'WPG777'], 'Pure stones')]),
          { type: 'text', state: 'done', text: 'Here is a first look.' },
        ],
      },
    ];
    const result = extractNativePresentation(messages);
    expect(result).not.toBeNull();
    expect(result?.intro).toBe('An intro line');
    expect(result?.groups).toHaveLength(1);
    expect(result?.groups[0].title).toBe('Solo tanzanite statement stones');
    expect(result?.groups[0].why).toBe('Pure stones');
    expect(result?.groups[0].objectIDs).toEqual(['WPG776', 'WPG777']);
    expect(result?.records.get('WPG776')).toMatchObject({ objectID: 'WPG776' });
  });

  it('returns null on a turn with no grouped call (held or service turn)', () => {
    const messages = [
      userMessage('what is your return policy?'),
      {
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'text', state: 'done', text: 'Returns are 30 days.' }],
      },
    ];
    expect(extractNativePresentation(messages)).toBeNull();
  });

  it('returns null when the grouped input is unusable, never a partial grid', () => {
    const messages = [
      userMessage('show me rings'),
      {
        id: 'a1',
        role: 'assistant',
        parts: [groupedPart([{ title: 'A group', results: [{ noObjectID: true }] }])],
      },
    ];
    expect(extractNativePresentation(messages)).toBeNull();
  });

  it('uses the latest assistant turn and the latest grouped call', () => {
    const messages = [
      userMessage('first question'),
      {
        id: 'a1',
        role: 'assistant',
        parts: [groupedPart([group('Old turn grid', ['OLD1'])])],
      },
      userMessage('second question'),
      {
        id: 'a2',
        role: 'assistant',
        parts: [
          searchPart([hit('NEW1')]),
          groupedPart([group('New grid', ['NEW1'])]),
          groupedPart([group('Final grid', ['NEW2'])], 'Later intro'),
          { type: 'text', state: 'done', text: 'Reply.' },
        ],
      },
    ];
    const result = extractNativePresentation(messages);
    expect(result?.groups).toHaveLength(1);
    expect(result?.groups[0].objectIDs).toEqual(['NEW2']);
    expect(result?.records.has('OLD1')).toBe(false);
    expect(result?.records.has('NEW1')).toBe(true);
  });

  it('keeps search records even when the grouped call references other ids', () => {
    const messages = [
      userMessage('show me rings'),
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          searchPart([hit('S1'), hit('S2')]),
          groupedPart([group('Group', ['G1'])]),
        ],
      },
    ];
    const result = extractNativePresentation(messages);
    expect(result?.records.has('S1')).toBe(true);
    expect(result?.groups[0].objectIDs).toEqual(['G1']);
  });

  it('accepts a grouped part before its output arrives (input-available)', () => {
    const messages = [
      userMessage('show me rings'),
      {
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'tool-algolia_grouped_results', state: 'input-available', input: { intro: 'i', groups: [group('G', ['X1'])] } }],
      },
    ];
    expect(extractNativePresentation(messages)?.groups[0].objectIDs).toEqual(['X1']);
  });
});

describe('stripTrailingNote', () => {
  it('strips a plain trailing NOTE line', () => {
    const { display, note } = stripTrailingNote('Here is a first look.\n\nNOTE: shown IDs A, B');
    expect(display).toBe('Here is a first look.');
    expect(note).toBe('shown IDs A, B');
  });

  it('strips a bolded trailing NOTE line (C2 c04c05 deviation shape)', () => {
    const { display, note } = stripTrailingNote('Reply text.\n\n**NOTE:** constraint set');
    expect(display).toBe('Reply text.');
    expect(note).toBe('constraint set');
  });

  it('keeps a NOTE that is not the last line', () => {
    const text = 'NOTE: earlier context\n\nActual closing answer.';
    const { display, note } = stripTrailingNote(text);
    expect(display).toBe(text);
    expect(note).toBeNull();
  });

  it('returns empty note content when the line is a bare marker', () => {
    const { display, note } = stripTrailingNote('Answer.\nNOTE:');
    expect(display).toBe('Answer.');
    expect(note).toBe('');
  });

  it('leaves NOTE-free text byte-identical', () => {
    const text = 'Plain answer with **bold** text.';
    expect(stripTrailingNote(text)).toEqual({ display: text, note: null });
  });

  it('handles empty text', () => {
    expect(stripTrailingNote('')).toEqual({ display: '', note: null });
  });
});

describe('NOTE_ECHO_ENABLED', () => {
  it('defaults OFF per F1 (Arijit is deciding whether the NOTE stays)', () => {
    expect(NOTE_ECHO_ENABLED).toBe(false);
  });
});

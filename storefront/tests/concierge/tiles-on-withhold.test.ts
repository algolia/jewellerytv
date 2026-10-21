import { describe, expect, it } from 'vitest';
import { extractNativePresentation } from '../../src/concierge/nativeResults';

/**
 * Tiles on withhold (DIAG-11, from the temp6 q06/q07/q24 and temp5 q09 raw
 * SSE captures).
 *
 * Measured shape of every withheld-with-tiles turn: request 1 searches and
 * checks; request 2 calls arrange_groups and its output arrives; request 3
 * streams the answer and ends with a data-guardrail-violation, which the SDK
 * answers by REPLACING the latest assistant message with the fixed notice
 * text. The earlier assistant message holding the successful arrange_groups
 * output survives in the messages array — but extractNativePresentation only
 * read the LATEST assistant message, so staging found nothing and the shopper
 * saw a notice with no tiles even though tool-verified tiles existed.
 *
 * The fixtures replay the captured event order and the captured tool inputs
 * verbatim (temp6 q06; the q07/q24/q09 shapes are the same three-request
 * pattern with the guardrail on the last request).
 */

const arrangeOutput = {
  status: 'ok',
  groups: [
    {
      title: 'Opal Rings',
      items: [
        { objectID: 'WPG152', link: '/product/WPG152' },
        { objectID: 'WPD917', link: '/product/WPD917' },
      ],
    },
    {
      title: 'Opal Necklaces and Pendants',
      items: [{ objectID: 'WPD441', link: '/product/WPD441' }],
    },
    {
      title: 'Opal Earrings',
      items: [{ objectID: 'WPD619', link: '/product/WPD619' }],
    },
  ],
  dropped: [],
  shortfall: [],
};

const searchOutput = {
  hits: [
    { objectID: 'WPG152', Catalog_TitleDescription: 'Opal ring', Pricing_ActivePrice: 210 },
    { objectID: 'WPD917', Catalog_TitleDescription: 'Opal ring 2', Pricing_ActivePrice: 189 },
  ],
};

const userMessage = {
  id: 'shopper-q06',
  role: 'user',
  parts: [{ type: 'text', text: 'Show me opal jewelry' }],
};

/** The three assistant messages the SDK holds after temp6 q06 settled. */
const q06Messages = [
  userMessage,
  {
    id: 'assistant-q06-a1',
    role: 'assistant',
    parts: [
      { type: 'step-start' },
      { type: 'tool-algolia_search_index_prod_catalog', toolCallId: 't1', state: 'output-available', input: {}, output: searchOutput },
      { type: 'step-start' },
      { type: 'tool-check_price', toolCallId: 't2', state: 'output-available', input: {}, output: {} },
      { type: 'tool-check_stock', toolCallId: 't3', state: 'output-available', input: {}, output: {} },
      { type: 'text', text: 'Let me see what we have in opals.', state: 'done' },
    ],
  },
  {
    id: 'assistant-q06-a2',
    role: 'assistant',
    parts: [
      { type: 'step-start' },
      { type: 'tool-arrange_groups', toolCallId: 't4', state: 'output-available', input: {}, output: arrangeOutput },
    ],
  },
  {
    id: 'assistant-q06-a3',
    role: 'assistant',
    parts: [
      { type: 'text', text: '[System notice] Part of the generated answer could not be supported reliably and was withheld. Please retry.', state: 'done' },
    ],
  },
] as never;

describe('tiles on withhold (temp6 q06/q07/q24, temp5 q09)', () => {
  it('finds the successful arrange_groups output from the earlier assistant message when the latest message is the guardrail notice', () => {
    const presentation = extractNativePresentation(q06Messages);
    expect(presentation).not.toBeNull();
    expect(presentation?.groups.map((g) => g.title)).toEqual([
      'Opal Rings',
      'Opal Necklaces and Pendants',
      'Opal Earrings',
    ]);
    expect(presentation?.groups[0].objectIDs).toEqual(['WPG152', 'WPD917']);
  });

  it('still prefers the latest assistant message when it carries the presentation itself', () => {
    const messages = [
      userMessage,
      {
        id: 'assistant-ok',
        role: 'assistant',
        parts: [
          { type: 'step-start' },
          { type: 'tool-arrange_groups', toolCallId: 't9', state: 'output-available', input: {}, output: arrangeOutput },
          { type: 'text', text: 'Here is the spread.', state: 'done' },
        ],
      },
    ] as never;
    const presentation = extractNativePresentation(messages);
    expect(presentation?.groups).toHaveLength(3);
  });

  it('returns nothing when no assistant message holds an arrange or grouped output', () => {
    const messages = [
      userMessage,
      {
        id: 'assistant-plain',
        role: 'assistant',
        parts: [{ type: 'text', text: 'A conversational answer.', state: 'done' }],
      },
    ] as never;
    expect(extractNativePresentation(messages)).toBeNull();
  });
});

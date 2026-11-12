import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { STARTER_QUESTIONS, StarterChips } from '../../src/concierge/chat/StarterChips';

/* The welcome screen is five fixed suggestions (2026-11-12), down from a
 * 31-question pool with variety rules, a weighted selector and two more
 * chips derived from live facet counts. What is left worth asserting is the
 * shape of the set and that every one of them can be sent. */

describe('the starter set', () => {
  it('is five, and they are distinct', () => {
    expect(STARTER_QUESTIONS).toHaveLength(5);
    expect(new Set(STARTER_QUESTIONS).size).toBe(5);
  });

  /* The five are picked to show the range rather than to be the best five:
   * two about what has been on air, two about finding a piece, one about
   * service. Drop the on-air pair and a shopper never learns the panel can
   * answer that; drop the service one and they never learn it should. */
  it('covers broadcast, the catalogue and service', () => {
    const onAir = STARTER_QUESTIONS.filter((q) => /on air|Jewel School/i.test(q));
    const service = STARTER_QUESTIONS.filter((q) => /returns/i.test(q));
    expect(onAir).toHaveLength(2);
    expect(service).toHaveLength(1);
    expect(STARTER_QUESTIONS.length - onAir.length - service.length).toBe(2);
  });

  /* The agent cannot see the live schedule and the prompt forbids it saying
   * what is on now, so a starter must never ask. */
  it('never asks what is on air right now', () => {
    for (const q of STARTER_QUESTIONS) {
      expect(q, q).not.toMatch(/right now|on now|currently|live now/i);
    }
  });
});

describe('the empty state', () => {
  it('renders every starter as its own sendable control', () => {
    const html = renderToStaticMarkup(<StarterChips sendMessage={() => undefined} />);
    expect(html.match(/class="jtv-chat-starter"/g)).toHaveLength(5);
    for (const question of STARTER_QUESTIONS) {
      // Apostrophes render as entities, so compare on the escaped form.
      expect(html).toContain(question.replace(/'/g, '&#x27;'));
    }
  });

  /* The wordmark gave way to a heading and a sentence (JTV, 2026-11-12): a
   * shopper who has never used this needs telling what it is, and the brand
   * is already on the page behind the panel. */
  it('says what the thing is instead of showing the wordmark', () => {
    const html = renderToStaticMarkup(<StarterChips sendMessage={() => undefined} />);
    expect(html).toContain('What can we help you find?');
    expect(html).toContain('your personal jewelry shopper');
    expect(html).not.toContain('jtv-logo-full.png');
  });

  /* Mid-turn everything goes down: sending a second question under a
   * streaming answer would queue one the shopper cannot see. */
  it('disables the chips mid-turn', () => {
    const html = renderToStaticMarkup(
      <StarterChips sendMessage={() => undefined} status="streaming" />,
    );
    expect(html.match(/disabled=""/g)).toHaveLength(5);
  });

  /* Without a sender the chips can do nothing, so they render disabled
   * rather than lying about what a click will do. */
  it('disables the chips when the widget hands over no sender', () => {
    const html = renderToStaticMarkup(<StarterChips />);
    expect(html.match(/disabled=""/g)).toHaveLength(5);
  });

  it('lays the starters out as one list', () => {
    const html = renderToStaticMarkup(<StarterChips sendMessage={() => undefined} />);
    expect(html).toContain('jtv-chat-starters-list');
    expect(html.match(/<li>/g)).toHaveLength(5);
  });
});

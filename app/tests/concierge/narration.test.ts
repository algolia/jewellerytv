import { describe, expect, it } from 'vitest';
import { isNarration } from '../../src/concierge/chat/narration';

/* Every string here was emitted by the live agent on 2026-11-04 unless
 * marked otherwise. */
describe('narration the shopper should not read', () => {
  it('catches the model announcing its own work', () => {
    for (const text of [
      "I'll search for garnet pendants for you.",
      "I'll search for rose gold jewelry under $300 for you.",
      "I'll search for Judith Ripka jewelry.",
      "I'll search our catalog for Gems en Vogue pieces.",
      'Let me correct that search with the right facet format.',
      'Let me search for Gems en Vogue pieces directly with the query.',
      'Now let me display a selection from the new collection, organized by piece type.',
    ]) {
      expect(isNarration(text), text).toBe(true);
    }
  });

  /* A four-search turn on "help me find a mother's day ring for my mom".
   * Each block grades the search that just ran and then announces the next
   * one, so the announcement is the second sentence rather than the first. */
  it('catches an announcement behind a verdict on the last search', () => {
    for (const text of [
      'The search returned results with "mother" in product names but not traditional mothers rings with birthstone settings. Let me search more specifically:',
      "That search found one piece but not what is typically called a mother's ring. Let me try another approach:",
      'These results are mostly pendants and charms. Let me search specifically for mothers rings with multiple gemstones:',
      'The catalog appears to focus more on mother-of-pearl rings rather than traditional mothers rings with multiple birthstones. Let me show you the best options we have:',
    ]) {
      expect(isNarration(text), text).toBe(true);
    }
  });

  /* Responding to the person before the shopping work is asked for by the
   * instructions, and reads nothing like a progress report. */
  it('leaves a warm opening alone', () => {
    for (const text of [
      "I'd love to help you find something special to celebrate this milestone.",
      "I'd love to help you find earrings that feel comfortable to wear.",
      'That is a thoughtful gift.',
    ]) {
      expect(isNarration(text), text).toBe(false);
    }
  });

  it('leaves the reply alone', () => {
    for (const text of [
      'Opal runs deep in our catalog, from classic white varieties to striking black stones.',
      'Gems en Vogue runs bold and colourful, with large unusual stones in substantial settings.',
      'Let me know what you think once you have had a look at these.',
    ]) {
      expect(isNarration(text), text).toBe(false);
    }
  });

  /* A long block that happens to start with "Let me" is doing more than
   * announcing, so the length guard keeps it. */
  it('keeps anything long enough to carry content', () => {
    const long =
      'Let me show you three directions here: the Ethiopian opals run milky and pale, the black ' +
      'opals are far darker with flashes of green and red, and the lab-created pieces sit well ' +
      'below both on price while looking close to the naturals.';
    expect(isNarration(long)).toBe(false);
  });

  it('is false for nothing at all', () => {
    expect(isNarration(undefined)).toBe(false);
    expect(isNarration('   ')).toBe(false);
  });
});

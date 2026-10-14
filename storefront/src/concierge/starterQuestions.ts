/**
 * Analytics-grounded starter question pool for the Concierge welcome screen.
 *
 * Every question maps to a scenario theme with aggregate search-demand
 * evidence from the read-only Algolia Analytics API (2026-10-14); the
 * theme-to-demand table, curation rules and the composition rebalance after
 * review feedback live in
 * docs/workspace/analytics-starter-questions-2026-10-14/02-provenance.md.
 * Demand evidence is aggregate theme data only: never raw shopper queries and
 * never inventory counts. These are fixed UI labels, not agent replies.
 *
 * Composition: `voice` forces sentence-form variety (show / question / tell)
 * and `theme` forces scenario variety (discovery, style, brand, occasion,
 * value, service, and the narrower intelligence surfaces). One set must not
 * sound like the same sentence with swapped nouns.
 */

export type StarterSource = 'prod_catalog' | 'help_content';

export type StarterTheme =
  | 'discovery'
  | 'style'
  | 'brand'
  | 'occasion'
  | 'value'
  | 'service'
  | 'new'
  | 'personalization'
  | 'preference'
  | 'care';

export type StarterVoice = 'show' | 'question' | 'tell';

export type StarterQuestion = {
  label: string;
  theme: StarterTheme;
  voice: StarterVoice;
  source: StarterSource;
};

export const STARTER_QUESTION_POOL: readonly StarterQuestion[] = [
  { label: 'Show me moissanite rings', theme: 'discovery', voice: 'show', source: 'prod_catalog' },
  { label: 'Show me tanzanite rings', theme: 'discovery', voice: 'show', source: 'prod_catalog' },
  { label: 'Show me pearl earrings', theme: 'discovery', voice: 'show', source: 'prod_catalog' },
  {
    label: 'Show me sterling silver jewelry',
    theme: 'discovery',
    voice: 'show',
    source: 'prod_catalog',
  },
  { label: 'Show me cross necklaces', theme: 'discovery', voice: 'show', source: 'prod_catalog' },
  { label: 'Show me opal jewelry', theme: 'discovery', voice: 'show', source: 'prod_catalog' },
  {
    label: 'Do you have gold hoop earrings?',
    theme: 'discovery',
    voice: 'question',
    source: 'prod_catalog',
  },
  { label: 'Help me build a ring stack', theme: 'style', voice: 'tell', source: 'prod_catalog' },
  {
    label: 'Show me Southwest Style jewelry',
    theme: 'style',
    voice: 'show',
    source: 'prod_catalog',
  },
  { label: 'Show me Judith Ripka jewelry', theme: 'brand', voice: 'show', source: 'prod_catalog' },
  { label: 'Show me Gems en Vogue jewelry', theme: 'brand', voice: 'show', source: 'prod_catalog' },
  {
    label: "What's new in the collection?",
    theme: 'new',
    voice: 'question',
    source: 'prod_catalog',
  },
  {
    label: 'Help me find my birthstone',
    theme: 'personalization',
    voice: 'tell',
    source: 'prod_catalog',
  },
  {
    label: "I'm looking for wedding ring sets",
    theme: 'occasion',
    voice: 'tell',
    source: 'prod_catalog',
  },
  {
    label: "I'm looking for an anniversary gift",
    theme: 'occasion',
    voice: 'tell',
    source: 'prod_catalog',
  },
  {
    label: 'Help me find a mothers ring for my mom',
    theme: 'occasion',
    voice: 'tell',
    source: 'prod_catalog',
  },
  { label: 'I only wear white gold', theme: 'preference', voice: 'tell', source: 'prod_catalog' },
  {
    label: 'How do I clean and care for my jewelry?',
    theme: 'care',
    voice: 'question',
    source: 'help_content',
  },
  {
    label: 'What types of auctions does JTV have?',
    theme: 'service',
    voice: 'question',
    source: 'help_content',
  },
  {
    label: 'How can I watch JTV live?',
    theme: 'service',
    voice: 'question',
    source: 'help_content',
  },
  {
    label: 'How do I return an item?',
    theme: 'service',
    voice: 'question',
    source: 'help_content',
  },
  {
    label: 'How does StretchPay financing work?',
    theme: 'service',
    voice: 'question',
    source: 'help_content',
  },
  { label: 'Show me jewelry on clearance', theme: 'value', voice: 'show', source: 'prod_catalog' },
  {
    label: 'Show me engagement rings under $1,000',
    theme: 'value',
    voice: 'show',
    source: 'prod_catalog',
  },
];

/**
 * Pick a varied starter set for one welcome view: `size` distinct questions,
 * at most `cap` per theme and per voice while the pool allows, excluding the
 * labels the previous welcome view showed so consecutive sets differ. Pure:
 * the optional rng keeps selection deterministic under test.
 */
export function selectStarterSet(
  pool: readonly StarterQuestion[],
  previousLabels: readonly string[] = [],
  rng: () => number = Math.random,
  size = 5,
): readonly StarterQuestion[] {
  const previous = new Set(previousLabels);
  const eligible = pool.filter((question) => !previous.has(question.label));
  const candidates = eligible.length >= size ? eligible : [...pool];
  const shuffled = [...candidates];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  for (const cap of [2, 3, Number.POSITIVE_INFINITY]) {
    const perTheme = new Map<StarterTheme, number>();
    const perVoice = new Map<StarterVoice, number>();
    const picked: StarterQuestion[] = [];
    for (const question of shuffled) {
      const themeUsed = perTheme.get(question.theme) ?? 0;
      const voiceUsed = perVoice.get(question.voice) ?? 0;
      if (themeUsed >= cap || voiceUsed >= cap) continue;
      perTheme.set(question.theme, themeUsed + 1);
      perVoice.set(question.voice, voiceUsed + 1);
      picked.push(question);
      if (picked.length === size) return picked;
    }
  }
  return shuffled.slice(0, size);
}

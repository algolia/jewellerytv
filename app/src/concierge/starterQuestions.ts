/**
 * Analytics-grounded starter question pool for the Concierge welcome screen.
 *
 * Every question maps to a scenario theme with aggregate search-demand
 * evidence from the read-only Algolia Analytics API (2026-10-14; refreshed
 * 2026-10-23: anniversary band 731/12m, christmas/holiday jewelry 324/90d,
 * new arrivals 365/90d, engagement and wedding rings 301/90d, mothers ring
 * 106); the theme-to-demand table, curation rules and the composition
 * rebalance live in
 * docs/workspace/analytics-starter-questions-2026-10-14/02-provenance.md.
 * Demand evidence is aggregate theme data only: never raw shopper queries and
 * never inventory counts. These are fixed UI labels, not agent replies.
 *
 * Composition (rebuilt 2026-10-23 per Arijit's direction, corrected after his
 * review: never truncate a question into a fragment): full natural questions
 * in varied sentence forms, with the NEW weight on gift and occasion chips
 * ("I'm buying a gift", "A watch for dad", graduation, Christmas) so a set
 * opens conversations, not just searches. `voice` forces sentence-form
 * variety (show / question / tell) and `theme` forces scenario variety; one
 * set must not sound like the same sentence with swapped nouns.
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
  { label: "I'm buying a gift", theme: 'occasion', voice: 'tell', source: 'prod_catalog' },
  { label: 'Help me find an anniversary gift', theme: 'occasion', voice: 'tell', source: 'prod_catalog' },
  { label: 'What should I get for a graduation gift?', theme: 'occasion', voice: 'question', source: 'prod_catalog' },
  { label: 'A watch for dad', theme: 'occasion', voice: 'tell', source: 'prod_catalog' },
  { label: 'Show me Christmas gift ideas', theme: 'occasion', voice: 'show', source: 'prod_catalog' },
  { label: "I'm looking for wedding ring sets", theme: 'occasion', voice: 'tell', source: 'prod_catalog' },
  { label: 'Help me find a mothers ring for my mom', theme: 'occasion', voice: 'tell', source: 'prod_catalog' },
  { label: 'Show me moissanite rings', theme: 'discovery', voice: 'show', source: 'prod_catalog' },
  { label: 'Show me opal jewelry', theme: 'discovery', voice: 'show', source: 'prod_catalog' },
  { label: 'Do you have gold hoop earrings?', theme: 'discovery', voice: 'question', source: 'prod_catalog' },
  { label: 'Show me pearl earrings', theme: 'discovery', voice: 'show', source: 'prod_catalog' },
  { label: 'Show me cross necklaces', theme: 'discovery', voice: 'show', source: 'prod_catalog' },
  { label: 'Show me handbags and accessories', theme: 'discovery', voice: 'show', source: 'prod_catalog' },
  { label: 'Show me tanzanite rings', theme: 'discovery', voice: 'show', source: 'prod_catalog' },
  { label: 'Help me build a ring stack', theme: 'style', voice: 'tell', source: 'prod_catalog' },
  { label: 'Show me Southwest Style jewelry', theme: 'style', voice: 'show', source: 'prod_catalog' },
  { label: 'Show me Judith Ripka jewelry', theme: 'brand', voice: 'show', source: 'prod_catalog' },
  { label: 'Show me Gems en Vogue jewelry', theme: 'brand', voice: 'show', source: 'prod_catalog' },
  { label: 'Help me find my birthstone', theme: 'personalization', voice: 'tell', source: 'prod_catalog' },
  { label: 'I only wear white gold', theme: 'preference', voice: 'tell', source: 'prod_catalog' },
  { label: "What's new in the collection?", theme: 'new', voice: 'question', source: 'prod_catalog' },
  { label: 'Show me clearance jewelry', theme: 'value', voice: 'show', source: 'prod_catalog' },
  { label: 'Show me engagement rings under $1,000', theme: 'value', voice: 'show', source: 'prod_catalog' },
  { label: 'How do I clean my jewelry?', theme: 'care', voice: 'question', source: 'help_content' },
  { label: 'How do auctions work?', theme: 'service', voice: 'question', source: 'help_content' },
  { label: 'How can I watch JTV live?', theme: 'service', voice: 'question', source: 'help_content' },
  { label: 'How do returns work?', theme: 'service', voice: 'question', source: 'help_content' },
  { label: 'Surprise me', theme: 'discovery', voice: 'tell', source: 'prod_catalog' },
  { label: 'Treat myself', theme: 'occasion', voice: 'tell', source: 'prod_catalog' },
  { label: 'I have a $200 budget', theme: 'value', voice: 'tell', source: 'prod_catalog' },
  { label: 'Lab-grown or natural?', theme: 'discovery', voice: 'question', source: 'prod_catalog' },
  { label: 'Vintage or modern?', theme: 'style', voice: 'question', source: 'prod_catalog' },
  { label: 'What goes with gold hoops?', theme: 'style', voice: 'question', source: 'prod_catalog' },
  { label: 'Show me something bold', theme: 'style', voice: 'show', source: 'prod_catalog' },
  { label: "What's new for the holidays?", theme: 'new', voice: 'question', source: 'prod_catalog' },
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

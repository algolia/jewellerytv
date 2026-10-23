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
 * Composition (rebuilt 2026-10-23 per Arijit's direction): scenario-led short
 * chips over "show me X" templates. Gift and occasion chips lead ("I'm buying
 * a gift", "Anniversary gift", "A watch for dad"), because a chip that starts
 * a conversation beats a chip that ends it. Product chips stay as short noun
 * phrases. `voice` forces sentence-form variety (show / question / tell) and
 * `theme` forces scenario variety; one set must not sound like the same
 * sentence with swapped nouns.
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
  { label: 'Anniversary gift', theme: 'occasion', voice: 'show', source: 'prod_catalog' },
  { label: 'Graduation gift', theme: 'occasion', voice: 'show', source: 'prod_catalog' },
  { label: 'A watch for dad', theme: 'occasion', voice: 'tell', source: 'prod_catalog' },
  { label: 'Christmas gift ideas', theme: 'occasion', voice: 'show', source: 'prod_catalog' },
  { label: 'Wedding ring sets', theme: 'occasion', voice: 'show', source: 'prod_catalog' },
  { label: 'A mothers ring for mom', theme: 'occasion', voice: 'tell', source: 'prod_catalog' },
  { label: 'Moissanite rings', theme: 'discovery', voice: 'show', source: 'prod_catalog' },
  { label: 'Opal jewelry', theme: 'discovery', voice: 'show', source: 'prod_catalog' },
  { label: 'Pearl earrings', theme: 'discovery', voice: 'show', source: 'prod_catalog' },
  { label: 'Gold hoop earrings', theme: 'discovery', voice: 'show', source: 'prod_catalog' },
  { label: 'Cross necklaces', theme: 'discovery', voice: 'show', source: 'prod_catalog' },
  { label: 'Handbags', theme: 'discovery', voice: 'show', source: 'prod_catalog' },
  { label: 'Help me build a ring stack', theme: 'style', voice: 'tell', source: 'prod_catalog' },
  { label: 'Southwest Style jewelry', theme: 'style', voice: 'show', source: 'prod_catalog' },
  { label: 'Judith Ripka', theme: 'brand', voice: 'show', source: 'prod_catalog' },
  { label: 'Gems en Vogue', theme: 'brand', voice: 'show', source: 'prod_catalog' },
  { label: 'Find my birthstone', theme: 'personalization', voice: 'tell', source: 'prod_catalog' },
  { label: 'I only wear white gold', theme: 'preference', voice: 'tell', source: 'prod_catalog' },
  { label: "What's new?", theme: 'new', voice: 'question', source: 'prod_catalog' },
  { label: 'Jewelry on sale', theme: 'value', voice: 'show', source: 'prod_catalog' },
  { label: 'Engagement rings under $1,000', theme: 'value', voice: 'show', source: 'prod_catalog' },
  { label: 'How do I clean my jewelry?', theme: 'care', voice: 'question', source: 'help_content' },
  { label: 'How do auctions work?', theme: 'service', voice: 'question', source: 'help_content' },
  { label: 'How can I watch JTV live?', theme: 'service', voice: 'question', source: 'help_content' },
  { label: 'How do returns work?', theme: 'service', voice: 'question', source: 'help_content' },
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

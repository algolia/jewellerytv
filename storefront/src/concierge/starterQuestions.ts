/**
 * Concise starter prompts for the Concierge welcome screen.
 *
 * The pool is curated from aggregate Algolia search themes and checked against
 * the corresponding product, blog, or Help source. Search counts and source
 * queries stay in the provenance document, never in shopper-facing UI.
 * See storefront/docs/STARTER-QUESTION-PROVENANCE.md.
 */

export type StarterSource = 'prod_catalog' | 'blog' | 'help';

export type StarterTheme =
  'gemstone' | 'pearl' | 'category' | 'occasion' | 'value' | 'size' | 'education' | 'service';

export type StarterVoice = 'show' | 'question' | 'tell';

export type StarterQuestion = {
  label: string;
  theme: StarterTheme;
  voice: StarterVoice;
  answerSource: StarterSource;
};

const STARTER_HISTORY_KEY = 'jtv-concierge-starter-history-v1';

function getSessionStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Labels shown in this browser tab, used only to vary future welcome sets. */
type StarterHistoryStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function readStarterHistory(
  storage: StarterHistoryStorage | null = getSessionStorage(),
): string[] {
  if (!storage) return [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(STARTER_HISTORY_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    const validLabels = new Set(STARTER_QUESTION_POOL.map((question) => question.label));
    return parsed.filter(
      (label): label is string => typeof label === 'string' && validLabels.has(label),
    );
  } catch {
    return [];
  }
}

/** Session-scoped UI state only; storage failures leave rotation randomized. */
export function writeStarterHistory(
  labels: readonly string[],
  storage: StarterHistoryStorage | null = getSessionStorage(),
) {
  if (!storage) return;
  try {
    storage.setItem(
      STARTER_HISTORY_KEY,
      JSON.stringify(labels.slice(-STARTER_QUESTION_POOL.length * 5)),
    );
  } catch {
    // The welcome screen still works when session storage is unavailable.
  }
}

export const STARTER_QUESTION_POOL: readonly StarterQuestion[] = [
  {
    label: 'Show me moissanite rings',
    theme: 'gemstone',
    voice: 'show',
    answerSource: 'prod_catalog',
  },
  {
    label: 'What lab-created diamond rings can I see?',
    theme: 'gemstone',
    voice: 'question',
    answerSource: 'prod_catalog',
  },
  {
    label: 'Show me green tourmaline jewelry',
    theme: 'gemstone',
    voice: 'show',
    answerSource: 'prod_catalog',
  },
  { label: 'Find pre-owned pearls', theme: 'pearl', voice: 'tell', answerSource: 'prod_catalog' },
  {
    label: 'Show me yellow-gold diamond earrings',
    theme: 'category',
    voice: 'show',
    answerSource: 'prod_catalog',
  },
  {
    label: 'Find white-gold hoop earrings',
    theme: 'category',
    voice: 'tell',
    answerSource: 'prod_catalog',
  },
  {
    label: 'Show me large hoop earrings',
    theme: 'category',
    voice: 'show',
    answerSource: 'prod_catalog',
  },
  {
    label: 'Can I see bead bracelets?',
    theme: 'category',
    voice: 'question',
    answerSource: 'prod_catalog',
  },
  {
    label: 'Show me 14k gold necklaces',
    theme: 'category',
    voice: 'show',
    answerSource: 'prod_catalog',
  },
  {
    label: 'Can I see sterling-silver chains?',
    theme: 'category',
    voice: 'question',
    answerSource: 'prod_catalog',
  },
  {
    label: "I'm looking for men's diamond jewelry",
    theme: 'category',
    voice: 'tell',
    answerSource: 'prod_catalog',
  },
  {
    label: 'I need a Sweet 16 gift',
    theme: 'occasion',
    voice: 'tell',
    answerSource: 'prod_catalog',
  },
  { label: 'Show me clearance rings', theme: 'value', voice: 'show', answerSource: 'prod_catalog' },
  {
    label: 'Can I see a size 11 ring?',
    theme: 'size',
    voice: 'question',
    answerSource: 'prod_catalog',
  },
  {
    label: 'Show me a 3-carat moissanite solitaire',
    theme: 'gemstone',
    voice: 'show',
    answerSource: 'prod_catalog',
  },
  {
    label: "I'm looking for a 16-inch necklace",
    theme: 'size',
    voice: 'tell',
    answerSource: 'prod_catalog',
  },
  {
    label: 'Show me pink tourmaline jewelry',
    theme: 'gemstone',
    voice: 'show',
    answerSource: 'prod_catalog',
  },
  {
    label: 'What turquoise and gold pieces can I explore?',
    theme: 'gemstone',
    voice: 'question',
    answerSource: 'prod_catalog',
  },
  {
    label: 'Show me multi-color rings',
    theme: 'gemstone',
    voice: 'show',
    answerSource: 'prod_catalog',
  },
  {
    label: "I'm looking for a moissanite engagement ring",
    theme: 'occasion',
    voice: 'tell',
    answerSource: 'prod_catalog',
  },
  {
    label: 'Show me moissanite wedding sets',
    theme: 'occasion',
    voice: 'show',
    answerSource: 'prod_catalog',
  },
  {
    label: "I'm looking for a moissanite anniversary ring",
    theme: 'occasion',
    voice: 'tell',
    answerSource: 'prod_catalog',
  },
  {
    label: "What's November's birthstone?",
    theme: 'education',
    voice: 'question',
    answerSource: 'blog',
  },
  { label: 'How does StretchPay work?', theme: 'service', voice: 'question', answerSource: 'help' },
  {
    label: 'What does free shipping cover?',
    theme: 'service',
    voice: 'question',
    answerSource: 'help',
  },
];

function selectVaried(
  candidates: readonly StarterQuestion[],
  rng: () => number,
  size: number,
): StarterQuestion[] {
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

/**
 * Pick a varied starter set for one welcome view. Use every unseen label before
 * cycling through the pool; balance themes and sentence forms where possible.
 * The optional rng keeps selection deterministic under test.
 */
export function selectStarterSet(
  pool: readonly StarterQuestion[],
  seenLabels: readonly string[] = [],
  rng: () => number = Math.random,
  size = 5,
): readonly StarterQuestion[] {
  const seen = new Set(seenLabels);
  const unseen = pool.filter((question) => !seen.has(question.label));
  const previousSet = new Set(seenLabels.slice(-size));
  if (!unseen.length) {
    const nextCycle = pool.filter((question) => !previousSet.has(question.label));
    return selectVaried(nextCycle.length >= size ? nextCycle : pool, rng, size);
  }
  if (unseen.length >= size) return selectVaried(unseen, rng, size);

  const fresh = selectVaried(unseen, rng, unseen.length);
  const freshLabels = new Set(fresh.map((question) => question.label));
  const need = size - fresh.length;
  const preferredFillers = pool.filter(
    (question) => !freshLabels.has(question.label) && !previousSet.has(question.label),
  );
  const fillerPool =
    preferredFillers.length >= need
      ? preferredFillers
      : [
          ...preferredFillers,
          ...pool.filter(
            (question) => !freshLabels.has(question.label) && previousSet.has(question.label),
          ),
        ];
  const fillers = selectVaried(fillerPool, rng, need);
  return [...fresh, ...fillers];
}

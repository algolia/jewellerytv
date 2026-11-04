import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChatText, displayText, keepSentence } from '../../src/concierge/chat/chatText';

/* Display contract (Arijit, 2026-11-04): the model writes its voice AND its
 * processing narration interleaved, all before the display tool. Sentences
 * that narrate the model's own work never render; the human moment, the
 * guidance and the closing question render exactly as written. */

const text = (s: string) => ({ type: 'text', text: s });

describe('sentence-level narration filter', () => {
  it('drops the measured process sentences', () => {
    expect(keepSentence("I'll search for what's new and holiday-focused across our catalog to start.")).toBe(false);
    expect(keepSentence('That search returned just one result, which is too narrow for graduation choices.')).toBe(false);
    expect(keepSentence('Great! Now I have a strong selection of pieces across styles and budgets.')).toBe(false);
    expect(keepSentence('The search gave me ornaments and holiday charms alongside everyday pieces.')).toBe(false);
    expect(keepSentence('The results lean heavily on lab-created strontium titanate alternatives.')).toBe(false);
    expect(keepSentence('The results are heavy on lab-created strontium titanate alternatives.')).toBe(false);
    expect(keepSentence('Let me curate the best gift-worthy options for graduation.')).toBe(false);
    expect(keepSentence("Let me show you some classic gift directions that work beautifully for the occasion.")).toBe(false);
    /* Measured live 2026-11-04 on the simplified agent: "Now I'll display the
     * selection of two-tone rings." — the display announcement. */
    expect(keepSentence("Now I'll display the selection of two-tone rings.")).toBe(false);
    expect(keepSentence('Now I will narrow these to the stones she asked about.')).toBe(false);
    /* Measured on Arijit's "elegant and timeless" turn: the promise and the
     * search report, back to back. */
    expect(keepSentence("I'll find something elegant and timeless for your mom.")).toBe(false);
    expect(keepSentence('The search picked up watches alongside necklaces.')).toBe(false);
  });

  it('keeps the human moment, the guidance and the closing question', () => {
    expect(keepSentence('What a wonderful milestone to celebrate!')).toBe(true);
    expect(keepSentence('Graduation calls for something meaningful they can keep, and jewelry hits that note perfectly.')).toBe(true);
    expect(keepSentence("Congratulations on your engagement!")).toBe(true);
    expect(keepSentence("What matters most to you in a gift, a special-occasion piece, or a keepsake?")).toBe(true);
  });

  it('filters a full measured turn, keeping the voice', () => {
    const raw = [
      'What a wonderful milestone to celebrate!',
      'Graduation calls for something meaningful they can keep, and jewelry hits that note perfectly. Let me show you some classic gift directions that work beautifully for the occasion.',
      'That search returned just one result, which is too narrow for graduation choices. Let me search again to show you what we carry across different styles and budgets.',
      'Great! Now I have a strong selection of pieces across styles and budgets. Let me curate the best gift-worthy options for graduation.',
    ].join(' ');
    const out = displayText(raw);
    expect(out).toContain('What a wonderful milestone to celebrate!');
    expect(out).toContain('Graduation calls for something meaningful');
    expect(out).not.toContain('That search returned');
    expect(out).not.toContain('Great!');
    expect(out).not.toContain('Let me');
  });

  it('renders nothing when every sentence is narration', () => {
    const html = renderToStaticMarkup(
      <ChatText part={text("I'll search for engagement rings. Let me narrow it down.")} />,
    );
    expect(html).toBe('');
  });

  it('renders kept sentences with markdown intact', () => {
    const html = renderToStaticMarkup(
      <ChatText part={text('Lovely choice. See [this chain](/product/ABC123) and tell me what you think.')} />,
    );
    expect(html).toContain('/product/ABC123');
  });
});

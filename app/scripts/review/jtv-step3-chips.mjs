/* jtv-step3-chips.mjs — read-only DOM inspection of the open category page.
 * Question: are the Level-1 facet chips (a) links to sub-category URLs (merchandised)
 * or (b) JS-driven facet-count controls? Read chip texts + hrefs. NO reload. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const OUT = '/Users/arijitchowdhury/Dropbox/AI-Development/jewellerytv/app/docs/workspace/prompt-review-2026-10-26/jtv-census-latest';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223', { timeout: 15000 });
const all = browser.contexts().flatMap((c) => c.pages());
const tab = all.find((p) => /jtv\.com/.test(p.url()));

const data = await tab.evaluate(() => {
  const out = { url: location.href, title: document.title, candidateContainers: [] };
  /* Find elements whose text matches facet-chip vocabulary from the screenshots. */
  const want = ['clustering', 'cluster', 'halo', 'solitaire', 'three stone', 'side stone', 'trending'];
  const hits = [];
  for (const el of document.querySelectorAll('a, button, [role="button"], [role="link"], span, div')) {
    const t = (el.textContent ?? '').trim().toLowerCase();
    if (!t || t.length > 60) continue;
    if (want.some((w) => t.includes(w))) {
      const anchor = el.closest('a');
      hits.push({
        tag: el.tagName,
        text: (el.textContent ?? '').trim().slice(0, 60),
        href: anchor?.getAttribute('href') ?? null,
        cls: (el.className && String(el.className).slice(0, 80)) ?? '',
      });
    }
    if (hits.length > 60) break;
  }
  out.candidateContainers = hits;
  /* Also: the section headers visible near the top (facets / trending) */
  out.headers = [...document.querySelectorAll('h1,h2,h3,h4')]
    .map((h) => (h.textContent ?? '').trim())
    .filter((t) => t && t.length < 60)
    .slice(0, 25);
  return out;
});
writeFileSync(join(OUT, 'chips-dom.json'), JSON.stringify(data, null, 1));
console.log('page:', data.url);
console.log('headers:', JSON.stringify(data.headers));
console.log('\nchip-like elements:', data.candidateContainers.length);
for (const h of data.candidateContainers.slice(0, 30)) {
  console.log(` <${h.tag.toLowerCase()}> "${h.text}" ${h.href ? '-> ' + h.href.slice(0, 100) : '(no href)'} [${h.cls}]`);
}
process.exit(0);

/* jtv-step3-dom.mjs — count the three levels in the served HTML (read-only).
 * Are facet chips, trending, and products all in the server-rendered document? */
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223', { timeout: 15000 });
const all = browser.contexts().flatMap((c) => c.pages());
const tab = all.find((p) => /jtv\.com/.test(p.url()));
const dom = await tab.evaluate(() => {
  const txt = (sel) => [...document.querySelectorAll(sel)].length;
  const sample = (sel, n = 6) => [...document.querySelectorAll(sel)].slice(0, n).map((e) => (e.textContent ?? '').trim().slice(0, 60));
  // hunt for the three levels by content markers
  const body = document.body;
  const has = (s) => body.innerHTML.toLowerCase().includes(s);
  return {
    title: document.title,
    // level 1: facet chips near the top
    facetChipCandidates: [...new Set([
      ...sample('[class*="facet"] a, [class*="facet"] button', 8),
      ...sample('[class*="refinement"] a', 8),
    ])],
    // level 2: trending
    trendingMarkers: ['trending now', 'trending', 'popular right now'].filter(has),
    trendingSample: sample('[class*="trending"] *', 5),
    // level 3: products
    productTileCandidates: txt('[class*="product"] img'),
    productLinks: txt('a[href*="/product/"]'),
    // filter sidebar
    filterGroupCandidates: [...new Set([...sample('[class*="filter"] h3, [class*="facet"] h2, [class*="refinement"] h3', 10)])],
    // any JSON state blob with facet data
    stateBlobs: ['__NEXT_DATA__', 'window.__PRELOADED', 'digitalData'].filter(has),
  };
});
console.log(JSON.stringify(dom, null, 1));
process.exit(0);

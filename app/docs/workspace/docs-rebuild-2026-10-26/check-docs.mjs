/* Docs integrity check: every internal href/src resolves to a file; every
 * same-page anchor target exists; verbatim appendix blocks equal the live
 * extracts. Exit 0 only when clean. */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const root = resolve('/Users/arijitchowdhury/Dropbox/AI-Development/jewellerytv/app/public/docs');
const run = resolve('/Users/arijitchowdhury/Dropbox/AI-Development/jewellerytv/app/docs/workspace/docs-rebuild-2026-10-26');
const pages = ['index.html', 'experience.html', 'architecture.html', 'agent.html', 'examples.html', 'adopting.html', 'appendix-prompts.html'];
let fails = 0;
const fail = (m) => { fails += 1; console.log('FAIL', m); };

for (const page of pages) {
  const path = resolve(root, page);
  if (!existsSync(path)) { fail(`missing page ${page}`); continue; }
  const html = readFileSync(path, 'utf8');
  /* Local hrefs and srcs (root-relative /docs/… or same-dir ./…; skip http, mailto, pure #). */
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const target = m[1];
    if (/^(https?:|mailto:)/.test(target)) continue;
    if (target === '/') continue; /* the storefront root link */
    let file = target.split('#')[0];
    if (file.startsWith('/docs/')) file = file.slice('/docs/'.length);
    else if (file.startsWith('/')) fail(`${page}: absolute non-/docs path ${target}`);
    if (file && !existsSync(resolve(root, file))) fail(`${page}: broken link ${target}`);
  }
  /* Same-page anchors. */
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/href="#([^"]+)"/g)) {
    if (!ids.has(m[1])) fail(`${page}: missing anchor #${m[1]}`);
  }
  /* Cross-page anchors: /docs/page.html#id (or ./page.html#id). */
  for (const m of html.matchAll(/href="(?:\.\/|\/docs\/)([a-z-]+\.html)#([^"]+)"/g)) {
    const other = readFileSync(resolve(root, m[1]), 'utf8');
    const otherIds = new Set([...other.matchAll(/id="([^"]+)"/g)].map((x) => x[1]));
    if (!otherIds.has(m[2])) fail(`${page}: missing anchor ${m[1]}#${m[2]}`);
  }
}

/* Verbatim diff: appendix prompt-blocks vs live extracts. */
const html = readFileSync(resolve(root, 'appendix-prompts.html'), 'utf8');
const unescape = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
const blocks = [...html.matchAll(/<div class="prompt-block">([\s\S]*?)<\/div>/g)].map((m) => unescape(m[1]));
const byHeading = (marker) => blocks.find((b) => b.startsWith(marker));
const sysLive = readFileSync(resolve(run, 'extracted-system-prompt.md'), 'utf8').replace(/\n$/, '');
const insLive = readFileSync(resolve(run, 'extracted-instructions.md'), 'utf8').replace(/\n$/, '');
const sysDoc = byHeading('# Authority');
const insDoc = byHeading('# Role');
if (sysDoc === undefined) fail('system prompt block not found in appendix');
else if (sysDoc.trim() !== sysLive.trim()) {
  const a = sysLive.trim().split('\n'); const b = sysDoc.trim().split('\n');
  let first = 0; while (first < Math.min(a.length, b.length) && a[first] === b[first]) first += 1;
  fail(`system prompt verbatim mismatch at line ${first + 1}:\n  live: ${JSON.stringify((a[first] ?? '').slice(0, 120))}\n  doc:  ${JSON.stringify((b[first] ?? '').slice(0, 120))}`);
} else console.log('PASS system prompt verbatim (', sysLive.length, 'chars )');
if (insDoc === undefined) fail('instructions block not found in appendix');
else if (insDoc.trim() !== insLive.trim()) {
  const a = insLive.trim().split('\n'); const b = insDoc.trim().split('\n');
  let first = 0; while (first < Math.min(a.length, b.length) && a[first] === b[first]) first += 1;
  fail(`instructions verbatim mismatch at line ${first + 1}:\n  live: ${JSON.stringify((a[first] ?? '').slice(0, 120))}\n  doc:  ${JSON.stringify((b[first] ?? '').slice(0, 120))}`);
} else console.log('PASS instructions verbatim (', insLive.length, 'chars )');

console.log(fails ? `\n${fails} FAILURE(S)` : 'ALL CLEAN');
process.exit(fails ? 1 : 0);

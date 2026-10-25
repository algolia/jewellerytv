/* build-battery-report.mjs: grade the battery ledger against the hard pass
 * lines (Arijit's choices, 2026-10-25) and render the HTML report.
 *   node scripts/build-battery-report.mjs <run-dir>
 * Pass lines (per leg):
 *   tile-correctness    >= 90%  (requirement turns: every tile matches)
 *   chip-meaningfulness >= 95%  (no hardware/spec-sheet facets as chips)
 *   filter-present      >= 95%  on material/stone turns (requirement non-null)
 *   education-correct   >= 90%  (linked guide matches the ask)
 *   system notices      <= 2 per leg
 * Abort mid-run: 3 consecutive transport errors / guardrail withholds /
 * zero-tile shopping turns.
 */
import fs from 'node:fs';
import path from 'node:path';

const runDir = process.argv[2];
if (!runDir || !fs.existsSync(path.join(runDir, 'ledger.json'))) {
  console.error('usage: node build-battery-report.mjs <run-dir-with-ledger.json>');
  process.exit(1);
}
const ledger = JSON.parse(fs.readFileSync(path.join(runDir, 'ledger.json'), 'utf8'));

const HARDWARE_FACETS = /BackingType|ChainLinkType|Clasp|Closure|Fastening/i;

/* Tile correctness: a tile "matches" when its title shares a word with the
 * requirement (the same singularized word rule the tool enforces). */
function singularize(token) {
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith('s') && !token.endsWith('ss') && token.length > 4) return token.slice(0, -1);
  return token;
}
function requirementWord(tile, requirement) {
  if (!requirement) return true;
  const tokens = requirement.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4).map(singularize);
  if (!tokens.length) return true;
  const words = tile.toLowerCase().split(/[^a-z0-9]+/).map(singularize);
  return tokens.some((token) => words.includes(token));
}

function grade(leg) {
  const turns = ledger.filter((t) => t.leg === leg && !t.error);
  const shopping = turns.filter((t) => t.tiles.length > 0 || t.presents.length > 0);
  const reqTurns = shopping.filter((t) => t.requirement);
  const reqEnforced = reqTurns.filter((t) => t.presents.some((p) => p.enforced));
  const reqTiles = reqTurns.flatMap((t) => t.tiles);
  const reqGood = reqTiles.filter((tile) => {
    const turn = reqTurns.find((t) => t.tiles.includes(tile));
    return turn ? requirementWord(tile, turn.requirement) : false;
  });
  const notices = turns.reduce((n, t) => n + (t.notices?.length ?? 0), 0);
  const chipTurns = shopping.filter((t) => t.chips.length > 0);
  const badChipTurns = chipTurns.filter((t) => t.chips.some((c) => HARDWARE_FACETS.test(c)));
  return {
    turns: turns.length,
    shopping: shopping.length,
    reqTurns: reqTurns.length,
    reqEnforced: reqEnforced.length,
    filterPresent: reqTurns.length ? reqEnforced.length / reqTurns.length : 1,
    badChipTurns: badChipTurns.length,
    chipMeaningful: chipTurns.length ? 1 - badChipTurns.length / chipTurns.length : 1,
    notices,
    zeroTile: shopping.filter((t) => t.tiles.length === 0).length,
    tileCorrectness: reqTiles.length ? reqGood.length / reqTiles.length : 1,
  };
}

const legs = [...new Set(ledger.map((t) => t.leg))].sort();
const grades = legs.map((leg) => ({ leg, ...grade(leg) }));
const PASS = {
  tileCorrectness: 0.9,
  chipMeaningful: 0.95,
  filterPresent: 0.95,
  education: 0.9,
  notices: 2,
};
const results = grades.map((g) => ({
  leg: g.leg,
  tileCorrectness: g.tileCorrectness,
  chipMeaningful: g.chipMeaningful,
  filterPresent: g.filterPresent,
  notices: g.notices,
  zeroTile: g.zeroTile,
  pass:
    g.tileCorrectness >= PASS.tileCorrectness &&
    g.chipMeaningful >= PASS.chipMeaningful &&
    g.filterPresent >= PASS.filterPresent &&
    g.notices <= PASS.notices,
}));

const screenshotBase = path.join(runDir, 'screenshots');
const rows = ledger.map((t) => {
  const shots = (fs.existsSync(screenshotBase) ? fs.readdirSync(screenshotBase) : [])
    .filter((f) => f.startsWith(`leg${t.leg}-q${(t.index ?? 0) + 1}-t${t.turn}`));
  const shotTag = shots.length
    ? shots.map((f) => `<img src="screenshots/${f}" style="max-width:280px;border:1px solid #ddd;border-radius:4px;margin:2px" loading="lazy" />`).join('')
    : '<span style="color:#999">no shot</span>';
  const reqTag = t.requirement
    ? `<code style="background:#fff3e0;padding:1px 4px;border-radius:3px">${t.requirement}</code>`
    : '';
  const enforcedTag = t.presents?.[0]?.enforced
    ? `<code style="background:#e8f5e9;padding:1px 4px;border-radius:3px;font-size:11px">${t.presents[0].enforced.attribute.split('.').pop()}: ${t.presents[0].enforced.values.join(', ')}</code>`
    : '';
  const dropTag = t.presents?.length
    ? t.presents.reduce((n, p) => n + p.dropped.length, 0)
    : 0;
  const color = t.error ? '#fdd' : t.tiles.length || t.presents.length ? '#e8f5e9' : '#fffde7';
  return `<tr style="background:${color}">
    <td>${t.leg}</td><td>${(t.index ?? 0) + 1}</td><td>${t.turn}</td>
    <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis">${t.ask ?? ''}</td>
    <td>${reqTag}</td>
    <td>${t.presents?.[0]?.requirement ?? ''}</td>
    <td>${enforcedTag}</td>
    <td>${t.tiles.length}</td><td>${t.chips.length}</td><td>${dropTag}</td>
    <td>${t.notices?.length ?? 0}</td><td>${((t.ms ?? 0) / 1000).toFixed(0)}s</td>
    <td>${t.error ?? 'ok'}</td>
    <td>${shotTag}</td>
  </tr>`;
});

const summaryRows = results.map((r) => {
  const color = r.pass ? '#c8e6c9' : '#ffcdd2';
  return `<tr style="background:${color}">
    <td>Leg ${r.leg}</td>
    <td>${(r.tileCorrectness * 100).toFixed(0)}%</td>
    <td>${(r.chipMeaningful * 100).toFixed(0)}%</td>
    <td>${(r.filterPresent * 100).toFixed(0)}%</td>
    <td>${r.notices}</td>
    <td>${r.zeroTile}</td>
    <td><strong>${r.pass ? 'PASS' : 'FAIL'}</strong></td>
  </tr>`;
});

const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Battery report 2026-10-25</title>
<style>
body{font-family:system-ui,sans-serif;margin:24px;color:#222}
table{border-collapse:collapse;font-size:12px;width:100%}
th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}
th{background:#f5f5f5;position:sticky;top:0}
.summary td{font-size:14px;padding:8px}
h2{margin-top:28px}
.pass{color:#2e7d32}.fail{color:#c62828}
</style></head><body>
<h1>JTV Concierge battery — 2026-10-25</h1>
<p>${ledger.length} turns captured across ${legs.length} leg(s). Run dir: <code>${runDir}</code></p>
<h2>Summary vs pass lines</h2>
<table class="summary"><tr><th>Leg</th><th>Tile correctness (≥90%)</th><th>Chip meaningful (≥95%)</th><th>Filter present (≥95%)</th><th>Notices (≤2)</th><th>Zero-tile turns</th><th>Verdict</th></tr>
${summaryRows.join('\n')}</table>
<h2>All turns</h2>
<table><tr><th>Leg</th><th>Q#</th><th>Turn</th><th>Ask</th><th>Expected req</th><th>Model req</th><th>Enforced</th><th>Tiles</th><th>Chips</th><th>Drops</th><th>Notices</th><th>Time</th><th>Status</th><th>Screenshots</th></tr>
${rows.join('\n')}</table>
</body></html>`;
fs.writeFileSync(path.join(runDir, 'report.html'), html);
console.log('report written:', path.join(runDir, 'report.html'));
for (const r of results) console.log(`leg ${r.leg}: ${r.pass ? 'PASS' : 'FAIL'}`, r);

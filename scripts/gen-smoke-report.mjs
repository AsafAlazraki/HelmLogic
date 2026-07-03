// Generate the HelmLogic Smoke Test Report PDF from test-results/smoke-data.json.
// Usage: node scripts/gen-smoke-report.mjs [reportDate]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = process.cwd();
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'test-results', 'smoke-data.json'), 'utf8'));
const OUT_PDF = path.join(ROOT, 'tasks', 'HelmLogic_Smoke_Test_Report.pdf');
const DATE = process.argv[2] || new Date().toISOString().slice(0, 10);

const bySection = {};
for (const c of DATA.checks) {
  const s = (bySection[c.section] ||= { pass: 0, fail: 0, fails: [] });
  if (c.ok) s.pass++;
  else { s.fail++; s.fails.push(c); }
}
const passRate = DATA.total ? ((DATA.passed / DATA.total) * 100).toFixed(2) : '0';

const SECTION_BLURB = {
  'A. App routes': 'Every application route served by a production build of HelmLogic answers HTTP 200, renders the app shell, and shows no error boundary.',
  'B. Security rules': 'Signed in as the canonical operator user, every operator-facing Firestore collection and collection-group path is readable exactly as the deployed security rules intend.',
  'C. Catalog': 'Every Highfield range, model and variant in the live catalog is walked one-by-one: names present, variant sell prices positive numbers when set, costs non-negative.',
  'D. Quotes': 'Every quote in the organisation is checked: correct organisation linkage, non-negative totals, lifecycle state within the known state machine.',
  'E. Org config': 'Exchange rates, fit-up catalog and service catalog entries have well-formed, non-negative pricing fields.',
  'F. Ceremony': 'Every release flagged shipped has its release notes and user guide present in the repository (drives the in-app Release Notes timeline).',
  'H. Roadmap': 'Every feature card carries a valid status and no planned story is stranded inside an already-shipped release column.',
};

const sectionRows = Object.entries(bySection).sort(([a], [b]) => a.localeCompare(b)).map(([name, s]) => {
  const ok = s.fail === 0;
  return `<tr><td><b>${name}</b><div class="blurb">${SECTION_BLURB[name] || ''}</div></td>
    <td class="num">${s.pass + s.fail}</td><td class="num">${s.pass}</td><td class="num">${s.fail}</td>
    <td class="${ok ? 'ok' : 'bad'}">${ok ? 'PASS' : 'FAIL'}</td></tr>`;
}).join('');

const failRows = DATA.checks.filter(c => !c.ok).map(c =>
  `<tr><td>${c.section}</td><td>${c.name}</td><td>${c.detail || ''}</td></tr>`).join('');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
* { box-sizing: border-box; }
body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #12233b; margin: 0; padding: 40px 44px; font-size: 12px; }
h1 { font-size: 24px; margin: 0 0 2px; color: #0b1f3a; }
h2 { font-size: 15px; margin: 26px 0 8px; color: #0b1f3a; border-bottom: 2px solid #c9a24b; padding-bottom: 4px; }
.sub { color: #5a6b82; margin: 0 0 18px; font-size: 12px; }
.cards { display: flex; gap: 12px; margin: 14px 0 6px; }
.card { flex: 1; border: 1px solid #dce3ec; border-radius: 8px; padding: 12px 14px; background: #f7f9fc; text-align: center; }
.card .n { font-size: 30px; font-weight: 800; color: #0b1f3a; }
.card.green .n { color: #12794a; }
.card .l { font-size: 10.5px; color: #5a6b82; text-transform: uppercase; letter-spacing: .05em; }
table { width: 100%; border-collapse: collapse; margin: 6px 0 4px; }
th, td { text-align: left; padding: 7px 9px; border-bottom: 1px solid #e7edf4; font-size: 11.5px; vertical-align: top; }
th { background: #0b1f3a; color: #fff; font-weight: 600; }
td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ok { color: #12794a; font-weight: 800; }
.bad { color: #b5341f; font-weight: 800; }
.blurb { color: #5a6b82; font-weight: 400; font-size: 10.5px; margin-top: 3px; }
.note { background: #f7f9fc; border-left: 3px solid #c9a24b; padding: 10px 14px; margin: 12px 0; font-size: 11.5px; line-height: 1.55; }
.foot { margin-top: 26px; color: #8595a8; font-size: 10px; border-top: 1px solid #e7edf4; padding-top: 8px; }
</style></head><body>
<h1>HelmLogic — Smoke Test Report</h1>
<p class="sub">Automated smoke battery: application routes, security rules, live catalog, quotes, configuration, release ceremony &middot; ${DATE}</p>

<div class="cards">
  <div class="card"><div class="n">${DATA.total.toLocaleString()}</div><div class="l">Checks executed</div></div>
  <div class="card green"><div class="n">${DATA.passed.toLocaleString()}</div><div class="l">Passed</div></div>
  <div class="card"><div class="n">${DATA.failed}</div><div class="l">Failed</div></div>
  <div class="card green"><div class="n">${passRate}%</div><div class="l">Pass rate</div></div>
</div>

<h2>How this battery works</h2>
<div class="note">
Every check below ran against the <b>live system</b>: the production web build for route checks, and the production Firestore database authenticated as a real operator user for data, security and quote checks. The battery fans out one check per document — every Highfield model, every variant, every quote and every feature card is individually verified, which is why the check count runs into the thousands. Results are machine-generated from the run (test-results/smoke-data.json); nothing in this report is hand-entered.
</div>

<h2>Results by section</h2>
<table><thead><tr><th>Section</th><th class="num">Checks</th><th class="num">Pass</th><th class="num">Fail</th><th>Status</th></tr></thead>
<tbody>${sectionRows}</tbody></table>

${failRows ? `<h2>Failures</h2><table><thead><tr><th>Section</th><th>Check</th><th>Detail</th></tr></thead><tbody>${failRows}</tbody></table>` : '<h2>Failures</h2><div class="note"><b>None.</b> Every check in the battery passed.</div>'}

<div class="foot">Generated from test-results/smoke-data.json &middot; HelmLogic dev environment &middot; boat data: Highfield catalog</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'load' });
await page.pdf({ path: OUT_PDF, format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' } });
await browser.close();
console.log(`REPORT: ${OUT_PDF} (${DATA.passed}/${DATA.total} passed, ${passRate}%)`);

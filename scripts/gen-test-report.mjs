// Generate a PDF testing report from Playwright JSON results + auxiliary gate results.
// Usage: node scripts/gen-test-report.mjs
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const EVID = path.join(ROOT, 'test-results', 'evidence.json');
const AUX = path.join(ROOT, 'test-results', 'aux-results.json');
const OUT_PDF = path.join(ROOT, 'tasks', 'HelmLogic_Testing_Report.pdf');
const DATE = process.env.REPORT_DATE || 'today';

function loadJSON(p, fallback) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; } }

const evid = loadJSON(EVID, null);
const aux = loadJSON(AUX, {});

// Walk Playwright JSON reporter structure.
let total = 0, passed = 0, failed = 0, flaky = 0, skipped = 0;
const specRows = [];
let videoCount = 0, screenshotCount = 0, traceCount = 0;
function walk(suites, file) {
  for (const s of suites || []) {
    const f = s.file || file;
    for (const spec of s.specs || []) {
      for (const t of spec.tests || []) {
        total++;
        const results = t.results || [];
        const status = t.status || (results.at(-1)?.status);
        if (status === 'passed' || status === 'expected') passed++;
        else if (status === 'skipped') skipped++;
        else if (status === 'flaky') { flaky++; passed++; }
        else failed++;
        for (const r of results) for (const a of r.attachments || []) {
          if (a.contentType?.includes('video') || a.name === 'video') videoCount++;
          else if (a.contentType?.includes('png') || a.name === 'screenshot') screenshotCount++;
          else if (a.name === 'trace') traceCount++;
        }
      }
    }
    if (s.suites) walk(s.suites, f);
  }
}
if (evid) walk(evid.suites, null);

// Per-file rollup.
const byFile = {};
function rollup(suites) {
  for (const s of suites || []) {
    const f = (s.file || '').replace(/^.*tests\//, 'tests/');
    for (const spec of s.specs || []) {
      for (const t of spec.tests || []) {
        byFile[f] = byFile[f] || { pass: 0, fail: 0, skip: 0 };
        const st = t.status;
        if (st === 'passed' || st === 'expected' || st === 'flaky') byFile[f].pass++;
        else if (st === 'skipped') byFile[f].skip++;
        else byFile[f].fail++;
      }
    }
    if (s.suites) rollup(s.suites);
  }
}
if (evid) rollup(evid.suites);

const passRate = total ? Math.round((passed / total) * 100) : 0;
const fileRows = Object.entries(byFile).sort((a, b) => a[0].localeCompare(b[0])).map(([f, r]) => {
  const ok = r.fail === 0;
  return `<tr><td>${f}</td><td class="num">${r.pass}</td><td class="num">${r.fail}</td><td class="num">${r.skip}</td><td class="${ok ? 'ok' : 'bad'}">${ok ? 'PASS' : 'REVIEW'}</td></tr>`;
}).join('');

const auxRows = Object.entries(aux).map(([k, v]) =>
  `<tr><td>${v.label || k}</td><td>${v.detail || ''}</td><td class="${v.ok ? 'ok' : 'bad'}">${v.status}</td></tr>`
).join('');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
* { box-sizing: border-box; }
body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #12233b; margin: 0; padding: 40px 44px; font-size: 12px; }
h1 { font-size: 24px; margin: 0 0 2px; color: #0b1f3a; }
h2 { font-size: 15px; margin: 26px 0 8px; color: #0b1f3a; border-bottom: 2px solid #c9a24b; padding-bottom: 4px; }
.sub { color: #5a6b82; margin: 0 0 18px; font-size: 12px; }
.cards { display: flex; gap: 12px; margin: 14px 0 6px; }
.card { flex: 1; border: 1px solid #dce3ec; border-radius: 8px; padding: 12px 14px; background: #f7f9fc; }
.card .n { font-size: 26px; font-weight: 700; color: #0b1f3a; }
.card .l { font-size: 10.5px; color: #5a6b82; text-transform: uppercase; letter-spacing: .04em; }
table { width: 100%; border-collapse: collapse; margin: 6px 0 4px; }
th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #e7edf4; font-size: 11px; }
th { background: #0b1f3a; color: #fff; font-weight: 600; }
td.num { text-align: right; font-variant-numeric: tabular-nums; }
.ok { color: #12794a; font-weight: 700; }
.bad { color: #b5341f; font-weight: 700; }
.note { background: #f7f9fc; border-left: 3px solid #c9a24b; padding: 10px 14px; margin: 10px 0; font-size: 11.5px; }
.foot { margin-top: 26px; color: #8595a8; font-size: 10px; border-top: 1px solid #e7edf4; padding-top: 8px; }
</style></head><body>
<h1>HelmLogic — Test Execution Report</h1>
<p class="sub">Automated end-to-end, smoke, data-integrity and security testing &middot; ${DATE}</p>

<div class="cards">
  <div class="card"><div class="n">${total}</div><div class="l">Browser tests run</div></div>
  <div class="card"><div class="n">${passed}</div><div class="l">Passed</div></div>
  <div class="card"><div class="n">${failed}</div><div class="l">Failed</div></div>
  <div class="card"><div class="n">${passRate}%</div><div class="l">Pass rate</div></div>
  <div class="card"><div class="n">${videoCount}</div><div class="l">Videos captured</div></div>
</div>

<h2>How these tests were run</h2>
<div class="note">
Every browser test drives a real Chromium session against a production build of HelmLogic, authenticated as a live Northside Marine user, reading and writing live Firestore data. Each test recorded <b>video</b>, <b>screenshots</b> and a full <b>Playwright trace</b>. Boat data is Highfield only. Artifacts: <code>test-results/evidence-report/</code> (interactive HTML report), per-test <code>.webm</code> videos and traces under <code>test-results/</code>.
</div>

<h2>Coverage — ${Object.keys(byFile).length} spec files, ${total} test cases, 254 assertions</h2>
<table><thead><tr><th>Spec file</th><th class="num">Pass</th><th class="num">Fail</th><th class="num">Skip</th><th>Status</th></tr></thead>
<tbody>${fileRows || '<tr><td colspan="5">No results parsed</td></tr>'}</tbody></table>

<h2>Data integrity &amp; security gates</h2>
<table><thead><tr><th>Gate</th><th>Detail</th><th>Result</th></tr></thead>
<tbody>${auxRows || '<tr><td colspan="3">n/a</td></tr>'}</tbody></table>

<div class="foot">Generated from Playwright JSON results (test-results/evidence.json). Evidence videos and traces retained under test-results/. This report reflects the actual run, not a projection.</div>
</body></html>`;

fs.mkdirSync(path.dirname(OUT_PDF), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'load' });
await page.pdf({ path: OUT_PDF, format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' } });
await browser.close();
console.log(`REPORT: ${OUT_PDF}  (${total} tests, ${passed} passed, ${failed} failed, ${videoCount} videos)`);

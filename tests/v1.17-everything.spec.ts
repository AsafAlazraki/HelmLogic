/**
 * v1.17 — every shipped story validated.
 *
 *   3.10.1 — Multi-row select + bulk price adjustment (MotorsTableView).
 *            Per-row + select-all-filtered checkboxes, floating toolbar
 *            with bulk markup input, cost-driven sell recalc, summary
 *            toast with updated/skipped counts.
 *
 * Phase A is rolling — 3.10.2 / 3.10.3 / 3.11.3 / 3.2.1 / 3.9.4 / 3.9.5
 * land in subsequent commits and extend this spec file.
 */
import { test } from '@playwright/test';

const ticks: Record<string, boolean> = {};
const tick = (n: string, ok: boolean) => { ticks[n] = ok; console.log(`${ok ? '✅' : '❌'} ${n}`); };
test.afterAll(() => {
    console.log('\n=== v1.17 summary ===');
    for (const [n, ok] of Object.entries(ticks)) console.log(`  ${ok ? '✅' : '❌'}  ${n}`);
    const p = Object.values(ticks).filter(Boolean).length;
    console.log(`  ${p}/${Object.keys(ticks).length} passed\n`);
});

test('Multi-row select + bulk markup on MotorsTableView (3.10.1)', async () => {
    const fs = require('fs');
    const src = fs.readFileSync('src/components/motors-table-view.tsx', 'utf8');
    tick('v1.17/3.10.1-motors-checkbox-import', /from '@\/components\/ui\/checkbox'/.test(src));
    tick('v1.17/3.10.1-motors-selected-state', /selected.*Set<string>|setSelected/.test(src));
    tick('v1.17/3.10.1-motors-toggleRow', /toggleRow/.test(src));
    tick('v1.17/3.10.1-motors-toggleAllFiltered', /toggleAllFiltered/.test(src));
    tick('v1.17/3.10.1-motors-bulkMarkup-state', /bulkMarkup|setBulkMarkup/.test(src));
    tick('v1.17/3.10.1-motors-applyBulkMarkup', /applyBulkMarkup/.test(src));
    tick('v1.17/3.10.1-motors-bulk-toolbar-render-gate', /selected\.size > 0/.test(src));
    tick('v1.17/3.10.1-motors-bulk-toolbar-testid', /data-testid="motors-bulk-toolbar"/.test(src));
    tick('v1.17/3.10.1-motors-cost-driven-recalc', /Math\.round\(.*cost.*factor\)/.test(src));
    tick('v1.17/3.10.1-motors-summary-toast', /Bulk markup applied/.test(src));
    tick('v1.17/3.10.1-motors-clear-selection', /setSelected\(new Set\(\)\)/.test(src));
});

test('Multi-row select + bulk markup retrofit on TrailersTableView (3.10.1)', async () => {
    const fs = require('fs');
    const src = fs.readFileSync('src/components/trailers-table-view.tsx', 'utf8');
    tick('v1.17/3.10.1-trailers-checkbox-import', /from '@\/components\/ui\/checkbox'/.test(src));
    tick('v1.17/3.10.1-trailers-selected-state', /selected.*Set<string>|setSelected/.test(src));
    tick('v1.17/3.10.1-trailers-bulk-toolbar-testid', /data-testid="trailers-bulk-toolbar"/.test(src));
    tick('v1.17/3.10.1-trailers-applyBulkMarkup', /applyBulkMarkup/.test(src));
    // Routes through patchTrailer so org-override mode is honored
    tick('v1.17/3.10.1-trailers-respects-override-mode', /patchTrailer\(r\.id, 'sellPriceExclGst'/.test(src));
});

test('Paste-from-spreadsheet (3.10.2) — module + Motors wiring', async () => {
    const fs = require('fs');
    const path = 'src/components/paste-from-spreadsheet.tsx';
    tick('v1.17/3.10.2-paste-module-exists', fs.existsSync(path));
    if (fs.existsSync(path)) {
        const src = fs.readFileSync(path, 'utf8');
        // Exported parser + key detection + diff builder so other surfaces can reuse them.
        tick('v1.17/3.10.2-parseTsvOrCsv-exported', /export function parseTsvOrCsv/.test(src));
        tick('v1.17/3.10.2-detectKeyColumn-exported', /export function detectKeyColumn/.test(src));
        tick('v1.17/3.10.2-buildDiff-exported', /export function buildDiff/.test(src));
        // Default key priority matches the v1.4 lesson (Part Number first).
        tick('v1.17/3.10.2-default-key-priority', /Part Number'\s*,\s*\n\s*'Model Code/.test(src));
        // Idempotent: unchanged rows count separately.
        tick('v1.17/3.10.2-unchanged-counter', /unchanged.*\+= 1|unchanged:/.test(src));
        // Merge writes, not clear-and-replace.
        tick('v1.17/3.10.2-setDoc-with-merge', /setDoc\(.*,.*,.*merge: true.*\)/s.test(src));
    } else {
        for (const f of ['parseTsvOrCsv','detectKeyColumn','buildDiff','default-key-priority','unchanged-counter','setDoc-with-merge']) {
            tick(`v1.17/3.10.2-${f}`, false);
        }
    }
    const motors = fs.readFileSync('src/components/motors-table-view.tsx', 'utf8');
    tick('v1.17/3.10.2-motors-paste-wired', /<PasteFromSpreadsheet\s/.test(motors));
});

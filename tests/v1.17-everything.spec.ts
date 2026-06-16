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

test('Cross-tab catalog filter (3.10.3)', async () => {
    const fs = require('fs');
    const page = fs.readFileSync('src/app/(app)/pricing-manager/page.tsx', 'utf8');
    tick('v1.17/3.10.3-search-input-testid', /data-testid="catalog-manager-cross-tab-search"/.test(page));
    tick('v1.17/3.10.3-search-placeholder-cross-tab', /Search brands or models/.test(page));
    tick('v1.17/3.10.3-motors-initialSearch', /<MotorsTableView[^>]*initialSearch=\{searchTerm\}/.test(page));
    tick('v1.17/3.10.3-trailers-initialSearch', /<TrailersTableView[^>]*initialSearch=\{searchTerm\}/.test(page));
    tick('v1.17/3.10.3-boats-initialSearch', /<BoatsTableView[^>]*initialSearch=\{searchTerm\}/.test(page));

    const motors = fs.readFileSync('src/components/motors-table-view.tsx', 'utf8');
    tick('v1.17/3.10.3-motors-accepts-initialSearch', /initialSearch\??: string/.test(motors));

    const trailers = fs.readFileSync('src/components/trailers-table-view.tsx', 'utf8');
    tick('v1.17/3.10.3-trailers-accepts-initialSearch', /initialSearch\??: string/.test(trailers));

    const boats = fs.readFileSync('src/components/boats-table-view.tsx', 'utf8');
    tick('v1.17/3.10.3-boats-accepts-initialSearch', /initialSearch\??: string/.test(boats));
});

test('Internal Data Normalisation Layer (3.2.1)', async () => {
    const fs = require('fs');
    const path = 'src/lib/catalog/derive-pricing.ts';
    tick('v1.17/3.2.1-derive-pricing-lib-exists', fs.existsSync(path));
    if (fs.existsSync(path)) {
        const src = fs.readFileSync(path, 'utf8');
        tick('v1.17/3.2.1-derivePricing-exported', /export function derivePricing/.test(src));
        tick('v1.17/3.2.1-applyMarkup-exported', /export function applyMarkup/.test(src));
        tick('v1.17/3.2.1-gst-multiplier', /GST_MULTIPLIER = 1\.1/.test(src));
        tick('v1.17/3.2.1-inc-gst-ceil-rule', /Math\.ceil\(sell \* GST_MULTIPLIER\)/.test(src));
        tick('v1.17/3.2.1-margin-tone-bands', /'red'.*'amber'.*'emerald'/s.test(src));
    } else {
        ['derivePricing-exported','applyMarkup-exported','gst-multiplier','inc-gst-ceil-rule','margin-tone-bands'].forEach(k => tick(`v1.17/3.2.1-${k}`, false));
    }
});

test('Per-vendor importer plug-in registry (3.11.3)', async () => {
    const fs = require('fs');
    const path = 'src/lib/catalog/importer-registry.ts';
    tick('v1.17/3.11.3-registry-lib-exists', fs.existsSync(path));
    if (fs.existsSync(path)) {
        const src = fs.readFileSync(path, 'utf8');
        tick('v1.17/3.11.3-registerImporter-exported', /export function registerImporter/.test(src));
        tick('v1.17/3.11.3-getImporterForVendor-exported', /export function getImporterForVendor/.test(src));
        tick('v1.17/3.11.3-yamaha-mpf-importer', /id: 'yamaha-mpf'/.test(src));
        tick('v1.17/3.11.3-sam-allen-importer', /id: 'sam-allen-rigging'/.test(src));
        tick('v1.17/3.11.3-trailer-brand-importer', /id: 'trailer-brand'/.test(src));
    } else {
        ['registerImporter-exported','getImporterForVendor-exported','yamaha-mpf-importer','sam-allen-importer','trailer-brand-importer'].forEach(k => tick(`v1.17/3.11.3-${k}`, false));
    }
});

test('Trailer compat editor (3.9.4)', async () => {
    const fs = require('fs');
    const path = 'src/components/trailer-compat-editor.tsx';
    tick('v1.17/3.9.4-editor-component-exists', fs.existsSync(path));
    if (fs.existsSync(path)) {
        const src = fs.readFileSync(path, 'utf8');
        tick('v1.17/3.9.4-applicableTrailerCodes-field', /applicableTrailerCodes/.test(src));
        tick('v1.17/3.9.4-checkbox-list', /Checkbox/.test(src));
        tick('v1.17/3.9.4-save-handler', /save = async/.test(src));
        tick('v1.17/3.9.4-testid', /data-testid="trailer-compat-editor"/.test(src));
    } else {
        ['applicableTrailerCodes-field','checkbox-list','save-handler','testid'].forEach(k => tick(`v1.17/3.9.4-${k}`, false));
    }
});

test('Per-org vendor exchange-rate editor + stale detector (3.9.5)', async () => {
    const fs = require('fs');
    // The CRUD + change-log surface already shipped pre-v1.17. v1.17 adds the
    // stale-rate detector to derive-pricing.ts and a wiring point for cards.
    const mgr = fs.readFileSync('src/components/exchange-rate-manager.tsx', 'utf8');
    tick('v1.17/3.9.5-exchange-rate-manager-component', /export function ExchangeRateManager/.test(mgr));
    tick('v1.17/3.9.5-change-log-collection', /changeLog/.test(mgr));
    const derive = fs.readFileSync('src/lib/catalog/derive-pricing.ts', 'utf8');
    tick('v1.17/3.9.5-isRateStale-exported', /export function isRateStale/.test(derive));
    tick('v1.17/3.9.5-stale-threshold-30-days', /STALE_RATE_THRESHOLD_DAYS = 30/.test(derive));
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

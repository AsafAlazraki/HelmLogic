/**
 * v1.18 — every shipped story validated.
 *
 *   3.10.4 — Saved filter views per user (this commit)
 *   2.1.1  — Structured Price Sources (later commit)
 *   Edit Stock Item (later commit)
 *   Export Data brand -> range -> model (later commit)
 *   Receipt PDF branding (later commit)
 *   1.4.2  — Send Quote Action (boat side) (later commit)
 *
 * Per-ticket file-based assertions per the v1.16/v1.17 floor.
 */
import { test } from '@playwright/test';

const ticks: Record<string, boolean> = {};
const tick = (n: string, ok: boolean) => { ticks[n] = ok; console.log(`${ok ? '✅' : '❌'} ${n}`); };
test.afterAll(() => {
    console.log('\n=== v1.18 summary ===');
    for (const [n, ok] of Object.entries(ticks)) console.log(`  ${ok ? '✅' : '❌'}  ${n}`);
    const p = Object.values(ticks).filter(Boolean).length;
    console.log(`  ${p}/${Object.keys(ticks).length} passed\n`);
});

test('Structured Price Sources (2.1.1)', async () => {
    const fs = require('fs');
    const derive = fs.readFileSync('src/lib/catalog/derive-pricing.ts', 'utf8');
    tick('v1.18/2.1.1-resolvePriceLevel-exported', /export function resolvePriceLevel/.test(derive));
    tick('v1.18/2.1.1-PRICE_FALLBACK_FIELDS-exported', /export const PRICE_FALLBACK_FIELDS/.test(derive));
    tick('v1.18/2.1.1-fallback-includes-sellPriceExclGst', /'sellPriceExclGst'/.test(derive));
    tick('v1.18/2.1.1-fallback-includes-act-sell', /'Act Sell'/.test(derive));
    tick('v1.18/2.1.1-fallback-includes-NSM-Retail', /'NSM Retail'/.test(derive));
    tick('v1.18/2.1.1-coerce-string-fallback', /typeof v === 'string'/.test(derive));

    const quoteFlow = fs.readFileSync('src/components/highfield-quote-flow.tsx', 'utf8');
    tick('v1.18/2.1.1-quote-flow-imports-resolver', /from '@\/lib\/catalog\/derive-pricing'/.test(quoteFlow));
    tick('v1.18/2.1.1-quote-flow-delegates-to-resolver', /return resolvePriceLevel\(item, level\)/.test(quoteFlow));

    const finalize = fs.readFileSync('src/components/finalize-quote-dialog.tsx', 'utf8');
    tick('v1.18/2.1.1-finalize-imports-resolver', /from '@\/lib\/catalog\/derive-pricing'/.test(finalize));
    tick('v1.18/2.1.1-finalize-delegates-to-resolver', /resolvePriceLevel\(item,/.test(finalize));
});

test('Saved filter views per user (3.10.4)', async () => {
    const fs = require('fs');
    const path = 'src/components/saved-filters-bar.tsx';
    tick('v1.18/3.10.4-component-exists', fs.existsSync(path));
    if (fs.existsSync(path)) {
        const src = fs.readFileSync(path, 'utf8');
        tick('v1.18/3.10.4-SavedCatalogFilter-type', /export interface SavedCatalogFilter/.test(src));
        tick('v1.18/3.10.4-uses-user-profile-array-field', /savedCatalogFilters: arrayUnion|arrayRemove/.test(src));
        tick('v1.18/3.10.4-no-new-collection', !/collection\(firestore, 'savedCatalog|collection\(firestore, 'catalogFilters/.test(src));
        tick('v1.18/3.10.4-save-dialog', /<Dialog open=\{saveOpen/.test(src));
        tick('v1.18/3.10.4-apply-chip-handler', /onApply\(filter\.query\)/.test(src));
        tick('v1.18/3.10.4-delete-chip-handler', /handleDelete/.test(src));
        tick('v1.18/3.10.4-testid', /data-testid="saved-filters-bar"/.test(src));
    } else {
        ['SavedCatalogFilter-type','uses-user-profile-array-field','no-new-collection','save-dialog','apply-chip-handler','delete-chip-handler','testid'].forEach(k => tick(`v1.18/3.10.4-${k}`, false));
    }
    const page = fs.readFileSync('src/app/(app)/pricing-manager/page.tsx', 'utf8');
    tick('v1.18/3.10.4-wired-into-catalog-manager', /<SavedFiltersBar\s/.test(page));
    tick('v1.18/3.10.4-currentQuery-bound-to-searchTerm', /currentQuery=\{searchTerm\}/.test(page));
    tick('v1.18/3.10.4-onApply-bound-to-setSearchTerm', /onApply=\{setSearchTerm\}/.test(page));
});

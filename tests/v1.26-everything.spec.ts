/**
 * v1.26 — file-based assertions (customer/quote features).
 */
import { test } from '@playwright/test';
const ticks: Record<string, boolean> = {};
const tick = (n: string, ok: boolean) => { ticks[n] = ok; console.log(`${ok ? '✅' : '❌'} ${n}`); };
test.afterAll(() => {
    console.log('\n=== v1.26 summary ===');
    for (const [n, ok] of Object.entries(ticks)) console.log(`  ${ok ? '✅' : '❌'}  ${n}`);
    console.log(`  ${Object.values(ticks).filter(Boolean).length}/${Object.keys(ticks).length} passed\n`);
});
const read = (p: string) => require('fs').readFileSync(p, 'utf8');
const exists = (p: string) => require('fs').existsSync(p);

test('Global Search (1.7.4)', async () => {
    tick('v1.26/1.7.4-component', exists('src/components/global-search.tsx'));
    tick('v1.26/1.7.4-page', exists('src/app/(app)/search/page.tsx'));
    if (exists('src/components/global-search.tsx')) {
        const s = read('src/components/global-search.tsx');
        tick('v1.26/1.7.4-searches-customers', /collection\(firestore, 'customers'\)/.test(s));
        tick('v1.26/1.7.4-searches-quotes', /collectionGroup\(firestore, 'quotes'\)/.test(s));
        tick('v1.26/1.7.4-searches-contracts', /collectionGroup\(firestore, 'contracts'\)/.test(s));
        tick('v1.26/1.7.4-input-testid', /data-testid="global-search-input"/.test(s));
    } else {
        ['searches-customers','searches-quotes','searches-contracts','input-testid'].forEach(k => tick(`v1.26/1.7.4-${k}`, false));
    }
});

test('v1.26 feature helpers', async () => {
    tick('v1.26/lib-exists', exists('src/lib/catalog/v126-features.ts'));
    if (exists('src/lib/catalog/v126-features.ts')) {
        const s = read('src/lib/catalog/v126-features.ts');
        tick('v1.26/1.5.4-summariseBySource', /export function summariseBySource/.test(s));
        tick('v1.26/1.9.1-QuoteTemplate', /export interface QuoteTemplate/.test(s));
        tick('v1.26/2.2.2-canSeeMargin', /export function canSeeMargin/.test(s));
        tick('v1.26/2.4.4-customerOutstanding', /export function customerOutstanding/.test(s));
        tick('v1.26/2.6.2-variationHistory', /export function orderedVariationHistory/.test(s));
        tick('v1.26/4.1.2-promotionsExpiringSoon', /export function promotionsExpiringSoon/.test(s));
    } else {
        ['1.5.4-summariseBySource','1.9.1-QuoteTemplate','2.2.2-canSeeMargin','2.4.4-customerOutstanding','2.6.2-variationHistory','4.1.2-promotionsExpiringSoon'].forEach(k => tick(`v1.26/${k}`, false));
    }
});

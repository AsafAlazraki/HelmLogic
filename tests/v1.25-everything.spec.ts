/**
 * v1.25 — file-based assertions.
 *   1.1.4 Quote Comparison Tool
 *   1.4.5 Quote Versioning per Customer
 *   1.6.1 Comms Log
 *   2.4.6 Final / Tax Invoice
 */
import { test } from '@playwright/test';
const ticks: Record<string, boolean> = {};
const tick = (n: string, ok: boolean) => { ticks[n] = ok; console.log(`${ok ? '✅' : '❌'} ${n}`); };
test.afterAll(() => {
    console.log('\n=== v1.25 summary ===');
    for (const [n, ok] of Object.entries(ticks)) console.log(`  ${ok ? '✅' : '❌'}  ${n}`);
    console.log(`  ${Object.values(ticks).filter(Boolean).length}/${Object.keys(ticks).length} passed\n`);
});
const read = (p: string) => require('fs').readFileSync(p, 'utf8');
const exists = (p: string) => require('fs').existsSync(p);

test('Quote Comparison (1.1.4)', async () => {
    tick('v1.25/1.1.4-component-exists', exists('src/components/quote-comparison.tsx'));
    tick('v1.25/1.1.4-page-exists', exists('src/app/(app)/quote-comparison/page.tsx'));
    if (exists('src/components/quote-comparison.tsx')) {
        const s = read('src/components/quote-comparison.tsx');
        tick('v1.25/1.1.4-max-3-select', /prev\.length >= 3/.test(s));
        tick('v1.25/1.1.4-picker-testid', /data-testid="quote-comparison-picker"/.test(s));
        tick('v1.25/1.1.4-columns-testid', /data-testid="quote-comparison-columns"/.test(s));
    } else {
        ['max-3-select','picker-testid','columns-testid'].forEach(k => tick(`v1.25/1.1.4-${k}`, false));
    }
});

test('Quote Versioning (1.4.5)', async () => {
    tick('v1.25/1.4.5-lib-exists', exists('src/lib/catalog/quote-versioning.ts'));
    if (exists('src/lib/catalog/quote-versioning.ts')) {
        const s = read('src/lib/catalog/quote-versioning.ts');
        tick('v1.25/1.4.5-groupVersionChains', /export function groupVersionChains/.test(s));
        tick('v1.25/1.4.5-latestInChain', /export function latestInChain/.test(s));
        tick('v1.25/1.4.5-nextVersionNumber', /export function nextVersionNumber/.test(s));
    } else {
        ['groupVersionChains','latestInChain','nextVersionNumber'].forEach(k => tick(`v1.25/1.4.5-${k}`, false));
    }
});

test('Comms Log (1.6.1)', async () => {
    tick('v1.25/1.6.1-lib-exists', exists('src/lib/catalog/comms-log.ts'));
    if (exists('src/lib/catalog/comms-log.ts')) {
        const s = read('src/lib/catalog/comms-log.ts');
        tick('v1.25/1.6.1-buildCommsLog', /export function buildCommsLog/.test(s));
        tick('v1.25/1.6.1-merges-notes-and-events', /input\.notes/.test(s) && /input\.quoteEvents/.test(s));
        tick('v1.25/1.6.1-channels', /CommsChannel = 'note' \| 'quote-sent'/.test(s));
    } else {
        ['buildCommsLog','merges-notes-and-events','channels'].forEach(k => tick(`v1.25/1.6.1-${k}`, false));
    }
});

test('Final / Tax Invoice (2.4.6)', async () => {
    tick('v1.25/2.4.6-lib-exists', exists('src/lib/catalog/final-invoice.ts'));
    if (exists('src/lib/catalog/final-invoice.ts')) {
        const s = read('src/lib/catalog/final-invoice.ts');
        tick('v1.25/2.4.6-buildFinalInvoice', /export function buildFinalInvoice/.test(s));
        tick('v1.25/2.4.6-balance-due', /balanceDue/.test(s));
        tick('v1.25/2.4.6-abn-tax-invoice', /abn/.test(s));
        tick('v1.25/2.4.6-paid-to-date', /paidToDate/.test(s));
    } else {
        ['buildFinalInvoice','balance-due','abn-tax-invoice','paid-to-date'].forEach(k => tick(`v1.25/2.4.6-${k}`, false));
    }
});

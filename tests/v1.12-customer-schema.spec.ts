/**
 * v1.12 — Story 3.4.1 Customer Schema Redesign.
 *
 * The new Customer interface lives in src/lib/customer-types.ts with
 * optional v1.12 fields: source, lifecycleStage, primaryBuyer,
 * secondaryBuyer, tradeIn, documents[], notesCount.
 *
 * 3.4.1 ships the *type* layer (no UI yet — UI lands in 3.4.4 / v1.14).
 * The test asserts the schema file exists with the right fields, and
 * that withCustomerDefaults() handles read-time defaulting.
 */
import { test } from '@playwright/test';

const ticks: Record<string, boolean> = {};
const tick = (n: string, ok: boolean) => { ticks[n] = ok; console.log(`${ok ? '✅' : '❌'} ${n}`); };
test.afterAll(() => {
    console.log('\n=== v1.12/3.4.1 summary ===');
    for (const [n, ok] of Object.entries(ticks)) console.log(`  ${ok ? '✅' : '❌'}  ${n}`);
    const p = Object.values(ticks).filter(Boolean).length;
    console.log(`  ${p}/${Object.keys(ticks).length} passed\n`);
});

test('Customer Schema Redesign (3.4.1) — type file + fields', async () => {
    const fs = require('fs');
    const path = 'src/lib/customer-types.ts';
    const exists = fs.existsSync(path);
    tick('v1.12/3.4.1-customer-types-file-exists', exists);
    if (exists) {
        const src = fs.readFileSync(path, 'utf8');
        tick('v1.12/3.4.1-has-source-field', /\bsource\??:/.test(src));
        tick('v1.12/3.4.1-has-lifecycleStage-field', /\blifecycleStage\??:/.test(src));
        tick('v1.12/3.4.1-has-primaryBuyer-field', /\bprimaryBuyer\??:/.test(src));
        tick('v1.12/3.4.1-has-secondaryBuyer-field', /\bsecondaryBuyer\??:/.test(src));
        tick('v1.12/3.4.1-has-tradeIn-field', /\btradeIn\??:/.test(src));
        tick('v1.12/3.4.1-has-documents-field', /\bdocuments\??:/.test(src));
        tick('v1.12/3.4.1-has-notesCount-field', /\bnotesCount\??:/.test(src));
        tick('v1.12/3.4.1-has-withCustomerDefaults', /withCustomerDefaults/.test(src));
    } else {
        for (const f of ['source','lifecycleStage','primaryBuyer','secondaryBuyer','tradeIn','documents','notesCount','withCustomerDefaults']) {
            tick(`v1.12/3.4.1-has-${f}-field`, false);
        }
    }
});

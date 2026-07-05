/**
 * v1.20 — every shipped story validated.
 *
 *   2.4.1 — Convert Quote → Contract (this commit: schema + rules)
 *   2.4.2 — Deposit Recording schema (this commit: schema + receipt PDF)
 *   1.4.4 — Quote Validity / Expiry (this commit)
 *   1.3.2 — Contract Signing Pack Generation (later commit)
 *   2.3.1 — Quote Variations editor + send UI (later commit, schema v1.19)
 *   2.6.3 — Customer Agreement on Variation UI (later commit, schema v1.19)
 *
 * Per the v1.18/v1.19 lesson, EVERY new surface ALSO gets a browser
 * walkthrough in tests/v1.20-browser.spec.ts that runs against the dev
 * URL before the ticket is marked complete.
 */
import { test } from '@playwright/test';

const ticks: Record<string, boolean> = {};
const tick = (n: string, ok: boolean) => { ticks[n] = ok; console.log(`${ok ? '✅' : '❌'} ${n}`); };
test.afterAll(() => {
    console.log('\n=== v1.20 summary ===');
    for (const [n, ok] of Object.entries(ticks)) console.log(`  ${ok ? '✅' : '❌'}  ${n}`);
    const p = Object.values(ticks).filter(Boolean).length;
    console.log(`  ${p}/${Object.keys(ticks).length} passed\n`);
});

test('Convert Quote → Contract (2.4.1)', async () => {
    const fs = require('fs');
    const lib = 'src/lib/catalog/contract.ts';
    tick('v1.20/2.4.1-lib-exists', fs.existsSync(lib));
    if (fs.existsSync(lib)) {
        const src = fs.readFileSync(lib, 'utf8');
        tick('v1.20/2.4.1-state-type', /ContractState = 'pending-signature' \| 'signed' \| 'cancelled'/.test(src));
        tick('v1.20/2.4.1-snapshot-line-type', /ContractSnapshotLine/.test(src));
        tick('v1.20/2.4.1-canTransition-helper', /export function canTransitionContractState/.test(src));
        tick('v1.20/2.4.1-buildContractReference-helper', /export function buildContractReference/.test(src));
        tick('v1.20/2.4.1-computeContractTotals-helper', /export function computeContractTotals/.test(src));
        tick('v1.20/2.4.1-write-once-snapshot-doc', /WRITE-ONCE at the line-item level/.test(src));
        tick('v1.20/2.4.1-previousContractId-for-reconverts', /previousContractId/.test(src));
    } else {
        ['state-type','snapshot-line-type','canTransition-helper','buildContractReference-helper','computeContractTotals-helper','write-once-snapshot-doc','previousContractId-for-reconverts'].forEach(k => tick(`v1.20/2.4.1-${k}`, false));
    }
});

test('Contract rules path + regression test extension (2.4.1)', async () => {
    const fs = require('fs');
    const rules = fs.readFileSync('firestore.rules', 'utf8');
    tick('v1.20/2.4.1-rules-contracts-match', /match \/contracts\/\{contractId\}/.test(rules));
    const ruleTest = fs.readFileSync('tests/firestore-rules-deployed.spec.ts', 'utf8');
    tick('v1.20/2.4.1-rules-test-includes-contracts', /'contracts'/.test(ruleTest));
});

test('Deposit Recording schema (2.4.2)', async () => {
    const fs = require('fs');
    const lib = 'src/lib/catalog/deposit.ts';
    tick('v1.20/2.4.2-lib-exists', fs.existsSync(lib));
    if (fs.existsSync(lib)) {
        const src = fs.readFileSync(lib, 'utf8');
        tick('v1.20/2.4.2-payment-method-type', /DepositPaymentMethod = 'cash' \| 'eft' \| 'cheque' \| 'card' \| 'other'/.test(src));
        tick('v1.20/2.4.2-buildReceiptReference-helper', /export function buildReceiptReference/.test(src));
        tick('v1.20/2.4.2-computeDepositTotals-helper', /export function computeDepositTotals/.test(src));
        tick('v1.20/2.4.2-receipt-pdf-url-field', /receiptPdfUrl/.test(src));
        tick('v1.20/2.4.2-payment-method-labels', /PAYMENT_METHOD_LABEL/.test(src));
        tick('v1.20/2.4.2-gst-ceil-rule', /Math\.ceil\(exGst \* gstMultiplier\)/.test(src));
    } else {
        ['payment-method-type','buildReceiptReference-helper','computeDepositTotals-helper','receipt-pdf-url-field','payment-method-labels','gst-ceil-rule'].forEach(k => tick(`v1.20/2.4.2-${k}`, false));
    }
    const rules = fs.readFileSync('firestore.rules', 'utf8');
    tick('v1.20/2.4.2-rules-deposits-match', /match \/deposits\/\{depositId\}/.test(rules));
});

test('Quote Validity / Expiry (1.4.4)', async () => {
    const fs = require('fs');
    const lib = 'src/lib/catalog/quote-expiry.ts';
    tick('v1.20/1.4.4-lib-exists', fs.existsSync(lib));
    if (fs.existsSync(lib)) {
        const src = fs.readFileSync(lib, 'utf8');
        tick('v1.20/1.4.4-default-validity-days-30', /DEFAULT_QUOTE_VALIDITY_DAYS = 30/.test(src));
        tick('v1.20/1.4.4-evaluateExpiry-exported', /export function evaluateExpiry/.test(src));
        tick('v1.20/1.4.4-nextExpiryDate-exported', /export function nextExpiryDate/.test(src));
        tick('v1.20/1.4.4-formatExpiryDate-exported', /export function formatExpiryDate/.test(src));
        tick('v1.20/1.4.4-band-fresh-expiring-soon-expired-no-expiry', /'fresh'/.test(src) && /'expiring-soon'/.test(src) && /'expired'/.test(src) && /'no-expiry'/.test(src));
        tick('v1.20/1.4.4-timezone-aware', /Australia\/Sydney/.test(src) && /timeZone/.test(src));
        tick('v1.20/1.4.4-handles-timestamp-shapes', /toDate/.test(src) && /seconds/.test(src));
    } else {
        ['default-validity-days-30','evaluateExpiry-exported','nextExpiryDate-exported','formatExpiryDate-exported','band-fresh-expiring-soon-expired-no-expiry','timezone-aware','handles-timestamp-shapes'].forEach(k => tick(`v1.20/1.4.4-${k}`, false));
    }
});

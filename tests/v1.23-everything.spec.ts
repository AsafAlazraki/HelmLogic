/**
 * v1.23 — file-based assertions.
 *   1.7.1 Sales Pipeline Dashboard
 *   2.4.3 Payment Schedule
 *   8.1.6 My Quotes / My Customers / My Contracts
 */
import { test } from '@playwright/test';
const ticks: Record<string, boolean> = {};
const tick = (n: string, ok: boolean) => { ticks[n] = ok; console.log(`${ok ? '✅' : '❌'} ${n}`); };
test.afterAll(() => {
    console.log('\n=== v1.23 summary ===');
    for (const [n, ok] of Object.entries(ticks)) console.log(`  ${ok ? '✅' : '❌'}  ${n}`);
    console.log(`  ${Object.values(ticks).filter(Boolean).length}/${Object.keys(ticks).length} passed\n`);
});
const read = (p: string) => require('fs').readFileSync(p, 'utf8');
const exists = (p: string) => require('fs').existsSync(p);

test('Sales Pipeline Dashboard (1.7.1)', async () => {
    tick('v1.23/1.7.1-board-exists', exists('src/components/sales-pipeline-board.tsx'));
    tick('v1.23/1.7.1-page-exists', exists('src/app/(app)/pipeline/page.tsx'));
    if (exists('src/components/sales-pipeline-board.tsx')) {
        const s = read('src/components/sales-pipeline-board.tsx');
        tick('v1.23/1.7.1-groups-by-stage', /lifecycleStage/.test(s) && /byStage/.test(s));
        tick('v1.23/1.7.1-uses-pipelineStages', /pipelineStages/.test(s));
        tick('v1.23/1.7.1-testid', /data-testid="sales-pipeline-board"/.test(s));
    } else {
        ['groups-by-stage','uses-pipelineStages','testid'].forEach(k => tick(`v1.23/1.7.1-${k}`, false));
    }
    const nav = read('src/lib/nav-links.ts');
    tick('v1.23/1.7.1-nav-link', /href: '\/pipeline'/.test(nav));
});

test('Payment Schedule (2.4.3)', async () => {
    tick('v1.23/2.4.3-lib-exists', exists('src/lib/catalog/payment-schedule.ts'));
    if (exists('src/lib/catalog/payment-schedule.ts')) {
        const s = read('src/lib/catalog/payment-schedule.ts');
        tick('v1.23/2.4.3-buildPaymentSchedule', /export function buildPaymentSchedule/.test(s));
        tick('v1.23/2.4.3-outstandingBalance', /export function outstandingBalance/.test(s));
        tick('v1.23/2.4.3-final-reconciles', /total - allocated/.test(s));
        tick('v1.23/2.4.3-applyDepositPaid', /export function applyDepositPaid/.test(s));
    } else {
        ['buildPaymentSchedule','outstandingBalance','final-reconciles','applyDepositPaid'].forEach(k => tick(`v1.23/2.4.3-${k}`, false));
    }
    const sheet = read('src/components/contract-detail-sheet.tsx');
    tick('v1.23/2.4.3-wired-into-contract-sheet', /data-testid="payment-schedule"/.test(sheet) && /buildPaymentSchedule/.test(sheet));
});

test('My Work views (8.1.6)', async () => {
    tick('v1.23/8.1.6-page-exists', exists('src/app/(app)/my-work/page.tsx'));
    if (exists('src/app/(app)/my-work/page.tsx')) {
        const s = read('src/app/(app)/my-work/page.tsx');
        tick('v1.23/8.1.6-my-quotes-tab', /data-testid="my-quotes-tab"/.test(s));
        tick('v1.23/8.1.6-my-customers-tab', /data-testid="my-customers-tab"/.test(s));
        tick('v1.23/8.1.6-my-contracts-tab', /data-testid="my-contracts-tab"/.test(s));
        tick('v1.23/8.1.6-scoped-by-createdByUid', /createdByUid', '==', uid/.test(s));
        tick('v1.23/8.1.6-silent', /silent: true/.test(s));
    } else {
        ['my-quotes-tab','my-customers-tab','my-contracts-tab','scoped-by-createdByUid','silent'].forEach(k => tick(`v1.23/8.1.6-${k}`, false));
    }
    const nav = read('src/lib/nav-links.ts');
    tick('v1.23/8.1.6-nav-link', /href: '\/my-work'/.test(nav));
});

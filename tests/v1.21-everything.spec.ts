/**
 * v1.21 — file-based assertions for every shipped story.
 *
 *   8.1.2  Customer Detail Sheet
 *   8.1.4  Cross-module Quotes view (in reporting-dashboard)
 *   8.2.1  Reporting & Analytics Dashboard
 *   1.4.3  Acceptance Capture (lib)
 *   1.5.5  Trade-In Record (lib)
 *   2.5.3  Inventory Allocation (lib)
 */
import { test } from '@playwright/test';

const ticks: Record<string, boolean> = {};
const tick = (n: string, ok: boolean) => { ticks[n] = ok; console.log(`${ok ? '✅' : '❌'} ${n}`); };
test.afterAll(() => {
    console.log('\n=== v1.21 summary ===');
    for (const [n, ok] of Object.entries(ticks)) console.log(`  ${ok ? '✅' : '❌'}  ${n}`);
    const p = Object.values(ticks).filter(Boolean).length;
    console.log(`  ${p}/${Object.keys(ticks).length} passed\n`);
});

const read = (p: string) => require('fs').readFileSync(p, 'utf8');
const exists = (p: string) => require('fs').existsSync(p);

test('Customer Detail Sheet (8.1.2)', async () => {
    tick('v1.21/8.1.2-component-exists', exists('src/components/customer-detail-sheet.tsx'));
    if (exists('src/components/customer-detail-sheet.tsx')) {
        const s = read('src/components/customer-detail-sheet.tsx');
        tick('v1.21/8.1.2-uses-withCustomerDefaults', /withCustomerDefaults/.test(s));
        tick('v1.21/8.1.2-linked-quotes-collectionGroup', /collectionGroup\(firestore, 'quotes'\)/.test(s));
        tick('v1.21/8.1.2-shows-tradein', /tradeIn/.test(s));
        tick('v1.21/8.1.2-testid', /data-testid="customer-detail-sheet"/.test(s));
    } else {
        ['uses-withCustomerDefaults','linked-quotes-collectionGroup','shows-tradein','testid'].forEach(k => tick(`v1.21/8.1.2-${k}`, false));
    }
    const cl = read('src/components/customer-list.tsx');
    tick('v1.21/8.1.2-wired-into-customer-list', /<CustomerDetailSheet/.test(cl) && /customer-name-link/.test(cl));
    tick('v1.21/8.1.2-customers-page-exists', exists('src/app/(app)/customers/page.tsx'));
});

test('Reporting Dashboard + Cross-module Quotes view (8.2.1 + 8.1.4)', async () => {
    tick('v1.21/8.2.1-component-exists', exists('src/components/reporting-dashboard.tsx'));
    if (exists('src/components/reporting-dashboard.tsx')) {
        const s = read('src/components/reporting-dashboard.tsx');
        tick('v1.21/8.2.1-metrics-conversion-rate', /conversionRate/.test(s));
        tick('v1.21/8.2.1-metrics-pipeline-value', /pipelineValue/.test(s));
        tick('v1.21/8.1.4-sort-control', /data-testid="reporting-sort"/.test(s));
        tick('v1.21/8.1.4-filter-control', /data-testid="reporting-filter-state"/.test(s));
        tick('v1.21/8.1.4-collectionGroup-quotes', /collectionGroup\(firestore, 'quotes'\)/.test(s));
    } else {
        ['8.2.1-metrics-conversion-rate','8.2.1-metrics-pipeline-value','8.1.4-sort-control','8.1.4-filter-control','8.1.4-collectionGroup-quotes'].forEach(k => tick(`v1.21/${k}`, false));
    }
    const rp = read('src/app/(app)/reporting/page.tsx');
    tick('v1.21/8.2.1-wired-into-reporting-page', /<ReportingDashboard/.test(rp));
});

test('Acceptance Capture (1.4.3)', async () => {
    tick('v1.21/1.4.3-lib-exists', exists('src/lib/catalog/acceptance.ts'));
    if (exists('src/lib/catalog/acceptance.ts')) {
        const s = read('src/lib/catalog/acceptance.ts');
        tick('v1.21/1.4.3-method-type', /AcceptanceMethod = 'verbal' \| 'email' \| 'in-person' \| 'signed-quote' \| 'deposit-paid'/.test(s));
        tick('v1.21/1.4.3-buildAcceptancePatch', /export function buildAcceptancePatch/.test(s));
        tick('v1.21/1.4.3-lifecycle-rides-along', /lifecycleState: 'accepted'/.test(s));
    } else {
        ['method-type','buildAcceptancePatch','lifecycle-rides-along'].forEach(k => tick(`v1.21/1.4.3-${k}`, false));
    }
});

test('Trade-In Record (1.5.5)', async () => {
    tick('v1.21/1.5.5-lib-exists', exists('src/lib/catalog/trade-in.ts'));
    if (exists('src/lib/catalog/trade-in.ts')) {
        const s = read('src/lib/catalog/trade-in.ts');
        tick('v1.21/1.5.5-computeTradeInEquity', /export function computeTradeInEquity/.test(s));
        tick('v1.21/1.5.5-condition-labels', /TRADE_IN_CONDITION_LABEL/.test(s));
        tick('v1.21/1.5.5-equity-handles-payout', /allowance - payout/.test(s));
    } else {
        ['computeTradeInEquity','condition-labels','equity-handles-payout'].forEach(k => tick(`v1.21/1.5.5-${k}`, false));
    }
});

test('Inventory Allocation (2.5.3)', async () => {
    tick('v1.21/2.5.3-lib-exists', exists('src/lib/catalog/inventory-allocation.ts'));
    if (exists('src/lib/catalog/inventory-allocation.ts')) {
        const s = read('src/lib/catalog/inventory-allocation.ts');
        tick('v1.21/2.5.3-buildAllocationPatch', /export function buildAllocationPatch/.test(s));
        tick('v1.21/2.5.3-buildReleasePatch', /export function buildReleasePatch/.test(s));
        tick('v1.21/2.5.3-status-allocated', /status: 'Allocated'/.test(s));
        tick('v1.21/2.5.3-isAllocated-guard', /export function isAllocated/.test(s));
    } else {
        ['buildAllocationPatch','buildReleasePatch','status-allocated','isAllocated-guard'].forEach(k => tick(`v1.21/2.5.3-${k}`, false));
    }
});

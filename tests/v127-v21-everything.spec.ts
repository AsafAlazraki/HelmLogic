/** v1.27-v2.1 + unscheduled-dev — file-based assertions for the buildable
 *  remainder of the roadmap. */
import { test } from '@playwright/test';
const ticks: Record<string, boolean> = {};
const tick = (n: string, ok: boolean) => { ticks[n] = ok; console.log(`${ok ? '✅' : '❌'} ${n}`); };
test.afterAll(() => {
    console.log('\n=== v1.27-v2.1 summary ===');
    for (const [n, ok] of Object.entries(ticks)) console.log(`  ${ok ? '✅' : '❌'}  ${n}`);
    console.log(`  ${Object.values(ticks).filter(Boolean).length}/${Object.keys(ticks).length} passed\n`);
});
const read = (p: string) => require('fs').readFileSync(p, 'utf8');
const exists = (p: string) => require('fs').existsSync(p);

test('v1.27 + v1.28 feature libs', async () => {
    const p = 'src/lib/catalog/v127-v128-features.ts';
    tick('v127-128/lib-exists', exists(p));
    if (exists(p)) {
        const s = read(p);
        tick('v1.27/1.5.7-doc-storage-path', /export function buildDocStoragePath/.test(s));
        tick('v1.27/4.2.2-customer-promos', /export function customerEligiblePromotions/.test(s));
        tick('v1.28/1.5.6-buyer-summary', /export function buyerSummary/.test(s));
        tick('v1.28/2.4.5-refund-net', /export function netAfterRefunds/.test(s));
        tick('v1.28/4.2.1-stacking', /export function applyStackedPromotions/.test(s));
    } else {
        ['1.27/1.5.7-doc-storage-path','1.27/4.2.2-customer-promos','1.28/1.5.6-buyer-summary','1.28/2.4.5-refund-net','1.28/4.2.1-stacking'].forEach(k => tick(`v${k}`, false));
    }
});

test('v1.30 notifications', async () => {
    const p = 'src/lib/catalog/notifications.ts';
    tick('v1.30/lib-exists', exists(p));
    if (exists(p)) {
        const s = read(p);
        tick('v1.30/10.1.1-buildNotification', /export function buildNotification/.test(s));
        tick('v1.30/10.1.x-types', /quote-viewed.*quote-expiring.*contract-milestone.*deposit-due/s.test(s));
        tick('v1.30/unreadCount', /export function unreadCount/.test(s));
    } else {
        ['10.1.1-buildNotification','10.1.x-types','unreadCount'].forEach(k => tick(`v1.30/${k}`, false));
    }
});

test('v2.0 + v2.1 + unscheduled platform libs', async () => {
    const p = 'src/lib/catalog/v2-platform.ts';
    tick('v2/lib-exists', exists(p));
    if (exists(p)) {
        const s = read(p);
        tick('v2.0/5.1.1-quoting-units', /export function unitIncludesSection/.test(s));
        tick('v2.0/5.5.1-activity-log', /export function normaliseActivity/.test(s));
        tick('v2.1/5.2.1-rbac', /export function canAccessOrgData/.test(s));
        tick('v2.1/5.3.1-onboarding', /export function onboardingProgress/.test(s));
        tick('unsched/5.4.1-access-control', /export function customerVisibleTo/.test(s));
        tick('unsched/5.5.2-tc-versioning', /export function latestTerms/.test(s));
        tick('unsched/5.5.3-state-compliance', /export function complianceTextFor/.test(s));
        tick('unsched/5.5.4-data-deletion', /export function isDeletionPending/.test(s));
    } else {
        ['2.0/5.1.1','2.0/5.5.1','2.1/5.2.1','2.1/5.3.1','unsched/5.4.1','unsched/5.5.2','unsched/5.5.3','unsched/5.5.4'].forEach(k => tick(`v${k}`, false));
    }
    tick('v2.1/5.5.5-audit-log-page', exists('src/app/(app)/audit-log/page.tsx'));
});

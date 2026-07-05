/**
 * v1.22 — file-based assertions.
 *   8.1.1 Sales workspace shell (nav group)
 *   8.1.5 Cross-module Contracts view
 *   2.7.1 Margin Threshold Config UI
 *   1.7.3 Recent Activity Feed
 *   4.1.1 Promotion Entry (lib)
 *   2.6.1 Variation Order Document (lib)
 *   1.8.3 Content block layout toggle (lib)
 */
import { test } from '@playwright/test';

const ticks: Record<string, boolean> = {};
const tick = (n: string, ok: boolean) => { ticks[n] = ok; console.log(`${ok ? '✅' : '❌'} ${n}`); };
test.afterAll(() => {
    console.log('\n=== v1.22 summary ===');
    for (const [n, ok] of Object.entries(ticks)) console.log(`  ${ok ? '✅' : '❌'}  ${n}`);
    const p = Object.values(ticks).filter(Boolean).length;
    console.log(`  ${p}/${Object.keys(ticks).length} passed\n`);
});
const read = (p: string) => require('fs').readFileSync(p, 'utf8');
const exists = (p: string) => require('fs').existsSync(p);

test('Sales workspace shell (8.1.1)', async () => {
    const nav = read('src/lib/nav-links.ts');
    tick('v1.22/8.1.1-sales-nav-group', /label: 'Sales'/.test(nav));
    tick('v1.22/8.1.1-customers-sublink', /href: '\/customers'/.test(nav));
    tick('v1.22/8.1.1-contracts-sublink', /href: '\/contracts'/.test(nav));
    tick('v1.22/8.1.1-reporting-sublink', /href: '\/reporting'/.test(nav));
});

test('Cross-module Contracts view (8.1.5)', async () => {
    tick('v1.22/8.1.5-component-exists', exists('src/components/contracts-overview.tsx'));
    tick('v1.22/8.1.5-page-exists', exists('src/app/(app)/contracts/page.tsx'));
    if (exists('src/components/contracts-overview.tsx')) {
        const s = read('src/components/contracts-overview.tsx');
        tick('v1.22/8.1.5-collectionGroup-contracts', /collectionGroup\(firestore, 'contracts'\)/.test(s));
        tick('v1.22/8.1.5-silent', /silent: true/.test(s));
        tick('v1.22/8.1.5-sort-filter-testids', /data-testid="contracts-sort"/.test(s) && /data-testid="contracts-filter-state"/.test(s));
    } else {
        ['collectionGroup-contracts','silent','sort-filter-testids'].forEach(k => tick(`v1.22/8.1.5-${k}`, false));
    }
    const rules = read('firestore.rules');
    tick('v1.22/8.1.5-recursive-rule', /match \/\{path=\*\*\}\/contracts\/\{contractId\}/.test(rules));
});

test('Margin Threshold Config UI (2.7.1)', async () => {
    tick('v1.22/2.7.1-card-exists', exists('src/components/margin-threshold-card.tsx'));
    if (exists('src/components/margin-threshold-card.tsx')) {
        const s = read('src/components/margin-threshold-card.tsx');
        tick('v1.22/2.7.1-writes-marginThresholdPct', /marginThresholdPct: pct/.test(s));
        tick('v1.22/2.7.1-input-testid', /data-testid="margin-threshold-input"/.test(s));
        tick('v1.22/2.7.1-save-testid', /data-testid="margin-threshold-save"/.test(s));
    } else {
        ['writes-marginThresholdPct','input-testid','save-testid'].forEach(k => tick(`v1.22/2.7.1-${k}`, false));
    }
    const mp = read('src/components/manage-organisation-page.tsx');
    tick('v1.22/2.7.1-mounted-on-manage', /<MarginThresholdCard/.test(mp));
});

test('Recent Activity Feed (1.7.3)', async () => {
    tick('v1.22/1.7.3-component-exists', exists('src/components/recent-activity-feed.tsx'));
    if (exists('src/components/recent-activity-feed.tsx')) {
        const s = read('src/components/recent-activity-feed.tsx');
        tick('v1.22/1.7.3-collectionGroup-auditLog', /collectionGroup\(firestore, 'auditLog'\)/.test(s));
        tick('v1.22/1.7.3-testid', /data-testid="recent-activity-feed"/.test(s));
    } else {
        ['collectionGroup-auditLog','testid'].forEach(k => tick(`v1.22/1.7.3-${k}`, false));
    }
    const rules = read('firestore.rules');
    tick('v1.22/1.7.3-recursive-auditlog-rule', /match \/\{path=\*\*\}\/auditLog\/\{eventId\}/.test(rules));
});

test('Promotion Entry (4.1.1)', async () => {
    tick('v1.22/4.1.1-lib-exists', exists('src/lib/catalog/promotion.ts'));
    if (exists('src/lib/catalog/promotion.ts')) {
        const s = read('src/lib/catalog/promotion.ts');
        tick('v1.22/4.1.1-form-types', /PromotionForm = 'percent' \| 'fixed' \| 'free-item' \| 'bundle'/.test(s));
        tick('v1.22/4.1.1-promotionDiscount', /export function promotionDiscount/.test(s));
        tick('v1.22/4.1.1-isLive', /export function isPromotionLive/.test(s));
    } else {
        ['form-types','promotionDiscount','isLive'].forEach(k => tick(`v1.22/4.1.1-${k}`, false));
    }
});

test('Variation Order Document (2.6.1)', async () => {
    tick('v1.22/2.6.1-lib-exists', exists('src/lib/catalog/variation-order-doc.ts'));
    if (exists('src/lib/catalog/variation-order-doc.ts')) {
        const s = read('src/lib/catalog/variation-order-doc.ts');
        tick('v1.22/2.6.1-buildVariationOrderDoc', /export function buildVariationOrderDoc/.test(s));
        tick('v1.22/2.6.1-gst-ceil', /Math\.ceil/.test(s));
    } else {
        ['buildVariationOrderDoc','gst-ceil'].forEach(k => tick(`v1.22/2.6.1-${k}`, false));
    }
});

test('Content block layout toggle (1.8.3)', async () => {
    tick('v1.22/1.8.3-lib-exists', exists('src/lib/catalog/content-block-layout.ts'));
    if (exists('src/lib/catalog/content-block-layout.ts')) {
        const s = read('src/lib/catalog/content-block-layout.ts');
        tick('v1.22/1.8.3-startsOnNewPage', /startsOnNewPage/.test(s));
        tick('v1.22/1.8.3-resolveBlockLayout', /export function resolveBlockLayout/.test(s));
        tick('v1.22/1.8.3-blockBreaksPage', /export function blockBreaksPage/.test(s));
    } else {
        ['startsOnNewPage','resolveBlockLayout','blockBreaksPage'].forEach(k => tick(`v1.22/1.8.3-${k}`, false));
    }
});

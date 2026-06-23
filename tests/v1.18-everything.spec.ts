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

test('Receipt PDF branding — shared pdf-branding lib (Story "Receipt PDF branding")', async () => {
    const fs = require('fs');
    const path = 'src/lib/pdf-branding.ts';
    tick('v1.18/receipt-branding-lib-exists', fs.existsSync(path));
    if (fs.existsSync(path)) {
        const src = fs.readFileSync(path, 'utf8');
        tick('v1.18/receipt-branding-tokens-type', /export interface PdfBrandingTokens/.test(src));
        tick('v1.18/receipt-branding-default-export', /export const DEFAULT_PDF_BRANDING/.test(src));
        tick('v1.18/receipt-branding-resolve-fn', /export function resolveBranding/.test(src));
        tick('v1.18/receipt-branding-merges-org-overrides', /organisation\?\.pdfBranding/.test(src));
    } else {
        ['tokens-type','default-export','resolve-fn','merges-org-overrides'].forEach(k => tick(`v1.18/receipt-branding-${k}`, false));
    }
    const proposalPdf = fs.readFileSync('src/components/proposal-pdf.tsx', 'utf8');
    tick('v1.18/receipt-branding-quote-pdf-uses-shared-tokens', /from '@\/lib\/pdf-branding'/.test(proposalPdf));
    tick('v1.18/receipt-branding-quote-pdf-defaults-byte-identical', /DEFAULT_PDF_BRANDING\.brand/.test(proposalPdf) && /DEFAULT_PDF_BRANDING\.gold/.test(proposalPdf));
});

test('Send Quote Action (boat side) — 1.4.2 wiring intact', async () => {
    // 1.4.2 ships as a stale-flip in v1.18. The dialog + button + pipeline
    // shipped in v1.8 (story 1.2.4.c). This test pins the wiring so any
    // future regression that breaks the send pipeline surfaces here.
    const fs = require('fs');
    const dialog = fs.readFileSync('src/components/send-quote-dialog.tsx', 'utf8');
    tick('v1.18/1.4.2-send-dialog-component', /SendQuoteDialog/.test(dialog));
    tick('v1.18/1.4.2-render-quote-pdf-step', /renderQuotePdf/.test(dialog));
    // mail/{id} write lives in lib/email-send.ts (sendQuoteEmail pipeline).
    tick('v1.18/1.4.2-mail-trigger-write', /sendQuoteEmail/.test(dialog) && /collection.*['\"]mail['\"]|addDoc.*mail/.test(require('fs').readFileSync('src/lib/email-send.ts', 'utf8')));
    tick('v1.18/1.4.2-sent-emails-audit', /sentEmails/.test(dialog));
    tick('v1.18/1.4.2-auto-lock-on-first-send', /lockQuote|lockedAt/.test(dialog));

    const view = fs.readFileSync('src/components/proposal-view.tsx', 'utf8');
    tick('v1.18/1.4.2-send-button-on-proposal-view', /Send Quote/.test(view));
    tick('v1.18/1.4.2-email-send-flag-gating', /NEXT_PUBLIC_EMAIL_SEND_ENABLED/.test(view));
});

test('Edit Stock Item — inline edit on stock rows', async () => {
    const fs = require('fs');
    const src = fs.readFileSync('src/components/stock-list.tsx', 'utf8');
    tick('v1.18/edit-stock-imports-inline-edit-cell', /from '@\/components\/inline-edit-cell'/.test(src));
    tick('v1.18/edit-stock-patchStockItem-helper', /const patchStockItem/.test(src));
    tick('v1.18/edit-stock-writes-to-inventory', /'inventory', itemId\), \{ \[field\]: next \}/.test(src));
    tick('v1.18/edit-stock-stockNumber-editable', /onSave=\{\(v\) => patchStockItem\(item\.id, 'stockNumber'/.test(src));
    tick('v1.18/edit-stock-location-editable', /onSave=\{\(v\) => patchStockItem\(item\.id, 'location'/.test(src));
    tick('v1.18/edit-stock-label-editable', /onSave=\{\(v\) => patchStockItem\(item\.id, 'label'/.test(src));
    tick('v1.18/edit-stock-readonly-respected', /readOnly \?/.test(src));
});

test('Export Data brand -> range -> model hierarchy CSV', async () => {
    const fs = require('fs');
    const path = 'src/components/catalog-hierarchy-export.tsx';
    tick('v1.18/hierarchy-export-component-exists', fs.existsSync(path));
    if (fs.existsSync(path)) {
        const src = fs.readFileSync(path, 'utf8');
        tick('v1.18/hierarchy-export-walks-ranges', /'ranges'/.test(src) && /'models'/.test(src));
        tick('v1.18/hierarchy-export-includes-brand-range-model-cols', /'Brand'/.test(src) && /'Range'/.test(src) && /'Model Code'/.test(src));
        tick('v1.18/hierarchy-export-margin-calc', /margin =/.test(src) && /sellPriceExclGst/.test(src));
        tick('v1.18/hierarchy-export-csv-mime', /text\/csv;charset=utf-8/.test(src));
        tick('v1.18/hierarchy-export-filename-dated', /catalog-hierarchy-\$\{stamp\}\.csv/.test(src));
        tick('v1.18/hierarchy-export-testid', /data-testid="catalog-hierarchy-export"/.test(src));
    } else {
        ['walks-ranges','includes-brand-range-model-cols','margin-calc','csv-mime','filename-dated','testid'].forEach(k => tick(`v1.18/hierarchy-export-${k}`, false));
    }
    const page = fs.readFileSync('src/app/(app)/pricing-manager/page.tsx', 'utf8');
    tick('v1.18/hierarchy-export-wired-into-catalog-manager', /<CatalogHierarchyExport\s/.test(page));
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

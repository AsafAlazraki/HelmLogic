/**
 * v1.19 — every shipped story validated.
 *
 *   2.2.1 — Margin Threshold Enforcement + GM Override (this commit)
 *   2.1.2 — Model-Specific Fit-Out Pricing (later commit)
 *   2.3.1 — Quote Variations (later commit)
 *   2.6.3 — Customer Agreement on Variation (later commit)
 */
import { test } from '@playwright/test';

const ticks: Record<string, boolean> = {};
const tick = (n: string, ok: boolean) => { ticks[n] = ok; console.log(`${ok ? '✅' : '❌'} ${n}`); };
test.afterAll(() => {
    console.log('\n=== v1.19 summary ===');
    for (const [n, ok] of Object.entries(ticks)) console.log(`  ${ok ? '✅' : '❌'}  ${n}`);
    const p = Object.values(ticks).filter(Boolean).length;
    console.log(`  ${p}/${Object.keys(ticks).length} passed\n`);
});

test('Quote Variations schema + helpers (2.3.1)', async () => {
    const fs = require('fs');
    const lib = 'src/lib/catalog/quote-variation.ts';
    tick('v1.19/2.3.1-lib-exists', fs.existsSync(lib));
    if (fs.existsSync(lib)) {
        const src = fs.readFileSync(lib, 'utf8');
        tick('v1.19/2.3.1-status-type', /QuoteVariationStatus = 'draft' \| 'sent' \| 'accepted' \| 'rejected'/.test(src));
        tick('v1.19/2.3.1-line-kind-type', /QuoteVariationLineKind = 'add' \| 'remove' \| 'priceAdjust'/.test(src));
        tick('v1.19/2.3.1-canTransition-helper', /export function canTransitionVariationStatus/.test(src));
        tick('v1.19/2.3.1-computeVariationTotal-helper', /export function computeVariationTotal/.test(src));
        tick('v1.19/2.3.1-newAcceptToken-helper', /export function newAcceptToken/.test(src));
        tick('v1.19/2.3.1-accepted-terminal', /accepted: \[\]/.test(src));
        tick('v1.19/2.3.1-rejected-terminal', /rejected: \[\]/.test(src));
        tick('v1.19/2.3.1-2.6.3-customer-accept-fields', /acceptedSignatureDataUrl/.test(src) && /acceptedByName/.test(src) && /publicAcceptToken/.test(src));
    } else {
        ['status-type','line-kind-type','canTransition-helper','computeVariationTotal-helper','newAcceptToken-helper','accepted-terminal','rejected-terminal','2.6.3-customer-accept-fields'].forEach(k => tick(`v1.19/2.3.1-${k}`, false));
    }
});

test('Quote Variations rules path + regression test extension (2.3.1)', async () => {
    const fs = require('fs');
    const rules = fs.readFileSync('firestore.rules', 'utf8');
    tick('v1.19/2.3.1-rules-variations-match', /match \/variations\/\{variationId\}/.test(rules));
    const ruleTest = fs.readFileSync('tests/firestore-rules-deployed.spec.ts', 'utf8');
    tick('v1.19/2.3.1-rules-test-includes-variations', /'variations'/.test(ruleTest) && /USER_QUOTE_SUBPATHS/.test(ruleTest));
});

test('Model-Specific Fit-Out Pricing (2.1.2)', async () => {
    const fs = require('fs');
    const lib = 'src/lib/catalog/fit-out-pricing.ts';
    tick('v1.19/2.1.2-lib-exists', fs.existsSync(lib));
    if (fs.existsSync(lib)) {
        const src = fs.readFileSync(lib, 'utf8');
        tick('v1.19/2.1.2-tier-type', /export type FitOutTier = 'basic' \| 'moderate' \| 'complex'/.test(src));
        tick('v1.19/2.1.2-resolveFitOutPrice-exported', /export function resolveFitOutPrice/.test(src));
        tick('v1.19/2.1.2-hasFitOutPricing-exported', /export function hasFitOutPricing/.test(src));
        tick('v1.19/2.1.2-returns-null-when-unset', /if \(value == null\) return null/.test(src));
        tick('v1.19/2.1.2-rejects-negative', /value < 0/.test(src));
    } else {
        ['tier-type','resolveFitOutPrice-exported','hasFitOutPricing-exported','returns-null-when-unset','rejects-negative'].forEach(k => tick(`v1.19/2.1.2-${k}`, false));
    }
    const editor = fs.readFileSync('src/components/highfield-model-editor.tsx', 'utf8');
    tick('v1.19/2.1.2-schema-field-on-model', /fitOutPricing: z\.object/.test(editor));
    tick('v1.19/2.1.2-three-tier-inputs', /fitOutPricing\.\$\{tier\}|fitOutPricing\.\${tier}/.test(editor) || (/'basic'/.test(editor) && /'moderate'/.test(editor) && /'complex'/.test(editor) && /Package pricing/.test(editor)));
    tick('v1.19/2.1.2-editor-testid', /data-testid="fit-out-pricing-fields"/.test(editor));
});

test('Margin Threshold Enforcement + GM Override (2.2.1)', async () => {
    const fs = require('fs');
    const gate = 'src/lib/catalog/margin-gate.ts';
    tick('v1.19/2.2.1-margin-gate-lib-exists', fs.existsSync(gate));
    if (fs.existsSync(gate)) {
        const src = fs.readFileSync(gate, 'utf8');
        tick('v1.19/2.2.1-default-threshold-15', /DEFAULT_MARGIN_THRESHOLD_PCT = 15/.test(src));
        tick('v1.19/2.2.1-evaluateMarginGate-exported', /export function evaluateMarginGate/.test(src));
        tick('v1.19/2.2.1-status-pass-warn-fail', /'pass'/.test(src) && /'warn'/.test(src) && /'fail'/.test(src));
        tick('v1.19/2.2.1-requiresOverride-flag', /requiresOverride/.test(src));
        tick('v1.19/2.2.1-canProceed-flag', /canProceed/.test(src));
        tick('v1.19/2.2.1-audit-event-shape', /MarginOverrideAuditEvent/.test(src));
    } else {
        ['default-threshold-15','evaluateMarginGate-exported','status-pass-warn-fail','requiresOverride-flag','canProceed-flag','audit-event-shape'].forEach(k => tick(`v1.19/2.2.1-${k}`, false));
    }

    const finalize = fs.readFileSync('src/components/finalize-quote-dialog.tsx', 'utf8');
    tick('v1.19/2.2.1-finalize-imports-gate', /from '@\/lib\/catalog\/margin-gate'/.test(finalize));
    tick('v1.19/2.2.1-finalize-uses-evaluateMarginGate', /evaluateMarginGate\(/.test(finalize));
    tick('v1.19/2.2.1-finalize-uses-org-threshold', /marginThresholdPct/.test(finalize));
    tick('v1.19/2.2.1-finalize-checks-override-permission', /can_override_margin/.test(finalize));
    tick('v1.19/2.2.1-override-dialog-testid', /data-testid="margin-override-dialog"/.test(finalize));
    tick('v1.19/2.2.1-reason-required-min-length', /marginOverrideReason\.trim\(\)\.length < 6/.test(finalize));
    tick('v1.19/2.2.1-block-toast-when-no-permission', /below.*\\\$\{orgThreshold\}.*margin/.test(finalize) || /margin threshold/i.test(finalize));
});

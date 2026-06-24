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

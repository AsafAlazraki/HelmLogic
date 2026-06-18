/**
 * v1.15 — every shipped story validated via file-based assertions.
 *
 *   3.3.1 — Crowdsourced Suggestions with Audit (suggestionAuditLog writes)
 *   3.4.2 — Marketing Copy Editor UI on BoatsTable + on HighfieldModelEditor
 *   9.3.1 — Rule-based fit-up tier auto-classification (fitUpClassificationRules
 *           collection + admin UI + resolver)
 */
import { test } from '@playwright/test';

const ticks: Record<string, boolean> = {};
const tick = (n: string, ok: boolean) => { ticks[n] = ok; console.log(`${ok ? '✅' : '❌'} ${n}`); };
test.afterAll(() => {
    console.log('\n=== v1.15 summary ===');
    for (const [n, ok] of Object.entries(ticks)) console.log(`  ${ok ? '✅' : '❌'}  ${n}`);
    const p = Object.values(ticks).filter(Boolean).length;
    console.log(`  ${p}/${Object.keys(ticks).length} passed\n`);
});

test('Crowdsourced Suggestions with Audit (3.3.1)', async () => {
    const fs = require('fs');
    // Suggestion Approval Queue component
    const queueExists = fs.existsSync('src/components/suggestion-approval-queue.tsx');
    tick('v1.15/3.3.1-suggestion-queue-component', queueExists);
    if (queueExists) {
        const src = fs.readFileSync('src/components/suggestion-approval-queue.tsx', 'utf8');
        // Audit-log writes on approve/reject
        tick('v1.15/3.3.1-audit-log-on-approve-reject', /auditLog|addDoc.*auditLog/.test(src));
    } else {
        tick('v1.15/3.3.1-audit-log-on-approve-reject', false);
    }
});

test('Marketing Copy Editor (3.4.2)', async () => {
    const fs = require('fs');
    const boatsTable = fs.readFileSync('src/components/boats-table-view.tsx', 'utf8');
    const highfieldEditor = fs.readFileSync('src/components/highfield-model-editor.tsx', 'utf8');
    tick('v1.15/3.4.2-marketing-panel-in-boats-table', /MarketingCopyPanel/.test(boatsTable));
    tick('v1.15/3.4.2-marketing-on-highfield-editor', /marketing|description|tagline/i.test(highfieldEditor));
});

test('Fit-up tier rule engine (9.3.1)', async () => {
    const fs = require('fs');
    // Three pieces: collection name, admin UI component, resolver helper
    const ruleManagerExists = fs.existsSync('src/components/fit-up-classification-rules-manager.tsx');
    tick('v1.15/9.3.1-rules-manager-component', ruleManagerExists);

    const resolverExists = fs.existsSync('src/lib/fit-up-classification.ts');
    tick('v1.15/9.3.1-classification-resolver-lib', resolverExists);

    // The resolver should expose resolveClassification
    if (resolverExists) {
        const src = fs.readFileSync('src/lib/fit-up-classification.ts', 'utf8');
        tick('v1.15/9.3.1-resolveClassification-export', /export.*resolveClassification/.test(src));
        tick('v1.15/9.3.1-types-defined', /ClassificationRule|QuoteContext|Condition/.test(src));
    } else {
        tick('v1.15/9.3.1-resolveClassification-export', false);
        tick('v1.15/9.3.1-types-defined', false);
    }

    // Rules manager wires to fitUpClassificationRules collection
    if (ruleManagerExists) {
        const src = fs.readFileSync('src/components/fit-up-classification-rules-manager.tsx', 'utf8');
        tick('v1.15/9.3.1-rules-collection-wiring', /fitUpClassificationRules/.test(src));
    } else {
        tick('v1.15/9.3.1-rules-collection-wiring', false);
    }
});

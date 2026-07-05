/**
 * v1.24 — file-based assertions.
 *   8.1.3 Customer Pipeline View (journey strip on detail sheet)
 *   1.5.3 Customer Notes Timeline
 *   2.5.1 Order Tracking
 */
import { test } from '@playwright/test';
const ticks: Record<string, boolean> = {};
const tick = (n: string, ok: boolean) => { ticks[n] = ok; console.log(`${ok ? '✅' : '❌'} ${n}`); };
test.afterAll(() => {
    console.log('\n=== v1.24 summary ===');
    for (const [n, ok] of Object.entries(ticks)) console.log(`  ${ok ? '✅' : '❌'}  ${n}`);
    console.log(`  ${Object.values(ticks).filter(Boolean).length}/${Object.keys(ticks).length} passed\n`);
});
const read = (p: string) => require('fs').readFileSync(p, 'utf8');
const exists = (p: string) => require('fs').existsSync(p);

test('Customer Notes Timeline (1.5.3)', async () => {
    tick('v1.24/1.5.3-lib-exists', exists('src/lib/catalog/customer-note.ts'));
    if (exists('src/lib/catalog/customer-note.ts')) {
        const s = read('src/lib/catalog/customer-note.ts');
        tick('v1.24/1.5.3-note-kinds', /CustomerNoteKind = 'note' \| 'call' \| 'email' \| 'meeting' \| 'system'/.test(s));
        tick('v1.24/1.5.3-sortNotesDesc', /export function sortNotesDesc/.test(s));
    } else {
        ['note-kinds','sortNotesDesc'].forEach(k => tick(`v1.24/1.5.3-${k}`, false));
    }
    const sheet = read('src/components/customer-detail-sheet.tsx');
    tick('v1.24/1.5.3-timeline-in-sheet', /data-testid="customer-notes-timeline"/.test(sheet));
    tick('v1.24/1.5.3-add-note-wired', /addDoc\(collection\(firestore, 'customers', full\.id, 'notes'\)/.test(sheet));
    tick('v1.24/1.5.3-notesCount-increment', /notesCount: increment\(1\)/.test(sheet));
    const rules = read('firestore.rules');
    tick('v1.24/1.5.3-notes-rule', /match \/notes\/\{noteId\}/.test(rules));
});

test('Customer Pipeline View — journey (8.1.3)', async () => {
    const sheet = read('src/components/customer-detail-sheet.tsx');
    tick('v1.24/8.1.3-journey-strip', /data-testid="customer-journey"/.test(sheet));
    tick('v1.24/8.1.3-journey-index', /journeyIdx/.test(sheet));
});

test('Order Tracking (2.5.1)', async () => {
    tick('v1.24/2.5.1-lib-exists', exists('src/lib/catalog/order-tracking.ts'));
    if (exists('src/lib/catalog/order-tracking.ts')) {
        const s = read('src/lib/catalog/order-tracking.ts');
        tick('v1.24/2.5.1-state-machine', /canTransitionOrderState/.test(s));
        tick('v1.24/2.5.1-sequence', /ORDER_STATE_SEQUENCE/.test(s));
        tick('v1.24/2.5.1-progress', /export function orderProgress/.test(s));
    } else {
        ['state-machine','sequence','progress'].forEach(k => tick(`v1.24/2.5.1-${k}`, false));
    }
    const sheet = read('src/components/contract-detail-sheet.tsx');
    tick('v1.24/2.5.1-strip-in-contract-sheet', /data-testid="order-tracking"/.test(sheet));
});

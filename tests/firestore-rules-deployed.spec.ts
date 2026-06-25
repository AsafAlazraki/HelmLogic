/**
 * v1.17 hotfix — Firestore rules-deployment regression test.
 *
 * Why this exists: prod bug 2026-06-16. The v1.15/9.3.1
 * fitUpClassificationRules collection was added to firestore.rules in
 * the repo, but the rules were never redeployed to prod. The first
 * customer to advance a quote past the trailer step hit
 *
 *   "Missing or insufficient permissions: ... method: list,
 *    path: /databases/(default)/documents/organisations/{orgId}/fitUpClassificationRules"
 *
 * because the resolver in fit-up-classification.ts:150 + the selector
 * in fit-up-quote-selector.tsx:321 both list the collection at quote
 * time.
 *
 * This test signs in as Bill Hull (the canonical operator test user)
 * and lists every collection that's been added to firestore.rules
 * across v1.10–v1.17. If any path returns permission-denied, the test
 * fails with the exact missing path so we can publish the rules
 * BEFORE customers hit it.
 *
 * Run on every dev → main PR: a green pass certifies that the deployed
 * rules match the repo for the paths Northside Marine actually hits.
 */
import { test, expect } from '@playwright/test';
import { initializeApp, getApps, deleteApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, query, limit, getDocs } from 'firebase/firestore';

// Same Firebase web config the app uses (public + safe to embed; gating
// is on the security rules, not the API key).
const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY',
    authDomain: 'studio-2290360004-3b963.firebaseapp.com',
    projectId: 'studio-2290360004-3b963',
};

const BILL_EMAIL = process.env.E2E_EMAIL || 'billh@nsmarine.com.au';
const BILL_PASSWORD = process.env.E2E_PASSWORD || 'Bill2026!';
const NSM_ORG_ID = 'AcFZVEFA5UDJG2hyetWT';

/** Collections under users/{uid}/quotes/{qid}/ that we list at runtime.
 *  Same rules-deploy concern as the org subcollections — if a new path
 *  ships without a rules update, customers hit "Something went wrong"
 *  on the very next read. */
const USER_QUOTE_SUBPATHS = [
    'variations', // v1.19 — quote variations (post-contract delta sheets)
    'contracts',  // v1.20/2.4.1 — contracts when a quote is converted
];

/** Collections we ship code for that were added v1.10–v1.17.
 *  If any of these denies LIST in prod, customers see "Something went wrong"
 *  on the very next quote where the read happens. */
const ORG_COLLECTIONS_TO_LIST = [
    'fitUpItems',                 // v1.10/9.1.x
    'fitUpPackages',              // v1.11 expansion
    'fitUpClassificationRules',   // v1.15/9.3.1  <-- the one that bit us
    'fitUpCatalogAudit',          // v1.11 expansion-2
    'catalogAudit',               // v1.11 follow-up
    'serviceOperations',          // v1.10/11.1
    'serviceParts',               // v1.10/11.1
    'serviceQuotes',              // v1.11/11.2
    'contentBlocks',              // v1.7/1.8.1
    'pdfStructure',               // v1.7/1.8.11
    'salesTeam',                  // v1.7/1.8.12
    'emailTemplates',             // v1.8/1.2.4.a
    'sharePointConfig',           // v1.9/1.3.3
    'modelOverrides',
    'trailerOverrides',           // v1.14/3.7.6
    'exchangeRates',
    'dealerFitSelections',
];

const ticks: Record<string, boolean> = {};
const tick = (n: string, ok: boolean) => { ticks[n] = ok; console.log(`${ok ? '✅' : '❌'} ${n}`); };
test.afterAll(() => {
    console.log('\n=== firestore-rules-deployed summary ===');
    for (const [n, ok] of Object.entries(ticks)) console.log(`  ${ok ? '✅' : '❌'}  ${n}`);
    const p = Object.values(ticks).filter(Boolean).length;
    console.log(`  ${p}/${Object.keys(ticks).length} passed\n`);
});

test('Bill Hull can LIST every v1.10-v1.17 org subcollection (rules deployed)', async () => {
    test.setTimeout(120_000);

    // Initialize a fresh Firebase app for this test (don't clash with other suites).
    const appName = `rules-check-${Date.now()}`;
    const app = initializeApp(FIREBASE_CONFIG, appName);
    try {
        const auth = getAuth(app);
        await signInWithEmailAndPassword(auth, BILL_EMAIL, BILL_PASSWORD);
        const db = getFirestore(app);

        for (const sub of ORG_COLLECTIONS_TO_LIST) {
            try {
                const q = query(collection(db, 'organisations', NSM_ORG_ID, sub), limit(1));
                await getDocs(q);
                tick(`rules/organisations.${sub}.list`, true);
            } catch (err: any) {
                const msg = err?.message ?? String(err);
                const denied = /permission-denied|Missing or insufficient permissions/i.test(msg);
                if (denied) {
                    console.log(`   ↳ DENIED: ${msg.slice(0, 200)}`);
                }
                tick(`rules/organisations.${sub}.list`, false);
            }
        }

        // v1.19 — verify the user-quote subcollections (variations etc.)
        // are reachable. We list against the current user's own uid so
        // no cross-user permission gymnastics are needed.
        const currentUserId = auth.currentUser?.uid;
        if (currentUserId) {
            // List the quotes collection once to get a real quote id we can
            // probe the subpath under. Some test users have no quotes yet,
            // in which case we still need to verify the rule by listing the
            // subcollection on a synthetic quote id (Firestore returns
            // empty + the rule check still fires).
            for (const sub of USER_QUOTE_SUBPATHS) {
                try {
                    const probeQuoteId = '__rules_probe__';
                    const q = query(collection(db, 'users', currentUserId, 'quotes', probeQuoteId, sub), limit(1));
                    await getDocs(q);
                    tick(`rules/users.quotes.${sub}.list`, true);
                } catch (err: any) {
                    const msg = err?.message ?? String(err);
                    const denied = /permission-denied|Missing or insufficient permissions/i.test(msg);
                    if (denied) {
                        console.log(`   ↳ DENIED: ${msg.slice(0, 200)}`);
                    }
                    tick(`rules/users.quotes.${sub}.list`, false);
                }
            }
        }
    } finally {
        await deleteApp(app).catch(() => {});
    }

    // Every collection must list cleanly. If anything fails, the deployed
    // rules don't match the repo and customers will hit "Something went wrong".
    const denied = Object.entries(ticks).filter(([, ok]) => !ok).map(([k]) => k);
    expect(denied, `Rules drift detected. Republish firestore.rules to prod. Denied: ${denied.join(', ')}`).toEqual([]);
});

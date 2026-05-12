/**
 * v1.9 (1.3.3) — One-shot story update for SharePoint Quote Storage.
 *
 * Mid-build the user expanded 1.3.3 scope from a single Finalize-only
 * trigger to all 5 lifecycle events (Finalize / Send / Scenario / Fork /
 * Terminal), with a true 4-level mirror of HL's hierarchy and env-flag
 * gating. The in-app /feature-tracking story doc needs its
 * acceptanceCriteria + description refreshed so the roadmap is truly
 * reflective of what shipped (per the user's "roadmap truly reflective"
 * directive).
 *
 * Matched by title prefix (per v1.8 finalize-seed lesson — there is no
 * stable storyId field on features; the canonical "1.3.3" lives at the
 * front of the title).
 *
 * Idempotent: re-runs do nothing visible (already-updated docs match
 * the target text and the seed reports `0 updated`).
 *
 * Lifecycle (per CONVENTIONS.md one-shot pattern):
 *   1. Commit adds this file + a "Refresh 1.3.3 story" button on the
 *      Backlog header (next to "New Epic").
 *   2. User clicks the button on dev → toast confirms updated count.
 *   3. Follow-up commit removes the file + button (Commit 7b).
 */

import {
    collection,
    getDocs,
    serverTimestamp,
    updateDoc,
    type Firestore,
} from 'firebase/firestore';

const TITLE_PREFIX = '1.3.3';

/** Acceptance criteria text shipped in v1.9 1.3.3 (post-expansion). */
const TARGET_ACCEPTANCE: string[] = [
    'Per-org SharePoint config edited in /manage → Integrations tab (tenantId, clientId, siteId, folderPath + enabled toggle).',
    'Azure app is multi-tenant; secret lives ONCE in Firebase App Hosting backend env (SHAREPOINT_CLIENT_SECRET) — never in Firestore.',
    'Folder mirror 4 levels deep matching HL hierarchy: HelmLogic — {Org}/ {Salesperson}/ {Customer} — {Root#}/ {Original | Scenario Label | v{N}}/ Quote.pdf.',
    'Sync fires on FIVE events: Finalize, Send, Scenario create (1.1.3), Fork-on-edit (1.8 1.3.1), Terminal lifecycle (Accepted/Rejected/Lost/Expired via 1.4.1 picker).',
    'Env-flag gated via NEXT_PUBLIC_SHAREPOINT_ENABLED — code ships dormant; flip the flag once Azure setup is verified per tasks/ADMIN_TASK_sharepoint-setup.md.',
    'One-way mirror: HelmLogic Firestore is the source of truth; edits in SharePoint do NOT sync back.',
    'Best-effort sync — failures log a console.warn + return SyncResult; the parent HL operation (finalize / send / fork / scenario / terminal) is unaffected.',
    'Each successful sync stamps sharePointSyncedAt / sharePointPath / sharePointWebUrl on the quote doc. Rules whitelist allows these writes even on LOCKED quotes (post-send sync).',
    'Conflict behaviour: re-syncs replace the file at the same path (latest wins). Folder creation is idempotent across concurrent syncs.',
];

const TARGET_DESCRIPTION =
    'Mirror customer-quote PDFs into a SharePoint site folder tree that matches HelmLogic\'s Firestore hierarchy 1:1. HelmLogic stays the source of truth — the SharePoint copy is a read-only artefact for non-HL stakeholders (managers, accountants, dealer-network ops). Sync triggers on every HL event that materially changes the PDF: finalize, send, scenario create, fork-on-edit, terminal lifecycle. Server-side Next.js API route handles OAuth client-credentials + Graph upload; secret kept out of the client bundle. Env-flag-gated so v1.9 can roll to prod even before Azure setup completes — flip NEXT_PUBLIC_SHAREPOINT_ENABLED=true and configure organisations/{orgId}/sharePointConfig/default once a HelmLogic admin works through tasks/ADMIN_TASK_sharepoint-setup.md.';

export interface SharePointStorySeedResult {
    matched: number;
    updated: number;
    skippedUpToDate: number;
}

/** Cheap array-equality for the idempotency check. */
function arraysEqual(a: readonly string[] | undefined, b: readonly string[]): boolean {
    if (!a || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

export async function seedV19SharePointStory(firestore: Firestore): Promise<SharePointStorySeedResult> {
    const snap = await getDocs(collection(firestore, 'features'));
    const matches = snap.docs.filter(d => {
        const title = String(d.data().title ?? '');
        return title.trim().startsWith(TITLE_PREFIX);
    });

    let updated = 0;
    let skippedUpToDate = 0;
    for (const docSnap of matches) {
        const cur = docSnap.data();
        const acAlreadyMatches = arraysEqual(cur.acceptanceCriteria as string[] | undefined, TARGET_ACCEPTANCE);
        const descAlreadyMatches = cur.description === TARGET_DESCRIPTION;
        if (acAlreadyMatches && descAlreadyMatches) {
            skippedUpToDate++;
            continue;
        }
        await updateDoc(docSnap.ref, {
            acceptanceCriteria: TARGET_ACCEPTANCE,
            description: TARGET_DESCRIPTION,
            updatedAt: serverTimestamp(),
        });
        updated++;
    }

    return { matched: matches.length, updated, skippedUpToDate };
}

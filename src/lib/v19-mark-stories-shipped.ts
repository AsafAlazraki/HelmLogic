/**
 * v1.9 — One-shot "finalise stories" seed.
 *
 * After the v1.9 dev → main cycle wraps, the in-app /feature-tracking
 * story docs need their individual `status` fields aligned with reality:
 *   - The 5 shipped v1.9 stories → `status: 'shipped'`
 *   - 1.8.3 (dropped mid-Phase-A) → `status: 'planned'` + retargeted
 *     to v1.10+ so it doesn't sit as un-shipped under the shipped v1.9
 *     column on the Roadmap.
 *
 * Matched by title prefix (per the v1.8 finalize-seed lesson — there
 * is no stable storyId field on features; the canonical "x.y.z" lives
 * at the front of the title).
 *
 * Idempotent: re-runs do nothing visible (already-current docs match
 * the target state).
 *
 * Lifecycle (per CONVENTIONS.md one-shot pattern):
 *   1. Commit adds this file + a "Finalise v1.9 Stories" button on
 *      the Backlog header (next to "New Epic").
 *   2. User clicks → toast reports counts.
 *   3. Follow-up commit removes the file + button.
 */

import {
    collection,
    getDocs,
    serverTimestamp,
    updateDoc,
    type Firestore,
} from 'firebase/firestore';

/** Mapping: title-prefix → desired state. Order doesn't matter because
 *  the writer is keyed by docSnap.ref + the target fields. */
const SHIPPED_PREFIXES: string[] = ['1.1.2', '1.8.4', '1.4.1', '1.1.3', '1.3.3'];

/** Stories that were on the v1.9 column in Firestore but should NOT
 *  ship under v1.9 — retarget to v1.10 with `status: 'planned'` so the
 *  Roadmap shows them under the next bucket rather than dangling as
 *  un-shipped under shipped v1.9.
 *
 *  - 1.8.3 `startsOnNewPage` UI: dropped mid-Phase-A (schema dormant
 *    under v1.7 PDF architecture; 1.8.4 didn't unblock it).
 *  - 1.3.2 Contract Signing Pack: punted at plan time because pack
 *    delivery is email-adjacent; hold until email decisions land.
 *    Still in v1.9 column in Firestore — fix here so the Roadmap is
 *    truly reflective. */
const RETARGET_PREFIXES: string[] = ['1.8.3', '1.3.2'];
const RETARGET_TO_RELEASE = 'v1.10';

export interface FinaliseV19Result {
    matched: number;
    shippedUpdated: number;
    shippedAlreadyCurrent: number;
    retargetUpdated: number;
    retargetAlreadyCurrent: number;
}

export async function finaliseV19Stories(firestore: Firestore): Promise<FinaliseV19Result> {
    const snap = await getDocs(collection(firestore, 'features'));
    const out: FinaliseV19Result = {
        matched: 0,
        shippedUpdated: 0,
        shippedAlreadyCurrent: 0,
        retargetUpdated: 0,
        retargetAlreadyCurrent: 0,
    };

    for (const d of snap.docs) {
        const data = d.data() as any;
        const title = String(data.title ?? '').trim();
        if (!title) continue;

        // Shipped stories — title starts with one of the v1.9 prefixes.
        const isShipped = SHIPPED_PREFIXES.some(p => title.startsWith(p));
        if (isShipped) {
            out.matched++;
            if (data.status === 'shipped') {
                out.shippedAlreadyCurrent++;
            } else {
                await updateDoc(d.ref, {
                    status: 'shipped',
                    updatedAt: serverTimestamp(),
                });
                out.shippedUpdated++;
            }
            continue;
        }

        // Retargets — move to v1.10 + status: 'planned' so the Roadmap
        // shows them under the right bucket.
        const isRetarget = RETARGET_PREFIXES.some(p => title.startsWith(p));
        if (isRetarget) {
            out.matched++;
            const alreadyCurrent = data.targetRelease === RETARGET_TO_RELEASE && data.status === 'planned';
            if (alreadyCurrent) {
                out.retargetAlreadyCurrent++;
            } else {
                await updateDoc(d.ref, {
                    targetRelease: RETARGET_TO_RELEASE,
                    status: 'planned',
                    updatedAt: serverTimestamp(),
                });
                out.retargetUpdated++;
            }
        }
    }

    return out;
}

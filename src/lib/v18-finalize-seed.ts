/**
 * v1.8 Finalize Seed (one-shot, story-status flip).
 *
 * Marks every feature with `targetRelease === 'v1.8'` as
 * `status: 'shipped'` so the Backlog + Board reflect the release
 * actually shipped. Skip-if-already-shipped — re-running is safe
 * but writes nothing extra.
 *
 * One-shot lifecycle per CONVENTIONS.md:
 *   1. Build the button on this commit (`finalizeV18Release()` here,
 *      "Finalize v1.8 Release" button on backlog-view.tsx)
 *   2. User clicks the button on dev once
 *   3. Next dev push removes the button + this module + flips
 *      `RELEASE_WINDOWS['v1.8'].shipped = true` (already done in
 *      32d1dc4 — flip happened during Phase D close-out)
 *
 * v1.8 punted carry-overs (1.1.2, 1.8.3 startsOnNewPage UI) STAY at
 * their current status — they did not ship. The seed scopes only to
 * stories that completed during the build cycle.
 */

import {
    collection,
    doc,
    getDocs,
    serverTimestamp,
    updateDoc,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

/** Story IDs that were completed in v1.8 (will be flipped to shipped).
 *  Excludes 1.1.2 + 1.8.3 (the punted carry-overs). */
const V18_SHIPPED_STORY_IDS = new Set<string>([
    '1.5.0',   // PDF render refactor
    '1.4.1',   // Audit log + Activity tab
    '1.3.1',   // Lock + fork-on-edit
    '1.2.4',   // Send Quote pipeline + email templates
    '1.2.3',   // Controlled Personalisation
    '1.8.8',   // Content-block import/export
    '6.4.1',   // dependsOn schema + UI validation
    '6.4.2',   // validate-features.ts script
    '6.4.3',   // DEPENDS-ON convention (doc)
]);

/** 1.8.3 partially shipped — version-history polish landed, but the
 *  startsOnNewPage UI checkbox punted. Mark as shipped (the polish
 *  IS the user-visible portion); the punted slice is captured in
 *  v1.9 backlog. */
V18_SHIPPED_STORY_IDS.add('1.8.3');

export interface FinalizeV18Result {
    storiesMarkedShipped: number;
    storiesAlreadyShipped: number;
    storiesNotFound: string[];
    nonV18Skipped: number;
}

/**
 * Idempotent — re-running flips nothing already-shipped. Returns a
 * summary the toast can render.
 */
export async function finalizeV18Release(firestore: Firestore): Promise<FinalizeV18Result> {
    const snap = await getDocs(collection(firestore, 'features'));

    let storiesMarkedShipped = 0;
    let storiesAlreadyShipped = 0;
    let nonV18Skipped = 0;
    const seenIds = new Set<string>();

    for (const d of snap.docs) {
        const data = d.data() as { storyId?: string; status?: string; targetRelease?: string };
        const sid = data.storyId;
        if (!sid) continue;

        if (data.targetRelease !== 'v1.8') {
            nonV18Skipped++;
            continue;
        }

        if (!V18_SHIPPED_STORY_IDS.has(sid)) {
            // v1.8-targeted but not in our shipped set (e.g. 1.1.2 punted).
            nonV18Skipped++;
            continue;
        }

        seenIds.add(sid);

        if (data.status === 'shipped') {
            storiesAlreadyShipped++;
            continue;
        }

        await updateDoc(doc(firestore, 'features', d.id), {
            status: 'shipped',
            updatedAt: serverTimestamp(),
        });
        storiesMarkedShipped++;
    }

    const storiesNotFound = [...V18_SHIPPED_STORY_IDS].filter(id => !seenIds.has(id));

    return {
        storiesMarkedShipped,
        storiesAlreadyShipped,
        storiesNotFound,
        nonV18Skipped,
    };
}

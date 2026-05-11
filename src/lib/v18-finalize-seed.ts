/**
 * v1.8 Finalize Seed (one-shot, story-status flip).
 *
 * Marks every feature with `targetRelease === 'v1.8'` as
 * `status: 'shipped'` so the Backlog + Board reflect the release
 * actually shipped. Skip-if-already-shipped — re-running is safe
 * but writes nothing extra.
 *
 * Story matching: feature docs don't carry a structured `storyId`
 * field — the id is embedded as a prefix in the human title (e.g.
 * "1.5.0 — Extract render-quote-pdf.ts refactor"). We match by
 * scanning each v1.8-targeted feature's title for one of the
 * shipped story-id prefixes. This mirrors how the v1.7 finalize
 * seed (d677ee7) matched by `title.startsWith(prefix)`.
 *
 * One-shot lifecycle per CONVENTIONS.md:
 *   1. Build the button on this commit
 *   2. User clicks the button on dev once
 *   3. Next dev push removes the button + this module
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
 *  Excludes 1.1.2 (punted to v1.9 — Compatibility Rules). 1.8.3 IS in
 *  the list because version-history polish shipped; only the punted
 *  startsOnNewPage UI slice didn't. */
const V18_SHIPPED_STORY_IDS: string[] = [
    '1.5.0',
    '1.4.1',
    '1.3.1',
    '1.2.4',
    '1.2.3',
    '1.8.3',
    '1.8.8',
    '6.4.1',
    '6.4.2',
    '6.4.3',
];

/** True when `title` begins with `storyId` as a complete token —
 *  e.g. "1.5.0 — Extract render-quote-pdf.ts" matches "1.5.0", but
 *  "1.5.01" does NOT. Tolerates leading whitespace. */
function titleMatchesStoryId(title: string | undefined, storyId: string): boolean {
    if (!title) return false;
    const trimmed = title.trimStart();
    if (!trimmed.startsWith(storyId)) return false;
    // Next char must be a separator (end / space / em-dash / hyphen / colon / dot-space).
    const next = trimmed.charAt(storyId.length);
    if (next === '') return true;
    return /[\s—–:\-]/.test(next);
}

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
    const matchedIds = new Set<string>();

    for (const d of snap.docs) {
        const data = d.data() as { title?: string; status?: string; targetRelease?: string | null };

        if (data.targetRelease !== 'v1.8') {
            nonV18Skipped++;
            continue;
        }

        const sid = V18_SHIPPED_STORY_IDS.find(id => titleMatchesStoryId(data.title, id));
        if (!sid) {
            // v1.8-targeted but not one of the stories we're flipping
            // (e.g. 1.1.2 Compatibility Rules — punted to v1.9).
            nonV18Skipped++;
            continue;
        }

        matchedIds.add(sid);

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

    const storiesNotFound = V18_SHIPPED_STORY_IDS.filter(id => !matchedIds.has(id));

    return {
        storiesMarkedShipped,
        storiesAlreadyShipped,
        storiesNotFound,
        nonV18Skipped,
    };
}


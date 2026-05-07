/**
 * Sales Team data layer (v1.7 — story 1.8.12).
 *
 * Per-salesperson messages + photos for the customer PDF. Lives at
 *   organisations/{orgId}/salesTeam/{userId}
 *
 * The salesperson-message section in pdfStructure renders from this
 * doc keyed by quote.createdByUid. Org admins manage all salespeople
 * from a list inside Document Templates → Quote → Salesperson
 * Message; each salesperson can edit their own.
 *
 * Note: this is NOT the org-wide content block. The block-type
 * 'salesperson-message' is special-cased in proposal-pdf.tsx — it
 * doesn't read from contentBlocks/salesperson-message but from this
 * subcollection. The pdfStructure entry stays for ordering / display
 * in the master list; the source-of-truth for content is per-user.
 */

import {
    Timestamp,
    collection,
    doc,
    serverTimestamp,
    setDoc,
    type Firestore,
} from 'firebase/firestore';

export interface SalesTeamMember {
    /** Doc id === user uid. */
    id: string;
    displayName: string;
    role?: string;
    /** TipTap-serialised HTML — same editor as content blocks. */
    messageHtml: string;
    photoUrl: string | null;
    /** Sign-off text appended after the message (e.g. "Cheers, Bill"). */
    signOff?: string;
    updatedAt?: Timestamp;
    updatedByUid?: string;
}

/** Upsert a salesperson's message + photo. */
export async function saveSalesTeamMember(
    firestore: Firestore,
    orgId: string,
    userId: string,
    patch: Partial<Omit<SalesTeamMember, 'id' | 'updatedAt'>>,
    actorUid: string,
): Promise<void> {
    const ref = doc(firestore, `organisations/${orgId}/salesTeam/${userId}`);
    await setDoc(
        ref,
        {
            ...patch,
            updatedAt: serverTimestamp(),
            updatedByUid: actorUid,
        },
        { merge: true },
    );
}

/** Resolve a salesperson's message + photo for the customer PDF
 *  render. Returns null if the user hasn't authored anything yet —
 *  the PDF should fall back to a generic message OR omit the
 *  salesperson section. */
export async function resolveSalesTeamMember(
    firestore: Firestore,
    orgId: string,
    userId: string,
): Promise<SalesTeamMember | null> {
    const { getDoc, doc: docFn } = await import('firebase/firestore');
    const ref = docFn(firestore, `organisations/${orgId}/salesTeam/${userId}`);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as Omit<SalesTeamMember, 'id'>) };
}

/** Storage path prefix for a salesperson's photo. The PhotoUploader
 *  appends a timestamped filename. */
export function salesTeamPhotoPrefix(orgId: string, userId: string): string {
    return `salesTeam/${orgId}/${userId}`;
}

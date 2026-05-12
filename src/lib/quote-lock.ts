/**
 * Quote lock + fork helpers (v1.8 — story 1.3.1.a).
 *
 * The lock mechanism is the v1.8 lifecycle anchor:
 *   - Quote auto-locks on FIRST 1.2.4 Send (lockedReason: 'sent').
 *   - Edit attempts on a locked quote prompt a fork-on-edit popup
 *     (1.3.1.b UI) which calls forkLockedQuote() to duplicate the
 *     doc with version + 1, parentQuoteId, and a fresh editable
 *     status='proposal'.
 *   - Manual unlock is admin-only (1.3.1.c).
 *
 * Schema (added to users/{ownerUid}/quotes/{quoteId} by these helpers):
 *   isLocked?:       boolean       — default false
 *   lockedAt?:       Timestamp     — server timestamp at lock time
 *   lockedByUid?:    string
 *   lockedByName?:   string
 *   lockedReason?:   'sent' | 'manual' | 'finalised'
 *   version:         number        — defaults to 1 if undefined
 *   parentQuoteId?:  string        — set on forks; absent on originals
 *
 * v1.8 behaviour rules (per the v1.8 build plan, signed off Step 1):
 *   - Auto-lock fires ONCE on first successful Send (not finalize).
 *   - Re-sends of a locked quote are allowed; the lock state stays
 *     unchanged. PDF re-renders from the current payload at re-send.
 *   - Fork carries over content overrides (Step 2B Q-popup answer:
 *     "Carry over content overrides; fresh audit log").
 *
 * Server-side lock enforcement lives in firestore.rules — the
 * onlyLockFieldsChanged() rule helper rejects any write to a locked
 * quote that touches fields outside the lock-related whitelist
 * (isLocked / lockedAt / lockedByUid / lockedByName / lockedReason /
 * lastSentAt / sentCount / updatedAt). Power-users with browser dev
 * tools can't bypass.
 *
 * v1.8 OUT OF SCOPE (deferred to v1.9):
 *   - Time-based auto-unlock ("locked for 30 days then auto-unlocked")
 *   - Quote-revoke ("send a no-longer-valid email")
 *   - Customer-record-field independent locking
 */

import {
    collection,
    doc,
    getDoc,
    getDocs,
    serverTimestamp,
    setDoc,
    updateDoc,
    type Firestore,
} from 'firebase/firestore';
import { logAuditEvent } from '@/lib/quote-audit-log';

/* ──────────────────────────────────────────────────────────────────
 * TYPES
 * ────────────────────────────────────────────────────────────────── */

export type LockReason = 'sent' | 'manual' | 'finalised';

interface ActorContext {
    byUid: string;
    byName: string;
}

/* ──────────────────────────────────────────────────────────────────
 * LOCK / UNLOCK
 * ────────────────────────────────────────────────────────────────── */

/**
 * Mark a quote as locked. Idempotent — re-locking a locked quote is
 * a no-op (no Firestore write, no audit event). Also writes a
 * 'locked' audit event capturing the reason.
 */
export async function lockQuote(
    firestore: Firestore,
    ownerUid: string,
    quoteId: string,
    reason: LockReason,
    actor: ActorContext,
): Promise<void> {
    const ref = doc(firestore, 'users', ownerUid, 'quotes', quoteId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
        throw new Error(`lockQuote: quote ${quoteId} not found under user ${ownerUid}`);
    }
    if (snap.data().isLocked === true) {
        return; // already locked, idempotent
    }
    await updateDoc(ref, {
        isLocked: true,
        lockedAt: serverTimestamp(),
        lockedByUid: actor.byUid,
        lockedByName: actor.byName,
        lockedReason: reason,
        updatedAt: serverTimestamp(),
    });
    await logAuditEvent(firestore, ownerUid, quoteId, {
        eventType: 'locked',
        byUid: actor.byUid,
        byName: actor.byName,
        metadata: { lockReason: reason },
    });
}

/**
 * Unlock a previously locked quote. Manual-unlock path (1.3.1.c
 * Activity tab admin button). Caller is responsible for gating on
 * org-admin permission BEFORE calling this — the helper itself
 * performs the write unconditionally.
 *
 * Idempotent on already-unlocked quotes.
 */
export async function unlockQuote(
    firestore: Firestore,
    ownerUid: string,
    quoteId: string,
    actor: ActorContext,
): Promise<void> {
    const ref = doc(firestore, 'users', ownerUid, 'quotes', quoteId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
        throw new Error(`unlockQuote: quote ${quoteId} not found under user ${ownerUid}`);
    }
    if (snap.data().isLocked !== true) {
        return;
    }
    await updateDoc(ref, {
        isLocked: false,
        lockedAt: null,
        lockedByUid: null,
        lockedByName: null,
        lockedReason: null,
        updatedAt: serverTimestamp(),
    });
    await logAuditEvent(firestore, ownerUid, quoteId, {
        eventType: 'unlocked',
        byUid: actor.byUid,
        byName: actor.byName,
    });
}

/* ──────────────────────────────────────────────────────────────────
 * FORK-ON-EDIT
 * ────────────────────────────────────────────────────────────────── */

export interface ForkResult {
    /** New quote doc id (the "v2"). */
    childQuoteId: string;
    /** New version number — parent.version + 1. */
    childVersion: number;
}

/**
 * Duplicate a locked quote into a fresh editable doc (v2). Called
 * by the fork-on-edit popup in 1.3.1.b when an operator confirms
 * "Create v2 from this?" on a locked quote.
 *
 * Carries over: every field on the parent quote EXCEPT lock-related
 * fields, with version + parentQuoteId set on the child. Per Step 2B
 * sign-off, the contentOverrides subcollection (1.2.3) IS carried over
 * — but the auditLog subcollection is NOT (v2 starts a fresh trail).
 *
 * Writes:
 *   - New users/{ownerUid}/quotes/{newId} doc
 *   - All contentOverrides docs copied to the new quote
 *   - 'version-forked' auditLog event on the PARENT (childQuoteId metadata)
 *   - 'version-forked' auditLog event on the CHILD (parentQuoteId metadata) —
 *     this is the new auditLog's first entry
 */
export async function forkLockedQuote(
    firestore: Firestore,
    ownerUid: string,
    parentQuoteId: string,
    actor: ActorContext,
): Promise<ForkResult> {
    const parentRef = doc(firestore, 'users', ownerUid, 'quotes', parentQuoteId);
    const parentSnap = await getDoc(parentRef);
    if (!parentSnap.exists()) {
        throw new Error(`forkLockedQuote: parent quote ${parentQuoteId} not found`);
    }
    const parent = parentSnap.data();
    const parentVersion = (typeof parent.version === 'number' ? parent.version : 1);
    const childVersion = parentVersion + 1;

    // Allocate a new doc id BEFORE any writes so we can stamp it on the
    // doc (matches the existing finalize-quote-dialog pattern).
    const childRef = doc(collection(firestore, 'users', ownerUid, 'quotes'));
    const childQuoteId = childRef.id;

    // Compose the child payload — everything from parent EXCEPT the
    // lock fields, with version + parentQuoteId set + status reset.
    const {
        isLocked: _il,
        lockedAt: _la,
        lockedByUid: _lbu,
        lockedByName: _lbn,
        lockedReason: _lr,
        // Re-send denormalisation also resets — the v2 has zero sends so far.
        lastSentAt: _lsa,
        sentCount: _sc,
        ...carriedFields
    } = parent;

    await setDoc(childRef, {
        ...carriedFields,
        id: childQuoteId,
        isLocked: false,
        version: childVersion,
        parentQuoteId,
        status: 'proposal',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        // createdByUid + createdByName preserved from parent so the
        // assigned salesperson stays the same on v2 by default. The
        // operator can hand off via existing UI if needed.
    });

    // Carry over per-quote content overrides (1.2.3 subcollection — populated
    // in v1.8 once 1.2.3 ships; until then this is a no-op for most quotes).
    try {
        const overridesSnap = await getDocs(
            collection(firestore, 'users', ownerUid, 'quotes', parentQuoteId, 'contentOverrides'),
        );
        for (const ov of overridesSnap.docs) {
            await setDoc(
                doc(firestore, 'users', ownerUid, 'quotes', childQuoteId, 'contentOverrides', ov.id),
                ov.data(),
            );
        }
    } catch (e) {
        console.warn('[fork-quote] contentOverrides carry-over failed (non-fatal):', e);
    }

    // Audit events on BOTH ends so each quote's Activity tab tells its
    // own story.
    await logAuditEvent(firestore, ownerUid, parentQuoteId, {
        eventType: 'version-forked',
        byUid: actor.byUid,
        byName: actor.byName,
        metadata: { childQuoteId },
    });
    await logAuditEvent(firestore, ownerUid, childQuoteId, {
        eventType: 'version-forked',
        byUid: actor.byUid,
        byName: actor.byName,
        metadata: { parentQuoteId },
    });

    return { childQuoteId, childVersion };
}

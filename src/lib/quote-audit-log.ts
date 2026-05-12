/**
 * Quote audit log (v1.8 — story 1.4.1.a).
 *
 * Captures every lifecycle event on a customer quote into a per-quote
 * subcollection so the Activity tab can render an audit trail and
 * downstream stories (1.3.1 lock, 1.2.4 send, 1.2.3 personalisation)
 * can record their state transitions cleanly.
 *
 * Schema:
 *   users/{ownerUid}/quotes/{quoteId}/auditLog/{eventId}
 *     eventType:  AuditEventType
 *     at:         Timestamp (server)
 *     byUid:      string
 *     byName:     string
 *     metadata?:  shape varies by eventType (see types below)
 *
 * v1.4.1.a ships the helper + types + Firestore rules path. Wiring of
 * actual logAuditEvent() call-sites happens in 1.4.1.b. Activity-tab
 * rendering happens in 1.4.1.c.
 *
 * v1.8 OUT OF SCOPE (deferred to v1.9):
 *   - Filter / search in the Activity tab
 *   - Export Activity log as CSV / PDF
 *   - Cross-quote activity feed ("everything I did this week")
 *   - Per-event undo
 *   - Audit-trail server-side enforcement (Firestore rules block
 *     tampering — currently best-effort with isSignedIn() writes).
 */

import {
    addDoc,
    collection,
    orderBy,
    query,
    serverTimestamp,
    type Firestore,
    type Timestamp,
} from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';

/* ──────────────────────────────────────────────────────────────────
 * TYPES
 * ────────────────────────────────────────────────────────────────── */

export type AuditEventType =
    | 'created'                 // new quote, payload first written
    | 'finalised'               // status flipped to 'proposal' (or 'inventory' for stock)
    | 'sent'                    // 1.2.4 — quote emailed to customer
    | 'locked'                  // 1.3.1 — first-send lock fired (or manual lock)
    | 'unlocked'                // 1.3.1 — admin unlock from Activity tab
    | 'version-forked'          // 1.3.1 — fork-on-edit from a locked quote
    | 'content-overridden'      // 1.2.3 — per-quote content-block override saved
    | 'discount-changed'        // proposal-view audit drawer
    | 'lifecycle-transitioned'  // v1.9 (1.4.1) — sales-journey state change
    | 'scenario-created';       // v1.9 (1.1.3) — sibling scenario spawned

export interface AuditEventMetadata {
    /** discount-changed: previous + new values for fast diff render */
    fromValue?: number | string | null;
    toValue?: number | string | null;
    /** content-overridden: which block was overridden */
    blockType?: string;
    /** version-forked: parent quote id (on the v2 doc) or child id (on the v1 doc) */
    parentQuoteId?: string;
    childQuoteId?: string;
    /** sent: pointer to users/{uid}/quotes/{qid}/sentEmails/{sendId} (1.2.4) */
    sentEmailId?: string;
    /** locked: 'sent' | 'manual' | 'finalised' */
    lockReason?: 'sent' | 'manual' | 'finalised';
    /** v1.9 (1.4.1) — lifecycle-transitioned: previous + new state. */
    fromLifecycle?: string;
    toLifecycle?: string;
    /** v1.9 (1.1.3) — scenario-created: human label + sibling pointer. */
    scenarioLabel?: string;
    siblingQuoteId?: string;
    /** Free-form note. */
    note?: string;
}

export interface QuoteAuditEvent {
    id: string;
    eventType: AuditEventType;
    at: Timestamp;
    byUid: string;
    byName: string;
    metadata?: AuditEventMetadata;
}

/* ──────────────────────────────────────────────────────────────────
 * WRITER
 * ────────────────────────────────────────────────────────────────── */

/**
 * Append an event to a quote's auditLog. Best-effort — if the write
 * fails (rules / network), logs a console warning and resolves; the
 * underlying mutation that triggered this audit is the source of
 * truth, not the audit log. Never throws to the caller.
 *
 * Pass `byUid` / `byName` from the calling component's user/profile
 * subscription (no automatic auth lookup here so this stays a pure
 * library function).
 */
export async function logAuditEvent(
    firestore: Firestore,
    ownerUid: string,
    quoteId: string,
    event: {
        eventType: AuditEventType;
        byUid: string;
        byName: string;
        metadata?: AuditEventMetadata;
    },
): Promise<void> {
    try {
        await addDoc(
            collection(firestore, 'users', ownerUid, 'quotes', quoteId, 'auditLog'),
            {
                eventType: event.eventType,
                at: serverTimestamp(),
                byUid: event.byUid,
                byName: event.byName,
                ...(event.metadata ? { metadata: event.metadata } : {}),
            },
        );
    } catch (e) {
        console.warn('[audit-log] failed to write event:', event.eventType, e);
    }
}

/* ──────────────────────────────────────────────────────────────────
 * READER HOOK
 * ────────────────────────────────────────────────────────────────── */

/**
 * Live subscription to a quote's audit log, ordered newest-first.
 * Returns the same `{ data, isLoading, ... }` shape as other useCollection
 * hooks in the codebase. Pass `ownerUid` so the hook works for the
 * org-wide search path (proposal-view.tsx supports loading any user's
 * quote read-only); falls back to the current user when omitted.
 *
 * v1.4.1.a only ships the hook — the Activity tab that consumes it
 * lands in 1.4.1.c.
 */
export function useQuoteAuditLog(ownerUid: string | null | undefined, quoteId: string | null | undefined) {
    const firestore = useFirestore();
    const ref = useMemoFirebase(
        () => (ownerUid && quoteId
            ? query(
                collection(firestore, 'users', ownerUid, 'quotes', quoteId, 'auditLog'),
                orderBy('at', 'desc'),
            )
            : null),
        [firestore, ownerUid, quoteId],
    );
    return useCollection<QuoteAuditEvent>(ref);
}

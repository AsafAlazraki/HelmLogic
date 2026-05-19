/**
 * Quote lifecycle state machine (v1.9 — story 1.4.1).
 *
 * Tracks where a customer quote sits in its sales journey, independent
 * of the lock layer (v1.8 1.3.1). A locked quote can still transition
 * Sent → Viewed → Accepted — the lock gates content edits, not the
 * sales journey.
 *
 * States (open transition graph — operator picks any from the picker;
 * trust + audit, not an enforced graph):
 *   draft     — initial state, not yet sent to the customer
 *   sent      — email out the door (set by email-send.ts on first send)
 *   viewed    — customer opened the email (manual today; auto via open-
 *               tracking is v1.10+ pending email-infra decision)
 *   accepted  — customer agreed; expect deposit / order
 *   rejected  — customer explicitly declined
 *   lost      — customer ghosted / went elsewhere
 *   expired   — quote validity window passed (manual today; cron-based
 *               in a later release)
 *
 * Schema (added to users/{ownerUid}/quotes/{quoteId}):
 *   lifecycleState?:        LifecycleState   — default 'draft' when absent
 *   lifecycleStateAt?:      Timestamp        — server timestamp of last transition
 *   lifecycleStateByUid?:   string
 *   lifecycleStateByName?:  string
 *
 * Stock quotes (`quote.status === 'stock'`) are NOT in the lifecycle —
 * they're internal pricing records, not customer-facing proposals. UI
 * hides the picker for them.
 *
 * Field name `lifecycleState` is deliberately separate from the existing
 * v1.5 `status` field (which is the quote TYPE: `'proposal' | 'stock'`).
 * The two are orthogonal — overloading `status` would force a migration
 * of every existing stock quote.
 *
 * v1.9 OUT OF SCOPE (deferred):
 *   - Auto-transition via email open-tracking (waiting on email-infra
 *     stakeholder decision; same gate as 1.3.2)
 *   - Time-based expiry cron
 *   - State-machine graph enforcement (any → any allowed in v1.9; the
 *     audit log captures the choice and the operator can correct mis-
 *     clicks by re-transitioning)
 */

import {
    doc,
    getDoc,
    serverTimestamp,
    updateDoc,
    type Firestore,
} from 'firebase/firestore';
import { logAuditEvent } from '@/lib/quote-audit-log';

export type LifecycleState =
    | 'draft'
    | 'sent'
    | 'viewed'
    | 'accepted'
    | 'rejected'
    | 'lost'
    | 'expired';

/** Ordered for picker display. Draft first, terminal states last. */
export const LIFECYCLE_STATES: LifecycleState[] = [
    'draft',
    'sent',
    'viewed',
    'accepted',
    'rejected',
    'lost',
    'expired',
];

export const LIFECYCLE_STATE_LABEL: Record<LifecycleState, string> = {
    draft:    'Draft',
    sent:     'Sent',
    viewed:   'Viewed',
    accepted: 'Accepted',
    rejected: 'Rejected',
    lost:     'Lost',
    expired:  'Expired',
};

export const LIFECYCLE_STATE_DESC: Record<LifecycleState, string> = {
    draft:    'In progress — not yet sent to the customer.',
    sent:     'Emailed to the customer. Awaiting their response.',
    viewed:   'Customer has opened the email or proposal.',
    accepted: 'Customer agreed. Expect deposit or order.',
    rejected: 'Customer explicitly declined.',
    lost:     'Customer went elsewhere or stopped responding.',
    expired:  'Validity window has passed.',
};

/** Tailwind tint classes matching the badge convention used elsewhere
 *  in the app (proposal-view status + lock badges). */
export const LIFECYCLE_STATE_TINT: Record<LifecycleState, string> = {
    draft:    'bg-slate-100 text-slate-700 border-slate-200',
    sent:     'bg-blue-50 text-blue-700 border-blue-200',
    viewed:   'bg-indigo-50 text-indigo-700 border-indigo-200',
    accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rejected: 'bg-rose-50 text-rose-700 border-rose-200',
    lost:     'bg-amber-50 text-amber-700 border-amber-200',
    expired:  'bg-slate-50 text-slate-500 border-slate-200',
};

interface ActorContext {
    byUid: string;
    byName: string;
}

/**
 * Effective lifecycle state. Defaults to 'draft' for legacy quotes
 * created before v1.9 (the field is absent until the first transition
 * write). Pure helper — no Firestore I/O.
 */
export function getLifecycleState(quote: { lifecycleState?: LifecycleState | null }): LifecycleState {
    return (quote.lifecycleState ?? 'draft') as LifecycleState;
}

/**
 * Transition a quote's lifecycle state. Idempotent — calling with the
 * current state is a no-op (no Firestore write, no audit entry).
 *
 * Independent of the lock layer. The firestore.rules
 * `onlyLifecycleFieldsChanged()` allowance lets locked quotes accept
 * lifecycle-only writes so the sales journey continues after the
 * auto-lock fires on first send.
 */
export async function transitionQuoteLifecycle(
    firestore: Firestore,
    ownerUid: string,
    quoteId: string,
    nextState: LifecycleState,
    actor: ActorContext,
): Promise<void> {
    const ref = doc(firestore, 'users', ownerUid, 'quotes', quoteId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
        throw new Error(`transitionQuoteLifecycle: quote ${quoteId} not found under user ${ownerUid}`);
    }
    const currentState = getLifecycleState(snap.data() as any);
    if (currentState === nextState) {
        return;
    }
    await updateDoc(ref, {
        lifecycleState: nextState,
        lifecycleStateAt: serverTimestamp(),
        lifecycleStateByUid: actor.byUid,
        lifecycleStateByName: actor.byName,
        updatedAt: serverTimestamp(),
    });
    await logAuditEvent(firestore, ownerUid, quoteId, {
        eventType: 'lifecycle-transitioned',
        byUid: actor.byUid,
        byName: actor.byName,
        metadata: {
            fromLifecycle: currentState,
            toLifecycle: nextState,
        },
    });
}

/**
 * v1.11 expansion — Fit-Up lifecycle status on a quote.
 *
 * Tracks the WORKSHOP progress of the fit-up work, independent of the
 * quote's sales lifecycle (LIFECYCLE_STATES in quote-lifecycle.ts).
 * A quote can be "Accepted" (sales-side) while its fit-up is still
 * "Scheduled" (workshop-side). The two state machines are orthogonal.
 *
 * Stored on the quote doc as:
 *   fitUpStatus: FitUpStatus
 *   fitUpStatusAt: serverTimestamp()
 *   fitUpStatusByUid: string (the user who set it)
 *   fitUpStatusByName: string (display name, denormalised)
 *
 * Optional on the quote — undefined / null is treated as 'pending'.
 *
 * NOT exposed on the customer PDF — the customer sees only the
 * single Fit-up & Rigging summary line per Story 9.2.3. The status
 * is an internal workshop/operator surface, rendered on the
 * proposal-view header alongside the sales lifecycle pill.
 */

import {
    doc,
    serverTimestamp,
    updateDoc,
    type Firestore,
} from 'firebase/firestore';

export const FIT_UP_STATUSES = ['pending', 'scheduled', 'in-progress', 'complete'] as const;
export type FitUpStatus = typeof FIT_UP_STATUSES[number];

export const FIT_UP_STATUS_LABEL: Record<FitUpStatus, string> = {
    pending: 'Pending',
    scheduled: 'Scheduled',
    'in-progress': 'In Progress',
    complete: 'Complete',
};

export const FIT_UP_STATUS_DESC: Record<FitUpStatus, string> = {
    pending: 'No workshop action yet — sitting in the queue.',
    scheduled: 'Booked into the workshop for a specific date.',
    'in-progress': 'Workshop is actively building the fit-up.',
    complete: 'Fit-up work has been completed and signed off.',
};

export const FIT_UP_STATUS_TINT: Record<FitUpStatus, string> = {
    pending: 'bg-slate-100 text-slate-700 border-slate-200',
    scheduled: 'bg-amber-50 text-amber-800 border-amber-200',
    'in-progress': 'bg-blue-50 text-blue-700 border-blue-200',
    complete: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export function getFitUpStatus(quote: any): FitUpStatus {
    const raw = quote?.fitUpStatus;
    if (raw && (FIT_UP_STATUSES as readonly string[]).includes(raw)) {
        return raw as FitUpStatus;
    }
    return 'pending';
}

/**
 * Update the fit-up status on a quote + write an audit-log event so the
 * Activity tab on the proposal-view shows the transition. Mirrors the
 * pattern in quote-lifecycle.transitionQuoteLifecycle().
 */
export async function transitionFitUpStatus(
    firestore: Firestore,
    ownerUid: string,
    quoteId: string,
    next: FitUpStatus,
    actor: { byUid: string; byName: string },
): Promise<void> {
    const ref = doc(firestore, `users/${ownerUid}/quotes`, quoteId);
    await updateDoc(ref, {
        fitUpStatus: next,
        fitUpStatusAt: serverTimestamp(),
        fitUpStatusByUid: actor.byUid,
        fitUpStatusByName: actor.byName,
        updatedAt: serverTimestamp(),
    });
    // Audit-log event so the Activity tab surfaces the transition.
    // Lazy import: keeps the audit module out of the SSR critical path
    // and matches the pattern used by handleLifecycleTransition.
    try {
        const { logAuditEvent } = await import('@/lib/quote-audit-log');
        await logAuditEvent(firestore, ownerUid, quoteId, {
            eventType: 'fit-up-status-changed',
            byUid: actor.byUid,
            byName: actor.byName,
            metadata: { toValue: next },
        });
    } catch (err) {
        // Don't roll back the status change if the audit log fails —
        // the status is the source of truth; the log is decoration.
        console.error('[fit-up-status] audit log failed', err);
    }
}

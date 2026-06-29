/**
 * acceptance.ts (v1.21 — Story 1.4.3).
 *
 * Acceptance capture for a quote. Records WHEN + HOW a customer accepted
 * a quote, distinct from the lifecycle-state flip. Acceptance is a
 * point-in-time fact stamped onto the quote doc (not a subcollection) so
 * it travels with the quote everywhere.
 *
 * Fields written onto users/{uid}/quotes/{qid}:
 *   acceptedAt, acceptedMethod, acceptedByName, acceptedNote
 */

export type AcceptanceMethod = 'verbal' | 'email' | 'in-person' | 'signed-quote' | 'deposit-paid';

export const ACCEPTANCE_METHOD_LABEL: Record<AcceptanceMethod, string> = {
    'verbal': 'Verbal (phone)',
    'email': 'Email confirmation',
    'in-person': 'In person',
    'signed-quote': 'Signed quote',
    'deposit-paid': 'Deposit paid',
};

export interface AcceptanceRecord {
    acceptedAt: any;
    acceptedMethod: AcceptanceMethod;
    acceptedByName: string;
    acceptedNote?: string | null;
    /** Who in the dealership recorded the acceptance. */
    recordedByUid: string;
    recordedByName: string;
}

/** True when the quote carries an acceptance stamp. */
export function isAccepted(quote: any): boolean {
    return !!quote?.acceptedAt;
}

/** Build the acceptance patch to merge onto the quote doc. */
export function buildAcceptancePatch(input: {
    method: AcceptanceMethod;
    customerName: string;
    note?: string | null;
    recordedByUid: string;
    recordedByName: string;
    now: Date;
}): Record<string, any> {
    return {
        acceptedAt: input.now,
        acceptedMethod: input.method,
        acceptedByName: input.customerName,
        acceptedNote: input.note?.trim() || null,
        acceptanceRecordedByUid: input.recordedByUid,
        acceptanceRecordedByName: input.recordedByName,
        // Lifecycle flip rides along so the cross-module view + pipeline
        // reflect acceptance without a second write.
        lifecycleState: 'accepted',
        lifecycleStateAt: input.now,
    };
}

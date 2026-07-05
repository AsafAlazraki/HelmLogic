/**
 * trade-in.ts (v1.21 — Story 1.5.5).
 *
 * Structured trade-in capture. A trade-in is attached to a customer and
 * optionally referenced from a quote. Stored at /tradeIns/{id} so it can
 * be valued + reconciled independently of the quote it offsets.
 *
 * IMPORTANT: new Firestore path /tradeIns/{id}. firestore.rules MUST get
 * a matching rule and tests/firestore-rules-deployed.spec.ts MUST cover
 * it (same defence-in-depth lesson as v1.19 variations + v1.20 contracts).
 */

export type TradeInCondition = 'excellent' | 'good' | 'fair' | 'poor';

export interface TradeIn {
    id: string;
    customerId: string;
    organisationId: string;
    /** Make / model / year of the trade-in vessel or trailer. */
    make: string;
    model: string;
    year?: number | null;
    /** Hull / serial / rego identifier. */
    identifier?: string | null;
    condition?: TradeInCondition;
    /** Dealer's assessed value (what we'll allow against the new purchase), ex GST. */
    allowanceExclGst: number;
    /** Optional payout owing to a finance company on the trade. */
    payoutOwing?: number | null;
    notes?: string | null;
    createdAt: any;
    createdByUid: string;
    createdByName: string;
}

export const TRADE_IN_CONDITION_LABEL: Record<TradeInCondition, string> = {
    excellent: 'Excellent',
    good: 'Good',
    fair: 'Fair',
    poor: 'Poor',
};

/**
 * Net trade-in equity = allowance − payout owing. This is what actually
 * offsets the new purchase. Can be negative (upside-down trade) which the
 * UI surfaces in rose.
 */
export function computeTradeInEquity(allowanceExclGst: number, payoutOwing?: number | null): number {
    const allowance = Number.isFinite(allowanceExclGst) ? allowanceExclGst : 0;
    const payout = (payoutOwing != null && Number.isFinite(payoutOwing)) ? payoutOwing : 0;
    return allowance - payout;
}

/** Short label for list-card rendering ("2018 Stessl 480 — $12,000"). */
export function tradeInLabel(t: Pick<TradeIn, 'year' | 'make' | 'model' | 'allowanceExclGst'>): string {
    const yr = t.year ? `${t.year} ` : '';
    return `${yr}${t.make} ${t.model} — $${Number(t.allowanceExclGst ?? 0).toLocaleString('en-AU')}`;
}

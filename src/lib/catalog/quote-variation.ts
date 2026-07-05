/**
 * quote-variation.ts (v1.19 — Stories 2.3.1 + 2.6.3).
 *
 * Schema + helpers for post-contract quote variations.
 *
 * Storage path (NEW collection in v1.19):
 *   users/{uid}/quotes/{qid}/variations/{vid}
 *
 * IMPORTANT: this is a new Firestore path. firestore.rules MUST get a
 * matching rule (see firestore.rules edit in same commit) and
 * tests/firestore-rules-deployed.spec.ts MUST include the path so a
 * future rules-deploy slip surfaces in dev before customers hit it
 * (same lesson Bill taught us yesterday with fitUpClassificationRules).
 *
 * Status machine:
 *   draft     -> sent       (Send variation email pipeline)
 *   sent      -> accepted   (Customer signs on public accept page)
 *   sent      -> rejected   (Customer declines on public accept page)
 *   sent      -> draft      (Salesperson recalls before customer acts)
 *
 * accepted + rejected are terminal.
 */

export type QuoteVariationStatus = 'draft' | 'sent' | 'accepted' | 'rejected';

export type QuoteVariationLineKind = 'add' | 'remove' | 'priceAdjust';

export interface QuoteVariationLine {
    id: string;
    kind: QuoteVariationLineKind;
    /** Display label shown on the variation PDF. */
    label: string;
    /** Optional reference to the underlying quote line being adjusted
     *  (option id, motor accessory id, etc.). Free-form so it works
     *  across every quote section. */
    refLineId?: string;
    /** Price delta in ex-GST dollars. Positive for adds + price-up,
     *  negative for removes + price-down. */
    deltaExclGst: number;
}

export interface QuoteVariation {
    id: string;
    /** Parent quote id (the `users/{uid}/quotes/{qid}` doc). */
    quoteId: string;
    /** Auto-incrementing variation number per quote, displayed to the
     *  customer as "Variation 1", "Variation 2", etc. */
    variationNumber: number;
    title: string;
    /** Free-text customer-facing note rendered above the delta lines on
     *  the variation PDF. */
    customerMessage?: string | null;
    lines: QuoteVariationLine[];
    status: QuoteVariationStatus;
    /** Sum of every line.deltaExclGst, computed at save time so the
     *  customer + audit + dashboard don't have to re-sum on every read. */
    totalDeltaExclGst: number;
    createdAt: any;
    createdByUid: string;
    createdByName: string;
    /** Set when the variation is first sent. Inherited from the v1.13
     *  service-quote send pipeline. */
    sentAt?: any;
    sentToEmail?: string | null;
    /** Auto-locked on first send so the salesperson can't tweak a
     *  variation that's already been emailed. Mirrors the v1.8 quote-lock
     *  pattern. */
    lockedAt?: any;
    /** Public-accept token. UUID generated at send time, embedded in the
     *  customer's accept-link URL. One-time-use. */
    publicAcceptToken?: string | null;
    publicAcceptTokenConsumed?: boolean;
    /** v1.19 (Story 2.6.3) — customer signature data on accept. */
    acceptedAt?: any;
    acceptedByName?: string | null;
    acceptedSignatureDataUrl?: string | null;
    acceptedIp?: string | null;
    acceptedUserAgent?: string | null;
    /** Set when customer declines. Free-text reason optional. */
    rejectedAt?: any;
    rejectedByName?: string | null;
    rejectedReason?: string | null;
}

/**
 * Sum every line's deltaExclGst. Always exact, never rounded — the
 * GST math happens at render time.
 */
export function computeVariationTotal(lines: QuoteVariationLine[]): number {
    return (lines ?? []).reduce((acc, line) => acc + (Number.isFinite(line.deltaExclGst) ? line.deltaExclGst : 0), 0);
}

/**
 * Validate a status transition against the documented machine. Returns
 * true when the move is allowed. Used by the save handler + UI guards.
 */
const ALLOWED_TRANSITIONS: Record<QuoteVariationStatus, QuoteVariationStatus[]> = {
    draft: ['sent'],
    sent: ['accepted', 'rejected', 'draft'],
    accepted: [],
    rejected: [],
};
export function canTransitionVariationStatus(from: QuoteVariationStatus, to: QuoteVariationStatus): boolean {
    return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Generate a v4-ish random token for the public-accept link. Not
 * cryptographic; collision resistance is fine for the per-variation
 * url scope. Replace with crypto.randomUUID() at the call site when
 * running in a browser; this helper keeps the lib SSR-safe.
 */
export function newAcceptToken(): string {
    let out = '';
    for (let i = 0; i < 32; i++) out += Math.floor(Math.random() * 16).toString(16);
    return out;
}

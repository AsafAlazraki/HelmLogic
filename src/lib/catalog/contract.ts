/**
 * contract.ts (v1.20 — Story 2.4.1).
 *
 * Schema + helpers for the Convert Quote -> Contract action.
 *
 * Storage path (NEW collection in v1.20):
 *   users/{uid}/quotes/{qid}/contracts/{cid}
 *
 * IMPORTANT: this is a new Firestore path. firestore.rules MUST get a
 * matching rule and tests/firestore-rules-deployed.spec.ts MUST include
 * the path. Same defence-in-depth as v1.19/2.3.1 variations.
 *
 * Lifecycle:
 *   pending-signature  -> signed
 *   pending-signature  -> cancelled
 *   signed             -> cancelled  (with reason, audit-logged)
 *
 * A contract is WRITE-ONCE at the line-item level: the snapshot of the
 * quote at convert time is immutable. New changes after conversion flow
 * through:
 *   - v1.19 variations (delta sheets layered onto the contract), OR
 *   - re-convert: a fresh contract doc with `previousContractId` set
 *     when the operator wants a clean break from the original.
 */

export type ContractState = 'pending-signature' | 'signed' | 'cancelled';

export interface ContractSnapshotLine {
    section: 'boat' | 'options' | 'motor' | 'trailer' | 'dealerFit' | 'fitUp' | 'rego' | 'misc';
    label: string;
    quantity: number;
    unitPriceExclGst: number;
    lineTotalExclGst: number;
}

export interface Contract {
    id: string;
    /** Parent quote id (the `users/{uid}/quotes/{qid}` doc). */
    quoteId: string;
    /** Sequential number per quote. First contract is 1, re-convert
     *  bumps to 2, etc. */
    contractNumber: number;
    /** Auto-generated display reference. Format: "CON-{orgShortCode}-
     *  {YYYYMMDD}-{seq}". */
    contractReference: string;
    state: ContractState;
    /** Immutable snapshot of the quote at convert time. */
    snapshotLines: ContractSnapshotLine[];
    subtotalExclGst: number;
    gstAmount: number;
    totalInclGst: number;
    /** Pointer back to the previous contract id when this is a re-convert. */
    previousContractId?: string | null;
    createdAt: any;
    createdByUid: string;
    createdByName: string;
    signedAt?: any;
    signedByName?: string | null;
    cancelledAt?: any;
    cancelledReason?: string | null;
}

/**
 * Validate a contract state transition. Used by the save handler + UI
 * guards. Mirrors the v1.19 quote-variation pattern.
 */
const ALLOWED_TRANSITIONS: Record<ContractState, ContractState[]> = {
    'pending-signature': ['signed', 'cancelled'],
    'signed': ['cancelled'],
    'cancelled': [],
};

export function canTransitionContractState(from: ContractState, to: ContractState): boolean {
    return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Build the contract reference string from org + sequence. Stable
 * format so accounting can sort + filter without parsing.
 *
 *   buildContractReference('NSM', new Date('2026-06-23'), 1)
 *     => 'CON-NSM-20260623-001'
 */
export function buildContractReference(orgShortCode: string, when: Date, seq: number): string {
    const yyyymmdd = `${when.getFullYear()}${String(when.getMonth() + 1).padStart(2, '0')}${String(when.getDate()).padStart(2, '0')}`;
    return `CON-${(orgShortCode || 'ORG').toUpperCase()}-${yyyymmdd}-${String(seq).padStart(3, '0')}`;
}

/**
 * Compute the totals from a snapshot. The snapshot itself stays
 * authoritative; this is for the convert action's first save + for
 * the contract-PDF render.
 */
export function computeContractTotals(lines: ContractSnapshotLine[], gstMultiplier = 1.1): {
    subtotalExclGst: number;
    gstAmount: number;
    totalInclGst: number;
} {
    const subtotalExclGst = (lines ?? []).reduce((acc, line) => acc + (Number.isFinite(line.lineTotalExclGst) ? line.lineTotalExclGst : 0), 0);
    const totalInclGst = Math.ceil(subtotalExclGst * gstMultiplier);
    const gstAmount = totalInclGst - subtotalExclGst;
    return { subtotalExclGst, gstAmount, totalInclGst };
}

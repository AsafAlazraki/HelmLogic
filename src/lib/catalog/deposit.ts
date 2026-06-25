/**
 * deposit.ts (v1.20 — Story 2.4.2).
 *
 * Schema + helpers for deposit recording against a contract.
 *
 * Storage path (NEW collection in v1.20):
 *   users/{uid}/quotes/{qid}/contracts/{cid}/deposits/{depositId}
 *
 * Each deposit gets its own receipt PDF generated at save time via the
 * v1.18 pdf-branding.ts tokens. The PDF URL is stored on the deposit
 * doc so future reads don't re-render.
 *
 * IMPORTANT: this is a new Firestore path. firestore.rules MUST get a
 * matching rule and tests/firestore-rules-deployed.spec.ts MUST include
 * the path.
 */

export type DepositPaymentMethod = 'cash' | 'eft' | 'cheque' | 'card' | 'other';

export interface Deposit {
    id: string;
    /** Parent contract id. */
    contractId: string;
    /** Sequential receipt number per contract. */
    receiptNumber: number;
    /** Display reference: "RCT-{orgShortCode}-{YYYYMMDD}-{seq}". */
    receiptReference: string;
    /** Amount paid, ex GST. Deposits are ALWAYS ex GST internally; the
     *  receipt PDF renders the GST line + inc GST total. */
    amountExclGst: number;
    paymentMethod: DepositPaymentMethod;
    /** Free-text customer reference number (cheque number, EFT ref,
     *  card last-4, etc.). Optional. */
    customerReference?: string | null;
    /** When the deposit was paid (operator-entered, may differ from
     *  createdAt which is the system clock). */
    paidAt: any;
    receiptPdfUrl?: string | null;
    createdAt: any;
    createdByUid: string;
    createdByName: string;
}

export function buildReceiptReference(orgShortCode: string, when: Date, seq: number): string {
    const yyyymmdd = `${when.getFullYear()}${String(when.getMonth() + 1).padStart(2, '0')}${String(when.getDate()).padStart(2, '0')}`;
    return `RCT-${(orgShortCode || 'ORG').toUpperCase()}-${yyyymmdd}-${String(seq).padStart(3, '0')}`;
}

/**
 * GST-inclusive total computed from the ex-GST amount per the v1.3
 * lesson (Math.ceil). Pre-computed here so the receipt PDF and the
 * deposit-list view both land on the same number.
 */
export function computeDepositTotals(amountExclGst: number, gstMultiplier = 1.1): {
    amountExclGst: number;
    gstAmount: number;
    amountInclGst: number;
} {
    const exGst = Number.isFinite(amountExclGst) ? amountExclGst : 0;
    const inclGst = Math.ceil(exGst * gstMultiplier);
    return { amountExclGst: exGst, gstAmount: inclGst - exGst, amountInclGst: inclGst };
}

export const PAYMENT_METHOD_LABEL: Record<DepositPaymentMethod, string> = {
    cash: 'Cash',
    eft: 'EFT / Bank transfer',
    cheque: 'Cheque',
    card: 'Card',
    other: 'Other',
};

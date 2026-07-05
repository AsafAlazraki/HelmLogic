/**
 * final-invoice.ts (v1.25 — Story 2.4.6).
 *
 * Build the data model for a Final / Tax Invoice (settlement document).
 * Consumes the contract total + the payment schedule (v1.23) so the
 * invoice shows what was quoted, what's been paid, and the balance due
 * at settlement. GST shown explicitly per ATO tax-invoice requirements.
 *
 * Render is dynamic-imported @react-pdf at the call site (v1.20 signing-
 * pack pattern); this lib is the input builder.
 */

import { type PaymentScheduleLine, totalPaid, outstandingBalance } from '@/lib/catalog/payment-schedule';

export interface FinalInvoiceModel {
    invoiceReference: string;
    contractReference: string;
    issuedAt: number;
    customerName: string;
    /** ABN of the issuing org (tax-invoice requirement). */
    abn: string | null;
    subtotalExclGst: number;
    gstAmount: number;
    totalInclGst: number;
    paidToDate: number;
    balanceDue: number;
    scheduleLines: PaymentScheduleLine[];
}

/**
 * Build the final-invoice model. issuedAtMs is passed in (Date.now is
 * unavailable in some render contexts) so the caller stamps it.
 */
export function buildFinalInvoice(input: {
    contract: { contractReference: string; subtotalExclGst?: number; gstAmount?: number; totalInclGst?: number };
    customerName: string;
    abn?: string | null;
    schedule: PaymentScheduleLine[];
    issuedAtMs: number;
    sequence: number;
    orgShortCode: string;
}): FinalInvoiceModel {
    const d = new Date(input.issuedAtMs);
    const yyyymmdd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return {
        invoiceReference: `INV-${(input.orgShortCode || 'ORG').toUpperCase()}-${yyyymmdd}-${String(input.sequence).padStart(3, '0')}`,
        contractReference: input.contract.contractReference,
        issuedAt: input.issuedAtMs,
        customerName: input.customerName,
        abn: input.abn ?? null,
        subtotalExclGst: Number(input.contract.subtotalExclGst ?? 0),
        gstAmount: Number(input.contract.gstAmount ?? 0),
        totalInclGst: Number(input.contract.totalInclGst ?? 0),
        paidToDate: totalPaid(input.schedule),
        balanceDue: outstandingBalance(input.schedule),
        scheduleLines: input.schedule,
    };
}

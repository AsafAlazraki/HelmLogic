/**
 * variation-order-doc.ts (v1.22 — Story 2.6.1).
 *
 * Builds the data model for a Variation Order Document — the formal
 * delta-sheet PDF a customer signs (separate from the v1.20 in-app
 * accept page). Consumes the v1.19 QuoteVariation shape + the v1.18
 * pdf-branding tokens at render time.
 *
 * This lib is the render-input builder; the actual @react-pdf render is
 * dynamic-imported at the call site (same pattern as the v1.20 signing
 * pack) so the PDF bundle only loads on demand.
 */

import { computeVariationTotal, type QuoteVariation } from '@/lib/catalog/quote-variation';

export interface VariationOrderDocModel {
    title: string;
    variationNumber: number;
    reference: string;
    customerMessage: string;
    lines: Array<{ kind: string; label: string; deltaExclGst: number }>;
    totalDeltaExclGst: number;
    totalDeltaInclGst: number;
    status: string;
    acceptedByName: string | null;
    acceptedAt: any | null;
}

/**
 * Build the variation-order document model from a variation + the parent
 * quote/contract reference. GST applied with the v1.3 Math.ceil rule.
 */
export function buildVariationOrderDoc(
    variation: QuoteVariation,
    parentReference: string,
    gstMultiplier = 1.1,
): VariationOrderDocModel {
    const totalEx = computeVariationTotal(variation.lines ?? []);
    // For a positive delta, inc-GST rounds up; for a credit (negative)
    // we mirror the magnitude so the customer sees a consistent inc-GST.
    const totalInc = totalEx >= 0
        ? Math.ceil(totalEx * gstMultiplier)
        : -Math.ceil(Math.abs(totalEx) * gstMultiplier);
    return {
        title: variation.title,
        variationNumber: variation.variationNumber,
        reference: `${parentReference} · VAR-${String(variation.variationNumber).padStart(2, '0')}`,
        customerMessage: variation.customerMessage ?? '',
        lines: (variation.lines ?? []).map(l => ({ kind: l.kind, label: l.label, deltaExclGst: l.deltaExclGst })),
        totalDeltaExclGst: totalEx,
        totalDeltaInclGst: totalInc,
        status: variation.status,
        acceptedByName: variation.acceptedByName ?? null,
        acceptedAt: variation.acceptedAt ?? null,
    };
}

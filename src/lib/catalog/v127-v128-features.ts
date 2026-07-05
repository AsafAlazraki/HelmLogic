/**
 * v127-v128-features.ts — bundled feature helpers.
 *
 * v1.27:
 *   1.5.7 Customer Document Storage — doc-ref helpers (uses the v1.12
 *         customer.documents[] field + Firebase Storage).
 *   4.2.2 Customer-Specific Promotions — match promos to a customer.
 *   (2.5.2 Settlement Reconciliation to Revolution stays BLOCKED — needs
 *    Revolution access; not built.)
 * v1.28:
 *   1.5.6 Spouse / Co-buyer Support — secondary-buyer helpers.
 *   2.4.5 Refund Handling — refund record + cancellation flow.
 *   4.2.1 Promotion Stacking Rules — combine promos under stacking policy.
 */

import { promotionDiscount, type Promotion } from '@/lib/catalog/promotion';

// 1.5.7 Customer Document Storage
export interface CustomerDocRef {
    path: string;        // storage path customers/{id}/documents/{file}
    name: string;
    label?: string;
    uploadedAt: number;
}
export function buildDocStoragePath(customerId: string, fileName: string): string {
    const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `customers/${customerId}/documents/${safe}`;
}

// 4.2.2 Customer-Specific Promotions
export function customerEligiblePromotions(promotions: Promotion[], customerId: string): Promotion[] {
    return (promotions ?? []).filter((p: any) =>
        !p.customerIds || p.customerIds.length === 0 || p.customerIds.includes(customerId),
    );
}

// 1.5.6 Spouse / Co-buyer
export interface CoBuyer { name: string; email?: string; phone?: string; role?: string }
export function buyerSummary(primary?: CoBuyer, secondary?: CoBuyer): string {
    if (primary && secondary) return `${primary.name} & ${secondary.name}`;
    return primary?.name ?? secondary?.name ?? 'Unknown';
}

// 2.4.5 Refund Handling
export type RefundReason = 'cancellation' | 'overpayment' | 'goodwill' | 'other';
export interface RefundRecord {
    id: string;
    contractId: string;
    amountIncGst: number;
    reason: RefundReason;
    note?: string | null;
    processedAt: any;
    processedByName: string;
}
export function netAfterRefunds(paidIncGst: number, refunds: Array<{ amountIncGst: number }>): number {
    return paidIncGst - (refunds ?? []).reduce((a, r) => a + (r.amountIncGst ?? 0), 0);
}

// 4.2.1 Promotion Stacking
export interface StackingPolicy { allowStacking: boolean; maxStack?: number }
export function applyStackedPromotions(
    promotions: Array<Pick<Promotion, 'form' | 'value'>>,
    subtotalExclGst: number,
    policy: StackingPolicy,
): { totalDiscount: number; applied: number } {
    if (!policy.allowStacking) {
        // Best single promo only.
        let best = 0;
        for (const p of promotions ?? []) best = Math.max(best, promotionDiscount(p, subtotalExclGst));
        return { totalDiscount: best, applied: best > 0 ? 1 : 0 };
    }
    const sorted = [...(promotions ?? [])].sort((a, b) => promotionDiscount(b, subtotalExclGst) - promotionDiscount(a, subtotalExclGst));
    const cap = policy.maxStack ?? sorted.length;
    let running = subtotalExclGst;
    let total = 0;
    let applied = 0;
    for (const p of sorted.slice(0, cap)) {
        const d = promotionDiscount(p, running);
        if (d <= 0) continue;
        total += d;
        running -= d;
        applied += 1;
    }
    return { totalDiscount: total, applied };
}

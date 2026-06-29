/**
 * v126-features.ts (v1.26 — bundled feature helpers).
 *
 * Customer/quote feature foundation for v1.26:
 *   1.5.4 Customer Source Tracking — summarise customers by source.
 *   1.9.1 Quote Templates — starter-quote model.
 *   2.2.2 Role-Based Margin Visibility — can-see-margin gate.
 *   2.4.4 Outstanding Balance Tracking — across a customer's contracts.
 *   2.6.2 Variation History — ordered variation list per quote.
 *   4.1.2 Promotion Alerts — promotions expiring soon.
 */

import { outstandingBalance, type PaymentScheduleLine } from '@/lib/catalog/payment-schedule';
import { isPromotionLive, type Promotion } from '@/lib/catalog/promotion';

// 1.5.4 Customer Source Tracking
export function summariseBySource(customers: Array<{ source?: string }>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const c of customers ?? []) {
        const s = (c.source && c.source.trim()) || 'Unknown';
        out[s] = (out[s] ?? 0) + 1;
    }
    return out;
}

// 1.9.1 Quote Templates
export interface QuoteTemplate {
    id: string;
    name: string;
    description?: string;
    /** Seed values applied to a new quote (material, options, etc.). */
    seed: Record<string, any>;
    createdAt?: any;
}

// 2.2.2 Role-Based Margin Visibility
export function canSeeMargin(organisation: any, roleId: string | undefined): boolean {
    if (!roleId) return false;
    const perm = organisation?.permissions?.[roleId];
    // Default: only roles with explicit can_view_margin (or margin-override) see it.
    return !!(perm?.can_view_margin || perm?.can_override_margin);
}

// 2.4.4 Outstanding Balance Tracking
export function customerOutstanding(schedulesByContract: Record<string, PaymentScheduleLine[]>): number {
    return Object.values(schedulesByContract ?? {}).reduce((acc, lines) => acc + outstandingBalance(lines), 0);
}

// 2.6.2 Variation History
export function orderedVariationHistory<T extends { variationNumber?: number; createdAt?: any }>(variations: T[]): T[] {
    return [...(variations ?? [])].sort((a, b) => (a.variationNumber ?? 0) - (b.variationNumber ?? 0));
}

// 4.1.2 Promotion Alerts
export function promotionsExpiringSoon(promotions: Promotion[], withinDays = 7, now: Date = new Date()): Promotion[] {
    const horizon = now.getTime() + withinDays * 24 * 60 * 60 * 1000;
    return (promotions ?? []).filter(p => {
        if (!isPromotionLive(p, now)) return false;
        const endMs = p.endsAt?.toDate?.()?.getTime?.() ?? (p.endsAt?.seconds ? p.endsAt.seconds * 1000 : null);
        return endMs != null && endMs <= horizon;
    });
}

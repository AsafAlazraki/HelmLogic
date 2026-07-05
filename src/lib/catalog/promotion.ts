/**
 * promotion.ts (v1.22 — Story 4.1.1).
 *
 * Manual promotion entry. A promotion is an org-level discount that can
 * apply to a quote (all forms: % off, $ off, free-item, bundle). v1.22
 * ships the manual-entry data model + helpers; alerts (4.1.2), stacking
 * (4.2.1), and customer-specific (4.2.2) land in later releases.
 *
 * Storage: organisations/{orgId}/promotions/{promoId} (org-level; the
 * existing per-module promotions at modules/{id}/promotions stay as-is).
 */

export type PromotionForm = 'percent' | 'fixed' | 'free-item' | 'bundle';

export interface Promotion {
    id: string;
    organisationId: string;
    name: string;
    form: PromotionForm;
    /** percent: 0-100. fixed: AUD ex GST. free-item/bundle: 0 (value is descriptive). */
    value: number;
    /** Free-text describing what the customer gets (esp. free-item / bundle). */
    description?: string | null;
    /** Active window. Null end = open-ended. */
    startsAt?: any;
    endsAt?: any | null;
    active: boolean;
    createdAt: any;
    createdByUid: string;
    createdByName: string;
}

export const PROMOTION_FORM_LABEL: Record<PromotionForm, string> = {
    'percent': '% off',
    'fixed': '$ off',
    'free-item': 'Free item',
    'bundle': 'Bundle deal',
};

/**
 * Apply a promotion to a subtotal (ex GST), returning the discount amount
 * (always >= 0). free-item / bundle return 0 here — they're descriptive,
 * the operator adds the free line manually.
 */
export function promotionDiscount(promo: Pick<Promotion, 'form' | 'value'>, subtotalExclGst: number): number {
    const sub = Number.isFinite(subtotalExclGst) ? subtotalExclGst : 0;
    if (promo.form === 'percent') {
        const pct = Math.max(0, Math.min(100, promo.value));
        return Math.round(sub * (pct / 100));
    }
    if (promo.form === 'fixed') {
        return Math.max(0, Math.min(sub, promo.value));
    }
    return 0;
}

/** True when a promotion is currently in its active window. */
export function isPromotionLive(promo: Promotion, now: Date = new Date()): boolean {
    if (!promo.active) return false;
    const startMs = promo.startsAt?.toDate?.()?.getTime?.() ?? (promo.startsAt?.seconds ? promo.startsAt.seconds * 1000 : 0);
    const endMs = promo.endsAt?.toDate?.()?.getTime?.() ?? (promo.endsAt?.seconds ? promo.endsAt.seconds * 1000 : null);
    if (startMs && now.getTime() < startMs) return false;
    if (endMs && now.getTime() > endMs) return false;
    return true;
}

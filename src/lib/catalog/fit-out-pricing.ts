/**
 * fit-out-pricing.ts (v1.19 — Story 2.1.2).
 *
 * Model-specific Fit-Out Pricing. Each boat model can declare a
 * 3-tier package price (basic / moderate / complex) on the model doc.
 * When set, this is what the quote-flow uses as the "suggested package
 * price" for the selected fit-out tier. When NOT set, the existing
 * per-item summation from the fit-up catalog (v1.11/9.x) wins.
 *
 * Schema (added to data-warehouse model docs, optional everywhere):
 *   model.fitOutPricing?: {
 *     basic?: number;     // ex GST
 *     moderate?: number;  // ex GST
 *     complex?: number;   // ex GST
 *   }
 *
 * Resolution chain (consumed by the fit-up surface):
 *   1. model.fitOutPricing[tier] explicit value -> return it.
 *   2. Otherwise return null and the caller falls back to its existing
 *      per-item summation behaviour.
 *
 * Foundation for v1.20's "Package vs itemised" toggle in the quote flow
 * where the operator picks between a flat package price and the
 * summed-item view.
 */

export type FitOutTier = 'basic' | 'moderate' | 'complex';

export interface FitOutPricingMap {
    basic?: number | null;
    moderate?: number | null;
    complex?: number | null;
}

export interface ModelWithFitOutPricing {
    fitOutPricing?: FitOutPricingMap | null;
}

/**
 * Returns the explicit per-model fit-out package price for the given
 * tier (ex GST). Null when not set, signalling the caller should fall
 * back to its existing summed-item behaviour.
 */
export function resolveFitOutPrice(model: ModelWithFitOutPricing | null | undefined, tier: FitOutTier): number | null {
    const value = model?.fitOutPricing?.[tier];
    if (value == null) return null;
    if (typeof value !== 'number') return null;
    if (!Number.isFinite(value)) return null;
    if (value < 0) return null;
    return value;
}

/**
 * True when ANY tier has a finite non-negative override. Used by the
 * admin editor to show / hide the "Package pricing configured" badge
 * and by future operator UIs to flag models with explicit overrides.
 */
export function hasFitOutPricing(model: ModelWithFitOutPricing | null | undefined): boolean {
    return (
        resolveFitOutPrice(model, 'basic') != null
        || resolveFitOutPrice(model, 'moderate') != null
        || resolveFitOutPrice(model, 'complex') != null
    );
}

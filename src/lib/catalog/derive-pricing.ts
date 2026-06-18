/**
 * derive-pricing.ts (v1.17 — Story 3.2.1).
 *
 * Internal Data Normalisation Layer. One source of truth for the canonical
 * pricing shape so every read site (proposal-pdf, motor cards, trailer
 * dashboard, catalog views, quote flow) stops re-deriving cost / sell /
 * margin / inc-GST on its own.
 *
 * Scope for v1.17:
 *   - Motors (Yamaha MPF + Sam Allen rigging)
 *   - Trailers
 *
 * Boats + fit-up + service-quote are intentionally LEFT OUT this cycle.
 * They have their own derivation patterns (priceLevels per motor model,
 * per-state rego for trailers etc.) and unifying them all in one pass
 * would balloon scope. Phase B in v1.18 if it helps.
 *
 * GST handling: derived inc-GST always rounds UP to whole dollars per the
 * v1.3 lesson (`Math.ceil(exGst * gstMultiplier)`). Margins are computed
 * on ex-GST values.
 */

/** GST multiplier. Australia is 10%. */
export const GST_MULTIPLIER = 1.1;

export interface PricingInput {
    /** Dealer cost in the trading currency (ex GST). */
    cost?: number | null;
    /** Retail price ex GST. */
    sellPriceExclGst?: number | null;
    /** Optional org-level override (e.g. Trailers v1.14 / 3.7.6). When
     *  present, override values win. */
    override?: { cost?: number | null; sellPriceExclGst?: number | null };
}

export interface DerivedPricing {
    cost: number | null;
    sell: number | null;
    sellIncGst: number | null;
    marginAbs: number | null;
    marginPct: number | null;
    /** Tone band for the margin pill: 'red' < 15, 'amber' < 25, 'emerald' ≥ 25. */
    marginTone: 'red' | 'amber' | 'emerald' | 'none';
    /** True when the row is missing the required pricing fields. UI shows
     *  it in a rose highlight per the trailer-table convention. */
    missingPricing: boolean;
    /** Effective override flag — true when at least one override field was
     *  applied. UI shows an 'OVR' badge. */
    fromOverride: boolean;
}

export function derivePricing(input: PricingInput): DerivedPricing {
    const ov = input.override ?? {};
    const cost = pickNumber(ov.cost, input.cost);
    const sell = pickNumber(ov.sellPriceExclGst, input.sellPriceExclGst);
    const fromOverride = (ov.cost != null && ov.cost !== input.cost) || (ov.sellPriceExclGst != null && ov.sellPriceExclGst !== input.sellPriceExclGst);

    const sellIncGst = sell != null ? Math.ceil(sell * GST_MULTIPLIER) : null;

    let marginAbs: number | null = null;
    let marginPct: number | null = null;
    let marginTone: DerivedPricing['marginTone'] = 'none';
    if (cost != null && sell != null && sell > 0) {
        marginAbs = sell - cost;
        marginPct = (marginAbs / sell) * 100;
        if (marginPct < 15) marginTone = 'red';
        else if (marginPct < 25) marginTone = 'amber';
        else marginTone = 'emerald';
    }

    const missingPricing = cost == null || sell == null;

    return { cost, sell, sellIncGst, marginAbs, marginPct, marginTone, missingPricing, fromOverride };
}

/**
 * Apply a markup percentage to a cost-driven row. Returns the rounded
 * sell ex GST. Used by the v1.17/3.10.1 bulk-markup pipeline so every
 * surface lands on the same rounding rule.
 *
 *   nextSell = round(cost * (1 + pct/100))
 *
 * Returns null when cost is missing.
 */
export function applyMarkup(cost: number | null | undefined, pct: number): number | null {
    if (cost == null || typeof cost !== 'number' || !Number.isFinite(cost)) return null;
    if (!Number.isFinite(pct)) return null;
    return Math.round(cost * (1 + pct / 100));
}

function pickNumber(...candidates: Array<number | null | undefined>): number | null {
    for (const c of candidates) {
        if (c != null && typeof c === 'number' && Number.isFinite(c)) return c;
    }
    return null;
}

/**
 * v1.17 (Story 3.9.5) — stale-rate detector for the exchange-rate UI.
 * Returns true when the relevant rate hasn't been updated in `thresholdDays`
 * (default 30). UI shows an amber warning chip on motor/boat cards that
 * derive their AUD sell from a foreign-currency vendor.
 *
 * Accepts either a JS Date or a Firestore Timestamp-shaped object so it
 * works at both render time and during data shaping.
 */
export const STALE_RATE_THRESHOLD_DAYS = 30;

export function isRateStale(lastUpdatedAt: any, thresholdDays = STALE_RATE_THRESHOLD_DAYS): boolean {
    if (!lastUpdatedAt) return true;
    let ts: number;
    if (lastUpdatedAt instanceof Date) ts = lastUpdatedAt.getTime();
    else if (typeof lastUpdatedAt === 'number') ts = lastUpdatedAt;
    else if (typeof lastUpdatedAt?.toDate === 'function') ts = lastUpdatedAt.toDate().getTime();
    else if (typeof lastUpdatedAt?.seconds === 'number') ts = lastUpdatedAt.seconds * 1000;
    else return true;
    const ageMs = Date.now() - ts;
    return ageMs > thresholdDays * 24 * 60 * 60 * 1000;
}

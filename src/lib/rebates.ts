/**
 * v1.34 — Yamaha Rebates (per-SKU temporary rebate prices).
 *
 * Modelled on how NSM's own Master Price File runs rebate campaigns
 * (Motor Library col Y `Rebate Program` name + col Z `Rebate Discount`
 * + col BF campaign `Sell Price`): a rebate names a program, selects
 * SKUs, and gives each a temporary NEW price. HelmLogic mirrors that
 * mechanism exactly:
 *
 * - The rebate document lives at `modules/{motorModuleId}/rebates/{id}`
 *   (name, photo, dates, per-SKU prices, audit changeLog).
 * - While ACTIVE, every selected MPF motor row is STAMPED with an
 *   `activeRebate` field plus the MPF's own `Rebate Program` /
 *   `Rebate Discount` columns — so the data itself carries the rebate
 *   and every surface that already reads MPF rows (quote flow, catalog
 *   picker, motors table) sees it without a join. MPF stays source of
 *   truth: a fresh MPF import upserting the row would simply overwrite
 *   the stamp, exactly like it overwrites operator price edits.
 * - On deactivation (manual "End now" or the endsAt timer) the stamps
 *   are removed and the rebate moves to the Past Rebates section.
 *
 * Readers must ALWAYS go through `getActiveRebate()` below — it
 * enforces the endsAt guard client-side, so even before the expiry
 * sweep has cleaned a stale stamp, no quote can price off a dead
 * rebate.
 */

export interface RebateSku {
    /** MPF row doc id under data-warehouse/{vendorId}/dataSets/{dsId}/rows */
    rowId: string;
    /** MODEL CODE — the MPF natural key */
    code: string;
    model: string;
    hp?: string | number | null;
    /** NSM Retail at authoring time (what the price is slashed FROM) */
    retailPrice: number;
    /** The temporary new price while the rebate runs */
    rebatePrice: number;
}

export interface Rebate {
    id: string;
    name: string;
    description?: string;
    imageUrl?: string | null;
    /** optional campaign / offer website URL — shown wherever the rebate shows */
    linkUrl?: string | null;
    status: 'active' | 'past';
    /** yyyy-mm-dd; optional */
    startsAt?: string | null;
    /** yyyy-mm-dd; when set, the rebate auto-ends after this day (timer) */
    endsAt?: string | null;
    skus: RebateSku[];
    showImageOnQuote?: boolean;
    createdByUserId?: string;
    createdByUserName?: string;
    createdAt?: any;
    updatedAt?: any;
    endedAt?: any;
    endedBy?: string;
    endedReason?: 'manual' | 'expired';
    changeLog: { action: string; by: string; at: string; note?: string }[];
}

/** The stamp written onto each selected MPF motor row while the rebate
 *  is active. `moduleId` rides along so the finalize path can write the
 *  sale record to the right rebate without any extra plumbing. */
export interface ActiveRebateStamp {
    rebateId: string;
    moduleId: string;
    name: string;
    imageUrl?: string | null;
    linkUrl?: string | null;
    retailPrice: number;
    rebatePrice: number;
    startsAt?: string | null;
    endsAt?: string | null;
}

/** A sale/quote written under a rebate — one doc per finalized quote at
 *  `modules/{moduleId}/rebates/{rebateId}/sales/{saleId}`. */
export interface RebateSale {
    quoteId: string;
    quoteKind: 'boat' | 'motor';
    /** route to open the deal, e.g. /proposals/{id} */
    quotePath: string;
    customerName?: string;
    customerEmail?: string;
    salespersonId?: string;
    salespersonName?: string;
    motorCode: string;
    motorName: string;
    retailPrice: number;
    rebatePrice: number;
    discount: number;
    /** the whole-deal figure at finalize time (inc-GST package where applicable) */
    dealTotal?: number | null;
    organisationId?: string | null;
    soldAt: string;
}

/** endsAt is a whole-day date: the rebate stays live THROUGH that day. */
export function rebateEndsAtExpired(endsAt?: string | null, now: Date = new Date()): boolean {
    if (!endsAt) return false;
    const end = new Date(`${endsAt}T23:59:59.999`);
    return Number.isFinite(end.getTime()) && now.getTime() > end.getTime();
}

export function rebateStartsAtPending(startsAt?: string | null, now: Date = new Date()): boolean {
    if (!startsAt) return false;
    const start = new Date(`${startsAt}T00:00:00`);
    return Number.isFinite(start.getTime()) && now.getTime() < start.getTime();
}

/**
 * THE read gate. Returns the row's rebate stamp only when it is genuinely
 * live right now (numeric price, not expired). Every pricing surface —
 * quote flow, finalize, catalog picker, table badges, PDFs — resolves
 * through this so a stale stamp can never price a quote.
 */
export function getActiveRebate(row: any, now: Date = new Date()): ActiveRebateStamp | null {
    const stamp = row?.activeRebate;
    if (!stamp || typeof stamp !== 'object') return null;
    if (typeof stamp.rebatePrice !== 'number' || !Number.isFinite(stamp.rebatePrice)) return null;
    if (rebateEndsAtExpired(stamp.endsAt, now)) return null;
    if (rebateStartsAtPending(stamp.startsAt, now)) return null;
    return stamp as ActiveRebateStamp;
}

export function rebateSavings(stamp: ActiveRebateStamp): number {
    const d = (stamp.retailPrice ?? 0) - stamp.rebatePrice;
    return Number.isFinite(d) && d > 0 ? d : 0;
}

/**
 * v1.10 restructure — auto-apply engine (one-shot, removed after run).
 *
 * "Figure out where everything goes and move it all" — the non-
 * interactive counterpart to the Restructure Workbench. Runs the
 * categorisation rules (`v110-restructure-rules.ts`) across every
 * non-shipped, non-deleted feature, computes a full destination plan,
 * and (on confirm) writes every move in one batch.
 *
 * Flow:
 *   1. computeRestructurePlan(features) — pure, no I/O. Returns the
 *      move list + the full post-restructure capacity picture so the
 *      confirmation dialog can show "v1.10 gets N stories / M pts" etc.
 *   2. applyRestructurePlan(firestore, plan) — writes every move +
 *      graduates Submitted→Planned. Idempotent (re-running is safe).
 *
 * Same one-shot lifecycle as every prior seed: button + this module +
 * the Workbench all get removed in the cleanup commit after the user
 * confirms the restructure landed.
 */

import { doc, serverTimestamp, updateDoc, type Firestore } from 'firebase/firestore';
import type { FeatureDoc } from '@/components/feature-tracking-board';
import {
    inferCategory,
    isShippedRelease,
    POINTS_CAP_RED,
    type Category,
} from '@/lib/v110-restructure-rules';

/* ──────────────────────────────────────────────────────────────────
 * Capacity-aware bin-packing with a UNIFIED tracker
 *
 * Previously each lane's bin-packer ran independently — dealer-ops
 * filled v1.10, bugs also filled v1.10, Epic 11 seed also targeted
 * v1.10, and the dialog showed v1.10 at 31+ pts (well over the 20-pt
 * cap). Lanes weren't aware of each other.
 *
 * The unified tracker fixes that: ONE shared "filled per release" map
 * threads through every packing pass. Each story's preferred bucket is
 * tried first; if the bucket would exceed PACK_CAP, the packer rolls
 * forward through the band until it finds one with room. Pre-loaded
 * with Epic 11 seed points + already-scheduled cross-cutting so those
 * fixed-target stories are factored in before any band packs.
 *
 * Lane bands (preferred start release per category lane):
 *   dealer-ops        → v1.10 … v1.30   (wide; takes priority slot first)
 *   bugs              → v1.10 … v1.14   (rides alongside dealer-ops early)
 *   customer-facing   → v1.18 … v1.99   (slides after dealer-ops fills mid)
 *   non-bug cc        → v1.16 … v1.99   (mid spread)
 *   notifications     → v1.29 … v1.99   (lowest priority, fills after rest)
 *   already-scheduled cross-cutting     → left exactly where it is
 *
 * All bands span into v1.X exhaustively — NO artificial jump to v2.0.
 * v2.x is reserved for the MVP marker + post-MVP polish, not auto-
 * populated by the bin-packer. We reach v2.0 organically by filling
 * v1.10 → v1.99 first.
 * ────────────────────────────────────────────────────────────────── */

/** Build a v1.X range, e.g. v1Range(10, 30) → ['v1.10', ..., 'v1.30']. */
function v1Range(start: number, end: number): string[] {
    const out: string[] = [];
    for (let i = start; i <= end; i++) out.push(`v1.${i}`);
    return out;
}

const DEALER_OPS_BAND     = v1Range(10, 30);
const CUSTOMER_BAND       = v1Range(18, 99);
const NOTIF_BAND          = v1Range(29, 99);
const BUG_BAND            = v1Range(10, 14);
const CROSS_CUTTING_BAND  = v1Range(16, 99);

/** Safety-net release for any in-scope, unscheduled story that escapes
 *  every band (e.g. category 'discard'). Guarantees post-restructure
 *  UNSCHEDULED = 0. Defensive — picks the LAST bucket so the safety net
 *  doesn't crowd active releases. */
const SAFETY_NET_RELEASE  = 'v1.99';

/* ──────────────────────────────────────────────────────────────────
 * CapacityTracker — shared point load per release across all bands
 * ────────────────────────────────────────────────────────────────── */

class CapacityTracker {
    private filled: Record<string, number> = {};

    addLoad(release: string, points: number): void {
        this.filled[release] = (this.filled[release] ?? 0) + points;
    }

    canFit(release: string, points: number): boolean {
        const cur = this.filled[release] ?? 0;
        // Always allow at least one story per bucket even if it's huge
        // (better than dropping). Otherwise: must not exceed PACK_CAP.
        if (cur === 0) return true;
        return cur + points <= PACK_CAP;
    }
}

/** Bug detector: the explicit `type === 'bug'` first, then a title
 *  heuristic for stories that were filed as features but read as bugs
 *  ("X not appearing", "wrong price", "broken", "difference", ...). */
function isBug(f: FeatureDoc): boolean {
    if (f.type === 'bug') return true;
    const t = (f.title || '').toLowerCase();
    return /\b(bug|broken|error|incorrect|wrong|fix|issue|missing|difference)\b|not (appearing|working|showing|saving|loading)|does ?n'?t|won'?t/.test(t);
}

/** Per-bucket soft cap. Bin-packer rolls to the next release once a
 *  bucket would exceed this. Uses the standard 20-pt cap (POINTS_CAP_RED
 *  is the "over" threshold, so pack up to but not over it). */
const PACK_CAP = POINTS_CAP_RED - 1; // 20

const PRIORITY_ORDER: Record<string, number> = {
    critical: 0, high: 1, medium: 2, low: 3, 'nice-to-have': 4,
};

function priorityRank(f: FeatureDoc): number {
    return PRIORITY_ORDER[f.priority ?? 'medium'] ?? 2;
}

function pts(f: FeatureDoc): number {
    return typeof f.points === 'number' ? f.points : 0;
}

/**
 * Bin-pack a category's features into its release band, AWARE of what's
 * already loaded in those releases (via the shared CapacityTracker).
 * Front-loads by priority (critical first), then by points descending.
 *
 * For each story: walks the band looking for the first release that
 * can fit; if every band release is full, stacks on the LAST release
 * (better than dropping). Updates the tracker as it goes so subsequent
 * stories see the new load.
 *
 * Returns a map of feature.id → assigned release.
 */
function packBand(feats: FeatureDoc[], band: string[], tracker: CapacityTracker): Map<string, string> {
    const sorted = [...feats].sort((a, b) => {
        const pr = priorityRank(a) - priorityRank(b);
        if (pr !== 0) return pr;
        const pd = pts(b) - pts(a);
        if (pd !== 0) return pd;
        return (a.title || '').localeCompare(b.title || '');
    });
    const out = new Map<string, string>();
    for (const f of sorted) {
        const p = pts(f);
        // Find first band release with capacity. If none, fall back to
        // the LAST release in the band (stack rather than drop).
        let placed = band[band.length - 1];
        for (const rel of band) {
            if (tracker.canFit(rel, p)) {
                placed = rel;
                break;
            }
        }
        out.set(f.id, placed);
        tracker.addLoad(placed, p);
    }
    return out;
}

export interface PlannedMove {
    feature: FeatureDoc;
    category: Category;
    fromRelease: string | null;
    toRelease: string;
    /** Epic to file this (currently-unfiled) story into. undefined =
     *  leave epic untouched (already filed, or no confident match). */
    toEpicId?: string;
    /** True when this is a Submitted-status story getting scheduled. */
    statusBump: boolean;
    /** True when the story had no targetRelease before (Backlog inflow). */
    newlyScheduled: boolean;
}

/** Resolves a category to an epic id (or null). Built in the UI layer
 *  from the loaded epics so this module stays free of the epics list. */
export type EpicResolver = (category: Category) => string | null;

export interface ReleaseBucket {
    release: string;
    count: number;
    points: number;
}

export interface RestructurePlan {
    /** Every story that will be written (target change and/or status bump). */
    moves: PlannedMove[];
    /** Full post-restructure capacity: every release that will hold ≥1
     *  in-scope story, with its count + points AFTER all moves. Sorted
     *  by release. */
    afterByRelease: ReleaseBucket[];
    /** Total in-scope stories considered (non-shipped, non-deleted). */
    scoped: number;
    /** Convenience counts for the summary line. */
    moveCount: number;
    statusBumps: number;
    newlyScheduled: number;
    /** How many moves also file a previously-unfiled story into an epic. */
    epicAssignments: number;
}

/**
 * Compute the restructure plan with capacity-aware bin-packing. Pure —
 * no Firestore writes.
 *
 * In scope: every feature that is NOT soft-deleted and NOT on a shipped
 * release. Backlog inflow (null targetRelease) is included.
 *
 * Each category lane is bin-packed across its band so no single release
 * is overloaded:
 *   dealer-ops (3.x / 6.x / 9.x)     → v1.10 → v1.17 band
 *   customer-facing (1.x/2.x/4.x/8.x) → v1.18 → v1.21 band
 *   notifications (10.x)              → v1.22 → v1.24 band
 *   cross-cutting (5.x / 6.4.x / 7.x) → left exactly where they are
 */
export function computeRestructurePlan(
    features: FeatureDoc[],
    resolveEpic?: EpicResolver,
    /** Optional: pre-loaded points per release (e.g. Epic 11 seed). The
     *  unified packer accounts for these so v1.10 doesn't get over-cap
     *  when a fixed-target seed targets the same bucket. */
    preloadCapacity?: Record<string, number>,
): RestructurePlan {
    // 1. Partition in-scope features by category lane.
    const inScope: { f: FeatureDoc; category: Category }[] = [];
    for (const f of features) {
        if (f.deletedAt) continue;
        if (isShippedRelease(f.targetRelease ?? undefined)) continue;
        inScope.push({ f, category: inferCategory(f.title) });
    }

    const dealerOps    = inScope.filter(x => x.category.startsWith('dealer-ops')).map(x => x.f);
    const customer     = inScope.filter(x => x.category === 'customer-facing').map(x => x.f);
    const notifications = inScope.filter(x => x.category === 'customer-facing:notifications').map(x => x.f);

    // Cross-cutting: only re-pack the UNSCHEDULED ones (Submitted-column
    // inflow). Already-scheduled cross-cutting stays put.
    const ccUnscheduled = inScope.filter(x => x.category === 'cross-cutting' && !x.f.targetRelease);
    const ccBugs    = ccUnscheduled.filter(x => isBug(x.f)).map(x => x.f);
    const ccNonBugs = ccUnscheduled.filter(x => !isBug(x.f)).map(x => x.f);
    const ccScheduled = inScope.filter(x => x.category === 'cross-cutting' && !!x.f.targetRelease);

    // 2. Shared capacity tracker — pre-load with EXTERNAL fixed-target
    //    points so the band-packers account for them when checking
    //    capacity. Two sources:
    //      a) Epic 11 (or any other) seed points the caller passes in
    //      b) Already-scheduled cross-cutting stories that stay put
    const tracker = new CapacityTracker();
    if (preloadCapacity) {
        for (const [rel, pts] of Object.entries(preloadCapacity)) {
            tracker.addLoad(rel, pts);
        }
    }
    for (const { f } of ccScheduled) {
        if (f.targetRelease) tracker.addLoad(f.targetRelease, pts(f));
    }

    // 3. Pack each lane via the shared tracker (priority order = pack
    //    order; dealer-ops + bugs first, customer-facing next, then
    //    cross-cutting spread, notifications last).
    const assignment = new Map<string, string>();
    for (const [id, rel] of packBand(dealerOps,    DEALER_OPS_BAND,    tracker))  assignment.set(id, rel);
    for (const [id, rel] of packBand(ccBugs,       BUG_BAND,           tracker))  assignment.set(id, rel);
    for (const [id, rel] of packBand(customer,     CUSTOMER_BAND,      tracker))  assignment.set(id, rel);
    for (const [id, rel] of packBand(ccNonBugs,    CROSS_CUTTING_BAND, tracker))  assignment.set(id, rel);
    for (const [id, rel] of packBand(notifications, NOTIF_BAND,         tracker))  assignment.set(id, rel);

    // 4. Safety net — sweep ANY in-scope story that didn't end up with
    //    an effective target (no assignment AND no current targetRelease)
    //    into SAFETY_NET_RELEASE. Guarantees post-restructure UNSCHEDULED = 0.
    for (const { f } of inScope) {
        const effective = assignment.get(f.id) ?? f.targetRelease;
        if (!effective) {
            assignment.set(f.id, SAFETY_NET_RELEASE);
            tracker.addLoad(SAFETY_NET_RELEASE, pts(f));
        }
    }

    // 3. Build moves + post-restructure capacity tally.
    const moves: PlannedMove[] = [];
    const afterCounts: Record<string, ReleaseBucket> = {};

    for (const { f, category } of inScope) {
        const points = pts(f);
        // Landing release: packed assignment, else current (cross-cutting
        // + already-correct stay put), else unscheduled.
        const to = assignment.get(f.id) ?? f.targetRelease ?? null;
        const landing = to ?? '(unscheduled)';

        if (landing !== '(unscheduled)') {
            (afterCounts[landing] ??= { release: landing, count: 0, points: 0 });
            afterCounts[landing].count += 1;
            afterCounts[landing].points += points;
        }

        // Epic assignment: only file stories that are currently UNFILED
        // (no epicId) — never override a deliberate existing epic. Resolve
        // the category to an epic id via the injected resolver.
        let toEpicId: string | undefined;
        if (resolveEpic && !f.epicId) {
            const epicId = resolveEpic(category);
            if (epicId) toEpicId = epicId;
        }

        const targetChange = !!to && to !== f.targetRelease;
        const statusBump = f.status === 'submitted' && !!to;
        const epicChange = !!toEpicId;
        if (targetChange || statusBump || epicChange) {
            moves.push({
                feature: f,
                category,
                fromRelease: f.targetRelease ?? null,
                toRelease: to ?? (f.targetRelease ?? ''),
                toEpicId,
                statusBump,
                newlyScheduled: !f.targetRelease && !!to,
            });
        }
    }

    const afterByRelease = Object.values(afterCounts).sort((a, b) =>
        a.release.localeCompare(b.release, undefined, { numeric: true }),
    );

    return {
        moves,
        afterByRelease,
        scoped: inScope.length,
        moveCount: moves.length,
        statusBumps: moves.filter(m => m.statusBump).length,
        newlyScheduled: moves.filter(m => m.newlyScheduled).length,
        epicAssignments: moves.filter(m => !!m.toEpicId).length,
    };
}

export interface ApplyResult {
    ok: number;
    failed: number;
}

/**
 * Apply a computed plan. Writes every move's targetRelease + (for
 * Submitted-status stories) status: 'planned'. Best-effort per row —
 * a single failure doesn't abort the batch; counts are returned.
 */
export async function applyRestructurePlan(
    firestore: Firestore,
    plan: RestructurePlan,
): Promise<ApplyResult> {
    let ok = 0;
    let failed = 0;
    for (const m of plan.moves) {
        try {
            const updates: any = { updatedAt: serverTimestamp() };
            if (m.toRelease && m.toRelease !== m.fromRelease) {
                updates.targetRelease = m.toRelease;
            }
            if (m.statusBump) {
                updates.status = 'planned';
            }
            if (m.toEpicId) {
                updates.epicId = m.toEpicId;
            }
            await updateDoc(doc(firestore, 'features', m.feature.id), updates);
            ok++;
        } catch (e) {
            console.error('[restructure-apply] failed for', m.feature.id, e);
            failed++;
        }
    }
    return { ok, failed };
}

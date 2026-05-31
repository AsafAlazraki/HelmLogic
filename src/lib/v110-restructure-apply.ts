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
 * Capacity-aware bin-packing
 *
 * The naive "every dealer-ops story → v1.10" rule piles everything into
 * one bucket. A real restructure spreads each category's stories across
 * a band of releases, front-loading by priority and respecting the
 * per-release point cap. This is the "think about flow-on effects"
 * the stakeholder asked for — v1.10 ends up at a sane ~18-20 pts, the
 * rest flow into v1.11, v1.12, ...
 *
 * Bands (start release per category lane):
 *   dealer-ops      → v1.10, v1.11, v1.12, v1.13, v1.14, v1.15, ...
 *   customer-facing → v1.18, v1.19, v1.20, v1.21, ...
 *   notifications   → v1.22, v1.23, ...
 *   cross-cutting   → left where they are (not re-packed)
 * ────────────────────────────────────────────────────────────────── */

const DEALER_OPS_BAND = ['v1.10', 'v1.11', 'v1.12', 'v1.13', 'v1.14', 'v1.15', 'v1.16', 'v1.17'];
const CUSTOMER_BAND    = ['v1.18', 'v1.19', 'v1.20', 'v1.21'];
const NOTIF_BAND       = ['v1.22', 'v1.23', 'v1.24'];

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
 * Bin-pack a category's features into its release band. Front-loads by
 * priority (critical first), then by points descending so big stories
 * land early. Rolls to the next band release when the current bucket
 * would exceed PACK_CAP. Overflow past the band's last release stacks
 * on that last release (better than dropping).
 *
 * Returns a map of feature.id → assigned release.
 */
function packBand(feats: FeatureDoc[], band: string[]): Map<string, string> {
    const sorted = [...feats].sort((a, b) => {
        const pr = priorityRank(a) - priorityRank(b);
        if (pr !== 0) return pr;
        const pd = pts(b) - pts(a);
        if (pd !== 0) return pd;
        return (a.title || '').localeCompare(b.title || '');
    });
    const out = new Map<string, string>();
    let bandIdx = 0;
    let bucketPts = 0;
    for (const f of sorted) {
        const p = pts(f);
        // Roll to next release if this story would push the bucket over
        // cap (but always place at least one story per bucket).
        if (bucketPts > 0 && bucketPts + p > PACK_CAP && bandIdx < band.length - 1) {
            bandIdx++;
            bucketPts = 0;
        }
        out.set(f.id, band[bandIdx]);
        bucketPts += p;
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
    // cross-cutting + anything else: not re-packed (stay put).

    // 2. Bin-pack each lane into its band.
    const assignment = new Map<string, string>();
    for (const [id, rel] of packBand(dealerOps, DEALER_OPS_BAND))     assignment.set(id, rel);
    for (const [id, rel] of packBand(customer, CUSTOMER_BAND))         assignment.set(id, rel);
    for (const [id, rel] of packBand(notifications, NOTIF_BAND))       assignment.set(id, rel);

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

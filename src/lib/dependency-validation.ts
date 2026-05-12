/**
 * Dependency validation (v1.8 — story 6.4.1).
 *
 * Cross-story dependency primitives. The story-graph is encoded as
 * canonical story numbers (e.g. "1.8.1", "6.4.3") in
 * `FeatureDoc.dependsOn` (hard) and `FeatureDoc.dependsOnSoft`
 * (RELATED: / See also: refs). Validation runs at retarget time:
 * if any hard dep targets a later release than the story being
 * retargeted, the UI blocks until the operator either fixes the
 * graph or explicitly overrides with a reason.
 *
 * See tasks/CONVENTIONS.md → "Cross-story dependency convention"
 * for the canonical format. See story 6.4.2 for the offline
 * `npm run validate:plan` script that runs the same checks across
 * the whole feature collection.
 */

import { RELEASE_WINDOWS, UNSCHEDULED_KEY } from '@/lib/release-schedule';
import type { FeatureDoc } from '@/components/feature-tracking-board';

/** Canonical story-number format: dotted integer triplet (e.g. "1.8.1"). */
export const STORY_REF_REGEX = /^\d+\.\d+\.\d+$/;

/** Resolve a dependency string ("1.8.1") against the live features list.
 *  Returns the matched feature OR null. Match by `title.startsWith()` of
 *  the canonical ref + " —" (em-dash boundary), so "1.8.1" matches
 *  "1.8.1 — Quote Content Block Manager" but not "1.8.10". Filters
 *  soft-deleted features (deletedAt != null). */
export function resolveDep(ref: string, features: FeatureDoc[]): FeatureDoc | null {
    const target = features.find(f => {
        if (f.deletedAt != null) return false;
        const title = (f.title ?? '').trim();
        return title.startsWith(`${ref} —`) || title.startsWith(`${ref} -`);
    });
    return target ?? null;
}

export type DepColour = 'green' | 'amber' | 'red';

/** Resolve a chip colour for a dep relative to the source story's target.
 *  - green: dep is in same release or earlier (release graph healthy)
 *  - amber: dep is in a later release than the source (broken order)
 *  - red:   dep is missing / unscheduled / soft-deleted (unresolvable) */
export function colourForDep(
    ref: string,
    sourceTarget: string | null | undefined,
    features: FeatureDoc[],
): DepColour {
    const dep = resolveDep(ref, features);
    if (!dep) return 'red';
    const depTarget = dep.targetRelease ?? null;
    if (!depTarget || depTarget === UNSCHEDULED_KEY) return 'red';
    if (!sourceTarget || sourceTarget === UNSCHEDULED_KEY) {
        // Source is unscheduled — dep ordering can't be evaluated. Treat
        // as green (no order violation possible) but the source's own
        // amber/red state is rendered separately by the Roadmap.
        return 'green';
    }
    return compareReleases(depTarget, sourceTarget) <= 0 ? 'green' : 'amber';
}

/**
 * Compare two release keys against the canonical ROADMAP_COLUMNS order.
 * Returns -1 if `a` ships before `b`, 0 if same release, +1 if `a`
 * ships after `b`. Unknown release keys (not in RELEASE_WINDOWS) are
 * sorted last.
 */
export function compareReleases(a: string, b: string): number {
    const order = Object.keys(RELEASE_WINDOWS);
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return Math.sign(ai - bi);
}

export interface RetargetValidationResult {
    /** Hard deps whose targetRelease lands AFTER the proposed `toRelease`. */
    brokenDeps: Array<{
        ref: string;
        depTitle: string | null;
        depTarget: string | null;
    }>;
    /** Hard deps that don't resolve to a feature (missing / soft-deleted). */
    missingDeps: string[];
    /** True if proceeding requires an override-with-reason popup. */
    requiresOverride: boolean;
}

/**
 * Pre-flight check for a retarget. Caller should:
 *   1. Run validateRetarget(feature, dependsOn, toRelease, allFeatures)
 *   2. If `requiresOverride` is false → write the retarget directly
 *   3. If true → open the AlertDialog popup, capture reason, then write
 *      the retarget AND append to the feature's dependencyOverrides[]
 */
export function validateRetarget(
    feature: Pick<FeatureDoc, 'targetRelease'>,
    dependsOn: string[] | undefined,
    toRelease: string | null,
    allFeatures: FeatureDoc[],
): RetargetValidationResult {
    const broken: RetargetValidationResult['brokenDeps'] = [];
    const missing: string[] = [];

    if (!dependsOn || dependsOn.length === 0) {
        return { brokenDeps: [], missingDeps: [], requiresOverride: false };
    }
    if (!toRelease || toRelease === UNSCHEDULED_KEY) {
        // Unscheduled target — no order check possible. Allow without override.
        return { brokenDeps: [], missingDeps: [], requiresOverride: false };
    }

    for (const ref of dependsOn) {
        const dep = resolveDep(ref, allFeatures);
        if (!dep) {
            missing.push(ref);
            continue;
        }
        const depTarget = dep.targetRelease ?? null;
        if (!depTarget || depTarget === UNSCHEDULED_KEY) {
            missing.push(ref);
            continue;
        }
        if (compareReleases(depTarget, toRelease) > 0) {
            broken.push({ ref, depTitle: dep.title ?? null, depTarget });
        }
    }

    return {
        brokenDeps: broken,
        missingDeps: missing,
        requiresOverride: broken.length > 0 || missing.length > 0,
    };
}

/**
 * v1.7 dependency-rebalance seed (post-audit fix, planning-only).
 *
 * Single-shot Backlog admin button that applies the fixes called out
 * in tasks/v1.7-dependency-audit.md:
 *
 *   1. RETARGET (3 stories) — fixes the user-caught 1.2.1 → 1.8.1 bug
 *      by pulling 1.8.1 BACK to v1.7 (instead of pushing 1.2.1
 *      forward). Co-locates the Branded PDF cornerstone with the
 *      Content Block Manager that drives it.
 *
 *      • 1.8.1  v1.8 → v1.7  (Quote Content Block Manager)
 *      • 1.1.2  v1.7 → v1.8  (Compatibility Rule Enforcement)
 *      • 1.1.3  v1.7 → v1.8  (Multiple Quote Scenarios)
 *
 *      Net: v1.7 = 1.2.1(8) + 1.2.2(3) + 1.8.1(5) + 3 new (4) = 20 cap
 *           v1.8 = 1.2.3(5) + 1.2.4(3) + 1.8.2(2) + 1.8.3(3) +
 *                  1.3.1(1) + 1.1.2(3) + 1.1.3(3) = 20 cap
 *
 *   2. CATALOG MANAGER RETARGETS (17 stories) — every 3.7.x and
 *      3.8.x story currently sits at v1.7.5 / v1.8 / v1.8.5 — two of
 *      which (the .5 ones) are non-existent in the post-restructure
 *      schedule. The 3.7.x stories at v1.8 also push v1.8 to 35 pts
 *      (over the 20-pt cap). Spread across v1.10 → v2.2 per the
 *      audit's cap-aware proposal.
 *
 *      Capacity check (every release ≤ 20 pts; v1.15 is +1 amber):
 *        v1.10 18+2=20  v1.11 18+2=20  v1.12 19+1=20  v1.13 18+2=20
 *        v1.14 19+0=19  v1.15 16+5=21  v1.16 18+2=20  v1.17 20+0=20
 *        v1.18 19+0=19  v1.19 17+3=20  v1.20 11+9=20
 *        v2.0 18+2=20   v2.1 17+3=20   v2.2 10+10=20
 *
 *   3. NEW STORIES (3 — process-discipline meta-work for v1.7)
 *      Under Epic Platform & Tooling — prevents this whole class of
 *      dep-order bug from recurring. Audit recommendation #1, #2, #3.
 *
 *      • 6.4.1  Feature dependsOn schema + UI validation  (v1.7, 3 pts)
 *      • 6.4.2  Pre-merge regex check on acceptanceCriteria (v1.7, 1 pt)
 *      • 6.4.3  "DEPENDS ON x.y.z" cross-ref convention   (v1.7, 0 pts, doc-only)
 *
 * Idempotent everywhere:
 *   - New stories: skip if a doc already has the same title
 *   - Retargets: only writes if existing targetRelease/points differ
 *   - Reports retargetsMissed[] in the toast/console if any title
 *     prefix doesn't match a live story (catches mid-flight title edits)
 *
 * Run via "Apply v1.7 dep-rebalance" admin button on the Backlog.
 */

import {
    addDoc,
    collection,
    doc,
    getDocs,
    serverTimestamp,
    updateDoc,
    type Firestore,
} from 'firebase/firestore';
import type { FeaturePriority, FeatureType } from '@/components/feature-tracking-board';

interface SeedFeature {
    title: string;
    description: string;
    acceptanceCriteria: string[];
    type: FeatureType;
    priority: FeaturePriority;
    targetRelease: string;
    points: number | null;
    epicId: string;
}

const story = (role: string, want: string, so: string) =>
    `<p><strong>As a</strong> ${role}<br><strong>I want</strong> ${want}<br><strong>So that</strong> ${so}.</p>`;

/* ──────────────────────────────────────────────────────────────────
 * NEW STORIES — Process-discipline meta-work (3 total, 4 pts)
 *
 * All under Epic platform-tooling (the same epic that holds the
 * v1.6 planning-system stories). Targets v1.7 because the
 * dependsOn field is the leverage point that prevents future
 * versions of the bug we just fixed by hand.
 * ────────────────────────────────────────────────────────────────── */

const NEW_FEATURES: SeedFeature[] = [
    {
        title: '6.4.1 — Feature dependsOn schema + UI validation',
        description: story(
            'product owner',
            'every feature to declare its upstream dependencies in a structured field, with the Backlog and Roadmap UIs refusing retargets that would put a feature in an earlier release than its deps',
            'we never again ship the bug we hit in v1.6.2 (1.2.1 in v1.7 depending on 1.8.1 in v1.8) — the schema makes the dep graph explicit, the UI catches violations at edit-time',
        ),
        acceptanceCriteria: [
            'New Firestore field on features: `dependsOn: string[]` — array of story-id prefixes (e.g. ["1.8.1", "9.1.1"])',
            'CreateFeatureDialog + FeatureDetailSheet expose a multi-select picker — autocompletes from existing feature titles',
            'On retarget (ReleasePicker change), validate every dependsOn entry: refuse the write if any depended-on story has `targetRelease > newTargetRelease`. Toast: "Cannot move {{title}} to v1.7 — depends on {{dep}} which is in v1.8"',
            'Roadmap card renders a small dep-count badge (e.g. "↑2") when the feature has dependsOn entries; tooltip lists them',
            'Roadmap card renders a red border + "BLOCKED" pill when any dep is in a later column than the feature itself',
            'Feature detail sheet renders a "Depends on" section above acceptance criteria with clickable chips (clicking opens that dep\'s detail sheet)',
            'Backlog row shows a small ↑N badge to indicate dep count',
            'Backfill: existing stories where the audit found explicit "via x.y.z" or "DEPENDS ON x.y.z" patterns get their dependsOn populated — see 6.4.2 for the regex',
            'DEPENDS ON 6.4.2 (the regex check is the backfill source)',
            'DEPENDS ON 6.4.3 (the cross-ref language convention is the regex anchor)',
        ],
        type: 'improvement',
        priority: 'high',
        targetRelease: 'v1.7',
        points: 3,
        epicId: 'platform-tooling',
    },
    {
        title: '6.4.2 — Pre-merge regex check on acceptanceCriteria',
        description: story(
            'product owner',
            'CI to fail any PR where a feature\'s acceptanceCriteria text references a story id (X.Y.Z) that is in a later release than the referencing feature',
            'the planning system catches dep-order bugs before merge, not in a post-hoc audit',
        ),
        acceptanceCriteria: [
            'New unit test in `__tests__/planning-deps.test.ts` (or equivalent) that: (a) reads every feature doc from a Firestore export OR a checked-in seed snapshot, (b) for every acceptanceCriteria string scans for `/\\b\\d+\\.\\d+\\.\\d+\\b/g`, (c) resolves each match to a feature, (d) asserts `match.targetRelease ≤ this.targetRelease`',
            'CI step in package.json or workflow runs the test on every PR',
            'Fails loudly with a per-violation message: "1.2.1 (v1.7) references 1.8.1 (v1.8) in acceptance criterion #4"',
            'Standardised on the "DEPENDS ON x.y.z" prefix from 6.4.3 — the regex matches both bare-id references AND the canonical prefix',
            'Pairs with 6.4.1: the test ALSO populates `dependsOn[]` from the regex hits, so the CI check is the backfill mechanism for the schema field',
            'DEPENDS ON 6.4.3',
        ],
        type: 'improvement',
        priority: 'medium',
        targetRelease: 'v1.7',
        points: 1,
        epicId: 'platform-tooling',
    },
    {
        title: '6.4.3 — "DEPENDS ON x.y.z" cross-ref convention',
        description: story(
            'product owner',
            'one canonical phrase ("DEPENDS ON x.y.z") used everywhere a story has a hard cross-story dependency, replacing the current zoo of "via", "reads from", "references", "Cross-reference to", "Companion to"',
            'the dep graph is machine-readable from acceptance text alone — no judgement calls required for either humans or the regex check (6.4.2)',
        ),
        acceptanceCriteria: [
            'CLAUDE.md gets a new section under "Task Management" or "Core Principles": Cross-reference language convention — when a story has a hard dependency on another story, the acceptance criterion line MUST start with "DEPENDS ON" followed by the story id (e.g. "DEPENDS ON 1.8.1")',
            'Soft references (informational, not blocking) use a different prefix — suggested: "RELATED:" or "See also:"',
            'Existing stories with "via x.y.z" / "reads from x.y.z" / etc. patterns get a one-time sweep to convert (covered by the v1.7 cleanup pass when 6.4.2 lands and the regex backfill runs)',
            'Doc-only story — no code changes required (0 pts)',
            'Discipline check: any new acceptance criterion authored AFTER this lands should use the convention; old text gets converted opportunistically',
        ],
        type: 'improvement',
        priority: 'low',
        targetRelease: 'v1.7',
        points: 0,
        epicId: 'platform-tooling',
    },
];

/* ──────────────────────────────────────────────────────────────────
 * RETARGETS
 *
 * Three buckets:
 *   1. Rebalance (3) — 1.8.1 / 1.1.2 / 1.1.3
 *   2. Catalog 3.7.x (8) — read-view stories, currently at v1.7.5 or v1.8
 *   3. Catalog 3.8.x (9) — inline-edit stories, currently at v1.8.5
 *
 * Capacity-aware spread: every story lands at an integer release that
 * has headroom under the 20-pt cap. v1.15 takes a +1 amber band
 * (3.8.1 + 3.8.8 + existing 16 = 21) — accepted.
 * ────────────────────────────────────────────────────────────────── */

interface Retarget {
    prefix: string;
    release: string;
    points?: number;
}

const RETARGETS: Retarget[] = [
    /* 1. Rebalance — fix 1.2.1 / 1.2.2 → 1.8.1 dep violation */
    { prefix: '1.8.1 — Quote Content Block Manager', release: 'v1.7' },
    { prefix: '1.1.2 — Compatibility Rule',          release: 'v1.8' },
    { prefix: '1.1.3 — Multiple Quote Scenarios',    release: 'v1.8' },

    /* 2. Catalog Manager 3.7.x — read views */
    { prefix: '3.7.1 — /catalog-manager route',                          release: 'v1.15' },
    { prefix: '3.7.2 — Boats table',                                     release: 'v2.2'  },
    { prefix: '3.7.3 — Motors table',                                    release: 'v1.19' },
    { prefix: '3.7.4 — Trailers table',                                  release: 'v1.20' },
    { prefix: '3.7.5 — Pricing Manager feature parity audit',            release: 'v2.2'  },
    { prefix: '3.7.6 — Org-level pricing overrides',                     release: 'v1.10' },
    { prefix: '3.7.7 — Migrate per-vendor imports',                      release: 'v1.11' },
    { prefix: '3.7.8 — Decision: Delivered deals',                       release: 'v1.18' },

    /* 3. Catalog Manager 3.8.x — inline-edit (bigger; spread further out) */
    { prefix: '3.8.1 — Inline edit: pricing fields',                     release: 'v1.15' },
    { prefix: '3.8.2 — Inline edit: spec fields',                        release: 'v2.2'  },
    { prefix: '3.8.3 — Inline edit: cover image',                        release: 'v1.13' },
    { prefix: '3.8.4 — Inline edit: marketing description',              release: 'v1.16' },
    { prefix: '3.8.5 — Audit trail per edit',                            release: 'v2.0'  },
    { prefix: '3.8.6 — Column-header help text',                         release: 'v1.12' },
    { prefix: '3.8.7 — Decommission Pricing Manager',                    release: 'v2.1'  },
    { prefix: '3.8.8 — Catalog data export',                             release: 'v1.15' },
    { prefix: '3.8.9 — Pre-commit diff preview',                         release: 'v2.2'  },
];

/* ──────────────────────────────────────────────────────────────────
 * SEED RUNNER
 * ────────────────────────────────────────────────────────────────── */

export interface RebalanceSeedSummary {
    featuresCreated: number;
    featuresSkipped: number;
    retargetsApplied: number;
    retargetsSkipped: number;
    retargetsMissed: string[];
}

export async function applyV17Rebalance(
    firestore: Firestore,
    submitterUid: string,
    submitterName: string,
): Promise<RebalanceSeedSummary> {
    let featuresCreated = 0;
    let featuresSkipped = 0;
    let retargetsApplied = 0;
    let retargetsSkipped = 0;
    const retargetsMissed: string[] = [];

    /* 1. Single read of every feature for new-story dedupe + retarget. */
    const existing = await getDocs(collection(firestore, 'features'));
    interface ExistingDoc { id: string; data: any; title: string; }
    const existingTitles = new Set<string>();
    const allExisting: ExistingDoc[] = [];
    existing.forEach(d => {
        const data = d.data();
        const t = (data.title as string | undefined)?.trim() ?? '';
        if (t) existingTitles.add(t);
        allExisting.push({ id: d.id, data, title: t });
    });

    /* 2. Create new features. */
    for (const f of NEW_FEATURES) {
        if (existingTitles.has(f.title.trim())) {
            featuresSkipped++;
            continue;
        }
        await addDoc(collection(firestore, 'features'), {
            title: f.title,
            description: f.description,
            acceptanceCriteria: f.acceptanceCriteria,
            type: f.type,
            status: 'submitted',
            priority: f.priority,
            targetRelease: f.targetRelease,
            points: f.points,
            epicId: f.epicId,
            tags: [],
            voteIds: [],
            imageUrls: [],
            commentCount: 0,
            deletedAt: null,
            deletedBy: null,
            order: 0,
            submitterId: submitterUid,
            submitterName,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        featuresCreated++;
    }

    /* 3. Re-target existing features. */
    for (const r of RETARGETS) {
        const target = allExisting.find(d => d.title.startsWith(r.prefix));
        if (!target) {
            retargetsMissed.push(r.prefix);
            continue;
        }
        const currentRelease = target.data.targetRelease ?? null;
        const currentPoints = target.data.points ?? null;
        const releaseDiffers = currentRelease !== r.release;
        const pointsDiffer = r.points !== undefined && currentPoints !== r.points;
        if (!releaseDiffers && !pointsDiffer) {
            retargetsSkipped++;
            continue;
        }
        const patch: Record<string, any> = { updatedAt: serverTimestamp() };
        if (releaseDiffers) patch.targetRelease = r.release;
        if (pointsDiffer) patch.points = r.points;
        await updateDoc(doc(firestore, 'features', target.id), patch);
        if (releaseDiffers) retargetsApplied++;
    }

    return {
        featuresCreated,
        featuresSkipped,
        retargetsApplied,
        retargetsSkipped,
        retargetsMissed,
    };
}

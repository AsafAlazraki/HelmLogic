/**
 * v1.6 self-seed.
 *
 * Populates the v1.6 release column with the actual work that comprised
 * the v1.6 ship — turns "v1.6 is empty" into a self-documented, accepted,
 * shipped release that visualises the platform-tooling work the team did.
 *
 * Run once via the "Populate v1.6 stories" admin button on the Backlog.
 * Idempotent: skips features whose title already exists.
 *
 * Design choices that ship with the seeded stories:
 *  - Lives under a NEW epic, "Platform & Tooling", added at order 700
 *    (after the 6 product epics) so existing layout stays stable.
 *  - All stories: status='shipped', targetRelease='v1.6', auto-accepted
 *    by the user clicking the button (acceptedAt/By/Name = caller).
 *  - Total points: 40 (right at the cap — honest signal of the lift).
 */

import {
    addDoc,
    collection,
    doc,
    getDoc,
    getDocs,
    serverTimestamp,
    setDoc,
    type Firestore,
} from 'firebase/firestore';
import type { EpicColor, FeaturePriority, FeatureType } from '@/components/feature-tracking-board';

interface SeedEpic {
    id: string;
    title: string;
    shortLabel: string;
    description: string;
    color: EpicColor;
    order: number;
    status: 'planning' | 'active' | 'done';
}

interface SeedFeature {
    title: string;
    description: string;
    acceptanceCriteria: string[];
    type: FeatureType;
    priority: FeaturePriority;
    points: number;
}

const story = (role: string, want: string, so: string) =>
    `<p><strong>As a</strong> ${role}<br><strong>I want</strong> ${want}<br><strong>So that</strong> ${so}.</p>`;

const PLATFORM_EPIC: SeedEpic = {
    id: 'platform-tooling',
    title: 'Platform & Tooling',
    shortLabel: 'Platform',
    description: 'Internal HelmLogic infrastructure — Feature Tracking, Roadmap, Planning System. Meta work that makes the product easier to build and run, not customer-facing capability.',
    color: 'indigo',
    order: 700,
    status: 'done',
};

/**
 * v1.6 work. Sums to 40 pts — the per-release cap, signalling that v1.6
 * was a full release of platform investment.
 */
const V16_FEATURES: SeedFeature[] = [
    {
        title: 'v1.6.1 — Epics as a first-class concept',
        description: story('product owner', 'to organise stories into epics with a colour-banded swim lane', 'a hundred-item backlog stays comprehensible'),
        acceptanceCriteria: [
            'New `epics/{id}` Firestore collection',
            '`epicId` field on every feature',
            '7-key colour palette (blue / amber / violet / emerald / rose / indigo / slate)',
            'Epics sorted by `order` field across Backlog + Roadmap',
        ],
        type: 'feature', priority: 'high', points: 5,
    },
    {
        title: 'v1.6.2 — Story points (Fibonacci 1/2/3/5/8)',
        description: story('product owner', 'to estimate every story with story points', 'we can size releases honestly without committing to dates'),
        acceptanceCriteria: [
            'Optional `points` field on features',
            'Pill renders on every card / chip / row',
            'Sums per epic (Backlog header) + per release (Roadmap header)',
            'Capacity colour-coding: amber ≥ 35 pts, red ≥ 50 pts',
        ],
        type: 'improvement', priority: 'high', points: 2,
    },
    {
        title: 'v1.6.3 — Backlog tab (collapsible epic groups)',
        description: story('product owner', 'a long-form list of every active feature grouped by epic', 'I can scan the whole pipeline without the Kanban noise or the Roadmap abstraction'),
        acceptanceCriteria: [
            'Collapsible epic groups, sorted in-progress → planned → submitted → shipped, then alphabetical',
            'Per-epic header: counts, accepted tally, total points',
            '"+ Add story" button per epic header pre-fills epic',
            '"+ New Epic" button via dedicated dialog',
        ],
        type: 'feature', priority: 'high', points: 5,
    },
    {
        title: 'v1.6.4 — Roadmap tab (epic × release grid)',
        description: story('product owner', 'a 2-D grid of epic swim lanes against release columns', 'I can see what each release contains across every epic at a glance'),
        acceptanceCriteria: [
            '8 release columns + Backlog (Unscheduled)',
            'Y-axis: epic swim lanes, colour-banded',
            'Cells: compact feature chips with type icon + priority dot + points badge',
            'Release header shows "X pts · N items" + capacity overload icon',
            'Footer row totals per release',
        ],
        type: 'feature', priority: 'high', points: 8,
    },
    {
        title: 'v1.6.5 — Drag-and-drop chips on Roadmap',
        description: story('product owner', 'to drag a feature chip between Roadmap cells', 'I can re-bucket work into a different release or epic in one operation'),
        acceptanceCriteria: [
            'Drop updates `epicId` and `targetRelease` together',
            'Optimistic overlay so chip moves instantly',
            'Toast warning when dropping into an over-capacity release',
            'PointerSensor activation distance lets click + drag coexist',
        ],
        type: 'feature', priority: 'high', points: 3,
    },
    {
        title: 'v1.6.6 — Filter bar + click-epic-to-solo on Roadmap',
        description: story('product owner', 'to focus the Roadmap on one epic or a subset of releases', 'I can review one slice of the plan without the rest fighting for attention'),
        acceptanceCriteria: [
            'Multi-select chips for epics + releases at top of Roadmap',
            'Click an epic swim-lane label → solo that epic',
            '"Clear filters" link visible when any filter is applied',
        ],
        type: 'feature', priority: 'medium', points: 2,
    },
    {
        title: 'v1.6.7 — Per-story Accept button (stakeholder sign-off)',
        description: story('stakeholder', 'to accept each story as scope-locked once we agree the wording is right', 'we have a defensible sign-off record per story'),
        acceptanceCriteria: [
            '`acceptedAt` / `acceptedBy` / `acceptedByName` snapshotted at accept time',
            'Detail sheet: emerald banded callout when accepted, green button when not',
            'Backlog row: tiny "Accepted" pill with tooltip',
            'Backlog epic header: tally `5 / 22` (turns emerald at 100%)',
            'Revoke action restores the not-accepted state',
        ],
        type: 'feature', priority: 'high', points: 2,
    },
    {
        title: 'v1.6.8 — Soft delete + Archive view + Restore',
        description: story('product owner', 'to archive a story without losing its history', 'I can clean the board without destroying audit trail'),
        acceptanceCriteria: [
            '`deletedAt` / `deletedBy` markers on the feature doc',
            'Hidden from Board / Roadmap / Backlog',
            'Archive view on the Board to browse + Restore',
            'Permanent delete only offered from Archive',
        ],
        type: 'improvement', priority: 'medium', points: 2,
    },
    {
        title: 'v1.6.9 — Type system extension (3 → 6 types)',
        description: story('product owner', 'to track non-code work (content, decisions, ops tasks) on the same board as features and bugs', 'the plan reflects everything that has to happen, not just code'),
        acceptanceCriteria: [
            'New types: content 📄, decision ⚖️, task 📋',
            'Each type renders with a distinct icon + colour everywhere a card/chip/row appears',
            'TypeIcon switch covers all 6 types',
        ],
        type: 'improvement', priority: 'medium', points: 1,
    },
    {
        title: 'v1.6.10 — "Half" releases (v1.7.5 / v1.8.5 / v1.9.5)',
        description: story('product owner', 'intermediate buckets between major releases', 'themed work can split into ≤40 pt slices without forcing a giant release'),
        acceptanceCriteria: [
            '8 release columns total: v1.6 / v1.7 / v1.7.5 / v1.8 / v1.8.5 / v1.9 / v1.9.5 / v2.0',
            'Each "half" release extends the theme of the preceding major',
            'Capacity caps unchanged (amber ≥35, red ≥50)',
        ],
        type: 'improvement', priority: 'medium', points: 1,
    },
    {
        title: 'v1.6.11 — No date labels on Roadmap',
        description: story('stakeholder', 'release columns without date labels', 'aspirational releases are not read as fixed delivery commitments'),
        acceptanceCriteria: [
            'Date fields stripped from `RELEASE_WINDOWS`',
            'Roadmap headers show release key + points + items only',
            'Today pill rendering kept dormant for now',
        ],
        type: 'improvement', priority: 'medium', points: 1,
    },
    {
        title: 'v1.6.12 — Sub-dealer gate on /feature-tracking',
        description: story('admin', 'sub-dealer accounts hidden from the internal feature-tracking surface', 'planning artefacts stay internal'),
        acceptanceCriteria: [
            'Sidebar entry hidden when `parentOrganisationId` is set',
            'Page-level guard shows "Not available for sub-dealer accounts" if reached via direct URL',
            'Firestore rules permit signed-in writes (gate is client-enforced after parent-admin Firestore-rule bug)',
        ],
        type: 'improvement', priority: 'high', points: 2,
    },
    {
        title: 'v1.6.13 — MVP plan seeded into HelmLogic (108 stories)',
        description: story('product owner', 'the entire stakeholder MVP brief seeded into HelmLogic itself as Epics + Features', 'we eat our own dogfood and the plan is visible to every internal user'),
        acceptanceCriteria: [
            '6 epics + 108 features (22 user stories + 41 expansion + 14 content + 16 decisions + 16 ops)',
            'Idempotent in-app `seedMvpPlan()` button skips by epic id + feature title',
            'Source-of-truth audit applied: 4 reworded + 2 new stories (G2 import idempotency, G4 customer data export)',
            'Capacity per release within 40 pt cap',
        ],
        type: 'task', priority: 'critical', points: 6,
    },
];

export interface V16SeedSummary {
    epicCreated: boolean;
    featuresCreated: number;
    featuresSkipped: number;
}

/**
 * Seed the Platform & Tooling epic + the 13 v1.6 work stories.
 *
 * Each story ships in `status: 'shipped'`, `targetRelease: 'v1.6'`,
 * and is auto-accepted by the calling user. Idempotent — re-running
 * skips stories whose titles already exist.
 */
export async function seedV16Stories(
    firestore: Firestore,
    submitterUid: string,
    submitterName: string,
): Promise<V16SeedSummary> {
    let epicCreated = false;
    let featuresCreated = 0;
    let featuresSkipped = 0;

    // Epic — create only if missing (don't overwrite existing fields).
    const epicRef = doc(firestore, 'epics', PLATFORM_EPIC.id);
    const epicSnap = await getDoc(epicRef);
    if (!epicSnap.exists()) {
        await setDoc(epicRef, {
            title: PLATFORM_EPIC.title,
            shortLabel: PLATFORM_EPIC.shortLabel,
            description: PLATFORM_EPIC.description,
            color: PLATFORM_EPIC.color,
            order: PLATFORM_EPIC.order,
            status: PLATFORM_EPIC.status,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        epicCreated = true;
    }

    // Features — dedupe by title.
    const existing = await getDocs(collection(firestore, 'features'));
    const existingTitles = new Set<string>();
    existing.forEach(d => {
        const t = (d.data().title as string | undefined)?.trim();
        if (t) existingTitles.add(t);
    });

    for (const f of V16_FEATURES) {
        if (existingTitles.has(f.title.trim())) {
            featuresSkipped++;
            continue;
        }
        await addDoc(collection(firestore, 'features'), {
            title: f.title,
            description: f.description,
            acceptanceCriteria: f.acceptanceCriteria,
            type: f.type,
            status: 'shipped',
            priority: f.priority,
            targetRelease: 'v1.6',
            points: f.points,
            epicId: PLATFORM_EPIC.id,
            tags: [],
            voteIds: [],
            imageUrls: [],
            commentCount: 0,
            deletedAt: null,
            deletedBy: null,
            order: 0,
            submitterId: submitterUid,
            submitterName,
            // Auto-accepted at seed time — we shipped + reviewed v1.6.
            acceptedAt: serverTimestamp(),
            acceptedBy: submitterUid,
            acceptedByName: submitterName,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        featuresCreated++;
    }

    return { epicCreated, featuresCreated, featuresSkipped };
}

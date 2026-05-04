/**
 * Sales Operations backlog seed (planning, not shipped).
 *
 * Creates a NEW Epic 8 (Sales Operations) and seeds 4 new stories +
 * migrates 3 existing customer/quote stories from Epic 1 into it +
 * cross-references 2 more.
 *
 * The Sales Workspace gives reps:
 *   1. A customer-centric view (list + click → detail with deals)
 *   2. Cross-module Quotes + Contracts tables with rich sort/filter
 *
 * Pipeline-state decision: existing 1.4.x quote lifecycle states ARE
 * the pipeline. No new pipeline schema. Sales workspace just wraps
 * tooling around those states.
 *
 * 7 stories total under sub-feature 8.1.x:
 *   8.1.1 — Sales workspace shell + Customers list      v1.8.5  3 pts  NEW
 *   8.1.2 — Customer Detail Sheet                        v1.7.5  5 pts  migrate 1.5.1
 *   8.1.3 — Customer Pipeline View                       v1.8.5  8 pts  migrate 1.5.2
 *   8.1.4 — Cross-module Quotes view + filter            v1.9    5 pts  NEW
 *   8.1.5 — Cross-module Contracts view + filter         v1.9.5  3 pts  NEW
 *   8.1.6 — "My X" preset views                          v1.9.5  3 pts  migrate 1.7.2
 *   8.1.7 — Saved filter views per user                  Unsched 2 pts  NEW
 *
 * Capacity impact (NEW only — migrations don't change capacity):
 *   v1.8.5     : 44 → 47 (amber +7)
 *   v1.9       : 40 → 45 (amber +5)
 *   v1.9.5     : 38 → 41 (amber +1)
 *   Unscheduled: +2
 *
 * Idempotent: skip-by-title for new stories; migrations check titlePrefix
 * AND don't double-rename. Cross-refs skip if line already in
 * acceptanceCriteria. Run via the "Populate Sales Ops backlog" admin
 * button on the Backlog. Status='submitted' on every NEW story (proposed
 * scope, Mark + Asaf accept individually).
 */

import {
    addDoc,
    collection,
    doc,
    getDoc,
    getDocs,
    serverTimestamp,
    setDoc,
    updateDoc,
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
    targetRelease: string;
    points: number | null;
    epicId: string;
}

const story = (role: string, want: string, so: string) =>
    `<p><strong>As a</strong> ${role}<br><strong>I want</strong> ${want}<br><strong>So that</strong> ${so}.</p>`;

const SALES_EPIC: SeedEpic = {
    id: 'sales-operations',
    title: 'Sales Operations',
    shortLabel: 'Sales',
    description: 'Customer-centric workspace + cross-module Quotes/Contracts views with rich sort & filter. Wraps the existing Quote Lifecycle (1.4.x) and Customer Detail capabilities into a single sales-rep surface.',
    color: 'blue',
    order: 800,
    status: 'planning',
};

/** New stories created from scratch under Epic 8. */
const NEW_FEATURES: SeedFeature[] = [
    {
        title: '8.1.1 — Sales workspace shell + Customers list',
        description: story(
            'salesperson',
            'a single Sales workspace where I can see every customer and click into one to see their deals',
            'I have one home for sales work without bouncing between modules and pages',
        ),
        acceptanceCriteria: [
            'New /sales route + sidebar entry',
            'Tab switcher: Customers | Quotes | Contracts (URL-synced via ?tab=)',
            'Customers tab: list of every customer in the org with name, primary contact, source, last activity date',
            'Search bar (name, phone, email)',
            'Filter chips: source, salesperson, has-active-quote, last-activity-window',
            'Click a customer → opens 8.1.2 Customer Detail Sheet inline (drawer or push)',
            'Inherits existing access (whoever sees module pages today)',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v1.8.5', points: 3, epicId: 'sales-operations',
    },
    {
        title: '8.1.4 — Cross-module Quotes view with sort + filter',
        description: story(
            'sales manager',
            'every quote across every module in one table that I can sort and filter however I need',
            'I see what every rep is working on without opening each module separately',
        ),
        acceptanceCriteria: [
            'Quotes tab in /sales lists every quote across every vendor module',
            'Columns: quote number, customer, salesperson, module/vendor, brand, status (1.4.x state), value, created, sent, last touched',
            'Sortable by every column',
            'Filter chips: status, salesperson, module, brand, date range (created / sent / last touched), value range, customer',
            'Click a quote row → opens the existing quote detail / proposal flow',
            'Reads via getDocs across modules (rules-of-hooks-safe per the v1.4 trailer-dashboard pattern)',
            'Quotes capped to org scope (no cross-org leakage per Epic 5)',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v1.9', points: 5, epicId: 'sales-operations',
    },
    {
        title: '8.1.5 — Cross-module Contracts view with sort + filter',
        description: story(
            'sales manager',
            'a contracts table with the same shape as 8.1.4 Quotes',
            'I have one place to see every contract, deposit, payment milestone, and outstanding balance',
        ),
        acceptanceCriteria: [
            'Contracts tab in /sales lists every contract across every vendor module',
            'Columns: contract number, customer, salesperson, module/vendor, brand, status (Drafted / Awaiting deposit / Build in progress / etc.), value, deposit received, outstanding balance, created, settled',
            'Sortable + filter chips matching 8.1.4 plus contract-state filter + outstanding-balance > $X',
            'Click a contract row → opens the contract detail',
            'Reuses the data-aggregation pattern from 8.1.4',
            'Depends on 2.4.1 Convert Quote → Contract (v1.7.5)',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v1.9.5', points: 3, epicId: 'sales-operations',
    },
    {
        title: '8.1.7 — Saved filter views per user',
        description: story(
            'salesperson',
            'to save a filter combo as a named view ("My open >$100k quotes") and pin one as my default',
            'I jump to my working view in one click instead of re-applying filters every session',
        ),
        acceptanceCriteria: [
            'Save current filter state as a named view (per-user)',
            'View dropdown surfaces all saved views',
            'Pin one as default — that view loads automatically when entering the tab',
            'Optionally share read-only with org (other users see the view as read-only)',
            'Persists in users/{uid}/salesViews/{viewId}',
            'Covers the "My X" use case from 8.1.6 (just save a filter pinned to current user)',
        ],
        type: 'feature', priority: 'nice-to-have', targetRelease: 'Unscheduled', points: 2, epicId: 'sales-operations',
    },
];

/**
 * Migration manifest: existing stories from Epic 1 → renumber + relocate
 * to Epic 8. Find by current title prefix, update title prefix, update
 * epicId. Idempotent — skip if already migrated (title already matches
 * the new prefix).
 */
interface Migration {
    oldTitlePrefix: string;
    newTitlePrefix: string;
    newEpicId: string;
}

const MIGRATIONS: Migration[] = [
    { oldTitlePrefix: '1.5.1 — Customer Detail Sheet',     newTitlePrefix: '8.1.2 — Customer Detail Sheet',     newEpicId: 'sales-operations' },
    { oldTitlePrefix: '1.5.2 — Customer Pipeline View',    newTitlePrefix: '8.1.3 — Customer Pipeline View',    newEpicId: 'sales-operations' },
    { oldTitlePrefix: '1.7.2 — My Quotes / My Customers',  newTitlePrefix: '8.1.6 — My Quotes / My Customers',  newEpicId: 'sales-operations' },
];

const MIGRATION_AC_LINE = 'Migrated from Epic 1 sub-feature 1.5.x / 1.7.x → Epic 8 Sales Operations as part of the Sales workspace consolidation';

/** Cross-reference patches — append one line to existing stories. */
interface CrossRef {
    titlePrefix: string;
    line: string;
}

const CROSS_REFS: CrossRef[] = [
    {
        titlePrefix: '1.6.1 — Comms Log',
        line: 'Embedded inside the 8.1.2 Customer Detail Sheet as the activity timeline (no separate comms surface)',
    },
    {
        titlePrefix: '1.7.4 — Global Search',
        line: 'Search results include the 8.1.x Sales Workspace tabs (Customers / Quotes / Contracts) alongside their existing module-page targets',
    },
];

export interface SalesOpsSeedSummary {
    epicCreated: boolean;
    featuresCreated: number;
    featuresSkipped: number;
    migrationsApplied: number;
    migrationsSkipped: number;
    crossRefsApplied: number;
    crossRefsSkipped: number;
}

export async function seedSalesOpsBacklog(
    firestore: Firestore,
    submitterUid: string,
    submitterName: string,
): Promise<SalesOpsSeedSummary> {
    let epicCreated = false;
    let featuresCreated = 0;
    let featuresSkipped = 0;
    let migrationsApplied = 0;
    let migrationsSkipped = 0;
    let crossRefsApplied = 0;
    let crossRefsSkipped = 0;

    // Epic — create only if missing.
    const epicRef = doc(firestore, 'epics', SALES_EPIC.id);
    const epicSnap = await getDoc(epicRef);
    if (!epicSnap.exists()) {
        await setDoc(epicRef, {
            title: SALES_EPIC.title,
            shortLabel: SALES_EPIC.shortLabel,
            description: SALES_EPIC.description,
            color: SALES_EPIC.color,
            order: SALES_EPIC.order,
            status: SALES_EPIC.status,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        epicCreated = true;
    }

    // Single read of every feature — used for new-story dedupe + migration + cross-ref.
    const existing = await getDocs(collection(firestore, 'features'));
    const existingTitles = new Set<string>();
    interface ExistingDoc { id: string; data: any; title: string; }
    const allExisting: ExistingDoc[] = [];
    existing.forEach(d => {
        const data = d.data();
        const t = (data.title as string | undefined)?.trim() ?? '';
        if (t) existingTitles.add(t);
        allExisting.push({ id: d.id, data, title: t });
    });

    // 1. Create new features.
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

    // 2. Migrations — find by oldTitlePrefix, rename + reassign epic.
    for (const m of MIGRATIONS) {
        // Skip if a doc with the NEW prefix already exists (already migrated).
        const alreadyMigrated = allExisting.some(d => d.title.startsWith(m.newTitlePrefix));
        if (alreadyMigrated) {
            migrationsSkipped++;
            continue;
        }
        const target = allExisting.find(d => d.title.startsWith(m.oldTitlePrefix));
        if (!target) {
            migrationsSkipped++;
            continue;
        }
        // Replace the title prefix only, preserve the rest of the original title.
        const newTitle = m.newTitlePrefix + target.title.slice(m.oldTitlePrefix.length);
        const currentAc: string[] = Array.isArray(target.data.acceptanceCriteria)
            ? target.data.acceptanceCriteria
            : [];
        const acWithMigrationNote = currentAc.includes(MIGRATION_AC_LINE)
            ? currentAc
            : [...currentAc, MIGRATION_AC_LINE];
        await updateDoc(doc(firestore, 'features', target.id), {
            title: newTitle,
            epicId: m.newEpicId,
            acceptanceCriteria: acWithMigrationNote,
            updatedAt: serverTimestamp(),
        });
        migrationsApplied++;
    }

    // 3. Cross-references — append one line to existing acceptance criteria.
    for (const ref of CROSS_REFS) {
        const target = allExisting.find(d => d.title.startsWith(ref.titlePrefix));
        if (!target) {
            crossRefsSkipped++;
            continue;
        }
        const currentAc: string[] = Array.isArray(target.data.acceptanceCriteria)
            ? target.data.acceptanceCriteria
            : [];
        if (currentAc.includes(ref.line)) {
            crossRefsSkipped++;
            continue;
        }
        await updateDoc(doc(firestore, 'features', target.id), {
            acceptanceCriteria: [...currentAc, ref.line],
            updatedAt: serverTimestamp(),
        });
        crossRefsApplied++;
    }

    return {
        epicCreated,
        featuresCreated,
        featuresSkipped,
        migrationsApplied,
        migrationsSkipped,
        crossRefsApplied,
        crossRefsSkipped,
    };
}

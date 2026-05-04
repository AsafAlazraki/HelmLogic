/**
 * Quote Content Manager backlog seed (planning, not shipped).
 *
 * Seeds 4 new stories under Epic 1 sub-feature 1.8.x (Guided
 * Configuration & Quote Creation) for managing the content blocks that
 * land on the customer-facing quote PDF — extending the T&Cs-only
 * editor pattern that lives in org settings today.
 *
 * 4 stories:
 *   1.8.1 — Quote Content Block Manager (org settings)            v1.7   5 pts
 *   1.8.2 — Image upload per content block                        v1.7   2 pts
 *   1.8.4 — Quote preview button (inline PDF render)              v1.7   3 pts
 *   1.8.3 — Layout controls + "Starts on new page" toggle         v1.8   3 pts
 *
 * Capacity impact:
 *   v1.7 : 30 → 40 (at cap)
 *   v1.8 : 38 → 41 (amber +1, accepted)
 *
 * Plus a cross-reference patch to 3 existing stories already in v1.7
 * (1.2.1 / 1.2.2 / 1.2.3) — appends one acceptance-criteria line
 * pointing at the new 1.8.1 manager. Idempotent (skip if line already
 * present).
 *
 * Idempotent: skips by exact title match. Run via the "Populate Quote
 * Content Manager backlog" admin button on the Backlog. Status='submitted'
 * on every story (proposed scope, Mark + Asaf accept individually).
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
    `<p><strong>As an</strong> ${role}<br><strong>I want</strong> ${want}<br><strong>So that</strong> ${so}.</p>`;

const FEATURES: SeedFeature[] = [
    {
        title: '1.8.1 — Quote Content Block Manager (org settings)',
        description: story(
            'admin',
            'every content block that lands on a customer-facing quote managed from one place in org settings (extending the T&Cs editor pattern)',
            'business users can keep proposal copy fresh without engineering involvement',
        ),
        acceptanceCriteria: [
            'New /settings/content section (or tab on the existing settings page) lists every content block that the proposal renderer consumes',
            'Initial blocks: cover letter / personalised salesperson message, brand intro, model story, end-to-end ownership support, after-sales confidence, finance & insurance, value summary, T&Cs, payment plan expectations, receipt branding, deposit confirmation copy',
            'Each block: title, body (TipTap rich-text editor reused from Feature Tracking), brand picker (Org-wide default + optional per-brand override per 1.2.2)',
            'Save on blur with dirty indicator (per v1.5 lesson — never write per-keystroke)',
            'Version history per block: date, actor, prev → new (foundation for 5.5.1 Activity Log)',
            'Reads + writes to organisations/{orgId}/contentBlocks/{blockId}; per-brand overrides nested at organisations/{orgId}/contentBlocks/{blockId}/brandOverrides/{brandId}',
            'Quote PDF render reads from this collection (replaces hardcoded copy constants in 1.2.1)',
            'Existing T&Cs editor migrates into this surface — no separate T&Cs page',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v1.7', points: 5, epicId: 'guided-configuration',
    },
    {
        title: '1.8.2 — Image upload per content block',
        description: story(
            'admin',
            'to embed images directly in a content block alongside its text',
            'visual content (hero photos, brand imagery, payment-plan diagrams) lives with the copy that frames it',
        ),
        acceptanceCriteria: [
            'TipTap editor extension for inline image upload (drag-drop or paste URL)',
            'Stored in Firebase Storage at organisations/{orgId}/contentBlocks/{blockId}/',
            'Inline rendering in the editor + the rendered PDF',
            'Max 10 images per block (consistency with feature tracking)',
            'External URLs use native <img> per the v1.4 Cloudflare-anti-hotlinking lesson',
            'Image gets a stable storage path tied to the block id, so editing copy doesn\'t orphan images',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v1.7', points: 2, epicId: 'guided-configuration',
    },
    {
        title: '1.8.4 — Quote preview button (inline PDF render)',
        description: story(
            'salesperson / admin',
            'a Preview button on the quote builder + each content block editor that pops up the rendered quote inline',
            'I can iterate on copy / config and see exactly how it lands on the PDF without going to finalize and back',
        ),
        acceptanceCriteria: [
            '"Preview" button on the quote builder header (near Finalize) and on each content block in the manager',
            'Click → modal/sheet renders the actual proposal PDF inline using the existing ProposalPDFDocument component',
            'Preview reflects current draft state — content block changes, customer details, configured boat — without requiring a save first',
            'Close → back to the prior edit state, no data lost',
            'Repeatable: edit → preview → edit → preview is a fast loop, no tab-switching',
            'Uses buildQuoteFinancials() to populate financials per the v1.4 lesson',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v1.7', points: 3, epicId: 'guided-configuration',
    },
    {
        title: '1.8.3 — Content block layout controls + "Starts on new page" toggle',
        description: story(
            'admin',
            'each content block to have layout choices (header style + body) plus a page-break-before flag',
            'a long block doesn\'t get split awkwardly across pages and visual hierarchy is consistent',
        ),
        acceptanceCriteria: [
            'Per-block: header style picker (H1 / H2 / H3 / no header)',
            'Per-block: structured body that supports headers + paragraphs underneath the chosen header',
            'Per-block: "Starts on new page" toggle. When true, the PDF renderer pushes this block onto a fresh page (react-pdf <View break>)',
            'Editor shows a visual hint where page breaks land in the PDF (e.g. "↩ Page break before this block")',
            'PDF renderer respects all layout choices — header style, structured body, page-break-before',
            'Default for new blocks: H2 header + paragraph body, no forced page break',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v1.8', points: 3, epicId: 'guided-configuration',
    },
];

/**
 * Cross-reference patches for existing v1.7 stories. Appends a single
 * acceptance-criteria line per story so future readers (and the auditor)
 * see the link from "we generate a PDF" → "and the copy is managed via
 * the new 1.8.1 surface."
 */
interface ExistingPatch {
    titlePrefix: string;
    line: string;
}

const EXISTING_PATCHES: ExistingPatch[] = [
    {
        titlePrefix: '1.2.1 — Branded PDF Quote Generation',
        line: 'Content blocks read from the Quote Content Block Manager (1.8.1) — no hardcoded copy constants',
    },
    {
        titlePrefix: '1.2.2 — Brand-Aware Content Injection',
        line: 'Per-brand overrides defined in the Quote Content Block Manager (1.8.1) drive the brand-specific content',
    },
    {
        titlePrefix: '1.2.3 — Controlled Personalisation',
        line: 'Editable vs system-locked content boundaries defined in the Quote Content Block Manager (1.8.1)',
    },
];

export interface QuoteContentManagerSeedSummary {
    featuresCreated: number;
    featuresSkipped: number;
    existingPatched: number;
    existingPatchedSkipped: number;
}

/**
 * Seed the 4 Quote Content Manager backlog items + patch the 3 existing
 * cross-referenced stories. Idempotent — re-running skips entries whose
 * titles already exist and skips patches whose target line already
 * appears in the existing acceptanceCriteria array.
 *
 * Stories ship in `status: 'submitted'` (proposed scope, not accepted).
 * Mark + Asaf accept each one through the standard Accept button as
 * they review.
 */
export async function seedQuoteContentManagerBacklog(
    firestore: Firestore,
    submitterUid: string,
    submitterName: string,
): Promise<QuoteContentManagerSeedSummary> {
    let featuresCreated = 0;
    let featuresSkipped = 0;
    let existingPatched = 0;
    let existingPatchedSkipped = 0;

    // List existing features once — used for both dedupe + patching.
    const existing = await getDocs(collection(firestore, 'features'));
    const existingTitles = new Set<string>();
    const existingByPrefix = new Map<string, { id: string; data: any }>();
    existing.forEach(d => {
        const data = d.data();
        const t = (data.title as string | undefined)?.trim();
        if (!t) return;
        existingTitles.add(t);
        for (const p of EXISTING_PATCHES) {
            if (t.startsWith(p.titlePrefix)) {
                existingByPrefix.set(p.titlePrefix, { id: d.id, data });
            }
        }
    });

    // Create new features.
    for (const f of FEATURES) {
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

    // Patch existing 1.2.1 / 1.2.2 / 1.2.3 with the cross-reference line.
    for (const p of EXISTING_PATCHES) {
        const target = existingByPrefix.get(p.titlePrefix);
        if (!target) {
            existingPatchedSkipped++;
            continue;
        }
        const currentList: string[] = Array.isArray(target.data.acceptanceCriteria)
            ? target.data.acceptanceCriteria
            : [];
        if (currentList.some(line => line === p.line)) {
            existingPatchedSkipped++;
            continue;
        }
        await updateDoc(doc(firestore, 'features', target.id), {
            acceptanceCriteria: [...currentList, p.line],
            updatedAt: serverTimestamp(),
        });
        existingPatched++;
    }

    return { featuresCreated, featuresSkipped, existingPatched, existingPatchedSkipped };
}

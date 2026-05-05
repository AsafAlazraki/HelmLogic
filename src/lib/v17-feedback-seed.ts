/**
 * v1.7 user-feedback seed (post-1.8.1-Phase-D, planning-only).
 *
 * Single-shot Backlog admin button that:
 *
 *   1. Adds 5 NEW stories under sub-feature 1.8.x (epic
 *      guided-configuration) capturing the user-feedback batch
 *      from after seeing 1.8.1 + 1.2.1 first-cut on dev:
 *        • 1.8.5 — Unified Document Templates surface         (v1.7, 3 pts)
 *        • 1.8.6 — Multi-document-type field on content blocks (v1.7, 3 pts)
 *        • 1.8.7 — Live PDF preview pane in the editor         (v1.7, 5 pts)
 *        • 1.8.8 — Extended rich-text controls                 (v1.8, 2 pts)
 *        • 1.8.9 — Adopt Document Templates page aesthetic     (v1.7, 2 pts)
 *
 *   2. RETARGETS 5 existing stories OUT of v1.7 (which is at 20-pt cap and
 *      now needs to absorb 1.8.5/1.8.6/1.8.7/1.8.9 = 13 new pts):
 *        • 1.2.1 v1.7 → v1.8  (Branded PDF Quote Generation)
 *        • 1.2.2 v1.7 → v1.8  (Brand-Aware Content Injection)
 *        • 6.4.1 v1.7 → v1.8  (dependsOn schema + UI validation)
 *        • 6.4.2 v1.7 → v1.8  (Pre-merge regex check)
 *        • 6.4.3 v1.7 → v1.8  (DEPENDS ON convention — doc-only)
 *
 * Net v1.7 composition (editor-focused, 18 pts, under cap):
 *   1.8.1 (5) + 1.8.5 (3) + 1.8.6 (3) + 1.8.7 (5) + 1.8.9 (2) = 18 pts ✓
 *
 * Net v1.8 (over cap, accepted — needs a separate rebalance pass):
 *   Existing v1.8 (20 pts: 1.1.2/1.1.3/1.2.3/1.2.4/1.8.2/1.8.3/1.3.1)
 *   + Incoming (17 pts: 1.2.1=8, 1.2.2=3, 1.8.8=2, 6.4.1=3, 6.4.2=1, 6.4.3=0)
 *   = 37 pts — flagged in the post-seed toast for follow-up rebalance.
 *
 * Idempotent everywhere:
 *   - New stories: skip if a doc already has the same title
 *   - Retargets: only writes if existing targetRelease differs
 *   - Reports retargetsMissed[] in the toast/console
 *
 * Run via "Apply v1.7 user-feedback" admin button on the Backlog.
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
 * NEW STORIES — 5 total
 *
 * All in sub-feature 1.8.x, epic guided-configuration. The 1.8.x
 * series originated with the Quote Content Manager seed (1.8.1-1.8.4);
 * 1.8.5-1.8.9 are this user-feedback batch.
 *
 * "DEPENDS ON x.y.z" prefix used per the v1.7 6.4.3 convention
 * (which itself ships in v1.8 — using it now as the canonical form).
 * ────────────────────────────────────────────────────────────────── */

const NEW_FEATURES: SeedFeature[] = [
    {
        title: '1.8.5 — Unified Document Templates surface',
        description: story(
            'org admin',
            'a single Document Templates tab in /manage that houses both Quote and Contract authoring, with sub-tabs for each',
            'I don\'t have to context-switch between two different tabs to manage related document content',
        ),
        acceptanceCriteria: [
            'The standalone "Quote Content" tab is removed from /manage',
            'Document Templates tab gains sub-tabs for "Quote" and "Contract"',
            'Each sub-tab renders the master-detail content-block UI from 1.8.1',
            'Existing 1.8.1 auto-migration of organisation.termsAndConditions still works (creates a terms-and-conditions block tagged for both Quote and Contract — see 1.8.6)',
            'Aesthetic matches the existing Document Templates page (dark-banded card header, side info panel) per 1.8.9',
            'DEPENDS ON 1.8.1',
        ],
        type: 'improvement', priority: 'high', targetRelease: 'v1.7', points: 3, epicId: 'guided-configuration',
    },
    {
        title: '1.8.6 — Multi-document-type field on content blocks',
        description: story(
            'org admin',
            'each content block to be tagged with which documents it appears on (quote, contract, or both)',
            'I can author shared content once or split it per document type as I prefer',
        ),
        acceptanceCriteria: [
            'New schema field on contentBlocks: `documentTypes: (\'quote\' | \'contract\')[]` — at least one entry required',
            'Editor UI shows a multi-select chip group ("Quote" / "Contract") on each block — selected = renders on that doc type',
            'Default for new blocks: ["quote"] (current behaviour preserved)',
            'Auto-migrated terms-and-conditions block defaults to ["quote", "contract"] (T&Cs apply to both)',
            'Block list under each Document Templates sub-tab filters by documentTypes.includes(currentTab)',
            'For per-document differences: author creates two blocks of the same blockType, one tagged "quote" only, one tagged "contract" only',
            'PDF render (1.2.1 in v1.8) filters resolved blocks by documentTypes during quote / contract generation',
            'DEPENDS ON 1.8.5',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v1.7', points: 3, epicId: 'guided-configuration',
    },
    {
        title: '1.8.7 — Live PDF preview pane in the editor',
        description: story(
            'org admin',
            'a live multi-page PDF preview alongside the editor that updates as I type',
            'I can see exactly how my content will appear on the customer PDF before saving — no need to build a quote and download to verify',
        ),
        acceptanceCriteria: [
            'Right panel of the editor renders a scrollable PDF preview (full multi-page layout, all 7 content-block sections in their positions)',
            'Uses the same TipTap-to-PDF renderer as the customer PDF (lib/tiptap-pdf.tsx, shared)',
            'No quote payload required — preview is content-blocks-only with neutral placeholder layout for non-content sections (cover, vessel config, pricing)',
            'Updates as the user types in the TipTap editor (debounced ~500ms to keep the iframe re-render cost manageable)',
            'Reflects current draft state (not just last saved) so the author sees in-progress edits',
            'When in brand-override mode, preview shows the override content for that brand',
            'Pages clearly delimited; user can scroll all 3 pages',
            'DEPENDS ON 1.8.1',
        ],
        type: 'feature', priority: 'high', targetRelease: 'v1.7', points: 5, epicId: 'guided-configuration',
    },
    {
        title: '1.8.8 — Extended rich-text controls',
        description: story(
            'org admin',
            'more formatting options in the content-block editor (text colour, alignment, strikethrough, underline, more heading levels)',
            'I can match the visual richness of marketing-grade copy without dropping back to plain text',
        ),
        acceptanceCriteria: [
            'TipTap editor extends FeatureRichTextEditor (or new variant) with: text colour picker, alignment (left/center/right/justify), strikethrough, underline, H4-H6 heading levels',
            'Toolbar redesigned to fit additional controls without overflow on 1280px-wide screens',
            'TipTap-to-PDF renderer (lib/tiptap-pdf.tsx) extended to handle the new tags + style attributes',
            'Existing content (authored before this story) renders unchanged',
            'DEPENDS ON 1.8.1',
        ],
        type: 'improvement', priority: 'medium', targetRelease: 'v1.8', points: 2, epicId: 'guided-configuration',
    },
    {
        title: '1.8.9 — Adopt Document Templates page aesthetic',
        description: story(
            'org admin',
            'the content-block editor to use the same visual design as the existing Document Templates page (dark-banded headers, side info panels, two-column layout)',
            'the new authoring surface feels consistent with the rest of /manage rather than like a different app',
        ),
        acceptanceCriteria: [
            'Block detail panel uses the dark-banded card header pattern (NAVY background, white text)',
            'Side info panel renders ("Where this appears" / version count / brand-override status) — small card alongside main content',
            'Two-column layout: editor left, info/preview right (works alongside 1.8.7\'s preview pane)',
            'Section body is scrollable within the section, NOT page-level scroll — the /manage page scaffolding stays put while the editor scrolls',
            'Visual diff: matches the screenshot you reviewed (Company Templates / Terms & Conditions / PDF Preview / Where This Appears)',
            'DEPENDS ON 1.8.5',
        ],
        type: 'improvement', priority: 'medium', targetRelease: 'v1.7', points: 2, epicId: 'guided-configuration',
    },
];

/* ──────────────────────────────────────────────────────────────────
 * RETARGETS — 5 stories OUT of v1.7 (capacity rebalance)
 * ────────────────────────────────────────────────────────────────── */

interface Retarget {
    prefix: string;
    release: string;
}

const RETARGETS: Retarget[] = [
    { prefix: '1.2.1 — Branded PDF Quote Generation',  release: 'v1.8' },
    { prefix: '1.2.2 — Brand-Aware Content Injection', release: 'v1.8' },
    { prefix: '6.4.1 — Feature dependsOn schema',      release: 'v1.8' },
    { prefix: '6.4.2 — Pre-merge regex check',         release: 'v1.8' },
    { prefix: '6.4.3 — "DEPENDS ON x.y.z"',            release: 'v1.8' },
];

/* ──────────────────────────────────────────────────────────────────
 * SEED RUNNER
 * ────────────────────────────────────────────────────────────────── */

export interface FeedbackSeedSummary {
    featuresCreated: number;
    featuresSkipped: number;
    retargetsApplied: number;
    retargetsSkipped: number;
    retargetsMissed: string[];
}

export async function applyV17FeedbackSeed(
    firestore: Firestore,
    submitterUid: string,
    submitterName: string,
): Promise<FeedbackSeedSummary> {
    let featuresCreated = 0;
    let featuresSkipped = 0;
    let retargetsApplied = 0;
    let retargetsSkipped = 0;
    const retargetsMissed: string[] = [];

    /* 1. Single read for new-story dedupe + retarget. */
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
        if (currentRelease === r.release) {
            retargetsSkipped++;
            continue;
        }
        await updateDoc(doc(firestore, 'features', target.id), {
            targetRelease: r.release,
            updatedAt: serverTimestamp(),
        });
        retargetsApplied++;
    }

    return {
        featuresCreated,
        featuresSkipped,
        retargetsApplied,
        retargetsSkipped,
        retargetsMissed,
    };
}

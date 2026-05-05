/**
 * v1.7 story-review seed (post-feature-build, planning-only).
 *
 * One-shot Backlog button that updates existing story docs to reflect
 * what actually shipped to dev during the v1.7 build cycle. No new
 * stories created; just acceptance-criteria appends + a points
 * adjustment on 1.2.1 (since most of its scope landed in v1.7 already).
 *
 * Updates:
 *
 *   1.8.7 — Live PDF preview pane in the editor
 *     APPEND acceptance: "✓ v1.7 ship: preview now renders the full
 *      customer-facing ProposalPDFDocument fed by a Highfield CL340
 *      fixture (not a stripped-down preview). Real org logos, real
 *      pricing layout, real content-block render slots."
 *     Points unchanged (5).
 *
 *   1.2.1 — Branded PDF Quote Generation
 *     APPEND acceptance: "✓ v1.7 PDF render layer pulled forward
 *      (commit 00e35ff): all 7 content-block sections (salesperson-
 *      message, why-us, brand-story, after-sales, finance-info,
 *      value-summary, terms-and-conditions) now render in proposal-
 *      pdf.tsx at their planned positions. Data path (contentBlocks
 *      prop + caller fetch) wired in commit f70796e."
 *     Points 8 → 3 (remaining v1.8 work is brand-injection
 *      coordination with 1.2.2 + polish, not the bulk render layer).
 *
 *   1.8.1 / 1.8.5 / 1.8.6 / 1.8.9 — already shipped to dev
 *     APPEND acceptance: "✓ Shipped to dev branch
 *      (claude/app-overview-wKiZ1) on 2026-05-04. Verified by Asaf
 *      end-to-end. Awaiting v1.7 dev → main PR." Points unchanged.
 *
 * v1.8 capacity flag (NOT auto-fixed):
 *   1.2.1 reduction (8 → 3) = -5 pts off v1.8. v1.8 was 37 pts after
 *   feedback retarget; now 32. Still over-cap by 12. Needs a
 *   dedicated rebalance pass before v1.8 build kicks off.
 *
 * Idempotent — only writes if the new acceptance line isn't already
 * present (skip-if-includes check).
 */

import {
    collection,
    doc,
    getDocs,
    serverTimestamp,
    updateDoc,
    type Firestore,
} from 'firebase/firestore';

interface StoryUpdate {
    /** Title prefix (matches whatever sits in Firestore). */
    titlePrefix: string;
    /** New acceptance lines to append (skipped if already present). */
    appendAcceptance: string[];
    /** Optional points override. */
    points?: number;
}

const UPDATES: StoryUpdate[] = [
    {
        titlePrefix: '1.8.7 — Live PDF preview pane',
        appendAcceptance: [
            '✓ v1.7 ship: preview renders the full customer-facing ProposalPDFDocument fed by a Highfield CL340 fixture (real org logos, real pricing layout, real content-block render slots) — not a stripped-down preview',
        ],
    },
    {
        titlePrefix: '1.2.1 — Branded PDF Quote Generation',
        appendAcceptance: [
            '✓ v1.7 PDF render layer pulled forward (commit 00e35ff): all 7 content-block sections (salesperson-message, why-us, brand-story, after-sales, finance-info, value-summary, terms-and-conditions) now render in proposal-pdf.tsx at their planned positions',
            '✓ v1.7 data-path wiring (commit f70796e): contentBlocks prop on ProposalPDFDocument + resolver fetch in finalize-quote-dialog + proposal-view callers',
            'v1.8 remaining scope: brand-aware injection coordination with 1.2.2 + polish on placement/spacing across the 7 sections',
        ],
        points: 3,
    },
    {
        titlePrefix: '1.8.1 — Quote Content Block Manager',
        appendAcceptance: [
            '✓ v1.7 ship: Phases A-D shipped to dev (claude/app-overview-wKiZ1). Schema + types + resolver, org-settings tab + auto-migration, TipTap editor + version history + brand overrides. Verified end-to-end.',
        ],
    },
    {
        titlePrefix: '1.8.5 — Unified Document Templates surface',
        appendAcceptance: [
            '✓ v1.7 ship: Document Templates tab now houses Quote + Contract sub-tabs; standalone Quote Content tab removed; legacy T&Cs textarea retired (auto-migration covers data preservation).',
        ],
    },
    {
        titlePrefix: '1.8.6 — Multi-document-type field',
        appendAcceptance: [
            '✓ v1.7 ship: documentTypes field on contentBlock schema, multi-select chip group ("Quote" / "Contract") in editor, sub-tab filtering applied across list / detail / preview / resolver. Auto-migrated T&Cs default to both.',
        ],
    },
    {
        titlePrefix: '1.8.9 — Adopt Document Templates page aesthetic',
        appendAcceptance: [
            '✓ v1.7 ship: NAVY dark-banded card header on the editor, two-column layout with side info card, scrollable section body. Matches the existing Document Templates Template-Studio header card.',
        ],
    },
];

/* ──────────────────────────────────────────────────────────────────
 * SEED RUNNER
 * ────────────────────────────────────────────────────────────────── */

export interface StoryReviewSummary {
    storiesUpdated: number;
    storiesSkipped: number;
    pointsAdjusted: number;
    storiesMissed: string[];
}

export async function applyV17StoryReview(firestore: Firestore): Promise<StoryReviewSummary> {
    let storiesUpdated = 0;
    let storiesSkipped = 0;
    let pointsAdjusted = 0;
    const storiesMissed: string[] = [];

    const existing = await getDocs(collection(firestore, 'features'));
    interface ExistingDoc { id: string; data: any; title: string; }
    const allExisting: ExistingDoc[] = [];
    existing.forEach(d => {
        const data = d.data();
        const t = (data.title as string | undefined)?.trim() ?? '';
        allExisting.push({ id: d.id, data, title: t });
    });

    for (const u of UPDATES) {
        const target = allExisting.find(d => d.title.startsWith(u.titlePrefix));
        if (!target) {
            storiesMissed.push(u.titlePrefix);
            continue;
        }

        const currentAc: string[] = Array.isArray(target.data.acceptanceCriteria)
            ? target.data.acceptanceCriteria
            : [];
        const newLines = u.appendAcceptance.filter(line => !currentAc.includes(line));
        const pointsDiffer = u.points !== undefined && (target.data.points ?? null) !== u.points;

        if (newLines.length === 0 && !pointsDiffer) {
            storiesSkipped++;
            continue;
        }

        const patch: Record<string, any> = { updatedAt: serverTimestamp() };
        if (newLines.length > 0) patch.acceptanceCriteria = [...currentAc, ...newLines];
        if (pointsDiffer) {
            patch.points = u.points;
            pointsAdjusted++;
        }
        await updateDoc(doc(firestore, 'features', target.id), patch);
        storiesUpdated++;
    }

    return { storiesUpdated, storiesSkipped, pointsAdjusted, storiesMissed };
}

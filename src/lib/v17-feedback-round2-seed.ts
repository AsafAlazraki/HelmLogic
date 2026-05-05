/**
 * v1.7 round-2 feedback seed (planning-only).
 *
 * One-shot button that captures Asaf's feedback after seeing
 * the 1.8.7 preview on dev — adds 2 new stories:
 *
 *   1.8.10 (v1.7, 3 pts) — Real catalog data in PDF preview.
 *      Currently the preview uses a hardcoded fixture (Highfield
 *      CL340, Yamaha F150, etc.). User wants real data: pull a
 *      real model from the org's catalog (cover image, specs,
 *      standardFeatures, variant). Eliminates the "ugly white bar
 *      and gradient" of the no-cover-image fallback because real
 *      models have real images.
 *
 *   1.8.11 (v1.8, 8 pts) — Drag-and-drop reorder of all PDF sections.
 *      Currently the section order is hardcoded in proposal-pdf.tsx.
 *      User wants reorderability for BOTH content blocks AND existing
 *      system sections (vessel config, pricing table, signatures).
 *      Substantial — proposal-pdf becomes data-driven from a
 *      pageStructure schema; new drag-handles + persistence; needs
 *      a design pass before build. Lands in v1.8 alongside 1.2.1's
 *      brand-injection polish.
 *
 * Idempotent — skip-by-title for new stories.
 *
 * No retargets in this seed — v1.7 grows from 18 → 21 pts (1.8.10 +3),
 * which is amber +1 above the 20-pt cap. Accepted because 1.8.10
 * directly fixes the preview the user just flagged. v1.8 already
 * needs a separate rebalance pass, so 1.8.11 (+8) is captured but
 * not retargeting current v1.8 scope here.
 */

import {
    addDoc,
    collection,
    getDocs,
    serverTimestamp,
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

const NEW_FEATURES: SeedFeature[] = [
    {
        title: '1.8.10 — Real catalog data in PDF preview',
        description: story(
            'org admin',
            'the live PDF preview to use a real boat model from my catalog (real cover image, real specs, real variant) instead of a hardcoded fixture',
            'I see exactly what my customers will see — and the preview looks polished from the moment I open it (no awkward "no image" gradient fallback)',
        ),
        acceptanceCriteria: [
            'Preview component fetches a real model from the org\'s catalog instead of using buildSampleQuoteFixture\'s hardcoded Highfield CL340',
            'Strategy: pick the first enabledModule the org has, find that module\'s mainVendorId, query data-warehouse/{vendorId}/ranges for the first range, then the first model with a coverImageUrl set',
            'If found: pass real model data (modelName, modelCode, coverImageUrl, specifications, standardFeatures) + first variant (sellPriceExclGst, material, colorName) to ProposalPDFDocument',
            'Fall back to the fixture if anything in the chain is missing (no enabled modules, no models with cover images, etc.)',
            'Customer + motor + trailer + financials can stay synthetic — the cover image / model name / specs are what the user mostly cares about',
            'Loading state shown while the fetch is in flight (~1-2s typical)',
            'DEPENDS ON 1.8.7',
        ],
        type: 'improvement',
        priority: 'high',
        targetRelease: 'v1.7',
        points: 3,
        epicId: 'guided-configuration',
    },
    {
        title: '1.8.11 — Drag-and-drop reorder of all PDF sections',
        description: story(
            'org admin',
            'to drag-and-drop the order of every section on the customer PDF — both the content blocks I author AND the existing fixed sections (cover, vessel config, pricing, T&Cs, signatures)',
            'I can sequence the proposal narrative my way (e.g. price first, story after; or specs before brand) without being stuck with the default layout',
        ),
        acceptanceCriteria: [
            'New schema: pageStructure: { id, blockType, order, enabled, page }[] on either contentBlocks (extending) or a sibling subcollection (separate). Decision: separate subcollection organisations/{orgId}/pdfPageStructure/{id} so system-block reorderability doesn\'t pollute the content-block schema',
            'pageStructure includes BOTH org-authored content blocks AND system blocks (cover, vessel-config, pricing-table, signatures). System blocks are seeded with sensible defaults; org admin can reorder',
            'Drag handles on every block in the editor master list (left panel)',
            'proposal-pdf.tsx becomes data-driven — no more hardcoded section positions. Each section reads its order + page assignment from the org\'s pageStructure',
            'Optimistic UI: reorder appears immediately; persists to Firestore on drop (fractional-index approach from v1.5 Kanban drag-drop, applied here)',
            'PDF preview (1.8.7) updates to reflect new order on drop',
            'Reset-to-defaults button restores the canonical order',
            'Substantial scope — needs a 30-min design discussion before build kicks off',
            'DEPENDS ON 1.8.5 (unified Document Templates) + 1.2.1 (PDF render layer)',
        ],
        type: 'feature',
        priority: 'high',
        targetRelease: 'v1.8',
        points: 8,
        epicId: 'guided-configuration',
    },
];

export interface FeedbackRound2Summary {
    featuresCreated: number;
    featuresSkipped: number;
}

export async function applyV17FeedbackRound2(
    firestore: Firestore,
    submitterUid: string,
    submitterName: string,
): Promise<FeedbackRound2Summary> {
    let featuresCreated = 0;
    let featuresSkipped = 0;

    const existing = await getDocs(collection(firestore, 'features'));
    const existingTitles = new Set<string>();
    existing.forEach(d => {
        const t = (d.data().title as string | undefined)?.trim() ?? '';
        if (t) existingTitles.add(t);
    });

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

    return { featuresCreated, featuresSkipped };
}

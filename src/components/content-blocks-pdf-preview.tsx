'use client';

/**
 * Content Blocks PDF Preview (v1.7 — story 1.8.7).
 *
 * Renders the full customer-facing ProposalPDFDocument inside an
 * in-browser PDFViewer using a hardcoded Highfield Sport 560
 * fixture, with one targeted live fetch: the cover image URL.
 * That comes from the org's actual Highfield Sport range in
 * data-warehouse so the hero photo is the real boat — not an
 * Unsplash stock photo. Falls back to the Unsplash placeholder
 * baked into the fixture if the lookup fails.
 *
 * Anchoring to a fixed Highfield path is intentional for v1.7 —
 * NSM is the primary user, Highfield is their main brand. v1.7.5
 * polish can generalise per org's enabled modules.
 */

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, limit, query } from 'firebase/firestore';
import { PDFViewer } from '@react-pdf/renderer';
import { useFirestore, useMemoFirebase, useUser } from '@/firebase/provider';
import { useDoc } from '@/firebase/firestore/use-doc';
import { ProposalPDFDocument } from '@/components/proposal-pdf';
import {
    blockBelongsTo,
    type BlockType,
    type ContentBlock,
    type DocumentType,
} from '@/lib/content-blocks';
import { buildSampleQuoteFixture } from '@/lib/sample-quote-fixture';
import type { SalesTeamMember } from '@/lib/sales-team';

/** Hardcoded Highfield Sport range IDs (per CLAUDE.md). The preview
 *  fetches one model from this range and uses its real coverImageUrl. */
const HIGHFIELD_VENDOR_ID = 'LafOLpLb6QIFE856TiD4';
const SPORT_RANGE_ID = 'nQ2LE50z9Tbf2uss0Ote';

interface Props {
    /** v1.7 (1.8.12) — needed to resolve the current user's salesperson
     *  profile for the preview's salesperson-message section. */
    orgId: string;
    blocks: ContentBlock[] | null;
    documentType: DocumentType;
    organisationName?: string;
    primaryLogoUrl?: string | null;
    secondaryLogoUrl?: string | null;
    enabledModuleSubscriptions?: string[] | null;
    pdfSections?: import('@/lib/pdf-structure').PdfStructureSection[];
}

export function ContentBlocksPdfPreview({ orgId, blocks, documentType, organisationName, primaryLogoUrl, secondaryLogoUrl, pdfSections }: Props) {
    const firestore = useFirestore();
    const { user } = useUser();
    const [heroImageUrl, setHeroImageUrl] = useState<string | null>(null);

    /** v1.7 (1.8.12) — preview uses the CURRENT user's salesperson profile
     *  so each salesman sees their own message + photo. If unauthored,
     *  the salesperson-message section is omitted (same as real PDFs). */
    const salespersonRef = useMemoFirebase(
        () => (user?.uid ? doc(firestore, `organisations/${orgId}/salesTeam/${user.uid}`) : null),
        [firestore, orgId, user?.uid],
    );
    const { data: salespersonProfile } = useDoc<SalesTeamMember>(salespersonRef);

    /** Fetch the real Highfield Sport 560 cover image URL once on mount.
     *  Tries to match a model name containing "560" first (Sport 560 if
     *  it exists); otherwise picks the first model with a coverImageUrl.
     *  Quietly falls back to the fixture's Unsplash URL on any failure. */
    useEffect(() => {
        let cancelled = false;
        async function fetchHeroImage() {
            try {
                const snap = await getDocs(query(
                    collection(firestore, `data-warehouse/${HIGHFIELD_VENDOR_ID}/ranges/${SPORT_RANGE_ID}/models`),
                    limit(20),
                ));
                if (cancelled || snap.empty) return;
                const sport560 = snap.docs.find(d => {
                    const data = d.data();
                    const name = ((data.name ?? data.modelCode ?? '') as string).toLowerCase();
                    return /\b560\b|sp560/.test(name) && !!data.coverImageUrl;
                });
                const fallback = snap.docs.find(d => !!d.data().coverImageUrl);
                const pick = sport560 ?? fallback;
                if (pick && !cancelled) {
                    setHeroImageUrl(pick.data().coverImageUrl ?? null);
                }
            } catch (e) {
                console.warn('[preview] Highfield Sport 560 image fetch failed; falling back to Unsplash:', e);
            }
        }
        fetchHeroImage();
        return () => { cancelled = true; };
    }, [firestore]);

    /** Resolve content blocks → blockType → html map for the active
     *  documentType. No brand-override resolution in the preview path. */
    const contentBlocksMap = useMemo(() => {
        const m = new Map<BlockType, { html: string; updatedAt: number }>();
        for (const b of blocks ?? []) {
            if (!b.blockType) continue;
            if (!blockBelongsTo(b, documentType)) continue;
            const html = b.html ?? '';
            if (!html.trim()) continue;
            const t = (b.updatedAt as any)?.toMillis?.() ?? 0;
            const existing = m.get(b.blockType);
            if (!existing || t > existing.updatedAt) m.set(b.blockType, { html, updatedAt: t });
        }
        const result: Partial<Record<BlockType, string>> = {};
        m.forEach((v, k) => { result[k] = v.html; });
        return result;
    }, [blocks, documentType]);

    /** Hardcoded fixture — Highfield Sport 560 with full options. The
     *  cover image URL is overridden by the real Highfield Sport 560
     *  image when the fetch succeeds. */
    const fixture = useMemo(
        () => {
            const base = buildSampleQuoteFixture({
                organisationName,
                primaryLogoUrl,
                secondaryLogoUrl,
                vendorId: null,
            });
            if (heroImageUrl) {
                base.quote.coverImageUrl = heroImageUrl;
            }
            return base;
        },
        [organisationName, primaryLogoUrl, secondaryLogoUrl, heroImageUrl],
    );

    return (
        <div className="w-full h-full min-h-[640px] rounded-lg overflow-hidden border bg-slate-100">
            <PDFViewer
                style={{ width: '100%', height: '100%', minHeight: 640, border: 0 }}
                showToolbar={false}
            >
                <ProposalPDFDocument
                    quote={fixture.quote}
                    organisation={fixture.organisation}
                    financials={fixture.financials}
                    contentBlocks={contentBlocksMap}
                    pdfSections={pdfSections}
                    salespersonProfile={salespersonProfile ?? undefined}
                />
            </PDFViewer>
        </div>
    );
}

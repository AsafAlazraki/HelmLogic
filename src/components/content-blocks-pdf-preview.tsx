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
import { Button } from '@/components/ui/button';
import { Maximize2, Minimize2, X } from 'lucide-react';
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
    /** v1.7 — header strip shown above the inline PDF (title + sub +
     *  Focus button). Set false to render the bare PDFViewer if the
     *  caller wants its own chrome. */
    showHeader?: boolean;
}

export function ContentBlocksPdfPreview({ orgId, blocks, documentType, organisationName, primaryLogoUrl, secondaryLogoUrl, pdfSections, showHeader = true }: Props) {
    const firestore = useFirestore();
    const { user } = useUser();
    const [heroImageUrl, setHeroImageUrl] = useState<string | null>(null);
    /** v1.7 — focus mode toggle: when true, preview takes over the
     *  full viewport with a top toolbar (mirrors the
     *  highfield-pricing-workspace focus pattern). */
    const [focusMode, setFocusMode] = useState(false);

    /** ESC closes focus mode. */
    useEffect(() => {
        if (!focusMode) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFocusMode(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [focusMode]);

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

    /** Single document instance — referenced by both inline AND focus-mode
     *  PDFViewers. We only RENDER one PDFViewer at a time (focus mode hides
     *  the inline one) to avoid the double-render lag the user flagged. */
    const docElement = (
        <ProposalPDFDocument
            quote={fixture.quote}
            organisation={fixture.organisation}
            financials={fixture.financials}
            contentBlocks={contentBlocksMap}
            pdfSections={pdfSections}
            salespersonProfile={salespersonProfile ?? undefined}
        />
    );

    return (
        <>
            <div className="rounded-[1.5rem] overflow-hidden border-2 shadow-sm bg-white">
                {showHeader && (
                    <div className="px-4 py-3 border-b bg-muted/5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <p className="text-[11px] font-black uppercase tracking-widest">
                                    {documentType === 'quote' ? 'Quote' : 'Contract'} PDF preview
                                </p>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-0.5">All sections in render order. Empty blocks shown as placeholders.</p>
                        </div>
                        <Button
                            size="sm"
                            onClick={() => setFocusMode(true)}
                            className="h-8 px-3 rounded-lg font-black uppercase tracking-widest text-[10px] shadow-sm bg-slate-900 text-white hover:bg-slate-800 gap-1.5 shrink-0"
                            title="Expand preview to full screen"
                        >
                            <Maximize2 className="h-3.5 w-3.5" />
                            Focus
                        </Button>
                    </div>
                )}
                {/* Inline PDF — only render when NOT in focus mode (avoids
                    double-rendering lag). When focus mode is on, this is
                    replaced with a static placeholder so the layout doesn't
                    collapse behind the overlay. */}
                <div className="p-3 bg-slate-100" style={{ minHeight: 640 }}>
                    {focusMode ? (
                        <div className="w-full h-full min-h-[640px] rounded-lg border bg-white flex items-center justify-center text-xs text-slate-400">
                            Preview is in focus mode (full screen) — close to return here
                        </div>
                    ) : (
                        <div className="w-full h-full min-h-[640px] rounded-lg overflow-hidden border">
                            <PDFViewer
                                style={{ width: '100%', height: '100%', minHeight: 640, border: 0 }}
                                showToolbar={false}
                            >
                                {docElement}
                            </PDFViewer>
                        </div>
                    )}
                </div>
            </div>

            {/* Full-screen focus mode — fixed overlay covering the viewport.
                Only THIS PDFViewer renders when focus is on (the inline one
                is replaced by a placeholder above). */}
            {focusMode && (
                <div className="fixed inset-0 z-50 bg-slate-950/95 flex flex-col">
                    <div className="flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-slate-900 text-white">
                        <div className="flex items-center gap-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">PDF Preview · Focus mode</p>
                            <p className="text-xs text-slate-300">
                                {documentType === 'quote' ? 'Quote' : 'Contract'} · Sample: Highfield Sport 560
                            </p>
                        </div>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setFocusMode(false)}
                            className="h-9 px-4 rounded-lg font-black uppercase tracking-widest text-[10px] border-slate-700 bg-slate-800 hover:bg-slate-700 text-white gap-1.5"
                        >
                            <Minimize2 className="h-3.5 w-3.5" />
                            Exit focus
                        </Button>
                    </div>
                    <div className="flex-1 min-h-0">
                        <PDFViewer
                            style={{ width: '100%', height: '100%', border: 0 }}
                            showToolbar={true}
                        >
                            {docElement}
                        </PDFViewer>
                    </div>
                </div>
            )}
        </>
    );
}

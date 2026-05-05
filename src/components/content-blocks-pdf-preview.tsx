'use client';

/**
 * Content Blocks PDF Preview (v1.7 — story 1.8.7).
 *
 * Renders the full customer-facing ProposalPDFDocument inside an
 * in-browser PDFViewer, using:
 *   - A baked sample-quote fixture (Highfield CL340 + Yamaha F150
 *     + Stratos trailer + sample customer + sample options) so the
 *     PDF has realistic shape without needing a real Firestore quote
 *   - The actual organisation's name + logos so the cover branding
 *     feels real
 *   - The org's authored content blocks (filtered to the active
 *     sub-tab's documentType) — so what the author writes shows up
 *     in real layout context
 *
 * v1.7 caveat: only `terms-and-conditions` from content blocks
 * renders inside ProposalPDFDocument as of the 1.2.1 first cut
 * (commit f70796e). The other 6 sections (salesperson-message,
 * why-us, brand-story, after-sales, finance-info, value-summary)
 * will start rendering once 1.2.1's full PDF wiring lands in v1.8 —
 * this preview will pick them up automatically (no preview code
 * change needed). For now, authoring a "Why Choose Us" block is
 * captured + saved + brand-overrideable, but the preview only
 * reflects T&Cs content directly.
 */

import { useMemo } from 'react';
import { PDFViewer } from '@react-pdf/renderer';
import { ProposalPDFDocument } from '@/components/proposal-pdf';
import {
    blockBelongsTo,
    type BlockType,
    type ContentBlock,
    type DocumentType,
} from '@/lib/content-blocks';
import { buildSampleQuoteFixture } from '@/lib/sample-quote-fixture';

interface Props {
    /** All content-block docs for the org (already loaded by parent). */
    blocks: ContentBlock[] | null;
    /** Active sub-tab — preview shows sections rendering on this document type. */
    documentType: DocumentType;
    /** Real org name + logos so the cover branding looks right. */
    organisationName?: string;
    primaryLogoUrl?: string | null;
    secondaryLogoUrl?: string | null;
}

export function ContentBlocksPdfPreview({ blocks, documentType, organisationName, primaryLogoUrl, secondaryLogoUrl }: Props) {
    /** Resolve content blocks → blockType → html map for the active
     *  documentType. No brand-override resolution in the preview path
     *  (preview always shows org-default; v1.7.5 can add a "Preview
     *  as brand: X" dropdown if needed). */
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

    /** Build fresh fixture per-render so org name / logos / quote
     *  number reflect the org's actual identity. The quote payload
     *  itself is stable across re-renders — only the contentBlocks
     *  map changes when the user saves a block. */
    const fixture = useMemo(
        () => buildSampleQuoteFixture({
            organisationName,
            primaryLogoUrl,
            secondaryLogoUrl,
            // No brand-override in preview — keeps content predictable.
            vendorId: null,
        }),
        [organisationName, primaryLogoUrl, secondaryLogoUrl],
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
                />
            </PDFViewer>
        </div>
    );
}

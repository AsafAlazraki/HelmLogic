'use client';

/**
 * Content Blocks PDF Preview (v1.7 — story 1.8.7).
 *
 * Live in-browser PDF preview of the org's authored content blocks
 * in their PDF positions. Wraps @react-pdf/renderer's PDFViewer
 * around a purpose-built preview document — this is NOT the
 * customer-facing PDF (that's proposal-pdf.tsx with full quote
 * data). It's content-blocks-only so the author can verify what
 * will render and where without building a quote first.
 *
 * Page layout (mirrors customer PDF section positions):
 *   Page 1 — salesperson-message → why-us
 *   Page 2 — brand-story → after-sales
 *   Page 3 — finance-info → value-summary → terms-and-conditions
 *
 * Empty blocks render a faint placeholder so the author can see
 * which sections still need authoring.
 *
 * v1.7 first ship reflects SAVED state (re-renders when the user
 * clicks Save in the editor). A future polish pass can lift the
 * editor's draft state to feed live keystroke updates.
 */

import { useMemo } from 'react';
import { Document, Page, View, Text, PDFViewer, StyleSheet } from '@react-pdf/renderer';
import { TipTapHtmlPdf } from '@/lib/tiptap-pdf';
import {
    BLOCK_TYPES,
    BLOCK_TYPE_LABEL,
    blockBelongsTo,
    getBlockDocumentTypes,
    type BlockType,
    type ContentBlock,
    type DocumentType,
} from '@/lib/content-blocks';

const NAVY = '#0f172a';
const SLATE = '#475569';
const MUTED = '#94a3b8';
const BORDER = '#e2e8f0';
const LIGHT = '#f8fafc';

const S = StyleSheet.create({
    page: {
        backgroundColor: 'white',
        padding: 36,
        fontFamily: 'Helvetica',
    },
    pageHeader: {
        borderBottomWidth: 2,
        borderBottomColor: NAVY,
        paddingBottom: 8,
        marginBottom: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    pageHeaderText: {
        fontSize: 8,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 1.5,
        color: SLATE,
    },
    pageHeaderTitle: {
        fontSize: 11,
        fontWeight: 'bold',
        color: NAVY,
    },
    sectionLabel: {
        fontSize: 7,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 1.5,
        color: SLATE,
        marginBottom: 5,
    },
    section: {
        marginBottom: 14,
        backgroundColor: LIGHT,
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 4,
        padding: 10,
    },
    sectionEmpty: {
        marginBottom: 14,
        borderWidth: 1,
        borderColor: BORDER,
        borderStyle: 'dashed',
        borderRadius: 4,
        padding: 10,
    },
    emptyText: {
        fontSize: 8,
        color: MUTED,
        fontStyle: 'italic',
    },
    pageFooter: {
        position: 'absolute',
        bottom: 18,
        left: 36,
        right: 36,
        flexDirection: 'row',
        justifyContent: 'space-between',
        fontSize: 7,
        color: MUTED,
    },
});

/**
 * Layout map — which block types appear on which page.
 * Mirrors the planned customer PDF positions from the design spec.
 */
const PAGE_LAYOUT: Array<{ pageLabel: string; sections: BlockType[] }> = [
    { pageLabel: 'Cover & Welcome',  sections: ['salesperson-message', 'why-us'] },
    { pageLabel: 'Vessel & Brand',   sections: ['brand-story', 'after-sales'] },
    { pageLabel: 'Investment',       sections: ['finance-info', 'value-summary', 'terms-and-conditions'] },
];

interface PreviewDocumentProps {
    blocksByType: Record<BlockType, string | undefined>;
    documentType: DocumentType;
}

function PreviewDocument({ blocksByType, documentType }: PreviewDocumentProps) {
    return (
        <Document title={`${documentType} content preview`}>
            {PAGE_LAYOUT.map((p, i) => (
                <Page key={i} size="A4" style={S.page}>
                    <View style={S.pageHeader}>
                        <Text style={S.pageHeaderTitle}>Page {i + 1}</Text>
                        <Text style={S.pageHeaderText}>{p.pageLabel} · {documentType.toUpperCase()}</Text>
                    </View>

                    {p.sections.map(blockType => {
                        const html = blocksByType[blockType];
                        const hasContent = !!(html && html.trim());
                        return (
                            <View key={blockType} style={hasContent ? S.section : S.sectionEmpty}>
                                <Text style={S.sectionLabel}>{BLOCK_TYPE_LABEL[blockType]}</Text>
                                {hasContent ? (
                                    <TipTapHtmlPdf html={html!} fontSize={8} color={SLATE} />
                                ) : (
                                    <Text style={S.emptyText}>
                                        Empty — this section won&apos;t appear on the {documentType} PDF until authored.
                                    </Text>
                                )}
                            </View>
                        );
                    })}

                    <View style={S.pageFooter}>
                        <Text>Content preview · Authored content only · Live customer PDF will include cover image, vessel config and pricing</Text>
                        <Text>{i + 1} / {PAGE_LAYOUT.length}</Text>
                    </View>
                </Page>
            ))}
        </Document>
    );
}

interface Props {
    /** All content-block docs for the org (already loaded by parent). */
    blocks: ContentBlock[] | null;
    /** Active sub-tab — preview shows sections rendering on this document type. */
    documentType: DocumentType;
}

export function ContentBlocksPdfPreview({ blocks, documentType }: Props) {
    /** Reduce blocks to a blockType → html map, applying documentType filter
     *  + most-recently-updated tie-break (mirrors content-block-manager). */
    const blocksByType = useMemo(() => {
        const m: Partial<Record<BlockType, { html: string; updatedAt: number }>> = {};
        for (const b of blocks ?? []) {
            if (!b.blockType) continue;
            if (!blockBelongsTo(b, documentType)) continue;
            const t = (b.updatedAt as any)?.toMillis?.() ?? 0;
            const existing = m[b.blockType];
            if (!existing || t > existing.updatedAt) {
                m[b.blockType] = { html: b.html ?? '', updatedAt: t };
            }
        }
        const result: Record<BlockType, string | undefined> = {} as any;
        for (const t of BLOCK_TYPES) result[t] = m[t]?.html;
        return result;
    }, [blocks, documentType]);

    return (
        <div className="w-full h-full min-h-[640px] rounded-lg overflow-hidden border bg-slate-100">
            <PDFViewer
                style={{ width: '100%', height: '100%', minHeight: 640, border: 0 }}
                showToolbar={false}
            >
                <PreviewDocument blocksByType={blocksByType} documentType={documentType} />
            </PDFViewer>
        </div>
    );
}

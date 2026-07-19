/**
 * PDF section structure (v1.7 — story 1.8.11).
 *
 * Replaces the hardcoded section ordering in proposal-pdf.tsx with
 * a persisted, user-reorderable list. The org admin drags sections
 * in the Document Templates editor; the customer PDF renders in
 * that order.
 *
 * Schema:
 *   organisations/{orgId}/pdfStructure/{documentType}
 *     where documentType ∈ ('quote' | 'contract')
 *
 *   Document shape:
 *     sections: PdfStructureSection[]
 *     updatedAt: Timestamp
 *
 * v1.7 anchoring (called out so users + future-me know):
 *   - 'cover-page' is anchored as page 1 in proposal-pdf because its
 *     full-bleed image background + gradient overlay don't flow in
 *     a wrapping page model. Drag-drop in the list still updates
 *     the doc, but the renderer keeps cover at the top.
 *   - 'signatures' is anchored as the last section on the final
 *     page for the same reason (signature-line layout assumes a
 *     fixed bottom-of-page position).
 *   - Everything else is fully reorderable + reflects in the PDF.
 *
 * v1.8 polish: full reorderability of cover + signatures (would
 * require a different cover-image strategy — placed inline rather
 * than full-bleed background).
 */

import {
    Timestamp,
    collection,
    doc,
    getDoc,
    serverTimestamp,
    setDoc,
    updateDoc,
    type Firestore,
} from 'firebase/firestore';
import type { BlockType } from '@/lib/content-blocks';

/* ──────────────────────────────────────────────────────────────────
 * TYPES
 * ────────────────────────────────────────────────────────────────── */

export type SystemSectionKey =
    | 'cover-page'
    | 'vessel-config'
    | 'pricing-section'
    | 'signatures';

export const SYSTEM_SECTION_KEYS: SystemSectionKey[] = [
    'cover-page', 'vessel-config', 'pricing-section', 'signatures',
];

export const SYSTEM_SECTION_LABEL: Record<SystemSectionKey, string> = {
    'cover-page':       'Cover Page',
    'vessel-config':    'Vessel Configuration',
    'pricing-section':  'Pricing & Investment',
    'signatures':       'Signatures',
};

export const SYSTEM_SECTION_HELP: Record<SystemSectionKey, string> = {
    'cover-page':      'Hero page with the boat image, customer name, model name and total. Anchored as page 1 — drag-drop captures intent but the renderer keeps it first because the full-bleed cover styling doesn\'t flow.',
    'vessel-config':   'Specs grid + standard features + factory options + motor + trailer + dealer fit. The technical heart of the proposal.',
    'pricing-section': 'Line-item pricing table + grand total (incl. GST). The commercial crux.',
    'signatures':      'Merchant Authorisation + Client Acceptance signature lines. Anchored at the end of the last page.',
};

/** A section can reference either a content block (by blockType — multiple
 *  authored blocks of the same type collapse to one entry) or a system
 *  section. */
export interface PdfStructureSection {
    /** Stable id used as the @dnd-kit sortable id. */
    id: string;
    type: 'system' | 'content';
    /** SystemSectionKey for system sections; BlockType for content. */
    key: string;
    /** Fractional index — drops compute the midpoint between neighbours. */
    order: number;
}

export interface PdfStructure {
    sections: PdfStructureSection[];
    updatedAt?: Timestamp;
}

// v1.34 — 'motor-quote' gets its own orderable structure doc at
// organisations/{orgId}/pdfStructure/motor-quote (rules wildcard covers it).
export type DocumentType = 'quote' | 'contract' | 'motor-quote';

/* ──────────────────────────────────────────────────────────────────
 * DEFAULT ORDER — matches the pre-1.8.11 proposal-pdf layout.
 * ────────────────────────────────────────────────────────────────── */

export const DEFAULT_SECTIONS: PdfStructureSection[] = [
    { id: 'system:cover-page',           type: 'system',  key: 'cover-page',           order: 100 },
    { id: 'content:salesperson-message', type: 'content', key: 'salesperson-message', order: 200 },
    { id: 'content:why-us',              type: 'content', key: 'why-us',              order: 300 },
    { id: 'system:vessel-config',        type: 'system',  key: 'vessel-config',       order: 400 },
    { id: 'content:brand-story',         type: 'content', key: 'brand-story',         order: 500 },
    { id: 'content:after-sales',         type: 'content', key: 'after-sales',         order: 600 },
    { id: 'content:finance-info',        type: 'content', key: 'finance-info',        order: 700 },
    { id: 'system:pricing-section',      type: 'system',  key: 'pricing-section',     order: 800 },
    { id: 'content:value-summary',       type: 'content', key: 'value-summary',       order: 900 },
    { id: 'content:terms-and-conditions', type: 'content', key: 'terms-and-conditions', order: 1000 },
    { id: 'system:signatures',           type: 'system',  key: 'signatures',          order: 1100 },
];

/** Section IDs that the renderer always anchors regardless of `order`.
 *  v1.7 ships with all 4 system sections anchored — they retain their
 *  hardcoded positions in proposal-pdf because making cover / vessel-
 *  config / pricing fully flowable requires a deeper rewrite of the
 *  PDF document model. The 7 content blocks in between are fully
 *  reorderable. v1.8 polish lifts these anchors. */
export const ANCHORED_FIRST = 'system:cover-page';
export const ANCHORED_LAST = 'system:signatures';
export const ANCHORED_IDS = new Set<string>([
    'system:cover-page',
    'system:vessel-config',
    'system:pricing-section',
    'system:signatures',
]);

/* ──────────────────────────────────────────────────────────────────
 * HELPERS
 * ────────────────────────────────────────────────────────────────── */

/** Get-or-seed: read the org's structure for this docType; if missing
 *  or empty, write the default. Returns the (possibly newly-seeded)
 *  sections sorted by order. */
export async function getOrSeedPdfStructure(
    firestore: Firestore,
    orgId: string,
    documentType: DocumentType,
): Promise<PdfStructureSection[]> {
    const ref = doc(firestore, `organisations/${orgId}/pdfStructure/${documentType}`);
    const snap = await getDoc(ref);
    if (snap.exists() && Array.isArray(snap.data().sections) && snap.data().sections.length > 0) {
        return [...snap.data().sections as PdfStructureSection[]].sort((a, b) => a.order - b.order);
    }
    // Seed default
    await setDoc(ref, {
        sections: DEFAULT_SECTIONS,
        updatedAt: serverTimestamp(),
    });
    return [...DEFAULT_SECTIONS];
}

/** Compute a fractional index between two existing orders.
 *  v1.5 lesson: drag-and-drop cards need fractional indices, not array
 *  rewrites. Same applies here — we update one section's order rather
 *  than renumbering the whole list. */
export function fractionalOrder(prevOrder: number | null, nextOrder: number | null): number {
    if (prevOrder == null && nextOrder == null) return 100;
    if (prevOrder == null) return (nextOrder as number) - 10;
    if (nextOrder == null) return prevOrder + 10;
    return (prevOrder + nextOrder) / 2;
}

/** Move a section to a new order. The caller computes prev/next from
 *  the visually-sorted list; this helper writes the section's new
 *  order to Firestore. */
export async function reorderSection(
    firestore: Firestore,
    orgId: string,
    documentType: DocumentType,
    sectionId: string,
    newOrder: number,
): Promise<void> {
    const ref = doc(firestore, `organisations/${orgId}/pdfStructure/${documentType}`);
    const snap = await getDoc(ref);
    const sections: PdfStructureSection[] = snap.exists() && Array.isArray(snap.data().sections)
        ? snap.data().sections
        : DEFAULT_SECTIONS;
    const updated = sections.map(s => s.id === sectionId ? { ...s, order: newOrder } : s);
    await setDoc(ref, { sections: updated, updatedAt: serverTimestamp() });
}

/** Sort sections by order then apply anchoring rules (cover first,
 *  signatures last) regardless of the user's reorder. */
export function sortAndAnchor(sections: PdfStructureSection[]): PdfStructureSection[] {
    const sorted = [...sections].sort((a, b) => a.order - b.order);
    const cover = sorted.find(s => s.id === ANCHORED_FIRST);
    const signatures = sorted.find(s => s.id === ANCHORED_LAST);
    const middle = sorted.filter(s => s.id !== ANCHORED_FIRST && s.id !== ANCHORED_LAST);
    return [
        ...(cover ? [cover] : []),
        ...middle,
        ...(signatures ? [signatures] : []),
    ];
}

/** True if a section is anchored (the list locks the row, no drag).
 *  All 4 system sections are anchored in v1.7 — content blocks are
 *  reorderable but system-section reorder ships in v1.8 polish. */
export function isAnchored(sectionId: string): boolean {
    return ANCHORED_IDS.has(sectionId);
}

/** Partition content-block sections into 3 zones based on their
 *  position relative to the system-section anchors:
 *    A — before vessel-config
 *    B — between vessel-config and pricing-section
 *    C — between pricing-section and signatures
 *
 *  proposal-pdf renders these zones at the existing insertion points.
 *  The user's drag-drop within and across zones determines which
 *  blocks land where. */
export function partitionContentBlocks(sections: PdfStructureSection[]): {
    zoneA: PdfStructureSection[];
    zoneB: PdfStructureSection[];
    zoneC: PdfStructureSection[];
} {
    const ordered = sortAndAnchor(sections);
    const vIdx = ordered.findIndex(s => s.id === 'system:vessel-config');
    const pIdx = ordered.findIndex(s => s.id === 'system:pricing-section');
    const sIdx = ordered.findIndex(s => s.id === 'system:signatures');

    const onlyContent = (arr: PdfStructureSection[]) => arr.filter(s => s.type === 'content');

    return {
        zoneA: onlyContent(ordered.slice(0, vIdx === -1 ? ordered.length : vIdx)),
        zoneB: onlyContent(ordered.slice(
            (vIdx === -1 ? 0 : vIdx + 1),
            (pIdx === -1 ? ordered.length : pIdx),
        )),
        zoneC: onlyContent(ordered.slice(
            (pIdx === -1 ? ordered.length : pIdx + 1),
            (sIdx === -1 ? ordered.length : sIdx),
        )),
    };
}

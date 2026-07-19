/**
 * Quote Content Blocks (v1.7 — story 1.8.1).
 *
 * The customer-facing PDF (rendered by 1.2.1) reads its rich-text
 * sections from this subcollection per org. Each block has a fixed
 * `blockType` enum that maps to a known position on the PDF; orgs
 * author / customise the body via TipTap; per-brand overrides keyed
 * by quote.vendorId let one org keep different copy for different
 * boat / motor brands they sell.
 *
 * Firestore shape:
 *   organisations/{orgId}/
 *     contentBlocks/{blockId}                 ← org-default content
 *     contentBlocks/{blockId}/brandOverrides/{vendorId}
 *     contentBlocks/{blockId}/versions/{versionId}
 *
 * 1.8.1 ships the schema + resolver + auto-migration of the legacy
 * `organisation.termsAndConditions` textarea into a single
 * `terms-and-conditions` block. 1.2.1 / 1.2.2 then consume the
 * resolved-per-quote map at PDF generation time.
 */

import {
    Firestore,
    Timestamp,
    collection,
    doc,
    getDoc,
    getDocs,
} from 'firebase/firestore';

/* ──────────────────────────────────────────────────────────────────
 * TYPES
 * ────────────────────────────────────────────────────────────────── */

/** Fixed enum — each block type maps to a known PDF position. */
export type BlockType =
    | 'salesperson-message'
    | 'why-us'
    | 'brand-story'
    | 'after-sales'
    | 'finance-info'
    | 'value-summary'
    | 'terms-and-conditions';

/** v1.7 (1.8.6) — which document(s) this block appears on.
 *  v1.34 — 'motor-quote': the dedicated motor-sale / repower document.
 *  Admin controls its content independently (Document Templates → Motor
 *  Quote tab) or tags a block for several document types at once. */
export type DocumentType = 'quote' | 'contract' | 'motor-quote';
export const DOCUMENT_TYPES: DocumentType[] = ['quote', 'contract', 'motor-quote'];
export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
    quote: 'Quote',
    contract: 'Contract',
    'motor-quote': 'Motor Quote',
};

export interface ContentBlock {
    id: string;
    blockType: BlockType;
    /** TipTap-serialised HTML. Empty string = block defined but no content authored. */
    html: string;
    /**
     * v1.7 round-5 — author-customisable sub-line that renders under
     * the section title on the PDF (e.g. "Our Promise To You" under
     * "Why Choose Us"). When null/empty, falls back to the SECTION_SUB
     * default in proposal-pdf.tsx. Also flows through brand overrides.
     */
    subHeader?: string | null;
    /**
     * v1.7 (1.8.6) — multi-select. Block renders only on the listed
     * document types. Missing field on legacy docs is treated as ['quote']
     * (matches pre-1.8.6 behaviour, where the manager was Quote-only).
     */
    documentTypes?: DocumentType[];
    /** Schema field for v1.8.3 layout controls. Default false; no UI in 1.8.1. */
    startsOnNewPage: boolean;
    /**
     * v1.8 (story 1.2.3) — when true, salespeople CANNOT override this
     * block per-quote. The org-authored content always wins. UI gating
     * lives in content-block-detail.tsx (admin toggle) and the
     * personalisation side sheet on proposal-view.tsx hides locked
     * blocks from its block picker. Resolver short-circuits the
     * per-quote override layer when this flag is true.
     * Missing field = false = unlocked = per-quote overrides allowed
     * (preserves legacy behaviour for blocks created before v1.8).
     */
    isLockedForQuotes?: boolean;
    /**
     * v1.11 follow-up — per-block presentation overrides. Operators can
     * tweak the PDF rendering of their org-authored block (accent colour,
     * card background, title alignment + size, body size) without
     * touching the page layout the system controls. Every field is
     * optional; missing = use the global default. UI lives in
     * content-block-detail.tsx. Resolved into the proposal-pdf
     * ContentBlockSection at render time.
     */
    style?: {
        /** Hex (with #) — accent for the title underline + sub-header rule. */
        accentColor?: string | null;
        /** Hex — card background behind the body text. null = transparent. */
        backgroundColor?: string | null;
        /** Hex — body text color override. null = default slate. */
        textColor?: string | null;
        /** Title horizontal alignment. */
        titleAlign?: 'left' | 'center' | null;
        /** Title size scale. */
        titleSize?: 'sm' | 'md' | 'lg' | 'xl' | null;
        /** Body text size scale. */
        bodySize?: 'sm' | 'md' | 'lg' | null;
        /** Body alignment override. */
        bodyAlign?: 'left' | 'center' | 'justify' | null;
        /** Italic on the title. */
        titleItalic?: boolean | null;
    } | null;
    createdAt?: Timestamp;
    updatedAt?: Timestamp;
    updatedByUid?: string;
    updatedByName?: string;
}

/**
 * v1.8 (story 1.2.3) — per-quote content override doc shape. Lives
 * at users/{ownerUid}/quotes/{quoteId}/contentOverrides/{blockType}.
 * Doc id is the blockType (one override per block per quote).
 */
export interface ContentOverride {
    id: string;                  // blockType
    html?: string | null;
    subHeader?: string | null;
    overriddenAt?: Timestamp;
    overriddenByUid?: string;
    overriddenByName?: string;
}

/** Resolve a block's effective documentTypes — defaults to ['quote'] for legacy docs. */
export function getBlockDocumentTypes(block: ContentBlock | undefined): DocumentType[] {
    const dt = block?.documentTypes;
    if (!dt || dt.length === 0) return ['quote'];
    return dt;
}

/** True when the block should render under the given document-type filter. */
export function blockBelongsTo(block: ContentBlock, docType: DocumentType): boolean {
    return getBlockDocumentTypes(block).includes(docType);
}

export interface BrandOverride {
    /** Doc id === vendorId (e.g. "highfield", "yamaha"). */
    id: string;
    html: string;
    updatedAt?: Timestamp;
    updatedByUid?: string;
    updatedByName?: string;
}

export interface ContentBlockVersion {
    id: string;
    html: string;
    /** Which surface saved this version: org default vs a specific brand override. */
    level: 'default' | `brand:${string}`;
    savedAt?: Timestamp;
    savedByUid?: string;
    savedByName?: string;
}

/* ──────────────────────────────────────────────────────────────────
 * CONSTANTS — block-type metadata
 *
 * `BLOCK_TYPE_ORDER` drives stable client-side sort + PDF section
 * positioning. Lower number renders earlier on the PDF.
 * ────────────────────────────────────────────────────────────────── */

export const BLOCK_TYPE_ORDER: Record<BlockType, number> = {
    'salesperson-message': 10,
    'why-us': 20,
    'brand-story': 30,
    'after-sales': 40,
    'finance-info': 50,
    'value-summary': 60,
    'terms-and-conditions': 70,
};

export const BLOCK_TYPE_LABEL: Record<BlockType, string> = {
    'salesperson-message': 'Salesperson Message',
    'why-us': 'Why Choose Us',
    'brand-story': 'Brand & Model Story',
    'after-sales': 'After-Sales Confidence',
    'finance-info': 'Finance & Insurance (Info)',
    'value-summary': 'Value Summary',
    'terms-and-conditions': 'Terms & Conditions',
};

export const BLOCK_TYPE_HELP: Record<BlockType, string> = {
    'salesperson-message': 'A short personal note from the salesperson, rendered at the top of page 1 of the customer PDF.',
    'why-us': 'Your dealership\'s positioning statement (e.g. "Why Northside Marine — Life Beyond the Shore"). Page 1, below the salesperson message.',
    'brand-story': 'Brand & model narrative — what makes this boat special. Page 2, top.',
    'after-sales': 'After-sales confidence: warranty, service network, ownership support. Page 2, after the vessel configuration.',
    'finance-info': 'Finance & insurance information (informational only — no live pricing). Page 3, before the pricing table.',
    'value-summary': 'Value summary — why this package, why now. Page 3, after the pricing table.',
    'terms-and-conditions': 'The boilerplate T&Cs that go on every quote. Page 3, above the signature lines. Migrated from the legacy textarea on first save.',
};

/** All block types in PDF render order. */
export const BLOCK_TYPES: BlockType[] = (Object.keys(BLOCK_TYPE_ORDER) as BlockType[])
    .sort((a, b) => BLOCK_TYPE_ORDER[a] - BLOCK_TYPE_ORDER[b]);

/* ──────────────────────────────────────────────────────────────────
 * HELPERS
 * ────────────────────────────────────────────────────────────────── */

/**
 * Wrap legacy plain-text content (split on newline) into TipTap-
 * compatible HTML. Used by the auto-migration of
 * `organisation.termsAndConditions` and as the fallback formatter
 * when the PDF has only legacy text to render.
 *
 * Empty input → empty string (NOT a single empty <p>) so the PDF
 * can short-circuit on falsy content.
 */
export function textToTipTapHtml(text: string | null | undefined): string {
    if (!text) return '';
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return '';
    return lines.map(line => `<p>${escapeHtml(line)}</p>`).join('');
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/* ──────────────────────────────────────────────────────────────────
 * RESOLVER (consumed by 1.2.1 at PDF generation time)
 *
 * Returns a map { blockType → html } for the given (org, vendor).
 * For each block, resolves the brand-override doc if present;
 * otherwise falls back to the org-default body.
 *
 * vendorId === null (e.g. non-catalog modules per the v1.4 lesson)
 * means "no brand context" → always return the org default.
 *
 * Block types that don't have a doc in Firestore yet are absent
 * from the result map. The PDF renderer treats absence as "skip
 * this section" rather than "render empty section".
 * ────────────────────────────────────────────────────────────────── */

export async function resolveContentBlocksForQuote(
    firestore: Firestore,
    orgId: string,
    vendorId: string | null,
    /** v1.7 (1.8.6) — filter to blocks tagged with this document type. Defaults to 'quote'. */
    documentType: DocumentType = 'quote',
    /**
     * v1.8 (story 1.2.3) — optional per-quote override coordinates. When
     * both provided, the resolver checks `users/{ownerUid}/quotes/{quoteId}/
     * contentOverrides/{blockType}` and prefers per-quote html over brand
     * override over org default. The check is short-circuited for blocks
     * with `isLockedForQuotes === true` so admin-locked content always
     * wins over a stale salesperson override.
     */
    quoteOverrideCtx?: { ownerUid: string; quoteId: string } | null,
): Promise<Partial<Record<BlockType, string>>> {
    const blocksSnap = await getDocs(collection(firestore, `organisations/${orgId}/contentBlocks`));
    const result: Partial<Record<BlockType, string>> = {};

    for (const blockDoc of blocksSnap.docs) {
        const block = { id: blockDoc.id, ...blockDoc.data() } as ContentBlock;

        // 1.8.6 — skip blocks not tagged for this document type.
        if (!blockBelongsTo(block, documentType)) continue;

        let html = block.html ?? '';

        if (vendorId) {
            const overrideRef = doc(
                firestore,
                `organisations/${orgId}/contentBlocks/${blockDoc.id}/brandOverrides/${vendorId}`,
            );
            const overrideSnap = await getDoc(overrideRef);
            if (overrideSnap.exists()) {
                const override = overrideSnap.data() as BrandOverride;
                if (override.html) html = override.html;
            }
        }

        // v1.8 (1.2.3) — per-quote override beats brand & default, unless
        // the block is admin-locked. Locked blocks fall through with the
        // org-default / brand-override html already resolved above.
        if (quoteOverrideCtx && !block.isLockedForQuotes) {
            const quoteOverrideRef = doc(
                firestore,
                `users/${quoteOverrideCtx.ownerUid}/quotes/${quoteOverrideCtx.quoteId}/contentOverrides/${block.blockType}`,
            );
            const quoteOverrideSnap = await getDoc(quoteOverrideRef);
            if (quoteOverrideSnap.exists()) {
                const override = quoteOverrideSnap.data() as ContentOverride;
                if (typeof override.html === 'string' && override.html.trim()) {
                    html = override.html;
                }
            }
        }

        // Skip empty blocks — a block defined but un-authored should
        // not render an empty section on the PDF.
        if (html.trim()) {
            result[block.blockType] = html;
        }
    }

    return result;
}

/**
 * v1.7 round-5 — parallel resolver that returns the per-block sub-header
 * overrides authored in the Quote Content Block Manager. Sub-headers
 * render under the section title on the PDF (e.g. "Our Promise To You"
 * under "Why Choose Us"). Empty / unauthored sub-headers fall back to
 * SECTION_SUB defaults in proposal-pdf.tsx.
 *
 * Kept as a separate function (rather than expanding the existing
 * resolver's return shape) so legacy callers don't break. New callers
 * (preview, finalize, proposal-view) call both and pass two parallel
 * maps to ProposalPDFDocument.
 */
export async function resolveContentBlockSubHeadersForQuote(
    firestore: Firestore,
    orgId: string,
    documentType: DocumentType = 'quote',
    /**
     * v1.8 (story 1.2.3) — optional per-quote override coordinates. Same
     * lock-aware short-circuit as `resolveContentBlocksForQuote`.
     */
    quoteOverrideCtx?: { ownerUid: string; quoteId: string } | null,
): Promise<Partial<Record<BlockType, string>>> {
    const blocksSnap = await getDocs(collection(firestore, `organisations/${orgId}/contentBlocks`));
    const result: Partial<Record<BlockType, string>> = {};
    for (const blockDoc of blocksSnap.docs) {
        const block = { id: blockDoc.id, ...blockDoc.data() } as ContentBlock;
        if (!blockBelongsTo(block, documentType)) continue;

        let sub = block.subHeader?.trim() || '';

        if (quoteOverrideCtx && !block.isLockedForQuotes) {
            const quoteOverrideRef = doc(
                firestore,
                `users/${quoteOverrideCtx.ownerUid}/quotes/${quoteOverrideCtx.quoteId}/contentOverrides/${block.blockType}`,
            );
            const quoteOverrideSnap = await getDoc(quoteOverrideRef);
            if (quoteOverrideSnap.exists()) {
                const override = quoteOverrideSnap.data() as ContentOverride;
                if (typeof override.subHeader === 'string' && override.subHeader.trim()) {
                    sub = override.subHeader.trim();
                }
            }
        }

        if (sub) result[block.blockType] = sub;
    }
    return result;
}

/**
 * v1.11 follow-up — resolves the per-block presentation style overrides
 * that operators author in the Content Block Manager (accent colour,
 * background colour, title alignment, etc.). Parallel to the html +
 * subHeader resolvers; the PDF takes all three. Brand overrides + per-
 * quote overrides for style are intentionally NOT supported in this
 * first cut (the org-level style is the styling, branding lives in
 * the brand HTML override). When the field is absent (legacy blocks),
 * the PDF falls back to its global defaults.
 */
export type ContentBlockStyle = NonNullable<ContentBlock['style']>;

export async function resolveContentBlockStylesForQuote(
    firestore: Firestore,
    orgId: string,
    documentType: DocumentType = 'quote',
): Promise<Partial<Record<BlockType, ContentBlockStyle>>> {
    const blocksSnap = await getDocs(collection(firestore, `organisations/${orgId}/contentBlocks`));
    const result: Partial<Record<BlockType, ContentBlockStyle>> = {};
    for (const blockDoc of blocksSnap.docs) {
        const block = { id: blockDoc.id, ...blockDoc.data() } as ContentBlock;
        if (!blockBelongsTo(block, documentType)) continue;
        if (block.style && Object.keys(block.style).length > 0) {
            result[block.blockType] = block.style;
        }
    }
    return result;
}

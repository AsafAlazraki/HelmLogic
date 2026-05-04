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

export interface ContentBlock {
    id: string;
    blockType: BlockType;
    /** TipTap-serialised HTML. Empty string = block defined but no content authored. */
    html: string;
    /** Schema field for v1.8.3 layout controls. Default false; no UI in 1.8.1. */
    startsOnNewPage: boolean;
    createdAt?: Timestamp;
    updatedAt?: Timestamp;
    updatedByUid?: string;
    updatedByName?: string;
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
): Promise<Partial<Record<BlockType, string>>> {
    const blocksSnap = await getDocs(collection(firestore, `organisations/${orgId}/contentBlocks`));
    const result: Partial<Record<BlockType, string>> = {};

    for (const blockDoc of blocksSnap.docs) {
        const block = blockDoc.data() as ContentBlock;
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

        // Skip empty blocks — a block defined but un-authored should
        // not render an empty section on the PDF.
        if (html.trim()) {
            result[block.blockType] = html;
        }
    }

    return result;
}

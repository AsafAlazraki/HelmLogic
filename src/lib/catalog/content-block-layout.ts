/**
 * content-block-layout.ts (v1.22 — Story 1.8.3).
 *
 * Content block layout controls + "starts on new page" toggle. Extends
 * the v1.7 content-block schema with optional layout fields the PDF
 * renderer honours. All optional + defaulted so existing blocks are
 * unaffected.
 *
 * New fields on a content block:
 *   startsOnNewPage?: boolean   — force a page break before this block
 *   columns?: 1 | 2             — single or two-column body layout
 *   spacingTop?: 'none'|'sm'|'md'|'lg'
 *   spacingBottom?: 'none'|'sm'|'md'|'lg'
 */

export type BlockSpacing = 'none' | 'sm' | 'md' | 'lg';

export interface ContentBlockLayout {
    startsOnNewPage?: boolean;
    columns?: 1 | 2;
    spacingTop?: BlockSpacing;
    spacingBottom?: BlockSpacing;
}

export const SPACING_PT: Record<BlockSpacing, number> = {
    none: 0,
    sm: 8,
    md: 16,
    lg: 28,
};

/** Resolve a block's layout with defaults applied. */
export function resolveBlockLayout(block: any): Required<ContentBlockLayout> {
    return {
        startsOnNewPage: block?.startsOnNewPage === true,
        columns: block?.columns === 2 ? 2 : 1,
        spacingTop: (block?.spacingTop as BlockSpacing) ?? 'md',
        spacingBottom: (block?.spacingBottom as BlockSpacing) ?? 'md',
    };
}

/** True when the renderer should emit a page break before this block. */
export function blockBreaksPage(block: any): boolean {
    return resolveBlockLayout(block).startsOnNewPage;
}


/**
 * pdf-branding.ts (v1.18 — Story "Receipt PDF branding").
 *
 * Shared branding tokens for every PDF artifact (quote PDF, service-quote
 * PDF, and the upcoming receipt / deposit / contract PDFs in v1.20+).
 * Single source of truth for the palette + typography so the receipt
 * doesn't have to reinvent colour constants and so an org-level
 * override (when we ship one in v1.19/3.7.6 follow-up) flows through
 * to every PDF in one place.
 *
 * The defaults match the existing proposal-pdf.tsx palette so calling
 * resolveBranding() with no org input is byte-identical to the
 * pre-v1.18 behaviour. New PDFs (receipt-pdf v1.20) consume the same
 * shape directly instead of forking constants.
 */

export interface PdfBrandingTokens {
    /** Primary brand colour. Used for cover band + section dividers. */
    brand: string;
    /** Heading / body text. Slightly darker than brand. */
    navy: string;
    /** Secondary text. */
    slate: string;
    /** Muted text and lighter strokes. */
    muted: string;
    /** Cell borders. */
    border: string;
    /** Light card backgrounds. */
    light: string;
    /** Positive deltas / margin-band-emerald. */
    green: string;
    /** Hairline gold accent on the cover band. */
    gold: string;
    /** Default font family. */
    fontFamily: string;
    /** Optional dealer logo URL. Overrides the default Highfield watermark. */
    logoUrl?: string | null;
}

export const DEFAULT_PDF_BRANDING: PdfBrandingTokens = {
    brand: '#0c2a4d',
    navy: '#0f172a',
    slate: '#475569',
    muted: '#94a3b8',
    border: '#e2e8f0',
    light: '#f8fafc',
    green: '#10b981',
    gold: '#a07a2c',
    fontFamily: 'Helvetica',
    logoUrl: null,
};

/**
 * Resolve the effective PDF branding tokens for an org. Merges any
 * fields the org has set on its organisation doc over the defaults so
 * the receipt PDF + the quote PDF render with identical palette + logo.
 *
 * Org-level overrides supported (all optional):
 *   organisation.pdfBranding: Partial<PdfBrandingTokens>
 *
 * If pdfBranding is absent or undefined, defaults win unchanged.
 */
export function resolveBranding(organisation: any | null | undefined): PdfBrandingTokens {
    const overrides = (organisation?.pdfBranding ?? {}) as Partial<PdfBrandingTokens>;
    return {
        ...DEFAULT_PDF_BRANDING,
        ...overrides,
    };
}

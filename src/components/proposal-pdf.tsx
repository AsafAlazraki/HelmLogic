'use client';

import { Document, Page, View, Text, Image, StyleSheet, Svg, Defs, LinearGradient, Stop, Rect } from '@react-pdf/renderer';
import type { BlockType } from '@/lib/content-blocks';
import { BLOCK_TYPE_LABEL } from '@/lib/content-blocks';
import { TipTapHtmlPdf } from '@/lib/tiptap-pdf';
import { formatMetres } from '@/lib/units';
import {
    DEFAULT_SECTIONS,
    partitionContentBlocks,
    type PdfStructureSection,
} from '@/lib/pdf-structure';

/* ─── Palette ────────────────────────────────────────────────────────────
 * Deeper, more authoritative palette than the earlier Pacific-blue (#0066cc).
 * BRAND is now a deep navy-blue closer to "executive proposal" tone;
 * GOLD provides a thin accent rule on the cover for premium feel.
 * ──────────────────────────────────────────────────────────────────────── */
// v1.18 (Story "Receipt PDF branding") — palette imported from the shared
// pdf-branding lib so the quote PDF + the upcoming receipt PDF + every
// other PDF artifact resolves through one source. Defaults match the
// pre-v1.18 constants exactly so no visual regression.
import { DEFAULT_PDF_BRANDING } from '@/lib/pdf-branding';
const BRAND  = DEFAULT_PDF_BRANDING.brand;
const NAVY   = DEFAULT_PDF_BRANDING.navy;
const SLATE  = DEFAULT_PDF_BRANDING.slate;
const MUTED  = DEFAULT_PDF_BRANDING.muted;
const BORDER = DEFAULT_PDF_BRANDING.border;
const LIGHT  = DEFAULT_PDF_BRANDING.light;
const GREEN  = DEFAULT_PDF_BRANDING.green;
const GOLD   = DEFAULT_PDF_BRANDING.gold;

/* ─── Helpers ──────────────────────────────────────────────────────────── */
function currency(n: number): string {
    return new Intl.NumberFormat('en-AU', {
        style: 'currency', currency: 'AUD', maximumFractionDigits: 0,
    }).format(n);
}
function formatOptionName(name: string): string {
    return (name || '').replace(/\s*&\s*/g, ' & ').replace(/\s+/g, ' ').trim();
}
function extractFirstColor(name: string): string | null {
    const m = (name || '').match(/\(([^)]+)\)/);
    if (!m) return null;
    const first = m[1].split('/')[0].trim();
    return first ? first.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : null;
}

/* ─── Styles ───────────────────────────────────────────────────────────── */
const S = StyleSheet.create({
    page: { fontFamily: 'Helvetica', backgroundColor: 'white', color: NAVY },

    /* shared */
    sectionLabel: { fontSize: 6.5, fontWeight: 'bold', letterSpacing: 2.5, color: BRAND, textTransform: 'uppercase', marginBottom: 8 },
    divider: { borderBottomWidth: 1, borderBottomColor: BORDER },
    dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: BRAND, marginTop: 4, marginRight: 5, flexShrink: 0 },

    /* page header / footer (inner pages) */
    pageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderBottomWidth: 2, borderBottomColor: NAVY, paddingBottom: 12, marginBottom: 22 },
    pageHeaderTitle: { fontSize: 20, fontWeight: 'bold', fontStyle: 'italic', textTransform: 'uppercase', letterSpacing: -0.5, lineHeight: 1.1 },
    pageHeaderSub: { fontSize: 6.5, letterSpacing: 2.5, fontWeight: 'bold', textTransform: 'uppercase', color: MUTED, marginTop: 3 },
    pageHeaderRight: { textAlign: 'right' },
    pageHeaderMeta: { fontSize: 6.5, fontWeight: 'bold', textTransform: 'uppercase', color: MUTED },
    /* v1.16 PDF polish — footer is now `fixed` and absolutely positioned at the
       page bottom so it renders on every page AND doesn't take inline flex space
       (which used to push it past the page edge → spurious blank page). The
       paddingHorizontal here matches the Page's `padding: 44` so the footer
       lines up with the body content. */
    pageFooter: { position: 'absolute', bottom: 24, left: 44, right: 44, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 10 },
    pageFooterText: { fontSize: 6.5, fontWeight: 'bold', color: SLATE },
    pageFooterMuted: { fontSize: 6.5, fontWeight: 'bold', color: MUTED },
});

/* ─── Sub-components ───────────────────────────────────────────────────── */
function InnerHeader({ title, sub, quoteNumber }: { title: string; sub: string; quoteNumber: string }) {
    return (
        <View style={S.pageHeader}>
            <View>
                <Text style={S.pageHeaderTitle}>{title}</Text>
                <Text style={S.pageHeaderSub}>{sub}</Text>
            </View>
            <View style={S.pageHeaderRight}>
                <Text style={S.pageHeaderMeta}>{quoteNumber}</Text>
                <Text
                    style={S.pageHeaderMeta}
                    render={({ pageNumber }) => `Page ${String(pageNumber).padStart(2, '0')}`}
                    fixed
                />
            </View>
        </View>
    );
}

function InnerFooter({ organisation, quoteNumber }: { organisation: any; quoteNumber: string }) {
    /* v1.16 PDF polish — `fixed` makes the footer render on every page
       at the same absolute position WITHOUT taking up flex flow space.
       Removes the blank-page-5 bug where InnerFooter's marginTop:auto
       pushed it past the page bottom, forcing react-pdf to spawn an
       extra page with only the footer on it. */
    return (
        <View style={S.pageFooter} fixed>
            <View style={{ flexDirection: 'row', gap: 16, flex: 1 }}>
                <Text style={S.pageFooterText}>{organisation?.name}</Text>
                {organisation?.phoneNumber && <Text style={S.pageFooterMuted}>{organisation.phoneNumber}</Text>}
            </View>
            <Text
                style={[S.pageFooterMuted, { flex: 1, textAlign: 'center' }]}
                render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
            />
            <Text style={[S.pageFooterMuted, { flex: 1, textAlign: 'right' }]}>{quoteNumber}</Text>
        </View>
    );
}

/* ─── Content-block section helper (v1.7 — 1.2.1 PDF wiring) ──────────
 * Renders one of the org-authored narrative content blocks at the
 * call-site's position. Only renders when contentBlocks[blockType]
 * has content; otherwise silently emits nothing so empty blocks
 * don't leave gaps in the layout.
 *
 * v1.7 polish — section headers now match the InnerHeader / page-
 * level style (big bold italic uppercase title + small uppercase
 * sub-line, bottom-bordered) instead of the earlier tiny "CAD"
 * label. Looks like a real PDF section, not a footnote.
 * ──────────────────────────────────────────────────────────────────── */
const SECTION_SUB: Record<string, string> = {
    'salesperson-message': 'Personal Welcome',
    'why-us':              'Our Promise To You',
    'brand-story':         'Why This Boat',
    'after-sales':         'Ownership Support',
    'finance-info':        'Payment & Coverage Options',
    'value-summary':       'Investment Summary',
    'terms-and-conditions': 'Standard Proposal Terms',
};

function ContentBlockSection({
    label,
    sub,
    html,
    bodyColor = MUTED,
    bodySize = 9,
}: {
    label: string;
    sub?: string;
    html: string | undefined;
    bodyColor?: string;
    bodySize?: number;
}) {
    if (!html || !html.trim()) return null;
    return (
        <View style={{ marginBottom: 22 }}>
            {/* Section header — matches InnerHeader page-level style at slightly smaller scale */}
            <View style={{ borderBottomWidth: 2, borderBottomColor: NAVY, paddingBottom: 8, marginBottom: 12 }}>
                <Text style={{ fontSize: 16, fontWeight: 'bold', fontStyle: 'italic', textTransform: 'uppercase', letterSpacing: -0.4, lineHeight: 1.1, color: NAVY }}>
                    {label}
                </Text>
                {sub ? (
                    <Text style={{ fontSize: 6, letterSpacing: 2.5, fontWeight: 'bold', textTransform: 'uppercase', color: MUTED, marginTop: 3 }}>
                        {sub}
                    </Text>
                ) : null}
            </View>
            {/* Body */}
            <TipTapHtmlPdf html={html} fontSize={bodySize} color={bodyColor} />
        </View>
    );
}

/* ─── Build-band helpers (v1.11 — "Your Build" redesign) ─────────────────
 * The vessel-configuration page was a dump of disconnected boxed sections
 * (tech-spec grid · standard-features list · propulsion card · trailer card
 * · dealer-fit table · fit-up table). The redesign consolidates the whole
 * package into one numbered card-stack — every major component is a single
 * atomic "band" so the customer reads their build top-to-bottom like a
 * receipt of what they're getting. Each band is wrap={false}.
 * ──────────────────────────────────────────────────────────────────────── */
function BandNumber({ n }: { n: number }) {
    return (
        <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 9, fontWeight: 'bold', color: 'white' }}>{n}</Text>
        </View>
    );
}

/** A small label/value pill used for headline specs inside a band. */
function SpecPill({ label, value }: { label: string; value: string }) {
    return (
        <View style={{ marginRight: 14, marginBottom: 4 }}>
            <Text style={{ fontSize: 5.5, fontWeight: 'bold', letterSpacing: 1.2, textTransform: 'uppercase', color: MUTED, marginBottom: 1 }}>{label}</Text>
            <Text style={{ fontSize: 8.5, fontWeight: 'bold', color: NAVY }}>{value}</Text>
        </View>
    );
}

/** One numbered band in the Your-Build stack. `accent` colours the number
 *  rail; `right` is the headline price (or any node). */
function BuildBand({
    n, title, subtitle, price, image, imagePlaceholder, children,
}: {
    n: number;
    title: string;
    subtitle?: string;
    price?: string;
    image?: string;             // resolved (already-pdfImg'd) url or undefined
    imagePlaceholder?: React.ReactNode;
    children?: React.ReactNode;
}) {
    return (
        <View wrap={false} style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 8, marginBottom: 10, overflow: 'hidden' }}>
            {/* Header strip */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: LIGHT, borderBottomWidth: 1, borderBottomColor: BORDER }}>
                <BandNumber n={n} />
                <View style={{ flexShrink: 1, flex: 1 }}>
                    <Text style={{ fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5, color: NAVY }}>{title}</Text>
                    {subtitle ? <Text style={{ fontSize: 7, fontWeight: 'bold', letterSpacing: 0.8, textTransform: 'uppercase', color: MUTED, marginTop: 1 }}>{subtitle}</Text> : null}
                </View>
                {price ? <Text style={{ fontSize: 13, fontWeight: 'bold', fontStyle: 'italic', color: NAVY }}>{price}</Text> : null}
            </View>
            {/* Body */}
            <View style={{ flexDirection: 'row', gap: 12, padding: 12 }}>
                {image ? (
                    /* v1.16 (Qt0VHo4M) — Larger summary band images. 92×70 → 120×90. */
                    <Image src={image} style={{ width: 120, height: 90, objectFit: 'contain', backgroundColor: LIGHT, borderRadius: 4, flexShrink: 0 }} />
                ) : imagePlaceholder ? (
                    <View style={{ width: 120, height: 90, backgroundColor: LIGHT, borderRadius: 4, flexShrink: 0, alignItems: 'center', justifyContent: 'center' }}>
                        {imagePlaceholder}
                    </View>
                ) : null}
                <View style={{ flex: 1, flexShrink: 1 }}>{children}</View>
            </View>
        </View>
    );
}

/* ─── Main Document ────────────────────────────────────────────────────── */
/**
 * `contentBlocks` is the resolved-per-quote map from
 * `resolveContentBlocksForQuote(firestore, orgId, quote.vendorId)`
 * (1.8.1's resolver). When present, the corresponding sections of
 * the PDF render the org-authored rich text — with brand overrides
 * already applied. Absent or empty entries fall back to legacy
 * behaviour (e.g. terms-and-conditions falls through to
 * `organisation.termsAndConditions` then to DEFAULT_TERMS).
 *
 * 1.2.1 — first cut wires only the terms-and-conditions block (the
 * familiar surface) so the data path can be verified end-to-end on
 * dev before the other six sections are wired in.
 */
interface SalespersonProfile {
    displayName?: string;
    role?: string;
    messageHtml?: string;
    photoUrl?: string | null;
    signOff?: string;
}

interface Props {
    quote: any;
    organisation: any;
    financials: any;
    contentBlocks?: Partial<Record<BlockType, string>>;
    /** v1.7 round-5 — per-block sub-header overrides authored in the
     *  Quote Content Block Manager. When set, replaces the SECTION_SUB
     *  default for that block type. */
    contentBlockSubHeaders?: Partial<Record<BlockType, string | null>>;
    /** v1.11 follow-up — per-block presentation overrides (accent colour,
     *  background, alignment, sizes). When set, renderBlockPages applies
     *  the override on top of the default styling. */
    contentBlockStyles?: Partial<Record<BlockType, NonNullable<import('@/lib/content-blocks').ContentBlock['style']>>>;
    /** v1.7 (1.8.11) — user-defined ordering of content blocks. */
    pdfSections?: PdfStructureSection[];
    /** v1.7 (1.8.12) — per-salesperson message + photo. When present, the
     *  salesperson-message section renders a custom layout with photo +
     *  name + role + message + signoff. When absent, the section is
     *  omitted from the PDF. */
    salespersonProfile?: SalespersonProfile | null;
}

/** Route every embedded image through the weserv resizing proxy. This:
 *  (1) downscales to a sane width so the PDF isn't tens of MB of full-res
 *  photos, (2) fetches server-side so Cloudflare-hotlink-protected CDN
 *  images (e.g. media.highfieldboats.com) actually resolve, and (3)
 *  normalises everything to JPEG. Returns undefined for empty/missing so
 *  the conditional `{url && <Image/>}` guards still collapse the slot. */
/** Domains we KNOW block hotlinking even through the weserv proxy →
 *  treat as if the image is missing so the conditional render collapses
 *  the slot instead of reserving 140px of blank space. */
const BLOCKED_IMAGE_DOMAINS = [
    'yamaha-motor.com.au',  // Yamaha CDN returns 404 to weserv
    'yamaha-motor.com',
];

/** v1.34 — Firebase Storage tokened URLs 404 THROUGH weserv but fetch
 *  fine raw (bucket CORS is open; same rule as WESERV_SKIP_HOSTS in
 *  image-preload.ts). Without this skip, every mirrored mpf-mirror/
 *  image silently failed in the PDF. Verified by isolated render. */
const PDF_PROXY_SKIP_HOSTS = ['firebasestorage.googleapis.com', 'firebasestorage.app'];
function pdfImg(url: string | undefined | null, w = 700): string | undefined {
    if (!url || typeof url !== 'string') return undefined;
    const u = url.trim();
    if (!u) return undefined;
    if (u.startsWith('data:')) return u;
    if (BLOCKED_IMAGE_DOMAINS.some(d => u.includes(d))) return undefined;
    // Storage sends no CORS headers and weserv 404s tokened URLs —
    // stream same-origin via our own /api/pdf-img proxy (v1.34).
    if (PDF_PROXY_SKIP_HOSTS.some(d => u.includes(d))) return `/api/pdf-img?url=${encodeURIComponent(u)}`;
    const noProto = u.replace(/^https?:\/\//i, '');
    return `https://images.weserv.nl/?url=${encodeURIComponent(noProto)}&w=${w}&output=jpg&q=72`;
}

/** Decide if a label IS just a part-code (e.g. "010-02093-02", "BBB-FE1",
 *  "MT605GAUS") with no human-readable text. These items have no real
 *  description in the source data — rendering them on the customer PDF
 *  is worse than hiding them, so dealer-fit filters them out. */
function isCodeOnlyLabel(s: unknown): boolean {
    if (s == null) return true;
    // Coerce non-strings (number/object/etc.) — they crash .trim() and
    // are also clearly not human-readable labels.
    const str = typeof s === 'string' ? s : String(s);
    const t = str.trim();
    if (!t) return true;
    // Codey: all-caps, digits, dashes only — no lowercase letters.
    return /^[A-Z0-9-]+$/.test(t) || /^\d{3,}-/.test(t);
}

/** Replace customer-name placeholder tokens in authored content (e.g. the
 *  salesperson message's "Dear [Customer First Name],") with the real
 *  customer name from the quote. Case/space-insensitive. */
function substituteCustomerTokens(html: string | undefined, quote: any): string {
    if (!html) return html || '';
    const full = String(quote?.customer?.name || quote?.customerName || '').trim();
    const first = full.split(/\s+/)[0] || 'there';
    const last = full.split(/\s+/).slice(1).join(' ');
    return html
        .replace(/\[\s*customer\s+first\s+name\s*\]/gi, first)
        .replace(/\[\s*customer\s+last\s+name\s*\]/gi, last)
        .replace(/\[\s*customer\s+(?:full\s+)?name\s*\]/gi, full || first)
        .replace(/\[\s*first\s+name\s*\]/gi, first);
}

export function ProposalPDFDocument({ quote, organisation, financials, contentBlocks, contentBlockSubHeaders, contentBlockStyles, pdfSections, salespersonProfile }: Props) {
    const zones = partitionContentBlocks(pdfSections ?? DEFAULT_SECTIONS);

    /** v1.16 PDF polish — content blocks now share pages in each zone
     *  instead of getting their own dedicated A4 page each. A short
     *  block (e.g. 3 lines of "Why us") used to claim a whole page
     *  with 80% white space; now multiple short blocks stack vertically
     *  and react-pdf auto-breaks when the running total overflows.
     *
     *  Per-block rendering still:
     *   - Skips empty html (tag-only counts as empty)
     *   - Falls back to authored / org / DEFAULT terms for T&Cs
     *   - Honours per-block style overrides (colour, alignment, size)
     *   - Wraps each block in `wrap={false}` so a block never splits
     *     mid-paragraph; long blocks get their own page automatically
     *
     *  Special-cased salesperson-message keeps the photo-side layout
     *  but renders within the shared Page (still wrap=false so the
     *  photo + message stay together). */

    /** v1.16 (Option G — smart continue mode):
     *  Each content block now decides per-render whether to be atomic
     *  (wrap=false; keeps the whole block on one page; risks page-break
     *  overflow on a short page) or flow-able (wrap=true; long blocks
     *  split mid-paragraph across pages with the title staying with its
     *  first paragraph).
     *
     *  Heuristic: count the visible text length in the html. Blocks
     *  under ~600 chars stay atomic — they always fit on one page.
     *  Longer blocks flow so they don't strand a half-empty page in
     *  front of themselves. Title + first paragraph still stay together
     *  via a nested wrap=false header View. */
    const renderBlockSection = (s: PdfStructureSection) => {
        const blockType = s.key as BlockType;
        const html = contentBlocks?.[blockType];
        const label = BLOCK_TYPE_LABEL[blockType] ?? s.key;
        const customSub = contentBlockSubHeaders?.[blockType];
        const sub = (customSub && customSub.trim()) || SECTION_SUB[blockType] || '';
        const visibleLen = (h?: string) => (h ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().length;
        const ATOMIC_THRESHOLD = 600;

        // Salesperson-message — bespoke layout (photo + name + sign-off).
        // Always atomic — photo + signature should never separate from message.
        if (blockType === 'salesperson-message') {
            const sp = salespersonProfile;
            const spHtml = sp?.messageHtml;
            if (!sp || !spHtml || !spHtml.trim()) return null;
            const spSub = (customSub && customSub.trim())
                || `From ${sp.displayName ?? 'Your Salesperson'}${sp.role ? ` · ${sp.role}` : ''}`;
            return (
                <View key={s.id} wrap={false} style={{ marginBottom: 24 }}>
                    <View style={{ borderBottomWidth: 2, borderBottomColor: NAVY, paddingBottom: 8, marginBottom: 14 }}>
                        <Text style={{ fontSize: 18, fontWeight: 'bold', fontStyle: 'italic', textTransform: 'uppercase', letterSpacing: -0.4, lineHeight: 1.1, color: NAVY }}>{label}</Text>
                        {spSub ? <Text style={{ fontSize: 6.5, letterSpacing: 2.5, fontWeight: 'bold', textTransform: 'uppercase', color: MUTED, marginTop: 3 }}>{spSub}</Text> : null}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 18 }}>
                        {sp.photoUrl ? (
                            <Image src={pdfImg(sp.photoUrl, 240)} style={{ height: 100, width: 100, borderRadius: 50, objectFit: 'cover' }} />
                        ) : null}
                        <View style={{ flex: 1 }}>
                            <TipTapHtmlPdf html={substituteCustomerTokens(spHtml, quote)} fontSize={10} color={SLATE} />
                            {sp.signOff ? (
                                <Text style={{ fontSize: 10, fontStyle: 'italic', color: SLATE, marginTop: 10 }}>{sp.signOff}</Text>
                            ) : null}
                        </View>
                    </View>
                </View>
            );
        }

        // T&Cs fallback chain — always renders even if no block is authored.
        const htmlEmpty = !html || !html.trim() || !html.replace(/<[^>]+>/g, '').trim();
        if (blockType === 'terms-and-conditions' && htmlEmpty) {
            const DEFAULT_TERMS = [
                '1. This proposal is valid for 30 days from the date of issue.',
                '2. Prices are subject to change without notice after the validity period.',
                '3. A non-refundable deposit may be required to secure this package.',
                '4. Final delivery dates will be confirmed upon order acceptance.',
            ];
            const customTerms = organisation?.termsAndConditions
                ? (organisation.termsAndConditions as string).split('\n').filter((l: string) => l.trim())
                : null;
            const lines = customTerms && customTerms.length > 0 ? customTerms : DEFAULT_TERMS;
            return (
                <View key={s.id} wrap={false} style={{ marginBottom: 24 }}>
                    <View style={{ borderBottomWidth: 2, borderBottomColor: NAVY, paddingBottom: 8, marginBottom: 14 }}>
                        <Text style={{ fontSize: 18, fontWeight: 'bold', fontStyle: 'italic', textTransform: 'uppercase', letterSpacing: -0.4, lineHeight: 1.1, color: NAVY }}>{label}</Text>
                        {sub ? <Text style={{ fontSize: 6.5, letterSpacing: 2.5, fontWeight: 'bold', textTransform: 'uppercase', color: MUTED, marginTop: 3 }}>{sub}</Text> : null}
                    </View>
                    {lines.map((t: string, i: number, arr: string[]) => (
                        <Text key={i} style={{ fontSize: 9, color: SLATE, lineHeight: 1.6, marginBottom: i < arr.length - 1 ? 5 : 0 }}>{t}</Text>
                    ))}
                </View>
            );
        }

        if (htmlEmpty) return null;

        // Per-block style overrides
        const style = contentBlockStyles?.[blockType] || {};
        const titleSizeMap = { sm: 14, md: 18, lg: 22, xl: 28 } as const;
        const bodySizeMap = { sm: 8.5, md: 10, lg: 12 } as const;
        const titleSize = titleSizeMap[(style.titleSize as 'sm' | 'md' | 'lg' | 'xl') || 'md'];
        const bodySize = bodySizeMap[(style.bodySize as 'sm' | 'md' | 'lg') || 'md'];
        const accent = style.accentColor || NAVY;
        const textColor = style.textColor || SLATE;
        const titleAlign = (style.titleAlign as 'left' | 'center') || 'left';
        const bodyAlign = (style.bodyAlign as 'left' | 'center' | 'justify') || 'left';
        const cardBg = style.backgroundColor || undefined;
        const titleItalic = style.titleItalic !== false;

        const isAtomic = visibleLen(html) < ATOMIC_THRESHOLD;
        const Header = (
            <View wrap={false} style={{ borderBottomWidth: 2, borderBottomColor: accent, paddingBottom: 8, marginBottom: 14 }}>
                <Text style={{ fontSize: titleSize, fontWeight: 'bold', fontStyle: titleItalic ? 'italic' : 'normal', textTransform: 'uppercase', letterSpacing: -0.4, lineHeight: 1.1, color: accent, textAlign: titleAlign }}>
                    {label}
                </Text>
                {sub ? (
                    <Text style={{ fontSize: 6.5, letterSpacing: 2.5, fontWeight: 'bold', textTransform: 'uppercase', color: MUTED, marginTop: 3, textAlign: titleAlign }}>
                        {sub}
                    </Text>
                ) : null}
            </View>
        );
        const Body = cardBg ? (
            <View style={{ backgroundColor: cardBg, padding: 14, borderRadius: 6 }}>
                <TipTapHtmlPdf html={html} fontSize={bodySize} color={textColor} align={bodyAlign} />
            </View>
        ) : (
            <TipTapHtmlPdf html={html} fontSize={bodySize} color={textColor} align={bodyAlign} />
        );

        if (isAtomic) {
            // Short block — keep the whole thing together (existing behaviour).
            return (
                <View key={s.id} wrap={false} style={{ marginBottom: 24 }}>
                    {Header}
                    {Body}
                </View>
            );
        }
        // Long block — flow-able. Title stays with first paragraph via the
        // inner wrap=false Header; body wraps freely across pages.
        return (
            <View key={s.id} style={{ marginBottom: 24 }}>
                {Header}
                {Body}
            </View>
        );
    };

    const renderBlockPages = (zoneSections: PdfStructureSection[]) => {
        const sections = zoneSections
            .map(s => ({ s, section: renderBlockSection(s) }))
            .filter(x => x.section != null);
        if (sections.length === 0) return null;
        // Single shared Page per zone. Body wraps; each block is wrap=false
        // so blocks never split mid-paragraph. Footer is fixed so the
        // first overflow page (if any) still has it.
        return (
            <Page key={`zone-${zoneSections[0]?.id ?? 'unknown'}`} size="A4" style={{ ...S.page, padding: 44, paddingBottom: 60 }}>
                {sections.map(x => x.section)}
                <InnerFooter organisation={organisation} quoteNumber={quote.quoteNumber} />
            </Page>
        );
    };

    const f = financials;
    const createdAt: Date = quote.createdAt?.toDate?.() ?? new Date();
    const validUntil = new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

    const factoryOptions = [
        ...(quote.selectedOptions || []).filter((o: any) => !o.isStandard),
        ...(quote.customOptions || []),
    ];
    const optionGroups: Record<string, any[]> = factoryOptions.reduce((acc: Record<string, any[]>, opt: any) => {
        const cat = opt.category || 'General';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(opt);
        return acc;
    }, {});

    // v1.33 (Bill: "Change Name from DEALER to NORTHSIDE MARINE") — the
    // customer PDF never says "Dealer"; it names the organisation. Falls
    // back to "Dealer" only when the org doc hasn't loaded.
    const orgLabel = organisation?.name || 'Dealer';

    // v1.11 launch — `indent` lets factory options / motor accessories /
    // trailer options / dealer-fit items render as sub-rows under their
    // parent (Vessel / Propulsion / Trailer) instead of as peer top-level
    // rows. Cleaner read for the customer; the maths is unchanged.
    // v1.33 — `heading` renders a mini section divider inside the summary
    // (no amount), used to split Factory Options from Standard Inclusions.
    const lineItems: { label: string; sub?: string; amount: number; indent?: boolean; heading?: boolean }[] = [];
    if (f.boatBasePrice > 0) lineItems.push({
        label: `${quote.modelName} — Base Vessel`,
        sub: quote.variant?.name && quote.variant.name !== 'Standard'
            ? quote.variant.name
            : [quote.variant?.material, quote.variant?.colorName].filter(Boolean).join(' · '),
        amount: f.boatBasePrice,
    });
    // v1.11 — every standard factory inclusion as a $0 INCLUDED line so the
    // Investment Summary is a literal itemisation of everything in the build,
    // not just the billable extras. Grouped right under the base vessel.
    const standardInclusions: string[] = Array.isArray(quote.standardFeatures) ? quote.standardFeatures : [];
    if (standardInclusions.some(feat => feat && feat.trim())) {
        lineItems.push({ label: 'Standard Inclusions', amount: 0, indent: true, heading: true });
    }
    standardInclusions.forEach((feat: string) => {
        if (!feat || !feat.trim()) return;
        lineItems.push({ label: feat.trim(), sub: 'Standard Inclusion', amount: 0, indent: true });
    });
    // v1.33 (Bill: "Factory Options to have its own Heading") — factory
    // options stay grouped under the Base Vessel but no longer run on
    // from the Standard Inclusions; a divider heading separates them.
    if (factoryOptions.length > 0) {
        lineItems.push({ label: 'Factory Options', amount: 0, indent: true, heading: true });
    }
    factoryOptions.forEach((opt: any) => {
        const base = formatOptionName(opt.name.replace(/\s*\([^)]+\)\s*$/, '').trim());
        const color = extractFirstColor(opt.name);
        /* v1.16 (XydsZkX3) — hideOptionPrices forces the line to render as
           INCLUDED on the customer PDF (amount === 0 → 'INCLUDED' tag). */
        const rawAmount = opt.sellPriceExclGst || 0;
        const amount = quote.hideOptionPrices ? 0 : rawAmount;
        lineItems.push({ label: color ? `${base} (${color})` : base, sub: opt.category || 'Factory Option', amount, indent: true });
    });
    // Motor — base + every accessory ON ITS OWN LINE. v1.11 follow-up: items
    // that are "Included" (price 0, factory-standard with the engine) now also
    // get a line with the INCLUDED label so the customer sees the complete
    // build, not just billable extras.
    if (quote.motor) {
        const motorAccs: any[] = Array.isArray(quote.motor.accessories) ? quote.motor.accessories : [];
        const accsTotal = motorAccs.reduce((s, a) => s + (a.sellPriceExclGst || 0), 0);
        const motorBase = (f.motorTotal ?? 0) - accsTotal;
        // v1.34 Yamaha Rebates — the motor line tells the rebate story
        // inline (name + was-price) and the red banner above the summary
        // carries the eye-catching version.
        const mr = (quote.motor as any).rebate;
        lineItems.push({
            label: quote.motor.name,
            sub: mr
                ? `${quote.motor.brand ?? 'Outboard'} — Propulsion · ${mr.name}: was ${currency(mr.retailPrice)} — save ${currency(mr.discount)}`
                : `${quote.motor.brand ?? 'Outboard'} — Propulsion`,
            amount: motorBase > 0 ? motorBase : (f.motorTotal ?? 0),
        });
        motorAccs.forEach(a => {
            const rawAmount = a.sellPriceExclGst || 0;
            const amount = quote.hideOptionPrices ? 0 : rawAmount;
            const isStandard = !!(a.isStandard || a.isInclusion);
            lineItems.push({
                label: a.name || a.label || 'Motor accessory',
                sub: isStandard || amount === 0
                    ? (a.category ? `Motor · ${a.category} · Included` : 'Motor · Included')
                    : (a.category ? `Motor · ${a.category}` : 'Motor accessory'),
                amount,
                indent: true,
            });
        });
    }
    // Trailer — base + every option line by line. Options with no price get
    // an "Included" annotation too.
    if (quote.trailer) {
        const tOpts: any[] = Array.isArray(quote.trailer.options) ? quote.trailer.options : [];
        const optsTotal = tOpts.reduce((s, o) => s + (o.sellPriceExclGst || 0), 0);
        const trailerBase = (f.trailerTotal ?? 0) - optsTotal;
        lineItems.push({
            label: quote.trailer.name || 'Trailer Package',
            sub: 'Trailer — Base',
            amount: trailerBase > 0 ? trailerBase : (f.trailerTotal ?? 0),
        });
        tOpts.forEach(o => {
            const rawAmount = o.sellPriceExclGst || 0;
            const amount = quote.hideOptionPrices ? 0 : rawAmount;
            lineItems.push({
                label: o.name || 'Trailer option',
                sub: amount === 0
                    ? (o.category ? `Trailer · ${o.category} · Included` : 'Trailer · Included')
                    : (o.category ? `Trailer · ${o.category}` : 'Trailer option'),
                amount,
                indent: true,
            });
        });
    }
    // Dealer fit — every selection on its own line (was a single rollup).
    // Code-only labels filtered the same way the Vessel Configuration block
    // does so junk part-codes don't bleed into the Investment Summary.
    if (f.dealerFitTotal > 0 || (Array.isArray(quote.dealerFit) && quote.dealerFit.length > 0)) {
        const groups: any[] = Array.isArray(quote.dealerFit) ? quote.dealerFit : [];
        let pushedAny = false;
        groups.forEach((g: any) => {
            const items: any[] = Array.isArray(g?.items) ? g.items : [];
            items.forEach((it: any) => {
                const labelCandidates = [it.description, it.label, it.name].filter(Boolean) as string[];
                const real = labelCandidates.find(c => !isCodeOnlyLabel(c));
                if (!real) return;
                const rawAmount = it.sellPriceExclGst || 0;
                const amount = quote.hideOptionPrices ? 0 : rawAmount;
                lineItems.push({
                    label: real,
                    sub: (g?.category || g?.name) ? `${orgLabel} Fit · ${g.category || g.name}` : `${orgLabel} Fit`,
                    amount,
                    indent: true,
                });
                pushedAny = true;
            });
        });
        // Custom dealer-fit additions (operator-added items at quote time)
        const customDealerFit: any[] = Array.isArray(quote.customDealerFit) ? quote.customDealerFit : [];
        customDealerFit.forEach((it: any) => {
            const amount = it.sellPriceExclGst || it.amount || 0;
            lineItems.push({
                label: it.name || it.label || 'Custom accessory',
                sub: it.category ? `${orgLabel} Fit · ${it.category} · Custom` : `${orgLabel} Fit · Custom`,
                amount,
                indent: true,
            });
        });
        // Fallback rollup if we couldn't itemise (legacy quotes with no
        // dealerFit groups array) so the total still appears.
        if (!pushedAny && customDealerFit.length === 0 && f.dealerFitTotal > 0) {
            lineItems.push({ label: `${orgLabel} Accessories & Preparation`, sub: `Supplied & fitted by ${orgLabel}`, amount: f.dealerFitTotal });
        }
    }
    // v1.11 (Story 9.2.3 + "Toggle detailed view for customer") — Fit-Up
    // defaults to a SINGLE summary line on the customer PDF. When the
    // operator flips `customerDetailedView` on the quote, each fit-up
    // selection renders as its own line (customer-facing description,
    // qty × resolved unit price) — the opt-in to the locked 9.2.3
    // summary default. Operator-only notes never render either way.
    // v1.11 follow-up — package-aware fit-up rendering. When the operator
    // picked a tier package (Simple / Medium / Complex Fit-Up), the items
    // ride into the snapshot with packageId + packageName stamped. The PDF
    // groups by package so the customer sees the bundle they were sold
    // ("Medium Fit-Up Package — 4 items") instead of a flat dump of every
    // member item. À-la-carte items (no packageId) appear after the bundles.
    if (f.fitUpTotal > 0) {
        const sels = quote.fitUpSelections || [];
        const unitOf = (sel: any) => sel.priceOverride != null
            ? sel.priceOverride
            : (sel.sellPrice != null ? sel.sellPrice : (sel.cost || 0));
        const totalOf = (sel: any) => Math.max(1, sel.quantity ?? 1) * unitOf(sel);

        if (quote.customerDetailedView && sels.length > 0) {
            // Operator opted into full itemisation — every line.
            sels.forEach((sel: any) => {
                const qty = Math.max(1, sel.quantity ?? 1);
                const label = sel.customerDescription || sel.name || 'Fit-up item';
                lineItems.push({
                    label: qty > 1 ? `${label} ×${qty}` : label,
                    sub: sel.packageName ?? 'Fit-up & Rigging',
                    amount: qty * unitOf(sel),
                });
            });
        } else if (sels.length > 0 && sels.some((s: any) => s.packageId)) {
            // Default — bundle-aware rollup. Group by packageId; everything
            // without a packageId stays as a single "Additional Fit-up" line.
            const byPackage = new Map<string, { name: string; items: any[]; total: number }>();
            const loose: any[] = [];
            for (const sel of sels) {
                if (sel.packageId && sel.packageName) {
                    if (!byPackage.has(sel.packageId)) {
                        byPackage.set(sel.packageId, { name: sel.packageName, items: [], total: 0 });
                    }
                    const e = byPackage.get(sel.packageId)!;
                    e.items.push(sel);
                    e.total += totalOf(sel);
                } else {
                    loose.push(sel);
                }
            }
            for (const e of byPackage.values()) {
                lineItems.push({
                    label: `${e.name} Package`,
                    sub: `Fit-up & Rigging · ${e.items.length} component${e.items.length === 1 ? '' : 's'}`,
                    amount: e.total,
                });
            }
            if (loose.length > 0) {
                const looseTotal = loose.reduce((a, s) => a + totalOf(s), 0);
                lineItems.push({
                    label: 'Additional Fit-up & Rigging',
                    sub: `${loose.length} item${loose.length === 1 ? '' : 's'}`,
                    amount: looseTotal,
                });
            }
        } else {
            // Legacy / no packages — single rollup line.
            lineItems.push({ label: 'Fit-up & Rigging', sub: 'Installation & Preparation', amount: f.fitUpTotal });
        }
    }
    // FFR-33 — Display-Sheet quotes carry the PD tier (boat pre-delivery +
    // motor install + rigging labour) as a first-class package line, exactly
    // what NSM's own sheet means by "Including Pre Delivery and
    // Installation". Legacy quotes have no pdTier and skip this.
    if ((quote as any).pdTier?.sellIncGst > 0) {
        lineItems.push({
            label: 'Pre-Delivery & Installation',
            sub: `Boat PD · Motor Install · Rigging (${(quote as any).pdTier.estHrs || '—'} hrs)`,
            amount: (quote as any).pdTier.sellIncGst,
        });
    }
    // Registration & Compliance — itemised by component (boat rego, stickers,
    // tender-to decals, trailer rego) so the customer sees what every dollar
    // pays for. Falls back to a single rollup if none of the components have
    // an amount (defensive — legacy quotes might have only the rollup).
    if (f.regoTotal > 0) {
        const reg = quote.registration || {};
        const pushed: number[] = [];
        const tryPush = (label: string, amount: number) => {
            if (amount > 0) { lineItems.push({ label, sub: 'Government Fees', amount }); pushed.push(amount); }
        };
        tryPush('Boat Registration (12 months)', reg.boatRegoPrice || 0);
        tryPush('Registration Stickers (supply & fit)', reg.stickerPrice || 0);
        tryPush('"Tender To" Decals', reg.tenderToPrice || 0);
        tryPush('Trailer Registration (12 months)', reg.trailerRegoPrice || 0);
        if (pushed.length === 0) {
            lineItems.push({ label: 'Registration & Compliance', sub: 'Government Fees', amount: f.regoTotal });
        }
    }
    // Promotions / discounts — each applied promotion as its own NEGATIVE line
    // so the customer sees exactly which campaign saved them money. Renders
    // green at the table level via a sub-tag we'll look for at render time.
    const appliedPromos: any[] = Array.isArray(quote.appliedPromotions) ? quote.appliedPromotions : [];
    appliedPromos.forEach((p: any) => {
        const amount = p.fixedAmount || p.perHpAmount || 0;
        if (amount <= 0) return;
        lineItems.push({
            label: p.name || 'Promotion',
            sub: p.description ? `Discount · ${p.description}` : 'Discount',
            amount: -amount,
        });
    });

    const variantLabel = quote.variant?.name && quote.variant.name !== 'Standard'
        ? quote.variant.name
        : [quote.variant?.material, quote.variant?.colorName].filter(Boolean).join(' · ');

    return (
        <Document title={`Quote ${quote.quoteNumber} — ${quote.modelName}`} author={organisation?.name ?? 'HelmLogic'}>

            {/* ═══════════════════════════════════════════════════════════
                PAGE 1 — COVER

                v1.7 (1.8.11 polish): full-bleed background image, no
                solid white header band. The org logo sits on a soft
                top-down white gradient that blends into the image —
                gives logo legibility without a hard "header bar". When
                no cover image is set, falls back to a deep-navy full-
                page that reads as intentional rather than empty.
            ═══════════════════════════════════════════════════════════ */}
            <Page size="A4" style={S.page}>
                <View style={{ width: '100%', height: '100%', position: 'relative', backgroundColor: NAVY }}>

                    {/* Background — full-bleed cover crop. The 'contain' fit
                        we tried earlier letterboxed landscape photos with a
                        big grey gradient at the top that looked broken;
                        'cover' fills the page and matches the design's
                        intent (image-as-backdrop, gradients overlaying). */}
                    {quote.coverImageUrl ? (
                        <Image
                            src={pdfImg(quote.coverImageUrl, 1200)}
                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                    ) : null}

                    {/* Top-down white gradient — logo bar legibility (replaces the
                        old solid white band; blends into the image instead of
                        cutting it off with a hard line) */}
                    <Svg viewBox="0 0 595 200" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 200 }}>
                        <Defs>
                            <LinearGradient id="topWhite" x1="0" y1="0" x2="0" y2="1">
                                <Stop offset="0%" stopColor="white" stopOpacity="0.92" />
                                <Stop offset="60%" stopColor="white" stopOpacity="0.4" />
                                <Stop offset="100%" stopColor="white" stopOpacity="0" />
                            </LinearGradient>
                        </Defs>
                        <Rect x="0" y="0" width="595" height="200" fill="url(#topWhite)" />
                    </Svg>

                    {/* Bottom dark gradient — text legibility on customer info / total */}
                    <Svg viewBox="0 0 595 842" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
                        <Defs>
                            <LinearGradient id="bottomDark" x1="0" y1="0" x2="0" y2="1">
                                <Stop offset="40%" stopColor={NAVY} stopOpacity="0" />
                                <Stop offset="100%" stopColor={NAVY} stopOpacity="0.94" />
                            </LinearGradient>
                        </Defs>
                        <Rect x="0" y="0" width="595" height="842" fill="url(#bottomDark)" />
                    </Svg>

                    {/* Logo bar — overlays the top white gradient. Org logo
                        on the left, vendor logo on the right (the boat brand,
                        e.g. Highfield). Single right-side logo — no cascade. */}
                    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 48, paddingTop: 28, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 80 }}>
                        {/* v1.16 (bvAyUQVR) — Larger org logo. Was 40px tall × 160 max-w → 56px × 220. */}
                        {organisation?.primaryLogoUrl ? (
                            <Image src={pdfImg(organisation.primaryLogoUrl, 440)} style={{ height: 56, maxWidth: 220, objectFit: 'contain' }} />
                        ) : (
                            <Text style={{ fontSize: 13, fontWeight: 'bold', color: NAVY, letterSpacing: 1 }}>
                                {(organisation?.name ?? '').toUpperCase()}
                            </Text>
                        )}

                        {/* v1.16 (bvAyUQVR) — Larger vendor logo (same boost as org). */}
                        {quote.vendorLogoUrl ? (
                            <Image src={pdfImg(quote.vendorLogoUrl, 440)} style={{ height: 56, maxWidth: 220, objectFit: 'contain' }} />
                        ) : quote.vendorName ? (
                            <Text style={{ fontSize: 13, fontWeight: 'bold', color: NAVY, letterSpacing: 1 }}>
                                {quote.vendorName.toUpperCase()}
                            </Text>
                        ) : null}
                    </View>

                    {/* ── Bottom hero block ── */}
                    <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 48, paddingBottom: 52, flexDirection: 'column' }}>
                        {/* Premium badge — gold-rule + thin border on transparent fill
                            (was solid brand-blue rectangle) */}
                        <View style={{ alignSelf: 'flex-start', marginBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={{ width: 18, height: 1.5, backgroundColor: GOLD }} />
                            <Text style={{ fontSize: 7, fontWeight: 'bold', color: 'rgba(255,255,255,0.92)', letterSpacing: 3.5, textTransform: 'uppercase' }}>
                                Official Proposal
                            </Text>
                        </View>

                        {/* Range */}
                        <Text style={{ fontSize: 8, fontWeight: 'bold', color: '#60a5fa', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>
                            {quote.rangeName} Series
                        </Text>

                        {/* Model name — descenders on italic 56pt are tall;
                            lineHeight 1.05 + marginBottom 14 keeps clear of
                            the model-code line below. (v1.7 polish — fixes
                            cover overlap reported on round-3 feedback.) */}
                        <Text style={{ fontSize: 56, fontWeight: 'bold', fontStyle: 'italic', color: 'white', letterSpacing: -2, lineHeight: 1.05, marginBottom: 14 }}>
                            {quote.modelName}
                        </Text>
                        {/* Model code only when it's distinct from the name —
                            CL380 / SP560 etc. have name === code, so showing
                            both was a confusing visual repeat ("SP560 / SP560"). */}
                        {quote.modelCode && quote.modelCode !== quote.modelName ? (
                            <Text style={{ fontSize: 10, fontWeight: 'bold', color: 'rgba(255,255,255,0.45)', letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 22 }}>
                                {quote.modelCode}
                            </Text>
                        ) : <View style={{ marginBottom: 22 }} />}

                        {/* Premium accent — thin gold hairline + a thicker brand bar
                            below for visual hierarchy */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 26 }}>
                            <View style={{ width: 36, height: 1, backgroundColor: GOLD }} />
                            <View style={{ width: 80, height: 2, backgroundColor: 'rgba(255,255,255,0.4)' }} />
                        </View>

                        {/* Two-col: client + price */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                            <View>
                                <Text style={{ fontSize: 6.5, fontWeight: 'bold', color: 'rgba(255,255,255,0.4)', letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 6 }}>
                                    Prepared For
                                </Text>
                                <Text style={{ fontSize: 24, fontWeight: 'bold', color: 'white', marginBottom: 2, lineHeight: 1.1 }}>
                                    {quote.customer?.name}
                                </Text>
                                {quote.customer?.company && (
                                    <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.55)', marginBottom: 14 }}>
                                        {quote.customer.company}
                                    </Text>
                                )}
                                <View style={{ flexDirection: 'row', marginTop: quote.customer?.company ? 0 : 14 }}>
                                    <View style={{ marginRight: 22 }}>
                                        <Text style={{ fontSize: 6, fontWeight: 'bold', color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 3 }}>Quote No.</Text>
                                        <Text style={{ fontSize: 9, fontWeight: 'bold', color: 'white' }}>{quote.quoteNumber}</Text>
                                    </View>
                                    <View style={{ marginRight: 22 }}>
                                        <Text style={{ fontSize: 6, fontWeight: 'bold', color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 3 }}>Issued</Text>
                                        <Text style={{ fontSize: 9, fontWeight: 'bold', color: 'white' }}>{fmt(createdAt)}</Text>
                                    </View>
                                    <View>
                                        <Text style={{ fontSize: 6, fontWeight: 'bold', color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 3 }}>Valid Until</Text>
                                        <Text style={{ fontSize: 9, fontWeight: 'bold', color: 'white' }}>{fmt(validUntil)}</Text>
                                    </View>
                                </View>
                                {variantLabel && (
                                    <View style={{ marginTop: 14, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}>
                                        <Text style={{ fontSize: 7.5, fontWeight: 'bold', color: 'rgba(255,255,255,0.65)', letterSpacing: 0.8, textTransform: 'uppercase' }}>
                                            {variantLabel}
                                        </Text>
                                    </View>
                                )}
                            </View>

                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={{ fontSize: 6.5, fontWeight: 'bold', color: 'rgba(255,255,255,0.4)', letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 5 }}>
                                    Total Investment
                                </Text>
                                <Text style={{ fontSize: 44, fontWeight: 'bold', fontStyle: 'italic', color: 'white', letterSpacing: -2, lineHeight: 1 }}>
                                    {currency(f.totalInclGst)}
                                </Text>
                                <Text style={{ fontSize: 7, fontWeight: 'bold', color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 5 }}>
                                    Inclusive of GST
                                </Text>
                            </View>
                        </View>
                    </View>

                    {/* Bottom accent — brand bar with thin gold hairline above for
                        the premium-publication feel. */}
                    <View style={{ position: 'absolute', bottom: 4, left: 0, right: 0, height: 1, backgroundColor: GOLD }} />
                    <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, backgroundColor: BRAND }} />
                </View>
            </Page>

            {/* v1.7 round-5 — zoneA content blocks: each gets its OWN page
                with its OWN InnerHeader matching the block type. No more
                orphaned content under a mismatched system page header. */}
            {renderBlockPages(zones.zoneA)}

            {/* ═══════════════════════════════════════════════════════════
                PAGE — VESSEL CONFIGURATION (system, anchored)
            ═══════════════════════════════════════════════════════════ */}
            <Page size="A4" style={{ ...S.page, padding: 44, paddingBottom: 60 }}>
                <InnerHeader title="Your Build" sub="Every component of your package" quoteNumber={quote.quoteNumber} />

                {/* ════ YOUR BUILD — numbered card-stack of every component ════ */}
                {(() => {
                    const motorImg = quote.motor ? pdfImg(quote.motor.imageUrl || quote.motor.SummaryImage || quote.motor['SummaryImage'], 400) : undefined;
                    const vesselImg = pdfImg(quote.variant?.imageUrl || quote.coverImageUrl, 600);
                    // v1.11 launch — restore trailer image. Fall back across
                    // common shapes (snapshot vs catalog vs legacy).
                    const trailerImg = quote.trailer
                        ? pdfImg(
                            (quote.trailer as any).imageUrl
                            || (quote.trailer as any).catalog?.imageUrl
                            || (quote.trailer as any).catalog?.coverImageUrl,
                            500,
                        )
                        : undefined;

                    // headline vessel specs — pick the ones customers care about
                    const allSpecs: any[] = Array.isArray(quote.specifications?.otherSpecs) ? quote.specifications.otherSpecs : [];
                    const findSpec = (re: RegExp) => allSpecs.find((s: any) => re.test(String(s?.label || '')));
                    const headlineSpecs = [
                        findSpec(/overall length|length overall|\blength\b/i),
                        findSpec(/beam/i),
                        findSpec(/persons|capacity|people/i),
                        findSpec(/max\s*hp|maximum hp|max power/i),
                        findSpec(/dry weight|hull weight|\bweight\b/i),
                        findSpec(/fuel/i),
                    ].filter(Boolean) as any[];
                    const standardFeatures: string[] = Array.isArray(quote.standardFeatures) ? quote.standardFeatures : [];

                    // motor accessories
                    const motorAccs: any[] = quote.motor && Array.isArray(quote.motor.accessories) ? quote.motor.accessories : [];

                    // trailer specs
                    const tCatalog = (quote.trailer as any)?.catalog || null;
                    const tSpecs = tCatalog?.specifications || null;
                    const trailerSpecPills: { label: string; value: string }[] = [];
                    if (quote.trailer) {
                        if (tSpecs?.suitsBoatM != null || tSpecs?.suitsBoat) trailerSpecPills.push({ label: 'Suits Boat', value: String(tSpecs.suitsBoat ?? tSpecs.suitsBoatM + ' m') });
                        if (tSpecs?.atmKg != null) trailerSpecPills.push({ label: 'ATM', value: `${tSpecs.atmKg} kg` });
                        if (tSpecs?.tareKg != null) trailerSpecPills.push({ label: 'Tare', value: `${tSpecs.tareKg} kg` });
                        if (tSpecs?.wheelSize) trailerSpecPills.push({ label: 'Wheels', value: String(tSpecs.wheelSize) });
                        if (tSpecs?.brakes) trailerSpecPills.push({ label: 'Brakes', value: String(tSpecs.brakes) });
                        if (tSpecs?.couplingType) trailerSpecPills.push({ label: 'Coupling', value: String(tSpecs.couplingType) });
                    }
                    const trailerOptions: any[] = quote.trailer && Array.isArray(quote.trailer.options) ? quote.trailer.options : [];

                    // v1.11 follow-up — dealer fit is bucketed by scope (motor /
                    // trailer / boat) so the right items appear under the right
                    // build band. Older quotes without a scope field default to
                    // 'boat' so they stay in the dedicated dealer-fit band.
                    const dealerGroups: any[] = Array.isArray(quote.dealerFit) ? quote.dealerFit : [];
                    const dealerByScope: Record<'motor' | 'trailer' | 'boat', any[]> = { motor: [], trailer: [], boat: [] };
                    dealerGroups.forEach((g: any) => {
                        const scope: 'motor' | 'trailer' | 'boat' = (g?.scope === 'motor' || g?.scope === 'trailer') ? g.scope : 'boat';
                        (Array.isArray(g?.items) ? g.items : []).forEach((it: any) => {
                            const cand = [it.description, it.label, it.name].filter(Boolean) as string[];
                            const real = cand.find(c => !isCodeOnlyLabel(c));
                            if (!real) return;
                            dealerByScope[scope].push({ label: real, category: g?.category || g?.name || '', amount: it.sellPriceExclGst || 0 });
                        });
                    });
                    const customDealerFit: any[] = Array.isArray(quote.customDealerFit) ? quote.customDealerFit : [];
                    customDealerFit.forEach((it: any) => dealerByScope.boat.push({ label: it.name || it.label || 'Custom item', category: it.category || 'Custom', amount: it.sellPriceExclGst || it.amount || 0 }));
                    const dealerItems = dealerByScope.boat;
                    const motorDealerItems = dealerByScope.motor;
                    const trailerDealerItems = dealerByScope.trailer;

                    // fit-up — group by package
                    const fitSels: any[] = Array.isArray(quote.fitUpSelections) ? quote.fitUpSelections : [];
                    const fitGroups = new Map<string, { name: string | null; items: any[]; total: number }>();
                    for (const sel of fitSels) {
                        const key = sel.packageId || '__loose__';
                        if (!fitGroups.has(key)) fitGroups.set(key, { name: sel.packageName ?? null, items: [], total: 0 });
                        const g = fitGroups.get(key)!;
                        const unit = sel.priceOverride != null ? sel.priceOverride : (sel.sellPrice != null ? sel.sellPrice : (sel.cost || 0));
                        const line = Math.max(1, sel.quantity ?? 1) * unit;
                        g.items.push(sel); g.total += line;
                    }

                    let bandNo = 0;
                    return (
                        <View>
                            {/* ① VESSEL */}
                            <BuildBand
                                n={++bandNo}
                                title={`Vessel — ${quote.modelName}`}
                                subtitle={[quote.rangeName ? `${quote.rangeName} Series` : '', variantLabel].filter(Boolean).join(' · ')}
                                price={currency(f.boatBasePrice)}
                                image={vesselImg}
                                imagePlaceholder={<Text style={{ fontSize: 6, color: MUTED, textTransform: 'uppercase', letterSpacing: 1 }}>Vessel</Text>}
                            >
                                {headlineSpecs.length > 0 && (
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: standardFeatures.length > 0 ? 8 : 0 }}>
                                        {headlineSpecs.map((s: any, i: number) => (
                                            <SpecPill key={i} label={String(s.label)} value={String(s.value)} />
                                        ))}
                                    </View>
                                )}
                                {standardFeatures.length > 0 && (
                                    <View>
                                        <Text style={{ fontSize: 6, fontWeight: 'bold', letterSpacing: 1.5, textTransform: 'uppercase', color: BRAND, marginBottom: 4 }}>Standard Inclusions</Text>
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                                            {standardFeatures.map((feat: string, i: number) => (
                                                <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', width: '50%', marginBottom: 2, paddingRight: 8 }}>
                                                    <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: GREEN, marginTop: 3, marginRight: 4, flexShrink: 0 }} />
                                                    <Text style={{ fontSize: 7, color: SLATE, flexShrink: 1 }}>{feat}</Text>
                                                </View>
                                            ))}
                                        </View>
                                    </View>
                                )}
                            </BuildBand>

                            {/* ② PROPULSION */}
                            {quote.motor && (
                                <BuildBand
                                    n={++bandNo}
                                    title={`Propulsion — ${quote.motor.name}`}
                                    subtitle={quote.motor.brand || 'Outboard'}
                                    price={currency(f.motorTotal)}
                                    image={motorImg}
                                    imagePlaceholder={
                                        <View style={{ alignItems: 'center' }}>
                                            <Text style={{ fontSize: 11, fontWeight: 'bold', fontStyle: 'italic', color: SLATE }}>{quote.motor.hpRating || quote.motor['HP Rating'] || ''}</Text>
                                            <Text style={{ fontSize: 5.5, color: MUTED, textTransform: 'uppercase', letterSpacing: 1, marginTop: 1 }}>Outboard</Text>
                                        </View>
                                    }
                                >
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: motorAccs.length > 0 ? 8 : 0 }}>
                                        {[
                                            { label: 'HP', value: quote.motor.hpRating || quote.motor['HP Rating'] },
                                            { label: 'Shaft', value: quote.motor.shaftLength || quote.motor['Shaft Length'] },
                                            { label: 'Control', value: quote.motor.control || quote.motor['Control'] },
                                            { label: 'Starting', value: quote.motor.starting || quote.motor['Starting'] },
                                            { label: 'Tilt & Trim', value: quote.motor.tiltTrim || quote.motor['Tilt & Trim'] },
                                            { label: 'Propeller', value: quote.motor.prop || quote.motor['Prop'] },
                                        ].filter(s => s.value).map((s, i) => <SpecPill key={i} label={s.label} value={String(s.value)} />)}
                                    </View>
                                    {motorAccs.length > 0 && (
                                        <View style={{ marginBottom: motorDealerItems.length > 0 ? 6 : 0 }}>
                                            <Text style={{ fontSize: 6, fontWeight: 'bold', letterSpacing: 1.5, textTransform: 'uppercase', color: BRAND, marginBottom: 3 }}>Rigging & Accessories</Text>
                                            {motorAccs.map((a: any, i: number) => (
                                                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1.5 }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
                                                        <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: GREEN, marginRight: 4, flexShrink: 0 }} />
                                                        <Text style={{ fontSize: 7.5, color: SLATE, flexShrink: 1 }}>{a.name || a.label}</Text>
                                                    </View>
                                                    <Text style={{ fontSize: 7.5, fontWeight: 'bold', color: (a.sellPriceExclGst || 0) > 0 ? NAVY : MUTED, marginLeft: 8 }}>
                                                        {(a.sellPriceExclGst || 0) > 0 ? currency(a.sellPriceExclGst) : 'Incl.'}
                                                    </Text>
                                                </View>
                                            ))}
                                        </View>
                                    )}
                                    {/* Motor-scope dealer fit (v1.11 follow-up) — items the
                                        operator picked under motor-specific dealer-fit
                                        categories appear under the motor band, not in a
                                        separate dump at the bottom. */}
                                    {motorDealerItems.length > 0 && (
                                        <View>
                                            <Text style={{ fontSize: 6, fontWeight: 'bold', letterSpacing: 1.5, textTransform: 'uppercase', color: BRAND, marginBottom: 3 }}>Motor — Fitted by {orgLabel}</Text>
                                            {motorDealerItems.map((it: any, i: number) => (
                                                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1.5 }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
                                                        <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: GREEN, marginRight: 4, flexShrink: 0 }} />
                                                        <Text style={{ fontSize: 7.5, color: SLATE, flexShrink: 1 }}>{it.label}</Text>
                                                    </View>
                                                    <Text style={{ fontSize: 7.5, fontWeight: 'bold', color: (it.amount || 0) > 0 ? NAVY : MUTED, marginLeft: 8 }}>
                                                        {(it.amount || 0) > 0 ? currency(it.amount) : 'Incl.'}
                                                    </Text>
                                                </View>
                                            ))}
                                        </View>
                                    )}
                                </BuildBand>
                            )}

                            {/* ③ TRAILER — also shows trailer-scope dealer-fit items
                                ("trailer dealer fit") under the trailer band. Image
                                restored for v1.11 launch — when the catalog has a real
                                trailer photo it now renders here next to the specs;
                                when the URL is missing/blocked the BuildBand falls
                                back to the imagePlaceholder. Operators should mirror
                                trailer images into Firebase Storage if vendor CDNs
                                gate hot-linking. */}
                            {quote.trailer && (() => {
                                return (
                                <BuildBand
                                    n={++bandNo}
                                    title={`Trailer — ${quote.trailer.name || 'Trailer Package'}`}
                                    subtitle={quote.trailer.brand || tCatalog?.brandName || ''}
                                    price={currency(f.trailerTotal)}
                                    image={trailerImg}
                                    imagePlaceholder={<Text style={{ fontSize: 6, color: MUTED, textTransform: 'uppercase', letterSpacing: 1 }}>Trailer</Text>}
                                >
                                    {trailerSpecPills.length > 0 && (
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: (trailerOptions.length > 0 || trailerDealerItems.length > 0) ? 8 : 0 }}>
                                            {trailerSpecPills.map((s, i) => <SpecPill key={i} label={s.label} value={s.value} />)}
                                        </View>
                                    )}
                                    {trailerOptions.length > 0 && (
                                        <View>
                                            <Text style={{ fontSize: 6, fontWeight: 'bold', letterSpacing: 1.5, textTransform: 'uppercase', color: BRAND, marginBottom: 3 }}>Trailer Options</Text>
                                            {trailerOptions.map((o: any, i: number) => (
                                                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1.5 }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
                                                        <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: GREEN, marginRight: 4, flexShrink: 0 }} />
                                                        <Text style={{ fontSize: 7.5, color: SLATE, flexShrink: 1 }}>{o.name}</Text>
                                                    </View>
                                                    <Text style={{ fontSize: 7.5, fontWeight: 'bold', color: (o.sellPriceExclGst || 0) > 0 ? NAVY : MUTED, marginLeft: 8 }}>
                                                        {(o.sellPriceExclGst || 0) > 0 ? currency(o.sellPriceExclGst) : 'Incl.'}
                                                    </Text>
                                                </View>
                                            ))}
                                        </View>
                                    )}
                                    {/* Trailer-scope dealer fit (v1.11 follow-up) — items
                                        the operator picked under trailer-specific dealer-fit
                                        categories live here under the trailer band. */}
                                    {trailerDealerItems.length > 0 && (
                                        <View style={{ marginTop: trailerOptions.length > 0 ? 6 : 0 }}>
                                            <Text style={{ fontSize: 6, fontWeight: 'bold', letterSpacing: 1.5, textTransform: 'uppercase', color: BRAND, marginBottom: 3 }}>Trailer — Fitted by {orgLabel}</Text>
                                            {trailerDealerItems.map((it: any, i: number) => (
                                                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1.5 }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
                                                        <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: GREEN, marginRight: 4, flexShrink: 0 }} />
                                                        <Text style={{ fontSize: 7.5, color: SLATE, flexShrink: 1 }}>{it.label}</Text>
                                                    </View>
                                                    <Text style={{ fontSize: 7.5, fontWeight: 'bold', color: (it.amount || 0) > 0 ? NAVY : MUTED, marginLeft: 8 }}>
                                                        {(it.amount || 0) > 0 ? currency(it.amount) : 'Incl.'}
                                                    </Text>
                                                </View>
                                            ))}
                                        </View>
                                    )}
                                </BuildBand>
                                );
                            })()}

                            {/* ④ DEALER FIT */}
                            {dealerItems.length > 0 && (
                                <BuildBand
                                    n={++bandNo}
                                    title={`${orgLabel} Accessories & Preparation`}
                                    subtitle={`${dealerItems.length} accessory item${dealerItems.length === 1 ? '' : 's'} supplied & fitted`}
                                    price={currency(f.dealerFitTotal)}
                                >
                                    {dealerItems.map((it: any, i: number) => (
                                        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
                                                <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: GREEN, marginRight: 4, flexShrink: 0 }} />
                                                <Text style={{ fontSize: 7.5, color: SLATE, flexShrink: 1 }}>{it.label}</Text>
                                            </View>
                                            <Text style={{ fontSize: 7.5, fontWeight: 'bold', color: (it.amount || 0) > 0 ? NAVY : MUTED, marginLeft: 8 }}>
                                                {(it.amount || 0) > 0 ? currency(it.amount) : 'Incl.'}
                                            </Text>
                                        </View>
                                    ))}
                                </BuildBand>
                            )}

                            {/* ⑤ FIT-UP & RIGGING */}
                            {fitSels.length > 0 && (
                                <BuildBand
                                    n={++bandNo}
                                    title="Fit-Up & Rigging"
                                    subtitle={Array.from(fitGroups.values())[0]?.name ? `${Array.from(fitGroups.values())[0]?.name} Package · workshop installation & rigging` : `${fitSels.length} workshop installation item${fitSels.length === 1 ? '' : 's'}`}
                                    price={currency(f.fitUpTotal)}
                                >
                                    {Array.from(fitGroups.values()).map((g, gi) => (
                                        <View key={gi} style={{ marginBottom: gi < fitGroups.size - 1 ? 6 : 0 }}>
                                            {g.name && (
                                                <Text style={{ fontSize: 6, fontWeight: 'bold', letterSpacing: 1.2, textTransform: 'uppercase', color: BRAND, marginBottom: 3 }}>
                                                    {g.name} Package · {g.items.length} item{g.items.length === 1 ? '' : 's'}
                                                </Text>
                                            )}
                                            {g.items.map((sel: any, i: number) => {
                                                const label = sel.customerDescription || sel.name || 'Fit-up item';
                                                return (
                                                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 1.5 }}>
                                                        <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: GREEN, marginRight: 4, flexShrink: 0 }} />
                                                        <Text style={{ fontSize: 7.5, color: SLATE, flexShrink: 1 }}>{label}</Text>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    ))}
                                </BuildBand>
                            )}
                        </View>
                    );
                })()}

                {/* v1.7 (1.8.11) — page 2 ends after the system vessel-config block.
                    Content blocks that used to live here (brand-story, after-sales)
                    moved to page 3's zoneB before pricing — keeps the data-driven
                    model coherent (all narrative content blocks on page 3, technical
                    config on page 2). */}

                <InnerFooter organisation={organisation} quoteNumber={quote.quoteNumber} />
            </Page>

            {/* v1.7 round-5 — zoneB content blocks: each on its own page
                between the vessel-config and pricing-section anchors. */}
            {renderBlockPages(zones.zoneB)}

            {/* ═══════════════════════════════════════════════════════════
                PAGE — INVESTMENT SUMMARY (system, anchored)
            ═══════════════════════════════════════════════════════════ */}
            <Page size="A4" style={{ ...S.page, padding: 44, paddingBottom: 60 }}>
                <InnerHeader title="Investment Summary" sub="Comprehensive Package Breakdown" quoteNumber={quote.quoteNumber} />

                {/* Pricing table */}
                <View style={{ marginBottom: 28 }}>
                    {/* Header row — wrap={false} so the column labels stay attached
                        to the first line item when the table flows pages. */}
                    <View wrap={false} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: NAVY, marginBottom: 0 }}>
                        <Text style={{ fontSize: 7, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase', color: SLATE }}>Description</Text>
                        <Text style={{ fontSize: 7, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase', color: SLATE }}>Amount</Text>
                    </View>

                    {/* Line items — atomic per row so a row never splits across
                        pages. Three value styles:
                          - INCLUDED (amount === 0): grey "Included" tag
                          - DISCOUNT (amount < 0):   green negative number
                          - REGULAR (amount > 0):    navy currency */}
                    {/* v1.16 (Option E) — Investment Summary tightening. Reduced
                        vertical padding per row, smaller fonts on indented sub-items,
                        thinner sub-label spacing. The whole block now fits ~50%
                        more rows per page so a long quote doesn't bleed onto a
                        nearly-empty second page. */}
                    {/* v1.34 Yamaha Rebates — everybody sees the rebate: red
                        banner at the top of the Investment Summary with the
                        program name, the saving, and the offer link if set. */}
                    {(quote.motor as any)?.rebate && (
                        <View wrap={false} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#d3121a', borderRadius: 6, paddingVertical: 7, paddingHorizontal: 12, marginBottom: 8 }}>
                            <View style={{ flexShrink: 1, paddingRight: 12 }}>
                                <Text style={{ fontSize: 6, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase', color: '#fecaca' }}>Factory rebate applied</Text>
                                <Text style={{ fontSize: 9, fontWeight: 'bold', textTransform: 'uppercase', color: '#ffffff', marginTop: 1.5 }}>{(quote.motor as any).rebate.name}</Text>
                                {(quote.motor as any).rebate.linkUrl ? (
                                    <Text style={{ fontSize: 5.5, color: '#fee2e2', marginTop: 1.5 }}>{(quote.motor as any).rebate.linkUrl}</Text>
                                ) : null}
                            </View>
                            <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
                                <Text style={{ fontSize: 6, fontWeight: 'bold', letterSpacing: 1.5, textTransform: 'uppercase', color: '#fecaca' }}>You save</Text>
                                <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#ffffff' }}>{currency((quote.motor as any).rebate.discount)}</Text>
                            </View>
                        </View>
                    )}
                    {lineItems.map((item, i) => {
                        // v1.33 — mini divider heading inside the summary
                        // (Standard Inclusions / Factory Options split).
                        if (item.heading) {
                            return (
                                <View key={i} wrap={false} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 3, paddingLeft: 18, marginTop: 4 }}>
                                    <View style={{ width: 10, height: 2, backgroundColor: BRAND, marginRight: 5 }} />
                                    <Text style={{ fontSize: 6.5, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase', color: NAVY }}>{item.label}</Text>
                                </View>
                            );
                        }
                        const isIncluded = item.amount === 0;
                        const isDiscount = item.amount < 0;
                        const valueColor = isDiscount ? GREEN : (isIncluded ? MUTED : NAVY);
                        const indent = !!item.indent;
                        return (
                            <View key={i} wrap={false} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: indent ? 3 : 5, paddingLeft: indent ? 18 : 0, borderBottomWidth: 0.5, borderBottomColor: '#f1f5f9' }}>
                                <View style={{ flexShrink: 1, paddingRight: 12, flexDirection: 'row', alignItems: 'flex-start' }}>
                                    {indent && (
                                        <View style={{ width: 6, height: 6, borderLeftWidth: 1, borderBottomWidth: 1, borderColor: '#cbd5e1', marginRight: 5, marginTop: 2 }} />
                                    )}
                                    <View style={{ flexShrink: 1 }}>
                                        <Text style={{ fontSize: indent ? 7 : 8, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.3, color: indent ? SLATE : NAVY, lineHeight: 1.2 }}>{item.label}</Text>
                                        {item.sub && <Text style={{ fontSize: indent ? 5.5 : 6.5, fontWeight: 'bold', letterSpacing: 1.5, textTransform: 'uppercase', color: MUTED, marginTop: 1 }}>{item.sub}</Text>}
                                    </View>
                                </View>
                                <Text style={{ fontSize: indent ? 7 : 8, fontWeight: 'bold', color: valueColor, flexShrink: 0 }}>
                                    {isIncluded ? 'INCLUDED' : currency(item.amount)}
                                </Text>
                            </View>
                        );
                    })}

                    {/* Subtotal (if discount) */}
                    {f.subtotalExclGst !== f.finalTotalPriceExclGst && (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderTopWidth: 1, borderTopColor: BORDER }}>
                            <Text style={{ fontSize: 7.5, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase', color: SLATE, flexShrink: 0, marginLeft: 'auto', marginRight: 16 }}>Subtotal Excl. GST</Text>
                            <Text style={{ fontSize: 8.5, fontWeight: 'bold', color: SLATE }}>{currency(f.subtotalExclGst)}</Text>
                        </View>
                    )}
                    {f.subtotalExclGst !== f.finalTotalPriceExclGst && (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 }}>
                            <Text style={{ fontSize: 7.5, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase', color: GREEN, flexShrink: 0, marginLeft: 'auto', marginRight: 16 }}>Discount Applied</Text>
                            <Text style={{ fontSize: 8.5, fontWeight: 'bold', color: GREEN }}>-{currency(f.subtotalExclGst - f.finalTotalPriceExclGst)}</Text>
                        </View>
                    )}

                    {/* Totals block — wrapped together so Net + GST + Grand Total
                        never split across pages mid-summary. */}
                    <View wrap={false}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: BORDER }}>
                            <Text style={{ fontSize: 7.5, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase', color: SLATE, flexShrink: 0, marginLeft: 'auto', marginRight: 16 }}>Net Total Excl. GST</Text>
                            <Text style={{ fontSize: 11, fontWeight: 'bold', fontStyle: 'italic', color: NAVY }}>{currency(f.finalTotalPriceExclGst)}</Text>
                        </View>

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
                            <Text style={{ fontSize: 7.5, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase', color: MUTED, flexShrink: 0, marginLeft: 'auto', marginRight: 16 }}>GST (10%)</Text>
                            <Text style={{ fontSize: 8.5, fontWeight: 'bold', color: SLATE }}>{currency(f.gstAmount)}</Text>
                        </View>

                        {/* Grand total — gold hairline on top for the premium signal */}
                        <View style={{ height: 1, backgroundColor: GOLD, marginTop: 6 }} />
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: NAVY, borderRadius: 5, paddingHorizontal: 16, paddingVertical: 14, marginTop: 2 }}>
                            <Text style={{ fontSize: 8, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase', color: 'white' }}>Total Investment (Incl. GST)</Text>
                            <Text style={{ fontSize: 22, fontWeight: 'bold', fontStyle: 'italic', color: 'white', letterSpacing: -0.5 }}>{currency(f.totalInclGst)}</Text>
                        </View>
                    </View>
                </View>

                <InnerFooter organisation={organisation} quoteNumber={quote.quoteNumber} />
            </Page>

            {/* v1.7 round-5 — zoneC content blocks (Value Summary, T&Cs):
                each on its own page after the pricing-section anchor. */}
            {renderBlockPages(zones.zoneC)}

            {/* ═══════════════════════════════════════════════════════════
                PAGE — ACCEPTANCE (signatures, anchored)
            ═══════════════════════════════════════════════════════════ */}
            <Page size="A4" style={{ ...S.page, padding: 44, paddingBottom: 60 }}>
                <InnerHeader title="Acceptance" sub="Signatures & Confirmation" quoteNumber={quote.quoteNumber} />

                {/* Quote summary recap — a final at-a-glance reminder of what
                    the customer is signing off on, so the Acceptance page is
                    not just two signature boxes floating in white space. */}
                <View style={{ marginTop: 20, marginBottom: 24, padding: 16, borderWidth: 1, borderColor: BORDER, borderRadius: 6, backgroundColor: LIGHT }}>
                    <Text style={{ fontSize: 6.5, fontWeight: 'bold', letterSpacing: 2.5, textTransform: 'uppercase', color: MUTED, marginBottom: 8 }}>Quote Summary</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                        <View style={{ minWidth: 140 }}>
                            <Text style={{ fontSize: 6.5, fontWeight: 'bold', color: MUTED, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 3 }}>Vessel</Text>
                            <Text style={{ fontSize: 9, fontWeight: 'bold', color: NAVY }}>{quote.modelName}</Text>
                            {variantLabel && <Text style={{ fontSize: 7.5, color: SLATE }}>{variantLabel}</Text>}
                        </View>
                        <View style={{ minWidth: 140 }}>
                            <Text style={{ fontSize: 6.5, fontWeight: 'bold', color: MUTED, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 3 }}>Quote No.</Text>
                            <Text style={{ fontSize: 9, fontWeight: 'bold', color: NAVY }}>{quote.quoteNumber}</Text>
                            <Text style={{ fontSize: 7.5, color: SLATE }}>Valid until {fmt(validUntil)}</Text>
                        </View>
                        <View style={{ minWidth: 140 }}>
                            <Text style={{ fontSize: 6.5, fontWeight: 'bold', color: MUTED, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 3 }}>Total Investment</Text>
                            <Text style={{ fontSize: 13, fontWeight: 'bold', fontStyle: 'italic', color: NAVY }}>{currency(f.totalInclGst)}</Text>
                            <Text style={{ fontSize: 7, color: MUTED }}>Inclusive of GST</Text>
                        </View>
                    </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 40, marginBottom: 24 }}>
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 7, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 2, color: MUTED, marginBottom: 12 }}>Merchant Authorisation</Text>
                        <View style={{ height: 70, borderBottomWidth: 1, borderBottomColor: '#cbd5e1' }} />
                        <Text style={{ fontSize: 8, fontWeight: 'bold', color: SLATE, marginTop: 8 }}>{quote.createdByName} — {organisation?.name}</Text>
                        <Text style={{ fontSize: 7, color: MUTED, marginTop: 2 }}>Date: _____ / _____ / _____</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 7, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 2, color: MUTED, marginBottom: 12 }}>Client Acceptance</Text>
                        <View style={{ height: 70, borderBottomWidth: 1, borderBottomColor: '#cbd5e1' }} />
                        <Text style={{ fontSize: 8, fontWeight: 'bold', color: SLATE, marginTop: 8 }}>{quote.customer?.name}</Text>
                        <Text style={{ fontSize: 7, color: MUTED, marginTop: 2 }}>Date: _____ / _____ / _____</Text>
                    </View>
                </View>

                {/* "Questions?" closing block — gives the page a meaningful body
                    instead of a sea of whitespace below the signature lines. */}
                <View style={{ padding: 16, borderWidth: 1, borderColor: BORDER, borderRadius: 6 }}>
                    <Text style={{ fontSize: 6.5, fontWeight: 'bold', letterSpacing: 2.5, textTransform: 'uppercase', color: MUTED, marginBottom: 8 }}>Questions about this proposal?</Text>
                    <Text style={{ fontSize: 9, color: NAVY, marginBottom: 6 }}>
                        Your consultant {quote.createdByName ?? 'at ' + (organisation?.name ?? 'the dealership')} is the best person to walk you through any details — pricing, specifications, delivery timing, finance options or trade-ins.
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 18, marginTop: 6 }}>
                        {organisation?.phoneNumber && (
                            <View>
                                <Text style={{ fontSize: 6.5, fontWeight: 'bold', color: MUTED, letterSpacing: 1.5, textTransform: 'uppercase' }}>Phone</Text>
                                <Text style={{ fontSize: 9, color: NAVY, marginTop: 1 }}>{organisation.phoneNumber}</Text>
                            </View>
                        )}
                        {organisation?.email && (
                            <View>
                                <Text style={{ fontSize: 6.5, fontWeight: 'bold', color: MUTED, letterSpacing: 1.5, textTransform: 'uppercase' }}>Email</Text>
                                <Text style={{ fontSize: 9, color: NAVY, marginTop: 1 }}>{organisation.email}</Text>
                            </View>
                        )}
                        {organisation?.address && (
                            <View style={{ flexShrink: 1 }}>
                                <Text style={{ fontSize: 6.5, fontWeight: 'bold', color: MUTED, letterSpacing: 1.5, textTransform: 'uppercase' }}>Visit</Text>
                                <Text style={{ fontSize: 9, color: NAVY, marginTop: 1 }}>{organisation.address}</Text>
                            </View>
                        )}
                    </View>
                </View>

                {/* Footer with org details */}
                <View style={{ marginTop: 'auto', borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View>
                        <Text style={{ fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase', color: NAVY, marginBottom: 5 }}>{organisation?.name}</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                            {organisation?.address && (
                                <Text style={{ fontSize: 7, color: SLATE, marginRight: 14 }}>{organisation.address}</Text>
                            )}
                            {organisation?.phoneNumber && (
                                <Text style={{ fontSize: 7, color: SLATE, marginRight: 14 }}>{organisation.phoneNumber}</Text>
                            )}
                            {organisation?.email && (
                                <Text style={{ fontSize: 7, color: SLATE }}>{organisation.email}</Text>
                            )}
                        </View>
                    </View>
                    <Text style={{ fontSize: 6.5, fontStyle: 'italic', color: MUTED, maxWidth: 180, textAlign: 'right' }}>
                        © {new Date().getFullYear()} HelmLogic. All prices in AUD unless otherwise stated.
                    </Text>
                </View>
            </Page>
        </Document>
    );
}

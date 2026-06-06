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
const BRAND  = '#0c2a4d'; // deep navy-blue — primary
const NAVY   = '#0f172a';
const SLATE  = '#475569';
const MUTED  = '#94a3b8';
const BORDER = '#e2e8f0';
const LIGHT  = '#f8fafc';
const GREEN  = '#10b981';
const GOLD   = '#a07a2c'; // hairline gold accent on cover

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
    pageFooter: { marginTop: 'auto', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 10 },
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
    return (
        <View style={S.pageFooter}>
            <View style={{ flexDirection: 'row', gap: 16, flex: 1 }}>
                <Text style={S.pageFooterText}>{organisation?.name}</Text>
                {organisation?.phoneNumber && <Text style={S.pageFooterMuted}>{organisation.phoneNumber}</Text>}
            </View>
            <Text
                style={[S.pageFooterMuted, { flex: 1, textAlign: 'center' }]}
                render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
                fixed
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

function pdfImg(url: string | undefined | null, w = 700): string | undefined {
    if (!url || typeof url !== 'string') return undefined;
    const u = url.trim();
    if (!u) return undefined;
    if (u.startsWith('data:')) return u;
    if (BLOCKED_IMAGE_DOMAINS.some(d => u.includes(d))) return undefined;
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

export function ProposalPDFDocument({ quote, organisation, financials, contentBlocks, contentBlockSubHeaders, pdfSections, salespersonProfile }: Props) {
    const zones = partitionContentBlocks(pdfSections ?? DEFAULT_SECTIONS);

    /** v1.7 round-5 — each content block now renders as its OWN PAGE
     *  with its OWN InnerHeader matching the block type. Fixes the
     *  earlier bug where zoneA blocks rendered under the "Vessel
     *  Configuration" header on page 2 (orphan content under the wrong
     *  header). T&Cs keeps its fallback chain (authored → legacy
     *  org.termsAndConditions → DEFAULT_TERMS). Empty blocks (no
     *  authored content, no fallback) emit nothing. */
    const renderBlockPages = (zoneSections: PdfStructureSection[]) =>
        zoneSections
            .map(s => {
                const blockType = s.key as BlockType;
                const html = contentBlocks?.[blockType];
                const label = BLOCK_TYPE_LABEL[blockType] ?? s.key;
                const customSub = contentBlockSubHeaders?.[blockType];
                const sub = (customSub && customSub.trim()) || SECTION_SUB[blockType] || '';

                // Salesperson-message — bespoke layout (photo + name + sign-off).
                if (blockType === 'salesperson-message') {
                    const sp = salespersonProfile;
                    const spHtml = sp?.messageHtml;
                    if (!sp || !spHtml || !spHtml.trim()) return null;
                    const spSub = (customSub && customSub.trim())
                        || `From ${sp.displayName ?? 'Your Salesperson'}${sp.role ? ` · ${sp.role}` : ''}`;
                    return (
                        <Page key={s.id} size="A4" style={{ ...S.page, padding: 44 }}>
                            <InnerHeader title={label} sub={spSub} quoteNumber={quote.quoteNumber} />
                            <View style={{ flexDirection: 'row', gap: 18 }}>
                                {sp.photoUrl ? (
                                    <Image src={pdfImg(sp.photoUrl, 240)} style={{ height: 110, width: 110, borderRadius: 55, objectFit: 'cover' }} />
                                ) : null}
                                <View style={{ flex: 1 }}>
                                    <TipTapHtmlPdf html={substituteCustomerTokens(spHtml, quote)} fontSize={10} color={SLATE} />
                                    {sp.signOff ? (
                                        <Text style={{ fontSize: 10, fontStyle: 'italic', color: SLATE, marginTop: 12 }}>{sp.signOff}</Text>
                                    ) : null}
                                </View>
                            </View>
                            <InnerFooter organisation={organisation} quoteNumber={quote.quoteNumber} />
                        </Page>
                    );
                }

                // T&Cs fallback chain — always renders even if no block is
                // authored. Treats tag-only content ("<p></p>", "<p><br></p>")
                // as empty too so the page doesn't render blank when an org
                // has an "empty" authored block left over from a previous
                // version of the content manager.
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
                        <Page key={s.id} size="A4" style={{ ...S.page, padding: 44 }}>
                            <InnerHeader title={label} sub={sub} quoteNumber={quote.quoteNumber} />
                            {lines.map((t: string, i: number, arr: string[]) => (
                                <Text key={i} style={{ fontSize: 9, color: SLATE, lineHeight: 1.6, marginBottom: i < arr.length - 1 ? 5 : 0 }}>{t}</Text>
                            ))}
                            <InnerFooter organisation={organisation} quoteNumber={quote.quoteNumber} />
                        </Page>
                    );
                }

                // Generic content block — only render if html has real content
                // (tag-only HTML counts as empty so we don't emit blank pages).
                if (htmlEmpty) return null;
                return (
                    <Page key={s.id} size="A4" style={{ ...S.page, padding: 44 }}>
                        <InnerHeader title={label} sub={sub} quoteNumber={quote.quoteNumber} />
                        <TipTapHtmlPdf html={html} fontSize={10} color={SLATE} />
                        <InnerFooter organisation={organisation} quoteNumber={quote.quoteNumber} />
                    </Page>
                );
            })
            .filter(Boolean);

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

    const lineItems: { label: string; sub?: string; amount: number }[] = [];
    if (f.boatBasePrice > 0) lineItems.push({
        label: `${quote.modelName} — Base Vessel`,
        sub: quote.variant?.name && quote.variant.name !== 'Standard'
            ? quote.variant.name
            : [quote.variant?.material, quote.variant?.colorName].filter(Boolean).join(' · '),
        amount: f.boatBasePrice,
    });
    factoryOptions.forEach((opt: any) => {
        const base = formatOptionName(opt.name.replace(/\s*\([^)]+\)\s*$/, '').trim());
        const color = extractFirstColor(opt.name);
        lineItems.push({ label: color ? `${base} (${color})` : base, sub: opt.category, amount: opt.sellPriceExclGst || 0 });
    });
    // Motor — base + each accessory as its own line so the customer sees the
    // full propulsion build. quote.motor.accessories[] is the v1.11 accessory
    // snapshot (props, rigging, controls, etc.).
    if (quote.motor) {
        const motorAccs: any[] = Array.isArray(quote.motor.accessories) ? quote.motor.accessories : [];
        const accsTotal = motorAccs.reduce((s, a) => s + (a.sellPriceExclGst || 0), 0);
        const motorBase = (f.motorTotal ?? 0) - accsTotal;
        lineItems.push({
            label: quote.motor.name,
            sub: `${quote.motor.brand ?? 'Outboard'} — Propulsion`,
            amount: motorBase > 0 ? motorBase : (f.motorTotal ?? 0),
        });
        motorAccs.forEach(a => {
            if ((a.sellPriceExclGst || 0) <= 0) return;
            lineItems.push({
                label: a.name || a.label || 'Motor accessory',
                sub: a.category ? `Motor · ${a.category}` : 'Motor accessory',
                amount: a.sellPriceExclGst || 0,
            });
        });
    }
    // Trailer — base + each option as its own line.
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
            if ((o.sellPriceExclGst || 0) <= 0) return;
            lineItems.push({
                label: o.name || 'Trailer option',
                sub: o.category ? `Trailer · ${o.category}` : 'Trailer option',
                amount: o.sellPriceExclGst || 0,
            });
        });
    }
    // Dealer fit — every selection as its own line (was a single rollup).
    // Filters code-only labels the same way the Vessel Configuration section
    // does so noise doesn't bleed into the Investment Summary.
    if (f.dealerFitTotal > 0) {
        const groups: any[] = Array.isArray(quote.dealerFit) ? quote.dealerFit : [];
        let pushedAny = false;
        groups.forEach((g: any) => {
            const items: any[] = Array.isArray(g?.items) ? g.items : [];
            items.forEach((it: any) => {
                const labelCandidates = [it.description, it.label, it.name].filter(Boolean) as string[];
                const real = labelCandidates.find(c => !isCodeOnlyLabel(c));
                if (!real) return;
                const amount = it.sellPriceExclGst || 0;
                if (amount <= 0) return;
                lineItems.push({
                    label: real,
                    sub: (g?.category || g?.name) ? `Dealer Fit · ${g.category || g.name}` : 'Dealer Fit',
                    amount,
                });
                pushedAny = true;
            });
        });
        // Fallback to the rollup line if we couldn't itemise (legacy quotes
        // with no dealerFit groups array) so the total still appears.
        if (!pushedAny) {
            lineItems.push({ label: 'Dealer Accessories & Preparation', sub: 'Dealer Fitout', amount: f.dealerFitTotal });
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
    if (f.regoTotal > 0) lineItems.push({ label: 'Registration & Compliance', sub: 'Government Fees', amount: f.regoTotal });

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

                    {/* Background — full-bleed image OR deep navy fallback */}
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
                        {/* Org logo */}
                        {organisation?.primaryLogoUrl ? (
                            <Image src={pdfImg(organisation.primaryLogoUrl, 320)} style={{ height: 40, maxWidth: 160, objectFit: 'contain' }} />
                        ) : (
                            <Text style={{ fontSize: 13, fontWeight: 'bold', color: NAVY, letterSpacing: 1 }}>
                                {(organisation?.name ?? '').toUpperCase()}
                            </Text>
                        )}

                        {/* Vendor (boat brand) logo on the right */}
                        {quote.vendorLogoUrl ? (
                            <Image src={pdfImg(quote.vendorLogoUrl, 320)} style={{ height: 40, maxWidth: 160, objectFit: 'contain' }} />
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
                        <Text style={{ fontSize: 10, fontWeight: 'bold', color: 'rgba(255,255,255,0.45)', letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 22 }}>
                            {quote.modelCode}
                        </Text>

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
            <Page size="A4" style={{ ...S.page, padding: 44 }}>
                <InnerHeader title="Vessel Configuration" sub="Technical Data & Standard Inclusions" quoteNumber={quote.quoteNumber} />

                {/* Specs + Standard Features */}
                {(quote.specifications?.otherSpecs?.length > 0 || quote.standardFeatures?.length > 0) && (
                    <View style={{ flexDirection: 'row', gap: 24, marginBottom: 22 }}>
                        {/* Tech specs */}
                        {quote.specifications?.otherSpecs?.length > 0 && (
                            <View style={{ flex: 1 }}>
                                <Text style={S.sectionLabel}>Technical Data</Text>
                                <View style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 5, overflow: 'hidden' }}>
                                    {quote.specifications.otherSpecs.map((s: any, i: number) => (
                                        <View key={i} style={{
                                            flexDirection: 'row',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: '5 10',
                                            backgroundColor: i % 2 === 0 ? LIGHT : 'white',
                                            borderTopWidth: i > 0 ? 1 : 0,
                                            borderTopColor: '#f1f5f9',
                                        }}>
                                            <Text style={{ fontSize: 7.5, color: SLATE, fontStyle: 'italic' }}>{s.label}</Text>
                                            <Text style={{ fontSize: 7.5, fontWeight: 'bold', color: NAVY }}>{s.value}</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        )}

                        {/* Standard features */}
                        {quote.standardFeatures?.length > 0 && (
                            <View style={{ flex: 1 }}>
                                <Text style={S.sectionLabel}>Standard Features</Text>
                                {quote.standardFeatures.slice(0, 22).map((feat: string, i: number) => (
                                    <View key={i} style={{ flexDirection: 'row', marginBottom: 3 }}>
                                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: GREEN, marginRight: 6, marginTop: 1.5, flexShrink: 0 }} />
                                        <Text style={{ fontSize: 7.5, color: SLATE, lineHeight: 1.4, flexShrink: 1 }}>{feat}</Text>
                                    </View>
                                ))}
                                {quote.standardFeatures.length > 22 && (
                                    <Text style={{ fontSize: 7, fontStyle: 'italic', color: MUTED, marginTop: 3, marginLeft: 12 }}>
                                        +{quote.standardFeatures.length - 22} additional standard features
                                    </Text>
                                )}
                            </View>
                        )}
                    </View>
                )}

                {/* Factory Options */}
                {factoryOptions.length > 0 && (
                    <View style={{ marginBottom: 20 }}>
                        <Text style={S.sectionLabel}>Selected Factory Options</Text>
                        <View style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 5, overflow: 'hidden' }}>
                            {Object.entries(optionGroups).map(([cat, opts], gi) => (
                                <View key={cat}>
                                    <View style={{
                                        backgroundColor: '#f1f5f9',
                                        paddingHorizontal: 10,
                                        paddingVertical: 5,
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        borderTopWidth: gi > 0 ? 1 : 0,
                                        borderTopColor: BORDER,
                                    }}>
                                        <Text style={{ fontSize: 6.5, fontWeight: 'bold', letterSpacing: 2, color: BRAND, textTransform: 'uppercase' }}>{cat}</Text>
                                        <View style={{ marginLeft: 8, backgroundColor: BRAND, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 }}>
                                            <Text style={{ fontSize: 5.5, fontWeight: 'bold', color: 'white' }}>{(opts as any[]).length}</Text>
                                        </View>
                                    </View>
                                    {(opts as any[]).map((opt: any, i: number) => {
                                        const base = formatOptionName(opt.name.replace(/\s*\([^)]+\)\s*$/, '').trim());
                                        const color = extractFirstColor(opt.name);
                                        return (
                                            <View key={opt.id || i} style={{
                                                flexDirection: 'row',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                paddingHorizontal: 10,
                                                paddingVertical: 5,
                                                borderTopWidth: 1,
                                                borderTopColor: '#f8fafc',
                                            }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
                                                    {opt.imageUrl ? (
                                                        <Image src={pdfImg(opt.imageUrl, 120)} style={{ width: 24, height: 24, objectFit: 'contain', marginRight: 7, borderRadius: 2, flexShrink: 0 }} />
                                                    ) : (
                                                        <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: GREEN, marginRight: 7, flexShrink: 0 }} />
                                                    )}
                                                    <Text style={{ fontSize: 7.5, fontWeight: 'bold', color: NAVY, flexShrink: 1, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                                                        {base}{color ? ` (${color})` : ''}
                                                    </Text>
                                                </View>
                                                <Text style={{ fontSize: 7.5, fontWeight: 'bold', color: SLATE, flexShrink: 0, marginLeft: 12 }}>
                                                    {opt.sellPriceExclGst ? currency(opt.sellPriceExclGst) : 'Incl.'}
                                                </Text>
                                            </View>
                                        );
                                    })}
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {/* Motor */}
                {quote.motor && (() => {
                    const motorSpecs = [
                        { label: 'HP Rating', value: quote.motor.hpRating || quote.motor['HP Rating'] },
                        { label: 'Shaft Length', value: quote.motor.shaftLength || quote.motor['Shaft Length'] },
                        { label: 'Control', value: quote.motor.control || quote.motor['Control'] },
                        { label: 'Starting', value: quote.motor.starting || quote.motor['Starting'] },
                        { label: 'Tilt & Trim', value: quote.motor.tiltTrim || quote.motor['Tilt & Trim'] },
                        { label: 'Fuel Tank', value: quote.motor.fuelTank || quote.motor['Fuel Tank'] },
                        { label: 'Propeller', value: quote.motor.prop || quote.motor['Prop'] },
                        { label: 'Warranty', value: quote.motor.warranty || quote.motor['Warranty'] },
                    ].filter(s => s.value);
                    return (
                    <View style={{ backgroundColor: LIGHT, borderWidth: 1, borderColor: BORDER, borderRadius: 6, padding: 14, marginBottom: 14 }}>
                        {/* Motor header — left: title + brand. Right: price.
                            Photo (when present) sits as a banner ABOVE the
                            specs grid so it doesn't crash into the price.
                            Card can flow across pages; individual sub-views
                            below carry their own wrap={false} where needed. */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: quote.motor.imageUrl ? 10 : 0 }}>
                            <View style={{ flexShrink: 1, flex: 1, paddingRight: 14 }}>
                                <Text style={[S.sectionLabel, { marginBottom: 4 }]}>Propulsion System</Text>
                                {quote.motor.brandLogoUrl && (
                                    <Image src={pdfImg(quote.motor.brandLogoUrl, 160)} style={{ height: 16, maxWidth: 70, objectFit: 'contain', marginBottom: 4 }} />
                                )}
                                <Text style={{ fontSize: 15, fontWeight: 'bold', fontStyle: 'italic', textTransform: 'uppercase', letterSpacing: -0.3, color: NAVY, marginBottom: 2 }}>
                                    {quote.motor.name}
                                </Text>
                                <Text style={{ fontSize: 8, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase', color: SLATE }}>
                                    {quote.motor.brand}
                                </Text>
                            </View>
                            <Text style={{ fontSize: 14, fontWeight: 'bold', fontStyle: 'italic', color: NAVY, flexShrink: 0 }}>{currency(quote.motor.sellPriceExclGst || 0)}</Text>
                        </View>
                        {quote.motor.imageUrl && (
                            <Image src={pdfImg(quote.motor.imageUrl, 600)} style={{ width: '100%', height: 140, objectFit: 'contain', backgroundColor: LIGHT, borderRadius: 4, marginBottom: 6 }} />
                        )}

                        {/* Motor Specifications */}
                        {motorSpecs.length > 0 && (
                            <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: BORDER }}>
                                <Text style={{ fontSize: 6, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase', color: BRAND, marginBottom: 6 }}>Motor Specifications</Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                                    {motorSpecs.map((spec, i) => (
                                        <View key={i} style={{ width: '25%', marginBottom: 6, paddingRight: 8 }}>
                                            <Text style={{ fontSize: 5.5, fontWeight: 'bold', letterSpacing: 1.5, textTransform: 'uppercase', color: MUTED, marginBottom: 1.5 }}>{spec.label}</Text>
                                            <Text style={{ fontSize: 7.5, fontWeight: 'bold', color: NAVY }}>{spec.value}</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        )}

                        {/* Motor Accessories */}
                        {(quote.motor.accessories?.length > 0) && (
                            <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: BORDER }}>
                                <Text style={{ fontSize: 6, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase', color: BRAND, marginBottom: 4 }}>Motor Accessories</Text>
                                {Object.entries(
                                    (quote.motor.accessories as any[]).reduce((acc: Record<string, any[]>, a: any) => {
                                        const cat = a.category || 'Accessories';
                                        if (!acc[cat]) acc[cat] = [];
                                        acc[cat].push(a);
                                        return acc;
                                    }, {})
                                ).map(([cat, items]) => (
                                    <View key={cat} style={{ marginBottom: 5 }}>
                                        <Text style={{ fontSize: 6, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase', color: SLATE, marginBottom: 4 }}>{cat}</Text>
                                        {(items as any[]).map((acc: any, i: number) => (
                                            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2, paddingHorizontal: 4 }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
                                                    {acc.imageUrl ? (
                                                        <Image src={pdfImg(acc.imageUrl, 80)} style={{ width: 20, height: 20, objectFit: 'contain', marginRight: 5, borderRadius: 2, flexShrink: 0 }} />
                                                    ) : (
                                                        <View style={S.dot} />
                                                    )}
                                                    <Text style={{ fontSize: 7, color: SLATE }}>{acc.name}</Text>
                                                </View>
                                                <Text style={{ fontSize: 7, fontWeight: 'bold', color: NAVY, flexShrink: 0, marginLeft: 8 }}>
                                                    {acc.sellPriceExclGst ? currency(acc.sellPriceExclGst) : 'Incl.'}
                                                </Text>
                                            </View>
                                        ))}
                                    </View>
                                ))}
                            </View>
                        )}

                        {/* Motor Subtotal */}
                        <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: BORDER, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={{ fontSize: 7, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase', color: SLATE }}>Motor Total</Text>
                            <Text style={{ fontSize: 11, fontWeight: 'bold', fontStyle: 'italic', color: NAVY }}>{currency(f.motorTotal)}</Text>
                        </View>
                    </View>
                    );
                })()}

                {/* Trailer — fully-specced layout matching the motor block:
                    photo + brand + name + price · specifications grid ·
                    options list · subtotal. Mirrors the motor layout so the
                    customer sees a consistent treatment for every major
                    component of the package. */}
                {quote.trailer && (() => {
                    const catalog = (quote.trailer as any).catalog || null;
                    const specs = catalog?.specifications || null;
                    const trailerImg = quote.trailer.imageUrl || catalog?.imageUrl || null;
                    const trailerBrand = quote.trailer.brand || catalog?.brandName || '';

                    const trailerSpecs: { label: string; value: any }[] = [];
                    if (specs?.boatSizeMtr != null) trailerSpecs.push({ label: 'Suits Boat', value: formatMetres(specs.boatSizeMtr) });
                    if (specs?.lengthMtr != null) trailerSpecs.push({ label: 'Trailer Length', value: formatMetres(specs.lengthMtr) });
                    if (specs?.widthMtr != null) trailerSpecs.push({ label: 'Width', value: formatMetres(specs.widthMtr) });
                    if (specs?.atmKg != null) trailerSpecs.push({ label: 'ATM', value: `${specs.atmKg} kg` });
                    if (specs?.tareKg != null) trailerSpecs.push({ label: 'Tare', value: `${specs.tareKg} kg` });
                    if (specs?.axleType) trailerSpecs.push({ label: 'Axle', value: specs.axleType });
                    if (specs?.wheelSize) trailerSpecs.push({ label: 'Wheels', value: specs.wheelSize });
                    if (specs?.brakes) trailerSpecs.push({ label: 'Brakes', value: specs.brakes });
                    if (specs?.winch) trailerSpecs.push({ label: 'Winch', value: specs.winch });
                    if (specs?.couplingType) trailerSpecs.push({ label: 'Coupling', value: specs.couplingType });
                    if (specs?.lights) trailerSpecs.push({ label: 'Lights', value: specs.lights });
                    if (specs?.construction) trailerSpecs.push({ label: 'Construction', value: specs.construction });

                    const trailerOptions: any[] = Array.isArray(quote.trailer.options) ? quote.trailer.options : [];

                    return (
                        <View style={{ backgroundColor: LIGHT, borderWidth: 1, borderColor: BORDER, borderRadius: 6, padding: 14, marginBottom: 14 }}>
                            {/* Trailer header — left: title + brand. Right: price.
                                Photo (when present) is a banner above the
                                specs grid (matches motor section layout). */}
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: trailerImg ? 10 : 0 }}>
                                <View style={{ flexShrink: 1, flex: 1, paddingRight: 14 }}>
                                    <Text style={[S.sectionLabel, { marginBottom: 4 }]}>Trailer Package</Text>
                                    {quote.trailer.brandLogoUrl && (
                                        <Image src={pdfImg(quote.trailer.brandLogoUrl, 160)} style={{ height: 16, maxWidth: 70, objectFit: 'contain', marginBottom: 4 }} />
                                    )}
                                    <Text style={{ fontSize: 15, fontWeight: 'bold', fontStyle: 'italic', textTransform: 'uppercase', letterSpacing: -0.3, color: NAVY, marginBottom: 2 }}>
                                        {quote.trailer.name || 'Trailer'}
                                    </Text>
                                    {trailerBrand ? (
                                        <Text style={{ fontSize: 8, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase', color: SLATE }}>
                                            {trailerBrand}
                                        </Text>
                                    ) : null}
                                </View>
                                <Text style={{ fontSize: 14, fontWeight: 'bold', fontStyle: 'italic', color: NAVY, flexShrink: 0 }}>{currency(quote.trailer.sellPriceExclGst || 0)}</Text>
                            </View>
                            {trailerImg && (
                                <Image src={pdfImg(trailerImg, 600)} style={{ width: '100%', height: 140, objectFit: 'contain', backgroundColor: LIGHT, borderRadius: 4, marginBottom: 6 }} />
                            )}

                            {/* Trailer Specifications */}
                            {trailerSpecs.length > 0 && (
                                <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: BORDER }}>
                                    <Text style={{ fontSize: 6, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase', color: BRAND, marginBottom: 6 }}>Trailer Specifications</Text>
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                                        {trailerSpecs.map((spec, i) => (
                                            <View key={i} style={{ width: '25%', marginBottom: 6, paddingRight: 8 }}>
                                                <Text style={{ fontSize: 5.5, fontWeight: 'bold', letterSpacing: 1.5, textTransform: 'uppercase', color: MUTED, marginBottom: 1.5 }}>{spec.label}</Text>
                                                <Text style={{ fontSize: 7.5, fontWeight: 'bold', color: NAVY }}>{spec.value}</Text>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                            )}

                            {/* Trailer Options */}
                            {trailerOptions.length > 0 && (
                                <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: BORDER }}>
                                    <Text style={{ fontSize: 6, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase', color: BRAND, marginBottom: 4 }}>Trailer Options</Text>
                                    {Object.entries(
                                        trailerOptions.reduce((acc: Record<string, any[]>, o: any) => {
                                            const cat = o.category || 'Options';
                                            if (!acc[cat]) acc[cat] = [];
                                            acc[cat].push(o);
                                            return acc;
                                        }, {})
                                    ).map(([cat, items]) => (
                                        <View key={cat} style={{ marginBottom: 5 }}>
                                            <Text style={{ fontSize: 6, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase', color: SLATE, marginBottom: 4 }}>{cat}</Text>
                                            {(items as any[]).map((o: any, i: number) => (
                                                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2, paddingHorizontal: 4 }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
                                                        {o.imageUrl ? (
                                                            <Image src={pdfImg(o.imageUrl, 80)} style={{ width: 20, height: 20, objectFit: 'contain', marginRight: 5, borderRadius: 2, flexShrink: 0 }} />
                                                        ) : (
                                                            <View style={S.dot} />
                                                        )}
                                                        <Text style={{ fontSize: 7, color: SLATE }}>{o.name}</Text>
                                                    </View>
                                                    <Text style={{ fontSize: 7, fontWeight: 'bold', color: NAVY, flexShrink: 0, marginLeft: 8 }}>
                                                        {o.sellPriceExclGst ? currency(o.sellPriceExclGst) : 'Incl.'}
                                                    </Text>
                                                </View>
                                            ))}
                                        </View>
                                    ))}
                                </View>
                            )}

                            {/* Trailer Subtotal */}
                            <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: BORDER, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text style={{ fontSize: 7, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase', color: SLATE }}>Trailer Total</Text>
                                <Text style={{ fontSize: 11, fontWeight: 'bold', fontStyle: 'italic', color: NAVY }}>{currency(f.trailerTotal)}</Text>
                            </View>
                        </View>
                    );
                })()}

                {/* Dealer Fit — wrap={false} keeps the heading + first row together;
                    longer lists can still flow across pages, but at minimum each
                    line stays atomic (no row split mid-text).
                    Code-only / empty items are filtered out: showing the customer
                    "010-02093-02  $7,269" with no real name is worse than nothing. */}
                {(() => {
                    const allItems = (quote.dealerFit as any[] || []).flatMap((group: any, gi: number) =>
                        (group.items || []).map((item: any, ii: number) => {
                            const candidates = [item.description, item.label, item.name].filter(Boolean) as string[];
                            const realLabel = candidates.find(c => !isCodeOnlyLabel(c));
                            return { gi, ii, item, label: realLabel || null };
                        })
                    ).filter(x => x.label !== null);  // hide code-only / empty rows
                    if (allItems.length === 0) return null;
                    return (
                    <View style={{ marginBottom: 14 }} wrap>
                        <Text style={S.sectionLabel} wrap={false}>Dealer Accessories & Preparation</Text>
                        <View style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 5, overflow: 'hidden' }}>
                            {allItems.map(({ gi, ii, item, label }, idx) => {
                                    return (
                                        <View key={`${gi}-${ii}`} wrap={false} style={{
                                            flexDirection: 'row',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            paddingHorizontal: 10,
                                            paddingVertical: 6,
                                            borderTopWidth: idx > 0 ? 1 : 0,
                                            borderTopColor: '#f1f5f9',
                                        }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1, gap: 8 }}>
                                                {item.imageUrl ? (
                                                    <Image src={pdfImg(item.imageUrl, 120)} style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 3, flexShrink: 0 }} />
                                                ) : (
                                                    <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: GREEN, flexShrink: 0 }} />
                                                )}
                                                <Text style={{ fontSize: 8, color: SLATE, flexShrink: 1 }}>{label}</Text>
                                            </View>
                                            <Text style={{ fontSize: 8, fontWeight: 'bold', color: NAVY, flexShrink: 0, marginLeft: 12 }}>{currency(item.sellPriceExclGst || 0)}</Text>
                                        </View>
                                    );
                                })}
                        </View>
                    </View>
                    );
                })()}

                {/* Fit-Up & Rigging — package-aware itemised section.
                    Groups items by source package (Simple / Medium / Complex Fit-Up
                    packages) so the customer sees the bundle they were sold rather
                    than a flat list of each member item. À-la-carte additions sit
                    in an "Additional Items" group at the bottom. */}
                {(() => {
                    const sels = (quote.fitUpSelections as any[] | undefined) || [];
                    if (sels.length === 0) return null;
                    const unitOf = (sel: any) => sel.priceOverride != null ? sel.priceOverride : (sel.sellPrice != null ? sel.sellPrice : (sel.cost || 0));
                    const lineOf = (sel: any) => Math.max(1, sel.quantity ?? 1) * unitOf(sel);

                    // Maintain insertion order so the first selected package
                    // sorts first. Use a Map for stable iteration.
                    const groups = new Map<string, { name: string | null; items: any[]; total: number }>();
                    for (const sel of sels) {
                        const key = sel.packageId || '__loose__';
                        if (!groups.has(key)) {
                            groups.set(key, { name: sel.packageName ?? null, items: [], total: 0 });
                        }
                        const g = groups.get(key)!;
                        g.items.push(sel);
                        g.total += lineOf(sel);
                    }

                    return (
                        <View style={{ marginBottom: 14 }} wrap>
                            <Text style={S.sectionLabel} wrap={false}>Fit-Up & Rigging</Text>
                            {Array.from(groups.entries()).map(([key, g], gi) => (
                                <View key={key} style={{
                                    borderWidth: 1, borderColor: BORDER, borderRadius: 5,
                                    overflow: 'hidden', marginTop: gi === 0 ? 0 : 8,
                                }}>
                                    {/* Group header — visible only when the items came
                                        from a named package. À-la-carte items use a
                                        plain "Additional Items" label. */}
                                    <View wrap={false} style={{
                                        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                                        paddingHorizontal: 10, paddingVertical: 7, backgroundColor: LIGHT,
                                        borderBottomWidth: 1, borderBottomColor: BORDER,
                                    }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
                                            <View style={{ width: 4, height: 12, borderRadius: 1, backgroundColor: BRAND, flexShrink: 0 }} />
                                            <Text style={{ fontSize: 7.5, fontWeight: 'bold', letterSpacing: 1.4, textTransform: 'uppercase', color: NAVY, flexShrink: 1 }}>
                                                {g.name ? `${g.name} Package` : 'Additional Items'}
                                            </Text>
                                            <Text style={{ fontSize: 6.5, fontWeight: 'bold', letterSpacing: 1.2, textTransform: 'uppercase', color: MUTED }}>
                                                · {g.items.length} item{g.items.length === 1 ? '' : 's'}
                                            </Text>
                                        </View>
                                        <Text style={{ fontSize: 8.5, fontWeight: 'bold', color: NAVY, marginLeft: 10 }}>{currency(g.total)}</Text>
                                    </View>

                                    {/* Items in this group */}
                                    {g.items.map((sel: any, i: number) => {
                                        const qty = Math.max(1, sel.quantity ?? 1);
                                        const label = sel.customerDescription || sel.name || 'Fit-up item';
                                        return (
                                            <View key={sel.id || i} wrap={false} style={{
                                                flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                                                paddingHorizontal: 10, paddingVertical: 5,
                                                borderTopWidth: i > 0 ? 1 : 0, borderTopColor: '#f1f5f9',
                                            }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1, gap: 8 }}>
                                                    {sel.imageUrl ? (
                                                        <Image src={pdfImg(sel.imageUrl, 120)} style={{ width: 30, height: 30, objectFit: 'contain', borderRadius: 3, flexShrink: 0 }} />
                                                    ) : (
                                                        <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: MUTED, flexShrink: 0, marginLeft: 4 }} />
                                                    )}
                                                    <View style={{ flexShrink: 1 }}>
                                                        <Text style={{ fontSize: 7.5, color: SLATE }}>{label}{qty > 1 ? ` × ${qty}` : ''}</Text>
                                                        {sel.category ? (
                                                            <Text style={{ fontSize: 5.5, color: MUTED, marginTop: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}>{sel.category}</Text>
                                                        ) : null}
                                                    </View>
                                                </View>
                                            </View>
                                        );
                                    })}
                                </View>
                            ))}
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
            <Page size="A4" style={{ ...S.page, padding: 44 }}>
                <InnerHeader title="Investment Summary" sub="Comprehensive Package Breakdown" quoteNumber={quote.quoteNumber} />

                {/* Pricing table */}
                <View style={{ marginBottom: 28 }}>
                    {/* Header row — wrap={false} so the column labels stay attached
                        to the first line item when the table flows pages. */}
                    <View wrap={false} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: NAVY, marginBottom: 0 }}>
                        <Text style={{ fontSize: 7, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase', color: SLATE }}>Description</Text>
                        <Text style={{ fontSize: 7, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase', color: SLATE }}>Amount</Text>
                    </View>

                    {/* Line items — atomic per row so a row never splits across pages */}
                    {lineItems.map((item, i) => (
                        <View key={i} wrap={false} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
                            <View style={{ flexShrink: 1, paddingRight: 12 }}>
                                <Text style={{ fontSize: 8.5, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.3, color: NAVY }}>{item.label}</Text>
                                {item.sub && <Text style={{ fontSize: 7, fontWeight: 'bold', letterSpacing: 1.5, textTransform: 'uppercase', color: MUTED, marginTop: 1.5 }}>{item.sub}</Text>}
                            </View>
                            <Text style={{ fontSize: 8.5, fontWeight: 'bold', color: NAVY, flexShrink: 0 }}>{currency(item.amount)}</Text>
                        </View>
                    ))}

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
            <Page size="A4" style={{ ...S.page, padding: 44 }}>
                <InnerHeader title="Acceptance" sub="Signatures & Confirmation" quoteNumber={quote.quoteNumber} />

                <View style={{ flexDirection: 'row', gap: 40, marginTop: 40, marginBottom: 24 }}>
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 7, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 2, color: MUTED, marginBottom: 12 }}>Merchant Authorisation</Text>
                        <View style={{ height: 80, borderBottomWidth: 1, borderBottomColor: '#cbd5e1' }} />
                        <Text style={{ fontSize: 8, fontWeight: 'bold', color: SLATE, marginTop: 8 }}>{quote.createdByName} — {organisation?.name}</Text>
                        <Text style={{ fontSize: 7, color: MUTED, marginTop: 2 }}>Date: _____ / _____ / _____</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 7, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 2, color: MUTED, marginBottom: 12 }}>Client Acceptance</Text>
                        <View style={{ height: 80, borderBottomWidth: 1, borderBottomColor: '#cbd5e1' }} />
                        <Text style={{ fontSize: 8, fontWeight: 'bold', color: SLATE, marginTop: 8 }}>{quote.customer?.name}</Text>
                        <Text style={{ fontSize: 7, color: MUTED, marginTop: 2 }}>Date: _____ / _____ / _____</Text>
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

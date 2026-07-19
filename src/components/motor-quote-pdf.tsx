'use client';

/**
 * v1.34 — the dedicated MOTOR QUOTE / REPOWER QUOTE customer PDF.
 *
 * Asaf's brief: fewer steps than a boat quote, but the printed document
 * must be just as high quality — vendor (Yamaha) branding, the motor
 * photo, the full spec grid, a clean package breakdown, and the same
 * admin-controlled content blocks as boat quotes (documentType
 * 'motor-quote' in Document Templates → Motor Quote).
 *
 * MONEY (MPF source of truth): motor rows carry Display-Sheet money —
 * NSM Retail and its package lines are GST-INCLUSIVE figures. This
 * document sums the lines as inc-GST, back-derives ex-GST as total/1.1,
 * and shows a trade-in deduction + balance for repowers. It does NOT
 * multiply by 1.1 the way the generic service PDF does.
 *
 * Layout: header (org + vendor logos) → hero (photo + name + HP) →
 * content zone A → SPEC GRID → content zone B → PACKAGE BREAKDOWN +
 * totals (+ trade-in/balance) → content zone C → signatures. Zones come
 * from organisations/{org}/pdfStructure/motor-quote (drag-orderable in
 * the admin, same engine as the boat quote).
 */
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { TipTapHtmlPdf } from '@/lib/tiptap-pdf';
import { BLOCK_TYPE_LABEL, type BlockType } from '@/lib/content-blocks';
import { partitionContentBlocks, type PdfStructureSection } from '@/lib/pdf-structure';

const NAVY = '#0b1f3a';
const RED = '#d3121a'; // Yamaha racing red accent
const SLATE = '#334155';
const MUTED = '#94a3b8';
const BORDER = '#e2e8f0';

const S = StyleSheet.create({
    page: { padding: 40, fontSize: 9, color: SLATE, fontFamily: 'Helvetica' },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    title: { fontSize: 22, fontWeight: 'bold', color: NAVY, textTransform: 'uppercase', letterSpacing: -0.5 },
    rule: { height: 3, width: 72, backgroundColor: RED, marginTop: 6, marginBottom: 12 },
    metaLabel: { fontSize: 6.5, color: MUTED, textTransform: 'uppercase', letterSpacing: 1.5 },
    metaValue: { fontSize: 9, fontWeight: 'bold', color: NAVY, marginTop: 2 },
    hero: { flexDirection: 'row', gap: 16, borderWidth: 1, borderColor: BORDER, borderRadius: 8, padding: 14, marginBottom: 14, alignItems: 'center' },
    heroImg: { width: 170, height: 150, objectFit: 'contain' },
    heroName: { fontSize: 16, fontWeight: 'bold', color: NAVY, textTransform: 'uppercase' },
    hpBadge: { alignSelf: 'flex-start', backgroundColor: RED, color: '#fff', fontSize: 8, fontWeight: 'bold', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 10, marginTop: 6, textTransform: 'uppercase', letterSpacing: 1 },
    sectionTitle: { fontSize: 11, fontWeight: 'bold', color: NAVY, textTransform: 'uppercase', borderBottomWidth: 2, borderBottomColor: NAVY, paddingBottom: 4, marginBottom: 8, marginTop: 8 },
    specGrid: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: 1, borderColor: BORDER, borderRadius: 8, overflow: 'hidden', marginBottom: 6 },
    specCell: { width: '33.33%', padding: 8, borderBottomWidth: 0.5, borderRightWidth: 0.5, borderColor: BORDER },
    theadRow: { flexDirection: 'row', backgroundColor: NAVY, padding: 6, borderRadius: 2 },
    th: { fontSize: 6.5, fontWeight: 'bold', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.8 },
    row: { flexDirection: 'row', paddingVertical: 4.5, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: '#f1f5f9' },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, paddingHorizontal: 6 },
    blockBody: { marginBottom: 10 },
    foot: { position: 'absolute', bottom: 22, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', fontSize: 6.5, color: MUTED },
    sigBox: { flex: 1, borderTopWidth: 1, borderTopColor: SLATE, paddingTop: 6 },
});

/** Same proven image path as the boat proposal PDF: weserv proxy
 *  (downscale + jpeg + CORS-friendly server-side fetch); Yamaha CDN
 *  hosts are hotlink-blocked even via weserv → collapse the slot. */
const BLOCKED_IMAGE_DOMAINS = ['yamaha-motor.com.au', 'yamaha-motor.com'];
/** Firebase Storage tokened URLs 404 THROUGH weserv but fetch fine raw
 *  (CORS is open on the bucket) — same rule as WESERV_SKIP_HOSTS in
 *  image-preload.ts. Verified by isolated render 2026-07-19. */
const PROXY_SKIP_HOSTS = ['firebasestorage.googleapis.com', 'firebasestorage.app'];
function pdfImg(url: string | undefined | null, w = 700): string | undefined {
    if (!url || typeof url !== 'string') return undefined;
    const u = url.trim();
    if (!u) return undefined;
    if (u.startsWith('data:')) return u;
    if (BLOCKED_IMAGE_DOMAINS.some(d => u.includes(d))) return undefined;
    // Storage sends no CORS headers and weserv 404s tokened URLs —
    // stream same-origin via our own /api/pdf-img proxy (v1.34).
    if (PROXY_SKIP_HOSTS.some(d => u.includes(d))) return `/api/pdf-img?url=${encodeURIComponent(u)}`;
    const noProto = u.replace(/^https?:\/\//i, '');
    return `https://images.weserv.nl/?url=${encodeURIComponent(noProto)}&w=${w}&output=jpg&q=72`;
}

function currency(n: number | null | undefined) {
    if (n == null || isNaN(n)) return '—';
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n);
}

/** Group package lines for the breakdown table, motor first. */
const LINE_ORDER = ['motor', 'rigging-kit', 'propeller', 'INSTALL', 'REMOVAL'];

export interface MotorQuotePdfInput {
    quoteNumber?: string;
    createdAt?: Date | null;
    customerName: string;
    customerPhone?: string | null;
    vehicle?: string | null;
    saleType?: 'new' | 'repower' | null;
    tradeIn?: { description?: string | null; value?: number } | null;
    operations: Array<{ id: string; code?: string; name: string; hours?: number; sellPrice: number }>;
    parts: Array<{ id: string; partNumber?: string; name: string; qty: number; sellPrice: number; itemType?: string }>;
    motorSnapshot?: {
        name: string;
        code?: string;
        image?: string | null;
        specs?: Record<string, string>;
        vendorName?: string;
        vendorLogoUrl?: string | null;
    } | null;
    /** Resolved admin content (documentType 'motor-quote'). */
    contentBlocks?: Partial<Record<BlockType, string>>;
    sections?: PdfStructureSection[] | null;
}

export function MotorQuotePDFDocument({ input, organisation }: { input: MotorQuotePdfInput; organisation: any }) {
    const snap = input.motorSnapshot;
    const isRepower = input.saleType === 'repower';
    const title = isRepower ? 'Repower Quote' : 'Motor Quote';

    // Display-Sheet money: line sells are inc-GST; ex derived.
    const totalInc = input.operations.reduce((a, o) => a + (o.sellPrice || 0), 0)
        + input.parts.reduce((a, p) => a + (p.sellPrice || 0) * (p.qty || 1), 0);
    const totalEx = totalInc / 1.1;
    const gst = totalInc - totalEx;
    const tradeInValue = input.tradeIn?.value || 0;
    const balance = Math.max(0, totalInc - tradeInValue);

    const lines: Array<{ label: string; sub?: string; qty?: number; amount: number }> = [];
    const sortedParts = [...input.parts].sort((a, b) =>
        LINE_ORDER.indexOf(a.itemType || '') - LINE_ORDER.indexOf(b.itemType || ''));
    for (const p of sortedParts) {
        lines.push({
            label: p.name,
            sub: p.itemType === 'motor'
                ? (p.partNumber && !p.name.toUpperCase().includes(p.partNumber.toUpperCase()) ? p.partNumber : undefined)
                : (p.itemType || '').replace('-', ' '),
            qty: p.qty, amount: (p.sellPrice || 0) * (p.qty || 1) });
    }
    for (const o of input.operations) {
        const label = o.name.replace(/^Install:\s*(?=install)/i, '');
        lines.push({ label, sub: (o.hours && o.hours >= 1) ? `${o.hours} hrs` : 'installation', amount: o.sellPrice || 0 });
    }

    // Content zones from the admin-ordered structure (fail-open to a
    // sensible default split when no structure doc exists yet).
    const zones = input.sections && input.sections.length > 0
        ? partitionContentBlocks(input.sections)
        : { zoneA: [] as PdfStructureSection[], zoneB: [] as PdfStructureSection[], zoneC: [] as PdfStructureSection[] };
    const blocks = input.contentBlocks ?? {};
    const zoneBlocks = (zone: PdfStructureSection[]) =>
        zone.map(s => ({ type: s.key as BlockType, html: blocks[s.key as BlockType] }))
            .filter(b => b.html && b.html.trim());
    // Blocks authored for motor-quote but absent from the structure doc
    // still render (zone C) — authored content must never silently vanish.
    const placed = new Set([...zones.zoneA, ...zones.zoneB, ...zones.zoneC].map(s => s.key));
    const unplaced = (Object.keys(blocks) as BlockType[])
        .filter(t => blocks[t] && blocks[t]!.trim() && !placed.has(t))
        .map(t => ({ type: t, html: blocks[t] }));

    // Firestore maps round-trip alphabetically — restore the customer-
    // friendly spec order.
    const SPEC_ORDER = ['HP Rating', 'Shaft Length', 'Control', 'Starting', 'Tilt & Trim',
        'Cylinders / Displacement', 'Engine Colour', 'Fuel Tank', 'Propeller', 'Warranty'];
    const specEntries = Object.entries(snap?.specs ?? {})
        .filter(([, v]) => !['opt', 'std', '.', '-', 'n/a'].includes(String(v).trim().toLowerCase()))
        .sort(([a], [b]) => {
            const ia = SPEC_ORDER.indexOf(a), ib = SPEC_ORDER.indexOf(b);
            return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        });

    return (
        <Document title={`${title} ${input.quoteNumber ?? ''} — ${snap?.name ?? ''}`} author={organisation?.name ?? 'HelmLogic'}>
            <Page size="A4" style={S.page}>
                {/* Header: org + vendor branding */}
                <View style={S.headerRow}>
                    {pdfImg(organisation?.primaryLogoUrl, 440)
                        ? <Image src={pdfImg(organisation?.primaryLogoUrl, 440)!} style={{ height: 34, width: 150, objectFit: 'contain' }} />
                        : <Text style={{ fontSize: 13, fontWeight: 'bold', color: NAVY }}>{organisation?.name ?? ''}</Text>}
                    {pdfImg(snap?.vendorLogoUrl, 440)
                        ? <Image src={pdfImg(snap?.vendorLogoUrl, 440)!} style={{ height: 30, width: 132, objectFit: 'contain' }} />
                        : (snap?.vendorName ? <Text style={{ fontSize: 12, fontWeight: 'bold', color: RED }}>{snap.vendorName.toUpperCase()}</Text> : null)}
                </View>

                <Text style={S.title}>{title}</Text>
                <View style={S.rule} />
                <View style={{ flexDirection: 'row', gap: 18, marginBottom: 12 }}>
                    <View><Text style={S.metaLabel}>Prepared for</Text><Text style={S.metaValue}>{input.customerName}</Text></View>
                    {input.vehicle ? <View><Text style={S.metaLabel}>Vessel</Text><Text style={S.metaValue}>{input.vehicle}</Text></View> : null}
                    {input.quoteNumber ? <View><Text style={S.metaLabel}>Quote</Text><Text style={S.metaValue}>{input.quoteNumber}</Text></View> : null}
                    <View><Text style={S.metaLabel}>Date</Text><Text style={S.metaValue}>{(input.createdAt ?? new Date()).toLocaleDateString('en-AU')}</Text></View>
                </View>

                {/* Hero */}
                {snap && (
                    <View style={[S.hero, !pdfImg(snap.image, 500) ? { paddingVertical: 12 } : {}]}>
                        {pdfImg(snap.image, 500) ? <Image src={pdfImg(snap.image, 500)!} style={S.heroImg} /> : null}
                        <View style={{ flex: 1 }}>
                            <Text style={S.heroName}>{snap.name}</Text>
                            {snap.code && !snap.name.toUpperCase().includes(snap.code.toUpperCase())
                                ? <Text style={{ fontSize: 8, color: MUTED, marginTop: 2 }}>{snap.code}</Text> : null}
                            {snap.specs?.['HP Rating'] ? <Text style={S.hpBadge}>{snap.specs['HP Rating']} HP</Text> : null}
                            {isRepower && input.tradeIn?.description ? (
                                <Text style={{ fontSize: 8, color: SLATE, marginTop: 8 }}>Replacing: {input.tradeIn.description}</Text>
                            ) : null}
                        </View>
                    </View>
                )}

                {/* Zone A content */}
                {zoneBlocks(zones.zoneA).map(b => (
                    <View key={b.type} style={S.blockBody} wrap={false}>
                        <Text style={S.sectionTitle}>{BLOCK_TYPE_LABEL[b.type] ?? b.type}</Text>
                        <TipTapHtmlPdf html={b.html!} />
                    </View>
                ))}

                {/* Spec grid */}
                {specEntries.length > 0 && (
                    <>
                        <Text style={S.sectionTitle}>Specifications</Text>
                        <View style={S.specGrid}>
                            {specEntries.map(([label, value]) => (
                                <View key={label} style={S.specCell}>
                                    <Text style={{ fontSize: 6, color: MUTED, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</Text>
                                    <Text style={{ fontSize: 8.5, fontWeight: 'bold', color: NAVY, marginTop: 2 }}>{value}</Text>
                                </View>
                            ))}
                            {/* filler cells complete the last row so the grid
                                never ends ragged */}
                            {Array.from({ length: (3 - (specEntries.length % 3)) % 3 }).map((_, i) => (
                                <View key={`fill-${i}`} style={S.specCell} />
                            ))}
                        </View>
                    </>
                )}

                {/* Zone B content */}
                {zoneBlocks(zones.zoneB).map(b => (
                    <View key={b.type} style={S.blockBody} wrap={false}>
                        <Text style={S.sectionTitle}>{BLOCK_TYPE_LABEL[b.type] ?? b.type}</Text>
                        <TipTapHtmlPdf html={b.html!} />
                    </View>
                ))}

                {/* Package breakdown */}
                <Text style={S.sectionTitle}>{isRepower ? 'Repower Package' : 'Your Package'}</Text>
                <View style={S.theadRow}>
                    <Text style={[S.th, { flex: 3 }]}>Item</Text>
                    <Text style={[S.th, { flex: 0.6, textAlign: 'right' }]}>Qty</Text>
                    <Text style={[S.th, { flex: 1.2, textAlign: 'right' }]}>Amount</Text>
                </View>
                {lines.map((l, i) => (
                    <View key={i} style={S.row} wrap={false}>
                        <View style={{ flex: 3 }}>
                            <Text style={{ fontSize: 8, fontWeight: 'bold', color: NAVY }}>{l.label}</Text>
                            {l.sub ? <Text style={{ fontSize: 6, color: MUTED, textTransform: 'uppercase', letterSpacing: 1, marginTop: 1 }}>{l.sub}</Text> : null}
                        </View>
                        <Text style={{ flex: 0.6, textAlign: 'right', fontSize: 8 }}>{l.qty ?? ''}</Text>
                        <Text style={{ flex: 1.2, textAlign: 'right', fontSize: 8, fontWeight: 'bold', color: NAVY }}>{currency(l.amount)}</Text>
                    </View>
                ))}
                <View style={{ borderTopWidth: 1, borderTopColor: BORDER, marginTop: 4 }}>
                    {/* Package lines are GST-INCLUSIVE (MPF money) — so the
                        inclusive total leads, and the ex/GST split is an
                        explanatory sub-line. Never show an "excl. GST
                        subtotal" that doesn't equal the visible line sum. */}
                    <View style={[S.totalRow, { backgroundColor: NAVY, borderRadius: 4, marginTop: 2 }]}>
                        <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#fff', textTransform: 'uppercase', letterSpacing: 1.5 }}>Total incl. GST</Text>
                        <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#fff' }}>{currency(totalInc)}</Text>
                    </View>
                    <View style={S.totalRow}>
                        <Text style={{ fontSize: 7, color: MUTED }}>Includes GST of {currency(gst)} · total excluding GST {currency(totalEx)}</Text>
                    </View>
                    {isRepower && tradeInValue > 0 && (
                        <>
                            <View style={S.totalRow}>
                                <Text style={{ fontSize: 7.5, color: MUTED, textTransform: 'uppercase', letterSpacing: 1.5 }}>Less trade-in{input.tradeIn?.description ? ` (${input.tradeIn.description})` : ''}</Text>
                                <Text style={{ fontSize: 8.5, fontWeight: 'bold', color: '#059669' }}>-{currency(tradeInValue)}</Text>
                            </View>
                            <View style={[S.totalRow, { backgroundColor: RED, borderRadius: 4 }]}>
                                <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#fff', textTransform: 'uppercase', letterSpacing: 1.5 }}>Balance payable</Text>
                                <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#fff' }}>{currency(balance)}</Text>
                            </View>
                        </>
                    )}
                </View>

                {/* Zone C + unplaced content */}
                {[...zoneBlocks(zones.zoneC), ...unplaced].map(b => (
                    <View key={b.type} style={[S.blockBody, { marginTop: 10 }]} wrap={false}>
                        <Text style={S.sectionTitle}>{BLOCK_TYPE_LABEL[b.type as BlockType] ?? b.type}</Text>
                        <TipTapHtmlPdf html={b.html!} />
                    </View>
                ))}

                {/* Signatures */}
                <View style={{ flexDirection: 'row', gap: 24, marginTop: 26 }} wrap={false}>
                    <View style={S.sigBox}>
                        <Text style={{ fontSize: 6.5, color: MUTED, textTransform: 'uppercase', letterSpacing: 1.5 }}>{organisation?.name ?? 'Dealer'} — Authorised</Text>
                    </View>
                    <View style={S.sigBox}>
                        <Text style={{ fontSize: 6.5, color: MUTED, textTransform: 'uppercase', letterSpacing: 1.5 }}>Customer acceptance</Text>
                    </View>
                </View>

                <View style={S.foot} fixed>
                    <Text>{organisation?.name ?? ''} — {title}</Text>
                    <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
                </View>
            </Page>
        </Document>
    );
}

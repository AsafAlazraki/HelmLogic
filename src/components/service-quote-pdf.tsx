'use client';

/**
 * ServiceQuotePDF (v1.12 — Story 11.2.3).
 *
 * Customer-facing service-quote PDF rendered on the `@react-pdf` pipeline.
 * Sister document to `proposal-pdf.tsx` (the boat-quote PDF) but with the
 * service-specific shape: operations (labor) + parts breakdown + totals.
 *
 * Inputs: a `ServiceQuoteDocInput` (the quote snapshot) + `organisation`.
 * Outputs: a React-PDF `Document` ready for `renderToBuffer` /
 * `BlobProvider` / `usePDF` / etc.
 *
 * Reuses HL's image-preload + brand-styling helpers from `proposal-pdf` —
 * deep-navy header, gold accent rule, slate body, INCLUDED tag for $0
 * lines, tabular-nums currency.
 */

import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';

/* ─── Palette (mirrors proposal-pdf for visual consistency) ─── */
const BRAND  = '#0c2a4d';
const NAVY   = '#0f172a';
const SLATE  = '#475569';
const MUTED  = '#94a3b8';
const BORDER = '#e2e8f0';
const LIGHT  = '#f8fafc';
const GREEN  = '#10b981';
const GOLD   = '#a07a2c';

function currency(n: number): string {
    return new Intl.NumberFormat('en-AU', {
        style: 'currency', currency: 'AUD', maximumFractionDigits: 0,
    }).format(n);
}

const GST_RATE = 0.10;
function incGstCeil(exGst: number): number {
    return Math.ceil(exGst * (1 + GST_RATE));
}

/* ─── Shape ─── */
export interface ServiceQuoteOpInput {
    id: string;
    code?: string;
    name: string;
    hours: number;
    rate: number;
    sellPrice: number;
    cost?: number;
}

export interface ServiceQuotePartInput {
    id: string;
    partNumber?: string;
    name: string;
    qty: number;
    sellPrice: number;
    cost?: number;
}

export interface ServiceQuoteDocInput {
    id: string;
    quoteNumber?: string;
    customerName: string;
    customerPhone?: string;
    customerEmail?: string;
    vehicle?: string;
    notes?: string | null;
    /** v1.12 — Installation / Insurance / Mechanical Estimate / etc. */
    estimateType?: string | null;
    operations: ServiceQuoteOpInput[];
    parts: ServiceQuotePartInput[];
    status?: string;
    totalSell: number;
    totalCost?: number;
    createdAt?: any;
}

/* ─── Styles ─── */
const styles = StyleSheet.create({
    page: {
        padding: 36,
        fontFamily: 'Helvetica',
        backgroundColor: '#ffffff',
        color: NAVY,
        fontSize: 9,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingBottom: 16,
        borderBottomWidth: 2,
        borderBottomColor: BRAND,
    },
    headerLeft: { flexShrink: 1, paddingRight: 16 },
    headerRight: { alignItems: 'flex-end', minWidth: 140 },
    orgName: { fontSize: 14, fontWeight: 'bold', color: BRAND, marginBottom: 2 },
    docTitle: { fontSize: 11, fontWeight: 'bold', color: BRAND, letterSpacing: 1.5, textTransform: 'uppercase' },
    docSubtitle: { fontSize: 7, fontWeight: 'bold', color: MUTED, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 1 },
    goldRule: { height: 1, backgroundColor: GOLD, marginVertical: 18 },
    metaRow: { flexDirection: 'row', gap: 16, marginBottom: 14 },
    metaBlock: { flex: 1 },
    metaLabel: { fontSize: 6, fontWeight: 'bold', color: MUTED, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 3 },
    metaValue: { fontSize: 9, fontWeight: 'bold', color: NAVY },
    metaSub: { fontSize: 7.5, color: SLATE, marginTop: 1 },
    sectionTitle: { fontSize: 9, fontWeight: 'bold', color: BRAND, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6, marginTop: 14 },
    opCard: { borderWidth: 1, borderColor: BORDER, borderRadius: 6, marginBottom: 8, padding: 10, backgroundColor: LIGHT },
    opHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
    opName: { fontSize: 9.5, fontWeight: 'bold', color: NAVY, flexShrink: 1, paddingRight: 8 },
    opCode: { fontSize: 7, fontWeight: 'bold', color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginTop: 1 },
    opPrice: { fontSize: 10, fontWeight: 'bold', color: NAVY, fontStyle: 'italic' },
    opMeta: { flexDirection: 'row', gap: 14, marginTop: 2 },
    opMetaItem: { fontSize: 7.5, color: SLATE },
    partLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1.5 },
    partLineLeft: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
    partDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: GREEN, marginRight: 5 },
    partName: { fontSize: 7.5, color: SLATE, flexShrink: 1 },
    partAmount: { fontSize: 7.5, fontWeight: 'bold', color: NAVY, marginLeft: 8 },
    totalsBlock: { borderTopWidth: 2, borderTopColor: BRAND, marginTop: 16, paddingTop: 10 },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
    totalLabel: { fontSize: 8, fontWeight: 'bold', color: SLATE, letterSpacing: 1.5, textTransform: 'uppercase' },
    totalValue: { fontSize: 10, fontWeight: 'bold', color: NAVY, fontStyle: 'italic' },
    grandTotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: BORDER, marginTop: 4 },
    grandTotalLabel: { fontSize: 9, fontWeight: 'bold', color: BRAND, letterSpacing: 2, textTransform: 'uppercase' },
    grandTotalValue: { fontSize: 14, fontWeight: 'bold', color: BRAND, fontStyle: 'italic' },
    notesBox: { borderWidth: 1, borderColor: BORDER, borderRadius: 6, padding: 10, backgroundColor: LIGHT, marginTop: 14 },
    notesLabel: { fontSize: 7, fontWeight: 'bold', color: MUTED, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 },
    notesBody: { fontSize: 8, color: SLATE, lineHeight: 1.4 },
    footer: { position: 'absolute', bottom: 24, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, borderTopWidth: 1, borderTopColor: BORDER },
    footerText: { fontSize: 6.5, color: MUTED, letterSpacing: 0.5 },
});

interface Props {
    quote: ServiceQuoteDocInput;
    organisation: { name?: string; logoUrl?: string; abn?: string; phone?: string; email?: string; address?: string };
}

export function ServiceQuotePDFDocument({ quote, organisation }: Props) {
    const ops = quote.operations || [];
    const parts = quote.parts || [];
    const orgName = organisation?.name || 'HelmLogic';

    // Group parts under the operation they belong to.
    // v1.12 (MVP): parts are quote-level, not per-op. Render in a single
    // PARTS block after the OPERATIONS block — extension to per-op
    // grouping is a later story (3.4.x or similar).
    const opsTotal = ops.reduce((s, o) => s + (o.sellPrice || 0), 0);
    const partsTotal = parts.reduce((s, p) => s + (p.sellPrice || 0) * Math.max(1, p.qty || 1), 0);
    const subtotalEx = opsTotal + partsTotal;
    const subtotalInc = incGstCeil(subtotalEx);
    const gst = subtotalInc - subtotalEx;

    const dateStr = (() => {
        const d = quote.createdAt?.toDate?.() ?? quote.createdAt ?? new Date();
        try {
            return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
        } catch { return ''; }
    })();

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        {organisation?.logoUrl
                            ? <Image src={organisation.logoUrl} style={{ width: 120, height: 36, objectFit: 'contain' }} />
                            : <Text style={styles.orgName}>{orgName}</Text>}
                        {organisation?.abn && <Text style={{ fontSize: 7, color: MUTED, marginTop: 4 }}>ABN {organisation.abn}</Text>}
                        {organisation?.address && <Text style={{ fontSize: 7, color: MUTED }}>{organisation.address}</Text>}
                        {(organisation?.phone || organisation?.email) && (
                            <Text style={{ fontSize: 7, color: MUTED }}>
                                {[organisation.phone, organisation.email].filter(Boolean).join(' · ')}
                            </Text>
                        )}
                    </View>
                    <View style={styles.headerRight}>
                        <Text style={styles.docTitle}>Service Quote</Text>
                        {quote.quoteNumber && <Text style={styles.docSubtitle}>#{quote.quoteNumber}</Text>}
                        {quote.estimateType && <Text style={[styles.docSubtitle, { color: GOLD }]}>{quote.estimateType}</Text>}
                        {dateStr && <Text style={[styles.docSubtitle, { marginTop: 6 }]}>{dateStr}</Text>}
                    </View>
                </View>

                <View style={styles.goldRule} />

                {/* Customer + asset header */}
                <View style={styles.metaRow}>
                    <View style={styles.metaBlock}>
                        <Text style={styles.metaLabel}>Customer</Text>
                        <Text style={styles.metaValue}>{quote.customerName || 'Customer'}</Text>
                        {quote.customerPhone && <Text style={styles.metaSub}>{quote.customerPhone}</Text>}
                        {quote.customerEmail && <Text style={styles.metaSub}>{quote.customerEmail}</Text>}
                    </View>
                    {quote.vehicle && (
                        <View style={styles.metaBlock}>
                            <Text style={styles.metaLabel}>Vessel · Vehicle</Text>
                            <Text style={styles.metaValue}>{quote.vehicle}</Text>
                        </View>
                    )}
                </View>

                {/* Operations (labor) */}
                {ops.length > 0 && (
                    <>
                        <Text style={styles.sectionTitle}>Operations · Labor</Text>
                        {ops.map(op => (
                            <View key={op.id} wrap={false} style={styles.opCard}>
                                <View style={styles.opHeader}>
                                    <View style={{ flexShrink: 1 }}>
                                        <Text style={styles.opName}>{op.name}</Text>
                                        {op.code && <Text style={styles.opCode}>Code · {op.code}</Text>}
                                    </View>
                                    <Text style={styles.opPrice}>{currency(op.sellPrice)}</Text>
                                </View>
                                <View style={styles.opMeta}>
                                    <Text style={styles.opMetaItem}>{op.hours.toFixed(2)} hrs</Text>
                                    <Text style={styles.opMetaItem}>@ {currency(op.rate)}/hr</Text>
                                </View>
                            </View>
                        ))}
                    </>
                )}

                {/* Parts */}
                {parts.length > 0 && (
                    <>
                        <Text style={styles.sectionTitle}>Parts</Text>
                        <View style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 6, padding: 10 }}>
                            {parts.map(p => {
                                const qty = Math.max(1, p.qty || 1);
                                const lineTotal = (p.sellPrice || 0) * qty;
                                return (
                                    <View key={p.id} style={styles.partLine}>
                                        <View style={styles.partLineLeft}>
                                            <View style={styles.partDot} />
                                            <Text style={styles.partName}>
                                                {qty > 1 ? `${p.name} ×${qty}` : p.name}
                                                {p.partNumber ? `  ·  ${p.partNumber}` : ''}
                                            </Text>
                                        </View>
                                        <Text style={[styles.partAmount, { color: lineTotal > 0 ? NAVY : MUTED }]}>
                                            {lineTotal > 0 ? currency(lineTotal) : 'INCLUDED'}
                                        </Text>
                                    </View>
                                );
                            })}
                        </View>
                    </>
                )}

                {/* Notes */}
                {quote.notes && (
                    <View wrap={false} style={styles.notesBox}>
                        <Text style={styles.notesLabel}>Notes</Text>
                        <Text style={styles.notesBody}>{quote.notes}</Text>
                    </View>
                )}

                {/* Totals */}
                <View wrap={false} style={styles.totalsBlock}>
                    {ops.length > 0 && (
                        <View style={styles.totalRow}>
                            <Text style={styles.totalLabel}>Operations Subtotal</Text>
                            <Text style={styles.totalValue}>{currency(opsTotal)}</Text>
                        </View>
                    )}
                    {parts.length > 0 && (
                        <View style={styles.totalRow}>
                            <Text style={styles.totalLabel}>Parts Subtotal</Text>
                            <Text style={styles.totalValue}>{currency(partsTotal)}</Text>
                        </View>
                    )}
                    <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>Subtotal Excl. GST</Text>
                        <Text style={styles.totalValue}>{currency(subtotalEx)}</Text>
                    </View>
                    <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>GST</Text>
                        <Text style={styles.totalValue}>{currency(gst)}</Text>
                    </View>
                    <View style={styles.grandTotalRow}>
                        <Text style={styles.grandTotalLabel}>Total Incl. GST</Text>
                        <Text style={styles.grandTotalValue}>{currency(subtotalInc)}</Text>
                    </View>
                </View>

                {/* Footer */}
                <View style={styles.footer} fixed>
                    <Text style={styles.footerText}>{orgName}</Text>
                    {quote.quoteNumber && <Text style={styles.footerText}>Service Quote #{quote.quoteNumber}</Text>}
                </View>
            </Page>
        </Document>
    );
}

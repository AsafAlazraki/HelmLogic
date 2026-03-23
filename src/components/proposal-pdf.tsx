'use client';

import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';

/* ─── Palette ──────────────────────────────────────────────────────────── */
const BRAND  = '#0066cc';
const NAVY   = '#0f172a';
const SLATE  = '#64748b';
const MUTED  = '#94a3b8';
const BORDER = '#e2e8f0';
const LIGHT  = '#f8fafc';
const GREEN  = '#10b981';

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
function InnerHeader({ title, sub, quoteNumber, page }: { title: string; sub: string; quoteNumber: string; page: string }) {
    return (
        <View style={S.pageHeader}>
            <View>
                <Text style={S.pageHeaderTitle}>{title}</Text>
                <Text style={S.pageHeaderSub}>{sub}</Text>
            </View>
            <View style={S.pageHeaderRight}>
                <Text style={S.pageHeaderMeta}>{quoteNumber}</Text>
                <Text style={S.pageHeaderMeta}>Page {page}</Text>
            </View>
        </View>
    );
}

function InnerFooter({ organisation, quoteNumber }: { organisation: any; quoteNumber: string }) {
    return (
        <View style={S.pageFooter}>
            <View style={{ flexDirection: 'row', gap: 16 }}>
                <Text style={S.pageFooterText}>{organisation?.name}</Text>
                {organisation?.phoneNumber && <Text style={S.pageFooterMuted}>{organisation.phoneNumber}</Text>}
            </View>
            <Text style={S.pageFooterMuted}>{quoteNumber}</Text>
        </View>
    );
}

/* ─── Main Document ────────────────────────────────────────────────────── */
interface Props { quote: any; organisation: any; financials: any }

export function ProposalPDFDocument({ quote, organisation, financials }: Props) {
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
    if (quote.motor) lineItems.push({ label: quote.motor.name, sub: `${quote.motor.brand} — Propulsion`, amount: f.motorTotal });
    if (quote.trailer) lineItems.push({ label: quote.trailer.name || 'Trailer Package', sub: 'Trailer & Options', amount: f.trailerTotal });
    if (f.dealerFitTotal > 0) lineItems.push({ label: 'Dealer Accessories & Preparation', sub: 'Dealer Fitout', amount: f.dealerFitTotal });
    if (f.regoTotal > 0) lineItems.push({ label: 'Registration & Compliance', sub: 'Government Fees', amount: f.regoTotal });

    const variantLabel = quote.variant?.name && quote.variant.name !== 'Standard'
        ? quote.variant.name
        : [quote.variant?.material, quote.variant?.colorName].filter(Boolean).join(' · ');

    return (
        <Document title={`Quote ${quote.quoteNumber} — ${quote.modelName}`} author={organisation?.name ?? 'HelmLogic'}>

            {/* ═══════════════════════════════════════════════════════════
                PAGE 1 — COVER
            ═══════════════════════════════════════════════════════════ */}
            <Page size="A4" style={S.page}>
                <View style={{ width: '100%', height: '100%', position: 'relative', backgroundColor: NAVY }}>

                    {/* Background boat image */}
                    {quote.coverImageUrl && (
                        <Image
                            src={quote.coverImageUrl}
                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                    )}

                    {/* Dark overlay */}
                    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(12, 18, 38, 0.78)' }} />

                    {/* Content layer */}
                    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: 48, flexDirection: 'column' }}>

                        {/* ── Top bar: logos ── */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                            {organisation?.primaryLogoUrl ? (
                                <Image src={organisation.primaryLogoUrl} style={{ height: 32, maxWidth: 130, objectFit: 'contain' }} />
                            ) : (
                                <Text style={{ fontSize: 13, fontWeight: 'bold', color: 'white', letterSpacing: 1 }}>
                                    {(organisation?.name ?? '').toUpperCase()}
                                </Text>
                            )}
                            {quote.vendorLogoUrl && (
                                <Image src={quote.vendorLogoUrl} style={{ height: 22, maxWidth: 80, objectFit: 'contain', opacity: 0.65 }} />
                            )}
                        </View>

                        {/* ── Spacer ── */}
                        <View style={{ flexGrow: 1 }} />

                        {/* ── Bottom hero block ── */}
                        <View>
                            {/* Badge */}
                            <View style={{ backgroundColor: BRAND, borderRadius: 3, paddingHorizontal: 12, paddingVertical: 5, alignSelf: 'flex-start', marginBottom: 18 }}>
                                <Text style={{ fontSize: 7, fontWeight: 'bold', color: 'white', letterSpacing: 2.5, textTransform: 'uppercase' }}>
                                    Official Proposal
                                </Text>
                            </View>

                            {/* Range */}
                            <Text style={{ fontSize: 8, fontWeight: 'bold', color: BRAND, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>
                                {quote.rangeName} Series
                            </Text>

                            {/* Model name — big impact */}
                            <Text style={{ fontSize: 62, fontWeight: 'bold', fontStyle: 'italic', color: 'white', letterSpacing: -2, lineHeight: 0.92, marginBottom: 6 }}>
                                {quote.modelName}
                            </Text>
                            <Text style={{ fontSize: 10, fontWeight: 'bold', color: 'rgba(255,255,255,0.4)', letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 26 }}>
                                {quote.modelCode}
                            </Text>

                            {/* Accent rule */}
                            <View style={{ width: 48, height: 3, backgroundColor: BRAND, marginBottom: 28 }} />

                            {/* Two-col: client + price */}
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                                {/* Client */}
                                <View>
                                    <Text style={{ fontSize: 6.5, fontWeight: 'bold', color: 'rgba(255,255,255,0.38)', letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 6 }}>
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
                                    {/* Meta row */}
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
                                    {/* Variant badge */}
                                    {variantLabel && (
                                        <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}>
                                            <Text style={{ fontSize: 7.5, fontWeight: 'bold', color: 'rgba(255,255,255,0.65)', letterSpacing: 0.8, textTransform: 'uppercase' }}>
                                                {variantLabel}
                                            </Text>
                                        </View>
                                    )}
                                </View>

                                {/* Price */}
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={{ fontSize: 6.5, fontWeight: 'bold', color: 'rgba(255,255,255,0.38)', letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 5 }}>
                                        Total Investment
                                    </Text>
                                    <Text style={{ fontSize: 44, fontWeight: 'bold', fontStyle: 'italic', color: 'white', letterSpacing: -2, lineHeight: 1 }}>
                                        {currency(f.totalInclGst)}
                                    </Text>
                                    <Text style={{ fontSize: 7, fontWeight: 'bold', color: 'rgba(255,255,255,0.38)', letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 5 }}>
                                        Inclusive of GST
                                    </Text>
                                </View>
                            </View>
                        </View>
                    </View>

                    {/* Bottom accent bar */}
                    <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, backgroundColor: BRAND }} />
                </View>
            </Page>

            {/* ═══════════════════════════════════════════════════════════
                PAGE 2 — VESSEL CONFIGURATION
            ═══════════════════════════════════════════════════════════ */}
            <Page size="A4" style={{ ...S.page, padding: 44 }}>
                <InnerHeader title="Vessel Configuration" sub="Technical Data & Standard Inclusions" quoteNumber={quote.quoteNumber} page="02" />

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
                                                    <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: GREEN, marginRight: 7, flexShrink: 0 }} />
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
                {quote.motor && (
                    <View style={{ backgroundColor: LIGHT, borderWidth: 1, borderColor: BORDER, borderRadius: 6, padding: 14, marginBottom: 14 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <View style={{ flexShrink: 1 }}>
                                <Text style={[S.sectionLabel, { marginBottom: 4 }]}>Propulsion System</Text>
                                <Text style={{ fontSize: 15, fontWeight: 'bold', fontStyle: 'italic', textTransform: 'uppercase', letterSpacing: -0.3, color: NAVY, marginBottom: 2 }}>
                                    {quote.motor.name}
                                </Text>
                                <Text style={{ fontSize: 8, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase', color: SLATE }}>
                                    {quote.motor.brand}
                                </Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                {quote.motor.imageUrl && (
                                    <Image src={quote.motor.imageUrl} style={{ height: 44, width: 44, objectFit: 'contain', marginRight: 12 }} />
                                )}
                                <Text style={{ fontSize: 14, fontWeight: 'bold', fontStyle: 'italic', color: NAVY }}>{currency(f.motorTotal)}</Text>
                            </View>
                        </View>
                        {(quote.motor.accessories?.length > 0) && (
                            <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: BORDER }}>
                                {Object.entries(
                                    (quote.motor.accessories as any[]).reduce((acc: Record<string, any[]>, a: any) => {
                                        const cat = a.category || 'Accessories';
                                        if (!acc[cat]) acc[cat] = [];
                                        acc[cat].push(a);
                                        return acc;
                                    }, {})
                                ).map(([cat, items]) => (
                                    <View key={cat} style={{ marginBottom: 5 }}>
                                        <Text style={{ fontSize: 6, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase', color: BRAND, marginBottom: 4 }}>{cat}</Text>
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                                            {(items as any[]).map((acc: any, i: number) => (
                                                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 14, marginBottom: 2 }}>
                                                    <View style={S.dot} />
                                                    <Text style={{ fontSize: 7, color: SLATE }}>{acc.name}</Text>
                                                </View>
                                            ))}
                                        </View>
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>
                )}

                {/* Trailer */}
                {quote.trailer && (
                    <View style={{ backgroundColor: LIGHT, borderWidth: 1, borderColor: BORDER, borderRadius: 6, padding: '10 14', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                        <View>
                            <Text style={[S.sectionLabel, { marginBottom: 3 }]}>Trailer Package</Text>
                            <Text style={{ fontSize: 13, fontWeight: 'bold', fontStyle: 'italic', textTransform: 'uppercase', color: NAVY }}>
                                {quote.trailer.name || 'Trailer'}
                            </Text>
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: 'bold', fontStyle: 'italic', color: NAVY }}>{currency(f.trailerTotal)}</Text>
                    </View>
                )}

                {/* Dealer Fit */}
                {quote.dealerFit?.length > 0 && (
                    <View style={{ marginBottom: 14 }}>
                        <Text style={S.sectionLabel}>Dealer Accessories & Preparation</Text>
                        <View style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 5, overflow: 'hidden' }}>
                            {(quote.dealerFit as any[]).map((group: any, gi: number) =>
                                (group.items || []).map((item: any, ii: number) => (
                                    <View key={`${gi}-${ii}`} style={{
                                        flexDirection: 'row',
                                        justifyContent: 'space-between',
                                        paddingHorizontal: 10,
                                        paddingVertical: 5,
                                        borderTopWidth: (gi > 0 || ii > 0) ? 1 : 0,
                                        borderTopColor: '#f1f5f9',
                                    }}>
                                        <Text style={{ fontSize: 7.5, color: SLATE }}>{item.name}</Text>
                                        <Text style={{ fontSize: 7.5, fontWeight: 'bold', color: NAVY }}>{currency(item.sellPriceExclGst || 0)}</Text>
                                    </View>
                                ))
                            )}
                        </View>
                    </View>
                )}

                <InnerFooter organisation={organisation} quoteNumber={quote.quoteNumber} />
            </Page>

            {/* ═══════════════════════════════════════════════════════════
                PAGE 3 — INVESTMENT SUMMARY
            ═══════════════════════════════════════════════════════════ */}
            <Page size="A4" style={{ ...S.page, padding: 44 }}>
                <InnerHeader title="Investment Summary" sub="Comprehensive Package Breakdown" quoteNumber={quote.quoteNumber} page="03" />

                {/* Pricing table */}
                <View style={{ marginBottom: 28 }}>
                    {/* Header row */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: NAVY, marginBottom: 0 }}>
                        <Text style={{ fontSize: 7, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase', color: SLATE }}>Description</Text>
                        <Text style={{ fontSize: 7, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase', color: SLATE }}>Amount</Text>
                    </View>

                    {/* Line items */}
                    {lineItems.map((item, i) => (
                        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
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

                    {/* Net total */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: BORDER }}>
                        <Text style={{ fontSize: 7.5, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase', color: SLATE, flexShrink: 0, marginLeft: 'auto', marginRight: 16 }}>Net Total Excl. GST</Text>
                        <Text style={{ fontSize: 11, fontWeight: 'bold', fontStyle: 'italic', color: NAVY }}>{currency(f.finalTotalPriceExclGst)}</Text>
                    </View>

                    {/* GST */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
                        <Text style={{ fontSize: 7.5, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase', color: MUTED, flexShrink: 0, marginLeft: 'auto', marginRight: 16 }}>GST (10%)</Text>
                        <Text style={{ fontSize: 8.5, fontWeight: 'bold', color: SLATE }}>{currency(f.gstAmount)}</Text>
                    </View>

                    {/* Grand total row */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: NAVY, borderRadius: 5, paddingHorizontal: 16, paddingVertical: 14, marginTop: 4 }}>
                        <Text style={{ fontSize: 8, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase', color: 'white' }}>Total Investment (Incl. GST)</Text>
                        <Text style={{ fontSize: 22, fontWeight: 'bold', fontStyle: 'italic', color: 'white', letterSpacing: -0.5 }}>{currency(f.totalInclGst)}</Text>
                    </View>
                </View>

                {/* Terms */}
                <View style={{ backgroundColor: LIGHT, borderWidth: 1, borderColor: BORDER, borderRadius: 5, padding: '10 12', marginBottom: 28 }}>
                    <Text style={{ fontSize: 7, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1.5, color: SLATE, marginBottom: 6 }}>Terms & Conditions</Text>
                    {[
                        '1. This proposal is valid for 30 days from the date of issue.',
                        '2. Prices are subject to change without notice after the validity period.',
                        '3. A non-refundable deposit may be required to secure this package.',
                        '4. Final delivery dates will be confirmed upon order acceptance.',
                    ].map((t, i) => (
                        <Text key={i} style={{ fontSize: 7, color: MUTED, lineHeight: 1.55, marginBottom: i < 3 ? 2 : 0 }}>{t}</Text>
                    ))}
                </View>

                {/* Signature blocks */}
                <View style={{ flexDirection: 'row', gap: 40, marginBottom: 24 }}>
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 7, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 2, color: MUTED, marginBottom: 12 }}>Merchant Authorisation</Text>
                        <View style={{ height: 60, borderBottomWidth: 1, borderBottomColor: '#cbd5e1' }} />
                        <Text style={{ fontSize: 8, fontWeight: 'bold', color: SLATE, marginTop: 8 }}>{quote.createdByName} — {organisation?.name}</Text>
                        <Text style={{ fontSize: 7, color: MUTED, marginTop: 2 }}>Date: _____ / _____ / _____</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 7, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 2, color: MUTED, marginBottom: 12 }}>Client Acceptance</Text>
                        <View style={{ height: 60, borderBottomWidth: 1, borderBottomColor: '#cbd5e1' }} />
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

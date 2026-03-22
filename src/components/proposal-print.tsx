'use client';

import Image from 'next/image';
import { CheckCircle2, MapPin, Phone, Mail, Globe } from 'lucide-react';
import { formatCurrency } from './proposal-view';

interface ProposalPrintProps {
    quote: any;
    organisation: any;
    financials: any;
}

/* ─── Shared helpers ─────────────────────────────────────────────────── */

const PAGE = { width: '210mm', minHeight: '297mm' } as const;
const PAD  = { padding: '14mm 16mm' } as const;
const PRIMARY = '#0066cc';  // hsl(210 100% 40%)
const DARK    = '#0f172a';

function PageHeader({ title, subtitle, quoteNumber, page }: { title: string; subtitle: string; quoteNumber: string; page: string }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: `2px solid ${DARK}`, paddingBottom: '14px', marginBottom: '24px' }}>
            <div>
                <h2 style={{ fontSize: '22px', letterSpacing: '-0.02em', fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', margin: 0, lineHeight: 1.1 }}>{title}</h2>
                <p style={{ fontSize: '7px', letterSpacing: '0.25em', fontWeight: 900, textTransform: 'uppercase', color: '#94a3b8', margin: '4px 0 0' }}>{subtitle}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '7px', fontWeight: 900, textTransform: 'uppercase', color: '#cbd5e1', margin: 0 }}>{quoteNumber}</p>
                <p style={{ fontSize: '7px', fontWeight: 900, textTransform: 'uppercase', color: '#cbd5e1', margin: 0 }}>Page {page}</p>
            </div>
        </div>
    );
}

function PageFooter({ organisation, quoteNumber }: { organisation: any; quoteNumber: string }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e2e8f0', paddingTop: '10px', marginTop: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '7px', fontWeight: 900, textTransform: 'uppercase', color: '#64748b' }}>{organisation?.name}</span>
                {organisation?.phoneNumber && (
                    <span style={{ fontSize: '7px', fontWeight: 700, color: '#94a3b8' }}>{organisation.phoneNumber}</span>
                )}
            </div>
            <span style={{ fontSize: '7px', fontWeight: 700, color: '#cbd5e1' }}>{quoteNumber}</span>
        </div>
    );
}

/* ─── Main Component ─────────────────────────────────────────────────── */

export function ProposalPrint({ quote, organisation, financials }: ProposalPrintProps) {
    const f = financials;
    const createdAt = quote.createdAt?.toDate?.() || new Date();
    const validUntil = new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);

    /* Build line items for pricing page */
    const lineItems: { label: string; sub?: string; amount: number }[] = [];
    if (f.boatBasePrice > 0) lineItems.push({ label: `${quote.modelName} — Base Vessel`, sub: [quote.variant?.material, quote.variant?.colorName].filter(Boolean).join(' · '), amount: f.boatBasePrice });
    if (quote.selectedOptions?.length > 0) {
        quote.selectedOptions.filter((opt: any) => !opt.isStandard).forEach((opt: any) => {
            lineItems.push({ label: opt.name, sub: opt.category, amount: opt.sellPriceExclGst || 0 });
        });
    }
    if (quote.customOptions?.length > 0) {
        quote.customOptions.forEach((opt: any) => {
            lineItems.push({ label: opt.name, sub: 'Custom Option', amount: opt.sellPriceExclGst || 0 });
        });
    }
    if (quote.motor) lineItems.push({ label: quote.motor.name, sub: `${quote.motor.brand} — Propulsion`, amount: f.motorTotal });
    if (quote.trailer) lineItems.push({ label: quote.trailer.name || 'Trailer Package', sub: 'Trailer & Options', amount: f.trailerTotal });
    if (f.dealerFitTotal > 0) lineItems.push({ label: 'Dealer Accessories & Preparation', sub: 'Dealer Fitout', amount: f.dealerFitTotal });
    if (f.regoTotal > 0) lineItems.push({ label: 'Registration & Compliance', sub: 'Government Fees', amount: f.regoTotal });

    /* Group factory options by category */
    const factoryOptions = [
        ...(quote.selectedOptions || []).filter((o: any) => !o.isStandard),
        ...(quote.customOptions || []),
    ];
    const optionGroups = factoryOptions.reduce((acc: Record<string, any[]>, opt: any) => {
        const cat = opt.category || 'General';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(opt);
        return acc;
    }, {});

    return (
        <div className="hidden print:block" style={{ background: 'white', color: DARK, fontFamily: 'system-ui, -apple-system, sans-serif', width: PAGE.width }}>

            {/* ═══════════════════════════════════════════════════════════
                PAGE 1 — COVER
            ═══════════════════════════════════════════════════════════ */}
            <div style={{ ...PAGE, height: '297mm', position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                {/* Full-bleed hero image (top 55%) */}
                {quote.coverImageUrl && (
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '55%', zIndex: 0 }}>
                        <Image src={quote.coverImageUrl} alt="" fill className="object-cover" style={{ objectPosition: 'center 40%' }} />
                        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(15,23,42,0.15) 0%, rgba(255,255,255,0.4) 60%, white 100%)' }} />
                    </div>
                )}

                {/* Logo bar */}
                <div style={{ position: 'relative', zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '14mm 16mm 0' }}>
                    {organisation?.primaryLogoUrl ? (
                        <div style={{ position: 'relative', height: '40px', width: '140px' }}>
                            <Image src={organisation.primaryLogoUrl} alt="" fill className="object-contain object-left" />
                        </div>
                    ) : (
                        <span style={{ fontSize: '14px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.02em' }}>{organisation?.name}</span>
                    )}
                    {quote.vendorLogoUrl && (
                        <div style={{ position: 'relative', height: '28px', width: '90px', opacity: 0.6 }}>
                            <Image src={quote.vendorLogoUrl} alt="" fill className="object-contain object-right" />
                        </div>
                    )}
                </div>

                {/* Content block — pushed to bottom */}
                <div style={{ position: 'relative', zIndex: 10, marginTop: 'auto', padding: '0 16mm 14mm' }}>

                    {/* Proposal badge */}
                    <div style={{ display: 'inline-block', padding: '4px 14px', borderRadius: '4px', background: PRIMARY, marginBottom: '12px' }}>
                        <span style={{ fontSize: '7px', fontWeight: 900, letterSpacing: '0.35em', textTransform: 'uppercase', color: 'white' }}>Official Proposal</span>
                    </div>

                    {/* Model title */}
                    <div style={{ marginBottom: '20px' }}>
                        <h1 style={{ fontSize: '56px', fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', letterSpacing: '-0.03em', lineHeight: 0.95, margin: 0, color: DARK }}>
                            {quote.modelName}
                        </h1>
                        <p style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#64748b', margin: '6px 0 0' }}>
                            {quote.rangeName} Series &bull; {quote.modelCode}
                        </p>
                    </div>

                    {/* Accent rule */}
                    <div style={{ width: '48px', height: '3px', background: PRIMARY, marginBottom: '24px' }} />

                    {/* Two-column info block */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' }}>
                        {/* Left — Client & meta */}
                        <div>
                            <p style={{ fontSize: '7px', fontWeight: 900, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#94a3b8', margin: '0 0 6px' }}>Prepared For</p>
                            <p style={{ fontSize: '20px', fontWeight: 900, color: DARK, margin: 0, lineHeight: 1.2 }}>{quote.customer.name}</p>
                            {quote.customer.company && <p style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', margin: '2px 0 0' }}>{quote.customer.company}</p>}

                            <div style={{ display: 'flex', gap: '20px', marginTop: '16px' }}>
                                <div>
                                    <p style={{ fontSize: '6px', fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#94a3b8', margin: '0 0 2px' }}>Quote No.</p>
                                    <p style={{ fontSize: '10px', fontWeight: 900, color: DARK, margin: 0 }}>{quote.quoteNumber}</p>
                                </div>
                                <div>
                                    <p style={{ fontSize: '6px', fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#94a3b8', margin: '0 0 2px' }}>Issued</p>
                                    <p style={{ fontSize: '10px', fontWeight: 900, color: DARK, margin: 0 }}>{createdAt.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                                </div>
                                <div>
                                    <p style={{ fontSize: '6px', fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#94a3b8', margin: '0 0 2px' }}>Valid Until</p>
                                    <p style={{ fontSize: '10px', fontWeight: 900, color: DARK, margin: 0 }}>{validUntil.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                                </div>
                            </div>

                            {/* Variant badge */}
                            {quote.variant && (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#f1f5f9', borderRadius: '20px', padding: '5px 12px', marginTop: '14px' }}>
                                    {quote.variant.colorCode && <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: quote.variant.colorCode, border: '2px solid white', boxShadow: '0 0 0 1px #e2e8f0' }} />}
                                    <span style={{ fontSize: '8px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#475569' }}>
                                        {quote.variant.material} &bull; {quote.variant.colorName}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Right — Total investment */}
                        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                            <p style={{ fontSize: '7px', fontWeight: 900, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#94a3b8', margin: '0 0 4px' }}>Total Investment</p>
                            <p style={{ fontSize: '42px', fontWeight: 900, fontStyle: 'italic', letterSpacing: '-0.03em', lineHeight: 1, color: DARK, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                                {formatCurrency(f.totalInclGst)}
                            </p>
                            <p style={{ fontSize: '8px', fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', margin: '4px 0 0' }}>Inclusive of GST</p>
                        </div>
                    </div>
                </div>

                {/* Bottom accent bar */}
                <div style={{ height: '4px', background: `linear-gradient(90deg, ${PRIMARY} 0%, ${DARK} 100%)`, flexShrink: 0 }} />
            </div>

            {/* ═══════════════════════════════════════════════════════════
                PAGE 2 — VESSEL CONFIGURATION
            ═══════════════════════════════════════════════════════════ */}
            <div style={{ ...PAGE, ...PAD, breakBefore: 'page', display: 'flex', flexDirection: 'column' }}>
                <PageHeader title="Vessel Configuration" subtitle="Technical Data & Standard Inclusions" quoteNumber={quote.quoteNumber} page="02" />

                {/* Two-column specs + features */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '28px', marginBottom: '24px' }}>
                    {/* Technical specs */}
                    {quote.specifications?.otherSpecs?.length > 0 && (
                        <div>
                            <p style={{ fontSize: '7px', fontWeight: 900, letterSpacing: '0.3em', textTransform: 'uppercase', color: PRIMARY, margin: '0 0 10px' }}>Technical Data</p>
                            <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
                                {quote.specifications.otherSpecs.map((s: any, i: number) => (
                                    <div key={i} style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        padding: '5px 10px',
                                        borderTop: i > 0 ? '1px solid #f1f5f9' : undefined,
                                        background: i % 2 === 0 ? '#fafbfc' : 'white',
                                    }}>
                                        <span style={{ fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', fontStyle: 'italic', color: '#64748b' }}>{s.label}</span>
                                        <span style={{ fontSize: '8px', fontWeight: 900, color: DARK }}>{s.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Standard features */}
                    {quote.standardFeatures?.length > 0 && (
                        <div>
                            <p style={{ fontSize: '7px', fontWeight: 900, letterSpacing: '0.3em', textTransform: 'uppercase', color: PRIMARY, margin: '0 0 10px' }}>Standard Features</p>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '3px' }}>
                                {quote.standardFeatures.slice(0, 22).map((feat: string, i: number) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                                        <CheckCircle2 style={{ width: '9px', height: '9px', marginTop: '1px', flexShrink: 0, color: '#10b981' }} />
                                        <span style={{ fontSize: '8px', fontWeight: 700, color: '#475569', lineHeight: 1.35 }}>{feat}</span>
                                    </div>
                                ))}
                                {quote.standardFeatures.length > 22 && (
                                    <p style={{ fontSize: '7px', fontStyle: 'italic', color: '#94a3b8', margin: '4px 0 0 15px' }}>+{quote.standardFeatures.length - 22} additional standard features</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Factory Options — grouped by category */}
                {factoryOptions.length > 0 && (
                    <div style={{ marginBottom: '20px' }}>
                        <p style={{ fontSize: '7px', fontWeight: 900, letterSpacing: '0.3em', textTransform: 'uppercase', color: PRIMARY, margin: '0 0 10px' }}>Selected Factory Options</p>
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
                            {Object.entries(optionGroups).map(([cat, opts], gi) => (
                                <div key={cat}>
                                    {/* Category header */}
                                    <div style={{
                                        background: '#f8fafc',
                                        padding: '5px 10px',
                                        borderTop: gi > 0 ? '1px solid #e2e8f0' : undefined,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                    }}>
                                        <span style={{ fontSize: '6.5px', fontWeight: 900, letterSpacing: '0.25em', textTransform: 'uppercase', color: PRIMARY }}>{cat}</span>
                                        <span style={{ fontSize: '6.5px', fontWeight: 900, color: '#94a3b8' }}>{(opts as any[]).length}</span>
                                    </div>
                                    {/* Items */}
                                    {(opts as any[]).map((opt: any, i: number) => (
                                        <div key={opt.id || i} style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '4px 10px',
                                            borderTop: '1px solid #f8fafc',
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                                                {opt.imageUrl ? (
                                                    <div style={{ position: 'relative', height: '20px', width: '20px', flexShrink: 0, borderRadius: '3px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                                                        <Image src={opt.imageUrl} alt="" fill className="object-contain" style={{ mixBlendMode: 'multiply' }} />
                                                    </div>
                                                ) : (
                                                    <CheckCircle2 style={{ width: '9px', height: '9px', color: '#10b981', flexShrink: 0 }} />
                                                )}
                                                <span style={{ fontSize: '8px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.03em', color: '#334155' }}>{opt.name}</span>
                                            </div>
                                            <span style={{ fontSize: '8px', fontWeight: 900, flexShrink: 0, paddingLeft: '12px', fontVariantNumeric: 'tabular-nums', color: '#334155' }}>
                                                {opt.sellPriceExclGst ? formatCurrency(opt.sellPriceExclGst) : <span style={{ color: '#94a3b8' }}>Incl.</span>}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Propulsion */}
                {quote.motor && (
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <p style={{ fontSize: '7px', fontWeight: 900, letterSpacing: '0.3em', textTransform: 'uppercase', color: PRIMARY, margin: '0 0 4px' }}>Propulsion System</p>
                                <p style={{ fontSize: '15px', fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', letterSpacing: '-0.01em', color: DARK, margin: 0 }}>{quote.motor.name}</p>
                                <p style={{ fontSize: '8px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#64748b', margin: '2px 0 0' }}>{quote.motor.brand}</p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                {quote.motor.imageUrl && (
                                    <div style={{ position: 'relative', height: '48px', width: '48px' }}>
                                        <Image src={quote.motor.imageUrl} alt="" fill className="object-contain" style={{ mixBlendMode: 'multiply' }} />
                                    </div>
                                )}
                                <p style={{ fontSize: '14px', fontWeight: 900, fontStyle: 'italic', fontVariantNumeric: 'tabular-nums', color: DARK, margin: 0 }}>{formatCurrency(f.motorTotal)}</p>
                            </div>
                        </div>
                        {(quote.motor.accessories?.length > 0) && (() => {
                            const groups: Record<string, any[]> = {};
                            quote.motor.accessories.forEach((acc: any) => {
                                const cat = acc.category || 'Accessories';
                                if (!groups[cat]) groups[cat] = [];
                                groups[cat].push(acc);
                            });
                            return (
                                <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #e2e8f0' }}>
                                    {Object.entries(groups).map(([cat, items]) => (
                                        <div key={cat} style={{ marginBottom: '6px' }}>
                                            <p style={{ fontSize: '6px', fontWeight: 900, letterSpacing: '0.25em', textTransform: 'uppercase', color: PRIMARY, margin: '0 0 4px' }}>{cat}</p>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                                                {(items as any[]).map((acc: any, i: number) => (
                                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: PRIMARY, flexShrink: 0 }} />
                                                        <span style={{ fontSize: '7px', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>
                                                            {acc.name}{acc.sellPriceExclGst ? ` — ${formatCurrency(acc.sellPriceExclGst)}` : ''}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            );
                        })()}
                    </div>
                )}

                {/* Trailer */}
                {quote.trailer && (
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div>
                            <p style={{ fontSize: '7px', fontWeight: 900, letterSpacing: '0.3em', textTransform: 'uppercase', color: PRIMARY, margin: '0 0 3px' }}>Trailer Package</p>
                            <p style={{ fontSize: '13px', fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', color: DARK, margin: 0 }}>{quote.trailer.name || 'Trailer'}</p>
                        </div>
                        <p style={{ fontSize: '13px', fontWeight: 900, fontStyle: 'italic', fontVariantNumeric: 'tabular-nums', color: DARK, margin: 0 }}>{formatCurrency(f.trailerTotal)}</p>
                    </div>
                )}

                {/* Dealer Fit */}
                {quote.dealerFit?.length > 0 && (
                    <div style={{ marginBottom: '16px' }}>
                        <p style={{ fontSize: '7px', fontWeight: 900, letterSpacing: '0.3em', textTransform: 'uppercase', color: PRIMARY, margin: '0 0 10px' }}>Dealer Accessories & Preparation</p>
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
                            {quote.dealerFit.map((group: any, gi: number) =>
                                group.items?.map((item: any, ii: number) => (
                                    <div key={`${gi}-${ii}`} style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        padding: '4px 10px',
                                        borderTop: (gi > 0 || ii > 0) ? '1px solid #f1f5f9' : undefined,
                                    }}>
                                        <span style={{ fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', color: '#475569' }}>{item.name}</span>
                                        <span style={{ fontSize: '8px', fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: '#334155' }}>{formatCurrency(item.sellPriceExclGst || 0)}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                <PageFooter organisation={organisation} quoteNumber={quote.quoteNumber} />
            </div>

            {/* ═══════════════════════════════════════════════════════════
                PAGE 3 — INVESTMENT SUMMARY & ACCEPTANCE
            ═══════════════════════════════════════════════════════════ */}
            <div style={{ ...PAGE, ...PAD, breakBefore: 'page', display: 'flex', flexDirection: 'column' }}>
                <PageHeader title="Investment Summary" subtitle="Comprehensive Package Breakdown" quoteNumber={quote.quoteNumber} page="03" />

                {/* Pricing table */}
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '32px' }}>
                    <thead>
                        <tr style={{ borderBottom: `2px solid ${DARK}` }}>
                            <th style={{ fontSize: '7px', letterSpacing: '0.2em', fontWeight: 900, textTransform: 'uppercase', textAlign: 'left', paddingBottom: '8px', color: '#64748b' }}>Description</th>
                            <th style={{ fontSize: '7px', letterSpacing: '0.2em', fontWeight: 900, textTransform: 'uppercase', textAlign: 'right', paddingBottom: '8px', width: '100px', color: '#64748b' }}>Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lineItems.map((item, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '7px 0' }}>
                                    <p style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.03em', color: DARK, margin: 0 }}>{item.label}</p>
                                    {item.sub && <p style={{ fontSize: '7px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8', margin: '1px 0 0' }}>{item.sub}</p>}
                                </td>
                                <td style={{ padding: '7px 0', textAlign: 'right' }}>
                                    <span style={{ fontSize: '9px', fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: DARK }}>{formatCurrency(item.amount)}</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        {/* Subtotal (if discount) */}
                        {f.subtotalExclGst !== f.finalTotalPriceExclGst && (
                            <tr style={{ borderTop: '1px solid #e2e8f0' }}>
                                <td style={{ padding: '8px 0', textAlign: 'right', paddingRight: '20px' }}>
                                    <span style={{ fontSize: '8px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#94a3b8' }}>Subtotal Excl. GST</span>
                                </td>
                                <td style={{ padding: '8px 0', textAlign: 'right' }}>
                                    <span style={{ fontSize: '9px', fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: '#64748b' }}>{formatCurrency(f.subtotalExclGst)}</span>
                                </td>
                            </tr>
                        )}
                        {/* Discount row */}
                        {f.subtotalExclGst !== f.finalTotalPriceExclGst && (
                            <tr>
                                <td style={{ padding: '6px 0', textAlign: 'right', paddingRight: '20px' }}>
                                    <span style={{ fontSize: '8px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#059669' }}>Discount Applied</span>
                                </td>
                                <td style={{ padding: '6px 0', textAlign: 'right' }}>
                                    <span style={{ fontSize: '9px', fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: '#059669' }}>-{formatCurrency(f.subtotalExclGst - f.finalTotalPriceExclGst)}</span>
                                </td>
                            </tr>
                        )}
                        {/* Net total */}
                        <tr style={{ borderTop: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '8px 0', textAlign: 'right', paddingRight: '20px' }}>
                                <span style={{ fontSize: '8px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#475569' }}>Net Total Excl. GST</span>
                            </td>
                            <td style={{ padding: '8px 0', textAlign: 'right' }}>
                                <span style={{ fontSize: '11px', fontWeight: 900, fontStyle: 'italic', fontVariantNumeric: 'tabular-nums', color: DARK }}>{formatCurrency(f.finalTotalPriceExclGst)}</span>
                            </td>
                        </tr>
                        {/* GST */}
                        <tr style={{ borderTop: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '6px 0', textAlign: 'right', paddingRight: '20px' }}>
                                <span style={{ fontSize: '8px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#94a3b8' }}>GST (10%)</span>
                            </td>
                            <td style={{ padding: '6px 0', textAlign: 'right' }}>
                                <span style={{ fontSize: '9px', fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: '#64748b' }}>{formatCurrency(f.gstAmount)}</span>
                            </td>
                        </tr>
                        {/* Grand total */}
                        <tr style={{ background: DARK, color: 'white' }}>
                            <td style={{ padding: '14px 16px' }}>
                                <span style={{ fontSize: '8px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em' }}>Total Investment (Incl. GST)</span>
                            </td>
                            <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                                <span style={{ fontSize: '20px', fontWeight: 900, fontStyle: 'italic', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{formatCurrency(f.totalInclGst)}</span>
                            </td>
                        </tr>
                    </tfoot>
                </table>

                {/* Terms & conditions */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px 12px', marginBottom: '32px' }}>
                    <p style={{ fontSize: '7px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#64748b', margin: '0 0 6px' }}>Terms & Conditions</p>
                    <div style={{ fontSize: '7px', fontWeight: 600, color: '#94a3b8', lineHeight: 1.5 }}>
                        <p style={{ margin: '0 0 3px' }}>1. This proposal is valid for 30 days from the date of issue.</p>
                        <p style={{ margin: '0 0 3px' }}>2. Prices are subject to change without notice after the validity period.</p>
                        <p style={{ margin: '0 0 3px' }}>3. A non-refundable deposit may be required to secure this package.</p>
                        <p style={{ margin: 0 }}>4. Final delivery dates will be confirmed upon order acceptance.</p>
                    </div>
                </div>

                {/* Signature / acceptance block */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', marginBottom: '24px' }}>
                    <div>
                        <p style={{ fontSize: '7px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#94a3b8', margin: '0 0 12px' }}>Merchant Authorisation</p>
                        <div style={{ height: '60px', borderBottom: '1px solid #cbd5e1' }} />
                        <p style={{ fontSize: '8px', fontWeight: 700, color: '#64748b', margin: '8px 0 0' }}>
                            {quote.createdByName} &bull; {organisation?.name}
                        </p>
                        <p style={{ fontSize: '7px', fontWeight: 600, color: '#94a3b8', margin: '2px 0 0' }}>Date: _____ / _____ / _____</p>
                    </div>
                    <div>
                        <p style={{ fontSize: '7px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#94a3b8', margin: '0 0 12px' }}>Client Acceptance</p>
                        <div style={{ height: '60px', borderBottom: '1px solid #cbd5e1' }} />
                        <p style={{ fontSize: '8px', fontWeight: 700, color: '#64748b', margin: '8px 0 0' }}>{quote.customer.name}</p>
                        <p style={{ fontSize: '7px', fontWeight: 600, color: '#94a3b8', margin: '2px 0 0' }}>Date: _____ / _____ / _____</p>
                    </div>
                </div>

                {/* Page footer */}
                <div style={{ marginTop: 'auto', borderTop: '1px solid #e2e8f0', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <p style={{ fontSize: '8px', fontWeight: 900, textTransform: 'uppercase', color: '#334155', margin: '0 0 4px' }}>{organisation?.name}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                            {organisation?.address && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                    <MapPin style={{ width: '8px', height: '8px', color: '#94a3b8' }} />
                                    <span style={{ fontSize: '7px', fontWeight: 600, color: '#64748b' }}>{organisation.address}</span>
                                </div>
                            )}
                            {organisation?.phoneNumber && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                    <Phone style={{ width: '8px', height: '8px', color: '#94a3b8' }} />
                                    <span style={{ fontSize: '7px', fontWeight: 600, color: '#64748b' }}>{organisation.phoneNumber}</span>
                                </div>
                            )}
                            {organisation?.email && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                    <Mail style={{ width: '8px', height: '8px', color: '#94a3b8' }} />
                                    <span style={{ fontSize: '7px', fontWeight: 600, color: '#64748b' }}>{organisation.email}</span>
                                </div>
                            )}
                        </div>
                    </div>
                    <p style={{ fontSize: '6.5px', fontWeight: 600, fontStyle: 'italic', color: '#94a3b8', maxWidth: '200px', textAlign: 'right', margin: 0 }}>
                        &copy; {new Date().getFullYear()} HelmLogic. All prices in AUD unless otherwise stated.
                    </p>
                </div>
            </div>
        </div>
    );
}

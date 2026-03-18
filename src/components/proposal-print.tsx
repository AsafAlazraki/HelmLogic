'use client';

import Image from 'next/image';
import { CheckCircle2, MapPin, Phone } from 'lucide-react';
import { formatCurrency } from './proposal-view';

interface ProposalPrintProps {
    quote: any;
    organisation: any;
    financials: any;
}

export function ProposalPrint({ quote, organisation, financials }: ProposalPrintProps) {
    const f = financials;
    const createdAt = quote.createdAt?.toDate?.() || new Date();
    const validUntil = new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);

    const lineItems: { label: string; sub?: string; amount: number }[] = [];
    if (f.boatBasePrice > 0) lineItems.push({ label: `${quote.modelName} — Base Vessel`, sub: [quote.variant?.material, quote.variant?.colorName].filter(Boolean).join(' · '), amount: f.boatBasePrice });
    if (quote.selectedOptions?.length > 0) {
        quote.selectedOptions.forEach((opt: any) => {
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
    if (f.regoTotal > 0) lineItems.push({ label: 'Registration & Compliance', sub: 'Government Fees (Pass-through)', amount: f.regoTotal });

    return (
        <div className="hidden print:block bg-white text-slate-900 font-sans" style={{ width: '210mm' }}>

            {/* ── PAGE 1: COVER ─────────────────────────────────────────── */}
            <div className="relative flex flex-col overflow-hidden" style={{ height: '297mm' }}>
                {/* Hero image */}
                {quote.coverImageUrl && (
                    <div className="absolute inset-0 z-0" style={{ height: '62%' }}>
                        <Image src={quote.coverImageUrl} alt="" fill className="object-cover" unoptimized />
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/10 to-white" />
                    </div>
                )}

                <div className="relative z-10 flex flex-col h-full p-14 pb-0">
                    {/* Logos */}
                    <div className="flex justify-between items-start">
                        {organisation?.primaryLogoUrl && (
                            <div className="relative" style={{ height: '48px', width: '160px' }}>
                                <Image src={organisation.primaryLogoUrl} alt="" fill className="object-contain object-left" unoptimized />
                            </div>
                        )}
                        {quote.vendorLogoUrl && (
                            <div className="relative opacity-70" style={{ height: '36px', width: '100px' }}>
                                <Image src={quote.vendorLogoUrl} alt="" fill className="object-contain object-right" unoptimized />
                            </div>
                        )}
                    </div>

                    {/* Title block — pushed to lower 40% */}
                    <div className="mt-auto pb-16 space-y-5">
                        <div className="space-y-1">
                            <p style={{ fontSize: '8px', letterSpacing: '0.4em' }} className="font-black uppercase text-primary">Official Proposal</p>
                            <h1 style={{ fontSize: '64px', lineHeight: 1, letterSpacing: '-0.03em' }} className="font-black uppercase italic text-slate-900">
                                {quote.modelName}
                            </h1>
                            <p style={{ fontSize: '11px', letterSpacing: '0.25em' }} className="font-black uppercase text-slate-400">
                                {quote.rangeName} Series &bull; {quote.modelCode}
                            </p>
                        </div>

                        <div style={{ height: '3px', width: '40px' }} className="bg-primary" />

                        <div className="grid gap-10" style={{ gridTemplateColumns: '1fr 1fr', paddingTop: '24px' }}>
                            <div className="space-y-3">
                                <div>
                                    <p style={{ fontSize: '8px', letterSpacing: '0.3em' }} className="font-black uppercase text-slate-400 mb-1">Prepared For</p>
                                    <p style={{ fontSize: '20px' }} className="font-black text-slate-900">{quote.customer.name}</p>
                                    {quote.customer.company && <p style={{ fontSize: '10px' }} className="font-bold text-slate-500">{quote.customer.company}</p>}
                                </div>
                                <div className="flex gap-5">
                                    <div>
                                        <p style={{ fontSize: '7px', letterSpacing: '0.15em' }} className="font-black uppercase text-slate-400">Quote No.</p>
                                        <p style={{ fontSize: '11px' }} className="font-black text-slate-900">{quote.quoteNumber}</p>
                                    </div>
                                    <div>
                                        <p style={{ fontSize: '7px', letterSpacing: '0.15em' }} className="font-black uppercase text-slate-400">Date Issued</p>
                                        <p style={{ fontSize: '11px' }} className="font-black text-slate-900">{createdAt.toLocaleDateString('en-AU')}</p>
                                    </div>
                                    <div>
                                        <p style={{ fontSize: '7px', letterSpacing: '0.15em' }} className="font-black uppercase text-slate-400">Valid Until</p>
                                        <p style={{ fontSize: '11px' }} className="font-black text-slate-900">{validUntil.toLocaleDateString('en-AU')}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="text-right">
                                <p style={{ fontSize: '8px', letterSpacing: '0.3em' }} className="font-black uppercase text-slate-400 mb-1">Total Investment</p>
                                <p style={{ fontSize: '42px', letterSpacing: '-0.03em', lineHeight: 1 }} className="font-black italic text-slate-900 tabular-nums">
                                    {formatCurrency(f.totalInclGst)}
                                </p>
                                <p style={{ fontSize: '8px', letterSpacing: '0.12em' }} className="font-black uppercase text-slate-400 mt-1">Inclusive of GST</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom bar */}
                <div className="h-3 bg-slate-900 w-full shrink-0" />
            </div>

            {/* ── PAGE 2: CONFIGURATION ────────────────────────────────── */}
            <div className="p-14 space-y-8" style={{ minHeight: '297mm', breakBefore: 'page' }}>
                {/* Page header */}
                <div className="flex justify-between items-end border-b-2 border-slate-900 pb-5">
                    <div>
                        <h2 style={{ fontSize: '26px', letterSpacing: '-0.02em' }} className="font-black uppercase italic">Vessel Configuration</h2>
                        <p style={{ fontSize: '8px', letterSpacing: '0.25em' }} className="font-black uppercase text-slate-400">Detailed Specifications &amp; Standard Inclusions</p>
                    </div>
                    <div className="text-right">
                        <p style={{ fontSize: '7px' }} className="font-black uppercase text-slate-300">{quote.quoteNumber}</p>
                        <p style={{ fontSize: '7px' }} className="font-black uppercase text-slate-300">Page 02</p>
                    </div>
                </div>

                <div className="grid gap-10" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    {/* Technical specs */}
                    <div>
                        <h3 style={{ fontSize: '8px', letterSpacing: '0.3em' }} className="font-black uppercase text-primary mb-4">Technical Data</h3>
                        <div className="space-y-0">
                            {quote.specifications?.otherSpecs?.map((s: any, i: number) => (
                                <div key={i} className="flex justify-between py-2 border-b border-slate-100">
                                    <span style={{ fontSize: '9px' }} className="font-bold text-slate-500 uppercase italic">{s.label}</span>
                                    <span style={{ fontSize: '9px' }} className="font-black text-slate-900">{s.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Standard features */}
                    <div>
                        <h3 style={{ fontSize: '8px', letterSpacing: '0.3em' }} className="font-black uppercase text-primary mb-4">Standard Features</h3>
                        <div className="space-y-1.5">
                            {quote.standardFeatures?.slice(0, 18).map((feat: string, i: number) => (
                                <div key={i} className="flex items-start gap-1.5">
                                    <CheckCircle2 style={{ width: '10px', height: '10px', marginTop: '1px', flexShrink: 0 }} className="text-emerald-500" />
                                    <span style={{ fontSize: '9px', lineHeight: 1.35 }} className="font-bold text-slate-600">{feat}</span>
                                </div>
                            ))}
                            {quote.standardFeatures?.length > 18 && (
                                <p style={{ fontSize: '7px' }} className="italic text-slate-400 mt-1">+{quote.standardFeatures.length - 18} additional standard features</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Propulsion */}
                {quote.motor && (
                    <div className="bg-slate-50 rounded-2xl border-2 border-slate-200 p-6">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 style={{ fontSize: '8px', letterSpacing: '0.3em' }} className="font-black uppercase text-primary mb-1">Propulsion System</h3>
                                <p style={{ fontSize: '16px', letterSpacing: '-0.01em' }} className="font-black uppercase italic">{quote.motor.name}</p>
                                <p style={{ fontSize: '8px', letterSpacing: '0.15em' }} className="font-black uppercase text-slate-400">{quote.motor.brand}</p>
                            </div>
                            {quote.motor.imageUrl && (
                                <div className="relative mix-blend-multiply" style={{ height: '56px', width: '56px' }}>
                                    <Image src={quote.motor.imageUrl} alt="" fill className="object-contain" unoptimized />
                                </div>
                            )}
                        </div>
                        {quote.motor.accessories?.length > 0 && (
                            <div className="grid gap-x-6 gap-y-1 pt-3 border-t border-slate-200" style={{ gridTemplateColumns: '1fr 1fr' }}>
                                {quote.motor.accessories.map((acc: any, i: number) => (
                                    <div key={i} className="flex items-center gap-1.5">
                                        <div style={{ height: '4px', width: '4px', borderRadius: '50%' }} className="bg-slate-300 shrink-0" />
                                        <span style={{ fontSize: '8px', letterSpacing: '0.1em' }} className="font-bold uppercase text-slate-500">{acc.name}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Trailer (if present) */}
                {quote.trailer && (
                    <div className="bg-slate-50 rounded-2xl border-2 border-slate-200 p-5 flex justify-between items-center">
                        <div>
                            <h3 style={{ fontSize: '8px', letterSpacing: '0.3em' }} className="font-black uppercase text-primary mb-1">Trailer Package</h3>
                            <p style={{ fontSize: '14px', letterSpacing: '-0.01em' }} className="font-black uppercase italic">{quote.trailer.name || 'Trailer'}</p>
                        </div>
                        <p style={{ fontSize: '14px' }} className="font-black italic tabular-nums">{formatCurrency(f.trailerTotal)}</p>
                    </div>
                )}
            </div>

            {/* ── PAGE 3: PRICING & ACCEPTANCE ─────────────────────────── */}
            <div className="p-14 flex flex-col" style={{ minHeight: '297mm', breakBefore: 'page' }}>
                {/* Page header */}
                <div className="flex justify-between items-end border-b-2 border-slate-900 pb-5 mb-8">
                    <div>
                        <h2 style={{ fontSize: '26px', letterSpacing: '-0.02em' }} className="font-black uppercase italic">Investment Summary</h2>
                        <p style={{ fontSize: '8px', letterSpacing: '0.25em' }} className="font-black uppercase text-slate-400">Comprehensive Package Breakdown</p>
                    </div>
                    <div className="text-right">
                        <p style={{ fontSize: '7px' }} className="font-black uppercase text-slate-300">{quote.quoteNumber}</p>
                        <p style={{ fontSize: '7px' }} className="font-black uppercase text-slate-300">Page 03</p>
                    </div>
                </div>

                {/* Pricing table */}
                <div className="flex-1">
                    <table className="w-full text-left" style={{ borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #0f172a' }}>
                                <th style={{ fontSize: '8px', letterSpacing: '0.2em', paddingBottom: '10px' }} className="font-black uppercase">Description</th>
                                <th style={{ fontSize: '8px', letterSpacing: '0.2em', paddingBottom: '10px', textAlign: 'right', width: '100px' }} className="font-black uppercase">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {lineItems.map((item, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '8px 0' }}>
                                        <p style={{ fontSize: '10px', letterSpacing: '0.05em' }} className="font-black uppercase text-slate-900">{item.label}</p>
                                        {item.sub && <p style={{ fontSize: '7px', letterSpacing: '0.15em' }} className="font-bold uppercase text-slate-400 mt-0.5">{item.sub}</p>}
                                    </td>
                                    <td style={{ padding: '8px 0', textAlign: 'right' }}>
                                        <p style={{ fontSize: '10px' }} className="font-black tabular-nums">{formatCurrency(item.amount)}</p>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            {f.subtotalExclGst !== f.finalTotalPriceExclGst && (
                                <tr style={{ borderTop: '1px solid #e2e8f0' }}>
                                    <td style={{ padding: '10px 0', paddingRight: '24px', textAlign: 'right' }}>
                                        <p style={{ fontSize: '8px', letterSpacing: '0.15em' }} className="font-black uppercase text-slate-400">Subtotal Excl. GST</p>
                                    </td>
                                    <td style={{ padding: '10px 0', textAlign: 'right' }}>
                                        <p style={{ fontSize: '10px' }} className="font-black tabular-nums text-slate-500">{formatCurrency(f.subtotalExclGst)}</p>
                                    </td>
                                </tr>
                            )}
                            {f.finalTotalPriceExclGst !== f.subtotalExclGst && (
                                <tr>
                                    <td style={{ padding: '6px 0', paddingRight: '24px', textAlign: 'right' }}>
                                        <p style={{ fontSize: '8px', letterSpacing: '0.15em' }} className="font-black uppercase text-emerald-600">Discount Applied</p>
                                    </td>
                                    <td style={{ padding: '6px 0', textAlign: 'right' }}>
                                        <p style={{ fontSize: '10px' }} className="font-black tabular-nums text-emerald-600">-{formatCurrency(f.subtotalExclGst - f.finalTotalPriceExclGst)}</p>
                                    </td>
                                </tr>
                            )}
                            <tr style={{ borderTop: '1px solid #e2e8f0' }}>
                                <td style={{ padding: '8px 0', paddingRight: '24px', textAlign: 'right' }}>
                                    <p style={{ fontSize: '8px', letterSpacing: '0.15em' }} className="font-black uppercase text-slate-400">Net Total Excl. GST</p>
                                </td>
                                <td style={{ padding: '8px 0', textAlign: 'right' }}>
                                    <p style={{ fontSize: '12px' }} className="font-black italic tabular-nums">{formatCurrency(f.finalTotalPriceExclGst)}</p>
                                </td>
                            </tr>
                            <tr style={{ borderTop: '1px solid #e2e8f0' }}>
                                <td style={{ padding: '8px 0', paddingRight: '24px', textAlign: 'right' }}>
                                    <p style={{ fontSize: '8px', letterSpacing: '0.15em' }} className="font-black uppercase text-slate-400">GST (10%)</p>
                                </td>
                                <td style={{ padding: '8px 0', textAlign: 'right' }}>
                                    <p style={{ fontSize: '10px' }} className="font-black tabular-nums text-slate-500">{formatCurrency(f.gstAmount)}</p>
                                </td>
                            </tr>
                            <tr style={{ backgroundColor: '#0f172a', color: 'white' }}>
                                <td style={{ padding: '14px 16px', fontSize: '9px', letterSpacing: '0.2em' }} className="font-black uppercase">
                                    Total Investment (Incl. GST)
                                </td>
                                <td style={{ padding: '14px 16px', textAlign: 'right', fontSize: '22px', letterSpacing: '-0.02em' }} className="font-black italic tabular-nums">
                                    {formatCurrency(f.totalInclGst)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                {/* Acceptance block */}
                <div className="mt-10 space-y-10">
                    <div className="grid gap-12" style={{ gridTemplateColumns: '1fr 1fr' }}>
                        <div>
                            <p style={{ fontSize: '8px', letterSpacing: '0.2em' }} className="font-black uppercase text-slate-400 mb-4">Merchant Authorisation</p>
                            <div style={{ height: '80px', borderBottom: '1px solid #cbd5e1' }} />
                            <p style={{ fontSize: '8px' }} className="font-bold uppercase text-slate-400 mt-2">
                                {quote.createdByName} &bull; {organisation?.name}
                            </p>
                        </div>
                        <div>
                            <p style={{ fontSize: '8px', letterSpacing: '0.2em' }} className="font-black uppercase text-slate-400 mb-4">Client Acceptance</p>
                            <div style={{ height: '80px', borderBottom: '1px solid #cbd5e1' }} />
                            <p style={{ fontSize: '8px' }} className="font-bold uppercase text-slate-400 mt-2">{quote.customer.name}</p>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="pt-8 border-t flex justify-between items-start" style={{ opacity: 0.4 }}>
                        <div className="space-y-1">
                            <p style={{ fontSize: '8px' }} className="font-black uppercase text-slate-900">{organisation?.name}</p>
                            <div className="flex items-center gap-4">
                                {organisation?.address && (
                                    <div className="flex items-center gap-1">
                                        <MapPin style={{ width: '8px', height: '8px' }} />
                                        <span style={{ fontSize: '7px' }} className="font-bold">{organisation.address}</span>
                                    </div>
                                )}
                                {organisation?.phoneNumber && (
                                    <div className="flex items-center gap-1">
                                        <Phone style={{ width: '8px', height: '8px' }} />
                                        <span style={{ fontSize: '7px' }} className="font-bold">{organisation.phoneNumber}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        <p style={{ fontSize: '7px', maxWidth: '260px', textAlign: 'right' }} className="font-bold italic text-slate-500">
                            Valid for 30 days from date of issue. Prices subject to change without notice. &copy; {new Date().getFullYear()} HelmLogic.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

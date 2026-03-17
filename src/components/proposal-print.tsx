'use client';

import Image from 'next/image';
import { Anchor, CheckCircle2, MapPin, Phone, Mail, Globe } from 'lucide-react';
import { formatCurrency } from './proposal-view';

interface ProposalPrintProps {
    quote: any;
    organisation: any;
    financials: any;
}

export function ProposalPrint({ quote, organisation, financials }: ProposalPrintProps) {
    const f = financials;
    const createdAt = quote.createdAt?.toDate?.() || new Date();

    return (
        <div className="hidden print:block bg-white w-[210mm] min-h-[297mm] mx-auto text-slate-900 font-sans p-0">
            {/* PAGE 1: COVER PAGE */}
            <div className="relative h-[297mm] flex flex-col overflow-hidden border-b">
                 {/* Hero Image Background */}
                 {quote.coverImageUrl && (
                    <div className="absolute inset-0 z-0 h-[65%]">
                        <Image src={quote.coverImageUrl} alt="" fill className="object-cover" unoptimized />
                        <div className="absolute inset-0 bg-gradient-to-t from-white via-white/20 to-transparent" />
                    </div>
                 )}

                 <div className="relative z-10 flex-1 flex flex-col justify-end p-16 pb-24">
                    {/* Header Logos */}
                    <div className="absolute top-16 left-16 right-16 flex justify-between items-start">
                         {organisation?.primaryLogoUrl && (
                            <div className="relative h-16 w-48">
                                <Image src={organisation.primaryLogoUrl} alt="" fill className="object-contain object-left" unoptimized />
                            </div>
                         )}
                         {quote.vendorLogoUrl && (
                            <div className="relative h-12 w-32 opacity-80">
                                <Image src={quote.vendorLogoUrl} alt="" fill className="object-contain object-right" unoptimized />
                            </div>
                         )}
                    </div>

                    <div className="space-y-6">
                        <div className="space-y-2">
                             <div className="text-primary font-black uppercase tracking-[0.5em] text-xs">OFFICIAL PROPOSAL</div>
                             <h1 className="text-7xl font-black uppercase italic tracking-tighter leading-none text-slate-900">
                                {quote.modelName}
                             </h1>
                             <p className="text-xl font-bold text-slate-400 uppercase tracking-widest">{quote.rangeName} SERIES &bull; {quote.modelCode}</p>
                        </div>

                        <div className="h-1 w-32 bg-primary" />

                        <div className="pt-8 grid grid-cols-2 gap-12">
                            <div className="space-y-4">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Prepared For</p>
                                    <p className="text-2xl font-black text-slate-900">{quote.customer.name}</p>
                                    {quote.customer.company && <p className="text-sm font-bold text-slate-500">{quote.customer.company}</p>}
                                </div>
                                <div className="flex gap-6">
                                    <div><p className="text-[8px] font-black uppercase text-slate-400">Quote Number</p><p className="font-black text-slate-900">{quote.quoteNumber}</p></div>
                                    <div><p className="text-[8px] font-black uppercase text-slate-400">Valid Until</p><p className="font-black text-slate-900">{new Date(createdAt.getTime() + 30*24*60*60*1000).toLocaleDateString()}</p></div>
                                </div>
                            </div>
                            <div className="flex flex-col justify-end text-right">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Total Investment</p>
                                <p className="text-5xl font-black italic tracking-tighter text-slate-900">{formatCurrency(f.totalInclGst)}</p>
                                <p className="text-xs font-bold text-slate-400 mt-1 uppercase">Inclusive of GST</p>
                            </div>
                        </div>
                    </div>
                 </div>

                 <div className="h-4 bg-slate-900 w-full" />
            </div>

            {/* PAGE 2: CONFIGURATION & SPECS */}
            <div className="relative h-[297mm] p-16 space-y-12 page-break">
                <div className="flex justify-between items-end border-b-2 pb-6">
                    <div>
                        <h2 className="text-3xl font-black uppercase italic tracking-tight">Vessel Configuration</h2>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Detailed Specifications & Standard Inclusions</p>
                    </div>
                     <div className="text-right">
                        <p className="text-[8px] font-black text-slate-300 uppercase">Quote #{quote.quoteNumber}</p>
                        <p className="text-[8px] font-black text-slate-300 uppercase">Page 02</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-12">
                    <div className="space-y-8">
                        <div>
                            <h3 className="text-xs font-black uppercase tracking-[0.3em] text-primary mb-4">Technical Data</h3>
                            <div className="space-y-2">
                                {quote.specifications?.otherSpecs?.map((s: any, i: number) => (
                                    <div key={i} className="flex justify-between py-2 border-b border-slate-100 italic">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase">{s.label}</span>
                                        <span className="text-[10px] font-black">{s.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-8">
                         <div>
                            <h3 className="text-xs font-black uppercase tracking-[0.3em] text-primary mb-4">Standard Features</h3>
                            <div className="grid grid-cols-1 gap-2">
                                {quote.standardFeatures?.slice(0, 15).map((f: string, i: number) => (
                                    <div key={i} className="flex items-start gap-2">
                                        <CheckCircle2 className="h-3 w-3 text-emerald-500 mt-0.5 shrink-0" />
                                        <span className="text-[10px] font-bold text-slate-600 leading-tight">{f}</span>
                                    </div>
                                ))}
                                {quote.standardFeatures?.length > 15 && <p className="text-[8px] italic text-slate-400 mt-2">+ {quote.standardFeatures.length - 15} additional standard features</p>}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Propulsion Section */}
                {quote.motor && (
                    <div className="bg-slate-50 p-8 rounded-2xl border-2 space-y-4">
                        <div className="flex justify-between items-start">
                             <div>
                                <h3 className="text-xs font-black uppercase tracking-[0.3em] text-primary mb-1">Propulsion System</h3>
                                <p className="text-xl font-black uppercase italic">{quote.motor.name}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">{quote.motor.brand}</p>
                             </div>
                             {quote.motor.imageUrl && (
                                <div className="relative h-16 w-16 mix-blend-multiply">
                                    <Image src={quote.motor.imageUrl} alt="" fill className="object-contain" unoptimized />
                                </div>
                             )}
                        </div>
                        {quote.motor.accessories?.length > 0 && (
                            <div className="grid grid-cols-2 gap-x-8 gap-y-1 pt-2 border-t border-slate-200">
                                {quote.motor.accessories.map((acc: any, i: number) => (
                                    <div key={i} className="flex items-center gap-2">
                                        <div className="h-1 w-1 rounded-full bg-slate-300" />
                                        <span className="text-[10px] font-bold text-slate-500 uppercase">{acc.name}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* PAGE 3: PRICING BREAKDOWN & ACCEPTANCE */}
            <div className="relative h-[297mm] p-16 flex flex-col page-break">
                <div className="flex justify-between items-end border-b-2 pb-6 mb-12">
                    <div>
                        <h2 className="text-3xl font-black uppercase italic tracking-tight">Investment Summary</h2>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Comprehensive Package Breakdown</p>
                    </div>
                     <div className="text-right">
                        <p className="text-[8px] font-black text-slate-300 uppercase">Quote #{quote.quoteNumber}</p>
                        <p className="text-[8px] font-black text-slate-300 uppercase">Page 03</p>
                    </div>
                </div>

                <div className="flex-1">
                     <table className="w-full text-left">
                        <thead className="border-b-2 border-slate-900">
                            <tr>
                                <th className="py-4 text-xs font-black uppercase tracking-widest">Description</th>
                                <th className="py-4 text-right text-xs font-black uppercase tracking-widest w-32">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                             <tr>
                                <td className="py-4">
                                    <p className="text-sm font-black uppercase">{quote.modelName} Base Vessel</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase">{quote.variant?.material} &bull; {quote.variant?.colorName}</p>
                                </td>
                                <td className="py-4 text-right font-black text-sm">{formatCurrency(f.boatBasePrice)}</td>
                             </tr>

                             {/* Options Group */}
                             {(quote.selectedOptions?.length > 0 || quote.customOptions?.length > 0) && (
                                <>
                                    <tr className="bg-slate-50/50"><td colSpan={2} className="py-2 px-4 text-[9px] font-black uppercase tracking-widest text-primary">Factory Options</td></tr>
                                    {quote.selectedOptions.map((opt: any) => (
                                        <tr key={opt.id}>
                                            <td className="py-3 pl-4 text-xs font-bold text-slate-600 uppercase">{opt.name}</td>
                                            <td className="py-3 text-right font-black text-xs text-slate-600">{formatCurrency(opt.sellPriceExclGst)}</td>
                                        </tr>
                                    ))}
                                </>
                             )}

                             {/* Motor */}
                             {quote.motor && (
                                <>
                                     <tr className="bg-slate-50/50"><td colSpan={2} className="py-2 px-4 text-[9px] font-black uppercase tracking-widest text-primary">Propulsion System</td></tr>
                                     <tr>
                                        <td className="py-3 pl-4 text-xs font-bold text-slate-600 uppercase">{quote.motor.name}</td>
                                        <td className="py-3 text-right font-black text-xs text-slate-600">{formatCurrency(quote.motor.sellPriceExclGst)}</td>
                                     </tr>
                                </>
                             )}

                             {/* Dealer Fit */}
                             {quote.dealerFit?.length > 0 && (
                                <>
                                     <tr className="bg-slate-50/50"><td colSpan={2} className="py-2 px-4 text-[9px] font-black uppercase tracking-widest text-primary">Dealer Accessories & Preparation</td></tr>
                                     {quote.dealerFit.map((fit: any, i: number) => (
                                        <tr key={i}>
                                            <td className="py-3 pl-4 text-xs font-bold text-slate-600 uppercase">{fit.name}</td>
                                            <td className="py-3 text-right font-black text-xs text-slate-600">{formatCurrency(fit.items?.reduce((a: any, b: any) => a + (b.sellPriceExclGst || 0), 0))}</td>
                                        </tr>
                                     ))}
                                </>
                             )}
                        </tbody>
                        <tfoot>
                             <tr className="border-t-2 border-slate-900">
                                <td className="py-6 text-right pr-8 text-xs font-black uppercase tracking-widest">Subtotal (Excl. GST)</td>
                                <td className="py-6 text-right font-black text-lg italic">{formatCurrency(f.finalTotalPriceExclGst)}</td>
                             </tr>
                             <tr className="bg-slate-900 text-white">
                                <td className="py-6 px-8 text-xs font-black uppercase tracking-widest">Total Investment (Incl. GST)</td>
                                <td className="py-6 px-8 text-right font-black text-3xl italic tabular-nums">{formatCurrency(f.totalInclGst)}</td>
                             </tr>
                        </tfoot>
                     </table>
                </div>

                {/* Acceptance Block */}
                <div className="mt-12 space-y-12">
                     <div className="grid grid-cols-2 gap-16">
                        <div className="space-y-4">
                             <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Merchant Signature</p>
                             <div className="h-24 border-b-2 border-slate-200" />
                             <p className="text-[10px] font-bold text-slate-400 uppercase">{quote.createdByName} &bull; {organisation?.name}</p>
                        </div>
                        <div className="space-y-4">
                             <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Client Acceptance</p>
                             <div className="h-24 border-b-2 border-slate-200" />
                             <p className="text-[10px] font-bold text-slate-400 uppercase">{quote.customer.name}</p>
                        </div>
                     </div>

                     <div className="pt-12 border-t flex justify-between items-start opacity-40">
                         <div className="space-y-1">
                            <p className="text-[10px] font-black uppercase text-slate-900">{organisation?.name}</p>
                            <div className="flex items-center gap-4">
                                {organisation?.address && <div className="flex items-center gap-1"><MapPin className="h-2 w-2" /><span className="text-[8px] font-bold">{organisation.address}</span></div>}
                                {organisation?.phoneNumber && <div className="flex items-center gap-1"><Phone className="h-2 w-2" /><span className="text-[8px] font-bold">{organisation.phoneNumber}</span></div>}
                            </div>
                         </div>
                         <div className="text-right italic">
                             <p className="text-[8px] font-bold text-slate-500 max-w-[300px]">This proposal is valid for 30 days from the date of issue. Prices and specifications are subject to change without notice. All rights reserved &copy; {new Date().getFullYear()} HelmLogic.</p>
                         </div>
                     </div>
                </div>
            </div>
        </div>
    );
}

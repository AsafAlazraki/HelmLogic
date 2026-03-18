'use client';

import { Suspense, useMemo, useState, useEffect } from 'react';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { useUser } from '@/firebase/auth/use-user';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase/firestore/use-collection';
import { doc, collection, query, where, updateDoc, serverTimestamp } from 'firebase/firestore';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { HelmLogicLoading } from '@/components/helmlogic-loading';
import {
    ArrowLeft,
    Anchor,
    Ship,
    Zap,
    Wrench,
    DollarSign,
    User,
    Building,
    CheckCircle2,
    Truck,
    Layers,
    Tag,
    Printer,
    Calculator,
    TrendingUp,
    Save,
    Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Input } from '@/components/ui/input';
import { ProposalPrint } from './proposal-print';

interface ProposalViewProps {
    quoteId?: string;
    quoteNumber?: string;
    hideNav?: boolean;
}

export function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-AU', {
        style: 'currency',
        currency: 'AUD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
}

function PricingRow({ label, value, bold, accent }: { label: string; value: number; bold?: boolean; accent?: boolean }) {
    if (value === 0) return null;
    return (
        <div className={cn("flex items-center justify-between py-2.5 px-4 rounded-lg transition-colors", accent ? "bg-primary/5 border border-primary/20" : "hover:bg-slate-50/80")}>
            <span className={cn("text-[10px] uppercase tracking-wider", bold ? "font-black text-slate-900" : "font-bold text-slate-500")}>{label}</span>
            <span className={cn("font-black text-sm tabular-nums", accent ? "text-primary" : bold ? "text-slate-900" : "text-slate-700")}>{formatCurrency(value)}</span>
        </div>
    );
}

export function ProposalView({ quoteId, quoteNumber, hideNav }: ProposalViewProps) {
    const router = useRouter();
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();

    const [isAuditOpen, setIsAuditOpen] = useState(false);
    const [localDiscount, setLocalDiscount] = useState<number>(0);
    const [isSaving, setIsSaving] = useState(false);

    // 1. Data Fetching
    const userQuotesRef = useMemoFirebase(() => user ? collection(firestore, `users/${user.uid}/quotes`) : null, [firestore, user]);
    
    // Find quote by ID or Number
    const quoteQuery = useMemoFirebase(() => {
        if (!user || !userQuotesRef) return null;
        if (quoteId) return doc(firestore, `users/${user.uid}/quotes`, quoteId);
        if (quoteNumber) return query(userQuotesRef, where('quoteNumber', '==', quoteNumber));
        return null;
    }, [userQuotesRef, quoteId, quoteNumber, firestore, user?.uid]);

    const { data: quoteDoc, loading: quoteLoading } = useDoc<any>(quoteId ? (quoteQuery as any) : null);
    const { data: quoteList, loading: quoteListLoading } = useCollection<any>(!quoteId && quoteNumber ? (quoteQuery as any) : null);
    
    const quote = quoteId ? quoteDoc : quoteList?.[0];
    const isLoadingQuote = quoteLoading || quoteListLoading;

    const orgRef = useMemoFirebase(() => quote?.organisationId ? doc(firestore, 'organisations', quote.organisationId) : null, [firestore, quote?.organisationId]);
    const { data: organisation } = useDoc<any>(orgRef);

    // 2. Pricing Strategy Fetch (The core of the financial accuracy)
    const strategyRef = useMemoFirebase(() => {
        if (!quote?.organisationId || !quote?.vendorId) return null;
        return doc(firestore, `organisations/${quote.organisationId}/pricingStrategies/${quote.vendorId}`);
    }, [firestore, quote?.organisationId, quote?.vendorId]);
    const { data: strategy } = useDoc<any>(strategyRef);

    // 3. Exchange Rates (to convert USD costs to AUD exactly like Pricing Manager)
    const ratesQuery = useMemoFirebase(() => 
        quote?.organisationId ? collection(firestore, `organisations/${quote.organisationId}/exchangeRates`) : null,
    [firestore, quote?.organisationId]);
    const { data: exchangeRates } = useCollection<any>(ratesQuery);

    const activeExchangeRate = useMemo(() => {
        if (!exchangeRates || !quote?.vendorCurrency) return 1;
        const rate = exchangeRates.find((r: any) => r.code === quote.vendorCurrency);
        return rate?.rate || 1;
    }, [exchangeRates, quote?.vendorCurrency]);

    // Sync local discount
    useEffect(() => {
        if (quote) {
            setLocalDiscount(quote.discountExclGst || 0);
        }
    }, [quote?.id]); // Only sync when the quote itself changes

    // 4. Financial Calculations logic (Extracted from Pricing Manager)
    const getLandedCost = (itemId: string, baseCostUsd: number) => {
        if (!strategy?.itemValues?.[itemId]) return baseCostUsd / (activeExchangeRate || 1); // Fallback
        
        const vals = strategy.itemValues[itemId];
        const costOverride = vals['base_cost_override'];
        const usdBase = (costOverride !== undefined && costOverride !== '' && costOverride !== null) ? parseFloat(costOverride) : baseCostUsd;
        const discountUsd = parseFloat(vals['factory_discount_usd'] || '0');
        const dutyPercent = parseFloat(vals['exchange_duty_percent'] || '0');
        const gstRate = (organisation?.gstPercentage || 10) / 100;

        const totalUsd = (usdBase || 0) - discountUsd;
        const baseAud = activeExchangeRate > 0 ? totalUsd / activeExchangeRate : totalUsd;
        const withDuty = baseAud * (1 + (dutyPercent / 100));
        
        // Add freight/handling if applicable (Boats only usually)
        const seaFreightSell = parseFloat(vals['op_sea_freight_sell_aud'] || '0'); // Note: Use sell if that's what the logic dictates, or actual cost
        // Actually, Pricing Workspace uses getSellPrice for margins on freight.
        // For audit, we want the DEALER COST.
        
        const seaFreightCost = parseFloat(vals['op_sea_freight_cost_aud'] || '0');
        const roadFreightCost = parseFloat(vals['op_road_freight_cost_aud'] || '0');
        const handlingCost = parseFloat(vals['op_handling_cost_aud'] || '0');
        const preDelCost = parseFloat(vals['op_predel_cost_aud'] || '0');

        return withDuty + seaFreightCost + roadFreightCost + handlingCost + preDelCost;
    };

    // Recalculate everything with REAL strategy data
    const financials = useMemo(() => {
        if (!quote) return null;

        const boatBasePrice = quote.variant?.sellPriceExclGst || 0;
        const optionsTotal = (quote.selectedOptions || []).reduce((a: number, o: any) => a + (o.sellPriceExclGst || 0), 0)
            + (quote.customOptions || []).reduce((a: number, o: any) => a + (o.sellPriceExclGst || 0), 0);
        const regoTotal = (quote.registration?.boatRegoPrice || 0)
            + (quote.registration?.stickerPrice || 0)
            + (quote.registration?.tenderToPrice || 0)
            + (quote.registration?.trailerRegoPrice || 0);
        const motorTotal = (quote.motor?.sellPriceExclGst || 0)
            + (quote.motor?.accessories || []).reduce((a: number, acc: any) => a + (acc.sellPriceExclGst || 0), 0);
        const trailerTotal = (quote.trailer?.sellPriceExclGst || 0)
            + (quote.trailer?.options || []).reduce((a: number, o: any) => a + (o.sellPriceExclGst || 0), 0);
        const dealerFitTotal = (quote.dealerFit || []).reduce((a: number, sel: any) =>
            a + (sel.items || []).reduce((b: number, i: any) => b + (i.sellPriceExclGst || 0), 0), 0);
        
        const subtotalExclGst = boatBasePrice + optionsTotal + regoTotal + motorTotal + trailerTotal + dealerFitTotal;
        const finalTotalPriceExclGst = subtotalExclGst - localDiscount;
        const gstAmount = finalTotalPriceExclGst * 0.1;
        const totalInclGst = finalTotalPriceExclGst + gstAmount;

        // --- REAL COST CALCULATION ---
        const boatCost = getLandedCost(quote.variant?.id, quote.variant?.cost || 0);
        const optionsCost = (quote.selectedOptions || []).reduce((a: number, o: any) => a + getLandedCost(o.id, o.cost || 0), 0)
            + (quote.customOptions || []).reduce((a: number, o: any) => a + (o.cost || (o.sellPriceExclGst * 0.8)), 0); // Custom options still use estimates
        
        // Motors/Trailers might not be in the Highfield strategy if they are third party brands
        const motorCost = (quote.motor?.cost || (quote.motor?.sellPriceExclGst * 0.85)) 
            + (quote.motor?.accessories || []).reduce((a: number, acc: any) => a + (acc.cost || (acc.sellPriceExclGst * 0.7)), 0);
        const trailerCost = (quote.trailer?.cost || (quote.trailer?.sellPriceExclGst * 0.8));
        const dealerFitCost = dealerFitTotal * 0.6; 

        const totalDealCostExclGst = boatCost + optionsCost + motorCost + trailerCost + dealerFitCost + regoTotal; // Rego usually pass-through cost
        const grossProfit = finalTotalPriceExclGst - totalDealCostExclGst;
        const marginPercent = finalTotalPriceExclGst > 0 ? (grossProfit / finalTotalPriceExclGst) * 100 : 0;

        return {
            boatBasePrice, optionsTotal, regoTotal, motorTotal, trailerTotal, dealerFitTotal,
            subtotalExclGst, finalTotalPriceExclGst, gstAmount, totalInclGst,
            boatCost, optionsCost, motorCost, trailerCost, dealerFitCost,
            totalDealCostExclGst, grossProfit, marginPercent
        };
    }, [quote, strategy, activeExchangeRate, localDiscount, organisation]);

    async function handleSaveDiscount(newDiscount: number) {
        if (!user || !quote) return;
        setIsSaving(true);
        try {
            const ref = doc(firestore, `users/${user.uid}/quotes`, quote.id);
            await updateDoc(ref, {
                discountExclGst: newDiscount,
                lastUpdateAt: serverTimestamp()
            });
            toast({ title: "Discount Saved", description: "The proposal has been updated successfully." });
        } catch (error) {
            toast({ title: "Error", description: "Failed to save discount.", variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    }

    if (isLoadingQuote) return <HelmLogicLoading label="Loading Proposal" />;
    if (!quote) return <div className="p-20 text-center">Proposal not found.</div>;
    const f = financials!;

    return (
        <div className="min-h-screen bg-slate-50/50 pb-20">
            {/* PRINT STYLES */}
            <style jsx global>{`
                @media print {
                    .no-print { display: none !important; }
                    .web-view { display: none !important; }
                    body { background: white !important; margin: 0 !important; padding: 0 !important; }
                }
            `}</style>

            <div className="web-view">
                {/* Top Navigation */}
                {!hideNav && (
                    <div className="sticky top-0 z-50 bg-white/95 backdrop-blur-xl border-b shadow-sm no-print">
                        <div className="max-w-6xl mx-auto px-8 h-16 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-6">
                                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl border-2" onClick={() => router.back()}>
                                    <ArrowLeft className="h-4 w-4" />
                                </Button>
                                <div>
                                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-muted-foreground leading-none mb-1">Secured Proposal</p>
                                    <p className="text-sm font-black uppercase tracking-tight leading-none">{quote.quoteNumber}</p>
                                </div>
                                <Badge className={cn("text-[9px] font-black uppercase tracking-widest px-3", quote.status === 'proposal' ? 'bg-primary/10 text-primary border-primary/30' : 'bg-emerald-50 text-emerald-700 border-emerald-200')}>
                                    {quote.status}
                                </Badge>
                            </div>

                            <div className="flex items-center gap-2">
                                 <div className="flex bg-slate-100 p-1 rounded-2xl mr-2">
                                    <Button variant="ghost" size="sm" className="h-9 rounded-xl font-black uppercase text-[9px] gap-2 hover:bg-white hover:shadow-sm" onClick={() => setIsAuditOpen(true)}>
                                        <Calculator className="h-3.5 w-3.5 text-primary" />
                                        Dealer Audit
                                    </Button>
                                 </div>
                                 <Button variant="outline" className="h-9 rounded-xl border-2 font-black uppercase text-[10px] gap-2 hover:bg-primary hover:text-white transition-all" onClick={() => window.print()}>
                                    <Printer className="h-3.5 w-3.5" />
                                    Print PDF
                                 </Button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="max-w-6xl mx-auto px-8 py-12 space-y-12">
                    {/* HERO BLOCK */}
                    <div className="relative rounded-[3rem] overflow-hidden border-2 bg-white shadow-2xl min-h-[460px] flex flex-col transition-all">
                        {quote.coverImageUrl && (
                            <div className="absolute inset-0 z-0">
                                <Image src={quote.coverImageUrl} alt="" fill className="object-cover opacity-20" unoptimized />
                                <div className="absolute inset-0 bg-gradient-to-r from-white via-white/80 to-transparent" />
                            </div>
                        )}

                        <div className="relative z-10 flex-1 grid grid-cols-2 gap-0 overflow-hidden">
                            <div className="p-12 flex flex-col justify-between">
                                <div className="space-y-8">
                                    <div className="flex items-center gap-4">
                                        {organisation?.primaryLogoUrl ? (
                                            <div className="relative h-12 w-32"><Image src={organisation.primaryLogoUrl} alt="" fill className="object-contain object-left" unoptimized /></div>
                                        ) : (
                                            <div className="flex items-center gap-2"><div className="h-10 w-10 bg-primary rounded-xl flex items-center justify-center"><Anchor className="h-5 w-5 text-white" /></div><span className="font-black uppercase text-sm tracking-tight">{organisation?.name}</span></div>
                                        )}
                                    </div>
                                    <div className="space-y-3">
                                        <div className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">{quote.rangeName} Range</div>
                                        <h1 className="text-5xl font-black uppercase tracking-tighter italic text-slate-900 leading-none">{quote.modelName}</h1>
                                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{quote.modelCode}</p>
                                    </div>
                                    {quote.variant && (
                                        <div className="flex items-center gap-3">
                                            {quote.variant.colorCode && <div className="h-6 w-6 rounded-full border-2 border-white shadow-md" style={{ backgroundColor: quote.variant.colorCode }} />}
                                            <div className="px-4 py-2 bg-slate-100 rounded-full"><span className="text-[10px] font-black uppercase tracking-widest text-slate-700">{quote.variant.material} &bull; {quote.variant.colorName}</span></div>
                                        </div>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-6 pt-8 border-t border-slate-100">
                                    <div><p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Quote #</p><p className="font-black text-sm text-slate-900">{quote.quoteNumber}</p></div>
                                    <div><p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Date</p><p className="font-black text-sm text-slate-900">{quote.createdAt?.toDate?.()?.toLocaleDateString() || new Date().toLocaleDateString()}</p></div>
                                    <div><p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Consultant</p><p className="font-black text-sm text-slate-900">{quote.createdByName}</p></div>
                                </div>
                            </div>

                            <div className="relative flex flex-col items-end justify-between p-12 bg-slate-50/30">
                                {(quote.variant?.imageUrl || quote.coverImageUrl) && (
                                    <div className="relative w-full h-56 rounded-2xl overflow-hidden border-2 bg-white shadow-xl">
                                        <Image src={quote.variant?.imageUrl || quote.coverImageUrl} alt="" fill className="object-contain p-4 mix-blend-multiply" unoptimized />
                                    </div>
                                )}
                                <div className="w-full mt-6 bg-slate-900 rounded-2xl p-6 text-white text-right shadow-2xl">
                                    <p className="text-[9px] font-black uppercase tracking-widest opacity-50 mb-1">Total Package Excl. GST</p>
                                    <p className="text-4xl font-black tabular-nums">{formatCurrency(f.finalTotalPriceExclGst)}</p>
                                    <p className="text-[9px] font-black uppercase tracking-widest opacity-40 mt-1">incl. GST: {formatCurrency(f.totalInclGst)}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* CONTENT GRID */}
                    <div className="grid grid-cols-3 gap-8">
                        <div className="col-span-2 space-y-8">
                            {/* Client Card */}
                            <div className="bg-white rounded-[2rem] border-2 shadow-sm overflow-hidden">
                                <div className="px-8 py-5 border-b bg-slate-50/50 flex items-center gap-3">
                                    <User className="h-4 w-4 text-primary" />
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Client Profile</h3>
                                </div>
                                <div className="p-8 grid grid-cols-2 gap-6">
                                    <div><p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Name</p><p className="font-black text-sm text-slate-900">{quote.customer.name}</p></div>
                                    <div><p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Email</p><p className="font-bold text-sm text-slate-700">{quote.customer.email}</p></div>
                                    <div className="col-span-2"><p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Phone</p><p className="font-bold text-sm text-slate-700">{quote.customer.phone || 'Not provided'}</p></div>
                                </div>
                            </div>

                            {/* Configuration Sections */}
                            <div className="space-y-8">
                                {/* Factory Options */}
                                {(quote.selectedOptions?.length > 0 || quote.customOptions?.length > 0) && (
                                    <div className="bg-white rounded-[2rem] border-2 shadow-sm overflow-hidden">
                                         <div className="px-8 py-5 border-b bg-slate-50/50 flex items-center gap-3"><Layers className="h-4 w-4 text-primary" /><h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Selected Factory Options</h3></div>
                                         <div className="divide-y">
                                            {quote.selectedOptions?.map((opt: any) => (
                                                <div key={opt.id} className="flex items-center justify-between px-8 py-4 hover:bg-slate-50/50 transition-colors">
                                                    <div className="flex items-center gap-3"><CheckCircle2 className="h-4 w-4 text-primary opacity-40" /><div><p className="text-sm font-black uppercase tracking-tight text-slate-950">{opt.name}</p><p className="text-[8px] text-slate-400 font-black uppercase tracking-widest">{opt.category}</p></div></div>
                                                    <span className="font-black text-xs text-slate-700">{formatCurrency(opt.sellPriceExclGst || 0)}</span>
                                                </div>
                                            ))}
                                         </div>
                                    </div>
                                )}

                                {/* Motor */}
                                {quote.motor && (
                                    <div className="bg-white rounded-[2rem] border-2 shadow-sm overflow-hidden">
                                        <div className="px-8 py-5 border-b bg-slate-50/50 flex items-center gap-3"><Zap className="h-4 w-4 text-primary" /><h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Power & Systems</h3></div>
                                        <div className="p-8 flex items-center gap-6">
                                            {quote.motor.imageUrl && <div className="h-24 w-24 relative bg-slate-50 rounded-xl border-2 p-2"><Image src={quote.motor.imageUrl} alt="" fill className="object-contain mix-blend-multiply" unoptimized /></div>}
                                            <div className="flex-1 flex items-center justify-between">
                                                <div><p className="font-black text-lg text-slate-950 uppercase italic tracking-tighter">{quote.motor.name}</p><p className="text-[9px] font-black uppercase text-primary tracking-widest">{quote.motor.brand}</p></div>
                                                <span className="font-black text-lg tabular-nums">{formatCurrency(quote.motor.sellPriceExclGst || 0)}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* SIDEBAR */}
                        <div className="space-y-6">
                             <div className="bg-white rounded-[2rem] border-2 shadow-xl overflow-hidden sticky top-20 no-print">
                                <div className="px-6 py-5 border-b bg-slate-900 flex items-center gap-3">
                                    <DollarSign className="h-4 w-4 text-primary" />
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Investment Summary</h3>
                                </div>
                                <div className="p-4 space-y-4">
                                    <PricingRow label="Vessel Base" value={f.boatBasePrice} bold />
                                    <PricingRow label="Options total" value={f.optionsTotal} />
                                    <PricingRow label="Power Pack" value={f.motorTotal} />
                                    <PricingRow label="Trailer Pack" value={f.trailerTotal} />
                                    <PricingRow label="Dealer Fit" value={f.dealerFitTotal} />
                                    <PricingRow label="Registration" value={f.regoTotal} />
                                    
                                    {localDiscount > 0 && (
                                        <div className="mx-2 p-3 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center justify-between">
                                            <span className="text-[10px] font-black uppercase text-emerald-600">Applied Discount</span>
                                            <span className="text-sm font-black text-emerald-600">-{formatCurrency(localDiscount)}</span>
                                        </div>
                                    )}

                                    <div className="border-t pt-4 mt-4 space-y-2">
                                         <div className="flex justify-between px-4"><span className="text-[10px] font-black uppercase text-slate-400">Total Excl. GST</span><span className="font-black text-sm">{formatCurrency(f.finalTotalPriceExclGst)}</span></div>
                                         <div className="flex justify-between px-4"><span className="text-[10px] font-black uppercase text-slate-400">GST (10%)</span><span className="font-black text-sm">{formatCurrency(f.gstAmount)}</span></div>
                                         <div className="bg-primary text-white rounded-[1.5rem] p-5 flex items-center justify-between shadow-xl shadow-primary/20">
                                            <span className="text-[10px] font-black uppercase tracking-widest">Grand Total</span>
                                            <span className="text-2xl font-black italic tabular-nums">{formatCurrency(f.totalInclGst)}</span>
                                         </div>
                                    </div>
                                </div>
                             </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Premium Print Component */}
            <ProposalPrint quote={quote} organisation={organisation} financials={f} />

            {/* AUDIT SHEET */}
            <Sheet open={isAuditOpen} onOpenChange={setIsAuditOpen}>
                <SheetContent className="sm:max-w-xl p-0 flex flex-col h-full bg-slate-50 border-l-4">
                    <div className="px-8 py-8 border-b bg-white relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-5"><Calculator className="h-24 w-24" /></div>
                        <div className="flex items-center gap-2 text-primary font-black uppercase text-[10px] tracking-[0.2em] mb-2"><Calculator className="h-4 w-4" />Strategic Performance Audit</div>
                        <SheetTitle className="text-3xl font-black uppercase italic tracking-tighter leading-none">Yield Analysis</SheetTitle>
                        <SheetDescription className="text-[10px] font-bold uppercase text-slate-400 mt-1 tracking-widest">Verified Financial Accuracy & Realized Margins</SheetDescription>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-8">
                         <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white rounded-[2rem] border-2 p-6 space-y-2 shadow-sm">
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Net Deal Profit</p>
                                <div className="flex items-baseline gap-2">
                                    <p className={cn("text-3xl font-black tracking-tighter", f.grossProfit >= 0 ? "text-emerald-600" : "text-rose-600")}>{formatCurrency(f.grossProfit)}</p>
                                    <Badge className={cn("text-[10px] font-black", f.marginPercent >= 20 ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")}>{f.marginPercent.toFixed(1)}%</Badge>
                                </div>
                                <div className="flex items-center gap-1.5 pt-2 border-t mt-2"><TrendingUp className="h-3 w-3 text-slate-300" /><p className="text-[8px] font-bold uppercase text-slate-400">Benchmark: 20% Net Margin</p></div>
                            </div>
                            <div className="bg-white rounded-[2rem] border-2 p-6 space-y-2 shadow-sm">
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total Landed Cost</p>
                                <p className="text-3xl font-black text-slate-900 tracking-tighter">{formatCurrency(f.totalDealCostExclGst)}</p>
                                <p className="text-[8px] font-black uppercase text-primary">Audit Verified &bull; Strategy Active</p>
                            </div>
                         </div>

                         <div className="bg-white rounded-[2rem] border-2 overflow-hidden shadow-sm border-emerald-100">
                             <div className="px-6 py-4 border-b bg-emerald-50/50 flex items-center justify-between">
                                <div className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-emerald-600" /><span className="text-[10px] font-black uppercase tracking-widest text-emerald-900">Adjustment Engine</span></div>
                                {isSaving && <Loader2 className="h-3 w-3 animate-spin text-emerald-600" />}
                             </div>
                             <div className="p-6 space-y-4">
                                <div className="flex gap-3">
                                    <div className="relative flex-1"><div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</div><Input type="number" value={localDiscount || ''} onChange={(e) => setLocalDiscount(Number(e.target.value))} className="pl-8 h-12 rounded-xl border-2 font-black text-base" placeholder="0.00" /></div>
                                    <Button className="h-12 rounded-xl px-8 bg-slate-900 hover:bg-primary font-black uppercase tracking-widest text-[10px]" onClick={() => handleSaveDiscount(localDiscount)} disabled={isSaving}><Save className="h-4 w-4 mr-2" />Sync Deal</Button>
                                </div>
                                <p className="text-[8px] font-bold text-slate-400 uppercase italic">Updating this value affects the Sell Price (Excl. GST) and recalculates all yields.</p>
                             </div>
                         </div>

                         {/* DETAILED COST AUDIT */}
                         <div className="space-y-4">
                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-2">Line Item Cost Variance</h4>
                            <div className="bg-white rounded-[2.5rem] border-2 divide-y overflow-hidden shadow-xl">
                                {[
                                    { label: 'Vessel & Freight', cost: f.boatCost, sell: f.boatBasePrice },
                                    { label: 'Factory Addons', cost: f.optionsCost, sell: f.optionsTotal },
                                    { label: 'Propulsion Sys', cost: f.motorCost, sell: f.motorTotal },
                                    { label: 'Trailer Package', cost: f.trailerCost, sell: f.trailerTotal },
                                    { label: 'Dealer Fitout', cost: f.dealerFitCost, sell: f.dealerFitTotal },
                                ].map((row, i) => (
                                    <div key={i} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-all">
                                        <p className="text-xs font-black uppercase text-slate-900">{row.label}</p>
                                        <div className="flex gap-8 text-right">
                                            <div><p className="text-[7px] font-black text-rose-400 uppercase">Cost (Landed)</p><p className="text-[11px] font-black text-rose-600">{formatCurrency(row.cost)}</p></div>
                                            <div><p className="text-[7px] font-black text-emerald-400 uppercase">Realized Sell</p><p className="text-[11px] font-black text-slate-900">{formatCurrency(row.sell)}</p></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                         </div>
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    );
}

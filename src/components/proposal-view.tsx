'use client';

import { useMemo, useState, useEffect } from 'react';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { useUser } from '@/firebase/auth/use-user';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase/firestore/use-collection';
import { doc, collection, collectionGroup, query, where, getDocs, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { HelmLogicLoading } from '@/components/helmlogic-loading';
import {
    ArrowLeft,
    Anchor,
    Zap,
    DollarSign,
    User,
    CheckCircle2,
    Layers,
    Printer,
    Calculator,
    TrendingUp,
    Save,
    Loader2,
    Truck,
    ClipboardList,
    ListChecks,
    Copy,
    Ruler,
    FileText,
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

function formatOptionDisplayLabel(name: string): { base: string; color: string | null } {
    const normalized = name.replace(/\s*&\s*/g, ' & ').replace(/\s+/g, ' ').trim();
    const parenMatch = normalized.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    if (!parenMatch) return { base: normalized, color: null };
    const base = parenMatch[1].trim();
    const firstColor = parenMatch[2].split('/')[0].trim();
    const color = firstColor
        ? firstColor.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
        : null;
    return { base, color };
}

export function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-AU', {
        style: 'currency',
        currency: 'AUD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
}

function SectionCard({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) {
    return (
        <div className="bg-white rounded-3xl border-2 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b bg-slate-50/50 flex items-center gap-2.5">
                <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
                <h3 className="text-[9px] font-black uppercase tracking-[0.35em] text-slate-500">{label}</h3>
            </div>
            {children}
        </div>
    );
}

function MetaItem({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-0.5">{label}</p>
            <p className="font-black text-sm text-slate-900 leading-tight">{value}</p>
        </div>
    );
}

function PricingRow({ label, value, bold, accent, showIfZero }: { label: string; value: number; bold?: boolean; accent?: boolean; showIfZero?: boolean }) {
    if (value === 0 && !showIfZero) return null;
    return (
        <div className={cn(
            "flex items-center justify-between py-2.5 px-3 rounded-xl transition-colors",
            accent ? "bg-primary/5 border border-primary/20" : "hover:bg-slate-50/80"
        )}>
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
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

    // User profile for org-wide lookup
    const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
    const { data: userProfile } = useDoc<any>(userProfileRef);

    const userQuotesRef = useMemoFirebase(() => user ? collection(firestore, `users/${user.uid}/quotes`) : null, [firestore, user]);

    // Primary: own quotes path (works for all existing quotes where current user is owner)
    const ownQuoteRef = useMemoFirebase(() =>
        (user && quoteId) ? doc(firestore, `users/${user.uid}/quotes`, quoteId) : null,
    [firestore, user?.uid, quoteId]);
    const { data: ownQuote, loading: ownQuoteLoading } = useDoc<any>(ownQuoteRef);

    // Org-wide fallback: when own-quote lookup fails, search all org members' quotes
    const [orgFallbackQuote, setOrgFallbackQuote] = useState<any>(null);
    const [orgFallbackLoading, setOrgFallbackLoading] = useState(false);

    useEffect(() => {
        if (ownQuote || ownQuoteLoading || !quoteId || !user || !userProfile?.organisationId) return;

        const searchOrgQuotes = async () => {
            setOrgFallbackLoading(true);
            try {
                // Find all users in the same org
                const usersSnap = await getDocs(query(
                    collection(firestore, 'users'),
                    where('organisationId', '==', userProfile.organisationId)
                ));

                // Try to find the quote under each user
                for (const userDoc of usersSnap.docs) {
                    if (userDoc.id === user.uid) continue; // Already checked own quotes
                    try {
                        const quoteRef = doc(firestore, `users/${userDoc.id}/quotes`, quoteId);
                        const quoteSnap = await getDoc(quoteRef);
                        if (quoteSnap.exists()) {
                            setOrgFallbackQuote({ id: quoteSnap.id, ...quoteSnap.data() });
                            break;
                        }
                    } catch {
                        // Permission denied for this user's quotes — skip
                    }
                }
            } catch (error) {
                console.error('Org quote search failed:', error);
            } finally {
                setOrgFallbackLoading(false);
            }
        };

        searchOrgQuotes();
    }, [ownQuote, ownQuoteLoading, quoteId, user, userProfile?.organisationId, firestore]);

    const quote = ownQuote || orgFallbackQuote;
    const isLoadingQuote = !quote && (ownQuoteLoading || orgFallbackLoading);

    const orgRef = useMemoFirebase(() => quote?.organisationId ? doc(firestore, 'organisations', quote.organisationId) : null, [firestore, quote?.organisationId]);
    const { data: organisation } = useDoc<any>(orgRef);

    const strategyRef = useMemoFirebase(() => {
        if (!quote?.organisationId || !quote?.vendorId) return null;
        return doc(firestore, `organisations/${quote.organisationId}/pricingStrategies/${quote.vendorId}`);
    }, [firestore, quote?.organisationId, quote?.vendorId]);
    const { data: strategy } = useDoc<any>(strategyRef);

    const ratesQuery = useMemoFirebase(() =>
        quote?.organisationId ? collection(firestore, `organisations/${quote.organisationId}/exchangeRates`) : null,
        [firestore, quote?.organisationId]);
    const { data: exchangeRates } = useCollection<any>(ratesQuery);

    const activeExchangeRate = useMemo(() => {
        if (!exchangeRates || !quote?.vendorCurrency) return 1;
        const rate = exchangeRates.find((r: any) => r.code === quote.vendorCurrency);
        return rate?.rate || 1;
    }, [exchangeRates, quote?.vendorCurrency]);

    useEffect(() => {
        if (quote) setLocalDiscount(quote.discountExclGst || 0);
    }, [quote?.id]);

    const getLandedCost = (itemId: string, baseCostUsd: number) => {
        if (!strategy?.itemValues?.[itemId]) return baseCostUsd / (activeExchangeRate || 1);
        const vals = strategy.itemValues[itemId];
        const costOverride = vals['base_cost_override'];
        const usdBase = (costOverride !== undefined && costOverride !== '' && costOverride !== null) ? parseFloat(costOverride) : baseCostUsd;
        const discountUsd = parseFloat(vals['factory_discount_usd'] || '0');
        const dutyPercent = parseFloat(vals['exchange_duty_percent'] || '0');
        const totalUsd = (usdBase || 0) - discountUsd;
        const baseAud = activeExchangeRate > 0 ? totalUsd / activeExchangeRate : totalUsd;
        const withDuty = baseAud * (1 + (dutyPercent / 100));
        const seaFreightCost = parseFloat(vals['op_sea_freight_cost_aud'] || '0');
        const roadFreightCost = parseFloat(vals['op_road_freight_cost_aud'] || '0');
        const handlingCost = parseFloat(vals['op_handling_cost_aud'] || '0');
        const preDelCost = parseFloat(vals['op_predel_cost_aud'] || '0');
        return withDuty + seaFreightCost + roadFreightCost + handlingCost + preDelCost;
    };

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
        const boatCost = getLandedCost(quote.variant?.id, quote.variant?.cost || 0);
        const optionsCost = (quote.selectedOptions || []).reduce((a: number, o: any) => a + getLandedCost(o.id, o.cost || 0), 0)
            + (quote.customOptions || []).reduce((a: number, o: any) => a + (o.cost || (o.sellPriceExclGst * 0.8)), 0);
        const motorCost = (quote.motor?.cost || (quote.motor?.sellPriceExclGst * 0.85))
            + (quote.motor?.accessories || []).reduce((a: number, acc: any) => a + (acc.cost || (acc.sellPriceExclGst * 0.7)), 0);
        const trailerCost = (quote.trailer?.cost || (quote.trailer?.sellPriceExclGst * 0.8));
        const dealerFitCost = dealerFitTotal * 0.6;
        const totalDealCostExclGst = boatCost + optionsCost + motorCost + trailerCost + dealerFitCost + regoTotal;
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
            const ownerUid = quote.createdByUid || user.uid;
            const ref = doc(firestore, `users/${ownerUid}/quotes`, quote.id);
            await updateDoc(ref, { discountExclGst: newDiscount, lastUpdateAt: serverTimestamp() });
            toast({ title: "Discount Saved", description: "The proposal has been updated successfully." });
        } catch {
            toast({ title: "Error", description: "Failed to save discount.", variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    }

    const handleDownloadPdf = async () => {
        if (!quote || !financials) return;
        setIsGeneratingPdf(true);
        try {
            // v1.8 (story 1.5.0) — single-source PDF render pipeline.
            // Was 80+ lines of duplicated content-block resolve + image
            // preload + URL swap + @react-pdf render; now one call.
            // Same client-side flow, no behaviour change.
            const { renderQuotePdf } = await import('@/lib/render-quote-pdf');
            const { blob } = await renderQuotePdf({
                firestore,
                quote,
                organisation,
                financials,
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Quote-${quote.quoteNumber}-${quote.modelName ?? 'Proposal'}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('PDF generation failed:', err);
            toast({ title: 'PDF generation failed', description: 'Please try again.', variant: 'destructive' });
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    if (isLoadingQuote) return <HelmLogicLoading label="Loading Proposal" />;
    if (!quote) return <div className="p-20 text-center font-black uppercase text-slate-300">Proposal not found.</div>;
    const f = financials!;

    return (
        <div className="min-h-screen bg-slate-50/50 pb-20">
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
                    <div className="sticky top-0 z-50 bg-white/95 backdrop-blur-xl border-b shadow-sm no-print w-full px-6 sm:px-10 h-16 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl border-2 shrink-0" onClick={() => router.back()}>
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                            <div className="w-px h-6 bg-slate-200 shrink-0" />
                            <div className="min-w-0">
                                <p className="text-[8px] font-black uppercase tracking-[0.3em] text-muted-foreground leading-none mb-0.5">Proposal</p>
                                <p className="text-sm font-black uppercase tracking-tight leading-none truncate">{quote.quoteNumber}</p>
                            </div>
                            <Badge className={cn(
                                "text-[8px] font-black uppercase tracking-widest px-2.5 shrink-0 hidden sm:inline-flex",
                                quote.status === 'proposal' ? 'bg-primary/10 text-primary border-primary/30' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            )}>
                                {quote.status}
                            </Badge>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-9 px-4 rounded-xl font-black uppercase text-[9px] tracking-widest gap-1.5 hover:bg-slate-100"
                                onClick={() => setIsAuditOpen(true)}
                            >
                                <Calculator className="h-3.5 w-3.5 text-primary" />
                                <span className="hidden sm:inline">Audit</span>
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-9 px-4 rounded-xl font-black uppercase text-[9px] tracking-widest gap-1.5 hover:bg-slate-100"
                                onClick={() => router.push(
                                    `/modules/${quote.moduleSlug}/quote/${quote.modelId}` +
                                    `?range=${quote.rangeId}&vendor=${quote.vendorId}&duplicate=${quote.id}`
                                )}
                            >
                                <Copy className="h-3.5 w-3.5 text-primary" />
                                <span className="hidden sm:inline">Duplicate</span>
                            </Button>
                            <Button
                                size="sm"
                                className="h-9 px-5 rounded-xl font-black uppercase text-[9px] tracking-widest gap-1.5"
                                onClick={handleDownloadPdf}
                                disabled={isGeneratingPdf}
                            >
                                {isGeneratingPdf
                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    : <Printer className="h-3.5 w-3.5" />
                                }
                                <span className="hidden sm:inline">{isGeneratingPdf ? 'Generating…' : 'Download PDF'}</span>
                            </Button>
                        </div>
                    </div>
                )}

                <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8 md:py-12 space-y-6 md:space-y-8">
                    {/* HERO */}
                    <div className="relative rounded-[2rem] md:rounded-[3rem] overflow-hidden border-2 bg-white shadow-xl">
                        {quote.coverImageUrl && (
                            <div className="absolute inset-0 z-0">
                                <Image src={quote.coverImageUrl} alt="" fill className="object-cover opacity-15" />
                                <div className="absolute inset-0 bg-gradient-to-r from-white via-white/70 to-white/10" />
                            </div>
                        )}
                        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2">
                            {/* Left: Identity */}
                            <div className="p-8 md:p-12 flex flex-col justify-between gap-8">
                                <div className="space-y-6">
                                    {/* Logo */}
                                    {organisation?.primaryLogoUrl ? (
                                        <div className="relative h-10 w-32">
                                            <Image src={organisation.primaryLogoUrl} alt="" fill className="object-contain object-left" />
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <div className="h-9 w-9 bg-primary rounded-xl flex items-center justify-center">
                                                <Anchor className="h-4 w-4 text-white" />
                                            </div>
                                            <span className="font-black uppercase text-sm tracking-tight">{organisation?.name}</span>
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        <div className="text-[9px] font-black uppercase tracking-[0.4em] text-primary">{quote.rangeName} Range</div>
                                        <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter italic text-slate-900 leading-none">{quote.modelName}</h1>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{quote.modelCode}</p>
                                    </div>

                                    {quote.variant && (
                                        <div className="flex items-center gap-2.5">
                                            {quote.variant.colorCode && (
                                                <div className="h-5 w-5 rounded-full border-2 border-white shadow" style={{ backgroundColor: quote.variant.colorCode }} />
                                            )}
                                            <div className="px-3 py-1.5 bg-slate-100 rounded-full">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">
                                                    {quote.variant.name && quote.variant.name !== 'Standard'
                                                        ? quote.variant.name
                                                        : `${quote.variant.material} \u2022 ${quote.variant.colorName}`}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-wrap gap-x-6 gap-y-3 pt-6 border-t border-slate-100">
                                    <MetaItem label="Quote #" value={quote.quoteNumber} />
                                    <MetaItem label="Date" value={quote.createdAt?.toDate?.()?.toLocaleDateString() || new Date().toLocaleDateString()} />
                                    <MetaItem label="Consultant" value={quote.createdByName || '—'} />
                                </div>
                            </div>

                            {/* Right: Image + Price */}
                            <div className="flex flex-col items-stretch justify-between p-6 md:p-10 bg-slate-50/40 border-t-2 lg:border-t-0 lg:border-l-2 border-slate-100 gap-4">
                                {(quote.variant?.imageUrl || quote.coverImageUrl) && (
                                    <div className="relative w-full h-48 md:h-56 rounded-2xl overflow-hidden border-2 bg-white shadow-lg">
                                        <Image src={quote.variant?.imageUrl || quote.coverImageUrl} alt="" fill className="object-contain p-4 mix-blend-multiply" />
                                    </div>
                                )}
                                <div className="bg-slate-900 rounded-2xl p-5 md:p-6 text-white text-right shadow-xl">
                                    <p className="text-[8px] font-black uppercase tracking-widest opacity-50 mb-1">Total Package Excl. GST</p>
                                    <p className="text-3xl md:text-4xl font-black tabular-nums">{formatCurrency(f.finalTotalPriceExclGst)}</p>
                                    <p className="text-[8px] font-black uppercase tracking-widest opacity-40 mt-1">incl. GST {formatCurrency(f.totalInclGst)}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* CONTENT GRID — sidebar drops below on mobile */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
                        {/* Main column */}
                        <div className="lg:col-span-2 space-y-6">
                            {/* Client */}
                            <SectionCard icon={User} label="Client Profile">
                                <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <MetaItem label="Name" value={quote.customer.name} />
                                    <MetaItem label="Email" value={quote.customer.email || '—'} />
                                    {quote.customer.phone && <MetaItem label="Phone" value={quote.customer.phone} />}
                                    {quote.customer.company && <MetaItem label="Company" value={quote.customer.company} />}
                                </div>
                            </SectionCard>

                            {/* Technical Specifications — leads with substance */}
                            {quote.specifications?.otherSpecs?.length > 0 && (
                                <SectionCard icon={Ruler} label="Technical Specifications">
                                    <div className="divide-y">
                                        {quote.specifications.otherSpecs.map((spec: any, i: number) => (
                                            <div key={i} className={cn("flex items-center justify-between px-6 py-3", i % 2 === 0 ? "" : "bg-slate-50/40")}>
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{spec.label}</span>
                                                <span className="font-black text-sm text-slate-900">{spec.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </SectionCard>
                            )}

                            {/* Standard Features */}
                            {quote.standardFeatures?.length > 0 && (
                                <SectionCard icon={ListChecks} label="Standard Features">
                                    <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {quote.standardFeatures.map((feat: string, i: number) => (
                                            <div key={i} className="flex items-start gap-2.5">
                                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                                                <span className="text-[11px] font-bold text-slate-600 leading-tight">{feat}</span>
                                            </div>
                                        ))}
                                    </div>
                                </SectionCard>
                            )}

                            {/* Factory Options — grouped by category */}
                            {(quote.selectedOptions?.length > 0 || quote.customOptions?.length > 0) && (() => {
                                const allOptions = [
                                    ...(quote.selectedOptions || []).filter((o: any) => !o.isStandard),
                                    ...(quote.customOptions || []),
                                ];
                                const groups = allOptions.reduce((acc: Record<string, any[]>, opt: any) => {
                                    const cat = opt.category || 'General Options';
                                    if (!acc[cat]) acc[cat] = [];
                                    acc[cat].push(opt);
                                    return acc;
                                }, {});
                                const groupEntries = Object.entries(groups);
                                if (groupEntries.length === 0) return null;
                                return (
                                    <SectionCard icon={Layers} label="Factory Options">
                                        <div>
                                            {groupEntries.map(([cat, opts], gi) => (
                                                <div key={cat}>
                                                    <div className={cn("px-6 py-2.5 bg-slate-50/70 flex items-center gap-2", gi > 0 ? "border-t" : "")}>
                                                        <span className="text-[9px] font-black uppercase tracking-[0.3em] text-primary">{cat}</span>
                                                        <span className="text-[8px] font-black text-slate-400">{opts.length}</span>
                                                    </div>
                                                    {opts.map((opt: any, i: number) => (
                                                        <div key={opt.id || i} className="flex items-center justify-between px-6 py-3.5 border-t border-slate-50 hover:bg-slate-50/40 transition-colors">
                                                            <div className="flex items-center gap-3 min-w-0">
                                                                {opt.imageUrl
                                                                    ? <div className="h-9 w-9 relative bg-white rounded-lg border shrink-0 overflow-hidden"><Image src={opt.imageUrl} alt="" fill className="object-contain p-1 mix-blend-multiply" /></div>
                                                                    : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                                                }
                                                                {(() => { const { base, color } = formatOptionDisplayLabel(opt.name); return <p className="text-sm font-black uppercase tracking-tight text-slate-900 truncate">{base}{color && <span className="text-primary ml-1">({color})</span>}</p>; })()}
                                                            </div>
                                                            <span className="font-black text-xs text-slate-700 tabular-nums shrink-0 pl-4">
                                                                {opt.sellPriceExclGst ? formatCurrency(opt.sellPriceExclGst) : <span className="text-slate-300">Incl.</span>}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    </SectionCard>
                                );
                            })()}

                            {/* Motor */}
                            {quote.motor && (
                                <SectionCard icon={Zap} label="Power & Propulsion">
                                    <div className="p-6 space-y-4">
                                        {/* Motor header */}
                                        <div className="flex items-center gap-5">
                                            {quote.motor.imageUrl && (
                                                <div className="h-20 w-20 relative bg-slate-50 rounded-2xl border-2 p-2 shrink-0">
                                                    <Image src={quote.motor.imageUrl} alt="" fill className="object-contain mix-blend-multiply" />
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                {quote.motor.brandLogoUrl && (
                                                    <div className="relative h-5 w-20 mb-1.5">
                                                        <Image src={quote.motor.brandLogoUrl} alt={quote.motor.brand || ''} fill className="object-contain object-left" />
                                                    </div>
                                                )}
                                                <p className="font-black text-lg text-slate-950 uppercase italic tracking-tighter leading-tight">{quote.motor.name}</p>
                                                <p className="text-[9px] font-black uppercase text-primary tracking-widest mt-0.5">{quote.motor.brand}</p>
                                                {quote.motor.model && quote.motor.model !== quote.motor.name && (
                                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">{quote.motor.model}</p>
                                                )}
                                            </div>
                                            <span className="font-black text-lg tabular-nums shrink-0">{formatCurrency(quote.motor.sellPriceExclGst || 0)}</span>
                                        </div>

                                        {/* Motor Specifications */}
                                        {(() => {
                                            const specs = [
                                                { label: 'HP Rating', value: quote.motor.hpRating || quote.motor['HP Rating'] },
                                                { label: 'Shaft Length', value: quote.motor.shaftLength || quote.motor['Shaft Length'] },
                                                { label: 'Control', value: quote.motor.control || quote.motor['Control'] },
                                                { label: 'Starting', value: quote.motor.starting || quote.motor['Starting'] },
                                                { label: 'Tilt & Trim', value: quote.motor.tiltTrim || quote.motor['Tilt & Trim'] },
                                                { label: 'Fuel Tank', value: quote.motor.fuelTank || quote.motor['Fuel Tank'] },
                                                { label: 'Propeller', value: quote.motor.prop || quote.motor['Prop'] },
                                                { label: 'Warranty', value: quote.motor.warranty || quote.motor['Warranty'] },
                                            ].filter(s => s.value);
                                            if (specs.length === 0) return null;
                                            return (
                                                <div className="pt-3 border-t">
                                                    <p className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-400 mb-2">Motor Specifications</p>
                                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                                        {specs.map((spec, i) => (
                                                            <div key={i} className="px-3 py-2.5 bg-slate-50 rounded-xl">
                                                                <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-0.5">{spec.label}</p>
                                                                <p className="text-[11px] font-black text-slate-900 leading-tight">{spec.value}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        {/* Accessories — grouped by category */}
                                        {(() => {
                                            const accessories = quote.motor.accessories || [];
                                            if (accessories.length === 0) return null;
                                            const groups = accessories.reduce((acc: Record<string, any[]>, a: any) => {
                                                const cat = a.category || 'Accessories';
                                                if (!acc[cat]) acc[cat] = [];
                                                acc[cat].push(a);
                                                return acc;
                                            }, {});
                                            const accessoriesTotal = accessories.reduce((a: number, acc: any) => a + (acc.sellPriceExclGst || 0), 0);
                                            return (
                                                <div className="pt-3 border-t space-y-3">
                                                    {Object.entries(groups).map(([cat, items]) => (
                                                        <div key={cat}>
                                                            <p className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-400 mb-1.5">{cat}</p>
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                                {(items as any[]).map((acc: any, i: number) => (
                                                                    <div key={i} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-xl">
                                                                        <span className="text-[10px] font-black uppercase tracking-wide text-slate-700">{acc.name}</span>
                                                                        <span className="text-[10px] font-black text-slate-500 tabular-nums">
                                                                            {acc.sellPriceExclGst ? formatCurrency(acc.sellPriceExclGst) : <span className="text-slate-300">Incl.</span>}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        })()}

                                        {/* Motor Subtotal */}
                                        {f.motorTotal > 0 && (
                                            <div className="pt-3 border-t flex items-center justify-between px-1">
                                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Motor Total</span>
                                                <span className="font-black text-sm tabular-nums text-slate-900">{formatCurrency(f.motorTotal)}</span>
                                            </div>
                                        )}
                                    </div>
                                </SectionCard>
                            )}

                            {/* Trailer */}
                            {quote.trailer && (
                                <SectionCard icon={Truck} label="Trailer Package">
                                    <div className="p-6 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="font-black text-sm text-slate-950 uppercase italic tracking-tighter">{quote.trailer.name}</p>
                                                {quote.trailer.description && <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">{quote.trailer.description}</p>}
                                            </div>
                                            <span className="font-black text-sm tabular-nums">{formatCurrency(quote.trailer.sellPriceExclGst || 0)}</span>
                                        </div>
                                        {quote.trailer.options?.length > 0 && (
                                            <div className="pt-3 border-t space-y-1.5">
                                                <p className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-400 mb-2">Trailer Options</p>
                                                {quote.trailer.options.map((opt: any, i: number) => (
                                                    <div key={i} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-xl">
                                                        <span className="text-[10px] font-black uppercase tracking-wide text-slate-600">{opt.name}</span>
                                                        <span className="text-[10px] font-black text-slate-700 tabular-nums">{formatCurrency(opt.sellPriceExclGst || 0)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </SectionCard>
                            )}

                            {/* Dealer Fit */}
                            {quote.dealerFit?.length > 0 && (
                                <SectionCard icon={ClipboardList} label="Dealer Accessories & Preparation">
                                    <div className="divide-y">
                                        {quote.dealerFit.map((group: any, gi: number) => (
                                            group.items?.map((item: any, ii: number) => (
                                                <div key={`${gi}-${ii}`} className="flex items-center justify-between px-6 py-3 hover:bg-slate-50/50 transition-colors">
                                                    <p className="text-sm font-bold text-slate-700 uppercase tracking-tight">{item.name}</p>
                                                    <span className="font-black text-xs tabular-nums text-slate-700">{formatCurrency(item.sellPriceExclGst || 0)}</span>
                                                </div>
                                            ))
                                        ))}
                                    </div>
                                </SectionCard>
                            )}

                            {/* Registration */}
                            {quote.registration && (
                                quote.registration.boatRego || quote.registration.sticker || quote.registration.tenderTo || quote.registration.trailerRego
                            ) && (
                                <SectionCard icon={FileText} label="Registration & Compliance">
                                    <div className="divide-y">
                                        {quote.registration.boatRego && (
                                            <div className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50/40 transition-colors">
                                                <div>
                                                    <p className="text-sm font-black uppercase tracking-tight text-slate-900">Boat Registration</p>
                                                    <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">12 Month Registration</p>
                                                </div>
                                                <span className="font-black text-sm tabular-nums">{formatCurrency(quote.registration.boatRegoPrice || 0)}</span>
                                            </div>
                                        )}
                                        {quote.registration.sticker && (
                                            <div className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50/40 transition-colors">
                                                <div>
                                                    <p className="text-sm font-black uppercase tracking-tight text-slate-900">Boat Sticker</p>
                                                    <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">Registration Sticker</p>
                                                </div>
                                                <span className="font-black text-sm tabular-nums">{formatCurrency(quote.registration.stickerPrice || 0)}</span>
                                            </div>
                                        )}
                                        {quote.registration.tenderTo && (
                                            <div className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50/40 transition-colors">
                                                <div>
                                                    <p className="text-sm font-black uppercase tracking-tight text-slate-900">Tender-To Sticker</p>
                                                    <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">Vessel Tender Registration</p>
                                                </div>
                                                <span className="font-black text-sm tabular-nums">{formatCurrency(quote.registration.tenderToPrice || 0)}</span>
                                            </div>
                                        )}
                                        {quote.registration.trailerRego && (
                                            <div className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50/40 transition-colors">
                                                <div>
                                                    <p className="text-sm font-black uppercase tracking-tight text-slate-900">Trailer Registration</p>
                                                    <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">12 Month Registration</p>
                                                </div>
                                                <span className="font-black text-sm tabular-nums">{formatCurrency(quote.registration.trailerRegoPrice || 0)}</span>
                                            </div>
                                        )}
                                    </div>
                                </SectionCard>
                            )}
                        </div>

                        {/* Sidebar — Investment Summary */}
                        <div className="lg:col-span-1">
                            <div className="bg-white rounded-3xl border-2 shadow-xl overflow-hidden lg:sticky lg:top-20 no-print">
                                <div className="px-6 py-5 border-b bg-slate-900 flex items-center gap-3">
                                    <DollarSign className="h-4 w-4 text-primary" />
                                    <h3 className="text-[9px] font-black uppercase tracking-[0.35em] text-white">Investment Summary</h3>
                                </div>
                                <div className="p-4 space-y-1">
                                    <PricingRow label="Vessel Base" value={f.boatBasePrice} bold showIfZero />
                                    <PricingRow label="Options" value={f.optionsTotal} />
                                    <PricingRow label="Power Pack" value={f.motorTotal} showIfZero />
                                    <PricingRow label="Trailer" value={f.trailerTotal} />
                                    <PricingRow label="Dealer Fit" value={f.dealerFitTotal} />
                                    <PricingRow label="Registration" value={f.regoTotal} />

                                    {localDiscount > 0 && (
                                        <div className="mx-1 p-3 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center justify-between">
                                            <span className="text-[9px] font-black uppercase text-emerald-600">Discount Applied</span>
                                            <span className="text-sm font-black text-emerald-600">-{formatCurrency(localDiscount)}</span>
                                        </div>
                                    )}

                                    <div className="pt-3 mt-2 border-t space-y-2">
                                        <div className="flex justify-between px-3">
                                            <span className="text-[9px] font-black uppercase text-slate-400">Excl. GST</span>
                                            <span className="font-black text-sm tabular-nums">{formatCurrency(f.finalTotalPriceExclGst)}</span>
                                        </div>
                                        <div className="flex justify-between px-3">
                                            <span className="text-[9px] font-black uppercase text-slate-400">GST (10%)</span>
                                            <span className="font-black text-sm tabular-nums">{formatCurrency(f.gstAmount)}</span>
                                        </div>
                                        <div className="bg-primary text-white rounded-2xl p-5 flex items-center justify-between shadow-lg shadow-primary/20 mt-2">
                                            <span className="text-[9px] font-black uppercase tracking-widest">Grand Total</span>
                                            <span className="text-2xl font-black italic tabular-nums">{formatCurrency(f.totalInclGst)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Print Component */}
            <ProposalPrint quote={quote} organisation={organisation} financials={f} />

            {/* Audit Sheet */}
            <Sheet open={isAuditOpen} onOpenChange={setIsAuditOpen}>
                <SheetContent className="sm:max-w-lg p-0 flex flex-col h-full bg-slate-50 border-l-4">
                    <SheetHeader className="px-8 py-7 border-b bg-white relative overflow-hidden shrink-0">
                        <div className="absolute top-0 right-0 p-4 opacity-5"><Calculator className="h-24 w-24" /></div>
                        <div className="flex items-center gap-2 text-primary font-black uppercase text-[9px] tracking-[0.2em] mb-2">
                            <Calculator className="h-3.5 w-3.5" />Strategic Performance Audit
                        </div>
                        <SheetTitle className="text-2xl font-black uppercase italic tracking-tighter leading-none">Yield Analysis</SheetTitle>
                        <SheetDescription className="text-[9px] font-bold uppercase text-slate-400 mt-1 tracking-widest">
                            Verified Financial Accuracy & Realized Margins
                        </SheetDescription>
                    </SheetHeader>

                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        {/* KPI Cards */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white rounded-2xl border-2 p-5 space-y-1.5 shadow-sm">
                                <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Net Profit</p>
                                <p className={cn("text-2xl font-black tracking-tighter", f.grossProfit >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                    {formatCurrency(f.grossProfit)}
                                </p>
                                <Badge className={cn("text-[9px] font-black", f.marginPercent >= 20 ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")}>
                                    {f.marginPercent.toFixed(1)}% margin
                                </Badge>
                            </div>
                            <div className="bg-white rounded-2xl border-2 p-5 space-y-1.5 shadow-sm">
                                <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Landed Cost</p>
                                <p className="text-2xl font-black text-slate-900 tracking-tighter">{formatCurrency(f.totalDealCostExclGst)}</p>
                                <div className="flex items-center gap-1"><TrendingUp className="h-2.5 w-2.5 text-slate-300" /><p className="text-[7px] font-bold uppercase text-slate-400">Target ≥20% margin</p></div>
                            </div>
                        </div>

                        {/* Discount Engine */}
                        <div className="bg-white rounded-2xl border-2 overflow-hidden shadow-sm border-emerald-100">
                            <div className="px-5 py-4 border-b bg-emerald-50/50 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
                                    <span className="text-[9px] font-black uppercase tracking-widest text-emerald-900">Discount Adjustment</span>
                                </div>
                                {isSaving && <Loader2 className="h-3 w-3 animate-spin text-emerald-600" />}
                            </div>
                            <div className="p-5 space-y-3">
                                <div className="flex gap-3">
                                    <div className="relative flex-1">
                                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">$</div>
                                        <Input
                                            type="number"
                                            value={localDiscount || ''}
                                            onChange={(e) => setLocalDiscount(Number(e.target.value))}
                                            className="pl-8 h-11 rounded-xl border-2 font-black text-sm"
                                            placeholder="0"
                                        />
                                    </div>
                                    <Button
                                        className="h-11 rounded-xl px-5 bg-slate-900 hover:bg-primary font-black uppercase tracking-widest text-[9px]"
                                        onClick={() => handleSaveDiscount(localDiscount)}
                                        disabled={isSaving}
                                    >
                                        <Save className="h-3.5 w-3.5 mr-1.5" />Sync
                                    </Button>
                                </div>
                                <p className="text-[8px] font-bold text-slate-400 uppercase italic">Adjusts sell price and recalculates all margins.</p>
                            </div>
                        </div>

                        {/* Line Item Variance */}
                        <div className="space-y-3">
                            <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">Line Item Cost vs. Sell</h4>
                            <div className="bg-white rounded-2xl border-2 divide-y overflow-hidden shadow-sm">
                                {[
                                    { label: 'Vessel & Freight', cost: f.boatCost, sell: f.boatBasePrice },
                                    { label: 'Factory Addons', cost: f.optionsCost, sell: f.optionsTotal },
                                    { label: 'Propulsion', cost: f.motorCost, sell: f.motorTotal },
                                    { label: 'Trailer', cost: f.trailerCost, sell: f.trailerTotal },
                                    { label: 'Dealer Fitout', cost: f.dealerFitCost, sell: f.dealerFitTotal },
                                ].filter(r => r.sell > 0).map((row, i) => (
                                    <div key={i} className="px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition-all">
                                        <p className="text-xs font-black uppercase text-slate-700">{row.label}</p>
                                        <div className="flex gap-6 text-right">
                                            <div>
                                                <p className="text-[7px] font-black text-rose-400 uppercase">Cost</p>
                                                <p className="text-xs font-black text-rose-600 tabular-nums">{formatCurrency(row.cost)}</p>
                                            </div>
                                            <div>
                                                <p className="text-[7px] font-black text-emerald-400 uppercase">Sell</p>
                                                <p className="text-xs font-black text-slate-900 tabular-nums">{formatCurrency(row.sell)}</p>
                                            </div>
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

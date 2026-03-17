'use client';

import { useParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { useUser } from '@/firebase/auth/use-user';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase/firestore/use-collection';
import { doc, collection, query, where } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { HelmLogicLoading } from '@/components/helmlogic-loading';
import {
    ArrowLeft,
    Anchor,
    Ship,
    Zap,
    Wrench,
    Box,
    DollarSign,
    User,
    Mail,
    Phone,
    Building,
    MapPin,
    Calendar,
    Hash,
    CheckCircle2,
    Truck,
    Package,
    FileText,
    ExternalLink,
    Layers,
    Tag,
    Printer,
    Calculator,
    Percent,
    TrendingUp,
    Save,
    Plus,
    Minus,
    Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import { Input } from '@/components/ui/input';
import { updateDoc } from 'firebase/firestore';

function formatCurrency(amount: number, currency?: string) {
    return new Intl.NumberFormat('en-AU', {
        style: 'currency',
        currency: 'AUD', // Forced to AUD per user request for consistency
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
}

function ProposalSection({ title, icon: Icon, children, className }: { title: string; icon: any; children: React.ReactNode; className?: string }) {
    return (
        <div className={cn("space-y-4", className)}>
            <div className="flex items-center gap-3">
                <div className="h-8 w-8 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Icon className="h-4 w-4 text-primary" />
                </div>
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">{title}</h3>
            </div>
            {children}
        </div>
    );
}

function PricingRow({ label, value, currency, bold, accent }: { label: string; value: number; currency?: string; bold?: boolean; accent?: boolean }) {
    if (value === 0) return null;
    return (
        <div className={cn("flex items-center justify-between py-2.5 px-4 rounded-lg transition-colors", accent ? "bg-primary/5 border border-primary/20" : "hover:bg-slate-50/80")}>
            <span className={cn("text-[10px] uppercase tracking-wider", bold ? "font-black text-slate-900" : "font-bold text-slate-500")}>{label}</span>
            <span className={cn("font-black text-sm tabular-nums", accent ? "text-primary" : bold ? "text-slate-900" : "text-slate-700")}>{formatCurrency(value, currency)}</span>
        </div>
    );
}

function ProposalContent() {
    const params = useParams();
    const router = useRouter();
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();

    const [isAuditOpen, setIsAuditOpen] = useState(false);
    const [localDiscount, setLocalDiscount] = useState<number>(0);
    const [isSaving, setIsSaving] = useState(false);

    const quoteId = params?.quoteId as string;
    const slugOrId = params?.id as string;

    const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
    const { data: userProfile, loading: profileLoading } = useDoc<any>(userProfileRef);

    const quoteRef = useMemoFirebase(() =>
        user && quoteId ? doc(firestore, `users/${user.uid}/quotes`, quoteId) : null,
    [firestore, user, quoteId]);
    const { data: quote, loading: quoteLoading } = useDoc<any>(quoteRef);

    const orgRef = useMemoFirebase(() =>
        quote?.organisationId ? doc(firestore, 'organisations', quote.organisationId) : null,
    [firestore, quote?.organisationId]);
    const { data: organisation, loading: orgLoading } = useDoc<any>(orgRef);

    const moduleQueryBySlug = useMemoFirebase(() =>
        slugOrId ? query(collection(firestore, 'modules'), where('slug', '==', slugOrId)) : null,
    [firestore, slugOrId]);
    const { data: modulesBySlug } = useCollection<any>(moduleQueryBySlug);
    const moduleByIdRef = useMemoFirebase(() => slugOrId ? doc(firestore, 'modules', slugOrId) : null, [firestore, slugOrId]);
    const { data: moduleById } = useDoc<any>(moduleByIdRef);
    const moduleData = useMemo(() => modulesBySlug?.[0] || moduleById, [modulesBySlug, moduleById]);

    const isLoading = profileLoading || quoteLoading || orgLoading;

    // Use a useEffect to sync localDiscount with quote data when it loads
    useMemo(() => {
        if (quote && localDiscount === 0) {
            setLocalDiscount(quote.discountExclGst || 0);
        }
    }, [quote]);

    async function handleSaveDiscount(newDiscount: number) {
        if (!user || !quoteId) return;
        setIsSaving(true);
        try {
            const ref = doc(firestore, `users/${user.uid}/quotes`, quoteId);
            await updateDoc(ref, {
                discountExclGst: newDiscount,
                // Also update the cached totalPriceExclGst if necessary, 
                // but usually better to compute it on the fly from components
            });
            toast({
                title: "Discount Saved",
                description: "The proposal has been updated successfully.",
            });
        } catch (error) {
            console.error("Error saving discount:", error);
            toast({
                title: "Error",
                description: "Failed to save discount.",
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
        }
    }

    if (isLoading) return <HelmLogicLoading label="Loading Proposal" />;

    if (!quote) {
        return (
            <div className="flex h-screen w-full items-center justify-center flex-col gap-4 bg-background">
                <Ship className="h-12 w-12 text-muted-foreground/20" />
                <p className="font-black uppercase tracking-widest text-muted-foreground">Proposal not found</p>
                <Button variant="outline" onClick={() => router.back()} className="border-2 font-black uppercase text-[10px] rounded-xl">Go Back</Button>
            </div>
        );
    }

    const currency = quote.vendorCurrency || 'AUD';
    const createdAt = quote.createdAt?.toDate?.() || new Date();

    // Compute sub-totals for the pricing breakdown
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
    
    // Subtotal before discount
    const subtotalExclGst = boatBasePrice + optionsTotal + regoTotal + motorTotal + trailerTotal + dealerFitTotal;
    // Final total after discount
    const finalTotalPriceExclGst = subtotalExclGst - localDiscount;
    
    const gstAmount = finalTotalPriceExclGst * 0.1;
    const totalInclGst = finalTotalPriceExclGst + gstAmount;

    // Compute Costs for Audit (Mocking data where missing)
    const boatCost = quote.variant?.cost || (boatBasePrice * 0.75);
    const optionsCost = (quote.selectedOptions || []).reduce((a: number, o: any) => a + (o.cost || (o.sellPriceExclGst * 0.8)), 0);
    const motorCost = (quote.motor?.cost || (quote.motor?.sellPriceExclGst * 0.85)) 
        + (quote.motor?.accessories || []).reduce((a: number, acc: any) => a + (acc.cost || (acc.sellPriceExclGst * 0.7)), 0);
    const trailerCost = (quote.trailer?.cost || (quote.trailer?.sellPriceExclGst * 0.8));
    const dealerFitCost = dealerFitTotal * 0.6; // High margin on dealer fit usually

    const totalDealCostExclGst = boatCost + optionsCost + motorCost + trailerCost + dealerFitCost;
    const grossProfit = finalTotalPriceExclGst - totalDealCostExclGst;
    const marginPercent = finalTotalPriceExclGst > 0 ? (grossProfit / finalTotalPriceExclGst) * 100 : 0;

    return (
        <div className="min-h-screen bg-slate-50/50">
            <style jsx global>{`
                @media print {
                    .no-print { display: none !important; }
                    body { background: white !important; }
                    .max-w-6xl { max-width: 100% !important; width: 100% !important; padding: 0 !important; }
                    .py-12 { padding-top: 0 !important; padding-bottom: 0 !important; }
                    .rounded-[3rem], .rounded-[2rem], .rounded-2xl { border-radius: 0.5rem !important; }
                    .shadow-2xl, .shadow-sm, .shadow-xl { shadow: none !important; box-shadow: none !important; }
                    .border-2 { border-width: 1px !important; }
                    .sticky { position: relative !important; }
                    .min-h-screen { min-height: auto !important; }
                    .bg-slate-50/50 { background: white !important; }
                    .col-span-2 { width: 100% !important; grid-column: span 3 / span 3 !important; }
                    .grid-cols-3 { display: block !important; }
                    .space-y-12 > * + * { margin-top: 2rem !important; }
                    .space-y-8 > * + * { margin-top: 1.5rem !important; }
                    .pricing-sidebar { position: relative !important; top: 0 !important; margin-top: 2rem !important; page-break-inside: avoid; }
                    .hero-card { page-break-after: always; }
                }
            `}</style>
            {/* Top Nav */}
            <div className="sticky top-0 z-50 bg-white/95 backdrop-blur-xl border-b shadow-sm no-print">
                <div className="max-w-6xl mx-auto px-8 h-16 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-3">
                            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl border-2" onClick={() => router.push(`/modules/${slugOrId}`)}>
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                            <div>
                                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-muted-foreground">Proposal</p>
                                <p className="text-sm font-black uppercase tracking-tight leading-none">{quote.quoteNumber}</p>
                            </div>
                        </div>

                        <Badge className={cn("text-[9px] font-black uppercase tracking-widest", quote.status === 'proposal' ? 'bg-primary/10 text-primary border border-primary/30' : 'bg-emerald-50 text-emerald-700 border border-emerald-200')}>
                            {quote.status}
                        </Badge>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex bg-slate-100 p-1 rounded-2xl mr-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-9 rounded-xl font-black uppercase text-[9px] gap-2 hover:bg-white hover:shadow-sm"
                                onClick={() => setIsAuditOpen(true)}
                            >
                                <Calculator className="h-3.5 w-3.5 text-primary" />
                                <span className="hidden sm:inline">Dealer Audit</span>
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-9 rounded-xl font-black uppercase text-[9px] gap-2 hover:bg-white hover:shadow-sm"
                                onClick={() => setIsAuditOpen(true)} // Opens audit focused on discount
                            >
                                <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
                                <span className="hidden sm:inline">Discount</span>
                            </Button>
                        </div>

                        <Button
                            variant="outline"
                            className="h-9 rounded-xl border-2 font-black uppercase text-[10px] gap-2 hover:bg-primary hover:text-white hover:border-primary transition-all shadow-sm"
                            onClick={() => window.print()}
                        >
                            <Printer className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Print PDF</span>
                        </Button>
                    </div>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-8 py-12 space-y-12">

                {/* ─── HERO SECTION ─── */}
                <div className="relative rounded-[3rem] overflow-hidden border-2 bg-white shadow-2xl min-h-[460px] flex flex-col">
                    {/* Background image */}
                    {quote.coverImageUrl && (
                        <div className="absolute inset-0 z-0">
                            <Image src={quote.coverImageUrl} alt={quote.modelName} fill className="object-cover opacity-20" unoptimized />
                            <div className="absolute inset-0 bg-gradient-to-r from-white via-white/90 to-transparent" />
                        </div>
                    )}

                    <div className="relative z-10 flex-1 grid grid-cols-2 gap-0">
                        {/* Left: Deal info */}
                        <div className="p-12 flex flex-col justify-between">
                            <div className="space-y-8">
                                {/* Org branding */}
                                <div className="flex items-center gap-4">
                                    {organisation?.primaryLogoUrl ? (
                                        <div className="relative h-12 w-32">
                                            <Image src={organisation.primaryLogoUrl} alt={organisation.name} fill className="object-contain object-left" unoptimized />
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <div className="h-10 w-10 bg-primary rounded-xl flex items-center justify-center">
                                                <Anchor className="h-5 w-5 text-white" />
                                            </div>
                                            <span className="font-black uppercase text-sm tracking-tight">{organisation?.name || 'HelmLogic'}</span>
                                        </div>
                                    )}
                                    {quote.vendorLogoUrl && (
                                        <>
                                            <div className="h-8 w-px bg-slate-200" />
                                            <div className="relative h-10 w-24">
                                                <Image src={quote.vendorLogoUrl} alt={quote.vendorName} fill className="object-contain object-left" unoptimized />
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Main title */}
                                <div className="space-y-3">
                                    <div className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">{quote.rangeName} Range</div>
                                    <h1 className="text-5xl font-black uppercase tracking-tighter italic text-slate-900 leading-none">{quote.modelName}</h1>
                                    {quote.modelCode && (
                                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{quote.modelCode}</p>
                                    )}
                                </div>

                                {/* Variant pill */}
                                {quote.variant && (
                                    <div className="flex items-center gap-3">
                                        {quote.variant.colorCode && (
                                            <div className="h-6 w-6 rounded-full border-2 border-white shadow-md" style={{ backgroundColor: quote.variant.colorCode }} />
                                        )}
                                        <div className="px-4 py-2 bg-slate-100 rounded-full">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">
                                                {quote.variant.material} &bull; {quote.variant.colorName}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Quote meta */}
                            <div className="flex flex-wrap gap-6 pt-8 border-t border-slate-100">
                                <div>
                                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Quote #</p>
                                    <p className="font-black text-sm tracking-tight text-slate-900">{quote.quoteNumber}</p>
                                </div>
                                <div>
                                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Date</p>
                                    <p className="font-black text-sm tracking-tight text-slate-900">{createdAt.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                                </div>
                                <div>
                                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Consultant</p>
                                    <p className="font-black text-sm tracking-tight text-slate-900">{quote.createdByName}</p>
                                </div>
                            </div>
                        </div>

                        {/* Right: Boat image + price */}
                        <div className="relative flex flex-col items-end justify-between p-12">
                            {/* Variant image or cover */}
                            {(quote.variant?.imageUrl || quote.coverImageUrl) && (
                                <div className="relative w-full h-56 rounded-2xl overflow-hidden border-2 shadow-xl">
                                    <Image
                                        src={quote.variant?.imageUrl || quote.coverImageUrl}
                                        alt={quote.modelName}
                                        fill
                                        className="object-contain p-4 mix-blend-multiply"
                                        unoptimized
                                    />
                                </div>
                            )}

                            {/* Price Hero */}
                            <div className="w-full mt-6 bg-slate-900 rounded-2xl p-6 text-white text-right">
                                <p className="text-[9px] font-black uppercase tracking-widest opacity-50 mb-1">Total Package Excl. GST</p>
                                <p className="text-4xl font-black tabular-nums">{formatCurrency(finalTotalPriceExclGst, currency)}</p>
                                <p className="text-[9px] font-black uppercase tracking-widest opacity-40 mt-1">
                                    incl. GST: {formatCurrency(totalInclGst, currency)}
                                </p>
                                {localDiscount > 0 && (
                                    <div className="mt-2 pt-2 border-t border-white/10">
                                        <p className="text-[8px] font-black uppercase tracking-widest text-emerald-400">Includes {formatCurrency(localDiscount, currency)} Discount</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ─── TWO-COLUMN BODY ─── */}
                <div className="grid grid-cols-3 gap-8">

                    {/* LEFT COLUMN: Customer + Config */}
                    <div className="col-span-2 space-y-8">

                        {/* Customer Details */}
                        {quote.customer?.name && (
                            <div className="bg-white rounded-[2rem] border-2 shadow-sm overflow-hidden">
                                <div className="px-8 py-5 border-b bg-slate-50/50 flex items-center gap-3">
                                    <User className="h-4 w-4 text-primary" />
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Client Details</h3>
                                </div>
                                <div className="p-8 grid grid-cols-2 gap-6">
                                    <div>
                                        <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Name</p>
                                        <p className="font-black text-sm text-slate-900">{quote.customer.name}</p>
                                    </div>
                                    {quote.customer.company && (
                                        <div>
                                            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Company</p>
                                            <p className="font-black text-sm text-slate-900">{quote.customer.company}</p>
                                        </div>
                                    )}
                                    {quote.customer.email && (
                                        <div>
                                            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Email</p>
                                            <p className="font-bold text-sm text-slate-700">{quote.customer.email}</p>
                                        </div>
                                    )}
                                    {quote.customer.phone && (
                                        <div>
                                            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Phone</p>
                                            <p className="font-bold text-sm text-slate-700">{quote.customer.phone}</p>
                                        </div>
                                    )}
                                    {quote.customer.address && (
                                        <div className="col-span-2">
                                            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Address</p>
                                            <p className="font-bold text-sm text-slate-700">{quote.customer.address}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Boat Configuration */}
                        <div className="bg-white rounded-[2rem] border-2 shadow-sm overflow-hidden">
                            <div className="px-8 py-5 border-b bg-slate-50/50 flex items-center gap-3">
                                <Ship className="h-4 w-4 text-primary" />
                                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Vessel Configuration</h3>
                            </div>
                            <div className="p-8 space-y-6">
                                {/* Specifications */}
                                {quote.specifications && (
                                    <div className="space-y-3">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Specifications</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            {quote.specifications.maxPersons && (
                                                <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl">
                                                    <span className="text-[9px] font-black uppercase tracking-wide text-slate-500">Max Persons</span>
                                                    <span className="ml-auto font-black text-[10px]">{quote.specifications.maxPersons}</span>
                                                </div>
                                            )}
                                            {quote.specifications.maxHp && (
                                                <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl">
                                                    <span className="text-[9px] font-black uppercase tracking-wide text-slate-500">Max HP</span>
                                                    <span className="ml-auto font-black text-[10px]">{quote.specifications.maxHp}</span>
                                                </div>
                                            )}
                                            {quote.specifications.otherSpecs?.slice(0, 6).map((s: any, i: number) => (
                                                <div key={i} className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl">
                                                    <span className="text-[9px] font-black uppercase tracking-wide text-slate-500 truncate">{s.label}</span>
                                                    <span className="ml-auto font-black text-[10px] text-right shrink-0">{s.value}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Standard Features */}
                                {quote.standardFeatures?.length > 0 && (
                                    <div className="space-y-3">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Standard Features</p>
                                        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                                            {quote.standardFeatures.map((f: string, i: number) => (
                                                <div key={i} className="flex items-center gap-2">
                                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                                    <span className="text-[9px] font-bold text-slate-700 uppercase tracking-wide">{f}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Factory Options */}
                        {(quote.selectedOptions?.length > 0 || quote.customOptions?.length > 0) && (
                            <div className="bg-white rounded-[2rem] border-2 shadow-sm overflow-hidden">
                                <div className="px-8 py-5 border-b bg-slate-50/50 flex items-center gap-3">
                                    <Layers className="h-4 w-4 text-primary" />
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Factory Options</h3>
                                </div>
                                <div className="divide-y">
                                    {quote.selectedOptions?.map((opt: any) => (
                                        <div key={opt.id} className="flex items-center justify-between px-8 py-3 hover:bg-slate-50/80 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                                                <div>
                                                    <p className="text-[10px] font-black uppercase tracking-tight text-slate-900">{opt.name}</p>
                                                    {opt.category && <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">{opt.category}</p>}
                                                </div>
                                            </div>
                                            <span className="font-black text-[11px] text-slate-700 shrink-0">{formatCurrency(opt.sellPriceExclGst || 0, currency)}</span>
                                        </div>
                                    ))}
                                    {quote.customOptions?.map((opt: any) => (
                                        <div key={opt.id} className="flex items-center justify-between px-8 py-3 hover:bg-slate-50/80 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <Tag className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                                <div>
                                                    <p className="text-[10px] font-black uppercase tracking-tight text-slate-900">{opt.name}</p>
                                                    {opt.description && <p className="text-[8px] text-slate-400 font-bold">{opt.description}</p>}
                                                </div>
                                            </div>
                                            <span className="font-black text-[11px] text-slate-700 shrink-0">{formatCurrency(opt.sellPriceExclGst || 0, currency)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Motor */}
                        {quote.motor && (
                            <div className="bg-white rounded-[2rem] border-2 shadow-sm overflow-hidden">
                                <div className="px-8 py-5 border-b bg-slate-50/50 flex items-center gap-3">
                                    <Zap className="h-4 w-4 text-primary" />
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Propulsion</h3>
                                </div>
                                <div className="p-8 flex items-start gap-6">
                                    {quote.motor.imageUrl && (
                                        <div className="relative h-28 w-28 rounded-xl overflow-hidden border-2 bg-slate-50 shrink-0">
                                            <Image src={quote.motor.imageUrl} alt={quote.motor.name} fill className="object-contain p-2 mix-blend-multiply" unoptimized />
                                        </div>
                                    )}
                                    <div className="flex-1 space-y-3">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <p className="font-black text-base uppercase tracking-tight text-slate-900">{quote.motor.name}</p>
                                                {quote.motor.brand && <p className="text-[9px] font-black uppercase tracking-widest text-primary">{quote.motor.brand}</p>}
                                            </div>
                                            <span className="font-black text-sm text-slate-700">{formatCurrency(quote.motor.sellPriceExclGst || 0, currency)}</span>
                                        </div>
                                        {quote.motor.accessories?.length > 0 && (
                                            <div className="space-y-1.5 border-t pt-3">
                                                <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Accessories</p>
                                                {quote.motor.accessories.map((acc: any, i: number) => (
                                                    <div key={i} className="flex items-center justify-between">
                                                        <span className="text-[9px] font-bold text-slate-600 uppercase tracking-wide">{acc.name}</span>
                                                        <span className="text-[9px] font-black text-slate-700">{formatCurrency(acc.sellPriceExclGst || 0, currency)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Trailer */}
                        {quote.trailer && (
                            <div className="bg-white rounded-[2rem] border-2 shadow-sm overflow-hidden">
                                <div className="px-8 py-5 border-b bg-slate-50/50 flex items-center gap-3">
                                    <Truck className="h-4 w-4 text-primary" />
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Trailer Package</h3>
                                </div>
                                <div className="p-8 space-y-4">
                                    {quote.trailer.imageUrl && (
                                        <div className="relative h-32 w-full rounded-xl overflow-hidden border-2 bg-slate-50">
                                            <Image src={quote.trailer.imageUrl} alt={quote.trailer.name} fill className="object-contain p-4 mix-blend-multiply" unoptimized />
                                        </div>
                                    )}
                                    <div className="flex items-center justify-between">
                                        <p className="font-black text-sm uppercase tracking-tight">{quote.trailer.name}</p>
                                        <span className="font-black text-sm">{formatCurrency(quote.trailer.sellPriceExclGst || 0, currency)}</span>
                                    </div>
                                    {quote.trailer.options?.length > 0 && (
                                        <div className="space-y-1 border-t pt-3">
                                            {quote.trailer.options.map((o: any, i: number) => (
                                                <div key={i} className="flex items-center justify-between">
                                                    <span className="text-[9px] font-bold text-slate-600 uppercase tracking-wide">{o.name}</span>
                                                    <span className="text-[9px] font-black">{formatCurrency(o.sellPriceExclGst || 0, currency)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Dealer Fit */}
                        {quote.dealerFit?.length > 0 && (
                            <div className="bg-white rounded-[2rem] border-2 shadow-sm overflow-hidden">
                                <div className="px-8 py-5 border-b bg-slate-50/50 flex items-center gap-3">
                                    <Wrench className="h-4 w-4 text-primary" />
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Dealer Fit</h3>
                                </div>
                                <div className="divide-y">
                                    {quote.dealerFit.map((sel: any, i: number) => (
                                        <div key={i} className="px-8 py-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-black uppercase tracking-tight">{sel.name}</span>
                                                    {sel.category && <Badge variant="outline" className="text-[7px] font-black h-4 px-1.5">{sel.category}</Badge>}
                                                </div>
                                                <span className="text-[10px] font-black">{formatCurrency((sel.items || []).reduce((a: number, i: any) => a + (i.sellPriceExclGst || 0), 0), currency)}</span>
                                            </div>
                                            {sel.items?.length > 0 && (
                                                <div className="space-y-0.5 pl-4">
                                                    {sel.items.map((item: any, j: number) => (
                                                        <p key={j} className="text-[8px] text-slate-400 font-bold uppercase tracking-wide">&middot; {item.name}</p>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* RIGHT COLUMN: Pricing Breakdown + Org Info */}
                    <div className="space-y-6">

                        <div className="bg-white rounded-[2rem] border-2 shadow-sm overflow-hidden sticky top-20 pricing-sidebar">
                            <div className="px-6 py-5 border-b bg-slate-900 flex items-center gap-3">
                                <DollarSign className="h-4 w-4 text-white/60" />
                                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/80">Full Pricing Breakdown</h3>
                            </div>
                            <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
                                <div className="p-4 space-y-4">
                                    {/* Detailed Sections */}
                                    <div className="space-y-1">
                                        <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 px-4 mb-2">Vessel</p>
                                        <PricingRow label={quote.variant?.name || "Boat Base"} value={boatBasePrice} currency={currency} />
                                    </div>

                                    {(quote.selectedOptions?.length > 0 || quote.customOptions?.length > 0) && (
                                        <div className="space-y-1">
                                            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 px-4 mb-2">Factory Options</p>
                                            {quote.selectedOptions?.map((opt: any) => (
                                                <PricingRow key={opt.id} label={opt.name} value={opt.sellPriceExclGst || 0} currency={currency} />
                                            ))}
                                            {quote.customOptions?.map((opt: any) => (
                                                <PricingRow key={opt.id} label={opt.name} value={opt.sellPriceExclGst || 0} currency={currency} />
                                            ))}
                                        </div>
                                    )}

                                    {quote.motor && (
                                        <div className="space-y-1">
                                            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 px-4 mb-2">Propulsion</p>
                                            <PricingRow label={quote.motor.name} value={quote.motor.sellPriceExclGst || 0} currency={currency} />
                                            {quote.motor.accessories?.map((acc: any, i: number) => (
                                                <PricingRow key={i} label={acc.name} value={acc.sellPriceExclGst || 0} currency={currency} />
                                            ))}
                                        </div>
                                    )}

                                    {quote.trailer && (
                                        <div className="space-y-1">
                                            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 px-4 mb-2">Trailer</p>
                                            <PricingRow label={quote.trailer.name} value={quote.trailer.sellPriceExclGst || 0} currency={currency} />
                                            {quote.trailer.options?.map((opt: any, i: number) => (
                                                <PricingRow key={i} label={opt.name} value={opt.sellPriceExclGst || 0} currency={currency} />
                                            ))}
                                        </div>
                                    )}

                                    {quote.dealerFit?.length > 0 && (
                                        <div className="space-y-1">
                                            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 px-4 mb-2">Dealer Fit</p>
                                            {quote.dealerFit.flatMap((sel: any) => sel.items || []).map((item: any, i: number) => (
                                                <PricingRow key={i} label={item.name} value={item.sellPriceExclGst || 0} currency={currency} />
                                            ))}
                                        </div>
                                    )}

                                    {regoTotal > 0 && (
                                        <div className="space-y-1">
                                            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 px-4 mb-2">Registration</p>
                                            <PricingRow label="Total Registration Fees" value={regoTotal} currency={currency} />
                                        </div>
                                    )}

                                    {localDiscount > 0 && (
                                        <div className="space-y-1">
                                            <p className="text-[8px] font-black uppercase tracking-widest text-rose-400 px-4 mb-2">Discounts</p>
                                            <div className="flex items-center justify-between py-2.5 px-4 rounded-lg bg-rose-50 border border-rose-100">
                                                <span className="text-[10px] uppercase font-black tracking-wider text-rose-600">Package Discount</span>
                                                <span className="font-black text-sm tabular-nums text-rose-600">-{formatCurrency(localDiscount, currency)}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="border-t p-4 space-y-1.5 bg-slate-50/80">
                                <div className="flex items-center justify-between px-4 py-2">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Subtotal (Excl. GST)</span>
                                    <span className="font-black text-sm tabular-nums">{formatCurrency(finalTotalPriceExclGst, currency)}</span>
                                </div>
                                <div className="flex items-center justify-between px-4 py-2">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">GST (10%)</span>
                                    <span className="font-black text-sm tabular-nums">{formatCurrency(gstAmount, currency)}</span>
                                </div>
                                <div className="flex items-center justify-between bg-primary text-white rounded-xl px-4 py-4 mt-2 shadow-lg shadow-primary/20">
                                    <span className="text-[10px] font-black uppercase tracking-wider">Total Incl. GST</span>
                                    <span className="font-black text-xl tabular-nums">{formatCurrency(totalInclGst, currency)}</span>
                                </div>
                            </div>

                            {/* Registration breakdown */}
                            {(quote.registration?.boatRego || quote.registration?.trailerRego) && (
                                <div className="border-t p-4 space-y-2">
                                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 px-4">Registration Inclusions</p>
                                    {quote.registration.boatRego && (
                                        <div className="flex items-center gap-2 px-4">
                                            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                            <span className="text-[9px] font-bold text-slate-600">Boat Registration (12 months)</span>
                                        </div>
                                    )}
                                    {quote.registration.sticker && (
                                        <div className="flex items-center gap-2 px-4">
                                            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                            <span className="text-[9px] font-bold text-slate-600">Registration Sticker</span>
                                        </div>
                                    )}
                                    {quote.registration.tenderTo && (
                                        <div className="flex items-center gap-2 px-4">
                                            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                            <span className="text-[9px] font-bold text-slate-600">Tender To Sticker</span>
                                        </div>
                                    )}
                                    {quote.registration.trailerRego && (
                                        <div className="flex items-center gap-2 px-4">
                                            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                            <span className="text-[9px] font-bold text-slate-600">Trailer Registration (12 months)</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Dealer Info */}
                        {organisation && (
                            <div className="bg-white rounded-[2rem] border-2 shadow-sm overflow-hidden">
                                <div className="px-6 py-5 border-b bg-slate-50/50 flex items-center gap-3">
                                    <Building className="h-4 w-4 text-primary" />
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Dealer</h3>
                                </div>
                                <div className="p-6 space-y-4">
                                    {organisation.primaryLogoUrl && (
                                        <div className="relative h-12 w-full">
                                            <Image src={organisation.primaryLogoUrl} alt={organisation.name} fill className="object-contain object-left" unoptimized />
                                        </div>
                                    )}
                                    <div>
                                        <p className="font-black text-sm uppercase tracking-tight">{organisation.name}</p>
                                        {organisation.phoneNumber && <p className="text-[9px] font-bold text-slate-500 mt-1">{organisation.phoneNumber}</p>}
                                        {organisation.address && <p className="text-[9px] font-bold text-slate-500 mt-0.5">{organisation.address}</p>}
                                    </div>
                                    <div className="pt-2 border-t">
                                        <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Prepared by</p>
                                        <p className="text-[10px] font-black text-slate-700">{quote.createdByName}</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ─── FOOTER ─── */}
                <div className="bg-slate-900 rounded-[2rem] p-8 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-white/10 rounded-xl flex items-center justify-center">
                            <Anchor className="h-5 w-5 text-white/70" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-white/60">HelmLogic Platform</p>
                            <p className="text-[9px] font-bold text-white/30">Precision marine dealership technology</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-[9px] font-bold text-white/30">Quote #{quote.quoteNumber}</p>
                        <p className="text-[9px] font-bold text-white/30">All prices exclude GST unless stated</p>
                    </div>
                </div>

            </div>

            {/* ─── DEALER AUDIT SHEET ─── */}
            <Sheet open={isAuditOpen} onOpenChange={setIsAuditOpen}>
                <SheetContent className="sm:max-w-xl p-0 flex flex-col h-full bg-slate-50">
                    <div className="px-8 py-6 border-b bg-white">
                        <SheetHeader className="space-y-1 text-left">
                            <div className="flex items-center gap-2 text-primary font-black uppercase text-[10px] tracking-[0.2em] mb-1">
                                <Calculator className="h-4 w-4" />
                                Dealer Audit
                            </div>
                            <SheetTitle className="text-2xl font-black uppercase italic tracking-tight">Financial Performance</SheetTitle>
                            <SheetDescription className="text-[11px] font-bold uppercase text-slate-400">Profitability Audit & Margin Control</SheetDescription>
                        </SheetHeader>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
                        <div className="space-y-8">
                            {/* KPI Grid */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white rounded-[2rem] border-2 p-6 space-y-1 shadow-sm">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total Margin</p>
                                    <div className="flex items-baseline gap-2">
                                        <p className={cn("text-3xl font-black tracking-tighter", grossProfit >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                            {formatCurrency(grossProfit, currency)}
                                        </p>
                                        <Badge variant="outline" className={cn("text-[10px] font-black h-5 border-2", marginPercent >= 20 ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-amber-50 text-amber-600 border-amber-200")}>
                                            {marginPercent.toFixed(1)}%
                                        </Badge>
                                    </div>
                                    <div className="flex items-center gap-1.5 pt-2">
                                        <TrendingUp className="h-3.5 w-3.5 text-slate-300" />
                                        <p className="text-[9px] font-bold uppercase text-slate-300">Target Margin: 20%</p>
                                    </div>
                                </div>
                                <div className="bg-white rounded-[2rem] border-2 p-6 space-y-1 shadow-sm">
                                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Sell Price (Excl GST)</p>
                                    <p className="text-3xl font-black text-slate-900 tracking-tighter">{formatCurrency(finalTotalPriceExclGst, currency)}</p>
                                    <p className="text-[9px] font-bold uppercase text-slate-400 pt-2">Original: {formatCurrency(subtotalExclGst, currency)}</p>
                                </div>
                            </div>

                            {/* Applied Discount Section */}
                            <div className="bg-white rounded-[2rem] border-2 overflow-hidden shadow-sm">
                                <div className="px-6 py-4 border-b bg-rose-50/50 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <DollarSign className="h-3.5 w-3.5 text-rose-500" />
                                        <span className="text-[10px] font-black uppercase tracking-widest text-rose-900">Apply Discount</span>
                                    </div>
                                    {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin text-rose-500" />}
                                </div>
                                <div className="p-6 space-y-4">
                                    <div className="flex gap-3">
                                        <div className="relative flex-1">
                                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</div>
                                            <Input
                                                type="number"
                                                value={localDiscount || ''}
                                                onChange={(e) => setLocalDiscount(Number(e.target.value))}
                                                className="pl-8 h-12 rounded-xl border-2 font-black text-base italic"
                                                placeholder="0.00"
                                            />
                                        </div>
                                        <Button 
                                            className="h-12 rounded-xl px-6 bg-rose-600 hover:bg-rose-700 font-black uppercase tracking-widest text-[10px] gap-2 shadow-lg shadow-rose-200"
                                            onClick={() => handleSaveDiscount(localDiscount)}
                                            disabled={isSaving}
                                        >
                                            <Save className="h-4 w-4" />
                                            Update
                                        </Button>
                                    </div>
                                    <p className="text-[8px] font-bold text-slate-400 uppercase italic">Disclaimer: All discounts are applied to the Sell Price EXCLUDING GST.</p>
                                </div>
                            </div>

                            {/* Cost Breakdown */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 px-2">
                                    <span>Core Component Audit</span>
                                    <span>Cost vs Sell</span>
                                </div>
                                <div className="bg-white rounded-[2rem] border-2 divide-y shadow-sm overflow-hidden">
                                    <div className="p-5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                        <div className="space-y-0.5">
                                            <p className="text-[11px] font-black uppercase text-slate-900">Vessel & Variant</p>
                                            <p className="text-[9px] font-bold text-slate-400 truncate max-w-[200px]">{quote.variant?.name}</p>
                                        </div>
                                        <div className="flex items-center gap-8 text-right">
                                            <div>
                                                <p className="text-[8px] font-black text-rose-400 uppercase tracking-tighter">Cost</p>
                                                <p className="text-[11px] font-black text-rose-600">{formatCurrency(boatCost, currency)}</p>
                                            </div>
                                            <div>
                                                <p className="text-[8px] font-black text-emerald-400 uppercase tracking-tighter">Sell</p>
                                                <p className="text-[11px] font-black text-slate-900">{formatCurrency(boatBasePrice, currency)}</p>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="p-5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                        <div className="space-y-0.5">
                                            <p className="text-[11px] font-black uppercase text-slate-900">Factory Options</p>
                                            <p className="text-[9px] font-bold text-slate-400">{(quote.selectedOptions?.length || 0) + (quote.customOptions?.length || 0)} Items Selected</p>
                                        </div>
                                        <div className="flex items-center gap-8 text-right">
                                            <div>
                                                <p className="text-[8px] font-black text-rose-400 uppercase tracking-tighter">Cost</p>
                                                <p className="text-[11px] font-black text-rose-600">{formatCurrency(optionsCost, currency)}</p>
                                            </div>
                                            <div>
                                                <p className="text-[8px] font-black text-emerald-400 uppercase tracking-tighter">Sell</p>
                                                <p className="text-[11px] font-black text-slate-900">{formatCurrency(optionsTotal, currency)}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                        <div className="space-y-0.5">
                                            <p className="text-[11px] font-black uppercase text-slate-900">Motor & Acc.</p>
                                            <p className="text-[9px] font-bold text-slate-400 truncate max-w-[200px]">{quote.motor?.name}</p>
                                        </div>
                                        <div className="flex items-center gap-8 text-right">
                                            <div>
                                                <p className="text-[8px] font-black text-rose-400 uppercase tracking-tighter">Cost</p>
                                                <p className="text-[11px] font-black text-rose-600">{formatCurrency(motorCost, currency)}</p>
                                            </div>
                                            <div>
                                                <p className="text-[8px] font-black text-emerald-400 uppercase tracking-tighter">Sell</p>
                                                <p className="text-[11px] font-black text-slate-900">{formatCurrency(motorTotal, currency)}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                        <div className="space-y-0.5">
                                            <p className="text-[11px] font-black uppercase text-slate-900">Trailer & Loading</p>
                                            <p className="text-[9px] font-bold text-slate-400 truncate max-w-[200px]">{quote.trailer?.name}</p>
                                        </div>
                                        <div className="flex items-center gap-8 text-right">
                                            <div>
                                                <p className="text-[8px] font-black text-rose-400 uppercase tracking-tighter">Cost</p>
                                                <p className="text-[11px] font-black text-rose-600">{formatCurrency(trailerCost, currency)}</p>
                                            </div>
                                            <div>
                                                <p className="text-[8px] font-black text-emerald-400 uppercase tracking-tighter">Sell</p>
                                                <p className="text-[11px] font-black text-slate-900">{formatCurrency(trailerTotal, currency)}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                        <div className="space-y-0.5">
                                            <p className="text-[11px] font-black uppercase text-slate-900">Dealer Fit Outs</p>
                                            <p className="text-[9px] font-bold text-slate-400">Custom Dealer Work</p>
                                        </div>
                                        <div className="flex items-center gap-8 text-right">
                                            <div>
                                                <p className="text-[8px] font-black text-rose-400 uppercase tracking-tighter">Cost</p>
                                                <p className="text-[11px] font-black text-rose-600">{formatCurrency(dealerFitCost, currency)}</p>
                                            </div>
                                            <div>
                                                <p className="text-[8px] font-black text-emerald-400 uppercase tracking-tighter">Sell</p>
                                                <p className="text-[11px] font-black text-slate-900">{formatCurrency(dealerFitTotal, currency)}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Sheet Footer */}
                    <div className="p-8 border-t bg-white">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Projected Net Deal Profit</span>
                            <span className={cn("text-2xl font-black italic tracking-tight", grossProfit >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                {formatCurrency(grossProfit, currency)}
                            </span>
                        </div>
                        <Button className="w-full h-14 rounded-2xl bg-slate-900 text-white font-black uppercase tracking-[0.2em] italic text-xs hover:bg-primary transition-all shadow-xl shadow-slate-200" onClick={() => setIsAuditOpen(false)}>
                            Close Audit Report
                        </Button>
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    );
}

export default function ProposalPage() {
    return (
        <Suspense fallback={<HelmLogicLoading label="Loading Proposal" />}>
            <ProposalContent />
        </Suspense>
    );
}

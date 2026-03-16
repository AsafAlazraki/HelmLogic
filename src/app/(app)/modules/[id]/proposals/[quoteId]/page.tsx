'use client';

import { useParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { useUser } from '@/firebase/auth/use-user';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase/firestore/use-collection';
import { doc, collection, query, where } from 'firebase/firestore';
import { useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';

function formatCurrency(amount: number, currency?: string) {
    return new Intl.NumberFormat('en-AU', {
        style: 'currency',
        currency: currency || 'AUD',
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
    const gstAmount = quote.totalPriceExclGst * 0.1;
    const totalInclGst = quote.totalPriceExclGst + gstAmount;

    return (
        <div className="min-h-screen bg-slate-50/50">
            {/* Top Nav */}
            <div className="sticky top-0 z-50 bg-white/95 backdrop-blur-xl border-b shadow-sm">
                <div className="max-w-6xl mx-auto px-8 h-16 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl border-2" onClick={() => router.push(`/modules/${slugOrId}`)}>
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-muted-foreground">Proposal</p>
                            <p className="text-sm font-black uppercase tracking-tight leading-none">{quote.quoteNumber}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <Badge className={cn("text-[9px] font-black uppercase tracking-widest", quote.status === 'proposal' ? 'bg-primary/10 text-primary border border-primary/30' : 'bg-emerald-50 text-emerald-700 border border-emerald-200')}>
                            {quote.status}
                        </Badge>
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
                                <p className="text-4xl font-black tabular-nums">{formatCurrency(quote.totalPriceExclGst, currency)}</p>
                                <p className="text-[9px] font-black uppercase tracking-widest opacity-40 mt-1">
                                    incl. GST: {formatCurrency(totalInclGst, currency)}
                                </p>
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

                        {/* Pricing Breakdown Card */}
                        <div className="bg-white rounded-[2rem] border-2 shadow-sm overflow-hidden sticky top-20">
                            <div className="px-6 py-5 border-b bg-slate-900 flex items-center gap-3">
                                <DollarSign className="h-4 w-4 text-white/60" />
                                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/80">Pricing Breakdown</h3>
                            </div>
                            <div className="p-4 space-y-1">
                                <PricingRow label="Vessel Base" value={boatBasePrice} currency={currency} />
                                {optionsTotal > 0 && <PricingRow label="Factory Options" value={optionsTotal} currency={currency} />}
                                {regoTotal > 0 && <PricingRow label="Registration" value={regoTotal} currency={currency} />}
                                {motorTotal > 0 && <PricingRow label="Motor & Accessories" value={motorTotal} currency={currency} />}
                                {trailerTotal > 0 && <PricingRow label="Trailer Package" value={trailerTotal} currency={currency} />}
                                {dealerFitTotal > 0 && <PricingRow label="Dealer Fit" value={dealerFitTotal} currency={currency} />}
                            </div>
                            <div className="border-t p-4 space-y-1.5">
                                <div className="flex items-center justify-between px-4 py-2.5">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Subtotal (Excl. GST)</span>
                                    <span className="font-black text-sm tabular-nums">{formatCurrency(quote.totalPriceExclGst, currency)}</span>
                                </div>
                                <div className="flex items-center justify-between px-4 py-2.5">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">GST (10%)</span>
                                    <span className="font-black text-sm tabular-nums">{formatCurrency(gstAmount, currency)}</span>
                                </div>
                                <div className="flex items-center justify-between bg-primary text-white rounded-xl px-4 py-3 mt-2">
                                    <span className="text-[10px] font-black uppercase tracking-wider">Total Incl. GST</span>
                                    <span className="font-black text-base tabular-nums">{formatCurrency(totalInclGst, currency)}</span>
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

'use client';

import { useParams } from 'next/navigation';
import { useCollection, useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { useUser } from '@/firebase/auth/use-user';
import { collection, doc, query, orderBy } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Loader2, FileText, ChevronRight, Plus, Ship, Calendar, Anchor } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

function StatusBadge({ status }: { status: string }) {
    const isActive = status === 'proposal';
    return (
        <span className={cn(
            "inline-flex items-center px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border",
            isActive
                ? "bg-primary/10 text-primary border-primary/20"
                : "bg-emerald-50 text-emerald-700 border-emerald-200"
        )}>
            {status || 'FINALIZED'}
        </span>
    );
}

export default function ProposalsPage() {
    const params = useParams();
    const id = params.id as string;
    const orgSlug = (params as any).orgSlug as string | undefined;
    const navPrefix = orgSlug ? `/${orgSlug}` : '';
    const firestore = useFirestore();
    const { user } = useUser();

    const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user?.uid]);
    const { data: userProfile } = useDoc<any>(userProfileRef);

    const quotesQuery = useMemoFirebase(() => {
        if (!user?.uid) return null;
        return query(
            collection(firestore, `users/${user.uid}/quotes`),
            orderBy('createdAt', 'desc')
        );
    }, [firestore, user?.uid]);

    const { data: quotes, isLoading } = useCollection<any>(quotesQuery);

    const moduleLabel = id.replace(/-/g, ' ');

    return (
        <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 md:p-8 rounded-[2rem] border-2 shadow-sm">
                <div className="space-y-1">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                            <FileText className="h-5 w-5 text-primary" />
                        </div>
                        <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tighter text-slate-900 leading-none">
                            Proposals
                        </h1>
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 pl-[52px]">
                        {moduleLabel}
                    </p>
                </div>
                <Button asChild className="h-12 px-6 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg hover:scale-[1.02] active:scale-100 transition-transform bg-primary text-white shrink-0">
                    <Link href={`${navPrefix}/modules/${id}`}>
                        <Plus className="h-4 w-4 mr-2" />
                        New Quote
                    </Link>
                </Button>
            </div>

            {/* Content */}
            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-32 gap-4">
                    <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">Loading Proposals...</p>
                </div>
            ) : quotes && quotes.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                    {quotes.map((quote) => {
                        const total = quote.finalTotal || quote.totalPrice || 0;
                        const formattedTotal = new Intl.NumberFormat('en-AU', {
                            style: 'currency', currency: 'AUD', maximumFractionDigits: 0
                        }).format(total);
                        const date = quote.createdAt?.toDate ? format(quote.createdAt.toDate(), 'dd MMM yyyy') : null;
                        const modelName = quote.modelName || quote.model?.name || 'Vessel';
                        const variantDesc = [quote.variant?.material, quote.variant?.colorName].filter(Boolean).join(' · ');

                        return (
                            <Link
                                key={quote.id}
                                href={`${navPrefix}/modules/${id}/proposals/${quote.id}`}
                                className="group block bg-white rounded-[2rem] border-2 border-slate-100 hover:border-primary/30 shadow-sm hover:shadow-xl transition-all duration-200 overflow-hidden"
                            >
                                {/* Card image strip */}
                                <div className="relative h-36 bg-slate-50 border-b-2 border-slate-100 overflow-hidden">
                                    {quote.coverImageUrl || quote.variant?.imageUrl ? (
                                        <img
                                            src={quote.coverImageUrl || quote.variant?.imageUrl}
                                            alt={modelName}
                                            className="w-full h-full object-cover object-center transition-transform duration-300 group-hover:scale-105 mix-blend-multiply"
                                        />
                                    ) : (
                                        <div className="h-full flex items-center justify-center">
                                            <Anchor className="h-12 w-12 text-slate-200" />
                                        </div>
                                    )}
                                    {/* Status badge overlay */}
                                    <div className="absolute top-3 left-3">
                                        <StatusBadge status={quote.status} />
                                    </div>
                                    {/* Quote number */}
                                    <div className="absolute top-3 right-3 bg-white/90 backdrop-blur px-2.5 py-1 rounded-full">
                                        <span className="text-[8px] font-black uppercase tracking-widest text-slate-600">{quote.quoteNumber}</span>
                                    </div>
                                </div>

                                {/* Card body */}
                                <div className="p-5 space-y-4">
                                    <div className="space-y-0.5">
                                        <p className="text-sm font-black uppercase tracking-tight text-slate-900 truncate leading-tight">
                                            {quote.customer?.name || 'Unknown Client'}
                                        </p>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">
                                            {modelName}{variantDesc ? ` · ${variantDesc}` : ''}
                                        </p>
                                    </div>

                                    <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                                        <div>
                                            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Total (Excl. GST)</p>
                                            <p className="text-lg font-black text-primary italic tabular-nums leading-none">{formattedTotal}</p>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-slate-400">
                                            {date && (
                                                <span className="text-[9px] font-black uppercase tracking-wider">{date}</span>
                                            )}
                                            <div className="h-7 w-7 rounded-xl bg-slate-100 group-hover:bg-primary group-hover:text-white flex items-center justify-center transition-colors">
                                                <ChevronRight className="h-4 w-4" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            ) : (
                <div className="py-32 flex flex-col items-center gap-5 bg-white rounded-[3rem] border-2 border-dashed border-slate-200">
                    <div className="h-20 w-20 rounded-3xl bg-slate-50 flex items-center justify-center">
                        <Ship className="h-10 w-10 text-slate-200" />
                    </div>
                    <div className="text-center space-y-2">
                        <p className="text-base font-black uppercase tracking-[0.2em] text-slate-300">No Proposals Yet</p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            Start a new build to create your first proposal.
                        </p>
                    </div>
                    <Button asChild className="h-11 px-6 rounded-2xl font-black uppercase tracking-widest text-[10px] bg-primary text-white mt-2">
                        <Link href={`${navPrefix}/modules/${id}`}>
                            <Plus className="h-4 w-4 mr-2" />
                            Start a Build
                        </Link>
                    </Button>
                </div>
            )}
        </div>
    );
}

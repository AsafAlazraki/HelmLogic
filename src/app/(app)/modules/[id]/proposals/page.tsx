'use client';

import { useParams } from 'next/navigation';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, FileText, ChevronRight, Plus, Ship, Calendar, DollarSign, Download } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

export default function ProposalsPage() {
    const params = useParams();
    const id = params.id as string;
    const firestore = useFirestore();

    const quotesQuery = useMemoFirebase(() => 
        query(
            collection(firestore, 'quotes'),
            where('module.slug', '==', id),
            orderBy('createdAt', 'desc')
        ), [firestore, id]
    );

    const { data: quotes, isLoading } = useCollection<any>(quotesQuery);

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-8 rounded-[2rem] border-4 shadow-2xl">
                <div className="space-y-1">
                    <h1 className="text-4xl font-black uppercase tracking-tighter text-slate-900 flex items-center gap-3">
                        <FileText className="h-10 w-10 text-primary" />
                        Proposals Dashboard
                    </h1>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Management & Tracking for {id.replace(/-/g, ' ')}</p>
                </div>
                <Button asChild className="h-14 px-8 rounded-2xl font-black uppercase tracking-widest shadow-xl hover:scale-105 transition-transform bg-primary text-white">
                    <Link href={`/modules/${id}`}>
                        <Plus className="h-5 w-5 mr-3" />
                        New Quote
                    </Link>
                </Button>
            </div>

            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-32 gap-4">
                    <Loader2 className="h-12 w-12 animate-spin text-primary opacity-20" />
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">Synchronizing Vault...</p>
                </div>
            ) : quotes && quotes.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {quotes.map((quote) => (
                        <Card key={quote.id} className="group overflow-hidden rounded-[2.5rem] border-4 hover:border-primary/40 transition-all bg-white shadow-lg hover:shadow-2xl hover:-translate-y-1">
                            <CardHeader className="bg-muted/10 border-b p-6">
                                <div className="flex items-center justify-between mb-2">
                                    <Badge className="bg-primary/10 text-primary border-none font-black text-[8px] uppercase tracking-widest px-3 py-1">
                                        {quote.status || 'FINALIZED'}
                                    </Badge>
                                    <p className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1.5">
                                        <Calendar className="h-3 w-3" />
                                        {quote.createdAt?.toDate ? format(quote.createdAt.toDate(), 'MMM dd, yyyy') : 'No Date'}
                                    </p>
                                </div>
                                <CardTitle className="text-xl font-black uppercase tracking-tight text-slate-900 truncate">
                                    {quote.customer?.name || 'Unknown Client'}
                                </CardTitle>
                                <CardDescription className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                                    {quote.variant?.name || quote.model?.name || 'Standard Config'}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="p-6 space-y-6">
                                <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-xl bg-white border flex items-center justify-center shadow-sm">
                                            <Ship className="h-5 w-5 text-primary/40" />
                                        </div>
                                        <div className="space-y-0.5">
                                            <p className="text-[8px] font-black text-slate-400 uppercase">Configuration Total</p>
                                            <p className="text-xl font-black text-primary italic">
                                                ${(quote.totalPrice || quote.finalTotal || 0).toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                    <Link href={`/modules/${id}/proposals/${quote.id}`} className="h-10 w-10 bg-white border-2 rounded-xl flex items-center justify-center text-primary hover:bg-primary hover:text-white hover:border-primary transition-all shadow-sm">
                                        <ChevronRight className="h-5 w-5" />
                                    </Link>
                                </div>
                                
                                <div className="flex gap-2">
                                    <Button asChild variant="outline" className="flex-1 h-11 rounded-xl font-black uppercase text-[10px] tracking-widest border-2">
                                        <Link href={`/modules/${id}/proposals/${quote.id}`}>
                                            View Deal
                                        </Link>
                                    </Button>
                                    <Button variant="outline" className="h-11 w-11 p-0 rounded-xl border-2 text-primary hover:bg-primary/5">
                                        <Download className="h-4 w-4" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : (
                <div className="py-32 flex flex-col items-center gap-6 bg-white rounded-[3rem] border-4 border-dashed text-slate-200">
                    <FileText className="h-20 w-20 opacity-20" />
                    <div className="text-center space-y-2">
                        <p className="text-xl font-black uppercase tracking-[0.2em] text-slate-300">No Proposals Found</p>
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Initialize a new build configuration to get started.</p>
                    </div>
                </div>
            )}
        </div>
    );
}

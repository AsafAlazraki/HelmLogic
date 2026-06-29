'use client';

/**
 * GlobalSearch (v1.26 — Story 1.7.4).
 *
 * One search box across customers + quotes + contracts. Reads the org
 * customers (collection) + quotes/contracts (collectionGroup, silent),
 * filters client-side by name / number / reference. Lightweight — no
 * search index; for the data volumes here a client filter is fine.
 */

import { useMemo, useState } from 'react';
import { collection, collectionGroup, query, where } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useMemoFirebase } from '@/firebase/provider';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, User, FileText, FileSignature } from 'lucide-react';

export function GlobalSearch({ organisationId }: { organisationId: string }) {
    const firestore = useFirestore();
    const [term, setTerm] = useState('');

    const customersQuery = useMemoFirebase(
        () => organisationId ? query(collection(firestore, 'customers'), where('organisationId', '==', organisationId)) : null,
        [firestore, organisationId],
    );
    const { data: customers } = useCollection<any>(customersQuery, { silent: true });

    const quotesQuery = useMemoFirebase(
        () => organisationId ? query(collectionGroup(firestore, 'quotes'), where('organisationId', '==', organisationId)) : null,
        [firestore, organisationId],
    );
    const { data: quotes } = useCollection<any>(quotesQuery, { silent: true });

    const contractsQuery = useMemoFirebase(
        () => query(collectionGroup(firestore, 'contracts')),
        [firestore],
    );
    const { data: contracts } = useCollection<any>(contractsQuery, { silent: true });

    const results = useMemo(() => {
        const q = term.trim().toLowerCase();
        if (!q) return { customers: [], quotes: [], contracts: [] };
        const match = (s: any) => String(s ?? '').toLowerCase().includes(q);
        return {
            customers: (customers ?? []).filter(c => match(c.name) || match(c.email) || match(c.phone)).slice(0, 20),
            quotes: (quotes ?? []).filter(qd => match(qd.quoteNumber) || match(qd.customer?.name) || match(qd.customerName)).slice(0, 20),
            contracts: (contracts ?? []).filter(c => match(c.contractReference)).slice(0, 20),
        };
    }, [term, customers, quotes, contracts]);

    const totalResults = results.customers.length + results.quotes.length + results.contracts.length;

    return (
        <div className="space-y-4" data-testid="global-search">
            <div className="relative max-w-xl">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    placeholder="Search customers, quotes, contracts…"
                    className="pl-9 h-11 text-sm"
                    data-testid="global-search-input"
                    autoFocus
                />
            </div>

            {term.trim() && (
                <Card data-testid="global-search-results">
                    <CardContent className="p-0">
                        {totalResults === 0 ? (
                            <p className="text-xs text-muted-foreground italic py-8 text-center">No matches for "{term}".</p>
                        ) : (
                            <div className="divide-y">
                                {results.customers.map(c => <ResultRow key={`c-${c.id}`} icon={User} label={c.name} meta={c.email ?? c.phone} kind="Customer" />)}
                                {results.quotes.map(q => <ResultRow key={`q-${q.id}`} icon={FileText} label={q.quoteNumber ?? q.id?.slice(0,8)} meta={q.customer?.name ?? q.customerName} kind="Quote" />)}
                                {results.contracts.map(c => <ResultRow key={`k-${c.id}`} icon={FileSignature} label={c.contractReference ?? c.id?.slice(0,8)} meta={c.state} kind="Contract" />)}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function ResultRow({ icon: Icon, label, meta, kind }: { icon: any; label: string; meta?: string; kind: string }) {
    return (
        <div className="flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-slate-50">
            <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="font-bold truncate">{label}</span>
            {meta && <span className="text-muted-foreground truncate">{meta}</span>}
            <Badge variant="outline" className="text-[9px] ml-auto shrink-0">{kind}</Badge>
        </div>
    );
}

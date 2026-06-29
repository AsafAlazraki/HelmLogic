'use client';

/**
 * ContractsOverview (v1.22 — Story 8.1.5).
 *
 * Cross-module contracts view. collectionGroup('contracts') filtered by
 * organisationId-bearing quotes is not directly possible (contracts don't
 * carry organisationId), so we read collectionGroup('contracts') and the
 * recursive rule gates on signed-in. Sort (date / value / state) + filter
 * (state). Mirrors the v1.21 reporting-dashboard quotes view.
 *
 * silent:true so a missing recursive rule degrades to an empty list
 * instead of white-screening (v1.10 + v1.21 lesson).
 */

import { useMemo, useState } from 'react';
import { collectionGroup, query } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useMemoFirebase } from '@/firebase/provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, FileSignature } from 'lucide-react';

const STATE_TONE: Record<string, string> = {
    'pending-signature': 'bg-amber-100 text-amber-800 border-amber-300',
    'signed': 'bg-emerald-100 text-emerald-800 border-emerald-300',
    'cancelled': 'bg-rose-100 text-rose-800 border-rose-300',
};

function toMs(ts: any): number {
    if (!ts) return 0;
    if (typeof ts === 'number') return ts;
    if (typeof ts?.toDate === 'function') return ts.toDate().getTime();
    if (typeof ts?.seconds === 'number') return ts.seconds * 1000;
    return 0;
}

export function ContractsOverview() {
    const firestore = useFirestore();
    const [sortBy, setSortBy] = useState<'date' | 'value' | 'state'>('date');
    const [filterState, setFilterState] = useState<string>('all');

    const contractsQuery = useMemoFirebase(
        () => query(collectionGroup(firestore, 'contracts')),
        [firestore],
    );
    const { data: contracts, isLoading } = useCollection<any>(contractsQuery, { silent: true });

    const states = useMemo(() => {
        const s = new Set<string>();
        for (const c of contracts ?? []) if (c.state) s.add(String(c.state));
        return ['all', ...Array.from(s).sort()];
    }, [contracts]);

    const rows = useMemo(() => {
        let list = contracts ?? [];
        if (filterState !== 'all') list = list.filter(c => c.state === filterState);
        return [...list].sort((a, b) => {
            if (sortBy === 'value') return Number(b.totalInclGst ?? 0) - Number(a.totalInclGst ?? 0);
            if (sortBy === 'state') return String(a.state ?? '').localeCompare(String(b.state ?? ''));
            return toMs(b.createdAt) - toMs(a.createdAt);
        });
    }, [contracts, sortBy, filterState]);

    return (
        <Card className="rounded-2xl border-2" data-testid="contracts-overview">
            <CardHeader>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <CardTitle className="text-base font-bold flex items-center gap-2"><FileSignature className="h-4 w-4" /> Contracts</CardTitle>
                    <div className="flex items-center gap-2">
                        <Select value={filterState} onValueChange={setFilterState}>
                            <SelectTrigger className="h-8 w-40 rounded-xl text-xs" data-testid="contracts-filter-state"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {states.map(s => <SelectItem key={s} value={s}>{s === 'all' ? 'All states' : s}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                            <SelectTrigger className="h-8 w-32 rounded-xl text-xs" data-testid="contracts-sort"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="date">Newest</SelectItem>
                                <SelectItem value="value">Highest value</SelectItem>
                                <SelectItem value="state">State</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex items-center justify-center py-12 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" /><span className="text-xs">Loading contracts…</span>
                    </div>
                ) : rows.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic py-8 text-center">No contracts yet. They appear here once you convert a quote.</p>
                ) : (
                    <div className="rounded-xl border-2 overflow-hidden">
                        <table className="w-full text-xs">
                            <thead className="bg-slate-50 border-b-2">
                                <tr className="text-left">
                                    <th className="px-3 py-2 font-bold uppercase tracking-widest text-[10px]">Reference</th>
                                    <th className="px-3 py-2 font-bold uppercase tracking-widest text-[10px]">State</th>
                                    <th className="px-3 py-2 font-bold uppercase tracking-widest text-[10px] text-right">Total inc</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.slice(0, 100).map((c: any) => (
                                    <tr key={c.id} className="border-b last:border-b-0 hover:bg-slate-50">
                                        <td className="px-3 py-2 font-mono font-bold">{c.contractReference ?? c.id?.slice(0, 8)}</td>
                                        <td className="px-3 py-2"><Badge className={`${STATE_TONE[c.state] ?? ''} text-[9px] font-bold uppercase`}>{c.state ?? '—'}</Badge></td>
                                        <td className="px-3 py-2 text-right tabular-nums font-bold">${Number(c.totalInclGst ?? 0).toLocaleString('en-AU')}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

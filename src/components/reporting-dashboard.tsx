'use client';

/**
 * ReportingDashboard (v1.21 — Story 8.2.1) +
 * Cross-module Quotes view (v1.21 — Story 8.1.4).
 *
 * Reads every quote across the org via a collection-group query and
 * derives at-a-glance metrics + a sortable / filterable flat list.
 *
 * Metrics:
 *   - Quotes this month (createdAt in current month)
 *   - Total pipeline value (sum of non-terminal quote totals)
 *   - Conversion rate (accepted+ / total)
 *   - Deposits taken (count of quotes with contractId)
 *
 * The flat list (8.1.4) supports sort (date / value / status) + filter
 * (lifecycle state). One component serves both stories because they read
 * the same data — the metrics strip is the dashboard, the table is the
 * cross-module view.
 */

import { useMemo, useState } from 'react';
import { collectionGroup, query, where } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useMemoFirebase } from '@/firebase/provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, FileText, DollarSign, CheckCircle2, Loader2 } from 'lucide-react';

const ACCEPTED_STATES = new Set(['accepted', 'contracted', 'won', 'delivered']);

function quoteTotal(q: any): number {
    return Number(q.financials?.totalInclGst ?? q.totalInclGst ?? 0);
}

function toMs(ts: any): number {
    if (!ts) return 0;
    if (typeof ts === 'number') return ts;
    if (typeof ts?.toDate === 'function') return ts.toDate().getTime();
    if (typeof ts?.seconds === 'number') return ts.seconds * 1000;
    return 0;
}

export function ReportingDashboard({ organisationId }: { organisationId: string }) {
    const firestore = useFirestore();
    const [sortBy, setSortBy] = useState<'date' | 'value' | 'status'>('date');
    const [filterState, setFilterState] = useState<string>('all');

    const quotesQuery = useMemoFirebase(
        () => organisationId ? query(collectionGroup(firestore, 'quotes'), where('organisationId', '==', organisationId)) : null,
        [firestore, organisationId],
    );
    // silent: a missing collectionGroup rule degrades to an empty
    // dashboard instead of white-screening via the global error boundary
    // (v1.10 denylist lesson). The recursive rule in firestore.rules
    // makes the data actually populate once published.
    const { data: quotes, isLoading } = useCollection<any>(quotesQuery, { silent: true });

    const metrics = useMemo(() => {
        const list = (quotes ?? []).filter(q => !q.deletedAt);
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const thisMonth = list.filter(q => toMs(q.createdAt) >= monthStart).length;
        const accepted = list.filter(q => ACCEPTED_STATES.has(q.lifecycleState)).length;
        const conversionRate = list.length > 0 ? (accepted / list.length) * 100 : 0;
        const pipelineValue = list
            .filter(q => !ACCEPTED_STATES.has(q.lifecycleState) && q.lifecycleState !== 'lost')
            .reduce((acc, q) => acc + quoteTotal(q), 0);
        const deposits = list.filter(q => !!q.contractId).length;
        return { total: list.length, thisMonth, conversionRate, pipelineValue, deposits };
    }, [quotes]);

    const states = useMemo(() => {
        const s = new Set<string>();
        for (const q of quotes ?? []) if (q.lifecycleState) s.add(String(q.lifecycleState));
        return ['all', ...Array.from(s).sort()];
    }, [quotes]);

    const rows = useMemo(() => {
        let list = (quotes ?? []).filter(q => !q.deletedAt);
        if (filterState !== 'all') list = list.filter(q => q.lifecycleState === filterState);
        list = [...list].sort((a, b) => {
            if (sortBy === 'value') return quoteTotal(b) - quoteTotal(a);
            if (sortBy === 'status') return String(a.lifecycleState ?? '').localeCompare(String(b.lifecycleState ?? ''));
            return toMs(b.createdAt) - toMs(a.createdAt);
        });
        return list;
    }, [quotes, sortBy, filterState]);

    return (
        <div className="space-y-6" data-testid="reporting-dashboard">
            {/* Metrics strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard icon={FileText} label="Quotes this month" value={String(metrics.thisMonth)} tone="text-sky-600" />
                <MetricCard icon={TrendingUp} label="Conversion rate" value={`${metrics.conversionRate.toFixed(0)}%`} tone="text-emerald-600" />
                <MetricCard icon={DollarSign} label="Pipeline value" value={`$${Math.round(metrics.pipelineValue).toLocaleString('en-AU')}`} tone="text-amber-600" />
                <MetricCard icon={CheckCircle2} label="Deposits taken" value={String(metrics.deposits)} tone="text-violet-600" />
            </div>

            {/* Cross-module quotes view (8.1.4) */}
            <Card className="rounded-2xl border-2">
                <CardHeader>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <CardTitle className="text-base font-bold">All quotes</CardTitle>
                        <div className="flex items-center gap-2">
                            <Select value={filterState} onValueChange={setFilterState}>
                                <SelectTrigger className="h-8 w-36 rounded-xl text-xs" data-testid="reporting-filter-state"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {states.map(s => <SelectItem key={s} value={s}>{s === 'all' ? 'All states' : s}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                                <SelectTrigger className="h-8 w-32 rounded-xl text-xs" data-testid="reporting-sort"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="date">Newest</SelectItem>
                                    <SelectItem value="value">Highest value</SelectItem>
                                    <SelectItem value="status">Status</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12 text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin mr-2" /><span className="text-xs">Loading quotes…</span>
                        </div>
                    ) : rows.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic py-8 text-center">No quotes match.</p>
                    ) : (
                        <div className="rounded-xl border-2 overflow-hidden">
                            <table className="w-full text-xs">
                                <thead className="bg-slate-50 border-b-2">
                                    <tr className="text-left">
                                        <th className="px-3 py-2 font-bold uppercase tracking-widest text-[10px]">Quote</th>
                                        <th className="px-3 py-2 font-bold uppercase tracking-widest text-[10px]">Customer</th>
                                        <th className="px-3 py-2 font-bold uppercase tracking-widest text-[10px]">State</th>
                                        <th className="px-3 py-2 font-bold uppercase tracking-widest text-[10px] text-right">Total inc</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.slice(0, 100).map((q: any) => (
                                        <tr key={q.id} className="border-b last:border-b-0 hover:bg-slate-50">
                                            <td className="px-3 py-2 font-mono font-bold">{q.quoteNumber ?? q.id?.slice(0, 8)}</td>
                                            <td className="px-3 py-2">{q.customer?.name ?? q.customerName ?? '—'}</td>
                                            <td className="px-3 py-2">{q.lifecycleState ? <Badge variant="outline" className="text-[9px]">{q.lifecycleState}</Badge> : '—'}</td>
                                            <td className="px-3 py-2 text-right tabular-nums font-bold">${quoteTotal(q).toLocaleString('en-AU')}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function MetricCard({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string; tone: string }) {
    return (
        <Card className="rounded-2xl border-2">
            <CardContent className="p-4">
                <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${tone}`} />
                    <p className="text-[9px] uppercase tracking-widest font-black text-muted-foreground">{label}</p>
                </div>
                <p className="text-2xl font-black mt-2 tabular-nums">{value}</p>
            </CardContent>
        </Card>
    );
}

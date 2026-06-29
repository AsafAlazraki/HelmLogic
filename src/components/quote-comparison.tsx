'use client';

/**
 * QuoteComparison (v1.25 — Story 1.1.4).
 *
 * Pick up to 3 quotes and compare them side by side: customer, state,
 * totals, key line subtotals. Reads the org quotes via collectionGroup
 * (silent). The picker is a simple multi-select chip row; the comparison
 * renders as aligned columns.
 */

import { useMemo, useState } from 'react';
import { collectionGroup, query, where } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useMemoFirebase } from '@/firebase/provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

function quoteTotal(q: any): number {
    return Number(q.financials?.totalInclGst ?? q.totalInclGst ?? 0);
}

export function QuoteComparison({ organisationId }: { organisationId: string }) {
    const firestore = useFirestore();
    const [selected, setSelected] = useState<string[]>([]);

    const quotesQuery = useMemoFirebase(
        () => organisationId ? query(collectionGroup(firestore, 'quotes'), where('organisationId', '==', organisationId)) : null,
        [firestore, organisationId],
    );
    const { data: quotes, isLoading } = useCollection<any>(quotesQuery, { silent: true });

    const toggle = (id: string) => {
        setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : (prev.length >= 3 ? prev : [...prev, id]));
    };

    const compared = useMemo(
        () => (quotes ?? []).filter((q: any) => selected.includes(q.id)),
        [quotes, selected],
    );

    return (
        <div className="space-y-4" data-testid="quote-comparison">
            <Card className="rounded-2xl border-2">
                <CardHeader><CardTitle className="text-base font-bold">Pick up to 3 quotes</CardTitle></CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex items-center gap-2 text-muted-foreground text-xs py-4"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
                    ) : (quotes ?? []).length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No quotes to compare yet.</p>
                    ) : (
                        <div className="flex flex-wrap gap-1.5" data-testid="quote-comparison-picker">
                            {(quotes ?? []).slice(0, 60).map((q: any) => (
                                <button
                                    key={q.id}
                                    type="button"
                                    onClick={() => toggle(q.id)}
                                    className={`text-[10px] font-bold px-2 py-1 rounded-lg border-2 transition-colors ${selected.includes(q.id) ? 'bg-primary text-white border-primary' : 'bg-white hover:bg-slate-50'}`}
                                >
                                    {q.quoteNumber ?? q.id?.slice(0, 8)}
                                </button>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {compared.length > 0 && (
                <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${compared.length}, minmax(0, 1fr))` }} data-testid="quote-comparison-columns">
                    {compared.map((q: any) => (
                        <Card key={q.id} className="rounded-2xl border-2">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-bold font-mono">{q.quoteNumber ?? q.id?.slice(0, 8)}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2 text-xs">
                                <Row label="Customer" value={q.customer?.name ?? q.customerName ?? '—'} />
                                <Row label="State" value={q.lifecycleState ?? '—'} />
                                <Row label="Boat" value={q.variant?.name ?? q.model?.name ?? '—'} />
                                <Row label="Total inc GST" value={`$${quoteTotal(q).toLocaleString('en-AU')}`} bold />
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
    return (
        <div className="flex items-center justify-between border-b py-1.5">
            <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">{label}</span>
            <span className={bold ? 'font-black tabular-nums' : ''}>{value}</span>
        </div>
    );
}

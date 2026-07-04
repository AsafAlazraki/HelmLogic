'use client';

/**
 * SalesPipelineBoard (v1.23 — Story 1.7.1).
 *
 * Kanban of customers grouped by lifecycle stage. Stages come from
 * organisation.customerDefaults.pipelineStages (falls back to a sensible
 * default set). Read-only board for now — drag-to-move-stage is a later
 * polish item; this ships the at-a-glance pipeline view.
 */

import { useMemo } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useMemoFirebase } from '@/firebase/provider';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, User } from 'lucide-react';
import { withCustomerDefaults, type Customer } from '@/lib/customer-types';

const DEFAULT_STAGES = ['Lead', 'Contacted', 'Qualified', 'Quoted', 'Contracted', 'Won', 'Delivered'];

export function SalesPipelineBoard({ organisationId, organisation }: { organisationId: string; organisation?: any }) {
    const firestore = useFirestore();

    const stages: string[] = useMemo(() => {
        const configured = organisation?.customerDefaults?.pipelineStages;
        return Array.isArray(configured) && configured.length > 0 ? configured : DEFAULT_STAGES;
    }, [organisation?.customerDefaults?.pipelineStages]);

    const customersQuery = useMemoFirebase(
        () => organisationId ? query(collection(firestore, 'customers'), where('organisationId', '==', organisationId)) : null,
        [firestore, organisationId],
    );
    const { data: customers, isLoading } = useCollection<Customer>(customersQuery, { silent: true });

    const byStage = useMemo(() => {
        const map: Record<string, Customer[]> = {};
        for (const s of stages) map[s] = [];
        const other: Customer[] = [];
        for (const raw of customers ?? []) {
            const c = withCustomerDefaults(raw as any);
            const stage = c.lifecycleStage ?? 'Lead';
            if (map[stage]) map[stage].push(c);
            else other.push(c);
        }
        return { map, other };
    }, [customers, stages]);

    if (isLoading) {
        return <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /><span className="text-xs">Loading pipeline…</span></div>;
    }

    return (
        <div className="overflow-x-auto overflow-y-hidden" data-testid="sales-pipeline-board">
            <div className="flex gap-3 min-w-max pb-4">
                {stages.map(stage => {
                    const list = byStage.map[stage] ?? [];
                    return (
                        <div key={stage} className="w-64 shrink-0">
                            <div className="flex items-center justify-between px-3 py-2 bg-slate-100 rounded-t-xl border-2 border-b-0">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">{stage}</p>
                                <Badge variant="outline" className="text-[9px] font-bold">{list.length}</Badge>
                            </div>
                            <div className="border-2 rounded-b-xl p-2 space-y-2 min-h-[120px] bg-slate-50/40">
                                {list.length === 0 ? (
                                    <p className="text-[10px] text-muted-foreground/50 italic text-center py-4">Empty</p>
                                ) : list.map(c => (
                                    <Card key={c.id} className="p-2.5 rounded-lg border text-xs hover:shadow-sm transition-shadow">
                                        <div className="flex items-center gap-2">
                                            <User className="h-3 w-3 text-muted-foreground shrink-0" />
                                            <span className="font-bold truncate">{c.name}</span>
                                        </div>
                                        {c.source && <p className="text-[9px] text-muted-foreground mt-1 truncate">{c.source}</p>}
                                    </Card>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

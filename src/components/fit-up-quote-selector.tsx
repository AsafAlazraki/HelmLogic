
'use client';

/**
 * FitUpQuoteSelector (v1.11 — Epic 9.2.1 + 9.2.2).
 *
 * Salesperson-facing fit-up picker. Rendered in Step 5 of the
 * highfield quote flow (alongside Dealer Fit). Reads from the org's
 * `fitUpItems` catalogue (populated in v1.10 by `FitUpCatalogManager`)
 * and lets the operator toggle items onto the in-progress quote.
 *
 * Pure presentation — selection state is owned by the parent
 * (highfield-quote-flow) so it can snapshot at finalize. We just
 * fetch + render + emit toggle events. Matches the dealer-fit
 * card-grid pattern but flatter (fit-up items are a flat list with
 * tiers, no categories).
 *
 * v1.11 MVP — catalogue-wide selection. Per-module restriction
 * (only show items relevant to the boat being quoted) is deferred
 * to a later cycle. For now any fit-up item can attach to any quote;
 * dealer-admins enforce relevance by what they choose to catalogue.
 *
 * Customer-facing rendering on the PDF is a single summary line per
 * Story 9.2.3 — see proposal-pdf.tsx fit-up section.
 */

import { useMemo, useState } from 'react';
import { collection, orderBy, query } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Wrench, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const TIERS = ['simple', 'medium', 'complex'] as const;
type Tier = typeof TIERS[number];

const TIER_LABEL: Record<Tier, string> = {
    simple: 'Simple',
    medium: 'Medium',
    complex: 'Complex',
};

const TIER_TONE: Record<Tier, string> = {
    simple: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    medium: 'bg-amber-50 text-amber-800 border-amber-200',
    complex: 'bg-rose-50 text-rose-800 border-rose-200',
};

export interface FitUpItem {
    id: string;
    name: string;
    tier: Tier;
    cost: number;
    sellPrice?: number | null;
    notes?: string | null;
}

interface FitUpQuoteSelectorProps {
    organisationId: string;
    selectedIds: string[];
    onToggle: (item: FitUpItem) => void;
}

/** Resolve the displayed sell price for an item. If sellPrice is set
 *  use it; otherwise fall back to cost (no margin tooling yet, per
 *  v1.10 catalogue notes). Display-only — finalize uses the same
 *  resolution to snapshot the price-locked value. */
export function resolveFitUpSell(item: Pick<FitUpItem, 'sellPrice' | 'cost'>): number {
    return item.sellPrice != null ? item.sellPrice : (item.cost ?? 0);
}

export function FitUpQuoteSelector({ organisationId, selectedIds, onToggle }: FitUpQuoteSelectorProps) {
    const firestore = useFirestore();

    const itemsRef = useMemoFirebase(
        () => query(
            collection(firestore, 'organisations', organisationId, 'fitUpItems'),
            orderBy('tier', 'asc'),
            orderBy('name', 'asc'),
        ),
        [firestore, organisationId],
    );
    const { data: items, isLoading } = useCollection<FitUpItem>(itemsRef);

    const [tierFilter, setTierFilter] = useState<Tier | 'all'>('all');

    const filtered = useMemo(() => {
        const list = items ?? [];
        return tierFilter === 'all' ? list : list.filter(i => i.tier === tierFilter);
    }, [items, tierFilter]);

    const tierCounts = useMemo(() => {
        const counts: Record<Tier, number> = { simple: 0, medium: 0, complex: 0 };
        for (const item of items ?? []) {
            if (TIERS.includes(item.tier)) counts[item.tier]++;
        }
        return counts;
    }, [items]);

    const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

    if (isLoading) {
        return (
            <div className="flex justify-center py-12">
                <Loader2 className="animate-spin h-6 w-6 text-primary" />
            </div>
        );
    }

    const total = items?.length ?? 0;
    if (total === 0) {
        return (
            <div className="py-12 text-center border-2 border-dashed rounded-xl opacity-30">
                <Wrench className="h-8 w-8 mx-auto mb-2" />
                <p className="text-[9px] font-black uppercase tracking-widest">No fit-up items catalogued yet.</p>
                <p className="text-[9px] text-muted-foreground mt-1 normal-case font-normal">
                    Org admins: populate from Manage → Fit-Up Catalog.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3 bg-primary px-6 py-3 rounded-2xl shadow-xl w-full">
                <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white flex items-center gap-2">
                    <Wrench className="h-3.5 w-3.5" />
                    Fit-Up & Rigging
                </h3>
                <div className="ml-auto flex items-center gap-1 flex-wrap">
                    <FilterChip active={tierFilter === 'all'} onClick={() => setTierFilter('all')}>
                        All ({total})
                    </FilterChip>
                    {TIERS.map(tier => (
                        <FilterChip key={tier} active={tierFilter === tier} onClick={() => setTierFilter(tier)}>
                            {TIER_LABEL[tier]} ({tierCounts[tier]})
                        </FilterChip>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                {filtered.map(item => {
                    const isSelected = selectedSet.has(item.id);
                    const sell = resolveFitUpSell(item);
                    return (
                        <button
                            key={item.id}
                            onClick={() => onToggle(item)}
                            className={cn(
                                'flex flex-col border-2 rounded-[1.5rem] overflow-hidden transition-all bg-white shadow-lg border-transparent h-full p-1 relative text-left',
                                isSelected ? 'bg-primary/5 border-primary shadow-md ring-2 ring-primary/20' : 'hover:border-primary/20',
                            )}
                        >
                            {isSelected && (
                                <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-primary text-white rounded-full px-2 py-0.5">
                                    <Check className="h-3 w-3" />
                                    <span className="text-[7px] font-black uppercase tracking-wide">Added</span>
                                </div>
                            )}
                            <div className="p-4 flex flex-col gap-2 flex-grow">
                                <Badge variant="outline" className={`${TIER_TONE[item.tier]} text-[9px] font-black uppercase tracking-widest self-start`}>
                                    {TIER_LABEL[item.tier]}
                                </Badge>
                                <p className={cn('text-[11px] font-black uppercase tracking-tight leading-tight', isSelected ? 'text-primary' : 'text-slate-900')}>
                                    {item.name}
                                </p>
                                {item.notes && (
                                    <p className="text-[9px] text-muted-foreground leading-tight line-clamp-2">
                                        {item.notes}
                                    </p>
                                )}
                                <p className={cn('text-[9px] font-black uppercase tracking-widest mt-auto', isSelected ? 'text-primary/70' : 'text-slate-400')}>
                                    ${sell.toLocaleString()}
                                </p>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function FilterChip({
    active, onClick, children,
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <Button
            type="button"
            size="sm"
            variant={active ? 'secondary' : 'ghost'}
            onClick={onClick}
            className={cn(
                'h-6 px-2 rounded-full text-[9px] font-black uppercase tracking-widest',
                active ? 'bg-white text-primary' : 'text-white/80 hover:text-white hover:bg-white/10',
            )}
        >
            {children}
        </Button>
    );
}

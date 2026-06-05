
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
import { Input } from '@/components/ui/input';
import { Wrench, Check, Loader2, Search, Package, Plus, Minus, DollarSign, StickyNote, X } from 'lucide-react';
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
    /** v1.11 expansion — see fit-up-catalog-manager.tsx for the full
     *  field docs. Mirrored here so the picker doesn't have to import
     *  the catalog file (kept lightweight). */
    category?: string | null;
    customerDescription?: string | null;
    /** v1.11 (Epic 9.2.1) — assignment allowlists. Empty array on a
     *  field = "no restriction at this level". When two or more lists
     *  are non-empty, ALL non-empty lists must match the current quote
     *  context (AND semantics). */
    moduleIds?: string[];
    brandIds?: string[];
    rangeIds?: string[];
    modelIds?: string[];
    /** v1.11 expansion-2 — variant-level (sub-model SKU) allowlist.
     *  Same AND-combined semantics as the other levels. variantIds are
     *  the doc ids under data-warehouse/{vendor}/ranges/{range}/models/{model}/variants. */
    variantIds?: string[];
    /** v1.11 expansion-2 — image url for the catalog row + quote selector
     *  card. Native <img> (external CDN-safe, per CLAUDE.md lesson). */
    imageUrl?: string | null;
    /** v1.11 expansion-2 — soft "often paired with" hints. Stores ids
     *  into the same fitUpItems collection. The selector highlights any
     *  hinted items when the source item is selected. NOT a hard rule —
     *  the operator can ignore. The full operator-authored rule engine
     *  (Epic 9.3.1) remains v2.2. */
    oftenPairedWith?: string[];
}

export interface FitUpPackage {
    id: string;
    name: string;
    description?: string | null;
    itemIds: string[];
}

/**
 * v1.11 expansion — per-quote selection wrapper.
 *
 * The selector now tracks more than a yes/no on each item:
 *   - `quantity`: how many of this item are on the quote (defaults to 1)
 *   - `priceOverride`: salesperson-set price for THIS quote only
 *     (catalog sellPrice is unchanged)
 *   - `quoteNote`: free-text per-quote note attached to the line
 *     (operator-only; never on customer PDF — matches catalog `notes`)
 *
 * Stored on the parent state as an array of FitUpSelection. The full
 * `item` snapshot rides with each row so catalog mutations don't blow
 * up a half-built quote, and so the same data path can roundtrip
 * forks / restores without re-fetching the catalog.
 */
export interface FitUpSelection {
    item: FitUpItem;
    quantity: number;
    priceOverride: number | null;
    quoteNote: string | null;
}

/** Resolve the unit sell price for a selection, honouring (in order):
 *  per-quote override → catalog sellPrice → catalog cost. Display +
 *  finalize call this. NEVER multiplies by quantity — the caller does
 *  that when rolling up a line total. */
export function resolveFitUpUnitSell(sel: FitUpSelection): number {
    if (sel.priceOverride != null) return sel.priceOverride;
    return sel.item.sellPrice != null ? sel.item.sellPrice : (sel.item.cost ?? 0);
}

/** Roll-up: quantity × unit sell. */
export function resolveFitUpLineSell(sel: FitUpSelection): number {
    return Math.max(0, sel.quantity) * resolveFitUpUnitSell(sel);
}

interface FitUpQuoteSelectorProps {
    organisationId: string;
    /** v1.11 expansion — full selections (not just ids) so we can
     *  render the per-line qty/override/note UI inline. */
    selections: FitUpSelection[];
    onToggle: (item: FitUpItem) => void;
    /** Bulk-add every member of a package. The caller resolves the
     *  package against the live catalog before invoking. */
    onAddPackage: (items: FitUpItem[]) => void;
    /** Per-line patch — qty / override / note. */
    onUpdateSelection: (itemId: string, patch: Partial<Omit<FitUpSelection, 'item'>>) => void;
    /** v1.11 (Epic 9.2.1) — assignment context. AND-combined against
     *  each item's non-empty allowlist. */
    moduleId?: string;
    vendorId?: string;
    rangeId?: string;
    modelId?: string;
    /** v1.11 expansion-2 — active variant id (SKU level). AND-combined
     *  with the other allowlists in the same itemMatchesContext check. */
    variantId?: string;
    /** v1.11 (Epic 9.3.1 simplified) — boat motor HP for the
     *  Suggested filter heuristic. */
    motorHp?: number;
}

/** Returns true if every non-empty allowlist on `item` includes the
 *  matching context value. Empty allowlists = "no restriction at that
 *  level" → pass through. */
function itemMatchesContext(
    item: FitUpItem,
    ctx: { moduleId?: string; vendorId?: string; rangeId?: string; modelId?: string; variantId?: string },
): boolean {
    const checks: [string[] | undefined, string | undefined][] = [
        [item.moduleIds, ctx.moduleId],
        [item.brandIds, ctx.vendorId],
        [item.rangeIds, ctx.rangeId],
        [item.modelIds, ctx.modelId],
        [item.variantIds, ctx.variantId],
    ];
    for (const [allowlist, value] of checks) {
        if (allowlist && allowlist.length > 0) {
            if (!value || !allowlist.includes(value)) return false;
        }
    }
    return true;
}

/** Resolve the catalog sell price for an item. If sellPrice is set
 *  use it; otherwise fall back to cost. Use this on raw catalog items
 *  (catalog grid card display). For per-quote selections use
 *  resolveFitUpUnitSell / resolveFitUpLineSell which respect overrides
 *  and quantity. */
export function resolveFitUpSell(item: Pick<FitUpItem, 'sellPrice' | 'cost'>): number {
    return item.sellPrice != null ? item.sellPrice : (item.cost ?? 0);
}

/** v1.11 (Epic 9.3.1 simplified) — bucket motor HP into a suggested
 *  tier. Heuristic, not a rule engine: ≥150hp implies a bigger /
 *  more complex install; <50 implies straightforward. Operators
 *  catalogue real items and the suggester just biases the list. */
function suggestedTierForMotorHp(hp: number | undefined): Tier | null {
    if (hp == null || !Number.isFinite(hp)) return null;
    if (hp >= 150) return 'complex';
    if (hp >= 50) return 'medium';
    return 'simple';
}

export function FitUpQuoteSelector({
    organisationId, selections, onToggle, onAddPackage, onUpdateSelection,
    moduleId, vendorId, rangeId, modelId, variantId, motorHp,
}: FitUpQuoteSelectorProps) {
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

    const packagesRef = useMemoFirebase(
        () => query(
            collection(firestore, 'organisations', organisationId, 'fitUpPackages'),
            orderBy('name', 'asc'),
        ),
        [firestore, organisationId],
    );
    const { data: packages } = useCollection<FitUpPackage>(packagesRef);

    const [tierFilter, setTierFilter] = useState<Tier | 'all'>('all');
    const [categoryFilter, setCategoryFilter] = useState<string | 'all'>('all');
    const [suggestedOnly, setSuggestedOnly] = useState(false);
    const [search, setSearch] = useState('');

    const suggestedTier = useMemo(() => suggestedTierForMotorHp(motorHp), [motorHp]);

    // v1.11 Epic 9.2.1 — filter by assignment context first (multi-
    // level AND), then by tier chip + category chip + Suggested + search.
    const moduleFiltered = useMemo(() => {
        const list = items ?? [];
        return list.filter(item => itemMatchesContext(item, { moduleId, vendorId, rangeId, modelId, variantId }));
    }, [items, moduleId, vendorId, rangeId, modelId, variantId]);

    const categories = useMemo(() => {
        const set = new Set<string>();
        for (const item of moduleFiltered) {
            const c = (item.category ?? '').trim();
            if (c) set.add(c);
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [moduleFiltered]);

    const filtered = useMemo(() => {
        let list = moduleFiltered;
        if (tierFilter !== 'all') list = list.filter(i => i.tier === tierFilter);
        if (categoryFilter !== 'all') {
            list = list.filter(i => (i.category ?? '').trim().toLowerCase() === categoryFilter.toLowerCase());
        }
        if (suggestedOnly && suggestedTier) list = list.filter(i => i.tier === suggestedTier);
        const q = search.trim().toLowerCase();
        if (q) {
            list = list.filter(i =>
                i.name.toLowerCase().includes(q)
                || (i.customerDescription ?? '').toLowerCase().includes(q)
                || (i.notes ?? '').toLowerCase().includes(q)
                || (i.category ?? '').toLowerCase().includes(q),
            );
        }
        return list;
    }, [moduleFiltered, tierFilter, categoryFilter, suggestedOnly, suggestedTier, search]);

    const tierCounts = useMemo(() => {
        const counts: Record<Tier, number> = { simple: 0, medium: 0, complex: 0 };
        for (const item of moduleFiltered) {
            if (TIERS.includes(item.tier)) counts[item.tier]++;
        }
        return counts;
    }, [moduleFiltered]);

    const selectedSet = useMemo(() => new Set(selections.map(s => s.item.id)), [selections]);
    const itemById = useMemo(() => {
        const map = new Map<string, FitUpItem>();
        for (const item of items ?? []) map.set(item.id, item);
        return map;
    }, [items]);

    // Packages that are relevant in the current context — at least one
    // of their items must be in moduleFiltered. Hide packages where every
    // member is filtered out (would be a no-op confusing click).
    const relevantPackages = useMemo(() => {
        const ctxIds = new Set(moduleFiltered.map(i => i.id));
        return (packages ?? []).filter(p => p.itemIds.some(id => ctxIds.has(id)));
    }, [packages, moduleFiltered]);

    if (isLoading) {
        return (
            <div className="flex justify-center py-12">
                <Loader2 className="animate-spin h-6 w-6 text-primary" />
            </div>
        );
    }

    const total = moduleFiltered.length;
    if (total === 0) {
        return (
            <div className="py-12 text-center border-2 border-dashed rounded-xl opacity-30">
                <Wrench className="h-8 w-8 mx-auto mb-2" />
                <p className="text-[9px] font-black uppercase tracking-widest">
                    {moduleId && (items?.length ?? 0) > 0
                        ? 'No fit-up items assigned to this boat module.'
                        : 'No fit-up items catalogued yet.'}
                </p>
                <p className="text-[9px] text-muted-foreground mt-1 normal-case font-normal">
                    Org admins: {moduleId && (items?.length ?? 0) > 0
                        ? 'open the item in Manage → Fit-Up Catalog and add this module to its "Available on modules" list.'
                        : 'populate from Manage → Fit-Up Catalog.'}
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
                    {suggestedTier && (
                        <FilterChip active={suggestedOnly} onClick={() => setSuggestedOnly(s => !s)}>
                            ✦ Suggested ({TIER_LABEL[suggestedTier]})
                        </FilterChip>
                    )}
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

            {/* Search + category chips */}
            <div className="space-y-2">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search fit-up items by name, description, or notes…"
                        className="pl-9 h-9 rounded-xl border-2 text-xs"
                    />
                    {search && (
                        <button
                            onClick={() => setSearch('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded"
                            aria-label="Clear search"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    )}
                </div>

                {categories.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 items-center">
                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Category</span>
                        <button
                            onClick={() => setCategoryFilter('all')}
                            className={cn(
                                'rounded-full px-2.5 py-0.5 text-[10px] font-bold border',
                                categoryFilter === 'all' ? 'bg-primary text-white border-primary' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-400',
                            )}
                        >
                            All
                        </button>
                        {categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setCategoryFilter(cat)}
                                className={cn(
                                    'rounded-full px-2.5 py-0.5 text-[10px] font-bold border',
                                    categoryFilter === cat ? 'bg-primary text-white border-primary' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-400',
                                )}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Packages strip — only when packages exist + at least one is relevant in context. */}
            {relevantPackages.length > 0 && (
                <div className="rounded-2xl border-2 bg-slate-50/60 p-3">
                    <div className="flex items-center gap-2 mb-2">
                        <Package className="h-3.5 w-3.5 text-slate-700" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-700">Packages — one click, multiple items</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {relevantPackages.map(pkg => {
                            const resolvedItems = pkg.itemIds.map(id => itemById.get(id)).filter(Boolean) as FitUpItem[];
                            const allOn = resolvedItems.length > 0 && resolvedItems.every(i => selectedSet.has(i.id));
                            const total = resolvedItems.reduce((a, i) => a + resolveFitUpSell(i), 0);
                            return (
                                <button
                                    key={pkg.id}
                                    onClick={() => onAddPackage(resolvedItems)}
                                    className={cn(
                                        'flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-left transition-colors',
                                        allOn ? 'bg-primary text-white border-primary' : 'bg-white border-slate-200 hover:border-primary/40',
                                    )}
                                    title={pkg.description ?? undefined}
                                >
                                    <Package className="h-3.5 w-3.5" />
                                    <div className="flex flex-col">
                                        <span className="text-[11px] font-black uppercase tracking-tight">{pkg.name}</span>
                                        <span className={cn('text-[9px]', allOn ? 'text-white/80' : 'text-muted-foreground')}>
                                            {resolvedItems.length} item{resolvedItems.length === 1 ? '' : 's'} · ${total.toLocaleString()}
                                        </span>
                                    </div>
                                    {allOn && <Check className="h-3 w-3" />}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {filtered.length === 0 ? (
                <div className="py-12 text-center border-2 border-dashed rounded-xl opacity-50">
                    <Search className="h-6 w-6 mx-auto mb-2 opacity-50" />
                    <p className="text-[10px] text-muted-foreground">No items match the current filters.</p>
                </div>
            ) : (
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
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <Badge variant="outline" className={`${TIER_TONE[item.tier]} text-[9px] font-black uppercase tracking-widest`}>
                                            {TIER_LABEL[item.tier]}
                                        </Badge>
                                        {item.category && (
                                            <Badge variant="outline" className="text-[9px] font-semibold bg-slate-50 text-slate-700 border-slate-200">
                                                {item.category}
                                            </Badge>
                                        )}
                                    </div>
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
            )}

            {/* v1.11 expansion — Selected items detail: qty stepper,
                price override, per-quote note. Operator-only — none of
                these fields show on the customer PDF (the PDF rolls up
                to a single Fit-up & Rigging line per Story 9.2.3). */}
            {selections.length > 0 && (
                <div className="rounded-2xl border-2 bg-white p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-700">
                            Selected fit-up items ({selections.length})
                        </h4>
                        <p className="text-[9px] text-muted-foreground italic">
                            Qty, price overrides + per-quote notes — operator-only
                        </p>
                    </div>
                    <div className="space-y-2">
                        {selections.map(sel => (
                            <SelectionRow key={sel.item.id} selection={sel} onUpdate={onUpdateSelection} onRemove={() => onToggle(sel.item)} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function SelectionRow({
    selection, onUpdate, onRemove,
}: {
    selection: FitUpSelection;
    onUpdate: (itemId: string, patch: Partial<Omit<FitUpSelection, 'item'>>) => void;
    onRemove: () => void;
}) {
    const { item, quantity, priceOverride, quoteNote } = selection;
    const catalogSell = resolveFitUpSell(item);
    const unit = resolveFitUpUnitSell(selection);
    const line = resolveFitUpLineSell(selection);
    const isOverridden = priceOverride != null;

    // Local input draft for the override — saves on blur so each
    // keystroke doesn't race with the live state.
    const [overrideDraft, setOverrideDraft] = useState<string>(priceOverride != null ? String(priceOverride) : '');
    const [noteDraft, setNoteDraft] = useState<string>(quoteNote ?? '');

    return (
        <div className="rounded-xl border bg-slate-50/40 p-3 space-y-2">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className={`${TIER_TONE[item.tier]} text-[9px] font-black uppercase tracking-widest`}>
                            {TIER_LABEL[item.tier]}
                        </Badge>
                        {item.category && (
                            <Badge variant="outline" className="text-[9px] font-semibold bg-white text-slate-700 border-slate-200">
                                {item.category}
                            </Badge>
                        )}
                    </div>
                    <p className="text-xs font-bold mt-1 truncate">{item.name}</p>
                </div>
                <div className="text-right shrink-0">
                    <p className="text-sm font-black tabular-nums text-primary">${line.toLocaleString()}</p>
                    <p className="text-[9px] text-muted-foreground">
                        {quantity} × ${unit.toLocaleString()}
                        {isOverridden && <span className="ml-1 text-amber-700 font-bold">(override)</span>}
                    </p>
                </div>
                <Button variant="ghost" size="icon" onClick={onRemove} className="h-7 w-7 rounded-lg text-destructive shrink-0" aria-label="Remove">
                    <X className="h-3.5 w-3.5" />
                </Button>
            </div>

            <div className="grid grid-cols-3 gap-2">
                {/* Qty stepper */}
                <div className="flex items-center gap-1">
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 rounded-lg shrink-0"
                        onClick={() => onUpdate(item.id, { quantity: Math.max(1, quantity - 1) })}
                        disabled={quantity <= 1}
                        aria-label="Decrease quantity"
                    >
                        <Minus className="h-3 w-3" />
                    </Button>
                    <Input
                        type="number"
                        min={1}
                        value={quantity}
                        onChange={e => {
                            const n = parseInt(e.target.value, 10);
                            onUpdate(item.id, { quantity: Number.isFinite(n) && n > 0 ? n : 1 });
                        }}
                        className="h-7 w-12 text-center rounded-lg tabular-nums px-1 text-xs"
                    />
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 rounded-lg shrink-0"
                        onClick={() => onUpdate(item.id, { quantity: quantity + 1 })}
                        aria-label="Increase quantity"
                    >
                        <Plus className="h-3 w-3" />
                    </Button>
                </div>

                {/* Price override */}
                <div className="relative">
                    <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={overrideDraft}
                        onChange={e => setOverrideDraft(e.target.value)}
                        onBlur={() => {
                            const trimmed = overrideDraft.trim();
                            if (trimmed === '') {
                                onUpdate(item.id, { priceOverride: null });
                                return;
                            }
                            const n = parseFloat(trimmed);
                            if (!Number.isFinite(n) || n < 0) {
                                setOverrideDraft(priceOverride != null ? String(priceOverride) : '');
                                return;
                            }
                            onUpdate(item.id, { priceOverride: n });
                        }}
                        placeholder={`Catalog: ${catalogSell.toLocaleString()}`}
                        className="h-7 pl-6 rounded-lg tabular-nums text-xs"
                        title="Per-quote unit price override. Leave blank to use catalog price."
                    />
                </div>

                {/* Quote-note */}
                <div className="relative">
                    <StickyNote className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    <Input
                        type="text"
                        value={noteDraft}
                        onChange={e => setNoteDraft(e.target.value)}
                        onBlur={() => onUpdate(item.id, { quoteNote: noteDraft.trim() || null })}
                        placeholder="Per-quote note (operator-only)"
                        className="h-7 pl-6 rounded-lg text-xs"
                    />
                </div>
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

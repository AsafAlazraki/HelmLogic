
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
import { collection } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Wrench, Check, Loader2, Search, Package, Plus, Minus, DollarSign, StickyNote, X, ChevronDown, Sparkles } from 'lucide-react';
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
    /** v1.11 expansion-2 — package-level sell-price override. When set,
     *  selecting the package on a quote charges THIS amount rather than
     *  the sum of member items' sell prices. Operators use this for
     *  bundled-discount packages ("Coastal Setup — $1,200 all-in"). The
     *  override flows through to each line as a proportional discount
     *  at finalize time so margin still allocates per item. Null = sum
     *  of members (current behaviour). */
    packagePrice?: number | null;
    /** v1.11 follow-up — marks a tier-defining bundle (Simple / Medium /
     *  Complex). These render as the LARGE primary cards at the top of
     *  Step 5; the rest of the catalog drops into a "Custom Fit-Up"
     *  section below for à-la-carte additions. */
    isTierPackage?: boolean;
    tier?: Tier;
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
     *  package against the live catalog before invoking. `packagePrice`
     *  is the optional package-level override — when non-null, callers
     *  distribute it proportionally across the member items as a
     *  priceOverride per line (see highfield-quote-flow.addFitUpPackage). */
    onAddPackage: (items: FitUpItem[], packagePrice: number | null) => void;
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

    // Plain collection() (no orderBy) — the composite `tier`+`name` orderBy
    // requires a Firestore index that isn't deployed, AND orderBy silently
    // excludes docs missing that field (documented CLAUDE.md lesson). We
    // sort client-side in `filtered` below instead.
    const itemsRef = useMemoFirebase(
        () => collection(firestore, 'organisations', organisationId, 'fitUpItems'),
        [firestore, organisationId],
    );
    const { data: items, isLoading } = useCollection<FitUpItem>(itemsRef);

    const packagesRef = useMemoFirebase(
        () => collection(firestore, 'organisations', organisationId, 'fitUpPackages'),
        [firestore, organisationId],
    );
    const { data: packages } = useCollection<FitUpPackage>(packagesRef);

    const [categoryFilter, setCategoryFilter] = useState<string | 'all'>('all');
    const [search, setSearch] = useState('');
    // The custom-items section is collapsed by default — packages are the
    // primary surface. Auto-opens once the operator picks any item that
    // isn't part of a tier package (so their work stays visible).
    const [customOpen, setCustomOpen] = useState(false);

    const suggestedTier = useMemo(() => suggestedTierForMotorHp(motorHp), [motorHp]);

    // v1.11 Epic 9.2.1 — filter by assignment context first (multi-
    // level AND), then by tier chip + category chip + Suggested + search.
    const moduleFiltered = useMemo(() => {
        const list = items ?? [];
        const TIER_ORDER: Record<string, number> = { simple: 0, medium: 1, complex: 2 };
        return list
            .filter(item => itemMatchesContext(item, { moduleId, vendorId, rangeId, modelId, variantId }))
            .sort((a, b) => {
                // Client-side sort: tier asc, then name asc (replaces the
                // Firestore orderBy that broke the query — see CLAUDE.md).
                const t = (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9);
                return t !== 0 ? t : (a.name ?? '').localeCompare(b.name ?? '');
            });
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
        if (categoryFilter !== 'all') {
            list = list.filter(i => (i.category ?? '').trim().toLowerCase() === categoryFilter.toLowerCase());
        }
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
    }, [moduleFiltered, categoryFilter, search]);

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

    // Tier packages render as 3 big primary cards in fixed Simple → Medium
    // → Complex order. Anything else is a "bonus" package shown under them.
    const tierPackages = useMemo(() => {
        const byTier = new Map<Tier, FitUpPackage>();
        for (const p of relevantPackages) {
            if (p.isTierPackage && p.tier && TIERS.includes(p.tier)) byTier.set(p.tier, p);
        }
        return TIERS.map(t => byTier.get(t) ?? null);
    }, [relevantPackages]);
    const bonusPackages = useMemo(
        () => relevantPackages.filter(p => !p.isTierPackage),
        [relevantPackages],
    );

    if (isLoading) {
        return (
            <div className="flex justify-center py-12">
                <Loader2 className="animate-spin h-6 w-6 text-primary" />
            </div>
        );
    }

    if (moduleFiltered.length === 0) {
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
            <div className="flex items-center gap-3 bg-primary px-4 sm:px-6 py-3 rounded-2xl shadow-xl w-full min-w-0">
                <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse shrink-0" />
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white flex items-center gap-2 min-w-0">
                    <Wrench className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">Fit-Up & Rigging</span>
                </h3>
                {suggestedTier && (
                    <Badge variant="secondary" className="ml-auto bg-white/15 text-white border-white/20 text-[8px] font-black uppercase tracking-widest gap-1">
                        <Sparkles className="h-2.5 w-2.5" /> {TIER_LABEL[suggestedTier]} suggested
                    </Badge>
                )}
            </div>

            {/* PRIMARY — 3 big tier package cards. Pick one. */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
                {tierPackages.map((pkg, idx) => {
                    const tier = TIERS[idx];
                    if (!pkg) {
                        return (
                            <div key={tier} className="rounded-2xl border-2 border-dashed border-slate-200 p-4 bg-slate-50/40 flex flex-col gap-2 opacity-60">
                                <Badge variant="outline" className={`${TIER_TONE[tier]} text-[9px] font-black uppercase tracking-widest w-fit`}>
                                    {TIER_LABEL[tier]} fit-up
                                </Badge>
                                <p className="text-[10px] font-bold text-slate-500 italic">Not configured for this org yet — add a {TIER_LABEL[tier].toLowerCase()} package in Manage → Fit-Up Catalog → Packages.</p>
                            </div>
                        );
                    }
                    return (
                        <TierPackageCard
                            key={pkg.id}
                            pkg={pkg}
                            tier={tier}
                            isSuggested={suggestedTier === tier}
                            itemById={itemById}
                            selectedSet={selectedSet}
                            onAddPackage={onAddPackage}
                        />
                    );
                })}
            </div>

            {/* Bonus packages — non-tier curated bundles (e.g. Coastal Setup) */}
            {bonusPackages.length > 0 && (
                <div className="rounded-2xl border-2 bg-slate-50/40 p-3 sm:p-4 space-y-2">
                    <div className="flex items-center gap-2">
                        <Package className="h-3.5 w-3.5 text-slate-700" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-700">Bonus bundles — add on top of any tier</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {bonusPackages.map(pkg => {
                            const resolvedItems = pkg.itemIds.map(id => itemById.get(id)).filter(Boolean) as FitUpItem[];
                            const allOn = resolvedItems.length > 0 && resolvedItems.every(i => selectedSet.has(i.id));
                            const catalogTotal = resolvedItems.reduce((a, i) => a + resolveFitUpSell(i), 0);
                            const hasPackagePrice = pkg.packagePrice != null && pkg.packagePrice >= 0;
                            const displayTotal = hasPackagePrice ? pkg.packagePrice! : catalogTotal;
                            return (
                                <button
                                    key={pkg.id}
                                    type="button"
                                    onClick={() => onAddPackage(resolvedItems, hasPackagePrice ? pkg.packagePrice! : null)}
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
                                            {resolvedItems.length} item{resolvedItems.length === 1 ? '' : 's'} · ${displayTotal.toLocaleString()}
                                            {hasPackagePrice && (
                                                <span className={cn('ml-1 font-bold', allOn ? 'text-amber-200' : 'text-amber-700')} title="Bundle price overrides catalog sum">
                                                    (bundle)
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                    {allOn && <Check className="h-3 w-3" />}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* CUSTOM section — à-la-carte items. Collapsed by default
                (matches the "pick one of three packages" primary flow), opens
                when the operator wants to add or replace individual items. */}
            <div className="rounded-2xl border-2 overflow-hidden">
                <button
                    type="button"
                    onClick={() => setCustomOpen(o => !o)}
                    className={cn(
                        'w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors',
                        customOpen ? 'bg-primary text-white' : 'bg-white hover:bg-slate-50',
                    )}
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <Wrench className="h-3.5 w-3.5 shrink-0" />
                        <span className="text-[10px] font-black uppercase tracking-[0.25em] truncate">Custom Fit-Up — pick individual items</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <span className={cn('text-[9px] font-black uppercase tracking-widest', customOpen ? 'text-white/70' : 'text-muted-foreground')}>
                            {moduleFiltered.length} item{moduleFiltered.length === 1 ? '' : 's'} available
                        </span>
                        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', customOpen && 'rotate-180')} />
                    </div>
                </button>

                {customOpen && (
                    <div className="p-3 sm:p-4 space-y-3 bg-slate-50/40 border-t-2">
                        {/* Search + category chips — only when custom is open */}
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
                                <button onClick={() => setCategoryFilter('all')} className={cn('rounded-full px-2.5 py-0.5 text-[10px] font-bold border', categoryFilter === 'all' ? 'bg-primary text-white border-primary' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-400')}>
                                    All
                                </button>
                                {categories.map(cat => (
                                    <button key={cat} onClick={() => setCategoryFilter(cat)} className={cn('rounded-full px-2.5 py-0.5 text-[10px] font-bold border', categoryFilter === cat ? 'bg-primary text-white border-primary' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-400')}>
                                        {cat}
                                    </button>
                                ))}
                            </div>
                        )}

                        {filtered.length === 0 ? (
                            <div className="py-10 text-center border-2 border-dashed rounded-xl opacity-50">
                                <Search className="h-6 w-6 mx-auto mb-2 opacity-50" />
                                <p className="text-[10px] text-muted-foreground">No items match the current filters.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                                {filtered.map(item => {
                                    const isSelected = selectedSet.has(item.id);
                                    const sell = resolveFitUpSell(item);
                                    return (
                                        <button
                                            key={item.id}
                                            onClick={() => onToggle(item)}
                                            className={cn(
                                                'flex flex-col border-2 rounded-[1.5rem] overflow-hidden transition-all bg-white shadow-md border-transparent h-full p-1 relative text-left',
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
                    </div>
                )}
            </div>

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

function TierPackageCard({
    pkg, tier, isSuggested, itemById, selectedSet, onAddPackage,
}: {
    pkg: FitUpPackage;
    tier: Tier;
    isSuggested: boolean;
    itemById: Map<string, FitUpItem>;
    selectedSet: Set<string>;
    onAddPackage: (items: FitUpItem[], packagePrice: number | null) => void;
}) {
    const resolvedItems = pkg.itemIds
        .map(id => itemById.get(id))
        .filter(Boolean) as FitUpItem[];
    const allOn = resolvedItems.length > 0 && resolvedItems.every(i => selectedSet.has(i.id));
    const someOn = !allOn && resolvedItems.some(i => selectedSet.has(i.id));
    const catalogTotal = resolvedItems.reduce((a, i) => a + resolveFitUpSell(i), 0);
    const hasOverride = pkg.packagePrice != null && pkg.packagePrice >= 0;
    const displayTotal = hasOverride ? pkg.packagePrice! : catalogTotal;

    return (
        <button
            type="button"
            onClick={() => onAddPackage(resolvedItems, hasOverride ? pkg.packagePrice! : null)}
            className={cn(
                'group relative flex flex-col text-left border-4 rounded-[1.75rem] overflow-hidden transition-all bg-white shadow-xl p-5 gap-3 min-h-[16rem]',
                allOn
                    ? 'border-primary ring-4 ring-primary/15 bg-primary/5'
                    : someOn
                        ? 'border-primary/40 ring-2 ring-primary/10'
                        : 'border-transparent hover:border-primary/30 hover:shadow-2xl',
            )}
        >
            {isSuggested && !allOn && (
                <div className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-amber-400 text-amber-950 rounded-full px-2.5 py-1 shadow-md">
                    <Sparkles className="h-3 w-3" />
                    <span className="text-[8px] font-black uppercase tracking-widest">Suggested</span>
                </div>
            )}
            {allOn && (
                <div className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-primary text-white rounded-full px-2.5 py-1 shadow-md">
                    <Check className="h-3 w-3" />
                    <span className="text-[8px] font-black uppercase tracking-widest">All Added</span>
                </div>
            )}
            <div className="flex items-center gap-2">
                <Badge variant="outline" className={`${TIER_TONE[tier]} text-[9px] font-black uppercase tracking-widest`}>
                    {TIER_LABEL[tier]} fit-up
                </Badge>
                {someOn && !allOn && (
                    <Badge variant="outline" className="text-[8px] font-black uppercase border-primary/40 text-primary/70">
                        Partial
                    </Badge>
                )}
            </div>
            <h4 className={cn('text-base sm:text-lg font-black uppercase tracking-tight leading-tight', allOn ? 'text-primary' : 'text-slate-900')}>
                {pkg.name}
            </h4>
            {pkg.description && (
                <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-3">
                    {pkg.description}
                </p>
            )}
            <div className="mt-auto pt-3 border-t border-dashed flex items-end justify-between gap-2">
                <div className="flex flex-col">
                    <span className="text-[8px] font-black uppercase tracking-[0.25em] text-muted-foreground">
                        {resolvedItems.length} item{resolvedItems.length === 1 ? '' : 's'} included
                    </span>
                    <p className={cn('font-black italic text-xl tabular-nums', allOn ? 'text-primary' : 'text-slate-800')}>
                        ${displayTotal.toLocaleString()}
                    </p>
                    {hasOverride && (
                        <span className="text-[8px] font-black uppercase tracking-widest text-amber-700">
                            Bundle price · saves ${(catalogTotal - displayTotal).toLocaleString()}
                        </span>
                    )}
                </div>
                <div className={cn('flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest', allOn ? 'text-primary' : 'text-slate-500 group-hover:text-primary transition-colors')}>
                    {allOn ? <>Selected</> : <>Pick this<ChevronDown className="h-3 w-3 -rotate-90" /></>}
                </div>
            </div>
        </button>
    );
}

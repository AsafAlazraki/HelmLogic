'use client';

/**
 * TrailerCatalogPicker — lets a quote user pick a trailer from any trailers module
 * visible to their org, producing a snapshot that shadows model.trailerConfig.
 *
 * The component loads modules with moduleType === 'trailers', then walks the
 * data-warehouse/{brandId}/series/{seriesId}/trailers tree per-brand/per-series.
 * On select, it emits a TrailerSnapshot that the quote flow stores verbatim
 * (so quote totals don't drift if catalog data changes later).
 */

import { useMemo, useState } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Truck, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TrailerSnapshot {
    id: string;                    // `${brandVendorId}/${seriesId}/${trailerId}` for provenance
    brandVendorId: string;
    brandName: string;
    seriesId: string;
    seriesName: string;
    trailerId: string;
    code: string;
    name: string;
    imageUrl?: string;
    sellPriceExclGst: number;
    cost?: number;
    priceLevels?: Record<string, number>;
    pricingDetail?: Record<string, any>;
    specifications?: Record<string, any>;
    options: Array<{
        id: string;
        name: string;
        description?: string;
        sellPriceExclGst: number;
        cost?: number;
        isStandard?: boolean;
    }>;
    capturedAt: number;
}

interface Vendor {
    id: string;
    name: string;
    shortCode?: string;
    logoUrl?: string;
}

interface Series {
    id: string;
    name: string;
    order?: number;
    coverImageUrl?: string;
}

interface Trailer {
    id: string;
    code: string;
    name: string;
    imageUrl?: string;
    sellPriceExclGst?: number;
    cost?: number;
    priceLevels?: Record<string, number>;
    pricingDetail?: Record<string, any>;
    specifications?: Record<string, any>;
    optionalFeatures?: Array<{
        id: string;
        name: string;
        description?: string;
        sellExclGst: number;
        cost?: number;
    }>;
}

interface TrailersModule {
    id: string;
    name: string;
    trailerBrandVendorIds?: string[];
}

function trailerToSnapshot(
    t: Trailer,
    brand: Vendor,
    series: Series,
    overridePrice?: number | null,
): TrailerSnapshot {
    const sourceSell = t.sellPriceExclGst ?? 0;
    const effectiveSell = typeof overridePrice === 'number' ? overridePrice : sourceSell;
    return {
        id: `${brand.id}/${series.id}/${t.id}`,
        brandVendorId: brand.id,
        brandName: brand.name,
        seriesId: series.id,
        seriesName: series.name,
        trailerId: t.id,
        code: t.code,
        name: t.name,
        imageUrl: t.imageUrl,
        sellPriceExclGst: effectiveSell,
        cost: t.cost,
        priceLevels: t.priceLevels,
        pricingDetail: t.pricingDetail,
        specifications: t.specifications,
        options: (t.optionalFeatures || []).map(f => ({
            id: f.id,
            name: f.name,
            description: f.description,
            sellPriceExclGst: f.sellExclGst ?? 0,
            cost: f.cost,
            isStandard: false,
        })),
        capturedAt: Date.now(),
    };
}

function SeriesTrailersLoader({
    brand,
    series,
    search,
    onPick,
    selectedKey,
    overrides,
}: {
    brand: Vendor;
    series: Series;
    search: string;
    onPick: (snap: TrailerSnapshot) => void;
    selectedKey?: string;
    overrides: Record<string, number>;
}) {
    const firestore = useFirestore();
    const q = useMemoFirebase(
        () => collection(firestore, `data-warehouse/${brand.id}/series/${series.id}/trailers`),
        [firestore, brand.id, series.id],
    );
    const { data: trailers } = useCollection<Trailer>(q);

    const filtered = useMemo(() => {
        const list = trailers || [];
        const s = search.trim().toLowerCase();
        if (!s) return list;
        return list.filter(t =>
            (t.code || '').toLowerCase().includes(s) ||
            (t.name || '').toLowerCase().includes(s),
        );
    }, [trailers, search]);

    if (!filtered.length) return null;

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 sticky top-0 bg-white py-1 z-10">
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">{series.name}</span>
                <Badge variant="outline" className="h-4 text-[8px] font-bold">{filtered.length}</Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {filtered.map(t => {
                    const key = `${brand.id}/${series.id}/${t.id}`;
                    const selected = selectedKey === key;
                    const overridePrice = overrides[t.id];
                    const effectiveSell = typeof overridePrice === 'number' ? overridePrice : (t.sellPriceExclGst ?? 0);
                    const hasOverride = typeof overridePrice === 'number' && overridePrice !== (t.sellPriceExclGst ?? 0);
                    return (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => onPick(trailerToSnapshot(t, brand, series, overridePrice))}
                            className={cn(
                                'flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all',
                                selected ? 'border-primary bg-primary/5 shadow-md' : 'border-slate-100 hover:border-primary/30 bg-white',
                            )}
                        >
                            <div className="h-12 w-16 rounded-md bg-slate-50 shrink-0 flex items-center justify-center overflow-hidden">
                                {t.imageUrl
                                    ? <img src={t.imageUrl} alt={t.code} className="w-full h-full object-contain" />
                                    : <Truck className="h-5 w-5 text-slate-300" />}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-black uppercase tracking-tight truncate">{t.code}</p>
                                <p className="text-[9px] font-semibold text-slate-500 truncate">{t.name}</p>
                            </div>
                            <div className="text-right shrink-0">
                                <p className={cn('text-[10px] font-black', hasOverride ? 'text-amber-700' : 'text-primary')}>
                                    ${effectiveSell.toLocaleString()}
                                </p>
                                {hasOverride && (
                                    <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">Org Price</p>
                                )}
                                {!hasOverride && (t.optionalFeatures?.length ?? 0) > 0 && (
                                    <p className="text-[8px] text-slate-400 font-bold">+{t.optionalFeatures!.length} opts</p>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function BrandTrailersLoader({
    brand,
    search,
    onPick,
    selectedKey,
    overrides,
}: {
    brand: Vendor;
    search: string;
    onPick: (snap: TrailerSnapshot) => void;
    selectedKey?: string;
    overrides: Record<string, number>;
}) {
    const firestore = useFirestore();
    const q = useMemoFirebase(
        () => collection(firestore, `data-warehouse/${brand.id}/series`),
        [firestore, brand.id],
    );
    const { data: series } = useCollection<Series>(q);

    const sorted = useMemo(() => {
        const list = (series || []).slice();
        list.sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name));
        return list;
    }, [series]);

    if (!sorted.length) return null;

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 border-b-2 border-slate-900 pb-1">
                {brand.logoUrl && <img src={brand.logoUrl} alt={brand.name} className="h-6 w-auto object-contain" />}
                <span className="text-xs font-black uppercase tracking-widest">{brand.name}</span>
            </div>
            <div className="space-y-4">
                {sorted.map(s => (
                    <SeriesTrailersLoader
                        key={s.id}
                        brand={brand}
                        series={s}
                        search={search}
                        onPick={onPick}
                        selectedKey={selectedKey}
                        overrides={overrides}
                    />
                ))}
            </div>
        </div>
    );
}

export function TrailerCatalogPicker({
    orgId,
    value,
    onChange,
    triggerLabel = 'Pick from Catalog',
    associatedModuleIds,
}: {
    orgId: string | null | undefined;
    value: TrailerSnapshot | null;
    onChange: (snap: TrailerSnapshot | null) => void;
    triggerLabel?: string;
    /**
     * When the calling module (e.g. a boat module) has specific
     * trailer modules linked via `associatedModuleIds`, pass them here
     * and the picker will narrow its catalog to those modules only.
     * When empty / undefined the picker shows every trailer module
     * in the org (legacy behaviour).
     */
    associatedModuleIds?: string[];
}) {
    const firestore = useFirestore();
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');

    const trailerModulesQuery = useMemoFirebase(
        () => query(collection(firestore, 'modules'), where('moduleType', '==', 'trailers')),
        [firestore],
    );
    const { data: allTrailerModules } = useCollection<TrailersModule>(trailerModulesQuery);

    // Narrow to associated trailer modules when the caller supplied them,
    // otherwise fall back to every trailer module in the org.
    const trailerModules = useMemo(() => {
        if (!allTrailerModules) return [];
        if (!associatedModuleIds || associatedModuleIds.length === 0) return allTrailerModules;
        const allow = new Set(associatedModuleIds);
        const narrowed = allTrailerModules.filter(m => allow.has(m.id));
        // If the associated list doesn't actually reference any trailers
        // module (e.g. links point at rego / motor modules only), fall
        // back to showing everything so the picker is never empty.
        return narrowed.length > 0 ? narrowed : allTrailerModules;
    }, [allTrailerModules, associatedModuleIds]);

    // Collect unique brand vendor IDs across visible trailer modules
    const brandVendorIds = useMemo(() => {
        const ids = new Set<string>();
        (trailerModules || []).forEach(m => (m.trailerBrandVendorIds || []).forEach(id => ids.add(id)));
        return Array.from(ids);
    }, [trailerModules]);

    // Load vendor docs for those brands (cap 30 per Firestore `in` limit)
    const brandsQuery = useMemoFirebase(() => {
        if (!brandVendorIds.length) return null;
        return query(
            collection(firestore, 'data-warehouse'),
            where('__name__', 'in', brandVendorIds.slice(0, 30)),
        );
    }, [firestore, brandVendorIds]);
    const { data: brands } = useCollection<Vendor>(brandsQuery);

    const brandsSorted = useMemo(() => {
        const list = (brands || []).slice();
        list.sort((a, b) => a.name.localeCompare(b.name));
        return list;
    }, [brands]);

    // Org-level trailer price overrides — subscribed once and merged into picks
    const overridesQuery = useMemoFirebase(
        () => (orgId ? collection(firestore, `organisations/${orgId}/trailerOverrides`) : null),
        [firestore, orgId],
    );
    const { data: overrideDocs } = useCollection<{ sellPriceExclGst?: number; trailerId?: string }>(overridesQuery);
    const overridesByTrailerId = useMemo(() => {
        const map: Record<string, number> = {};
        (overrideDocs || []).forEach(d => {
            if (typeof d.sellPriceExclGst === 'number') map[d.id] = d.sellPriceExclGst;
        });
        return map;
    }, [overrideDocs]);

    const selectedKey = value?.id;

    return (
        <>
            <div className="flex items-center gap-2">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-xl font-black uppercase text-[10px] tracking-widest border-2"
                    onClick={() => setOpen(true)}
                >
                    <Truck className="h-3.5 w-3.5 mr-2" />
                    {value ? 'Change Trailer' : triggerLabel}
                </Button>
                {value && (
                    <>
                        <Badge variant="outline" className="font-black text-[9px] uppercase tracking-widest">
                            {value.brandName} · {value.code}
                        </Badge>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[9px] font-black uppercase"
                            onClick={() => onChange(null)}
                        >
                            <X className="h-3 w-3 mr-1" /> Clear
                        </Button>
                    </>
                )}
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-3xl max-h-[85vh] p-0 overflow-hidden flex flex-col">
                    <DialogHeader className="p-6 pb-3 border-b">
                        <DialogTitle className="text-lg font-black uppercase tracking-tight">Trailer Catalog</DialogTitle>
                        <DialogDescription>
                            Pick any trailer from the brands assigned to your trailers module.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="px-6 pt-4 pb-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="Search by code or name (e.g. RE1213)"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="pl-9 h-11 rounded-xl border-2 font-bold"
                            />
                        </div>
                    </div>
                    <ScrollArea className="flex-1 px-6 pb-6">
                        <div className="space-y-6">
                            {!orgId && (
                                <p className="text-xs text-slate-500 italic">Sign-in required to browse the catalog.</p>
                            )}
                            {orgId && !trailerModules && (
                                <p className="text-xs text-slate-500 italic">Loading trailer modules…</p>
                            )}
                            {orgId && trailerModules && trailerModules.length === 0 && (
                                <p className="text-xs text-slate-500 italic">
                                    No trailers module configured. Create one at /modules/add.
                                </p>
                            )}
                            {orgId && brandsSorted.length === 0 && (trailerModules?.length ?? 0) > 0 && (
                                <p className="text-xs text-slate-500 italic">
                                    Trailers module has no brands assigned. Edit the module to select trailer brand vendors.
                                </p>
                            )}
                            {brandsSorted.map(b => (
                                <BrandTrailersLoader
                                    key={b.id}
                                    brand={b}
                                    search={search}
                                    onPick={snap => {
                                        onChange(snap);
                                        setOpen(false);
                                    }}
                                    selectedKey={selectedKey}
                                    overrides={overridesByTrailerId}
                                />
                            ))}
                        </div>
                    </ScrollArea>
                </DialogContent>
            </Dialog>
        </>
    );
}

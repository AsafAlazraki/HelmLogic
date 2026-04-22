'use client';

import { useState, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { collection, doc, getDocs, updateDoc } from 'firebase/firestore';
import { useFirestore, useStorage } from '@/firebase/provider';
import { uploadFileToStorage } from '@/firebase/storage';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Truck,
    Search,
    ChevronDown,
    ArrowUpDown,
    Ruler,
    Info,
    Package,
    DollarSign,
    Layers,
    ImagePlus,
    Link2,
    Loader2,
    Trash2,
    Pencil,
    Plus,
    X,
    Check,
    LayoutGrid,
    Rows3,
} from 'lucide-react';
import { formatCurrency } from '@/lib/currency-utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Vendor {
    id: string;
    name: string;
    vendorType?: string;
    logoUrl?: string;
    shortCode?: string;
}

interface TrailerRow {
    id: string;
    vendorId: string;
    vendorName: string;
    seriesId: string;
    seriesName: string;
    code: string;
    name: string;
    supplier?: string;
    imageUrl?: string;
    isActive?: boolean;
    features?: string[];
    cost?: number;
    sellPriceExclGst?: number;
    specifications?: {
        boatSizeMtr?: number | null;
        wheelSize?: string;
        tareKg?: number | null;
        atmKg?: number | null;
        winch?: string;
        betweenGuardsMm?: number | null;
        lengthMtr?: number | null;
        plug?: string;
    };
    pricingDetail?: Record<string, any>;
    optionalFeatures?: Array<{ id: string; name: string; description: string; cost: number; sellExclGst: number }>;
}

interface TrailerDashboardProps {
    vendors: Vendor[];
    moduleName?: string;
    organisationId?: string;
    isAdmin?: boolean;
}

type SortKey = 'code' | 'boat' | 'price';
type SortDir = 'asc' | 'desc';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BOAT_SIZE_RANGES = ['Under 4m', '4–5m', '5–6m', '6–7m', '7m+', 'Unknown'] as const;
type BoatSizeRange = typeof BOAT_SIZE_RANGES[number];

function getBoatSizeRange(mtr?: number | null): BoatSizeRange {
    if (!mtr || mtr <= 0) return 'Unknown';
    if (mtr < 4) return 'Under 4m';
    if (mtr < 5) return '4–5m';
    if (mtr < 6) return '5–6m';
    if (mtr < 7) return '6–7m';
    return '7m+';
}

// ---------------------------------------------------------------------------
// Image subcomponent with onError fallback
// ---------------------------------------------------------------------------

function TrailerImage({
    src,
    alt,
    fallback,
    className,
}: {
    src?: string;
    alt: string;
    fallback: ReactNode;
    className?: string;
}) {
    const [failed, setFailed] = useState(false);
    useEffect(() => { setFailed(false); }, [src]);
    if (!src || failed) return <>{fallback}</>;
    return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function TrailerDashboard({ vendors, moduleName, isAdmin }: TrailerDashboardProps) {
    const firestore = useFirestore();
    const storage = useStorage();
    const { toast } = useToast();

    // Flat trailer list aggregated across all selected brand vendors.
    const [trailers, setTrailers] = useState<TrailerRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const vendorKey = useMemo(() => vendors.map(v => v.id).sort().join('|'), [vendors]);

    const loadTrailers = useCallback(async () => {
        if (vendors.length === 0) {
            setTrailers([]);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        const all: TrailerRow[] = [];

        for (const vendor of vendors) {
            try {
                const seriesSnap = await getDocs(collection(firestore, `data-warehouse/${vendor.id}/series`));
                for (const seriesDoc of seriesSnap.docs) {
                    const seriesName = (seriesDoc.data() as any).name || seriesDoc.id;
                    const trailersSnap = await getDocs(
                        collection(firestore, `data-warehouse/${vendor.id}/series/${seriesDoc.id}/trailers`)
                    );
                    for (const td of trailersSnap.docs) {
                        const data = td.data() as any;
                        all.push({
                            id: td.id,
                            vendorId: vendor.id,
                            vendorName: vendor.name,
                            seriesId: seriesDoc.id,
                            seriesName,
                            code: data.code || '',
                            name: data.name || '',
                            supplier: data.supplier,
                            imageUrl: data.imageUrl,
                            isActive: data.isActive,
                            features: data.features,
                            cost: data.cost,
                            sellPriceExclGst: data.sellPriceExclGst,
                            specifications: data.specifications,
                            pricingDetail: data.pricingDetail,
                            optionalFeatures: data.optionalFeatures,
                        });
                    }
                }
            } catch (e) {
                // One flaky vendor shouldn't break the dashboard — skip.
                console.warn(`[TrailerDashboard] Failed to load ${vendor.name}:`, e);
            }
        }

        setTrailers(all);
        setIsLoading(false);
    }, [firestore, vendorKey]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { loadTrailers(); }, [loadTrailers]);

    // -----------------------------------------------------------------------
    // Filters, sort
    // -----------------------------------------------------------------------

    const [search, setSearch] = useState('');
    const [brandFilter, setBrandFilter] = useState<string>('all');
    const [sizeFilter, setSizeFilter] = useState<BoatSizeRange | 'all'>('all');
    const [sortKey, setSortKey] = useState<SortKey>('code');
    const [sortDir, setSortDir] = useState<SortDir>('asc');
    const [viewMode, setViewMode] = useState<'cards' | 'table'>(() => {
        if (typeof window !== 'undefined') {
            const v = new URLSearchParams(window.location.search).get('trailerView');
            if (v === 'table' || v === 'cards') return v;
        }
        return 'cards';
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const url = new URL(window.location.href);
        if (viewMode === 'table') url.searchParams.set('trailerView', 'table');
        else url.searchParams.delete('trailerView');
        window.history.replaceState({}, '', url.toString());
    }, [viewMode]);

    const filtered = useMemo(() => {
        let list = [...trailers];

        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(t =>
                t.code.toLowerCase().includes(q) ||
                t.name.toLowerCase().includes(q) ||
                t.vendorName.toLowerCase().includes(q) ||
                t.seriesName.toLowerCase().includes(q) ||
                (t.supplier ? t.supplier.toLowerCase().includes(q) : false) ||
                (t.features || []).some(f => f.toLowerCase().includes(q))
            );
        }

        if (brandFilter !== 'all') {
            list = list.filter(t => t.vendorId === brandFilter);
        }

        if (sizeFilter !== 'all') {
            list = list.filter(t => getBoatSizeRange(t.specifications?.boatSizeMtr) === sizeFilter);
        }

        list.sort((a, b) => {
            let cmp = 0;
            switch (sortKey) {
                case 'code':
                    cmp = a.code.localeCompare(b.code);
                    break;
                case 'boat':
                    cmp = (a.specifications?.boatSizeMtr || 0) - (b.specifications?.boatSizeMtr || 0);
                    break;
                case 'price':
                    cmp = (a.sellPriceExclGst || 0) - (b.sellPriceExclGst || 0);
                    break;
            }
            return sortDir === 'asc' ? cmp : -cmp;
        });

        return list;
    }, [trailers, search, brandFilter, sizeFilter, sortKey, sortDir]);

    const grouped = useMemo(() => {
        const g: Record<BoatSizeRange, TrailerRow[]> = {
            'Under 4m': [], '4–5m': [], '5–6m': [], '6–7m': [], '7m+': [], 'Unknown': [],
        };
        for (const t of filtered) {
            g[getBoatSizeRange(t.specifications?.boatSizeMtr)].push(t);
        }
        return g;
    }, [filtered]);

    const availableSizeRanges = useMemo(() => {
        const found = new Set<BoatSizeRange>();
        for (const t of trailers) found.add(getBoatSizeRange(t.specifications?.boatSizeMtr));
        return BOAT_SIZE_RANGES.filter(r => found.has(r));
    }, [trailers]);

    const stats = useMemo(() => {
        const brands = new Set(trailers.map(t => t.vendorId));
        const series = new Set(trailers.map(t => `${t.vendorId}:${t.seriesId}`));
        const active = trailers.filter(t => t.isActive !== false).length;
        return {
            total: trailers.length,
            brands: brands.size,
            series: series.size,
            active,
        };
    }, [trailers]);

    function toggleSort(k: SortKey) {
        if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(k); setSortDir('asc'); }
    }

    const [selected, setSelected] = useState<TrailerRow | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);
    function openTrailer(t: TrailerRow) { setSelected(t); setDetailOpen(true); }

    // Update one trailer's imageUrl (or clear it) — writes to the master catalog doc
    // and patches the in-memory list so the new image renders immediately.
    const updateTrailerImage = useCallback(async (trailer: TrailerRow, imageUrl: string | null) => {
        const ref = doc(
            firestore,
            'data-warehouse',
            trailer.vendorId,
            'series',
            trailer.seriesId,
            'trailers',
            trailer.id,
        );
        try {
            await updateDoc(ref, { imageUrl: imageUrl ?? '' });
            const patch = (t: TrailerRow) =>
                t.id === trailer.id && t.vendorId === trailer.vendorId
                    ? { ...t, imageUrl: imageUrl ?? undefined }
                    : t;
            setTrailers(list => list.map(patch));
            setSelected(s => (s && s.id === trailer.id && s.vendorId === trailer.vendorId ? patch(s) : s));
            toast({ title: imageUrl ? 'Image updated' : 'Image removed' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Failed to update image', description: e.message });
            throw e;
        }
    }, [firestore, toast]);

    // Merge-update a trailer's editable fields (basic info, specs, features, options).
    // Writes a flat patch to the master catalog doc and mirrors to in-memory state.
    const updateTrailerFields = useCallback(async (trailer: TrailerRow, patchFields: Partial<TrailerRow>) => {
        const ref = doc(
            firestore,
            'data-warehouse',
            trailer.vendorId,
            'series',
            trailer.seriesId,
            'trailers',
            trailer.id,
        );
        // Strip fields that aren't part of the Firestore doc schema
        const { id: _id, vendorId: _v, vendorName: _vn, seriesId: _s, seriesName: _sn, ...writable } = patchFields as any;
        try {
            await updateDoc(ref, writable);
            const apply = (t: TrailerRow) =>
                t.id === trailer.id && t.vendorId === trailer.vendorId
                    ? { ...t, ...patchFields }
                    : t;
            setTrailers(list => list.map(apply));
            setSelected(s => (s && s.id === trailer.id && s.vendorId === trailer.vendorId ? apply(s) : s));
            toast({ title: 'Trailer updated' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Failed to save', description: e.message });
            throw e;
        }
    }, [firestore, toast]);

    const clearFilters = () => { setSearch(''); setBrandFilter('all'); setSizeFilter('all'); };
    const hasActiveFilters = search.trim() !== '' || brandFilter !== 'all' || sizeFilter !== 'all';

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    return (
        <div className="flex flex-col h-full">
            {/* Gradient header banner */}
            <div className="bg-gradient-to-r from-orange-500 to-amber-600 text-white px-6 py-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                        <h1 className="text-xl font-bold">{moduleName || 'Trailers'}</h1>
                        <p className="text-sm text-orange-50">
                            {isLoading
                                ? 'Loading catalog…'
                                : `${stats.total} trailer${stats.total === 1 ? '' : 's'} · ${stats.brands} brand${stats.brands === 1 ? '' : 's'} · ${stats.series} series`}
                        </p>
                    </div>
                    {!isLoading && stats.total > 0 && (
                        <div className="flex gap-2 text-xs">
                            <StatPill label="Total" value={stats.total.toString()} />
                            <StatPill label="Active" value={stats.active.toString()} />
                            <StatPill label="Brands" value={stats.brands.toString()} />
                        </div>
                    )}
                </div>
            </div>

            {/* Content */}
            <ScrollArea className="flex-1">
                <div className="p-6 space-y-6">
                    {/* Filter bar */}
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative flex-1 min-w-[220px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="Search by code, name, brand or series…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9"
                            />
                        </div>

                        {vendors.length > 1 && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" className="gap-1">
                                        {brandFilter === 'all' ? 'All brands' : vendors.find(v => v.id === brandFilter)?.name || 'Brand'}
                                        <ChevronDown className="h-3 w-3" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => setBrandFilter('all')}>
                                        All brands ({vendors.length})
                                    </DropdownMenuItem>
                                    {vendors.map(v => (
                                        <DropdownMenuItem key={v.id} onClick={() => setBrandFilter(v.id)}>
                                            {v.name}
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="gap-1">
                                    {sizeFilter === 'all' ? 'All sizes' : sizeFilter}
                                    <ChevronDown className="h-3 w-3" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setSizeFilter('all')}>All sizes</DropdownMenuItem>
                                {availableSizeRanges.map(r => (
                                    <DropdownMenuItem key={r} onClick={() => setSizeFilter(r)}>
                                        {r}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="gap-1">
                                    <ArrowUpDown className="h-3 w-3" />
                                    Sort: {sortKey} {sortDir === 'asc' ? '↑' : '↓'}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => toggleSort('code')}>Code</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => toggleSort('boat')}>Boat size</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => toggleSort('price')}>Price</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <div className="inline-flex rounded-md border bg-white ml-auto">
                            <button
                                type="button"
                                aria-label="Card view"
                                aria-pressed={viewMode === 'cards'}
                                onClick={() => setViewMode('cards')}
                                className={`px-2 py-1.5 rounded-l-md transition-colors ${
                                    viewMode === 'cards'
                                        ? 'bg-orange-500 text-white'
                                        : 'text-slate-500 hover:bg-slate-50'
                                }`}
                            >
                                <LayoutGrid className="h-3.5 w-3.5" />
                            </button>
                            <button
                                type="button"
                                aria-label="Table view"
                                aria-pressed={viewMode === 'table'}
                                onClick={() => setViewMode('table')}
                                className={`px-2 py-1.5 rounded-r-md border-l transition-colors ${
                                    viewMode === 'table'
                                        ? 'bg-orange-500 text-white'
                                        : 'text-slate-500 hover:bg-slate-50'
                                }`}
                            >
                                <Rows3 className="h-3.5 w-3.5" />
                            </button>
                        </div>

                        {hasActiveFilters && (
                            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs">
                                Clear
                            </Button>
                        )}
                    </div>

                    {/* Loading */}
                    {isLoading && (
                        <div className="flex items-center justify-center py-20 text-slate-400">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
                        </div>
                    )}

                    {/* No brands selected */}
                    {!isLoading && vendors.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-2">
                            <Truck className="h-12 w-12" />
                            <p className="text-sm font-medium">No trailer brands selected</p>
                            <p className="text-xs">Head to <b>Settings</b> and tick the brands this module sources from.</p>
                        </div>
                    )}

                    {/* Empty state */}
                    {!isLoading && vendors.length > 0 && filtered.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-2">
                            <Truck className="h-12 w-12" />
                            <p className="text-sm font-medium">
                                {trailers.length > 0 ? 'No trailers match your filters' : 'No trailer data found'}
                            </p>
                            {trailers.length > 0 && hasActiveFilters && (
                                <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>
                            )}
                        </div>
                    )}

                    {/* Grouped grid (no size filter active) */}
                    {!isLoading && filtered.length > 0 && viewMode === 'cards' && sizeFilter === 'all' && (
                        <>
                            {BOAT_SIZE_RANGES.map((range) => {
                                const group = grouped[range];
                                if (!group || group.length === 0) return null;
                                return (
                                    <div key={range}>
                                        <div className="flex items-center gap-2 mb-3">
                                            <Layers className="h-3 w-3 text-slate-400" />
                                            <h2 className="text-sm font-semibold text-slate-600">{range}</h2>
                                            <Badge variant="outline" className="text-[9px]">{group.length}</Badge>
                                        </div>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                            {group.map(t => (
                                                <TrailerCard key={`${t.vendorId}-${t.id}`} trailer={t} onClick={() => openTrailer(t)} />
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </>
                    )}

                    {/* Flat grid when filter narrows */}
                    {!isLoading && filtered.length > 0 && viewMode === 'cards' && sizeFilter !== 'all' && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                            {filtered.map(t => (
                                <TrailerCard key={`${t.vendorId}-${t.id}`} trailer={t} onClick={() => openTrailer(t)} />
                            ))}
                        </div>
                    )}

                    {/* Table view */}
                    {!isLoading && filtered.length > 0 && viewMode === 'table' && (
                        <TrailerTable
                            trailers={filtered}
                            onRowClick={openTrailer}
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onToggleSort={toggleSort}
                        />
                    )}
                </div>
            </ScrollArea>

            <TrailerDetailSheet
                trailer={selected}
                open={detailOpen}
                onOpenChange={setDetailOpen}
                storage={storage}
                isAdmin={!!isAdmin}
                onUpdateImage={updateTrailerImage}
                onUpdateFields={updateTrailerFields}
            />
        </div>
    );
}

// ---------------------------------------------------------------------------
// Stat pill
// ---------------------------------------------------------------------------

function StatPill({ label, value }: { label: string; value: string }) {
    return (
        <div className="bg-white/20 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-white/20">
            <span className="text-[10px] uppercase tracking-wider text-orange-50 mr-2">{label}</span>
            <span className="font-bold">{value}</span>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Trailer card
// ---------------------------------------------------------------------------

function TrailerCard({ trailer, onClick }: { trailer: TrailerRow; onClick: () => void }) {
    const price = trailer.sellPriceExclGst || 0;
    const atm = trailer.specifications?.atmKg;
    const len = trailer.specifications?.lengthMtr;
    const boat = trailer.specifications?.boatSizeMtr;
    const inactive = trailer.isActive === false;

    return (
        <Card
            className={`border-2 rounded-2xl overflow-hidden cursor-pointer hover:border-orange-400/60 hover:shadow-md transition-all ${inactive ? 'opacity-60' : ''}`}
            onClick={onClick}
        >
            <CardHeader className="h-28 bg-slate-50 flex items-center justify-center p-3 border-b">
                <TrailerImage
                    src={trailer.imageUrl}
                    alt={trailer.name}
                    className="h-full object-contain"
                    fallback={<Truck className="h-10 w-10 text-slate-300" />}
                />
            </CardHeader>
            <CardContent className="p-4 space-y-2">
                <div className="space-y-0.5">
                    <h3 className="text-xs font-bold truncate" title={trailer.name}>{trailer.code}</h3>
                    <p className="text-[10px] text-slate-500 truncate" title={trailer.name}>{trailer.name}</p>
                </div>
                <div className="flex items-center gap-1 text-[9px] text-slate-400">
                    <span className="font-medium uppercase tracking-wider">{trailer.vendorName}</span>
                    {trailer.seriesName && <span>· {trailer.seriesName}</span>}
                </div>
                <div className="flex gap-1 flex-wrap">
                    {boat != null && <Badge variant="outline" className="text-[9px]">{boat}m boat</Badge>}
                    {len != null && <Badge variant="outline" className="text-[9px]">{len}m</Badge>}
                    {atm != null && <Badge variant="outline" className="text-[9px]">{atm} ATM</Badge>}
                    {inactive && <Badge variant="outline" className="text-[9px] border-red-400 text-red-600">Inactive</Badge>}
                </div>
                {price > 0 && (
                    <p className="text-xs font-bold text-orange-600">
                        {formatCurrency(price)} <span className="text-[9px] font-normal text-slate-400">ex GST</span>
                    </p>
                )}
                {(trailer.optionalFeatures?.length ?? 0) > 0 && (
                    <p className="text-[9px] text-slate-400">{trailer.optionalFeatures!.length} factory option{trailer.optionalFeatures!.length === 1 ? '' : 's'}</p>
                )}
            </CardContent>
        </Card>
    );
}

// ---------------------------------------------------------------------------
// Table view
// ---------------------------------------------------------------------------

function TrailerTable({
    trailers,
    onRowClick,
    sortKey,
    sortDir,
    onToggleSort,
}: {
    trailers: TrailerRow[];
    onRowClick: (t: TrailerRow) => void;
    sortKey: SortKey;
    sortDir: SortDir;
    onToggleSort: (k: SortKey) => void;
}) {
    const arrow = (k: SortKey) => sortKey === k ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
    const Th = ({ children, onClick, className }: { children: ReactNode; onClick?: () => void; className?: string }) => (
        <th
            className={`text-left px-3 py-2 font-semibold text-[10px] uppercase tracking-wider text-slate-500 ${onClick ? 'cursor-pointer hover:text-slate-800' : ''} ${className || ''}`}
            onClick={onClick}
        >
            {children}
        </th>
    );

    return (
        <div className="border rounded-xl overflow-hidden bg-white">
            <div className="overflow-x-auto">
                <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b">
                        <tr>
                            <Th className="w-12">&nbsp;</Th>
                            <Th onClick={() => onToggleSort('code')}>Code{arrow('code')}</Th>
                            <Th>Name</Th>
                            <Th>Brand · Series</Th>
                            <Th onClick={() => onToggleSort('boat')}>Boat{arrow('boat')}</Th>
                            <Th>Length</Th>
                            <Th>ATM</Th>
                            <Th onClick={() => onToggleSort('price')} className="text-right">Sell (ex GST){arrow('price')}</Th>
                            <Th>Status</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {trailers.map(t => {
                            const inactive = t.isActive === false;
                            return (
                                <tr
                                    key={`${t.vendorId}-${t.id}`}
                                    onClick={() => onRowClick(t)}
                                    className={`border-b last:border-b-0 cursor-pointer hover:bg-orange-50/50 ${inactive ? 'opacity-60' : ''}`}
                                >
                                    <td className="px-3 py-2">
                                        <div className="h-8 w-10 bg-slate-50 rounded flex items-center justify-center overflow-hidden">
                                            <TrailerImage
                                                src={t.imageUrl}
                                                alt={t.name}
                                                className="h-full object-contain"
                                                fallback={<Truck className="h-4 w-4 text-slate-300" />}
                                            />
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 font-semibold">{t.code}</td>
                                    <td className="px-3 py-2 text-slate-700 max-w-[240px] truncate" title={t.name}>{t.name}</td>
                                    <td className="px-3 py-2 text-[10px] text-slate-500 uppercase tracking-wider">
                                        <span className="font-medium">{t.vendorName}</span>
                                        {t.seriesName && <span className="text-slate-400"> · {t.seriesName}</span>}
                                    </td>
                                    <td className="px-3 py-2">{t.specifications?.boatSizeMtr != null ? `${t.specifications.boatSizeMtr}m` : '—'}</td>
                                    <td className="px-3 py-2">{t.specifications?.lengthMtr != null ? `${t.specifications.lengthMtr}m` : '—'}</td>
                                    <td className="px-3 py-2">{t.specifications?.atmKg != null ? `${t.specifications.atmKg} kg` : '—'}</td>
                                    <td className="px-3 py-2 text-right font-semibold text-orange-600">
                                        {t.sellPriceExclGst ? formatCurrency(t.sellPriceExclGst) : <span className="text-slate-300 font-normal">—</span>}
                                    </td>
                                    <td className="px-3 py-2">
                                        {inactive ? (
                                            <Badge variant="outline" className="text-[9px] border-red-400 text-red-600">Inactive</Badge>
                                        ) : (
                                            <Badge variant="outline" className="text-[9px] border-green-400 text-green-600">Active</Badge>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Detail sheet
// ---------------------------------------------------------------------------

function TrailerDetailSheet({
    trailer,
    open,
    onOpenChange,
    storage,
    isAdmin,
    onUpdateImage,
    onUpdateFields,
}: {
    trailer: TrailerRow | null;
    open: boolean;
    onOpenChange: (v: boolean) => void;
    storage: ReturnType<typeof useStorage>;
    isAdmin: boolean;
    onUpdateImage: (trailer: TrailerRow, url: string | null) => Promise<void>;
    onUpdateFields: (trailer: TrailerRow, patch: Partial<TrailerRow>) => Promise<void>;
}) {
    const [isEditing, setIsEditing] = useState(false);
    // Reset edit mode whenever the selected trailer changes or sheet closes
    useEffect(() => { setIsEditing(false); }, [trailer?.id, trailer?.vendorId, open]);

    if (!trailer) return null;
    const specs = trailer.specifications || {};
    const pricing = trailer.pricingDetail || {};
    const options = trailer.optionalFeatures || [];

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="sm:max-w-lg overflow-y-auto">
                <SheetHeader className="pb-4">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <SheetTitle className="text-lg">{trailer.code}</SheetTitle>
                            <p className="text-xs text-slate-500">{trailer.name}</p>
                            <p className="text-[10px] text-slate-400 uppercase tracking-widest">
                                {trailer.vendorName}{trailer.seriesName ? ` · ${trailer.seriesName}` : ''}
                            </p>
                        </div>
                        {isAdmin && !isEditing && (
                            <Button variant="outline" size="sm" className="gap-1 shrink-0" onClick={() => setIsEditing(true)}>
                                <Pencil className="h-3 w-3" /> Edit
                            </Button>
                        )}
                    </div>
                </SheetHeader>

                <TrailerImageEditor
                    trailer={trailer}
                    storage={storage}
                    isAdmin={isAdmin}
                    onUpdateImage={onUpdateImage}
                />

                {isEditing && (
                    <TrailerEditForm
                        trailer={trailer}
                        onCancel={() => setIsEditing(false)}
                        onSave={async (patch) => {
                            await onUpdateFields(trailer, patch);
                            setIsEditing(false);
                        }}
                    />
                )}

                {!isEditing && (
                    <>

                <div className="flex gap-2 flex-wrap mb-6">
                    {trailer.sellPriceExclGst ? (
                        <Badge variant="default">{formatCurrency(trailer.sellPriceExclGst)} ex GST</Badge>
                    ) : null}
                    {trailer.cost ? (
                        <Badge variant="secondary">Cost {formatCurrency(trailer.cost)}</Badge>
                    ) : null}
                    {trailer.isActive === false && (
                        <Badge variant="outline" className="border-red-400 text-red-600">Inactive</Badge>
                    )}
                </div>

                {/* Specs */}
                <div className="mb-6">
                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-2">
                        <Ruler className="h-3 w-3" /> Specifications
                    </h4>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        {specs.boatSizeMtr != null && <div><span className="text-slate-400">Boat size:</span> <span className="font-medium">{specs.boatSizeMtr}m</span></div>}
                        {specs.lengthMtr != null && <div><span className="text-slate-400">Trailer length:</span> <span className="font-medium">{specs.lengthMtr}m</span></div>}
                        {specs.tareKg != null && <div><span className="text-slate-400">Tare:</span> <span className="font-medium">{specs.tareKg} kg</span></div>}
                        {specs.atmKg != null && <div><span className="text-slate-400">ATM:</span> <span className="font-medium">{specs.atmKg} kg</span></div>}
                        {specs.wheelSize && <div><span className="text-slate-400">Wheels:</span> <span className="font-medium">{specs.wheelSize}</span></div>}
                        {specs.winch && <div><span className="text-slate-400">Winch:</span> <span className="font-medium">{specs.winch}</span></div>}
                        {specs.betweenGuardsMm != null && <div><span className="text-slate-400">Guards:</span> <span className="font-medium">{specs.betweenGuardsMm} mm</span></div>}
                        {specs.plug && <div><span className="text-slate-400">Plug:</span> <span className="font-medium">{specs.plug}</span></div>}
                        {trailer.supplier && <div className="col-span-2"><span className="text-slate-400">Supplier:</span> <span className="font-medium">{trailer.supplier}</span></div>}
                    </div>
                </div>

                {/* Features */}
                {trailer.features && trailer.features.length > 0 && (
                    <div className="mb-6">
                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-2">
                            <Info className="h-3 w-3" /> Features
                        </h4>
                        <ul className="text-xs space-y-1 list-disc pl-4 text-slate-600">
                            {trailer.features.map((f, i) => (
                                <li key={i}>{f}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Factory options */}
                {options.length > 0 && (
                    <div className="mb-6">
                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-2">
                            <Package className="h-3 w-3" /> Factory Options ({options.length})
                        </h4>
                        <div className="space-y-2">
                            {options.map((opt) => (
                                <div key={opt.id} className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg bg-slate-50 text-xs">
                                    <div className="min-w-0">
                                        <p className="font-semibold truncate">{opt.name}</p>
                                        {opt.description && <p className="text-[10px] text-slate-500 truncate">{opt.description}</p>}
                                    </div>
                                    {opt.sellExclGst > 0 && (
                                        <span className="font-medium shrink-0">{formatCurrency(opt.sellExclGst)}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Pricing summary */}
                {Object.keys(pricing).length > 0 && (
                    <div className="mb-6">
                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-2">
                            <DollarSign className="h-3 w-3" /> Pricing Summary
                        </h4>
                        <div className="space-y-1 text-xs bg-slate-50 rounded-xl p-3">
                            {pricing.dealer != null && <WaterfallRow label="Dealer" value={pricing.dealer} />}
                            {pricing.nettPrice != null && <WaterfallRow label="Nett Price" value={pricing.nettPrice} />}
                            {pricing.freight != null && <WaterfallRow label="Freight" value={pricing.freight} />}
                            {pricing.landed != null && <WaterfallRow label="Landed" value={pricing.landed} />}
                            {pricing.totalPdCharges != null && <WaterfallRow label="PD Charges" value={pricing.totalPdCharges} />}
                            {pricing.totalNettCtd != null && <WaterfallRow label="Total Nett CTD" value={pricing.totalNettCtd} bold />}
                            {pricing.rrp != null && <WaterfallRow label="RRP" value={pricing.rrp} />}
                            {pricing.sell != null && <WaterfallRow label="Sell (ex GST)" value={pricing.sell} bold />}
                            {pricing.regoTypeHint && (
                                <div className="pt-1 mt-1 border-t text-[10px] text-slate-400">
                                    Rego hint: {pricing.regoTypeHint}{pricing.regoDollarsHint ? ` · ${formatCurrency(pricing.regoDollarsHint)}` : ''}
                                </div>
                            )}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2">Full waterfall editable in Pricing Manager.</p>
                    </div>
                )}
                </>
                )}
            </SheetContent>
        </Sheet>
    );
}

function WaterfallRow({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
    return (
        <div className={`flex items-center justify-between ${bold ? 'font-bold text-slate-800' : 'text-slate-600'}`}>
            <span>{label}</span>
            <span>{formatCurrency(value)}</span>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Trailer image editor — admin-only. Upload or paste URL.
// ---------------------------------------------------------------------------

function TrailerImageEditor({
    trailer,
    storage,
    isAdmin,
    onUpdateImage,
}: {
    trailer: TrailerRow;
    storage: ReturnType<typeof useStorage>;
    isAdmin: boolean;
    onUpdateImage: (t: TrailerRow, url: string | null) => Promise<void>;
}) {
    const [busy, setBusy] = useState(false);
    const [mode, setMode] = useState<'idle' | 'url'>('idle');
    const [urlInput, setUrlInput] = useState('');

    async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setBusy(true);
        try {
            const path = `trailers/${trailer.vendorId}/${trailer.id}/${Date.now()}-${file.name}`;
            const url = await uploadFileToStorage(storage, file, path);
            await onUpdateImage(trailer, url);
        } catch {
            // Toast is shown by onUpdateImage
        } finally {
            setBusy(false);
        }
    }

    async function handleSaveUrl() {
        const trimmed = urlInput.trim();
        if (!trimmed) return;
        setBusy(true);
        try {
            await onUpdateImage(trailer, trimmed);
            setMode('idle');
            setUrlInput('');
        } catch {
            // Toast is shown by onUpdateImage
        } finally {
            setBusy(false);
        }
    }

    async function handleRemove() {
        setBusy(true);
        try {
            await onUpdateImage(trailer, null);
        } catch {
            // Toast is shown by onUpdateImage
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="mb-6">
            <div className="relative h-40 bg-slate-50 rounded-xl flex items-center justify-center overflow-hidden group">
                <TrailerImage
                    src={trailer.imageUrl}
                    alt={trailer.name}
                    className="h-full object-contain"
                    fallback={<Truck className="h-16 w-16 text-slate-300" />}
                />
                {busy && (
                    <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
                    </div>
                )}
            </div>

            {isAdmin && (
                <div className="mt-2">
                    {mode === 'idle' ? (
                        <div className="flex gap-1 flex-wrap">
                            <Button variant="outline" size="sm" className="text-xs h-7 gap-1" disabled={busy}
                                onClick={(e) => (e.currentTarget.nextElementSibling as HTMLInputElement | null)?.click()}>
                                <ImagePlus className="h-3 w-3" />
                                {trailer.imageUrl ? 'Replace' : 'Upload'}
                            </Button>
                            <input type="file" accept="image/*" hidden onChange={handleFile} />
                            <Button variant="outline" size="sm" className="text-xs h-7 gap-1" disabled={busy}
                                onClick={() => { setMode('url'); setUrlInput(trailer.imageUrl || ''); }}>
                                <Link2 className="h-3 w-3" /> Paste URL
                            </Button>
                            {trailer.imageUrl && (
                                <Button variant="outline" size="sm"
                                    className="text-xs h-7 gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                                    disabled={busy} onClick={handleRemove}>
                                    <Trash2 className="h-3 w-3" /> Remove
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div className="flex gap-1">
                            <Input
                                autoFocus
                                className="h-7 text-xs"
                                placeholder="https://example.com/image.jpg"
                                value={urlInput}
                                onChange={(e) => setUrlInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveUrl();
                                    else if (e.key === 'Escape') { setMode('idle'); setUrlInput(''); }
                                }}
                            />
                            <Button size="sm" className="h-7 text-xs" disabled={busy || !urlInput.trim()} onClick={handleSaveUrl}>
                                Save
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setMode('idle'); setUrlInput(''); }}>
                                Cancel
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Trailer edit form — admin-only. Edits basic info, specs, features, options.
// Pricing waterfall is NOT edited here — that lives in the Pricing Manager.
// ---------------------------------------------------------------------------

interface EditableTrailerFields {
    code: string;
    name: string;
    supplier: string;
    isActive: boolean;
    features: string[];
    specifications: {
        boatSizeMtr: number | null;
        lengthMtr: number | null;
        tareKg: number | null;
        atmKg: number | null;
        wheelSize: string;
        winch: string;
        betweenGuardsMm: number | null;
        plug: string;
    };
    optionalFeatures: Array<{
        id: string;
        name: string;
        description: string;
        cost: number;
        sellExclGst: number;
    }>;
}

function toEditable(t: TrailerRow): EditableTrailerFields {
    const s = t.specifications || {};
    return {
        code: t.code || '',
        name: t.name || '',
        supplier: t.supplier || '',
        isActive: t.isActive !== false,
        features: t.features ? [...t.features] : [],
        specifications: {
            boatSizeMtr: s.boatSizeMtr ?? null,
            lengthMtr: s.lengthMtr ?? null,
            tareKg: s.tareKg ?? null,
            atmKg: s.atmKg ?? null,
            wheelSize: s.wheelSize || '',
            winch: s.winch || '',
            betweenGuardsMm: s.betweenGuardsMm ?? null,
            plug: s.plug || '',
        },
        optionalFeatures: (t.optionalFeatures || []).map(o => ({
            id: o.id || Math.random().toString(36).slice(2),
            name: o.name || '',
            description: o.description || '',
            cost: o.cost || 0,
            sellExclGst: o.sellExclGst || 0,
        })),
    };
}

function TrailerEditForm({
    trailer,
    onCancel,
    onSave,
}: {
    trailer: TrailerRow;
    onCancel: () => void;
    onSave: (patch: Partial<TrailerRow>) => Promise<void>;
}) {
    const [form, setForm] = useState<EditableTrailerFields>(() => toEditable(trailer));
    const [saving, setSaving] = useState(false);

    // If the underlying trailer changes (e.g. new one selected), reset.
    useEffect(() => { setForm(toEditable(trailer)); }, [trailer.id, trailer.vendorId]); // eslint-disable-line react-hooks/exhaustive-deps

    function updateSpec<K extends keyof EditableTrailerFields['specifications']>(key: K, value: EditableTrailerFields['specifications'][K]) {
        setForm(f => ({ ...f, specifications: { ...f.specifications, [key]: value } }));
    }

    function updateFeature(index: number, value: string) {
        setForm(f => ({ ...f, features: f.features.map((x, i) => i === index ? value : x) }));
    }
    function addFeature() {
        setForm(f => ({ ...f, features: [...f.features, ''] }));
    }
    function removeFeature(index: number) {
        setForm(f => ({ ...f, features: f.features.filter((_, i) => i !== index) }));
    }

    function updateOption(index: number, patch: Partial<EditableTrailerFields['optionalFeatures'][number]>) {
        setForm(f => ({ ...f, optionalFeatures: f.optionalFeatures.map((o, i) => i === index ? { ...o, ...patch } : o) }));
    }
    function addOption() {
        setForm(f => ({
            ...f,
            optionalFeatures: [...f.optionalFeatures, {
                id: Math.random().toString(36).slice(2),
                name: '',
                description: '',
                cost: 0,
                sellExclGst: 0,
            }],
        }));
    }
    function removeOption(index: number) {
        setForm(f => ({ ...f, optionalFeatures: f.optionalFeatures.filter((_, i) => i !== index) }));
    }

    async function handleSave() {
        setSaving(true);
        try {
            const cleanedFeatures = form.features.map(f => f.trim()).filter(f => f.length > 0);
            const cleanedOptions = form.optionalFeatures
                .filter(o => o.name.trim().length > 0)
                .map(o => ({
                    id: o.id,
                    name: o.name.trim(),
                    description: o.description.trim(),
                    cost: Number(o.cost) || 0,
                    sellExclGst: Number(o.sellExclGst) || 0,
                }));
            await onSave({
                code: form.code.trim(),
                name: form.name.trim(),
                supplier: form.supplier.trim(),
                isActive: form.isActive,
                features: cleanedFeatures,
                specifications: {
                    ...(trailer.specifications || {}),
                    ...form.specifications,
                },
                optionalFeatures: cleanedOptions,
            });
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="space-y-6">
            {/* Action row — sticky at top of form for visibility */}
            <div className="sticky top-0 z-10 -mx-6 px-6 py-2 bg-white border-b flex items-center justify-between gap-2">
                <p className="text-xs text-slate-500">Editing trailer details. Pricing lives in Pricing Manager.</p>
                <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
                    <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
                        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        Save
                    </Button>
                </div>
            </div>

            {/* Basic info */}
            <section className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Basic Info</h4>
                <div className="grid grid-cols-2 gap-3">
                    <FieldText label="Code" value={form.code} onChange={v => setForm(f => ({ ...f, code: v }))} />
                    <FieldText label="Name" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} />
                    <FieldText label="Supplier" value={form.supplier} onChange={v => setForm(f => ({ ...f, supplier: v }))} className="col-span-2" />
                </div>
                <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50">
                    <Label htmlFor="trailer-active" className="text-xs">Active in catalog</Label>
                    <Switch
                        id="trailer-active"
                        checked={form.isActive}
                        onCheckedChange={(c) => setForm(f => ({ ...f, isActive: !!c }))}
                    />
                </div>
            </section>

            {/* Specifications */}
            <section className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                    <Ruler className="h-3 w-3" /> Specifications
                </h4>
                <div className="grid grid-cols-2 gap-3">
                    <FieldNumber label="Boat size (m)" value={form.specifications.boatSizeMtr} onChange={v => updateSpec('boatSizeMtr', v)} step={0.1} />
                    <FieldNumber label="Trailer length (m)" value={form.specifications.lengthMtr} onChange={v => updateSpec('lengthMtr', v)} step={0.1} />
                    <FieldNumber label="Tare (kg)" value={form.specifications.tareKg} onChange={v => updateSpec('tareKg', v)} />
                    <FieldNumber label="ATM (kg)" value={form.specifications.atmKg} onChange={v => updateSpec('atmKg', v)} />
                    <FieldText label="Wheel size" value={form.specifications.wheelSize} onChange={v => updateSpec('wheelSize', v)} />
                    <FieldText label="Winch" value={form.specifications.winch} onChange={v => updateSpec('winch', v)} />
                    <FieldNumber label="Between guards (mm)" value={form.specifications.betweenGuardsMm} onChange={v => updateSpec('betweenGuardsMm', v)} />
                    <FieldText label="Plug" value={form.specifications.plug} onChange={v => updateSpec('plug', v)} />
                </div>
            </section>

            {/* Features */}
            <section className="space-y-3">
                <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                        <Info className="h-3 w-3" /> Features
                    </h4>
                    <Button variant="outline" size="sm" className="h-6 text-xs gap-1" onClick={addFeature}>
                        <Plus className="h-3 w-3" /> Add
                    </Button>
                </div>
                {form.features.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No features listed.</p>
                ) : (
                    <div className="space-y-1">
                        {form.features.map((f, i) => (
                            <div key={i} className="flex items-center gap-1">
                                <Input
                                    value={f}
                                    onChange={(e) => updateFeature(i, e.target.value)}
                                    placeholder="Feature description"
                                    className="h-8 text-xs"
                                />
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => removeFeature(i)}>
                                    <X className="h-3 w-3" />
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Factory Options */}
            <section className="space-y-3">
                <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                        <Package className="h-3 w-3" /> Factory Options
                    </h4>
                    <Button variant="outline" size="sm" className="h-6 text-xs gap-1" onClick={addOption}>
                        <Plus className="h-3 w-3" /> Add option
                    </Button>
                </div>
                {form.optionalFeatures.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No factory options defined.</p>
                ) : (
                    <div className="space-y-2">
                        {form.optionalFeatures.map((opt, i) => (
                            <div key={opt.id} className="p-3 rounded-xl bg-slate-50 border space-y-2">
                                <div className="flex items-center gap-1">
                                    <Input
                                        value={opt.name}
                                        onChange={(e) => updateOption(i, { name: e.target.value })}
                                        placeholder="Option name"
                                        className="h-8 text-xs font-medium"
                                    />
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 shrink-0" onClick={() => removeOption(i)}>
                                        <X className="h-3 w-3" />
                                    </Button>
                                </div>
                                <Textarea
                                    value={opt.description}
                                    onChange={(e) => updateOption(i, { description: e.target.value })}
                                    placeholder="Description (optional)"
                                    className="text-xs min-h-[48px]"
                                />
                                <div className="grid grid-cols-2 gap-2">
                                    <FieldNumber
                                        label="Cost (ex GST)"
                                        value={opt.cost}
                                        onChange={(v) => updateOption(i, { cost: v ?? 0 })}
                                        step={1}
                                    />
                                    <FieldNumber
                                        label="Sell (ex GST)"
                                        value={opt.sellExclGst}
                                        onChange={(v) => updateOption(i, { sellExclGst: v ?? 0 })}
                                        step={1}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Field primitives
// ---------------------------------------------------------------------------

function FieldText({ label, value, onChange, className }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    className?: string;
}) {
    return (
        <div className={className}>
            <Label className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</Label>
            <Input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="h-8 text-xs mt-0.5"
            />
        </div>
    );
}

function FieldNumber({ label, value, onChange, step = 1, className }: {
    label: string;
    value: number | null;
    onChange: (v: number | null) => void;
    step?: number;
    className?: string;
}) {
    return (
        <div className={className}>
            <Label className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</Label>
            <Input
                type="number"
                step={step}
                value={value ?? ''}
                onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '') onChange(null);
                    else {
                        const n = Number(raw);
                        onChange(Number.isFinite(n) ? n : null);
                    }
                }}
                className="h-8 text-xs mt-0.5"
            />
        </div>
    );
}

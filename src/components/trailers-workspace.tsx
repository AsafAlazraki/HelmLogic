'use client';

import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { collection, doc, updateDoc } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { Truck, DollarSign, Settings as SettingsIcon, Building2, Search, Ruler, Weight, Info, Package } from 'lucide-react';
import { ModuleDealerFitManager } from '@/components/module-dealer-fit-manager';
import { ModuleRoleAssignment } from '@/components/module-role-assignment';
import { TrailerPricingWorkspace } from '@/components/trailer-pricing-workspace';
import { formatCurrency } from '@/lib/currency-utils';

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

interface Vendor {
    id: string;
    name: string;
    vendorType?: string;
    logoUrl?: string;
    shortCode?: string;
}

interface Series {
    id: string;
    name: string;
    slug?: string;
    order?: number;
    coverImageUrl?: string;
    isActive?: boolean;
}

interface Trailer {
    id: string;
    code: string;
    name: string;
    supplier?: string;
    longDescription?: string;
    imageUrl?: string;
    isActive?: boolean;
    features?: string[];
    cost?: number;
    sellPriceExclGst?: number;
    landedCost?: number;
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
    leadTimes?: Record<string, any>;
    vendorId?: string;
    seriesId?: string;
}

interface TrailersWorkspaceProps {
    organisationId: string;
    isAdmin: boolean;
    moduleId: string;
    moduleData: any;
}

type TabKey = 'catalog' | 'pricing' | 'settings';

const TABS: { key: TabKey; label: string; icon: ReactNode }[] = [
    { key: 'catalog', label: 'Catalog', icon: <Truck className="h-4 w-4" /> },
    { key: 'pricing', label: 'Pricing Manager', icon: <DollarSign className="h-4 w-4" /> },
    { key: 'settings', label: 'Settings', icon: <SettingsIcon className="h-4 w-4" /> },
];

// ---------------------------------------------------------------------------
// Catalog sub-components
// ---------------------------------------------------------------------------

function TrailerCard({ trailer, onClick }: { trailer: Trailer; onClick: () => void }) {
    const price = trailer.sellPriceExclGst || 0;
    const atm = trailer.specifications?.atmKg;
    const len = trailer.specifications?.lengthMtr;
    const boat = trailer.specifications?.boatSizeMtr;
    const inactive = trailer.isActive === false;

    return (
        <Card
            className={`border-2 rounded-2xl overflow-hidden cursor-pointer hover:border-primary/40 hover:shadow-md transition-all ${inactive ? 'opacity-60' : ''}`}
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
                <div className="flex gap-1 flex-wrap">
                    {boat && <Badge variant="outline" className="text-[9px]">{boat}m boat</Badge>}
                    {len != null && <Badge variant="outline" className="text-[9px]">{len}m</Badge>}
                    {atm != null && <Badge variant="outline" className="text-[9px]">{atm} ATM</Badge>}
                    {inactive && <Badge variant="outline" className="text-[9px] border-red-400 text-red-600">Inactive</Badge>}
                </div>
                {price > 0 && (
                    <p className="text-xs font-bold text-primary">{formatCurrency(price)} <span className="text-[9px] font-normal text-slate-400">ex GST</span></p>
                )}
                {(trailer.optionalFeatures?.length ?? 0) > 0 && (
                    <p className="text-[9px] text-slate-400">{trailer.optionalFeatures!.length} factory option{trailer.optionalFeatures!.length === 1 ? '' : 's'}</p>
                )}
            </CardContent>
        </Card>
    );
}

function SeriesSection({
    vendorId,
    series,
    search,
    onTrailerClick,
}: {
    vendorId: string;
    series: Series;
    search: string;
    onTrailerClick: (t: Trailer) => void;
}) {
    const firestore = useFirestore();
    const trailersQuery = useMemoFirebase(
        () => collection(firestore, `data-warehouse/${vendorId}/series/${series.id}/trailers`),
        [firestore, vendorId, series.id],
    );
    const { data: trailers, isLoading } = useCollection<Trailer>(trailersQuery);

    const filtered = useMemo(() => {
        if (!trailers) return [];
        let list = [...trailers];
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(t =>
                (t.code || '').toLowerCase().includes(q) ||
                (t.name || '').toLowerCase().includes(q)
            );
        }
        return list.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
    }, [trailers, search]);

    if (isLoading) return null;
    if (filtered.length === 0) return null;

    return (
        <div>
            <div className="flex items-center gap-2 mb-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-600">{series.name}</h3>
                <Badge variant="outline" className="text-[9px]">{filtered.length}</Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {filtered.map((t) => (
                    <TrailerCard key={t.id} trailer={{ ...t, vendorId, seriesId: series.id }} onClick={() => onTrailerClick({ ...t, vendorId, seriesId: series.id })} />
                ))}
            </div>
        </div>
    );
}

function BrandSection({
    vendor,
    search,
    onTrailerClick,
}: {
    vendor: Vendor;
    search: string;
    onTrailerClick: (t: Trailer) => void;
}) {
    const firestore = useFirestore();
    const seriesQuery = useMemoFirebase(
        () => collection(firestore, `data-warehouse/${vendor.id}/series`),
        [firestore, vendor.id],
    );
    const { data: seriesList, isLoading } = useCollection<Series>(seriesQuery);

    const sortedSeries = useMemo(() => {
        if (!seriesList) return [];
        return [...seriesList].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    }, [seriesList]);

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 pb-3 border-b-2 border-slate-100">
                <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary border-2 border-primary/20">
                    <Truck className="h-5 w-5" />
                </div>
                <div>
                    <h2 className="text-lg font-black uppercase tracking-tight">{vendor.name}</h2>
                    {vendor.shortCode && <p className="text-[9px] text-slate-400 uppercase tracking-widest">{vendor.shortCode}</p>}
                </div>
            </div>

            {isLoading && <p className="text-xs text-slate-400">Loading series…</p>}
            {!isLoading && sortedSeries.length === 0 && (
                <p className="text-xs text-slate-400 italic">
                    No series under this brand yet. Run <code className="px-1 py-0.5 rounded bg-slate-100">scripts/seed-trailers.ts --live</code> to import.
                </p>
            )}
            <div className="space-y-8">
                {sortedSeries.map((s) => (
                    <SeriesSection key={s.id} vendorId={vendor.id} series={s} search={search} onTrailerClick={onTrailerClick} />
                ))}
            </div>
        </div>
    );
}

function TrailerDetailSheet({
    trailer,
    open,
    onOpenChange,
}: {
    trailer: Trailer | null;
    open: boolean;
    onOpenChange: (v: boolean) => void;
}) {
    if (!trailer) return null;
    const specs = trailer.specifications || {};
    const pricing = trailer.pricingDetail || {};
    const options = trailer.optionalFeatures || [];

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="sm:max-w-lg overflow-y-auto">
                <SheetHeader className="pb-4">
                    <SheetTitle className="text-lg">{trailer.code}</SheetTitle>
                    <p className="text-xs text-slate-500">{trailer.name}</p>
                </SheetHeader>

                <div className="h-40 bg-slate-50 rounded-xl flex items-center justify-center mb-6 overflow-hidden">
                    <TrailerImage
                        src={trailer.imageUrl}
                        alt={trailer.name}
                        className="h-full object-contain"
                        fallback={<Truck className="h-16 w-16 text-slate-300" />}
                    />
                </div>

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

                {/* Pricing waterfall — read-only summary */}
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
                        <p className="text-[10px] text-slate-400 mt-2">Full waterfall editable in Pricing Manager (Step 8).</p>
                    </div>
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
// Main component
// ---------------------------------------------------------------------------

export function TrailersWorkspace({ organisationId, isAdmin, moduleId, moduleData }: TrailersWorkspaceProps) {
    const firestore = useFirestore();
    const { toast } = useToast();

    const [activeTab, setActiveTab] = useState<TabKey>(() => {
        if (typeof window !== 'undefined') {
            const t = new URLSearchParams(window.location.search).get('trailerTab');
            if (t === 'catalog' || t === 'pricing' || t === 'settings') return t as TabKey;
        }
        return 'catalog';
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const url = new URL(window.location.href);
        if (activeTab && activeTab !== 'catalog') url.searchParams.set('trailerTab', activeTab);
        else url.searchParams.delete('trailerTab');
        window.history.replaceState({}, '', url.toString());
    }, [activeTab]);

    const vendorsQuery = useMemoFirebase(() => collection(firestore, 'data-warehouse'), [firestore]);
    const { data: allVendors } = useCollection<Vendor>(vendorsQuery);

    const trailerBrandVendors = useMemo(
        () => (allVendors || []).filter(v => v.vendorType === 'Trailer Brand'),
        [allVendors]
    );

    const selectedBrandIds: string[] = moduleData?.trailerBrandVendorIds || [];
    const selectedVendors = useMemo(
        () => trailerBrandVendors.filter(v => selectedBrandIds.includes(v.id)),
        [trailerBrandVendors, selectedBrandIds]
    );

    const [search, setSearch] = useState('');
    const [brandFilter, setBrandFilter] = useState<string>('all');
    const [selectedTrailer, setSelectedTrailer] = useState<Trailer | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);

    const visibleVendors = useMemo(
        () => (brandFilter === 'all' ? selectedVendors : selectedVendors.filter(v => v.id === brandFilter)),
        [selectedVendors, brandFilter]
    );

    const toggleBrand = async (vendorId: string, checked: boolean) => {
        const next = checked
            ? [...new Set([...selectedBrandIds, vendorId])]
            : selectedBrandIds.filter(id => id !== vendorId);
        try {
            await updateDoc(doc(firestore, 'modules', moduleId), { trailerBrandVendorIds: next });
            toast({ title: 'Trailer brands updated' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Failed to update', description: e.message });
        }
    };

    const openTrailer = (t: Trailer) => {
        setSelectedTrailer(t);
        setDetailOpen(true);
    };

    return (
        <div className="flex flex-col h-full">
            <div className="border-b bg-white px-6">
                <div className="flex gap-1">
                    {TABS.map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                                activeTab === tab.key
                                    ? 'border-blue-600 text-blue-600'
                                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                            }`}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-hidden">
                {activeTab === 'catalog' && (
                    <ScrollArea className="h-full">
                        <div className="p-8 max-w-7xl mx-auto space-y-8">
                            {/* Search + filter bar */}
                            <div className="flex flex-wrap items-center gap-3">
                                <div className="relative flex-1 min-w-[260px]">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                    <Input
                                        placeholder="Search by code or name…"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        className="pl-9 rounded-xl"
                                    />
                                </div>
                                {selectedVendors.length > 1 && (
                                    <select
                                        value={brandFilter}
                                        onChange={(e) => setBrandFilter(e.target.value)}
                                        className="text-xs border-2 rounded-xl px-3 py-2 bg-white hover:bg-slate-50"
                                    >
                                        <option value="all">All brands ({selectedVendors.length})</option>
                                        {selectedVendors.map(v => (
                                            <option key={v.id} value={v.id}>{v.name}</option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            {/* No brands selected yet */}
                            {selectedVendors.length === 0 && (
                                <Card className="border-2 rounded-2xl">
                                    <CardHeader>
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary border-2 border-primary/20">
                                                <Truck className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <CardTitle>No trailer brands selected</CardTitle>
                                                <CardDescription>Head to <b>Settings</b> and tick the brands this module sources from.</CardDescription>
                                            </div>
                                        </div>
                                    </CardHeader>
                                </Card>
                            )}

                            {/* Brand sections */}
                            {visibleVendors.map((v) => (
                                <BrandSection
                                    key={v.id}
                                    vendor={v}
                                    search={search}
                                    onTrailerClick={openTrailer}
                                />
                            ))}
                        </div>
                    </ScrollArea>
                )}

                {activeTab === 'pricing' && (
                    <TrailerPricingWorkspace
                        vendors={selectedVendors}
                        organisationId={organisationId}
                        isAdmin={isAdmin}
                    />
                )}

                {activeTab === 'settings' && (
                    <ScrollArea className="h-full">
                        <div className="p-8 max-w-4xl mx-auto space-y-8">
                            <Card className="border-2 rounded-2xl">
                                <CardHeader>
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary border-2 border-primary/20">
                                            <Building2 className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <CardTitle>Trailer Brands</CardTitle>
                                            <CardDescription>Select which Trailer Brand vendors this module sources from.</CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    {trailerBrandVendors.length === 0 ? (
                                        <p className="text-sm text-slate-500 italic">
                                            No Trailer Brand vendors exist yet. Create one at{' '}
                                            <code className="px-1 py-0.5 rounded bg-slate-100">/data-warehouse/add</code>{' '}
                                            with <code className="px-1 py-0.5 rounded bg-slate-100">vendorType: 'Trailer Brand'</code>, or run{' '}
                                            <code className="px-1 py-0.5 rounded bg-slate-100">scripts/seed-trailers.ts --live</code>.
                                        </p>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {trailerBrandVendors.map((v) => {
                                                const checked = selectedBrandIds.includes(v.id);
                                                return (
                                                    <label
                                                        key={v.id}
                                                        className="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-slate-50 transition-colors"
                                                    >
                                                        <Checkbox
                                                            checked={checked}
                                                            disabled={!isAdmin}
                                                            onCheckedChange={(c) => toggleBrand(v.id, !!c)}
                                                        />
                                                        <span className="text-sm font-medium">{v.name}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            <ModuleDealerFitManager
                                moduleId={moduleId}
                                categories={moduleData?.trailerDealerFitCategories || []}
                                fieldName="trailerDealerFitCategories"
                                title="Trailer Dealer Fit Categories"
                                description="Categories for dealer-fit options attached to trailers (e.g. Spare Wheel, Wheel Chocks)."
                            />

                            <ModuleRoleAssignment
                                moduleId={moduleId}
                                organisationId={organisationId}
                                currentBrandCaptain={moduleData?.brandCaptainUserId ? { userId: moduleData.brandCaptainUserId, userName: moduleData.brandCaptainUserName || '' } : null}
                                currentModuleManager={moduleData?.moduleManagerUserId ? { userId: moduleData.moduleManagerUserId, userName: moduleData.moduleManagerUserName || '' } : null}
                            />
                        </div>
                    </ScrollArea>
                )}
            </div>

            <TrailerDetailSheet
                trailer={selectedTrailer}
                open={detailOpen}
                onOpenChange={setDetailOpen}
            />
        </div>
    );
}

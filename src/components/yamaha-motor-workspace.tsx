'use client';

import { useState, useMemo } from 'react';
import { collection } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Ship, Search, Package, Settings as SettingsIcon, DollarSign, ChevronDown, ArrowUpDown, Tag } from 'lucide-react';
import { ModulePromotions } from '@/components/module-promotions';
import { MasterPriceFileWorkspace } from '@/components/master-price-file-workspace';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface YamahaMotorWorkspaceProps {
    vendorId: string;
    organisationId: string;
    isAdmin: boolean;
    moduleId: string;
}

type SortKey = 'name' | 'hp' | 'price';
type SortDir = 'asc' | 'desc';

interface MotorRow {
    id: string;
    [key: string]: any;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMotorName(motor: MotorRow): string {
    return motor['MODEL'] || motor['Model Name'] || motor['MODEL CODE'] || motor['Model'] || motor.name || motor.modelName || motor.id;
}

function getMotorHp(motor: MotorRow): number {
    const raw = motor['HP Rating'] || motor['HP'] || motor.hp || motor.horsepower || 0;
    return typeof raw === 'number' ? raw : parseFloat(raw) || 0;
}

function getMotorPrice(motor: MotorRow): number {
    const raw = motor['Store Price'] || motor['Sell Price'] || motor.sellPriceExclGst || motor['NSM Retail'] || motor.price || 0;
    return typeof raw === 'number' ? raw : parseFloat(raw) || 0;
}

function getMotorShaft(motor: MotorRow): string {
    return motor['Shaft Length'] || motor.shaft || motor['Shaft'] || '';
}

function getMotorImage(motor: MotorRow): string | null {
    return motor.SummaryImage || motor.imageUrl || motor['Image URL'] || null;
}

function getHpRange(hp: number): string {
    if (hp <= 0) return 'Unknown';
    if (hp <= 25) return '2.5–25 HP';
    if (hp <= 75) return '30–75 HP';
    if (hp <= 150) return '90–150 HP';
    if (hp <= 250) return '175–250 HP';
    return '300+ HP';
}

const HP_RANGE_ORDER = ['2.5–25 HP', '30–75 HP', '90–150 HP', '175–250 HP', '300+ HP', 'Unknown'];

function getAccessoryCategory(acc: any): string {
    const cat = (acc.category || acc.Category || acc.type || '').toLowerCase();
    if (cat.includes('rig')) return 'Rigging';
    if (cat.includes('prop')) return 'Propeller';
    return 'General';
}

// ---------------------------------------------------------------------------
// Sub-Components
// ---------------------------------------------------------------------------

function MotorCard({ motor, onClick }: { motor: MotorRow; onClick: () => void }) {
    const name = getMotorName(motor);
    const hp = getMotorHp(motor);
    const price = getMotorPrice(motor);
    const shaft = getMotorShaft(motor);
    const image = getMotorImage(motor);
    const accessories = motor.masterAccessories || motor.accessories || [];

    return (
        <Card
            className="border-2 rounded-2xl overflow-hidden cursor-pointer hover:border-primary/40 hover:shadow-md transition-all"
            onClick={onClick}
        >
            <CardHeader className="h-24 bg-slate-50 flex items-center justify-center p-3 border-b">
                {image ? (
                    <img src={image} alt={name} className="h-full object-contain" />
                ) : (
                    <Ship className="h-10 w-10 text-slate-300" />
                )}
            </CardHeader>
            <CardContent className="p-4 space-y-2">
                <h3 className="text-sm font-bold truncate" title={name}>{name}</h3>
                <div className="flex gap-2 flex-wrap">
                    {hp > 0 && <Badge variant="outline" className="text-[9px]">{hp} HP</Badge>}
                    {shaft && <Badge variant="outline" className="text-[9px]">{shaft}</Badge>}
                </div>
                {price > 0 && (
                    <p className="text-xs font-bold text-primary">${price.toLocaleString()}</p>
                )}
                {accessories.length > 0 && (
                    <p className="text-[9px] text-slate-400">{accessories.length} accessories</p>
                )}
            </CardContent>
        </Card>
    );
}

function MotorDetailSheet({
    motor,
    open,
    onOpenChange,
}: {
    motor: MotorRow | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    if (!motor) return null;

    const name = getMotorName(motor);
    const hp = getMotorHp(motor);
    const price = getMotorPrice(motor);
    const shaft = getMotorShaft(motor);
    const image = getMotorImage(motor);
    const accessories: any[] = motor.masterAccessories || motor.accessories || [];

    const grouped = useMemo(() => {
        const groups: Record<string, any[]> = { Rigging: [], Propeller: [], General: [] };
        accessories.forEach((acc) => {
            const cat = getAccessoryCategory(acc);
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(acc);
        });
        return groups;
    }, [accessories]);

    // Collect motor detail fields to display
    const detailFields = useMemo(() => {
        const skip = new Set(['id', 'SummaryImage', 'imageUrl', 'Image URL', 'masterAccessories', 'accessories']);
        const entries: { label: string; value: string }[] = [];
        for (const [key, value] of Object.entries(motor)) {
            if (skip.has(key) || value === null || value === undefined || value === '') continue;
            if (typeof value === 'object') continue;
            entries.push({ label: key, value: String(value) });
        }
        return entries.slice(0, 20); // Cap at 20 fields
    }, [motor]);

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="sm:max-w-lg overflow-y-auto">
                <SheetHeader className="pb-4">
                    <SheetTitle className="text-lg">{name}</SheetTitle>
                </SheetHeader>

                {/* Hero image */}
                <div className="h-40 bg-slate-50 rounded-xl flex items-center justify-center mb-6">
                    {image ? (
                        <img src={image} alt={name} className="h-full object-contain" />
                    ) : (
                        <Ship className="h-16 w-16 text-slate-300" />
                    )}
                </div>

                {/* Quick stats */}
                <div className="flex gap-3 mb-6">
                    {hp > 0 && <Badge variant="secondary">{hp} HP</Badge>}
                    {shaft && <Badge variant="secondary">{shaft}</Badge>}
                    {price > 0 && <Badge variant="default">${price.toLocaleString()}</Badge>}
                </div>

                {/* Detail fields */}
                {detailFields.length > 0 && (
                    <div className="space-y-1 mb-6">
                        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Specifications</h4>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                            {detailFields.map(({ label, value }) => (
                                <div key={label} className="text-xs">
                                    <span className="text-slate-400">{label}:</span>{' '}
                                    <span className="font-medium">{value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Accessories grouped by category */}
                {accessories.length > 0 ? (
                    <div className="space-y-4">
                        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Accessories</h4>
                        {(['Rigging', 'Propeller', 'General'] as const).map((cat) => {
                            const items = grouped[cat];
                            if (!items || items.length === 0) return null;
                            return (
                                <div key={cat}>
                                    <h5 className="text-xs font-semibold mb-2">{cat}</h5>
                                    <div className="space-y-1">
                                        {items.map((acc: any, i: number) => {
                                            const accName = acc.name || acc.Name || acc['Part Name'] || `Item ${i + 1}`;
                                            const accPrice = acc.sellPriceExclGst || acc['Store Price'] || acc.price || 0;
                                            const isStandard = acc.standard || acc.isStandard || false;
                                            return (
                                                <div key={acc.id || i} className="flex items-center justify-between py-1 px-2 rounded bg-slate-50 text-xs">
                                                    <div className="flex items-center gap-2">
                                                        <Package className="h-3 w-3 text-slate-400" />
                                                        <span>{accName}</span>
                                                        {isStandard ? (
                                                            <Badge variant="default" className="text-[8px] px-1 py-0">Std</Badge>
                                                        ) : (
                                                            <Badge variant="outline" className="text-[8px] px-1 py-0">Optional</Badge>
                                                        )}
                                                    </div>
                                                    {accPrice > 0 && (
                                                        <span className="font-medium">${Number(accPrice).toLocaleString()}</span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <p className="text-xs text-slate-400 italic">No accessories linked to this motor.</p>
                )}
            </SheetContent>
        </Sheet>
    );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function YamahaMotorWorkspace({ vendorId, organisationId, isAdmin, moduleId }: YamahaMotorWorkspaceProps) {
    const firestore = useFirestore();

    // Tab state
    const [activeTab, setActiveTab] = useState<'catalog' | 'pricing' | 'promotions' | 'settings'>('catalog');

    // Catalog state
    const [search, setSearch] = useState('');
    const [sortKey, setSortKey] = useState<SortKey>('hp');
    const [sortDir, setSortDir] = useState<SortDir>('asc');
    const [hpFilter, setHpFilter] = useState<string>('all');
    const [selectedMotor, setSelectedMotor] = useState<MotorRow | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);

    // -----------------------------------------------------------------------
    // Data loading: dataSets -> find motor dataset -> load rows
    // -----------------------------------------------------------------------

    const dataSetsQuery = useMemoFirebase(
        () => collection(firestore, `data-warehouse/${vendorId}/dataSets`),
        [firestore, vendorId],
    );
    const { data: dataSets } = useCollection<any>(dataSetsQuery);

    const motorDataSet = useMemo(() => {
        if (!dataSets) return null;
        return (
            dataSets.find((ds: any) => {
                const name = (ds.name || ds.id || '').toLowerCase();
                return (
                    name.includes('outboard') ||
                    name.includes('motor') ||
                    name.includes('library') ||
                    name.includes('dealer')
                );
            }) || dataSets[0] || null
        );
    }, [dataSets]);

    const motorsQuery = useMemoFirebase(
        () =>
            motorDataSet
                ? collection(firestore, `data-warehouse/${vendorId}/dataSets/${motorDataSet.id}/rows`)
                : null,
        [firestore, vendorId, motorDataSet?.id],
    );
    const { data: motors, isLoading } = useCollection<any>(motorsQuery);

    // -----------------------------------------------------------------------
    // Filtering, sorting, grouping
    // -----------------------------------------------------------------------

    const filteredMotors = useMemo(() => {
        if (!motors) return [];
        let result = [...motors];

        // Search
        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter((m) => getMotorName(m).toLowerCase().includes(q));
        }

        // HP range filter
        if (hpFilter !== 'all') {
            result = result.filter((m) => getHpRange(getMotorHp(m)) === hpFilter);
        }

        // Sort
        result.sort((a, b) => {
            let cmp = 0;
            switch (sortKey) {
                case 'hp':
                    cmp = getMotorHp(a) - getMotorHp(b);
                    break;
                case 'price':
                    cmp = getMotorPrice(a) - getMotorPrice(b);
                    break;
                case 'name':
                    cmp = getMotorName(a).localeCompare(getMotorName(b));
                    break;
            }
            return sortDir === 'asc' ? cmp : -cmp;
        });

        return result;
    }, [motors, search, hpFilter, sortKey, sortDir]);

    const groupedMotors = useMemo(() => {
        const groups: Record<string, MotorRow[]> = {};
        filteredMotors.forEach((m) => {
            const range = getHpRange(getMotorHp(m));
            if (!groups[range]) groups[range] = [];
            groups[range].push(m);
        });
        return groups;
    }, [filteredMotors]);

    const availableHpRanges = useMemo(() => {
        if (!motors) return [];
        const ranges = new Set(motors.map((m: any) => getHpRange(getMotorHp(m))));
        return HP_RANGE_ORDER.filter((r) => ranges.has(r));
    }, [motors]);

    // -----------------------------------------------------------------------
    // Handlers
    // -----------------------------------------------------------------------

    function handleMotorClick(motor: MotorRow) {
        setSelectedMotor(motor);
        setDetailOpen(true);
    }

    function toggleSort(key: SortKey) {
        if (sortKey === key) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    }

    // -----------------------------------------------------------------------
    // Tab content
    // -----------------------------------------------------------------------

    const tabs = [
        { key: 'catalog' as const, label: 'Catalog', icon: <Ship className="h-4 w-4" /> },
        { key: 'pricing' as const, label: 'Pricing Manager', icon: <DollarSign className="h-4 w-4" /> },
        { key: 'promotions' as const, label: 'Promotions', icon: <Tag className="h-4 w-4" /> },
        { key: 'settings' as const, label: 'Settings', icon: <SettingsIcon className="h-4 w-4" /> },
    ];

    return (
        <div className="flex flex-col h-full">
            {/* Header banner */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4">
                <h1 className="text-xl font-bold">Yamaha Outboards</h1>
                <p className="text-sm text-blue-100">
                    {motors ? `${motors.length} motors` : 'Loading catalog…'}
                    {motorDataSet ? ` · ${motorDataSet.name || motorDataSet.id}` : ''}
                </p>
            </div>

            {/* Tab navigation */}
            <div className="border-b bg-white px-6">
                <div className="flex gap-1">
                    {tabs.map((tab) => (
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

            {/* Tab content */}
            <div className="flex-1 overflow-hidden">
                {/* ---- CATALOG TAB ---- */}
                {activeTab === 'catalog' && (
                    <ScrollArea className="h-full">
                        <div className="p-6 space-y-6">
                            {/* Search & filter bar */}
                            <div className="flex flex-wrap items-center gap-3">
                                <div className="relative flex-1 min-w-[200px]">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                    <Input
                                        placeholder="Search motors..."
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        className="pl-9"
                                    />
                                </div>

                                {/* HP range filter */}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" size="sm" className="gap-1">
                                            {hpFilter === 'all' ? 'All HP' : hpFilter}
                                            <ChevronDown className="h-3 w-3" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => setHpFilter('all')}>All HP</DropdownMenuItem>
                                        {availableHpRanges.map((r) => (
                                            <DropdownMenuItem key={r} onClick={() => setHpFilter(r)}>
                                                {r}
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>

                                {/* Sort buttons */}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" size="sm" className="gap-1">
                                            <ArrowUpDown className="h-3 w-3" />
                                            Sort: {sortKey} {sortDir === 'asc' ? '↑' : '↓'}
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => toggleSort('hp')}>HP</DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => toggleSort('price')}>Price</DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => toggleSort('name')}>Name</DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>

                            {/* Loading state */}
                            {isLoading && (
                                <div className="flex items-center justify-center py-20 text-slate-400">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                                </div>
                            )}

                            {/* Empty state */}
                            {!isLoading && filteredMotors.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-2">
                                    <Ship className="h-12 w-12" />
                                    <p className="text-sm font-medium">
                                        {motors && motors.length > 0
                                            ? 'No motors match your filters'
                                            : 'No motor data found'}
                                    </p>
                                    {motors && motors.length > 0 && (
                                        <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setHpFilter('all'); }}>
                                            Clear filters
                                        </Button>
                                    )}
                                </div>
                            )}

                            {/* Grouped motor grid */}
                            {!isLoading && hpFilter === 'all' && filteredMotors.length > 0 && (
                                <>
                                    {HP_RANGE_ORDER.map((range) => {
                                        const group = groupedMotors[range];
                                        if (!group || group.length === 0) return null;
                                        return (
                                            <div key={range}>
                                                <h2 className="text-sm font-semibold text-slate-600 mb-3">{range}</h2>
                                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                                                    {group.map((motor) => (
                                                        <MotorCard
                                                            key={motor.id}
                                                            motor={motor}
                                                            onClick={() => handleMotorClick(motor)}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </>
                            )}

                            {/* Flat grid when filtered by specific HP range */}
                            {!isLoading && hpFilter !== 'all' && filteredMotors.length > 0 && (
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                                    {filteredMotors.map((motor) => (
                                        <MotorCard
                                            key={motor.id}
                                            motor={motor}
                                            onClick={() => handleMotorClick(motor)}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                )}

                {/* ---- PRICING MANAGER TAB ---- */}
                {activeTab === 'pricing' && (
                    <MasterPriceFileWorkspace
                        vendorId={vendorId}
                        organisationId={organisationId}
                        isAdmin={isAdmin}
                    />
                )}

                {/* ---- SETTINGS TAB ---- */}
                {activeTab === 'promotions' && (
                    <ScrollArea className="h-full">
                        <div className="p-8">
                            <ModulePromotions
                                moduleId={moduleId}
                                vendorId={vendorId}
                                organisationId={organisationId}
                            />
                        </div>
                    </ScrollArea>
                )}

                {activeTab === 'settings' && (
                    <ScrollArea className="h-full">
                        <div className="p-8 space-y-8">
                            <div className="space-y-1">
                                <h2 className="text-lg font-semibold">Module Settings</h2>
                                <p className="text-sm text-slate-500">Configure this Yamaha module for your organisation.</p>
                            </div>
                            <p className="text-sm text-slate-400 italic">
                                Settings components (Stock Locations, Dealer Fit, Role Assignment) are managed from the parent module page.
                            </p>
                        </div>
                    </ScrollArea>
                )}
            </div>

            {/* Motor detail sheet */}
            <MotorDetailSheet
                motor={selectedMotor}
                open={detailOpen}
                onOpenChange={setDetailOpen}
            />
        </div>
    );
}

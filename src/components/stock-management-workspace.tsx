'use client';

import { useMemo, useState } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { StockList } from '@/components/stock-list';
import { StockItemForm } from '@/components/stock-item-form';
import { StockLocationMap } from '@/components/stock-location-map';
import { StockAssignmentView } from '@/components/stock-assignment-view';
import { StockExport } from '@/components/stock-export';
import { StockImport } from '@/components/stock-import';
import { DeliveredDeals } from '@/components/delivered-deals';
import { DeliveredDealsExport } from '@/components/delivered-deals-export';
import { DeliveredDealsImport } from '@/components/delivered-deals-import';
import { Box, Plus, MapPin, Users, Package, Search, Truck, Ship } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface StockManagementWorkspaceProps {
    organisation: any;
    subDealers: any[];
    parentOrg: any;
    moduleId: string;
    filterOrgId: string;
    isAdmin: boolean;
    locations: string[];
    readOnly: boolean;
    vendorName?: string;
}

export function StockManagementWorkspace({
    organisation,
    subDealers,
    parentOrg,
    moduleId,
    filterOrgId,
    isAdmin,
    locations,
    readOnly,
    vendorName,
}: StockManagementWorkspaceProps) {
    const firestore = useFirestore();
    const [view, setView] = useState<'stock' | 'onorder' | 'delivered' | 'map' | 'assignments'>('stock');
    const [formOpen, setFormOpen] = useState(false);

    // Filter state
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [locationFilter, setLocationFilter] = useState('all');
    const [materialFilter, setMaterialFilter] = useState('all');

    // Firestore query for stats
    const inventoryQuery = useMemoFirebase(() => {
        if (!organisation?.id) return null;
        return query(
            collection(firestore, 'inventory'),
            where('moduleId', '==', moduleId),
            where('organisationId', '==', organisation.id)
        );
    }, [firestore, moduleId, organisation?.id]);
    const { data: inventory } = useCollection<any>(inventoryQuery);

    // Firestore query for delivered deals (for export)
    const deliveredQuery = useMemoFirebase(() => {
        if (!organisation?.id) return null;
        return query(
            collection(firestore, 'delivered-deals'),
            where('moduleId', '==', moduleId),
            where('organisationId', '==', organisation.id)
        );
    }, [firestore, moduleId, organisation?.id]);
    const { data: deliveredDeals } = useCollection<any>(deliveredQuery);

    const stats = useMemo(() => {
        const items = inventory || [];
        return {
            inStock: items.filter((i: any) => i.status === 'In Stock').length,
            onOrder: items.filter((i: any) => i.status === 'On Order').length,
            locations: new Set(items.map((i: any) => i.location).filter(Boolean)).size,
            total: items.length,
        };
    }, [inventory]);

    const statCards = [
        { label: 'In Stock', value: stats.inStock, color: 'text-green-600', borderColor: 'border-green-200' },
        { label: 'On Order', value: stats.onOrder, color: 'text-blue-600', borderColor: 'border-blue-200' },
        { label: 'Locations', value: stats.locations, color: 'text-slate-600', borderColor: 'border-slate-200' },
        { label: 'Total', value: stats.total, color: 'text-primary', borderColor: 'border-primary/20' },
    ];

    const allViews = [
        { key: 'stock' as const, label: 'Stock Boats', icon: Package },
        { key: 'onorder' as const, label: 'On Order', icon: Ship },
        { key: 'delivered' as const, label: 'Delivered Deals', icon: Truck },
        { key: 'map' as const, label: 'Map View', icon: MapPin, hideWhenReadOnly: true },
        { key: 'assignments' as const, label: 'Assignments', icon: Users, hideWhenReadOnly: true },
    ];

    const handleViewChange = (newView: typeof view) => {
        setView(newView);
        if (newView === 'stock') setStatusFilter('In Stock');
        else if (newView === 'onorder') setStatusFilter('On Order');
        else setStatusFilter('all');
    };
    const views = readOnly ? allViews.filter(v => !v.hideWhenReadOnly) : allViews;

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between py-4 px-8 bg-white border-b-2 border-slate-300">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary shadow-sm border-2 border-primary/20">
                        <Box className="h-5 w-5" />
                    </div>
                    <div className="flex items-center gap-2">
                        <h2 className="text-base font-black uppercase tracking-widest text-slate-950 leading-none">
                            Stock Management
                        </h2>
                        {vendorName && (
                            <Badge variant="secondary" className="text-[9px] font-black uppercase tracking-widest">
                                {vendorName}
                            </Badge>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {(view === 'stock' || view === 'onorder') && <StockExport inventory={inventory || []} fileName={`stock-${vendorName || 'export'}`} />}
                    {view === 'delivered' && (
                        <>
                            <DeliveredDealsExport deals={deliveredDeals || []} fileName={`delivered-${vendorName || 'export'}`} />
                            {!readOnly && <DeliveredDealsImport moduleId={moduleId} organisationId={organisation?.id || ''} />}
                        </>
                    )}
                    {!readOnly && (view === 'stock' || view === 'onorder') && (
                        <>
                            <StockImport moduleId={moduleId} organisationId={organisation?.id || ''} vendorId={vendorName} />
                            <Button
                                onClick={() => setFormOpen(true)}
                                className="rounded-xl text-[10px] font-black uppercase tracking-widest h-10 px-5 gap-2"
                            >
                                <Plus className="h-4 w-4" />
                                Add Stock Item
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* Stats Bar */}
            <div className="shrink-0 px-8 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {statCards.map((stat) => (
                    <Card
                        key={stat.label}
                        className={`border-2 rounded-2xl p-3 flex flex-col items-center gap-0.5 bg-white ${stat.borderColor}`}
                    >
                        <span className={`text-xl font-black text-slate-900`}>{stat.value}</span>
                        <span className={`text-[9px] font-black uppercase tracking-widest ${stat.color}`}>
                            {stat.label}
                        </span>
                    </Card>
                ))}
            </div>

            {/* Sub-Tab Navigation */}
            <div className="shrink-0 px-8 py-3 flex items-center gap-4 border-b">
                <div className="h-9 bg-slate-100 rounded-xl p-1 inline-flex gap-1">
                    {views.map(({ key, label, icon: Icon }) => (
                        <button
                            key={key}
                            onClick={() => handleViewChange(key)}
                            className={`px-3 h-7 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${
                                view === key
                                    ? 'bg-white shadow-sm text-slate-950 rounded-lg'
                                    : 'text-slate-500 hover:text-slate-700 rounded-lg'
                            }`}
                        >
                            <Icon className="h-3.5 w-3.5" />
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Filter Bar (stock and onorder views) */}
            {(view === 'stock' || view === 'onorder') && (
                <div className="shrink-0 px-8 py-3 flex items-center gap-3 border-b-2 border-slate-200 bg-slate-50/50">
                    <div className="relative flex-1 max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <Input
                            placeholder="Search..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 h-9 rounded-xl border-2 text-xs"
                        />
                    </div>
                    {view === 'stock' && (
                        <div className="flex flex-col gap-1">
                            <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Status</span>
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="w-[130px] h-9 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All</SelectItem>
                                    <SelectItem value="In Stock">In Stock</SelectItem>
                                    <SelectItem value="On Order">On Order</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <div className="flex flex-col gap-1">
                        <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Location</span>
                        <Select value={locationFilter} onValueChange={setLocationFilter}>
                            <SelectTrigger className="w-[140px] h-9 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest">
                                <SelectValue placeholder="Location" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All</SelectItem>
                                {locations.map((loc) => (
                                    <SelectItem key={loc} value={loc}>
                                        {loc}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex flex-col gap-1">
                        <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Material</span>
                        <Select value={materialFilter} onValueChange={setMaterialFilter}>
                            <SelectTrigger className="w-[130px] h-9 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest">
                                <SelectValue placeholder="Material" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All</SelectItem>
                                <SelectItem value="HYP">HYP</SelectItem>
                                <SelectItem value="PVC">PVC</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            )}

            {/* Content Area */}
            <div className="flex-1 min-h-0 overflow-y-auto">
                {view === 'stock' && (
                    <div className="px-8 py-4">
                        <StockList
                            organisation={organisation}
                            subDealers={subDealers}
                            parentOrg={parentOrg}
                            moduleId={moduleId}
                            filterOrgId={filterOrgId}
                            isAdmin={isAdmin}
                            locations={locations}
                            readOnly={readOnly}
                            hideHeader={true}
                        />
                    </div>
                )}

                {view === 'onorder' && (
                    <div className="px-8 py-4">
                        <StockList
                            organisation={organisation}
                            subDealers={subDealers}
                            parentOrg={parentOrg}
                            moduleId={moduleId}
                            filterOrgId={filterOrgId}
                            isAdmin={isAdmin}
                            locations={locations}
                            readOnly={readOnly}
                            hideHeader={true}
                        />
                    </div>
                )}

                {view === 'delivered' && (
                    <div className="px-8 py-4">
                        <DeliveredDeals
                            organisation={organisation}
                            moduleId={moduleId}
                            isAdmin={isAdmin}
                            readOnly={readOnly}
                        />
                    </div>
                )}

                {view === 'map' && (
                    <div className="h-full p-6">
                        <StockLocationMap
                            inventory={inventory || []}
                            locations={locations}
                        />
                    </div>
                )}

                {view === 'assignments' && (
                    <StockAssignmentView
                        organisation={organisation}
                        subDealers={subDealers}
                        moduleId={moduleId}
                        isAdmin={isAdmin}
                        readOnly={readOnly}
                    />
                )}
            </div>

            {/* Add Stock Item Form */}
            <StockItemForm
                open={formOpen}
                onOpenChange={setFormOpen}
                moduleId={moduleId}
                organisationId={organisation?.id || ''}
                locations={locations}
            />
        </div>
    );
}

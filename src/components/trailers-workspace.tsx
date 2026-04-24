'use client';

import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { collection, doc, updateDoc } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Truck, DollarSign, Settings as SettingsIcon, Building2 } from 'lucide-react';
import { ModuleSettingsPanel } from '@/components/module-settings-panel';
import { TrailerPricingWorkspace } from '@/components/trailer-pricing-workspace';
import { TrailerDashboard } from '@/components/trailer-dashboard';

interface Vendor {
    id: string;
    name: string;
    vendorType?: string;
    logoUrl?: string;
    shortCode?: string;
}

interface TrailersWorkspaceProps {
    organisationId: string;
    isAdmin: boolean;
    moduleId: string;
    moduleData: any;
}

type TabKey = 'dashboard' | 'pricing' | 'settings';

const TABS: { key: TabKey; label: string; icon: ReactNode }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: <Truck className="h-4 w-4" /> },
    { key: 'pricing', label: 'Pricing Manager', icon: <DollarSign className="h-4 w-4" /> },
    { key: 'settings', label: 'Settings', icon: <SettingsIcon className="h-4 w-4" /> },
];

export function TrailersWorkspace({ organisationId, isAdmin, moduleId, moduleData }: TrailersWorkspaceProps) {
    const firestore = useFirestore();
    const { toast } = useToast();

    const [activeTab, setActiveTab] = useState<TabKey>(() => {
        if (typeof window !== 'undefined') {
            const t = new URLSearchParams(window.location.search).get('trailerTab');
            if (t === 'dashboard' || t === 'pricing' || t === 'settings') return t as TabKey;
            // Legacy: "catalog" URL param still in the wild — map to dashboard
            if (t === 'catalog') return 'dashboard';
        }
        return 'dashboard';
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const url = new URL(window.location.href);
        if (activeTab && activeTab !== 'dashboard') url.searchParams.set('trailerTab', activeTab);
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
                                    ? 'border-blue-600 text-blue-700'
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
                {activeTab === 'dashboard' && (
                    <TrailerDashboard
                        vendors={selectedVendors}
                        moduleName={moduleData?.name}
                        organisationId={organisationId}
                        isAdmin={isAdmin}
                        moduleData={{ ...moduleData, id: moduleId }}
                    />
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
                        <ModuleSettingsPanel
                            moduleId={moduleId}
                            moduleData={moduleData}
                            organisationId={organisationId}
                            isAdmin={isAdmin}
                            dealerFitFieldName="trailerDealerFitCategories"
                            dealerFitTitle="Trailer Dealer Fit Categories"
                            dealerFitDescription="Categories for dealer-fit options attached to trailers (e.g. Spare Wheel, Wheel Chocks)."
                            preCards={
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
                            }
                        />
                    </ScrollArea>
                )}
            </div>
        </div>
    );
}

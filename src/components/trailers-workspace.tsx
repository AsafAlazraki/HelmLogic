'use client';

import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { collection, doc, updateDoc } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Truck, DollarSign, Settings as SettingsIcon, Building2 } from 'lucide-react';
import { ModuleDealerFitManager } from '@/components/module-dealer-fit-manager';
import { ModuleRoleAssignment } from '@/components/module-role-assignment';

interface Vendor {
    id: string;
    name: string;
    vendorType?: string;
    logoUrl?: string;
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
                        <div className="p-8 max-w-4xl mx-auto space-y-6">
                            <Card className="border-2 rounded-2xl">
                                <CardHeader>
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary border-2 border-primary/20">
                                            <Truck className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <CardTitle>Trailers Catalog</CardTitle>
                                            <CardDescription>
                                                {selectedBrandIds.length > 0
                                                    ? `${selectedBrandIds.length} brand${selectedBrandIds.length === 1 ? '' : 's'} selected · ships in Step 4`
                                                    : 'Select trailer brands in Settings, then seed data in Step 3'}
                                            </CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <p className="text-sm text-slate-500">
                                        The trailer catalog is under construction. Step 3 will seed the catalog from
                                        <code className="mx-1 px-1 py-0.5 rounded bg-slate-100">Trailer Module.xlsx</code>,
                                        and Step 4 will show a grouped series → trailer grid here with full pricing detail.
                                    </p>
                                    <p className="text-xs text-slate-400">
                                        See <code className="px-1 py-0.5 rounded bg-slate-100">tasks/v1.4-trailers-module-design.md</code>{' '}
                                        for the full implementation plan.
                                    </p>
                                </CardContent>
                            </Card>
                        </div>
                    </ScrollArea>
                )}

                {activeTab === 'pricing' && (
                    <ScrollArea className="h-full">
                        <div className="p-8 max-w-4xl mx-auto">
                            <Card className="border-2 rounded-2xl">
                                <CardHeader>
                                    <CardTitle>Pricing Manager</CardTitle>
                                    <CardDescription>Dealer → Nett → Landed → Total CTD → MU% → Sell waterfall. Ships in Step 8.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm text-slate-500">
                                        The full pricing waterfall view is under construction. Once the catalog is seeded,
                                        this tab will let admins edit pricing detail per trailer and see the margin flow end-to-end.
                                    </p>
                                </CardContent>
                            </Card>
                        </div>
                    </ScrollArea>
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
                                            with <code className="px-1 py-0.5 rounded bg-slate-100">vendorType: 'Trailer Brand'</code>.
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
        </div>
    );
}

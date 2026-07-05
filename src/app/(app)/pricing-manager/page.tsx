'use client';

import { useUser } from "@/firebase/auth/use-user";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useCollection } from "@/firebase/firestore/use-collection";
import { useFirestore, useMemoFirebase } from "@/firebase/provider";
import { doc, collection, query, where } from "firebase/firestore";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Building, Search, Coins, ChevronRight, ShieldAlert, ArrowRightLeft, Minimize2, FileSpreadsheet, History as HistoryIcon } from "lucide-react";
import { CatalogExportImport } from "@/components/catalog-export-import";
import { CatalogAuditHistory } from "@/components/catalog-audit-history";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import NextImage from "next/image";
import { HighfieldPricingWorkspace } from "@/components/highfield-pricing-workspace";
import { MotorsTableView } from "@/components/motors-table-view";
import { BoatsTableView } from "@/components/boats-table-view";
import { TrailersTableView } from "@/components/trailers-table-view";
import { ExchangeRateManager } from "@/components/exchange-rate-manager";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HelmLogicLoading } from "@/components/helmlogic-loading";
import { SavedFiltersBar, type SavedCatalogFilter } from "@/components/saved-filters-bar";
import { CatalogHierarchyExport } from "@/components/catalog-hierarchy-export";

interface Vendor {
    id: string;
    name: string;
    logoUrl?: string;
    vendorType: string;
    slug?: string;
    currency?: string;
}

interface Organisation {
    id: string;
    name: string;
    roles?: any[];
    tradingCurrency?: string;
    dataWarehouseSubscriptions?: string[];
    permissions?: Record<string, Record<string, boolean>>;
}

export default function PricingManagerPage() {
    const { user, loading: userLoading } = useUser();
    const firestore = useFirestore();
    
    const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
    const { data: userProfile, loading: profileLoading } = useDoc<any>(userProfileRef);
    
    const organisationId = userProfile?.organisationId;
    const orgRef = useMemoFirebase(() => organisationId ? doc(firestore, 'organisations', organisationId) : null, [firestore, organisationId]);
    const { data: organisation, loading: orgLoading } = useDoc<Organisation>(orgRef);

    const subscribedBrandIds = useMemo(() => organisation?.dataWarehouseSubscriptions || [], [organisation?.dataWarehouseSubscriptions]);

    const vendorsQuery = useMemoFirebase(() => {
        if (subscribedBrandIds.length === 0) return null;
        return query(collection(firestore, 'data-warehouse'), where('__name__', 'in', subscribedBrandIds));
    }, [firestore, subscribedBrandIds]);
    
    const { data: subscribedVendors, loading: vendorsLoading } = useCollection<Vendor>(vendorsQuery);

    const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isExchangeRateManagerOpen, setIsExchangeRateManagerOpen] = useState(false);
    /** v1.11 follow-up — Catalog Manager export/import sheet + audit history sheet. */
    const [isCatalogIoOpen, setIsCatalogIoOpen] = useState(false);
    const [isAuditHistoryOpen, setIsAuditHistoryOpen] = useState(false);

    // Fetch active rates for summary card
    const ratesQuery = useMemoFirebase(() => 
        organisationId ? collection(firestore, `organisations/${organisationId}/exchangeRates`) : null,
    [firestore, organisationId]);
    const { data: activeRates } = useCollection(ratesQuery);

    const hasPermission = useMemo(() => {
        if (userLoading || profileLoading || orgLoading) return true;
        if (userProfile?.appRole === 'HelmLogic Admin') return false;
        
        const roleId = userProfile?.organisationRole;
        const isManagingDirector = organisation?.roles?.find(r => r.id === roleId)?.name === 'Managing Director';
        
        if (!roleId || !organisation?.permissions?.[roleId]) return isManagingDirector;
        return !!organisation.permissions[roleId].can_access_pricing_manager || isManagingDirector;
    }, [userProfile, organisation, userLoading, profileLoading, orgLoading]);

    const filteredVendors = useMemo(() => {
        if (!subscribedVendors) return [];
        if (!searchTerm) return subscribedVendors;
        const lower = searchTerm.toLowerCase();
        return subscribedVendors.filter(v => v.name.toLowerCase().includes(lower));
    }, [subscribedVendors, searchTerm]);

    const activeVendor = useMemo(() => 
        subscribedVendors?.find(v => v.id === selectedVendorId),
    [subscribedVendors, selectedVendorId]);

    const isLoading = userLoading || profileLoading || orgLoading || vendorsLoading;

    if (isLoading) {
        return <HelmLogicLoading label="Synchronizing Financials" />;
    }

    if (!hasPermission) {
        return (
            <div className="space-y-4">
                <Card className="border-destructive/50">
                    <CardHeader>
                        <div className="flex items-center gap-2 text-destructive">
                            <ShieldAlert className="h-6 w-6" />
                            <CardTitle>Access Denied</CardTitle>
                        </div>
                        <CardDescription>You do not have permission to access the Pricing Manager.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">This module is reserved for organization-level pricing strategies. HelmLogic Administrators manage global master data via the Data Warehouse.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[calc(100vh-theme(spacing.24))] space-y-6 overflow-hidden">
            <div className="shrink-0 flex items-start justify-between">
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-tight">Catalog Manager</h1>
                    <p className="text-xs font-black uppercase tracking-widest text-muted-foreground/60 mt-1">
                        Boats · Motors · Trailers · Dealer Fit · Fit-Up · Pricing
                    </p>
                </div>

                {/* v1.11 follow-up — Catalog I/O + Audit History strategy cards.
                    Same gradient style as Exchange Rates so they sit visually
                    together as Catalog Manager top-level actions. */}
                {organisationId && (
                    <div className="flex gap-3 items-stretch">
                    <Card
                        className="w-56 bg-gradient-to-br from-slate-900 to-slate-700 text-white border-none shadow-xl group overflow-hidden h-24 relative cursor-pointer hover:scale-[1.02] transition-all active:scale-[0.98]"
                        onClick={() => setIsCatalogIoOpen(true)}
                    >
                        <div className="absolute -bottom-4 -right-4 p-3 opacity-10 group-hover:opacity-20 transition-all z-0">
                            <FileSpreadsheet className="h-24 w-24 -rotate-[12deg]" />
                        </div>
                        <CardHeader className="p-3 pb-1 relative z-10">
                            <Badge variant="secondary" className="bg-white/20 text-white border-none font-black text-[8px] uppercase tracking-[0.1em] h-4">Import / Export</Badge>
                            <CardTitle className="text-xs font-black uppercase tracking-widest mt-1.5">Catalog xlsx</CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 pt-0 relative z-10">
                            <span className="text-[9px] font-bold uppercase opacity-70 tracking-tighter">Every catalog · diff before commit</span>
                        </CardContent>
                    </Card>
                    {/* v1.18 (Story "Export Data brand -> range -> model")
                        Catalog hierarchy CSV button. One file, full brand /
                        range / model tree across every subscribed Boat Brand. */}
                    <div className="flex items-end pb-1">
                        <CatalogHierarchyExport vendors={subscribedVendors ?? []} />
                    </div>
                    <Card
                        className="w-48 bg-gradient-to-br from-amber-600 to-rose-700 text-white border-none shadow-xl group overflow-hidden h-24 relative cursor-pointer hover:scale-[1.02] transition-all active:scale-[0.98]"
                        onClick={() => setIsAuditHistoryOpen(true)}
                    >
                        <div className="absolute -bottom-4 -right-4 p-3 opacity-10 group-hover:opacity-20 transition-all z-0">
                            <HistoryIcon className="h-24 w-24 -rotate-[12deg]" />
                        </div>
                        <CardHeader className="p-3 pb-1 relative z-10">
                            <Badge variant="secondary" className="bg-white/20 text-white border-none font-black text-[8px] uppercase tracking-[0.1em] h-4">History</Badge>
                            <CardTitle className="text-xs font-black uppercase tracking-widest mt-1.5">Catalog Audit</CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 pt-0 relative z-10">
                            <span className="text-[9px] font-bold uppercase opacity-70 tracking-tighter">Every edit · who & when</span>
                        </CardContent>
                    </Card>
                    </div>
                )}

                {/* Exchange Rates Strategic Card */}
                {organisationId && (
                    <Card 
                        className="w-72 bg-gradient-to-br from-primary to-accent text-primary-foreground border-none shadow-xl group overflow-hidden h-24 relative cursor-pointer hover:scale-[1.02] transition-all active:scale-[0.98]"
                        onClick={() => setIsExchangeRateManagerOpen(true)}
                    >
                        <div className="absolute -bottom-6 -right-6 p-3 opacity-10 group-hover:opacity-20 transition-all z-0">
                            <ArrowRightLeft className="h-28 w-28 -rotate-[30deg]" />
                        </div>
                        <CardHeader className="p-3 pb-1 relative z-10">
                            <div className="flex items-center justify-between">
                                <Badge variant="secondary" className="bg-white/20 text-white border-none font-black text-[8px] uppercase tracking-[0.1em] h-4">Strategy Panel</Badge>
                            </div>
                            <CardTitle className="text-xs font-black uppercase tracking-widest mt-1.5 flex items-center gap-2">
                                Exchange Rates
                                {organisation?.tradingCurrency && (
                                    <Badge className="h-4 bg-white/20 text-white border-none text-[8px] font-black">{organisation.tradingCurrency}</Badge>
                                )}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 pt-0 relative z-10">
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-xl font-black">{activeRates?.length || 0}</span>
                                <span className="text-[9px] font-bold uppercase opacity-70 tracking-tighter">Active Conversions</span>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            <div className="flex-1 min-h-0 flex gap-6 overflow-hidden">
                {/* Vendor Sidebar */}
                <Card className="w-80 shrink-0 flex flex-col overflow-hidden shadow-lg border-2">
                    <CardHeader className="p-4 border-b bg-muted/10 shrink-0">
                        <CardTitle className="text-xs font-black uppercase tracking-widest text-muted-foreground">Subscribed Brands</CardTitle>
                        <div className="relative mt-2">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            {/* v1.17 (Story 3.10.3) — cross-tab filter. The search box
                                filters the brand sidebar (legacy behaviour) AND seeds the
                                active table's row filter so 'F70' or 'highfield CL' narrows
                                both layers in one go. */}
                            <Input
                                placeholder="Search brands or models..."
                                className="pl-8 h-8 text-[11px] font-bold bg-background"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                data-testid="catalog-manager-cross-tab-search"
                            />
                        </div>
                        {/* v1.18 (Story 3.10.4) — saved filter views per user.
                            Chip row below the search input; each chip recalls a
                            saved query, X removes it, "Save current" appears
                            when the search has a value. Pins live as an array
                            field on the user profile doc (no new Firestore
                            collection so no rules deploy needed). */}
                        <SavedFiltersBar
                            savedFilters={(userProfile?.savedCatalogFilters ?? []) as SavedCatalogFilter[]}
                            currentQuery={searchTerm}
                            onApply={setSearchTerm}
                        />
                        <div className="hidden">
                        </div>
                    </CardHeader>
                    <ScrollArea className="flex-1">
                        <div className="p-2 space-y-1">
                            {filteredVendors.length > 0 ? filteredVendors.map(vendor => (
                                <div 
                                    key={vendor.id}
                                    onClick={() => setSelectedVendorId(vendor.id)}
                                    className={cn(
                                        "flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all group",
                                        selectedVendorId === vendor.id 
                                            ? "bg-primary text-primary-foreground shadow-md" 
                                            : "hover:bg-muted border border-transparent"
                                    )}
                                >
                                    <div className={cn(
                                        "h-10 w-10 relative rounded-lg p-1.5 flex items-center justify-center shrink-0 border",
                                        selectedVendorId === vendor.id ? "bg-white border-white/20" : "bg-white border-muted shadow-sm"
                                    )}>
                                        {vendor.logoUrl ? (
                                            <NextImage src={vendor.logoUrl} alt={vendor.name} fill className="object-contain p-1" />
                                        ) : (
                                            <Building className="h-5 w-5 text-muted-foreground" />
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[11px] font-black uppercase tracking-tight truncate">{vendor.name}</p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <p className={cn(
                                                "text-[9px] font-bold uppercase tracking-tighter opacity-60",
                                                selectedVendorId === vendor.id ? "text-primary-foreground" : "text-muted-foreground"
                                            )}>
                                                {vendor.vendorType}
                                            </p>
                                            {vendor.currency && (
                                                <Badge variant="outline" className={cn("h-3.5 text-[7px] font-black px-1.5", selectedVendorId === vendor.id ? "border-white/20 text-white" : "border-primary/20 text-primary")}>
                                                    {vendor.currency}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                    <ChevronRight className={cn(
                                        "h-4 w-4 shrink-0 transition-transform",
                                        selectedVendorId === vendor.id ? "translate-x-0 opacity-100" : "opacity-0 -translate-x-2 group-hover:translate-x-0 group-hover:opacity-100"
                                    )} />
                                </div>
                            )) : (
                                <div className="py-12 text-center text-muted-foreground/40 italic text-xs">
                                    No brands found.
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </Card>

                {/* Workspace Area */}
                <Card className="flex-1 min-w-0 shadow-lg border-2 overflow-hidden flex flex-col bg-muted/5">
                    {activeVendor ? (
                        activeVendor.slug === 'highfield' ? (
                            <HighfieldPricingWorkspace
                                vendor={activeVendor}
                                organisationId={organisationId}
                            />
                        ) : activeVendor.vendorType === 'Motor Brand' ? (
                            /* v1.11 follow-up — Story 3.7.3 Motors Table mounted
                               here so motor brands have a read view inside the
                               Catalog Manager instead of "coming soon".
                               v1.17/3.10.3 — initialSearch threads the cross-tab
                               filter through to the table's internal search. */
                            <div className="p-6 overflow-y-auto">
                                <MotorsTableView organisationId={organisationId} initialSearch={searchTerm} />
                            </div>
                        ) : activeVendor.vendorType === 'Boat Brand' ? (
                            <div className="p-6 overflow-y-auto">
                                <BoatsTableView initialSearch={searchTerm} />
                            </div>
                        ) : activeVendor.vendorType === 'Trailer Brand' ? (
                            <div className="p-6 overflow-y-auto">
                                <TrailersTableView organisationId={organisationId} initialSearch={searchTerm} />
                            </div>
                        ) : (
                            <div className="flex flex-col h-full overflow-hidden">
                                <CardHeader className="p-6 border-b bg-background shrink-0">
                                    <div className="flex items-center gap-4">
                                        <div className="h-12 w-12 relative bg-white rounded-xl border-2 p-2 shadow-sm shrink-0">
                                            {activeVendor.logoUrl ? (
                                                <NextImage src={activeVendor.logoUrl} alt={activeVendor.name} fill className="object-contain p-1" />
                                            ) : (
                                                <Building className="h-6 w-6 m-auto mt-1 text-muted-foreground" />
                                            )}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <CardTitle className="text-xl font-black uppercase tracking-tight">{activeVendor.name}</CardTitle>
                                                {activeVendor.currency && <Badge variant="outline" className="font-black text-[10px] uppercase">{activeVendor.currency}</Badge>}
                                            </div>
                                            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-primary">Pricing & Profitability Strategy</CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="flex-1 min-h-0 overflow-y-auto p-6 text-center py-20">
                                    <Coins className="h-16 w-16 text-primary/20 mb-4 animate-pulse mx-auto" />
                                    <h3 className="text-lg font-black uppercase tracking-tight">Strategy Workspace Ready</h3>
                                    <p className="text-sm text-muted-foreground max-w-sm mt-2 mx-auto">
                                        The specialized pricing workspace for {activeVendor.name} is currently being enabled. Contact support for early access.
                                    </p>
                                </CardContent>
                            </div>
                        )
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center p-12 text-muted-foreground">
                            <Building className="h-16 w-16 mb-4 opacity-10" />
                            <p className="text-sm font-black uppercase tracking-widest">Select a brand from the left to manage pricing</p>
                        </div>
                    )}
                </Card>
            </div>

            {/* Global Strategy Overlays */}
            {organisationId && (
                <ExchangeRateManager
                    organisationId={organisationId}
                    isOpen={isExchangeRateManagerOpen}
                    onClose={() => setIsExchangeRateManagerOpen(false)}
                />
            )}

            {/* v1.11 follow-up — Catalog Manager Import/Export panel. */}
            {organisationId && (
                <Sheet open={isCatalogIoOpen} onOpenChange={setIsCatalogIoOpen}>
                    <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
                        <SheetHeader>
                            <SheetTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" /> Catalog Import / Export</SheetTitle>
                            <SheetDescription className="text-xs">Export the catalog to xlsx, edit in Excel, re-upload, and review a diff before anything writes. Every commit is recorded in Catalog Audit.</SheetDescription>
                        </SheetHeader>
                        <div className="mt-4">
                            <CatalogExportImport organisationId={organisationId} />
                        </div>
                    </SheetContent>
                </Sheet>
            )}

            {/* v1.11 follow-up — Catalog Audit history viewer. */}
            {organisationId && (
                <Sheet open={isAuditHistoryOpen} onOpenChange={setIsAuditHistoryOpen}>
                    <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
                        <SheetHeader>
                            <SheetTitle className="flex items-center gap-2"><HistoryIcon className="h-5 w-5" /> Catalog Audit History</SheetTitle>
                            <SheetDescription className="text-xs">Every catalog import + manual edit (when wired through). Newest first.</SheetDescription>
                        </SheetHeader>
                        <div className="mt-4">
                            <CatalogAuditHistory organisationId={organisationId} />
                        </div>
                    </SheetContent>
                </Sheet>
            )}
        </div>
    );
}

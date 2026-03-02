
'use client';

import { useUser } from "@/firebase/auth/use-user";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useCollection } from "@/firebase/firestore/use-collection";
import { useFirestore, useMemoFirebase } from "@/firebase/provider";
import { doc, collection, query, where } from "firebase/firestore";
import { useState, useMemo } from "react";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Building, Search, Coins, ChevronRight, ShieldAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface Vendor {
    id: string;
    name: string;
    logoUrl?: string;
    vendorType: string;
}

interface Organisation {
    id: string;
    name: string;
    roles?: any[];
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

    const subscribedBrandIds = organisation?.dataWarehouseSubscriptions || [];
    
    const vendorsQuery = useMemoFirebase(() => {
        if (subscribedBrandIds.length === 0) return null;
        return query(collection(firestore, 'data-warehouse'), where('__name__', 'in', subscribedBrandIds));
    }, [firestore, subscribedBrandIds]);
    
    const { data: subscribedVendors, loading: vendorsLoading } = useCollection<Vendor>(vendorsQuery);

    const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const hasPermission = useMemo(() => {
        if (userLoading || profileLoading || orgLoading) return true;
        // HelmLogic Admin should NOT access pricing manager - they deal in Master Data
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
        return (
            <div className="flex h-screen w-full items-center justify-center">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
            </div>
        );
    }

    if (!hasPermission) {
        return (
            <div className="space-y-4">
                <div>
                    <h1 className="text-2xl font-black uppercase tracking-tight">Pricing Manager</h1>
                    <BreadcrumbNav />
                </div>
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
        <div className="flex flex-col h-[calc(100vh-theme(spacing.24))] space-y-4 overflow-hidden">
            <div className="shrink-0">
                <h1 className="text-2xl font-black uppercase tracking-tight">Pricing Manager</h1>
                <BreadcrumbNav />
            </div>

            <div className="flex-1 min-h-0 flex gap-6 overflow-hidden">
                {/* Vendor Sidebar */}
                <Card className="w-80 shrink-0 flex flex-col overflow-hidden shadow-lg border-2">
                    <CardHeader className="p-4 border-b bg-muted/10 shrink-0">
                        <CardTitle className="text-xs font-black uppercase tracking-widest text-muted-foreground">Subscribed Brands</CardTitle>
                        <div className="relative mt-2">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input 
                                placeholder="Search brands..." 
                                className="pl-8 h-8 text-[11px] font-bold bg-background"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
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
                                            <Image src={vendor.logoUrl} alt={vendor.name} fill className="object-contain p-1" unoptimized />
                                        ) : (
                                            <Building className="h-5 w-5 text-muted-foreground" />
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[11px] font-black uppercase tracking-tight truncate">{vendor.name}</p>
                                        <p className={cn(
                                            "text-[9px] font-bold uppercase tracking-tighter opacity-60",
                                            selectedVendorId === vendor.id ? "text-primary-foreground" : "text-muted-foreground"
                                        )}>
                                            {vendor.vendorType}
                                        </p>
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
                        <div className="flex flex-col h-full overflow-hidden">
                            <CardHeader className="p-6 border-b bg-background shrink-0">
                                <div className="flex items-center gap-4">
                                    <div className="h-12 w-12 relative bg-white rounded-xl border-2 p-2 shadow-sm shrink-0">
                                        {activeVendor.logoUrl ? (
                                            <Image src={activeVendor.logoUrl} alt={activeVendor.name} fill className="object-contain p-1" unoptimized />
                                        ) : (
                                            <Building className="h-6 w-6 m-auto mt-1 text-muted-foreground" />
                                        )}
                                    </div>
                                    <div>
                                        <CardTitle className="text-xl font-black uppercase tracking-tight">{activeVendor.name}</CardTitle>
                                        <CardDescription className="text-[10px] font-black uppercase tracking-widest text-primary">Pricing & Profitability Strategy</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="flex-1 min-h-0 overflow-y-auto p-6">
                                <div className="flex flex-col items-center justify-center h-full text-center py-20">
                                    <Coins className="h-16 w-16 text-primary/20 mb-4 animate-pulse" />
                                    <h3 className="text-lg font-black uppercase tracking-tight">Strategy Workspace Ready</h3>
                                    <p className="text-sm text-muted-foreground max-w-sm mt-2">
                                        Select a brand from the sidebar to begin configuring your local pricing levels, margins, and bulk update rules for {organisation?.name}.
                                    </p>
                                </div>
                            </CardContent>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center p-12 text-muted-foreground">
                            <Building className="h-16 w-16 mb-4 opacity-10" />
                            <p className="text-sm font-black uppercase tracking-widest">Select a brand from the left to manage pricing</p>
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}

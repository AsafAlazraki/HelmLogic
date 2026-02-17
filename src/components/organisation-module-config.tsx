'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Check, ChevronLeft, Building, Wrench, ShieldCheck, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Vendor {
    id: string;
    name: string;
    vendorType: string;
}

interface Module {
    id: string;
    name: string;
    mainVendorId: string;
    associatedVendorIds?: string[];
}

interface DealerFitCategory {
    id: string;
    name: string;
}

interface Organisation {
    id: string;
    name: string;
    moduleAssociatedVendorAccess?: Record<string, string[]>;
    dealerFitCategories?: string[];
}

export function OrganisationModuleConfig({ 
    organisation, 
    module, 
    allVendors, 
    allDealerFitCategories,
    onBack,
    onUpdateVendors,
    onUpdateCategories
}: { 
    organisation: Organisation; 
    module: Module; 
    allVendors: Vendor[]; 
    allDealerFitCategories: DealerFitCategory[];
    onBack: () => void;
    onUpdateVendors: (vendorIds: string[]) => void;
    onUpdateCategories: (categoryIds: string[]) => void;
}) {
    const currentAllowedVendorIds = useMemo(() => 
        organisation.moduleAssociatedVendorAccess?.[module.id] || [], 
    [organisation, module]);

    const associatedVendors = useMemo(() => {
        if (!module.associatedVendorIds || !allVendors) return [];
        return allVendors.filter(v => module.associatedVendorIds?.includes(v.id));
    }, [module, allVendors]);

    const handleVendorToggle = (vendorId: string, checked: boolean) => {
        const newValue = checked 
            ? [...currentAllowedVendorIds, vendorId]
            : currentAllowedVendorIds.filter(id => id !== vendorId);
        onUpdateVendors(newValue);
    };

    const handleCategoryToggle = (catId: string, checked: boolean) => {
        const current = organisation.dealerFitCategories || [];
        const newValue = checked 
            ? [...current, catId]
            : current.filter(id => id !== catId);
        onUpdateCategories(newValue);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" onClick={onBack}>
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Back to list
                </Button>
                <div className="flex items-center gap-2">
                    <div className="h-8 w-8 bg-secondary rounded-full flex items-center justify-center">
                        <Building className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <h2 className="text-xl font-bold">{organisation.name} Configuration</h2>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Vendor Access Section */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Globe className="h-5 w-5 text-primary" />
                            <CardTitle>Vendor Access</CardTitle>
                        </div>
                        <CardDescription>
                            Control which vendors this organisation can see within the {module.name} module.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Always Available</h4>
                            <div className="space-y-2">
                                {allVendors?.find(v => v.id === module.mainVendorId) && (
                                    <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-secondary/30 border text-sm opacity-70">
                                        <Check className="h-4 w-4 text-green-600" />
                                        <span>Main Vendor: {allVendors.find(v => v.id === module.mainVendorId)?.name}</span>
                                    </div>
                                )}
                                {associatedVendors.filter(v => v.vendorType === 'Motor Brand').map(v => (
                                    <div key={v.id} className="flex items-center gap-2 px-3 py-2 rounded-md bg-secondary/30 border text-sm opacity-70">
                                        <Check className="h-4 w-4 text-green-600" />
                                        <span>Motor Brand: {v.name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        
                        <Separator />

                        <div className="space-y-2">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Optional Vendors</h4>
                            <div className="grid gap-2">
                                {associatedVendors.filter(v => v.id !== module.mainVendorId && v.vendorType !== 'Motor Brand').length > 0 ? (
                                    associatedVendors.filter(v => v.id !== module.mainVendorId && v.vendorType !== 'Motor Brand').map(vendor => {
                                        const isChecked = currentAllowedVendorIds.includes(vendor.id);
                                        return (
                                            <div 
                                                key={vendor.id} 
                                                className={cn(
                                                    "flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-all cursor-pointer",
                                                    isChecked ? "bg-secondary/50 border-primary/20" : "hover:bg-muted/50 opacity-60"
                                                )}
                                                onClick={() => handleVendorToggle(vendor.id, !isChecked)}
                                            >
                                                <div className="flex-1 flex items-center gap-2">
                                                    {isChecked ? <Check className="h-4 w-4 text-green-600" /> : <div className="w-4 h-4" />}
                                                    <span className={cn(isChecked ? "font-medium text-foreground" : "")}>{vendor.name}</span>
                                                </div>
                                                <Checkbox 
                                                    checked={isChecked}
                                                    onCheckedChange={(checked) => handleVendorToggle(vendor.id, !!checked)}
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                            </div>
                                        );
                                    })
                                ) : (
                                    <p className="text-xs text-muted-foreground py-4 text-center border border-dashed rounded-md italic">No optional vendors configured for this module.</p>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Dealer Fit Categories Section */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Wrench className="h-5 w-5 text-primary" />
                            <CardTitle>Dealer Fit Options</CardTitle>
                        </div>
                        <CardDescription>
                            Select which master category cards are available for this organisation.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-2">
                            {allDealerFitCategories && allDealerFitCategories.length > 0 ? (
                                allDealerFitCategories.map(cat => {
                                    const isChecked = (organisation.dealerFitCategories || []).includes(cat.id);
                                    return (
                                        <div 
                                            key={cat.id} 
                                            className={cn(
                                                "flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-all cursor-pointer",
                                                isChecked ? "bg-secondary/50 border-primary/20" : "hover:bg-muted/50 opacity-60"
                                            )}
                                            onClick={() => handleCategoryToggle(cat.id, !isChecked)}
                                        >
                                            <div className="flex-1 flex items-center gap-2">
                                                {isChecked ? <Check className="h-4 w-4 text-primary" /> : <div className="w-4 h-4" />}
                                                <span className={cn(isChecked ? "font-medium text-foreground" : "")}>{cat.name}</span>
                                            </div>
                                            <Checkbox 
                                                checked={isChecked}
                                                onCheckedChange={(checked) => handleCategoryToggle(cat.id, !!checked)}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="text-center py-8 border border-dashed rounded-md">
                                    <p className="text-sm text-muted-foreground">No master categories created.</p>
                                    <Button variant="link" size="sm" asChild>
                                        <a href="/admin/dealer-fit-options">Create Master Categories</a>
                                    </Button>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
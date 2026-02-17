'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Check, ChevronLeft, Building, Wrench, ShieldCheck, Globe, Users, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ModuleVendorAccessDialog } from '@/components/module-vendor-access-dialog';

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
    primaryLogoUrl?: string;
    enabledModuleSubscriptions?: string[];
    moduleAssociatedVendorAccess?: Record<string, string[]>;
    dealerFitCategories?: string[];
    subDealersEnabled?: boolean;
}

export function OrganisationModuleConfig({ 
    organisation, 
    subDealers = [],
    module, 
    allVendors, 
    allDealerFitCategories,
    onBack,
    onUpdateVendors,
    onUpdateCategories,
    onToggleSubDealerAccess,
    onUpdateSubDealerVendors
}: { 
    organisation: Organisation; 
    subDealers?: Organisation[];
    module: Module; 
    allVendors: Vendor[]; 
    allDealerFitCategories: DealerFitCategory[];
    onBack: () => void;
    onUpdateVendors: (vendorIds: string[]) => void;
    onUpdateCategories: (categoryIds: string[]) => void;
    onToggleSubDealerAccess?: (sdId: string, hasAccess: boolean) => void;
    onUpdateSubDealerVendors?: (sdId: string, vendorIds: string[]) => void;
}) {
    const [configSdId, setConfigSdId] = useState<string | null>(null);

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

    const activeConfigSd = useMemo(() => 
        configSdId ? subDealers.find(sd => sd.id === configSdId) : null,
    [configSdId, subDealers]);

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" onClick={onBack}>
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Back to list
                </Button>
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-secondary rounded-full flex items-center justify-center overflow-hidden border">
                        {organisation.primaryLogoUrl ? (
                            <Image src={organisation.primaryLogoUrl} alt={organisation.name} fill className="object-contain p-1" sizes="40px" />
                        ) : (
                            <Building className="h-5 w-5 text-muted-foreground" />
                        )}
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

                {/* Sub Dealers Access Section */}
                {organisation.subDealersEnabled && (
                    <Card className="lg:col-span-2">
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <Users className="h-5 w-5 text-primary" />
                                <CardTitle>Sub Dealers</CardTitle>
                            </div>
                            <CardDescription>Manage module access and vendor visibility for associated sub-dealers.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {subDealers.length > 0 ? (
                                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                    {subDealers.map(sd => {
                                        const hasAccess = sd.enabledModuleSubscriptions?.includes(module.id);
                                        return (
                                            <Card key={sd.id} className={cn("relative group transition-all", hasAccess ? "border-primary/50" : "opacity-70 grayscale")}>
                                                <div className="p-4 flex flex-col gap-4">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <div className="h-10 w-10 bg-secondary rounded-full flex items-center justify-center overflow-hidden border">
                                                                {sd.primaryLogoUrl ? (
                                                                    <Image src={sd.primaryLogoUrl} alt={sd.name} fill className="object-contain p-1" sizes="40px" />
                                                                ) : (
                                                                    <Building className="h-5 w-5 text-muted-foreground" />
                                                                )}
                                                            </div>
                                                            <div className="font-semibold text-sm">{sd.name}</div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <Checkbox 
                                                                id={`sd-${sd.id}`} 
                                                                checked={hasAccess} 
                                                                onCheckedChange={(checked) => onToggleSubDealerAccess?.(sd.id, !!checked)} 
                                                            />
                                                            <label htmlFor={`sd-${sd.id}`} className="text-xs text-muted-foreground cursor-pointer">Access</label>
                                                        </div>
                                                    </div>
                                                    {hasAccess && (
                                                        <Button variant="outline" size="sm" className="w-full" onClick={() => setConfigSdId(sd.id)}>
                                                            <Settings2 className="mr-2 h-4 w-4" /> Config Vendors
                                                        </Button>
                                                    )}
                                                </div>
                                            </Card>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-center py-12 border border-dashed rounded-lg">
                                    <Users className="h-12 w-12 mx-auto mb-4 opacity-20"/>
                                    <p className="text-sm text-muted-foreground">No sub-dealers found for this organisation.</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>

            {activeConfigSd && (
                <ModuleVendorAccessDialog 
                    isOpen={!!activeConfigSd}
                    setIsOpen={(open) => !open && setConfigSdId(null)}
                    module={module}
                    organisation={activeConfigSd as any}
                    allVendors={allVendors}
                    onUpdate={onUpdateSubDealerVendors || (() => {})}
                />
            )}
        </div>
    );
}

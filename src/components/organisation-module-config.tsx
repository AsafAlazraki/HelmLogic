'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Check, ChevronLeft, Building, Wrench, ShieldCheck, Globe, Users, Settings2, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ModuleVendorAccessDialog } from '@/components/module-vendor-access-dialog';
import { useFirestore } from '@/firebase/provider';
import { doc, updateDoc } from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';

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
    const [editingAssociatedVendors, setEditingAssociatedVendors] = useState(false);
    const firestore = useFirestore();

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
                    <div className="h-10 w-10 bg-secondary rounded-full flex items-center justify-center border">
                        <Building className="h-5 w-5 text-muted-foreground" />
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
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Associated Vendors</h4>
                                    <p className="text-xs text-muted-foreground">Vendors whose data is available in this module (dealer fit, motors, etc.)</p>
                                </div>
                                <Button variant="outline" size="sm" className="rounded-xl border-2 text-[10px] font-black uppercase tracking-widest gap-1" onClick={() => setEditingAssociatedVendors(true)}>
                                    <Pencil className="h-3 w-3" />
                                    Edit
                                </Button>
                            </div>
                            <div className="space-y-2">
                                {allVendors?.find(v => v.id === module.mainVendorId) && (
                                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/5 border-2 border-primary/20 text-sm">
                                        <Check className="h-4 w-4 text-primary" />
                                        <span className="font-semibold">Main: {allVendors.find(v => v.id === module.mainVendorId)?.name}</span>
                                    </div>
                                )}
                                {associatedVendors.length > 0 ? associatedVendors.map(v => (
                                    <div key={v.id} className="flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm">
                                        <Check className="h-4 w-4 text-green-600" />
                                        <span>{v.name}</span>
                                        <span className="text-[9px] text-slate-400 ml-auto">{v.vendorType}</span>
                                    </div>
                                )) : (
                                    <p className="text-xs text-slate-400 italic py-2">No associated vendors. Click Edit to add.</p>
                                )}
                            </div>
                        </div>

                        {/* Edit Associated Vendors Dialog */}
                        <Dialog open={editingAssociatedVendors} onOpenChange={setEditingAssociatedVendors}>
                            <DialogContent className="rounded-3xl border-4 shadow-2xl">
                                <DialogHeader>
                                    <DialogTitle className="text-xl font-black uppercase tracking-tight">Associated Vendors</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-2 max-h-[60vh] overflow-y-auto py-2">
                                    {allVendors?.filter(v => v.id !== module.mainVendorId).map(v => {
                                        const isAssociated = (module.associatedVendorIds || []).includes(v.id);
                                        return (
                                            <div
                                                key={v.id}
                                                className={cn(
                                                    "flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all",
                                                    isAssociated ? "border-primary bg-primary/5" : "hover:border-slate-300"
                                                )}
                                                onClick={async () => {
                                                    const current = module.associatedVendorIds || [];
                                                    const updated = isAssociated
                                                        ? current.filter((id: string) => id !== v.id)
                                                        : [...current, v.id];
                                                    try {
                                                        await updateDoc(doc(firestore, 'modules', module.id), { associatedVendorIds: updated });
                                                        toast({ title: isAssociated ? `${v.name} removed` : `${v.name} added` });
                                                    } catch (error) {
                                                        console.error('Failed to update:', error);
                                                        toast({ variant: 'destructive', title: 'Update failed' });
                                                    }
                                                }}
                                            >
                                                <input type="checkbox" checked={isAssociated} readOnly className="rounded border-2" />
                                                <div>
                                                    <p className="text-xs font-bold">{v.name}</p>
                                                    {v.vendorType && <p className="text-[9px] text-slate-400">{v.vendorType}</p>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <DialogFooter>
                                    <DialogClose asChild>
                                        <Button className="rounded-xl">Done</Button>
                                    </DialogClose>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
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
                            <CardDescription>Manage module access and view configurations for associated sub-dealers.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {subDealers.length > 0 ? (
                                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                    {subDealers.map(sd => {
                                        const hasAccess = sd.enabledModuleSubscriptions?.includes(module.id);
                                        return (
                                            <Card key={sd.id} className={cn("relative group transition-all", hasAccess ? "border-primary/50 shadow-sm" : "opacity-70 grayscale")}>
                                                <div className="p-4 flex flex-col gap-4">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <div className="h-10 w-10 bg-secondary rounded-full flex items-center justify-center border">
                                                                <Building className="h-5 w-5 text-muted-foreground" />
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
        </div>
    );
}

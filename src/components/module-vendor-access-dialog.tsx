'use client';

import { useMemo } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Check } from 'lucide-react';

interface Vendor {
    id: string;
    name: string;
    logoUrl?: string;
    vendorType: string;
}

interface Module {
    id: string;
    name: string;
    logoUrl?: string;
    mainVendorId: string;
    associatedVendorIds?: string[];
}

interface Organisation {
    id: string;
    name: string;
    moduleAssociatedVendorAccess?: Record<string, string[]>;
}

export function ModuleVendorAccessDialog({ 
    isOpen, 
    setIsOpen, 
    module, 
    organisation, 
    allVendors,
    onUpdate
}: { 
    isOpen: boolean; 
    setIsOpen: (open: boolean) => void; 
    module: Module; 
    organisation: Organisation;
    allVendors: Vendor[];
    onUpdate: (moduleId: string, vendorIds: string[]) => void;
}) {
    const currentAllowedVendorIds = useMemo(() => 
        organisation.moduleAssociatedVendorAccess?.[module.id] || [], 
    [organisation, module]);

    const associatedVendors = useMemo(() => {
        if (!module.associatedVendorIds || !allVendors) return [];
        return allVendors.filter(v => module.associatedVendorIds?.includes(v.id));
    }, [module, allVendors]);

    // Main vendor and Motor brands are always accessible
    const motorVendorIds = useMemo(() => 
        associatedVendors.filter(v => v.vendorType === 'Motor Brand').map(v => v.id),
    [associatedVendors]);

    const handleToggle = (vendorId: string, checked: boolean) => {
        const newValue = checked 
            ? [...currentAllowedVendorIds, vendorId]
            : currentAllowedVendorIds.filter(id => id !== vendorId);
        onUpdate(module.id, newValue);
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Configure Vendor Access for {module.name}</DialogTitle>
                    <DialogDescription>
                        Grant or revoke access to specific vendors for <strong>{organisation.name}</strong> within this module.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <h4 className="text-sm font-medium text-foreground/80 uppercase tracking-wider">Auto-Granted Access</h4>
                        <p className="text-xs text-muted-foreground mb-2">These vendors are always available within the module.</p>
                        <div className="space-y-2">
                            {allVendors?.find(v => v.id === module.mainVendorId) && (
                                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-secondary/50 border text-sm opacity-70">
                                    <Check className="h-4 w-4 text-green-600" />
                                    <span>Main Vendor: {allVendors.find(v => v.id === module.mainVendorId)?.name}</span>
                                </div>
                            )}
                            {associatedVendors.filter(v => v.vendorType === 'Motor Brand').map(v => (
                                <div key={v.id} className="flex items-center gap-2 px-3 py-2 rounded-md bg-secondary/50 border text-sm opacity-70">
                                    <Check className="h-4 w-4 text-green-600" />
                                    <span>Motor Brand: {v.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <Separator />
                    <div className="space-y-2">
                        <h4 className="text-sm font-medium text-foreground/80 uppercase tracking-wider">Optional Associated Vendors</h4>
                        <p className="text-xs text-muted-foreground mb-2">Select which additional vendors this organisation can access.</p>
                        <div className="grid gap-2">
                            {associatedVendors.filter(v => v.id !== module.mainVendorId && v.vendorType !== 'Motor Brand').length > 0 ? (
                                associatedVendors.filter(v => v.id !== module.mainVendorId && v.vendorType !== 'Motor Brand').map(vendor => (
                                    <div key={vendor.id} className="flex items-center space-x-3 p-2 rounded-md border hover:bg-muted/50 transition-colors">
                                        <Checkbox 
                                            id={`vendor-${vendor.id}`} 
                                            checked={currentAllowedVendorIds.includes(vendor.id)}
                                            onCheckedChange={(checked) => handleToggle(vendor.id, !!checked)}
                                        />
                                        <Label htmlFor={`vendor-${vendor.id}`} className="font-normal text-sm cursor-pointer flex-1">
                                            {vendor.name}
                                        </Label>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-muted-foreground py-4 text-center border-2 border-dashed rounded-md">No optional associated vendors for this module.</p>
                            )}
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button">Close</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

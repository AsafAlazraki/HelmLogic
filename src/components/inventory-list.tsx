'use client';

import { useMemo, useState } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { collection, query, where, doc, updateDoc, addDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowRightLeft, PackagePlus, Trash2 } from 'lucide-react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from '@/hooks/use-toast';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
} from '@/components/ui/dialog';
import { ScrollArea } from './ui/scroll-area';

interface InventoryItem {
    id: string;
    name: string;
    stockNumber: string;
    organisationId: string;
    moduleId: string;
    status: string;
}

interface Organisation {
    id: string;
    name: string;
    parentOrganisationId?: string;
}

export function InventoryList({ 
    organisation, 
    subDealers, 
    parentOrg, 
    moduleId,
    filterOrgId,
    isAdmin = false
}: { 
    organisation: Organisation; 
    subDealers: Organisation[]; 
    parentOrg: Organisation | null;
    moduleId: string;
    filterOrgId: string | 'all' | 'local';
    isAdmin?: boolean;
}) {
    const firestore = useFirestore();
    
    // Determine the set of IDs to query
    const targetOrgIds = useMemo(() => {
        if (filterOrgId === 'local') return [organisation.id];
        if (filterOrgId === 'all') return [organisation.id, ...subDealers.map(sd => sd.id)];
        return [filterOrgId];
    }, [filterOrgId, organisation, subDealers]);

    const inventoryQuery = useMemoFirebase(() => {
        if (targetOrgIds.length === 0) return null;
        return query(
            collection(firestore, 'inventory'),
            where('moduleId', '==', moduleId),
            where('organisationId', 'in', targetOrgIds)
        );
    }, [firestore, moduleId, targetOrgIds]);

    const { data: inventory, loading } = useCollection<InventoryItem>(inventoryQuery);

    const [isAssigning, setIsAssigning] = useState(false);
    const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
    const [targetId, setTargetId] = useState<string>('');

    const availableTargets = useMemo(() => {
        const targets = [];
        if (parentOrg) targets.push({ id: parentOrg.id, name: `Parent: ${parentOrg.name}` });
        if (organisation.id !== selectedItem?.organisationId) targets.push({ id: organisation.id, name: `My Org: ${organisation.name}` });
        subDealers.forEach(sd => {
            if (sd.id !== selectedItem?.organisationId) {
                targets.push({ id: sd.id, name: `Sub Dealer: ${sd.name}` });
            }
        });
        return targets;
    }, [organisation, subDealers, parentOrg, selectedItem]);

    const handleAssign = async () => {
        if (!selectedItem || !targetId) return;
        setIsAssigning(true);
        try {
            const itemRef = doc(firestore, 'inventory', selectedItem.id);
            await updateDoc(itemRef, { organisationId: targetId });
            toast({ title: "Stock Assigned", description: `Successfully moved to ${availableTargets.find(t => t.id === targetId)?.name}` });
            setSelectedItem(null);
        } catch (error) {
            toast({ variant: 'destructive', title: "Transfer Failed" });
        } finally {
            setIsAssigning(false);
        }
    };

    const handleAddTestStock = async () => {
        try {
            await addDoc(collection(firestore, 'inventory'), {
                name: `Test Boat ${Math.floor(Math.random() * 1000)}`,
                stockNumber: `SN-${Math.floor(Math.random() * 10000)}`,
                organisationId: organisation.id,
                moduleId: moduleId,
                status: 'Available',
                createdAt: serverTimestamp()
            });
            toast({ title: "Test Stock Added" });
        } catch (error) {
            toast({ variant: 'destructive', title: "Failed to add stock" });
        }
    };

    const handleDeleteItem = async (itemId: string) => {
        try {
            await deleteDoc(doc(firestore, 'inventory', itemId));
            toast({ title: "Item deleted." });
        } catch (error) {
            toast({ variant: 'destructive', title: "Delete failed." });
        }
    };

    if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

    return (
        <div className="space-y-4">
            {(!inventory || inventory.length === 0) ? (
                <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-md text-center">
                    <p className="text-muted-foreground text-sm mb-4">No inventory found for this selection.</p>
                    <Button variant="outline" size="sm" onClick={handleAddTestStock}>
                        <PackagePlus className="mr-2 h-4 w-4" /> Add Test Stock
                    </Button>
                </div>
            ) : (
                <div className="space-y-2">
                    <ScrollArea className="h-[300px] w-full pr-2">
                        <div className="space-y-2">
                            {inventory.map(item => (
                                <div key={item.id} className="flex items-center justify-between p-3 border rounded-md bg-background group hover:border-primary transition-colors">
                                    <div>
                                        <p className="font-semibold text-sm">{item.name}</p>
                                        <p className="text-xs text-muted-foreground">{item.stockNumber}</p>
                                    </div>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            onClick={() => setSelectedItem(item)}
                                            className="h-8 px-2"
                                        >
                                            <ArrowRightLeft className="h-4 w-4 mr-2" />
                                            Assign
                                        </Button>
                                        {isAdmin && (
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/5"
                                                onClick={() => handleDeleteItem(item.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                    <div className="pt-2">
                        <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground hover:text-foreground" onClick={handleAddTestStock}>
                            + Add More Test Stock
                        </Button>
                    </div>
                </div>
            )}

            <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Assign Inventory Item</DialogTitle>
                        <DialogDescription>
                            Where would you like to assign <strong>{selectedItem?.name}</strong> ({selectedItem?.stockNumber})?
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Select value={targetId} onValueChange={setTargetId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select destination organisation" />
                            </SelectTrigger>
                            <SelectContent>
                                {availableTargets.map(target => (
                                    <SelectItem key={target.id} value={target.id}>{target.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                        <Button onClick={handleAssign} disabled={isAssigning || !targetId}>
                            {isAssigning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Confirm Assignment
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

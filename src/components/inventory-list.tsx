'use client';

import { useMemo, useState } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { collection, query, where, doc, updateDoc, addDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowRightLeft, PackagePlus, Trash2, Box, Anchor, ChevronRight, CheckCircle2 } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';
import { Badge } from './ui/badge';

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
        const itemRef = doc(firestore, 'inventory', selectedItem.id);
        const updateData = { organisationId: targetId };

        updateDoc(itemRef, updateData)
            .then(() => {
                toast({ title: "Stock Assigned", description: `Successfully moved to ${availableTargets.find(t => t.id === targetId)?.name}` });
                setSelectedItem(null);
            })
            .catch(async (serverError) => {
                const permissionError = new FirestorePermissionError({
                    path: itemRef.path,
                    operation: 'update',
                    requestResourceData: updateData,
                } satisfies SecurityRuleContext);
                errorEmitter.emit('permission-error', permissionError);
            })
            .finally(() => setIsAssigning(false));
    };

    const handleAddTestStock = async () => {
        const colRef = collection(firestore, 'inventory');
        const dataToAdd = {
            name: `Stock Unit ${Math.floor(Math.random() * 1000)}`,
            stockNumber: `SN-${Math.floor(Math.random() * 10000)}`,
            organisationId: organisation.id,
            moduleId: moduleId,
            status: 'Available',
            createdAt: serverTimestamp()
        };

        addDoc(colRef, dataToAdd)
            .then(() => {
                toast({ title: "Test Stock Added" });
            })
            .catch(async (serverError) => {
                const permissionError = new FirestorePermissionError({
                    path: colRef.path,
                    operation: 'create',
                    requestResourceData: dataToAdd,
                } satisfies SecurityRuleContext);
                errorEmitter.emit('permission-error', permissionError);
            });
    };

    const handleDeleteItem = async (itemId: string) => {
        const itemRef = doc(firestore, 'inventory', itemId);
        deleteDoc(itemRef)
            .then(() => {
                toast({ title: "Item deleted." });
            })
            .catch(async (serverError) => {
                const permissionError = new FirestorePermissionError({
                    path: itemRef.path,
                    operation: 'delete',
                } satisfies SecurityRuleContext);
                errorEmitter.emit('permission-error', permissionError);
            });
    };

    if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

    return (
        <div className="space-y-4 h-full flex flex-col">
            {(!inventory || inventory.length === 0) ? (
                <div className="flex flex-col items-center justify-center p-12 border-4 border-dashed rounded-[2rem] text-center bg-muted/5 gap-6">
                    <div className="h-16 w-16 bg-white rounded-2xl shadow-xl flex items-center justify-center text-muted-foreground/20">
                        <Box className="h-8 w-8" />
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm font-black uppercase tracking-widest text-muted-foreground/60">Inventory Empty</p>
                        <p className="text-xs text-muted-foreground/40 font-bold uppercase tracking-tighter">No active assets registered</p>
                    </div>
                    <Button variant="outline" size="sm" className="h-10 px-6 rounded-xl font-bold border-2 hover:bg-primary hover:text-white hover:border-primary transition-all" onClick={handleAddTestStock}>
                        <PackagePlus className="mr-2 h-4 w-4" /> Initialize Stock
                    </Button>
                </div>
            ) : (
                <div className="space-y-2 flex-1 min-h-0 flex flex-col">
                    <ScrollArea className="flex-1 w-full pr-4">
                        <div className="space-y-3 pb-4">
                            {inventory.map(item => (
                                <div key={item.id} className="group relative flex items-center justify-between p-5 rounded-2xl border-2 bg-white hover:border-primary/40 transition-all duration-300 shadow-sm hover:shadow-xl">
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
                                            <Anchor className="h-5 w-5" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-black text-[13px] uppercase tracking-tight text-slate-900 truncate">{item.name}</p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <Badge variant="outline" className="font-mono text-[9px] font-bold uppercase py-0 px-1.5 border-primary/20 text-primary">
                                                    {item.stockNumber}
                                                </Badge>
                                                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/40">Available</span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-1 shrink-0">
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            onClick={() => setSelectedItem(item)}
                                            className="h-9 w-9 rounded-xl hover:bg-primary/10 text-primary opacity-0 group-hover:opacity-100 transition-all"
                                            title="Assign to Dealer"
                                        >
                                            <ArrowRightLeft className="h-4 w-4" />
                                        </Button>
                                        {isAdmin && (
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="h-9 w-9 rounded-xl text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                                                onClick={() => handleDeleteItem(item.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                        <ChevronRight className="h-4 w-4 text-muted-foreground/20 group-hover:text-primary transition-colors" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                    <div className="pt-2 shrink-0">
                        <Button variant="ghost" size="sm" className="w-full text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 hover:text-primary hover:bg-primary/5 transition-all h-8 rounded-xl" onClick={handleAddTestStock}>
                            + Append Simulated Asset
                        </Button>
                    </div>
                </div>
            )}

            <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
                <DialogContent className="rounded-[2.5rem] border-4 shadow-2xl p-0 overflow-hidden">
                    <DialogHeader className="p-8 bg-muted/5 border-b">
                        <DialogTitle className="text-2xl font-black uppercase tracking-tight">Assign Asset</DialogTitle>
                        <DialogDescription className="text-xs font-black uppercase tracking-[0.1em] text-primary">
                            Strategic relocation of unit <strong>{selectedItem?.stockNumber}</strong>
                        </DialogDescription>
                    </DialogHeader>
                    <div className="p-8 space-y-6">
                        <div className="space-y-3">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Destination Organization</Label>
                            <Select value={targetId} onValueChange={setTargetId}>
                                <SelectTrigger className="h-14 rounded-2xl border-2 font-black text-sm bg-background px-6">
                                    <SelectValue placeholder="Select target..." />
                                </SelectTrigger>
                                <SelectContent className="rounded-2xl border-2 shadow-2xl">
                                    {availableTargets.map(target => (
                                        <SelectItem key={target.id} value={target.id} className="font-bold py-3 uppercase text-[11px] tracking-tight">{target.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter className="p-8 border-t bg-muted/5 gap-3">
                        <DialogClose asChild><Button variant="outline" className="h-12 px-8 rounded-xl font-black uppercase tracking-widest text-[10px] border-2">Cancel</Button></DialogClose>
                        <Button onClick={handleAssign} disabled={isAssigning || !targetId} className="h-12 px-10 rounded-xl font-black uppercase tracking-widest text-[10px] shadow-xl">
                            {isAssigning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                            Execute Assignment
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
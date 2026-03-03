
'use client';

import { useMemo, useState } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { collection, query, where, doc, updateDoc, addDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowRightLeft, Trash2, Box, Anchor, CheckCircle2 } from 'lucide-react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';
import { Badge } from '@/components/ui/badge';

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
        <div className="flex flex-col h-full overflow-hidden">
            {(!inventory || inventory.length === 0) ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
                    <Box className="h-8 w-8 text-muted-foreground/20" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Inventory Empty</p>
                    <Button variant="outline" size="sm" className="h-8 px-4 rounded-xl text-[9px] font-black uppercase tracking-widest" onClick={handleAddTestStock}>
                        Initialize Stock
                    </Button>
                </div>
            ) : (
                <div className="flex-1 flex flex-col overflow-hidden">
                    <ScrollArea className="flex-1">
                        <div className="p-4 space-y-2">
                            {inventory.map(item => (
                                <div key={item.id} className="group flex items-center justify-between p-3 rounded-xl border bg-white hover:border-primary/40 transition-all shadow-sm">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="h-8 w-8 bg-slate-50 border rounded-lg flex items-center justify-center text-primary shrink-0">
                                            <Anchor className="h-4 w-4" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-black text-[11px] uppercase tracking-tight truncate leading-none mb-1">{item.name}</p>
                                            <Badge variant="outline" className="font-mono text-[8px] font-bold py-0 h-4 border-primary/20 text-primary">
                                                {item.stockNumber}
                                            </Badge>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => setSelectedItem(item)} title="Reassign">
                                            <ArrowRightLeft className="h-3.5 w-3.5" />
                                        </Button>
                                        {isAdmin && (
                                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" onClick={() => handleDeleteItem(item.id)}>
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                    <div className="p-3 border-t shrink-0 bg-slate-50/50">
                        <Button variant="ghost" size="sm" className="w-full text-[9px] font-black uppercase tracking-widest h-7" onClick={handleAddTestStock}>
                            + Append Unit
                        </Button>
                    </div>
                </div>
            )}

            <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
                <DialogContent className="rounded-3xl border-4 shadow-2xl p-0 overflow-hidden">
                    <DialogHeader className="p-6 bg-muted/5 border-b">
                        <DialogTitle className="text-xl font-black uppercase tracking-tight">Assign Asset</DialogTitle>
                        <DialogDescription className="text-[10px] font-black uppercase tracking-widest text-primary">
                            Strategic relocation of unit <strong>{selectedItem?.stockNumber}</strong>
                        </DialogDescription>
                    </DialogHeader>
                    <div className="p-6 space-y-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Destination Organization</Label>
                            <Select value={targetId} onValueChange={setTargetId}>
                                <SelectTrigger className="h-12 rounded-xl border-2 font-black text-xs bg-background">
                                    <SelectValue placeholder="Select target..." />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl">
                                    {availableTargets.map(target => (
                                        <SelectItem key={target.id} value={target.id} className="font-bold text-[10px] uppercase">{target.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter className="p-6 border-t bg-muted/5 gap-2">
                        <DialogClose asChild><Button variant="outline" className="h-10 px-6 rounded-xl font-black uppercase text-[10px]">Cancel</Button></DialogClose>
                        <Button onClick={handleAssign} disabled={isAssigning || !targetId} className="h-10 px-8 rounded-xl font-black uppercase text-[10px]">
                            {isAssigning ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-2 h-3.5 w-3.5" />}
                            Execute
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

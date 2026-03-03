'use client';

import { useMemo, useState } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { collection, query, where, doc, updateDoc, deleteDoc } from 'firebase/firestore';
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

export function StockList({ 
    organisation, 
    subDealers, 
    parentOrg, 
    moduleId,
    filterOrgId,
    isAdmin = false
}: { 
    organisation: Organisation | null; 
    subDealers: Organisation[]; 
    parentOrg: Organisation | null;
    moduleId: string;
    filterOrgId: string | 'all' | 'local';
    isAdmin?: boolean;
}) {
    const firestore = useFirestore();
    
    const targetOrgIds = useMemo(() => {
        if (!organisation?.id) return [];
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

    const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
    const [isAssigning, setIsAssigning] = useState(false);
    const [targetId, setTargetId] = useState<string>('');

    const availableTargets = useMemo(() => {
        const targets = [];
        if (!organisation) return [];
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
        
        updateDoc(itemRef, { organisationId: targetId })
            .then(() => {
                toast({ title: "Stock Assigned" });
                setSelectedItem(null);
            })
            .catch(async (serverError) => {
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: itemRef.path,
                    operation: 'update',
                    requestResourceData: { organisationId: targetId },
                } satisfies SecurityRuleContext));
            })
            .finally(() => setIsAssigning(false));
    };

    const handleDeleteItem = async (itemId: string) => {
        const itemRef = doc(firestore, 'inventory', itemId);
        deleteDoc(itemRef)
            .then(() => {
                toast({ title: "Item deleted." });
            })
            .catch(async (serverError) => {
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: itemRef.path,
                    operation: 'delete',
                } satisfies SecurityRuleContext));
            });
    };

    if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {(!inventory || inventory.length === 0) ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
                    <Box className="h-8 w-8 text-muted-foreground/20" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">No Units in Stock</p>
                </div>
            ) : (
                <div className="flex-1 flex flex-col overflow-hidden">
                    <ScrollArea className="flex-1">
                        <div className="p-4 space-y-2">
                            {inventory.map(item => (
                                <div key={item.id} className="group flex items-center justify-between p-4 rounded-xl border bg-white hover:border-primary/40 transition-all shadow-sm">
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className="h-10 w-10 bg-slate-50 border rounded-lg flex items-center justify-center text-primary shrink-0">
                                            <Anchor className="h-5 w-5" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-black text-[12px] uppercase tracking-tight text-slate-900 truncate leading-none mb-1.5">{item.name}</p>
                                            <Badge variant="outline" className="font-mono text-[8px] font-bold py-0 h-4 border-primary/20 text-primary">
                                                {item.stockNumber}
                                            </Badge>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-1.5 opacity-40 group-hover:opacity-100 transition-opacity">
                                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => setSelectedItem(item)} title="Reassign">
                                            <ArrowRightLeft className="h-3.5 w-3.5" />
                                        </Button>
                                        {isAdmin && (
                                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive bg-muted/50 hover:bg-destructive/10" onClick={() => handleDeleteItem(item.id)}>
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </div>
            )}

            <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
                <DialogContent className="rounded-3xl border-4 shadow-2xl p-0 overflow-hidden">
                    <DialogHeader className="p-8 bg-muted/5 border-b">
                        <DialogTitle className="text-2xl font-black uppercase tracking-tight">Assign Asset</DialogTitle>
                        <DialogDescription className="text-[10px] font-black uppercase tracking-widest text-primary mt-1">
                            Strategic relocation of unit <strong>{selectedItem?.stockNumber}</strong>
                        </DialogDescription>
                    </DialogHeader>
                    <div className="p-8 space-y-6">
                        <div className="space-y-3">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Destination Organization</Label>
                            <Select value={targetId} onValueChange={setTargetId}>
                                <SelectTrigger className="h-14 rounded-xl border-2 font-black text-sm bg-background px-6">
                                    <SelectValue placeholder="Select target..." />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-2">
                                    {availableTargets.map(target => (
                                        <SelectItem key={target.id} value={target.id} className="font-bold text-[10px] uppercase py-3">{target.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter className="p-8 border-t bg-muted/5 gap-3">
                        <DialogClose asChild><Button variant="outline" className="h-12 px-8 rounded-xl font-black uppercase text-[10px]">Cancel</Button></DialogClose>
                        <Button onClick={handleAssign} disabled={isAssigning || !targetId} className="h-12 px-10 rounded-xl font-black uppercase text-[10px] shadow-xl">
                            {isAssigning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                            Execute
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

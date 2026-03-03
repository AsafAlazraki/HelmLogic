'use client';

import { useMemo, useState } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { collection, query, where, doc, deleteDoc } from 'firebase/firestore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Ship, Trash2, Package } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';
import { cn } from '@/lib/utils';

interface Vessel {
    id: string;
    name: string;
    serialNumber: string;
    status: string;
    organisationId: string;
}

interface Organisation {
    id: string;
    name: string;
}

export function VesselOnOrderList({ 
    organisation, 
    parentOrg, 
    moduleId,
    isAdmin = false
}: { 
    organisation: Organisation | null; 
    parentOrg: Organisation | null;
    moduleId: string;
    isAdmin?: boolean;
}) {
    const firestore = useFirestore();
    const { user } = useUser();
    
    const isSubDealer = !!parentOrg;
    const targetOrgId = isSubDealer ? parentOrg?.id : (organisation?.id || null);

    const vesselsQuery = useMemoFirebase(() => {
        if (!targetOrgId) return null;
        return query(
            collection(firestore, 'vessels'),
            where('organisationId', '==', targetOrgId),
            where('status', '==', 'On Order')
        );
    }, [firestore, targetOrgId]);

    const { data: vessels, loading: vesselsLoading } = useCollection<Vessel>(vesselsQuery);

    const handleDeleteVessel = async (vesselId: string) => {
        const vesselRef = doc(firestore, 'vessels', vesselId);
        deleteDoc(vesselRef)
            .then(() => {
                toast({ title: "Entry Removed" });
            })
            .catch(async (serverError) => {
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: vesselRef.path,
                    operation: 'delete',
                } satisfies SecurityRuleContext));
            });
    };

    if (vesselsLoading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {(!vessels || vessels.length === 0) ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
                    <Package className="h-8 w-8 text-muted-foreground/20" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">No Active Orders</p>
                </div>
            ) : (
                <div className="flex-1 flex flex-col overflow-hidden">
                    <ScrollArea className="flex-1">
                        <div className="p-4 space-y-2">
                            {vessels.map(vessel => (
                                <div key={vessel.id} className="group flex items-center justify-between p-4 rounded-xl border bg-white hover:border-primary/40 transition-all shadow-sm">
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className="h-10 w-10 bg-slate-50 border rounded-lg flex items-center justify-center text-primary shrink-0">
                                            <Ship className="h-5 w-5" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-black text-[12px] uppercase tracking-tight text-slate-900 truncate leading-none mb-1.5">{vessel.name}</p>
                                            <Badge variant="outline" className="font-mono text-[8px] font-bold py-0 h-4 border-primary/20 text-primary">
                                                {vessel.serialNumber}
                                            </Badge>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge className="h-5 px-2 text-[7px] font-black uppercase bg-green-500">On Order</Badge>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive opacity-40 group-hover:opacity-100 transition-opacity bg-muted/50 hover:bg-destructive/10" onClick={() => handleDeleteVessel(vessel.id)}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </div>
            )}
        </div>
    );
}

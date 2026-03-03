
'use client';

import { useMemo, useState } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { collection, query, where, doc, updateDoc, addDoc, getDocs, deleteDoc } from 'firebase/firestore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Ship, Clock, CheckCircle2, XCircle, Send, PlusCircle, Trash2, Package, Search } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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

interface Reservation {
    id: string;
    vesselId: string;
    subDealerOrganisationId: string;
    vesselOwnerOrganisationId: string;
    requestedByUserId: string;
    customerName: string;
    description: string;
    status: string;
    requestedAt: any;
    declineNote?: string;
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
    organisation: Organisation; 
    parentOrg: Organisation | null;
    moduleId: string;
    isAdmin?: boolean;
}) {
    const firestore = useFirestore();
    const { user } = useUser();
    
    const isSubDealer = !!parentOrg;
    const targetOrgId = isSubDealer ? parentOrg?.id : organisation.id;

    const vesselsQuery = useMemoFirebase(() => {
        if (!targetOrgId) return null;
        return query(
            collection(firestore, 'vessels'),
            where('organisationId', '==', targetOrgId),
            where('status', '==', 'On Order')
        );
    }, [firestore, targetOrgId]);

    const { data: vessels, loading: vesselsLoading } = useCollection<Vessel>(vesselsQuery);

    const reservationsQuery = useMemoFirebase(() => {
        if (!vessels || vessels.length === 0) return null;
        return query(
            collection(firestore, 'vesselReservations'),
            where('vesselId', 'in', vessels.map(v => v.id))
        );
    }, [firestore, vessels]);

    const { data: reservations, loading: resLoading } = useCollection<Reservation>(reservationsQuery);

    const [isReserving, setIsReserving] = useState(false);
    const [selectedVessel, setSelectedVessel] = useState<Vessel | null>(null);
    const [customerName, setCustomerName] = useState('');
    const [description, setDescription] = useState('');

    const handleAddTestOnOrderBoat = async () => {
        const colRef = collection(firestore, 'vessels');
        const dataToAdd = {
            name: `Pipeline Unit ${Math.floor(Math.random() * 1000)}`,
            serialNumber: `ORD-${Math.floor(Math.random() * 10000)}`,
            status: 'On Order',
            organisationId: targetOrgId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        addDoc(colRef, dataToAdd)
            .then(() => {
                toast({ title: "Test Boat Added" });
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

    const handleDeleteVessel = async (vesselId: string) => {
        const vesselRef = doc(firestore, 'vessels', vesselId);
        deleteDoc(vesselRef)
            .then(() => {
                toast({ title: "Vessel deleted." });
            })
            .catch(async (serverError) => {
                const permissionError = new FirestorePermissionError({
                    path: vesselRef.path,
                    operation: 'delete',
                } satisfies SecurityRuleContext);
                errorEmitter.emit('permission-error', permissionError);
            });
    };

    if (vesselsLoading || resLoading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {(!vessels || vessels.length === 0) ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
                    <Package className="h-8 w-8 text-muted-foreground/20" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Pipeline Clear</p>
                    <Button variant="outline" size="sm" className="h-8 px-4 rounded-xl text-[9px] font-black uppercase tracking-widest" onClick={handleAddTestOnOrderBoat}>
                        Seed Pipeline
                    </Button>
                </div>
            ) : (
                <div className="flex-1 flex flex-col overflow-hidden">
                    <ScrollArea className="flex-1">
                        <div className="p-4 space-y-2">
                            {vessels.map(vessel => {
                                const reservation = reservations?.find(r => r.vesselId === vessel.id && r.status !== 'Cancelled');
                                return (
                                    <div key={vessel.id} className="group flex flex-col gap-3 p-4 rounded-xl border bg-white hover:border-primary/40 transition-all shadow-sm">
                                        <div className="flex items-center justify-between min-w-0">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="h-10 w-10 bg-slate-50 border rounded-lg flex items-center justify-center text-primary shrink-0">
                                                    <Ship className="h-5 w-5" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-black text-[12px] uppercase tracking-tight text-slate-900 truncate leading-none mb-1">{vessel.name}</p>
                                                    <Badge variant="outline" className="font-mono text-[8px] font-bold py-0 h-4 border-primary/20 text-primary">
                                                        {vessel.serialNumber}
                                                    </Badge>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                {reservation ? (
                                                    <Badge className={cn(
                                                        "h-5 px-2 text-[7px] font-black uppercase",
                                                        reservation.status === 'Approved' ? "bg-green-500" : "bg-primary"
                                                    )}>
                                                        {reservation.status}
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="ghost" className="h-5 px-2 text-[7px] font-black uppercase text-muted-foreground">Free</Badge>
                                                )}
                                                {isAdmin && (
                                                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded-md text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleDeleteVessel(vessel.id)}>
                                                        <Trash2 className="h-3 w-3" />
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </ScrollArea>
                    <div className="p-3 border-t shrink-0 bg-slate-50/50">
                        <Button variant="ghost" size="sm" className="w-full text-[9px] font-black uppercase tracking-widest h-7" onClick={handleAddTestOnOrderBoat}>
                            + Seed Test Data
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

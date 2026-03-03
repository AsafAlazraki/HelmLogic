
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

    const [resToDecline, setResToDecline] = useState<Reservation | null>(null);
    const [declineNote, setDeclineNote] = useState('');

    const handleRequestReservation = async () => {
        if (!selectedVessel || !customerName.trim() || !user) return;
        setIsReserving(true);
        
        const colRef = collection(firestore, 'vesselReservations');
        const reservationData = {
            vesselId: selectedVessel.id,
            subDealerOrganisationId: organisation.id,
            vesselOwnerOrganisationId: targetOrgId!,
            requestedByUserId: user.uid,
            customerName,
            description,
            status: 'Awaiting Confirmation',
            requestedAt: new Date().toISOString(),
        };

        addDoc(colRef, reservationData)
            .then(async (resRef) => {
                const parentUsersQuery = query(collection(firestore, 'users'), where('organisationId', '==', targetOrgId));
                const parentUsers = await getDocs(parentUsersQuery);
                
                parentUsers.forEach(uDoc => {
                    const notifyCol = collection(firestore, `users/${uDoc.id}/notifications`);
                    const notifyData = {
                        message: `${organisation.name} requested to reserve vessel ${selectedVessel.name} for ${customerName}.`,
                        type: 'ReservationRequest',
                        sourceEntityId: resRef.id,
                        sourceEntityType: 'VesselReservation',
                        isRead: false,
                        createdAt: new Date().toISOString()
                    };
                    addDoc(notifyCol, notifyData).catch(async (e) => {
                        const contextualError = new FirestorePermissionError({
                            path: notifyCol.path,
                            operation: 'create',
                            requestResourceData: notifyData
                        });
                        errorEmitter.emit('permission-error', contextualError);
                    });
                });

                toast({ title: "Reservation Requested", description: "Parent organisation has been notified." });
                setSelectedVessel(null);
                setCustomerName('');
                setDescription('');
            })
            .catch(async (serverError) => {
                const permissionError = new FirestorePermissionError({
                    path: colRef.path,
                    operation: 'create',
                    requestResourceData: reservationData,
                } satisfies SecurityRuleContext);
                errorEmitter.emit('permission-error', permissionError);
            })
            .finally(() => setIsReserving(false));
    };

    const handleProcessReservation = async (res: Reservation, approved: boolean) => {
        const resRef = doc(firestore, 'vesselReservations', res.id);
        const status = approved ? 'Approved' : 'Declined';
        
        const updateData: any = { 
            status, 
            processedByUserId: user?.uid,
            processedAt: new Date().toISOString() 
        };
        if (!approved) updateData.declineNote = declineNote;

        updateDoc(resRef, updateData)
            .then(async () => {
                const notifyCol = collection(firestore, `users/${res.requestedByUserId}/notifications`);
                const notifyData = {
                    message: `Your reservation for boat ${vessels?.find(v => v.id === res.vesselId)?.name} was ${status.toLowerCase()}${!approved ? `: ${declineNote}` : '.'}`,
                    type: approved ? 'ReservationApproved' : 'ReservationDeclined',
                    sourceEntityId: res.id,
                    sourceEntityType: 'VesselReservation',
                    isRead: false,
                    createdAt: new Date().toISOString()
                };
                addDoc(notifyCol, notifyData).catch(async (e) => {
                    const contextualError = new FirestorePermissionError({
                        path: notifyCol.path,
                        operation: 'create',
                        requestResourceData: notifyData
                    });
                    errorEmitter.emit('permission-error', contextualError);
                });

                toast({ title: `Reservation ${status}` });
                setResToDecline(null);
                setDeclineNote('');
            })
            .catch(async (serverError) => {
                const permissionError = new FirestorePermissionError({
                    path: resRef.path,
                    operation: 'update',
                    requestResourceData: updateData,
                } satisfies SecurityRuleContext);
                errorEmitter.emit('permission-error', permissionError);
            });
    };

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
        <div className="space-y-4 h-full flex flex-col">
            {(!vessels || vessels.length === 0) ? (
                <div className="flex flex-col items-center justify-center p-12 border-4 border-dashed rounded-[2rem] text-center bg-muted/5 gap-6">
                    <div className="h-16 w-16 bg-white rounded-2xl shadow-xl flex items-center justify-center text-muted-foreground/20">
                        <Package className="h-8 w-8" />
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm font-black uppercase tracking-widest text-muted-foreground/60">Pipeline Clear</p>
                        <p className="text-xs text-muted-foreground/40 font-bold uppercase tracking-tighter">No units currently on order</p>
                    </div>
                    <Button variant="outline" size="sm" className="h-10 px-6 rounded-xl font-bold border-2 hover:bg-primary hover:text-white transition-all" onClick={handleAddTestOnOrderBoat}>
                        <PlusCircle className="mr-2 h-4 w-4" /> Seed Pipeline
                    </Button>
                </div>
            ) : (
                <div className="space-y-3 flex-1 min-h-0 flex flex-col">
                    <ScrollArea className="flex-1 w-full pr-4">
                        <div className="space-y-3 pb-4">
                            {vessels.map(vessel => {
                                const reservation = reservations?.find(r => r.vesselId === vessel.id && r.status !== 'Cancelled');
                                return (
                                    <div key={vessel.id} className="group relative flex flex-col gap-4 p-5 rounded-3xl border-2 bg-white hover:border-primary/40 transition-all duration-300 shadow-sm hover:shadow-xl">
                                        <div className="flex items-center justify-between min-w-0">
                                            <div className="flex items-center gap-4 min-w-0">
                                                <div className="h-12 w-12 bg-slate-50 border rounded-2xl flex items-center justify-center text-primary shadow-inner group-hover:scale-110 transition-transform">
                                                    <Ship className="h-6 w-6" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-black text-[14px] uppercase tracking-tight text-slate-950 truncate leading-none mb-1">{vessel.name}</p>
                                                    <Badge variant="secondary" className="font-mono text-[9px] font-bold opacity-60 px-1.5 py-0">
                                                        {vessel.serialNumber}
                                                    </Badge>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {reservation && reservation.status !== 'Declined' ? (
                                                    <Badge className={cn(
                                                        "h-7 px-3 rounded-xl font-black text-[9px] uppercase tracking-widest gap-1.5 shadow-md",
                                                        reservation.status === 'Approved' ? "bg-green-500 hover:bg-green-600" : "bg-primary"
                                                    )}>
                                                        {reservation.status === 'Approved' ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                                                        {reservation.status}
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="h-7 px-3 rounded-xl font-black text-[9px] uppercase tracking-widest border-2 text-muted-foreground/60 border-muted">
                                                        Unreserved
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>

                                        {reservation?.status === 'Awaiting Confirmation' && !isSubDealer && (
                                            <div className="flex items-center justify-between p-4 bg-primary/5 rounded-2xl border border-primary/10 animate-in slide-in-from-top-2 duration-300">
                                                <div className="space-y-0.5">
                                                    <p className="text-[10px] font-black uppercase text-primary tracking-widest">Hold Requested For:</p>
                                                    <p className="text-xs font-bold text-slate-900">{reservation.customerName}</p>
                                                </div>
                                                <div className="flex gap-2">
                                                    <Button size="sm" variant="outline" className="h-8 px-3 rounded-lg border-2 border-green-200 text-green-600 hover:bg-green-500 hover:text-white hover:border-green-500 font-black text-[9px] uppercase tracking-widest transition-all" onClick={() => handleProcessReservation(reservation, true)}>
                                                        Approve
                                                    </Button>
                                                    <Button size="sm" variant="outline" className="h-8 px-3 rounded-lg border-2 border-destructive/20 text-destructive hover:bg-destructive hover:text-white font-black text-[9px] uppercase tracking-widest transition-all" onClick={() => setResToDecline(reservation)}>
                                                        Decline
                                                    </Button>
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex items-center justify-end gap-2 pt-2 mt-auto border-t border-dashed opacity-0 group-hover:opacity-100 transition-opacity">
                                            {isSubDealer && (!reservation || reservation.status === 'Declined') && (
                                                <Button size="sm" className="h-8 px-4 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg" onClick={() => setSelectedVessel(vessel)}>
                                                    <Clock className="mr-2 h-3.5 w-3.5" />
                                                    Request Hold
                                                </Button>
                                            )}
                                            {isAdmin && (
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="h-8 w-8 rounded-xl text-destructive hover:bg-destructive/10"
                                                    onClick={() => handleDeleteVessel(vessel.id)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </ScrollArea>
                    <div className="pt-2 shrink-0">
                        <Button variant="ghost" size="sm" className="w-full text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 hover:text-primary hover:bg-primary/5 transition-all h-8 rounded-xl" onClick={handleAddTestOnOrderBoat}>
                            + Seed Test Logistics
                        </Button>
                    </div>
                </div>
            )}

            <Dialog open={!!selectedVessel} onOpenChange={(open) => !open && setSelectedVessel(null)}>
                <DialogContent className="rounded-[2.5rem] border-4 shadow-2xl p-0 overflow-hidden">
                    <DialogHeader className="p-8 bg-muted/5 border-b">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-primary mb-2">
                            <Clock className="h-3.5 w-3.5" />
                            <span>Hold Request</span>
                        </div>
                        <DialogTitle className="text-2xl font-black uppercase tracking-tight">Reserve Ordered Asset</DialogTitle>
                        <DialogDescription className="text-xs font-bold text-muted-foreground mt-2">
                            Request a hold on <strong>{selectedVessel?.name}</strong>. Parent organization will be notified for strategic approval.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="p-8 space-y-6">
                        <div className="space-y-3">
                            <Label htmlFor="customer" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Prospective Customer</Label>
                            <Input id="customer" placeholder="Enter Full Name..." value={customerName} onChange={e => setCustomerName(e.target.value)} className="h-14 rounded-2xl border-2 font-black text-lg bg-background px-6" />
                        </div>
                        <div className="space-y-3">
                            <Label htmlFor="notes" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Hold Justification</Label>
                            <Textarea id="notes" placeholder="Describe the strategic requirement for this reservation..." value={description} onChange={e => setDescription(e.target.value)} className="rounded-2xl border-2 font-medium bg-background px-6 py-4 min-h-[120px]" />
                        </div>
                    </div>
                    <DialogFooter className="p-8 border-t bg-muted/5 gap-3">
                        <DialogClose asChild><Button variant="outline" className="h-12 px-8 rounded-xl font-black uppercase tracking-widest text-[10px] border-2">Abort</Button></DialogClose>
                        <Button onClick={handleRequestReservation} disabled={isReserving || !customerName.trim()} className="h-12 px-10 rounded-xl font-black uppercase tracking-widest text-[10px] shadow-xl transition-all hover:scale-105 active:scale-95">
                            {isReserving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                            Submit Strategic Hold
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!resToDecline} onOpenChange={(open) => !open && setResToDecline(null)}>
                <DialogContent className="rounded-[2.5rem] border-4 shadow-2xl p-0 overflow-hidden">
                    <DialogHeader className="p-8 bg-destructive/5 border-b">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-destructive mb-2">
                            <XCircle className="h-3.5 w-3.5" />
                            <span>Hold Decline</span>
                        </div>
                        <DialogTitle className="text-2xl font-black uppercase tracking-tight">Decline Reservation</DialogTitle>
                        <DialogDescription className="text-xs font-bold text-muted-foreground mt-2">
                            Provide high-precision reasoning for declining this network hold request.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="p-8">
                        <Label htmlFor="declineNote" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1 mb-3 block">Tactical Rationale</Label>
                        <Textarea id="declineNote" placeholder="e.g. This unit is already allocated to a priority fleet order..." value={declineNote} onChange={e => setDeclineNote(e.target.value)} className="rounded-2xl border-2 border-destructive/20 font-medium bg-background px-6 py-4 min-h-[150px] focus-visible:ring-destructive/20" />
                    </div>
                    <DialogFooter className="p-8 border-t bg-muted/5 gap-3">
                        <DialogClose asChild><Button variant="outline" className="h-12 px-8 rounded-xl font-black uppercase tracking-widest text-[10px] border-2">Cancel</Button></DialogClose>
                        <Button variant="destructive" onClick={() => resToDecline && handleProcessReservation(resToDecline, false)} disabled={!declineNote.trim()} className="h-12 px-10 rounded-xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-destructive/20">
                            Confirm Tactical Decline
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

'use client';

import { useMemo, useState } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { collection, query, where, doc, updateDoc, addDoc, getDocs } from 'firebase/firestore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Ship, Clock, CheckCircle2, XCircle, Send } from 'lucide-react';
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

interface Vessel {
    id: string;
    name: string;
    serialNumber: string;
    status: string;
    organizationId: string;
    reservationStatus?: 'Awaiting Confirmation' | 'Approved' | 'Declined';
    reservationId?: string;
}

interface Reservation {
    id: string;
    vesselId: string;
    subDealerOrganizationId: string;
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
    moduleId 
}: { 
    organisation: Organisation; 
    parentOrg: Organisation | null;
    moduleId: string;
}) {
    const firestore = useFirestore();
    const { user } = useUser();
    
    const isSubDealer = !!parentOrg;
    const targetOrgId = isSubDealer ? parentOrg?.id : organisation.id;

    // Fetch vessels that are "On Order" from the parent (if sub-dealer) or local (if parent)
    const vesselsQuery = useMemoFirebase(() => {
        if (!targetOrgId) return null;
        return query(
            collection(firestore, 'vessels'),
            where('organizationId', '==', targetOrgId),
            where('status', '==', 'On Order')
        );
    }, [firestore, targetOrgId]);

    const { data: vessels, loading: vesselsLoading } = useCollection<Vessel>(vesselsQuery);

    // Fetch active reservations for these vessels
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

    const [isDeclining, setIsDeclining] = useState(false);
    const [resToDecline, setResToDecline] = useState<Reservation | null>(null);
    const [declineNote, setDeclineNote] = useState('');

    const handleRequestReservation = async () => {
        if (!selectedVessel || !customerName.trim() || !user) return;
        setIsReserving(true);
        try {
            const reservationData = {
                vesselId: selectedVessel.id,
                subDealerOrganizationId: organisation.id,
                requestedByUserId: user.uid,
                customerName,
                description,
                status: 'Awaiting Confirmation',
                requestedAt: new Date().toISOString(),
            };

            const resRef = await addDoc(collection(firestore, 'vesselReservations'), reservationData);
            
            // Notify parent organisation users
            const parentUsersQuery = query(collection(firestore, 'users'), where('organisationId', '==', parentOrg?.id));
            const parentUsers = await getDocs(parentUsersQuery);
            
            parentUsers.forEach(uDoc => {
                addDoc(collection(firestore, `users/${uDoc.id}/notifications`), {
                    message: `${organisation.name} requested to reserve vessel ${selectedVessel.name} for ${customerName}.`,
                    type: 'ReservationRequest',
                    sourceEntityId: resRef.id,
                    sourceEntityType: 'VesselReservation',
                    isRead: false,
                    createdAt: new Date().toISOString()
                });
            });

            toast({ title: "Reservation Requested", description: "Parent organisation has been notified." });
            setSelectedVessel(null);
            setCustomerName('');
            setDescription('');
        } catch (error) {
            toast({ variant: 'destructive', title: "Request Failed" });
        } finally {
            setIsReserving(false);
        }
    };

    const handleProcessReservation = async (res: Reservation, approved: boolean) => {
        try {
            const resRef = doc(firestore, 'vesselReservations', res.id);
            const status = approved ? 'Approved' : 'Declined';
            
            const updateData: any = { 
                status, 
                processedByUserId: user?.uid,
                processedAt: new Date().toISOString() 
            };
            if (!approved) updateData.declineNote = declineNote;

            await updateDoc(resRef, updateData);

            // Notify sub-dealer requester
            await addDoc(collection(firestore, `users/${res.requestedByUserId}/notifications`), {
                message: `Your reservation for boat ${vessels?.find(v => v.id === res.vesselId)?.name} was ${status.toLowerCase()}${!approved ? `: ${declineNote}` : '.'}`,
                type: approved ? 'ReservationApproved' : 'ReservationDeclined',
                sourceEntityId: res.id,
                sourceEntityType: 'VesselReservation',
                isRead: false,
                createdAt: new Date().toISOString()
            });

            toast({ title: `Reservation ${status}` });
            setResToDecline(null);
            setDeclineNote('');
        } catch (error) {
            toast({ variant: 'destructive', title: "Action Failed" });
        }
    };

    if (vesselsLoading || resLoading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

    return (
        <div className="space-y-4">
            {(!vessels || vessels.length === 0) ? (
                <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-md text-center">
                    <p className="text-muted-foreground text-sm">No "On Order" vessels currently listed for this network.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {vessels.map(vessel => {
                        const reservation = reservations?.find(r => r.vesselId === vessel.id && r.status !== 'Declined');
                        return (
                            <div key={vessel.id} className="flex items-center justify-between p-4 border rounded-md bg-background group hover:border-primary transition-all">
                                <div className="flex items-center gap-4">
                                    <div className="h-10 w-10 bg-secondary rounded-full flex items-center justify-center">
                                        <Ship className="h-5 w-5 text-primary" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-sm">{vessel.name}</p>
                                        <p className="text-xs text-muted-foreground">SN: {vessel.serialNumber}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    {reservation ? (
                                        <div className="flex items-center gap-2">
                                            <Badge variant={reservation.status === 'Approved' ? 'default' : 'secondary'} className="gap-1 px-2 py-1">
                                                {reservation.status === 'Approved' ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                                                {reservation.status}
                                            </Badge>
                                            
                                            {!isSubDealer && reservation.status === 'Awaiting Confirmation' && (
                                                <div className="flex gap-1">
                                                    <Button size="sm" variant="outline" className="h-8 px-2 text-green-600 hover:text-green-700" onClick={() => handleProcessReservation(reservation, true)}>
                                                        Approve
                                                    </Button>
                                                    <Button size="sm" variant="outline" className="h-8 px-2 text-destructive hover:text-destructive" onClick={() => setResToDecline(reservation)}>
                                                        Decline
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        isSubDealer && (
                                            <Button variant="outline" size="sm" onClick={() => setSelectedVessel(vessel)}>
                                                Reserve
                                            </Button>
                                        )
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Reservation Dialog */}
            <Dialog open={!!selectedVessel} onOpenChange={(open) => !open && setSelectedVessel(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Request Vessel Reservation</DialogTitle>
                        <DialogDescription>
                            Request a hold on <strong>{selectedVessel?.name}</strong>. The parent organisation will review and approve.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="customer">Customer Name</Label>
                            <Input id="customer" placeholder="Who is this for?" value={customerName} onChange={e => setCustomerName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="notes">Description (Optional)</Label>
                            <Textarea id="notes" placeholder="Any specific requirements or timeframe?" value={description} onChange={e => setDescription(e.target.value)} />
                        </div>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                        <Button onClick={handleRequestReservation} disabled={isReserving || !customerName.trim()}>
                            {isReserving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            <Send className="mr-2 h-4 w-4" />
                            Send Request
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Decline Dialog */}
            <Dialog open={!!resToDecline} onOpenChange={(open) => !open && setResToDecline(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Decline Reservation</DialogTitle>
                        <DialogDescription>Provide a reason for the sub-dealer. They will be notified.</DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Label htmlFor="declineNote">Decline Note</Label>
                        <Textarea id="declineNote" placeholder="e.g. This boat is already allocated to another order." value={declineNote} onChange={e => setDeclineNote(e.target.value)} />
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                        <Button variant="destructive" onClick={() => resToDecline && handleProcessReservation(resToDecline, false)} disabled={!declineNote.trim()}>
                            <XCircle className="mr-2 h-4 w-4" />
                            Confirm Decline
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
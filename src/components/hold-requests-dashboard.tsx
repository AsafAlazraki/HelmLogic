'use client';

import { useState, useMemo } from 'react';
import {
  collection,
  query,
  where,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import {
  Shield,
  Building2,
  User,
  Loader2,
  Check,
  X,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

interface HoldRequestsDashboardProps {
  organisation: any;
  moduleId: string;
  user: any;
}

type TabKey = 'pending' | 'accepted' | 'rejected';

export function HoldRequestsDashboard({
  organisation,
  moduleId,
  user,
}: HoldRequestsDashboardProps) {
  const firestore = useFirestore();
  const [activeTab, setActiveTab] = useState<TabKey>('pending');

  // Reject dialog state
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingRequestId, setRejectingRequestId] = useState<string | null>(null);
  const [rejectingRequest, setRejectingRequest] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  // Query all hold requests for this parent org + module
  const holdRequestsQuery = useMemoFirebase(() => {
    if (!organisation?.id || !moduleId) return null;
    return query(
      collection(firestore, 'holdRequests'),
      where('parentOrganisationId', '==', organisation.id),
      where('moduleId', '==', moduleId)
    );
  }, [firestore, organisation?.id, moduleId]);

  const { data: holdRequests, isLoading } = useCollection<any>(holdRequestsQuery);

  // Filter by tab
  const filteredRequests = useMemo(() => {
    if (!holdRequests) return [];
    return holdRequests.filter((r: any) => r.status === activeTab);
  }, [holdRequests, activeTab]);

  const pendingCount = useMemo(() => {
    if (!holdRequests) return 0;
    return holdRequests.filter((r: any) => r.status === 'pending').length;
  }, [holdRequests]);

  // Accept action
  const handleAccept = async (request: any) => {
    setAcceptingId(request.id);
    try {
      // 1. Update hold request status
      await updateDoc(doc(firestore, 'holdRequests', request.id), {
        status: 'accepted',
        resolvedByUserId: user.uid,
        resolvedByUserName: user.displayName || user.email || '',
        resolvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 2. Transfer stock to sub-dealer
      await updateDoc(doc(firestore, 'inventory', request.inventoryItemId), {
        organisationId: request.requestingOrganisationId,
      });

      // 3. Notify the requester
      await addDoc(
        collection(firestore, `users/${request.requestedByUserId}/notifications`),
        {
          message: `Your hold request for ${request.inventorySnapshot?.model || ''} (${request.inventorySnapshot?.stockNumber || ''}) has been accepted`,
          isRead: false,
          createdAt: serverTimestamp(),
          type: 'hold-request-accepted',
        }
      );

      toast({
        title: 'Hold Accepted',
        description: `Stock transferred to ${request.requestingOrganisationName}`,
      });
    } catch (err) {
      console.error('Error accepting hold request:', err);
      toast({ title: 'Error', description: 'Failed to accept hold request' });
    } finally {
      setAcceptingId(null);
    }
  };

  // Reject action
  const openRejectDialog = (request: any) => {
    setRejectingRequestId(request.id);
    setRejectingRequest(request);
    setRejectReason('');
    setRejectDialogOpen(true);
  };

  const handleReject = async () => {
    if (!rejectingRequestId || !rejectingRequest) return;

    setIsRejecting(true);
    try {
      // 1. Update hold request status
      await updateDoc(doc(firestore, 'holdRequests', rejectingRequestId), {
        status: 'rejected',
        resolvedByUserId: user.uid,
        resolvedByUserName: user.displayName || user.email || '',
        resolvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        rejectReason: rejectReason.trim() || '',
      });

      // 2. Notify the requester
      await addDoc(
        collection(
          firestore,
          `users/${rejectingRequest.requestedByUserId}/notifications`
        ),
        {
          message: `Your hold request for ${rejectingRequest.inventorySnapshot?.model || ''} (${rejectingRequest.inventorySnapshot?.stockNumber || ''}) has been rejected${rejectReason.trim() ? `: ${rejectReason.trim()}` : ''}`,
          isRead: false,
          createdAt: serverTimestamp(),
          type: 'hold-request-rejected',
        }
      );

      toast({
        title: 'Hold Rejected',
        description: `Hold request from ${rejectingRequest.requestingOrganisationName} rejected`,
      });

      setRejectDialogOpen(false);
      setRejectingRequestId(null);
      setRejectingRequest(null);
      setRejectReason('');
    } catch (err) {
      console.error('Error rejecting hold request:', err);
      toast({ title: 'Error', description: 'Failed to reject hold request' });
    } finally {
      setIsRejecting(false);
    }
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'pending', label: 'Pending' },
    { key: 'accepted', label: 'Accepted' },
    { key: 'rejected', label: 'Rejected' },
  ];

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-black uppercase tracking-tight">Hold Requests</h2>
      </div>

      {/* Tab Switcher */}
      <div className="h-9 bg-slate-100 rounded-xl p-1 inline-flex gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 h-7 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors flex items-center gap-1.5 ${
              activeTab === tab.key
                ? 'bg-white shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
            {tab.key === 'pending' && pendingCount > 0 && (
              <Badge className="h-4 min-w-[16px] px-1 text-[9px] font-black rounded-full bg-destructive text-destructive-foreground">
                {pendingCount}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">
          No {activeTab} requests
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRequests.map((request: any) => (
            <div
              key={request.id}
              className="border-2 rounded-2xl p-4 bg-white space-y-3"
            >
              {/* Boat Info */}
              <div className="flex flex-wrap gap-2">
                {request.inventorySnapshot?.model && (
                  <Badge variant="secondary" className="border-2 rounded-xl text-xs">
                    {request.inventorySnapshot.model}
                  </Badge>
                )}
                {request.inventorySnapshot?.stockNumber && (
                  <Badge variant="outline" className="border-2 rounded-xl text-xs">
                    #{request.inventorySnapshot.stockNumber}
                  </Badge>
                )}
                {request.inventorySnapshot?.status && (
                  <Badge variant="outline" className="border-2 rounded-xl text-xs">
                    {request.inventorySnapshot.status}
                  </Badge>
                )}
                {request.inventorySnapshot?.colour && (
                  <Badge variant="outline" className="border-2 rounded-xl text-xs">
                    {request.inventorySnapshot.colour}
                  </Badge>
                )}
                {request.inventorySnapshot?.material && (
                  <Badge variant="outline" className="border-2 rounded-xl text-xs">
                    {request.inventorySnapshot.material}
                  </Badge>
                )}
              </div>

              {/* Sub-dealer */}
              <div className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-bold">
                  {request.requestingOrganisationName || 'Unknown dealer'}
                </span>
              </div>

              {/* Customer */}
              <div className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold">
                  {request.customerName || 'No customer'}
                </span>
              </div>

              {/* Requested by + date */}
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>
                  Requested by {request.requestedByUserName || 'Unknown'}
                  {request.createdAt?.toDate && (
                    <> on {request.createdAt.toDate().toLocaleDateString()}</>
                  )}
                </span>
              </div>

              {/* Actions */}
              {request.status === 'pending' && (
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={() => handleAccept(request)}
                    disabled={acceptingId === request.id}
                    className="rounded-xl bg-green-600 hover:bg-green-700 text-white font-black uppercase text-[10px]"
                  >
                    {acceptingId === request.id ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <Check className="h-3 w-3 mr-1" />
                    )}
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openRejectDialog(request)}
                    className="rounded-xl border-2 text-destructive font-black uppercase text-[10px]"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Reject
                  </Button>
                </div>
              )}

              {/* Resolution info for accepted/rejected */}
              {request.status === 'accepted' && (
                <div className="flex items-center gap-1.5 text-[10px] text-green-700 bg-green-50 rounded-xl p-2 border-2 border-green-200">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>
                    Accepted by {request.resolvedByUserName || 'Unknown'}
                    {request.resolvedAt?.toDate && (
                      <> on {request.resolvedAt.toDate().toLocaleDateString()}</>
                    )}
                  </span>
                </div>
              )}

              {request.status === 'rejected' && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] text-destructive bg-red-50 rounded-xl p-2 border-2 border-red-200">
                    <XCircle className="h-3 w-3" />
                    <span>
                      Rejected by {request.resolvedByUserName || 'Unknown'}
                      {request.resolvedAt?.toDate && (
                        <> on {request.resolvedAt.toDate().toLocaleDateString()}</>
                      )}
                    </span>
                  </div>
                  {request.rejectReason && (
                    <p className="text-[10px] text-muted-foreground pl-1">
                      Reason: {request.rejectReason}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="rounded-3xl border-4 shadow-2xl p-0 overflow-hidden max-w-md">
          <div className="p-6 bg-muted/5 border-b">
            <DialogTitle className="text-lg font-black uppercase tracking-tight">
              Reject Hold Request
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              Optionally provide a reason for rejection
            </DialogDescription>
          </div>

          <div className="p-6 space-y-3">
            {rejectingRequest && (
              <div className="flex flex-wrap gap-2">
                {rejectingRequest.inventorySnapshot?.model && (
                  <Badge variant="secondary" className="border-2 rounded-xl text-xs">
                    {rejectingRequest.inventorySnapshot.model}
                  </Badge>
                )}
                {rejectingRequest.inventorySnapshot?.stockNumber && (
                  <Badge variant="outline" className="border-2 rounded-xl text-xs">
                    #{rejectingRequest.inventorySnapshot.stockNumber}
                  </Badge>
                )}
              </div>
            )}

            <div>
              <label className="text-xs font-semibold">Reason (optional)</label>
              <Input
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Why is this request being rejected?"
                className="rounded-xl border-2 text-xs mt-1"
              />
            </div>
          </div>

          <div className="p-6 border-t bg-muted/5 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setRejectDialogOpen(false)}
              className="rounded-xl border-2 font-black uppercase text-[10px] h-10"
            >
              Cancel
            </Button>
            <Button
              onClick={handleReject}
              disabled={isRejecting}
              className="rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground font-black uppercase text-[10px] h-10"
            >
              {isRejecting ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <X className="h-3 w-3 mr-1" />
              )}
              Reject Request
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

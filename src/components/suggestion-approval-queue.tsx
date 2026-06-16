
'use client';

/**
 * SuggestionApprovalQueue (v1.11 — Story 3.5.1).
 *
 * Admin-facing triage queue for user-submitted feature suggestions.
 * Lists every feature with `status: 'submitted'` and shows admin
 * actions: Approve (→ 'under-review'), Reject (→ soft-deleted), or
 * open the feature detail sheet for full edits.
 *
 * Completes Story 3.3.1 — the v1.5 feature-tracking system already
 * captures user submissions on the public board's "Submit" form, but
 * there was no concentrated triage view for admins. This page is it.
 * Open at /suggestions; perm-gated to HelmLogic Admins (a future pass
 * can widen to org admins with a new role permission).
 */

import { useMemo, useState } from 'react';
import { addDoc, collection, doc, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useUser } from '@/firebase/auth/use-user';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Inbox, Check, X, Loader2, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface FeatureRow {
    id: string;
    title: string;
    description?: string;
    submitterId?: string;
    submitterName?: string;
    type?: string;
    status?: string;
    deletedAt?: any;
    createdAt?: any;
}

export function SuggestionApprovalQueue() {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();
    const [search, setSearch] = useState('');
    const [busyId, setBusyId] = useState<string | null>(null);

    /** v1.15 (Story 3.3.1 — "with Audit") — append an audit entry on every
     *  approve / reject so the suggestion lifecycle is traceable. Lives at
     *  features/{featureId}/auditLog/{eventId}, mirrors the per-quote audit
     *  pattern shipped in v1.8. Fire-and-forget; a failed audit write must
     *  not roll back the underlying state change. */
    const logSuggestionEvent = async (featureId: string, eventType: string, metadata?: Record<string, any>) => {
        try {
            await addDoc(collection(firestore, 'features', featureId, 'auditLog'), {
                eventType,
                at: serverTimestamp(),
                byUid: user?.uid || 'unknown',
                byName: user?.displayName || user?.email || 'Someone',
                metadata: metadata ?? null,
            });
        } catch (err) {
            console.warn('audit-log write failed (non-fatal)', err);
        }
    };

    const featuresRef = useMemoFirebase(
        () => query(collection(firestore, 'features'), where('status', '==', 'submitted')),
        [firestore],
    );
    const { data: features, isLoading } = useCollection<FeatureRow>(featuresRef);

    const live = useMemo(
        () => (features ?? []).filter(f => f.deletedAt == null),
        [features],
    );

    const filtered = useMemo(() => {
        if (!search.trim()) return live;
        const q = search.toLowerCase();
        return live.filter(f =>
            (f.title ?? '').toLowerCase().includes(q) ||
            (f.submitterName ?? '').toLowerCase().includes(q) ||
            (f.description ?? '').toLowerCase().includes(q),
        );
    }, [live, search]);

    const handleApprove = async (f: FeatureRow) => {
        setBusyId(f.id);
        try {
            await updateDoc(doc(firestore, 'features', f.id), {
                status: 'under-review',
                updatedAt: serverTimestamp(),
            });
            void logSuggestionEvent(f.id, 'suggestion-approved', {
                fromStatus: f.status ?? 'submitted',
                toStatus: 'under-review',
                title: f.title,
            });
            toast({ title: 'Approved → Under review', description: f.title });
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Approve failed' });
        } finally {
            setBusyId(null);
        }
    };

    const handleReject = async (f: FeatureRow) => {
        setBusyId(f.id);
        try {
            await updateDoc(doc(firestore, 'features', f.id), {
                deletedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            void logSuggestionEvent(f.id, 'suggestion-rejected', {
                fromStatus: f.status ?? 'submitted',
                title: f.title,
            });
            toast({ title: 'Rejected (soft-deleted)', description: f.title });
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Reject failed' });
        } finally {
            setBusyId(null);
        }
    };

    return (
        <Card className="rounded-2xl border-2">
            <CardHeader>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-base font-bold">
                            <Inbox className="h-4 w-4" />
                            Suggestion Approval Queue
                        </CardTitle>
                        <CardDescription className="text-xs">
                            User-submitted feature ideas pending review. Approve to move into <code>under-review</code>;
                            reject to soft-delete (hidden from the public board, recoverable from Archive).
                        </CardDescription>
                    </div>
                    <div className="relative min-w-[220px]">
                        <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search…"
                            className="rounded-xl border-2 text-xs pl-9"
                        />
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex items-center justify-center py-12 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        <span className="text-xs">Loading queue…</span>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center gap-2 border-2 border-dashed rounded-2xl text-muted-foreground">
                        <Inbox className="h-8 w-8 opacity-30" />
                        <p className="text-xs font-semibold">
                            {live.length === 0 ? 'Inbox zero — no suggestions waiting.' : 'No suggestions match the search.'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {filtered.map(f => (
                            <div key={f.id} className="rounded-xl border p-3 hover:bg-slate-50 space-y-2">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold">{f.title}</p>
                                        {f.description && (
                                            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{f.description}</p>
                                        )}
                                    </div>
                                    {f.type && (
                                        <Badge variant="outline" className="text-[10px] uppercase shrink-0">{f.type}</Badge>
                                    )}
                                </div>
                                <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                                    <div className="flex items-center gap-2">
                                        {f.submitterName && <span>by <strong>{f.submitterName}</strong></span>}
                                        {f.createdAt?.toDate && (
                                            <span>· {formatDistanceToNow(f.createdAt.toDate(), { addSuffix: true })}</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={busyId === f.id}
                                            onClick={() => handleReject(f)}
                                            className="rounded-lg h-7 text-[10px] text-destructive hover:bg-destructive/5"
                                        >
                                            <X className="h-3 w-3 mr-1" /> Reject
                                        </Button>
                                        <Button
                                            size="sm"
                                            disabled={busyId === f.id}
                                            onClick={() => handleApprove(f)}
                                            className="rounded-lg h-7 text-[10px]"
                                        >
                                            {busyId === f.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                                            Approve
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

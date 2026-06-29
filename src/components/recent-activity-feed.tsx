'use client';

/**
 * RecentActivityFeed (v1.22 — Story 1.7.3).
 *
 * Org-wide recent activity, read from the per-quote auditLog subcollections
 * via collectionGroup('auditLog'). Renders the most recent N events with
 * an icon per event type + relative time. silent:true so a missing
 * collectionGroup rule degrades to an empty feed (v1.21 lesson).
 */

import { useMemo } from 'react';
import { collectionGroup, query } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useMemoFirebase } from '@/firebase/provider';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Activity, FileText, Lock, Send, CheckCircle2, GitBranch, DollarSign } from 'lucide-react';

const EVENT_ICON: Record<string, any> = {
    'created': FileText,
    'finalised': FileText,
    'sent': Send,
    'locked': Lock,
    'accepted': CheckCircle2,
    'margin-override': DollarSign,
    'variation': GitBranch,
};

function toMs(ts: any): number {
    if (!ts) return 0;
    if (typeof ts === 'number') return ts;
    if (typeof ts?.toDate === 'function') return ts.toDate().getTime();
    if (typeof ts?.seconds === 'number') return ts.seconds * 1000;
    return 0;
}

function relTime(ms: number): string {
    if (!ms) return '';
    const diff = Date.now() - ms;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

export function RecentActivityFeed({ limit = 15 }: { limit?: number }) {
    const firestore = useFirestore();
    const feedQuery = useMemoFirebase(
        () => query(collectionGroup(firestore, 'auditLog')),
        [firestore],
    );
    const { data: events } = useCollection<any>(feedQuery, { silent: true });

    const rows = useMemo(() => {
        return [...(events ?? [])]
            .sort((a, b) => toMs(b.timestamp ?? b.at ?? b.createdAt) - toMs(a.timestamp ?? a.at ?? a.createdAt))
            .slice(0, limit);
    }, [events, limit]);

    return (
        <Card className="rounded-2xl border-2" data-testid="recent-activity-feed">
            <CardHeader>
                <CardTitle className="text-base font-bold flex items-center gap-2"><Activity className="h-4 w-4" /> Recent activity</CardTitle>
            </CardHeader>
            <CardContent>
                {rows.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic py-6 text-center">No recent activity.</p>
                ) : (
                    <div className="space-y-2">
                        {rows.map((e: any, i: number) => {
                            const Icon = EVENT_ICON[e.type] ?? Activity;
                            return (
                                <div key={e.id ?? i} className="flex items-center gap-3 text-xs border-b last:border-b-0 py-2">
                                    <div className="h-7 w-7 rounded-lg border-2 flex items-center justify-center shrink-0">
                                        <Icon className="h-3.5 w-3.5 text-primary" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="font-bold truncate">{e.type ?? 'event'}{e.byName ? ` · ${e.byName}` : ''}</p>
                                        {e.note && <p className="text-muted-foreground truncate">{e.note}</p>}
                                    </div>
                                    <span className="text-[10px] text-muted-foreground shrink-0">{relTime(toMs(e.timestamp ?? e.at ?? e.createdAt))}</span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

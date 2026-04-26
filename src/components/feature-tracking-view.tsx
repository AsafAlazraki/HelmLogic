'use client';

/**
 * Top-level Feature Tracking view. Hosts the tab switcher between the
 * live Board (Kanban) and the historical Release Notes timeline, and
 * keeps the active tab synced to the URL so a refresh lands users
 * where they were.
 */

import { useEffect, useMemo, useState } from 'react';
import { doc } from 'firebase/firestore';
import { Lightbulb, Kanban, BookOpen, ShieldAlert, Calendar, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFirestore, useMemoFirebase, useUser } from '@/firebase/provider';
import { useDoc } from '@/firebase/firestore/use-doc';
import { FeatureTrackingBoard } from '@/components/feature-tracking-board';
import { ReleaseNotesView } from '@/components/release-notes-view';
import { RoadmapView } from '@/components/roadmap-view';
import { BacklogView } from '@/components/backlog-view';
import type { ReleaseNote } from '@/lib/release-notes-loader';

type View = 'backlog' | 'board' | 'roadmap' | 'notes';

function initialView(): View {
    if (typeof window === 'undefined') return 'backlog';
    const v = new URLSearchParams(window.location.search).get('view');
    if (v === 'board') return 'board';
    if (v === 'roadmap') return 'roadmap';
    if (v === 'notes') return 'notes';
    return 'backlog';
}

export function FeatureTrackingView({ releaseNotes }: { releaseNotes: ReleaseNote[] }) {
    const [view, setView] = useState<View>(initialView);

    // Sub-dealer gate (v1.6 §3 layer 2 of 3).
    // Sidebar already hides the link, Firestore rules already deny.
    // This is the user-visible bail-out if a sub-dealer reaches the
    // route via direct URL or stale browser tab.
    const firestore = useFirestore();
    const { user } = useUser();
    const userProfileRef = useMemoFirebase(
        () => (user ? doc(firestore, 'users', user.uid) : null),
        [firestore, user?.uid],
    );
    const { data: userProfile } = useDoc<any>(userProfileRef);
    const orgRef = useMemoFirebase(
        () => (userProfile?.organisationId
            ? doc(firestore, 'organisations', userProfile.organisationId)
            : null),
        [firestore, userProfile?.organisationId],
    );
    const { data: organisation } = useDoc<any>(orgRef);
    const isSubDealer = !!organisation?.parentOrganisationId;

    if (isSubDealer) {
        return (
            <div className="h-full flex items-center justify-center bg-slate-50/50 p-6">
                <div className="max-w-md text-center space-y-3">
                    <div className="h-12 w-12 mx-auto rounded-full bg-amber-100 flex items-center justify-center">
                        <ShieldAlert className="h-6 w-6 text-amber-600" />
                    </div>
                    <h2 className="text-lg font-bold text-slate-800">Not available for sub-dealer accounts</h2>
                    <p className="text-sm text-slate-600">
                        Feature Tracking is internal to HelmLogic and partner dealer staff. If you think you should have access, please contact your account manager.
                    </p>
                </div>
            </div>
        );
    }

    // URL sync — default ('board') is stripped from the query so the
    // URL stays clean.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams(window.location.search);
        if (view === 'backlog') params.delete('view');
        else params.set('view', view);
        const q = params.toString();
        const next = window.location.pathname + (q ? `?${q}` : '');
        window.history.replaceState({}, '', next);
    }, [view]);

    return (
        <div className="flex flex-col h-full bg-slate-50/50">
            {/* Tab strip — small, lives above the board banner */}
            <div className="border-b bg-white px-6 shrink-0">
                <div className="flex items-center gap-1">
                    <TabButton
                        active={view === 'backlog'}
                        onClick={() => setView('backlog')}
                        icon={<Layers className="h-3.5 w-3.5" />}
                        label="Backlog"
                    />
                    <TabButton
                        active={view === 'board'}
                        onClick={() => setView('board')}
                        icon={<Kanban className="h-3.5 w-3.5" />}
                        label="Board"
                    />
                    <TabButton
                        active={view === 'roadmap'}
                        onClick={() => setView('roadmap')}
                        icon={<Calendar className="h-3.5 w-3.5" />}
                        label="Roadmap"
                    />
                    <TabButton
                        active={view === 'notes'}
                        onClick={() => setView('notes')}
                        icon={<BookOpen className="h-3.5 w-3.5" />}
                        label="Release Notes"
                        badge={releaseNotes.length > 0 ? String(releaseNotes.length) : undefined}
                    />
                    <div className="ml-auto flex items-center gap-1.5 text-[10px] text-slate-400 py-2">
                        <Lightbulb className="h-3 w-3 text-blue-500" />
                        Feature Tracking
                    </div>
                </div>
            </div>

            {/* View body — fills the remaining height */}
            <div className="flex-1 min-h-0">
                {view === 'board' && <FeatureTrackingBoard />}
                {view === 'roadmap' && <RoadmapView />}
                {view === 'backlog' && <BacklogView />}
                {view === 'notes' && <ReleaseNotesView notes={releaseNotes} />}
            </div>
        </div>
    );
}

function TabButton({
    active,
    onClick,
    icon,
    label,
    badge,
}: {
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
    badge?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors border-b-2 -mb-px',
                active
                    ? 'text-blue-700 border-blue-600'
                    : 'text-slate-500 border-transparent hover:text-slate-800',
            )}
        >
            {icon}
            {label}
            {badge && (
                <span
                    className={cn(
                        'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                        active ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600',
                    )}
                >
                    {badge}
                </span>
            )}
        </button>
    );
}

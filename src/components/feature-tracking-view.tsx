'use client';

/**
 * Top-level Feature Tracking view. Hosts the tab switcher between the
 * live Board (Kanban) and the historical Release Notes timeline, and
 * keeps the active tab synced to the URL so a refresh lands users
 * where they were.
 */

import { useEffect, useState } from 'react';
import { Lightbulb, Kanban, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FeatureTrackingBoard } from '@/components/feature-tracking-board';
import { ReleaseNotesView } from '@/components/release-notes-view';
import type { ReleaseNote } from '@/lib/release-notes-loader';

type View = 'board' | 'notes';

function initialView(): View {
    if (typeof window === 'undefined') return 'board';
    const v = new URLSearchParams(window.location.search).get('view');
    return v === 'notes' ? 'notes' : 'board';
}

export function FeatureTrackingView({ releaseNotes }: { releaseNotes: ReleaseNote[] }) {
    const [view, setView] = useState<View>(initialView);

    // URL sync — default ('board') is stripped from the query so the
    // URL stays clean.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams(window.location.search);
        if (view === 'board') params.delete('view');
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
                        active={view === 'board'}
                        onClick={() => setView('board')}
                        icon={<Kanban className="h-3.5 w-3.5" />}
                        label="Board"
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
                {view === 'board' ? (
                    <FeatureTrackingBoard />
                ) : (
                    <ReleaseNotesView notes={releaseNotes} />
                )}
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

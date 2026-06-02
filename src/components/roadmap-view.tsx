'use client';

/**
 * Roadmap view (v1.6).
 *
 * Horizontal-timeline counterpart to the Kanban Board. Cells are
 * laid out as:
 *
 *   columns:  v1.6 | v1.7 | v1.8 | v1.9 | v2.0 | Unscheduled
 *   rows:     epic 1 swim lane / epic 2 swim lane / .../ Unfiled
 *
 * Each cell renders compact feature chips for that epic × release
 * intersection. Click a chip to open the existing FeatureDetailSheet
 * (reused from the Board). The header per release shows a points sum
 * and tints amber > 25 / red > 40 so over-stuffed releases are
 * obvious. A "Today" pill marks the active column.
 *
 * Drag-and-drop between cells lands in stage 5 of v1.6.
 */

import { useMemo, useState } from 'react';
import { collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
    closestCorners,
    type DragEndEvent,
    type DragStartEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useToast } from '@/hooks/use-toast';
import {
    AlertTriangle,
    Bug,
    Calendar,
    CheckCircle2,
    HelpCircle,
    Lock,
    Sparkles,
    Wrench,
    FileText,
    Scale,
    ClipboardCheck,
} from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { V195StoriesSeedButton } from '@/components/v195-stories-seed-button';
import {
    FeatureDetailSheet,
    type EpicColor,
    type EpicDoc,
    type FeatureDoc,
    type FeatureType,
} from '@/components/feature-tracking-board';
import {
    POINTS_AMBER,
    POINTS_RED,
    RELEASE_WINDOWS,
    ROADMAP_COLUMNS,
    UNSCHEDULED_KEY,
    getActiveReleaseKey,
    isReleaseShipped,
    isMVPRelease,
} from '@/lib/release-schedule';

const EPIC_BAND_BG: Record<EpicColor, string> = {
    blue: 'bg-blue-500',
    amber: 'bg-amber-500',
    violet: 'bg-violet-500',
    emerald: 'bg-emerald-500',
    rose: 'bg-rose-500',
    indigo: 'bg-indigo-500',
    slate: 'bg-slate-500',
    cyan: 'bg-cyan-500',
};
const EPIC_TINT: Record<EpicColor, string> = {
    blue: 'bg-blue-50/40',
    amber: 'bg-amber-50/40',
    violet: 'bg-violet-50/40',
    emerald: 'bg-emerald-50/40',
    rose: 'bg-rose-50/40',
    indigo: 'bg-indigo-50/40',
    slate: 'bg-slate-50/60',
    cyan: 'bg-cyan-50/40',
};
const UNFILED_EPIC_KEY = '__unfiled__';

export function RoadmapView() {
    const firestore = useFirestore();
    const { toast } = useToast();
    const featuresRef = useMemoFirebase(() => collection(firestore, 'features'), [firestore]);
    const epicsRef = useMemoFirebase(() => collection(firestore, 'epics'), [firestore]);
    const { data: features } = useCollection<FeatureDoc>(featuresRef);
    const { data: epics } = useCollection<EpicDoc>(epicsRef);

    const [selectedId, setSelectedId] = useState<string | null>(null);
    /** Release-detail popup — set to a release key (or UNSCHEDULED_KEY)
     *  when a column header is clicked; shows that release's activities. */
    const [releaseDetailKey, setReleaseDetailKey] = useState<string | null>(null);
    const [activeId, setActiveId] = useState<string | null>(null);
    /**
     * Optimistic overlay for the dragged feature — same pattern as the
     * Board. Cleared on snapshot match or on write failure (rolled back).
     */
    const [optimistic, setOptimistic] = useState<
        Record<string, { epicId: string | null; targetRelease: string | null }>
    >({});

    // Filter state. Empty Set = "show all". Non-empty = "show only these".
    const [epicFilter, setEpicFilter] = useState<Set<string>>(new Set());
    const [releaseFilter, setReleaseFilter] = useState<Set<string>>(new Set());

    function toggleEpicFilter(id: string) {
        setEpicFilter(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function toggleReleaseFilter(rk: string) {
        setReleaseFilter(prev => {
            const next = new Set(prev);
            if (next.has(rk)) next.delete(rk);
            else next.add(rk);
            return next;
        });
    }

    /** Click an epic's swim-lane label → solo just that epic (or unsolo). */
    function soloEpic(id: string) {
        setEpicFilter(prev => {
            // If already soloed to just this one, clear (= show all).
            if (prev.size === 1 && prev.has(id)) return new Set();
            return new Set([id]);
        });
    }

    function clearFilters() {
        setEpicFilter(new Set());
        setReleaseFilter(new Set());
    }
    const hasFilters = epicFilter.size > 0 || releaseFilter.size > 0;

    // Activation distance: a click on a chip opens the detail sheet,
    // a 5px drag starts a move. Same UX contract as the Board.
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    );

    /**
     * Visible features: not soft-deleted, AND either bucket-able into a
     * planned release column or genuinely unscheduled. Already-shipped
     * v1.5 features (`targetRelease` outside RELEASE_WINDOWS keys) are
     * filtered out — Roadmap is a forward-looking view, the past lives
     * in the Release Notes tab.
     */
    /** Apply optimistic moves over the live snapshot. */
    const mergedFeatures = useMemo(() => {
        if (!features) return features;
        if (Object.keys(optimistic).length === 0) return features;
        return features.map(f => {
            const o = optimistic[f.id];
            return o ? { ...f, epicId: o.epicId, targetRelease: o.targetRelease } : f;
        });
    }, [features, optimistic]);

    // Drop optimistic entries once Firestore catches up.
    useMemo(() => {
        if (!features || Object.keys(optimistic).length === 0) return;
        const next = { ...optimistic };
        let changed = false;
        for (const f of features) {
            const o = optimistic[f.id];
            if (o && (f.epicId ?? null) === o.epicId && (f.targetRelease ?? null) === o.targetRelease) {
                delete next[f.id];
                changed = true;
            }
        }
        if (changed) setOptimistic(next);
    }, [features, optimistic]);

    const visibleFeatures = useMemo(() => {
        return (mergedFeatures ?? []).filter(f => {
            if (f.deletedAt) return false;
            if (!f.targetRelease) return true;     // Unscheduled bucket
            return f.targetRelease in RELEASE_WINDOWS;
        });
    }, [mergedFeatures]);

    const sortedEpics = useMemo(
        () => [...(epics ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
        [epics],
    );

    /** Epics actually shown — respects the active filter. */
    const visibleEpics = useMemo(() => {
        if (epicFilter.size === 0) return sortedEpics;
        return sortedEpics.filter(e => epicFilter.has(e.id));
    }, [sortedEpics, epicFilter]);

    /** Release columns actually shown — respects the active filter. */
    const visibleColumns = useMemo(() => {
        if (releaseFilter.size === 0) return ROADMAP_COLUMNS as readonly string[];
        return (ROADMAP_COLUMNS as readonly string[]).filter(rk => releaseFilter.has(rk));
    }, [releaseFilter]);

    const featureById = useMemo(() => {
        const m = new Map<string, FeatureDoc>();
        for (const f of features ?? []) m.set(f.id, f);
        return m;
    }, [features]);
    const selectedFeature = selectedId ? (featureById.get(selectedId) ?? null) : null;

    /**
     * Two-level group: byEpic[epicKey][releaseKey] → FeatureDoc[]
     * Features with an unknown / null epicId go into the "Unfiled"
     * pseudo-row at the bottom.
     */
    const grouped = useMemo(() => {
        const epicKeys = sortedEpics.map(e => e.id);
        const allEpicKeys = [...epicKeys, UNFILED_EPIC_KEY];
        const map: Record<string, Record<string, FeatureDoc[]>> = {};
        for (const ek of allEpicKeys) {
            map[ek] = {};
            for (const rk of ROADMAP_COLUMNS) map[ek][rk] = [];
        }
        for (const f of visibleFeatures) {
            const ek = f.epicId && epicKeys.includes(f.epicId) ? f.epicId : UNFILED_EPIC_KEY;
            const rk = f.targetRelease && (f.targetRelease in RELEASE_WINDOWS)
                ? f.targetRelease
                : UNSCHEDULED_KEY;
            map[ek][rk].push(f);
        }
        return map;
    }, [visibleFeatures, sortedEpics]);

    /** Total points + item count per release — feeds the header badges. */
    const pointsByRelease = useMemo(() => {
        const totals: Record<string, number> = {};
        for (const rk of ROADMAP_COLUMNS) totals[rk] = 0;
        for (const f of visibleFeatures) {
            const rk = f.targetRelease && (f.targetRelease in RELEASE_WINDOWS)
                ? f.targetRelease
                : UNSCHEDULED_KEY;
            totals[rk] += f.points ?? 0;
        }
        return totals;
    }, [visibleFeatures]);

    const itemsByRelease = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const rk of ROADMAP_COLUMNS) counts[rk] = 0;
        for (const f of visibleFeatures) {
            const rk = f.targetRelease && (f.targetRelease in RELEASE_WINDOWS)
                ? f.targetRelease
                : UNSCHEDULED_KEY;
            counts[rk] += 1;
        }
        return counts;
    }, [visibleFeatures]);

    const activeReleaseKey = getActiveReleaseKey();
    const unfilteredCount = (features ?? []).length;
    const filteredCount = visibleFeatures.length;
    const hiddenCount = unfilteredCount - filteredCount;

    const activeFeature = activeId ? (featureById.get(activeId) ?? null) : null;

    function onDragStart(e: DragStartEvent) {
        setActiveId(String(e.active.id));
    }

    async function onDragEnd(e: DragEndEvent) {
        setActiveId(null);
        const { active, over } = e;
        if (!over) return;
        const activeKey = String(active.id);
        const overKey = String(over.id);
        // Cell ids are encoded as `cell:${epicKey}:${releaseKey}`
        if (!overKey.startsWith('cell:')) return;
        const [, epicKeyRaw, releaseKey] = overKey.split(':');
        const targetEpicId = epicKeyRaw === UNFILED_EPIC_KEY ? null : epicKeyRaw;
        const targetRelease = releaseKey === UNSCHEDULED_KEY ? null : releaseKey;

        const moving = featureById.get(activeKey);
        if (!moving) return;
        // No-op: same cell.
        const currentEpic = moving.epicId ?? null;
        const currentRelease = moving.targetRelease ?? null;
        if (currentEpic === targetEpicId && currentRelease === targetRelease) return;

        // v1.6 — refuse moves that touch a shipped release (either side).
        // Shipped work is part of the historical record; rebucketing it
        // would rewrite history.
        if (isReleaseShipped(currentRelease)) {
            toast({
                variant: 'destructive',
                title: `${currentRelease} has shipped`,
                description: 'Stories from a shipped release are locked and can\'t be moved.',
            });
            return;
        }
        if (isReleaseShipped(targetRelease)) {
            toast({
                variant: 'destructive',
                title: `${targetRelease} has shipped`,
                description: 'You can\'t add new work to a shipped release.',
            });
            return;
        }

        // Optimistic.
        setOptimistic(prev => ({
            ...prev,
            [activeKey]: { epicId: targetEpicId, targetRelease },
        }));

        try {
            await updateDoc(doc(firestore, 'features', activeKey), {
                epicId: targetEpicId,
                targetRelease,
                updatedAt: serverTimestamp(),
            });

            // Capacity warning AFTER the write — sum of points for the
            // target release (using the merged map so the dropped card
            // is included in the sum).
            if (targetRelease && targetRelease in RELEASE_WINDOWS) {
                const newSum = (pointsByRelease[targetRelease] ?? 0) + (moving.points ?? 0)
                    - (currentRelease === targetRelease ? (moving.points ?? 0) : 0);
                if (newSum >= POINTS_RED) {
                    toast({
                        variant: 'destructive',
                        title: `${targetRelease} is overloaded`,
                        description: `${newSum} pts (red — likely impossible to ship).`,
                    });
                } else if (newSum >= POINTS_AMBER) {
                    toast({
                        title: `${targetRelease} is over capacity`,
                        description: `${newSum} pts (amber — pushing the limit).`,
                    });
                }
            }
        } catch (err: any) {
            setOptimistic(prev => {
                const copy = { ...prev };
                delete copy[activeKey];
                return copy;
            });
            toast({ variant: 'destructive', title: 'Move failed', description: err?.message ?? 'See console.' });
        }
    }

    return (
        <div className="flex flex-col h-full bg-slate-50/50">
            {/* Banner */}
            <div className="bg-gradient-to-r from-violet-600 to-blue-700 text-white px-6 py-4 shrink-0">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-white/15 rounded-xl flex items-center justify-center border border-white/20">
                            <Calendar className="h-5 w-5" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold">Roadmap</h1>
                            <p className="text-sm text-blue-50">
                                {filteredCount} planned · {pointsByRelease[UNSCHEDULED_KEY]} pts in backlog
                                {hiddenCount > 0 && (
                                    <span className="ml-2 text-blue-100/70 text-xs">
                                        · {hiddenCount} shipped (see Release Notes)
                                    </span>
                                )}
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-col gap-2 max-w-2xl">
                        <V195StoriesSeedButton />
                    </div>
                </div>
            </div>

            {/* Filter bar — multi-select pills for epics + releases. */}
            {sortedEpics.length > 0 && (
                <div className="border-b bg-white px-3 py-2 shrink-0 space-y-1.5">
                    <FilterRow
                        label="Epics"
                        options={sortedEpics.map(e => ({ key: e.id, label: e.shortLabel || e.title, color: e.color }))}
                        selected={epicFilter}
                        onToggle={toggleEpicFilter}
                    />
                    <FilterRow
                        label="Releases"
                        options={(ROADMAP_COLUMNS as readonly string[]).map(rk => ({
                            key: rk,
                            label: rk === UNSCHEDULED_KEY ? 'Backlog' : rk,
                            color: rk === UNSCHEDULED_KEY ? 'slate' : 'blue',
                        }))}
                        selected={releaseFilter}
                        onToggle={toggleReleaseFilter}
                    />
                    {hasFilters && (
                        <button
                            type="button"
                            onClick={clearFilters}
                            className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 underline"
                        >
                            Clear filters
                        </button>
                    )}
                </div>
            )}

            {/* Grid */}
            <div className="feature-scroll flex-1 min-h-0 overflow-auto">
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCorners}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                >
                    <div className="min-w-[1370px] p-2">
                        {/* Header row */}
                        <div className="grid sticky top-0 z-10 bg-slate-50/95 backdrop-blur" style={gridTemplate(visibleColumns.length)}>
                            <div className="px-2 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                Epic / Release →
                            </div>
                            {visibleColumns.map(rk => (
                                <ReleaseHeader
                                    key={rk}
                                    releaseKey={rk}
                                    points={pointsByRelease[rk]}
                                    items={itemsByRelease[rk]}
                                    isActive={activeReleaseKey === rk}
                                    isBacklog={rk === UNSCHEDULED_KEY}
                                    onClick={() => setReleaseDetailKey(rk)}
                                />
                            ))}
                        </div>

                        {/* Epic swim lanes */}
                        <div className="space-y-2 mt-2">
                            {visibleEpics.map(e => (
                                <EpicSwimLane
                                    key={e.id}
                                    epic={e}
                                    cells={grouped[e.id]}
                                    visibleColumns={visibleColumns}
                                    onOpen={(id) => setSelectedId(id)}
                                    onSolo={() => soloEpic(e.id)}
                                    isSoloed={epicFilter.size === 1 && epicFilter.has(e.id)}
                                />
                            ))}
                            {epicFilter.size === 0 && Object.values(grouped[UNFILED_EPIC_KEY] ?? {}).some(arr => arr.length > 0) && (
                                <UnfiledSwimLane
                                    cells={grouped[UNFILED_EPIC_KEY]}
                                    visibleColumns={visibleColumns}
                                    onOpen={(id) => setSelectedId(id)}
                                />
                            )}
                            {sortedEpics.length === 0 && (
                                <div className="rounded-xl border bg-white p-8 text-center space-y-2">
                                    <p className="text-sm font-semibold text-slate-700">No epics yet</p>
                                    <p className="text-xs text-slate-500">
                                        Open the Backlog tab to create epics that show up as swim lanes here.
                                    </p>
                                </div>
                            )}
                            {visibleEpics.length === 0 && sortedEpics.length > 0 && (
                                <div className="rounded-xl border border-dashed bg-white p-6 text-center">
                                    <p className="text-xs text-slate-500">
                                        No epics match the active filter. <button onClick={clearFilters} className="text-blue-600 underline">Clear filters</button> to see everything.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Footer — per-release totals so the eye doesn't have to
                            scroll back to the header to compare load. */}
                        {sortedEpics.length > 0 && visibleEpics.length > 0 && (
                            <div className="grid mt-3 rounded-lg border bg-white" style={gridTemplate(visibleColumns.length)}>
                                <div className="px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    Release totals
                                </div>
                                {visibleColumns.map(rk => {
                                    const total = pointsByRelease[rk] ?? 0;
                                    const itemCount = Object.values(grouped).reduce(
                                        (sum, byEpic) => sum + (byEpic[rk]?.length ?? 0), 0);
                                    const overload = total >= POINTS_RED ? 'red' : total >= POINTS_AMBER ? 'amber' : 'green';
                                    const isBacklog = rk === UNSCHEDULED_KEY;
                                    return (
                                        <div
                                            key={rk}
                                            className={cn(
                                                'px-3 py-2.5 border-l border-slate-200 flex items-center gap-2',
                                                isBacklog && 'bg-slate-50',
                                                overload === 'amber' && !isBacklog && 'bg-amber-50',
                                                overload === 'red' && !isBacklog && 'bg-red-50',
                                            )}
                                        >
                                            <span className={cn(
                                                'text-sm font-black',
                                                overload === 'red' ? 'text-red-700' :
                                                overload === 'amber' ? 'text-amber-700' :
                                                'text-slate-800',
                                            )}>
                                                {total}
                                            </span>
                                            <span className="text-[10px] text-slate-400">pts</span>
                                            <span className="text-slate-300">·</span>
                                            <span className="text-[10px] font-bold text-slate-700">{itemCount}</span>
                                            <span className="text-[10px] text-slate-400">item{itemCount === 1 ? '' : 's'}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    <DragOverlay>
                        {activeFeature ? <FeatureChip feature={activeFeature} onOpen={() => {}} isOverlay /> : null}
                    </DragOverlay>
                </DndContext>
            </div>

            <FeatureDetailSheet
                feature={selectedFeature}
                open={selectedFeature !== null}
                onOpenChange={(v) => { if (!v) setSelectedId(null); }}
            />

            {/* Release-detail popup — opened by clicking a column header.
                Lists every activity (story) in that release, grouped by
                epic. Clicking a story opens its detail sheet. */}
            <ReleaseDetailDialog
                releaseKey={releaseDetailKey}
                epics={sortedEpics}
                grouped={grouped}
                points={releaseDetailKey ? pointsByRelease[releaseDetailKey] ?? 0 : 0}
                items={releaseDetailKey ? itemsByRelease[releaseDetailKey] ?? 0 : 0}
                onOpenChange={(v) => { if (!v) setReleaseDetailKey(null); }}
                onOpenFeature={(id) => { setReleaseDetailKey(null); setSelectedId(id); }}
            />
        </div>
    );
}

/* ──────────────────────────────────────────────────────────────────
 * ReleaseDetailDialog — "what's in this release" popup
 * ────────────────────────────────────────────────────────────────── */

const STATUS_LABEL: Record<string, string> = {
    'submitted': 'Submitted',
    'under-review': 'Under Review',
    'planned': 'Planned',
    'in-progress': 'In Progress',
    'shipped': 'Shipped',
};
const STATUS_TINT: Record<string, string> = {
    'submitted': 'bg-slate-100 text-slate-600',
    'under-review': 'bg-violet-100 text-violet-700',
    'planned': 'bg-blue-100 text-blue-700',
    'in-progress': 'bg-amber-100 text-amber-700',
    'shipped': 'bg-emerald-100 text-emerald-700',
};

function ReleaseDetailDialog({
    releaseKey,
    epics,
    grouped,
    points,
    items,
    onOpenChange,
    onOpenFeature,
}: {
    releaseKey: string | null;
    epics: EpicDoc[];
    grouped: Record<string, Record<string, FeatureDoc[]>>;
    points: number;
    items: number;
    onOpenChange: (v: boolean) => void;
    onOpenFeature: (id: string) => void;
}) {
    const isBacklog = releaseKey === UNSCHEDULED_KEY;
    const shipped = releaseKey ? isReleaseShipped(releaseKey) : false;
    const mvp = releaseKey ? isMVPRelease(releaseKey) : false;

    // Build epic → features for the clicked release (+ unfiled bucket),
    // keeping only epics that actually have stories in this release.
    const sections: { key: string; label: string; color: EpicColor | null; feats: FeatureDoc[] }[] = [];
    if (releaseKey) {
        for (const e of epics) {
            const feats = grouped[e.id]?.[releaseKey] ?? [];
            if (feats.length > 0) {
                sections.push({ key: e.id, label: e.shortLabel || e.title, color: e.color, feats });
            }
        }
        const unfiled = grouped[UNFILED_EPIC_KEY]?.[releaseKey] ?? [];
        if (unfiled.length > 0) {
            sections.push({ key: UNFILED_EPIC_KEY, label: 'Unfiled', color: null, feats: unfiled });
        }
    }

    return (
        <Dialog open={releaseKey !== null} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {isBacklog ? 'Backlog' : releaseKey}
                        {shipped && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase tracking-widest bg-emerald-600 text-white rounded-full px-1.5 py-0.5">
                                <CheckCircle2 className="h-2.5 w-2.5" /> Shipped
                            </span>
                        )}
                        {mvp && !shipped && (
                            <span className="text-[9px] font-black uppercase tracking-widest bg-indigo-600 text-white rounded-full px-1.5 py-0.5">
                                MVP target
                            </span>
                        )}
                    </DialogTitle>
                    <DialogDescription>
                        {items} {items === 1 ? 'activity' : 'activities'} · {points} pts ·{' '}
                        {sections.length} {sections.length === 1 ? 'epic' : 'epics'} represented.
                        {isBacklog && ' These stories have no target release yet.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 space-y-4">
                    {sections.length === 0 && (
                        <div className="rounded-xl border-2 border-dashed bg-slate-50 p-8 text-center">
                            <p className="text-sm font-semibold text-slate-600">No activities in this release</p>
                            <p className="text-xs text-slate-400 mt-1">Nothing is scheduled here yet.</p>
                        </div>
                    )}
                    {sections.map(sec => {
                        const secPts = sec.feats.reduce((s, f) => s + (f.points ?? 0), 0);
                        return (
                            <div key={sec.key}>
                                <div className="flex items-center gap-2 mb-1.5">
                                    <span className={cn('h-2.5 w-2.5 rounded-full', sec.color ? EPIC_BAND_BG[sec.color] : 'bg-slate-300')} />
                                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-700">{sec.label}</p>
                                    <span className="text-[10px] text-slate-400">· {sec.feats.length} · {secPts} pts</span>
                                </div>
                                <ul className="space-y-1">
                                    {sec.feats
                                        .slice()
                                        .sort((a, b) => (a.title || '').localeCompare(b.title || ''))
                                        .map(f => {
                                            const st = f.status ?? 'submitted';
                                            return (
                                                <li key={f.id}>
                                                    <button
                                                        type="button"
                                                        onClick={() => onOpenFeature(f.id)}
                                                        className="w-full text-left rounded-lg border bg-white px-3 py-2 hover:border-slate-300 hover:bg-slate-50 transition-colors flex items-center gap-2"
                                                    >
                                                        <span className="flex-1 min-w-0 text-xs font-semibold text-slate-800 truncate">{f.title}</span>
                                                        <span className="shrink-0 text-[9px] font-bold text-slate-600 bg-slate-100 rounded px-1.5 py-0.5">
                                                            {f.points ?? '?'} pts
                                                        </span>
                                                        <span className={cn('shrink-0 text-[9px] font-black uppercase tracking-widest rounded px-1.5 py-0.5', STATUS_TINT[st] ?? STATUS_TINT.submitted)}>
                                                            {STATUS_LABEL[st] ?? st}
                                                        </span>
                                                    </button>
                                                </li>
                                            );
                                        })}
                                </ul>
                            </div>
                        );
                    })}
                </div>
            </DialogContent>
        </Dialog>
    );
}

function gridTemplate(cols: number): React.CSSProperties {
    // First column is the epic label (180px), remaining `cols` are
    // equal-width release columns.
    return { gridTemplateColumns: `170px repeat(${cols}, minmax(150px, 1fr))` };
}

function ReleaseHeader({
    releaseKey,
    points,
    items,
    isActive,
    isBacklog,
    onClick,
}: {
    releaseKey: string;
    points: number;
    items: number;
    isActive: boolean;
    isBacklog: boolean;
    onClick?: () => void;
}) {
    const shipped = isReleaseShipped(releaseKey);
    const overload = points >= POINTS_RED ? 'red' : points >= POINTS_AMBER ? 'amber' : 'green';
    return (
        <button
            type="button"
            onClick={onClick}
            title={`${isBacklog ? 'Backlog' : releaseKey} — click to see this release's activities`}
            className={cn(
                'w-full text-left px-3 py-2 border-l first:border-l-0 border-slate-200 transition-colors hover:bg-slate-200/40 cursor-pointer',
                isBacklog && 'bg-slate-100/80',
                shipped && !isBacklog && 'bg-emerald-100/80 border-l-emerald-300',
                !shipped && overload === 'amber' && !isBacklog && 'bg-amber-50',
                !shipped && overload === 'red' && !isBacklog && 'bg-red-50',
            )}
        >
            <div className="flex items-baseline gap-2 flex-wrap">
                <span className={cn(
                    'text-sm font-black tracking-tight',
                    isBacklog ? 'text-slate-700' :
                    shipped ? 'text-emerald-900' : 'text-slate-800',
                )}>
                    {isBacklog ? 'Backlog' : releaseKey}
                </span>
                {shipped && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase tracking-widest bg-emerald-600 text-white rounded-full px-1.5 py-0.5">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        Shipped
                    </span>
                )}
                {isActive && !shipped && (
                    <span className="text-[9px] font-black uppercase tracking-widest bg-blue-600 text-white rounded-full px-1.5 py-0.5">
                        Today
                    </span>
                )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className={cn(
                    'text-[10px] font-semibold',
                    shipped ? 'text-emerald-800' :
                    overload === 'red' ? 'text-red-700' :
                    overload === 'amber' ? 'text-amber-700' :
                    'text-slate-500',
                )}>
                    {points} pts
                </span>
                <span className="text-slate-300 text-[10px]">·</span>
                <span className={cn(
                    'text-[10px] font-semibold',
                    shipped ? 'text-emerald-700' : 'text-slate-500',
                )}>
                    {items} item{items === 1 ? '' : 's'}
                </span>
                {shipped && (
                    <Lock className="h-3 w-3 ml-auto text-emerald-700" />
                )}
                {!shipped && (overload === 'amber' || overload === 'red') && !isBacklog && (
                    <AlertTriangle className={cn(
                        'h-3 w-3 ml-auto',
                        overload === 'red' ? 'text-red-600' : 'text-amber-600',
                    )} />
                )}
            </div>
        </button>
    );
}

function EpicSwimLane({
    epic,
    cells,
    visibleColumns,
    onOpen,
    onSolo,
    isSoloed,
}: {
    epic: EpicDoc;
    cells: Record<string, FeatureDoc[]>;
    visibleColumns: readonly string[];
    onOpen: (id: string) => void;
    onSolo: () => void;
    isSoloed: boolean;
}) {
    const epicTotal = useMemo(
        () => Object.values(cells).reduce((sum, arr) => sum + arr.reduce((s, f) => s + (f.points ?? 0), 0), 0),
        [cells],
    );
    const epicCount = useMemo(
        () => Object.values(cells).reduce((sum, arr) => sum + arr.length, 0),
        [cells],
    );

    return (
        <div className="rounded-xl border bg-white overflow-hidden">
            <div className="grid" style={gridTemplate(visibleColumns.length)}>
                {/* Epic label — clickable to solo */}
                <button
                    type="button"
                    onClick={onSolo}
                    title={isSoloed ? 'Click to clear filter (show all epics)' : `Click to focus on "${epic.title}" only`}
                    className={cn(
                        'flex items-stretch text-left transition-colors',
                        isSoloed ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-slate-50',
                    )}
                >
                    <div className={cn('w-1 shrink-0', EPIC_BAND_BG[epic.color] ?? 'bg-slate-400')} />
                    <div className="flex-1 px-3 py-3 min-w-0">
                        <div className="text-xs font-bold text-slate-800 truncate flex items-center gap-1.5" title={epic.title}>
                            {epic.shortLabel || epic.title}
                            {isSoloed && (
                                <span className="text-[8px] font-black uppercase tracking-widest bg-blue-600 text-white rounded-full px-1.5 py-0.5 shrink-0">
                                    Soloed
                                </span>
                            )}
                        </div>
                        <div className="text-[10px] text-slate-400">
                            {epicCount} item{epicCount === 1 ? '' : 's'} · {epicTotal} pts
                        </div>
                    </div>
                </button>
                {/* Cells */}
                {visibleColumns.map(rk => (
                    <RoadmapCell
                        key={rk}
                        epic={epic}
                        releaseKey={rk}
                        features={cells[rk]}
                        onOpen={onOpen}
                    />
                ))}
            </div>
        </div>
    );
}

function UnfiledSwimLane({
    cells,
    visibleColumns,
    onOpen,
}: {
    cells: Record<string, FeatureDoc[]>;
    visibleColumns: readonly string[];
    onOpen: (id: string) => void;
}) {
    const total = useMemo(
        () => Object.values(cells).reduce((sum, arr) => sum + arr.length, 0),
        [cells],
    );
    if (total === 0) return null;
    return (
        <div className="rounded-xl border border-dashed bg-white overflow-hidden">
            <div className="grid" style={gridTemplate(visibleColumns.length)}>
                <div className="flex items-stretch">
                    <div className="w-1 shrink-0 bg-slate-300" />
                    <div className="flex-1 px-3 py-3 min-w-0">
                        <div className="text-xs font-bold text-slate-600 italic">Unfiled</div>
                        <div className="text-[10px] text-slate-400">{total} item{total === 1 ? '' : 's'}</div>
                    </div>
                </div>
                {visibleColumns.map(rk => (
                    <RoadmapCell
                        key={rk}
                        epic={null}
                        releaseKey={rk}
                        features={cells[rk]}
                        onOpen={onOpen}
                    />
                ))}
            </div>
        </div>
    );
}

function RoadmapCell({
    epic,
    releaseKey,
    features,
    onOpen,
}: {
    epic: EpicDoc | null;
    releaseKey: string;
    features: FeatureDoc[];
    onOpen: (id: string) => void;
}) {
    const isBacklog = releaseKey === UNSCHEDULED_KEY;
    const isShipped = isReleaseShipped(releaseKey);
    const epicKey = epic?.id ?? UNFILED_EPIC_KEY;
    // Cell id encodes both axes — onDragEnd parses this to know the
    // target epic + release for the dropped feature.
    // Shipped cells are not droppable: drop disabled so even the hover
    // ring never appears. The drag-end logic also blocks shipped moves
    // as a defensive second layer.
    const { setNodeRef, isOver } = useDroppable({
        id: `cell:${epicKey}:${releaseKey}`,
        disabled: isShipped,
    });
    return (
        <div
            ref={setNodeRef}
            className={cn(
                'border-l border-slate-100 px-2 py-2 space-y-2 min-h-[88px] transition-colors',
                isBacklog && 'bg-slate-50/80',
                isShipped && 'bg-emerald-50/50',
                !isBacklog && !isShipped && epic && EPIC_TINT[epic.color],
                isOver && !isShipped && 'ring-2 ring-inset ring-blue-300 bg-blue-50/60',
            )}
        >
            {features.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                    <span className="text-[10px] text-slate-300">{isOver ? 'Drop' : '—'}</span>
                </div>
            ) : (
                features.map(f => (
                    <FeatureChip key={f.id} feature={f} onOpen={onOpen} />
                ))
            )}
        </div>
    );
}

function FeatureChip({
    feature,
    onOpen,
    isOverlay = false,
}: {
    feature: FeatureDoc;
    onOpen: (id: string) => void;
    /** Rendered inside <DragOverlay>? If so skip useDraggable wiring. */
    isOverlay?: boolean;
}) {
    const Icon = feature.type === 'bug' ? Bug
        : feature.type === 'improvement' ? Wrench
        : feature.type === 'content' ? FileText
        : feature.type === 'decision' ? Scale
        : feature.type === 'task' ? ClipboardCheck
        : Sparkles;
    const iconClass = feature.type === 'bug' ? 'text-rose-500'
        : feature.type === 'improvement' ? 'text-indigo-500'
        : feature.type === 'content' ? 'text-orange-500'
        : feature.type === 'decision' ? 'text-purple-500'
        : feature.type === 'task' ? 'text-cyan-600'
        : 'text-blue-500';
    const isUnestimated = feature.points == null;
    // Tiny coloured dot so priority is recognisable at a glance — the
    // word ("critical" / "high") is too long for the chip but a colour
    // dot reads instantly.
    const priorityDot: Record<string, string> = {
        critical:       'bg-red-500',
        high:           'bg-orange-500',
        medium:         'bg-amber-400',
        low:            'bg-slate-400',
        'nice-to-have': 'bg-slate-300',
    };
    const priorityClass = priorityDot[feature.priority ?? 'medium'] ?? 'bg-slate-300';

    // v1.6 — chips in shipped releases are not draggable. Click still
    // opens the detail sheet (read-only there).
    const isShipped = isReleaseShipped(feature.targetRelease);

    // Hook always called (rules-of-hooks). Disabled for the overlay
    // clone so it doesn't try to register a second draggable id, and
    // disabled for shipped chips.
    const draggable = useDraggable({ id: feature.id, disabled: isOverlay || isShipped });
    const style: React.CSSProperties = isOverlay
        ? { cursor: 'grabbing' }
        : {
            transform: CSS.Translate.toString(draggable.transform),
            opacity: draggable.isDragging ? 0.3 : 1,
        };

    return (
        <button
            ref={isOverlay ? undefined : draggable.setNodeRef}
            style={style}
            {...(isOverlay ? {} : draggable.attributes)}
            {...(isOverlay ? {} : draggable.listeners)}
            type="button"
            onClick={() => { if (!isOverlay) onOpen(feature.id); }}
            className={cn(
                'w-full text-left rounded-md border px-2.5 py-2 transition-all space-y-1',
                isShipped
                    ? 'bg-emerald-50/70 border-emerald-300 hover:border-emerald-400 cursor-pointer'
                    : 'bg-white hover:border-blue-300 hover:shadow-sm',
                !isOverlay && !isShipped && 'cursor-grab active:cursor-grabbing',
                isOverlay && 'shadow-xl ring-2 ring-blue-300 cursor-grabbing',
            )}
            title={
                isOverlay ? feature.title :
                isShipped ? `${feature.title} — shipped (read-only) · click to view` :
                `${feature.title} — click to open · drag to move`
            }
        >
            {/* Title row — title gets the most space, can wrap to 3 lines */}
            <div className="flex items-start gap-1.5">
                <Icon className={cn('h-3.5 w-3.5 shrink-0 mt-0.5', iconClass)} />
                <span className="flex-1 text-xs font-semibold text-slate-800 line-clamp-3 leading-snug">
                    {feature.title}
                </span>
            </div>
            {/* Meta row — priority dot, points, status. flex-wrap so the
                status pill never clips on narrow Roadmap columns (it's
                short — "Shipped" / "Submitted" / "In Progress" — but
                the cards are tight; wrapping is preferable to truncating
                a 9-char label that customers read at a glance). */}
            <div className="flex flex-wrap items-center gap-1.5 pl-5">
                {feature.priority && (
                    <span
                        className={cn('h-2 w-2 rounded-full shrink-0', priorityClass)}
                        title={`Priority: ${feature.priority}`}
                    />
                )}
                {isUnestimated ? (
                    <span
                        className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-0.5"
                        title="Unestimated — needs story points"
                    >
                        <HelpCircle className="h-2.5 w-2.5" /> ?
                    </span>
                ) : (
                    <span className="text-[10px] font-bold text-slate-700 bg-slate-100 rounded px-1.5 py-0.5 shrink-0">
                        {feature.points} pts
                    </span>
                )}
                <span className={cn(
                    'text-[10px] inline-flex items-center gap-0.5 shrink-0 whitespace-nowrap',
                    isShipped ? 'text-emerald-700 font-semibold' : 'text-slate-400',
                )}>
                    {isShipped && <Lock className="h-2.5 w-2.5" />}
                    {feature.status === 'in-progress' ? 'In Progress'
                        : feature.status === 'under-review' ? 'Under Review'
                        : feature.status === 'planned' ? 'Planned'
                        : feature.status === 'shipped' ? 'Shipped'
                        : 'Submitted'}
                </span>
            </div>
        </button>
    );
}

/**
 * Multi-select toggle pill row for the filter bar.
 *
 * Empty `selected` set = "show all" (the visual treatment for that
 * row dims none of the pills — they all read as "available"). Clicking
 * a pill in this state TOGGLES it selected, which switches into
 * filter mode. Click a selected pill to remove it from the filter.
 */
function FilterRow({
    label,
    options,
    selected,
    onToggle,
}: {
    label: string;
    options: Array<{ key: string; label: string; color?: EpicColor | string }>;
    selected: Set<string>;
    onToggle: (key: string) => void;
}) {
    const filterActive = selected.size > 0;
    return (
        <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 shrink-0 w-16">
                {label}
            </span>
            {options.map(o => {
                const isSelected = selected.has(o.key);
                // When a filter is active: selected = highlighted, others = dimmed.
                // When no filter: all pills look "neutral available".
                const dimmed = filterActive && !isSelected;
                return (
                    <button
                        key={o.key}
                        type="button"
                        onClick={() => onToggle(o.key)}
                        className={cn(
                            'text-[10px] font-semibold rounded-full border px-2 py-0.5 transition-colors',
                            isSelected
                                ? 'bg-blue-600 text-white border-blue-700 hover:bg-blue-700'
                                : dimmed
                                    ? 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50',
                        )}
                    >
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}

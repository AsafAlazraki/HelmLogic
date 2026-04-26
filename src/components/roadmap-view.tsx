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
 * obvious. Today + SCIBS pills mark the active and MVP-target columns.
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
    HelpCircle,
    Sparkles,
    Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';
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
};
const EPIC_TINT: Record<EpicColor, string> = {
    blue: 'bg-blue-50/40',
    amber: 'bg-amber-50/40',
    violet: 'bg-violet-50/40',
    emerald: 'bg-emerald-50/40',
    rose: 'bg-rose-50/40',
    indigo: 'bg-indigo-50/40',
    slate: 'bg-slate-50/60',
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
    const [activeId, setActiveId] = useState<string | null>(null);
    /**
     * Optimistic overlay for the dragged feature — same pattern as the
     * Board. Cleared on snapshot match or on write failure (rolled back).
     */
    const [optimistic, setOptimistic] = useState<
        Record<string, { epicId: string | null; targetRelease: string | null }>
    >({});

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

    /** Total points per release (sum across all epics) — feeds the header badges. */
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
                </div>
            </div>

            {/* Grid */}
            <div className="feature-scroll flex-1 min-h-0 overflow-auto">
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCorners}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                >
                    <div className="min-w-[1100px] p-4">
                        {/* Header row */}
                        <div className="grid sticky top-0 z-10 bg-slate-50/95 backdrop-blur" style={gridTemplate(ROADMAP_COLUMNS.length)}>
                            <div className="px-2 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                Epic / Release →
                            </div>
                            {ROADMAP_COLUMNS.map(rk => (
                                <ReleaseHeader
                                    key={rk}
                                    releaseKey={rk}
                                    points={pointsByRelease[rk]}
                                    isActive={activeReleaseKey === rk}
                                    isMVP={rk !== UNSCHEDULED_KEY && isMVPRelease(rk)}
                                    isBacklog={rk === UNSCHEDULED_KEY}
                                />
                            ))}
                        </div>

                        {/* Epic swim lanes */}
                        <div className="space-y-2 mt-2">
                            {sortedEpics.map(e => (
                                <EpicSwimLane
                                    key={e.id}
                                    epic={e}
                                    cells={grouped[e.id]}
                                    onOpen={(id) => setSelectedId(id)}
                                />
                            ))}
                            {Object.values(grouped[UNFILED_EPIC_KEY] ?? {}).some(arr => arr.length > 0) && (
                                <UnfiledSwimLane
                                    cells={grouped[UNFILED_EPIC_KEY]}
                                    onOpen={(id) => setSelectedId(id)}
                                />
                            )}
                            {sortedEpics.length === 0 && (
                                <div className="rounded-xl border bg-white p-8 text-center space-y-2">
                                    <p className="text-sm font-semibold text-slate-700">No epics yet</p>
                                    <p className="text-xs text-slate-500">
                                        Open <strong>Manage epics</strong> from the Board banner to create the swim lanes that group your features.
                                    </p>
                                </div>
                            )}
                        </div>
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
        </div>
    );
}

function gridTemplate(cols: number): React.CSSProperties {
    // First column is the epic label (180px), remaining `cols` are
    // equal-width release columns.
    return { gridTemplateColumns: `180px repeat(${cols}, minmax(160px, 1fr))` };
}

function ReleaseHeader({
    releaseKey,
    points,
    isActive,
    isMVP,
    isBacklog,
}: {
    releaseKey: string;
    points: number;
    isActive: boolean;
    isMVP: boolean;
    isBacklog: boolean;
}) {
    const overload = points >= POINTS_RED ? 'red' : points >= POINTS_AMBER ? 'amber' : 'green';
    const win = RELEASE_WINDOWS[releaseKey];
    return (
        <div
            className={cn(
                'px-3 py-2 border-l first:border-l-0 border-slate-200',
                isBacklog && 'bg-slate-100/80',
                overload === 'amber' && !isBacklog && 'bg-amber-50',
                overload === 'red' && !isBacklog && 'bg-red-50',
            )}
        >
            <div className="flex items-baseline gap-2 flex-wrap">
                <span className={cn(
                    'text-sm font-black tracking-tight',
                    isBacklog ? 'text-slate-700' : 'text-slate-800',
                )}>
                    {isBacklog ? 'Backlog' : releaseKey}
                </span>
                {isActive && (
                    <span className="text-[9px] font-black uppercase tracking-widest bg-blue-600 text-white rounded-full px-1.5 py-0.5">
                        Today
                    </span>
                )}
                {isMVP && (
                    <span className="text-[9px] font-black uppercase tracking-widest bg-emerald-600 text-white rounded-full px-1.5 py-0.5">
                        SCIBS
                    </span>
                )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
                <span className={cn(
                    'text-[10px] font-semibold',
                    overload === 'red' ? 'text-red-700' :
                    overload === 'amber' ? 'text-amber-700' :
                    'text-slate-500',
                )}>
                    {points} pts
                </span>
                {(overload === 'amber' || overload === 'red') && !isBacklog && (
                    <AlertTriangle className={cn(
                        'h-3 w-3',
                        overload === 'red' ? 'text-red-600' : 'text-amber-600',
                    )} />
                )}
                {win?.label && !isBacklog && (
                    <span className="text-[9px] text-slate-400 ml-auto truncate">
                        {win.label}
                    </span>
                )}
            </div>
        </div>
    );
}

function EpicSwimLane({
    epic,
    cells,
    onOpen,
}: {
    epic: EpicDoc;
    cells: Record<string, FeatureDoc[]>;
    onOpen: (id: string) => void;
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
            <div className="grid" style={gridTemplate(ROADMAP_COLUMNS.length)}>
                {/* Epic label */}
                <div className="flex items-stretch">
                    <div className={cn('w-1 shrink-0', EPIC_BAND_BG[epic.color] ?? 'bg-slate-400')} />
                    <div className="flex-1 px-3 py-3 min-w-0">
                        <div className="text-xs font-bold text-slate-800 truncate" title={epic.title}>
                            {epic.shortLabel || epic.title}
                        </div>
                        <div className="text-[10px] text-slate-400">
                            {epicCount} item{epicCount === 1 ? '' : 's'} · {epicTotal} pts
                        </div>
                    </div>
                </div>
                {/* Cells */}
                {ROADMAP_COLUMNS.map(rk => (
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
    onOpen,
}: {
    cells: Record<string, FeatureDoc[]>;
    onOpen: (id: string) => void;
}) {
    const total = useMemo(
        () => Object.values(cells).reduce((sum, arr) => sum + arr.length, 0),
        [cells],
    );
    if (total === 0) return null;
    return (
        <div className="rounded-xl border border-dashed bg-white overflow-hidden">
            <div className="grid" style={gridTemplate(ROADMAP_COLUMNS.length)}>
                <div className="flex items-stretch">
                    <div className="w-1 shrink-0 bg-slate-300" />
                    <div className="flex-1 px-3 py-3 min-w-0">
                        <div className="text-xs font-bold text-slate-600 italic">Unfiled</div>
                        <div className="text-[10px] text-slate-400">{total} item{total === 1 ? '' : 's'}</div>
                    </div>
                </div>
                {ROADMAP_COLUMNS.map(rk => (
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
    const epicKey = epic?.id ?? UNFILED_EPIC_KEY;
    // Cell id encodes both axes — onDragEnd parses this to know the
    // target epic + release for the dropped feature.
    const { setNodeRef, isOver } = useDroppable({ id: `cell:${epicKey}:${releaseKey}` });
    return (
        <div
            ref={setNodeRef}
            className={cn(
                'border-l border-slate-100 px-2 py-2 space-y-1.5 min-h-[64px] transition-colors',
                isBacklog && 'bg-slate-50/80',
                !isBacklog && epic && EPIC_TINT[epic.color],
                isOver && 'ring-2 ring-inset ring-blue-300 bg-blue-50/60',
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
        : Sparkles;
    const iconClass = feature.type === 'bug' ? 'text-rose-500'
        : feature.type === 'improvement' ? 'text-indigo-500'
        : 'text-blue-500';
    const isUnestimated = feature.points == null;

    // Hook always called (rules-of-hooks). Disabled for the overlay
    // clone so it doesn't try to register a second draggable id.
    const draggable = useDraggable({ id: feature.id, disabled: isOverlay });
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
                'w-full text-left rounded-md border bg-white px-2 py-1.5 hover:border-blue-300 hover:shadow-sm transition-all',
                'group flex items-start gap-1.5',
                isOverlay
                    ? 'shadow-xl ring-2 ring-blue-300 cursor-grabbing'
                    : 'cursor-grab active:cursor-grabbing',
            )}
            title={isOverlay ? feature.title : `${feature.title} — click to open · drag to move`}
        >
            <Icon className={cn('h-3 w-3 shrink-0 mt-0.5', iconClass)} />
            <span className="flex-1 text-[11px] font-medium text-slate-700 line-clamp-2 leading-tight">
                {feature.title}
            </span>
            {isUnestimated ? (
                <HelpCircle
                    className="h-3 w-3 text-amber-500 shrink-0 mt-0.5"
                    aria-label="Unestimated — needs story points"
                />
            ) : (
                <span className="text-[9px] font-bold text-slate-500 bg-slate-100 rounded px-1 py-0.5 shrink-0">
                    {feature.points}
                </span>
            )}
        </button>
    );
}

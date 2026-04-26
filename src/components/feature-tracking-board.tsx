'use client';

/**
 * Feature Tracking board — v1.5.
 *
 * Stage 2 (this commit): real Kanban. 5 columns, live subscription to
 * `features/*`, cards render title / type icon / priority / release /
 * tags / vote count.
 *
 * Later stages add:
 *   3. Drag-and-drop reorder within column + move between columns
 *   4. Create-feature dialog (TipTap + image upload + acceptance criteria)
 *   5. Detail sheet (full description, comments thread, metadata editors)
 *   6. Per-column sort toggle (manual / votes / date)
 */

import { useEffect, useMemo, useState } from 'react';
import {
    addDoc,
    arrayRemove,
    arrayUnion,
    collection,
    deleteDoc,
    doc,
    increment,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
} from 'firebase/firestore';
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    KeyboardSensor,
    useSensor,
    useSensors,
    useDroppable,
    closestCorners,
    type DragEndEvent,
    type DragStartEvent,
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useUser } from '@/firebase/provider';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/sheet';
import {
    Lightbulb,
    Plus,
    Bug,
    Sparkles,
    Wrench,
    ThumbsUp,
    Tag as TagIcon,
    MessageSquare,
    X,
    Loader2,
    CheckCircle2,
    Trash2,
    Send,
    Layers,
    Pencil,
    GripVertical,
    Clock,
    ArrowDownUp,
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
    FeatureRichTextEditor,
    FeatureDescriptionView,
} from '@/components/feature-rich-text-editor';
import { FeatureImageUploader } from '@/components/feature-image-uploader';
import { EpicManagementDialog } from '@/components/epic-management-dialog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FeatureStatus =
    | 'submitted'
    | 'under-review'
    | 'planned'
    | 'in-progress'
    | 'shipped';

export type FeaturePriority =
    | 'critical'
    | 'high'
    | 'medium'
    | 'low'
    | 'nice-to-have';

export type FeatureType = 'feature' | 'bug' | 'improvement';

export type SortMode = 'manual' | 'votes' | 'date';

/**
 * Preset target-release picks. Start at v1.5 (this release) and go to
 * v2.0 so the board stays agile without users having to invent strings.
 * `Unscheduled` = "we want this but no release is committed yet."
 * Legacy free-text values (e.g. "Q3 2026") still render via the
 * "current-value fallback" item injected at the top of the dropdown
 * in <ReleasePicker>.
 */
const RELEASE_OPTIONS = [
    'v1.5',
    'v1.6',
    'v1.7',
    'v1.8',
    'v1.9',
    'v2.0',
    'Unscheduled',
] as const;

const SORT_MODES: Array<{ key: SortMode; label: string; icon: React.ComponentType<any> }> = [
    { key: 'manual', label: 'Manual (drag)', icon: GripVertical },
    { key: 'votes',  label: 'Most votes',    icon: ThumbsUp },
    { key: 'date',   label: 'Newest first',  icon: Clock },
];

export interface FeatureDoc {
    id: string;
    title: string;
    /** TipTap JSON (populated by the create dialog in stage 4). */
    description?: string;
    type?: FeatureType;
    status?: FeatureStatus;
    priority?: FeaturePriority;
    targetRelease?: string | null;
    tags?: string[];
    voteIds?: string[];
    order?: number;
    acceptanceCriteria?: string[];
    imageUrls?: string[];
    submitterId?: string;
    submitterName?: string;
    createdAt?: any;
    updatedAt?: any;
    commentCount?: number;
    /** v1.6 — FK into epics/{id}. null/undefined = unfiled. */
    epicId?: string | null;
    /** v1.6 — Fibonacci story points: 1 | 2 | 3 | 5 | 8. null/undefined = unestimated. */
    points?: number | null;
    /** v1.6 — set on soft delete. Hides from board/roadmap; visible in Archive tab. */
    deletedAt?: any | null;
    /** v1.6 — uid of the user who soft-deleted. */
    deletedBy?: string | null;
}

/** Fibonacci-flavoured story-point options for v1.6 effort estimation. */
export const POINT_OPTIONS = [1, 2, 3, 5, 8] as const;
export type StoryPoints = typeof POINT_OPTIONS[number];

/** Epic colour palette — must match the swim-lane band colours. */
export type EpicColor = 'blue' | 'amber' | 'violet' | 'emerald' | 'rose' | 'slate' | 'indigo';

export interface EpicDoc {
    id: string;
    title: string;
    /** ≤ 24 chars, rendered as the swim-lane label / chip. */
    shortLabel: string;
    description?: string;
    color: EpicColor;
    /** Fractional index for swim-lane order (drag to reorder). */
    order: number;
    status?: 'planning' | 'active' | 'done';
    createdAt?: any;
    updatedAt?: any;
}

// ---------------------------------------------------------------------------
// Column metadata
// ---------------------------------------------------------------------------

const COLUMNS: Array<{
    key: FeatureStatus;
    label: string;
    accent: string;       // ring + header accent
    badge: string;        // count badge
}> = [
    {
        key: 'submitted',
        label: 'Submitted',
        accent: 'border-slate-300',
        badge: 'bg-slate-100 text-slate-700',
    },
    {
        key: 'under-review',
        label: 'Under Review',
        accent: 'border-amber-300',
        badge: 'bg-amber-100 text-amber-800',
    },
    {
        key: 'planned',
        label: 'Planned',
        accent: 'border-blue-300',
        badge: 'bg-blue-100 text-blue-800',
    },
    {
        key: 'in-progress',
        label: 'In Progress',
        accent: 'border-violet-300',
        badge: 'bg-violet-100 text-violet-800',
    },
    {
        key: 'shipped',
        label: 'Shipped',
        accent: 'border-emerald-300',
        badge: 'bg-emerald-100 text-emerald-800',
    },
];

const PRIORITY_STYLES: Record<FeaturePriority, { label: string; className: string }> = {
    critical:       { label: 'Critical',     className: 'bg-red-100 text-red-700 border-red-200' },
    high:           { label: 'High',         className: 'bg-orange-100 text-orange-700 border-orange-200' },
    medium:         { label: 'Medium',       className: 'bg-amber-100 text-amber-700 border-amber-200' },
    low:            { label: 'Low',          className: 'bg-slate-100 text-slate-600 border-slate-200' },
    'nice-to-have': { label: 'Nice to have', className: 'bg-slate-50 text-slate-500 border-slate-100' },
};

/**
 * Shared release Select — used by both the create dialog and the detail
 * sheet so the list stays consistent. Preserves legacy free-text values
 * (e.g. a feature saved under "v1.4" before this refactor) by injecting
 * them as an extra item at the top of the list.
 */
function ReleasePicker({
    value,
    onChange,
    triggerClassName,
}: {
    value: string | null | undefined;
    onChange: (next: string | null) => void;
    triggerClassName?: string;
}) {
    const current = value ?? '';
    const isLegacy = current !== '' && !(RELEASE_OPTIONS as readonly string[]).includes(current);
    const effective = current === '' ? '__none__' : current;
    return (
        <Select
            value={effective}
            onValueChange={(v) => onChange(v === '__none__' ? null : v)}
        >
            <SelectTrigger className={cn('h-9 text-sm', triggerClassName)}>
                <SelectValue placeholder="Pick a release" />
            </SelectTrigger>
            <SelectContent className="z-[10000]">
                <SelectItem value="__none__" className="text-xs text-slate-400 italic">
                    No release picked
                </SelectItem>
                {isLegacy && (
                    <SelectItem value={current} className="text-xs">
                        {current} <span className="text-slate-400">(current)</span>
                    </SelectItem>
                )}
                {RELEASE_OPTIONS.map(r => (
                    <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

/**
 * v1.6 — Epic picker. Subscribes to the epics collection so it always
 * shows the current set. "No epic" entry maps to null. Sorted by the
 * epic's `order` field. Colour swatch shown on each option so the
 * picker matches the swim-lane colours.
 */
function EpicPicker({
    value,
    onChange,
    triggerClassName,
}: {
    value: string | null | undefined;
    onChange: (next: string | null) => void;
    triggerClassName?: string;
}) {
    const firestore = useFirestore();
    const epicsRef = useMemoFirebase(() => collection(firestore, 'epics'), [firestore]);
    const { data: epics } = useCollection<EpicDoc>(epicsRef);
    const sorted = useMemo(
        () => [...(epics ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
        [epics],
    );
    const effective = value || '__none__';
    const swatchClassByColor: Record<EpicColor, string> = {
        blue: 'bg-blue-500',
        amber: 'bg-amber-500',
        violet: 'bg-violet-500',
        emerald: 'bg-emerald-500',
        rose: 'bg-rose-500',
        indigo: 'bg-indigo-500',
        slate: 'bg-slate-500',
    };
    return (
        <Select
            value={effective}
            onValueChange={(v) => onChange(v === '__none__' ? null : v)}
        >
            <SelectTrigger className={cn('h-9 text-sm', triggerClassName)}>
                <SelectValue placeholder="Pick an epic" />
            </SelectTrigger>
            <SelectContent className="z-[10000]">
                <SelectItem value="__none__" className="text-xs text-slate-400 italic">
                    Unfiled (no epic)
                </SelectItem>
                {sorted.map(e => (
                    <SelectItem key={e.id} value={e.id} className="text-xs">
                        <span className="inline-flex items-center gap-2">
                            <span className={cn('h-2 w-2 rounded-full', swatchClassByColor[e.color] ?? 'bg-slate-400')} />
                            {e.shortLabel || e.title}
                        </span>
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

/**
 * v1.6 — Story-points picker. Fibonacci options (1/2/3/5/8) plus
 * "Unestimated" mapping to null. Used in the create dialog and the
 * detail sheet.
 */
function PointsPicker({
    value,
    onChange,
    triggerClassName,
}: {
    value: number | null | undefined;
    onChange: (next: number | null) => void;
    triggerClassName?: string;
}) {
    const effective = value == null ? '__none__' : String(value);
    return (
        <Select
            value={effective}
            onValueChange={(v) => onChange(v === '__none__' ? null : parseInt(v, 10))}
        >
            <SelectTrigger className={cn('h-9 text-sm', triggerClassName)}>
                <SelectValue placeholder="Estimate" />
            </SelectTrigger>
            <SelectContent className="z-[10000]">
                <SelectItem value="__none__" className="text-xs text-slate-400 italic">
                    Unestimated
                </SelectItem>
                {POINT_OPTIONS.map(p => (
                    <SelectItem key={p} value={String(p)} className="text-xs">
                        {p} {p === 1 ? 'point' : 'points'}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

function TypeIcon({ type }: { type?: FeatureType }) {
    switch (type) {
        case 'bug':
            return <Bug className="h-3.5 w-3.5 text-rose-500 shrink-0" />;
        case 'improvement':
            return <Wrench className="h-3.5 w-3.5 text-indigo-500 shrink-0" />;
        case 'feature':
        default:
            return <Sparkles className="h-3.5 w-3.5 text-blue-500 shrink-0" />;
    }
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

export function FeatureTrackingBoard() {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();
    const [createOpen, setCreateOpen] = useState(false);
    const [epicMgmtOpen, setEpicMgmtOpen] = useState(false);
    /** v1.6 — when true the board shows soft-deleted features only. */
    const [archiveMode, setArchiveMode] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [activeId, setActiveId] = useState<string | null>(null);
    // Per-column sort mode. Defaults to 'manual' (drag order). When a
    // non-manual mode is active the column disables drag to avoid the
    // jarring "card snaps back after drop" that happens when the sort
    // criterion overrides the manual `order` on re-render.
    const [sortModes, setSortModes] = useState<Record<FeatureStatus, SortMode>>({
        submitted: 'manual',
        'under-review': 'manual',
        planned: 'manual',
        'in-progress': 'manual',
        shipped: 'manual',
    });
    /**
     * Optimistic overrides keyed by feature id. When a drop writes to
     * Firestore we record the target { status, order } here so the UI
     * reflects the new position immediately, even before the Firestore
     * listener echoes the change back. An override is cleared once the
     * live snapshot matches (i.e. the server state caught up).
     */
    const [optimistic, setOptimistic] = useState<
        Record<string, { status: FeatureStatus; order: number }>
    >({});

    const featuresQuery = useMemoFirebase(
        () => collection(firestore, 'features'),
        [firestore],
    );
    const { data: features, isLoading } = useCollection<FeatureDoc>(featuresQuery);

    /** Apply any pending optimistic moves over the live snapshot. */
    const mergedFeatures = useMemo(() => {
        if (!features) return features;
        if (Object.keys(optimistic).length === 0) return features;
        return features.map(f => {
            const o = optimistic[f.id];
            return o ? { ...f, status: o.status, order: o.order } : f;
        });
    }, [features, optimistic]);

    // Drop optimistic entries once the server catches up.
    useMemo(() => {
        if (!features || Object.keys(optimistic).length === 0) return;
        const next = { ...optimistic };
        let changed = false;
        for (const f of features) {
            const o = optimistic[f.id];
            if (o && f.status === o.status && f.order === o.order) {
                delete next[f.id];
                changed = true;
            }
        }
        if (changed) setOptimistic(next);
    }, [features, optimistic]);

    const byStatus = useMemo(() => {
        const groups: Record<FeatureStatus, FeatureDoc[]> = {
            submitted: [],
            'under-review': [],
            planned: [],
            'in-progress': [],
            shipped: [],
        };
        for (const f of mergedFeatures || []) {
            // v1.6 archive mode: show ONLY soft-deleted; otherwise hide
            // soft-deleted from the live board.
            const isArchived = !!f.deletedAt;
            if (archiveMode ? !isArchived : isArchived) continue;
            const s = (f.status || 'submitted') as FeatureStatus;
            if (groups[s]) groups[s].push(f);
            else groups.submitted.push(f);
        }
        // Sort each column by order ASC (manual drag position).
        // `order` is written by drag-drop; fall back to createdAt DESC
        // for any doc that predates drag (no order field yet).
        for (const key of Object.keys(groups) as FeatureStatus[]) {
            groups[key].sort((a, b) => {
                if (a.order != null && b.order != null) return a.order - b.order;
                const at = a.createdAt?.toMillis?.() ?? 0;
                const bt = b.createdAt?.toMillis?.() ?? 0;
                return bt - at;
            });
        }
        return groups;
    }, [mergedFeatures, archiveMode]);

    const total = features?.length ?? 0;

    const sensors = useSensors(
        // distance:5 means a plain click on a card doesn't trigger drag —
        // only a 5px move does. Lets the whole card stay clickable for
        // the detail sheet (stage 5) while still being draggable.
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const featureById = useMemo(() => {
        const m = new Map<string, FeatureDoc>();
        for (const f of mergedFeatures || []) m.set(f.id, f);
        return m;
    }, [mergedFeatures]);

    const activeFeature = activeId ? featureById.get(activeId) : null;
    // Re-derive `selectedFeature` from the live map on every render so
    // edits made through the sheet reflect immediately.
    const selectedFeature = selectedId ? featureById.get(selectedId) ?? null : null;

    function onDragStart(e: DragStartEvent) {
        setActiveId(String(e.active.id));
    }

    async function onDragEnd(e: DragEndEvent) {
        setActiveId(null);
        const { active, over } = e;
        if (!over) return;
        const activeKey = String(active.id);
        const overKey = String(over.id);
        const moving = featureById.get(activeKey);
        if (!moving) return;

        // over.id is either a column key or a card id. Resolve target column.
        const isColumnDrop = (COLUMNS as ReadonlyArray<{ key: FeatureStatus }>).some(c => c.key === overKey);
        const targetStatus: FeatureStatus = isColumnDrop
            ? (overKey as FeatureStatus)
            : ((featureById.get(overKey)?.status as FeatureStatus) || 'submitted');

        // Target list (exclude the dragged card so indexes line up).
        const targetList = byStatus[targetStatus].filter(f => f.id !== activeKey);
        let targetIndex: number;
        if (isColumnDrop) {
            // Dropped on the column body itself → append to end.
            targetIndex = targetList.length;
        } else {
            const idx = targetList.findIndex(f => f.id === overKey);
            targetIndex = idx < 0 ? targetList.length : idx;
        }

        // No-op: same column AND same position.
        if (moving.status === targetStatus) {
            const currentIndex = byStatus[targetStatus]
                .filter(f => f.id !== activeKey)
                .findIndex(f => f.id === activeKey);
            if (currentIndex === targetIndex) return;
        }

        // Fractional-index reorder: midpoint between neighbours.
        const prev = targetList[targetIndex - 1];
        const next = targetList[targetIndex];
        let newOrder: number;
        if (prev && next) newOrder = ((prev.order ?? 0) + (next.order ?? 0)) / 2;
        else if (prev) newOrder = (prev.order ?? 0) + 10;
        else if (next) newOrder = (next.order ?? 0) - 10;
        else newOrder = 0;

        // Optimistic: show the move immediately.
        setOptimistic(prevMap => ({
            ...prevMap,
            [activeKey]: { status: targetStatus, order: newOrder },
        }));

        try {
            await updateDoc(doc(firestore, 'features', activeKey), {
                status: targetStatus,
                order: newOrder,
                updatedAt: serverTimestamp(),
            });
        } catch (err: any) {
            // Roll the optimistic entry back on failure.
            setOptimistic(prevMap => {
                const copy = { ...prevMap };
                delete copy[activeKey];
                return copy;
            });
            toast({
                variant: 'destructive',
                title: 'Move failed',
                description: err?.message ?? 'See console.',
            });
        }
    }

    return (
        <div className="flex flex-col h-full bg-slate-50/50">
            {/* Banner — colour shifts to slate when in archive mode so
                the user can see at a glance they're not on the live board. */}
            <div className={cn(
                'text-white px-6 py-4 shrink-0',
                archiveMode
                    ? 'bg-gradient-to-r from-slate-600 to-slate-700'
                    : 'bg-gradient-to-r from-blue-600 to-blue-700',
            )}>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-white/15 rounded-xl flex items-center justify-center border border-white/20">
                            {archiveMode ? <Trash2 className="h-5 w-5" /> : <Lightbulb className="h-5 w-5" />}
                        </div>
                        <div>
                            <h1 className="text-xl font-bold">
                                {archiveMode ? 'Archive' : 'Feature Tracking'}
                            </h1>
                            <p className="text-sm text-blue-50">
                                {isLoading
                                    ? 'Loading feature requests…'
                                    : archiveMode
                                        ? `${total} archived feature${total === 1 ? '' : 's'} — restore from the detail sheet.`
                                        : total === 0
                                            ? 'No requests yet — be the first.'
                                            : `${total} feature request${total === 1 ? '' : 's'} across the team.`}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            size="sm"
                            variant="ghost"
                            className="text-white/90 hover:bg-white/15 hover:text-white gap-1.5"
                            onClick={() => setArchiveMode(v => !v)}
                            title={archiveMode ? 'Back to live board' : 'View archived (soft-deleted) features'}
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                            {archiveMode ? 'Back to board' : 'Archive'}
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="text-white/90 hover:bg-white/15 hover:text-white gap-1.5"
                            onClick={() => setEpicMgmtOpen(true)}
                            title="Manage epics — top-level groupings for features"
                        >
                            <Layers className="h-3.5 w-3.5" />
                            Manage epics
                        </Button>
                        <Button
                            size="sm"
                            className="bg-white text-blue-700 hover:bg-blue-50 gap-2 shadow-sm"
                            onClick={() => setCreateOpen(true)}
                            disabled={archiveMode}
                        >
                            <Plus className="h-4 w-4" />
                            New Feature
                        </Button>
                    </div>
                </div>
            </div>

            {/* Board — outer div is NOT scrollable on lg+; each column
                scrolls internally so no single column can blow up the
                whole page. On narrow screens where columns stack (below
                lg) we fall back to page-level overflow-y-auto so the
                user can still reach every column. */}
            <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden">
                <div className="p-6 h-full flex flex-col">
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCorners}
                        onDragStart={onDragStart}
                        onDragEnd={onDragEnd}
                    >
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 lg:auto-rows-fr gap-4 flex-1 min-h-0">
                            {COLUMNS.map(col => (
                                <ColumnView
                                    key={col.key}
                                    column={col}
                                    features={byStatus[col.key]}
                                    currentUserId={user?.uid}
                                    onOpen={id => setSelectedId(id)}
                                    sortMode={sortModes[col.key]}
                                    onSortModeChange={(m) =>
                                        setSortModes(prev => ({ ...prev, [col.key]: m }))
                                    }
                                />
                            ))}
                        </div>
                        <DragOverlay>
                            {activeFeature ? (
                                <FeatureCard
                                    feature={activeFeature}
                                    currentUserId={user?.uid}
                                    isOverlay
                                />
                            ) : null}
                        </DragOverlay>
                    </DndContext>
                </div>
            </div>

            <CreateFeatureDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                defaultOrderForColumn={(byStatus.submitted[0]?.order ?? 0) - 10}
            />

            <FeatureDetailSheet
                feature={selectedFeature}
                open={selectedFeature !== null}
                onOpenChange={(v) => { if (!v) setSelectedId(null); }}
            />

            <EpicManagementDialog
                open={epicMgmtOpen}
                onOpenChange={setEpicMgmtOpen}
            />
        </div>
    );
}

// ---------------------------------------------------------------------------
// Column
// ---------------------------------------------------------------------------

function ColumnView({
    column,
    features,
    currentUserId,
    onOpen,
    sortMode,
    onSortModeChange,
}: {
    column: typeof COLUMNS[number];
    features: FeatureDoc[];
    currentUserId?: string;
    onOpen: (id: string) => void;
    sortMode: SortMode;
    onSortModeChange: (m: SortMode) => void;
}) {
    // Column body acts as a drop target so an empty column can still
    // receive cards (dropping anywhere inside appends to the end).
    const { setNodeRef, isOver } = useDroppable({ id: column.key });

    // `features` arrives sorted by `order` ASC. Re-sort here when the
    // display mode is votes/date. The dnd-kit onDragEnd math still
    // works against `order` — display sort doesn't write back.
    const displayFeatures = useMemo(() => {
        if (sortMode === 'manual') return features;
        const copy = [...features];
        if (sortMode === 'votes') {
            copy.sort((a, b) => (b.voteIds?.length ?? 0) - (a.voteIds?.length ?? 0));
        } else if (sortMode === 'date') {
            copy.sort((a, b) => {
                const bt = b.createdAt?.toMillis?.() ?? 0;
                const at = a.createdAt?.toMillis?.() ?? 0;
                return bt - at;
            });
        }
        return copy;
    }, [features, sortMode]);
    const itemIds = useMemo(() => displayFeatures.map(f => f.id), [displayFeatures]);
    const dragDisabled = sortMode !== 'manual';
    const activeSortMeta = SORT_MODES.find(s => s.key === sortMode) ?? SORT_MODES[0];
    const ActiveSortIcon = activeSortMeta.icon;

    return (
        <div className="flex flex-col min-h-0 lg:h-full">
            <div className={cn(
                'rounded-t-xl border-t-2 border-x border-b bg-white shrink-0',
                'flex items-center justify-between gap-2 px-3 py-2.5',
                column.accent,
            )}>
                <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-700">
                    {column.label}
                </h3>
                <div className="flex items-center gap-1.5">
                    <DropdownMenu>
                        <DropdownMenuTrigger
                            className="text-slate-400 hover:text-slate-700 rounded p-0.5"
                            title={`Sort: ${activeSortMeta.label}`}
                        >
                            <ActiveSortIcon className="h-3 w-3" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="z-[10000]">
                            {SORT_MODES.map(s => {
                                const Icon = s.icon;
                                return (
                                    <DropdownMenuItem
                                        key={s.key}
                                        onClick={() => onSortModeChange(s.key)}
                                        className={cn(
                                            'text-xs gap-2',
                                            sortMode === s.key && 'font-semibold bg-slate-100',
                                        )}
                                    >
                                        <Icon className="h-3 w-3" />
                                        {s.label}
                                    </DropdownMenuItem>
                                );
                            })}
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', column.badge)}>
                        {features.length}
                    </span>
                </div>
            </div>
            <div
                ref={setNodeRef}
                className={cn(
                    'feature-scroll flex-1 min-h-[200px] lg:min-h-0 space-y-2 border-x border-b rounded-b-xl bg-slate-50/70 p-2 overflow-y-auto transition-colors',
                    isOver && 'bg-blue-50/60 ring-2 ring-blue-300 ring-inset',
                )}
            >
                <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                    {displayFeatures.length === 0 ? (
                        <p className="text-[10px] text-slate-400 italic text-center py-4">
                            Drop here.
                        </p>
                    ) : (
                        displayFeatures.map(f => (
                            <FeatureCard
                                key={f.id}
                                feature={f}
                                currentUserId={currentUserId}
                                onOpen={onOpen}
                                dragDisabled={dragDisabled}
                            />
                        ))
                    )}
                </SortableContext>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function FeatureCard({
    feature,
    currentUserId,
    onOpen,
    isOverlay = false,
    dragDisabled = false,
}: {
    feature: FeatureDoc;
    currentUserId?: string;
    onOpen?: (id: string) => void;
    /** Rendered inside <DragOverlay>? If so skip useSortable wiring. */
    isOverlay?: boolean;
    /** Disable drag handle (used when the column sort is not 'manual'). */
    dragDisabled?: boolean;
}) {
    const firestore = useFirestore();
    const voteIds = feature.voteIds ?? [];
    const voteCount = voteIds.length;
    const userVoted = currentUserId ? voteIds.includes(currentUserId) : false;

    async function toggleVote(e: React.MouseEvent) {
        e.stopPropagation();
        if (!currentUserId) return;
        const ref = doc(firestore, 'features', feature.id);
        await updateDoc(ref, {
            voteIds: userVoted ? arrayRemove(currentUserId) : arrayUnion(currentUserId),
            updatedAt: serverTimestamp(),
        });
    }
    const priority = feature.priority ? PRIORITY_STYLES[feature.priority] : null;
    const tags = feature.tags ?? [];
    const visibleTags = tags.slice(0, 3);
    const hiddenTagCount = Math.max(0, tags.length - visibleTags.length);
    const commentCount = feature.commentCount ?? 0;

    // Hook is always called (rules-of-hooks) — values are unused for the
    // overlay clone, which just renders static visuals above everything.
    const sortable = useSortable({
        id: feature.id,
        disabled: isOverlay || dragDisabled,
    });
    const style: React.CSSProperties = isOverlay
        ? { cursor: 'grabbing' }
        : {
            transform: CSS.Transform.toString(sortable.transform),
            transition: sortable.transition,
            opacity: sortable.isDragging ? 0.3 : 1,
        };

    return (
        <div
            ref={isOverlay ? undefined : sortable.setNodeRef}
            style={style}
            {...(isOverlay ? {} : sortable.attributes)}
            {...(isOverlay ? {} : sortable.listeners)}
            role="button"
            tabIndex={0}
            onClick={() => { if (!isOverlay) onOpen?.(feature.id); }}
            onKeyDown={(e) => {
                if (isOverlay) return;
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpen?.(feature.id);
                }
            }}
            className={cn(
                'bg-white rounded-lg border border-slate-200 hover:border-blue-300 hover:shadow-sm transition-all p-3 space-y-2',
                isOverlay && 'shadow-xl ring-2 ring-blue-300',
                dragDisabled ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing',
            )}
            title={dragDisabled ? 'Click to open' : 'Click to open · drag to move'}
        >
            <div className="flex items-start gap-2">
                <TypeIcon type={feature.type} />
                <p className="text-xs font-semibold text-slate-800 leading-snug flex-1 min-w-0">
                    {feature.title || 'Untitled'}
                </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
                {priority && (
                    <Badge variant="outline" className={cn('text-[9px] font-bold border', priority.className)}>
                        {priority.label}
                    </Badge>
                )}
                {feature.targetRelease && (
                    <Badge variant="outline" className="text-[9px] font-bold text-indigo-700 border-indigo-200 bg-indigo-50">
                        {feature.targetRelease}
                    </Badge>
                )}
                {visibleTags.map(t => (
                    <span
                        key={t}
                        className="inline-flex items-center gap-1 text-[9px] font-medium text-slate-500 bg-slate-100 rounded px-1.5 py-0.5"
                    >
                        <TagIcon className="h-2.5 w-2.5" /> {t}
                    </span>
                ))}
                {hiddenTagCount > 0 && (
                    <span className="text-[9px] text-slate-400">+{hiddenTagCount}</span>
                )}
            </div>

            <div className="flex items-center justify-between pt-1.5 border-t">
                <button
                    type="button"
                    onClick={toggleVote}
                    onPointerDown={(e) => e.stopPropagation()}
                    className={cn(
                        'flex items-center gap-1 text-[10px] font-semibold transition-colors cursor-pointer',
                        userVoted
                            ? 'text-blue-600'
                            : 'text-slate-500 hover:text-blue-600',
                    )}
                    title={userVoted ? 'Remove your vote' : 'Vote for this feature'}
                    disabled={!currentUserId}
                >
                    <ThumbsUp className={cn('h-3 w-3', userVoted && 'fill-blue-600')} />
                    {voteCount}
                </button>
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    {commentCount > 0 && (
                        <span className="inline-flex items-center gap-1">
                            <MessageSquare className="h-2.5 w-2.5" />
                            {commentCount}
                        </span>
                    )}
                    {feature.submitterName && (
                        <span className="truncate max-w-[90px]" title={feature.submitterName}>
                            {feature.submitterName}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Create Feature Dialog
// ---------------------------------------------------------------------------

function CreateFeatureDialog({
    open,
    onOpenChange,
    defaultOrderForColumn,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    /** Order value that places this new feature at the top of Submitted. */
    defaultOrderForColumn: number;
}) {
    const firestore = useFirestore();
    const { user } = useUser();
    const userProfileRef = useMemoFirebase(
        () => (user ? doc(firestore, 'users', user.uid) : null),
        [firestore, user?.uid],
    );
    const { data: userProfile } = useDoc<any>(userProfileRef);
    const { toast } = useToast();

    // Generate a client-side doc ID so the image uploader can write to
    // `features/{featureId}/...` before the doc is saved. Regenerate
    // every time the dialog opens — without this, the same id is reused
    // across every submit in the session and each setDoc overwrites the
    // previously saved feature at that path. (v1.5.1 hotfix — clients
    // reported features disappearing after each save.)
    const [featureId, setFeatureId] = useState(() => doc(collection(firestore, 'features')).id);
    useEffect(() => {
        if (open) {
            setFeatureId(doc(collection(firestore, 'features')).id);
        }
    }, [open, firestore]);

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [type, setType] = useState<FeatureType>('feature');
    const [priority, setPriority] = useState<FeaturePriority>('medium');
    const [targetRelease, setTargetRelease] = useState('');
    const [epicId, setEpicId] = useState<string | null>(null);
    const [points, setPoints] = useState<number | null>(null);
    const [tags, setTags] = useState<string[]>([]);
    const [tagDraft, setTagDraft] = useState('');
    const [acceptance, setAcceptance] = useState<string[]>([]);
    const [acceptanceDraft, setAcceptanceDraft] = useState('');
    const [images, setImages] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);

    function reset() {
        setTitle('');
        setDescription('');
        setType('feature');
        setPriority('medium');
        setTargetRelease('');
        setEpicId(null);
        setPoints(null);
        setTags([]);
        setTagDraft('');
        setAcceptance([]);
        setAcceptanceDraft('');
        setImages([]);
    }

    function addTag() {
        const t = tagDraft.trim().toLowerCase();
        if (!t) return;
        if (tags.includes(t)) { setTagDraft(''); return; }
        setTags([...tags, t]);
        setTagDraft('');
    }
    function removeTag(t: string) {
        setTags(tags.filter(x => x !== t));
    }

    function addAcceptance() {
        const a = acceptanceDraft.trim();
        if (!a) return;
        setAcceptance([...acceptance, a]);
        setAcceptanceDraft('');
    }
    function removeAcceptance(i: number) {
        setAcceptance(acceptance.filter((_, idx) => idx !== i));
    }

    async function handleSubmit() {
        if (title.trim().length < 3) {
            toast({ variant: 'destructive', title: 'Title required', description: 'Min 3 characters.' });
            return;
        }
        if (!user) {
            toast({ variant: 'destructive', title: 'Not signed in' });
            return;
        }
        setSubmitting(true);
        try {
            await setDoc(doc(firestore, 'features', featureId), {
                title: title.trim(),
                description: description || '',
                type,
                status: 'submitted',
                priority,
                targetRelease: targetRelease.trim() || null,
                epicId,
                points,
                tags,
                voteIds: [],
                order: defaultOrderForColumn ?? 0,
                acceptanceCriteria: acceptance,
                imageUrls: images,
                commentCount: 0,
                deletedAt: null,
                deletedBy: null,
                submitterId: user.uid,
                submitterName: userProfile?.displayName || userProfile?.email || user.email || 'Someone',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            toast({ title: 'Feature submitted', description: `"${title.trim()}" posted to the board.` });
            reset();
            onOpenChange(false);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Failed to submit', description: e?.message ?? 'See console.' });
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!submitting) onOpenChange(v); }}>
            <DialogContent className="max-w-2xl p-0 overflow-hidden">
                <DialogHeader className="px-6 pt-6 pb-2">
                    <DialogTitle className="flex items-center gap-2">
                        <Lightbulb className="h-4 w-4 text-blue-600" />
                        New Feature Request
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                        Share the idea. Anyone on the team can vote and comment.
                    </DialogDescription>
                </DialogHeader>

                <div className="feature-scroll overflow-y-auto max-h-[calc(100vh-220px)]">
                    <div className="px-6 py-2 space-y-4">
                        {/* Title */}
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Title</Label>
                            <Input
                                autoFocus
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Short, specific summary"
                                className="h-9 text-sm"
                            />
                        </div>

                        {/* Type + Priority */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Type</Label>
                                <Select value={type} onValueChange={(v) => setType(v as FeatureType)}>
                                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                                    <SelectContent className="z-[10000]">
                                        <SelectItem value="feature" className="text-xs">✨ Feature</SelectItem>
                                        <SelectItem value="bug" className="text-xs">🐛 Bug</SelectItem>
                                        <SelectItem value="improvement" className="text-xs">🔧 Improvement</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Priority</Label>
                                <Select value={priority} onValueChange={(v) => setPriority(v as FeaturePriority)}>
                                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                                    <SelectContent className="z-[10000]">
                                        <SelectItem value="critical" className="text-xs">Critical</SelectItem>
                                        <SelectItem value="high" className="text-xs">High</SelectItem>
                                        <SelectItem value="medium" className="text-xs">Medium</SelectItem>
                                        <SelectItem value="low" className="text-xs">Low</SelectItem>
                                        <SelectItem value="nice-to-have" className="text-xs">Nice to have</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Epic + Story points (v1.6) */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Epic</Label>
                                <EpicPicker
                                    value={epicId}
                                    onChange={setEpicId}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    Story points <span className="text-slate-400 normal-case">(optional)</span>
                                </Label>
                                <PointsPicker
                                    value={points}
                                    onChange={setPoints}
                                />
                            </div>
                        </div>

                        {/* Description + Acceptance Criteria (same section) */}
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Description</Label>
                            <FeatureRichTextEditor
                                value={description}
                                onChange={setDescription}
                                placeholder="What is it? Why does it matter? Who benefits? Use headings + lists to structure it."
                            />
                            <div className="pt-1 space-y-1.5">
                                <p className="text-[11px] font-semibold text-slate-600">
                                    Acceptance criteria
                                    <span className="text-slate-400 font-normal"> — how will we know it's done?</span>
                                </p>
                                {acceptance.length > 0 && (
                                    <ul className="space-y-1">
                                        {acceptance.map((a, i) => (
                                            <li
                                                key={i}
                                                className="flex items-start gap-2 text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded-md px-2 py-1.5"
                                            >
                                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                                                <span className="flex-1">{a}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => removeAcceptance(i)}
                                                    className="text-slate-400 hover:text-red-500"
                                                >
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                <div className="flex items-center gap-1">
                                    <Input
                                        value={acceptanceDraft}
                                        onChange={(e) => setAcceptanceDraft(e.target.value)}
                                        placeholder="e.g. Trailer card shows brand + code on the quote PDF"
                                        className="h-8 text-xs"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') { e.preventDefault(); addAcceptance(); }
                                        }}
                                    />
                                    <Button size="sm" className="h-8" onClick={addAcceptance} disabled={!acceptanceDraft.trim()}>
                                        Add
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* Tags */}
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tags</Label>
                            {tags.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {tags.map(t => (
                                        <span
                                            key={t}
                                            className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 bg-slate-100 rounded-full pl-2.5 pr-1 py-0.5 border border-slate-200"
                                        >
                                            {t}
                                            <button
                                                type="button"
                                                onClick={() => removeTag(t)}
                                                className="text-slate-400 hover:text-red-500 rounded-full p-0.5"
                                            >
                                                <X className="h-2.5 w-2.5" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                            <div className="flex items-center gap-1">
                                <Input
                                    value={tagDraft}
                                    onChange={(e) => setTagDraft(e.target.value)}
                                    placeholder="Press Enter to add (e.g. trailers, pricing, mobile)"
                                    className="h-8 text-xs"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); }
                                    }}
                                />
                                <Button size="sm" className="h-8" onClick={addTag} disabled={!tagDraft.trim()}>
                                    Add
                                </Button>
                            </div>
                        </div>

                        {/* Target Release */}
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                Target Release <span className="text-slate-400 normal-case">(optional)</span>
                            </Label>
                            <ReleasePicker
                                value={targetRelease || null}
                                onChange={(v) => setTargetRelease(v ?? '')}
                            />
                        </div>

                        {/* Images */}
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                Images <span className="text-slate-400 normal-case">(optional)</span>
                            </Label>
                            <FeatureImageUploader
                                featureId={featureId}
                                value={images}
                                onChange={setImages}
                            />
                        </div>
                    </div>
                </div>

                <DialogFooter className="px-6 py-3 bg-slate-50 border-t">
                    <Button
                        variant="ghost"
                        onClick={() => { reset(); onOpenChange(false); }}
                        disabled={submitting}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={submitting || title.trim().length < 3}
                        className="gap-2"
                    >
                        {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                        Submit Feature
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ---------------------------------------------------------------------------
// Feature Detail Sheet
// ---------------------------------------------------------------------------

interface CommentDoc {
    id: string;
    body: string;
    authorId: string;
    authorName?: string;
    createdAt?: any;
}

export function FeatureDetailSheet({
    feature,
    open,
    onOpenChange,
}: {
    feature: FeatureDoc | null;
    open: boolean;
    onOpenChange: (v: boolean) => void;
}) {
    // Key the sheet body by feature id so local drafts reset when a
    // different feature is opened — without this, drafts leak across
    // features.
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="right"
                className="w-full sm:max-w-xl p-0 flex flex-col overflow-hidden"
            >
                {feature ? (
                    <FeatureDetailBody
                        key={feature.id}
                        feature={feature}
                        onClose={() => onOpenChange(false)}
                    />
                ) : null}
            </SheetContent>
        </Sheet>
    );
}

function FeatureDetailBody({
    feature,
    onClose,
}: {
    feature: FeatureDoc;
    onClose: () => void;
}) {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();
    const userProfileRef = useMemoFirebase(
        () => (user ? doc(firestore, 'users', user.uid) : null),
        [firestore, user?.uid],
    );
    const { data: userProfile } = useDoc<any>(userProfileRef);

    // Live comments subscription, ordered oldest → newest.
    const commentsRef = useMemoFirebase(
        () => query(
            collection(firestore, 'features', feature.id, 'comments'),
            orderBy('createdAt', 'asc'),
        ),
        [firestore, feature.id],
    );
    const { data: comments } = useCollection<CommentDoc>(commentsRef);

    // Title + description are edited via local draft + Save button to
    // avoid firing a Firestore write on every keystroke and racing with
    // the live snapshot. Everything else (selects, tags, acceptance,
    // images) saves immediately because those are atomic operations.
    const [titleDraft, setTitleDraft] = useState(feature.title ?? '');
    const [descDraft, setDescDraft] = useState(feature.description ?? '');
    const [editingDesc, setEditingDesc] = useState(false);
    const [savingText, setSavingText] = useState(false);

    const [tagDraft, setTagDraft] = useState('');
    const [acceptanceDraft, setAcceptanceDraft] = useState('');
    const [commentDraft, setCommentDraft] = useState('');
    const [postingComment, setPostingComment] = useState(false);

    const featureRef = doc(firestore, 'features', feature.id);
    const voteIds = feature.voteIds ?? [];
    const userVoted = user ? voteIds.includes(user.uid) : false;
    const tags = feature.tags ?? [];
    const acceptance = feature.acceptanceCriteria ?? [];
    const images = feature.imageUrls ?? [];
    const priority = feature.priority ?? 'medium';
    const type = feature.type ?? 'feature';
    const status = feature.status ?? 'submitted';

    const titleDirty = titleDraft.trim() !== (feature.title ?? '').trim();
    const descDirty = descDraft !== (feature.description ?? '');

    async function patch(data: Record<string, any>) {
        await updateDoc(featureRef, { ...data, updatedAt: serverTimestamp() });
    }

    async function saveText() {
        if (!titleDirty && !descDirty) return;
        if (titleDraft.trim().length < 3) {
            toast({ variant: 'destructive', title: 'Title required', description: 'Min 3 characters.' });
            return;
        }
        setSavingText(true);
        try {
            await patch({ title: titleDraft.trim(), description: descDraft });
            setEditingDesc(false);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: e?.message ?? 'See console.' });
        } finally {
            setSavingText(false);
        }
    }

    async function toggleVote() {
        if (!user) return;
        try {
            await patch({
                voteIds: userVoted ? arrayRemove(user.uid) : arrayUnion(user.uid),
            });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Vote failed', description: e?.message ?? 'See console.' });
        }
    }

    async function addTag() {
        const t = tagDraft.trim().toLowerCase();
        if (!t || tags.includes(t)) { setTagDraft(''); return; }
        await patch({ tags: [...tags, t] });
        setTagDraft('');
    }
    async function removeTag(t: string) {
        await patch({ tags: tags.filter(x => x !== t) });
    }

    async function addAcceptance() {
        const a = acceptanceDraft.trim();
        if (!a) return;
        await patch({ acceptanceCriteria: [...acceptance, a] });
        setAcceptanceDraft('');
    }
    async function removeAcceptance(i: number) {
        await patch({ acceptanceCriteria: acceptance.filter((_, idx) => idx !== i) });
    }

    async function setImages(next: string[]) {
        await patch({ imageUrls: next });
    }

    async function postComment() {
        const body = commentDraft.trim();
        if (!body || !user) return;
        setPostingComment(true);
        try {
            await addDoc(collection(firestore, 'features', feature.id, 'comments'), {
                body,
                authorId: user.uid,
                authorName: userProfile?.displayName || userProfile?.email || user.email || 'Someone',
                createdAt: serverTimestamp(),
            });
            // Keep commentCount in sync so the card badge is accurate
            // even without a live comments subscription.
            await updateDoc(featureRef, {
                commentCount: increment(1),
                updatedAt: serverTimestamp(),
            });
            setCommentDraft('');
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Comment failed', description: e?.message ?? 'See console.' });
        } finally {
            setPostingComment(false);
        }
    }

    async function removeComment(c: CommentDoc) {
        if (!confirm('Delete this comment?')) return;
        try {
            await deleteDoc(doc(firestore, 'features', feature.id, 'comments', c.id));
            await updateDoc(featureRef, {
                commentCount: increment(-1),
                updatedAt: serverTimestamp(),
            });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Delete failed', description: e?.message ?? 'See console.' });
        }
    }

    /**
     * v1.6 — soft delete. Sets deletedAt + deletedBy instead of
     * deleteDoc. The board / roadmap filter these out, but they
     * survive in the Archive view (board with archive toggle on)
     * for restore.
     */
    async function archiveFeature() {
        if (!confirm(`Archive "${feature.title}"? You can restore it from the Archive tab.`)) return;
        try {
            await updateDoc(featureRef, {
                deletedAt: serverTimestamp(),
                deletedBy: user?.uid ?? null,
                updatedAt: serverTimestamp(),
            });
            toast({ title: 'Feature archived', description: 'Find it in the Archive tab to restore.' });
            onClose();
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Archive failed', description: e?.message ?? 'See console.' });
        }
    }

    /** Restore a soft-deleted feature. Available only when archive view is open. */
    async function restoreFeature() {
        try {
            await updateDoc(featureRef, {
                deletedAt: null,
                deletedBy: null,
                updatedAt: serverTimestamp(),
            });
            toast({ title: 'Feature restored' });
            onClose();
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Restore failed', description: e?.message ?? 'See console.' });
        }
    }

    /** Permanent delete — only offered from the Archive view. Cannot be undone. */
    async function permanentDelete() {
        if (!confirm(`Permanently delete "${feature.title}"? This cannot be undone — comments, votes, and uploaded images are gone.`)) return;
        try {
            await deleteDoc(featureRef);
            toast({ title: 'Feature permanently deleted' });
            onClose();
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Delete failed', description: e?.message ?? 'See console.' });
        }
    }

    const isArchived = !!feature.deletedAt;
    const currentColumn = COLUMNS.find(c => c.key === status);

    return (
        <>
            <SheetHeader className="px-6 pt-6 pb-3 border-b shrink-0">
                <div className="flex items-start gap-2">
                    <TypeIcon type={type} />
                    <div className="flex-1 min-w-0 space-y-1">
                        <Input
                            value={titleDraft}
                            onChange={(e) => setTitleDraft(e.target.value)}
                            onBlur={saveText}
                            className="border-0 px-0 h-auto text-base font-bold focus-visible:ring-0 shadow-none"
                            placeholder="Feature title"
                        />
                        <SheetDescription className="text-[10px] text-slate-400 flex items-center gap-2 flex-wrap">
                            {currentColumn && (
                                <Badge variant="outline" className={cn('text-[9px] font-bold border', currentColumn.badge)}>
                                    {currentColumn.label}
                                </Badge>
                            )}
                            {feature.submitterName && (
                                <span>Submitted by {feature.submitterName}</span>
                            )}
                        </SheetDescription>
                    </div>
                    <SheetTitle className="sr-only">{feature.title}</SheetTitle>
                </div>
            </SheetHeader>

            <div className="feature-scroll flex-1 min-h-0 overflow-y-auto">
                <div className="px-6 py-4 space-y-6">
                    {/* Status / Type / Priority */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Status</Label>
                            <Select value={status} onValueChange={(v) => patch({ status: v })}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent className="z-[10000]">
                                    {COLUMNS.map(c => (
                                        <SelectItem key={c.key} value={c.key} className="text-xs">{c.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Type</Label>
                            <Select value={type} onValueChange={(v) => patch({ type: v })}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent className="z-[10000]">
                                    <SelectItem value="feature" className="text-xs">✨ Feature</SelectItem>
                                    <SelectItem value="bug" className="text-xs">🐛 Bug</SelectItem>
                                    <SelectItem value="improvement" className="text-xs">🔧 Improvement</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Priority</Label>
                            <Select value={priority} onValueChange={(v) => patch({ priority: v })}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent className="z-[10000]">
                                    <SelectItem value="critical" className="text-xs">Critical</SelectItem>
                                    <SelectItem value="high" className="text-xs">High</SelectItem>
                                    <SelectItem value="medium" className="text-xs">Medium</SelectItem>
                                    <SelectItem value="low" className="text-xs">Low</SelectItem>
                                    <SelectItem value="nice-to-have" className="text-xs">Nice to have</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Epic + Story points (v1.6) */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Epic</Label>
                            <EpicPicker
                                value={feature.epicId}
                                onChange={(next) => {
                                    if (next !== (feature.epicId ?? null)) {
                                        patch({ epicId: next });
                                    }
                                }}
                                triggerClassName="h-8 text-xs"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Story points</Label>
                            <PointsPicker
                                value={feature.points}
                                onChange={(next) => {
                                    if (next !== (feature.points ?? null)) {
                                        patch({ points: next });
                                    }
                                }}
                                triggerClassName="h-8 text-xs"
                            />
                        </div>
                    </div>

                    {/* Target Release */}
                    <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Target Release</Label>
                        <ReleasePicker
                            value={feature.targetRelease}
                            onChange={(next) => {
                                if (next !== (feature.targetRelease ?? null)) {
                                    patch({ targetRelease: next });
                                }
                            }}
                            triggerClassName="h-8 text-xs"
                        />
                    </div>

                    {/* Vote + count */}
                    <div className="flex items-center gap-3">
                        <Button
                            variant={userVoted ? 'default' : 'outline'}
                            size="sm"
                            onClick={toggleVote}
                            disabled={!user}
                            className="gap-2"
                        >
                            <ThumbsUp className={cn('h-3.5 w-3.5', userVoted && 'fill-white')} />
                            {userVoted ? 'Voted' : 'Vote'}
                        </Button>
                        <span className="text-xs text-slate-500">
                            {voteIds.length} vote{voteIds.length === 1 ? '' : 's'}
                        </span>
                    </div>

                    {/* Description + Acceptance Criteria (same section) */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Description</Label>
                            {!editingDesc ? (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 text-[10px] gap-1"
                                    onClick={() => setEditingDesc(true)}
                                >
                                    <Pencil className="h-3 w-3" />
                                    Edit
                                </Button>
                            ) : (
                                <div className="flex items-center gap-1">
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 text-[10px]"
                                        onClick={() => { setDescDraft(feature.description ?? ''); setEditingDesc(false); }}
                                        disabled={savingText}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        size="sm"
                                        className="h-6 text-[10px] gap-1"
                                        onClick={saveText}
                                        disabled={savingText || !descDirty}
                                    >
                                        {savingText ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                                        Save
                                    </Button>
                                </div>
                            )}
                        </div>
                        {editingDesc ? (
                            <FeatureRichTextEditor
                                value={descDraft}
                                onChange={setDescDraft}
                                minHeight="180px"
                            />
                        ) : (
                            <div className="rounded-md border bg-slate-50/40 px-3 py-2">
                                <FeatureDescriptionView html={feature.description ?? ''} />
                            </div>
                        )}

                        {/* Acceptance criteria — folded into the same section */}
                        <div className="pt-1 space-y-1.5">
                            <p className="text-[11px] font-semibold text-slate-600">
                                Acceptance criteria
                                <span className="text-slate-400 font-normal"> — how will we know it's done?</span>
                            </p>
                            {acceptance.length > 0 && (
                                <ul className="space-y-1">
                                    {acceptance.map((a, i) => (
                                        <li
                                            key={i}
                                            className="flex items-start gap-2 text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded-md px-2 py-1.5"
                                        >
                                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                                            <span className="flex-1">{a}</span>
                                            <button
                                                type="button"
                                                onClick={() => removeAcceptance(i)}
                                                className="text-slate-400 hover:text-red-500"
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <div className="flex items-center gap-1">
                                <Input
                                    value={acceptanceDraft}
                                    onChange={(e) => setAcceptanceDraft(e.target.value)}
                                    placeholder="Add a checkable criterion"
                                    className="h-8 text-xs"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') { e.preventDefault(); addAcceptance(); }
                                    }}
                                />
                                <Button size="sm" className="h-8" onClick={addAcceptance} disabled={!acceptanceDraft.trim()}>
                                    Add
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Tags */}
                    <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tags</Label>
                        {tags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {tags.map(t => (
                                    <span
                                        key={t}
                                        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 bg-slate-100 rounded-full pl-2.5 pr-1 py-0.5 border border-slate-200"
                                    >
                                        {t}
                                        <button
                                            type="button"
                                            onClick={() => removeTag(t)}
                                            className="text-slate-400 hover:text-red-500 rounded-full p-0.5"
                                        >
                                            <X className="h-2.5 w-2.5" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                        <div className="flex items-center gap-1">
                            <Input
                                value={tagDraft}
                                onChange={(e) => setTagDraft(e.target.value)}
                                placeholder="Press Enter to add"
                                className="h-8 text-xs"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); }
                                }}
                            />
                            <Button size="sm" className="h-8" onClick={addTag} disabled={!tagDraft.trim()}>
                                Add
                            </Button>
                        </div>
                    </div>

                    {/* Images */}
                    <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Images</Label>
                        <FeatureImageUploader
                            featureId={feature.id}
                            value={images}
                            onChange={setImages}
                        />
                    </div>

                    {/* Comments */}
                    <div className="space-y-2 pt-4 border-t">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                            <MessageSquare className="h-3 w-3" />
                            Comments ({comments?.length ?? 0})
                        </Label>
                        <div className="space-y-2">
                            {(comments ?? []).length === 0 ? (
                                <p className="text-[11px] text-slate-400 italic">No comments yet.</p>
                            ) : (
                                (comments ?? []).map(c => (
                                    <div
                                        key={c.id}
                                        className="rounded-md border bg-white px-3 py-2 space-y-1"
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-semibold text-slate-700">
                                                {c.authorName || 'Someone'}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-slate-400">
                                                    {c.createdAt?.toDate?.().toLocaleString?.() ?? ''}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => removeComment(c)}
                                                    className="text-slate-300 hover:text-red-500"
                                                    title="Delete comment"
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </button>
                                            </div>
                                        </div>
                                        <p className="text-xs text-slate-700 whitespace-pre-wrap">{c.body}</p>
                                    </div>
                                ))
                            )}
                        </div>
                        <div className="flex items-start gap-2 pt-1">
                            <textarea
                                value={commentDraft}
                                onChange={(e) => setCommentDraft(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                        e.preventDefault();
                                        postComment();
                                    }
                                }}
                                placeholder="Add a comment (Cmd+Enter to post)"
                                rows={2}
                                className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-blue-200"
                                disabled={!user || postingComment}
                            />
                            <Button
                                size="sm"
                                onClick={postComment}
                                disabled={!commentDraft.trim() || postingComment || !user}
                                className="gap-1 shrink-0"
                            >
                                {postingComment ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                                Post
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="px-6 py-3 border-t bg-slate-50 flex items-center justify-between shrink-0">
                {isArchived ? (
                    <div className="flex items-center gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={restoreFeature}
                            className="gap-2"
                        >
                            Restore
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={permanentDelete}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-2"
                        >
                            <Trash2 className="h-3 w-3" />
                            Permanent delete
                        </Button>
                    </div>
                ) : (
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={archiveFeature}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-2"
                    >
                        <Trash2 className="h-3 w-3" />
                        Archive
                    </Button>
                )}
                <div className="flex items-center gap-2">
                    {titleDirty && (
                        <span className="text-[10px] text-amber-600">Title has unsaved changes</span>
                    )}
                    <Button size="sm" variant="outline" onClick={onClose}>
                        Close
                    </Button>
                </div>
            </div>
        </>
    );
}

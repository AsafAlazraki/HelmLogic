'use client';

/**
 * Backlog view (v1.6).
 *
 * Long-form list of every active feature, grouped by epic, collapsible.
 * Use this when the Kanban Board is too busy and the Roadmap is too
 * abstract — the Backlog is the at-a-glance "what's in our pipeline,
 * organised by epic" view.
 *
 * Each epic group:
 *   - Color-banded header (matches swim-lane colours on the Roadmap)
 *   - Counts: items + total points
 *   - Click header to expand/collapse
 *   - Inside: compact feature rows (title, priority, release, points)
 *
 * Click a feature row → opens the existing FeatureDetailSheet.
 * "+ New Epic" button lives in the banner.
 */

import { useMemo, useState } from 'react';
import { collection } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import {
    Bug,
    CheckCircle2,
    ChevronRight,
    HelpCircle,
    Layers,
    Loader2,
    Lock,
    Plus,
    Sparkles,
    Wand2,
    Wrench,
    FileText,
    Scale,
    ClipboardCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { RestructureWorkbench } from '@/components/restructure-workbench';
import {
    applyRestructurePlan,
    computeRestructurePlan,
    type RestructurePlan,
} from '@/lib/v110-restructure-apply';
import {
    applyServiceQuotingSeed,
    computeServiceQuotingSeed,
    seedPointsByRelease,
    type ServiceQuotingSeedPlan,
} from '@/lib/v110-service-quoting-seed';
import { capacityTint, CATEGORY_EPIC_KEYWORDS, type Category } from '@/lib/v110-restructure-rules';
import { cn } from '@/lib/utils';
import { isReleaseShipped } from '@/lib/release-schedule';
import {
    CreateFeatureDialog,
    FeatureDetailSheet,
    type EpicColor,
    type EpicDoc,
    type FeatureDoc,
} from '@/components/feature-tracking-board';
import { CreateEpicDialog } from '@/components/create-epic-dialog';

const EPIC_BAND: Record<EpicColor, string> = {
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
    blue:    'bg-blue-50/40',
    amber:   'bg-amber-50/40',
    violet:  'bg-violet-50/40',
    emerald: 'bg-emerald-50/40',
    rose:    'bg-rose-50/40',
    indigo:  'bg-indigo-50/40',
    slate:   'bg-slate-50/60',
    cyan:    'bg-cyan-50/40',
};

const PRIORITY_CHIP: Record<string, string> = {
    critical:       'bg-red-100 text-red-700 border-red-200',
    high:           'bg-orange-100 text-orange-700 border-orange-200',
    medium:         'bg-amber-100 text-amber-700 border-amber-200',
    low:            'bg-slate-100 text-slate-600 border-slate-200',
    'nice-to-have': 'bg-slate-50 text-slate-500 border-slate-100',
};

const UNFILED = '__unfiled__';

export function BacklogView() {
    const firestore = useFirestore();

    const featuresRef = useMemoFirebase(() => collection(firestore, 'features'), [firestore]);
    const epicsRef = useMemoFirebase(() => collection(firestore, 'epics'), [firestore]);
    const { data: features } = useCollection<FeatureDoc>(featuresRef);
    const { data: epics } = useCollection<EpicDoc>(epicsRef);

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [createEpicOpen, setCreateEpicOpen] = useState(false);
    /** v1.6 — open Create Feature with this epic pre-filled. null = closed. */
    const [addStoryEpicId, setAddStoryEpicId] = useState<string | null>(null);

    /** v1.10 restructure — one-shot Workbench sheet open state. Button +
     *  sheet + module removed in the follow-up commit after the user
     *  clicks Apply, per CONVENTIONS.md one-shot lifecycle. */
    const [workbenchOpen, setWorkbenchOpen] = useState(false);

    /** v1.10 restructure — auto-apply confirm dialog + run state. The
     *  non-interactive "just do it" path: rules run across every story,
     *  the dialog previews the full destination plan, one confirm moves
     *  everything. Computed lazily from the loaded `features` when the
     *  dialog opens. */
    const { toast } = useToast();
    const [autoApplyOpen, setAutoApplyOpen] = useState(false);
    const [autoApplying, setAutoApplying] = useState(false);

    /** Resolve a restructure category → epic id by matching the loaded
     *  epics' titles against the category's keyword list. First confident
     *  match wins; returns null when no epic matches (story stays unfiled). */
    const resolveEpicForCategory = useMemo(() => {
        const all = epics ?? [];
        return (category: Category): string | null => {
            const keywords = CATEGORY_EPIC_KEYWORDS[category] ?? [];
            for (const kw of keywords) {
                const hit = all.find(e => (e.title ?? '').toLowerCase().includes(kw));
                if (hit) return hit.id;
            }
            return null;
        };
    }, [epics]);

    /** Epic 11 — Service Quoting seed plan (NSM-Hub absorption). Folded
     *  into the SAME Auto-Apply button so the restructure + the new
     *  Service Quoting backlog land in one click. Computed FIRST so its
     *  fixed-target points can pre-load the restructure's capacity tracker. */
    const serviceQuotingSeed = useMemo<ServiceQuotingSeedPlan | null>(
        () => (features && epics ? computeServiceQuotingSeed(features, epics) : null),
        [features, epics],
    );

    /** Pre-load map for the unified capacity tracker: Epic 11 seed points
     *  per release. Lets the band-packers account for these fixed-target
     *  stories when checking capacity (so v1.10 doesn't go red from
     *  both restructure + seed targeting it independently). */
    const seedPreload = useMemo<Record<string, number>>(() => {
        if (!serviceQuotingSeed) return {};
        const out: Record<string, number> = {};
        for (const [rel, info] of Object.entries(seedPointsByRelease(serviceQuotingSeed))) {
            out[rel] = info.points;
        }
        return out;
    }, [serviceQuotingSeed]);

    const restructurePlan = useMemo<RestructurePlan | null>(
        () => (features ? computeRestructurePlan(features, resolveEpicForCategory, seedPreload) : null),
        [features, resolveEpicForCategory, seedPreload],
    );

    /** Capacity preview combining the restructure's post-move buckets
     *  with the new Service Quoting stories' points, so the dialog shows
     *  the TRUE capacity after BOTH operations. */
    const combinedCapacity = useMemo(() => {
        if (!restructurePlan) return [];
        const merged: Record<string, { release: string; count: number; points: number }> = {};
        for (const b of restructurePlan.afterByRelease) {
            merged[b.release] = { release: b.release, count: b.count, points: b.points };
        }
        if (serviceQuotingSeed) {
            for (const [rel, add] of Object.entries(seedPointsByRelease(serviceQuotingSeed))) {
                (merged[rel] ??= { release: rel, count: 0, points: 0 });
                merged[rel].count += add.count;
                merged[rel].points += add.points;
            }
        }
        return Object.values(merged).sort((a, b) => a.release.localeCompare(b.release, undefined, { numeric: true }));
    }, [restructurePlan, serviceQuotingSeed]);

    async function handleAutoApply() {
        if (!restructurePlan) return;
        setAutoApplying(true);
        try {
            // 1. The restructure (move existing stories).
            const { ok, failed } = await applyRestructurePlan(firestore, restructurePlan);
            // 2. Seed Epic 11 — Service Quoting (NSM-Hub absorption) in the
            //    same click. Idempotent — skips anything already present.
            let seedMsg = '';
            if (serviceQuotingSeed && (serviceQuotingSeed.epicToCreate || serviceQuotingSeed.toCreate.length > 0)) {
                const sr = await applyServiceQuotingSeed(firestore, serviceQuotingSeed);
                seedMsg = ` · Epic 11${sr.epicCreated ? ' created' : ''} + ${sr.storiesCreated} service-quoting stories`;
            }
            toast({
                title: failed === 0 ? 'Restructure + Service Quoting seeded' : `Applied with ${failed} failures`,
                description:
                    `${ok} stories updated · ${restructurePlan.newlyScheduled} scheduled from Submitted · ` +
                    `${restructurePlan.epicAssignments} filed into epics · ${restructurePlan.statusBumps} bumped to planned` +
                    `${seedMsg}${failed ? ` · ${failed} failed` : ''}`,
                variant: failed === 0 ? 'default' : 'destructive',
            });
            setAutoApplyOpen(false);
        } catch (e: any) {
            console.error('[v110 auto-apply]', e);
            toast({ variant: 'destructive', title: 'Auto-apply failed', description: e?.message ?? 'See console.' });
        } finally {
            setAutoApplying(false);
        }
    }

    /** Default: all groups collapsed except those with active features. */
    const [collapsedEpics, setCollapsedEpics] = useState<Set<string>>(new Set());

    const sortedEpics = useMemo(
        () => [...(epics ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
        [epics],
    );

    /** Visible features: not soft-deleted. */
    const visibleFeatures = useMemo(
        () => (features ?? []).filter(f => !f.deletedAt),
        [features],
    );

    /** byEpic[epicId or UNFILED] → features sorted by status then title. */
    const byEpic = useMemo(() => {
        const groups: Record<string, FeatureDoc[]> = { [UNFILED]: [] };
        for (const e of sortedEpics) groups[e.id] = [];
        for (const f of visibleFeatures) {
            const key = f.epicId && groups[f.epicId] ? f.epicId : UNFILED;
            groups[key].push(f);
        }
        // Sort: priority first (Critical → High → Medium → Low →
        // Nice-to-have), then status (in-progress → planned → under-
        // review → submitted → shipped), then title alphabetically
        // (stable for the numbered seed: 1.1.1 → 1.1.2 → ...).
        const priorityOrder: Record<string, number> = {
            critical: 0, high: 1, medium: 2, low: 3, 'nice-to-have': 4,
        };
        const statusOrder: Record<string, number> = {
            'in-progress': 0, 'planned': 1, 'under-review': 2, 'submitted': 3, 'shipped': 4,
        };
        for (const key of Object.keys(groups)) {
            groups[key].sort((a, b) => {
                const pa = priorityOrder[a.priority ?? 'medium'] ?? 99;
                const pb = priorityOrder[b.priority ?? 'medium'] ?? 99;
                if (pa !== pb) return pa - pb;
                const sa = statusOrder[a.status ?? 'submitted'] ?? 99;
                const sb = statusOrder[b.status ?? 'submitted'] ?? 99;
                if (sa !== sb) return sa - sb;
                return (a.title || '').localeCompare(b.title || '');
            });
        }
        return groups;
    }, [sortedEpics, visibleFeatures]);

    const featureById = useMemo(() => {
        const m = new Map<string, FeatureDoc>();
        for (const f of features ?? []) m.set(f.id, f);
        return m;
    }, [features]);
    const selectedFeature = selectedId ? (featureById.get(selectedId) ?? null) : null;

    const totalFeatures = visibleFeatures.length;
    const totalPoints = visibleFeatures.reduce((sum, f) => sum + (f.points ?? 0), 0);
    const unfiledCount = byEpic[UNFILED].length;

    function toggleEpic(id: string) {
        setCollapsedEpics(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function expandAll() {
        setCollapsedEpics(new Set());
    }

    function collapseAll() {
        const all = new Set<string>(sortedEpics.map(e => e.id));
        all.add(UNFILED);
        setCollapsedEpics(all);
    }

    return (
        <div className="flex flex-col h-full bg-slate-50/50">
            {/* Banner */}
            <div className="bg-gradient-to-r from-slate-700 to-slate-900 text-white px-6 py-4 shrink-0">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-white/15 rounded-xl flex items-center justify-center border border-white/20">
                            <Layers className="h-5 w-5" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold">Backlog</h1>
                            <p className="text-sm text-slate-300">
                                {totalFeatures} feature{totalFeatures === 1 ? '' : 's'} across {sortedEpics.length} epic{sortedEpics.length === 1 ? '' : 's'} · {totalPoints} pts total
                                {unfiledCount > 0 && ` · ${unfiledCount} unfiled`}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <Button
                            size="sm"
                            variant="ghost"
                            className="text-white/90 hover:bg-white/15 hover:text-white text-xs"
                            onClick={expandAll}
                        >
                            Expand all
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="text-white/90 hover:bg-white/15 hover:text-white text-xs"
                            onClick={collapseAll}
                        >
                            Collapse all
                        </Button>
                        {/* v1.10 restructure — auto-apply ("just do it").
                            Primary path: rules run across every story, the
                            dialog previews the full destination plan, one
                            confirm moves everything. The Workbench button
                            beside it is the manual spot-check alternative.
                            Both one-shot, removed in the cleanup commit. */}
                        <Button
                            size="sm"
                            className="bg-emerald-500 text-white hover:bg-emerald-400 gap-1.5 shadow-sm"
                            onClick={() => setAutoApplyOpen(true)}
                            disabled={!restructurePlan || (restructurePlan.moveCount === 0 && (serviceQuotingSeed?.toCreate.length ?? 0) === 0)}
                            title="Reshuffle the roadmap + seed the NSM-Hub Service Quoting epic, in one click"
                        >
                            <Wand2 className="h-4 w-4" />
                            Auto-Apply v1.10
                            {restructurePlan && (restructurePlan.moveCount > 0 || (serviceQuotingSeed?.toCreate.length ?? 0) > 0) && (
                                <span className="ml-0.5 rounded bg-emerald-700/40 px-1.5 text-[10px] font-black tabular-nums">
                                    {restructurePlan.moveCount + (serviceQuotingSeed?.toCreate.length ?? 0)}
                                </span>
                            )}
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 shadow-sm"
                            onClick={() => setWorkbenchOpen(true)}
                            title="Manual spot-check / per-row override before saving"
                        >
                            <Wrench className="h-4 w-4" />
                            Workbench
                        </Button>
                        <Button
                            size="sm"
                            className="bg-white text-slate-800 hover:bg-slate-100 gap-1.5 shadow-sm"
                            onClick={() => setCreateEpicOpen(true)}
                        >
                            <Plus className="h-4 w-4" />
                            New Epic
                        </Button>
                    </div>
                </div>
            </div>

            {/* Body */}
            <div className="feature-scroll flex-1 min-h-0 overflow-y-auto">
                <div className="space-y-2 p-2">
                    {sortedEpics.length === 0 && unfiledCount === 0 ? (
                        <div className="rounded-xl border bg-white p-8 text-center space-y-2">
                            <p className="text-sm font-semibold text-slate-700">Empty backlog</p>
                            <p className="text-xs text-slate-500">
                                Click <strong>+ New Epic</strong> to start grouping work, or use <strong>+ New Feature</strong> on the Board to add an unfiled story.
                            </p>
                        </div>
                    ) : (
                        <>
                            {sortedEpics.map(e => (
                                <EpicGroup
                                    key={e.id}
                                    epic={e}
                                    features={byEpic[e.id] ?? []}
                                    collapsed={collapsedEpics.has(e.id)}
                                    onToggle={() => toggleEpic(e.id)}
                                    onOpen={(id) => setSelectedId(id)}
                                    onAddStory={(epicId) => setAddStoryEpicId(epicId)}
                                />
                            ))}
                            {unfiledCount > 0 && (
                                <UnfiledGroup
                                    features={byEpic[UNFILED]}
                                    collapsed={collapsedEpics.has(UNFILED)}
                                    onToggle={() => toggleEpic(UNFILED)}
                                    onOpen={(id) => setSelectedId(id)}
                                />
                            )}
                        </>
                    )}
                </div>
            </div>

            <FeatureDetailSheet
                feature={selectedFeature}
                open={selectedFeature !== null}
                onOpenChange={(v) => { if (!v) setSelectedId(null); }}
            />

            <CreateEpicDialog
                open={createEpicOpen}
                onOpenChange={setCreateEpicOpen}
                nextOrder={
                    sortedEpics.length === 0
                        ? 100
                        : (sortedEpics[sortedEpics.length - 1].order ?? 0) + 100
                }
            />

            {/* "+ Add story under <epic>" — opens Create Feature with the
                epic pre-filled. defaultOrderForColumn places it at top
                of the Submitted column on the Board. */}
            <CreateFeatureDialog
                open={addStoryEpicId !== null}
                onOpenChange={(v) => { if (!v) setAddStoryEpicId(null); }}
                defaultOrderForColumn={0}
                initialEpicId={addStoryEpicId}
            />

            {/* v1.10 restructure — Workbench Sheet. One-shot. Removed in
                follow-up commit after Apply per CONVENTIONS.md. */}
            <RestructureWorkbench open={workbenchOpen} onOpenChange={setWorkbenchOpen} />

            {/* v1.10 restructure — Auto-Apply confirm dialog. Shows the
                full destination plan (every release's post-move count +
                points, colour-coded by capacity) so the user sees the
                impact before one confirm moves everything. One-shot. */}
            <AlertDialog open={autoApplyOpen} onOpenChange={(v) => { if (!autoApplying) setAutoApplyOpen(v); }}>
                <AlertDialogContent className="max-w-2xl">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <Wand2 className="h-4 w-4 text-emerald-600" />
                            Auto-apply restructure + seed Service Quoting?
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-3 text-sm">
                                {restructurePlan && (
                                    <>
                                        <p>
                                            <strong>1. Restructure</strong> — update{' '}
                                            <strong>{restructurePlan.moveCount}</strong> of{' '}
                                            <strong>{restructurePlan.scoped}</strong> in-scope stories
                                            ({restructurePlan.newlyScheduled} pulled from the Submitted column,{' '}
                                            {restructurePlan.epicAssignments} filed into their epic swim-lane,{' '}
                                            {restructurePlan.statusBumps} bumped to <em>planned</em>). Capacity-aware
                                            bin-packing across sequential v1.X releases (≤20 pts each): dealer-ops first
                                            from v1.10, customer-facing from v1.18, notifications last. No release goes
                                            over cap; nothing left unscheduled.
                                        </p>

                                        {serviceQuotingSeed && (serviceQuotingSeed.toCreate.length > 0 || serviceQuotingSeed.epicToCreate) && (
                                            <p>
                                                <strong>2. NSM-Hub Service Quoting</strong> — {serviceQuotingSeed.epicToCreate ? 'create Epic 11 + ' : ''}
                                                seed <strong>{serviceQuotingSeed.toCreate.length}</strong> new stories
                                                ({serviceQuotingSeed.pointsToCreate} pts) across v1.10–v1.13.
                                                {serviceQuotingSeed.alreadyPresent > 0 && ` (${serviceQuotingSeed.alreadyPresent} already present, skipped.)`}
                                            </p>
                                        )}

                                        {/* Capacity preview — combined: restructure moves + new Service Quoting stories */}
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                                                Capacity after BOTH (restructure + service-quoting)
                                            </p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {combinedCapacity.map(b => {
                                                    const tint = capacityTint(b.points);
                                                    const cls = tint === 'red'
                                                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                                                        : tint === 'amber'
                                                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                            : 'bg-emerald-50 text-emerald-700 border-emerald-200';
                                                    return (
                                                        <div key={b.release} className={cn('rounded-lg border px-2 py-1 min-w-[72px]', cls)}>
                                                            <p className="text-[10px] font-black uppercase tracking-widest">{b.release}</p>
                                                            <p className="text-xs font-black tabular-nums">{b.points} pts</p>
                                                            <p className="text-[9px] opacity-70">{b.count} stories</p>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <p className="text-xs text-slate-500">
                                            Idempotent — safe to re-run (existing stories skipped). Want to override
                                            individual moves first? Cancel and use the <strong>Workbench</strong>.
                                            Nothing on a shipped release is touched.
                                        </p>
                                    </>
                                )}
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={autoApplying}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => { e.preventDefault(); handleAutoApply(); }}
                            disabled={autoApplying || !restructurePlan || (restructurePlan.moveCount === 0 && (serviceQuotingSeed?.toCreate.length ?? 0) === 0)}
                            className="gap-1.5 bg-emerald-600 hover:bg-emerald-500"
                        >
                            {autoApplying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                            {autoApplying
                                ? 'Applying…'
                                : `Move ${restructurePlan?.moveCount ?? 0} + seed ${serviceQuotingSeed?.toCreate.length ?? 0}`}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

        </div>
    );
}

function EpicGroup({
    epic,
    features,
    collapsed,
    onToggle,
    onOpen,
    onAddStory,
}: {
    epic: EpicDoc;
    features: FeatureDoc[];
    collapsed: boolean;
    onToggle: () => void;
    onOpen: (id: string) => void;
    onAddStory: (epicId: string) => void;
}) {
    const total = features.reduce((sum, f) => sum + (f.points ?? 0), 0);
    const acceptedCount = features.filter(f => !!f.acceptedAt).length;
    return (
        <div className={cn('rounded-xl border bg-white overflow-hidden', EPIC_TINT[epic.color] ?? '')}>
            <div className="flex items-stretch">
                <div className={cn('w-1.5 shrink-0', EPIC_BAND[epic.color] ?? 'bg-slate-400')} />
                <button
                    type="button"
                    onClick={onToggle}
                    className="flex-1 px-4 py-3 flex items-center gap-3 min-w-0 hover:bg-white/60 transition-colors"
                >
                    <ChevronRight className={cn(
                        'h-4 w-4 text-slate-400 transition-transform shrink-0',
                        !collapsed && 'rotate-90',
                    )} />
                    <div className="flex-1 min-w-0 text-left">
                        <h3 className="text-sm font-bold text-slate-800 truncate">{epic.title}</h3>
                        {epic.description && (
                            <p className="text-[11px] text-slate-500 truncate" title={epic.description}>
                                {epic.description}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 shrink-0">
                        <span className={cn(
                            'inline-flex items-center gap-1 font-bold rounded px-1.5 py-0.5',
                            acceptedCount === features.length && features.length > 0
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-700',
                        )}>
                            <CheckCircle2 className="h-3 w-3" />
                            {acceptedCount} / {features.length}
                        </span>
                        <span className="text-slate-300">·</span>
                        <span className="font-bold text-slate-700">{total}</span>
                        <span className="text-slate-400">pts</span>
                    </div>
                </button>
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onAddStory(epic.id); }}
                    className="px-3 hover:bg-blue-50 text-slate-400 hover:text-blue-700 border-l flex items-center justify-center transition-colors"
                    title={`Add story under ${epic.shortLabel || epic.title}`}
                    aria-label={`Add story under ${epic.shortLabel || epic.title}`}
                >
                    <Plus className="h-4 w-4" />
                </button>
            </div>
            {!collapsed && (
                <div className="border-t bg-white/60">
                    {features.map(f => (
                        <FeatureRow key={f.id} feature={f} onOpen={onOpen} />
                    ))}
                    {features.length === 0 && (
                        <p className="px-4 py-3 text-[11px] text-slate-400 italic">No features under this epic yet.</p>
                    )}
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onAddStory(epic.id); }}
                        className="w-full px-4 py-2 border-t border-dashed text-left text-[11px] font-semibold text-slate-500 hover:text-blue-700 hover:bg-blue-50/40 transition-colors flex items-center gap-1.5"
                    >
                        <Plus className="h-3 w-3" />
                        Add story under {epic.shortLabel || epic.title}
                    </button>
                </div>
            )}
        </div>
    );
}

function UnfiledGroup({
    features,
    collapsed,
    onToggle,
    onOpen,
}: {
    features: FeatureDoc[];
    collapsed: boolean;
    onToggle: () => void;
    onOpen: (id: string) => void;
}) {
    return (
        <div className="rounded-xl border border-dashed bg-white overflow-hidden">
            <button
                type="button"
                onClick={onToggle}
                className="w-full flex items-stretch hover:bg-slate-50 transition-colors"
            >
                <div className="w-1.5 shrink-0 bg-slate-300" />
                <div className="flex-1 px-4 py-3 flex items-center gap-3">
                    <ChevronRight className={cn(
                        'h-4 w-4 text-slate-400 transition-transform shrink-0',
                        !collapsed && 'rotate-90',
                    )} />
                    <div className="flex-1 text-left">
                        <h3 className="text-sm font-bold text-slate-700 italic">Unfiled</h3>
                        <p className="text-[11px] text-slate-500">Features without an epic — assign one from the detail sheet.</p>
                    </div>
                    <span className="text-[11px] font-bold text-slate-700">{features.length}</span>
                </div>
            </button>
            {!collapsed && features.length > 0 && (
                <div className="border-t bg-slate-50/40">
                    {features.map(f => (
                        <FeatureRow key={f.id} feature={f} onOpen={onOpen} />
                    ))}
                </div>
            )}
        </div>
    );
}

function FeatureRow({
    feature,
    onOpen,
}: {
    feature: FeatureDoc;
    onOpen: (id: string) => void;
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
    const priorityClass = PRIORITY_CHIP[feature.priority ?? 'medium'] ?? PRIORITY_CHIP.medium;

    return (
        <button
            type="button"
            onClick={() => onOpen(feature.id)}
            className="w-full flex items-center gap-3 px-4 py-2 border-b last:border-b-0 hover:bg-blue-50/40 transition-colors text-left"
        >
            <Icon className={cn('h-3.5 w-3.5 shrink-0', iconClass)} />
            <span className="flex-1 min-w-0 text-xs font-medium text-slate-800 truncate">
                {feature.title || 'Untitled'}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
                {feature.acceptedAt && (
                    <span
                        className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1 py-0.5"
                        title={`Accepted by ${feature.acceptedByName ?? 'Unknown'}${feature.acceptedAt?.toDate?.() ? ' on ' + feature.acceptedAt.toDate().toLocaleDateString() : ''}`}
                    >
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        Accepted
                    </span>
                )}
                {feature.priority && (
                    <Badge variant="outline" className={cn('text-[9px] font-bold border', priorityClass)}>
                        {feature.priority}
                    </Badge>
                )}
                {feature.targetRelease && (
                    <Badge
                        variant="outline"
                        className={cn(
                            'text-[9px] font-bold border inline-flex items-center gap-0.5',
                            isReleaseShipped(feature.targetRelease)
                                ? 'text-emerald-800 border-emerald-300 bg-emerald-50'
                                : 'text-indigo-700 border-indigo-200 bg-indigo-50',
                        )}
                        title={isReleaseShipped(feature.targetRelease) ? `${feature.targetRelease} shipped — read-only` : undefined}
                    >
                        {isReleaseShipped(feature.targetRelease) && <Lock className="h-2 w-2" />}
                        {feature.targetRelease}
                    </Badge>
                )}
                {isUnestimated ? (
                    <HelpCircle className="h-3.5 w-3.5 text-amber-500" aria-label="Unestimated" />
                ) : (
                    <span className="text-[10px] font-bold text-slate-700 bg-slate-100 rounded px-1.5 py-0.5">
                        {feature.points} pts
                    </span>
                )}
            </div>
        </button>
    );
}

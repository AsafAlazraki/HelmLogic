'use client';

/**
 * Restructure Workbench (v1.10 cycle, one-shot).
 *
 * Single-surface tool for the dealer-ops priority pivot. Opens from
 * Backlog header → loads every non-shipped, non-deleted feature →
 * proposes a move per story using the rules in
 * `v110-restructure-rules.ts` → operator overrides per-row → click
 * Apply to commit all moves in one batch.
 *
 * Replaces what would otherwise have been a 10-screenshot column-by-
 * column tour through /feature-tracking. Operator + agent see the same
 * structured data inside the same surface.
 *
 * One-shot lifecycle (per CONVENTIONS.md):
 *   1. This file + its Backlog button ship together
 *   2. User opens the Workbench, walks rows, clicks Apply
 *   3. Follow-up commit removes the file + button after the user
 *      confirms the restructure landed correctly
 */

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useToast } from '@/hooks/use-toast';
import type { FeatureDoc } from '@/components/feature-tracking-board';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, Filter, Loader2, RefreshCw, Wrench, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    capacityTint,
    CATEGORY_LABEL,
    CATEGORY_TINT,
    inferCategory,
    isShippedRelease,
    POINTS_CAP_GREEN,
    POINTS_CAP_RED,
    suggestTargetRelease,
    TARGETABLE_RELEASES,
    type Category,
} from '@/lib/v110-restructure-rules';

interface Props {
    open: boolean;
    onOpenChange: (v: boolean) => void;
}

interface ProposalRow {
    feature: FeatureDoc;
    category: Category;
    newRelease: string | null;
    /** True when user has manually clicked "skip" — no move applied. */
    skip: boolean;
}

const TINT_BAR: Record<'green' | 'amber' | 'red', string> = {
    green: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red:   'bg-rose-500',
};

const TINT_PILL: Record<'green' | 'amber' | 'red', string> = {
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50  text-amber-700  border-amber-200',
    red:   'bg-rose-50   text-rose-700   border-rose-200',
};

export function RestructureWorkbench({ open, onOpenChange }: Props) {
    const firestore = useFirestore();
    const { toast } = useToast();

    const featuresRef = useMemoFirebase(() => collection(firestore, 'features'), [firestore]);
    const { data: features, loading: featuresLoading } = useCollection<FeatureDoc>(featuresRef);

    /** Proposal state, keyed by feature.id. Seeded once when features load
     *  (or the Sheet re-opens after a Reset). User edits override seeds. */
    const [proposals, setProposals] = useState<Record<string, ProposalRow>>({});
    const [seeded, setSeeded] = useState(false);
    const [applying, setApplying] = useState(false);
    const [filterOnlyChanges, setFilterOnlyChanges] = useState(true);

    // Seed proposals once features arrive. Filter out shipped + deleted
    // + Backlog (null targetRelease) — those are out of scope for this
    // restructure.
    useEffect(() => {
        if (!open) return;
        if (!features || seeded) return;
        const seed: Record<string, ProposalRow> = {};
        for (const f of features) {
            if (f.deletedAt) continue;
            if (isShippedRelease(f.targetRelease ?? undefined)) continue;
            if (!f.targetRelease) continue; // Backlog — separate triage UI later
            const category = inferCategory(f.title);
            const newRelease = suggestTargetRelease(f.targetRelease, category);
            seed[f.id] = { feature: f, category, newRelease, skip: false };
        }
        setProposals(seed);
        setSeeded(true);
    }, [features, seeded, open]);

    // Reset proposals when the sheet closes so re-opening starts fresh.
    useEffect(() => {
        if (!open) setSeeded(false);
    }, [open]);

    const rows = useMemo(() => Object.values(proposals), [proposals]);

    // Effective new release per row (skipped rows treat newRelease as current).
    const effectiveRelease = (r: ProposalRow): string => r.skip ? (r.feature.targetRelease ?? '') : (r.newRelease ?? r.feature.targetRelease ?? '');

    const movesProposed = useMemo(
        () => rows.filter(r => !r.skip && r.newRelease && r.newRelease !== r.feature.targetRelease).length,
        [rows],
    );

    // Capacity dashboard: per-release pts under the PROPOSED layout.
    const capacity = useMemo(() => {
        const before: Record<string, number> = {};
        const after:  Record<string, number> = {};
        for (const r of rows) {
            const pts = typeof r.feature.points === 'number' ? r.feature.points : 0;
            const cur = r.feature.targetRelease ?? '(none)';
            const newR = effectiveRelease(r) || '(none)';
            before[cur] = (before[cur] ?? 0) + pts;
            after[newR] = (after[newR] ?? 0) + pts;
        }
        const all = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
            .filter(k => k !== '(none)')
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        return all.map(release => ({
            release,
            before: before[release] ?? 0,
            after:  after[release] ?? 0,
            delta:  (after[release] ?? 0) - (before[release] ?? 0),
        }));
    }, [rows]);

    // Group rows by CURRENT release for display.
    const groupedByCurrent = useMemo(() => {
        const groups: Record<string, ProposalRow[]> = {};
        for (const r of rows) {
            if (filterOnlyChanges && (r.skip || !r.newRelease || r.newRelease === r.feature.targetRelease)) continue;
            const key = r.feature.targetRelease ?? '(none)';
            (groups[key] ??= []).push(r);
        }
        for (const k of Object.keys(groups)) {
            groups[k].sort((a, b) => (a.feature.title || '').localeCompare(b.feature.title || ''));
        }
        return groups;
    }, [rows, filterOnlyChanges]);

    function updateRow(id: string, patch: Partial<ProposalRow>) {
        setProposals(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    }

    function resetAll() {
        setSeeded(false);
        // The useEffect re-seeds from the features array on the next render.
    }

    async function handleApply() {
        const toApply = rows.filter(r => !r.skip && r.newRelease && r.newRelease !== r.feature.targetRelease);
        if (toApply.length === 0) {
            toast({ title: 'No moves to apply', description: 'Every row is either skipped or already at its proposed target.' });
            return;
        }
        setApplying(true);
        let ok = 0;
        let failed = 0;
        let statusBumped = 0;
        for (const r of toApply) {
            try {
                const updates: any = {
                    targetRelease: r.newRelease,
                    updatedAt: serverTimestamp(),
                };
                // Drain the Submitted column: anything with status: 'submitted'
                // that now has a targetRelease assignment graduates to 'planned'.
                if (r.feature.status === 'submitted') {
                    updates.status = 'planned';
                    statusBumped++;
                }
                await updateDoc(doc(firestore, 'features', r.feature.id), updates);
                ok++;
            } catch (e) {
                console.error('[restructure-workbench] apply failed for', r.feature.id, e);
                failed++;
            }
        }
        setApplying(false);
        toast({
            title: failed === 0 ? 'Restructure applied' : `Restructure partially applied (${failed} failed)`,
            description: `${ok} moves committed · ${statusBumped} status bumped to planned · ${failed} failed`,
            variant: failed === 0 ? 'default' : 'destructive',
        });
        if (failed === 0) {
            onOpenChange(false);
        }
    }

    const totalRows = rows.length;
    const isLoading = featuresLoading || !seeded;

    return (
        <Sheet open={open} onOpenChange={(v) => { if (!applying) onOpenChange(v); }}>
            <SheetContent
                side="right"
                className="w-full sm:max-w-[min(96vw,1400px)] p-0 flex flex-col gap-0"
            >
                {/* Header strip */}
                <div className="flex items-center justify-between px-5 py-3 border-b bg-slate-900 text-white">
                    <div className="flex items-center gap-2">
                        <Wrench className="h-4 w-4 text-slate-300" />
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">v1.10 Restructure Workbench</p>
                            <p className="text-xs font-semibold">
                                {isLoading
                                    ? 'Loading features…'
                                    : `${totalRows} stories scoped · ${movesProposed} move${movesProposed === 1 ? '' : 's'} proposed`}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={resetAll}
                            disabled={applying || isLoading}
                            className="h-8 px-3 rounded-lg font-black uppercase tracking-widest text-[9px] border-slate-700 bg-slate-800 hover:bg-slate-700 text-white gap-1.5"
                            title="Re-seed all proposals from the categorisation rules"
                        >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Reset
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleApply}
                            disabled={applying || isLoading || movesProposed === 0}
                            className="h-8 px-4 rounded-lg font-black uppercase tracking-widest text-[9px] bg-emerald-500 hover:bg-emerald-400 text-white gap-1.5 disabled:bg-slate-700"
                        >
                            {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            {applying ? 'Applying…' : `Apply ${movesProposed} move${movesProposed === 1 ? '' : 's'}`}
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onOpenChange(false)}
                            disabled={applying}
                            className="h-8 w-8 p-0 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white"
                            aria-label="Close Workbench"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* Filters strip */}
                <div className="px-5 py-2 border-b bg-slate-50 flex items-center justify-between gap-3 shrink-0">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <Filter className="h-3.5 w-3.5 text-slate-500" />
                        <span className="text-xs font-semibold text-slate-700">Show only proposed moves</span>
                        <Switch checked={filterOnlyChanges} onCheckedChange={setFilterOnlyChanges} />
                    </label>
                    <p className="text-[10px] text-slate-500">
                        Capacity caps: green &lt;{POINTS_CAP_GREEN}pts · amber {POINTS_CAP_GREEN}-{POINTS_CAP_RED - 1}pts · red ≥{POINTS_CAP_RED}pts
                    </p>
                </div>

                {/* Capacity dashboard */}
                <div className="px-5 py-3 border-b bg-white shrink-0 overflow-x-auto">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-2">Capacity after proposed moves</p>
                    <div className="flex gap-1.5 min-w-fit">
                        {capacity.map(c => {
                            const tintAfter = capacityTint(c.after);
                            return (
                                <div
                                    key={c.release}
                                    className={cn(
                                        'rounded-lg border px-2.5 py-1.5 min-w-[88px] flex flex-col gap-0.5',
                                        TINT_PILL[tintAfter],
                                    )}
                                    title={`${c.release}: ${c.before} → ${c.after} pts (delta ${c.delta > 0 ? '+' : ''}${c.delta})`}
                                >
                                    <p className="text-[10px] font-black uppercase tracking-widest">{c.release}</p>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-sm font-black tabular-nums">{c.after}</span>
                                        <span className="text-[9px] text-slate-500">pts</span>
                                    </div>
                                    {c.delta !== 0 && (
                                        <p className="text-[9px] tabular-nums">
                                            {c.delta > 0 ? '+' : ''}{c.delta} vs now
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Body — grouped rows */}
                <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50/40">
                    {isLoading && (
                        <div className="h-full flex items-center justify-center gap-2 text-slate-500">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            <span className="text-xs font-semibold uppercase tracking-widest">Loading features…</span>
                        </div>
                    )}
                    {!isLoading && Object.keys(groupedByCurrent).length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center gap-1 text-center px-6">
                            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                            <p className="text-xs font-semibold text-slate-700">Nothing proposed</p>
                            <p className="text-[11px] text-slate-500 max-w-md">
                                Toggle "Show only proposed moves" off to see every story (including unchanged ones), or click Reset to re-seed proposals from the rules.
                            </p>
                        </div>
                    )}
                    {!isLoading && Object.entries(groupedByCurrent).map(([currentRelease, groupRows]) => {
                        const beforePts = groupRows.reduce((s, r) => s + (r.feature.points ?? 0), 0);
                        return (
                            <div key={currentRelease} className="border-b">
                                <div className="px-5 py-2 bg-slate-100/70 sticky top-0 z-10 flex items-center justify-between">
                                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-700">
                                        Currently {currentRelease}
                                        <span className="text-slate-500 font-semibold normal-case ml-2">
                                            · {groupRows.length} {groupRows.length === 1 ? 'story' : 'stories'} · {beforePts} pts
                                        </span>
                                    </p>
                                </div>
                                <ul className="divide-y bg-white">
                                    {groupRows.map(r => (
                                        <WorkbenchRow
                                            key={r.feature.id}
                                            row={r}
                                            onChangeCategory={(category) => updateRow(r.feature.id, { category, newRelease: suggestTargetRelease(r.feature.targetRelease ?? null, category) })}
                                            onChangeRelease={(newRelease) => updateRow(r.feature.id, { newRelease, skip: false })}
                                            onToggleSkip={(skip) => updateRow(r.feature.id, { skip })}
                                            disabled={applying}
                                        />
                                    ))}
                                </ul>
                            </div>
                        );
                    })}
                </div>

                {/* Footer reiterates the Apply button for long lists */}
                <div className="px-5 py-3 border-t bg-white shrink-0 flex items-center justify-between">
                    <p className="text-[11px] text-slate-500">
                        Apply writes all proposed moves in one batch. Idempotent — re-runnable if anything looks off. Skipped rows + unchanged rows are not touched.
                    </p>
                    <Button
                        size="sm"
                        onClick={handleApply}
                        disabled={applying || isLoading || movesProposed === 0}
                        className="h-8 px-4 rounded-lg font-black uppercase tracking-widest text-[9px] bg-emerald-500 hover:bg-emerald-400 text-white gap-1.5 disabled:bg-slate-300 disabled:text-slate-500"
                    >
                        {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        {applying ? 'Applying…' : `Apply ${movesProposed} move${movesProposed === 1 ? '' : 's'}`}
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    );
}

interface WorkbenchRowProps {
    row: ProposalRow;
    onChangeCategory: (c: Category) => void;
    onChangeRelease: (r: string) => void;
    onToggleSkip: (s: boolean) => void;
    disabled: boolean;
}

function WorkbenchRow({ row, onChangeCategory, onChangeRelease, onToggleSkip, disabled }: WorkbenchRowProps) {
    const { feature, category, newRelease, skip } = row;
    const moved = !skip && newRelease && newRelease !== feature.targetRelease;

    return (
        <li className={cn('flex items-center gap-3 px-5 py-2.5', moved && 'bg-emerald-50/30', skip && 'opacity-50')}>
            {/* Title + meta */}
            <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-800 truncate">{feature.title}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[9px] font-bold text-slate-700 bg-slate-100 rounded px-1.5 py-0.5">
                        {feature.points ?? '?'} pts
                    </span>
                    <span className="text-[9px] text-slate-500">
                        {feature.status ?? 'submitted'}
                    </span>
                </div>
            </div>

            {/* Category dropdown */}
            <div className="shrink-0 w-44">
                <Select
                    value={category}
                    onValueChange={(v) => onChangeCategory(v as Category)}
                    disabled={disabled || skip}
                >
                    <SelectTrigger className={cn('h-8 text-[10px] font-bold', CATEGORY_TINT[category])}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {(Object.keys(CATEGORY_LABEL) as Category[]).map(c => (
                            <SelectItem key={c} value={c} className="text-[11px]">
                                {CATEGORY_LABEL[c]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* New release dropdown */}
            <div className="shrink-0 w-28">
                <Select
                    value={newRelease ?? feature.targetRelease ?? ''}
                    onValueChange={(v) => onChangeRelease(v)}
                    disabled={disabled || skip}
                >
                    <SelectTrigger className={cn(
                        'h-8 text-[10px] font-black tracking-widest uppercase',
                        moved ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-700',
                    )}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {/* Always include the current release as an option even if not in TARGETABLE_RELEASES (shipped historicals etc.) */}
                        {feature.targetRelease && !TARGETABLE_RELEASES.includes(feature.targetRelease) && (
                            <SelectItem value={feature.targetRelease} className="text-[11px] italic">
                                {feature.targetRelease} (keep)
                            </SelectItem>
                        )}
                        {TARGETABLE_RELEASES.map(r => (
                            <SelectItem key={r} value={r} className="text-[11px]">{r}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Diff indicator */}
            <div className="shrink-0 w-20 text-right">
                {moved ? (
                    <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px] uppercase font-black tracking-widest">
                        {feature.targetRelease} → {newRelease}
                    </Badge>
                ) : (
                    <span className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">no move</span>
                )}
            </div>

            {/* Skip toggle */}
            <label className="shrink-0 flex items-center gap-1 cursor-pointer" title="Skip this row — leave it untouched">
                <Switch checked={skip} onCheckedChange={onToggleSkip} disabled={disabled} />
                <span className="text-[9px] uppercase tracking-widest font-bold text-slate-500">Skip</span>
            </label>
        </li>
    );
}

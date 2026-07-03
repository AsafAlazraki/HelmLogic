'use client';

/**
 * EngineSchedulePicker — optional engine-service-schedule section for the
 * ServiceQuoteDetailSheet.
 *
 * Searches organisations/{orgId}/engineServiceSchedules by engineModel.
 * Picking a schedule shows its intervals table (interval · flat hours ·
 * sell) and lets the operator one-click add a chosen interval as a
 * service-quote operation line ("<engineModel> — <interval>h service",
 * sellPrice from the schedule, hours from flatHrs) via the same line
 * shape the create wizard uses for serviceOperations.
 *
 * Graceful fallback: the collection is loaded with a caught one-shot
 * getDocs (aggregate-loader pattern) — a missing collection or missing
 * rule renders the empty state instead of erroring, so pre-import orgs
 * see zero behaviour change beyond an inert empty section.
 */

import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Gauge, Plus, Loader2, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EngineScheduleInterval {
    /** Contract field name; extracted data uses intervalHours — accept both. */
    interval?: number | string | null;
    intervalHours?: number | string | null;
    ctd?: number | null;
    sell?: number | null;
    flatHrs?: number | null;
}

interface EngineServiceSchedule {
    id: string;
    engineModel?: string | null;
    familyCode?: string | null;
    intervals?: EngineScheduleInterval[] | null;
}

/** Matches the ServiceQuoteLineOp shape written by the create wizard. */
export interface ScheduleOpLine {
    id: string;
    code: string;
    name: string;
    hours: number;
    rate: number;
    sellPrice: number;
    cost: number;
}

function intervalLabel(iv: EngineScheduleInterval): string {
    const raw = iv.interval ?? iv.intervalHours;
    if (raw == null || raw === '') return '—';
    return typeof raw === 'number' ? `${raw}h` : String(raw);
}

function currency(n: number | null | undefined) {
    if (n == null || isNaN(n)) return '—';
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n);
}

export function EngineSchedulePicker({
    organisationId,
    disabled,
    onAdd,
}: {
    organisationId: string;
    disabled?: boolean;
    onAdd: (line: ScheduleOpLine) => Promise<void> | void;
}) {
    const firestore = useFirestore();
    const [schedules, setSchedules] = useState<EngineServiceSchedule[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [addingKey, setAddingKey] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const snap = await getDocs(collection(firestore, 'organisations', organisationId, 'engineServiceSchedules'));
                if (!cancelled) {
                    setSchedules(snap.docs.map(d => ({ id: d.id, ...d.data() } as EngineServiceSchedule)));
                }
            } catch (err) {
                // Non-essential read — pre-import orgs (or a missing rule) just get the empty state.
                console.warn('engineServiceSchedules read unavailable (non-fatal)', err);
                if (!cancelled) setSchedules([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [firestore, organisationId]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return schedules;
        // String() guards: MPF-imported docs can carry numeric fields —
        // engineServiceSchedules/5c has familyCode 6000 (number). Calling
        // .toLowerCase() on it crashed the WHOLE page (global error boundary)
        // on the first search keystroke. Found by tests/module-quotes.spec.ts.
        return schedules.filter(s =>
            String(s.engineModel ?? '').toLowerCase().includes(q) ||
            String(s.familyCode ?? '').toLowerCase().includes(q),
        );
    }, [schedules, search]);

    const selected = useMemo(
        () => schedules.find(s => s.id === selectedId) ?? null,
        [schedules, selectedId],
    );

    const handleAdd = async (schedule: EngineServiceSchedule, iv: EngineScheduleInterval) => {
        const label = intervalLabel(iv);
        const key = `${schedule.id}:${label}`;
        const hours = typeof iv.flatHrs === 'number' ? iv.flatHrs : 0;
        const sell = typeof iv.sell === 'number' ? iv.sell : 0;
        setAddingKey(key);
        try {
            await onAdd({
                id: `${schedule.id}-${label}-${Date.now()}`,
                code: label,
                name: `${schedule.engineModel ?? 'Engine'} — ${label} service`,
                hours,
                rate: hours > 0 ? Math.round((sell / hours) * 100) / 100 : 0,
                sellPrice: sell,
                cost: typeof iv.ctd === 'number' ? iv.ctd : 0,
            });
        } finally {
            setAddingKey(null);
        }
    };

    return (
        <section className="rounded-2xl border-2 bg-white p-4 space-y-3">
            <div className="flex items-center gap-2">
                <Gauge className="h-3 w-3 text-sky-600" />
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-700">Engine service schedule</p>
                <Badge variant="outline" className="text-[8px] font-black uppercase text-slate-400 border-slate-200">Optional</Badge>
            </div>

            {loading ? (
                <div className="flex items-center gap-2 py-3 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span className="text-[10px]">Loading schedules…</span>
                </div>
            ) : schedules.length === 0 ? (
                <p className="text-[10px] text-muted-foreground italic">
                    No engine service schedules yet — import the MPF service data to enable one-click interval pricing.
                </p>
            ) : (
                <div className="space-y-2">
                    <Input
                        value={search}
                        onChange={e => { setSearch(e.target.value); setSelectedId(null); }}
                        placeholder="Search by engine model (e.g. F150, XF450)…"
                        className="rounded-xl border-2 h-8 text-xs"
                    />

                    {search.trim() !== '' && filtered.length === 0 && (
                        <p className="text-[10px] text-muted-foreground italic">No engine models match “{search.trim()}”.</p>
                    )}

                    {filtered.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                            {filtered.slice(0, 24).map(s => {
                                const on = s.id === selectedId;
                                return (
                                    <button
                                        key={s.id}
                                        type="button"
                                        onClick={() => setSelectedId(on ? null : s.id)}
                                        className={cn(
                                            'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold transition-colors',
                                            on ? 'border-primary bg-primary/5 text-primary' : 'border-slate-200 hover:bg-slate-50 text-slate-700',
                                        )}
                                    >
                                        {s.engineModel ?? s.id}
                                        <ChevronDown className={cn('h-2.5 w-2.5 transition-transform', on && 'rotate-180')} />
                                    </button>
                                );
                            })}
                            {filtered.length > 24 && (
                                <span className="text-[9px] text-muted-foreground self-center">+{filtered.length - 24} more — refine the search</span>
                            )}
                        </div>
                    )}

                    {selected && (
                        <div className="rounded-xl border-2 border-slate-200 overflow-hidden">
                            <div className="px-3 py-1.5 bg-slate-50 border-b flex items-center justify-between">
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                                    {selected.engineModel} — intervals
                                </p>
                                {selected.familyCode && (
                                    <span className="text-[9px] font-mono font-bold text-slate-400">{selected.familyCode}</span>
                                )}
                            </div>
                            {(selected.intervals ?? []).length === 0 ? (
                                <p className="text-[10px] text-muted-foreground italic px-3 py-2">No intervals on this schedule.</p>
                            ) : (
                                <div className="max-h-52 overflow-y-auto divide-y">
                                    {(selected.intervals ?? []).map((iv, idx) => {
                                        const label = intervalLabel(iv);
                                        const key = `${selected.id}:${label}`;
                                        const busy = addingKey === key;
                                        return (
                                            <div key={`${label}-${idx}`} className="flex items-center justify-between gap-3 px-3 py-1.5">
                                                <Badge variant="outline" className="bg-sky-50 text-sky-800 border-sky-200 text-[10px] font-mono font-bold shrink-0">{label}</Badge>
                                                <span className="text-[10px] text-muted-foreground tabular-nums flex-1 text-right">
                                                    {typeof iv.flatHrs === 'number' ? `${iv.flatHrs.toFixed(1)} hrs` : '— hrs'}
                                                </span>
                                                <span className="text-xs font-bold tabular-nums w-20 text-right">{currency(iv.sell)}</span>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={disabled || busy}
                                                    onClick={() => handleAdd(selected, iv)}
                                                    className="rounded-lg h-7 px-2 text-[10px] font-bold shrink-0"
                                                >
                                                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                                                    <span className="ml-1">Add</span>
                                                </Button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}

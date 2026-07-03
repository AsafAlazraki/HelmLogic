
'use client';

/**
 * EngineServiceSchedulesManager — MPF Data admin surface (read-mostly).
 *
 * Org-level engine service schedules imported from the MPF workbook —
 * one row per engine model with its service intervals (interval / CTD /
 * sell / flat hours), a five-year plan summary, and a parts BOM.
 * Lives at `organisations/{orgId}/engineServiceSchedules/{docId}`.
 *
 * Read-mostly by design: only `engineModel` (+ manual add / delete) is
 * editable here. `intervals[]`, `fiveYearPlan{}` and `partsBom[]` render
 * as read-only tolerant tables — they round-trip via the MPF import.
 *
 * Reads use `useCollection(ref, { silent: true })` so a missing rule on
 * this path degrades to the empty state, never the global error boundary.
 * Delete confirms via AlertDialog per tasks/CONVENTIONS.md. All prices
 * are GST-exclusive.
 */

import { useMemo, useState, useEffect } from 'react';
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { z } from 'zod';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { formatCurrency } from '@/lib/currency-utils';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import {
    AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
    AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, Gauge, Loader2, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const looseString = z.preprocess(
    v => (v == null ? null : String(v)),
    z.string().nullable(),
).catch(null);

const engineScheduleSchema = z.object({
    engineModel: looseString.optional(),
    intervals: z.array(z.any()).optional().nullable().default([]),
    fiveYearPlan: z.record(z.any()).optional().nullable().default({}),
    partsBom: z.array(z.any()).optional().nullable().default([]),
    mpfSource: looseString.optional(),
}).passthrough();

interface EngineServiceSchedule {
    id: string;
    engineModel?: string | null;
    intervals?: any[] | null;
    fiveYearPlan?: Record<string, any> | null;
    partsBom?: any[] | null;
    mpfSource?: string | null;
    [key: string]: any;
}

function cellLabel(v: any): string {
    if (v == null || v === '') return '—';
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (typeof v === 'number') return v.toLocaleString();
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
}

function moneyish(v: any): string {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[$,\s]/g, ''));
    return Number.isFinite(n) ? formatCurrency(n) : cellLabel(v);
}

/**
 * Tolerant table over an array of variably-shaped objects — columns are
 * the union of keys across rows (capped so a rogue row can't explode
 * the layout). Non-object rows render as a single-cell line.
 */
function TolerantArrayTable({ rows, maxCols = 6 }: { rows: any[]; maxCols?: number }) {
    const objectRows = rows.filter(r => r != null && typeof r === 'object' && !Array.isArray(r));
    const columns = useMemo(() => {
        const keys: string[] = [];
        for (const row of objectRows) {
            for (const k of Object.keys(row)) {
                if (!keys.includes(k)) keys.push(k);
            }
        }
        return keys.slice(0, maxCols);
    }, [objectRows, maxCols]);

    if (rows.length === 0) return null;

    if (columns.length === 0) {
        // Array of primitives — render as simple lines.
        return (
            <div className="rounded-xl border bg-slate-50/50 p-2 max-h-40 overflow-y-auto space-y-1">
                {rows.map((r, i) => (
                    <p key={i} className="text-xs text-slate-700">{cellLabel(r)}</p>
                ))}
            </div>
        );
    }

    return (
        <div className="overflow-x-auto rounded-xl border max-h-56 overflow-y-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        {columns.map(c => (
                            <TableHead key={c} className="text-[9px] uppercase tracking-widest">{c}</TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((r, i) => (
                        <TableRow key={i}>
                            {columns.map(c => {
                                const v = r != null && typeof r === 'object' ? (r as any)[c] : undefined;
                                const isPricey = /ctd|sell|price|cost/i.test(c);
                                return (
                                    <TableCell key={c} className="text-xs tabular-nums">
                                        {isPricey ? moneyish(v) : cellLabel(v)}
                                    </TableCell>
                                );
                            })}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

export function EngineServiceSchedulesManager({ organisationId }: { organisationId: string }) {
    const firestore = useFirestore();
    const { toast } = useToast();

    // No orderBy (CLAUDE.md lesson) — sort client-side. silent:true so a
    // rules gap degrades to the empty state instead of white-screening.
    const schedulesRef = useMemoFirebase(
        () => collection(firestore, 'organisations', organisationId, 'engineServiceSchedules'),
        [firestore, organisationId],
    );
    const { data: schedules, isLoading } = useCollection<EngineServiceSchedule>(schedulesRef, { silent: true });

    const [search, setSearch] = useState('');
    const [editorOpen, setEditorOpen] = useState(false);
    const [editing, setEditing] = useState<EngineServiceSchedule | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<EngineServiceSchedule | null>(null);
    const [deleting, setDeleting] = useState(false);

    const filtered = useMemo(() => {
        const list = [...(schedules ?? [])].sort((a, b) => (a.engineModel ?? '').localeCompare(b.engineModel ?? ''));
        const q = search.trim().toLowerCase();
        if (!q) return list;
        return list.filter(s =>
            [s.engineModel, s.mpfSource]
                .some(f => (f ?? '').toLowerCase().includes(q)),
        );
    }, [schedules, search]);

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await deleteDoc(doc(firestore, 'organisations', organisationId, 'engineServiceSchedules', deleteTarget.id));
            toast({ title: 'Service schedule removed', description: deleteTarget.engineModel ?? deleteTarget.id });
            setDeleteTarget(null);
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Failed to remove service schedule' });
        } finally {
            setDeleting(false);
        }
    };

    return (
        <Card className="rounded-2xl border-2">
            <CardHeader>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-base font-bold">
                            <Gauge className="h-4 w-4" />
                            Engine Service Schedules
                        </CardTitle>
                        <CardDescription className="text-xs">
                            MPF-sourced service schedules per engine model — intervals with CTD / sell / flat hours
                            (all prices ex GST), five-year plan and parts BOM. Intervals + BOM are read-only here and
                            round-trip via the MPF import.
                        </CardDescription>
                    </div>
                    <Button size="sm" onClick={() => { setEditing(null); setEditorOpen(true); }} className="rounded-xl">
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add schedule
                    </Button>
                </div>
                <div className="relative pt-2 max-w-sm">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search engine model…"
                        className="pl-8 h-9 rounded-xl"
                    />
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex items-center justify-center py-12 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        <span className="text-xs">Loading service schedules…</span>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center gap-2 border-2 border-dashed rounded-2xl text-muted-foreground">
                        <Gauge className="h-8 w-8 opacity-30" />
                        <p className="text-xs font-semibold">
                            {schedules && schedules.length > 0
                                ? 'No schedules match your search.'
                                : 'No engine service schedules yet. They arrive via the MPF import, or add one manually.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-xl border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-[10px] uppercase tracking-widest">Engine Model</TableHead>
                                    <TableHead className="text-right text-[10px] uppercase tracking-widest">Intervals</TableHead>
                                    <TableHead className="text-right text-[10px] uppercase tracking-widest">Parts BOM Lines</TableHead>
                                    <TableHead className="text-[10px] uppercase tracking-widest">5-Year Plan</TableHead>
                                    <TableHead className="w-20" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filtered.map(s => {
                                    const intervalCount = Array.isArray(s.intervals) ? s.intervals.length : 0;
                                    const bomCount = Array.isArray(s.partsBom) ? s.partsBom.length : 0;
                                    const hasPlan = s.fiveYearPlan && typeof s.fiveYearPlan === 'object' && Object.keys(s.fiveYearPlan).length > 0;
                                    return (
                                        <TableRow key={s.id}>
                                            <TableCell className="text-xs">
                                                <span className="font-semibold">{s.engineModel ?? '—'}</span>
                                                {s.mpfSource && (
                                                    <Badge variant="outline" className="ml-2 text-[9px] font-bold uppercase text-muted-foreground">
                                                        MPF · {s.mpfSource}
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right text-xs tabular-nums">{intervalCount}</TableCell>
                                            <TableCell className="text-right text-xs tabular-nums">{bomCount}</TableCell>
                                            <TableCell className="text-xs">
                                                {hasPlan ? <Badge variant="outline" className="text-[9px] font-bold">Yes</Badge> : '—'}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1 justify-end">
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => { setEditing(s); setEditorOpen(true); }}>
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" onClick={() => setDeleteTarget(s)}>
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>

            <EngineScheduleEditor
                open={editorOpen}
                onOpenChange={setEditorOpen}
                organisationId={organisationId}
                editing={editing}
            />

            <AlertDialog open={deleteTarget !== null} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete service schedule?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This permanently removes the schedule for <strong>{deleteTarget?.engineModel ?? ''}</strong>, including
                            its intervals and parts BOM. This cannot be undone. A future MPF import can recreate it.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={e => { e.preventDefault(); void confirmDelete(); }}
                            disabled={deleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleting && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
}

function EngineScheduleEditor({
    open, onOpenChange, organisationId, editing,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    organisationId: string;
    editing: EngineServiceSchedule | null;
}) {
    const firestore = useFirestore();
    const { toast } = useToast();

    const [engineModel, setEngineModel] = useState('');
    const [saving, setSaving] = useState(false);

    const isEdit = editing !== null;

    useEffect(() => {
        if (!open) return;
        const parsed = editing ? engineScheduleSchema.safeParse(editing) : null;
        const src: any = parsed?.success ? parsed.data : (editing ?? {});
        setEngineModel(src.engineModel ?? '');
    }, [open, editing]);

    const handleSave = async () => {
        if (!engineModel.trim()) {
            toast({ variant: 'destructive', title: 'Engine model required' });
            return;
        }
        setSaving(true);
        try {
            if (isEdit && editing) {
                // updateDoc merges — intervals / fiveYearPlan / partsBom / mpfSource untouched.
                await updateDoc(doc(firestore, 'organisations', organisationId, 'engineServiceSchedules', editing.id), {
                    engineModel: engineModel.trim(),
                    updatedAt: serverTimestamp(),
                });
                toast({ title: 'Service schedule updated', description: engineModel.trim() });
            } else {
                await addDoc(collection(firestore, 'organisations', organisationId, 'engineServiceSchedules'), {
                    engineModel: engineModel.trim(),
                    intervals: [],
                    fiveYearPlan: {},
                    partsBom: [],
                    mpfSource: null,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                });
                toast({ title: 'Service schedule added', description: engineModel.trim() });
            }
            onOpenChange(false);
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Failed to save service schedule' });
        } finally {
            setSaving(false);
        }
    };

    const intervals: any[] = Array.isArray(editing?.intervals) ? editing!.intervals! : [];
    const partsBom: any[] = Array.isArray(editing?.partsBom) ? editing!.partsBom! : [];
    const planEntries = editing?.fiveYearPlan && typeof editing.fiveYearPlan === 'object'
        ? Object.entries(editing.fiveYearPlan)
        : [];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{isEdit ? 'Edit service schedule' : 'Add service schedule'}</DialogTitle>
                    <DialogDescription className="text-xs">
                        Intervals, five-year plan and parts BOM come from the MPF import and are read-only.
                        All prices shown ex GST.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Engine model</label>
                        <Input value={engineModel} onChange={e => setEngineModel(e.target.value)} placeholder="e.g., F150XB" className="rounded-xl border-2 h-9 font-semibold" autoFocus />
                    </div>

                    {isEdit && intervals.length > 0 && (
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                Service intervals ({intervals.length}) — read-only, prices ex GST
                            </label>
                            <TolerantArrayTable rows={intervals} />
                        </div>
                    )}

                    {isEdit && planEntries.length > 0 && (
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                Five-year plan — read-only
                            </label>
                            <div className="rounded-xl border bg-slate-50/50 divide-y max-h-40 overflow-y-auto">
                                {planEntries.map(([k, v]) => (
                                    <div key={k} className="flex items-start justify-between gap-4 px-3 py-1.5">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 shrink-0">{k}</span>
                                        <span className="text-xs text-slate-700 break-all text-right">{cellLabel(v)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {isEdit && partsBom.length > 0 && (
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                Parts BOM ({partsBom.length}) — read-only
                            </label>
                            <TolerantArrayTable rows={partsBom} />
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="rounded-xl">Cancel</Button>
                    <Button onClick={handleSave} disabled={saving} className="rounded-xl">
                        {saving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                        {isEdit ? 'Save changes' : 'Add schedule'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

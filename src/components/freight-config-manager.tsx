
'use client';

/**
 * FreightConfigManager — MPF Data admin surface.
 *
 * Org-level freight configuration imported from the MPF workbook — one
 * row per vendor with a rate per linear metre plus a buffer percentage.
 * Lives at `organisations/{orgId}/freightConfig/{docId}`.
 *
 * Mirrors the FitUpCatalogManager / ServiceCatalogManager admin pattern:
 * table list + search + add/edit dialog + AlertDialog delete confirm
 * (per tasks/CONVENTIONS.md — no browser confirm()).
 *
 * Reads use `useCollection(ref, { silent: true })` so a missing rule on
 * this path degrades to the empty state, never the global error boundary.
 * Zod schema is fully permissive per CLAUDE.md — optional().nullable(),
 * passthrough(). Rates are GST-exclusive.
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
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import {
    AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
    AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, Truck, Loader2, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const looseNumber = z.preprocess(v => {
    if (v == null || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[%$,\s]/g, ''));
    return Number.isFinite(n) ? n : null;
}, z.number().nullable()).catch(null);

const looseString = z.preprocess(
    v => (v == null ? null : String(v)),
    z.string().nullable(),
).catch(null);

const freightConfigSchema = z.object({
    vendor: looseString.optional(),
    ratePerLinearMetre: looseNumber.optional(),
    bufferPct: looseNumber.optional(),
    notes: looseString.optional(),
    mpfSource: looseString.optional(),
}).passthrough();

interface FreightConfigRow {
    id: string;
    vendor?: string | null;
    ratePerLinearMetre?: number | null;
    bufferPct?: number | null;
    notes?: string | null;
    mpfSource?: string | null;
    [key: string]: any;
}

export function FreightConfigManager({ organisationId }: { organisationId: string }) {
    const firestore = useFirestore();
    const { toast } = useToast();

    // No orderBy (CLAUDE.md lesson) — sort client-side. silent:true so a
    // rules gap degrades to the empty state instead of white-screening.
    const freightRef = useMemoFirebase(
        () => collection(firestore, 'organisations', organisationId, 'freightConfig'),
        [firestore, organisationId],
    );
    const { data: rows, isLoading } = useCollection<FreightConfigRow>(freightRef, { silent: true });

    const [search, setSearch] = useState('');
    const [editorOpen, setEditorOpen] = useState(false);
    const [editing, setEditing] = useState<FreightConfigRow | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<FreightConfigRow | null>(null);
    const [deleting, setDeleting] = useState(false);

    const filtered = useMemo(() => {
        const list = [...(rows ?? [])].sort((a, b) => (a.vendor ?? '').localeCompare(b.vendor ?? ''));
        const q = search.trim().toLowerCase();
        if (!q) return list;
        return list.filter(r =>
            [r.vendor, r.notes, r.mpfSource]
                .some(f => (f ?? '').toLowerCase().includes(q)),
        );
    }, [rows, search]);

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await deleteDoc(doc(firestore, 'organisations', organisationId, 'freightConfig', deleteTarget.id));
            toast({ title: 'Freight config removed', description: deleteTarget.vendor ?? deleteTarget.id });
            setDeleteTarget(null);
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Failed to remove freight config' });
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
                            <Truck className="h-4 w-4" />
                            Freight Config
                        </CardTitle>
                        <CardDescription className="text-xs">
                            MPF-sourced freight rates — dollars per linear metre (ex GST) plus a buffer percentage,
                            per vendor.
                        </CardDescription>
                    </div>
                    <Button size="sm" onClick={() => { setEditing(null); setEditorOpen(true); }} className="rounded-xl">
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add vendor rate
                    </Button>
                </div>
                <div className="relative pt-2 max-w-sm">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search vendor, notes…"
                        className="pl-8 h-9 rounded-xl"
                    />
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex items-center justify-center py-12 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        <span className="text-xs">Loading freight config…</span>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center gap-2 border-2 border-dashed rounded-2xl text-muted-foreground">
                        <Truck className="h-8 w-8 opacity-30" />
                        <p className="text-xs font-semibold">
                            {rows && rows.length > 0
                                ? 'No vendors match your search.'
                                : 'No freight config yet. Rates arrive via the MPF import, or add one manually.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-xl border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-[10px] uppercase tracking-widest">Vendor</TableHead>
                                    <TableHead className="text-right text-[10px] uppercase tracking-widest">Rate / Linear Metre (ex GST)</TableHead>
                                    <TableHead className="text-right text-[10px] uppercase tracking-widest">Buffer %</TableHead>
                                    <TableHead className="text-[10px] uppercase tracking-widest">Notes</TableHead>
                                    <TableHead className="w-20" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filtered.map(row => (
                                    <TableRow key={row.id}>
                                        <TableCell className="text-xs">
                                            {/* MPF-imported docs (import-service-config.py) carry
                                                `supplier`/`vendorKey` + `perLinearMetreAud`, not
                                                `vendor`/`ratePerLinearMetre` — fall back so imported
                                                rows aren't rendered as em-dashes. */}
                                            <span className="font-semibold">{row.vendor ?? row.supplier ?? row.vendorKey ?? '—'}</span>
                                            {row.mpfSource && (
                                                <Badge variant="outline" className="ml-2 text-[9px] font-bold uppercase text-muted-foreground">
                                                    MPF · {row.mpfSource}
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right text-xs tabular-nums font-semibold">
                                            {(row.ratePerLinearMetre ?? row.perLinearMetreAud) != null
                                                ? formatCurrency(row.ratePerLinearMetre ?? row.perLinearMetreAud)
                                                : '—'}
                                        </TableCell>
                                        <TableCell className="text-right text-xs tabular-nums">
                                            {/* MPF stores bufferPct as a fraction (0.1 = 10%); MPF docs
                                                are identified by their import-only fields. */}
                                            {row.bufferPct != null
                                                ? `${(row.perLinearMetreAud != null || row.vendorKey != null) && Math.abs(row.bufferPct) <= 1
                                                    ? Number((row.bufferPct * 100).toFixed(2))
                                                    : row.bufferPct}%`
                                                : '—'}
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground max-w-[18rem] truncate">{row.notes ?? '—'}</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1 justify-end">
                                                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => { setEditing(row); setEditorOpen(true); }}>
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" onClick={() => setDeleteTarget(row)}>
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>

            <FreightConfigEditor
                open={editorOpen}
                onOpenChange={setEditorOpen}
                organisationId={organisationId}
                editing={editing}
            />

            <AlertDialog open={deleteTarget !== null} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete freight config?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This permanently removes the freight rate for <strong>{deleteTarget?.vendor ?? ''}</strong>.
                            This cannot be undone. A future MPF import can recreate it.
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

function FreightConfigEditor({
    open, onOpenChange, organisationId, editing,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    organisationId: string;
    editing: FreightConfigRow | null;
}) {
    const firestore = useFirestore();
    const { toast } = useToast();

    const [vendor, setVendor] = useState('');
    const [rate, setRate] = useState('');
    const [bufferPct, setBufferPct] = useState('');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);

    const isEdit = editing !== null;

    useEffect(() => {
        if (!open) return;
        const parsed = editing ? freightConfigSchema.safeParse(editing) : null;
        const src: any = parsed?.success ? parsed.data : (editing ?? {});
        setVendor(src.vendor ?? '');
        setRate(src.ratePerLinearMetre != null ? String(src.ratePerLinearMetre) : '');
        setBufferPct(src.bufferPct != null ? String(src.bufferPct) : '');
        setNotes(src.notes ?? '');
    }, [open, editing]);

    const num = (s: string): number | null => {
        if (s.trim() === '') return null;
        const n = parseFloat(s.replace(/[%$,\s]/g, ''));
        return Number.isFinite(n) ? n : null;
    };

    const handleSave = async () => {
        if (!vendor.trim()) {
            toast({ variant: 'destructive', title: 'Vendor required' });
            return;
        }
        setSaving(true);
        try {
            const payload = {
                vendor: vendor.trim(),
                ratePerLinearMetre: num(rate),
                bufferPct: num(bufferPct),
                notes: notes.trim() || null,
                updatedAt: serverTimestamp(),
            };
            if (isEdit && editing) {
                // updateDoc merges — mpfSource + any extra imported fields untouched.
                await updateDoc(doc(firestore, 'organisations', organisationId, 'freightConfig', editing.id), payload);
                toast({ title: 'Freight config updated', description: vendor.trim() });
            } else {
                await addDoc(collection(firestore, 'organisations', organisationId, 'freightConfig'), {
                    ...payload,
                    mpfSource: null,
                    createdAt: serverTimestamp(),
                });
                toast({ title: 'Freight config added', description: vendor.trim() });
            }
            onOpenChange(false);
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Failed to save freight config' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{isEdit ? 'Edit freight config' : 'Add freight config'}</DialogTitle>
                    <DialogDescription className="text-xs">
                        Rate is dollars per linear metre of boat, GST-exclusive. Buffer % pads the computed
                        freight for handling / fuel variance.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Vendor</label>
                        <Input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="e.g., Highfield" className="rounded-xl border-2 h-9" autoFocus />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Rate / linear metre ($ ex GST)</label>
                            <Input type="number" inputMode="decimal" min="0" step="0.01" value={rate} onChange={e => setRate(e.target.value)} placeholder="0.00" className="rounded-xl border-2 h-9 tabular-nums" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Buffer %</label>
                            <Input type="number" inputMode="decimal" min="0" step="0.1" value={bufferPct} onChange={e => setBufferPct(e.target.value)} placeholder="e.g., 10" className="rounded-xl border-2 h-9 tabular-nums" />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Notes</label>
                        <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Operator notes on this freight rate" className="rounded-xl border-2 text-xs" rows={2} />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="rounded-xl">Cancel</Button>
                    <Button onClick={handleSave} disabled={saving} className="rounded-xl">
                        {saving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                        {isEdit ? 'Save changes' : 'Add vendor rate'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

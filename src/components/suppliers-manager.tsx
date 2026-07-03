
'use client';

/**
 * SuppliersManager — MPF Data admin surface.
 *
 * Org-level supplier registry imported from the MPF workbook.
 * Lives at `organisations/{orgId}/suppliers/{docId}`.
 *
 * Mirrors the FitUpCatalogManager / ServiceCatalogManager admin pattern:
 * table list + search + add/edit dialog + AlertDialog delete confirm
 * (per tasks/CONVENTIONS.md — no browser confirm()).
 *
 * Reads use `useCollection(ref, { silent: true })` so a missing rule on
 * this path degrades to the empty state, never the global error boundary.
 *
 * Zod schema is fully permissive per CLAUDE.md — every field
 * optional().nullable(), object passthrough(). `dmsConfig{}` is a
 * tolerant key/value bag rendered read-only (it round-trips via the
 * MPF import / DMS integration, not this dialog).
 */

import { useMemo, useState, useEffect } from 'react';
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { z } from 'zod';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
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
import { Plus, Pencil, Trash2, Building2, Loader2, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const looseString = z.preprocess(
    v => (v == null ? null : String(v)),
    z.string().nullable(),
).catch(null);

const supplierSchema = z.object({
    supplierId: looseString.optional(),
    name: looseString.optional(),
    abn: looseString.optional(),
    terms: looseString.optional(),
    credit: z.any().optional().nullable(),
    dmsConfig: z.record(z.any()).optional().nullable().default({}),
    mpfSource: looseString.optional(),
}).passthrough();

interface Supplier {
    id: string;
    supplierId?: string | null;
    name?: string | null;
    abn?: string | null;
    terms?: string | null;
    credit?: any;
    dmsConfig?: Record<string, any> | null;
    mpfSource?: string | null;
    [key: string]: any;
}

function creditLabel(v: any): string {
    if (v == null || v === '') return '—';
    if (typeof v === 'number') return `$${v.toLocaleString()}`;
    return String(v);
}

function dmsValueLabel(v: any): string {
    if (v == null || v === '') return '—';
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
}

export function SuppliersManager({ organisationId }: { organisationId: string }) {
    const firestore = useFirestore();
    const { toast } = useToast();

    // No orderBy (CLAUDE.md lesson) — sort client-side. silent:true so a
    // rules gap degrades to the empty state instead of white-screening.
    const suppliersRef = useMemoFirebase(
        () => collection(firestore, 'organisations', organisationId, 'suppliers'),
        [firestore, organisationId],
    );
    const { data: suppliers, isLoading } = useCollection<Supplier>(suppliersRef, { silent: true });

    const [search, setSearch] = useState('');
    const [editorOpen, setEditorOpen] = useState(false);
    const [editing, setEditing] = useState<Supplier | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
    const [deleting, setDeleting] = useState(false);

    const filtered = useMemo(() => {
        const list = [...(suppliers ?? [])].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
        const q = search.trim().toLowerCase();
        if (!q) return list;
        return list.filter(s =>
            [s.name, s.supplierId, s.abn, s.terms, s.mpfSource]
                .some(f => (f ?? '').toLowerCase().includes(q)),
        );
    }, [suppliers, search]);

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await deleteDoc(doc(firestore, 'organisations', organisationId, 'suppliers', deleteTarget.id));
            toast({ title: 'Supplier removed', description: deleteTarget.name ?? deleteTarget.supplierId ?? deleteTarget.id });
            setDeleteTarget(null);
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Failed to remove supplier' });
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
                            <Building2 className="h-4 w-4" />
                            Suppliers
                        </CardTitle>
                        <CardDescription className="text-xs">
                            MPF-sourced supplier registry — trading terms, credit and DMS configuration.
                            DMS settings round-trip via the MPF import and are read-only here.
                        </CardDescription>
                    </div>
                    <Button size="sm" onClick={() => { setEditing(null); setEditorOpen(true); }} className="rounded-xl">
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add supplier
                    </Button>
                </div>
                <div className="relative pt-2 max-w-sm">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search name, ID, ABN…"
                        className="pl-8 h-9 rounded-xl"
                    />
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex items-center justify-center py-12 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        <span className="text-xs">Loading suppliers…</span>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center gap-2 border-2 border-dashed rounded-2xl text-muted-foreground">
                        <Building2 className="h-8 w-8 opacity-30" />
                        <p className="text-xs font-semibold">
                            {suppliers && suppliers.length > 0
                                ? 'No suppliers match your search.'
                                : 'No suppliers yet. They arrive via the MPF import, or add one manually.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-xl border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-[10px] uppercase tracking-widest">Supplier ID</TableHead>
                                    <TableHead className="text-[10px] uppercase tracking-widest">Name</TableHead>
                                    <TableHead className="text-[10px] uppercase tracking-widest">ABN</TableHead>
                                    <TableHead className="text-[10px] uppercase tracking-widest">Terms</TableHead>
                                    <TableHead className="text-right text-[10px] uppercase tracking-widest">Credit</TableHead>
                                    <TableHead className="text-[10px] uppercase tracking-widest">DMS</TableHead>
                                    <TableHead className="w-20" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filtered.map(s => {
                                    const dmsKeys = s.dmsConfig && typeof s.dmsConfig === 'object' ? Object.keys(s.dmsConfig).length : 0;
                                    return (
                                        <TableRow key={s.id}>
                                            <TableCell className="font-mono text-xs font-semibold">{s.supplierId ?? '—'}</TableCell>
                                            <TableCell className="text-xs">
                                                <span className="font-semibold">{s.name ?? '—'}</span>
                                                {s.mpfSource && (
                                                    <Badge variant="outline" className="ml-2 text-[9px] font-bold uppercase text-muted-foreground">
                                                        MPF · {s.mpfSource}
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-xs tabular-nums">{s.abn ?? '—'}</TableCell>
                                            <TableCell className="text-xs">{s.terms ?? '—'}</TableCell>
                                            <TableCell className="text-right text-xs tabular-nums">{creditLabel(s.credit)}</TableCell>
                                            <TableCell className="text-xs">
                                                {dmsKeys > 0 ? (
                                                    <Badge variant="outline" className="text-[9px] font-bold">{dmsKeys} setting{dmsKeys === 1 ? '' : 's'}</Badge>
                                                ) : '—'}
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

            <SupplierEditor
                open={editorOpen}
                onOpenChange={setEditorOpen}
                organisationId={organisationId}
                editing={editing}
            />

            <AlertDialog open={deleteTarget !== null} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete supplier?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This permanently removes <strong>{deleteTarget?.name ?? deleteTarget?.supplierId ?? ''}</strong> from
                            the supplier registry. This cannot be undone. A future MPF import can recreate it.
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

function SupplierEditor({
    open, onOpenChange, organisationId, editing,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    organisationId: string;
    editing: Supplier | null;
}) {
    const firestore = useFirestore();
    const { toast } = useToast();

    const [supplierId, setSupplierId] = useState('');
    const [name, setName] = useState('');
    const [abn, setAbn] = useState('');
    const [terms, setTerms] = useState('');
    const [credit, setCredit] = useState('');
    const [saving, setSaving] = useState(false);

    const isEdit = editing !== null;

    useEffect(() => {
        if (!open) return;
        const parsed = editing ? supplierSchema.safeParse(editing) : null;
        const src: any = parsed?.success ? parsed.data : (editing ?? {});
        setSupplierId(src.supplierId ?? '');
        setName(src.name ?? '');
        setAbn(src.abn ?? '');
        setTerms(src.terms ?? '');
        setCredit(src.credit != null ? String(src.credit) : '');
    }, [open, editing]);

    const handleSave = async () => {
        if (!name.trim() && !supplierId.trim()) {
            toast({ variant: 'destructive', title: 'Supplier name or ID required' });
            return;
        }
        setSaving(true);
        try {
            // Credit is tolerant — a plain number saves as a number, anything
            // else ("30 days", "COD $5k") saves as the raw string.
            const creditTrim = credit.trim();
            const creditNum = parseFloat(creditTrim.replace(/[$,\s]/g, ''));
            const creditValue = creditTrim === ''
                ? null
                : (Number.isFinite(creditNum) && /^[\d$,.\s]+$/.test(creditTrim) ? creditNum : creditTrim);

            const payload = {
                supplierId: supplierId.trim() || null,
                name: name.trim() || null,
                abn: abn.trim() || null,
                terms: terms.trim() || null,
                credit: creditValue,
                updatedAt: serverTimestamp(),
            };
            if (isEdit && editing) {
                // updateDoc merges — dmsConfig{} / mpfSource untouched.
                await updateDoc(doc(firestore, 'organisations', organisationId, 'suppliers', editing.id), payload);
                toast({ title: 'Supplier updated', description: name.trim() || supplierId.trim() });
            } else {
                await addDoc(collection(firestore, 'organisations', organisationId, 'suppliers'), {
                    ...payload,
                    dmsConfig: {},
                    mpfSource: null,
                    createdAt: serverTimestamp(),
                });
                toast({ title: 'Supplier added', description: name.trim() || supplierId.trim() });
            }
            onOpenChange(false);
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Failed to save supplier' });
        } finally {
            setSaving(false);
        }
    };

    const dmsEntries = editing?.dmsConfig && typeof editing.dmsConfig === 'object'
        ? Object.entries(editing.dmsConfig)
        : [];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{isEdit ? 'Edit supplier' : 'Add supplier'}</DialogTitle>
                    <DialogDescription className="text-xs">
                        Trading details for a parts / rigging supplier. DMS configuration comes from the MPF import and is read-only.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Supplier ID</label>
                            <Input value={supplierId} onChange={e => setSupplierId(e.target.value)} placeholder="e.g., SUP-042" className="rounded-xl border-2 h-9 font-mono" />
                        </div>
                        <div className="space-y-1.5 md:col-span-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Name</label>
                            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Sam Allen Wholesale" className="rounded-xl border-2 h-9" autoFocus />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">ABN</label>
                            <Input value={abn} onChange={e => setAbn(e.target.value)} placeholder="e.g., 53 004 085 616" className="rounded-xl border-2 h-9 tabular-nums" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Terms</label>
                            <Input value={terms} onChange={e => setTerms(e.target.value)} placeholder="e.g., 30 days EOM" className="rounded-xl border-2 h-9" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Credit</label>
                            <Input value={credit} onChange={e => setCredit(e.target.value)} placeholder="e.g., 50000 or COD" className="rounded-xl border-2 h-9" />
                        </div>
                    </div>

                    {isEdit && dmsEntries.length > 0 && (
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                DMS configuration — read-only, from MPF import
                            </label>
                            <div className="rounded-xl border bg-slate-50/50 divide-y max-h-40 overflow-y-auto">
                                {dmsEntries.map(([k, v]) => (
                                    <div key={k} className="flex items-center justify-between gap-4 px-3 py-1.5">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{k}</span>
                                        <span className="text-xs text-slate-700 truncate max-w-[14rem]">{dmsValueLabel(v)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="rounded-xl">Cancel</Button>
                    <Button onClick={handleSave} disabled={saving} className="rounded-xl">
                        {saving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                        {isEdit ? 'Save changes' : 'Add supplier'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

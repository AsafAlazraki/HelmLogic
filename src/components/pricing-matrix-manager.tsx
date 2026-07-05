
'use client';

/**
 * PricingMatrixManager — MPF Data admin surface (read-mostly).
 *
 * Org-level pricing matrix imported from the MPF workbook — one row per
 * franchise / pricing key with markup or margin percentages and trade
 * tiers. Lives at `organisations/{orgId}/pricingMatrix/{docId}`.
 *
 * MPF pricing-matrix rows VARY in shape (some carry markupPct, others
 * marginPct, others tradeTiers maps), so the detail view is a tolerant
 * key/value renderer over the whole document. Only the basic fields
 * (franchise/key, markupPct, marginPct, notes) are editable — everything
 * else round-trips via the MPF import.
 *
 * Reads use `useCollection(ref, { silent: true })` so a missing rule on
 * this path degrades to the empty state, never the global error boundary.
 * Delete confirms via AlertDialog per tasks/CONVENTIONS.md.
 */

import { useMemo, useState, useEffect } from 'react';
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { z } from 'zod';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
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
import { Plus, Pencil, Trash2, Grid3X3, Loader2, Search } from 'lucide-react';
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

const pricingMatrixSchema = z.object({
    franchise: looseString.optional(),
    key: looseString.optional(),
    markupPct: looseNumber.optional(),
    marginPct: looseNumber.optional(),
    tradeTiers: z.any().optional().nullable(),
    notes: looseString.optional(),
    mpfSource: looseString.optional(),
}).passthrough();

interface PricingMatrixRow {
    id: string;
    franchise?: string | null;
    key?: string | null;
    markupPct?: number | null;
    marginPct?: number | null;
    tradeTiers?: any;
    notes?: string | null;
    mpfSource?: string | null;
    [key: string]: any;
}

/** Bookkeeping fields hidden from the tolerant key/value detail view. */
const HIDDEN_DETAIL_KEYS = new Set(['id', 'createdAt', 'updatedAt']);

function rowLabel(row: PricingMatrixRow): string {
    // MPF-imported rows (import-service-config.py) carry `brand` +
    // `franchiseCode`, not `franchise`/`key` — fall back so the table
    // shows "Surtees · 9SR" instead of the raw doc id slug.
    if (row.franchise || row.key) return row.franchise || row.key!;
    if (row.brand) return row.franchiseCode ? `${row.brand} · ${row.franchiseCode}` : row.brand;
    return row.id;
}

function pct(v: number | null | undefined): string {
    return v != null ? `${v}%` : '—';
}

/** MPF fraction fields (sellMarkup 0.21 = 21%) → whole percent for display. */
function pctFromFraction(v: number | null | undefined): number | null {
    return typeof v === 'number' && Number.isFinite(v) ? Number((v * 100).toFixed(2)) : null;
}

function detailValueLabel(v: any): string {
    if (v == null || v === '') return '—';
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (typeof v === 'number') return v.toLocaleString();
    if (typeof v === 'object') {
        if (typeof (v as any).toDate === 'function') return (v as any).toDate().toLocaleString();
        return JSON.stringify(v, null, 0);
    }
    return String(v);
}

export function PricingMatrixManager({ organisationId }: { organisationId: string }) {
    const firestore = useFirestore();
    const { toast } = useToast();

    // No orderBy (CLAUDE.md lesson) — sort client-side. silent:true so a
    // rules gap degrades to the empty state instead of white-screening.
    const matrixRef = useMemoFirebase(
        () => collection(firestore, 'organisations', organisationId, 'pricingMatrix'),
        [firestore, organisationId],
    );
    const { data: rows, isLoading } = useCollection<PricingMatrixRow>(matrixRef, { silent: true });

    const [search, setSearch] = useState('');
    const [editorOpen, setEditorOpen] = useState(false);
    const [editing, setEditing] = useState<PricingMatrixRow | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<PricingMatrixRow | null>(null);
    const [deleting, setDeleting] = useState(false);

    const filtered = useMemo(() => {
        const list = [...(rows ?? [])].sort((a, b) => rowLabel(a).localeCompare(rowLabel(b)));
        const q = search.trim().toLowerCase();
        if (!q) return list;
        return list.filter(r =>
            [r.franchise, r.key, r.notes, r.mpfSource]
                .some(f => (f ?? '').toLowerCase().includes(q)),
        );
    }, [rows, search]);

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await deleteDoc(doc(firestore, 'organisations', organisationId, 'pricingMatrix', deleteTarget.id));
            toast({ title: 'Pricing matrix row removed', description: rowLabel(deleteTarget) });
            setDeleteTarget(null);
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Failed to remove pricing matrix row' });
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
                            <Grid3X3 className="h-4 w-4" />
                            Pricing Matrix
                        </CardTitle>
                        <CardDescription className="text-xs">
                            MPF-sourced markup / margin rules per franchise. Rows vary in shape — open a row to see
                            every imported field. Only the basics (key, markup %, margin %, notes) are editable here;
                            trade tiers round-trip via the MPF import.
                        </CardDescription>
                    </div>
                    <Button size="sm" onClick={() => { setEditing(null); setEditorOpen(true); }} className="rounded-xl">
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add row
                    </Button>
                </div>
                <div className="relative pt-2 max-w-sm">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search franchise, key, notes…"
                        className="pl-8 h-9 rounded-xl"
                    />
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex items-center justify-center py-12 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        <span className="text-xs">Loading pricing matrix…</span>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center gap-2 border-2 border-dashed rounded-2xl text-muted-foreground">
                        <Grid3X3 className="h-8 w-8 opacity-30" />
                        <p className="text-xs font-semibold">
                            {rows && rows.length > 0
                                ? 'No rows match your search.'
                                : 'No pricing matrix rows yet. They arrive via the MPF import, or add one manually.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-xl border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-[10px] uppercase tracking-widest">Franchise / Key</TableHead>
                                    <TableHead className="text-right text-[10px] uppercase tracking-widest">Markup %</TableHead>
                                    <TableHead className="text-right text-[10px] uppercase tracking-widest">Margin %</TableHead>
                                    <TableHead className="text-[10px] uppercase tracking-widest">Trade Tiers</TableHead>
                                    <TableHead className="text-[10px] uppercase tracking-widest">Notes</TableHead>
                                    <TableHead className="w-20" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filtered.map(row => {
                                    const tierCount = row.tradeTiers && typeof row.tradeTiers === 'object'
                                        ? (Array.isArray(row.tradeTiers) ? row.tradeTiers.length : Object.keys(row.tradeTiers).length)
                                        : 0;
                                    return (
                                        <TableRow key={row.id}>
                                            <TableCell className="text-xs">
                                                <span className="font-semibold">{rowLabel(row)}</span>
                                                {row.mpfSource && (
                                                    <Badge variant="outline" className="ml-2 text-[9px] font-bold uppercase text-muted-foreground">
                                                        MPF · {row.mpfSource}
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            {/* MPF-imported rows carry fraction fields (sellMarkup /
                                                dealerFitMarkup / tradeDiscount / subDealerDiscount)
                                                instead of markupPct / marginPct / tradeTiers — fall
                                                back so the table isn't a wall of em-dashes. */}
                                            <TableCell className="text-right text-xs tabular-nums font-semibold">{pct(row.markupPct ?? pctFromFraction(row.sellMarkup))}</TableCell>
                                            <TableCell className="text-right text-xs tabular-nums font-semibold">{pct(row.marginPct)}</TableCell>
                                            <TableCell className="text-xs">
                                                {tierCount > 0 ? (
                                                    <Badge variant="outline" className="text-[9px] font-bold">{tierCount} tier{tierCount === 1 ? '' : 's'}</Badge>
                                                ) : (() => {
                                                    // NaN survives the Firestore round-trip on some MPF
                                                    // rows — only render finite discounts.
                                                    const trade = pctFromFraction(row.tradeDiscount);
                                                    const sub = pctFromFraction(row.subDealerDiscount);
                                                    if (trade == null && sub == null) return '—';
                                                    return (
                                                        <span className="tabular-nums text-muted-foreground">
                                                            {trade != null && `Trade −${trade}%`}
                                                            {trade != null && sub != null && ' · '}
                                                            {sub != null && `Sub-dealer −${sub}%`}
                                                        </span>
                                                    );
                                                })()}
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground max-w-[16rem] truncate">{row.notes ?? '—'}</TableCell>
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
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>

            <PricingMatrixEditor
                open={editorOpen}
                onOpenChange={setEditorOpen}
                organisationId={organisationId}
                editing={editing}
            />

            <AlertDialog open={deleteTarget !== null} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete pricing matrix row?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This permanently removes the pricing rule for <strong>{deleteTarget ? rowLabel(deleteTarget) : ''}</strong>.
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

function PricingMatrixEditor({
    open, onOpenChange, organisationId, editing,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    organisationId: string;
    editing: PricingMatrixRow | null;
}) {
    const firestore = useFirestore();
    const { toast } = useToast();

    const [franchise, setFranchise] = useState('');
    const [markupPct, setMarkupPct] = useState('');
    const [marginPct, setMarginPct] = useState('');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);

    const isEdit = editing !== null;

    useEffect(() => {
        if (!open) return;
        const parsed = editing ? pricingMatrixSchema.safeParse(editing) : null;
        const src: any = parsed?.success ? parsed.data : (editing ?? {});
        setFranchise(src.franchise ?? src.key ?? '');
        setMarkupPct(src.markupPct != null ? String(src.markupPct) : '');
        setMarginPct(src.marginPct != null ? String(src.marginPct) : '');
        setNotes(src.notes ?? '');
    }, [open, editing]);

    const num = (s: string): number | null => {
        if (s.trim() === '') return null;
        const n = parseFloat(s.replace(/[%,\s]/g, ''));
        return Number.isFinite(n) ? n : null;
    };

    const handleSave = async () => {
        if (!franchise.trim()) {
            toast({ variant: 'destructive', title: 'Franchise / key required' });
            return;
        }
        setSaving(true);
        try {
            const payload = {
                franchise: franchise.trim(),
                markupPct: num(markupPct),
                marginPct: num(marginPct),
                notes: notes.trim() || null,
                updatedAt: serverTimestamp(),
            };
            if (isEdit && editing) {
                // updateDoc merges — tradeTiers / mpfSource / variant fields untouched.
                await updateDoc(doc(firestore, 'organisations', organisationId, 'pricingMatrix', editing.id), payload);
                toast({ title: 'Pricing matrix row updated', description: franchise.trim() });
            } else {
                await addDoc(collection(firestore, 'organisations', organisationId, 'pricingMatrix'), {
                    ...payload,
                    mpfSource: null,
                    createdAt: serverTimestamp(),
                });
                toast({ title: 'Pricing matrix row added', description: franchise.trim() });
            }
            onOpenChange(false);
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Failed to save pricing matrix row' });
        } finally {
            setSaving(false);
        }
    };

    // Tolerant key/value dump of everything the import wrote — rows vary
    // in shape, so we show the full doc rather than guessing columns.
    const detailEntries = useMemo(() => {
        if (!editing) return [] as [string, any][];
        return Object.entries(editing)
            .filter(([k]) => !HIDDEN_DETAIL_KEYS.has(k))
            .sort(([a], [b]) => a.localeCompare(b));
    }, [editing]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{isEdit ? 'Edit pricing matrix row' : 'Add pricing matrix row'}</DialogTitle>
                    <DialogDescription className="text-xs">
                        Markup / margin percentages apply to GST-exclusive prices. Trade tiers and other imported
                        fields are read-only — they round-trip via the MPF import.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Franchise / key</label>
                        <Input value={franchise} onChange={e => setFranchise(e.target.value)} placeholder="e.g., Yamaha Parts" className="rounded-xl border-2 h-9" autoFocus />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Markup %</label>
                            <Input type="number" inputMode="decimal" step="0.1" value={markupPct} onChange={e => setMarkupPct(e.target.value)} placeholder="e.g., 25" className="rounded-xl border-2 h-9 tabular-nums" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Margin %</label>
                            <Input type="number" inputMode="decimal" step="0.1" value={marginPct} onChange={e => setMarginPct(e.target.value)} placeholder="e.g., 20" className="rounded-xl border-2 h-9 tabular-nums" />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Notes</label>
                        <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Operator notes on this pricing rule" className="rounded-xl border-2 text-xs" rows={2} />
                    </div>

                    {isEdit && detailEntries.length > 0 && (
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                All imported fields — read-only
                            </label>
                            <div className="rounded-xl border bg-slate-50/50 divide-y max-h-48 overflow-y-auto">
                                {detailEntries.map(([k, v]) => (
                                    <div key={k} className="flex items-start justify-between gap-4 px-3 py-1.5">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 shrink-0">{k}</span>
                                        <span className="text-xs text-slate-700 break-all text-right">{detailValueLabel(v)}</span>
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
                        {isEdit ? 'Save changes' : 'Add row'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

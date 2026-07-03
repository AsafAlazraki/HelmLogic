
'use client';

/**
 * RiggingKitsManager — MPF Data admin surface.
 *
 * Org-level catalogue of rigging kits imported from the MPF workbook.
 * Lives at `organisations/{orgId}/riggingKits/{kitId}`.
 *
 * Mirrors the FitUpCatalogManager / ServiceCatalogManager admin pattern:
 * table list + search + add/edit dialog + AlertDialog delete confirm
 * (per tasks/CONVENTIONS.md — no browser confirm()).
 *
 * Reads use `useCollection(ref, { silent: true })` so a missing rule on
 * this path degrades this tab to its empty state instead of
 * white-screening the app (v1.10 FirebaseErrorListener lesson).
 *
 * Zod schema is fully permissive per CLAUDE.md — every field
 * optional().nullable(), object passthrough(). MPF-imported docs vary;
 * validation is a safety net, never a gatekeeper. Nested `components[]`
 * + `inclusionFlags{}` render read-only — they round-trip via the MPF
 * import, not this dialog.
 *
 * All prices are GST-exclusive (`sellPriceExclGst` convention).
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
import { Plus, Pencil, Trash2, Anchor, Loader2, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// ── Permissive parsing helpers (CLAUDE.md: legacy/imported docs WILL
//    have missing / null / string-typed-number fields) ────────────────
const looseNumber = z.preprocess(v => {
    if (v == null || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,\s]/g, ''));
    return Number.isFinite(n) ? n : null;
}, z.number().nullable()).catch(null);

const looseString = z.preprocess(
    v => (v == null ? null : String(v)),
    z.string().nullable(),
).catch(null);

const riggingKitSchema = z.object({
    partNo: looseString.optional(),
    name: looseString.optional(),
    desc: looseString.optional(),
    section: looseString.optional(),
    dealerCost: looseNumber.optional(),
    freight: looseNumber.optional(),
    kitCtd: looseNumber.optional(),
    retailExGst: looseNumber.optional(),
    tradeExGst: looseNumber.optional(),
    subDealerExGst: looseNumber.optional(),
    installHrs: looseNumber.optional(),
    components: z.array(z.any()).optional().nullable().default([]),
    inclusionFlags: z.record(z.any()).optional().nullable().default({}),
    mpfSource: looseString.optional(),
}).passthrough();

interface RiggingKit {
    id: string;
    partNo?: string | null;
    name?: string | null;
    desc?: string | null;
    section?: string | null;
    dealerCost?: number | null;
    freight?: number | null;
    kitCtd?: number | null;
    retailExGst?: number | null;
    tradeExGst?: number | null;
    subDealerExGst?: number | null;
    installHrs?: number | null;
    components?: any[] | null;
    inclusionFlags?: Record<string, any> | null;
    mpfSource?: string | null;
    [key: string]: any;
}

function kitLabel(kit: RiggingKit): string {
    return kit.name || kit.desc || kit.partNo || kit.id;
}

function money(v: number | null | undefined): string {
    return v != null ? formatCurrency(v) : '—';
}

/** Tolerant renderer for a components[] entry — string or object. */
function componentLabel(c: any): string {
    if (c == null) return '—';
    if (typeof c === 'string') return c;
    if (typeof c === 'object') {
        const parts = [c.partNo ?? c.partNumber ?? c.code, c.desc ?? c.description ?? c.name, c.qty != null ? `× ${c.qty}` : null]
            .filter(Boolean);
        return parts.length > 0 ? parts.join(' · ') : JSON.stringify(c);
    }
    return String(c);
}

export function RiggingKitsManager({ organisationId }: { organisationId: string }) {
    const firestore = useFirestore();
    const { toast } = useToast();

    // No orderBy — orderBy silently excludes docs missing the field
    // (CLAUDE.md lesson). Sort client-side. silent:true — a rules gap
    // degrades to the empty state, never the global error boundary.
    const kitsRef = useMemoFirebase(
        () => collection(firestore, 'organisations', organisationId, 'riggingKits'),
        [firestore, organisationId],
    );
    const { data: kits, isLoading } = useCollection<RiggingKit>(kitsRef, { silent: true });

    const [search, setSearch] = useState('');
    const [editorOpen, setEditorOpen] = useState(false);
    const [editing, setEditing] = useState<RiggingKit | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<RiggingKit | null>(null);
    const [deleting, setDeleting] = useState(false);

    const filtered = useMemo(() => {
        const list = [...(kits ?? [])].sort((a, b) => (a.partNo ?? '').localeCompare(b.partNo ?? ''));
        const q = search.trim().toLowerCase();
        if (!q) return list;
        return list.filter(k =>
            [k.partNo, k.name, k.desc, k.section, k.mpfSource]
                .some(f => (f ?? '').toLowerCase().includes(q)),
        );
    }, [kits, search]);

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await deleteDoc(doc(firestore, 'organisations', organisationId, 'riggingKits', deleteTarget.id));
            toast({ title: 'Rigging kit removed', description: kitLabel(deleteTarget) });
            setDeleteTarget(null);
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Failed to remove rigging kit' });
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
                            <Anchor className="h-4 w-4" />
                            Rigging Kits
                        </CardTitle>
                        <CardDescription className="text-xs">
                            MPF-sourced rigging kit catalogue — dealer cost, freight, CTD and the retail / trade /
                            sub-dealer sell tiers. All prices ex GST. Components + inclusion flags round-trip via
                            the MPF import and are read-only here.
                        </CardDescription>
                    </div>
                    <Button size="sm" onClick={() => { setEditing(null); setEditorOpen(true); }} className="rounded-xl">
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add kit
                    </Button>
                </div>
                <div className="relative pt-2 max-w-sm">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search part no, name, section…"
                        className="pl-8 h-9 rounded-xl"
                    />
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex items-center justify-center py-12 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        <span className="text-xs">Loading rigging kits…</span>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center gap-2 border-2 border-dashed rounded-2xl text-muted-foreground">
                        <Anchor className="h-8 w-8 opacity-30" />
                        <p className="text-xs font-semibold">
                            {kits && kits.length > 0
                                ? 'No rigging kits match your search.'
                                : 'No rigging kits yet. They arrive via the MPF import, or add one manually.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-xl border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-[10px] uppercase tracking-widest">Part No</TableHead>
                                    <TableHead className="text-[10px] uppercase tracking-widest">Name</TableHead>
                                    <TableHead className="text-[10px] uppercase tracking-widest">Section</TableHead>
                                    <TableHead className="text-right text-[10px] uppercase tracking-widest">Dealer Cost (ex GST)</TableHead>
                                    <TableHead className="text-right text-[10px] uppercase tracking-widest">Kit CTD (ex GST)</TableHead>
                                    <TableHead className="text-right text-[10px] uppercase tracking-widest">Retail (ex GST)</TableHead>
                                    <TableHead className="text-right text-[10px] uppercase tracking-widest">Trade (ex GST)</TableHead>
                                    <TableHead className="text-right text-[10px] uppercase tracking-widest">Sub-Dealer (ex GST)</TableHead>
                                    <TableHead className="text-right text-[10px] uppercase tracking-widest">Install Hrs</TableHead>
                                    <TableHead className="w-20" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filtered.map(kit => (
                                    <TableRow key={kit.id}>
                                        <TableCell className="font-mono text-xs font-semibold">{kit.partNo ?? '—'}</TableCell>
                                        <TableCell className="text-xs max-w-[16rem]">
                                            <span className="truncate block font-semibold">{kit.name ?? kit.desc ?? '—'}</span>
                                            {kit.mpfSource && (
                                                <Badge variant="outline" className="mt-0.5 text-[9px] font-bold uppercase text-muted-foreground">
                                                    MPF · {kit.mpfSource}
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-xs">{kit.section ?? '—'}</TableCell>
                                        <TableCell className="text-right text-xs tabular-nums">{money(kit.dealerCost)}</TableCell>
                                        <TableCell className="text-right text-xs tabular-nums">{money(kit.kitCtd)}</TableCell>
                                        <TableCell className="text-right text-xs tabular-nums font-semibold">{money(kit.retailExGst)}</TableCell>
                                        <TableCell className="text-right text-xs tabular-nums">{money(kit.tradeExGst)}</TableCell>
                                        <TableCell className="text-right text-xs tabular-nums">{money(kit.subDealerExGst)}</TableCell>
                                        <TableCell className="text-right text-xs tabular-nums">{kit.installHrs ?? '—'}</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1 justify-end">
                                                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => { setEditing(kit); setEditorOpen(true); }}>
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" onClick={() => setDeleteTarget(kit)}>
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

            <RiggingKitEditor
                open={editorOpen}
                onOpenChange={setEditorOpen}
                organisationId={organisationId}
                editing={editing}
            />

            <AlertDialog open={deleteTarget !== null} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete rigging kit?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This permanently removes <strong>{deleteTarget ? kitLabel(deleteTarget) : ''}</strong> from the
                            rigging-kit catalogue. This cannot be undone. A future MPF import can recreate it.
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

function RiggingKitEditor({
    open, onOpenChange, organisationId, editing,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    organisationId: string;
    editing: RiggingKit | null;
}) {
    const firestore = useFirestore();
    const { toast } = useToast();

    const [partNo, setPartNo] = useState('');
    const [name, setName] = useState('');
    const [section, setSection] = useState('');
    const [dealerCost, setDealerCost] = useState('');
    const [freight, setFreight] = useState('');
    const [kitCtd, setKitCtd] = useState('');
    const [retailExGst, setRetailExGst] = useState('');
    const [tradeExGst, setTradeExGst] = useState('');
    const [subDealerExGst, setSubDealerExGst] = useState('');
    const [installHrs, setInstallHrs] = useState('');
    const [saving, setSaving] = useState(false);

    const isEdit = editing !== null;

    useEffect(() => {
        if (!open) return;
        // Permissive zod normalisation — never blocks; falls back to raw doc.
        const parsed = editing ? riggingKitSchema.safeParse(editing) : null;
        const src: any = parsed?.success ? parsed.data : (editing ?? {});
        setPartNo(src.partNo ?? '');
        setName(src.name ?? src.desc ?? '');
        setSection(src.section ?? '');
        setDealerCost(src.dealerCost != null ? String(src.dealerCost) : '');
        setFreight(src.freight != null ? String(src.freight) : '');
        setKitCtd(src.kitCtd != null ? String(src.kitCtd) : '');
        setRetailExGst(src.retailExGst != null ? String(src.retailExGst) : '');
        setTradeExGst(src.tradeExGst != null ? String(src.tradeExGst) : '');
        setSubDealerExGst(src.subDealerExGst != null ? String(src.subDealerExGst) : '');
        setInstallHrs(src.installHrs != null ? String(src.installHrs) : '');
    }, [open, editing]);

    const num = (s: string): number | null => {
        if (s.trim() === '') return null;
        const n = parseFloat(s.replace(/[$,\s]/g, ''));
        return Number.isFinite(n) ? n : null;
    };

    const handleSave = async () => {
        if (!partNo.trim() && !name.trim()) {
            toast({ variant: 'destructive', title: 'Part No or Name required' });
            return;
        }
        setSaving(true);
        try {
            const payload = {
                partNo: partNo.trim() || null,
                name: name.trim() || null,
                section: section.trim() || null,
                dealerCost: num(dealerCost),
                freight: num(freight),
                kitCtd: num(kitCtd),
                retailExGst: num(retailExGst),
                tradeExGst: num(tradeExGst),
                subDealerExGst: num(subDealerExGst),
                installHrs: num(installHrs),
                updatedAt: serverTimestamp(),
            };
            if (isEdit && editing) {
                // updateDoc merges — components[] / inclusionFlags{} / mpfSource untouched.
                await updateDoc(doc(firestore, 'organisations', organisationId, 'riggingKits', editing.id), payload);
                toast({ title: 'Rigging kit updated', description: kitLabel({ ...editing, ...payload } as RiggingKit) });
            } else {
                await addDoc(collection(firestore, 'organisations', organisationId, 'riggingKits'), {
                    ...payload,
                    components: [],
                    inclusionFlags: {},
                    mpfSource: null,
                    createdAt: serverTimestamp(),
                });
                toast({ title: 'Rigging kit added', description: name.trim() || partNo.trim() });
            }
            onOpenChange(false);
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Failed to save rigging kit' });
        } finally {
            setSaving(false);
        }
    };

    const components: any[] = Array.isArray(editing?.components) ? editing!.components! : [];
    const inclusionFlags = editing?.inclusionFlags && typeof editing.inclusionFlags === 'object'
        ? Object.entries(editing.inclusionFlags)
        : [];

    const priceField = (label: string, value: string, setter: (v: string) => void) => (
        <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</label>
            <Input
                type="number" inputMode="decimal" min="0" step="0.01"
                value={value} onChange={e => setter(e.target.value)}
                placeholder="0.00" className="rounded-xl border-2 h-9 tabular-nums"
            />
        </div>
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{isEdit ? 'Edit rigging kit' : 'Add rigging kit'}</DialogTitle>
                    <DialogDescription className="text-xs">
                        All prices are GST-exclusive. Components + inclusion flags come from the MPF import and are read-only.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Part No</label>
                            <Input value={partNo} onChange={e => setPartNo(e.target.value)} placeholder="e.g., RK-F150-01" className="rounded-xl border-2 h-9 font-mono" />
                        </div>
                        <div className="space-y-1.5 md:col-span-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Name / Description</label>
                            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., F150 single-station rigging kit" className="rounded-xl border-2 h-9" />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Section</label>
                            <Input value={section} onChange={e => setSection(e.target.value)} placeholder="e.g., Controls" className="rounded-xl border-2 h-9" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Install hours</label>
                            <Input type="number" inputMode="decimal" min="0" step="0.1" value={installHrs} onChange={e => setInstallHrs(e.target.value)} placeholder="0.0" className="rounded-xl border-2 h-9 tabular-nums" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {priceField('Dealer cost ($ ex GST)', dealerCost, setDealerCost)}
                        {priceField('Freight ($ ex GST)', freight, setFreight)}
                        {priceField('Kit CTD ($ ex GST)', kitCtd, setKitCtd)}
                        {priceField('Retail ($ ex GST)', retailExGst, setRetailExGst)}
                        {priceField('Trade ($ ex GST)', tradeExGst, setTradeExGst)}
                        {priceField('Sub-dealer ($ ex GST)', subDealerExGst, setSubDealerExGst)}
                    </div>

                    {isEdit && components.length > 0 && (
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                Components ({components.length}) — read-only, from MPF import
                            </label>
                            <div className="rounded-xl border bg-slate-50/50 p-2 max-h-40 overflow-y-auto space-y-1">
                                {components.map((c, i) => (
                                    <p key={i} className="text-xs text-slate-700">{componentLabel(c)}</p>
                                ))}
                            </div>
                        </div>
                    )}

                    {isEdit && inclusionFlags.length > 0 && (
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                Inclusion flags — read-only, from MPF import
                            </label>
                            <div className="flex flex-wrap gap-1.5">
                                {inclusionFlags.map(([k, v]) => (
                                    <Badge key={k} variant="outline" className="text-[10px] font-semibold">
                                        {k}: {v === true ? 'Yes' : v === false ? 'No' : String(v)}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="rounded-xl">Cancel</Button>
                    <Button onClick={handleSave} disabled={saving} className="rounded-xl">
                        {saving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                        {isEdit ? 'Save changes' : 'Add kit'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

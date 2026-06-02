
'use client';

/**
 * ServiceCatalogManager (v1.10 Phase C — Epic 11.1.1 + 11.1.2).
 *
 * Org-level service quoting catalogue. Two sister collections:
 *   - organisations/{orgId}/serviceOperations/{opId}   — labor codes
 *   - organisations/{orgId}/serviceParts/{partId}      — parts catalog
 *
 * Built as the foundation for Epic 11 Service Quoting absorption from
 * NSM-Hub. The service-quote flow itself (Epic 11.2.x — create form,
 * dashboard, PDF, lifecycle) consumes this catalogue. Migration
 * tooling (Epic 11.3.x — customer reconciliation + cutover) writes
 * historical data into these collections during the zero-downtime
 * migration window.
 *
 * Mirrors the FitUpCatalogManager pattern (one component file per
 * collection-pair, same CRUD shape, same bulk + CSV semantics) so
 * a reader who learned one learns both. Diverges only where the
 * shape needs to:
 *   - Operations carry `flatRateHours + hourlyRate` and derive
 *     sellPrice as `flatRateHours × hourlyRate` if no override.
 *   - Parts carry `partNumber` as the natural key (versus the
 *     operations key being `code`).
 *
 * CSV import follows the v1.4 + v1.10 fit-up upsert-by-natural-key
 * pattern (priority list of name aliases, never clear-and-replace).
 * Bulk markup overwrites sellPrice with destructive-action copy in
 * the confirm dialog, same as fit-up.
 *
 * v1.10 OUT OF SCOPE (deferred to v1.11+):
 *   - 11.2.x service-quote create form + dashboard + PDF + lifecycle
 *   - 11.3.x customer reconciliation + NSM-Hub migration
 *   - 11.4.x service-quote rules + permissions hardening
 */

import { useMemo, useState, useEffect } from 'react';
import { addDoc, collection, deleteDoc, doc, orderBy, query, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Wrench, Package, Loader2, Upload, Download, Percent } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ServiceOperation {
    id: string;
    code: string;
    name: string;
    flatRateHours: number;
    hourlyRate: number;
    cost?: number | null;
    sellPrice?: number | null;
    notes?: string | null;
    createdAt?: any;
    updatedAt?: any;
}

interface ServicePart {
    id: string;
    partNumber: string;
    name: string;
    cost: number;
    sellPrice?: number | null;
    stockLevel?: number | null;
    notes?: string | null;
    createdAt?: any;
    updatedAt?: any;
}

interface ServiceCatalogManagerProps {
    organisationId: string;
}

const OP_CODE_KEYS = ['code', 'op code', 'operation code', 'labor code', 'labour code'];
const OP_NAME_KEYS = ['name', 'operation', 'description', 'title'];
const OP_HOURS_KEYS = ['hours', 'flat rate hours', 'fr hours', 'flatratehours'];
const OP_RATE_KEYS = ['rate', 'hourly rate', 'rate per hour'];

const PART_NUM_KEYS = ['part number', 'partnumber', 'sku', 'code'];
const PART_NAME_KEYS = ['name', 'description', 'part name', 'title'];

const COST_KEYS = ['cost', 'dealer cost', 'buy', 'buy price'];
const SELL_KEYS = ['sell', 'sell price', 'retail', 'price'];
const NOTES_KEYS = ['notes', 'note', 'comment'];
const STOCK_KEYS = ['stock', 'stock level', 'qty', 'quantity', 'on hand'];

function pickField(row: Record<string, any>, candidates: readonly string[]): any {
    const lowered: Record<string, any> = {};
    for (const [k, v] of Object.entries(row)) lowered[k.toLowerCase().trim()] = v;
    for (const c of candidates) {
        if (c in lowered && lowered[c] != null && lowered[c] !== '') return lowered[c];
    }
    return null;
}

function asNumber(raw: any): number | null {
    if (raw == null || raw === '') return null;
    const cleaned = String(raw).replace(/[$,\s]/g, '');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : null;
}

function derivedOpSell(op: Pick<ServiceOperation, 'flatRateHours' | 'hourlyRate' | 'sellPrice'>): number {
    if (op.sellPrice != null) return op.sellPrice;
    return Math.round((op.flatRateHours ?? 0) * (op.hourlyRate ?? 0) * 100) / 100;
}

export function ServiceCatalogManager({ organisationId }: ServiceCatalogManagerProps) {
    return (
        <Card className="rounded-2xl border-2">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-bold">
                    <Wrench className="h-4 w-4" />
                    Service Catalog
                </CardTitle>
                <CardDescription className="text-xs">
                    Master library for the service-quoting flow. <strong>Operations</strong> are labor codes
                    (flat-rate hours × hourly rate). <strong>Parts</strong> are the parts catalog used by
                    service quotes. The service-quote flow itself (create / dashboard / PDF / lifecycle) ships
                    in Epic 11.2 (v1.11+); migration tooling for NSM-Hub historical data ships in 11.3 / 11.4.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="operations" className="space-y-4">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="operations">
                            <Wrench className="h-3.5 w-3.5 mr-1" /> Operations
                        </TabsTrigger>
                        <TabsTrigger value="parts">
                            <Package className="h-3.5 w-3.5 mr-1" /> Parts
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent value="operations">
                        <ServiceOperationsTab organisationId={organisationId} />
                    </TabsContent>
                    <TabsContent value="parts">
                        <ServicePartsTab organisationId={organisationId} />
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}

// ---------------------------------------------------------------------
// Operations sub-tab
// ---------------------------------------------------------------------

function ServiceOperationsTab({ organisationId }: { organisationId: string }) {
    const firestore = useFirestore();
    const { toast } = useToast();

    const opsRef = useMemoFirebase(
        () => query(collection(firestore, 'organisations', organisationId, 'serviceOperations'), orderBy('code', 'asc')),
        [firestore, organisationId],
    );
    const { data: ops, isLoading } = useCollection<ServiceOperation>(opsRef);

    const [editorOpen, setEditorOpen] = useState(false);
    const [editing, setEditing] = useState<ServiceOperation | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkAction, setBulkAction] = useState<'markup' | 'delete' | null>(null);
    const [importing, setImporting] = useState(false);

    const list = ops ?? [];

    const toggleSelected = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        const allSelected = list.every(o => selectedIds.has(o.id));
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (allSelected) for (const o of list) next.delete(o.id);
            else for (const o of list) next.add(o.id);
            return next;
        });
    };

    const handleDelete = async (op: ServiceOperation) => {
        try {
            await deleteDoc(doc(firestore, 'organisations', organisationId, 'serviceOperations', op.id));
            toast({ title: 'Operation removed', description: op.name });
            setSelectedIds(prev => {
                const next = new Set(prev);
                next.delete(op.id);
                return next;
            });
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Failed to remove operation' });
        }
    };

    const handleExport = () => {
        if (list.length === 0) {
            toast({ variant: 'destructive', title: 'Nothing to export' });
            return;
        }
        const rows = list.map(o => ({
            Code: o.code,
            Name: o.name,
            'Flat Rate Hours': o.flatRateHours,
            'Hourly Rate': o.hourlyRate,
            Cost: o.cost ?? '',
            'Sell Price': o.sellPrice ?? '',
            Notes: o.notes ?? '',
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Service Operations');
        const stamp = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `service-operations-${stamp}.xlsx`);
        toast({ title: 'Exported', description: `${list.length} operation${list.length === 1 ? '' : 's'}.` });
    };

    const handleImport = async (file: File) => {
        setImporting(true);
        try {
            const data = await file.arrayBuffer();
            const wb = XLSX.read(data, { type: 'array' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);
            if (rows.length === 0) {
                toast({ variant: 'destructive', title: 'No rows found' });
                return;
            }

            const byCode = new Map<string, ServiceOperation>();
            for (const op of list) byCode.set(op.code.trim().toUpperCase(), op);

            let updated = 0;
            let created = 0;
            let skipped = 0;
            const writes: Promise<unknown>[] = [];

            for (const row of rows) {
                const codeRaw = pickField(row, OP_CODE_KEYS);
                const code = codeRaw != null ? String(codeRaw).trim() : '';
                if (!code) {
                    skipped++;
                    continue;
                }
                const nameRaw = pickField(row, OP_NAME_KEYS);
                const name = nameRaw != null ? String(nameRaw).trim() : code;
                const flatRateHours = asNumber(pickField(row, OP_HOURS_KEYS)) ?? 0;
                const hourlyRate = asNumber(pickField(row, OP_RATE_KEYS)) ?? 0;
                const cost = asNumber(pickField(row, COST_KEYS));
                const sellPrice = asNumber(pickField(row, SELL_KEYS));
                const notesRaw = pickField(row, NOTES_KEYS);
                const notes = notesRaw != null ? String(notesRaw).trim() : null;

                const existing = byCode.get(code.toUpperCase());
                const payload = {
                    code,
                    name,
                    flatRateHours,
                    hourlyRate,
                    cost,
                    sellPrice,
                    notes: notes || null,
                    updatedAt: serverTimestamp(),
                };
                if (existing) {
                    writes.push(updateDoc(doc(firestore, 'organisations', organisationId, 'serviceOperations', existing.id), payload));
                    updated++;
                } else {
                    writes.push(addDoc(collection(firestore, 'organisations', organisationId, 'serviceOperations'), {
                        ...payload,
                        createdAt: serverTimestamp(),
                    }));
                    created++;
                }
            }

            await Promise.all(writes);
            toast({ title: 'Import complete', description: `${updated} updated · ${created} created · ${skipped} skipped (no code)` });
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Import failed', description: String(err) });
        } finally {
            setImporting(false);
        }
    };

    const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        await handleImport(file);
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs text-muted-foreground">
                    Labor codes for the service-quoting flow. Sell price defaults to <code>flatRateHours × hourlyRate</code> unless overridden.
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={handleExport} className="rounded-xl">
                        <Download className="h-3.5 w-3.5 mr-1" /> Export
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={importing}
                        onClick={e => (e.currentTarget.nextElementSibling as HTMLInputElement | null)?.click()}
                        className="rounded-xl"
                    >
                        {importing ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Importing…</> : <><Upload className="h-3.5 w-3.5 mr-1" /> Import</>}
                    </Button>
                    <input type="file" accept=".csv, .xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" onChange={onFileChange} className="hidden" />
                    <Button size="sm" onClick={() => { setEditing(null); setEditorOpen(true); }} className="rounded-xl">
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add operation
                    </Button>
                </div>
            </div>

            {selectedIds.size > 0 && (
                <div className="flex items-center justify-between p-2 rounded-xl border-2 border-primary/30 bg-primary/5">
                    <p className="text-xs font-bold">{selectedIds.size} selected</p>
                    <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => setBulkAction('markup')} className="rounded-lg h-7 text-xs">
                            <Percent className="h-3 w-3 mr-1" /> Apply markup
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setBulkAction('delete')} className="rounded-lg h-7 text-xs text-destructive">
                            <Trash2 className="h-3 w-3 mr-1" /> Delete
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} className="rounded-lg h-7 text-xs">
                            Clear
                        </Button>
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-4 w-4 animate-spin mr-2" /><span className="text-xs">Loading…</span></div>
            ) : list.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center gap-2 border-2 border-dashed rounded-2xl text-muted-foreground">
                    <Wrench className="h-8 w-8 opacity-30" />
                    <p className="text-xs font-semibold">No operations yet. Add one above or import a sheet.</p>
                </div>
            ) : (
                <div className="space-y-1">
                    <div className="flex items-center gap-3 p-2 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                        <Checkbox checked={list.length > 0 && list.every(o => selectedIds.has(o.id))} onCheckedChange={toggleAll} />
                        <span>Select all</span>
                    </div>
                    {list.map(op => (
                        <div key={op.id} className={`flex items-center justify-between p-3 rounded-xl border ${selectedIds.has(op.id) ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-slate-50 hover:border-slate-200'}`}>
                            <div className="flex items-center gap-3 min-w-0">
                                <Checkbox checked={selectedIds.has(op.id)} onCheckedChange={() => toggleSelected(op.id)} />
                                <Badge variant="outline" className="bg-sky-50 text-sky-800 border-sky-200 text-[10px] font-bold uppercase font-mono">
                                    {op.code}
                                </Badge>
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold truncate">{op.name}</p>
                                    <p className="text-[10px] text-muted-foreground tabular-nums">
                                        {op.flatRateHours.toFixed(2)}h × ${op.hourlyRate.toLocaleString()}/h
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                <div className="text-right">
                                    <p className="text-xs font-bold tabular-nums">
                                        ${derivedOpSell(op).toLocaleString()}
                                        <span className="text-[9px] font-normal text-muted-foreground ml-1">sell</span>
                                    </p>
                                    {op.cost != null && <p className="text-[10px] tabular-nums text-muted-foreground">${op.cost.toLocaleString()} cost</p>}
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => { setEditing(op); setEditorOpen(true); }}>
                                        <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" onClick={() => handleDelete(op)}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <ServiceOperationEditor
                open={editorOpen}
                onOpenChange={setEditorOpen}
                organisationId={organisationId}
                editing={editing}
            />

            <OperationBulkDialog
                action={bulkAction}
                onOpenChange={open => { if (!open) setBulkAction(null); }}
                organisationId={organisationId}
                selectedItems={list.filter(o => selectedIds.has(o.id))}
                onComplete={() => { setBulkAction(null); setSelectedIds(new Set()); }}
            />
        </div>
    );
}

function ServiceOperationEditor({
    open, onOpenChange, organisationId, editing,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    organisationId: string;
    editing: ServiceOperation | null;
}) {
    const firestore = useFirestore();
    const { toast } = useToast();

    const [code, setCode] = useState('');
    const [name, setName] = useState('');
    const [flatRateHours, setFlatRateHours] = useState('');
    const [hourlyRate, setHourlyRate] = useState('');
    const [cost, setCost] = useState('');
    const [sellPrice, setSellPrice] = useState('');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open) {
            setCode(editing?.code ?? '');
            setName(editing?.name ?? '');
            setFlatRateHours(editing?.flatRateHours != null ? String(editing.flatRateHours) : '');
            setHourlyRate(editing?.hourlyRate != null ? String(editing.hourlyRate) : '');
            setCost(editing?.cost != null ? String(editing.cost) : '');
            setSellPrice(editing?.sellPrice != null ? String(editing.sellPrice) : '');
            setNotes(editing?.notes ?? '');
        }
    }, [open, editing]);

    const handleSave = async () => {
        const trimmedCode = code.trim();
        const trimmedName = name.trim();
        if (!trimmedCode || !trimmedName) {
            toast({ variant: 'destructive', title: 'Code and name are required' });
            return;
        }
        const fh = parseFloat(flatRateHours);
        const hr = parseFloat(hourlyRate);
        if (!Number.isFinite(fh) || fh < 0 || !Number.isFinite(hr) || hr < 0) {
            toast({ variant: 'destructive', title: 'Hours and rate must be non-negative numbers' });
            return;
        }
        const parsedCost = cost.trim() === '' ? null : parseFloat(cost);
        const parsedSell = sellPrice.trim() === '' ? null : parseFloat(sellPrice);

        setSaving(true);
        try {
            const payload = {
                code: trimmedCode,
                name: trimmedName,
                flatRateHours: fh,
                hourlyRate: hr,
                cost: parsedCost,
                sellPrice: parsedSell,
                notes: notes.trim() || null,
                updatedAt: serverTimestamp(),
            };
            if (editing) {
                await updateDoc(doc(firestore, 'organisations', organisationId, 'serviceOperations', editing.id), payload);
                toast({ title: 'Operation updated', description: trimmedName });
            } else {
                await addDoc(collection(firestore, 'organisations', organisationId, 'serviceOperations'), {
                    ...payload,
                    createdAt: serverTimestamp(),
                });
                toast({ title: 'Operation added', description: trimmedName });
            }
            onOpenChange(false);
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Failed to save' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{editing ? 'Edit operation' : 'Add operation'}</DialogTitle>
                    <DialogDescription className="text-xs">
                        Labor code. Sell price = hours × hourly rate unless overridden.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold">Code</label>
                            <Input value={code} onChange={e => setCode(e.target.value)} placeholder="ENG-100" className="rounded-xl border-2 font-mono" autoFocus />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold">Hourly rate ($)</label>
                            <Input type="number" inputMode="decimal" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} placeholder="120" className="rounded-xl border-2 tabular-nums" min="0" step="0.01" />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold">Name</label>
                        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Engine service 100hr" className="rounded-xl border-2" />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold">Hours</label>
                            <Input type="number" inputMode="decimal" value={flatRateHours} onChange={e => setFlatRateHours(e.target.value)} placeholder="2.5" className="rounded-xl border-2 tabular-nums" min="0" step="0.25" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold">Cost ($)</label>
                            <Input type="number" inputMode="decimal" value={cost} onChange={e => setCost(e.target.value)} placeholder="optional" className="rounded-xl border-2 tabular-nums" min="0" step="0.01" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold">Sell override ($)</label>
                            <Input type="number" inputMode="decimal" value={sellPrice} onChange={e => setSellPrice(e.target.value)} placeholder="auto" className="rounded-xl border-2 tabular-nums" min="0" step="0.01" />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold">Notes — optional</label>
                        <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything operators need to know" className="rounded-xl border-2 text-xs" rows={2} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="rounded-xl">Cancel</Button>
                    <Button onClick={handleSave} disabled={saving} className="rounded-xl">
                        {saving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                        {editing ? 'Save changes' : 'Add operation'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function OperationBulkDialog({
    action, onOpenChange, organisationId, selectedItems, onComplete,
}: {
    action: 'markup' | 'delete' | null;
    onOpenChange: (o: boolean) => void;
    organisationId: string;
    selectedItems: ServiceOperation[];
    onComplete: () => void;
}) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [markupPct, setMarkupPct] = useState('25');
    const [running, setRunning] = useState(false);

    const handleApply = async () => {
        if (selectedItems.length === 0) { onOpenChange(false); return; }
        setRunning(true);
        try {
            const batch = writeBatch(firestore);
            if (action === 'markup') {
                const pct = parseFloat(markupPct);
                if (!Number.isFinite(pct) || pct < -100) {
                    toast({ variant: 'destructive', title: 'Invalid markup %' });
                    setRunning(false);
                    return;
                }
                const mult = 1 + pct / 100;
                for (const op of selectedItems) {
                    // Bulk markup on operations adjusts the hourly rate (the
                    // primary lever), not sell-price override — keeps the
                    // derivation transparent. To override a specific sell,
                    // edit the operation directly.
                    const newRate = Math.round(op.hourlyRate * mult * 100) / 100;
                    batch.update(doc(firestore, 'organisations', organisationId, 'serviceOperations', op.id), { hourlyRate: newRate, updatedAt: serverTimestamp() });
                }
            } else if (action === 'delete') {
                for (const op of selectedItems) batch.delete(doc(firestore, 'organisations', organisationId, 'serviceOperations', op.id));
            }
            await batch.commit();
            toast({ title: action === 'markup' ? `Markup applied (${markupPct}%)` : 'Operations deleted', description: `${selectedItems.length} updated.` });
            onComplete();
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Bulk action failed', description: String(err) });
        } finally {
            setRunning(false);
        }
    };

    return (
        <Dialog open={action !== null} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        {action === 'markup' && 'Apply hourly-rate markup'}
                        {action === 'delete' && 'Delete operations'}
                    </DialogTitle>
                    <DialogDescription className="text-xs">{selectedItems.length} operation{selectedItems.length === 1 ? '' : 's'} selected.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    {action === 'markup' && (
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold">Markup % (applied to hourly rate)</label>
                            <div className="flex items-center gap-2">
                                <Input type="number" value={markupPct} onChange={e => setMarkupPct(e.target.value)} className="rounded-xl border-2 tabular-nums" step="1" />
                                <span className="text-sm font-bold">%</span>
                            </div>
                            <p className="text-[10px] text-amber-700">
                                Each operation's hourly rate is multiplied by <code>(1 + markup/100)</code>. Sell-price overrides
                                on those operations stay as-is (clear them on the operation itself if you want the derivation back).
                            </p>
                        </div>
                    )}
                    {action === 'delete' && (
                        <p className="text-xs text-rose-700">
                            Permanently deletes the selected operations. No undo. The service-quote flow (Epic 11.2) is not live yet,
                            so no quote depends on these operations today.
                        </p>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running} className="rounded-xl">Cancel</Button>
                    <Button onClick={handleApply} disabled={running} variant={action === 'delete' ? 'destructive' : 'default'} className="rounded-xl">
                        {running && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                        {action === 'markup' && 'Apply markup'}
                        {action === 'delete' && 'Delete'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ---------------------------------------------------------------------
// Parts sub-tab
// ---------------------------------------------------------------------

function ServicePartsTab({ organisationId }: { organisationId: string }) {
    const firestore = useFirestore();
    const { toast } = useToast();

    const partsRef = useMemoFirebase(
        () => query(collection(firestore, 'organisations', organisationId, 'serviceParts'), orderBy('partNumber', 'asc')),
        [firestore, organisationId],
    );
    const { data: parts, isLoading } = useCollection<ServicePart>(partsRef);

    const [editorOpen, setEditorOpen] = useState(false);
    const [editing, setEditing] = useState<ServicePart | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkAction, setBulkAction] = useState<'markup' | 'delete' | null>(null);
    const [importing, setImporting] = useState(false);

    const list = parts ?? [];

    const toggleSelected = (id: string) => setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    const toggleAll = () => {
        const allSelected = list.every(p => selectedIds.has(p.id));
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (allSelected) for (const p of list) next.delete(p.id);
            else for (const p of list) next.add(p.id);
            return next;
        });
    };

    const handleDelete = async (part: ServicePart) => {
        try {
            await deleteDoc(doc(firestore, 'organisations', organisationId, 'serviceParts', part.id));
            toast({ title: 'Part removed', description: part.name });
            setSelectedIds(prev => { const next = new Set(prev); next.delete(part.id); return next; });
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Failed to remove part' });
        }
    };

    const handleExport = () => {
        if (list.length === 0) { toast({ variant: 'destructive', title: 'Nothing to export' }); return; }
        const rows = list.map(p => ({
            'Part Number': p.partNumber,
            Name: p.name,
            Cost: p.cost,
            'Sell Price': p.sellPrice ?? '',
            'Stock Level': p.stockLevel ?? '',
            Notes: p.notes ?? '',
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Service Parts');
        const stamp = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `service-parts-${stamp}.xlsx`);
        toast({ title: 'Exported', description: `${list.length} part${list.length === 1 ? '' : 's'}.` });
    };

    const handleImport = async (file: File) => {
        setImporting(true);
        try {
            const data = await file.arrayBuffer();
            const wb = XLSX.read(data, { type: 'array' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);
            if (rows.length === 0) { toast({ variant: 'destructive', title: 'No rows found' }); return; }

            const byNum = new Map<string, ServicePart>();
            for (const p of list) byNum.set(p.partNumber.trim().toUpperCase(), p);

            let updated = 0, created = 0, skipped = 0;
            const writes: Promise<unknown>[] = [];

            for (const row of rows) {
                const numRaw = pickField(row, PART_NUM_KEYS);
                const partNumber = numRaw != null ? String(numRaw).trim() : '';
                if (!partNumber) { skipped++; continue; }
                const nameRaw = pickField(row, PART_NAME_KEYS);
                const name = nameRaw != null ? String(nameRaw).trim() : partNumber;
                const cost = asNumber(pickField(row, COST_KEYS)) ?? 0;
                const sellPrice = asNumber(pickField(row, SELL_KEYS));
                const stockLevel = asNumber(pickField(row, STOCK_KEYS));
                const notesRaw = pickField(row, NOTES_KEYS);
                const notes = notesRaw != null ? String(notesRaw).trim() : null;

                const existing = byNum.get(partNumber.toUpperCase());
                const payload = {
                    partNumber, name, cost, sellPrice, stockLevel, notes: notes || null,
                    updatedAt: serverTimestamp(),
                };
                if (existing) {
                    writes.push(updateDoc(doc(firestore, 'organisations', organisationId, 'serviceParts', existing.id), payload));
                    updated++;
                } else {
                    writes.push(addDoc(collection(firestore, 'organisations', organisationId, 'serviceParts'), {
                        ...payload,
                        createdAt: serverTimestamp(),
                    }));
                    created++;
                }
            }

            await Promise.all(writes);
            toast({ title: 'Import complete', description: `${updated} updated · ${created} created · ${skipped} skipped (no part number)` });
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Import failed', description: String(err) });
        } finally {
            setImporting(false);
        }
    };

    const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        await handleImport(file);
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs text-muted-foreground">
                    Parts catalog for the service-quoting flow. Part number is the natural key (upsert match on import).
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={handleExport} className="rounded-xl">
                        <Download className="h-3.5 w-3.5 mr-1" /> Export
                    </Button>
                    <Button size="sm" variant="outline" disabled={importing} onClick={e => (e.currentTarget.nextElementSibling as HTMLInputElement | null)?.click()} className="rounded-xl">
                        {importing ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Importing…</> : <><Upload className="h-3.5 w-3.5 mr-1" /> Import</>}
                    </Button>
                    <input type="file" accept=".csv, .xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" onChange={onFileChange} className="hidden" />
                    <Button size="sm" onClick={() => { setEditing(null); setEditorOpen(true); }} className="rounded-xl">
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add part
                    </Button>
                </div>
            </div>

            {selectedIds.size > 0 && (
                <div className="flex items-center justify-between p-2 rounded-xl border-2 border-primary/30 bg-primary/5">
                    <p className="text-xs font-bold">{selectedIds.size} selected</p>
                    <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => setBulkAction('markup')} className="rounded-lg h-7 text-xs">
                            <Percent className="h-3 w-3 mr-1" /> Apply markup
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setBulkAction('delete')} className="rounded-lg h-7 text-xs text-destructive">
                            <Trash2 className="h-3 w-3 mr-1" /> Delete
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} className="rounded-lg h-7 text-xs">Clear</Button>
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-4 w-4 animate-spin mr-2" /><span className="text-xs">Loading…</span></div>
            ) : list.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center gap-2 border-2 border-dashed rounded-2xl text-muted-foreground">
                    <Package className="h-8 w-8 opacity-30" />
                    <p className="text-xs font-semibold">No parts yet. Add one above or import a sheet.</p>
                </div>
            ) : (
                <div className="space-y-1">
                    <div className="flex items-center gap-3 p-2 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                        <Checkbox checked={list.length > 0 && list.every(p => selectedIds.has(p.id))} onCheckedChange={toggleAll} />
                        <span>Select all</span>
                    </div>
                    {list.map(part => (
                        <div key={part.id} className={`flex items-center justify-between p-3 rounded-xl border ${selectedIds.has(part.id) ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-slate-50 hover:border-slate-200'}`}>
                            <div className="flex items-center gap-3 min-w-0">
                                <Checkbox checked={selectedIds.has(part.id)} onCheckedChange={() => toggleSelected(part.id)} />
                                <Badge variant="outline" className="bg-violet-50 text-violet-800 border-violet-200 text-[10px] font-bold uppercase font-mono">
                                    {part.partNumber}
                                </Badge>
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold truncate">{part.name}</p>
                                    {part.stockLevel != null && (
                                        <p className="text-[10px] text-muted-foreground tabular-nums">{part.stockLevel} on hand</p>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                <div className="text-right">
                                    <p className="text-xs font-bold tabular-nums">
                                        ${part.cost.toLocaleString()}
                                        <span className="text-[9px] font-normal text-muted-foreground ml-1">cost</span>
                                    </p>
                                    {part.sellPrice != null && (
                                        <p className="text-[10px] tabular-nums text-muted-foreground">${part.sellPrice.toLocaleString()} sell</p>
                                    )}
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => { setEditing(part); setEditorOpen(true); }}>
                                        <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" onClick={() => handleDelete(part)}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <ServicePartEditor open={editorOpen} onOpenChange={setEditorOpen} organisationId={organisationId} editing={editing} />
            <PartBulkDialog
                action={bulkAction}
                onOpenChange={open => { if (!open) setBulkAction(null); }}
                organisationId={organisationId}
                selectedItems={list.filter(p => selectedIds.has(p.id))}
                onComplete={() => { setBulkAction(null); setSelectedIds(new Set()); }}
            />
        </div>
    );
}

function ServicePartEditor({
    open, onOpenChange, organisationId, editing,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    organisationId: string;
    editing: ServicePart | null;
}) {
    const firestore = useFirestore();
    const { toast } = useToast();

    const [partNumber, setPartNumber] = useState('');
    const [name, setName] = useState('');
    const [cost, setCost] = useState('');
    const [sellPrice, setSellPrice] = useState('');
    const [stockLevel, setStockLevel] = useState('');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open) {
            setPartNumber(editing?.partNumber ?? '');
            setName(editing?.name ?? '');
            setCost(editing?.cost != null ? String(editing.cost) : '');
            setSellPrice(editing?.sellPrice != null ? String(editing.sellPrice) : '');
            setStockLevel(editing?.stockLevel != null ? String(editing.stockLevel) : '');
            setNotes(editing?.notes ?? '');
        }
    }, [open, editing]);

    const handleSave = async () => {
        const tpn = partNumber.trim();
        const tname = name.trim();
        if (!tpn || !tname) {
            toast({ variant: 'destructive', title: 'Part number and name are required' });
            return;
        }
        const parsedCost = parseFloat(cost);
        if (!Number.isFinite(parsedCost) || parsedCost < 0) {
            toast({ variant: 'destructive', title: 'Cost must be a non-negative number' });
            return;
        }
        const parsedSell = sellPrice.trim() === '' ? null : parseFloat(sellPrice);
        const parsedStock = stockLevel.trim() === '' ? null : parseFloat(stockLevel);

        setSaving(true);
        try {
            const payload = {
                partNumber: tpn,
                name: tname,
                cost: parsedCost,
                sellPrice: parsedSell,
                stockLevel: parsedStock,
                notes: notes.trim() || null,
                updatedAt: serverTimestamp(),
            };
            if (editing) {
                await updateDoc(doc(firestore, 'organisations', organisationId, 'serviceParts', editing.id), payload);
                toast({ title: 'Part updated', description: tname });
            } else {
                await addDoc(collection(firestore, 'organisations', organisationId, 'serviceParts'), {
                    ...payload,
                    createdAt: serverTimestamp(),
                });
                toast({ title: 'Part added', description: tname });
            }
            onOpenChange(false);
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Failed to save' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{editing ? 'Edit part' : 'Add part'}</DialogTitle>
                    <DialogDescription className="text-xs">
                        Service-quoting part. Part number must be unique within the org (used as the natural key on import).
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold">Part number</label>
                        <Input value={partNumber} onChange={e => setPartNumber(e.target.value)} placeholder="OIL-FILT-X1" className="rounded-xl border-2 font-mono" autoFocus />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold">Name</label>
                        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Oil filter X1" className="rounded-xl border-2" />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold">Cost ($)</label>
                            <Input type="number" inputMode="decimal" value={cost} onChange={e => setCost(e.target.value)} placeholder="0.00" className="rounded-xl border-2 tabular-nums" min="0" step="0.01" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold">Sell ($) — optional</label>
                            <Input type="number" inputMode="decimal" value={sellPrice} onChange={e => setSellPrice(e.target.value)} placeholder="auto" className="rounded-xl border-2 tabular-nums" min="0" step="0.01" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold">Stock — optional</label>
                            <Input type="number" inputMode="numeric" value={stockLevel} onChange={e => setStockLevel(e.target.value)} placeholder="—" className="rounded-xl border-2 tabular-nums" min="0" />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold">Notes — optional</label>
                        <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything operators need to know" className="rounded-xl border-2 text-xs" rows={2} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="rounded-xl">Cancel</Button>
                    <Button onClick={handleSave} disabled={saving} className="rounded-xl">
                        {saving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                        {editing ? 'Save changes' : 'Add part'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function PartBulkDialog({
    action, onOpenChange, organisationId, selectedItems, onComplete,
}: {
    action: 'markup' | 'delete' | null;
    onOpenChange: (o: boolean) => void;
    organisationId: string;
    selectedItems: ServicePart[];
    onComplete: () => void;
}) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [markupPct, setMarkupPct] = useState('25');
    const [running, setRunning] = useState(false);

    const handleApply = async () => {
        if (selectedItems.length === 0) { onOpenChange(false); return; }
        setRunning(true);
        try {
            const batch = writeBatch(firestore);
            if (action === 'markup') {
                const pct = parseFloat(markupPct);
                if (!Number.isFinite(pct) || pct < -100) {
                    toast({ variant: 'destructive', title: 'Invalid markup %' });
                    setRunning(false); return;
                }
                const mult = 1 + pct / 100;
                for (const part of selectedItems) {
                    const newSell = Math.round(part.cost * mult * 100) / 100;
                    batch.update(doc(firestore, 'organisations', organisationId, 'serviceParts', part.id), { sellPrice: newSell, updatedAt: serverTimestamp() });
                }
            } else if (action === 'delete') {
                for (const part of selectedItems) batch.delete(doc(firestore, 'organisations', organisationId, 'serviceParts', part.id));
            }
            await batch.commit();
            toast({ title: action === 'markup' ? `Markup applied (${markupPct}%)` : 'Parts deleted', description: `${selectedItems.length} updated.` });
            onComplete();
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Bulk action failed', description: String(err) });
        } finally {
            setRunning(false);
        }
    };

    return (
        <Dialog open={action !== null} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        {action === 'markup' && 'Apply markup to parts'}
                        {action === 'delete' && 'Delete parts'}
                    </DialogTitle>
                    <DialogDescription className="text-xs">{selectedItems.length} part{selectedItems.length === 1 ? '' : 's'} selected.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    {action === 'markup' && (
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold">Markup % (applied to cost)</label>
                            <div className="flex items-center gap-2">
                                <Input type="number" value={markupPct} onChange={e => setMarkupPct(e.target.value)} className="rounded-xl border-2 tabular-nums" step="1" />
                                <span className="text-sm font-bold">%</span>
                            </div>
                            <p className="text-[10px] text-amber-700">
                                Each part's sell price will be set to <code>cost × (1 + markup/100)</code>, rounded 2dp.
                                Pre-existing sell prices on selected parts will be overwritten.
                            </p>
                        </div>
                    )}
                    {action === 'delete' && (
                        <p className="text-xs text-rose-700">
                            Permanently deletes the selected parts. No undo. The service-quote flow (Epic 11.2) is not live yet.
                        </p>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running} className="rounded-xl">Cancel</Button>
                    <Button onClick={handleApply} disabled={running} variant={action === 'delete' ? 'destructive' : 'default'} className="rounded-xl">
                        {running && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                        {action === 'markup' && 'Apply markup'}
                        {action === 'delete' && 'Delete'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

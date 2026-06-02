
'use client';

/**
 * FitUpCatalogManager (v1.10 — Epic 9.1.1 + 9.1.2 + 9.1.3 + 9.1.4).
 *
 * Org-level master catalog of fit-up items. Each item has a name, a
 * tier (simple | medium | complex), a cost (dollars to the dealer),
 * and an optional sell price + notes. Lives at
 * `organisations/{orgId}/fitUpItems/{itemId}`.
 *
 * v1.10 scope (all four 9.1.x stories):
 *   - 9.1.1 Schema + collection
 *   - 9.1.2 Add/edit/delete dialog
 *   - 9.1.3 CSV import (upsert by name) + CSV export
 *   - 9.1.4 Bulk selection + global markup + retier + delete
 *
 * NOT in v1.10: salesperson-side quote integration (Epic 9.2 = v1.16+),
 * rule-based auto-classification (9.3.1 = v2.2). Cost / tier captured
 * here drive the rule engine when that lands.
 *
 * CSV import follows the v1.4 remediation lesson: upsert by natural
 * key (name, case-insensitive match), NEVER clear-and-replace, toast
 * `N updated · M created · K skipped (no key)`.
 *
 * Bulk markup writes sellPrice = cost * (1 + markup / 100), rounded
 * to 2dp. Pre-existing sellPrice values are overwritten by design —
 * the bulk-markup tool is the explicit operator action that says
 * "ignore prior sell prices, recompute from cost". The confirm
 * dialog calls this out so it can't be hit by accident.
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Wrench, Loader2, Upload, Download, Percent, ArrowUpRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const TIERS = ['simple', 'medium', 'complex'] as const;
type Tier = typeof TIERS[number];

interface FitUpItem {
    id: string;
    name: string;
    tier: Tier;
    cost: number;
    sellPrice?: number | null;
    notes?: string | null;
    createdAt?: any;
    updatedAt?: any;
}

interface FitUpCatalogManagerProps {
    organisationId: string;
}

const TIER_LABEL: Record<Tier, string> = {
    simple: 'Simple',
    medium: 'Medium',
    complex: 'Complex',
};

const TIER_TONE: Record<Tier, string> = {
    simple: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    medium: 'bg-amber-50 text-amber-800 border-amber-200',
    complex: 'bg-rose-50 text-rose-800 border-rose-200',
};

const NAME_KEYS = ['name', 'item name', 'item', 'title', 'description', 'part description'];
const TIER_KEYS = ['tier', 'complexity', 'level'];
const COST_KEYS = ['cost', 'dealer cost', 'buy', 'buy price', 'act ctd'];
const SELL_KEYS = ['sell', 'sell price', 'retail', 'act sell'];
const NOTES_KEYS = ['notes', 'note', 'comment'];

function pickField(row: Record<string, any>, candidates: readonly string[]): any {
    const lowered: Record<string, any> = {};
    for (const [k, v] of Object.entries(row)) lowered[k.toLowerCase().trim()] = v;
    for (const candidate of candidates) {
        if (candidate in lowered && lowered[candidate] != null && lowered[candidate] !== '') {
            return lowered[candidate];
        }
    }
    return null;
}

function normaliseTier(raw: any): Tier {
    const s = String(raw ?? '').trim().toLowerCase();
    if (s.startsWith('m')) return 'medium';
    if (s.startsWith('c') || s.startsWith('h')) return 'complex';
    return 'simple';
}

function asNumber(raw: any): number | null {
    if (raw == null || raw === '') return null;
    const cleaned = String(raw).replace(/[$,\s]/g, '');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : null;
}

export function FitUpCatalogManager({ organisationId }: FitUpCatalogManagerProps) {
    const firestore = useFirestore();
    const { toast } = useToast();

    const itemsRef = useMemoFirebase(
        () => query(collection(firestore, 'organisations', organisationId, 'fitUpItems'), orderBy('tier', 'asc'), orderBy('name', 'asc')),
        [firestore, organisationId],
    );
    const { data: items, isLoading } = useCollection<FitUpItem>(itemsRef);

    const [tierFilter, setTierFilter] = useState<Tier | 'all'>('all');
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<FitUpItem | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkAction, setBulkAction] = useState<'markup' | 'retier' | 'delete' | null>(null);
    const [importing, setImporting] = useState(false);

    const filtered = useMemo(() => {
        const list = items ?? [];
        return tierFilter === 'all' ? list : list.filter(i => i.tier === tierFilter);
    }, [items, tierFilter]);

    const tierCounts = useMemo(() => {
        const counts: Record<Tier, number> = { simple: 0, medium: 0, complex: 0 };
        for (const item of items ?? []) {
            if (TIERS.includes(item.tier)) counts[item.tier]++;
        }
        return counts;
    }, [items]);

    const openCreate = () => {
        setEditingItem(null);
        setEditorOpen(true);
    };

    const openEdit = (item: FitUpItem) => {
        setEditingItem(item);
        setEditorOpen(true);
    };

    const handleDelete = async (item: FitUpItem) => {
        try {
            await deleteDoc(doc(firestore, 'organisations', organisationId, 'fitUpItems', item.id));
            toast({ title: 'Item removed', description: item.name });
            setSelectedIds(prev => {
                const next = new Set(prev);
                next.delete(item.id);
                return next;
            });
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Failed to remove item' });
        }
    };

    const toggleSelected = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAllFiltered = () => {
        const allSelected = filtered.every(i => selectedIds.has(i.id));
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (allSelected) {
                for (const i of filtered) next.delete(i.id);
            } else {
                for (const i of filtered) next.add(i.id);
            }
            return next;
        });
    };

    const clearSelection = () => setSelectedIds(new Set());

    const handleExport = () => {
        const list = items ?? [];
        if (list.length === 0) {
            toast({ variant: 'destructive', title: 'Nothing to export', description: 'Add at least one item first.' });
            return;
        }
        const rows = list.map(i => ({
            Name: i.name,
            Tier: TIER_LABEL[i.tier],
            Cost: i.cost,
            'Sell Price': i.sellPrice ?? '',
            Notes: i.notes ?? '',
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Fit-Up Catalog');
        const stamp = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `fit-up-catalog-${stamp}.xlsx`);
        toast({ title: 'Exported', description: `${list.length} item${list.length === 1 ? '' : 's'} written to fit-up-catalog-${stamp}.xlsx.` });
    };

    const handleImport = async (file: File) => {
        setImporting(true);
        try {
            const data = await file.arrayBuffer();
            const wb = XLSX.read(data, { type: 'array' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

            if (rows.length === 0) {
                toast({ variant: 'destructive', title: 'No rows found', description: 'Sheet appears empty.' });
                return;
            }

            const existing = items ?? [];
            const byNameKey = new Map<string, FitUpItem>();
            for (const item of existing) byNameKey.set(item.name.trim().toLowerCase(), item);

            let updated = 0;
            let created = 0;
            let skipped = 0;
            const writes: Promise<unknown>[] = [];

            for (const row of rows) {
                const nameRaw = pickField(row, NAME_KEYS);
                const name = nameRaw != null ? String(nameRaw).trim() : '';
                if (!name) {
                    skipped++;
                    continue;
                }
                const tier = normaliseTier(pickField(row, TIER_KEYS));
                const cost = asNumber(pickField(row, COST_KEYS)) ?? 0;
                const sellPrice = asNumber(pickField(row, SELL_KEYS));
                const notesRaw = pickField(row, NOTES_KEYS);
                const notes = notesRaw != null ? String(notesRaw).trim() : null;

                const existingItem = byNameKey.get(name.toLowerCase());
                if (existingItem) {
                    writes.push(
                        updateDoc(doc(firestore, 'organisations', organisationId, 'fitUpItems', existingItem.id), {
                            name,
                            tier,
                            cost,
                            sellPrice,
                            notes: notes || null,
                            updatedAt: serverTimestamp(),
                        }),
                    );
                    updated++;
                } else {
                    writes.push(
                        addDoc(collection(firestore, 'organisations', organisationId, 'fitUpItems'), {
                            name,
                            tier,
                            cost,
                            sellPrice,
                            notes: notes || null,
                            createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp(),
                        }),
                    );
                    created++;
                }
            }

            await Promise.all(writes);

            toast({
                title: 'Import complete',
                description: `${updated} updated · ${created} created · ${skipped} skipped (no name)`,
            });
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
        <Card className="rounded-2xl border-2">
            <CardHeader>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-base font-bold">
                            <Wrench className="h-4 w-4" />
                            Fit-Up Catalog
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Master library of fit-up items (rigging, installation, prep). Cost + tier per item. Quote-flow integration ships in Epic 9.2 (v1.16+).
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <Button size="sm" variant="outline" onClick={handleExport} className="rounded-xl">
                            <Download className="h-3.5 w-3.5 mr-1" /> Export
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={importing}
                            onClick={e => {
                                const input = (e.currentTarget.nextElementSibling as HTMLInputElement | null);
                                input?.click();
                            }}
                            className="rounded-xl"
                        >
                            {importing ? (
                                <>
                                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Importing…
                                </>
                            ) : (
                                <>
                                    <Upload className="h-3.5 w-3.5 mr-1" /> Import
                                </>
                            )}
                        </Button>
                        <input
                            type="file"
                            accept=".csv, .xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                            onChange={onFileChange}
                            className="hidden"
                        />
                        <Button size="sm" onClick={openCreate} className="rounded-xl">
                            <Plus className="h-3.5 w-3.5 mr-1" /> Add item
                        </Button>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-3">
                    <Button
                        size="sm"
                        variant={tierFilter === 'all' ? 'default' : 'outline'}
                        onClick={() => setTierFilter('all')}
                        className="rounded-full h-7 text-xs"
                    >
                        All ({items?.length ?? 0})
                    </Button>
                    {TIERS.map(tier => (
                        <Button
                            key={tier}
                            size="sm"
                            variant={tierFilter === tier ? 'default' : 'outline'}
                            onClick={() => setTierFilter(tier)}
                            className="rounded-full h-7 text-xs"
                        >
                            {TIER_LABEL[tier]} ({tierCounts[tier]})
                        </Button>
                    ))}
                </div>
            </CardHeader>

            {selectedIds.size > 0 && (
                <div className="mx-6 mb-3 flex items-center justify-between p-2 rounded-xl border-2 border-primary/30 bg-primary/5">
                    <p className="text-xs font-bold">
                        {selectedIds.size} selected
                    </p>
                    <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => setBulkAction('markup')} className="rounded-lg h-7 text-xs">
                            <Percent className="h-3 w-3 mr-1" /> Apply markup
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setBulkAction('retier')} className="rounded-lg h-7 text-xs">
                            <ArrowUpRight className="h-3 w-3 mr-1" /> Change tier
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setBulkAction('delete')} className="rounded-lg h-7 text-xs text-destructive">
                            <Trash2 className="h-3 w-3 mr-1" /> Delete
                        </Button>
                        <Button size="sm" variant="ghost" onClick={clearSelection} className="rounded-lg h-7 text-xs">
                            Clear
                        </Button>
                    </div>
                </div>
            )}

            <CardContent>
                {isLoading ? (
                    <div className="flex items-center justify-center py-12 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        <span className="text-xs">Loading catalog…</span>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center gap-2 border-2 border-dashed rounded-2xl text-muted-foreground">
                        <Wrench className="h-8 w-8 opacity-30" />
                        <p className="text-xs font-semibold">
                            {items && items.length > 0
                                ? 'No items match the selected tier.'
                                : 'No fit-up items yet. Add one above or import a sheet.'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-1">
                        <div className="flex items-center gap-3 p-2 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                            <Checkbox
                                checked={filtered.length > 0 && filtered.every(i => selectedIds.has(i.id))}
                                onCheckedChange={toggleSelectAllFiltered}
                            />
                            <span>Select all visible</span>
                        </div>
                        {filtered.map(item => (
                            <FitUpItemRow
                                key={item.id}
                                item={item}
                                selected={selectedIds.has(item.id)}
                                onToggleSelect={() => toggleSelected(item.id)}
                                onEdit={() => openEdit(item)}
                                onDelete={() => handleDelete(item)}
                            />
                        ))}
                    </div>
                )}
            </CardContent>

            <FitUpItemEditor
                open={editorOpen}
                onOpenChange={setEditorOpen}
                organisationId={organisationId}
                editingItem={editingItem}
            />

            <BulkActionDialog
                action={bulkAction}
                onOpenChange={open => { if (!open) setBulkAction(null); }}
                organisationId={organisationId}
                selectedItems={(items ?? []).filter(i => selectedIds.has(i.id))}
                onComplete={() => {
                    setBulkAction(null);
                    clearSelection();
                }}
            />
        </Card>
    );
}

function FitUpItemRow({
    item, selected, onToggleSelect, onEdit, onDelete,
}: {
    item: FitUpItem;
    selected: boolean;
    onToggleSelect: () => void;
    onEdit: () => void;
    onDelete: () => void;
}) {
    return (
        <div className={`flex items-center justify-between p-3 rounded-xl border ${selected ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-slate-50 hover:border-slate-200'}`}>
            <div className="flex items-center gap-3 min-w-0">
                <Checkbox checked={selected} onCheckedChange={onToggleSelect} />
                <Badge variant="outline" className={`${TIER_TONE[item.tier]} text-[10px] font-bold uppercase`}>
                    {TIER_LABEL[item.tier]}
                </Badge>
                <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{item.name}</p>
                    {item.notes && (
                        <p className="text-[10px] text-muted-foreground truncate max-w-md">{item.notes}</p>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                    <p className="text-xs font-bold tabular-nums">
                        {item.cost != null ? `$${item.cost.toLocaleString()}` : '—'}
                        <span className="text-[9px] font-normal text-muted-foreground ml-1">cost</span>
                    </p>
                    {item.sellPrice != null && (
                        <p className="text-[10px] tabular-nums text-muted-foreground">
                            ${item.sellPrice.toLocaleString()} sell
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={onEdit}>
                        <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" onClick={onDelete}>
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>
        </div>
    );
}

function FitUpItemEditor({
    open,
    onOpenChange,
    organisationId,
    editingItem,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    organisationId: string;
    editingItem: FitUpItem | null;
}) {
    const firestore = useFirestore();
    const { toast } = useToast();

    const [name, setName] = useState('');
    const [tier, setTier] = useState<Tier>('simple');
    const [cost, setCost] = useState('');
    const [sellPrice, setSellPrice] = useState('');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);

    const isEdit = editingItem !== null;

    useEffect(() => {
        if (open) {
            setName(editingItem?.name ?? '');
            setTier((editingItem?.tier as Tier) ?? 'simple');
            setCost(editingItem?.cost != null ? String(editingItem.cost) : '');
            setSellPrice(editingItem?.sellPrice != null ? String(editingItem.sellPrice) : '');
            setNotes(editingItem?.notes ?? '');
        }
    }, [open, editingItem]);

    const handleSave = async () => {
        const trimmedName = name.trim();
        if (!trimmedName) {
            toast({ variant: 'destructive', title: 'Name required' });
            return;
        }
        const parsedCost = parseFloat(cost);
        if (!Number.isFinite(parsedCost) || parsedCost < 0) {
            toast({ variant: 'destructive', title: 'Cost must be a non-negative number' });
            return;
        }
        const parsedSell = sellPrice.trim() === '' ? null : parseFloat(sellPrice);
        if (parsedSell !== null && (!Number.isFinite(parsedSell) || parsedSell < 0)) {
            toast({ variant: 'destructive', title: 'Sell price must be a non-negative number' });
            return;
        }

        setSaving(true);
        try {
            const payload = {
                name: trimmedName,
                tier,
                cost: parsedCost,
                sellPrice: parsedSell,
                notes: notes.trim() || null,
                updatedAt: serverTimestamp(),
            };
            if (isEdit && editingItem) {
                await updateDoc(doc(firestore, 'organisations', organisationId, 'fitUpItems', editingItem.id), payload);
                toast({ title: 'Item updated', description: trimmedName });
            } else {
                await addDoc(collection(firestore, 'organisations', organisationId, 'fitUpItems'), {
                    ...payload,
                    createdAt: serverTimestamp(),
                });
                toast({ title: 'Item added', description: trimmedName });
            }
            onOpenChange(false);
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Failed to save item' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{isEdit ? 'Edit fit-up item' : 'Add fit-up item'}</DialogTitle>
                    <DialogDescription className="text-xs">
                        Tier reflects effort/complexity. Cost is what it costs the dealer to deliver the item.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold">Name</label>
                        <Input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g., Sound system install"
                            className="rounded-xl border-2"
                            autoFocus
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold">Tier</label>
                            <Select value={tier} onValueChange={v => setTier(v as Tier)}>
                                <SelectTrigger className="rounded-xl border-2">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {TIERS.map(t => (
                                        <SelectItem key={t} value={t}>{TIER_LABEL[t]}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold">Cost ($)</label>
                            <Input
                                type="number"
                                inputMode="decimal"
                                value={cost}
                                onChange={e => setCost(e.target.value)}
                                placeholder="0.00"
                                className="rounded-xl border-2 tabular-nums"
                                min="0"
                                step="0.01"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold">Sell price ($) — optional</label>
                        <Input
                            type="number"
                            inputMode="decimal"
                            value={sellPrice}
                            onChange={e => setSellPrice(e.target.value)}
                            placeholder="Leave blank to derive from margin later"
                            className="rounded-xl border-2 tabular-nums"
                            min="0"
                            step="0.01"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold">Notes — optional</label>
                        <Textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Anything operators need to know"
                            className="rounded-xl border-2 text-xs"
                            rows={2}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="rounded-xl">
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={saving} className="rounded-xl">
                        {saving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                        {isEdit ? 'Save changes' : 'Add item'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function BulkActionDialog({
    action,
    onOpenChange,
    organisationId,
    selectedItems,
    onComplete,
}: {
    action: 'markup' | 'retier' | 'delete' | null;
    onOpenChange: (open: boolean) => void;
    organisationId: string;
    selectedItems: FitUpItem[];
    onComplete: () => void;
}) {
    const firestore = useFirestore();
    const { toast } = useToast();

    const [markupPct, setMarkupPct] = useState('25');
    const [newTier, setNewTier] = useState<Tier>('simple');
    const [running, setRunning] = useState(false);

    const open = action !== null;

    const handleApply = async () => {
        if (selectedItems.length === 0) {
            onOpenChange(false);
            return;
        }
        setRunning(true);
        try {
            const batch = writeBatch(firestore);

            if (action === 'markup') {
                const pct = parseFloat(markupPct);
                if (!Number.isFinite(pct) || pct < -100) {
                    toast({ variant: 'destructive', title: 'Invalid markup %', description: 'Use a number like 25 for 25%.' });
                    setRunning(false);
                    return;
                }
                const multiplier = 1 + pct / 100;
                for (const item of selectedItems) {
                    const newSell = Math.round(item.cost * multiplier * 100) / 100;
                    batch.update(
                        doc(firestore, 'organisations', organisationId, 'fitUpItems', item.id),
                        { sellPrice: newSell, updatedAt: serverTimestamp() },
                    );
                }
            } else if (action === 'retier') {
                for (const item of selectedItems) {
                    batch.update(
                        doc(firestore, 'organisations', organisationId, 'fitUpItems', item.id),
                        { tier: newTier, updatedAt: serverTimestamp() },
                    );
                }
            } else if (action === 'delete') {
                for (const item of selectedItems) {
                    batch.delete(doc(firestore, 'organisations', organisationId, 'fitUpItems', item.id));
                }
            }

            await batch.commit();

            const verb =
                action === 'markup' ? `Markup applied (${markupPct}%)`
                : action === 'retier' ? `Tier changed to ${TIER_LABEL[newTier]}`
                : 'Items deleted';
            toast({ title: verb, description: `${selectedItems.length} item${selectedItems.length === 1 ? '' : 's'} updated.` });
            onComplete();
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Bulk action failed', description: String(err) });
        } finally {
            setRunning(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        {action === 'markup' && 'Apply markup to selected'}
                        {action === 'retier' && 'Change tier on selected'}
                        {action === 'delete' && 'Delete selected items'}
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                        {selectedItems.length} item{selectedItems.length === 1 ? '' : 's'} selected.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {action === 'markup' && (
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold">Markup % (applied to cost)</label>
                            <div className="flex items-center gap-2">
                                <Input
                                    type="number"
                                    value={markupPct}
                                    onChange={e => setMarkupPct(e.target.value)}
                                    className="rounded-xl border-2 tabular-nums"
                                    step="1"
                                />
                                <span className="text-sm font-bold">%</span>
                            </div>
                            <p className="text-[10px] text-amber-700">
                                Each item's sell price will be set to <code>cost × (1 + markup/100)</code>, rounded to 2dp.
                                Pre-existing sell prices on selected items will be overwritten.
                            </p>
                        </div>
                    )}

                    {action === 'retier' && (
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold">New tier</label>
                            <Select value={newTier} onValueChange={v => setNewTier(v as Tier)}>
                                <SelectTrigger className="rounded-xl border-2">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {TIERS.map(t => (
                                        <SelectItem key={t} value={t}>{TIER_LABEL[t]}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {action === 'delete' && (
                        <p className="text-xs text-rose-700">
                            This will permanently delete the selected items. There is no undo. Operator-only — no quote
                            references these items yet (quote-flow integration is Epic 9.2 = v1.16+).
                        </p>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running} className="rounded-xl">
                        Cancel
                    </Button>
                    <Button
                        onClick={handleApply}
                        disabled={running}
                        variant={action === 'delete' ? 'destructive' : 'default'}
                        className="rounded-xl"
                    >
                        {running && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                        {action === 'markup' && 'Apply markup'}
                        {action === 'retier' && 'Change tier'}
                        {action === 'delete' && 'Delete'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

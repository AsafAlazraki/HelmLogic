
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
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { useUser } from '@/firebase/auth/use-user';
import { useCollection } from '@/firebase/firestore/use-collection';
import { logFitUpAuditEvent, shallowDiff } from '@/lib/fit-up-catalog-audit';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, Pencil, Trash2, Wrench, Loader2, Upload, Download, Percent, ArrowUpRight, Package } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const TIERS = ['simple', 'medium', 'complex'] as const;
type Tier = typeof TIERS[number];

interface FitUpItem {
    id: string;
    name: string;
    tier: Tier;
    cost: number;
    sellPrice?: number | null;
    /** Operator-only note. Shown to dealers in admin + the quote selector,
     *  NEVER on the customer PDF. */
    notes?: string | null;
    /** v1.11 expansion — free-text category (e.g. "Rigging", "Electronics",
     *  "Safety"). Drives the category-filter chips in both admin and the
     *  quote selector. Empty string / null = uncategorised. */
    category?: string | null;
    /** v1.11 expansion — customer-facing description. When present,
     *  shows on the proposal-view's expanded fit-up breakdown in place
     *  of `name`. PDF stays a single summary line per the locked
     *  product decision (Story 9.2.3) regardless. */
    customerDescription?: string | null;
    /** v1.11 (Epic 9.2.1) — assignment allowlists. Empty array on a
     *  field = "no restriction at this level". When two or more lists
     *  are non-empty, ALL non-empty lists must match the current quote
     *  context (AND semantics) — so brandIds=[Highfield] +
     *  rangeIds=[Sport] means "Highfield Sport quotes only". This is
     *  intentionally restrictive: dealer-admins opt-into a scope, then
     *  narrow further if they want. Empty everywhere = universal. */
    moduleIds?: string[];
    brandIds?: string[];   // data-warehouse vendor ids (Boat Brand vendors)
    rangeIds?: string[];   // data-warehouse/{vendorId}/ranges/{rangeId}
    modelIds?: string[];   // data-warehouse/{vendorId}/ranges/{rangeId}/models/{modelId}
    /** v1.11 expansion-2 — variant-level (SKU) allowlist. Empty = no
     *  restriction. AND-combined with the other allowlists. */
    variantIds?: string[];
    /** v1.11 expansion-2 — image url for the catalog row + quote selector
     *  card. External-CDN-safe (native <img>, not next/Image — see lesson). */
    imageUrl?: string | null;
    /** v1.11 expansion-2 — soft dependency hint. When the operator selects
     *  this item on a quote, items in this list get an ✦ "often paired with"
     *  highlight in the selector. Not a hard rule — full operator-authored
     *  rule engine (Epic 9.3.1) is still v2.2. */
    oftenPairedWith?: string[];
    createdAt?: any;
    updatedAt?: any;
}

interface VariantOption {
    id: string;
    name?: string;
    modelCode?: string;
    material?: string;
    colorName?: string;
    vendorId: string;
    rangeId: string;
    modelId: string;
}

interface ModuleOption {
    id: string;
    name?: string;
    slug?: string;
}

interface BrandOption {
    id: string;
    name?: string;
    slug?: string;
    vendorType?: string;
}

interface RangeOption {
    id: string;
    name?: string;
    code?: string;
    vendorId: string;
    vendorName?: string;
}

interface ModelOption2 {
    id: string;
    name?: string;
    modelCode?: string;
    vendorId: string;
    rangeId: string;
    rangeName?: string;
    vendorName?: string;
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
const CATEGORY_KEYS = ['category', 'group', 'section'];
const CUSTOMER_DESC_KEYS = ['customer description', 'customer-facing description', 'customer name', 'public description'];

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
    const { user } = useUser();
    const { toast } = useToast();

    // No orderBy — composite-index requirement breaks the live query
    // (HTTP 400) AND orderBy silently excludes docs without that field
    // (CLAUDE.md lesson). Sort client-side instead.
    const itemsRef = useMemoFirebase(
        () => collection(firestore, 'organisations', organisationId, 'fitUpItems'),
        [firestore, organisationId],
    );
    const { data: items, isLoading } = useCollection<FitUpItem>(itemsRef);

    const [tierFilter, setTierFilter] = useState<Tier | 'all'>('all');
    const [categoryFilter, setCategoryFilter] = useState<string | 'all'>('all');
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<FitUpItem | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkAction, setBulkAction] = useState<'markup' | 'retier' | 'delete' | null>(null);
    const [importing, setImporting] = useState(false);

    // v1.11 expansion — dynamic list of distinct categories that
    // actually exist in the catalog. Drives the filter chip row.
    // Uncategorised items aren't given an explicit chip; "All" surfaces them.
    const categories = useMemo(() => {
        const set = new Set<string>();
        for (const item of items ?? []) {
            const c = (item.category ?? '').trim();
            if (c) set.add(c);
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [items]);

    const filtered = useMemo(() => {
        let list = items ?? [];
        if (tierFilter !== 'all') list = list.filter(i => i.tier === tierFilter);
        if (categoryFilter !== 'all') {
            list = list.filter(i => (i.category ?? '').trim().toLowerCase() === categoryFilter.toLowerCase());
        }
        return list;
    }, [items, tierFilter, categoryFilter]);

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
            void logFitUpAuditEvent(firestore, organisationId, {
                actorUid: user?.uid || 'unknown',
                actorName: user?.displayName || user?.email || 'Someone',
                resource: 'fitUpItem',
                resourceId: item.id,
                resourceName: item.name,
                action: 'deleted',
            });
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
            Category: i.category ?? '',
            Tier: TIER_LABEL[i.tier],
            Cost: i.cost,
            'Sell Price': i.sellPrice ?? '',
            'Customer Description': i.customerDescription ?? '',
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
                const categoryRaw = pickField(row, CATEGORY_KEYS);
                const category = categoryRaw != null ? String(categoryRaw).trim() : null;
                const customerDescRaw = pickField(row, CUSTOMER_DESC_KEYS);
                const customerDescription = customerDescRaw != null ? String(customerDescRaw).trim() : null;

                const existingItem = byNameKey.get(name.toLowerCase());
                if (existingItem) {
                    writes.push(
                        updateDoc(doc(firestore, 'organisations', organisationId, 'fitUpItems', existingItem.id), {
                            name,
                            tier,
                            cost,
                            sellPrice,
                            notes: notes || null,
                            category: category || null,
                            customerDescription: customerDescription || null,
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
                            category: category || null,
                            customerDescription: customerDescription || null,
                            createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp(),
                        }),
                    );
                    created++;
                }
            }

            await Promise.all(writes);

            // v1.11 audit — record the bulk import as one summary entry so
            // the catalog audit drawer shows "Bill imported 50 items" rather
            // than 50 individual line entries.
            void logFitUpAuditEvent(firestore, organisationId, {
                actorUid: user?.uid || 'unknown',
                actorName: user?.displayName || user?.email || 'Someone',
                resource: 'fitUpItem',
                resourceId: 'bulk-import',
                resourceName: `CSV import: ${updated} updated · ${created} created · ${skipped} skipped`,
                action: 'updated',
            });

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
        <Tabs defaultValue="items" className="space-y-4">
            <TabsList className="rounded-xl">
                <TabsTrigger value="items" className="rounded-lg text-xs gap-1.5">
                    <Wrench className="h-3 w-3" /> Items
                </TabsTrigger>
                <TabsTrigger value="packages" className="rounded-lg text-xs gap-1.5">
                    <Package className="h-3 w-3" /> Packages
                </TabsTrigger>
            </TabsList>
            <TabsContent value="packages" className="m-0">
                <FitUpPackagesManager organisationId={organisationId} items={items ?? []} />
            </TabsContent>
            <TabsContent value="items" className="m-0">
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

                {categories.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2 items-center">
                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Category</span>
                        <Button
                            size="sm"
                            variant={categoryFilter === 'all' ? 'secondary' : 'outline'}
                            onClick={() => setCategoryFilter('all')}
                            className="rounded-full h-6 text-[10px] px-2"
                        >
                            All
                        </Button>
                        {categories.map(cat => (
                            <Button
                                key={cat}
                                size="sm"
                                variant={categoryFilter === cat ? 'secondary' : 'outline'}
                                onClick={() => setCategoryFilter(cat)}
                                className="rounded-full h-6 text-[10px] px-2"
                            >
                                {cat}
                            </Button>
                        ))}
                    </div>
                )}
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
            </TabsContent>
        </Tabs>
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
                {item.imageUrl && (
                    // Native <img> per CLAUDE.md lesson — Next/Image breaks external CDNs.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="h-10 w-10 object-contain rounded-lg border bg-white shrink-0"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                )}
                <Badge variant="outline" className={`${TIER_TONE[item.tier]} text-[10px] font-bold uppercase`}>
                    {TIER_LABEL[item.tier]}
                </Badge>
                {item.category && (
                    <Badge variant="outline" className="text-[10px] font-semibold bg-slate-50 text-slate-700 border-slate-200">
                        {item.category}
                    </Badge>
                )}
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
    const { user } = useUser();
    const { toast } = useToast();

    const [name, setName] = useState('');
    const [tier, setTier] = useState<Tier>('simple');
    const [cost, setCost] = useState('');
    const [sellPrice, setSellPrice] = useState('');
    const [notes, setNotes] = useState('');
    const [category, setCategory] = useState('');
    const [customerDescription, setCustomerDescription] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [moduleIds, setModuleIds] = useState<string[]>([]);
    const [brandIds, setBrandIds] = useState<string[]>([]);
    const [rangeIds, setRangeIds] = useState<string[]>([]);
    const [modelIds, setModelIds] = useState<string[]>([]);
    const [variantIds, setVariantIds] = useState<string[]>([]);
    const [oftenPairedWith, setOftenPairedWith] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    const [scopeData, setScopeData] = useState<{ brands: BrandOption[]; ranges: RangeOption[]; models: ModelOption2[]; variants: VariantOption[] }>({ brands: [], ranges: [], models: [], variants: [] });
    const [loadingScope, setLoadingScope] = useState(false);

    const isEdit = editingItem !== null;

    // v1.11 (Epic 9.2.1) — module list for per-item module assignment.
    // Pulled from the top-level `modules` collection; only renders when
    // the editor is open to keep the parent tab snappy.
    const modulesRef = useMemoFirebase(
        () => (open ? collection(firestore, 'modules') : null),
        [firestore, open],
    );
    const { data: modules } = useCollection<ModuleOption>(modulesRef);
    const sortedModules = useMemo(
        () => [...(modules ?? [])].sort((a, b) => (a.name ?? a.slug ?? a.id).localeCompare(b.name ?? b.slug ?? b.id)),
        [modules],
    );

    // v1.11 (Epic 9.2.1 wider) — load brand / range / model options on
    // editor open. Single fetch; tied to dialog open so we don't keep
    // refreshing during list nav. Boat Brand vendors only.
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        (async () => {
            setLoadingScope(true);
            try {
                const vendorsSnap = await getDocs(query(collection(firestore, 'data-warehouse'), where('vendorType', '==', 'Boat Brand')));
                const brands: BrandOption[] = [];
                vendorsSnap.forEach(d => brands.push({ id: d.id, ...(d.data() as any) }));
                if (cancelled) return;

                const ranges: RangeOption[] = [];
                const models: ModelOption2[] = [];
                for (const brand of brands) {
                    const rangesSnap = await getDocs(collection(firestore, 'data-warehouse', brand.id, 'ranges'));
                    const rangeDocs: { id: string; name?: string; code?: string }[] = [];
                    rangesSnap.forEach(r => {
                        const rd = r.data() as any;
                        rangeDocs.push({ id: r.id, ...rd });
                        ranges.push({ id: r.id, name: rd.name, code: rd.code, vendorId: brand.id, vendorName: brand.name });
                    });
                    for (const range of rangeDocs) {
                        const modelsSnap = await getDocs(collection(firestore, 'data-warehouse', brand.id, 'ranges', range.id, 'models'));
                        modelsSnap.forEach(m => {
                            const md = m.data() as any;
                            models.push({
                                id: m.id,
                                name: md.name,
                                modelCode: md.modelCode,
                                vendorId: brand.id,
                                rangeId: range.id,
                                rangeName: range.name ?? range.code,
                                vendorName: brand.name,
                            });
                        });
                    }
                }
                if (!cancelled) setScopeData(prev => ({ brands, ranges, models, variants: prev.variants }));
            } catch (err) {
                console.error('Scope load failed', err);
            } finally {
                if (!cancelled) setLoadingScope(false);
            }
        })();
        return () => { cancelled = true; };
    }, [open, firestore]);

    // v1.11 expansion-2 — lazy-load variants ONLY for currently-selected
    // models. Avoids the N×M×K read explosion that would happen if we
    // eagerly fetched variants for every model in every range. Triggered
    // when the operator picks a model. Variants section in the UI is
    // gated on modelIds.length > 0 + the underlying model docs being known.
    useEffect(() => {
        if (!open) return;
        if (modelIds.length === 0) {
            setScopeData(prev => ({ ...prev, variants: [] }));
            return;
        }
        let cancelled = false;
        (async () => {
            const variants: VariantOption[] = [];
            // Index models so we can resolve vendor + range from a modelId.
            const modelIndex = new Map(scopeData.models.map(m => [m.id, m]));
            for (const modelId of modelIds) {
                const m = modelIndex.get(modelId);
                if (!m) continue;
                try {
                    const variantsSnap = await getDocs(collection(firestore, 'data-warehouse', m.vendorId, 'ranges', m.rangeId, 'models', modelId, 'variants'));
                    variantsSnap.forEach(v => {
                        const vd = v.data() as any;
                        variants.push({
                            id: v.id,
                            name: vd.name,
                            modelCode: vd.modelCode ?? m.modelCode,
                            material: vd.material,
                            colorName: vd.colorName,
                            vendorId: m.vendorId,
                            rangeId: m.rangeId,
                            modelId,
                        });
                    });
                } catch (err) {
                    console.error('Variant load failed for model', modelId, err);
                }
            }
            if (!cancelled) setScopeData(prev => ({ ...prev, variants }));
        })();
        return () => { cancelled = true; };
    }, [open, firestore, modelIds, scopeData.models]);

    useEffect(() => {
        if (open) {
            setName(editingItem?.name ?? '');
            setTier((editingItem?.tier as Tier) ?? 'simple');
            setCost(editingItem?.cost != null ? String(editingItem.cost) : '');
            setSellPrice(editingItem?.sellPrice != null ? String(editingItem.sellPrice) : '');
            setNotes(editingItem?.notes ?? '');
            setCategory(editingItem?.category ?? '');
            setCustomerDescription(editingItem?.customerDescription ?? '');
            setImageUrl(editingItem?.imageUrl ?? '');
            setModuleIds(editingItem?.moduleIds ?? []);
            setBrandIds(editingItem?.brandIds ?? []);
            setRangeIds(editingItem?.rangeIds ?? []);
            setModelIds(editingItem?.modelIds ?? []);
            setVariantIds(editingItem?.variantIds ?? []);
            setOftenPairedWith(editingItem?.oftenPairedWith ?? []);
        }
    }, [open, editingItem]);

    const toggleModule = (id: string) => {
        setModuleIds(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
    };
    const toggleVariant = (id: string) => {
        setVariantIds(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
    };
    const togglePairedWith = (id: string) => {
        setOftenPairedWith(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
    };
    const toggleBrand = (id: string) => {
        setBrandIds(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
    };
    const toggleRange = (id: string) => {
        setRangeIds(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
    };
    const toggleModel = (id: string) => {
        setModelIds(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
    };

    // Cascade narrowing: if brands are picked, only show ranges/models
    // under those brands. If ranges are picked, only show models under
    // those ranges. Operator can still toggle anything but the visible
    // list focuses where they're working.
    const visibleRanges = useMemo(() => {
        if (brandIds.length === 0) return scopeData.ranges;
        return scopeData.ranges.filter(r => brandIds.includes(r.vendorId));
    }, [scopeData.ranges, brandIds]);
    const visibleModels = useMemo(() => {
        let list = scopeData.models;
        if (brandIds.length > 0) list = list.filter(m => brandIds.includes(m.vendorId));
        if (rangeIds.length > 0) list = list.filter(m => rangeIds.includes(m.rangeId));
        return list;
    }, [scopeData.models, brandIds, rangeIds]);
    // v1.11 expansion-2 — variants are lazy-loaded per selected modelId.
    // The chip section only shows variants for currently-picked models.
    const visibleVariants = useMemo(() => {
        return scopeData.variants.filter(v => modelIds.includes(v.modelId));
    }, [scopeData.variants, modelIds]);

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
                category: category.trim() || null,
                customerDescription: customerDescription.trim() || null,
                imageUrl: imageUrl.trim() || null,
                // v1.11 — assignment allowlists; empty = no restriction
                // at that level; the selector AND-combines non-empty
                // allowlists against the current quote context.
                moduleIds,
                brandIds,
                rangeIds,
                modelIds,
                variantIds,
                oftenPairedWith,
                updatedAt: serverTimestamp(),
            };
            const actorName = user?.displayName || user?.email || 'Someone';
            const actorUid = user?.uid || 'unknown';
            if (isEdit && editingItem) {
                await updateDoc(doc(firestore, 'organisations', organisationId, 'fitUpItems', editingItem.id), payload);
                // v1.11 expansion-2 — audit log (fire-and-forget; failures
                // surface in console, never roll back the catalog write).
                const diff = shallowDiff(
                    editingItem as any,
                    payload,
                    ['name', 'tier', 'cost', 'sellPrice', 'category', 'customerDescription', 'imageUrl'],
                );
                void logFitUpAuditEvent(firestore, organisationId, {
                    actorUid, actorName,
                    resource: 'fitUpItem',
                    resourceId: editingItem.id,
                    resourceName: trimmedName,
                    action: 'updated',
                    diff: Object.keys(diff).length > 0 ? diff : undefined,
                });
                toast({ title: 'Item updated', description: trimmedName });
            } else {
                const newRef = await addDoc(collection(firestore, 'organisations', organisationId, 'fitUpItems'), {
                    ...payload,
                    createdAt: serverTimestamp(),
                });
                void logFitUpAuditEvent(firestore, organisationId, {
                    actorUid, actorName,
                    resource: 'fitUpItem',
                    resourceId: newRef.id,
                    resourceName: trimmedName,
                    action: 'created',
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
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
                <DialogHeader className="px-6 pt-6 pb-3 border-b bg-gradient-to-b from-slate-50/80 to-transparent">
                    <DialogTitle className="text-xl font-black tracking-tight">{isEdit ? 'Edit fit-up item' : 'Add fit-up item'}</DialogTitle>
                    <DialogDescription className="text-xs">
                        Tier reflects effort / complexity. Cost is what it costs the dealer to deliver the item; sell price is what the customer pays.
                    </DialogDescription>
                </DialogHeader>

                <div className="px-6 py-5 space-y-5">
                    {/* ── Basics ── */}
                    <section className="rounded-2xl border-2 bg-white p-4 space-y-4">
                        <div className="flex items-center gap-2">
                            <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-700">Basics</p>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Name</label>
                            <Input
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="e.g., Sound system install"
                                className="rounded-xl border-2 h-10 font-semibold"
                                autoFocus
                            />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="space-y-1.5 md:col-span-3">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tier</label>
                                <div className="flex gap-2">
                                    {TIERS.map(t => (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => setTier(t)}
                                            className={`flex-1 rounded-xl border-2 px-3 py-2 text-[11px] font-black uppercase tracking-widest transition-all ${tier === t ? `${TIER_TONE[t] ?? 'bg-primary text-white border-primary'} ring-2 ring-primary/20 shadow-md` : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}
                                        >
                                            {TIER_LABEL[t]}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Cost ($)</label>
                                <Input
                                    type="number"
                                    inputMode="decimal"
                                    value={cost}
                                    onChange={e => setCost(e.target.value)}
                                    placeholder="0.00"
                                    className="rounded-xl border-2 h-10 tabular-nums font-bold"
                                    min="0"
                                    step="0.01"
                                />
                            </div>
                            <div className="space-y-1.5 md:col-span-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Sell price ($) — optional</label>
                                <Input
                                    type="number"
                                    inputMode="decimal"
                                    value={sellPrice}
                                    onChange={e => setSellPrice(e.target.value)}
                                    placeholder="Leave blank to derive from margin later"
                                    className="rounded-xl border-2 h-10 tabular-nums font-bold"
                                    min="0"
                                    step="0.01"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Category — optional</label>
                            <Input
                                value={category}
                                onChange={e => setCategory(e.target.value)}
                                placeholder="e.g., Rigging, Electronics, Safety"
                                className="rounded-xl border-2 h-9"
                                list="fit-up-category-suggestions"
                            />
                            <p className="text-[10px] text-muted-foreground">
                                Groups items in admin + the salesperson selector. Free-text — type to add a new one.
                            </p>
                        </div>
                    </section>

                    {/* ── Customer-facing ── */}
                    <section className="rounded-2xl border-2 bg-white p-4 space-y-4">
                        <div className="flex items-center gap-2">
                            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-700">Customer-facing</p>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Customer description — optional</label>
                            <Textarea
                                value={customerDescription}
                                onChange={e => setCustomerDescription(e.target.value)}
                                placeholder="What the customer should see on the quote (defaults to Name)"
                                className="rounded-xl border-2 text-xs"
                                rows={2}
                            />
                            <p className="text-[10px] text-muted-foreground">
                                Shown on the proposal&apos;s fit-up breakdown when expanded. Customer PDF still rolls up to a single &quot;Fit-up &amp; Rigging&quot; line by product decision.
                            </p>
                        </div>
                        <div className="grid grid-cols-[1fr_auto] gap-3 items-start">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Image URL — optional</label>
                                <Input
                                    value={imageUrl}
                                    onChange={e => setImageUrl(e.target.value)}
                                    placeholder="https://… (renders on catalog row + quote selector card)"
                                    className="rounded-xl border-2 h-9"
                                    type="url"
                                />
                            </div>
                            {imageUrl.trim() && (
                                // Native <img> per CLAUDE.md lesson — Next/Image breaks external CDNs.
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={imageUrl.trim()} alt="Preview" className="h-20 w-28 object-contain rounded-xl border-2 bg-white shadow-sm mt-5" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                            )}
                        </div>
                    </section>

                    {/* ── Internal ── */}
                    <section className="rounded-2xl border-2 bg-white p-4 space-y-3">
                        <div className="flex items-center gap-2">
                            <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-700">Internal — operator only</p>
                        </div>
                        <Textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Operator-only notes — never shown to the customer"
                            className="rounded-xl border-2 text-xs"
                            rows={2}
                        />
                    </section>

                    {/* ── Assignment scope (v1.11 Epic 9.2.1 — multi-level) ── */}
                    <section className="rounded-2xl border-2 bg-white p-4 space-y-4">
                        <div>
                            <div className="flex items-center gap-2">
                                <div className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-700">Assignment scope</p>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1">
                                Leave any level empty for &quot;no restriction at that level&quot;. When two or more levels have
                                picks, the item shows only when ALL non-empty levels match the current quote
                                (Modules AND Brands AND Ranges AND Models).
                            </p>
                            {loadingScope && (
                                <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                                    <Loader2 className="h-3 w-3 animate-spin" /> Loading brands / ranges / models…
                                </p>
                            )}
                        </div>

                        <ChipSection
                            label="Modules"
                            options={sortedModules.map(m => ({ id: m.id, label: m.name ?? m.slug ?? m.id }))}
                            selected={moduleIds}
                            onToggle={toggleModule}
                        />
                        <ChipSection
                            label="Brands"
                            options={scopeData.brands.map(b => ({ id: b.id, label: b.name ?? b.slug ?? b.id }))}
                            selected={brandIds}
                            onToggle={toggleBrand}
                        />
                        <ChipSection
                            label="Ranges"
                            options={visibleRanges.map(r => ({ id: r.id, label: `${r.vendorName ?? ''}${r.vendorName ? ' • ' : ''}${r.name ?? r.code ?? r.id}` }))}
                            selected={rangeIds}
                            onToggle={toggleRange}
                            hint={brandIds.length > 0 ? `Narrowed by ${brandIds.length} brand${brandIds.length === 1 ? '' : 's'}` : undefined}
                        />
                        <ChipSection
                            label="Models"
                            options={visibleModels.map(m => ({ id: m.id, label: `${m.modelCode ?? m.name ?? m.id}${m.name && m.modelCode ? ` — ${m.name}` : ''}` }))}
                            selected={modelIds}
                            onToggle={toggleModel}
                            hint={
                                modelIds.length === 0 && (brandIds.length > 0 || rangeIds.length > 0)
                                    ? 'Narrowed by selected brand/range'
                                    : undefined
                            }
                        />
                        {modelIds.length > 0 && (
                            <ChipSection
                                label="Variants (sub-models)"
                                options={visibleVariants.map(v => ({
                                    id: v.id,
                                    label: `${v.modelCode ?? ''}${v.modelCode ? ' • ' : ''}${[v.material, v.colorName].filter(Boolean).join(' / ') || v.name || v.id}`,
                                }))}
                                selected={variantIds}
                                onToggle={toggleVariant}
                                hint={visibleVariants.length === 0 ? 'Loading variants for the selected models…' : `Per-SKU restriction — leave empty to allow any variant of the selected models`}
                            />
                        )}
                    </section>

                    {/* v1.11 expansion-2 — soft "often paired with" hints. Optional. */}
                    <OftenPairedWithSection
                        organisationId={organisationId}
                        currentItemId={editingItem?.id ?? null}
                        selected={oftenPairedWith}
                        onToggle={togglePairedWith}
                    />
                </div>

                <DialogFooter className="px-6 py-4 border-t bg-slate-50/70 sticky bottom-0 backdrop-blur">
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

/** Multi-select chip row for the assignment-scope sections. */
function ChipSection({
    label, options, selected, onToggle, hint,
}: {
    label: string;
    options: { id: string; label: string }[];
    selected: string[];
    onToggle: (id: string) => void;
    hint?: string;
}) {
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-widest">{label}</label>
                <span className="text-[9px] text-muted-foreground">
                    {selected.length > 0 ? `${selected.length} selected` : `${options.length} available · empty = any`}
                </span>
            </div>
            {hint && <p className="text-[9px] text-muted-foreground italic">{hint}</p>}
            <div className="flex flex-wrap gap-1 p-1.5 rounded-lg border bg-white max-h-24 overflow-y-auto">
                {options.length === 0 ? (
                    <span className="text-[10px] text-muted-foreground italic px-1">—</span>
                ) : options.map(opt => {
                    const isOn = selected.includes(opt.id);
                    return (
                        <button
                            key={opt.id}
                            type="button"
                            onClick={() => onToggle(opt.id)}
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${isOn ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}
                        >
                            {opt.label}
                        </button>
                    );
                })}
            </div>
        </div>
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

// v1.11 expansion — Fit-Up packages.
//
// A package is a named bundle of fit-up item ids that a salesperson can
// toggle as a unit in the quote flow. Each package row stores the
// `itemIds` snapshot; the selector resolves them against the live catalog
// at pick time (so renaming / re-pricing an item is reflected in any
// quote built AFTER the change — already-finalised quotes still snapshot
// the resolved items individually). Deleting an item leaves a dangling
// reference in the package; we filter dangling ids at render time rather
// than maintaining referential integrity.

/** v1.11 follow-up — soft tag the salesperson flips at Step 5 to bias
 *  the suggested package toward the customer's actual boating context.
 *  Optional everywhere — leaving it null = "any". */
export type FitUpUseCase = 'offshore' | 'coastal' | 'inland' | 'tender';
export const USE_CASES: FitUpUseCase[] = ['offshore', 'coastal', 'inland', 'tender'];
export const USE_CASE_LABEL: Record<FitUpUseCase, string> = {
    offshore: 'Offshore',
    coastal: 'Coastal',
    inland: 'Inland',
    tender: 'Tender',
};

export interface FitUpPackage {
    id: string;
    name: string;
    description?: string | null;
    itemIds: string[];
    /** v1.11 expansion-2 — package-level sell-price override. When set,
     *  selecting the package on a quote distributes this amount across
     *  the member items proportionally as per-line priceOverrides. Null
     *  = sum of catalog member sells. */
    packagePrice?: number | null;
    /** v1.11 follow-up — when true, this package is one of the three
     *  primary tier choices (Simple / Medium / Complex) shown as the big
     *  cards at the top of Step 5. `tier` says which slot it fills. The
     *  quote selector picks the MOST SPECIFIC matching tier package per
     *  slot (modelIds > rangeIds > brandIds > moduleIds > unrestricted),
     *  so orgs can layer overrides without dropping a generic fallback. */
    isTierPackage?: boolean;
    tier?: Tier;
    /** v1.11 follow-up — scope allowlists. Same semantics as FitUpItem:
     *  empty array = no restriction at that level. When two or more lists
     *  are non-empty, all must match (AND). At quote time, each tier slot
     *  picks the most specific matching package. Lets orgs configure:
     *   - org-wide fallback (all lists empty)
     *   - per-range overrides (rangeIds: ['sport'])
     *   - per-model overrides (modelIds: ['sp560'])
     *   - per-brand / per-module scoping
     *   - per-use-case variants (useCase: 'offshore') */
    moduleIds?: string[];
    brandIds?: string[];
    rangeIds?: string[];
    modelIds?: string[];
    useCase?: FitUpUseCase | null;
    createdAt?: any;
    updatedAt?: any;
}

function FitUpPackagesManager({ organisationId, items }: { organisationId: string; items: FitUpItem[] }) {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();

    const packagesRef = useMemoFirebase(
        () => query(collection(firestore, 'organisations', organisationId, 'fitUpPackages'), orderBy('name', 'asc')),
        [firestore, organisationId],
    );
    const { data: packages, isLoading } = useCollection<FitUpPackage>(packagesRef);

    const [editorOpen, setEditorOpen] = useState(false);
    const [editingPackage, setEditingPackage] = useState<FitUpPackage | null>(null);

    const itemById = useMemo(() => {
        const map = new Map<string, FitUpItem>();
        for (const item of items) map.set(item.id, item);
        return map;
    }, [items]);

    const openCreate = () => {
        setEditingPackage(null);
        setEditorOpen(true);
    };
    const openEdit = (pkg: FitUpPackage) => {
        setEditingPackage(pkg);
        setEditorOpen(true);
    };
    const handleDelete = async (pkg: FitUpPackage) => {
        try {
            await deleteDoc(doc(firestore, 'organisations', organisationId, 'fitUpPackages', pkg.id));
            void logFitUpAuditEvent(firestore, organisationId, {
                actorUid: user?.uid || 'unknown',
                actorName: user?.displayName || user?.email || 'Someone',
                resource: 'fitUpPackage',
                resourceId: pkg.id,
                resourceName: pkg.name,
                action: 'deleted',
            });
            toast({ title: 'Package removed', description: pkg.name });
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Failed to remove package' });
        }
    };

    return (
        <Card className="rounded-2xl border-2">
            <CardHeader>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-base font-bold">
                            <Package className="h-4 w-4" />
                            Fit-Up Packages
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Bundle catalog items into named packages (e.g. "Coastal Setup"). Adding a package on a quote toggles every member item.
                        </CardDescription>
                    </div>
                    <Button size="sm" onClick={openCreate} className="rounded-xl" disabled={items.length === 0}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add package
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex items-center justify-center py-12 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        <span className="text-xs">Loading packages…</span>
                    </div>
                ) : items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center gap-2 border-2 border-dashed rounded-2xl text-muted-foreground">
                        <Package className="h-8 w-8 opacity-30" />
                        <p className="text-xs font-semibold">Add some items first — packages bundle items together.</p>
                    </div>
                ) : (packages ?? []).length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center gap-2 border-2 border-dashed rounded-2xl text-muted-foreground">
                        <Package className="h-8 w-8 opacity-30" />
                        <p className="text-xs font-semibold">No packages yet.</p>
                        <p className="text-[10px]">Click "Add package" to bundle items into a named set.</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {(packages ?? []).map(pkg => {
                            const resolved = pkg.itemIds.map(id => itemById.get(id)).filter(Boolean) as FitUpItem[];
                            const dangling = pkg.itemIds.length - resolved.length;
                            const memberTotal = resolved.reduce(
                                (a, i) => a + (i.sellPrice != null ? i.sellPrice : (i.cost ?? 0)),
                                0,
                            );
                            const hasOverride = pkg.packagePrice != null;
                            const total = hasOverride ? pkg.packagePrice! : memberTotal;
                            return (
                                <div key={pkg.id} className="p-3 rounded-xl border-2 hover:border-primary/40 transition-colors">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <p className="text-sm font-bold truncate">{pkg.name}</p>
                                                {pkg.isTierPackage && pkg.tier && (
                                                    <Badge variant="outline" className={`${TIER_TONE[pkg.tier]} text-[8px] font-black uppercase tracking-widest shrink-0`}>
                                                        ★ {TIER_LABEL[pkg.tier]} tier
                                                    </Badge>
                                                )}
                                            </div>
                                            {pkg.description && <p className="text-[10px] text-muted-foreground mt-0.5">{pkg.description}</p>}
                                            <div className="flex flex-wrap gap-1 mt-2">
                                                {resolved.map(item => (
                                                    <Badge key={item.id} variant="outline" className="text-[10px] font-semibold">
                                                        {item.name}
                                                    </Badge>
                                                ))}
                                                {dangling > 0 && (
                                                    <Badge variant="outline" className="text-[10px] font-semibold bg-amber-50 text-amber-800 border-amber-200">
                                                        {dangling} deleted item{dangling === 1 ? '' : 's'}
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-xs font-bold tabular-nums">${total.toLocaleString()}</p>
                                            <p className="text-[9px] text-muted-foreground">
                                                {resolved.length} item{resolved.length === 1 ? '' : 's'}
                                                {hasOverride && <span className="ml-1 text-amber-700 font-bold" title={`Bundle override: $${pkg.packagePrice!.toLocaleString()} (members sum to $${memberTotal.toLocaleString()})`}>(bundle)</span>}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => openEdit(pkg)}>
                                                <Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" onClick={() => handleDelete(pkg)}>
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>

            <FitUpPackageEditor
                open={editorOpen}
                onOpenChange={setEditorOpen}
                organisationId={organisationId}
                editingPackage={editingPackage}
                items={items}
            />
        </Card>
    );
}

function FitUpPackageEditor({
    open, onOpenChange, organisationId, editingPackage, items,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    organisationId: string;
    editingPackage: FitUpPackage | null;
    items: FitUpItem[];
}) {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();
    const isEdit = editingPackage !== null;

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [packagePrice, setPackagePrice] = useState('');
    const [isTierPackage, setIsTierPackage] = useState(false);
    const [tier, setTier] = useState<Tier>('simple');
    // v1.11 follow-up — scope allowlists. Comma-separated id input for now
    // (clean UI is a future iteration; the structured field types are correct).
    const [moduleIdsCsv, setModuleIdsCsv] = useState('');
    const [brandIdsCsv, setBrandIdsCsv] = useState('');
    const [rangeIdsCsv, setRangeIdsCsv] = useState('');
    const [modelIdsCsv, setModelIdsCsv] = useState('');
    const [useCase, setUseCase] = useState<FitUpUseCase | ''>('');
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState('');

    useEffect(() => {
        if (open) {
            setName(editingPackage?.name ?? '');
            setDescription(editingPackage?.description ?? '');
            setSelectedIds(new Set(editingPackage?.itemIds ?? []));
            setPackagePrice(editingPackage?.packagePrice != null ? String(editingPackage.packagePrice) : '');
            setIsTierPackage(editingPackage?.isTierPackage ?? false);
            setTier((editingPackage?.tier as Tier) ?? 'simple');
            setModuleIdsCsv((editingPackage?.moduleIds ?? []).join(', '));
            setBrandIdsCsv((editingPackage?.brandIds ?? []).join(', '));
            setRangeIdsCsv((editingPackage?.rangeIds ?? []).join(', '));
            setModelIdsCsv((editingPackage?.modelIds ?? []).join(', '));
            setUseCase((editingPackage?.useCase as FitUpUseCase) ?? '');
            setSearch('');
        }
    }, [open, editingPackage]);

    const visibleItems = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return items;
        return items.filter(i =>
            i.name.toLowerCase().includes(q)
            || (i.category ?? '').toLowerCase().includes(q)
            || (i.customerDescription ?? '').toLowerCase().includes(q),
        );
    }, [items, search]);

    const toggleItem = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const handleSave = async () => {
        const trimmed = name.trim();
        if (!trimmed) {
            toast({ variant: 'destructive', title: 'Name required' });
            return;
        }
        if (selectedIds.size === 0) {
            toast({ variant: 'destructive', title: 'Pick at least one item' });
            return;
        }
        // v1.11 expansion-2 — package-level price override. Empty input
        // means "no override" (members sum at quote time). Invalid input
        // honest-fails with a toast rather than silently dropping.
        const parsedPackagePrice = packagePrice.trim() === '' ? null : parseFloat(packagePrice);
        if (parsedPackagePrice !== null && (!Number.isFinite(parsedPackagePrice) || parsedPackagePrice < 0)) {
            toast({ variant: 'destructive', title: 'Package price must be a non-negative number' });
            return;
        }
        setSaving(true);
        try {
            const csvToList = (s: string) =>
                s.split(',').map(x => x.trim()).filter(Boolean);
            const payload = {
                name: trimmed,
                description: description.trim() || null,
                itemIds: Array.from(selectedIds),
                packagePrice: parsedPackagePrice,
                // v1.11 follow-up — tier-package flags. When isTierPackage is
                // false we still persist tier:null so toggling off a tier
                // package cleanly demotes it back to a bonus bundle.
                isTierPackage,
                tier: isTierPackage ? tier : null,
                // v1.11 follow-up — scope allowlists. Empty arrays = unrestricted
                // at that level. Resolution picks the most specific match per tier.
                moduleIds: csvToList(moduleIdsCsv),
                brandIds: csvToList(brandIdsCsv),
                rangeIds: csvToList(rangeIdsCsv),
                modelIds: csvToList(modelIdsCsv),
                useCase: useCase || null,
                updatedAt: serverTimestamp(),
            };
            const actorUid = user?.uid || 'unknown';
            const actorName = user?.displayName || user?.email || 'Someone';
            if (isEdit && editingPackage) {
                await updateDoc(doc(firestore, 'organisations', organisationId, 'fitUpPackages', editingPackage.id), payload);
                const diff = shallowDiff(editingPackage as any, payload, ['name', 'description', 'itemIds', 'packagePrice']);
                void logFitUpAuditEvent(firestore, organisationId, {
                    actorUid, actorName,
                    resource: 'fitUpPackage',
                    resourceId: editingPackage.id,
                    resourceName: trimmed,
                    action: 'updated',
                    diff: Object.keys(diff).length > 0 ? diff : undefined,
                });
                toast({ title: 'Package updated', description: trimmed });
            } else {
                const newRef = await addDoc(collection(firestore, 'organisations', organisationId, 'fitUpPackages'), {
                    ...payload,
                    createdAt: serverTimestamp(),
                });
                void logFitUpAuditEvent(firestore, organisationId, {
                    actorUid, actorName,
                    resource: 'fitUpPackage',
                    resourceId: newRef.id,
                    resourceName: trimmed,
                    action: 'created',
                });
                toast({ title: 'Package added', description: trimmed });
            }
            onOpenChange(false);
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Failed to save package' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>{isEdit ? 'Edit package' : 'Add package'}</DialogTitle>
                    <DialogDescription className="text-xs">
                        Bundle catalog items into a named package. Salespeople pick the package and every item turns on at once.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold">Name</label>
                        <Input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g., Coastal Setup"
                            className="rounded-xl border-2"
                            autoFocus
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold">Description — optional</label>
                        <Textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="What the salesperson should know about this package"
                            className="rounded-xl border-2 text-xs"
                            rows={2}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold">Package price ($) — optional</label>
                        <Input
                            type="number"
                            inputMode="decimal"
                            value={packagePrice}
                            onChange={e => setPackagePrice(e.target.value)}
                            placeholder="Blank = sum member items at quote time"
                            className="rounded-xl border-2 tabular-nums"
                            min="0"
                            step="0.01"
                        />
                        <p className="text-[10px] text-muted-foreground">
                            Set a single bundled price (e.g. "Coastal Setup — $1,200 all-in"). At quote time it's distributed proportionally across the member items as per-line overrides, so the margin still allocates correctly.
                        </p>
                    </div>

                    {/* v1.11 follow-up — tier-package promotion. A tier package
                        is one of the three big primary cards (Simple / Medium /
                        Complex) at the top of Step 5. Non-tier packages stay in
                        the bonus-bundle strip. */}
                    <div className="rounded-xl border-2 p-3 space-y-3 bg-slate-50/40">
                        <label className="flex items-center gap-2.5 cursor-pointer">
                            <Checkbox checked={isTierPackage} onCheckedChange={v => setIsTierPackage(!!v)} />
                            <div className="min-w-0">
                                <p className="text-xs font-semibold">Primary tier package</p>
                                <p className="text-[10px] text-muted-foreground leading-tight">
                                    Show this as one of the three big Simple / Medium / Complex cards at the top of Step 5 (instead of a bonus bundle).
                                </p>
                            </div>
                        </label>
                        {isTierPackage && (
                            <div className="space-y-1.5 pl-7">
                                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Which tier slot</label>
                                <Select value={tier} onValueChange={v => setTier(v as Tier)}>
                                    <SelectTrigger className="rounded-xl border-2 h-9 font-bold">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {TIERS.map(t => (
                                            <SelectItem key={t} value={t}>{TIER_LABEL[t]}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-[10px] text-muted-foreground">If multiple packages share a tier slot, the quote picks the most specific scope match (model &gt; range &gt; brand &gt; module &gt; unrestricted).</p>
                            </div>
                        )}
                    </div>

                    {/* v1.11 follow-up — scope allowlists. Per-range, per-model,
                        per-brand, per-module overrides + soft use-case tag.
                        Empty = applies everywhere (the org-wide fallback). */}
                    <div className="rounded-xl border-2 p-3 space-y-3 bg-slate-50/40">
                        <div>
                            <p className="text-xs font-semibold">Scope — where this package applies</p>
                            <p className="text-[10px] text-muted-foreground leading-tight">
                                Leave blank to apply org-wide (the fallback). Add IDs to override per range / model / brand / module. Comma-separated.
                            </p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Ranges</label>
                                <Input value={rangeIdsCsv} onChange={e => setRangeIdsCsv(e.target.value)} placeholder="e.g., sport, patrol" className="rounded-lg border-2 h-8 text-xs" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Models</label>
                                <Input value={modelIdsCsv} onChange={e => setModelIdsCsv(e.target.value)} placeholder="e.g., sp560, cl380" className="rounded-lg border-2 h-8 text-xs" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Brands</label>
                                <Input value={brandIdsCsv} onChange={e => setBrandIdsCsv(e.target.value)} placeholder="vendor IDs" className="rounded-lg border-2 h-8 text-xs" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Modules</label>
                                <Input value={moduleIdsCsv} onChange={e => setModuleIdsCsv(e.target.value)} placeholder="module IDs" className="rounded-lg border-2 h-8 text-xs" />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Use case (soft tag)</label>
                            <Select value={useCase || 'none'} onValueChange={v => setUseCase(v === 'none' ? '' : v as FitUpUseCase)}>
                                <SelectTrigger className="rounded-lg border-2 h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">No tag — any use case</SelectItem>
                                    {USE_CASES.map(uc => (
                                        <SelectItem key={uc} value={uc}>{USE_CASE_LABEL[uc]}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-[10px] text-muted-foreground">Salesperson flips the use-case at Step 5; the matching variant gets the Suggested badge.</p>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold">Items ({selectedIds.size} selected)</label>
                        <Input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Filter items…"
                            className="rounded-xl border-2 h-8 text-xs"
                        />
                        <div className="border-2 rounded-xl max-h-64 overflow-y-auto divide-y">
                            {visibleItems.length === 0 ? (
                                <p className="p-3 text-[10px] text-muted-foreground text-center italic">No matching items.</p>
                            ) : visibleItems.map(item => {
                                const isSelected = selectedIds.has(item.id);
                                return (
                                    <label
                                        key={item.id}
                                        className={`flex items-center gap-3 p-2 cursor-pointer hover:bg-slate-50 ${isSelected ? 'bg-primary/5' : ''}`}
                                    >
                                        <Checkbox checked={isSelected} onCheckedChange={() => toggleItem(item.id)} />
                                        <Badge variant="outline" className={`${TIER_TONE[item.tier]} text-[9px] font-bold uppercase shrink-0`}>
                                            {TIER_LABEL[item.tier]}
                                        </Badge>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-semibold truncate">{item.name}</p>
                                            {item.category && <p className="text-[9px] text-muted-foreground">{item.category}</p>}
                                        </div>
                                        <p className="text-xs font-bold tabular-nums shrink-0">
                                            ${(item.sellPrice != null ? item.sellPrice : (item.cost ?? 0)).toLocaleString()}
                                        </p>
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="rounded-xl">
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={saving} className="rounded-xl">
                        {saving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                        {isEdit ? 'Save changes' : 'Add package'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/**
 * v1.11 expansion-2 — Soft "often paired with" hints.
 *
 * Lets the catalog operator pick a few sibling items that "tend to be
 * sold together". The quote selector reads `oftenPairedWith` on each
 * SELECTED item and highlights the suggestions in the grid — NOT a
 * hard rule (no auto-add), just an ✦ visual cue. The full operator-
 * authored conditional rule engine remains Epic 9.3.1 / v2.2.
 *
 * Self-references are excluded — editing item X never shows X in its
 * own paired-with picker.
 */
function OftenPairedWithSection({
    organisationId, currentItemId, selected, onToggle,
}: {
    organisationId: string;
    currentItemId: string | null;
    selected: string[];
    onToggle: (id: string) => void;
}) {
    const firestore = useFirestore();
    const itemsRef = useMemoFirebase(
        () => collection(firestore, 'organisations', organisationId, 'fitUpItems'),
        [firestore, organisationId],
    );
    const { data: allItems } = useCollection<FitUpItem>(itemsRef);
    const [search, setSearch] = useState('');

    const candidates = useMemo(() => {
        const list = (allItems ?? []).filter(i => i.id !== currentItemId);
        const q = search.trim().toLowerCase();
        if (!q) return list;
        return list.filter(i =>
            i.name.toLowerCase().includes(q)
            || (i.category ?? '').toLowerCase().includes(q),
        );
    }, [allItems, currentItemId, search]);

    return (
        <div className="rounded-xl border-2 p-3 space-y-2 bg-slate-50/50">
            <div>
                <p className="text-xs font-bold">Often paired with — optional</p>
                <p className="text-[10px] text-muted-foreground">
                    Sibling items that tend to be sold together. When this item is selected on a quote, the selector highlights the paired items with an ✦. Soft hint — never auto-adds.
                </p>
            </div>
            <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filter sibling items…"
                className="rounded-lg border-2 h-8 text-xs"
            />
            <div className="flex flex-wrap gap-1 p-1.5 rounded-lg border bg-white max-h-28 overflow-y-auto">
                {candidates.length === 0 ? (
                    <span className="text-[10px] text-muted-foreground italic px-1">—</span>
                ) : candidates.map(item => {
                    const isOn = selected.includes(item.id);
                    return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => onToggle(item.id)}
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${isOn ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}
                            title={`${item.tier} · $${(item.sellPrice ?? item.cost ?? 0).toLocaleString()}`}
                        >
                            {item.name}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

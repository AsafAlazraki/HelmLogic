
'use client';

/**
 * FitUpCatalogManager (v1.9.5.1 — Epic 9.1.1 + 9.1.2 groundwork).
 *
 * Org-level master catalog of fit-up items. Each item has a name, a
 * tier (simple | medium | complex), a cost (dollars to the dealer),
 * and an optional sell price + notes. Lives at
 * `organisations/{orgId}/fitUpItems/{itemId}`.
 *
 * v1.9.5.1 scope: schema + admin CRUD only. NOT wired into the quote
 * flow yet (that's 9.2.1 / 9.2.2 / 9.2.3 — v1.16+). The catalog exists
 * so dealer-admins can begin populating their fit-up library before
 * the salesperson-facing surfaces land.
 *
 * Mirrors the dealerFit pattern (dealer-fit-options.tsx +
 * module-dealer-fit-manager.tsx) but with a richer schema: dealerFit
 * categories are bare strings on the module doc; fit-up items are
 * full docs in a subcollection because they carry cost + tier + notes
 * per item, not just a name. Same isSignedIn() rules-layer gating;
 * UI-layer org-admin gate is the can_access_settings permission on
 * the parent /manage page.
 */

import { useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Wrench, Loader2 } from 'lucide-react';
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
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Failed to remove item' });
        }
    };

    return (
        <Card className="rounded-2xl border-2">
            <CardHeader>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-base font-bold">
                            <Wrench className="h-4 w-4" />
                            Fit-Up Catalog
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Master library of fit-up items (rigging, installation, prep). Cost + tier per item. Used by the salesperson fit-up workspace once that ships (Epic 9.2 — v1.16+).
                        </CardDescription>
                    </div>
                    <Button size="sm" onClick={openCreate} className="rounded-xl">
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add item
                    </Button>
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
                                : 'No fit-up items yet. Add your first one above.'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {filtered.map(item => (
                            <FitUpItemRow
                                key={item.id}
                                item={item}
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
        </Card>
    );
}

function FitUpItemRow({ item, onEdit, onDelete }: { item: FitUpItem; onEdit: () => void; onDelete: () => void }) {
    return (
        <div className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200">
            <div className="flex items-center gap-3 min-w-0">
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

    useMemo(() => {
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

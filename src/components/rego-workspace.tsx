'use client';

/**
 * RegoWorkspace — module view for `moduleType === 'rego'`.
 *
 * Shows Rego Authority vendors assigned to the module, and lets admins
 * CRUD `regoTypes` under each vendor. The regoTypes flow into the quote
 * rego pickers (boat & trailer) via RegoPicker.
 *
 * Collection layout:
 *   data-warehouse/{regoVendorId}/regoTypes/{regoTypeId}
 *     name: 'Small Trailers - Up to 1.02t'
 *     sellExclGst: 151
 *     appliesTo: 'boat' | 'trailer' | 'both'
 *     description?: string
 *     isActive?: boolean
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { collection, doc, setDoc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { FileCheck, Settings as SettingsIcon, Plus, Pencil, Trash2, Ship, Truck, Tag } from 'lucide-react';
import { ModuleSettingsPanel } from '@/components/module-settings-panel';
import { formatCurrency } from '@/lib/currency-utils';

interface RegoVendor {
    id: string;
    name: string;
    state?: string;
    vendorType?: string;
    logoUrl?: string;
}

interface RegoType {
    id: string;
    name: string;
    sellExclGst?: number;
    /** v1.33 (Bill: "Build pricing into rego STICKER data base module") —
     *  buy price so sticker margin is tracked alongside sell. */
    costExclGst?: number;
    /** 'sticker' + 'fee' kinds live alongside boat/trailer rego bands —
     *  MPF-imported rows already carry 'fee'. */
    appliesTo?: 'boat' | 'trailer' | 'both' | 'sticker' | 'fee';
    description?: string;
    isActive?: boolean;
    vendorId?: string;
    /** v1.11 — auto-match band rules. */
    minLengthM?: number;
    maxLengthM?: number;
    minAtmKg?: number;
    maxAtmKg?: number;
}

interface RegoWorkspaceProps {
    organisationId: string;
    isAdmin: boolean;
    moduleId: string;
    moduleData: any;
}

type TabKey = 'types' | 'settings';

const TABS: { key: TabKey; label: string; icon: ReactNode }[] = [
    { key: 'types', label: 'Rego Types', icon: <FileCheck className="h-4 w-4" /> },
    { key: 'settings', label: 'Settings', icon: <SettingsIcon className="h-4 w-4" /> },
];

function appliesToIcon(applies?: string) {
    if (applies === 'boat') return <Ship className="h-3 w-3" />;
    if (applies === 'trailer') return <Truck className="h-3 w-3" />;
    if (applies === 'sticker') return <Tag className="h-3 w-3" />;
    return <FileCheck className="h-3 w-3" />;
}

function appliesToLabel(applies?: string) {
    if (applies === 'boat') return 'Boat';
    if (applies === 'trailer') return 'Trailer';
    if (applies === 'both') return 'Boat + Trailer';
    if (applies === 'sticker') return 'Sticker';
    if (applies === 'fee') return 'Fee';
    return 'Both';
}

// ---------------------------------------------------------------------------
// RegoTypeForm — add/edit dialog
// ---------------------------------------------------------------------------

function RegoTypeFormDialog({
    open,
    onOpenChange,
    vendor,
    existing,
    onSaved,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    vendor: RegoVendor;
    existing?: RegoType | null;
    onSaved: () => void;
}) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [name, setName] = useState('');
    const [sell, setSell] = useState('');
    const [cost, setCost] = useState('');
    const [appliesTo, setAppliesTo] = useState<'boat' | 'trailer' | 'both' | 'sticker' | 'fee'>('both');
    const [description, setDescription] = useState('');
    const [isActive, setIsActive] = useState(true);
    const [minLengthM, setMinLengthM] = useState('');
    const [maxLengthM, setMaxLengthM] = useState('');
    const [minAtmKg, setMinAtmKg] = useState('');
    const [maxAtmKg, setMaxAtmKg] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        setName(existing?.name || '');
        setSell(existing?.sellExclGst != null ? String(existing.sellExclGst) : '');
        setCost(existing?.costExclGst != null ? String(existing.costExclGst) : '');
        setAppliesTo(existing?.appliesTo || 'both');
        setDescription(existing?.description || '');
        setIsActive(existing?.isActive !== false);
        setMinLengthM(existing?.minLengthM != null ? String(existing.minLengthM) : '');
        setMaxLengthM(existing?.maxLengthM != null ? String(existing.maxLengthM) : '');
        setMinAtmKg(existing?.minAtmKg != null ? String(existing.minAtmKg) : '');
        setMaxAtmKg(existing?.maxAtmKg != null ? String(existing.maxAtmKg) : '');
    }, [open, existing]);

    async function handleSave() {
        if (!name.trim()) {
            toast({ variant: 'destructive', title: 'Name is required' });
            return;
        }
        setSaving(true);
        try {
            const typesCol = collection(firestore, `data-warehouse/${vendor.id}/regoTypes`);
            const ref = existing ? doc(typesCol, existing.id) : doc(typesCol);
            const num = (s: string) => (s.trim() === '' ? null : Number(s));
            const payload: any = {
                name: name.trim(),
                sellExclGst: sell.trim() === '' ? null : Number(sell),
                costExclGst: cost.trim() === '' ? null : Number(cost),
                appliesTo,
                description: description.trim() || null,
                isActive,
                // v1.11 — band rules for auto-association by boat length /
                // trailer ATM. Empty = no auto-match (manual pick only).
                minLengthM: num(minLengthM),
                maxLengthM: num(maxLengthM),
                minAtmKg: num(minAtmKg),
                maxAtmKg: num(maxAtmKg),
                updatedAt: Date.now(),
            };
            if (!existing) payload.createdAt = Date.now();
            await setDoc(ref, payload, { merge: true });
            toast({ title: existing ? 'Rego type updated' : 'Rego type created' });
            onSaved();
            onOpenChange(false);
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: err?.message });
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{existing ? 'Edit Rego Type' : 'Add Rego Type'}</DialogTitle>
                    <DialogDescription>
                        Configure a registration type for {vendor.name}.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-widest">Name</Label>
                        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Small Trailers - Up to 1.02t" />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest">Sell Ex GST</Label>
                            <Input type="number" inputMode="decimal" value={sell} onChange={e => setSell(e.target.value)} placeholder="151" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest">Cost Ex GST</Label>
                            <Input type="number" inputMode="decimal" value={cost} onChange={e => setCost(e.target.value)} placeholder="90" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest">Applies To</Label>
                            <Select value={appliesTo} onValueChange={(v) => setAppliesTo(v as any)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="both">Boat + Trailer</SelectItem>
                                    <SelectItem value="boat">Boat</SelectItem>
                                    <SelectItem value="trailer">Trailer</SelectItem>
                                    <SelectItem value="sticker">Sticker</SelectItem>
                                    <SelectItem value="fee">Fee</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    {/* v1.11 — auto-match band rules. Boat bands use hull
                        length (m); trailer bands use ATM (kg). Leave empty
                        for manual-pick-only types. */}
                    {(appliesTo === 'boat' || appliesTo === 'both') && (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase tracking-widest">Min length (m)</Label>
                                <Input type="number" inputMode="decimal" value={minLengthM} onChange={e => setMinLengthM(e.target.value)} placeholder="0" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase tracking-widest">Max length (m)</Label>
                                <Input type="number" inputMode="decimal" value={maxLengthM} onChange={e => setMaxLengthM(e.target.value)} placeholder="4.5" />
                            </div>
                        </div>
                    )}
                    {(appliesTo === 'trailer' || appliesTo === 'both') && (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase tracking-widest">Min ATM (kg)</Label>
                                <Input type="number" inputMode="decimal" value={minAtmKg} onChange={e => setMinAtmKg(e.target.value)} placeholder="0" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase tracking-widest">Max ATM (kg)</Label>
                                <Input type="number" inputMode="decimal" value={maxAtmKg} onChange={e => setMaxAtmKg(e.target.value)} placeholder="750" />
                            </div>
                        </div>
                    )}
                    <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-widest">Description</Label>
                        <Textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional note for sellers" />
                    </div>
                    <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
                        <span>Active (hide from pickers when off)</span>
                    </label>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
                    <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ---------------------------------------------------------------------------
// VendorSection — one rego vendor with its types
// ---------------------------------------------------------------------------

function VendorSection({ vendor, isAdmin }: { vendor: RegoVendor; isAdmin: boolean }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const typesQuery = useMemoFirebase(
        () => collection(firestore, `data-warehouse/${vendor.id}/regoTypes`),
        [firestore, vendor.id],
    );
    const { data: types } = useCollection<RegoType>(typesQuery);
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<RegoType | null>(null);

    const sorted = useMemo(() => {
        return [...(types || [])].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [types]);

    async function handleDelete(t: RegoType) {
        if (!confirm(`Delete "${t.name}"?`)) return;
        try {
            await deleteDoc(doc(firestore, `data-warehouse/${vendor.id}/regoTypes/${t.id}`));
            toast({ title: 'Rego type deleted' });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Delete failed', description: err?.message });
        }
    }

    return (
        <Card className="rounded-2xl border-2">
            <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div>
                    <CardTitle className="text-base font-black uppercase tracking-tight">{vendor.name}</CardTitle>
                    <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        {vendor.state ? `${vendor.state} · ` : ''}Rego Authority
                    </CardDescription>
                </div>
                {isAdmin && (
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-8 font-black text-[10px] uppercase tracking-widest"
                        onClick={() => { setEditing(null); setFormOpen(true); }}
                    >
                        <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Type
                    </Button>
                )}
            </CardHeader>
            <CardContent>
                {sorted.length === 0 && (
                    <p className="text-xs text-slate-400 italic">
                        No rego types yet. {isAdmin ? 'Add one to make it available in quote pickers.' : ''}
                    </p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {sorted.map(t => (
                        <div
                            key={t.id}
                            className={`flex items-center justify-between p-3 rounded-xl border-2 ${
                                t.isActive === false ? 'opacity-60 border-dashed' : 'border-slate-100'
                            }`}
                        >
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <p className="text-[11px] font-black uppercase tracking-tight truncate">{t.name}</p>
                                    <Badge variant="outline" className="h-4 text-[8px] font-bold gap-1">
                                        {appliesToIcon(t.appliesTo)}
                                        {appliesToLabel(t.appliesTo)}
                                    </Badge>
                                    {t.isActive === false && (
                                        <Badge variant="outline" className="h-4 text-[8px] border-red-300 text-red-600">Inactive</Badge>
                                    )}
                                </div>
                                {t.description && <p className="text-[9px] text-slate-400 mt-0.5 truncate">{t.description}</p>}
                                <p className="text-[10px] font-black text-primary mt-1">
                                    {t.sellExclGst != null ? `${formatCurrency(t.sellExclGst)} ex GST` : '—'}
                                    {t.costExclGst != null && (
                                        <span className="text-slate-400 font-bold"> · cost {formatCurrency(t.costExclGst)}</span>
                                    )}
                                </p>
                            </div>
                            {isAdmin && (
                                <div className="flex gap-1 shrink-0 ml-2">
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(t); setFormOpen(true); }}>
                                        <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:bg-red-50" onClick={() => handleDelete(t)}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </CardContent>
            <RegoTypeFormDialog
                open={formOpen}
                onOpenChange={setFormOpen}
                vendor={vendor}
                existing={editing}
                onSaved={() => { /* useCollection reacts automatically */ }}
            />
        </Card>
    );
}

// ---------------------------------------------------------------------------
// Main workspace
// ---------------------------------------------------------------------------

export function RegoWorkspace({ organisationId, isAdmin, moduleId, moduleData }: RegoWorkspaceProps) {
    const firestore = useFirestore();
    const { toast } = useToast();

    const [activeTab, setActiveTab] = useState<TabKey>(() => {
        if (typeof window === 'undefined') return 'types';
        const sp = new URLSearchParams(window.location.search);
        return (sp.get('regoTab') as TabKey) || 'types';
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const sp = new URLSearchParams(window.location.search);
        sp.set('regoTab', activeTab);
        window.history.replaceState({}, '', `${window.location.pathname}?${sp.toString()}`);
    }, [activeTab]);

    const regoVendorIds: string[] = Array.isArray(moduleData?.regoVendorIds) ? moduleData.regoVendorIds : [];

    const vendorsQuery = useMemoFirebase(() => {
        if (!regoVendorIds.length) return null;
        return query(
            collection(firestore, 'data-warehouse'),
            where('__name__', 'in', regoVendorIds.slice(0, 30)),
        );
    }, [firestore, regoVendorIds.join(',')]);
    const { data: vendors } = useCollection<RegoVendor>(vendorsQuery);

    // Settings tab: multi-select of available Rego Authority vendors
    const allRegoAuthoritiesQuery = useMemoFirebase(
        () => query(collection(firestore, 'data-warehouse'), where('vendorType', '==', 'Rego Authority')),
        [firestore],
    );
    const { data: allRegoAuthorities } = useCollection<RegoVendor>(allRegoAuthoritiesQuery);

    async function toggleVendor(vendorId: string, include: boolean) {
        const next = new Set(regoVendorIds);
        if (include) next.add(vendorId);
        else next.delete(vendorId);
        try {
            await updateDoc(doc(firestore, 'modules', moduleId), {
                regoVendorIds: Array.from(next),
            });
            toast({ title: 'Module updated' });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Update failed', description: err?.message });
        }
    }

    const sortedVendors = useMemo(() => {
        return [...(vendors || [])].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [vendors]);

    return (
        <div className="flex flex-col h-full">
            <div className="shrink-0 px-8 pt-6 border-b-2 border-slate-100 bg-white">
                <div className="flex gap-1">
                    {TABS.map(t => (
                        <button
                            key={t.key}
                            onClick={() => setActiveTab(t.key)}
                            className={`flex items-center gap-2 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest border-b-2 transition-colors ${
                                activeTab === t.key
                                    ? 'text-primary border-primary'
                                    : 'text-slate-500 border-transparent hover:text-slate-900'
                            }`}
                        >
                            {t.icon}{t.label}
                        </button>
                    ))}
                </div>
            </div>
            <ScrollArea className="flex-1">
                <div className="p-8">
                    {activeTab === 'types' && (
                        <div className="space-y-6 max-w-5xl mx-auto">
                            {sortedVendors.length === 0 && (
                                <Card className="rounded-2xl border-2 border-dashed">
                                    <CardContent className="py-12 text-center">
                                        <FileCheck className="h-10 w-10 mx-auto text-slate-300 mb-3" />
                                        <p className="text-xs font-black uppercase tracking-widest text-slate-500">No rego authorities assigned</p>
                                        <p className="text-[11px] text-slate-400 mt-1">Add a Rego Authority vendor in the Settings tab.</p>
                                    </CardContent>
                                </Card>
                            )}
                            {sortedVendors.map(v => (
                                <VendorSection key={v.id} vendor={v} isAdmin={isAdmin} />
                            ))}
                        </div>
                    )}
                    {activeTab === 'settings' && (
                        <ModuleSettingsPanel
                            moduleId={moduleId}
                            moduleData={moduleData}
                            organisationId={organisationId}
                            isAdmin={isAdmin}
                            showDealerFit={false}
                            preCards={
                                <Card className="rounded-2xl border-2">
                                    <CardHeader>
                                        <CardTitle className="text-base font-black uppercase">Rego Authorities</CardTitle>
                                        <CardDescription>
                                            Tick the registration authorities this module uses (e.g. QLD Transport).
                                            Only vendors with <code>vendorType = &quot;Rego Authority&quot;</code> appear here.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        {(!allRegoAuthorities || allRegoAuthorities.length === 0) && (
                                            <p className="text-xs text-slate-400 italic">
                                                No rego authority vendors exist. Create one at <code>/data-warehouse/add</code>.
                                            </p>
                                        )}
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                            {(allRegoAuthorities || []).map(v => {
                                                const checked = regoVendorIds.includes(v.id);
                                                return (
                                                    <label
                                                        key={v.id}
                                                        className={`flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                                                            checked ? 'border-primary bg-primary/5' : 'border-slate-100 hover:border-primary/30'
                                                        }`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={e => isAdmin && toggleVendor(v.id, e.target.checked)}
                                                            disabled={!isAdmin}
                                                        />
                                                        <div className="min-w-0">
                                                            <p className="text-[11px] font-black uppercase tracking-tight truncate">{v.name}</p>
                                                            {v.state && <p className="text-[9px] text-slate-400 uppercase tracking-widest">{v.state}</p>}
                                                        </div>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </CardContent>
                                </Card>
                            }
                        />
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}

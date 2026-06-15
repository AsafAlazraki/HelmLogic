
'use client';

/**
 * BoatsTableView (v1.10 — Story 3.7.2).
 *
 * Read-view of the boat catalogue: model rows, expandable to variant
 * sub-rows. One row per model with code / name / range / cost / sell.
 * Click a row to expand and reveal its variants (material × colour
 * SKUs with their own pricing). Picks the active boat vendor via
 * a dropdown at the top.
 *
 * Read-only by design — editing happens in the existing module page
 * (highfield-model-editor + range / model editors). This is a quick-
 * audit surface for dealer-admins to scan the whole catalogue and
 * spot pricing anomalies + missing variants. The v1.10 acceptance
 * was "model rows, expandable to variant sub-rows" — kept tight.
 *
 * Fetches: `data-warehouse/{vendorId}/ranges` → for each range,
 * `models` → on row-expand, `models/{modelId}/variants`. Variants
 * are lazy-loaded per-row to keep the initial render fast even
 * across vendors with hundreds of models.
 *
 * Pricing uses the same `sellPriceExclGst` field as the rest of the
 * app + the same formatCurrency helper. GST application stays in
 * the quote-finalize layer, this view shows ex-GST always (with a
 * small "ex GST" label on each price column for clarity).
 */

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronDown, Ship, Search, Loader2, Hash, Plus, Trash2, Pencil } from 'lucide-react';
import { formatCurrency } from '@/lib/currency-utils';
import { cn } from '@/lib/utils';
import { InlineEditCell } from '@/components/inline-edit-cell';
import { FeatureRichTextEditor } from '@/components/feature-rich-text-editor';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Vendor {
    id: string;
    name?: string;
    slug?: string;
    vendorType?: string;
}

interface Range {
    id: string;
    name?: string;
    code?: string;
}

interface Model {
    id: string;
    name?: string;
    modelCode?: string;
    rangeId?: string;
    rangeName?: string;
    cost?: number | null;
    sellPriceExclGst?: number | null;
    coverImageUrl?: string | null;
    marketingTagline?: string | null;
    marketingDescription?: string | null;
}

interface Variant {
    id: string;
    name?: string;
    material?: string;
    color?: string;
    sku?: string;
    sellPriceExclGst?: number | null;
    cost?: number | null;
}

export function BoatsTableView() {
    const firestore = useFirestore();

    // Boat-brand vendors only — the table is named "Boats" for a reason;
    // motor / trailer vendors live in their own catalogue views.
    const vendorsQuery = useMemoFirebase(
        () => query(collection(firestore, 'data-warehouse'), where('vendorType', '==', 'Boat Brand')),
        [firestore],
    );
    const { data: vendors, isLoading: vendorsLoading } = useCollection<Vendor>(vendorsQuery);

    const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);

    // Auto-pick the first boat vendor once vendors load.
    useEffect(() => {
        if (!selectedVendorId && vendors && vendors.length > 0) {
            setSelectedVendorId(vendors[0].id);
        }
    }, [vendors, selectedVendorId]);

    return (
        <Card className="rounded-2xl border-2">
            <CardHeader>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-base font-bold">
                            <Ship className="h-4 w-4" />
                            Boats Catalogue (read-view)
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Every model in the selected boat brand, with its variants underneath. Click a row to expand.
                            Edits happen in the module page — this view is for fast catalogue audits.
                        </CardDescription>
                    </div>
                    <div className="min-w-[220px]">
                        <Select
                            value={selectedVendorId ?? ''}
                            onValueChange={v => setSelectedVendorId(v)}
                        >
                            <SelectTrigger className="rounded-xl border-2 text-xs">
                                <SelectValue placeholder={vendorsLoading ? 'Loading…' : 'Select a brand'} />
                            </SelectTrigger>
                            <SelectContent>
                                {(vendors ?? []).map(v => (
                                    <SelectItem key={v.id} value={v.id}>{v.name ?? v.slug ?? v.id}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {!selectedVendorId ? (
                    <EmptyState message="Pick a brand to view the catalogue." />
                ) : (
                    <BoatsTableBody vendorId={selectedVendorId} />
                )}
            </CardContent>
        </Card>
    );
}

function EmptyState({ message }: { message: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-2 border-2 border-dashed rounded-2xl text-muted-foreground">
            <Ship className="h-8 w-8 opacity-30" />
            <p className="text-xs font-semibold">{message}</p>
        </div>
    );
}

function BoatsTableBody({ vendorId }: { vendorId: string }) {
    const firestore = useFirestore();
    const [models, setModels] = useState<Model[]>([]);
    const [ranges, setRanges] = useState<Range[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        let cancelled = false;
        const fetchAll = async () => {
            setLoading(true);
            setModels([]);
            setRanges([]);
            try {
                const rangesSnap = await getDocs(collection(firestore, 'data-warehouse', vendorId, 'ranges'));
                const rangeList: Range[] = [];
                rangesSnap.forEach(r => rangeList.push({ id: r.id, ...(r.data() as any) }));
                if (cancelled) return;
                setRanges(rangeList);

                const modelLists = await Promise.all(rangeList.map(r =>
                    getDocs(collection(firestore, 'data-warehouse', vendorId, 'ranges', r.id, 'models')),
                ));
                if (cancelled) return;
                const all: Model[] = [];
                rangeList.forEach((r, idx) => {
                    modelLists[idx].forEach(m => {
                        all.push({
                            id: m.id,
                            rangeId: r.id,
                            rangeName: r.name ?? r.code ?? r.id,
                            ...(m.data() as any),
                        });
                    });
                });
                all.sort((a, b) => {
                    const aKey = `${a.rangeName ?? ''}|${a.modelCode ?? a.name ?? a.id}`;
                    const bKey = `${b.rangeName ?? ''}|${b.modelCode ?? b.name ?? b.id}`;
                    return aKey.localeCompare(bKey);
                });
                setModels(all);
            } catch (err) {
                console.error('Failed to load boats catalogue', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        fetchAll();
        return () => { cancelled = true; };
    }, [firestore, vendorId]);

    const filtered = useMemo(() => {
        if (!search.trim()) return models;
        const q = search.toLowerCase();
        return models.filter(m =>
            (m.name ?? '').toLowerCase().includes(q) ||
            (m.modelCode ?? '').toLowerCase().includes(q) ||
            (m.rangeName ?? '').toLowerCase().includes(q),
        );
    }, [models, search]);

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span className="text-xs">Loading catalogue…</span>
            </div>
        );
    }

    if (models.length === 0) {
        return <EmptyState message="No models found for this brand." />;
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px] max-w-md">
                    <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search models or ranges…"
                        className="rounded-xl border-2 text-xs pl-9"
                    />
                </div>
                <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                    {filtered.length} of {models.length} model{models.length === 1 ? '' : 's'} · {ranges.length} range{ranges.length === 1 ? '' : 's'}
                </p>
            </div>

            <div className="rounded-xl border-2 overflow-hidden">
                <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b-2">
                        <tr className="text-left">
                            <th className="w-8 px-2 py-2"></th>
                            <th className="px-3 py-2 font-bold uppercase tracking-widest text-[10px]">Code</th>
                            <th className="px-3 py-2 font-bold uppercase tracking-widest text-[10px]">Model</th>
                            <th className="px-3 py-2 font-bold uppercase tracking-widest text-[10px]">Range</th>
                            <th className="px-3 py-2 font-bold uppercase tracking-widest text-[10px] text-right">Cost</th>
                            <th className="px-3 py-2 font-bold uppercase tracking-widest text-[10px] text-right">Sell (ex GST)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map(model => {
                            const expanded = expandedIds.has(model.id);
                            return (
                                <ModelRowGroup
                                    key={model.id}
                                    vendorId={vendorId}
                                    model={model}
                                    expanded={expanded}
                                    onToggle={() => toggleExpand(model.id)}
                                />
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function ModelRowGroup({
    vendorId, model, expanded, onToggle,
}: {
    vendorId: string;
    model: Model;
    expanded: boolean;
    onToggle: () => void;
}) {
    return (
        <>
            <tr
                className={cn(
                    'border-b last:border-b-0 cursor-pointer transition-colors',
                    expanded ? 'bg-primary/5' : 'hover:bg-slate-50',
                )}
                onClick={onToggle}
            >
                <td className="px-2 py-2">
                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded-md" onClick={e => { e.stopPropagation(); onToggle(); }}>
                        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </Button>
                </td>
                <td className="px-3 py-2 font-mono font-bold">{model.modelCode ?? '—'}</td>
                <td className="px-3 py-2">{model.name ?? '—'}</td>
                <td className="px-3 py-2">
                    <Badge variant="outline" className="text-[10px] font-semibold">{model.rangeName ?? '—'}</Badge>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {model.cost != null ? formatCurrency(model.cost) : '—'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-bold">
                    {model.sellPriceExclGst != null ? formatCurrency(model.sellPriceExclGst) : '—'}
                </td>
            </tr>
            {expanded && <VariantRows vendorId={vendorId} model={model} />}
        </>
    );
}

function VariantRows({ vendorId, model }: { vendorId: string; model: Model }) {
    const firestore = useFirestore();
    const [variants, setVariants] = useState<Variant[] | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const fetchVariants = async () => {
            setLoading(true);
            try {
                if (!model.rangeId) {
                    if (!cancelled) setVariants([]);
                    return;
                }
                const snap = await getDocs(collection(
                    firestore,
                    'data-warehouse', vendorId, 'ranges', model.rangeId, 'models', model.id, 'variants',
                ));
                if (!cancelled) {
                    const list: Variant[] = [];
                    snap.forEach(d => list.push({ id: d.id, ...(d.data() as any) }));
                    setVariants(list);
                }
            } catch (err) {
                console.error('Failed to load variants', err);
                if (!cancelled) setVariants([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        fetchVariants();
        return () => { cancelled = true; };
    }, [firestore, vendorId, model.id, model.rangeId]);

    return (
        <tr className="bg-slate-50/50">
            <td colSpan={6} className="px-0 py-0">
                <div className="border-l-4 border-primary/30 px-6 py-3 space-y-4">
                    {loading ? (
                        <div className="flex items-center text-muted-foreground text-xs">
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                            Loading variants…
                        </div>
                    ) : !variants || variants.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No variants on this model.</p>
                    ) : (
                        <div className="space-y-1">
                            <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1">
                                {variants.length} variant{variants.length === 1 ? '' : 's'}
                            </p>
                            {variants.map(v => (
                                <div key={v.id} className="flex items-center justify-between p-2 rounded-lg bg-white border text-xs">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <Hash className="h-3 w-3 text-muted-foreground shrink-0" />
                                        <span className="font-mono font-bold truncate">{v.sku ?? v.id}</span>
                                        {v.material && <Badge variant="outline" className="text-[9px]">{v.material}</Badge>}
                                        {v.color && <Badge variant="outline" className="text-[9px]">{v.color}</Badge>}
                                        {v.name && <span className="text-muted-foreground truncate">{v.name}</span>}
                                    </div>
                                    <div className="flex items-center gap-4 shrink-0 tabular-nums">
                                        {v.cost != null && (
                                            <span className="text-muted-foreground">{formatCurrency(v.cost)} <span className="text-[9px]">cost</span></span>
                                        )}
                                        <span className="font-bold">
                                            {v.sellPriceExclGst != null ? formatCurrency(v.sellPriceExclGst) : '—'}
                                            <span className="text-[9px] font-normal text-muted-foreground ml-1">sell</span>
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* v1.16 (Story 3.8.3) — Inline edit cover image (paste URL).
                        Drag-drop affordance ships in v1.17 polish. */}
                    <CoverImagePanel vendorId={vendorId} model={model} />

                    {/* v1.14 (Story 3.9.1) — Optional features drill-down panel. Lives
                        right under the variants when the model row is expanded. */}
                    <OptionalFeaturesPanel vendorId={vendorId} model={model} />

                    {/* v1.15 (Story 3.4.2) — Marketing copy editor panel. Tagline +
                        description on the model doc, surfaced on the proposal PDF
                        cover (future v1.16 wiring). */}
                    <MarketingCopyPanel vendorId={vendorId} model={model} />
                </div>
            </td>
        </tr>
    );
}

/** v1.14 (Story 3.9.1) — Optional features inline drill-down. Reads
 *  optionalFeatures off the model doc, renders an editable mini-table with
 *  inline-edit cells for name + category + sellPriceExclGst + isStandard.
 *  Writes the whole array back on each change (so the existing model-editor
 *  schema doesn't break — optionalFeatures is an embedded array).
 */
function OptionalFeaturesPanel({ vendorId, model }: { vendorId: string; model: Model }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [features, setFeatures] = useState<any[]>([]);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                if (!model.rangeId) return;
                const snap = await getDocs(collection(firestore, 'data-warehouse', vendorId, 'ranges', model.rangeId, 'models'));
                snap.forEach(d => {
                    if (d.id === model.id && !cancelled) {
                        const data = d.data() as any;
                        setFeatures(Array.isArray(data?.optionalFeatures) ? data.optionalFeatures : []);
                        setLoaded(true);
                    }
                });
            } catch (err) {
                console.error(err);
            }
        })();
        return () => { cancelled = true; };
    }, [firestore, vendorId, model.id, model.rangeId]);

    const writeBack = async (next: any[]) => {
        if (!model.rangeId) return;
        try {
            const ref = doc(firestore, 'data-warehouse', vendorId, 'ranges', model.rangeId, 'models', model.id);
            await updateDoc(ref, { optionalFeatures: next, updatedAt: serverTimestamp() });
            setFeatures(next);
            toast({ title: 'Optional feature saved' });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: err?.message ?? String(err) });
        }
    };

    const patchAt = (idx: number, field: string, value: any) => {
        const next = features.map((f, i) => i === idx ? { ...f, [field]: value } : f);
        return writeBack(next);
    };

    const addOne = () => {
        const next = [...features, { id: `feat-${Date.now()}`, name: 'New optional feature', category: '', sellPriceExclGst: 0, isStandard: false }];
        return writeBack(next);
    };

    const removeAt = (idx: number) => {
        const next = features.filter((_, i) => i !== idx);
        return writeBack(next);
    };

    if (!loaded) return null;

    return (
        <div className="rounded-lg border-2 border-dashed bg-white p-3 space-y-2">
            <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                    OPTIONAL FEATURES · {features.length}
                </p>
                <Button size="sm" variant="outline" onClick={addOne} className="rounded-lg text-[10px] h-7">
                    <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
            </div>
            {features.length === 0 ? (
                <p className="text-[10px] text-muted-foreground italic">No optional features on this model.</p>
            ) : (
                <div className="space-y-1">
                    {features.map((f, idx) => (
                        <div key={f.id ?? idx} className="grid grid-cols-[1fr_140px_110px_70px_28px] items-center gap-2 p-1.5 rounded bg-slate-50 border text-[11px]">
                            <InlineEditCell type="text" value={f.name} placeholder="(no name)" onSave={(v) => patchAt(idx, 'name', v)} />
                            <InlineEditCell type="text" value={f.category} placeholder="(no category)" onSave={(v) => patchAt(idx, 'category', v)} />
                            <InlineEditCell type="currency" value={f.sellPriceExclGst} placeholder="$0" onSave={(v) => patchAt(idx, 'sellPriceExclGst', v ?? 0)} />
                            <button
                                type="button"
                                onClick={() => patchAt(idx, 'isStandard', !f.isStandard)}
                                className={cn(
                                    'rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider',
                                    f.isStandard ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' : 'bg-slate-100 text-slate-600 border border-slate-200',
                                )}
                                title="Toggle whether this is a standard inclusion on this model"
                            >
                                {f.isStandard ? 'STD' : 'OPT'}
                            </button>
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeAt(idx)}>
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/** v1.15 (Story 3.4.2) — Marketing Copy Editor UI. Tagline + description
 *  on the model doc, surfaced on the proposal PDF cover (cover wiring is
 *  a v1.16 follow-up; the data is captured here today).
 *
 *  Draft + dirty flag + Save button rather than save-on-blur — the
 *  description is multi-line free text and operators don't want every
 *  keystroke writing to Firestore. Discard restores from the live doc.
 */
function MarketingCopyPanel({ vendorId, model }: { vendorId: string; model: Model }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [tagline, setTagline] = useState('');
    const [description, setDescription] = useState('');
    const [loadedTagline, setLoadedTagline] = useState('');
    const [loadedDescription, setLoadedDescription] = useState('');
    const [loaded, setLoaded] = useState(false);
    const [saving, setSaving] = useState(false);
    /** v1.16 (Story 3.8.4) — TipTap popover for the description. */
    const [richEditorOpen, setRichEditorOpen] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                if (!model.rangeId) return;
                const snap = await getDocs(collection(firestore, 'data-warehouse', vendorId, 'ranges', model.rangeId, 'models'));
                snap.forEach(d => {
                    if (d.id === model.id && !cancelled) {
                        const data = d.data() as any;
                        const tg = String(data?.marketingTagline ?? '');
                        const ds = String(data?.marketingDescription ?? '');
                        setTagline(tg);
                        setDescription(ds);
                        setLoadedTagline(tg);
                        setLoadedDescription(ds);
                        setLoaded(true);
                    }
                });
            } catch (err) {
                console.error(err);
            }
        })();
        return () => { cancelled = true; };
    }, [firestore, vendorId, model.id, model.rangeId]);

    const dirty = tagline !== loadedTagline || description !== loadedDescription;

    const save = async () => {
        if (!model.rangeId) return;
        setSaving(true);
        try {
            const ref = doc(firestore, 'data-warehouse', vendorId, 'ranges', model.rangeId, 'models', model.id);
            await updateDoc(ref, {
                marketingTagline: tagline.trim() || null,
                marketingDescription: description.trim() || null,
                updatedAt: serverTimestamp(),
            });
            setLoadedTagline(tagline);
            setLoadedDescription(description);
            toast({ title: 'Marketing copy saved' });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: err?.message ?? String(err) });
        } finally {
            setSaving(false);
        }
    };

    const discard = () => {
        setTagline(loadedTagline);
        setDescription(loadedDescription);
    };

    if (!loaded) return null;

    return (
        <div className="rounded-lg border-2 border-dashed bg-white p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                    MARKETING COPY
                </p>
                {dirty && (
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 text-[9px] font-black uppercase">unsaved</Badge>
                        <Button size="sm" variant="ghost" onClick={discard} disabled={saving} className="rounded-lg text-[10px] h-7">Discard</Button>
                        <Button size="sm" onClick={save} disabled={saving} className="rounded-lg text-[10px] h-7">
                            {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null} Save
                        </Button>
                    </div>
                )}
            </div>
            <div className="space-y-2">
                <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Tagline</label>
                    <Input
                        value={tagline}
                        onChange={e => setTagline(e.target.value)}
                        placeholder="Short headline shown on the proposal PDF cover (e.g. 'Built for blue water')"
                        className="rounded-lg border-2 h-8 text-xs mt-1 font-semibold"
                        maxLength={120}
                    />
                </div>
                <div>
                    <div className="flex items-center justify-between">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Description</label>
                        {/* v1.16 (Story 3.8.4) — TipTap popover for rich editing. */}
                        <Button size="sm" variant="ghost" onClick={() => setRichEditorOpen(true)} className="rounded-lg text-[9px] h-6 px-2 text-primary">
                            <Pencil className="h-2.5 w-2.5 mr-1" /> Rich editor
                        </Button>
                    </div>
                    <Textarea
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder="Customer-facing description. Click 'Rich editor' for formatting + inline images."
                        className="rounded-lg border-2 text-xs mt-1"
                        rows={3}
                    />
                </div>
            </div>

            {/* v1.16 (Story 3.8.4) — TipTap popover. Reuses FeatureRichTextEditor
                (the same component the content-block editor uses) so heading /
                bold / italic / lists / inline images all work. */}
            <Dialog open={richEditorOpen} onOpenChange={setRichEditorOpen}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Marketing description — {model.name ?? model.modelCode ?? 'Model'}</DialogTitle>
                        <DialogDescription className="text-xs">
                            Rich-text editor. Headings, bold, italic, lists, links, inline images. Saves on close.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-2">
                        <FeatureRichTextEditor
                            value={description}
                            onChange={setDescription}
                            placeholder="Customer-facing marketing description. Used on the proposal PDF cover."
                            imageStoragePathPrefix={`models/${model.id}/marketing-inline-images`}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setDescription(loadedDescription); setRichEditorOpen(false); }} className="rounded-xl">Discard</Button>
                        <Button onClick={async () => { await save(); setRichEditorOpen(false); }} className="rounded-xl">Save + close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

/** v1.16 (Story 3.8.3) — Inline edit cover image. Paste URL today; the
 *  drag-drop affordance ships in v1.17 polish (needs a Storage upload
 *  pipeline + the per-model storage path convention).
 */
function CoverImagePanel({ vendorId, model }: { vendorId: string; model: Model }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [draft, setDraft] = useState(model.coverImageUrl ?? '');
    const [loaded, setLoaded] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                if (!model.rangeId) return;
                const snap = await getDocs(collection(firestore, 'data-warehouse', vendorId, 'ranges', model.rangeId, 'models'));
                snap.forEach(d => {
                    if (d.id === model.id && !cancelled) {
                        const data = d.data() as any;
                        setDraft(String(data?.coverImageUrl ?? ''));
                        setLoaded(true);
                    }
                });
            } catch (err) {
                console.error(err);
            }
        })();
        return () => { cancelled = true; };
    }, [firestore, vendorId, model.id, model.rangeId]);

    const save = async (next: string) => {
        if (!model.rangeId) return;
        setSaving(true);
        try {
            const ref = doc(firestore, 'data-warehouse', vendorId, 'ranges', model.rangeId, 'models', model.id);
            await updateDoc(ref, { coverImageUrl: next.trim() || null, updatedAt: serverTimestamp() });
            toast({ title: 'Cover image saved' });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: err?.message ?? String(err) });
        } finally {
            setSaving(false);
        }
    };

    if (!loaded) return null;

    return (
        <div className="rounded-lg border-2 border-dashed bg-white p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">COVER IMAGE</p>
                {saving && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
            </div>
            <div className="flex items-center gap-3">
                {draft.trim() ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={draft.trim()} alt={model.name ?? ''} className="h-16 w-24 object-contain bg-slate-50 rounded border" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                    <div className="h-16 w-24 rounded border-2 border-dashed bg-slate-50 flex items-center justify-center"><Ship className="h-4 w-4 text-slate-400" /></div>
                )}
                <Input
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onBlur={() => { if (draft !== (model.coverImageUrl ?? '')) save(draft); }}
                    placeholder="https://… (paste a URL — drag-drop coming v1.17)"
                    className="rounded-lg border-2 h-9 text-xs flex-1"
                    type="url"
                />
            </div>
        </div>
    );
}

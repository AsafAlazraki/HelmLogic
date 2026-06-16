'use client';

/**
 * TrailersTableView (v1.13 — Story 3.7.4).
 *
 * Read-view of the trailer catalogue. Sister to BoatsTableView (Story 3.7.2)
 * and MotorsTableView (Story 3.7.3) — every trailer in the catalogue with the
 * pricing + spec columns operators want to scan for anomalies.
 *
 * Columns (per the story AC):
 *   - Brand · Model · Capacity (ATM) · Tare · Wheels · Cost · Sell · Margin
 *   - Image thumb (when set on the trailer doc)
 *
 * Missing required pricing fields render with a red highlight so the admin
 * spots "cost not set" rows fast.
 *
 * Per-state rego cost surfacing is wired by linking to the rego module rather
 * than building a state-by-state column matrix — the state-specific calculation
 * uses the trailer ATM at quote time, so per-state numbers without a target
 * jurisdiction would be misleading. Click the rego pill to open the Rego module.
 *
 * Read-only by design — edits stay in the trailer module editor. Inline edit
 * lives in Story 3.8.x.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, doc, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Truck, Search, Loader2, AlertCircle, ExternalLink, Download, HelpCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/currency-utils';
import { cn } from '@/lib/utils';
import { InlineEditCell } from '@/components/inline-edit-cell';

interface Vendor {
    id: string;
    name?: string;
    slug?: string;
    vendorType?: string;
}

interface TrailerRow {
    id: string;
    code?: string;
    name?: string;
    supplier?: string;
    imageUrl?: string;
    isActive?: boolean;
    cost?: number;
    sellPriceExclGst?: number;
    specifications?: {
        boatSizeMtr?: number | null;
        wheelSize?: string;
        tareKg?: number | null;
        atmKg?: number | null;
        winch?: string;
        plug?: string;
    };
    [k: string]: any;
}

interface VendorTrailersProps {
    vendorId: string;
    vendorName: string;
    search: string;
    onLoaded: (rows: TrailerRow[]) => void;
}

function VendorTrailersLoader({ vendorId, onLoaded }: { vendorId: string; onLoaded: (rows: TrailerRow[]) => void }) {
    const firestore = useFirestore();
    const q = useMemoFirebase(
        () => collection(firestore, 'data-warehouse', vendorId, 'trailers'),
        [firestore, vendorId],
    );
    const { data } = useCollection<TrailerRow>(q);
    useEffect(() => {
        if (data) onLoaded(data);
    }, [data, onLoaded]);
    return null;
}

function marginPct(cost: number | undefined, sell: number | undefined): number | null {
    if (cost == null || sell == null || sell <= 0) return null;
    return ((sell - cost) / sell) * 100;
}

export function TrailersTableView({ canEdit = true, organisationId }: { canEdit?: boolean; organisationId?: string | null }) {
    const firestore = useFirestore();
    const { toast } = useToast();

    const vendorsQuery = useMemoFirebase(
        () => query(collection(firestore, 'data-warehouse'), where('vendorType', '==', 'Trailer Brand')),
        [firestore],
    );
    const { data: vendors, isLoading: vendorsLoading } = useCollection<Vendor>(vendorsQuery);

    const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [rows, setRows] = useState<TrailerRow[]>([]);
    /** v1.14 (Story 3.7.6) — Org override mode. When ON, inline edits write
     *  to `organisations/{orgId}/trailerOverrides/{trailerId}` instead of the
     *  vendor catalogue. Effective value used in the table prefers an
     *  override when present so the operator sees the org's view of the world.
     *  Defaults to OFF so v1.13 behaviour is unchanged for orgs that don't
     *  need overrides. */
    const [orgOverrideMode, setOrgOverrideMode] = useState(false);

    /** Org-level trailer overrides. Each doc is keyed by trailerId and carries
     *  a partial of the trailer fields. Lazy-loaded only when organisationId
     *  is present. */
    const overridesQuery = useMemoFirebase(
        () => organisationId ? collection(firestore, 'organisations', organisationId, 'trailerOverrides') : null,
        [firestore, organisationId],
    );
    const { data: overrides } = useCollection<any>(overridesQuery);
    const overrideMap = useMemo(() => {
        const m = new Map<string, any>();
        (overrides ?? []).forEach((o: any) => m.set(o.id, o));
        return m;
    }, [overrides]);

    /** v1.13 (3.8.1 + 3.8.2) + v1.14 (3.7.6) — inline-edit handler. Routes
     *  to the vendor catalogue OR the per-org overrides collection depending
     *  on `orgOverrideMode`. Toasts on success/failure. */
    const patchTrailer = async (trailerId: string, field: string, next: any) => {
        if (!selectedVendorId) throw new Error('no vendor selected');
        try {
            if (orgOverrideMode && organisationId) {
                const overridePath = doc(firestore, 'organisations', organisationId, 'trailerOverrides', trailerId);
                const cur = overrideMap.get(trailerId) ?? {};
                let patch: any = {};
                if (field.startsWith('specifications.')) {
                    const sub = field.split('.')[1];
                    patch.specifications = { ...(cur.specifications ?? {}), [sub]: next };
                } else {
                    patch[field] = next;
                }
                patch.vendorId = selectedVendorId;
                patch.trailerId = trailerId;
                patch.updatedAt = serverTimestamp();
                const { setDoc } = await import('firebase/firestore');
                await setDoc(overridePath, patch, { merge: true });
                toast({ title: 'Override saved' });
            } else {
                await updateDoc(
                    doc(firestore, 'data-warehouse', selectedVendorId, 'trailers', trailerId),
                    { [field]: next, updatedAt: serverTimestamp() },
                );
                toast({ title: 'Saved' });
            }
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: err?.message ?? String(err) });
            throw err;
        }
    };

    /** Resolve the effective value for a field — override wins when set. */
    const resolveField = (t: TrailerRow, field: string): any => {
        const ov = overrideMap.get(t.id);
        if (!ov) return (t as any)[field];
        if (field.startsWith('specifications.')) {
            const sub = field.split('.')[1];
            if (ov.specifications && ov.specifications[sub] !== undefined) return ov.specifications[sub];
            return (t.specifications as any)?.[sub];
        }
        return ov[field] !== undefined ? ov[field] : (t as any)[field];
    };

    const hasOverride = (t: TrailerRow, field: string): boolean => {
        const ov = overrideMap.get(t.id);
        if (!ov) return false;
        if (field.startsWith('specifications.')) {
            const sub = field.split('.')[1];
            return ov.specifications && ov.specifications[sub] !== undefined;
        }
        return ov[field] !== undefined;
    };

    useEffect(() => {
        if (!selectedVendorId && vendors && vendors.length > 0) {
            setSelectedVendorId(vendors[0].id);
        }
    }, [vendors, selectedVendorId]);

    useEffect(() => { setRows([]); }, [selectedVendorId]);

    const filtered = useMemo(() => {
        if (!search.trim()) return rows;
        const q = search.trim().toLowerCase();
        return rows.filter(r =>
            (r.name?.toLowerCase().includes(q)) ||
            (r.code?.toLowerCase().includes(q)) ||
            (r.supplier?.toLowerCase().includes(q))
        );
    }, [rows, search]);

    /** v1.14 (Story 3.8.8) — CSV export of the currently-filtered rows. */
    const handleExport = () => {
        const header = ['Code', 'Name', 'ATM (kg)', 'Tare (kg)', 'Wheels', 'Cost', 'Sell (ex GST)'];
        const escape = (v: any) => {
            if (v == null) return '';
            const s = String(v);
            if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
            return s;
        };
        const lines = [header.join(',')];
        for (const t of filtered) {
            lines.push([
                t.code ?? '',
                t.name ?? '',
                t.specifications?.atmKg ?? '',
                t.specifications?.tareKg ?? '',
                t.specifications?.wheelSize ?? '',
                t.cost ?? '',
                t.sellPriceExclGst ?? '',
            ].map(escape).join(','));
        }
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const stamp = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `trailers-${stamp}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        toast({ title: `Exported ${filtered.length} trailers` });
    };

    const totalsBadge = rows.length === 0 ? null : (
        <div className="flex gap-1.5">
            <Badge variant="outline" className="text-[9px] font-bold uppercase">{rows.length} trailers</Badge>
            <Badge variant="outline" className="text-[9px] font-bold uppercase bg-emerald-50 text-emerald-700 border-emerald-200">
                {rows.filter(r => r.cost && r.cost > 0 && r.sellPriceExclGst && r.sellPriceExclGst > 0).length} priced
            </Badge>
            {rows.filter(r => !r.cost || !r.sellPriceExclGst).length > 0 && (
                <Badge variant="outline" className="text-[9px] font-bold uppercase bg-rose-50 text-rose-700 border-rose-200">
                    {rows.filter(r => !r.cost || !r.sellPriceExclGst).length} missing pricing
                </Badge>
            )}
        </div>
    );

    return (
        <Card className="rounded-2xl border-2">
            <CardHeader>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-base font-bold">
                            <Truck className="h-4 w-4" />
                            Trailers Catalogue (read-view)
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Every trailer in the selected brand. Read-only — edits happen in the trailer module editor.
                            State-specific rego is calculated at quote time from the trailer ATM (per the v1.4 Rego module).
                        </CardDescription>
                    </div>
                    <div className="min-w-[220px]">
                        <Select value={selectedVendorId ?? ''} onValueChange={v => setSelectedVendorId(v)}>
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
            <CardContent className="space-y-3">
                {/* Active-vendor loader — fires until rows hydrate */}
                {selectedVendorId && (
                    <VendorTrailersLoader vendorId={selectedVendorId} onLoaded={setRows} />
                )}

                <div className="flex items-center gap-3 flex-wrap">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Search by name, code, supplier…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="pl-8 rounded-xl border-2 text-xs h-9"
                        />
                    </div>
                    {totalsBadge}
                    {organisationId && (
                        <Button
                            variant={orgOverrideMode ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setOrgOverrideMode(v => !v)}
                            className="rounded-xl text-xs h-9"
                            title={orgOverrideMode ? 'Inline edits write to org overrides (per-org). Click to switch back to vendor mode.' : 'Inline edits write to the vendor catalogue. Click to switch to org-override mode.'}
                        >
                            {orgOverrideMode ? '🏢 Org overrides' : '🌐 Vendor data'} ({overrideMap.size})
                        </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={handleExport} className="rounded-xl text-xs h-9" disabled={filtered.length === 0}>
                        <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
                    </Button>
                </div>

                {!selectedVendorId ? (
                    <div className="text-center py-12 text-xs text-muted-foreground">
                        {vendorsLoading ? (
                            <><Loader2 className="h-4 w-4 animate-spin mr-2 inline" />Loading vendors…</>
                        ) : (vendors?.length ?? 0) === 0 ? (
                            'No Trailer Brand vendors configured.'
                        ) : 'Pick a brand to view its trailers.'}
                    </div>
                ) : filtered.length === 0 && rows.length > 0 ? (
                    <div className="text-center py-12 text-xs text-muted-foreground">
                        No trailers match the search.
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-12 text-xs text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin mr-2 inline" />Loading trailers…
                    </div>
                ) : (
                    <TooltipProvider>
                    <div className="overflow-x-auto border-2 rounded-xl">
                        <table className="w-full text-xs">
                            <thead className="bg-slate-50 border-b-2">
                                <tr>
                                    <TrailerColHeader label="Image" hint="Thumbnail from the trailer's imageUrl field. Native <img> per CLAUDE.md lesson." />
                                    <TrailerColHeader label="Code" hint="Model code / SKU. Read-only — edits happen via the trailer module editor." />
                                    <TrailerColHeader label="Name" hint="Display name shown on quotes. Inline-editable — click to edit." />
                                    <TrailerColHeader label="ATM (kg)" align="right" hint="Aggregate Trailer Mass — fully loaded weight. Drives rego band selection at quote time." />
                                    <TrailerColHeader label="Tare (kg)" align="right" hint="Empty weight. Subtract from ATM for payload capacity." />
                                    <TrailerColHeader label="Wheels" hint="Wheel size code (e.g. '13&quot; STEEL WHEEL'). Inline-editable." />
                                    <TrailerColHeader label="Cost" align="right" hint="Dealer cost. Drives margin calculation. Missing rows highlight in rose." />
                                    <TrailerColHeader label="Sell (ex GST)" align="right" hint="Retail price excluding GST. GST gets added at finalize per the v1.3 lesson." />
                                    <TrailerColHeader label="Margin" align="right" hint="(Sell − Cost) / Sell × 100. Red < 15% · amber < 25% · emerald ≥ 25%." />
                                    <TrailerColHeader label="Rego" align="center" hint="State-specific rego is calculated at quote time from the trailer ATM. Click the link to open the Rego module." />
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(t => {
                                    const cost = resolveField(t, 'cost') as number | undefined;
                                    const sell = resolveField(t, 'sellPriceExclGst') as number | undefined;
                                    const mp = marginPct(cost, sell);
                                    /** v1.14 (3.7.6) — tiny OVR badge when this row has any org override applied. */
                                    const rowHasOverride = overrideMap.has(t.id);
                                    return (
                                        <tr key={t.id} className={cn('border-b last:border-b-0 hover:bg-slate-50', !t.isActive && 'opacity-60', rowHasOverride && 'bg-violet-50/30')}>
                                            <td className="px-3 py-2">
                                                {t.imageUrl
                                                    /* eslint-disable-next-line @next/next/no-img-element */
                                                    ? <img src={t.imageUrl} alt={t.name ?? t.code ?? ''} className="h-10 w-14 object-contain bg-white rounded border" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                                                    : <div className="h-10 w-14 rounded border bg-slate-100 flex items-center justify-center"><Truck className="h-3 w-3 text-slate-400" /></div>}
                                            </td>
                                            <td className="px-3 py-2 font-mono text-[10px]">
                                                {t.code ?? '—'}
                                                {rowHasOverride && <Badge variant="outline" className="ml-1 text-[7px] font-black uppercase bg-violet-50 text-violet-700 border-violet-300">OVR</Badge>}
                                            </td>
                                            <td className="px-3 py-2 font-semibold">
                                                <InlineEditCell
                                                    type="text"
                                                    value={resolveField(t, 'name') as string}
                                                    disabled={!canEdit}
                                                    onSave={(v) => patchTrailer(t.id, 'name', v)}
                                                />
                                                {hasOverride(t, 'name') && <span className="ml-1 text-[8px] font-black text-violet-700">·OVR</span>}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums">
                                                <InlineEditCell
                                                    type="number"
                                                    value={resolveField(t, 'specifications.atmKg') as number | undefined}
                                                    disabled={!canEdit}
                                                    validate={(n) => (n != null && (typeof n !== 'number' || n < 0) ? 'Positive number' : null)}
                                                    onSave={(v) => patchTrailer(t.id, 'specifications.atmKg', v)}
                                                />
                                                {hasOverride(t, 'specifications.atmKg') && <span className="ml-1 text-[8px] font-black text-violet-700">·OVR</span>}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums">
                                                <InlineEditCell
                                                    type="number"
                                                    value={resolveField(t, 'specifications.tareKg') as number | undefined}
                                                    disabled={!canEdit}
                                                    validate={(n) => (n != null && (typeof n !== 'number' || n < 0) ? 'Positive number' : null)}
                                                    onSave={(v) => patchTrailer(t.id, 'specifications.tareKg', v)}
                                                />
                                                {hasOverride(t, 'specifications.tareKg') && <span className="ml-1 text-[8px] font-black text-violet-700">·OVR</span>}
                                            </td>
                                            <td className="px-3 py-2">
                                                <InlineEditCell
                                                    type="text"
                                                    value={resolveField(t, 'specifications.wheelSize') as string}
                                                    disabled={!canEdit}
                                                    onSave={(v) => patchTrailer(t.id, 'specifications.wheelSize', v)}
                                                />
                                                {hasOverride(t, 'specifications.wheelSize') && <span className="ml-1 text-[8px] font-black text-violet-700">·OVR</span>}
                                            </td>
                                            <td className={cn('px-3 py-2 text-right tabular-nums', !cost && 'bg-rose-50 text-rose-700 font-bold')}>
                                                <InlineEditCell
                                                    type="currency"
                                                    value={cost}
                                                    disabled={!canEdit}
                                                    placeholder="missing"
                                                    validate={(n) => (n != null && (typeof n !== 'number' || n < 0) ? 'Positive number' : null)}
                                                    onSave={(v) => patchTrailer(t.id, 'cost', v)}
                                                />
                                                {hasOverride(t, 'cost') && <span className="ml-1 text-[8px] font-black text-violet-700">·OVR</span>}
                                            </td>
                                            <td className={cn('px-3 py-2 text-right tabular-nums', !sell && 'bg-rose-50 text-rose-700 font-bold')}>
                                                <InlineEditCell
                                                    type="currency"
                                                    value={sell}
                                                    disabled={!canEdit}
                                                    placeholder="missing"
                                                    validate={(n) => (n != null && (typeof n !== 'number' || n < 0) ? 'Positive number' : null)}
                                                    onSave={(v) => patchTrailer(t.id, 'sellPriceExclGst', v)}
                                                />
                                                {hasOverride(t, 'sellPriceExclGst') && <span className="ml-1 text-[8px] font-black text-violet-700">·OVR</span>}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums">
                                                {mp == null
                                                    ? '—'
                                                    : <span className={cn(
                                                        mp < 15 ? 'text-rose-600 font-bold'
                                                        : mp < 25 ? 'text-amber-600 font-bold'
                                                        : 'text-emerald-600 font-bold'
                                                    )}>{mp.toFixed(1)}%</span>}
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                {t.specifications?.atmKg ? (
                                                    <Link href="/modules?filter=rego" className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline font-bold uppercase tracking-wider">
                                                        ATM band <ExternalLink className="h-2.5 w-2.5" />
                                                    </Link>
                                                ) : (
                                                    <span className="text-[10px] text-muted-foreground italic">no ATM</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    </TooltipProvider>
                )}
            </CardContent>
        </Card>
    );
}

/** v1.14 (Story 3.8.6) — column header with an optional tooltip. */
function TrailerColHeader({ label, hint, align = 'left' }: { label: string; hint?: string; align?: 'left' | 'right' | 'center' }) {
    const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
    return (
        <th className={`px-3 py-2 font-black uppercase tracking-widest text-[9px] ${alignClass}`}>
            <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : ''}`}>
                {label}
                {hint && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <HelpCircle className="h-2.5 w-2.5 text-muted-foreground opacity-60 hover:opacity-100 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                            <p className="text-xs max-w-xs">{hint}</p>
                        </TooltipContent>
                    </Tooltip>
                )}
            </span>
        </th>
    );
}

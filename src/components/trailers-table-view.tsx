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
import { Truck, Search, Loader2, AlertCircle, ExternalLink } from 'lucide-react';
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

export function TrailersTableView({ canEdit = true }: { canEdit?: boolean } = {}) {
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

    /** v1.13 (3.8.1 + 3.8.2) — inline-edit handler. Writes straight to the
     *  vendor trailer doc; toasts on success/failure. Caller decides which
     *  fields are editable (currently pricing + spec primitives). */
    const patchTrailer = async (trailerId: string, field: string, next: any) => {
        if (!selectedVendorId) throw new Error('no vendor selected');
        try {
            await updateDoc(
                doc(firestore, 'data-warehouse', selectedVendorId, 'trailers', trailerId),
                { [field]: next, updatedAt: serverTimestamp() },
            );
            toast({ title: 'Saved' });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: err?.message ?? String(err) });
            throw err;
        }
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
                    <div className="overflow-x-auto border-2 rounded-xl">
                        <table className="w-full text-xs">
                            <thead className="bg-slate-50 border-b-2">
                                <tr>
                                    <th className="px-3 py-2 text-left font-black uppercase tracking-widest text-[9px]">Image</th>
                                    <th className="px-3 py-2 text-left font-black uppercase tracking-widest text-[9px]">Code</th>
                                    <th className="px-3 py-2 text-left font-black uppercase tracking-widest text-[9px]">Name</th>
                                    <th className="px-3 py-2 text-right font-black uppercase tracking-widest text-[9px]">ATM (kg)</th>
                                    <th className="px-3 py-2 text-right font-black uppercase tracking-widest text-[9px]">Tare (kg)</th>
                                    <th className="px-3 py-2 text-left font-black uppercase tracking-widest text-[9px]">Wheels</th>
                                    <th className="px-3 py-2 text-right font-black uppercase tracking-widest text-[9px]">Cost</th>
                                    <th className="px-3 py-2 text-right font-black uppercase tracking-widest text-[9px]">Sell (ex GST)</th>
                                    <th className="px-3 py-2 text-right font-black uppercase tracking-widest text-[9px]">Margin</th>
                                    <th className="px-3 py-2 text-center font-black uppercase tracking-widest text-[9px]">Rego</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(t => {
                                    const cost = t.cost;
                                    const sell = t.sellPriceExclGst;
                                    const mp = marginPct(cost, sell);
                                    const missing = !cost || !sell;
                                    return (
                                        <tr key={t.id} className={cn('border-b last:border-b-0 hover:bg-slate-50', !t.isActive && 'opacity-60')}>
                                            <td className="px-3 py-2">
                                                {t.imageUrl
                                                    /* eslint-disable-next-line @next/next/no-img-element */
                                                    ? <img src={t.imageUrl} alt={t.name ?? t.code ?? ''} className="h-10 w-14 object-contain bg-white rounded border" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                                                    : <div className="h-10 w-14 rounded border bg-slate-100 flex items-center justify-center"><Truck className="h-3 w-3 text-slate-400" /></div>}
                                            </td>
                                            <td className="px-3 py-2 font-mono text-[10px]">{t.code ?? '—'}</td>
                                            <td className="px-3 py-2 font-semibold">
                                                <InlineEditCell
                                                    type="text"
                                                    value={t.name}
                                                    disabled={!canEdit}
                                                    onSave={(v) => patchTrailer(t.id, 'name', v)}
                                                />
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums">
                                                <InlineEditCell
                                                    type="number"
                                                    value={t.specifications?.atmKg}
                                                    disabled={!canEdit}
                                                    validate={(n) => (n != null && (typeof n !== 'number' || n < 0) ? 'Positive number' : null)}
                                                    onSave={(v) => patchTrailer(t.id, 'specifications.atmKg' as any, v).catch(async () => {
                                                        // Nested path — fall back to a merged write
                                                        await updateDoc(
                                                            doc(firestore, 'data-warehouse', selectedVendorId!, 'trailers', t.id),
                                                            { specifications: { ...(t.specifications ?? {}), atmKg: v }, updatedAt: serverTimestamp() },
                                                        );
                                                    })}
                                                />
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums">
                                                <InlineEditCell
                                                    type="number"
                                                    value={t.specifications?.tareKg}
                                                    disabled={!canEdit}
                                                    validate={(n) => (n != null && (typeof n !== 'number' || n < 0) ? 'Positive number' : null)}
                                                    onSave={async (v) => {
                                                        await updateDoc(
                                                            doc(firestore, 'data-warehouse', selectedVendorId!, 'trailers', t.id),
                                                            { specifications: { ...(t.specifications ?? {}), tareKg: v }, updatedAt: serverTimestamp() },
                                                        );
                                                        toast({ title: 'Saved' });
                                                    }}
                                                />
                                            </td>
                                            <td className="px-3 py-2">
                                                <InlineEditCell
                                                    type="text"
                                                    value={t.specifications?.wheelSize}
                                                    disabled={!canEdit}
                                                    onSave={async (v) => {
                                                        await updateDoc(
                                                            doc(firestore, 'data-warehouse', selectedVendorId!, 'trailers', t.id),
                                                            { specifications: { ...(t.specifications ?? {}), wheelSize: v }, updatedAt: serverTimestamp() },
                                                        );
                                                        toast({ title: 'Saved' });
                                                    }}
                                                />
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
                )}
            </CardContent>
        </Card>
    );
}

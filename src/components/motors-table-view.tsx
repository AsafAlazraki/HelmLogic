
'use client';

/**
 * MotorsTableView (v1.11 — Story 3.7.3).
 *
 * Read-view of the motor catalogue, mirror of BoatsTableView but
 * for Motor Brand vendors. Motors don't have ranges/variants like
 * boats — they're flat per-vendor lists keyed by model name + HP.
 *
 * Read-only by design — edits stay in module + master-price-file
 * editors. Fast audit surface to scan the whole motor catalogue
 * and spot pricing anomalies.
 */

import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Anchor, Search, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/currency-utils';

interface Vendor {
    id: string;
    name?: string;
    slug?: string;
    vendorType?: string;
}

interface MotorRow {
    id: string;
    'Model Name'?: string;
    'Part Number'?: string;
    'HP Rating'?: string | number;
    Series?: string;
    Shaft?: string;
    sellPriceExclGst?: number | null;
    cost?: number | null;
    [k: string]: any;
}

export function MotorsTableView() {
    const firestore = useFirestore();

    const vendorsQuery = useMemoFirebase(
        () => query(collection(firestore, 'data-warehouse'), where('vendorType', '==', 'Motor Brand')),
        [firestore],
    );
    const { data: vendors, isLoading: vendorsLoading } = useCollection<Vendor>(vendorsQuery);

    const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);

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
                            <Anchor className="h-4 w-4" />
                            Motors Catalogue (read-view)
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Every motor in the selected brand. Read-only — edits happen in the motor module editor.
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
            <CardContent>
                {!selectedVendorId ? (
                    <EmptyState message="Pick a brand to view the catalogue." />
                ) : (
                    <MotorsTableBody vendorId={selectedVendorId} />
                )}
            </CardContent>
        </Card>
    );
}

function EmptyState({ message }: { message: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-2 border-2 border-dashed rounded-2xl text-muted-foreground">
            <Anchor className="h-8 w-8 opacity-30" />
            <p className="text-xs font-semibold">{message}</p>
        </div>
    );
}

function MotorsTableBody({ vendorId }: { vendorId: string }) {
    const firestore = useFirestore();
    const [rows, setRows] = useState<MotorRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [seriesFilter, setSeriesFilter] = useState<string>('all');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setRows([]);
            try {
                // Motors live under data-warehouse/{vendorId}/parts (Yamaha MPF pattern).
                const partsSnap = await getDocs(collection(firestore, 'data-warehouse', vendorId, 'parts'));
                if (cancelled) return;
                const list: MotorRow[] = [];
                partsSnap.forEach(d => list.push({ id: d.id, ...(d.data() as any) }));
                list.sort((a, b) => {
                    const aKey = `${a.Series ?? ''}|${a['Model Name'] ?? a.id}`;
                    const bKey = `${b.Series ?? ''}|${b['Model Name'] ?? b.id}`;
                    return aKey.localeCompare(bKey);
                });
                setRows(list);
            } catch (err) {
                console.error('Failed to load motors', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [firestore, vendorId]);

    const seriesOptions = useMemo(() => {
        const s = new Set<string>();
        for (const r of rows) if (r.Series) s.add(String(r.Series));
        return ['all', ...Array.from(s).sort()];
    }, [rows]);

    const filtered = useMemo(() => {
        let list = rows;
        if (seriesFilter !== 'all') list = list.filter(r => String(r.Series) === seriesFilter);
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(r =>
                String(r['Model Name'] ?? '').toLowerCase().includes(q) ||
                String(r['Part Number'] ?? '').toLowerCase().includes(q) ||
                String(r['HP Rating'] ?? '').toLowerCase().includes(q),
            );
        }
        return list;
    }, [rows, search, seriesFilter]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span className="text-xs">Loading catalogue…</span>
            </div>
        );
    }

    if (rows.length === 0) {
        return <EmptyState message="No motors found for this brand." />;
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px] max-w-md">
                    <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search model / part number / HP…"
                        className="rounded-xl border-2 text-xs pl-9"
                    />
                </div>
                <Select value={seriesFilter} onValueChange={setSeriesFilter}>
                    <SelectTrigger className="rounded-xl border-2 text-xs w-40">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {seriesOptions.map(s => (
                            <SelectItem key={s} value={s}>{s === 'all' ? 'All series' : s}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground ml-auto">
                    {filtered.length} of {rows.length}
                </p>
            </div>

            <div className="rounded-xl border-2 overflow-hidden">
                <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b-2">
                        <tr className="text-left">
                            <th className="px-3 py-2 font-bold uppercase tracking-widest text-[10px]">Part #</th>
                            <th className="px-3 py-2 font-bold uppercase tracking-widest text-[10px]">Model</th>
                            <th className="px-3 py-2 font-bold uppercase tracking-widest text-[10px]">Series</th>
                            <th className="px-3 py-2 font-bold uppercase tracking-widest text-[10px]">HP</th>
                            <th className="px-3 py-2 font-bold uppercase tracking-widest text-[10px]">Shaft</th>
                            <th className="px-3 py-2 font-bold uppercase tracking-widest text-[10px] text-right">Cost</th>
                            <th className="px-3 py-2 font-bold uppercase tracking-widest text-[10px] text-right">Sell (ex GST)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map(row => (
                            <tr key={row.id} className="border-b last:border-b-0 hover:bg-slate-50">
                                <td className="px-3 py-2 font-mono font-bold">{row['Part Number'] ?? '—'}</td>
                                <td className="px-3 py-2">{row['Model Name'] ?? '—'}</td>
                                <td className="px-3 py-2">
                                    {row.Series && <Badge variant="outline" className="text-[10px]">{row.Series}</Badge>}
                                </td>
                                <td className="px-3 py-2 tabular-nums">{row['HP Rating'] ?? '—'}</td>
                                <td className="px-3 py-2">{row.Shaft ?? '—'}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                                    {row.cost != null ? formatCurrency(Number(row.cost)) : '—'}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums font-bold">
                                    {row.sellPriceExclGst != null ? formatCurrency(Number(row.sellPriceExclGst)) : '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

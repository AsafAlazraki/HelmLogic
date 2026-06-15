
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
import { collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Anchor, Search, Loader2, Download, HelpCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/currency-utils';
import { InlineEditCell } from '@/components/inline-edit-cell';

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
    const { toast } = useToast();
    const [rows, setRows] = useState<MotorRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [seriesFilter, setSeriesFilter] = useState<string>('all');

    /** v1.14 (3.8.1 retrofit) — inline-edit handler for motors. Writes
     *  straight to the vendor part doc; toasts on success/failure. */
    const patchMotor = async (motorId: string, field: string, next: any) => {
        try {
            await updateDoc(
                doc(firestore, 'data-warehouse', vendorId, 'parts', motorId),
                { [field]: next, updatedAt: serverTimestamp() },
            );
            // Optimistic local update so the row reflects the change without a re-fetch.
            setRows(prev => prev.map(r => r.id === motorId ? { ...r, [field]: next } : r));
            toast({ title: 'Saved' });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: err?.message ?? String(err) });
            throw err;
        }
    };

    /** v1.14 (Story 3.8.8) — CSV export of the currently-filtered rows. */
    const handleExport = () => {
        const header = ['Part Number', 'Model Name', 'Series', 'HP Rating', 'Shaft', 'Cost', 'Sell (ex GST)'];
        const escape = (v: any) => {
            if (v == null) return '';
            const s = String(v);
            if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
            return s;
        };
        const lines = [header.join(',')];
        for (const r of filtered) {
            lines.push([
                r['Part Number'] ?? '',
                r['Model Name'] ?? '',
                r.Series ?? '',
                r['HP Rating'] ?? '',
                r.Shaft ?? '',
                r.cost ?? '',
                r.sellPriceExclGst ?? '',
            ].map(escape).join(','));
        }
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const stamp = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `motors-${stamp}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        toast({ title: `Exported ${filtered.length} motors` });
    };

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
                <Button variant="outline" size="sm" onClick={handleExport} className="rounded-xl text-xs h-9" disabled={filtered.length === 0}>
                    <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
                </Button>
            </div>

            <TooltipProvider>
                <div className="rounded-xl border-2 overflow-hidden">
                    <table className="w-full text-xs">
                        <thead className="bg-slate-50 border-b-2">
                            <tr className="text-left">
                                <ColumnHeader label="Part #" hint="Manufacturer's part number / SKU. Used by Yamaha MPF imports." />
                                <ColumnHeader label="Model" hint="Model name as it appears on the data sheet." />
                                <ColumnHeader label="Series" hint="Series the motor belongs to (e.g. F25, F70). Drives the series filter chip row." />
                                <ColumnHeader label="HP" hint="Horsepower rating. Multi-engine syntax 'N × HP' is parsed at the quote-flow side." />
                                <ColumnHeader label="Shaft" hint="Shaft length code (S / L / X / U). Matters for transom compatibility." />
                                <ColumnHeader label="Cost" align="right" hint="Dealer cost. Inline-editable — click the cell to edit." />
                                <ColumnHeader label="Sell (ex GST)" align="right" hint="Retail price excluding GST. Inline-editable. GST gets added at finalize." />
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(row => (
                                <tr key={row.id} className="border-b last:border-b-0 hover:bg-slate-50">
                                    <td className="px-3 py-2 font-mono font-bold">{row['Part Number'] ?? '—'}</td>
                                    <td className="px-3 py-2">
                                        <InlineEditCell
                                            type="text"
                                            value={row['Model Name'] as string}
                                            onSave={(v) => patchMotor(row.id, 'Model Name', v)}
                                        />
                                    </td>
                                    <td className="px-3 py-2">
                                        {row.Series && <Badge variant="outline" className="text-[10px]">{row.Series}</Badge>}
                                    </td>
                                    <td className="px-3 py-2 tabular-nums">
                                        <InlineEditCell
                                            type="text"
                                            value={row['HP Rating'] as string}
                                            onSave={(v) => patchMotor(row.id, 'HP Rating', v)}
                                        />
                                    </td>
                                    <td className="px-3 py-2">
                                        <InlineEditCell
                                            type="text"
                                            value={row.Shaft as string}
                                            onSave={(v) => patchMotor(row.id, 'Shaft', v)}
                                        />
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                                        <InlineEditCell
                                            type="currency"
                                            value={row.cost as number | null | undefined}
                                            validate={(n) => (n != null && (typeof n !== 'number' || n < 0) ? 'Positive number' : null)}
                                            onSave={(v) => patchMotor(row.id, 'cost', v)}
                                        />
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums font-bold">
                                        <InlineEditCell
                                            type="currency"
                                            value={row.sellPriceExclGst as number | null | undefined}
                                            validate={(n) => (n != null && (typeof n !== 'number' || n < 0) ? 'Positive number' : null)}
                                            onSave={(v) => patchMotor(row.id, 'sellPriceExclGst', v)}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </TooltipProvider>
        </div>
    );
}

/** v1.14 (Story 3.8.6) — column header with an optional tooltip. */
function ColumnHeader({ label, hint, align = 'left' }: { label: string; hint?: string; align?: 'left' | 'right' }) {
    return (
        <th className={`px-3 py-2 font-bold uppercase tracking-widest text-[10px] ${align === 'right' ? 'text-right' : ''}`}>
            <span className="inline-flex items-center gap-1">
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

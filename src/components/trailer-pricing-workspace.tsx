'use client';

/**
 * Trailer Pricing Workspace — table-style pricing manager.
 *
 * Flat, Yamaha/MPF-style table. Inline Sell-override edit persists to
 * `organisations/{orgId}/trailerOverrides/{trailerId}`. Waterfall (2c),
 * search + filter (2d), export (2e) and import-with-dedupe (2f) follow.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DollarSign, Loader2, Truck } from 'lucide-react';
import { formatCurrency } from '@/lib/currency-utils';
import { useToast } from '@/hooks/use-toast';

interface Vendor {
    id: string;
    name: string;
    vendorType?: string;
    logoUrl?: string;
    shortCode?: string;
}

interface FlatTrailerRow {
    id: string;
    vendorId: string;
    vendorName: string;
    seriesId: string;
    seriesName: string;
    code: string;
    name: string;
    supplier?: string;
    imageUrl?: string;
    isActive?: boolean;
    sourceSell: number;
    pricing: Record<string, any>;
}

interface TrailerPricingWorkspaceProps {
    vendors: Vendor[];
    organisationId: string;
    isAdmin: boolean;
}

const COLUMNS: Array<{ key: keyof FlatTrailerRow | string; label: string; numeric?: boolean; width?: string }> = [
    { key: 'image', label: '', width: 'w-[56px]' },
    { key: 'code', label: 'Code', width: 'min-w-[120px]' },
    { key: 'name', label: 'Name', width: 'min-w-[240px]' },
    { key: 'vendorName', label: 'Brand', width: 'min-w-[140px]' },
    { key: 'seriesName', label: 'Series', width: 'min-w-[140px]' },
    { key: 'supplier', label: 'Supplier', width: 'min-w-[120px]' },
    { key: 'dealer', label: 'Dealer', numeric: true, width: 'min-w-[110px]' },
    { key: 'nettPrice', label: 'Nett', numeric: true, width: 'min-w-[110px]' },
    { key: 'landed', label: 'Landed', numeric: true, width: 'min-w-[110px]' },
    { key: 'totalPdCharges', label: 'Total PD', numeric: true, width: 'min-w-[110px]' },
    { key: 'totalNettCtd', label: 'CTD', numeric: true, width: 'min-w-[110px]' },
    { key: 'markupPercent', label: 'MU%', numeric: true, width: 'min-w-[80px]' },
    { key: 'rrp', label: 'RRP', numeric: true, width: 'min-w-[110px]' },
    { key: 'sell', label: 'Sell ex GST', numeric: true, width: 'min-w-[140px]' },
];

interface TrailerOverride {
    id: string;
    sellPriceExclGst?: number;
    note?: string | null;
}

function SellCell({
    row,
    overrideValue,
    isAdmin,
    onSave,
    onReset,
}: {
    row: FlatTrailerRow;
    overrideValue?: number;
    isAdmin: boolean;
    onSave: (trailerId: string, price: number) => Promise<void>;
    onReset: (trailerId: string) => Promise<void>;
}) {
    const effective = overrideValue != null ? overrideValue : row.sourceSell;
    const hasOverride = overrideValue != null && overrideValue !== row.sourceSell;
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');

    if (editing) {
        const commit = async () => {
            const trimmed = draft.trim();
            setEditing(false);
            if (trimmed === '') {
                // Empty = reset to source
                if (hasOverride) await onReset(row.id);
                return;
            }
            const parsed = parseFloat(trimmed);
            if (!Number.isFinite(parsed) || parsed < 0) return;
            if (parsed === row.sourceSell) {
                // Match source = clear override
                if (hasOverride) await onReset(row.id);
                return;
            }
            if (parsed !== effective) await onSave(row.id, parsed);
        };
        return (
            <input
                autoFocus
                type="number"
                step="0.01"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') commit();
                    if (e.key === 'Escape') setEditing(false);
                }}
                className="w-full h-full px-2 py-1 text-xs border-2 border-primary rounded-md outline-none bg-white text-right font-mono"
            />
        );
    }

    const wrapperClass = isAdmin
        ? 'block w-full h-full px-3 py-2 cursor-pointer hover:bg-primary/10 text-right'
        : 'block w-full h-full px-3 py-2 text-right';

    return (
        <span
            onClick={() => {
                if (!isAdmin) return;
                setDraft(String(effective || ''));
                setEditing(true);
            }}
            className={wrapperClass}
            title={isAdmin ? (hasOverride ? 'Click to edit · leave blank to reset' : 'Click to set org override') : undefined}
        >
            <span className={hasOverride ? 'text-amber-700 font-semibold' : ''}>
                {formatCurrency(effective)}
            </span>
            {hasOverride && (
                <span className="block text-[9px] text-slate-400 line-through leading-tight">
                    {formatCurrency(row.sourceSell)}
                </span>
            )}
        </span>
    );
}

function TrailerPricingImage({ src, alt }: { src?: string; alt: string }) {
    const [failed, setFailed] = useState(false);
    useEffect(() => { setFailed(false); }, [src]);
    if (!src || failed) {
        return (
            <div className="h-8 w-8 rounded-md bg-slate-50 border border-slate-200 flex items-center justify-center">
                <Truck className="h-4 w-4 text-slate-300" />
            </div>
        );
    }
    return (
        <img
            src={src}
            alt={alt}
            className="h-8 w-8 rounded-md object-contain border border-slate-200 bg-white"
            onError={() => setFailed(true)}
        />
    );
}

export function TrailerPricingWorkspace({ vendors, organisationId, isAdmin }: TrailerPricingWorkspaceProps) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [rows, setRows] = useState<FlatTrailerRow[]>([]);
    const [loading, setLoading] = useState(true);

    const vendorIds = useMemo(() => vendors.map(v => v.id).sort().join('|'), [vendors]);

    // Live overrides — single subscription, Map keyed by trailerId
    const overridesQuery = useMemoFirebase(
        () => collection(firestore, `organisations/${organisationId}/trailerOverrides`),
        [firestore, organisationId],
    );
    const { data: overrides } = useCollection<TrailerOverride>(overridesQuery);
    const overrideByTrailer = useMemo(() => {
        const m = new Map<string, number>();
        (overrides || []).forEach(o => {
            if (typeof o.sellPriceExclGst === 'number') m.set(o.id, o.sellPriceExclGst);
        });
        return m;
    }, [overrides]);

    const saveOverride = useCallback(async (trailerId: string, price: number) => {
        try {
            const row = rows.find(r => r.id === trailerId);
            await setDoc(
                doc(firestore, `organisations/${organisationId}/trailerOverrides/${trailerId}`),
                {
                    sellPriceExclGst: price,
                    trailerId,
                    brandVendorId: row?.vendorId || null,
                    seriesId: row?.seriesId || null,
                    overrideAt: serverTimestamp(),
                },
                { merge: true },
            );
            toast({ title: 'Override saved', description: `${row?.code ?? trailerId} → ${formatCurrency(price)} ex GST` });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: e?.message });
        }
    }, [firestore, organisationId, rows, toast]);

    const resetOverride = useCallback(async (trailerId: string) => {
        try {
            await deleteDoc(doc(firestore, `organisations/${organisationId}/trailerOverrides/${trailerId}`));
            const row = rows.find(r => r.id === trailerId);
            toast({ title: 'Override cleared', description: `${row?.code ?? trailerId} reverted to source price` });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Reset failed', description: e?.message });
        }
    }, [firestore, organisationId, rows, toast]);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setLoading(true);
            const flat: FlatTrailerRow[] = [];
            try {
                for (const vendor of vendors) {
                    const seriesSnap = await getDocs(collection(firestore, `data-warehouse/${vendor.id}/series`));
                    for (const seriesDoc of seriesSnap.docs) {
                        const seriesId = seriesDoc.id;
                        const seriesName = (seriesDoc.data() as any).name || seriesId;
                        const trailersSnap = await getDocs(
                            collection(firestore, `data-warehouse/${vendor.id}/series/${seriesId}/trailers`)
                        );
                        for (const t of trailersSnap.docs) {
                            const data = t.data() as any;
                            const pricing = data.pricingDetail || {};
                            const sourceSell = typeof pricing.sell === 'number'
                                ? pricing.sell
                                : (typeof data.sellPriceExclGst === 'number' ? data.sellPriceExclGst : 0);
                            flat.push({
                                id: t.id,
                                vendorId: vendor.id,
                                vendorName: vendor.name,
                                seriesId,
                                seriesName,
                                code: data.code || t.id,
                                name: data.name || '',
                                supplier: data.supplier || '',
                                imageUrl: data.imageUrl || '',
                                isActive: data.isActive,
                                sourceSell,
                                pricing,
                            });
                        }
                    }
                }
                if (!cancelled) {
                    flat.sort((a, b) =>
                        a.vendorName.localeCompare(b.vendorName) ||
                        a.seriesName.localeCompare(b.seriesName) ||
                        a.code.localeCompare(b.code)
                    );
                    setRows(flat);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        if (vendors.length === 0) {
            setRows([]);
            setLoading(false);
            return;
        }

        load();
        return () => { cancelled = true; };
    }, [firestore, vendorIds]); // eslint-disable-line react-hooks/exhaustive-deps

    if (vendors.length === 0) {
        return (
            <Card className="border-2 rounded-2xl">
                <CardHeader>
                    <CardTitle>No trailer brands selected</CardTitle>
                    <CardDescription>Add brands in Settings before pricing loads.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between py-4 px-8 bg-white border-b-2 border-slate-300">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary shadow-sm border-2 border-primary/20">
                        <DollarSign className="h-5 w-5" />
                    </div>
                    <div>
                        <h2 className="text-base font-black uppercase tracking-widest text-slate-950 leading-none">
                            Trailer Pricing Manager
                        </h2>
                        <p className="text-[10px] text-slate-500 mt-1">
                            {isAdmin ? 'Click the Sell cell to set an org override. Leave blank (or match source) to reset.' : 'Read-only view.'}
                        </p>
                    </div>
                </div>
                <Badge variant="outline" className="text-[9px] font-black border-2">
                    {rows.length} trailer{rows.length === 1 ? '' : 's'}
                </Badge>
            </div>

            {/* Table */}
            <div className="flex-1 min-h-0 overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : rows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3">
                        <Truck className="h-12 w-12 text-slate-200" />
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            No trailers in the selected brands
                        </p>
                    </div>
                ) : (
                    <div className="flex-1 w-full overflow-hidden flex flex-col bg-white relative border-t">
                        <div className="flex-1 overflow-auto scrollbar-thin" style={{ overflowX: 'auto', overflowY: 'auto' }}>
                            <table className="border-separate border-spacing-0 w-max table-fixed">
                                <thead className="sticky top-0 z-[100]">
                                    <tr>
                                        <th className="w-[50px] sticky left-0 top-0 z-[120] bg-white border-r-2 border-b-2 border-slate-300 text-center text-[8px] font-black uppercase shadow-[4px_0_10px_-2px_rgba(0,0,0,0.1)] py-2.5 px-2">
                                            #
                                        </th>
                                        {COLUMNS.map((col, idx) => (
                                            <th
                                                key={col.key as string}
                                                className={`text-[8px] font-black uppercase tracking-widest text-slate-400 px-4 py-3 border-r border-b-2 border-slate-300 whitespace-nowrap text-left bg-slate-100 ${
                                                    col.numeric ? 'text-right' : ''
                                                } ${col.width ?? ''} ${idx === 0 ? 'sticky left-[50px] z-[110] bg-white shadow-[4px_0_10px_-2px_rgba(0,0,0,0.05)]' : ''}`}
                                            >
                                                <span className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-600">
                                                    {col.label}
                                                </span>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row, rowIdx) => (
                                        <tr key={row.id} className="group hover:bg-primary/5 transition-colors">
                                            <td className="sticky left-0 z-[80] border-r-2 border-b border-slate-200 bg-white shadow-[4px_0_10px_-2px_rgba(0,0,0,0.05)] text-center text-[9px] text-slate-400 font-mono px-2 py-1 group-hover:bg-primary/5">
                                                {rowIdx + 1}
                                            </td>
                                            {COLUMNS.map((col, idx) => {
                                                const base = `border-r border-b border-slate-200 text-xs group-hover:bg-primary/5 ${col.numeric ? 'text-right font-mono tabular-nums' : ''}`;
                                                const sticky = idx === 0 ? 'sticky left-[50px] z-[70] bg-white shadow-[4px_0_10px_-2px_rgba(0,0,0,0.03)] group-hover:bg-primary/5 font-semibold' : '';

                                                if (col.key === 'image') {
                                                    return (
                                                        <td key="image" className={`${base} ${sticky} px-2 py-1`}>
                                                            <TrailerPricingImage src={row.imageUrl} alt={row.code} />
                                                        </td>
                                                    );
                                                }

                                                if (col.key === 'sell') {
                                                    return (
                                                        <td key="sell" className={`${base} ${sticky} p-0`}>
                                                            <SellCell
                                                                row={row}
                                                                overrideValue={overrideByTrailer.get(row.id)}
                                                                isAdmin={isAdmin}
                                                                onSave={saveOverride}
                                                                onReset={resetOverride}
                                                            />
                                                        </td>
                                                    );
                                                }

                                                const value = col.numeric
                                                    ? (row.pricing?.[col.key as string] ?? (row as any)[col.key])
                                                    : (row as any)[col.key];

                                                let display: string;
                                                if (value == null || value === '') {
                                                    display = '—';
                                                } else if (col.numeric) {
                                                    display = col.key === 'markupPercent'
                                                        ? `${Number(value).toFixed(1)}%`
                                                        : formatCurrency(Number(value));
                                                } else {
                                                    display = String(value);
                                                }

                                                return (
                                                    <td key={col.key as string} className={`${base} ${sticky} px-3 py-2 whitespace-nowrap`}>
                                                        {display}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

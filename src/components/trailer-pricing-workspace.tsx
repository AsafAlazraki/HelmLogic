'use client';

/**
 * Trailer Pricing Workspace — table-style pricing manager.
 *
 * Flat, Yamaha/MPF-style table. Inline Sell-override edit persists to
 * `organisations/{orgId}/trailerOverrides/{trailerId}`. Waterfall (2c),
 * search + filter (2d), export (2e) and import-with-dedupe (2f) follow.
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    ChevronDown,
    ChevronRight,
    DollarSign,
    Download,
    FileSpreadsheet,
    FileText,
    Loader2,
    RotateCcw,
    Search,
    Truck,
    Upload,
} from 'lucide-react';
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

// Waterfall rows rendered when a trailer is expanded. Source-column letters are
// kept for audit so a dealer can cross-check against the import spreadsheet.
const WATERFALL_ROWS: Array<{ key: string; label: string; col: string; bold?: boolean; accent?: boolean }> = [
    { key: 'dealer',         label: 'Dealer',          col: 'AN' },
    { key: 'discount',       label: 'Discount',        col: 'AO' },
    { key: 'settlement',     label: 'Settlement',      col: 'AP' },
    { key: 'nettPrice',      label: 'Nett Price',      col: 'AQ', bold: true },
    { key: 'freight',        label: 'Freight',         col: 'AR' },
    { key: 'landed',         label: 'Landed',          col: 'AS' },
    { key: 'pdDollars',      label: 'PD ($)',          col: 'BD' },
    { key: 'sundry',         label: 'Sundry',          col: 'BO' },
    { key: 'detailing',      label: 'Detailing',       col: 'BP' },
    { key: 'totalPdCharges', label: 'Total PD',        col: 'BQ' },
    { key: 'totalNettCtd',   label: 'Total Nett CTD',  col: 'BS', bold: true },
    { key: 'markupPercent',  label: 'Markup %',        col: 'BT' },
    { key: 'grossProfit',    label: 'Gross Profit',    col: 'BU' },
    { key: 'rrp',            label: 'RRP',             col: 'BV' },
    { key: 'sell',           label: 'Sell (ex GST)',   col: 'BW', bold: true, accent: true },
];

function WaterfallPanel({
    row,
    hasOverride,
    effectiveSell,
    onReset,
    isAdmin,
}: {
    row: FlatTrailerRow;
    hasOverride: boolean;
    effectiveSell: number;
    onReset: (trailerId: string) => Promise<void>;
    isAdmin: boolean;
}) {
    const rowsWithValues = WATERFALL_ROWS.filter(r => typeof row.pricing?.[r.key] === 'number');
    const hasWaterfall = rowsWithValues.length > 0;
    const pdParts: Array<{ name?: string; cost?: number }> = Array.isArray(row.pricing?.pdParts) ? row.pricing.pdParts : [];

    return (
        <div className="p-5 bg-slate-50 border-y-2 border-slate-200">
            {/* Summary row */}
            <div className="flex flex-wrap items-center gap-4 mb-4 pb-3 border-b border-slate-200">
                <div className="flex flex-col">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Source sell</span>
                    <span className="text-sm font-mono tabular-nums text-slate-700">{formatCurrency(row.sourceSell)}</span>
                </div>
                <div className="flex flex-col">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Effective sell</span>
                    <span className={`text-sm font-mono tabular-nums font-semibold ${hasOverride ? 'text-amber-700' : 'text-primary'}`}>
                        {formatCurrency(effectiveSell)}
                    </span>
                </div>
                {hasOverride && isAdmin && (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="ml-auto h-8 text-[10px]"
                        onClick={() => onReset(row.id)}
                    >
                        <RotateCcw className="h-3 w-3 mr-1" /> Reset override
                    </Button>
                )}
            </div>

            {!hasWaterfall && (
                <p className="text-xs text-slate-500 italic">
                    No pricing waterfall imported for this trailer — only the top-level Sell is available.
                </p>
            )}

            {hasWaterfall && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                    {rowsWithValues.map(r => {
                        const val = row.pricing[r.key];
                        const isPct = r.key === 'markupPercent';
                        return (
                            <div
                                key={r.key}
                                className={`flex items-center justify-between py-1.5 text-xs border-b last:border-b-0 ${
                                    r.accent ? 'font-bold text-primary border-primary/20'
                                        : r.bold ? 'font-semibold text-slate-800'
                                        : 'text-slate-600'
                                }`}
                            >
                                <span className="flex items-center gap-2">
                                    {r.label}
                                    <span className="text-[9px] text-slate-300 font-mono uppercase">{r.col}</span>
                                </span>
                                <span className="tabular-nums font-mono">
                                    {isPct ? `${Number(val).toFixed(1)}%` : formatCurrency(val)}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}

            {pdParts.length > 0 && (
                <div className="mt-5">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">PD Parts</p>
                    <div className="space-y-1">
                        {pdParts.map((p, i) => (
                            <div key={i} className="flex items-center justify-between text-[11px]">
                                <span className="text-slate-600 truncate">{p.name || `Part ${i + 1}`}</span>
                                <span className="tabular-nums font-mono text-slate-500">{formatCurrency(p.cost || 0)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
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
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [brandFilter, setBrandFilter] = useState<string>('all');
    const [importing, setImporting] = useState(false);

    // Pre-compute search fields on each row for fast filter
    const filteredRows = useMemo(() => {
        const q = search.trim().toLowerCase();
        const brandOk = (r: FlatTrailerRow) => brandFilter === 'all' || r.vendorId === brandFilter;
        if (!q) return rows.filter(brandOk);
        return rows.filter(r =>
            brandOk(r) && (
                r.code.toLowerCase().includes(q) ||
                r.name.toLowerCase().includes(q) ||
                (r.supplier || '').toLowerCase().includes(q) ||
                r.seriesName.toLowerCase().includes(q)
            ),
        );
    }, [rows, search, brandFilter]);

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

    const buildExportRows = useCallback((source: FlatTrailerRow[]) => {
        return source.map((r) => {
            const p = r.pricing || {};
            const override = overrideByTrailer.get(r.id);
            const hasOverride = override != null && override !== r.sourceSell;
            return {
                Brand: r.vendorName,
                Series: r.seriesName,
                Code: r.code,
                Name: r.name,
                Supplier: r.supplier || '',
                'Image URL': r.imageUrl || '',
                Dealer: p.dealer ?? '',
                Discount: p.discount ?? '',
                Settlement: p.settlement ?? '',
                'Nett Price': p.nettPrice ?? '',
                Freight: p.freight ?? '',
                Landed: p.landed ?? '',
                'PD $': p.pdDollars ?? '',
                Sundry: p.sundry ?? '',
                Detailing: p.detailing ?? '',
                'Total PD': p.totalPdCharges ?? '',
                'Total Nett CTD': p.totalNettCtd ?? '',
                'Markup %': p.markupPercent ?? '',
                'Gross Profit': p.grossProfit ?? '',
                RRP: p.rrp ?? '',
                'Source Sell (ex GST)': r.sourceSell,
                'Override Sell (ex GST)': hasOverride ? override : '',
                'Effective Sell (ex GST)': hasOverride ? override : r.sourceSell,
            };
        });
    }, [overrideByTrailer]);

    const handleExport = useCallback((format: 'xlsx' | 'csv') => {
        const source = filteredRows.length > 0 ? filteredRows : rows;
        if (source.length === 0) {
            toast({ variant: 'destructive', title: 'Nothing to export' });
            return;
        }
        const data = buildExportRows(source);
        const ws = XLSX.utils.json_to_sheet(data);
        const stamp = new Date().toISOString().slice(0, 10);
        const scopeLabel = brandFilter === 'all' ? 'all-brands' : (vendors.find(v => v.id === brandFilter)?.name || brandFilter).toLowerCase().replace(/\s+/g, '-');
        const filename = `trailer-pricing_${scopeLabel}_${stamp}`;

        if (format === 'xlsx') {
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Trailer Pricing');
            XLSX.writeFile(wb, `${filename}.xlsx`);
        } else {
            const csv = XLSX.utils.sheet_to_csv(ws);
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${filename}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        }
        toast({ title: 'Exported', description: `${data.length} trailer${data.length === 1 ? '' : 's'} exported.` });
    }, [filteredRows, rows, buildExportRows, brandFilter, vendors, toast]);

    const loadRows = useCallback(async (): Promise<FlatTrailerRow[]> => {
        const flat: FlatTrailerRow[] = [];
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
        flat.sort((a, b) =>
            a.vendorName.localeCompare(b.vendorName) ||
            a.seriesName.localeCompare(b.seriesName) ||
            a.code.localeCompare(b.code)
        );
        return flat;
    }, [firestore, vendorIds]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = ''; // allow re-selecting same file
        if (!file) return;
        setImporting(true);

        try {
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const parsed = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });

            if (parsed.length === 0) {
                toast({ variant: 'destructive', title: 'Empty import', description: 'No rows found in the first sheet.' });
                return;
            }

            // Build lookup maps
            const vendorByName = new Map<string, { id: string; name: string }>();
            vendors.forEach(v => vendorByName.set(v.name.toLowerCase().trim(), { id: v.id, name: v.name }));

            const seriesByBrand = new Map<string, Map<string, string>>(); // brandId → loweredSeriesName → seriesId
            for (const v of vendors) {
                const seriesSnap = await getDocs(collection(firestore, `data-warehouse/${v.id}/series`));
                const m = new Map<string, string>();
                seriesSnap.docs.forEach(d => {
                    const name = (d.data() as any).name || d.id;
                    m.set(String(name).toLowerCase().trim(), d.id);
                });
                seriesByBrand.set(v.id, m);
            }

            const existingByKey = new Map<string, FlatTrailerRow>();
            rows.forEach(r => existingByKey.set(`${r.vendorId}:${r.code.toLowerCase()}`, r));

            // Pricing column mapping (header label → pricingDetail key)
            const PRICING_COLS: Array<[string, string]> = [
                ['Dealer', 'dealer'],
                ['Discount', 'discount'],
                ['Settlement', 'settlement'],
                ['Nett Price', 'nettPrice'],
                ['Freight', 'freight'],
                ['Landed', 'landed'],
                ['PD $', 'pdDollars'],
                ['PD Dollars', 'pdDollars'],
                ['Sundry', 'sundry'],
                ['Detailing', 'detailing'],
                ['Total PD', 'totalPdCharges'],
                ['Total Nett CTD', 'totalNettCtd'],
                ['Markup %', 'markupPercent'],
                ['Gross Profit', 'grossProfit'],
                ['RRP', 'rrp'],
                ['Source Sell (ex GST)', 'sell'],
                ['Sell', 'sell'],
                ['Sell ex GST', 'sell'],
            ];

            const numOrNull = (v: any): number | null => {
                if (v == null || v === '') return null;
                const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,]/g, ''));
                return Number.isFinite(n) ? n : null;
            };

            let updated = 0;
            let created = 0;
            let skipped = 0;
            const errors: string[] = [];
            const skippedBrands = new Set<string>();

            for (const raw of parsed) {
                const brandRaw = String(raw.Brand ?? raw.brand ?? '').trim();
                const codeRaw = String(raw.Code ?? raw.code ?? '').trim();
                if (!brandRaw || !codeRaw) { skipped++; continue; }

                const vendorHit = vendorByName.get(brandRaw.toLowerCase());
                if (!vendorHit) {
                    skipped++;
                    skippedBrands.add(brandRaw);
                    continue;
                }

                // Build pricingDetail from known columns
                const pricingDetail: Record<string, number> = {};
                for (const [col, key] of PRICING_COLS) {
                    const v = numOrNull(raw[col]);
                    if (v != null) pricingDetail[key] = v;
                }

                const nameRaw = String(raw.Name ?? raw.name ?? '').trim();
                const supplierRaw = String(raw.Supplier ?? raw.supplier ?? '').trim();
                const imageUrlRaw = String(raw['Image URL'] ?? raw.imageUrl ?? '').trim();
                const seriesNameRaw = String(raw.Series ?? raw.series ?? 'Imported').trim() || 'Imported';

                const key = `${vendorHit.id}:${codeRaw.toLowerCase()}`;
                const existing = existingByKey.get(key);

                const trailerPayload: Record<string, any> = {
                    code: codeRaw,
                    pricingDetail: { ...(existing?.pricing || {}), ...pricingDetail },
                };
                if (nameRaw) trailerPayload.name = nameRaw;
                if (supplierRaw) trailerPayload.supplier = supplierRaw;
                if (imageUrlRaw) trailerPayload.imageUrl = imageUrlRaw;
                if (typeof pricingDetail.sell === 'number') trailerPayload.sellPriceExclGst = pricingDetail.sell;

                try {
                    if (existing) {
                        await updateDoc(
                            doc(firestore, `data-warehouse/${vendorHit.id}/series/${existing.seriesId}/trailers/${existing.id}`),
                            { ...trailerPayload, updatedAt: serverTimestamp() },
                        );
                        updated++;
                    } else {
                        // Resolve or create series
                        const brandSeries = seriesByBrand.get(vendorHit.id)!;
                        let seriesId = brandSeries.get(seriesNameRaw.toLowerCase());
                        if (!seriesId) {
                            const newSeriesRef = doc(collection(firestore, `data-warehouse/${vendorHit.id}/series`));
                            await setDoc(newSeriesRef, {
                                name: seriesNameRaw,
                                slug: seriesNameRaw.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                                isActive: true,
                                createdAt: serverTimestamp(),
                            });
                            seriesId = newSeriesRef.id;
                            brandSeries.set(seriesNameRaw.toLowerCase(), seriesId);
                        }
                        const trailerRef = doc(collection(firestore, `data-warehouse/${vendorHit.id}/series/${seriesId}/trailers`));
                        await setDoc(trailerRef, {
                            ...trailerPayload,
                            name: trailerPayload.name || codeRaw,
                            isActive: true,
                            createdAt: serverTimestamp(),
                        });
                        created++;
                    }
                } catch (err: any) {
                    errors.push(`${brandRaw}/${codeRaw}: ${err?.message || 'write failed'}`);
                }
            }

            // Reload table to reflect new data
            const reloaded = await loadRows();
            setRows(reloaded);

            const parts = [`${updated} updated`, `${created} created`];
            if (skipped > 0) parts.push(`${skipped} skipped`);
            const desc = parts.join(' · ') + (skippedBrands.size > 0 ? ` · unknown brand(s): ${[...skippedBrands].join(', ')}` : '');

            if (errors.length > 0) {
                console.error('Import errors:', errors);
                toast({
                    variant: 'destructive',
                    title: 'Import partial',
                    description: `${desc} · ${errors.length} write error(s) — see console.`,
                });
            } else {
                toast({ title: 'Import complete', description: desc });
            }
        } catch (err: any) {
            console.error('Import failed:', err);
            toast({ variant: 'destructive', title: 'Import failed', description: err?.message });
        } finally {
            setImporting(false);
        }
    }, [firestore, vendors, rows, loadRows, toast]);

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
        if (vendors.length === 0) {
            setRows([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        loadRows()
            .then(flat => { if (!cancelled) setRows(flat); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [loadRows, vendorIds]); // eslint-disable-line react-hooks/exhaustive-deps

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
                <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-[9px] font-black border-2">
                        {filteredRows.length}{filteredRows.length !== rows.length ? ` of ${rows.length}` : ''} trailer{rows.length === 1 ? '' : 's'}
                    </Badge>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="outline"
                                className="rounded-xl border-2 text-[10px] font-black uppercase tracking-widest h-10 px-5 gap-2"
                                disabled={rows.length === 0}
                            >
                                <Download className="h-4 w-4" />
                                Export
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="rounded-xl border-2 z-[10000]">
                            <DropdownMenuItem onClick={() => handleExport('xlsx')} className="text-xs font-bold gap-2 cursor-pointer">
                                <FileSpreadsheet className="h-4 w-4" /> Excel (.xlsx)
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleExport('csv')} className="text-xs font-bold gap-2 cursor-pointer">
                                <FileText className="h-4 w-4" /> CSV
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    {isAdmin && (
                        <Button
                            type="button"
                            onClick={(e) => {
                                const input = (e.currentTarget.nextElementSibling as HTMLInputElement | null);
                                input?.click();
                            }}
                            className="rounded-xl text-[10px] font-black uppercase tracking-widest h-10 px-5 gap-2"
                            disabled={importing}
                        >
                            {importing
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <Upload className="h-4 w-4" />}
                            Import
                        </Button>
                    )}
                    {isAdmin && (
                        <input
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            hidden
                            onChange={handleImport}
                            disabled={importing}
                        />
                    )}
                </div>
            </div>

            {/* Filter bar */}
            <div className="shrink-0 px-8 py-3 flex flex-wrap items-center gap-3 border-b-2 border-slate-200 bg-slate-50/50">
                <div className="flex flex-col gap-1 flex-1 max-w-xs min-w-[220px]">
                    <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Search</span>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <Input
                            placeholder="Code, name, supplier, series…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 h-9 rounded-xl border-2 text-xs"
                        />
                    </div>
                </div>
                {vendors.length > 1 && (
                    <div className="flex flex-col gap-1">
                        <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Brand</span>
                        <select
                            value={brandFilter}
                            onChange={(e) => setBrandFilter(e.target.value)}
                            className="h-9 rounded-xl border-2 border-slate-200 bg-white px-3 text-xs font-semibold hover:bg-slate-50 focus:outline-none focus:border-primary"
                        >
                            <option value="all">All brands ({vendors.length})</option>
                            {vendors.map(v => (
                                <option key={v.id} value={v.id}>{v.name}</option>
                            ))}
                        </select>
                    </div>
                )}
                {(search || brandFilter !== 'all') && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => { setSearch(''); setBrandFilter('all'); }}
                        className="h-9 mt-4 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-900"
                    >
                        Clear filters
                    </Button>
                )}
            </div>

            {/* Table */}
            <div className="flex-1 min-h-0 overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : filteredRows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3">
                        <Truck className="h-12 w-12 text-slate-200" />
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            {rows.length === 0 ? 'No trailers in the selected brands' : 'No trailers match the current filters'}
                        </p>
                    </div>
                ) : (
                    <div className="flex-1 w-full overflow-hidden flex flex-col bg-white relative border-t">
                        <div className="flex-1 overflow-auto scrollbar-thin" style={{ overflowX: 'auto', overflowY: 'auto' }}>
                            <table className="border-separate border-spacing-0 w-max table-fixed">
                                <thead className="sticky top-0 z-[100]">
                                    <tr>
                                        <th className="w-[36px] sticky left-0 top-0 z-[120] bg-white border-r border-b-2 border-slate-300 px-0 py-2.5">
                                            <span className="sr-only">Expand</span>
                                        </th>
                                        <th className="w-[50px] sticky left-[36px] top-0 z-[120] bg-white border-r-2 border-b-2 border-slate-300 text-center text-[8px] font-black uppercase shadow-[4px_0_10px_-2px_rgba(0,0,0,0.1)] py-2.5 px-2">
                                            #
                                        </th>
                                        {COLUMNS.map((col, idx) => (
                                            <th
                                                key={col.key as string}
                                                className={`text-[8px] font-black uppercase tracking-widest text-slate-400 px-4 py-3 border-r border-b-2 border-slate-300 whitespace-nowrap text-left bg-slate-100 ${
                                                    col.numeric ? 'text-right' : ''
                                                } ${col.width ?? ''} ${idx === 0 ? 'sticky left-[86px] z-[110] bg-white shadow-[4px_0_10px_-2px_rgba(0,0,0,0.05)]' : ''}`}
                                            >
                                                <span className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-600">
                                                    {col.label}
                                                </span>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredRows.map((row, rowIdx) => {
                                        const isExpanded = expandedId === row.id;
                                        const overrideValue = overrideByTrailer.get(row.id);
                                        const effectiveSell = overrideValue != null ? overrideValue : row.sourceSell;
                                        const hasOverride = overrideValue != null && overrideValue !== row.sourceSell;
                                        return (
                                            <Fragment key={row.id}>
                                        <tr className="group hover:bg-primary/5 transition-colors">
                                            <td className="sticky left-0 z-[80] border-r border-b border-slate-200 bg-white shadow-[2px_0_4px_-2px_rgba(0,0,0,0.03)] px-0 py-0 group-hover:bg-primary/5">
                                                <button
                                                    type="button"
                                                    onClick={() => setExpandedId(isExpanded ? null : row.id)}
                                                    className="h-full w-full flex items-center justify-center text-slate-400 hover:text-primary transition-colors"
                                                    aria-label={isExpanded ? 'Collapse waterfall' : 'Expand waterfall'}
                                                >
                                                    {isExpanded
                                                        ? <ChevronDown className="h-4 w-4" />
                                                        : <ChevronRight className="h-4 w-4" />}
                                                </button>
                                            </td>
                                            <td className="sticky left-[36px] z-[80] border-r-2 border-b border-slate-200 bg-white shadow-[4px_0_10px_-2px_rgba(0,0,0,0.05)] text-center text-[9px] text-slate-400 font-mono px-2 py-1 group-hover:bg-primary/5">
                                                {rowIdx + 1}
                                            </td>
                                            {COLUMNS.map((col, idx) => {
                                                const base = `border-r border-b border-slate-200 text-xs group-hover:bg-primary/5 ${col.numeric ? 'text-right font-mono tabular-nums' : ''}`;
                                                const sticky = idx === 0 ? 'sticky left-[86px] z-[70] bg-white shadow-[4px_0_10px_-2px_rgba(0,0,0,0.03)] group-hover:bg-primary/5 font-semibold' : '';

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
                                        {isExpanded && (
                                            <tr>
                                                <td colSpan={COLUMNS.length + 2} className="p-0 border-b border-slate-200">
                                                    <WaterfallPanel
                                                        row={row}
                                                        hasOverride={hasOverride}
                                                        effectiveSell={effectiveSell}
                                                        onReset={resetOverride}
                                                        isAdmin={isAdmin}
                                                    />
                                                </td>
                                            </tr>
                                        )}
                                            </Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

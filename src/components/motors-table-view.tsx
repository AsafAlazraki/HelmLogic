
'use client';

/**
 * MotorsTableView (v1.11 — Story 3.7.3; v1.34 repoint).
 *
 * Table view of the motor catalogue for Motor Brand vendors.
 *
 * v1.34 (Asaf: "MPF data is source of truth") — this table now reads the
 * SAME MPF dataset rows the quote flow prices from
 * (data-warehouse/{vendor}/dataSets/{ds}/rows). It previously read
 * data-warehouse/{vendor}/parts, which is EMPTY for Yamaha — the same
 * admin-surface-vs-quote-engine split-brain as the v1.33 dealer-fit tab.
 * Two field-naming worlds coexist on rows (MPF Motor-Module columns +
 * importer names); accessors below read both, and every write keeps the
 * mirrors in sync (e.g. a Sell edit writes NSM Retail +
 * priceLevels.hull_cash + sellPriceExclGst) so no consumer forks.
 * Operator edits are provisional by design: the next MPF import upserts
 * by MODEL CODE and wins.
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
import { Anchor, Search, Loader2, Download, HelpCircle, FileUp, Percent, X, ClipboardPaste } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Checkbox } from '@/components/ui/checkbox';
import { PasteFromSpreadsheet } from '@/components/paste-from-spreadsheet';
import { formatCurrency } from '@/lib/currency-utils';
import { InlineEditCell } from '@/components/inline-edit-cell';
import { MasterPriceFileWorkspace } from '@/components/master-price-file-workspace';

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

/* ------- dual-world accessors (MPF columns first-class) ------- */
const mPart = (r: MotorRow) => (r['Part Number'] ?? r['MODEL CODE'] ?? null) as string | null;
const mModel = (r: MotorRow) => (r['Model Name'] ?? r['MODEL'] ?? null) as string | null;
const mSeries = (r: MotorRow) => (r.Series ?? r.mpfSection ?? null) as string | null;
const mHp = (r: MotorRow) => (r['HP Rating'] ?? null) as string | number | null;
const mShaft = (r: MotorRow) => (r.Shaft ?? r['Shaft Length'] ?? null) as string | null;
const mCost = (r: MotorRow): number | null =>
    typeof r.cost === 'number' ? r.cost : (typeof r['Total CTD'] === 'number' ? r['Total CTD'] : null);
const mSell = (r: MotorRow): number | null => {
    for (const v of [r.sellPriceExclGst, r.priceLevels?.hull_cash, r['NSM Retail'], r['Store Price'], r['Sell Price']]) {
        if (typeof v === 'number') return v;
    }
    return null;
};
/** Excel section pseudo-rows ("TWIN RIG OPTIONS - …") carry neither a
 *  part number nor a model code — they are MPF layout, not motors. */
const isPseudoRow = (r: MotorRow) => !mPart(r);
/** Inline edits write EVERY mirror of a logical field so the quote flow,
 *  workspace and this table never disagree. */
function writeFieldsFor(field: string, next: any): Record<string, any> {
    switch (field) {
        case 'model': return { 'MODEL': next, 'Model Name': next };
        case 'hp': return { 'HP Rating': next };
        case 'shaft': return { 'Shaft Length': next, 'Shaft': next };
        case 'cost': return { cost: next, 'Total CTD': next };
        case 'sell': return { 'NSM Retail': next, sellPriceExclGst: next, 'priceLevels.hull_cash': next };
        default: return { [field]: next };
    }
}

export function MotorsTableView({ organisationId, initialSearch }: { organisationId?: string | null; initialSearch?: string } = {}) {
    const firestore = useFirestore();

    const vendorsQuery = useMemoFirebase(
        () => query(collection(firestore, 'data-warehouse'), where('vendorType', '==', 'Motor Brand')),
        [firestore],
    );
    const { data: vendors, isLoading: vendorsLoading } = useCollection<Vendor>(vendorsQuery);

    const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
    /** v1.14 (Story 3.7.7) — Import sheet that wraps the existing
     *  MasterPriceFileWorkspace so admins don't have to bounce out to the
     *  vendor module page to import an MPF / Sam Allen / Trailer Pricing
     *  spreadsheet. Same surface, new entry point. */
    const [importOpen, setImportOpen] = useState(false);

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
                            Motors Catalogue
                        </CardTitle>
                        <CardDescription className="text-xs">
                            These are the same Master Price File rows quotes price from. Click a cell to edit — a Sell edit updates NSM Retail and the cash price level everywhere. Edits are provisional: the next Master Price File import replaces them.
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        {organisationId && selectedVendorId && (
                            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="rounded-xl text-xs h-9">
                                <FileUp className="h-3.5 w-3.5 mr-1" /> Import data
                            </Button>
                        )}
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
                </div>
            </CardHeader>
            <CardContent>
                {!selectedVendorId ? (
                    <EmptyState message="Pick a brand to view the catalogue." />
                ) : (
                    <MotorsTableBody vendorId={selectedVendorId} initialSearch={initialSearch} />
                )}
            </CardContent>

            {/* v1.14 (Story 3.7.7) — Import data sheet. Mounts the existing
                MasterPriceFileWorkspace inline so admins don't have to bounce
                to the vendor module page. */}
            <Sheet open={importOpen} onOpenChange={setImportOpen}>
                <SheetContent className="w-full sm:max-w-4xl overflow-y-auto">
                    <SheetHeader>
                        <SheetTitle>Import data</SheetTitle>
                        <SheetDescription className="text-xs">
                            Master Price File workspace for {(vendors ?? []).find(v => v.id === selectedVendorId)?.name ?? 'this vendor'}.
                            Same surface as the vendor module page; new entry point.
                        </SheetDescription>
                    </SheetHeader>
                    <div className="py-4">
                        {selectedVendorId && organisationId && (
                            <MasterPriceFileWorkspace
                                vendorId={selectedVendorId}
                                organisationId={organisationId}
                                isAdmin={true}
                            />
                        )}
                    </div>
                </SheetContent>
            </Sheet>
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

function MotorsTableBody({ vendorId, initialSearch }: { vendorId: string; initialSearch?: string }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [rows, setRows] = useState<MotorRow[]>([]);
    const [loading, setLoading] = useState(true);
    /** v1.34 — the resolved MPF dataset (rows live under it); null until
     *  discovery completes. All writes target this path. */
    const [dataSetId, setDataSetId] = useState<string | null>(null);
    const [pseudoHidden, setPseudoHidden] = useState(0);
    /** v1.17 (Story 3.10.3) — initial seed comes from the Catalog Manager's
     *  cross-tab search box. Local edits override afterwards. */
    const [search, setSearch] = useState(initialSearch ?? '');
    /** Sync if the parent's cross-tab search changes (vendor switch with
     *  filter still on). */
    useEffect(() => { if (initialSearch !== undefined) setSearch(initialSearch); }, [initialSearch]);
    const [seriesFilter, setSeriesFilter] = useState<string>('all');
    /** v1.17 (Story 3.10.1) — multi-row select. Set of row IDs the operator
     *  has ticked. Bulk price-adjustment toolbar appears when non-empty. */
    const [selected, setSelected] = useState<Set<string>>(new Set());
    /** v1.17 — bulk-markup input + apply lifecycle. Markup is cost-driven:
     *  next sell = round(cost * (1 + markup/100)). Rows without a cost are
     *  skipped and reported in the summary toast. */
    const [bulkMarkup, setBulkMarkup] = useState<string>('25');
    const [bulkApplying, setBulkApplying] = useState(false);
    /** v1.17 (Story 3.10.2) — paste-from-spreadsheet dialog state. */
    const [pasteOpen, setPasteOpen] = useState(false);

    /** v1.14 (3.8.1 retrofit; v1.34 repoint) — inline-edit handler. Writes
     *  every mirror of the logical field to the MPF dataset row; the next
     *  MPF import upserts by MODEL CODE and wins (source-of-truth rule). */
    const patchMotor = async (motorId: string, field: string, next: any) => {
        if (!dataSetId) return;
        const update = writeFieldsFor(field, next);
        try {
            await updateDoc(
                doc(firestore, 'data-warehouse', vendorId, 'dataSets', dataSetId, 'rows', motorId),
                { ...update, updatedAt: serverTimestamp() },
            );
            // Optimistic local update (dot-path priceLevels applied to the map).
            setRows(prev => prev.map(r => {
                if (r.id !== motorId) return r;
                const nextRow: MotorRow = { ...r };
                for (const [k, v] of Object.entries(update)) {
                    if (k === 'priceLevels.hull_cash') nextRow.priceLevels = { ...(nextRow.priceLevels || {}), hull_cash: v };
                    else nextRow[k] = v;
                }
                return nextRow;
            }));
            toast({ title: 'Saved' });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: err?.message ?? String(err) });
            throw err;
        }
    };

    /** v1.14 (Story 3.8.8) — CSV export of the currently-filtered rows. */
    const handleExport = () => {
        const header = ['Part Number', 'Model Name', 'Series', 'HP Rating', 'Shaft', 'Cost', 'Sell (NSM Retail)'];
        const escape = (v: any) => {
            if (v == null) return '';
            const s = String(v);
            if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
            return s;
        };
        const lines = [header.join(',')];
        for (const r of filtered) {
            lines.push([
                mPart(r) ?? '',
                mModel(r) ?? '',
                mSeries(r) ?? '',
                mHp(r) ?? '',
                mShaft(r) ?? '',
                mCost(r) ?? '',
                mSell(r) ?? '',
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
                // v1.34 — MPF source of truth: motors live in the vendor's
                // dataSet rows (the exact collection the quote flow prices
                // from). Same dataset-discovery heuristic as the workspace
                // and quote flow.
                const dsSnap = await getDocs(collection(firestore, 'data-warehouse', vendorId, 'dataSets'));
                if (cancelled) return;
                const datasets = dsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
                const preferred = datasets.find((s: any) =>
                    String(s.name || '').toLowerCase().match(/outboard|motor|library|engine/)) || datasets[0];
                if (!preferred) { setRows([]); setDataSetId(null); return; }
                setDataSetId(preferred.id);
                const rowsSnap = await getDocs(collection(firestore, 'data-warehouse', vendorId, 'dataSets', preferred.id, 'rows'));
                if (cancelled) return;
                const all: MotorRow[] = [];
                rowsSnap.forEach(d => all.push({ id: d.id, ...(d.data() as any) }));
                // MPF layout pseudo-rows (section headers) are not motors.
                const list = all.filter(r => !isPseudoRow(r));
                setPseudoHidden(all.length - list.length);
                list.sort((a, b) => {
                    const aKey = `${mSeries(a) ?? ''}|${mModel(a) ?? a.id}`;
                    const bKey = `${mSeries(b) ?? ''}|${mModel(b) ?? b.id}`;
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
        for (const r of rows) { const v = mSeries(r); if (v) s.add(String(v)); }
        return ['all', ...Array.from(s).sort()];
    }, [rows]);
    /** v1.34 pixel pass — MPF rows carry no Series; don't render a wide
     *  empty column (and the filter) when nothing would ever fill it. */
    const hasSeries = seriesOptions.length > 1;

    const filtered = useMemo(() => {
        let list = rows;
        if (seriesFilter !== 'all') list = list.filter(r => String(mSeries(r)) === seriesFilter);
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(r =>
                String(mModel(r) ?? '').toLowerCase().includes(q) ||
                String(mPart(r) ?? '').toLowerCase().includes(q) ||
                String(mHp(r) ?? '').toLowerCase().includes(q),
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

    /** v1.17 (Story 3.10.1) — toggle a single row's membership in `selected`. */
    const toggleRow = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    /** v1.17 — header checkbox: select-all-filtered if any are unselected,
     *  otherwise clear. Stays scoped to the currently-filtered list so an
     *  operator with a series filter on doesn't accidentally select hidden
     *  rows. */
    const toggleAllFiltered = () => {
        const filteredIds = filtered.map(r => r.id);
        const allSelected = filteredIds.length > 0 && filteredIds.every(id => selected.has(id));
        setSelected(prev => {
            const next = new Set(prev);
            if (allSelected) {
                for (const id of filteredIds) next.delete(id);
            } else {
                for (const id of filteredIds) next.add(id);
            }
            return next;
        });
    };

    const filteredAllSelected = filtered.length > 0 && filtered.every(r => selected.has(r.id));
    const filteredSomeSelected = filtered.some(r => selected.has(r.id));

    /** v1.17 (Story 3.10.1) — bulk markup. Iterates the selected rows in
     *  sequence, computes the new sell from cost * (1 + markup/100), rounds
     *  to whole dollars, writes Firestore. Skips rows without a cost and
     *  reports in the summary toast. */
    const applyBulkMarkup = async () => {
        const pct = parseFloat(bulkMarkup);
        if (!Number.isFinite(pct) || pct < -100) {
            toast({ variant: 'destructive', title: 'Invalid markup', description: 'Enter a number greater than -100.' });
            return;
        }
        const rowsToWrite = rows.filter(r => selected.has(r.id));
        if (rowsToWrite.length === 0) return;
        setBulkApplying(true);
        let updated = 0;
        let skipped = 0;
        const factor = 1 + pct / 100;
        try {
            for (const r of rowsToWrite) {
                const cost = mCost(r);
                if (cost == null || !dataSetId) { skipped += 1; continue; }
                const nextSell = Math.round(cost * factor);
                const update = writeFieldsFor('sell', nextSell);
                try {
                    await updateDoc(
                        doc(firestore, 'data-warehouse', vendorId, 'dataSets', dataSetId, 'rows', r.id),
                        { ...update, updatedAt: serverTimestamp() },
                    );
                    setRows(prev => prev.map(x => x.id === r.id
                        ? { ...x, 'NSM Retail': nextSell, sellPriceExclGst: nextSell, priceLevels: { ...(x.priceLevels || {}), hull_cash: nextSell } }
                        : x));
                    updated += 1;
                } catch (err) {
                    console.error('bulk-markup row write failed', r.id, err);
                    skipped += 1;
                }
            }
            toast({
                title: `Bulk markup applied`,
                description: `${updated} updated, ${skipped} skipped${skipped > 0 ? ' (missing cost or write failed)' : ''}.`,
            });
            setSelected(new Set());
        } finally {
            setBulkApplying(false);
        }
    };

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
                {hasSeries && (
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
                )}
                <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground ml-auto">
                    {filtered.length} of {rows.length}
                    {pseudoHidden > 0 && <span className="text-muted-foreground/60"> · {pseudoHidden} MPF section rows hidden</span>}
                </p>
                <Button variant="outline" size="sm" onClick={handleExport} className="rounded-xl text-xs h-9" disabled={filtered.length === 0}>
                    <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
                </Button>
                {/* v1.17 (Story 3.10.2) — paste-from-spreadsheet entry point */}
                <Button variant="outline" size="sm" onClick={() => setPasteOpen(true)} className="rounded-xl text-xs h-9">
                    <ClipboardPaste className="h-3.5 w-3.5 mr-1" /> Paste
                </Button>
            </div>
            {dataSetId && (
                <PasteFromSpreadsheet
                    open={pasteOpen}
                    onOpenChange={setPasteOpen}
                    collectionPath={['data-warehouse', vendorId, 'dataSets', dataSetId, 'rows']}
                    existingRows={rows as any}
                    resourceLabel="motors"
                />
            )}

            <TooltipProvider>
                {/* v1.17 (Story 3.10.1) — bulk-action toolbar. Renders when
                    any rows are selected. Currently scoped to bulk markup;
                    bulk cost adjust + bulk price-level retarget land in
                    later v1.17 commits. */}
                {selected.size > 0 && (
                    <div data-testid="motors-bulk-toolbar" className="rounded-xl border-2 border-primary bg-primary/5 p-3 flex items-center gap-3 flex-wrap mb-3">
                        <p className="text-xs font-bold uppercase tracking-widest text-primary">
                            {selected.size} selected
                        </p>
                        <div className="flex items-center gap-2">
                            <Percent className="h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                                type="number"
                                step="0.5"
                                value={bulkMarkup}
                                onChange={e => setBulkMarkup(e.target.value)}
                                className="h-8 w-24 rounded-lg text-xs"
                                placeholder="Markup %"
                                disabled={bulkApplying}
                            />
                            <span className="text-[10px] text-muted-foreground">markup over cost</span>
                        </div>
                        <Button
                            size="sm"
                            onClick={applyBulkMarkup}
                            disabled={bulkApplying}
                            className="h-8 rounded-lg text-xs"
                        >
                            {bulkApplying ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                            Apply markup
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelected(new Set())}
                            disabled={bulkApplying}
                            className="h-8 rounded-lg text-xs ml-auto"
                        >
                            <X className="h-3 w-3 mr-1" /> Clear
                        </Button>
                    </div>
                )}
                {/* v1.33 (Mark: catalog scroll bug) — contained scroll: horizontal
                    scrollbar lives on the table (not the page bottom), headers freeze. */}
                <div className="rounded-xl border-2 overflow-auto max-h-[70vh]">
                    <table className="w-full text-xs">
                        <thead className="bg-slate-50 border-b-2 sticky top-0 z-10 shadow-sm">
                            <tr className="text-left">
                                <th className="w-8 px-2 py-2">
                                    {/* v1.17 (3.10.1) — select-all-filtered header checkbox */}
                                    <Checkbox
                                        checked={filteredAllSelected ? true : (filteredSomeSelected ? 'indeterminate' : false)}
                                        onCheckedChange={toggleAllFiltered}
                                        aria-label="Select all filtered rows"
                                    />
                                </th>
                                <ColumnHeader label="Part #" hint="MODEL CODE / part number — the MPF natural key. Imports upsert by this; read-only here." />
                                <ColumnHeader label="Model" hint="Model name as it appears on the data sheet." />
                                {hasSeries && <ColumnHeader label="Series" hint="Series the motor belongs to (e.g. F25, F70). Drives the series filter chip row." />}
                                <ColumnHeader label="HP" hint="Horsepower rating. Multi-engine syntax 'N × HP' is parsed at the quote-flow side." />
                                <ColumnHeader label="Shaft" hint="Shaft length code (S / L / X / U). Matters for transom compatibility." />
                                <ColumnHeader label="Cost" align="right" hint="Dealer cost. Inline-editable — click the cell to edit." />
                                <ColumnHeader label="Sell" align="right" hint="NSM Retail (the cash price level). Editing writes NSM Retail + priceLevels.hull_cash + sellPriceExclGst so every surface agrees. The next MPF import wins." />
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(row => (
                                <tr key={row.id} className={`border-b last:border-b-0 hover:bg-slate-50 ${selected.has(row.id) ? 'bg-primary/5' : ''}`}>
                                    <td className="w-8 px-2 py-2">
                                        {/* v1.17 (3.10.1) — per-row checkbox */}
                                        <Checkbox
                                            checked={selected.has(row.id)}
                                            onCheckedChange={() => toggleRow(row.id)}
                                            aria-label={`Select ${mModel(row) ?? row.id}`}
                                        />
                                    </td>
                                    <td className="px-3 py-2 font-mono font-bold">{mPart(row) ?? '—'}</td>
                                    <td className="px-3 py-2">
                                        <InlineEditCell
                                            type="text"
                                            value={mModel(row) as string}
                                            onSave={(v) => patchMotor(row.id, 'model', v)}
                                        />
                                    </td>
                                    {hasSeries && (
                                    <td className="px-3 py-2">
                                        {mSeries(row) && <Badge variant="outline" className="text-[10px]">{mSeries(row)}</Badge>}
                                    </td>
                                    )}
                                    <td className="px-3 py-2 tabular-nums whitespace-nowrap w-24">
                                        <InlineEditCell
                                            type="text"
                                            value={mHp(row) as string}
                                            onSave={(v) => patchMotor(row.id, 'hp', v)}
                                        />
                                    </td>
                                    <td className="px-3 py-2">
                                        <InlineEditCell
                                            type="text"
                                            value={mShaft(row) as string}
                                            onSave={(v) => patchMotor(row.id, 'shaft', v)}
                                        />
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                                        <InlineEditCell
                                            type="currency"
                                            value={mCost(row)}
                                            validate={(n) => (n != null && (typeof n !== 'number' || n < 0) ? 'Positive number' : null)}
                                            onSave={(v) => patchMotor(row.id, 'cost', v)}
                                        />
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums font-bold">
                                        <InlineEditCell
                                            type="currency"
                                            value={mSell(row)}
                                            validate={(n) => (n != null && (typeof n !== 'number' || n < 0) ? 'Positive number' : null)}
                                            onSave={(v) => patchMotor(row.id, 'sell', v)}
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

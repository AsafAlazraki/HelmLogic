'use client';

import { useState, useMemo, useCallback } from 'react';
import { collection, query, doc, setDoc, updateDoc, addDoc, deleteDoc, getDocs, writeBatch } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, Upload, Search, FileSpreadsheet, FileText, Database, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MasterPriceFileWorkspaceProps {
    vendorId: string;
    organisationId: string;
    isAdmin: boolean;
}

interface DataSet {
    id: string;
    name: string;
    rowCount?: number;
}

// ---------------------------------------------------------------------------
// Editable Cell
// ---------------------------------------------------------------------------

function EditableCell({ value, onChange, isNumeric }: { value: string; onChange: (v: string) => void; isNumeric?: boolean }) {
    const [editing, setEditing] = useState(false);
    const [localValue, setLocalValue] = useState(value);

    if (editing) {
        return (
            <input
                autoFocus
                value={localValue}
                onChange={(e) => setLocalValue(e.target.value)}
                onBlur={() => { setEditing(false); if (localValue !== value) onChange(localValue); }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') { setEditing(false); if (localValue !== value) onChange(localValue); }
                    if (e.key === 'Escape') { setEditing(false); setLocalValue(value); }
                }}
                className="w-full h-full px-2 py-1 text-xs border-2 border-primary rounded-lg outline-none bg-white"
            />
        );
    }

    const displayValue = isNumeric && value && !isNaN(parseFloat(value))
        ? `$${parseFloat(value).toFixed(2)}`
        : (value || '—');

    return (
        <span
            onClick={() => { setEditing(true); setLocalValue(value); }}
            className={`cursor-pointer hover:bg-primary/5 block px-2 py-1 min-h-[28px] ${isNumeric ? 'text-right font-mono' : ''}`}
        >
            {displayValue}
        </span>
    );
}

// ---------------------------------------------------------------------------
// Currency detection
// ---------------------------------------------------------------------------

const NUMERIC_FIELDS = new Set([
    'ctd', 'inflation', 'adjctd', 'totpartsctd', 'partssell', 'totallab',
    'labourctd', 'labourret', 'sundry', 'sundry1', 'sublet', 'actctd', 'mu',
    'gp', 'actsell', 'rebate', 'sell', 'labhrs', 'trade', 'retail', 'rrp',
    'dealernet', 'gm', 'list', 'retailgst', 'stockoh', 'daily', 'bulkqty',
    'nettbulk', 'baselist', 'cost',
]);

function isNumericField(fieldName: string): boolean {
    const normalized = fieldName.toLowerCase().replace(/[^a-z0-9]/g, '');
    return NUMERIC_FIELDS.has(normalized) || normalized.includes('price') || normalized.includes('cost') || normalized.includes('sell') || normalized.includes('retail');
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function MasterPriceFileWorkspace({ vendorId, organisationId, isAdmin }: MasterPriceFileWorkspaceProps) {
    const firestore = useFirestore();
    const [activeDataSet, setActiveDataSet] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [importing, setImporting] = useState(false);

    // Fetch all datasets
    const dataSetsQuery = useMemoFirebase(() =>
        collection(firestore, `data-warehouse/${vendorId}/dataSets`),
        [firestore, vendorId]
    );
    const { data: dataSets, loading: dataSetsLoading } = useCollection<DataSet>(dataSetsQuery);

    // Auto-select first dataset
    const effectiveDataSet = activeDataSet || dataSets?.[0]?.id || null;

    // Fetch rows for active dataset
    const rowsQuery = useMemoFirebase(() =>
        effectiveDataSet ? collection(firestore, `data-warehouse/${vendorId}/dataSets/${effectiveDataSet}/rows`) : null,
        [firestore, vendorId, effectiveDataSet]
    );
    const { data: rows, loading: rowsLoading } = useCollection<any>(rowsQuery);

    // Auto-detect columns from data
    const columns = useMemo(() => {
        if (!rows || rows.length === 0) return [];
        const allKeys = new Set<string>();
        rows.slice(0, 50).forEach((r: any) => {
            Object.keys(r).forEach(k => { if (k !== 'id') allKeys.add(k); });
        });
        return Array.from(allKeys);
    }, [rows]);

    // Search filter
    const filteredRows = useMemo(() => {
        if (!rows) return [];
        if (!searchTerm) return rows;
        const q = searchTerm.toLowerCase();
        return rows.filter((r: any) =>
            columns.some(col => String(r[col] || '').toLowerCase().includes(q))
        );
    }, [rows, searchTerm, columns]);

    // Cell edit handler
    const handleCellEdit = useCallback(async (rowId: string, field: string, value: string) => {
        if (!effectiveDataSet) return;
        try {
            await updateDoc(doc(firestore, `data-warehouse/${vendorId}/dataSets/${effectiveDataSet}/rows`, rowId), {
                [field]: value
            });
        } catch (error) {
            console.error('Failed to update cell:', error);
            toast({ variant: 'destructive', title: 'Save failed' });
        }
    }, [firestore, vendorId, effectiveDataSet]);

    // Export
    const handleExport = useCallback((format: 'xlsx' | 'csv') => {
        if (!rows || rows.length === 0) return;
        const exportRows = rows.map((r: any) => {
            const { id, ...rest } = r;
            return rest;
        });
        const ws = XLSX.utils.json_to_sheet(exportRows);
        if (format === 'xlsx') {
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, effectiveDataSet || 'Data');
            XLSX.writeFile(wb, `${effectiveDataSet || 'data'}.xlsx`);
        } else {
            const csv = XLSX.utils.sheet_to_csv(ws);
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${effectiveDataSet || 'data'}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        }
        toast({ title: 'Exported', description: `${rows.length} rows exported.` });
    }, [rows, effectiveDataSet]);

    // Import
    const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !effectiveDataSet) return;
        setImporting(true);

        try {
            const data = await file.arrayBuffer();
            const wb = XLSX.read(data, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const parsed = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });

            if (parsed.length === 0) {
                toast({ variant: 'destructive', title: 'Empty file' });
                return;
            }

            // Clear existing rows
            const existingSnap = await getDocs(collection(firestore, `data-warehouse/${vendorId}/dataSets/${effectiveDataSet}/rows`));
            const batch = writeBatch(firestore);
            existingSnap.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();

            // Write new rows in batches
            let written = 0;
            for (let i = 0; i < parsed.length; i += 500) {
                const chunk = parsed.slice(i, i + 500);
                const b = writeBatch(firestore);
                for (const row of chunk) {
                    const ref = doc(collection(firestore, `data-warehouse/${vendorId}/dataSets/${effectiveDataSet}/rows`));
                    b.set(ref, row);
                }
                await b.commit();
                written += chunk.length;
            }

            // Update dataset doc
            await updateDoc(doc(firestore, `data-warehouse/${vendorId}/dataSets`, effectiveDataSet), {
                rowCount: written,
                lastImportAt: new Date(),
            });

            toast({ title: 'Import Complete', description: `${written} rows imported.` });
        } catch (error) {
            console.error('Import failed:', error);
            toast({ variant: 'destructive', title: 'Import failed' });
        } finally {
            setImporting(false);
            e.target.value = '';
        }
    }, [firestore, vendorId, effectiveDataSet]);

    // Import as NEW dataset (creates dataset from file)
    const handleImportNewDataset = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setImporting(true);

        try {
            const data = await file.arrayBuffer();
            const wb = XLSX.read(data, { type: 'array' });

            // Process each sheet as a separate dataset
            for (const sheetName of wb.SheetNames) {
                const ws = wb.Sheets[sheetName];
                const parsed = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });

                if (parsed.length === 0) continue;

                // Clean sheet name for dataset ID
                const dataSetId = sheetName.toLowerCase()
                    .replace(/[^a-z0-9\s-]/g, '')
                    .replace(/\s+/g, '-')
                    .substring(0, 40);

                console.log(`Importing sheet: ${sheetName} → ${dataSetId} (${parsed.length} rows)`);

                // Create dataset doc
                await setDoc(doc(firestore, `data-warehouse/${vendorId}/dataSets`, dataSetId), {
                    name: sheetName,
                    rowCount: parsed.length,
                    createdAt: new Date(),
                });

                // Write rows in batches
                let written = 0;
                for (let i = 0; i < parsed.length; i += 500) {
                    const chunk = parsed.slice(i, i + 500);
                    const b = writeBatch(firestore);
                    for (const row of chunk) {
                        // Clean row — remove empty string values
                        const cleanRow: Record<string, any> = {};
                        for (const [key, val] of Object.entries(row)) {
                            if (key && String(val).trim()) {
                                cleanRow[key] = val;
                            }
                        }
                        if (Object.keys(cleanRow).length > 0) {
                            const ref = doc(collection(firestore, `data-warehouse/${vendorId}/dataSets/${dataSetId}/rows`));
                            b.set(ref, cleanRow);
                        }
                    }
                    await b.commit();
                    written += chunk.length;
                }
                console.log(`  ✓ ${sheetName}: ${written} rows`);
            }

            toast({ title: 'Import Complete', description: `Imported ${wb.SheetNames.length} sheet(s) from ${file.name}` });
            // Switch to the first imported dataset
            const firstId = wb.SheetNames[0]?.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').substring(0, 40);
            if (firstId) setActiveDataSet(firstId);
        } catch (error) {
            console.error('Import failed:', error);
            toast({ variant: 'destructive', title: 'Import failed', description: String(error) });
        } finally {
            setImporting(false);
            e.target.value = '';
        }
    }, [firestore, vendorId]);

    // Delete row
    const handleDeleteRow = useCallback(async (rowId: string) => {
        if (!effectiveDataSet) return;
        try {
            await deleteDoc(doc(firestore, `data-warehouse/${vendorId}/dataSets/${effectiveDataSet}/rows`, rowId));
            toast({ title: 'Row deleted' });
        } catch (error) {
            console.error('Delete failed:', error);
            toast({ variant: 'destructive', title: 'Delete failed' });
        }
    }, [firestore, vendorId, effectiveDataSet]);

    // Add row
    const handleAddRow = useCallback(async () => {
        if (!effectiveDataSet || columns.length === 0) return;
        try {
            const emptyRow: Record<string, string> = {};
            columns.forEach(c => { emptyRow[c] = ''; });
            await addDoc(collection(firestore, `data-warehouse/${vendorId}/dataSets/${effectiveDataSet}/rows`), emptyRow);
            toast({ title: 'Row added' });
        } catch (error) {
            console.error('Add row failed:', error);
            toast({ variant: 'destructive', title: 'Failed to add row' });
        }
    }, [firestore, vendorId, effectiveDataSet, columns]);

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between py-4 px-8 bg-white border-b-2 border-slate-300">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary shadow-sm border-2 border-primary/20">
                        <Database className="h-5 w-5" />
                    </div>
                    <div className="flex items-center gap-2">
                        <h2 className="text-base font-black uppercase tracking-widest text-slate-950 leading-none">
                            Master Price File
                        </h2>
                        {effectiveDataSet && (
                            <Badge variant="secondary" className="text-[9px] font-black uppercase tracking-widest">
                                {dataSets?.find(d => d.id === effectiveDataSet)?.name || effectiveDataSet}
                            </Badge>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="rounded-xl border-2 text-[10px] font-black uppercase tracking-widest h-10 px-5 gap-2">
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
                    {effectiveDataSet && (
                        <label className="inline-flex items-center gap-2 h-10 px-5 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-slate-50 transition-colors">
                            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                            Replace Data
                            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} disabled={importing} />
                        </label>
                    )}
                    <label className="inline-flex items-center gap-2 h-10 px-5 rounded-xl border-2 bg-primary text-white text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-primary/90 transition-colors">
                        {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                        Import Excel File
                        <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportNewDataset} disabled={importing} />
                    </label>
                    {effectiveDataSet && (
                        <Button onClick={handleAddRow} className="rounded-xl text-[10px] font-black uppercase tracking-widest h-10 px-5 gap-2">
                            <Plus className="h-4 w-4" /> Add Row
                        </Button>
                    )}
                </div>
            </div>

            {/* Dataset tabs */}
            <div className="shrink-0 px-8 py-3 flex items-center gap-2 border-b overflow-x-auto">
                {dataSetsLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                ) : dataSets && dataSets.length > 0 ? (
                    dataSets.map((ds) => (
                        <button
                            key={ds.id}
                            onClick={() => { setActiveDataSet(ds.id); setSearchTerm(''); }}
                            className={`px-3 h-8 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest transition-all rounded-lg shrink-0 ${
                                effectiveDataSet === ds.id
                                    ? 'bg-white shadow-sm text-slate-950 border-2 border-slate-200'
                                    : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            {ds.name || ds.id}
                            {ds.rowCount && <Badge variant="secondary" className="text-[8px] h-4 px-1 ml-1">{ds.rowCount}</Badge>}
                        </button>
                    ))
                ) : (
                    <p className="text-xs text-slate-400 italic">No datasets found. Import data to get started.</p>
                )}
            </div>

            {/* Search bar */}
            <div className="shrink-0 px-8 py-3 flex items-center gap-3 border-b-2 border-slate-200 bg-slate-50/50">
                <div className="flex flex-col gap-1 flex-1 max-w-xs">
                    <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Search</span>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <Input
                            placeholder="Search..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 h-9 rounded-xl border-2 text-xs"
                        />
                    </div>
                </div>
                <div className="flex items-center gap-2 mt-4">
                    <Badge variant="outline" className="text-[9px] font-black border-2">
                        {filteredRows.length} {filteredRows.length !== rows?.length ? `of ${rows?.length}` : ''} rows
                    </Badge>
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 min-h-0 overflow-hidden">
                {rowsLoading ? (
                    <div className="flex items-center justify-center h-full">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : filteredRows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3">
                        <Database className="h-12 w-12 text-slate-200" />
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            {rows?.length === 0 ? 'No data in this dataset' : 'No matching rows'}
                        </p>
                    </div>
                ) : (
                    <div className="flex-1 w-full overflow-hidden flex flex-col bg-white relative border-t">
                        <div className="flex-1 overflow-auto scrollbar-thin">
                            <table className="border-separate border-spacing-0 w-max table-fixed">
                                <thead className="sticky top-0 z-[100]">
                                    <tr>
                                        <th className="w-[50px] sticky left-0 top-0 z-[120] bg-white border-r-2 border-b-2 border-slate-300 text-center text-[8px] font-black uppercase shadow-[4px_0_10px_-2px_rgba(0,0,0,0.1)] py-2.5 px-2">
                                            #
                                        </th>
                                        {columns.map((col, idx) => (
                                            <th
                                                key={col}
                                                className={`text-[8px] font-black uppercase tracking-widest text-slate-400 px-4 py-3 border-r border-b-2 border-slate-300 whitespace-nowrap text-left bg-slate-100 ${
                                                    isNumericField(col) ? 'text-right min-w-[120px]' : 'min-w-[180px]'
                                                } ${idx === 0 ? 'sticky left-[50px] z-[110] bg-white shadow-[4px_0_10px_-2px_rgba(0,0,0,0.05)]' : ''}`}
                                            >
                                                <span className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-600">{col}</span>
                                            </th>
                                        ))}
                                        <th className="text-[8px] font-black uppercase tracking-widest text-slate-400 px-3 py-3 border-b-2 border-slate-300 w-[60px] bg-slate-100">
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredRows.map((row: any, rowIdx: number) => (
                                        <tr key={row.id} className="group hover:bg-primary/5 transition-colors">
                                            <td className="sticky left-0 z-[80] border-r-2 border-b border-slate-200 bg-white shadow-[4px_0_10px_-2px_rgba(0,0,0,0.05)] text-center text-[9px] text-slate-400 font-mono px-2 py-1 group-hover:bg-primary/5">
                                                {rowIdx + 1}
                                            </td>
                                            {columns.map((col, idx) => (
                                                <td key={col} className={`border-r border-b border-slate-200 text-xs ${
                                                    idx === 0 ? 'sticky left-[50px] z-[70] bg-white shadow-[4px_0_10px_-2px_rgba(0,0,0,0.03)] group-hover:bg-primary/5 font-semibold' : 'group-hover:bg-primary/5'
                                                }`}>
                                                    <EditableCell
                                                        value={String(row[col] ?? '')}
                                                        onChange={(v) => handleCellEdit(row.id, col, v)}
                                                        isNumeric={isNumericField(col)}
                                                    />
                                                </td>
                                            ))}
                                            <td className="border-b border-slate-200 px-2 group-hover:bg-primary/5">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 rounded-md text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                                    onClick={() => handleDeleteRow(row.id)}
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                            </td>
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

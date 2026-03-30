'use client';

import React, { useState, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Upload, FileSpreadsheet, Loader2, Check } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface StockImportProps {
    moduleId: string;
    organisationId: string;
    onComplete?: () => void;
}

interface InventoryItem {
    name?: string;
    stockNumber?: string;
    label?: string;
    status?: string;
    location?: string;
    soldBy?: string;
    model?: string;
    colour?: string;
    serialNumber?: string;
    material?: string;
    notes?: string;
    dateIntoStock?: string;
}

const COLUMN_MAP: Record<string, string> = {
    'name': 'name',
    'stock number': 'stockNumber',
    'stock_number': 'stockNumber',
    'stocknumber': 'stockNumber',
    'status': 'status',
    'location': 'location',
    'sold by': 'soldBy',
    'sold_by': 'soldBy',
    'soldby': 'soldBy',
    'label': 'label',
    'model': 'model',
    'colour': 'colour',
    'color': 'colour',
    'serial number': 'serialNumber',
    'serial_number': 'serialNumber',
    'serialnumber': 'serialNumber',
    'material': 'material',
    'notes': 'notes',
    'date into stock': 'dateIntoStock',
    'date_into_stock': 'dateIntoStock',
    'date': 'dateIntoStock',
    'eta': 'dateIntoStock',
};

function parseFile(file: File): Promise<Record<string, string>[]> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target!.result as ArrayBuffer);
                const wb = XLSX.read(data, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });
                resolve(rows);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

function mapRow(raw: Record<string, string>): Partial<InventoryItem> {
    const mapped: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
        const normalizedKey = key.toLowerCase().trim();
        const fieldName = COLUMN_MAP[normalizedKey];
        if (fieldName) {
            mapped[fieldName] = value;
        }
    }
    return mapped;
}

export function StockImport({ moduleId, organisationId, onComplete }: StockImportProps) {
    const firestore = useFirestore();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<'select' | 'preview' | 'importing' | 'done'>('select');
    const [fileName, setFileName] = useState('');
    const [rows, setRows] = useState<Record<string, string>[]>([]);
    const [mappedRows, setMappedRows] = useState<Partial<InventoryItem>[]>([]);
    const [importing, setImporting] = useState(false);
    const [importedCount, setImportedCount] = useState(0);

    const resetState = useCallback(() => {
        setStep('select');
        setFileName('');
        setRows([]);
        setMappedRows([]);
        setImporting(false);
        setImportedCount(0);
    }, []);

    const handleOpenChange = useCallback((isOpen: boolean) => {
        setOpen(isOpen);
        if (!isOpen) {
            resetState();
        }
    }, [resetState]);

    const handleFile = useCallback(async (file: File) => {
        try {
            const parsed = await parseFile(file);
            if (parsed.length === 0) {
                toast({ title: 'Empty file', description: 'No rows found in the uploaded file.', variant: 'destructive' });
                return;
            }
            setFileName(file.name);
            setRows(parsed);
            setMappedRows(parsed.map(mapRow));
            setStep('preview');
        } catch (err) {
            console.error('Failed to parse file:', err);
            toast({ title: 'Parse Error', description: 'Could not parse the uploaded file.', variant: 'destructive' });
        }
    }, []);

    const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
    }, [handleFile]);

    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
    }, [handleFile]);

    const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
    }, []);

    const handleImport = useCallback(async () => {
        setImporting(true);
        setStep('importing');
        let count = 0;

        try {
            for (const item of mappedRows) {
                let dateIntoStock = null;
                if (item.dateIntoStock) {
                    const d = new Date(item.dateIntoStock);
                    if (!isNaN(d.getTime())) {
                        dateIntoStock = Timestamp.fromDate(d);
                    }
                }

                await addDoc(collection(firestore, 'inventory'), {
                    name: item.name || item.model || 'Imported Item',
                    stockNumber: item.stockNumber || `IMP-${Date.now().toString().slice(-6)}`,
                    label: item.label || '',
                    status: item.status || 'In Stock',
                    location: item.location || '',
                    soldBy: item.soldBy || '',
                    model: item.model || '',
                    colour: item.colour || '',
                    serialNumber: item.serialNumber || '',
                    material: item.material || '',
                    notes: item.notes || '',
                    dateIntoStock: dateIntoStock || serverTimestamp(),
                    moduleId,
                    organisationId,
                    photoUrls: [],
                    pdfAttachments: [],
                    createdAt: serverTimestamp(),
                });
                count++;
            }

            setImportedCount(count);
            setStep('done');
            toast({ title: 'Import Complete', description: `Successfully imported ${count} stock items.` });
            onComplete?.();
        } catch (err) {
            console.error('Import failed:', err);
            toast({ title: 'Import Failed', description: 'An error occurred during import. Some items may have been imported.', variant: 'destructive' });
            setImporting(false);
            setStep('preview');
        }
    }, [firestore, mappedRows, moduleId, organisationId, onComplete]);

    const mappedFieldNames = mappedRows.length > 0
        ? [...new Set(mappedRows.flatMap((r) => Object.keys(r)))]
        : [];

    const previewRows = mappedRows.slice(0, 5);

    return (
        <>
            <Button
                variant="outline"
                onClick={() => setOpen(true)}
                className="h-12 rounded-xl font-black uppercase text-[10px]"
            >
                <Upload className="mr-2 h-4 w-4" />
                Import
            </Button>

            <Dialog open={open} onOpenChange={handleOpenChange}>
                <DialogContent className="rounded-3xl border-4 shadow-2xl p-0 overflow-hidden max-w-3xl max-h-[85vh] flex flex-col">
                    <DialogHeader className="p-8 bg-muted/5 border-b">
                        <DialogTitle className="text-2xl font-black uppercase tracking-tight">
                            Import Stock Items
                        </DialogTitle>
                        <DialogDescription className="text-[10px] font-black uppercase tracking-widest text-primary">
                            {step === 'select' && 'Upload a CSV or Excel file'}
                            {step === 'preview' && 'Review data before importing'}
                            {step === 'importing' && 'Importing items...'}
                            {step === 'done' && 'Import complete'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="p-8 flex-1 overflow-y-auto">
                        {/* Step 1: File Selection */}
                        {step === 'select' && (
                            <div
                                className="border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer hover:border-primary/40 transition-colors"
                                onClick={() => fileInputRef.current?.click()}
                                onDrop={handleDrop}
                                onDragOver={handleDragOver}
                            >
                                <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                                <p className="text-sm font-medium mb-1">
                                    Drop your file here or click to browse
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Supports CSV, XLSX, and XLS files
                                </p>
                                <Input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".csv,.xlsx,.xls"
                                    className="hidden"
                                    onChange={handleFileInput}
                                />
                            </div>
                        )}

                        {/* Step 2: Preview */}
                        {step === 'preview' && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm font-medium">{fileName}</span>
                                    </div>
                                    <Badge variant="secondary">
                                        {rows.length} rows will be imported
                                    </Badge>
                                </div>

                                <ScrollArea className="w-full">
                                    <div className="rounded-2xl border-2 border-slate-100 overflow-hidden text-xs">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="bg-muted/30">
                                                    {mappedFieldNames.map((field) => (
                                                        <th
                                                            key={field}
                                                            className="px-3 py-2 text-left font-bold uppercase tracking-wider text-[10px]"
                                                        >
                                                            {field}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {previewRows.map((row, i) => (
                                                    <tr key={i} className="border-t border-slate-100">
                                                        {mappedFieldNames.map((field) => (
                                                            <td key={field} className="px-3 py-2 truncate max-w-[200px]">
                                                                {(row as Record<string, string>)[field] || ''}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </ScrollArea>

                                {rows.length > 5 && (
                                    <p className="text-xs text-muted-foreground text-center">
                                        Showing 5 of {rows.length} rows
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Step 3: Importing */}
                        {step === 'importing' && (
                            <div className="flex flex-col items-center justify-center py-8">
                                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                                <p className="text-sm font-medium">Importing stock items...</p>
                                <p className="text-xs text-muted-foreground">
                                    Please do not close this dialog
                                </p>
                            </div>
                        )}

                        {/* Step 4: Done */}
                        {step === 'done' && (
                            <div className="flex flex-col items-center justify-center py-8">
                                <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
                                    <Check className="h-6 w-6 text-green-600" />
                                </div>
                                <p className="text-sm font-medium">
                                    Successfully imported {importedCount} items
                                </p>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="p-8 border-t bg-muted/5 shrink-0">
                        {step === 'select' && (
                            <DialogClose asChild>
                                <Button
                                    variant="outline"
                                    className="h-12 rounded-xl font-black uppercase text-[10px]"
                                >
                                    Cancel
                                </Button>
                            </DialogClose>
                        )}

                        {step === 'preview' && (
                            <div className="flex gap-2 w-full justify-end">
                                <Button
                                    variant="outline"
                                    onClick={resetState}
                                    className="h-12 rounded-xl font-black uppercase text-[10px]"
                                >
                                    Back
                                </Button>
                                <Button
                                    onClick={handleImport}
                                    className="h-12 rounded-xl font-black uppercase text-[10px]"
                                >
                                    <Upload className="mr-2 h-4 w-4" />
                                    Import {rows.length} Items
                                </Button>
                            </div>
                        )}

                        {step === 'done' && (
                            <DialogClose asChild>
                                <Button className="h-12 rounded-xl font-black uppercase text-[10px]">
                                    Close
                                </Button>
                            </DialogClose>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

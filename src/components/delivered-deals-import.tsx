'use client';

import React, { useState, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { collection, collectionGroup, addDoc, getDocs, serverTimestamp, Timestamp, query, where } from 'firebase/firestore';
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
import { Upload, FileSpreadsheet, Loader2, Check, AlertCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface DeliveredDealsImportProps {
    moduleId: string;
    organisationId: string;
    onComplete?: () => void;
}

interface CatalogModel {
    id: string;
    name: string;
    modelCode: string;
    rangeId: string;
}

interface DeliveredDealItem {
    name?: string;
    stockNumber?: string;
    status?: string;
    location?: string;
    soldBy?: string;
    model?: string;
    colour?: string;
    serialNumber?: string;
    material?: string;
    customerNotes?: string;
    poOrDealNumber?: string;
    deliveryDate?: string;
    motor?: string;
    motorSerialNumber?: string;
    trailer?: string;
    invoicedAmount?: string;
    label?: string;
    consignmentWith?: string;
}

const COLUMN_MAP: Record<string, string> = {
    'name': 'name',
    'stock number': 'stockNumber',
    'stocknumber': 'stockNumber',
    'status': 'status',
    'location': 'location',
    'sold by': 'soldBy',
    'soldby': 'soldBy',
    'model': 'model',
    'colour': 'colour',
    'color': 'colour',
    'serial number': 'serialNumber',
    'serialnumber': 'serialNumber',
    'material': 'material',
    'notes': 'customerNotes',
    'customer': 'customerNotes',
    'customer name': 'customerNotes',
    'customer notes': 'customerNotes',
    'po': 'poOrDealNumber',
    'deal': 'poOrDealNumber',
    'deal number': 'poOrDealNumber',
    'po or deal': 'poOrDealNumber',
    'delivery date': 'deliveryDate',
    'motor': 'motor',
    'motor serial': 'motorSerialNumber',
    'motor s/n': 'motorSerialNumber',
    'trailer': 'trailer',
    'invoiced amount': 'invoicedAmount',
    'amount': 'invoicedAmount',
    'label': 'label',
    'consignment': 'consignmentWith',
    'on consignment': 'consignmentWith',
    'consignment with': 'consignmentWith',
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

function findBestModelMatch(importedModel: string, catalogModels: CatalogModel[]): CatalogModel | null {
    if (!importedModel) return null;
    const normalized = importedModel.toLowerCase().trim();

    // Exact match on modelCode or name
    const exact = catalogModels.find(m =>
        m.modelCode.toLowerCase() === normalized ||
        m.name.toLowerCase() === normalized
    );
    if (exact) return exact;

    // Partial match
    const partial = catalogModels.find(m =>
        normalized.includes(m.modelCode.toLowerCase()) ||
        m.modelCode.toLowerCase().includes(normalized) ||
        normalized.includes(m.name.toLowerCase()) ||
        m.name.toLowerCase().includes(normalized)
    );
    return partial || null;
}

function mapRow(raw: Record<string, string>): Partial<DeliveredDealItem> {
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

export function DeliveredDealsImport({ moduleId, organisationId, onComplete }: DeliveredDealsImportProps) {
    const firestore = useFirestore();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<'select' | 'preview' | 'importing' | 'done'>('select');
    const [fileName, setFileName] = useState('');
    const [rows, setRows] = useState<Record<string, string>[]>([]);
    const [mappedRows, setMappedRows] = useState<Partial<DeliveredDealItem>[]>([]);
    const [importing, setImporting] = useState(false);
    const [importedCount, setImportedCount] = useState(0);
    const [catalogModels, setCatalogModels] = useState<CatalogModel[]>([]);
    const [modelMatches, setModelMatches] = useState<Map<number, CatalogModel | null>>(new Map());
    const catalogFetchedRef = useRef(false);

    const fetchCatalogModels = useCallback(async () => {
        if (catalogFetchedRef.current) return;
        catalogFetchedRef.current = true;
        try {
            const modelsSnap = await getDocs(collectionGroup(firestore, 'models'));
            const models = modelsSnap.docs.map(d => ({
                id: d.id,
                name: d.data().name || '',
                modelCode: d.data().modelCode || '',
                rangeId: d.ref.path.split('/')[3] || '',
            }));
            setCatalogModels(models);
            return models;
        } catch (err) {
            console.error('Failed to fetch catalog models:', err);
            return [];
        }
    }, [firestore]);

    const matchModels = useCallback((mapped: Partial<DeliveredDealItem>[], models: CatalogModel[]) => {
        const matches = new Map<number, CatalogModel | null>();
        mapped.forEach((row, index) => {
            matches.set(index, findBestModelMatch(row.model || '', models));
        });
        setModelMatches(matches);
    }, []);

    const resetState = useCallback(() => {
        setStep('select');
        setFileName('');
        setRows([]);
        setMappedRows([]);
        setImporting(false);
        setImportedCount(0);
        setModelMatches(new Map());
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
            const mapped = parsed.map(mapRow);
            setMappedRows(mapped);

            // Fetch catalog models and run matching
            const models = catalogModels.length > 0 ? catalogModels : (await fetchCatalogModels()) || [];
            if (models.length > 0) {
                matchModels(mapped, models);
            }

            setStep('preview');
        } catch (err) {
            console.error('Failed to parse file:', err);
            toast({ title: 'Parse Error', description: 'Could not parse the uploaded file.', variant: 'destructive' });
        }
    }, [catalogModels, fetchCatalogModels, matchModels]);

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
            // Fetch existing items for duplicate checking
            const existingSnap = await getDocs(query(
                collection(firestore, 'delivered-deals'),
                where('moduleId', '==', moduleId),
                where('organisationId', '==', organisationId)
            ));
            const existingFingerprints = new Set<string>();
            existingSnap.docs.forEach(d => {
                const data = d.data();
                if (data.stockNumber) existingFingerprints.add(`sn:${data.stockNumber.toLowerCase()}`);
                if (data.serialNumber) existingFingerprints.add(`sr:${data.serialNumber.toLowerCase()}`);
                const combo = `${(data.model||'').toLowerCase()}|${(data.colour||'').toLowerCase()}|${(data.label||'').toLowerCase()}`;
                if (data.model) existingFingerprints.add(`mc:${combo}`);
            });

            let skipped = 0;
            for (let i = 0; i < mappedRows.length; i++) {
                const item = mappedRows[i];
                const match = modelMatches.get(i) || null;

                // Skip duplicates — check stockNumber, serialNumber, or model+colour+label
                const sn = (item.stockNumber || '').toLowerCase();
                const sr = (item.serialNumber || '').toLowerCase();
                const combo = `${(item.model||'').toLowerCase()}|${(item.colour||'').toLowerCase()}|${(item.label||'').toLowerCase()}`;

                if ((sn && existingFingerprints.has(`sn:${sn}`)) ||
                    (sr && existingFingerprints.has(`sr:${sr}`)) ||
                    (item.model && existingFingerprints.has(`mc:${combo}`))) {
                    skipped++;
                    continue;
                }

                let deliveryDate = null;
                if (item.deliveryDate) {
                    const d = new Date(item.deliveryDate);
                    if (!isNaN(d.getTime())) {
                        deliveryDate = Timestamp.fromDate(d);
                    }
                }

                await addDoc(collection(firestore, 'delivered-deals'), {
                    name: item.name || item.model || 'Imported Deal',
                    stockNumber: item.stockNumber || '',
                    status: item.status || 'Delivered',
                    location: item.location || '',
                    soldBy: item.soldBy || '',
                    model: item.model || '',
                    colour: item.colour || '',
                    serialNumber: item.serialNumber || '',
                    material: item.material || '',
                    customerNotes: item.customerNotes || '',
                    poOrDealNumber: item.poOrDealNumber || '',
                    deliveryDate: deliveryDate,
                    motor: item.motor || '',
                    motorSerialNumber: item.motorSerialNumber || '',
                    trailer: item.trailer || '',
                    label: item.label || '',
                    consignmentWith: item.consignmentWith || '',
                    invoiced: false,
                    depositPaid: false,
                    paidInFull: false,
                    isHullOnly: false,
                    warrantyRegistered: false,
                    invoicedAmount: parseFloat(item.invoicedAmount || '0') || 0,
                    modelId: match?.id || null,
                    rangeId: match?.rangeId || null,
                    moduleId,
                    organisationId,
                    createdAt: serverTimestamp(),
                });
                count++;
            }

            setImportedCount(count);
            setStep('done');
            toast({ title: 'Import Complete', description: `Imported ${count} deals${skipped > 0 ? `, skipped ${skipped} duplicates` : ''}.` });
            onComplete?.();
        } catch (err) {
            console.error('Import failed:', err);
            toast({ title: 'Import Failed', description: 'An error occurred during import. Some items may have been imported.', variant: 'destructive' });
            setImporting(false);
            setStep('preview');
        }
    }, [firestore, mappedRows, modelMatches, moduleId, organisationId, onComplete]);

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
                            Import Delivered Deals
                        </DialogTitle>
                        <DialogDescription className="text-[10px] font-black uppercase tracking-widest text-primary">
                            {step === 'select' && 'Upload a CSV or Excel file'}
                            {step === 'preview' && 'Review data before importing'}
                            {step === 'importing' && 'Importing deals...'}
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
                                                    {modelMatches.size > 0 && (
                                                        <th className="px-3 py-2 text-left font-bold uppercase tracking-wider text-[10px]">
                                                            Matched Model
                                                        </th>
                                                    )}
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
                                                        {modelMatches.size > 0 && (
                                                            <td className="px-3 py-2">
                                                                {modelMatches.get(i) ? (
                                                                    <span className="inline-flex items-center gap-1 text-green-700">
                                                                        <Check className="h-3 w-3" />
                                                                        {modelMatches.get(i)!.name || modelMatches.get(i)!.modelCode}
                                                                    </span>
                                                                ) : (
                                                                    <Badge variant="outline" className="text-yellow-600 border-yellow-300 bg-yellow-50 text-[9px]">
                                                                        <AlertCircle className="h-3 w-3 mr-1" />
                                                                        No match
                                                                    </Badge>
                                                                )}
                                                            </td>
                                                        )}
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
                                <p className="text-sm font-medium">Importing delivered deals...</p>
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
                                    Successfully imported {importedCount} deals
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
                                    Import {rows.length} Deals
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

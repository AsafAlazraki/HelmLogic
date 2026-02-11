'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx';
import { useFirestore } from '@/firebase/provider';
import { collection, writeBatch, query, getDocs, doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, FileUp, Save } from 'lucide-react';

function DataUploader({ title, onDataParsed, disabled }: { title: string, onDataParsed: (data: any[]) => void, disabled: boolean }) {
    const [file, setFile] = useState<File | null>(null);
    const [isParsing, setIsParsing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0] || null;
        setFile(selectedFile);
        if (selectedFile) {
            handleParseData(selectedFile);
        } else {
            onDataParsed([]);
        }
    };

    const handleParseData = (fileToParse: File) => {
        setIsParsing(true);
        setError(null);
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = event.target?.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet);
                onDataParsed(json);
                toast({ title: 'Parsing Complete', description: `${fileToParse.name} has been parsed.` });
            } catch (e: any) {
                setError(e.message || 'An unexpected error occurred.');
                toast({ variant: 'destructive', title: 'Parsing Failed', description: e.message });
                onDataParsed([]);
            } finally {
                setIsParsing(false);
            }
        };
        reader.onerror = () => {
            setError('Failed to read file.');
            toast({ variant: 'destructive', title: 'File Read Error', description: 'Could not read the selected file.' });
            setIsParsing(false);
        };
        reader.readAsBinaryString(fileToParse);
    };

    return (
        <Card className="bg-muted/50">
            <CardHeader>
                <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-2">
                    <Label htmlFor={`document-file-${title.replace(/\s+/g, '-')}`}>Data File</Label>
                    <div className="flex items-center gap-2 p-4 border-2 border-dashed rounded-lg bg-background">
                        <FileUp className="h-6 w-6 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground flex-1">
                            {file ? `Selected: ${file.name}` : 'Select a file...'}
                        </span>
                        <Button asChild variant="outline">
                            <Label htmlFor={`document-file-${title.replace(/\s+/g, '-')}`} className="cursor-pointer">
                                Choose File
                            </Label>
                        </Button>
                        <Input id={`document-file-${title.replace(/\s+/g, '-')}`} type="file" onChange={handleFileChange} className="hidden" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" disabled={disabled || isParsing} />
                    </div>
                </div>
                {isParsing && <Loader2 className="h-5 w-5 animate-spin mt-2" />}
                {error && <p className="text-destructive text-sm mt-2">{error}</p>}
            </CardContent>
        </Card>
    );
}

export function SamAllenUploader({ vendorId }: { vendorId: string }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [masterPriceListData, setMasterPriceListData] = useState<any[] | null>(null);
    const [bulkMasterPriceListData, setBulkMasterPriceListData] = useState<any[] | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const saveDataSet = async (collectionName: string, data: any[]) => {
        const subcollectionRef = collection(firestore, `data-warehouse/${vendorId}/${collectionName}`);
        
        // Clear existing data
        const oldDocsSnapshot = await getDocs(query(subcollectionRef));
        if (!oldDocsSnapshot.empty) {
            const deleteBatch = writeBatch(firestore);
            oldDocsSnapshot.docs.forEach(doc => deleteBatch.delete(doc.ref));
            await deleteBatch.commit();
        }

        // Write new data
        const writeBatchInstance = writeBatch(firestore);
        data.forEach(row => {
            const newRowRef = doc(subcollectionRef);
            writeBatchInstance.set(newRowRef, row);
        });
        await writeBatchInstance.commit();
    };

    const handleSaveAll = async () => {
        if (!masterPriceListData && !bulkMasterPriceListData) {
            toast({ variant: 'destructive', title: 'No data to save', description: 'Please upload and parse at least one document.' });
            return;
        }
        setIsSaving(true);
        try {
            if (masterPriceListData && masterPriceListData.length > 0) {
                await saveDataSet('masterPriceList', masterPriceListData);
            }
            if (bulkMasterPriceListData && bulkMasterPriceListData.length > 0) {
                await saveDataSet('bulkMasterPriceList', bulkMasterPriceListData);
            }
            toast({ title: 'Success', description: 'Data sets have been updated.' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Save Failed', description: e.message || 'An unexpected error occurred.' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Sam Allen Data Upload</CardTitle>
                <CardDescription>Upload the master and bulk price lists. Both will be saved when you click the save button.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <DataUploader title="Master Price List" onDataParsed={setMasterPriceListData} disabled={isSaving} />
                <DataUploader title="Bulk Master Price List" onDataParsed={setBulkMasterPriceListData} disabled={isSaving} />
            </CardContent>
            <CardFooter>
                <Button onClick={handleSaveAll} disabled={isSaving || (!masterPriceListData && !bulkMasterPriceListData)}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save Data Sets
                </Button>
            </CardFooter>
        </Card>
    );
}

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
import { Loader2, FileUp, Save, Trash2 } from 'lucide-react';

function DataUploader({ title, vendorId, collectionName }: { title: string, vendorId: string, collectionName: string }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [file, setFile] = useState<File | null>(null);
    const [isParsing, setIsParsing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [parsedData, setParsedData] = useState<any[] | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isClearing, setIsClearing] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0] || null;
        setFile(selectedFile);
        setParsedData(null); // Reset parsed data when file changes
        if (selectedFile) {
            handleParseData(selectedFile);
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
                setParsedData(json);
                toast({ title: 'Parsing Complete', description: `${fileToParse.name} has been parsed.` });
            } catch (e: any) {
                setError(e.message || 'An unexpected error occurred.');
                toast({ variant: 'destructive', title: 'Parsing Failed', description: e.message });
                setParsedData(null);
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

    const handleSave = async () => {
        if (!parsedData) {
            toast({ variant: 'destructive', title: 'No data to save', description: 'Please upload and parse a document.' });
            return;
        }
        setIsSaving(true);
        try {
            const subcollectionRef = collection(firestore, `data-warehouse/${vendorId}/${collectionName}`);
            
            // Batch delete old documents
            const oldDocsSnapshot = await getDocs(query(subcollectionRef));
            if (!oldDocsSnapshot.empty) {
                const deleteBatchSize = 500;
                for (let i = 0; i < oldDocsSnapshot.docs.length; i += deleteBatchSize) {
                    const chunk = oldDocsSnapshot.docs.slice(i, i + deleteBatchSize);
                    const deleteBatch = writeBatch(firestore);
                    chunk.forEach(doc => deleteBatch.delete(doc.ref));
                    await deleteBatch.commit();
                }
            }

            // Batch write new documents
            const writeBatchSize = 500;
            for (let i = 0; i < parsedData.length; i += writeBatchSize) {
                const chunk = parsedData.slice(i, i + writeBatchSize);
                const writeBatchInstance = writeBatch(firestore);
                chunk.forEach(row => {
                    const newRowRef = doc(subcollectionRef);
                    writeBatchInstance.set(newRowRef, row);
                });
                await writeBatchInstance.commit();
            }

            toast({ title: 'Success', description: `${title} has been updated.` });
            setFile(null);
            setParsedData(null);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Save Failed', description: e.message || 'An unexpected error occurred.' });
            console.error(e);
        } finally {
            setIsSaving(false);
        }
    };

    const handleClear = async () => {
        setIsClearing(true);
        try {
            const subcollectionRef = collection(firestore, `data-warehouse/${vendorId}/${collectionName}`);
            
            const oldDocsSnapshot = await getDocs(query(subcollectionRef));
            if (!oldDocsSnapshot.empty) {
                const deleteBatchSize = 500;
                for (let i = 0; i < oldDocsSnapshot.docs.length; i += deleteBatchSize) {
                    const chunk = oldDocsSnapshot.docs.slice(i, i + deleteBatchSize);
                    const deleteBatch = writeBatch(firestore);
                    chunk.forEach(doc => deleteBatch.delete(doc.ref));
                    await deleteBatch.commit();
                }
            }
            toast({ title: 'Success', description: `${title} has been cleared.` });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Clear Failed', description: e.message || 'An unexpected error occurred.' });
            console.error(e);
        } finally {
            setIsClearing(false);
        }
    };

    return (
        <Card className="bg-muted/50 flex flex-col">
            <CardHeader>
                <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent className="flex-grow">
                <div className="space-y-2">
                    <Label htmlFor={`document-file-${collectionName}`}>Data File</Label>
                    <div className="flex items-center gap-2 p-4 border-2 border-dashed rounded-lg bg-background">
                        <FileUp className="h-6 w-6 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground flex-1">
                            {file ? `Selected: ${file.name}` : 'Select a file...'}
                        </span>
                        <Button asChild variant="outline">
                            <Label htmlFor={`document-file-${collectionName}`} className="cursor-pointer">
                                Choose File
                            </Label>
                        </Button>
                        <Input id={`document-file-${collectionName}`} type="file" onChange={handleFileChange} className="hidden" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" disabled={isSaving || isParsing || isClearing} />
                    </div>
                </div>
                {isParsing && <Loader2 className="h-5 w-5 animate-spin mt-2" />}
                {error && <p className="text-destructive text-sm mt-2">{error}</p>}
            </CardContent>
            <CardFooter className="gap-2">
                 <Button onClick={handleSave} disabled={isSaving || !parsedData || isClearing}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save {title}
                </Button>
                <Button onClick={handleClear} disabled={isClearing || isSaving} variant="destructive">
                    {isClearing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                    Clear
                </Button>
            </CardFooter>
        </Card>
    );
}

export function SamAllenUploader({ vendorId }: { vendorId: string }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Sam Allen Data Upload</CardTitle>
                <CardDescription>Upload and save each price list individually. Each save action will overwrite the existing data for that list.</CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
                <DataUploader 
                    title="Master Price List" 
                    vendorId={vendorId} 
                    collectionName="masterPriceList" 
                />
                <DataUploader 
                    title="Bulk Master Price List" 
                    vendorId={vendorId} 
                    collectionName="bulkMasterPriceList"
                />
            </CardContent>
        </Card>
    );
}

'use client';

import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';
import Link from 'next/link';
import * as XLSX from 'xlsx';

import { BreadcrumbNav, type BreadcrumbPart } from '@/components/breadcrumb-nav';
import { useFirestore, useStorage, useMemoFirebase, useCollection, useDoc } from '@/firebase';
import { uploadFileToStorage } from '@/firebase/storage';
import { doc, updateDoc, deleteDoc, query, collection, where, getDocs, writeBatch, setDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Loader2, Trash2, Save, X, TestTube2, Code, Eye, UploadCloud, FileUp, Replace, Search, List, LayoutGrid, ImageIcon, Globe, Table as TableIcon, ChevronRight } from 'lucide-react';
import AdminGuard from '@/components/admin-guard';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { createSlug, cn } from '@/lib/utils';
import { HighfieldDataStructure } from '@/components/highfield-data-structure';
import { JeanneauDataStructure } from '@/components/jeanneau-data-structure';
import { StacerDataStructure } from '@/components/stacer-data-structure';
import { StabicraftDataStructure } from '@/components/stabicraft-data-structure';
import { SurteesDataStructure } from '@/components/surtees-data-structure';
import { SamAllenUploader } from '@/components/sam-allen-uploader';
import { SamAllenDataViewer } from '@/components/sam-allen-data-viewer';
import { proxyFetch } from '@/actions/proxy-fetch';
import { JsonDataVisualizer } from '@/components/json-data-visualizer';
import { YamahaApiFetcher } from '@/components/yamaha-api-fetcher';
import { analyzeJson } from '@/ai/flows/analyze-json-flow';
import { SUPPORTED_CURRENCIES } from '@/lib/currency-utils';
import { ScrollArea } from '@/components/ui/scroll-area';

const formSchema = z.object({
  id: z.string(),
  name: z.string().min(1, { message: 'Vendor name is required.' }),
  slug: z.string().nullable().optional(),
  vendorType: z.string().min(1, { message: 'Vendor type is required.' }),
  dataSource: z.string().min(1, { message: 'Data source is required.' }),
  currency: z.string().default('AUD'),
  address: z.string().nullable().optional(),
  abn: z.string().nullable().optional(),
  logo: z.any().optional(),
  primaryContact: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  logoUrl: z.string().nullable().optional(),
});

type VendorFormData = z.infer<typeof formSchema>;

function DocumentExtractor({ vendor }: { vendor: VendorFormData }) {
    const firestore = useFirestore();
    const { toast } = useToast();

    const [file, setFile] = useState<File | null>(null);
    const [parsedData, setParsedData] = useState<any[] | null>(null);
    const [columns, setColumns] = useState<{key: string, label: string}[] | undefined>(undefined);
    const [isParsing, setIsParsing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dataSetName, setDataSetName] = useState('');

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0] || null;
        setFile(selectedFile);
        setParsedData(null);
        setColumns(undefined);
        setError(null);
        if (selectedFile) {
            setDataSetName(selectedFile.name.replace(/\.[^/.]+$/, ""));
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

                if (json.length > 0) {
                    const firstRow = json[0] as Record<string, any>;
                    const suggestedColumns = Object.keys(firstRow).map(key => ({
                        key,
                        label: key,
                    }));
                    setColumns(suggestedColumns);
                }

                setParsedData(json);
                toast({ title: 'Parsing Complete', description: 'The document has been parsed.' });
            } catch (e: any) {
                setError(e.message || 'An unexpected error occurred during parsing.');
                toast({ variant: 'destructive', title: 'Parsing Failed', description: e.message });
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
    
    const handleSaveToMaster = async () => {
        if (!parsedData || !vendor || !dataSetName.trim()) {
            toast({ variant: 'destructive', title: 'Error', description: 'No data to save. Please parse a document and provide a name.' });
            return;
        }
        setIsSaving(true);

        try {
            const dataSetsRef = collection(firestore, `data-warehouse/${vendor.id}/dataSets`);
            const dataSetDocRef = doc(dataSetsRef);
            
            await setDoc(dataSetDocRef, {
                id: dataSetDocRef.id,
                name: dataSetName,
                rowCount: parsedData.length,
                uploadedAt: serverTimestamp(),
            });

            const rowsCollectionRef = collection(firestore, `data-warehouse/${vendor.id}/dataSets/${dataSetDocRef.id}/rows`);
            const writeBatchSize = 500;
            for (let i = 0; i < parsedData.length; i += writeBatchSize) {
                const chunk = parsedData.slice(i, i + writeBatchSize);
                const writeBatchInstance = writeBatch(firestore);
                chunk.forEach(row => {
                    const newRowRef = doc(rowsCollectionRef);
                    writeBatchInstance.set(newRowRef, { ...row, id: newRowRef.id });
                });
                await writeBatchInstance.commit();
            }
            
            toast({ title: 'Success', description: `Table "${dataSetName}" has been created with ${parsedData.length} rows.` });
            setFile(null);
            setParsedData(null);
            setDataSetName('');
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Save Failed', description: e.message || 'An unexpected error occurred.' });
            console.error("Save failed:", e);
        } finally {
            setIsSaving(false);
        }
    };
    
    return (
        <Card className="max-w-full overflow-hidden min-w-0">
            <CardHeader>
                <CardTitle>Document Data Extractor</CardTitle>
                <CardDescription>Upload a file to create a new data table for this vendor.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 max-w-full overflow-hidden min-w-0">
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="document-file">1. Select Data File</Label>
                        <div className="flex items-center gap-2 p-4 border-2 border-dashed rounded-lg bg-muted/30">
                            <FileUp className="h-6 w-6 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground flex-1">
                                {file ? `Selected: ${file.name}` : 'Choose a CSV or Excel file...'}
                            </span>
                            <Button asChild variant="outline">
                                <Label htmlFor="document-file" className="cursor-pointer">
                                    Choose File
                                </Label>
                            </Button>
                            <Input id="document-file" type="file" onChange={handleFileChange} className="hidden" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" disabled={isSaving || isParsing} />
                        </div>
                    </div>

                    {file && (
                        <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                            <Label htmlFor="dataset-name">2. Table Name</Label>
                            <Input 
                                id="dataset-name" 
                                placeholder="e.g. Parts List 2024" 
                                value={dataSetName} 
                                onChange={(e) => setDataSetName(e.target.value)}
                                disabled={isSaving}
                            />
                            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">This name will be used to identify this specific data table.</p>
                        </div>
                    )}
                </div>
                
                {isParsing && (
                    <div className="flex items-center justify-center rounded-md border border-dashed p-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="ml-4 text-muted-foreground">Parsing document...</p>
                    </div>
                )}
                {error && <p className="text-destructive text-sm">{error}</p>}

                {parsedData && (
                     <Card className="border-primary/20 overflow-hidden max-w-full min-w-0">
                        <CardHeader className="py-3 px-4 border-b bg-primary/5">
                            <CardTitle className="text-sm font-bold uppercase tracking-tighter">Preview: {dataSetName}</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0 overflow-hidden max-w-full min-w-0">
                             <div className="w-full min-w-0 overflow-auto max-h-[400px]">
                                <JsonDataVisualizer data={parsedData} columns={columns} />
                             </div>
                        </CardContent>
                        <CardFooter className="py-3 px-4 border-t bg-muted/30">
                            <Button onClick={handleSaveToMaster} disabled={isSaving || !dataSetName.trim()} className="w-full">
                                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                Save as New Table
                            </Button>
                        </CardFooter>
                    </Card>
                )}
            </CardContent>
        </Card>
    );
}

function MultiDataSetViewer({ vendor }: { vendor: VendorFormData }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    
    const dataSetsQuery = useMemoFirebase(() => {
        if (!vendor.id) return null;
        return query(collection(firestore, 'data-warehouse', vendor.id, 'dataSets'), orderBy('uploadedAt', 'desc'));
    }, [firestore, vendor.id]);
    const { data: dataSets, loading: setsLoading } = useCollection<any>(dataSetsQuery);

    const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const rowsQuery = useMemoFirebase(() => {
        if (!vendor.id || !selectedSetId) return null;
        return collection(firestore, 'data-warehouse', vendor.id, 'dataSets', selectedSetId, 'rows');
    }, [firestore, vendor.id, selectedSetId]);
    const { data: rows, loading: rowsLoading } = useCollection<any>(rowsQuery);

    const selectedSet = useMemo(() => dataSets?.find(s => s.id === selectedSetId), [dataSets, selectedSetId]);

    const handleDeleteSet = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm("Are you sure you want to delete this table? All rows will be lost.")) return;
        
        setIsDeleting(true);
        try {
            const rowsSnap = await getDocs(collection(firestore, `data-warehouse/${vendor.id}/dataSets/${id}/rows`));
            const batch = writeBatch(firestore);
            rowsSnap.forEach(d => batch.delete(d.ref));
            batch.delete(doc(firestore, `data-warehouse/${vendor.id}/dataSets`, id));
            await batch.commit();
            toast({ title: "Table deleted" });
            if (selectedSetId === id) setSelectedSetId(null);
        } catch (error) {
            toast({ variant: 'destructive', title: "Delete failed" });
        } finally {
            setIsDeleting(false);
        }
    };

    if (setsLoading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

    if (!dataSets || dataSets.length === 0) {
        return (
            <Card className="border-dashed h-64 flex flex-col items-center justify-center text-center p-6">
                <TableIcon className="h-12 w-12 text-muted-foreground opacity-20 mb-4" />
                <CardTitle>No Data Tables Found</CardTitle>
                <CardDescription>Upload files in the 'Data Connection' tab to populate this list.</CardDescription>
            </Card>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 min-w-0 max-w-full overflow-hidden">
            <Card className="md:col-span-1 border-r h-fit min-w-0">
                <CardHeader className="py-4 border-b">
                    <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Available Tables</CardTitle>
                </CardHeader>
                <ScrollArea className="h-[500px]">
                    <div className="p-2 space-y-1">
                        {dataSets.map(set => (
                            <div 
                                key={set.id}
                                onClick={() => setSelectedSetId(set.id)}
                                className={cn(
                                    "flex items-center justify-between p-3 rounded-md cursor-pointer transition-all group",
                                    selectedSetId === set.id ? "bg-primary text-primary-foreground shadow-md" : "hover:bg-muted"
                                )}
                            >
                                <div className="min-w-0">
                                    <p className="text-sm font-bold truncate">{set.name}</p>
                                    <p className={cn("text-[10px] uppercase font-black", selectedSetId === set.id ? "text-primary-foreground/70" : "text-muted-foreground")}>
                                        {set.rowCount} Rows
                                    </p>
                                </div>
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className={cn("h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity", selectedSetId === set.id ? "text-primary-foreground hover:bg-white/20" : "text-destructive")}
                                    onClick={(e) => handleDeleteSet(set.id, e)}
                                    disabled={isDeleting}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </Card>

            <Card className="md:col-span-3 min-h-[500px] flex flex-col min-w-0 overflow-hidden max-w-full">
                {selectedSetId ? (
                    <>
                        <CardHeader className="py-4 border-b bg-muted/30 flex flex-row items-center justify-between shrink-0">
                            <div className="min-w-0">
                                <CardTitle className="text-lg truncate">{selectedSet?.name}</CardTitle>
                                <CardDescription>Viewing {selectedSet?.rowCount} records</CardDescription>
                            </div>
                            <Button variant="outline" size="sm" asChild className="shrink-0">
                                <Link href={`/vendor-data/${vendor.slug || vendor.id}?set=${selectedSetId}`}>
                                    Open Full View
                                    <ChevronRight className="ml-2 h-4 w-4" />
                                </Link>
                            </Button>
                        </CardHeader>
                        <CardContent className="p-0 flex-grow relative overflow-hidden min-w-0 max-w-full flex flex-col">
                            {rowsLoading ? (
                                <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-20">
                                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                </div>
                            ) : (
                                <div className="flex-1 min-w-0 overflow-auto">
                                    <JsonDataVisualizer data={rows} />
                                </div>
                            )}
                        </CardContent>
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center p-12 text-muted-foreground">
                        <TableIcon className="h-16 w-16 mb-4 opacity-10" />
                        <p className="text-sm font-medium">Select a table from the sidebar to visualize its data.</p>
                    </div>
                )}
            </Card>
        </div>
    );
}

function HighfieldPoc({ vendorId }: { vendorId: string }) {
    const [url, setUrl] = useState('');
    const [jsonData, setJsonData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [instructions, setInstructions] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<any>(null);
    const { toast } = useToast();

    const handleFetchData = async () => {
        if (!url) {
            toast({ variant: 'destructive', title: "Error", description: "Please enter a URL." });
            return;
        }
        setIsLoading(true);
        setJsonData(null);
        setAnalysisResult(null);
        try {
            const result = await proxyFetch(url);
            if (result.success) {
                if (typeof result.data === 'string') {
                    try {
                        setJsonData(JSON.parse(result.data));
                    } catch (e) {
                        setJsonData(result.data);
                    }
                } else {
                    setJsonData(result.data);
                }
                toast({ title: 'Success', description: 'JSON data returned successfully.' });
            } else {
                toast({ variant: 'destructive', title: 'Fetch Failed', description: result.error });
            }
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally {
            setIsLoading(false);
        }
    };

    const handleAnalyze = async () => {
        if (!jsonData) return;
        setIsAnalyzing(true);
        try {
            const result = await analyzeJson({
                jsonString: typeof jsonData === 'string' ? jsonData : JSON.stringify(jsonData, null, 2),
                instructions
            });
            setAnalysisResult(result);
            toast({ title: 'Analysis Complete' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'AI Analysis Failed', description: e.message });
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleCopy = () => {
        if (!jsonData) return;
        navigator.clipboard.writeText(JSON.stringify(jsonData, null, 2));
        toast({ title: "Copied to clipboard" });
    };

    return (
        <div className="space-y-6 max-w-full overflow-hidden min-w-0">
            <Card className="min-w-0 max-w-full">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Highfield POC - API Data Explorer</CardTitle>
                            <CardDescription>Fetch live JSON data and optionally transform it using AI.</CardDescription>
                        </div>
                        {jsonData && (
                            <Button variant="outline" size="sm" onClick={handleCopy}>
                                <Replace className="h-4 w-4 mr-2" />
                                Copy JSON
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-4 max-w-full overflow-hidden min-w-0">
                    <div className="flex items-center gap-2">
                        <Input
                            placeholder="https://api.highfield.com/v1/models"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            disabled={isLoading}
                        />
                        <Button onClick={handleFetchData} disabled={isLoading}>
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                            <span className="ml-2">Fetch JSON</span>
                        </Button>
                    </div>

                    {jsonData && (
                        <Tabs defaultValue="visualize" className="pt-4 border-t max-w-full overflow-hidden min-w-0">
                            <TabsList className="grid w-full grid-cols-3 max-w-[400px]">
                                <TabsTrigger value="visualize"><Eye className="h-4 w-4 mr-2" />Visualize</TabsTrigger>
                                <TabsTrigger value="ai"><Code className="h-4 w-4 mr-2" />AI Transform</TabsTrigger>
                                <TabsTrigger value="raw"><List className="h-4 w-4 mr-2" />Raw JSON</TabsTrigger>
                            </TabsList>
                            
                            <TabsContent value="visualize" className="mt-4 overflow-hidden max-w-full min-w-0 flex flex-col">
                                <div className="max-h-[600px] overflow-auto rounded-md border bg-card w-full min-w-0">
                                    <JsonDataVisualizer data={jsonData} />
                                </div>
                            </TabsContent>

                            <TabsContent value="ai" className="mt-4 space-y-4">
                                <div className="p-4 rounded-lg bg-muted/30 border border-dashed">
                                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Transformation Instructions</Label>
                                    <Textarea 
                                        placeholder="e.g. 'Extract all models into a simple array of {name, price}'..." 
                                        className="mt-2 bg-background min-h-[100px]"
                                        value={instructions}
                                        onChange={(e) => setInstructions(e.target.value)}
                                    />
                                    <Button className="mt-4 w-full" onClick={handleAnalyze} disabled={isAnalyzing || !instructions.trim()}>
                                        {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <TestTube2 className="h-4 w-4 mr-2" />}
                                        Run AI Transformation
                                    </Button>
                                </div>

                                {analysisResult && (
                                    <Card className="border-primary/20 bg-primary/5 overflow-hidden max-w-full min-w-0">
                                        <CardHeader className="py-3 px-4 border-b">
                                            <CardTitle className="text-sm font-bold uppercase tracking-tighter">AI Result: {analysisResult.summary}</CardTitle>
                                        </CardHeader>
                                        <CardContent className="p-0 overflow-hidden min-w-0">
                                            <div className="max-h-[400px] overflow-auto w-full">
                                                <JsonDataVisualizer data={analysisResult.restructuredData} />
                                            </div>
                                        </CardContent>
                                    </Card>
                                )}
                            </TabsContent>

                            <TabsContent value="raw" className="mt-4">
                                <pre className="max-h-[600px] overflow-auto rounded-md bg-secondary p-4 text-xs font-mono">
                                    <code>{JSON.stringify(jsonData, null, 2)}</code>
                                </pre>
                            </TabsContent>
                        </Tabs>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function ApiDataFetcher() {
    const [url, setUrl] = useState('');
    const [jsonData, setJsonData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();

    const handleFetchData = async () => {
        if (!url) {
            setError("Please enter a URL.");
            return;
        }
        setIsLoading(true);
        setError(null);
        setJsonData(null);
        try {
            const result = await proxyFetch(url);

            if (result.success) {
                if (typeof result.data === 'string') {
                    try {
                        const parsed = JSON.parse(result.data);
                        setJsonData(parsed);
                    } catch (e) {
                        setJsonData(result.data);
                    }
                } else {
                    setJsonData(result.data);
                }
            } else {
                const errorMessage = result.error || "An unknown error occurred.";
                setError(errorMessage);
                toast({ variant: 'destructive', title: 'Fetch Failed', description: errorMessage });
            }
        } catch (e: any) {
            const errorMessage = e.message || 'An unexpected error occurred.';
            setError(errorMessage);
            toast({ variant: 'destructive', title: 'Fetch Failed', description: errorMessage });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card className="max-w-full overflow-hidden min-w-0">
            <CardHeader>
                <CardTitle>API Data Fetcher</CardTitle>
                <CardDescription>Enter an API endpoint to fetch and view JSON data.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-w-full overflow-hidden min-w-0">
                <div className="flex items-center gap-2">
                    <Input
                        placeholder="https://api.example.com/data"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        disabled={isLoading}
                    />
                    <Button onClick={handleFetchData} disabled={isLoading}>
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube2 className="h-4 w-4" />}
                        <span className="ml-2 hidden sm:inline">Fetch Data</span>
                    </Button>
                </div>
                {isLoading && (
                    <div className="flex items-center justify-center rounded-md border border-dashed p-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                )}
                {error && (
                    <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
                        <p className="font-bold">Error:</p>
                        <p>{error}</p>
                    </div>
                )}
                {jsonData && (
                    <Tabs defaultValue="json" className="pt-4 max-w-full overflow-hidden min-w-0">
                        <TabsList>
                            <TabsTrigger value="json"><Code className="h-4 w-4 mr-2" />JSON Response</TabsTrigger>
                            <TabsTrigger value="visualize"><Eye className="h-4 w-4 mr-2" />Visualize Data</TabsTrigger>
                        </TabsList>
                        <TabsContent value="json">
                            <pre className="mt-2 max-h-[600px] overflow-auto rounded-md bg-secondary p-4 text-sm">
                                <code>{JSON.stringify(jsonData, null, 2)}</code>
                            </pre>
                        </TabsContent>
                        <TabsContent value="visualize" className="overflow-hidden max-w-full min-w-0 flex flex-col">
                           <div className="max-h-[600px] w-full overflow-auto rounded-md border min-w-0">
                             <JsonDataVisualizer data={jsonData} />
                           </div>
                        </TabsContent>
                    </Tabs>
                )}
            </CardContent>
        </Card>
    );
}

function MasterDataSetViewer({ vendor }: { vendor: VendorFormData }) {
    const firestore = useFirestore();
    const masterDataSetQuery = useMemoFirebase(() => {
        if (!vendor.id) return null;
        return collection(firestore, 'data-warehouse', vendor.id, 'masterDataSet');
    }, [firestore, vendor.id]);
    const { data: masterDataSet, loading: masterDataLoading } = useCollection(masterDataSetQuery);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
    const [selectedItem, setSelectedItem] = useState<any | null>(null);
    const [isEditorOpen, setIsEditorOpen] = useState(false);

    const [displayConfig, setDisplayConfig] = useState<{
        titleKey: string | null;
        infoKeys: string[];
        columnConfig: { key: string; label: string }[] | undefined;
        imageUrlKey?: string | null;
        colorsKey?: string | null;
    }>({
        titleKey: null,
        infoKeys: [],
        columnConfig: undefined,
        imageUrlKey: null,
        colorsKey: null,
    });

    useEffect(() => {
        if (masterDataSet && masterDataSet.length > 0) {
            const firstItem = masterDataSet[0];
            const allKeys = Object.keys(firstItem);
            
            if (vendor.slug === 'yamaha') {
                const normalize = (s: string) => String(s || '').toLowerCase().replace(/[\s_-]/g, '');

                const findKey = (potentials: string[]) => {
                    const normalizedPotentials = potentials.map(normalize);
                    for (const key of allKeys) {
                        if (normalizedPotentials.includes(normalize(key))) {
                            return key;
                        }
                    }
                    return undefined;
                };

                const modelNameKey = findKey(['Model Name', 'ModelName', 'name']);
                const productGroupKey = findKey(['Product Group', 'ProductGroup']);
                const subCategoryKey = findKey(['Sub Catagory', 'SubCategory', 'category']);
                const imageUrlKey = 'SummaryImage';
                const colorsKey = findKey(['colors', 'available_colors', 'availableColors', 'Colours']);

                const titleKey = modelNameKey || null;
                const infoKeys = [productGroupKey, subCategoryKey].filter(Boolean) as string[];
                
                setDisplayConfig({ 
                    titleKey, 
                    infoKeys, 
                    columnConfig: undefined, // Let visualizer use raw order
                    imageUrlKey: imageUrlKey, 
                    colorsKey: colorsKey ?? null 
                });
            } else {
                const findKey = (potentials: string[]) => allKeys.find(k => potentials.includes(k.toLowerCase()));
                const titleKey = findKey(['name', 'productName', 'modelName', 'title', 'item', 'description', 'part_description']) || allKeys.filter(k=>k!=='id')[0];
                const infoKeys = allKeys.filter(k => 
                    k.toLowerCase() !== titleKey?.toLowerCase() && 
                    ['part_number', 'sku', 'model', 'price', 'cost', 'rrp', 'sellpriceexclgst'].includes(k.toLowerCase())
                ).slice(0, 3);

                setDisplayConfig({ titleKey, infoKeys, columnConfig: undefined, imageUrlKey: null, colorsKey: null });
            }
        }
    }, [masterDataSet, vendor.slug]);


    const filteredData = useMemo(() => {
        if (!masterDataSet) return null;
        if (!searchTerm) return masterDataSet;

        const lowercasedTerm = searchTerm.toLowerCase();
        return masterDataSet.filter(row =>
            Object.values(row).some(value =>
                String(value ?? '').toLowerCase().includes(lowercasedTerm)
            )
        );
    }, [masterDataSet, searchTerm]);

    const handleEditItem = (item: any) => {
        setSelectedItem(item);
        setIsEditorOpen(true);
    };
    
    const { titleKey, infoKeys, columnConfig, imageUrlKey, colorsKey } = displayConfig;

    return (
        <div className="max-w-full min-w-0 overflow-hidden space-y-4 flex flex-col">
            <Card className="max-w-full overflow-hidden flex flex-col min-w-0">
                <CardHeader className="shrink-0">
                    <CardTitle>Master Data Set</CardTitle>
                    <CardDescription>
                        This is the master data set for this vendor. Upload new data in the 'Data Connection' tab.
                    </CardDescription>
                </CardHeader>
                <CardContent className="max-w-full min-w-0 flex flex-col overflow-hidden">
                     <div className="border-2 border-dashed rounded-lg p-4 space-y-4 max-w-full overflow-hidden min-w-0 flex flex-col">
                        <div className="flex items-center gap-2 shrink-0">
                             <div className="relative flex-1">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search data..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full max-w-sm pl-8"
                                />
                            </div>
                             <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('list')}>
                                <List className="h-4 w-4" />
                            </Button>
                            <Button variant={viewMode === 'card' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('card')}>
                                <LayoutGrid className="h-4 w-4" />
                            </Button>
                        </div>

                        {masterDataLoading ? (
                             <div className="flex items-center justify-center h-48">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            </div>
                        ) : filteredData && filteredData.length > 0 ? (
                           viewMode === 'card' ? (
                                <div className="max-h-[600px] overflow-y-auto w-full">
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-1">
                                        {filteredData.map((item) => {
                                            let itemImageUrl: string | null = null;
                                            if (imageUrlKey && item[imageUrlKey] && typeof item[imageUrlKey] === 'string') {
                                                const path = item[imageUrlKey].trim().replace(/\\/g, '');
                                                if (path.startsWith('http')) {
                                                    itemImageUrl = path;
                                                } else if (vendor.slug === 'yamaha' && path) {
                                                    itemImageUrl = `https://www.yamaha-motor.com.au${path}`;
                                                }
                                            }
                                            const itemColors = colorsKey && Array.isArray(item[colorsKey]) ? item[colorsKey] : [];
                                            return (
                                                <Card key={item.id} className="cursor-pointer hover:border-primary transition-colors flex flex-col h-fit shadow-sm overflow-hidden" onClick={() => handleEditItem(item)}>
                                                    {itemImageUrl ? (
                                                        <div className="relative h-40 w-full bg-secondary">
                                                            <Image src={itemImageUrl} alt={titleKey ? String(item[titleKey]) : 'Product image'} fill className="object-contain p-4" sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw" />
                                                        </div>
                                                    ) : (
                                                        <div className="relative h-40 w-full bg-secondary flex items-center justify-center">
                                                            <ImageIcon className="h-12 w-12 text-muted-foreground" />
                                                        </div>
                                                    )}
                                                    <CardHeader className="pt-4 px-4 pb-2">
                                                        <CardTitle className="truncate text-sm font-black uppercase tracking-tight">{titleKey ? String(item[titleKey] || 'Unnamed Item') : 'Unnamed Item'}</CardTitle>
                                                    </CardHeader>
                                                    <CardContent className="px-4 pb-4 flex-grow">
                                                        <div className="space-y-1 text-[10px] text-muted-foreground">
                                                            {infoKeys.map((key) => (
                                                                <div key={key} className="flex justify-between items-start gap-2">
                                                                    <span className="font-black uppercase tracking-tighter shrink-0">{key.replace(/_/g, ' ')}:</span>
                                                                    <span className="truncate text-right font-bold text-foreground">{String(item[key])}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </CardContent>
                                                    {itemColors.length > 0 && (
                                                        <CardFooter className="pt-0 pb-3 px-4 mt-auto flex flex-wrap gap-1.5 border-t bg-muted/5 pt-2">
                                                            {itemColors.map((color: any, index: number) => (
                                                                <div key={index} className="flex items-center gap-1 text-[9px] font-bold">
                                                                    <div className="h-2 w-2 rounded-full border shadow-sm" style={{ backgroundColor: typeof color === 'string' ? color.toLowerCase().replace(/ /g, '') : color.hex || color.Name || 'transparent' }}></div>
                                                                    <span className="text-muted-foreground/80 uppercase">{typeof color === 'string' ? color : color.name || color.Name}</span>
                                                                </div>
                                                            ))}
                                                        </CardFooter>
                                                    )}
                                                </Card>
                                            )
                                        })}
                                    </div>
                                </div>
                                ) : (
                                    <div className="max-h-[600px] overflow-hidden rounded-md border w-full min-w-0 flex flex-col">
                                        <div className="w-full overflow-auto flex-1 min-w-0">
                                            <JsonDataVisualizer data={filteredData} columns={columnConfig} onRowClick={handleEditItem} />
                                        </div>
                                    </div>
                                )
                            ) : (
                                <div className="flex flex-col items-center justify-center h-48">
                                    <p className="text-muted-foreground">No master data set found for this vendor.</p>
                                    <p className="mt-2 text-sm text-muted-foreground">You can upload a document in the 'Data Connection' tab.</p>
                                </div>
                            )}
                         </div>
                    </CardContent>
                </Card>
                 <MasterDataSetEditorDialog 
                    isOpen={isEditorOpen}
                    setIsOpen={setIsEditorOpen}
                    item={selectedItem}
                    vendorId={vendor.id}
                    onSave={() => {}}
                />
            </div>
        );
    }
    
    function MasterDataSetEditorDialog({
        isOpen,
        setIsOpen,
        item,
        vendorId,
        onSave,
    }: {
        isOpen: boolean;
        setIsOpen: (isOpen: boolean) => void;
        item: any | null;
        vendorId: string;
        onSave: () => void;
    }) {
        const firestore = useFirestore();
        const { toast } = useToast();
        const [isSaving, setIsSaving] = useState(false);
    
        const form = useForm({
            defaultValues: item || {},
        });
    
        useEffect(() => {
            form.reset(item || {});
        }, [item, form]);
    
        if (!item) return null;
    
        const handleSave = async (data: any) => {
            setIsSaving(true);
            try {
                const docRef = doc(firestore, `data-warehouse/${vendorId}/masterDataSet`, item.id);
                await updateDoc(docRef, data);
                toast({ title: 'Success', description: 'Item has been updated.' });
                onSave();
                setIsOpen(false);
            } catch (error: any) {
                toast({ variant: 'destructive', title: 'Save Failed', description: error.message });
                console.error(error);
            } finally {
                setIsSaving(false);
            }
        };
    
        return (
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Edit Item</DialogTitle>
                        <DialogDescription>Modify changes to the item below and click save.</DialogDescription>
                    </DialogHeader>
                    <Form {...form}>
                        <form className="space-y-4 overflow-y-auto px-1">
                            {Object.keys(item).filter(key => key !== 'id').map((key) => (
                                <FormField
                                    key={key}
                                    control={form.control}
                                    name={key as any}
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="capitalize">{key.replace(/_/g, ' ')}</FormLabel>
                                            <FormControl>
                                                <Input {...field} value={field.value ?? ''} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            ))}
                        </form>
                    </Form>
                     <DialogFooter>
                        <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                        <Button onClick={form.handleSubmit(handleSave)} disabled={isSaving}>
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );
    }
    
    export default function VendorDetailsPage() {
        const params = useParams();
        const router = useRouter();
        const { toast } = useToast();
        const slugOrId = params.id as string;
        const firestore = useFirestore();
        const storage = useStorage();
    
        const vendorQueryBySlug = useMemoFirebase(() => {
            if (!slugOrId) return null;
            return query(collection(firestore, 'data-warehouse'), where('slug', '==', slugOrId));
        }, [firestore, slugOrId]);
        
        const { data: vendorsBySlug, loading: slugLoading } = useCollection<VendorFormData>(vendorQueryBySlug);
        
        const vendorByIdRef = useMemoFirebase(() => {
            if (!slugOrId) return null;
            return doc(firestore, 'data-warehouse', slugOrId);
        }, [firestore, slugOrId]);
        const { data: vendorById, loading: idLoading } = useDoc<VendorFormData>(vendorByIdRef);
        
        const vendor = useMemo(() => vendorsBySlug?.[0] || vendorById, [vendorsBySlug, vendorById]);
        const vendorLoading = slugLoading || idLoading;
        
        const [isSubmitting, setIsSubmitting] = useState(false);
        const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
        const [logoPreview, setLogoPreview] = useState<string | null>(null);
    
        const form = useForm<VendorFormData>({
            resolver: zodResolver(formSchema),
            defaultValues: {},
        });
    
        useEffect(() => {
            if (vendor) {
                form.reset(vendor);
                if (vendor.logoUrl) setLogoPreview(vendor.logoUrl);
            }
        }, [vendor, form]);
    
        const breadcrumbParts = useMemo((): BreadcrumbPart[] => {
            if (!vendor) return [];
            return [
                { href: "/admin", label: "Admin" },
                { href: "/data-warehouse", label: "Data Warehouse" },
                { href: `/data-warehouse/${vendor.slug || vendor.id}`, label: vendor.name },
            ];
        }, [vendor]);
    
        async function onSubmit(values: VendorFormData) {
            if (!vendor) return;
            setIsSubmitting(true);
            try {
                const vendorDocRef = doc(firestore, 'data-warehouse', vendor.id);
                const dataToUpdate: Partial<VendorFormData> = {
                    name: values.name,
                    slug: createSlug(values.name),
                    vendorType: values.vendorType,
                    dataSource: values.dataSource,
                    currency: values.currency,
                    address: values.address || '',
                    abn: values.abn || '',
                    primaryContact: values.primaryContact || '',
                    website: values.website || '',
                    notes: values.notes || '',
                };
                if (values.logo instanceof File && storage) {
                    const logoPath = `data-warehouse/${vendor.id}/logos/${Date.now()}-${values.logo.name}`;
                    dataToUpdate.logoUrl = await uploadFileToStorage(storage, values.logo, logoPath);
                } else if (values.logoUrl === null) {
                    dataToUpdate.logoUrl = null;
                }
                await setDoc(vendorDocRef, dataToUpdate, { merge: true })
                    .catch((serverError) => {
                        const permissionError = new FirestorePermissionError({
                            path: vendorDocRef.path, operation: 'update', requestResourceData: dataToUpdate,
                        });
                        errorEmitter.emit('permission-error', permissionError);
                        throw serverError;
                    });
                toast({ title: 'Vendor updated', description: `${values.name} has been updated successfully.` });
                if (dataToUpdate.slug !== slugOrId) {
                    router.replace(`/data-warehouse/${dataToUpdate.slug}`);
                }
            } catch (error: any) {
                console.error("Failed to update vendor:", error);
                toast({ variant: 'destructive', title: 'Failed to update vendor', description: error.message || 'An unexpected error occurred.' });
            } finally {
                setIsSubmitting(false);
            }
        }
    
        const handleDelete = async () => {
            if (!vendor) return;
            try {
                const vendorDocRef = doc(firestore, 'data-warehouse', vendor.id);
                await deleteDoc(vendorDocRef).catch((serverError) => {
                    const permissionError = new FirestorePermissionError({ path: vendorDocRef.path, operation: 'delete' });
                    errorEmitter.emit('permission-error', permissionError);
                    throw serverError;
                });
                toast({ title: 'Vendor deleted', description: `${vendor.name} has been permanently removed.` });
                window.location.href = '/data-warehouse';
            } catch (error) {
                console.error("Failed to delete vendor:", error);
                toast({ variant: 'destructive', title: 'Deletion failed', description: 'Could not delete the vendor.' });
                setIsDeleteDialogOpen(false);
            }
        };
        
        const isBoatBrand = vendor?.vendorType === 'Boat Brand';
        const isBulkSupplier = (vendor?.vendorType === 'Electronics Supplier' || vendor?.vendorType === 'Parts Wholesaler');
        const isYamaha = vendor?.slug === 'yamaha';
        const isHighfield = vendor?.slug === 'highfield';
        const isMultiTableVendor = vendor?.dataSource === 'Document Upload';
        const defaultTab = isBoatBrand ? "product-ranges" : (isBulkSupplier || isYamaha || isMultiTableVendor) ? "master-data" : "details";
        
        return (
            <AdminGuard>
                {vendorLoading ? (
                    <div className="flex justify-center items-center py-24"><Loader2 className="h-16 w-16 animate-spin text-primary" /></div>
                ) : vendor ? (
                    <Tabs defaultValue={defaultTab} className="space-y-4 max-w-full overflow-hidden min-w-0">
                        <div className="flex items-start justify-between shrink-0">
                            <div className="min-w-0">
                                <h1 className="text-2xl font-semibold truncate">Data Warehouse - {vendor.name}</h1>
                                <BreadcrumbNav parts={breadcrumbParts} />
                            </div>
                        </div>
                        <TabsList className="max-w-full overflow-x-auto flex justify-start shrink-0">
                            {isBoatBrand && <TabsTrigger value="product-ranges">Product Ranges</TabsTrigger>}
                            {isHighfield && <TabsTrigger value="poc">POC</TabsTrigger>}
                            {(isBulkSupplier || isYamaha || isMultiTableVendor) && <TabsTrigger value="master-data">Master Data Set</TabsTrigger>}
                            <TabsTrigger value="data-connection">Data Connection</TabsTrigger>
                            <TabsTrigger value="details">Details</TabsTrigger>
                        </TabsList>
                        
                        {isBoatBrand && (
                            <TabsContent value="product-ranges">
                                {vendor.slug === 'highfield' && <HighfieldDataStructure vendorId={vendor.id} vendorSlugOrId={slugOrId} />}
                                {vendor.slug === 'jeanneau' && <JeanneauDataStructure vendorId={vendor.id} vendorSlugOrId={slugOrId} />}
                                {vendor.slug === 'stacer' && <StacerDataStructure vendorId={vendor.id} vendorSlugOrId={slugOrId} />}
                                {vendor.slug === 'stabicraft' && <StabicraftDataStructure vendorId={vendor.id} vendorSlugOrId={slugOrId} />}
                                {vendor.slug === 'surtees' && <SurteesDataStructure vendorId={vendor.id} vendorSlugOrId={slugOrId} />}
                                {vendor.slug !== 'highfield' && vendor.slug !== 'jeanneau' && vendor.slug !== 'stacer' && vendor.slug !== 'stabicraft' && vendor.slug !== 'surtees' && (
                                    <Card>
                                        <CardHeader><CardTitle>Product Ranges</CardTitle></CardHeader>
                                        <CardContent><p>A specific data structure has not been configured for this boat brand.</p></CardContent>
                                    </Card>
                                )}
                            </TabsContent>
                        )}
    
                        {isHighfield && <TabsContent value="poc"><HighfieldPoc vendorId={vendor.id} /></TabsContent>}
    
                        {(isBulkSupplier || isYamaha || isMultiTableVendor) && (
                            <TabsContent value="master-data" className="min-w-0 max-w-full overflow-hidden">
                                {vendor.slug === 'sam-allen' ? (
                                    <SamAllenDataViewer vendorId={vendor.id} />
                                ) : isMultiTableVendor ? (
                                    <MultiDataSetViewer vendor={vendor} />
                                ) : (
                                    <MasterDataSetViewer vendor={vendor} />
                                )}
                            </TabsContent>
                        )}
    
                        <TabsContent value="data-connection">
                             {vendor.slug === 'yamaha' ? (
                                <YamahaApiFetcher vendorId={vendor.id} />
                             ) : vendor.slug === 'sam-allen' ? (
                                <SamAllenUploader vendorId={vendor.id} />
                             ) : vendor.dataSource === 'Direct API' ? (
                                <ApiDataFetcher />
                             ) : vendor.dataSource === 'Document Upload' ? (
                                <DocumentExtractor vendor={vendor} />
                             ) : (
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Vendor Data Connection</CardTitle>
                                        <CardDescription>Data integration for this source type is not yet available.</CardDescription>
                                    </CardHeader>
                                    <CardContent><p className="text-muted-foreground">Data integration is not yet available for this vendor.</p></CardContent>
                                </Card>
                            )}
                        </TabsContent>
                        <TabsContent value="details">
                            <Form {...form}>
                                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                                    <div className="flex items-center justify-end gap-2">
                                        <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}>Cancel</Button>
                                        <Button type="submit" disabled={isSubmitting}>
                                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            <Save className="mr-2 h-4 w-4" /> Save Changes
                                        </Button>
                                    </div>
                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                        <div className="lg:col-span-2 space-y-8">
                                            <Card>
                                                <CardHeader><CardTitle>Vendor Details</CardTitle><CardDescription>Primary information for the vendor.</CardDescription></CardHeader>
                                                <CardContent className="space-y-6">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    <FormField control={form.control} name="name" render={({ field }) => ( <FormItem><FormLabel>Vendor Name</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )} />
                                                    <FormField control={form.control} name="vendorType" render={({ field }) => ( <FormItem><FormLabel>Vendor Type</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select a vendor type" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Boat Brand">Boat Brand</SelectItem><SelectItem value="Motor Brand">Motor Brand</SelectItem><SelectItem value="Trailer Brand">Trailer Brand</SelectItem><SelectItem value="Electronics Brand">Electronics Brand</SelectItem><SelectItem value="Electronics Supplier">Electronics Supplier</SelectItem><SelectItem value="Parts Wholesaler">Parts Wholesaler</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                        <FormField control={form.control} name="primaryContact" render={({ field }) => ( <FormItem><FormLabel>Primary Contact</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )} />
                                                        <FormField control={form.control} name="website" render={({ field }) => ( <FormItem><FormLabel>Website</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )} />
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                        <FormField control={form.control} name="address" render={({ field }) => ( <FormItem><FormLabel>Address</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )} />
                                                        <FormField control={form.control} name="abn" render={({ field }) => ( <FormItem><FormLabel>ABN</FormLabel><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )} />
                                                    </div>
                                                    <FormField control={form.control} name="notes" render={({ field }) => ( <FormItem><FormLabel>Notes</FormLabel><FormControl><Textarea {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )} />
                                                </CardContent>
                                            </Card>
                                        </div>
                                        <div className="lg:col-span-1 space-y-8">
                                            <Card>
                                                <CardHeader><CardTitle>Master Data Logic</CardTitle><CardDescription>Financial defaults for this vendor's data.</CardDescription></CardHeader>
                                                <CardContent className="space-y-6">
                                                    <FormField control={form.control} name="currency" render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="flex items-center gap-2"><Globe className="h-4 w-4 text-muted-foreground" />Master Data Currency</FormLabel>
                                                            <Select onValueChange={field.onChange} value={field.value}>
                                                                <FormControl><SelectTrigger><SelectValue placeholder="Select currency" /></SelectTrigger></FormControl>
                                                                <SelectContent>{SUPPORTED_CURRENCIES.map(curr => (<SelectItem key={curr.code} value={curr.code}>{curr.label}</SelectItem>))}</SelectContent>
                                                            </Select>
                                                            <FormDescription>Currency used for all prices stored in master data.</FormDescription><FormMessage />
                                                        </FormItem>
                                                    )} />
                                                </CardContent>
                                            </Card>
                                            <Card>
                                                <CardHeader><CardTitle>Branding</CardTitle></CardHeader>
                                                <CardContent className="space-y-6">
                                                    <FormField control={form.control} name="logo" render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>Vendor Logo</FormLabel>
                                                            {logoPreview && (
                                                                <div className="mt-2 w-32 h-32 relative group">
                                                                    <Image src={logoPreview} alt="Logo Preview" fill className="rounded-md object-contain border p-1" sizes="128px" />
                                                                    <Button type="button" variant="destructive" size="icon" className="absolute -top-2 -right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity z-10" onClick={() => { setLogoPreview(null); form.setValue('logoUrl', null); field.onChange(null); }}><X className="h-4 w-4" /></Button>
                                                                </div>
                                                            )}
                                                            <FormControl><Input type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; field.onChange(file); setLogoPreview(file ? URL.createObjectURL(file) : null); }} /></FormControl>
                                                            <FormDescription>Upload a new logo.</FormDescription><FormMessage />
                                                        </FormItem>
                                                    )} />
                                                </CardContent>
                                            </Card>
                                            <Card>
                                                <CardHeader><CardTitle>Data Source</CardTitle></CardHeader>
                                                <CardContent>
                                                    <FormField control={form.control} name="dataSource" render={({ field }) => ( <FormItem><FormLabel>Data Source</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select a data source" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Business Central">Business Central</SelectItem><SelectItem value="Direct API">Direct API</SelectItem><SelectItem value="Document Upload">Document Upload</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
                                                </CardContent>
                                            </Card>
                                        </div>
                                    </div>
                                    <Card className="border-destructive">
                                        <CardHeader><CardTitle className="text-destructive">Danger Zone</CardTitle></CardHeader>
                                        <CardContent><p className="text-sm text-muted-foreground">Deleting this vendor is permanent.</p></CardContent>
                                        <CardFooter><Button variant="destructive" type="button" onClick={() => setIsDeleteDialogOpen(true)}><Trash2 className="mr-2 h-4 w-4" />Delete Vendor</Button></CardFooter>
                                    </Card>
                                </form>
                            </Form>
                        </TabsContent>
                    </Tabs>
                ) : (
                    <Card><CardHeader><CardTitle>Vendor not found</CardTitle></CardHeader><CardContent><p>The requested vendor could not be found.</p></CardContent></Card>
                )}
                {vendor && (
                    <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                        <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete <strong>{vendor.name}</strong>.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Yes, delete it</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                )}
            </AdminGuard>
        );
    }
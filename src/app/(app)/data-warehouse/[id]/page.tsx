'use client';

import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';
import * as XLSX from 'xlsx';

import { BreadcrumbNav } from '@/components/breadcrumb-nav';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useFirestore } from '@/firebase/provider';
import { doc, updateDoc, deleteDoc, query, collection, where } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Loader2, Trash2, Save, X, TestTube2, Code, Eye, Wand2, Upload, UploadCloud } from 'lucide-react';
import AdminGuard from '@/components/admin-guard';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { fileToDataUri } from '@/firebase/storage-utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { proxyFetch } from '@/actions/proxy-fetch';
import { analyzeJson, type AnalyzeJsonOutput } from '@/ai/flows/analyze-json-flow';
import { analyzeDocument, type AnalyzeDocumentOutput } from '@/ai/flows/analyze-document-flow';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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
import { createSlug } from '@/lib/utils';
import { HighfieldDataStructure } from '@/components/highfield-data-structure';

const formSchema = z.object({
  id: z.string(),
  name: z.string().min(1, { message: 'Vendor name is required.' }),
  slug: z.string().nullable().optional(),
  vendorType: z.string().min(1, { message: 'Vendor type is required.' }),
  dataSource: z.string().min(1, { message: 'Data source is required.' }),
  address: z.string().nullable().optional(),
  abn: z.string().nullable().optional(),
  logo: z.any().optional(),
  attachment: z.any().optional(),
  primaryContact: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  logoUrl: z.string().nullable().optional(),
  attachmentUrl: z.string().nullable().optional(),
  attachmentName: z.string().nullable().optional(),
});

type VendorFormData = z.infer<typeof formSchema>;

function JsonDataVisualizer({ data }: { data: any }) {
    if (!data || (Array.isArray(data) && data.length === 0)) {
        return <p className="text-muted-foreground p-4 text-center">No data to visualize.</p>;
    }

    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
        // Array of objects -> render a table
        const headers = Object.keys(data[0]);
        return (
            <div className="max-h-[600px] overflow-auto rounded-md border">
                <Table>
                    <TableHeader className="sticky top-0 bg-secondary z-10">
                        <TableRow>
                            {headers.map(header => <TableHead key={header} className="whitespace-nowrap">{header}</TableHead>)}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.map((row, rowIndex) => (
                            <TableRow key={rowIndex} className="odd:bg-muted/50">
                                {headers.map(header => (
                                    <TableCell key={`${rowIndex}-${header}`} className="align-top text-sm">
                                        {typeof row[header] === 'object' && row[header] !== null ? (
                                            <pre className="text-xs bg-background p-2 rounded-md overflow-x-auto"><code>{JSON.stringify(row[header], null, 2)}</code></pre>
                                        ) : (
                                            String(row[header])
                                        )}
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        );
    }

    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
        // Single object -> render key-value list
        return (
             <div className="max-h-[600px] overflow-auto rounded-md border p-4 space-y-3 bg-secondary/30">
                {Object.entries(data).map(([key, value]) => (
                    <div key={key} className="grid grid-cols-1 md:grid-cols-4 gap-2 text-sm items-start">
                        <div className="font-semibold text-muted-foreground md:text-right md:pr-4">{key}</div>
                        <div className="md:col-span-3">
                            {typeof value === 'object' && value !== null ? (
                                <pre className="text-xs bg-background p-2 rounded-md overflow-x-auto"><code>{JSON.stringify(value, null, 2)}</code></pre>
                            ) : (
                                <span className="text-foreground break-words">{String(value)}</span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        );
    }
    
    // Fallback for primitive types or other cases
    return <pre className="mt-2 max-h-[600px] overflow-auto rounded-md bg-secondary p-4 text-sm"><code>{JSON.stringify(data, null, 2)}</code></pre>;
}

function ApiDataFetcher() {
    const [url, setUrl] = useState('');
    const [jsonData, setJsonData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [analysis, setAnalysis] = useState<AnalyzeJsonOutput | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [instructions, setInstructions] = useState('Extract the most important fields and simplify the structure. If there is a list of items, return an array of those items with only their key properties.');
    const { toast } = useToast();

    const handleFetchData = async () => {
        if (!url) {
            toast({
                variant: 'destructive',
                title: 'URL Required',
                description: 'Please enter an API URL to fetch data.',
            });
            return;
        }

        setIsLoading(true);
        setError(null);
        setJsonData(null);
        setAnalysis(null);
        
        let collectedData: any[] = [];
        let nextUrl: string | null = url;
        let isFirstRequest = true;

        try {
            while (nextUrl) {
                const result = await proxyFetch(nextUrl);

                if (!result.success) {
                     throw new Error(result.error);
                }
                
                let pageData = result.data;
                if (typeof pageData === 'string') {
                    try {
                        pageData = JSON.parse(pageData);
                    } catch (e) {
                         throw new Error(`Response was not valid JSON. Content starts with: "${pageData.substring(0, 100)}..."`);
                    }
                }

                // Handle Zoho-like specific error format in the body of a 200 OK response
                if (pageData.code && pageData.code !== 3000 && pageData.result?.status === 'Failure') {
                    const errorMessage = pageData.result?.errors?.[0] || pageData.message || 'The API returned an error in the response body.';
                    throw new Error(`API Error: ${errorMessage}`);
                }
                
                const items = Array.isArray(pageData) ? pageData : pageData.data || pageData.results;

                if (Array.isArray(items)) {
                    collectedData.push(...items);
                } else if (isFirstRequest) {
                    // Not an array of items, not a paginated object we recognize. Treat as single object response.
                    collectedData.push(pageData);
                    nextUrl = null; // Stop after this
                    continue;
                }

                isFirstRequest = false;

                // Pagination logic
                let tempNextUrl = null;
                const hasMoreZoho = pageData.more_records === true || pageData.more_records === 'true'; 
                if (url.includes('zohoapis.com') && pageData.data && 'more_records' in pageData) {
                    if (hasMoreZoho) {
                        const currentUrl = new URL(nextUrl!);
                        const currentPage = parseInt(currentUrl.searchParams.get('pageIndex') || '1', 10);
                        currentUrl.searchParams.set('pageIndex', (currentPage + 1).toString());
                        tempNextUrl = currentUrl.toString();
                        // Safety break
                        if (currentPage >= 100) {
                            toast({ variant: 'default', title: 'Stopping fetch', description: 'Reached 100 page limit.' });
                            tempNextUrl = null;
                        }
                    } else {
                        tempNextUrl = null;
                    }
                } else {
                    // Generic link-based pagination
                    tempNextUrl = pageData.next || pageData.links?.next || null;
                }
                nextUrl = tempNextUrl;
            }

            setJsonData(collectedData.length === 1 && !Array.isArray(collectedData[0]) ? collectedData[0] : collectedData);

            toast({
                title: 'Data Fetch Complete',
                description: `Successfully retrieved all records.`,
            });
        } catch (e: any) {
            let errorMessage = e.message || 'Failed to fetch or parse data.';
            if (e.message && e.message.includes('Failed to fetch')) { // Check generic error message from server action
                 errorMessage = 'A network error occurred. This is often due to a CORS policy or the URL is unreachable from the server.';
            }
            setError(errorMessage);
            toast({
                variant: 'destructive',
                title: 'Fetch Failed',
                description: errorMessage,
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleAnalyzeData = async () => {
        if (!jsonData) {
            toast({
                variant: 'destructive',
                title: 'No Data to Analyze',
                description: 'Please fetch data from an API endpoint first.',
            });
            return;
        }
        if (!instructions) {
            toast({
                variant: 'destructive',
                title: 'Instructions Required',
                description: 'Please provide instructions for the AI.',
            });
            return;
        }

        setIsAnalyzing(true);
        setAnalysis(null);
        try {
            let jsonStringForAI = JSON.stringify(jsonData, null, 2);
            let analysisInstructions = instructions;
            const MAX_CHARS = 20000;

            if (jsonStringForAI.length > MAX_CHARS) {
                jsonStringForAI = jsonStringForAI.substring(0, MAX_CHARS) + '...';
                analysisInstructions = instructions + "\n\nIMPORTANT: The JSON data provided was too large and has been truncated. Your analysis should be based on this partial data, and you should mention that the data was truncated in your summary.";
                 toast({
                    title: 'Data Truncated for AI',
                    description: `The JSON data is large and has been shortened for AI analysis.`,
                });
            }

            const result = await analyzeJson({
                jsonString: jsonStringForAI,
                instructions: analysisInstructions,
            });

            setAnalysis(result);
            toast({
                title: 'Analysis Complete',
                description: 'The AI has finished restructuring the data.',
            });
        } catch (e: any) {
            toast({
                variant: 'destructive',
                title: 'AI Analysis Failed',
                description: e.message || 'An unexpected response was received from the server.',
            });
        } finally {
            setIsAnalyzing(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>API Data Fetcher</CardTitle>
                <CardDescription>Enter an API endpoint to fetch and view JSON data.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                    <Tabs defaultValue="json" className="pt-4">
                        <TabsList>
                            <TabsTrigger value="json"><Code className="h-4 w-4 mr-2" />JSON Response</TabsTrigger>
                            <TabsTrigger value="visualize"><Eye className="h-4 w-4 mr-2" />Visualize Data</TabsTrigger>
                            <TabsTrigger value="ai-restructure"><Wand2 className="h-4 w-4 mr-2" />AI Restructure</TabsTrigger>
                        </TabsList>

                        <TabsContent value="json">
                            <pre className="mt-2 max-h-[600px] overflow-auto rounded-md bg-secondary p-4 text-sm">
                                <code>{JSON.stringify(jsonData, null, 2)}</code>
                            </pre>
                        </TabsContent>
                        <TabsContent value="visualize">
                            <JsonDataVisualizer data={jsonData} />
                        </TabsContent>
                        <TabsContent value="ai-restructure" className="mt-4 space-y-4">
                             <div className="space-y-2">
                                <Label htmlFor="ai-instructions">Instructions</Label>
                                <Textarea
                                    id="ai-instructions"
                                    placeholder="e.g., Extract just the name and id from each item in the array."
                                    value={instructions}
                                    onChange={(e) => setInstructions(e.target.value)}
                                    rows={3}
                                />
                                <p className="text-sm text-muted-foreground">
                                    Tell the AI how to restructure the JSON data.
                                </p>
                            </div>
                            <Button onClick={handleAnalyzeData} disabled={isAnalyzing}>
                                {isAnalyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                                Restructure with AI
                            </Button>
                            
                            <div className="pt-4">
                                {isAnalyzing ? (
                                    <div className="flex items-center justify-center rounded-md border border-dashed p-8">
                                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                        <p className="ml-4 text-muted-foreground">AI is restructuring...</p>
                                    </div>
                                ) : analysis ? (
                                    <div className="space-y-4">
                                        <div>
                                            <h4 className="font-semibold">Summary from AI</h4>
                                            <p className="text-sm text-muted-foreground mt-1">{analysis.summary}</p>
                                        </div>
                                        <div>
                                            <h4 className="font-semibold">Restructured Data</h4>
                                            <JsonDataVisualizer data={analysis.restructuredData} />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center rounded-md border border-dashed p-8">
                                        <p className="text-muted-foreground">AI results will be displayed here.</p>
                                    </div>
                                )}
                            </div>
                        </TabsContent>
                    </Tabs>
                )}
            </CardContent>
        </Card>
    );
}

function DocumentExtractor() {
    const [file, setFile] = useState<File | null>(null);
    const [processed, setProcessed] = useState(false);
    const [rowCount, setRowCount] = useState(0);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0] || null;
        setFile(selectedFile);
        setProcessed(false);
        setRowCount(0);
        setError(null);
    };

    const robustCsvParser = (csvText: string): string[][] => {
        const rows: string[][] = [];
        let currentRow: string[] = [];
        let currentField = '';
        let inQuotes = false;

        for (let i = 0; i < csvText.length; i++) {
            const char = csvText[i];

            if (inQuotes) {
                if (char === '"') {
                    if (i + 1 < csvText.length && csvText[i + 1] === '"') {
                        // Escaped quote
                        currentField += '"';
                        i++; // Skip next quote
                    } else {
                        // End of quoted field
                        inQuotes = false;
                    }
                } else {
                    currentField += char;
                }
            } else {
                if (char === '"') {
                    inQuotes = true;
                } else if (char === ',') {
                    currentRow.push(currentField);
                    currentField = '';
                } else if (char === '\n' || char === '\r') {
                    if(i > 0 && csvText[i-1] !== '\n' && csvText[i-1] !== '\r') {
                      currentRow.push(currentField);
                      rows.push(currentRow);
                      currentRow = [];
                      currentField = '';
                    }
                    if (char === '\r' && i + 1 < csvText.length && csvText[i+1] === '\n') {
                        i++; // handle CRLF
                    }
                } else {
                    currentField += char;
                }
            }
        }
        // Add the last field and row if the file doesn't end with a newline
        if (currentField || currentRow.length > 0) {
            currentRow.push(currentField);
            rows.push(currentRow);
        }
        return rows;
    };
    
    const handleProcessFile = async () => {
        if (!file) {
            toast({ variant: 'destructive', title: 'No file selected', description: 'Please upload a CSV or XLSX file.' });
            return;
        }
        setIsProcessing(true);
        setError(null);
        
        try {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = e.target?.result;
                    if (!data) throw new Error("Could not read file.");

                    let jsonData: any[] = [];
                    if (file.name.endsWith('.csv')) {
                        const text = typeof data === 'string' ? data : new TextDecoder().decode(data as ArrayBuffer);
                        const parsedRows = robustCsvParser(text);
                        if(parsedRows.length < 2) {
                            throw new Error("CSV must have at least a header row and one data row.");
                        }
                        const headers = parsedRows[0];
                        const rows = parsedRows.slice(1);
                        jsonData = rows.map(row => {
                            const obj: { [key: string]: any } = {};
                            headers.forEach((header, index) => {
                                obj[header] = row[index];
                            });
                            return obj;
                        });
                    } else if (file.name.endsWith('.xlsx')) {
                        const workbook = XLSX.read(data, { type: 'binary' });
                        const sheetName = workbook.SheetNames[0];
                        const worksheet = workbook.Sheets[sheetName];
                        jsonData = XLSX.utils.sheet_to_json(worksheet);
                    } else {
                        throw new Error('Unsupported file type. Please upload a CSV or XLSX file.');
                    }
                    
                    setRowCount(jsonData.length);
                    setProcessed(true);
                    toast({ title: "File Processed", description: `Found ${jsonData.length} rows.` });
                } catch(err: any) {
                    setError(err.message);
                    toast({ variant: 'destructive', title: "Processing Failed", description: err.message });
                } finally {
                    setIsProcessing(false);
                }
            };
            reader.onerror = () => {
                setError("Failed to read file.");
                setIsProcessing(false);
            };

            if(file.name.endsWith('.csv')) {
              reader.readAsText(file);
            } else {
              reader.readAsBinaryString(file);
            }

        } catch (err: any) {
            setError(err.message);
            setIsProcessing(false);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
                 <CardHeader>
                    <CardTitle>Upload File</CardTitle>
                    <CardDescription>Select a CSV or XLSX file to extract data from.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     <div className="space-y-2">
                        <Label htmlFor="document-file">Data File</Label>
                        <div className="flex items-center gap-2">
                            <Input id="document-file" type="file" onChange={handleFileChange} accept=".csv,.xlsx" />
                            <Button onClick={handleProcessFile} disabled={isProcessing || !file}>
                                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                <span className="ml-2 hidden sm:inline">Process</span>
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle>Processing Result</CardTitle>
                    <CardDescription>Status of the file processing.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isProcessing ? (
                        <div className="flex items-center justify-center p-8">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <p className="ml-4 text-muted-foreground">Processing file...</p>
                        </div>
                    ) : error ? (
                        <div className="text-destructive p-4 bg-destructive/10 rounded-md">
                            <p className="font-bold">Error:</p>
                            <p>{error}</p>
                        </div>
                    ) : processed ? (
                         <div className="text-center p-8">
                            <p className="text-lg">File processed successfully.</p>
                            <p className="text-4xl font-bold mt-2">{rowCount}</p>
                            <p className="text-muted-foreground">rows found.</p>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center p-8">
                            <p className="text-muted-foreground">Upload and process a file to see the results.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

export default function VendorDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const { toast } = useToast();
    const slugOrId = params.id as string;
    const firestore = useFirestore();

    const vendorQueryBySlug = useMemo(() => {
        if (!slugOrId) return null;
        return query(collection(firestore, 'data-warehouse'), where('slug', '==', slugOrId));
    }, [firestore, slugOrId]);
    
    const { data: vendorsBySlug, loading: slugLoading } = useCollection<VendorFormData>(vendorQueryBySlug);
    const { data: vendorById, loading: idLoading } = useDoc<VendorFormData>(slugOrId ? `/data-warehouse/${slugOrId}`: null);
    
    const vendor = useMemo(() => vendorsBySlug?.[0] || vendorById, [vendorsBySlug, vendorById]);
    const vendorLoading = slugLoading || idLoading;
    
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);
    const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);

    const form = useForm<VendorFormData>({
        resolver: zodResolver(formSchema),
        defaultValues: {},
    });

    useEffect(() => {
        if (vendor) {
            form.reset(vendor);
            if (vendor.logoUrl) setLogoPreview(vendor.logoUrl);
            if (vendor.attachmentName) setAttachmentPreview(vendor.attachmentName);
        }
    }, [vendor, form]);

    async function onSubmit(values: VendorFormData) {
        if (!vendor) return;
        setIsSubmitting(true);

        try {
            const vendorDocRef = doc(firestore, 'data-warehouse', vendor.id);

            const dataToUpdate: { [key: string]: any } = {
                name: values.name,
                slug: createSlug(values.name),
                vendorType: values.vendorType,
                dataSource: values.dataSource,
                address: values.address || '',
                abn: values.abn || '',
                primaryContact: values.primaryContact || '',
                website: values.website || '',
                notes: values.notes || '',
            };

            if (values.logo instanceof File) {
                dataToUpdate.logoUrl = await fileToDataUri(values.logo);
            } else if (values.logoUrl === '') {
                dataToUpdate.logoUrl = null;
            } else {
                dataToUpdate.logoUrl = vendor.logoUrl || null;
            }

            if (values.attachment instanceof File) {
                dataToUpdate.attachmentUrl = await fileToDataUri(values.attachment);
                dataToUpdate.attachmentName = values.attachment.name;
            } else if (values.attachmentUrl === '') {
                dataToUpdate.attachmentUrl = null;
                dataToUpdate.attachmentName = null;
            } else {
                dataToUpdate.attachmentUrl = vendor.attachmentUrl || null;
                dataToUpdate.attachmentName = vendor.attachmentName || null;
            }

            await updateDoc(vendorDocRef, dataToUpdate)
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
    
    return (
        <AdminGuard>
            {vendorLoading ? (
                <div className="flex justify-center items-center py-24"><Loader2 className="h-16 w-16 animate-spin text-primary" /></div>
            ) : vendor ? (
                <Tabs defaultValue="initial-upload" className="space-y-4">
                    <div className="flex items-start justify-between">
                        <div>
                            <h1 className="text-2xl font-semibold">Data Warehouse - {vendor.name}</h1>
                            <BreadcrumbNav pageTitle={vendor.name} />
                        </div>
                    </div>
                    <TabsList>
                        <TabsTrigger value="initial-upload">Initial Upload</TabsTrigger>
                        <TabsTrigger value="data-connection">Data Connection</TabsTrigger>
                        <TabsTrigger value="details">Details</TabsTrigger>
                    </TabsList>
                    <TabsContent value="initial-upload">
                        {vendor.slug === 'highfield' ? (
                            <HighfieldDataStructure vendorId={vendor.id} />
                        ) : (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Initial Data Upload for {vendor.name}</CardTitle>
                                    <CardDescription>
                                        This is where you will upload and manage the initial data set for this vendor.
                                        Each vendor has a unique data structure, and the uploader will be configured accordingly.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed rounded-lg">
                                        <UploadCloud className="h-16 w-16 text-muted-foreground" />
                                        <p className="mt-4 text-sm text-muted-foreground">Vendor-specific uploader coming soon.</p>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>
                    <TabsContent value="data-connection">
                         {vendor.dataSource === 'Direct API' && <ApiDataFetcher />}
                         {vendor.dataSource === 'Document Upload' && <DocumentExtractor />}
                         {vendor.dataSource !== 'Direct API' && vendor.dataSource !== 'Document Upload' && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Vendor Data Connection</CardTitle>
                                    <CardDescription>Data integration for this source type is not yet available.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-muted-foreground">Data integration is not yet available for this vendor.</p>
                                </CardContent>
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
                                            <CardHeader>
                                                <CardTitle>Vendor Details</CardTitle>
                                                <CardDescription>Primary information for the vendor.</CardDescription>
                                            </CardHeader>
                                            <CardContent className="space-y-6">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <FormField control={form.control} name="name" render={({ field }) => ( <FormItem><FormLabel>Vendor Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
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
                                            <CardHeader><CardTitle>Branding & Attachments</CardTitle></CardHeader>
                                            <CardContent className="space-y-6">
                                                <FormField control={form.control} name="logo" render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Vendor Logo</FormLabel>
                                                        {logoPreview && (
                                                            <div className="mt-2 w-32 h-32 relative group">
                                                                <Image src={logoPreview} alt="Logo Preview" fill className="rounded-md object-contain border p-1" />
                                                                <Button
                                                                    type="button"
                                                                    variant="destructive"
                                                                    size="icon"
                                                                    className="absolute -top-2 -right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                                                    onClick={() => {
                                                                        setLogoPreview(null);
                                                                        form.setValue('logoUrl', ''); // Signal deletion
                                                                        field.onChange(null);
                                                                    }}
                                                                >
                                                                    <X className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                        )}
                                                        <FormControl>
                                                            <Input type="file" accept="image/*" onChange={(e) => {
                                                                const file = e.target.files?.[0];
                                                                field.onChange(file);
                                                                setLogoPreview(file ? URL.createObjectURL(file) : null);
                                                            }} />
                                                        </FormControl>
                                                        <FormDescription>Upload a new logo.</FormDescription>
                                                        <FormMessage />
                                                    </FormItem>
                                                )} />
                                                <FormField control={form.control} name="attachment" render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>File Attachment</FormLabel>
                                                        {attachmentPreview && (
                                                            <div className="mt-2 relative group p-2 bg-muted rounded-md">
                                                                <p className="text-sm text-muted-foreground pr-6">Selected: <strong>{attachmentPreview}</strong></p>
                                                                <Button
                                                                    type="button"
                                                                    variant="destructive"
                                                                    size="icon"
                                                                    className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                    onClick={() => {
                                                                        setAttachmentPreview(null);
                                                                        form.setValue('attachmentUrl', ''); // Signal deletion
                                                                        form.setValue('attachmentName', ''); // Signal deletion
                                                                        field.onChange(null);
                                                                    }}
                                                                >
                                                                    <X className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                        )}
                                                        <FormControl>
                                                            <Input type="file" onChange={(e) => {
                                                                const file = e.target.files?.[0];
                                                                field.onChange(file);
                                                                setAttachmentPreview(file ? file.name : null);
                                                            }} />
                                                        </FormControl>
                                                        <FormDescription>Upload a new file.</FormDescription>
                                                        <FormMessage />
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
                                    <CardContent><p className="text-sm text-muted-foreground">Deleting this vendor is permanent and cannot be undone.</p></CardContent>
                                    <CardFooter>
                                        <Button variant="destructive" type="button" onClick={() => setIsDeleteDialogOpen(true)}><Trash2 className="mr-2 h-4 w-4" />Delete Vendor</Button>
                                    </CardFooter>
                                </Card>
                            </form>
                        </Form>
                    </TabsContent>
                </Tabs>
            ) : (
                <Card><CardHeader><CardTitle>Vendor not found</CardTitle></CardHeader><CardContent><p>The requested vendor could not be found. It may have been deleted, or the link is incorrect.</p></CardContent></Card>
            )}

            {vendor && (
                <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>This will permanently delete <strong>{vendor.name}</strong> and all its data. This action cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Yes, delete it</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}
        </AdminGuard>
    );
}

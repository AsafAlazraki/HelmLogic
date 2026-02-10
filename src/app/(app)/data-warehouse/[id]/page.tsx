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
import { useCollection } from '@/firebase/firestore/use-collection';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useFirestore, useStorage } from '@/firebase/provider';
import { doc, updateDoc, deleteDoc, query, collection, where, getDocs, writeBatch } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Loader2, Trash2, Save, X, TestTube2, Code, Eye, UploadCloud, FileUp, Replace } from 'lucide-react';
import AdminGuard from '@/components/admin-guard';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { uploadFileToStorage } from '@/firebase/storage';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';

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
import { JeanneauDataStructure } from '@/components/jeanneau-data-structure';
import { StacerDataStructure } from '@/components/stacer-data-structure';
import { fileToDataUri } from '@/firebase/storage-utils';

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

function JsonDataVisualizer({ data, columns }: { data: any, columns?: {key: string, label: string}[] }) {
    if (!data || (Array.isArray(data) && data.length === 0)) {
        return <p className="text-muted-foreground p-4 text-center">No data to visualize.</p>;
    }

    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
        const headers = columns ? columns.map(c => c.label) : Object.keys(data[0]);
        const keys = columns ? columns.map(c => c.key) : headers;

        return (
            <div className="max-h-[600px] overflow-auto rounded-md border">
                <Table>
                    <TableHeader className="sticky top-0 bg-secondary z-10">
                        <TableRow>
                            {headers.map((header, idx) => <TableHead key={`${header}-${idx}`} className="whitespace-nowrap">{header}</TableHead>)}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.map((row, rowIndex) => (
                            <TableRow key={rowIndex} className="odd:bg-muted/50">
                                {keys.map((key, colIndex) => (
                                    <TableCell key={`${rowIndex}-${colIndex}`} className="align-top text-sm">
                                        {typeof row[key] === 'object' && row[key] !== null ? (
                                            <pre className="text-xs bg-background p-2 rounded-md overflow-x-auto"><code>{JSON.stringify(row[key], null, 2)}</code></pre>
                                        ) : (
                                            String(row[key] ?? '')
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
    
    return <pre className="mt-2 max-h-[600px] overflow-auto rounded-md bg-secondary p-4 text-sm"><code>{JSON.stringify(data, null, 2)}</code></pre>;
}

function ApiDataFetcher() {
    const [url, setUrl] = useState('');
    const [jsonData, setJsonData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleFetchData = async () => {
        // This function will be updated to use server action for fetching
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
                        </TabsList>
                        <TabsContent value="json">
                            <pre className="mt-2 max-h-[600px] overflow-auto rounded-md bg-secondary p-4 text-sm">
                                <code>{JSON.stringify(jsonData, null, 2)}</code>
                            </pre>
                        </TabsContent>
                        <TabsContent value="visualize">
                            <JsonDataVisualizer data={jsonData} />
                        </TabsContent>
                    </Tabs>
                )}
            </CardContent>
        </Card>
    );
}

function DocumentExtractor({ vendor }: { vendor: VendorFormData }) {
    const firestore = useFirestore();
    const storage = useStorage();
    const { toast } = useToast();

    const masterDataSetPath = vendor ? `data-warehouse/${vendor.id}/masterDataSet` : null;
    const { data: masterDataSet, loading: masterDataLoading } = useCollection(masterDataSetPath);

    const [showUploader, setShowUploader] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [parsedData, setParsedData] = useState<any[] | null>(null);
    const [columns, setColumns] = useState<{key: string, label: string}[] | undefined>(undefined);
    const [isParsing, setIsParsing] = useState(false);
    const [isSavingToMaster, setIsSavingToMaster] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!masterDataLoading) {
            setShowUploader(!masterDataSet || masterDataSet.length === 0);
        }
    }, [masterDataSet, masterDataLoading]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0] || null;
        setFile(selectedFile);
        setParsedData(null);
        setColumns(undefined);
        setError(null);
        if (selectedFile) {
            handleParseData(selectedFile);
        }
    };

    const handleParseData = (fileToParse: File) => {
        if (!fileToParse) {
            toast({ variant: 'destructive', title: 'No file selected', description: 'Please select a document to parse.' });
            return;
        }
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
        reader.onerror = (e) => {
            setError('Failed to read file.');
            toast({ variant: 'destructive', title: 'File Read Error', description: 'Could not read the selected file.' });
            setIsParsing(false);
        };
        reader.readAsBinaryString(fileToParse);
    };
    
    const handleSaveToMaster = async () => {
        if (!parsedData || !file || !vendor) {
            toast({ variant: 'destructive', title: 'Error', description: 'No data to save. Please parse a document first.' });
            return;
        }
        setIsSavingToMaster(true);
        try {
            // 1. Upload the original file to storage
            const filePath = `data-warehouse/${vendor.id}/attachments/${Date.now()}-${file.name}`;
            const downloadURL = await uploadFileToStorage(storage, file, filePath);
    
            const subcollectionRef = collection(firestore, 'data-warehouse', vendor.id, 'masterDataSet');
            
            // 2. Clear old data from the subcollection in batches
            const oldDataSnapshot = await getDocs(subcollectionRef);
            if (!oldDataSnapshot.empty) {
                const deleteBatchSize = 500;
                for (let i = 0; i < oldDataSnapshot.docs.length; i += deleteBatchSize) {
                    const chunk = oldDataSnapshot.docs.slice(i, i + deleteBatchSize);
                    const deleteBatch = writeBatch(firestore);
                    chunk.forEach(doc => deleteBatch.delete(doc.ref));
                    await deleteBatch.commit();
                }
            }
    
            // 3. Batch write the new parsed data to the subcollection
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
    
            // 4. Update the vendor document with the new attachment URL
            const vendorDocRef = doc(firestore, 'data-warehouse', vendor.id);
            await updateDoc(vendorDocRef, {
                attachmentUrl: downloadURL,
                attachmentName: file.name
            });
            
            toast({ title: 'Success', description: 'Master data set has been updated.' });
            setShowUploader(false);
            setFile(null);
            setParsedData(null);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Save Failed', description: e.message || 'An unexpected error occurred. Check console for details.' });
            console.error("Save to master data set failed:", e);
        } finally {
            setIsSavingToMaster(false);
        }
    };
    
    if (masterDataLoading) {
        return (
            <Card>
                <CardContent className="flex items-center justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </CardContent>
            </Card>
        );
    }
    
    if (!showUploader) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Master Data Set</CardTitle>
                    <CardDescription>
                        This data was imported from: <strong>{vendor.attachmentName || 'an uploaded document'}</strong>
                    </CardDescription>
                </CardHeader>
                <CardContent>
                     <JsonDataVisualizer data={masterDataSet} />
                </CardContent>
                <CardFooter>
                    <Button variant="outline" onClick={() => setShowUploader(true)}>
                        <Replace className="mr-2 h-4 w-4" />
                        Upload New Document
                    </Button>
                </CardFooter>
            </Card>
        );
    }
    
    return (
        <Card>
            <CardHeader>
                <CardTitle>Document Data Extractor</CardTitle>
                <CardDescription>Upload a document (CSV, XLSX) to extract a structured data set.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-2">
                    <Label htmlFor="document-file">Data File</Label>
                    <div className="flex items-center gap-2 p-4 border-2 border-dashed rounded-lg">
                        <FileUp className="h-6 w-6 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground flex-1">
                            {file ? `Selected: ${file.name}` : 'Select a file to begin...'}
                        </span>
                        <Button asChild variant="outline">
                            <Label htmlFor="document-file" className="cursor-pointer">
                                Choose File
                            </Label>
                        </Button>
                        <Input id="document-file" type="file" onChange={handleFileChange} className="hidden" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" />
                    </div>
                </div>
                
                {isParsing && (
                    <div className="flex items-center justify-center rounded-md border border-dashed p-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="ml-4 text-muted-foreground">Parsing document...</p>
                    </div>
                )}
                {error && <p className="text-destructive text-sm">{error}</p>}

                {parsedData && (
                     <Card>
                        <CardHeader>
                            <CardTitle>Parsed Data</CardTitle>
                            <CardDescription>Review the data parsed from your file below.</CardDescription>
                        </CardHeader>
                        <CardContent>
                             <JsonDataVisualizer data={parsedData} columns={columns} />
                        </CardContent>
                        <CardFooter>
                            <div className="flex flex-col items-start gap-4 w-full">
                                <Button onClick={handleSaveToMaster} disabled={isSavingToMaster}>
                                    {isSavingToMaster ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                    {isSavingToMaster ? 'Saving...' : 'Save to Master Data Set'}
                                </Button>
                            </div>
                        </CardFooter>
                    </Card>
                )}
            </CardContent>
        </Card>
    );
}

export default function VendorDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const { toast } = useToast();
    const slugOrId = params.id as string;
    const firestore = useFirestore();
    const storage = useStorage();

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
                const logoFile = values.logo;
                const logoPath = `data-warehouse/${vendor.id}/logos/${Date.now()}-${logoFile.name}`;
                dataToUpdate.logoUrl = await uploadFileToStorage(storage, logoFile, logoPath);
            } else if (values.logoUrl === null) {
                dataToUpdate.logoUrl = null;
            } else {
                dataToUpdate.logoUrl = vendor.logoUrl || null;
            }
            
            if (values.attachment instanceof File) {
                const attachmentFile = values.attachment;
                const attachmentPath = `data-warehouse/${vendor.id}/attachments/${Date.now()}-${attachmentFile.name}`;
                dataToUpdate.attachmentUrl = await uploadFileToStorage(storage, attachmentFile, attachmentPath);
                dataToUpdate.attachmentName = attachmentFile.name;
            } else if (values.attachmentUrl === null) {
                dataToUpdate.attachmentUrl = null;
                dataToUpdate.attachmentName = null;
            } else {
                dataToUpdate.attachmentUrl = vendor.attachmentUrl || null;
                dataToUpdate.attachmentName = vendor.attachmentName || null;
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
    
    return (
        <AdminGuard>
            {vendorLoading ? (
                <div className="flex justify-center items-center py-24"><Loader2 className="h-16 w-16 animate-spin text-primary" /></div>
            ) : vendor ? (
                <Tabs defaultValue="master-data" className="space-y-4">
                    <div className="flex items-start justify-between">
                        <div>
                            <h1 className="text-2xl font-semibold">Data Warehouse - {vendor.name}</h1>
                            <BreadcrumbNav parts={breadcrumbParts} />
                        </div>
                    </div>
                    <TabsList>
                        <TabsTrigger value="master-data">Master Data Set</TabsTrigger>
                        <TabsTrigger value="data-connection">Data Connection</TabsTrigger>
                        <TabsTrigger value="details">Details</TabsTrigger>
                    </TabsList>
                    <TabsContent value="master-data">
                        {vendor.slug === 'highfield' ? (
                            <HighfieldDataStructure vendorId={vendor.id} vendorSlugOrId={vendor.slug || vendor.id} />
                        ) : vendor.slug === 'jeanneau' ? (
                            <JeanneauDataStructure vendorId={vendor.id} vendorSlugOrId={vendor.slug || vendor.id} />
                        ) : vendor.slug === 'stacer' ? (
                            <StacerDataStructure vendorId={vendor.id} vendorSlugOrId={vendor.slug || vendor.id} />
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
                         {vendor.dataSource === 'Document Upload' && <DocumentExtractor vendor={vendor} />}
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
                                                                        form.setValue('logoUrl', null);
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
                                                                        form.setValue('attachmentUrl', null);
                                                                        form.setValue('attachmentName', null);
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

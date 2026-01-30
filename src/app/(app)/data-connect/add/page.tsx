'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase/provider';
import { collection, doc, setDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BreadcrumbNav } from '@/components/breadcrumb-nav';
import AdminGuard from '@/components/admin-guard';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { fileToDataUri } from '@/firebase/storage-utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const formSchema = z.object({
  name: z.string().min(1, { message: 'Vendor name is required.' }),
  vendorType: z.string().min(1, { message: 'Vendor type is required.' }),
  dataSource: z.string().min(1, { message: 'Data source is required.' }),
  address: z.string().optional(),
  abn: z.string().optional(),
  logo: z.any().optional(),
  attachment: z.any().optional(),
  primaryContact: z.string().optional(),
  website: z.string().optional(),
  notes: z.string().optional(),
});

export default function AddDataConnectionPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);
    const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
    const { toast } = useToast();
    const firestore = useFirestore();

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
          name: '',
          vendorType: '',
          dataSource: '',
          address: '',
          abn: '',
          primaryContact: '',
          website: '',
          notes: '',
          logo: null,
          attachment: null,
        },
    });

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setIsLoading(true);
        try {
            const vendorsCollection = collection(firestore, 'data-warehouse');
            const newVendorRef = doc(vendorsCollection);

            const dataToCreate: { [key: string]: any } = {
                name: values.name,
                vendorType: values.vendorType,
                dataSource: values.dataSource,
                address: values.address || '',
                abn: values.abn || '',
                primaryContact: values.primaryContact || '',
                website: values.website || '',
                notes: values.notes || '',
                logoUrl: null,
                attachmentUrl: null,
                attachmentName: null,
            };

            if (values.logo instanceof File) {
                dataToCreate.logoUrl = await fileToDataUri(values.logo);
            }

            if (values.attachment instanceof File) {
                dataToCreate.attachmentUrl = await fileToDataUri(values.attachment);
                dataToCreate.attachmentName = values.attachment.name;
            }

            await setDoc(newVendorRef, dataToCreate).catch((serverError) => {
                const permissionError = new FirestorePermissionError({
                    path: newVendorRef.path,
                    operation: 'create',
                    requestResourceData: dataToCreate,
                });
                errorEmitter.emit('permission-error', permissionError);
                throw serverError;
            });
            
            toast({
                title: 'Vendor connection created',
                description: `${values.name} has been added successfully.`,
            });
            router.push('/data-connect');

        } catch (error: any) {
            console.error("Failed to create vendor connection:", error);
            toast({
                variant: 'destructive',
                title: 'Failed to create vendor connection',
                description: error.message || 'An unexpected error occurred.',
            });
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <AdminGuard>
            <div className="space-y-4">
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)}>
                        <div className="flex items-start justify-between">
                            <div>
                                <h1 className="text-2xl font-semibold">Connect to a New Vendor</h1>
                                <BreadcrumbNav />
                            </div>
                            <div className="flex gap-2">
                                <Button type="button" variant="outline" onClick={() => router.back()} disabled={isLoading}>Cancel</Button>
                                <Button type="submit" disabled={isLoading}>
                                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Create Connection
                                </Button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-4">
                            <div className="lg:col-span-2 space-y-8">
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Vendor Details</CardTitle>
                                        <CardDescription>Enter the primary information for the new vendor.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <FormField
                                                control={form.control}
                                                name="name"
                                                render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Vendor Name</FormLabel>
                                                    <FormControl>
                                                    <Input placeholder="e.g., Marine Data Solutions" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control}
                                                name="vendorType"
                                                render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Vendor Type</FormLabel>
                                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                        <SelectValue placeholder="Select a vendor type" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="Boat Brand">Boat Brand</SelectItem>
                                                        <SelectItem value="Motor Brand">Motor Brand</SelectItem>
                                                        <SelectItem value="Trailer Brand">Trailer Brand</SelectItem>
                                                        <SelectItem value="Electronics Brand">Electronics Brand</SelectItem>
                                                        <SelectItem value="Electronics Supplier">Electronics Supplier</SelectItem>
                                                        <SelectItem value="Parts Wholesaler">Parts Wholesaler</SelectItem>
                                                        <SelectItem value="Other">Other</SelectItem>
                                                    </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                                )}
                                            />
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <FormField
                                                control={form.control}
                                                name="primaryContact"
                                                render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Primary Contact</FormLabel>
                                                    <FormControl>
                                                    <Input placeholder="e.g., Jane Doe - jane@example.com" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control}
                                                name="website"
                                                render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Website</FormLabel>
                                                    <FormControl>
                                                    <Input placeholder="www.example.com" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                                )}
                                            />
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <FormField
                                                control={form.control}
                                                name="address"
                                                render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Address</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="456 Data Drive, Suite 200, Tech City" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control}
                                                name="abn"
                                                render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>ABN (Australian Business Number)</FormLabel>
                                                    <FormControl>
                                                    <Input placeholder="e.g., 12 345 678 901" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                                )}
                                            />
                                        </div>
                                        <FormField
                                            control={form.control}
                                            name="notes"
                                            render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Notes</FormLabel>
                                                <FormControl>
                                                    <Textarea
                                                    placeholder="e.g., Standard lead time is 2 weeks."
                                                    {...field}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                            )}
                                        />
                                    </CardContent>
                                </Card>
                            </div>

                             <div className="lg:col-span-1 space-y-8">
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Branding &amp; Attachments</CardTitle>
                                        <CardDescription>Upload logos and other relevant files.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-6">
                                        <FormField
                                            control={form.control}
                                            name="logo"
                                            render={({ field }) => (
                                                <FormItem>
                                                <FormLabel>Vendor Logo</FormLabel>
                                                {logoPreview && (
                                                    <div className="mt-2 w-32 h-32 relative">
                                                    <Image 
                                                        src={logoPreview} 
                                                        alt="Logo Preview" 
                                                        fill
                                                        className="rounded-md object-contain border p-1"
                                                    />
                                                    </div>
                                                )}
                                                <FormControl>
                                                    <Input 
                                                    type="file" 
                                                    accept="image/*"
                                                    onChange={(event) => {
                                                        const file = event.target.files?.[0];
                                                        field.onChange(file);
                                                        if (file) {
                                                        setLogoPreview(URL.createObjectURL(file));
                                                        } else {
                                                        setLogoPreview(null);
                                                        }
                                                    }}
                                                    />
                                                </FormControl>
                                                <FormDescription>
                                                    Upload the vendor's logo.
                                                </FormDescription>
                                                <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="attachment"
                                            render={({ field }) => (
                                                <FormItem>
                                                <FormLabel>File Attachment</FormLabel>
                                                {attachmentPreview && (
                                                    <div className="mt-2 text-sm text-muted-foreground p-2 bg-muted rounded-md">
                                                        Selected file: <strong>{attachmentPreview}</strong>
                                                    </div>
                                                )}
                                                <FormControl>
                                                    <Input 
                                                        type="file" 
                                                        onChange={(event) => {
                                                            const file = event.target.files?.[0];
                                                            field.onChange(file);
                                                            if (file) {
                                                                setAttachmentPreview(file.name);
                                                            } else {
                                                                setAttachmentPreview(null);
                                                            }
                                                        }}
                                                    />
                                                </FormControl>
                                                <FormDescription>
                                                    Upload any relevant file (e.g., contract, price list).
                                                </FormDescription>
                                                <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Data Source</CardTitle>
                                        <CardDescription>Select how data will be connected for this vendor.</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <FormField
                                            control={form.control}
                                            name="dataSource"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Data Source</FormLabel>
                                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                        <FormControl>
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Select a data source" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            <SelectItem value="Business Central">Business Central</SelectItem>
                                                            <SelectItem value="Direct API">Direct API</SelectItem>
                                                            <SelectItem value="Document Upload">Document Upload</SelectItem>
                                                            <SelectItem value="Other">Other</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                    </form>
                </Form>
            </div>
        </AdminGuard>
    );

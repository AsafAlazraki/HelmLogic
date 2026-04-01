'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useMemoFirebase, useCollection } from '@/firebase';
import { collection, doc, setDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BreadcrumbNav } from '@/components/breadcrumb-nav';
import AdminGuard from '@/components/admin-guard';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createSlug } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';

interface Vendor {
    id: string;
    name: string;
    logoUrl?: string;
}

const formSchema = z.object({
  name: z.string().min(1, { message: 'Module name is required.' }),
  mainVendorId: z.string().default(''),
  associatedVendorIds: z.array(z.string()).default([]),
});

export default function AddModulePage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [moduleType, setModuleType] = useState('catalog');
    const { toast } = useToast();
    const firestore = useFirestore();

    const vendorsQuery = useMemoFirebase(() => collection(firestore, 'data-warehouse'), [firestore]);
    const { data: vendors, loading: vendorsLoading } = useCollection<Vendor>(vendorsQuery);

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
          name: '',
          mainVendorId: '',
          associatedVendorIds: [],
        },
    });

    async function onSubmit(values: z.infer<typeof formSchema>) {
        if (moduleType === 'catalog' && !values.mainVendorId) {
            form.setError('mainVendorId', { message: 'A main vendor must be selected for catalog modules.' });
            return;
        }

        setIsLoading(true);
        try {
            const modulesCollection = collection(firestore, 'modules');
            const newModuleRef = doc(modulesCollection);
            const moduleId = newModuleRef.id;

            const mainVendor = vendors?.find(v => v.id === values.mainVendorId);

            const dataToCreate: { [key: string]: any } = {
                name: values.name,
                slug: createSlug(values.name),
                moduleType,
                mainVendorId: values.mainVendorId || null,
                associatedVendorIds: values.associatedVendorIds,
                logoUrl: mainVendor?.logoUrl || null,
            };

            await setDoc(newModuleRef, dataToCreate).catch((serverError) => {
                const permissionError = new FirestorePermissionError({
                    path: newModuleRef.path,
                    operation: 'create',
                    requestResourceData: dataToCreate,
                });
                errorEmitter.emit('permission-error', permissionError);
                throw serverError;
            });
            
            toast({
                title: 'Module Created',
                description: `${values.name} has been created successfully.`,
            });
            router.push('/modules');

        } catch (error: any) {
            console.error("Failed to create module:", error);
            toast({
                variant: 'destructive',
                title: 'Failed to create module',
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
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <div className="flex items-start justify-between">
                            <div>
                                <h1 className="text-2xl font-semibold">Add New Module</h1>
                                <BreadcrumbNav />
                            </div>
                            <div className="flex gap-2">
                                <Button type="button" variant="outline" onClick={() => router.back()} disabled={isLoading}>Cancel</Button>
                                <Button type="submit" disabled={isLoading || vendorsLoading}>
                                    {(isLoading || vendorsLoading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Create Module
                                </Button>
                            </div>
                        </div>

                         <Card>
                            <CardHeader>
                                <CardTitle>Module Details</CardTitle>
                                <CardDescription>Define the new module and its vendor relationships.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                 <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Module Name</FormLabel>
                                        <FormControl>
                                            <Input placeholder="e.g., Yamaha Outboard Quoting" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                    )}
                                />
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Module Type</Label>
                                    <Select value={moduleType} onValueChange={setModuleType}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select module type..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="catalog">Catalog Module (Boat Brand)</SelectItem>
                                            <SelectItem value="used-boats">Used Boats</SelectItem>
                                            <SelectItem value="website-listings">Website Listings</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground">Catalog modules have pricing, quoting, and stock management. Other types have custom functionality.</p>
                                </div>
                                <FormField
                                    control={form.control}
                                    name="mainVendorId"
                                    render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Main Vendor</FormLabel>
                                         <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select the main vendor for this module" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {vendors ? vendors.map(vendor => (
                                                    <SelectItem key={vendor.id} value={vendor.id}>{vendor.name}</SelectItem>
                                                )) : <SelectItem value="loading" disabled>Loading vendors...</SelectItem>}
                                            </SelectContent>
                                        </Select>
                                        <FormDescription>
                                            {moduleType === 'catalog'
                                                ? "The module will use this vendor's logo and primary identity."
                                                : "Not required for this module type."}
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="associatedVendorIds"
                                    render={() => (
                                        <FormItem>
                                            <div className="mb-4">
                                                <FormLabel>Associated Vendors</FormLabel>
                                                <FormDescription>Select other vendors whose data might be used in this module.</FormDescription>
                                            </div>
                                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                                {vendors ? vendors.map((vendor) => (
                                                <FormField
                                                    key={vendor.id}
                                                    control={form.control}
                                                    name="associatedVendorIds"
                                                    render={({ field }) => {
                                                    return (
                                                        <FormItem
                                                            key={vendor.id}
                                                            className="flex flex-row items-center space-x-3 space-y-0 p-3 border rounded-md"
                                                        >
                                                            <FormControl>
                                                                <Checkbox
                                                                    checked={field.value?.includes(vendor.id)}
                                                                    onCheckedChange={(checked) => {
                                                                        return checked
                                                                        ? field.onChange([...(field.value || []), vendor.id])
                                                                        : field.onChange(
                                                                            field.value?.filter(
                                                                                (value) => value !== vendor.id
                                                                            )
                                                                            )
                                                                    }}
                                                                />
                                                            </FormControl>
                                                            <FormLabel className="font-normal">{vendor.name}</FormLabel>
                                                        </FormItem>
                                                    )
                                                    }}
                                                />
                                                )) : <p>Loading vendors...</p>}
                                            </div>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                    />
                            </CardContent>
                         </Card>
                    </form>
                </Form>
            </div>
        </AdminGuard>
    );
}
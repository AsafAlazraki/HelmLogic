'use client';

import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState, useEffect } from 'react';
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
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase/provider';
import { doc, updateDoc } from 'firebase/firestore';
import { Loader2, Save } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BreadcrumbNav, type BreadcrumbPart } from '@/components/breadcrumb-nav';
import AdminGuard from '@/components/admin-guard';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useDoc } from '@/firebase/firestore/use-doc';
import { createSlug } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';


interface Vendor {
    id: string;
    name: string;
    logoUrl?: string;
}

const formSchema = z.object({
  name: z.string().min(1, { message: 'Module name is required.' }),
  mainVendorId: z.string().min(1, { message: 'A main vendor must be selected.' }),
  associatedVendorIds: z.array(z.string()).default([]),
});

export default function ModuleDetailsPage() {
    const router = useRouter();
    const params = useParams();
    const slugOrId = params.id as string;
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();
    const firestore = useFirestore();

    const { data: moduleData, loading: moduleLoading } = useDoc(`/modules/${slugOrId}`);
    const { data: vendors, loading: vendorsLoading } = useCollection<Vendor>('data-warehouse');

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
          name: '',
          mainVendorId: '',
          associatedVendorIds: [],
        },
    });

    useEffect(() => {
        if (moduleData) {
            form.reset(moduleData);
        }
    }, [moduleData, form]);

    async function onSubmit(values: z.infer<typeof formSchema>) {
        if (!moduleData) return;
        setIsLoading(true);
        try {
            const moduleRef = doc(firestore, 'modules', moduleData.id);

            const mainVendor = vendors?.find(v => v.id === values.mainVendorId);

            const dataToUpdate: { [key: string]: any } = {
                name: values.name,
                slug: createSlug(values.name),
                mainVendorId: values.mainVendorId,
                associatedVendorIds: values.associatedVendorIds,
                logoUrl: mainVendor?.logoUrl || null,
            };

            await updateDoc(moduleRef, dataToUpdate).catch((serverError) => {
                const permissionError = new FirestorePermissionError({
                    path: moduleRef.path,
                    operation: 'update',
                    requestResourceData: dataToUpdate,
                });
                errorEmitter.emit('permission-error', permissionError);
                throw serverError;
            });
            
            toast({
                title: 'Module Updated',
                description: `${values.name} has been updated successfully.`,
            });
            if (dataToUpdate.slug !== slugOrId) {
                router.replace(`/modules/${dataToUpdate.slug}`);
            }

        } catch (error: any) {
            console.error("Failed to update module:", error);
            toast({
                variant: 'destructive',
                title: 'Failed to update module',
                description: error.message || 'An unexpected error occurred.',
            });
        } finally {
            setIsLoading(false);
        }
    }

     const breadcrumbParts = useMemo((): BreadcrumbPart[] => {
        if (!moduleData) return [];
        return [
            { href: "/admin", label: "Admin" },
            { href: "/modules", label: "Modules" },
            { href: `/modules/${slugOrId}`, label: moduleData.name },
        ];
    }, [moduleData, slugOrId]);

    const loading = moduleLoading || vendorsLoading;

    if (loading) {
      return (
          <div className="flex justify-center items-center py-24"><Loader2 className="h-16 w-16 animate-spin text-primary" /></div>
      );
    }
    
    if (!moduleData) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Module Not Found</CardTitle>
                </CardHeader>
                <CardContent>
                    <p>The requested module could not be found.</p>
                </CardContent>
            </Card>
        );
    }


    return (
        <AdminGuard>
            <div className="space-y-4">
                 <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold">Module: {moduleData.name}</h1>
                        <BreadcrumbNav parts={breadcrumbParts} />
                    </div>
                </div>
                 <Tabs defaultValue="configuration">
                    <TabsList>
                        <TabsTrigger value="configuration">Configuration</TabsTrigger>
                        <TabsTrigger value="operations">Operations</TabsTrigger>
                        <TabsTrigger value="quotation">Quotation</TabsTrigger>
                    </TabsList>
                    <TabsContent value="configuration">
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between">
                                        <div>
                                            <CardTitle>Module Configuration</CardTitle>
                                            <CardDescription>Edit the module details and vendor relationships.</CardDescription>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button type="submit" disabled={isLoading}>
                                                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                <Save className="mr-2 h-4 w-4" /> Save Changes
                                            </Button>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="space-y-6">
                                        <FormField
                                            control={form.control}
                                            name="name"
                                            render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Module Name</FormLabel>
                                                <FormControl>
                                                    <Input {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="mainVendorId"
                                            render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Main Vendor</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select the main vendor" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {vendors ? vendors.map(vendor => (
                                                            <SelectItem key={vendor.id} value={vendor.id}>{vendor.name}</SelectItem>
                                                        )) : <SelectItem value="loading" disabled>Loading...</SelectItem>}
                                                    </SelectContent>
                                                </Select>
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
                                                        <FormDescription>Select other vendors used in this module.</FormDescription>
                                                    </div>
                                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                                        {vendors ? vendors.map((vendor) => (
                                                        <FormField
                                                            key={vendor.id}
                                                            control={form.control}
                                                            name="associatedVendorIds"
                                                            render={({ field }) => (
                                                                <FormItem className="flex items-center space-x-3 space-y-0 p-3 border rounded-md">
                                                                    <FormControl>
                                                                        <Checkbox
                                                                            checked={field.value?.includes(vendor.id)}
                                                                            onCheckedChange={(checked) => {
                                                                                return checked
                                                                                ? field.onChange([...(field.value || []), vendor.id])
                                                                                : field.onChange(field.value?.filter(v => v !== vendor.id))
                                                                            }}
                                                                        />
                                                                    </FormControl>
                                                                    <FormLabel className="font-normal">{vendor.name}</FormLabel>
                                                                </FormItem>
                                                            )}
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
                    </TabsContent>
                    <TabsContent value="operations">
                        <Card>
                             <CardHeader>
                                <CardTitle>Operations</CardTitle>
                                <CardDescription>Placeholder for operations functionality.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                 <p className="text-muted-foreground">This section will contain operations-related features for the {moduleData.name} module.</p>
                            </CardContent>
                        </Card>
                    </TabsContent>
                     <TabsContent value="quotation">
                        <Card>
                             <CardHeader>
                                <CardTitle>Quotation</CardTitle>
                                <CardDescription>Placeholder for quotation functionality.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <p className="text-muted-foreground">This section will contain quotation-related features for the {moduleData.name} module.</p>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </AdminGuard>
    );
}

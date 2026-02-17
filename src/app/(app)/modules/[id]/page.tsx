'use client';

import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';
import Link from 'next/link';

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
import { doc, updateDoc, collection, query, where, writeBatch } from 'firebase/firestore';
import { Loader2, Save, Sailboat } from 'lucide-react';
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
import { useUser } from '@/firebase/auth/use-user';

interface Vendor {
    id: string;
    name: string;
    logoUrl?: string;
    vendorType: string;
}

interface Organisation {
    id: string;
    name: string;
    enabledModuleSubscriptions?: string[];
}

interface Range {
    id: string;
    name: string;
    slug?: string;
    vendorId: string;
    imageUrl?: string;
    order?: number;
}

interface Module {
    id: string;
    name: string;
    slug?: string;
    mainVendorId: string;
    associatedVendorIds?: string[];
    logoUrl?: string;
}

const formSchema = z.object({
  name: z.string().min(1, { message: 'Module name is required.' }),
  mainVendorId: z.string().min(1, { message: 'A main vendor must be selected.' }),
  associatedVendorIds: z.array(z.string()).default([]),
});

function RangesGrid({ vendor }: { vendor: Vendor }) {
    const rangesQuery = useMemo(() => {
        return query(collection(useFirestore(), `data-warehouse/${vendor.id}/ranges`), orderBy('order'));
    }, [vendor.id]);

    const { data: ranges, loading: rangesLoading } = useCollection<Range>(rangesQuery);

    if (rangesLoading) {
        return <div className="flex justify-center items-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }
    
    if (!ranges || ranges.length === 0) {
        return <p className="text-muted-foreground text-center py-8">No product ranges found for {vendor.name}.</p>;
    }

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {ranges.map(range => (
                <Link key={range.id} href={`/data-warehouse/${vendor.id}/ranges/${range.slug || range.id}`} className="group">
                    <Card className="h-full transition-all duration-300 ease-in-out group-hover:border-primary group-hover:shadow-xl hover:-translate-y-1">
                        <div className="h-40 bg-secondary relative">
                            {range.imageUrl ? (
                                <Image src={range.imageUrl} alt={`${range.name} cover`} fill className="object-cover p-4" sizes="(max-width: 768px) 50vw, 25vw" />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center">
                                    <Sailboat className="h-12 w-12 text-muted-foreground" />
                                </div>
                            )}
                        </div>
                        <CardHeader>
                            <CardTitle className="text-lg">{range.name}</CardTitle>
                        </CardHeader>
                    </Card>
                </Link>
            ))}
        </div>
    );
}


export default function ModuleDetailsPage() {
    const router = useRouter();
    const params = useParams();
    const slugOrId = params.id as string;
    const [isLoading, setIsLoading] = useState(false);
    const [isSavingSubscriptions, setIsSavingSubscriptions] = useState(false);
    const { toast } = useToast();
    const firestore = useFirestore();

    // --- Data Fetching ---
    const { user, loading: userLoading } = useUser();
    const { data: userProfile, loading: profileLoading } = useDoc<{ appRole?: string }>(user ? `/users/${user.uid}` : null);
    
    const moduleQueryBySlug = useMemo(() => {
        if (!slugOrId) return null;
        return query(collection(firestore, 'modules'), where('slug', '==', slugOrId));
    }, [firestore, slugOrId]);

    const { data: modulesBySlug, loading: slugLoading } = useCollection<Module>(moduleQueryBySlug);
    const { data: moduleById, loading: idLoading } = useDoc<Module>(slugOrId ? `/modules/${slugOrId}` : null);
    
    const moduleData = useMemo(() => modulesBySlug?.[0] || moduleById, [modulesBySlug, moduleById]);
    const moduleLoading = slugLoading || idLoading;
    
    const { data: mainVendor, loading: mainVendorLoading } = useDoc<Vendor>(moduleData ? `/data-warehouse/${moduleData.mainVendorId}` : null);
    
    const { data: allVendors, loading: vendorsLoading } = useCollection<Vendor>('data-warehouse');
    const { data: allOrganisations, loading: orgsLoading } = useCollection<Organisation>('organisations');

    const [subscribedOrgs, setSubscribedOrgs] = useState<string[]>([]);
    
    const isAdmin = userProfile?.appRole === 'HelmLogic Admin';
    const isBoatBrand = mainVendor?.vendorType === 'Boat Brand';
    
    // --- Forms ---
    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: { name: '', mainVendorId: '', associatedVendorIds: [] },
    });

    // --- Effects ---
    useEffect(() => {
        if (moduleData) {
            form.reset(moduleData);
        }
    }, [moduleData, form]);

    useEffect(() => {
        if (allOrganisations && moduleData) {
            const subs = allOrganisations
                .filter(org => org.enabledModuleSubscriptions?.includes(moduleData.id))
                .map(org => org.id);
            setSubscribedOrgs(subs);
        }
    }, [allOrganisations, moduleData]);

    // --- Handlers ---
    async function onSettingsSubmit(values: z.infer<typeof formSchema>) {
        if (!moduleData) return;
        setIsLoading(true);
        try {
            const moduleRef = doc(firestore, 'modules', moduleData.id);
            const vendor = allVendors?.find(v => v.id === values.mainVendorId);
            const dataToUpdate = {
                name: values.name,
                slug: createSlug(values.name),
                mainVendorId: values.mainVendorId,
                associatedVendorIds: values.associatedVendorIds,
                logoUrl: vendor?.logoUrl || null,
            };

            await updateDoc(moduleRef, dataToUpdate);
            toast({ title: 'Module Updated' });
            if (dataToUpdate.slug !== slugOrId) {
                router.replace(`/modules/${dataToUpdate.slug}`);
            }
        } catch (error: any) {
            console.error("Failed to update module:", error);
            toast({ variant: 'destructive', title: 'Update Failed' });
        } finally {
            setIsLoading(false);
        }
    }
    
    const handleSubscriptionChange = (orgId: string, isSubscribed: boolean) => {
        setSubscribedOrgs(prev => 
            isSubscribed ? [...prev, orgId] : prev.filter(id => id !== orgId)
        );
    };

    const handleSaveSubscriptions = async () => {
        if (!allOrganisations || !moduleData) return;
        setIsSavingSubscriptions(true);
        const batch = writeBatch(firestore);

        allOrganisations.forEach(org => {
            const orgRef = doc(firestore, 'organisations', org.id);
            const currentSubs = org.enabledModuleSubscriptions || [];
            const shouldBeSubscribed = subscribedOrgs.includes(org.id);
            
            if (shouldBeSubscribed && !currentSubs.includes(moduleData.id)) {
                batch.update(orgRef, { enabledModuleSubscriptions: [...currentSubs, moduleData.id] });
            } else if (!shouldBeSubscribed && currentSubs.includes(moduleData.id)) {
                batch.update(orgRef, { enabledModuleSubscriptions: currentSubs.filter(id => id !== moduleData.id) });
            }
        });

        try {
            await batch.commit();
            toast({ title: "Subscriptions updated successfully." });
        } catch (error) {
            console.error("Failed to save subscriptions:", error);
            toast({ variant: "destructive", title: "Failed to save subscriptions." });
        } finally {
            setIsSavingSubscriptions(false);
        }
    };

    // --- Render Logic ---
    const loading = moduleLoading || mainVendorLoading || vendorsLoading || orgsLoading || userLoading || profileLoading;

    if (loading) {
      return <div className="flex justify-center items-center py-24"><Loader2 className="h-16 w-16 animate-spin text-primary" /></div>;
    }
    
    if (!moduleData) {
        return <Card><CardHeader><CardTitle>Module Not Found</CardTitle></CardHeader><CardContent><p>The requested module could not be found.</p></CardContent></Card>;
    }
    
    const breadcrumbParts = [
        { href: "/admin", label: "Admin" },
        { href: "/modules", label: "Modules" },
        { href: `/modules/${slugOrId}`, label: moduleData.name },
    ];

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
                    <TabsList className={isAdmin ? "grid w-full grid-cols-4" : "grid w-full grid-cols-3"}>
                        <TabsTrigger value="configuration">Configuration</TabsTrigger>
                        <TabsTrigger value="quotation">Quotation</TabsTrigger>
                        <TabsTrigger value="operations">Operations</TabsTrigger>
                        {isAdmin && <TabsTrigger value="settings">Settings</TabsTrigger>}
                    </TabsList>

                    <TabsContent value="configuration">
                       <Card>
                             <CardHeader>
                                <CardTitle>Module Configuration</CardTitle>
                                {isBoatBrand && mainVendor && <CardDescription>Viewing ranges for {mainVendor.name}.</CardDescription>}
                            </CardHeader>
                            <CardContent>
                                {isBoatBrand && mainVendor ? (
                                    <RangesGrid vendor={mainVendor} />
                                ) : (
                                    <p className="text-muted-foreground">This module's main vendor is not a boat brand. No range configuration available.</p>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="quotation">
                        <Card>
                            <CardHeader><CardTitle>Quotation</CardTitle><CardDescription>Placeholder for quotation functionality.</CardDescription></CardHeader>
                            <CardContent><p className="text-muted-foreground">This section will contain quotation-related features for the {moduleData.name} module.</p></CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="operations">
                        <Card>
                             <CardHeader><CardTitle>Operations</CardTitle><CardDescription>Placeholder for operations functionality.</CardDescription></CardHeader>
                            <CardContent><p className="text-muted-foreground">This section will contain operations-related features for the {moduleData.name} module.</p></CardContent>
                        </Card>
                    </TabsContent>

                    {isAdmin && (
                        <TabsContent value="settings" className="space-y-4">
                            <Form {...form}>
                                <form onSubmit={form.handleSubmit(onSettingsSubmit)}>
                                    <Card>
                                        <CardHeader className="flex flex-row items-center justify-between">
                                            <div>
                                                <CardTitle>Module Settings</CardTitle>
                                                <CardDescription>Edit the module details and vendor relationships.</CardDescription>
                                            </div>
                                            <div className="flex gap-2">
                                                <Button type="submit" disabled={isLoading}>
                                                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                                    Save Settings
                                                </Button>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="space-y-6">
                                            <FormField control={form.control} name="name" render={({ field }) => (
                                                <FormItem><FormLabel>Module Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                            )} />
                                            <FormField control={form.control} name="mainVendorId" render={({ field }) => (
                                                <FormItem><FormLabel>Main Vendor</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select the main vendor" /></SelectTrigger></FormControl><SelectContent>{allVendors ? allVendors.map(v => (<SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)) : <SelectItem value="loading" disabled>Loading...</SelectItem>}</SelectContent></Select><FormMessage /></FormItem>
                                            )} />
                                            <FormField control={form.control} name="associatedVendorIds" render={() => (
                                                <FormItem>
                                                    <div className="mb-4"><FormLabel>Associated Vendors</FormLabel><FormDescription>Select other vendors used in this module.</FormDescription></div>
                                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                                        {allVendors ? allVendors.map((vendor) => (
                                                            <FormField key={vendor.id} control={form.control} name="associatedVendorIds" render={({ field }) => (
                                                                <FormItem className="flex items-center space-x-3 space-y-0 p-3 border rounded-md">
                                                                    <FormControl><Checkbox checked={field.value?.includes(vendor.id)} onCheckedChange={(checked) => {return checked ? field.onChange([...(field.value || []), vendor.id]) : field.onChange(field.value?.filter(v => v !== vendor.id))}}/></FormControl>
                                                                    <FormLabel className="font-normal">{vendor.name}</FormLabel>
                                                                </FormItem>
                                                            )} />
                                                        )) : <p>Loading vendors...</p>}
                                                    </div>
                                                    <FormMessage />
                                                </FormItem>
                                            )} />
                                        </CardContent>
                                    </Card>
                                </form>
                            </Form>
                            <Card>
                                <CardHeader className="flex-row items-center justify-between">
                                    <div>
                                        <CardTitle>Subscribed Organisations</CardTitle>
                                        <CardDescription>Grant organisations access to this module.</CardDescription>
                                    </div>
                                    <Button onClick={handleSaveSubscriptions} disabled={isSavingSubscriptions}>
                                        {isSavingSubscriptions ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                                        Save Subscriptions
                                    </Button>
                                </CardHeader>
                                <CardContent className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                    {allOrganisations?.map(org => (
                                        <div key={org.id} className="flex items-center space-x-3 p-3 border rounded-md">
                                            <Checkbox 
                                                id={`org-${org.id}`}
                                                checked={subscribedOrgs.includes(org.id)}
                                                onCheckedChange={(checked) => handleSubscriptionChange(org.id, !!checked)}
                                            />
                                            <label htmlFor={`org-${org.id}`} className="font-normal text-sm">{org.name}</label>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        </TabsContent>
                    )}
                </Tabs>
            </div>
        </AdminGuard>
    );
}

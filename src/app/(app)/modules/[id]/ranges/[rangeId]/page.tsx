'use client';

import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState, useEffect } from 'react';
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
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { doc, updateDoc, collection, query, where, writeBatch, orderBy } from 'firebase/firestore';
import { Loader2, Save, Sailboat, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BreadcrumbNav, type BreadcrumbPart } from '@/components/breadcrumb-nav';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useDoc } from '@/firebase/firestore/use-doc';
import { createSlug } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUser } from '@/firebase/auth/use-user';
import { StabicraftModelEditor } from '@/components/stabicraft-model-editor';
import { HighfieldModelEditor } from '@/components/highfield-model-editor';
import { JeanneauModelEditor } from '@/components/jeanneau-model-editor';
import { StacerModelEditor } from '@/components/stacer-model-editor';
import { SurteesModelEditor } from '@/components/surtees-model-editor';

interface Vendor {
    id: string;
    name: string;
    logoUrl?: string;
    vendorType: string;
    slug?: string;
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

interface Model {
  id: string;
  name: string;
  slug?: string;
  coverImageUrl?: string;
  order?: number;
  [key: string]: any;
}

const formSchema = z.object({
  name: z.string().min(1, { message: 'Module name is required.' }),
  mainVendorId: z.string().min(1, { message: 'A main vendor must be selected.' }),
  associatedVendorIds: z.array(z.string()).default([]),
});

function RangesGrid({ vendor, onRangeSelect }: { vendor: Vendor; onRangeSelect: (range: Range) => void }) {
    const firestore = useFirestore();
    const rangesQuery = useMemoFirebase(() => {
        if (!vendor?.id) return null;
        return query(collection(firestore, `data-warehouse/${vendor.id}/ranges`), orderBy('order'));
    }, [firestore, vendor.id]);

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
                <div key={range.id} className="group cursor-pointer" onClick={() => onRangeSelect(range)}>
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
                </div>
            ))}
        </div>
    );
}

function ModelsGrid({ range, vendor, onModelSelect }: { range: Range; vendor: Vendor; onModelSelect: (model: Model) => void }) {
    const firestore = useFirestore();
    const modelsQuery = useMemoFirebase(() => {
        if (!vendor?.id || !range?.id) return null;
        return collection(firestore, `data-warehouse/${vendor.id}/ranges/${range.id}/models`);
    }, [firestore, vendor.id, range.id]);
    
    const { data: models, loading: modelsLoading } = useCollection<Model>(modelsQuery);
    
    if (modelsLoading) {
        return <div className="flex justify-center items-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }
    
    if (!models || models.length === 0) {
        return <p className="text-muted-foreground text-center py-8">No models found for {range.name}.</p>;
    }
    
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {models.map(model => (
                <div key={model.id} className="group cursor-pointer" onClick={() => onModelSelect(model)}>
                    <Card className="h-full transition-all duration-300 ease-in-out group-hover:border-primary group-hover:shadow-xl hover:-translate-y-1 flex flex-col">
                         <div className="h-52 bg-secondary relative">
                            {model.coverImageUrl ? (
                                <Image src={model.coverImageUrl} alt={`${model.name} cover`} fill className="object-cover" />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center">
                                    <Sailboat className="h-12 w-12 text-muted-foreground" />
                                </div>
                            )}
                        </div>
                        <CardHeader className="flex-grow flex items-center justify-center">
                            <CardTitle className="text-lg text-center">{model.name}</CardTitle>
                        </CardHeader>
                    </Card>
                </div>
            ))}
        </div>
    );
}

function ModuleBreadcrumbs({ module, range, model, onBreadcrumbClick }: { module: any; range: Range | null; model: Model | null; onBreadcrumbClick: (level: 'module' | 'range') => void }) {
    return (
        <div className="flex items-center text-sm text-muted-foreground mt-2">
            <button type="button" className="hover:text-primary" onClick={() => onBreadcrumbClick('module')}>{module.name}</button>
            {range && (
                <>
                    <ChevronRight className="h-4 w-4 mx-1" />
                    <button type="button" className="hover:text-primary" onClick={() => onBreadcrumbClick('range')}>{range.name}</button>
                </>
            )}
            {model && (
                <>
                    <ChevronRight className="h-4 w-4 mx-1" />
                    <span className="font-medium text-foreground">{model.name}</span>
                </>
            )}
        </div>
    );
}


export default function ModuleDetailsPage() {
    const router = useRouter();
    const params = useParams();
    const slugOrId = params.id as string;
    const [isLoading, setIsLoading] = useState(false);
    const [isSavingSubscriptions, setIsSavingSubscriptions] = useState(false);
    const [selectedRange, setSelectedRange] = useState<Range | null>(null);
    const [selectedModel, setSelectedModel] = useState<Model | null>(null);
    const { toast } = useToast();
    const firestore = useFirestore();

    const { user, loading: userLoading } = useUser();
    const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
    const { data: userProfile, loading: profileLoading } = useDoc<{ appRole?: string }>(userProfileRef);
    
    const moduleQueryBySlug = useMemoFirebase(() => {
        if (!slugOrId) return null;
        return query(collection(firestore, 'modules'), where('slug', '==', slugOrId));
    }, [firestore, slugOrId]);

    const { data: modulesBySlug, loading: slugLoading } = useCollection<any>(moduleQueryBySlug);
    
    const moduleByIdRef = useMemoFirebase(() => 
        slugOrId ? doc(firestore, 'modules', slugOrId) : null,
    [firestore, slugOrId]);
    
    const { data: moduleById, loading: idLoading } = useDoc<any>(moduleByIdRef);
    
    const moduleData = useMemo(() => modulesBySlug?.[0] || moduleById, [modulesBySlug, moduleById]);
    const moduleLoading = slugLoading || idLoading;
    
    const mainVendorRef = useMemoFirebase(() => 
        moduleData ? doc(firestore, 'data-warehouse', moduleData.mainVendorId) : null,
    [firestore, moduleData]);
    
    const { data: mainVendor, loading: mainVendorLoading } = useDoc<Vendor>(mainVendorRef);
    
    const { data: allVendors, loading: vendorsLoading } = useCollection<Vendor>(useMemoFirebase(() => collection(firestore, 'data-warehouse'), [firestore]));
    const { data: allOrganisations, loading: orgsLoading } = useCollection<Organisation>(useMemoFirebase(() => collection(firestore, 'organisations'), [firestore]));

    const [subscribedOrgs, setSubscribedOrgs] = useState<string[]>([]);
    
    const isAdmin = userProfile?.appRole === 'HelmLogic Admin';
    const isBoatBrand = mainVendor?.vendorType === 'Boat Brand';
    
    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: { name: '', mainVendorId: '', associatedVendorIds: [] },
    });

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
    
    const handleRangeSelect = (range: Range) => {
        setSelectedRange(range);
        setSelectedModel(null);
    };
    
    const handleModelSelect = (model: Model) => {
        setSelectedModel(model);
    };
    
    const handleBreadcrumbClick = (level: 'module' | 'range') => {
        if (level === 'module') {
            setSelectedRange(null);
            setSelectedModel(null);
        } else if (level === 'range') {
            setSelectedModel(null);
        }
    };

    const loading = moduleLoading || mainVendorLoading || vendorsLoading || orgsLoading || userLoading || profileLoading;

    if (loading) {
      return <div className="flex justify-center items-center py-24"><Loader2 className="h-16 w-16 animate-spin text-primary" /></div>;
    }
    
    if (!moduleData) {
        return <Card><CardHeader><CardTitle>Module Not Found</CardTitle></CardHeader><CardContent><p>The requested module could not be found.</p></CardContent></Card>;
    }
    
    const breadcrumbParts = [
        isAdmin ? { href: "/admin", label: "Admin" } : { href: "/dashboard", label: "Dashboard"},
        isAdmin ? { href: "/modules", label: "Modules" } : {href: "/dashboard", label: "Dashboard"},
        { href: `/modules/${slugOrId}`, label: moduleData.name },
    ];
    
    const getModelEditor = () => {
        if (!selectedModel || !mainVendor || !selectedRange) return <p>Select a model to view details.</p>;
        const modelDocPath = `/data-warehouse/${mainVendor.id}/ranges/${selectedRange.id}/models/${selectedModel.id}`;

        switch (mainVendor.slug) {
            case 'highfield': return <HighfieldModelEditor model={selectedModel} vendorId={mainVendor.id} rangeId={selectedRange.id} isModuleView={true} />;
            case 'jeanneau': return <JeanneauModelEditor model={selectedModel} isModuleView={true} />;
            case 'stacer': return <StacerModelEditor model={selectedModel} isModuleView={true} />;
            case 'stabicraft': return <StabicraftModelEditor model={selectedModel} isModuleView={true} />;
            case 'surtees': return <SurteesModelEditor model={selectedModel} isModuleView={true} />;
            default: return <Card><CardHeader><CardTitle>Editor Not Available</CardTitle></CardHeader><CardContent>A specific editor has not been configured for this vendor.</CardContent></Card>;
        }
    };

    return (
        <div className="space-y-4">
             <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">Module: {moduleData.name}</h1>
                    <BreadcrumbNav parts={breadcrumbParts.filter(p => isAdmin || p.label !== 'Modules')} />
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
                            <CardTitle>
                                {selectedModel && selectedRange
                                    ? <span>{selectedRange.name} <span className="text-muted-foreground font-normal">›</span> {selectedModel.name}</span>
                                    : selectedRange
                                    ? selectedRange.name
                                    : 'Module Configuration'}
                            </CardTitle>
                            {mainVendor && <ModuleBreadcrumbs module={moduleData} range={selectedRange} model={selectedModel} onBreadcrumbClick={handleBreadcrumbClick} />}
                        </CardHeader>
                        <CardContent>
                            {isBoatBrand && mainVendor ? (
                                <>
                                    {!selectedRange ? (
                                        <RangesGrid vendor={mainVendor} onRangeSelect={handleRangeSelect} />
                                    ) : !selectedModel ? (
                                        <ModelsGrid range={selectedRange} vendor={mainVendor} onModelSelect={handleModelSelect} />
                                    ) : (
                                        getModelEditor()
                                    )}
                                </>
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
    );
}

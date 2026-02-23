'use client';

import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState, useEffect } from 'react';
import Image from 'next/image';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { collection, query, where, orderBy, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { 
    Loader2, 
    ChevronRight, 
    Wrench, 
    FileText, 
    ClipboardList, 
    Save, 
    Building, 
    Settings2, 
    Users, 
    Eye, 
    ArrowRightLeft, 
    X, 
    LayoutDashboard,
    PlusCircle,
    Pencil,
    Trash2
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BreadcrumbNav } from '@/components/breadcrumb-nav';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useDoc } from '@/firebase/firestore/use-doc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUser } from '@/firebase/auth/use-user';
import { ModelConfigurationEditor } from '@/components/model-configuration-editor';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { createSlug, cn } from '@/lib/utils';
import { OrganisationModuleConfig } from '@/components/organisation-module-config';
import { InventoryList } from '@/components/inventory-list';
import { VesselOnOrderList } from '@/components/vessel-on-order-list';
import { Label } from '@/components/ui/label';

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
    primaryLogoUrl?: string;
    enabledModuleSubscriptions?: string[];
    moduleAssociatedVendorAccess?: Record<string, string[]>;
    dealerFitCategories?: string[];
    subDealersEnabled?: boolean;
    parentOrganisationId?: string;
    permissions?: Record<string, Record<string, boolean>>;
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
  modelCode?: string;
  slug?: string;
  coverImageUrl?: string;
  order?: number;
  packageLevels?: { id: string; name: string }[];
  [key: string]: any;
}

interface DealerFitCategory {
    id: string;
    name: string;
}

const packageFormSchema = z.object({
    name: z.string().min(1, { message: "Package name is required." }),
});
type PackageFormData = z.infer<typeof packageFormSchema>;

function PackageDialog({
    isOpen,
    setIsOpen,
    onSave,
    editingPackage
}: {
    isOpen: boolean,
    setIsOpen: (isOpen: boolean) => void,
    onSave: (data: PackageFormData) => void,
    editingPackage: { id: string; name: string } | null
}) {
    const form = useForm<PackageFormData>({
        resolver: zodResolver(packageFormSchema),
        defaultValues: { name: '' },
    });
    
    useEffect(() => {
        if (isOpen) {
            form.reset({ name: editingPackage?.name || '' });
        }
    }, [isOpen, editingPackage, form]);

    const handleSave = (data: PackageFormData) => {
        onSave(data);
        setIsOpen(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{editingPackage ? 'Edit Package' : 'Add New Package'}</DialogTitle>
                </DialogHeader>
                 <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSave)}>
                        <div className="grid gap-4 py-4">
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <Label htmlFor="name">Package Name</Label>
                                        <FormControl>
                                            <Input id="name" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button type="button" variant="outline">Cancel</Button>
                            </DialogClose>
                            <Button type="submit">Save</Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}

function ModelsGrid({ range, vendor, onModelSelect, isAdmin }: { range: Range; vendor: Vendor; onModelSelect: (model: Model) => void; isAdmin: boolean }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const modelsQuery = useMemoFirebase(() => {
        if (!vendor?.id || !range?.id) return null;
        return query(collection(firestore, `data-warehouse/${vendor.id}/ranges/${range.id}/models`), orderBy('order'));
    }, [firestore, vendor.id, range.id]);
    
    const { data: models, loading: modelsLoading } = useCollection<Model>(modelsQuery);

    const [isPackageDialogOpen, setIsPackageDialogOpen] = useState(false);
    const [selectedModelForPackage, setSelectedModelForPackage] = useState<Model | null>(null);
    const [editingPackage, setEditingPackage] = useState<{ id: string; name: string } | null>(null);
    
    if (modelsLoading) {
        return <div className="flex justify-center items-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }
    
    if (!models || models.length === 0) {
        return <p className="text-muted-foreground text-center py-8">No models found for {range.name}.</p>;
    }

    const handleOpenAddPackageDialog = (model: Model, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setSelectedModelForPackage(model);
        setEditingPackage(null);
        setIsPackageDialogOpen(true);
    };

    const handleOpenEditPackageDialog = (model: Model, pkg: {id: string, name: string}, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setSelectedModelForPackage(model);
        setEditingPackage(pkg);
        setIsPackageDialogOpen(true);
    };

    const handleSavePackage = async (data: PackageFormData) => {
        if (!selectedModelForPackage) return;
        
        let updatedPackages;
        const currentPackages = selectedModelForPackage.packageLevels || [];
        if (editingPackage) {
            updatedPackages = currentPackages.map(p => p.id === editingPackage.id ? { ...p, name: data.name } : p);
        } else {
            const newPackage = { id: `pkg-lvl-${Date.now()}`, name: data.name };
            updatedPackages = [...currentPackages, newPackage];
        }

        try {
            const modelPath = `data-warehouse/${vendor.id}/ranges/${range.id}/models/${selectedModelForPackage.id}`;
            await updateDoc(doc(firestore, modelPath), { packageLevels: updatedPackages });
            toast({ title: "Package Updated" });
        } catch(error) {
            console.error('Failed to save package:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not save package.' });
        }
    };

    const handleDeletePackage = async (model: Model, packageId: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const updatedPackages = model.packageLevels?.filter(p => p.id !== packageId) || [];
        try {
            const modelPath = `data-warehouse/${vendor.id}/ranges/${range.id}/models/${model.id}`;
            await updateDoc(doc(firestore, modelPath), { packageLevels: updatedPackages });
            toast({ title: 'Package Deleted' });
        } catch(error) {
            console.error('Failed to delete package:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not delete package.' });
        }
    };
    
    return (
        <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {models.map(model => (
                    <Card key={model.id} className="group overflow-hidden flex flex-col h-full transition-all duration-300 ease-in-out hover:border-primary hover:shadow-xl hover:-translate-y-1 cursor-pointer" onClick={() => onModelSelect(model)}>
                        <div className="flex-grow">
                            <div className="h-52 bg-secondary relative">
                                    {model.coverImageUrl ? (
                                    <Image src={model.coverImageUrl} alt={`${model.name} cover`} fill className="object-cover" />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center">
                                        <Wrench className="h-12 w-12 text-muted-foreground" />
                                    </div>
                                )}
                            </div>
                            <CardContent className="p-3 h-24 flex flex-col items-center justify-center gap-1">
                                <p className="font-semibold text-center line-clamp-2">{model.name}</p>
                                {model.modelCode && <p className="text-[10px] font-mono text-muted-foreground uppercase bg-muted px-1.5 py-0.5 rounded">{model.modelCode}</p>}
                            </CardContent>
                        </div>

                        {vendor.slug === 'stabicraft' && (
                            <div className="p-3 border-t">
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center mb-2">
                                        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider text-[10px]">Packages</h4>
                                        {isAdmin && (
                                            <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-accent hover:text-accent-foreground" onClick={(e) => handleOpenAddPackageDialog(model, e)}>
                                                <PlusCircle className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                    <div className="space-y-1 min-h-[80px] flex flex-col">
                                        {(model.packageLevels && model.packageLevels.length > 0) ? (
                                            <div className="flex-grow space-y-1">
                                            {model.packageLevels.map(pkg => (
                                                <div key={pkg.id} className="group/pkg flex items-center justify-between rounded-md bg-secondary text-secondary-foreground px-3 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground w-full">
                                                    <span className="font-medium truncate pr-2">{pkg.name}</span>
                                                    {isAdmin && (
                                                        <div className="flex items-center opacity-0 group-hover/pkg:opacity-100 transition-opacity -mr-2 shrink-0">
                                                            <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-accent hover:text-accent-foreground" onClick={(e) => handleOpenEditPackageDialog(model, pkg, e)}>
                                                                <Pencil className="h-3.5 w-3.5" />
                                                            </Button>
                                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={(e) => handleDeletePackage(model, pkg.id, e)}>
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                            </div>
                                        ) : (
                                            <div className="flex-grow flex items-center justify-center text-[10px] text-muted-foreground border border-dashed rounded-md">
                                                <p>No packages defined.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </Card>
                ))}
            </div>
            
            <PackageDialog
                isOpen={isPackageDialogOpen}
                setIsOpen={setIsPackageDialogOpen}
                onSave={handleSavePackage}
                editingPackage={editingPackage}
            />
        </>
    );
}

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
                                <div className="relative h-full w-full">
                                    <Image src={range.imageUrl} alt={`${range.name} cover`} fill className="object-cover p-4" sizes="(max-width: 768px) 50vw, 25vw" />
                                </div>
                            ) : (
                                <div className="flex h-full w-full items-center justify-center">
                                    <Wrench className="h-12 w-12 text-muted-foreground" />
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

const formSchema = z.object({
  name: z.string().min(1, { message: 'Module name is required.' }),
  mainVendorId: z.string().min(1, { message: 'A main vendor must be selected.' }),
  associatedVendorIds: z.array(z.string()).default([]),
});

function ModuleConfigurationBreadcrumbs({ module, range, model, view, onBreadcrumbClick }: { module: any; range: Range | null; model: Model | null; view: 'ranges' | 'models' | 'bmt' | 'quote' | 'operations', onBreadcrumbClick: (level: 'ranges' | 'models') => void }) {
    return (
        <div className="flex items-center text-sm text-muted-foreground">
            <button type="button" className="hover:text-primary" onClick={() => onBreadcrumbClick('ranges')}>{module.name}</button>
            {range && (view === 'models' || view === 'bmt' || view === 'quote' || view === 'operations') && (
                <>
                    <ChevronRight className="h-4 w-4 mx-1" />
                    <button type="button" className="hover:text-primary" onClick={() => onBreadcrumbClick('models')}>{range.name}</button>
                </>
            )}
            {model && (view === 'bmt' || view === 'quote' || view === 'operations') && (
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
    const { toast } = useToast();
    const firestore = useFirestore();

    const [view, setView] = useState<'ranges' | 'models' | 'bmt' | 'quote' | 'operations'>('ranges');
    const [selectedRange, setSelectedRange] = useState<Range | null>(null);
    const [selectedModel, setSelectedModel] = useState<Model | null>(null);
    const [isChoiceDialogOpen, setIsChoiceDialogOpen] = useState(false);
    
    const [isSavingModule, setIsSavingModule] = useState(false);
    const [isSavingSubscriptions, setIsSavingSubscriptions] = useState(false);
    const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
    const [viewContextOrgId, setViewContextOrgId] = useState<string | null>(null);
    const [tempSubscribedOrgIds, setTempSubscribedOrgIds] = useState<string[]>([]);
    
    const [inStockFilter, setInStockFilter] = useState<string>('all');

    const { user, loading: userLoading } = useUser();
    const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
    const { data: userProfile, loading: profileLoading } = useDoc<{ appRole?: string, organisationId?: string, organisationRole?: string }>(userProfileRef);
    
    const isAdmin = userProfile?.appRole === 'HelmLogic Admin';

    const moduleQueryBySlug = useMemoFirebase(() => {
        if (!slugOrId) return null;
        return query(collection(firestore, 'modules'), where('slug', '==', slugOrId));
    }, [firestore, slugOrId]);

    const { data: modulesBySlug, loading: slugLoading } = useCollection<any>(moduleQueryBySlug);
    const moduleByIdRef = useMemoFirebase(() => slugOrId ? doc(firestore, 'modules', slugOrId) : null, [firestore, slugOrId]);
    const { data: moduleById, loading: idLoading } = useDoc<any>(moduleByIdRef);
    
    const moduleData = useMemo(() => modulesBySlug?.[0] || moduleById, [modulesBySlug, moduleById]);
    const moduleLoading = slugLoading || idLoading;
    
    const vendorsQuery = useMemoFirebase(() => collection(firestore, 'data-warehouse'), [firestore]);
    const orgsQuery = useMemoFirebase(() => collection(firestore, 'organisations'), [firestore]);
    const catsQuery = useMemoFirebase(() => collection(firestore, 'dealerFitCategories'), [firestore]);

    const { data: allVendors, loading: vendorsLoading } = useCollection<Vendor>(vendorsQuery);
    const { data: allOrganisations, loading: orgsLoading } = useCollection<Organisation>(orgsQuery);
    const { data: allDealerFitCategories, loading: catsLoading } = useCollection<DealerFitCategory>(catsQuery);
    
    const mainVendorRef = useMemoFirebase(() => 
        moduleData ? doc(firestore, 'data-warehouse', moduleData.mainVendorId) : null,
    [firestore, moduleData]);
    
    const { data: mainVendor, loading: mainVendorLoading } = useDoc<Vendor>(mainVendorRef);
        
    const currentMemberOrg = useMemo(() => 
        userProfile?.organisationId ? allOrganisations?.find(o => o.id === userProfile.organisationId) : null,
    [userProfile?.organisationId, allOrganisations]);

    const dashboardOrg = useMemo(() => 
        viewContextOrgId ? allOrganisations?.find(o => o.id === viewContextOrgId) : currentMemberOrg,
    [viewContextOrgId, allOrganisations, currentMemberOrg]);

    const isViewingOrg = !!dashboardOrg;

    const parentOrg = useMemo(() => 
        dashboardOrg?.parentOrganisationId ? allOrganisations?.find(o => o.id === dashboardOrg.parentOrganisationId) : null,
    [dashboardOrg, allOrganisations]);

    const dashboardSubDealers = useMemo(() => {
        if (!dashboardOrg || !allOrganisations) return [];
        return allOrganisations.filter(o => o.parentOrganisationId === dashboardOrg.id);
    }, [dashboardOrg, allOrganisations]);

    // Permissions logic
    const userPermissions = useMemo(() => {
        if (isAdmin) return {
            can_access_module: true,
            can_create_quotes: true,
            can_edit_boat_data: true,
            can_view_subdealers: true,
            can_see_parent_inventory: true,
            can_access_settings: true,
        };
        const roleId = userProfile?.organisationRole;
        if (!roleId || !currentMemberOrg?.permissions?.[roleId]) return {
            can_access_module: false,
            can_create_quotes: false,
            can_edit_boat_data: false,
            can_view_subdealers: false,
            can_see_parent_inventory: false,
            can_access_settings: false,
        };
        return currentMemberOrg.permissions[roleId];
    }, [isAdmin, userProfile, currentMemberOrg]);

    const availableContexts = useMemo(() => {
        const contexts = [];
        if (isAdmin) {
            contexts.push({ id: 'master', name: 'Master Data (Global)' });
            allOrganisations?.forEach(org => contexts.push({ id: org.id, name: org.name }));
        } else if (userProfile?.organisationId) {
            const myOrg = allOrganisations?.find(o => o.id === userProfile.organisationId);
            if (myOrg) {
                contexts.push({ id: myOrg.id, name: `My Org: ${myOrg.name}` });
            }
            if (userPermissions.can_view_subdealers) {
                const subDealers = allOrganisations?.filter(org => org.parentOrganisationId === userProfile.organisationId) || [];
                subDealers.forEach(sd => contexts.push({ id: sd.id, name: `Sub Dealer: ${sd.name}` }));
            }
        }
        return contexts;
    }, [isAdmin, allOrganisations, userProfile, userPermissions]);

    // Tab control state
    const [activeTab, setActiveTab] = useState('dashboard');

    useEffect(() => {
        if (isAdmin) {
            if (viewContextOrgId) {
                setActiveTab('dashboard');
            } else {
                setActiveTab('bmt');
            }
        }
    }, [viewContextOrgId, isAdmin]);

    const settingsForm = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: { name: '', mainVendorId: '', associatedVendorIds: [] },
    });

    useEffect(() => {
        if (moduleData) {
            settingsForm.reset({
                name: moduleData.name,
                mainVendorId: moduleData.mainVendorId,
                associatedVendorIds: moduleData.associatedVendorIds || [],
            });
        }
    }, [moduleData, settingsForm]);

    async function onSettingsSubmit(values: z.infer<typeof formSchema>) {
        if (!moduleData) return;
        setIsSavingModule(true);
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
            toast({ variant: 'destructive', title: 'Update Failed' });
        } finally {
            setIsSavingModule(false);
        }
    }

    const handleSaveSubscriptions = async () => {
        if (!allOrganisations || !moduleData) return;
        setIsSavingSubscriptions(true);
        const batch = writeBatch(firestore);

        allOrganisations.forEach(org => {
            const orgRef = doc(firestore, 'organisations', org.id);
            const currentSubs = org.enabledModuleSubscriptions || [];
            const shouldBeSubscribed = tempSubscribedOrgIds.includes(org.id);
            
            if (shouldBeSubscribed && !currentSubs.includes(moduleData.id)) {
                batch.update(orgRef, { enabledModuleSubscriptions: [...currentSubs, moduleData.id] });
            } else if (!shouldBeSubscribed && currentSubs.includes(moduleData.id)) {
                batch.update(orgRef, { enabledModuleSubscriptions: currentSubs.filter(id => id !== moduleData.id) });
            }
        });

        try {
            await batch.commit();
            toast({ title: "Subscriptions updated." });
        } catch (error) {
            toast({ variant: "destructive", title: "Failed to save subscriptions." });
        } finally {
            setIsSavingSubscriptions(false);
        }
    };

    const handleUpdateOrgVendorAccess = async (targetId: string, vendorIds: string[]) => {
        if (!targetId) return;
        try {
            const orgRef = doc(firestore, 'organisations', targetId);
            await updateDoc(orgRef, {
                [`moduleAssociatedVendorAccess.${moduleData.id}`]: vendorIds
            });
            toast({ title: "Vendor access updated." });
        } catch (error) {
            toast({ variant: "destructive", title: "Failed to update access." });
        }
    };

    const handleUpdateOrgCategories = async (targetId: string, catIds: string[]) => {
        if (!targetId) return;
        try {
            const orgRef = doc(firestore, 'organisations', targetId);
            await updateDoc(orgRef, {
                dealerFitCategories: catIds
            });
            toast({ title: "Dealer fit options updated." });
        } catch (error) {
            toast({ variant: "destructive", title: "Failed to update categories." });
        }
    };

    const handleToggleModuleAccess = async (orgId: string, hasAccess: boolean) => {
        if (!moduleData) return;
        try {
            const org = allOrganisations?.find(o => o.id === orgId);
            if (!org) return;
            const currentSubs = org.enabledModuleSubscriptions || [];
            const newSubs = hasAccess 
                ? [...new Set([...currentSubs, moduleData.id])]
                : currentSubs.filter(id => id !== moduleData.id);
            
            await updateDoc(doc(firestore, 'organisations', orgId), {
                enabledModuleSubscriptions: newSubs
            });
            toast({ title: hasAccess ? "Access granted" : "Access revoked" });
        } catch (error) {
            toast({ variant: 'destructive', title: "Update failed" });
        }
    };

    const handleRangeSelect = (range: Range) => {
        setSelectedRange(range);
        setView('models');
    };
    
    const handleModelSelect = (model: Model) => {
        setSelectedModel(model);
        setIsChoiceDialogOpen(true);
    };

    const handleChoiceSelect = (choice: 'bmt' | 'quote' | 'operations') => {
        setView(choice);
        setIsChoiceDialogOpen(false);
    };
    
    const handleBreadcrumbClick = (level: 'ranges' | 'models') => {
        if (level === 'ranges') {
            setView('ranges');
            setSelectedRange(null);
            setSelectedModel(null);
        } else if (level === 'models') {
            setView('models');
            setSelectedModel(null);
        }
    };
    
    const loading = moduleLoading || mainVendorLoading || vendorsLoading || orgsLoading || userLoading || profileLoading || catsLoading;

    if (loading) {
      return <div className="flex justify-center items-center py-24"><Loader2 className="h-16 w-16 animate-spin text-primary" /></div>;
    }
    
    if (!moduleData) {
        return <Card><CardHeader><CardTitle>Module Not Found</CardTitle></CardHeader></Card>;
    }

    if (!userPermissions.can_access_module) {
        return <Card><CardHeader><CardTitle>Access Denied</CardTitle><CardDescription>Your role does not have permission to access modules. Please contact your administrator.</CardDescription></CardHeader></Card>;
    }
    
    const breadcrumbParts = [
        isAdmin ? { href: "/admin", label: "Admin" } : { href: "/dashboard", label: "Dashboard"},
        isAdmin ? { href: "/modules", label: "Modules" } : {href: "/dashboard", label: "Dashboard"},
        { href: `/modules/${slugOrId}`, label: moduleData.name },
    ];

    const currentContextLabel = availableContexts.find(c => c.id === (viewContextOrgId || 'master'))?.name || 'Master Data';
    const isImpersonating = viewContextOrgId !== null && (isAdmin || viewContextOrgId !== userProfile?.organisationId);
    
    const showSubDealersTab = isViewingOrg && dashboardOrg?.subDealersEnabled && userPermissions.can_view_subdealers;
    const tabGridCols = (isAdmin && !viewContextOrgId) ? "grid-cols-4" : showSubDealersTab ? "grid-cols-5" : "grid-cols-4";

    return (
        <div className="space-y-4">
             <div className="flex items-start justify-between">
                <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                        <h1 className="text-2xl font-semibold">Module: {moduleData.name}</h1>
                        <div className="flex items-center gap-2">
                            {isAdmin && (
                                <>
                                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Viewing As:</span>
                                    <Select 
                                        value={viewContextOrgId || 'master'} 
                                        onValueChange={(val) => setViewContextOrgId(val === 'master' ? null : val)}
                                    >
                                        <SelectTrigger className={cn("w-[220px] h-9 hover:bg-accent hover:text-accent-foreground transition-colors", isImpersonating && "border-primary ring-1 ring-primary bg-primary/5")}>
                                            <Eye className="h-4 w-4 mr-2" />
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableContexts.map(ctx => (
                                                <SelectItem key={ctx.id} value={ctx.id}>{ctx.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </>
                            )}
                            {!isAdmin && isImpersonating && (
                                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold border border-primary/20">
                                    <Eye className="h-3 w-3" /> 
                                    PREVIEWING AS {currentContextLabel.toUpperCase()}
                                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0 ml-2" onClick={() => setViewContextOrgId(userProfile?.organisationId || null)}>
                                        <X className="h-3 w-3" />
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                    <BreadcrumbNav parts={breadcrumbParts.filter(p => isAdmin || p.label !== 'Modules')} />
                </div>
            </div>
             <Tabs value={activeTab} onValueChange={setActiveTab}>
                 <TabsList className={cn("grid w-full", tabGridCols)}>
                    {isViewingOrg && <TabsTrigger value="dashboard"><LayoutDashboard className="h-4 w-4 mr-2" /> Dashboard</TabsTrigger>}
                    <TabsTrigger value="bmt"><Wrench className="h-4 w-4 mr-2" /> BMT</TabsTrigger>
                    <TabsTrigger value="operations"><ClipboardList className="h-4 w-4 mr-2" /> Operations</TabsTrigger>
                    {isAdmin && !viewContextOrgId && <TabsTrigger value="organisations"><Building className="h-4 w-4 mr-2" /> Organisations</TabsTrigger>}
                    {isAdmin && !viewContextOrgId && <TabsTrigger value="settings"><Settings2 className="h-4 w-4 mr-2" /> Settings</TabsTrigger>}
                    {showSubDealersTab && <TabsTrigger value="sub-dealers"><Users className="h-4 w-4 mr-2" /> Sub Dealers</TabsTrigger>}
                </TabsList>
                
                {isViewingOrg && (
                    <TabsContent value="dashboard">
                        {dashboardOrg ? (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <div className="lg:col-span-1 flex flex-col gap-6">
                                    {userPermissions.can_see_parent_inventory && parentOrg && (
                                        <>
                                            <Card className="border-accent/30 bg-accent/5">
                                                <CardHeader className="pb-2">
                                                    <div className="flex items-center gap-2 text-accent font-bold text-sm uppercase tracking-wider">
                                                        <ArrowRightLeft className="h-4 w-4" />
                                                        <span>{parentOrg.name} In Stock</span>
                                                    </div>
                                                </CardHeader>
                                                <CardContent>
                                                    <InventoryList 
                                                        organisation={parentOrg as any} 
                                                        subDealers={[]} 
                                                        parentOrg={null} 
                                                        moduleId={moduleData.id}
                                                        filterOrgId="local"
                                                        isAdmin={isAdmin}
                                                    />
                                                </CardContent>
                                            </Card>
                                            <Card className="border-accent/30 bg-accent/5">
                                                <CardHeader className="pb-2">
                                                    <div className="flex items-center gap-2 text-accent font-bold text-sm uppercase tracking-wider">
                                                        <ArrowRightLeft className="h-4 w-4" />
                                                        <span>{parentOrg.name} On Order</span>
                                                    </div>
                                                </CardHeader>
                                                <CardContent>
                                                    <VesselOnOrderList 
                                                        organisation={dashboardOrg as any}
                                                        parentOrg={parentOrg as any}
                                                        moduleId={moduleData.id}
                                                        isAdmin={isAdmin}
                                                    />
                                                </CardContent>
                                            </Card>
                                        </>
                                    )}
                                    <Card>
                                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                                            <CardTitle className="text-lg">Local In Stock</CardTitle>
                                            {dashboardSubDealers.length > 0 && (
                                                <Select value={inStockFilter} onValueChange={setInStockFilter}>
                                                    <SelectTrigger className="w-[160px] h-8 text-xs hover:bg-accent transition-colors">
                                                        <SelectValue placeholder="Filter Stock" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="all">All Network Stock</SelectItem>
                                                        <SelectItem value="local">{dashboardOrg?.name}</SelectItem>
                                                        {dashboardSubDealers.map(sd => (
                                                            <SelectItem key={sd.id} value={sd.id}>{sd.name}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        </CardHeader>
                                        <CardContent>
                                            <InventoryList 
                                                organisation={dashboardOrg as any}
                                                subDealers={dashboardSubDealers as any[]}
                                                parentOrg={parentOrg as any}
                                                moduleId={moduleData.id}
                                                filterOrgId={inStockFilter}
                                                isAdmin={isAdmin}
                                            />
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardHeader>
                                            <CardTitle>On Order</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <VesselOnOrderList 
                                                organisation={dashboardOrg as any}
                                                parentOrg={parentOrg as any}
                                                moduleId={moduleData.id}
                                                isAdmin={isAdmin}
                                            />
                                        </CardContent>
                                    </Card>
                                </div>
                                <div className="lg:col-span-2">
                                    <Card className="h-full flex flex-col min-h-[600px]">
                                        <CardHeader><CardTitle>Quotes</CardTitle><CardDescription>Recent quotes for {dashboardOrg.name}</CardDescription></CardHeader>
                                        <CardContent className="flex-grow">
                                            <ScrollArea className="h-[500px] w-full rounded-md border p-4 bg-muted/5">
                                                <div className="flex items-center justify-center h-full text-muted-foreground italic">
                                                    <p>Quotes list will appear here.</p>
                                                </div>
                                            </ScrollArea>
                                        </CardContent>
                                    </Card>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                        )}
                    </TabsContent>
                )}

                <TabsContent value="bmt">
                   {view === 'ranges' || view === 'models' ? (
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle>{view === 'ranges' ? 'Select a Product Range' : `Models in ${selectedRange?.name}`}</CardTitle>
                                    {isImpersonating && <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold border border-primary/20"><Eye className="h-4 w-4 mr-2" /> PREVIEWING AS {currentContextLabel.toUpperCase()}</div>}
                                </div>
                                <ModuleConfigurationBreadcrumbs module={moduleData} range={selectedRange} model={selectedModel} view={view} onBreadcrumbClick={handleBreadcrumbClick} />
                            </CardHeader>
                            <CardContent>
                                {mainVendor && (mainVendor.vendorType === 'Boat Brand') ? (
                                    <>
                                        {view === 'ranges' && <RangesGrid vendor={mainVendor} onRangeSelect={handleRangeSelect} />}
                                        {view === 'models' && selectedRange && <ModelsGrid range={selectedRange} vendor={mainVendor} onModelSelect={handleModelSelect} isAdmin={isAdmin && !viewContextOrgId} />}
                                    </>
                                ) : (
                                    <p className="text-muted-foreground">No configuration view available for this vendor type.</p>
                                )}
                            </CardContent>
                        </Card>
                   ) : (
                        <div className="space-y-4">
                            {view === 'bmt' && selectedModel && selectedRange && mainVendor && (
                                <ModelConfigurationEditor 
                                    model={selectedModel} 
                                    docPath={`data-warehouse/${mainVendor.id}/ranges/${selectedRange.id}/models/${selectedModel.id}`} 
                                    vendor={mainVendor} 
                                    module={moduleData} 
                                    breadcrumbs={<ModuleConfigurationBreadcrumbs module={moduleData} range={selectedRange} model={selectedModel} view={view} onBreadcrumbClick={handleBreadcrumbClick} />}
                                    user={user}
                                    isAdmin={isAdmin}
                                    organisationId={dashboardOrg?.id}
                                    permissions={userPermissions as any}
                                />
                            )}
                            {(view === 'quote' || view === 'operations') && (
                                <div className="flex h-96 w-full items-center justify-center rounded-lg border-2 border-dashed">
                                    <div className="text-center">
                                        <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
                                        <p className="mt-4 text-muted-foreground capitalize">Preparing {view} engine for {currentContextLabel}...</p>
                                    </div>
                                </div>
                            )}
                        </div>
                   )}
                </TabsContent>

                <TabsContent value="operations">
                    <Card><CardHeader><CardTitle>Operations</CardTitle></CardHeader><CardContent><p className="text-muted-foreground">Operations features for {currentContextLabel} coming soon.</p></CardContent></Card>
                </TabsContent>

                 {isAdmin && !viewContextOrgId && (
                    <TabsContent value="organisations">
                       <Card>
                            <CardHeader>
                                <CardTitle>Subscribed Organisations</CardTitle>
                                <CardDescription>Managing organisations subscribed to {moduleData.name}. Click an organisation to configure their access or impersonate their view.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {selectedOrgId && (allOrganisations?.find(o => o.id === selectedOrgId)) ? (
                                    <OrganisationModuleConfig 
                                        organisation={allOrganisations.find(o => o.id === selectedOrgId)!}
                                        subDealers={allOrganisations.filter(org => org.parentOrganisationId === selectedOrgId)}
                                        module={moduleData}
                                        allVendors={allVendors || []}
                                        allDealerFitCategories={allDealerFitCategories || []}
                                        onBack={() => setSelectedOrgId(null)}
                                        onUpdateVendors={(vids) => handleUpdateOrgVendorAccess(selectedOrgId, vids)}
                                        onUpdateCategories={(cids) => handleUpdateOrgCategories(selectedOrgId, cids)}
                                        onToggleSubDealerAccess={handleToggleModuleAccess}
                                        onUpdateSubDealerVendors={handleUpdateOrgVendorAccess}
                                    />
                                ) : allOrganisations?.filter(org => org.enabledModuleSubscriptions?.includes(moduleData.id) && !org.parentOrganisationId).length! > 0 ? (
                                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                        {allOrganisations?.filter(org => org.enabledModuleSubscriptions?.includes(moduleData.id) && !org.parentOrganisationId).map(org => (
                                            <Card key={org.id} className="relative group hover:border-primary transition-colors flex flex-col">
                                                <div className="p-4 flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-10 w-10 bg-secondary rounded-full flex items-center justify-center border">
                                                            <Building className="h-5 w-5 text-muted-foreground" />
                                                        </div>
                                                        <div className="font-medium text-sm">{org.name}</div>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <Button variant="ghost" size="icon" title="View Module As" className="hover:bg-accent hover:text-accent-foreground transition-colors" onClick={() => { setViewContextOrgId(org.id); setActiveTab('dashboard'); }}><Eye className="h-4 w-4" /></Button>
                                                        <Button variant="ghost" size="icon" className="hover:bg-accent hover:text-accent-foreground transition-colors" onClick={() => setSelectedOrgId(org.id)}><Settings2 className="h-4 w-4" /></Button>
                                                    </div>
                                                </div>
                                            </Card>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg"><Building className="h-12 w-12 mx-auto mb-4 opacity-20"/><p>No organisations are currently subscribed to this module.</p></div>
                                )}
                            </CardContent>
                       </Card>
                    </TabsContent>
                )}

                {showSubDealersTab && (
                    <TabsContent value="sub-dealers">
                        <Card>
                            <CardHeader>
                                <CardTitle>Sub Dealer Management</CardTitle>
                                <CardDescription>Manage module access and view sub-dealer configurations.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                 {selectedOrgId && (allOrganisations?.find(o => o.id === selectedOrgId)) ? (
                                    <OrganisationModuleConfig 
                                        organisation={allOrganisations.find(o => o.id === selectedOrgId)!}
                                        module={moduleData}
                                        allVendors={allVendors || []}
                                        allDealerFitCategories={allDealerFitCategories || []}
                                        onBack={() => setSelectedOrgId(null)}
                                        onUpdateVendors={(vids) => handleUpdateOrgVendorAccess(selectedOrgId, vids)}
                                        onUpdateCategories={(cids) => handleUpdateOrgCategories(selectedOrgId, cids)}
                                    />
                                ) : dashboardSubDealers.length > 0 ? (
                                    <div className="space-y-4">
                                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                            {dashboardSubDealers.map(sd => {
                                                const hasAccess = sd.enabledModuleSubscriptions?.includes(moduleData.id);
                                                return (
                                                    <Card key={sd.id} className={cn("relative group transition-all flex flex-col", hasAccess ? "border-primary/50 shadow-sm" : "opacity-70 grayscale")}>
                                                        <div className="p-4 flex flex-col gap-4">
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="h-10 w-10 bg-secondary rounded-full flex items-center justify-center border">
                                                                        <Building className="h-5 w-5 text-muted-foreground" />
                                                                    </div>
                                                                    <div className="font-semibold text-sm">{sd.name}</div>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <Checkbox 
                                                                        id={`sd-access-${sd.id}`} 
                                                                        checked={hasAccess} 
                                                                        onCheckedChange={(checked) => handleToggleModuleAccess(sd.id, !!checked)} 
                                                                    />
                                                                    <label htmlFor={`sd-access-${sd.id}`} className="text-xs text-muted-foreground cursor-pointer">Access</label>
                                                                </div>
                                                            </div>
                                                            {hasAccess && (
                                                                <div className="flex gap-2">
                                                                    <Button variant="outline" size="sm" className="flex-1 hover:bg-accent hover:text-accent-foreground transition-colors" onClick={() => { setViewContextOrgId(sd.id); setActiveTab('dashboard'); }}>
                                                                        <Eye className="mr-2 h-4 w-4" /> View
                                                                    </Button>
                                                                    <Button variant="outline" size="sm" className="flex-1 hover:bg-accent hover:text-accent-foreground transition-colors" onClick={() => setSelectedOrgId(sd.id)}>
                                                                        <Settings2 className="mr-2 h-4 w-4" /> Config
                                                                    </Button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </Card>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                                        <Users className="h-12 w-12 mx-auto mb-4 opacity-20"/>
                                        <p>No sub dealers found for this organisation.</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                )}

                {isAdmin && !viewContextOrgId && (
                    <TabsContent value="settings" className="space-y-6">
                        <Form {...settingsForm}>
                            <form onSubmit={settingsForm.handleSubmit(onSettingsSubmit)} className="space-y-6">
                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between">
                                        <div><CardTitle>Module Configuration</CardTitle></div>
                                        <Button type="submit" disabled={isSavingModule}>{isSavingModule ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}Save Settings</Button>
                                    </CardHeader>
                                    <CardContent className="space-y-6">
                                        <FormField control={settingsForm.control} name="name" render={({ field }) => ( <FormItem><FormLabel>Module Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                                        <FormField control={settingsForm.control} name="mainVendorId" render={({ field }) => ( <FormItem><FormLabel>Main Vendor</FormLabel><Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl><SelectTrigger className="hover:bg-accent hover:text-accent-foreground transition-colors"><SelectValue placeholder="Select main vendor" /></SelectTrigger></FormControl>
                                            <SelectContent>{allVendors?.map(v => (<SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>))}</SelectContent>
                                        </Select></FormItem> )} />
                                        <FormField control={settingsForm.control} name="associatedVendorIds" render={() => (
                                            <FormItem>
                                                <FormLabel>Associated Vendors</FormLabel>
                                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pt-2">
                                                    {allVendors?.map((vendor) => (
                                                        <FormField key={vendor.id} control={settingsForm.control} name="associatedVendorIds" render={({ field }) => (
                                                            <FormItem className="flex items-center space-x-3 space-y-0 p-3 border rounded-md"><FormControl><Checkbox checked={field.value?.includes(vendor.id)} onCheckedChange={(checked) => checked ? field.onChange([...(field.value || []), vendor.id]) : field.onChange(field.value?.filter(v => v !== vendor.id))}/></FormControl><FormLabel className="font-normal">{vendor.name}</FormLabel></FormItem>
                                                        )} />
                                                    ))}
                                                </div>
                                            </FormItem>
                                        )} />
                                    </CardContent>
                                </Card>
                            </form>
                        </Form>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div><CardTitle>Organisation Access</CardTitle><CardDescription>Select which top-level organisations can use this module.</CardDescription></div>
                                <Button onClick={handleSaveSubscriptions} disabled={isSavingSubscriptions}>{isSavingSubscriptions ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}Save Subscriptions</Button>
                            </CardHeader>
                            <CardContent className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {allOrganisations?.filter(o => !o.parentOrganisationId).map(org => (
                                    <div key={org.id} className="flex items-center space-x-3 p-3 border rounded-md">
                                        <Checkbox id={`org-sub-${org.id}`} checked={tempSubscribedOrgIds.includes(org.id)} onCheckedChange={(checked) => checked ? setTempSubscribedOrgIds(prev => [...prev, org.id]) : setTempSubscribedOrgIds(prev => prev.filter(id => id !== org.id))} />
                                        <label htmlFor={`org-sub-${org.id}`} className="font-normal text-sm cursor-pointer">{org.name}</label>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    </TabsContent>
                )}
            </Tabs>
             <Dialog open={isChoiceDialogOpen} onOpenChange={setIsChoiceDialogOpen}>
                <DialogContent className="sm:max-w-3xl">
                    <DialogHeader>
                        <div className="flex items-center justify-between">
                            <div className="flex flex-col gap-1">
                                <DialogTitle className="text-2xl font-semibold">{selectedModel?.name}</DialogTitle>
                                {selectedModel?.modelCode && <span className="font-mono text-xs text-muted-foreground uppercase bg-muted px-1.5 py-0.5 rounded w-fit">{selectedModel.modelCode}</span>}
                            </div>
                            {isImpersonating && <div className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold border border-primary/20">PREVIEWING AS {currentContextLabel.toUpperCase()}</div>}
                        </div>
                        <DialogDescription className="text-lg">What would you like to do with this model for {currentContextLabel}?</DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4">
                        <Card className="group cursor-pointer hover:border-primary hover:bg-primary/5 transition-all duration-300 transform hover:-translate-y-1" onClick={() => handleChoiceSelect('bmt')}>
                            <CardContent className="flex flex-col items-center justify-center p-8 gap-4">
                                <Wrench className="h-12 w-12 text-primary group-hover:scale-110 transition-transform" />
                                <p className="font-semibold text-xl">Configuration</p>
                            </CardContent>
                        </Card>
                        <Card className="group cursor-pointer hover:border-primary hover:bg-primary/5 transition-all duration-300 transform hover:-translate-y-1" onClick={() => handleChoiceSelect('quote')}>
                            <CardContent className="flex flex-col items-center justify-center p-8 gap-4">
                                <FileText className="h-12 w-12 text-primary group-hover:scale-110 transition-transform" />
                                <p className="font-semibold text-xl">Quotation</p>
                            </CardContent>
                         </Card>
                         <Card className="group cursor-pointer hover:border-primary hover:bg-primary/5 transition-all duration-300 transform hover:-translate-y-1" onClick={() => handleChoiceSelect('operations')}>
                            <CardContent className="flex flex-col items-center justify-center p-8 gap-4">
                                <ClipboardList className="h-12 w-12 text-primary group-hover:scale-110 transition-transform" />
                                <p className="font-semibold text-xl">Operations</p>
                            </CardContent>
                        </Card>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

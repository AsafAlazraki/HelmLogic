
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
    X, 
    LayoutDashboard,
    PlusCircle,
    Pencil,
    Trash2,
    DollarSign,
    Ship,
    Cog,
    TrendingUp,
    Anchor,
    Navigation
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BreadcrumbNav } from '@/components/breadcrumb-nav';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useDoc } from '@/firebase/firestore/use-doc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUser } from '@/firebase/auth/use-user';
import { ModelConfigurationEditor } from '@/components/model-configuration-editor';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormMessage, FormLabel, FormDescription } from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox';
import { createSlug, cn } from '@/lib/utils';
import { OrganisationModuleConfig } from '@/components/organisation-module-config';
import { InventoryList } from '@/components/inventory-list';
import { VesselOnOrderList } from '@/components/vessel-on-order-list';
import { ModulePricingDashboard } from '@/components/module-pricing-dashboard';
import { MotorModuleBrowser } from '@/components/motor-module-browser';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

interface Vendor {
    id: string;
    name: string;
    logoUrl?: string;
    vendorType: string;
    slug?: string;
    currency?: string;
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
    tradingCurrency?: string;
    gstPercentage?: number;
    brandMargins?: Record<string, number>;
    rangeMargins?: Record<string, number>;
    modelMargins?: Record<string, number>;
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
                                        <FormLabel htmlFor="name">Package Name</FormLabel>
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

        const modelPath = `data-warehouse/${vendor.id}/ranges/${range.id}/models/${selectedModelForPackage.id}`;
        const docRef = doc(firestore, modelPath);
        
        updateDoc(docRef, { packageLevels: updatedPackages })
            .then(() => {
                toast({ title: "Package Updated" });
            })
            .catch(async (serverError) => {
                const permissionError = new FirestorePermissionError({
                    path: docRef.path,
                    operation: 'update',
                    requestResourceData: { packageLevels: updatedPackages },
                } satisfies SecurityRuleContext);
                errorEmitter.emit('permission-error', permissionError);
            });
    };

    const handleDeletePackage = async (model: Model, packageId: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const updatedPackages = model.packageLevels?.filter(p => p.id !== packageId) || [];
        const modelPath = `data-warehouse/${vendor.id}/ranges/${range.id}/models/${model.id}`;
        const docRef = doc(firestore, modelPath);

        updateDoc(docRef, { packageLevels: updatedPackages })
            .then(() => {
                toast({ title: 'Package Deleted' });
            })
            .catch(async (serverError) => {
                const permissionError = new FirestorePermissionError({
                    path: docRef.path,
                    operation: 'update',
                    requestResourceData: { packageLevels: updatedPackages },
                } satisfies SecurityRuleContext);
                errorEmitter.emit('permission-error', permissionError);
            });
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

function ModuleConfigurationBreadcrumbs({ module, range, model, pendingMotor, view, onBreadcrumbClick }: { module: any; range: Range | null; model: Model | null; pendingMotor: any; view: 'ranges' | 'models' | 'motors' | 'bmt' | 'quote' | 'operations' | 'pricing', onBreadcrumbClick: (level: 'ranges' | 'models' | 'motors') => void }) {
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
            {pendingMotor && (view === 'bmt' || view === 'quote' || view === 'operations') && (
                <>
                    <ChevronRight className="h-4 w-4 mx-1" />
                    <span className="font-medium text-foreground">{pendingMotor['Model Name'] || pendingMotor.name}</span>
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

    const [view, setView] = useState<'ranges' | 'models' | 'motors' | 'bmt' | 'quote' | 'operations' | 'pricing'>('ranges');
    const [selectedRange, setSelectedRange] = useState<Range | null>(null);
    const [selectedModel, setSelectedModel] = useState<Model | null>(null);
    const [pendingMotor, setPendingMotor] = useState<any | null>(null);
    const [selectedMotorDataSetId, setSelectedMotorDataSetId] = useState<string | null>(null);
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
    
    const moduleData = useMemo(() => moduleById || modulesBySlug?.[0], [modulesBySlug, moduleById]);
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

    const overrideRef = useMemoFirebase(() => 
        dashboardOrg?.id && selectedModel?.id 
            ? doc(firestore, 'organisations', dashboardOrg.id, 'modelOverrides', selectedModel.id) 
            : null,
    [firestore, dashboardOrg?.id, selectedModel?.id]);
    const { data: modelOverride } = useDoc<any>(overrideRef);

    const mergedModel = useMemo(() => {
        if (!selectedModel) return null;
        if (!modelOverride) return selectedModel;
        return { ...selectedModel, ...modelOverride };
    }, [selectedModel, modelOverride]);

    const parentOrg = useMemo(() => 
        dashboardOrg?.parentOrganisationId ? allOrganisations?.find(o => o.id === dashboardOrg.parentOrganisationId) : null,
    [dashboardOrg, allOrganisations]);

    const dashboardSubDealers = useMemo(() => {
        if (!dashboardOrg || !allOrganisations) return [];
        return allOrganisations.filter(o => o.parentOrganisationId === dashboardOrg.id);
    }, [dashboardOrg, allOrganisations]);

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
        if (!roleId || !currentMemberOrg?.permissions?.[roleId]) return { can_access_module: false };
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
        const moduleRef = doc(firestore, 'modules', moduleData.id);
        const vendor = allVendors?.find(v => v.id === values.mainVendorId);
        const dataToUpdate = {
            name: values.name,
            slug: createSlug(values.name),
            mainVendorId: values.mainVendorId,
            associatedVendorIds: values.associatedVendorIds,
            logoUrl: vendor?.logoUrl || null,
        };

        updateDoc(moduleRef, dataToUpdate)
            .then(() => {
                toast({ title: 'Module Updated' });
                if (dataToUpdate.slug !== slugOrId) {
                    router.replace(`/modules/${dataToUpdate.slug}`);
                }
            })
            .catch(async (serverError) => {
                const permissionError = new FirestorePermissionError({
                    path: moduleRef.path,
                    operation: 'update',
                    requestResourceData: dataToUpdate,
                } satisfies SecurityRuleContext);
                errorEmitter.emit('permission-error', permissionError);
            })
            .finally(() => setIsSavingModule(false));
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

        batch.commit()
            .then(() => {
                toast({ title: "Subscriptions updated." });
            })
            .catch(async (serverError) => {
                const permissionError = new FirestorePermissionError({
                    path: 'organisations',
                    operation: 'write',
                } satisfies SecurityRuleContext);
                errorEmitter.emit('permission-error', permissionError);
            })
            .finally(() => setIsSavingSubscriptions(false));
    };

    const handleUpdateOrgVendorAccess = async (targetId: string, vendorIds: string[]) => {
        if (!targetId) return;
        const orgRef = doc(firestore, 'organisations', targetId);
        const updateData = {
            [`moduleAssociatedVendorAccess.${moduleData.id}`]: vendorIds
        };

        updateDoc(orgRef, updateData)
            .then(() => {
                toast({ title: "Vendor access updated." });
            })
            .catch(async (serverError) => {
                const permissionError = new FirestorePermissionError({
                    path: orgRef.path,
                    operation: 'update',
                    requestResourceData: updateData,
                } satisfies SecurityRuleContext);
                errorEmitter.emit('permission-error', permissionError);
            });
    };

    const handleUpdateOrgCategories = async (targetId: string, catIds: string[]) => {
        if (!targetId) return;
        const orgRef = doc(firestore, 'organisations', targetId);
        const updateData = {
            dealerFitCategories: catIds
        };

        updateDoc(orgRef, updateData)
            .then(() => {
                toast({ title: "Dealer fit options updated." });
            })
            .catch(async (serverError) => {
                const permissionError = new FirestorePermissionError({
                    path: orgRef.path,
                    operation: 'update',
                    requestResourceData: updateData,
                } satisfies SecurityRuleContext);
                errorEmitter.emit('permission-error', permissionError);
            });
    };

    const handleToggleModuleAccess = async (orgId: string, hasAccess: boolean) => {
        if (!moduleData) return;
        const org = allOrganisations?.find(o => o.id === orgId);
        if (!org) return;
        const currentSubs = org.enabledModuleSubscriptions || [];
        const newSubs = hasAccess 
            ? [...new Set([...currentSubs, moduleData.id])]
            : currentSubs.filter(id => id !== moduleData.id);
        
        const orgRef = doc(firestore, 'organisations', orgId);
        updateDoc(orgRef, {
            enabledModuleSubscriptions: newSubs
        })
            .then(() => {
                toast({ title: hasAccess ? "Access granted" : "Access revoked" });
            })
            .catch(async (serverError) => {
                const permissionError = new FirestorePermissionError({
                    path: orgRef.path,
                    operation: 'update',
                    requestResourceData: { enabledModuleSubscriptions: newSubs },
                } satisfies SecurityRuleContext);
                errorEmitter.emit('permission-error', permissionError);
            });
    };

    const handleRangeSelect = (range: Range) => {
        setSelectedRange(range);
        setView('models');
    };
    
    const handleModelSelect = (model: Model) => {
        setSelectedModel(model);
        setPendingMotor(null);
        setIsChoiceDialogOpen(true);
    };

    const handleMotorSelect = (motor: any, dataSetId: string) => {
        setPendingMotor(motor);
        setSelectedMotorDataSetId(dataSetId);
        setSelectedModel(null);
        setIsChoiceDialogOpen(true);
    };

    const handleChoiceSelect = (choice: 'bmt' | 'quote' | 'operations') => {
        if (choice === 'bmt' && pendingMotor) {
            router.push(`/modules/${moduleData.slug || moduleData.id}/motor/${pendingMotor.id}?vendor=${moduleData.mainVendorId}&set=${selectedMotorDataSetId}`);
            setIsChoiceDialogOpen(false);
            return;
        }
        
        if (choice === 'quote' && selectedModel && mainVendor?.slug === 'highfield') {
            router.push(`/modules/${moduleData.slug || moduleData.id}/quote/${selectedModel.id}?range=${selectedRange?.id}&vendor=${mainVendor.id}`);
            setIsChoiceDialogOpen(false);
            return;
        }

        setView(choice);
        setIsChoiceDialogOpen(false);
    };
    
    const handleBreadcrumbClick = (level: 'ranges' | 'models' | 'motors') => {
        if (level === 'ranges') {
            setView('ranges');
            setSelectedRange(null);
            setSelectedModel(null);
            setPendingMotor(null);
        } else if (level === 'models') {
            setView('models');
            setSelectedModel(null);
        } else if (level === 'motors') {
            setView('motors');
            setPendingMotor(null);
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
        isAdmin ? { href: "/admin", label: "Admin" } : { href: "/dashboard", label: "Dashboard" },
        { href: `/modules/${slugOrId}`, label: moduleData.name },
    ];

    const isMasterContext = viewContextOrgId === null;
    const currentContextLabel = availableContexts.find(c => c.id === (viewContextOrgId || 'master'))?.name || 'Master Data';
    const isImpersonating = viewContextOrgId !== null && (isAdmin || viewContextOrgId !== userProfile?.organisationId);
    
    const showSubDealersTab = isViewingOrg && dashboardOrg?.subDealersEnabled && userPermissions.can_view_subdealers;
    const tabGridCols = (isAdmin && !viewContextOrgId) ? "grid-cols-5" : showSubDealersTab ? "grid-cols-6" : "grid-cols-5";

    const isBoatBrand = mainVendor?.vendorType === 'Boat Brand';
    const isMotorBrand = mainVendor?.vendorType === 'Motor Brand';

    return (
        <div className="flex flex-col h-[calc(100vh-theme(spacing.24))] space-y-4 overflow-hidden">
             <div className="flex items-start justify-between shrink-0">
                <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                        {moduleData.logoUrl ? (
                            <div className="relative h-12 w-48">
                                <Image src={moduleData.logoUrl} alt={moduleData.name} fill className="object-contain object-left" unoptimized />
                            </div>
                        ) : (
                            <h1 className="text-2xl font-semibold">Module: {moduleData.name}</h1>
                        )}
                        <div className="flex items-center gap-2">
                            {isAdmin && (
                                <>
                                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Viewing As:</span>
                                    <Select 
                                        value={viewContextOrgId || 'master'} 
                                        onValueChange={(val) => setViewContextOrgId(val === 'master' ? null : val)}
                                    >
                                        <SelectTrigger className={cn("w-[220px] h-9 hover:bg-accent hover:text-accent-foreground transition-colors font-bold", isImpersonating && "border-primary ring-1 ring-primary bg-primary/5")}>
                                            <Eye className="h-4 w-4 mr-2" />
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableContexts.map(ctx => (
                                                <SelectItem key={ctx.id} value={ctx.id} className="font-bold">{ctx.name}</SelectItem>
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
                    <BreadcrumbNav parts={breadcrumbParts} />
                </div>
            </div>
             <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
                 <TabsList className={cn("grid w-full shrink-0 h-12 bg-muted/20 p-1 rounded-xl border border-muted-foreground/10", tabGridCols)}>
                    {isViewingOrg && <TabsTrigger value="dashboard" className="rounded-lg font-black uppercase text-[10px] tracking-widest"><LayoutDashboard className="h-3.5 w-3.5 mr-2" /> Dashboard</TabsTrigger>}
                    <TabsTrigger value="bmt" className="rounded-lg font-black uppercase text-[10px] tracking-widest">
                        {isMotorBrand ? <Cog className="h-3.5 w-3.5 mr-2" /> : <Wrench className="h-3.5 w-3.5 mr-2" />}
                        {isMotorBrand ? 'Motors' : 'BMT Catalog'}
                    </TabsTrigger>
                    <TabsTrigger value="operations" className="rounded-lg font-black uppercase text-[10px] tracking-widest"><ClipboardList className="h-3.5 w-3.5 mr-2" /> Operations</TabsTrigger>
                    {isViewingOrg && userPermissions.can_access_settings && <TabsTrigger value="pricing" className="rounded-lg font-black uppercase text-[10px] tracking-widest"><DollarSign className="h-3.5 w-3.5 mr-2" /> Strategic Pricing</TabsTrigger>}
                    {isAdmin && !viewContextOrgId && <TabsTrigger value="organisations" className="rounded-lg font-black uppercase text-[10px] tracking-widest"><Building className="h-3.5 w-3.5 mr-2" /> Orgs</TabsTrigger>}
                    {isAdmin && !viewContextOrgId && <TabsTrigger value="settings" className="rounded-lg font-black uppercase text-[10px] tracking-widest"><Settings2 className="h-3.5 w-3.5 mr-2" /> Config</TabsTrigger>}
                    {showSubDealersTab && <TabsTrigger value="sub-dealers" className="rounded-lg font-black uppercase text-[10px] tracking-widest"><Users className="h-3.5 w-3.5 mr-2" /> Network</TabsTrigger>}
                </TabsList>
                
                {isViewingOrg && (
                    <TabsContent value="dashboard" className="flex-1 min-h-0 mt-6 overflow-hidden">
                        {dashboardOrg ? (
                            <div className="flex flex-col h-full gap-6 overflow-hidden animate-in fade-in duration-700">
                                {/* Cinematic Hero Ribbon */}
                                <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-primary via-primary/90 to-accent p-8 text-primary-foreground shadow-2xl border border-white/10 shrink-0">
                                    <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-[100px] animate-pulse" />
                                    <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-accent/20 blur-[100px]" />
                                    
                                    <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] opacity-70">
                                                <Anchor className="h-3.5 w-3.5" />
                                                <span>{moduleData.name} Command Center</span>
                                            </div>
                                            <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
                                                {dashboardOrg.name}
                                            </h1>
                                            <p className="text-base font-medium opacity-80 max-w-xl leading-relaxed">
                                                Manage local inventory, track orders across the network, and coordinate sales quotes from a unified interface.
                                            </p>
                                        </div>

                                        {/* Stats Overview */}
                                        <div className="flex flex-wrap items-center gap-4 md:gap-8 bg-black/10 backdrop-blur-md rounded-[2rem] p-6 border border-white/5 shadow-inner">
                                            <div className="space-y-1">
                                                <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Stock Assets</p>
                                                <div className="flex items-baseline gap-1">
                                                    <span className="text-3xl font-black tracking-tighter">14</span>
                                                    <span className="text-[10px] font-bold opacity-40 uppercase">Units</span>
                                                </div>
                                            </div>
                                            <Separator orientation="vertical" className="h-10 bg-white/10 hidden sm:block" />
                                            <div className="space-y-1">
                                                <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Active Orders</p>
                                                <div className="flex items-baseline gap-1 text-accent-foreground">
                                                    <span className="text-3xl font-black tracking-tighter text-white">08</span>
                                                    <TrendingUp className="h-3 w-3 text-green-400" />
                                                </div>
                                            </div>
                                            <Separator orientation="vertical" className="h-10 bg-white/10 hidden sm:block" />
                                            <div className="space-y-1">
                                                <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Pending Quotes</p>
                                                <div className="flex items-baseline gap-1">
                                                    <span className="text-3xl font-black tracking-tighter">23</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0 overflow-hidden">
                                    {/* Sidebar Column */}
                                    <div className="lg:col-span-4 flex flex-col gap-6 overflow-hidden h-full">
                                        {userPermissions.can_see_parent_inventory && parentOrg && (
                                            <Card className="border-accent/30 bg-accent/5 rounded-[2rem] overflow-hidden shrink-0 shadow-lg">
                                                <CardHeader className="pb-2 bg-accent/5 border-b border-accent/10">
                                                    <div className="flex items-center gap-2 text-accent font-black text-[10px] uppercase tracking-[0.2em]">
                                                        <Navigation className="h-3.5 w-3.5" />
                                                        <span>{parentOrg.name} Network Feed</span>
                                                    </div>
                                                </CardHeader>
                                                <CardContent className="p-4">
                                                    <div className="space-y-4">
                                                        <InventoryList 
                                                            organisation={parentOrg as any} 
                                                            subDealers={[]} 
                                                            parentOrg={null} 
                                                            moduleId={moduleData.id}
                                                            filterOrgId="local"
                                                            isAdmin={isAdmin}
                                                        />
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        )}
                                        
                                        <Card className="flex-1 min-h-0 flex flex-col overflow-hidden rounded-[2.5rem] shadow-2xl border-2 bg-card/50 backdrop-blur-xl">
                                            <CardHeader className="flex flex-row items-center justify-between pb-4 bg-muted/5 border-b shrink-0 px-8">
                                                <div className="space-y-1">
                                                    <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground/60">Local Assets</CardTitle>
                                                    <h3 className="text-lg font-black uppercase tracking-tight">In Stock</h3>
                                                </div>
                                                {dashboardSubDealers.length > 0 && (
                                                    <Select value={inStockFilter} onValueChange={setInStockFilter}>
                                                        <SelectTrigger className="w-[160px] h-9 text-[10px] font-black uppercase tracking-widest hover:bg-accent transition-colors rounded-xl border-2">
                                                            <SelectValue placeholder="Network Filter" />
                                                        </SelectTrigger>
                                                        <SelectContent className="rounded-xl border-2 shadow-2xl">
                                                            <SelectItem value="all" className="text-[10px] font-black uppercase">All Network Stock</SelectItem>
                                                            <SelectItem value="local" className="text-[10px] font-black uppercase">{dashboardOrg?.name}</SelectItem>
                                                            {dashboardSubDealers.map(sd => (
                                                                <SelectItem key={sd.id} value={sd.id} className="text-[10px] font-black uppercase">{sd.name}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                            </CardHeader>
                                            <CardContent className="flex-1 min-h-0 overflow-hidden p-6">
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

                                        <Card className="flex-1 min-h-0 flex flex-col overflow-hidden rounded-[2.5rem] shadow-2xl border-2 bg-card/50 backdrop-blur-xl">
                                            <CardHeader className="bg-muted/5 border-b shrink-0 px-8 py-4">
                                                <div className="space-y-1">
                                                    <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground/60">Logistics Pipeline</CardTitle>
                                                    <h3 className="text-lg font-black uppercase tracking-tight">On Order</h3>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="flex-1 min-h-0 overflow-hidden p-6">
                                                <VesselOnOrderList 
                                                    organisation={dashboardOrg as any}
                                                    parentOrg={parentOrg as any}
                                                    moduleId={moduleData.id}
                                                    isAdmin={isAdmin}
                                                />
                                            </CardContent>
                                        </Card>
                                    </div>

                                    {/* Main Content Column */}
                                    <div className="lg:col-span-8 overflow-hidden h-full">
                                        <Card className="h-full flex flex-col overflow-hidden rounded-[3rem] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.1)] border-2 bg-white">
                                            <CardHeader className="shrink-0 p-10 pb-6 border-b bg-slate-50/50">
                                                <div className="flex items-center justify-between">
                                                    <div className="space-y-1.5">
                                                        <CardTitle className="text-xs font-black uppercase tracking-[0.3em] text-primary">Sales Intelligence</CardTitle>
                                                        <h2 className="text-3xl font-black tracking-tight text-slate-950 uppercase italic">Recent Quotes</h2>
                                                        <CardDescription className="text-sm font-medium text-slate-500">Managing the tactical sales pipeline for {dashboardOrg.name}</CardDescription>
                                                    </div>
                                                    <Button className="h-12 px-8 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-primary/20 hover:scale-105 transition-transform active:scale-95">
                                                        <PlusCircle className="mr-2 h-4 w-4" />
                                                        Draft New Quote
                                                    </Button>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="flex-1 min-h-0 p-10 pt-0 flex flex-col justify-center items-center">
                                                <div className="w-full h-full rounded-[2rem] border-2 border-dashed border-slate-100 p-8 bg-slate-50/20 flex flex-col items-center justify-center text-center gap-6 group">
                                                    <div className="h-24 w-24 bg-white rounded-[2rem] shadow-2xl border flex items-center justify-center text-slate-200 group-hover:scale-110 group-hover:text-primary transition-all duration-500">
                                                        <FileText className="h-10 w-10" />
                                                    </div>
                                                    <div className="space-y-2 max-w-sm">
                                                        <p className="text-lg font-black uppercase tracking-tight text-slate-400">Tactical Pipeline Empty</p>
                                                        <p className="text-sm text-slate-400 font-medium leading-relaxed">No active quotations found for this organization. Start a new build from the BMT Catalog to initialize the pipeline.</p>
                                                    </div>
                                                    <Button variant="outline" className="mt-4 border-2 rounded-xl h-10 px-6 font-bold hover:bg-slate-50">
                                                        View Archive
                                                    </Button>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-full"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
                        )}
                    </TabsContent>
                )}

                <TabsContent value="bmt" className="flex-1 min-h-0 mt-6 overflow-hidden">
                   {(view === 'ranges' || view === 'models' || view === 'motors') ? (
                        <Card className="h-full flex flex-col rounded-[2.5rem] border-2 shadow-2xl overflow-hidden bg-white">
                            <CardHeader className="bg-slate-50/50 border-b shrink-0 p-10 pb-6">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="space-y-1.5">
                                        <CardTitle className="text-xs font-black uppercase tracking-[0.3em] text-primary">Precision Catalog</CardTitle>
                                        <h2 className="text-3xl font-black tracking-tight text-slate-950 uppercase italic">
                                            {isMotorBrand ? 'Engine Portfolio' : view === 'ranges' ? 'Product Portfolio' : view === 'models' ? `${selectedRange?.name} Portfolio` : `Catalog: ${mainVendor?.name}`}
                                        </h2>
                                    </div>
                                    {isImpersonating && (
                                        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest border-2 border-primary/20 shadow-inner">
                                            <Eye className="h-3.5 w-3.5" /> 
                                            Auditing as {currentContextLabel}
                                        </div>
                                    )}
                                </div>
                                <div className="mt-4">
                                    <ModuleConfigurationBreadcrumbs module={moduleData} range={selectedRange} model={mergedModel} pendingMotor={pendingMotor} view={view} onBreadcrumbClick={handleBreadcrumbClick} />
                                </div>
                            </CardHeader>
                            <CardContent className="flex-1 min-h-0 overflow-y-auto p-10 pt-6">
                                {isBoatBrand && mainVendor ? (
                                    <>
                                        {view === 'ranges' && <RangesGrid vendor={mainVendor} onRangeSelect={handleRangeSelect} />}
                                        {view === 'models' && selectedRange && <ModelsGrid range={selectedRange} vendor={mainVendor} onModelSelect={handleModelSelect} isAdmin={isAdmin && !viewContextOrgId} />}
                                    </>
                                ) : isMotorBrand && mainVendor ? (
                                    <MotorModuleBrowser 
                                        vendor={mainVendor} 
                                        onMotorSelect={handleMotorSelect} 
                                    />
                                ) : (
                                    <div className="py-20 text-center flex flex-col items-center gap-4 opacity-20">
                                        <Wrench className="h-16 w-16" />
                                        <p className="font-black uppercase tracking-widest">No configuration view assigned</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                   ) : (
                        <div className="h-full overflow-y-auto space-y-4">
                            {view === 'bmt' && mergedModel && selectedRange && mainVendor && (
                                <ModelConfigurationEditor 
                                    model={mergedModel} 
                                    docPath={`data-warehouse/${mainVendor.id}/ranges/${selectedRange.id}/models/${mergedModel.id}`} 
                                    vendor={mainVendor} 
                                    module={moduleData} 
                                    breadcrumbs={<ModuleConfigurationBreadcrumbs module={moduleData} range={selectedRange} model={mergedModel} pendingMotor={pendingMotor} view={view} onBreadcrumbClick={handleBreadcrumbClick} />}
                                    user={user}
                                    isAdmin={isAdmin}
                                    isMasterContext={isMasterContext}
                                    organisationId={dashboardOrg?.id}
                                    permissions={userPermissions as any}
                                />
                            )}
                            {(view === 'quote' || view === 'operations') && (
                                <div className="flex h-96 w-full items-center justify-center rounded-[2.5rem] border-2 border-dashed bg-muted/5 shadow-inner">
                                    <div className="text-center space-y-4">
                                        <div className="h-16 w-16 bg-white rounded-2xl shadow-xl mx-auto flex items-center justify-center text-primary animate-bounce">
                                            <Ship className="h-8 w-8" />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-muted-foreground font-black uppercase tracking-[0.2em] text-[10px]">Initializing Component</p>
                                            <p className="text-xl font-black uppercase tracking-tight">Preparing {view} Environment</p>
                                        </div>
                                        <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary opacity-40" />
                                    </div>
                                </div>
                            )}
                        </div>
                   )}
                </TabsContent>

                <TabsContent value="operations" className="flex-1 min-h-0 mt-6 overflow-y-auto">
                    <Card className="rounded-[2.5rem] border-2 shadow-2xl overflow-hidden bg-card/50 backdrop-blur-md">
                        <CardHeader className="p-10 border-b bg-muted/5">
                            <CardTitle className="text-2xl font-black uppercase tracking-tight italic">Global Operations</CardTitle>
                            <CardDescription className="text-sm font-medium">Logistics, scheduling, and service management</CardDescription>
                        </CardHeader>
                        <CardContent className="p-20 text-center space-y-4 opacity-30 italic">
                            <ClipboardList className="h-16 w-16 mx-auto mb-4" />
                            <p className="text-lg font-black uppercase tracking-widest">Workspace Development In Progress</p>
                        </CardContent>
                    </Card>
                </TabsContent>

                {isViewingOrg && (
                    <TabsContent value="pricing" className="flex-1 min-h-0 mt-6 overflow-y-auto">
                        {dashboardOrg && mainVendor ? (
                            <ModulePricingDashboard 
                                module={moduleData} 
                                organisation={dashboardOrg as Organisation} 
                                vendor={mainVendor} 
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
                        )}
                    </TabsContent>
                )}

                 {isAdmin && !viewContextOrgId && (
                    <TabsContent value="organisations" className="flex-1 min-h-0 mt-6 overflow-y-auto">
                       <Card className="rounded-[2.5rem] border-2 shadow-2xl overflow-hidden bg-card/50 backdrop-blur-md">
                            <CardHeader className="p-10 border-b bg-muted/5">
                                <CardTitle className="text-2xl font-black uppercase tracking-tight italic">Subscriber Network</CardTitle>
                                <CardDescription className="text-sm font-medium italic">Managing organisations subscribed to {moduleData.name}</CardDescription>
                            </CardHeader>
                            <CardContent className="p-10">
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
                                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                                        {allOrganisations?.filter(org => org.enabledModuleSubscriptions?.includes(moduleData.id) && !org.parentOrganisationId).map(org => (
                                            <Card key={org.id} className="relative group hover:border-primary transition-all duration-300 rounded-[2rem] overflow-hidden shadow-lg hover:-translate-y-1">
                                                <div className="p-6 flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <div className="h-14 w-14 bg-white shadow-inner rounded-2xl flex items-center justify-center border-2">
                                                            <Building className="h-6 w-6 text-primary/40" />
                                                        </div>
                                                        <div className="font-black text-sm uppercase tracking-tight">{org.name}</div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Button variant="ghost" size="icon" title="View Module As" className="h-10 w-10 rounded-xl hover:bg-primary/10 text-primary transition-colors" onClick={() => { setViewContextOrgId(org.id); setActiveTab('dashboard'); }}><Eye className="h-5 w-5" /></Button>
                                                        <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-accent hover:text-accent-foreground transition-colors" onClick={() => setSelectedOrgId(org.id)}><Settings2 className="h-5 w-5" /></Button>
                                                    </div>
                                                </div>
                                            </Card>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-24 text-muted-foreground border-4 border-dashed rounded-[3rem] bg-muted/5">
                                        <Building className="h-20 w-24 mx-auto mb-6 opacity-5"/>
                                        <p className="text-xl font-black uppercase tracking-[0.2em] opacity-20">No network subscribers</p>
                                    </div>
                                )}
                            </CardContent>
                       </Card>
                    </TabsContent>
                )}

                {showSubDealersTab && (
                    <TabsContent value="sub-dealers" className="flex-1 min-h-0 mt-6 overflow-y-auto">
                        <Card className="rounded-[2.5rem] border-2 shadow-2xl overflow-hidden bg-card/50 backdrop-blur-md">
                            <CardHeader className="p-10 border-b bg-muted/5">
                                <CardTitle className="text-2xl font-black uppercase tracking-tight italic">Sub Dealer Network</CardTitle>
                                <CardDescription className="text-sm font-medium italic">Manage regional dependencies and configuration access</CardDescription>
                            </CardHeader>
                            <CardContent className="p-10">
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
                                        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                                            {dashboardSubDealers.map(sd => {
                                                const hasAccess = sd.enabledModuleSubscriptions?.includes(moduleData.id);
                                                return (
                                                    <Card key={sd.id} className={cn("relative group transition-all duration-500 rounded-[2rem] overflow-hidden", hasAccess ? "border-primary/50 shadow-xl" : "opacity-50 grayscale border-dashed")}>
                                                        <div className="p-6 flex flex-col gap-6">
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-4">
                                                                    <div className="h-12 w-12 bg-white rounded-xl shadow-inner flex items-center justify-center border-2">
                                                                        <Building className="h-5 w-5 text-muted-foreground/40" />
                                                                    </div>
                                                                    <div className="font-black text-sm uppercase tracking-tight">{sd.name}</div>
                                                                </div>
                                                                <div className="flex items-center gap-2 bg-muted/20 px-3 py-1.5 rounded-full border border-white/10">
                                                                    <Checkbox 
                                                                        id={`sd-access-${sd.id}`} 
                                                                        checked={hasAccess} 
                                                                        onCheckedChange={(checked) => handleToggleModuleAccess(sd.id, !!checked)} 
                                                                    />
                                                                    <label htmlFor={`sd-access-${sd.id}`} className="text-[10px] font-black uppercase tracking-widest text-muted-foreground cursor-pointer">Access</label>
                                                                </div>
                                                            </div>
                                                            {hasAccess && (
                                                                <div className="flex gap-2">
                                                                    <Button variant="outline" size="sm" className="flex-1 h-10 rounded-xl hover:bg-primary/5 text-[10px] font-black uppercase tracking-widest border-2 transition-all" onClick={() => { setViewContextOrgId(sd.id); setActiveTab('dashboard'); }}>
                                                                        <Eye className="mr-2 h-3.5 w-3.5" /> View Feed
                                                                    </Button>
                                                                    <Button variant="outline" size="sm" className="flex-1 h-10 rounded-xl hover:bg-accent hover:text-accent-foreground text-[10px] font-black uppercase tracking-widest border-2 transition-all" onClick={() => setSelectedOrgId(sd.id)}>
                                                                        <Settings2 className="mr-2 h-3.5 w-3.5" /> Config
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
                                    <div className="text-center py-24 text-muted-foreground border-4 border-dashed rounded-[3rem] bg-muted/5 opacity-20">
                                        <Users className="h-20 w-24 mx-auto mb-6"/>
                                        <p className="text-xl font-black uppercase tracking-[0.2em]">No subordinate network</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                )}

                {isAdmin && !viewContextOrgId && (
                    <TabsContent value="settings" className="flex-1 min-h-0 mt-6 overflow-y-auto space-y-8">
                        <Form {...settingsForm}>
                            <form onSubmit={settingsForm.handleSubmit(onSettingsSubmit)} className="space-y-8">
                                <Card className="rounded-[2.5rem] border-2 shadow-2xl overflow-hidden bg-card/50 backdrop-blur-md">
                                    <CardHeader className="flex flex-row items-center justify-between p-10 border-b bg-muted/5">
                                        <div className="space-y-1">
                                            <CardTitle className="text-2xl font-black uppercase tracking-tight italic">Module Blueprint</CardTitle>
                                            <CardDescription className="text-sm font-medium italic">Architectural settings and primary vendor identification</CardDescription>
                                        </div>
                                        <Button type="submit" disabled={isSavingModule} className="h-12 px-8 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-primary/20 hover:scale-105 transition-transform">
                                            {isSavingModule ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                                            Commit Changes
                                        </Button>
                                    </CardHeader>
                                    <CardContent className="p-10 space-y-10">
                                        <FormField control={settingsForm.control} name="name" render={({ field }) => ( 
                                            <FormItem className="space-y-3">
                                                <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70 ml-1">Friendly Display Name</FormLabel>
                                                <FormControl><Input {...field} className="h-14 rounded-2xl border-2 font-black text-lg bg-background px-6" /></FormControl>
                                                <FormMessage />
                                            </FormItem> 
                                        )} />
                                        
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                            <FormField control={settingsForm.control} name="mainVendorId" render={({ field }) => ( 
                                                <FormItem className="space-y-3">
                                                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70 ml-1">Main Identity Vendor</FormLabel>
                                                    <Select onValueChange={field.onChange} value={field.value}>
                                                        <FormControl>
                                                            <SelectTrigger className="h-14 rounded-2xl border-2 font-black bg-background px-6">
                                                                <SelectValue placeholder="Select primary vendor" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent className="rounded-2xl border-2 shadow-2xl">
                                                            {allVendors?.map(v => (
                                                                <SelectItem key={v.id} value={v.id} className="font-bold py-3 uppercase text-xs">{v.name}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </FormItem> 
                                            )} />
                                        </div>

                                        <FormField control={settingsForm.control} name="associatedVendorIds" render={() => (
                                            <FormItem className="space-y-4">
                                                <div className="space-y-1">
                                                    <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70 ml-1">Associated Ecosystem</FormLabel>
                                                    <FormDescription className="text-xs italic ml-1">Vendors available for BMT configuration and quoting.</FormDescription>
                                                </div>
                                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                                    {allVendors?.map((vendor) => (
                                                        <FormField key={vendor.id} control={settingsForm.control} name="associatedVendorIds" render={({ field }) => (
                                                            <FormItem className="flex items-center space-x-3 space-y-0 p-4 border-2 rounded-2xl bg-muted/5 hover:border-primary/20 transition-all cursor-pointer">
                                                                <FormControl>
                                                                    <Checkbox 
                                                                        checked={field.value?.includes(vendor.id)} 
                                                                        onCheckedChange={(checked) => checked ? field.onChange([...(field.value || []), vendor.id]) : field.onChange(field.value?.filter(v => v !== vendor.id))}
                                                                    />
                                                                </FormControl>
                                                                <FormLabel className="font-black text-[10px] uppercase tracking-tighter cursor-pointer">{vendor.name}</FormLabel>
                                                            </FormItem>
                                                        )} />
                                                    ))}
                                                </div>
                                            </FormItem>
                                        )} />
                                    </CardContent>
                                </Card>
                            </form>
                        </Form>
                        
                        <Card className="rounded-[2.5rem] border-2 shadow-2xl overflow-hidden bg-card/50 backdrop-blur-md">
                            <CardHeader className="flex flex-row items-center justify-between p-10 border-b bg-muted/5">
                                <div className="space-y-1">
                                    <CardTitle className="text-2xl font-black uppercase tracking-tight italic">Network Permissions</CardTitle>
                                    <CardDescription className="text-sm font-medium italic">Select which parent organisations can access this module</CardDescription>
                                </div>
                                <Button onClick={handleSaveSubscriptions} disabled={isSavingSubscriptions} className="h-12 px-8 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl border-2 hover:bg-accent transition-all">
                                    {isSavingSubscriptions ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                                    Sync Permissions
                                </Button>
                            </CardHeader>
                            <CardContent className="p-10 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                                {allOrganisations?.filter(o => !o.parentOrganisationId).map(org => (
                                    <div key={org.id} className="flex items-center space-x-4 p-5 border-2 rounded-2xl bg-background hover:border-primary/20 transition-all group shadow-sm">
                                        <Checkbox 
                                            id={`org-sub-${org.id}`} 
                                            checked={tempSubscribedOrgIds.includes(org.id)} 
                                            onCheckedChange={(checked) => checked ? setTempSubscribedOrgIds(prev => [...prev, org.id]) : setTempSubscribedOrgIds(prev => prev.filter(id => id !== org.id))} 
                                        />
                                        <label htmlFor={`org-sub-${org.id}`} className="font-black text-[11px] uppercase tracking-tight cursor-pointer group-hover:text-primary transition-colors">{org.name}</label>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    </TabsContent>
                )}
            </Tabs>
             <Dialog open={isChoiceDialogOpen} onOpenChange={setIsChoiceDialogOpen}>
                <DialogContent className="sm:max-w-3xl rounded-[3rem] p-0 overflow-hidden border-4 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.2)]">
                    <DialogHeader className="p-12 bg-slate-50 border-b">
                        <div className="flex items-center justify-between">
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-primary mb-2">
                                    <Navigation className="h-3.5 w-3.5" />
                                    <span>Command Selection</span>
                                </div>
                                <DialogTitle className="text-4xl font-black uppercase tracking-tight leading-none italic">
                                    {mergedModel?.name || pendingMotor?.['Model Name'] || pendingMotor?.name}
                                </DialogTitle>
                                {(mergedModel?.modelCode || pendingMotor?.['Part Number']) && (
                                    <span className="font-mono text-xs text-primary font-bold uppercase bg-primary/10 px-3 py-1 rounded-full w-fit border border-primary/20 shadow-inner mt-2">
                                        {mergedModel?.modelCode || pendingMotor?.['Part Number']}
                                    </span>
                                )}
                            </div>
                            {isImpersonating && (
                                <div className="px-4 py-2 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest border-2 border-primary/20">
                                    Target: {currentContextLabel}
                                </div>
                            )}
                        </div>
                        <DialogDescription className="text-lg font-medium text-slate-500 mt-4 leading-relaxed">Strategic action required. Select the target environment for this item.</DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 p-12 bg-white">
                        <Card className="group cursor-pointer hover:border-primary hover:bg-primary/5 transition-all duration-500 transform hover:-translate-y-2 shadow-xl border-2 rounded-[2rem] overflow-hidden" onClick={() => handleChoiceSelect('bmt')}>
                            <CardContent className="flex flex-col items-center justify-center p-10 gap-6 text-center">
                                <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all duration-500">
                                    <Wrench className="h-8 w-8" />
                                </div>
                                <div className="space-y-1">
                                    <p className="font-black uppercase tracking-[0.2em] text-[10px] text-primary">Technical</p>
                                    <p className="font-black uppercase tracking-tight text-sm">Configurator</p>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="group cursor-pointer hover:border-primary hover:bg-primary/5 transition-all duration-500 transform hover:-translate-y-2 shadow-xl border-2 rounded-[2rem] overflow-hidden" onClick={() => handleChoiceSelect('quote')}>
                            <CardContent className="flex flex-col items-center justify-center p-10 gap-6 text-center">
                                <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all duration-500">
                                    <FileText className="h-8 w-8" />
                                </div>
                                <div className="space-y-1">
                                    <p className="font-black uppercase tracking-[0.2em] text-[10px] text-primary">Commercial</p>
                                    <p className="font-black uppercase tracking-tight text-sm">Quotation</p>
                                </div>
                            </CardContent>
                         </Card>
                         <Card className="group cursor-pointer hover:border-primary hover:bg-primary/5 transition-all duration-500 transform hover:-translate-y-2 shadow-xl border-2 rounded-[2rem] overflow-hidden" onClick={() => handleChoiceSelect('operations')}>
                            <CardContent className="flex flex-col items-center justify-center p-10 gap-6 text-center">
                                <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all duration-500">
                                    <ClipboardList className="h-8 w-8" />
                                </div>
                                <div className="space-y-1">
                                    <p className="font-black uppercase tracking-[0.2em] text-[10px] text-primary">Logistics</p>
                                    <p className="font-black uppercase tracking-tight text-sm">Operations</p>
                                </div>
                            </CardContent>
                         </Card>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

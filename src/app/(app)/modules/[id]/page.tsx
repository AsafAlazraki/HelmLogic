
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
    Navigation,
    Search,
    ShieldCheck
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
import { ScrollArea } from '@/components/ui/scroll-area';

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
        <div className="flex items-center text-xs text-white/60">
            <button type="button" className="hover:text-white" onClick={() => onBreadcrumbClick('ranges')}>{module.name}</button>
            {range && (view === 'models' || view === 'bmt' || view === 'quote' || view === 'operations') && (
                <>
                    <ChevronRight className="h-3 w-3 mx-1" />
                    <button type="button" className="hover:text-white" onClick={() => onBreadcrumbClick('models')}>{range.name}</button>
                </>
            )}
            {model && (view === 'bmt' || view === 'quote' || view === 'operations') && (
                <>
                    <ChevronRight className="h-3 w-3 mx-1" />
                    <span className="font-bold text-white">{model.name}</span>
                </>
            )}
            {pendingMotor && (view === 'bmt' || view === 'quote' || view === 'operations') && (
                <>
                    <ChevronRight className="h-3 w-3 mx-1" />
                    <span className="font-bold text-white">{pendingMotor['Model Name'] || pendingMotor.name}</span>
                </>
            )}
        </div>
    );
}

function QuoteSelectorDialog({ 
    isOpen, 
    setIsOpen, 
    vendor, 
    moduleSlug 
}: { 
    isOpen: boolean, 
    setIsOpen: (open: boolean) => void, 
    vendor: Vendor,
    moduleSlug: string
}) {
    const firestore = useFirestore();
    const router = useRouter();
    const [selectedRange, setSelectedRange] = useState<Range | null>(null);

    const rangesQuery = useMemoFirebase(() => {
        if (!vendor?.id) return null;
        return query(collection(firestore, `data-warehouse/${vendor.id}/ranges`), orderBy('order'));
    }, [firestore, vendor.id]);
    const { data: ranges, loading: rangesLoading } = useCollection<Range>(rangesQuery);

    const modelsQuery = useMemoFirebase(() => {
        if (!vendor?.id || !selectedRange?.id) return null;
        return query(collection(firestore, `data-warehouse/${vendor.id}/ranges/${selectedRange.id}/models`), orderBy('order'));
    }, [firestore, vendor.id, selectedRange]);
    const { data: models, loading: modelsLoading } = useCollection<Model>(modelsQuery);

    const handleModelSelect = (model: Model) => {
        router.push(`/modules/${moduleSlug}/quote/${model.id}?range=${selectedRange?.id}&vendor=${vendor.id}`);
        setIsOpen(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => {
            setIsOpen(open);
            if (!open) setSelectedRange(null);
        }}>
            <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col p-0 rounded-[2.5rem]">
                <DialogHeader className="p-8 border-b bg-slate-50">
                    <DialogTitle className="text-3xl font-black uppercase tracking-tight italic">Initiate New Build</DialogTitle>
                    <DialogDescription className="text-base font-medium text-slate-500">
                        {selectedRange ? `Select a ${selectedRange.name} model to start the configuration.` : 'Select a product range to browse available models.'}
                    </DialogDescription>
                </DialogHeader>
                
                <div className="flex-1 min-h-0">
                    <ScrollArea className="h-full p-8">
                        {rangesLoading ? (
                            <div className="flex h-64 items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
                        ) : !selectedRange ? (
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                                {ranges?.map(range => (
                                    <Card 
                                        key={range.id} 
                                        className="cursor-pointer hover:border-primary hover:shadow-xl transition-all rounded-[2rem] overflow-hidden group"
                                        onClick={() => setSelectedRange(range)}
                                    >
                                        <div className="aspect-video bg-muted relative">
                                            {range.imageUrl ? <Image src={range.imageUrl} alt={range.name} fill className="object-cover p-4" unoptimized /> : <div className="flex items-center justify-center h-full"><Ship className="h-8 w-8 opacity-10" /></div>}
                                        </div>
                                        <CardContent className="p-6 text-center">
                                            <p className="font-black uppercase tracking-tight text-lg">{range.name}</p>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <Button variant="ghost" onClick={() => setSelectedRange(null)} className="font-bold -ml-2">
                                    <ChevronLeft className="mr-2 h-4 w-4" /> Back to Ranges
                                </Button>
                                {modelsLoading ? (
                                    <div className="flex h-64 items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
                                ) : (
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                                        {models?.map(model => (
                                            <Card 
                                                key={model.id} 
                                                className="cursor-pointer hover:border-primary hover:shadow-xl transition-all rounded-[2rem] overflow-hidden group"
                                                onClick={() => handleModelSelect(model)}
                                            >
                                                <div className="aspect-video bg-muted relative">
                                                    {model.coverImageUrl ? <Image src={model.coverImageUrl} alt={model.name} fill className="object-cover" unoptimized /> : <div className="flex items-center justify-center h-full"><Ship className="h-8 w-8 opacity-10" /></div>}
                                                </div>
                                                <CardContent className="p-6 text-center">
                                                    <p className="font-black uppercase tracking-tight">{model.name}</p>
                                                    {model.modelCode && <Badge variant="secondary" className="mt-2 font-mono text-[9px]">{model.modelCode}</Badge>}
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </ScrollArea>
                </div>
            </DialogContent>
        </Dialog>
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
    const [isNewQuoteOpen, setIsNewQuoteOpen] = useState(false);
    
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

    const handleToggleSubDealerAccess = async (sdId: string, hasAccess: boolean) => {
        if (!moduleData) return;
        const sd = allOrganisations?.find(o => o.id === sdId);
        if (!sd) return;
        const currentSubs = sd.enabledModuleSubscriptions || [];
        const newSubs = hasAccess 
            ? [...new Set([...currentSubs, moduleData.id])]
            : currentSubs.filter(id => id !== moduleData.id);
        
        const orgRef = doc(firestore, 'organisations', sdId);
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
        <div className="flex flex-col min-h-screen space-y-0 -m-4 md:-m-6 overflow-x-hidden">
            {/* 1. Cinematic Hero Header (Top) */}
            <div className="relative overflow-hidden bg-gradient-to-br from-primary via-primary/95 to-accent px-8 md:px-12 py-10 text-primary-foreground shadow-2xl border-b border-white/10 shrink-0">
                <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-[100px] animate-pulse" />
                <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-accent/20 blur-[100px]" />
                
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
                    <div className="space-y-4">
                        {/* Logo & Breadcrumbs Group */}
                        <div className="space-y-2">
                            {moduleData.logoUrl ? (
                                <div className="relative h-14 w-56 bg-white/95 rounded-[1rem] p-2.5 shadow-xl border border-white/20">
                                    <Image src={moduleData.logoUrl} alt={moduleData.name} fill className="object-contain" unoptimized />
                                </div>
                            ) : (
                                <div className="flex items-center gap-3">
                                    <Anchor className="h-8 w-8" />
                                    <h1 className="text-2xl font-black uppercase tracking-tight italic">{moduleData.name}</h1>
                                </div>
                            )}
                            <div className="opacity-70">
                                <ModuleConfigurationBreadcrumbs 
                                    module={moduleData} 
                                    range={selectedRange} 
                                    model={mergedModel} 
                                    pendingMotor={pendingMotor} 
                                    view={view} 
                                    onBreadcrumbClick={handleBreadcrumbClick} 
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] opacity-70">
                                <Navigation className="h-3.5 w-3.5" />
                                <span>Command Center</span>
                            </div>
                            <h1 className="text-4xl font-black tracking-tight sm:text-5xl uppercase italic">
                                {dashboardOrg?.name || 'Local Fleet'}
                            </h1>
                        </div>
                    </div>

                    {/* Impersonation & Stats Row */}
                    <div className="flex flex-col md:items-end gap-6">
                        {isAdmin && (
                            <div className="flex items-center gap-2 bg-black/20 p-1.5 rounded-2xl border border-white/10">
                                <span className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-2">Viewing As:</span>
                                <Select 
                                    value={viewContextOrgId || 'master'} 
                                    onValueChange={(val) => setViewContextOrgId(val === 'master' ? null : val)}
                                >
                                    <SelectTrigger className={cn("w-[200px] h-9 font-bold bg-white/10 border-none text-white", isImpersonating && "bg-white text-primary")}>
                                        <Eye className="h-4 w-4 mr-2" />
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl border-2 shadow-2xl">
                                        {availableContexts.map(ctx => (
                                            <SelectItem key={ctx.id} value={ctx.id} className="font-bold">{ctx.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

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
                                <div className="flex items-baseline gap-1">
                                    <span className="text-3xl font-black tracking-tighter">08</span>
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
            </div>

            {/* 2. Primary Navigation Bar (Below Hero) */}
            <div className="px-8 md:px-12 py-4 bg-white border-b sticky top-0 z-20">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className={cn("grid w-full h-12 bg-muted/20 p-1 rounded-xl border border-muted-foreground/10", tabGridCols)}>
                        {isViewingOrg && <TabsTrigger value="dashboard" className="rounded-lg font-black uppercase text-[10px] tracking-widest"><LayoutDashboard className="h-3.5 w-3.5 mr-2" /> Dashboard</TabsTrigger>}
                        <TabsTrigger value="bmt" className="rounded-lg font-black uppercase text-[10px] tracking-widest">
                            {isMotorBrand ? <Cog className="h-3.5 w-3.5 mr-2" /> : <Wrench className="h-3.5 w-3.5 mr-2" />}
                            {isMotorBrand ? 'Engine Catalog' : 'BMT Catalog'}
                        </TabsTrigger>
                        <TabsTrigger value="operations" className="rounded-lg font-black uppercase text-[10px] tracking-widest"><ClipboardList className="h-3.5 w-3.5 mr-2" /> Operations</TabsTrigger>
                        {isViewingOrg && userPermissions.can_access_settings && <TabsTrigger value="pricing" className="rounded-lg font-black uppercase text-[10px] tracking-widest"><DollarSign className="h-3.5 w-3.5 mr-2" /> Strategic Pricing</TabsTrigger>}
                        {isAdmin && !viewContextOrgId && <TabsTrigger value="organisations" className="rounded-lg font-black uppercase text-[10px] tracking-widest"><Building className="h-3.5 w-3.5 mr-2" /> Orgs</TabsTrigger>}
                        {isAdmin && !viewContextOrgId && <TabsTrigger value="settings" className="rounded-lg font-black uppercase text-[10px] tracking-widest"><Settings2 className="h-3.5 w-3.5 mr-2" /> Config</TabsTrigger>}
                        {showSubDealersTab && <TabsTrigger value="sub-dealers" className="rounded-lg font-black uppercase text-[10px] tracking-widest"><Users className="h-3.5 w-3.5 mr-2" /> Network</TabsTrigger>}
                    </TabsList>
                </Tabs>
            </div>

            {/* 3. Main Workspace Content */}
            <main className="flex-1 px-8 md:px-12 py-8 bg-slate-50/50">
                <Tabs value={activeTab} className="w-full h-full">
                    {isViewingOrg && (
                        <TabsContent value="dashboard" className="mt-0 h-full">
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full">
                                {/* Left Side: Logistics */}
                                <div className="lg:col-span-4 flex flex-col gap-8 h-full">
                                    <Card className="flex flex-col border-2 rounded-[2.5rem] shadow-xl overflow-hidden bg-white/80 backdrop-blur-sm h-1/2">
                                        <CardHeader className="bg-muted/5 border-b px-8 py-6 flex flex-row items-center justify-between">
                                            <div className="space-y-1">
                                                <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-primary">Local Inventory</CardTitle>
                                                <h3 className="text-xl font-black uppercase italic">In Stock</h3>
                                            </div>
                                            {dashboardSubDealers.length > 0 && (
                                                <Select value={inStockFilter} onValueChange={setInStockFilter}>
                                                    <SelectTrigger className="w-36 h-8 text-[9px] font-black uppercase tracking-widest rounded-xl">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="all">Network Stock</SelectItem>
                                                        <SelectItem value="local">{dashboardOrg?.name}</SelectItem>
                                                        {dashboardSubDealers.map(sd => <SelectItem key={sd.id} value={sd.id}>{sd.name}</SelectItem>)}
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

                                    <Card className="flex flex-col border-2 rounded-[2.5rem] shadow-xl overflow-hidden bg-white/80 backdrop-blur-sm h-1/2">
                                        <CardHeader className="bg-muted/5 border-b px-8 py-6">
                                            <div className="space-y-1">
                                                <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-primary">Logistics Pipeline</CardTitle>
                                                <h3 className="text-xl font-black uppercase italic">On Order</h3>
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

                                {/* Right Side: Commercial Hub */}
                                <div className="lg:col-span-8 h-full">
                                    <Card className="h-full flex flex-col border-2 rounded-[3rem] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.1)] overflow-hidden bg-white">
                                        <CardHeader className="p-10 pb-6 border-b bg-slate-50/50">
                                            <div className="flex items-center justify-between">
                                                <div className="space-y-1.5">
                                                    <CardTitle className="text-xs font-black uppercase tracking-[0.3em] text-primary">Sales Intelligence</CardTitle>
                                                    <h2 className="text-3xl font-black tracking-tight text-slate-950 uppercase italic">Recent Quotes</h2>
                                                    <CardDescription className="text-sm font-medium text-slate-500">Managing the tactical sales pipeline for {dashboardOrg.name}</CardDescription>
                                                </div>
                                                <Button 
                                                    className="h-14 px-8 rounded-[1.5rem] font-black uppercase tracking-widest text-[10px] shadow-2xl shadow-primary/20 hover:scale-105 transition-transform active:scale-95"
                                                    onClick={() => setIsNewQuoteOpen(true)}
                                                >
                                                    <PlusCircle className="mr-2 h-5 w-5" />
                                                    Draft New Quote
                                                </Button>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="flex-1 p-10 flex flex-col justify-center items-center">
                                            <div className="w-full h-full rounded-[2.5rem] border-2 border-dashed border-slate-100 p-8 bg-slate-50/20 flex flex-col items-center justify-center text-center gap-6 group">
                                                <div className="h-24 w-24 bg-white rounded-[2rem] shadow-2xl border flex items-center justify-center text-slate-200 group-hover:scale-110 group-hover:text-primary transition-all duration-500">
                                                    <FileText className="h-10 w-10" />
                                                </div>
                                                <div className="space-y-2 max-w-sm">
                                                    <p className="text-lg font-black uppercase tracking-tight text-slate-400">Tactical Pipeline Empty</p>
                                                    <p className="text-sm text-slate-400 font-medium leading-relaxed">No active quotations found for this organization. Start a new build from the catalog to initialize the pipeline.</p>
                                                </div>
                                                <Button variant="outline" className="mt-4 border-2 rounded-xl h-10 px-6 font-bold hover:bg-slate-50">
                                                    View Archive
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                            </div>
                        </TabsContent>
                    )}

                    <TabsContent value="bmt" className="mt-0 h-full">
                        <div className="h-full overflow-y-auto space-y-6">
                            {(view === 'ranges' || view === 'models' || view === 'motors') ? (
                                <Card className="border-2 rounded-[3rem] shadow-2xl overflow-hidden bg-white">
                                    <CardHeader className="bg-slate-50/50 border-b p-10">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="space-y-1.5">
                                                <CardTitle className="text-xs font-black uppercase tracking-[0.3em] text-primary">Product Portfolio</CardTitle>
                                                <h2 className="text-3xl font-black tracking-tight text-slate-950 uppercase italic">
                                                    {isMotorBrand ? 'Engine Catalog' : view === 'ranges' ? 'Product Portfolio' : `${selectedRange?.name} Portfolio`}
                                                </h2>
                                            </div>
                                            {isImpersonating && (
                                                <Badge variant="outline" className="h-8 px-4 rounded-xl border-primary/20 bg-primary/5 text-primary font-black uppercase text-[10px]">
                                                    <Eye className="h-3.5 w-3.5 mr-2" /> Auditing: {currentContextLabel}
                                                </Badge>
                                            )}
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-10">
                                        {isBoatBrand && mainVendor ? (
                                            <>
                                                {view === 'ranges' && <RangesGrid vendor={mainVendor} onRangeSelect={handleRangeSelect} />}
                                                {view === 'models' && selectedRange && <ModelsGrid range={selectedRange} vendor={mainVendor} onModelSelect={handleModelSelect} isAdmin={isAdmin && !viewContextOrgId} />}
                                            </>
                                        ) : isMotorBrand && mainVendor ? (
                                            <MotorModuleBrowser vendor={mainVendor} onMotorSelect={handleMotorSelect} />
                                        ) : (
                                            <div className="py-20 text-center flex flex-col items-center gap-4 opacity-20">
                                                <Wrench className="h-16 w-16" />
                                                <p className="font-black uppercase tracking-widest">No configuration view assigned</p>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            ) : (
                                mergedModel && selectedRange && mainVendor && (
                                    <ModelConfigurationEditor 
                                        model={mergedModel} 
                                        docPath={`data-warehouse/${mainVendor.id}/ranges/${selectedRange.id}/models/${mergedModel.id}`} 
                                        vendor={mainVendor} 
                                        module={moduleData} 
                                        breadcrumbs={null}
                                        user={user}
                                        isAdmin={isAdmin}
                                        isMasterContext={isMasterContext}
                                        organisationId={dashboardOrg?.id}
                                        permissions={userPermissions as any}
                                    />
                                )
                            )}
                        </div>
                    </TabsContent>

                    {/* Other tabs remain largely the same but with improved card styling */}
                    <TabsContent value="pricing" className="mt-0 h-full">
                        {dashboardOrg && mainVendor && (
                            <ModulePricingDashboard module={moduleData} organisation={dashboardOrg as any} vendor={mainVendor} />
                        )}
                    </TabsContent>

                    {/* Standard Settings & Admin Tabs */}
                    <TabsContent value="settings" className="mt-0 h-full">
                        <Form {...settingsForm}>
                            <form onSubmit={settingsForm.handleSubmit(onSettingsSubmit)} className="space-y-8">
                                <Card className="rounded-[2.5rem] border-2 shadow-2xl bg-white p-10">
                                    <div className="flex items-center justify-between mb-8">
                                        <h2 className="text-2xl font-black uppercase italic">Module Blueprint</h2>
                                        <Button type="submit" disabled={isSavingModule} className="rounded-xl h-12 px-8 font-black uppercase tracking-widest text-[10px]">
                                            {isSavingModule ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                                            Save Blueprint
                                        </Button>
                                    </div>
                                    <div className="grid gap-10">
                                        <FormField control={settingsForm.control} name="name" render={({ field }) => ( 
                                            <FormItem>
                                                <FormLabel className="text-[10px] font-black uppercase tracking-widest opacity-60">Module Display Name</FormLabel>
                                                <FormControl><Input {...field} className="h-14 rounded-2xl border-2 font-black text-lg" /></FormControl>
                                                <FormMessage />
                                            </FormItem> 
                                        )} />
                                        <FormField control={settingsForm.control} name="mainVendorId" render={({ field }) => ( 
                                            <FormItem>
                                                <FormLabel className="text-[10px] font-black uppercase tracking-widest opacity-60">Main Vendor Identity</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <FormControl><SelectTrigger className="h-14 rounded-2xl border-2 font-black"><SelectValue placeholder="Select primary vendor" /></SelectTrigger></FormControl>
                                                    <SelectContent>{allVendors?.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
                                                </Select>
                                            </FormItem> 
                                        )} />
                                    </div>
                                </Card>
                            </form>
                        </Form>
                    </TabsContent>
                </Tabs>
            </main>

            {/* Quick Quote Selector (Modal) */}
            {mainVendor && (
                <QuoteSelectorDialog 
                    isOpen={isNewQuoteOpen} 
                    setIsOpen={setIsNewQuoteOpen} 
                    vendor={mainVendor} 
                    moduleSlug={moduleData.slug || moduleData.id}
                />
            )}

            {/* Legacy Choice Dialog */}
            <Dialog open={isChoiceDialogOpen} onOpenChange={setIsChoiceDialogOpen}>
                <DialogContent className="sm:max-w-3xl rounded-[3rem] p-0 overflow-hidden border-4">
                    <DialogHeader className="p-12 bg-slate-50 border-b">
                        <DialogTitle className="text-4xl font-black uppercase tracking-tight italic">
                            {mergedModel?.name || pendingMotor?.['Model Name'] || pendingMotor?.name}
                        </DialogTitle>
                        <DialogDescription className="text-lg font-medium text-slate-500 mt-4 leading-relaxed">Select the tactical environment for this item.</DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 p-12 bg-white">
                        <Card className="cursor-pointer hover:border-primary hover:bg-primary/5 transition-all p-10 text-center rounded-[2rem]" onClick={() => handleChoiceSelect('bmt')}>
                            <Wrench className="h-10 w-10 mx-auto mb-4 text-primary" />
                            <p className="font-black uppercase text-sm">Configurator</p>
                        </Card>
                        <Card className="cursor-pointer hover:border-primary hover:bg-primary/5 transition-all p-10 text-center rounded-[2rem]" onClick={() => handleChoiceSelect('quote')}>
                            <FileText className="h-10 w-10 mx-auto mb-4 text-primary" />
                            <p className="font-black uppercase text-sm">Quotation</p>
                        </Card>
                        <Card className="cursor-pointer hover:border-primary hover:bg-primary/5 transition-all p-10 text-center rounded-[2rem]" onClick={() => handleChoiceSelect('operations')}>
                            <ClipboardList className="h-10 w-10 mx-auto mb-4 text-primary" />
                            <p className="font-black uppercase text-sm">Operations</p>
                        </Card>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

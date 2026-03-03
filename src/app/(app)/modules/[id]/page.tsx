
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
    ChevronLeft,
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

const formSchema = z.object({
  name: z.string().min(1, { message: 'Module name is required.' }),
  mainVendorId: z.string().min(1, { message: 'A main vendor must be selected.' }),
  associatedVendorIds: z.array(z.string()).default([]),
});

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
                                                    {model.coverImageUrl ? <Image src={model.coverImageUrl} alt={model.name} fill className="object-cover" unoptimized /> : <div className="flex items-center justify-center h-full"><Ship className="opacity-10" /></div>}
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

function ModuleBreadcrumbs({ module, range, model, pendingMotor, view, onBreadcrumbClick }: { module: any; range: Range | null; model: Model | null; pendingMotor: any; view: string, onBreadcrumbClick: (level: 'ranges' | 'models' | 'motors') => void }) {
    return (
        <div className="flex items-center text-[10px] font-bold uppercase tracking-widest text-white/60">
            <button type="button" className="hover:text-white" onClick={() => onBreadcrumbClick('ranges')}>{module.name}</button>
            {range && (
                <>
                    <ChevronRight className="h-3 w-3 mx-1" />
                    <button type="button" className="hover:text-white" onClick={() => onBreadcrumbClick('models')}>{range.name}</button>
                </>
            )}
            {model && (
                <>
                    <ChevronRight className="h-3 w-3 mx-1" />
                    <span className="text-white">{model.name}</span>
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
    const [isNewQuoteOpen, setIsNewQuoteOpen] = useState(false);
    
    const [isSavingModule, setIsSavingModule] = useState(false);
    const [viewContextOrgId, setViewContextOrgId] = useState<string | null>(null);
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

    const { data: allVendors, loading: vendorsLoading } = useCollection<Vendor>(vendorsQuery);
    const { data: allOrganisations, loading: orgsLoading } = useCollection<Organisation>(orgsQuery);
    
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
    
    const loading = moduleLoading || mainVendorLoading || vendorsLoading || orgsLoading || userLoading || profileLoading;

    if (loading) {
      return <div className="flex justify-center items-center py-24"><Loader2 className="h-16 w-16 animate-spin text-primary" /></div>;
    }
    
    if (!moduleData) {
        return <Card><CardHeader><CardTitle>Module Not Found</CardTitle></CardHeader></Card>;
    }

    if (!userPermissions.can_access_module) {
        return <Card><CardHeader><CardTitle>Access Denied</CardTitle><CardDescription>Your role does not have permission to access modules.</CardDescription></CardHeader></Card>;
    }
    
    const isMasterContext = viewContextOrgId === null;
    const isImpersonating = viewContextOrgId !== null && (isAdmin || viewContextOrgId !== userProfile?.organisationId);
    const showSubDealersTab = isViewingOrg && dashboardOrg?.subDealersEnabled && userPermissions.can_view_subdealers;
    const tabGridCols = (isAdmin && !viewContextOrgId) ? "grid-cols-5" : showSubDealersTab ? "grid-cols-6" : "grid-cols-5";

    const isBoatBrand = mainVendor?.vendorType === 'Boat Brand';
    const isMotorBrand = mainVendor?.vendorType === 'Motor Brand';

    const handleRangeSelect = (range: Range) => {
        setSelectedRange(range);
        setView('models');
    };

    const handleModelSelect = (model: Model) => {
        setSelectedModel(model);
        setView('bmt');
    };

    const handleMotorSelect = (motor: any, dataSetId: string) => {
        setPendingMotor({ motor, dataSetId });
        setView('motors');
    };

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] -m-4 md:-m-6 overflow-hidden">
            {/* Cinematic Header */}
            <div className="relative overflow-hidden bg-gradient-to-br from-primary via-primary/95 to-accent px-8 py-6 text-primary-foreground shadow-2xl shrink-0 border-b border-white/10">
                <div className="absolute -right-20 -top-20 h-48 w-48 rounded-full bg-white/5 blur-[80px]" />
                <div className="relative z-10 flex items-center justify-between gap-8">
                    <div className="flex items-center gap-8">
                        <div className="h-12 w-48 relative bg-white/95 rounded-xl p-2 shadow-xl border border-white/20 shrink-0">
                            {moduleData.logoUrl ? (
                                <Image src={moduleData.logoUrl} alt={moduleData.name} fill className="object-contain" unoptimized />
                            ) : (
                                <div className="flex items-center gap-2 h-full text-primary">
                                    <Anchor className="h-5 w-5" />
                                    <span className="font-black uppercase text-xs tracking-tighter italic">{moduleData.name}</span>
                                </div>
                            )}
                        </div>

                        <div className="space-y-1">
                            <ModuleBreadcrumbs 
                                module={moduleData} 
                                range={selectedRange} 
                                model={mergedModel} 
                                pendingMotor={pendingMotor} 
                                view={view} 
                                onBreadcrumbClick={handleBreadcrumbClick} 
                            />
                            <h1 className="text-2xl font-black tracking-tight uppercase italic leading-none">
                                {dashboardOrg?.name || 'Local Fleet'}
                            </h1>
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        {isAdmin && (
                            <div className="flex items-center gap-2 bg-black/20 p-1 rounded-xl border border-white/10 shrink-0">
                                <Select 
                                    value={viewContextOrgId || 'master'} 
                                    onValueChange={(val) => setViewContextOrgId(val === 'master' ? null : val)}
                                >
                                    <SelectTrigger className={cn("w-40 h-8 font-bold bg-white/10 border-none text-white text-[10px]", isImpersonating && "bg-white text-primary")}>
                                        <Eye className="h-3.5 w-3.5 mr-2" />
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl border-2">
                                        {availableContexts.map(ctx => (
                                            <SelectItem key={ctx.id} value={ctx.id} className="font-bold text-xs">{ctx.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        <div className="flex items-center gap-6 bg-black/10 backdrop-blur-md rounded-2xl px-6 py-3 border border-white/5 shadow-inner shrink-0">
                            <div className="text-center">
                                <p className="text-[8px] font-black uppercase tracking-widest opacity-60 mb-0.5">Stock</p>
                                <p className="text-lg font-black leading-none">14</p>
                            </div>
                            <Separator orientation="vertical" className="h-6 bg-white/10" />
                            <div className="text-center">
                                <p className="text-[8px] font-black uppercase tracking-widest opacity-60 mb-0.5">Orders</p>
                                <p className="text-lg font-black leading-none text-green-400">08</p>
                            </div>
                            <Separator orientation="vertical" className="h-6 bg-white/10" />
                            <div className="text-center">
                                <p className="text-[8px] font-black uppercase tracking-widest opacity-60 mb-0.5">Quotes</p>
                                <p className="text-lg font-black leading-none">23</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="px-8 bg-white border-b shrink-0">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className={cn("grid w-full h-12 bg-transparent p-0", tabGridCols)}>
                        {isViewingOrg && <TabsTrigger value="dashboard" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent font-black uppercase text-[10px] tracking-widest h-full">Dashboard</TabsTrigger>}
                        <TabsTrigger value="bmt" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent font-black uppercase text-[10px] tracking-widest h-full">
                            {isMotorBrand ? 'Engine Catalog' : 'BMT Catalog'}
                        </TabsTrigger>
                        <TabsTrigger value="operations" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent font-black uppercase text-[10px] tracking-widest h-full">Operations</TabsTrigger>
                        {isViewingOrg && userPermissions.can_access_settings && <TabsTrigger value="pricing" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent font-black uppercase text-[10px] tracking-widest h-full">Strategic Pricing</TabsTrigger>}
                        {isAdmin && !viewContextOrgId && <TabsTrigger value="organisations" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent font-black uppercase text-[10px] tracking-widest h-full">Orgs</TabsTrigger>}
                        {isAdmin && !viewContextOrgId && <TabsTrigger value="settings" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent font-black uppercase text-[10px] tracking-widest h-full">Config</TabsTrigger>}
                        {showSubDealersTab && <TabsTrigger value="sub-dealers" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent font-black uppercase text-[10px] tracking-widest h-full">Network</TabsTrigger>}
                    </TabsList>
                </Tabs>
            </div>

            <main className="flex-1 overflow-hidden bg-slate-50/50">
                <Tabs value={activeTab} className="h-full">
                    {isViewingOrg && (
                        <TabsContent value="dashboard" className="m-0 h-full p-6">
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
                                <div className="lg:col-span-4 flex flex-col gap-6 h-full overflow-hidden">
                                    <Card className="flex flex-col border-2 rounded-[2rem] shadow-sm bg-white h-1/2 overflow-hidden">
                                        <CardHeader className="py-4 px-6 border-b shrink-0 flex flex-row items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="h-5 text-[8px] font-black uppercase">Stock</Badge>
                                                <h3 className="font-black uppercase italic text-sm">Local Inventory</h3>
                                            </div>
                                            {dashboardSubDealers.length > 0 && (
                                                <Select value={inStockFilter} onValueChange={setInStockFilter}>
                                                    <SelectTrigger className="w-32 h-7 text-[8px] font-black uppercase tracking-tighter">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="all">Network</SelectItem>
                                                        <SelectItem value="local">{dashboardOrg?.name}</SelectItem>
                                                        {dashboardSubDealers.map(sd => <SelectItem key={sd.id} value={sd.id}>{sd.name}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        </CardHeader>
                                        <CardContent className="flex-1 min-h-0 p-0">
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

                                    <Card className="flex flex-col border-2 rounded-[2rem] shadow-sm bg-white h-1/2 overflow-hidden">
                                        <CardHeader className="py-4 px-6 border-b shrink-0 flex items-center gap-2">
                                            <Badge variant="outline" className="h-5 text-[8px] font-black uppercase">Order</Badge>
                                            <h3 className="font-black uppercase italic text-sm">Pipeline</h3>
                                        </CardHeader>
                                        <CardContent className="flex-1 min-h-0 p-0">
                                            <VesselOnOrderList 
                                                organisation={dashboardOrg as any}
                                                parentOrg={parentOrg as any}
                                                moduleId={moduleData.id}
                                                isAdmin={isAdmin}
                                            />
                                        </CardContent>
                                    </Card>
                                </div>

                                <div className="lg:col-span-8 h-full overflow-hidden">
                                    <Card className="h-full flex flex-col border-2 rounded-[2.5rem] shadow-xl bg-white overflow-hidden">
                                        <CardHeader className="p-8 border-b bg-slate-50/30 flex flex-row items-center justify-between shrink-0">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-primary">
                                                    <Navigation className="h-3 w-3" />
                                                    <span>Sales Intelligence</span>
                                                </div>
                                                <h2 className="text-2xl font-black tracking-tight text-slate-950 uppercase italic">Recent Quotes</h2>
                                            </div>
                                            <Button 
                                                className="h-12 px-6 rounded-2xl font-black uppercase tracking-widest text-[9px] shadow-lg hover:scale-105 transition-transform"
                                                onClick={() => setIsNewQuoteOpen(true)}
                                            >
                                                <PlusCircle className="mr-2 h-4 w-4" />
                                                Draft New Quote
                                            </Button>
                                        </CardHeader>
                                        <CardContent className="flex-1 p-8 flex flex-col justify-center items-center">
                                            <div className="w-full h-full rounded-[2rem] border-2 border-dashed border-slate-100 bg-slate-50/20 flex flex-col items-center justify-center text-center gap-4 group">
                                                <div className="h-16 w-16 bg-white rounded-2xl shadow-xl border flex items-center justify-center text-slate-200 group-hover:scale-110 transition-all">
                                                    <FileText className="h-8 w-8" />
                                                </div>
                                                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Tactical Pipeline Empty</p>
                                                <Button variant="outline" className="border-2 rounded-xl h-9 px-6 font-bold text-xs">
                                                    View Archive
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                            </div>
                        </TabsContent>
                    )}

                    <TabsContent value="bmt" className="m-0 h-full p-6 overflow-hidden">
                        <ScrollArea className="h-full">
                            <Card className="border-2 rounded-[2.5rem] bg-white overflow-hidden">
                                <CardContent className="p-10">
                                    {isBoatBrand && mainVendor ? (
                                        <>
                                            {view === 'ranges' && <RangesGrid vendor={mainVendor} onRangeSelect={handleRangeSelect} />}
                                            {view === 'models' && selectedRange && <ModelsGrid range={selectedRange} vendor={mainVendor} onModelSelect={handleModelSelect} isAdmin={isAdmin && !viewContextOrgId} />}
                                            {view === 'bmt' && selectedModel && selectedRange && (
                                                <ModelConfigurationEditor 
                                                    model={selectedModel}
                                                    docPath={`data-warehouse/${mainVendor.id}/ranges/${selectedRange.id}/models/${selectedModel.id}`}
                                                    vendor={mainVendor}
                                                    module={moduleData}
                                                    user={user}
                                                    isAdmin={isAdmin}
                                                    organisationId={dashboardOrg?.id}
                                                    permissions={userPermissions}
                                                    breadcrumbs={
                                                        <div className="flex items-center text-[10px] font-bold uppercase tracking-widest opacity-60">
                                                            <span>{selectedRange.name}</span>
                                                            <ChevronRight className="h-3 w-3 mx-1" />
                                                            <span className="text-primary">{selectedModel.name}</span>
                                                        </div>
                                                    }
                                                />
                                            )}
                                        </>
                                    ) : isMotorBrand && mainVendor ? (
                                        <MotorModuleBrowser vendor={mainVendor} onMotorSelect={handleMotorSelect} />
                                    ) : (
                                        <div className="py-20 text-center opacity-20"><Wrench className="h-16 w-16 mx-auto" /></div>
                                    )}
                                </CardContent>
                            </Card>
                        </ScrollArea>
                    </TabsContent>

                    <TabsContent value="pricing" className="m-0 h-full p-6 overflow-hidden">
                        <ScrollArea className="h-full">
                            {dashboardOrg && mainVendor && (
                                <ModulePricingDashboard module={moduleData} organisation={dashboardOrg as any} vendor={mainVendor} />
                            )}
                        </ScrollArea>
                    </TabsContent>
                </Tabs>
            </main>

            {mainVendor && (
                <QuoteSelectorDialog 
                    isOpen={isNewQuoteOpen} 
                    setIsOpen={setIsNewQuoteOpen} 
                    vendor={mainVendor} 
                    moduleSlug={moduleData.slug || moduleData.id}
                />
            )}
        </div>
    );
}

function RangesGrid({ vendor, onRangeSelect }: { vendor: any; onRangeSelect: (range: Range) => void }) {
    const firestore = useFirestore();
    const rangesQuery = useMemoFirebase(() => {
        if (!vendor?.id) return null;
        return query(collection(firestore, `data-warehouse/${vendor.id}/ranges`), orderBy('order'));
    }, [firestore, vendor.id]);
    const { data: ranges, loading } = useCollection<Range>(rangesQuery);

    if (loading) return <Loader2 className="animate-spin mx-auto my-12" />;
    
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {ranges?.map(range => (
                <Card key={range.id} className="cursor-pointer group hover:border-primary shadow-sm rounded-3xl overflow-hidden" onClick={() => onRangeSelect(range)}>
                    <div className="aspect-video relative bg-slate-50 border-b">
                        {range.imageUrl ? <Image src={range.imageUrl} alt={range.name} fill className="object-cover p-4" unoptimized /> : <div className="flex h-full w-full items-center justify-center"><Ship className="opacity-10" /></div>}
                    </div>
                    <CardHeader className="p-4 text-center">
                        <CardTitle className="text-sm font-black uppercase tracking-tight">{range.name}</CardTitle>
                    </CardHeader>
                </Card>
            ))}
        </div>
    );
}

function ModelsGrid({ range, vendor, onModelSelect, isAdmin }: { range: Range; vendor: any; onModelSelect: (model: Model) => void; isAdmin: boolean }) {
    const firestore = useFirestore();
    const modelsQuery = useMemoFirebase(() => {
        if (!vendor?.id || !range?.id) return null;
        return query(collection(firestore, `data-warehouse/${vendor.id}/ranges/${range.id}/models`), orderBy('order'));
    }, [firestore, vendor.id, range.id]);
    const { data: models, loading } = useCollection<Model>(modelsQuery);

    if (loading) return <Loader2 className="animate-spin mx-auto my-12" />;

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {models?.map(model => (
                <Card key={model.id} className="cursor-pointer group hover:border-primary shadow-sm rounded-3xl overflow-hidden" onClick={() => onModelSelect(model)}>
                    <div className="aspect-video relative bg-slate-50 border-b">
                        {model.coverImageUrl ? <Image src={model.coverImageUrl} alt={model.name} fill className="object-cover" unoptimized /> : <div className="flex h-full w-full items-center justify-center"><Ship className="opacity-10" /></div>}
                    </div>
                    <CardHeader className="p-4 text-center">
                        <CardTitle className="text-xs font-black uppercase tracking-tight">{model.name}</CardTitle>
                        {model.modelCode && <Badge variant="secondary" className="mt-1 font-mono text-[8px] uppercase">{model.modelCode}</Badge>}
                    </CardHeader>
                </Card>
            ))}
        </div>
    );
}

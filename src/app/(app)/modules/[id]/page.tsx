
'use client';

import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useMemoFirebase, useStorage } from '@/firebase/provider';
import { collection, query, where, orderBy, doc, updateDoc, writeBatch, getDocs, deleteDoc, setDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { uploadFileToStorage } from '@/firebase/storage';
import { 
    Loader2, 
    ChevronRight, 
    ChevronLeft,
    Wrench, 
    FileText, 
    PlusCircle,
    Navigation,
    Anchor,
    Ship,
    LayoutGrid,
    X,
    Zap,
    Trash2,
    Map as MapIcon,
    ClipboardList,
    Building,
    Pencil,
    GripVertical,
    Upload,
    ImageIcon,
    Save,
    ArrowRight,
    Hammer,
    Coins,
    Package,
    Settings,
    FileSpreadsheet,
    ScrollText,
    Waves
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useDoc } from '@/firebase/firestore/use-doc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUser } from '@/firebase/auth/use-user';
import { ModelConfigurationEditor } from '@/components/model-configuration-editor';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn, createSlug } from '@/lib/utils';
import { StockList } from '@/components/stock-list';
import { VesselOnOrderList } from '@/components/vessel-on-order-list';
import { ModulePricingDashboard } from '@/components/module-pricing-dashboard';
import { HighfieldPricingWorkspace } from '@/components/highfield-pricing-workspace';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { VesselMap } from '@/components/map';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
    permissions?: Record<string, Record<string, boolean>>;
    subDealersEnabled?: boolean;
    phoneNumber?: string;
    address?: string;
    roles?: any[];
    shortCode?: string;
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
}

interface Template {
    id: string;
    name: string;
    type: 'Quote' | 'Invoice' | 'Contract';
    moduleId: string;
    createdByUserId: string;
    createdAt: any;
}

function BuildTransitionOverlay({ organisation, model }: { organisation?: Organisation | null, model: Model | null }) {
    return (
        <div className="fixed inset-0 z-[100] bg-primary flex flex-col items-center justify-center text-white overflow-hidden animate-in fade-in duration-500">
            <div className="absolute inset-0 z-0">
                <div className="absolute top-20 right-20 w-[400px] h-[400px] bg-indigo-400/10 rounded-full blur-3xl animate-pulse duration-[4000ms]" />
            </div>

            <div className="relative z-10 flex flex-col items-center gap-12 max-w-2xl text-center">
                <div className="relative h-64 w-64 bg-white/10 backdrop-blur-xl rounded-[3.5rem] p-10 border border-white/20 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] animate-in zoom-in-95 duration-700">
                    {organisation?.primaryLogoUrl ? (
                        <div className="relative h-full w-full">
                            <Image 
                                src={organisation.primaryLogoUrl} 
                                alt={organisation.name} 
                                fill 
                                className="object-contain p-2 brightness-0 invert" 
                                unoptimized
                            />
                        </div>
                    ) : (
                        <Ship className="h-full w-full text-white/40" />
                    )}
                </div>

                <div className="space-y-4">
                    <div className="flex items-center justify-center gap-3 text-[12px] font-black uppercase tracking-[0.5em] text-white/50 leading-none">
                        <Zap className="h-4 w-4 fill-current" />
                        <span>Initializing Precision Build</span>
                    </div>
                    <h2 className="text-6xl font-black italic uppercase tracking-tighter">
                        {model?.name}
                    </h2>
                </div>

                <div className="relative w-64 h-1.5 flex items-center justify-center bg-white/10 rounded-full overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-[shimmer_2s_infinite] w-1/2" />
                </div>

                <p className="text-[12px] font-bold uppercase tracking-widest text-white/60 animate-pulse">
                    Synchronizing factory data sets...
                </p>
            </div>
            
            <style jsx global>{`
                @keyframes shimmer {
                    0% { transform: translateX(-200%); }
                    100% { transform: translateX(200%); }
                }
            `}</style>
        </div>
    );
}

function CreateTemplateDialog({ isOpen, onOpenChange, moduleId, orgId }: { isOpen: boolean, onOpenChange: (open: boolean) => void, moduleId: string, orgId: string }) {
    const firestore = useFirestore();
    const { user } = useUser();
    const router = useRouter();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [name, setName] = useState('');
    const [type, setType] = useState<'Quote' | 'Invoice' | 'Contract'>('Quote');

    const handleCreate = async () => {
        if (!user || !name.trim() || !orgId) return;
        setIsLoading(true);
        try {
            const templateRef = doc(collection(firestore, `organisations/${orgId}/templates`));
            const templateData = {
                id: templateRef.id,
                name,
                type,
                moduleId,
                createdByUserId: user.uid,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                pages: [
                    { id: 'page-1', blocks: [], headerHeight: 20, footerHeight: 20, order: 1 }
                ]
            };
            await setDoc(templateRef, templateData);
            
            toast({ title: "Template Created" });
            router.push(`/modules/${moduleId}/templates/${templateRef.id}`);
        } catch (e) {
            toast({ variant: 'destructive', title: "Failed to create template" });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md rounded-[2rem] border-4 shadow-2xl p-0 overflow-hidden">
                <DialogHeader className="p-8 border-b bg-muted/5">
                    <DialogTitle className="text-2xl font-black uppercase tracking-tight italic text-primary">New Template</DialogTitle>
                    <DialogDescription className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">Universal Document Architecture</DialogDescription>
                </DialogHeader>
                <div className="p-8 space-y-6">
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Template Name</Label>
                        <Input placeholder="e.g. Premium Sales Proposal" value={name} onChange={e => setName(e.target.value)} className="h-12 font-bold border-2 rounded-xl" />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Document Class</Label>
                        <Select value={type} onValueChange={(v: any) => setType(v)}>
                            <SelectTrigger className="h-12 font-black text-xs border-2 rounded-xl bg-background">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border-2">
                                <SelectItem value="Quote" className="text-[10px] font-bold uppercase py-2.5">Sales Quote</SelectItem>
                                <SelectItem value="Contract" className="text-[10px] font-bold uppercase py-2.5">Sales Contract</SelectItem>
                                <SelectItem value="Invoice" className="text-[10px] font-bold uppercase py-2.5">Invoice</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter className="p-8 bg-muted/5 border-t gap-3">
                    <DialogClose asChild><Button variant="outline" className="h-12 px-8 rounded-xl font-black uppercase text-[10px] border-2">Cancel</Button></DialogClose>
                    <Button onClick={handleCreate} disabled={!name.trim() || isLoading} className="h-12 px-10 rounded-xl font-black uppercase text-[10px] shadow-xl bg-primary text-white">
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <PlusCircle className="h-4 w-4 mr-2" />}
                        Generate Editor
                    </Button>
                </DialogFooter>
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

    const [activeTab, setActiveTab] = useState('dashboard');
    const [view, setView] = useState<'ranges' | 'models' | 'bmt'>('ranges');
    const [selectedRange, setSelectedRange] = useState<Range | null>(null);
    const [selectedModel, setSelectedModel] = useState<Model | null>(null);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [isCreateTemplateOpen, setIsCreateTemplateOpen] = useState(false);
    
    const { user } = useUser();
    const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
    const { data: userProfile } = useDoc<any>(userProfileRef);
    const isAdmin = userProfile?.appRole === 'HelmLogic Admin';

    const moduleQueryBySlug = useMemoFirebase(() => slugOrId ? query(collection(firestore, 'modules'), where('slug', '==', slugOrId)) : null, [firestore, slugOrId]);
    const { data: modulesBySlug, loading: slugLoading } = useCollection<any>(moduleQueryBySlug);
    const moduleByIdRef = useMemoFirebase(() => slugOrId ? doc(firestore, 'modules', slugOrId) : null, [firestore, slugOrId]);
    const { data: moduleById, loading: idLoading } = useDoc<any>(moduleByIdRef);
    const moduleData = useMemo(() => moduleById || modulesBySlug?.[0], [modulesBySlug, moduleById]);

    const mainVendorRef = useMemoFirebase(() => moduleData ? doc(firestore, 'data-warehouse', moduleData.mainVendorId) : null, [firestore, moduleData]);
    const { data: mainVendor, loading: mainVendorLoading } = useDoc<Vendor>(mainVendorRef);
    
    const organisationsQuery = useMemoFirebase(() => collection(firestore, 'organisations'), [firestore]);
    const { data: allOrganisations } = useCollection<Organisation>(organisationsQuery);
    
    const currentMemberOrg = useMemo(() => 
        userProfile?.organisationId ? allOrganisations?.find(o => o.id === userProfile.organisationId) : null,
    [userProfile?.organisationId, allOrganisations]);

    const subDealersQuery = useMemoFirebase(() => {
        if (!currentMemberOrg?.id) return null;
        return query(collection(firestore, 'organisations'), where('parentOrganisationId', '==', currentMemberOrg.id));
    }, [firestore, currentMemberOrg?.id]);
    const { data: subDealers } = useCollection<Organisation>(subDealersQuery);

    const userPermissions = useMemo(() => {
        const roleId = userProfile?.organisationRole;
        if (!roleId || !currentMemberOrg?.permissions?.[roleId]) return {};
        return currentMemberOrg.permissions[roleId];
    }, [userProfile, currentMemberOrg]);

    const templatesQuery = useMemoFirebase(() => {
        if (!currentMemberOrg?.id || !moduleData) return null;
        return query(collection(firestore, `organisations/${currentMemberOrg.id}/templates`), where('moduleId', '==', moduleData.id));
    }, [firestore, currentMemberOrg?.id, moduleData]);
    
    const { data: rawTemplates } = useCollection<Template>(templatesQuery);

    const templates = useMemo(() => {
        if (!rawTemplates) return null;
        return [...rawTemplates].sort((a, b) => {
            const dateA = a.createdAt?.seconds || 0;
            const dateB = b.createdAt?.seconds || 0;
            return dateB - dateA;
        });
    }, [rawTemplates]);

    const canEdit = isAdmin || !!userPermissions.can_edit_boat_data;

    const canAccessPricing = useMemo(() => {
        if (isAdmin) return true;
        const roleId = userProfile?.organisationRole;
        const isMD = currentMemberOrg?.roles?.find((r: any) => r.id === roleId)?.name === 'Managing Director';
        return !!userPermissions.can_access_pricing_manager || isMD;
    }, [isAdmin, userPermissions, userProfile, currentMemberOrg]);

    const handleRangeSelect = (range: Range) => { setSelectedRange(range); setView('models'); };
    
    const handleModelSelect = (model: Model) => { 
        setSelectedModel(model); 
        setIsTransitioning(true);
        setTimeout(() => {
            setView('bmt');
            setIsTransitioning(false);
        }, 2200);
    };

    const handleBackToCatalog = () => {
        if (view === 'bmt') {
            setView('models');
            setSelectedModel(null);
        } else if (view === 'models') {
            setView('ranges');
            setSelectedRange(null);
        }
    };

    const loading = slugLoading || idLoading || mainVendorLoading;

    if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin h-12 w-12 text-primary" /></div>;
    if (!moduleData) return <div className="p-12 text-center font-bold">Module Context Lost.</div>;

    const navTabs = [
        { id: 'dashboard', label: 'Dashboard' },
        { id: 'bmt', label: 'Catalog' },
        { id: 'stock', label: 'Stock Management' },
        { id: 'pricing', label: 'Pricing', visible: canAccessPricing },
        { id: 'settings', label: 'Settings' }
    ].filter(t => t.visible !== false);

    return (
        <div className="flex flex-col h-screen overflow-hidden bg-background">
            {isTransitioning && <BuildTransitionOverlay organisation={currentMemberOrg as any} model={selectedModel} />}

            <div className="relative shrink-0 overflow-hidden bg-primary px-12 text-primary-foreground z-20 h-44 border-b-2 border-white/10">
                <div className="absolute inset-0 z-0 bg-primary/95">
                    <div className="absolute top-[-40%] left-[-10%] w-[80%] h-[180%] bg-blue-400/20 blur-[120px] rounded-full animate-pulse pointer-events-none" />
                    <div className="absolute bottom-[-50%] right-[-10%] w-[90%] h-[190%] bg-indigo-600/30 blur-[140px] rounded-full animate-pulse duration-[8000ms] pointer-events-none" />
                </div>
                
                <div className="relative z-10 flex flex-col h-full justify-center">
                    <div className="flex items-center justify-between w-full gap-12">
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-[8px] font-black uppercase tracking-[0.4em] text-white/50 leading-none">
                                <Navigation className="h-2.5 w-2.5" />
                                <span>COMMAND CENTER</span>
                            </div>
                            <h1 className="text-3xl sm:text-5xl font-black tracking-tighter uppercase italic leading-none drop-shadow-2xl">
                                {moduleData.name}
                            </h1>
                        </div>
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 sm:h-10 px-4 sm:px-6 font-black uppercase tracking-widest text-[9px] sm:text-[10px] bg-white/5 hover:bg-white/10 text-white rounded-full transition-all border border-white/5 group shadow-xl"
                            onClick={() => router.push('/dashboard')}
                        >
                            <X className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2 transition-transform group-hover:rotate-90" />
                            <span>Back to Hub</span>
                        </Button>
                    </div>
                </div>
            </div>

            <div className="bg-white border-b shrink-0 z-10 px-10">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className={cn("grid w-full h-12 bg-transparent p-0 gap-4", `grid-cols-${navTabs.length}`)}>
                        {navTabs.map((t) => (
                            <TabsTrigger 
                                key={t.id} 
                                value={t.id} 
                                className="rounded-none border-b-4 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent font-black uppercase text-[10px] tracking-[0.2em] h-full transition-all duration-300 text-slate-500 data-[state=active]:text-slate-950 hover:text-slate-700"
                            >
                                {t.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
            </div>

            <main className="flex-1 overflow-hidden relative">
                <Tabs value={activeTab} className="h-full">
                    <TabsContent value="dashboard" className="m-0 h-full animate-in fade-in duration-500 overflow-hidden">
                        <ScrollArea className="h-full">
                            <div className="p-8 min-h-[calc(100vh-224px)] flex flex-col">
                                <div className="grid grid-cols-12 gap-8 flex-1">
                                    <div className="col-span-4 flex flex-col gap-8 h-full">
                                        <Card className="flex-1 flex flex-col border-2 rounded-[2.5rem] shadow-sm bg-white overflow-hidden transition-all hover:shadow-md">
                                            <CardHeader className="py-4 px-8 border-b bg-muted/5 flex flex-row items-center justify-between shrink-0 flex-nowrap">
                                                <div className="flex items-center gap-3 shrink-0">
                                                    <Badge variant="outline" className="h-5 text-[9px] font-black uppercase border-primary/20 text-primary bg-primary/5 px-2">Asset</Badge>
                                                    <h3 className="font-black uppercase italic text-sm tracking-tight text-slate-900 whitespace-nowrap">Stock</h3>
                                                </div>
                                                <Button variant="ghost" size="icon" onClick={() => setActiveTab('stock')} className="h-8 w-8 text-primary hover:bg-primary hover:text-white rounded-full transition-colors active:scale-95"><ArrowRight className="h-4 w-4" /></Button>
                                            </CardHeader>
                                            <CardContent className="flex-1 min-h-0 p-0">
                                                <StockList organisation={currentMemberOrg as any} subDealers={subDealers || []} parentOrg={null} moduleId={moduleData.id} filterOrgId="local" isAdmin={isAdmin} />
                                            </CardContent>
                                        </Card>

                                        <Card className="flex-1 flex flex-col border-2 rounded-[2.5rem] shadow-sm bg-white overflow-hidden transition-all hover:shadow-md">
                                            <CardHeader className="py-4 px-8 border-b bg-muted/5 flex flex-row items-center justify-between shrink-0 flex-nowrap">
                                                <div className="flex items-center gap-3 shrink-0">
                                                    <Badge variant="outline" className="h-5 text-[9px] font-black uppercase border-green-500/20 text-green-600 bg-green-50/50 px-2">Pipeline</Badge>
                                                    <h3 className="font-black uppercase italic text-sm tracking-tight text-slate-900 whitespace-nowrap">On Order</h3>
                                                </div>
                                                <Button variant="ghost" size="icon" onClick={() => setActiveTab('stock')} className="h-8 w-8 text-primary hover:bg-primary hover:text-white rounded-full transition-colors active:scale-95"><ArrowRight className="h-4 w-4" /></Button>
                                            </CardHeader>
                                            <CardContent className="flex-1 min-h-0 p-0">
                                                <VesselOnOrderList organisation={currentMemberOrg as any} parentOrg={null} moduleId={moduleData.id} isAdmin={isAdmin} />
                                            </CardContent>
                                        </Card>
                                    </div>

                                    <Card className="col-span-8 flex flex-col border-2 rounded-[3rem] shadow-2xl bg-white overflow-hidden">
                                        <CardHeader className="p-10 border-b bg-slate-50/30 flex flex-row items-center justify-between shrink-0">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-primary">
                                                    <Anchor className="h-3.5 w-3.5" />
                                                    <span>Quotation Engine</span>
                                                </div>
                                                <h2 className="text-4xl font-black tracking-tight text-slate-950 uppercase italic">Recent Proposals</h2>
                                            </div>
                                            <Button 
                                                onClick={() => setActiveTab('bmt')}
                                                className="h-14 px-10 rounded-[1.5rem] font-black uppercase tracking-widest text-[10px] shadow-2xl transition-all hover:scale-105 active:scale-95 bg-primary text-white border-none group"
                                            >
                                                <PlusCircle className="mr-3 h-5 w-5 transition-transform group-hover:rotate-90" />
                                                Generate New Quote
                                            </Button>
                                        </CardHeader>
                                        <CardContent className="flex-1 p-10 flex flex-col items-center justify-center text-center gap-8">
                                            <div className="h-32 w-32 bg-slate-50 rounded-[2.5rem] flex items-center justify-center border-2 border-dashed border-slate-200">
                                                <FileText className="h-12 w-12 text-slate-200" />
                                            </div>
                                            <div className="space-y-4">
                                                <p className="font-black uppercase tracking-[0.3em] text-sm text-slate-400">Proposal Queue Empty</p>
                                                <Button variant="outline" onClick={() => setActiveTab('bmt')} className="font-black uppercase text-[10px] tracking-widest rounded-xl border-2">Select a boat to start</Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                            </div>
                        </ScrollArea>
                    </TabsContent>

                    <TabsContent value="bmt" className="m-0 h-full animate-in fade-in duration-500 overflow-hidden">
                        <ScrollArea className="h-full">
                            <div className="p-6 md:p-8 flex flex-col gap-4 pb-32">
                                <div className="shrink-0 px-1 mb-0">
                                    {view === 'ranges' ? (
                                        <div className="relative inline-flex items-center h-10 sm:h-12 px-8 font-black uppercase text-[11px] tracking-[0.3em] text-primary border-primary/30 border-2 bg-white rounded-2xl shadow-[0_10px_30px_-10px_rgba(var(--primary),0.3)] overflow-hidden group">
                                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent -translate-x-full group-hover:animate-[shimmer_3s_infinite] transition-transform" />
                                            <Ship className="mr-3 h-5 w-5 text-primary relative z-10" />
                                            <span className="relative z-10">{mainVendor?.name || 'Highfield'} Catalog</span>
                                        </div>
                                    ) : (
                                        <Button 
                                            variant="outline" 
                                            onClick={handleBackToCatalog} 
                                            className="relative h-10 sm:h-12 px-8 font-black uppercase text-[11px] tracking-[0.3em] text-primary border-primary/30 border-2 bg-white hover:bg-primary hover:text-white transition-all rounded-2xl shadow-[0_10px_30px_-10px_rgba(var(--primary),0.3)] group overflow-hidden"
                                        >
                                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_3s_infinite] transition-transform" />
                                            <ChevronLeft className="mr-3 h-5 w-5 transition-transform group-hover:-translate-x-1.5 relative z-10" /> 
                                            <span className="relative z-10">Return to Catalog Explorer</span>
                                        </Button>
                                    )}
                                </div>

                                <div className="animate-in fade-in slide-in-from-bottom-2 duration-700">
                                    {view === 'ranges' && <RangesGrid vendor={mainVendor as any} onRangeSelect={handleRangeSelect} canEdit={canEdit} />}
                                    {view === 'models' && selectedRange && <ModelsGrid range={selectedRange} vendor={mainVendor as any} onModelSelect={handleModelSelect} canEdit={canEdit} />}
                                    {view === 'bmt' && selectedModel && selectedRange && (
                                        <ModelConfigurationEditor 
                                            model={selectedModel}
                                            docPath={`data-warehouse/${mainVendor!.id}/ranges/${selectedRange.id}/models/${selectedModel!.id}`}
                                            vendor={mainVendor}
                                            module={moduleData}
                                            user={user as any}
                                            isAdmin={isAdmin}
                                            organisationId={currentMemberOrg?.id}
                                            breadcrumbs={null}
                                            permissions={userPermissions as any}
                                        />
                                    )}
                                </div>
                            </div>
                        </ScrollArea>
                    </TabsContent>

                    <TabsContent value="pricing" className="m-0 h-full overflow-hidden">
                        <div className="h-full flex flex-col">
                            {currentMemberOrg && mainVendor && (
                                mainVendor.slug === 'highfield' ? (
                                    <HighfieldPricingWorkspace vendor={mainVendor} organisationId={currentMemberOrg.id} />
                                ) : (
                                    <ScrollArea className="flex-1">
                                        <div className="p-8">
                                            <ModulePricingDashboard module={moduleData} organisation={currentMemberOrg as any} vendor={mainVendor} />
                                        </div>
                                    </ScrollArea>
                                )
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="settings" className="m-0 h-full animate-in fade-in duration-500 overflow-hidden">
                        <ScrollArea className="h-full">
                            <div className="p-8 grid md:grid-cols-2 gap-8 pb-32">
                                <Card className="border-2 rounded-[2.5rem] shadow-sm bg-white overflow-hidden flex flex-col">
                                    <CardHeader className="py-4 px-8 border-b bg-muted/5 flex flex-row items-center justify-between shrink-0">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.3em] text-primary">
                                                <Waves className="h-3 w-3" />
                                                <span>Template Studio</span>
                                            </div>
                                            <h3 className="font-black uppercase italic text-sm tracking-tight text-slate-900 whitespace-nowrap">Document Templates</h3>
                                        </div>
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-10 w-10 text-primary hover:bg-primary hover:text-white rounded-2xl transition-all active:scale-90 border-2 border-primary/10 shadow-sm"
                                            onClick={() => setIsCreateTemplateOpen(true)}
                                        >
                                            <PlusCircle className="h-5 w-5" />
                                        </Button>
                                    </CardHeader>
                                    <CardContent className="flex-1 min-h-[200px] flex flex-col p-0 bg-slate-50/30">
                                        {templates && templates.length > 0 ? (
                                            <div className="divide-y divide-slate-200">
                                                {templates.map(t => (
                                                    <Link 
                                                        key={t.id} 
                                                        href={`/modules/${moduleData.id}/templates/${t.id}`}
                                                        className="flex items-center justify-between px-8 py-5 hover:bg-white transition-all group"
                                                    >
                                                        <div className="flex items-center gap-5">
                                                            <div className="h-12 w-12 rounded-2xl bg-white border-2 flex items-center justify-center text-primary shadow-sm group-hover:scale-110 transition-transform">
                                                                <FileSpreadsheet className="h-6 w-6" />
                                                            </div>
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    <Badge variant="outline" className="h-4 text-[7px] font-black uppercase border-primary/20 text-primary px-1.5">{t.type}</Badge>
                                                                    <p className="font-black uppercase text-[11px] tracking-tight text-slate-900">{t.name}</p>
                                                                </div>
                                                                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Universal Template Definition</p>
                                                            </div>
                                                        </div>
                                                        <ChevronRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                                                    </Link>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                                                <div className="space-y-2 opacity-20">
                                                    <ScrollText className="h-12 w-12 mx-auto text-slate-400" />
                                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mt-4">No Document Templates Defined</p>
                                                </div>
                                                <Button variant="outline" size="sm" className="mt-6 font-black uppercase text-[9px] tracking-widest border-2 rounded-xl" onClick={() => setIsCreateTemplateOpen(true)}>Initialize First Template</Button>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>

                                {currentMemberOrg?.subDealersEnabled && (
                                    <Card className="border-2 rounded-[2.5rem] overflow-hidden bg-white shadow-sm flex flex-col">
                                        <CardHeader className="p-8 border-b bg-muted/5 flex flex-row items-center justify-between shrink-0">
                                            <div>
                                                <CardTitle className="text-xl font-black uppercase tracking-tight">Sub Dealer Network</CardTitle>
                                                <CardDescription className="text-xs uppercase font-black text-muted-foreground tracking-widest">Manage business relationships and regional allocations.</CardDescription>
                                            </div>
                                            <Button asChild className="h-10 px-6 font-black uppercase text-[10px] tracking-widest rounded-xl shadow-lg">
                                                <Link href={`/organisations/${currentMemberOrg.id}/add-sub-dealer`}>
                                                    <PlusCircle className="mr-2 h-4 w-4" />
                                                    Add Sub Dealer
                                                </Link>
                                            </Button>
                                        </CardHeader>
                                        <CardContent className="p-0 flex-1">
                                            {subDealers && subDealers.length > 0 ? (
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead className="px-8 font-black uppercase text-[10px]">Location</TableHead>
                                                            <TableHead className="px-8 font-black uppercase text-[10px]">Contact</TableHead>
                                                            <TableHead className="text-right px-8 font-black uppercase text-[10px]">Management</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {subDealers.map(sd => (
                                                            <TableRow key={sd.id} className="hover:bg-muted/5 transition-colors">
                                                                <TableCell className="px-8 py-4">
                                                                    <div className="font-black uppercase text-xs text-slate-900">{sd.name}</div>
                                                                    <div className="text-[10px] text-muted-foreground font-bold uppercase">{sd.address || 'Regional Allocation'}</div>
                                                                </TableCell>
                                                                <TableCell className="px-8 py-4 text-[10px] font-mono font-bold text-primary">{sd.phoneNumber || 'N/A'}</TableCell>
                                                                <TableCell className="text-right px-8 py-4">
                                                                    <Button variant="outline" size="sm" className="h-7 text-[10px] font-black uppercase rounded-lg border-2 shadow-sm" asChild>
                                                                        <Link href={`/sub-dealers/${sd.slug || sd.id}`}>Manage</Link>
                                                                    </Button>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            ) : (
                                                <div className="p-20 text-center text-muted-foreground opacity-20">
                                                    <Building className="h-12 w-12 mx-auto mb-4" />
                                                    <p className="font-black uppercase tracking-widest text-xs">No Sub Dealers Registered</p>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                )}
                            </div>
                        </ScrollArea>
                    </TabsContent>
                </Tabs>
            </main>

            <CreateTemplateDialog 
                isOpen={isCreateTemplateOpen} 
                onOpenChange={setIsCreateTemplateOpen} 
                moduleId={moduleData.id} 
                orgId={currentMemberOrg?.id || ''}
            />
        </div>
    );
}

function RangesGrid({ vendor, onRangeSelect, canEdit }: { vendor: Vendor; onRangeSelect: (range: Range) => void, canEdit: boolean }) {
    const firestore = useFirestore();
    const rangesQuery = useMemoFirebase(() => vendor?.id ? query(collection(firestore, `data-warehouse/${vendor.id}/ranges`), orderBy('order')) : null, [firestore, vendor?.id]);
    const { data: ranges, loading } = useCollection<Range>(rangesQuery);

    if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-10 w-10 text-primary" /></div>;
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8 py-2 px-1">
            {ranges?.map(range => (
                <Card key={range.id} className="cursor-pointer hover:border-primary hover:shadow-xl transition-all rounded-[1.5rem] overflow-hidden group border-2 hover:-translate-y-1" onClick={() => onRangeSelect(range)}>
                    <div className="aspect-video bg-muted/30 relative border-b">
                        {range.imageUrl ? <Image src={range.imageUrl} alt={range.name} fill className="object-cover" unoptimized /> : <div className="flex items-center justify-center h-full"><Ship className="h-8 w-8 opacity-10" /></div>}
                    </div>
                    <div className="p-4 text-center"><p className="font-black uppercase tracking-tighter text-sm">{range.name}</p></div>
                </Card>
            ))}
        </div>
    );
}

function ModelsGrid({ range, vendor, onModelSelect, canEdit }: { range: Range; vendor: Vendor; onModelSelect: (model: Model) => void; canEdit: boolean }) {
    const firestore = useFirestore();
    const modelsQuery = useMemoFirebase(() => vendor?.id && range?.id ? query(collection(firestore, `data-warehouse/${vendor.id}/ranges/${range.id}/models`), orderBy('order')) : null, [firestore, vendor?.id, range?.id]);
    const { data: models, loading = false } = useCollection<Model>(modelsQuery);

    if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-10 w-10 text-primary" /></div>;
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8 py-2 px-1">
            {models?.map(model => (
                <Card key={model.id} className="cursor-pointer hover:border-primary hover:shadow-xl transition-all rounded-[1.5rem] overflow-hidden group border-2 hover:-translate-y-1" onClick={() => onModelSelect(model)}>
                    <div className="aspect-video bg-muted/30 relative border-b">
                        {model.coverImageUrl ? <Image src={model.coverImageUrl} alt={model.name} fill className="object-cover" unoptimized /> : <div className="flex items-center justify-center h-full"><Ship className="opacity-10" /></div>}
                    </div>
                    <div className="p-4 text-center space-y-1">
                        <p className="font-black uppercase tracking-tighter text-xs">{model.name}</p>
                    </div>
                </Card>
            ))}
        </div>
    );
}

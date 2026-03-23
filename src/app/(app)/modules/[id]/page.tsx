'use client';

import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useMemoFirebase, useStorage } from '@/firebase';
import { uploadFileToStorage } from '@/firebase/storage';
import {
    collection,
    query,
    where,
    orderBy,
    limit,
    doc,
    setDoc,
    updateDoc,
    serverTimestamp,
    writeBatch,
} from 'firebase/firestore';
import {
    Loader2,
    ChevronRight,
    ChevronLeft,
    FileText,
    PlusCircle,
    Navigation,
    Anchor,
    Ship,
    X,
    Zap,
    ArrowRight,
    Package,
    Waves,
    ScrollText,
    FileSpreadsheet,
    GripVertical,
    Pencil,
    DollarSign,
    User,
    ImageIcon,
    Upload,
    Save,
    Building,
    Layout
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useDoc } from '@/firebase/firestore/use-doc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUser } from '@/firebase/auth/use-user';
import { ModelConfigurationEditor } from '@/components/model-configuration-editor';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn, createSlug } from '@/lib/utils';
import { StockList } from '@/components/inventory-list';
import { VesselOnOrderList } from '@/components/vessel-on-order-list';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { HelmLogicLoading } from "@/components/helmlogic-loading";
import { HighfieldPricingWorkspace } from '@/components/highfield-pricing-workspace';

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface UserProfile {
    displayName?: string;
    appRole?: string;
    organisationId?: string;
    organisationRole?: string;
    moduleOrder?: string[];
}

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
  rangeId: string;
}

function getEffectiveModel(master: any, override: any) {
    if (!master) return null;
    if (!override) return master;

    const merged = { ...master, ...override };
    
    if (master.optionalFeatures && Array.isArray(master.optionalFeatures)) {
        const masterFeatures = master.optionalFeatures;
        const overrideFeatures = override.optionalFeatures || [];
        const overrideMap = new Map(overrideFeatures.map((f: any) => [f.id, f]));
        
        const mergedFeatures = masterFeatures.map((mf: any) => {
            const of = overrideMap.get(mf.id);
            if (of) return { ...mf, ...of };
            return mf;
        });

        const masterIds = new Set(masterFeatures.map((f: any) => f.id));
        overrideFeatures.forEach((of: any) => {
            if (!masterIds.has(of.id)) {
                mergedFeatures.push(of);
            }
        });

        merged.optionalFeatures = mergedFeatures;
    }

    return merged;
}

function QuoteInitializationDialog({ 
    isOpen, 
    onOpenChange, 
    vendor, 
    onModelSelect 
}: { 
    isOpen: boolean, 
    onOpenChange: (open: boolean) => void, 
    vendor: Vendor | null,
    onModelSelect: (model: Model, range: Range) => void
}) {
    const firestore = useFirestore();
    const [selectedRange, setSelectedRange] = useState<Range | null>(null);

    const rangesQuery = useMemoFirebase(() =>
        vendor?.id ? collection(firestore, `data-warehouse/${vendor.id}/ranges`) : null,
    [firestore, vendor?.id]);
    const { data: ranges, isLoading: rangesLoading } = useCollection<Range>(rangesQuery);

    const modelsQuery = useMemoFirebase(() =>
        vendor?.id && selectedRange?.id ? collection(firestore, `data-warehouse/${vendor.id}/ranges/${selectedRange.id}/models`) : null,
    [firestore, vendor?.id, selectedRange?.id]);
    const { data: models, isLoading: modelsLoading } = useCollection<Model>(modelsQuery);

    useEffect(() => {
        if (!isOpen) {
            setSelectedRange(null);
        }
    }, [isOpen]);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-6xl rounded-[3rem] border-4 shadow-2xl p-0 overflow-hidden">
                <DialogHeader className="p-12 border-b bg-muted/5 flex flex-row items-center justify-between">
                    <div>
                        <DialogTitle className="text-3xl font-black uppercase tracking-tight italic text-primary">Initialize Quotation</DialogTitle>
                        <DialogDescription className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mt-1">Select a series to begin precision build</DialogDescription>
                    </div>
                    {selectedRange && (
                        <Button variant="ghost" size="sm" className="h-10 px-6 font-black uppercase tracking-widest text-[9px] rounded-xl border-2" onClick={() => setSelectedRange(null)}>
                            <ChevronLeft className="mr-2 h-4 w-4" /> Change Range
                        </Button>
                    )}
                </DialogHeader>
                
                <div className="p-12 min-h-[600px]">
                    {!selectedRange ? (
                        <div className="space-y-10">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 border-l-4 border-primary pl-4">1. Select Product Range</h3>
                            {rangesLoading ? (
                                <div className="flex justify-center py-20"><Loader2 className="animate-spin h-10 w-10 text-primary" /></div>
                            ) : (
                                <div className="grid grid-cols-5 gap-6">
                                    {ranges?.map(range => (
                                        <Card key={range.id} className="cursor-pointer group hover:border-primary/40 transition-all rounded-[2rem] overflow-hidden border-2 shadow-sm h-full flex flex-col" onClick={() => setSelectedRange(range)}>
                                            <div className="aspect-[16/10] bg-muted/30 relative border-b overflow-hidden p-6 flex items-center justify-center">
                                                {range.imageUrl && (
                                                    <Image 
                                                        src={range.imageUrl} 
                                                        alt={range.name} 
                                                        fill 
                                                        className="object-contain p-4 group-hover:scale-105 transition-transform" 
                                                        
                                                    />
                                                )}
                                            </div>
                                            <div className="p-4 bg-white text-center flex-1 flex items-center justify-center">
                                                <span className="font-black uppercase text-[11px] tracking-[0.1em]">{range.name}</span>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-10 animate-in slide-in-from-right-4 duration-500">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 border-l-4 border-primary pl-4">2. Choose Boat Series: {selectedRange.name}</h3>
                            {modelsLoading ? (
                                <div className="flex justify-center py-20"><Loader2 className="animate-spin h-10 w-10 text-primary" /></div>
                            ) : (
                                <div className="grid grid-cols-5 gap-6">
                                    {models?.map(model => (
                                        <Card key={model.id} className="cursor-pointer group hover:border-primary/40 transition-all rounded-[2rem] overflow-hidden border-2 shadow-sm h-full flex flex-col" onClick={() => onModelSelect(model, selectedRange)}>
                                            <div className="aspect-video bg-muted/30 relative border-b overflow-hidden">
                                                {model.coverImageUrl && <Image src={model.coverImageUrl} alt={model.name} fill className="object-cover group-hover:scale-105 transition-transform" />}
                                            </div>
                                            <div className="p-4 bg-white text-center flex flex-col gap-1.5 flex-1 justify-center">
                                                <span className="font-black uppercase text-[11px] tracking-tight text-primary">{model.name}</span>
                                                <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">{model.modelCode}</span>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
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
    const storage = useStorage();

    const [activeTab, setActiveTab] = useState('dashboard');
    const [view, setView] = useState<'ranges' | 'models' | 'bmt'>('ranges');
    const [selectedRangeId, setSelectedRangeId] = useState<string | null>(null);
    const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [isQuoteInitializationOpen, setIsQuoteInitializationOpen] = useState(false);
    
    const [editingItem, setEditingItem] = useState<any>(null);
    const [isEditOpen, setIsEditOpen] = useState(false);

    const { user } = useUser();
    const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
    const { data: userProfile } = useDoc<any>(userProfileRef);
    const isAdmin = userProfile?.appRole === 'HelmLogic Admin';

    const moduleQueryBySlug = useMemoFirebase(() => slugOrId ? query(collection(firestore, 'modules'), where('slug', '==', slugOrId)) : null, [firestore, slugOrId]);
    const { data: modulesBySlug, isLoading: slugLoading } = useCollection<any>(moduleQueryBySlug);
    const moduleByIdRef = useMemoFirebase(() => slugOrId ? doc(firestore, 'modules', slugOrId) : null, [firestore, slugOrId]);
    const { data: moduleById, isLoading: idLoading } = useDoc<any>(moduleByIdRef);
    const moduleData = useMemo(() => moduleById || modulesBySlug?.[0], [modulesBySlug, moduleById]);

    const mainVendorRef = useMemoFirebase(() => moduleData ? doc(firestore, 'data-warehouse', moduleData.mainVendorId) : null, [firestore, moduleData]);
    const { data: mainVendor, isLoading: mainVendorLoading } = useDoc<Vendor>(mainVendorRef);
    
    const organisationsQuery = useMemoFirebase(() => collection(firestore, 'organisations'), [firestore]);
    const { data: allOrganisations } = useCollection<Organisation>(organisationsQuery);

    const currentMemberOrg = useMemo(() =>
        userProfile?.organisationId ? allOrganisations?.find((o: any) => o.id === userProfile.organisationId) : null,
    [userProfile?.organisationId, allOrganisations]);

    // Recent proposals for the dashboard
    const recentQuotesQuery = useMemoFirebase(() =>
        user ? query(
            collection(firestore, `users/${user.uid}/quotes`),
            orderBy('createdAt', 'desc'),
            limit(8)
        ) : null,
    [firestore, user]);
    const { data: recentQuotes } = useCollection<any>(recentQuotesQuery);

    const userPermissions = useMemo(() => {
        const roleId = userProfile?.organisationRole;
        if (!roleId || !currentMemberOrg?.permissions?.[roleId]) return {};
        return currentMemberOrg.permissions[roleId];
    }, [userProfile, currentMemberOrg]);

    const masterModelRef = useMemoFirebase(() => 
        mainVendor?.id && selectedRangeId && selectedModelId 
            ? doc(firestore, `data-warehouse/${mainVendor.id}/ranges/${selectedRangeId}/models`, selectedModelId) 
            : null, 
    [firestore, mainVendor?.id, selectedRangeId, selectedModelId]);
    const { data: masterModel, isLoading: masterModelLoading } = useDoc<any>(masterModelRef);

    const overrideRef = useMemoFirebase(() => 
        currentMemberOrg?.id && selectedModelId 
            ? doc(firestore, `organisations/${currentMemberOrg.id}/modelOverrides`, selectedModelId) 
            : null, 
    [firestore, currentMemberOrg?.id, selectedModelId]);
    const { data: overrideData, isLoading: overrideLoading } = useDoc<any>(overrideRef);

    const effectiveModel = useMemo(() => {
        return getEffectiveModel(masterModel, overrideData);
    }, [masterModel, overrideData]);

    const canEdit = isAdmin || !!userPermissions.can_edit_boat_data;

    const handleRangeSelect = (range: Range) => { setSelectedRangeId(range.id); setView('models'); };
    
    const handleModelSelect = (model: Model) => { 
        setSelectedModelId(model.id); 
        setIsTransitioning(true);
        setTimeout(() => {
            setView('bmt');
            setIsTransitioning(false);
        }, 1200);
    };

    const handleQuoteInitialization = (model: Model, range: Range) => {
        setSelectedModelId(model.id);
        setSelectedRangeId(range.id);
        setIsQuoteInitializationOpen(false);
        setIsTransitioning(true);
        router.push(`/modules/${moduleData.id}/quote/${model.id}?range=${range.id}&vendor=${mainVendor?.id}`);
    };

    const handleBackToCatalog = () => {
        if (view === 'bmt') {
            setView('models');
            setSelectedModelId(null);
        } else if (view === 'models') {
            setView('ranges');
            setSelectedRangeId(null);
        }
    };

    const handleQuickSaveEdit = async (data: any) => {
        if (!editingItem || !mainVendor) return;
        const isRange = 'vendorId' in editingItem;
        const path = isRange 
            ? `data-warehouse/${mainVendor.id}/ranges/${editingItem.id}`
            : `data-warehouse/${mainVendor.id}/ranges/${editingItem.rangeId}/models/${editingItem.id}`;
        
        const docRef = doc(firestore, path);
        const updateData: any = { name: data.name };

        if (data.image && storage) {
            const fileName = `cover-${Date.now()}`;
            const url = await uploadFileToStorage(storage, data.image, `${path}/${fileName}`);
            if (isRange) updateData.imageUrl = url;
            else updateData.coverImageUrl = url;
        }

        await updateDoc(docRef, updateData);
        toast({ title: "Item Updated" });
    };

    const loading = slugLoading || idLoading || mainVendorLoading;

    if (loading) return <HelmLogicLoading label="Synchronizing Module" />;
    if (!moduleData) return <div className="p-12 text-center font-bold">Module Context Lost.</div>;

    const navTabs = [
        { id: 'dashboard', label: 'Dashboard' },
        { id: 'bmt', label: 'Catalog' },
        { id: 'stock', label: 'Stock Management' },
        { id: 'pricing', label: 'Pricing', visible: (isAdmin || !!userPermissions.can_access_pricing_manager) },
        { id: 'settings', label: 'Settings' }
    ].filter(t => t.visible !== false);

    return (
        <div className="flex flex-col h-screen overflow-hidden bg-background">
            {(isTransitioning || masterModelLoading || overrideLoading) && (
                <HelmLogicLoading 
                    title={masterModel?.name || 'Loading Precision Build'} 
                    organisation={currentMemberOrg as any} 
                    label="Initializing Precision Build"
                />
            )}

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
                            className="h-10 px-6 font-black uppercase tracking-widest text-[10px] bg-white/5 hover:bg-white/10 text-white rounded-full transition-all border border-white/5 group shadow-xl flex items-center"
                            onClick={() => router.push('/dashboard')}
                        >
                            <X className="h-4 w-4 mr-2 transition-transform group-hover:rotate-90" />
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
                                    <div className="col-span-7 flex flex-col gap-8 h-full">
                                        <Card className="flex-1 flex flex-col border-2 rounded-[2.5rem] shadow-sm bg-white overflow-hidden transition-all hover:shadow-md">
                                            <CardHeader className="py-4 px-8 border-b bg-muted/5 flex flex-row items-center justify-between shrink-0 flex-nowrap">
                                                <div className="flex items-center gap-3 shrink-0">
                                                    <Badge variant="outline" className="h-5 text-[9px] font-black uppercase border-primary/20 text-primary bg-primary/5 px-2">Asset</Badge>
                                                    <h3 className="font-black uppercase italic text-sm tracking-tight text-slate-900 whitespace-nowrap">Stock Units</h3>
                                                </div>
                                                <Button variant="ghost" size="icon" onClick={() => setActiveTab('stock')} className="h-8 w-8 text-primary hover:bg-primary hover:text-white rounded-full transition-colors active:scale-95"><ArrowRight className="h-4 w-4" /></Button>
                                            </CardHeader>
                                            <CardContent className="flex-1 min-h-0 p-0">
                                                <StockList organisation={currentMemberOrg as any} subDealers={[]} parentOrg={null} moduleId={moduleData.id} filterOrgId="local" isAdmin={isAdmin} />
                                            </CardContent>
                                        </Card>

                                        <Card className="flex-1 flex flex-col border-2 rounded-[2.5rem] shadow-sm bg-white overflow-hidden transition-all hover:shadow-md">
                                            <CardHeader className="py-4 px-8 border-b bg-muted/5 flex flex-row items-center justify-between shrink-0 flex-nowrap">
                                                <div className="flex items-center gap-3 shrink-0">
                                                    <Badge variant="outline" className="h-5 text-[9px] font-black uppercase border-green-500/20 text-green-600 bg-green-50/50 px-2">Pipeline</Badge>
                                                    <h3 className="font-black uppercase italic text-sm tracking-tight text-slate-900 whitespace-nowrap">Corporate On Order</h3>
                                                </div>
                                                <Button variant="ghost" size="icon" onClick={() => setActiveTab('stock')} className="h-8 w-8 text-primary hover:bg-primary hover:text-white rounded-full transition-colors active:scale-95"><ArrowRight className="h-4 w-4" /></Button>
                                            </CardHeader>
                                            <CardContent className="flex-1 min-h-0 p-0">
                                                <VesselOnOrderList organisation={currentMemberOrg as any} parentOrg={null} moduleId={moduleData.id} isAdmin={isAdmin} />
                                            </CardContent>
                                        </Card>
                                    </div>

                                    <Card className="col-span-5 flex flex-col border rounded-2xl shadow-sm bg-white overflow-hidden">
                                        <CardHeader className="px-5 py-4 border-b flex flex-row items-center justify-between shrink-0">
                                            <div className="flex items-center gap-2.5">
                                                <h2 className="text-sm font-semibold text-slate-900">Recent Proposals</h2>
                                                {recentQuotes && recentQuotes.length > 0 && (
                                                    <Badge variant="secondary" className="text-xs font-medium px-2 h-5">
                                                        {recentQuotes.length} active
                                                    </Badge>
                                                )}
                                            </div>
                                            <Button
                                                size="sm"
                                                onClick={() => setIsQuoteInitializationOpen(true)}
                                                className="gap-1.5 h-8 text-xs"
                                            >
                                                <PlusCircle className="h-3.5 w-3.5" />
                                                New Quote
                                            </Button>
                                        </CardHeader>
                                        <CardContent className="flex-1 p-0 overflow-hidden">
                                            {(!recentQuotes || recentQuotes.length === 0) ? (
                                                <div className="flex flex-col items-center justify-center h-full p-8 text-center gap-4">
                                                    <div className="h-16 w-16 bg-slate-50 rounded-2xl flex items-center justify-center border-2 border-dashed border-slate-200">
                                                        <FileText className="h-7 w-7 text-slate-300" />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <p className="text-sm font-medium text-slate-500">No proposals yet</p>
                                                        <Button variant="outline" size="sm" onClick={() => setIsQuoteInitializationOpen(true)}>
                                                            Create your first quote
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <ScrollArea className="h-full">
                                                    <div className="p-4 grid grid-cols-2 gap-3">
                                                        {recentQuotes.map((q: any) => (
                                                            <div
                                                                key={q.id}
                                                                onClick={() => router.push(`/modules/${moduleData.id}/proposals/${q.id}`)}
                                                                className="group flex flex-col rounded-xl border bg-white hover:border-primary/40 hover:shadow-md cursor-pointer transition-all overflow-hidden"
                                                            >
                                                                {/* Image */}
                                                                <div className="relative h-28 bg-slate-50 border-b overflow-hidden shrink-0">
                                                                    {q.coverImageUrl ? (
                                                                        <img src={q.coverImageUrl} alt={q.modelName} className="absolute inset-0 h-full w-full object-contain p-3 mix-blend-multiply transition-transform group-hover:scale-105" />
                                                                    ) : (
                                                                        <div className="flex items-center justify-center h-full">
                                                                            <Anchor className="h-8 w-8 text-slate-200" />
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {/* Content */}
                                                                <div className="p-3 flex flex-col gap-2 flex-1">
                                                                    <div>
                                                                        <div className="flex items-center gap-1.5 mb-0.5">
                                                                            <span className="text-[9px] font-bold uppercase tracking-widest text-primary">{q.vendorName || 'Vessel'}</span>
                                                                            <span className="text-[9px] text-slate-300">·</span>
                                                                            <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">{q.rangeName || 'Series'}</span>
                                                                        </div>
                                                                        <h4 className="font-semibold text-sm text-slate-900 truncate">
                                                                            {q.modelName} <span className="text-[10px] font-normal text-slate-400">{q.modelCode}</span>
                                                                        </h4>
                                                                    </div>

                                                                    <div className="flex items-end justify-between">
                                                                        <div>
                                                                            <p className="text-base font-bold text-slate-900">${(q.totalPriceExclGst || 0).toLocaleString()}</p>
                                                                            <p className="text-[9px] text-slate-400 uppercase tracking-widest">excl. GST</p>
                                                                        </div>
                                                                        <div className="h-7 w-7 rounded-lg bg-slate-900 text-white flex items-center justify-center group-hover:bg-primary transition-colors shrink-0">
                                                                            <ArrowRight className="h-3.5 w-3.5" />
                                                                        </div>
                                                                    </div>

                                                                    <div className="flex items-center gap-2 pt-2 border-t">
                                                                        <Badge variant="outline" className="font-mono text-[9px] h-5 px-1.5 border-primary/20 text-primary bg-primary/5 shrink-0">
                                                                            {q.quoteNumber}
                                                                        </Badge>
                                                                        {q.customer?.name ? (
                                                                            <div className="flex items-center gap-1 min-w-0">
                                                                                <User className="h-3 w-3 text-slate-400 shrink-0" />
                                                                                <span className="text-[10px] font-medium text-slate-600 truncate">{q.customer.name}</span>
                                                                            </div>
                                                                        ) : (
                                                                            <span className="text-[10px] text-slate-400 italic">Stock unit</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </ScrollArea>
                                            )}
                                        </CardContent>
                                    </Card>
                                </div>
                            </div>
                        </ScrollArea>
                    </TabsContent>

                    <TabsContent value="bmt" className="m-0 h-full animate-in fade-in duration-500 overflow-hidden flex flex-col">
                        {/* Tactical Workspace Header */}
                        <div className="flex items-center justify-between gap-4 py-4 px-8 shrink-0 bg-white border-b-2 border-slate-300 relative z-[150]">
                            <div className="flex items-center gap-4">
                                <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary shadow-sm border-2 border-primary/20">
                                    <Layout className="h-5 w-5" />
                                </div>
                                <div className="space-y-1">
                                    <h2 className="text-base font-black uppercase tracking-widest text-slate-950 leading-none">Catalog Explorer</h2>
                                    <div className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                                        {mainVendor?.name || 'Highfield'} Master Inventory
                                        <Badge variant="outline" className="h-4 font-black uppercase text-[8px] bg-slate-100 border-slate-300">{(mainVendor?.currency || 'USD')} BASE</Badge>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-6">
                                {view !== 'ranges' && (
                                    <Button 
                                        variant="outline" 
                                        onClick={handleBackToCatalog} 
                                        className="h-10 px-6 font-black uppercase text-[10px] tracking-widest border-2 border-slate-300 rounded-xl hover:bg-slate-50 transition-all group"
                                    >
                                        <ChevronLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" />
                                        Return to Catalog
                                    </Button>
                                )}
                            </div>
                        </div>

                        <ScrollArea className="flex-1">
                            <div className="p-6 md:p-12 flex flex-col gap-8 pb-32">
                                <div className="animate-in fade-in slide-in-from-bottom-2 duration-700">
                                    {view === 'ranges' && (
                                        <RangesGrid 
                                            vendor={mainVendor as any} 
                                            onRangeSelect={handleRangeSelect} 
                                            canEdit={canEdit} 
                                            selectedRangeId={selectedRangeId} 
                                            onEdit={(item: any) => { setEditingItem(item); setIsEditOpen(true); }}
                                        />
                                    )}
                                    {view === 'models' && selectedRangeId && (
                                        <ModelsGrid 
                                            rangeId={selectedRangeId} 
                                            vendor={mainVendor as any} 
                                            onModelSelect={handleModelSelect} 
                                            selectedModelId={selectedModelId} 
                                        />
                                    )}
                                    {view === 'bmt' && effectiveModel && (
                                        <ModelConfigurationEditor 
                                            model={effectiveModel}
                                            docPath={`data-warehouse/${mainVendor!.id}/ranges/${selectedRangeId}/models/${selectedModelId}`}
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

                    <TabsContent value="stock" className="m-0 h-full animate-in fade-in duration-500 overflow-hidden">
                        <ScrollArea className="h-full">
                            <div className="p-8 space-y-8">
                                <div>
                                    <h2 className="text-xl font-black uppercase italic tracking-tight mb-4">Stock Units</h2>
                                    <StockList organisation={currentMemberOrg as any} subDealers={[]} parentOrg={null} moduleId={moduleData.id} filterOrgId="local" isAdmin={isAdmin} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-black uppercase italic tracking-tight mb-4">On Order</h2>
                                    <VesselOnOrderList organisation={currentMemberOrg as any} parentOrg={null} moduleId={moduleData.id} isAdmin={isAdmin} />
                                </div>
                            </div>
                        </ScrollArea>
                    </TabsContent>

                    {(isAdmin || !!userPermissions.can_access_pricing_manager) && mainVendor && currentMemberOrg?.id && (
                        <TabsContent value="pricing" className="m-0 h-full animate-in fade-in duration-500 overflow-hidden flex flex-col">
                            <HighfieldPricingWorkspace vendor={mainVendor} organisationId={currentMemberOrg.id} />
                        </TabsContent>
                    )}

                </Tabs>
            </main>

            {moduleData && (
                <QuoteInitializationDialog
                    isOpen={isQuoteInitializationOpen}
                    onOpenChange={setIsQuoteInitializationOpen}
                    vendor={mainVendor}
                    onModelSelect={handleQuoteInitialization}
                />
            )}

            <EditItemDialog 
                isOpen={isEditOpen} 
                onOpenChange={setIsEditOpen} 
                item={editingItem} 
                onSave={handleQuickSaveEdit} 
            />
        </div>
    );
}

function RangesGrid({ vendor, onRangeSelect, canEdit, selectedRangeId, onEdit }: { vendor: Vendor; onRangeSelect: (range: Range) => void, canEdit: boolean, selectedRangeId?: string | null, onEdit: (item: any) => void }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const rangesQuery = useMemoFirebase(() => vendor?.id ? collection(firestore, `data-warehouse/${vendor.id}/ranges`) : null, [firestore, vendor?.id]);
    const { data: ranges, isLoading: rangesLoading } = useCollection<Range>(rangesQuery);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const sortedRanges = useMemo(() =>
        [...(ranges || [])].sort((a, b) => {
            if (a.order === undefined && b.order === undefined) return 0;
            if (a.order === undefined) return 1;
            if (b.order === undefined) return -1;
            return a.order - b.order;
        }),
    [ranges]);

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!sortedRanges.length || !over || active.id === over.id) return;

        const oldIndex = sortedRanges.findIndex(r => r.id === active.id);
        const newIndex = sortedRanges.findIndex(r => r.id === over.id);
        const newItems = arrayMove(sortedRanges, oldIndex, newIndex);

        const batch = writeBatch(firestore);
        newItems.forEach((item, idx) => {
            batch.update(doc(firestore, `data-warehouse/${vendor.id}/ranges`, item.id), { order: idx });
        });
        await batch.commit();
        toast({ title: "Order Persisted" });
    };

    if (rangesLoading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-10 w-10 text-primary" /></div>;

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={sortedRanges.map(r => r.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-5 gap-6 py-4 px-1">
                    {sortedRanges.map(range => (
                        <SortableRangeCard
                            key={range.id}
                            range={range}
                            isSelected={selectedRangeId === range.id}
                            onClick={() => onRangeSelect(range)}
                            onEdit={onEdit}
                            canEdit={canEdit}
                        />
                    ))}
                </div>
            </SortableContext>
        </DndContext>
    );
}

function ModelsGrid({ 
    rangeId, 
    vendor, 
    onModelSelect, 
    selectedModelId
}: { 
    rangeId: string; 
    vendor: Vendor; 
    onModelSelect: (model: Model) => void; 
    selectedModelId?: string | null
}) {
    const firestore = useFirestore();
    const modelsQuery = useMemoFirebase(() => vendor?.id && rangeId ? collection(firestore, `data-warehouse/${vendor.id}/ranges/${rangeId}/models`) : null, [firestore, vendor?.id, rangeId]);
    const { data: models, isLoading: modelsLoading } = useCollection<Model>(modelsQuery);

    if (modelsLoading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-10 w-10 text-primary" /></div>;
    
    return (
        <div className="grid grid-cols-5 gap-6 py-4 px-1">
            {models?.map(model => (
                <ModelCard 
                    key={model.id} 
                    model={model} 
                    isSelected={selectedModelId === model.id}
                    onClick={() => onModelSelect(model)}
                />
            ))}
        </div>
    );
}

function SortableRangeCard({ range, isSelected, onClick, onEdit, canEdit }: any) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: range.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 'auto',
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} className="h-full">
            <Card 
                className={cn(
                    "cursor-pointer transition-all rounded-[1.5rem] overflow-hidden group border-2 hover:-translate-y-1 flex flex-col h-full bg-white relative",
                    isSelected 
                        ? "border-primary shadow-2xl scale-[1.02]" 
                        : "hover:border-primary/20 hover:shadow-xl"
                )}
                onClick={onClick}
            >
                {canEdit && (
                    <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                        <Button 
                            type="button"
                            variant="secondary" 
                            size="icon" 
                            className="h-7 w-7 rounded-full bg-white/90 shadow-md border hover:bg-white"
                            onClick={(e) => { e.stopPropagation(); onEdit(range); }}
                        >
                            <Pencil className="h-3.5 w-3.5 text-slate-600" />
                        </Button>
                        <div 
                            {...attributes} 
                            {...listeners} 
                            className="h-7 w-7 rounded-full bg-white/90 shadow-md border flex items-center justify-center cursor-grab active:cursor-grabbing hover:bg-white"
                        >
                            <GripVertical className="h-3.5 w-3.5 text-slate-600" />
                        </div>
                    </div>
                )}

                <div className="aspect-[16/10] bg-muted/30 relative border-b overflow-hidden p-6 text-center">
                    {range.imageUrl ? (
                        <Image 
                            src={range.imageUrl} 
                            alt={range.name} 
                            fill 
                            className="object-contain p-6 group-hover:scale-105 transition-transform duration-500" 
                            
                        />
                    ) : (
                        <div className="flex items-center justify-center h-full">
                            <Ship className="h-12 w-12 text-muted-foreground/20" />
                        </div>
                    )}
                </div>
                
                <div className="p-6 flex flex-col items-center justify-center bg-white mt-auto text-center">
                    <p className={cn(
                        "font-black uppercase tracking-tight text-sm transition-colors",
                        isSelected ? "text-primary" : "text-slate-900 group-hover:text-primary"
                    )}>
                        {range.name}
                    </p>
                </div>
            </Card>
        </div>
    );
}

function ModelCard({ model, isSelected, onClick }: any) {
    return (
        <Card 
            className={cn(
                "cursor-pointer transition-all rounded-[1.5rem] overflow-hidden group border-2 hover:-translate-y-1 flex flex-col h-full bg-white relative",
                isSelected 
                    ? "border-primary shadow-2xl scale-[1.02]" 
                    : "hover:border-primary/20 hover:shadow-xl"
            )}
            onClick={onClick}
        >
            <div className="aspect-video bg-muted/30 relative border-b overflow-hidden">
                {model.coverImageUrl ? (
                    <Image 
                        src={model.coverImageUrl} 
                        alt={model.name} 
                        fill 
                        className="object-cover group-hover:scale-105 transition-transform duration-500" 
                        
                    />
                ) : (
                    <div className="flex items-center justify-center h-full">
                        <Ship className="h-12 w-12 text-muted-foreground/20" />
                    </div>
                )}
            </div>
            <div className="p-6 flex flex-col items-center justify-center bg-white mt-auto gap-1 text-center">
                <p className="font-black uppercase tracking-tight text-sm transition-colors text-primary">
                    {model.name}
                </p>
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">{model.modelCode}</p>
            </div>
        </Card>
    );
}

function EditItemDialog({ isOpen, onOpenChange, item, onSave }: any) {
    const [name, setName] = useState(item?.name || '');
    const [image, setImage] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(item?.imageUrl || item?.coverImageUrl || null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (item) {
            setName(item.name || '');
            setPreview(item.imageUrl || item.coverImageUrl || null);
        }
    }, [item]);

    const handleSave = async () => {
        setIsSaving(true);
        await onSave({ name, image });
        setIsSaving(false);
        onOpenChange(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md rounded-[2rem] border-4 shadow-2xl p-8">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-black uppercase tracking-tight italic">Quick Edit</DialogTitle>
                </DialogHeader>
                <div className="space-y-6 py-4">
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Display Name</Label>
                        <Input value={name} onChange={e => setName(e.target.value)} className="h-12 font-bold border-2 rounded-xl" />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Primary Render</Label>
                        <div className="relative aspect-video rounded-xl border-2 border-dashed bg-muted/20 overflow-hidden group">
                            {preview ? (
                                <Image src={preview} alt="Preview" fill className="object-contain p-4" />
                            ) : (
                                <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground">
                                    <ImageIcon className="h-8 w-8 mb-2 opacity-20" />
                                    <span className="text-[10px] font-black uppercase">No Photo Set</span>
                                </div>
                            )}
                            <label className="absolute inset-0 cursor-pointer bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Upload className="h-8 w-8 text-white" />
                                <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                        setImage(file);
                                        setPreview(URL.createObjectURL(file));
                                    }
                                }} />
                            </label>
                        </div>
                    </div>
                </div>
                <DialogFooter className="gap-3">
                    <DialogClose asChild><Button variant="outline" className="h-12 px-8 rounded-xl font-black uppercase text-[10px]">Cancel</Button></DialogClose>
                    <Button onClick={handleSave} disabled={isSaving} className="h-12 px-10 rounded-xl font-black uppercase text-[10px] shadow-xl">
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="mr-2 h-4 w-4 mr-2" />}
                        Persist Changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

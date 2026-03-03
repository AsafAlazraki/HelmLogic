'use client';

import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { collection, query, where, orderBy, doc, updateDoc, writeBatch, getDocs, deleteDoc } from 'firebase/firestore';
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
    LayoutDashboard,
    Waves,
    Zap,
    Trash2,
    Map as MapIcon,
    ClipboardList,
    Building
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useDoc } from '@/firebase/firestore/use-doc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUser } from '@/firebase/auth/use-user';
import { ModelConfigurationEditor } from '@/components/model-configuration-editor';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { StockList } from '@/components/stock-list';
import { VesselOnOrderList } from '@/components/vessel-on-order-list';
import { ModulePricingDashboard } from '@/components/module-pricing-dashboard';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { VesselMap } from '@/components/map';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';

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

function BuildTransitionOverlay({ organisation, model }: { organisation?: Organisation | null, model: Model | null }) {
    return (
        <div className="fixed inset-0 z-[100] bg-primary flex flex-col items-center justify-center text-white overflow-hidden animate-in fade-in duration-500">
            <div className="absolute inset-0 z-0">
                <div className="absolute bottom-0 left-0 w-full h-1/2 opacity-20 bg-gradient-to-t from-white/20 to-transparent" />
                <div className="absolute -bottom-20 -left-20 w-[600px] h-[600px] bg-white/5 rounded-full blur-3xl animate-pulse" />
                <div className="absolute top-20 right-20 w-[400px] h-[400px] bg-indigo-400/10 rounded-full blur-3xl animate-pulse duration-[4000ms]" />
            </div>

            <div className="relative z-10 flex flex-col items-center gap-8 max-w-md text-center">
                <div className="relative h-24 w-24 bg-white/10 backdrop-blur-md rounded-3xl p-4 border border-white/20 shadow-2xl animate-in zoom-in-95 duration-700">
                    {organisation?.primaryLogoUrl ? (
                        <div className="relative h-full w-full">
                            <Image 
                                src={organisation.primaryLogoUrl} 
                                alt={organisation.name} 
                                fill 
                                className="object-contain p-3 brightness-0 invert" 
                                unoptimized
                            />
                        </div>
                    ) : (
                        <Ship className="h-full w-full text-white/40" />
                    )}
                </div>

                <div className="space-y-3">
                    <div className="flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-[0.4em] text-white/40">
                        <Zap className="h-3 w-3 fill-current" />
                        <span>Initializing Precision Build</span>
                    </div>
                    <h2 className="text-4xl font-black italic uppercase tracking-tighter">
                        {model?.name}
                    </h2>
                </div>

                <div className="relative w-48 h-1 flex items-center justify-center bg-white/10 rounded-full overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-[shimmer_2s_infinite] w-1/2" />
                </div>

                <p className="text-[10px] font-bold uppercase tracking-widest text-white/60 animate-pulse">
                    Synchronizing factory data sets...
                </p>
            </div>

            <div className="absolute bottom-0 left-0 w-full overflow-hidden leading-[0] translate-y-1">
                <svg className="relative block w-[calc(10%+1.3px)] h-[120px]" data-name="Layer 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 120" preserveAspectRatio="none">
                    <path d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V0H0V27.35A600.21,600.21,0,0,0,321.39,56.44Z" className="fill-white/5"></path>
                </svg>
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

function QuoteSelectorDialog({ 
    isOpen, 
    setIsOpen, 
    vendor, 
    moduleSlug,
    organisation
}: { 
    isOpen: boolean, 
    setIsOpen: (open: boolean) => void, 
    vendor: Vendor,
    moduleSlug: string,
    organisation?: Organisation | null
}) {
    const firestore = useFirestore();
    const router = useRouter();
    const [selectedRange, setSelectedRange] = useState<Range | null>(null);
    const [isInitializing, setIsInitializing] = useState(false);
    const [initializingModel, setInitializingModel] = useState<Model | null>(null);

    const rangesQuery = useMemoFirebase(() => {
        if (!vendor?.id) return null;
        return query(collection(firestore, `data-warehouse/${vendor.id}/ranges`), orderBy('order'));
    }, [firestore, vendor?.id]);
    const { data: ranges, loading: rangesLoading } = useCollection<Range>(rangesQuery);

    const modelsQuery = useMemoFirebase(() => {
        if (!vendor?.id || !selectedRange?.id) return null;
        return query(collection(firestore, `data-warehouse/${vendor.id}/ranges/${selectedRange.id}/models`), orderBy('order'));
    }, [firestore, vendor?.id, selectedRange]);
    const { data: models, loading: modelsLoading } = useCollection<Model>(modelsQuery);

    const handleModelSelect = (model: Model) => {
        setInitializingModel(model);
        setIsInitializing(true);
        setTimeout(() => {
            router.push(`/modules/${moduleSlug}/quote/${model.id}?range=${selectedRange?.id}&vendor=${vendor.id}`);
        }, 2200);
    };

    return (
        <>
            {isInitializing && <BuildTransitionOverlay organisation={organisation} model={initializingModel} />}
            
            <Dialog open={isOpen && !isInitializing} onOpenChange={(open) => { if (!isInitializing) { setIsOpen(open); if (!open) setSelectedRange(null); } }}>
                <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col p-0 rounded-[2rem] border-4 shadow-2xl">
                    <DialogHeader className="p-8 border-b bg-muted/5">
                        <DialogTitle className="text-3xl font-black uppercase tracking-tight italic text-primary">Initiate Proposal</DialogTitle>
                        <DialogDescription className="text-sm font-bold uppercase text-muted-foreground/60 tracking-widest mt-1">
                            {selectedRange ? `Target: ${selectedRange.name}` : 'Select range to begin configuration'}
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="flex-1 min-h-0 bg-background">
                        <ScrollArea className="h-full p-8">
                            {rangesLoading ? (
                                <div className="flex h-64 items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
                            ) : !selectedRange ? (
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-6 pt-4 pb-10">
                                    {ranges?.map(range => (
                                        <Card 
                                            key={range.id} 
                                            className="cursor-pointer hover:border-primary hover:shadow-xl transition-all rounded-[1.5rem] overflow-hidden group border-2 hover:-translate-y-1"
                                            onClick={() => setSelectedRange(range)}
                                        >
                                            <div className="aspect-video bg-muted/30 relative border-b p-4">
                                                {range.imageUrl ? (
                                                    <div className="relative h-full w-full">
                                                        <Image src={range.imageUrl} alt={range.name} fill className="object-contain p-2" unoptimized />
                                                    </div>
                                                ) : <div className="flex items-center justify-center h-full"><Ship className="h-8 w-8 opacity-10" /></div>}
                                            </div>
                                            <div className="p-4 text-center">
                                                <p className="font-black uppercase tracking-tighter text-sm">{range.name}</p>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <Button variant="ghost" onClick={() => setSelectedRange(null)} className="font-black uppercase text-[10px] tracking-widest text-primary hover:bg-primary/5">
                                        <ChevronLeft className="mr-2 h-4 w-4" /> Back to Ranges
                                    </Button>
                                    {modelsLoading ? (
                                        <div className="flex h-64 items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
                                    ) : (
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-6 pt-4 pb-10">
                                            {models?.map(model => (
                                                <Card 
                                                    key={model.id} 
                                                    className="cursor-pointer hover:border-primary hover:shadow-xl transition-all rounded-[1.5rem] overflow-hidden group border-2 hover:-translate-y-1"
                                                    onClick={() => handleModelSelect(model)}
                                                >
                                                    <div className="aspect-video bg-muted/30 relative border-b">
                                                        {model.coverImageUrl ? (
                                                            <div className="relative h-full w-full">
                                                                <Image src={model.coverImageUrl} alt={model.name} fill className="object-cover" unoptimized />
                                                            </div>
                                                        ) : <div className="flex items-center justify-center h-full"><Ship className="opacity-10" /></div>}
                                                    </div>
                                                    <div className="p-4 text-center space-y-1">
                                                        <p className="font-black uppercase tracking-tighter text-xs">{model.name}</p>
                                                        {model.modelCode && <Badge variant="secondary" className="font-mono text-[8px] h-4 px-1.5">{model.modelCode}</Badge>}
                                                    </div>
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
        </>
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
    const [isNewQuoteOpen, setIsNewQuoteOpen] = useState(false);
    const [isTransitioning, setIsTransitioning] = useState(false);
    
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

    const handleWipePipeline = async () => {
        if (!currentMemberOrg) return;
        const q = query(
            collection(firestore, 'vessels'), 
            where('organisationId', '==', currentMemberOrg.id), 
            where('status', '==', 'On Order')
        );
        const snap = await getDocs(q);
        const batch = writeBatch(firestore);
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
        toast({ title: "Pipeline Strategic Wipe Complete" });
    };

    const handleWipeStock = async () => {
        if (!currentMemberOrg) return;
        const q = query(
            collection(firestore, 'inventory'), 
            where('organisationId', '==', currentMemberOrg.id)
        );
        const snap = await getDocs(q);
        const batch = writeBatch(firestore);
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
        toast({ title: "Stock Strategic Wipe Complete" });
    };

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

    return (
        <div className="flex flex-col h-screen overflow-hidden bg-background">
            {isTransitioning && <BuildTransitionOverlay organisation={currentMemberOrg as any} model={selectedModel} />}

            {/* Cinematic Hero */}
            <div className="relative shrink-0 overflow-hidden bg-primary px-8 text-primary-foreground z-20 h-32 border-b border-white/10 shadow-2xl">
                <div className="absolute inset-0 z-0 bg-primary/95">
                    {/* Animated Mesh Blobs */}
                    <div className="absolute top-[-40%] left-[-10%] w-[80%] h-[180%] bg-blue-400/20 blur-[120px] rounded-full animate-pulse pointer-events-none" />
                    <div className="absolute bottom-[-50%] right-[-10%] w-[90%] h-[190%] bg-indigo-600/30 blur-[140px] rounded-full animate-pulse duration-[8000ms] pointer-events-none" />
                    <div className="absolute top-[10%] right-[20%] w-[40%] h-[100%] bg-sky-300/10 blur-[100px] rounded-full animate-pulse duration-[6000ms] pointer-events-none" />
                </div>
                
                <div className="relative z-10 flex flex-col h-full justify-center">
                    <div className="flex items-center justify-between w-full">
                        <div className="space-y-0.5">
                            <div className="flex items-center gap-2 text-[8px] font-black uppercase tracking-[0.4em] text-white/50 leading-none mb-1">
                                <Navigation className="h-2 w-2" />
                                <span>COMMAND CENTER</span>
                            </div>
                            <h1 className="text-5xl font-black tracking-tighter uppercase italic leading-none drop-shadow-2xl">
                                {moduleData.name}
                            </h1>
                        </div>
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-10 px-6 font-black uppercase tracking-widest text-[10px] bg-white/10 hover:bg-white/20 text-white rounded-full transition-all border border-white/10 group shadow-xl"
                            onClick={() => router.push('/dashboard')}
                        >
                            <X className="h-4 w-4 mr-2 transition-transform group-hover:rotate-90" />
                            Back to Hub
                        </Button>
                    </div>
                </div>
            </div>

            {/* Premium Navigation Ribbon */}
            <div className="bg-white border-b shrink-0 z-10 px-10">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid grid-cols-5 w-full h-12 bg-transparent p-0 gap-4">
                        {[
                            { id: 'dashboard', label: 'Dashboard' },
                            { id: 'bmt', label: 'Product Catalog' },
                            { id: 'operations', label: 'Operations' },
                            { id: 'pricing', label: 'Pricing' },
                            { id: 'network', label: 'Sub Dealers' }
                        ].map((t) => (
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

            {/* Operational Workspace */}
            <main className="flex-1 overflow-hidden relative p-8 pt-6">
                <Tabs value={activeTab} className="h-full">
                    <TabsContent value="dashboard" className="m-0 h-full animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <div className="grid grid-cols-12 gap-8 h-full">
                            <div className="col-span-4 flex flex-col gap-8 h-full overflow-hidden">
                                <Card className="flex-1 flex flex-col border-2 rounded-[2.5rem] shadow-sm bg-white overflow-hidden transition-all hover:shadow-md">
                                    <CardHeader className="py-4 px-8 border-b bg-muted/5 flex flex-row items-center justify-between shrink-0 flex-nowrap">
                                        <div className="flex items-center gap-3 shrink-0">
                                            <Badge variant="outline" className="h-5 text-[9px] font-black uppercase border-primary/20 text-primary bg-primary/5 px-2">Asset</Badge>
                                            <h3 className="font-black uppercase italic text-sm tracking-tight text-slate-900 whitespace-nowrap">Stock</h3>
                                        </div>
                                        {isAdmin && (
                                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full text-destructive/40 hover:text-destructive transition-all" onClick={handleWipeStock}>
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        )}
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
                                        {isAdmin && (
                                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full text-destructive/40 hover:text-destructive transition-all" onClick={handleWipePipeline}>
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        )}
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
                                        className="h-16 px-10 rounded-[1.5rem] font-black uppercase tracking-[0.2em] text-[11px] shadow-2xl hover:scale-[1.03] transition-all bg-primary text-white"
                                        onClick={() => setIsNewQuoteOpen(true)}
                                    >
                                        <PlusCircle className="mr-2 h-4 w-4" />
                                        Draft New Quote
                                    </Button>
                                </CardHeader>
                                <CardContent className="flex-1 p-10 flex flex-col items-center justify-center text-center gap-8">
                                    <div className="h-32 w-32 bg-slate-50 rounded-[2.5rem] flex items-center justify-center border-2 border-dashed border-slate-200">
                                        <FileText className="h-12 w-12 text-slate-200" />
                                    </div>
                                    <p className="font-black uppercase tracking-[0.3em] text-sm text-slate-400">Proposal Queue Empty</p>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    <TabsContent value="bmt" className="m-0 h-full animate-in fade-in duration-500 overflow-hidden flex flex-col">
                        {(view === 'models' || view === 'bmt') && (
                            <div className="mb-6 shrink-0 px-1">
                                <Button 
                                    variant="outline" 
                                    onClick={handleBackToCatalog} 
                                    className="h-10 px-6 font-black uppercase text-[10px] tracking-widest text-primary border-primary/20 bg-primary/5 hover:bg-primary hover:text-white transition-all rounded-xl shadow-sm group"
                                >
                                    <ChevronLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" /> 
                                    Back to {view === 'bmt' ? 'Series Selection' : 'Product Ranges'}
                                </Button>
                            </div>
                        )}
                        <div className="flex-1 min-h-0 relative">
                            <ScrollArea className="h-full">
                                <div className="pb-10">
                                    {view === 'ranges' && <RangesGrid vendor={mainVendor as any} onRangeSelect={handleRangeSelect} />}
                                    {view === 'models' && selectedRange && <ModelsGrid range={selectedRange} vendor={mainVendor as any} onModelSelect={handleModelSelect} isAdmin={isAdmin} />}
                                    {view === 'bmt' && selectedModel && selectedRange && (
                                        <ModelConfigurationEditor 
                                            model={selectedModel}
                                            docPath={`data-warehouse/${mainVendor!.id}/ranges/${selectedRange.id}/models/${selectedModel.id}`}
                                            vendor={mainVendor}
                                            module={moduleData}
                                            user={user as any}
                                            isAdmin={isAdmin}
                                            organisationId={currentMemberOrg?.id}
                                            breadcrumbs={null}
                                        />
                                    )}
                                </div>
                            </ScrollArea>
                        </div>
                    </TabsContent>

                    <TabsContent value="operations" className="m-0 h-full animate-in fade-in duration-500 overflow-hidden">
                        <div className="grid grid-cols-12 gap-8 h-full">
                            <Card className="col-span-8 border-2 rounded-[2.5rem] overflow-hidden bg-white shadow-sm">
                                <CardHeader className="py-4 px-8 border-b bg-muted/5 flex flex-row items-center justify-between">
                                    <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                                        <MapIcon className="h-4 w-4 text-primary" />
                                        Fleet Live Positions
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-0 h-[calc(100%-60px)]">
                                    <VesselMap />
                                </CardContent>
                            </Card>
                            <Card className="col-span-4 border-2 rounded-[2.5rem] overflow-hidden bg-white shadow-sm">
                                <CardHeader className="py-4 px-8 border-b bg-muted/5">
                                    <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                                        <ClipboardList className="h-4 w-4 text-primary" />
                                        Operational Log
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <div className="p-12 text-center text-muted-foreground italic text-[10px] uppercase font-black tracking-widest opacity-20">
                                        Metrics Synchronized with Fleet
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    <TabsContent value="pricing" className="m-0 h-full">
                        {currentMemberOrg && mainVendor && (
                            <ModulePricingDashboard module={moduleData} organisation={currentMemberOrg as any} vendor={mainVendor} />
                        )}
                    </TabsContent>

                    <TabsContent value="network" className="m-0 h-full animate-in fade-in duration-500">
                        <Card className="border-2 rounded-[2.5rem] overflow-hidden bg-white shadow-sm">
                            <CardHeader className="p-8 border-b bg-muted/5">
                                <CardTitle className="text-xl font-black uppercase tracking-tight">Sub Dealer Network</CardTitle>
                                <CardDescription className="text-xs uppercase font-black text-muted-foreground tracking-widest">Manage business relationships and regional allocations.</CardDescription>
                            </CardHeader>
                            <CardContent className="p-0">
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
                                    <div className="p-20 text-center text-muted-foreground opacity-20 flex flex-col items-center justify-center">
                                        <Building className="h-12 w-12 mb-4" />
                                        <p className="font-black uppercase tracking-widest text-xs">No Sub Dealers Registered</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </main>

            {mainVendor && (
                <QuoteSelectorDialog 
                    isOpen={isNewQuoteOpen} 
                    setIsOpen={setIsNewQuoteOpen} 
                    vendor={mainVendor} 
                    moduleSlug={moduleData.slug || moduleData.id}
                    organisation={currentMemberOrg as any}
                />
            )}
        </div>
    );
}

function RangesGrid({ vendor, onRangeSelect }: { vendor: Vendor; onRangeSelect: (range: Range) => void }) {
    const firestore = useFirestore();
    const rangesQuery = useMemoFirebase(() => vendor?.id ? query(collection(firestore, `data-warehouse/${vendor.id}/ranges`), orderBy('order')) : null, [firestore, vendor?.id]);
    const { data: ranges, loading } = useCollection<Range>(rangesQuery);

    if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-10 w-10 text-primary" /></div>;
    
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 py-10 px-1">
            {ranges?.map(range => (
                <Card key={range.id} className="cursor-pointer group hover:border-primary shadow-sm rounded-[2rem] overflow-hidden border-2 transition-all hover:-translate-y-1 bg-white" onClick={() => onRangeSelect(range)}>
                    <div className="aspect-video relative bg-slate-50 border-b">
                        {range.imageUrl ? (
                            <div className="relative h-full w-full">
                                <Image src={range.imageUrl} alt={range.name} fill className="object-contain p-4" unoptimized />
                            </div>
                        ) : <div className="flex h-full w-full items-center justify-center"><Ship className="h-8 w-8 opacity-10" /></div>}
                    </div>
                    <div className="p-5 text-center">
                        <p className="text-sm font-black uppercase tracking-tight">{range.name}</p>
                    </div>
                </Card>
            ))}
        </div>
    );
}

function ModelsGrid({ range, vendor, onModelSelect, isAdmin }: { range: Range; vendor: Vendor; onModelSelect: (model: Model) => void; isAdmin: boolean }) {
    const firestore = useFirestore();
    const modelsQuery = useMemoFirebase(() => vendor?.id && range?.id ? query(collection(firestore, `data-warehouse/${vendor.id}/ranges/${range.id}/models`), orderBy('order')) : null, [firestore, vendor?.id, range?.id]);
    const { data: models, loading } = useCollection<Model>(modelsQuery);

    if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-10 w-10 text-primary" /></div>;

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 py-10 px-1">
            {models?.map(model => (
                <Card key={model.id} className="cursor-pointer group hover:border-primary shadow-sm rounded-[2rem] overflow-hidden border-2 transition-all hover:-translate-y-1 flex flex-col bg-white" onClick={() => onModelSelect(model)}>
                    <div className="aspect-video relative bg-slate-50 border-b">
                        {model.coverImageUrl ? (
                            <div className="relative h-full w-full">
                                <Image src={model.coverImageUrl} alt={model.name} fill className="object-cover" unoptimized />
                            </div>
                        ) : <div className="flex h-full w-full items-center justify-center"><Ship className="h-8 w-8 opacity-10" /></div>}
                    </div>
                    <div className="p-5 text-center space-y-2">
                        <p className="text-xs font-black uppercase tracking-tight">{model.name}</p>
                        {model.modelCode && <Badge variant="secondary" className="font-mono text-[8px] uppercase px-1.5 h-4">{model.modelCode}</Badge>}
                    </div>
                </Card>
            ))}
        </div>
    );
}

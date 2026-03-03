
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
    PlusCircle,
    Navigation,
    Anchor,
    Ship,
    LayoutGrid,
    X,
    LayoutDashboard
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
import { MotorModuleBrowser } from '@/components/motor-module-browser';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
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
    enabledModuleSubscriptions?: string[];
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
        <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) setSelectedRange(null); }}>
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
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-6 pt-4">
                                {ranges?.map(range => (
                                    <Card 
                                        key={range.id} 
                                        className="cursor-pointer hover:border-primary hover:shadow-xl transition-all rounded-[1.5rem] overflow-hidden group border-2 hover:-translate-y-1"
                                        onClick={() => setSelectedRange(range)}
                                    >
                                        <div className="aspect-video bg-muted/30 relative border-b p-4">
                                            {range.imageUrl ? <Image src={range.imageUrl} alt={range.name} fill className="object-contain p-2" unoptimized /> : <div className="flex items-center justify-center h-full"><Ship className="h-8 w-8 opacity-10" /></div>}
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
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-6 pt-4">
                                        {models?.map(model => (
                                            <Card 
                                                key={model.id} 
                                                className="cursor-pointer hover:border-primary hover:shadow-xl transition-all rounded-[1.5rem] overflow-hidden group border-2 hover:-translate-y-1"
                                                onClick={() => handleModelSelect(model)}
                                            >
                                                <div className="aspect-video bg-muted/30 relative border-b">
                                                    {model.coverImageUrl ? <Image src={model.coverImageUrl} alt={model.name} fill className="object-cover" unoptimized /> : <div className="flex items-center justify-center h-full"><Ship className="opacity-10" /></div>}
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
    );
}

export default function ModuleDetailsPage() {
    const router = useRouter();
    const params = useParams();
    const slugOrId = params.id as string;
    const { toast } = useToast();
    const firestore = useFirestore();

    const [activeTab, setActiveTab] = useState('dashboard');
    const [view, setView] = useState<'ranges' | 'models' | 'motors' | 'bmt'>('ranges');
    const [selectedRange, setSelectedRange] = useState<Range | null>(null);
    const [selectedModel, setSelectedModel] = useState<Model | null>(null);
    const [isNewQuoteOpen, setIsNewQuoteOpen] = useState(false);
    
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

    const loading = slugLoading || idLoading || mainVendorLoading;

    if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin h-12 w-12 text-primary" /></div>;
    if (!moduleData) return <div className="p-12 text-center font-bold">Module Context Lost.</div>;

    const handleRangeSelect = (range: Range) => { setSelectedRange(range); setView('models'); };
    const handleModelSelect = (model: Model) => { setSelectedModel(model); setView('bmt'); };

    return (
        <div className="flex flex-col h-screen overflow-hidden bg-background">
            {/* Cinematic Module Hero */}
            <div className="relative shrink-0 overflow-hidden bg-primary px-10 py-12 text-primary-foreground shadow-2xl z-20">
                {/* Fluid Background Animation */}
                <div className="absolute inset-0 z-0">
                    <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-400/20 blur-[120px] rounded-full animate-pulse" />
                    <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-600/30 blur-[150px] rounded-full animate-pulse duration-[4000ms]" />
                    <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] bg-white/5 blur-[100px] rounded-full" />
                </div>
                
                <div className="relative z-10 flex flex-col gap-1">
                    <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.4em] text-white/40">
                            <Navigation className="h-3 w-3" />
                            <span>Command Center</span>
                        </div>
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 px-4 font-black uppercase tracking-widest text-[9px] bg-white/10 hover:bg-white/20 text-white rounded-full transition-all border border-white/10"
                            onClick={() => router.push('/dashboard')}
                        >
                            <X className="h-3.5 w-3.5 mr-1.5" />
                            Back to Hub
                        </Button>
                    </div>
                    
                    <h1 className="text-6xl font-black tracking-tighter uppercase italic leading-none drop-shadow-2xl mt-4">
                        {moduleData.name}
                    </h1>
                </div>
            </div>

            {/* Premium Navigation Ribbon */}
            <div className="bg-white border-b shrink-0 z-10 shadow-sm px-10">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid grid-cols-5 w-full h-16 bg-transparent p-0 gap-8">
                        {[
                            { id: 'dashboard', label: 'Dashboard' },
                            { id: 'bmt', label: 'Product Catalog' },
                            { id: 'operations', label: 'Operations' },
                            { id: 'pricing', label: 'Pricing Strategy' },
                            { id: 'network', label: 'Market Network' }
                        ].map((t) => (
                            <TabsTrigger 
                                key={t.id} 
                                value={t.id} 
                                className="rounded-none border-b-4 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent font-black uppercase text-[11px] tracking-[0.2em] h-full transition-all duration-300 text-slate-400 data-[state=active]:text-slate-900 hover:text-slate-600"
                            >
                                {t.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
            </div>

            {/* Operational Workspace */}
            <main className="flex-1 overflow-hidden relative p-8">
                <Tabs value={activeTab} className="h-full">
                    <TabsContent value="dashboard" className="m-0 h-full animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <div className="grid grid-cols-12 gap-8 h-full">
                            {/* Lateral Panels */}
                            <div className="col-span-4 flex flex-col gap-8 h-full overflow-hidden">
                                <Card className="flex-1 flex flex-col border-2 rounded-[2.5rem] shadow-sm bg-white overflow-hidden transition-all hover:shadow-md">
                                    <CardHeader className="py-6 px-8 border-b bg-muted/5 flex flex-row items-center justify-between shrink-0">
                                        <div className="flex items-center gap-3">
                                            <Badge variant="outline" className="h-5 text-[9px] font-black uppercase border-primary/20 text-primary bg-primary/5 px-2">Asset</Badge>
                                            <h3 className="font-black uppercase italic text-sm tracking-tight text-slate-900 whitespace-nowrap">Stock</h3>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="flex-1 min-h-0 p-0">
                                        <StockList organisation={currentMemberOrg as any} subDealers={[]} parentOrg={null} moduleId={moduleData.id} filterOrgId="local" isAdmin={isAdmin} />
                                    </CardContent>
                                </Card>

                                <Card className="flex-1 flex flex-col border-2 rounded-[2.5rem] shadow-sm bg-white overflow-hidden transition-all hover:shadow-md">
                                    <CardHeader className="py-6 px-8 border-b bg-muted/5 flex flex-row items-center justify-between shrink-0">
                                        <div className="flex items-center gap-3">
                                            <Badge variant="outline" className="h-5 text-[9px] font-black uppercase border-green-500/20 text-green-600 bg-green-50/50 px-2">Pipeline</Badge>
                                            <h3 className="font-black uppercase italic text-sm tracking-tight text-slate-900 whitespace-nowrap">On Order</h3>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="flex-1 min-h-0 p-0">
                                        <VesselOnOrderList organisation={currentMemberOrg as any} parentOrg={null} moduleId={moduleData.id} isAdmin={isAdmin} />
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Center Action Panel */}
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
                                        className="h-16 px-10 rounded-[1.5rem] font-black uppercase tracking-[0.2em] text-[11px] shadow-2xl hover:scale-[1.03] active:scale-95 transition-all bg-primary text-white"
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
                                    <div className="space-y-3">
                                        <p className="font-black uppercase tracking-[0.3em] text-sm text-slate-400">Proposal Queue Empty</p>
                                        <p className="text-[12px] font-medium text-slate-500 max-w-sm mx-auto leading-relaxed">Select a model range to begin building a precision configuration for your client.</p>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    <TabsContent value="bmt" className="m-0 h-full animate-in fade-in duration-500 overflow-hidden">
                        <ScrollArea className="h-full pr-4">
                            <div className="pb-20">
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
                                        breadcrumbs={
                                            <div className="flex items-center text-[10px] font-black uppercase tracking-widest opacity-60">
                                                <span>{selectedRange.name}</span>
                                                <ChevronRight className="h-3 w-3 mx-1" />
                                                <span className="text-primary">{selectedModel.name}</span>
                                            </div>
                                        }
                                    />
                                )}
                            </div>
                        </ScrollArea>
                    </TabsContent>

                    <TabsContent value="pricing" className="m-0 h-full">
                        {currentMemberOrg && mainVendor && (
                            <ModulePricingDashboard module={moduleData} organisation={currentMemberOrg as any} vendor={mainVendor} />
                        )}
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

function RangesGrid({ vendor, onRangeSelect }: { vendor: Vendor; onRangeSelect: (range: Range) => void }) {
    const firestore = useFirestore();
    const rangesQuery = useMemoFirebase(() => vendor?.id ? query(collection(firestore, `data-warehouse/${vendor.id}/ranges`), orderBy('order')) : null, [firestore, vendor?.id]);
    const { data: ranges, loading } = useCollection<Range>(rangesQuery);

    if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-10 w-10 text-primary" /></div>;
    
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8 pt-6">
            {ranges?.map(range => (
                <Card key={range.id} className="cursor-pointer group hover:border-primary shadow-sm rounded-[2rem] overflow-hidden border-2 transition-all hover:-translate-y-1" onClick={() => onRangeSelect(range)}>
                    <div className="aspect-video relative bg-slate-50 border-b">
                        {range.imageUrl ? <Image src={range.imageUrl} alt={range.name} fill className="object-contain p-4" unoptimized /> : <div className="flex h-full w-full items-center justify-center"><Ship className="h-8 w-8 opacity-10" /></div>}
                    </div>
                    <div className="p-6 text-center">
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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8 pt-6">
            {models?.map(model => (
                <Card key={model.id} className="cursor-pointer group hover:border-primary shadow-sm rounded-[2rem] overflow-hidden border-2 transition-all hover:-translate-y-1" onClick={() => onModelSelect(model)}>
                    <div className="aspect-video relative bg-slate-50 border-b">
                        {model.coverImageUrl ? <Image src={model.coverImageUrl} alt={model.name} fill className="object-cover" unoptimized /> : <div className="flex h-full w-full items-center justify-center"><Ship className="h-8 w-8 opacity-10" /></div>}
                    </div>
                    <div className="p-6 text-center space-y-2">
                        <p className="text-xs font-black uppercase tracking-tight">{model.name}</p>
                        {model.modelCode && <Badge variant="secondary" className="font-mono text-[8px] uppercase px-1.5 h-4">{model.modelCode}</Badge>}
                    </div>
                </Card>
            ))}
        </div>
    );
}

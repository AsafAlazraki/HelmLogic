'use client';

import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useMemoFirebase, useStorage } from '@/firebase/provider';
import { collection, query, where, orderBy, doc, updateDoc, writeBatch, getDocs, deleteDoc, setDoc } from 'firebase/firestore';
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
    Waves,
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
    Hammer
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { VesselMap } from '@/components/map';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

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
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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

            <div className="relative z-10 flex flex-col items-center gap-12 max-w-2xl text-center">
                <div className="relative h-48 w-48 bg-white/10 backdrop-blur-xl rounded-[3.5rem] p-10 border border-white/20 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] animate-in zoom-in-95 duration-700">
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

function EditItemDialog({ 
    isOpen, 
    setIsOpen, 
    item, 
    onSave, 
    type 
}: { 
    isOpen: boolean, 
    setIsOpen: (open: boolean) => void, 
    item: any, 
    onSave: (data: any) => Promise<void>, 
    type: 'range' | 'model' 
}) {
    const [name, setName] = useState('');
    const [image, setImage] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const storage = useStorage();

    useEffect(() => {
        if (item) {
            setName(item.name || '');
            setPreview(item.imageUrl || item.coverImageUrl || null);
        }
    }, [item]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const data: any = { name };
            if (image && storage) {
                const path = `catalog/${type}s/${item.id}/${Date.now()}-${image.name}`;
                data[type === 'range' ? 'imageUrl' : 'coverImageUrl'] = await uploadFileToStorage(storage, image, path);
            }
            await onSave(data);
            setIsOpen(false);
        } catch (e) {
            console.error(e);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="rounded-3xl border-4 shadow-2xl">
                <DialogHeader>
                    <DialogTitle className="text-xl font-black uppercase tracking-tight">Edit {type === 'range' ? 'Range' : 'Model'}</DialogTitle>
                    <DialogDescription className="text-[10px] font-black uppercase tracking-widest text-primary">Master Content Update</DialogDescription>
                </DialogHeader>
                <div className="space-y-6 py-4">
                    <div className="flex justify-center">
                        <div className="relative h-32 w-48 bg-muted rounded-2xl border-2 border-dashed overflow-hidden group">
                            {preview ? (
                                <>
                                    <Image src={preview} alt="Preview" fill className="object-contain p-2" unoptimized />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <label className="cursor-pointer">
                                            <Upload className="h-6 w-6 text-white" />
                                            <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) { setImage(file); setPreview(URL.createObjectURL(file)); }
                                            }} />
                                        </label>
                                    </div>
                                </>
                            ) : (
                                <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-muted/80 transition-all">
                                    <ImageIcon className="h-8 w-8 text-muted-foreground/40 mb-2" />
                                    <span className="text-[10px] font-black uppercase text-muted-foreground">Upload Render</span>
                                    <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) { setImage(file); setPreview(URL.createObjectURL(file)); }
                                    }} />
                                </label>
                            )}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Display Name</Label>
                        <Input value={name} onChange={e => setName(e.target.value)} className="h-12 font-bold text-lg rounded-xl border-2" />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsOpen(false)} className="rounded-xl font-black uppercase text-[10px]">Cancel</Button>
                    <Button onClick={handleSave} disabled={isSaving} className="rounded-xl font-black uppercase text-[10px] shadow-lg">
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="mr-2 h-4 w-4 mr-2" />}
                        Commit Changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function SortableItemCard({ 
    id, 
    name, 
    imageUrl, 
    code, 
    onClick, 
    onEdit, 
    canEdit,
    viewLabel = "VIEW RANGE"
}: { 
    id: string, 
    name: string, 
    imageUrl?: string, 
    code?: string, 
    onClick: () => void, 
    onEdit: () => void, 
    canEdit: boolean,
    viewLabel?: string
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 'auto',
        opacity: isDragging ? 0.5 : 1,
    };

    const isModelView = viewLabel === "VIEW MODEL";

    return (
        <div ref={setNodeRef} style={style} className="group relative h-full">
            <Card 
                className="cursor-pointer hover:border-primary shadow-sm rounded-3xl overflow-hidden border-2 transition-all hover:-translate-y-1 flex flex-col bg-white h-full" 
                onClick={onClick}
            >
                <div className={cn(
                    "aspect-[4/3] relative border-b flex items-center justify-center overflow-hidden transition-all",
                    isModelView ? "p-0 bg-white" : "p-6 bg-white"
                )}>
                    {imageUrl ? (
                        <div className="relative h-full w-full">
                            <Image 
                                src={imageUrl} 
                                alt={name} 
                                fill 
                                className={cn(
                                    "transition-transform group-hover:scale-105",
                                    isModelView ? "object-cover" : "object-contain"
                                )}
                                unoptimized 
                            />
                        </div>
                    ) : <div className="flex h-full w-full items-center justify-center"><Ship className="h-12 w-12 opacity-10" /></div>}
                </div>
                
                <CardContent className="p-5 flex-grow flex flex-col justify-between gap-4">
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-black uppercase tracking-tight leading-tight">{name}</CardTitle>
                            {code && <Badge variant="secondary" className="font-mono text-[8px] uppercase px-1.5 h-4 shrink-0 ml-2">{code}</Badge>}
                        </div>
                    </div>
                    
                    <div className="flex items-center justify-between pt-4 border-t border-dashed">
                        <span className="text-[10px] font-black uppercase tracking-tighter text-primary">{viewLabel}</span>
                        <ArrowRight className="h-4 w-4 text-primary transform -translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all" />
                    </div>
                </CardContent>
            </Card>

            {canEdit && (
                <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                    <Button 
                        type="button"
                        variant="secondary" 
                        size="icon" 
                        className="h-8 w-8 rounded-xl bg-white/90 backdrop-blur-md shadow-md border hover:bg-white"
                        onClick={(e) => { e.stopPropagation(); onEdit(); }}
                    >
                        <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <div 
                        {...attributes} 
                        {...listeners} 
                        className="h-8 w-8 rounded-xl bg-white/90 backdrop-blur-md shadow-md border flex items-center justify-center cursor-grab active:cursor-grabbing hover:bg-white"
                    >
                        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                </div>
            )}
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
                                            <div className="aspect-video bg-muted/30 relative border-b">
                                                {range.imageUrl ? (
                                                    <div className="relative h-full w-full">
                                                        <Image src={range.imageUrl} alt={range.name} fill className="object-cover" unoptimized />
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

    const userPermissions = useMemo(() => {
        const roleId = userProfile?.organisationRole;
        if (!roleId || !currentMemberOrg?.permissions?.[roleId]) return {};
        return currentMemberOrg.permissions[roleId];
    }, [userProfile, currentMemberOrg]);

    const canEdit = isAdmin || !!userPermissions.can_edit_boat_data;

    // Override Sync Logic
    const overrideRef = useMemoFirebase(() => 
        currentMemberOrg?.id && selectedModel?.id ? doc(firestore, 'organisations', currentMemberOrg.id, 'modelOverrides', selectedModel.id) : null,
    [firestore, currentMemberOrg?.id, selectedModel?.id]);
    const { data: modelOverride } = useDoc<any>(overrideRef);

    const effectiveModel = useMemo(() => {
        if (!selectedModel) return null;
        if (!modelOverride) return selectedModel;
        return { ...selectedModel, ...modelOverride };
    }, [selectedModel, modelOverride]);

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

            {/* Immersive Cinematic Hero */}
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

            {/* Premium Navigation Ribbon */}
            <div className="bg-white border-b shrink-0 z-10 px-10">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid grid-cols-6 w-full h-12 bg-transparent p-0 gap-4">
                        {[
                            { id: 'dashboard', label: 'Dashboard' },
                            { id: 'bmt', label: 'Product Catalog' },
                            { id: 'operations', label: 'Operations' },
                            { id: 'pricing', label: 'Pricing' },
                            { id: 'fit-up', label: 'Fit Up' },
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
            <main className="flex-1 overflow-hidden relative">
                <Tabs value={activeTab} className="h-full">
                    <TabsContent value="dashboard" className="m-0 h-full animate-in fade-in duration-500 overflow-hidden">
                        <ScrollArea className="h-full">
                            <div className="p-8">
                                <div className="grid grid-cols-12 gap-8 h-full">
                                    <div className="col-span-4 flex flex-col gap-8 h-full overflow-hidden">
                                        <Card className="flex-1 flex flex-col border-2 rounded-[2.5rem] shadow-sm bg-white overflow-hidden transition-all hover:shadow-md">
                                            <CardHeader className="py-4 px-8 border-b bg-muted/5 flex flex-row items-center justify-between shrink-0 flex-nowrap">
                                                <div className="flex items-center gap-3 shrink-0">
                                                    <Badge variant="outline" className="h-5 text-[9px] font-black uppercase border-primary/20 text-primary bg-primary/5 px-2">Asset</Badge>
                                                    <h3 className="font-black uppercase italic text-sm tracking-tight text-slate-900 whitespace-nowrap">Stock</h3>
                                                </div>
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
                                            <span className="relative z-10">{mainVendor?.name || 'Highfield'} Catalogue</span>
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
                                    {view === 'bmt' && effectiveModel && selectedRange && (
                                        <ModelConfigurationEditor 
                                            model={effectiveModel}
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

                    <TabsContent value="operations" className="m-0 h-full animate-in fade-in duration-500 overflow-hidden p-8">
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

                    <TabsContent value="pricing" className="m-0 h-full overflow-hidden">
                        <ScrollArea className="h-full">
                            <div className="p-8">
                                {currentMemberOrg && mainVendor && (
                                    <ModulePricingDashboard module={moduleData} organisation={currentMemberOrg as any} vendor={mainVendor} />
                                )}
                            </div>
                        </ScrollArea>
                    </TabsContent>

                    <TabsContent value="fit-up" className="m-0 h-full overflow-hidden">
                        <ScrollArea className="h-full">
                            <div className="p-8">
                                <Card className="border-2 rounded-[2.5rem] overflow-hidden bg-white shadow-sm">
                                    <CardHeader className="p-8 border-b bg-muted/5">
                                        <CardTitle className="text-xl font-black uppercase tracking-tight">Fit Up Workspace</CardTitle>
                                        <CardDescription className="text-xs uppercase font-black text-muted-foreground tracking-widest">Global assembly and labor management.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="p-20 text-center text-muted-foreground opacity-20">
                                        <Hammer className="h-12 w-12 mx-auto mb-4" />
                                        <p className="font-black uppercase tracking-widest text-xs">Module-Wide Fit Up Metrics Synchronized</p>
                                    </CardContent>
                                </Card>
                            </div>
                        </ScrollArea>
                    </TabsContent>

                    <TabsContent value="network" className="m-0 h-full animate-in fade-in duration-500 overflow-hidden">
                        <ScrollArea className="h-full">
                            <div className="p-8">
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
                                            <div className="p-20 text-center text-muted-foreground opacity-20">
                                                <Building className="h-12 w-12 mx-auto mb-4" />
                                                <p className="font-black uppercase tracking-widest text-xs">No Sub Dealers Registered</p>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>
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
                    organisation={currentMemberOrg as any}
                />
            )}
        </div>
    );
}

function RangesGrid({ vendor, onRangeSelect, canEdit }: { vendor: Vendor; onRangeSelect: (range: Range) => void, canEdit: boolean }) {
    const firestore = useFirestore();
    const rangesQuery = useMemoFirebase(() => vendor?.id ? query(collection(firestore, `data-warehouse/${vendor.id}/ranges`), orderBy('order')) : null, [firestore, vendor?.id]);
    const { data: ranges, loading } = useCollection<Range>(rangesQuery);

    const [editingItem, setEditingItem] = useState<Range | null>(null);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id && ranges) {
            const oldIndex = ranges.findIndex(i => i.id === active.id);
            const newIndex = ranges.findIndex(i => i.id === over.id);
            const newItems = arrayMove(ranges, oldIndex, newIndex);
            
            const batch = writeBatch(firestore);
            newItems.forEach((item, index) => {
                batch.update(doc(firestore, `data-warehouse/${vendor.id}/ranges`, item.id), { order: index });
            });
            await batch.commit();
        }
    };

    const handleUpdateRange = async (data: any) => {
        if (!editingItem) return;
        const docRef = doc(firestore, `data-warehouse/${vendor.id}/ranges`, editingItem.id);
        updateDoc(docRef, data).catch(async (serverError) => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: docRef.path,
                operation: 'update',
                requestResourceData: data
            } satisfies SecurityRuleContext));
        });
    };

    if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-10 w-10 text-primary" /></div>;
    
    return (
        <>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={ranges?.map(r => r.id) || []} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8 py-2 px-1">
                        {ranges?.map(range => (
                            <SortableItemCard 
                                key={range.id}
                                id={range.id}
                                name={range.name}
                                imageUrl={range.imageUrl}
                                canEdit={canEdit}
                                onClick={() => onRangeSelect(range)}
                                onEdit={() => { setEditingItem(range); setIsEditDialogOpen(true); }}
                                viewLabel="VIEW RANGE"
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>

            <EditItemDialog 
                isOpen={isEditDialogOpen} 
                setIsOpen={setIsEditDialogOpen} 
                item={editingItem} 
                type="range" 
                onSave={handleUpdateRange} 
            />
        </>
    );
}

function ModelsGrid({ range, vendor, onModelSelect, canEdit }: { range: Range; vendor: Vendor; onModelSelect: (model: Model) => void; canEdit: boolean }) {
    const firestore = useFirestore();
    const modelsQuery = useMemoFirebase(() => vendor?.id && range?.id ? query(collection(firestore, `data-warehouse/${vendor.id}/ranges/${range.id}/models`), orderBy('order')) : null, [firestore, vendor?.id, range?.id]);
    const { data: models, loading } = useCollection<Model>(modelsQuery);

    const [editingItem, setEditingItem] = useState<Model | null>(null);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id && models) {
            const oldIndex = models.findIndex(i => i.id === active.id);
            const newIndex = models.findIndex(i => i.id === over.id);
            const newItems = arrayMove(models, oldIndex, newIndex);
            
            const batch = writeBatch(firestore);
            newItems.forEach((item, index) => {
                batch.update(doc(firestore, `data-warehouse/${vendor.id}/ranges/${range.id}/models`, item.id), { order: index });
            });
            await batch.commit();
        }
    };

    const handleUpdateModel = async (data: any) => {
        if (!editingItem) return;
        const docRef = doc(firestore, `data-warehouse/${vendor.id}/ranges/${range.id}/models`, editingItem.id);
        updateDoc(docRef, data).catch(async (serverError) => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: docRef.path,
                operation: 'update',
                requestResourceData: data
            } satisfies SecurityRuleContext));
        });
    };

    if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-10 w-10 text-primary" /></div>;

    return (
        <>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={models?.map(m => m.id) || []} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8 py-2 px-1">
                        {models?.map(model => (
                            <SortableItemCard 
                                key={model.id}
                                id={model.id}
                                name={model.name}
                                code={model.modelCode}
                                imageUrl={model.coverImageUrl}
                                canEdit={canEdit}
                                onClick={() => onModelSelect(model)}
                                onEdit={() => { setEditingItem(model); setIsEditDialogOpen(true); }}
                                viewLabel="VIEW MODEL"
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>

            <EditItemDialog 
                isOpen={isEditDialogOpen} 
                setIsOpen={setIsEditDialogOpen} 
                item={editingItem} 
                type="model" 
                onSave={handleUpdateModel} 
            />
        </>
    );
}
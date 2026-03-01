'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc, where, getDocs, type CollectionReference } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
    Loader2, 
    ChevronRight, 
    ChevronLeft, 
    Ship, 
    CheckCircle2, 
    ShieldCheck, 
    Info,
    ArrowRight,
    Tag,
    DollarSign,
    Box,
    Wrench,
    Plus,
    X,
    LayoutGrid,
    Layers,
    Package,
    Settings2,
    ListChecks,
    ClipboardList,
    Lock,
    Maximize2,
    FileText,
    ExternalLink
} from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/currency-utils';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
} from "@/components/ui/carousel";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

interface Variant {
    id: string;
    sku: string | null;
    name: string;
    colorName?: string;
    colorCode?: string;
    material?: string;
    cost?: number;
    sellPriceExclGst?: number;
    imageUrl?: string;
}

interface Step {
    id: number;
    label: string;
}

const STEPS: Step[] = [
    { id: 1, label: 'Boat Base' },
    { id: 2, label: 'Factory Options' },
    { id: 3, label: 'Engine & Rigging' },
    { id: 4, label: 'Trailer' },
    { id: 5, label: 'Dealer Fit' },
    { id: 6, label: 'Summary' },
];

export function HighfieldQuoteFlow({ 
    module, 
    model, 
    vendor,
    range,
    rangeId 
}: { 
    module: any, 
    model: any, 
    vendor: any,
    range?: any,
    rangeId: string 
}) {
    const firestore = useFirestore();
    const [currentStep, setCurrentStep] = useState(1);
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    
    // Selection State
    const [selectedMaterial, setSelectedMaterial] = useState<'PVC' | 'HYP' | null>(null);
    const [selectedColor, setSelectedColor] = useState<string | null>(null);
    const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
    const [selectedMotor, setSelectedMotor] = useState<any | null>(null);
    const [selectedMotorDataSetId, setSelectedMotorDataSetId] = useState<string | null>(null);

    // Dialog States
    const [showStandardFeatures, setShowStandardFeatures] = useState(false);
    const [showGeneralSpecs, setShowGeneralSpecs] = useState(false);
    const [lightboxImage, setLightboxImage] = useState<string | null>(null);

    // 1. Fetch Variants
    const variantsQuery = useMemoFirebase(() => 
        query(collection(firestore, `data-warehouse/${vendor.id}/ranges/${rangeId}/models/${model.id}/variants`), orderBy('order')),
    [firestore, vendor.id, rangeId, model.id]);
    
    const { data: variants, loading: variantsLoading } = useCollection<Variant>(variantsQuery);

    // 2. Fetch Compatible Motors
    const [motors, setMotors] = useState<any[]>([]);
    const [motorsLoading, setMotorsLoading] = useState(false);

    useEffect(() => {
        const fetchMotors = async () => {
            if (currentStep !== 3) return;
            setMotorsLoading(true);
            try {
                const vendorsSnap = await getDocs(collection(firestore, 'data-warehouse'))
                    .catch(async (e) => {
                        errorEmitter.emit('permission-error', new FirestorePermissionError({
                            path: 'data-warehouse',
                            operation: 'list'
                        } satisfies SecurityRuleContext));
                        throw e;
                    });

                const allVendors = vendorsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
                const allModuleVendorIds = [...(module.associatedVendorIds || []), module.mainVendorId].filter(Boolean);
                const motorVendor = allVendors.find(v => allModuleVendorIds.includes(v.id) && v.vendorType === 'Motor Brand');

                if (motorVendor) {
                    const dsRef = collection(firestore, 'data-warehouse', motorVendor.id, 'dataSets');
                    const dsSnap = await getDocs(dsRef)
                        .catch(async (e) => {
                            errorEmitter.emit('permission-error', new FirestorePermissionError({
                                path: dsRef.path,
                                operation: 'list'
                            } satisfies SecurityRuleContext));
                            throw e;
                        });

                    const datasets = dsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
                    const targetDS = datasets.find(s => s.name.toLowerCase().includes('outboard') || s.name.toLowerCase().includes('motor')) || datasets[0];
                    
                    if (targetDS) {
                        setSelectedMotorDataSetId(targetDS.id);
                        const rowsRef = collection(firestore, `data-warehouse/${motorVendor.id}/dataSets/${targetDS.id}/rows`);
                        const rowsSnap = await getDocs(rowsRef)
                            .catch(async (e) => {
                                errorEmitter.emit('permission-error', new FirestorePermissionError({
                                    path: rowsRef.path,
                                    operation: 'list'
                                } satisfies SecurityRuleContext));
                                throw e;
                            });

                        const allRows = rowsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

                        const motorOverrides = model.motorOverrides || {};
                        const allowedIds = new Set<string>();
                        Object.values(motorOverrides).forEach((ov: any) => {
                            if (ov.manualIds) ov.manualIds.forEach((id: string) => allowedIds.add(id));
                        });

                        if (allowedIds.size > 0) {
                            setMotors(allRows.filter(r => allowedIds.has(r.id)));
                        } else {
                            const maxHp = model.specifications?.motorConfigurations?.[0]?.engines?.[0]?.maxHp || 999;
                            const minHp = model.specifications?.motorConfigurations?.[0]?.engines?.[0]?.minHp || 0;
                            setMotors(allRows.filter(r => {
                                const hp = parseInt(r['HP Rating']) || 0;
                                return hp >= minHp && hp <= maxHp;
                            }));
                        }
                    }
                }
            } catch (e) {
                // error handled
            } finally {
                setMotorsLoading(false);
            }
        };
        fetchMotors();
    }, [currentStep, firestore, module, model]);

    // Scroll Reset on Step Change
    useEffect(() => {
        if (scrollAreaRef.current) {
            const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
            if (viewport) {
                viewport.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }
    }, [currentStep]);

    // Data Derivations
    const activeVariant = useMemo(() => {
        if (!selectedColor || !variants) return null;
        return variants.find(v => v.id === selectedColor);
    }, [selectedColor, variants]);

    const carouselImages = useMemo(() => {
        const images = [];
        if (activeVariant?.imageUrl) {
            images.push(activeVariant.imageUrl);
        } else if (model.coverImageUrl) {
            images.push(model.coverImageUrl);
        }
        if (model.galleryImageUrls && Array.isArray(model.galleryImageUrls)) {
            images.push(...model.galleryImageUrls);
        }
        return [...new Set(images)].filter(img => typeof img === 'string' && img.trim() !== ''); 
    }, [activeVariant, model]);

    const availableMaterials = useMemo(() => {
        if (!variants) return [];
        return [...new Set(variants.map(v => v.material))].filter(Boolean) as string[];
    }, [variants]);

    const availableColors = useMemo(() => {
        if (!variants || !selectedMaterial) return [];
        return variants.filter(v => v.material === selectedMaterial).map(v => ({
            id: v.id,
            name: v.colorName || 'Default Color',
            code: v.colorCode,
            imageUrl: v.imageUrl,
            sku: v.sku
        }));
    }, [variants, selectedMaterial]);

    const factoryOptions = useMemo(() => {
        const options = model.optionalFeatures || [];
        const rules = model.rules || [];

        const whitelistedSeatIds = selectedOptionIds.map(id => {
            const opt = options.find((f: any) => f.id === id);
            return opt?.category === 'Consoles' ? opt.associatedSeatId : null;
        }).filter(Boolean);

        let filtered = options.filter((opt: any) => {
            if (!activeVariant) return false;
            if (opt.applicableVariantIds?.length > 0 && !opt.applicableVariantIds.includes(activeVariant.id)) return false;
            if (opt.category === 'Seats') return whitelistedSeatIds.includes(opt.id);
            return true;
        });

        selectedOptionIds.forEach(selectedId => {
            const rule = rules.find((r: any) => r.sourceOptionId === selectedId && r.type === 'exclude');
            if (rule) filtered = filtered.filter((opt: any) => !rule.targetOptionIds.includes(opt.id));
        });

        return filtered;
    }, [model.optionalFeatures, model.rules, activeVariant, selectedOptionIds]);

    const groupedOptions = useMemo(() => {
        const groups = factoryOptions.reduce((acc: any, opt: any) => {
            const cat = opt.category || 'General Options';
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(opt);
            return acc;
        }, {});

        const sortedKeys = Object.keys(groups).sort((a, b) => {
            if (a === 'Consoles') return -1;
            if (b === 'Consoles') return 1;
            if (a === 'Seats') return -1;
            if (b === 'Seats') return 1;
            return a.localeCompare(b);
        });

        const sortedGroups: any = {};
        sortedKeys.forEach(key => { sortedGroups[key] = groups[key]; });
        return sortedGroups;
    }, [factoryOptions]);

    const totalPrice = useMemo(() => {
        let total = activeVariant?.sellPriceExclGst || 0;
        selectedOptionIds.forEach(id => {
            const opt = model.optionalFeatures?.find((f: any) => f.id === id);
            if (opt) total += (opt.sellPriceExclGst || 0);
        });
        if (selectedMotor) {
            total += (selectedMotor.sellPriceExclGst || 0);
            selectedMotor.masterAccessories?.forEach((acc: any) => {
                acc.items?.forEach((item: any) => {
                    total += (item.data?.sellPriceExclGst || 0);
                });
            });
        }
        return total;
    }, [activeVariant, selectedOptionIds, model.optionalFeatures, selectedMotor]);

    const isStep1Complete = !!(selectedMaterial && selectedColor);
    const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, STEPS.length));
    const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

    const toggleOption = (id: string) => {
        const option = model.optionalFeatures?.find((f: any) => f.id === id);
        const isSelected = selectedOptionIds.includes(id);

        if (isSelected) {
            let toRemove = [id];
            if (option?.category === 'Consoles' && option.associatedSeatId) {
                toRemove.push(option.associatedSeatId);
            }
            setSelectedOptionIds(prev => prev.filter(i => !toRemove.includes(i)));
        } else {
            let toAdd = [id];
            if (option?.category === 'Consoles' && option.associatedSeatId) {
                toAdd.push(option.associatedSeatId);
            }
            setSelectedOptionIds(prev => [...new Set([...prev, ...toAdd])]);
        }
    };

    const isOptionLocked = (id: string) => {
        const option = model.optionalFeatures?.find((f: any) => f.id === id);
        if (option?.category === 'Seats') {
            const parentConsole = model.optionalFeatures?.find((f: any) => f.category === 'Consoles' && f.associatedSeatId === id);
            return parentConsole && selectedOptionIds.includes(parentConsole.id);
        }
        return false;
    };

    const handleMaterialSelect = (mat: string) => {
        setSelectedMaterial(mat as any);
        setSelectedColor(null);
    };

    const rangePart = range?.name || '';
    const fullModelName = model.name;
    const modelPart = fullModelName.toLowerCase().startsWith(rangePart.toLowerCase()) 
        ? fullModelName.substring(rangePart.length).trim()
        : fullModelName;

    return (
        <div className="h-full -mt-6 md:-mt-8 -mx-4 md:-mx-6 bg-background flex flex-col relative overflow-hidden">
            {/* Ambient Background */}
            <div className="absolute inset-0 z-0">
                {model.coverImageUrl && (
                    <div className="relative h-full w-full opacity-5 blur-3xl scale-110">
                        <Image src={model.coverImageUrl} alt="Bg" fill className="object-cover" unoptimized />
                    </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />
            </div>

            {/* Sticky Step Header - Spaced Out Evenly */}
            <div className="sticky top-0 z-30 px-6 md:px-12 h-24 border-b bg-card/90 backdrop-blur-xl shrink-0 shadow-sm transition-all flex items-center">
                <div className="w-full flex items-center justify-between">
                    <div className="flex-1 flex items-center justify-between mr-8 md:mr-16">
                        {STEPS.map((step) => (
                            <div key={step.id} className="flex items-center gap-2">
                                <div className={cn(
                                    "h-8 w-8 rounded-full flex items-center justify-center text-[10px] font-black transition-all border-2",
                                    currentStep === step.id ? "bg-primary border-primary text-white scale-110 shadow-lg" : 
                                    currentStep > step.id ? "bg-green-500 border-green-500 text-white" : "bg-muted border-transparent text-muted-foreground"
                                )}>
                                    {currentStep > step.id ? <CheckCircle2 className="h-4 w-4" /> : step.id}
                                </div>
                                <span className={cn(
                                    "text-[9px] font-black uppercase tracking-widest transition-colors hidden sm:block whitespace-nowrap",
                                    currentStep === step.id ? "text-foreground" : "text-muted-foreground"
                                )}>
                                    {step.label}
                                </span>
                                {step.id < STEPS.length && <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/30 hidden lg:block ml-2" />}
                            </div>
                        ))}
                    </div>
                    <button 
                        className="font-black text-destructive hover:text-destructive/80 transition-colors uppercase tracking-[0.15em] text-[10px] h-8 flex items-center px-4 shrink-0 border border-destructive/10 rounded-full hover:bg-destructive/5" 
                        onClick={() => window.history.back()}
                    >
                        Exit
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="relative z-10 flex-1 flex flex-col lg:flex-row overflow-hidden">
                {/* Visualizer Panel (Left) */}
                <div className="w-full lg:w-7/12 relative flex flex-col items-center justify-center overflow-hidden h-full min-h-0 bg-slate-50/50">
                    <div className="w-full h-full flex flex-col items-center justify-center p-6 md:p-12 animate-in fade-in zoom-in-95 duration-700">
                        <div className="w-full h-full flex flex-col gap-8">
                            
                            {/* The "Soft Cube" Visualizer - Redesigned for maximized renders with rounding and fade */}
                            <div className="relative flex-1 w-full flex flex-col bg-white rounded-[3rem] border-2 border-slate-100 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.08)] overflow-hidden group min-h-0 p-2">
                                {/* Main Image Carousel area */}
                                <div className="flex-1 w-full min-h-0 relative flex items-center justify-center">
                                    <Carousel className="w-full h-full" opts={{ loop: true }}>
                                        <CarouselContent className="h-full">
                                            {carouselImages.length > 0 ? carouselImages.map((url, idx) => (
                                                <CarouselItem key={`${url}-${idx}`} className="h-full w-full p-4">
                                                    <div 
                                                        className="relative h-full w-full flex items-center justify-center cursor-zoom-in active:scale-[0.98] transition-all duration-500"
                                                        onClick={() => setLightboxImage(url)}
                                                    >
                                                        {/* Rounding and soft external fade container */}
                                                        <div className="relative w-[95%] h-[95%] rounded-[2.5rem] overflow-hidden bg-white shadow-[0_20px_60px_-15px_rgba(0,0,0,0.12)] border border-slate-50 transition-shadow">
                                                            <Image 
                                                                src={url} 
                                                                alt={`Boat View ${idx}`} 
                                                                fill 
                                                                className="object-contain p-6 md:p-10" 
                                                                unoptimized
                                                            />
                                                        </div>
                                                    </div>
                                                </CarouselItem>
                                            )) : (
                                                <CarouselItem className="h-full">
                                                    <div className="flex h-full w-full items-center justify-center text-muted-foreground opacity-5">
                                                        <Ship className="h-24 w-24" />
                                                    </div>
                                                </CarouselItem>
                                            )}
                                        </CarouselContent>
                                        {carouselImages.length > 1 && (
                                            <>
                                                <CarouselPrevious className="left-4 h-8 w-8 opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-all bg-white/80 backdrop-blur-md border-none shadow-lg text-slate-400 hover:text-primary z-30" />
                                                <CarouselNext className="right-4 h-8 w-8 opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-all bg-white/80 backdrop-blur-md border-none shadow-lg text-slate-400 hover:text-primary z-30" />
                                            </>
                                        )}
                                    </Carousel>
                                </div>

                                {/* Tech Hub Footer - Non-overlapping center of bottom card */}
                                <div className="flex items-center justify-center gap-2 py-4 border-t border-slate-50 mt-auto shrink-0 bg-slate-50/30">
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="rounded-full h-10 w-10 bg-white hover:bg-primary hover:text-white text-primary transition-all active:scale-95 shadow-sm border" 
                                                    onClick={() => setShowStandardFeatures(true)}
                                                >
                                                    <ListChecks className="h-5 w-5" />
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent className="font-bold text-[9px] uppercase tracking-widest bg-slate-900 text-white border-none shadow-xl px-3 py-2">
                                                Standard Features
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                    
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="rounded-full h-10 w-10 bg-white hover:bg-primary hover:text-white text-primary transition-all active:scale-95 shadow-sm border" 
                                                    onClick={() => setShowGeneralSpecs(true)}
                                                >
                                                    <ClipboardList className="h-5 w-5" />
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent className="font-bold text-[9px] uppercase tracking-widest bg-slate-900 text-white border-none shadow-xl px-3 py-2">
                                                Technical Specs
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>

                                    {model.documents && model.documents.length > 0 && (
                                        <div className="flex items-center gap-2 border-l border-slate-200 pl-2 ml-1">
                                            {model.documents.map((doc: any, i: number) => (
                                                <TooltipProvider key={doc.id || i}>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button 
                                                                variant="ghost" 
                                                                size="icon" 
                                                                className="rounded-full h-10 w-10 bg-white hover:bg-primary hover:text-white text-primary transition-all active:scale-95 shadow-sm border" 
                                                                asChild
                                                            >
                                                                <a href={doc.url} target="_blank" rel="noopener noreferrer">
                                                                    <FileText className="h-5 w-5" />
                                                                </a>
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent className="font-bold text-[9px] uppercase tracking-widest bg-slate-900 text-white border-none shadow-xl px-3 py-2">
                                                            {doc.name || 'View Document'}
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Build Summary Hub (Dual-Row Layout) */}
                            <div className="bg-white/95 backdrop-blur-xl border-2 border-white shadow-[0_30px_100px_-10px_rgba(0,0,0,0.1)] p-8 md:p-10 rounded-[2.5rem] flex flex-col gap-2 shrink-0 transition-all">
                                {/* Row 1: Labels */}
                                <div className="flex items-center justify-between px-1">
                                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Current Build</span>
                                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Build Total (Excl. Tax)</span>
                                </div>
                                {/* Row 2: Values */}
                                <div className="flex items-center justify-between px-1">
                                    <div className="flex items-center gap-3 text-4xl tracking-tight min-w-0">
                                        {rangePart && <span className="text-primary font-normal whitespace-nowrap">{rangePart}</span>}
                                        <span className="text-slate-950 font-black whitespace-nowrap">{modelPart}</span>
                                    </div>
                                    <div className="text-5xl font-black flex items-center justify-end gap-1.5 text-slate-950 tracking-tighter">
                                        <span className="text-primary text-2xl">$</span>
                                        {totalPrice.toLocaleString()}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Configuration Panel (Right) - Isolated Scrolling */}
                <ScrollArea ref={scrollAreaRef} className="w-full lg:w-5/12 h-full bg-slate-50/50 backdrop-blur-md border-l border-slate-100">
                    <div className="p-8 md:p-12 pb-32 min-h-full flex flex-col">
                        
                        {currentStep === 1 && (
                            <div className="space-y-10 animate-in slide-in-from-right-4 duration-500">
                                <div className="space-y-3">
                                    <h2 className="text-4xl font-black uppercase tracking-tight leading-none">The Foundation</h2>
                                    <p className="text-muted-foreground font-medium text-base leading-relaxed max-w-md">Select your hull material and tube color to initialize the build specifications.</p>
                                </div>

                                <div className="space-y-5">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-primary bg-primary/5 px-2 py-1 rounded">1. Tube Material</span>
                                    <div className="grid grid-cols-2 gap-4">
                                        {availableMaterials.map((mat) => (
                                            <button
                                                key={mat}
                                                onClick={() => handleMaterialSelect(mat)}
                                                className={cn(
                                                    "group relative flex flex-col items-start p-6 border-2 rounded-[2rem] transition-all duration-300",
                                                    selectedMaterial === mat ? "bg-primary border-primary text-white shadow-2xl shadow-primary/20 scale-[1.02]" : "bg-white border-slate-100 hover:border-primary/40"
                                                )}
                                            >
                                                <span className="text-base font-black uppercase tracking-tight">{mat}</span>
                                                <p className={cn("text-[9px] font-bold mt-1 uppercase", selectedMaterial === mat ? "text-white/60" : "text-muted-foreground")}>
                                                    {mat === 'PVC' ? 'Robust Standard' : 'Premium HYP'}
                                                </p>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {selectedMaterial && (
                                    <div className="space-y-5 pt-10">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-primary bg-primary/5 px-2 py-1 rounded">2. Available Colors</span>
                                        <div className="grid grid-cols-2 gap-4">
                                            {availableColors.map((color) => (
                                                <button
                                                    key={color.id}
                                                    onClick={() => setSelectedColor(color.id)}
                                                    className={cn(
                                                        "group flex flex-col border-2 rounded-[2rem] overflow-hidden transition-all duration-300 text-left bg-white",
                                                        selectedColor === color.id ? "border-primary shadow-2xl scale-[1.02]" : "border-slate-100 hover:border-primary/20"
                                                    )}
                                                >
                                                    <div className="relative aspect-video w-full border-b bg-white">
                                                        {color.imageUrl ? (
                                                            <Image src={color.imageUrl} alt={color.name} fill className="object-contain p-3" unoptimized />
                                                        ) : (
                                                            <div className="flex h-full w-full items-center justify-center opacity-5"><Ship className="h-8 w-8"/></div>
                                                        )}
                                                    </div>
                                                    <div className={cn("p-4", selectedColor === color.id ? "bg-primary text-white" : "bg-white")}>
                                                        <p className="text-[11px] font-black uppercase tracking-tight truncate">{color.name}</p>
                                                        <p className={cn("text-[9px] font-bold uppercase", selectedColor === color.id ? "text-white/60" : "text-muted-foreground")}>{color.code}</p>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {currentStep === 2 && (
                            <div className="space-y-10 animate-in slide-in-from-right-4 duration-500">
                                <div className="space-y-3">
                                    <h2 className="text-4xl font-black uppercase tracking-tight leading-none">Factory Options</h2>
                                    <p className="text-muted-foreground font-medium text-base leading-relaxed max-w-md">Customize your Highfield with approved consoles, seating, and technical upgrades.</p>
                                </div>

                                <div className="space-y-12">
                                    {Object.entries(groupedOptions).map(([category, options]: [string, any]) => (
                                        <div key={category} className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-500">
                                            <h3 className="text-[11px] font-black uppercase tracking-widest text-foreground border-l-4 border-primary pl-3">{category}</h3>
                                            <div className="grid gap-3">
                                                {options.map((opt: any) => {
                                                    const isSelected = selectedOptionIds.includes(opt.id);
                                                    const isLocked = isOptionLocked(opt.id);
                                                    return (
                                                        <button
                                                            key={opt.id}
                                                            onClick={() => !isLocked && toggleOption(opt.id)}
                                                            disabled={isLocked}
                                                            className={cn(
                                                                "group flex items-center justify-between p-5 border-2 rounded-[1.5rem] transition-all duration-300 text-left relative",
                                                                isSelected ? "bg-primary/5 border-primary shadow-lg" : "bg-white border-slate-100 hover:border-primary/20",
                                                                isLocked && "opacity-80 cursor-default"
                                                            )}
                                                        >
                                                            <div className="flex items-center gap-5 min-w-0">
                                                                <div className="h-14 w-14 relative rounded-xl bg-slate-50 border overflow-hidden shrink-0 shadow-inner">
                                                                    {opt.imageUrl ? <Image src={opt.imageUrl} alt={opt.name} fill className="object-cover" unoptimized /> : <Package className="h-6 w-6 m-auto mt-4 opacity-5" />}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <div className="flex items-center gap-2">
                                                                        <p className="text-sm font-black uppercase tracking-tight truncate leading-tight">{opt.name}</p>
                                                                        {isLocked && <ShieldCheck className="h-3.5 w-3.5 text-primary" />}
                                                                    </div>
                                                                    {opt.code && <p className="text-[10px] font-mono text-muted-foreground uppercase mt-1">{opt.code}</p>}
                                                                </div>
                                                            </div>
                                                            <p className={cn("text-sm font-black ml-4 shrink-0", isSelected ? "text-primary" : "text-foreground")}>
                                                                +${(opt.sellPriceExclGst || 0).toLocaleString()}
                                                            </p>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {currentStep === 3 && (
                            <div className="space-y-10 animate-in slide-in-from-right-4 duration-500">
                                <div className="space-y-3">
                                    <h2 className="text-4xl font-black uppercase tracking-tight leading-none">Engine & Rigging</h2>
                                    <p className="text-muted-foreground font-medium text-base leading-relaxed max-w-md">Select a compatible outboard and associated rigging kits.</p>
                                </div>

                                {motorsLoading ? (
                                    <div className="flex flex-col items-center justify-center py-24 gap-4">
                                        <Loader2 className="h-12 w-12 animate-spin text-primary" />
                                        <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground animate-pulse">Syncing compatible motors...</p>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="grid gap-4">
                                            {motors.map((motor) => {
                                                const isSelected = selectedMotor?.id === motor.id;
                                                const imgPath = motor.SummaryImage || motor.imageUrl;
                                                const getImageUrl = (path: string) => {
                                                    if (!path) return null;
                                                    const clean = path.trim().replace(/\\/g, '/');
                                                    if (clean.startsWith('http')) return clean;
                                                    return `https://www.yamaha-motor.com.au${clean.startsWith('/') ? '' : '/'}${clean}`;
                                                };
                                                
                                                return (
                                                    <div key={motor.id} className="space-y-3">
                                                        <button
                                                            onClick={() => setSelectedMotor(isSelected ? null : motor)}
                                                            className={cn(
                                                                "w-full flex items-center justify-between p-6 border-2 rounded-[2rem] transition-all duration-300 text-left group",
                                                                isSelected ? "bg-primary border-primary text-white shadow-2xl shadow-primary/20 scale-[1.02]" : "bg-white border-slate-100 hover:border-primary/40"
                                                            )}
                                                        >
                                                            <div className="flex items-center gap-6">
                                                                <div className="h-20 w-20 relative bg-white rounded-2xl border-2 overflow-hidden shrink-0 shadow-inner">
                                                                    {getImageUrl(imgPath) ? <Image src={getImageUrl(imgPath)!} alt="Motor" fill className="object-contain p-2" unoptimized /> : <Ship className="h-8 w-8 m-auto mt-6 opacity-10" />}
                                                                </div>
                                                                <div>
                                                                    <div className="flex items-center gap-2 mb-1.5">
                                                                        <Badge variant="outline" className={cn("font-black text-[10px] px-2 py-0.5", isSelected ? "border-white/20 text-white" : "border-primary/20 text-primary")}>
                                                                            {motor['HP Rating'] || 'ENGINE'} HP
                                                                        </Badge>
                                                                        <span className="text-[10px] font-black uppercase opacity-60 tracking-widest">Outboard</span>
                                                                    </div>
                                                                    <p className="text-base font-black uppercase tracking-tight leading-tight">{motor['Model Name']}</p>
                                                                    <p className={cn("text-[10px] font-mono font-bold mt-1.5 uppercase", isSelected ? "text-white/60" : "text-muted-foreground/60")}>{motor['Part Number']}</p>
                                                                </div>
                                                            </div>
                                                            <p className="text-base font-black">${(motor.sellPriceExclGst || 0).toLocaleString()}</p>
                                                        </button>

                                                        {isSelected && motor.masterAccessories && (
                                                            <div className="p-6 bg-slate-50 border-2 border-dashed rounded-[2rem] space-y-5 animate-in slide-in-from-top-2 duration-300">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="h-6 w-6 bg-primary/10 rounded-full flex items-center justify-center"><Wrench className="h-3 w-3 text-primary" /></div>
                                                                    <span className="text-[11px] font-black uppercase tracking-widest">Linked Rigging & Props</span>
                                                                </div>
                                                                <div className="space-y-2.5">
                                                                    {motor.masterAccessories.map((acc: any, i: number) => (
                                                                        <div key={i} className="flex items-center justify-between text-xs font-medium p-3.5 bg-white rounded-xl border border-slate-100 shadow-sm">
                                                                            <span className="truncate pr-4 uppercase tracking-tight">{acc.name}</span>
                                                                            <span className="font-black text-primary shrink-0">${(acc.items?.[0]?.data?.sellPriceExclGst || 0).toLocaleString()}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="pt-20 sticky bottom-0 bg-gradient-to-t from-slate-50 via-slate-50/95 to-transparent pb-6 mt-auto">
                            <div className="flex gap-4">
                                {currentStep > 1 && (
                                    <Button variant="outline" size="lg" className="h-16 w-24 rounded-2xl border-2 hover:bg-white transition-all active:scale-[0.98]" onClick={prevStep}>
                                        <ChevronLeft className="h-6 w-6" />
                                    </Button>
                                )}
                                <Button 
                                    size="lg" 
                                    className="flex-1 h-16 rounded-2xl font-black uppercase tracking-[0.1em] text-sm shadow-2xl shadow-primary/30 group transition-all active:scale-[0.98]"
                                    disabled={currentStep === 1 && !isStep1Complete}
                                    onClick={nextStep}
                                >
                                    {currentStep === STEPS.length ? 'Finalize Quote' : `Next: ${STEPS[currentStep].label}`}
                                    <ArrowRight className="ml-3 h-5 w-5 transition-transform group-hover:translate-x-1.5" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </ScrollArea>
            </div>

            {/* Lightbox - Gallery Scale */}
            <Dialog open={!!lightboxImage} onOpenChange={(open) => !open && setLightboxImage(null)}>
                <DialogContent className="max-w-4xl h-auto max-h-[85vh] p-0 border-none bg-black/90 backdrop-blur-2xl shadow-2xl flex items-center justify-center animate-in fade-in zoom-in-95 duration-500 rounded-[2.5rem] overflow-hidden">
                    <DialogTitle className="sr-only">Image Preview</DialogTitle>
                    {lightboxImage && (
                        <div className="relative w-full h-full p-4 md:p-12 flex items-center justify-center min-h-[300px]">
                            <Image 
                                src={lightboxImage} 
                                alt="Lightbox View" 
                                width={1600} 
                                height={900} 
                                className="w-full h-auto max-h-[75vh] object-contain rounded-2xl" 
                                unoptimized 
                            />
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all backdrop-blur-md z-50"
                                onClick={() => setLightboxImage(null)}
                            >
                                <X className="h-5 w-5" />
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Standard Features Overlay */}
            <Dialog open={showStandardFeatures} onOpenChange={setShowStandardFeatures}>
                <DialogContent className="sm:max-w-xl rounded-[3rem] border-none shadow-2xl p-0 overflow-hidden">
                    <DialogHeader className="p-8 bg-slate-50 border-b">
                        <DialogTitle className="text-2xl font-black uppercase tracking-tight">Standard Features</DialogTitle>
                        <DialogDescription className="text-xs uppercase font-black tracking-widest text-primary mt-1">Included in base {model.name}</DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="max-h-[60vh]">
                        <div className="p-8 grid gap-3">
                            {model.standardFeatures?.map((feat: string, i: number) => (
                                <div key={i} className="flex items-start gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                    <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                                    <span className="text-sm font-semibold text-slate-700 leading-relaxed">{feat}</span>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </DialogContent>
            </Dialog>

            {/* General Specs Overlay */}
            <Dialog open={showGeneralSpecs} onOpenChange={setShowGeneralSpecs}>
                <DialogContent className="sm:max-w-xl rounded-[3rem] border-none shadow-2xl p-0 overflow-hidden">
                    <DialogHeader className="p-8 bg-slate-50 border-b">
                        <DialogTitle className="text-2xl font-black uppercase tracking-tight">Technical Specs</DialogTitle>
                        <DialogDescription className="text-xs uppercase font-black tracking-widest text-primary mt-1">Master data for {model.name}</DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-4 p-8">
                        {model.specifications?.otherSpecs?.map((spec: any) => (
                            <div key={spec.id} className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 space-y-1.5">
                                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{spec.label}</p>
                                <p className="text-base font-black text-slate-950">{spec.value}</p>
                            </div>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

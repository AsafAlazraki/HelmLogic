'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useCollection, useDoc, useUser, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc, where, getDocs } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { 
    Loader2, 
    ChevronRight, 
    ChevronLeft, 
    Ship, 
    CheckCircle2, 
    ShieldCheck, 
    PlusCircle, 
    Package, 
    X, 
    Wrench,
    ListChecks,
    ClipboardList,
    FileText,
    ArrowRight,
    Layers,
    Check,
    Waves,
    Star,
    Maximize2,
    Info,
    Anchor,
    CircleDashed
} from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useRouter } from 'next/navigation';
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
    const router = useRouter();
    const [currentStep, setCurrentStep] = useState(1);
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const colorsSectionRef = useRef<HTMLDivElement>(null);
    
    // Selection State
    const [selectedMaterial, setSelectedMaterial] = useState<'PVC' | 'HYP' | null>(null);
    const [selectedColor, setSelectedColor] = useState<string | null>(null);
    const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
    const [selectedMotor, setSelectedMotor] = useState<any | null>(null);
    const [selectedMotorDataSetId, setSelectedMotorDataSetId] = useState<string | null>(null);

    // Dialog States
    const [showStandardFeatures, setShowStandardFeatures] = useState(false);
    const [showGeneralSpecs, setShowGeneralSpecs] = useState(false);
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

    // 1. Fetch Variants
    const variantsQuery = useMemoFirebase(() => 
        query(collection(firestore, `data-warehouse/${vendor.id}/ranges/${rangeId}/models/${model.id}/variants`), orderBy('order')),
    [firestore, vendor.id, rangeId, model.id]);
    
    const { data: variants, isLoading: variantsLoading } = useCollection<Variant>(variantsQuery);

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
                    const dsSnap = await getDocs(dsRef);
                    const datasets = dsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
                    const targetDS = datasets.find(s => s.name.toLowerCase().includes('outboard') || s.name.toLowerCase().includes('motor')) || datasets[0];
                    
                    if (targetDS) {
                        setSelectedMotorDataSetId(targetDS.id);
                        const rowsRef = collection(firestore, `data-warehouse/${motorVendor.id}/dataSets/${targetDS.id}/rows`);
                        const rowsSnap = await getDocs(rowsRef);
                        const allRows = rowsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

                        const maxHp = model.specifications?.motorConfigurations?.[0]?.engines?.[0]?.maxHp || 999;
                        const minHp = model.specifications?.motorConfigurations?.[0]?.engines?.[0]?.minHp || 0;

                        setMotors(allRows.filter(r => {
                            const hp = parseInt(r['HP Rating']) || 0;
                            return hp >= minHp && hp <= maxHp;
                        }));
                    }
                }
            } catch (e) {
                console.error(e);
            } finally {
                setMotorsLoading(false);
            }
        };
        fetchMotors();
    }, [currentStep, firestore, module, model]);

    // Independent Panel Scrolling & Reset
    useEffect(() => {
        if (scrollAreaRef.current) {
            const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
            if (viewport) {
                viewport.scrollTo({ top: 0, behavior: 'auto' });
            }
        }
    }, [currentStep]);

    useEffect(() => {
        if (selectedMaterial && currentStep === 1 && scrollAreaRef.current && colorsSectionRef.current) {
            const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
            if (viewport) {
                const targetTop = colorsSectionRef.current.offsetTop;
                setTimeout(() => {
                    viewport.scrollTo({ top: targetTop - 10, behavior: 'smooth' });
                }, 600);
            }
        }
    }, [selectedMaterial]);

    // Data Derivations
    const activeVariant = useMemo(() => {
        if (!selectedColor || !variants) return null;
        return variants.find(v => v.id === selectedColor);
    }, [selectedColor, variants]);

    const isOpenClassification = useMemo(() => {
        if (!model.optionalFeatures) return true;
        const consoleOptions = model.optionalFeatures.filter((f: any) => f.category === 'Consoles');
        return !selectedOptionIds.some(id => consoleOptions.some((f: any) => f.id === id));
    }, [model.optionalFeatures, selectedOptionIds]);

    const carouselImages = useMemo(() => {
        const images = [];
        if (activeVariant?.imageUrl) images.push(activeVariant.imageUrl);
        else if (model.coverImageUrl) images.push(model.coverImageUrl);
        if (model.galleryImageUrls) images.push(...model.galleryImageUrls);
        return images;
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

    const totalPrice = useMemo(() => {
        let total = activeVariant?.sellPriceExclGst || 0;
        selectedOptionIds.forEach(id => {
            const opt = model.optionalFeatures?.find((f: any) => f.id === id);
            if (opt) total += (opt.sellPriceExclGst || 0);
        });
        if (selectedMotor) total += (selectedMotor.sellPriceExclGst || 0);
        return total;
    }, [activeVariant, selectedOptionIds, model.optionalFeatures, selectedMotor]);

    const relevantFeatures = useMemo(() => {
        const features = model.optionalFeatures || [];
        if (!activeVariant) return features;
        return features.filter((f: any) => 
            !f.applicableVariantIds || 
            f.applicableVariantIds.length === 0 || 
            f.applicableVariantIds.includes(activeVariant.id)
        );
    }, [model.optionalFeatures, activeVariant]);

    const groupedOptions = useMemo(() => {
        const features = relevantFeatures;
        
        // Find selected console
        const consoleCategory = features.filter((f: any) => f.category === 'Consoles');
        const selectedConsoleId = selectedOptionIds.find(id => consoleCategory.some((f: any) => f.id === id));
        const selectedConsole = features.find((f: any) => f.id === selectedConsoleId);

        const groups = features.reduce((acc: any, opt: any) => {
            const cat = opt.category || 'General Options';
            
            // Intelligent Seats logic:
            // 1. If console selected -> Only show tied seat
            // 2. If console selected but no seat tied -> Hide seats category
            // 3. If no console selected -> Show all standalone seats
            if (cat === 'Seats') {
                if (selectedConsole) {
                    if (selectedConsole.associatedSeatId) {
                        if (opt.id !== selectedConsole.associatedSeatId) return acc;
                    } else {
                        return acc;
                    }
                }
            }

            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(opt);
            return acc;
        }, {});

        // Precision Hierarchy: Consoles -> Seats -> General
        return Object.entries(groups)
            .filter(([_, opts]: [string, any]) => opts.length > 0)
            .sort(([a], [b]) => {
                if (a === 'Consoles') return -1;
                if (b === 'Consoles') return 1;
                if (a === 'Seats') return -1;
                if (b === 'Seats') return 1;
                return a.localeCompare(b);
            });
    }, [relevantFeatures, selectedOptionIds]);

    const toggleOption = (id: string) => {
        setSelectedOptionIds(prev => {
            const isSelected = prev.includes(id);
            if (isSelected) {
                return prev.filter(i => i !== id);
            } else {
                const next = [...prev, id];
                const feature = relevantFeatures.find((f: any) => f.id === id);
                if (feature?.category === 'Consoles' && feature.associatedSeatId) {
                    if (!next.includes(feature.associatedSeatId)) {
                        next.push(feature.associatedSeatId);
                    }
                }
                return next;
            }
        });
    };

    const handleMaterialSelect = (mat: 'PVC' | 'HYP') => {
        setSelectedMaterial(mat);
        setSelectedColor(null);
    };

    const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, STEPS.length));
    const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

    const rangePart = range?.name || '';
    const fullModelName = model.name;
    const modelPart = fullModelName.toLowerCase().startsWith(rangePart.toLowerCase()) 
        ? fullModelName.substring(rangePart.length).trim()
        : fullModelName;

    const displayedModelName = isOpenClassification ? `${modelPart} (Open)` : modelPart;

    return (
        <div className="fixed inset-0 z-[40] bg-background flex flex-col overflow-hidden">
            <div className="absolute inset-0 z-0 pointer-events-none">
                {model.coverImageUrl && (
                    <div className="relative h-full w-full opacity-5 blur-3xl scale-110">
                        <Image src={model.coverImageUrl} alt="Bg" fill className="object-cover" unoptimized />
                    </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />
            </div>

            <div className="sticky top-0 z-30 px-12 h-24 border-b bg-card/90 backdrop-blur-xl shrink-0 shadow-sm flex items-center">
                <div className="w-full flex items-center justify-between">
                    <div className="flex-1 flex items-center justify-between mr-24">
                        {STEPS.map((step) => (
                            <div key={step.id} className="flex items-center gap-3">
                                <div className={cn(
                                    "h-8 w-8 rounded-full flex items-center justify-center text-[10px] font-black transition-all border-2",
                                    currentStep === step.id ? "bg-primary border-primary text-white scale-110 shadow-lg" : 
                                    currentStep > step.id ? "bg-green-500 border-green-500 text-white" : "bg-muted border-transparent text-muted-foreground"
                                )}>
                                    {currentStep > step.id ? <CheckCircle2 className="h-4 w-4" /> : step.id}
                                </div>
                                <span className={cn(
                                    "text-[9px] font-black uppercase tracking-[0.2em] transition-colors hidden sm:block whitespace-nowrap",
                                    currentStep === step.id ? "text-foreground" : "text-muted-foreground"
                                )}>
                                    {step.label}
                                </span>
                            </div>
                        ))}
                    </div>
                    <button 
                        type="button" 
                        className="font-black text-destructive uppercase tracking-widest text-[10px] hover:opacity-70 transition-opacity" 
                        onClick={() => router.push(`/modules/${module.slug || module.id}`)}
                    >
                        Exit Build
                    </button>
                </div>
            </div>

            <div className="relative z-10 flex-1 flex flex-col lg:flex-row overflow-hidden">
                <div className="w-full lg:w-7/12 relative flex flex-col overflow-hidden h-full min-h-0 bg-slate-50/50">
                    <div className="w-full h-full flex flex-col p-12 animate-in fade-in zoom-in-95 duration-700">
                        <div className="w-full h-full flex flex-col gap-8">
                            <div className="relative flex-1 w-full flex flex-col bg-white rounded-[3rem] border-2 border-slate-100 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.08)] overflow-hidden group min-h-0">
                                <div className="flex-1 w-full min-0 relative bg-white">
                                    <Carousel className="w-full h-full" opts={{ loop: true }}>
                                        <CarouselContent className="h-full">
                                            {carouselImages.length > 0 ? carouselImages.map((url, idx) => (
                                                <CarouselItem key={`${url}-${idx}`} className="h-full w-full p-0">
                                                    <div className="relative h-full w-full flex items-center justify-center overflow-hidden">
                                                        <Image src={url} alt={`Boat View ${idx}`} fill className="object-cover" unoptimized />
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
                                        <Button type="button" variant="secondary" size="icon" className="absolute top-6 right-6 h-12 w-12 rounded-full shadow-xl bg-white/90 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all z-40" onClick={() => setLightboxIndex(0)}>
                                            <Maximize2 className="h-5 w-5" />
                                        </Button>
                                        {carouselImages.length > 1 && (
                                            <>
                                                <CarouselPrevious className="left-6 h-12 w-12 bg-white/10 hover:bg-white/30 border-none text-white z-50 transition-all rounded-2xl" />
                                                <CarouselNext className="right-6 h-12 w-12 bg-white/10 hover:bg-white/30 border-none text-white z-50 transition-all rounded-2xl" />
                                            </>
                                        )}
                                    </Carousel>
                                </div>
                                <div className="flex items-center justify-center gap-3 py-5 border-t border-slate-50 mt-auto shrink-0 bg-slate-50/30">
                                    <Button type="button" variant="ghost" size="icon" className="rounded-full h-11 w-11 bg-white hover:bg-primary hover:text-white text-primary transition-all active:scale-95 shadow-sm border" onClick={() => setShowStandardFeatures(true)}><ListChecks className="h-5 w-5" /></Button>
                                    <Button type="button" variant="ghost" size="icon" className="rounded-full h-11 w-11 bg-white hover:bg-primary hover:text-white text-primary transition-all active:scale-95 shadow-sm border" onClick={() => setShowGeneralSpecs(true)}><ClipboardList className="h-5 w-5" /></Button>
                                </div>
                            </div>

                            <div className="bg-white/95 backdrop-blur-xl border-2 border-white shadow-[0_30px_100px_-10px_rgba(0,0,0,0.1)] p-10 rounded-[2.5rem] flex flex-col gap-3 shrink-0">
                                <div className="flex items-center justify-between px-1">
                                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Current Build</span>
                                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Build Total (Excl. GST)</span>
                                </div>
                                <div className="flex items-center justify-between px-1">
                                    <div className="flex items-center gap-3 text-xl sm:text-2xl tracking-tight min-0 truncate">
                                        {rangePart && <span className="text-primary font-normal whitespace-nowrap">{rangePart}</span>}
                                        <span className="text-slate-950 font-black whitespace-nowrap">{displayedModelName}</span>
                                    </div>
                                    <div className="text-5xl font-black flex items-center justify-end gap-1.5 text-slate-950 tracking-tighter shrink-0">
                                        <span className="text-primary text-2xl">$</span>
                                        {totalPrice.toLocaleString()}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="w-full lg:w-5/12 h-full bg-slate-50/50 backdrop-blur-md border-l border-slate-100 flex flex-col overflow-hidden relative">
                    <div className="pt-12 px-12 pb-6 shrink-0 bg-slate-50/5 backdrop-blur-md z-20">
                        <h2 className="text-4xl font-black uppercase tracking-tight leading-none">{STEPS.find(s => s.id === currentStep)?.label}</h2>
                        <p className="text-muted-foreground font-medium text-base mt-2">Refine your configuration path.</p>
                    </div>

                    <ScrollArea ref={scrollAreaRef} className="flex-1">
                        <div className="px-12 pb-12 pt-0 flex flex-col">
                            <div className="h-6 shrink-0" />
                            
                            {currentStep === 1 && (
                                <div className="space-y-10 animate-in slide-in-from-right-4 duration-500">
                                    <div className="space-y-6">
                                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">1. Tube Material</span>
                                        <div className="grid grid-cols-2 gap-6">
                                            {availableMaterials.map((mat) => {
                                                const isSelected = selectedMaterial === mat;
                                                const isPvc = mat === 'PVC';
                                                return (
                                                    <button
                                                        key={mat}
                                                        type="button"
                                                        onClick={() => handleMaterialSelect(mat as any)}
                                                        className={cn(
                                                            "group relative flex flex-col items-start p-8 border-2 rounded-[2.5rem] transition-all duration-500 min-h-[220px] text-left",
                                                            isSelected ? "bg-primary border-primary text-white shadow-2xl scale-[1.02]" : "bg-white border-slate-100 hover:border-primary/40"
                                                        )}
                                                    >
                                                        <div className="space-y-1.5 mb-6">
                                                            <span className="text-4xl font-black uppercase tracking-tight leading-none">{mat}</span>
                                                            <p className={cn("text-[11px] font-black uppercase tracking-[0.2em] opacity-60", isSelected ? "text-white" : "text-muted-foreground")}>
                                                                {isPvc ? 'Standard PVC' : 'ORCA® Hypalon'}
                                                            </p>
                                                        </div>

                                                        <div className="mt-auto flex items-center gap-2">
                                                            <Check className={cn("h-4 w-4 shrink-0", isSelected ? "text-white" : "text-green-500")} />
                                                            <span className="text-[10px] font-black uppercase tracking-[0.15em] leading-none">
                                                                {isPvc ? '5yr Tube Warranty' : '10yr Tube Warranty'}
                                                            </span>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {selectedMaterial && (
                                        <div ref={colorsSectionRef} className="space-y-6 pt-4 animate-in fade-in slide-in-from-bottom-4 duration-1000">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-primary">2. Available Colors</span>
                                            <div className="grid grid-cols-2 gap-4">
                                                {availableColors.map((color) => (
                                                    <button
                                                        key={color.id}
                                                        type="button"
                                                        onClick={() => setSelectedColor(color.id)}
                                                        className={cn(
                                                            "group flex flex-col border-2 rounded-[2rem] overflow-hidden transition-all duration-300 text-left bg-white",
                                                            selectedColor === color.id ? "border-primary shadow-2xl scale-[1.02]" : "border-slate-100 hover:border-primary/20"
                                                        )}
                                                    >
                                                        <div className="relative aspect-video w-full border-b bg-white">
                                                            {color.imageUrl ? <Image src={color.imageUrl} alt={color.name} fill className="object-contain p-3" unoptimized /> : <div className="flex h-full w-full items-center justify-center opacity-5"><Ship className="h-8 w-8"/></div>}
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
                                <div className="space-y-12 animate-in slide-in-from-right-4 duration-500">
                                    {groupedOptions.map(([category, options]: [string, any]) => (
                                        <div key={category} className="space-y-5">
                                            <h3 className="text-[11px] font-black uppercase tracking-widest text-foreground border-l-4 border-primary pl-3">{category}</h3>
                                            <div className="grid gap-3">
                                                {options.map((opt: any) => {
                                                    const isSelected = selectedOptionIds.includes(opt.id);
                                                    return (
                                                        <button
                                                            key={opt.id}
                                                            type="button"
                                                            onClick={() => toggleOption(opt.id)}
                                                            className={cn(
                                                                "group flex items-center justify-between p-5 border-2 rounded-[1.5rem] transition-all duration-300 text-left",
                                                                isSelected ? "bg-primary/5 border-primary shadow-lg" : "bg-white border-slate-100 hover:border-primary/20"
                                                            )}
                                                        >
                                                            <div className="flex items-center gap-5 min-w-0">
                                                                <div className="h-14 w-14 relative rounded-xl bg-slate-50 border overflow-hidden shrink-0 shadow-inner">
                                                                    {opt.imageUrl ? <Image src={opt.imageUrl} alt={opt.name} fill className="object-cover" unoptimized /> : <Package className="h-6 w-6 m-auto mt-4 opacity-5" />}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-sm font-black uppercase tracking-tight truncate leading-tight">{opt.name}</p>
                                                                    {opt.code && <p className="text-[10px] font-mono text-muted-foreground uppercase mt-1">{opt.code}</p>}
                                                                </div>
                                                            </div>
                                                            <p className={cn("text-sm font-black shrink-0", isSelected ? "text-primary" : "text-foreground")}>+${(opt.sellPriceExclGst || 0).toLocaleString()}</p>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {currentStep === 3 && (
                                <div className="space-y-10 animate-in slide-in-from-right-4 duration-500">
                                    {motorsLoading ? (
                                        <div className="flex flex-col items-center justify-center py-24 gap-4">
                                            <Loader2 className="h-12 w-12 animate-spin text-primary" />
                                            <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Syncing compatible motors...</p>
                                        </div>
                                    ) : (
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
                                                    <button
                                                        key={motor.id}
                                                        type="button"
                                                        onClick={() => setSelectedMotor(isSelected ? null : motor)}
                                                        className={cn(
                                                            "w-full flex items-center justify-between p-6 border-2 rounded-[2rem] transition-all duration-300 text-left",
                                                            isSelected ? "bg-primary border-primary text-white shadow-2xl" : "bg-white border-slate-100 hover:border-primary/40"
                                                        )}
                                                    >
                                                        <div className="flex items-center gap-6">
                                                            <div className="h-20 w-20 relative bg-white rounded-2xl border-2 overflow-hidden shrink-0 shadow-inner">
                                                                {getImageUrl(imgPath) ? <Image src={getImageUrl(imgPath)!} alt="Motor" fill className="object-contain p-2" unoptimized /> : <Ship className="h-8 w-8 m-auto mt-6 opacity-10" />}
                                                            </div>
                                                            <div>
                                                                <p className="text-base font-black uppercase tracking-tight leading-tight">{motor['Model Name']}</p>
                                                                <p className={cn("text-[10px] font-mono font-bold mt-1.5 uppercase", isSelected ? "text-white/60" : "text-muted-foreground/60")}>{motor['HP Rating']} HP</p>
                                                            </div>
                                                        </div>
                                                        <p className="text-base font-black">${(motor.sellPriceExclGst || 0).toLocaleString()}</p>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {currentStep === 6 && (
                                <div className="space-y-10 animate-in slide-in-from-right-4 duration-500 pb-20">
                                    <Card className="rounded-[2.5rem] border-2 shadow-sm overflow-hidden bg-white">
                                        <div className="p-8 border-b bg-muted/5 flex items-center justify-between">
                                            <h3 className="font-black text-xl uppercase tracking-tight italic text-primary">{displayedModelName}</h3>
                                            <Badge variant="outline" className="h-6 px-3 text-[10px] font-black uppercase">{isOpenClassification ? 'Open Deck' : 'Console Setup'}</Badge>
                                        </div>
                                        <CardContent className="p-8 space-y-8">
                                            <div className="grid grid-cols-2 gap-8">
                                                <div className="space-y-1.5">
                                                    <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest opacity-60">Material</span>
                                                    <p className="font-black uppercase text-sm tracking-tight">{selectedMaterial || 'Not Selected'}</p>
                                                </div>
                                                <div className="space-y-1.5 text-right">
                                                    <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest opacity-60">Tube Color</span>
                                                    <p className="font-black uppercase text-sm tracking-tight">{activeVariant?.colorName || 'Not Selected'}</p>
                                                </div>
                                            </div>
                                            
                                            <Separator className="border-dashed" />
                                            
                                            <div className="space-y-4">
                                                <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest opacity-60">Selection Summary</span>
                                                <div className="grid gap-2">
                                                    {selectedOptionIds.length > 0 ? selectedOptionIds.map(id => {
                                                        const opt = model.optionalFeatures?.find((f: any) => f.id === id);
                                                        return opt && (
                                                            <div key={id} className="flex items-center justify-between text-[10px] font-bold p-3 bg-slate-50 rounded-xl border">
                                                                <span className="uppercase tracking-tight">{opt.name}</span>
                                                                <span className="font-black text-primary">${(opt.sellPriceExclGst || 0).toLocaleString()}</span>
                                                            </div>
                                                        );
                                                    }) : (
                                                        <p className="text-[10px] text-muted-foreground italic font-medium">No optional features selected.</p>
                                                    )}
                                                </div>
                                            </div>

                                            <Separator className="border-dashed" />

                                            <div className="space-y-4">
                                                <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest opacity-60">Engine Selection</span>
                                                {selectedMotor ? (
                                                    <div className="flex items-center justify-between text-[10px] font-bold p-3 bg-primary/5 rounded-xl border border-primary/20">
                                                        <div className="flex items-center gap-3">
                                                            <Anchor className="h-3.5 w-3.5 text-primary" />
                                                            <span className="uppercase tracking-tight">{selectedMotor['Model Name']}</span>
                                                        </div>
                                                        <span className="font-black text-primary">${(selectedMotor.sellPriceExclGst || 0).toLocaleString()}</span>
                                                    </div>
                                                ) : (
                                                    <Badge variant="secondary" className="h-8 px-4 font-black uppercase text-[9px] tracking-widest">Supply Only (No Engine)</Badge>
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                            )}
                        </div>
                    </ScrollArea>

                    <div className="px-12 pb-12 pt-4 shrink-0 z-20">
                        <div className="flex gap-4">
                            {currentStep > 1 && (
                                <button type="button" className="h-16 w-24 rounded-2xl border-2 flex items-center justify-center bg-white hover:bg-slate-50 transition-all shadow-sm" onClick={prevStep}><ChevronLeft className="h-6 w-6" /></button>
                            )}
                            <Button type="button" size="lg" className="flex-1 h-16 rounded-2xl font-black uppercase tracking-[0.1em] text-sm shadow-2xl group transition-all" onClick={nextStep}>
                                {currentStep === STEPS.length ? 'Finalize Quote' : `Next: ${STEPS[currentStep].label}`}
                                <ArrowRight className="ml-3 h-5 w-5 transition-transform group-hover:translate-x-1.5" />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            <Dialog open={lightboxIndex !== null} onOpenChange={(open) => !open && setLightboxIndex(null)}>
                <DialogContent className="max-w-6xl h-[90vh] p-0 border-none bg-black/95 backdrop-blur-2xl shadow-2xl overflow-hidden rounded-[2.5rem] z-[100] flex flex-col">
                    {lightboxIndex !== null && (
                        <div className="relative flex-1 w-full h-full min-h-0">
                            <Carousel key={`lightbox-${lightboxIndex}`} className="w-full h-full" opts={{ startIndex: lightboxIndex, loop: true }}>
                                <CarouselContent className="h-full">
                                    {carouselImages.map((url, idx) => (
                                        <CarouselItem key={`lightbox-img-${idx}`} className="h-full flex items-center justify-center p-0">
                                            <div className="relative w-full h-full"><Image src={url} alt={`View ${idx}`} fill className="object-contain" unoptimized /></div>
                                        </CarouselItem>
                                    ))}
                                </CarouselContent>
                                {carouselImages.length > 1 && (
                                    <><CarouselPrevious className="left-8" /><CarouselNext className="right-8" /></>
                                )}
                            </Carousel>
                            <Button type="button" variant="default" size="icon" className="absolute top-6 right-6 h-12 w-12 rounded-full bg-white text-black hover:bg-slate-200 z-[110]" onClick={() => setLightboxIndex(null)}><X className="h-6 w-6" /></Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={showStandardFeatures} onOpenChange={setShowStandardFeatures}>
                <DialogContent className="sm:max-w-xl rounded-[3rem] p-0 overflow-hidden z-[100]">
                    <DialogHeader className="p-8 bg-slate-50 border-b">
                        <DialogTitle className="text-2xl font-black uppercase tracking-tight">Standard Features</DialogTitle>
                    </DialogHeader>
                    <ScrollArea className="max-h-[60vh]">
                        <div className="p-8 grid gap-3">
                            {model.standardFeatures?.map((feat: string, i: number) => (
                                <div key={i} className="flex items-start gap-4 p-4 bg-slate-50 rounded-2xl border">
                                    <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                                    <span className="text-sm font-semibold text-slate-700 leading-relaxed uppercase">{feat}</span>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </DialogContent>
            </Dialog>

            <Dialog open={showGeneralSpecs} onOpenChange={setShowGeneralSpecs}>
                <DialogContent className="sm:max-w-xl rounded-[3rem] p-0 overflow-hidden z-[100]">
                    <DialogHeader className="p-8 bg-slate-50 border-b">
                        <DialogTitle className="text-2xl font-black uppercase tracking-tight">Technical Specs</DialogTitle>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-4 p-8">
                        {model.specifications?.otherSpecs?.map((spec: any) => (
                            <div key={spec.id} className="p-6 bg-slate-50 rounded-[2rem] border space-y-1.5">
                                <p className="text-[10px] font-black uppercase text-slate-400">{spec.label}</p>
                                <p className="text-base font-black text-slate-950">{spec.value}</p>
                            </div>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

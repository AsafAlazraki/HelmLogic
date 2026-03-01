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
    ClipboardList
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
    rangeId 
}: { 
    module: any, 
    model: any, 
    vendor: any,
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

    // 1. Fetch Variants
    const variantsQuery = useMemoFirebase(() => 
        query(collection(firestore, `data-warehouse/${vendor.id}/ranges/${rangeId}/models/${model.id}/variants`), orderBy('order')),
    [firestore, vendor.id, rangeId, model.id]);
    
    const { data: variants, loading: variantsLoading } = useCollection<Variant>(variantsQuery);

    // 2. Fetch Compatible Motors (Configurator Driven)
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
                // error handled by emitter
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
        if (activeVariant?.imageUrl) images.push(activeVariant.imageUrl);
        else if (model.coverImageUrl) images.push(model.coverImageUrl);
        
        if (model.galleryImageUrls && Array.isArray(model.galleryImageUrls)) {
            images.push(...model.galleryImageUrls);
        }
        return [...new Set(images)]; 
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

        const selectedConsoleIds = selectedOptionIds.filter(id => {
            const opt = options.find((f: any) => f.id === id);
            return opt?.category === 'Consoles';
        });
        const whitelistedSeatIds = selectedConsoleIds.map(id => {
            const opt = options.find((f: any) => f.id === id);
            return opt?.associatedSeatId;
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

    // Handle Option Dependencies (e.g. Seats requiring Consoles)
    useEffect(() => {
        if (selectedOptionIds.length === 0) return;
        
        const validOptionIds = factoryOptions.map((o: any) => o.id);
        const nextIds = selectedOptionIds.filter(id => validOptionIds.includes(id));
        
        if (nextIds.length !== selectedOptionIds.length) {
            setSelectedOptionIds(nextIds);
        }
    }, [factoryOptions, selectedOptionIds]);

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
            if (a === 'General Options') return 1;
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
        setSelectedOptionIds(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleMaterialSelect = (mat: string) => {
        setSelectedMaterial(mat as any);
        setSelectedColor(null);
        setTimeout(() => {
            const colorsSection = document.getElementById('available-colors-section');
            if (colorsSection) colorsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    };

    return (
        <div className="h-full -mt-6 md:-mt-8 -mx-4 md:-mx-6 bg-background flex flex-col relative overflow-hidden">
            <div className="absolute inset-0 z-0">
                {model.coverImageUrl && (
                    <div className="relative h-full w-full opacity-10 blur-3xl scale-110">
                        <Image src={model.coverImageUrl} alt="Bg" fill className="object-cover" unoptimized />
                    </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />
            </div>

            {/* Sticky Header with Build Steps */}
            <div className="sticky top-0 z-30 p-6 flex flex-col items-center gap-6 border-b bg-card/90 backdrop-blur-xl shrink-0 shadow-sm transition-all">
                <div className="w-full max-w-7xl flex items-center justify-between">
                    <h1 className="text-xl font-black uppercase tracking-tight leading-tight">{model.name}</h1>
                    <div className="hidden md:flex items-center gap-8">
                        {STEPS.map((step) => (
                            <div key={step.id} className="flex items-center gap-3">
                                <div className={cn(
                                    "h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-black transition-all border-2",
                                    currentStep === step.id ? "bg-primary border-primary text-white scale-110 shadow-lg" : 
                                    currentStep > step.id ? "bg-green-500 border-green-500 text-white" : "bg-muted border-transparent text-muted-foreground"
                                )}>
                                    {currentStep > step.id ? <CheckCircle2 className="h-3.5 w-3.5" /> : step.id}
                                </div>
                                <span className={cn(
                                    "text-[9px] font-black uppercase tracking-widest transition-colors",
                                    currentStep === step.id ? "text-foreground" : "text-muted-foreground"
                                )}>
                                    {step.label}
                                </span>
                                {step.id < STEPS.length && <ChevronRight className="h-3 w-3 text-muted-foreground/30" />}
                            </div>
                        ))}
                    </div>
                    <Button variant="ghost" size="sm" className="font-bold text-destructive hover:bg-destructive/10 uppercase tracking-widest text-[10px]" onClick={() => window.history.back()}>
                        Exit Build
                    </Button>
                </div>
            </div>

            <div className="relative z-10 flex-1 flex flex-col lg:flex-row overflow-hidden">
                {/* Left Side: Visualizer Carousel */}
                <div className="w-full lg:w-7/12 h-[45vh] lg:h-full relative bg-muted/5 border-r border-white/5 flex flex-col overflow-hidden">
                    <div className="flex-1 flex flex-col p-8 md:p-12 relative overflow-hidden">
                        <div className="z-20 flex items-center gap-3 relative">
                            <Badge variant="secondary" className="px-4 py-1.5 font-black uppercase tracking-widest text-[10px] shadow-sm bg-background/80 backdrop-blur-sm border-white/20">
                                Visualizer
                            </Badge>
                            {activeVariant && (
                                <Badge variant="outline" className="px-4 py-1.5 font-black uppercase tracking-widest text-[10px] bg-primary/10 border-primary/20 text-primary">
                                    {activeVariant.material} Edition
                                </Badge>
                            )}
                        </div>
                        
                        <div className="flex-1 relative w-full flex items-center justify-center min-h-0">
                            <Carousel className="w-full max-w-4xl" opts={{ loop: true }}>
                                <CarouselContent className="items-center">
                                    {carouselImages.map((url, idx) => (
                                        <CarouselItem key={`${url}-${idx}`}>
                                            <div className="relative aspect-[16/10] w-full flex items-center justify-center">
                                                <Image 
                                                    src={url} 
                                                    alt={`Boat View ${idx}`} 
                                                    fill 
                                                    className="object-contain p-4 drop-shadow-[0_35px_60px_rgba(0,0,0,0.3)]" 
                                                    unoptimized
                                                />
                                            </div>
                                        </CarouselItem>
                                    ))}
                                </CarouselContent>
                                <CarouselPrevious className="left-4 z-30 opacity-70 hover:opacity-100 transition-opacity bg-background/50 border-white/20" />
                                <CarouselNext className="right-4 z-30 opacity-70 hover:opacity-100 transition-opacity bg-background/50 border-white/20" />
                            </Carousel>
                        </div>

                        <div className="animate-in slide-in-from-bottom-4 duration-500 mt-auto">
                            <div className="bg-background/60 backdrop-blur-xl border border-white/10 p-6 rounded-2xl flex flex-col md:flex-row md:items-end justify-between gap-6 shadow-2xl">
                                <div className="space-y-4 min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-black uppercase text-primary tracking-widest mb-1">Current Build</p>
                                            <h3 className="text-2xl font-black uppercase tracking-tight leading-none truncate pr-4">{activeVariant?.name || model.name}</h3>
                                        </div>
                                        <div className="flex items-center gap-2 bg-white/20 backdrop-blur-md p-1.5 rounded-full border border-white/20 shadow-sm shrink-0">
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            className="rounded-full h-9 w-9 bg-white/40 hover:bg-primary hover:text-white text-primary transition-all active:scale-95 shadow-sm" 
                                                            onClick={() => setShowStandardFeatures(true)}
                                                        >
                                                            <ListChecks className="h-5 w-5" />
                                                        </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent className="font-bold text-[10px] uppercase tracking-widest bg-primary text-white border-none shadow-xl">
                                                        Standard Features
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                            
                                            <div className="w-[1px] h-4 bg-primary/10" />

                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            className="rounded-full h-9 w-9 bg-white/40 hover:bg-primary hover:text-white text-primary transition-all active:scale-95 shadow-sm" 
                                                            onClick={() => setShowGeneralSpecs(true)}
                                                        >
                                                            <ClipboardList className="h-5 w-5" />
                                                        </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent className="font-bold text-[10px] uppercase tracking-widest bg-primary text-white border-none shadow-xl">
                                                        Technical Specifications
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedOptionIds.length > 0 && <Badge variant="secondary" className="text-[8px] uppercase font-black px-2">{selectedOptionIds.length} Factory Options</Badge>}
                                        {selectedMotor && <Badge variant="secondary" className="text-[8px] uppercase font-black px-2 bg-primary/10 text-primary border-primary/20">{selectedMotor['Model Name']}</Badge>}
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1">Build Total (Excl. Tax)</p>
                                    <div className="text-4xl font-black flex items-center justify-end gap-1 text-foreground">
                                        <span className="text-primary text-xl">$</span>
                                        {totalPrice.toLocaleString()}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Side: Configuration Scroll */}
                <ScrollArea ref={scrollAreaRef} className="w-full lg:w-5/12 h-full bg-background/40 backdrop-blur-md">
                    <div className="p-8 md:p-12 pb-24 min-h-full flex flex-col">
                        {currentStep === 1 && (
                            <div className="space-y-10 animate-in slide-in-from-right-4 duration-500">
                                <div className="space-y-3">
                                    <h2 className="text-3xl font-black uppercase tracking-tight leading-none">The Foundation</h2>
                                    <p className="text-muted-foreground font-medium text-sm leading-relaxed max-w-md">Select your hull material and tube color to initialize the build specifications.</p>
                                </div>

                                <div className="space-y-5">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-primary">1. Tube Material</span>
                                    <div className="grid grid-cols-2 gap-4">
                                        {availableMaterials.map((mat) => (
                                            <button
                                                key={mat}
                                                onClick={() => handleMaterialSelect(mat)}
                                                className={cn(
                                                    "group relative flex flex-col items-start p-5 border-2 rounded-2xl transition-all duration-300",
                                                    selectedMaterial === mat ? "bg-primary border-primary text-white shadow-xl shadow-primary/20" : "bg-card hover:border-primary/40"
                                                )}
                                            >
                                                <span className="text-sm font-black uppercase tracking-tight">{mat}</span>
                                                <p className={cn("text-[8px] font-bold mt-1 uppercase", selectedMaterial === mat ? "text-white/60" : "text-muted-foreground")}>
                                                    {mat === 'PVC' ? 'Robust Standard' : 'Premium HYP'}
                                                </p>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {selectedMaterial && (
                                    <div id="available-colors-section" className="space-y-5 pt-10">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-primary">2. Available Colors</span>
                                        <div className="grid grid-cols-2 gap-4">
                                            {availableColors.map((color) => (
                                                <button
                                                    key={color.id}
                                                    onClick={() => setSelectedColor(color.id)}
                                                    className={cn(
                                                        "group flex flex-col border-2 rounded-2xl overflow-hidden transition-all duration-300 text-left bg-white",
                                                        selectedColor === color.id ? "border-primary shadow-xl" : "border-border hover:border-primary/20"
                                                    )}
                                                >
                                                    <div className="relative aspect-video w-full border-b bg-white">
                                                        {color.imageUrl ? (
                                                            <Image src={color.imageUrl} alt={color.name} fill className="object-contain p-2" unoptimized />
                                                        ) : (
                                                            <div className="flex h-full w-full items-center justify-center opacity-5"><Ship className="h-6 w-6"/></div>
                                                        )}
                                                    </div>
                                                    <div className={cn("p-3", selectedColor === color.id ? "bg-primary text-white" : "bg-card")}>
                                                        <p className="text-[10px] font-black uppercase tracking-tight truncate">{color.name}</p>
                                                        <p className={cn("text-[8px] font-bold uppercase", selectedColor === color.id ? "text-white/60" : "text-muted-foreground")}>{color.code}</p>
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
                                    <h2 className="text-3xl font-black uppercase tracking-tight leading-none">Factory Options</h2>
                                    <p className="text-muted-foreground font-medium text-sm leading-relaxed max-w-md">Customize your Highfield with approved consoles, seating, and technical upgrades.</p>
                                </div>

                                <div className="space-y-12">
                                    {Object.entries(groupedOptions).map(([category, options]: [string, any]) => (
                                        <div key={category} className="space-y-5">
                                            <h3 className="text-xs font-black uppercase tracking-widest text-foreground">{category}</h3>
                                            <div className="grid gap-3">
                                                {options.map((opt: any) => {
                                                    const isSelected = selectedOptionIds.includes(opt.id);
                                                    return (
                                                        <button
                                                            key={opt.id}
                                                            onClick={() => toggleOption(opt.id)}
                                                            className={cn(
                                                                "group flex items-center justify-between p-4 border-2 rounded-2xl transition-all duration-200 text-left",
                                                                isSelected ? "bg-primary/5 border-primary" : "bg-card border-border hover:border-primary/20"
                                                            )}
                                                        >
                                                            <div className="flex items-center gap-4 min-w-0">
                                                                <div className="h-12 w-12 relative rounded-lg bg-muted/30 border overflow-hidden shrink-0">
                                                                    {opt.imageUrl ? <Image src={opt.imageUrl} alt={opt.name} fill className="object-cover" unoptimized /> : <Package className="h-5 w-5 m-auto mt-3.5 opacity-10" />}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-sm font-black uppercase tracking-tight truncate">{opt.name}</p>
                                                                    {opt.code && <p className="text-[9px] font-mono text-muted-foreground uppercase">{opt.code}</p>}
                                                                </div>
                                                            </div>
                                                            <p className={cn("text-xs font-black ml-4 shrink-0", isSelected ? "text-primary" : "text-foreground")}>
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
                                    <h2 className="text-3xl font-black uppercase tracking-tight leading-none">Engine & Rigging</h2>
                                    <p className="text-muted-foreground font-medium text-sm leading-relaxed max-w-md">Select a compatible outboard and associated rigging kits.</p>
                                </div>

                                {motorsLoading ? (
                                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                                        <Loader2 className="h-10 w-10 animate-spin text-primary" />
                                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Syncing compatible motors...</p>
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
                                                                "w-full flex items-center justify-between p-5 border-2 rounded-2xl transition-all duration-300 text-left group",
                                                                isSelected ? "bg-primary border-primary text-white shadow-xl shadow-primary/20 scale-[1.01]" : "bg-card border-border hover:border-primary/20"
                                                            )}
                                                        >
                                                            <div className="flex items-center gap-5">
                                                                <div className="h-16 w-16 relative bg-white rounded-xl border-2 overflow-hidden shrink-0 shadow-inner">
                                                                    {getImageUrl(imgPath) ? <Image src={getImageUrl(imgPath)!} alt="Motor" fill className="object-contain p-1" unoptimized /> : <Ship className="h-6 w-6 m-auto mt-5 opacity-10" />}
                                                                </div>
                                                                <div>
                                                                    <div className="flex items-center gap-2 mb-1">
                                                                        <Badge variant="outline" className={cn("font-black text-[9px] px-1.5 py-0", isSelected ? "border-white/20 text-white" : "border-primary/20 text-primary")}>
                                                                            {motor['HP Rating'] || 'ENGINE'} HP
                                                                        </Badge>
                                                                        <span className="text-[10px] font-black uppercase opacity-60 tracking-widest">Outboard</span>
                                                                    </div>
                                                                    <p className="text-sm font-black uppercase tracking-tight leading-tight">{motor['Model Name']}</p>
                                                                    <p className={cn("text-[9px] font-mono font-bold mt-1 uppercase", isSelected ? "text-white/60" : "text-muted-foreground/60")}>{motor['Part Number']}</p>
                                                                </div>
                                                            </div>
                                                            <p className="text-sm font-black">${(motor.sellPriceExclGst || 0).toLocaleString()}</p>
                                                        </button>

                                                        {isSelected && motor.masterAccessories && (
                                                            <div className="p-5 bg-muted/10 border-2 border-dashed rounded-2xl space-y-4 animate-in slide-in-from-top-2">
                                                                <div className="flex items-center gap-2">
                                                                    <Wrench className="h-3 w-3 text-primary" />
                                                                    <span className="text-[10px] font-black uppercase tracking-widest">Linked Rigging & Props</span>
                                                                </div>
                                                                <div className="space-y-2">
                                                                    {motor.masterAccessories.map((acc: any, i: number) => (
                                                                        <div key={i} className="flex items-center justify-between text-[11px] font-medium p-2.5 bg-background/50 rounded-lg border">
                                                                            <span className="truncate pr-4">{acc.name}</span>
                                                                            <span className="font-bold text-primary shrink-0">${(acc.items?.[0]?.data?.sellPriceExclGst || 0).toLocaleString()}</span>
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

                        {currentStep === 4 && (
                            <div className="space-y-10 animate-in slide-in-from-right-4 duration-500">
                                <div className="space-y-3">
                                    <h2 className="text-3xl font-black uppercase tracking-tight leading-none">Trailer Selection</h2>
                                    <p className="text-muted-foreground font-medium text-sm leading-relaxed max-w-md">Choose a matching trailer for your Highfield.</p>
                                </div>
                                <div className="py-20 text-center border-2 border-dashed rounded-3xl bg-muted/5 flex flex-col items-center gap-4">
                                    <Ship className="h-12 w-12 opacity-10" />
                                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Trailer integration coming soon.</p>
                                </div>
                            </div>
                        )}

                        {currentStep === 5 && (
                            <div className="space-y-10 animate-in slide-in-from-right-4 duration-500">
                                <div className="space-y-3">
                                    <h2 className="text-3xl font-black uppercase tracking-tight leading-none">Dealer Fit Options</h2>
                                    <p className="text-muted-foreground font-medium text-sm leading-relaxed max-w-md">Local dealership accessories and custom installations.</p>
                                </div>
                                <div className="py-20 text-center border-2 border-dashed rounded-3xl bg-muted/5 flex flex-col items-center gap-4">
                                    <Layers className="h-12 w-12 opacity-10" />
                                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Dealer fit workspace loading...</p>
                                </div>
                            </div>
                        )}

                        <div className="pt-16 sticky bottom-0 bg-gradient-to-t from-background via-background to-transparent pb-4 mt-auto">
                            <div className="flex gap-3">
                                {currentStep > 1 && (
                                    <Button variant="outline" size="lg" className="h-14 w-20 rounded-2xl border-2" onClick={prevStep}>
                                        <ChevronLeft className="h-5 w-5" />
                                    </Button>
                                )}
                                <Button 
                                    size="lg" 
                                    className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl shadow-primary/20 group"
                                    disabled={currentStep === 1 && !isStep1Complete}
                                    onClick={nextStep}
                                >
                                    {currentStep === STEPS.length ? 'Finalize Quote' : `Next: ${STEPS[currentStep].label}`}
                                    <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </ScrollArea>
            </div>

            {/* Standard Features Dialog */}
            <Dialog open={showStandardFeatures} onOpenChange={setShowStandardFeatures}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black uppercase tracking-tight">Standard Features</DialogTitle>
                        <DialogDescription className="text-xs uppercase font-black tracking-widest text-primary">Everything included in the base {model.name}</DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="max-h-[60vh] pr-4">
                        <div className="grid gap-3 py-4">
                            {model.standardFeatures?.map((feat: string, i: number) => (
                                <div key={i} className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg border border-white/10">
                                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                                    <span className="text-sm font-medium">{feat}</span>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </DialogContent>
            </Dialog>

            {/* General Specs Dialog */}
            <Dialog open={showGeneralSpecs} onOpenChange={setShowGeneralSpecs}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black uppercase tracking-tight">Technical Specifications</DialogTitle>
                        <DialogDescription className="text-xs uppercase font-black tracking-widest text-primary">Master build data for {model.name}</DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-4 py-4">
                        {model.specifications?.otherSpecs?.map((spec: any) => (
                            <div key={spec.id} className="p-4 bg-muted/30 rounded-xl border border-white/10 space-y-1">
                                <p className="text-[10px] font-black uppercase text-muted-foreground/60 tracking-widest">{spec.label}</p>
                                <p className="text-sm font-bold">{spec.value}</p>
                            </div>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
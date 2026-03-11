'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
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
    CircleDashed,
    ExternalLink,
    ChevronDown,
    Activity,
    CreditCard
} from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useRouter } from 'next/navigation';
import {
    type CarouselApi,
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
    DialogClose
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableRow,
    TableHead,
    TableHeader
} from "@/components/ui/table";

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
    { id: 3, label: 'Motor' },
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
    const colorSectionRef = useRef<HTMLDivElement>(null);
    const categoryRefs = useRef<Record<string, HTMLDivElement | null>>({});
    
    const displayedModelName = model?.name || 'Boat';

    // Carousel State
    const [api, setApi] = useState<CarouselApi>();

    // Selection State
    const [selectedMaterial, setSelectedMaterial] = useState<'PVC' | 'HYP' | null>(null);
    const [selectedColor, setSelectedColor] = useState<string | null>(null);
    const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
    const [selectedMotor, setSelectedMotor] = useState<any | null>(null);
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

    // Modal State
    const [showFeatures, setShowFeatures] = useState(false);
    const [showSpecs, setShowSpecs] = useState(false);
    const [showDocs, setShowDocs] = useState(false);

    const variantsQuery = useMemoFirebase(() => 
        query(collection(firestore, `data-warehouse/${vendor.id}/ranges/${rangeId}/models/${model.id}/variants`), orderBy('order')),
    [firestore, vendor.id, rangeId, model.id]);
    const { data: variants, isLoading: variantsLoading } = useCollection<Variant>(variantsQuery);

    const availableMaterials = useMemo(() => {
        if (!variants) return [];
        return Array.from(new Set(variants.map(v => v.material).filter(Boolean)));
    }, [variants]);

    const availableColors = useMemo(() => {
        if (!variants || !selectedMaterial) return [];
        return variants.filter(v => v.material === selectedMaterial);
    }, [variants, selectedMaterial]);

    const [motors, setMotors] = useState<any[]>([]);
    const [motorsLoading, setMotorsLoading] = useState(false);

    // Step 1 Scroll Fix - Material to Color
    useEffect(() => {
        if (selectedMaterial && currentStep === 1) {
            const timer = setTimeout(() => {
                const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
                if (viewport && colorSectionRef.current) {
                    viewport.scrollTo({ top: colorSectionRef.current.offsetTop - 20, behavior: 'smooth' });
                }
            }, 800); 
            return () => clearTimeout(timer);
        }
    }, [selectedMaterial, currentStep]);

    // Filter motors based on steering type requirement
    const hasConsoleSelected = useMemo(() => {
        const consoleOptions = model.optionalFeatures?.filter((f: any) => f.category === 'Consoles') || [];
        return selectedOptionIds.some(id => consoleOptions.some(f => f.id === id));
    }, [selectedOptionIds, model.optionalFeatures]);

    useEffect(() => {
        const fetchMotors = async () => {
            if (currentStep !== 3) return;
            setMotorsLoading(true);
            try {
                const vendorsSnap = await getDocs(collection(firestore, 'data-warehouse'));
                const allVendors = vendorsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
                const allModuleVendorIds = [...(module.associatedVendorIds || []), module.mainVendorId].filter(Boolean);
                const motorVendor = allVendors.find(v => allModuleVendorIds.includes(v.id) && v.vendorType === 'Motor Brand');

                if (motorVendor) {
                    const dsSnap = await getDocs(collection(firestore, 'data-warehouse', motorVendor.id, 'dataSets'));
                    const datasets = dsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
                    const targetDS = datasets.find(s => s.name.toLowerCase().includes('outboard') || s.name.toLowerCase().includes('motor')) || datasets[0];
                    
                    if (targetDS) {
                        const rowsSnap = await getDocs(collection(firestore, `data-warehouse/${motorVendor.id}/dataSets/${targetDS.id}/rows`));
                        const allRows = rowsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
                        const maxHp = model.specifications?.motorConfigurations?.[0]?.engines?.[0]?.maxHp || 999;
                        const minHp = model.specifications?.motorConfigurations?.[0]?.engines?.[0]?.minHp || 0;
                        
                        const requiredSteering = hasConsoleSelected ? 'Forward Control' : 'Tiller';

                        setMotors(allRows.filter(r => {
                            const hp = parseInt(r['HP Rating'] || r.hp || '0') || 0;
                            const matchesHp = hp >= minHp && hp <= maxHp;
                            const matchesSteering = r.steeringType === requiredSteering;
                            return matchesHp && matchesSteering;
                        }).map(m => ({ ...m, vendorName: motorVendor.name })));
                    }
                }
            } catch (e) { console.error(e); } finally { setMotorsLoading(false); }
        };
        fetchMotors();
    }, [currentStep, firestore, module, model, hasConsoleSelected]);

    useEffect(() => {
        if (scrollAreaRef.current) {
            const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
            if (viewport) viewport.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, [currentStep]);

    const activeVariant = useMemo(() => {
        if (!selectedColor || !variants) return null;
        return variants.find(v => v.id === selectedColor);
    }, [selectedColor, variants]);

    const selectedOptionsData = useMemo(() => {
        return model.optionalFeatures?.filter((f: any) => selectedOptionIds.includes(f.id)) || [];
    }, [selectedOptionIds, model.optionalFeatures]);

    const totalPrice = useMemo(() => {
        let total = activeVariant?.sellPriceExclGst || 0;
        selectedOptionIds.forEach(id => {
            const opt = model.optionalFeatures?.find((f: any) => f.id === id);
            if (opt) total += (opt.sellPriceExclGst || 0);
        });
        if (selectedMotor) total += (selectedMotor.sellPriceExclGst || 0);
        return total;
    }, [activeVariant, selectedOptionIds, model.optionalFeatures, selectedMotor]);

    const buildPreviewSlide = useMemo(() => {
        const imagedOptions = selectedOptionsData.filter(f => f.imageUrl && f.imageUrl !== "");
        if (imagedOptions.length === 0) return null;

        const consoleOpt = imagedOptions.find((f: any) => f.category === 'Consoles');
        const seatOpt = imagedOptions.find((f: any) => f.category === 'Seats');
        const otherOpts = imagedOptions.filter((f: any) => f.category !== 'Consoles' && f.category !== 'Seats');

        return (
            <div className="h-full w-full grid grid-cols-2 grid-rows-2 bg-white">
                {[consoleOpt, seatOpt, ...otherOpts].filter(Boolean).slice(0, 4).map((item: any, i) => (
                    <div key={item.id} className={cn(
                        "relative flex items-center justify-center p-1 transition-colors",
                        i === 0 && "border-r border-b",
                        i === 1 && "border-b",
                        i === 2 && "border-r",
                        "hover:bg-slate-50"
                    )}>
                        {item.imageUrl && <Image src={item.imageUrl} alt={item.name} fill className="object-contain p-1 mix-blend-multiply" unoptimized />}
                        <div className="absolute bottom-3 left-3 px-2 py-0.5 bg-slate-900/5 rounded-md text-[7px] font-black uppercase tracking-tighter text-slate-400">
                            {item.name}
                        </div>
                    </div>
                ))}
            </div>
        );
    }, [selectedOptionsData]);

    const carouselSlides = useMemo(() => {
        const slides = [];
        // Primary Anchor: Main boat render (index 0)
        if (model.coverImageUrl) slides.push({ type: 'boat', url: model.coverImageUrl });
        
        // Variant: Color-specific render
        if (activeVariant?.imageUrl && activeVariant.imageUrl !== model.coverImageUrl) {
            slides.push({ type: 'variant', url: activeVariant.imageUrl });
        }

        // Build: Composite option render
        if (buildPreviewSlide) {
            slides.push({ type: 'build', content: buildPreviewSlide });
        }

        // Gallery
        if (model.galleryImageUrls) {
            model.galleryImageUrls.forEach((url: string) => slides.push({ type: 'gallery', url }));
        }
        return slides;
    }, [activeVariant, model, buildPreviewSlide]);

    useEffect(() => {
        if (!api) return;
        api.reInit();

        // Auto-Slide Logic
        const buildIdx = carouselSlides.findIndex(s => s.type === 'build');
        if (buildIdx !== -1 && selectedOptionIds.length > 0) {
            setTimeout(() => api.scrollTo(buildIdx), 500);
            return;
        }

        if (activeVariant?.imageUrl) {
            const variantIdx = carouselSlides.findIndex(s => s.type === 'variant' && s.url === activeVariant.imageUrl);
            if (variantIdx !== -1) {
                setTimeout(() => api.scrollTo(variantIdx), 500);
                return;
            }
        }

        api.scrollTo(0);
    }, [selectedColor, selectedOptionIds, api, carouselSlides, activeVariant, model.coverImageUrl]);

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
        const features = [...relevantFeatures];
        
        const availableConsoles = features.filter((f: any) => f.category === 'Consoles');
        const selectedConsoleId = selectedOptionIds.find(id => availableConsoles.some(f => f.id === id));
        const selectedConsole = availableConsoles.find(f => f.id === selectedConsoleId);

        const groups = features.reduce((acc: any, opt: any) => {
            const cat = opt.category || 'General Options';
            
            if (cat === 'Seats') {
                if (selectedConsole && !selectedConsole.associatedSeatId) return acc;
                if (selectedConsole && selectedConsole.associatedSeatId && opt.id !== selectedConsole.associatedSeatId) return acc;
            }

            if (cat === 'Rigging' && !hasConsoleSelected) return acc;
            
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(opt);
            return acc;
        }, {});

        return Object.entries(groups)
            .filter(([_, opts]: [string, any]) => opts.length > 0)
            .sort(([a], [b]) => {
                if (a === 'Consoles') return -1; if (b === 'Consoles') return 1;
                if (a === 'Seats') return -1; if (b === 'Seats') return 1;
                if (a === 'Rigging') return -1; if (b === 'Rigging') return 1;
                return a.localeCompare(b);
            }) as [string, any][];
    }, [relevantFeatures, selectedOptionIds, hasConsoleSelected]);

    const toggleOption = (id: string) => {
        const feature = relevantFeatures.find((f: any) => f.id === id);
        if (!feature) return;

        const currentCat = feature.category || 'General Options';
        const isCurrentlySelected = selectedOptionIds.includes(id);

        let nextSelectedIds = [...selectedOptionIds];

        if (isCurrentlySelected) {
            nextSelectedIds = nextSelectedIds.filter(i => i !== id);
            if (currentCat === 'Consoles') {
                const riggingItem = relevantFeatures.find((f: any) => f.category === 'Rigging' || String(f.name).includes('Rigging'));
                if (riggingItem) nextSelectedIds = nextSelectedIds.filter(i => i !== riggingItem.id);
                const seatIds = relevantFeatures.filter((f: any) => f.category === 'Seats').map((f: any) => f.id);
                nextSelectedIds = nextSelectedIds.filter(i => !seatIds.includes(i));
            }
        } else {
            // EXCLUSIVE CONSOLE RULE
            if (currentCat === 'Consoles') {
                const consoleIds = relevantFeatures.filter((f: any) => f.category === 'Consoles').map((f: any) => f.id);
                const seatIds = relevantFeatures.filter((f: any) => f.category === 'Seats').map((f: any) => f.id);
                nextSelectedIds = nextSelectedIds.filter(i => !consoleIds.includes(i) && !seatIds.includes(i));
            }

            nextSelectedIds.push(id);

            if (currentCat === 'Consoles') {
                if (feature.associatedSeatId && !nextSelectedIds.includes(feature.associatedSeatId)) {
                    nextSelectedIds.push(feature.associatedSeatId);
                }
                const riggingItem = relevantFeatures.find((f: any) => f.category === 'Rigging' || String(f.name).includes('Rigging'));
                if (riggingItem && !nextSelectedIds.includes(riggingItem.id)) {
                    nextSelectedIds.push(riggingItem.id);
                }
            }
        }

        setSelectedOptionIds(nextSelectedIds);

        // Auto-Scroll Logic
        if (currentStep === 2 && !isCurrentlySelected) {
            const newConsoleId = nextSelectedIds.find(id => relevantFeatures.filter(f => f.category === 'Consoles').some(f => f.id === id));
            const newConsole = relevantFeatures.find(f => f.id === newConsoleId);
            
            const predictedVisibleCats = [...new Set(relevantFeatures.map(f => f.category || 'General Options'))].filter(cat => {
                if (cat === 'Seats') {
                    if (newConsole && !newConsole.associatedSeatId) return false;
                    return true;
                }
                if (cat === 'Rigging') return !!newConsoleId;
                return true;
            }).sort((a, b) => {
                if (a === 'Consoles') return -1; if (b === 'Consoles') return 1;
                if (a === 'Seats') return -1; if (b === 'Seats') return 1;
                if (a === 'Rigging') return -1; if (b === 'Rigging') return 1;
                return a.localeCompare(b);
            });

            const currentIdx = predictedVisibleCats.indexOf(currentCat);
            const targetCat = predictedVisibleCats[currentIdx + 1];

            if (targetCat) {
                setTimeout(() => {
                    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
                    const targetElement = categoryRefs.current[targetCat];
                    if (viewport && targetElement) {
                        viewport.scrollTo({ top: targetElement.offsetTop - 20, behavior: 'smooth' });
                    }
                }, 1000);
            }
        }
    };

    const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, STEPS.length));
    const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

    return (
        <div className="fixed inset-0 z-[40] bg-background flex flex-col overflow-hidden text-left">
            <div className="sticky top-0 z-[100] px-12 h-24 border-b bg-card/90 backdrop-blur-xl shrink-0 flex items-center shadow-sm">
                <div className="w-full flex items-center justify-between">
                    <div className="flex-1 flex items-center justify-between mr-24">
                        {STEPS.map((step) => (
                            <div key={step.id} className="flex items-center gap-3">
                                <div className={cn(
                                    "h-8 w-8 rounded-full flex items-center justify-center text-[10px] font-black transition-all border-2",
                                    currentStep === step.id ? "bg-primary border-primary text-white scale-110 shadow-lg" : 
                                    currentStep > step.id ? "bg-green-500 border-green-500 text-white" : 
                                    "bg-muted border-transparent text-muted-foreground"
                                )}>
                                    {currentStep > step.id ? <CheckCircle2 className="h-4 w-4" /> : step.id}
                                </div>
                                <span className={cn(
                                    "text-[9px] font-black uppercase tracking-[0.2em] hidden sm:block whitespace-nowrap",
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
                <div className="w-full lg:w-7/12 relative flex flex-col p-6 bg-slate-50/50 overflow-hidden">
                    <div className="relative flex-1 w-full bg-white rounded-[3rem] border-2 border-slate-100 shadow-2xl overflow-hidden group">
                        <Carousel className="w-full h-full" opts={{ loop: true }} setApi={setApi}>
                            <CarouselContent className="h-full">
                                {carouselSlides.map((slide, idx) => (
                                    <CarouselItem key={idx} className="h-full w-full relative group/img bg-white">
                                        {slide.type === 'build' ? slide.content : (
                                            <>
                                                {slide.url && <Image src={slide.url} alt="Build Preview" fill className="object-cover" unoptimized />}
                                                <Button 
                                                    variant="ghost" size="icon" 
                                                    className="absolute top-6 right-6 h-12 w-12 rounded-full bg-white/20 backdrop-blur-md opacity-0 group-hover/img:opacity-100 transition-opacity text-white border-none shadow-none z-20"
                                                    onClick={() => setLightboxUrl(slide.url || null)}
                                                >
                                                    <Maximize2 className="h-6 w-6" />
                                                </Button>
                                            </>
                                        )}
                                    </CarouselItem>
                                ))}
                            </CarouselContent>
                            <CarouselPrevious className="left-6 h-12 w-12 bg-white/90 border-2 border-slate-200 shadow-2xl hover:bg-white hover:border-primary hover:text-primary hover:scale-110 active:scale-95 transition-all disabled:opacity-0 z-[110]" />
                            <CarouselNext className="right-6 h-12 w-12 bg-white/90 border-2 border-slate-200 shadow-2xl hover:bg-white hover:border-primary hover:text-primary hover:scale-110 active:scale-95 transition-all disabled:opacity-0 z-[110]" />
                        </Carousel>
                    </div>

                    <div className="bg-white/95 backdrop-blur-xl border-2 border-white shadow-2xl p-10 rounded-[3rem] mt-8 shrink-0">
                        <div className="flex flex-col items-start px-1 text-left">
                            <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-2">Package Pricing (Excl. GST)</span>
                            <div className="text-6xl font-black text-slate-950 tracking-tighter leading-none flex items-baseline">
                                <span className="text-primary text-3xl mr-1">$</span>
                                <span>{totalPrice.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-start gap-4 mt-8 px-6 shrink-0 relative z-10">
                        <Button variant="ghost" size="sm" className="h-10 px-6 font-black uppercase text-[10px] tracking-widest text-slate-400 hover:text-primary hover:bg-primary/5 rounded-2xl border-2 border-transparent hover:border-primary/10 transition-all" onClick={() => setShowFeatures(true)}><ListChecks className="h-4 w-4 mr-2" /> Standard Features</Button>
                        <Button variant="ghost" size="sm" className="h-10 px-6 font-black uppercase text-[10px] tracking-widest text-slate-400 hover:text-primary hover:bg-primary/5 rounded-2xl border-2 border-transparent hover:border-primary/10 transition-all" onClick={() => setShowSpecs(true)}><ClipboardList className="h-4 w-4 mr-2" /> General Specifications</Button>
                        <Button variant="ghost" size="sm" className="h-10 px-6 font-black uppercase text-[10px] tracking-widest text-slate-400 hover:text-primary hover:bg-primary/5 rounded-2xl border-2 border-transparent hover:border-primary/10 transition-all" onClick={() => setShowDocs(true)}><FileText className="h-4 w-4 mr-2" /> Documents</Button>
                    </div>
                </div>

                <div className="w-full lg:w-5/12 h-full flex flex-col overflow-hidden bg-slate-50/20">
                    <div className="pt-6 px-12 pb-4 bg-transparent shrink-0">
                        <h2 className="text-2xl font-black uppercase tracking-tighter italic text-slate-900 leading-none">
                            {STEPS[currentStep - 1].label.toUpperCase()}
                            <span className="text-primary"> - {range?.name?.toUpperCase()} {displayedModelName.toUpperCase()}</span>
                        </h2>
                    </div>

                    <ScrollArea ref={scrollAreaRef} className="flex-1">
                        <div className="px-12 pb-12 space-y-8">
                            {currentStep === 1 && (
                                <div className="space-y-10 animate-in fade-in duration-1000 ease-in-out text-left mt-4">
                                    <div className="space-y-6">
                                        <div className="flex items-center gap-4 bg-primary px-8 py-4 rounded-3xl shadow-2xl w-full">
                                            <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
                                            <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-white">Tube Material</h3>
                                        </div>
                                        <div className="grid grid-cols-2 gap-6">
                                            {availableMaterials.map((mat) => (
                                                <button key={mat} onClick={() => { setSelectedMaterial(mat as any); setSelectedColor(null); }} className={cn("group flex flex-col items-center justify-center p-12 rounded-[2.5rem] transition-all bg-white shadow-2xl border-2 border-transparent h-40", selectedMaterial === mat ? "border-primary ring-2 ring-primary/20 scale-[1.02]" : "hover:border-primary/20")}>
                                                    <span className={cn("text-sm font-black uppercase tracking-widest transition-colors", selectedMaterial === mat ? "text-primary" : "text-slate-600")}>{mat}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    {selectedMaterial && (
                                        <div ref={colorSectionRef} className="mt-16 space-y-8 animate-in slide-in-from-bottom-4 duration-1000 ease-out scroll-mt-10">
                                            <div className="flex items-center gap-4 bg-primary px-8 py-4 rounded-3xl shadow-2xl w-full">
                                                <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
                                                <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-white">Hull & Tube Color</h3>
                                            </div>
                                            <div className="grid grid-cols-2 gap-6">
                                                {availableColors.map((color) => (
                                                    <button key={color.id} onClick={() => setSelectedColor(color.id)} className={cn("flex flex-col border-2 rounded-[2rem] overflow-hidden transition-all bg-white shadow-xl border-transparent", selectedColor === color.id ? "border-primary ring-2 ring-primary/20 scale-[1.02]" : "hover:border-primary/20")}>
                                                        <div className="relative aspect-video w-full bg-white p-1">{color.imageUrl && <Image src={color.imageUrl} alt="Color" fill className="object-contain mix-blend-multiply p-1" unoptimized />}</div>
                                                        <div className={cn("p-5 text-center border-t transition-colors", selectedColor === color.id ? "bg-blue-50/50 border-primary/10" : "bg-white border-slate-50")}><p className={cn("text-[10px] font-black uppercase tracking-widest", selectedColor === color.id ? "text-primary" : "text-slate-600")}>{color.name}</p></div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {currentStep === 2 && (
                                <div className="space-y-16 animate-in fade-in duration-1000 ease-in-out text-left mt-4">
                                    {groupedOptions.map(([cat, opts]: [string, any]) => (
                                        <div key={cat} ref={el => { categoryRefs.current[cat] = el; }} className="space-y-8 scroll-mt-10">
                                            <div className="flex items-center gap-4 bg-primary px-8 py-4 rounded-3xl shadow-2xl w-full">
                                                <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
                                                <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-white">{cat}</h3>
                                            </div>
                                            <div className="grid grid-cols-2 gap-6">
                                                {opts.map((opt: any) => (
                                                    <button key={opt.id} onClick={() => toggleOption(opt.id)} className={cn("flex flex-col border-2 rounded-[2rem] overflow-hidden transition-all bg-white shadow-xl border-transparent h-full", selectedOptionIds.includes(opt.id) ? "bg-primary/5 border-primary shadow-lg ring-2 ring-primary/20" : "hover:border-primary/20")}>
                                                        <div className="relative aspect-video w-full bg-white overflow-hidden shrink-0 p-1">{opt.imageUrl ? <Image src={opt.imageUrl} alt={opt.name} fill className="object-contain mix-blend-multiply transition-transform group-hover:scale-105" unoptimized /> : <div className="flex h-full w-full items-center justify-center opacity-10"><Package className="h-12 w-12" /></div>}</div>
                                                        <div className="p-6 flex flex-col items-center justify-center text-center gap-2 flex-grow border-t border-slate-50">
                                                            <p className={cn("text-xs font-black uppercase tracking-widest leading-tight", selectedOptionIds.includes(opt.id) ? "text-primary" : "text-slate-700")}>{opt.name}</p>
                                                            <p className={cn(
                                                                "text-[10px] font-black text-sm",
                                                                selectedOptionIds.includes(opt.id) ? "text-primary" : "text-slate-400"
                                                            )}>+${(opt.sellPriceExclGst || 0).toLocaleString()}</p>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {currentStep === 3 && (
                                <div className="space-y-8 animate-in fade-in duration-1000 ease-in-out text-left mt-4">
                                    <div className="flex items-center gap-4 bg-primary px-8 py-4 rounded-3xl shadow-2xl w-full mb-8">
                                        <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
                                        <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-white">Motor</h3>
                                    </div>
                                    {motorsLoading ? <div className="flex flex-col items-center py-20 gap-4"><Loader2 className="animate-spin h-12 w-12 text-primary" /><p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground animate-pulse">Scanning Factory Datasets...</p></div> : (
                                        <div className="grid grid-cols-2 gap-6">
                                            {motors.map(m => {
                                                const motorImgPath = m.SummaryImage || m.imageUrl;
                                                const motorImgUrl = motorImgPath ? (motorImgPath.startsWith('http') ? motorImgPath : `https://www.yamaha-motor.com.au${motorImgPath.startsWith('/') ? '' : '/'}${motorImgPath}`) : null;
                                                return (
                                                    <button key={m.id} onClick={() => setSelectedMotor(selectedMotor?.id === m.id ? null : m)} className={cn("flex flex-col border-2 rounded-[2rem] overflow-hidden transition-all bg-white shadow-xl border-transparent h-full", selectedMotor?.id === m.id ? "bg-primary/5 border-primary shadow-2xl ring-2 ring-primary/20" : "hover:border-primary/20")}>
                                                        <div className="relative aspect-video w-full bg-white overflow-hidden shrink-0 p-1">{motorImgUrl && <Image src={motorImgUrl} alt="Motor" fill className="object-contain p-1 mix-blend-multiply" unoptimized />}</div>
                                                        <div className="p-6 flex flex-col items-center justify-center text-center gap-2 flex-grow border-t border-slate-50">
                                                            <p className={cn("text-xs font-black uppercase tracking-tight leading-tight", selectedMotor?.id === m.id ? "text-primary" : "text-slate-900")}>
                                                                {m.vendorName || 'YAMAHA'} - {m['Model Name']}
                                                            </p>
                                                            <p className={cn("text-[9px] font-black uppercase tracking-widest", selectedMotor?.id === m.id ? "text-primary/70" : "text-primary")}>{m['HP Rating']} HP PERFORMANCE • ${(m.sellPriceExclGst || 0).toLocaleString()}</p>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {currentStep === 6 && (
                                <div className="space-y-10 animate-in fade-in duration-1000 text-left mt-4">
                                    <div className="flex items-center gap-4 bg-primary px-8 py-4 rounded-3xl shadow-2xl w-full">
                                        <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
                                        <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-white">Project Build Summary</h3>
                                    </div>
                                    
                                    <div className="space-y-6">
                                        <Card className="rounded-[2rem] border-2 shadow-xl overflow-hidden">
                                            <CardHeader className="bg-muted/30 border-b p-6">
                                                <div className="flex items-center gap-3">
                                                    <Ship className="h-5 w-5 text-primary" />
                                                    <CardTitle className="text-sm font-black uppercase tracking-widest">Base Vessel</CardTitle>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="p-6 space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="space-y-1">
                                                        <p className="font-black text-lg uppercase tracking-tight text-slate-900">{range?.name} {model?.name}</p>
                                                        <p className="text-[10px] font-bold text-muted-foreground uppercase">{selectedMaterial} • {activeVariant?.name || 'Standard Color'}</p>
                                                    </div>
                                                    <p className="font-black text-primary italic text-lg">${(activeVariant?.sellPriceExclGst || 0).toLocaleString()}</p>
                                                </div>
                                            </CardContent>
                                        </Card>

                                        {selectedOptionsData.length > 0 && (
                                            <Card className="rounded-[2rem] border-2 shadow-xl overflow-hidden">
                                                <CardHeader className="bg-muted/30 border-b p-6">
                                                    <div className="flex items-center gap-3">
                                                        <Package className="h-5 w-5 text-primary" />
                                                        <CardTitle className="text-sm font-black uppercase tracking-widest">Selected Factory Options</CardTitle>
                                                    </div>
                                                </CardHeader>
                                                <CardContent className="p-0">
                                                    <div className="divide-y">
                                                        {selectedOptionsData.map((opt: any) => (
                                                            <div key={opt.id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                                                <div className="flex items-center gap-4">
                                                                    <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center">
                                                                        <Check className="h-4 w-4 text-emerald-500" />
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-xs font-black uppercase tracking-tight">{opt.name}</p>
                                                                        <Badge variant="outline" className="text-[8px] font-black h-4 px-1">{opt.category || 'Standard'}</Badge>
                                                                    </div>
                                                                </div>
                                                                <p className="text-xs font-bold text-slate-600">${(opt.sellPriceExclGst || 0).toLocaleString()}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        )}

                                        {selectedMotor && (
                                            <Card className="rounded-[2rem] border-2 shadow-xl overflow-hidden">
                                                <CardHeader className="bg-muted/30 border-b p-6">
                                                    <div className="flex items-center gap-3">
                                                        <Activity className="h-5 w-5 text-primary" />
                                                        <CardTitle className="text-sm font-black uppercase tracking-widest">Powertrain Identity</CardTitle>
                                                    </div>
                                                </CardHeader>
                                                <CardContent className="p-6">
                                                    <div className="flex items-center justify-between">
                                                        <div className="space-y-1">
                                                            <p className="font-black text-lg uppercase tracking-tight text-slate-900">{selectedMotor.vendorName || 'YAMAHA'} - {selectedMotor['Model Name']}</p>
                                                            <p className="text-[10px] font-bold text-muted-foreground uppercase">{selectedMotor['HP Rating']} HP Performance Series</p>
                                                        </div>
                                                        <p className="font-black text-primary italic text-lg">${(selectedMotor.sellPriceExclGst || 0).toLocaleString()}</p>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </ScrollArea>

                    <div className="p-12 pt-6 bg-slate-50/80 backdrop-blur-xl border-t shrink-0 flex gap-4">
                        {currentStep > 1 && <Button variant="outline" className="h-16 w-24 rounded-2xl border-2 border-slate-200 hover:bg-slate-100 transition-colors shadow-sm" onClick={prevStep}><ChevronLeft className="h-6 w-6" /></Button>}
                        <Button size="lg" className="flex-1 h-16 rounded-2xl font-black uppercase text-sm shadow-2xl shadow-primary/20 transition-all hover:scale-[1.02] active:scale-95 bg-primary text-white" onClick={nextStep}>
                            {currentStep === STEPS.length ? 'Finalize Project' : `Next Step: ${STEPS[currentStep].label.toUpperCase()}`}
                        </Button>
                    </div>
                </div>
            </div>

            <Dialog open={!!lightboxUrl} onOpenChange={(open) => !open && setLightboxUrl(null)}>
                <DialogContent className="max-w-[95vw] h-[90vh] p-0 overflow-hidden bg-black/95 border-none shadow-none rounded-none [&>button]:text-white [&>button]:h-12 [&>button]:w-12 [&>button]:bg-transparent [&>button]:hover:bg-transparent [&>button]:border-none [&>button]:shadow-none [&>button]:right-6 [&>button]:top-6">
                    <DialogHeader className="sr-only"><DialogTitle>Immersive Inspection</DialogTitle></DialogHeader>
                    <div className="relative w-full h-full flex items-center justify-center">{lightboxUrl && <Image src={lightboxUrl} alt="Inspection" fill className="object-contain p-4" unoptimized />}</div>
                </DialogContent>
            </Dialog>

            <Dialog open={showFeatures} onOpenChange={setShowFeatures}>
                <DialogContent className="sm:max-w-2xl rounded-3xl border-4 shadow-2xl p-0 overflow-hidden">
                    <DialogHeader className="p-8 border-b bg-muted/5"><DialogTitle className="text-2xl font-black uppercase tracking-tight italic text-primary">Standard Features</DialogTitle><DialogDescription className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">Included Factory Equipment</DialogDescription></DialogHeader>
                    <ScrollArea className="max-h-[60vh]"><div className="p-0"><Table><TableBody>{model?.standardFeatures?.map((f: string, i: number) => (<TableRow key={i} className="hover:bg-primary/5 border-b"><TableCell className="w-10 pl-8"><Check className="h-4 w-4 text-emerald-500" /></TableCell><TableCell className="font-black uppercase text-[10px] text-slate-900 pr-8 py-4 leading-relaxed">{f}</TableCell></TableRow>))}</TableBody></Table></div></ScrollArea>
                </DialogContent>
            </Dialog>

            <Dialog open={showSpecs} onOpenChange={setShowSpecs}>
                <DialogContent className="sm:max-w-2xl rounded-3xl border-4 shadow-2xl p-0 overflow-hidden">
                    <DialogHeader className="p-8 border-b bg-muted/5"><DialogTitle className="text-2xl font-black uppercase tracking-tight italic text-primary">General Specifications</DialogTitle><DialogDescription className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">Engineering & Technical Data</DialogDescription></DialogHeader>
                    <ScrollArea className="max-h-[60vh]"><div className="p-0"><Table><TableBody>{model?.specifications?.otherSpecs?.map((s: any, i: number) => (<TableRow key={i} className="hover:bg-primary/5 border-b"><TableCell className="font-black uppercase text-[10px] text-muted-foreground w-1/2 pl-8 py-4">{s.label}</TableCell><TableCell className="font-black uppercase text-[10px] text-slate-900 pr-8 py-4">{s.value}</TableCell></TableRow>))}</TableBody></Table></div></ScrollArea>
                </DialogContent>
            </Dialog>

            <Dialog open={showDocs} onOpenChange={setShowDocs}>
                <DialogContent className="sm:max-w-md rounded-3xl border-4 shadow-2xl p-0 overflow-hidden">
                    <DialogHeader className="p-8 border-b bg-muted/5"><DialogTitle className="text-2xl font-black uppercase tracking-tight italic text-primary">Technical Assets</DialogTitle><DialogDescription className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">Factory Manuals & Schematics</DialogDescription></DialogHeader>
                    <div className="p-8 space-y-3">{model?.documents?.length > 0 ? model.documents.map((doc: any, i: number) => (
                        <a key={i} href={doc.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-4 rounded-2xl border-2 hover:border-primary/40 hover:bg-primary/5 transition-all group">
                            <div className="flex items-center gap-4">
                                <FileText className="h-5 w-5 text-primary/40 group-hover:text-primary transition-colors" />
                                <span className="text-xs font-black uppercase tracking-tight">{doc.name}</span>
                            </div>
                            <ExternalLink className="h-4 w-4 opacity-20 group-hover:opacity-100 transition-opacity" />
                        </a>
                    )) : (
                        <div className="py-12 text-center opacity-20 flex flex-col items-center gap-3">
                            <FileText className="h-12 w-12" />
                            <p className="text-[10px] font-black uppercase tracking-widest">No Documents Linked</p>
                        </div>
                    )}</div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
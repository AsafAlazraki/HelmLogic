
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
    CircleDashed,
    ExternalLink
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
    DialogDescription,
    DialogClose
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableRow,
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
    const colorSectionRef = useRef<HTMLDivElement>(null);
    
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

    const [motors, setMotors] = useState<any[]>([]);
    const [motorsLoading, setMotorsLoading] = useState(false);

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
                        setMotors(allRows.filter(r => {
                            const hp = parseInt(r['HP Rating']) || 0;
                            return hp >= minHp && hp <= maxHp;
                        }));
                    }
                }
            } catch (e) { console.error(e); } finally { setMotorsLoading(false); }
        };
        fetchMotors();
    }, [currentStep, firestore, module, model]);

    useEffect(() => {
        if (scrollAreaRef.current) {
            const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
            if (viewport) viewport.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, [currentStep]);

    useEffect(() => {
        if (selectedMaterial && colorSectionRef.current) {
            setTimeout(() => {
                colorSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }
    }, [selectedMaterial]);

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
        const availableConsoles = features.filter((f: any) => f.category === 'Consoles');
        const selectedConsoleId = selectedOptionIds.find(id => availableConsoles.some(f => f.id === id));
        const selectedConsole = availableConsoles.find(f => f.id === selectedConsoleId);
        const constraintConsole = selectedConsole || (availableConsoles.length === 1 ? availableConsoles[0] : null);

        const groups = features.reduce((acc: any, opt: any) => {
            const cat = opt.category || 'General Options';
            if (cat === 'Seats') {
                if (constraintConsole) {
                    if (!constraintConsole.associatedSeatId || opt.id !== constraintConsole.associatedSeatId) return acc;
                }
            }
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(opt);
            return acc;
        }, {});

        return Object.entries(groups)
            .filter(([_, opts]: [string, any]) => opts.length > 0)
            .sort(([a], [b]) => {
                if (a === 'Consoles') return -1; if (b === 'Consoles') return 1;
                if (a === 'Seats') return -1; if (b === 'Seats') return 1;
                return a.localeCompare(b);
            });
    }, [relevantFeatures, selectedOptionIds]);

    const toggleOption = (id: string) => {
        setSelectedOptionIds(prev => {
            const isSelected = prev.includes(id);
            if (isSelected) return prev.filter(i => i !== id);
            const next = [...prev, id];
            const feature = relevantFeatures.find((f: any) => f.id === id);
            if (feature?.category === 'Consoles' && feature.associatedSeatId) {
                if (!next.includes(feature.associatedSeatId)) next.push(feature.associatedSeatId);
            }
            return next;
        });
    };

    const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, STEPS.length));
    const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

    const displayedModelName = isOpenClassification ? `${model.name} (OPEN)` : model.name;

    return (
        <div className="fixed inset-0 z-[40] bg-background flex flex-col overflow-hidden">
            {/* Top Navigation Step Bar */}
            <div className="sticky top-0 z-30 px-12 h-24 border-b bg-card/90 backdrop-blur-xl shrink-0 flex items-center">
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
                {/* Left Side: Visual Preview Area */}
                <div className="w-full lg:w-7/12 relative flex flex-col p-12 bg-slate-50/50 overflow-hidden">
                    <div className="relative flex-1 w-full bg-white rounded-[3rem] border-2 border-slate-100 shadow-2xl overflow-hidden group">
                        <Carousel className="w-full h-full" opts={{ loop: true }}>
                            <CarouselContent className="h-full">
                                {carouselImages.map((url, idx) => (
                                    <CarouselItem key={idx} className="h-full w-full relative group/img">
                                        <Image src={url} alt="Boat" fill className="object-cover" unoptimized />
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="absolute top-6 right-6 h-12 w-12 rounded-full bg-white/20 backdrop-blur-md opacity-0 group-hover/img:opacity-100 transition-opacity text-white"
                                            onClick={() => setLightboxUrl(url)}
                                        >
                                            <Maximize2 className="h-6 w-6" />
                                        </Button>
                                    </CarouselItem>
                                ))}
                            </CarouselContent>
                            <CarouselPrevious className="left-6 h-12 w-12 bg-white/80 border-none shadow-xl hover:bg-white" />
                            <CarouselNext className="right-6 h-12 w-12 bg-white/80 border-none shadow-xl hover:bg-white" />
                        </Carousel>
                    </div>

                    {/* Build Summary Overlay Card */}
                    <div className="bg-white/95 backdrop-blur-xl border-2 border-white shadow-2xl p-10 rounded-[3rem] mt-8 shrink-0">
                        <div className="flex items-end justify-between px-1">
                            <div className="flex items-center gap-4 truncate mr-12 pb-1">
                                <Badge className="h-14 px-6 text-xl font-black uppercase tracking-widest bg-primary text-white border-none shrink-0 rounded-2xl shadow-xl">
                                    {range?.name?.toUpperCase() || 'HIGHFIELD'}
                                </Badge>
                                <h2 className="text-4xl font-black uppercase tracking-tighter text-slate-950 truncate">
                                    {displayedModelName}
                                </h2>
                            </div>

                            <div className="flex flex-col items-end shrink-0">
                                <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-2">
                                    Package Pricing (Excl. GST)
                                </span>
                                <div className="text-6xl font-black text-slate-950 tracking-tighter leading-none flex items-start">
                                    <span className="text-primary text-3xl mr-1 mt-1">$</span>
                                    <span>{totalPrice.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Tactical Info Section - Relocated underneath pricing */}
                    <div className="flex items-center justify-start gap-4 mt-8 px-6 shrink-0">
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-10 px-6 font-black uppercase text-[10px] tracking-widest text-slate-400 hover:text-primary hover:bg-primary/5 rounded-2xl border-2 border-transparent hover:border-primary/10 transition-all"
                            onClick={() => setShowFeatures(true)}
                        >
                            <ListChecks className="h-4 w-4 mr-2" /> Standard Features
                        </Button>
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-10 px-6 font-black uppercase text-[10px] tracking-widest text-slate-400 hover:text-primary hover:bg-primary/5 rounded-2xl border-2 border-transparent hover:border-primary/10 transition-all"
                            onClick={() => setShowSpecs(true)}
                        >
                            <ClipboardList className="h-4 w-4 mr-2" /> General Specifications
                        </Button>
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-10 px-6 font-black uppercase text-[10px] tracking-widest text-slate-400 hover:text-primary hover:bg-primary/5 rounded-2xl border-2 border-transparent hover:border-primary/10 transition-all"
                            onClick={() => setShowDocs(true)}
                        >
                            <FileText className="h-4 w-4 mr-2" /> Documents
                        </Button>
                    </div>
                </div>

                {/* Right Side: Interactive Step Content Area */}
                <div className="w-full lg:w-5/12 h-full flex flex-col overflow-hidden bg-slate-50/20">
                    <div className="pt-16 px-12 pb-8 bg-slate-50/50 backdrop-blur-md border-b shrink-0 text-left">
                        <h2 className="text-2xl font-black uppercase tracking-tighter italic text-slate-900 leading-none">
                            {STEPS.find(s => s.id === currentStep)?.label}
                        </h2>
                    </div>

                    <ScrollArea ref={scrollAreaRef} className="flex-1">
                        <div className="p-12 space-y-10">
                            {currentStep === 1 && (
                                <div className="space-y-12 animate-in fade-in duration-700 ease-in-out text-left">
                                    <div className="space-y-6">
                                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">
                                            1. Tube Material
                                        </h3>
                                        <div className="grid grid-cols-2 gap-6">
                                            {availableMaterials.map((mat) => (
                                                <button 
                                                    key={mat} 
                                                    onClick={() => { setSelectedMaterial(mat as any); setSelectedColor(null); }} 
                                                    className={cn(
                                                        "group flex flex-col items-center justify-center p-12 border-2 rounded-[2rem] transition-all bg-white", 
                                                        selectedMaterial === mat 
                                                            ? "border-primary shadow-lg ring-1 ring-primary/20" 
                                                            : "border-slate-100 hover:border-slate-200 hover:shadow-md"
                                                    )}
                                                >
                                                    <span className="text-6xl font-black text-slate-900 tracking-tight mb-6 uppercase">
                                                        {mat}
                                                    </span>
                                                    <div className="flex items-center gap-3">
                                                        <Check className={cn("h-5 w-5 stroke-[3]", selectedMaterial === mat ? "text-emerald-500" : "text-emerald-500/50")} />
                                                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest text-left leading-tight">
                                                            {mat === 'PVC' ? '5yr' : '10yr'} Tube<br/>Warranty
                                                        </span>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {selectedMaterial && (
                                        <div 
                                            ref={colorSectionRef}
                                            className="mt-16 space-y-8 animate-in slide-in-from-bottom-4 duration-700 ease-out scroll-mt-10"
                                        >
                                            <div className="flex items-center gap-4 bg-primary px-8 py-4 rounded-3xl shadow-2xl">
                                                <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
                                                <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-white">
                                                    2. Select Hull & Tube Color
                                                </h3>
                                            </div>
                                            <div className="grid grid-cols-2 gap-6">
                                                {availableColors.map((color) => (
                                                    <button 
                                                        key={color.id} 
                                                        onClick={() => setSelectedColor(color.id)} 
                                                        className={cn(
                                                            "flex flex-col border-2 rounded-[2rem] overflow-hidden transition-all bg-white", 
                                                            selectedColor === color.id 
                                                                ? "border-primary shadow-lg ring-1 ring-primary/20" 
                                                                : "border-slate-100 hover:border-slate-200 hover:shadow-md"
                                                        )}
                                                    >
                                                        <div className="relative aspect-video w-full p-6 bg-slate-50/50">
                                                            <Image src={color.imageUrl || ''} alt="Color" fill className="object-contain" unoptimized />
                                                        </div>
                                                        <div className={cn(
                                                            "p-5 text-center border-t transition-colors", 
                                                            selectedColor === color.id ? "bg-blue-50/50 border-primary/10" : "bg-white border-slate-100"
                                                        )}>
                                                            <p className={cn(
                                                                "text-xs font-bold uppercase tracking-widest",
                                                                selectedColor === color.id ? "text-primary" : "text-slate-600"
                                                            )}>{color.name}</p>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {currentStep === 2 && (
                                <div className="space-y-12 animate-in fade-in duration-700 ease-in-out text-left">
                                    {groupedOptions.map(([cat, opts]: [string, any]) => (
                                        <div key={cat} className="space-y-4">
                                            <h3 className="text-[11px] font-black uppercase tracking-widest border-l-4 border-primary pl-3">{cat}</h3>
                                            <div className="grid gap-3">
                                                {opts.map((opt: any) => (
                                                    <button 
                                                        key={opt.id} 
                                                        onClick={() => toggleOption(opt.id)} 
                                                        className={cn(
                                                            "flex items-center justify-between p-5 border-2 rounded-[1.5rem] transition-all", 
                                                            selectedOptionIds.includes(opt.id) ? "bg-primary/5 border-primary shadow-lg" : "bg-white border-none hover:bg-primary/5"
                                                        )}
                                                    >
                                                        <div className="flex items-center gap-4">
                                                            <div className="h-14 w-14 relative bg-slate-50 border rounded-xl overflow-hidden shadow-inner">
                                                                {opt.imageUrl && <Image src={opt.imageUrl} alt="Opt" fill className="object-cover" unoptimized />}
                                                            </div>
                                                            <p className="text-sm font-black uppercase tracking-tight">{opt.name}</p>
                                                        </div>
                                                        <p className={cn("text-sm font-black", selectedOptionIds.includes(opt.id) ? "text-primary" : "text-foreground")}>
                                                            +${(opt.sellPriceExclGst || 0).toLocaleString()}
                                                        </p>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {currentStep === 3 && (
                                <div className="space-y-8 animate-in fade-in duration-700 ease-in-out text-left">
                                    <div className="grid gap-4">
                                        {motorsLoading ? (
                                            <div className="flex flex-col items-center py-20 gap-4">
                                                <Loader2 className="animate-spin h-12 w-12 text-primary" />
                                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground animate-pulse">Scanning Factory Datasets...</p>
                                            </div>
                                        ) : motors.map(m => (
                                            <button 
                                                key={m.id} 
                                                onClick={() => setSelectedMotor(selectedMotor?.id === m.id ? null : m)} 
                                                className={cn(
                                                    "flex items-center justify-between p-6 border-2 rounded-[2rem] transition-all", 
                                                    selectedMotor?.id === m.id ? "bg-primary border-primary text-white shadow-2xl" : "bg-white border-none hover:bg-primary/5"
                                                )}
                                            >
                                                <div className="flex items-center gap-6">
                                                    <div className="h-20 w-20 relative bg-white rounded-2xl border-2 overflow-hidden shrink-0">
                                                        {m.SummaryImage && (
                                                            <Image 
                                                                src={`https://www.yamaha-motor.com.au${m.SummaryImage.startsWith('/') ? '' : '/'}${m.SummaryImage}`} 
                                                                alt="Motor" 
                                                                fill 
                                                                className="object-contain p-2" 
                                                                unoptimized 
                                                            />
                                                        )}
                                                    </div>
                                                    <div className="text-left">
                                                        <p className="text-base font-black uppercase tracking-tight leading-tight">{m['Model Name']}</p>
                                                        <p className={cn("text-[10px] font-bold uppercase mt-1", selectedMotor?.id === m.id ? "opacity-70" : "text-primary")}>
                                                            {m['HP Rating']} HP PERFORMANCE
                                                        </p>
                                                    </div>
                                                </div>
                                                <p className="text-base font-black">${(m.sellPriceExclGst || 0).toLocaleString()}</p>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </ScrollArea>

                    {/* Bottom Global Build Navigation */}
                    <div className="p-12 pt-6 bg-slate-50/80 backdrop-blur-xl border-t shrink-0 flex gap-4">
                        {currentStep > 1 && (
                            <Button 
                                variant="outline" 
                                className="h-16 w-24 rounded-2xl border-2 border-slate-200 hover:bg-slate-100 transition-colors shadow-sm" 
                                onClick={prevStep}
                            >
                                <ChevronLeft className="h-6 w-6" />
                            </Button>
                        )}
                        <Button 
                            size="lg" 
                            className="flex-1 h-16 rounded-2xl font-black uppercase text-sm shadow-2xl shadow-primary/20 transition-all hover:scale-[1.02] active:scale-95 bg-primary text-white" 
                            onClick={nextStep}
                        >
                            {currentStep === STEPS.length ? 'Finalize Quote' : `Next: ${STEPS[currentStep].label}`}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Tactical Lightbox Overlay */}
            <Dialog open={!!lightboxUrl} onOpenChange={(open) => !open && setLightboxUrl(null)}>
                <DialogContent className="max-w-[95vw] h-[90vh] p-0 overflow-hidden bg-black/95 border-none shadow-none rounded-none [&>button]:text-white [&>button]:h-12 [&>button]:w-12">
                    <div className="relative w-full h-full flex items-center justify-center">
                        {lightboxUrl && <Image src={lightboxUrl} alt="Inspection" fill className="object-contain p-12" unoptimized />}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Standard Features Dialog - Unified Table Layout */}
            <Dialog open={showFeatures} onOpenChange={setShowFeatures}>
                <DialogContent className="sm:max-w-2xl rounded-3xl border-4 shadow-2xl p-0 overflow-hidden">
                    <DialogHeader className="p-8 border-b bg-muted/5">
                        <DialogTitle className="text-2xl font-black uppercase tracking-tight italic text-primary">Standard Features</DialogTitle>
                        <DialogDescription className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">Included Factory Equipment</DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="max-h-[60vh]">
                        <div className="p-0">
                            <Table>
                                <TableBody>
                                    {model.standardFeatures?.map((f: string, i: number) => (
                                        <TableRow key={i} className="hover:bg-primary/5">
                                            <TableCell className="w-10 pl-8">
                                                <Check className="h-4 w-4 text-emerald-500" />
                                            </TableCell>
                                            <TableCell className="font-black uppercase text-[10px] text-slate-900 pr-8 py-4 leading-relaxed">
                                                {f}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </ScrollArea>
                </DialogContent>
            </Dialog>

            {/* General Specs Dialog */}
            <Dialog open={showSpecs} onOpenChange={setShowSpecs}>
                <DialogContent className="sm:max-w-2xl rounded-3xl border-4 shadow-2xl p-0 overflow-hidden">
                    <DialogHeader className="p-8 border-b bg-muted/5">
                        <DialogTitle className="text-2xl font-black uppercase tracking-tight italic text-primary">General Specifications</DialogTitle>
                        <DialogDescription className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">Engineering & Technical Data</DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="max-h-[60vh]">
                        <div className="p-0">
                            <Table>
                                <TableBody>
                                    {model.specifications?.otherSpecs?.map((s: any, i: number) => (
                                        <TableRow key={i} className="hover:bg-primary/5">
                                            <TableCell className="font-black uppercase text-[10px] text-muted-foreground w-1/2 pl-8 py-4">{s.label}</TableCell>
                                            <TableCell className="font-black uppercase text-[10px] text-slate-900 pr-8 py-4">{s.value}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </ScrollArea>
                </DialogContent>
            </Dialog>

            {/* Documents Dialog */}
            <Dialog open={showDocs} onOpenChange={setShowDocs}>
                <DialogContent className="sm:max-w-md rounded-3xl border-4 shadow-2xl p-0 overflow-hidden">
                    <DialogHeader className="p-8 border-b bg-muted/5">
                        <DialogTitle className="text-2xl font-black uppercase tracking-tight italic text-primary">Technical Assets</DialogTitle>
                        <DialogDescription className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">Factory Manuals & Schematics</DialogDescription>
                    </DialogHeader>
                    <div className="p-8 space-y-3">
                        {model.documents?.length > 0 ? model.documents.map((doc: any, i: number) => (
                            <a 
                                key={i} 
                                href={doc.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center justify-between p-4 rounded-2xl border-2 hover:border-primary/40 hover:bg-primary/5 transition-all group"
                            >
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
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

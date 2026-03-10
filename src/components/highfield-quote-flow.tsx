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
    
    // Selection State
    const [selectedMaterial, setSelectedMaterial] = useState<'PVC' | 'HYP' | null>(null);
    const [selectedColor, setSelectedColor] = useState<string | null>(null);
    const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
    const [selectedMotor, setSelectedMotor] = useState<any | null>(null);

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

    // Reset scroll on step change
    useEffect(() => {
        if (scrollAreaRef.current) {
            const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
            if (viewport) viewport.scrollTo({ top: 0, behavior: 'auto' });
        }
    }, [currentStep]);

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
        const selectedConsoleId = selectedOptionIds.find(id => features.find(f => f.id === id && f.category === 'Consoles'));
        const selectedConsole = features.find(f => f.id === selectedConsoleId);

        const groups = features.reduce((acc: any, opt: any) => {
            const cat = opt.category || 'General Options';
            if (cat === 'Seats' && selectedConsole) {
                if (!selectedConsole.associatedSeatId || opt.id !== selectedConsole.associatedSeatId) return acc;
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
            <div className="sticky top-0 z-30 px-12 h-24 border-b bg-card/90 backdrop-blur-xl shrink-0 flex items-center">
                <div className="w-full flex items-center justify-between">
                    <div className="flex-1 flex items-center justify-between mr-24">
                        {STEPS.map((step) => (
                            <div key={step.id} className="flex items-center gap-3">
                                <div className={cn("h-8 w-8 rounded-full flex items-center justify-center text-[10px] font-black transition-all border-2", currentStep === step.id ? "bg-primary border-primary text-white scale-110 shadow-lg" : currentStep > step.id ? "bg-green-500 border-green-500 text-white" : "bg-muted border-transparent text-muted-foreground")}>{currentStep > step.id ? <CheckCircle2 className="h-4 w-4" /> : step.id}</div>
                                <span className={cn("text-[9px] font-black uppercase tracking-[0.2em] hidden sm:block whitespace-nowrap", currentStep === step.id ? "text-foreground" : "text-muted-foreground")}>{step.label}</span>
                            </div>
                        ))}
                    </div>
                    <button type="button" className="font-black text-destructive uppercase tracking-widest text-[10px] hover:opacity-70 transition-opacity" onClick={() => router.push(`/modules/${module.slug || module.id}`)}>Exit Build</button>
                </div>
            </div>

            <div className="relative z-10 flex-1 flex flex-col lg:flex-row overflow-hidden">
                <div className="w-full lg:w-7/12 relative flex flex-col p-12 bg-slate-50/50 overflow-hidden">
                    <div className="relative flex-1 w-full bg-white rounded-[3rem] border-2 border-slate-100 shadow-2xl overflow-hidden group">
                        <Carousel className="w-full h-full" opts={{ loop: true }}>
                            <CarouselContent className="h-full">
                                {carouselImages.map((url, idx) => (
                                    <CarouselItem key={idx} className="h-full w-full relative">
                                        <Image src={url} alt="Boat" fill className="object-cover" unoptimized />
                                    </CarouselItem>
                                ))}
                            </CarouselContent>
                            <CarouselPrevious className="left-6" /><CarouselNext className="right-6" />
                        </Carousel>
                    </div>
                    <div className="bg-white/95 backdrop-blur-xl border-2 border-white shadow-2xl p-10 rounded-[3rem] mt-8 shrink-0">
                        <div className="flex items-center justify-between px-1 mb-4">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black uppercase text-primary tracking-[0.3em] mb-1">{range?.name || 'Highfield'} Range</span>
                                <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Build Baseline</span>
                            </div>
                            <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] self-end">Excl. GST</span>
                        </div>
                        <div className="flex items-center justify-between px-1">
                            <h2 className="text-3xl font-black uppercase tracking-tight text-slate-950 truncate mr-12 leading-none">{displayedModelName}</h2>
                            <div className="text-6xl font-black text-slate-950 tracking-tighter shrink-0 leading-none">
                                <span className="text-primary text-2xl mr-1">$</span>{totalPrice.toLocaleString()}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="w-full lg:w-5/12 h-full border-l border-slate-100 flex flex-col overflow-hidden bg-slate-50/20">
                    <div className="pt-16 px-12 pb-8 bg-slate-50/50 backdrop-blur-md border-b">
                        <h2 className="text-5xl font-black uppercase tracking-tighter italic text-slate-900 leading-none">
                            {STEPS.find(s => s.id === currentStep)?.label}
                        </h2>
                    </div>
                    <ScrollArea ref={scrollAreaRef} className="flex-1">
                        <div className="p-12 space-y-10">
                            {currentStep === 1 && (
                                <div className="space-y-10">
                                    <div className="space-y-6">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-primary">1. Tube Material</span>
                                        <div className="grid grid-cols-2 gap-6">
                                            {availableMaterials.map((mat) => (
                                                <button 
                                                    key={mat} 
                                                    onClick={() => { setSelectedMaterial(mat as any); setSelectedColor(null); }} 
                                                    className={cn(
                                                        "group flex flex-col items-start p-10 border-2 rounded-[2.5rem] transition-all min-h-[240px] text-left", 
                                                        selectedMaterial === mat 
                                                            ? "bg-primary border-primary text-white shadow-2xl scale-[1.02]" 
                                                            : "bg-white border-slate-100 hover:border-primary/40 hover:-translate-y-1"
                                                    )}
                                                >
                                                    <span className="text-5xl font-black uppercase mb-4">{mat}</span>
                                                    <div className="mt-auto flex items-center gap-2">
                                                        <Check className={cn("h-4 w-4", selectedMaterial === mat ? "text-white" : "text-green-500")} />
                                                        <span className="text-[10px] font-black uppercase tracking-widest">{mat === 'PVC' ? '5yr' : '10yr'} Tube Warranty</span>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    {selectedMaterial && (
                                        <div className="mt-12 space-y-8 animate-in slide-in-from-bottom-4 duration-700">
                                            <div className="flex items-center gap-4 bg-primary px-8 py-4 rounded-2xl shadow-xl shadow-primary/20">
                                                <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
                                                <span className="text-[11px] font-black uppercase tracking-[0.3em] text-white">2. Select Hull & Tube Color</span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-6">
                                                {availableColors.map((color) => (
                                                    <button 
                                                        key={color.id} 
                                                        onClick={() => setSelectedColor(color.id)} 
                                                        className={cn(
                                                            "flex flex-col border-2 rounded-[2.5rem] overflow-hidden transition-all bg-white", 
                                                            selectedColor === color.id ? "border-primary shadow-2xl scale-[1.02]" : "border-slate-100 hover:border-primary/20 hover:-translate-y-1"
                                                        )}
                                                    >
                                                        <div className="relative aspect-video w-full p-6">
                                                            <Image src={color.imageUrl || ''} alt="Color" fill className="object-contain" unoptimized />
                                                        </div>
                                                        <div className={cn("p-6 text-center border-t", selectedColor === color.id ? "bg-primary text-white border-primary" : "bg-slate-50 border-slate-100")}>
                                                            <p className="text-[11px] font-black uppercase tracking-widest">{color.name}</p>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                            {currentStep === 2 && (
                                <div className="space-y-12">
                                    {groupedOptions.map(([cat, opts]: [string, any]) => (
                                        <div key={cat} className="space-y-4">
                                            <h3 className="text-[11px] font-black uppercase tracking-widest border-l-4 border-primary pl-3">{cat}</h3>
                                            <div className="grid gap-3">
                                                {opts.map((opt: any) => (
                                                    <button key={opt.id} onClick={() => toggleOption(opt.id)} className={cn("flex items-center justify-between p-5 border-2 rounded-[1.5rem] transition-all", selectedOptionIds.includes(opt.id) ? "bg-primary/5 border-primary shadow-lg" : "bg-white border-slate-100 hover:border-primary/20")}>
                                                        <div className="flex items-center gap-4">
                                                            <div className="h-14 w-14 relative bg-slate-50 border rounded-xl overflow-hidden shadow-inner">{opt.imageUrl && <Image src={opt.imageUrl} alt="Opt" fill className="object-cover" unoptimized />}</div>
                                                            <p className="text-sm font-black uppercase tracking-tight">{opt.name}</p>
                                                        </div>
                                                        <p className={cn("text-sm font-black", selectedOptionIds.includes(opt.id) ? "text-primary" : "text-foreground")}>+${(opt.sellPriceExclGst || 0).toLocaleString()}</p>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {currentStep === 3 && (
                                <div className="grid gap-4">
                                    {motorsLoading ? <Loader2 className="animate-spin h-12 w-12 mx-auto" /> : motors.map(m => (
                                        <button key={m.id} onClick={() => setSelectedMotor(selectedMotor?.id === m.id ? null : m)} className={cn("flex items-center justify-between p-6 border-2 rounded-[2rem] transition-all", selectedMotor?.id === m.id ? "bg-primary border-primary text-white shadow-2xl" : "bg-white border-slate-100 hover:border-primary/20")}>
                                            <div className="flex items-center gap-6">
                                                <div className="h-20 w-20 relative bg-white rounded-2xl border-2 overflow-hidden shrink-0">{m.SummaryImage && <Image src={`https://www.yamaha-motor.com.au${m.SummaryImage.startsWith('/') ? '' : '/'}${m.SummaryImage}`} alt="Motor" fill className="object-contain p-2" unoptimized />}</div>
                                                <div>
                                                    <p className="text-base font-black uppercase tracking-tight">{m['Model Name']}</p>
                                                    <p className="text-[10px] font-bold opacity-60 uppercase">{m['HP Rating']} HP</p>
                                                </div>
                                            </div>
                                            <p className="text-base font-black">${(m.sellPriceExclGst || 0).toLocaleString()}</p>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                    <div className="p-12 pt-4 bg-white/50 backdrop-blur-md border-t flex gap-4">
                        {currentStep > 1 && <Button variant="outline" className="h-16 w-24 rounded-2xl border-2 hover:bg-slate-100 transition-colors" onClick={prevStep}><ChevronLeft className="h-6 w-6" /></Button>}
                        <Button size="lg" className="flex-1 h-16 rounded-2xl font-black uppercase text-sm shadow-2xl transition-all hover:scale-[1.02] active:scale-95" onClick={nextStep}>{currentStep === STEPS.length ? 'Finalize Quote' : `Next: ${STEPS[currentStep].label}`}</Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

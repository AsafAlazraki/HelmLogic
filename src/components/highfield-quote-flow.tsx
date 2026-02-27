
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
    Box
} from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/currency-utils';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';

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
    { id: 1, label: 'Boat Configuration' },
    { id: 2, label: 'Options & Accessories' },
    { id: 3, label: 'Review & Submit' },
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
    
    // State for Step 1
    const [selectedMaterial, setSelectedMaterial] = useState<'PVC' | 'HYP' | null>(null);
    const [selectedColor, setSelectedColor] = useState<string | null>(null);

    // 1. Fetch Variants for this model
    const variantsQuery = useMemoFirebase(() => 
        query(collection(firestore, `data-warehouse/${vendor.id}/ranges/${rangeId}/models/${model.id}/variants`), orderBy('order')),
    [firestore, vendor.id, rangeId, model.id]);
    
    const { data: variants, loading: variantsLoading } = useCollection<Variant>(variantsQuery);

    // Derivations for Step 1
    const availableMaterials = useMemo(() => {
        if (!variants) return [];
        return [...new Set(variants.map(v => v.material))].filter(Boolean) as string[];
    }, [variants]);

    const filteredVariantsByMaterial = useMemo(() => {
        if (!variants || !selectedMaterial) return [];
        return variants.filter(v => v.material === selectedMaterial);
    }, [variants, selectedMaterial]);

    const availableColors = useMemo(() => {
        return filteredVariantsByMaterial.map(v => ({
            id: v.id,
            name: v.colorName || 'Default Color',
            code: v.colorCode,
            imageUrl: v.imageUrl,
            sku: v.sku
        }));
    }, [filteredVariantsByMaterial]);

    const activeVariant = useMemo(() => {
        if (!selectedColor || !variants) return null;
        return variants.find(v => v.id === selectedColor);
    }, [selectedColor, variants]);

    // UI Helpers
    const isStep1Complete = !!(selectedMaterial && selectedColor);

    const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, STEPS.length));
    const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

    if (variantsLoading) {
        return (
            <div className="flex h-[60vh] w-full items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="h-[calc(100vh-64px)] -mt-6 -mx-6 bg-background flex flex-col relative overflow-hidden">
            {/* Immersive Background Blur */}
            <div className="absolute inset-0 z-0">
                {model.coverImageUrl && (
                    <div className="relative h-full w-full opacity-10 blur-3xl scale-110">
                        <Image src={model.coverImageUrl} alt="Bg" fill className="object-cover" unoptimized />
                    </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />
            </div>

            {/* Top Navigation / Progress Header */}
            <div className="relative z-20 p-6 flex flex-col items-center gap-6 border-b bg-card/80 backdrop-blur-xl shrink-0">
                <div className="w-full max-w-7xl flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="h-10 w-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
                            <Ship className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-black uppercase tracking-tight leading-tight">{model.name}</h1>
                            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{vendor.name} • Quotation</p>
                        </div>
                    </div>

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

                    <Button variant="ghost" size="sm" className="font-bold text-destructive hover:bg-destructive/10" onClick={() => window.history.back()}>
                        Exit
                    </Button>
                </div>
            </div>

            {/* Main Workspace */}
            <div className="relative z-10 flex-1 flex overflow-hidden">
                <div className="flex-1 flex flex-col lg:flex-row max-w-full">
                    
                    {/* Fixed Preview Section (Left) */}
                    <div className="w-full lg:w-7/12 h-[40vh] lg:h-full relative bg-muted/5 border-r border-white/5">
                        <div className="absolute inset-0 flex flex-col p-8 md:p-12">
                            <div className="z-20">
                                <Badge variant="secondary" className="px-4 py-1.5 font-black uppercase tracking-widest text-[10px] shadow-sm bg-background/80 backdrop-blur-sm border-white/20">
                                    Visualizer
                                </Badge>
                            </div>
                            
                            <div className="flex-1 relative w-full flex items-center justify-center">
                                {(activeVariant?.imageUrl || model.coverImageUrl) ? (
                                    <Image 
                                        src={activeVariant?.imageUrl || model.coverImageUrl} 
                                        alt="Boat Preview" 
                                        fill 
                                        className="object-contain p-4 drop-shadow-[0_35px_60px_rgba(0,0,0,0.3)] animate-in fade-in zoom-in duration-700" 
                                        unoptimized
                                    />
                                ) : (
                                    <Ship className="h-32 w-32 opacity-5" />
                                )}
                            </div>

                            {activeVariant && (
                                <div className="mt-auto animate-in slide-in-from-bottom-4 duration-500">
                                    <div className="bg-background/40 backdrop-blur-md border border-white/10 p-6 rounded-2xl flex items-end justify-between gap-4 shadow-2xl">
                                        <div>
                                            <p className="text-[10px] font-black uppercase text-primary tracking-widest mb-1">Staged SKU</p>
                                            <h3 className="text-2xl font-black uppercase tracking-tight leading-none">{activeVariant.name}</h3>
                                            <p className="font-mono text-[10px] font-bold opacity-50 mt-2 tracking-tighter">{activeVariant.sku || 'MASTER-SKU'}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1">Base Price</p>
                                            <div className="text-3xl font-black flex items-center justify-end gap-1">
                                                <span className="text-primary text-xl">$</span>
                                                {(activeVariant.sellPriceExclGst || 0).toLocaleString()}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Scrollable Config Section (Right) */}
                    <ScrollArea className="w-full lg:w-5/12 h-full bg-background/20 backdrop-blur-sm">
                        <div className="p-8 md:p-12 space-y-10">
                            {currentStep === 1 && (
                                <div className="space-y-10 animate-in slide-in-from-right-4 duration-500">
                                    <div className="space-y-3">
                                        <h2 className="text-3xl font-black uppercase tracking-tight leading-none">The Foundation</h2>
                                        <p className="text-muted-foreground font-medium text-sm leading-relaxed max-w-md">Select your hull material and tube color to initialize the build specifications.</p>
                                    </div>

                                    {/* Material Selection */}
                                    <div className="space-y-5">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-primary">1. Tube Material</span>
                                            {selectedMaterial && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            {availableMaterials.map((mat) => (
                                                <button
                                                    key={mat}
                                                    onClick={() => { setSelectedMaterial(mat as any); setSelectedColor(null); }}
                                                    className={cn(
                                                        "group relative flex flex-col items-start p-5 border-2 rounded-2xl transition-all duration-300",
                                                        selectedMaterial === mat ? "bg-primary border-primary text-white shadow-xl shadow-primary/20 scale-[1.02]" : "bg-card hover:border-primary/40"
                                                    )}
                                                >
                                                    <div className={cn(
                                                        "h-8 w-8 rounded-lg flex items-center justify-center mb-4 transition-colors",
                                                        selectedMaterial === mat ? "bg-white/20" : "bg-muted"
                                                    )}>
                                                        <Box className={cn("h-4 w-4", selectedMaterial === mat ? "text-white" : "text-muted-foreground")} />
                                                    </div>
                                                    <span className="text-sm font-black uppercase tracking-tight">{mat}</span>
                                                    <p className={cn("text-[8px] font-bold mt-1 uppercase opacity-60", selectedMaterial === mat ? "text-white" : "text-muted-foreground")}>
                                                        {mat === 'PVC' ? 'Robust Standard' : 'Premium UV Resistance'}
                                                    </p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Color Selection */}
                                    {selectedMaterial && (
                                        <div className="space-y-5 animate-in fade-in slide-in-from-top-2 duration-500">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-primary">2. Available Colors</span>
                                                {selectedColor && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                                            </div>
                                            
                                            <div className="grid grid-cols-2 gap-4">
                                                {availableColors.map((color) => (
                                                    <button
                                                        key={color.id}
                                                        onClick={() => setSelectedColor(color.id)}
                                                        className={cn(
                                                            "group flex flex-col border-2 rounded-2xl overflow-hidden transition-all duration-300 text-left",
                                                            selectedColor === color.id ? "border-primary ring-2 ring-primary/10 shadow-xl" : "border-border hover:border-primary/20"
                                                        )}
                                                    >
                                                        {/* White background specifically for highfield renders */}
                                                        <div className="relative aspect-video bg-white w-full shrink-0 border-b">
                                                            {color.imageUrl ? (
                                                                <Image src={color.imageUrl} alt={color.name} fill className="object-contain p-2" unoptimized />
                                                            ) : (
                                                                <div className="flex h-full w-full items-center justify-center opacity-5 bg-muted"><Ship className="h-6 w-6"/></div>
                                                            )}
                                                        </div>
                                                        <div className={cn(
                                                            "p-3 w-full transition-colors",
                                                            selectedColor === color.id ? "bg-primary text-white" : "bg-card"
                                                        )}>
                                                            <p className="text-[10px] font-black uppercase tracking-tight truncate">{color.name}</p>
                                                            {color.code && <p className={cn("text-[8px] font-bold mt-1 uppercase", selectedColor === color.id ? "text-white/60" : "text-muted-foreground")}>{color.code}</p>}
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Persistent Footer Call to Action */}
                                    <div className="pt-10 sticky bottom-0 bg-gradient-to-t from-background via-background to-transparent pb-4">
                                        <Button 
                                            size="lg" 
                                            className="w-full h-14 rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl shadow-primary/20 transition-all active:scale-95 group"
                                            disabled={!isStep1Complete}
                                            onClick={nextStep}
                                        >
                                            Next: Options & Accessories
                                            <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                                        </Button>
                                        <div className="flex items-center justify-center gap-2 mt-4 text-muted-foreground">
                                            <ShieldCheck className="h-3 w-3" />
                                            <span className="text-[8px] font-bold uppercase tracking-widest">Configuration values synced to draft</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {currentStep === 2 && (
                                <div className="flex flex-col items-center justify-center py-20 animate-in fade-in duration-500">
                                    <Card className="w-full border-2 border-dashed bg-muted/5 flex flex-col items-center justify-center p-12 text-center gap-6 rounded-3xl">
                                        <div className="h-16 w-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                                            <Box className="h-8 w-8" />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-black uppercase tracking-tight">Rigging & Options</h3>
                                            <p className="text-xs text-muted-foreground mt-2 font-medium">Continue to customize consoles, seating, and technical accessories.</p>
                                        </div>
                                        <div className="flex flex-col gap-3 w-full">
                                            <Button size="lg" className="w-full h-14 font-black uppercase tracking-widest text-xs" onClick={nextStep}>
                                                Continue Build <ChevronRight className="ml-2 h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" className="font-bold text-xs" onClick={prevStep}>
                                                <ChevronLeft className="mr-2 h-4 w-4" /> Back to Base
                                            </Button>
                                        </div>
                                    </Card>
                                </div>
                            )}

                            {currentStep === 3 && (
                                <div className="flex flex-col items-center justify-center py-20 animate-in fade-in duration-500">
                                    <Card className="w-full border-2 border-dashed bg-muted/5 flex flex-col items-center justify-center p-12 text-center gap-6 rounded-3xl">
                                        <div className="h-16 w-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                                            <CheckCircle2 className="h-8 w-8" />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-black uppercase tracking-tight">Generate Proposal</h3>
                                            <p className="text-xs text-muted-foreground mt-2 font-medium">Review the complete build list and pricing summary before finalizing the quote.</p>
                                        </div>
                                        <div className="flex flex-col gap-3 w-full">
                                            <Button size="lg" className="w-full h-14 font-black uppercase tracking-widest text-xs">
                                                Finalize Quote <ArrowRight className="ml-2 h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" className="font-bold text-xs" onClick={prevStep}>
                                                <ChevronLeft className="mr-2 h-4 w-4" /> Back to Options
                                            </Button>
                                        </div>
                                    </Card>
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </div>
            </div>
        </div>
    );
}

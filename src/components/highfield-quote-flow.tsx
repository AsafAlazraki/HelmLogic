
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
        <div className="min-h-screen -mt-6 -mx-6 bg-background flex flex-col relative overflow-hidden">
            {/* Immersive Background Blur - Visual stunning effect */}
            <div className="absolute inset-0 z-0">
                {model.coverImageUrl && (
                    <div className="relative h-full w-full opacity-10 blur-3xl scale-110">
                        <Image src={model.coverImageUrl} alt="Bg" fill className="object-cover" unoptimized />
                    </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />
            </div>

            {/* Top Navigation / Progress Header */}
            <div className="relative z-10 p-6 flex flex-col items-center gap-6 border-b bg-card/50 backdrop-blur-md">
                <div className="w-full max-w-5xl flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="h-12 w-12 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20">
                            <Ship className="h-6 w-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-black uppercase tracking-tight">{model.name}</h1>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{vendor.name} • Quote Flow</p>
                        </div>
                    </div>

                    <div className="hidden md:flex items-center gap-8">
                        {STEPS.map((step) => (
                            <div key={step.id} className="flex items-center gap-3">
                                <div className={cn(
                                    "h-8 w-8 rounded-full flex items-center justify-center text-xs font-black transition-all border-2",
                                    currentStep === step.id ? "bg-primary border-primary text-white scale-110 shadow-lg" : 
                                    currentStep > step.id ? "bg-green-500 border-green-500 text-white" : "bg-muted border-transparent text-muted-foreground"
                                )}>
                                    {currentStep > step.id ? <CheckCircle2 className="h-4 w-4" /> : step.id}
                                </div>
                                <span className={cn(
                                    "text-[10px] font-black uppercase tracking-widest transition-colors",
                                    currentStep === step.id ? "text-foreground" : "text-muted-foreground"
                                )}>
                                    {step.label}
                                </span>
                                {step.id < STEPS.length && <ChevronRight className="h-4 w-4 text-muted-foreground/30" />}
                            </div>
                        ))}
                    </div>

                    <Button variant="ghost" className="font-bold text-destructive hover:bg-destructive/10" onClick={() => window.history.back()}>
                        Cancel
                    </Button>
                </div>
            </div>

            {/* Main Configuration Content */}
            <main className="relative z-10 flex-1 overflow-auto">
                <div className="max-w-7xl mx-auto p-6 md:p-10 h-full">
                    {currentStep === 1 && (
                        <div className="grid lg:grid-cols-12 gap-10 h-full">
                            
                            {/* Visual Preview Panel */}
                            <div className="lg:col-span-7 flex flex-col gap-6">
                                <Card className="flex-1 bg-card/40 backdrop-blur-md border-2 overflow-hidden shadow-2xl rounded-3xl relative">
                                    <div className="absolute top-6 left-6 z-20">
                                        <Badge variant="secondary" className="px-4 py-1.5 font-black uppercase tracking-widest text-[10px] shadow-sm bg-background/80 backdrop-blur-sm">
                                            Visual Preview
                                        </Badge>
                                    </div>
                                    <div className="relative h-full w-full min-h-[400px] flex items-center justify-center p-10">
                                        {(activeVariant?.imageUrl || model.coverImageUrl) ? (
                                            <Image 
                                                src={activeVariant?.imageUrl || model.coverImageUrl} 
                                                alt="Boat Preview" 
                                                fill 
                                                className="object-contain p-4 drop-shadow-[0_20px_50px_rgba(0,0,0,0.2)] animate-in fade-in zoom-in duration-500" 
                                                unoptimized
                                            />
                                        ) : (
                                            <Ship className="h-32 w-32 opacity-10" />
                                        )}
                                    </div>
                                    
                                    {activeVariant && (
                                        <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-background/90 to-transparent pt-20">
                                            <div className="flex items-end justify-between gap-4">
                                                <div>
                                                    <p className="text-[10px] font-black uppercase text-primary tracking-widest mb-1">Active Selection</p>
                                                    <h3 className="text-2xl font-black uppercase tracking-tight">{activeVariant.name}</h3>
                                                    <p className="font-mono text-xs font-bold opacity-60 mt-1">{activeVariant.sku || 'MASTER-SKU'}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1">Retail Price (Excl)</p>
                                                    <div className="text-3xl font-black flex items-center gap-1">
                                                        <DollarSign className="h-5 w-5 text-primary" />
                                                        {(activeVariant.sellPriceExclGst || 0).toLocaleString()}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </Card>
                            </div>

                            {/* Selection Panel */}
                            <div className="lg:col-span-5 space-y-8 animate-in slide-in-from-right-4 duration-500">
                                <div className="space-y-2">
                                    <h2 className="text-3xl font-black uppercase tracking-tight">Configure Foundation</h2>
                                    <p className="text-muted-foreground font-medium">Select your preferred tube material and color scheme to begin the quotation process.</p>
                                </div>

                                {/* Material Toggle */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2">
                                        <div className="h-1 flex-1 bg-primary/10 rounded-full overflow-hidden">
                                            <div className={cn("h-full bg-primary transition-all duration-500", selectedMaterial ? "w-1/2" : "w-0")} />
                                        </div>
                                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Step 1.1: Material</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        {availableMaterials.map((mat) => (
                                            <button
                                                key={mat}
                                                onClick={() => { setSelectedMaterial(mat as any); setSelectedColor(null); }}
                                                className={cn(
                                                    "group relative flex flex-col items-center justify-center p-6 border-2 rounded-2xl transition-all duration-300",
                                                    selectedMaterial === mat ? "bg-primary border-primary text-white shadow-xl shadow-primary/20 scale-[1.02]" : "bg-card hover:border-primary/40 text-card-foreground"
                                                )}
                                            >
                                                <div className={cn(
                                                    "h-10 w-10 rounded-full flex items-center justify-center mb-3 transition-colors",
                                                    selectedMaterial === mat ? "bg-white/20" : "bg-muted group-hover:bg-primary/10"
                                                )}>
                                                    <Box className={cn("h-5 w-5", selectedMaterial === mat ? "text-white" : "text-muted-foreground group-hover:text-primary")} />
                                                </div>
                                                <span className="text-lg font-black uppercase tracking-tight">{mat}</span>
                                                <p className={cn("text-[9px] font-bold mt-1 uppercase opacity-60", selectedMaterial === mat ? "text-white" : "text-muted-foreground")}>
                                                    {mat === 'PVC' ? 'Robust Standard' : 'Premium Durability'}
                                                </p>
                                                {selectedMaterial === mat && (
                                                    <div className="absolute top-2 right-2">
                                                        <CheckCircle2 className="h-4 w-4 text-white" />
                                                    </div>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Color Selection */}
                                {selectedMaterial && (
                                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-500">
                                        <div className="flex items-center gap-2">
                                            <div className="h-1 flex-1 bg-primary/10 rounded-full overflow-hidden">
                                                <div className={cn("h-full bg-primary transition-all duration-500", selectedColor ? "w-full" : "w-1/2")} />
                                            </div>
                                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Step 1.2: Color Scheme</span>
                                        </div>
                                        
                                        <div className="grid grid-cols-2 gap-4">
                                            {availableColors.map((color) => (
                                                <button
                                                    key={color.id}
                                                    onClick={() => setSelectedColor(color.id)}
                                                    className={cn(
                                                        "group flex flex-col border-2 rounded-2xl overflow-hidden transition-all duration-300",
                                                        selectedColor === color.id ? "border-primary ring-2 ring-primary/20 shadow-xl" : "border-border hover:border-primary/20"
                                                    )}
                                                >
                                                    <div className="relative aspect-video bg-muted/30 w-full shrink-0">
                                                        {color.imageUrl ? (
                                                            <Image src={color.imageUrl} alt={color.name} fill className="object-contain p-2" unoptimized />
                                                        ) : (
                                                            <div className="flex h-full w-full items-center justify-center opacity-10"><Ship className="h-6 w-6"/></div>
                                                        )}
                                                    </div>
                                                    <div className={cn(
                                                        "p-3 w-full text-left transition-colors",
                                                        selectedColor === color.id ? "bg-primary text-white" : "bg-card"
                                                    )}>
                                                        <p className="text-[10px] font-black uppercase tracking-tight leading-none">{color.name}</p>
                                                        {color.code && <p className={cn("text-[8px] font-bold mt-1.5 opacity-60 uppercase", selectedColor === color.id ? "text-white" : "text-muted-foreground")}>{color.code}</p>}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Next Step Call to Action */}
                                <div className="pt-6 mt-auto">
                                    <Button 
                                        size="lg" 
                                        className="w-full h-14 rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl shadow-primary/20 transition-all active:scale-95 group"
                                        disabled={!isStep1Complete}
                                        onClick={nextStep}
                                    >
                                        Proceed to Options
                                        <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                                    </Button>
                                    <div className="flex items-center justify-center gap-2 mt-4 text-muted-foreground">
                                        <Info className="h-3 w-3" />
                                        <span className="text-[9px] font-bold uppercase tracking-widest">Configuration saves automatically to draft</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {currentStep === 2 && (
                        <div className="flex flex-col items-center justify-center h-full py-20 animate-in fade-in duration-500">
                            <Card className="max-w-xl w-full border-2 border-dashed bg-muted/5 flex flex-col items-center justify-center p-12 text-center gap-6 rounded-3xl">
                                <div className="h-20 w-20 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                                    <Wrench className="h-10 w-10" />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black uppercase tracking-tight">Options & Accessories</h3>
                                    <p className="text-muted-foreground mt-2">Next up: Customizing the {model.name} with consoles, seating, and electronics.</p>
                                </div>
                                <div className="flex gap-4 w-full pt-4">
                                    <Button variant="outline" size="lg" className="flex-1 font-bold" onClick={prevStep}>
                                        <ChevronLeft className="mr-2 h-4 w-4" /> Back
                                    </Button>
                                    <Button size="lg" className="flex-1 font-black uppercase tracking-widest" onClick={nextStep}>
                                        Continue <ChevronRight className="ml-2 h-4 w-4" />
                                    </Button>
                                </div>
                            </Card>
                        </div>
                    )}

                    {currentStep === 3 && (
                        <div className="flex flex-col items-center justify-center h-full py-20 animate-in fade-in duration-500">
                            <Card className="max-w-xl w-full border-2 border-dashed bg-muted/5 flex flex-col items-center justify-center p-12 text-center gap-6 rounded-3xl">
                                <div className="h-20 w-20 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                                    <ClipboardList className="h-10 w-10" />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black uppercase tracking-tight">Review Quote</h3>
                                    <p className="text-muted-foreground mt-2">Final Step: Generate the official proposal for your configuration.</p>
                                </div>
                                <div className="flex gap-4 w-full pt-4">
                                    <Button variant="outline" size="lg" className="flex-1 font-bold" onClick={prevStep}>
                                        <ChevronLeft className="mr-2 h-4 w-4" /> Back
                                    </Button>
                                    <Button size="lg" className="flex-1 font-black uppercase tracking-widest">
                                        Generate Quote <CheckCircle2 className="ml-2 h-4 w-4" />
                                    </Button>
                                </div>
                            </Card>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

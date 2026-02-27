
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc, where, getDocs } from 'firebase/firestore';
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
    Settings2
} from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/currency-utils';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';

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
    
    // Selection State
    const [selectedMaterial, setSelectedMaterial] = useState<'PVC' | 'HYP' | null>(null);
    const [selectedColor, setSelectedColor] = useState<string | null>(null);
    const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
    const [selectedMotor, setSelectedMotor] = useState<any | null>(null);
    const [selectedMotorDataSetId, setSelectedMotorDataSetId] = useState<string | null>(null);

    // 1. Fetch Variants
    const variantsQuery = useMemoFirebase(() => 
        query(collection(firestore, `data-warehouse/${vendor.id}/ranges/${rangeId}/models/${model.id}/variants`), orderBy('order')),
    [firestore, vendor.id, rangeId, model.id]);
    
    const { data: variants, loading: variantsLoading } = useCollection<Variant>(variantsQuery);

    // 2. Fetch Compatible Motors (based on model HP rating)
    const [motors, setMotors] = useState<any[]>([]);
    const [motorsLoading, setMotorsLoading] = useState(false);

    useEffect(() => {
        const fetchMotors = async () => {
            if (currentStep !== 3) return;
            setMotorsLoading(true);
            try {
                // Find the motor brand vendor linked to this module
                const vendorsSnap = await getDocs(collection(firestore, 'data-warehouse'));
                const allVendors = vendorsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
                const allModuleVendorIds = [...(module.associatedVendorIds || []), module.mainVendorId].filter(Boolean);
                const motorVendor = allVendors.find(v => allModuleVendorIds.includes(v.id) && v.vendorType === 'Motor Brand');

                if (motorVendor) {
                    // Find the primary dataset for outboards
                    const dsRef = collection(firestore, 'data-warehouse', motorVendor.id, 'dataSets');
                    const dsSnap = await getDocs(dsRef);
                    const datasets = dsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
                    const targetDS = datasets.find(s => s.name.toLowerCase().includes('outboard') || s.name.toLowerCase().includes('motor')) || datasets[0];
                    
                    if (targetDS) {
                        setSelectedMotorDataSetId(targetDS.id);
                        const rowsRef = collection(firestore, `data-warehouse/${motorVendor.id}/dataSets/${targetDS.id}/rows`);
                        const rowsSnap = await getDocs(rowsRef);
                        const allRows = rowsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
                        
                        // Filter by boat model's recommended HP if possible
                        // For MVP we show all from that dataset
                        setMotors(allRows);
                    }
                }
            } catch (e) {
                console.error("Motor fetch failed", e);
            } finally {
                setMotorsLoading(false);
            }
        };
        fetchMotors();
    }, [currentStep, firestore, module, model]);

    // Data Derivations
    const activeVariant = useMemo(() => {
        if (!selectedColor || !variants) return null;
        return variants.find(v => v.id === selectedColor);
    }, [selectedColor, variants]);

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

        // 1. Filter by SKU compatibility
        let filtered = options.filter((opt: any) => {
            if (!activeVariant) return false;
            // If option has applicableVariantIds, it must include our active variant
            if (opt.applicableVariantIds && opt.applicableVariantIds.length > 0) {
                return opt.applicableVariantIds.includes(activeVariant.id);
            }
            return true;
        });

        // 2. Apply Rule Logic (Exclusions based on selected options)
        selectedOptionIds.forEach(selectedId => {
            const rule = rules.find((r: any) => r.sourceOptionId === selectedId && r.type === 'exclude');
            if (rule) {
                filtered = filtered.filter((opt: any) => !rule.targetOptionIds.includes(opt.id));
            }
        });

        // 3. Apply Rule Logic (Material-based exclusions)
        if (selectedMaterial) {
            rules.forEach((rule: any) => {
                if (rule.sourceType === 'material' && rule.sourceOptionId === selectedMaterial && rule.type === 'exclude') {
                    filtered = filtered.filter((opt: any) => !rule.targetOptionIds.includes(opt.id));
                }
            });
        }

        return filtered;
    }, [model.optionalFeatures, model.rules, activeVariant, selectedOptionIds, selectedMaterial]);

    const groupedOptions = useMemo(() => {
        return factoryOptions.reduce((acc: any, opt: any) => {
            const cat = opt.category || 'General Options';
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(opt);
            return acc;
        }, {});
    }, [factoryOptions]);

    const totalPrice = useMemo(() => {
        let total = activeVariant?.sellPriceExclGst || 0;
        
        // Add Factory Options
        selectedOptionIds.forEach(id => {
            const opt = model.optionalFeatures?.find((f: any) => f.id === id);
            if (opt) total += (opt.sellPriceExclGst || 0);
        });

        // Add Motor & Linked Accessories
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

    // UI Handlers
    const isStep1Complete = !!(selectedMaterial && selectedColor);
    const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, STEPS.length));
    const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

    const toggleOption = (id: string) => {
        setSelectedOptionIds(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

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
            <div className="relative z-20 p-6 flex flex-col items-center gap-6 border-b bg-card/80 backdrop-blur-xl shrink-0 shadow-sm">
                <div className="w-full max-w-7xl flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="h-10 w-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
                            <Ship className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-black uppercase tracking-tight leading-tight">{model.name}</h1>
                            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{vendor.name} • Professional Quote Flow</p>
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
                        Exit Build
                    </Button>
                </div>
            </div>

            {/* Main Workspace */}
            <div className="relative z-10 flex-1 flex overflow-hidden">
                <div className="flex-1 flex flex-col lg:flex-row max-w-full">
                    
                    {/* Fixed Visual Preview Section (Left) */}
                    <div className="w-full lg:w-7/12 h-[40vh] lg:h-full relative bg-muted/5 border-r border-white/5">
                        <div className="absolute inset-0 flex flex-col p-8 md:p-12">
                            <div className="z-20 flex items-center gap-3">
                                <Badge variant="secondary" className="px-4 py-1.5 font-black uppercase tracking-widest text-[10px] shadow-sm bg-background/80 backdrop-blur-sm border-white/20">
                                    Visualizer
                                </Badge>
                                {activeVariant && (
                                    <Badge variant="outline" className="px-4 py-1.5 font-black uppercase tracking-widest text-[10px] bg-primary/10 border-primary/20 text-primary">
                                        {activeVariant.material} Edition
                                    </Badge>
                                )}
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

                            {/* Staged Configuration Summary */}
                            <div className="mt-auto animate-in slide-in-from-bottom-4 duration-500">
                                <div className="bg-background/60 backdrop-blur-xl border border-white/10 p-6 rounded-2xl flex flex-col md:flex-row md:items-end justify-between gap-6 shadow-2xl">
                                    <div className="space-y-4">
                                        <div>
                                            <p className="text-[10px] font-black uppercase text-primary tracking-widest mb-1">Current Build</p>
                                            <h3 className="text-2xl font-black uppercase tracking-tight leading-none">{activeVariant?.name || model.name}</h3>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedOptionIds.length > 0 && <Badge variant="secondary" className="text-[8px] uppercase font-black px-2">{selectedOptionIds.length} Factory Options</Badge>}
                                            {selectedMotor && <Badge variant="secondary" className="text-[8px] uppercase font-black px-2 bg-primary/10 text-primary border-primary/20">{selectedMotor['Model Name']}</Badge>}
                                        </div>
                                    </div>
                                    <div className="text-right">
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

                    {/* Scrollable Config Section (Right) */}
                    <ScrollArea className="w-full lg:w-5/12 h-full bg-background/40 backdrop-blur-md">
                        <div className="p-8 md:p-12 pb-24">
                            {/* Step 1: Base Configuration */}
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
                                                            "group flex flex-col border-2 rounded-2xl overflow-hidden transition-all duration-300 text-left bg-white",
                                                            selectedColor === color.id ? "border-primary ring-2 ring-primary/10 shadow-xl" : "border-border hover:border-primary/20"
                                                        )}
                                                    >
                                                        <div className="relative aspect-video w-full shrink-0 border-b">
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
                                </div>
                            )}

                            {/* Step 2: Factory Options */}
                            {currentStep === 2 && (
                                <div className="space-y-10 animate-in slide-in-from-right-4 duration-500">
                                    <div className="space-y-3">
                                        <h2 className="text-3xl font-black uppercase tracking-tight leading-none">Factory Options</h2>
                                        <p className="text-muted-foreground font-medium text-sm leading-relaxed max-w-md">Customize your Highfield with approved consoles, seating, and technical upgrades.</p>
                                    </div>

                                    <div className="space-y-12">
                                        {Object.entries(groupedOptions).map(([category, options]: [string, any]) => (
                                            <div key={category} className="space-y-5">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-1 w-1 rounded-full bg-primary" />
                                                    <h3 className="text-xs font-black uppercase tracking-widest text-foreground">{category}</h3>
                                                </div>
                                                
                                                <div className="grid gap-3">
                                                    {options.map((opt: any) => {
                                                        const isSelected = selectedOptionIds.includes(opt.id);
                                                        return (
                                                            <button
                                                                key={opt.id}
                                                                onClick={() => toggleOption(opt.id)}
                                                                className={cn(
                                                                    "group flex items-center justify-between p-4 border-2 rounded-2xl transition-all duration-200 text-left",
                                                                    isSelected 
                                                                        ? "bg-primary/5 border-primary shadow-sm" 
                                                                        : "bg-card border-border hover:border-primary/20"
                                                                )}
                                                            >
                                                                <div className="flex items-center gap-4 min-w-0">
                                                                    <div className="h-12 w-12 relative rounded-lg bg-muted/30 border overflow-hidden shrink-0">
                                                                        {opt.imageUrl ? (
                                                                            <Image src={opt.imageUrl} alt={opt.name} fill className="object-cover" unoptimized />
                                                                        ) : (
                                                                            <div className="h-full w-full flex items-center justify-center opacity-10"><Package className="h-5 w-5" /></div>
                                                                        )}
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <p className="text-sm font-black uppercase tracking-tight truncate">{opt.name}</p>
                                                                        {opt.code && <p className="text-[9px] font-mono text-muted-foreground uppercase">{opt.code}</p>}
                                                                    </div>
                                                                </div>
                                                                <div className="text-right shrink-0 ml-4">
                                                                    <p className={cn("text-xs font-black", isSelected ? "text-primary" : "text-foreground")}>
                                                                        +${(opt.sellPriceExclGst || 0).toLocaleString()}
                                                                    </p>
                                                                    {isSelected && <Badge variant="default" className="h-4 text-[8px] font-black uppercase mt-1">Selected</Badge>}
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Step 3: Engine & Rigging */}
                            {currentStep === 3 && (
                                <div className="space-y-10 animate-in slide-in-from-right-4 duration-500">
                                    <div className="space-y-3">
                                        <h2 className="text-3xl font-black uppercase tracking-tight leading-none">Engine & Rigging</h2>
                                        <p className="text-muted-foreground font-medium text-sm leading-relaxed max-w-md">Select a compatible outboard and associated rigging kits.</p>
                                    </div>

                                    {motorsLoading ? (
                                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                                            <Loader2 className="h-10 w-10 animate-spin text-primary" />
                                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Scoping Compatible Motors...</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-6">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-primary">Available Outboards</span>
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
                                                                    <div className="h-16 w-16 relative bg-white rounded-xl border-2 overflow-hidden shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                                                                        {getImageUrl(imgPath) ? <Image src={getImageUrl(imgPath)!} alt="Motor" fill className="object-contain p-1" unoptimized /> : <Ship className="h-6 w-6 m-auto mt-5 opacity-10" />}
                                                                    </div>
                                                                    <div>
                                                                        <Badge variant="outline" className={cn("font-mono text-[9px] font-black mb-1", isSelected ? "border-white/20 text-white" : "border-primary/20 text-primary")}>
                                                                            {motor['HP Rating'] || 'ENGINE'}
                                                                        </Badge>
                                                                        <p className="text-sm font-black uppercase tracking-tight leading-tight">{motor['Model Name']}</p>
                                                                        <p className={cn("text-[9px] font-bold mt-1 opacity-60 uppercase", isSelected ? "text-white" : "text-muted-foreground")}>{motor['Part Number']}</p>
                                                                    </div>
                                                                </div>
                                                                <div className="text-right">
                                                                    <p className="text-sm font-black">${(motor.sellPriceExclGst || 0).toLocaleString()}</p>
                                                                    {isSelected && <CheckCircle2 className="h-5 w-5 text-white ml-auto mt-2" />}
                                                                </div>
                                                            </button>

                                                            {/* Linked Accessories Preview */}
                                                            {isSelected && motor.masterAccessories && (
                                                                <div className="p-5 bg-muted/10 border-2 border-dashed rounded-2xl space-y-4 animate-in slide-in-from-top-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <Wrench className="h-3 w-3 text-primary" />
                                                                        <span className="text-[10px] font-black uppercase tracking-widest">Included Factory Rigging</span>
                                                                    </div>
                                                                    <div className="space-y-2">
                                                                        {motor.masterAccessories.map((acc: any, i: number) => (
                                                                            <div key={i} className="flex items-center justify-between text-[11px] font-medium p-2 bg-background/50 rounded-lg border">
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

                            {/* Persistent Footer Call to Action */}
                            <div className="pt-16 sticky bottom-0 bg-gradient-to-t from-background via-background to-transparent pb-4 mt-auto">
                                <div className="flex gap-3">
                                    {currentStep > 1 && (
                                        <Button variant="outline" size="lg" className="h-14 w-20 rounded-2xl border-2" onClick={prevStep}>
                                            <ChevronLeft className="h-5 w-5" />
                                        </Button>
                                    )}
                                    <Button 
                                        size="lg" 
                                        className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl shadow-primary/20 transition-all active:scale-95 group"
                                        disabled={currentStep === 1 && !isStep1Complete}
                                        onClick={nextStep}
                                    >
                                        {currentStep === STEPS.length ? 'Finalize Quote' : `Next: ${STEPS[currentStep].label}`}
                                        <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                                    </Button>
                                </div>
                                <div className="flex items-center justify-center gap-2 mt-4 text-muted-foreground">
                                    <ShieldCheck className="h-3 w-3" />
                                    <span className="text-[8px] font-bold uppercase tracking-widest">Pricing accurate as of {new Date().toLocaleDateString()}</span>
                                </div>
                            </div>
                        </div>
                    </ScrollArea>
                </div>
            </div>
        </div>
    );
}

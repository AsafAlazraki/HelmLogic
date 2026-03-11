'use client';

import { useMemo, useState, useEffect } from 'react';
import { useCollection, useMemoFirebase, useFirestore, useUser, useDoc } from '@/firebase';
import { collection, query, doc, getDocs, orderBy, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertCircle, Star, PlusCircle, Package, Check, X, Ship, ChevronDown, ChevronRight, Settings2, Maximize2, Minimize2, Beaker, Zap, Wrench, Anchor, Save } from 'lucide-react';
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { Accordion, AccordionContent, AccordionItem } from '@/components/ui/accordion';
import Image from 'next/image';
import { Button } from './ui/button';
import { useFormContext } from 'react-hook-form';
import { MasterDataBrowserDialog } from './master-data-browser-dialog';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

interface Vendor {
    id: string;
    name: string;
    vendorType: string;
    logoUrl?: string;
    slug?: string;
}

interface Motor {
    id: string;
    SummaryImage?: string;
    'HP Rating'?: string;
    masterAccessories?: any[];
    steeringType?: 'Tiller' | 'Forward Control';
    [key: string]: any;
}

interface EngineSpec {
    label: string;
    minHp: number;
    maxHp: number;
    recommendedHp: number;
}

interface MotorConfig {
    type: string;
    engines: EngineSpec[];
}

interface Organisation {
    id: string;
    name: string;
    dataWarehouseSubscriptions?: string[];
}

const formatConfigType = (type: string) => {
    const label = type.replace(/([A-Z])/g, ' $1').trim();
    if (label === 'Single') return 'Single Engine';
    return label;
};

const parseHpRating = (rating?: any): { count: number, hp: number } | null => {
    if (!rating) return null;
    const str = String(rating).toLowerCase().trim();
    
    const twinMatch = str.match(/^(\d+)\s*x\s*(\d+)/);
    if (twinMatch) {
        return { count: parseInt(twinMatch[1]), hp: parseInt(twinMatch[2]) };
    }
    
    const singleMatch = str.match(/^(\d+)/);
    if (singleMatch) {
        return { count: 1, hp: parseInt(singleMatch[1]) };
    }
    
    return null;
};

function AccessoryCategory({ 
    label, 
    items = [], 
    onAdd, 
    onRemove,
    onToggleStandard
}: { 
    label: string, 
    items: any[], 
    onAdd: () => void, 
    onRemove: (idx: number) => void,
    onToggleStandard: (idx: number) => void
}) {
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between group/cat">
                <div className="flex items-center gap-1.5">
                    <div className="h-1 w-1 rounded-full bg-primary/40" />
                    <span className="text-[9px] font-black uppercase text-muted-foreground/70 tracking-widest">{label}</span>
                </div>
                <Button 
                    type="button"
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6 rounded-full hover:bg-primary/10 text-primary transition-all opacity-40 group-hover/cat:opacity-100"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAdd(); }}
                >
                    <PlusCircle className="h-3.5 w-3.5" />
                </Button>
            </div>
            
            <div className="space-y-1 min-h-[32px]">
                {items.length > 0 ? items.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-background border shadow-sm group/opt animate-in fade-in slide-in-from-left-1">
                        <Package className="h-3 w-3 text-primary/40 shrink-0" />
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                            <span className="text-[10px] font-bold truncate leading-tight">{opt.name}</span>
                            {opt.isStandard && (
                                <Badge className="bg-emerald-500 text-white border-none text-[7px] font-black h-3.5 px-1 tracking-tighter shrink-0">STANDARD</Badge>
                            )}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover/opt:opacity-100 transition-opacity">
                            <Button 
                                type="button" 
                                variant="ghost" 
                                size="icon" 
                                className={cn("h-5 w-5 rounded-md", opt.isStandard ? "text-emerald-600 bg-emerald-50" : "text-slate-300")}
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleStandard(i); }}
                                title="Toggle Standard"
                            >
                                <Star className={cn("h-3 w-3", opt.isStandard && "fill-current")} />
                            </Button>
                            <Button 
                                type="button" 
                                variant="ghost" 
                                size="icon" 
                                className="h-5 w-5 text-destructive hover:bg-destructive/10"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(i); }}
                            >
                                <X className="h-3 w-3" />
                            </Button>
                        </div>
                    </div>
                )) : (
                    <div className="py-3 border border-dashed rounded-lg flex items-center justify-center text-[8px] text-muted-foreground/30 uppercase font-black tracking-widest bg-muted/5">
                        None Linked
                    </div>
                )}
            </div>
        </div>
    );
}

function MotorCard({ 
    motor, 
    vendorId,
    dataSetId,
    onAddOption,
    onRemoveOption,
    onToggleStandard,
    onHide
}: { 
    motor: Motor, 
    vendorId: string,
    dataSetId: string,
    onAddOption: (cat: string) => void,
    onRemoveOption: (index: number) => void,
    onToggleStandard: (index: number) => void,
    onHide: () => void
}) {
    const [isExpanded, setIsExpanded] = useState(false);
    const firestore = useFirestore();
    const { toast } = useToast();

    let itemImageUrl: string | null = null;
    if (motor.SummaryImage && typeof motor.SummaryImage === 'string') {
        const path = motor.SummaryImage.trim().replace(/\\/g, '/');
        if (path) {
            const cleanPath = path.startsWith('/') ? path : `/${path}`;
            itemImageUrl = `https://www.yamaha-motor.com.au${cleanPath}`;
        }
    }

    const allKeys = Object.keys(motor);
    const normalize = (s: string) => String(s || '').toLowerCase().replace(/[\s_-]/g, '');
    const findKey = (potentials: string[]) => {
        const normalizedPotentials = potentials.map(normalize);
        const matchingKey = allKeys.find(key => normalizedPotentials.includes(normalize(key)));
        return matchingKey;
    };
    
    const modelNameKey = findKey(['Model Name', 'ModelName', 'Model', 'Description', 'name']);
    const modelName = modelNameKey ? motor[modelNameKey] : 'Unknown Motor';
    const hpRating = motor['HP Rating'];

    const masterAccessories = motor.masterAccessories || [];
    const categorized = {
        Propeller: masterAccessories.filter(o => o.category === 'Propeller'),
        Rigging: masterAccessories.filter(o => o.category === 'Rigging'),
        Other: masterAccessories.filter(o => !o.category || o.category === 'Other')
    };

    const handleSteeringTypeChange = (type: string) => {
        const motorRef = doc(firestore, `data-warehouse/${vendorId}/dataSets/${dataSetId}/rows`, motor.id);
        const updateData = { steeringType: type };
        
        updateDoc(motorRef, updateData)
            .catch(async (serverError) => {
                const permissionError = new FirestorePermissionError({
                    path: motorRef.path,
                    operation: 'update',
                    requestResourceData: updateData,
                } satisfies SecurityRuleContext);
                errorEmitter.emit('permission-error', permissionError);
            });
    };

    return (
        <Card className="overflow-hidden flex flex-col border-2 shadow-sm hover:border-primary/20 transition-all rounded-xl h-fit min-w-0 max-w-full bg-card group/motor">
            <div 
                className="relative cursor-pointer"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="relative h-32 bg-muted/30 border-b flex items-center justify-center">
                    {itemImageUrl ? (
                        <Image 
                            src={itemImageUrl} 
                            alt={String(modelName)} 
                            fill 
                            className="object-contain p-2 group-hover/motor:scale-105 transition-transform" 
                            sizes="300px"
                            unoptimized
                        />
                    ) : (
                        <div className="text-muted-foreground/10">
                            <Ship className="w-10 h-10"/>
                        </div>
                    )}
                    <div className="absolute top-2 right-2 opacity-0 group-hover/motor:opacity-100 transition-opacity flex items-center gap-1">
                        <Button 
                            type="button"
                            variant="destructive" 
                            size="icon" 
                            className="h-6 w-6 rounded-full shadow-lg"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onHide(); }}
                        >
                            <X className="h-3 w-3" />
                        </Button>
                    </div>
                    {hpRating && !isExpanded && (
                        <Badge variant="default" className="absolute bottom-2 left-2 font-black text-[8px] bg-primary shadow-sm uppercase tracking-tighter px-1.5 py-0">
                            {hpRating} HP
                        </Badge>
                    )}
                </div>
                
                <div className="p-4 bg-background flex items-center justify-between gap-3 border-b min-h-[56px]">
                    <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black uppercase leading-tight text-foreground tracking-tight truncate italic">
                            {motor.vendorName || 'YAMAHA'} - {String(modelName)}
                        </p>
                        {motor.steeringType && (
                            <div className="flex items-center gap-1 mt-1">
                                <Anchor className="h-2 w-2 text-primary" />
                                <span className="text-[7px] font-black uppercase tracking-widest text-primary">{motor.steeringType}</span>
                            </div>
                        )}
                    </div>
                    <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", isExpanded && "rotate-180")} />
                </div>
            </div>
            
            {isExpanded && (
                <CardContent className="p-4 space-y-5 min-w-0 animate-in slide-in-from-top-2 duration-200">
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            {hpRating && (
                                <Badge variant="default" className="font-black text-[10px] bg-primary shadow-sm uppercase tracking-tighter shrink-0 px-2 py-0.5">
                                    {hpRating} HP
                                </Badge>
                            )}
                            <Badge variant="secondary" className="font-mono text-[9px] font-bold opacity-60">
                                {motor.id.slice(-6).toUpperCase()}
                            </Badge>
                        </div>
                        
                        <div className="space-y-1.5">
                            <Label className="text-[8px] font-black uppercase tracking-widest text-muted-foreground ml-1">Building Profile (Steering)</Label>
                            <Select value={motor.steeringType || ''} onValueChange={handleSteeringTypeChange}>
                                <SelectTrigger className="h-8 text-[9px] font-black uppercase tracking-widest border-2 rounded-lg bg-slate-50">
                                    <SelectValue placeholder="SET PROFILE..." />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-2">
                                    <SelectItem value="Tiller" className="text-[10px] font-bold uppercase py-2">Tiller Control</SelectItem>
                                    <SelectItem value="Forward Control" className="text-[10px] font-bold uppercase py-2">Forward Control</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-5 pt-4 border-t border-dashed">
                        <AccessoryCategory 
                            label="Propeller" 
                            items={categorized.Propeller} 
                            onAdd={() => onAddOption('Propeller')}
                            onToggleStandard={(idx) => {
                                const actualIdx = masterAccessories.findIndex(o => o === categorized.Propeller[idx]);
                                onToggleStandard(actualIdx);
                            }}
                            onRemove={(idx) => {
                                const actualIdx = masterAccessories.findIndex(o => o === categorized.Propeller[idx]);
                                onRemoveOption(actualIdx);
                            }}
                        />
                        <AccessoryCategory 
                            label="Rigging" 
                            items={categorized.Rigging} 
                            onAdd={() => onAddOption('Rigging')}
                            onToggleStandard={(idx) => {
                                const actualIdx = masterAccessories.findIndex(o => o === categorized.Rigging[idx]);
                                onToggleStandard(actualIdx);
                            }}
                            onRemove={(idx) => {
                                const actualIdx = masterAccessories.findIndex(o => o === categorized.Rigging[idx]);
                                onRemoveOption(actualIdx);
                            }}
                        />
                        <AccessoryCategory 
                            label="Other Parts" 
                            items={categorized.Other} 
                            onAdd={() => onAddOption('Other')}
                            onToggleStandard={(idx) => {
                                const actualIdx = masterAccessories.findIndex(o => o === categorized.Other[idx]);
                                onToggleStandard(actualIdx);
                            }}
                            onRemove={(idx) => {
                                const actualIdx = masterAccessories.findIndex(o => o === categorized.Other[idx]);
                                onRemoveOption(actualIdx);
                            }}
                        />
                    </div>
                </CardContent>
            )}
        </Card>
    );
}

export function MotorOptions({ model, module }: { model: any, module: any }) {
    const { watch, setValue } = useFormContext();
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();

    const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
    const { data: userProfile } = useDoc<any>(userProfileRef);
    
    const vendorsQuery = useMemoFirebase(() => collection(firestore, 'data-warehouse'), [firestore]);
    const { data: allVendors, loading: vendorsLoading } = useCollection<Vendor>(vendorsQuery);
    
    const motorConfigurations = watch('specifications.motorConfigurations') || model.specifications?.motorConfigurations || [];
    const motorOverrides = watch('motorOverrides') || {};

    const motorVendor = useMemo(() => {
        if (!allVendors || !module) return null;
        const allModuleVendorIds = [...(module.associatedVendorIds || []), module.mainVendorId].filter(Boolean);
        return allVendors.find(v => allModuleVendorIds.includes(v.id) && v.vendorType === 'Motor Brand');
    }, [allVendors, module]);

    const [targetDataSet, setTargetDataSet] = useState<any>(null);
    useEffect(() => {
        const findDataSet = async () => {
            if (!motorVendor) return;
            try {
                const dsRef = collection(firestore, 'data-warehouse', motorVendor.id, 'dataSets');
                const dsSnap = await getDocs(dsRef);
                const datasets = dsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                
                const preferred = datasets.find((s: any) => 
                    s.name.toLowerCase().includes('yamaha outboards') ||
                    s.name.toLowerCase().includes('outboard') || 
                    s.name.toLowerCase().includes('motor') ||
                    s.name.toLowerCase().includes('engine')
                ) || datasets[0];
                
                setTargetDataSet(preferred);
            } catch (e) { console.error(e); }
        };
        findDataSet();
    }, [motorVendor, firestore]);

    const motorDataSetQuery = useMemoFirebase(() => {
        if (!motorVendor) return null;
        if (targetDataSet) {
            return collection(firestore, 'data-warehouse', motorVendor.id, 'dataSets', targetDataSet.id, 'rows');
        }
        return collection(firestore, 'data-warehouse', motorVendor.id, 'masterDataSet');
    }, [firestore, motorVendor, targetDataSet]);

    const { data: motorDataSet, loading: motorsLoading } = useCollection<Motor>(motorDataSetQuery);

    const [isBrowserOpen, setIsBrowserOpen] = useState(false);
    const [activeMotorId, setActiveMotorId] = useState<string | null>(null);
    const [activeCategory, setActiveCategory] = useState('Other');
    const [isEngineManagerOpen, setIsEngineManagerOpen] = useState(false);
    const [activeConfigType, setActiveConfigType] = useState<string | null>(null);
    const [isSeeding, setIsSeeding] = useState(false);

    const dummyOrg: Organisation = {
        id: 'config-context',
        name: 'Configuration Manager',
        dataWarehouseSubscriptions: [
            ...(module.associatedVendorIds || []),
            module.mainVendorId
        ]
    };

    const handleSeedTestData = async () => {
        const isAdmin = userProfile?.appRole === 'HelmLogic Admin';
        if (!isAdmin) {
            toast({ variant: 'destructive', title: "Access Denied", description: "Only HelmLogic Administrators can inject master data." });
            return;
        }

        if (!motorDataSet || !motorVendor || !targetDataSet || !model.id) {
            toast({ variant: 'destructive', title: "Context Error", description: "Datasets or Model identity not yet synchronized." });
            return;
        }
        
        setIsSeeding(true);
        try {
            const targetMotor = motorDataSet.find(m => String(m['Model Name']).includes('F25SMHC')) || motorDataSet[0];
            if (targetMotor) {
                const motorRef = doc(firestore, `data-warehouse/${motorVendor.id}/dataSets/${targetDataSet.id}/rows`, targetMotor.id);
                const testAccs = [
                    { id: 'test-prop-1', name: 'Aluminum Propeller 11 1/8 x 13-G', category: 'Propeller', isStandard: true, items: [] },
                    { id: 'test-rig-1', name: 'Mech Rigging Kit - 703 Remote Control', category: 'Rigging', isStandard: false, items: [] }
                ];
                await updateDoc(motorRef, { masterAccessories: [...(targetMotor.masterAccessories || []), ...testAccs] });
            }

            const currentOptions = watch('optionalFeatures') || model.optionalFeatures || [];
            const testOptions = [
                { id: 'test-factory-1', name: 'Motor Ram Support', category: 'General Options', sellPriceExclGst: 150, isStandard: false, applicableVariantIds: [] },
                { id: 'test-factory-2', name: 'Fuel Filter', category: 'General Options', sellPriceExclGst: 85, isStandard: false, applicableVariantIds: [] }
            ];
            
            const mergedOptions = [...currentOptions];
            testOptions.forEach(opt => {
                if (!mergedOptions.some(o => o.name === opt.name)) mergedOptions.push(opt);
            });

            setValue('optionalFeatures', mergedOptions, { shouldDirty: true });
            toast({ title: "Tactical Data Injected", description: "Hardcoded motor accessories and factory options are now staged." });
        } catch (e: any) {
            console.error("Generator failed:", e);
            toast({ variant: 'destructive', title: "Generator Failed", description: e.message || "An unexpected error occurred." });
        } finally {
            setIsSeeding(false);
        }
    };

    const motorCombinations = useMemo(() => {
        if (!motorDataSet || motorConfigurations.length === 0 || !motorVendor) return [];

        return motorConfigurations.map((config: MotorConfig) => {
            let baseMotors: Motor[] = [];
            const overrides = motorOverrides[config.type] || { hiddenIds: [], manualIds: [] };
            
            if (config.type === 'Twin') {
                baseMotors = motorDataSet.filter(motor => {
                    const parsed = parseHpRating(motor['HP Rating']);
                    if (!parsed || parsed.count !== 2) return false;
                    const spec = config.engines[0];
                    const min = Number(spec.minHp || 0);
                    const max = Number(spec.maxHp || 0);
                    if (max > 0) return parsed.hp >= min && parsed.hp <= max;
                    return parsed.hp >= min;
                });
            } else if (config.type === 'Single') {
                baseMotors = motorDataSet.filter(motor => {
                    const parsed = parseHpRating(motor['HP Rating']);
                    if (!parsed || parsed.count !== 1) return false;
                    const spec = config.engines[0];
                    const min = Number(spec.minHp || 0);
                    const max = Number(spec.maxHp || 0);
                    if (max > 0) return parsed.hp >= min && parsed.hp <= max;
                    return parsed.hp >= min;
                });
            } else {
                const engineCountMap: Record<string, number> = { 'Triple': 3, 'Quad': 4, 'SingleWithAux': 2 };
                const targetCount = engineCountMap[config.type] || 1;
                baseMotors = motorDataSet.filter(motor => {
                    const parsed = parseHpRating(motor['HP Rating']);
                    if (!parsed) return false;
                    return parsed.count === targetCount;
                });
            }

            const manualMotors = motorDataSet.filter(m => overrides.manualIds.includes(m.id));
            const allPossible = [...new Map([...baseMotors, ...manualMotors].map(m => [m.id, { ...m, vendorName: motorVendor.name }])).values()];
            const visibleMotors = allPossible.filter(m => !overrides.hiddenIds.includes(m.id));
            
            return { configType: config.type, combinations: visibleMotors.map(m => [m]) };
        }).filter(c => c.combinations.length > 0);

    }, [motorDataSet, motorConfigurations, motorVendor, motorOverrides]);

    const handleAddOptionToMotor = (motorId: string, category: string) => {
        setActiveMotorId(motorId);
        setActiveCategory(category);
        setIsBrowserOpen(true);
    };

    const handleToggleStandard = (motorId: string, optionIndex: number) => {
        if (!motorVendor || !targetDataSet) return;
        const motorDoc = motorDataSet?.find(m => m.id === motorId);
        if (!motorDoc) return;

        const motorRef = doc(firestore, `data-warehouse/${motorVendor.id}/dataSets/${targetDataSet.id}/rows`, motorId);
        const currentAccessories = [...(motorDoc.masterAccessories || [])];
        const item = { ...currentAccessories[optionIndex] };
        item.isStandard = !item.isStandard;
        currentAccessories[optionIndex] = item;
        
        updateDoc(motorRef, { masterAccessories: currentAccessories })
            .catch(async (serverError) => {
                const permissionError = new FirestorePermissionError({
                    path: motorRef.path,
                    operation: 'update',
                    requestResourceData: { masterAccessories: currentAccessories },
                } satisfies SecurityRuleContext);
                errorEmitter.emit('permission-error', permissionError);
            });
    };

    const handleRemoveOption = (motorId: string, optionIndex: number) => {
        if (!motorVendor || !targetDataSet) return;
        const motorDoc = motorDataSet?.find(m => m.id === motorId);
        if (!motorDoc) return;

        const motorRef = doc(firestore, `data-warehouse/${motorVendor.id}/dataSets/${targetDataSet.id}/rows`, motorId);
        const currentAccessories = motorDoc.masterAccessories || [];
        const newAccessories = currentAccessories.filter((_: any, i: number) => i !== optionIndex);
        
        updateDoc(motorRef, { masterAccessories: newAccessories })
            .catch(async (serverError) => {
                const permissionError = new FirestorePermissionError({
                    path: motorRef.path,
                    operation: 'update',
                    requestResourceData: { masterAccessories: newAccessories },
                } satisfies SecurityRuleContext);
                errorEmitter.emit('permission-error', permissionError);
            });
    };

    const handleHideMotor = (configType: string, motorId: string) => {
        const current = motorOverrides[configType] || { hiddenIds: [], manualIds: [] };
        const newHidden = [...new Set([...current.hiddenIds, motorId])];
        setValue('motorOverrides', { ...motorOverrides, [configType]: { ...current, hiddenIds: newHidden } }, { shouldDirty: true });
        toast({ title: "Motor Hidden" });
    };

    const handleAddManualEngine = (selection: any) => {
        if (!activeConfigType) return;
        const current = motorOverrides[activeConfigType] || { hiddenIds: [], manualIds: [] };
        const newManualIds = [...new Set([...current.manualIds, ...selection.items.map((i: any) => i.rowId)])];
        const newHidden = current.hiddenIds.filter(id => !newManualIds.includes(id));
        setValue('motorOverrides', { ...motorOverrides, [activeConfigType]: { hiddenIds: newHidden, manualIds: newManualIds } }, { shouldDirty: true });
        setIsEngineManagerOpen(false);
        setActiveConfigType(null);
        toast({ title: "Engine Added" });
    };

    const handleSaveOption = (selection: any) => {
        if (!activeMotorId || !motorVendor || !targetDataSet) return;
        const motorDoc = motorDataSet?.find(m => m.id === activeMotorId);
        if (!motorDoc) return;

        const motorRef = doc(firestore, `data-warehouse/${motorVendor.id}/dataSets/${targetDataSet.id}/rows`, activeMotorId);
        const currentAccessories = motorDoc.masterAccessories || [];
        const newEntry = { id: `acc-${Date.now()}`, name: selection.name, category: activeCategory, items: selection.items, isStandard: false };
        
        updateDoc(motorRef, { masterAccessories: [...currentAccessories, newEntry] })
            .then(() => {
                toast({ title: "Master Accessory Linked" });
                setIsBrowserOpen(false);
                setActiveMotorId(null);
            })
            .catch(async (serverError) => {
                const permissionError = new FirestorePermissionError({
                    path: motorRef.path,
                    operation: 'update',
                    requestResourceData: { masterAccessories: [...currentAccessories, newEntry] },
                } satisfies SecurityRuleContext);
                errorEmitter.emit('permission-error', permissionError);
            });
    };

    const loading = vendorsLoading || motorsLoading;

    if (loading) return <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

    const currentStagedEngines = (configType: string) => {
        const overrides = motorOverrides[configType] || { manualIds: [] };
        if (!motorDataSet) return [];
        return motorDataSet.filter(m => overrides.manualIds.includes(m.id)).map(m => ({ vendorId: motorVendor?.id || '', vendorName: motorVendor?.name || '', row: m }));
    };

    return (
        <div className="space-y-6">
            <Card className="border-primary/20 bg-primary/5 shadow-inner rounded-xl overflow-hidden">
                <CardHeader className="py-4 border-b bg-white/50 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center text-primary"><Beaker className="h-5 w-5" /></div>
                        <div>
                            <CardTitle className="text-sm font-black uppercase italic tracking-tight">Tactical Data Injector</CardTitle>
                            <CardDescription className="text-[9px] font-black uppercase tracking-widest text-primary/60">Prototype Environment Accelerator</CardDescription>
                        </div>
                    </div>
                    <Button type="button" onClick={handleSeedTestData} disabled={isSeeding} className="h-9 px-6 font-black uppercase text-[10px] tracking-widest bg-primary shadow-xl">
                        {isSeeding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
                        Inject Build Data
                    </Button>
                </CardHeader>
            </Card>

            <Card className="rounded-xl border shadow-sm overflow-hidden bg-background">
                <CardHeader className="bg-muted/10 border-b">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-xl font-bold">Compatible Motor Configurations</CardTitle>
                            <CardDescription className="text-[10px] uppercase font-black tracking-widest opacity-60">Configurations matching the boat's horsepower and quantity ratings.</CardDescription>
                        </div>
                        {motorVendor?.logoUrl && (
                            <div className="bg-white border rounded-lg p-2 shadow-sm">
                                <Image src={motorVendor.logoUrl} alt={motorVendor.name} width={100} height={32} className="object-contain" unoptimized />
                            </div>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="pt-6">
                    {motorCombinations.length > 0 ? (
                        <Accordion type="multiple" className="w-full space-y-4" defaultValue={['config-0']}>
                            {motorCombinations.map((configGroup, index) => (
                                <AccordionItem value={`config-${index}`} key={configGroup.configType} className="border rounded-xl overflow-hidden shadow-sm bg-background">
                                    <div className="flex border-b bg-muted/20 hover:bg-muted/30 transition-colors group/trigger items-center justify-between pr-6">
                                        <AccordionPrimitive.Header className="flex flex-1">
                                            <AccordionPrimitive.Trigger className="flex flex-1 items-center justify-between px-6 py-4 font-medium transition-all hover:no-underline [&[data-state=open]>svg]:rotate-180 text-left">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-8 w-8 bg-primary/10 rounded-full flex items-center justify-center text-primary"><Star className="h-4 w-4" /></div>
                                                    <div>
                                                        <p className="font-black text-xs uppercase tracking-widest">{formatConfigType(configGroup.configType)} Layout</p>
                                                        <p className="text-[9px] font-bold text-muted-foreground uppercase opacity-60">{configGroup.combinations.length} Variations Available</p>
                                                    </div>
                                                </div>
                                                <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
                                            </AccordionPrimitive.Trigger>
                                        </AccordionPrimitive.Header>
                                        <Button type="button" variant="outline" size="sm" className="h-8 text-[10px] font-black uppercase tracking-widest transition-opacity" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveConfigType(configGroup.configType); setIsEngineManagerOpen(true); }}><Settings2 className="h-3 w-3 mr-1.5" />Manage Engines</Button>
                                    </div>
                                    <AccordionContent className="p-0">
                                        <ScrollArea className="h-[600px] w-full">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-6">
                                                {configGroup.combinations.map((combo, comboIdx) => (
                                                    <div key={comboIdx} className="relative group/combo h-full">
                                                        {combo.map((motor, motorIdx) => (
                                                            <MotorCard 
                                                                key={`${motor.id}-${motorIdx}`} 
                                                                motor={motor} 
                                                                vendorId={motorVendor!.id}
                                                                dataSetId={targetDataSet!.id}
                                                                onAddOption={(cat) => handleAddOptionToMotor(motor.id, cat)}
                                                                onToggleStandard={(idx) => handleToggleStandard(motor.id, idx)}
                                                                onRemoveOption={(idx) => handleRemoveOption(motor.id, idx)}
                                                                onHide={() => handleHideMotor(configGroup.configType, motor.id)}
                                                            />
                                                        ))}
                                                    </div>
                                                ))}
                                            </div>
                                        </ScrollArea>
                                    </AccordionContent>
                                </AccordionItem>
                            ))}
                        </Accordion>
                    ) : (
                        <div className="py-20 text-center flex flex-col items-center gap-4 bg-muted/5 rounded-2xl border-2 border-dashed border-muted-foreground/20">
                            <AlertCircle className="h-12 w-12 text-muted-foreground opacity-20" />
                            <div className="max-w-xs mx-auto">
                                <p className="text-sm font-black uppercase tracking-widest">No Motor Matches Found</p>
                                <p className="text-[10px] text-muted-foreground/60 mt-2 leading-relaxed uppercase font-bold">Adjust the boat's ratings or use the engine manager to add motors manually.</p>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <MasterDataBrowserDialog 
                isOpen={isBrowserOpen}
                onClose={() => setIsBrowserOpen(false)}
                organisation={dummyOrg as any}
                categoryId="motor-factory-options"
                initialCategory={activeCategory}
                onSave={handleSaveOption}
                title="Motor Factory Options"
                description={`Browse rigging and accessories for ${activeMotorId?.slice(-6).toUpperCase()}.`}
                initialVendorId={motorVendor?.id}
            />

            <MasterDataBrowserDialog 
                isOpen={isEngineManagerOpen}
                onClose={() => { setIsEngineManagerOpen(false); setActiveConfigType(null); }}
                organisation={dummyOrg as any}
                categoryId="manual-engines"
                onSave={handleAddManualEngine}
                title={`Manage Engines: ${formatConfigType(activeConfigType || '')}`}
                description="Search the catalog to manually add compatible engines."
                initialVendorId={motorVendor?.id}
                initialStagedItems={activeConfigType ? currentStagedEngines(activeConfigType) : []}
            />
        </div>
    );
}

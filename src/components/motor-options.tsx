
'use client';

import { useMemo, useState, useEffect } from 'react';
import { useCollection, useMemoFirebase, useFirestore } from '@/firebase';
import { collection, query, doc, getDocs, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertCircle, Star, PlusCircle, Settings2, Package, Check, X, ShieldCheck, Ship, ChevronRight } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import Image from 'next/image';
import { Button } from './ui/button';
import { useFormContext } from 'react-hook-form';
import { MasterDataBrowserDialog } from './master-data-browser-dialog';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

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
    return type.replace(/([A-Z])/g, ' $1').trim();
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
    onRemove 
}: { 
    label: string, 
    items: any[], 
    onAdd: () => void, 
    onRemove: (idx: number) => void 
}) {
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between group/cat">
                <div className="flex items-center gap-1.5">
                    <div className="h-1 w-1 rounded-full bg-primary/40" />
                    <span className="text-[9px] font-black uppercase text-muted-foreground/70 tracking-widest">{label}</span>
                </div>
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6 rounded-full hover:bg-primary/10 text-primary transition-all opacity-40 group-hover/cat:opacity-100"
                    onClick={(e) => { e.stopPropagation(); onAdd(); }}
                >
                    <PlusCircle className="h-3.5 w-3.5" />
                </Button>
            </div>
            
            <div className="space-y-1 min-h-[32px]">
                {items.length > 0 ? items.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-background border shadow-sm group/opt animate-in fade-in slide-in-from-left-1">
                        <Package className="h-3 w-3 text-primary/40 shrink-0" />
                        <span className="text-[10px] font-bold truncate flex-1 leading-tight">{opt.name}</span>
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-5 w-5 text-destructive hover:bg-destructive/10 opacity-0 group-hover/opt:opacity-100 transition-opacity"
                            onClick={(e) => { e.stopPropagation(); onRemove(i); }}
                        >
                            <X className="h-3 w-3" />
                        </Button>
                    </div>
                )) : (
                    <div className="py-3 border border-dashed rounded-lg flex items-center justify-center text-[8px] text-muted-foreground/30 uppercase font-black tracking-widest">
                        None Linked
                    </div>
                )}
            </div>
        </div>
    );
}

function MotorCard({ 
    motor, 
    onAddOption,
    options = [],
    onRemoveOption
}: { 
    motor: Motor, 
    onAddOption: (cat: string) => void,
    options?: any[],
    onRemoveOption: (index: number) => void
}) {
    let itemImageUrl: string | null = null;
    if (motor.SummaryImage && typeof motor.SummaryImage === 'string') {
        const path = motor.SummaryImage.trim().replace(/\\/g, '');
        if (path) {
            const cleanPath = path.startsWith('/') ? path : `/${path}`;
            itemImageUrl = `https://www.yamaha-motor.com.au${cleanPath}`;
        }
    }

    const allKeys = Object.keys(motor);
    const normalize = (s: string) => String(s || '').toLowerCase().replace(/[\s_-]/g, '');
    const findKey = (potentials: string[]) => {
        const normalizedPotentials = potentials.map(normalize);
        for (const key of allKeys) {
            if (normalizedPotentials.includes(normalize(key))) {
                return key;
            }
        }
        return undefined;
    };
    const modelNameKey = findKey(['Model Name', 'ModelName', 'name']);
    const modelName = modelNameKey ? motor[modelNameKey] : 'Unknown Motor';
    const hpRating = motor['HP Rating'];

    const categorized = {
        Propeller: options.filter(o => o.category === 'Propeller'),
        Rigging: options.filter(o => o.category === 'Rigging'),
        Other: options.filter(o => !o.category || o.category === 'Other')
    };

    return (
        <Card className="overflow-hidden flex flex-col border-2 shadow-sm hover:border-primary/20 transition-all rounded-xl h-full min-w-0 max-w-full">
            <div className="relative h-32 bg-muted/30 shrink-0 border-b">
                 {itemImageUrl ? (
                    <Image 
                        src={itemImageUrl} 
                        alt={String(modelName)} 
                        fill 
                        className="object-contain p-3" 
                        sizes="300px"
                        unoptimized
                    />
                ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground/10">
                        <Ship className="w-10 h-10"/>
                    </div>
                )}
                {hpRating && (
                    <div className="absolute top-2 left-2">
                        <Badge variant="default" className="font-black text-[9px] bg-primary shadow-md uppercase tracking-tighter px-2">
                            {hpRating} HP
                        </Badge>
                    </div>
                )}
                <div className="absolute bottom-2 right-2">
                    <Badge variant="secondary" className="font-mono text-[9px] font-bold bg-background/90 backdrop-blur-md border shadow-sm px-1.5">
                        {motor.id.slice(-6).toUpperCase()}
                    </Badge>
                </div>
            </div>
            
            <CardContent className="p-4 flex-1 flex flex-col gap-5 min-w-0">
                <div className="min-w-0">
                    <p className="text-[12px] font-black uppercase leading-[1.3] text-foreground tracking-tight break-words">{String(modelName)}</p>
                    {motor['Part Number'] && (
                        <div className="flex items-center gap-1.5 mt-1.5 opacity-60">
                            <span className="text-[8px] font-black uppercase text-muted-foreground tracking-widest">Serial:</span>
                            <span className="text-[9px] font-mono font-bold text-primary uppercase">{motor['Part Number']}</span>
                        </div>
                    )}
                </div>

                <div className="space-y-5 mt-auto pt-4 border-t border-dashed">
                    <AccessoryCategory 
                        label="Propeller" 
                        items={categorized.Propeller} 
                        onAdd={() => onAddOption('Propeller')}
                        onRemove={(idx) => {
                            const actualIdx = options.findIndex(o => o === categorized.Propeller[idx]);
                            onRemoveOption(actualIdx);
                        }}
                    />
                    <AccessoryCategory 
                        label="Rigging" 
                        items={categorized.Rigging} 
                        onAdd={() => onAddOption('Rigging')}
                        onRemove={(idx) => {
                            const actualIdx = options.findIndex(o => o === categorized.Rigging[idx]);
                            onRemoveOption(actualIdx);
                        }}
                    />
                    <AccessoryCategory 
                        label="Other Parts" 
                        items={categorized.Other} 
                        onAdd={() => onAddOption('Other')}
                        onRemove={(idx) => {
                            const actualIdx = options.findIndex(o => o === categorized.Other[idx]);
                            onRemoveOption(actualIdx);
                        }}
                    />
                </div>
            </CardContent>
        </Card>
    );
}

export function MotorOptions({ model, module }: { model: any, module: any }) {
    const { watch, setValue } = useFormContext();
    const firestore = useFirestore();
    const { toast } = useToast();
    
    const vendorsQuery = useMemoFirebase(() => collection(firestore, 'data-warehouse'), [firestore]);
    const { data: allVendors, loading: vendorsLoading } = useCollection<Vendor>(vendorsQuery);
    
    const motorConfigurations = watch('specifications.motorConfigurations') || model.specifications?.motorConfigurations || [];
    const motorFactoryOptions = watch('motorFactoryOptions') || {};

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
            } catch (e) {
                console.error("Error finding datasets:", e);
            }
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

    const dummyOrg: Organisation = {
        id: 'config-context',
        name: 'Configuration Manager',
        dataWarehouseSubscriptions: [
            ...(module.associatedVendorIds || []),
            module.mainVendorId
        ]
    };

    const motorCombinations = useMemo(() => {
        if (!motorDataSet || motorConfigurations.length === 0 || !motorVendor) return [];

        return motorConfigurations.map((config: MotorConfig) => {
            let combinations: Motor[][] = [];
            
            if (config.type === 'Twin') {
                const twinMotors = motorDataSet.filter(motor => {
                    const parsed = parseHpRating(motor['HP Rating']);
                    if (!parsed || parsed.count !== 2) return false;
                    const spec = config.engines[0];
                    const min = Number(spec.minHp || 0);
                    const max = Number(spec.maxHp || 0);
                    if (max > 0) return parsed.hp >= min && parsed.hp <= max;
                    return parsed.hp >= min;
                });
                combinations = twinMotors.map(m => [m]);
            } else if (config.type === 'Single') {
                const singleMotors = motorDataSet.filter(motor => {
                    const parsed = parseHpRating(motor['HP Rating']);
                    if (!parsed || parsed.count !== 1) return false;
                    const spec = config.engines[0];
                    const min = Number(spec.minHp || 0);
                    const max = Number(spec.maxHp || 0);
                    if (max > 0) return parsed.hp >= min && parsed.hp <= max;
                    return parsed.hp >= min;
                });
                combinations = singleMotors.map(m => [m]);
            } else {
                const engineCountMap: Record<string, number> = { 'Triple': 3, 'Quad': 4, 'SingleWithAux': 2 };
                const targetCount = engineCountMap[config.type] || 1;
                const filtered = motorDataSet.filter(motor => {
                    const parsed = parseHpRating(motor['HP Rating']);
                    if (!parsed) return false;
                    return parsed.count === targetCount;
                });
                combinations = filtered.map(m => [m]);
            }
            
            return { configType: config.type, combinations };
        }).filter(c => c.combinations.length > 0);

    }, [motorDataSet, motorConfigurations, motorVendor]);

    const handleAddOptionToMotor = (motorId: string, category: string) => {
        setActiveMotorId(motorId);
        setActiveCategory(category);
        setIsBrowserOpen(true);
    };

    const handleRemoveOption = (motorId: string, optionIndex: number) => {
        const currentOptions = motorFactoryOptions[motorId] || [];
        const newOptions = currentOptions.filter((_: any, i: number) => i !== optionIndex);
        setValue('motorFactoryOptions', { ...motorFactoryOptions, [motorId]: newOptions }, { shouldDirty: true });
    };

    const handleSaveOption = (selection: any) => {
        if (!activeMotorId) return;
        const currentOptions = motorFactoryOptions[activeMotorId] || [];
        const newOptions = [...currentOptions, selection];
        setValue('motorFactoryOptions', { ...motorFactoryOptions, [activeMotorId]: newOptions }, { shouldDirty: true });
        setIsBrowserOpen(false);
        setActiveMotorId(null);
        toast({ title: "Motor Option Linked" });
    };

    const loading = vendorsLoading || motorsLoading;

    if (loading) return <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

    return (
        <div className="space-y-6">
            <Card className="rounded-xl border shadow-sm overflow-hidden">
                <CardHeader className="bg-muted/10 border-b">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-xl font-bold">Compatible Motor Configurations</CardTitle>
                            <CardDescription className="text-[10px] uppercase font-black tracking-widest opacity-60">
                                Configurations matching the boat's horsepower and quantity ratings.
                            </CardDescription>
                        </div>
                        {motorVendor?.logoUrl && (
                            <div className="bg-background border rounded-lg p-2 shadow-sm">
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
                                    <AccordionTrigger className="px-6 py-4 hover:no-underline bg-muted/20 hover:bg-muted/30 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 bg-primary/10 rounded-full flex items-center justify-center text-primary"><Star className="h-4 w-4" /></div>
                                            <div className="text-left">
                                                <p className="font-black text-xs uppercase tracking-widest">{formatConfigType(configGroup.configType)} Layout</p>
                                                <p className="text-[9px] font-bold text-muted-foreground uppercase opacity-60">{configGroup.combinations.length} Variations</p>
                                            </div>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="p-6">
                                        <ScrollArea className="h-full max-h-[700px] pr-4">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                {configGroup.combinations.map((combo, comboIdx) => (
                                                    <div key={comboIdx} className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 border-2 rounded-2xl bg-muted/5 relative group/combo">
                                                        {combo.map((motor, motorIdx) => (
                                                            <MotorCard 
                                                                key={`${motor.id}-${motorIdx}`} 
                                                                motor={motor} 
                                                                onAddOption={(cat) => handleAddOptionToMotor(motor.id, cat)}
                                                                options={motorFactoryOptions[motor.id]}
                                                                onRemoveOption={(idx) => handleRemoveOption(motor.id, idx)}
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
                                <p className="text-[10px] text-muted-foreground/60 mt-2 leading-relaxed uppercase font-bold">Adjust the boat's min/max HP ratings or ensure the Yamaha Outboards table is populated correctly.</p>
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
                description={`Browse rigging, propellers and accessories for ${activeMotorId?.slice(-6).toUpperCase()}.`}
            />
        </div>
    );
}

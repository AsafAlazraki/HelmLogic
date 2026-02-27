
'use client';

import { useMemo, useState, useEffect } from 'react';
import { useCollection, useMemoFirebase, useFirestore } from '@/firebase';
import { collection, query, doc, getDocs, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertCircle, Star, PlusCircle, Settings2, Package, Check, X, ShieldCheck, Ship } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import Image from 'next/image';
import { Button } from './ui/button';
import { useFormContext } from 'react-hook-form';
import { MasterDataBrowserDialog } from './master-data-browser-dialog';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { useToast } from '@/hooks/use-toast';

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

/**
 * Parses HP Rating strings like "90", "450", or "2 x 300"
 */
const parseHpRating = (rating?: any): { count: number, hp: number } | null => {
    if (!rating) return null;
    const str = String(rating).toLowerCase().trim();
    
    // Match "2 x 300"
    const twinMatch = str.match(/^(\d+)\s*x\s*(\d+)/);
    if (twinMatch) {
        return { count: parseInt(twinMatch[1]), hp: parseInt(twinMatch[2]) };
    }
    
    // Match "90" or "450"
    const singleMatch = str.match(/^(\d+)/);
    if (singleMatch) {
        return { count: 1, hp: parseInt(singleMatch[1]) };
    }
    
    return null;
};

function MotorCard({ 
    motor, 
    onAddOption,
    options = [],
    onRemoveOption
}: { 
    motor: Motor, 
    onAddOption: () => void,
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

    return (
        <Card className="overflow-hidden flex flex-col border-2 shadow-none hover:border-primary/20 transition-all rounded-xl">
            <div className="relative h-28 bg-secondary/30 shrink-0">
                 {itemImageUrl ? (
                    <Image 
                        src={itemImageUrl} 
                        alt={String(modelName)} 
                        fill 
                        className="object-contain p-2" 
                        sizes="200px"
                        unoptimized
                    />
                ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground/20">
                        <Ship className="w-8 h-8"/>
                    </div>
                )}
                {hpRating && (
                    <div className="absolute top-2 left-2">
                        <Badge variant="default" className="font-black text-[9px] bg-primary shadow-sm uppercase">
                            {hpRating} HP
                        </Badge>
                    </div>
                )}
                <div className="absolute bottom-2 right-2">
                    <Badge variant="secondary" className="font-mono text-[9px] font-bold bg-background/80 backdrop-blur-sm border">
                        {motor.id.slice(-6).toUpperCase()}
                    </Badge>
                </div>
            </div>
            <CardContent className="p-3 flex-1 flex flex-col gap-3">
                <div>
                    <p className="text-[11px] font-black uppercase leading-tight line-clamp-2">{String(modelName)}</p>
                    {motor['Part Number'] && <p className="text-[9px] font-mono font-bold text-primary mt-1 uppercase opacity-60">{motor['Part Number']}</p>}
                </div>

                <div className="space-y-2 mt-auto pt-2 border-t border-dashed">
                    <div className="flex items-center gap-2 mb-1 justify-between">
                        <span className="text-[9px] font-black uppercase text-muted-foreground tracking-tighter">Motor Accessories</span>
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 rounded-full hover:bg-primary/10 text-primary"
                            onClick={(e) => { e.stopPropagation(); onAddOption(); }}
                        >
                            <PlusCircle className="h-4 w-4" />
                        </Button>
                    </div>
                    
                    <div className="space-y-1 max-h-32 overflow-y-auto pr-1 scrollbar-thin">
                        {options.length > 0 ? options.map((opt, i) => (
                            <div key={i} className="flex items-center gap-2 p-1.5 rounded bg-muted/50 border border-transparent hover:border-primary/10 transition-colors group/opt">
                                <Package className="h-3 w-3 text-muted-foreground shrink-0" />
                                <span className="text-[9px] font-bold truncate flex-1">{opt.name}</span>
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-4 w-4 opacity-0 group-hover/opt:opacity-100 text-destructive hover:bg-destructive/10"
                                    onClick={(e) => { e.stopPropagation(); onRemoveOption(i); }}
                                >
                                    <X className="h-2.5 w-2.5" />
                                </Button>
                            </div>
                        )) : (
                            <div className="py-4 border border-dashed rounded-lg flex flex-col items-center justify-center text-muted-foreground opacity-30">
                                <PlusCircle className="h-4 w-4 mb-1" />
                                <span className="text-[8px] font-black uppercase">Propeller / Rigging</span>
                            </div>
                        )}
                    </div>
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
                
                // Prioritize "Yamaha Outboards" or generic outboard/motor names
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
            
            // Per instructions: "under the twin section, only show the ones that start HP Rating with a 2 x"
            if (config.type === 'Twin') {
                const twinMotors = motorDataSet.filter(motor => {
                    const parsed = parseHpRating(motor['HP Rating']);
                    if (!parsed || parsed.count !== 2) return false;
                    
                    // Check if it fits the engine spec (usually twins same, so use first engine)
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
                // For Triple/Quad etc., fallback to combination logic or specific parsing if available
                const engineCountMap: Record<string, number> = { 'Triple': 3, 'Quad': 4, 'SingleWithAux': 2 };
                const targetCount = engineCountMap[config.type] || 1;
                
                const filtered = motorDataSet.filter(motor => {
                    const parsed = parseHpRating(motor['HP Rating']);
                    if (!parsed) return false;
                    return parsed.count === targetCount;
                });
                combinations = filtered.map(m => [m]);
            }
            
            return {
                configType: config.type,
                combinations,
            };
        }).filter(c => c.combinations.length > 0);

    }, [motorDataSet, motorConfigurations, motorVendor]);

    const handleAddOptionToMotor = (motorId: string) => {
        setActiveMotorId(motorId);
        setIsBrowserOpen(true);
    };

    const handleRemoveOption = (motorId: string, optionIndex: number) => {
        const currentOptions = motorFactoryOptions[motorId] || [];
        const newOptions = currentOptions.filter((_: any, i: number) => i !== optionIndex);
        
        setValue('motorFactoryOptions', {
            ...motorFactoryOptions,
            [motorId]: newOptions
        }, { shouldDirty: true });
    };

    const handleSaveOption = (selection: any) => {
        if (!activeMotorId) return;
        const currentOptions = motorFactoryOptions[activeMotorId] || [];
        const newOptions = [...currentOptions, selection];
        
        setValue('motorFactoryOptions', {
            ...motorFactoryOptions,
            [activeMotorId]: newOptions
        }, { shouldDirty: true });
        
        setIsBrowserOpen(false);
        setActiveMotorId(null);
        toast({ title: "Factory Option Added" });
    };

    const loading = vendorsLoading || motorsLoading;

    if (loading) {
        return (
            <Card className="rounded-xl border shadow-sm">
                <CardContent className="flex justify-center items-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <Card className="rounded-xl border shadow-sm overflow-hidden">
                <CardHeader className="bg-muted/10 border-b">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-xl font-bold">Compatible Motor Combinations</CardTitle>
                            <CardDescription className="text-xs uppercase font-black tracking-widest opacity-60">
                                Engine configurations matching the boat's horsepower ratings.
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-3 bg-background border rounded-lg px-3 py-1.5 shadow-sm">
                            {motorVendor?.logoUrl ? (
                                <div className="relative h-8 w-24">
                                    <Image src={motorVendor.logoUrl} alt={motorVendor.name} fill className="object-contain" sizes="96px" />
                                </div>
                            ) : motorVendor && (
                                <div className="flex items-center gap-2">
                                    <Settings2 className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-[10px] font-black uppercase tracking-tighter">{motorVendor.name}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-6">
                    {motorCombinations.length > 0 ? (
                        <Accordion type="multiple" className="w-full space-y-4" defaultValue={['config-0']}>
                            {motorCombinations.map((configGroup, index) => (
                                <AccordionItem value={`config-${index}`} key={configGroup.configType} className="border rounded-xl overflow-hidden shadow-sm bg-background">
                                    <AccordionTrigger className="px-6 py-4 hover:no-underline bg-muted/20 hover:bg-muted/30 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                                                <Star className="h-4 w-4" />
                                            </div>
                                            <div className="text-left">
                                                <p className="font-black text-xs uppercase tracking-widest">{formatConfigType(configGroup.configType)} Layout</p>
                                                <p className="text-[10px] font-bold text-muted-foreground uppercase opacity-60">{configGroup.combinations.length} Variations Available</p>
                                            </div>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="p-6">
                                        <ScrollArea className="h-full max-h-[600px] pr-4">
                                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                                {configGroup.combinations.map((combo, comboIdx) => (
                                                    <div key={comboIdx} className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 border rounded-2xl bg-muted/5 relative group/combo">
                                                        {combo.map((motor, motorIdx) => (
                                                            <MotorCard 
                                                                key={`${motor.id}-${motorIdx}`} 
                                                                motor={motor} 
                                                                onAddOption={() => handleAddOptionToMotor(motor.id)}
                                                                options={motorFactoryOptions[motor.id]}
                                                                onRemoveOption={(idx) => handleRemoveOption(motor.id, idx)}
                                                            />
                                                        ))}
                                                        <div className="absolute top-2 right-2 opacity-0 group-hover/combo:opacity-100 transition-opacity">
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 bg-background border shadow-sm">
                                                                <Check className="h-4 w-4 text-green-600" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </ScrollArea>
                                    </AccordionContent>
                                </AccordionItem>
                            ))}
                        </Accordion>
                    ) : (
                        <div className="py-20 text-center flex flex-col items-center gap-4 bg-muted/10 rounded-2xl border-2 border-dashed">
                            <AlertCircle className="h-12 w-12 text-muted-foreground opacity-20" />
                            <div>
                                <p className="text-sm font-bold uppercase tracking-widest">No Matches Found</p>
                                <p className="text-xs text-muted-foreground/60 mt-1">Adjust the boat's min/max HP ratings to see compatible engines.</p>
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
                onSave={handleSaveOption}
                title="Engine Factory Options"
                description={`Select rigging, props or accessories from associated vendors for the selected motor.`}
            />
        </div>
    );
}

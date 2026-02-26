
'use client';

import { useMemo, useState, useEffect } from 'react';
import { useCollection, useMemoFirebase, useFirestore } from '@/firebase';
import { collection, query, doc, updateDoc, getDocs, where, limit } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Loader2, AlertCircle, Star, PlusCircle, Settings2, Package, Check, X, ShieldCheck } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import Image from 'next/image';
import { Button } from './ui/button';
import { useFormContext, useFieldArray } from 'react-hook-form';
import { MasterDataBrowserDialog } from './master-data-browser-dialog';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
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

const getHpFromModelName = (modelName?: string): number | null => {
    if (!modelName) return null;
    const match = modelName.match(/(\d+(\.\d+)?)/);
    return match ? parseFloat(match[0]) : null;
};

// Helper function for cartesian product
const cartesian = (...a: any[][]) => a.reduce((acc, val) => acc.flatMap(d => val.map(e => [d, e].flat())));

// Helper function for combinations with replacement
const combinationsWithReplacement = (arr: any[], size: number): any[][] => {
    if (!arr.length || size <= 0) return [];
    if (size === 1) return arr.map(item => [item]);

    const result: any[][] = [];
    const recurse = (temp: any[], start: number) => {
        if (temp.length === size) {
            result.push(temp.slice());
            return;
        }
        for (let i = start; i < arr.length; i++) {
            temp.push(arr[i]);
            recurse(temp, i);
            temp.pop();
        }
    };
    recurse([], 0);
    return result;
};

function MotorCard({ 
    motor, 
    onAddOption,
    options = []
}: { 
    motor: Motor, 
    onAddOption: () => void,
    options?: any[]
}) {
    let itemImageUrl: string | null = null;
    if (motor.SummaryImage && typeof motor.SummaryImage === 'string') {
        const path = motor.SummaryImage.trim().replace(/\\/g, '');
        if (path) {
            try {
                itemImageUrl = new URL(path, 'https://www.yamaha-motor.com.au').toString();
            } catch (e) {
                console.error("Invalid image URL path:", path, e);
                itemImageUrl = null;
            }
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

    return (
        <Card className="overflow-hidden flex flex-col border-2 shadow-none hover:border-primary/20 transition-all rounded-xl">
            <div className="relative h-28 bg-secondary/30 shrink-0">
                 {itemImageUrl ? (
                    <Image src={String(itemImageUrl)} alt={String(modelName)} fill className="object-contain p-2" sizes="200px" />
                ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground/20">
                        <AlertCircle className="w-8 h-8"/>
                    </div>
                )}
                <div className="absolute bottom-2 right-2">
                    <Badge variant="secondary" className="font-mono text-[9px] font-bold bg-background/80 backdrop-blur-sm">
                        {motor.id.slice(-6).toUpperCase()}
                    </Badge>
                </div>
            </div>
            <CardContent className="p-3 flex-1 flex flex-col gap-3">
                <div>
                    <p className="text-[11px] font-black uppercase leading-tight line-clamp-2">{String(modelName)}</p>
                    {motor['Part Number'] && <p className="text-[9px] font-mono font-bold text-primary mt-1">{motor['Part Number']}</p>}
                </div>

                <div className="space-y-2 mt-auto">
                    <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase text-muted-foreground tracking-tighter">Factory Options</span>
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
                                <span className="text-[8px] opacity-40 group-hover/opt:hidden">{opt.items?.length || 1}</span>
                                <Button variant="ghost" size="icon" className="h-4 w-4 hidden group-hover/opt:flex text-destructive hover:bg-destructive/10">
                                    <X className="h-2 w-2" />
                                </Button>
                            </div>
                        )) : (
                            <div className="py-4 border border-dashed rounded-lg flex flex-col items-center justify-center text-muted-foreground opacity-30">
                                <PlusCircle className="h-4 w-4 mb-1" />
                                <span className="text-[8px] font-black uppercase">Add Prop/Rigging</span>
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
    
    const vendorsQuery = useMemoFirebase(() => collection(firestore, 'data-warehouse'), [firestore]);
    const { data: allVendors, loading: vendorsLoading } = useCollection<Vendor>(vendorsQuery);
    
    const motorConfigurations = watch('specifications.motorConfigurations') || model.specifications?.motorConfigurations || [];
    const motorFactoryOptions = watch('motorFactoryOptions') || {}; // Map: Record<motorId, Option[]>

    const motorVendor = useMemo(() => {
        if (!allVendors || !module) return null;
        const allModuleVendorIds = [...(module.associatedVendorIds || []), module.mainVendorId].filter(Boolean);
        return allVendors.find(v => allModuleVendorIds.includes(v.id) && v.vendorType === 'Motor Brand');
    }, [allVendors, module]);

    // Fetch datasets for the motor vendor to find the right table
    const [targetDataSet, setTargetDataSet] = useState<any>(null);
    useEffect(() => {
        const findDataSet = async () => {
            if (!motorVendor) return;
            const dsRef = collection(firestore, 'data-warehouse', motorVendor.id, 'dataSets');
            const dsSnap = await getDocs(dsRef);
            const datasets = dsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            
            // Prioritize tables with "Outboards", "Motors", or "Engines"
            const preferred = datasets.find((s: any) => 
                s.name.toLowerCase().includes('outboard') || 
                s.name.toLowerCase().includes('motor') ||
                s.name.toLowerCase().includes('engine')
            ) || datasets[0];
            
            setTargetDataSet(preferred);
        };
        findDataSet();
    }, [motorVendor, firestore]);

    const motorDataSetQuery = useMemoFirebase(() => {
        if (!motorVendor) return null;
        if (targetDataSet) {
            return collection(firestore, 'data-warehouse', motorVendor.id, 'dataSets', targetDataSet.id, 'rows');
        }
        // Fallback to masterDataSet if no specific tables found
        return collection(firestore, 'data-warehouse', motorVendor.id, 'masterDataSet');
    }, [firestore, motorVendor, targetDataSet]);

    const { data: motorDataSet, loading: motorsLoading } = useCollection<Motor>(motorDataSetQuery);

    const [isBrowserOpen, setIsBrowserOpen] = useState(false);
    const [activeMotorId, setActiveMotorId] = useState<string | null>(null);

    // Dummy organization context for the browser dialog
    const dummyOrg: Organisation = {
        id: 'config-context',
        name: 'Configuration Manager',
        dataWarehouseSubscriptions: [
            ...(module.associatedVendorIds || []),
            module.mainVendorId
        ]
    };

    const getHpFromMotor = (motor: Motor): number | null => {
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
        if (modelNameKey && typeof motor[modelNameKey] === 'string') {
            return getHpFromModelName(motor[modelNameKey] as string);
        }
        return null;
    };
    
    const motorCombinations = useMemo(() => {
        if (!motorDataSet || motorConfigurations.length === 0 || !motorVendor) return [];

        return motorConfigurations.map((config: MotorConfig) => {
            let combinations: Motor[][] = [];
            
            const compatibleMotorsPerEngine = config.engines.map(engineSpec => 
                motorDataSet.filter(motor => {
                    const motorHp = getHpFromMotor(motor);
                    if (motorHp === undefined || motorHp === null || isNaN(motorHp)) return false;
                    
                    const minHp = Number(engineSpec.minHp ?? 0);
                    const maxHp = Number(engineSpec.maxHp ?? 0);

                    if (maxHp > 0) {
                        return motorHp >= minHp && motorHp <= maxHp;
                    } else if (minHp > 0) {
                        return motorHp >= minHp;
                    }
                    
                    return false;
                })
            );

            if(config.type === 'Single' && compatibleMotorsPerEngine.length > 0) {
                combinations = compatibleMotorsPerEngine[0].map(m => [m]);
            } else if (config.type === 'Twin' && compatibleMotorsPerEngine.length > 0 && compatibleMotorsPerEngine[0].length > 0) {
                combinations = combinationsWithReplacement(compatibleMotorsPerEngine[0], 2);
            } else if (config.type === 'Triple' && compatibleMotorsPerEngine.length > 0 && compatibleMotorsPerEngine[0].length > 0) {
                combinations = combinationsWithReplacement(compatibleMotorsPerEngine[0], 3);
            } else if (config.type === 'Quad' && compatibleMotorsPerEngine.length > 0 && compatibleMotorsPerEngine[0].length > 0) {
                combinations = combinationsWithReplacement(compatibleMotorsPerEngine[0], 4);
            } else if (config.type === 'SingleWithAux' && compatibleMotorsPerEngine.length === 2) {
                combinations = cartesian(compatibleMotorsPerEngine[0], compatibleMotorsPerEngine[1]);
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
        toast({ title: "Factory Option Added", description: `Linked ${selection.name} to the selected motor variant.` });
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

    if (!motorVendor) {
        return (
            <Card className="rounded-xl border-2 border-dashed bg-muted/5">
                <CardContent className="flex flex-col items-center justify-center h-64 text-center">
                    <AlertCircle className="h-10 w-10 text-muted-foreground opacity-20 mb-4" />
                    <p className="font-bold uppercase tracking-widest text-xs text-muted-foreground">No Motor Vendor Configured</p>
                    <p className="text-sm text-muted-foreground/60 mt-2">Associate a motor brand in the module settings to enable engine configuration.</p>
                </CardContent>
            </Card>
        );
    }

    if (!motorDataSet || motorDataSet.length === 0) {
        return (
            <Card className="rounded-xl border-2 border-dashed bg-muted/5">
                <CardContent className="flex flex-col items-center justify-center h-64 text-center">
                    <ShieldCheck className="h-10 w-10 text-muted-foreground opacity-20 mb-4" />
                    <p className="font-bold uppercase tracking-widest text-xs text-muted-foreground">No Engine Data Found</p>
                    <p className="text-sm text-muted-foreground/60 mt-2">The master data set for {motorVendor.name} appears to be empty.</p>
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
                            {motorVendor.logoUrl ? (
                                <div className="relative h-8 w-16">
                                    <Image src={motorVendor.logoUrl} alt={motorVendor.name} fill className="object-contain" />
                                </div>
                            ) : <Settings2 className="h-4 w-4 text-muted-foreground" />}
                            <span className="text-[10px] font-black uppercase tracking-tighter">{motorVendor.name}</span>
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

function combinationsWithReplacement(arr: any[], size: number): any[][] {
    if (!arr.length || size <= 0) return [];
    if (size === 1) return arr.map(item => [item]);
    const result: any[][] = [];
    const recurse = (temp: any[], start: number) => {
        if (temp.length === size) { result.push(temp.slice()); return; }
        for (let i = start; i < arr.length; i++) { temp.push(arr[i]); recurse(temp, i); temp.pop(); }
    };
    recurse([], 0);
    return result;
}

function cartesian(...a: any[][]) {
    return a.reduce((acc, val) => acc.flatMap(d => val.map(e => [d, e].flat())));
}

function toast({ title, description, variant }: any) {
    // console.log(`[Toast] ${title}: ${description}`);
}

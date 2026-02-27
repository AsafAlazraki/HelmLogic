
'use client';

import { useMemo, useState, useEffect } from 'react';
import { useCollection, useMemoFirebase, useFirestore } from '@/firebase';
import { collection, query, doc, getDocs, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertCircle, Star, PlusCircle, Package, Check, X, Ship, ChevronRight, Settings2 } from 'lucide-react';
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
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAdd(); }}
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
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(i); }}
                        >
                            <X className="h-3 w-3" />
                        </Button>
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
    onAddOption,
    options = [],
    onRemoveOption,
    onHide
}: { 
    motor: Motor, 
    onAddOption: (cat: string) => void,
    options?: any[],
    onRemoveOption: (index: number) => void,
    onHide: () => void
}) {
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
        for (const key of allKeys) {
            if (normalizedPotentials.includes(normalize(key))) {
                return key;
            }
        }
        return undefined;
    };
    
    const modelNameKey = findKey(['Model Name', 'ModelName', 'Model', 'Description', 'name']);
    const modelName = modelNameKey ? motor[modelNameKey] : 'Unknown Motor';
    const hpRating = motor['HP Rating'];

    const categorized = {
        Propeller: (options || []).filter(o => o.category === 'Propeller'),
        Rigging: (options || []).filter(o => o.category === 'Rigging'),
        Other: (options || []).filter(o => !o.category || o.category === 'Other')
    };

    return (
        <Card className="overflow-hidden flex flex-col border-2 shadow-sm hover:border-primary/20 transition-all rounded-xl h-full min-w-0 max-w-full bg-card group/motor">
            <div className="relative h-36 bg-muted/30 shrink-0 border-b">
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
                <div className="absolute top-2 right-2 opacity-0 group-hover/motor:opacity-100 transition-opacity">
                    <Button 
                        variant="destructive" 
                        size="icon" 
                        className="h-7 w-7 rounded-full shadow-lg"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onHide(); }}
                        title="Remove from compatible list"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
                <div className="absolute bottom-2 right-2">
                    <Badge variant="secondary" className="font-mono text-[9px] font-bold bg-background/90 backdrop-blur-md border shadow-sm px-1.5 opacity-60">
                        {motor.id.slice(-6).toUpperCase()}
                    </Badge>
                </div>
            </div>
            
            <CardContent className="p-4 flex-1 flex flex-col gap-5 min-w-0">
                <div className="space-y-2">
                    <div className="flex items-start gap-2">
                        {hpRating && (
                            <Badge variant="default" className="font-black text-[10px] bg-primary shadow-sm uppercase tracking-tighter shrink-0 px-2 py-0.5">
                                {hpRating} HP
                            </Badge>
                        )}
                        <p className="text-[12px] font-black uppercase leading-tight text-foreground tracking-tight break-words flex-1">
                            {String(modelName)}
                        </p>
                    </div>
                    {motor['Part Number'] && (
                        <div className="flex items-center gap-1.5 opacity-60">
                            <span className="text-[8px] font-black uppercase text-muted-foreground tracking-widest">Part No:</span>
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
                            const actualIdx = (options || []).findIndex(o => o === categorized.Propeller[idx]);
                            onRemoveOption(actualIdx);
                        }}
                    />
                    <AccessoryCategory 
                        label="Rigging" 
                        items={categorized.Rigging} 
                        onAdd={() => onAddOption('Rigging')}
                        onRemove={(idx) => {
                            const actualIdx = (options || []).findIndex(o => o === categorized.Rigging[idx]);
                            onRemoveOption(actualIdx);
                        }}
                    />
                    <AccessoryCategory 
                        label="Other Parts" 
                        items={categorized.Other} 
                        onAdd={() => onAddOption('Other')}
                        onRemove={(idx) => {
                            const actualIdx = (options || []).findIndex(o => o === categorized.Other[idx]);
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
    const motorOverrides = watch('motorOverrides') || {}; // { [configType]: { hiddenIds: string[], manualIds: string[] } }

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
    const [isEngineManagerOpen, setIsEngineManagerOpen] = useState(false);
    const [activeConfigType, setActiveConfigType] = useState<string | null>(null);

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
            let baseMotors: Motor[] = [];
            const overrides = motorOverrides[config.type] || { hiddenIds: [], manualIds: [] };
            
            // Auto-detect compatible motors
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

            // Combine with manual additions
            const manualMotors = motorDataSet.filter(m => overrides.manualIds.includes(m.id));
            const allPossible = [...new Map([...baseMotors, ...manualMotors].map(m => [m.id, m])).values()];

            // Filter out hidden ones
            const visibleMotors = allPossible.filter(m => !overrides.hiddenIds.includes(m.id));
            
            return { configType: config.type, combinations: visibleMotors.map(m => [m]) };
        }).filter(c => c.combinations.length > 0);

    }, [motorDataSet, motorConfigurations, motorVendor, motorOverrides]);

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

    const handleHideMotor = (configType: string, motorId: string) => {
        const current = motorOverrides[configType] || { hiddenIds: [], manualIds: [] };
        const newHidden = [...new Set([...current.hiddenIds, motorId])];
        setValue('motorOverrides', { ...motorOverrides, [configType]: { ...current, hiddenIds: newHidden } }, { shouldDirty: true });
        toast({ title: "Motor Hidden", description: "Successfully removed from compatible list." });
    };

    const handleAddManualEngine = (selection: any) => {
        if (!activeConfigType) return;
        const current = motorOverrides[activeConfigType] || { hiddenIds: [], manualIds: [] };
        const newManualIds = [...new Set([...current.manualIds, ...selection.items.map((i: any) => i.rowId)])];
        // Also ensure it's not hidden
        const newHidden = current.hiddenIds.filter(id => !newManualIds.includes(id));
        
        setValue('motorOverrides', { 
            ...motorOverrides, 
            [activeConfigType]: { hiddenIds: newHidden, manualIds: newManualIds } 
        }, { shouldDirty: true });
        
        setIsEngineManagerOpen(false);
        setActiveConfigType(null);
        toast({ title: "Engine Added", description: "Manual engine added to compatible list." });
    };

    const handleSaveOption = (selection: any) => {
        if (!activeMotorId) return;
        const currentOptions = motorFactoryOptions[activeMotorId] || [];
        const itemsWithCategory = selection.items.map((item: any) => ({
            ...item,
            category: activeCategory
        }));
        
        const newEntry = {
            name: selection.name,
            category: activeCategory,
            items: itemsWithCategory
        };

        const newOptions = [...currentOptions, newEntry];
        setValue('motorFactoryOptions', { ...motorFactoryOptions, [activeMotorId]: newOptions }, { shouldDirty: true });
        setIsBrowserOpen(false);
        setActiveMotorId(null);
        toast({ title: "Motor Option Linked" });
    };

    const loading = vendorsLoading || motorsLoading;

    if (loading) return <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

    return (
        <div className="space-y-6">
            <Card className="rounded-xl border shadow-sm overflow-hidden bg-background">
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
                                    <AccordionTrigger className="px-6 py-4 hover:no-underline bg-muted/20 hover:bg-muted/30 transition-colors group/trigger">
                                        <div className="flex items-center justify-between w-full pr-6">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 bg-primary/10 rounded-full flex items-center justify-center text-primary"><Star className="h-4 w-4" /></div>
                                                <div className="text-left">
                                                    <p className="font-black text-xs uppercase tracking-widest">{formatConfigType(configGroup.configType)} Layout</p>
                                                    <p className="text-[9px] font-bold text-muted-foreground uppercase opacity-60">{configGroup.combinations.length} Variations Available</p>
                                                </div>
                                            </div>
                                            <Button 
                                                variant="outline" 
                                                size="sm" 
                                                className="h-8 text-[10px] font-black uppercase tracking-widest opacity-0 group-hover/trigger:opacity-100 transition-opacity"
                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveConfigType(configGroup.configType); setIsEngineManagerOpen(true); }}
                                            >
                                                <Settings2 className="h-3 w-3 mr-1.5" />
                                                Manage Engines
                                            </Button>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="p-0">
                                        <ScrollArea className="h-full max-h-[700px] w-full">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
                                                {configGroup.combinations.map((combo, comboIdx) => (
                                                    <div key={comboIdx} className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 border-2 rounded-2xl bg-muted/5 relative group/combo">
                                                        {combo.map((motor, motorIdx) => (
                                                            <MotorCard 
                                                                key={`${motor.id}-${motorIdx}`} 
                                                                motor={motor} 
                                                                onAddOption={(cat) => handleAddOptionToMotor(motor.id, cat)}
                                                                options={motorFactoryOptions[motor.id]}
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
                                <p className="text-[10px] text-muted-foreground/60 mt-2 leading-relaxed uppercase font-bold">Adjust the boat's min/max HP ratings or use the engine manager to add motors manually.</p>
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

            <MasterDataBrowserDialog 
                isOpen={isEngineManagerOpen}
                onClose={() => { setIsEngineManagerOpen(false); setActiveConfigType(null); }}
                organisation={dummyOrg as any}
                categoryId="manual-engines"
                onSave={handleAddManualEngine}
                title={`Manage Engines: ${formatConfigType(activeConfigType || '')}`}
                description="Search the full outboard catalog to manually add compatible engines to this configuration."
            />
        </div>
    );
}

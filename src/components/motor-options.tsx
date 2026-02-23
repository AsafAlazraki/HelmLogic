'use client';

import { useMemo, useState, useEffect } from 'react';
import { useCollection, useMemoFirebase, useFirestore } from '@/firebase';
import { collection, query } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Loader2, AlertCircle, Pencil, Trash2, PlusCircle, Star } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import Image from 'next/image';
import { Button } from './ui/button';
import { useFormContext } from 'react-hook-form';

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

const formatConfigType = (type: string) => {
    // Add spaces before capital letters (but not at the beginning)
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


function MotorCard({ motor }: { motor: Motor }) {
    let itemImageUrl: string | null = null;
    if (motor.SummaryImage && typeof motor.SummaryImage === 'string') {
        const path = motor.SummaryImage.trim().replace(/\\/g, '');
        if (path) {
            try {
                // Use URL constructor for robust path joining
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
        <Card className="overflow-hidden w-40 flex-shrink-0">
            <div className="relative h-24 bg-secondary">
                 {itemImageUrl ? (
                    <Image src={String(itemImageUrl)} alt={String(modelName)} fill className="object-contain p-2" />
                ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                        <AlertCircle className="w-8 h-8"/>
                    </div>
                )}
            </div>
            <CardFooter className="p-2 text-center text-xs font-semibold">
                <p className="w-full truncate">{String(modelName)}</p>
            </CardFooter>
        </Card>
    );
}

export function MotorOptions({ model, module }: { model: any, module: any }) {
    const { watch } = useFormContext();
    const firestore = useFirestore();
    
    const vendorsQuery = useMemoFirebase(() => collection(firestore, 'data-warehouse'), [firestore]);
    const { data: allVendors, loading: vendorsLoading } = useCollection<Vendor>(vendorsQuery);
    
    const motorConfigurations = watch('specifications.motorConfigurations') || model.specifications?.motorConfigurations || [];

    const motorVendor = useMemo(() => {
        if (!allVendors || !module) return null;
        
        const allModuleVendorIds = [
            ...(module.associatedVendorIds || []),
            module.mainVendorId,
        ].filter(Boolean);

        return allVendors.find(v => 
            allModuleVendorIds.includes(v.id) && 
            v.vendorType === 'Motor Brand'
        );
    }, [allVendors, module]);

    const motorDataSetQuery = useMemoFirebase(() => {
        if (!motorVendor) return null;
        return collection(firestore, 'data-warehouse', motorVendor.id, 'masterDataSet');
    }, [firestore, motorVendor]);

    const { data: motorDataSet, loading: motorsLoading } = useCollection<Motor>(motorDataSetQuery);
    
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


    const loading = vendorsLoading || (motorVendor && motorsLoading);

    const renderContent = () => {
        if (loading) {
            return (
                <CardContent>
                    <div className="flex justify-center items-center h-48">
                        <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                </CardContent>
            );
        }

        if (!motorVendor) {
             return (
                <CardContent className="flex flex-col items-center justify-center h-48 text-center">
                    <AlertCircle className="h-10 w-10 text-muted-foreground" />
                    <p className="mt-4 font-semibold">No Motor Vendor Found</p>
                    <p className="text-sm text-muted-foreground">Please ensure a motor brand is an associated vendor for this module.</p>
                </CardContent>
            );
        }
        
        if (!motorDataSet || motorDataSet.length === 0) {
             return (
                <CardContent className="flex flex-col items-center justify-center h-48 text-center">
                     <AlertCircle className="h-10 w-10 text-muted-foreground" />
                    <p className="mt-4 font-semibold">No Motor Data Found</p>
                    <p className="text-sm text-muted-foreground">The master data set for {motorVendor.name} is empty.</p>
                </CardContent>
            );
        }
        
        if (motorConfigurations.length === 0) {
            return (
                 <CardContent className="flex flex-col items-center justify-center h-48 text-center">
                     <AlertCircle className="h-10 w-10 text-muted-foreground" />
                    <p className="mt-4 font-semibold">HP Requirements Not Set</p>
                    <p className="text-sm text-muted-foreground">Please set the motor HP configurations for this boat in the 'Boat' tab first.</p>
                </CardContent>
            );
        }
    
        if (!motorCombinations || motorCombinations.length === 0) {
            return (
                 <CardContent className="flex flex-col items-center justify-center h-48 text-center">
                     <AlertCircle className="h-10 w-10 text-muted-foreground" />
                    <p className="mt-4 font-semibold">No Compatible Motors</p>
                    <p className="text-sm text-muted-foreground">No motors in the {motorVendor.name} data set match the boat's HP requirements.</p>
                </CardContent>
            );
        }
        
        return (
            <CardContent>
                <Accordion type="multiple" className="w-full space-y-4">
                    {motorCombinations.map((configGroup, index) => (
                        <AccordionItem value={`config-${index}`} key={configGroup.configType} className="border-none">
                            <AccordionTrigger className="text-lg font-semibold bg-muted p-4 rounded-md">
                                {formatConfigType(configGroup.configType)} Configurations ({configGroup.combinations.length})
                            </AccordionTrigger>
                            <AccordionContent className="pt-4">
                                <div className="flex justify-end mb-4">
                                   <Button variant="outline" size="sm"><PlusCircle className="mr-2 h-4 w-4" /> Add Combination</Button>
                                </div>
                                <div className="max-h-[600px] overflow-y-auto pr-2">
                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                        {configGroup.combinations.map((combo, comboIndex) => (
                                            <Card key={comboIndex} className="group relative">
                                                <div className="absolute top-2 right-2 flex items-center gap-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                                     <Button variant="ghost" size="icon" className="h-7 w-7">
                                                        <Star className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                                <CardContent className="p-4 flex items-center justify-center gap-4">
                                                    {combo.map((motor, motorIndex) => (
                                                        <MotorCard key={`${motor.id}-${motorIndex}`} motor={motor} />
                                                    ))}
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
            </CardContent>
        );
    }
    
    return (
        <Card>
            <CardHeader>
                 <div className="flex items-center justify-between">
                    <div>
                        <CardTitle>Motor Options</CardTitle>
                        <CardDescription>
                            Compatible motor combinations for this model are shown below.
                        </CardDescription>
                    </div>
                     <div className="flex items-center gap-2">
                        {motorVendor?.logoUrl && (
                            <div className="relative h-10 w-20">
                                <Image src={motorVendor.logoUrl} alt={`${motorVendor.name} logo`} fill className="object-contain" />
                            </div>
                        )}
                        <div className="h-10 px-4 py-2 border rounded-md text-sm font-medium bg-secondary">
                           {motorVendor?.name || 'No Motor Brand'}
                        </div>
                     </div>
                </div>
            </CardHeader>
            {renderContent()}
        </Card>
    );
}

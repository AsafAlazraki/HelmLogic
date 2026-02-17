'use client';

import { useMemo, useState } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Loader2, AlertCircle, MoreHorizontal, Pencil, Trash2, PlusCircle } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import Image from 'next/image';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';

interface Vendor {
    id: string;
    name: string;
    vendorType: string;
    logoUrl?: string;
    slug?: string;
}

interface Motor {
    id: string;
    'Model Name'?: string;
    HP?: number | string;
    'Sub Catagory'?: string;
    'Product Group'?: string;
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

const getHpFromModelName = (modelName?: string): number | null => {
    if (!modelName) return null;
    // This regex looks for numbers, optionally with a decimal point.
    const match = modelName.match(/(\d+(\.\d+)?)/);
    return match ? parseFloat(match[0]) : null;
};

// Helper function for cartesian product
const cartesian = (...a: any[][]) => a.reduce((acc, val) => acc.flatMap(d => val.map(e => [d, e].flat())));

// Helper function for combinations with replacement
const combinationsWithReplacement = (arr: any[], size: number): any[][] => {
    if (size === 0) return [[]];
    if (!arr.length) return [];
    
    const first = arr[0];
    const rest = arr;
    
    const combosWithFirst = combinationsWithReplacement(rest, size - 1).map(combo => [first, ...combo]);
    const combosWithoutFirst = size > 1 && arr.length > 1 ? combinationsWithReplacement(arr.slice(1), size) : [];
    
    return [...combosWithFirst, ...combosWithoutFirst];
};

function MotorCard({ motor }: { motor: Motor }) {
     let itemImageUrl: string | null = null;
    if (motor.SummaryImage && typeof motor.SummaryImage === 'string') {
        const path = motor.SummaryImage.trim().replace(/\\/g, '');
        if (path.startsWith('http')) {
            itemImageUrl = path;
        } else if (path) {
            itemImageUrl = `https://www.yamaha-motor.com.au${path}`;
        }
    }
    return (
        <Card className="overflow-hidden w-40">
            <div className="relative h-24 bg-secondary">
                 {itemImageUrl ? (
                    <Image src={itemImageUrl} alt={motor['Model Name'] || 'Motor'} fill className="object-contain p-2" />
                ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                        <AlertCircle className="w-8 h-8"/>
                    </div>
                )}
            </div>
            <CardFooter className="p-2 text-center text-xs font-semibold">
                <p className="w-full truncate">{motor['Model Name']}</p>
            </CardFooter>
        </Card>
    );
}

export function MotorOptions({ model, module }: { model: any, module: any }) {
    const { data: allVendors, loading: vendorsLoading } = useCollection<Vendor>('data-warehouse');

    const motorVendor = useMemo(() => {
        if (!allVendors || !module) return null;
        const allModuleVendorIds = [
            ...(module.associatedVendorIds || []),
            module.mainVendorId,
        ].filter(Boolean);

        return allVendors.find(v => allModuleVendorIds.includes(v.id) && v.vendorType === 'Motor Brand');
    }, [allVendors, module]);

    const { data: motorDataSet, loading: motorsLoading } = useCollection<Motor>(
        motorVendor ? `data-warehouse/${motorVendor.id}/masterDataSet` : null
    );

    const motorConfigurations: MotorConfig[] = model.specifications?.motorConfigurations || [];

    const motorCombinations = useMemo(() => {
        if (!motorDataSet || motorConfigurations.length === 0) return [];

        return motorConfigurations.map(config => {
            let combinations: Motor[][] = [];
            const isYamaha = motorVendor?.slug === 'yamaha';

            const compatibleMotorsPerEngine = config.engines.map(engineSpec => 
                motorDataSet.filter(motor => {
                    const motorHp = isYamaha ? getHpFromModelName(motor['Model Name']) : (typeof motor.HP === 'string' ? parseFloat(motor.HP) : motor.HP);
                    if (motorHp === undefined || motorHp === null || isNaN(motorHp)) return false;
                    
                    const minHp = engineSpec.minHp ?? 0;
                    const maxHp = engineSpec.maxHp ?? 0;

                    // If maxHp is 0 or not defined, treat it as having no upper limit for that spec
                    if (maxHp === 0) {
                        return motorHp >= minHp;
                    }
                    
                    return motorHp >= minHp && motorHp <= maxHp;
                })
            );

            if(config.type === 'Single') {
                combinations = compatibleMotorsPerEngine[0].map(m => [m]);
            } else if (config.type === 'Twin' && config.engines.length === 2) {
                 // Assuming twin engines share the same specs
                const compatibleList = compatibleMotorsPerEngine[0];
                const uniquePairs: Motor[][] = [];
                for(let i = 0; i < compatibleList.length; i++) {
                    for (let j = i; j < compatibleList.length; j++) {
                        uniquePairs.push([compatibleList[i], compatibleList[j]]);
                    }
                }
                combinations = uniquePairs;
            } else if (config.type === 'SingleWithAux' && config.engines.length === 2) {
                combinations = cartesian(compatibleMotorsPerEngine[0], compatibleMotorsPerEngine[1]);
            }
            // Logic for Triple and Quad can be added similarly

            return {
                configType: config.type,
                combinations,
            };
        }).filter(c => c.combinations.length > 0);

    }, [motorDataSet, motorConfigurations, motorVendor]);


    const loading = vendorsLoading || motorsLoading;

    if (loading) {
        return (
            <div className="flex justify-center items-center h-48">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }
    
    if (!motorVendor) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Motor Options</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center h-48 text-center">
                    <AlertCircle className="h-10 w-10 text-muted-foreground" />
                    <p className="mt-4 font-semibold">No Motor Brand Associated</p>
                    <p className="text-sm text-muted-foreground">Please associate a 'Motor Brand' vendor with this module in the settings.</p>
                </CardContent>
            </Card>
        );
    }

    if (!motorDataSet || motorDataSet.length === 0) {
         return (
            <Card>
                <CardHeader>
                    <CardTitle>Motor Options for {motorVendor.name}</CardTitle>
                </CardHeader>
                 <CardContent className="flex flex-col items-center justify-center h-48 text-center">
                     <AlertCircle className="h-10 w-10 text-muted-foreground" />
                    <p className="mt-4 font-semibold">No Motor Data Found</p>
                    <p className="text-sm text-muted-foreground">The master data set for {motorVendor.name} is empty.</p>
                </CardContent>
            </Card>
        );
    }
    
    if (motorConfigurations.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Motor Options</CardTitle>
                </CardHeader>
                 <CardContent className="flex flex-col items-center justify-center h-48 text-center">
                     <AlertCircle className="h-10 w-10 text-muted-foreground" />
                    <p className="mt-4 font-semibold">HP Requirements Not Set</p>
                    <p className="text-sm text-muted-foreground">Please set the motor HP configurations for this boat in the 'Boat' tab first.</p>
                </CardContent>
            </Card>
        );
    }

    if (motorCombinations.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Motor Options</CardTitle>
                </CardHeader>
                 <CardContent className="flex flex-col items-center justify-center h-48 text-center">
                     <AlertCircle className="h-10 w-10 text-muted-foreground" />
                    <p className="mt-4 font-semibold">No Compatible Motors</p>
                    <p className="text-sm text-muted-foreground">No motors in the {motorVendor.name} data set match the boat's HP requirements.</p>
                </CardContent>
            </Card>
        );
    }
    
    return (
        <Card>
            <CardHeader>
                 <div className="flex items-start justify-between">
                    <div>
                        <CardTitle>Motor Options</CardTitle>
                        <CardDescription>
                            Compatible motor combinations from {motorVendor.name}.
                        </CardDescription>
                    </div>
                     {motorVendor.logoUrl && (
                        <div className="relative h-12 w-24">
                            <Image src={motorVendor.logoUrl} alt={`${motorVendor.name} logo`} fill className="object-contain" />
                        </div>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                <Accordion type="multiple" className="w-full space-y-4">
                    {motorCombinations.map((configGroup, index) => (
                        <AccordionItem value={`config-${index}`} key={configGroup.configType} className="border-none">
                            <AccordionTrigger className="text-lg font-semibold bg-muted p-4 rounded-md">
                                {configGroup.configType} Configurations ({configGroup.combinations.length})
                            </AccordionTrigger>
                            <AccordionContent className="pt-4">
                                 <div className="flex justify-end mb-4">
                                    <Button variant="outline" size="sm"><PlusCircle className="mr-2 h-4 w-4" /> Add Combination</Button>
                                </div>
                                <div className="space-y-4">
                                {configGroup.combinations.map((combo, comboIndex) => (
                                    <Card key={comboIndex} className="group relative">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100"><MoreHorizontal className="h-4 w-4"/></Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent>
                                                <DropdownMenuItem><Pencil className="mr-2 h-4 w-4"/> Edit</DropdownMenuItem>
                                                <DropdownMenuItem className="text-destructive"><Trash2 className="mr-2 h-4 w-4"/> Remove</DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                        <CardContent className="p-4 flex flex-wrap items-center justify-center gap-4">
                                            {combo.map((motor, motorIndex) => (
                                                <MotorCard key={`${motor.id}-${motorIndex}`} motor={motor} />
                                            ))}
                                        </CardContent>
                                    </Card>
                                ))}
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
            </CardContent>
        </Card>
    );
}
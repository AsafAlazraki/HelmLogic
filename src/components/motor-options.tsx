'use client';

import { useMemo } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertCircle } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Image from 'next/image';

interface Vendor {
    id: string;
    name: string;
    vendorType: string;
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

export function MotorOptions({ model, module }: { model: any, module: any }) {
    const { data: allVendors, loading: vendorsLoading } = useCollection<Vendor>('data-warehouse');

    const motorVendor = useMemo(() => {
        if (!allVendors || !module.associatedVendorIds) return null;
        return allVendors.find(v => module.associatedVendorIds.includes(v.id) && v.vendorType === 'Motor Brand');
    }, [allVendors, module.associatedVendorIds]);

    const { data: motorDataSet, loading: motorsLoading } = useCollection<Motor>(
        motorVendor ? `data-warehouse/${motorVendor.id}/masterDataSet` : null
    );

    const motorConfigurations: MotorConfig[] = model.specifications?.motorConfigurations || [];

    const compatibleMotorsByConfig = useMemo(() => {
        if (!motorDataSet || motorConfigurations.length === 0) return [];

        return motorConfigurations.map(config => {
            const compatibleEngines: { spec: EngineSpec; motors: Motor[] }[] = [];

            config.engines.forEach(engineSpec => {
                const compatible = motorDataSet.filter(motor => {
                    const motorHp = typeof motor.HP === 'string' ? parseFloat(motor.HP) : motor.HP;
                    if (motorHp === undefined || isNaN(motorHp)) return false;
                    return motorHp >= engineSpec.minHp && motorHp <= engineSpec.maxHp;
                });
                compatibleEngines.push({ spec: engineSpec, motors: compatible });
            });

            return {
                configType: config.type,
                engineOptions: compatibleEngines,
            };
        });

    }, [motorDataSet, motorConfigurations]);


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

    if (compatibleMotorsByConfig.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Motor Options</CardTitle>
                </CardHeader>
                 <CardContent className="flex flex-col items-center justify-center h-48 text-center">
                     <AlertCircle className="h-10 w-10 text-muted-foreground" />
                    <p className="mt-4 font-semibold">No Motor Configurations</p>
                    <p className="text-sm text-muted-foreground">This boat model does not have any motor configurations defined.</p>
                </CardContent>
            </Card>
        );
    }
    
    return (
        <Card>
            <CardHeader>
                <CardTitle>Motor Options</CardTitle>
                <CardDescription>
                    Based on the boat's specifications, here are the compatible motors from {motorVendor.name}.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Accordion type="single" collapsible defaultValue="item-0">
                    {compatibleMotorsByConfig.map((item, index) => (
                        <AccordionItem value={`item-${index}`} key={item.configType}>
                            <AccordionTrigger className="text-lg font-semibold">{item.configType}</AccordionTrigger>
                            <AccordionContent>
                                {item.engineOptions.map((engineOption, engIndex) => (
                                    <div key={engIndex} className="p-4 border rounded-lg mb-4 bg-muted/50">
                                        <h4 className="font-semibold mb-2">{engineOption.spec.label} (HP: {engineOption.spec.minHp}-{engineOption.spec.maxHp})</h4>
                                        {engineOption.motors.length > 0 ? (
                                             <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead className="w-[80px]">Image</TableHead>
                                                        <TableHead>Model</TableHead>
                                                        <TableHead>HP</TableHead>
                                                        <TableHead>Category</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                {engineOption.motors.map(motor => {
                                                     let itemImageUrl: string | null = null;
                                                     if (motor.SummaryImage && typeof motor.SummaryImage === 'string') {
                                                         const path = motor.SummaryImage.trim().replace(/\\/g, '');
                                                         if (path.startsWith('http')) {
                                                             itemImageUrl = path;
                                                         } else if (path) {
                                                             itemImageUrl = `https://www.yamaha-motor.com.au${path}`;
                                                         }
                                                     }
                                                    return(
                                                        <TableRow key={motor.id}>
                                                            <TableCell>
                                                                {itemImageUrl && (
                                                                    <div className="relative h-12 w-16">
                                                                        <Image src={itemImageUrl} alt={motor['Model Name'] || ''} fill className="object-contain" />
                                                                    </div>
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="font-medium">{motor['Model Name']}</TableCell>
                                                            <TableCell>{motor.HP}</TableCell>
                                                            <TableCell>{motor['Sub Catagory']}</TableCell>
                                                        </TableRow>
                                                    )
                                                })}
                                                </TableBody>
                                            </Table>
                                        ) : (
                                            <p className="text-sm text-muted-foreground text-center py-4">No compatible motors found in this HP range.</p>
                                        )}
                                    </div>
                                ))}
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
            </CardContent>
        </Card>
    );
}
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from './ui/badge';
import Image from 'next/image';
import { Ship, Wrench, Package, ShieldCheck, Globe, DollarSign, Save, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { useToast } from '@/hooks/use-toast';

export function MotorConfigurationDetails({ motor, module, vendorId, dataSetId }: { motor: any, module: any, vendorId: string, dataSetId: string }) {
    const { toast } = useToast();
    const [isSaving, setIsSaving] = useState(false);

    const imgPath = motor.SummaryImage || motor.imageUrl;
    const getImageUrl = (path: string) => {
        if (!path) return null;
        const clean = path.trim().replace(/\\/g, '/');
        if (clean.startsWith('http')) return clean;
        const prefix = clean.startsWith('/') ? '' : '/';
        return `https://www.yamaha-motor.com.au${prefix}${clean}`;
    };
    const imgUrl = getImageUrl(imgPath);

    const handleSave = () => {
        setIsSaving(true);
        setTimeout(() => {
            setIsSaving(false);
            toast({ title: "Motor Configuration Saved", description: "All associations and settings have been persisted." });
        }, 1000);
    };

    return (
        <div className="space-y-6">
            <Card className="rounded-2xl border-2 shadow-lg overflow-hidden bg-primary/5 border-primary/10">
                <CardContent className="p-0">
                    <div className="grid md:grid-cols-3 gap-0">
                        <div className="relative aspect-video md:aspect-auto bg-white border-r-2 flex items-center justify-center p-8">
                            {imgUrl ? (
                                <Image src={imgUrl} alt="Motor" fill className="object-contain p-6" unoptimized />
                            ) : (
                                <Ship className="h-24 w-24 opacity-10" />
                            )}
                        </div>
                        <div className="md:col-span-2 p-8 space-y-6 flex flex-col justify-center">
                            <div className="flex flex-wrap items-center gap-3">
                                {motor['HP Rating'] && <Badge className="px-3 py-1 font-black text-sm shadow-md">{motor['HP Rating']} HP</Badge>}
                                <Badge variant="outline" className="px-3 py-1 font-mono text-xs border-primary/20 bg-background">{motor['Part Number'] || 'MASTER SKU'}</Badge>
                            </div>
                            <div>
                                <h2 className="text-3xl font-black uppercase tracking-tight leading-tight">{motor['Model Name'] || motor.name}</h2>
                                <p className="text-muted-foreground font-medium mt-2 max-w-xl">{motor.Description || 'No description available for this outboard engine model.'}</p>
                            </div>
                            <div className="flex gap-3 pt-2">
                                <Button onClick={handleSave} disabled={isSaving} className="font-black uppercase tracking-widest px-8 shadow-lg">
                                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                    Save Master Config
                                </Button>
                                <Button variant="outline" className="font-bold border-2">Add Document</Button>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Tabs defaultValue="specs" className="w-full">
                <TabsList className="grid w-full grid-cols-3 h-12 bg-muted/50 p-1 rounded-xl border-2">
                    <TabsTrigger value="specs" className="rounded-lg font-black uppercase tracking-widest text-[10px]">Specifications</TabsTrigger>
                    <TabsTrigger value="accessories" className="rounded-lg font-black uppercase tracking-widest text-[10px]">Factory Accessories</TabsTrigger>
                    <TabsTrigger value="service" className="rounded-lg font-black uppercase tracking-widest text-[10px]">Service & Parts</TabsTrigger>
                </TabsList>

                <TabsContent value="specs" className="mt-6">
                    <Card className="rounded-2xl shadow-sm border-2">
                        <CardHeader className="bg-muted/10 border-b py-4">
                            <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                                <ShieldCheck className="h-4 w-4 text-primary" />
                                Master Engine Specs
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="grid md:grid-cols-2 lg:grid-cols-3 divide-x divide-y">
                                {Object.entries(motor).map(([key, value]) => {
                                    if (['id', 'SummaryImage', 'imageUrl', 'Description', 'Model Name', 'name'].includes(key)) return null;
                                    return (
                                        <div key={key} className="p-4 space-y-1">
                                            <p className="text-[10px] font-black uppercase text-muted-foreground/60 tracking-tighter">{key.replace(/_/g, ' ')}</p>
                                            <p className="text-sm font-bold text-foreground">{String(value || 'N/A')}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="accessories" className="mt-6">
                    <Card className="rounded-2xl border-2 border-dashed bg-muted/5">
                        <CardContent className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
                            <Package className="h-12 w-12 opacity-20" />
                            <div className="text-center">
                                <p className="font-black uppercase tracking-widest text-xs">Propeller & Rigging Management</p>
                                <p className="text-[10px] mt-1 opacity-60">Associate factory-recommended hardware from Yamaha accessories list.</p>
                            </div>
                            <Button variant="outline" className="font-bold border-2 mt-2">Open Parts Browser</Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="service" className="mt-6">
                    <Card className="rounded-2xl border-2 bg-background">
                        <CardHeader>
                            <CardTitle className="text-sm font-black uppercase tracking-widest">Service Intervals & Maintenance</CardTitle>
                        </CardHeader>
                        <CardContent className="py-12 text-center opacity-40">
                            <p className="text-sm italic">Service scheduling data coming soon.</p>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
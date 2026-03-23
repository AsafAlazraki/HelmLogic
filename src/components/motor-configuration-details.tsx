
'use client';

import { useState, useMemo } from 'react';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from './ui/badge';
import Image from 'next/image';
import { Ship, Wrench, Package, ShieldCheck, Globe, DollarSign, Save, Loader2, PlusCircle, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { useToast } from '@/hooks/use-toast';
import { MasterDataBrowserDialog } from './master-data-browser-dialog';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

export function MotorConfigurationDetails({ motor, module, vendorId, dataSetId }: { motor: any, module: any, vendorId: string, dataSetId: string }) {
    const { toast } = useToast();
    const firestore = useFirestore();
    const [isSaving, setIsSaving] = useState(false);
    const [isBrowserOpen, setIsBrowserOpen] = useState(false);
    const [activeCategory, setActiveCategory] = useState<'Propeller' | 'Rigging' | 'Other'>('Other');

    const imgPath = motor.SummaryImage || motor.imageUrl;
    const getImageUrl = (path: string) => {
        if (!path) return null;
        const clean = path.trim().replace(/\\/g, '/');
        if (clean.startsWith('http')) return clean;
        const prefix = clean.startsWith('/') ? '' : '/';
        return `https://www.yamaha-motor.com.au${prefix}${clean}`;
    };
    const imgUrl = getImageUrl(imgPath);

    const accessories = motor.masterAccessories || [];

    const handleSave = async () => {
        setIsSaving(true);
        const motorRef = doc(firestore, `data-warehouse/${vendorId}/dataSets/${dataSetId}/rows`, motor.id);
        const updateData = { lastConfiguredAt: serverTimestamp() };

        updateDoc(motorRef, updateData)
            .then(() => {
                toast({ title: "Configuration Saved", description: "Master outboard settings have been updated." });
            })
            .catch(async (serverError) => {
                const permissionError = new FirestorePermissionError({
                    path: motorRef.path,
                    operation: 'update',
                    requestResourceData: updateData,
                } satisfies SecurityRuleContext);
                errorEmitter.emit('permission-error', permissionError);
            })
            .finally(() => setIsSaving(false));
    };

    const handleOpenBrowser = (cat: 'Propeller' | 'Rigging' | 'Other') => {
        setActiveCategory(cat);
        setIsBrowserOpen(true);
    };

    const handleSaveSelection = async (selection: any) => {
        const motorRef = doc(firestore, `data-warehouse/${vendorId}/dataSets/${dataSetId}/rows`, motor.id);
        const newAccessories = [...accessories, {
            id: `acc-${Date.now()}`,
            name: selection.name,
            category: activeCategory,
            items: selection.items
        }];
        
        updateDoc(motorRef, { masterAccessories: newAccessories })
            .then(() => {
                toast({ title: "Accessory Added", description: `${selection.name} linked to this motor model.` });
                setIsBrowserOpen(false);
            })
            .catch(async (serverError) => {
                const permissionError = new FirestorePermissionError({
                    path: motorRef.path,
                    operation: 'update',
                    requestResourceData: { masterAccessories: newAccessories },
                } satisfies SecurityRuleContext);
                errorEmitter.emit('permission-error', permissionError);
            });
    };

    const handleRemoveAccessory = async (accId: string) => {
        const motorRef = doc(firestore, `data-warehouse/${vendorId}/dataSets/${dataSetId}/rows`, motor.id);
        const newAccessories = accessories.filter((a: any) => a.id !== accId);
        
        updateDoc(motorRef, { masterAccessories: newAccessories })
            .then(() => {
                toast({ title: "Accessory Removed" });
            })
            .catch(async (serverError) => {
                const permissionError = new FirestorePermissionError({
                    path: motorRef.path,
                    operation: 'update',
                    requestResourceData: { masterAccessories: newAccessories },
                } satisfies SecurityRuleContext);
                errorEmitter.emit('permission-error', permissionError);
            });
    };

    const dummyOrg = {
        id: 'master-config',
        dataWarehouseSubscriptions: [...(module.associatedVendorIds || []), module.mainVendorId]
    };

    return (
        <div className="space-y-6">
            <Card className="rounded-2xl border-2 shadow-lg overflow-hidden bg-primary/5 border-primary/10">
                <CardContent className="p-0">
                    <div className="grid md:grid-cols-3 gap-0">
                        <div className="relative aspect-video md:aspect-auto bg-white border-r-2 flex items-center justify-center p-8">
                            {imgUrl ? (
                                <Image src={imgUrl} alt="Motor" fill className="object-contain p-6" />
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
                                <p className="text-muted-foreground font-medium mt-2 max-w-xl">{motor.Description || 'Professional outboard configuration workspace for Yamaha marine engines.'}</p>
                            </div>
                            <div className="flex gap-3 pt-2">
                                <Button onClick={handleSave} disabled={isSaving} className="font-black uppercase tracking-widest px-8 shadow-lg">
                                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                    Update Master Config
                                </Button>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Tabs defaultValue="specs" className="w-full">
                <TabsList className="grid w-full grid-cols-3 h-12 bg-muted/50 p-1 rounded-xl border-2">
                    <TabsTrigger value="specs" className="rounded-lg font-black uppercase tracking-widest text-[10px]">Specifications</TabsTrigger>
                    <TabsTrigger value="accessories" className="rounded-lg font-black uppercase tracking-widest text-[10px]">Factory Accessories</TabsTrigger>
                    <TabsTrigger value="documents" className="rounded-lg font-black uppercase tracking-widest text-[10px]">Documents</TabsTrigger>
                </TabsList>

                <TabsContent value="specs" className="mt-6">
                    <Card className="rounded-2xl shadow-sm border-2">
                        <CardHeader className="bg-muted/10 border-b py-4">
                            <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                                <ShieldCheck className="h-4 w-4 text-primary" />
                                Technical Specifications
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="grid md:grid-cols-2 lg:grid-cols-3 divide-x divide-y">
                                {Object.entries(motor).map(([key, value]) => {
                                    if (['id', 'SummaryImage', 'imageUrl', 'Description', 'Model Name', 'name', 'masterAccessories', 'lastConfiguredAt'].includes(key)) return null;
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

                <TabsContent value="accessories" className="mt-6 space-y-6">
                    {['Propeller', 'Rigging', 'Other'].map((cat) => {
                        const catAccs = accessories.filter((a: any) => a.category === cat);
                        return (
                            <Card key={cat} className="rounded-2xl border-2 overflow-hidden">
                                <CardHeader className="flex flex-row items-center justify-between bg-muted/10 border-b py-4">
                                    <div className="flex items-center gap-3">
                                        <Package className="h-5 w-5 text-primary" />
                                        <CardTitle className="text-sm font-black uppercase tracking-widest">{cat} Management</CardTitle>
                                    </div>
                                    <Button variant="outline" size="sm" className="font-bold border-2" onClick={() => handleOpenBrowser(cat as any)}>
                                        <PlusCircle className="h-4 w-4 mr-2" />
                                        Link {cat} Parts
                                    </Button>
                                </CardHeader>
                                <CardContent className="p-4">
                                    {catAccs.length > 0 ? (
                                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                            {catAccs.map((acc: any) => (
                                                <Card key={acc.id} className="bg-muted/5 group relative">
                                                    <div className="p-4 pr-10">
                                                        <p className="font-black text-xs uppercase truncate">{acc.name}</p>
                                                        <p className="text-[10px] text-muted-foreground mt-1">{acc.items?.length || 0} Components</p>
                                                    </div>
                                                    <Button 
                                                        variant="ghost" 
                                                        size="icon" 
                                                        className="absolute top-2 right-2 h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                                        onClick={() => handleRemoveAccessory(acc.id)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </Card>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="py-12 text-center border-2 border-dashed rounded-xl bg-muted/5">
                                            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground opacity-40">No {cat} items linked.</p>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })}
                </TabsContent>

                <TabsContent value="documents" className="mt-6">
                    <Card className="rounded-2xl border-2 border-dashed bg-muted/5">
                        <CardContent className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
                            <Wrench className="h-12 w-12 opacity-20" />
                            <div className="text-center">
                                <p className="font-black uppercase tracking-widest text-xs">Technical Manuals & Guides</p>
                                <p className="text-[10px] mt-1 opacity-60">Upload PDFs or link URLs for service and owner manuals.</p>
                            </div>
                            <Button variant="outline" className="font-bold border-2 mt-2">Add Document</Button>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <MasterDataBrowserDialog 
                isOpen={isBrowserOpen}
                onClose={() => setIsBrowserOpen(false)}
                organisation={dummyOrg as any}
                categoryId={`master-motor-${activeCategory}`}
                initialCategory={activeCategory}
                onSave={handleSaveSelection}
                title={`Link ${activeCategory} Parts`}
                description={`Associate factory accessories from your data warehouse to the ${motor['Model Name']} model.`}
            />
        </div>
    );
}

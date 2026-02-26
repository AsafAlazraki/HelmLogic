'use client';

import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc, setDoc, collection, addDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect, useMemo } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import type { User } from 'firebase/auth';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Save, Wrench, Hash, ChevronDown, ShieldCheck, Tag, Globe, DollarSign } from 'lucide-react';

import { HighfieldModelEditor, highfieldModelSchema } from '@/components/highfield-model-editor';
import { JeanneauModelEditor, jeanneauModelSchema } from '@/components/jeanneau-model-editor';
import { StacerModelEditor, stacerModelSchema } from '@/components/stacer-model-editor';
import { StabicraftModelEditor, stabicraftModelSchema } from '@/components/stabicraft-model-editor';
import { SurteesModelEditor, surteesModelSchema } from '@/components/surtees-model-editor';
import { MotorOptions } from './motor-options';
import { DealerFitOptions } from './dealer-fit-options';
import { FormField, FormItem, FormControl, FormLabel, FormMessage } from '@/components/ui/form';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface Permissions {
    can_access_module: boolean;
    can_create_quotes: boolean;
    can_edit_boat_data: boolean;
    can_view_subdealers: boolean;
}

interface Organisation {
    id: string;
    name: string;
    tradingCurrency?: string;
    gstPercentage?: number;
}

const motorConfigOptions = [
    { id: 'Single', label: 'Single Engine', engineCount: 1, engineLabels: ['Engine'] },
    { id: 'Twin', label: 'Twin Engines', engineCount: 2, engineLabels: ['Engine 1', 'Engine 2'] },
    { id: 'Triple', label: 'Triple Engines', engineCount: 3, engineLabels: ['Engine 1', 'Engine 2', 'Engine 3'] },
    { id: 'Quad', label: 'Quad Engines', engineCount: 4, engineLabels: ['Engine 1', 'Engine 2', 'Engine 3', 'Engine 4'] },
    { id: 'SingleWithAux', label: 'Single with Aux', engineCount: 2, engineLabels: ['Main Engine', 'Auxiliary Engine'] },
];

function sanitizeDataForFirestore(data: any): any {
  if (data === undefined) return null;
  if (data === null || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(item => sanitizeDataForFirestore(item));
  const sanitizedData: { [key: string]: any } = {};
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      const value = data[key];
      if (value !== undefined) sanitizedData[key] = sanitizeDataForFirestore(value);
    }
  }
  return sanitizedData;
}

const getVendorSchema = (slug?: string) => {
    const base = z.object({
        name: z.string().min(1, 'Model Name is required'),
        modelCode: z.string().min(1, 'Model Code is required'),
    });

    switch (slug) {
        case 'highfield': return base.merge(highfieldModelSchema);
        case 'jeanneau': return base.merge(jeanneauModelSchema);
        case 'stacer': return base.merge(stacerModelSchema);
        case 'stabicraft': return base.merge(stabicraftModelSchema);
        case 'surtees': return base.merge(surteesModelSchema);
        default: return base;
    }
};

const getSafeDefaultValues = (modelData: any, vendorSlug?: string): any => {
    const data = modelData || {};
    const specs = data.specifications || {};
    
    const base = {
        name: data.name ?? '',
        modelCode: data.modelCode ?? '',
        coverImageUrl: data.coverImageUrl ?? null,
        galleryImageUrls: data.galleryImageUrls ?? [],
        cost: data.cost ?? null,
        sellPriceExclGst: data.sellPriceExclGst ?? null,
        freightCostExclGst: data.freightCostExclGst ?? null,
        specifications: {
            motorConfigurations: (specs.motorConfigurations ?? []).map((config: any) => {
                if (config.engines && Array.isArray(config.engines) && config.engines.length > 0) return config;
                const option = motorConfigOptions.find(o => o.id === config.type);
                if (option) {
                    return {
                        ...config,
                        engines: Array.from({ length: option.engineCount }, (_, i) => ({
                            label: option.engineLabels[i],
                            minHp: config.minHp ?? 0,
                            maxHp: config.maxHp ?? 0,
                            recommendedHp: config.recommendedHp ?? 0
                        }))
                    };
                }
                return config;
            }),
            otherSpecs: specs.otherSpecs ?? [],
        },
        standardFeatures: data.standardFeatures ?? [],
        documents: (data.documents || []).map((d: any) => ({ ...d, id: d.id || `doc-${Math.random()}` })),
    };

    if (vendorSlug === 'highfield') {
        return {
            ...base,
            optionalFeatures: (data.optionalFeatures ?? []).map((f: any) => ({
                ...f,
                code: f.code ?? '',
                color: f.color ?? '',
            })),
            rules: data.rules ?? [],
        };
    }

    if (vendorSlug === 'stabicraft') {
        const packageLevels = data.packageLevels || [];
        return {
            ...base,
            packageLevels: packageLevels.map((p: any) => ({
                ...p,
                description: p.description ?? '',
                cost: p.cost ?? null,
                sellPriceExclGst: p.sellPriceExclGst ?? null,
            })),
            optionalFeatures: (data.optionalFeatures || []).map((f: any) => {
                const packageStatus = f.packageStatus || {};
                packageLevels.forEach((p: any) => {
                    if (!(p.id in packageStatus)) packageStatus[p.id] = 'optional';
                });
                return { ...f, packageStatus };
            }),
            uDekOptions: data.uDekOptions ?? { blackOnWinterGrey: null, teakOnBlack: null, steelGreyOnWinterGrey: null, winterGreyOnSteelGrey: null },
            paintAndGraphicOptions: data.paintAndGraphicOptions ?? { standardGloss: [], standardMetallic: [], powderCoating: [] },
        };
    }

    if (vendorSlug === 'jeanneau' || vendorSlug === 'surtees' || vendorSlug === 'stacer') {
        return {
            ...base,
            packages: (data.packages || []).map((p: any) => ({ 
                ...p, 
                category: p.category || undefined,
                includedFeatures: p.includedFeatures ?? [],
                cost: p.cost ?? null,
                sellPriceExclGst: p.sellPriceExclGst ?? null,
            })),
            optionalFeatures: (data.optionalFeatures || []).map((f: any) => ({
                ...f,
                cost: f.cost ?? null,
                sellPriceExclGst: f.sellPriceExclGst ?? null,
            })),
            colors: (data.colors || []).map((c: any) => ({
                ...c,
                id: c.id,
                name: c.name,
                imageUrls: c.imageUrls || [],
                cost: c.cost ?? null,
                sellPriceExclGst: c.sellPriceExclGst ?? null,
            })),
        };
    }

    return base;
};

export function ModelConfigurationEditor({ 
    model, 
    docPath, 
    vendor, 
    module, 
    breadcrumbs, 
    user, 
    isAdmin, 
    organisationId,
    permissions = { can_access_module: true, can_create_quotes: true, can_edit_boat_data: true, can_view_subdealers: true }
}: { 
    model: any, 
    docPath: string, 
    vendor: any, 
    module: any, 
    breadcrumbs: React.ReactNode, 
    user: User | null, 
    isAdmin: boolean, 
    organisationId?: string,
    permissions?: Permissions
}) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const orgRef = useMemoFirebase(() => organisationId ? doc(firestore, 'organisations', organisationId) : null, [firestore, organisationId]);
    const { data: organisation } = useDoc<Organisation>(orgRef);

    const currentSchema = getVendorSchema(vendor?.slug);
    const isModuleView = module?.id !== 'master';

    const masterCurrency = vendor?.currency || 'AUD';
    const tradingCurrency = isAdmin ? masterCurrency : (organisation?.tradingCurrency || 'AUD');
    const gstPercentage = organisation?.gstPercentage ?? 10;

    const form = useForm({
        resolver: zodResolver(currentSchema),
        defaultValues: getSafeDefaultValues(model, vendor?.slug),
    });
    
    const { reset, control } = form;

    useEffect(() => {
        if (model) {
            reset(getSafeDefaultValues(model, vendor?.slug));
        }
    }, [model, vendor?.slug, reset]);

    const onSubmit = async (values: any) => {
        const canEdit = isAdmin || permissions.can_edit_boat_data;

        if (!canEdit) {
            toast({ variant: "destructive", title: "Access Denied", description: "You do not have permission to edit boat data." });
            return;
        }

        setIsSubmitting(true);

        try {
            const sanitizedValues = sanitizeDataForFirestore(values);

            if (isAdmin) {
                const modelDocRef = doc(firestore, docPath);
                await setDoc(modelDocRef, sanitizedValues, { merge: true });
                toast({ title: "Master Configuration Updated", description: "Changes have been saved to the Data Warehouse." });
            } else {
                if (!organisationId || !user) throw new Error("Missing context for organization save");
                const quotesColRef = collection(firestore, `organisations/${organisationId}/quotes`);
                await addDoc(quotesColRef, {
                    quoteNumber: `CONFIG-${Date.now()}`,
                    status: 'Draft',
                    createdById: user.uid,
                    createdAt: new Date().toISOString(),
                    organisationId: organisationId,
                    modelConfiguration: sanitizedValues,
                    customerName: 'Local Configuration',
                    pricingSummary: {},
                });
                toast({ title: "Local Configuration Saved", description: "Successfully saved to your organisation workspace." });
            }
        } catch (e: any) {
            console.error("Save failed:", e);
            toast({ variant: "destructive", title: "Error", description: e.message || "Could not save changes." });
            if (e.code === 'permission-denied') {
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: docPath, operation: 'update', requestResourceData: values,
                }));
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const onInvalid = (errors: any) => {
        const errorEntries = Object.entries(errors);
        let errorMsg = "Please check the required fields.";
        
        if (errorEntries.length > 0) {
            const [field, error]: [string, any] = errorEntries[0];
            errorMsg = `Error in ${field.replace(/_/g, ' ')}: ${error.message || 'Invalid value'}`;
        }
        
        toast({ 
            variant: "destructive", 
            title: "Validation Error", 
            description: errorMsg
        });
    };

    const getModelEditor = () => {
        if (!model || !vendor || !docPath) return <p>Select a model to view details.</p>;
        
        const parts = docPath.split('/');
        const vId = parts[1];
        const rId = parts[3];

        const commonProps = { 
            model, 
            vendorId: vId,
            rangeId: rId,
            isModuleView: !!isModuleView,
            gstPercentage,
            tradingCurrency,
            masterCurrency
        };
        switch (vendor.slug) {
            case 'highfield': return <HighfieldModelEditor {...commonProps} />;
            case 'jeanneau': return <JeanneauModelEditor {...commonProps} />;
            case 'stacer': return <StacerModelEditor {...commonProps} />;
            case 'stabicraft': return <StabicraftModelEditor {...commonProps} />;
            case 'surtees': return <SurteesModelEditor {...commonProps} />;
            default: return <Card><CardHeader><CardTitle>Editor Not Available</CardTitle></CardHeader><CardContent>A specific editor has not been configured for this vendor brand.</CardContent></Card>;
        }
    };

    const canEdit = isAdmin || permissions.can_edit_boat_data;

    return (
        <FormProvider {...form}>
            <form onSubmit={form.handleSubmit(onSubmit, onInvalid)}>
                <div className="space-y-6">
                    <Card className="border-primary/20 bg-primary/5">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 bg-primary text-primary-foreground rounded-md flex items-center justify-center shadow-sm">
                                        <Wrench className="h-6 w-6" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold">{model.name}</h2>
                                        {breadcrumbs}
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    {isModuleView && (
                                        <div className="flex items-center gap-3 px-3 py-1.5 rounded-full bg-background border border-primary/20 shadow-sm">
                                            <div className="flex items-center gap-1.5">
                                                <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                                                <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-tighter">Master: {masterCurrency}</span>
                                            </div>
                                            <div className="h-3 w-px bg-border" />
                                            <div className="flex items-center gap-1.5">
                                                <DollarSign className="h-3.5 w-3.5 text-primary" />
                                                <span className="text-[10px] font-bold uppercase text-primary tracking-tighter">Trading: {tradingCurrency}</span>
                                            </div>
                                        </div>
                                    )}
                                    {isModuleView && (permissions.can_create_quotes || isAdmin) && (
                                        <Button type="button" variant="outline" onClick={() => {}} className="hover:bg-accent hover:text-accent-foreground transition-colors">
                                            Create Quote
                                        </Button>
                                    )}
                                    {canEdit && (
                                        <Button type="submit" disabled={isSubmitting} className="hover:opacity-90 transition-opacity">
                                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            <Save className="mr-2 h-4 w-4" />
                                            {isAdmin ? 'Save Master Changes' : 'Save Configuration'}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Tabs defaultValue="boat" className="w-full">
                        <TabsList className={cn("grid w-full", isModuleView ? "grid-cols-4" : "grid-cols-1 max-w-[200px]")}>
                            <TabsTrigger value="boat">Series Details</TabsTrigger>
                            {isModuleView && (
                                <>
                                    <TabsTrigger value="motor">Motor Options</TabsTrigger>
                                    <TabsTrigger value="trailer">Trailer Options</TabsTrigger>
                                    <TabsTrigger value="dealer-fit">Dealer Fit Options</TabsTrigger>
                                </>
                            )}
                        </TabsList>
                        
                        <TabsContent value="boat" className="mt-6 space-y-8">
                            <Collapsible className="group overflow-hidden rounded-xl border bg-card shadow-sm" defaultOpen>
                                <div className="flex items-center justify-between py-4 px-6 border-b bg-card select-none">
                                    <div className="flex items-center gap-3">
                                        <CollapsibleTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full border shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors group-data-[state=open]:bg-muted">
                                                <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                                            </Button>
                                        </CollapsibleTrigger>
                                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                                            <ShieldCheck className="h-5 w-5 text-primary" />
                                            Range Identity
                                        </CardTitle>
                                    </div>
                                </div>
                                <CollapsibleContent>
                                    <CardContent className="pt-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <FormField
                                                control={control}
                                                name="name"
                                                render={({ field }) => (
                                                    <FormItem className="space-y-3">
                                                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                                            <Tag className="h-3 w-3" />
                                                            Series Display Name
                                                        </FormLabel>
                                                        <FormControl>
                                                            <Input 
                                                                {...field} 
                                                                placeholder="Enter model name..." 
                                                                className="h-10 font-bold border-2 focus-visible:ring-primary/20 bg-muted/10" 
                                                                disabled={!canEdit}
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={control}
                                                name="modelCode"
                                                render={({ field }) => (
                                                    <FormItem className="space-y-3">
                                                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                                            <Hash className="h-3 w-3" />
                                                            Master Model Code
                                                        </FormLabel>
                                                        <FormControl>
                                                            <Input 
                                                                {...field} 
                                                                placeholder="Enter master code..." 
                                                                className="h-10 font-mono font-bold uppercase border-2 focus-visible:ring-primary/20 bg-muted/10" 
                                                                disabled={!canEdit}
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </div>
                                    </CardContent>
                                </CollapsibleContent>
                            </Collapsible>

                            {getModelEditor()}
                        </TabsContent>

                        {isModuleView && (
                            <>
                                <TabsContent value="motor" className="mt-6">
                                    <MotorOptions model={model} module={module} />
                                </TabsContent>
                                <TabsContent value="trailer" className="mt-6">
                                    <Card>
                                        <CardHeader>
                                            <CardTitle>Trailer Options</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="flex items-center justify-center h-48 border-2 border-dashed rounded-lg text-muted-foreground bg-muted/5">
                                                <p>Trailer configuration coming soon.</p>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </TabsContent>
                                <TabsContent value="dealer-fit" className="mt-6">
                                    <DealerFitOptions 
                                        module={module} 
                                        organisationId={organisationId} 
                                        isAdmin={isAdmin} 
                                    />
                                </TabsContent>
                            </>
                        )}
                    </Tabs>
                </div>
            </form>
        </FormProvider>
    );
}

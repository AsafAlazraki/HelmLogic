
'use client';

import { useForm, FormProvider, useController } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useFirestore } from '@/firebase';
import { doc, setDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect, useRef } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';
import type { User } from 'firebase/auth';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Save, Wrench, Hash, ChevronDown, ShieldCheck, Tag, Building } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

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
        motorFactoryOptions: z.record(z.string(), z.array(z.any())).optional().default({}),
        motorOverrides: z.record(z.string(), z.object({
            hiddenIds: z.array(z.string()).default([]),
            manualIds: z.array(z.string()).default([]),
        })).optional().default({}),
        variantOverrides: z.record(z.string(), z.object({
            imageUrl: z.string().nullable().optional(),
        })).optional().default({}),
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
        motorFactoryOptions: data.motorFactoryOptions ?? {},
        motorOverrides: data.motorOverrides ?? {},
        variantOverrides: data.variantOverrides ?? {},
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
    isMasterContext = false,
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
    isMasterContext?: boolean,
    permissions?: Permissions
}) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Stability guard to prevent Firestore real-time updates from clobbering 
    // the local form state during the round-trip delay.
    const isRecentlySaved = useRef(false);
    const saveTimer = useRef<NodeJS.Timeout | null>(null);

    const isModuleView = module?.id !== 'master';
    const currentSchema = getVendorSchema(vendor?.slug);

    const form = useForm({
        resolver: zodResolver(currentSchema),
        defaultValues: getSafeDefaultValues(model, vendor?.slug),
    });
    
    const { reset, control, formState: { isDirty } } = form;

    // Synchronize form with model data ONLY if user isn't currently editing
    // and we haven't just performed a save.
    useEffect(() => {
        if (model && !isSubmitting && !isDirty && !isRecentlySaved.current) {
            const currentDefaults = getSafeDefaultValues(model, vendor?.slug);
            reset(currentDefaults);
        }
    }, [model, vendor?.slug, reset, isSubmitting, isDirty]);

    const onSubmit = async (values: any) => {
        const canEdit = isAdmin || permissions.can_edit_boat_data;

        if (!canEdit) {
            toast({ variant: "destructive", title: "Access Denied", description: "You do not have permission to edit configuration." });
            return;
        }

        setIsSubmitting(true);

        try {
            const sanitizedValues = sanitizeDataForFirestore(values);
            const shouldSaveToMaster = isAdmin && (isMasterContext || module.id === 'master');

            // Stability Flag: Block resets for 3 seconds to allow cloud indexing to catch up
            isRecentlySaved.current = true;
            if (saveTimer.current) clearTimeout(saveTimer.current);

            if (shouldSaveToMaster) {
                // Case 1: Updating Global Data Warehouse
                const modelDocRef = doc(firestore, docPath);
                await setDoc(modelDocRef, { 
                    ...sanitizedValues, 
                    lastMasterUpdate: serverTimestamp() 
                }, { merge: true });
                
                toast({ title: "Master Configuration Updated", description: "Changes persisted to global catalog." });
            } else if (organisationId) {
                // Case 2: Updating Organisation Overrides
                // We use setDoc WITHOUT merge: true for the organisation override to ensure 
                // the organisation's version represents the exact state of the form.
                const overrideRef = doc(firestore, `organisations/${organisationId}/modelOverrides/${model.id}`);
                await setDoc(overrideRef, {
                    ...sanitizedValues,
                    overrideAt: serverTimestamp(),
                    overriddenBy: user?.uid,
                    lastSync: serverTimestamp()
                });

                toast({ title: "Organisation Catalog Updated", description: "Changes saved to your organisation version." });
            } else {
                // Fallback: Create Quote
                if (!user) throw new Error("Missing auth context");
                const quotesColRef = collection(firestore, `users/${user.uid}/quotes`);
                await addDoc(quotesColRef, {
                    modelId: model.id,
                    configuration: sanitizedValues,
                    createdAt: serverTimestamp(),
                    status: 'Draft'
                });
                toast({ title: "Local Build Saved", description: "Quote draft created successfully." });
            }
            
            // Explicitly sync the local form with the sent values to clear dirty state
            reset(values);

            // Extended Stability Window
            saveTimer.current = setTimeout(() => {
                isRecentlySaved.current = false;
            }, 3000);

        } catch (e: any) {
            console.error("Save failed:", e);
            toast({ variant: "destructive", title: "Error", description: e.message || "Could not save changes." });
            isRecentlySaved.current = false;
        } finally {
            setIsSubmitting(false);
        }
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
            gstPercentage: 10
        };
        switch (vendor.slug) {
            case 'highfield': return <HighfieldModelEditor {...commonProps} />;
            case 'jeanneau': return <JeanneauModelEditor {...commonProps} />;
            case 'stacer': return <StacerModelEditor {...commonProps} />;
            case 'stabicraft': return <StabicraftModelEditor {...commonProps} />;
            case 'surtees': return <SurteesModelEditor {...commonProps} />;
            default: return <p>Editor Not Available</p>;
        }
    };

    const canEdit = isAdmin || permissions.can_edit_boat_data;
    const shouldSaveToMaster = isAdmin && (isMasterContext || module.id === 'master');

    return (
        <FormProvider {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
                <div className="space-y-6">
                    <Card className="border-primary/20 bg-primary/5 rounded-xl shadow-inner">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 bg-primary text-primary-foreground rounded-md flex items-center justify-center shadow-md">
                                        <Wrench className="h-6 w-6" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-xl font-bold">{model.name}</h2>
                                        </div>
                                        {breadcrumbs}
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    {canEdit && (
                                        <Button type="submit" disabled={isSubmitting} className="font-black uppercase tracking-widest shadow-lg min-w-[160px]">
                                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            <Save className="mr-2 h-4 w-4" />
                                            {shouldSaveToMaster ? 'Update Master' : 'Update Catalog'}
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
                                <CardHeader className="flex flex-row items-center justify-between py-4 px-6 border-b bg-card select-none">
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
                                </CardHeader>
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
                                                                disabled={!shouldSaveToMaster}
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
                                    <Card className="rounded-xl">
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

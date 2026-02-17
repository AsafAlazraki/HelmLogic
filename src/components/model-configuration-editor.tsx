'use client';

import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useFirestore } from '@/firebase/provider';
import { doc, updateDoc, collection, addDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import type { User } from 'firebase/auth';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Save } from 'lucide-react';

import { HighfieldModelEditor, highfieldModelSchema } from '@/components/highfield-model-editor';
import { JeanneauModelEditor, jeanneauModelSchema } from '@/components/jeanneau-model-editor';
import { StacerModelEditor, stacerModelSchema } from '@/components/stacer-model-editor';
import { StabicraftModelEditor, stabicraftModelSchema } from '@/components/stabicraft-model-editor';
import { SurteesModelEditor, surteesModelSchema } from '@/components/surtees-model-editor';
import { MotorOptions } from './motor-options';
import { DealerFitOptions } from './dealer-fit-options';

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
    switch (slug) {
        case 'highfield': return highfieldModelSchema;
        case 'jeanneau': return jeanneauModelSchema;
        case 'stacer': return stacerModelSchema;
        case 'stabicraft': return stabicraftModelSchema;
        case 'surtees': return surteesModelSchema;
        default: return z.object({});
    }
};

const getSafeDefaultValues = (modelData: any, vendorSlug?: string): any => {
    const data = modelData || {};
    const specs = data.specifications || {};
    
    const base = {
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
        const modelColors = data.colors || [];
        const modelPricing = data.variantPricing || [];
        const pricingMap = new Map();
        modelPricing.forEach((p: any) => {
            if (!p.colorId) return;
            if (!pricingMap.has(p.colorId)) pricingMap.set(p.colorId, {});
            const entry = pricingMap.get(p.colorId);
            if (p.material === 'HYP') entry.HYP = p;
            else if (p.material === 'PVC') entry.PVC = p;
        });
        return {
            ...base,
            optionalFeatures: data.optionalFeatures ?? [],
            colors: modelColors.map((color: any) => {
                const prices = pricingMap.get(color.id) || {};
                return {
                    id: color.id,
                    name: color.name,
                    imageUrl: color.imageUrl ?? color.imageUrls?.[0] ?? null,
                    pricing: {
                        HYP: { cost: prices.HYP?.cost ?? null, sellPriceExclGst: prices.HYP?.sellPriceExclGst ?? null },
                        PVC: { cost: prices.PVC?.cost ?? null, sellPriceExclGst: prices.PVC?.sellPriceExclGst ?? null },
                    }
                };
            }),
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
            colorStages: data.colorStages ?? { stage0: false, stage1: false, stage2: false, stage3: false },
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
    
    const currentSchema = getVendorSchema(vendor?.slug);

    const form = useForm({
        resolver: zodResolver(currentSchema),
        defaultValues: getSafeDefaultValues(model, vendor?.slug),
    });
    
    const { reset } = form;

    useEffect(() => {
        if (model) {
            reset(getSafeDefaultValues(model, vendor?.slug));
        }
    }, [model, vendor?.slug, reset]);

    const onSubmit = async (values: any) => {
        if (!permissions.can_edit_boat_data && !isAdmin) {
            toast({ variant: "destructive", title: "Access Denied", description: "You do not have permission to edit boat data." });
            return;
        }

        setIsSubmitting(true);

        try {
            let finalValues = values;

            // Specialized transformations for database storage
            if (vendor.slug === 'highfield' && values.colors) {
                const colorsForDb = values.colors.map((color: any) => ({
                    id: color.id,
                    name: color.name,
                    imageUrl: color.imageUrl,
                }));
                
                const variantPricingForDb: any[] = [];
                values.colors.forEach((color: any) => {
                    const { HYP, PVC } = color.pricing;
                    if (HYP && (HYP.cost != null || HYP.sellPriceExclGst != null)) {
                        variantPricingForDb.push({ colorId: color.id, colorName: color.name, material: 'HYP', ...HYP });
                    }
                    if (PVC && (PVC.cost != null || PVC.sellPriceExclGst != null)) {
                        variantPricingForDb.push({ colorId: color.id, colorName: color.name, material: 'PVC', ...PVC });
                    }
                });

                const { colors, ...restOfValues } = values;
                finalValues = {
                    ...restOfValues,
                    colors: colorsForDb,
                    variantPricing: variantPricingForDb
                };
            }

            const sanitizedValues = sanitizeDataForFirestore(finalValues);

            if (isAdmin) {
                const modelDocRef = doc(firestore, docPath);
                await updateDoc(modelDocRef, sanitizedValues);
                toast({ title: "Model Updated", description: "Master configuration has been saved." });
            } else {
                if (!organisationId || !user) throw new Error("Missing user context");
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
                toast({ title: "Configuration Saved", description: "Saved to your organization's collection." });
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
        console.error("Form Validation Errors:", errors);
        toast({ variant: "destructive", title: "Validation Error", description: "Please check the form for errors." });
    };

    const getModelEditor = () => {
        if (!model || !vendor || !docPath) return <p>Select a model to view details.</p>;
        switch (vendor.slug) {
            case 'highfield': return <HighfieldModelEditor model={model} />;
            case 'jeanneau': return <JeanneauModelEditor model={model} />;
            case 'stacer': return <StacerModelEditor model={model} />;
            case 'stabicraft': return <StabicraftModelEditor model={model} />;
            case 'surtees': return <SurteesModelEditor model={model} />;
            default: return <Card><CardHeader><CardTitle>Editor Not Available</CardTitle></CardHeader><CardContent>A specific editor has not been configured for this vendor.</CardContent></Card>;
        }
    };

    return (
        <FormProvider {...form}>
            <form onSubmit={form.handleSubmit(onSubmit, onInvalid)}>
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            {breadcrumbs}
                            <div className="flex items-center gap-2">
                                {(permissions.can_create_quotes || isAdmin) && (
                                    <Button type="button" variant="outline" onClick={() => {}}>
                                        Start Quote
                                    </Button>
                                )}
                                {(permissions.can_edit_boat_data || isAdmin) && (
                                    <Button type="submit" disabled={isSubmitting}>
                                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        <Save className="mr-2 h-4 w-4" />
                                        Save Changes
                                    </Button>
                                )}
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6">
                        <Tabs defaultValue="boat" className="w-full">
                            <TabsList className="grid w-full grid-cols-4">
                                <TabsTrigger value="boat">Boat</TabsTrigger>
                                <TabsTrigger value="motor">Motor</TabsTrigger>
                                <TabsTrigger value="trailer">Trailer</TabsTrigger>
                                <TabsTrigger value="dealer-fit">Dealer Fit Options</TabsTrigger>
                            </TabsList>
                            <TabsContent value="boat" className="mt-6">
                                {getModelEditor()}
                            </TabsContent>
                            <TabsContent value="motor" className="mt-6">
                                <MotorOptions model={model} module={module} />
                            </TabsContent>
                            <TabsContent value="trailer" className="mt-6">
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Trailer Options</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-muted-foreground">Trailer configuration options will be available here soon.</p>
                                    </CardContent>
                                </Card>
                            </TabsContent>
                            <TabsContent value="dealer-fit" className="mt-6">
                                <DealerFitOptions module={module} organisationId={organisationId} />
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>
            </form>
        </FormProvider>
    );
}

'use client';

import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useFirestore } from '@/firebase/provider';
import { doc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

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

function sanitizeDataForFirestore(data: any): any {
  if (data === undefined) {
    return null;
  }
  if (data === null || typeof data !== 'object') {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map(item => sanitizeDataForFirestore(item));
  }
  const sanitizedData: { [key: string]: any } = {};
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      const value = data[key];
      if (value !== undefined) {
          sanitizedData[key] = sanitizeDataForFirestore(value);
      }
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
        default: return z.object({}); // Default empty schema
    }
}


export function ModelConfigurationEditor({ model, docPath, vendor, module, breadcrumbs }: { model: any, docPath: string, vendor: any, module: any, breadcrumbs: React.ReactNode }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const currentSchema = getVendorSchema(vendor?.slug);

    const form = useForm({
        resolver: zodResolver(currentSchema),
    });
    
    const { reset } = form;

    useEffect(() => {
        if (model) {
            // This will be handled inside each specific editor now
        }
    }, [model, reset]);


    const onSubmit = async (values: any) => {
        setIsSubmitting(true);

        let finalValues = values;

        // Special handling for Highfield variant pricing
        if (vendor.slug === 'highfield' && values.colors) {
            const colorsForDb = values.colors.map((color:any) => ({
                id: color.id,
                name: color.name,
                imageUrl: color.imageUrl,
            }));
            
            const variantPricingForDb: any[] = [];
            values.colors.forEach((color:any) => {
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
        } else if (vendor.slug === 'stabicraft' && values.colorStages) {
             const { colorStages, ...rest } = values;
             finalValues = rest;
        }

        const sanitizedValues = sanitizeDataForFirestore(finalValues);
        const modelDocRef = doc(firestore, docPath);

        try {
            await updateDoc(modelDocRef, sanitizedValues);
            toast({ title: "Model Updated", description: "Your changes have been saved." });
            reset(values);
        } catch (e) {
            const error = e as any;
            console.error("Save failed:", error);
            toast({ variant: "destructive", title: "Error", description: "Could not save changes." });
            const permissionError = new FirestorePermissionError({
                path: modelDocRef.path, operation: 'update', requestResourceData: sanitizedValues,
            });
            errorEmitter.emit('permission-error', permissionError);
        } finally {
            setIsSubmitting(false);
        }
    }

    const getModelEditor = () => {
        if (!model || !vendor || !docPath) return <p>Select a model to view details.</p>;

        switch (vendor.slug) {
            case 'highfield': return <HighfieldModelEditor model={model} docPath={docPath} />;
            case 'jeanneau': return <JeanneauModelEditor model={model} docPath={docPath} />;
            case 'stacer': return <StacerModelEditor model={model} docPath={docPath} />;
            case 'stabicraft': return <StabicraftModelEditor model={model} docPath={docPath} />;
            case 'surtees': return <SurteesModelEditor model={model} docPath={docPath} />;
            default: return <Card><CardHeader><CardTitle>Editor Not Available</CardTitle></CardHeader><CardContent>A specific editor has not been configured for this vendor.</CardContent></Card>;
        }
    };

    return (
        <FormProvider {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            {breadcrumbs}
                            <div className="flex items-center gap-2">
                                <Button type="button" variant="outline" onClick={() => {}}>
                                    Start Quote
                                </Button>
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    <Save className="mr-2 h-4 w-4" />
                                    Save Changes
                                </Button>
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
                                <DealerFitOptions module={module} />
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>
            </form>
        </FormProvider>
    );
}

'use client';

import { useFieldArray, useWatch, useFormContext } from 'react-hook-form';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PlusCircle, Trash2, ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const motorConfigSchema = z.object({
    type: z.enum(["Single", "Twin", "Triple", "Quad", "SingleWithAux"]),
    engines: z.array(z.object({
        label: z.string(),
        minHp: z.coerce.number().min(0).default(0),
        maxHp: z.coerce.number().min(0).default(0),
        recommendedHp: z.coerce.number().min(0).default(0),
    })),
});

const colorVariantSchema = z.object({
    id: z.string(),
    name: z.string().min(1, 'Color name is required'),
    imageUrls: z.array(z.string()).default([]),
    cost: z.coerce.number().nullable().optional(),
    sellPriceExclGst: z.coerce.number().nullable().optional(),
});

const packageSchema = z.object({
    id: z.string(),
    name: z.string().min(1, 'Package name is required'),
    category: z.string().optional(),
    cost: z.coerce.number().nullable().optional(),
    sellPriceExclGst: z.coerce.number().nullable().optional(),
    includedFeatures: z.array(z.string()).default([]),
});

export const jeanneauModelSchema = z.object({
    coverImageUrl: z.string().nullable().optional(),
    galleryImageUrls: z.array(z.string()).default([]),
    cost: z.coerce.number().nullable().optional(),
    sellPriceExclGst: z.coerce.number().nullable().optional(),
    freightCostExclGst: z.coerce.number().nullable().optional(),
    specifications: z.object({
        motorConfigurations: z.array(motorConfigSchema).default([]),
        otherSpecs: z.array(z.object({ id: z.string(), label: z.string(), value: z.string() })).default([]),
    }).optional(),
    standardFeatures: z.array(z.string()).default([]),
    packages: z.array(packageSchema).default([]),
    colors: z.array(colorVariantSchema).default([]),
    documents: z.array(z.object({ id: z.string(), name: z.string(), url: z.string() })).default([]),
});

export function JeanneauModelEditor({ model }: { model: any }) {
    const { control } = useFormContext<z.infer<typeof jeanneauModelSchema>>();
    const { fields: featureFields, append: appendFeature, remove: removeFeature } = useFieldArray({ control, name: "standardFeatures" });
    const { fields: packageFields, append: appendPackage, remove: removePackage } = useFieldArray({ control, name: "packages" });

    return (
        <div className="space-y-8">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Standard Features</CardTitle>
                    <Button type="button" variant="outline" size="sm" onClick={() => appendFeature('')}><PlusCircle className="mr-2 h-4 w-4" />Add Feature</Button>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {featureFields.map((field, index) => (
                        <div key={field.id} className="flex items-center gap-2">
                            <FormField control={control} name={`standardFeatures.${index}`} render={({ field }) => ( <FormItem className="flex-1"><FormControl><Input {...field} /></FormControl></FormItem> )} />
                            <Button type="button" variant="ghost" size="icon" onClick={() => removeFeature(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                    ))}
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Optional Packages</CardTitle>
                    <Button type="button" variant="outline" size="sm" onClick={() => appendPackage({ id: `pkg-${Date.now()}`, name: '', includedFeatures: [] })}><PlusCircle className="mr-2 h-4 w-4" />Add Package</Button>
                </CardHeader>
                <CardContent className="space-y-4">
                    {packageFields.map((field, index) => (
                        <Collapsible key={field.id} className="border rounded-md">
                            <div className="flex items-center justify-between p-4">
                                <FormField control={control} name={`packages.${index}.name`} render={({ field }) => <Input {...field} className="font-bold border-none" placeholder="Package Name" />} />
                                <div className="flex gap-2">
                                    <Button type="button" variant="ghost" size="icon" onClick={() => removePackage(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                    <CollapsibleTrigger asChild><Button variant="ghost" size="icon"><ChevronRight className="h-4 w-4" /></Button></CollapsibleTrigger>
                                </div>
                            </div>
                            <CollapsibleContent className="p-4 border-t space-y-4 bg-muted/10">
                                <div className="grid grid-cols-2 gap-4">
                                    <FormField control={control} name={`packages.${index}.cost`} render={({ field }) => <FormItem><FormLabel>Cost</FormLabel><Input type="number" {...field} value={field.value ?? ''} /></FormItem>} />
                                    <FormField control={control} name={`packages.${index}.sellPriceExclGst`} render={({ field }) => <FormItem><FormLabel>Sell Price</FormLabel><Input type="number" {...field} value={field.value ?? ''} /></FormItem>} />
                                </div>
                            </CollapsibleContent>
                        </Collapsible>
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}

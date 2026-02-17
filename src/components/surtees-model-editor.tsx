'use client';

import { useFieldArray, useFormContext } from 'react-hook-form';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField, FormItem, FormLabel, FormControl } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PlusCircle, Trash2 } from 'lucide-react';

export const surteesModelSchema = z.object({
    coverImageUrl: z.string().nullable().optional(),
    galleryImageUrls: z.array(z.string()).default([]),
    cost: z.number().nullable().optional(),
    sellPriceExclGst: z.number().nullable().optional(),
    freightCostExclGst: z.number().nullable().optional(),
    specifications: z.object({
        motorConfigurations: z.array(z.any()).default([]),
        otherSpecs: z.array(z.object({ id: z.string(), label: z.string(), value: z.string() })).default([]),
    }).optional(),
    standardFeatures: z.array(z.string()).default([]),
    packages: z.array(z.any()).default([]),
    documents: z.array(z.any()).default([]),
});

export function SurteesModelEditor({ model }: { model: any }) {
    const { control } = useFormContext<z.infer<typeof surteesModelSchema>>();
    const { fields: featureFields, append: appendFeature, remove: removeFeature } = useFieldArray({ control, name: "standardFeatures" });

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
        </div>
    );
}

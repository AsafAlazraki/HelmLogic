'use client';

import { useState } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';
import { useFirestore } from '@/firebase/provider';
import { doc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { fileToDataUri } from '@/firebase/storage-utils';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, X, PlusCircle, Trash2, Upload, Image as ImageIcon, Plus } from 'lucide-react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { cn } from '@/lib/utils';

// Schemas for validation
const specSchema = z.object({
    id: z.string(),
    label: z.string().min(1, 'Label is required'),
    value: z.string().min(1, 'Value is required'),
});

const colorVariantSchema = z.object({
    id: z.string(),
    name: z.string().min(1, 'Color name is required'),
    imageUrls: z.array(z.string()).default([]),
});

const optionalFeatureSchema = z.object({
    id: z.string(),
    name: z.string().min(1, 'Feature name is required'),
    imageUrl: z.string().nullable().optional(),
    cost: z.coerce.number().min(0).default(0),
    sellPriceExclGst: z.coerce.number().min(0).default(0),
    freightCostExclGst: z.coerce.number().min(0).default(0),
});

const highfieldModelSchema = z.object({
    coverImageUrl: z.string().nullable().optional(),
    cost: z.coerce.number().min(0).default(0),
    sellPriceExclGst: z.coerce.number().min(0).default(0),
    freightCostExclGst: z.coerce.number().min(0).default(0),
    specifications: z.object({
        minHp: z.coerce.number().min(0).default(0),
        maxHp: z.coerce.number().min(0).default(0),
        recommendedHp: z.coerce.number().min(0).default(0),
        otherSpecs: z.array(specSchema).default([]),
    }).optional(),
    standardFeatures: z.array(z.string()).default([]),
    optionalFeatures: z.array(optionalFeatureSchema).default([]),
    colors: z.array(colorVariantSchema).default([]),
});

type ModelFormData = z.infer<typeof highfieldModelSchema>;

const GST_RATE = 0.10;

function OptionalFeatureItem({ form, index, remove }: { form: any; index: number; remove: (index: number) => void; }) {
    const sellPriceExclGst = useWatch({
        control: form.control,
        name: `optionalFeatures.${index}.sellPriceExclGst`
    });

    const sellPriceInclGst = (sellPriceExclGst || 0) * (1 + GST_RATE);
    const imageUrl = useWatch({ control: form.control, name: `optionalFeatures.${index}.imageUrl` });

    return (
         <Card key={index} className="p-4 relative">
            <Button type="button" variant="destructive" size="icon" className="absolute -top-2 -right-2 h-6 w-6 z-10" onClick={() => remove(index)}><X className="h-4 w-4" /></Button>
            <div className="space-y-4">
                <FormField
                    control={form.control}
                    name={`optionalFeatures.${index}.imageUrl`}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className="sr-only">Feature Image</FormLabel>
                            {imageUrl ? (
                                <div className="relative aspect-video w-full overflow-hidden rounded-md group">
                                    <Image src={imageUrl} alt="Feature image" fill className="object-cover" />
                                    <Button
                                        type="button"
                                        variant="destructive"
                                        size="icon"
                                        className="absolute -top-2 -right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                        onClick={() => field.onChange(null)}
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            ) : (
                                <div className="flex items-center justify-center w-full">
                                    <label htmlFor={`optional-feature-upload-${index}`} className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-secondary hover:bg-muted">
                                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                            <Upload className="w-8 h-8 mb-2 text-muted-foreground" />
                                            <p className="mb-2 text-sm text-muted-foreground"><span className="font-semibold">Click to upload</span></p>
                                        </div>
                                        <FormControl>
                                            <Input id={`optional-feature-upload-${index}`} type="file" className="hidden" accept="image/*" onChange={async (e) => {
                                                const file = e.target.files?.[0];
                                                if (file) field.onChange(await fileToDataUri(file));
                                            }} />
                                        </FormControl>
                                    </label>
                                </div> 
                            )}
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField control={form.control} name={`optionalFeatures.${index}.name`} render={({ field }) => ( <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name={`optionalFeatures.${index}.cost`} render={({ field }) => ( <FormItem><FormLabel>Cost</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} />
                    <FormField control={form.control} name={`optionalFeatures.${index}.sellPriceExclGst`} render={({ field }) => ( <FormItem><FormLabel>Sell (ex. GST)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} />
                </div>
                 <FormItem>
                    <FormLabel>Sell (inc. GST)</FormLabel>
                    <FormControl>
                        <Input type="text" value={sellPriceInclGst.toFixed(2)} readOnly disabled className="bg-muted" />
                    </FormControl>
                </FormItem>
            </div>
        </Card>
    );
}

function PricingCard({ form }: { form: any }) {
    const sellPriceExclGst = useWatch({
        control: form.control,
        name: "sellPriceExclGst"
    });
    const sellPriceInclGst = (sellPriceExclGst || 0) * (1 + GST_RATE);

    return (
        <Card>
            <CardHeader><CardTitle>Pricing</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                <FormField control={form.control} name="cost" render={({ field }) => ( <FormItem><FormLabel>Cost</FormLabel><FormControl><Input type="number" placeholder="0.00" {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormField control={form.control} name="sellPriceExclGst" render={({ field }) => ( <FormItem><FormLabel>Sell Price (excl. GST)</FormLabel><FormControl><Input type="number" placeholder="0.00" {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormItem>
                    <FormLabel>Sell Price (inc. GST)</FormLabel>
                    <FormControl>
                        <Input type="text" value={sellPriceInclGst.toFixed(2)} readOnly disabled className="bg-muted" />
                    </FormControl>
                </FormItem>
                <FormField control={form.control} name="freightCostExclGst" render={({ field }) => ( <FormItem><FormLabel>Freight Cost (excl. GST)</FormLabel><FormControl><Input type="number" placeholder="0.00" {...field} /></FormControl><FormMessage /></FormItem> )} />
            </CardContent>
        </Card>
    );
}

export function HighfieldModelEditor({ model, docPath }: { model: any; docPath: string }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [bulkFeatures, setBulkFeatures] = useState('');

    const form = useForm<ModelFormData>({
        resolver: zodResolver(highfieldModelSchema),
        defaultValues: {
            ...model,
            cost: model.cost || 0,
            sellPriceExclGst: model.sellPriceExclGst || 0,
            freightCostExclGst: model.freightCostExclGst || 0,
            specifications: model.specifications || { minHp: 0, maxHp: 0, recommendedHp: 0, otherSpecs: [] },
            standardFeatures: model.standardFeatures || [],
            optionalFeatures: model.optionalFeatures || [],
            colors: model.colors || [],
        },
    });

    const { fields: specFields, append: appendSpec, remove: removeSpec } = useFieldArray({ control: form.control, name: "specifications.otherSpecs" });
    const { fields: featureFields, append: appendFeature, remove: removeFeature, replace: replaceFeatures } = useFieldArray({ control: form.control, name: "standardFeatures" });
    const { fields: optionalFields, append: appendOptional, remove: removeOptional } = useFieldArray({ control: form.control, name: "optionalFeatures" });
    const { fields: colorFields, append: appendColor, remove: removeColor, update: updateColor } = useFieldArray({ control: form.control, name: "colors" });
    
    const watchedColors = useWatch({ control: form.control, name: 'colors' });
    const coverImageUrl = useWatch({ control: form.control, name: "coverImageUrl" });

    async function onSubmit(values: ModelFormData) {
        setIsSubmitting(true);
        try {
            const modelDocRef = doc(firestore, docPath);
            await updateDoc(modelDocRef, values)
             .catch((serverError) => {
                    const permissionError = new FirestorePermissionError({ path: modelDocRef.path, operation: 'update', requestResourceData: values, });
                    errorEmitter.emit('permission-error', permissionError);
                    throw serverError;
                });
            toast({ title: "Model Updated", description: "The model details have been saved successfully." });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Update Failed", description: error.message || "An unexpected error occurred." });
        } finally {
            setIsSubmitting(false);
        }
    }
    
    const handleBulkAddFeatures = () => {
        const features = bulkFeatures.split('\n').map(f => f.trim()).filter(Boolean);
        replaceFeatures(features.map(f => f));
        setBulkFeatures('');
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="flex justify-end">
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Save Changes
                    </Button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-7 gap-8 items-start">
                    <div className="lg:col-span-4 space-y-8">
                        {/* Specs Card */}
                        <Card>
                            <CardHeader><CardTitle>Specifications</CardTitle></CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <FormField control={form.control} name="specifications.minHp" render={({ field }) => ( <FormItem><FormLabel>Min HP</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} />
                                    <FormField control={form.control} name="specifications.recommendedHp" render={({ field }) => ( <FormItem><FormLabel>Recommended HP</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} />
                                    <FormField control={form.control} name="specifications.maxHp" render={({ field }) => ( <FormItem><FormLabel>Max HP</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} />
                                </div>
                                <div className="space-y-4">
                                    <FormLabel>Other Specs</FormLabel>
                                    {specFields.map((field, index) => (
                                        <div key={field.id} className="flex items-end gap-2">
                                            <FormField control={form.control} name={`specifications.otherSpecs.${index}.label`} render={({ field }) => ( <FormItem className="flex-1"><FormControl><Input placeholder="Label" {...field} /></FormControl><FormMessage /></FormItem> )} />
                                            <FormField control={form.control} name={`specifications.otherSpecs.${index}.value`} render={({ field }) => ( <FormItem className="flex-1"><FormControl><Input placeholder="Value" {...field} /></FormControl><FormMessage /></FormItem> )} />
                                            <Button type="button" variant="ghost" size="icon" onClick={() => removeSpec(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                        </div>
                                    ))}
                                     <Button type="button" variant="outline" size="sm" onClick={() => appendSpec({ id: crypto.randomUUID(), label: '', value: '' })}><PlusCircle className="mr-2 h-4 w-4" />Add Spec</Button>
                                </div>
                            </CardContent>
                        </Card>
                        {/* Standard Features Card */}
                        <Card>
                            <CardHeader><CardTitle>Standard Features</CardTitle></CardHeader>
                            <CardContent className="space-y-4">
                                {featureFields.map((field, index) => (
                                     <div key={field.id} className="flex items-center gap-2">
                                        <FormField control={form.control} name={`standardFeatures.${index}`} render={({ field }) => ( <FormItem className="flex-1"><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                                        <Button type="button" variant="ghost" size="icon" onClick={() => removeFeature(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                    </div>
                                ))}
                                <Button type="button" variant="outline" size="sm" onClick={() => appendFeature('')}><PlusCircle className="mr-2 h-4 w-4" />Add Feature</Button>
                            </CardContent>
                            <CardFooter className="flex-col items-start gap-2">
                                <FormLabel>Bulk Add Features</FormLabel>
                                <Textarea placeholder="One feature per line..." value={bulkFeatures} onChange={(e) => setBulkFeatures(e.target.value)} />
                                <Button type="button" variant="secondary" size="sm" onClick={handleBulkAddFeatures}>Add from Text</Button>
                            </CardFooter>
                        </Card>
                         {/* Optional Features Card */}
                        <Card>
                            <CardHeader><CardTitle>Optional Features</CardTitle></CardHeader>
                            <CardContent className="space-y-4">
                                {optionalFields.map((field, index) => (
                                    <OptionalFeatureItem key={field.id} form={form} index={index} remove={removeOptional} />
                                ))}
                            </CardContent>
                            <CardFooter>
                                <Button type="button" variant="outline" className="w-full" onClick={() => appendOptional({ id: crypto.randomUUID(), name: '', cost: 0, sellPriceExclGst: 0, freightCostExclGst: 0 })}><PlusCircle className="mr-2 h-4 w-4" />Add Optional Feature</Button>
                            </CardFooter>
                        </Card>
                    </div>
                    <div className="lg:col-span-3 space-y-8">
                         {/* Pricing Card */}
                         <PricingCard form={form} />
                         {/* Cover Image Card */}
                        <Card>
                            <CardHeader><CardTitle>Cover Image</CardTitle></CardHeader>
                            <CardContent className="space-y-4">
                               <FormField control={form.control} name="coverImageUrl" render={({ field }) => (
                                   <FormItem>
                                       <FormLabel className="sr-only">Cover Image</FormLabel>
                                        {coverImageUrl ? (
                                             <div className="relative aspect-video w-full overflow-hidden rounded-md group">
                                                <Image src={coverImageUrl} alt="Cover image" fill className="object-cover" />
                                                <Button
                                                    type="button"
                                                    variant="destructive"
                                                    size="icon"
                                                    className="absolute -top-2 -right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                                    onClick={() => field.onChange(null)}
                                                >
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-center w-full">
                                                <label htmlFor="cover-image-upload" className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer bg-secondary hover:bg-muted">
                                                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                                        <ImageIcon className="w-10 h-10 mb-2 text-muted-foreground" />
                                                        <p className="mb-2 text-sm text-muted-foreground"><span className="font-semibold">Upload Cover Image</span></p>
                                                    </div>
                                                     <FormControl>
                                                        <Input id="cover-image-upload" type="file" className="hidden" accept="image/*" onChange={async (e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) field.onChange(await fileToDataUri(file));
                                                        }} />
                                                    </FormControl>
                                                </label>
                                            </div> 
                                        )}
                                       <FormMessage />
                                   </FormItem>
                               )} />
                            </CardContent>
                        </Card>

                        {/* Colors Card */}
                        <Card>
                            <CardHeader><CardTitle>Color Variants</CardTitle></CardHeader>
                            <CardContent className="space-y-4">
                                {colorFields.map((field, index) => (
                                    <Card key={field.id} className="p-4 bg-muted/50">
                                        <div className="flex justify-between items-center mb-4">
                                            <FormField control={form.control} name={`colors.${index}.name`} render={({ field }) => ( <FormItem className="flex-1"><FormLabel className="sr-only">Color Name</FormLabel><FormControl><Input placeholder="Color Name" {...field} /></FormControl><FormMessage /></FormItem> )} />
                                            <Button type="button" variant="destructive" size="icon" onClick={() => removeColor(index)} className="ml-2 shrink-0"><Trash2 className="h-4 w-4" /></Button>
                                        </div>
                                        <div className="space-y-2">
                                            <FormLabel>Images</FormLabel>
                                            <div className="grid grid-cols-3 gap-2">
                                                {(watchedColors[index]?.imageUrls || []).map((url, imgIndex) => (
                                                    <div key={imgIndex} className="relative aspect-square group">
                                                        <Image src={url} alt={`Color variant ${imgIndex+1}`} fill className="object-cover rounded-md" />
                                                         <Button
                                                            type="button"
                                                            variant="destructive"
                                                            size="icon"
                                                            className="absolute -top-1 -right-1 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                                            onClick={() => {
                                                                const updatedImages = watchedColors[index].imageUrls.filter((_, i) => i !== imgIndex);
                                                                updateColor(index, { ...watchedColors[index], imageUrls: updatedImages });
                                                            }}
                                                        >
                                                            <X className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                ))}
                                                <label htmlFor={`color-image-upload-${index}`} className={cn(
                                                    "aspect-square flex items-center justify-center border-2 border-dashed rounded-lg cursor-pointer bg-background hover:bg-secondary",
                                                    (watchedColors[index]?.imageUrls.length || 0) >= 6 && 'hidden'
                                                )}>
                                                     <Input id={`color-image-upload-${index}`} type="file" multiple className="hidden" accept="image/*" onChange={async (e) => {
                                                        const files = Array.from(e.target.files || []);
                                                        const dataUris = await Promise.all(files.map(fileToDataUri));
                                                        const currentUrls = watchedColors[index].imageUrls || [];
                                                        updateColor(index, { ...watchedColors[index], imageUrls: [...currentUrls, ...dataUris] });
                                                     }}/>
                                                     <Plus className="h-6 w-6 text-muted-foreground"/>
                                                </label>
                                            </div>
                                        </div>
                                    </Card>
                                ))}
                                <Button type="button" variant="outline" size="sm" onClick={() => appendColor({ id: crypto.randomUUID(), name: '', imageUrls: [] })}><PlusCircle className="mr-2 h-4 w-4" />Add Color</Button>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </form>
        </Form>
    );
}

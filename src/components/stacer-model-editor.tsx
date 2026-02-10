'use client';

import { useState, useEffect, useRef } from 'react';
import { useForm, useFieldArray, useWatch, useController } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';
import { useFirestore } from '@/firebase/provider';
import { doc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { fileToDataUri } from '@/firebase/storage-utils';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, X, PlusCircle, Trash2, Upload, Image as ImageIcon, Plus, ChevronDown, MoreHorizontal } from 'lucide-react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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
    cost: z.number().min(0).nullable().optional(),
    sellPriceExclGst: z.number().min(0).nullable().optional(),
});

const variantPricingSchema = z.object({
    colorId: z.string(),
    colorName: z.string(),
    cost: z.number().nullable().optional(),
    sellPriceExclGst: z.number().nullable().optional(),
    freightCostExclGst: z.number().nullable().optional(),
});

const stacerModelSchema = z.object({
    coverImageUrl: z.string().nullable().optional(),
    galleryImageUrls: z.array(z.string()).default([]),
    specifications: z.object({
        minHp: z.number().min(0).default(0),
        maxHp: z.number().min(0).default(0),
        recommendedHp: z.number().min(0).default(0),
        otherSpecs: z.array(specSchema).default([]),
    }).optional(),
    standardFeatures: z.array(z.string()).default([]),
    optionalFeatures: z.array(optionalFeatureSchema).default([]),
    colors: z.array(colorVariantSchema).default([]),
    variantPricing: z.array(variantPricingSchema).default([]),
});

type ModelFormData = z.infer<typeof stacerModelSchema>;

const GST_RATE = 0.10;

function GstInputPair({ control, name, label }: { control: any; name: string; label: string }) {
    const { field } = useController({ control, name, defaultValue: null });

    const valueExcl = field.value; // Can be a number or null
    const valueIncl = (valueExcl ?? 0) * (1 + GST_RATE);

    const handleExclChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.value === '') {
            field.onChange(null);
            return;
        }
        const numValue = parseFloat(e.target.value);
        field.onChange(isNaN(numValue) ? null : numValue);
    };

    const handleInclChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.value === '') {
            field.onChange(null);
            return;
        }
        const numValue = parseFloat(e.target.value);
        field.onChange(isNaN(numValue) ? null : numValue / (1 + GST_RATE));
    };

    return (
        <div>
            <FormLabel>{label}</FormLabel>
            <div className="grid grid-cols-2 gap-2 mt-2">
                <FormItem>
                    <FormLabel className="text-xs font-normal text-muted-foreground">excl. GST</FormLabel>
                    <FormControl>
                        <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={valueExcl ?? ''}
                            onChange={handleExclChange}
                        />
                    </FormControl>
                    <FormMessage />
                </FormItem>
                <FormItem>
                    <FormLabel className="text-xs font-normal text-muted-foreground">inc. GST</FormLabel>
                    <FormControl>
                        <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={valueIncl === 0 ? '' : valueIncl.toFixed(2)}
                            onChange={handleInclChange}
                        />
                    </FormControl>
                    <FormMessage />
                </FormItem>
            </div>
        </div>
    );
}

const CollapsibleCardHeader = ({ title, description, children }: { title: string, description?: string, children?: React.ReactNode }) => (
    <CardHeader className="flex flex-row items-start justify-between">
        <div className="flex-1 space-y-1">
            <CardTitle>{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
        </div>
        <div className="flex items-center gap-2">
            {children}
            <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon">
                    <ChevronDown className="h-5 w-5 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </Button>
            </CollapsibleTrigger>
        </div>
    </CardHeader>
);


function OptionalFeatureItem({ form, index, remove }: { form: any; index: number; remove: (index: number) => void; }) {
    const imageUrl = useWatch({ control: form.control, name: `optionalFeatures.${index}.imageUrl` });
    const { control } = form;

    return (
        <Card key={index} className="relative bg-muted/50 overflow-hidden p-4 group/item">
            <div className="absolute top-2 right-2 z-10">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover/item:opacity-100 transition-opacity"><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => remove(index)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            
            <div className="flex gap-4 items-start">
                 <FormField
                    control={control}
                    name={`optionalFeatures.${index}.imageUrl`}
                    render={({ field }) => (
                        <FormItem className="w-32 flex-shrink-0">
                            <FormLabel className="sr-only">Feature Image</FormLabel>
                             {imageUrl ? (
                                <div className="relative aspect-square w-full overflow-hidden rounded-md group">
                                    <Image src={imageUrl} alt="Feature image" fill className="object-cover" />
                                    <Button type="button" variant="outline" size="icon" className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-background/50 border-background/50 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive" onClick={() => field.onChange(null)}>
                                        <X className="h-3 w-3" />
                                    </Button>
                                </div>
                            ) : (
                                <div className="flex items-center justify-center w-full">
                                    <label htmlFor={`feature-upload-${index}`} className="flex flex-col items-center justify-center w-full aspect-square border-2 border-dashed rounded-lg cursor-pointer bg-secondary hover:bg-muted">
                                        <div className="flex flex-col items-center justify-center text-center p-2">
                                            <Upload className="w-6 h-6 mb-1 text-muted-foreground" />
                                            <p className="text-xs text-muted-foreground">Upload</p>
                                        </div>
                                        <FormControl>
                                            <Input id={`feature-upload-${index}`} type="file" className="hidden" accept="image/*" onChange={async (e) => {
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
                <div className="flex-1 space-y-3">
                     <FormField control={form.control} name={`optionalFeatures.${index}.name`} render={({ field }) => ( 
                        <FormItem>
                            <FormLabel className="sr-only">Feature Name</FormLabel>
                            <FormControl>
                                <Input placeholder="Feature Name" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem> 
                    )} />
                    <div className="grid grid-cols-2 gap-4">
                        <GstInputPair control={control} name={`optionalFeatures.${index}.cost`} label="Cost" />
                        <GstInputPair control={control} name={`optionalFeatures.${index}.sellPriceExclGst`} label="Sell Price" />
                    </div>
                </div>
            </div>
        </Card>
    );
}

export function StacerModelEditor({ model, docPath }: { model: any; docPath: string }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [bulkFeatures, setBulkFeatures] = useState('');
    const loadedModelIdRef = useRef<string | null>(null);

    const form = useForm<ModelFormData>({
        resolver: zodResolver(stacerModelSchema),
    });
    
    useEffect(() => {
        if (model?.id && model.id === loadedModelIdRef.current) {
            return;
        }

        const safeModel = model || {};
        const defaultValues: Partial<ModelFormData> = {
            coverImageUrl: safeModel.coverImageUrl ?? null,
            galleryImageUrls: safeModel.galleryImageUrls ?? [],
            specifications: {
                minHp: safeModel.specifications?.minHp ?? 0,
                maxHp: safeModel.specifications?.maxHp ?? 0,
                recommendedHp: safeModel.specifications?.recommendedHp ?? 0,
                otherSpecs: safeModel.specifications?.otherSpecs ?? [],
            },
            standardFeatures: safeModel.standardFeatures ?? [],
            optionalFeatures: safeModel.optionalFeatures ?? [],
            colors: safeModel.colors ?? [],
            variantPricing: [],
        };
    
        const variants: z.infer<typeof variantPricingSchema>[] = [];
        const existingPricing = new Map(
            (safeModel.variantPricing || []).map((p: any) => [p.colorId, p])
        );
    
        (defaultValues.colors || []).forEach(color => {
            const key = color.id;
            const existing = existingPricing.get(key);
            if (existing) {
                variants.push({
                    ...existing,
                    cost: existing.cost ?? null,
                    sellPriceExclGst: existing.sellPriceExclGst ?? null,
                    freightCostExclGst: existing.freightCostExclGst ?? null,
                });
            } else {
                variants.push({
                    colorId: color.id,
                    colorName: color.name,
                    cost: null,
                    sellPriceExclGst: null,
                    freightCostExclGst: null,
                });
            }
        });

        variants.sort((a, b) => a.colorName.localeCompare(b.colorName));
        defaultValues.variantPricing = variants;

        form.reset(defaultValues);
        if (model?.id) {
            loadedModelIdRef.current = model.id;
        }
    }, [model, form]);

    const { fields: specFields, append: appendSpec, remove: removeSpec } = useFieldArray({ control: form.control, name: "specifications.otherSpecs" });
    const { fields: featureFields, append: appendFeature, remove: removeFeature, replace: replaceFeatures } = useFieldArray({ control: form.control, name: "standardFeatures" });
    const { fields: colorFields, append: appendColor, remove: removeColor, update: updateColor } = useFieldArray({ control: form.control, name: "colors" });
    const { fields: optionalFeatureFields, append: appendOptionalFeature, remove: removeOptionalFeature } = useFieldArray({ control: form.control, name: "optionalFeatures" });
    const { fields: galleryImageFields, append: appendGalleryImage, remove: removeGalleryImage } = useFieldArray({ control: form.control, name: 'galleryImageUrls' });
    const { fields: variantPricingFields } = useFieldArray({ control: form.control, name: 'variantPricing' });
    
    const watchedColors = useWatch({ control: form.control, name: 'colors' });
    const coverImageUrl = useWatch({ control: form.control, name: "coverImageUrl" });

    function onSubmit(values: ModelFormData) {
        setIsSubmitting(true);
        const modelDocRef = doc(firestore, docPath);

        updateDoc(modelDocRef, values)
            .then(() => {
                toast({ title: "Model Updated", description: "The model details have been saved successfully." });
                form.reset(values, { keepValues: true });
            })
            .catch((serverError) => {
                 const permissionError = new FirestorePermissionError({
                    path: modelDocRef.path,
                    operation: 'update',
                    requestResourceData: values,
                });
                errorEmitter.emit('permission-error', permissionError);
            })
            .finally(() => {
                setIsSubmitting(false);
            });
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
                    <Button type="submit">
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Save Changes
                    </Button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-7 gap-8 items-start">
                    <div className="lg:col-span-4 space-y-8">
                        {/* Specifications Card */}
                        <Collapsible asChild defaultOpen>
                            <Card>
                                <CollapsibleCardHeader title="Specifications">
                                    <Button type="button" variant="outline" size="sm" onClick={() => appendSpec({ id: `spec-${Date.now()}`, label: '', value: '' })}><PlusCircle className="mr-2 h-4 w-4" />Add Spec</Button>
                                </CollapsibleCardHeader>
                                <CollapsibleContent>
                                    <CardContent className="space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <FormField control={form.control} name="specifications.minHp" render={({ field }) => ( <FormItem><FormLabel>Min HP</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} />
                                            <FormField control={form.control} name="specifications.maxHp" render={({ field }) => ( <FormItem><FormLabel>Max HP</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} />
                                            <FormField control={form.control} name="specifications.recommendedHp" render={({ field }) => ( <FormItem><FormLabel>Recommended HP</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} />
                                        </div>
                                        <div className="space-y-4">
                                            {specFields.length > 0 && <FormLabel>Other Specs</FormLabel>}
                                            {specFields.map((field, index) => (
                                                <div key={field.id} className="flex items-end gap-2">
                                                    <FormField control={form.control} name={`specifications.otherSpecs.${index}.label`} render={({ field }) => ( <FormItem className="flex-1"><FormControl><Input placeholder="Label" {...field} /></FormControl><FormMessage /></FormItem> )} />
                                                    <FormField control={form.control} name={`specifications.otherSpecs.${index}.value`} render={({ field }) => ( <FormItem className="flex-1"><FormControl><Input placeholder="Value" {...field} /></FormControl><FormMessage /></FormItem> )} />
                                                    <Button type="button" variant="ghost" size="icon" onClick={() => removeSpec(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </CollapsibleContent>
                            </Card>
                        </Collapsible>
                        
                        {/* Standard Features Card */}
                        <Collapsible asChild defaultOpen>
                            <Card>
                                <CollapsibleCardHeader title="Standard Features">
                                    <Button type="button" variant="outline" size="sm" onClick={() => appendFeature('')}><PlusCircle className="mr-2 h-4 w-4" />Add Feature</Button>
                                </CollapsibleCardHeader>
                                <CollapsibleContent>
                                    <CardContent className="space-y-4 max-h-96 overflow-y-auto">
                                        {featureFields.map((field, index) => (
                                             <div key={field.id} className="flex items-center gap-2">
                                                <FormField control={form.control} name={`standardFeatures.${index}`} render={({ field }) => ( <FormItem className="flex-1"><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                                                <Button type="button" variant="ghost" size="icon" onClick={() => removeFeature(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                            </div>
                                        ))}
                                    </CardContent>
                                    <CardContent>
                                        <div className="space-y-2">
                                            <FormLabel>Bulk Add Features</FormLabel>
                                            <Textarea placeholder="One feature per line..." value={bulkFeatures} onChange={(e) => setBulkFeatures(e.target.value)} />
                                            <Button type="button" variant="secondary" size="sm" onClick={handleBulkAddFeatures}>Add from Text</Button>
                                        </div>
                                    </CardContent>
                                </CollapsibleContent>
                            </Card>
                        </Collapsible>
                        
                        {/* Colors Card */}
                        <Collapsible asChild defaultOpen>
                            <Card>
                                <CollapsibleCardHeader title="Color Variants">
                                    <Button type="button" variant="outline" size="sm" onClick={() => appendColor({ id: `color-${Date.now()}`, name: '', imageUrls: [] })}><PlusCircle className="mr-2 h-4 w-4" />Add Color</Button>
                                </CollapsibleCardHeader>
                                <CollapsibleContent>
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
                                                        {(watchedColors?.[index]?.imageUrls || []).map((url, imgIndex) => (
                                                            <div key={imgIndex} className="relative aspect-square group">
                                                                <Image src={url} alt={`Color variant ${imgIndex+1}`} fill className="object-cover rounded-md" />
                                                                 <Button
                                                                    type="button"
                                                                    variant="outline"
                                                                    size="icon"
                                                                    className="absolute top-1 right-1 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-background/50 border-background/50 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive"
                                                                    onClick={() => {
                                                                        const updatedImages = watchedColors[index].imageUrls.filter((_, i) => i !== imgIndex);
                                                                        updateColor(index, { ...watchedColors[index], imageUrls: updatedImages });
                                                                    }}
                                                                >
                                                                    <X className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                        ))}
                                                        <label htmlFor={`color-image-upload-${index}`} className={cn(
                                                            "aspect-square flex items-center justify-center border-2 border-dashed rounded-lg cursor-pointer bg-background hover:bg-secondary",
                                                            (watchedColors?.[index]?.imageUrls.length || 0) >= 6 && 'hidden'
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
                                        {colorFields.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No color variants added.</p>}
                                    </CardContent>
                                </CollapsibleContent>
                            </Card>
                        </Collapsible>
                    </div>

                    <div className="lg:col-span-3 space-y-8">
                        <Collapsible asChild defaultOpen>
                            <Card>
                                <CollapsibleCardHeader title="Cover Image" />
                                <CollapsibleContent>
                                    <CardContent>
                                        <FormField control={form.control} name="coverImageUrl" render={({ field }) => (
                                           <FormItem>
                                               <FormLabel className="sr-only">Cover Image</FormLabel>
                                                {coverImageUrl ? (
                                                     <div className="relative aspect-video w-full overflow-hidden rounded-md group">
                                                        <Image src={coverImageUrl} alt="Cover image" fill className="object-cover" />
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="icon"
                                                            className="absolute top-1 right-1 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-background/50 border-background/50 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive"
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
                                        <div className="pt-6">
                                            <Collapsible>
                                                <CollapsibleTrigger className="w-full flex justify-between items-center text-sm font-medium py-2 border-t border-b data-[state=open]:border-b-0">
                                                    <span>Image Gallery ({galleryImageFields.length})</span>
                                                    <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 data-[state=open]:rotate-180" />
                                                </CollapsibleTrigger>
                                                <CollapsibleContent className="border-b">
                                                    <div className="p-4 bg-muted/20">
                                                        <div className="grid grid-cols-3 gap-2">
                                                            {galleryImageFields.map((item, index) => (
                                                                <div key={item.id} className="relative aspect-square group">
                                                                    <FormField
                                                                        control={form.control}
                                                                        name={`galleryImageUrls.${index}`}
                                                                        render={({ field }) => (
                                                                            <>
                                                                                <Image src={field.value} alt={`Gallery image ${index + 1}`} fill className="object-cover rounded-md" />
                                                                                <Button
                                                                                    type="button"
                                                                                    variant="destructive"
                                                                                    size="icon"
                                                                                    className="absolute top-1 right-1 h-6 w-6 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                                    onClick={() => removeGalleryImage(index)}
                                                                                >
                                                                                    <Trash2 className="h-4 w-4" />
                                                                                </Button>
                                                                            </>
                                                                        )}
                                                                    />
                                                                </div>
                                                            ))}
                                                            <label htmlFor="gallery-image-upload" className={cn(
                                                                "aspect-square flex items-center justify-center border-2 border-dashed rounded-lg cursor-pointer bg-background hover:bg-secondary"
                                                            )}>
                                                                 <Input id="gallery-image-upload" type="file" multiple className="hidden" accept="image/*" onChange={async (e) => {
                                                                    const files = Array.from(e.target.files || []);
                                                                    const dataUris = await Promise.all(files.map(fileToDataUri));
                                                                    dataUris.forEach(uri => appendGalleryImage(uri));
                                                                 }}/>
                                                                 <Plus className="h-6 w-6 text-muted-foreground"/>
                                                            </label>
                                                        </div>
                                                    </div>
                                                </CollapsibleContent>
                                            </Collapsible>
                                        </div>
                                    </CardContent>
                                </CollapsibleContent>
                            </Card>
                        </Collapsible>
                        <Collapsible asChild defaultOpen>
                            <Card>
                                <CollapsibleCardHeader title="Optional Features">
                                    <Button type="button" variant="outline" size="sm" onClick={() => appendOptionalFeature({ id: `feat-${Date.now()}`, name: '', cost: 0, sellPriceExclGst: 0, imageUrl: null })}><PlusCircle className="mr-2 h-4 w-4" />Add Feature</Button>
                                </CollapsibleCardHeader>
                                <CollapsibleContent>
                                    <CardContent className="space-y-4">
                                        {optionalFeatureFields.map((field, index) => (
                                            <OptionalFeatureItem key={field.id} form={form} index={index} remove={removeOptionalFeature} />
                                        ))}
                                        {optionalFeatureFields.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No optional features added.</p>}
                                    </CardContent>
                                </CollapsibleContent>
                            </Card>
                        </Collapsible>
                    </div>
                </div>

                <Collapsible asChild defaultOpen>
                    <Card>
                        <CollapsibleCardHeader title="Variant Costing" description="Define pricing for each model variant based on color." />
                        <CollapsibleContent>
                            <CardContent>
                                <div className="rounded-md border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Variant (Color)</TableHead>
                                                <TableHead>Base Cost</TableHead>
                                                <TableHead>Base Sell</TableHead>
                                                <TableHead>Freight Cost</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {variantPricingFields.length > 0 ? variantPricingFields.map((field, index) => (
                                                <TableRow key={field.id}>
                                                    <TableCell className="font-medium">{field.colorName}</TableCell>
                                                    <TableCell><GstInputPair control={form.control} name={`variantPricing.${index}.cost`} label="" /></TableCell>
                                                    <TableCell><GstInputPair control={form.control} name={`variantPricing.${index}.sellPriceExclGst`} label="" /></TableCell>
                                                    <TableCell><GstInputPair control={form.control} name={`variantPricing.${index}.freightCostExclGst`} label="" /></TableCell>
                                                </TableRow>
                                            )) : (
                                                <TableRow>
                                                    <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">
                                                        No variants to price. Add some color options to get started.
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </CollapsibleContent>
                    </Card>
                </Collapsible>
            </form>
        </Form>
    );
}

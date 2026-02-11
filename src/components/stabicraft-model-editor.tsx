'use client';

import { useState, useEffect, useRef } from 'react';
import { useForm, useFieldArray, useWatch, useController, useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';
import { useFirestore } from '@/firebase/provider';
import { doc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { fileToDataUri } from '@/firebase/storage-utils';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, X, PlusCircle, Trash2, Upload, Image as ImageIcon, ChevronDown, MoreHorizontal, Plus } from 'lucide-react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

// Schemas for validation
const specSchema = z.object({
    id: z.string(),
    label: z.string().min(1, 'Label is required'),
    value: z.string().min(1, 'Value is required'),
});

const optionalFeatureSchema = z.object({
    id: z.string(),
    name: z.string().min(1, 'Feature name is required'),
    imageUrl: z.string().nullable().optional(),
    cost: z.coerce.number().nullable().optional(),
    sellPriceExclGst: z.coerce.number().nullable().optional(),
});

const packageLevelSchema = z.object({
    id: z.string(),
    name: z.string().min(1, 'Package level name is required'),
    cost: z.coerce.number().nullable().optional(),
    sellPriceExclGst: z.coerce.number().nullable().optional(),
    includedFeatures: z.array(z.string()).default([]),
});

const modelSchema = z.object({
    coverImageUrl: z.string().nullable().optional(),
    galleryImageUrls: z.array(z.string()).default([]),
    cost: z.coerce.number().nullable().optional(),
    sellPriceExclGst: z.coerce.number().nullable().optional(),
    freightCostExclGst: z.coerce.number().nullable().optional(),
    specifications: z.object({
        minHp: z.coerce.number().min(0).default(0),
        maxHp: z.coerce.number().min(0).default(0),
        recommendedHp: z.coerce.number().min(0).default(0),
        otherSpecs: z.array(specSchema).default([]),
    }).optional(),
    standardFeatures: z.array(z.string()).default([]),
    optionalFeatures: z.array(optionalFeatureSchema).default([]),
    packageLevels: z.array(packageLevelSchema).default([]),
});

type ModelFormData = z.infer<typeof modelSchema>;

const GST_RATE = 0.10;

function GstInputPair({ control, name, label }: { control: any, name: string, label: string }) {
    const { field } = useController({ control, name, defaultValue: null });

    const valueExcl = field.value;
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

function IncludedFeatures({ packageIndex }: { packageIndex: number }) {
    const { control } = useFormContext<ModelFormData>();
    const { fields, append, remove } = useFieldArray({
        control,
        name: `packageLevels.${packageIndex}.includedFeatures`
    });
    const [bulkAdd, setBulkAdd] = useState('');

    const handleBulkAdd = () => {
        const features = bulkAdd.split('\n').map(f => f.trim()).filter(Boolean);
        features.forEach(feature => append(feature));
        setBulkAdd('');
    };

    return (
        <div className="space-y-2 pt-4 mt-4 border-t">
            <div className="flex justify-between items-center">
                <FormLabel className="text-xs text-muted-foreground">Included Features</FormLabel>
                <Button type="button" variant="ghost" size="sm" onClick={() => append('')}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Add
                </Button>
            </div>
            {fields.map((field, index) => (
                <div key={field.id} className="flex items-center gap-2">
                    <FormField
                        control={control}
                        name={`packageLevels.${packageIndex}.includedFeatures.${index}`}
                        render={({ field }) => (
                            <FormItem className="flex-1">
                                <FormControl><Input {...field} placeholder={`Feature ${index + 1}`} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                </div>
            ))}
             <div className="pt-2">
                <Textarea placeholder="Or paste a list of features, one per line..." value={bulkAdd} onChange={e => setBulkAdd(e.target.value)} rows={3}/>
                <Button type="button" size="sm" variant="secondary" className="mt-2" onClick={handleBulkAdd} disabled={!bulkAdd.trim()}>Add from Text</Button>
            </div>
        </div>
    );
}

function PackageLevelItem({ form, index, remove }: { form: any; index: number; remove: (index: number) => void; }) {
    const {control} = form;

    return (
        <Collapsible asChild>
            <Card key={index} className="bg-muted/50 overflow-hidden">
                <div className="p-4 flex justify-between items-start">
                    <div className="flex-1 pr-4">
                        <FormField control={form.control} name={`packageLevels.${index}.name`} render={({ field }) => ( 
                            <FormItem>
                                <FormControl>
                                    <Input className="text-lg font-semibold border-none shadow-none p-0 h-auto bg-transparent focus-visible:ring-0" placeholder="Package Level Name" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem> 
                        )} />
                    </div>
                    <div className="flex items-center">
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => remove(index)}><Trash2 className="h-4 w-4"/></Button>
                        <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <ChevronDown className="h-5 w-5 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                            </Button>
                        </CollapsibleTrigger>
                    </div>
                </div>
                <CollapsibleContent>
                    <div className="px-4 pb-4 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <GstInputPair control={control} name={`packageLevels.${index}.cost`} label="Cost" />
                            <GstInputPair control={control} name={`packageLevels.${index}.sellPriceExclGst`} label="Sell Price" />
                        </div>
                        <IncludedFeatures packageIndex={index} />
                    </div>
                </CollapsibleContent>
            </Card>
        </Collapsible>
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

export function StabicraftModelEditor({ model, docPath }: { model: any; docPath: string }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [bulkFeatures, setBulkFeatures] = useState('');
    const loadedModelIdRef = useRef<string | null>(null);

    const getSafeDefaultValues = (modelData: any): ModelFormData => {
        const data = modelData || {};
        const specs = data.specifications || {};
        return {
            coverImageUrl: data.coverImageUrl ?? null,
            galleryImageUrls: data.galleryImageUrls ?? [],
            cost: data.cost ?? null,
            sellPriceExclGst: data.sellPriceExclGst ?? null,
            freightCostExclGst: data.freightCostExclGst ?? null,
            specifications: {
                minHp: specs.minHp ?? 0,
                maxHp: specs.maxHp ?? 0,
                recommendedHp: specs.recommendedHp ?? 0,
                otherSpecs: specs.otherSpecs ?? [],
            },
            standardFeatures: data.standardFeatures ?? [],
            optionalFeatures: (data.optionalFeatures || []).map((f: any) => ({
                ...f,
                cost: f.cost ?? null,
                sellPriceExclGst: f.sellPriceExclGst ?? null,
            })),
            packageLevels: (data.packageLevels || []).map((p: any) => ({
                ...p,
                cost: p.cost ?? null,
                sellPriceExclGst: p.sellPriceExclGst ?? null,
                includedFeatures: p.includedFeatures ?? [],
            })),
        };
    };

    const form = useForm<ModelFormData>({
        resolver: zodResolver(modelSchema),
        defaultValues: getSafeDefaultValues(model),
    });
    
    useEffect(() => {
        if (!loadedModelIdRef.current || model?.id !== loadedModelIdRef.current) {
            form.reset(getSafeDefaultValues(model));
            if (model?.id) {
                loadedModelIdRef.current = model.id;
            }
        }
    }, [model, form]);
    
    const { fields: specFields, append: appendSpec, remove: removeSpec } = useFieldArray({ control: form.control, name: "specifications.otherSpecs" });
    const { fields: featureFields, append: appendFeature, remove: removeFeature, replace: replaceFeatures } = useFieldArray({ control: form.control, name: "standardFeatures" });
    const { fields: packageLevelFields, append: appendPackageLevel, remove: removePackageLevel } = useFieldArray({ control: form.control, name: "packageLevels" });
    const { fields: galleryImageFields, append: appendGalleryImage, remove: removeGalleryImage } = useFieldArray({ control: form.control, name: 'galleryImageUrls' });
    
    const coverImageUrl = useWatch({ control: form.control, name: "coverImageUrl" });

    function onSubmit(values: ModelFormData) {
        setIsSubmitting(true);
        const modelDocRef = doc(firestore, docPath);

        updateDoc(modelDocRef, values)
            .then(() => {
                toast({ title: "Model Updated", description: "The model details have been saved successfully." });
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
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        <Save className="mr-2 h-4 w-4" /> Save Changes
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

                        {/* Package Levels Card */}
                         <Collapsible asChild defaultOpen>
                            <Card>
                                <CollapsibleCardHeader title="Package Levels">
                                    <Button type="button" variant="outline" size="sm" onClick={() => appendPackageLevel({ id: `pkg-lvl-${Date.now()}`, name: 'New Package Level', cost: null, sellPriceExclGst: null, includedFeatures: [] })}><PlusCircle className="mr-2 h-4 w-4"/> Add Package Level</Button>
                                </CollapsibleCardHeader>
                                <CollapsibleContent>
                                    <CardContent className="space-y-4">
                                        {packageLevelFields.map((field, index) => (
                                            <PackageLevelItem key={field.id} form={form} index={index} remove={removePackageLevel} />
                                        ))}
                                        {packageLevelFields.length === 0 && <p className="text-sm text-center py-4 text-muted-foreground">No package levels added.</p>}
                                    </CardContent>
                                </CollapsibleContent>
                            </Card>
                        </Collapsible>

                    </div>

                    <div className="lg:col-span-3 space-y-8">
                        <Collapsible asChild defaultOpen>
                             <Card>
                                <CollapsibleCardHeader title="Pricing" />
                                <CollapsibleContent>
                                    <CardContent className="space-y-6">
                                        <GstInputPair control={form.control} name="cost" label="Base Cost" />
                                        <GstInputPair control={form.control} name="sellPriceExclGst" label="Base Sell" />
                                        <GstInputPair control={form.control} name="freightCostExclGst" label="Freight Cost" />
                                    </CardContent>
                                </CollapsibleContent>
                            </Card>
                        </Collapsible>
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
                    </div>
                </div>
            </form>
        </Form>
    );
}

'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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
    category: z.string().optional(),
    packageStatus: z.record(z.string(), z.enum(['standard', 'optional'])).default({}),
});

const packageLevelSchema = z.object({
    id: z.string(),
    name: z.string().min(1, 'Package level name is required'),
    description: z.string().optional(),
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
                        <FormField control={control} name={`packageLevels.${index}.description`} render={({ field }) => ( 
                            <FormItem>
                                <FormLabel>Description</FormLabel>
                                <FormControl>
                                    <Textarea placeholder="A brief description of this package level." {...field} value={field.value ?? ''} />
                                </FormControl>
                                <FormMessage />
                            </FormItem> 
                        )} />
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

function SimpleOptionalFeatureItem({ form, index, remove }: { form: any; index: number; remove: (index: number) => void; }) {
    const imageUrl = useWatch({ control: form.control, name: `optionalFeatures.${index}.imageUrl` });
    const { control } = form;

    return (
        <Card className="bg-muted/50 overflow-hidden p-4">
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
                </div>
                 <div className="flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => remove(index)}><Trash2 className="h-4 w-4"/></Button>
                </div>
            </div>
        </Card>
    );
}

function PackageStatusPill({ control, featureIndex, packageId }: { control: any, featureIndex: number, packageId: string }) {
    const { field } = useController({
        control,
        name: `optionalFeatures.${featureIndex}.packageStatus.${packageId}`,
        defaultValue: 'optional'
    });

    const isStandard = field.value === 'standard';

    const toggleStatus = () => {
        field.onChange(isStandard ? 'optional' : 'standard');
    };

    return (
        <Button
            type="button"
            variant={isStandard ? 'default' : 'secondary'}
            className={cn("w-28", isStandard && 'bg-blue-600 hover:bg-blue-700')}
            size="sm"
            onClick={toggleStatus}
        >
            {isStandard ? 'Standard' : 'Optional'}
        </Button>
    );
}

function OptionalFeatureDetailsCell({ form, index, categories, onCategoryChangeRequest }: { form: any, index: number, categories: string[], onCategoryChangeRequest: (featureIndex: number, category?: string) => void }) {
    const imageUrl = useWatch({ control: form.control, name: `optionalFeatures.${index}.imageUrl` });

    return (
        <div className="flex gap-2 items-start min-w-[300px]">
            <FormField
                control={form.control}
                name={`optionalFeatures.${index}.imageUrl`}
                render={({ field }) => (
                    <FormItem className="w-20 flex-shrink-0">
                        {imageUrl ? (
                            <div className="relative aspect-square w-full overflow-hidden rounded-md group">
                                <Image src={imageUrl} alt="Feature" fill className="object-cover" />
                                <Button type="button" variant="outline" size="icon" className="absolute top-0.5 right-0.5 h-5 w-5 opacity-0 group-hover:opacity-100" onClick={() => field.onChange(null)}><X className="h-3 w-3" /></Button>
                            </div>
                        ) : (
                             <label htmlFor={`table-feature-upload-${index}`} className="flex aspect-square w-full items-center justify-center rounded-lg border-2 border-dashed cursor-pointer hover:bg-muted">
                                <Upload className="w-5 h-5 text-muted-foreground" />
                                <FormControl>
                                    <Input id={`table-feature-upload-${index}`} type="file" className="hidden" accept="image/*" onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (file) field.onChange(await fileToDataUri(file));
                                    }} />
                                </FormControl>
                            </label>
                        )}
                    </FormItem>
                )}
            />
            <div className="flex-1 space-y-2">
                <FormField control={form.control} name={`optionalFeatures.${index}.name`} render={({ field }) => ( 
                    <FormItem>
                        <FormControl><Input placeholder="Feature Name" {...field} /></FormControl>
                        <FormMessage />
                    </FormItem> 
                )} />
            </div>
             <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 self-start"><MoreHorizontal className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuSub>
                        <DropdownMenuSubTrigger>Move to...</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                            <DropdownMenuItem onClick={() => onCategoryChangeRequest(index, undefined)}>Uncategorized</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {categories.map((cat) => (
                                <DropdownMenuItem key={cat} onClick={() => onCategoryChangeRequest(index, cat)}>{cat}</DropdownMenuItem>
                            ))}
                        </DropdownMenuSubContent>
                    </DropdownMenuSub>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}

export function StabicraftModelEditor({ model, docPath }: { model: any; docPath: string }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [bulkFeatures, setBulkFeatures] = useState('');
    const loadedModelIdRef = useRef<string | null>(null);

    const [categories, setCategories] = useState<string[]>([]);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);

    const getSafeDefaultValues = (modelData: any): ModelFormData => {
        const data = modelData || {};
        const specs = data.specifications || {};
        const packages = data.packages || [];

        const optionalFeatures = (data.optionalFeatures || []).map((f: any) => {
            const packageStatus = f.packageStatus || {};
            packages.forEach((p: any) => {
                if (!(p.id in packageStatus)) {
                    packageStatus[p.id] = 'optional';
                }
            });
            return {
                ...f,
                packageStatus,
            };
        });

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
            optionalFeatures: optionalFeatures,
            packageLevels: (data.packageLevels || []).map((p: any) => ({
                ...p,
                description: p.description ?? '',
                cost: p.cost ?? null,
                sellPriceExclGst: p.sellPriceExclGst ?? null,
                includedFeatures: p.includedFeatures ?? [],
            })),
        };
    };

    const form = useForm<ModelFormData>({
        resolver: zodResolver(modelSchema),
    });
    
    useEffect(() => {
        if (!loadedModelIdRef.current || model?.id !== loadedModelIdRef.current) {
            const defaultValues = getSafeDefaultValues(model);
            form.reset(defaultValues);
            const initialCategories = [...new Set((defaultValues.optionalFeatures || []).map(f => f.category).filter(Boolean) as string[])];
            setCategories(initialCategories);
            if (model?.id) {
                loadedModelIdRef.current = model.id;
            }
        }
    }, [model, form]);
    
    const { fields: specFields, append: appendSpec, remove: removeSpec } = useFieldArray({ control: form.control, name: "specifications.otherSpecs" });
    const { fields: featureFields, append: appendFeature, remove: removeFeature, replace: replaceFeatures } = useFieldArray({ control: form.control, name: "standardFeatures" });
    const { fields: packageLevelFields, append: appendPackageLevel, remove: removePackageLevel } = useFieldArray({ control: form.control, name: "packageLevels" });
    const { fields: galleryImageFields, append: appendGalleryImage, remove: removeGalleryImage } = useFieldArray({ control: form.control, name: 'galleryImageUrls' });
    const { fields: optionalFeatureFields, append: appendOptionalFeature, remove: removeOptionalFeature, update: updateOptionalFeature } = useFieldArray({ control: form.control, name: "optionalFeatures" });
    
    const watchedOptionalFeatures = useWatch({ control: form.control, name: 'optionalFeatures' });
    const coverImageUrl = useWatch({ control: form.control, name: "coverImageUrl" });
    const packages = model.packages || [];

    const { uncategorizedFeatures, categorizedFeatures } = useMemo(() => {
        const uncategorized: { field: any, index: number }[] = [];
        const categoryMap = new Map<string, { field: any, index: number }[]>();
    
        optionalFeatureFields.forEach((field, index) => {
            const category = watchedOptionalFeatures?.[index]?.category;
            if (category && categories.includes(category)) {
                if (!categoryMap.has(category)) categoryMap.set(category, []);
                categoryMap.get(category)!.push({ field, index });
            } else {
                uncategorized.push({ field, index });
            }
        });
    
        const categorized = categories.map(name => ({
            name,
            items: categoryMap.get(name) || []
        }));
    
        return { uncategorizedFeatures: uncategorized, categorizedFeatures: categorized };
    }, [optionalFeatureFields, watchedOptionalFeatures, categories]);


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

    const handleAddCategory = () => {
        if (newCategoryName && !categories.includes(newCategoryName)) {
            setCategories(prev => [...prev, newCategoryName]);
            setNewCategoryName('');
        }
    };
    
    const handleConfirmDeleteCategory = () => {
        if (!categoryToDelete) return;
        watchedOptionalFeatures?.forEach((feature, index) => {
            if (feature.category === categoryToDelete) {
                updateOptionalFeature(index, { ...feature, category: undefined });
            }
        });
        setCategories(prev => prev.filter(c => c !== categoryToDelete));
        setCategoryToDelete(null);
    };

    const handleCategoryChange = (featureIndex: number, newCategory?: string) => {
        const currentFeature = watchedOptionalFeatures[featureIndex];
        updateOptionalFeature(featureIndex, { ...currentFeature, category: newCategory });
    };

    const handleAddNewFeature = (category?: string) => {
        const newFeature = {
            id: `feat-${Date.now()}`,
            name: '',
            imageUrl: null,
            category,
            packageStatus: packages.reduce((acc: any, pkg: any) => {
                acc[pkg.id] = 'optional';
                return acc;
            }, {}),
        };
        appendOptionalFeature(newFeature);
    }
    
    return (
         <>
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

                            <Collapsible asChild defaultOpen>
                                <Card>
                                    <CollapsibleCardHeader title="Package Levels" description="Define the different package levels for this model.">
                                        <Button type="button" variant="outline" size="sm" onClick={() => appendPackageLevel({ id: `pkg-lvl-${Date.now()}`, name: '', description: '', cost: null, sellPriceExclGst: null, includedFeatures: [] })}><PlusCircle className="mr-2 h-4 w-4"/>Add Package Level</Button>
                                    </CollapsibleCardHeader>
                                    <CollapsibleContent>
                                        <CardContent className="space-y-4">
                                             {packageLevelFields.map((field, index) => (
                                                <PackageLevelItem key={field.id} form={form} index={index} remove={removePackageLevel} />
                                            ))}
                                            {packageLevelFields.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No package levels added.</p>}
                                        </CardContent>
                                    </CollapsibleContent>
                                </Card>
                            </Collapsible>

                            {packages.length === 0 && (
                                <Collapsible asChild defaultOpen>
                                    <Card>
                                        <CollapsibleCardHeader title="Optional Features">
                                            <Button type="button" variant="outline" size="sm" onClick={() => handleAddNewFeature()}><PlusCircle className="mr-2 h-4 w-4" />Add Feature</Button>
                                        </CollapsibleCardHeader>
                                        <CollapsibleContent>
                                            <CardContent className="space-y-4">
                                                {optionalFeatureFields.map((field, index) => (
                                                    <SimpleOptionalFeatureItem key={field.id} form={form} index={index} remove={removeOptionalFeature} />
                                                ))}
                                                {optionalFeatureFields.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No optional features added.</p>}
                                            </CardContent>
                                        </CollapsibleContent>
                                    </Card>
                                </Collapsible>
                            )}

                        </div>
                        <div className="lg:col-span-3 space-y-8">
                             {(!packages || packages.length === 0) && (
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
                             )}
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
                    
                    {packages.length > 0 && (
                        <div className="lg:col-span-7">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Optional Features & Packages</CardTitle>
                                    <CardDescription>
                                        Manage optional features and specify if they are 'Standard' or 'Optional' for each package.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex items-center gap-2">
                                        <Input placeholder="New Category Name" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} className="max-w-xs"/>
                                        <Button type="button" onClick={handleAddCategory} disabled={!newCategoryName}>Add Category</Button>
                                    </div>
                                    <div className="space-y-4">
                                        <Collapsible defaultOpen>
                                            <CollapsibleTrigger className="w-full text-left">
                                                <div className="flex items-center justify-between border-b px-2 py-2">
                                                    <h3 className="font-semibold">Uncategorized</h3>
                                                    <Button type="button" variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleAddNewFeature(); }}><PlusCircle className="mr-2 h-4 w-4"/>Add Feature</Button>
                                                </div>
                                            </CollapsibleTrigger>
                                            <CollapsibleContent className="p-2">
                                                {uncategorizedFeatures.length > 0 ? (
                                                    <div className="overflow-x-auto">
                                                        <Table>
                                                            <TableHeader>
                                                                <TableRow>
                                                                    <TableHead>Optional Feature</TableHead>
                                                                    {packages.map((pkg: any) => <TableHead key={pkg.id} className="text-center">{pkg.name}</TableHead>)}
                                                                    <TableHead className="text-right">Actions</TableHead>
                                                                </TableRow>
                                                            </TableHeader>
                                                            <TableBody>
                                                                {uncategorizedFeatures.map(({ field, index }) => (
                                                                    <TableRow key={field.id}>
                                                                        <TableCell><OptionalFeatureDetailsCell form={form} index={index} categories={categories} onCategoryChangeRequest={handleCategoryChange} /></TableCell>
                                                                        {packages.map((pkg: any) => <TableCell key={pkg.id} className="text-center"><PackageStatusPill control={form.control} featureIndex={index} packageId={pkg.id} /></TableCell>)}
                                                                        <TableCell className="text-right"><Button type="button" variant="ghost" size="icon" onClick={() => removeOptionalFeature(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                                                                    </TableRow>
                                                                ))}
                                                            </TableBody>
                                                        </Table>
                                                    </div>
                                                ) : <p className="text-sm text-muted-foreground text-center py-4">No uncategorized features.</p>}
                                            </CollapsibleContent>
                                        </Collapsible>
                                        
                                        {categorizedFeatures.map(({ name, items }) => (
                                            <Collapsible key={name} defaultOpen>
                                                <CollapsibleTrigger className="w-full text-left">
                                                     <div className="flex items-center justify-between border-b px-2 py-2">
                                                        <h3 className="font-semibold">{name}</h3>
                                                        <div className='flex items-center'>
                                                            <Button type="button" variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleAddNewFeature(name); }}><PlusCircle className="mr-2 h-4 w-4"/>Add Feature</Button>
                                                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); setCategoryToDelete(name); }}><Trash2 className="h-4 w-4"/></Button>
                                                        </div>
                                                    </div>
                                                </CollapsibleTrigger>
                                                <CollapsibleContent className="p-2">
                                                    {items.length > 0 ? (
                                                        <div className="overflow-x-auto">
                                                             <Table>
                                                                <TableHeader>
                                                                    <TableRow>
                                                                        <TableHead>Optional Feature</TableHead>
                                                                        {packages.map((pkg: any) => <TableHead key={pkg.id} className="text-center">{pkg.name}</TableHead>)}
                                                                        <TableHead className="text-right">Actions</TableHead>
                                                                    </TableRow>
                                                                </TableHeader>
                                                                <TableBody>
                                                                    {items.map(({ field, index }) => (
                                                                        <TableRow key={field.id}>
                                                                            <TableCell><OptionalFeatureDetailsCell form={form} index={index} categories={categories} onCategoryChangeRequest={handleCategoryChange} /></TableCell>
                                                                            {packages.map((pkg: any) => <TableCell key={pkg.id} className="text-center"><PackageStatusPill control={form.control} featureIndex={index} packageId={pkg.id} /></TableCell>)}
                                                                            <TableCell className="text-right"><Button type="button" variant="ghost" size="icon" onClick={() => removeOptionalFeature(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                                                                        </TableRow>
                                                                    ))}
                                                                </TableBody>
                                                            </Table>
                                                        </div>
                                                    ) : <p className="text-sm text-muted-foreground text-center py-4">No features in this category.</p>}
                                                </CollapsibleContent>
                                            </Collapsible>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </form>
            </Form>
            <Dialog open={!!categoryToDelete} onOpenChange={(open) => !open && setCategoryToDelete(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Category "{categoryToDelete}"?</DialogTitle>
                        <DialogDescription>
                            This will remove the category. Any features inside it will become uncategorized. This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setCategoryToDelete(null)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleConfirmDeleteCategory}>Delete</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

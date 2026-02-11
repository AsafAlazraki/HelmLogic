'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, X, PlusCircle, Trash2, Upload, Image as ImageIcon, ChevronDown, MoreHorizontal, Plus } from 'lucide-react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';


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
    cost: z.number().nullable().optional(),
    sellPriceExclGst: z.number().nullable().optional(),
});

const optionalFeatureSchema = z.object({
    id: z.string(),
    name: z.string().min(1, 'Feature name is required'),
    imageUrl: z.string().nullable().optional(),
    cost: z.number().nullable().optional(),
    sellPriceExclGst: z.number().nullable().optional(),
});

const packageSchema = z.object({
    id: z.string(),
    name: z.string().min(1, 'Package name is required'),
    category: z.string().optional(),
    imageUrl: z.string().nullable().optional(),
    cost: z.number().nullable().optional(),
    sellPriceExclGst: z.number().nullable().optional(),
    includedFeatures: z.array(z.string()).default([]),
});

const modelSchema = z.object({
    coverImageUrl: z.string().nullable().optional(),
    galleryImageUrls: z.array(z.string()).default([]),
    cost: z.number().nullable().optional(),
    sellPriceExclGst: z.number().nullable().optional(),
    freightCostExclGst: z.number().nullable().optional(),
    specifications: z.object({
        minHp: z.number().min(0).default(0),
        maxHp: z.number().min(0).default(0),
        recommendedHp: z.number().min(0).default(0),
        otherSpecs: z.array(specSchema).default([]),
    }).optional(),
    standardFeatures: z.array(z.string()).default([]),
    optionalFeatures: z.array(optionalFeatureSchema).default([]),
    packages: z.array(packageSchema).default([]),
    colors: z.array(colorVariantSchema).default([]),
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
        name: `packages.${packageIndex}.includedFeatures`
    });

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
                        name={`packages.${packageIndex}.includedFeatures.${index}`}
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
        </div>
    );
}

function PackageItem({ 
    form, 
    index, 
    remove,
    allCategories,
    onCategoryChange,
    onNewCategoryRequest
}: { 
    form: any; 
    index: number; 
    remove: (index: number) => void;
    allCategories: string[];
    onCategoryChange: (packageIndex: number, newCategory: string | undefined) => void;
    onNewCategoryRequest: (packageIndex: number) => void;
}) {
    const imageUrl = useWatch({ control: form.control, name: `packages.${index}.imageUrl` });
    const {control} = form;

    return (
        <Collapsible asChild>
            <Card key={index} className="bg-muted/50 overflow-hidden">
                <div className="p-4 flex justify-between items-start">
                    <div className="flex-1 pr-4">
                        <FormField control={form.control} name={`packages.${index}.name`} render={({ field }) => ( 
                            <FormItem>
                                <FormControl>
                                    <Input className="text-lg font-semibold border-none shadow-none p-0 h-auto bg-transparent focus-visible:ring-0" placeholder="Package Name" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem> 
                        )} />
                    </div>
                    <div className="flex items-center">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuSub>
                                    <DropdownMenuSubTrigger>Move to...</DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent>
                                        <DropdownMenuItem onClick={() => onCategoryChange(index, undefined)}>Uncategorized</DropdownMenuItem>
                                        <DropdownMenuSeparator/>
                                        {allCategories.map((cat) => (
                                            <DropdownMenuItem key={cat} onClick={() => onCategoryChange(index, cat)}>{cat}</DropdownMenuItem>
                                        ))}
                                        <DropdownMenuSeparator/>
                                        <DropdownMenuItem onClick={() => onNewCategoryRequest(index)}>New Category...</DropdownMenuItem>
                                    </DropdownMenuSubContent>
                                </DropdownMenuSub>
                                <DropdownMenuSeparator/>
                                <DropdownMenuItem onClick={() => remove(index)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <ChevronDown className="h-5 w-5 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                            </Button>
                        </CollapsibleTrigger>
                    </div>
                </div>
                <CollapsibleContent>
                    <div className="px-4 pb-4 space-y-4">
                        <FormField
                            control={control}
                            name={`packages.${index}.imageUrl`}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="sr-only">Package Image</FormLabel>
                                    {imageUrl ? (
                                        <div className="relative aspect-video w-full overflow-hidden rounded-md group">
                                            <Image src={imageUrl} alt="Package image" fill className="object-cover" />
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
                                            <label htmlFor={`package-upload-${index}`} className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-secondary hover:bg-muted">
                                                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                                    <Upload className="w-8 h-8 mb-2 text-muted-foreground" />
                                                    <p className="mb-2 text-sm text-muted-foreground"><span className="font-semibold">Click to upload</span></p>
                                                </div>
                                                <FormControl>
                                                    <Input id={`package-upload-${index}`} type="file" className="hidden" accept="image/*" onChange={async (e) => {
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
                        
                        <Collapsible>
                            <CollapsibleTrigger asChild>
                                <Button type="button" variant="ghost" className="w-full justify-between px-0 hover:bg-transparent -mb-2">
                                    <span className="text-xs text-muted-foreground font-semibold">PRICING</span>
                                    <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
                                </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="space-y-4 pt-2">
                                <GstInputPair control={control} name={`packages.${index}.cost`} label="Cost" />
                                <GstInputPair control={control} name={`packages.${index}.sellPriceExclGst`} label="Sell Price" />
                            </CollapsibleContent>
                        </Collapsible>
                        
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

export function JeanneauModelEditor({ model, docPath }: { model: any; docPath: string }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [bulkFeatures, setBulkFeatures] = useState('');
    const loadedModelIdRef = useRef<string | null>(null);
    const isSavingRef = useRef(false);

    const [categories, setCategories] = useState<string[]>([]);
    const [newCategoryName, setNewCategoryName] = useState('');

    const [isNewCatDialogOpen, setIsNewCatDialogOpen] = useState(false);
    const [pkgIndexForNewCat, setPkgIndexForNewCat] = useState<number | null>(null);
    const [newCatNameForMove, setNewCatNameForMove] = useState('');

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
            packages: (data.packages || []).map((p: any) => ({ 
                ...p, 
                category: p.category || undefined,
                includedFeatures: p.includedFeatures ?? [],
                cost: p.cost ?? null,
                sellPriceExclGst: p.sellPriceExclGst ?? null,
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
    };

    const form = useForm<ModelFormData>({
        resolver: zodResolver(modelSchema),
        defaultValues: getSafeDefaultValues(model),
    });
    
    const { getValues, reset } = form;

    const saveChanges = useCallback((showToast: boolean) => {
        isSavingRef.current = true;
        const values = getValues();
        const modelDocRef = doc(firestore, docPath);

        updateDoc(modelDocRef, values)
            .then(() => {
                if (showToast) {
                    toast({ title: "Model Updated", description: "Your changes have been saved." });
                }
            })
            .catch((e: any) => {
                console.error("Save failed:", e);
                toast({ variant: "destructive", title: "Error", description: "Could not save changes." });
                const permissionError = new FirestorePermissionError({
                    path: modelDocRef.path, operation: 'update', requestResourceData: values,
                });
                errorEmitter.emit('permission-error', permissionError);
            })
            .finally(() => {
                isSavingRef.current = false;
            });
    }, [docPath, firestore, getValues, toast]);

    useEffect(() => {
        const interval = setInterval(() => {
            saveChanges(false);
        }, 1000);
        return () => clearInterval(interval);
    }, [saveChanges]);
    
    const { fields: specFields, append: appendSpec, remove: removeSpec } = useFieldArray({ control: form.control, name: "specifications.otherSpecs" });
    const { fields: featureFields, append: appendFeature, remove: removeFeature, replace: replaceFeatures } = useFieldArray({ control: form.control, name: "standardFeatures" });
    const { fields: packageFields, append: appendPackage, remove: removePackage, update: updatePackage } = useFieldArray({ control: form.control, name: "packages" });
    const { fields: optionalFeatureFields, append: appendOptionalFeature, remove: removeOptionalFeature } = useFieldArray({ control: form.control, name: "optionalFeatures" });
    const { fields: colorFields, append: appendColor, remove: removeColor, update: updateColor } = useFieldArray({ control: form.control, name: "colors" });
    const { fields: galleryImageFields, append: appendGalleryImage, remove: removeGalleryImage } = useFieldArray({ control: form.control, name: 'galleryImageUrls' });
    
    const watchedPackages = useWatch({ control: form.control, name: 'packages' });
    const watchedColors = useWatch({ control: form.control, name: 'colors' });
    const coverImageUrl = useWatch({ control: form.control, name: "coverImageUrl" });

    useEffect(() => {
        if (!loadedModelIdRef.current || model?.id !== loadedModelIdRef.current) {
            const defaultValues = getSafeDefaultValues(model);
            form.reset(defaultValues);
            const initialCategories = [...new Set((defaultValues.packages || []).map(p => p.category).filter(Boolean) as string[])];
            setCategories(initialCategories);
            if (model?.id) {
                loadedModelIdRef.current = model.id;
            }
        }
    }, [model, form]);
    
    const { uncategorizedPackages, categorized, allCategories } = useMemo(() => {
        const uncategorized: { field: any, index: number }[] = [];
        const categoryMap = new Map<string, { field: any, index: number }[]>();
    
        packageFields.forEach((field, index) => {
            const category = watchedPackages?.[index]?.category;
            if (category) {
                if (!categoryMap.has(category)) {
                    categoryMap.set(category, []);
                }
                categoryMap.get(category)!.push({ field, index });
            } else {
                uncategorized.push({ field, index });
            }
        });
    
        const categorized = categories.map(name => ({
            name,
            items: categoryMap.get(name) || []
        }));
    
        return { uncategorizedPackages: uncategorized, categorized, allCategories: categories };
    }, [packageFields, watchedPackages, categories]);

    function onSubmit(values: ModelFormData) {
        setIsSubmitting(true);
        saveChanges(true);
        setIsSubmitting(false);
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
    
    const handleDeleteCategory = (categoryToDelete: string) => {
        watchedPackages?.forEach((pkg, index) => {
            if (pkg.category === categoryToDelete) {
                updatePackage(index, { ...pkg, category: undefined });
            }
        });
        setCategories(prev => prev.filter(c => c !== categoryToDelete));
    };

    const handleCategoryChange = (packageIndex: number, newCategory: string | undefined) => {
        updatePackage(packageIndex, { ...watchedPackages[packageIndex], category: newCategory });
    };

    const handleOpenNewCatDialog = (index: number) => {
        setPkgIndexForNewCat(index);
        setIsNewCatDialogOpen(true);
    };

    const handleConfirmNewCat = () => {
        if (newCatNameForMove && pkgIndexForNewCat !== null) {
            handleCategoryChange(pkgIndexForNewCat, newCatNameForMove);
            if (!categories.includes(newCatNameForMove)) {
                setCategories(prev => [...prev, newCatNameForMove]);
            }
        }
        setIsNewCatDialogOpen(false);
        setNewCatNameForMove('');
        setPkgIndexForNewCat(null);
    };


    return (
        <>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <div className="flex justify-end">
                        <Button type="submit">
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

                            {/* Packages Card */}
                            <Collapsible asChild defaultOpen>
                                <Card>
                                    <CollapsibleCardHeader title="Optional Packages">
                                        <div className="flex gap-2 items-center">
                                            <Input placeholder="New Category Name" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} className="h-9"/>
                                            <Button type="button" size="sm" onClick={handleAddCategory}>Add Category</Button>
                                        </div>
                                    </CollapsibleCardHeader>
                                    <CollapsibleContent>
                                        <CardContent className="space-y-6">
                                            <div className="p-4 border-2 border-dashed rounded-lg space-y-4">
                                                <div className="flex justify-between items-center -mb-2">
                                                    <h3 className="text-lg font-semibold">Uncategorized</h3>
                                                    <Button type="button" variant="outline" size="sm" onClick={() => appendPackage({ id: `pkg-${Date.now()}`, name: 'New Package', imageUrl: '', cost: null, sellPriceExclGst: null, includedFeatures: [] })}><PlusCircle className="mr-2 h-4 w-4"/> Add Package</Button>
                                                </div>
                                                {uncategorizedPackages.map(({field, index}) => (
                                                    <PackageItem key={field.id} form={form} index={index} remove={removePackage} allCategories={allCategories} onCategoryChange={handleCategoryChange} onNewCategoryRequest={handleOpenNewCatDialog} />
                                                ))}
                                                {uncategorizedPackages.length === 0 && <p className="text-sm text-center py-4 text-muted-foreground">No uncategorized packages.</p>}
                                            </div>

                                            {categorized.map(({ name, items }) => (
                                                <Card key={name} className="overflow-hidden">
                                                    <CardHeader className="flex-row justify-between items-center bg-muted/50 p-4">
                                                        <CardTitle className="text-lg">{name}</CardTitle>
                                                        <div className="flex items-center gap-2">
                                                            <Button type="button" variant="outline" size="sm" onClick={() => appendPackage({ id: `pkg-${Date.now()}`, name: 'New Package', imageUrl: '', cost: null, sellPriceExclGst: null, includedFeatures: [], category: name })}><PlusCircle className="mr-2 h-4 w-4"/>Add Package</Button>
                                                            <Button type="button" variant="ghost" size="icon" onClick={() => handleDeleteCategory(name)} className="text-destructive hover:text-destructive hover:bg-destructive/10 h-9 w-9"><Trash2 className="h-4 w-4" /></Button>
                                                        </div>
                                                    </CardHeader>
                                                    <CardContent className="p-4 space-y-4">
                                                        {items.map(({ field, index }) => (
                                                            <PackageItem key={field.id} form={form} index={index} remove={removePackage} allCategories={allCategories} onCategoryChange={handleCategoryChange} onNewCategoryRequest={handleOpenNewCatDialog} />
                                                        ))}
                                                        {items.length === 0 && <p className="text-sm text-center py-4 text-muted-foreground">No packages in this category.</p>}
                                                    </CardContent>
                                                </Card>
                                            ))}
                                        </CardContent>
                                    </CollapsibleContent>
                                </Card>
                            </Collapsible>
                            {/* Colors Card */}
                            <Collapsible asChild defaultOpen>
                                <Card>
                                    <CollapsibleCardHeader title="Color Variants">
                                        <Button type="button" variant="outline" size="sm" onClick={() => appendColor({ id: `color-${Date.now()}`, name: '', imageUrls: [], cost: null, sellPriceExclGst: null })}><PlusCircle className="mr-2 h-4 w-4" />Add Color</Button>
                                    </CollapsibleCardHeader>
                                    <CollapsibleContent>
                                        <CardContent className="space-y-4">
                                            {colorFields.map((field, index) => (
                                                <Card key={field.id} className="p-4 bg-muted/50">
                                                    <div className="flex justify-between items-center mb-4">
                                                        <FormField control={form.control} name={`colors.${index}.name`} render={({ field }) => ( <FormItem className="flex-1"><FormLabel className="sr-only">Color Name</FormLabel><FormControl><Input placeholder="Color Name" {...field} /></FormControl><FormMessage /></FormItem> )} />
                                                        <Button type="button" variant="destructive" size="icon" onClick={() => removeColor(index)} className="ml-2 shrink-0"><Trash2 className="h-4 w-4" /></Button>
                                                    </div>
                                                    <div className="space-y-4">
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
                                                        <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                                                            <GstInputPair control={form.control} name={`colors.${index}.cost`} label="Additional Cost" />
                                                            <GstInputPair control={form.control} name={`colors.${index}.sellPriceExclGst`} label="Additional Sell Price" />
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
                                                    <CollapsibleTrigger asChild>
                                                        <Button type="button" variant="ghost" className="w-full flex justify-between items-center text-sm font-medium py-2 border-t border-b data-[state=open]:border-b-0">
                                                            <span>Image Gallery ({galleryImageFields.length})</span>
                                                            <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
                                                        </Button>
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
                                        <Button type="button" variant="outline" size="sm" onClick={() => appendOptionalFeature({ id: `feat-${Date.now()}`, name: '', cost: null, sellPriceExclGst: null, imageUrl: null })}><PlusCircle className="mr-2 h-4 w-4" />Add Feature</Button>
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
                </form>
            </Form>
            <Dialog open={isNewCatDialogOpen} onOpenChange={setIsNewCatDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create New Category</DialogTitle>
                        <DialogDescription>Enter a name for the new category.</DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Input 
                            placeholder="Category Name"
                            value={newCatNameForMove}
                            onChange={(e) => setNewCatNameForMove(e.target.value)}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsNewCatDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleConfirmNewCat}>Create & Move</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

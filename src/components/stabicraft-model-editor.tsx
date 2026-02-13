'use client';

import * as React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useForm, useFieldArray, useWatch, useController } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useFirestore } from '@/firebase/provider';
import { doc, updateDoc, collection, getDoc, writeBatch } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { fileToDataUri } from '@/firebase/storage-utils';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, X, PlusCircle, Trash2, Upload, Image as ImageIcon, Plus, ChevronDown, MoreHorizontal, Move } from 'lucide-react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCollection } from '@/firebase/firestore/use-collection';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from './ui/checkbox';

// Schemas for validation
const specSchema = z.object({
    id: z.string(),
    label: z.string().min(1, 'Label is required'),
    value: z.string().min(1, 'Value is required'),
});

const motorConfigSchema = z.object({
    type: z.enum(["Single", "Twin", "Triple", "SingleWithAux"]),
    minHp: z.coerce.number().min(0).default(0),
    maxHp: z.coerce.number().min(0).default(0),
    recommendedHp: z.coerce.number().min(0).default(0),
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
});

const modelSchema = z.object({
    coverImageUrl: z.string().nullable().optional(),
    galleryImageUrls: z.array(z.string()).default([]),
    cost: z.coerce.number().nullable().optional(),
    sellPriceExclGst: z.coerce.number().nullable().optional(),
    freightCostExclGst: z.coerce.number().nullable().optional(),
    specifications: z.object({
        motorConfigurations: z.array(motorConfigSchema).default([]),
        otherSpecs: z.array(specSchema).default([]),
    }).optional(),
    standardFeatures: z.array(z.string()).default([]),
    optionalFeatures: z.array(optionalFeatureSchema).default([]),
    packageLevels: z.array(packageLevelSchema).default([]),
});

type ModelFormData = z.infer<typeof modelSchema>;

interface Range {
  id: string;
  name: string;
  slug?: string;
}

const GST_RATE = 0.10;

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
      sanitizedData[key] = sanitizeDataForFirestore(value);
    }
  }
  return sanitizedData;
}

function GstInputPair({ control, name, label }: { control: any, name: string, label: string }) {
    const { field } = useController({ control, name, defaultValue: null });

    const valueExcl = field.value;
    const valueIncl = valueExcl !== null && valueExcl !== undefined ? Math.round((valueExcl * (1 + GST_RATE)) * 100) / 100 : null;

    const handleExclChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (val === '') {
            field.onChange(null);
        } else {
            const num = parseFloat(val);
            field.onChange(isNaN(num) ? null : num);
        }
    };

    const handleInclChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (val === '') {
            field.onChange(null);
        } else {
            const num = parseFloat(val);
            if (!isNaN(num)) {
                const excl = num / (1 + GST_RATE);
                field.onChange(Math.round(excl * 10000) / 10000);
            }
        }
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
                            value={valueExcl === null || valueExcl === undefined ? '' : valueExcl}
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
                            value={valueIncl === null || valueIncl === undefined ? '' : String(valueIncl)}
                            onChange={handleInclChange}
                        />
                    </FormControl>
                    <FormMessage />
                </FormItem>
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
                                    <Textarea placeholder="A brief description of this package level." {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem> 
                        )} />
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
                <div className="flex-shrink-0 self-start">
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

function OptionalFeatureDetailsCell({ form, index, remove, categories, onCategoryChangeRequest }: { form: any; index: number; remove: (index: number) => void; categories: string[]; onCategoryChangeRequest: (featureIndex: number, category?: string) => void; }) {
    const imageUrl = useWatch({ control: form.control, name: `optionalFeatures.${index}.imageUrl` });

    return (
        <div className="flex gap-2 items-center min-w-[300px]">
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
            <div className="flex-1">
                <FormField control={form.control} name={`optionalFeatures.${index}.name`} render={({ field }) => ( 
                    <FormItem>
                        <FormControl><Input placeholder="Feature Name" {...field} value={field.value ?? ''} /></FormControl>
                        <FormMessage />
                    </FormItem> 
                )} />
            </div>
             <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 self-start"><MoreHorizontal className="h-4 w-4" /></Button>
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
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onClick={() => remove(index)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}

function MotorConfigurationsCard({ control }: { control: any }) {
    const { fields, append, remove } = useFieldArray({
        control,
        name: "specifications.motorConfigurations",
    });

    const motorConfigOptions = [
        { id: 'Single', label: 'Single Engine' },
        { id: 'Twin', label: 'Twin Engines' },
        { id: 'Triple', label: 'Triple Engines' },
        { id: 'SingleWithAux', label: 'Single with Aux' },
    ];

    const handleConfigChange = (checked: boolean, type: 'Single' | 'Twin' | 'Triple' | 'SingleWithAux') => {
        if (checked) {
            append({ type: type, minHp: 0, maxHp: 0, recommendedHp: 0 });
        } else {
            const index = fields.findIndex((field: any) => field.type === type);
            if (index > -1) {
                remove(index);
            }
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Motor Configurations</CardTitle>
                <CardDescription>Define supported engine configurations and HP ratings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
                {motorConfigOptions.map((option) => {
                    const fieldIndex = fields.findIndex((field: any) => field.type === option.id);
                    const isChecked = fieldIndex !== -1;

                    return (
                        <Collapsible key={option.id} asChild>
                            <div className="p-4 border rounded-lg">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-3">
                                        <Checkbox
                                            checked={isChecked}
                                            onCheckedChange={(checked) => handleConfigChange(!!checked, option.id as any)}
                                            id={`config-${option.id}`}
                                        />
                                        <label htmlFor={`config-${option.id}`} className="text-sm font-medium leading-none">
                                            {option.label}
                                        </label>
                                    </div>
                                    {isChecked && (
                                        <CollapsibleTrigger asChild>
                                            <Button variant="ghost" size="icon">
                                                <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                                            </Button>
                                        </CollapsibleTrigger>
                                    )}
                                </div>
                                <CollapsibleContent className="pt-4 mt-4 border-t">
                                    {isChecked && (
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <FormField
                                                control={control}
                                                name={`specifications.motorConfigurations.${fieldIndex}.minHp`}
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Min HP</FormLabel>
                                                        <FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={control}
                                                name={`specifications.motorConfigurations.${fieldIndex}.maxHp`}
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Max HP</FormLabel>
                                                        <FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={control}
                                                name={`specifications.motorConfigurations.${fieldIndex}.recommendedHp`}
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Recommended HP</FormLabel>
                                                        <FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </div>
                                    )}
                                </CollapsibleContent>
                            </div>
                        </Collapsible>
                    );
                })}
            </CardContent>
        </Card>
    );
}

export function StabicraftModelEditor({ model, docPath, vendor }: { model: any; docPath: string, vendor: any }) {
    const firestore = useFirestore();
    const router = useRouter();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [bulkFeatures, setBulkFeatures] = useState('');
    const loadedModelIdRef = useRef<string | null>(null);
    const isSavingRef = useRef(false);

    const [categories, setCategories] = useState<string[]>([]);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);

    const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false);
    const [targetRangeId, setTargetRangeId] = useState('');
    const [isMoving, setIsMoving] = useState(false);
    
    const { data: allRanges, loading: rangesLoading } = useCollection<Range>(vendor ? `data-warehouse/${vendor.id}/ranges` : null);

    const getSafeDefaultValues = (modelData: any): ModelFormData => {
        const data = modelData || {};
        const specs = data.specifications || {};
        const packageLevels = data.packageLevels || [];

        const optionalFeatures = (data.optionalFeatures || []).map((f: any) => {
            const packageStatus = f.packageStatus || {};
            packageLevels.forEach((p: any) => {
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
                motorConfigurations: specs.motorConfigurations ?? [],
                otherSpecs: specs.otherSpecs ?? [],
            },
            standardFeatures: data.standardFeatures ?? [],
            optionalFeatures: optionalFeatures,
            packageLevels: (data.packageLevels || []).map((p: any) => ({
                ...p,
                description: p.description ?? '',
                cost: p.cost ?? null,
                sellPriceExclGst: p.sellPriceExclGst ?? null,
            })),
        };
    };

    const form = useForm<ModelFormData>({
        resolver: zodResolver(modelSchema),
        defaultValues: getSafeDefaultValues(model),
    });
    
    const { getValues, reset, formState: { isDirty } } = form;

    const saveChanges = useCallback((showToast: boolean) => {
        isSavingRef.current = true;
        const values = getValues();
        const sanitizedValues = sanitizeDataForFirestore(values);
        const modelDocRef = doc(firestore, docPath);

        updateDoc(modelDocRef, sanitizedValues)
            .then(() => {
                if (showToast) {
                    toast({ title: "Model Updated", description: "Your changes have been saved." });
                }
            })
            .catch((e: any) => {
                console.error("Save failed:", e);
                const permissionError = new FirestorePermissionError({
                    path: modelDocRef.path, operation: 'update', requestResourceData: sanitizedValues,
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

    useEffect(() => {
        if (!isDirty) {
            const defaultValues = getSafeDefaultValues(model);
            reset(defaultValues);
            const initialCategories = [...new Set((defaultValues.optionalFeatures || []).map(f => f.category).filter(Boolean) as string[])];
            setCategories(initialCategories);
            loadedModelIdRef.current = model.id;
        }
    }, [model, reset, isDirty]);
    
    const { fields: specFields, append: appendSpec, remove: removeSpec } = useFieldArray({ control: form.control, name: "specifications.otherSpecs" });
    const { fields: featureFields, append: appendFeature, remove: removeFeature, replace: replaceFeatures } = useFieldArray({ control: form.control, name: "standardFeatures" });
    const { fields: packageLevelFields, append: appendPackageLevel, remove: removePackageLevel } = useFieldArray({ control: form.control, name: "packageLevels" });
    const { fields: galleryImageFields, append: appendGalleryImage, remove: removeGalleryImage } = useFieldArray({ control: form.control, name: 'galleryImageUrls' });
    const { fields: optionalFeatureFields, append: appendOptionalFeature, remove: removeOptionalFeature, update: updateOptionalFeature } = useFieldArray({ control: form.control, name: "optionalFeatures" });
    
    const watchedOptionalFeatures = useWatch({ control: form.control, name: 'optionalFeatures' });
    const watchedPackageLevels = useWatch({ control: form.control, name: 'packageLevels' });
    const coverImageUrl = useWatch({ control: form.control, name: "coverImageUrl" });

    const { uncategorizedFeatures, categorizedFeatures } = React.useMemo(() => {
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
        saveChanges(true);
        setIsSubmitting(false);
    }
    
    const handleBulkAddFeatures = () => {
        const features = bulkFeatures.split('\n').map(f => f.trim()).filter(Boolean);
        replaceFeatures(features.map(f => f));
        setBulkFeatures('');
    };

    const handleAddCategory = () => {
        if (newCategoryName.trim() && !categories.includes(newCategoryName.trim())) {
            setCategories(prev => [...prev, newCategoryName.trim()]);
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
        const packageLevels = getValues('packageLevels') || [];
        const newFeature = {
            id: `feat-${Date.now()}`,
            name: '',
            imageUrl: null,
            category,
            packageStatus: packageLevels.reduce((acc: any, pkg: any) => {
                acc[pkg.id] = 'optional';
                return acc;
            }, {}),
        };
        appendOptionalFeature(newFeature);
    }

    const handleMoveModel = async () => {
        if (!targetRangeId) {
            toast({ variant: 'destructive', title: 'No destination range selected.' });
            return;
        }
        setIsMoving(true);
        try {
            const oldDocRef = doc(firestore, docPath);
            const currentModelData = await getDoc(oldDocRef);

            if (!currentModelData.exists()) {
                throw new Error("Original model document not found.");
            }
            
            const modelData = currentModelData.data();
            modelData.rangeId = targetRangeId; // Update rangeId

            const newDocRef = doc(firestore, `data-warehouse/${vendor.id}/ranges/${targetRangeId}/models`, model.id);
            
            const batch = writeBatch(firestore);
            batch.set(newDocRef, modelData);
            batch.delete(oldDocRef);
            
            await batch.commit();

            toast({ title: 'Model Moved', description: `Successfully moved to new range.` });
            const targetRange = allRanges?.find(r => r.id === targetRangeId);
            const newPath = `/data-warehouse/${vendor.slug || vendor.id}/ranges/${targetRange?.slug || targetRangeId}/models/${model.slug || model.id}`;
            router.push(newPath);

        } catch (error: any) {
            console.error("Failed to move model:", error);
            toast({ variant: 'destructive', title: 'Move Failed', description: error.message });
        } finally {
            setIsMoving(false);
            setIsMoveDialogOpen(false);
        }
    };
    
    return (
         <>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setIsMoveDialogOpen(true)}><Move className="mr-2 h-4 w-4"/>Move Model</Button>
                         <Button type="submit">
                            <Save className="mr-2 h-4 w-4" /> Save Changes
                        </Button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-7 gap-8 items-start">
                        {/* --- LEFT COLUMN --- */}
                        <div className="lg:col-span-4 space-y-8">
                            <MotorConfigurationsCard control={form.control} />
                            <Collapsible asChild defaultOpen>
                                <Card>
                                    <CollapsibleCardHeader title="Specifications">
                                        <Button type="button" variant="outline" size="sm" onClick={() => appendSpec({ id: `spec-${Date.now()}`, label: '', value: '' })}><PlusCircle className="mr-2 h-4 w-4" />Add Spec</Button>
                                    </CollapsibleCardHeader>
                                    <CollapsibleContent>
                                        <CardContent className="space-y-6">
                                            <div className="space-y-4">
                                                {specFields.length > 0 && <FormLabel>Other Specs</FormLabel>}
                                                {specFields.map((field, index) => (
                                                    <div key={field.id} className="flex items-end gap-2">
                                                        <FormField control={form.control} name={`specifications.otherSpecs.${index}.label`} render={({ field }) => ( <FormItem className="flex-1"><FormControl><Input placeholder="Label" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )} />
                                                        <FormField control={form.control} name={`specifications.otherSpecs.${index}.value`} render={({ field }) => ( <FormItem className="flex-1"><FormControl><Input placeholder="Value" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )} />
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
                                                    <FormField control={form.control} name={`standardFeatures.${index}`} render={({ field }) => ( <FormItem className="flex-1"><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )} />
                                                    <Button type="button" variant="ghost" size="icon" onClick={() => removeFeature(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                                </div>
                                            ))}
                                        </CardContent>
                                        <CardContent>
                                            <div className="space-y-2">
                                                <FormLabel>Bulk Add Features</FormLabel>
                                                <Textarea placeholder="One feature per line..." value={bulkFeatures} onChange={(e) => setBulkFeatures(e.target.value)} />
                                                <Button type="button" variant="secondary" size="sm" onClick={handleBulkAddFeatures} disabled={!bulkFeatures.trim()}>Add from Text</Button>
                                            </div>
                                        </CardContent>
                                    </CollapsibleContent>
                                </Card>
                            </Collapsible>
                            
                             {packageLevelFields.length === 0 ? (
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
                             ) : (
                                <Collapsible asChild defaultOpen>
                                    <Card>
                                        <CollapsibleCardHeader title="Cover Image" />
                                        <CollapsibleContent>
                                            <CardContent>
                                                {/* Cover Image and Gallery FormField */}
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
                                                                        className="absolute right-1 top-1 z-10 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
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
                                                        <CollapsibleTrigger className="flex w-full items-center justify-between border-b border-t py-2 text-sm font-medium data-[state=open]:border-b-0">
                                                            <span>Image Gallery ({galleryImageFields.length})</span>
                                                            <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
                                                        </CollapsibleTrigger>
                                                        <CollapsibleContent className="border-b">
                                                            <div className="p-4 bg-muted/20">
                                                                <div className="grid grid-cols-3 gap-2">
                                                                    {galleryImageFields.map((item, index) => (
                                                                        <div key={item.id} className="group relative aspect-square">
                                                                            <FormField
                                                                                control={form.control}
                                                                                name={`galleryImageUrls.${index}`}
                                                                                render={({ field }) => (
                                                                                    <>
                                                                                        <Image src={field.value} alt={`Gallery image ${index + 1}`} fill className="rounded-md object-cover" />
                                                                                        <Button
                                                                                            type="button"
                                                                                            variant="destructive"
                                                                                            size="icon"
                                                                                            className="absolute right-1 top-1 z-10 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
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
                                                                        "flex aspect-square cursor-pointer items-center justify-center rounded-lg border-2 border-dashed bg-background hover:bg-secondary"
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
                             )}
                        </div>

                        {/* --- RIGHT COLUMN --- */}
                        <div className="lg:col-span-3 space-y-8">
                           <Collapsible asChild defaultOpen>
                                <Card>
                                    <CollapsibleCardHeader title="Pricing" />
                                    <CollapsibleContent>
                                        <CardContent className="space-y-6">
                                            {packageLevelFields.length === 0 ? (
                                                <>
                                                    <GstInputPair control={form.control} name="cost" label="Base Cost" />
                                                    <GstInputPair control={form.control} name="sellPriceExclGst" label="Base Sell" />
                                                </>
                                            ) : (
                                                <div className="space-y-4">
                                                    {packageLevelFields.map((field, index) => (
                                                        <div key={field.id} className="p-4 border rounded-md bg-muted/50">
                                                            <h4 className="font-semibold mb-4">{watchedPackageLevels?.[index]?.name || `Package ${index + 1}`}</h4>
                                                            <div className="grid grid-cols-2 gap-4">
                                                                <GstInputPair control={form.control} name={`packageLevels.${index}.cost`} label="Cost" />
                                                                <GstInputPair control={form.control} name={`packageLevels.${index}.sellPriceExclGst`} label="Sell Price" />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <GstInputPair control={form.control} name="freightCostExclGst" label="Freight Cost" />
                                        </CardContent>
                                    </CollapsibleContent>
                                </Card>
                            </Collapsible>
                            
                            <Collapsible asChild defaultOpen>
                                <Card>
                                    <CollapsibleCardHeader title="Package Levels" description="Define the different package levels for this model.">
                                        <Button type="button" variant="outline" size="sm" onClick={() => appendPackageLevel({ id: `pkg-lvl-${Date.now()}`, name: '', description: '', cost: null, sellPriceExclGst: null})}><PlusCircle className="mr-2 h-4 w-4"/>Add Package Level</Button>
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
                            {packageLevelFields.length === 0 && (
                                <Collapsible asChild defaultOpen>
                                    <Card>
                                        <CollapsibleCardHeader title="Cover Image" />
                                        <CollapsibleContent>
                                            <CardContent>
                                                {/* Cover Image and Gallery FormField */}
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
                                                                        className="absolute right-1 top-1 z-10 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
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
                                                        <CollapsibleTrigger className="flex w-full items-center justify-between border-b border-t py-2 text-sm font-medium data-[state=open]:border-b-0">
                                                            <span>Image Gallery ({galleryImageFields.length})</span>
                                                            <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
                                                        </CollapsibleTrigger>
                                                        <CollapsibleContent className="border-b">
                                                            <div className="p-4 bg-muted/20">
                                                                <div className="grid grid-cols-3 gap-2">
                                                                    {galleryImageFields.map((item, index) => (
                                                                        <div key={item.id} className="group relative aspect-square">
                                                                            <FormField
                                                                                control={form.control}
                                                                                name={`galleryImageUrls.${index}`}
                                                                                render={({ field }) => (
                                                                                    <>
                                                                                        <Image src={field.value} alt={`Gallery image ${index + 1}`} fill className="rounded-md object-cover" />
                                                                                        <Button
                                                                                            type="button"
                                                                                            variant="destructive"
                                                                                            size="icon"
                                                                                            className="absolute right-1 top-1 z-10 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
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
                                                                        "flex aspect-square cursor-pointer items-center justify-center rounded-lg border-2 border-dashed bg-background hover:bg-secondary"
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
                            )}
                        </div>
                        
                        {/* --- FULL WIDTH PACKAGE SECTION --- */}
                        {packageLevelFields.length > 0 && (
                            <div className="lg:col-span-7 space-y-8">
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
                                            <Button type="button" onClick={handleAddCategory} disabled={!newCategoryName.trim()}>Add Category</Button>
                                        </div>
                                        <div className="space-y-4">
                                            <Collapsible defaultOpen>
                                                <div className="flex items-center justify-between border-b px-2 py-2">
                                                    <CollapsibleTrigger asChild>
                                                        <div className="w-full text-left cursor-pointer flex items-center">
                                                            <ChevronDown className="h-4 w-4 mr-2 shrink-0 transition-transform duration-200" />
                                                            <h3 className="font-semibold">Uncategorized</h3>
                                                        </div>
                                                    </CollapsibleTrigger>
                                                    <Button type="button" variant="ghost" size="sm" onClick={() => handleAddNewFeature()}><PlusCircle className="mr-2 h-4 w-4"/>Add Feature</Button>
                                                </div>
                                                <CollapsibleContent className="p-2">
                                                    {uncategorizedFeatures.length > 0 ? (
                                                        <div className="overflow-x-auto">
                                                            <Table>
                                                                <TableHeader>
                                                                    <TableRow>
                                                                        <TableHead>Optional Feature</TableHead>
                                                                        {packageLevelFields.map((pkg, i) => <TableHead key={pkg.id} className="text-center">{watchedPackageLevels?.[i]?.name || `Package ${i+1}`}</TableHead>)}
                                                                    </TableRow>
                                                                </TableHeader>
                                                                <TableBody>
                                                                    {uncategorizedFeatures.map(({ field, index }) => (
                                                                        <TableRow key={field.id}>
                                                                            <TableCell>
                                                                                <OptionalFeatureDetailsCell form={form} index={index} remove={removeOptionalFeature} categories={categories} onCategoryChangeRequest={handleCategoryChange} />
                                                                            </TableCell>
                                                                            {packageLevelFields.map((pkg: any) => <TableCell key={pkg.id} className="text-center"><PackageStatusPill control={form.control} featureIndex={index} packageId={pkg.id} /></TableCell>)}
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
                                                    <div className="flex items-center justify-between border-b px-2 py-2">
                                                        <CollapsibleTrigger className="w-full text-left cursor-pointer flex items-center">
                                                            <ChevronDown className="h-4 w-4 mr-2 shrink-0 transition-transform duration-200" />
                                                            <h3 className="font-semibold">{name}</h3>
                                                        </CollapsibleTrigger>
                                                        <div className='flex items-center'>
                                                            <Button type="button" variant="ghost" size="sm" onClick={() => handleAddNewFeature(name)}><PlusCircle className="mr-2 h-4 w-4"/>Add Feature</Button>
                                                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setCategoryToDelete(name)}><Trash2 className="h-4 w-4"/></Button>
                                                        </div>
                                                    </div>
                                                    <CollapsibleContent className="p-2">
                                                        {items.length > 0 ? (
                                                            <div className="overflow-x-auto">
                                                                <Table>
                                                                    <TableHeader>
                                                                        <TableRow>
                                                                            <TableHead>Optional Feature</TableHead>
                                                                            {packageLevelFields.map((pkg: any, i) => <TableHead key={pkg.id} className="text-center">{watchedPackageLevels?.[i]?.name || `Package ${i+1}`}</TableHead>)}
                                                                        </TableRow>
                                                                    </TableHeader>
                                                                    <TableBody>
                                                                        {items.map(({ field, index }) => (
                                                                            <TableRow key={field.id}>
                                                                                <TableCell>
                                                                                    <OptionalFeatureDetailsCell form={form} index={index} remove={removeOptionalFeature} categories={categories} onCategoryChangeRequest={handleCategoryChange} />
                                                                                </TableCell>
                                                                                {packageLevelFields.map((pkg: any) => <TableCell key={pkg.id} className="text-center"><PackageStatusPill control={form.control} featureIndex={index} packageId={pkg.id} /></TableCell>)}
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
                    </div>
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

            <Dialog open={isMoveDialogOpen} onOpenChange={setIsMoveDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Move Model</DialogTitle>
                        <DialogDescription>
                            Select a new range to move this model to. This action is permanent.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Select onValueChange={setTargetRangeId} defaultValue={targetRangeId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a destination range..." />
                            </SelectTrigger>
                            <SelectContent>
                                {rangesLoading ? (
                                    <div className="flex items-center justify-center p-4">
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                    </div>
                                ) : (
                                    allRanges?.filter(r => r.id !== model.rangeId).map(range => (
                                        <SelectItem key={range.id} value={range.id}>{range.name}</SelectItem>
                                    ))
                                )}
                            </SelectContent>
                        </Select>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                        <Button onClick={handleMoveModel} disabled={!targetRangeId || isMoving}>
                            {isMoving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Confirm Move
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

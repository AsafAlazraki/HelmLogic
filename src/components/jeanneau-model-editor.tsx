'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useForm, useFieldArray, useWatch, useController, FormProvider, useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';
import { useFirestore, useStorage } from '@/firebase/provider';
import { uploadFileWithProgress } from '@/firebase/storage';
import { doc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, X, PlusCircle, Trash2, Upload, Image as ImageIcon, ChevronRight, MoreHorizontal, Plus } from 'lucide-react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from './ui/checkbox';
import { Separator } from './ui/separator';
import { cn } from '@/lib/utils';
import { Progress } from './ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

// Schemas for validation
const specSchema = z.object({
    id: z.string(),
    label: z.string().min(1, 'Label is required'),
    value: z.string().min(1, 'Value is required'),
});

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
    imageUrl: z.string().nullable().optional(),
    cost: z.coerce.number().nullable().optional(),
    sellPriceExclGst: z.coerce.number().nullable().optional(),
    includedFeatures: z.array(z.string()).default([]),
});

const documentSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Document name is required"),
  url: z.string().min(1, "Document URL is required"),
});

export const jeanneauModelSchema = z.object({
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
    packages: z.array(packageSchema).default([]),
    colors: z.array(colorVariantSchema).default([]),
    documents: z.array(documentSchema).default([]),
});

type ModelFormData = z.infer<typeof jeanneauModelSchema>;

const GST_RATE = 0.10;

const formatCurrency = (value: number | null | undefined): string | null => {
    if (value === null || value === undefined || isNaN(value)) {
        return null;
    }
    return new Intl.NumberFormat('en-AU', {
        style: 'currency',
        currency: 'AUD',
    }).format(value * (1 + GST_RATE));
};

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
                field.onChange(Math.round(excl * 100) / 100);
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
                            step="any"
                            placeholder="0.00"
                            value={valueExcl === null || valueExcl === undefined ? '' : String(valueExcl)}
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
                            step="any"
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
                <Button type="button" variant="ghost" size="sm" onClick={() => append('', { shouldFocus: false })}>
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
                                <FormControl><Input {...field} placeholder={`Feature ${index + 1}`} value={field.value ?? ''} /></FormControl>
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
    index, 
    remove,
    allCategories,
    onCategoryChange,
    onNewCategoryRequest
}: { 
    index: number; 
    remove: (index: number) => void;
    allCategories: string[];
    onCategoryChange: (packageIndex: number, newCategory: string | undefined) => void;
    onNewCategoryRequest: (packageIndex: number) => void;
}) {
    const { control } = useFormContext<ModelFormData>();
    const sellPrice = useWatch({ control, name: `packages.${index}.sellPriceExclGst` });
    const formattedPrice = formatCurrency(sellPrice);
    
    return (
        <Collapsible asChild>
            <Card className="overflow-hidden group">
                <div className="p-4 flex items-center">
                    <div className="flex-1 pr-4">
                        <FormField control={control} name={`packages.${index}.name`} render={({ field }) => ( 
                            <FormItem>
                                <FormControl>
                                    <Input className="text-lg font-semibold border-none shadow-none p-0 h-auto bg-transparent focus-visible:ring-0" placeholder="Package Name" {...field} value={field.value ?? ''} />
                                </FormControl>
                                <FormMessage />
                            </FormItem> 
                        )} />
                    </div>
                    <div className="flex items-center">
                         {formattedPrice && (
                            <span className="text-sm font-normal text-muted-foreground mr-4">{formattedPrice}</span>
                        )}
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
                                <ChevronRight className="h-5 w-5 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                            </Button>
                        </CollapsibleTrigger>
                    </div>
                </div>
                <CollapsibleContent>
                    <div className="px-4 pb-4 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <GstInputPair control={control} name={`packages.${index}.cost`} label="Cost" />
                            <GstInputPair control={control} name={`packages.${index}.sellPriceExclGst`} label="Sell Price" />
                        </div>
                        <IncludedFeatures packageIndex={index} />
                    </div>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    );
}

const CollapsibleCardHeader = ({ title, description, children, count }: { title: string, description?: string, children?: React.ReactNode, count?: number }) => (
    <CardHeader className="flex flex-row items-start justify-between">
        <div className="flex-1 space-y-1.5">
            <div className="flex items-center gap-2">
                <CardTitle>{title}</CardTitle>
                {count !== undefined && <span className="text-sm font-normal text-muted-foreground group-data-[state=closed]:inline hidden">({count} items)</span>}
            </div>
            {description && <CardDescription>{description}</CardDescription>}
        </div>
        <div className="flex items-center gap-2">
            {children}
            <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon">
                    <ChevronRight className="h-5 w-5 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                </Button>
            </CollapsibleTrigger>
        </div>
    </CardHeader>
);

function MotorConfigurationsCard({ control }: { control: any }) {
    const { fields, append, remove } = useFieldArray({
        control,
        name: "specifications.motorConfigurations",
    });

    const motorConfigOptions = [
        { id: 'Single', label: 'Single Engine', engineCount: 1, engineLabels: ['Engine'] },
        { id: 'Twin', label: 'Twin Engines', engineCount: 2, engineLabels: ['Engine 1', 'Engine 2'] },
        { id: 'Triple', label: 'Triple Engines', engineCount: 3, engineLabels: ['Engine 1', 'Engine 2', 'Engine 3'] },
        { id: 'Quad', label: 'Quad Engines', engineCount: 4, engineLabels: ['Engine 1', 'Engine 2', 'Engine 3', 'Engine 4'] },
        { id: 'SingleWithAux', label: 'Single with Aux', engineCount: 2, engineLabels: ['Main Engine', 'Auxiliary Engine'] },
    ];

    const handleConfigChange = (checked: boolean, option: typeof motorConfigOptions[0]) => {
        if (checked) {
            const newEngines = Array.from({ length: option.engineCount }, (_, i) => ({
                label: option.engineLabels[i],
                minHp: 0,
                maxHp: 0,
                recommendedHp: 0
            }));
            append({ type: option.id, engines: newEngines });
        } else {
            const index = fields.findIndex((field: any) => field.type === option.id);
            if (index > -1) {
                remove(index);
            }
        }
    };

    return (
        <Collapsible asChild className="group">
            <Card>
                <CollapsibleCardHeader title="Motor Configurations" description="Define supported engine configurations and HP ratings." />
                <CollapsibleContent>
                    <CardContent className="space-y-2">
                        {motorConfigOptions.map((option) => {
                            const fieldIndex = fields.findIndex((field: any) => field.type === option.id);
                            const isChecked = fieldIndex !== -1;
                            const currentConfig = isChecked ? fields[fieldIndex] as any : null;

                            return (
                                <Collapsible key={option.id} asChild className="group">
                                    <div className="p-4 border rounded-lg">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center space-x-3">
                                                <Checkbox
                                                    checked={isChecked}
                                                    onCheckedChange={(checked) => handleConfigChange(!!checked, option)}
                                                    id={`config-${option.id}`}
                                                />
                                                <label htmlFor={`config-${option.id}`} className="text-sm font-medium leading-none">
                                                    {option.label}
                                                </label>
                                            </div>
                                            {isChecked && (
                                                <CollapsibleTrigger asChild>
                                                    <Button variant="ghost" size="icon">
                                                        <ChevronRight className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                                                    </Button>
                                                </CollapsibleTrigger>
                                            )}
                                        </div>
                                        <CollapsibleContent className="pt-4 mt-4 border-t">
                                            {isChecked && currentConfig && (
                                                <div className="space-y-4">
                                                    {(currentConfig.engines || []).map((engine: any, engineIndex: number) => (
                                                        <div key={engineIndex} className="space-y-2 rounded-md border p-4">
                                                            <p className="text-sm font-medium text-muted-foreground">{engine.label}</p>
                                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                                <FormField
                                                                    control={control}
                                                                    name={`specifications.motorConfigurations.${fieldIndex}.engines.${engineIndex}.minHp`}
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
                                                                    name={`specifications.motorConfigurations.${fieldIndex}.engines.${engineIndex}.maxHp`}
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
                                                                    name={`specifications.motorConfigurations.${fieldIndex}.engines.${engineIndex}.recommendedHp`}
                                                                    render={({ field }) => (
                                                                        <FormItem>
                                                                            <FormLabel>Recommended HP</FormLabel>
                                                                            <FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl>
                                                                            <FormMessage />
                                                                        </FormItem>
                                                                    )}
                                                                />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </CollapsibleContent>
                                    </div>
                                </Collapsible>
                            );
                        })}
                    </CardContent>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    );
}

function ColorVariantItem({ index, remove, update, model }: { index: number; remove: (index: number) => void; update: (index: number, val: any) => void; model: any }) {
    const { control } = useFormContext<ModelFormData>();
    const watchedColor = useWatch({ control, name: `colors.${index}` });
    const storage = useStorage();
    const [isUploading, setIsUploading] = useState(false);

    return (
        <Card className="p-4 bg-muted/50">
            <div className="flex justify-between items-center mb-4">
                <FormField control={control} name={`colors.${index}.name`} render={({ field }) => ( <FormItem className="flex-1"><FormLabel className="sr-only">Color Name</FormLabel><FormControl><Input placeholder="Color Name" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )} />
                <Button type="button" variant="destructive" size="icon" onClick={() => remove(index)} className="ml-2 shrink-0"><Trash2 className="h-4 w-4" /></Button>
            </div>
            <div className="space-y-4">
                <div className="space-y-2">
                    <FormLabel>Images</FormLabel>
                    <div className="grid grid-cols-3 gap-2">
                        {(watchedColor?.imageUrls || []).map((url, imgIndex) => (
                            <div key={imgIndex} className="relative aspect-square group">
                                <Image src={url} alt={`Color variant ${imgIndex+1}`} fill className="object-cover rounded-md" sizes="128px" />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="absolute top-1 right-1 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-background/50 border-background/50 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive"
                                    onClick={() => {
                                        const updatedImages = watchedColor.imageUrls.filter((_, i) => i !== imgIndex);
                                        update(index, { ...watchedColor, imageUrls: updatedImages });
                                    }}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                        <label htmlFor={`color-image-upload-${index}`} className={cn("aspect-square flex items-center justify-center border-2 border-dashed rounded-lg cursor-pointer bg-background hover:bg-secondary", isUploading && "bg-muted/50 cursor-not-allowed")}>
                            <Input id={`color-image-upload-${index}`} type="file" multiple className="hidden" accept="image/*" disabled={isUploading} onChange={async (e) => {
                                const files = Array.from(e.target.files || []);
                                if (files.length > 0 && model && storage) {
                                    setIsUploading(true);
                                    try {
                                        
                                        const uploadPromises = files.map(file => {
                                            const path = `data-warehouse/models/${model.id}/colors/${index}-${Date.now()}-${file.name}`;
                                            return uploadFileWithProgress(storage, file, path, () => {});
                                        });
                                        const newUrls = await Promise.all(uploadPromises);
                                        const currentUrls = watchedColor.imageUrls || [];
                                        update(index, { ...watchedColor, imageUrls: [...currentUrls, ...newUrls] });

                                    } catch (err) {
                                        console.error("Upload failed", err);
                                    } finally {
                                        setIsUploading(false);
                                    }
                                }
                            }}/>
                            {isUploading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground"/> : <Plus className="h-6 w-6 text-muted-foreground"/>}
                        </label>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                    <GstInputPair control={control} name={`colors.${index}.cost`} label="Additional Cost" />
                    <GstInputPair control={control} name={`colors.${index}.sellPriceExclGst`} label="Additional Sell Price" />
                </div>
            </div>
        </Card>
    );
}

function DocumentsCard({ model }: { model: any }) {
    const { control } = useFormContext<ModelFormData>();
    const { fields, append, remove } = useFieldArray({
        control,
        name: "documents",
    });
    const storage = useStorage();
    const { toast } = useToast();
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [newDocName, setNewDocName] = useState('');
    const [fileToUpload, setFileToUpload] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleUpload = async () => {
        if (!fileToUpload || !newDocName.trim() || !model) return;

        setIsUploading(true);
        setUploadProgress(0);
        try {
            const path = `data-warehouse/models/${model.id}/documents/${Date.now()}-${fileToUpload.name}`;
            const downloadURL = await uploadFileWithProgress(storage, fileToUpload, path, setUploadProgress);
            
            append({
                id: `doc-${Date.now()}`,
                name: newDocName,
                url: downloadURL,
            });

            setNewDocName('');
            setFileToUpload(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
            toast({ title: 'Document Uploaded' });

        } catch (err) {
            console.error("Upload failed", err);
            toast({ variant: 'destructive', title: 'Upload Failed' });
        } finally {
            setIsUploading(false);
        }
    };
    
    return (
        <Card>
            <CardHeader>
                <CardTitle>Documents</CardTitle>
                <CardDescription>Upload and manage model-specific documents.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="p-4 border rounded-lg bg-muted/50 space-y-2">
                    <h4 className="font-medium text-sm">Upload New Document</h4>
                    <div className="space-y-2">
                        <Input 
                            placeholder="Document Name" 
                            value={newDocName} 
                            onChange={(e) => setNewDocName(e.target.value)} 
                            disabled={isUploading}
                        />
                        <Input 
                            type="file" 
                            ref={fileInputRef}
                            onChange={(e) => setFileToUpload(e.target.files?.[0] || null)}
                            disabled={isUploading}
                        />
                    </div>
                     {isUploading && <Progress value={uploadProgress} className="w-full h-2" />}
                    <Button onClick={handleUpload} disabled={isUploading || !fileToUpload || !newDocName.trim()}>
                        {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                        Upload
                    </Button>
                </div>

                <div className="space-y-2">
                     <h4 className="font-medium text-sm">Uploaded Documents</h4>
                     {fields.length > 0 ? (
                        <div className="border rounded-md">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {fields.map((field, index) => (
                                        <TableRow key={field.id}>
                                            <TableCell>
                                                <a href={(field as any).url} target="_blank" rel="noopener noreferrer" className="hover:underline text-primary">
                                                    {(field as any).name}
                                                </a>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="icon" onClick={() => remove(index)}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                     ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">No documents uploaded.</p>
                     )}
                </div>
            </CardContent>
        </Card>
    );
}

export function JeanneauModelEditor({ model, docPath }: { model: any; docPath: string }) {
    const firestore = useFirestore();
    const storage = useStorage();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [bulkFeatures, setBulkFeatures] = useState('');
    const [isCoverUploading, setIsCoverUploading] = useState(false);
    const [isGalleryUploading, setIsGalleryUploading] = useState(false);
    
    const [newCategoryName, setNewCategoryName] = useState('');

    const [isNewCatDialogOpen, setIsNewCatDialogOpen] = useState(false);
    const [pkgIndexForNewCat, setPkgIndexForNewCat] = useState<number | null>(null);
    const [newCatNameForMove, setNewCatNameForMove] = useState('');

    const getSafeDefaultValues = useCallback((modelData: any): ModelFormData => {
        const data = modelData || {};
        const specs = data.specifications || {};
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
            documents: (data.documents || []).map((d: any) => ({ ...d, id: d.id || `doc-${Math.random()}` })),
        };
    }, []);

    const form = useForm<ModelFormData>({
        resolver: zodResolver(jeanneauModelSchema),
        defaultValues: getSafeDefaultValues(model),
    });
    
    const { control, getValues, reset } = form;

    useEffect(() => {
        const defaultValues = getSafeDefaultValues(model);
        reset(defaultValues);
    }, [model, reset, getSafeDefaultValues]);

    const { fields: specFields, append: appendSpec, remove: removeSpec } = useFieldArray({ control, name: "specifications.otherSpecs" });
    const { fields: featureFields, append: appendFeature, remove: removeFeature, replace: replaceFeatures } = useFieldArray({ control, name: "standardFeatures" });
    const { fields: packageFields, append: appendPackage, remove: removePackage, update: updatePackage } = useFieldArray({ control, name: "packages" });
    const { fields: colorFields, append: appendColor, remove: removeColor, update: updateColor } = useFieldArray({ control, name: "colors" });
    const { fields: galleryImageFields, append: appendGalleryImage, remove: removeGalleryImage } = useFieldArray({ control, name: 'galleryImageUrls' });
    
    const watchedPackages = useWatch({ control, name: 'packages' });
    const coverImageUrl = useWatch({ control, name: "coverImageUrl" });

    const { uncategorizedPackages, categorizedPackages, allCategories } = useMemo(() => {
        const currentPackages = watchedPackages || [];
        const categories = [...new Set(currentPackages.map(p => p.category).filter(Boolean) as string[])];

        const uncategorized: { field: any, index: number }[] = [];
        const categoryMap = new Map<string, { field: any, index: number }[]>();
    
        packageFields.forEach((field, index) => {
            const category = currentPackages?.[index]?.category;
            if (category && categories.includes(category)) {
                if (!categoryMap.has(category)) {
                    categoryMap.set(category, []);
                }
                categoryMap.get(category)!.push({ field, index });
            } else {
                uncategorized.push({ field, index });
            }
        });
    
        const categorized = Array.from(categoryMap.entries()).map(([name, items]) => ({
            name,
            items,
        }));
    
        return { uncategorizedPackages: uncategorized, categorizedPackages: categorized, allCategories: categories };
    }, [packageFields, watchedPackages]);

    async function onSubmit(values: ModelFormData) {
        setIsSubmitting(true);
        const sanitizedValues = sanitizeDataForFirestore(values);
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
    
    const handleBulkAddFeatures = () => {
        const features = bulkFeatures.split('\n').map(f => f.trim()).filter(Boolean);
        replaceFeatures(features.map(f => f));
        setBulkFeatures('');
    };

    const handleAddCategory = () => {
        if (newCategoryName.trim() && !allCategories.includes(newCategoryName.trim())) {
             const newPackages = [
                { id: `pkg-cat-${Date.now()}`, name: 'New Package', imageUrl: '', cost: null, sellPriceExclGst: null, includedFeatures: [], category: newCategoryName.trim() },
                ...getValues('packages') || []
            ];
            form.setValue('packages', newPackages, { shouldDirty: true });
            setNewCategoryName('');
        }
    };
    
    const handleDeleteCategory = (categoryToDelete: string) => {
        watchedPackages?.forEach((pkg, index) => {
            if (pkg.category === categoryToDelete) {
                updatePackage(index, { ...pkg, category: undefined });
            }
        });
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
        }
        setIsNewCatDialogOpen(false);
        setNewCatNameForMove('');
        setPkgIndexForNewCat(null);
    };

    return (
        <FormProvider {...form}>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

                    <div className="grid grid-cols-1 lg:grid-cols-7 gap-8 items-start">
                        <div className="lg:col-span-4 space-y-8">
                            <Collapsible asChild className="group">
                                <Card>
                                    <CollapsibleCardHeader title="Standard Features" count={featureFields.length} >
                                        <Button type="button" variant="outline" size="sm" onClick={() => appendFeature('', { shouldFocus: false })}><PlusCircle className="mr-2 h-4 w-4" />Add Feature</Button>
                                    </CollapsibleCardHeader>
                                    <CollapsibleContent>
                                        <CardContent className="space-y-4 max-h-96 overflow-y-auto">
                                            {featureFields.map((field, index) => (
                                                 <div key={field.id} className="flex items-center gap-2">
                                                    <FormField control={control} name={`standardFeatures.${index}`} render={({ field }) => ( <FormItem className="flex-1"><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )} />
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
                           <Collapsible asChild className="group">
                                <Card>
                                    <CollapsibleCardHeader title="Optional Packages" description="Group optional features into packages." count={packageFields.length} />
                                    <CollapsibleContent>
                                        <div className="relative">
                                            <div className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-[hsl(var(--card))] to-transparent z-10 pointer-events-none" />
                                            <CardContent className="space-y-4 max-h-[700px] overflow-y-auto">
                                                <div className="flex gap-2 items-center pt-2">
                                                    <Input placeholder="New Category Name" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} className="h-9"/>
                                                    <Button type="button" size="sm" onClick={handleAddCategory}>Add Category</Button>
                                                </div>
                                                <Separator className="my-4" />
                                                <div className="space-y-4">
                                                    {categorizedPackages.map(({ name, items }) => (
                                                        <Collapsible key={name} asChild className="group">
                                                            <div className="border rounded-lg">
                                                                <div className="flex items-center justify-between p-4">
                                                                    <CollapsibleTrigger asChild>
                                                                        <button type="button" className="flex items-center cursor-pointer group flex-1 text-left">
                                                                            <ChevronRight className="h-4 w-4 mr-2 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                                                                            <h3 className="font-semibold text-lg">{name}</h3>
                                                                            <span className="text-muted-foreground font-normal ml-2">({items.length})</span>
                                                                        </button>
                                                                    </CollapsibleTrigger>
                                                                    <div className="flex items-center gap-2">
                                                                        <Button type="button" variant="outline" size="sm" onClick={() => appendPackage({ id: `pkg-${Date.now()}`, name: 'New Package', imageUrl: '', cost: null, sellPriceExclGst: null, includedFeatures: [], category: name }, { shouldFocus: false })}>
                                                                            <PlusCircle className="mr-2 h-4 w-4"/> Add Package
                                                                        </Button>
                                                                        <Button type="button" variant="ghost" size="icon" onClick={() => handleDeleteCategory(name)} className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8">
                                                                            <Trash2 className="h-4 w-4" />
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                                <CollapsibleContent>
                                                                    <div className="space-y-4 p-4 border-t">
                                                                        {items.map(({field, index}) => (
                                                                            <PackageItem key={field.id} index={index} remove={removePackage} allCategories={allCategories} onCategoryChange={handleCategoryChange} onNewCategoryRequest={handleOpenNewCatDialog} />
                                                                        ))}
                                                                        {items.length === 0 && <p className="text-sm text-center py-4 text-muted-foreground">No packages in this category.</p>}
                                                                    </div>
                                                                </CollapsibleContent>
                                                            </div>
                                                        </Collapsible>
                                                    ))}
                                                    <Collapsible asChild className="group">
                                                        <div className="border rounded-lg">
                                                             <div className="flex items-center justify-between p-4">
                                                                <CollapsibleTrigger asChild>
                                                                    <button type="button" className="flex items-center cursor-pointer group flex-1 text-left">
                                                                        <ChevronRight className="h-4 w-4 mr-2 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                                                                        <h3 className="font-semibold text-lg">Uncategorized</h3>
                                                                        <span className="text-muted-foreground font-normal ml-2">({uncategorizedPackages.length})</span>
                                                                    </button>
                                                                </CollapsibleTrigger>
                                                                 <Button type="button" variant="outline" size="sm" onClick={() => appendPackage({ id: `pkg-${Date.now()}`, name: 'New Package', imageUrl: '', cost: null, sellPriceExclGst: null, includedFeatures: [], category: undefined }, { shouldFocus: false })}>
                                                                    <PlusCircle className="mr-2 h-4 w-4"/> Add Package
                                                                </Button>
                                                            </div>
                                                            <CollapsibleContent>
                                                                <div className="space-y-4 p-4 border-t">
                                                                    {uncategorizedPackages.map(({field, index}) => (
                                                                        <PackageItem key={field.id} index={index} remove={removePackage} allCategories={allCategories} onCategoryChange={handleCategoryChange} onNewCategoryRequest={handleOpenNewCatDialog} />
                                                                    ))}
                                                                    {uncategorizedPackages.length === 0 && <p className="text-sm text-center py-4 text-muted-foreground">No uncategorized packages.</p>}
                                                                </div>
                                                            </CollapsibleContent>
                                                        </div>
                                                    </Collapsible>
                                                </div>
                                            </CardContent>
                                            <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-[hsl(var(--card))] to-transparent z-10 pointer-events-none" />
                                        </div>
                                    </CollapsibleContent>
                                </Card>
                            </Collapsible>
                             <MotorConfigurationsCard control={form.control} />
                        </div>

                        <div className="lg:col-span-3 space-y-8">
                             <Collapsible asChild className="group">
                                <Card>
                                    <CollapsibleCardHeader title="Cover Image" />
                                    <CollapsibleContent>
                                        <CardContent>
                                            <FormField control={control} name="coverImageUrl" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="sr-only">Cover Image</FormLabel>
                                                    {coverImageUrl ? (
                                                        <div className="relative aspect-video w-full overflow-hidden rounded-md group">
                                                            <Image src={coverImageUrl} alt="Cover image" fill className="object-cover" sizes="(max-width: 1024px) 100vw, 50vw" />
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
                                                                        if (file && model && storage) {
                                                                            try {
                                                                                const path = `data-warehouse/models/${model.id}/cover/${Date.now()}-${file.name}`;
                                                                                const url = await uploadFileWithProgress(storage, file, path, () => {});
                                                                                field.onChange(url);
                                                                            } catch (err) {
                                                                                console.error("Upload failed", err);
                                                                                toast({ variant: "destructive", title: "Upload Failed" });
                                                                            }
                                                                        }
                                                                    }} />
                                                                </FormControl>
                                                            </label>
                                                        </div> 
                                                    )}
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                        <div className="pt-6">
                                                <Collapsible className="group">
                                                    <CollapsibleTrigger asChild>
                                                        <Button type="button" variant="ghost" className="w-full flex justify-between items-center text-sm font-medium py-2 border-t border-b data-[state=open]:border-b-0">
                                                            <span>Image Gallery ({galleryImageFields.length})</span>
                                                            <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                                                        </Button>
                                                    </CollapsibleTrigger>
                                                    <CollapsibleContent className="border-b">
                                                        <div className="p-4 bg-muted/20">
                                                            <div className="grid grid-cols-3 gap-2">
                                                                {galleryImageFields.map((item, index) => (
                                                                    <div key={item.id} className="relative aspect-square group">
                                                                        <FormField
                                                                            control={control}
                                                                            name={`galleryImageUrls.${index}`}
                                                                            render={({ field }) => (
                                                                                <>
                                                                                    {field.value && <Image src={field.value} alt={`Gallery image ${index + 1}`} fill className="object-cover rounded-md" />}
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
                                                                <label htmlFor="gallery-image-upload" className="aspect-square flex items-center justify-center border-2 border-dashed rounded-lg cursor-pointer bg-background hover:bg-secondary">
                                                                    <Input id="gallery-image-upload" type="file" multiple className="hidden" accept="image/*" onChange={async (e) => {
                                                                        const files = Array.from(e.target.files || []);
                                                                        if (files.length > 0 && model && storage) {
                                                                            try {
                                                                                for (const file of files) {
                                                                                    const path = `data-warehouse/models/${model.id}/gallery/${Date.now()}-${file.name}`;
                                                                                    const url = await uploadFileWithProgress(storage, file, path, () => {});
                                                                                    appendGalleryImage(url);
                                                                                }
                                                                            } catch (err) {
                                                                                console.error("Gallery upload failed", err);
                                                                            }
                                                                        }
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

                            <Collapsible asChild>
                                <Card>
                                    <CollapsibleCardHeader title="Pricing" />
                                    <CollapsibleContent>
                                        <CardContent className="space-y-6">
                                            <GstInputPair control={control} name="cost" label="Base Cost" />
                                            <GstInputPair control={control} name="sellPriceExclGst" label="Base Sell" />
                                            <GstInputPair control={control} name="freightCostExclGst" label="Freight Cost" />
                                        </CardContent>
                                    </CollapsibleContent>
                                </Card>
                            </Collapsible>
                            
                             <Collapsible asChild className="group">
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
                                                        <FormField control={control} name={`specifications.otherSpecs.${index}.label`} render={({ field }) => ( <FormItem className="flex-1"><FormControl><Input placeholder="Label" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )} />
                                                        <FormField control={control} name={`specifications.otherSpecs.${index}.value`} render={({ field }) => ( <FormItem className="flex-1"><FormControl><Input placeholder="Value" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )} />
                                                        <Button type="button" variant="ghost" size="icon" onClick={() => removeSpec(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                                    </div>
                                                ))}
                                            </div>
                                        </CardContent>
                                    </CollapsibleContent>
                                </Card>
                            </Collapsible>
                            {/* Colors Card */}
                            <Collapsible asChild className="group">
                                <Card>
                                    <CollapsibleCardHeader title="Color Variants">
                                        <Button type="button" variant="outline" size="sm" onClick={() => appendColor({ id: `color-${Date.now()}`, name: '', imageUrls: [], cost: null, sellPriceExclGst: null })}><PlusCircle className="mr-2 h-4 w-4" />Add Color</Button>
                                    </CollapsibleCardHeader>
                                    <CollapsibleContent>
                                        <CardContent className="space-y-4">
                                            {colorFields.map((field, index) => (
                                                <ColorVariantItem key={field.id} index={index} remove={removeColor} update={updateColor} model={model} />
                                            ))}
                                            {colorFields.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No color variants added.</p>}
                                        </CardContent>
                                    </CollapsibleContent>
                                </Card>
                            </Collapsible>
                            <DocumentsCard model={model} />
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
                        <Button onClick={handleConfirmNewCat}>Create &amp; Move</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </FormProvider>
    );
}

    

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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
import { Loader2, Save, X, PlusCircle, Trash2, Upload, Image as ImageIcon, Plus, ChevronDown, MoreHorizontal } from 'lucide-react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Checkbox } from './ui/checkbox';
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

const documentSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Document name is required"),
  url: z.string().min(1, "Document URL is required"),
});

export const stacerModelSchema = z.object({
    coverImageUrl: z.string().nullable().optional(),
    galleryImageUrls: z.array(z.string()).default([]),
    cost: z.number().nullable().optional(),
    sellPriceExclGst: z.number().nullable().optional(),
    freightCostExclGst: z.number().nullable().optional(),
    specifications: z.object({
        motorConfigurations: z.array(motorConfigSchema).default([]),
        otherSpecs: z.array(specSchema).default([]),
    }).optional(),
    standardFeatures: z.array(z.string()).default([]),
    optionalFeatures: z.array(optionalFeatureSchema).default([]),
    colors: z.array(colorVariantSchema).default([]),
    documents: z.array(documentSchema).default([]),
});

type ModelFormData = z.infer<typeof stacerModelSchema>;

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
      if (value !== undefined) {
          sanitizedData[key] = sanitizeDataForFirestore(value);
      }
    }
  }
  return sanitizedData;
}

function GstInputPair({ control, name, label }: { control: any; name: string; label: string }) {
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

const CollapsibleCardHeader = ({ title, description, children, count }: { title: string, description?: string, children?: React.ReactNode, count?: number }) => (
    <CardHeader className="flex flex-row items-start justify-between">
        <div className="flex-1 space-y-1.5">
            <div className="flex items-center gap-2">
                <CardTitle>{title}</CardTitle>
                {count !== undefined && <span className="text-sm font-normal text-muted-foreground group-data-[state=closed]:inline hidden">({count} features)</span>}
            </div>
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


function OptionalFeatureItem({ form, index, remove, model }: { form: any; index: number; remove: (index: number) => void; model: any; }) {
    const imageUrl = useWatch({ control: form.control, name: `optionalFeatures.${index}.imageUrl` });
    const { control } = form;
    const storage = useStorage();
    const [isUploading, setIsUploading] = useState(false);

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
                            <div className="relative aspect-square w-full overflow-hidden rounded-md group bg-background border">
                                {isUploading && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20">
                                        <Loader2 className="h-6 w-6 animate-spin text-white" />
                                    </div>
                                )}
                                {imageUrl ? (
                                    <>
                                        <Image src={imageUrl} alt="Feature image" fill className="object-cover" sizes="128px" />
                                        <Button type="button" variant="outline" size="icon" className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-background/50 border-background/50 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive" onClick={() => field.onChange(null)}>
                                            <X className="h-3 w-3" />
                                        </Button>
                                    </>
                                ) : (
                                    <label htmlFor={`feature-upload-${index}`} className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-secondary/50">
                                        <div className="flex flex-col items-center justify-center text-center p-2">
                                            <Upload className="w-6 h-6 mb-1 text-muted-foreground" />
                                            <p className="text-xs text-muted-foreground">Upload</p>
                                        </div>
                                        <FormControl>
                                            <Input id={`feature-upload-${index}`} type="file" className="hidden" accept="image/*" disabled={isUploading} onChange={async (e) => {
                                                const file = e.target.files?.[0];
                                                if (file && storage && model) {
                                                    setIsUploading(true);
                                                    try {
                                                        const path = `data-warehouse/models/${model.id}/features/${index}-${Date.now()}-${file.name}`;
                                                        const url = await uploadFileWithProgress(storage, file, path, () => {});
                                                        field.onChange(url);
                                                    } catch (err) {
                                                        console.error("Upload failed", err);
                                                    } finally {
                                                        setIsUploading(false);
                                                    }
                                                }
                                            }} />
                                        </FormControl>
                                    </label>
                                )}
                            </div>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <div className="flex-1 space-y-3">
                     <FormField control={form.control} name={`optionalFeatures.${index}.name`} render={({ field }) => ( 
                        <FormItem>
                            <FormLabel className="sr-only">Feature Name</FormLabel>
                            <FormControl>
                                <Input placeholder="Feature Name" {...field} value={field.value ?? ''} />
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
                                <Collapsible key={option.id} asChild>
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
                                                        <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
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


export function StacerModelEditor({ model, docPath }: { model: any; docPath: string }) {
    const firestore = useFirestore();
    const storage = useStorage();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [bulkFeatures, setBulkFeatures] = useState('');
    const [isCoverUploading, setIsCoverUploading] = useState(false);
    const [isGalleryUploading, setIsGalleryUploading] = useState(false);
    
    const getSafeDefaultValues = useCallback((modelData: any): Partial<ModelFormData> => {
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
            optionalFeatures: (data.optionalFeatures || []).map((f: any) => ({
                ...f,
                cost: f.cost ?? null,
                sellPriceExclGst: f.sellPriceExclGst ?? null,
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
        resolver: zodResolver(stacerModelSchema),
    });
    
    const { reset, control } = form;

    useEffect(() => {
        if (model) {
            reset(getSafeDefaultValues(model));
        }
    }, [model, reset, getSafeDefaultValues]);

    const { fields: specFields, append: appendSpec, remove: removeSpec } = useFieldArray({ control: form.control, name: "specifications.otherSpecs" });
    const { fields: featureFields, append: appendFeature, remove: removeFeature, replace: replaceFeatures } = useFieldArray({ control: form.control, name: "standardFeatures" });
    const { fields: colorFields, append: appendColor, remove: removeColor, update: updateColor } = useFieldArray({ control: form.control, name: "colors" });
    const { fields: optionalFeatureFields, append: appendOptionalFeature, remove: removeOptionalFeature } = useFieldArray({ control: form.control, name: "optionalFeatures" });
    const { fields: galleryImageFields, append: appendGalleryImage, remove: removeGalleryImage } = useFieldArray({ control: form.control, name: 'galleryImageUrls' });
    
    const watchedColors = useWatch({ control: form.control, name: 'colors' });
    const coverImageUrl = useWatch({ control: form.control, name: "coverImageUrl" });

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

    return (
        <FormProvider {...form}>
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

                <div className="grid grid-cols-1 lg:grid-cols-7 gap-8 items-start">
                    <div className="lg:col-span-4 space-y-8">
                        <MotorConfigurationsCard control={form.control} />
                        {/* Specifications Card */}
                        <Collapsible asChild className="group">
                            <Card>
                                <CollapsibleCardHeader title="Specifications" count={specFields.length}>
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
                        
                        {/* Standard Features Card */}
                        <Collapsible asChild className="group">
                            <Card>
                                <CollapsibleCardHeader title="Standard Features" count={featureFields.length}>
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
                                            <Button type="button" variant="secondary" size="sm" onClick={handleBulkAddFeatures}>Add from Text</Button>
                                        </div>
                                    </CardContent>
                                </CollapsibleContent>
                            </Card>
                        </Collapsible>
                        
                        {/* Colors Card */}
                        <Collapsible asChild>
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
                    </div>

                    <div className="lg:col-span-3 space-y-8">
                        <Collapsible asChild>
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
                        <Collapsible asChild>
                            <Card>
                                <CollapsibleCardHeader title="Cover Image" />
                                <CollapsibleContent>
                                    <CardContent>
                                        <FormField control={form.control} name="coverImageUrl" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="sr-only">Cover Image</FormLabel>
                                                <div className="relative aspect-video w-full overflow-hidden rounded-md group bg-background border">
                                                    {isCoverUploading && (
                                                        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20">
                                                            <Loader2 className="h-8 w-8 animate-spin text-white" />
                                                        </div>
                                                    )}
                                                    {coverImageUrl ? (
                                                        <>
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
                                                        </>
                                                    ) : (
                                                        <label htmlFor="cover-image-upload" className="flex flex-col items-center justify-center w-full h-48 cursor-pointer hover:bg-secondary/50">
                                                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                                                <ImageIcon className="w-10 h-10 mb-2 text-muted-foreground" />
                                                                <p className="mb-2 text-sm text-muted-foreground"><span className="font-semibold">Upload Cover Image</span></p>
                                                            </div>
                                                            <FormControl>
                                                                <Input id="cover-image-upload" type="file" className="hidden" accept="image/*" disabled={isCoverUploading} onChange={async (e) => {
                                                                    const file = e.target.files?.[0];
                                                                    if (file && model && storage) {
                                                                        setIsCoverUploading(true);
                                                                        try {
                                                                            const path = `data-warehouse/models/${model.id}/cover/${Date.now()}-${file.name}`;
                                                                            const url = await uploadFileWithProgress(storage, file, path, () => {});
                                                                            field.onChange(url);
                                                                        } catch (err) {
                                                                            console.error("Upload failed", err);
                                                                            toast({ variant: "destructive", title: "Upload Failed" });
                                                                        } finally {
                                                                            setIsCoverUploading(false);
                                                                        }
                                                                    }
                                                                }} />
                                                            </FormControl>
                                                        </label>
                                                    )} 
                                                </div>
                                            <FormMessage />
                                        </FormItem>
                                    )} />
                                        <div className="pt-6">
                                            <Collapsible>
                                                <CollapsibleTrigger className="w-full flex justify-between items-center text-sm font-medium py-2 border-t border-b data-[state=open]:border-b-0">
                                                    <span>Image Gallery ({galleryImageFields.length})</span>
                                                    <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
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
                                                                                {field.value && <Image src={field.value} alt={`Gallery image ${index + 1}`} fill className="object-cover rounded-md" sizes="(max-width: 768px) 33vw, 15vw" />}
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
                                                                "aspect-square flex items-center justify-center border-2 border-dashed rounded-lg cursor-pointer bg-background hover:bg-secondary",
                                                                isGalleryUploading && "bg-muted/50 cursor-not-allowed"
                                                            )}>
                                                                <Input id="gallery-image-upload" type="file" multiple className="hidden" accept="image/*" disabled={isGalleryUploading} onChange={async (e) => {
                                                                    const files = Array.from(e.target.files || []);
                                                                    if (files.length > 0 && model && storage) {
                                                                        setIsGalleryUploading(true);
                                                                        try {
                                                                            for (const file of files) {
                                                                                const path = `data-warehouse/models/${model.id}/gallery/${Date.now()}-${file.name}`;
                                                                                const url = await uploadFileWithProgress(storage, file, path, () => {});
                                                                                appendGalleryImage(url);
                                                                            }
                                                                        } catch (err) {
                                                                            console.error("Gallery upload failed", err);
                                                                            toast({ variant: "destructive", title: "Gallery Upload Failed" });
                                                                        } finally {
                                                                            setIsGalleryUploading(false);
                                                                        }
                                                                    }
                                                                }}/>
                                                                {isGalleryUploading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground"/> : <Plus className="h-6 w-6 text-muted-foreground"/>}
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
                                <CollapsibleCardHeader title="Optional Features" count={optionalFeatureFields.length}>
                                    <Button type="button" variant="outline" size="sm" onClick={() => appendOptionalFeature({ id: `feat-${Date.now()}`, name: '', cost: null, sellPriceExclGst: null, imageUrl: null })}><PlusCircle className="mr-2 h-4 w-4" />Add Feature</Button>
                                </CollapsibleCardHeader>
                                <CollapsibleContent>
                                    <CardContent className="space-y-4">
                                        {optionalFeatureFields.map((field, index) => (
                                            <OptionalFeatureItem key={field.id} form={form} index={index} remove={removeOptionalFeature} model={model} />
                                        ))}
                                        {optionalFeatureFields.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No optional features added.</p>}
                                    </CardContent>
                                </CollapsibleContent>
                            </Card>
                        </Collapsible>
                         <DocumentsCard model={model} />
                    </div>
                </div>
            </form>
        </Form>
        </FormProvider>
    );
}

    

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
import { Loader2, Save, X, PlusCircle, Trash2, Upload, Image as ImageIcon, Plus, ChevronDown } from 'lucide-react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Checkbox } from './ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from './ui/progress';


const looseNumber = z.preprocess(
  (val) => {
    if (val === '' || val === null || val === undefined) return null;
    const n = Number(val);
    return isNaN(n) ? null : n;
  },
  z.number().nullable().optional()
);

const priceSchema = z.object({
    cost: looseNumber,
    sellPriceExclGst: looseNumber,
});

const colorVariantFormSchema = z.object({
    id: z.string(),
    name: z.string().min(1, 'Color name is required'),
    imageUrl: z.string().nullable().optional(),
    pricing: z.object({
        HYP: priceSchema.default({}),
        PVC: priceSchema.default({}),
    }),
});

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

const optionalFeatureSchema = z.object({
    id: z.string(),
    name: z.string().min(1, 'Feature name is required'),
    imageUrl: z.string().nullable().optional(),
    cost: z.coerce.number().min(0).default(0),
    sellPriceExclGst: z.coerce.number().min(0).default(0),
});

const documentSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Document name is required"),
  url: z.string().min(1, "Document URL is required"),
});

export const highfieldModelSchema = z.object({
    coverImageUrl: z.string().nullable().optional(),
    galleryImageUrls: z.array(z.string()).default([]),
    specifications: z.object({
        motorConfigurations: z.array(motorConfigSchema).default([]),
        otherSpecs: z.array(specSchema).default([]),
    }).optional(),
    standardFeatures: z.array(z.string()).default([]),
    optionalFeatures: z.array(optionalFeatureSchema).default([]),
    colors: z.array(colorVariantFormSchema).default([]),
    documents: z.array(documentSchema).default([]),
});

type ModelFormData = z.infer<typeof highfieldModelSchema>;

const GST_RATE = 0.10;

const motorConfigOptions = [
    { id: 'Single', label: 'Single Engine', engineCount: 1, engineLabels: ['Engine'] },
    { id: 'Twin', label: 'Twin Engines', engineCount: 2, engineLabels: ['Engine 1', 'Engine 2'] },
    { id: 'Triple', label: 'Triple Engines', engineCount: 3, engineLabels: ['Engine 1', 'Engine 2', 'Engine 3'] },
    { id: 'Quad', label: 'Quad Engines', engineCount: 4, engineLabels: ['Engine 1', 'Engine 2', 'Engine 3', 'Engine 4'] },
    { id: 'SingleWithAux', label: 'Single with Aux', engineCount: 2, engineLabels: ['Main Engine', 'Auxiliary Engine'] },
];

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
    const { field, fieldState } = useController({ control, name, defaultValue: null });

    const valueExcl = field.value;

    const calculateIncl = (val: string | number | null) => {
        if (val === '' || val === null || val === undefined) return '';
        const num = typeof val === 'string' ? parseFloat(val) : val;
        if (isNaN(num)) return '';
        return (Math.round((num * (1 + GST_RATE)) * 100) / 100).toFixed(2);
    };

    const valueInclDisplay = calculateIncl(valueExcl);

    const handleExclChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        field.onChange(val === '' ? null : val);
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
        <FormItem>
            <FormLabel className={cn(fieldState.error && "text-destructive")}>{label}</FormLabel>
            <div className="grid grid-cols-2 gap-2 mt-1">
                <FormItem className="space-y-1">
                    <FormLabel className="text-xs font-normal text-muted-foreground">excl. GST</FormLabel>
                    <FormControl>
                        <Input
                            type="number"
                            step="any"
                            placeholder="0.00"
                            value={valueExcl ?? ''}
                            onChange={handleExclChange}
                        />
                    </FormControl>
                </FormItem>
                <FormItem className="space-y-1">
                    <FormLabel className="text-xs font-normal text-muted-foreground">inc. GST</FormLabel>
                    <FormControl>
                        <Input
                            type="number"
                            step="any"
                            placeholder="0.00"
                            value={valueInclDisplay}
                            onChange={handleInclChange}
                        />
                    </FormControl>
                </FormItem>
            </div>
             <FormMessage>
                {fieldState.error && String(fieldState.error.message)}
             </FormMessage>
        </FormItem>
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
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive opacity-0 group-hover/item:opacity-100 transition-opacity" onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>
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

function ColorVariantItem({ index, remove, model }: { index: number; remove: (index: number) => void; model: any; }) {
  const { control } = useFormContext<ModelFormData>();
  const imageUrl = useWatch({ control, name: `colors.${index}.imageUrl` });
  const storage = useStorage();
  const [isUploading, setIsUploading] = useState(false);

  return (
    <Card className="bg-muted/50 overflow-hidden">
      <div className="p-4 flex flex-col sm:flex-row gap-4 items-start">
        <FormField
          control={control}
          name={`colors.${index}.imageUrl`}
          render={({ field }) => (
            <FormItem className="w-32 flex-shrink-0">
              <FormLabel className="sr-only">Color Image</FormLabel>
              <div className="relative aspect-square w-full overflow-hidden rounded-md group bg-background border">
                  {isUploading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20">
                            <Loader2 className="h-6 w-6 animate-spin text-white" />
                        </div>
                    )}
                  {imageUrl ? (
                    <>
                      <Image src={imageUrl} alt="Color variant" fill className="object-cover" sizes="128px" />
                      <Button type="button" variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity z-10" onClick={() => field.onChange(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <label htmlFor={`color-upload-${index}`} className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-secondary/50">
                        <div className="flex flex-col items-center justify-center text-center p-2">
                          <Upload className="w-6 h-6 mb-1 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">Upload</p>
                        </div>
                        <FormControl>
                          <Input id={`color-upload-${index}`} type="file" className="hidden" accept="image/*" disabled={isUploading} onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file && storage && model) {
                                setIsUploading(true);
                                try {
                                    const path = `data-warehouse/models/${model.id}/colors/${index}-${Date.now()}-${file.name}`;
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
        <div className="flex-1 space-y-4 w-full">
          <div className="flex items-center gap-2">
            <FormField
              control={control}
              name={`colors.${index}.name`}
              render={({ field }) => (
                <FormItem className="flex-1">
                  <FormLabel className="sr-only">Color Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Color Name" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => remove(index)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-4">
            <div className="p-3 border rounded-md bg-background space-y-2">
              <h4 className="font-medium text-sm">HYP Pricing</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <GstInputPair control={control} name={`colors.${index}.pricing.HYP.cost`} label="Cost" />
                <GstInputPair control={control} name={`colors.${index}.pricing.HYP.sellPriceExclGst`} label="Sell" />
              </div>
            </div>
            <div className="p-3 border rounded-md bg-background space-y-2">
              <h4 className="font-medium text-sm">PVC Pricing</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <GstInputPair control={control} name={`colors.${index}.pricing.PVC.cost`} label="Cost" />
                <GstInputPair control={control} name={`colors.${index}.pricing.PVC.sellPriceExclGst`} label="Sell" />
              </div>
            </div>
          </div>
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

export function HighfieldModelEditor({ model, docPath }: { model: any; docPath: string }) {
    const firestore = useFirestore();
    const storage = useStorage();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [bulkFeatures, setBulkFeatures] = useState('');
    const [isCoverUploading, setIsCoverUploading] = useState(false);
    const [isGalleryUploading, setIsGalleryUploading] = useState(false);
    
    // ... getSafeDefaultValues (omitted for brevity, it's unchanged)
    const getSafeDefaultValues = useCallback((modelData: any): Partial<ModelFormData> => {
        const safeModel = modelData || {};
        const modelColors = safeModel.colors || [];
        const modelPricing = safeModel.variantPricing || [];

        const pricingMap = new Map<string, { HYP?: any, PVC?: any }>();
        modelPricing.forEach((p: any) => {
            if (!p.colorId) return;
            if (!pricingMap.has(p.colorId)) {
                pricingMap.set(p.colorId, {});
            }
            const entry = pricingMap.get(p.colorId)!;
            if (p.material === 'HYP') entry.HYP = p;
            else if (p.material === 'PVC') entry.PVC = p;
        });
        
        const unifiedColors = modelColors.map((color: any) => {
            const prices = pricingMap.get(color.id) || {};
            const hypPrice = prices.HYP || {};
            const pvcPrice = prices.PVC || {};
            
            return {
                id: color.id,
                name: color.name,
                imageUrl: color.imageUrl ?? color.imageUrls?.[0] ?? null,
                pricing: {
                    HYP: { cost: hypPrice.cost ?? null, sellPriceExclGst: hypPrice.sellPriceExclGst ?? null },
                    PVC: { cost: pvcPrice.cost ?? null, sellPriceExclGst: pvcPrice.sellPriceExclGst ?? null },
                }
            };
        });

        const motorConfigs = (safeModel.specifications?.motorConfigurations ?? []).map((config: any) => {
            if (config.engines && Array.isArray(config.engines) && config.engines.length > 0) {
                return config;
            }
            const option = motorConfigOptions.find(o => o.id === config.type);
            if (option) {
                 const engines = Array.from({ length: option.engineCount }, (_, i) => ({
                    label: option.engineLabels[i],
                    minHp: config.minHp ?? 0,
                    maxHp: config.maxHp ?? 0,
                    recommendedHp: config.recommendedHp ?? 0
                }));
                return { ...config, engines };
            }
            return config;
        });

        return {
            coverImageUrl: safeModel.coverImageUrl ?? null,
            galleryImageUrls: safeModel.galleryImageUrls ?? [],
            specifications: {
                motorConfigurations: motorConfigs,
                otherSpecs: safeModel.specifications?.otherSpecs ?? [],
            },
            standardFeatures: safeModel.standardFeatures ?? [],
            optionalFeatures: safeModel.optionalFeatures ?? [],
            colors: unifiedColors,
            documents: (safeModel.documents || []).map((d: any) => ({ ...d, id: d.id || `doc-${Math.random()}` })),
        };
    }, []);
    
    const form = useForm<ModelFormData>({
        resolver: zodResolver(highfieldModelSchema),
        defaultValues: getSafeDefaultValues(model)
    });
    
    const { reset, control } = form;

    useEffect(() => {
        if (model) {
            reset(getSafeDefaultValues(model));
        }
    }, [model, reset, getSafeDefaultValues]);

    const { fields: specFields, append: appendSpec, remove: removeSpec } = useFieldArray({ control, name: "specifications.otherSpecs" });
    const { fields: featureFields, append: appendFeature, remove: removeFeature, replace: replaceFeatures } = useFieldArray({ control, name: "standardFeatures" });
    const { fields: colorFields, append: appendColor, remove: removeColor } = useFieldArray({ control, name: "colors" });
    const { fields: optionalFeatureFields, append: appendOptionalFeature, remove: removeOptionalFeature } = useFieldArray({ control, name: "optionalFeatures" });
    const { fields: galleryImageFields, append: appendGalleryImage, remove: removeGalleryImage } = useFieldArray({ control, name: 'galleryImageUrls' });
    
    const coverImageUrl = useWatch({ control, name: "coverImageUrl" });

    async function onSubmit(values: ModelFormData) {
        setIsSubmitting(true);

        const colorsForDb = values.colors.map(color => ({
            id: color.id,
            name: color.name,
            imageUrl: color.imageUrl,
        }));
        
        const variantPricingForDb: any[] = [];
        values.colors.forEach(color => {
            const { HYP, PVC } = color.pricing;
            if (HYP && (HYP.cost != null || HYP.sellPriceExclGst != null)) {
                variantPricingForDb.push({ colorId: color.id, colorName: color.name, material: 'HYP', ...HYP });
            }
            if (PVC && (PVC.cost != null || PVC.sellPriceExclGst != null)) {
                variantPricingForDb.push({ colorId: color.id, colorName: color.name, material: 'PVC', ...PVC });
            }
        });

        const { colors, ...restOfValues } = values;

        const finalValues = {
            ...restOfValues,
            colors: colorsForDb,
            variantPricing: variantPricingForDb
        };

        const sanitizedValues = sanitizeDataForFirestore(finalValues);
        const modelDocRef = doc(firestore, docPath);

        try {
            await updateDoc(modelDocRef, sanitizedValues);
            toast({ title: "Model Updated", description: "Your changes have been saved." });
            reset(getSafeDefaultValues({ ...model, ...finalValues }));
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

    const handleAddColor = () => {
        appendColor({
            id: `color-${Date.now()}`,
            name: '',
            imageUrl: null,
            pricing: {
                HYP: { cost: null, sellPriceExclGst: null },
                PVC: { cost: null, sellPriceExclGst: null },
            }
        });
    };

    return (
        <FormProvider {...form}>
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit, (errors) => {
                console.error("Form errors", errors);
                toast({ variant: "destructive", title: "Validation Error", description: "Please check the form for errors." });
            })} className="space-y-6">

                <div className="grid grid-cols-1 lg:grid-cols-7 gap-8 items-start">
                    <div className="lg:col-span-4 space-y-8">
                        <MotorConfigurationsCard control={form.control} />
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
                    </div>

                    <div className="lg:col-span-3 space-y-8">
                        <Card>
                            <CardHeader>
                                <CardTitle>Material</CardTitle>
                                <CardDescription>The hull material options for this model.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="flex h-full flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-4 text-sm font-medium text-popover-foreground whitespace-nowrap">HYP (Hypalon)</div>
                                    <div className="flex h-full flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-4 text-sm font-medium text-popover-foreground whitespace-nowrap">PVC (Polyvinyl Chloride)</div>
                                </div>
                            </CardContent>
                        </Card>

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
                                                            <label htmlFor="gallery-image-upload" className={cn("aspect-square flex items-center justify-center border-2 border-dashed rounded-lg cursor-pointer bg-background hover:bg-secondary", isGalleryUploading && "bg-muted/50 cursor-not-allowed")}>
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
                                    <Button type="button" variant="outline" size="sm" onClick={() => appendOptionalFeature({ id: `feat-${Date.now()}`, name: '', cost: 0, sellPriceExclGst: 0, imageUrl: null })}><PlusCircle className="mr-2 h-4 w-4" />Add Feature</Button>
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
                 <Collapsible asChild>
                    <Card>
                        <CollapsibleCardHeader title="Color Variants">
                            <Button type="button" variant="outline" size="sm" onClick={handleAddColor}><PlusCircle className="mr-2 h-4 w-4" />Add Color Variant</Button>
                        </CollapsibleCardHeader>
                        <CollapsibleContent>
                            <CardContent className="space-y-4">
                                {colorFields.map((field, index) => (
                                    <ColorVariantItem key={field.id} index={index} remove={removeColor} model={model} />
                                ))}
                                {colorFields.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No color variants added.</p>}
                            </CardContent>
                        </CollapsibleContent>
                    </Card>
                </Collapsible>
                
                {Object.keys(form.formState.errors).length > 0 && (
                    <div className="p-4 border border-destructive/50 rounded-lg bg-destructive/10 text-destructive text-sm">
                        <p className="font-semibold">Form Errors:</p>
                        <pre className="mt-2 whitespace-pre-wrap">
                            {JSON.stringify(form.formState.errors, null, 2)}
                        </pre>
                    </div>
                )}
            </form>
        </Form>
        </FormProvider>
    );
}

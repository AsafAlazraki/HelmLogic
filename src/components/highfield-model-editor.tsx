'use client';

import { useState } from 'react';
import { useFieldArray, useWatch, useController, useFormContext } from 'react-hook-form';
import { z } from 'zod';
import Image from 'next/image';
import { useStorage } from '@/firebase/provider';
import { uploadFileWithProgress } from '@/firebase/storage';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField, FormItem, FormLabel, FormMessage, FormControl } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, X, PlusCircle, Trash2, Upload, Image as ImageIcon, Plus, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from './ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Separator } from './ui/separator';

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
                    <FormControl><Input type="number" step="any" placeholder="0.00" value={valueExcl ?? ''} onChange={handleExclChange} /></FormControl>
                </FormItem>
                <FormItem className="space-y-1">
                    <FormLabel className="text-xs font-normal text-muted-foreground">inc. GST</FormLabel>
                    <FormControl><Input type="number" step="any" placeholder="0.00" value={valueInclDisplay} onChange={handleInclChange} /></FormControl>
                </FormItem>
            </div>
             <FormMessage>{fieldState.error && String(fieldState.error.message)}</FormMessage>
        </FormItem>
    );
}

const CollapsibleCardHeader = ({ title, description, count }: { title: string, description?: string, count?: number }) => (
    <CardHeader className="flex flex-row items-start justify-between cursor-pointer" asChild>
        <CollapsibleTrigger>
            <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                    <CardTitle>{title}</CardTitle>
                    {count !== undefined && <span className="text-sm font-normal text-muted-foreground">({count})</span>}
                </div>
                {description && <CardDescription>{description}</CardDescription>}
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-90" />
        </CollapsibleTrigger>
    </CardHeader>
);

function OptionalFeatureItem({ index, remove }: { index: number; remove: (index: number) => void; }) {
    const { control } = useFormContext<ModelFormData>();
    const imageUrl = useWatch({ control, name: `optionalFeatures.${index}.imageUrl` });
    const storage = useStorage();
    const [isUploading, setIsUploading] = useState(false);

    return (
        <Card className="relative bg-muted/50 overflow-hidden p-4 group/item">
            <div className="absolute top-2 right-2 z-10">
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>
            </div>
            <div className="flex gap-4 items-start">
                 <FormField
                    control={control}
                    name={`optionalFeatures.${index}.imageUrl`}
                    render={({ field }) => (
                        <FormItem className="w-32 flex-shrink-0">
                            <div className="relative aspect-square w-full overflow-hidden rounded-md group bg-background border">
                                {isUploading && <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20"><Loader2 className="h-6 w-6 animate-spin text-white" /></div>}
                                {imageUrl ? (
                                    <>
                                        <Image src={imageUrl} alt="Feature" fill className="object-cover" />
                                        <Button type="button" variant="outline" size="icon" className="absolute top-1 right-1 h-6 w-6" onClick={() => field.onChange(null)}><X className="h-3 w-3" /></Button>
                                    </>
                                ) : (
                                    <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-secondary/50">
                                        <Upload className="w-6 h-6 text-muted-foreground" />
                                        <FormControl><Input type="file" className="hidden" accept="image/*" onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (file && storage) {
                                                setIsUploading(true);
                                                try {
                                                    const url = await uploadFileWithProgress(storage, file, `features/${Date.now()}-${file.name}`, () => {});
                                                    field.onChange(url);
                                                } finally { setIsUploading(false); }
                                            }
                                        }} /></FormControl>
                                    </label>
                                )}
                            </div>
                        </FormItem>
                    )}
                />
                <div className="flex-1 space-y-3">
                     <FormField control={control} name={`optionalFeatures.${index}.name`} render={({ field }) => ( <FormItem><FormControl><Input placeholder="Feature Name" {...field} /></FormControl><FormMessage /></FormItem> )} />
                    <div className="grid grid-cols-2 gap-4">
                        <GstInputPair control={control} name={`optionalFeatures.${index}.cost`} label="Cost" />
                        <GstInputPair control={control} name={`optionalFeatures.${index}.sellPriceExclGst`} label="Sell Price" />
                    </div>
                </div>
            </div>
        </Card>
    );
}

function ColorVariantItem({ index, remove }: { index: number; remove: (index: number) => void; }) {
  const { control } = useFormContext<ModelFormData>();
  const imageUrl = useWatch({ control, name: `colors.${index}.imageUrl` });
  const storage = useStorage();
  const [isUploading, setIsUploading] = useState(false);

  return (
    <Card className="bg-muted/50 overflow-hidden p-4">
      <div className="flex flex-col sm:flex-row gap-4 items-start">
        <FormField
          control={control}
          name={`colors.${index}.imageUrl`}
          render={({ field }) => (
            <FormItem className="w-32 flex-shrink-0">
              <div className="relative aspect-square w-full overflow-hidden rounded-md border bg-background">
                  {isUploading && <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20"><Loader2 className="h-6 w-6 animate-spin text-white" /></div>}
                  {imageUrl ? (
                    <>
                      <Image src={imageUrl} alt="Color" fill className="object-cover" />
                      <Button type="button" variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6" onClick={() => field.onChange(null)}><X className="h-4 w-4" /></Button>
                    </>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-secondary/50">
                        <Upload className="w-6 h-6 text-muted-foreground" />
                        <FormControl><Input type="file" className="hidden" accept="image/*" onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file && storage) {
                                setIsUploading(true);
                                try {
                                    const url = await uploadFileWithProgress(storage, file, `colors/${Date.now()}-${file.name}`, () => {});
                                    field.onChange(url);
                                } finally { setIsUploading(false); }
                            }
                        }} /></FormControl>
                    </label>
                  )}
              </div>
            </FormItem>
          )}
        />
        <div className="flex-1 space-y-4 w-full">
          <div className="flex items-center gap-2">
            <FormField control={control} name={`colors.${index}.name`} render={({ field }) => ( <FormItem className="flex-1"><FormControl><Input placeholder="Color Name" {...field} /></FormControl></FormItem> )} />
            <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 border rounded-md bg-background"><h4 className="font-medium text-xs mb-2 text-muted-foreground">HYP Pricing</h4><GstInputPair control={control} name={`colors.${index}.pricing.HYP.cost`} label="Cost" /><GstInputPair control={control} name={`colors.${index}.pricing.HYP.sellPriceExclGst`} label="Sell" /></div>
            <div className="p-3 border rounded-md bg-background"><h4 className="font-medium text-xs mb-2 text-muted-foreground">PVC Pricing</h4><GstInputPair control={control} name={`colors.${index}.pricing.PVC.cost`} label="Cost" /><GstInputPair control={control} name={`colors.${index}.pricing.PVC.sellPriceExclGst`} label="Sell" /></div>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function HighfieldModelEditor({ model }: { model: any }) {
    const { control, watch, setValue } = useFormContext<ModelFormData>();
    const storage = useStorage();
    const [isCoverUploading, setIsCoverUploading] = useState(false);
    const [isGalleryUploading, setIsGalleryUploading] = useState(false);
    const [bulkFeatures, setBulkFeatures] = useState('');

    const { fields: specFields, append: appendSpec, remove: removeSpec } = useFieldArray({ control, name: "specifications.otherSpecs" });
    const { fields: featureFields, append: appendFeature, remove: removeFeature, replace: replaceFeatures } = useFieldArray({ control, name: "standardFeatures" });
    const { fields: colorFields, append: appendColor, remove: removeColor } = useFieldArray({ control, name: "colors" });
    const { fields: optionalFeatureFields, append: appendOptionalFeature, remove: removeOptionalFeature } = useFieldArray({ control, name: "optionalFeatures" });
    const { fields: galleryFields, append: appendGalleryImage, remove: removeGalleryImage } = useFieldArray({ control, name: 'galleryImageUrls' });
    
    const coverImageUrl = watch("coverImageUrl");
    const galleryUrls = watch("galleryImageUrls") || [];

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-7 gap-8 items-start">
                <div className="lg:col-span-4 space-y-8">
                    <Collapsible asChild className="group" defaultOpen>
                        <Card>
                            <CollapsibleCardHeader title="General Specifications" count={specFields.length} />
                            <CollapsibleContent>
                                <CardContent className="space-y-4">
                                    <div className="flex justify-end"><Button type="button" variant="outline" size="sm" onClick={() => appendSpec({ id: `spec-${Date.now()}`, label: '', value: '' })}><PlusCircle className="mr-2 h-4 w-4" />Add Spec</Button></div>
                                    {specFields.map((field, index) => (
                                        <div key={field.id} className="flex items-end gap-2">
                                            <FormField control={control} name={`specifications.otherSpecs.${index}.label`} render={({ field }) => ( <FormItem className="flex-1"><FormControl><Input placeholder="Label (e.g. Beam)" {...field} /></FormControl></FormItem> )} />
                                            <FormField control={control} name={`specifications.otherSpecs.${index}.value`} render={({ field }) => ( <FormItem className="flex-1"><FormControl><Input placeholder="Value (e.g. 2.5m)" {...field} /></FormControl></FormItem> )} />
                                            <Button type="button" variant="ghost" size="icon" onClick={() => removeSpec(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                        </div>
                                    ))}
                                </CardContent>
                            </CollapsibleContent>
                        </Card>
                    </Collapsible>
                    
                    <Collapsible asChild className="group" defaultOpen>
                        <Card>
                            <CollapsibleCardHeader title="Standard Features" count={featureFields.length} />
                            <CollapsibleContent>
                                <CardContent className="space-y-4">
                                    <div className="flex justify-end"><Button type="button" variant="outline" size="sm" onClick={() => appendFeature('')}><PlusCircle className="mr-2 h-4 w-4" />Add Item</Button></div>
                                    <div className="max-h-64 overflow-y-auto space-y-2 pr-2">
                                        {featureFields.map((field, index) => (
                                            <div key={field.id} className="flex items-center gap-2">
                                                <FormField control={control} name={`standardFeatures.${index}`} render={({ field }) => ( <FormItem className="flex-1"><FormControl><Input {...field} /></FormControl></FormItem> )} />
                                                <Button type="button" variant="ghost" size="icon" onClick={() => removeFeature(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                            </div>
                                        ))}
                                    </div>
                                    <Separator />
                                    <div className="space-y-2">
                                        <FormLabel className="text-xs font-semibold uppercase text-muted-foreground">Bulk Import Features</FormLabel>
                                        <Textarea placeholder="Paste one feature per line here..." value={bulkFeatures} onChange={(e) => setBulkFeatures(e.target.value)} />
                                        <Button type="button" variant="secondary" size="sm" className="w-full" onClick={() => { 
                                            const newFeatures = bulkFeatures.split('\n').map(f => f.trim()).filter(Boolean);
                                            replaceFeatures([...(watch('standardFeatures') || []), ...newFeatures]); 
                                            setBulkFeatures(''); 
                                        }}>Append Bulk Items</Button>
                                    </div>
                                </CardContent>
                            </CollapsibleContent>
                        </Card>
                    </Collapsible>
                </div>

                <div className="lg:col-span-3 space-y-8">
                    <Card>
                        <CardHeader><CardTitle>Main Cover Image</CardTitle></CardHeader>
                        <CardContent>
                            <div className="relative aspect-video w-full overflow-hidden rounded-md border bg-muted/30 group">
                                {isCoverUploading && <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20"><Loader2 className="h-8 w-8 animate-spin text-white" /></div>}
                                {coverImageUrl ? (
                                    <>
                                        <Image src={coverImageUrl} alt="Cover" fill className="object-contain p-2" />
                                        <Button type="button" variant="destructive" size="icon" className="absolute top-1 right-1 h-7 w-7 shadow-lg" onClick={() => setValue('coverImageUrl', null)}><X className="h-4 w-4" /></Button>
                                    </>
                                ) : (
                                    <label className="flex flex-col items-center justify-center w-full h-48 cursor-pointer hover:bg-secondary/50 transition-colors">
                                        <ImageIcon className="w-10 h-10 mb-2 text-muted-foreground" />
                                        <span className="text-sm font-medium text-muted-foreground">Upload Boat Render</span>
                                        <FormControl><Input type="file" className="hidden" accept="image/*" onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (file && storage) {
                                                setIsCoverUploading(true);
                                                try {
                                                    const url = await uploadFileWithProgress(storage, file, `models/${model.id}/cover-${Date.now()}`, () => {});
                                                    setValue('coverImageUrl', url);
                                                } finally { setIsCoverUploading(false); }
                                            }
                                        }} /></FormControl>
                                    </label>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                    <Collapsible asChild className="group">
                        <Card>
                            <CollapsibleCardHeader title="Image Gallery" count={galleryUrls.length} />
                            <CollapsibleContent>
                                <CardContent className="grid grid-cols-3 gap-2">
                                    {galleryUrls.map((url, index) => (
                                        <div key={index} className="relative aspect-square group rounded-md overflow-hidden border">
                                            <Image src={url} alt={`Gallery ${index}`} fill className="object-cover" />
                                            <Button type="button" variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => removeGalleryImage(index)}><Trash2 className="h-4 w-4" /></Button>
                                        </div>
                                    ))}
                                    <label className="aspect-square flex flex-col items-center justify-center border-2 border-dashed rounded-lg cursor-pointer hover:bg-secondary transition-colors">
                                        <Input type="file" multiple className="hidden" accept="image/*" onChange={async (e) => {
                                            const files = Array.from(e.target.files || []);
                                            setIsGalleryUploading(true);
                                            try {
                                                for (const file of files) {
                                                    const url = await uploadFileWithProgress(storage!, file, `models/${model.id}/gallery/${Date.now()}-${file.name}`, () => {});
                                                    appendGalleryImage(url);
                                                }
                                            } finally { setIsGalleryUploading(false); }
                                        }}/>
                                        {isGalleryUploading ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <Plus className="h-6 w-6 text-muted-foreground" />}
                                    </label>
                                </CardContent>
                            </CollapsibleContent>
                        </Card>
                    </Collapsible>
                </div>
            </div>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Material & Color Pricing</CardTitle>
                        <CardDescription>Configure pricing for HYP and PVC material variants across available colors.</CardDescription>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => appendColor({ id: `color-${Date.now()}`, name: '', imageUrl: null, pricing: { HYP: { cost: null, sellPriceExclGst: null }, PVC: { cost: null, sellPriceExclGst: null }}})}><PlusCircle className="mr-2 h-4 w-4" />Add Color Variant</Button>
                </CardHeader>
                <CardContent className="space-y-4">{colorFields.map((field, index) => ( <ColorVariantItem key={field.id} index={index} remove={removeColor} /> ))}</CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Brand Options & Accessories</CardTitle>
                        <CardDescription>Configure brand-specific optional features available for this model.</CardDescription>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => appendOptionalFeature({ id: `feat-${Date.now()}`, name: '', cost: 0, sellPriceExclGst: 0, imageUrl: null })}><PlusCircle className="mr-2 h-4 w-4" />Add Option</Button>
                </CardHeader>
                <CardContent className="space-y-4">{optionalFeatureFields.map((field, index) => ( <OptionalFeatureItem key={field.id} index={index} remove={removeOptionalFeature} /> ))}</CardContent>
            </Card>
        </div>
    );
}

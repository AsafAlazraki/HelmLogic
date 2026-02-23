
'use client';

import { useState } from 'react';
import { useFieldArray, useWatch, useController, useFormContext } from 'react-hook-form';
import { z } from 'zod';
import Image from 'next/image';
import { useStorage } from '@/firebase/provider';
import { uploadFileWithProgress } from '@/firebase/storage';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField, FormItem, FormLabel, FormMessage, FormControl } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, X, PlusCircle, Trash2, Upload, Image as ImageIcon, Plus, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from './ui/separator';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

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

const CollapsibleCardHeader = ({ title, count, onAdd }: { title: string, count?: number, onAdd?: () => void }) => (
    <div className="flex items-center justify-between py-4 px-6 border-b bg-card select-none">
        <div className="flex items-center gap-3">
            <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full border shadow-sm hover:bg-primary/10 hover:text-primary transition-colors group-data-[state=open]:bg-muted">
                    <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </Button>
            </CollapsibleTrigger>
            <CardTitle className="text-lg font-bold">{title}</CardTitle>
            {count !== undefined && (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-tighter">
                    {count}
                </span>
            )}
        </div>
        <div className="flex items-center gap-3">
            {onAdd && (
                <Button type="button" variant="outline" size="sm" className="h-8 px-3 text-xs font-semibold" onClick={(e) => { e.stopPropagation(); onAdd(); }}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Add
                </Button>
            )}
        </div>
    </div>
);

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
        <div>
            <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</FormLabel>
            <div className="grid grid-cols-2 gap-2 mt-2">
                <FormItem className="space-y-1">
                    <FormLabel className="text-[10px] font-medium text-muted-foreground uppercase">excl. GST</FormLabel>
                    <FormControl><Input type="number" step="any" placeholder="0.00" className="h-9" value={valueExcl ?? ''} onChange={handleExclChange} /></FormControl>
                </FormItem>
                <FormItem className="space-y-1">
                    <FormLabel className="text-[10px] font-medium text-muted-foreground uppercase">inc. GST</FormLabel>
                    <FormControl><Input type="number" step="any" placeholder="0.00" className="h-9" value={valueInclDisplay} onChange={handleInclChange} /></FormControl>
                </FormItem>
            </div>
             <FormMessage>{fieldState.error && String(fieldState.error.message)}</FormMessage>
        </div>
    );
}

function VisualAssetsCard({ model }: { model: any }) {
    const { control, watch, setValue } = useFormContext<ModelFormData>();
    const storage = useStorage();
    const [isCoverUploading, setIsCoverUploading] = useState(false);
    const [isGalleryUploading, setIsGalleryUploading] = useState(false);
    
    const coverImageUrl = watch("coverImageUrl");
    const galleryUrls = watch("galleryImageUrls") || [];
    const { append: appendGalleryImage, remove: removeGalleryImage } = useFieldArray({ control, name: 'galleryImageUrls' });

    return (
        <Collapsible className="group overflow-hidden rounded-xl border bg-card shadow-sm" defaultOpen>
            <CollapsibleCardHeader title="Media & Gallery" count={galleryUrls.length + (coverImageUrl ? 1 : 0)} />
            <CollapsibleContent>
                <div className="space-y-0">
                    <div className="relative aspect-[16/10] w-full bg-secondary group">
                        {isCoverUploading && <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20"><Loader2 className="h-8 w-8 animate-spin text-white" /></div>}
                        {coverImageUrl ? (
                            <div className="h-full w-full flex items-center justify-center relative">
                                <Image src={coverImageUrl} alt="Cover" fill className="object-contain p-4" />
                                <Button type="button" variant="destructive" size="icon" className="absolute top-3 right-3 h-8 w-8 shadow-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10" onClick={() => setValue('coverImageUrl', null)}><X className="h-4 w-4" /></Button>
                            </div>
                        ) : (
                            <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-secondary/80 transition-all">
                                <ImageIcon className="w-12 h-12 mb-3 text-muted-foreground/50" />
                                <span className="text-sm font-bold text-muted-foreground">Upload Boat Render</span>
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
                    
                    <div className="p-6 space-y-3 bg-card border-t">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Image Gallery</Label>
                        <div className="grid grid-cols-3 gap-3">
                            {galleryUrls.map((url, index) => (
                                <div key={index} className="relative aspect-square group rounded-lg overflow-hidden border bg-muted">
                                    <Image src={url} alt={`Gallery ${index}`} fill className="object-cover" />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <Button type="button" variant="destructive" size="icon" className="h-8 w-8 rounded-full" onClick={() => removeGalleryImage(index)}><Trash2 className="h-4 w-4" /></Button>
                                    </div>
                                </div>
                            ))}
                            <label className="aspect-square flex flex-col items-center justify-center border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-all group/add">
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
                                {isGalleryUploading ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <Plus className="h-6 w-6 text-muted-foreground group-hover/add:scale-110 transition-transform" />}
                            </label>
                        </div>
                    </div>
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}

function MotorConfigurationCard() {
    const { control } = useFormContext<ModelFormData>();
    const { fields, append, remove } = useFieldArray({ control, name: "specifications.motorConfigurations" as any });

    return (
        <Collapsible asChild className="group overflow-hidden rounded-xl border bg-card shadow-sm" defaultOpen>
            <Card className="border-none shadow-none rounded-none">
                <CollapsibleCardHeader 
                    title="Motor Configuration Requirements" 
                    count={fields.length} 
                    onAdd={() => append({ type: 'Single', engines: [{ label: 'Engine', minHp: 0, maxHp: 0, recommendedHp: 0 }] })} 
                />
                <CollapsibleContent>
                    <CardContent className="space-y-6 pt-6">
                        {fields.map((field, index) => (
                            <Card key={field.id} className="p-4 border-2 border-muted bg-muted/5 relative group/item">
                                <div className="flex items-center justify-between mb-4">
                                    <FormField
                                        control={control}
                                        name={`specifications.motorConfigurations.${index}.type` as any}
                                        render={({ field }) => (
                                            <Select onValueChange={field.onChange} value={field.value}>
                                                <SelectTrigger className="w-[200px] h-8 font-bold border-none shadow-none bg-transparent hover:bg-muted transition-colors">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="Single">Single Engine</SelectItem>
                                                    <SelectItem value="Twin">Twin Engines</SelectItem>
                                                    <SelectItem value="Triple">Triple Engines</SelectItem>
                                                    <SelectItem value="Quad">Quad Engines</SelectItem>
                                                    <SelectItem value="SingleWithAux">Single with Aux</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        )}
                                    />
                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive opacity-0 group-hover/item:opacity-100 transition-opacity" onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>
                                </div>
                                <div className="grid grid-cols-3 gap-4">
                                    <FormField control={control} name={`specifications.motorConfigurations.${index}.engines.0.minHp` as any} render={({ field }) => (
                                        <FormItem><FormLabel className="text-[10px] font-bold uppercase text-muted-foreground">Min HP</FormLabel><FormControl><Input type="number" {...field} className="h-8" /></FormControl></FormItem>
                                    )} />
                                    <FormField control={control} name={`specifications.motorConfigurations.${index}.engines.0.maxHp` as any} render={({ field }) => (
                                        <FormItem><FormLabel className="text-[10px] font-bold uppercase text-muted-foreground">Max HP</FormLabel><FormControl><Input type="number" {...field} className="h-8" /></FormControl></FormItem>
                                    )} />
                                    <FormField control={control} name={`specifications.motorConfigurations.${index}.engines.0.recommendedHp` as any} render={({ field }) => (
                                        <FormItem><FormLabel className="text-[10px] font-bold uppercase text-muted-foreground">Rec. HP</FormLabel><FormControl><Input type="number" {...field} className="h-8" /></FormControl></FormItem>
                                    )} />
                                </div>
                            </Card>
                        ))}
                    </CardContent>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    );
}

export function HighfieldModelEditor({ model, isModuleView }: { model: any, isModuleView?: boolean }) {
    const { control, watch } = useFormContext<ModelFormData>();
    const [bulkFeatures, setBulkFeatures] = useState('');

    const { fields: specFields, append: appendSpec, remove: removeSpec } = useFieldArray({ control, name: "specifications.otherSpecs" });
    const { fields: featureFields, append: appendFeature, remove: removeFeature, replace: replaceFeatures } = useFieldArray({ control, name: "standardFeatures" });
    const { fields: colorFields, append: appendColor, remove: removeColor } = useFieldArray({ control, name: "colors" });
    const { fields: optionalFeatureFields, append: appendOptionalFeature, remove: removeOptionalFeature } = useFieldArray({ control, name: "optionalFeatures" });

    const SpecsSection = () => (
        <Collapsible asChild className="group overflow-hidden rounded-xl border bg-card shadow-sm" defaultOpen>
            <Card className="border-none shadow-none rounded-none">
                <CollapsibleCardHeader 
                    title="General Specifications" 
                    count={specFields.length} 
                    onAdd={() => appendSpec({ id: `spec-${Date.now()}`, label: '', value: '' })}
                />
                <CollapsibleContent>
                    <CardContent className="space-y-4 pt-6">
                        <div className="grid gap-3">
                            {specFields.map((field, index) => (
                                <div key={field.id} className="flex items-center gap-2 group/field">
                                    <FormField control={control} name={`specifications.otherSpecs.${index}.label`} render={({ field }) => ( <FormItem className="flex-1"><FormControl><Input placeholder="Label" className="h-9" {...field} /></FormControl></FormItem> )} />
                                    <FormField control={control} name={`specifications.otherSpecs.${index}.value`} render={({ field }) => ( <FormItem className="flex-1"><FormControl><Input placeholder="Value" className="h-9 font-medium" {...field} /></FormControl></FormItem> )} />
                                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 opacity-0 group-hover/field:opacity-100 text-destructive hover:bg-destructive/10 transition-opacity" onClick={() => removeSpec(index)}><Trash2 className="h-4 w-4" /></Button>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    );

    const FeaturesSection = () => (
        <Collapsible asChild className="group overflow-hidden rounded-xl border bg-card shadow-sm" defaultOpen>
            <Card className="border-none shadow-none rounded-none">
                <CollapsibleCardHeader 
                    title="Standard Features" 
                    count={featureFields.length} 
                    onAdd={() => appendFeature('')}
                />
                <CollapsibleContent>
                    <CardContent className="space-y-4 pt-6">
                        <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2">
                            {featureFields.map((field, index) => (
                                <div key={field.id} className="flex items-center gap-2 group/feat">
                                    <FormField control={control} name={`standardFeatures.${index}`} render={({ field }) => ( <FormItem className="flex-1"><FormControl><Input className="h-9" {...field} /></FormControl></FormItem> )} />
                                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 opacity-0 group-hover/feat:opacity-100 text-destructive" onClick={() => removeFeature(index)}><Trash2 className="h-4 w-4" /></Button>
                                </div>
                            ))}
                        </div>
                        <Separator />
                        <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
                            <Label className="text-xs font-bold uppercase text-muted-foreground tracking-widest">Bulk Import</Label>
                            <Textarea placeholder="Paste one feature per line here..." className="bg-background min-h-[100px]" value={bulkFeatures} onChange={(e) => setBulkFeatures(e.target.value)} />
                            <Button type="button" variant="secondary" size="sm" className="w-full font-bold h-9" onClick={() => { 
                                const newFeatures = bulkFeatures.split('\n').map(f => f.trim()).filter(Boolean);
                                replaceFeatures([...(watch('standardFeatures') || []), ...newFeatures]); 
                                setBulkFeatures(''); 
                            }}>Append Bulk Items</Button>
                        </div>
                    </CardContent>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    );

    return (
        <div className="space-y-8 max-w-full overflow-x-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-7 gap-8 items-start">
                <div className={cn("space-y-8", isModuleView ? "lg:col-span-3 lg:order-1" : "lg:col-span-4 lg:order-1")}>
                    {isModuleView ? (
                        <>
                            <VisualAssetsCard model={model} />
                            <MotorConfigurationCard />
                        </>
                    ) : (
                        <>
                            <SpecsSection />
                            <FeaturesSection />
                            <MotorConfigurationCard />
                        </>
                    )}
                </div>
                <div className={cn("space-y-8", isModuleView ? "lg:col-span-4 lg:order-2" : "lg:col-span-3 lg:order-2")}>
                    {isModuleView ? (
                        <>
                            <SpecsSection />
                            <FeaturesSection />
                        </>
                    ) : <VisualAssetsCard model={model} />}
                </div>
            </div>

            <Collapsible asChild className="group overflow-hidden rounded-xl border bg-card shadow-sm" defaultOpen>
                <Card className="border-none shadow-none rounded-none">
                    <CollapsibleCardHeader 
                        title="Material & Color Pricing" 
                        count={colorFields.length}
                        onAdd={() => appendColor({ id: `color-${Date.now()}`, name: '', imageUrl: null, pricing: { HYP: { cost: null, sellPriceExclGst: null }, PVC: { cost: null, sellPriceExclGst: null }}})}
                    />
                    <CollapsibleContent>
                        <CardContent className="space-y-6 pt-8">
                            {colorFields.map((field, index) => ( <ColorVariantItem key={field.id} index={index} remove={removeColor} /> ))}
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            <Collapsible asChild className="group overflow-hidden rounded-xl border bg-card shadow-sm" defaultOpen>
                <Card className="border-none shadow-none rounded-none">
                    <CollapsibleCardHeader 
                        title="Brand Options & Accessories" 
                        count={optionalFeatureFields.length}
                        onAdd={() => appendOptionalFeature({ id: `feat-${Date.now()}`, name: '', cost: 0, sellPriceExclGst: 0, imageUrl: null })}
                    />
                    <CollapsibleContent>
                        <CardContent className="grid md:grid-cols-2 gap-6 pt-8">
                            {optionalFeatureFields.map((field, index) => ( <OptionalFeatureItem key={field.id} index={index} remove={removeOptionalFeature} /> ))}
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>
        </div>
    );
}

function ColorVariantItem({ index, remove }: { index: number; remove: (index: number) => void; }) {
  const { control } = useFormContext<ModelFormData>();
  const imageUrl = useWatch({ control, name: `colors.${index}.imageUrl` });
  const storage = useStorage();
  const [isUploading, setIsUploading] = useState(false);

  return (
    <Card className="bg-background overflow-hidden p-5 border hover:border-primary/20 transition-all">
      <div className="flex flex-col sm:flex-row gap-6 items-start">
        <FormField
          control={control}
          name={`colors.${index}.imageUrl`}
          render={({ field }) => (
            <FormItem className="w-36 flex-shrink-0">
              <div className="relative aspect-video w-full overflow-hidden rounded-lg border-2 border-dashed bg-muted/20">
                  {isUploading && <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20"><Loader2 className="h-6 w-6 animate-spin text-white" /></div>}
                  {imageUrl ? (
                    <>
                      <Image src={imageUrl} alt="Color" fill className="object-cover" />
                      <Button type="button" variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6 rounded-full shadow-lg" onClick={() => field.onChange(null)}><X className="h-4 w-4" /></Button>
                    </>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-secondary/50">
                        <Upload className="w-5 h-5 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground mt-1 font-bold uppercase">Swatch</span>
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
        <div className="flex-1 space-y-5 w-full">
          <div className="flex items-center gap-3">
            <FormField control={control} name={`colors.${index}.name`} render={({ field }) => ( <FormItem className="flex-1"><FormLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Color Variant</FormLabel><FormControl><Input placeholder="Color Name" className="h-9 font-bold" {...field} /></FormControl></FormItem> )} />
            <Button type="button" variant="ghost" size="icon" className="mt-6 text-destructive" onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 border rounded-xl bg-muted/10 space-y-4"><h4 className="font-black text-xs uppercase tracking-tighter text-primary">HYP Material</h4><Separator /><GstInputPair control={control} name={`colors.${index}.pricing.HYP.cost`} label="Cost" /><GstInputPair control={control} name={`colors.${index}.pricing.HYP.sellPriceExclGst`} label="Sell" /></div>
            <div className="p-4 border rounded-xl bg-muted/10 space-y-4"><h4 className="font-black text-xs uppercase tracking-tighter text-primary">PVC Material</h4><Separator /><GstInputPair control={control} name={`colors.${index}.pricing.PVC.cost`} label="Cost" /><GstInputPair control={control} name={`colors.${index}.pricing.PVC.sellPriceExclGst`} label="Sell" /></div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function OptionalFeatureItem({ index, remove }: { index: number; remove: (index: number) => void; }) {
    const { control } = useFormContext<ModelFormData>();
    const imageUrl = useWatch({ control, name: `optionalFeatures.${index}.imageUrl` });
    const storage = useStorage();
    const [isUploading, setIsUploading] = useState(false);

    return (
        <Card className="relative bg-background overflow-hidden p-5 group/item border hover:border-primary/20 transition-all">
            <div className="absolute top-2 right-2 z-10">
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive opacity-0 group-hover/item:opacity-100 transition-opacity" onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>
            </div>
            <div className="flex gap-6 items-start">
                 <FormField
                    control={control}
                    name={`optionalFeatures.${index}.imageUrl`}
                    render={({ field }) => (
                        <FormItem className="w-36 flex-shrink-0">
                            <div className="relative aspect-video w-full overflow-hidden rounded-lg group bg-muted/20 border-2 border-dashed">
                                {isUploading && <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20"><Loader2 className="h-6 w-6 animate-spin text-white" /></div>}
                                {imageUrl ? (
                                    <>
                                        <Image src={imageUrl} alt="Feature" fill className="object-cover" />
                                        <Button type="button" variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6 rounded-full shadow-lg" onClick={() => field.onChange(null)}><X className="h-3 w-3" /></Button>
                                    </>
                                ) : (
                                    <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-secondary/50">
                                        <Upload className="w-5 h-5 text-muted-foreground" />
                                        <span className="text-[10px] text-muted-foreground mt-1 font-bold">IMAGE</span>
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
                <div className="flex-1 space-y-4">
                     <FormField control={control} name={`optionalFeatures.${index}.name`} render={({ field }) => ( <FormItem><FormLabel className="text-xs font-bold uppercase text-muted-foreground">Name</FormLabel><FormControl><Input placeholder="Feature Name" className="h-9 font-medium" {...field} /></FormControl><FormMessage /></FormItem> )} />
                    <div className="grid grid-cols-2 gap-6">
                        <GstInputPair control={control} name={`optionalFeatures.${index}.cost`} label="Factory Cost" />
                        <GstInputPair control={control} name={`optionalFeatures.${index}.sellPriceExclGst`} label="Retail Sell Price" />
                    </div>
                </div>
            </div>
        </Card>
    );
}

'use client';

import { useState } from 'react';
import { useFieldArray, useWatch, useController, useFormContext } from 'react-hook-form';
import { z } from 'zod';
import Image from 'next/image';
import { useStorage } from '@/firebase/provider';
import { uploadFileWithProgress } from '@/firebase/storage';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { PlusCircle, Trash2, ChevronRight, X, Image as ImageIcon, Plus, Upload, Package, Palette, Box } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

const GST_RATE = 0.10;

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
    cost: z.coerce.number().nullable().optional(),
    sellPriceExclGst: z.coerce.number().nullable().optional(),
    includedFeatures: z.array(z.string()).default([]),
});

export const jeanneauModelSchema = z.object({
    coverImageUrl: z.string().nullable().optional(),
    galleryImageUrls: z.array(z.string()).default([]),
    cost: z.coerce.number().nullable().optional(),
    sellPriceExclGst: z.coerce.number().nullable().optional(),
    freightCostExclGst: z.coerce.number().nullable().optional(),
    specifications: z.object({
        motorConfigurations: z.array(motorConfigSchema).default([]),
        otherSpecs: z.array(z.object({ id: z.string(), label: z.string(), value: z.string() })).default([]),
    }).optional(),
    standardFeatures: z.array(z.string()).default([]),
    packages: z.array(packageSchema).default([]),
    colors: z.array(colorVariantSchema).default([]),
    documents: z.array(z.object({ id: z.string(), name: z.string(), url: z.string() })).default([]),
});

type ModelFormData = z.infer<typeof jeanneauModelSchema>;

const CollapsibleCardHeader = ({ title, description, count }: { title: string, description?: string, count?: number }) => (
    <CardHeader className="flex flex-row items-center justify-between cursor-pointer hover:bg-muted/30 transition-colors py-4 px-6 border-b select-none group" asChild>
        <CollapsibleTrigger>
            <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                    <CardTitle className="text-lg font-bold">{title}</CardTitle>
                    {count !== undefined && <span className="text-sm font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{count}</span>}
                </div>
                {description && <CardDescription>{description}</CardDescription>}
            </div>
            <div className="h-8 w-8 rounded-full border flex items-center justify-center bg-background group-hover:border-primary transition-colors">
                <ChevronRight className="h-5 w-5 transition-transform duration-200 group-data-[state=open]:rotate-90" />
            </div>
        </CollapsibleTrigger>
    </CardHeader>
);

function GstInputPair({ control, name, label }: { control: any; name: string; label: string }) {
    const { field } = useController({ control, name, defaultValue: null });
    const valueExcl = field.value;
    const valueIncl = valueExcl !== null && valueExcl !== undefined ? Math.round((valueExcl * (1 + GST_RATE)) * 100) / 100 : null;
    const handleExclChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        field.onChange(val === '' ? null : parseFloat(val));
    };
    const handleInclChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (val !== '') {
            const num = parseFloat(val);
            field.onChange(Math.round((num / (1 + GST_RATE)) * 100) / 100);
        } else field.onChange(null);
    };
    return (
        <div>
            <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</FormLabel>
            <div className="grid grid-cols-2 gap-2 mt-2">
                <FormItem className="space-y-1">
                    <FormLabel className="text-[10px] font-medium text-muted-foreground uppercase">excl. GST</FormLabel>
                    <FormControl><Input type="number" step="0.01" className="h-9" value={valueExcl ?? ''} onChange={handleExclChange} /></FormControl>
                </FormItem>
                <FormItem className="space-y-1">
                    <FormLabel className="text-[10px] font-medium text-muted-foreground uppercase">inc. GST</FormLabel>
                    <FormControl><Input type="number" step="0.01" className="h-9" value={valueIncl ?? ''} onChange={handleInclChange} /></FormControl>
                </FormItem>
            </div>
        </div>
    );
}

export function JeanneauModelEditor({ model }: { model: any }) {
    const { control, watch, setValue } = useFormContext<ModelFormData>();
    const storage = useStorage();
    const [isCoverUploading, setIsCoverUploading] = useState(false);
    const [isGalleryUploading, setIsGalleryUploading] = useState(false);
    const [bulkFeatures, setBulkFeatures] = useState('');

    const { fields: specFields, append: appendSpec, remove: removeSpec } = useFieldArray({ control, name: "specifications.otherSpecs" });
    const { fields: featureFields, append: appendFeature, remove: removeFeature, replace: replaceFeatures } = useFieldArray({ control, name: "standardFeatures" });
    const { fields: packageFields, append: appendPackage, remove: removePackage } = useFieldArray({ control, name: "packages" });
    const { fields: colorFields, append: appendColor, remove: removeColor } = useFieldArray({ control, name: "colors" });
    const { fields: galleryFields, append: appendGalleryImage, remove: removeGalleryImage } = useFieldArray({ control, name: 'galleryImageUrls' });

    const coverImageUrl = watch("coverImageUrl");
    const galleryUrls = watch("galleryImageUrls") || [];

    return (
        <div className="space-y-8 max-w-full overflow-x-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-7 gap-8 items-start">
                <div className="lg:col-span-4 space-y-8">
                    <Collapsible asChild className="group overflow-hidden rounded-xl border bg-card shadow-sm" defaultOpen>
                        <Card className="border-none shadow-none rounded-none">
                            <CollapsibleCardHeader title="General Specifications" count={specFields.length} />
                            <CollapsibleContent>
                                <CardContent className="space-y-4 pt-6">
                                    <div className="flex justify-end"><Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => appendSpec({ id: `spec-${Date.now()}`, label: '', value: '' })}><PlusCircle className="mr-2 h-4 w-4" />Add Spec</Button></div>
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
                    
                    <Collapsible asChild className="group overflow-hidden rounded-xl border bg-card shadow-sm" defaultOpen>
                        <Card className="border-none shadow-none rounded-none">
                            <CollapsibleCardHeader title="Standard Features" count={featureFields.length} />
                            <CollapsibleContent>
                                <CardContent className="space-y-4 pt-6">
                                    <div className="flex justify-end"><Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => appendFeature('')}><PlusCircle className="mr-2 h-4 w-4" />Add Item</Button></div>
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
                </div>

                <div className="lg:col-span-3 space-y-8">
                    <Card className="overflow-hidden rounded-xl border bg-card shadow-sm">
                        <CardHeader className="py-4 px-6 border-b"><CardTitle className="text-lg font-bold">Main Cover Image</CardTitle></CardHeader>
                        <CardContent className="pt-6">
                            <div className="relative aspect-[16/10] w-full overflow-hidden rounded-lg border-2 border-dashed bg-muted/20 group">
                                {isCoverUploading && <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20"><Loader2 className="h-8 w-8 animate-spin text-white" /></div>}
                                {coverImageUrl ? (
                                    <div className="p-4 h-full w-full flex items-center justify-center relative">
                                        <div className="relative h-full w-full">
                                            <Image src={coverImageUrl} alt="Cover" fill className="object-contain" />
                                        </div>
                                        <Button type="button" variant="destructive" size="icon" className="absolute top-3 right-3 h-8 w-8 shadow-xl rounded-full z-10" onClick={() => setValue('coverImageUrl', null)}><X className="h-4 w-4" /></Button>
                                    </div>
                                ) : (
                                    <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-muted/50 transition-all">
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
                        </CardContent>
                    </Card>
                    <Collapsible asChild className="group overflow-hidden rounded-xl border bg-card shadow-sm">
                        <Card className="border-none shadow-none rounded-none">
                            <CollapsibleCardHeader title="Image Gallery" count={galleryUrls.length} />
                            <CollapsibleContent>
                                <CardContent className="grid grid-cols-3 gap-3 pt-6">
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
                                </CardContent>
                            </CollapsibleContent>
                        </Card>
                    </Collapsible>
                </div>
            </div>

            <Collapsible asChild className="group overflow-hidden rounded-xl border bg-card shadow-sm" defaultOpen>
                <Card className="border-none shadow-none rounded-none">
                    <CardHeader className="flex flex-row items-center justify-between py-4 px-6 border-b select-none">
                        <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                                <CardTitle className="text-lg font-bold">Model Packages</CardTitle>
                                <Package className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <CardDescription>Assign factory option bundles.</CardDescription>
                        </div>
                        <div className="flex gap-2">
                            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => appendPackage({ id: `pkg-${Date.now()}`, name: '', includedFeatures: [] })}><PlusCircle className="mr-2 h-4 w-4" />Add Package</Button>
                            <CollapsibleTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 rounded-full"><ChevronRight className="h-5 w-5 transition-transform duration-200 group-data-[state=open]:rotate-90" /></Button></CollapsibleTrigger>
                        </div>
                    </CardHeader>
                    <CollapsibleContent>
                        <CardContent className="pt-8 space-y-6">
                            {packageFields.map((field, index) => (
                                <Card key={field.id} className="border-2 bg-muted/5">
                                    <div className="flex items-center justify-between p-4 border-b bg-muted/20">
                                        <FormField control={control} name={`packages.${index}.name`} render={({ field }) => <Input {...field} className="font-bold border-none shadow-none bg-transparent max-w-md h-9 text-base" placeholder="Package Name (e.g. Trim Level 1)" />} />
                                        <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => removePackage(index)}><Trash2 className="h-4 w-4" /></Button>
                                    </div>
                                    <div className="p-6 grid md:grid-cols-2 gap-8">
                                        <div className="space-y-6">
                                            <GstInputPair control={control} name={`packages.${index}.cost`} label="Factory Cost" />
                                            <GstInputPair control={control} name={`packages.${index}.sellPriceExclGst`} label="Retail Sell Price" />
                                        </div>
                                        <div className="space-y-3">
                                            <FormLabel className="text-xs font-bold uppercase text-muted-foreground">Included Features</FormLabel>
                                            <Textarea className="min-h-[120px] bg-background" placeholder="Describe what's in this package..." />
                                        </div>
                                    </div>
                                </Card>
                            ))}
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            <Collapsible asChild className="group overflow-hidden rounded-xl border bg-card shadow-sm" defaultOpen>
                <Card className="border-none shadow-none rounded-none">
                    <CardHeader className="flex flex-row items-center justify-between py-4 px-6 border-b select-none">
                        <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                                <CardTitle className="text-lg font-bold">Color Variants</CardTitle>
                                <Palette className="h-4 w-4 text-muted-foreground" />
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => appendColor({ id: `col-${Date.now()}`, name: '', imageUrls: [] })}><PlusCircle className="mr-2 h-4 w-4" />Add Variant</Button>
                            <CollapsibleTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 rounded-full"><ChevronRight className="h-5 w-5 transition-transform duration-200 group-data-[state=open]:rotate-90" /></Button></CollapsibleTrigger>
                        </div>
                    </CardHeader>
                    <CollapsibleContent>
                        <CardContent className="pt-8 space-y-6">
                            {colorFields.map((field, index) => (
                                <Card key={field.id} className="p-5 border bg-muted/5">
                                    <div className="flex items-end gap-6">
                                        <FormField control={control} name={`colors.${index}.name`} render={({ field }) => ( <FormItem className="flex-1"><FormLabel className="text-xs font-bold uppercase text-muted-foreground">Variant Name</FormLabel><FormControl><Input placeholder="Color Name" className="h-9 font-bold" {...field} /></FormControl></FormItem> )} />
                                        <div className="flex-1">
                                            <GstInputPair control={control} name={`colors.${index}.sellPriceExclGst`} label="Upcharge (Sell)" />
                                        </div>
                                        <Button type="button" variant="ghost" size="icon" className="mb-1 text-destructive" onClick={() => removeColor(index)}><Trash2 className="h-4 w-4" /></Button>
                                    </div>
                                </Card>
                            ))}
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>
        </div>
    );
}

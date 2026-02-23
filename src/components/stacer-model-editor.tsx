
'use client';

import { useState } from 'react';
import { useFieldArray, useWatch, useController, useFormContext } from 'react-hook-form';
import { z } from 'zod';
import Image from 'next/image';
import { useStorage } from '@/firebase/provider';
import { uploadFileToStorage } from '@/firebase/storage';

import { Card, CardContent, CardTitle, CardHeader } from '@/components/ui/card';
import { FormField, FormItem, FormControl, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2, ChevronDown, X, Image as ImageIcon, Plus, Upload } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

export const stacerModelSchema = z.object({
    modelCode: z.string().min(1, 'Model Code is required'),
    coverImageUrl: z.string().nullable().optional(),
    galleryImageUrls: z.array(z.string()).default([]),
    cost: z.number().nullable().optional(),
    sellPriceExclGst: z.number().nullable().optional(),
    freightCostExclGst: z.number().nullable().optional(),
    specifications: z.object({
        motorConfigurations: z.array(motorConfigSchema).default([]),
        otherSpecs: z.array(z.object({ id: z.string(), label: z.string(), value: z.string() })).default([]),
    }).optional(),
    standardFeatures: z.array(z.string()).default([]),
    optionalFeatures: z.array(z.object({ id: z.string(), name: z.string(), cost: z.number().nullable().optional(), sellPriceExclGst: z.number().nullable().optional() })).default([]),
    colors: z.array(z.any()).default([]),
    documents: z.array(z.any()).default([]),
});

type ModelFormData = z.infer<typeof stacerModelSchema>;

const CollapsibleCardHeader = ({ title, count, onAdd }: { title: string, count?: number, onAdd?: () => void }) => (
    <div className="flex items-center justify-between py-4 px-6 border-b bg-card select-none">
        <div className="flex items-center gap-3">
            <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full border shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors group-data-[state=open]:bg-muted">
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
                <Button type="button" variant="outline" size="sm" className="h-8 px-3 text-xs font-semibold hover:bg-accent hover:text-accent-foreground transition-colors" onClick={(e) => { e.stopPropagation(); onAdd(); }}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Add
                </Button>
            )}
        </div>
    </div>
);

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
                                <Image src={coverImageUrl} alt="Cover" fill className="object-contain p-4" sizes="(max-width: 1024px) 100vw, 50vw" />
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
                                            const url = await uploadFileToStorage(storage, file, `models/${model.id}/cover-${Date.now()}`);
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
                                    <Image src={url} alt={`Gallery ${index}`} fill className="object-cover" sizes="(max-width: 768px) 33vw, 15vw" />
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
                                            const url = await uploadFileToStorage(storage!, file, `models/${model.id}/gallery/${Date.now()}-${file.name}`);
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
                                                <SelectTrigger className="w-[200px] h-8 font-bold border-none shadow-none bg-transparent hover:bg-accent hover:text-accent-foreground transition-colors">
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

export function StacerModelEditor({ model, isModuleView }: { model: any, isModuleView?: boolean }) {
    const { control, watch } = useFormContext<ModelFormData>();
    const [bulkFeatures, setBulkFeatures] = useState('');

    const { fields: specFields, append: appendSpec, remove: removeSpec } = useFieldArray({ control, name: "specifications.otherSpecs" });
    const { fields: featureFields, append: appendFeature, remove: removeFeature, replace: replaceFeatures } = useFieldArray({ control, name: "standardFeatures" });
    const { fields: optionalFields, append: appendOptional, remove: removeOptional } = useFieldArray({ control, name: "optionalFeatures" });

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
                                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 opacity-0 group-hover/feat:opacity-100 text-destructive hover:bg-destructive/10 transition-opacity" onClick={() => removeFeature(index)}><Trash2 className="h-4 w-4" /></Button>
                                </div>
                            ))}
                        </div>
                        <Separator />
                        <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
                            <Label className="text-xs font-bold uppercase text-muted-foreground tracking-widest">Bulk Import</Label>
                            <Textarea placeholder="Paste one feature per line here..." className="bg-background min-h-[100px]" value={bulkFeatures} onChange={(e) => setBulkFeatures(e.target.value)} />
                            <Button type="button" variant="secondary" size="sm" className="w-full font-bold h-9 hover:bg-accent hover:text-accent-foreground transition-colors" onClick={() => { 
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
                        title="Optional Features" 
                        count={optionalFields.length}
                        onAdd={() => appendOptional({ id: `opt-${Date.now()}`, name: '', cost: null, sellPriceExclGst: null })}
                    />
                    <CollapsibleContent>
                        <CardContent className="space-y-4 pt-6">
                            {optionalFields.map((field, index) => (
                                <div key={field.id} className="flex gap-4 items-end border-b pb-4 last:border-0 group/item">
                                    <FormField control={control} name={`optionalFeatures.${index}.name`} render={({ field }) => <FormItem className="flex-1"><FormLabel className="text-[10px] font-bold uppercase text-muted-foreground">Feature</FormLabel><Input {...field} className="h-9" /></FormItem>} />
                                    <FormField control={control} name={`optionalFeatures.${index}.cost`} render={({ field }) => <FormItem className="w-32"><FormLabel className="text-[10px] font-bold uppercase text-muted-foreground">Cost (excl.)</FormLabel><Input type="number" {...field} value={field.value ?? ''} className="h-9" /></FormItem>} />
                                    <FormField control={control} name={`optionalFeatures.${index}.sellPriceExclGst`} render={({ field }) => <FormItem className="w-32"><FormLabel className="text-[10px] font-bold uppercase text-muted-foreground">Sell (excl.)</FormLabel><Input type="number" {...field} value={field.value ?? ''} className="h-9" /></FormItem>} />
                                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive opacity-0 group-hover/item:opacity-100 transition-opacity hover:bg-destructive/10" onClick={() => removeOptional(index)}><Trash2 className="h-4 w-4" /></Button>
                                </div>
                            ))}
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>
        </div>
    );
}

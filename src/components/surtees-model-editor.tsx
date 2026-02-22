'use client';

import { useState } from 'react';
import { useFieldArray, useWatch, useFormContext } from 'react-hook-form';
import { z } from 'zod';
import Image from 'next/image';
import { useStorage } from '@/firebase/provider';
import { uploadFileWithProgress } from '@/firebase/storage';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { PlusCircle, Trash2, ChevronRight, X, Image as ImageIcon, Plus } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';

export const surteesModelSchema = z.object({
    coverImageUrl: z.string().nullable().optional(),
    galleryImageUrls: z.array(z.string()).default([]),
    cost: z.number().nullable().optional(),
    sellPriceExclGst: z.number().nullable().optional(),
    freightCostExclGst: z.number().nullable().optional(),
    specifications: z.object({
        motorConfigurations: z.array(z.any()).default([]),
        otherSpecs: z.array(z.object({ id: z.string(), label: z.string(), value: z.string() })).default([]),
    }).optional(),
    standardFeatures: z.array(z.string()).default([]),
    packages: z.array(z.any()).default([]),
    documents: z.array(z.any()).default([]),
});

type ModelFormData = z.infer<typeof surteesModelSchema>;

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

export function SurteesModelEditor({ model }: { model: any }) {
    const { control, watch, setValue } = useFormContext<ModelFormData>();
    const storage = useStorage();
    const [isCoverUploading, setIsCoverUploading] = useState(false);
    const [isGalleryUploading, setIsGalleryUploading] = useState(false);
    const [bulkFeatures, setBulkFeatures] = useState('');

    const { fields: specFields, append: appendSpec, remove: removeSpec } = useFieldArray({ control, name: "specifications.otherSpecs" });
    const { fields: featureFields, append: appendFeature, remove: removeFeature, replace: replaceFeatures } = useFieldArray({ control, name: "standardFeatures" });
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
        </div>
    );
}

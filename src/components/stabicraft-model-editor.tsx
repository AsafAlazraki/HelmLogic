'use client';

import * as React from 'react';
import { useState } from 'react';
import { useFieldArray, useWatch, useController, useFormContext } from 'react-hook-form';
import { z } from 'zod';
import Image from 'next/image';
import { useStorage } from '@/firebase/provider';
import { uploadFileWithProgress } from '@/firebase/storage';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { FormField, FormItem, FormLabel, FormMessage, FormControl } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, PlusCircle, Trash2, ChevronRight, X, Image as ImageIcon, Plus, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';

const GST_RATE = 0.10;

export const stabicraftModelSchema = z.object({
    coverImageUrl: z.string().nullable().optional(),
    galleryImageUrls: z.array(z.string()).default([]),
    packageLevels: z.array(z.object({
        id: z.string(),
        name: z.string().min(1, 'Name is required'),
        description: z.string().optional(),
        cost: z.coerce.number().nullable().optional(),
        sellPriceExclGst: z.coerce.number().nullable().optional(),
    })).default([]),
    optionalFeatures: z.array(z.object({
        id: z.string(),
        name: z.string().min(1, 'Name is required'),
        category: z.string().optional(),
        packageStatus: z.record(z.string(), z.enum(['standard', 'optional', 'na'])).default({}),
    })).default([]),
    colorStages: z.object({
        stage0: z.boolean().default(false),
        stage1: z.boolean().default(false),
        stage2: z.boolean().default(false),
        stage3: z.boolean().default(false),
    }).optional().nullable(),
    uDekOptions: z.object({
        blackOnWinterGrey: z.string().nullable().optional(),
        teakOnBlack: z.string().nullable().optional(),
        steelGreyOnWinterGrey: z.string().nullable().optional(),
        winterGreyOnSteelGrey: z.string().nullable().optional(),
    }).optional().nullable(),
    paintAndGraphicOptions: z.object({
        standardGloss: z.array(z.any()).default([]),
        standardMetallic: z.array(z.any()).default([]),
        powderCoating: z.array(z.any()).default([]),
    }).optional().nullable(),
    specifications: z.object({
        motorConfigurations: z.array(z.any()).default([]),
        otherSpecs: z.array(z.object({ id: z.string(), label: z.string(), value: z.string() })).default([]),
    }).optional(),
    standardFeatures: z.array(z.string()).default([]),
    documents: z.array(z.object({ id: z.string(), name: z.string(), url: z.string() })).default([]),
});

type ModelFormData = z.infer<typeof stabicraftModelSchema>;

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
            <FormLabel>{label}</FormLabel>
            <div className="grid grid-cols-2 gap-2 mt-2">
                <FormItem><FormLabel className="text-xs font-normal text-muted-foreground">excl. GST</FormLabel><FormControl><Input type="number" step="0.01" value={valueExcl ?? ''} onChange={handleExclChange} /></FormControl></FormItem>
                <FormItem><FormLabel className="text-xs font-normal text-muted-foreground">inc. GST</FormLabel><FormControl><Input type="number" step="0.01" value={valueIncl display ?? ''} onChange={handleInclChange} /></FormControl></FormItem>
            </div>
        </div>
    );
}

function PackageStatusToggle({ featureIndex, packageId }: { featureIndex: number, packageId: string }) {
    const { control } = useFormContext();
    const { field } = useController({ control, name: `optionalFeatures.${featureIndex}.packageStatus.${packageId}`, defaultValue: 'optional' });
    const toggleStatus = () => {
        if (field.value === 'optional') field.onChange('standard');
        else if (field.value === 'standard') field.onChange('na');
        else field.onChange('optional');
    };
    return (
        <Button type="button" variant={field.value === 'standard' ? 'default' : 'secondary'} className={cn("w-28", field.value === 'na' && 'opacity-50')} size="sm" onClick={toggleStatus}>
            {field.value === 'standard' ? 'Standard' : field.value === 'na' ? 'N/A' : 'Optional'}
        </Button>
    );
}

export function StabicraftModelEditor({ model }: { model: any }) {
    const { control, watch, setValue } = useFormContext<ModelFormData>();
    const storage = useStorage();
    
    const [categories, setCategories] = useState<string[]>([]);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [bulkFeatures, setBulkFeatures] = useState('');
    const [isCoverUploading, setIsCoverUploading] = useState(false);
    const [isGalleryUploading, setIsGalleryUploading] = useState(false);

    const { fields: specFields, append: appendSpec, remove: removeSpec } = useFieldArray({ control, name: "specifications.otherSpecs" });
    const { fields: featureFields, append: appendFeature, remove: removeFeature, replace: replaceFeatures } = useFieldArray({ control, name: "standardFeatures" });
    const { fields: packageLevelFields, append: appendPackageLevel, remove: removePackageLevel } = useFieldArray({ control, name: "packageLevels" });
    const { fields: optionalFeatureFields, append: appendOptionalFeature, remove: removeOptionalFeature } = useFieldArray({ control, name: "optionalFeatures" });
    const { fields: galleryFields, append: appendGalleryImage, remove: removeGalleryImage } = useFieldArray({ control, name: 'galleryImageUrls' });
    
    const watchedOptionalFeatures = useWatch({ control, name: 'optionalFeatures' });
    const watchedPackageLevels = useWatch({ control, name: 'packageLevels' });
    const coverImageUrl = watch("coverImageUrl");
    const galleryUrls = watch("galleryImageUrls") || [];

    React.useEffect(() => {
        if (watchedOptionalFeatures) {
            const currentCats = [...new Set(watchedOptionalFeatures.map((f: any) => f.category).filter(Boolean) as string[])];
            setCategories(currentCats);
        }
    }, [watchedOptionalFeatures]);

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

            <Collapsible asChild className="group" defaultOpen>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle>Package Levels</CardTitle>
                            <CardDescription>Configure base cost and sell pricing for tier levels.</CardDescription>
                        </div>
                        <div className="flex gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => appendPackageLevel({ id: `pkg-${Date.now()}`, name: '', description: '', cost: null, sellPriceExclGst: null })}><PlusCircle className="mr-2 h-4 w-4" />Add Level</Button>
                            <CollapsibleTrigger asChild><Button variant="ghost" size="icon"><ChevronRight className="h-5 w-5 transition-transform duration-200 group-data-[state=open]:rotate-90" /></Button></CollapsibleTrigger>
                        </div>
                    </CardHeader>
                    <CollapsibleContent>
                        <CardContent className="space-y-4">
                            {packageLevelFields.map((field, index) => (
                                <div key={field.id} className="p-4 border rounded-md space-y-4 bg-muted/30">
                                    <div className="flex gap-4">
                                        <FormField control={control} name={`packageLevels.${index}.name`} render={({ field }) => ( <FormItem className="flex-1"><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl></FormItem> )} />
                                        <Button type="button" variant="ghost" size="icon" className="mt-8" onClick={() => removePackageLevel(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <GstInputPair control={control} name={`packageLevels.${index}.cost`} label="Cost" />
                                        <GstInputPair control={control} name={`packageLevels.${index}.sellPriceExclGst`} label="Sell" />
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            <Collapsible asChild className="group" defaultOpen>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle>Features & Packaging</CardTitle>
                            <CardDescription>Assign features to package levels or mark as optional.</CardDescription>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="flex gap-2">
                                <Input placeholder="New Category" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} className="w-40 h-8" />
                                <Button type="button" size="sm" onClick={() => { if(newCategoryName) { setCategories([...categories, newCategoryName]); setNewCategoryName(''); }}}>Add Category</Button>
                            </div>
                            <CollapsibleTrigger asChild><Button variant="ghost" size="icon"><ChevronRight className="h-5 w-5 transition-transform duration-200 group-data-[state=open]:rotate-90" /></Button></CollapsibleTrigger>
                        </div>
                    </CardHeader>
                    <CollapsibleContent>
                        <CardContent className="space-y-6">
                            {categories.map(cat => (
                                <div key={cat} className="space-y-2 border rounded-lg p-4 bg-muted/10">
                                    <div className="flex justify-between items-center border-b pb-2">
                                        <h3 className="font-bold">{cat}</h3>
                                        <Button type="button" variant="outline" size="sm" onClick={() => appendOptionalFeature({ id: `feat-${Date.now()}`, name: '', category: cat, packageStatus: {}})}><PlusCircle className="h-4 w-4 mr-2" />Add Feature</Button>
                                    </div>
                                    <Table>
                                        <TableHeader><TableRow><TableHead>Feature</TableHead>{watchedPackageLevels.map((p: any) => <TableHead key={p.id} className="text-center">{p.name}</TableHead>)}<TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                                        <TableBody>
                                            {optionalFeatureFields.map((field, idx) => watchedOptionalFeatures[idx]?.category === cat && (
                                                <TableRow key={field.id} className="hover:bg-muted/50">
                                                    <TableCell><FormField control={control} name={`optionalFeatures.${idx}.name`} render={({ field }) => <Input {...field} className="border-none bg-transparent h-8" />} /></TableCell>
                                                    {watchedPackageLevels.map((p: any) => <TableCell key={p.id} className="text-center"><PackageStatusToggle featureIndex={idx} packageId={p.id} /></TableCell>)}
                                                    <TableCell className="text-right"><Button type="button" variant="ghost" size="icon" onClick={() => removeOptionalFeature(idx)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            ))}
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>
        </div>
    );
}

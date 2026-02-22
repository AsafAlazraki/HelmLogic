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
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, PlusCircle, Trash2, ChevronRight, X, Image as ImageIcon, Plus, Upload, Palette, Layers, Grid3X3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
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
        standardGloss: z.array(z.object({ id: z.string(), paint: z.string(), graphics: z.string(), imageUrl: z.string().optional() })).default([]),
        standardMetallic: z.array(z.object({ id: z.string(), paint: z.string(), graphics: z.string(), imageUrl: z.string().optional() })).default([]),
        powderCoating: z.array(z.object({ id: z.string(), color: z.string(), imageUrl: z.string().optional() })).default([]),
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

function PackageStatusToggle({ featureIndex, packageId }: { featureIndex: number, packageId: string }) {
    const { control } = useFormContext();
    const { field } = useController({ control, name: `optionalFeatures.${featureIndex}.packageStatus.${packageId}`, defaultValue: 'optional' });
    const toggleStatus = () => {
        if (field.value === 'optional') field.onChange('standard');
        else if (field.value === 'standard') field.onChange('na');
        else field.onChange('optional');
    };
    return (
        <Button 
            type="button" 
            variant={field.value === 'standard' ? 'default' : field.value === 'na' ? 'ghost' : 'outline'} 
            className={cn("w-full h-8 text-[10px] font-bold uppercase", field.value === 'na' && 'opacity-30')} 
            onClick={toggleStatus}
        >
            {field.value === 'standard' ? 'Standard' : field.value === 'na' ? 'N/A' : 'Optional'}
        </Button>
    );
}

function UdekUploader({ patternId, label }: { patternId: string, label: string }) {
    const { control, setValue } = useFormContext<ModelFormData>();
    const storage = useStorage();
    const [isUploading, setIsUploading] = useState(false);
    const imageUrl = useWatch({ control, name: `uDekOptions.${patternId}` as any });

    return (
        <div className="space-y-2">
            <Label className="text-xs font-semibold">{label}</Label>
            <div className="relative aspect-video rounded-md border-2 border-dashed bg-muted/20 overflow-hidden group">
                {isUploading && <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20"><Loader2 className="h-6 w-6 animate-spin text-white" /></div>}
                {imageUrl ? (
                    <>
                        <Image src={imageUrl} alt={label} fill className="object-cover" />
                        <Button type="button" variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setValue(`uDekOptions.${patternId}` as any, null)}><X className="h-3 w-3" /></Button>
                    </>
                ) : (
                    <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-secondary/50">
                        <Upload className="h-5 w-5 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground mt-1">Upload Render</span>
                        <FormControl><Input type="file" className="hidden" accept="image/*" onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file && storage) {
                                setIsUploading(true);
                                try {
                                    const url = await uploadFileWithProgress(storage, file, `models/udek/${Date.now()}-${file.name}`, () => {});
                                    setValue(`uDekOptions.${patternId}` as any, url);
                                } finally { setIsUploading(false); }
                            }
                        }} /></FormControl>
                    </label>
                )}
            </div>
        </div>
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
    
    const { fields: glossFields, append: appendGloss } = useFieldArray({ control, name: 'paintAndGraphicOptions.standardGloss' });
    const { fields: metallicFields, append: appendMetallic } = useFieldArray({ control, name: 'paintAndGraphicOptions.standardMetallic' });
    const { fields: powderFields, append: appendPowder } = useFieldArray({ control, name: 'paintAndGraphicOptions.powderCoating' });

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
        <div className="space-y-8 max-w-full overflow-x-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-7 gap-8 items-start">
                {/* Main Column */}
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

                {/* Sidebar Column */}
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
                                        <span className="text-[10px] text-muted-foreground mt-1 px-4 text-center">Transparent PNG recommended</span>
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

                    {/* Stabicraft Color Stages Card */}
                    <Collapsible asChild className="group overflow-hidden rounded-xl border bg-card shadow-sm">
                        <Card className="border-none shadow-none rounded-none">
                            <CollapsibleCardHeader title="Color Stages" />
                            <CollapsibleContent>
                                <CardContent className="pt-6 space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        {['stage0', 'stage1', 'stage2', 'stage3'].map((stage, i) => (
                                            <FormField key={stage} control={control} name={`colorStages.${stage}` as any} render={({ field }) => (
                                                <div className="flex items-center space-x-3 p-3 rounded-md border bg-muted/10">
                                                    <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                                    <Label className="text-xs font-bold uppercase cursor-pointer">Stage {i}</Label>
                                                </div>
                                            )} />
                                        ))}
                                    </div>
                                </CardContent>
                            </CollapsibleContent>
                        </Card>
                    </Collapsible>
                </div>
            </div>

            {/* Full Width Section: Package Levels */}
            <Collapsible asChild className="group overflow-hidden rounded-xl border bg-card shadow-sm" defaultOpen>
                <Card className="border-none shadow-none rounded-none">
                    <CardHeader className="flex flex-row items-center justify-between py-4 px-6 border-b select-none">
                        <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                                <CardTitle className="text-lg font-bold">Package Levels</CardTitle>
                                <span className="text-sm font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{packageLevelFields.length}</span>
                            </div>
                            <CardDescription>Configure base pricing for tiered models.</CardDescription>
                        </div>
                        <div className="flex gap-2">
                            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => appendPackageLevel({ id: `pkg-${Date.now()}`, name: '', description: '', cost: null, sellPriceExclGst: null })}><PlusCircle className="mr-2 h-4 w-4" />Add Level</Button>
                            <CollapsibleTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 rounded-full"><ChevronRight className="h-5 w-5 transition-transform duration-200 group-data-[state=open]:rotate-90" /></Button></CollapsibleTrigger>
                        </div>
                    </CardHeader>
                    <CollapsibleContent>
                        <CardContent className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pt-6">
                            {packageLevelFields.map((field, index) => (
                                <Card key={field.id} className="relative bg-muted/5 p-5 border-2 hover:border-primary/20 transition-all">
                                    <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 h-7 w-7 text-destructive" onClick={() => removePackageLevel(index)}><Trash2 className="h-4 w-4" /></Button>
                                    <div className="space-y-4">
                                        <FormField control={control} name={`packageLevels.${index}.name`} render={({ field }) => ( <FormItem><FormLabel className="text-xs font-bold uppercase tracking-widest">Level Name</FormLabel><FormControl><Input placeholder="e.g. Adventure" className="h-10 font-bold" {...field} /></FormControl></FormItem> )} />
                                        <Separator />
                                        <GstInputPair control={control} name={`packageLevels.${index}.cost`} label="Factory Cost" />
                                        <GstInputPair control={control} name={`packageLevels.${index}.sellPriceExclGst`} label="Retail Sell Price" />
                                    </div>
                                </Card>
                            ))}
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            {/* Full Width Section: Features & Packaging */}
            <Collapsible asChild className="group overflow-hidden rounded-xl border bg-card shadow-sm" defaultOpen>
                <Card className="border-none shadow-none rounded-none">
                    <CardHeader className="flex flex-row items-center justify-between py-4 px-6 border-b select-none">
                        <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                                <CardTitle className="text-lg font-bold">Features & Packaging</CardTitle>
                                <Grid3X3 className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <CardDescription>Assign feature availability across package tiers.</CardDescription>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="flex gap-2 p-1 bg-muted rounded-md">
                                <Input placeholder="New Category" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} className="w-48 h-8 text-xs bg-background" />
                                <Button type="button" size="sm" className="h-8 text-xs" onClick={() => { if(newCategoryName) { setCategories([...categories, newCategoryName]); setNewCategoryName(''); }}}>Add Category</Button>
                            </div>
                            <CollapsibleTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 rounded-full"><ChevronRight className="h-5 w-5 transition-transform duration-200 group-data-[state=open]:rotate-90" /></Button></CollapsibleTrigger>
                        </div>
                    </CardHeader>
                    <CollapsibleContent>
                        <CardContent className="space-y-10 pt-8">
                            {categories.length > 0 ? categories.map(cat => (
                                <div key={cat} className="space-y-4">
                                    <div className="flex justify-between items-center bg-muted/30 p-3 rounded-lg border-l-4 border-primary">
                                        <h3 className="font-black text-sm uppercase tracking-tighter">{cat}</h3>
                                        <Button type="button" variant="outline" size="sm" className="h-7 text-[10px] font-bold" onClick={() => appendOptionalFeature({ id: `feat-${Date.now()}`, name: '', category: cat, packageStatus: {}})}><PlusCircle className="h-3 w-3 mr-1.5" />Add Feature</Button>
                                    </div>
                                    <div className="rounded-xl border shadow-sm overflow-hidden bg-background">
                                        <Table>
                                            <TableHeader className="bg-muted/20">
                                                <TableRow>
                                                    <TableHead className="w-[300px] font-bold">Feature Description</TableHead>
                                                    {watchedPackageLevels.map((p: any) => <TableHead key={p.id} className="text-center font-bold">{p.name}</TableHead>)}
                                                    <TableHead className="text-right w-12"></TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {optionalFeatureFields.map((field, idx) => watchedOptionalFeatures[idx]?.category === cat && (
                                                    <TableRow key={field.id} className="hover:bg-muted/5 group/row transition-colors">
                                                        <TableCell className="p-2">
                                                            <FormField control={control} name={`optionalFeatures.${idx}.name`} render={({ field }) => <Input {...field} className="border-none shadow-none bg-transparent h-8 font-medium focus-visible:ring-0 focus-visible:bg-muted/30" placeholder="Feature Name" />} />
                                                        </TableCell>
                                                        {watchedPackageLevels.map((p: any) => (
                                                            <TableCell key={p.id} className="p-2 text-center">
                                                                <div className="max-w-[120px] mx-auto">
                                                                    <PackageStatusToggle featureIndex={idx} packageId={p.id} />
                                                                </div>
                                                            </TableCell>
                                                        ))}
                                                        <TableCell className="text-right p-2">
                                                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover/row:opacity-100 text-destructive transition-opacity" onClick={() => removeOptionalFeature(idx)}><Trash2 className="h-3.5 w-3.5" /></Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>
                            )) : (
                                <div className="text-center py-12 border-2 border-dashed rounded-2xl bg-muted/5">
                                    <Layers className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
                                    <p className="text-sm font-medium text-muted-foreground">No feature categories defined. Add one above to get started.</p>
                                </div>
                            )}
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            {/* Full Width Section: U-Dek Flooring */}
            <Collapsible asChild className="group overflow-hidden rounded-xl border bg-card shadow-sm">
                <Card className="border-none shadow-none rounded-none">
                    <CollapsibleCardHeader title="U-Dek Flooring Options" />
                    <CollapsibleContent>
                        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-6">
                            <UdekUploader patternId="blackOnWinterGrey" label="Black on Winter Grey" />
                            <UdekUploader patternId="teakOnBlack" label="Teak on Black" />
                            <UdekUploader patternId="steelGreyOnWinterGrey" label="Steel Grey on Winter Grey" />
                            <UdekUploader patternId="winterGreyOnSteelGrey" label="Winter Grey on Steel Grey" />
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            {/* Full Width Section: Paint & Graphics */}
            <Collapsible asChild className="group overflow-hidden rounded-xl border bg-card shadow-sm">
                <Card className="border-none shadow-none rounded-none">
                    <CardHeader className="flex flex-row items-center justify-between py-4 px-6 border-b select-none">
                        <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                                <CardTitle className="text-lg font-bold">Paint & Graphic Options</CardTitle>
                                <Palette className="h-4 w-4 text-muted-foreground" />
                            </div>
                        </div>
                        <CollapsibleTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 rounded-full"><ChevronRight className="h-5 w-5 transition-transform duration-200 group-data-[state=open]:rotate-90" /></Button></CollapsibleTrigger>
                    </CardHeader>
                    <CollapsibleContent>
                        <CardContent className="pt-8 space-y-10">
                            {/* Gloss Options */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-center border-b pb-2">
                                    <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Standard Gloss</h3>
                                    <Button type="button" variant="outline" size="sm" onClick={() => appendGloss({ id: `gloss-${Date.now()}`, paint: '', graphics: '' })}><Plus className="h-3.5 w-3.5 mr-1.5" />Add Gloss Option</Button>
                                </div>
                                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {glossFields.map((field, index) => (
                                        <Card key={field.id} className="p-4 bg-muted/10 relative group/paint">
                                            <div className="grid gap-3">
                                                <FormField control={control} name={`paintAndGraphicOptions.standardGloss.${index}.paint`} render={({ field }) => <FormItem><FormLabel className="text-[10px] font-bold uppercase">Paint Color</FormLabel><Input {...field} className="h-8" /></FormItem>} />
                                                <FormField control={control} name={`paintAndGraphicOptions.standardGloss.${index}.graphics`} render={({ field }) => <FormItem><FormLabel className="text-[10px] font-bold uppercase">Graphics</FormLabel><Input {...field} className="h-8" /></FormItem>} />
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            </div>

                            {/* Metallic Options */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-center border-b pb-2">
                                    <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Standard Metallic</h3>
                                    <Button type="button" variant="outline" size="sm" onClick={() => appendMetallic({ id: `met-${Date.now()}`, paint: '', graphics: '' })}><Plus className="h-3.5 w-3.5 mr-1.5" />Add Metallic Option</Button>
                                </div>
                                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {metallicFields.map((field, index) => (
                                        <Card key={field.id} className="p-4 bg-muted/10 relative group/paint">
                                            <div className="grid gap-3">
                                                <FormField control={control} name={`paintAndGraphicOptions.standardMetallic.${index}.paint`} render={({ field }) => <FormItem><FormLabel className="text-[10px] font-bold uppercase">Paint Color</FormLabel><Input {...field} className="h-8" /></FormItem>} />
                                                <FormField control={control} name={`paintAndGraphicOptions.standardMetallic.${index}.graphics`} render={({ field }) => <FormItem><FormLabel className="text-[10px] font-bold uppercase">Graphics</FormLabel><Input {...field} className="h-8" /></FormItem>} />
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            </div>

                            {/* Powder Coating */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-center border-b pb-2">
                                    <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Powder Coating</h3>
                                    <Button type="button" variant="outline" size="sm" onClick={() => appendPowder({ id: `pwd-${Date.now()}`, color: '' })}><Plus className="h-3.5 w-3.5 mr-1.5" />Add Powder Coating</Button>
                                </div>
                                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {powderFields.map((field, index) => (
                                        <Card key={field.id} className="p-4 bg-muted/10 relative group/paint">
                                            <FormField control={control} name={`paintAndGraphicOptions.powderCoating.${index}.color`} render={({ field }) => <FormItem><FormLabel className="text-[10px] font-bold uppercase">Color Name</FormLabel><Input {...field} className="h-8" /></FormItem>} />
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>
        </div>
    );
}

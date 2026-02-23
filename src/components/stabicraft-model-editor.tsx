'use client';

import * as React from 'react';
import { useState } from 'react';
import { useFieldArray, useWatch, useController, useFormContext } from 'react-hook-form';
import { z } from 'zod';
import Image from 'next/image';
import { useStorage } from '@/firebase/provider';
import { uploadFileToStorage } from '@/firebase/storage';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardTitle, CardHeader } from '@/components/ui/card';
import { FormField, FormItem, FormLabel, FormMessage, FormControl } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Trash2, ChevronDown, X, Image as ImageIcon, Plus, Upload, PlusCircle, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
    uDekOptions: z.object({
        blackOnWinterGrey: z.string().nullable().optional(),
        teakOnBlack: z.string().nullable().optional(),
        steelGreyOnWinterGrey: z.string().nullable().optional(),
        winterGreyOnSteelGrey: z.string().nullable().optional(),
    }).optional().nullable(),
    paintAndGraphicOptions: z.object({
        standardGloss: z.array(z.object({ id: z.string(), paint: z.string(), graphics: z.string(), imageUrl: z.string().optional() })).default([]),
        standardMetallic: z.array(z.object({ id: z.string(), paint: z.string(), graphics: z.string(), imageUrl: z.string().optional() })).default([]),
        powderCoating: z.array(z.object({ 
            id: z.string(), 
            color: z.string().default(''), 
            imageUrl: z.string().optional() 
        })).default([]),
    }).optional().nullable(),
    specifications: z.object({
        motorConfigurations: z.array(z.any()).default([]),
        otherSpecs: z.array(z.object({ id: z.string(), label: z.string(), value: z.string() })).default([]),
    }).optional(),
    standardFeatures: z.array(z.string()).default([]),
    documents: z.array(z.object({ id: z.string(), name: z.string(), url: z.string() })).default([]),
});

type ModelFormData = z.infer<typeof stabicraftModelSchema>;

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
                        <Image src={imageUrl} alt={label} fill className="object-cover" sizes="(max-width: 768px) 50vw, 25vw" />
                        <Button type="button" variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setValue(`uDekOptions.${patternId}` as any, null)}><X className="h-3 w-3" /></Button>
                    </>
                ) : (
                    <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-secondary/50">
                        <Upload className="h-5 w-5 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground mt-1 uppercase font-bold">Swatch</span>
                        <FormControl><Input type="file" className="hidden" accept="image/*" onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file && storage) {
                                setIsUploading(true);
                                try {
                                    const url = await uploadFileToStorage(storage, file, `models/udek/${Date.now()}-${file.name}`);
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

export function StabicraftModelEditor({ model, isModuleView }: { model: any, isModuleView?: boolean }) {
    const { control, watch } = useFormContext<ModelFormData>();
    
    const [categories, setCategories] = useState<string[]>([]);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [bulkFeatures, setBulkFeatures] = useState('');

    const { fields: specFields, append: appendSpec, remove: removeSpec } = useFieldArray({ control, name: "specifications.otherSpecs" });
    const { fields: featureFields, append: appendFeature, remove: removeFeature, replace: replaceFeatures } = useFieldArray({ control, name: "standardFeatures" });
    const { fields: packageLevelFields, append: appendPackageLevel, remove: removePackageLevel } = useFieldArray({ control, name: "packageLevels" });
    const { fields: optionalFeatureFields, append: appendOptionalFeature, remove: removeOptionalFeature } = useFieldArray({ control, name: "optionalFeatures" });
    
    const { fields: glossFields, append: appendGloss } = useFieldArray({ control, name: 'paintAndGraphicOptions.standardGloss' });
    const { fields: metallicFields, append: appendMetallic } = useFieldArray({ control, name: 'paintAndGraphicOptions.standardMetallic' });
    const { fields: powderFields, append: appendPowder } = useFieldArray({ control, name: 'paintAndGraphicOptions.powderCoating' });

    const watchedOptionalFeatures = useWatch({ control, name: 'optionalFeatures' });
    const watchedPackageLevels = useWatch({ control, name: 'packageLevels' });

    React.useEffect(() => {
        if (watchedOptionalFeatures) {
            const currentCats = [...new Set(watchedOptionalFeatures.map((f: any) => f.category).filter(Boolean) as string[])];
            setCategories(currentCats);
        }
    }, [watchedOptionalFeatures]);

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
                        title="Package Levels" 
                        count={packageLevelFields.length}
                        onAdd={() => appendPackageLevel({ id: `pkg-${Date.now()}`, name: '', description: '', cost: null, sellPriceExclGst: null })}
                    />
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

            <Collapsible asChild className="group overflow-hidden rounded-xl border bg-card shadow-sm" defaultOpen>
                <Card className="border-none shadow-none rounded-none">
                    <CollapsibleCardHeader 
                        title="Features & Packaging" 
                        count={categories.length}
                    />
                    <CollapsibleContent>
                        <CardContent className="space-y-10 pt-8">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="flex gap-2 p-1 bg-muted rounded-md">
                                    <Input placeholder="New Category Name" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} className="w-48 h-8 text-xs bg-background" />
                                    <Button type="button" size="sm" className="h-8 text-xs" onClick={() => { if(newCategoryName) { setCategories([...categories, newCategoryName]); setNewCategoryName(''); }}}>Add Category</Button>
                                </div>
                            </div>
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

            <Collapsible asChild className="group overflow-hidden rounded-xl border bg-card shadow-sm">
                <Card className="border-none shadow-none rounded-none">
                    <CollapsibleCardHeader title="Paint & Graphic Options" />
                    <CollapsibleContent>
                        <CardContent className="pt-8 space-y-10">
                            <div className="space-y-4">
                                <div className="flex justify-between items-center border-b pb-2">
                                    <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Standard Gloss</h3>
                                    <Button type="button" variant="outline" size="sm" onClick={() => appendGloss({ id: `gloss-${Date.now()}`, paint: '', graphics: '' })}><Plus className="h-3.5 w-3.5 mr-1.5" />Add Gloss Option</Button>
                                </div>
                                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {glossFields.map((field, index) => (
                                        <Card key={field.id} className="p-4 bg-muted/10 relative group/paint">
                                            <div className="grid gap-3">
                                                <FormField control={control} name={`paintAndGraphicOptions.standardGloss.${index}.paint`} render={({ field }) => <Input {...field} className="h-8" placeholder="Paint Color" />} />
                                                <FormField control={control} name={`paintAndGraphicOptions.standardGloss.${index}.graphics`} render={({ field }) => <Input {...field} className="h-8" placeholder="Graphics" />} />
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center border-b pb-2">
                                    <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Standard Metallic</h3>
                                    <Button type="button" variant="outline" size="sm" onClick={() => appendMetallic({ id: `met-${Date.now()}`, paint: '', graphics: '' })}><Plus className="h-3.5 w-3.5 mr-1.5" />Add Metallic Option</Button>
                                </div>
                                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {metallicFields.map((field, index) => (
                                        <Card key={field.id} className="p-4 bg-muted/10 relative group/paint">
                                            <div className="grid gap-3">
                                                <FormField control={control} name={`paintAndGraphicOptions.standardMetallic.${index}.paint`} render={({ field }) => <Input {...field} className="h-8" placeholder="Paint Color" />} />
                                                <FormField control={control} name={`paintAndGraphicOptions.standardMetallic.${index}.graphics`} render={({ field }) => <Input {...field} className="h-8" placeholder="Graphics" />} />
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center border-b pb-2">
                                    <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Powder Coating</h3>
                                    <Button type="button" variant="outline" size="sm" onClick={() => appendPowder({ id: `pwd-${Date.now()}`, color: '' })}><Plus className="h-3.5 w-3.5 mr-1.5" />Add Powder Coating</Button>
                                </div>
                                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {powderFields.map((field, index) => (
                                        <Card key={field.id} className="p-4 bg-muted/10 relative group/paint">
                                            <FormField control={control} name={`paintAndGraphicOptions.powderCoating.${index}.color`} render={({ field }) => <Input {...field} className="h-8" placeholder="Color Name" />} />
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

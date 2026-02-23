'use client';

import { useState, useEffect } from 'react';
import { useFieldArray, useWatch, useController, useFormContext } from 'react-hook-form';
import { z } from 'zod';
import Image from 'next/image';
import { useStorage } from '@/firebase/provider';
import { uploadFileToStorage } from '@/firebase/storage';

import { Card, CardContent, CardTitle, CardHeader } from '@/components/ui/card';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2, ChevronDown, X, Image as ImageIcon, Plus, Upload, PlusCircle, Layers } from 'lucide-react';
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
    modelCode: z.string().min(1, 'Model Code is required'),
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
        {onAdd && (
            <Button type="button" variant="outline" size="sm" className="h-8 px-3 text-xs font-semibold hover:bg-accent hover:text-accent-foreground transition-colors" onClick={(e) => { e.stopPropagation(); onAdd(); }}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add
            </Button>
        )}
    </div>
);

function GstInputPair({ control, name, label }: { control: any; name: string; label: string }) {
    const { field } = useController({ control, name, defaultValue: null });
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
                    <FormControl><Input type="number" step="any" placeholder="0.00" className="h-9" value={valueExcl ?? ''} onChange={handleExclChange} /></FormControl>
                </FormItem>
                <FormItem className="space-y-1">
                    <FormLabel className="text-[10px] font-medium text-muted-foreground uppercase">inc. GST</FormLabel>
                    <FormControl><Input type="number" step="any" placeholder="0.00" className="h-9" value={valueInclDisplay} onChange={handleInclChange} /></FormControl>
                </FormItem>
            </div>
        </div>
    );
}

function VisualAssetsCard({ model, isModuleView }: { model: any, isModuleView: boolean }) {
    const { control, watch, setValue } = useFormContext<ModelFormData>();
    const storage = useStorage();
    const [isCoverUploading, setIsCoverUploading] = useState(false);
    const [isGalleryUploading, setIsGalleryUploading] = useState(false);
    
    const coverImageUrl = watch("coverImageUrl");
    const galleryUrls = watch("galleryImageUrls") || [];
    const { append: appendGalleryImage, remove: removeGalleryImage } = useFieldArray({ control, name: 'galleryImageUrls' });

    return (
        <Collapsible className="group overflow-hidden rounded-xl border bg-card shadow-sm" defaultOpen>
            <CollapsibleCardHeader title={isModuleView ? "Visual Config & Renders" : "Main Cover Image & Gallery"} count={galleryUrls.length + (coverImageUrl ? 1 : 0)} />
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
                                <span className="text-sm font-bold text-muted-foreground">{isModuleView ? "Upload Render" : "Set Primary Brand Image"}</span>
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

function JeanneauPackageItem({ index, remove }: { index: number, remove: (index: number) => void }) {
    const { control } = useFormContext<ModelFormData>();
    const name = useWatch({ control, name: `packages.${index}.name` });

    return (
        <Collapsible className="group/item overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="flex items-center justify-between p-4 bg-muted/20 border-b">
                <div className="flex items-center gap-3">
                    <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full border shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors group-data-[state=open]/item:bg-muted">
                            <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]/item:rotate-180" />
                        </Button>
                    </CollapsibleTrigger>
                    <span className="font-bold text-sm">{name || 'Unnamed Package'}</span>
                </div>
                <Button type="button" variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => remove(index)}>
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>
            <CollapsibleContent>
                <div className="p-6 grid md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                        <GstInputPair control={control} name={`packages.${index}.cost`} label="Factory Cost" />
                        <GstInputPair control={control} name={`packages.${index}.sellPriceExclGst`} label="Retail Sell Price" />
                    </div>
                    <div className="space-y-3">
                        <FormLabel className="text-xs font-bold uppercase text-muted-foreground">Included Features</FormLabel>
                        <FormField
                            control={control}
                            name={`packages.${index}.includedFeatures`}
                            render={({ field }) => (
                                <Textarea 
                                    className="min-h-[120px] bg-background" 
                                    placeholder="Describe what's in this package..." 
                                    value={Array.isArray(field.value) ? field.value.join('\n') : field.value}
                                    onChange={(e) => field.onChange(e.target.value.split('\n').filter(Boolean))}
                                />
                            )}
                        />
                    </div>
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}

export function JeanneauModelEditor({ model, isModuleView }: { model: any, isModuleView?: boolean }) {
    const { control, watch } = useFormContext<ModelFormData>();
    const [bulkFeatures, setBulkFeatures] = useState('');
    const [packageCategories, setPackageCategories] = useState<string[]>([]);
    const [newPackageCategory, setNewPackageCategory] = useState('');

    const { fields: specFields, append: appendSpec, remove: removeSpec } = useFieldArray({ control, name: "specifications.otherSpecs" });
    const { fields: featureFields, append: appendFeature, remove: removeFeature, replace: replaceFeatures } = useFieldArray({ control, name: "standardFeatures" });
    const { fields: packageFields, append: appendPackage, remove: removePackage } = useFieldArray({ control, name: "packages" });
    const { fields: colorFields, append: appendColor, remove: removeColor } = useFieldArray({ control, name: "colors" });

    const watchedPackages = useWatch({ control, name: 'packages' }) || [];

    useEffect(() => {
        if (watchedPackages) {
            const currentCats = [...new Set(watchedPackages.map((p: any) => p.category).filter(Boolean) as string[])];
            setPackageCategories(currentCats);
        }
    }, [watchedPackages]);

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
                        <VisualAssetsCard model={model} isModuleView={!!isModuleView} />
                    ) : (
                        <>
                            <SpecsSection />
                            <FeaturesSection />
                        </>
                    )}
                </div>
                <div className={cn("space-y-8", isModuleView ? "lg:col-span-4 lg:order-2" : "lg:col-span-3 lg:order-2")}>
                    {isModuleView ? (
                        <>
                            <SpecsSection />
                            <FeaturesSection />
                        </>
                    ) : <VisualAssetsCard model={model} isModuleView={!!isModuleView} />}
                </div>
            </div>

            <Collapsible asChild className="group overflow-hidden rounded-xl border bg-card shadow-sm" defaultOpen>
                <Card className="border-none shadow-none rounded-none">
                    <CollapsibleCardHeader 
                        title="Model Packages" 
                        count={watchedPackages?.length || 0}
                    />
                    <CollapsibleContent>
                        <CardContent className="space-y-10 pt-8">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="flex gap-2 p-1 bg-muted rounded-md">
                                    <Input placeholder="New Category Name" value={newPackageCategory} onChange={(e) => setNewPackageCategory(e.target.value)} className="w-48 h-8 text-xs bg-background" />
                                    <Button type="button" size="sm" className="h-8 text-xs hover:bg-accent hover:text-accent-foreground transition-colors" onClick={() => { if(newPackageCategory) { setPackageCategories([...packageCategories, newPackageCategory]); setNewPackageCategory(''); }}}>Add Category</Button>
                                </div>
                            </div>
                            
                            {packageCategories.length > 0 ? packageCategories.map(cat => (
                                <Collapsible key={cat} className="space-y-4" defaultOpen>
                                    <div className="flex justify-between items-center bg-muted/30 p-3 rounded-lg border-l-4 border-primary">
                                        <div className="flex items-center gap-2">
                                            <CollapsibleTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-accent hover:text-accent-foreground transition-colors">
                                                    <ChevronDown className="h-4 w-4" />
                                                </Button>
                                            </CollapsibleTrigger>
                                            <h3 className="font-black text-sm uppercase tracking-tighter">{cat}</h3>
                                        </div>
                                        <Button type="button" variant="outline" size="sm" className="h-7 text-[10px] font-bold hover:bg-accent hover:text-accent-foreground transition-colors" onClick={() => appendPackage({ id: `pkg-${Date.now()}`, name: '', category: cat, includedFeatures: [] })}><PlusCircle className="h-3 w-3 mr-1.5" />Add Package</Button>
                                    </div>
                                    <CollapsibleContent className="space-y-4 pt-2">
                                        {packageFields.map((field, index) => watchedPackages[index]?.category === cat && (
                                            <JeanneauPackageItem key={field.id} index={index} remove={removePackage} />
                                        ))}
                                    </CollapsibleContent>
                                </Collapsible>
                            )) : (
                                <div className="text-center py-12 border-2 border-dashed rounded-2xl bg-muted/5">
                                    <Layers className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
                                    <p className="text-sm font-medium text-muted-foreground">No package categories defined. Add one above to get started.</p>
                                </div>
                            )}
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            <Collapsible asChild className="group overflow-hidden rounded-xl border bg-card shadow-sm" defaultOpen>
                <Card className="border-none shadow-none rounded-none">
                    <CollapsibleCardHeader 
                        title="Color Variants" 
                        count={colorFields.length}
                        onAdd={() => appendColor({ id: `col-${Date.now()}`, name: '', imageUrls: [] })}
                    />
                    <CollapsibleContent>
                        <CardContent className="pt-8 space-y-6">
                            {colorFields.map((field, index) => (
                                <Card key={field.id} className="p-5 border bg-muted/5">
                                    <div className="flex items-end gap-6">
                                        <FormField control={control} name={`colors.${index}.name`} render={({ field }) => ( <FormItem className="flex-1"><FormLabel className="text-xs font-bold uppercase text-muted-foreground">Variant Name</FormLabel><FormControl><Input placeholder="Color Name" className="h-9 font-bold" {...field} /></FormControl></FormItem> )} />
                                        <div className="flex-1">
                                            <GstInputPair control={control} name={`colors.${index}.sellPriceExclGst`} label="Upcharge (Sell)" />
                                        </div>
                                        <Button type="button" variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => removeColor(index)}><Trash2 className="h-4 w-4" /></Button>
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
'use client';

import { useState, useEffect } from 'react';
import { useFieldArray, useWatch, useController, useFormContext } from 'react-hook-form';
import { z } from 'zod';
import Image from 'next/image';
import { useStorage } from '@/firebase/provider';
import { uploadFileToStorage } from '@/firebase/storage';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField, FormItem, FormLabel, FormMessage, FormControl } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, X, Trash2, Upload, Image as ImageIcon, Plus, ChevronDown, Hash, Tag, Layers, Type } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from './ui/separator';
import { Label } from './ui/label';
import { ScrollArea } from './ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
    name: z.string().min(1, 'Display name is required'),
    code: z.string().optional().nullable(),
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
    code: z.string().optional(),
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
    modelCode: z.string().min(1, 'Model Code is required'),
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
    const { field, fieldState } = useController({ control, name, defaultValue: null });
    const valueExcl = field.value;
    const calculateIncl = (val: any) => {
        if (val === '' || val === null || val === undefined) return '';
        const num = typeof val === 'string' ? parseFloat(val) : val;
        if (isNaN(num)) return '';
        return (Math.round((num * (1 + GST_RATE)) * 100) / 100).toFixed(2);
    };
    const valueInclDisplay = calculateIncl(valueExcl);

    const handleExclChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (val === '') field.onChange(null);
        else {
            const num = parseFloat(val);
            if (!isNaN(num)) field.onChange(num);
        }
    };

    const handleInclChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (val === '') field.onChange(null);
        else {
            const num = parseFloat(val);
            if (!isNaN(num)) {
                const excl = num / (1 + GST_RATE);
                field.onChange(Math.round(excl * 100) / 100);
            }
        }
    };

    return (
        <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-1">
                {label}
            </Label>
            <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                    <Label className="text-[9px] font-bold text-muted-foreground/40 uppercase ml-0.5">Excl.</Label>
                    <div className="relative">
                        <div className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 text-[10px] font-bold">$</div>
                        <FormControl>
                            <Input 
                                type="number" 
                                step="any" 
                                placeholder="0.00" 
                                className="h-9 pl-5 text-xs font-bold bg-background border-muted transition-all focus-visible:ring-primary/10 focus-visible:border-primary" 
                                value={valueExcl ?? ''} 
                                onChange={handleExclChange} 
                            />
                        </FormControl>
                    </div>
                </div>
                <div className="space-y-1">
                    <Label className="text-[9px] font-bold text-muted-foreground/40 uppercase ml-0.5">Incl.</Label>
                    <div className="relative">
                        <div className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 text-[10px] font-bold">$</div>
                        <FormControl>
                            <Input 
                                type="number" 
                                step="any" 
                                placeholder="0.00" 
                                className="h-9 pl-5 text-xs font-bold bg-background border-muted transition-all focus-visible:ring-primary/10 focus-visible:border-primary" 
                                value={valueInclDisplay} 
                                onChange={handleInclChange} 
                            />
                        </FormControl>
                    </div>
                </div>
            </div>
             <FormMessage className="text-[9px] font-semibold">{fieldState.error && String(fieldState.error.message)}</FormMessage>
        </div>
    );
}

function PricingSummary({ pricing }: { pricing: any }) {
    const renderPrice = (material: 'HYP' | 'PVC') => {
        const p = pricing?.[material];
        if (!p) return null;
        
        const sell = p.sellPriceExclGst;
        const cost = p.cost;

        if (sell !== null && sell !== undefined && sell !== '') {
            return (
                <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-black text-muted-foreground/50 uppercase tracking-tighter">{material}</span>
                    <span className="text-xs font-black text-primary">${Number(sell).toLocaleString()}</span>
                </div>
            );
        }
        if (cost !== null && cost !== undefined && cost !== '') {
            return (
                <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-black text-muted-foreground/50 uppercase tracking-tighter">{material}</span>
                    <div className="flex items-center gap-1 bg-amber-500/10 px-1 rounded">
                        <span className="text-[8px] font-black text-amber-600 uppercase tracking-tighter">Cost</span>
                        <span className="text-xs font-black text-amber-600">${Number(cost).toLocaleString()}</span>
                    </div>
                </div>
            );
        }
        return null;
    };

    const hyp = renderPrice('HYP');
    const pvc = renderPrice('PVC');

    if (!hyp && !pvc) return null;

    return (
        <div className="flex items-center gap-4 ml-auto mr-4 group-data-[state=open]/item:hidden">
            {hyp}
            {pvc}
        </div>
    );
}

function ColorVariantItem({ index, remove }: { index: number; remove: (index: number) => void; }) {
  const { control } = useFormContext<ModelFormData>();
  const name = useWatch({ control, name: `colors.${index}.name` });
  const code = useWatch({ control, name: `colors.${index}.code` });
  const imageUrl = useWatch({ control, name: `colors.${index}.imageUrl` });
  const pricing = useWatch({ control, name: `colors.${index}.pricing` });
  const storage = useStorage();
  const [isUploading, setIsUploading] = useState(false);

  return (
    <Collapsible className="group/item overflow-hidden rounded-xl border bg-card shadow-sm transition-all hover:border-primary/20">
        <div className="flex items-center p-3 bg-muted/20 border-b">
            <div className="flex items-center gap-3 flex-grow">
                <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full border shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors group-data-[state=open]/item:bg-muted">
                        <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]/item:rotate-180" />
                    </Button>
                </CollapsibleTrigger>
                
                <div className="flex items-center gap-3">
                    <div className="relative h-10 w-14 rounded-md border-2 border-background overflow-hidden bg-background shadow-sm shrink-0">
                        {imageUrl ? (
                            <Image src={imageUrl} alt="Swatch" fill className="object-cover" />
                        ) : (
                            <div className="flex items-center justify-center h-full text-muted-foreground/30">
                                <ImageIcon className="h-4 w-4" />
                            </div>
                        )}
                    </div>
                    <div className="flex flex-col gap-0.5">
                        <span className="font-black text-sm tracking-tight text-foreground">{name || 'Unnamed Color Variant'}</span>
                        {code && <span className="text-[10px] w-fit font-mono font-bold text-muted-foreground uppercase bg-muted/50 px-1.5 rounded">{code}</span>}
                    </div>
                </div>

                <PricingSummary pricing={pricing} />
            </div>
            
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0 ml-2" onClick={() => remove(index)}>
                <Trash2 className="h-3.5 w-3.5" />
            </Button>
        </div>
        <CollapsibleContent>
            <div className="p-4">
                <div className="flex flex-row gap-6 items-start">
                    <div className="w-[200px] shrink-0">
                        <FormField
                            control={control}
                            name={`colors.${index}.imageUrl`}
                            render={({ field }) => (
                                <div className="space-y-2">
                                    <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Swatch / Render</Label>
                                    <div className="relative aspect-video w-full overflow-hidden rounded-lg border-2 border-dashed bg-muted/10 group/swatch">
                                        {isUploading && <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20"><Loader2 className="h-6 w-6 animate-spin text-white" /></div>}
                                        {imageUrl ? (
                                            <>
                                                <Image src={imageUrl} alt="Color" fill className="object-cover" />
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/swatch:opacity-100 transition-opacity flex items-center justify-center">
                                                    <Button type="button" variant="destructive" size="xs" className="h-6 text-[10px] px-2" onClick={() => field.onChange(null)}>Remove</Button>
                                                </div>
                                            </>
                                        ) : (
                                            <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-secondary/50 transition-colors">
                                                <Upload className="w-4 h-4 text-primary mb-1" />
                                                <span className="text-[8px] text-muted-foreground font-black uppercase">Upload</span>
                                                <FormControl><Input type="file" className="hidden" accept="image/*" onChange={async (e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file && storage) {
                                                        setIsUploading(true);
                                                        try {
                                                            const url = await uploadFileToStorage(storage, file, `colors/${Date.now()}-${file.name}`);
                                                            field.onChange(url);
                                                        } finally { setIsUploading(false); }
                                                    }
                                                }} /></FormControl>
                                            </label>
                                        )}
                                    </div>
                                </div>
                            )}
                        />
                    </div>

                    <div className="flex-1 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <FormField 
                                control={control} 
                                name={`colors.${index}.name`} 
                                render={({ field }) => ( 
                                    <FormItem>
                                        <FormLabel className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Color Variant Display Name</FormLabel>
                                        <FormControl>
                                            <Input placeholder="e.g., Storm Grey" className="h-9 text-xs font-bold border-muted focus-visible:ring-primary/10" {...field} />
                                        </FormControl>
                                    </FormItem> 
                                )} 
                            />
                            <FormField 
                                control={control} 
                                name={`colors.${index}.code`} 
                                render={({ field }) => ( 
                                    <FormItem>
                                        <FormLabel className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Color Code</FormLabel>
                                        <FormControl>
                                            <Input placeholder="e.g., SG-01" className="h-9 text-xs font-mono font-bold uppercase border-muted focus-visible:ring-primary/10" value={field.value ?? ''} onChange={field.onChange} />
                                        </FormControl>
                                    </FormItem> 
                                )} 
                            />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-3 border-l-2 border-primary bg-muted/5 space-y-3">
                                <h4 className="font-black text-[10px] uppercase tracking-tighter text-primary">HYP Material</h4>
                                <div className="grid grid-cols-1 gap-3">
                                    <GstInputPair control={control} name={`colors.${index}.pricing.HYP.cost`} label="Factory Cost" />
                                    <GstInputPair control={control} name={`colors.${index}.pricing.HYP.sellPriceExclGst`} label="Retail Sell" />
                                </div>
                            </div>
                            
                            <div className="p-3 border-l-2 border-primary bg-muted/5 space-y-3">
                                <h4 className="font-black text-[10px] uppercase tracking-tighter text-primary">PVC Material</h4>
                                <div className="grid grid-cols-1 gap-3">
                                    <GstInputPair control={control} name={`colors.${index}.pricing.PVC.cost`} label="Factory Cost" />
                                    <GstInputPair control={control} name={`colors.${index}.pricing.PVC.sellPriceExclGst`} label="Retail Sell" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </CollapsibleContent>
    </Collapsible>
  );
}

function MotorConfigurationsSection() {
    const { control } = useFormContext<ModelFormData>();
    const { fields, append, remove } = useFieldArray({ control, name: "specifications.motorConfigurations" });

    const configOptions = [
        { id: 'Single', label: 'Single Engine', engineCount: 1, engineLabels: ['Engine'] },
        { id: 'Twin', label: 'Twin Engines', engineCount: 2, engineLabels: ['Engine 1', 'Engine 2'] },
        { id: 'Triple', label: 'Triple Engines', engineCount: 3, engineLabels: ['Engine 1', 'Engine 2', 'Engine 3'] },
        { id: 'Quad', label: 'Quad Engines', engineCount: 4, engineLabels: ['Engine 1', 'Engine 2', 'Engine 3', 'Engine 4'] },
        { id: 'SingleWithAux', label: 'Single with Aux', engineCount: 2, engineLabels: ['Main Engine', 'Auxiliary Engine'] },
    ];

    const handleAddConfig = (type: string) => {
        const option = configOptions.find(o => o.id === type);
        if (!option) return;
        append({
            type,
            engines: Array.from({ length: option.engineCount }, (_, i) => ({
                label: option.engineLabels[i],
                minHp: 0,
                maxHp: 0,
                recommendedHp: 0
            }))
        });
    };

    return (
        <Collapsible asChild className="group overflow-hidden rounded-xl border bg-card shadow-sm" defaultOpen>
            <Card className="border-none shadow-none rounded-none">
                <div className="flex items-center justify-between py-4 px-6 border-b bg-card select-none">
                    <div className="flex items-center gap-3">
                        <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full border shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors group-data-[state=open]:bg-muted">
                                <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                            </Button>
                        </CollapsibleTrigger>
                        <CardTitle className="text-lg font-bold">Motor Configurations</CardTitle>
                        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-tighter">
                            {fields.length}
                        </span>
                    </div>
                    <Select onValueChange={handleAddConfig}>
                        <SelectTrigger className="h-8 w-[180px] text-xs">
                            <SelectValue placeholder="Add Configuration" />
                        </SelectTrigger>
                        <SelectContent>
                            {configOptions.map(opt => <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <CollapsibleContent>
                    <CardContent className="pt-6 space-y-6">
                        {fields.map((field, index) => (
                            <Card key={field.id} className="relative p-4 bg-muted/10">
                                <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>
                                <div className="space-y-4">
                                    <h4 className="font-black text-xs uppercase tracking-tighter text-primary">{field.type.replace(/([A-Z])/g, ' $1').trim()}</h4>
                                    <div className="grid gap-4">
                                        {(field as any).engines.map((engine: any, engineIdx: number) => (
                                            <div key={engineIdx} className="grid grid-cols-4 gap-3 items-end border-t pt-4 first:border-0 first:pt-0">
                                                <div className="space-y-1"><Label className="text-[10px] uppercase font-bold text-muted-foreground">{engine.label}</Label></div>
                                                <FormField control={control} name={`specifications.motorConfigurations.${index}.engines.${engineIdx}.minHp`} render={({ field }) => ( <FormItem className="space-y-1"><FormLabel className="text-[9px] uppercase">Min HP</FormLabel><FormControl><Input type="number" className="h-8 text-xs" {...field} /></FormControl></FormItem> )} />
                                                <FormField control={control} name={`specifications.motorConfigurations.${index}.engines.${engineIdx}.maxHp`} render={({ field }) => ( <FormItem className="space-y-1"><FormLabel className="text-[9px] uppercase">Max HP</FormLabel><FormControl><Input type="number" className="h-8 text-xs" {...field} /></FormControl></FormItem> )} />
                                                <FormField control={control} name={`specifications.motorConfigurations.${index}.engines.${engineIdx}.recommendedHp`} render={({ field }) => ( <FormItem className="space-y-1"><FormLabel className="text-[9px] uppercase">Rec. HP</FormLabel><FormControl><Input type="number" className="h-8 text-xs" {...field} /></FormControl></FormItem> )} />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </CardContent>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    );
}

function OptionalFeatureItem({ index, remove }: { index: number; remove: (index: number) => void; }) {
    const { control } = useFormContext<ModelFormData>();
    const imageUrl = useWatch({ control, name: `optionalFeatures.${index}.imageUrl` });
    const name = useWatch({ control, name: `optionalFeatures.${index}.name` });
    const code = useWatch({ control, name: `optionalFeatures.${index}.code` });
    const storage = useStorage();
    const [isUploading, setIsUploading] = useState(false);

    return (
        <Collapsible className="group/item overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="flex items-center justify-between p-3 bg-muted/20 border-b">
                <div className="flex items-center gap-3 min-w-0">
                    <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full border shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors group-data-[state=open]/item:bg-muted shrink-0">
                            <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]/item:rotate-180" />
                        </Button>
                    </CollapsibleTrigger>
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-xs truncate">{name || 'Unnamed Option'}</span>
                        {code && <span className="font-mono text-[10px] text-muted-foreground uppercase bg-muted px-1 rounded shrink-0">{code}</span>}
                    </div>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0" onClick={() => remove(index)}>
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>
            <CollapsibleContent>
                <div className="p-4 space-y-6">
                    <FormField
                        control={control}
                        name={`optionalFeatures.${index}.imageUrl`}
                        render={({ field }) => (
                            <div className="relative aspect-video w-full overflow-hidden rounded-md border-2 border-dashed bg-muted/20">
                                {isUploading && <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20"><Loader2 className="h-6 w-6 animate-spin text-white" /></div>}
                                {imageUrl ? (
                                    <>
                                        <Image src={imageUrl} alt="Feature" fill className="object-cover" />
                                        <Button type="button" variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6 rounded-full shadow-lg" onClick={() => field.onChange(null)}><X className="h-3 w-3" /></Button>
                                    </>
                                ) : (
                                    <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-secondary/50">
                                        <Upload className="w-5 h-5 text-muted-foreground" />
                                        <span className="text-[10px] text-muted-foreground mt-1 uppercase font-bold">Upload Image</span>
                                        <FormControl><Input type="file" className="hidden" accept="image/*" onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (file && storage) {
                                                setIsUploading(true);
                                                try {
                                                    const url = await uploadFileToStorage(storage, file, `features/${Date.now()}-${file.name}`);
                                                    field.onChange(url);
                                                } finally { setIsUploading(false); }
                                            }
                                        }} /></FormControl>
                                    </label>
                                )}
                            </div>
                        )}
                    />

                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-3">
                            <FormField control={control} name={`optionalFeatures.${index}.name`} render={({ field }) => ( <FormItem><FormLabel className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Name</FormLabel><FormControl><Input placeholder="Name" className="h-10 font-bold" {...field} /></FormControl></FormItem> )} />
                            <FormField control={control} name={`optionalFeatures.${index}.code`} render={({ field }) => ( <FormItem><FormLabel className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest flex items-center gap-1"><Hash className="h-2 w-2" />Option Code</FormLabel><FormControl><Input placeholder="CODE" className="h-10 text-xs font-mono font-bold uppercase" {...field} /></FormControl></FormItem> )} />
                        </div>
                        <div className="grid grid-cols-1 gap-6">
                            <GstInputPair control={control} name={`optionalFeatures.${index}.cost`} label="Cost" />
                            <GstInputPair control={control} name={`optionalFeatures.${index}.sellPriceExclGst`} label="Sell" />
                        </div>
                    </div>
                </div>
            </CollapsibleContent>
        </Collapsible>
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
            <Collapsible asChild className="group overflow-hidden rounded-xl border bg-card shadow-sm" defaultOpen>
                <Card className="border-none shadow-none rounded-none">
                    <CollapsibleCardHeader 
                        title="Material & Color Pricing" 
                        count={colorFields.length}
                        onAdd={() => appendColor({ id: `color-${Date.now()}`, name: '', code: '', imageUrl: null, pricing: { HYP: { cost: null, sellPriceExclGst: null }, PVC: { cost: null, sellPriceExclGst: null }}})}
                    />
                    <CollapsibleContent>
                        <CardContent className="space-y-4 pt-6">
                            {colorFields.map((field, index) => ( <ColorVariantItem key={field.id} index={index} remove={removeColor} /> ))}
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            <div className="grid grid-cols-1 lg:grid-cols-7 gap-8 items-start">
                <div className="lg:col-span-4 lg:order-1 space-y-8">
                    <FeaturesSection />
                    <SpecsSection />
                    <MotorConfigurationsSection />
                </div>
                <div className="lg:col-span-3 lg:order-2 space-y-8">
                    <VisualAssetsCard model={model} isModuleView={!!isModuleView} />
                    <Collapsible asChild className="group overflow-hidden rounded-xl border bg-card shadow-sm" defaultOpen>
                        <Card className="border-none shadow-none rounded-none">
                            <CollapsibleCardHeader 
                                title="Factory Options" 
                                count={optionalFeatureFields.length}
                                onAdd={() => appendOptionalFeature({ id: `feat-${Date.now()}`, name: '', cost: 0, sellPriceExclGst: 0, imageUrl: null, code: '' })}
                            />
                            <CollapsibleContent>
                                <CardContent className="pt-6">
                                    <ScrollArea className="max-h-[500px] pr-4">
                                        <div className="grid grid-cols-1 gap-4">
                                            {optionalFeatureFields.map((field, index) => ( <OptionalFeatureItem key={field.id} index={index} remove={removeOptionalFeature} /> ))}
                                        </div>
                                    </ScrollArea>
                                </CardContent>
                            </CollapsibleContent>
                        </Card>
                    </Collapsible>
                </div>
            </div>
        </div>
    );
}

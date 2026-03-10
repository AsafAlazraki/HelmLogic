'use client';

import { useState, useEffect, useMemo } from 'react';
import { useFieldArray, useWatch, useController, useFormContext } from 'react-hook-form';
import { z } from 'zod';
import Image from 'next/image';
import { useStorage, useFirestore } from '@/firebase/provider';
import { uploadFileToStorage } from '@/firebase/storage';
import { collection, query, where, getDocs, writeBatch, doc, setDoc, serverTimestamp, orderBy, deleteDoc } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { FormField, FormItem, FormLabel, FormMessage, FormControl } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
    Loader2, X, Trash2, Upload, Image as ImageIcon, Plus, Hash, Tag, Layers, FolderPlus, PlusCircle, ShieldCheck, CheckCircle2, 
    AlertTriangle, DollarSign, Ship, RefreshCw, 
    PackagePlus, Pencil, ArrowUp, ArrowDown, Check, ShieldAlert, Settings2, 
    Search, ListChecks, Star, ChevronDown, FileText, ExternalLink, ChevronRight 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from './ui/separator';
import { Label } from './ui/label';
import { ScrollArea } from './ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from './ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useMemoFirebase } from '@/firebase/provider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

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
    category: z.string().optional().nullable(),
    code: z.string().optional(),
    color: z.string().optional().nullable(),
    imageUrl: z.string().nullable().optional(),
    applicableVariantIds: z.array(z.string()).default([]),
    associatedSeatId: z.string().optional().nullable(),
    isStandard: z.boolean().default(false),
    cost: z.coerce.number().nullable().optional(),
    sellPriceExclGst: z.coerce.number().nullable().optional(),
});

const documentSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Document name is required"),
  url: z.string().min(1, "Document URL is required"),
});

const ruleSchema = z.object({
    id: z.string(),
    sourceType: z.enum(['option', 'material']).default('option'),
    sourceOptionId: z.string().min(1, 'Source is required'),
    type: z.enum(['include', 'exclude']),
    targetOptionIds: z.array(z.string()).min(1, 'At least one target option is required'),
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
    documents: z.array(documentSchema).default([]),
    rules: z.array(ruleSchema).default([]),
});

type ModelFormData = z.infer<typeof highfieldModelSchema>;

const CollapsibleCardHeader = ({ title, count, onAdd }: { title: string, count?: number, onAdd?: () => void }) => (
    <div className="flex items-center justify-between py-4 px-6 border-b bg-card select-none">
        <div className="flex items-center gap-3">
            <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full border shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors group-data-[state=open]:bg-muted">
                    <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </Button>
            </CollapsibleTrigger>
            <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-900">{title}</CardTitle>
            {count !== undefined && (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary/10 px-2 text-[9px] font-black text-primary uppercase tracking-tighter">
                    {count} ITEMS
                </span>
            )}
        </div>
        {onAdd && (
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-white transition-all shadow-sm" onClick={(e) => { e.stopPropagation(); onAdd(); }}>
                <Plus className="h-4 w-4" />
            </Button>
        )}
    </div>
);

function SkuCompatibilityDialog({ 
    isOpen, 
    onClose, 
    variants, 
    value, 
    onChange, 
    featureName 
}: { 
    isOpen: boolean, 
    onClose: () => void, 
    variants: any[], 
    value: string[], 
    onChange: (value: string[]) => void, 
    featureName: string 
}) {
    const [search, setSearch] = useState('');
    
    const filteredVariants = useMemo(() => {
        if (!search) return variants;
        const lower = search.toLowerCase();
        return variants.filter(v => 
            v.name.toLowerCase().includes(lower) || 
            v.sku?.toLowerCase().includes(lower)
        );
    }, [variants, search]);

    const handleToggle = (id: string) => {
        const next = value.includes(id) 
            ? value.filter(vId => vId !== id) 
            : [...value, id];
        onChange(next);
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-4xl h-[85vh] flex flex-col p-0 overflow-hidden rounded-[2rem] border-4 shadow-2xl">
                <DialogHeader className="p-8 border-b bg-muted/10">
                    <DialogTitle className="text-2xl font-black uppercase tracking-tight flex items-center gap-3">
                        <ListChecks className="h-6 w-6 text-primary" />
                        SKU Compatibility: {featureName || 'Unnamed Option'}
                    </DialogTitle>
                    <DialogDescription className="text-[10px] font-black uppercase tracking-widest opacity-60 mt-1">
                        Select which boat variants this option is physically compatible with.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 min-h-0 flex flex-col md:flex-row">
                    <div className="flex-1 flex flex-col min-w-0 border-r">
                        <div className="p-6 border-b bg-muted/5">
                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input 
                                    placeholder="Search boat variants..." 
                                    className="pl-10 h-12 font-bold bg-background border-2 rounded-xl"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </div>
                        </div>
                        <ScrollArea className="flex-1">
                            <div className="p-6 space-y-2">
                                {filteredVariants.length > 0 ? filteredVariants.map(v => {
                                    const isChecked = value.includes(v.id);
                                    return (
                                        <div 
                                            key={v.id} 
                                            className={cn(
                                                "flex items-center gap-4 p-4 rounded-2xl cursor-pointer transition-all border-2",
                                                isChecked ? "bg-primary/5 border-primary/20" : "hover:bg-slate-50 border-slate-100"
                                            )}
                                            onClick={() => handleToggle(v.id)}
                                        >
                                            <Checkbox checked={isChecked} onCheckedChange={() => handleToggle(v.id)} className="h-5 w-5 rounded-md" />
                                            <div className="min-w-0">
                                                <p className="text-sm font-black uppercase tracking-tight leading-tight">{v.name}</p>
                                                {v.sku && <p className="text-[10px] font-mono font-bold text-muted-foreground/60 uppercase mt-1">{v.sku}</p>}
                                            </div>
                                        </div>
                                    );
                                }) : (
                                    <div className="py-20 text-center flex flex-col items-center gap-4 opacity-20">
                                        <Ship className="h-12 w-12" />
                                        <p className="text-[10px] font-black uppercase tracking-[0.2em]">No matching variants found.</p>
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                    </div>

                    <div className="w-full md:w-[320px] shrink-0 bg-muted/5 flex flex-col">
                        <div className="p-6 border-b bg-background flex items-center justify-between">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Staged Selection</h4>
                            <Badge className="font-black h-5 text-[9px] bg-primary text-white">{value.length}</Badge>
                        </div>
                        <ScrollArea className="flex-1">
                            <div className="p-6 space-y-2">
                                {variants.filter(v => value.includes(v.id)).map(v => (
                                    <div key={v.id} className="group relative bg-white border-2 p-3 rounded-xl shadow-sm">
                                        <p className="text-[11px] font-black uppercase tracking-tight truncate pr-6">{v.name}</p>
                                        <Button 
                                            type="button"
                                            variant="ghost" 
                                            size="icon" 
                                            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={() => handleToggle(v.id)}
                                        >
                                            <X className="h-3 w-3" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>
                </div>

                <DialogFooter className="p-8 border-t bg-muted/10 gap-3">
                    <Button variant="outline" onClick={onClose} className="h-12 px-8 font-black uppercase text-[10px] rounded-xl border-2">Cancel</Button>
                    <Button onClick={onClose} className="h-12 px-10 font-black uppercase text-[10px] rounded-xl shadow-xl bg-primary text-white">
                        Apply Compatibility Matrix
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function OptionalFeatureItem({ 
    index, 
    remove, 
    categories, 
    variants,
    allFeatures 
}: { 
    index: number; 
    remove: (index: number) => void; 
    categories: string[], 
    variants: any[],
    allFeatures: any[]
}) {
    const { control } = useFormContext<ModelFormData>();
    const imageUrl = useWatch({ control, name: `optionalFeatures.${index}.imageUrl` });
    const name = useWatch({ control, name: `optionalFeatures.${index}.name` });
    const category = useWatch({ control, name: `optionalFeatures.${index}.category` });
    const isStandard = useWatch({ control, name: `optionalFeatures.${index}.isStandard` });
    const storage = useStorage();
    const [isUploading, setIsUploading] = useState(false);
    const [isCompDialogOpen, setIsCompDialogOpen] = useState(false);

    const isConsole = category === 'Consoles';
    const isSeat = category === 'Seats';
    const currentFeatureId = useMemo(() => allFeatures?.[index]?.id, [allFeatures, index]);
    const seatOptions = useMemo(() => allFeatures.filter((f: any) => f.category === 'Seats' && f.id !== currentFeatureId), [allFeatures, currentFeatureId]);

    return (
        <Collapsible className="group/item overflow-hidden rounded-[1.5rem] border-2 bg-white shadow-sm transition-all hover:border-primary/20">
            <div className={cn("flex items-center justify-between p-4 border-b-2", isStandard ? "bg-primary/5 border-primary/10" : "bg-muted/10 border-slate-100")}>
                <div className="flex items-center gap-4 min-w-0 pr-10">
                    <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full border shadow-sm hover:bg-accent transition-colors shrink-0">
                            <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]/item:rotate-180" />
                        </Button>
                    </CollapsibleTrigger>
                    <div className="flex items-center gap-2.5 min-w-0">
                        {isStandard && <Star className="h-3.5 w-3.5 text-primary fill-primary shrink-0" />}
                        <span className="font-black text-xs uppercase tracking-tight truncate">{name || 'Unnamed Option'}</span>
                        {category && <Badge variant="outline" className="text-[8px] font-black uppercase tracking-widest border-primary/20 text-primary bg-primary/5 px-2">{category}</Badge>}
                    </div>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 opacity-0 group-hover/item:opacity-100 transition-opacity" onClick={() => remove(index)}>
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>
            <CollapsibleContent>
                <div className="p-6 space-y-8 bg-slate-50/30">
                    <div className="flex flex-col sm:flex-row gap-6 items-start">
                        <div className="w-32 shrink-0">
                            <FormField
                                control={control}
                                name={`optionalFeatures.${index}.imageUrl`}
                                render={({ field }) => (
                                    <div className="relative aspect-square w-full overflow-hidden rounded-[1.5rem] border-2 border-dashed bg-white group/feat-img shadow-inner">
                                        {isUploading && <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20"><Loader2 className="h-8 w-8 animate-spin text-white" /></div>}
                                        {imageUrl ? (
                                            <>
                                                <Image src={imageUrl} alt="Feature" fill className="object-contain p-4" unoptimized />
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/feat-img:opacity-100 transition-opacity flex items-center justify-center">
                                                    <Button type="button" variant="destructive" size="sm" className="h-7 text-[9px] font-black uppercase rounded-lg" onClick={() => field.onChange(null)}>Remove</Button>
                                                </div>
                                            </>
                                        ) : (
                                            <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-slate-50 transition-colors">
                                                <Upload className="w-5 h-5 text-slate-300 mb-2" />
                                                <span className="text-[9px] text-slate-400 uppercase font-black tracking-widest">Render</span>
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
                        </div>

                        <div className="flex-1 grid grid-cols-2 gap-4">
                            <FormField control={control} name={`optionalFeatures.${index}.name`} render={({ field }) => ( 
                                <FormItem className="col-span-2 sm:col-span-1">
                                    <FormLabel className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Display Name</FormLabel>
                                    <FormControl><Input placeholder="Name" className="h-11 font-bold border-2 rounded-xl bg-white" {...field} /></FormControl>
                                </FormItem> 
                            )} />
                            <FormField control={control} name={`optionalFeatures.${index}.code`} render={({ field }) => ( 
                                <FormItem className="col-span-2 sm:col-span-1">
                                    <FormLabel className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Factory Code</FormLabel>
                                    <FormControl><Input placeholder="CODE" className="h-11 font-mono font-bold uppercase border-2 rounded-xl bg-white" {...field} /></FormControl>
                                </FormItem> 
                            )} />
                            <FormField control={control} name={`optionalFeatures.${index}.category`} render={({ field }) => (
                                <FormItem className="col-span-2 sm:col-span-1">
                                    <FormLabel className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Category Matrix</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value || 'none'}>
                                        <FormControl>
                                            <SelectTrigger className="h-11 font-bold border-2 rounded-xl bg-white">
                                                <SelectValue />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent className="rounded-xl border-2 shadow-2xl">
                                            <SelectItem value="none" className="font-bold py-2.5">Uncategorized</SelectItem>
                                            {categories.map(cat => (
                                                <SelectItem key={cat} value={cat} className="font-bold py-2.5 uppercase text-[10px] tracking-widest">{cat}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </FormItem>
                            )} />
                            <FormField control={control} name={`optionalFeatures.${index}.sellPriceExclGst`} render={({ field }) => (
                                <FormItem className="col-span-2 sm:col-span-1">
                                    <FormLabel className="text-[9px] font-black uppercase text-primary tracking-widest">Strategic Sell (Excl.)</FormLabel>
                                    <FormControl>
                                        <div className="relative">
                                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary opacity-40" />
                                            <Input type="number" step="0.01" className="h-11 pl-9 font-black text-primary border-2 rounded-xl bg-white shadow-inner" {...field} value={field.value ?? ''} />
                                        </div>
                                    </FormControl>
                                </FormItem>
                            )} />
                        </div>
                    </div>

                    <div className="space-y-6 pt-6 border-t-2 border-dashed border-slate-100">
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-white border-2 shadow-sm">
                            <FormField
                                control={control}
                                name={`optionalFeatures.${index}.isStandard`}
                                render={({ field }) => (
                                    <FormItem className="flex items-center space-x-3 space-y-0">
                                        <FormControl>
                                            <Checkbox checked={field.value} onCheckedChange={field.onChange} className="h-5 w-5 rounded-md" />
                                        </FormControl>
                                        <FormLabel className="text-[10px] font-black uppercase tracking-[0.2em] cursor-pointer text-primary">Standard Configuration Baseline</FormLabel>
                                    </FormItem>
                                )}
                            />
                            {isStandard && <Badge className="bg-primary text-white border-none font-black text-[8px] uppercase px-3 shadow-lg shadow-primary/20">PRE-SELECTED IN QUOTE</Badge>}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div className="space-y-3">
                                <FormLabel className="text-[9px] font-black uppercase text-muted-foreground tracking-widest ml-1">SKU Compatibility Matrix</FormLabel>
                                <FormField
                                    control={control}
                                    name={`optionalFeatures.${index}.applicableVariantIds`}
                                    render={({ field }) => (
                                        <>
                                            <Button 
                                                type="button"
                                                variant="outline" 
                                                className="w-full h-12 justify-between px-5 font-black uppercase text-[10px] tracking-widest bg-white border-2 rounded-xl shadow-sm hover:bg-slate-50 transition-all"
                                                onClick={() => setIsCompDialogOpen(true)}
                                            >
                                                <span>{field.value?.length > 0 ? `${field.value.length} SKUs LINKED` : 'DEFINE SKU ACCESS'}</span>
                                                <ChevronRight className="h-4 w-4 opacity-40" />
                                            </Button>
                                            <SkuCompatibilityDialog 
                                                isOpen={isCompDialogOpen}
                                                onClose={() => setIsCompDialogOpen(false)}
                                                variants={variants}
                                                value={field.value || []}
                                                onChange={field.onChange}
                                                featureName={name}
                                            />
                                        </>
                                    )}
                                />
                            </div>

                            {isConsole && (
                                <div className="space-y-3">
                                    <FormLabel className="text-[9px] font-black uppercase text-muted-foreground tracking-widest ml-1">Paired Dynamic Seat</FormLabel>
                                    <FormField
                                        control={control}
                                        name={`optionalFeatures.${index}.associatedSeatId`}
                                        render={({ field }) => (
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button variant="outline" className="w-full h-12 justify-between px-5 font-black uppercase text-[10px] tracking-widest bg-white border-2 rounded-xl shadow-sm hover:bg-slate-50 transition-all">
                                                        <span className="truncate">
                                                            {field.value ? (() => {
                                                                const s = seatOptions.find((s: any) => s.id === field.value);
                                                                return s ? `${s.name} ${s.code ? `(${s.code})` : ''}` : 'SEAT LINKED';
                                                            })() : 'NO PAIRED SEAT'}
                                                        </span>
                                                        <ChevronRight className="h-4 w-4 opacity-40" />
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-[350px] p-0 rounded-2xl border-4 shadow-2xl" align="start">
                                                    <Command className="rounded-2xl">
                                                        <CommandInput placeholder="Search Seats..." className="h-12 font-bold" />
                                                        <CommandList className="max-h-[300px]">
                                                            <CommandEmpty className="p-6 text-center text-[10px] font-black uppercase text-slate-400">No compatible seats found.</CommandEmpty>
                                                            <CommandGroup className="p-2">
                                                                <CommandItem onSelect={() => field.onChange(null)} className="font-black text-[10px] uppercase py-3 rounded-xl">Clear Linkage</CommandItem>
                                                                {seatOptions.map((seat: any) => (
                                                                    <CommandItem
                                                                        key={seat.id}
                                                                        onSelect={() => field.onChange(seat.id)}
                                                                        className="font-bold text-[11px] uppercase tracking-tight py-3 px-4 rounded-xl flex items-center justify-between aria-selected:bg-primary aria-selected:text-white"
                                                                    >
                                                                        <div className="flex flex-col min-w-0">
                                                                            <span className="truncate">{seat.name} {seat.code && `(${seat.code})`}</span>
                                                                        </div>
                                                                        {field.value === seat.id && <Check className="h-4 w-4" />}
                                                                    </CommandItem>
                                                                ))}
                                                            </CommandGroup>
                                                        </CommandList>
                                                    </Command>
                                                </PopoverContent>
                                            </Popover>
                                        )}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}

function VariantsSection({ model, vendorId, rangeId }: { model: any, vendorId: string, rangeId: string }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const variantsQuery = useMemoFirebase(() => query(collection(firestore, `data-warehouse/${vendorId}/ranges/${rangeId}/models/${model.id}/variants`), orderBy('order')), [firestore, vendorId, rangeId, model.id]);
    const { data: variants, isLoading: variantsLoading } = useCollection<any>(variantsQuery);

    if (variantsLoading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

    return (
        <Collapsible className="group overflow-hidden rounded-[2rem] border-2 bg-white shadow-sm" defaultOpen>
            <CollapsibleCardHeader title="Boat Variants & SKUs" count={variants?.length || 0} />
            <CollapsibleContent>
                <CardContent className="p-8 space-y-4">
                    {variants && variants.length > 0 ? (
                        <div className="grid gap-4">
                            {variants.map((v) => (
                                <div key={v.id} className="flex items-center justify-between p-4 rounded-2xl border-2 bg-slate-50 hover:border-primary/20 transition-all group/v">
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className="h-12 w-12 relative rounded-xl bg-white border shadow-inner flex items-center justify-center overflow-hidden">
                                            {v.imageUrl ? <Image src={v.imageUrl} alt={v.name} fill className="object-contain p-1" unoptimized /> : <Ship className="h-6 w-6 text-slate-200" />}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-black text-xs uppercase tracking-tight truncate">{v.name}</p>
                                            <p className="text-[10px] font-mono font-bold text-primary uppercase mt-0.5">{v.sku || 'NO SKU'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Badge variant="outline" className="font-black text-[8px] uppercase tracking-widest">{v.material}</Badge>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground opacity-0 group-hover/v:opacity-100" asChild>
                                            <Link href={`/data-warehouse/${vendorId}/ranges/${rangeId}/models/${model.id}`}><ChevronRight className="h-4 w-4" /></Link>
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-12 text-center flex flex-col items-center gap-3 opacity-20 border-2 border-dashed rounded-3xl bg-muted/5">
                            <Ship className="h-10 w-10" />
                            <p className="text-[10px] font-black uppercase tracking-widest">No variants defined for this series.</p>
                        </div>
                    )}
                </CardContent>
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
        <Collapsible className="group overflow-hidden rounded-[2.5rem] border-2 bg-card shadow-sm" defaultOpen>
            <CollapsibleCardHeader title={isModuleView ? "Visual Config & Renders" : "Main Cover Image & Gallery"} count={galleryUrls.length + (coverImageUrl ? 1 : 0)} />
            <CollapsibleContent>
                <div className="space-y-0">
                    <div className="relative aspect-[16/10] w-full bg-slate-50 group">
                        {isCoverUploading && <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20"><Loader2 className="h-8 w-8 animate-spin text-white" /></div>}
                        {coverImageUrl ? (
                            <div className="h-full w-full flex items-center justify-center relative">
                                <Image src={coverImageUrl} alt="Cover" fill className="object-contain p-8" unoptimized />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <Button type="button" variant="destructive" size="sm" className="font-black uppercase text-[10px]" onClick={() => setValue('coverImageUrl', null)}>Remove Primary Render</Button>
                                </div>
                            </div>
                        ) : (
                            <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-slate-100 transition-all">
                                <ImageIcon className="w-12 h-12 mb-3 text-slate-300" />
                                <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{isModuleView ? "Upload Build Render" : "Set Primary Brand Image"}</span>
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
                    
                    <div className="p-8 space-y-4 bg-white border-t-2">
                        <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Component Gallery</Label>
                        <div className="grid grid-cols-3 gap-4">
                            {galleryUrls.map((url, index) => (
                                <div key={index} className="relative aspect-square group rounded-2xl overflow-hidden border-2 bg-slate-50">
                                    <Image src={url} alt={`Gallery ${index}`} fill className="object-cover" unoptimized />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <Button type="button" variant="destructive" size="icon" className="h-8 w-8 rounded-full" onClick={() => removeGalleryImage(index)}><Trash2 className="h-4 w-4" /></Button>
                                    </div>
                                </div>
                            ))}
                            <label className="aspect-square flex flex-col items-center justify-center border-2 border-dashed rounded-2xl cursor-pointer hover:bg-slate-50 transition-all group/add">
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

function DocumentsSection() {
    const { control } = useFormContext<ModelFormData>();
    const { fields, append, remove } = useFieldArray({ control, name: "documents" });
    const storage = useStorage();
    const [isUploading, setIsUploading] = useState(false);
    const { toast } = useToast();

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !storage) return;
        setIsUploading(true);
        try {
            const path = `documents/${Date.now()}-${file.name}`;
            const url = await uploadFileToStorage(storage, file, path);
            append({ id: `doc-${Date.now()}`, name: file.name, url });
            toast({ title: "Document Uploaded" });
        } catch (error: any) {
            toast({ variant: 'destructive', title: "Upload Failed", description: error.message });
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <Collapsible className="group overflow-hidden rounded-[2rem] border-2 bg-white shadow-sm" defaultOpen>
            <CollapsibleCardHeader title="Technical Documents" count={fields.length} />
            <CollapsibleContent>
                <CardContent className="p-8 space-y-4">
                    <div className="grid gap-2">
                        {fields.map((field, index) => (
                            <div key={field.id} className="flex items-center gap-3 p-4 rounded-2xl border-2 bg-slate-50 group/doc">
                                <FileText className="h-5 w-5 text-primary/40 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <FormField 
                                        control={control} 
                                        name={`documents.${index}.name`} 
                                        render={({ field }) => (
                                            <FormControl>
                                                <Input {...field} className="h-7 text-[11px] font-black uppercase border-none bg-transparent shadow-none focus-visible:ring-0 p-0" placeholder="Document Name" />
                                            </FormControl>
                                        )} 
                                    />
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary/10 text-primary" asChild title="Open Link">
                                        <a href={(field as any).url} target="_blank" rel="noopener noreferrer">
                                            <ExternalLink className="h-4 w-4" />
                                        </a>
                                    </Button>
                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 opacity-0 group-hover/doc:opacity-100 transition-opacity" onClick={() => remove(index)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                    
                    <label className="flex flex-col items-center justify-center w-full py-10 border-2 border-dashed rounded-[2rem] cursor-pointer bg-slate-50 hover:bg-slate-100 transition-all group/upload">
                        {isUploading ? (
                            <Loader2 className="h-10 w-10 animate-spin text-primary" />
                        ) : (
                            <>
                                <Upload className="h-8 w-8 text-slate-300 group-hover/upload:text-primary transition-colors mb-3" />
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Upload Factory Manual / Spec Sheet</p>
                            </>
                        )}
                        <Input type="file" className="hidden" onChange={handleUpload} disabled={isUploading} />
                    </label>
                </CardContent>
            </CollapsibleContent>
        </Collapsible>
    );
}

function SpecsSection() {
    const { control } = useFormContext<ModelFormData>();
    const { fields, append, remove } = useFieldArray({ control, name: "specifications.otherSpecs" });
    const [bulkSpecs, setBulkSpecs] = useState('');

    const handleBulkImport = () => {
        const lines = bulkSpecs.split('\n').filter(line => line.trim() !== '');
        const newSpecs = lines.map(line => {
            const separatorIndex = line.indexOf(':');
            let label = line.trim();
            let value = '';
            if (separatorIndex !== -1) {
                label = line.substring(0, separatorIndex).trim();
                value = line.substring(separatorIndex + 1).trim();
            }
            return { id: `spec-${Date.now()}-${Math.random()}`, label, value };
        });
        append(newSpecs);
        setBulkSpecs('');
    };

    return (
        <Collapsible className="group overflow-hidden rounded-[2rem] border-2 bg-white shadow-sm" defaultOpen>
            <CollapsibleCardHeader 
                title="Engineering Specifications" 
                count={fields.length} 
                onAdd={() => append({ id: `spec-${Date.now()}`, label: '', value: '' })}
            />
            <CollapsibleContent>
                <CardContent className="space-y-6 pt-8">
                    <div className="grid gap-3">
                        {fields.map((field, index) => (
                            <div key={field.id} className="flex items-center gap-3 p-2 rounded-xl bg-slate-50 border-2 border-transparent hover:border-slate-100 transition-all group/field">
                                <FormField control={control} name={`specifications.otherSpecs.${index}.label`} render={({ field }) => ( <FormItem className="flex-1"><FormControl><Input placeholder="Attribute" className="h-10 font-bold border-none bg-transparent shadow-none" {...field} /></FormControl></FormItem> )} />
                                <div className="h-6 w-px bg-slate-200" />
                                <FormField control={control} name={`specifications.otherSpecs.${index}.value`} render={({ field }) => ( <FormItem className="flex-1"><FormControl><Input placeholder="Value" className="h-10 font-black text-primary border-none bg-transparent shadow-none" {...field} /></FormControl></FormItem> )} />
                                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive opacity-0 group-hover/field:opacity-100 transition-opacity" onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                        ))}
                    </div>
                    <div className="p-6 bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200 space-y-4">
                        <div className="flex items-center gap-2">
                            <Layers className="h-4 w-4 text-slate-400" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Deep Import Logic</span>
                        </div>
                        <Textarea 
                            placeholder="Paste specs (e.g. Beam: 2.1m) one per line..." 
                            className="bg-white min-h-[120px] rounded-xl border-2 font-bold text-xs" 
                            value={bulkSpecs} 
                            onChange={(e) => setBulkSpecs(e.target.value)} 
                        />
                        <Button 
                            type="button" 
                            variant="outline" 
                            className="w-full h-11 font-black uppercase text-[10px] tracking-widest rounded-xl border-2 bg-white" 
                            onClick={handleBulkImport}
                        >
                            Sync Bulk Parameters
                        </Button>
                    </div>
                </CardContent>
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

    return (
        <Collapsible className="group overflow-hidden rounded-[2rem] border-2 bg-white shadow-sm" defaultOpen>
            <div className="flex items-center justify-between py-4 px-8 border-b bg-white">
                <div className="flex items-center gap-4">
                    <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full border shadow-sm"><ChevronDown className="h-5 w-5 transition-transform group-data-[state=open]:rotate-180" /></Button>
                    </CollapsibleTrigger>
                    <div>
                        <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em]">Motor Configurations</CardTitle>
                        <span className="text-[9px] font-bold text-muted-foreground uppercase">{fields.length} SCENARIOS</span>
                    </div>
                </div>
                <Select onValueChange={(type) => {
                    const opt = configOptions.find(o => o.id === type);
                    if (opt) append({ type, engines: Array.from({ length: opt.engineCount }, (_, i) => ({ label: opt.engineLabels[i], minHp: 0, maxHp: 0, recommendedHp: 0 })) });
                }}>
                    <SelectTrigger className="h-10 w-[220px] font-black text-[10px] uppercase tracking-widest border-2 rounded-xl shadow-inner">
                        <Plus className="h-3.5 w-3.5 mr-2 text-primary" />
                        <SelectValue placeholder="Add Scenario" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-2 shadow-2xl">
                        {configOptions.map(opt => <SelectItem key={opt.id} value={opt.id} className="font-bold py-3 uppercase text-[10px]">{opt.label}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
            <CollapsibleContent>
                <CardContent className="p-8 space-y-6">
                    {fields.map((field, index) => (
                        <div key={field.id} className="relative p-6 bg-slate-50 border-2 rounded-[2rem] space-y-6 animate-in slide-in-from-top-2">
                            <Button type="button" variant="ghost" size="icon" className="absolute top-4 right-4 h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>
                            <h4 className="font-black text-sm uppercase tracking-tighter text-primary flex items-center gap-2">
                                <Zap className="h-4 w-4 fill-current" />
                                {field.type.replace(/([A-Z])/g, ' $1').trim()} Deployment
                            </h4>
                            <div className="grid gap-6">
                                {(field as any).engines.map((engine: any, eIdx: number) => (
                                    <div key={eIdx} className="grid grid-cols-4 gap-4 items-end bg-white p-5 rounded-2xl border-2">
                                        <div className="space-y-1"><Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">{engine.label}</Label></div>
                                        <FormField control={control} name={`specifications.motorConfigurations.${index}.engines.${eIdx}.minHp`} render={({ field }) => ( <FormItem className="space-y-1"><FormLabel className="text-[8px] font-black uppercase">Min HP</FormLabel><FormControl><Input type="number" className="h-9 font-black border-none bg-slate-50 shadow-inner rounded-lg text-center" {...field} /></FormControl></FormItem> )} />
                                        <FormField control={control} name={`specifications.motorConfigurations.${index}.engines.${eIdx}.maxHp`} render={({ field }) => ( <FormItem className="space-y-1"><FormLabel className="text-[8px] font-black uppercase">Max HP</FormLabel><FormControl><Input type="number" className="h-9 font-black border-none bg-slate-50 shadow-inner rounded-lg text-center" {...field} /></FormControl></FormItem> )} />
                                        <FormField control={control} name={`specifications.motorConfigurations.${index}.engines.${eIdx}.recommendedHp`} render={({ field }) => ( <FormItem className="space-y-1"><FormLabel className="text-[8px] font-black uppercase">Rec. HP</FormLabel><FormControl><Input type="number" className="h-9 font-black text-primary border-none bg-primary/5 shadow-inner rounded-lg text-center" {...field} /></FormControl></FormItem> )} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </CardContent>
            </CollapsibleContent>
        </Collapsible>
    );
}

function RulesSection({ model, modelCode }: { model: any, modelCode: string }) {
    const { control } = useFormContext<ModelFormData>();
    const { fields, append, remove } = useFieldArray({ control, name: "rules" });
    const optionalFeatures = useWatch({ control, name: "optionalFeatures" }) || [];
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isSyncing, setIsSyncing] = useState(false);

    const handleSyncRules = async () => {
        if (!modelCode || !model.vendorId) return;
        setIsSyncing(true);
        try {
            const q = query(collection(firestore, `data-warehouse/${model.vendorId}/ranges/${model.rangeId}/models`), where('modelCode', '==', modelCode));
            const snap = await getDocs(q);
            const batch = writeBatch(firestore);
            const currentRules = control._formValues.rules || [];
            snap.docs.forEach(d => d.id !== model.id && batch.update(d.ref, { rules: currentRules }));
            await batch.commit();
            toast({ title: "Rules Synchronized", description: `Applied logic to ${snap.size} series variations.` });
        } catch (e) { toast({ variant: 'destructive', title: "Sync Failed" }); }
        finally { setIsSyncing(false); }
    };

    const featureOptions = useMemo(() => optionalFeatures.map((f: any) => ({ id: f.id, label: `${f.name}${f.code ? ` (${f.code})` : ''}` })), [optionalFeatures]);

    return (
        <Collapsible className="group overflow-hidden rounded-[2rem] border-2 bg-white shadow-sm" defaultOpen>
            <div className="flex items-center justify-between py-4 px-8 border-b bg-white">
                <div className="flex items-center gap-4">
                    <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full border shadow-sm"><ChevronDown className="h-5 w-5 transition-transform group-data-[state=open]:rotate-180" /></Button>
                    </CollapsibleTrigger>
                    <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em]">Logical Guardrails</CardTitle>
                </div>
                <div className="flex items-center gap-3">
                    <Button type="button" variant="secondary" className="h-10 px-6 font-black uppercase text-[9px] rounded-xl shadow-lg" onClick={handleSyncRules} disabled={isSyncing}>
                        {isSyncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />} Sync to Series
                    </Button>
                    <Button type="button" variant="outline" className="h-10 px-6 font-black uppercase text-[9px] rounded-xl border-2" onClick={() => append({ id: `rule-${Date.now()}`, sourceType: 'option', sourceOptionId: '', type: 'include', targetOptionIds: [] })}>
                        <Plus className="h-4 w-4 mr-2" /> New Constraint
                    </Button>
                </div>
            </div>
            <CollapsibleContent>
                <CardContent className="p-8 space-y-4">
                    {fields.map((field, idx) => (
                        <div key={field.id} className="p-6 rounded-[1.5rem] border-2 bg-slate-50 relative group/rule">
                            <div className="grid grid-cols-3 gap-6 pr-12">
                                <FormField control={control} name={`rules.${idx}.sourceOptionId`} render={({ field }) => (
                                    <FormItem><FormLabel className="text-[8px] font-black uppercase tracking-widest text-slate-400">Condition</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl>
                                            <SelectTrigger className="h-11 font-bold border-2 rounded-xl bg-white"><SelectValue placeholder="If..." /></SelectTrigger>
                                        </FormControl>
                                        <SelectContent className="rounded-xl border-2 shadow-2xl">
                                            {featureOptions.map(opt => <SelectItem key={opt.id} value={opt.id} className="font-bold py-2.5 uppercase text-[9px]">{opt.label}</SelectItem>)}
                                        </SelectContent>
                                    </Select></FormItem>
                                )} />
                                <FormField control={control} name={`rules.${idx}.type`} render={({ field }) => (
                                    <FormItem><FormLabel className="text-[8px] font-black uppercase tracking-widest text-slate-400">Action</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl>
                                            <SelectTrigger className="h-11 font-black uppercase text-[10px] border-2 rounded-xl bg-white"><SelectValue /></SelectTrigger>
                                        </FormControl>
                                        <SelectContent className="rounded-xl border-2 shadow-2xl">
                                            <SelectItem value="include" className="font-black py-2.5 uppercase text-[9px]">MUST INCLUDE</SelectItem>
                                            <SelectItem value="exclude" className="font-black py-2.5 uppercase text-[9px]">EXCLUDES</SelectItem>
                                        </SelectContent>
                                    </Select></FormItem>
                                )} />
                                <FormField control={control} name={`rules.${idx}.targetOptionIds`} render={({ field }) => (
                                    <FormItem><FormLabel className="text-[8px] font-black uppercase tracking-widest text-slate-400">Effect On</FormLabel>
                                    <Popover><PopoverTrigger asChild><Button variant="outline" className="w-full h-11 justify-between px-4 font-bold border-2 rounded-xl bg-white"><span>{field.value?.length > 0 ? `${field.value.length} SELECTIONS` : 'Targets...'}</span><ChevronRight className="h-4 w-4 opacity-40" /></Button></PopoverTrigger>
                                    <PopoverContent className="w-[300px] p-0 rounded-2xl border-4 shadow-2xl"><Command><CommandInput placeholder="Search..." /><CommandList><CommandGroup>{featureOptions.map(opt => (
                                        <CommandItem key={opt.id} onSelect={() => { const next = field.value?.includes(opt.id) ? field.value.filter((i:any)=>i!==opt.id) : [...(field.value||[]), opt.id]; field.onChange(next); }} className="font-bold uppercase text-[9px] tracking-tight py-3 flex items-center justify-between">
                                        <span>{opt.label}</span>{field.value?.includes(opt.id) && <Check className="h-4 w-4 text-primary" />}</CommandItem>))}</CommandGroup></CommandList></Command></PopoverContent></Popover></FormItem>
                                )} />
                            </div>
                            <Button type="button" variant="ghost" size="icon" className="absolute top-4 right-4 h-8 w-8 text-destructive opacity-0 group-hover/rule:opacity-100 transition-opacity" onClick={() => remove(idx)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                    ))}
                </CardContent>
            </CollapsibleContent>
        </Collapsible>
    );
}

export function HighfieldModelEditor({ model, vendorId, rangeId, isModuleView }: { model: any, vendorId: string, rangeId: string, isModuleView?: boolean, gstPercentage: number }) {
    const { control, watch } = useFormContext<ModelFormData>();
    const { fields: optionalFeatureFields, append: appendOptionalFeature, remove: removeOptionalFeature } = useFieldArray({ control, name: "optionalFeatures" });
    const watchedOptionalFeatures = useWatch({ control, name: 'optionalFeatures' }) || [];
    const modelCode = watch('modelCode');
    const firestore = useFirestore();
    const [newCategoryName, setNewCategoryName] = useState('');

    const variantsQuery = useMemoFirebase(() => query(collection(firestore, `data-warehouse/${vendorId}/ranges/${rangeId}/models/${model.id}/variants`), orderBy('order')), [firestore, vendorId, rangeId, model.id]);
    const { data: variants = [] } = useCollection<any>(variantsQuery);

    const categorizedFeatures = useMemo(() => {
        const features = optionalFeatureFields.map((field, idx) => ({ field, idx, data: watchedOptionalFeatures[idx] }));
        const groups: Record<string, typeof features> = {};
        features.forEach(item => { const cat = item.data?.category || 'Other Options'; if (!groups[cat]) groups[cat] = []; groups[cat].push(item); });
        return Object.entries(groups).sort(([a], [b]) => {
            if (a === 'Consoles') return -1; if (b === 'Consoles') return 1;
            if (a === 'Seats') return -1; if (b === 'Seats') return 1;
            if (a === 'Other Options') return 1; if (b === 'Other Options') return -1;
            return a.localeCompare(b);
        });
    }, [optionalFeatureFields, watchedOptionalFeatures]);

    return (
        <div className="space-y-12 pb-32">
            <div className="grid grid-cols-1 lg:grid-cols-7 gap-12 items-start">
                <div className="lg:col-span-4 space-y-12 min-w-0">
                    <VariantsSection model={model} vendorId={vendorId} rangeId={rangeId} />
                    <SpecsSection />
                    <MotorConfigurationsSection />
                </div>
                <div className="lg:col-span-3 space-y-12 min-w-0">
                    <VisualAssetsCard model={model} isModuleView={!!isModuleView} />
                    <div className="space-y-6">
                        <div className="flex items-center justify-between px-2">
                            <div className="flex items-center gap-2 text-primary">
                                <PlusCircle className="h-5 w-5" />
                                <h3 className="font-black uppercase tracking-widest text-xs">New Factory Category</h3>
                            </div>
                        </div>
                        <div className="p-2 bg-white rounded-3xl border-4 shadow-xl flex items-center gap-3">
                            <div className="relative flex-1">
                                <FolderPlus className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-primary opacity-40" />
                                <Input 
                                    placeholder="e.g. Navigation Packs..." 
                                    value={newCategoryName} 
                                    onChange={e => setNewCategoryName(e.target.value)}
                                    className="h-14 pl-12 font-bold text-sm border-none shadow-none focus-visible:ring-0" 
                                />
                            </div>
                            <Button type="button" className="h-12 px-8 rounded-2xl font-black uppercase text-[10px] shadow-lg" onClick={() => { if(newCategoryName.trim()) setNewCategoryName(''); }}>Register</Button>
                        </div>

                        <ScrollArea className="h-[1200px] w-full rounded-[3rem] border-4 shadow-2xl bg-white">
                            <div className="p-8 space-y-12">
                                {categorizedFeatures.map(([cat, items]) => (
                                    <div key={cat} className="space-y-6">
                                        <div className="flex items-center justify-between border-b-4 border-primary/10 pb-4 px-2">
                                            <div className="flex items-center gap-4">
                                                <Badge className="bg-primary text-white border-none font-black text-[10px] tracking-tighter h-6 px-3">{items.length} ITEMS</Badge>
                                                <h3 className="font-black text-xl uppercase italic tracking-tighter text-slate-900">{cat}</h3>
                                            </div>
                                            <Button type="button" variant="ghost" size="icon" className="h-10 w-10 rounded-full bg-primary/10 text-primary shadow-sm hover:scale-110 transition-transform" onClick={() => appendOptionalFeature({ id: `feat-${Date.now()}`, name: '', category: cat === 'Other Options' ? null : cat, imageUrl: null, code: '', color: '', applicableVariantIds: [], associatedSeatId: null, isStandard: false })}>
                                                <Plus className="h-5 w-5" />
                                            </Button>
                                        </div>
                                        <div className="grid gap-4">
                                            {items.map(item => (
                                                <OptionalFeatureItem key={item.field.id} index={item.idx} remove={removeOptionalFeature} categories={categorizedFeatures.map(([name]) => name).filter(n => n !== 'Other Options')} variants={variants} allFeatures={watchedOptionalFeatures} />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>
                    <DocumentsSection />
                    <RulesSection model={model} modelCode={modelCode} />
                </div>
            </div>
        </div>
    );
}

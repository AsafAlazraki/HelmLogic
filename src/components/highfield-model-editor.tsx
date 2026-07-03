'use client';

import { formatMetres } from '@/lib/units';
import { useState, useMemo } from 'react';
import { useFieldArray, useWatch, useFormContext } from 'react-hook-form';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import Image from 'next/image';
import { useStorage, useFirestore, useMemoFirebase, useCollection } from '@/firebase';
import { uploadFileToStorage } from '@/firebase/storage';
import { collection, query, where, getDocs, writeBatch, doc, serverTimestamp, setDoc, updateDoc, deleteField } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { FormField, FormItem, FormLabel, FormMessage, FormControl } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
    Loader2, X, Trash2, Upload, Image as ImageIcon, Plus, Hash, Tag, PlusCircle, ShieldCheck, Star, ChevronDown,
    DollarSign, Ship, Check, Search, ListChecks, ExternalLink, RefreshCw, FileText, Zap, ListCheck, Truck, Wrench, Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TrailerCatalogPicker } from '@/components/trailer-catalog-picker';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from './ui/separator';
import { Label } from './ui/label';
import { ScrollArea } from './ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from './ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChevronRight } from 'lucide-react';

// All sub-schemas are intentionally permissive — legacy data in Firestore may
// have missing/null fields and we never want validation to BLOCK a save.
// The form UI is the source of correctness; validation is a safety net only.
const specSchema = z.object({
    id: z.string().optional().default(() => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `spec-${Date.now()}-${Math.random().toString(36).slice(2)}`)),
    label: z.string().nullable().optional().default(''),
    value: z.string().nullable().optional().default(''),
}).passthrough();

const motorConfigSchema = z.object({
    type: z.string().nullable().optional().default('Single'),
    engines: z.array(z.object({
        label: z.string().nullable().optional().default(''),
        minHp: z.coerce.number().nullable().optional().default(0),
        maxHp: z.coerce.number().nullable().optional().default(0),
        recommendedHp: z.coerce.number().nullable().optional().default(0),
    }).passthrough()).optional().default([]),
}).passthrough();

const optionalFeatureSchema = z.object({
    id: z.string().optional().default(() => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `feat-${Date.now()}-${Math.random().toString(36).slice(2)}`)),
    name: z.string().nullable().optional().default(''),
    category: z.string().nullable().optional(),
    code: z.string().nullable().optional(),
    color: z.string().nullable().optional(),
    imageUrl: z.string().nullable().optional(),
    applicableVariantIds: z.array(z.string()).optional().default([]),
    associatedSkus: z.array(z.string()).optional().default([]),
    associatedSeatId: z.string().nullable().optional(),
    isStandard: z.boolean().optional().default(false),
    cost: z.coerce.number().nullable().optional(),
    sellPriceExclGst: z.coerce.number().nullable().optional(),
}).passthrough();

export const highfieldModelSchema = z.object({
    modelCode: z.string().min(1, 'Model Code is required'),
    coverImageUrl: z.string().nullable().optional(),
    galleryImageUrls: z.array(z.string()).optional().default([]),
    registration: z.object({
        price12Months: z.coerce.number().nullable().optional(),
        stickerPrice: z.coerce.number().nullable().optional(),
        tenderToStickerPrice: z.coerce.number().nullable().optional(),
        trailerPrice12Months: z.coerce.number().nullable().optional(),
    }).passthrough().optional(),
    specifications: z.object({
        motorConfigurations: z.array(motorConfigSchema).optional().default([]),
        otherSpecs: z.array(specSchema).optional().default([]),
    }).passthrough().optional(),
    standardFeatures: z.array(z.string()).optional().default([]),
    optionalFeatures: z.array(optionalFeatureSchema).optional().default([]),
    documents: z.array(z.object({
        id: z.string().optional().default(() => `doc-${Date.now()}-${Math.random().toString(36).slice(2)}`),
        name: z.string().nullable().optional().default(''),
        url: z.string().nullable().optional().default(''),
    }).passthrough()).optional().default([]),
    rules: z.array(z.any()).optional().default([]),
    /** v1.11 follow-up — boat-level fit-up complexity. Drives the suggested
     *  package on Step 5 of the quote flow (Simple / Medium / Complex card
     *  gets the ✨ Suggested badge). `auto` defers to a runtime heuristic
     *  based on overall hull length + motor maxHp range. Org admins set
     *  this in the model editor; the value snapshots onto the quote so the
     *  customer PDF reflects the bundle's identity. */
    fitUpComplexity: z.enum(['auto', 'simple', 'medium', 'complex']).optional().default('auto'),
    /** v1.19 (Story 2.1.2) — Model-Specific Fit-Out Pricing.
     *  Each tier optional. When set, the quote flow surfaces the explicit
     *  package price instead of summing per-item. When all three are null
     *  (default), behaviour is unchanged from v1.18. ex GST throughout. */
    fitOutPricing: z.object({
        basic: z.number().nullable().optional().default(null),
        moderate: z.number().nullable().optional().default(null),
        complex: z.number().nullable().optional().default(null),
    }).passthrough().nullable().optional().default(null),
    trailerConfig: z.object({
        name: z.string().nullable().optional(),
        imageUrl: z.string().nullable().optional(),
        options: z.array(z.any()).optional().default([]),
    }).passthrough().optional(),
    // v1.4 Chunk C — per-model trailer assignments. The quote flow prefers
    // the first assignment as the default trailer. If the user wants to
    // browse beyond these, the catalog picker is still available.
    trailerAssignments: z.array(z.object({
        id: z.string().optional().default(() => `ta-${Date.now()}-${Math.random().toString(36).slice(2)}`),
        brandVendorId: z.string().nullable().optional().default(null),
        seriesId: z.string().nullable().optional().default(null),
        trailerId: z.string().min(1),
        code: z.string().nullable().optional().default(''),
        name: z.string().nullable().optional().default(''),
        imageUrl: z.string().nullable().optional().default(null),
        isDefault: z.boolean().optional().default(false),
        // v1.4 day-1: snapshot the trailer's specs + factory options on the
        // assignment so the card in the editor can show them inline without
        // re-fetching. Kept loose so future catalog additions flow through.
        specifications: z.any().optional().nullable(),
        options: z.array(z.any()).optional().default([]),
    }).passthrough()).optional().default([]),
}).passthrough();

type ModelFormValues = z.infer<typeof highfieldModelSchema>;
/** react-hook-form's Path/ArrayPath types collapse to `never` when the form type has a
 *  top-level index signature (introduced by the schema's `.passthrough()`), which breaks
 *  every `useFieldArray` name in this file. Strip the index signature for TYPING only —
 *  runtime validation still passes unknown keys through untouched. */
type ModelFormData = { [K in keyof ModelFormValues as string extends K ? never : K]: ModelFormValues[K] };

const CollapsibleCardHeader = ({ title, count, onAdd }: { title: string, count?: number, onAdd?: () => void }) => (
    <div className="flex items-center justify-between py-4 px-6 border-b bg-card select-none text-left">
        <div className="flex items-center gap-3 text-left">
            <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full border shadow-sm hover:bg-accent transition-colors group-data-[state=open]:bg-muted">
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
    featureName: string | null
}) {
    const [search, setSearch] = useState('');
    const filteredVariants = useMemo(() => {
        if (!search) return variants;
        const lower = search.toLowerCase();
        return variants.filter(v => v.name.toLowerCase().includes(lower) || v.sku?.toLowerCase().includes(lower));
    }, [variants, search]);

    const handleToggle = (id: string) => {
        const next = value.includes(id) ? value.filter(vId => vId !== id) : [...value, id];
        onChange(next);
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-4xl h-[85vh] flex flex-col p-0 overflow-hidden rounded-[2rem] border-4 shadow-2xl">
                <DialogHeader className="p-8 border-b bg-muted/10">
                    <DialogTitle className="text-2xl font-black uppercase tracking-tight flex items-center gap-3"><ListChecks className="h-6 w-6 text-primary" />SKU Compatibility: {featureName}</DialogTitle>
                </DialogHeader>
                <div className="flex-1 min-h-0 flex flex-col md:flex-row">
                    <div className="flex-1 flex flex-col min-w-0 border-r">
                        <div className="p-6 border-b bg-muted/5">
                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="Search variants..." className="pl-10 h-12 font-bold" value={search} onChange={(e) => setSearch(e.target.value)} />
                            </div>
                        </div>
                        <ScrollArea className="flex-1">
                            <div className="p-6 space-y-2">
                                {filteredVariants.map(v => (
                                    <div key={v.id} className={cn("flex items-center gap-4 p-4 rounded-2xl cursor-pointer border-2 transition-all", value.includes(v.id) ? "bg-primary/5 border-primary/20" : "hover:bg-slate-50 border-slate-100")} onClick={() => handleToggle(v.id)}>
                                        <Checkbox checked={value.includes(v.id)} onCheckedChange={() => handleToggle(v.id)} />
                                        <div className="min-w-0"><p className="text-sm font-black uppercase truncate">{abbreviateDisplayName(v.name)}</p><p className="text-[9px] font-mono text-muted-foreground">{v.sku}</p></div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>
                    <div className="w-full md:w-[320px] shrink-0 bg-muted/5 flex flex-col">
                        <div className="p-6 border-b bg-background flex items-center justify-between"><h4 className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Staged</h4><Badge className="font-black h-5 text-[9px] bg-primary">{value.length}</Badge></div>
                        <ScrollArea className="flex-1">
                            <div className="p-6 space-y-2">{variants.filter(v => value.includes(v.id)).map(v => (<div key={v.id} className="relative bg-white border-2 p-3 rounded-xl shadow-sm"><p className="text-[11px] font-black uppercase truncate pr-6">{abbreviateDisplayName(v.name)}</p><Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6" onClick={() => handleToggle(v.id)}><X className="h-3 w-3" /></Button></div>))}</div>
                        </ScrollArea>
                    </div>
                </div>
                <DialogFooter className="p-8 border-t bg-muted/10 gap-3">
                    <Button variant="outline" onClick={onClose} className="h-12 px-8 rounded-xl font-black uppercase text-[10px] border-2">Cancel</Button>
                    <Button onClick={onClose} className="h-12 px-10 rounded-xl font-black uppercase text-[10px] shadow-xl bg-primary text-white">Apply Matrix</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function OptionalFeatureItem({ index, remove, categories, variants, allFeatures }: { index: number; remove: (index: number) => void; categories: string[], variants: any[], allFeatures: any[] }) {
    const { control } = useFormContext<ModelFormData>();
    const imageUrl = useWatch({ control, name: `optionalFeatures.${index}.imageUrl` });
    const name = useWatch({ control, name: `optionalFeatures.${index}.name` });
    const category = useWatch({ control, name: `optionalFeatures.${index}.category` });
    const isStandard = useWatch({ control, name: `optionalFeatures.${index}.isStandard` });
    const storage = useStorage();
    const [isUploading, setIsUploading] = useState(false);
    const [isCompDialogOpen, setIsCompDialogOpen] = useState(false);

    const isConsole = category === 'Consoles';
    // FCT consoles come with a seat already included, so they don't need a paired dynamic seat.
    // Only GT consoles (non-FCT) support seat linking.
    const isGTConsole = isConsole && !name?.toUpperCase().includes('FCT');
    const currentId = allFeatures?.[index]?.id;
    const seatOptions = useMemo(() => allFeatures.filter((f: any) => f.category === 'Seats' && f.id !== currentId), [allFeatures, currentId]);

    return (
        <Collapsible className="group/item overflow-hidden rounded-xl border bg-card shadow-sm transition-all hover:border-primary/20 text-left">
            <div className={cn("flex items-center justify-between p-3 border-b text-left", isStandard ? "bg-primary/5" : "bg-muted/10")}>
                <div className="flex items-center gap-3 min-w-0 pr-10 text-left">
                    <CollapsibleTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 rounded-full border shadow-sm"><ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]/item:rotate-180" /></Button></CollapsibleTrigger>
                    <div className="flex items-center gap-2 min-w-0">{isStandard && <Star className="h-3 w-3 text-primary fill-primary" />}{name ? (() => { const { base, color } = formatOptionDisplayLabel(name); return <><span className="font-black text-[10px] uppercase truncate">{base}</span>{color && <span className="font-black text-[10px] uppercase text-primary shrink-0">({color})</span>}</>; })() : <span className="font-black text-[10px] uppercase">Unnamed Option</span>}</div>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive opacity-0 group-hover/item:opacity-100 transition-opacity" onClick={() => remove(index)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
            <CollapsibleContent>
                <div className="p-5 space-y-6 bg-slate-50/30 text-left">
                    <div className="flex gap-5 items-start text-left">
                        <div className="w-24 shrink-0 text-left">
                            <FormField control={control} name={`optionalFeatures.${index}.imageUrl`} render={({ field }) => (
                                <div className="relative aspect-square w-full rounded-xl border-2 border-dashed bg-white group/feat-img shadow-inner overflow-hidden">
                                    {isUploading && <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20"><Loader2 className="h-6 w-6 animate-spin text-white" /></div>}
                                    {imageUrl ? (<><Image src={imageUrl} alt="Feature" fill className="object-contain p-2" /><div className="absolute inset-0 bg-black/40 opacity-0 group-hover/feat-img:opacity-100 transition-opacity flex items-center justify-center"><Button type="button" variant="destructive" size="icon" className="h-6 w-6 rounded-md" onClick={() => field.onChange(null)}><X className="h-3 w-3" /></Button></div></>) : (
                                        <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-slate-50 transition-colors"><Upload className="w-4 h-4 text-slate-300 mb-1" /><span className="text-[8px] text-slate-400 uppercase font-black tracking-widest">Render</span><FormControl><Input type="file" className="hidden" accept="image/*" onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (file && storage) { setIsUploading(true); try { const url = await uploadFileToStorage(storage, file, `features/${Date.now()}-${file.name}`); field.onChange(url); } finally { setIsUploading(false); } }
                                        }} /></FormControl></label>
                                    )}
                                </div>
                            )} />
                        </div>
                        <div className="flex-1 grid grid-cols-2 gap-3 text-left">
                            <FormField control={control} name={`optionalFeatures.${index}.name`} render={({ field }) => ( <FormItem className="col-span-2 sm:col-span-1"><FormLabel className="text-[8px] font-black uppercase text-muted-foreground">Display Name</FormLabel><FormControl><Input placeholder="Name" className="h-9 font-bold" {...field} value={field.value ?? ''} /></FormControl></FormItem> )} />
                            <FormField control={control} name={`optionalFeatures.${index}.code`} render={({ field }) => ( <FormItem className="col-span-2 sm:col-span-1"><FormLabel className="text-[8px] font-black uppercase text-muted-foreground">Factory Code</FormLabel><FormControl><Input placeholder="CODE" className="h-9 font-mono font-bold uppercase" {...field} value={field.value ?? ''} /></FormControl></FormItem> )} />
                            <FormField control={control} name={`optionalFeatures.${index}.category`} render={({ field }) => ( <FormItem className="col-span-2 sm:col-span-1"><FormLabel className="text-[8px] font-black uppercase text-muted-foreground">Category Matrix</FormLabel><Select onValueChange={field.onChange} value={field.value || 'none'}><FormControl><SelectTrigger className="h-9 font-bold"><SelectValue /></SelectTrigger></FormControl><SelectContent className="rounded-xl border-2"><SelectItem value="none" className="font-bold py-2 uppercase text-[9px]">Uncategorized</SelectItem>{categories.map(cat => (<SelectItem key={cat} value={cat} className="font-bold py-2 uppercase text-[9px]">{cat}</SelectItem>))}</SelectContent></Select></FormItem> )} />
                            <FormField control={control} name={`optionalFeatures.${index}.sellPriceExclGst`} render={({ field }) => ( <FormItem className="col-span-2 sm:col-span-1"><FormLabel className="text-[8px] font-black uppercase text-primary">Sell (Excl.)</FormLabel><FormControl><div className="relative"><DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-primary opacity-40" /><Input type="number" step="0.01" className="h-9 pl-7 font-black" {...field} value={field.value ?? ''} /></div></FormControl></FormItem> )} />
                        </div>
                    </div>
                    <div className="space-y-4 pt-4 border-t border-dashed text-left">
                        <div className="flex items-center justify-between p-3 rounded-xl bg-white border-2 text-left">
                            <FormField control={control} name={`optionalFeatures.${index}.isStandard`} render={({ field }) => ( <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} className="h-4 w-4 rounded" /></FormControl><FormLabel className="text-[9px] font-black uppercase tracking-widest cursor-pointer text-primary">Pre-selected Baseline</FormLabel></FormItem> )} />
                            {isStandard && <Badge className="bg-primary text-white border-none font-black text-[7px] uppercase px-2">STANDARD</Badge>}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                            <div className="space-y-2 text-left">
                                <FormLabel className="text-[8px] font-black uppercase text-muted-foreground ml-1">SKU Compatibility</FormLabel>
                                <FormField control={control} name={`optionalFeatures.${index}.applicableVariantIds`} render={({ field }) => (
                                    <><Button type="button" variant="outline" className="w-full h-10 justify-between px-4 font-black uppercase text-[9px] bg-white border-2 rounded-lg" onClick={() => setIsCompDialogOpen(true)}><span>{field.value?.length > 0 ? `${field.value.length} SKUs LINKED` : 'DEFINE SKU ACCESS'}</span><ChevronRight className="h-3 w-3 opacity-40" /></Button><SkuCompatibilityDialog isOpen={isCompDialogOpen} onClose={() => setIsCompDialogOpen(false)} variants={variants} value={field.value || []} onChange={field.onChange} featureName={name} /></>
                                )} />
                            </div>
                            {isGTConsole && (
                                <div className="space-y-2 text-left">
                                    <FormLabel className="text-[8px] font-black uppercase text-muted-foreground ml-1">Paired Dynamic Seat</FormLabel>
                                    <FormField control={control} name={`optionalFeatures.${index}.associatedSeatId`} render={({ field }) => (
                                        <Popover><PopoverTrigger asChild><Button variant="outline" className="w-full h-10 justify-between px-4 font-black uppercase text-[9px] bg-white border-2 rounded-lg"><span className="truncate">{field.value ? abbreviateDisplayName(seatOptions.find((s: any) => s.id === field.value)?.name || 'SEAT LINKED') : 'NO PAIRED SEAT'}</span><ChevronRight className="h-3 w-3 opacity-40" /></Button></PopoverTrigger><PopoverContent className="w-[300px] p-0 rounded-2xl border-4 shadow-2xl" align="start"><Command className="rounded-xl"><CommandInput placeholder="Search Seats..." className="h-10 font-bold" /><CommandList className="max-h-[250px]"><CommandEmpty className="p-4 text-center text-[9px] font-black uppercase text-slate-400">No matching seats.</CommandEmpty><CommandGroup className="p-1"><CommandItem onSelect={() => field.onChange(null)} className="font-black text-[9px] uppercase py-2 rounded-lg">Clear Linkage</CommandItem>{seatOptions.map((seat: any) => (<CommandItem key={seat.id} onSelect={() => field.onChange(seat.id)} className="font-bold text-[10px] uppercase py-2 px-3 rounded-lg flex items-center justify-between aria-selected:bg-primary aria-selected:text-white"><span className="truncate">{abbreviateDisplayName(seat.name)}</span>{field.value === seat.id && <Check className="h-3 w-3" />}</CommandItem>))}</CommandGroup></CommandList></Command></PopoverContent></Popover>
                                    )} />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}

function abbreviateColorToken(color: string): string {
    return color.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase();
}

function abbreviateColorSlashes(colorStr: string): string {
    return colorStr.split('/').map(c => abbreviateColorToken(c)).join('/');
}

function abbreviateVariantName(name: string): string {
    const sepIdx = name.indexOf(' — ');
    if (sepIdx === -1) return name;
    const modelPart = name.slice(0, sepIdx);
    const colorPart = name.slice(sepIdx + 3);
    return `${modelPart} — ${abbreviateColorSlashes(colorPart)}`;
}

/** Normalize & spacing and extract first color from parenthetical for option display */
function formatOptionDisplayLabel(name: string): { base: string; color: string | null } {
    const normalized = name.replace(/\s*&\s*/g, ' & ').replace(/\s+/g, ' ').trim();
    const parenMatch = normalized.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    if (!parenMatch) return { base: normalized, color: null };
    const base = parenMatch[1].trim();
    const firstColor = parenMatch[2].split('/')[0].trim();
    const color = firstColor
        ? firstColor.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
        : null;
    return { base, color };
}

function abbreviateDisplayName(name: string): string {
    // Abbreviate color info in parentheses e.g. "(BLACK / CARBON)" → "(B/C)"
    // and after " — " separator e.g. "CL380LS — WHITE / WHITE / WOOD DARK" → "CL380LS — W/W/WD"
    let result = name.replace(/\(([^)]*\/[^)]*)\)/g, (_match, colors: string) => {
        return `(${abbreviateColorSlashes(colors)})`;
    });
    const sepIdx = result.indexOf(' — ');
    if (sepIdx !== -1) {
        const modelPart = result.slice(0, sepIdx);
        const colorPart = result.slice(sepIdx + 3);
        result = `${modelPart} — ${abbreviateColorSlashes(colorPart)}`;
    }
    return result;
}

function VariantRow({ v, vendorId, rangeId, modelId }: { v: any; vendorId: string; rangeId: string; modelId: string }) {
    const firestore = useFirestore();
    const storage = useStorage();
    const [uploading, setUploading] = useState(false);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !storage) return;
        setUploading(true);
        try {
            const url = await uploadFileToStorage(storage, file, `variants/${v.id}/render-${Date.now()}`);
            await updateDoc(doc(firestore, `data-warehouse/${vendorId}/ranges/${rangeId}/models/${modelId}/variants`, v.id), { imageUrl: url });
        } finally {
            setUploading(false);
        }
    };

    const handleImageRemove = async (e: React.MouseEvent) => {
        e.stopPropagation();
        await updateDoc(doc(firestore, `data-warehouse/${vendorId}/ranges/${rangeId}/models/${modelId}/variants`, v.id), { imageUrl: deleteField() });
    };

    return (
        <div className="flex items-center justify-between p-3 rounded-xl border bg-slate-50 hover:border-primary/20 transition-all group/v text-left">
            <div className="flex items-center gap-3 min-w-0 text-left">
                <div className="relative shrink-0">
                <label className="relative h-10 w-10 rounded-lg bg-white border shadow-inner flex items-center justify-center overflow-hidden shrink-0 cursor-pointer group/img hover:border-primary/40 transition-colors">
                    {uploading
                        ? <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        : v.imageUrl
                            ? <Image src={v.imageUrl} alt={v.name} fill className="object-contain p-1" />
                            : <Ship className="h-5 w-5 text-slate-200 group-hover/img:text-primary/30 transition-colors" />
                    }
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
                    {v.imageUrl && !uploading && (
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                            <Upload className="h-3 w-3 text-white" />
                        </div>
                    )}
                </label>
                {v.imageUrl && !uploading && (
                    <button onClick={handleImageRemove} className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover/v:opacity-100 transition-opacity z-10 hover:scale-110">
                        <X className="h-2.5 w-2.5" />
                    </button>
                )}
                </div>
                <div className="min-w-0 text-left">
                    <p className="font-black text-[10px] uppercase tracking-tight truncate">{abbreviateDisplayName(v.displayName || v.name)}</p>
                    <p className="text-[8px] font-mono font-bold text-primary uppercase mt-0.5">{v.sku || 'NO SKU'}</p>
                </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className="font-black text-[7px] uppercase tracking-widest h-4 px-1.5">{v.material}</Badge>
            </div>
        </div>
    );
}

export function VariantsSection({ model, vendorId, rangeId }: { model: any, vendorId: string, rangeId: string }) {
    const firestore = useFirestore();
    const variantsQuery = useMemoFirebase(() => vendorId && rangeId ? collection(firestore, `data-warehouse/${vendorId}/ranges/${rangeId}/models/${model.id}/variants`) : null, [firestore, vendorId, rangeId, model.id]);
    const { data: variants, isLoading: variantsLoading } = useCollection<any>(variantsQuery);

    if (variantsLoading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

    return (
        <Collapsible className="group overflow-hidden rounded-xl border bg-card shadow-sm text-left" defaultOpen>
            <CollapsibleCardHeader title="Boat Variants & SKUs" count={variants?.length || 0} />
            <CollapsibleContent>
                <CardContent className="p-6 space-y-3 text-left">
                    {variants && variants.length > 0 ? (
                        <div className="grid gap-2 text-left">
                            {variants.map((v) => (
                                <VariantRow key={v.id} v={v} vendorId={vendorId} rangeId={rangeId} modelId={model.id} />
                            ))}
                        </div>
                    ) : (<div className="py-8 text-center flex flex-col items-center gap-2 opacity-20 border-2 border-dashed rounded-2xl"><Ship className="h-8 w-8" /><p className="text-[9px] font-black uppercase tracking-widest">No variants defined.</p></div>)}
                </CardContent>
            </CollapsibleContent>
        </Collapsible>
    );
}

export function VisualAssetsCard({ model, isModuleView }: { model: any, isModuleView: boolean }) {
    const { control, watch, setValue } = useFormContext<ModelFormData>();
    const storage = useStorage();
    const [isCoverUploading, setIsCoverUploading] = useState(false);
    const [isGalleryUploading, setIsGalleryUploading] = useState(false);
    
    const coverImageUrl = watch("coverImageUrl");
    const galleryUrls = watch("galleryImageUrls") || [];
    // RHF's FieldArrayPath excludes primitive arrays (string[]) — works fine at runtime.
    const { append: appendGalleryImage, remove: removeGalleryImage } = useFieldArray({ control, name: 'galleryImageUrls' as any });

    return (
        <Collapsible className="group overflow-hidden rounded-xl border bg-card shadow-sm text-left" defaultOpen>
            <CollapsibleCardHeader title={isModuleView ? "Visual Config" : "Main Cover & Gallery"} count={galleryUrls.length + (coverImageUrl ? 1 : 0)} />
            <CollapsibleContent>
                <div className="space-y-0 text-left">
                    <div className="relative aspect-[16/10] w-full bg-slate-50 group text-left">
                        {isCoverUploading && <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20"><Loader2 className="h-8 w-8 animate-spin text-white" /></div>}
                        {coverImageUrl ? (
                            <div className="h-full w-full flex items-center justify-center relative text-left">
                                <Image src={coverImageUrl} alt="Cover" fill className="object-contain p-6" />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-10">
                                    <Button type="button" variant="secondary" size="icon" className="font-black uppercase text-[9px] h-7 px-3" onClick={(e) => {
                                        e.preventDefault();
                                        (e.currentTarget.nextElementSibling as HTMLInputElement)?.click();
                                    }}>Replace</Button>
                                    <input type="file" className="hidden" accept="image/*" onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (file && storage) { setIsCoverUploading(true); try { const url = await uploadFileToStorage(storage, file, `models/${model.id}/cover-${Date.now()}`); setValue('coverImageUrl', url, { shouldDirty: true }); } finally { setIsCoverUploading(false); e.target.value = ''; } }
                                    }} />
                                    <Button type="button" variant="destructive" size="icon" className="font-black uppercase text-[9px] h-7 px-3" onClick={() => setValue('coverImageUrl', null, { shouldDirty: true })}>Remove</Button>
                                </div>
                            </div>
                        ) : (
                            <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-slate-100 transition-all text-left">
                                <ImageIcon className="w-8 h-8 mb-2 text-slate-300" />
                                <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Set Build Render</span>
                                <FormControl><Input type="file" className="hidden" accept="image/*" onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (file && storage) { setIsCoverUploading(true); try { const url = await uploadFileToStorage(storage, file, `models/${model.id}/cover-${Date.now()}`); setValue('coverImageUrl', url, { shouldDirty: true }); } finally { setIsCoverUploading(false); } }
                                }} /></FormControl>
                            </label>
                        )}
                    </div>
                    <div className="p-6 space-y-2 bg-white border-t text-left">
                        <Label className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Gallery Assets</Label>
                        <div className="grid grid-cols-3 gap-2 text-left">
                            {galleryUrls.map((url, index) => (
                                <div key={index} className="relative aspect-square group rounded-lg overflow-hidden border-2 bg-slate-50 shadow-inner">
                                    <Image src={url} alt={`Gallery ${index}`} fill className="object-cover" />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><Button type="button" variant="destructive" size="icon" className="h-6 w-6 rounded-full" onClick={() => removeGalleryImage(index)}><Trash2 className="h-3 w-3" /></Button></div>
                                </div>
                            ))}
                            <label className="aspect-square flex flex-col items-center justify-center border-2 border-dashed rounded-lg cursor-pointer hover:bg-slate-50 transition-all group/add">
                                <Input type="file" multiple className="hidden" accept="image/*" onChange={async (e) => {
                                    const files = Array.from(e.target.files || []);
                                    setIsGalleryUploading(true);
                                    try { for (const file of files) { const url = await uploadFileToStorage(storage!, file, `models/${model.id}/gallery/${Date.now()}-${file.name}`); appendGalleryImage(url); } } finally { setIsGalleryUploading(false); }
                                }}/>
                                {isGalleryUploading ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Plus className="h-4 w-4 text-muted-foreground group-hover/add:scale-110 transition-transform" />}
                            </label>
                        </div>
                    </div>
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}

function RegistrationCard() {
  const { control } = useFormContext<ModelFormData>();

  return (
    <Card className="rounded-xl border-2 shadow-sm text-left overflow-hidden">
      <CardHeader className="bg-muted/10 border-b py-4 text-left">
        <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 text-left">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Registration & Compliance
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-6 text-left">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
            <FormField
                control={control}
                name="registration.price12Months"
                render={({ field }) => (
                    <FormItem className="space-y-3 text-left">
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">12 Months Boat Rego</FormLabel>
                        <FormControl>
                            <div className="relative">
                                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary opacity-40" />
                                <Input type="number" step="0.01" {...field} value={field.value ?? ''} className="h-11 pl-9 font-bold border-2" />
                            </div>
                        </FormControl>
                    </FormItem>
                )}
            />
            <FormField
                control={control}
                name="registration.stickerPrice"
                render={({ field }) => (
                    <FormItem className="space-y-3 text-left">
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Rego Stickers (Supply & Fit)</FormLabel>
                        <FormControl>
                            <div className="relative">
                                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary opacity-40" />
                                <Input type="number" step="0.01" {...field} value={field.value ?? ''} className="h-11 pl-9 font-bold border-2" />
                            </div>
                        </FormControl>
                    </FormItem>
                )}
            />
            <FormField
                control={control}
                name="registration.tenderToStickerPrice"
                render={({ field }) => (
                    <FormItem className="space-y-3 text-left">
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">"Tender To" Decals (Highfield Only)</FormLabel>
                        <FormControl>
                            <div className="relative">
                                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary opacity-40" />
                                <Input type="number" step="0.01" {...field} value={field.value ?? ''} className="h-11 pl-9 font-bold border-2" />
                            </div>
                        </FormControl>
                    </FormItem>
                )}
            />
            <FormField
                control={control}
                name="registration.trailerPrice12Months"
                render={({ field }) => (
                    <FormItem className="space-y-3 text-left">
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">12 Months Trailer Rego</FormLabel>
                        <FormControl>
                            <div className="relative">
                                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary opacity-40" />
                                <Input type="number" step="0.01" {...field} value={field.value ?? ''} className="h-11 pl-9 font-bold border-2" />
                            </div>
                        </FormControl>
                    </FormItem>
                )}
            />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Fit-Up Complexity ────────────────────────────────────────────────────────
/**
 * Heuristic that resolves `fitUpComplexity: 'auto'` into a concrete tier
 * (simple / medium / complex) by looking at the boat's first motor config
 * maxHp and any length spec. Same buckets the quote-flow uses so admin +
 * runtime stay consistent:
 *   • simple   — hull < 4m  OR  motor maxHp < 60
 *   • complex  — hull ≥ 5m  OR  motor maxHp ≥ 150
 *   • medium   — everything in between
 */
export function inferFitUpComplexity(model: any): 'simple' | 'medium' | 'complex' {
    const motorCfg = model?.specifications?.motorConfigurations?.[0];
    const maxHp = Number(motorCfg?.engines?.[0]?.maxHp || 0);
    const lenSpec = (model?.specifications?.otherSpecs || []).find((s: any) =>
        /overall\s*length|hull\s*length|length/i.test(s?.label || ''));
    const lenStr = String(lenSpec?.value || '').match(/[\d.]+/)?.[0];
    const lenN = lenStr ? parseFloat(lenStr) : NaN;
    const lenM = Number.isFinite(lenN) ? (lenN >= 1000 ? lenN / 1000 : (lenN >= 50 ? lenN / 100 : lenN)) : NaN;

    const simpleByLen = Number.isFinite(lenM) && lenM < 4;
    const simpleByHp = maxHp > 0 && maxHp < 60;
    const complexByLen = Number.isFinite(lenM) && lenM >= 5;
    const complexByHp = maxHp >= 150;
    if (complexByLen || complexByHp) return 'complex';
    if (simpleByLen || simpleByHp) return 'simple';
    return 'medium';
}

function FitUpComplexityCard({ model }: { model: any }) {
    const { control } = useFormContext<ModelFormData>();
    const value = useWatch({ control, name: 'fitUpComplexity' }) as 'auto' | 'simple' | 'medium' | 'complex' | undefined;
    const resolved = inferFitUpComplexity(model);
    const effective = value && value !== 'auto' ? value : resolved;
    const tone: Record<string, string> = {
        simple: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        medium: 'bg-amber-50 text-amber-800 border-amber-200',
        complex: 'bg-rose-50 text-rose-800 border-rose-200',
    };
    return (
        <Card className="rounded-xl border-2 shadow-sm text-left overflow-hidden">
            <CardHeader className="bg-muted/10 border-b py-4 text-left">
                <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 text-left">
                    <Wrench className="h-4 w-4 text-primary" />
                    Fit-Up Complexity
                </CardTitle>
                <CardDescription className="text-[10px] mt-1">
                    Drives the Suggested badge on the Simple / Medium / Complex tier package cards at quote time.
                </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-4 text-left">
                <FormField
                    control={control}
                    name="fitUpComplexity"
                    render={({ field }) => (
                        <FormItem className="space-y-3">
                            <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Complexity</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value ?? 'auto'}>
                                <FormControl>
                                    <SelectTrigger className="h-11 border-2 font-bold rounded-xl">
                                        <SelectValue placeholder="Auto (length + HP)" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="auto">Auto — infer from length + motor HP</SelectItem>
                                    <SelectItem value="simple">Simple — entry-level fit-up</SelectItem>
                                    <SelectItem value="medium">Medium — mid-tier fit-up</SelectItem>
                                    <SelectItem value="complex">Complex — premium / offshore fit-up</SelectItem>
                                </SelectContent>
                            </Select>
                        </FormItem>
                    )}
                />
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-50 border-2">
                    <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Quote Step 5 will suggest</span>
                    <Badge variant="outline" className={`${tone[effective]} text-[10px] font-black uppercase tracking-widest`}>
                        {effective}
                    </Badge>
                    {value === 'auto' || !value ? (
                        <span className="text-[9px] text-muted-foreground italic ml-auto">(auto)</span>
                    ) : null}
                </div>
                {/* v1.19 (Story 2.1.2) — Model-Specific Fit-Out Pricing.
                    Three optional ex-GST package prices that, when set,
                    short-circuit the per-item summation in the quote flow.
                    Leave blank to keep v1.18 behaviour. */}
                <div data-testid="fit-out-pricing-fields" className="space-y-2 mt-4 pt-4 border-t-2 border-slate-100">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Package pricing (ex GST)</p>
                    <p className="text-[9px] text-muted-foreground italic">Optional. When set, replaces the summed-item fit-out total in the quote. Leave blank to use the per-item catalog total.</p>
                    <div className="grid grid-cols-3 gap-2">
                        {(['basic', 'moderate', 'complex'] as const).map((tier) => (
                            <FormField
                                key={tier}
                                control={control}
                                name={`fitOutPricing.${tier}` as any}
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-[9px] font-black uppercase tracking-widest text-muted-foreground capitalize">{tier}</FormLabel>
                                        <FormControl>
                                            <Input
                                                type="number"
                                                step="100"
                                                min="0"
                                                value={field.value ?? ''}
                                                onChange={(e) => {
                                                    const v = e.target.value === '' ? null : parseFloat(e.target.value);
                                                    field.onChange(Number.isFinite(v) ? v : null);
                                                }}
                                                placeholder="$ —"
                                                className="h-10 border-2 font-bold rounded-xl text-xs"
                                            />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

// ── Standard Features ────────────────────────────────────────────────────────
function StandardFeaturesSection() {
    const { control } = useFormContext<ModelFormData>();
    const { fields, append, remove } = useFieldArray({ control, name: "standardFeatures" as any });
    const [bulkText, setBulkText] = useState('');

    const handleBulkImport = () => {
        const lines = bulkText.split('\n').filter(l => l.trim());
        lines.forEach(line => append(line.trim() as any));
        setBulkText('');
    };

    return (
        <Collapsible className="group overflow-hidden rounded-xl border bg-card shadow-sm text-left" defaultOpen>
            <CollapsibleCardHeader title="Standard Features" count={fields.length} onAdd={() => append('' as any)} />
            <CollapsibleContent>
                <CardContent className="space-y-4 pt-6 text-left">
                    <div className="grid gap-1.5 text-left">
                        {fields.map((field, index) => (
                            <div key={field.id} className="flex items-center gap-2 group/feat text-left">
                                <ListCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                <FormField
                                    control={control}
                                    name={`standardFeatures.${index}` as any}
                                    render={({ field: f }) => (
                                        <FormItem className="flex-1 text-left">
                                            <FormControl>
                                                <Input
                                                    {...f}
                                                    placeholder="e.g. Fully welded aluminium hull"
                                                    className="h-8 text-[10px] font-bold border-none bg-slate-50 hover:bg-slate-100 focus:bg-white rounded-lg shadow-none focus-visible:ring-1"
                                                />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive opacity-0 group-hover/feat:opacity-100 transition-opacity" onClick={() => remove(index)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        ))}
                    </div>
                    <div className="p-4 bg-slate-50/50 rounded-xl border-2 border-dashed border-slate-200 space-y-3 text-left">
                        <Textarea
                            placeholder="Paste features — one per line..."
                            className="bg-white min-h-[80px] rounded-lg border-2 font-bold text-[10px]"
                            value={bulkText}
                            onChange={e => setBulkText(e.target.value)}
                        />
                        <Button type="button" variant="outline" className="w-full h-9 font-black uppercase text-[9px] tracking-widest rounded-lg border-2 bg-white" onClick={handleBulkImport}>
                            Import Lines
                        </Button>
                    </div>
                </CardContent>
            </CollapsibleContent>
        </Collapsible>
    );
}

// ── General Specifications (otherSpecs) ───────────────────────────────────────
function SpecsSection() {
    const { control } = useFormContext<ModelFormData>();
    // RHF's ArrayPath can't see through the nested `.passthrough()` index signature on
    // `specifications` — the path is valid at runtime.
    const { fields, append, remove } = useFieldArray({ control, name: "specifications.otherSpecs" as any });
    const [bulkSpecs, setBulkSpecs] = useState('');

    const handleBulkImport = () => {
        const lines = bulkSpecs.split('\n').filter(l => l.trim());
        const newSpecs = lines.map(line => {
            const sep = line.indexOf(':');
            const label = sep !== -1 ? line.substring(0, sep).trim() : line.trim();
            const value = sep !== -1 ? line.substring(sep + 1).trim() : '';
            return { id: `spec-${Date.now()}-${Math.random()}`, label, value };
        });
        append(newSpecs);
        setBulkSpecs('');
    };

    return (
        <Collapsible className="group overflow-hidden rounded-xl border bg-card shadow-sm text-left" defaultOpen>
            <CollapsibleCardHeader title="General Specifications" count={fields.length} onAdd={() => append({ id: `spec-${Date.now()}`, label: '', value: '' })} />
            <CollapsibleContent>
                <CardContent className="space-y-4 pt-6 text-left">
                    <div className="grid gap-2 text-left">
                        {fields.map((field, index) => (
                            <div key={field.id} className="flex items-center gap-2 p-1.5 rounded-lg bg-slate-50 border-2 border-transparent hover:border-slate-100 transition-all group/field text-left">
                                <FormField control={control} name={`specifications.otherSpecs.${index}.label`} render={({ field }) => (
                                    <FormItem className="flex-1"><FormControl><Input placeholder="Param" className="h-8 text-[10px] font-bold border-none bg-transparent shadow-none" {...field} value={field.value ?? ''} /></FormControl></FormItem>
                                )} />
                                <div className="h-4 w-px bg-slate-200" />
                                <FormField control={control} name={`specifications.otherSpecs.${index}.value`} render={({ field }) => (
                                    <FormItem className="flex-1"><FormControl><Input placeholder="Value" className="h-8 text-[10px] font-black text-primary border-none bg-transparent shadow-none" {...field} value={field.value ?? ''} /></FormControl></FormItem>
                                )} />
                                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive opacity-0 group-hover/field:opacity-100 transition-opacity" onClick={() => remove(index)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        ))}
                    </div>
                    <div className="p-4 bg-slate-50/50 rounded-xl border-2 border-dashed border-slate-200 space-y-3 text-left">
                        <Textarea
                            placeholder="Paste specs (Key: Value) one per line..."
                            className="bg-white min-h-[100px] rounded-lg border-2 font-bold text-[10px]"
                            value={bulkSpecs}
                            onChange={e => setBulkSpecs(e.target.value)}
                        />
                        <Button type="button" variant="outline" className="w-full h-9 font-black uppercase text-[9px] tracking-widest rounded-lg border-2 bg-white" onClick={handleBulkImport}>
                            Sync Bulk Parameters
                        </Button>
                    </div>
                </CardContent>
            </CollapsibleContent>
        </Collapsible>
    );
}

// ── Motor Configurations ──────────────────────────────────────────────────────
function MotorConfigurationsSection() {
    const { control } = useFormContext<ModelFormData>();
    // RHF's ArrayPath can't see through the nested `.passthrough()` index signature on
    // `specifications` — the path is valid at runtime.
    const { fields, append, remove } = useFieldArray({ control, name: "specifications.motorConfigurations" as any });
    const configOptions = [
        { id: 'Single', label: 'Single Engine', engineCount: 1, engineLabels: ['Engine'] },
        { id: 'Twin', label: 'Twin Engines', engineCount: 2, engineLabels: ['Engine 1', 'Engine 2'] },
        { id: 'Triple', label: 'Triple Engines', engineCount: 3, engineLabels: ['Engine 1', 'Engine 2', 'Engine 3'] },
        { id: 'Quad', label: 'Quad Engines', engineCount: 4, engineLabels: ['Engine 1', 'Engine 2', 'Engine 3', 'Engine 4'] },
        { id: 'SingleWithAux', label: 'Single with Aux', engineCount: 2, engineLabels: ['Main Engine', 'Auxiliary Engine'] },
    ];

    return (
        <Collapsible className="group overflow-hidden rounded-xl border bg-card shadow-sm text-left" defaultOpen>
            <div className="flex items-center justify-between py-4 px-6 border-b bg-card select-none text-left">
                <div className="flex items-center gap-3 text-left">
                    <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full border shadow-sm hover:bg-accent group-data-[state=open]:bg-muted">
                            <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                        </Button>
                    </CollapsibleTrigger>
                    <div className="text-left">
                        <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em]">Motor Setup</CardTitle>
                        <span className="text-[8px] font-bold text-muted-foreground uppercase">{fields.length} Scenarios</span>
                    </div>
                </div>
                <Select onValueChange={(type) => {
                    const opt = configOptions.find(o => o.id === type);
                    if (opt) append({ type, engines: Array.from({ length: opt.engineCount }, (_, i) => ({ label: opt.engineLabels[i], minHp: 0, maxHp: 0, recommendedHp: 0 })) } as any);
                }}>
                    <SelectTrigger className="h-8 w-[160px] font-black text-[9px] uppercase tracking-widest border-2 rounded-lg">
                        <Plus className="h-3 w-3 mr-1.5 text-primary" /><SelectValue placeholder="Add Scenario" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-2">
                        {configOptions.map(opt => <SelectItem key={opt.id} value={opt.id} className="font-bold py-2 uppercase text-[9px]">{opt.label}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
            <CollapsibleContent>
                <CardContent className="p-6 space-y-4 text-left">
                    {fields.map((field, index) => (
                        <div key={field.id} className="relative p-4 bg-slate-50 border-2 rounded-2xl space-y-4 text-left">
                            <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 h-7 w-7 text-destructive" onClick={() => remove(index)}>
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                            <h4 className="font-black text-[10px] uppercase tracking-tighter text-primary flex items-center gap-2">
                                <Zap className="h-3 w-3 fill-current" />{(field as any).type?.replace(/([A-Z])/g, ' $1').trim()} Deployment
                            </h4>
                            <div className="grid gap-3 text-left">
                                {((field as any).engines || []).map((_engine: any, eIdx: number) => (
                                    <div key={eIdx} className="grid grid-cols-4 gap-3 items-end bg-white p-3 rounded-xl border text-left">
                                        <FormField control={control} name={`specifications.motorConfigurations.${index}.engines.${eIdx}.minHp`} render={({ field }) => (
                                            <FormItem className="space-y-1 text-left"><FormLabel className="text-[7px] font-black uppercase">Min HP</FormLabel><FormControl><Input type="number" className="h-7 text-[10px] font-black border-none bg-slate-50 rounded-md text-center" {...field} value={field.value ?? ''} /></FormControl></FormItem>
                                        )} />
                                        <FormField control={control} name={`specifications.motorConfigurations.${index}.engines.${eIdx}.maxHp`} render={({ field }) => (
                                            <FormItem className="space-y-1 text-left"><FormLabel className="text-[7px] font-black uppercase">Max HP</FormLabel><FormControl><Input type="number" className="h-7 text-[10px] font-black border-none bg-slate-50 rounded-md text-center" {...field} value={field.value ?? ''} /></FormControl></FormItem>
                                        )} />
                                        <FormField control={control} name={`specifications.motorConfigurations.${index}.engines.${eIdx}.recommendedHp`} render={({ field }) => (
                                            <FormItem className="space-y-1 text-left"><FormLabel className="text-[7px] font-black uppercase">Rec. HP</FormLabel><FormControl><Input type="number" className="h-7 text-[10px] font-black text-primary border-none bg-primary/5 rounded-md text-center" {...field} value={field.value ?? ''} /></FormControl></FormItem>
                                        )} />
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

// ── Trailer Assignments (v1.4 Chunk C) ────────────────────────────────────────
// Per-boat-model trailer picks. The quote flow prefers the first assignment
// as the default trailer; users can still browse the catalog for other
// trailers via the picker on Step 4.
export function TrailerAssignmentsSection() {
    const { control } = useFormContext<ModelFormData>();
    // Zod `.passthrough()` widens ModelFormData in ways that confuse RHF's
    // FieldArrayPath narrowing for this field. Casting the result keeps the
    // runtime behaviour identical but avoids the bogus `never` inference.
    const { fields, append, remove, update } = useFieldArray({
        control: control as any,
        name: 'trailerAssignments' as never,
    }) as unknown as {
        fields: any[];
        append: (value: any) => void;
        remove: (index: number) => void;
        update: (index: number, value: any) => void;
    };

    return (
        <Collapsible className="group/config overflow-hidden rounded-xl border bg-card shadow-sm text-left" defaultOpen>
            <CollapsibleCardHeader title="Trailer Options" count={fields.length} />
            <CollapsibleContent>
                <div className="p-6 space-y-4 text-left">
                    <p className="text-[11px] text-slate-500">
                        Trailers assigned to this model. The quote flow defaults to the <b>first assignment marked as default</b>.
                    </p>
                    {fields.length === 0 ? (
                        <p className="text-xs text-slate-400 italic py-4 text-center">
                            No trailers assigned yet. Use the picker below to attach one from the catalog.
                        </p>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {fields.map((field: any, idx) => (
                                <TrailerAssignmentCard
                                    key={field.id}
                                    field={field}
                                    onMakeDefault={() => {
                                        fields.forEach((f: any, i) => {
                                            if (i === idx) update(i, { ...f, isDefault: true });
                                            else if (f.isDefault) update(i, { ...f, isDefault: false });
                                        });
                                    }}
                                    onRemove={() => remove(idx)}
                                />
                            ))}
                        </div>
                    )}

                    <div className="pt-3 border-t">
                        <TrailerCatalogPicker
                            orgId={null}
                            value={null}
                            triggerLabel="Assign a trailer from catalog"
                            onChange={(snap) => {
                                if (!snap) return;
                                if (fields.some((f: any) => f.trailerId === snap.trailerId)) return;
                                append({
                                    id: `ta-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                                    brandVendorId: snap.brandVendorId ?? null,
                                    seriesId: snap.seriesId ?? null,
                                    trailerId: snap.trailerId,
                                    code: snap.code ?? '',
                                    name: snap.name ?? '',
                                    imageUrl: snap.imageUrl ?? null,
                                    isDefault: fields.length === 0,
                                    // v1.4 day-1: snapshot specs + options so the card can
                                    // display them inline without re-fetching the trailer doc.
                                    specifications: (snap as any).specifications ?? null,
                                    options: Array.isArray((snap as any).options) ? (snap as any).options : [],
                                });
                            }}
                        />
                    </div>
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}

// TrailerAssignmentCard — motor-style card in the boat model editor's
// Trailer Options tab. Shows image (with onError fallback), code, DEFAULT
// badge, and expands to reveal the trailer's factory options + specs.
function TrailerAssignmentCard({
    field,
    onMakeDefault,
    onRemove,
}: {
    field: any;
    onMakeDefault: () => void;
    onRemove: () => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const [imageFailed, setImageFailed] = useState(false);
    const options: any[] = Array.isArray(field.options) ? field.options : [];
    const specs = field.specifications || {};
    const hasSpecs = Object.values(specs).some(v => v != null && v !== '');
    const showImage = !!field.imageUrl && !imageFailed;

    return (
        <div className={cn(
            'group/trailer rounded-2xl border-2 bg-white shadow-sm overflow-hidden transition-all',
            field.isDefault ? 'border-primary/40 ring-2 ring-primary/10' : 'border-slate-100 hover:border-primary/30',
        )}>
            <button
                type="button"
                onClick={() => setExpanded(e => !e)}
                className="w-full text-left"
            >
                <div className="relative aspect-[16/9] bg-slate-50 border-b overflow-hidden">
                    {showImage ? (
                        <img
                            src={field.imageUrl}
                            alt={field.code || field.name || 'Trailer'}
                            className="w-full h-full object-contain p-3"
                            onError={() => setImageFailed(true)}
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            <Truck className="h-10 w-10 text-slate-200" />
                        </div>
                    )}
                    {field.isDefault && (
                        <Badge className="absolute bottom-2 left-2 bg-primary text-white border-none font-black text-[8px] uppercase tracking-widest px-2 py-0.5">
                            Default
                        </Badge>
                    )}
                </div>
                <div className="p-4 bg-background flex items-center justify-between gap-3 min-h-[56px]">
                    <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-black uppercase leading-tight tracking-tight truncate italic">
                            {field.code || field.trailerId}
                        </p>
                        {field.name && (
                            <p className="text-[9px] font-semibold text-slate-500 truncate mt-0.5">{field.name}</p>
                        )}
                    </div>
                    <ChevronDown className={cn('h-4 w-4 text-muted-foreground shrink-0 transition-transform', expanded && 'rotate-180')} />
                </div>
            </button>

            {expanded && (
                <div className="p-4 space-y-4 border-t bg-slate-50/30 animate-in slide-in-from-top-2 duration-200">
                    {hasSpecs && (
                        <div className="space-y-1.5">
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Specifications</p>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                                {specs.boatSizeMtr != null && <SpecRow label="Boat size" value={formatMetres(specs.boatSizeMtr)} />}
                                {specs.lengthMtr != null && <SpecRow label="Length" value={formatMetres(specs.lengthMtr)} />}
                                {specs.atmKg != null && <SpecRow label="ATM" value={`${specs.atmKg} kg`} />}
                                {specs.tareKg != null && <SpecRow label="Tare" value={`${specs.tareKg} kg`} />}
                                {specs.wheelSize && <SpecRow label="Wheels" value={String(specs.wheelSize)} />}
                                {specs.winch && <SpecRow label="Winch" value={String(specs.winch)} />}
                                {specs.betweenGuardsMm != null && <SpecRow label="Guards" value={`${specs.betweenGuardsMm} mm`} />}
                                {specs.plug && <SpecRow label="Plug" value={String(specs.plug)} />}
                            </div>
                        </div>
                    )}

                    {options.length > 0 ? (
                        <div className="space-y-1.5">
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Factory Options ({options.length})</p>
                            <div className="space-y-1">
                                {options.map((opt: any, i: number) => (
                                    <div key={opt.id || i} className="flex items-center justify-between gap-3 py-1.5 px-2 rounded-lg bg-white border border-slate-100 text-[10px]">
                                        <div className="min-w-0">
                                            <p className="font-semibold truncate">{opt.name || 'Option'}</p>
                                            {opt.description && <p className="text-[9px] text-slate-400 truncate">{opt.description}</p>}
                                        </div>
                                        {opt.sellPriceExclGst != null && opt.sellPriceExclGst > 0 && (
                                            <span className="font-mono tabular-nums text-slate-600 shrink-0">
                                                ${Number(opt.sellPriceExclGst).toLocaleString()}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <p className="text-[10px] text-slate-400 italic">No factory options on this trailer.</p>
                    )}

                    <div className="text-[10px] text-slate-400 italic border-t pt-3">
                        Dealer Fit options for this trailer come from the Trailer module's Dealer Fit
                        categories at quote time. Manage them in the Trailer module → Settings → Trailer
                        Dealer Fit Categories, then add selections from any trailer's detail sheet.
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 text-[10px] font-black uppercase tracking-widest"
                            onClick={onMakeDefault}
                            disabled={field.isDefault}
                        >
                            {field.isDefault ? 'Default' : 'Make default'}
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={onRemove}
                            className="text-red-500 hover:text-red-600 hover:bg-red-50 ml-auto"
                        >
                            <Trash2 className="h-3 w-3 mr-1" /> Remove
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

function SpecRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-2 py-0.5">
            <span className="text-slate-400">{label}</span>
            <span className="font-medium text-slate-700 tabular-nums">{value}</span>
        </div>
    );
}

// ── Technical Documents ───────────────────────────────────────────────────────
export function DocumentsSection() {
    const { control } = useFormContext<ModelFormData>();
    const { fields, append, remove } = useFieldArray({ control, name: "documents" });
    const storage = useStorage();
    const [isUploading, setIsUploading] = useState(false);
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [isNamingOpen, setIsNamingOpen] = useState(false);
    const [docName, setDocName] = useState('');
    const { toast } = useToast();

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setPendingFile(file);
        setDocName(file.name.replace(/\.[^/.]+$/, ''));
        setIsNamingOpen(true);
    };

    const handleUploadConfirm = async () => {
        if (!pendingFile || !storage || !docName.trim()) return;
        setIsUploading(true);
        setIsNamingOpen(false);
        try {
            const path = `documents/${Date.now()}-${pendingFile.name}`;
            const url = await uploadFileToStorage(storage, pendingFile, path);
            append({ id: `doc-${Date.now()}`, name: docName.trim(), url });
            toast({ title: "Document Synchronized", description: `${docName} is now live.` });
            setPendingFile(null);
            setDocName('');
        } catch (error: any) {
            toast({ variant: 'destructive', title: "Upload Failed", description: error.message });
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <>
            <Collapsible className="group overflow-hidden rounded-xl border bg-card shadow-sm text-left" defaultOpen>
                <CollapsibleCardHeader title="Technical Docs" count={fields.length} />
                <CollapsibleContent>
                    <CardContent className="pt-6 space-y-4 text-left">
                        <div className="grid gap-2 text-left">
                            {fields.map((field, index) => (
                                <div key={field.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/5 group/doc text-left">
                                    <FileText className="h-5 w-5 text-primary/40 shrink-0" />
                                    <div className="flex-1 min-w-0 text-left">
                                        <FormField control={control} name={`documents.${index}.name`} render={({ field }) => (
                                            <FormControl><Input {...field} value={field.value ?? ''} className="h-7 text-[11px] font-bold border-none bg-transparent shadow-none focus-visible:ring-0 p-0" placeholder="Document Name" /></FormControl>
                                        )} />
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 hover:bg-primary/10 text-primary" asChild>
                                            <a href={(field as any).url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
                                        </Button>
                                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive opacity-0 group-hover/doc:opacity-100 transition-opacity" onClick={() => remove(index)}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <label className="flex flex-col items-center justify-center w-full py-6 border-2 border-dashed rounded-xl cursor-pointer bg-muted/5 hover:bg-muted/10 transition-all group/upload border-muted-foreground/20">
                            {isUploading
                                ? <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                : (<><Upload className="h-6 w-6 text-muted-foreground/40 group-hover/upload:text-primary transition-colors mb-2" /><p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Upload & Name Document</p></>)
                            }
                            <Input type="file" className="hidden" onChange={handleFileSelect} disabled={isUploading} />
                        </label>
                    </CardContent>
                </CollapsibleContent>
            </Collapsible>

            <Dialog open={isNamingOpen} onOpenChange={setIsNamingOpen}>
                <DialogContent className="sm:max-w-md rounded-2xl border-4 shadow-2xl p-0 overflow-hidden">
                    <DialogHeader className="p-8 border-b bg-muted/5">
                        <DialogTitle className="text-2xl font-black uppercase tracking-tight italic">Asset Identity</DialogTitle>
                        <DialogDescription className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">Assign a label to this document</DialogDescription>
                    </DialogHeader>
                    <div className="p-8 space-y-4 text-left">
                        <div className="space-y-2 text-left">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Document Name</Label>
                            <Input
                                autoFocus
                                value={docName}
                                onChange={e => setDocName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleUploadConfirm()}
                                className="h-12 font-bold border-2 rounded-xl"
                                placeholder="e.g. FCT Console Wiring Diagram"
                            />
                        </div>
                    </div>
                    <DialogFooter className="p-8 bg-muted/5 border-t gap-3">
                        <DialogClose asChild><Button variant="outline" className="h-12 px-8 rounded-xl font-black uppercase text-[10px] border-2">Cancel</Button></DialogClose>
                        <Button onClick={handleUploadConfirm} disabled={!docName.trim()} className="h-12 px-10 rounded-xl font-black uppercase text-[10px] shadow-xl bg-primary text-white">
                            Initialize Upload
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

// ── Rules / Guardrails ────────────────────────────────────────────────────────
function RulesSection({ model, modelCode }: { model: any; modelCode: string }) {
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
            const currentRules = (control as any)._formValues.rules || [];
            snap.docs.forEach(d => d.id !== model.id && batch.update(d.ref, { rules: currentRules }));
            await batch.commit();
            toast({ title: "Rules Synchronized" });
        } catch {
            toast({ variant: 'destructive', title: "Sync Failed" });
        } finally {
            setIsSyncing(false);
        }
    };

    const featureOptions = useMemo(() => optionalFeatures.map((f: any) => ({ id: f.id, label: `${f.name}${f.code ? ` (${f.code})` : ''}` })), [optionalFeatures]);

    return (
        <Collapsible className="group overflow-hidden rounded-xl border bg-card shadow-sm text-left" defaultOpen>
            <div className="flex items-center justify-between py-4 px-6 border-b bg-card select-none text-left">
                <div className="flex items-center gap-3 text-left">
                    <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full border shadow-sm hover:bg-accent group-data-[state=open]:bg-muted">
                            <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                        </Button>
                    </CollapsibleTrigger>
                    <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em]">Guardrails</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                    <Button type="button" variant="secondary" className="h-8 px-4 font-black uppercase text-[8px] rounded-lg" onClick={handleSyncRules} disabled={isSyncing}>
                        {isSyncing ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <RefreshCw className="h-3 w-3 mr-1.5" />} Sync Series
                    </Button>
                    <Button type="button" variant="outline" className="h-8 px-4 font-black uppercase text-[8px] rounded-lg border-2" onClick={() => append({ id: `rule-${Date.now()}`, sourceType: 'option', sourceOptionId: '', type: 'include', targetOptionIds: [] } as any)}>
                        <Plus className="h-3 w-3 mr-1.5" /> New Constraint
                    </Button>
                </div>
            </div>
            <CollapsibleContent>
                <CardContent className="p-6 space-y-3 text-left">
                    {fields.map((field, idx) => (
                        <div key={field.id} className="p-4 rounded-xl border-2 bg-slate-50 relative group/rule text-left">
                            <div className="grid grid-cols-3 gap-4 pr-8 text-left">
                                <FormField control={control} name={`rules.${idx}.sourceOptionId` as any} render={({ field }) => (
                                    <FormItem><Select onValueChange={field.onChange} value={field.value as string}><FormControl><SelectTrigger className="h-9 font-bold text-[10px] border-2 bg-white"><SelectValue placeholder="If..." /></SelectTrigger></FormControl><SelectContent>{featureOptions.map(opt => <SelectItem key={opt.id} value={opt.id} className="font-bold py-2 uppercase text-[9px]">{opt.label}</SelectItem>)}</SelectContent></Select></FormItem>
                                )} />
                                <FormField control={control} name={`rules.${idx}.type` as any} render={({ field }) => (
                                    <FormItem><Select onValueChange={field.onChange} value={field.value as string}><FormControl><SelectTrigger className="h-9 font-black text-[10px] border-2 bg-white"><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="include" className="font-black py-2 uppercase text-[9px]">MUST INCLUDE</SelectItem><SelectItem value="exclude" className="font-black py-2 uppercase text-[9px]">EXCLUDES</SelectItem></SelectContent></Select></FormItem>
                                )} />
                                <FormField control={control} name={`rules.${idx}.targetOptionIds` as any} render={({ field }) => (
                                    <FormItem><Popover><PopoverTrigger asChild><Button variant="outline" className="w-full h-9 justify-between px-3 font-bold border-2 bg-white text-[10px]"><span>{(field.value as any)?.length > 0 ? `${(field.value as any).length} TARGETS` : 'Targets...'}</span><ChevronRight className="h-3 w-3 opacity-40" /></Button></PopoverTrigger><PopoverContent className="w-[280px] p-0 rounded-xl border-4 shadow-2xl"><Command><CommandInput placeholder="Search..." className="h-9" /><CommandList><CommandGroup>{featureOptions.map(opt => (<CommandItem key={opt.id} onSelect={() => { const cur = (field.value as string[]) || []; field.onChange(cur.includes(opt.id) ? cur.filter(i => i !== opt.id) : [...cur, opt.id]); }} className="font-bold uppercase text-[9px] py-2.5 flex items-center justify-between"><span>{opt.label}</span>{(field.value as string[])?.includes(opt.id) && <Check className="h-3 w-3 text-primary" />}</CommandItem>))}</CommandGroup></CommandList></Command></PopoverContent></Popover></FormItem>
                                )} />
                            </div>
                            <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 h-7 w-7 text-destructive opacity-0 group-hover/rule:opacity-100 transition-opacity" onClick={() => remove(idx)}>
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    ))}
                </CardContent>
            </CollapsibleContent>
        </Collapsible>
    );
}

export function HighfieldModelEditor({ model, vendorId, rangeId, isModuleView }: { model: any, vendorId: string, rangeId: string, isModuleView?: boolean }) {
    const { control, watch, setValue } = useFormContext<ModelFormData>();
    const { fields: optionalFeatureFields, append: appendOptionalFeature, remove: removeOptionalFeature } = useFieldArray({ control, name: "optionalFeatures" });
    const watchedOptionalFeatures = useWatch({ control, name: 'optionalFeatures' }) || [];
    const [newCategoryName, setNewCategoryName] = useState('');
    const firestore = useFirestore();

    const variantsQuery = useMemoFirebase(() => vendorId && rangeId ? collection(firestore, `data-warehouse/${vendorId}/ranges/${rangeId}/models/${model.id}/variants`) : null, [firestore, vendorId, rangeId, model.id]);
    const { data: variants = [] } = useCollection<any>(variantsQuery);

    const categorizedFeatures = useMemo(() => {
        const features = optionalFeatureFields.map((field, idx) => ({ field, idx, data: watchedOptionalFeatures[idx] }));
        const groups: Record<string, typeof features> = {};
        features.forEach(item => { 
            const cat = item.data?.category || 'General Options'; 
            if (!groups[cat]) groups[cat] = []; 
            groups[cat].push(item); 
        });
        return Object.entries(groups).sort(([a], [b]) => {
            if (a === 'Consoles') return -1; if (b === 'Consoles') return 1;
            if (a === 'Seats') return -1; if (b === 'Seats') return 1;
            if (a === 'General Options') return 1; if (b === 'General Options') return -1;
            return a.localeCompare(b);
        });
    }, [optionalFeatureFields, watchedOptionalFeatures]);

    return (
        <div className="space-y-8 pb-32 text-left">
            <div className="grid grid-cols-1 lg:grid-cols-7 gap-8 items-start text-left">
                <div className="lg:col-span-4 space-y-8 min-w-0 text-left">
                    <VariantsSection model={model} vendorId={vendorId} rangeId={rangeId} />
                    <RegistrationCard />
                    <FitUpComplexityCard model={model} />
                    <StandardFeaturesSection />
                    <SpecsSection />
                    <MotorConfigurationsSection />
                    <TrailerAssignmentsSection />
                </div>
                <div className="lg:col-span-3 space-y-8 min-w-0 text-left">
                    <VisualAssetsCard model={model} isModuleView={!!isModuleView} />

                    <Collapsible className="group/config overflow-hidden rounded-xl border bg-card shadow-sm text-left" defaultOpen>
                        <CollapsibleCardHeader title="Factory Configurator" />
                        <CollapsibleContent>
                            <div className="p-6 space-y-8 text-left">
                                <div className="inline-flex items-center p-1.5 bg-white rounded-full border-2 shadow-sm focus-within:border-primary/40 transition-colors w-full text-left">
                                    <Input 
                                        placeholder="CREATE CATEGORY..." 
                                        value={newCategoryName} 
                                        onChange={e => setNewCategoryName(e.target.value)} 
                                        className="h-8 flex-1 border-none bg-transparent shadow-none font-black text-[10px] uppercase tracking-[0.2em] focus-visible:ring-0 pl-4" 
                                    />
                                    <Button 
                                        type="button" 
                                        size="sm" 
                                        className="h-8 px-5 rounded-full font-black uppercase text-[9px] tracking-widest bg-primary text-white hover:scale-105 transition-transform shrink-0" 
                                        disabled={!newCategoryName.trim()} 
                                        onClick={() => {
                                            if(newCategoryName.trim()) { 
                                                appendOptionalFeature({ id: `feat-${Date.now()}`, name: '', category: newCategoryName, imageUrl: null, code: '', applicableVariantIds: [], associatedSkus: [], associatedSeatId: null, isStandard: false }); 
                                                setNewCategoryName(''); 
                                            }
                                        }}
                                    >
                                        CREATE
                                    </Button>
                                </div>

                                <div className="space-y-10 text-left">
                                    {categorizedFeatures.map(([cat, items]) => (
                                        <Collapsible key={cat} defaultOpen className="space-y-4 text-left">
                                            <div className="flex items-center justify-between border-b-2 border-primary/5 pb-2 px-1 text-left">
                                                <div className="flex items-center gap-2 text-left">
                                                    <CollapsibleTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6 rounded-full border shadow-sm group-data-[state=open]:bg-muted"><ChevronDown className="h-3 w-3 transition-transform duration-200 group-data-[state=open]:rotate-180" /></Button></CollapsibleTrigger>
                                                    <span className="font-black text-[9px] uppercase tracking-[0.15em] text-slate-900 italic">{cat}</span>
                                                    <Badge className="bg-primary/10 text-primary border-none font-black text-[7px] h-4 px-1.5">{items.length}</Badge>
                                                </div>
                                                <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-primary" onClick={() => appendOptionalFeature({ id: `feat-${Date.now()}`, name: '', category: cat === 'General Options' ? null : cat, imageUrl: null, code: '', applicableVariantIds: [], associatedSkus: [], associatedSeatId: null, isStandard: false })}><Plus className="h-3 w-3" /></Button>
                                            </div>
                                            <CollapsibleContent><div className="grid gap-2 animate-in slide-in-from-top-1 duration-200 text-left">{items.map(item => (<OptionalFeatureItem key={item.field.id} index={item.idx} remove={removeOptionalFeature} categories={categorizedFeatures.map(([name]) => name).filter(n => n !== 'General Options' && n !== 'Consoles' && n !== 'Seats')} variants={variants ?? []} allFeatures={watchedOptionalFeatures} />))}</div></CollapsibleContent>
                                        </Collapsible>
                                    ))}
                                </div>
                            </div>
                        </CollapsibleContent>
                    </Collapsible>

                    <DocumentsSection />
                    <RulesSection model={model} modelCode={model.modelCode} />
                </div>
            </div>
        </div>
    );
}

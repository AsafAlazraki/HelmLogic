'use client';

import { useState, useMemo } from 'react';
import { useFieldArray, useWatch, useFormContext } from 'react-hook-form';
import { z } from 'zod';
import Image from 'next/image';
import { useStorage, useFirestore, useMemoFirebase, useCollection } from '@/firebase';
import { uploadFileToStorage } from '@/firebase/storage';
import { collection, query, where, doc, orderBy, serverTimestamp, setDoc } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { FormField, FormItem, FormLabel, FormMessage, FormControl } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { 
    Loader2, X, Trash2, Upload, Image as ImageIcon, Plus, Hash, Tag, PlusCircle, ShieldCheck, Star, ChevronDown, 
    DollarSign, Ship, Check, Search, ListChecks
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from './ui/separator';
import { Label } from './ui/label';
import { ScrollArea } from './ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from './ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Checkbox } from '@/components/ui/checkbox';

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

export const highfieldModelSchema = z.object({
    modelCode: z.string().min(1, 'Model Code is required'),
    coverImageUrl: z.string().nullable().optional(),
    galleryImageUrls: z.array(z.string()).default([]),
    registration: z.object({
        price12Months: z.coerce.number().optional(),
        stickerPrice: z.coerce.number().optional(),
        tenderToStickerPrice: z.coerce.number().optional(),
        trailerPrice12Months: z.coerce.number().optional(),
    }).optional(),
    specifications: z.object({
        motorConfigurations: z.array(motorConfigSchema).default([]),
        otherSpecs: z.array(specSchema).default([]),
    }).optional(),
    standardFeatures: z.array(z.string()).default([]),
    optionalFeatures: z.array(optionalFeatureSchema).default([]),
    documents: z.array(z.object({ id: z.string(), name: z.string(), url: z.string() })).default([]),
    rules: z.array(z.any()).default([]),
    trailerConfig: z.object({
        name: z.string().optional(),
        imageUrl: z.string().nullable().optional(),
        options: z.array(z.any()).default([]),
    }).optional(),
});

type ModelFormData = z.infer<typeof highfieldModelSchema>;

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

function RegistrationCard() {
  const { control } = useFormContext<ModelFormData>();

  return (
    <Card className="rounded-xl border-2 shadow-sm text-left overflow-hidden">
      <CardHeader className="bg-muted/10 border-b py-4">
        <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Registration & Compliance
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField
                control={control}
                name="registration.price12Months"
                render={({ field }) => (
                    <FormItem className="space-y-3">
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
                    <FormItem className="space-y-3">
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
                    <FormItem className="space-y-3">
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">"Tender To" Decals</FormLabel>
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
                    <FormItem className="space-y-3">
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
                                        <div className="min-w-0"><p className="text-sm font-black uppercase truncate">{v.name}</p><p className="text-[9px] font-mono text-muted-foreground">{v.sku}</p></div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>
                    <div className="w-full md:w-[320px] shrink-0 bg-muted/5 flex flex-col">
                        <div className="p-6 border-b bg-background flex items-center justify-between"><h4 className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Staged</h4><Badge className="font-black h-5 text-[9px] bg-primary">{value.length}</Badge></div>
                        <ScrollArea className="flex-1">
                            <div className="p-6 space-y-2">{variants.filter(v => value.includes(v.id)).map(v => (<div key={v.id} className="relative bg-white border-2 p-3 rounded-xl shadow-sm"><p className="text-[11px] font-black uppercase truncate pr-6">{v.name}</p><Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6" onClick={() => handleToggle(v.id)}><X className="h-3 w-3" /></Button></div>))}</div>
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
    const currentId = allFeatures?.[index]?.id;
    const seatOptions = useMemo(() => allFeatures.filter((f: any) => f.category === 'Seats' && f.id !== currentId), [allFeatures, currentId]);

    return (
        <Collapsible className="group/item overflow-hidden rounded-xl border bg-card shadow-sm transition-all hover:border-primary/20 text-left">
            <div className={cn("flex items-center justify-between p-3 border-b text-left", isStandard ? "bg-primary/5" : "bg-muted/10")}>
                <div className="flex items-center gap-3 min-w-0 pr-10 text-left">
                    <CollapsibleTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 rounded-full border shadow-sm"><ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]/item:rotate-180" /></Button></CollapsibleTrigger>
                    <div className="flex items-center gap-2 min-w-0">{isStandard && <Star className="h-3 w-3 text-primary fill-primary" />}<span className="font-black text-[10px] uppercase truncate">{name || 'Unnamed Option'}</span></div>
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
                                    {imageUrl ? (<><Image src={imageUrl} alt="Feature" fill className="object-contain p-2" unoptimized /><div className="absolute inset-0 bg-black/40 opacity-0 group-hover/feat-img:opacity-100 transition-opacity flex items-center justify-center"><Button type="button" variant="destructive" size="icon" className="h-6 w-6 rounded-md" onClick={() => field.onChange(null)}><X className="h-3 w-3" /></Button></div></>) : (
                                        <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-slate-50 transition-colors"><Upload className="w-4 h-4 text-slate-300 mb-1" /><span className="text-[8px] text-slate-400 uppercase font-black tracking-widest">Render</span><FormControl><Input type="file" className="hidden" accept="image/*" onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (file && storage) { setIsUploading(true); try { const url = await uploadFileToStorage(storage, file, `features/${Date.now()}-${file.name}`); field.onChange(url); } finally { setIsUploading(false); } }
                                        }} /></FormControl></label>
                                    )}
                                </div>
                            )} />
                        </div>
                        <div className="flex-1 grid grid-cols-2 gap-3 text-left">
                            <FormField control={control} name={`optionalFeatures.${index}.name`} render={({ field }) => ( <FormItem className="col-span-2 sm:col-span-1"><FormLabel className="text-[8px] font-black uppercase text-muted-foreground">Display Name</FormLabel><FormControl><Input placeholder="Name" className="h-9 font-bold" {...field} /></FormControl></FormItem> )} />
                            <FormField control={control} name={`optionalFeatures.${index}.code`} render={({ field }) => ( <FormItem className="col-span-2 sm:col-span-1"><FormLabel className="text-[8px] font-black uppercase text-muted-foreground">Factory Code</FormLabel><FormControl><Input placeholder="CODE" className="h-9 font-mono font-bold uppercase" {...field} /></FormControl></FormItem> )} />
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
                            {isConsole && (
                                <div className="space-y-2 text-left">
                                    <FormLabel className="text-[8px] font-black uppercase text-muted-foreground ml-1">Paired Dynamic Seat</FormLabel>
                                    <FormField control={control} name={`optionalFeatures.${index}.associatedSeatId`} render={({ field }) => (
                                        <Popover><PopoverTrigger asChild><Button variant="outline" className="w-full h-10 justify-between px-4 font-black uppercase text-[9px] bg-white border-2 rounded-lg"><span className="truncate">{field.value ? (seatOptions.find((s: any) => s.id === field.value)?.name || 'SEAT LINKED') : 'NO PAIRED SEAT'}</span><ChevronRight className="h-3 w-3 opacity-40" /></Button></PopoverTrigger><PopoverContent className="w-[300px] p-0 rounded-2xl border-4 shadow-2xl" align="start"><Command className="rounded-xl"><CommandInput placeholder="Search Seats..." className="h-10 font-bold" /><CommandList className="max-h-[250px]"><CommandEmpty className="p-4 text-center text-[9px] font-black uppercase text-slate-400">No matching seats.</CommandEmpty><CommandGroup className="p-1"><CommandItem onSelect={() => field.onChange(null)} className="font-black text-[9px] uppercase py-2 rounded-lg">Clear Linkage</CommandItem>{seatOptions.map((seat: any) => (<CommandItem key={seat.id} onSelect={() => field.onChange(seat.id)} className="font-bold text-[10px] uppercase py-2 px-3 rounded-lg flex items-center justify-between aria-selected:bg-primary aria-selected:text-white"><span className="truncate">{seat.name}</span>{field.value === seat.id && <Check className="h-3 w-3" />}</CommandItem>))}</CommandGroup></CommandList></Command></PopoverContent></Popover>
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

export function VariantsSection({ model, vendorId, rangeId }: { model: any, vendorId: string, rangeId: string }) {
    const firestore = useFirestore();
    const variantsQuery = useMemoFirebase(() => query(collection(firestore, `data-warehouse/${vendorId}/ranges/${rangeId}/models/${model.id}/variants`), orderBy('order')), [firestore, vendorId, rangeId, model.id]);
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
                                <div key={v.id} className="flex items-center justify-between p-3 rounded-xl border bg-slate-50 hover:border-primary/20 transition-all group/v text-left">
                                    <div className="flex items-center gap-3 min-w-0 text-left">
                                        <div className="h-10 w-10 relative rounded-lg bg-white border shadow-inner flex items-center justify-center overflow-hidden shrink-0">
                                            {v.imageUrl ? <Image src={v.imageUrl} alt={v.name} fill className="object-contain p-1" unoptimized /> : <Ship className="h-5 w-5 text-slate-200" />}
                                        </div>
                                        <div className="min-w-0 text-left"><p className="font-black text-[10px] uppercase tracking-tight truncate">{v.name}</p><p className="text-[8px] font-mono font-bold text-primary uppercase mt-0.5">{v.sku || 'NO SKU'}</p></div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0"><Badge variant="outline" className="font-black text-[7px] uppercase tracking-widest h-4 px-1.5">{v.material}</Badge></div>
                                </div>
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
    const { append: appendGalleryImage, remove: removeGalleryImage } = useFieldArray({ control, name: 'galleryImageUrls' });

    return (
        <Collapsible className="group overflow-hidden rounded-xl border bg-card shadow-sm text-left" defaultOpen>
            <CollapsibleCardHeader title={isModuleView ? "Visual Config" : "Main Cover & Gallery"} count={galleryUrls.length + (coverImageUrl ? 1 : 0)} />
            <CollapsibleContent>
                <div className="space-y-0 text-left">
                    <div className="relative aspect-[16/10] w-full bg-slate-50 group text-left">
                        {isCoverUploading && <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20"><Loader2 className="h-8 w-8 animate-spin text-white" /></div>}
                        {coverImageUrl ? (
                            <div className="h-full w-full flex items-center justify-center relative text-left">
                                <Image src={coverImageUrl} alt="Cover" fill className="object-contain p-6" unoptimized />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <Button type="button" variant="destructive" size="icon" className="font-black uppercase text-[9px] h-7 px-3" onClick={() => setValue('coverImageUrl', null)}>Remove Render</Button>
                                </div>
                            </div>
                        ) : (
                            <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-slate-100 transition-all">
                                <ImageIcon className="w-8 h-8 mb-2 text-slate-300" />
                                <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Set Build Render</span>
                                <FormControl><Input type="file" className="hidden" accept="image/*" onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (file && storage) { setIsCoverUploading(true); try { const url = await uploadFileToStorage(storage, file, `models/${model.id}/cover-${Date.now()}`); setValue('coverImageUrl', url); } finally { setIsCoverUploading(false); } }
                                }} /></FormControl>
                            </label>
                        )}
                    </div>
                    <div className="p-6 space-y-2 bg-white border-t text-left">
                        <Label className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Gallery Assets</Label>
                        <div className="grid grid-cols-3 gap-2">
                            {galleryUrls.map((url, index) => (
                                <div key={index} className="relative aspect-square group rounded-lg overflow-hidden border-2 bg-slate-50 shadow-inner">
                                    <Image src={url} alt={`Gallery ${index}`} fill className="object-cover" unoptimized />
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

export function HighfieldModelEditor({ model, vendorId, rangeId, isModuleView }: { model: any, vendorId: string, rangeId: string, isModuleView?: boolean }) {
    const { control, watch, setValue } = useFormContext<ModelFormData>();
    const { fields: optionalFeatureFields, append: appendOptionalFeature, remove: removeOptionalFeature } = useFieldArray({ control, name: "optionalFeatures" });
    const watchedOptionalFeatures = useWatch({ control, name: 'optionalFeatures' }) || [];
    const [newCategoryName, setNewCategoryName] = useState('');
    const firestore = useFirestore();

    const variantsQuery = useMemoFirebase(() => query(collection(firestore, `data-warehouse/${vendorId}/ranges/${rangeId}/models/${model.id}/variants`), orderBy('order')), [firestore, vendorId, rangeId, model.id]);
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
                                                appendOptionalFeature({ id: `feat-${Date.now()}`, name: '', category: newCategoryName, imageUrl: null, code: '', applicableVariantIds: [], associatedSeatId: null, isStandard: false }); 
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
                                                <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-primary" onClick={() => appendOptionalFeature({ id: `feat-${Date.now()}`, name: '', category: cat === 'General Options' ? null : cat, imageUrl: null, code: '', applicableVariantIds: [], associatedSeatId: null, isStandard: false })}><Plus className="h-3 w-3" /></Button>
                                            </div>
                                            <CollapsibleContent><div className="grid gap-2 animate-in slide-in-from-top-1 duration-200 text-left">{items.map(item => (<OptionalFeatureItem key={item.field.id} index={item.idx} remove={removeOptionalFeature} categories={categorizedFeatures.map(([name]) => name).filter(n => n !== 'General Options' && n !== 'Consoles' && n !== 'Seats')} variants={variants} allFeatures={watchedOptionalFeatures} />))}</div></CollapsibleContent>
                                        </Collapsible>
                                    ))}
                                </div>
                            </div>
                        </CollapsibleContent>
                    </Collapsible>
                </div>
            </div>
        </div>
    );
}

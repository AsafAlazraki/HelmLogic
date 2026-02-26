'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useFieldArray, useWatch, useController, useFormContext } from 'react-hook-form';
import { z } from 'zod';
import Image from 'next/image';
import { useStorage, useFirestore } from '@/firebase/provider';
import { uploadFileToStorage } from '@/firebase/storage';
import { collection, query, where, getDocs, writeBatch, doc, setDoc, deleteDoc, serverTimestamp, orderBy } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { FormField, FormItem, FormLabel, FormMessage, FormControl } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, X, Trash2, Upload, Image as ImageIcon, Plus, ChevronDown, Hash, Tag, Layers, FolderPlus, PlusCircle, ShieldAlert, CheckCircle2, AlertTriangle, DollarSign, Percent, Anchor, Ship, RefreshCw, PackagePlus, Pencil } from 'lucide-react';
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

const looseNumber = z.preprocess(
  (val) => {
    if (val === '' || val === null || val === undefined) return null;
    const n = Number(val);
    return isNaN(n) ? null : n;
  },
  z.number().nullable().optional()
);

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
    imageUrl: z.string().nullable().optional(),
    cost: looseNumber,
    sellPriceExclGst: looseNumber,
});

const documentSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Document name is required"),
  url: z.string().min(1, "Document URL is required"),
});

const ruleSchema = z.object({
    id: z.string(),
    sourceOptionId: z.string().min(1, 'Source option is required'),
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

function GstInputPair({ control, name, label, gstPercentage }: { control: any; name: string; label: string, gstPercentage: number }) {
    const { field, fieldState } = useController({ control, name, defaultValue: null });
    const [exclInput, setExclInput] = useState<string>('');
    const [inclInput, setInclInput] = useState<string>('');
    const activeInput = useRef<'excl' | 'incl' | null>(null);
    const taxRate = gstPercentage / 100;

    useEffect(() => {
        if (activeInput.current) return;

        const val = field.value;
        if (val === null || val === undefined || val === '') {
            setExclInput('');
            setInclInput('');
            return;
        }

        const num = parseFloat(val);
        setExclInput(num.toFixed(2));
        setInclInput((num * (1 + taxRate)).toFixed(2));
    }, [field.value, taxRate]);

    const handleExclChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (val !== '' && !/^\d*\.?\d*$/.test(val)) return;
        
        setExclInput(val);
        activeInput.current = 'excl';
        
        if (val === '' || val === '.') {
            field.onChange(null);
            setInclInput('');
        } else {
            const num = parseFloat(val);
            if (!isNaN(num)) {
                field.onChange(num);
                setInclInput((num * (1 + taxRate)).toFixed(2));
            }
        }
    };

    const handleInclChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (val !== '' && !/^\d*\.?\d*$/.test(val)) return;
        
        setInclInput(val);
        activeInput.current = 'incl';
        
        if (val === '' || val === '.') {
            field.onChange(null);
            setExclInput('');
        } else {
            const num = parseFloat(val);
            if (!isNaN(num)) {
                const excl = Math.round((num / (1 + taxRate)) * 100) / 100;
                field.onChange(excl);
                setExclInput(excl.toFixed(2));
            }
        }
    };

    const handleBlur = () => {
        activeInput.current = null;
        const val = field.value;
        if (val !== null && val !== undefined && !isNaN(parseFloat(val))) {
            const num = parseFloat(val);
            setExclInput(num.toFixed(2));
            setInclInput((num * (1 + taxRate)).toFixed(2));
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
                                type="text"
                                inputMode="decimal"
                                placeholder="0.00" 
                                className="h-9 pl-5 text-xs font-bold bg-background border-muted transition-all focus-visible:ring-primary/10 focus-visible:border-primary" 
                                value={exclInput} 
                                onChange={handleExclChange}
                                onBlur={handleBlur}
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
                                type="text" 
                                inputMode="decimal"
                                placeholder="0.00" 
                                className="h-9 pl-5 text-xs font-bold bg-background border-muted transition-all focus-visible:ring-primary/10 focus-visible:border-primary" 
                                value={inclInput} 
                                onChange={handleInclChange}
                                onBlur={handleBlur}
                            />
                        </FormControl>
                    </div>
                </div>
            </div>
             <FormMessage className="text-[9px] font-semibold">{fieldState.error && String(fieldState.error.message)}</FormMessage>
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
                                            const url = await uploadFileToStorage(storage, file, `highfield/groups/${model.id}/cover-${Date.now()}`);
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
                                            const url = await uploadFileToStorage(storage!, file, `highfield/groups/${model.id}/gallery/${Date.now()}-${file.name}`);
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

function VariantsSection({ model, vendorId, rangeId, gstPercentage }: { model: any, vendorId: string, rangeId: string, gstPercentage: number }) {
    const firestore = useFirestore();
    const storage = useStorage();
    const { toast } = useToast();
    
    const variantsQuery = useMemoFirebase(() => 
        query(collection(firestore, `data-warehouse/${vendorId}/ranges/${rangeId}/models/${model.id}/variants`), orderBy('order')),
    [firestore, vendorId, rangeId, model.id]);
    
    const { data: variants, loading } = useCollection<any>(variantsQuery);

    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editingVariant, setEditingVariant] = useState<any | null>(null);

    // Form state for SKU Variant
    const [vSku, setVSku] = useState('');
    const [vName, setVName] = useState('');
    const [vColor, setVColor] = useState('');
    const [vMaterial, setVMaterial] = useState<'PVC' | 'HYP' | ''>('');
    const [vCost, setVCost] = useState('');
    const [vPrice, setVPrice] = useState('');
    const [vImage, setVImage] = useState<File | null>(null);
    const [vImagePreview, setVImagePreview] = useState<string | null>(null);

    const resetForm = () => {
        setEditingVariant(null);
        setVSku('');
        setVName('');
        setVColor('');
        setVMaterial('');
        setVCost('');
        setVPrice('');
        setVImage(null);
        setVImagePreview(null);
    };

    const handleSaveVariant = async () => {
        if (!vSku.trim() || !vMaterial) return;
        setIsSaving(true);
        try {
            const varCol = collection(firestore, `data-warehouse/${vendorId}/ranges/${rangeId}/models/${model.id}/variants`);
            const varRef = editingVariant ? doc(varCol, editingVariant.id) : doc(varCol);
            
            const data: any = {
                sku: vSku.toUpperCase(),
                name: vName || `${vColor} ${vMaterial}`,
                colorName: vColor,
                material: vMaterial,
                cost: parseFloat(vCost) || 0,
                sellPriceExclGst: parseFloat(vPrice) || 0,
                updatedAt: serverTimestamp(),
            };

            if (!editingVariant) {
                data.createdAt = serverTimestamp();
                data.order = Date.now();
            }

            if (vImage && storage) {
                const path = `highfield/variants/${varRef.id}/photo-${Date.now()}`;
                data.imageUrl = await uploadFileToStorage(storage, vImage, path);
            }

            await setDoc(varRef, data, { merge: true });
            toast({ title: "SKU Saved" });
            setIsAddOpen(false);
            resetForm();
        } catch (error) {
            toast({ variant: 'destructive', title: "Save failed" });
        } finally {
            setIsSaving(false);
        }
    };

    const handleEdit = (v: any) => {
        setEditingVariant(v);
        setVSku(v.sku);
        setVName(v.name);
        setVColor(v.colorName || '');
        setVMaterial(v.material || '');
        setVCost(String(v.cost || ''));
        setVPrice(String(v.sellPriceExclGst || ''));
        setVImagePreview(v.imageUrl || null);
        setIsAddOpen(true);
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteDoc(doc(firestore, `data-warehouse/${vendorId}/ranges/${rangeId}/models/${model.id}/variants`, id));
            toast({ title: "SKU Deleted" });
        } catch (error) {
            toast({ variant: 'destructive', title: "Delete failed" });
        }
    };

    return (
        <Collapsible asChild className="group overflow-hidden rounded-xl border bg-card shadow-sm" defaultOpen>
            <Card className="border-none shadow-none rounded-none">
                <CollapsibleCardHeader 
                    title="Boat Variants & SKUs" 
                    count={variants?.length || 0}
                    onAdd={() => setIsAddOpen(true)}
                />
                <CollapsibleContent>
                    <CardContent className="pt-6 space-y-4">
                        {loading ? (
                            <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                        ) : variants && variants.length > 0 ? (
                            <div className="grid gap-4 md:grid-cols-2">
                                {variants.map((v) => (
                                    <Card key={v.id} className="group relative flex gap-4 p-4 hover:border-primary/40 transition-all bg-muted/10">
                                        <div className="relative h-20 w-20 rounded border bg-background overflow-hidden shrink-0">
                                            {v.imageUrl ? (
                                                <Image src={v.imageUrl} alt={v.sku} fill className="object-cover" />
                                            ) : (
                                                <div className="flex h-full w-full items-center justify-center"><Ship className="h-8 w-8 text-muted-foreground/20" /></div>
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="font-black text-xs uppercase truncate leading-none">{v.name}</p>
                                            <p className="font-mono text-[10px] font-bold text-primary mt-1 uppercase">{v.sku}</p>
                                            <div className="flex flex-wrap gap-1.5 mt-3">
                                                <Badge variant="secondary" className="text-[8px] h-4 font-black uppercase px-1.5">{v.material}</Badge>
                                                <Badge variant="outline" className="text-[8px] h-4 font-black uppercase px-1.5">{v.colorName}</Badge>
                                            </div>
                                            <div className="flex items-center gap-3 mt-3">
                                                <div className="flex flex-col"><span className="text-[8px] font-bold text-muted-foreground uppercase">Retail</span><span className="text-[10px] font-black">${(v.sellPriceExclGst || 0).toLocaleString()}</span></div>
                                                <div className="h-4 w-px bg-border" />
                                                <div className="flex flex-col"><span className="text-[8px] font-bold text-muted-foreground uppercase">Cost</span><span className="text-[10px] font-black">${(v.cost || 0).toLocaleString()}</span></div>
                                            </div>
                                        </div>
                                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(v)}><Pencil className="h-3.5 w-3.5" /></Button>
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(v.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        ) : (
                            <div className="py-12 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-muted-foreground bg-muted/5">
                                <PackagePlus className="h-10 w-10 opacity-20 mb-2" />
                                <p className="text-xs font-bold uppercase tracking-widest">No SKUs Added Yet</p>
                                <Button variant="link" size="sm" onClick={() => setIsAddOpen(true)}>Create First Variant</Button>
                            </div>
                        )}
                    </CardContent>
                </CollapsibleContent>

                <Dialog open={isAddOpen} onOpenChange={(o) => !o && (setIsAddOpen(false), resetForm())}>
                    <DialogContent className="sm:max-w-lg">
                        <DialogHeader>
                            <DialogTitle>{editingVariant ? 'Edit Variant SKU' : 'Add New Boat SKU'}</DialogTitle>
                            <DialogDescription>Individual boat details including material-specific imagery.</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-6 py-4">
                            <div className="flex justify-center">
                                <div className="relative h-28 w-40 bg-muted rounded border-2 border-dashed overflow-hidden group">
                                    {vImagePreview ? (
                                        <>
                                            <Image src={vImagePreview} alt="SKU Preview" fill className="object-cover" />
                                            <Button variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => { setVImage(null); setVImagePreview(null); }}><X className="h-3 w-3" /></Button>
                                        </>
                                    ) : (
                                        <label className="flex flex-col items-center justify-center h-full w-full cursor-pointer hover:bg-secondary">
                                            <ImageIcon className="h-6 w-6 text-muted-foreground/40 mb-1" />
                                            <span className="text-[8px] font-black uppercase text-muted-foreground">Upload SKU Photo</span>
                                            <Input type="file" className="hidden" accept="image/*" onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) { setVImage(file); setVImagePreview(URL.createObjectURL(file)); }
                                            }} />
                                        </label>
                                    )}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase">Variant Name</Label>
                                    <Input placeholder="e.g. Storm Grey PVC" value={vName} onChange={e => setVName(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase">Specific SKU</Label>
                                    <Input placeholder="CL310-PVC-SG" value={vSku} onChange={e => setVSku(e.target.value)} className="font-mono font-bold uppercase" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase">Material Selection</Label>
                                    <div className="flex gap-2">
                                        <Button type="button" variant={vMaterial === 'PVC' ? 'default' : 'outline'} className="flex-1 h-9 text-xs font-black" onClick={() => setVMaterial('PVC')}>PVC</Button>
                                        <Button type="button" variant={vMaterial === 'HYP' ? 'default' : 'outline'} className="flex-1 h-9 text-xs font-black" onClick={() => setVMaterial('HYP')}>HYP</Button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase">Color Name</Label>
                                    <Input placeholder="Storm Grey" value={vColor} onChange={e => setVColor(e.target.value)} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 border-t pt-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase">Factory Cost</Label>
                                    <Input type="number" placeholder="0.00" value={vCost} onChange={e => setVCost(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase text-primary">Retail Sell (Excl.)</Label>
                                    <Input type="number" placeholder="0.00" value={vPrice} onChange={e => setVPrice(e.target.value)} className="border-primary/40 focus-visible:ring-primary/20" />
                                </div>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                            <Button onClick={handleSaveVariant} disabled={isSaving || !vSku || !vMaterial}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {editingVariant ? 'Update SKU' : 'Add SKU'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </Card>
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
        <Collapsible asChild className="group overflow-hidden rounded-xl border bg-card shadow-sm" defaultOpen>
            <Card className="border-none shadow-none rounded-none">
                <CollapsibleCardHeader 
                    title="General Specifications" 
                    count={fields.length} 
                    onAdd={() => append({ id: `spec-${Date.now()}`, label: '', value: '' })}
                />
                <CollapsibleContent>
                    <CardContent className="space-y-4 pt-6">
                        <div className="grid gap-3">
                            {fields.map((field, index) => (
                                <div key={field.id} className="flex items-center gap-2 group/field">
                                    <FormField control={control} name={`specifications.otherSpecs.${index}.label`} render={({ field }) => ( <FormItem className="flex-1"><FormControl><Input placeholder="Label" className="h-9" {...field} /></FormControl></FormItem> )} />
                                    <FormField control={control} name={`specifications.otherSpecs.${index}.value`} render={({ field }) => ( <FormItem className="flex-1"><FormControl><Input placeholder="Value" className="h-9 font-medium" {...field} /></FormControl></FormItem> )} />
                                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 opacity-0 group-hover/field:opacity-100 text-destructive hover:bg-destructive/10 transition-opacity" onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>
                                </div>
                            ))}
                        </div>
                        <Separator />
                        <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
                            <Label className="text-xs font-bold uppercase text-muted-foreground tracking-widest">Bulk Import Specs</Label>
                            <Textarea 
                                placeholder="Paste specs (e.g. Length: 5.4m) one per line..." 
                                className="bg-background min-h-[100px]" 
                                value={bulkSpecs} 
                                onChange={(e) => setBulkSpecs(e.target.value)} 
                            />
                            <Button 
                                type="button" 
                                variant="secondary" 
                                size="sm" 
                                className="w-full font-bold h-9 hover:bg-accent hover:text-accent-foreground transition-colors" 
                                onClick={handleBulkImport}
                            >
                                Append Bulk Specs
                            </Button>
                        </div>
                    </CardContent>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    );
}

function FeaturesSection() {
    const { control, watch } = useFormContext<ModelFormData>();
    const { fields, append, remove } = useFieldArray({ control, name: "standardFeatures" });
    const [bulkFeatures, setBulkFeatures] = useState('');

    return (
        <Collapsible asChild className="group overflow-hidden rounded-xl border bg-card shadow-sm" defaultOpen>
            <Card className="border-none shadow-none rounded-none">
                <CollapsibleCardHeader 
                    title="Standard Features" 
                    count={fields.length} 
                    onAdd={() => append('')}
                />
                <CollapsibleContent>
                    <CardContent className="space-y-4 pt-6">
                        <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2">
                            {fields.map((field, index) => (
                                <div key={field.id} className="flex items-center gap-2 group/feat">
                                    <FormField control={control} name={`standardFeatures.${index}`} render={({ field }) => ( <FormItem className="flex-1"><FormControl><Input className="h-9" {...field} /></FormControl></FormItem> )} />
                                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 opacity-0 group-hover/feat:opacity-100 text-destructive hover:bg-destructive/10 transition-opacity" onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>
                                </div>
                            ))}
                        </div>
                        <Separator />
                        <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
                            <Label className="text-xs font-bold uppercase text-muted-foreground tracking-widest">Bulk Import</Label>
                            <Textarea placeholder="Paste one feature per line here..." className="bg-background min-h-[100px]" value={bulkFeatures} onChange={(e) => setBulkFeatures(e.target.value)} />
                            <Button type="button" variant="secondary" size="sm" className="w-full font-bold h-9 hover:bg-accent hover:text-accent-foreground transition-colors" onClick={() => { 
                                const newFeatures = bulkFeatures.split('\n').map(f => f.trim()).filter(Boolean);
                                append(newFeatures); 
                                setBulkFeatures(''); 
                            }}>Append Bulk Items</Button>
                        </div>
                    </CardContent>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    );
}

function OptionalFeatureItem({ index, remove, gstPercentage, categories }: { index: number; remove: (index: number) => void; gstPercentage: number, categories: string[] }) {
    const { control } = useFormContext<ModelFormData>();
    const imageUrl = useWatch({ control, name: `optionalFeatures.${index}.imageUrl` });
    const name = useWatch({ control, name: `optionalFeatures.${index}.name` });
    const code = useWatch({ control, name: `optionalFeatures.${index}.code` });
    const category = useWatch({ control, name: `optionalFeatures.${index}.category` });
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
                        {category && <span className="text-[9px] font-black uppercase text-primary bg-primary/5 px-1.5 py-0.5 rounded border border-primary/10 truncate">{category}</span>}
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => remove(index)}>
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>
            <CollapsibleContent>
                <div className="p-4 space-y-6">
                    <div className="flex flex-row gap-4 items-start">
                        <div className="w-[120px] shrink-0">
                            <FormField
                                control={control}
                                name={`optionalFeatures.${index}.imageUrl`}
                                render={({ field }) => (
                                    <div className="relative aspect-square w-full overflow-hidden rounded-md border-2 border-dashed bg-muted/20 group/feat-img">
                                        {isUploading && <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20"><Loader2 className="h-6 w-6 animate-spin text-white" /></div>}
                                        {imageUrl ? (
                                            <>
                                                <Image src={imageUrl} alt="Feature" fill className="object-cover" />
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/feat-img:opacity-100 transition-opacity flex items-center justify-center">
                                                    <Button type="button" variant="destructive" size="sm" className="h-6 text-[9px] px-2" onClick={() => field.onChange(null)}>Remove</Button>
                                                </div>
                                            </>
                                        ) : (
                                            <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-secondary/50">
                                                <Upload className="w-4 h-4 text-muted-foreground" />
                                                <span className="text-[8px] text-muted-foreground mt-1 uppercase font-black">Upload</span>
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

                        <div className="flex-1 space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <FormField control={control} name={`optionalFeatures.${index}.name`} render={({ field }) => ( <FormItem><FormLabel className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Name</FormLabel><FormControl><Input placeholder="Name" className="h-9 text-xs font-bold" {...field} /></FormControl></FormItem> )} />
                                <FormField control={control} name={`optionalFeatures.${index}.code`} render={({ field }) => ( <FormItem><FormLabel className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Option Code</FormLabel><FormControl><Input placeholder="CODE" className="h-9 text-xs font-mono font-bold uppercase" {...field} /></FormControl></FormItem> )} />
                            </div>

                            <FormField
                                control={control}
                                name={`optionalFeatures.${index}.category`}
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Category Assignment</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value || 'none'}>
                                            <FormControl>
                                                <SelectTrigger className="h-9 text-xs font-bold bg-muted/30">
                                                    <SelectValue placeholder="No Category Assigned" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="none">None (No Category)</SelectItem>
                                                {categories.map(cat => (
                                                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </FormItem>
                                )}
                            />
                            
                            <div className="grid grid-cols-1 gap-4">
                                <GstInputPair control={control} name={`optionalFeatures.${index}.cost`} label="Factory Cost" gstPercentage={gstPercentage} />
                                <GstInputPair control={control} name={`optionalFeatures.${index}.sellPriceExclGst`} label="Retail Sell" gstPercentage={gstPercentage} />
                            </div>
                        </div>
                    </div>
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}

function RulesSection({ model, modelCode }: { model: any, modelCode: string }) {
    const { control } = useFormContext<ModelFormData>();
    const { fields, append, remove } = useFieldArray({ control, name: "rules" });
    const optionalFeatures = useWatch({ control, name: "optionalFeatures" }) || [];
    const currentRules = useWatch({ control, name: "rules" }) || [];
    
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isSyncing, setIsSyncing] = useState(false);

    const featureOptions = useMemo(() => {
        return optionalFeatures.map((f: any) => ({
            id: f.id,
            label: `${f.name}${f.code ? ` (${f.code})` : ''}`,
        }));
    }, [optionalFeatures]);

    const handleSyncRules = async () => {
        if (!modelCode || !model.vendorId) return;
        setIsSyncing(true);
        try {
            const groupsRef = collection(firestore, `data-warehouse/${model.vendorId}/ranges/${model.rangeId}/models`);
            const q = query(groupsRef, where('modelCode', '==', modelCode));
            const snap = await getDocs(q);
            
            const batch = writeBatch(firestore);
            snap.docs.forEach(d => {
                if (d.id !== model.id) {
                    batch.update(d.ref, { rules: currentRules });
                }
            });
            await batch.commit();
            toast({ title: "Rules Synchronized", description: `Applied rules to all ${snap.size} model range variations.` });
        } catch (error) {
            console.error("Sync failed:", error);
            toast({ variant: 'destructive', title: "Sync Failed" });
        } finally {
            setTimeout(() => setIsSyncing(false), 1000);
        }
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
                        <CardTitle className="text-lg font-bold">Business Logic Rules</CardTitle>
                        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-tighter">
                            {fields.length}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button type="button" variant="secondary" size="sm" className="h-8 text-[10px] font-black uppercase tracking-widest" onClick={handleSyncRules} disabled={isSyncing}>
                            {isSyncing ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <RefreshCw className="h-3 w-3 mr-1.5" />}
                            Sync to Series
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="h-8 px-3 text-xs font-semibold" onClick={() => append({ id: `rule-${Date.now()}`, sourceOptionId: '', type: 'include', targetOptionIds: [] })}>
                            <Plus className="mr-1.5 h-3.5 w-3.5" />
                            Add Rule
                        </Button>
                    </div>
                </div>
                <CollapsibleContent>
                    <CardContent className="pt-6 space-y-6">
                        {fields.length > 0 ? (
                            fields.map((field, index) => (
                                <Card key={field.id} className="relative p-5 bg-muted/5 border-2 hover:border-primary/20 transition-all">
                                    <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => remove(index)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                    
                                    <div className="space-y-6">
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                                            <div className="flex-1 space-y-2">
                                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">If This Option is Selected:</Label>
                                                <FormField
                                                    control={control}
                                                    name={`rules.${index}.sourceOptionId`}
                                                    render={({ field }) => (
                                                        <Select onValueChange={field.onChange} value={field.value}>
                                                            <FormControl>
                                                                <SelectTrigger className="h-10 font-bold bg-background">
                                                                    <SelectValue placeholder="Select trigger option..." />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                {featureOptions.map(opt => (
                                                                    <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    )}
                                                />
                                            </div>

                                            <div className="w-32 space-y-2">
                                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Action:</Label>
                                                <FormField
                                                    control={control}
                                                    name={`rules.${index}.type`}
                                                    render={({ field }) => (
                                                        <Select onValueChange={field.onChange} value={field.value}>
                                                            <FormControl>
                                                                <SelectTrigger className="h-10 font-black uppercase tracking-tighter bg-background">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                <SelectItem value="include" className="text-green-600 font-bold">Include</SelectItem>
                                                                <SelectItem value="exclude" className="text-destructive font-bold">Exclude</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    )}
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                                {useWatch({ control, name: `rules.${index}.type` }) === 'include' ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : <AlertTriangle className="h-3 w-3 text-destructive" />}
                                                Target Options:
                                            </Label>
                                            
                                            <FormField
                                                control={control}
                                                name={`rules.${index}.targetOptionIds`}
                                                render={({ field }) => (
                                                    <div className="p-4 border rounded-lg bg-background min-h-[80px]">
                                                        <div className="flex flex-wrap gap-2 mb-3">
                                                            {field.value.map((id: string) => {
                                                                const opt = featureOptions.find(o => o.id === id);
                                                                return (
                                                                    <Badge key={id} variant="secondary" className="px-3 py-1 font-bold text-[10px] gap-1.5 uppercase">
                                                                        {opt?.label || id}
                                                                        <button type="button" onClick={() => field.onChange(field.value.filter((v: string) => v !== id))}>
                                                                            <X className="h-3 w-3 hover:text-destructive" />
                                                                        </button>
                                                                    </Badge>
                                                                );
                                                            })}
                                                        </div>
                                                        <Select onValueChange={(val) => !field.value.includes(val) && field.onChange([...field.value, val])} value="">
                                                            <SelectTrigger className="h-8 text-[10px] font-bold uppercase tracking-widest w-full border-dashed bg-muted/20">
                                                                <SelectValue placeholder="Add Target Option..." />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {featureOptions
                                                                    .filter(opt => opt.id !== useWatch({ control, name: `rules.${index}.sourceOptionId` }))
                                                                    .map(opt => (
                                                                        <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
                                                                    ))
                                                                }
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                )}
                                            />
                                        </div>
                                    </div>
                                </Card>
                            ))
                        ) : (
                            <div className="py-12 border-2 border-dashed rounded-xl bg-muted/5 flex flex-col items-center justify-center text-center">
                                <ShieldAlert className="h-10 w-10 text-muted-foreground opacity-20 mb-4" />
                                <p className="text-sm font-medium text-muted-foreground">No logic rules defined for this series.</p>
                            </div>
                        )}
                    </CardContent>
                </CollapsibleContent>
            </Card>
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

export function HighfieldModelEditor({ model, vendorId, rangeId, isModuleView, gstPercentage }: { model: any, vendorId: string, rangeId: string, isModuleView?: boolean, gstPercentage: number }) {
    const { control, watch, setValue } = useFormContext<ModelFormData>();
    const { fields: optionalFeatureFields, append: appendOptionalFeature, remove: removeOptionalFeature } = useFieldArray({ control, name: "optionalFeatures" });

    const [categories, setCategories] = useState<string[]>([]);
    const [newCategoryName, setNewCategoryName] = useState('');

    const watchedOptionalFeatures = useWatch({ control, name: 'optionalFeatures' }) || [];
    const modelCode = watch('modelCode');

    useEffect(() => {
        if (watchedOptionalFeatures) {
            const currentCats = [...new Set(watchedOptionalFeatures.map((f: any) => f.category).filter(Boolean) as string[])];
            setCategories(prev => {
                const combined = [...new Set([...prev, ...currentCats])];
                return combined.sort();
            });
        }
    }, [watchedOptionalFeatures]);

    const handleAddCategory = () => {
        if (!newCategoryName.trim()) return;
        const trimmedName = newCategoryName.trim();
        if (!categories.includes(trimmedName)) {
            setCategories(prev => [...prev, trimmedName].sort());
        }
        setNewCategoryName('');
    };

    const handleRemoveCategory = (cat: string) => {
        setCategories(prev => prev.filter(c => c !== cat));
    };

    return (
        <div className="space-y-8 max-w-full overflow-x-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Variants Management Card */}
                <VariantsSection model={model} vendorId={vendorId} rangeId={rangeId} gstPercentage={gstPercentage} />

                {/* Visual Assets Card (Group Cover) */}
                <VisualAssetsCard model={model} isModuleView={!!isModuleView} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-7 gap-8 items-start">
                <div className="lg:col-span-4 lg:order-1 space-y-8">
                    <FeaturesSection />
                    <SpecsSection />
                    <MotorConfigurationsSection />
                    <RulesSection model={model} modelCode={modelCode} />
                </div>
                <div className="lg:col-span-3 lg:order-2 space-y-8">
                    <Collapsible asChild className="group overflow-hidden rounded-xl border bg-card shadow-sm" defaultOpen>
                        <Card className="border-none shadow-none rounded-none">
                            <div className="flex flex-col py-4 px-6 border-b bg-card gap-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <CollapsibleTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full border shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors group-data-[state=open]:bg-muted">
                                                <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                                            </Button>
                                        </CollapsibleTrigger>
                                        <CardTitle className="text-lg font-bold">Factory Options</CardTitle>
                                        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-tighter">
                                            {optionalFeatureFields.length}
                                        </span>
                                    </div>
                                    <Button type="button" variant="outline" size="sm" className="h-8 px-3 text-xs font-semibold" onClick={() => appendOptionalFeature({ id: `feat-${Date.now()}`, name: '', cost: null, sellPriceExclGst: null, imageUrl: null, code: '', category: null })}>
                                        <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Option
                                    </Button>
                                </div>
                                
                                <div className="flex items-center gap-2 p-1.5 bg-muted/50 rounded-lg border border-dashed">
                                    <div className="relative flex-1">
                                        <FolderPlus className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                        <Input 
                                            placeholder="Define New Category..." 
                                            value={newCategoryName} 
                                            onChange={(e) => setNewCategoryName(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCategory())}
                                            className="h-8 pl-8 text-[10px] font-bold bg-background border-none shadow-none focus-visible:ring-1 focus-visible:ring-primary/20" 
                                        />
                                    </div>
                                    <Button type="button" size="sm" variant="secondary" className="h-7 text-[9px] font-black uppercase tracking-widest px-3" onClick={handleAddCategory}>Create</Button>
                                </div>
                            </div>

                            <CollapsibleContent>
                                <CardContent className="pt-6">
                                    <ScrollArea className="max-h-[700px] pr-4">
                                        <div className="space-y-8">
                                            {categories.map(cat => {
                                                const catItems = optionalFeatureFields.filter((_, idx) => watchedOptionalFeatures[idx]?.category === cat);

                                                return (
                                                    <Collapsible key={cat} className="space-y-4" defaultOpen>
                                                        <div className="flex items-center justify-between bg-primary/5 p-3 rounded-lg border-l-4 border-primary">
                                                            <div className="flex items-center gap-2">
                                                                <CollapsibleTrigger asChild>
                                                                    <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-accent hover:text-accent-foreground">
                                                                        <ChevronDown className="h-4 w-4" />
                                                                    </Button>
                                                                </CollapsibleTrigger>
                                                                <h3 className="font-black text-[11px] uppercase tracking-widest text-primary">{cat}</h3>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tighter bg-background px-2 py-0.5 rounded-full border shadow-sm">{catItems.length} items</span>
                                                                <Button 
                                                                    type="button" 
                                                                    variant="ghost" 
                                                                    size="icon" 
                                                                    className="h-6 w-6 hover:bg-primary/10 text-primary"
                                                                    onClick={() => appendOptionalFeature({ id: `feat-${Date.now()}`, name: '', category: cat, cost: null, sellPriceExclGst: null, imageUrl: null, code: '' })}
                                                                >
                                                                    <PlusCircle className="h-4 w-4" />
                                                                </Button>
                                                                {catItems.length === 0 && (
                                                                    <Button 
                                                                        type="button" 
                                                                        variant="ghost" 
                                                                        size="icon" 
                                                                        className="h-6 w-6 hover:bg-destructive/10 text-destructive"
                                                                        onClick={() => handleRemoveCategory(cat)}
                                                                    >
                                                                        <Trash2 className="h-3.5 w-3.5" />
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <CollapsibleContent className="space-y-4 pt-2 ml-2 border-l-2 border-dashed border-muted pl-4">
                                                            {catItems.length > 0 ? (
                                                                <div className="grid grid-cols-1 gap-4">
                                                                    {optionalFeatureFields.map((field, index) => {
                                                                        const feat = watchedOptionalFeatures[index];
                                                                        if (feat?.category !== cat) return null;
                                                                        return (
                                                                            <OptionalFeatureItem 
                                                                                key={field.id} 
                                                                                index={index} 
                                                                                remove={removeOptionalFeature} 
                                                                                gstPercentage={gstPercentage}
                                                                                categories={categories}
                                                                            />
                                                                        );
                                                                    })}
                                                                </div>
                                                            ) : (
                                                                <div className="py-6 border-2 border-dashed rounded-lg bg-muted/10 flex flex-col items-center justify-center text-center">
                                                                    <Layers className="h-6 w-6 text-muted-foreground opacity-20 mb-2" />
                                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Empty Category</p>
                                                                </div>
                                                            )}
                                                        </CollapsibleContent>
                                                    </Collapsible>
                                                );
                                            })}

                                            <div className="grid grid-cols-1 gap-4">
                                                {optionalFeatureFields.map((field, index) => {
                                                    const feat = watchedOptionalFeatures[index];
                                                    if (feat?.category) return null;
                                                    return (
                                                        <OptionalFeatureItem 
                                                            key={field.id} 
                                                            index={index} 
                                                            remove={removeOptionalFeature} 
                                                            gstPercentage={gstPercentage}
                                                            categories={categories}
                                                        />
                                                    );
                                                })}
                                            </div>
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

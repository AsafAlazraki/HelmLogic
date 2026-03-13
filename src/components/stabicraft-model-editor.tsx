'use client';

import { useState } from 'react';
import { useFieldArray, useWatch, useFormContext } from 'react-hook-form';
import { z } from 'zod';
import Image from 'next/image';
import { useStorage } from '@/firebase/provider';
import { uploadFileToStorage } from '@/firebase/storage';

import { Card, CardContent, CardTitle, CardHeader } from '@/components/ui/card';
import { FormField, FormItem, FormControl, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2, ChevronDown, X, Image as ImageIcon, Plus, ShieldCheck, DollarSign } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';

export const stabicraftModelSchema = z.object({
    modelCode: z.string().min(1, 'Model Code is required'),
    coverImageUrl: z.string().nullable().optional(),
    galleryImageUrls: z.array(z.string()).default([]),
    packageLevels: z.array(z.any()).default([]),
    registration: z.object({
        price12Months: z.coerce.number().optional(),
        stickerPrice: z.coerce.number().optional(),
        trailerPrice12Months: z.coerce.number().optional(),
    }).optional(),
    optionalFeatures: z.array(z.any()).default([]),
    uDekOptions: z.any().optional().nullable(),
    paintAndGraphicOptions: z.any().optional().nullable(),
});

type ModelFormData = z.infer<typeof stabicraftModelSchema>;

const CollapsibleCardHeader = ({ title, count, onAdd }: { title: string, count?: number, onAdd?: () => void }) => (
    <div className="flex items-center justify-between py-4 px-6 border-b bg-card select-none">
        <div className="flex items-center gap-3">
            <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full border shadow-sm hover:bg-accent transition-colors group-data-[state=open]:bg-muted">
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
            <Button type="button" variant="outline" size="sm" className="h-8 px-3 text-xs font-semibold" onClick={(e) => { e.stopPropagation(); onAdd(); }}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add
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

export function StabicraftModelEditor({ model, isModuleView }: { model: any, isModuleView?: boolean }) {
    return (
        <div className="space-y-8 max-w-full overflow-x-hidden text-left">
            <div className="grid grid-cols-1 lg:grid-cols-7 gap-8 items-start">
                <div className="lg:col-span-4 space-y-8">
                    <VisualAssetsCard model={model} isModuleView={!!isModuleView} />
                    <RegistrationCard />
                </div>
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
            <CollapsibleCardHeader title={isModuleView ? "Visual Config" : "Main Cover Image & Gallery"} count={galleryUrls.length + (coverImageUrl ? 1 : 0)} />
            <CollapsibleContent>
                <div className="space-y-0">
                    <div className="relative aspect-[16/10] w-full bg-secondary group">
                        {isCoverUploading && <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20"><Loader2 className="h-8 w-8 animate-spin text-white" /></div>}
                        {coverImageUrl ? (
                            <div className="h-full w-full flex items-center justify-center relative">
                                <Image src={coverImageUrl} alt="Cover" fill className="object-contain p-4" unoptimized />
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

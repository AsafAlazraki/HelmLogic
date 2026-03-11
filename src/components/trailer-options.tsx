'use client';

import { useState } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import Image from 'next/image';
import { useStorage } from '@/firebase/provider';
import { uploadFileToStorage } from '@/firebase/storage';
import { 
    Card, 
    CardContent, 
    CardHeader, 
    CardTitle, 
    CardDescription 
} from '@/components/ui/card';
import { 
    FormField, 
    FormItem, 
    FormLabel, 
    FormControl, 
    FormMessage 
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { 
    Loader2, 
    X, 
    Trash2, 
    Plus, 
    Upload, 
    ImageIcon, 
    Truck, 
    Package, 
    Star,
    CheckCircle2,
    ArrowRight,
    Layers
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';

export function TrailerOptions({ model }: { model: any }) {
    const { control, setValue } = useFormContext();
    const storage = useStorage();
    const [isUploading, setIsUploading] = useState(false);

    const trailerName = useWatch({ control, name: 'trailerConfig.name' });
    const trailerImageUrl = useWatch({ control, name: 'trailerConfig.imageUrl' });
    const { fields, append, remove } = useFieldArray({ control, name: 'trailerConfig.options' });

    return (
        <div className="space-y-8 animate-in fade-in duration-500 text-left">
            <div className="grid grid-cols-1 lg:grid-cols-7 gap-8 items-start text-left">
                {/* Main Trailer Identity */}
                <div className="lg:col-span-3 space-y-6 text-left">
                    <Card className="overflow-hidden border-2 shadow-sm rounded-2xl text-left">
                        <CardHeader className="bg-muted/10 border-b p-6 text-left">
                            <div className="flex items-center gap-3 text-left">
                                <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary shadow-sm">
                                    <Truck className="h-5 w-5" />
                                </div>
                                <div className="text-left">
                                    <CardTitle className="text-lg font-black uppercase tracking-tight italic text-primary leading-none">Primary Trailer</CardTitle>
                                    <CardDescription className="text-[9px] font-black uppercase tracking-widest opacity-60 mt-1">Vessel Transport Configuration</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <div className="relative aspect-[16/10] bg-slate-50 border-b group text-left">
                            {isUploading && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20">
                                    <Loader2 className="h-8 w-8 animate-spin text-white" />
                                </div>
                            )}
                            {trailerImageUrl ? (
                                <div className="h-full w-full relative flex items-center justify-center p-6 text-left">
                                    <Image src={trailerImageUrl} alt="Trailer" fill className="object-contain p-4 mix-blend-multiply" unoptimized />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <Button 
                                            type="button" 
                                            variant="destructive" 
                                            size="sm" 
                                            className="h-8 rounded-full font-black uppercase text-[9px] tracking-widest px-4"
                                            onClick={() => setValue('trailerConfig.imageUrl', null)}
                                        >
                                            <X className="h-3 w-3 mr-1.5" /> Remove Render
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-slate-100 transition-all text-left">
                                    <ImageIcon className="w-10 h-10 mb-3 text-slate-300" />
                                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Set Trailer Render</span>
                                    <FormControl>
                                        <Input 
                                            type="file" 
                                            className="hidden" 
                                            accept="image/*" 
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0];
                                                if (file && storage) {
                                                    setIsUploading(true);
                                                    try {
                                                        const url = await uploadFileToStorage(storage, file, `trailers/${Date.now()}-${file.name}`);
                                                        setValue('trailerConfig.imageUrl', url);
                                                    } finally { setIsUploading(false); }
                                                }
                                            }} 
                                        />
                                    </FormControl>
                                </label>
                            )}
                        </div>
                        <CardContent className="p-6 text-left">
                            <FormField
                                control={control}
                                name="trailerConfig.name"
                                render={({ field }) => (
                                    <FormItem className="space-y-3 text-left">
                                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Trailer Brand & Model</FormLabel>
                                        <FormControl>
                                            <Input placeholder="e.g. Redco - CL380 Trailer" {...field} className="h-12 font-black text-xs border-2 rounded-xl bg-slate-50 uppercase tracking-tight" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </CardContent>
                    </Card>
                </div>

                {/* Trailer Sub-Options */}
                <div className="lg:col-span-4 text-left">
                    <Card className="rounded-2xl border-2 shadow-sm text-left">
                        <CardHeader className="bg-muted/10 border-b p-6 flex flex-row items-center justify-between text-left">
                            <div className="text-left">
                                <CardTitle className="text-lg font-black uppercase tracking-tight italic text-primary leading-none flex items-center gap-2">
                                    <Layers className="h-5 w-5" />
                                    Trailer Sub-Options
                                </CardTitle>
                                <CardDescription className="text-[9px] font-black uppercase tracking-widest opacity-60 mt-1">Additional hardware & accessories</CardDescription>
                            </div>
                            <Button 
                                type="button" 
                                variant="outline" 
                                size="sm" 
                                className="h-9 px-4 rounded-xl font-black uppercase text-[10px] tracking-widest border-2"
                                onClick={() => append({ id: `tr-opt-${Date.now()}`, name: '', isStandard: false, sellPriceExclGst: 0 })}
                            >
                                <Plus className="h-3.5 w-3.5 mr-1.5" />
                                Add Hardware
                            </Button>
                        </CardHeader>
                        <CardContent className="p-0 text-left">
                            {fields.length > 0 ? (
                                <div className="divide-y-2 divide-slate-100 text-left">
                                    {fields.map((field, index) => (
                                        <div key={field.id} className="p-6 flex items-start gap-6 group hover:bg-slate-50 transition-colors text-left">
                                            <div className="flex-1 space-y-4 text-left">
                                                <div className="flex items-center gap-4 text-left">
                                                    <FormField
                                                        control={control}
                                                        name={`trailerConfig.options.${index}.name`}
                                                        render={({ field }) => (
                                                            <FormItem className="flex-1 space-y-1.5 text-left">
                                                                <FormLabel className="text-[8px] font-black uppercase text-muted-foreground ml-1">Option Name</FormLabel>
                                                                <FormControl>
                                                                    <Input placeholder="e.g. Spare Wheel Carrier" {...field} className="h-10 font-bold text-xs bg-white border-2" />
                                                                </FormControl>
                                                            </FormItem>
                                                        )}
                                                    />
                                                    <FormField
                                                        control={control}
                                                        name={`trailerConfig.options.${index}.sellPriceExclGst`}
                                                        render={({ field }) => (
                                                            <FormItem className="w-32 space-y-1.5 text-left">
                                                                <FormLabel className="text-[8px] font-black uppercase text-primary ml-1">Retail (Excl.)</FormLabel>
                                                                <FormControl>
                                                                    <div className="relative">
                                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-primary opacity-40">$</span>
                                                                        <Input type="number" step="0.01" {...field} className="h-10 pl-7 font-black text-xs bg-white border-2" />
                                                                    </div>
                                                                </FormControl>
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>
                                                <div className="flex items-center justify-between p-3 rounded-xl border-2 bg-white text-left">
                                                    <FormField
                                                        control={control}
                                                        name={`trailerConfig.options.${index}.isStandard`}
                                                        render={({ field }) => (
                                                            <FormItem className="flex items-center space-x-3 space-y-0 text-left">
                                                                <FormControl>
                                                                    <Checkbox 
                                                                        checked={field.value} 
                                                                        onCheckedChange={field.onChange} 
                                                                        className="h-4 w-4"
                                                                    />
                                                                </FormControl>
                                                                <FormLabel className="text-[10px] font-black uppercase tracking-widest text-primary cursor-pointer leading-none">Pre-selected Standard</FormLabel>
                                                            </FormItem>
                                                        )}
                                                    />
                                                    <Button 
                                                        type="button" 
                                                        variant="ghost" 
                                                        size="icon" 
                                                        className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                                        onClick={() => remove(index)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-24 text-center flex flex-col items-center justify-center gap-4 text-muted-foreground opacity-20 text-left">
                                    <div className="h-16 w-16 rounded-[2rem] border-4 border-dashed flex items-center justify-center">
                                        <Package className="h-8 w-8" />
                                    </div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.3em]">No Sub-Options Defined</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

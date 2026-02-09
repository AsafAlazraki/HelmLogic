'use client';

import { useState, useEffect } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';
import { useFirestore } from '@/firebase/provider';
import { doc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { fileToDataUri } from '@/firebase/storage-utils';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, X, PlusCircle, Trash2, Image as ImageIcon } from 'lucide-react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

// Schemas for validation
const specSchema = z.object({
    id: z.string(),
    label: z.string().min(1, 'Label is required'),
    value: z.string().min(1, 'Value is required'),
});

const modelSchema = z.object({
    coverImageUrl: z.string().nullable().optional(),
    specifications: z.object({
        minHp: z.coerce.number().min(0).default(0),
        maxHp: z.coerce.number().min(0).default(0),
        recommendedHp: z.coerce.number().min(0).default(0),
        otherSpecs: z.array(specSchema).default([]),
    }).optional(),
    standardFeatures: z.array(z.string()).default([]),
});

type ModelFormData = z.infer<typeof modelSchema>;

export function JeanneauModelEditor({ model, docPath }: { model: any; docPath: string }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [bulkFeatures, setBulkFeatures] = useState('');

    const getSafeDefaultValues = (modelData: any): ModelFormData => {
        const data = modelData || {};
        const specs = data.specifications || {};
        return {
            coverImageUrl: data.coverImageUrl ?? null,
            specifications: {
                minHp: specs.minHp ?? 0,
                maxHp: specs.maxHp ?? 0,
                recommendedHp: specs.recommendedHp ?? 0,
                otherSpecs: specs.otherSpecs ?? [],
            },
            standardFeatures: data.standardFeatures ?? [],
        };
    };

    const form = useForm<ModelFormData>({
        resolver: zodResolver(modelSchema),
        defaultValues: getSafeDefaultValues(model),
    });
    
    useEffect(() => {
        form.reset(getSafeDefaultValues(model));
    }, [model, form]);

    const { fields: specFields, append: appendSpec, remove: removeSpec } = useFieldArray({ control: form.control, name: "specifications.otherSpecs" });
    const { fields: featureFields, append: appendFeature, remove: removeFeature, replace: replaceFeatures } = useFieldArray({ control: form.control, name: "standardFeatures" });
    
    const coverImageUrl = useWatch({ control: form.control, name: "coverImageUrl" });

    function onSubmit(values: ModelFormData) {
        setIsSubmitting(true);
        const modelDocRef = doc(firestore, docPath);

        updateDoc(modelDocRef, values)
            .then(() => {
                toast({ title: "Model Updated", description: "The model details have been saved successfully." });
                form.reset(values);
            })
            .catch((serverError) => {
                 const permissionError = new FirestorePermissionError({
                    path: modelDocRef.path,
                    operation: 'update',
                    requestResourceData: values,
                });
                errorEmitter.emit('permission-error', permissionError);
            })
            .finally(() => {
                setIsSubmitting(false);
            });
    }
    
    const handleBulkAddFeatures = () => {
        const features = bulkFeatures.split('\n').map(f => f.trim()).filter(Boolean);
        replaceFeatures(features.map(f => f));
        setBulkFeatures('');
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="flex justify-end">
                    <Button type="submit" disabled={isSubmitting || !form.formState.isDirty}>
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Save Changes
                    </Button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                    <div className="lg:col-span-2 space-y-8">
                        {/* Specifications Card */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Specifications</CardTitle>
                                <CardDescription>Define the technical specifications for this model.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <FormField control={form.control} name="specifications.minHp" render={({ field }) => ( <FormItem><FormLabel>Min HP</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} />
                                    <FormField control={form.control} name="specifications.maxHp" render={({ field }) => ( <FormItem><FormLabel>Max HP</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} />
                                    <FormField control={form.control} name="specifications.recommendedHp" render={({ field }) => ( <FormItem><FormLabel>Recommended HP</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )} />
                                </div>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <FormLabel>Other Specs</FormLabel>
                                        <Button type="button" variant="outline" size="sm" onClick={() => appendSpec({ id: `spec-${Date.now()}-${Math.random()}`, label: '', value: '' })}><PlusCircle className="mr-2 h-4 w-4" />Add Spec</Button>
                                    </div>
                                    {specFields.map((field, index) => (
                                        <div key={field.id} className="flex items-end gap-2">
                                            <FormField control={form.control} name={`specifications.otherSpecs.${index}.label`} render={({ field }) => ( <FormItem className="flex-1"><FormControl><Input placeholder="Label" {...field} /></FormControl><FormMessage /></FormItem> )} />
                                            <FormField control={form.control} name={`specifications.otherSpecs.${index}.value`} render={({ field }) => ( <FormItem className="flex-1"><FormControl><Input placeholder="Value" {...field} /></FormControl><FormMessage /></FormItem> )} />
                                            <Button type="button" variant="ghost" size="icon" onClick={() => removeSpec(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                        
                        {/* Standard Features Card */}
                        <Card>
                             <CardHeader>
                                <CardTitle>Standard Features</CardTitle>
                                <CardDescription>List the standard features included with this model.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {featureFields.map((field, index) => (
                                     <div key={field.id} className="flex items-center gap-2">
                                        <FormField control={form.control} name={`standardFeatures.${index}`} render={({ field }) => ( <FormItem className="flex-1"><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                                        <Button type="button" variant="ghost" size="icon" onClick={() => removeFeature(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                    </div>
                                ))}
                                <Button type="button" variant="outline" size="sm" onClick={() => appendFeature('')}><PlusCircle className="mr-2 h-4 w-4" />Add Feature</Button>
                            </CardContent>
                             <CardContent>
                                <div className="space-y-2">
                                    <FormLabel>Bulk Add Features</FormLabel>
                                    <Textarea placeholder="One feature per line..." value={bulkFeatures} onChange={(e) => setBulkFeatures(e.target.value)} />
                                    <Button type="button" variant="secondary" size="sm" onClick={handleBulkAddFeatures}>Add from Text</Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="lg:col-span-1 space-y-8">
                         <Card>
                            <CardHeader>
                                <CardTitle>Cover Image</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <FormField control={form.control} name="coverImageUrl" render={({ field }) => (
                                   <FormItem>
                                       <FormLabel className="sr-only">Cover Image</FormLabel>
                                        {coverImageUrl ? (
                                             <div className="relative aspect-video w-full overflow-hidden rounded-md group">
                                                <Image src={coverImageUrl} alt="Cover image" fill className="object-cover" />
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="icon"
                                                    className="absolute top-1 right-1 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-background/50 border-background/50 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive"
                                                    onClick={() => field.onChange(null)}
                                                >
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-center w-full">
                                                <label htmlFor="cover-image-upload" className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer bg-secondary hover:bg-muted">
                                                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                                        <ImageIcon className="w-10 h-10 mb-2 text-muted-foreground" />
                                                        <p className="mb-2 text-sm text-muted-foreground"><span className="font-semibold">Upload Cover Image</span></p>
                                                    </div>
                                                     <FormControl>
                                                        <Input id="cover-image-upload" type="file" className="hidden" accept="image/*" onChange={async (e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) field.onChange(await fileToDataUri(file));
                                                        }} />
                                                    </FormControl>
                                                </label>
                                            </div> 
                                        )}
                                       <FormMessage />
                                   </FormItem>
                               )} />
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </form>
        </Form>
    );
}

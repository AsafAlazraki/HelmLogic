'use client';

import * as React from 'react';
import { useState } from 'react';
import { useFieldArray, useWatch, useController, useFormContext } from 'react-hook-form';
import { z } from 'zod';
import Image from 'next/image';
import { useStorage } from '@/firebase/provider';
import { useToast } from '@/hooks/use-toast';
import { uploadFileWithProgress } from '@/firebase/storage';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField, FormItem, FormLabel, FormMessage, FormControl } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, X, PlusCircle, Trash2, Upload, Image as ImageIcon, Plus, ChevronDown, MoreHorizontal, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from './ui/checkbox';
import { Separator } from './ui/separator';
import { Label } from './ui/label';
import { Progress } from './ui/progress';

const GST_RATE = 0.10;

function GstInputPair({ control, name, label }: { control: any; name: string; label: string }) {
    const { field } = useController({ control, name, defaultValue: null });
    const valueExcl = field.value;
    const valueIncl = valueExcl !== null && valueExcl !== undefined ? Math.round((valueExcl * (1 + GST_RATE)) * 100) / 100 : null;
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
            <FormLabel>{label}</FormLabel>
            <div className="grid grid-cols-2 gap-2 mt-2">
                <FormItem><FormLabel className="text-xs font-normal text-muted-foreground">excl. GST</FormLabel><FormControl><Input type="number" step="0.01" value={valueExcl ?? ''} onChange={handleExclChange} /></FormControl></FormItem>
                <FormItem><FormLabel className="text-xs font-normal text-muted-foreground">inc. GST</FormLabel><FormControl><Input type="number" step="0.01" value={valueIncl ?? ''} onChange={handleInclChange} /></FormControl></FormItem>
            </div>
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
        <Button type="button" variant={field.value === 'standard' ? 'default' : 'secondary'} className={cn("w-28", field.value === 'na' && 'opacity-50')} size="sm" onClick={toggleStatus}>
            {field.value === 'standard' ? 'Standard' : field.value === 'na' ? 'N/A' : 'Optional'}
        </Button>
    );
}

export function StabicraftModelEditor({ model }: { model: any }) {
    const { control, getValues, setValue } = useFormContext();
    const storage = useStorage();
    const { toast } = useToast();

    const [isGalleryUploading, setIsGalleryUploading] = useState(false);
    const [categories, setCategories] = useState<string[]>([]);
    const [newCategoryName, setNewCategoryName] = useState('');

    const { fields: specFields, append: appendSpec, remove: removeSpec } = useFieldArray({ control, name: "specifications.otherSpecs" });
    const { fields: featureFields, append: appendFeature, remove: removeFeature } = useFieldArray({ control, name: "standardFeatures" });
    const { fields: packageLevelFields, append: appendPackageLevel, remove: removePackageLevel } = useFieldArray({ control, name: "packageLevels" });
    const { fields: optionalFeatureFields, append: appendOptionalFeature, remove: removeOptionalFeature, update: updateOptionalFeature } = useFieldArray({ control, name: "optionalFeatures" });
    
    const watchedOptionalFeatures = useWatch({ control, name: 'optionalFeatures' });
    const watchedPackageLevels = useWatch({ control, name: 'packageLevels' });

    React.useEffect(() => {
        if (watchedOptionalFeatures) {
            const currentCats = [...new Set(watchedOptionalFeatures.map((f: any) => f.category).filter(Boolean) as string[])];
            setCategories(currentCats);
        }
    }, [watchedOptionalFeatures]);

    return (
        <div className="space-y-8">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Package Levels</CardTitle>
                    <Button type="button" variant="outline" size="sm" onClick={() => appendPackageLevel({ id: `pkg-${Date.now()}`, name: '', description: '', cost: null, sellPriceExclGst: null })}><PlusCircle className="mr-2 h-4 w-4" />Add Level</Button>
                </CardHeader>
                <CardContent className="space-y-4">
                    {packageLevelFields.map((field, index) => (
                        <div key={field.id} className="p-4 border rounded-md space-y-4 bg-muted/30">
                            <div className="flex gap-4">
                                <FormField control={control} name={`packageLevels.${index}.name`} render={({ field }) => ( <FormItem className="flex-1"><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl></FormItem> )} />
                                <Button type="button" variant="ghost" size="icon" className="mt-8" onClick={() => removePackageLevel(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <GstInputPair control={control} name={`packageLevels.${index}.cost`} label="Cost" />
                                <GstInputPair control={control} name={`packageLevels.${index}.sellPriceExclGst`} label="Sell" />
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Features & Packaging</CardTitle>
                    <div className="flex gap-2">
                        <Input placeholder="New Category" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} className="w-40" />
                        <Button type="button" onClick={() => { if(newCategoryName) { setCategories([...categories, newCategoryName]); setNewCategoryName(''); }}}>Add Category</Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    {categories.map(cat => (
                        <div key={cat} className="space-y-2 border rounded-lg p-4">
                            <div className="flex justify-between items-center border-b pb-2">
                                <h3 className="font-bold">{cat}</h3>
                                <Button type="button" variant="outline" size="sm" onClick={() => appendOptionalFeature({ id: `feat-${Date.now()}`, name: '', category: cat, packageStatus: {}})}><PlusCircle className="h-4 w-4 mr-2" />Add Feature</Button>
                            </div>
                            <Table>
                                <TableHeader><TableRow><TableHead>Feature</TableHead>{watchedPackageLevels.map((p: any) => <TableHead key={p.id} className="text-center">{p.name}</TableHead>)}<TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {optionalFeatureFields.map((field, idx) => watchedOptionalFeatures[idx]?.category === cat && (
                                        <TableRow key={field.id}>
                                            <TableCell><FormField control={control} name={`optionalFeatures.${idx}.name`} render={({ field }) => <Input {...field} className="border-none bg-transparent" />} /></TableCell>
                                            {watchedPackageLevels.map((p: any) => <TableCell key={p.id} className="text-center"><PackageStatusToggle featureIndex={idx} packageId={p.id} /></TableCell>)}
                                            <TableCell className="text-right"><Button type="button" variant="ghost" size="icon" onClick={() => removeOptionalFeature(idx)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}

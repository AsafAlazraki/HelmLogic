'use client';

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { useForm, useFieldArray, useWatch, useController, useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';
import { useFirestore } from '@/firebase/provider';
import { doc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { fileToDataUri } from '@/firebase/storage-utils';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, X, PlusCircle, Trash2, Upload, Image as ImageIcon, Plus, ChevronDown, MoreHorizontal, Pencil } from 'lucide-react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from './ui/checkbox';
import { Separator } from './ui/separator';

// Schemas for validation
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
    imageUrl: z.string().nullable().optional(),
    category: z.string().optional(),
    cost: z.coerce.number().nullable().optional(),
    sellPriceExclGst: z.coerce.number().nullable().optional(),
    packageStatus: z.record(z.string(), z.enum(['standard', 'optional', 'na'])).default({}),
});

const packageLevelSchema = z.object({
    id: z.string(),
    name: z.string().min(1, 'Package level name is required'),
    description: z.string().optional(),
    cost: z.coerce.number().nullable().optional(),
    sellPriceExclGst: z.coerce.number().nullable().optional(),
});

const uDekOptionsSchema = z.object({
    blackOnWinterGrey: z.string().nullable().optional(),
    teakOnBlack: z.string().nullable().optional(),
    steelGreyOnWinterGrey: z.string().nullable().optional(),
    winterGreyOnSteelGrey: z.string().nullable().optional(),
}).optional();

const paintOptionSchema = z.object({
    id: z.string(),
    imageUrl: z.string().nullable().optional(),
    paint: z.string().optional(),
    graphics: z.string().optional(),
});

const modelSchema = z.object({
    coverImageUrl: z.string().nullable().optional(),
    galleryImageUrls: z.array(z.string()).default([]),
    cost: z.coerce.number().nullable().optional(),
    sellPriceExclGst: z.coerce.number().nullable().optional(),
    freightCostExclGst: z.coerce.number().nullable().optional(),
    specifications: z.object({
        motorConfigurations: z.array(motorConfigSchema).default([]),
        otherSpecs: z.array(specSchema).default([]),
    }).optional(),
    standardFeatures: z.array(z.string()).default([]),
    optionalFeatures: z.array(optionalFeatureSchema).default([]),
    packageLevels: z.array(packageLevelSchema).default([]),
    colorStages: z.object({
        stage0: z.boolean().default(false),
        stage1: z.boolean().default(false),
        stage2: z.boolean().default(false),
        stage3: z.boolean().default(false),
    }).optional(),
    uDekOptions: uDekOptionsSchema,
    paintAndGraphicOptions: z.object({
        standardGloss: z.array(paintOptionSchema).default([]),
        standardMetallic: z.array(paintOptionSchema).default([]),
    }).optional(),
});

type ModelFormData = z.infer<typeof modelSchema>;

const GST_RATE = 0.10;

function sanitizeDataForFirestore(data: any): any {
  if (data === undefined) {
    return null;
  }
  if (data === null || typeof data !== 'object') {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map(item => sanitizeDataForFirestore(item));
  }
  const sanitizedData: { [key: string]: any } = {};
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      const value = data[key];
      sanitizedData[key] = sanitizeDataForFirestore(value);
    }
  }
  return sanitizedData;
}

function GstInputPair({ control, name, label }: { control: any, name: string, label: string }) {
    const { field } = useController({ control, name, defaultValue: null });

    const valueExcl = field.value;
    const valueIncl = valueExcl !== null && valueExcl !== undefined ? Math.round((valueExcl * (1 + GST_RATE)) * 100) / 100 : null;

    const handleExclChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (val === '') {
            field.onChange(null);
        } else {
            const num = parseFloat(val);
            field.onChange(isNaN(num) ? null : num);
        }
    };

    const handleInclChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (val === '') {
            field.onChange(null);
        } else {
            const num = parseFloat(val);
            if (!isNaN(num)) {
                const excl = num / (1 + GST_RATE);
                field.onChange(Math.round(excl * 10000) / 10000);
            }
        }
    };

    return (
        <div>
            <FormLabel>{label}</FormLabel>
            <div className="grid grid-cols-2 gap-2 mt-2">
                <FormItem>
                    <FormLabel className="text-xs font-normal text-muted-foreground">excl. GST</FormLabel>
                    <FormControl>
                        <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={valueExcl === null || valueExcl === undefined ? '' : valueExcl}
                            onChange={handleExclChange}
                        />
                    </FormControl>
                    <FormMessage />
                </FormItem>
                <FormItem>
                    <FormLabel className="text-xs font-normal text-muted-foreground">inc. GST</FormLabel>
                    <FormControl>
                        <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={valueIncl === null || valueIncl === undefined ? '' : String(valueIncl)}
                            onChange={handleInclChange}
                        />
                    </FormControl>
                    <FormMessage />
                </FormItem>
            </div>
        </div>
    );
}

function PackageLevelItem({ form, index, remove }: { form: any; index: number; remove: (index: number) => void; }) {
    const {control} = form;

    return (
        <Collapsible asChild>
            <Card key={index} className="bg-muted/50 overflow-hidden">
                <div className="p-4 flex justify-between items-start">
                    <div className="flex-1 pr-4">
                        <FormField control={form.control} name={`packageLevels.${index}.name`} render={({ field }) => ( 
                            <FormItem>
                                <FormControl>
                                    <Input className="text-lg font-semibold border-none shadow-none p-0 h-auto bg-transparent focus-visible:ring-0" placeholder="Package Level Name" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem> 
                        )} />
                    </div>
                    <div className="flex items-center">
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => remove(index)}><Trash2 className="h-4 w-4"/></Button>
                        <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <ChevronDown className="h-5 w-5 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                            </Button>
                        </CollapsibleTrigger>
                    </div>
                </div>
                <CollapsibleContent>
                    <div className="px-4 pb-4 space-y-4">
                        <FormField control={control} name={`packageLevels.${index}.description`} render={({ field }) => ( 
                            <FormItem>
                                <FormLabel>Description</FormLabel>
                                <FormControl>
                                    <Textarea placeholder="A brief description of this package level." {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem> 
                        )} />
                    </div>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    );
}


const CollapsibleCardHeader = ({ title, description, children }: { title: string, description?: string, children?: React.ReactNode }) => (
    <CardHeader className="flex flex-row items-start justify-between">
        <div className="flex-1 space-y-1">
            <CardTitle>{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
        </div>
        <div className="flex items-center gap-2">
            {children}
            <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon">
                    <ChevronDown className="h-5 w-5 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </Button>
            </CollapsibleTrigger>
        </div>
    </CardHeader>
);

function PackageStatusToggle({ control, featureIndex, packageId }: { control: any, featureIndex: number, packageId: string }) {
    const { field } = useController({
        control,
        name: `optionalFeatures.${featureIndex}.packageStatus.${packageId}`,
        defaultValue: 'optional'
    });

    const toggleStatus = () => {
        if (field.value === 'optional') {
            field.onChange('standard');
        } else if (field.value === 'standard') {
            field.onChange('na');
        } else { // 'na' or any other value
            field.onChange('optional');
        }
    };

    const getVariant = (): "default" | "secondary" | "outline" => {
        switch (field.value) {
            case 'standard': return 'default';
            case 'na': return 'outline';
            default: return 'secondary';
        }
    };
    
    const getLabel = () => {
        switch (field.value) {
            case 'standard': return 'Standard';
            case 'na': return 'N/A';
            default: return 'Optional';
        }
    };

    return (
        <Button
            type="button"
            variant={getVariant()}
            className={cn(
                "w-28", 
                field.value === 'standard' && 'bg-blue-600 hover:bg-blue-700', 
                field.value === 'na' && 'border-dashed text-muted-foreground'
            )}
            size="sm"
            onClick={toggleStatus}
        >
            {getLabel()}
        </Button>
    );
}

function OptionalFeatureEditDialog({
  isOpen,
  setIsOpen,
  feature,
  featureIndex,
  onSave,
}: {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  feature: any;
  featureIndex: number;
  onSave: (index: number, data: any) => void;
}) {
  const dialogForm = useForm({
    resolver: zodResolver(
      z.object({
        name: z.string().min(1, 'Feature name is required'),
        imageUrl: z.string().nullable().optional(),
        cost: z.coerce.number().nullable().optional(),
        sellPriceExclGst: z.coerce.number().nullable().optional(),
      })
    ),
  });

  useEffect(() => {
    if (feature) {
      dialogForm.reset({
        name: feature.name,
        imageUrl: feature.imageUrl,
        cost: feature.cost,
        sellPriceExclGst: feature.sellPriceExclGst,
      });
    }
  }, [feature, dialogForm]);

  if (!feature) return null;

  const handleDialogSave = (data: any) => {
    onSave(featureIndex, data);
    setIsOpen(false);
  };

  const imageUrl = dialogForm.watch('imageUrl');

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Edit Optional Feature</DialogTitle>
          <DialogDescription>
            Make changes to the feature details below.
          </DialogDescription>
        </DialogHeader>
        <Form {...dialogForm}>
          <form
            onSubmit={dialogForm.handleSubmit(handleDialogSave)}
            className="space-y-4"
          >
            <div className="flex gap-4 items-start">
              <FormField
                control={dialogForm.control}
                name="imageUrl"
                render={({ field }) => (
                  <FormItem className="w-32 flex-shrink-0">
                    <FormLabel className="sr-only">Feature Image</FormLabel>
                    {imageUrl ? (
                      <div className="relative aspect-square w-full overflow-hidden rounded-md group">
                        <Image
                          src={imageUrl}
                          alt="Feature image"
                          fill
                          className="object-cover"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-background/50 border-background/50 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive"
                          onClick={() => field.onChange(null)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center w-full">
                        <label
                          htmlFor={`dialog-feature-upload`}
                          className="flex flex-col items-center justify-center w-full aspect-square border-2 border-dashed rounded-lg cursor-pointer bg-secondary hover:bg-muted"
                        >
                          <div className="flex flex-col items-center justify-center text-center p-2">
                            <Upload
                              className="w-6 h-6 mb-1 text-muted-foreground"
                            />
                            <p className="text-xs text-muted-foreground">
                              Upload
                            </p>
                          </div>
                          <FormControl>
                            <Input
                              id={`dialog-feature-upload`}
                              type="file"
                              className="hidden"
                              accept="image/*"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (file)
                                  field.onChange(await fileToDataUri(file));
                              }}
                            />
                          </FormControl>
                        </label>
                      </div>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex-1 space-y-3">
                <FormField
                  control={dialogForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Feature Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Feature Name"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <GstInputPair
                    control={dialogForm.control}
                    name="cost"
                    label="Cost"
                  />
                  <GstInputPair
                    control={dialogForm.control}
                    name="sellPriceExclGst"
                    label="Sell Price"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Save Changes</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function MotorConfigurationsCard({ control }: { control: any }) {
    const { fields, append, remove } = useFieldArray({
        control,
        name: "specifications.motorConfigurations",
    });

    const motorConfigOptions = [
        { id: 'Single', label: 'Single Engine', engineCount: 1, engineLabels: ['Engine'] },
        { id: 'Twin', label: 'Twin Engines', engineCount: 2, engineLabels: ['Engine 1', 'Engine 2'] },
        { id: 'Triple', label: 'Triple Engines', engineCount: 3, engineLabels: ['Engine 1', 'Engine 2', 'Engine 3'] },
        { id: 'Quad', label: 'Quad Engines', engineCount: 4, engineLabels: ['Engine 1', 'Engine 2', 'Engine 3', 'Engine 4'] },
        { id: 'SingleWithAux', label: 'Single with Aux', engineCount: 2, engineLabels: ['Main Engine', 'Auxiliary Engine'] },
    ];

    const handleConfigChange = (checked: boolean, option: typeof motorConfigOptions[0]) => {
        if (checked) {
            const newEngines = Array.from({ length: option.engineCount }, (_, i) => ({
                label: option.engineLabels[i],
                minHp: 0,
                maxHp: 0,
                recommendedHp: 0
            }));
            append({ type: option.id, engines: newEngines });
        } else {
            const index = fields.findIndex((field: any) => field.type === option.id);
            if (index > -1) {
                remove(index);
            }
        }
    };

    return (
        <Collapsible asChild className="group">
            <Card>
                <CollapsibleCardHeader title="Motor Configurations" description="Define supported engine configurations and HP ratings." />
                <CollapsibleContent>
                    <CardContent className="space-y-2">
                        {motorConfigOptions.map((option) => {
                            const fieldIndex = fields.findIndex((field: any) => field.type === option.id);
                            const isChecked = fieldIndex !== -1;
                            const currentConfig = isChecked ? fields[fieldIndex] as any : null;

                            return (
                                <Collapsible key={option.id} asChild>
                                    <div className="p-4 border rounded-lg">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center space-x-3">
                                                <Checkbox
                                                    checked={isChecked}
                                                    onCheckedChange={(checked) => handleConfigChange(!!checked, option)}
                                                    id={`config-${option.id}`}
                                                />
                                                <label htmlFor={`config-${option.id}`} className="text-sm font-medium leading-none">
                                                    {option.label}
                                                </label>
                                            </div>
                                            {isChecked && (
                                                <CollapsibleTrigger asChild>
                                                    <Button variant="ghost" size="icon">
                                                        <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                                                    </Button>
                                                </CollapsibleTrigger>
                                            )}
                                        </div>
                                        <CollapsibleContent className="pt-4 mt-4 border-t">
                                            {isChecked && currentConfig && (
                                                <div className="space-y-4">
                                                    {(currentConfig.engines || []).map((engine: any, engineIndex: number) => (
                                                        <div key={engineIndex} className="space-y-2 rounded-md border p-4">
                                                            <p className="text-sm font-medium text-muted-foreground">{engine.label}</p>
                                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                                <FormField
                                                                    control={control}
                                                                    name={`specifications.motorConfigurations.${fieldIndex}.engines.${engineIndex}.minHp`}
                                                                    render={({ field }) => (
                                                                        <FormItem>
                                                                            <FormLabel>Min HP</FormLabel>
                                                                            <FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl>
                                                                            <FormMessage />
                                                                        </FormItem>
                                                                    )}
                                                                />
                                                                <FormField
                                                                    control={control}
                                                                    name={`specifications.motorConfigurations.${fieldIndex}.engines.${engineIndex}.maxHp`}
                                                                    render={({ field }) => (
                                                                        <FormItem>
                                                                            <FormLabel>Max HP</FormLabel>
                                                                            <FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl>
                                                                            <FormMessage />
                                                                        </FormItem>
                                                                    )}
                                                                />
                                                                <FormField
                                                                    control={control}
                                                                    name={`specifications.motorConfigurations.${fieldIndex}.engines.${engineIndex}.recommendedHp`}
                                                                    render={({ field }) => (
                                                                        <FormItem>
                                                                            <FormLabel>Recommended HP</FormLabel>
                                                                            <FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl>
                                                                            <FormMessage />
                                                                        </FormItem>
                                                                    )}
                                                                />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </CollapsibleContent>
                                    </div>
                                </Collapsible>
                            );
                        })}
                    </CardContent>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    );
}

function ImageUploadSlot({ name, label }: { name: string; label: string; }) {
    const { control } = useFormContext();
    const { field } = useController({ control, name });
    const imageUrl = useWatch({ control, name });

    return (
        <div className="space-y-2">
            <FormLabel className="text-xs text-center block font-semibold">{label}</FormLabel>
            <div className="relative aspect-square w-full overflow-hidden rounded-md group border">
                {imageUrl ? (
                    <>
                        <Image src={imageUrl} alt={label} fill className="object-cover" />
                        <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                            onClick={() => field.onChange(null)}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </>
                ) : (
                    <label htmlFor={name} className="flex flex-col items-center justify-center w-full h-full cursor-pointer bg-secondary hover:bg-muted">
                        <Upload className="w-6 h-6 text-muted-foreground" />
                        <FormControl>
                            <Input
                                id={name}
                                type="file"
                                className="hidden"
                                accept="image/*"
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (file) field.onChange(await fileToDataUri(file));
                                }}
                            />
                        </FormControl>
                    </label>
                )}
            </div>
        </div>
    );
}

function UDekFlooringCard() {
    const uDekOptions = [
        { key: 'blackOnWinterGrey', label: 'Black on Winter Grey' },
        { key: 'teakOnBlack', label: 'Teak on Black' },
        { key: 'steelGreyOnWinterGrey', label: 'Steel Grey on Winter Grey' },
        { key: 'winterGreyOnSteelGrey', label: 'Winter Grey on Steel Grey' },
    ];

    return (
        <Collapsible asChild>
            <Card>
                <CollapsibleCardHeader title="U-Dek Flooring Options" />
                <CollapsibleContent>
                    <CardContent className="grid grid-cols-2 gap-4">
                        {uDekOptions.map(option => (
                            <ImageUploadSlot
                                key={option.key}
                                name={`uDekOptions.${option.key}`}
                                label={option.label}
                            />
                        ))}
                    </CardContent>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    );
}

function PaintOptionItem({ category, index, remove }: { category: 'standardGloss' | 'standardMetallic'; index: number; remove: (index: number) => void; }) {
    const { control } = useFormContext<ModelFormData>();
    const namePrefix = `paintAndGraphicOptions.${category}.${index}` as const;
    const imageUrl = useWatch({ control, name: `${namePrefix}.imageUrl` });

    return (
        <Card className="p-2 bg-background/50">
            <div className="space-y-2">
                <div className="relative aspect-video w-full overflow-hidden rounded-md group border">
                    {imageUrl ? (
                        <>
                            <Image src={imageUrl} alt={`Paint option ${index + 1}`} fill className="object-cover" />
                             <Button
                                type="button"
                                variant="destructive"
                                size="icon"
                                className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                onClick={() => control.setValue(`${namePrefix}.imageUrl`, null)}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </>
                    ) : (
                        <label htmlFor={`${namePrefix}-upload`} className="flex flex-col items-center justify-center w-full h-full cursor-pointer bg-secondary hover:bg-muted">
                            <Upload className="w-6 h-6 text-muted-foreground" />
                            <FormControl>
                                <Input
                                    id={`${namePrefix}-upload`}
                                    type="file"
                                    className="hidden"
                                    accept="image/*"
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (file) control.setValue(`${namePrefix}.imageUrl`, await fileToDataUri(file));
                                    }}
                                />
                            </FormControl>
                        </label>
                    )}
                </div>
                 <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-1">
                        <FormField
                            control={control}
                            name={`${namePrefix}.paint`}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs">Paint</FormLabel>
                                    <FormControl><Input {...field} value={field.value ?? ''} placeholder="e.g., Blue" /></FormControl>
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={control}
                            name={`${namePrefix}.graphics`}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs">Graphics</FormLabel>
                                    <FormControl><Input {...field} value={field.value ?? ''} placeholder="e.g., Red" /></FormControl>
                                </FormItem>
                            )}
                        />
                    </div>
                     <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(index)}>
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </Card>
    );
}

function PaintAndGraphicOptionsCard() {
    const { control } = useFormContext<ModelFormData>();
    const { fields: glossFields, append: appendGloss, remove: removeGloss } = useFieldArray({ control, name: 'paintAndGraphicOptions.standardGloss' });
    const { fields: metallicFields, append: appendMetallic, remove: removeMetallic } = useFieldArray({ control, name: 'paintAndGraphicOptions.standardMetallic' });

    return (
        <Collapsible asChild>
            <Card>
                <CollapsibleCardHeader title="Paint &amp; Graphic Options" />
                <CollapsibleContent>
                    <CardContent className="space-y-6">
                        <Collapsible>
                            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border p-4 font-semibold">
                                <span>Standard Gloss</span>
                                <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
                            </CollapsibleTrigger>
                            <CollapsibleContent className="px-4 pt-4">
                                <div className="grid grid-cols-2 gap-4">
                                    {glossFields.map((field, index) => (
                                        <PaintOptionItem key={field.id} category="standardGloss" index={index} remove={removeGloss} />
                                    ))}
                                </div>
                                <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => appendGloss({ id: `gloss-${Date.now()}`, imageUrl: null, paint: '', graphics: '' })}>
                                    <PlusCircle className="mr-2 h-4 w-4" /> Add Gloss Option
                                </Button>
                            </CollapsibleContent>
                        </Collapsible>
                        <Collapsible>
                            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border p-4 font-semibold">
                                <span>Standard Metallic</span>
                                <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
                            </CollapsibleTrigger>
                            <CollapsibleContent className="px-4 pt-4">
                               <div className="grid grid-cols-2 gap-4">
                                    {metallicFields.map((field, index) => (
                                        <PaintOptionItem key={field.id} category="standardMetallic" index={index} remove={removeMetallic} />
                                    ))}
                                </div>
                                <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => appendMetallic({ id: `metallic-${Date.now()}`, imageUrl: null, paint: '', graphics: '' })}>
                                    <PlusCircle className="mr-2 h-4 w-4" /> Add Metallic Option
                                </Button>
                            </CollapsibleContent>
                        </Collapsible>
                    </CardContent>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    );
}

export function StabicraftModelEditor({ model, docPath }: { model: any; docPath: string }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [standardBulkFeatures, setStandardBulkFeatures] = useState('');
    const [categoryBulkFeatures, setCategoryBulkFeatures] = useState<Record<string, string>>({});

    const [categories, setCategories] = useState<string[]>([]);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);

    const [editingFeature, setEditingFeature] = useState<{ feature: any, index: number } | null>(null);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

    const getSafeDefaultValues = (modelData: any): ModelFormData => {
        const data = modelData || {};
        const specs = data.specifications || {};
        const packageLevels = data.packageLevels || [];

        const optionalFeatures = (data.optionalFeatures || []).map((f: any) => {
            const packageStatus = f.packageStatus || {};
            packageLevels.forEach((p: any) => {
                if (!(p.id in packageStatus)) {
                    packageStatus[p.id] = 'optional';
                }
            });
            return {
                ...f,
                packageStatus,
            };
        });

        return {
            coverImageUrl: data.coverImageUrl ?? null,
            galleryImageUrls: data.galleryImageUrls ?? [],
            cost: data.cost ?? null,
            sellPriceExclGst: data.sellPriceExclGst ?? null,
            freightCostExclGst: data.freightCostExclGst ?? null,
            specifications: {
                motorConfigurations: specs.motorConfigurations ?? [],
                otherSpecs: specs.otherSpecs ?? [],
            },
            standardFeatures: data.standardFeatures ?? [],
            optionalFeatures: optionalFeatures,
            packageLevels: (data.packageLevels || []).map((p: any) => ({
                ...p,
                description: p.description ?? '',
                cost: p.cost ?? null,
                sellPriceExclGst: p.sellPriceExclGst ?? null,
            })),
            colorStages: data.colorStages ?? { stage0: false, stage1: false, stage2: false, stage3: false },
            uDekOptions: data.uDekOptions ?? { blackOnWinterGrey: null, teakOnBlack: null, steelGreyOnWinterGrey: null, winterGreyOnSteelGrey: null },
            paintAndGraphicOptions: data.paintAndGraphicOptions ?? { standardGloss: [], standardMetallic: [] },
        };
    };

    const form = useForm<ModelFormData>({
        resolver: zodResolver(modelSchema),
        defaultValues: getSafeDefaultValues(model),
    });
    
    const { reset, getValues } = form;

    useEffect(() => {
        if (model) {
            const defaultValues = getSafeDefaultValues(model);
            reset(defaultValues);
            const initialCategories = [...new Set((defaultValues.optionalFeatures || []).map(f => f.category).filter(Boolean) as string[])];
            setCategories(initialCategories);
        }
    }, [model, reset]);
    
    const { fields: specFields, append: appendSpec, remove: removeSpec } = useFieldArray({ control: form.control, name: "specifications.otherSpecs" });
    const { fields: featureFields, append: appendFeature, remove: removeFeature, replace: replaceFeatures } = useFieldArray({ control: form.control, name: "standardFeatures" });
    const { fields: packageLevelFields, append: appendPackageLevel, remove: removePackageLevel } = useFieldArray({ control: form.control, name: "packageLevels" });
    const { fields: galleryImageFields, append: appendGalleryImage, remove: removeGalleryImage } = useFieldArray({ control: form.control, name: 'galleryImageUrls' });
    const { fields: optionalFeatureFields, append: appendOptionalFeature, remove: removeOptionalFeature, update: updateOptionalFeature } = useFieldArray({ control: form.control, name: "optionalFeatures" });
    
    const watchedOptionalFeatures = useWatch({ control: form.control, name: 'optionalFeatures' });
    const watchedPackageLevels = useWatch({ control: form.control, name: 'packageLevels' });
    const coverImageUrl = useWatch({ control: form.control, name: "coverImageUrl" });

    const categorizedFeatures = React.useMemo(() => {
        const categoryMap = new Map<string, { field: any, index: number }[]>();
    
        optionalFeatureFields.forEach((field, index) => {
            const category = watchedOptionalFeatures?.[index]?.category;
            if (category && categories.includes(category)) {
                if (!categoryMap.has(category)) categoryMap.set(category, []);
                categoryMap.get(category)!.push({ field, index });
            }
        });
    
        return categories.map(name => ({
            name,
            items: categoryMap.get(name) || []
        }));
    }, [optionalFeatureFields, watchedOptionalFeatures, categories]);


    async function onSubmit(values: ModelFormData) {
        setIsSubmitting(true);
        const sanitizedValues = sanitizeDataForFirestore(values);
        const modelDocRef = doc(firestore, docPath);

        try {
            await updateDoc(modelDocRef, sanitizedValues);
            toast({ title: "Model Updated", description: "Your changes have been saved." });
            reset(values);
        } catch (e) {
            const error = e as any;
            console.error("Save failed:", error);
            toast({ variant: "destructive", title: "Error", description: "Could not save changes." });
            const permissionError = new FirestorePermissionError({
                path: modelDocRef.path, operation: 'update', requestResourceData: sanitizedValues,
            });
            errorEmitter.emit('permission-error', permissionError);
        } finally {
            setIsSubmitting(false);
        }
    }
    
    const handleBulkAddStandardFeatures = () => {
        const features = standardBulkFeatures.split('\n').map(f => f.trim()).filter(Boolean);
        replaceFeatures(features.map(f => f));
        setStandardBulkFeatures('');
    };

    const handleAddCategory = () => {
        if (newCategoryName.trim() && !categories.includes(newCategoryName.trim())) {
            setCategories(prev => [...prev, newCategoryName.trim()]);
            setNewCategoryName('');
        }
    };
    
    const handleConfirmDeleteCategory = () => {
        if (!categoryToDelete) return;
        
        const indicesToRemove = watchedOptionalFeatures
            .map((feature, index) => ({ feature, index }))
            .filter(({ feature }) => feature.category === categoryToDelete)
            .map(({ index }) => index)
            .reverse();

        indicesToRemove.forEach(index => {
            removeOptionalFeature(index);
        });

        setCategories(prev => prev.filter(c => c !== categoryToDelete));
        setCategoryToDelete(null);
    };

    const handleCategoryChange = (featureIndex: number, newCategory?: string) => {
        const currentFeature = watchedOptionalFeatures[featureIndex];
        updateOptionalFeature(featureIndex, { ...currentFeature, category: newCategory });
    };
    
    const handleBulkAddOptionalFeatures = (category: string) => {
        const textToParse = category ? categoryBulkFeatures[category] : '';
        if (!textToParse) return;

        const features = textToParse.split('\n').map(f => f.trim()).filter(Boolean);
        const packageLevels = getValues('packageLevels') || [];

        features.forEach(featureName => {
            const newFeature = {
                id: `feat-${Date.now()}-${Math.random()}`,
                name: featureName,
                imageUrl: null,
                category: category,
                cost: null,
                sellPriceExclGst: null,
                packageStatus: packageLevels.reduce((acc: any, pkg: any) => {
                    acc[pkg.id] = 'optional';
                    return acc;
                }, {}),
            };
            appendOptionalFeature(newFeature);
        });

        if (category) {
            setCategoryBulkFeatures(prev => ({...prev, [category]: ''}));
        }
    };

    const handleAddNewFeature = (category?: string) => {
        const packageLevels = getValues('packageLevels') || [];
        const newFeature = {
            id: `feat-${Date.now()}`,
            name: '',
            imageUrl: null,
            category,
            cost: null,
            sellPriceExclGst: null,
            packageStatus: packageLevels.reduce((acc: any, pkg: any) => {
                acc[pkg.id] = 'optional';
                return acc;
            }, {}),
        };
        appendOptionalFeature(newFeature);
    }
    
    const handleEditFeature = (index: number) => {
        const feature = getValues(`optionalFeatures.${index}`);
        setEditingFeature({ feature, index });
        setIsEditDialogOpen(true);
    };

    const handleSaveEditedFeature = (index: number, data: any) => {
        const currentFeature = getValues(`optionalFeatures.${index}`);
        updateOptionalFeature(index, { ...currentFeature, ...data });
    };

    return (
         <>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <div className="flex justify-end gap-2">
                         <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            <Save className="mr-2 h-4 w-4" />
                            Save Changes
                        </Button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-7 gap-8 items-start">
                        {/* --- LEFT COLUMN --- */}
                        <div className="lg:col-span-4 space-y-8">
                            <MotorConfigurationsCard control={form.control} />
                             <Collapsible asChild>
                                <Card>
                                    <CollapsibleCardHeader title="Package Levels" description="Define the different package levels for this model.">
                                        <Button type="button" variant="outline" size="sm" onClick={() => appendPackageLevel({ id: `pkg-lvl-${Date.now()}`, name: '', description: '', cost: null, sellPriceExclGst: null})}><PlusCircle className="mr-2 h-4 w-4"/>Add Package Level</Button>
                                    </CollapsibleCardHeader>
                                    <CollapsibleContent>
                                        <CardContent className="space-y-4">
                                             {packageLevelFields.map((field, index) => (
                                                <PackageLevelItem key={field.id} form={form} index={index} remove={removePackageLevel} />
                                            ))}
                                            {packageLevelFields.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No package levels added.</p>}
                                        </CardContent>
                                    </CollapsibleContent>
                                </Card>
                            </Collapsible>
                             <Collapsible asChild>
                                <Card>
                                    <CollapsibleCardHeader title="Specifications" />
                                    <CollapsibleContent>
                                        <CardContent className="space-y-6">
                                            <div className="space-y-4">
                                                {specFields.length > 0 && <FormLabel>Other Specs</FormLabel>}
                                                {specFields.map((field, index) => (
                                                    <div key={field.id} className="flex items-end gap-2">
                                                        <FormField control={form.control} name={`specifications.otherSpecs.${index}.label`} render={({ field }) => ( <FormItem className="flex-1"><FormControl><Input placeholder="Label" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )} />
                                                        <FormField control={form.control} name={`specifications.otherSpecs.${index}.value`} render={({ field }) => ( <FormItem className="flex-1"><FormControl><Input placeholder="Value" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )} />
                                                        <Button type="button" variant="ghost" size="icon" onClick={() => removeSpec(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                                    </div>
                                                ))}
                                            </div>
                                        </CardContent>
                                    </CollapsibleContent>
                                </Card>
                            </Collapsible>
                            <Collapsible asChild>
                                <Card>
                                    <CollapsibleCardHeader title="Standard Features">
                                        <Button type="button" variant="outline" size="sm" onClick={() => appendFeature('')}><PlusCircle className="mr-2 h-4 w-4" />Add Feature</Button>
                                    </CollapsibleCardHeader>
                                    <CollapsibleContent>
                                        <CardContent className="space-y-4 max-h-96 overflow-y-auto">
                                            {featureFields.map((field, index) => (
                                                 <div key={field.id} className="flex items-center gap-2">
                                                    <FormField control={form.control} name={`standardFeatures.${index}`} render={({ field }) => ( <FormItem className="flex-1"><FormControl><Input {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )} />
                                                    <Button type="button" variant="ghost" size="icon" onClick={() => removeFeature(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                                </div>
                                            ))}
                                        </CardContent>
                                        <CardContent>
                                            <div className="space-y-2">
                                                <FormLabel>Bulk Add Features</FormLabel>
                                                <Textarea placeholder="One feature per line..." value={standardBulkFeatures} onChange={(e) => setStandardBulkFeatures(e.target.value)} />
                                                <Button type="button" variant="secondary" size="sm" onClick={handleBulkAddStandardFeatures} disabled={!standardBulkFeatures.trim()}>Add from Text</Button>
                                            </div>
                                        </CardContent>
                                    </CollapsibleContent>
                                </Card>
                            </Collapsible>
                        </div>

                        {/* --- RIGHT COLUMN --- */}
                        <div className="lg:col-span-3 space-y-8">
                           <Collapsible asChild>
                                <Card>
                                    <CollapsibleCardHeader title="Pricing" />
                                    <CollapsibleContent>
                                        <CardContent className="space-y-6">
                                            {packageLevelFields.length === 0 ? (
                                                <>
                                                    <GstInputPair control={form.control} name="cost" label="Base Cost" />
                                                    <GstInputPair control={form.control} name="sellPriceExclGst" label="Base Sell" />
                                                </>
                                            ) : (
                                                <div className="space-y-4">
                                                    {packageLevelFields.map((field, index) => (
                                                        <div key={field.id} className="p-4 border rounded-md bg-muted/50">
                                                            <h4 className="font-semibold mb-4">{watchedPackageLevels?.[index]?.name || `Package ${index + 1}`}</h4>
                                                            <div className="grid grid-cols-2 gap-4">
                                                                <GstInputPair control={form.control} name={`packageLevels.${index}.cost`} label="Cost" />
                                                                <GstInputPair control={form.control} name={`packageLevels.${index}.sellPriceExclGst`} label="Sell Price" />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <GstInputPair control={form.control} name="freightCostExclGst" label="Freight Cost" />
                                        </CardContent>
                                    </CollapsibleContent>
                                </Card>
                            </Collapsible>
                            
                            
                             <Collapsible asChild>
                                <Card>
                                    <CollapsibleCardHeader title="Avail. Color Stages" />
                                    <CollapsibleContent>
                                        <CardContent className="grid grid-cols-2 gap-4">
                                            {([0, 1, 2, 3] as const).map((stage) => (
                                                <FormField
                                                    key={stage}
                                                    control={form.control}
                                                    name={`colorStages.stage${stage}`}
                                                    render={({ field }) => (
                                                        <FormItem className="flex items-center space-x-3 space-y-0 rounded-md border p-4">
                                                            <FormControl>
                                                                <Checkbox
                                                                    checked={field.value}
                                                                    onCheckedChange={field.onChange}
                                                                />
                                                            </FormControl>
                                                            <div className="space-y-1 leading-none">
                                                                <FormLabel>
                                                                    Stage {stage}
                                                                </FormLabel>
                                                            </div>
                                                        </FormItem>
                                                    )}
                                                />
                                            ))}
                                        </CardContent>
                                    </CollapsibleContent>
                                </Card>
                            </Collapsible>
                            <UDekFlooringCard />
                            <PaintAndGraphicOptionsCard />
                        </div>
                        
                        {/* --- FULL WIDTH PACKAGE SECTION --- */}
                        <div className="lg:col-span-7 space-y-8">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Optional Features &amp; Packages</CardTitle>
                                    <CardDescription>
                                        Manage optional features and specify if they are 'Standard' or 'Optional' for each package.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex items-center gap-2">
                                        <Input placeholder="New Category Name" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} className="max-w-xs"/>
                                        <Button type="button" onClick={handleAddCategory} disabled={!newCategoryName.trim()}>Add Category</Button>
                                    </div>
                                    <div className="space-y-4">
                                        {categorizedFeatures.map(({ name, items }) => (
                                            <Collapsible key={name} defaultOpen={false}>
                                                <div className="flex items-center justify-between border-b px-2 py-2">
                                                    <CollapsibleTrigger className="w-full text-left cursor-pointer flex items-center">
                                                        <ChevronDown className="h-4 w-4 mr-2 shrink-0 transition-transform duration-200" />
                                                        <h3 className="font-semibold">{name}</h3>
                                                    </CollapsibleTrigger>
                                                    <div className='flex items-center'>
                                                        <Button type="button" variant="ghost" size="sm" onClick={() => handleAddNewFeature(name)}><PlusCircle className="mr-2 h-4 w-4"/>Add Feature</Button>
                                                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setCategoryToDelete(name)}><Trash2 className="h-4 w-4"/></Button>
                                                    </div>
                                                </div>
                                                <CollapsibleContent className="p-2 space-y-4">
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow>
                                                                <TableHead className="w-2/5">Feature</TableHead>
                                                                {watchedPackageLevels.map(pkg => <TableHead key={pkg.id} className="text-center">{pkg.name}</TableHead>)}
                                                                <TableHead className="w-[50px] text-right">Actions</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {items.map(({ field, index }) => (
                                                                <TableRow key={field.id}>
                                                                    <TableCell>
                                                                        <FormField control={form.control} name={`optionalFeatures.${index}.name`} render={({ field }) => ( <FormItem className="w-full"><FormControl><Input {...field} value={field.value ?? ''} className="border-none bg-transparent p-0 shadow-none focus-visible:ring-0" /></FormControl><FormMessage /></FormItem> )} />
                                                                    </TableCell>
                                                                    {watchedPackageLevels.map(pkg => (
                                                                        <TableCell key={pkg.id} className="text-center">
                                                                            <PackageStatusToggle control={form.control} featureIndex={index} packageId={pkg.id} />
                                                                        </TableCell>
                                                                    ))}
                                                                    <TableCell className="text-right">
                                                                        <DropdownMenu>
                                                                            <DropdownMenuTrigger asChild>
                                                                                <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                                                                            </DropdownMenuTrigger>
                                                                            <DropdownMenuContent>
                                                                                <DropdownMenuItem onSelect={() => handleEditFeature(index)}>
                                                                                    <Pencil className="mr-2 h-4 w-4" /> Edit
                                                                                </DropdownMenuItem>
                                                                                <DropdownMenuSub>
                                                                                    <DropdownMenuSubTrigger>Move to...</DropdownMenuSubTrigger>
                                                                                    <DropdownMenuSubContent>
                                                                                        {categories.map((cat) => (
                                                                                            <DropdownMenuItem key={cat} onClick={() => handleCategoryChange(index, cat)}>{cat}</DropdownMenuItem>
                                                                                        ))}
                                                                                    </DropdownMenuSubContent>
                                                                                </DropdownMenuSub>
                                                                                <DropdownMenuSeparator />
                                                                                <DropdownMenuItem className="text-destructive" onClick={() => removeOptionalFeature(index)}>
                                                                                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                                                                                </DropdownMenuItem>
                                                                            </DropdownMenuContent>
                                                                        </DropdownMenu>
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                    <Collapsible>
                                                        <CollapsibleTrigger className="w-full text-left cursor-pointer flex items-center text-sm text-muted-foreground p-2 hover:bg-muted rounded-md">
                                                            <Plus className="h-4 w-4 mr-2"/> Bulk Add to {name}
                                                        </CollapsibleTrigger>
                                                        <CollapsibleContent className="p-4 bg-muted/20 rounded-md mt-2">
                                                            <div className="space-y-2">
                                                                <Textarea placeholder="One feature per line..." value={categoryBulkFeatures[name] || ''} onChange={(e) => setCategoryBulkFeatures(prev => ({...prev, [name]: e.target.value}))}/>
                                                                <Button type="button" size="sm" onClick={() => handleBulkAddOptionalFeatures(name)} disabled={!categoryBulkFeatures[name]?.trim()}>Add Features from Text</Button>
                                                            </div>
                                                        </CollapsibleContent>
                                                    </Collapsible>
                                                </CollapsibleContent>
                                            </Collapsible>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </form>
            </Form>
            <Dialog open={!!categoryToDelete} onOpenChange={(open) => !open && setCategoryToDelete(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Category "{categoryToDelete}"?</DialogTitle>
                        <DialogDescription>
                            This will permanently delete the category and all features within it. This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setCategoryToDelete(null)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleConfirmDeleteCategory}>Delete</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <OptionalFeatureEditDialog
                isOpen={isEditDialogOpen}
                setIsOpen={setIsEditDialogOpen}
                feature={editingFeature?.feature}
                featureIndex={editingFeature?.index ?? -1}
                onSave={handleSaveEditedFeature}
            />
        </>
    );
}

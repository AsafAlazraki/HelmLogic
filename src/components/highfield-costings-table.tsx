'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm, useFieldArray, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useFirestore } from '@/firebase/provider';
import { collection, doc, writeBatch, getDocs } from 'firebase/firestore';
import { Loader2, Save, ChevronRight, AlertTriangle, ChevronsUpDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check } from 'lucide-react';


// --- Constants & Types ---
const GST_RATE = 0.10;
const exchangeRates: Record<string, number> = {
  AUD: 1,
  USD: 1.52,
  EUR: 1.65,
  GBP: 1.95,
  CNY: 0.21,
};
const currencies = Object.keys(exchangeRates).map(key => ({ value: key, label: key}));

type Range = { id: string; name: string };
type Model = {
    id: string;
    path: string;
    name: string;
    cost?: number;
    sellPriceExclGst?: number;
    freightCostExclGst?: number;
    optionalFeatures?: OptionalFeature[];
};
type OptionalFeature = {
    id: string;
    name: string;
    cost?: number;
    sellPriceExclGst?: number;
    freightCostExclGst?: number;
};

// --- Zod Schemas for Form Validation ---
const optionalFeatureCostSchema = z.object({
  id: z.string(),
  path: z.string(),
  name: z.string(),
  cost: z.coerce.number().optional(),
  sellPriceExclGst: z.coerce.number().optional(),
  freightCostExclGst: z.coerce.number().optional(),
});

const modelCostSchema = z.object({
  id: z.string(),
  path: z.string(),
  name: z.string(),
  cost: z.coerce.number().optional(),
  sellPriceExclGst: z.coerce.number().optional(),
  freightCostExclGst: z.coerce.number().optional(),
  optionalFeatures: z.array(optionalFeatureCostSchema).optional(),
});

const formSchema = z.object({
  models: z.array(modelCostSchema),
});
type FormValues = z.infer<typeof formSchema>;


// --- CurrencyInput Component ---
interface CurrencyInputProps {
    control: any;
    name: any;
    globalCurrency: string;
}

function CurrencyInput({ control, name, globalCurrency }: CurrencyInputProps) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const audValue = field.value || 0;
        const displayValue = (audValue / exchangeRates[globalCurrency]).toFixed(2);
        const valueInclGst = audValue * (1 + GST_RATE);

        const handleDisplayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            const newDisplayValue = e.target.value;
            const newAudValue = parseFloat(newDisplayValue) * exchangeRates[globalCurrency];
            field.onChange(isNaN(newAudValue) ? 0 : newAudValue);
        };
        
        return (
            <FormItem>
                <FormControl>
                    <Input
                        type="number"
                        value={displayValue === '0.00' ? '' : displayValue}
                        onChange={handleDisplayChange}
                        className="w-28 text-right"
                        placeholder="0.00"
                    />
                </FormControl>
                 <div className="text-xs text-muted-foreground pt-1 space-y-0.5">
                    <p>ex. GST: {audValue?.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })}</p>
                    <p>inc. GST: {valueInclGst.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })}</p>
                </div>
            </FormItem>
        )
      }}
    />
  );
}


// --- Main Table Component ---
export function HighfieldCostingsTable({ vendorId }: { vendorId: string }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [openRows, setOpenRows] = useState<Record<string, boolean>>({});
    const [globalCurrency, setGlobalCurrency] = useState('AUD');
    const [popoverOpen, setPopoverOpen] = useState(false)


    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: { models: [] },
    });
    
    const { fields: modelFields } = useFieldArray({
        control: form.control,
        name: "models",
    });

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const rangesCollectionRef = collection(firestore, `data-warehouse/${vendorId}/ranges`);
            const rangesSnapshot = await getDocs(rangesCollectionRef);
            const ranges = rangesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Range));

            const allModels: Model[] = [];
            await Promise.all(ranges.map(async (range) => {
                const modelsCollectionRef = collection(firestore, `data-warehouse/${vendorId}/ranges/${range.id}/models`);
                const modelsSnapshot = await getDocs(modelsCollectionRef);
                modelsSnapshot.forEach(doc => {
                    allModels.push({ id: doc.id, path: doc.ref.path, ...doc.data() } as Model);
                });
            }));
            
            allModels.sort((a,b) => a.name.localeCompare(b.name));

            form.reset({
                models: allModels.map(m => ({
                    id: m.id,
                    path: m.path,
                    name: m.name,
                    cost: m.cost || 0,
                    sellPriceExclGst: m.sellPriceExclGst || 0,
                    freightCostExclGst: m.freightCostExclGst || 0,
                    optionalFeatures: (m.optionalFeatures || []).map(of => ({
                        id: of.id,
                        path: `${m.path}`, // Path to parent model
                        name: of.name,
                        cost: of.cost || 0,
                        sellPriceExclGst: of.sellPriceExclGst || 0,
                        freightCostExclGst: of.freightCostExclGst || 0,
                    }))
                }))
            });

        } catch (error) {
            console.error("Error fetching Highfield models:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch model data.' });
        } finally {
            setIsLoading(false);
        }
    }, [vendorId, firestore, form, toast]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const onSubmit = async (data: FormValues) => {
        setIsSaving(true);
        const batch = writeBatch(firestore);
        const { dirtyFields } = form.formState;

        data.models.forEach((model, modelIndex) => {
             if (dirtyFields.models?.[modelIndex]) {
                const modelRef = doc(firestore, model.path);
                const modelUpdate: Partial<Model> = {};

                if (dirtyFields.models[modelIndex]?.cost) modelUpdate.cost = model.cost;
                if (dirtyFields.models[modelIndex]?.sellPriceExclGst) modelUpdate.sellPriceExclGst = model.sellPriceExclGst;
                if (dirtyFields.models[modelIndex]?.freightCostExclGst) modelUpdate.freightCostExclGst = model.freightCostExclGst;
                
                if (dirtyFields.models[modelIndex]?.optionalFeatures) {
                    modelUpdate.optionalFeatures = model.optionalFeatures?.map(of => ({
                        id: of.id,
                        name: of.name,
                        cost: of.cost,
                        sellPriceExclGst: of.sellPriceExclGst,
                        freightCostExclGst: of.freightCostExclGst,
                    }));
                }
                
                if (Object.keys(modelUpdate).length > 0) {
                     batch.update(modelRef, modelUpdate);
                }
             }
        });

        try {
            await batch.commit();
            toast({ title: 'Success!', description: 'Costings have been updated.' });
            form.reset(data); // Resets dirty fields
        } catch (error) {
            console.error('Error saving costs:', error);
            toast({ variant: 'destructive', title: 'Save Failed', description: 'Could not save changes.' });
        } finally {
            setIsSaving(false);
        }
    };
    
    if (isLoading) {
        return <div className="flex justify-center items-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }

    return (
        <Card>
            <CardHeader className="flex-row items-center justify-between">
                <div>
                    <CardTitle>Highfield Model Costings</CardTitle>
                    <CardDescription className="pt-2">
                        Manage costs for all Highfield models. Select a currency to enter values, which are then saved as AUD.
                    </CardDescription>
                </div>
                 <div className="flex items-center gap-4">
                    <span className="text-sm font-medium text-muted-foreground">Input Currency</span>
                    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                        <PopoverTrigger asChild>
                            <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={popoverOpen}
                            className="w-[100px] justify-between"
                            >
                            {globalCurrency}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[120px] p-0">
                            <Command>
                            <CommandInput placeholder="Search currency..." />
                             <CommandList>
                                <CommandEmpty>No currency found.</CommandEmpty>
                                <CommandGroup>
                                    {currencies.map((currency) => (
                                    <CommandItem
                                        key={currency.value}
                                        value={currency.value}
                                        onSelect={(currentValue) => {
                                            setGlobalCurrency(currentValue.toUpperCase());
                                            setPopoverOpen(false);
                                        }}
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-4 w-4",
                                                globalCurrency === currency.value ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                        {currency.label}
                                    </CommandItem>
                                    ))}
                                </CommandGroup>
                             </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                </div>
            </CardHeader>
            <CardContent>
                <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 p-2 rounded-md flex items-center gap-2 mb-4">
                    <AlertTriangle className="h-4 w-4" />
                    Currency conversion rates are for demonstration purposes and are not live.
                </div>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)}>
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[40%] pl-10">Model</TableHead>
                                        <TableHead>Base Cost</TableHead>
                                        <TableHead>Base Sell</TableHead>
                                        <TableHead>Freight Cost</TableHead>
                                    </TableRow>
                                </TableHeader>
                                {modelFields.map((model, modelIndex) => (
                                    <Collapsible
                                        asChild
                                        key={model.id}
                                        onOpenChange={(isOpen) => setOpenRows(prev => ({...prev, [model.id]: isOpen}))}
                                    >
                                        <tbody className="[&_tr:last-child]:border-0 border-b">
                                            <TableRow>
                                                <TableCell className="font-medium">
                                                    <CollapsibleTrigger asChild disabled={!model.optionalFeatures || model.optionalFeatures.length === 0}>
                                                        <div className={cn("flex items-center gap-2", model.optionalFeatures && model.optionalFeatures.length > 0 ? "cursor-pointer" : "cursor-default")}>
                                                            <ChevronRight className={cn("h-4 w-4 transition-transform", openRows[model.id] && "rotate-90")} />
                                                            {model.name}
                                                        </div>
                                                    </CollapsibleTrigger>
                                                </TableCell>
                                                <TableCell><CurrencyInput control={form.control} name={`models.${modelIndex}.cost`} globalCurrency={globalCurrency} /></TableCell>
                                                <TableCell><CurrencyInput control={form.control} name={`models.${modelIndex}.sellPriceExclGst`} globalCurrency={globalCurrency} /></TableCell>
                                                <TableCell><CurrencyInput control={form.control} name={`models.${modelIndex}.freightCostExclGst`} globalCurrency={globalCurrency} /></TableCell>
                                            </TableRow>
                                            <CollapsibleContent asChild>
                                                <tr>
                                                    <td colSpan={4} className="p-0">
                                                        <div className="bg-muted/50 p-4">
                                                            <h4 className="font-semibold mb-2 ml-8 text-sm">Optional Features</h4>
                                                            <Table>
                                                                <TableBody>
                                                                    {model.optionalFeatures?.map((feature, featureIndex) => (
                                                                        <TableRow key={feature.id} className="border-b-0 hover:bg-muted/75">
                                                                            <TableCell className="w-[40%] pl-8 text-muted-foreground">{feature.name}</TableCell>
                                                                            <TableCell><CurrencyInput control={form.control} name={`models.${modelIndex}.optionalFeatures.${featureIndex}.cost`} globalCurrency={globalCurrency} /></TableCell>
                                                                            <TableCell><CurrencyInput control={form.control} name={`models.${modelIndex}.optionalFeatures.${featureIndex}.sellPriceExclGst`} globalCurrency={globalCurrency} /></TableCell>
                                                                            <TableCell><CurrencyInput control={form.control} name={`models.${modelIndex}.optionalFeatures.${featureIndex}.freightCostExclGst`} globalCurrency={globalCurrency} /></TableCell>
                                                                        </TableRow>
                                                                    ))}
                                                                </TableBody>
                                                            </Table>
                                                        </div>
                                                    </td>
                                                </tr>
                                            </CollapsibleContent>
                                        </tbody>
                                    </Collapsible>
                                ))}
                            </Table>
                        </div>
                        <div className="flex justify-end mt-6">
                            <Button type="submit" disabled={isSaving || !form.formState.isDirty}>
                                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                Save Changes
                            </Button>
                        </div>
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}

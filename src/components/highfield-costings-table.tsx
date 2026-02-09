'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useFirestore } from '@/firebase/provider';
import { collection, doc, writeBatch, getDocs } from 'firebase/firestore';
import { Loader2, Save, ChevronRight, AlertTriangle, ChevronsUpDown, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
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
    rangeId: string;
    rangeName?: string;
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
  rangeId: z.string(),
  rangeName: z.string().optional(),
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
}

function CurrencyInput({ control, name }: CurrencyInputProps) {
    const [popoverOpen, setPopoverOpen] = useState(false);
    const [currency, setCurrency] = useState('AUD');

    return (
        <FormField
            control={control}
            name={name}
            render={({ field }) => {
                const audValue = field.value || 0;
                const displayValue = (audValue / exchangeRates[currency]).toFixed(2);
                const valueInclGst = audValue * (1 + GST_RATE);

                const handleDisplayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                    const newDisplayValue = e.target.value;
                    const newAudValue = parseFloat(newDisplayValue) * exchangeRates[currency];
                    field.onChange(isNaN(newAudValue) ? 0 : newAudValue);
                };
                
                return (
                    <FormItem>
                        <div className="flex items-center">
                            <FormControl>
                                <Input
                                    type="number"
                                    value={displayValue === '0.00' ? '' : displayValue}
                                    onChange={handleDisplayChange}
                                    className="w-24 text-right rounded-r-none"
                                    placeholder="0.00"
                                />
                            </FormControl>
                            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        className="w-[70px] justify-between rounded-l-none border-l-0"
                                    >
                                        {currency}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[120px] p-0">
                                    <Command>
                                        <CommandInput placeholder="Search..." />
                                        <CommandList>
                                            <CommandEmpty>No currency found.</CommandEmpty>
                                            <CommandGroup>
                                                {currencies.map((c) => (
                                                <CommandItem
                                                    key={c.value}
                                                    value={c.value}
                                                    onSelect={(currentValue) => {
                                                        setCurrency(currentValue.toUpperCase());
                                                        setPopoverOpen(false);
                                                    }}
                                                >
                                                    <Check className={cn("mr-2 h-4 w-4", currency === c.value ? "opacity-100" : "opacity-0")} />
                                                    {c.label}
                                                </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        </div>
                         <div className="text-[11px] text-muted-foreground pt-1 space-y-0.5">
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
    const [searchTerm, setSearchTerm] = useState('');
    const [rangeFilter, setRangeFilter] = useState('all');
    const [ranges, setRanges] = useState<Range[]>([]);
    
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
            const fetchedRanges = rangesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Range));
            setRanges(fetchedRanges);
            const rangeMap = new Map(fetchedRanges.map(r => [r.id, r.name]));

            const allModels: Model[] = [];
            await Promise.all(fetchedRanges.map(async (range) => {
                const modelsCollectionRef = collection(firestore, `data-warehouse/${vendorId}/ranges/${range.id}/models`);
                const modelsSnapshot = await getDocs(modelsCollectionRef);
                modelsSnapshot.forEach(doc => {
                    allModels.push({
                        id: doc.id,
                        path: doc.ref.path,
                        rangeName: rangeMap.get(doc.data().rangeId),
                         ...doc.data()
                    } as Model);
                });
            }));
            
            allModels.sort((a,b) => a.name.localeCompare(b.name));

            form.reset({
                models: allModels.map(m => ({
                    id: m.id,
                    path: m.path,
                    name: m.name,
                    rangeId: m.rangeId,
                    rangeName: m.rangeName,
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

    const filteredModelIndices = useMemo(() => {
        return form.getValues('models').map((model, index) => ({ model, index }))
            .filter(({ model }) => {
                const searchMatch = searchTerm ? model.name.toLowerCase().includes(searchTerm.toLowerCase()) : true;
                const rangeMatch = rangeFilter === 'all' ? true : model.rangeId === rangeFilter;
                return searchMatch && rangeMatch;
            })
            .map(({ index }) => index);
    }, [searchTerm, rangeFilter, form.getValues('models')]);


    const onSubmit = async (data: FormValues) => {
        setIsSaving(true);
        const batch = writeBatch(firestore);
        const { dirtyFields } = form.formState;

        data.models.forEach((model, modelIndex) => {
             if (dirtyFields.models?.[modelIndex]) {
                const modelRef = doc(firestore, model.path);
                const { id, path, rangeName, ...restOfModel } = model;
                const modelUpdate: Partial<Omit<Model, 'id' | 'path' | 'rangeName'>> = {};

                if (dirtyFields.models[modelIndex]?.cost) modelUpdate.cost = restOfModel.cost;
                if (dirtyFields.models[modelIndex]?.sellPriceExclGst) modelUpdate.sellPriceExclGst = restOfModel.sellPriceExclGst;
                if (dirtyFields.models[modelIndex]?.freightCostExclGst) modelUpdate.freightCostExclGst = restOfModel.freightCostExclGst;
                
                if (dirtyFields.models[modelIndex]?.optionalFeatures) {
                    modelUpdate.optionalFeatures = restOfModel.optionalFeatures?.map(of => {
                        const { path, ...restOfFeature } = of;
                        return restOfFeature;
                    });
                }
                
                if (Object.keys(modelUpdate).length > 0) {
                     batch.update(modelRef, modelUpdate);
                }
             }
        });

        try {
            await batch.commit();
            toast({ title: 'Success!', description: 'Costings have been updated.' });
            form.reset(data);
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
            <CardHeader>
                <CardTitle>Highfield Model Costings</CardTitle>
                <CardDescription className="pt-2">
                    Manage costs for all Highfield models. Enter values in your chosen currency; they will be saved in AUD.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 p-3 rounded-lg flex items-center gap-2.5 mb-4">
                    <AlertTriangle className="h-5 w-5" />
                    <div>
                        <span className="font-semibold">Disclaimer:</span> Currency conversion rates are for demonstration purposes only and are not live. All data is ultimately saved in AUD.
                    </div>
                </div>

                 <div className="flex items-center gap-2 mb-4">
                    <div className="relative flex-grow">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by model name..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                    <Select value={rangeFilter} onValueChange={setRangeFilter}>
                        <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Filter by range" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Ranges</SelectItem>
                            {ranges.map(range => (
                                <SelectItem key={range.id} value={range.id}>{range.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)}>
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[30%] pl-10">Model</TableHead>
                                        <TableHead className="w-[15%]">Range</TableHead>
                                        <TableHead>Base Cost</TableHead>
                                        <TableHead>Base Sell</TableHead>
                                        <TableHead>Freight Cost</TableHead>
                                    </TableRow>
                                </TableHeader>
                                {filteredModelIndices.map((modelIndex) => {
                                    const model = form.getValues(`models.${modelIndex}`);
                                    return (
                                        <Collapsible
                                            asChild
                                            key={model.id}
                                            onOpenChange={(isOpen) => setOpenRows(prev => ({...prev, [model.id]: isOpen}))}
                                        >
                                            <tbody className="[&_tr:last-child]:border-0 border-b">
                                                <TableRow className="text-xs">
                                                    <TableCell className="font-medium py-2">
                                                        <CollapsibleTrigger asChild disabled={!model.optionalFeatures || model.optionalFeatures.length === 0}>
                                                            <div className={cn("flex items-center gap-2 h-full", model.optionalFeatures && model.optionalFeatures.length > 0 ? "cursor-pointer" : "cursor-default")}>
                                                                <ChevronRight className={cn("h-4 w-4 transition-transform", openRows[model.id] && "rotate-90")} />
                                                                {model.name}
                                                            </div>
                                                        </CollapsibleTrigger>
                                                    </TableCell>
                                                    <TableCell className="py-2 text-muted-foreground">{model.rangeName}</TableCell>
                                                    <TableCell className="py-2"><CurrencyInput control={form.control} name={`models.${modelIndex}.cost`} /></TableCell>
                                                    <TableCell className="py-2"><CurrencyInput control={form.control} name={`models.${modelIndex}.sellPriceExclGst`} /></TableCell>
                                                    <TableCell className="py-2"><CurrencyInput control={form.control} name={`models.${modelIndex}.freightCostExclGst`} /></TableCell>
                                                </TableRow>
                                                <CollapsibleContent asChild>
                                                    <tr className="text-xs">
                                                        <td colSpan={5} className="p-0">
                                                            <div className="bg-muted/30 px-4 py-2">
                                                                <h4 className="font-semibold my-2 ml-8 text-xs text-muted-foreground">OPTIONAL FEATURES</h4>
                                                                <Table>
                                                                    <TableBody>
                                                                        {model.optionalFeatures?.map((feature, featureIndex) => (
                                                                            <TableRow key={feature.id} className="border-b-0 hover:bg-muted/50">
                                                                                <TableCell className="w-[30%] pl-8 py-2 text-muted-foreground">{feature.name}</TableCell>
                                                                                <TableCell className="w-[15%] py-2"></TableCell>
                                                                                <TableCell className="py-2"><CurrencyInput control={form.control} name={`models.${modelIndex}.optionalFeatures.${featureIndex}.cost`} /></TableCell>
                                                                                <TableCell className="py-2"><CurrencyInput control={form.control} name={`models.${modelIndex}.optionalFeatures.${featureIndex}.sellPriceExclGst`} /></TableCell>
                                                                                <TableCell className="py-2"><CurrencyInput control={form.control} name={`models.${modelIndex}.optionalFeatures.${featureIndex}.freightCostExclGst`} /></TableCell>
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
                                    )
                                })}
                            </Table>
                            {filteredModelIndices.length === 0 && (
                                <div className="text-center p-8 text-sm text-muted-foreground">
                                    No models match your current search/filter criteria.
                                </div>
                            )}
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
    
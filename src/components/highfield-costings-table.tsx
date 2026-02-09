'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm, useFieldArray, useWatch, type Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useFirestore } from '@/firebase/provider';
import { collection, doc, writeBatch, getDocs, query as firestoreQuery, WriteBatch } from 'firebase/firestore';
import { Loader2, Save, ChevronRight, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

// --- Constants & Types ---
const GST_RATE = 0.10;
const exchangeRates: Record<string, number> = {
  AUD: 1,
  USD: 1.52,
  EUR: 1.65,
  GBP: 1.95,
  CNY: 0.21,
};
const currencies = Object.keys(exchangeRates);

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
    control: Control<FormValues>;
    name: `models.${number}.${'cost' | 'sellPriceExclGst' | 'freightCostExclGst'}` | `models.${number}.optionalFeatures.${number}.${'cost' | 'sellPriceExclGst' | 'freightCostExclGst'}`;
    label: string;
}

function CurrencyInput({ control, name, label }: CurrencyInputProps) {
    const audValue = useWatch({ control, name });
    const [displayAmount, setDisplayAmount] = useState<string | number>('');
    const [selectedCurrency, setSelectedCurrency] = useState('AUD');

    useEffect(() => {
        if (audValue !== undefined) {
            const convertedValue = audValue / exchangeRates[selectedCurrency];
            setDisplayAmount(convertedValue.toFixed(2));
        } else {
            setDisplayAmount('');
        }
    }, [audValue, selectedCurrency]);

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newDisplayAmount = e.target.value;
        setDisplayAmount(newDisplayAmount);
        const newAudValue = parseFloat(newDisplayAmount) * exchangeRates[selectedCurrency];
        // @ts-ignore
        control.setValue(name, isNaN(newAudValue) ? 0 : newAudValue, { shouldDirty: true });
    };

    const handleCurrencyChange = (newCurrency: string) => {
        setSelectedCurrency(newCurrency);
        if (audValue !== undefined) {
          const convertedValue = audValue / exchangeRates[newCurrency];
          setDisplayAmount(convertedValue.toFixed(2));
        }
    };
    
    const valueInclGst = (audValue || 0) * (1 + GST_RATE);

    return (
        <div className="space-y-1">
            <FormLabel>{label}</FormLabel>
            <div className="flex items-center gap-1">
                <Input
                    type="number"
                    value={displayAmount}
                    onChange={handleAmountChange}
                    className="w-24"
                    placeholder="0.00"
                />
                <Select value={selectedCurrency} onValueChange={handleCurrencyChange}>
                    <SelectTrigger className="w-[70px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {currencies.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
            <div className="text-xs text-muted-foreground pt-1">
                <p>ex. GST: {audValue?.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' }) || '$0.00'}</p>
                <p>inc. GST: {valueInclGst.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })}</p>
            </div>
        </div>
    );
}

// --- Main Table Component ---
export function HighfieldCostingsTable({ vendorId }: { vendorId: string }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [openRows, setOpenRows] = useState<Record<string, boolean>>({});

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
                        // Make sure to spread other properties if they exist on the original object
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
            <CardHeader>
                <CardTitle>Highfield Model Costings</CardTitle>
                <CardDescription>
                    Manage costs for all Highfield models below. Prices can be entered in different currencies and are saved as AUD.
                    <span className="block mt-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 p-2 rounded-md flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        Currency conversion rates are for demonstration purposes and are not live.
                    </span>
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)}>
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[300px]">Model</TableHead>
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
                                        <TableBody className="[&_tr:last-child]:border-0">
                                            <TableRow>
                                                <TableCell className="font-medium">
                                                    <CollapsibleTrigger asChild disabled={!model.optionalFeatures || model.optionalFeatures.length === 0}>
                                                        <div className={cn("flex items-center gap-2", model.optionalFeatures && model.optionalFeatures.length > 0 ? "cursor-pointer" : "cursor-default")}>
                                                            <ChevronRight className={cn("h-4 w-4 transition-transform", openRows[model.id] && "rotate-90")} />
                                                            {model.name}
                                                        </div>
                                                    </CollapsibleTrigger>
                                                </TableCell>
                                                <TableCell><CurrencyInput control={form.control} name={`models.${modelIndex}.cost`} label="Base Cost" /></TableCell>
                                                <TableCell><CurrencyInput control={form.control} name={`models.${modelIndex}.sellPriceExclGst`} label="Base Sell" /></TableCell>
                                                <TableCell><CurrencyInput control={form.control} name={`models.${modelIndex}.freightCostExclGst`} label="Freight Cost" /></TableCell>
                                            </TableRow>
                                            <CollapsibleContent asChild>
                                                <tr>
                                                    <td colSpan={4} className="p-0">
                                                        <div className="bg-muted/50 p-4">
                                                            <h4 className="font-semibold mb-2 ml-8 text-sm">Optional Features</h4>
                                                            <Table>
                                                                <TableBody>
                                                                    {model.optionalFeatures?.map((feature, featureIndex) => (
                                                                        <TableRow key={feature.id} className="border-b-0">
                                                                            <TableCell className="w-[300px] pl-8 text-muted-foreground">{feature.name}</TableCell>
                                                                            <TableCell><CurrencyInput control={form.control} name={`models.${modelIndex}.optionalFeatures.${featureIndex}.cost`} label="Cost" /></TableCell>
                                                                            <TableCell><CurrencyInput control={form.control} name={`models.${modelIndex}.optionalFeatures.${featureIndex}.sellPriceExclGst`} label="Sell" /></TableCell>
                                                                            <TableCell><CurrencyInput control={form.control} name={`models.${modelIndex}.optionalFeatures.${featureIndex}.freightCostExclGst`} label="Freight" /></TableCell>
                                                                        </TableRow>
                                                                    ))}
                                                                </TableBody>
                                                            </Table>
                                                        </div>
                                                    </td>
                                                </tr>
                                            </CollapsibleContent>
                                        </TableBody>
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

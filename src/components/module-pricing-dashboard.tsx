'use client';

import { useState, useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc, updateDoc } from 'firebase/firestore';
import { 
    Table, 
    TableBody, 
    TableCell, 
    TableHead, 
    TableHeader, 
    TableRow 
} from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { 
    Loader2, 
    TrendingUp, 
    DollarSign, 
    ArrowRightLeft, 
    Search, 
    Save,
    ChevronRight,
    Calculator,
    Percent
} from 'lucide-react';
import { formatCurrency, convertCurrency, getExchangeRate } from '@/lib/currency-utils';
import { useToast } from '@/hooks/use-toast';
import { Badge } from './ui/badge';
import { cn } from '@/lib/utils';

interface Range {
    id: string;
    name: string;
}

interface Model {
    id: string;
    name: string;
    modelCode?: string;
    rangeId: string;
    cost?: number;
    sellPriceExclGst?: number;
}

interface Organisation {
    id: string;
    tradingCurrency?: string;
    gstPercentage?: number;
    brandMargins?: Record<string, number>;
    rangeMargins?: Record<string, number>;
    modelMargins?: Record<string, number>;
}

export function ModulePricingDashboard({ 
    module, 
    organisation, 
    vendor 
}: { 
    module: any; 
    organisation: Organisation; 
    vendor: any 
}) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [searchTerm, setSearchTerm] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    
    // Local state for margins to allow editing before save
    const [localMargins, setLocalMargins] = useState<Record<string, number>>({});

    const rangesQuery = useMemoFirebase(() => 
        query(collection(firestore, `data-warehouse/${vendor.id}/ranges`), orderBy('order')), 
    [firestore, vendor.id]);
    
    const { data: ranges, loading: rangesLoading } = useCollection<Range>(rangesQuery);

    // Flat list of all models for the dashboard
    const [allModels, setAllModels] = useState<Model[]>([]);
    const [modelsLoading, setModelsLoading] = useState(true);

    useMemo(async () => {
        if (!ranges || ranges.length === 0) return;
        setModelsLoading(true);
        const models: Model[] = [];
        try {
            for (const range of ranges) {
                const q = query(collection(firestore, `data-warehouse/${vendor.id}/ranges/${range.id}/models`), orderBy('order'));
                const snap = await (firestore as any).getDocs(q); // Helper bypass for bulk fetch in effect
                snap.forEach((doc: any) => {
                    models.push({ id: doc.id, ...doc.data() } as Model);
                });
            }
            setAllModels(models);
        } catch (e) {
            console.error("Failed to fetch models for dashboard", e);
        } finally {
            setModelsLoading(false);
        }
    }, [ranges, vendor.id, firestore]);

    const sourceCurrency = vendor.currency || 'AUD';
    const tradingCurrency = organisation.tradingCurrency || 'AUD';
    const exchangeRate = getExchangeRate(sourceCurrency, tradingCurrency);
    const gstRate = (organisation.gstPercentage ?? 10) / 100;

    const filteredModels = useMemo(() => {
        if (!searchTerm) return allModels;
        const lower = searchTerm.toLowerCase();
        return allModels.filter(m => 
            m.name.toLowerCase().includes(lower) || 
            m.modelCode?.toLowerCase().includes(lower)
        );
    }, [allModels, searchTerm]);

    const handleMarginChange = (id: string, value: string) => {
        const num = parseFloat(value);
        setLocalMargins(prev => ({
            ...prev,
            [id]: isNaN(num) ? 0 : num
        }));
    };

    const getActiveMargin = (model: Model) => {
        // Hierarchy: Local Model > Local Range > Global Brand
        const modelMargin = localMargins[model.id] ?? organisation.modelMargins?.[model.id];
        if (modelMargin !== undefined) return { value: modelMargin, source: 'model' };

        const rangeMargin = localMargins[model.rangeId] ?? organisation.rangeMargins?.[model.rangeId];
        if (rangeMargin !== undefined) return { value: rangeMargin, source: 'range' };

        return { value: organisation.brandMargins?.[vendor.id] ?? 0, source: 'brand' };
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const orgRef = doc(firestore, 'organisations', organisation.id);
            
            // Separate range and model margins
            const newRangeMargins = { ...(organisation.rangeMargins || {}) };
            const newModelMargins = { ...(organisation.modelMargins || {}) };

            Object.entries(localMargins).forEach(([id, margin]) => {
                if (ranges?.some(r => r.id === id)) {
                    newRangeMargins[id] = margin;
                } else {
                    newModelMargins[id] = margin;
                }
            });

            await updateDoc(orgRef, {
                rangeMargins: newRangeMargins,
                modelMargins: newModelMargins
            });

            toast({ title: "Pricing Updated", description: "Margins have been saved successfully." });
            setLocalMargins({});
        } catch (e) {
            toast({ variant: 'destructive', title: "Save Failed" });
        } finally {
            setIsSaving(false);
        }
    };

    const loading = rangesLoading || modelsLoading;

    if (loading) {
        return (
            <div className="flex h-96 w-full items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="relative w-full md:w-80">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Filter models..." 
                            className="pl-9 h-10"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Badge variant="secondary" className="h-10 px-4 flex items-center gap-2">
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                        <span>1 {sourceCurrency} = {exchangeRate.toFixed(4)} {tradingCurrency}</span>
                    </Badge>
                </div>
                <Button onClick={handleSave} disabled={isSaving || Object.keys(localMargins).length === 0} className="h-10 px-6">
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save Changes
                </Button>
            </div>

            <Card className="border-none shadow-xl overflow-hidden bg-card/50 backdrop-blur-sm">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-muted/50">
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="w-[300px] py-4">Model & Code</TableHead>
                                <TableHead className="text-right">Master Cost ({sourceCurrency})</TableHead>
                                <TableHead className="text-center w-12">
                                    <div className="flex justify-center"><ArrowRightLeft className="h-4 w-4 text-muted-foreground" /></div>
                                </TableHead>
                                <TableHead className="text-right">Local Cost ({tradingCurrency})</TableHead>
                                <TableHead className="w-[140px] text-center">
                                    <div className="flex items-center justify-center gap-1.5">
                                        <Percent className="h-3.5 w-3.5" />
                                        <span>Margin</span>
                                    </div>
                                </TableHead>
                                <TableHead className="text-right font-bold text-primary">Retail Sell (Excl.)</TableHead>
                                <TableHead className="text-right font-black bg-primary/5">Retail Sell (Incl.)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {ranges?.map(range => {
                                const rangeModels = filteredModels.filter(m => m.rangeId === range.id);
                                if (rangeModels.length === 0 && searchTerm) return null;

                                const rangeMargin = localMargins[range.id] ?? organisation.rangeMargins?.[range.id] ?? 0;

                                return (
                                    <React.Fragment key={range.id}>
                                        <TableRow className="bg-muted/30 hover:bg-muted/40 transition-colors border-y-2 border-border/50">
                                            <TableCell colSpan={4} className="py-3">
                                                <div className="flex items-center gap-2">
                                                    <ChevronRight className="h-4 w-4 text-primary" />
                                                    <span className="font-black uppercase tracking-widest text-[11px] text-muted-foreground">{range.name} RANGE</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="p-2">
                                                <div className="relative max-w-[100px] mx-auto group">
                                                    <Input 
                                                        type="number"
                                                        value={rangeMargin}
                                                        onChange={(e) => handleMarginChange(range.id, e.target.value)}
                                                        className={cn(
                                                            "h-8 text-center font-bold text-xs pr-6 transition-all",
                                                            localMargins[range.id] !== undefined ? "border-primary ring-1 ring-primary/20 bg-primary/5" : "bg-background"
                                                        )}
                                                    />
                                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-muted-foreground">%</span>
                                                </div>
                                            </TableCell>
                                            <TableCell colSpan={2} className="text-right py-3 pr-6 italic text-[10px] text-muted-foreground uppercase font-bold tracking-tighter">
                                                Apply to all {range.name} models
                                            </TableCell>
                                        </TableRow>
                                        {rangeModels.map(model => {
                                            const cost = model.cost ?? 0;
                                            const localCost = convertCurrency(cost, sourceCurrency, tradingCurrency);
                                            const activeMargin = getActiveMargin(model);
                                            
                                            // Calculate Sell Price: cost / (1 - margin)
                                            // E.g. $100 cost with 20% margin ($100 / 0.8) = $125 sell
                                            const marginFactor = 1 - (activeMargin.value / 100);
                                            const sellExcl = marginFactor > 0 ? localCost / marginFactor : localCost;
                                            const sellIncl = sellExcl * (1 + gstRate);

                                            return (
                                                <TableRow key={model.id} className="hover:bg-muted/20 transition-colors group">
                                                    <TableCell className="py-4">
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-sm">{model.name}</span>
                                                            <span className="text-[10px] font-mono text-muted-foreground uppercase">{model.modelCode || 'NO CODE'}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right font-medium">
                                                        {formatCurrency(cost, sourceCurrency)}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <div className="h-1 w-4 bg-muted mx-auto rounded-full group-hover:bg-primary/20 transition-colors" />
                                                    </TableCell>
                                                    <TableCell className="text-right font-bold text-muted-foreground/80">
                                                        {formatCurrency(localCost, tradingCurrency)}
                                                    </TableCell>
                                                    <TableCell className="p-2">
                                                        <div className="relative max-w-[100px] mx-auto">
                                                            <Input 
                                                                type="number"
                                                                value={localMargins[model.id] ?? activeMargin.value}
                                                                onChange={(e) => handleMarginChange(model.id, e.target.value)}
                                                                className={cn(
                                                                    "h-8 text-center font-bold text-xs pr-6 transition-all",
                                                                    localMargins[model.id] !== undefined ? "border-primary ring-1 ring-primary/20 bg-primary/5" : "bg-transparent border-transparent hover:border-muted-foreground/20"
                                                                )}
                                                            />
                                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-muted-foreground">%</span>
                                                            {localMargins[model.id] === undefined && activeMargin.source !== 'model' && (
                                                                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 translate-y-full px-1.5 py-0.5 rounded bg-muted text-[8px] font-black uppercase text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                                                                    Inherited ({activeMargin.source})
                                                                </div>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right font-black text-primary text-sm">
                                                        {formatCurrency(sellExcl, tradingCurrency)}
                                                    </TableCell>
                                                    <TableCell className="text-right font-black text-foreground bg-primary/5 text-sm pr-6 border-l-2 border-primary/10">
                                                        {formatCurrency(sellIncl, tradingCurrency)}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </React.Fragment>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            </Card>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-primary/5 border-primary/10">
                    <CardHeader className="py-4">
                        <CardTitle className="text-sm font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                            <Calculator className="h-4 w-4" />
                            Margin Logic
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-[11px] text-muted-foreground leading-relaxed">
                        Retail Sell Prices are calculated using the <strong>Cost / (1 - Margin)</strong> formula to ensure your target profit percentage is preserved relative to the final sale price.
                    </CardContent>
                </Card>
                <Card className="bg-muted/30 border-muted-foreground/10">
                    <CardHeader className="py-4">
                        <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                            <TrendingUp className="h-4 w-4" />
                            Inheritance
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-[11px] text-muted-foreground leading-relaxed">
                        Models inherit their margin from the <strong>Range</strong> setting if defined, otherwise from the global <strong>Brand</strong> setting. Specific model overrides take top priority.
                    </CardContent>
                </Card>
                <Card className="bg-muted/30 border-muted-foreground/10">
                    <CardHeader className="py-4">
                        <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                            <Percent className="h-4 w-4" />
                            Tax Inclusion
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-[11px] text-muted-foreground leading-relaxed">
                        The final column shows the retail price inclusive of your organisation's <strong>{organisation.gstPercentage ?? 10}% GST</strong> setting.
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

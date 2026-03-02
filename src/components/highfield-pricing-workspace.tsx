'use client';

import { useState, useMemo, useEffect } from 'react';
import { useCollection, useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc, getDocs, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
    Table, 
    TableBody, 
    TableCell, 
    TableHead, 
    TableHeader, 
    TableRow 
} from '@/components/ui/table';
import { 
    Loader2, 
    Plus, 
    Trash2, 
    ChevronDown, 
    ChevronRight, 
    Ship, 
    Package, 
    Wrench, 
    DollarSign, 
    Percent, 
    Type, 
    Coins,
    Building,
    Search,
    Filter,
    Settings2,
    X,
    Maximize2,
    Minimize2,
    ChevronLeft,
    ArrowRightLeft,
    ShieldCheck
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { SUPPORTED_CURRENCIES, formatCurrency } from '@/lib/currency-utils';
import { ScrollArea } from './ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import NextImage from "next/image";
import { Separator } from './ui/separator';

interface CustomColumn {
    id: string;
    name: string;
    type: 'percent' | 'text' | 'currency' | 'cost';
}

interface PricingStrategy {
    baseCurrency?: string;
    columns?: CustomColumn[];
    itemValues?: Record<string, Record<string, any>>;
}

interface Range {
    id: string;
    name: string;
}

interface Model {
    id: string;
    name: string;
    modelCode?: string;
    rangeId: string;
    optionalFeatures?: any[];
}

interface Variant {
    id: string;
    sku: string | null;
    name: string;
    cost?: number;
    sellPriceExclGst?: number;
    material?: string;
}

export function HighfieldPricingWorkspace({ vendor, organisationId }: { vendor: any, organisationId: string }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    
    // 1. Core Data Fetching
    const rangesQuery = useMemoFirebase(() => query(collection(firestore, `data-warehouse/${vendor.id}/ranges`), orderBy('order')), [firestore, vendor.id]);
    const { data: ranges, loading: rangesLoading } = useCollection<Range>(rangesQuery);

    // Organisation & Exchange Rates for visual reference
    const orgRef = useMemoFirebase(() => doc(firestore, 'organisations', organisationId), [firestore, organisationId]);
    const { data: organisation } = useDoc<any>(orgRef);

    const ratesQuery = useMemoFirebase(() => collection(firestore, `organisations/${organisationId}/exchangeRates`), [firestore, organisationId]);
    const { data: exchangeRates } = useCollection<any>(ratesQuery);

    const [allModels, setAllModels] = useState<Model[]>([]);
    const [allVariants, setAllVariants] = useState<Record<string, Variant[]>>({});
    const [loadingModels, setLoadingModels] = useState(false);

    // 2. Pricing Strategy State
    const strategyRef = useMemoFirebase(() => doc(firestore, `organisations/${organisationId}/pricingStrategies/${vendor.id}`), [firestore, organisationId, vendor.id]);
    const { data: strategy, loading: strategyLoading } = useDoc<PricingStrategy>(strategyRef);

    const [isAddColumnOpen, setIsAddColumnOpen] = useState(false);
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [newColName, setNewColName] = useState('');
    const [newColType, setNewColType] = useState<CustomColumn['type']>('text');
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedRanges, setExpandedRanges] = useState<string[]>([]);

    useEffect(() => {
        const fetchDeepData = async () => {
            if (!ranges || ranges.length === 0) return;
            setLoadingModels(true);
            try {
                const models: Model[] = [];
                const variantMap: Record<string, Variant[]> = {};

                for (const range of ranges) {
                    const mSnap = await getDocs(query(collection(firestore, `data-warehouse/${vendor.id}/ranges/${range.id}/models`), orderBy('order')));
                    for (const mDoc of mSnap.docs) {
                        const mData = { id: mDoc.id, ...mDoc.data() } as Model;
                        models.push(mData);
                        
                        const vSnap = await getDocs(query(collection(firestore, `data-warehouse/${vendor.id}/ranges/${range.id}/models/${mDoc.id}/variants`), orderBy('order')));
                        variantMap[mDoc.id] = vSnap.docs.map(d => ({ id: d.id, ...d.data() } as Variant));
                    }
                }
                setAllModels(models);
                setAllVariants(variantMap);
            } catch (e) {
                console.error("Failed to load Highfield structure", e);
            } finally {
                setLoadingModels(false);
            }
        };
        fetchDeepData();
    }, [ranges, vendor.id, firestore]);

    // Financial calculations
    const activeExchangeRate = useMemo(() => {
        if (!exchangeRates || !vendor.currency) return 1;
        const rate = exchangeRates.find((r: any) => r.code === vendor.currency);
        return rate?.rate || 1;
    }, [exchangeRates, vendor.currency]);

    const handleAddColumn = async () => {
        if (!newColName.trim()) return;
        const newCol: CustomColumn = {
            id: `col-${Date.now()}`,
            name: newColName,
            type: newColType
        };
        const currentCols = strategy?.columns || [];
        await setDoc(strategyRef, { columns: [...currentCols, newCol] }, { merge: true });
        setIsAddColumnOpen(false);
        setNewColName('');
        toast({ title: "Column Added", description: `"${newCol.name}" is now available in your workspace.` });
    };

    const handleDeleteColumn = async (colId: string) => {
        const currentCols = strategy?.columns || [];
        await setDoc(strategyRef, { columns: currentCols.filter(c => c.id !== colId) }, { merge: true });
        toast({ title: "Column Removed" });
    };

    const handleMoveColumn = async (colId: string, direction: 'left' | 'right') => {
        const currentCols = [...(strategy?.columns || [])];
        const index = currentCols.findIndex(c => c.id === colId);
        if (index === -1) return;

        const newIndex = direction === 'left' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= currentCols.length) return;

        const temp = currentCols[index];
        currentCols[index] = currentCols[newIndex];
        currentCols[newIndex] = temp;

        await setDoc(strategyRef, { columns: currentCols }, { merge: true });
        toast({ title: "Column Order Updated" });
    };

    const handleUpdateValue = async (itemId: string, colId: string, value: any) => {
        const currentValues = strategy?.itemValues || {};
        const updated = {
            ...currentValues,
            [itemId]: {
                ...(currentValues[itemId] || {}),
                [colId]: value
            }
        };
        updateDoc(strategyRef, { itemValues: updated });
    };

    const handleCurrencyChange = (val: string) => {
        updateDoc(strategyRef, { baseCurrency: val });
    };

    const handleVendorCurrencyChange = async (val: string) => {
        try {
            await updateDoc(doc(firestore, 'data-warehouse', vendor.id), { currency: val });
            toast({ title: "Vendor Currency Updated", description: `${vendor.name} cost basis is now ${val}.` });
        } catch (e) {
            toast({ variant: 'destructive', title: "Update Failed" });
        }
    };

    const toggleRange = (id: string) => {
        setExpandedRanges(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const filteredRanges = useMemo(() => {
        if (!ranges) return [];
        if (!searchTerm) return ranges;
        const lower = searchTerm.toLowerCase();
        return ranges.filter(r => {
            const modelsInRange = allModels.filter(m => m.rangeId === r.id);
            return r.name.toLowerCase().includes(lower) || 
                   modelsInRange.some(m => m.name.toLowerCase().includes(lower) || m.modelCode?.toLowerCase().includes(lower));
        });
    }, [ranges, searchTerm, allModels]);

    const isLoading = rangesLoading || strategyLoading || loadingModels;

    if (isLoading) {
        return <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
    }

    const columns = strategy?.columns || [];

    const PricingTable = () => (
        <div className="min-w-[1400px]">
            <Table>
                <TableHeader className="bg-muted/50 sticky top-0 z-20">
                    <TableRow className="hover:bg-transparent border-b-2">
                        <TableHead className="w-[350px] py-4 px-6 border-r bg-muted/20">Item Description & SKU</TableHead>
                        <TableHead className="w-[80px] text-center border-r">ISO</TableHead>
                        <TableHead className="w-[120px] text-center border-r bg-primary/5">Exchange Rate</TableHead>
                        <TableHead className="w-[120px] text-right border-r">Base Cost</TableHead>
                        <TableHead className="w-[120px] text-right border-r">Master Sell</TableHead>
                        {columns.map((col, idx) => (
                            <TableHead key={col.id} className="min-w-[180px] bg-primary/5 text-center px-2 group/header border-r last:border-r-0">
                                <div className="flex items-center justify-between gap-1">
                                    <div className="flex items-center">
                                        <Button 
                                            type="button"
                                            variant="ghost" 
                                            size="icon" 
                                            className={cn("h-6 w-6 opacity-0 group-hover/header:opacity-100 transition-opacity", idx === 0 && "invisible")} 
                                            onClick={() => handleMoveColumn(col.id, 'left')}
                                        >
                                            <ChevronLeft className="h-3 w-3" />
                                        </Button>
                                    </div>
                                    <div className="flex flex-col items-center flex-1 min-w-0">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-primary truncate w-full text-center">{col.name}</span>
                                        <Badge variant="outline" className="h-4 text-[8px] opacity-40 font-black uppercase p-0 border-none">{col.type}</Badge>
                                    </div>
                                    <div className="flex items-center gap-0.5">
                                        <Button 
                                            type="button"
                                            variant="ghost" 
                                            size="icon" 
                                            className={cn("h-6 w-6 opacity-0 group-hover/header:opacity-100 transition-opacity", idx === columns.length - 1 && "invisible")} 
                                            onClick={() => handleMoveColumn(col.id, 'right')}
                                        >
                                            <ChevronRight className="h-3 w-3" />
                                        </Button>
                                        <Button 
                                            type="button" 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-6 w-6 text-destructive opacity-0 group-hover/header:opacity-100 transition-opacity"
                                            onClick={() => handleDeleteColumn(col.id)}
                                        >
                                            <X className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </div>
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filteredRanges.map(range => (
                        <RangeSection 
                            key={range.id} 
                            range={range} 
                            models={allModels.filter(m => m.rangeId === range.id)} 
                            variants={allVariants} 
                            isExpanded={expandedRanges.includes(range.id)}
                            onToggle={() => toggleRange(range.id)}
                            columns={columns}
                            strategy={strategy}
                            onUpdateValue={handleUpdateValue}
                            vendor={vendor}
                            exchangeRate={activeExchangeRate}
                        />
                    ))}
                </TableBody>
            </Table>
        </div>
    );

    const StrategyControls = () => (
        <div className="flex items-end gap-3">
            <div className="space-y-1.5">
                <Label className="text-[9px] font-black uppercase text-muted-foreground ml-1">Strategy Base</Label>
                <Select value={strategy?.baseCurrency || 'AUD'} onValueChange={handleCurrencyChange}>
                    <SelectTrigger className="w-[140px] h-9 font-black uppercase text-xs bg-muted/30">
                        <Coins className="h-3.5 w-3.5 mr-2 text-primary" />
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {SUPPORTED_CURRENCIES.map(c => <SelectItem key={c.code} value={c.code} className="font-bold">{c.code}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
            <Button onClick={() => setIsAddColumnOpen(true)} className="h-9 font-black uppercase tracking-widest text-[10px] shadow-lg rounded-xl">
                <Plus className="h-4 w-4 mr-1.5" /> Add Metric
            </Button>
        </div>
    );

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header Toolbar */}
            <CardHeader className="p-6 border-b bg-background shrink-0">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div className="h-12 w-12 relative bg-white rounded-xl border-2 p-2 shadow-sm shrink-0">
                            {vendor.logoUrl ? (
                                <NextImage src={vendor.logoUrl} alt={vendor.name} fill className="object-contain p-1" unoptimized />
                            ) : (
                                <Building className="h-6 w-6 m-auto mt-1 text-muted-foreground" />
                            )}
                        </div>
                        <div className="space-y-1">
                            <div className="flex items-center gap-3">
                                <CardTitle className="text-xl font-black uppercase tracking-tight">{vendor.name} Strategy</CardTitle>
                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/5 border border-primary/10">
                                    <span className="text-[9px] font-black text-primary uppercase tracking-widest">{vendor.currency || 'AUD'}</span>
                                    <ArrowRightLeft className="h-2.5 w-2.5 text-muted-foreground" />
                                    <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">{organisation?.tradingCurrency || 'AUD'}</span>
                                </div>
                            </div>
                            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-primary">Advanced Multi-Tier Pricing Manager</CardDescription>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex flex-col items-end gap-1 px-4 border-r pr-6">
                            <Label className="text-[9px] font-black uppercase text-muted-foreground tracking-tighter">Vendor Master Currency</Label>
                            <Select value={vendor.currency || 'AUD'} onValueChange={handleVendorCurrencyChange}>
                                <SelectTrigger className="h-8 w-32 font-black uppercase text-[10px] bg-muted/20 border-dashed">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {SUPPORTED_CURRENCIES.map(c => <SelectItem key={c.code} value={c.code} className="font-bold text-xs">{c.code} - {c.label.split('(')[0]}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button 
                            type="button"
                            variant="outline"
                            onClick={() => setIsFullScreen(true)}
                            className="h-9 font-black uppercase tracking-widest text-[10px] shadow-sm flex items-center gap-2 border-2 hover:bg-primary hover:text-primary-foreground transition-all"
                        >
                            <Maximize2 className="h-4 w-4" />
                            Expand Focus Mode
                        </Button>
                    </div>
                </div>

                <div className="relative mt-6">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                        placeholder="Quick filter models, series or SKUs..." 
                        className="pl-10 h-10 font-bold border-2 focus-visible:ring-primary/20"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </CardHeader>

            {/* Main Pricing Matrix (Standard View) */}
            <ScrollArea className="flex-1">
                <PricingTable />
            </ScrollArea>

            {/* Focus Mode Dialog */}
            <Dialog open={isFullScreen} onOpenChange={setIsFullScreen}>
                <DialogContent className="max-w-[98vw] w-[98vw] h-[95vh] flex flex-col p-0 overflow-hidden rounded-3xl border-4 shadow-2xl [&>button]:hidden">
                    <div className="flex flex-col h-full bg-background">
                        <div className="p-6 border-b bg-muted/5 shrink-0">
                            <div className="flex items-center justify-between gap-8">
                                <div className="flex items-center gap-4">
                                    <div className="h-10 w-10 relative bg-white rounded-lg border-2 p-1.5 shadow-sm">
                                        {vendor.logoUrl ? <NextImage src={vendor.logoUrl} alt={vendor.name} fill className="object-contain p-1" unoptimized /> : <Building className="h-5 w-5 m-auto text-muted-foreground" />}
                                    </div>
                                    <DialogTitle className="flex flex-col">
                                        <span className="text-lg font-black uppercase tracking-tight leading-none">{vendor.name} FOCUS MODE</span>
                                        <div className="flex items-center gap-2 mt-1.5">
                                            <span className="text-[9px] font-black uppercase tracking-widest text-primary">Strategy Workspace</span>
                                            <Badge variant="outline" className="h-4 text-[8px] font-black border-primary/20 text-primary uppercase">
                                                Rate: {activeExchangeRate.toFixed(4)} ({vendor.currency || 'AUD'} → {organisation?.tradingCurrency || 'AUD'})
                                            </Badge>
                                        </div>
                                    </DialogTitle>
                                </div>

                                <div className="flex items-center gap-3">
                                    <StrategyControls />
                                    <div className="h-8 w-px bg-border mx-2" />
                                    <DialogClose asChild>
                                        <Button variant="ghost" className="h-10 px-4 font-black uppercase tracking-widest text-[10px] rounded-xl hover:bg-accent border-2">
                                            <Minimize2 className="h-4 w-4 mr-2" /> Collapse
                                        </Button>
                                    </DialogClose>
                                </div>
                            </div>

                            <div className="relative mt-6">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input 
                                    placeholder="Filter in focus mode..." 
                                    className="pl-10 h-10 font-bold border-2 bg-background"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-hidden">
                            <ScrollArea className="h-full">
                                <PricingTable />
                            </ScrollArea>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Global Dialogs */}
            <Dialog open={isAddColumnOpen} onOpenChange={setIsAddColumnOpen}>
                <DialogContent className="sm:max-w-md rounded-2xl border-4 shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black uppercase tracking-tight">New Custom Metric</DialogTitle>
                        <DialogDescription className="text-xs font-bold uppercase text-muted-foreground/60 tracking-widest">Define a new column to calculate or store organisation-specific values.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-6 py-6">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">1. Column Display Name</Label>
                            <Input 
                                placeholder="e.g. Local Freight %" 
                                className="font-bold h-12 border-2 bg-muted/5"
                                value={newColName}
                                onChange={(e) => setNewColName(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">2. Value Schema</Label>
                            <Select value={newColType} onValueChange={(v: any) => setNewColType(v)}>
                                <SelectTrigger className="h-12 font-bold border-2 bg-muted/5">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="percent" className="font-bold"><div className="flex items-center gap-2"><Percent className="h-3.5 w-3.5" /> Percentage (%)</div></SelectItem>
                                    <SelectItem value="currency" className="font-bold"><div className="flex items-center gap-2"><DollarSign className="h-3.5 w-3.5" /> Retail Price</div></SelectItem>
                                    <SelectItem value="cost" className="font-bold"><div className="flex items-center gap-2"><Settings2 className="h-3.5 w-3.5" /> Landing Cost</div></SelectItem>
                                    <SelectItem value="text" className="font-bold"><div className="flex items-center gap-2"><Type className="h-3.5 w-3.5" /> General Text</div></SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setIsAddColumnOpen(false)} className="h-11 px-6 font-bold rounded-xl border-2">Cancel</Button>
                        <Button onClick={handleAddColumn} disabled={!newColName.trim()} className="h-11 px-8 font-black uppercase tracking-widest rounded-xl shadow-lg">
                            Initialize Column
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function RangeSection({ range, models, variants, isExpanded, onToggle, columns, strategy, onUpdateValue, vendor, exchangeRate }: any) {
    return (
        <>
            <TableRow className="bg-muted/30 cursor-pointer group" onClick={onToggle}>
                <TableCell className="py-3 px-6 font-black uppercase tracking-[0.1em] text-xs flex items-center gap-3">
                    {isExpanded ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <span>{range.name} Range</span>
                    <Badge variant="outline" className="h-5 text-[9px] border-primary/20 text-primary uppercase font-black">{models.length} Series</Badge>
                </TableCell>
                <TableCell colSpan={4 + columns.length} className="text-right italic text-[10px] text-muted-foreground pr-6 opacity-40 group-hover:opacity-100 uppercase font-black tracking-widest">Click to expand model series and variants</TableCell>
            </TableRow>
            {isExpanded && models.map((model: any) => (
                <ModelGroup 
                    key={model.id} 
                    model={model} 
                    variants={variants[model.id] || []} 
                    columns={columns}
                    strategy={strategy}
                    onUpdateValue={onUpdateValue}
                    vendor={vendor}
                    exchangeRate={exchangeRate}
                />
            ))}
        </>
    );
}

function ModelGroup({ model, variants, columns, strategy, onUpdateValue, vendor, exchangeRate }: any) {
    const [isLocalExpanded, setIsLocalExpanded] = useState(true);

    return (
        <>
            <TableRow className="bg-muted/5 border-l-4 border-l-primary/40">
                <TableCell className="py-3 px-8 flex items-center justify-between min-w-0">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setIsLocalExpanded(!isLocalExpanded)} className="hover:text-primary transition-colors">
                            {isLocalExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                        <div className="flex flex-col">
                            <span className="font-black text-[11px] uppercase tracking-tight leading-tight">{model.name}</span>
                            <span className="text-[9px] font-mono text-muted-foreground uppercase opacity-60 tracking-widest">{model.modelCode || 'NO CODE'}</span>
                        </div>
                    </div>
                </TableCell>
                <TableCell colSpan={4 + columns.length} className="bg-muted/5" />
            </TableRow>

            {isLocalExpanded && (
                <>
                    {/* SKUs Header */}
                    <TableRow className="bg-white/50 border-l-4 border-l-primary/40">
                        <TableCell className="py-2 px-12 italic text-[10px] font-black uppercase tracking-widest text-primary/60" colSpan={5 + columns.length}>
                            <div className="flex items-center gap-2">
                                <Ship className="h-3.5 w-3.5" />
                                <span>Boat Variant SKUs</span>
                            </div>
                        </TableCell>
                    </TableRow>

                    {/* SKU Rows */}
                    {variants.map((v: any) => (
                        <PricingRow 
                            key={v.id} 
                            id={v.id} 
                            name={v.name} 
                            sku={v.sku} 
                            cost={v.cost} 
                            sell={v.sellPriceExclGst} 
                            vendor={vendor}
                            exchangeRate={exchangeRate}
                            columns={columns}
                            strategy={strategy}
                            onUpdateValue={onUpdateValue}
                            indent
                        />
                    ))}

                    {/* Options Header */}
                    {model.optionalFeatures && model.optionalFeatures.length > 0 && (
                        <>
                            <TableRow className="bg-white/50 border-l-4 border-l-primary/40">
                                <TableCell className="py-2 px-12 italic text-[10px] font-black uppercase tracking-widest text-primary/60" colSpan={5 + columns.length}>
                                    <div className="flex items-center gap-2">
                                        <Wrench className="h-3.5 w-3.5" />
                                        <span>Factory Options</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                            {model.optionalFeatures.map((f: any) => (
                                <PricingRow 
                                    key={f.id} 
                                    id={f.id} 
                                    name={f.name} 
                                    sku={f.code} 
                                    cost={f.cost} 
                                    sell={f.sellPriceExclGst} 
                                    vendor={vendor}
                                    exchangeRate={exchangeRate}
                                    columns={columns}
                                    strategy={strategy}
                                    onUpdateValue={onUpdateValue}
                                    indent
                                    isOption
                                />
                            ))}
                        </>
                    )}
                </>
            )}
        </>
    );
}

function PricingRow({ id, name, sku, cost, sell, columns, strategy, onUpdateValue, indent, isOption, vendor, exchangeRate }: any) {
    const itemStrategyValues = strategy?.itemValues?.[id] || {};

    return (
        <TableRow className="hover:bg-muted/30 group transition-colors">
            <TableCell className={cn("py-2.5 border-r", indent ? "pl-16" : "px-6")}>
                <div className="flex flex-col">
                    <span className="font-bold text-[11px] uppercase tracking-tight">{name}</span>
                    <span className="text-[9px] font-mono text-muted-foreground uppercase">{sku || 'NO SKU'}</span>
                </div>
            </TableCell>
            <TableCell className="text-center border-r">
                <Badge variant="ghost" className="font-black text-[10px] uppercase opacity-60">{vendor.currency || 'AUD'}</Badge>
            </TableCell>
            <TableCell className="text-center border-r bg-primary/5">
                <span className="text-[10px] font-mono font-black text-primary/60">{exchangeRate.toFixed(4)}</span>
            </TableCell>
            <TableCell className="text-right text-[11px] font-medium text-muted-foreground border-r px-4">
                {formatCurrency(cost, vendor.currency || 'AUD')}
            </TableCell>
            <TableCell className="text-right text-[11px] font-black text-muted-foreground border-r px-4">
                {formatCurrency(sell, vendor.currency || 'AUD')}
            </TableCell>
            {columns.map((col: any) => (
                <TableCell key={col.id} className="p-0 border-r last:border-r-0 bg-primary/5 group-hover:bg-primary/10 transition-colors">
                    <EditableCell 
                        value={itemStrategyValues[col.id] || ''} 
                        type={col.type} 
                        onChange={(val) => onUpdateValue(id, col.id, val)}
                    />
                </TableCell>
            ))}
        </TableRow>
    );
}

function EditableCell({ value, type, onChange }: { value: any, type: string, onChange: (val: any) => void }) {
    const [localValue, setLocalValue] = useState(value);

    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    const handleBlur = () => {
        if (localValue !== value) {
            onChange(localValue);
        }
    };

    return (
        <div className="relative h-full w-full">
            <input 
                type={type === 'text' ? 'text' : 'number'}
                className="h-10 w-full bg-transparent border-none text-[11px] font-bold text-center focus:ring-2 focus:ring-primary focus:bg-background transition-all outline-none"
                value={localValue}
                onChange={(e) => setLocalValue(e.target.value)}
                onBlur={handleBlur}
                placeholder="-"
            />
            {type === 'percent' && localValue && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-black text-primary/40">%</span>}
            {type === 'currency' && localValue && <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-black text-primary/40">$</span>}
        </div>
    );
}

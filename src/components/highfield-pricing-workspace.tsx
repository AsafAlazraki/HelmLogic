
'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useCollection, useDoc, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, orderBy, doc, getDocs, updateDoc, setDoc, deleteDoc, addDoc, serverTimestamp, where } from 'firebase/firestore';
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
    Settings2,
    X,
    Maximize2,
    Minimize2,
    ChevronLeft,
    ArrowLeft,
    ArrowRight,
    ArrowRightLeft,
    ShieldCheck,
    Truck,
    CheckCircle2,
    Box,
    Calculator,
    AlertCircle,
    Info,
    Lock,
    FolderPlus,
    LayoutGrid,
    Star
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
import { ScrollArea, ScrollBar } from './ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import NextImage from "next/image";
import { Separator } from './ui/separator';
import { Switch } from './ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

interface CustomColumn {
    id: string;
    name: string;
    type: 'percent' | 'text' | 'currency' | 'cost';
    isMandatory?: boolean;
    isCalculated?: boolean;
    formula?: {
        leftId: string; // 'baseCost', 'masterSell', or a col-ID
        operator: '+' | '-' | '*' | '/';
        rightId: string | number; // 'baseCost', 'masterSell', a col-ID, or a numeric constant
    };
}

interface PricingSection {
    id: string;
    name: string;
    order: number;
    isCollapsed?: boolean;
    columns: CustomColumn[];
}

interface PricingStrategy {
    baseCurrency?: string;
    sections?: PricingSection[];
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

interface FreightContainer {
    id: string;
    size: string;
    description: string;
    cost: number;
    currency: string;
    cubicMeters: number;
}

const getSectionColCount = (sec: PricingSection) => {
    if (sec.isCollapsed) return 1;
    if (sec.id === 'sec-exchange') return 4;
    if (sec.id === 'sec-vendor') return 2; // Base Price ISO, Base Price Converted
    if (sec.id === 'sec-freight') return 1;
    return Math.max(1, sec.columns.length);
};

const calculateValue = (
    col: CustomColumn, 
    baseCost: number, 
    masterSell: number, 
    itemValues: Record<string, any>, 
    allCols: CustomColumn[]
): { value: number | string | null, error?: string } => {
    if (!col.isCalculated || !col.formula) return { value: itemValues[col.id] ?? null };

    const getVal = (id: string | number): number | null => {
        if (typeof id === 'number') return id;
        if (id === 'baseCost') return baseCost;
        if (id === 'masterSell') return masterSell;
        
        const sourceCol = allCols.find(c => c.id === id);
        if (!sourceCol) return null;

        if (sourceCol.isCalculated) {
            const res = calculateValue(sourceCol, baseCost, masterSell, itemValues, allCols);
            return typeof res.value === 'number' ? res.value : null;
        }

        const val = itemValues[id];
        return (val === undefined || val === null || val === '') ? null : parseFloat(val);
    };

    const left = getVal(col.formula.leftId);
    const right = getVal(col.formula.rightId);

    if (left === null || right === null) {
        const missing = left === null ? col.formula.leftId : col.formula.rightId;
        const missingName = missing === 'baseCost' ? 'Base Cost' : missing === 'masterSell' ? 'Master Sell' : allCols.find(c => c.id === missing)?.name || 'Reference';
        return { value: null, error: `Missing source: ${missingName}` };
    }

    let result = 0;
    switch (col.formula.operator) {
        case '+': result = left + right; break;
        case '-': result = left - right; break;
        case '*': result = left * right; break;
        case '/': 
            if (right === 0) return { value: null, error: 'Division by zero' };
            result = left / right; 
            break;
    }

    return { value: result };
};

function FreightManager({ 
    organisationId, 
    vendorId, 
    isOpen, 
    onClose 
}: { 
    organisationId: string; 
    vendorId: string; 
    isOpen: boolean; 
    onClose: () => void;
}) {
    const firestore = useFirestore();
    const { toast } = useToast();
    
    const freightQuery = useMemoFirebase(() => 
        query(collection(firestore, `organisations/${organisationId}/pricingStrategies/${vendorId}/freightContainers`), orderBy('size')),
    [firestore, organisationId, vendorId]);
    const { data: containers, loading } = useCollection<FreightContainer>(freightQuery);

    const [isAdding, setIsAdding] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const [size, setSize] = useState('');
    const [description, setDescription] = useState('');
    const [cost, setCost] = useState('');
    const [currency, setCurrency] = useState('USD');
    const [cbm, setCbm] = useState('');

    const handleAdd = async () => {
        if (!size || !cost || !cbm) return;
        setIsSaving(true);
        try {
            const colRef = collection(firestore, `organisations/${organisationId}/pricingStrategies/${vendorId}/freightContainers`);
            await addDoc(colRef, {
                size,
                description,
                cost: parseFloat(cost),
                currency,
                cubicMeters: parseFloat(cbm),
                updatedAt: serverTimestamp()
            });
            toast({ title: "Container Added" });
            setIsAdding(false);
            setSize('');
            setDescription('');
            setCost('');
            setCbm('');
        } catch (e) {
            toast({ variant: 'destructive', title: "Save Failed" });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteDoc(doc(firestore, `organisations/${organisationId}/pricingStrategies/${vendorId}/freightContainers`, id));
            toast({ title: "Container Removed" });
        } catch (e) {
            toast({ variant: 'destructive', title: "Delete Failed" });
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-0 overflow-hidden rounded-3xl border-4 shadow-2xl">
                <DialogHeader className="p-8 border-b bg-muted/5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="h-12 w-12 bg-primary/10 text-primary rounded-2xl flex items-center justify-center shadow-inner">
                                <Truck className="h-6 w-6" />
                            </div>
                            <div className="space-y-1">
                                <DialogTitle className="text-2xl font-black uppercase tracking-tight">Freight Management</DialogTitle>
                                <DialogDescription className="text-[10px] font-black uppercase tracking-widest text-primary">Shipping Containers & Logistics Cost Matrix</DialogDescription>
                            </div>
                        </div>
                        <Button 
                            onClick={() => setIsAdding(true)} 
                            className="font-black uppercase tracking-widest text-[10px] h-9 px-6 rounded-xl shadow-lg transition-transform hover:scale-105"
                        >
                            <Plus className="h-4 w-4 mr-1.5" /> Add Container
                        </Button>
                    </div>
                </DialogHeader>

                <div className="flex-1 min-h-0 overflow-hidden">
                    {loading ? (
                        <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                    ) : (
                        <ScrollArea className="h-full">
                            <div className="p-8">
                                {isAdding && (
                                    <Card className="mb-8 border-2 border-primary/20 bg-primary/5 rounded-2xl overflow-hidden animate-in slide-in-from-top-4 duration-300">
                                        <CardHeader className="p-6 border-b bg-background">
                                            <CardTitle className="text-sm font-black uppercase tracking-widest">Configure New Container</CardTitle>
                                        </CardHeader>
                                        <CardContent className="p-6">
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                <div className="space-y-2">
                                                    <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Container Size</Label>
                                                    <Select value={size} onValueChange={setSize}>
                                                        <SelectTrigger className="h-10 font-bold bg-background">
                                                            <SelectValue placeholder="Select Size..." />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="20ft Standard" className="font-bold">20ft Standard</SelectItem>
                                                            <SelectItem value="40ft Standard" className="font-bold">40ft Standard</SelectItem>
                                                            <SelectItem value="40ft High Cube" className="font-bold">40ft High Cube</SelectItem>
                                                            <SelectItem value="45ft High Cube" className="font-bold">45ft High Cube</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Optional Description</Label>
                                                    <Input 
                                                        placeholder="e.g. Ship from China" 
                                                        className="h-10 font-bold bg-background"
                                                        value={description}
                                                        onChange={e => setDescription(e.target.value)}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Cubic Capacity (CBM)</Label>
                                                    <div className="relative">
                                                        <Box className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary opacity-40" />
                                                        <Input 
                                                            type="number" 
                                                            placeholder="0.00" 
                                                            className="pl-10 h-10 font-bold bg-background"
                                                            value={cbm}
                                                            onChange={e => setCbm(e.target.value)}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Container Cost</Label>
                                                    <div className="relative">
                                                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary opacity-40" />
                                                        <Input 
                                                            type="number" 
                                                            placeholder="0.00" 
                                                            className="pl-10 h-10 font-bold bg-background"
                                                            value={cost}
                                                            onChange={e => setCost(e.target.value)}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Cost Currency</Label>
                                                    <Select value={currency} onValueChange={setCurrency}>
                                                        <SelectTrigger className="h-10 font-bold bg-background">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {SUPPORTED_CURRENCIES.map(c => <SelectItem key={c.code} value={c.code} className="font-bold">{c.code}</SelectItem>)}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>
                                        </CardContent>
                                        <CardFooter className="p-6 bg-muted/10 border-t flex justify-end gap-3">
                                            <Button variant="ghost" onClick={() => setIsAdding(false)} className="font-bold">Cancel</Button>
                                            <Button onClick={handleAdd} disabled={isSaving || !size || !cost || !cbm} className="font-black uppercase tracking-widest text-[10px] h-9 px-8 rounded-xl shadow-lg">
                                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                                                Initialize Container
                                            </Button>
                                        </CardFooter>
                                    </Card>
                                )}

                                <div className="rounded-3xl border-2 overflow-hidden bg-card shadow-sm">
                                    <Table>
                                        <TableHeader className="bg-muted/50 border-b-2">
                                            <TableRow className="hover:bg-transparent">
                                                <TableHead className="py-5 px-6 font-black uppercase text-[10px] tracking-widest">Container Size</TableHead>
                                                <TableHead className="py-5 px-6 font-black uppercase text-[10px] tracking-widest">Description</TableHead>
                                                <TableHead className="py-5 px-6 font-black uppercase text-[10px] tracking-widest text-right">Capacity (CBM)</TableHead>
                                                <TableHead className="py-5 px-6 font-black uppercase text-[10px] tracking-widest text-right">Total Cost</TableHead>
                                                <TableHead className="py-5 px-6 font-black uppercase text-[10px] tracking-widest text-center">ISO</TableHead>
                                                <TableHead className="py-5 px-6 font-black uppercase text-[10px] tracking-widest text-right w-[100px]">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {containers && containers.length > 0 ? containers.map((c) => (
                                                <TableRow key={c.id} className="hover:bg-primary/5 transition-colors group">
                                                    <TableCell className="py-4 px-6 font-black text-sm uppercase tracking-tight">{c.size}</TableCell>
                                                    <TableCell className="py-4 px-6 text-[11px] font-bold text-muted-foreground uppercase">{c.description || '-'}</TableCell>
                                                    <TableCell className="py-4 px-6 text-right">
                                                        <Badge variant="outline" className="h-6 font-mono font-black text-[10px] px-2.5 bg-muted/20 border-primary/10 text-primary">
                                                            {c.cubicMeters} m³
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="py-4 px-6 text-right font-black text-sm">
                                                        {formatCurrency(c.cost, c.currency)}
                                                    </TableCell>
                                                    <TableCell className="py-4 px-6 text-center">
                                                        <Badge className="font-black text-[10px] h-6 px-2 uppercase">{c.currency}</Badge>
                                                    </TableCell>
                                                    <TableCell className="py-4 px-6 text-right">
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-all hover:bg-destructive/10 rounded-lg"
                                                            onClick={() => handleDelete(c.id)}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            )) : (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="h-40 text-center text-muted-foreground italic">
                                                        <div className="flex flex-col items-center gap-2">
                                                            <Truck className="h-8 w-8 opacity-10" />
                                                            <span className="text-[10px] font-black uppercase tracking-widest">No containers configured.</span>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        </ScrollArea>
                    )}
                </div>

                <DialogFooter className="p-6 border-t bg-muted/5 shrink-0">
                    <DialogClose asChild>
                        <Button variant="outline" className="font-bold border-2 rounded-xl">Close Workspace</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function HighfieldPricingWorkspace({ vendor, organisationId }: { vendor: any, organisationId: string }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    
    const rangesQuery = useMemoFirebase(() => query(collection(firestore, `data-warehouse/${vendor.id}/ranges`), orderBy('order')), [firestore, vendor.id]);
    const { data: ranges, loading: rangesLoading } = useCollection<Range>(rangesQuery);

    const orgRef = useMemoFirebase(() => doc(firestore, 'organisations', organisationId), [firestore, organisationId]);
    const { data: organisation } = useDoc<any>(orgRef);

    const ratesQuery = useMemoFirebase(() => collection(firestore, `organisations/${organisationId}/exchangeRates`), [firestore, organisationId]);
    const { data: exchangeRates } = useCollection<any>(ratesQuery);

    const [allModels, setAllModels] = useState<Model[]>([]);
    const [allVariants, setAllVariants] = useState<Record<string, Variant[]>>({});
    const [loadingModels, setLoadingModels] = useState(false);

    const strategyRef = useMemoFirebase(() => doc(firestore, `organisations/${organisationId}/pricingStrategies/${vendor.id}`), [firestore, organisationId, vendor.id]);
    const { data: strategy, loading: strategyLoading } = useDoc<PricingStrategy>(strategyRef);

    const [isAddSectionOpen, setIsAddSectionOpen] = useState(false);
    const [isAddColumnOpen, setIsAddColumnOpen] = useState(false);
    const [targetSectionId, setTargetSectionId] = useState<string | null>(null);
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [isFreightManagerOpen, setIsFreightManagerOpen] = useState(false);
    
    const [newSectionName, setNewSectionName] = useState('');

    const [newColName, setNewColName] = useState('');
    const [newColType, setNewColType] = useState<CustomColumn['type']>('percent');
    const [isCalculated, setIsCalculated] = useState(false);
    const [isMandatory, setIsMandatory] = useState(false);
    const [formulaLeft, setFormulaLeft] = useState('baseCost');
    const [formulaOp, setFormulaOp] = useState<CustomColumn['formula']['operator']>('+');
    const [formulaRight, setFormulaRight] = useState('');

    const [searchTerm, setSearchTerm] = useState('');
    const [expandedRanges, setExpandedRanges] = useState<string[]>([]);

    useEffect(() => {
        if (strategyLoading || !strategy) return;
        
        const currentSections = strategy.sections || [];
        // Ensure Exchange, Vendor, and Freight exist as core sections
        const requiredIds = ['sec-exchange', 'sec-vendor', 'sec-freight'];
        const missingIds = requiredIds.filter(id => !currentSections.some(s => s.id === id));
        
        if (missingIds.length > 0) {
            const defaults: Record<string, PricingSection> = {
                'sec-exchange': { id: 'sec-exchange', name: 'Exchange', order: 0, columns: [] },
                'sec-vendor': { id: 'sec-vendor', name: 'Vendor', order: 1, columns: [] },
                'sec-freight': { id: 'sec-freight', name: 'Freight', order: 2, columns: [] },
            };
            
            let nextOrder = currentSections.length > 0 
                ? Math.max(...currentSections.map(s => s.order)) + 1 
                : 0;
                
            const newSections = currentSections.filter(s => s.id !== 'sec-master'); // Remove old Master Core if present
            missingIds.forEach(id => {
                if (!newSections.some(s => s.id === id)) {
                    newSections.push({ ...defaults[id], order: nextOrder++ });
                }
            });
            
            const normalized = newSections
                .sort((a, b) => a.order - b.order)
                .map((s, i) => ({ ...s, order: i }));

            updateDoc(strategyRef, { sections: normalized });
        } else if (currentSections.some(s => s.id === 'sec-master')) {
            const filtered = currentSections
                .filter(s => s.id !== 'sec-master')
                .map((s, i) => ({ ...s, order: i }));
            updateDoc(strategyRef, { sections: filtered });
        }
    }, [strategy, strategyLoading, strategyRef]);

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

    const activeExchangeRate = useMemo(() => {
        if (!exchangeRates || !vendor.currency) return 1;
        const rate = exchangeRates.find((r: any) => r.code === vendor.currency);
        return rate?.rate || 1;
    }, [exchangeRates, vendor.currency]);

    const allColumns = useMemo(() => {
        if (!strategy?.sections) return [];
        return strategy.sections.flatMap(s => s.columns);
    }, [strategy?.sections]);

    const sortedSections = useMemo(() => {
        return [...(strategy?.sections || [])].sort((a, b) => a.order - b.order);
    }, [strategy?.sections]);

    const handleMoveSection = async (secId: string, direction: 'left' | 'right') => {
        const sections = [...sortedSections];
        const idx = sections.findIndex(s => s.id === secId);
        if (idx === -1) return;

        const newIdx = direction === 'left' ? idx - 1 : idx + 1;
        if (newIdx < 0 || newIdx >= sections.length) return;

        const temp = sections[idx];
        sections[idx] = sections[newIdx];
        sections[newIdx] = temp;

        const normalized = sections.map((s, i) => ({ ...s, order: i }));
        await updateDoc(strategyRef, { sections: normalized });
        toast({ title: "Section Position Updated" });
    };

    const handleMoveColumn = async (secId: string, colId: string, direction: 'left' | 'right') => {
        const sections = [...sortedSections];
        const secIdx = sections.findIndex(s => s.id === secId);
        if (secIdx === -1) return;

        const cols = [...sections[secIdx].columns];
        const idx = cols.findIndex(c => c.id === colId);
        if (idx === -1) return;

        const newIdx = direction === 'left' ? idx - 1 : idx + 1;
        if (newIdx < 0 || newIdx >= cols.length) return;

        const temp = cols[idx];
        cols[idx] = cols[newIdx];
        cols[newIdx] = temp;

        sections[secIdx].columns = cols;
        await updateDoc(strategyRef, { sections });
        toast({ title: "Metric Position Updated" });
    };

    const handleAddSection = async () => {
        if (!newSectionName.trim()) return;
        const newSection: PricingSection = {
            id: `sec-${Date.now()}`,
            name: newSectionName,
            order: sortedSections.length,
            columns: []
        };
        await updateDoc(strategyRef, { sections: [...sortedSections, newSection] });
        setIsAddSectionOpen(false);
        setNewSectionName('');
        toast({ title: "Section Created" });
    };

    const handleAddColumn = async () => {
        if (!newColName.trim() || !targetSectionId) return;
        
        const newCol: CustomColumn = {
            id: `col-${Date.now()}`,
            name: newColName,
            type: newColType,
            isMandatory,
            isCalculated,
            formula: isCalculated ? {
                leftId: formulaLeft,
                operator: formulaOp,
                rightId: isNaN(parseFloat(formulaRight)) ? formulaRight : parseFloat(formulaRight)
            } : undefined
        };

        const currentSections = [...sortedSections];
        const sectionIdx = currentSections.findIndex(s => s.id === targetSectionId);
        if (sectionIdx !== -1) {
            currentSections[sectionIdx].columns.push(newCol);
            await updateDoc(strategyRef, { sections: currentSections });
        }
        
        setIsAddColumnOpen(false);
        setNewColName('');
        setIsCalculated(false);
        setIsMandatory(false);
        toast({ title: "Metric Initialized" });
    };

    const handleToggleSectionCollapse = async (secId: string) => {
        const sections = [...sortedSections];
        const idx = sections.findIndex(s => s.id === secId);
        if (idx !== -1) {
            sections[idx].isCollapsed = !sections[idx].isCollapsed;
            await updateDoc(strategyRef, { sections });
        }
    };

    const handleDeleteSection = async (secId: string) => {
        const sections = sortedSections.filter(s => s.id !== secId);
        const normalized = sections.map((s, i) => ({ ...s, order: i }));
        await updateDoc(strategyRef, { sections: normalized });
        toast({ title: "Section Removed" });
    };

    const handleDeleteColumn = async (secId: string, colId: string) => {
        const sections = [...sortedSections];
        const idx = sections.findIndex(s => s.id === secId);
        if (idx !== -1) {
            sections[idx].columns = sections[idx].columns.filter(c => c.id !== colId);
            await updateDoc(strategyRef, { sections });
            toast({ title: "Metric Removed" });
        }
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

    const toggleRange = (id: string) => {
        setExpandedRanges(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const filteredRanges = useMemo(() => {
        if (!ranges) return [];
        if (!searchTerm) return ranges;
        const lower = searchTerm.toLowerCase();
        return ranges.filter(range => {
            const modelsInRange = allModels.filter(m => m.rangeId === range.id);
            return range.name.toLowerCase().includes(lower) || 
                   modelsInRange.some(m => m.name.toLowerCase().includes(lower) || m.modelCode?.toLowerCase().includes(lower));
        });
    }, [ranges, searchTerm, allModels]);

    const PricingTable = () => (
        <div className="min-w-[1600px] bg-background">
            <Table className="border-separate border-spacing-0 table-fixed w-full">
                <TableHeader className="sticky top-0 z-20">
                    <TableRow className="hover:bg-transparent">
                        <TableHead className="w-[350px] border-r border-b bg-card sticky left-0 z-40 shadow-[2px_0_5px_rgba(0,0,0,0.05)]"></TableHead>
                        {sortedSections.map((sec, secIdx) => {
                            const isCoreSystem = ['sec-exchange', 'sec-vendor', 'sec-freight'].includes(sec.id);
                            const colSpan = getSectionColCount(sec);

                            return (
                                <TableHead 
                                    key={sec.id} 
                                    colSpan={colSpan} 
                                    className={cn(
                                        "border-r border-b last:border-r-0 p-0 group/sec transition-colors",
                                        sec.isCollapsed ? "bg-muted/40 w-[60px]" : "bg-primary/5"
                                    )}
                                >
                                    <div className="flex flex-col h-full">
                                        <div className="flex items-center justify-between gap-2 p-2 border-b bg-muted/5 min-h-[40px]">
                                            <div className="flex items-center gap-2 overflow-hidden">
                                                <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full shrink-0" onClick={() => handleToggleSectionCollapse(sec.id)}>
                                                    {sec.isCollapsed ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
                                                </Button>
                                                {!sec.isCollapsed && <span className="text-[10px] font-black uppercase tracking-widest text-primary truncate">{sec.name}</span>}
                                            </div>
                                            {!sec.isCollapsed && (
                                                <div className="flex items-center gap-1 opacity-0 group-hover/sec:opacity-100 transition-opacity shrink-0">
                                                    <Button variant="ghost" size="icon" className={cn("h-6 w-6", secIdx === 0 && "opacity-20 pointer-events-none")} onClick={() => handleMoveSection(sec.id, 'left')}><ArrowLeft className="h-3 w-3" /></Button>
                                                    <Button variant="ghost" size="icon" className={cn("h-6 w-6", secIdx === sortedSections.length - 1 && "opacity-20 pointer-events-none")} onClick={() => handleMoveSection(sec.id, 'right')}><ArrowRight className="h-3 w-3" /></Button>
                                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setTargetSectionId(sec.id); setIsAddColumnOpen(true); }}><Plus className="h-3 w-3" /></Button>
                                                    {!isCoreSystem && <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:bg-destructive/10" onClick={() => handleDeleteSection(sec.id)}><Trash2 className="h-3 w-3" /></Button>}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </TableHead>
                            );
                        })}
                    </TableRow>
                    <TableRow className="hover:bg-transparent">
                        <TableHead className="py-4 px-6 border-r border-b bg-muted/20 font-black uppercase text-[10px] sticky left-0 z-40 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">Description &amp; SKU</TableHead>
                        {sortedSections.map(sec => {
                            if (sec.isCollapsed) return <TableHead key={`sub-coll-${sec.id}`} className="w-[60px] border-r border-b last:border-r-0 bg-muted/20" />;
                            
                            if (sec.id === 'sec-exchange') {
                                return (
                                    <React.Fragment key={sec.id}>
                                        <TableHead className="text-center border-r border-b bg-primary/5 font-black uppercase text-[10px] w-[80px]">Vendor ISO</TableHead>
                                        <TableHead className="text-center border-r border-b bg-primary/5 font-black uppercase text-[10px] w-[100px]">Vendor Ex. Rate</TableHead>
                                        <TableHead className="text-center border-r border-b bg-primary/5 font-black uppercase text-[10px] w-[80px]">Org ISO</TableHead>
                                        <TableHead className="text-center border-r border-b bg-primary/5 font-black uppercase text-[10px] w-[100px]">Org Ex. Rate</TableHead>
                                    </React.Fragment>
                                );
                            }
                            if (sec.id === 'sec-vendor') {
                                return (
                                    <React.Fragment key={sec.id}>
                                        <TableHead className="text-right border-r border-b bg-primary/5 font-black uppercase text-[10px] w-[120px]">Base Price ({vendor.currency || 'ISO'})</TableHead>
                                        <TableHead className="text-right border-r border-b bg-primary/5 font-black uppercase text-[10px] w-[120px]">Base Price ({organisation?.tradingCurrency || 'Conv'})</TableHead>
                                    </React.Fragment>
                                );
                            }
                            if (sec.id === 'sec-freight') {
                                return <TableHead key={sec.id} className="text-right border-r border-b bg-primary/5 font-black uppercase text-[10px] w-[120px]">Packed m³</TableHead>;
                            }

                            if (sec.columns.length === 0) return <TableHead key={`empty-${sec.id}`} className="w-[180px] border-r border-b last:border-r-0 bg-primary/5 text-center text-[8px] font-bold text-muted-foreground uppercase">Empty Section</TableHead>;
                            
                            return sec.columns.map((col, idx) => (
                                <TableHead key={col.id} className="min-w-[180px] bg-primary/5 text-center px-2 group/header border-r border-b last:border-r-0">
                                    <div className="flex items-center justify-between gap-1">
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className={cn("h-6 w-6 opacity-0 group-hover/header:opacity-100 transition-opacity", idx === 0 && "invisible")} 
                                            onClick={() => handleMoveColumn(sec.id, col.id, 'left')}
                                        >
                                            <ChevronLeft className="h-3 w-3" />
                                        </Button>
                                        <div className="flex flex-col items-center flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5 justify-center w-full">
                                                {col.isCalculated && <Calculator className="h-3 w-3 text-primary shrink-0" />}
                                                <span className="text-[10px] font-black uppercase tracking-widest text-primary truncate text-center">{col.name}</span>
                                                {col.isMandatory && <span className="text-destructive font-black">*</span>}
                                            </div>
                                            <Badge variant="outline" className="h-4 text-[8px] opacity-40 font-black uppercase p-0 border-none">{col.type}</Badge>
                                        </div>
                                        <div className="flex items-center gap-0.5">
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className={cn("h-6 w-6 opacity-0 group-hover/header:opacity-100 transition-opacity", idx === sec.columns.length - 1 && "invisible")} 
                                                onClick={() => handleMoveColumn(sec.id, col.id, 'right')}
                                            >
                                                <ChevronRight className="h-3 w-3" />
                                            </Button>
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="h-6 w-6 text-destructive opacity-0 group-hover:opacity-100 transition-all"
                                                onClick={() => handleDeleteColumn(sec.id, col.id)}
                                            >
                                                <X className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </div>
                                </TableHead>
                            ));
                        })}
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
                            sections={sortedSections}
                            allColumns={allColumns}
                            strategy={strategy}
                            onUpdateValue={handleUpdateValue}
                            vendor={vendor}
                            organisation={organisation}
                            exchangeRate={activeExchangeRate}
                        />
                    ))}
                </TableBody>
            </Table>
        </div>
    );

    const StrategyControls = () => (
        <div className="flex items-center gap-3">
            <Button 
                onClick={() => setIsFreightManagerOpen(true)} 
                variant="outline" 
                className="h-10 px-4 font-black uppercase tracking-widest text-[10px] rounded-xl border-2 flex items-center gap-2 shadow-sm transition-all hover:bg-primary hover:text-white"
            >
                <Truck className="h-4 w-4" /> Freight Management
            </Button>
            <Button 
                onClick={() => setIsAddSectionOpen(true)} 
                className="h-10 px-4 font-black uppercase tracking-widest text-[10px] rounded-xl border-2 border-primary bg-primary text-white hover:bg-primary/90 flex items-center gap-2 shadow-lg transition-all active:scale-[0.98]"
            >
                <Plus className="h-4 w-4" /> Add Section
            </Button>
        </div>
    );

    return (
        <div className="flex flex-col h-full overflow-hidden">
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
                            </div>
                            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-primary">Pricing &amp; Profitability Strategy</CardDescription>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <StrategyControls />
                        <div className="h-10 w-px bg-border mx-2" />
                        <Button 
                            type="button"
                            variant="outline"
                            onClick={() => setIsFullScreen(true)}
                            className="h-10 font-black uppercase tracking-widest text-[10px] shadow-sm flex items-center gap-2 border-2 hover:bg-primary hover:text-primary-foreground transition-all rounded-xl"
                        >
                            <Maximize2 className="h-4 w-4" />
                            Strategy Focus Mode
                        </Button>
                    </div>
                </div>
            </CardHeader>

            <div className="flex-1 overflow-hidden relative">
                <ScrollArea className="h-full w-full">
                    <PricingTable />
                    <ScrollBar orientation="horizontal" />
                </ScrollArea>
            </div>

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
                                        <span className="text-lg font-black uppercase tracking-tight leading-none">{vendor.name} STRATEGY WORKSPACE</span>
                                        <div className="flex items-center gap-2 mt-1.5">
                                            <span className="text-[9px] font-black uppercase tracking-widest text-primary">Strategic Pricing Mode</span>
                                            <Badge variant="outline" className="h-4 text-[8px] font-black border-primary/20 text-primary uppercase">
                                                Active Matrix: {sortedSections.length} Sections
                                            </Badge>
                                        </div>
                                    </DialogTitle>
                                </div>

                                <div className="flex-1 max-w-md relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input 
                                        placeholder="Search series or SKUs..." 
                                        className="pl-10 h-10 font-bold border-2 focus-visible:ring-primary/20 bg-background rounded-xl"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>

                                <div className="flex items-center gap-3">
                                    <StrategyControls />
                                    <div className="h-10 w-px bg-border mx-2" />
                                    <DialogClose asChild>
                                        <Button variant="outline" className="h-10 px-4 font-black uppercase tracking-widest text-[10px] rounded-xl border-2 flex items-center gap-2 hover:bg-accent transition-all">
                                            <Minimize2 className="h-4 w-4" /> Collapse
                                        </Button>
                                    </DialogClose>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-hidden">
                            <ScrollArea className="h-full w-full">
                                <PricingTable />
                                <ScrollBar orientation="horizontal" />
                            </ScrollArea>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={isAddSectionOpen} onOpenChange={setIsAddSectionOpen}>
                <DialogContent className="sm:max-w-md rounded-2xl border-4 shadow-2xl">
                    <DialogHeader>
                        <DialogTitle>Create Strategy Section</DialogTitle>
                        <DialogDescription className="text-xs font-bold uppercase text-muted-foreground/60 tracking-widest">Organize your matrix into high-level groupings.</DialogDescription>
                    </DialogHeader>
                    <div className="py-6">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Section Name</Label>
                        <Input 
                            placeholder="e.g. Sub Dealers" 
                            className="font-bold h-11 border-2 focus-visible:ring-primary/20 mt-2"
                            value={newSectionName}
                            onChange={(e) => setNewSectionName(e.target.value)}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAddSectionOpen(false)}>Cancel</Button>
                        <Button onClick={handleAddSection} disabled={!newSectionName.trim()}>Initialize Section</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isAddColumnOpen} onOpenChange={setIsAddColumnOpen}>
                <DialogContent className="sm:max-w-xl rounded-2xl border-4 shadow-2xl overflow-hidden p-0">
                    <DialogHeader className="p-8 border-b bg-muted/5">
                        <DialogTitle className="text-xl font-black uppercase tracking-tight">Strategy Metric Configuration</DialogTitle>
                        <DialogDescription className="text-xs font-bold uppercase text-muted-foreground/60 tracking-widest">Define a new strategic calculation or data point for the section.</DialogDescription>
                    </DialogHeader>
                    
                    <div className="p-8 space-y-8 bg-background">
                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Display Name</Label>
                                <Input 
                                    placeholder="e.g. Adjusted Margin" 
                                    className="font-bold h-11 border-2 focus-visible:ring-primary/20"
                                    value={newColName}
                                    onChange={(e) => setNewColName(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Metric Type</Label>
                                <Select value={newColType} onValueChange={(v: any) => setNewColType(v)}>
                                    <SelectTrigger className="h-11 font-bold border-2">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="percent" className="font-bold">Percentage (%)</SelectItem>
                                        <SelectItem value="currency" className="font-bold">Retail Sell ($)</SelectItem>
                                        <SelectItem value="cost" className="font-bold">Landing Cost ($)</SelectItem>
                                        <SelectItem value="text" className="font-bold">General Text</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="flex flex-col gap-6 p-6 rounded-2xl bg-muted/5 border-2">
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label className="text-[10px] font-black uppercase tracking-widest">Calculated Logic</Label>
                                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Derive value from other metrics</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-[9px] font-black uppercase tracking-tighter text-muted-foreground">Is Calculated</span>
                                    <Switch checked={isCalculated} onCheckedChange={setIsCalculated} />
                                </div>
                            </div>

                            {isCalculated && (
                                <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                                    <div className="grid grid-cols-[1fr_50px_1fr] items-end gap-3">
                                        <div className="space-y-1.5">
                                            <Label className="text-[8px] font-black uppercase text-muted-foreground/60">Operand 1</Label>
                                            <Select value={formulaLeft} onValueChange={setFormulaLeft}>
                                                <SelectTrigger className="h-10 font-bold bg-background">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="baseCost" className="font-bold">Base Cost</SelectItem>
                                                    <SelectItem value="masterSell" className="font-bold">Master Sell</SelectItem>
                                                    {allColumns?.filter(c => !c.isCalculated).map(c => (
                                                        <SelectItem key={c.id} value={c.id} className="font-bold">{c.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-[8px] font-black uppercase text-muted-foreground/60">Op</Label>
                                            <Select value={formulaOp} onValueChange={(v: any) => setFormulaOp(v)}>
                                                <SelectTrigger className="h-10 font-black text-primary bg-background">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="+" className="font-black">+</SelectItem>
                                                    <SelectItem value="-" className="font-black">-</SelectItem>
                                                    <SelectItem value="*" className="font-black">*</SelectItem>
                                                    <SelectItem value="/" className="font-black">/</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-[8px] font-black uppercase text-muted-foreground/60">Operand 2</Label>
                                            <div className="flex gap-2">
                                                <Select value={formulaRight} onValueChange={setFormulaRight}>
                                                    <SelectTrigger className="h-10 font-bold bg-background flex-1">
                                                        <SelectValue placeholder="Ref..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="baseCost" className="font-bold">Base Cost</SelectItem>
                                                        <SelectItem value="masterSell" className="font-bold">Master Sell</SelectItem>
                                                        {allColumns?.filter(c => c.id !== formulaLeft && !c.isCalculated).map(c => (
                                                            <SelectItem key={c.id} value={c.id} className="font-bold">{c.name}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <Input 
                                                    placeholder="Val" 
                                                    className="w-20 h-10 font-bold bg-background" 
                                                    value={formulaRight}
                                                    onChange={e => setFormulaRight(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <p className="text-[9px] font-bold text-primary uppercase italic text-center tracking-tighter">
                                        Logic: Result = {formulaLeft === 'baseCost' ? 'Base Cost' : formulaLeft === 'masterSell' ? 'Master Sell' : allColumns?.find(c => c.id === formulaLeft)?.name} {formulaOp} {formulaRight || '?'}
                                    </p>
                                </div>
                            )}

                            <Separator />

                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label className="text-[10px] font-black uppercase tracking-widest">Enforcement</Label>
                                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Require value before finalization</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-[9px] font-black uppercase tracking-tighter text-muted-foreground">Mandatory Field</span>
                                    <Switch checked={isMandatory} onCheckedChange={setIsMandatory} />
                                </div>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="p-8 bg-muted/5 border-t gap-3">
                        <Button variant="outline" onClick={() => setIsAddColumnOpen(false)} className="h-11 px-6 font-bold rounded-xl border-2">Discard</Button>
                        <Button onClick={handleAddColumn} disabled={!newColName.trim()} className="h-11 px-8 font-black uppercase tracking-widest rounded-xl shadow-xl">
                            Initialize Metric
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {organisationId && (
                <FreightManager 
                    organisationId={organisationId} 
                    vendorId={vendor.id} 
                    isOpen={isFreightManagerOpen} 
                    onClose={() => setIsFreightManagerOpen(false)} 
                />
            )}
        </div>
    );
}

function RangeSection({ range, models, variants, isExpanded, onToggle, sections, allColumns, strategy, onUpdateValue, vendor, organisation, exchangeRate }: any) {
    const strategyColCount = sections.reduce((acc: number, s: any) => acc + (s.isCollapsed ? 1 : Math.max(1, s.columns.length)), 0);

    return (
        <>
            <TableRow className="bg-muted/30 cursor-pointer group" onClick={onToggle}>
                <TableCell className="py-3 px-6 font-black uppercase tracking-[0.1em] text-xs border-r sticky left-0 z-30 bg-card shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                    <div className="flex items-center gap-3">
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        <span>{range.name} Range</span>
                        <Badge variant="outline" className="h-5 text-[9px] border-primary/20 text-primary uppercase font-black">{models.length} Series</Badge>
                    </div>
                </TableCell>
                <TableCell className="text-center border-r bg-primary/5">
                    <Badge variant="ghost" className="font-black text-[10px] uppercase opacity-60">{vendor.currency || 'AUD'}</Badge>
                </TableCell>
                <TableCell className="text-center border-r bg-primary/5">
                    <span className="text-[10px] font-mono font-black text-primary/60">{exchangeRate ? exchangeRate.toFixed(4) : '1.0000'}</span>
                </TableCell>
                <TableCell className="text-center border-r bg-primary/5">
                    <Badge variant="ghost" className="font-black text-[10px] uppercase opacity-60">{organisation?.tradingCurrency || 'AUD'}</Badge>
                </TableCell>
                <TableCell className="text-center border-r bg-primary/5">
                    <span className="text-[10px] font-mono font-black text-primary/60">1.0000</span>
                </TableCell>
                <TableCell className="border-r" />
                <TableCell className="border-r" />
                <TableCell className="border-r bg-slate-50" />
                
                <TableCell colSpan={strategyColCount} className="pr-6 bg-muted/30" />
            </TableRow>
            {isExpanded && models.map((model: any) => (
                <ModelGroup 
                    key={model.id} 
                    model={model} 
                    variants={variants[model.id] || []} 
                    sections={sections}
                    allColumns={allColumns}
                    strategy={strategy}
                    onUpdateValue={onUpdateValue}
                    vendor={vendor}
                    organisation={organisation}
                    exchangeRate={exchangeRate}
                />
            ))}
        </>
    );
}

function ModelGroup({ model, variants, sections, allColumns, strategy, onUpdateValue, vendor, organisation, exchangeRate }: any) {
    const [isLocalExpanded, setIsLocalExpanded] = useState(true);
    const strategyColCount = sections.reduce((acc: number, s: any) => acc + (s.isCollapsed ? 1 : Math.max(1, s.columns.length)), 0);

    return (
        <>
            <TableRow className="bg-muted/5 border-l-4 border-l-primary/40">
                <TableCell className="py-3 px-8 border-r sticky left-0 z-30 bg-card shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
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
                <TableCell className="bg-muted/5 border-r" />
                <TableCell className="bg-muted/5 border-r" />
                <TableCell className="bg-muted/5 border-r" />
                <TableCell className="bg-muted/5 border-r" />
                <TableCell className="bg-muted/5 border-r" />
                <TableCell className="bg-muted/5 border-r" />
                <TableCell className="bg-muted/5 border-r" />
                <TableCell colSpan={strategyColCount} className="bg-muted/5" />
            </TableRow>

            {isLocalExpanded && (
                <>
                    {variants.map((v: any) => (
                        <PricingRow 
                            key={v.id} 
                            id={v.id} 
                            name={v.name} 
                            sku={v.sku} 
                            cost={v.cost} 
                            sell={v.sellPriceExclGst} 
                            vendor={vendor}
                            organisation={organisation}
                            exchangeRate={exchangeRate}
                            sections={sections}
                            allColumns={allColumns}
                            strategy={strategy}
                            onUpdateValue={onUpdateValue}
                            indent
                            isBoatVariant
                        />
                    ))}

                    {model.optionalFeatures && model.optionalFeatures.length > 0 && (
                        <>
                            <TableRow className="bg-white/50 border-l-4 border-l-primary/40">
                                <TableCell className="py-2 px-12 italic text-[10px] font-black uppercase tracking-widest text-primary/60 border-r sticky left-0 z-30 bg-card shadow-[2px_0_5px_rgba(0,0,0,0.05)]" colSpan={1}>
                                    <div className="flex items-center gap-2">
                                        <Wrench className="h-3.5 w-3.5" />
                                        <span>Factory Options</span>
                                    </div>
                                </TableCell>
                                <TableCell colSpan={7 + strategyColCount} className="bg-white/50" />
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
                                    organisation={organisation}
                                    exchangeRate={exchangeRate}
                                    sections={sections}
                                    allColumns={allColumns}
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

function PricingRow({ id, name, sku, cost, sell, sections, allColumns, strategy, onUpdateValue, indent, isOption, isBoatVariant, vendor, organisation, exchangeRate }: any) {
    const itemValues = strategy?.itemValues?.[id] || {};

    return (
        <TableRow className="hover:bg-muted/30 group transition-colors">
            <TableCell className={cn("py-2.5 border-r sticky left-0 z-30 bg-background group-hover:bg-muted/30 transition-colors shadow-[2px_0_5px_rgba(0,0,0,0.05)]", indent ? "pl-16" : "px-6")}>
                <div className="flex flex-col">
                    <span className="font-bold text-[11px] uppercase tracking-tight">{name}</span>
                    <span className="text-[9px] font-mono text-muted-foreground uppercase">{sku || 'NO SKU'}</span>
                </div>
            </TableCell>
            <TableCell className="text-center border-r bg-primary/5">
                <Badge variant="ghost" className="font-black text-[10px] uppercase opacity-60">{vendor.currency || 'AUD'}</Badge>
            </TableCell>
            <TableCell className="text-center border-r bg-primary/5">
                <span className="text-[10px] font-mono font-black text-primary/60">{exchangeRate ? exchangeRate.toFixed(4) : '1.0000'}</span>
            </TableCell>
            <TableCell className="text-center border-r bg-primary/5">
                <Badge variant="ghost" className="font-black text-[10px] uppercase opacity-60">{organisation?.tradingCurrency || 'AUD'}</Badge>
            </TableCell>
            <TableCell className="text-center border-r bg-primary/5">
                <span className="text-[10px] font-mono font-black text-primary/60">1.0000</span>
            </TableCell>
            
            {/* Core Sections logic */}
            {sections.map((sec: any) => {
                if (sec.id === 'sec-vendor') {
                    if (sec.isCollapsed) return <TableCell key={`coll-val-${sec.id}`} className="bg-muted/20 border-r" />;
                    const convertedCost = (cost || 0) * (exchangeRate || 1);
                    return (
                        <React.Fragment key={sec.id}>
                            <TableCell className="text-right text-[11px] font-medium text-muted-foreground border-r px-4 bg-primary/5">
                                {formatCurrency(cost, vendor.currency || 'AUD')}
                            </TableCell>
                            <TableCell className="text-right text-[11px] font-black text-primary border-r px-4 bg-primary/5">
                                {formatCurrency(convertedCost, organisation?.tradingCurrency || 'AUD')}
                            </TableCell>
                        </React.Fragment>
                    );
                }
                if (sec.id === 'sec-freight') {
                    if (sec.isCollapsed) return <TableCell key={`coll-val-${sec.id}`} className="bg-muted/20 border-r" />;
                    return (
                        <TableCell key={sec.id} className="text-right bg-slate-50 border-r p-0 group-hover:bg-slate-100 transition-colors">
                            {isBoatVariant ? (
                                <div className="relative h-full w-full flex items-center">
                                    <input 
                                        type="number" 
                                        step="0.01"
                                        className="h-10 w-full bg-transparent border-none text-[11px] font-black text-right pr-8 focus:ring-2 focus:ring-primary focus:bg-background transition-all outline-none"
                                        placeholder="0.00"
                                        value={itemValues['packed_m3'] || ''}
                                        onChange={(e) => onUpdateValue(id, 'packed_m3', e.target.value)}
                                    />
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-black text-slate-400">m³</span>
                                </div>
                            ) : (
                                <div className="h-full w-full bg-slate-100/50" />
                            )}
                        </TableCell>
                    );
                }
                
                // Exchange handled above separately
                if (sec.id === 'sec-exchange') return null;

                if (sec.isCollapsed) return <TableCell key={`coll-val-${sec.id}`} className="bg-muted/20 border-r last:border-r-0" />;
                if (sec.columns.length === 0) return <TableCell key={`empty-val-${sec.id}`} className="bg-primary/5 border-r last:border-r-0" />;

                return sec.columns.map((col: any) => (
                    <TableCell key={col.id} className="p-0 border-r last:border-r-0 bg-primary/5 group-hover:bg-primary/10 transition-colors">
                        {col.isCalculated ? (
                            <CalculatedCell 
                                col={col} 
                                baseCost={cost} 
                                masterSell={sell} 
                                itemValues={itemValues} 
                                allCols={allColumns} 
                            />
                        ) : (
                            <EditableCell 
                                id={id}
                                col={col}
                                value={itemValues[col.id] || ''} 
                                onChange={(val) => onUpdateValue(id, col.id, val)}
                            />
                        )}
                    </TableCell>
                ));
            })}
        </TableRow>
    );
}

function CalculatedCell({ col, baseCost, masterSell, itemValues, allCols }: { col: CustomColumn, baseCost: number, masterSell: number, itemValues: any, allCols: CustomColumn[] }) {
    const { value, error } = calculateValue(col, baseCost, masterSell, itemValues, allCols);

    return (
        <div className="flex items-center justify-center h-full w-full px-2 relative group/calc">
            {error ? (
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-destructive/10 text-destructive animate-pulse cursor-help">
                                <AlertCircle className="h-3 w-3" />
                                <span className="text-[8px] font-black uppercase">Missing Data</span>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="bg-destructive text-destructive-foreground border-none font-bold text-[10px] uppercase p-3 rounded-xl shadow-xl">
                            {error}
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            ) : (
                <span className="text-[11px] font-black text-primary">
                    {col.type === 'percent' ? `${(Number(value) * 100).toFixed(2)}%` : 
                     (col.type === 'currency' || col.type === 'cost') ? formatCurrency(Number(value)) : 
                     String(value || '-')}
                </span>
            )}
            <div className="absolute top-1 left-1 opacity-0 group-hover/calc:opacity-40 transition-opacity">
                <Lock className="h-2.5 w-2.5 text-primary" />
            </div>
        </div>
    );
}

function EditableCell({ id, col, value, onChange }: { id: string, col: CustomColumn, value: any, onChange: (val: any) => void }) {
    const [localValue, setLocalValue] = useState(value);
    const isMissingMandatory = col.isMandatory && (value === undefined || value === null || value === '');

    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    const handleBlur = () => {
        if (localValue !== value) {
            onChange(localValue);
        }
    };

    return (
        <div className="relative h-full w-full flex items-center">
            <input 
                type={col.type === 'text' ? 'text' : 'number'}
                className={cn(
                    "h-10 w-full bg-transparent border-none text-[11px] font-bold text-center focus:ring-2 focus:ring-primary focus:bg-background transition-all outline-none",
                    isMissingMandatory ? "bg-destructive/5 placeholder:text-destructive/40" : ""
                )}
                value={localValue}
                onChange={(e) => setLocalValue(e.target.value)}
                onBlur={handleBlur}
                placeholder={col.isMandatory ? "REQUIRED" : "-"}
            />
            {col.type === 'percent' && localValue && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-black text-primary/40">%</span>}
            {col.type === 'currency' && localValue && <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-black text-primary/40">$</span>}
            
            {isMissingMandatory && (
                <div className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none">
                    <AlertCircle className="h-3 w-3 text-destructive opacity-40" />
                </div>
            )}
        </div>
    );
}

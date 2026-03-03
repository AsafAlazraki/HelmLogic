
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
    Coins,
    Building,
    Search,
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
    History,
    Clock,
    User as UserIcon,
    Save
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
import { formatDistanceToNow } from 'date-fns';

interface CustomColumn {
    id: string;
    name: string;
    type: 'percent' | 'text' | 'currency' | 'cost';
    isMandatory?: boolean;
    isCalculated?: boolean;
    formula?: {
        leftId: string;
        operator: '+' | '-' | '*' | '/';
        rightId: string | number;
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

interface AuditLogEntry {
    id: string;
    itemId: string;
    colId: string;
    oldValue: any;
    newValue: any;
    timestamp: any;
    userId: string;
    userName: string;
}

const getSectionColCount = (sec: PricingSection) => {
    if (sec.isCollapsed) return 1;
    if (sec.id === 'sec-exchange') return 4;
    if (sec.id === 'sec-vendor') return 2;
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
    const costOverride = itemValues['base_cost_override'];
    const effectiveBaseCost = (costOverride !== undefined && costOverride !== '' && costOverride !== null) 
        ? parseFloat(costOverride) 
        : baseCost;

    if (!col.isCalculated || !col.formula) return { value: itemValues[col.id] ?? null };

    const getVal = (id: string | number): number | null => {
        if (typeof id === 'number') return id;
        if (id === 'baseCost') return effectiveBaseCost;
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
        return { value: null, error: `Missing source` };
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

function AuditLogDialog({ 
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
    const logQuery = useMemoFirebase(() => 
        query(collection(firestore, `organisations/${organisationId}/pricingStrategies/${vendorId}/auditLog`), orderBy('timestamp', 'desc')),
    [firestore, organisationId, vendorId]);
    const { data: logs, loading } = useCollection<AuditLogEntry>(logQuery);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 overflow-hidden rounded-3xl border-4 shadow-2xl">
                <DialogHeader className="p-8 border-b bg-muted/5">
                    <div className="flex items-center gap-4">
                        <div className="h-12 w-12 bg-primary/10 text-primary rounded-2xl flex items-center justify-center shadow-inner">
                            <History className="h-6 w-6" />
                        </div>
                        <div className="space-y-1">
                            <DialogTitle className="text-2xl font-black uppercase tracking-tight">Strategy Audit Log</DialogTitle>
                            <DialogDescription className="text-[10px] font-black uppercase tracking-widest text-primary">Chronological record of tactical modifications</DialogDescription>
                        </div>
                    </div>
                </DialogHeader>
                <div className="flex-1 min-h-0">
                    {loading ? (
                        <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                    ) : logs && logs.length > 0 ? (
                        <ScrollArea className="h-full">
                            <Table>
                                <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm">
                                    <TableRow>
                                        <TableHead className="py-4 px-6 font-black uppercase text-[9px] tracking-widest">Timestamp</TableHead>
                                        <TableHead className="py-4 px-6 font-black uppercase text-[9px] tracking-widest">User</TableHead>
                                        <TableHead className="py-4 px-6 font-black uppercase text-[9px] tracking-widest">Metric</TableHead>
                                        <TableHead className="py-4 px-6 font-black uppercase text-[9px] tracking-widest">Previous</TableHead>
                                        <TableHead className="py-4 px-6 font-black uppercase text-[9px] tracking-widest">New Value</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {logs.map((log) => (
                                        <TableRow key={log.id} className="hover:bg-muted/10 transition-colors">
                                            <TableCell className="py-4 px-6 font-medium text-[10px] text-muted-foreground">
                                                {log.timestamp ? formatDistanceToNow(new Date(log.timestamp.seconds * 1000), { addSuffix: true }) : 'Just now'}
                                            </TableCell>
                                            <TableCell className="py-4 px-6">
                                                <div className="flex items-center gap-2">
                                                    <UserIcon className="h-3 w-3 text-primary opacity-40" />
                                                    <span className="font-bold text-[11px] uppercase truncate">{log.userName || 'System'}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-4 px-6">
                                                <Badge variant="outline" className="font-black text-[8px] uppercase border-primary/20 text-primary">{log.colId}</Badge>
                                            </TableCell>
                                            <TableCell className="py-4 px-6 font-mono text-[10px] text-muted-foreground/60">{log.oldValue ?? '-'}</TableCell>
                                            <TableCell className="py-4 px-6 font-mono text-[10px] font-black text-primary">{log.newValue}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center p-12 opacity-20">
                            <Clock className="h-16 w-16 mb-4" />
                            <p className="text-sm font-black uppercase tracking-widest">No strategic modifications logged yet.</p>
                        </div>
                    )}
                </div>
                <DialogFooter className="p-6 border-t bg-muted/5">
                    <DialogClose asChild><Button variant="outline" className="font-bold border-2">Close Log</Button></DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

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
                                    <Card className="mb-8 border-2 border-primary/20 bg-primary/5 rounded-2xl overflow-hidden">
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
                                                    <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Cubic Capacity (CBM)</Label>
                                                    <Input type="number" value={cbm} onChange={e => setCbm(e.target.value)} className="h-10 font-bold" />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Container Cost</Label>
                                                    <Input type="number" value={cost} onChange={e => setCost(e.target.value)} className="h-10 font-bold" />
                                                </div>
                                            </div>
                                        </CardContent>
                                        <CardFooter className="p-6 bg-muted/10 border-t flex justify-end gap-3">
                                            <Button variant="ghost" onClick={() => setIsAdding(false)}>Cancel</Button>
                                            <Button onClick={handleAdd} disabled={isSaving || !size || !cost || !cbm}>Add Container</Button>
                                        </CardFooter>
                                    </Card>
                                )}

                                <div className="rounded-3xl border-2 overflow-hidden bg-card shadow-sm">
                                    <Table>
                                        <TableHeader className="bg-muted/50 border-b-2">
                                            <TableRow>
                                                <TableHead className="py-5 px-6 font-black uppercase text-[10px] tracking-widest">Container Size</TableHead>
                                                <TableHead className="py-5 px-6 font-black uppercase text-[10px] tracking-widest text-right">Capacity (CBM)</TableHead>
                                                <TableHead className="py-5 px-6 font-black uppercase text-[10px] tracking-widest text-right">Total Cost</TableHead>
                                                <TableHead className="py-5 px-6 font-black uppercase text-[10px] tracking-widest text-center">ISO</TableHead>
                                                <TableHead className="py-5 px-6 font-black uppercase text-[10px] tracking-widest text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {containers?.map((c) => (
                                                <TableRow key={c.id}>
                                                    <TableCell className="py-4 px-6 font-black uppercase">{c.size}</TableCell>
                                                    <TableCell className="py-4 px-6 text-right font-bold">{c.cubicMeters} m³</TableCell>
                                                    <TableCell className="py-4 px-6 text-right font-black">{formatCurrency(c.cost, c.currency)}</TableCell>
                                                    <TableCell className="py-4 px-6 text-center"><Badge>{c.currency}</Badge></TableCell>
                                                    <TableCell className="py-4 px-6 text-right">
                                                        <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)}><Trash2 className="h-4 w-4" /></Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        </ScrollArea>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

export function HighfieldPricingWorkspace({ vendor, organisationId }: { vendor: any, organisationId: string }) {
    const firestore = useFirestore();
    const { user } = useUser();
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
    const [isAuditLogOpen, setIsAuditLogOpen] = useState(false);
    
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
        const requiredIds = ['sec-exchange', 'sec-vendor', 'sec-freight'];
        const missingIds = requiredIds.filter(id => !currentSections.some(s => s.id === id));
        
        if (missingIds.length > 0) {
            const defaults: Record<string, PricingSection> = {
                'sec-exchange': { id: 'sec-exchange', name: 'Exchange', order: 0, columns: [] },
                'sec-vendor': { id: 'sec-vendor', name: 'Vendor', order: 1, columns: [] },
                'sec-freight': { id: 'sec-freight', name: 'Freight', order: 2, columns: [] },
            };
            let nextOrder = currentSections.length > 0 ? Math.max(...currentSections.map(s => s.order)) + 1 : 0;
            const newSections = [...currentSections];
            missingIds.forEach(id => {
                if (!newSections.some(s => s.id === id)) {
                    newSections.push({ ...defaults[id], order: nextOrder++ });
                }
            });
            updateDoc(strategyRef, { sections: newSections.sort((a, b) => a.order - b.order) });
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
                console.error(e);
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
        updateDoc(strategyRef, { sections: sections.map((s, i) => ({ ...s, order: i })) });
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
        updateDoc(strategyRef, { sections });
    };

    const handleAddSection = async () => {
        if (!newSectionName.trim()) return;
        const newSection: PricingSection = { id: `sec-${Date.now()}`, name: newSectionName, order: sortedSections.length, columns: [] };
        await updateDoc(strategyRef, { sections: [...sortedSections, newSection] });
        setIsAddSectionOpen(false);
        setNewSectionName('');
    };

    const handleAddColumn = async () => {
        if (!newColName.trim() || !targetSectionId) return;
        const newCol: CustomColumn = {
            id: `col-${Date.now()}`,
            name: newColName,
            type: newColType,
            isMandatory,
            isCalculated,
            formula: isCalculated ? { leftId: formulaLeft, operator: formulaOp, rightId: isNaN(parseFloat(formulaRight)) ? formulaRight : parseFloat(formulaRight) } : undefined
        };
        const currentSections = [...sortedSections];
        const sectionIdx = currentSections.findIndex(s => s.id === targetSectionId);
        if (sectionIdx !== -1) {
            currentSections[sectionIdx].columns.push(newCol);
            await updateDoc(strategyRef, { sections: currentSections });
        }
        setIsAddColumnOpen(false);
        setNewColName('');
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
        updateDoc(strategyRef, { sections: sections.map((s, i) => ({ ...s, order: i })) });
    };

    const handleDeleteColumn = async (secId: string, colId: string) => {
        const sections = [...sortedSections];
        const idx = sections.findIndex(s => s.id === secId);
        if (idx !== -1) {
            sections[idx].columns = sections[idx].columns.filter(c => c.id !== colId);
            await updateDoc(strategyRef, { sections });
        }
    };

    const handleUpdateValue = async (itemId: string, colId: string, value: any) => {
        const currentValues = strategy?.itemValues || {};
        const oldValue = currentValues[itemId]?.[colId];
        if (String(oldValue || '') === String(value || '')) return;
        const updated = { ...currentValues, [itemId]: { ...(currentValues[itemId] || {}), [colId]: value } };
        updateDoc(strategyRef, { itemValues: updated });
        try {
            const auditLogRef = collection(firestore, `organisations/${organisationId}/pricingStrategies/${vendor.id}/auditLog`);
            addDoc(auditLogRef, { itemId, colId, oldValue: oldValue ?? null, newValue: value, timestamp: serverTimestamp(), userId: user?.uid || 'anonymous', userName: user?.displayName || user?.email || 'Anonymous Strategist' });
        } catch (e) { console.error(e); }
    };

    const toggleRange = (id: string) => setExpandedRanges(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

    const filteredRanges = useMemo(() => {
        if (!ranges) return [];
        if (!searchTerm) return ranges;
        const lower = searchTerm.toLowerCase();
        return ranges.filter(range => range.name.toLowerCase().includes(lower) || allModels.filter(m => m.rangeId === range.id).some(m => m.name.toLowerCase().includes(lower) || m.modelCode?.toLowerCase().includes(lower)));
    }, [ranges, searchTerm, allModels]);

    const PricingTable = () => (
        <div className="min-w-full bg-background overflow-x-auto">
            <Table className="border-collapse table-fixed w-full">
                <TableHeader className="sticky top-0 z-40 bg-white">
                    <TableRow className="hover:bg-transparent">
                        <TableHead className="w-[300px] border-r border-b">Description & SKU</TableHead>
                        {sortedSections.map((sec, secIdx) => {
                            const isCoreSystem = ['sec-exchange', 'sec-vendor', 'sec-freight'].includes(sec.id);
                            const colSpan = getSectionColCount(sec);
                            return (
                                <TableHead key={sec.id} colSpan={colSpan} className={cn("border-r border-b p-0 group/sec", sec.isCollapsed ? "w-[60px]" : "bg-primary/5")}>
                                    <div className="flex flex-col h-full">
                                        <div className="flex items-center justify-between gap-2 p-2 border-b bg-muted/5 min-h-[40px]">
                                            <div className="flex items-center gap-2 overflow-hidden">
                                                <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full" onClick={() => handleToggleSectionCollapse(sec.id)}>{sec.isCollapsed ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}</Button>
                                                {!sec.isCollapsed && <span className="text-[10px] font-black uppercase tracking-widest text-primary truncate">{sec.name}</span>}
                                            </div>
                                            {!sec.isCollapsed && (
                                                <div className="flex items-center gap-1 opacity-0 group-hover/sec:opacity-100 transition-opacity">
                                                    <Button variant="ghost" size="icon" className="h-6 w-6" disabled={secIdx === 0} onClick={() => handleMoveSection(sec.id, 'left')}><ArrowLeft className="h-3 w-3" /></Button>
                                                    <Button variant="ghost" size="icon" className="h-6 w-6" disabled={secIdx === sortedSections.length - 1} onClick={() => handleMoveSection(sec.id, 'right')}><ArrowRight className="h-3 w-3" /></Button>
                                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setTargetSectionId(sec.id); setIsAddColumnOpen(true); }}><Plus className="h-3 w-3" /></Button>
                                                    {!isCoreSystem && <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDeleteSection(sec.id)}><Trash2 className="h-3 w-3" /></Button>}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </TableHead>
                            );
                        })}
                    </TableRow>
                    <TableRow className="hover:bg-transparent">
                        <TableHead className="py-4 px-6 border-r border-b font-black uppercase text-[10px]">Description & SKU</TableHead>
                        {sortedSections.map(sec => {
                            if (sec.isCollapsed) return <TableHead key={`sub-coll-${sec.id}`} className="w-[60px] border-r border-b" />;
                            if (sec.id === 'sec-exchange') return (
                                <React.Fragment key={sec.id}>
                                    <TableHead className="text-center border-r border-b bg-primary/5 font-black uppercase text-[10px] w-[80px]">Vendor ISO</TableHead>
                                    <TableHead className="text-center border-r border-b bg-primary/5 font-black uppercase text-[10px] w-[100px]">Ex. Rate</TableHead>
                                    <TableHead className="text-center border-r border-b bg-primary/5 font-black uppercase text-[10px] w-[80px]">Org ISO</TableHead>
                                    <TableHead className="text-center border-r border-b bg-primary/5 font-black uppercase text-[10px] w-[100px]">Ex. Rate</TableHead>
                                </React.Fragment>
                            );
                            if (sec.id === 'sec-vendor') return (
                                <React.Fragment key={sec.id}>
                                    <TableHead className="text-right border-r border-b bg-primary/5 font-black uppercase text-[10px] w-[120px]">Base Price ({vendor.currency || 'ISO'})</TableHead>
                                    <TableHead className="text-right border-r border-b bg-primary/5 font-black uppercase text-[10px] w-[120px]">Base Converted</TableHead>
                                </React.Fragment>
                            );
                            if (sec.id === 'sec-freight') return <TableHead key={sec.id} className="text-right border-r border-b bg-primary/5 font-black uppercase text-[10px] w-[120px]">Packed m³</TableHead>;
                            if (sec.columns.length === 0) return <TableHead key={`empty-${sec.id}`} className="w-[180px] border-r border-b bg-primary/5 text-center text-[8px] font-bold text-muted-foreground uppercase">Empty Section</TableHead>;
                            return sec.columns.map((col, idx) => (
                                <TableHead key={col.id} className="min-w-[180px] bg-primary/5 text-center px-2 group/header border-r border-b">
                                    <div className="flex items-center justify-between gap-1">
                                        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover/header:opacity-100" disabled={idx === 0} onClick={() => handleMoveColumn(sec.id, col.id, 'left')}><ChevronLeft className="h-3 w-3" /></Button>
                                        <div className="flex flex-col items-center flex-1 min-w-0">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-primary truncate">{col.name}</span>
                                            <Badge variant="outline" className="h-4 text-[8px] uppercase p-0 border-none">{col.type}</Badge>
                                        </div>
                                        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover/header:opacity-100" disabled={idx === sec.columns.length - 1} onClick={() => handleMoveColumn(sec.id, col.id, 'right')}><ChevronRight className="h-3 w-3" /></Button>
                                    </div>
                                </TableHead>
                            ));
                        })}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filteredRanges.map(range => (
                        <RangeSection key={range.id} range={range} models={allModels.filter(m => m.rangeId === range.id)} variants={allVariants} isExpanded={expandedRanges.includes(range.id)} onToggle={() => toggleRange(range.id)} sections={sortedSections} allColumns={allColumns} strategy={strategy} onUpdateValue={handleUpdateValue} vendor={vendor} organisation={organisation} exchangeRate={activeExchangeRate} />
                    ))}
                </TableBody>
            </Table>
        </div>
    );

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <CardHeader className="p-6 border-b bg-background shrink-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="h-12 w-12 relative bg-white rounded-xl border-2 p-2">
                            {vendor.logoUrl ? <NextImage src={vendor.logoUrl} alt={vendor.name} fill className="object-contain p-1" unoptimized /> : <Building className="h-6 w-6 m-auto mt-1" />}
                        </div>
                        <div>
                            <CardTitle className="text-xl font-black uppercase tracking-tight">{vendor.name} Strategy</CardTitle>
                            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-primary">Pricing & Profitability Strategy</CardDescription>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button onClick={() => setIsAuditLogOpen(true)} variant="outline" className="h-10 px-4 font-black uppercase tracking-widest text-[10px] rounded-xl"><History className="h-4 w-4 mr-2" /> Audit Log</Button>
                        <Button onClick={() => setIsFreightManagerOpen(true)} variant="outline" className="h-10 px-4 font-black uppercase tracking-widest text-[10px] rounded-xl"><Truck className="h-4 w-4 mr-2" /> Freight</Button>
                        <Button onClick={() => setIsAddSectionOpen(true)} className="h-10 px-4 font-black uppercase tracking-widest text-[10px] rounded-xl"><Plus className="h-4 w-4 mr-2" /> Add Section</Button>
                    </div>
                </div>
            </CardHeader>
            <div className="flex-1 overflow-auto">
                <PricingTable />
            </div>
            <AuditLogDialog organisationId={organisationId} vendorId={vendor.id} isOpen={isAuditLogOpen} onClose={() => setIsAuditLogOpen(false)} />
            <FreightManager organisationId={organisationId} vendorId={vendor.id} isOpen={isFreightManagerOpen} onClose={() => setIsFreightManagerOpen(false)} />
            <Dialog open={isAddSectionOpen} onOpenChange={setIsAddSectionOpen}><DialogContent><DialogHeader><DialogTitle>Create Strategy Section</DialogTitle></DialogHeader><div className="py-6"><Label>Section Name</Label><Input value={newSectionName} onChange={e => setNewSectionName(e.target.value)} className="mt-2" /></div><DialogFooter><Button onClick={handleAddSection}>Create</Button></DialogFooter></DialogContent></Dialog>
            <Dialog open={isAddColumnOpen} onOpenChange={setIsAddColumnOpen}><DialogContent><DialogHeader><DialogTitle>Metric Configuration</DialogTitle></DialogHeader><div className="space-y-4 py-4"><div className="grid grid-cols-2 gap-4"><div><Label>Name</Label><Input value={newColName} onChange={e => setNewColName(e.target.value)} /></div><div><Label>Type</Label><Select value={newColType} onValueChange={(v: any) => setNewColType(v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="percent">Percentage</SelectItem><SelectItem value="currency">Currency</SelectItem><SelectItem value="cost">Cost</SelectItem><SelectItem value="text">Text</SelectItem></SelectContent></Select></div></div><div className="flex items-center justify-between p-4 bg-muted/20 rounded-xl"><div><Label>Calculated</Label></div><Switch checked={isCalculated} onCheckedChange={setIsCalculated} /></div>{isCalculated && <div className="grid grid-cols-3 gap-2"><Select value={formulaLeft} onValueChange={setFormulaLeft}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="baseCost">Base Cost</SelectItem><SelectItem value="masterSell">Master Sell</SelectItem></SelectContent></Select><Select value={formulaOp} onValueChange={(v: any) => setFormulaOp(v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="+">+</SelectItem><SelectItem value="-">-</SelectItem><SelectItem value="*">*</SelectItem><SelectItem value="/">/</SelectItem></SelectContent></Select><Input placeholder="Value" value={formulaRight} onChange={e => setFormulaRight(e.target.value)} /></div>}</div><DialogFooter><Button onClick={handleAddColumn}>Initialize Metric</Button></DialogFooter></DialogContent></Dialog>
        </div>
    );
}

function RangeSection({ range, models, variants, isExpanded, onToggle, sections, allColumns, strategy, onUpdateValue, vendor, organisation, exchangeRate }: any) {
    const totalCols = sections.reduce((acc: number, s: any) => acc + getSectionColCount(s), 0);
    return (
        <>
            <TableRow className="bg-muted/30 cursor-pointer" onClick={onToggle}>
                <TableCell className="py-3 px-6 font-black uppercase text-xs border-b">
                    <div className="flex items-center gap-2">{isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}<span>{range.name} RANGE</span></div>
                </TableCell>
                <TableCell colSpan={totalCols} className="border-b" />
            </TableRow>
            {isExpanded && models.map((model: any) => (
                <ModelGroup key={model.id} model={model} variants={variants[model.id] || []} sections={sections} allColumns={allColumns} strategy={strategy} onUpdateValue={onUpdateValue} vendor={vendor} organisation={organisation} exchangeRate={exchangeRate} />
            ))}
        </>
    );
}

function ModelGroup({ model, variants, sections, allColumns, strategy, onUpdateValue, vendor, organisation, exchangeRate }: any) {
    const [isLocalExpanded, setIsLocalExpanded] = useState(true);
    const totalCols = sections.reduce((acc: number, s: any) => acc + getSectionColCount(s), 0);
    return (
        <>
            <TableRow className="bg-muted/5 border-l-4 border-l-primary">
                <TableCell className="py-3 px-8 border-b">
                    <div className="flex items-center gap-3"><button onClick={() => setIsLocalExpanded(!isLocalExpanded)}>{isLocalExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button><span className="font-black text-[11px] uppercase truncate">{model.name}</span><span className="text-[9px] font-mono text-muted-foreground">{model.modelCode || 'NO CODE'}</span></div>
                </TableCell>
                <TableCell colSpan={totalCols} className="border-b" />
            </TableRow>
            {isLocalExpanded && (
                <>
                    {variants.map((v: any) => (
                        <PricingRow key={v.id} id={v.id} name={v.name} sku={v.sku} cost={v.cost} sell={v.sellPriceExclGst} vendor={vendor} organisation={organisation} exchangeRate={exchangeRate} sections={sections} allColumns={allColumns} strategy={strategy} onUpdateValue={onUpdateValue} indent />
                    ))}
                    {model.optionalFeatures && model.optionalFeatures.length > 0 && model.optionalFeatures.map((f: any) => (
                        <PricingRow key={f.id} id={f.id} name={f.name} sku={f.code} cost={f.cost} sell={f.sellPriceExclGst} vendor={vendor} organisation={organisation} exchangeRate={exchangeRate} sections={sections} allColumns={allColumns} strategy={strategy} onUpdateValue={onUpdateValue} indent isOption />
                    ))}
                </>
            )}
        </>
    );
}

function PricingRow({ id, name, sku, cost, sell, sections, allColumns, strategy, onUpdateValue, indent, isOption, vendor, organisation, exchangeRate }: any) {
    const itemValues = strategy?.itemValues?.[id] || {};
    return (
        <TableRow className="hover:bg-muted/30 transition-colors">
            <TableCell className={cn("py-2.5 border-r border-b", indent ? "pl-16" : "px-6")}>
                <div className="flex flex-col min-w-0"><span className="font-bold text-[11px] uppercase truncate">{name}</span><span className="text-[9px] font-mono text-muted-foreground uppercase">{sku || 'NO SKU'}</span></div>
            </TableCell>
            {sections.map((sec: any) => {
                if (sec.id === 'sec-exchange') {
                    if (sec.isCollapsed) return <TableCell key={sec.id} className="bg-muted/20 border-r border-b" />;
                    return (
                        <React.Fragment key={sec.id}>
                            <TableCell className="text-center border-r border-b bg-primary/5"><Badge variant="ghost" className="font-black text-[10px]">{vendor.currency || 'AUD'}</Badge></TableCell>
                            <TableCell className="text-center border-r border-b bg-primary/5 text-[10px] font-mono">{exchangeRate.toFixed(4)}</TableCell>
                            <TableCell className="text-center border-r border-b bg-primary/5"><Badge variant="ghost" className="font-black text-[10px]">{organisation?.tradingCurrency || 'AUD'}</Badge></TableCell>
                            <TableCell className="text-center border-r border-b bg-primary/5 text-[10px] font-mono">1.0000</TableCell>
                        </React.Fragment>
                    );
                }
                if (sec.id === 'sec-vendor') {
                    if (sec.isCollapsed) return <TableCell key={sec.id} className="bg-muted/20 border-r border-b" />;
                    const costOverride = itemValues['base_cost_override'];
                    const effectiveCost = (costOverride !== undefined && costOverride !== '' && costOverride !== null) ? parseFloat(costOverride) : cost;
                    const convertedCost = (effectiveCost || 0) * (exchangeRate || 1);
                    return (
                        <React.Fragment key={sec.id}>
                            <TableCell className="p-0 border-r border-b bg-primary/5">
                                <EditableCell id={id} col={{ id: 'base_cost_override', name: 'Base Price', type: 'currency' }} value={costOverride || ''} placeholder={cost ? cost.toFixed(2) : "0.00"} onChange={(val: any) => onUpdateValue(id, 'base_cost_override', val)} align="right" />
                            </TableCell>
                            <TableCell className="text-right text-[11px] font-black text-primary border-r border-b px-4 bg-primary/5">{formatCurrency(convertedCost, organisation?.tradingCurrency || 'AUD')}</TableCell>
                        </React.Fragment>
                    );
                }
                if (sec.id === 'sec-freight') {
                    if (sec.isCollapsed) return <TableCell key={sec.id} className="bg-muted/20 border-r border-b" />;
                    return (
                        <TableCell key={sec.id} className="p-0 border-r border-b bg-primary/5">
                            {!isOption ? <EditableCell id={id} col={{ id: 'packed_m3', name: 'Packed m³', type: 'text' }} value={itemValues['packed_m3'] || ''} onChange={(val: any) => onUpdateValue(id, 'packed_m3', val)} suffix="m³" align="right" /> : <div className="h-full bg-muted/10" />}
                        </TableCell>
                    );
                }
                if (sec.isCollapsed) return <TableCell key={sec.id} className="bg-muted/20 border-r border-b" />;
                if (sec.columns.length === 0) return <TableCell key={sec.id} className="bg-primary/5 border-r border-b" />;
                return sec.columns.map((col: any) => (
                    <TableCell key={col.id} className="p-0 border-r border-b bg-primary/5">
                        {col.isCalculated ? <CalculatedCell col={col} baseCost={cost} masterSell={sell} itemValues={itemValues} allCols={allColumns} /> : <EditableCell id={id} col={col} value={itemValues[col.id] || ''} onChange={(val: any) => onUpdateValue(id, col.id, val)} />}
                    </TableCell>
                ));
            })}
        </TableRow>
    );
}

function CalculatedCell({ col, baseCost, masterSell, itemValues, allCols }: { col: CustomColumn, baseCost: number, masterSell: number, itemValues: any, allCols: CustomColumn[] }) {
    const { value, error } = calculateValue(col, baseCost, masterSell, itemValues, allCols);
    return (
        <div className="flex items-center justify-center h-full px-2">
            {error ? <AlertCircle className="h-3 w-3 text-destructive" title={error} /> : <span className="text-[11px] font-black text-primary">{col.type === 'percent' ? `${(Number(value) * 100).toFixed(2)}%` : (col.type === 'currency' || col.type === 'cost') ? formatCurrency(Number(value)) : String(value || '-')}</span>}
        </div>
    );
}

function EditableCell({ id, col, value, onChange, placeholder, suffix, align = 'center' }: any) {
    const [localValue, setLocalValue] = useState(value);
    useEffect(() => { setLocalValue(value); }, [value]);
    const handleBlur = () => { if (String(localValue || '') !== String(value || '')) onChange(localValue); };
    return (
        <div className="relative h-full flex items-center">
            <input type={col.type === 'text' ? 'text' : 'number'} className={cn("h-10 w-full bg-transparent border-none text-[11px] font-bold outline-none px-3 focus:bg-background", align === 'right' ? 'text-right pr-8' : 'text-center')} value={localValue} onChange={e => setLocalValue(e.target.value)} onBlur={handleBlur} placeholder={placeholder || "-"} />
            {suffix && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-black opacity-40">{suffix}</span>}
        </div>
    );
}


'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useCollection, useDoc, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, orderBy, doc, getDocs, updateDoc, addDoc, serverTimestamp, where, deleteDoc, setDoc } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
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
    DollarSign, 
    Coins,
    Building,
    Search,
    X,
    Maximize2,
    Minimize2,
    ChevronLeft,
    ArrowRightLeft,
    ShieldCheck,
    Truck,
    Calculator,
    AlertCircle,
    History,
    Clock,
    User as UserIcon,
    Save,
    Layers,
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
import { 
    DropdownMenu, 
    DropdownMenuContent, 
    DropdownMenuItem, 
    DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/currency-utils';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import NextImage from "next/image";
import { Switch } from './ui/switch';
import { formatDistanceToNow } from 'date-fns';
import { Textarea } from './ui/textarea';

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

    if (left === null || right === null) return { value: null, error: `Missing source` };

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

export function HighfieldPricingWorkspace({ vendor, organisationId }: { vendor: any, organisationId: string }) {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();
    
    const [isFocusMode, setIsFocusMode] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedRanges, setExpandedRanges] = useState<string[]>([]);

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
    const [isFreightManagerOpen, setIsFreightManagerOpen] = useState(false);
    const [isAuditLogOpen, setIsAuditLogOpen] = useState(false);
    
    const [newSectionName, setNewSectionName] = useState('');
    const [newColName, setNewColName] = useState('');
    const [newColType, setNewColType] = useState<CustomColumn['type']>('percent');
    const [isCalculated, setIsCalculated] = useState(false);
    const [formulaLeft, setFormulaLeft] = useState('baseCost');
    const [formulaOp, setFormulaOp] = useState<CustomColumn['formula']['operator']>('+');
    const [formulaRight, setFormulaRight] = useState('');

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

    const handleUpdateValue = async (itemId: string, colId: string, value: any) => {
        const currentValues = strategy?.itemValues || {};
        const oldValue = currentValues[itemId]?.[colId];
        if (String(oldValue || '') === String(value || '')) return;
        
        const updated = { 
            ...currentValues, 
            [itemId]: { ...(currentValues[itemId] || {}), [colId]: value } 
        };
        
        await updateDoc(strategyRef, { itemValues: updated });
        
        try {
            const auditLogRef = collection(firestore, `organisations/${organisationId}/pricingStrategies/${vendor.id}/auditLog`);
            await addDoc(auditLogRef, { 
                itemId, 
                colId, 
                oldValue: oldValue ?? null, 
                newValue: value, 
                timestamp: serverTimestamp(), 
                userId: user?.uid || 'anonymous', 
                userName: user?.displayName || user?.email || 'Anonymous Strategist' 
            });
        } catch (e) { 
            console.error("Audit log failed", e); 
        }
    };

    const handleToggleSectionCollapse = async (sectionId: string) => {
        if (!strategy) return;
        const newSections = (strategy.sections || []).map(s => 
            s.id === sectionId ? { ...s, isCollapsed: !s.isCollapsed } : s
        );
        await updateDoc(strategyRef, { sections: newSections });
    };

    const handleAddSection = async () => {
        if (!newSectionName.trim()) return;
        const currentSections = strategy?.sections || [];
        const newSection: PricingSection = {
            id: `sec-${Date.now()}`,
            name: newSectionName,
            order: currentSections.length,
            columns: []
        };
        await updateDoc(strategyRef, { sections: [...currentSections, newSection] });
        setIsAddSectionOpen(false);
        setNewSectionName('');
    };

    const handleAddColumn = async () => {
        if (!newColName.trim() || !targetSectionId) return;
        const currentSections = strategy?.sections || [];
        const newCol: CustomColumn = {
            id: `col-${Date.now()}`,
            name: newColName,
            type: newColType,
            isCalculated,
            formula: isCalculated ? {
                leftId: formulaLeft,
                operator: formulaOp,
                rightId: isNaN(parseFloat(formulaRight)) ? formulaRight : parseFloat(formulaRight)
            } : undefined
        };

        const updatedSections = currentSections.map(s => 
            s.id === targetSectionId ? { ...s, columns: [...s.columns, newCol] } : s
        );

        await updateDoc(strategyRef, { sections: updatedSections });
        setIsAddColumnOpen(false);
        setNewColName('');
        setIsCalculated(false);
    };

    const toggleRange = (id: string) => setExpandedRanges(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

    const filteredRanges = useMemo(() => {
        if (!ranges) return [];
        if (!searchTerm) return ranges;
        const lower = searchTerm.toLowerCase();
        return ranges.filter(range => 
            range.name.toLowerCase().includes(lower) || 
            allModels.filter(m => m.rangeId === range.id).some(m => m.name.toLowerCase().includes(lower) || m.modelCode?.toLowerCase().includes(lower))
        );
    }, [ranges, searchTerm, allModels]);

    const totalCalculatedCols = useMemo(() => {
        return sortedSections.reduce((acc, sec) => acc + getSectionColCount(sec), 0);
    }, [sortedSections]);

    const WorkspaceHeader = ({ isFocus = false }: { isFocus?: boolean }) => (
        <div className="flex items-center justify-between gap-4 py-4 px-1 shrink-0">
            <div className="flex items-center gap-3">
                <div className="h-8 w-8 bg-primary/10 rounded-lg flex items-center justify-center text-primary shadow-sm">
                    <Calculator className="h-4 w-4" />
                </div>
                <div>
                    <h2 className="text-sm font-black uppercase tracking-widest text-foreground leading-none">Highfield Strategy</h2>
                    <p className="text-[10px] font-black uppercase tracking-tighter text-primary mt-1">Strategic Pricing Workspace</p>
                </div>
            </div>

            <div className="flex items-center gap-3">
                {isFocus && (
                    <>
                        <Button type="button" onClick={() => setIsFreightManagerOpen(true)} variant="outline" className="h-9 px-4 font-black uppercase tracking-widest text-[10px] rounded-xl border-2"><Truck className="h-4 w-4 mr-2" /> Freight</Button>
                        <Button type="button" onClick={() => setIsAuditLogOpen(true)} variant="outline" className="h-9 px-4 font-black uppercase tracking-widest text-[10px] rounded-xl border-2"><History className="h-4 w-4 mr-2" /> History</Button>
                    </>
                )}
                
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button className="h-9 px-6 font-black uppercase tracking-widest text-[10px] shadow-lg rounded-xl">
                            <Plus className="h-4 w-4 mr-2" /> Add
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 rounded-xl border-2 shadow-2xl">
                        <DropdownMenuItem className="font-bold py-3 text-xs uppercase tracking-tighter" onClick={() => setIsAddSectionOpen(true)}>
                            <Layers className="h-4 w-4 mr-2 text-primary" /> New Section
                        </DropdownMenuItem>
                        <DropdownMenuItem className="font-bold py-3 text-xs uppercase tracking-tighter" onClick={() => { setTargetSectionId(sortedSections[0]?.id || null); setIsAddColumnOpen(true); }}>
                            <Calculator className="h-4 w-4 mr-2 text-primary" /> New Metric
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                <Button 
                    type="button"
                    onClick={() => setIsFocusMode(!isFocus)} 
                    variant="outline" 
                    className="h-9 px-4 font-black uppercase tracking-widest text-[10px] rounded-xl border-2"
                >
                    {isFocus ? <Minimize2 className="h-4 w-4 mr-2" /> : <Maximize2 className="h-4 w-4 mr-2" />}
                    Focus Mode
                </Button>
            </div>
        </div>
    );

    const PricingTable = () => (
        <div className="relative w-full h-full overflow-auto bg-white rounded-xl border shadow-inner">
            <Table className="border-separate border-spacing-0 w-full table-fixed">
                <TableHeader className="sticky top-0 z-50 bg-white">
                    <TableRow className="hover:bg-transparent">
                        <TableHead className="w-[300px] sticky left-0 z-[60] bg-white border-r-2 border-b-2 font-black uppercase text-[10px] shadow-[4px_0_10px_-2px_rgba(0,0,0,0.1)] py-4 px-6">
                            Description & SKU
                        </TableHead>
                        {sortedSections.map((sec) => {
                            const colSpan = getSectionColCount(sec);
                            return (
                                <TableHead key={sec.id} colSpan={colSpan} className={cn("border-r border-b-2 p-0 bg-primary/5", sec.isCollapsed ? "w-[60px]" : "")}>
                                    <div className="flex items-center justify-between gap-2 p-2 min-h-[40px]">
                                        <div className="flex items-center gap-2">
                                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleToggleSectionCollapse(sec.id)}>{sec.isCollapsed ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}</Button>
                                            {!sec.isCollapsed && <span className="text-[9px] font-black uppercase tracking-widest text-primary">{sec.name}</span>}
                                        </div>
                                    </div>
                                </TableHead>
                            );
                        })}
                    </TableRow>
                    <TableRow className="hover:bg-transparent">
                        <TableHead className="sticky left-0 z-[60] bg-white border-r-2 border-b font-black uppercase text-[10px] shadow-[4px_0_10px_-2px_rgba(0,0,0,0.1)] h-12 py-0 px-4">
                            <div className="relative">
                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                                <input placeholder="Quick Search..." className="w-full pl-7 bg-muted/20 border rounded h-8 text-[10px] font-bold" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                            </div>
                        </TableHead>
                        {sortedSections.map(sec => {
                            if (sec.isCollapsed) return <TableHead key={`sub-coll-${sec.id}`} className="w-[60px] border-r border-b bg-muted/10" />;
                            if (sec.id === 'sec-exchange') return (
                                <React.Fragment key={sec.id}>
                                    <TableHead className="text-center border-r border-b bg-primary/5 font-black uppercase text-[9px] w-[80px]">Vnd ISO</TableHead>
                                    <TableHead className="text-center border-r border-b bg-primary/5 font-black uppercase text-[9px] w-[100px]">Ex. Rate</TableHead>
                                    <TableHead className="text-center border-r border-b bg-primary/5 font-black uppercase text-[9px] w-[80px]">Org ISO</TableHead>
                                    <TableHead className="text-center border-r border-b bg-primary/5 font-black uppercase text-[9px] w-[100px]">Ex. Rate</TableHead>
                                </React.Fragment>
                            );
                            if (sec.id === 'sec-vendor') {
                                const vndIso = vendor.currency || 'ISO';
                                const orgIso = organisation?.tradingCurrency || 'AUD';
                                return (
                                    <React.Fragment key={sec.id}>
                                        <TableHead className="text-right border-r border-b bg-primary/5 font-black uppercase text-[9px] w-[120px]">BASE PRICE ({vndIso}) $</TableHead>
                                        <TableHead className="text-right border-r border-b bg-primary/5 font-black uppercase text-[9px] w-[120px]">BASE PRICE ({orgIso}) $</TableHead>
                                    </React.Fragment>
                                );
                            }
                            if (sec.id === 'sec-freight') return <TableHead key={sec.id} className="text-right border-r border-b bg-primary/5 font-black uppercase text-[9px] w-[120px]">Packed m³</TableHead>;
                            if (sec.columns.length === 0) return <TableHead key={`empty-${sec.id}`} className="w-[180px] border-r border-b bg-primary/5 text-center text-[8px] font-bold text-muted-foreground uppercase tracking-tighter">Empty Group</TableHead>;
                            return sec.columns.map((col) => (
                                <TableHead key={col.id} className="min-w-[180px] bg-primary/5 text-center px-4 border-r border-b font-black uppercase text-[9px] text-primary">{col.name}</TableHead>
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
                            totalCalculatedCols={totalCalculatedCols}
                        />
                    ))}
                </TableBody>
            </Table>
        </div>
    );

    return (
        <div className="flex flex-col h-full overflow-hidden bg-background">
            <WorkspaceHeader />
            <div className="flex-1 min-h-0 bg-white">
                <PricingTable />
            </div>

            <Dialog open={isFocusMode} onOpenChange={setIsFocusMode}>
                <DialogContent className="max-w-full w-screen h-screen rounded-none p-0 overflow-hidden border-none [&>button]:hidden z-[100]">
                    <DialogTitle className="sr-only">{vendor.name} Full Screen Strategy Matrix</DialogTitle>
                    <div className="flex flex-col h-full bg-background">
                        <div className="p-4 border-b bg-white flex items-center justify-between shrink-0 shadow-sm z-50">
                            <div className="flex items-center gap-3">
                                <div className="h-8 w-8 relative bg-white rounded-lg border p-1 shadow-sm">
                                    {vendor.logoUrl ? <NextImage src={vendor.logoUrl} alt={vendor.name} fill className="object-contain p-1" unoptimized /> : <Building className="h-4 w-4 m-auto mt-1" />}
                                </div>
                                <span className="font-black uppercase text-[11px] tracking-widest">{vendor.name} Strategic Matrix</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <Button type="button" onClick={() => setIsFreightManagerOpen(true)} variant="outline" className="h-9 px-4 font-black uppercase tracking-widest text-[10px] rounded-xl border-2"><Truck className="h-4 w-4 mr-2" /> Freight</Button>
                                <Button type="button" onClick={() => setIsAuditLogOpen(true)} variant="outline" className="h-9 px-4 font-black uppercase tracking-widest text-[10px] rounded-xl border-2"><History className="h-4 w-4 mr-2" /> History</Button>
                                <Button type="button" onClick={() => setIsFocusMode(false)} variant="outline" className="h-9 px-4 font-black uppercase tracking-widest text-[10px] rounded-xl border-2"><Minimize2 className="h-4 w-4 mr-2" /> Exit Focus</Button>
                            </div>
                        </div>
                        <div className="flex-1 min-h-0">
                            <PricingTable />
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <FreightManager organisationId={organisationId} vendorId={vendor.id} isOpen={isFreightManagerOpen} onClose={() => setIsFreightManagerOpen(false)} />
            <AuditLogDialog organisationId={organisationId} vendorId={vendor.id} isOpen={isAuditLogOpen} onClose={() => setIsAuditLogOpen(false)} />
            
            <Dialog open={isAddSectionOpen} onOpenChange={setIsAddSectionOpen}>
                <DialogContent className="rounded-2xl border-4 shadow-2xl">
                    <DialogHeader><DialogTitle className="text-xl font-black uppercase tracking-tight">Create Strategy Section</DialogTitle></DialogHeader>
                    <div className="py-6"><Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Section Name</Label><Input value={newSectionName} onChange={e => setNewSectionName(e.target.value)} className="mt-2 h-12 font-bold text-lg rounded-xl border-2" placeholder="e.g. Regional Margins" /></div>
                    <DialogFooter><Button variant="outline" onClick={() => setIsAddSectionOpen(false)}>Cancel</Button><Button onClick={handleAddSection}>Create</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isAddColumnOpen} onOpenChange={setIsAddColumnOpen}>
                <DialogContent className="sm:max-w-xl rounded-2xl border-4 shadow-2xl">
                    <DialogHeader><DialogTitle className="text-xl font-black uppercase tracking-tight">Metric Configuration</DialogTitle></DialogHeader>
                    <div className="space-y-6 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest">Label</Label><Input value={newColName} onChange={e => setNewColName(e.target.value)} className="font-bold border-2" /></div>
                            <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest">Unit Type</Label><Select value={newColType} onValueChange={(v: any) => setNewColType(v)}><SelectTrigger className="font-bold border-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="percent">Percentage %</SelectItem><SelectItem value="currency">Currency $</SelectItem><SelectItem value="cost">Cost Point</SelectItem><SelectItem value="text">Textual Data</SelectItem></SelectContent></Select></div>
                        </div>
                        <div className="flex items-center justify-between p-4 bg-muted/20 rounded-xl border-2 border-dashed">
                            <div><Label className="text-xs font-black uppercase tracking-tight">Enable Formula Engine</Label></div>
                            <Switch checked={isCalculated} onCheckedChange={setIsCalculated} />
                        </div>
                        {isCalculated && (
                            <div className="grid grid-cols-3 gap-2 animate-in slide-in-from-top-2">
                                <Select value={formulaLeft} onValueChange={setFormulaLeft}><SelectTrigger className="font-bold border-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="baseCost">Base Cost</SelectItem><SelectItem value="masterSell">Master Sell</SelectItem>{allColumns.filter(c => c.id !== targetSectionId).map(c => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}</SelectContent></Select>
                                <Select value={formulaOp} onValueChange={(v: any) => setFormulaOp(v)}><SelectTrigger className="font-black text-lg border-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="+">+</SelectItem><SelectItem value="-">-</SelectItem><SelectItem value="*">×</SelectItem><SelectItem value="/">÷</SelectItem></SelectContent></Select>
                                <Input placeholder="Modifier..." value={formulaRight} onChange={e => setFormulaRight(e.target.value)} className="font-bold border-2" />
                            </div>
                        )}
                    </div>
                    <DialogFooter><Button variant="outline" onClick={() => setIsAddColumnOpen(false)}>Cancel</Button><Button onClick={handleAddColumn}>Commit Metric</Button></DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function RangeSection({ range, models, variants, isExpanded, onToggle, sections, allColumns, strategy, onUpdateValue, vendor, organisation, exchangeRate, totalCalculatedCols }: any) {
    return (
        <>
            <TableRow className="bg-slate-100/80 cursor-pointer group" onClick={onToggle}>
                <TableCell className="sticky left-0 z-[40] bg-slate-100 py-3 px-6 font-black uppercase text-[11px] border-b shadow-[4px_0_10px_-2px_rgba(0,0,0,0.1)]">
                    <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-primary" />}
                        <span>{range.name} RANGE</span>
                    </div>
                </TableCell>
                {Array.from({ length: totalCalculatedCols }).map((_, i) => <TableCell key={i} className="border-b bg-slate-100/50" />)}
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
                    totalCalculatedCols={totalCalculatedCols}
                />
            ))}
        </>
    );
}

function ModelGroup({ model, variants, sections, allColumns, strategy, onUpdateValue, vendor, organisation, exchangeRate, totalCalculatedCols }: any) {
    const [isLocalExpanded, setIsLocalExpanded] = useState(true);
    return (
        <>
            <TableRow className="bg-slate-50 border-l-4 border-l-primary group">
                <TableCell className="sticky left-0 z-[40] bg-slate-50 py-3 px-8 border-b shadow-[4px_0_10px_-2px_rgba(0,0,0,0.1)]">
                    <div className="flex items-center gap-3">
                        <button onClick={(e) => { e.stopPropagation(); setIsLocalExpanded(!isLocalExpanded); }}>
                            {isLocalExpanded ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-primary" />}
                        </button>
                        <span className="font-black text-[11px] uppercase truncate">{model.name}</span>
                        <span className="text-[9px] font-mono text-muted-foreground/60">{model.modelCode || 'NO CODE'}</span>
                    </div>
                </TableCell>
                {Array.from({ length: totalCalculatedCols }).map((_, i) => <TableCell key={i} className="border-b bg-slate-50/50" />)}
            </TableRow>
            {isLocalExpanded && (
                <>
                    <TableRow className="hover:bg-transparent">
                        <TableCell className="sticky left-0 z-[40] bg-white py-1.5 px-12 border-b shadow-[4px_0_10px_-2px_rgba(0,0,0,0.1)]">
                            <div className="flex items-center gap-2">
                                <Ship className="h-3 w-3 text-primary opacity-40" />
                                <span className="text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">Boat Variants</span>
                            </div>
                        </TableCell>
                        {Array.from({ length: totalCalculatedCols }).map((_, i) => <TableCell key={i} className="border-b bg-muted/5" />)}
                    </TableRow>
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
                            <TableRow className="hover:bg-transparent">
                                <TableCell className="sticky left-0 z-[40] bg-white py-1.5 px-12 border-b shadow-[4px_0_10px_-2px_rgba(0,0,0,0.1)]">
                                    <div className="flex items-center gap-2">
                                        <Layers className="h-3 w-3 text-primary opacity-40" />
                                        <span className="text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">Factory Options</span>
                                    </div>
                                </TableCell>
                                {Array.from({ length: totalCalculatedCols }).map((_, i) => <TableCell key={i} className="border-b bg-muted/5" />)}
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

function PricingRow({ id, name, sku, cost, sell, sections, allColumns, strategy, onUpdateValue, indent, isOption, vendor, organisation, exchangeRate, isBoatVariant }: any) {
    const itemValues = strategy?.itemValues?.[id] || {};
    const orgCurrency = organisation?.tradingCurrency || 'AUD';
    const vendorCurrency = vendor.currency || 'ISO';

    return (
        <TableRow className="hover:bg-muted/30 transition-colors group">
            <TableCell className={cn("sticky left-0 z-[40] bg-white py-2.5 border-r border-b shadow-[4px_0_10px_-2px_rgba(0,0,0,0.1)] transition-colors group-hover:bg-slate-50", indent ? "pl-16" : "px-6")}>
                <div className="flex flex-col min-w-0">
                    <span className={cn("font-bold text-[11px] uppercase truncate", isOption ? "text-muted-foreground" : "text-slate-900")}>{name}</span>
                    <span className="text-[9px] font-mono text-muted-foreground/60 uppercase">{sku || 'NO SKU'}</span>
                </div>
            </TableCell>
            {sections.map((sec: any) => {
                if (sec.id === 'sec-exchange') {
                    if (sec.isCollapsed) return <TableCell key={sec.id} className="bg-muted/20 border-r border-b" />;
                    return (
                        <React.Fragment key={sec.id}>
                            <TableCell className="text-center border-r border-b bg-primary/5"><Badge variant="ghost" className="font-black text-[9px] tracking-tighter">{vendorCurrency}</Badge></TableCell>
                            <TableCell className="text-center border-r border-b bg-primary/5 text-[10px] font-mono text-primary/60">{exchangeRate.toFixed(4)}</TableCell>
                            <TableCell className="text-center border-r border-b bg-primary/5"><Badge variant="ghost" className="font-black text-[9px] tracking-tighter">{orgCurrency}</Badge></TableCell>
                            <TableCell className="text-center border-r border-b bg-primary/5 text-[10px] font-mono text-primary/60">1.0000</TableCell>
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
                                <EditableCell id={id} col={{ id: 'base_cost_override', name: 'Base Price', type: 'currency' }} value={costOverride || ''} placeholder={cost ? cost.toFixed(2) : "0.00"} onChange={(val: any) => onUpdateValue(id, 'base_cost_override', val)} align="right" suffix={vendorCurrency} prefix="$" />
                            </TableCell>
                            <TableCell className="text-right text-[11px] font-black text-primary border-r border-b px-4 bg-primary/5">
                                {formatCurrency(convertedCost, orgCurrency)}
                            </TableCell>
                        </React.Fragment>
                    );
                }
                if (sec.id === 'sec-freight') {
                    if (sec.isCollapsed) return <TableCell key={sec.id} className="bg-muted/20 border-r border-b" />;
                    return (
                        <TableCell key={sec.id} className="p-0 border-r border-b bg-primary/5">
                            {isBoatVariant ? <EditableCell id={id} col={{ id: 'packed_m3', name: 'Packed m³', type: 'text' }} value={itemValues['packed_m3'] || ''} onChange={(val: any) => onUpdateValue(id, 'packed_m3', val)} suffix="m³" align="right" /> : <div className="h-full bg-muted/10" />}
                        </TableCell>
                    );
                }
                if (sec.isCollapsed) return <TableCell key={sec.id} className="bg-muted/20 border-r border-b" />;
                if (sec.columns.length === 0) return <TableCell key={`empty-cell-${sec.id}`} className="bg-primary/5 border-r border-b" />;
                return sec.columns.map((col: any) => (
                    <TableCell key={col.id} className="p-0 border-r border-b bg-primary/5">
                        {col.isCalculated ? (
                            <CalculatedCell col={col} baseCost={cost} masterSell={sell} itemValues={itemValues} allCols={allColumns} suffix={col.type === 'currency' || col.type === 'cost' ? orgCurrency : undefined} />
                        ) : (
                            <EditableCell id={id} col={col} value={itemValues[col.id] || ''} onChange={(val: any) => onUpdateValue(id, col.id, val)} suffix={col.type === 'currency' || col.type === 'cost' ? orgCurrency : col.type === 'percent' ? '%' : undefined} prefix={col.type === 'currency' || col.type === 'cost' ? '$' : undefined} />
                        )}
                    </TableCell>
                ));
            })}
        </TableRow>
    );
}

function CalculatedCell({ col, baseCost, masterSell, itemValues, allCols, suffix }: any) {
    const { value, error } = calculateValue(col, baseCost, masterSell, itemValues, allCols);
    return (
        <div className="flex items-center justify-center h-full px-2">
            {error ? <AlertCircle className="h-3 w-3 text-destructive" title={error} /> : (
                <span className="text-[11px] font-black text-primary">
                    {col.type === 'percent' ? `${(Number(value) * 100).toFixed(2)}%` : (col.type === 'currency' || col.type === 'cost') ? `${formatCurrency(Number(value))} ${suffix || ''}` : String(value || '-')}
                </span>
            )}
        </div>
    );
}

function EditableCell({ id, col, value, onChange, placeholder, prefix, suffix, align = 'center' }: any) {
    const [localValue, setLocalValue] = useState(value);
    useEffect(() => { setLocalValue(value); }, [value]);
    const handleBlur = () => { if (String(localValue || '') !== String(value || '')) onChange(localValue); };
    return (
        <div className="relative h-full flex items-center bg-background px-2">
            {prefix && <span className="text-[9px] font-black opacity-40 mr-1">{prefix}</span>}
            <input type={col.type === 'text' ? 'text' : 'number'} className={cn("h-10 w-full bg-transparent border-none text-[11px] font-bold outline-none focus:bg-background", align === 'right' ? "text-right" : "text-center")} value={localValue} onChange={e => setLocalValue(e.target.value)} onBlur={handleBlur} placeholder={placeholder || "-"} />
            {suffix && <span className="text-[9px] font-black opacity-40 ml-1">{suffix}</span>}
        </div>
    );
}

function AuditLogDialog({ organisationId, vendorId, isOpen, onClose }: any) {
    const firestore = useFirestore();
    const logQuery = useMemoFirebase(() => query(collection(firestore, `organisations/${organisationId}/pricingStrategies/${vendorId}/auditLog`), orderBy('timestamp', 'desc')), [firestore, organisationId, vendorId]);
    const { data: logs, loading } = useCollection<any>(logQuery);
    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 overflow-hidden rounded-3xl border-4 shadow-2xl z-[150]">
                <DialogHeader className="p-8 border-b bg-muted/5"><DialogTitle className="text-xl font-black uppercase tracking-tight">Audit Log</DialogTitle></DialogHeader>
                <div className="flex-1 min-h-0">{loading ? (<div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>) : logs && logs.length > 0 ? (<ScrollArea className="h-full"><Table><TableHeader className="bg-muted/5 sticky top-0 z-10"><TableRow><TableHead className="py-4 px-6 text-[10px] font-black uppercase">Timestamp</TableHead><TableHead className="py-4 px-6 text-[10px] font-black uppercase">User</TableHead><TableHead className="py-4 px-6 text-[10px] font-black uppercase">Metric</TableHead><TableHead className="py-4 px-6 text-[10px] font-black uppercase">Old</TableHead><TableHead className="py-4 px-6 text-[10px] font-black uppercase">New</TableHead></TableRow></TableHeader><TableBody>{logs.map((log: any) => (<TableRow key={log.id}><TableCell className="py-4 px-6 text-[10px] font-medium text-muted-foreground">{log.timestamp ? formatDistanceToNow(new Date(log.timestamp.seconds * 1000), { addSuffix: true }) : 'Just now'}</TableCell><TableCell className="py-4 px-6 font-bold text-[11px] uppercase truncate">{log.userName || 'System'}</TableCell><TableCell className="py-4 px-6 font-black text-primary text-[10px]">{log.colId}</TableCell><TableCell className="py-4 px-6 font-mono text-[10px]">{String(log.oldValue ?? '-')}</TableCell><TableCell className="py-4 px-6 font-mono font-black text-primary text-[10px]">{String(log.newValue)}</TableCell></TableRow>))}</TableBody></Table></ScrollArea>) : (<div className="flex items-center justify-center h-full opacity-20"><Clock className="h-16 w-16" /></div>)}</div>
                <DialogFooter className="p-6 border-t bg-muted/5"><DialogClose asChild><Button variant="outline">Close</Button></DialogClose></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function FreightManager({ organisationId, vendorId, isOpen, onClose }: any) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const freightQuery = useMemoFirebase(() => query(collection(firestore, `organisations/${organisationId}/pricingStrategies/${vendorId}/freightContainers`), orderBy('size')), [firestore, organisationId, vendorId]);
    const { data: containers, loading } = useCollection<any>(freightQuery);
    const [isAdding, setIsAdding] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [size, setSize] = useState('');
    const [cost, setCost] = useState('');
    const [cbm, setCbm] = useState('');
    const handleAdd = async () => { if (!size || !cost || !cbm) return; setIsSaving(true); try { const colRef = collection(firestore, `organisations/${organisationId}/pricingStrategies/${vendorId}/freightContainers`); await addDoc(colRef, { size, cost: parseFloat(cost), currency: 'USD', cubicMeters: parseFloat(cbm), updatedAt: serverTimestamp() }); toast({ title: "Container Added" }); setIsAdding(false); setSize(''); setCost(''); setCbm(''); } catch (e) { toast({ variant: 'destructive', title: "Save Failed" }); } finally { setIsSaving(false); } };
    const handleDelete = async (id: string) => { try { await deleteDoc(doc(firestore, `organisations/${organisationId}/pricingStrategies/${vendorId}/freightContainers`, id)); toast({ title: "Container Removed" }); } catch (e) { toast({ variant: 'destructive', title: "Delete Failed" }); } };
    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-0 overflow-hidden rounded-3xl border-4 shadow-2xl">
                <DialogHeader className="p-8 border-b bg-muted/5"><div className="flex items-center justify-between"><div className="flex items-center gap-4"><div className="h-12 w-12 bg-primary/10 text-primary rounded-2xl flex items-center justify-center shadow-inner"><Truck className="h-6 w-6" /></div><div className="space-y-1"><DialogTitle className="text-2xl font-black uppercase tracking-tight">Freight Management</DialogTitle><DialogDescription className="text-[10px] font-black uppercase tracking-widest text-primary">Shipping Containers & Logistics Cost Matrix</DialogDescription></div></div><Button onClick={() => setIsAdding(true)} className="font-black uppercase tracking-widest text-[10px] h-9 px-6 rounded-xl shadow-lg transition-transform hover:scale-105"><Plus className="h-4 w-4 mr-1.5" /> Add Container</Button></div></DialogHeader>
                <div className="flex-1 min-h-0 overflow-hidden">{loading ? (<div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>) : (<ScrollArea className="h-full"><div className="p-8">{isAdding && (<Card className="mb-8 border-2 border-primary/20 bg-primary/5 rounded-2xl overflow-hidden"><CardHeader className="p-6 border-b bg-background"><CardTitle className="text-sm font-black uppercase tracking-widest">Configure New Container</CardTitle></CardHeader><CardContent className="p-6"><div className="grid grid-cols-1 md:grid-cols-3 gap-6"><div className="space-y-2"><Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Container Size</Label><Select value={size} onValueChange={setSize}><SelectTrigger className="h-10 font-bold bg-background"><SelectValue placeholder="Select Size..." /></SelectTrigger><SelectContent><SelectItem value="20ft Standard" className="font-bold">20ft Standard</SelectItem><SelectItem value="40ft Standard" className="font-bold">40ft Standard</SelectItem><SelectItem value="40ft High Cube" className="font-bold">40ft High Cube</SelectItem><SelectItem value="45ft High Cube" className="font-bold">45ft High Cube</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Cubic Capacity (CBM)</Label><Input type="number" value={cbm} onChange={e => setCbm(e.target.value)} className="h-10 font-bold" /></div><div className="space-y-2"><Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Container Cost</Label><Input type="number" value={cost} onChange={e => setCost(e.target.value)} className="h-10 font-bold" /></div></div></CardContent><CardFooter className="p-6 bg-muted/10 border-t flex justify-end gap-3"><Button variant="ghost" onClick={() => setIsAdding(false)}>Cancel</Button><Button onClick={handleAdd} disabled={isSaving || !size || !cost || !cbm}>Add Container</Button></CardFooter></Card>)}<div className="rounded-3xl border-2 overflow-hidden bg-card shadow-sm"><Table><TableHeader className="bg-muted/50 border-b-2"><TableRow><TableHead className="py-5 px-6 font-black uppercase text-[10px] tracking-widest">Container Size</TableHead><TableHead className="py-5 px-6 font-black uppercase text-[10px] tracking-widest text-right">Capacity (CBM)</TableHead><TableHead className="py-5 px-6 font-black uppercase text-[10px] tracking-widest text-right">Total Cost</TableHead><TableHead className="py-5 px-6 font-black uppercase text-[10px] tracking-widest text-center">ISO</TableHead><TableHead className="py-5 px-6 font-black uppercase text-[10px] tracking-widest text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{containers?.map((c: any) => (<TableRow key={c.id}><TableCell className="py-4 px-6 font-black uppercase">{c.size}</TableCell><TableCell className="py-4 px-6 text-right font-bold">{c.cubicMeters} m³</TableCell><TableCell className="py-4 px-6 text-right font-black">{formatCurrency(c.cost, c.currency)}</TableCell><TableCell className="py-4 px-6 text-center"><Badge>{c.currency}</Badge></TableCell><TableCell className="py-4 px-6 text-right"><Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)}><Trash2 className="h-4 w-4" /></Button></TableCell></TableRow>))}</TableBody></Table></div></div></ScrollArea>)}</div>
            </DialogContent>
        </Dialog>
    );
}

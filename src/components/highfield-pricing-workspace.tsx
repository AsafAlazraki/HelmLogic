'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useCollection, useDoc, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, orderBy, doc, getDocs, updateDoc, addDoc, serverTimestamp, where, deleteDoc } from 'firebase/firestore';
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
    Coins,
    Building,
    Search,
    X,
    Maximize2,
    Minimize2,
    Truck,
    Calculator,
    AlertCircle,
    History,
    Clock,
    Save,
    Layers,
    ArrowRightLeft,
    CheckCircle2,
    LayoutList,
    FoldVertical,
    UnfoldVertical
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
import { ScrollArea } from './ui/scroll-area';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/currency-utils';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import NextImage from "next/image";
import { Switch } from './ui/switch';
import { formatDistanceToNow } from 'date-fns';
import { Textarea } from './ui/textarea';
import { Separator } from './ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

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
    lastUpdateAt?: any;
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
            if (right === 0) return { value: null, error: 'Div/0' };
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
                'sec-exchange': { id: 'sec-exchange', name: 'EXCHANGE', order: 0, columns: [] },
                'sec-vendor': { id: 'sec-vendor', name: 'VENDOR', order: 1, columns: [] },
                'sec-freight': { id: 'sec-freight', name: 'FREIGHT', order: 2, columns: [] },
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
            setAllModels([]);
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
        const updated = { 
            ...currentValues, 
            [itemId]: { ...(currentValues[itemId] || {}), [colId]: value } 
        };
        await updateDoc(strategyRef, { 
            itemValues: updated,
            lastUpdateAt: serverTimestamp()
        });
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
            name: newSectionName.toUpperCase(),
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
    
    const expandAllRanges = () => {
        if (ranges) setExpandedRanges(ranges.map(r => r.id));
    };
    
    const collapseAllRanges = () => {
        setExpandedRanges([]);
    };

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
        <div className="flex items-center justify-between gap-4 py-4 px-8 shrink-0 bg-white border-b">
            <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary shadow-sm">
                    <Calculator className="h-5 w-5" />
                </div>
                <div>
                    <div className="flex items-center gap-2">
                        <h2 className="text-base font-black uppercase tracking-widest text-foreground leading-none">
                            HIGHFIELD STRATEGIC WORKSPACE
                        </h2>
                        {strategy?.lastUpdateAt && (
                            <div className="flex items-center gap-1.5 ml-2 px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 text-[8px] font-black uppercase tracking-tighter">
                                <CheckCircle2 className="h-2.5 w-2.5" />
                                STRATEGIC SYNC: {formatDistanceToNow(new Date(strategy.lastUpdateAt.seconds * 1000), { addSuffix: true })}
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                        <Badge variant="outline" className="text-[8px] h-4 font-black uppercase bg-primary/5 text-primary border-primary/10">PRECISION MODE ENABLED</Badge>
                        <Badge variant="outline" className="text-[8px] h-4 font-black uppercase bg-muted/50 text-muted-foreground">{vendor.currency || 'USD'} BASE</Badge>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-3">
                <div className="flex items-center bg-muted/50 rounded-xl p-1 border-2 border-dashed mr-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:bg-primary/10" onClick={expandAllRanges} title="Expand All Groups">
                        <UnfoldVertical className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:bg-primary/10" onClick={collapseAllRanges} title="Collapse All Groups">
                        <FoldVertical className="h-4 w-4" />
                    </Button>
                </div>

                {isFocus ? (
                    <>
                        <Button type="button" onClick={() => setIsFreightManagerOpen(true)} variant="outline" size="sm" className="h-10 px-4 font-black uppercase tracking-widest text-[10px] rounded-xl border-2 hover:bg-primary hover:text-white transition-all group">
                            <Truck className="h-4 w-4 mr-2 text-primary group-hover:text-white transition-colors" /> FREIGHT
                        </Button>
                        <Button type="button" onClick={() => setIsAuditLogOpen(true)} variant="outline" size="sm" className="h-10 px-4 font-black uppercase tracking-widest text-[10px] rounded-xl border-2 hover:bg-primary hover:text-white transition-all group">
                            <History className="h-4 w-4 mr-2 text-primary group-hover:text-white transition-colors" /> AUDIT
                        </Button>
                        <Separator orientation="vertical" className="h-8 mx-2" />
                        <Button type="button" onClick={() => setIsFocusMode(false)} variant="outline" size="sm" className="h-10 px-4 font-black uppercase tracking-widest text-[10px] rounded-xl border-2 hover:bg-slate-100"><Minimize2 className="h-4 w-4 mr-2" /> EXIT FOCUS</Button>
                    </>
                ) : (
                    <>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button size="sm" className="h-10 px-6 font-black uppercase tracking-widest text-[10px] shadow-lg rounded-xl active:scale-95 transition-transform">
                                    <Plus className="h-4 w-4 mr-2" /> ADD
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 rounded-xl border-2 shadow-2xl p-1">
                                <DropdownMenuItem className="font-bold py-3 text-xs uppercase tracking-tighter cursor-pointer focus:bg-primary/5 focus:text-primary rounded-lg" onClick={() => setIsAddSectionOpen(true)}>
                                    <Layers className="h-4 w-4 mr-3" /> Section
                                </DropdownMenuItem>
                                <DropdownMenuItem className="font-bold py-3 text-xs uppercase tracking-tighter cursor-pointer focus:bg-primary/5 focus:text-primary rounded-lg" onClick={() => { setTargetSectionId(sortedSections[0]?.id || null); setIsAddColumnOpen(true); }}>
                                    <Calculator className="h-4 w-4 mr-3" /> Column
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <Button 
                            type="button"
                            onClick={() => setIsFocusMode(true)} 
                            variant="outline" 
                            size="sm"
                            className="h-10 px-4 font-black uppercase tracking-widest text-[10px] rounded-xl border-2 bg-white hover:bg-slate-50 shadow-sm"
                        >
                            <Maximize2 className="h-4 w-4 mr-2" />
                            FOCUS
                        </Button>
                    </>
                )}
            </div>
        </div>
    );

    const PricingTable = () => (
        <div className="relative w-full h-full overflow-hidden bg-white flex flex-col">
            <div className="flex-1 min-h-0 overflow-auto scrollbar-thin scrollbar-thumb-slate-200">
                <Table className="border-separate border-spacing-0 w-max table-fixed min-w-full">
                    <TableHeader className="sticky top-0 z-50 bg-white">
                        <TableRow className="hover:bg-transparent">
                            <TableHead className="w-[340px] sticky left-0 z-[60] bg-white border-r border-b-2 font-black uppercase text-[10px] shadow-[2px_0_10px_-2px_rgba(0,0,0,0.05)] py-5 px-8">
                                SERIES DESCRIPTION & SKU
                            </TableHead>
                            {sortedSections.map((sec) => {
                                const colSpan = getSectionColCount(sec);
                                return (
                                    <TableHead key={sec.id} colSpan={colSpan} className={cn("border-r border-b-2 p-0 bg-slate-50/50 transition-colors", sec.isCollapsed ? "w-[60px]" : "")}>
                                        <div className="flex items-center justify-between gap-2 p-3 min-h-[48px]">
                                            <div className="flex items-center gap-3">
                                                <Button 
                                                    type="button" 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="h-7 w-7 rounded-lg hover:bg-primary/10 text-primary transition-all" 
                                                    onClick={() => handleToggleSectionCollapse(sec.id)}
                                                >
                                                    {sec.isCollapsed ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
                                                </Button>
                                                {!sec.isCollapsed && <span className="text-[10px] font-black uppercase tracking-[0.15em] text-primary">{sec.name}</span>}
                                            </div>
                                        </div>
                                    </TableHead>
                                );
                            })}
                        </TableRow>
                        <TableRow className="hover:bg-transparent bg-white">
                            <TableHead className="sticky left-0 z-[60] bg-white border-r border-b font-black uppercase text-[10px] shadow-[2px_0_10px_-2px_rgba(0,0,0,0.05)] h-14 py-0 px-6">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
                                    <input 
                                        placeholder="Filter Workspace..." 
                                        className="w-full pl-9 h-10 bg-muted/20 border rounded-xl text-[11px] font-bold focus:outline-none focus:border-primary/30 transition-all" 
                                        value={searchTerm} 
                                        onChange={e => setSearchTerm(e.target.value)} 
                                    />
                                </div>
                            </TableHead>
                            {sortedSections.map(sec => {
                                if (sec.isCollapsed) return <TableHead key={`sub-coll-${sec.id}`} className="w-[60px] border-r border-b bg-muted/5 transition-all" />;
                                if (sec.id === 'sec-exchange') return (
                                    <React.Fragment key={sec.id}>
                                        <TableHead className="text-center border-r border-b bg-slate-50/30 font-black uppercase text-[9px] tracking-tight w-[80px]">VND ISO</TableHead>
                                        <TableHead className="text-center border-r border-b bg-slate-50/30 font-black uppercase text-[9px] tracking-tight w-[100px]">EX. RATE</TableHead>
                                        <TableHead className="text-center border-r border-b bg-slate-50/30 font-black uppercase text-[9px] tracking-tight w-[80px]">ORG ISO</TableHead>
                                        <TableHead className="text-center border-r border-b bg-slate-50/30 font-black uppercase text-[9px] tracking-tight w-[100px]">EX. RATE</TableHead>
                                    </React.Fragment>
                                );
                                if (sec.id === 'sec-vendor') {
                                    const vndIso = vendor.currency || 'USD';
                                    const orgIso = organisation?.tradingCurrency || 'AUD';
                                    return (
                                        <React.Fragment key={sec.id}>
                                            <TableHead className="text-right border-r border-b bg-slate-50/30 font-black uppercase text-[9px] tracking-tight w-[120px]">BASE ({vndIso}) $</TableHead>
                                            <TableHead className="text-right border-r border-b bg-slate-50/30 font-black uppercase text-[9px] tracking-tight w-[120px]">BASE ({orgIso}) $</TableHead>
                                        </React.Fragment>
                                    );
                                }
                                if (sec.id === 'sec-freight') return <TableHead key={sec.id} className="text-right border-r border-b bg-slate-50/30 font-black uppercase text-[9px] tracking-tight w-[160px]">PACKED M³</TableHead>;
                                if (sec.columns.length === 0) return <TableHead key={`empty-${sec.id}`} className="w-[180px] border-r border-b bg-slate-50/30 text-center text-[8px] font-bold text-muted-foreground/40 uppercase tracking-tighter italic">EMPTY SEGMENT</TableHead>;
                                return sec.columns.map((col) => (
                                    <TableHead key={col.id} className="min-w-[180px] bg-slate-50/30 text-center px-4 border-r border-b font-black uppercase text-[9px] tracking-tight text-primary/70">{col.name}</TableHead>
                                ));
                            })}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredRanges.length > 0 ? filteredRanges.map(range => (
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
                        )) : (
                            <TableRow>
                                <TableCell colSpan={totalCalculatedCols + 1} className="h-64 text-center">
                                    <div className="flex flex-col items-center justify-center opacity-20">
                                        <Search className="h-12 w-12 mb-4" />
                                        <p className="font-black uppercase tracking-widest text-xs">NO RECORDS MATCHING SEARCH</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <WorkspaceHeader />
            <div className="flex-1 min-h-0">
                <PricingTable />
            </div>

            <Dialog open={isFocusMode} onOpenChange={setIsFocusMode}>
                <DialogContent className="max-w-[98vw] w-[1600px] h-[95vh] rounded-[2.5rem] p-0 overflow-hidden border-4 shadow-2xl flex flex-col [&>button]:hidden">
                    <DialogHeader className="sr-only"><DialogTitle>Financial Matrix Focus Mode</DialogTitle></DialogHeader>
                    <div className="flex flex-col h-full bg-background">
                        <WorkspaceHeader isFocus />
                        <div className="flex-1 min-h-0 bg-white p-0">
                            <PricingTable />
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <FreightManager organisationId={organisationId} vendorId={vendor.id} isOpen={isFreightManagerOpen} onClose={() => setIsFreightManagerOpen(false)} />
            <AuditLogDialog organisationId={organisationId} vendorId={vendor.id} isOpen={isAuditLogOpen} onClose={() => setIsAuditLogOpen(false)} />
            
            <Dialog open={isAddSectionOpen} onOpenChange={setIsAddSectionOpen}>
                <DialogContent className="rounded-[2.5rem] border-4 shadow-2xl p-0 overflow-hidden">
                    <DialogHeader className="p-8 bg-muted/5 border-b">
                        <DialogTitle className="text-2xl font-black uppercase tracking-tight">Create Strategy Section</DialogTitle>
                        <DialogDescription className="text-[10px] font-black uppercase text-primary tracking-widest mt-1">Define an operational group for specific metrics.</DialogDescription>
                    </DialogHeader>
                    <div className="p-8">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Section Label</Label>
                        <Input value={newSectionName} onChange={e => setNewSectionName(e.target.value)} className="mt-3 h-14 font-black text-xl rounded-2xl border-2 shadow-inner px-6" placeholder="e.g. REGIONAL TARIFFS" />
                    </div>
                    <DialogFooter className="p-8 bg-muted/5 border-t gap-3">
                        <Button variant="outline" onClick={() => setIsAddSectionOpen(false)} className="h-12 px-8 rounded-xl font-black uppercase text-[10px]">Cancel</Button>
                        <Button onClick={handleAddSection} className="h-12 px-10 rounded-xl font-black uppercase text-[10px] shadow-xl">Initialize Section</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isAddColumnOpen} onOpenChange={setIsAddColumnOpen}>
                <DialogContent className="sm:max-w-xl rounded-[2.5rem] border-4 shadow-2xl p-0 overflow-hidden">
                    <DialogHeader className="p-8 bg-muted/5 border-b">
                        <DialogTitle className="text-2xl font-black uppercase tracking-tight">Metric Configuration</DialogTitle>
                        <DialogDescription className="text-[10px] font-black uppercase text-primary tracking-widest mt-1">Configure automated calculations or manual data points.</DialogDescription>
                    </DialogHeader>
                    <div className="p-8 space-y-8">
                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2.5">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70 ml-1">Metric Label</Label>
                                <Input value={newColName} onChange={e => setNewColName(e.target.value)} className="h-12 font-bold text-sm border-2 rounded-xl bg-background shadow-inner" placeholder="e.g. Duty Modifier" />
                            </div>
                            <div className="space-y-2.5">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70 ml-1">Unit of Measure</Label>
                                <Select value={newColType} onValueChange={(v: any) => setNewColType(v)}>
                                    <SelectTrigger className="h-12 font-bold text-sm border-2 rounded-xl">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl border-2">
                                        <SelectItem value="percent" className="font-bold py-2.5">Percentage %</SelectItem>
                                        <SelectItem value="currency" className="font-bold py-2.5">Currency $</SelectItem>
                                        <SelectItem value="cost" className="font-bold py-2.5">Direct Cost Point</SelectItem>
                                        <SelectItem value="text" className="font-bold py-2.5">Textual Reference</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="flex items-center justify-between p-5 bg-primary/5 rounded-[1.5rem] border-2 border-dashed border-primary/20">
                            <div className="space-y-0.5">
                                <Label className="text-xs font-black uppercase tracking-tight text-primary">Calculation Type</Label>
                                <p className="text-[9px] font-bold text-muted-foreground uppercase">{isCalculated ? 'Automated Formula Engine' : 'Manual Entry Data Point'}</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className={cn("text-[10px] font-black uppercase tracking-tighter transition-opacity", !isCalculated ? "text-primary" : "opacity-30")}>Manual</span>
                                <Switch checked={isCalculated} onCheckedChange={setIsCalculated} />
                                <span className={cn("text-[10px] font-black uppercase tracking-tighter transition-opacity", isCalculated ? "text-primary" : "opacity-30")}>Calculated</span>
                            </div>
                        </div>
                        {isCalculated && (
                            <div className="grid grid-cols-3 gap-3 animate-in slide-in-from-top-2 p-1">
                                <Select value={formulaLeft} onValueChange={setFormulaLeft}>
                                    <SelectTrigger className="h-12 font-bold border-2 rounded-xl shadow-sm">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl border-2">
                                        <SelectItem value="baseCost" className="font-bold">Base Cost</SelectItem>
                                        <SelectItem value="masterSell" className="font-bold">Master Sell</SelectItem>
                                        {allColumns.filter(c => c.id !== targetSectionId).map(c => (
                                            <SelectItem key={c.id} value={c.id} className="font-bold">{c.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Select value={formulaOp} onValueChange={(v: any) => setFormulaOp(v)}>
                                    <SelectTrigger className="h-12 font-black text-xl border-2 rounded-xl shadow-sm text-primary">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl border-2">
                                        <SelectItem value="+" className="font-black text-lg">+</SelectItem>
                                        <SelectItem value="-" className="font-black text-lg">-</SelectItem>
                                        <SelectItem value="*" className="font-black text-lg">×</SelectItem>
                                        <SelectItem value="/" className="font-black text-lg">÷</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Input 
                                    placeholder="Modifier..." 
                                    value={formulaRight} 
                                    onChange={e => setFormulaRight(e.target.value)} 
                                    className="h-12 font-bold border-2 rounded-xl shadow-inner text-center" 
                                />
                            </div>
                        )}
                    </div>
                    <DialogFooter className="p-8 bg-muted/5 border-t gap-3">
                        <Button variant="outline" onClick={() => setIsAddColumnOpen(false)} className="h-12 px-8 rounded-xl font-black uppercase text-[10px]">Cancel</Button>
                        <Button onClick={handleAddColumn} className="h-12 px-10 rounded-xl font-black uppercase text-[10px] shadow-xl">Commit Metric</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function RangeSection({ range, models, variants, isExpanded, onToggle, sections, allColumns, strategy, onUpdateValue, vendor, organisation, exchangeRate, totalCalculatedCols }: any) {
    return (
        <>
            <TableRow className="bg-slate-100 border-b border-slate-200 cursor-pointer group transition-colors hover:bg-slate-200/50" onClick={onToggle}>
                <TableCell className="sticky left-0 z-[40] bg-slate-100 py-4 px-8 font-black uppercase text-[11px] tracking-[0.1em] text-slate-900 border-r border-b shadow-[2px_0_10px_-2px_rgba(0,0,0,0.05)]">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className={cn("h-6 w-6 rounded-lg bg-white border flex items-center justify-center transition-transform duration-300", isExpanded && "rotate-90 shadow-sm")}>
                                <ChevronRight className="h-4 w-4 text-primary" />
                            </div>
                            <span>{range.name} RANGE</span>
                        </div>
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[9px] font-black h-5 px-2 uppercase tracking-tighter">
                            {models.length} SERIES
                        </Badge>
                    </div>
                </TableCell>
                {Array.from({ length: totalCalculatedCols }).map((_, i) => <TableCell key={i} className="border-b bg-slate-100/40" />)}
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
            <TableRow className="bg-slate-50/80 border-l-8 border-l-primary group/model">
                <TableCell className="sticky left-0 z-[40] bg-slate-50 py-3.5 px-10 border-r border-b-2 border-white shadow-[2px_0_10px_-2px_rgba(0,0,0,0.05)]">
                    <div className="flex items-center gap-4">
                        <button 
                            type="button"
                            className="h-7 w-7 rounded-lg hover:bg-primary/10 flex items-center justify-center transition-all text-primary border bg-white"
                            onClick={(e) => { e.stopPropagation(); setIsLocalExpanded(!isLocalExpanded); }}
                        >
                            {isLocalExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                        <div className="flex flex-col min-w-0">
                            <span className="font-black text-[11px] uppercase tracking-tight truncate leading-none mb-1 text-slate-900">{model.name}</span>
                            <span className="text-[8px] font-black text-primary/60 uppercase tracking-[0.2em]">SKU: {model.modelCode || 'NO-SKU'}</span>
                        </div>
                    </div>
                </TableCell>
                {Array.from({ length: totalCalculatedCols }).map((_, i) => <TableCell key={i} className="border-b-2 border-white bg-slate-50/50" />)}
            </TableRow>
            {isLocalExpanded && (
                <>
                    {variants.map((v: any, idx: number) => (
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
                            rowIndex={idx}
                        />
                    ))}

                    {model.optionalFeatures && model.optionalFeatures.length > 0 && (
                        <>
                            <TableRow className="hover:bg-transparent">
                                <TableCell className="sticky left-0 z-[40] bg-white py-2 px-14 border-r border-b border-dashed shadow-[2px_0_10px_-2px_rgba(0,0,0,0.05)]">
                                    <div className="flex items-center gap-2.5">
                                        <Badge className="h-1.5 w-1.5 rounded-full bg-orange-500/40 p-0" />
                                        <span className="text-[9px] font-black uppercase tracking-[0.25em] text-muted-foreground/40">OPTIONS</span>
                                    </div>
                                </TableCell>
                                {Array.from({ length: totalCalculatedCols }).map((_, i) => <TableCell key={i} className="border-b border-dashed bg-muted/5" />)}
                            </TableRow>
                            {model.optionalFeatures.map((f: any, idx: number) => (
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
                                    rowIndex={idx}
                                />
                            ))}
                        </>
                    )}
                </>
            )}
        </>
    );
}

function PricingRow({ id, name, sku, cost, sell, sections, allColumns, strategy, onUpdateValue, indent, isOption, vendor, organisation, exchangeRate, isBoatVariant, rowIndex }: any) {
    const itemValues = strategy?.itemValues?.[id] || {};
    const orgCurrency = organisation?.tradingCurrency || 'AUD';
    const vendorCurrency = vendor.currency || 'USD';
    
    const rowBgClass = rowIndex % 2 === 0 ? "bg-white" : "bg-slate-50/20";

    return (
        <TableRow className={cn("transition-colors group", rowBgClass)}>
            <TableCell className={cn("sticky left-0 z-[40] border-r border-b shadow-[2px_0_10px_-2px_rgba(0,0,0,0.05)] transition-colors group-hover:bg-primary/[0.02]", rowBgClass, indent ? "pl-20" : "px-8")}>
                <div className="flex flex-col min-w-0">
                    <span className={cn("font-bold text-[11px] uppercase truncate tracking-tight mb-0.5", isOption ? "text-muted-foreground/80" : "text-slate-900")}>
                        {name}
                    </span>
                    <div className="flex items-center gap-2">
                        <span className="text-[9px] font-mono font-bold text-muted-foreground/40 uppercase tracking-tighter">{sku || 'NO SKU'}</span>
                        {isOption && <Badge className="text-[7px] font-black h-3 px-1 bg-muted text-muted-foreground border-none">OPT</Badge>}
                    </div>
                </div>
            </TableCell>
            {sections.map((sec: any) => {
                if (sec.id === 'sec-exchange') {
                    if (sec.isCollapsed) return <TableCell key={sec.id} className="bg-muted/5 border-r border-b" />;
                    return (
                        <React.Fragment key={sec.id}>
                            <TableCell className="text-center border-r border-b bg-slate-50/10"><Badge variant="ghost" className="font-black text-[9px] tracking-tighter opacity-30">{vendorCurrency}</Badge></TableCell>
                            <TableCell className="text-center border-r border-b bg-slate-50/10 text-[10px] font-mono text-primary/30">{exchangeRate.toFixed(4)}</TableCell>
                            <TableCell className="text-center border-r border-b bg-slate-50/10"><Badge variant="ghost" className="font-black text-[9px] tracking-tighter opacity-30">{orgCurrency}</Badge></TableCell>
                            <TableCell className="text-center border-r border-b bg-slate-50/10 text-[10px] font-mono text-primary/30">1.0000</TableCell>
                        </React.Fragment>
                    );
                }
                if (sec.id === 'sec-vendor') {
                    if (sec.isCollapsed) return <TableCell key={sec.id} className="bg-muted/5 border-r border-b" />;
                    const costOverride = itemValues['base_cost_override'];
                    const effectiveCost = (costOverride !== undefined && costOverride !== '' && costOverride !== null) ? parseFloat(costOverride) : cost;
                    const convertedCost = (effectiveCost || 0) * (exchangeRate || 1);
                    return (
                        <React.Fragment key={sec.id}>
                            <TableCell className="p-0 border-r border-b">
                                <EditableCell 
                                    id={id} 
                                    col={{ id: 'base_cost_override', name: 'Base Price', type: 'currency' }} 
                                    value={costOverride || ''} 
                                    placeholder={cost ? cost.toFixed(2) : "0.00"} 
                                    onChange={(val: any) => onUpdateValue(id, 'base_cost_override', val)} 
                                    align="right" 
                                    suffix={vendorCurrency} 
                                    prefix="$" 
                                />
                            </TableCell>
                            <TableCell className="text-right text-[11px] font-black text-primary border-r border-b px-5 bg-primary/[0.01]">
                                {formatCurrency(convertedCost, orgCurrency)}
                            </TableCell>
                        </React.Fragment>
                    );
                }
                if (sec.id === 'sec-freight') {
                    if (sec.isCollapsed) return <TableCell key={sec.id} className="bg-muted/5 border-r border-b" />;
                    return (
                        <TableCell key={sec.id} className="p-0 border-r border-b">
                            {isBoatVariant ? <EditableCell id={id} col={{ id: 'packed_m3', name: 'Packed m³', type: 'text' }} value={itemValues['packed_m3'] || ''} onChange={(val: any) => onUpdateValue(id, 'packed_m3', val)} suffix="m³" align="right" /> : <div className="h-full bg-muted/5" />}
                        </TableCell>
                    );
                }
                if (sec.isCollapsed) return <TableCell key={sec.id} className="bg-muted/5 border-r border-b" />;
                if (sec.columns.length === 0) return <TableCell key={`empty-cell-${sec.id}`} className="bg-muted/5 border-r border-b" />;
                return sec.columns.map((col: any) => (
                    <TableCell key={col.id} className="p-0 border-r border-b">
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
        <div className="flex items-center justify-center h-full px-2 bg-primary/[0.01] group/calc">
            {error ? (
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger type="button"><AlertCircle className="h-3.5 w-3.5 text-destructive/30" /></TooltipTrigger>
                        <TooltipContent className="bg-destructive text-white border-none font-bold text-[10px] uppercase">{error}</TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            ) : (
                <div className="flex items-center gap-1.5">
                    <div className="h-1 w-1 rounded-full bg-primary/20 shrink-0" />
                    <span className="text-[11px] font-black text-primary/80 tracking-tight">
                        {col.type === 'percent' ? `${(Number(value) * 100).toFixed(2)}%` : (col.type === 'currency' || col.type === 'cost') ? `${formatCurrency(Number(value))} ${suffix || ''}` : String(value || '-')}
                    </span>
                </div>
            )}
        </div>
    );
}

function EditableCell({ id, col, value, onChange, placeholder, prefix, suffix, align = 'center' }: any) {
    const [localValue, setLocalValue] = useState(value);
    const [isChanged, setIsChanged] = useState(false);
    
    useEffect(() => { 
        setLocalValue(value); 
        setIsChanged(value !== undefined && value !== '' && value !== null);
    }, [value]);

    const handleBlur = () => { if (String(localValue || '') !== String(value || '')) onChange(localValue); };
    
    return (
        <div className={cn("relative h-full flex items-center px-2 group/edit transition-colors", isChanged ? "bg-amber-500/[0.02]" : "bg-transparent")}>
            {prefix && <span className="text-[9px] font-black text-muted-foreground/20 mr-1.5 select-none">{prefix}</span>}
            <input 
                type={col.type === 'text' ? 'text' : 'number'} 
                className={cn(
                    "h-10 w-full bg-transparent border-none text-[11px] font-bold outline-none transition-all placeholder:text-muted-foreground/10 rounded focus:bg-white focus:ring-2 focus:ring-primary/10 focus:px-3 focus:shadow-sm focus:z-10",
                    align === 'right' ? "text-right" : "text-center",
                    isChanged ? "text-primary" : "text-foreground"
                )} 
                value={localValue} 
                onChange={e => setLocalValue(e.target.value)} 
                onBlur={handleBlur} 
                placeholder={placeholder || "-"} 
            />
            {suffix && <span className="text-[9px] font-black text-muted-foreground/20 ml-1.5 select-none">{suffix}</span>}
            {isChanged && <div className="absolute top-1 right-1 h-1 w-1 rounded-full bg-primary/30" />}
        </div>
    );
}

function AuditLogDialog({ organisationId, vendorId, isOpen, onClose }: any) {
    const firestore = useFirestore();
    const logQuery = useMemoFirebase(() => query(collection(firestore, `organisations/${organisationId}/pricingStrategies/${vendorId}/auditLog`), orderBy('timestamp', 'desc')), [firestore, organisationId, vendorId]);
    const { data: logs, loading } = useCollection<any>(logQuery);
    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 overflow-hidden rounded-[3rem] border-4 shadow-2xl z-[150]">
                <DialogHeader className="p-10 border-b bg-muted/5 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="h-12 w-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shadow-inner">
                            <History className="h-6 w-6" />
                        </div>
                        <div>
                            <DialogTitle className="text-2xl font-black uppercase tracking-tight">TACTICAL AUDIT</DialogTitle>
                            <DialogDescription className="text-[10px] font-black uppercase text-primary tracking-[0.2em] mt-1">Strategic Price Change Verification History</DialogDescription>
                        </div>
                    </div>
                </DialogHeader>
                <div className="flex-1 min-h-0 bg-white">
                    {loading ? (
                        <div className="flex h-full items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
                    ) : logs && logs.length > 0 ? (
                        <ScrollArea className="h-full">
                            <Table className="border-separate border-spacing-0">
                                <TableHeader className="bg-slate-50 sticky top-0 z-10">
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="py-5 px-10 border-b-2 font-black uppercase text-[10px] tracking-widest w-[220px]">Timestamp</TableHead>
                                        <TableHead className="py-5 px-6 border-b-2 font-black uppercase text-[10px] tracking-widest w-[180px]">Operational User</TableHead>
                                        <TableHead className="py-5 px-6 border-b-2 font-black uppercase text-[10px] tracking-widest">Financial Metric</TableHead>
                                        <TableHead className="py-5 px-6 border-b-2 font-black uppercase text-[10px] tracking-widest text-right">Previous</TableHead>
                                        <TableHead className="py-5 px-10 border-b-2 font-black uppercase text-[10px] tracking-widest text-right">Amended</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {logs.map((log: any) => (
                                        <TableRow key={log.id} className="hover:bg-slate-50 transition-colors">
                                            <TableCell className="py-5 px-10 border-b border-dashed">
                                                <div className="flex items-center gap-3 text-muted-foreground">
                                                    <Clock className="h-3.5 w-3.5 opacity-40" />
                                                    <span className="text-[11px] font-black uppercase tracking-tighter">
                                                        {log.timestamp ? formatDistanceToNow(new Date(log.timestamp.seconds * 1000), { addSuffix: true }) : 'Just now'}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-5 px-6 border-b border-dashed">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-7 w-7 rounded-full bg-slate-100 border flex items-center justify-center text-slate-400 font-black text-[10px] uppercase">
                                                        {log.userName?.[0] || 'S'}
                                                    </div>
                                                    <span className="font-bold text-[11px] uppercase tracking-tight truncate">{log.userName || 'System Auto'}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-5 px-6 border-b border-dashed">
                                                <Badge variant="outline" className="h-6 px-3 bg-primary/5 text-primary border-primary/10 font-black uppercase text-[9px] tracking-widest">{log.colId}</Badge>
                                            </TableCell>
                                            <TableCell className="py-5 px-6 border-b border-dashed text-right font-mono text-[11px] opacity-40 italic">{String(log.oldValue ?? '-')}</TableCell>
                                            <TableCell className="py-5 px-10 border-b border-dashed text-right">
                                                <span className="font-mono font-black text-[12px] text-primary">{String(log.newValue)}</span>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full opacity-10 grayscale scale-150">
                            <Clock className="h-24 w-24 mb-4" />
                            <p className="font-black uppercase tracking-[0.4em] text-sm">Audit Void</p>
                        </div>
                    )}
                </div>
                <DialogFooter className="p-8 border-t bg-muted/5">
                    <DialogClose asChild><Button variant="outline" className="h-12 px-8 font-black uppercase text-[10px] tracking-widest rounded-2xl border-2">Close</Button></DialogClose>
                </DialogFooter>
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
            <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-[3rem] border-4 shadow-2xl">
                <DialogHeader className="p-10 border-b bg-muted/5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-5">
                            <div className="h-12 w-12 bg-primary/10 text-primary rounded-2xl flex items-center justify-center shadow-inner">
                                <Truck className="h-6 w-6" />
                            </div>
                            <div>
                                <DialogTitle className="text-2xl font-black uppercase tracking-tight">FREIGHT</DialogTitle>
                                <DialogDescription className="text-[10px] font-black uppercase tracking-widest text-primary mt-1">Shipping Containers & Global Transportation Cost Controls</DialogDescription>
                            </div>
                        </div>
                        <Button onClick={() => setIsAdding(true)} className="font-black uppercase tracking-widest text-[10px] h-12 px-8 rounded-2xl shadow-2xl transition-transform hover:scale-105 active:scale-95">
                            <Plus className="h-4 w-4 mr-2" /> Add Container
                        </Button>
                    </div>
                </DialogHeader>
                <div className="flex-1 min-h-0 bg-white p-10 overflow-hidden">
                    {loading ? (
                        <div className="flex h-full items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
                    ) : (
                        <ScrollArea className="h-full pr-4">
                            <div className="space-y-10">
                                {isAdding && (
                                    <Card className="border-4 border-primary/20 bg-primary/5 rounded-3xl overflow-hidden animate-in slide-in-from-top-4 duration-500">
                                        <CardHeader className="p-8 border-b bg-white/50">
                                            <CardTitle className="text-sm font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                                                <Layers className="h-4 w-4" />
                                                Configure New Container
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="p-10">
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                                                <div className="space-y-3">
                                                    <Label className="text-[10px] font-black uppercase text-muted-foreground/60 ml-1 tracking-widest">Container Standard</Label>
                                                    <Select value={size} onValueChange={setSize}>
                                                        <SelectTrigger className="h-14 font-black text-sm border-2 rounded-2xl bg-white shadow-sm">
                                                            <SelectValue placeholder="Select Dimension..." />
                                                        </SelectTrigger>
                                                        <SelectContent className="rounded-2xl border-2">
                                                            <SelectItem value="20ft Standard" className="font-bold py-3">20ft Standard</SelectItem>
                                                            <SelectItem value="40ft Standard" className="font-bold py-3">40ft Standard</SelectItem>
                                                            <SelectItem value="40ft High Cube" className="font-bold py-3">40ft High Cube</SelectItem>
                                                            <SelectItem value="45ft High Cube" className="font-bold py-3">45ft High Cube</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="space-y-3">
                                                    <Label className="text-[10px] font-black uppercase text-muted-foreground/60 ml-1 tracking-widest">Cubic Capacity (CBM)</Label>
                                                    <div className="relative">
                                                        <Input type="number" value={cbm} onChange={e => setCbm(e.target.value)} className="h-14 font-black text-xl border-2 rounded-2xl bg-white px-6" />
                                                        <span className="absolute right-6 top-1/2 -translate-y-1/2 font-black text-muted-foreground/30 text-xs">m³</span>
                                                    </div>
                                                </div>
                                                <div className="space-y-3">
                                                    <Label className="text-[10px] font-black uppercase text-muted-foreground/60 ml-1 tracking-widest">Strategic Unit Cost (USD)</Label>
                                                    <div className="relative">
                                                        <ArrowRightLeft className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-primary opacity-40" />
                                                        <Input type="number" value={cost} onChange={e => setCost(e.target.value)} className="h-14 font-black text-xl border-2 rounded-2xl bg-white pl-14" />
                                                    </div>
                                                </div>
                                            </div>
                                        </CardContent>
                                        <CardFooter className="p-8 bg-muted/10 border-t flex justify-end gap-4">
                                            <Button variant="ghost" onClick={() => setIsAdding(false)} className="h-12 px-8 font-black uppercase text-[10px] rounded-xl border-2">Cancel</Button>
                                            <Button onClick={handleAdd} disabled={isSaving || !size || !cost || !cbm} className="h-12 px-10 rounded-xl font-black uppercase text-[10px] shadow-2xl">Add Container</Button>
                                        </CardFooter>
                                    </Card>
                                )}
                                
                                <div className="rounded-[2rem] border-2 overflow-hidden bg-white shadow-xl">
                                    <Table>
                                        <TableHeader className="bg-slate-50 border-b-2">
                                            <TableRow className="hover:bg-transparent">
                                                <TableHead className="py-6 px-10 font-black uppercase text-[10px] tracking-[0.2em]">Container Size</TableHead>
                                                <TableHead className="py-6 px-6 font-black uppercase text-[10px] tracking-[0.2em] text-right">Capacity (CBM)</TableHead>
                                                <TableHead className="py-6 px-6 font-black uppercase text-[10px] tracking-[0.2em] text-right">Total Cost</TableHead>
                                                <TableHead className="py-6 px-6 font-black uppercase text-[10px] tracking-[0.2em] text-center">ISO</TableHead>
                                                <TableHead className="py-6 px-10 font-black uppercase text-[10px] tracking-[0.2em] text-right w-[120px]">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {containers?.length > 0 ? containers.map((c: any) => (
                                                <TableRow key={c.id} className="hover:bg-primary/[0.02] transition-colors group">
                                                    <TableCell className="py-6 px-10 font-black uppercase text-slate-900">{c.size}</TableCell>
                                                    <TableCell className="py-6 px-6 text-right font-black text-slate-600">{c.cubicMeters} m³</TableCell>
                                                    <TableCell className="py-6 px-6 text-right font-black text-primary text-lg">{formatCurrency(c.cost, c.currency)}</TableCell>
                                                    <TableCell className="py-6 px-6 text-center"><Badge className="h-6 px-3 bg-muted text-muted-foreground border-none font-black">{c.currency}</Badge></TableCell>
                                                    <TableCell className="py-6 px-10 text-right">
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            className="h-10 w-10 text-destructive opacity-0 group-hover:opacity-100 transition-all hover:bg-destructive/10 rounded-xl"
                                                            onClick={() => handleDelete(c.id)}
                                                        >
                                                            <Trash2 className="h-5 w-5" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            )) : (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="h-48 text-center">
                                                        <div className="flex flex-col items-center justify-center opacity-10 grayscale">
                                                            <Truck className="h-16 w-16 mb-4" />
                                                            <p className="font-black uppercase tracking-[0.3em] text-xs">Registry Empty</p>
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
                <DialogFooter className="p-10 border-t bg-muted/5">
                    <DialogClose asChild><Button variant="outline" className="h-14 px-10 font-black uppercase text-[11px] tracking-widest rounded-2xl border-2 shadow-sm">Exit</Button></DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

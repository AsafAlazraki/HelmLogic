
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
    UnfoldVertical,
    Wrench,
    Percent,
    Anchor,
    Fuel,
    Tag,
    DollarSign,
    Target,
    ListChecks
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
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';

interface CustomColumn {
    id: string;
    name: string;
    type: 'percent' | 'text' | 'currency' | 'cost' | 'label' | 'number';
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

const calculateLandedCost = (itemValues: Record<string, any>, baseCostUsd: number, exchangeRate: number): number => {
    const costOverride = itemValues['base_cost_override'];
    const usdBase = (costOverride !== undefined && costOverride !== '' && costOverride !== null) ? parseFloat(costOverride) : baseCostUsd;
    
    const discountUsd = parseFloat(itemValues['vendor_factory_discount_usd'] || '0');
    const oceanFreightUsd = parseFloat(itemValues['freight_ocean_usd'] || '0');
    const baseFreightUsd = parseFloat(itemValues['freight_base_usd'] || '0');
    const boatPrepUsd = parseFloat(itemValues['handling_boat_prep_usd'] || '0');

    const totalUsd = usdBase - discountUsd + oceanFreightUsd + baseFreightUsd + boatPrepUsd;
    const baseAud = totalUsd * exchangeRate;
    const withGst = baseAud * 1.10;

    const roadFreightAud = parseFloat(itemValues['freight_road_aud'] || '0');
    const otherChargesAud = parseFloat(itemValues['handling_other_charges_aud'] || '0');
    const detailingAud = parseFloat(itemValues['handling_boat_detailing_aud'] || '0');
    
    const pdHours = parseFloat(itemValues['handling_pre_delivery_hours'] || '0');
    const pdRate = parseFloat(itemValues['handling_labor_rate'] || '0');
    const pdCost = pdHours * pdRate;

    return withGst + roadFreightAud + otherChargesAud + detailingAud + pdCost;
};

const getSectionColCount = (sec: PricingSection, view: 'boats' | 'options') => {
    if (sec.isCollapsed) return 1;
    if (view === 'options') {
        if (sec.id === 'sec-exchange') return 5;
        if (sec.id === 'sec-vendor') return 1; // Base Price Only
        if (sec.id === 'sec-misc') return 1; // Misc Charge
        if (sec.id === 'sec-financials') return 4; // Cost to date, MU, GP, Sell
        return 0; // Hide others
    }
    if (sec.id === 'sec-exchange') return 5;
    if (sec.id === 'sec-vendor') return 4;
    if (sec.id === 'sec-freight') return 3;
    if (sec.id === 'sec-handling') return 9;
    if (sec.id === 'sec-markup') return 2;
    if (sec.id === 'sec-price-levels') return 12;
    return Math.max(1, sec.columns.length);
};

export function HighfieldPricingWorkspace({ vendor, organisationId }: { vendor: any, organisationId: string }) {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();
    
    const [isFocusMode, setIsFocusMode] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedRanges, setExpandedRanges] = useState<string[]>([]);
    const [activeView, setActiveView] = useState<'boats' | 'options'>('boats');

    const rangesQuery = useMemoFirebase(() => query(collection(firestore, `data-warehouse/${vendor.id}/ranges`), orderBy('order')), [firestore, vendor.id]);
    const { data: ranges } = useCollection<Range>(rangesQuery);

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
        const requiredIds = ['sec-exchange', 'sec-vendor', 'sec-freight', 'sec-handling', 'sec-markup', 'sec-price-levels', 'sec-misc', 'sec-financials'];
        const missingIds = requiredIds.filter(id => !currentSections.some(s => s.id === id));
        
        if (missingIds.length > 0) {
            const defaults: Record<string, PricingSection> = {
                'sec-exchange': { id: 'sec-exchange', name: 'EXCHANGE', order: 0, columns: [] },
                'sec-vendor': { id: 'sec-vendor', name: 'VENDOR', order: 1, columns: [] },
                'sec-freight': { id: 'sec-freight', name: 'FREIGHT', order: 2, columns: [] },
                'sec-handling': { id: 'sec-handling', name: 'HANDLING', order: 3, columns: [] },
                'sec-markup': { id: 'sec-markup', name: 'MARKUP', order: 4, columns: [] },
                'sec-price-levels': { id: 'sec-price-levels', name: 'PRICE LEVELS (HULL ONLY)', order: 5, columns: [] },
                'sec-misc': { id: 'sec-misc', name: 'MISCELLANEOUS', order: 6, columns: [] },
                'sec-financials': { id: 'sec-financials', name: 'FINANCIALS', order: 7, columns: [] },
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

    const onUpdateValue = async (itemId: string, colId: string, value: any) => {
        if (!strategy) return;
        const currentValues = strategy.itemValues || {};
        const oldValue = currentValues[itemId]?.[colId];
        const updated = { ...currentValues, [itemId]: { ...(currentValues[itemId] || {}), [colId]: value } };
        await updateDoc(strategyRef, { itemValues: updated, lastUpdateAt: serverTimestamp() });
        const logRef = collection(firestore, `organisations/${organisationId}/pricingStrategies/${vendor.id}/auditLog`);
        await addDoc(logRef, {
            itemId, colId, oldValue: oldValue ?? null, newValue: value, timestamp: serverTimestamp(),
            userId: user?.uid, userName: user?.displayName || user?.email || 'System'
        });
    };

    const handleToggleSectionCollapse = async (sectionId: string) => {
        if (!strategy) return;
        const newSections = (strategy.sections || []).map(s => s.id === sectionId ? { ...s, isCollapsed: !s.isCollapsed } : s);
        await updateDoc(strategyRef, { sections: newSections });
    };

    const handleAddSection = async () => {
        if (!newSectionName.trim()) return;
        const currentSections = strategy?.sections || [];
        const newSection: PricingSection = { id: `sec-${Date.now()}`, name: newSectionName.toUpperCase(), order: currentSections.length, columns: [] };
        await updateDoc(strategyRef, { sections: [...currentSections, newSection] });
        setIsAddSectionOpen(false);
        setNewSectionName('');
    };

    const handleAddColumn = async () => {
        if (!newColName.trim() || !targetSectionId) return;
        const currentSections = strategy?.sections || [];
        const newCol: CustomColumn = { id: `col-${Date.now()}`, name: newColName, type: newColType, isCalculated, formula: isCalculated ? { leftId: formulaLeft, operator: formulaOp, rightId: isNaN(parseFloat(formulaRight)) ? formulaRight : parseFloat(formulaRight) } : undefined };
        const updatedSections = currentSections.map(s => s.id === targetSectionId ? { ...s, columns: [...s.columns, newCol] } : s);
        await updateDoc(strategyRef, { sections: updatedSections });
        setIsAddColumnOpen(false);
        setNewColName('');
        setIsCalculated(false);
    };

    const toggleRange = (id: string) => setExpandedRanges(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    const expandAllRanges = () => { if (ranges) setExpandedRanges(ranges.map(r => r.id)); };
    const collapseAllRanges = () => setExpandedRanges([]);

    const filteredRanges = useMemo(() => {
        if (!ranges) return [];
        if (!searchTerm) return ranges;
        const lower = searchTerm.toLowerCase();
        return ranges.filter(range => range.name.toLowerCase().includes(lower) || allModels.filter(m => m.rangeId === range.id).some(m => m.name.toLowerCase().includes(lower) || m.modelCode?.toLowerCase().includes(lower)));
    }, [ranges, searchTerm, allModels]);

    const activeSections = useMemo(() => {
        const sorted = [...(strategy?.sections || [])].sort((a, b) => a.order - b.order);
        if (activeView === 'options') {
            const optIds = ['sec-exchange', 'sec-vendor', 'sec-misc', 'sec-financials'];
            return sorted.filter(s => optIds.includes(s.id));
        }
        const boatIds = ['sec-exchange', 'sec-vendor', 'sec-freight', 'sec-handling', 'sec-markup', 'sec-price-levels'];
        return sorted.filter(s => boatIds.includes(s.id));
    }, [strategy?.sections, activeView]);

    const totalCalculatedCols = useMemo(() => {
        return activeSections.reduce((acc, sec) => acc + getSectionColCount(sec, activeView), 0);
    }, [activeSections, activeView]);

    const WorkspaceHeader = ({ isFocus = false }: { isFocus?: boolean }) => (
        <div className="flex items-center justify-between gap-4 py-4 px-8 shrink-0 bg-white border-b-2 border-slate-300 shadow-sm relative z-10">
            <div className="flex items-center gap-6">
                <div className="flex items-center gap-4">
                    <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary shadow-sm border-2 border-primary/20">
                        <Calculator className="h-5 w-5" />
                    </div>
                    <div>
                        <h2 className="text-base font-black uppercase tracking-widest text-slate-950 leading-none">HIGHFIELD STRATEGIC WORKSPACE</h2>
                        <div className="flex items-center gap-2 mt-1.5">
                            <Badge variant="outline" className="text-[8px] h-4 font-black uppercase bg-primary/5 text-primary border-2 border-primary/20 px-2">PRECISION MODE</Badge>
                            <Badge variant="outline" className="text-[8px] h-4 font-black uppercase bg-slate-100 text-slate-600 border-2 border-slate-300">{vendor.currency || 'USD'} BASE</Badge>
                        </div>
                    </div>
                </div>

                <Tabs value={activeView} onValueChange={(v: any) => setActiveView(v)} className="ml-4">
                    <TabsList className="bg-slate-100 p-1 h-10 border-2 border-slate-300 rounded-xl">
                        <TabsTrigger value="boats" className="px-6 font-black uppercase text-[9px] tracking-widest data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg">
                            <Ship className="h-3.5 w-3.5 mr-2" /> Hull & SKUs
                        </TabsTrigger>
                        <TabsTrigger value="options" className="px-6 font-black uppercase text-[9px] tracking-widest data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg">
                            <ListChecks className="h-3.5 w-3.5 mr-2" /> Factory Options
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            <div className="flex items-center gap-3">
                {isFocus && (
                    <div className="flex items-center bg-slate-50 rounded-xl p-1 border-2 border-slate-200 mr-2 shadow-inner">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:bg-primary/10" onClick={expandAllRanges}><UnfoldVertical className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:bg-primary/10" onClick={collapseAllRanges}><FoldVertical className="h-4 w-4" /></Button>
                    </div>
                )}
                {isFocus ? (
                    <>
                        <Button type="button" onClick={() => setIsAuditLogOpen(true)} variant="outline" size="sm" className="h-10 px-4 font-black uppercase tracking-widest text-[10px] rounded-xl border-2 border-slate-300 hover:bg-slate-50 transition-all bg-white"><History className="h-4 w-4 mr-2 text-primary" /> CHANGE LOG</Button>
                        <Button type="button" onClick={() => setIsFocusMode(false)} variant="outline" size="sm" className="h-10 px-4 font-black uppercase tracking-widest text-[10px] rounded-xl border-2 border-slate-300 bg-white hover:bg-slate-100 text-slate-900"><Minimize2 className="h-4 w-4 mr-2" /> EXIT FOCUS</Button>
                    </>
                ) : (
                    <>
                        <Button type="button" onClick={() => setIsAuditLogOpen(true)} variant="outline" size="sm" className="h-10 px-4 font-black uppercase tracking-widest text-[10px] rounded-xl border-2 border-slate-300 hover:bg-slate-50 transition-all bg-white"><History className="h-4 w-4 mr-2 text-primary" /> CHANGE LOG</Button>
                        <Button type="button" onClick={() => setIsFocusMode(true)} variant="outline" size="sm" className="h-10 px-4 font-black uppercase tracking-widest text-[10px] rounded-xl border-2 border-slate-300 bg-white hover:bg-slate-100 text-slate-900"><Maximize2 className="h-4 w-4 mr-2" /> FOCUS</Button>
                    </>
                )}
            </div>
        </div>
    );

    return (
        <div className="flex flex-col h-full overflow-hidden bg-slate-50">
            {!isFocusMode && <WorkspaceHeader />}
            <div className="flex-1 min-h-0 min-w-0 bg-white flex flex-col overflow-hidden">
                <ScrollArea className="h-full">
                    <Table className="border-separate border-spacing-0 w-max min-w-full table-auto">
                        <TableHeader className="sticky top-0 z-[45] bg-white">
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="w-[340px] sticky left-0 z-[50] bg-white border-r-2 border-b-2 border-slate-300 font-black uppercase text-[10px] shadow-[4px_0_15px_-2px_rgba(0,0,0,0.2)] py-5 px-8 text-slate-950">
                                    {activeView === 'boats' ? 'SERIES DESCRIPTION & SKU' : 'MODEL SERIES & OPTIONS'}
                                </TableHead>
                                {activeSections.map((sec) => (
                                    <TableHead key={sec.id} colSpan={getSectionColCount(sec, activeView)} className={cn("border-r border-b-2 border-slate-300 p-0 bg-slate-100 transition-colors", sec.isCollapsed ? "w-[64px]" : "")}>
                                        <div className="flex items-center gap-3 p-3 min-h-[48px]">
                                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg hover:bg-primary/10 text-primary border border-primary/10" onClick={() => handleToggleSectionCollapse(sec.id)}>{sec.isCollapsed ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}</Button>
                                            {!sec.isCollapsed && <span className="text-[10px] font-black uppercase tracking-[0.15em] text-primary">{sec.name}</span>}
                                        </div>
                                    </TableHead>
                                ))}
                            </TableRow>
                            <TableRow className="hover:bg-transparent bg-white">
                                <TableHead className="sticky left-0 z-[50] bg-white border-r-2 border-b-2 border-slate-300 font-black uppercase text-[10px] shadow-[4px_0_15px_-2px_rgba(0,0,0,0.2)] h-14 py-0 px-6">
                                    <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" /><input placeholder="Filter..." className="w-full pl-9 h-10 bg-slate-50 border-2 border-slate-200 rounded-xl text-[11px] font-bold focus:outline-none focus:border-primary/40 transition-all placeholder:text-slate-400" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div>
                                </TableHead>
                                {activeSections.map(sec => {
                                    if (sec.isCollapsed) return <TableHead key={`sub-coll-${sec.id}`} className="w-[64px] border-r border-b-2 border-slate-300 bg-slate-50 text-center p-0"><div className="flex flex-col items-center justify-center h-full"><span className="[writing-mode:vertical-lr] rotate-180 text-[9px] font-black tracking-widest text-slate-900 uppercase">{sec.name}</span></div></TableHead>;
                                    if (sec.id === 'sec-exchange') return (
                                        <React.Fragment key={sec.id}>
                                            <TableHead className="text-center border-r border-b-2 border-slate-300 bg-slate-50 font-black uppercase text-[9px] tracking-tight w-[80px] text-slate-700">{vendor.currency || 'USD'}</TableHead>
                                            <TableHead className="text-center border-r border-b-2 border-slate-300 bg-slate-50 font-black uppercase text-[9px] tracking-tight w-[100px] text-slate-700">RATE</TableHead>
                                            <TableHead className="text-center border-r border-b-2 border-slate-300 bg-slate-50 font-black uppercase text-[9px] tracking-tight w-[80px] text-slate-700">{organisation?.tradingCurrency || 'AUD'}</TableHead>
                                            <TableHead className="text-center border-r border-b-2 border-slate-300 bg-slate-50 font-black uppercase text-[9px] tracking-tight w-[100px] text-slate-700">RATE</TableHead>
                                            <TableHead className="text-center border-r border-b-2 border-slate-300 bg-slate-50 font-black uppercase text-[9px] tracking-tight w-[100px] text-slate-700">DUTY %</TableHead>
                                        </React.Fragment>
                                    );
                                    if (sec.id === 'sec-vendor') {
                                        if (activeView === 'options') return <TableHead className="text-right border-r border-b-2 border-slate-300 bg-slate-50 font-black uppercase text-[9px] tracking-tight w-[140px] text-slate-700 px-5">BASE ({vendor.currency || 'USD'})</TableHead>;
                                        return (
                                            <React.Fragment key={sec.id}>
                                                <TableHead className="text-right border-r border-b-2 border-slate-300 bg-slate-50 font-black uppercase text-[9px] tracking-tight w-[120px] text-slate-700 px-5">BASE ({vendor.currency || 'USD'})</TableHead>
                                                <TableHead className="text-right border-r border-b-2 border-slate-300 bg-slate-50 font-black uppercase text-[9px] tracking-tight w-[120px] text-slate-700 px-5">BASE ({organisation?.tradingCurrency || 'AUD'})</TableHead>
                                                <TableHead className="text-right border-r border-b-2 border-slate-300 bg-slate-50 font-black uppercase text-[9px] tracking-tight w-[140px] text-slate-700 px-5">DISC ({vendor.currency || 'USD'})</TableHead>
                                                <TableHead className="text-right border-r border-b-2 border-slate-300 bg-slate-50 font-black uppercase text-[9px] tracking-tight w-[140px] text-slate-700 px-5">LANDED ({organisation?.tradingCurrency || 'AUD'})</TableHead>
                                            </React.Fragment>
                                        );
                                    }
                                    if (sec.id === 'sec-misc') return <TableHead key={sec.id} className="text-right border-r border-b-2 border-slate-300 bg-slate-50 font-black uppercase text-[9px] tracking-tight w-[140px] text-slate-700 px-5">MISC CHARGE (AUD)</TableHead>;
                                    if (sec.id === 'sec-financials') return (
                                        <React.Fragment key={sec.id}>
                                            <TableHead className="text-right border-r border-b-2 border-slate-300 bg-slate-50 font-black uppercase text-[9px] tracking-tight w-[140px] text-slate-700 px-5">COST TO DATE (AUD)</TableHead>
                                            <TableHead className="text-center border-r border-b-2 border-slate-300 bg-slate-50 font-black uppercase text-[9px] tracking-tight w-[100px] text-slate-700">MARKUP %</TableHead>
                                            <TableHead className="text-right border-r border-b-2 border-slate-300 bg-slate-50 font-black uppercase text-[9px] tracking-tight w-[140px] text-slate-700 px-5">GP (AUD)</TableHead>
                                            <TableHead className="text-right border-r border-b-2 border-slate-300 bg-slate-50 font-black uppercase text-[9px] tracking-tight w-[140px] text-slate-700 px-5 text-primary">SELL PRICE (AUD)</TableHead>
                                        </React.Fragment>
                                    );
                                    if (sec.id === 'sec-freight') return (
                                        <React.Fragment key={sec.id}>
                                            <TableHead className="text-right border-r border-b-2 border-slate-300 bg-slate-50 font-black uppercase text-[9px] tracking-tight w-[120px] text-slate-700 px-5">OCEAN (USD)</TableHead>
                                            <TableHead className="text-right border-r border-b-2 border-slate-300 bg-slate-50 font-black uppercase text-[9px] tracking-tight w-[120px] text-slate-700 px-5">BASE (USD)</TableHead>
                                            <TableHead className="text-right border-r border-b-2 border-slate-300 bg-slate-50 font-black uppercase text-[9px] tracking-tight w-[120px] text-slate-700 px-5">ROAD (AUD)</TableHead>
                                        </React.Fragment>
                                    );
                                    if (sec.id === 'sec-handling') return (
                                        <React.Fragment key={sec.id}>
                                            <TableHead className="text-right border-r border-b-2 border-slate-300 bg-slate-50 font-black uppercase text-[9px] tracking-tight w-[120px] text-slate-700 px-5">PREP (USD)</TableHead>
                                            <TableHead className="text-right border-r border-b-2 border-slate-300 bg-slate-50 font-black uppercase text-[9px] tracking-tight w-[120px] text-slate-700 px-5">OTHER (AUD)</TableHead>
                                            <TableHead className="text-center border-r border-b-2 border-slate-300 bg-slate-50 font-black uppercase text-[9px] tracking-tight w-[80px] text-slate-700">GST</TableHead>
                                            <TableHead className="text-center border-r border-b-2 border-slate-300 bg-slate-50 font-black uppercase text-[9px] tracking-tight w-[100px] text-slate-700">PD CODE</TableHead>
                                            <TableHead className="text-center border-r border-b-2 border-slate-300 bg-slate-50 font-black uppercase text-[9px] tracking-tight w-[80px] text-slate-700">PD HRS</TableHead>
                                            <TableHead className="text-right border-r border-b-2 border-slate-300 bg-slate-50 font-black uppercase text-[9px] tracking-tight w-[100px] text-slate-700 px-5">LABOR $</TableHead>
                                            <TableHead className="text-right border-r border-b-2 border-slate-300 bg-slate-50 font-black uppercase text-[9px] tracking-tight w-[120px] text-slate-700 px-5">PD COST</TableHead>
                                            <TableHead className="text-right border-r border-b-2 border-slate-300 bg-slate-50 font-black uppercase text-[9px] tracking-tight w-[120px] text-slate-700 px-5">DETAIL $</TableHead>
                                            <TableHead className="text-center border-r border-b-2 border-slate-300 bg-slate-50 font-black uppercase text-[9px] tracking-tight w-[100px] text-slate-700 px-5">FUEL (L)</TableHead>
                                        </React.Fragment>
                                    );
                                    if (sec.id === 'sec-markup') return (
                                        <React.Fragment key={sec.id}>
                                            <TableHead className="text-center border-r border-b-2 border-slate-300 bg-slate-50 font-black uppercase text-[9px] tracking-tight w-[120px] text-slate-700 px-5">HULL MU %</TableHead>
                                            <TableHead className="text-center border-r border-b-2 border-slate-300 bg-slate-50 font-black uppercase text-[9px] tracking-tight w-[120px] text-slate-700 px-5">BMT MU %</TableHead>
                                        </React.Fragment>
                                    );
                                    if (sec.id === 'sec-price-levels') return (
                                        <React.Fragment key={sec.id}>
                                            {['CASH', 'TRADE', 'SUB', 'EXCL', 'SAILING'].map(l => (
                                                <React.Fragment key={l}>
                                                    <TableHead className="text-right border-r border-b-2 border-slate-300 bg-slate-50 font-black uppercase text-[9px] tracking-tight w-[110px] text-slate-700 px-4">{l} $</TableHead>
                                                    <TableHead className="text-center border-r border-b-2 border-slate-300 bg-slate-50 font-black uppercase text-[9px] tracking-tight w-[80px] text-slate-700">GP %</TableHead>
                                                </React.Fragment>
                                            ))}
                                            <TableHead className="text-right border-r border-b-2 border-slate-300 bg-slate-50 font-black uppercase text-[9px] tracking-tight w-[120px] text-slate-700 px-4">SUB SRP</TableHead>
                                            <TableHead className="text-right border-r border-b-2 border-slate-300 bg-slate-50 font-black uppercase text-[9px] tracking-tight w-[120px] text-slate-700 px-4">EXCL SRP</TableHead>
                                        </React.Fragment>
                                    );
                                    return null;
                                })}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredRanges.length > 0 ? filteredRanges.map(range => (
                                <RangeSection key={range.id} range={range} models={allModels.filter((m: any) => m.rangeId === range.id)} variants={allVariants} isExpanded={expandedRanges.includes(range.id)} onToggle={() => toggleRange(range.id)} sections={activeSections} strategy={strategy} onUpdateValue={onUpdateValue} vendor={vendor} organisation={organisation} exchangeRate={activeExchangeRate} totalCalculatedCols={totalCalculatedCols} activeView={activeView} />
                            )) : <TableRow><TableCell colSpan={totalCalculatedCols + 1} className="h-64 text-center opacity-20"><Search className="h-12 w-12 mb-4 mx-auto" /><p className="font-black uppercase tracking-widest text-xs">NO RECORDS MATCHING SEARCH</p></TableCell></TableRow>}
                        </TableBody>
                    </Table>
                </ScrollArea>
            </div>

            <Dialog open={isFocusMode} onOpenChange={setIsFocusMode}>
                <DialogContent className="max-w-[98vw] w-[1600px] h-[95vh] rounded-[2.5rem] p-0 overflow-hidden border-4 border-slate-300 shadow-2xl flex flex-col [&>button]:hidden z-[100] bg-white">
                    <div className="flex flex-col h-full bg-background overflow-hidden">
                        <WorkspaceHeader isFocus />
                        <div className="flex-1 min-h-0 bg-white flex flex-col overflow-hidden">
                            <PricingTable />
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <AuditLogDialog organisationId={organisationId} vendorId={vendor.id} isOpen={isAuditLogOpen} onClose={() => setIsAuditLogOpen(false)} />
        </div>
    );
}

function RangeSection({ range, models, variants, isExpanded, onToggle, sections, strategy, onUpdateValue, vendor, organisation, exchangeRate, totalCalculatedCols, activeView }: any) {
    const visibleModels = models.filter((m: any) => {
        if (activeView === 'options') return m.optionalFeatures && m.optionalFeatures.length > 0;
        return variants[m.id] && variants[m.id].length > 0;
    });
    if (visibleModels.length === 0) return null;

    return (
        <>
            <TableRow className="bg-slate-100 border-b-2 border-slate-300 cursor-pointer hover:bg-slate-200" onClick={onToggle}>
                <TableCell className="sticky left-0 z-[30] bg-slate-100 py-4 px-8 font-black uppercase text-[11px] tracking-[0.1em] text-slate-950 border-r-2 border-slate-300 shadow-[4px_0_15px_-2px_rgba(0,0,0,0.2)]">
                    <div className="flex items-center justify-between"><div className="flex items-center gap-4"><div className={cn("h-6 w-6 rounded-lg bg-white border-2 border-slate-300 flex items-center justify-center transition-transform duration-300", isExpanded && "rotate-90")}><ChevronRight className="h-4 w-4 text-primary" /></div><span>{range.name} RANGE</span></div><Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[10px] font-black h-6 px-2.5 uppercase">{visibleModels.length} SERIES</Badge></div>
                </TableCell>
                {Array.from({ length: totalCalculatedCols }).map((_, i) => <TableCell key={i} className="border-b-2 border-slate-300 bg-slate-100/60" />)}
            </TableRow>
            {isExpanded && visibleModels.map((model: any) => (
                <ModelGroup key={model.id} model={model} variants={variants[model.id] || []} sections={sections} strategy={strategy} onUpdateValue={onUpdateValue} vendor={vendor} organisation={organisation} exchangeRate={exchangeRate} totalCalculatedCols={totalCalculatedCols} activeView={activeView} />
            ))}
        </>
    );
}

function ModelGroup({ model, variants, sections, strategy, onUpdateValue, vendor, organisation, exchangeRate, totalCalculatedCols, activeView }: any) {
    const [isLocalExpanded, setIsLocalExpanded] = useState(true);
    return (
        <>
            <TableRow className="bg-slate-50 border-l-8 border-l-primary">
                <TableCell className="sticky left-0 z-[30] bg-slate-50 py-3.5 px-10 border-r-2 border-b-2 border-slate-300 shadow-[4px_0_15px_-2px_rgba(0,0,0,0.2)]">
                    <div className="flex items-center gap-4"><button type="button" className="h-7 w-7 rounded-lg hover:bg-primary/10 flex items-center justify-center transition-all text-primary border-2 border-slate-300 bg-white shadow-sm" onClick={() => setIsLocalExpanded(!isLocalExpanded)}>{isLocalExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button><div className="flex flex-col min-w-0"><span className="font-black text-[11px] uppercase tracking-tight truncate leading-none mb-1 text-slate-950">{model.name}</span><span className="text-[8px] font-black text-primary/90 uppercase tracking-[0.2em]">SERIES CODE: {model.modelCode || 'NO-CODE'}</span></div></div>
                </TableCell>
                {Array.from({ length: totalCalculatedCols }).map((_, i) => <TableCell key={i} className="border-b-2 border-slate-300 bg-slate-50/50" />)}
            </TableRow>
            {isLocalExpanded && (
                <>
                    {activeView === 'boats' ? variants.map((v: any, idx: number) => (
                        <PricingRow key={v.id} id={v.id} name={v.name} sku={v.sku} cost={v.cost} sell={v.sellPriceExclGst} vendor={vendor} organisation={organisation} exchangeRate={exchangeRate} sections={sections} strategy={strategy} onUpdateValue={onUpdateValue} indent isBoatVariant rowIndex={idx} activeView={activeView} />
                    )) : (model.optionalFeatures || []).map((f: any, idx: number) => (
                        <PricingRow key={f.id} id={f.id} name={f.name} sku={f.code} cost={f.cost} sell={f.sellPriceExclGst} vendor={vendor} organisation={organisation} exchangeRate={exchangeRate} sections={sections} strategy={strategy} onUpdateValue={onUpdateValue} indent isOption rowIndex={idx} activeView={activeView} />
                    ))}
                </>
            )}
        </>
    );
}

function PricingRow({ id, name, sku, cost, sell, sections, strategy, onUpdateValue, indent, isOption, vendor, organisation, exchangeRate, rowIndex, activeView }: any) {
    const itemValues = strategy?.itemValues?.[id] || {};
    const orgCurrency = organisation?.tradingCurrency || 'AUD';
    const vendorCurrency = vendor.currency || 'USD';
    const rowBgClass = rowIndex % 2 === 0 ? "bg-white" : "bg-slate-50";

    return (
        <TableRow className={cn("transition-colors group", rowBgClass)}>
            <TableCell className={cn("sticky left-0 z-[30] border-r-2 border-b border-slate-200 shadow-[4px_0_15px_-2px_rgba(0,0,0,0.2)] transition-colors group-hover:bg-primary/[0.03]", rowBgClass, indent ? "pl-20" : "px-8")}>
                <div className="flex flex-col min-w-0"><span className={cn("font-black text-[11px] uppercase truncate tracking-tight mb-0.5", isOption ? "text-slate-700" : "text-slate-950")}>{name}</span><div className="flex items-center gap-2"><span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-tighter">{sku || 'NO SKU'}</span>{isOption && <Badge className="text-[7px] font-black h-3.5 px-1.5 bg-slate-200 text-slate-700 border-none">OPT</Badge>}</div></div>
            </TableCell>
            {sections.map((sec: any) => {
                if (sec.id === 'sec-exchange') {
                    if (sec.isCollapsed) return <CollapsedCell key={sec.id} name={sec.name} />;
                    return (
                        <React.Fragment key={sec.id}>
                            <TableCell className="text-center border-r border-b border-slate-300 bg-white"><Badge variant="outline" className="font-black text-[9px] tracking-tighter text-slate-500 border-slate-300">{vendorCurrency}</Badge></TableCell>
                            <TableCell className="text-center border-r border-b border-slate-300 bg-white text-[10px] font-black text-primary">{exchangeRate.toFixed(4)}</TableCell>
                            <TableCell className="text-center border-r border-b border-slate-300 bg-white"><Badge variant="outline" className="font-black text-[9px] tracking-tighter text-slate-500 border-slate-300">{orgCurrency}</Badge></TableCell>
                            <TableCell className="text-center border-r border-b border-slate-300 bg-white text-[10px] font-black text-primary">1.0000</TableCell>
                            <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell id={id} col={{ id: 'exchange_duty_percent', type: 'percent' }} value={itemValues['exchange_duty_percent'] || ''} onChange={(val: any) => onUpdateValue(id, 'exchange_duty_percent', val)} suffix="%" /></TableCell>
                        </React.Fragment>
                    );
                }
                if (sec.id === 'sec-vendor') {
                    if (sec.isCollapsed) return <CollapsedCell key={sec.id} name={sec.name} />;
                    const costOverride = activeView === 'options' ? itemValues['opt_base_price_usd'] : itemValues['base_cost_override'];
                    const effectiveUsdCost = (costOverride !== undefined && costOverride !== '' && costOverride !== null) ? parseFloat(costOverride) : cost;
                    const convertedAudCost = (effectiveUsdCost || 0) * (exchangeRate || 1);
                    if (activeView === 'options') return <TableCell key={sec.id} className="p-0 border-r border-b border-slate-300"><EditableCell id={id} col={{ id: 'opt_base_price_usd', type: 'currency' }} value={costOverride || ''} placeholder={cost ? cost.toFixed(2) : "0.00"} onChange={(val: any) => onUpdateValue(id, 'opt_base_price_usd', val)} align="right" suffix={vendorCurrency} /></TableCell>;
                    return (
                        <React.Fragment key={sec.id}>
                            <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell id={id} col={{ id: 'base_cost_override', type: 'currency' }} value={costOverride || ''} placeholder={cost ? cost.toFixed(2) : "0.00"} onChange={(val: any) => onUpdateValue(id, 'base_cost_override', val)} align="right" suffix={vendorCurrency} /></TableCell>
                            <TableCell className="text-right text-[11px] font-black text-slate-950 border-r border-b border-slate-300 px-5 bg-slate-50/50">{formatCurrency(convertedAudCost, orgCurrency)}</TableCell>
                            <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell id={id} col={{ id: 'vendor_factory_discount_usd', type: 'currency' }} value={itemValues['vendor_factory_discount_usd'] || ''} onChange={(val: any) => onUpdateValue(id, 'vendor_factory_discount_usd', val)} align="right" suffix={vendorCurrency} /></TableCell>
                            <TableCell className="p-0 border-r border-b border-slate-300"><CalculatedCell col={{ id: 'vendor_landed_cost_aud', type: 'cost' }} baseCost={cost} itemValues={itemValues} exchangeRate={exchangeRate} suffix={orgCurrency} /></TableCell>
                        </React.Fragment>
                    );
                }
                if (sec.id === 'sec-misc' && activeView === 'options') {
                    if (sec.isCollapsed) return <CollapsedCell key={sec.id} name={sec.name} />;
                    return <TableCell key={sec.id} className="p-0 border-r border-b border-slate-300"><EditableCell id={id} col={{ id: 'opt_misc_charge_aud', type: 'currency' }} value={itemValues['opt_misc_charge_aud'] || ''} onChange={(val: any) => onUpdateValue(id, 'opt_misc_charge_aud', val)} align="right" suffix={orgCurrency} /></TableCell>;
                }
                if (sec.id === 'sec-financials' && activeView === 'options') {
                    if (sec.isCollapsed) return <CollapsedCell key={sec.id} name={sec.name} />;
                    const baseUsd = parseFloat(itemValues['opt_base_price_usd'] || cost || '0');
                    const miscAud = parseFloat(itemValues['opt_misc_charge_aud'] || '0');
                    const costToDate = (baseUsd * exchangeRate * 1.10) + miscAud;
                    const mu = parseFloat(itemValues['opt_markup_percent'] || '0');
                    const sell = costToDate / (1 - mu/100);
                    const gp = sell - costToDate;
                    return (
                        <React.Fragment key={sec.id}>
                            <TableCell className="text-right text-[11px] font-black text-slate-950 border-r border-b border-slate-300 px-5 bg-primary/[0.03]">{formatCurrency(costToDate, orgCurrency)}</TableCell>
                            <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell id={id} col={{ id: 'opt_markup_percent', type: 'percent' }} value={mu || ''} onChange={(val: any) => onUpdateValue(id, 'opt_markup_percent', val)} suffix="%" /></TableCell>
                            <TableCell className="text-right text-[11px] font-black text-green-600 border-r border-b border-slate-300 px-5 bg-green-500/[0.03]">{formatCurrency(gp, orgCurrency)}</TableCell>
                            <TableCell className="text-right text-[11px] font-black text-primary border-r border-b border-slate-300 px-5 bg-primary/5">{formatCurrency(sell, orgCurrency)}</TableCell>
                        </React.Fragment>
                    );
                }
                if (sec.id === 'sec-freight' && activeView === 'boats') {
                    if (sec.isCollapsed) return <CollapsedCell key={sec.id} name={sec.name} />;
                    return (
                        <React.Fragment key={sec.id}>
                            <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell id={id} col={{ id: 'freight_ocean_usd', type: 'currency' }} value={itemValues['freight_ocean_usd'] || ''} onChange={(val: any) => onUpdateValue(id, 'freight_ocean_usd', val)} align="right" suffix={vendorCurrency} /></TableCell>
                            <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell id={id} col={{ id: 'freight_base_usd', type: 'currency' }} value={itemValues['freight_base_usd'] || ''} onChange={(val: any) => onUpdateValue(id, 'freight_base_usd', val)} align="right" suffix={vendorCurrency} /></TableCell>
                            <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell id={id} col={{ id: 'freight_road_aud', type: 'currency' }} value={itemValues['freight_road_aud'] || ''} onChange={(val: any) => onUpdateValue(id, 'freight_road_aud', val)} align="right" suffix={orgCurrency} /></TableCell>
                        </React.Fragment>
                    );
                }
                if (sec.id === 'sec-handling' && activeView === 'boats') {
                    if (sec.isCollapsed) return <CollapsedCell key={sec.id} name={sec.name} />;
                    return (
                        <React.Fragment key={sec.id}>
                            <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell id={id} col={{ id: 'handling_boat_prep_usd', type: 'currency' }} value={itemValues['handling_boat_prep_usd'] || ''} onChange={(val: any) => onUpdateValue(id, 'handling_boat_prep_usd', val)} align="right" suffix={vendorCurrency} /></TableCell>
                            <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell id={id} col={{ id: 'handling_other_charges_aud', type: 'currency' }} value={itemValues['handling_other_charges_aud'] || ''} onChange={(val: any) => onUpdateValue(id, 'handling_other_charges_aud', val)} align="right" suffix={orgCurrency} /></TableCell>
                            <TableCell className="text-center border-r border-b border-slate-300 bg-white font-black text-[10px] text-primary">10%</TableCell>
                            <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell id={id} col={{ id: 'handling_pre_delivery_code', type: 'text' }} value={itemValues['handling_pre_delivery_code'] || ''} onChange={(val: any) => onUpdateValue(id, 'handling_pre_delivery_code', val)} /></TableCell>
                            <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell id={id} col={{ id: 'handling_pre_delivery_hours', type: 'number' }} value={itemValues['handling_pre_delivery_hours'] || ''} onChange={(val: any) => onUpdateValue(id, 'handling_pre_delivery_hours', val)} /></TableCell>
                            <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell id={id} col={{ id: 'handling_labor_rate', type: 'currency' }} value={itemValues['handling_labor_rate'] || ''} onChange={(val: any) => onUpdateValue(id, 'handling_labor_rate', val)} align="right" prefix="$" /></TableCell>
                            <TableCell className="p-0 border-r border-b border-slate-300"><CalculatedCell col={{ id: 'handling_pre_delivery_cost_aud', type: 'currency' }} itemValues={itemValues} suffix={orgCurrency} /></TableCell>
                            <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell id={id} col={{ id: 'handling_boat_detailing_aud', type: 'currency' }} value={itemValues['handling_boat_detailing_aud'] || ''} onChange={(val: any) => onUpdateValue(id, 'handling_boat_detailing_aud', val)} align="right" suffix={orgCurrency} /></TableCell>
                            <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell id={id} col={{ id: 'handling_fuel_litres', type: 'number' }} value={itemValues['handling_fuel_litres'] || ''} onChange={(val: any) => onUpdateValue(id, 'handling_fuel_litres', val)} suffix="L" /></TableCell>
                        </React.Fragment>
                    );
                }
                if (sec.id === 'sec-markup' && activeView === 'boats') {
                    if (sec.isCollapsed) return <CollapsedCell key={sec.id} name={sec.name} />;
                    return (
                        <React.Fragment key={sec.id}>
                            <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell id={id} col={{ id: 'markup_hull_percent', type: 'percent' }} value={itemValues['markup_hull_percent'] || ''} onChange={(val: any) => onUpdateValue(id, 'markup_hull_percent', val)} suffix="%" /></TableCell>
                            <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell id={id} col={{ id: 'markup_bmt_percent', type: 'percent' }} value={itemValues['markup_bmt_percent'] || ''} onChange={(val: any) => onUpdateValue(id, 'markup_bmt_percent', val)} suffix="%" /></TableCell>
                        </React.Fragment>
                    );
                }
                if (sec.id === 'sec-price-levels' && activeView === 'boats') {
                    if (sec.isCollapsed) return <CollapsedCell key={sec.id} name={sec.name} />;
                    return (
                        <React.Fragment key={sec.id}>
                            {['hull_cash', 'hull_trade', 'hull_subdealer', 'hull_subdealer_excl', 'hull_aus_sailing'].map(l => (
                                <React.Fragment key={l}>
                                    <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell id={id} col={{ id: `${l}_price`, type: 'currency' }} value={itemValues[`${l}_price`] || ''} onChange={(val: any) => onUpdateValue(id, `${l}_price`, val)} align="right" suffix={orgCurrency} /></TableCell>
                                    <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell id={id} col={{ id: `${l}_gp`, type: 'percent' }} value={itemValues[`${l}_gp`] || ''} onChange={(val: any) => onUpdateValue(id, `${l}_gp`, val)} suffix="%" /></TableCell>
                                </React.Fragment>
                            ))}
                            <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell id={id} col={{ id: 'hull_subdealer_srp', type: 'currency' }} value={itemValues['hull_subdealer_srp'] || ''} onChange={(val: any) => onUpdateValue(id, 'hull_subdealer_srp', val)} align="right" suffix={orgCurrency} /></TableCell>
                            <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell id={id} col={{ id: 'hull_subdealer_excl_srp', type: 'currency' }} value={itemValues['hull_subdealer_excl_srp'] || ''} onChange={(val: any) => onUpdateValue(id, 'hull_subdealer_excl_srp', val)} align="right" suffix={orgCurrency} /></TableCell>
                        </React.Fragment>
                    );
                }
                return null;
            })}
        </TableRow>
    );
}

function CollapsedCell({ name }: { name: string }) {
    return <TableCell className="bg-slate-50 border-r border-b border-slate-300 p-0 text-center"><div className="flex flex-col items-center justify-center h-full"><span className="[writing-mode:vertical-lr] rotate-180 text-[8px] font-black tracking-widest text-primary uppercase">{name}</span></div></TableCell>;
}

function CalculatedCell({ col, baseCost, itemValues, exchangeRate, suffix }: any) {
    let value: number | null = null;
    if (col.id === 'vendor_landed_cost_aud') value = calculateLandedCost(itemValues, baseCost, exchangeRate);
    if (col.id === 'handling_pre_delivery_cost_aud') value = parseFloat(itemValues['handling_pre_delivery_hours'] || '0') * parseFloat(itemValues['handling_labor_rate'] || '0');
    return <div className="flex items-center justify-center h-full px-2 bg-primary/[0.04] min-h-[40px]"><div className="flex items-center gap-1.5"><div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" /><span className="text-[11px] font-black text-primary tracking-tight">{formatCurrency(value || 0, suffix)}</span></div></div>;
}

function EditableCell({ id, col, value, onChange, placeholder, prefix, suffix, align = 'center' }: any) {
    const [localValue, setLocalValue] = useState(value);
    const [isChanged, setIsChanged] = useState(false);
    useEffect(() => { setLocalValue(value); setIsChanged(value !== undefined && value !== '' && value !== null); }, [value]);
    const handleBlur = () => { if (String(localValue || '') !== String(value || '')) onChange(localValue); };
    return (
        <div className={cn("relative h-full flex items-center px-2 border-2 border-transparent focus-within:border-primary/30 min-h-[40px]", isChanged ? "bg-amber-500/[0.08]" : "bg-transparent")}>
            {prefix && <span className="text-[9px] font-black text-slate-400 mr-1.5 select-none">{prefix}</span>}
            <input type={col.id.includes('code') ? 'text' : 'number'} className={cn("h-10 w-full bg-transparent border-none text-[11px] font-black outline-none transition-all placeholder:text-slate-500 rounded focus:bg-white focus:ring-4 focus:ring-primary/10 focus:px-3 focus:shadow-xl", align === 'right' ? "text-right" : "text-center", isChanged ? "text-primary" : "text-slate-900")} value={localValue} onChange={e => setLocalValue(e.target.value)} onBlur={handleBlur} placeholder={placeholder || "-"} />
            {suffix && <span className="text-[9px] font-black text-slate-400 ml-1.5 select-none">{suffix}</span>}
            {isChanged && <div className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary" />}
        </div>
    );
}

function AuditLogDialog({ organisationId, vendorId, isOpen, onClose }: any) {
    const firestore = useFirestore();
    const logQuery = useMemoFirebase(() => query(collection(firestore, `organisations/${organisationId}/pricingStrategies/${vendorId}/auditLog`), orderBy('timestamp', 'desc')), [firestore, organisationId, vendorId]);
    const { data: logs, loading } = useCollection<any>(logQuery);
    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 overflow-hidden rounded-[3rem] border-4 border-slate-300 shadow-2xl z-[150] bg-white">
                <DialogHeader className="p-10 border-b border-slate-300 bg-slate-50 flex flex-row items-center justify-between"><div className="flex items-center gap-4"><div className="h-12 w-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shadow-inner border-2 border-primary/20"><History className="h-6 w-6" /></div><div><DialogTitle className="text-2xl font-black uppercase tracking-tight text-slate-950">CHANGE LOG</DialogTitle><DialogDescription className="text-[10px] font-black uppercase text-primary tracking-[0.2em] mt-1">Strategic Price Change Verification History</DialogDescription></div></div></DialogHeader>
                <div className="flex-1 min-h-0 bg-white">
                    {loading ? <div className="flex h-full items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div> : logs && logs.length > 0 ? (
                        <ScrollArea className="h-full"><Table className="border-separate border-spacing-0"><TableHeader className="bg-slate-100 sticky top-0 z-10"><TableRow className="hover:bg-transparent"><TableHead className="py-5 px-10 border-b-2 border-slate-300 font-black uppercase text-[10px] tracking-widest w-[220px] text-slate-900">Timestamp</TableHead><TableHead className="py-5 px-6 border-b-2 border-slate-300 font-black uppercase text-[10px] tracking-widest w-[180px] text-slate-900">Operational User</TableHead><TableHead className="py-5 px-6 border-b-2 border-slate-300 font-black uppercase text-[10px] tracking-widest text-slate-900">Financial Metric</TableHead><TableHead className="py-5 px-6 border-b-2 border-slate-300 font-black uppercase text-[10px] tracking-widest text-right text-slate-900">Previous</TableHead><TableHead className="py-5 px-10 border-b-2 border-slate-300 font-black uppercase text-[10px] tracking-widest text-right text-slate-900">Amended</TableHead></TableRow></TableHeader><TableBody>{logs.map((log: any) => (
                            <TableRow key={log.id} className="hover:bg-slate-50 transition-colors border-b border-slate-300"><TableCell className="py-5 px-10"><div className="flex items-center gap-3 text-slate-600"><Clock className="h-3.5 w-3.5" /><span className="text-[11px] font-black uppercase tracking-tighter">{log.timestamp ? formatDistanceToNow(new Date(log.timestamp.seconds * 1000), { addSuffix: true }) : 'Just now'}</span></div></TableCell><TableCell className="py-5 px-6"><div className="flex items-center gap-3"><div className="h-7 w-7 rounded-full bg-slate-200 border-2 border-slate-300 flex items-center justify-center text-slate-600 font-black text-[10px] uppercase">{log.userName?.[0] || 'S'}</div><span className="font-black text-[11px] uppercase tracking-tight truncate text-slate-900">{log.userName || 'System Auto'}</span></div></TableCell><TableCell className="py-5 px-6"><Badge variant="outline" className="h-6 px-3 bg-primary/5 text-primary border-2 border-primary/30 font-black uppercase text-[9px] tracking-widest shadow-sm">{log.colId}</Badge></TableCell><TableCell className="py-5 px-6 text-right font-mono text-[11px] text-slate-400 italic">{String(log.oldValue ?? '-')}</TableCell><TableCell className="py-5 px-10 text-right"><span className="font-mono font-black text-[12px] text-primary">{String(log.newValue)}</span></TableCell></TableRow>
                        ))}</TableBody></Table></ScrollArea>
                    ) : <div className="flex flex-col items-center justify-center h-full opacity-20"><Clock className="h-24 w-24 mb-4" /><p className="font-black uppercase tracking-[0.4em] text-sm">Audit Log Empty</p></div>}
                </div>
                <DialogFooter className="p-8 border-t border-slate-300 bg-slate-50"><DialogClose asChild><Button variant="outline" className="h-12 px-8 font-black uppercase text-[10px] tracking-widest rounded-2xl border-2 border-slate-300 shadow-sm bg-white">Close</Button></DialogClose></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

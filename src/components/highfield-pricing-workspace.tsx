'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useCollection, useDoc, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, orderBy, doc, getDocs, updateDoc, addDoc, serverTimestamp, where } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
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
    ChevronRight, 
    Coins,
    Building,
    Search,
    Maximize2,
    Minimize2,
    Calculator,
    ArrowRightLeft,
    Percent
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { 
    Dialog, 
    DialogContent, 
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/currency-utils';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import NextImage from "next/image";
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';

interface PricingSection {
    id: string;
    name: string;
    order: number;
    isCollapsed?: boolean;
    columns: any[];
}

interface PricingStrategy {
    itemValues?: Record<string, Record<string, any>>;
    sections?: PricingSection[];
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
        if (sec.id === 'sec-vendor') return 1; 
        if (sec.id === 'sec-misc') return 1; 
        if (sec.id === 'sec-financials') return 4; 
        return 0; 
    }
    if (sec.id === 'sec-exchange') return 5;
    if (sec.id === 'sec-vendor') return 4;
    if (sec.id === 'sec-freight') return 3;
    if (sec.id === 'sec-handling') return 9;
    if (sec.id === 'sec-markup') return 2;
    if (sec.id === 'sec-price-levels') return 12;
    return 1;
};

function EditableCell({ value, onChange, placeholder, prefix, suffix, align = 'center' }: any) {
    const [localValue, setLocalValue] = useState(value);
    const isChanged = value !== undefined && value !== '' && value !== null;
    useEffect(() => { setLocalValue(value); }, [value]);
    const handleBlur = () => { if (String(localValue || '') !== String(value || '')) onChange(localValue); };
    return (
        <div className={cn("relative h-full flex items-center px-2 border-2 border-transparent focus-within:border-primary/30 min-h-[40px]", isChanged ? "bg-amber-500/[0.08]" : "bg-transparent")}>
            {prefix && <span className="text-[9px] font-black text-slate-400 mr-1.5 select-none">{prefix}</span>}
            <input className={cn("h-10 w-full bg-transparent border-none text-[11px] font-black outline-none transition-all placeholder:text-slate-500 rounded focus:bg-white focus:ring-4 focus:ring-primary/10 focus:px-3 focus:shadow-xl", align === 'right' ? "text-right" : "text-center", isChanged ? "text-primary" : "text-slate-900")} value={localValue} onChange={e => setLocalValue(e.target.value)} onBlur={handleBlur} placeholder={placeholder || "-"} />
            {suffix && <span className="text-[9px] font-black text-slate-400 ml-1.5 select-none">{suffix}</span>}
            {isChanged && <div className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary" />}
        </div>
    );
}

function PricingRow({ id, name, sku, cost, sections, strategy, onUpdateValue, indent, isOption, vendor, organisation, exchangeRate, rowIndex, activeView }: any) {
    const itemValues = strategy?.itemValues?.[id] || {};
    const orgCurrency = organisation?.tradingCurrency || 'AUD';
    const vendorCurrency = vendor.currency || 'USD';
    const rowBgClass = rowIndex % 2 === 0 ? "bg-white" : "bg-slate-50";

    return (
        <TableRow className={cn("transition-colors group", rowBgClass)}>
            <TableCell className={cn("sticky left-0 z-[30] border-r-2 border-b border-slate-300 shadow-[4px_0_15px_-2px_rgba(0,0,0,0.2)] transition-colors group-hover:bg-primary/[0.03]", rowBgClass, indent ? "pl-20" : "px-8")}>
                <div className="flex flex-col min-w-0"><span className={cn("font-black text-[11px] uppercase truncate tracking-tight mb-0.5", isOption ? "text-slate-700" : "text-slate-950")}>{name}</span><div className="flex items-center gap-2"><span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-tighter">{sku || 'NO SKU'}</span>{isOption && <Badge className="text-[7px] font-black h-3.5 px-1.5 bg-slate-200 text-slate-700 border-none">OPT</Badge>}</div></div>
            </TableCell>
            {sections.map((sec: any) => {
                if (sec.isCollapsed) return <TableCell key={sec.id} className="bg-slate-50 border-r border-b border-slate-300 p-0 text-center"><div className="flex flex-col items-center justify-center h-full"><span className="[writing-mode:vertical-lr] rotate-180 text-[8px] font-black tracking-widest text-primary uppercase">{sec.name}</span></div></TableCell>;
                
                if (sec.id === 'sec-exchange') return (
                    <React.Fragment key={sec.id}>
                        <TableCell className="text-center border-r border-b border-slate-300 bg-white"><Badge variant="outline" className="font-black text-[9px] tracking-tighter text-slate-500 border-slate-300">{vendorCurrency}</Badge></TableCell>
                        <TableCell className="text-center border-r border-b border-slate-300 bg-white text-[10px] font-black text-primary">{exchangeRate.toFixed(4)}</TableCell>
                        <TableCell className="text-center border-r border-b border-slate-300 bg-white"><Badge variant="outline" className="font-black text-[9px] tracking-tighter text-slate-500 border-slate-300">{orgCurrency}</Badge></TableCell>
                        <TableCell className="text-center border-r border-b border-slate-300 bg-white text-[10px] font-black text-primary">1.0000</TableCell>
                        <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell value={itemValues['exchange_duty_percent'] || ''} onChange={(val: any) => onUpdateValue(id, 'exchange_duty_percent', val)} suffix="%" /></TableCell>
                    </React.Fragment>
                );
                
                if (sec.id === 'sec-vendor') {
                    const costOverride = activeView === 'options' ? itemValues['opt_base_price_usd'] : itemValues['base_cost_override'];
                    const effectiveUsdCost = (costOverride !== undefined && costOverride !== '' && costOverride !== null) ? parseFloat(costOverride) : cost;
                    const convertedAudCost = (effectiveUsdCost || 0) * (exchangeRate || 1);
                    if (activeView === 'options') return <TableCell key={sec.id} className="p-0 border-r border-b border-slate-300"><EditableCell value={costOverride || ''} placeholder={cost ? cost.toFixed(2) : "0.00"} onChange={(val: any) => onUpdateValue(id, 'opt_base_price_usd', val)} align="right" suffix={vendorCurrency} /></TableCell>;
                    const landedAud = calculateLandedCost(itemValues, cost, exchangeRate);
                    return (
                        <React.Fragment key={sec.id}>
                            <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell value={costOverride || ''} placeholder={cost ? cost.toFixed(2) : "0.00"} onChange={(val: any) => onUpdateValue(id, 'base_cost_override', val)} align="right" suffix={vendorCurrency} /></TableCell>
                            <TableCell className="text-right text-[11px] font-black text-slate-950 border-r border-b border-slate-300 px-5 bg-slate-50/50">{formatCurrency(convertedAudCost, orgCurrency)}</TableCell>
                            <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell value={itemValues['vendor_factory_discount_usd'] || ''} onChange={(val: any) => onUpdateValue(id, 'vendor_factory_discount_usd', val)} align="right" suffix={vendorCurrency} /></TableCell>
                            <TableCell className="text-right text-[11px] font-black text-primary border-r border-b border-slate-300 px-5 bg-primary/[0.04]">{formatCurrency(landedAud, orgCurrency)}</TableCell>
                        </React.Fragment>
                    );
                }

                if (sec.id === 'sec-misc' && activeView === 'options') {
                    return <TableCell key={sec.id} className="p-0 border-r border-b border-slate-300"><EditableCell value={itemValues['opt_misc_charge_aud'] || ''} onChange={(val: any) => onUpdateValue(id, 'opt_misc_charge_aud', val)} align="right" suffix={orgCurrency} /></TableCell>;
                }

                if (sec.id === 'sec-financials' && activeView === 'options') {
                    const baseUsd = parseFloat(itemValues['opt_base_price_usd'] || cost || '0');
                    const miscAud = parseFloat(itemValues['opt_misc_charge_aud'] || '0');
                    const costToDate = (baseUsd * exchangeRate * 1.10) + miscAud;
                    const mu = parseFloat(itemValues['opt_markup_percent'] || '0');
                    const sell = costToDate / (1 - mu/100);
                    const gp = sell - costToDate;
                    return (
                        <React.Fragment key={sec.id}>
                            <TableCell className="text-right text-[11px] font-black text-slate-950 border-r border-b border-slate-300 px-5 bg-primary/[0.03]">{formatCurrency(costToDate, orgCurrency)}</TableCell>
                            <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell value={mu || ''} onChange={(val: any) => onUpdateValue(id, 'opt_markup_percent', val)} suffix="%" /></TableCell>
                            <TableCell className="text-right text-[11px] font-black text-green-600 border-r border-b border-slate-300 px-5 bg-green-500/[0.03]">{formatCurrency(gp, orgCurrency)}</TableCell>
                            <TableCell className="text-right text-[11px] font-black text-primary border-r border-b border-slate-300 px-5 bg-primary/5">{formatCurrency(sell, orgCurrency)}</TableCell>
                        </React.Fragment>
                    );
                }

                if (sec.id === 'sec-freight' && activeView === 'boats') {
                    return (
                        <React.Fragment key={sec.id}>
                            <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell value={itemValues['freight_ocean_usd'] || ''} onChange={(val: any) => onUpdateValue(id, 'freight_ocean_usd', val)} align="right" suffix={vendorCurrency} /></TableCell>
                            <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell value={itemValues['freight_base_usd'] || ''} onChange={(val: any) => onUpdateValue(id, 'freight_base_usd', val)} align="right" suffix={vendorCurrency} /></TableCell>
                            <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell value={itemValues['freight_road_aud'] || ''} onChange={(val: any) => onUpdateValue(id, 'freight_road_aud', val)} align="right" suffix={orgCurrency} /></TableCell>
                        </React.Fragment>
                    );
                }

                if (sec.id === 'sec-handling' && activeView === 'boats') {
                    const pdCost = parseFloat(itemValues['handling_pre_delivery_hours'] || '0') * parseFloat(itemValues['handling_labor_rate'] || '0');
                    return (
                        <React.Fragment key={sec.id}>
                            <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell value={itemValues['handling_boat_prep_usd'] || ''} onChange={(val: any) => onUpdateValue(id, 'handling_boat_prep_usd', val)} align="right" suffix={vendorCurrency} /></TableCell>
                            <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell value={itemValues['handling_other_charges_aud'] || ''} onChange={(val: any) => onUpdateValue(id, 'handling_other_charges_aud', val)} align="right" suffix={orgCurrency} /></TableCell>
                            <TableCell className="text-center border-r border-b border-slate-300 bg-white font-black text-[10px] text-primary">10%</TableCell>
                            <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell value={itemValues['handling_pre_delivery_code'] || ''} onChange={(val: any) => onUpdateValue(id, 'handling_pre_delivery_code', val)} /></TableCell>
                            <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell value={itemValues['handling_pre_delivery_hours'] || ''} onChange={(val: any) => onUpdateValue(id, 'handling_pre_delivery_hours', val)} /></TableCell>
                            <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell value={itemValues['handling_labor_rate'] || ''} onChange={(val: any) => onUpdateValue(id, 'handling_labor_rate', val)} align="right" prefix="$" /></TableCell>
                            <TableCell className="text-right text-[11px] font-black text-primary border-r border-b border-slate-300 px-5 bg-primary/[0.04]">{formatCurrency(pdCost, orgCurrency)}</TableCell>
                            <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell value={itemValues['handling_boat_detailing_aud'] || ''} onChange={(val: any) => onUpdateValue(id, 'handling_boat_detailing_aud', val)} align="right" suffix={orgCurrency} /></TableCell>
                            <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell value={itemValues['handling_fuel_litres'] || ''} onChange={(val: any) => onUpdateValue(id, 'handling_fuel_litres', val)} suffix="L" /></TableCell>
                        </React.Fragment>
                    );
                }

                if (sec.id === 'sec-markup' && activeView === 'boats') {
                    return (
                        <React.Fragment key={sec.id}>
                            <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell value={itemValues['markup_hull_percent'] || ''} onChange={(val: any) => onUpdateValue(id, 'markup_hull_percent', val)} suffix="%" /></TableCell>
                            <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell value={itemValues['markup_bmt_percent'] || ''} onChange={(val: any) => onUpdateValue(id, 'markup_bmt_percent', val)} suffix="%" /></TableCell>
                        </React.Fragment>
                    );
                }

                if (sec.id === 'sec-price-levels' && activeView === 'boats') {
                    return (
                        <React.Fragment key={sec.id}>
                            {['hull_cash', 'hull_trade', 'hull_subdealer', 'hull_subdealer_excl', 'hull_aus_sailing'].map(l => (
                                <React.Fragment key={l}>
                                    <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell value={itemValues[`${l}_price`] || ''} onChange={(val: any) => onUpdateValue(id, `${l}_price`, val)} align="right" suffix={orgCurrency} /></TableCell>
                                    <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell value={itemValues[`${l}_gp`] || ''} onChange={(val: any) => onUpdateValue(id, `${l}_gp`, val)} suffix="%" /></TableCell>
                                </React.Fragment>
                            ))}
                            <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell value={itemValues['hull_subdealer_srp'] || ''} onChange={(val: any) => onUpdateValue(id, 'hull_subdealer_srp', val)} align="right" suffix={orgCurrency} /></TableCell>
                            <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell value={itemValues['hull_subdealer_excl_srp'] || ''} onChange={(val: any) => onUpdateValue(id, 'hull_subdealer_excl_srp', val)} align="right" suffix={orgCurrency} /></TableCell>
                        </React.Fragment>
                    );
                }
                return <TableCell key={sec.id} className="border-r border-b border-slate-300" />;
            })}
        </TableRow>
    );
}

function PricingTable({ 
    filteredRanges, 
    expandedRanges, 
    toggleRange, 
    allModels, 
    allVariants, 
    activeSections, 
    activeView, 
    strategy, 
    onUpdateValue, 
    vendor, 
    organisation, 
    activeExchangeRate,
    totalCalculatedCols
}: any) {
    return (
        <div className="flex-1 overflow-auto min-w-0 bg-white">
            <Table className="border-separate border-spacing-0 w-max min-w-full table-auto">
                <TableHeader className="sticky top-0 z-[45] bg-white">
                    <TableRow className="hover:bg-transparent">
                        <TableHead className="w-[340px] sticky left-0 z-[50] bg-white border-r-2 border-b-2 border-slate-300 font-black uppercase text-[10px] shadow-[4px_0_15px_-2px_rgba(0,0,0,0.2)] py-5 px-8 text-slate-950">Series & SKU</TableHead>
                        {activeSections.map((sec: any) => (
                            <TableHead key={sec.id} colSpan={getSectionColCount(sec, activeView)} className="border-r border-b-2 border-slate-300 p-0 bg-slate-100">
                                <div className="flex items-center gap-3 p-3 min-h-[48px]">
                                    {!sec.isCollapsed && <span className="text-[10px] font-black uppercase tracking-[0.15em] text-primary">{sec.name}</span>}
                                </div>
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filteredRanges.map((range: any) => (
                        <React.Fragment key={range.id}>
                            <TableRow className="bg-slate-100 border-b-2 border-slate-300 cursor-pointer hover:bg-slate-200" onClick={() => toggleRange(range.id)}>
                                <TableCell className="sticky left-0 z-[30] bg-slate-100 py-4 px-8 font-black uppercase text-[11px] tracking-[0.1em] text-slate-950 border-r-2 border-slate-300 shadow-[4px_0_15px_-2px_rgba(0,0,0,0.2)]">
                                    <div className="flex items-center gap-4"><ChevronRight className={cn("h-4 w-4 text-primary transition-transform", expandedRanges.includes(range.id) && "rotate-90")} />{range.name} RANGE</div>
                                </TableCell>
                                {Array.from({ length: totalCalculatedCols }).map((_, i) => <TableCell key={i} className="border-b-2 border-slate-300 bg-slate-100/60" />)}
                            </TableRow>
                            {expandedRanges.includes(range.id) && allModels.filter((m: any) => m.rangeId === range.id).map((model: any) => (
                                <React.Fragment key={model.id}>
                                    <TableRow className="bg-slate-50">
                                        <TableCell className="sticky left-0 z-[30] bg-slate-50 py-3.5 px-10 border-r-2 border-b-2 border-slate-300 shadow-[4px_0_15px_-2px_rgba(0,0,0,0.2)]">
                                            <div className="flex flex-col"><span className="font-black text-[11px] uppercase tracking-tight text-slate-950">{model.name}</span><span className="text-[8px] font-black text-primary/90 uppercase">SERIES CODE: {model.modelCode}</span></div>
                                        </TableCell>
                                        {Array.from({ length: totalCalculatedCols }).map((_, i) => <TableCell key={i} className="border-b-2 border-slate-300 bg-slate-50/50" />)}
                                    </TableRow>
                                    {(activeView === 'boats' ? (allVariants[model.id] || []) : (model.optionalFeatures || [])).map((item: any, idx: number) => (
                                        <PricingRow 
                                            key={item.id} 
                                            id={item.id} 
                                            name={item.name} 
                                            sku={item.sku || item.code} 
                                            cost={item.cost} 
                                            sections={activeSections} 
                                            strategy={strategy} 
                                            onUpdateValue={onUpdateValue} 
                                            vendor={vendor} 
                                            organisation={organisation} 
                                            exchangeRate={activeExchangeRate} 
                                            rowIndex={idx} 
                                            activeView={activeView} 
                                            indent 
                                        />
                                    ))}
                                </React.Fragment>
                            ))}
                        </React.Fragment>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

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
    const { data: strategy, isLoading: strategyLoading } = useDoc<PricingStrategy>(strategyRef);

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

    const toggleRange = (id: string) => setExpandedRanges(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    
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

    const filteredRanges = useMemo(() => {
        if (!ranges) return [];
        if (!searchTerm) return ranges;
        const lower = searchTerm.toLowerCase();
        return ranges.filter(range => range.name.toLowerCase().includes(lower) || allModels.filter(m => m.rangeId === range.id).some(m => m.name.toLowerCase().includes(lower) || m.modelCode?.toLowerCase().includes(lower)));
    }, [ranges, searchTerm, allModels]);

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
                        <TabsTrigger value="boats" className="px-6 font-black uppercase text-[9px] tracking-widest data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg">Hull & SKUs</TabsTrigger>
                        <TabsTrigger value="options" className="px-6 font-black uppercase text-[9px] tracking-widest data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg">Factory Options</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>
            <div className="flex items-center gap-3">
                {isFocus ? (
                    <Button type="button" onClick={() => setIsFocusMode(false)} variant="outline" size="sm" className="h-10 px-4 font-black uppercase tracking-widest text-[10px] rounded-xl border-2 border-slate-300 bg-white hover:bg-slate-100 text-slate-900"><Minimize2 className="h-4 w-4 mr-2" /> EXIT FOCUS</Button>
                ) : (
                    <Button type="button" onClick={() => setIsFocusMode(true)} variant="outline" size="sm" className="h-10 px-4 font-black uppercase tracking-widest text-[10px] rounded-xl border-2 border-slate-300 bg-white hover:bg-slate-100 text-slate-900"><Maximize2 className="h-4 w-4 mr-2" /> FOCUS</Button>
                )}
            </div>
        </div>
    );

    if (loadingModels || strategyLoading) return <div className="flex-1 flex items-center justify-center h-96"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;

    return (
        <div className="flex flex-col h-full overflow-hidden bg-slate-50">
            {!isFocusMode && <WorkspaceHeader />}
            <div className="flex-1 min-h-0 min-w-0 bg-white flex flex-col overflow-hidden">
                <PricingTable 
                    filteredRanges={filteredRanges}
                    expandedRanges={expandedRanges}
                    toggleRange={toggleRange}
                    allModels={allModels}
                    allVariants={allVariants}
                    activeSections={activeSections}
                    activeView={activeView}
                    strategy={strategy}
                    onUpdateValue={onUpdateValue}
                    vendor={vendor}
                    organisation={organisation}
                    activeExchangeRate={activeExchangeRate}
                    totalCalculatedCols={totalCalculatedCols}
                />
            </div>

            <Dialog open={isFocusMode} onOpenChange={setIsFocusMode}>
                <DialogContent className="max-w-[98vw] w-[1600px] h-[95vh] rounded-[2.5rem] p-0 overflow-hidden border-4 border-slate-300 shadow-2xl flex flex-col [&>button]:hidden z-[150] bg-white">
                    <div className="flex flex-col h-full bg-background overflow-hidden">
                        <WorkspaceHeader isFocus />
                        <div className="flex-1 min-h-0 bg-white flex flex-col overflow-hidden">
                            <PricingTable 
                                filteredRanges={filteredRanges}
                                expandedRanges={expandedRanges}
                                toggleRange={toggleRange}
                                allModels={allModels}
                                allVariants={allVariants}
                                activeSections={activeSections}
                                activeView={activeView}
                                strategy={strategy}
                                onUpdateValue={onUpdateValue}
                                vendor={vendor}
                                organisation={organisation}
                                activeExchangeRate={activeExchangeRate}
                                totalCalculatedCols={totalCalculatedCols}
                            />
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

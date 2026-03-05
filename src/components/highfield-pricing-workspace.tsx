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
    Percent,
    TrendingUp,
    DollarSign
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { 
    Dialog, 
    DialogContent, 
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/currency-utils';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';

interface PricingSection {
    id: string;
    name: string;
    order: number;
}

interface PricingStrategy {
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
}

const getSellPrice = (cost: number, marginPercent: number) => {
    const factor = 1 - (marginPercent / 100);
    if (factor <= 0) return cost;
    return cost / factor;
};

const calculateHullLanded = (itemValues: Record<string, any>, baseCostUsd: number, exchangeRate: number): number => {
    const costOverride = itemValues['base_cost_override'];
    const usdBase = (costOverride !== undefined && costOverride !== '' && costOverride !== null) ? parseFloat(costOverride) : baseCostUsd;
    
    const discountUsd = parseFloat(itemValues['vendor_factory_discount_usd'] || '0');
    const dutyPercent = parseFloat(itemValues['exchange_duty_percent'] || '0');

    const totalUsd = (usdBase || 0) - discountUsd;
    const baseAud = totalUsd * exchangeRate;
    const withDuty = baseAud * (1 + (dutyPercent / 100));
    const withGst = withDuty * 1.10;
    
    return withGst;
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

function PricingRow({ 
    id, name, sku, cost, strategy, onUpdateValue, indent, isOption, vendor, organisation, exchangeRate, rowIndex, activeView 
}: any) {
    const itemValues = strategy?.itemValues?.[id] || {};
    const orgCurrency = organisation?.tradingCurrency || 'AUD';
    const vendorCurrency = vendor.currency || 'USD';
    const rowBgClass = rowIndex % 2 === 0 ? "bg-white" : "bg-slate-50";

    const hullLandedAud = calculateHullLanded(itemValues, cost || 0, exchangeRate);

    const freightCost = parseFloat(itemValues['op_freight_cost_aud'] || '0');
    const freightMargin = parseFloat(itemValues['op_freight_margin_percent'] || '0');
    const freightSell = getSellPrice(freightCost, freightMargin);
    const freightGP = freightSell - freightCost;

    const handlingCost = parseFloat(itemValues['op_handling_cost_aud'] || '0');
    const handlingMargin = parseFloat(itemValues['op_handling_margin_percent'] || '0');
    const handlingSell = getSellPrice(handlingCost, handlingMargin);
    const handlingGP = handlingSell - handlingCost;

    const preDelCost = parseFloat(itemValues['op_predel_cost_aud'] || '0');
    const preDelMargin = parseFloat(itemValues['op_predel_margin_percent'] || '0');
    const preDelSell = getSellPrice(preDelCost, preDelMargin);
    const preDelGP = preDelSell - preDelCost;

    const totalStrategicLanded = hullLandedAud + freightSell + handlingSell + preDelSell;
    const stratMarginPercent = parseFloat(itemValues['strat_package_margin_percent'] || '0');
    const totalPackageSell = getSellPrice(totalStrategicLanded, stratMarginPercent);
    const totalPackageGP = totalPackageSell - totalStrategicLanded;

    return (
        <TableRow className={cn("transition-colors group", rowBgClass)}>
            <TableCell className={cn("sticky left-0 z-[30] border-r-2 border-b border-slate-300 shadow-[4px_0_15px_-2px_rgba(0,0,0,0.2)] transition-colors group-hover:bg-primary/[0.03]", rowBgClass, indent ? "pl-20" : "px-8")}>
                <div className="flex flex-col min-w-0">
                    <span className={cn("font-black text-[11px] uppercase truncate tracking-tight mb-0.5", isOption ? "text-slate-700" : "text-slate-950")}>{name}</span>
                    <div className="flex items-center gap-2">
                        <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-tighter">{sku || 'NO SKU'}</span>
                        {isOption && <Badge className="text-[7px] font-black h-3.5 px-1.5 bg-slate-200 text-slate-700 border-none">OPT</Badge>}
                    </div>
                </div>
            </TableCell>

            {/* Exchange Section */}
            <TableCell className="text-center border-r border-b border-slate-300 bg-white"><Badge variant="outline" className="font-black text-[9px] tracking-tighter text-slate-500 border-slate-300">{vendorCurrency}</Badge></TableCell>
            <TableCell className="text-center border-r border-b border-slate-300 bg-white text-[10px] font-black text-primary">{exchangeRate.toFixed(4)}</TableCell>
            <TableCell className="text-center border-r border-b border-slate-300 bg-white"><Badge variant="outline" className="font-black text-[9px] tracking-tighter text-slate-500 border-slate-300">{orgCurrency}</Badge></TableCell>
            <TableCell className="text-center border-r border-b border-slate-300 bg-white text-[10px] font-black text-primary">1.0000</TableCell>
            <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell value={itemValues['exchange_duty_percent'] || ''} onChange={(val: any) => onUpdateValue(id, 'exchange_duty_percent', val)} suffix="%" /></TableCell>

            {activeView === 'boats' ? (
                <>
                    {/* Hull Landed Cost */}
                    <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell value={itemValues['base_cost_override'] || ''} placeholder={cost ? cost.toFixed(2) : "0.00"} onChange={(val: any) => onUpdateValue(id, 'base_cost_override', val)} align="right" suffix={vendorCurrency} /></TableCell>
                    <TableCell className="text-right text-[11px] font-black text-slate-950 border-r border-b border-slate-300 px-5 bg-slate-50/50">{formatCurrency((parseFloat(itemValues['base_cost_override'] || cost || '0')) * exchangeRate, orgCurrency)}</TableCell>
                    <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell value={itemValues['vendor_factory_discount_usd'] || ''} onChange={(val: any) => onUpdateValue(id, 'vendor_factory_discount_usd', val)} align="right" suffix={vendorCurrency} /></TableCell>
                    <TableCell className="text-right text-[11px] font-black text-primary border-r border-b border-slate-300 px-5 bg-primary/[0.04]">{formatCurrency(hullLandedAud, orgCurrency)}</TableCell>

                    {/* Freight */}
                    <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell value={itemValues['op_freight_cost_aud'] || ''} onChange={(val: any) => onUpdateValue(id, 'op_freight_cost_aud', val)} align="right" suffix={orgCurrency} /></TableCell>
                    <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell value={itemValues['op_freight_margin_percent'] || ''} onChange={(val: any) => onUpdateValue(id, 'op_freight_margin_percent', val)} suffix="%" /></TableCell>
                    <TableCell className="text-right text-[11px] font-black text-green-600 border-r border-b border-slate-300 px-5 bg-green-500/[0.03]">{formatCurrency(freightGP, orgCurrency)}</TableCell>

                    {/* Handling */}
                    <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell value={itemValues['op_handling_cost_aud'] || ''} onChange={(val: any) => onUpdateValue(id, 'op_handling_cost_aud', val)} align="right" suffix={orgCurrency} /></TableCell>
                    <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell value={itemValues['op_handling_margin_percent'] || ''} onChange={(val: any) => onUpdateValue(id, 'op_handling_margin_percent', val)} suffix="%" /></TableCell>
                    <TableCell className="text-right text-[11px] font-black text-green-600 border-r border-b border-slate-300 px-5 bg-green-500/[0.03]">{formatCurrency(handlingGP, orgCurrency)}</TableCell>

                    {/* Pre-Delivery */}
                    <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell value={itemValues['op_predel_cost_aud'] || ''} onChange={(val: any) => onUpdateValue(id, 'op_predel_cost_aud', val)} align="right" suffix={orgCurrency} /></TableCell>
                    <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell value={itemValues['op_predel_margin_percent'] || ''} onChange={(val: any) => onUpdateValue(id, 'op_predel_margin_percent', val)} suffix="%" /></TableCell>
                    <TableCell className="text-right text-[11px] font-black text-green-600 border-r border-b border-slate-300 px-5 bg-green-500/[0.03]">{formatCurrency(preDelGP, orgCurrency)}</TableCell>

                    {/* Strategic Totals */}
                    <TableCell className="text-right text-[11px] font-black text-slate-950 border-r border-b border-slate-300 px-5 bg-slate-100/50">{formatCurrency(totalStrategicLanded, orgCurrency)}</TableCell>
                    <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell value={itemValues['strat_package_margin_percent'] || ''} onChange={(val: any) => onUpdateValue(id, 'strat_package_margin_percent', val)} suffix="%" /></TableCell>
                    <TableCell className="text-right text-[11px] font-black text-green-600 border-r border-b border-slate-300 px-5 bg-green-500/[0.05]">{formatCurrency(totalPackageGP, orgCurrency)}</TableCell>

                    {/* Price Levels */}
                    {['hull_cash', 'hull_trade', 'hull_subdealer', 'hull_subdealer_excl', 'hull_aus_sailing'].map(l => {
                        const sell = parseFloat(itemValues[`${l}_price`] || '0');
                        const gpPercent = sell > 0 ? ((sell - totalStrategicLanded) / sell) * 100 : 0;
                        return (
                            <React.Fragment key={l}>
                                <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell value={itemValues[`${l}_price`] || ''} onChange={(val: any) => onUpdateValue(id, `${l}_price`, val)} align="right" suffix={orgCurrency} /></TableCell>
                                <TableCell className="text-center text-[10px] font-black text-green-600 border-r border-b border-slate-300 bg-green-500/[0.02]">{gpPercent.toFixed(1)}%</TableCell>
                            </React.Fragment>
                        );
                    })}
                    <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell value={itemValues['hull_subdealer_srp'] || ''} onChange={(val: any) => onUpdateValue(id, 'hull_subdealer_srp', val)} align="right" suffix={orgCurrency} /></TableCell>
                    <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell value={itemValues['hull_subdealer_excl_srp'] || ''} onChange={(val: any) => onUpdateValue(id, 'hull_subdealer_excl_srp', val)} align="right" suffix={orgCurrency} /></TableCell>
                </>
            ) : (
                <>
                    {/* Options View Logic */}
                    <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell value={itemValues['opt_base_price_usd'] || ''} placeholder={cost ? cost.toFixed(2) : "0.00"} onChange={(val: any) => onUpdateValue(id, 'opt_base_price_usd', val)} align="right" suffix={vendorCurrency} /></TableCell>
                    <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell value={itemValues['opt_misc_charge_aud'] || ''} onChange={(val: any) => onUpdateValue(id, 'opt_misc_charge_aud', val)} align="right" suffix={orgCurrency} /></TableCell>
                    {(() => {
                        const baseUsd = parseFloat(itemValues['opt_base_price_usd'] || cost || '0');
                        const miscAud = parseFloat(itemValues['opt_misc_charge_aud'] || '0');
                        const costToDate = (baseUsd * exchangeRate * 1.10) + miscAud;
                        const mu = parseFloat(itemValues['opt_markup_percent'] || '0');
                        const sell = costToDate / (1 - mu/100);
                        const gp = sell - costToDate;
                        return (
                            <React.Fragment>
                                <TableCell className="text-right text-[11px] font-black text-slate-950 border-r border-b border-slate-300 px-5 bg-primary/[0.03]">{formatCurrency(costToDate, orgCurrency)}</TableCell>
                                <TableCell className="p-0 border-r border-b border-slate-300"><EditableCell value={mu || ''} onChange={(val: any) => onUpdateValue(id, 'opt_markup_percent', val)} suffix="%" /></TableCell>
                                <TableCell className="text-right text-[11px] font-black text-green-600 border-r border-b border-slate-300 px-5 bg-green-500/[0.03]">{formatCurrency(gp, orgCurrency)}</TableCell>
                                <TableCell className="text-right text-[11px] font-black text-primary border-r border-b border-slate-300 px-5 bg-primary/5">{formatCurrency(sell, orgCurrency)}</TableCell>
                            </React.Fragment>
                        );
                    })()}
                </>
            )}
        </TableRow>
    );
}

function PricingTable({ 
    filteredRanges, expandedRanges, toggleRange, allModels, allVariants, activeView, strategy, onUpdateValue, vendor, organisation, activeExchangeRate 
}: any) {
    const isOptions = activeView === 'options';
    const totalCalculatedCols = isOptions ? 11 : 34;

    return (
        <div className="flex-1 overflow-auto min-w-0 bg-white border-t scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-slate-100">
            <Table className="border-separate border-spacing-0 w-max min-w-full table-auto">
                <TableHeader className="sticky top-0 z-[45] bg-white">
                    {/* Header Row 1: Groups */}
                    <TableRow className="hover:bg-transparent">
                        <TableHead className="w-[340px] sticky left-0 z-[50] bg-white border-r-2 border-b font-black uppercase text-[10px] shadow-[4px_0_15px_-2px_rgba(0,0,0,0.2)] py-5 px-8 text-slate-950">Series & SKU</TableHead>
                        <TableHead colSpan={5} className="border-r border-b bg-slate-50 text-center border-slate-200">
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">Exchange Rate</span>
                        </TableHead>
                        {isOptions ? (
                            <>
                                <TableHead className="border-r border-b bg-slate-50 text-center border-slate-200"><span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">Vendor Base</span></TableHead>
                                <TableHead className="border-r border-b bg-slate-50 text-center border-slate-200"><span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">Misc Charges</span></TableHead>
                                <TableHead colSpan={4} className="border-r border-b bg-slate-50 text-center border-slate-200"><span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">Pricing Strategy</span></TableHead>
                            </>
                        ) : (
                            <>
                                <TableHead colSpan={4} className="border-r border-b bg-slate-50 text-center border-slate-200"><span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">Hull Landed Cost</span></TableHead>
                                <TableHead colSpan={3} className="border-r border-b bg-slate-50 text-center border-slate-200"><span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">Freight</span></TableHead>
                                <TableHead colSpan={3} className="border-r border-b bg-slate-50 text-center border-slate-200"><span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">Handling</span></TableHead>
                                <TableHead colSpan={3} className="border-r border-b bg-slate-50 text-center border-slate-200"><span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">Pre-Delivery</span></TableHead>
                                <TableHead colSpan={3} className="border-r border-b bg-slate-50 text-center border-slate-200"><span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">Strategic Totals</span></TableHead>
                                <TableHead colSpan={12} className="border-r border-b bg-slate-50 text-center border-slate-200"><span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">Strategic Price Levels</span></TableHead>
                            </>
                        )}
                    </TableRow>
                    
                    {/* Header Row 2: Columns */}
                    <TableRow className="hover:bg-transparent bg-white shadow-sm">
                        <TableHead className="sticky left-0 z-[50] bg-white border-r-2 border-b-2 border-slate-300 shadow-[4px_0_15px_-2px_rgba(0,0,0,0.2)]"></TableHead>
                        {/* Exchange Rate Cols */}
                        <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white w-[60px]">From</TableHead>
                        <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white w-[80px]">Rate</TableHead>
                        <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white w-[60px]">To</TableHead>
                        <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white w-[80px]">Rate</TableHead>
                        <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white w-[80px]">Duty %</TableHead>

                        {isOptions ? (
                            <>
                                <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white">Base USD</TableHead>
                                <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white">Misc AUD</TableHead>
                                <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white">Landed AUD</TableHead>
                                <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white">Margin %</TableHead>
                                <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white">GP $</TableHead>
                                <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-primary/5 text-primary">Sell AUD</TableHead>
                            </>
                        ) : (
                            <>
                                {/* Hull Cost Cols */}
                                <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white">Base USD</TableHead>
                                <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white">AUD Conv</TableHead>
                                <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white">Discount</TableHead>
                                <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white font-bold text-primary">Landed AUD</TableHead>
                                
                                {/* Freight Cols */}
                                <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white">Cost AUD</TableHead>
                                <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white">Margin %</TableHead>
                                <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white">GP $</TableHead>

                                {/* Handling Cols */}
                                <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white">Cost AUD</TableHead>
                                <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white">Margin %</TableHead>
                                <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white">GP $</TableHead>

                                {/* Pre-Del Cols */}
                                <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white">Cost AUD</TableHead>
                                <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white">Margin %</TableHead>
                                <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white">GP $</TableHead>

                                {/* Strategic Totals Cols */}
                                <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-slate-50 font-bold">Total Landed</TableHead>
                                <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-slate-50">Strat Margin</TableHead>
                                <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-slate-50 text-green-600">Total GP $</TableHead>

                                {/* Price Level Cols */}
                                {['Cash Price', 'GP %', 'Trade Price', 'GP %', 'Sub-D Price', 'GP %', 'Sub-Ex Price', 'GP %', 'AUS Price', 'GP %'].map(l => (
                                    <TableHead key={l} className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white">{l}</TableHead>
                                ))}
                                <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white">Sub-D SRP</TableHead>
                                <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white">Sub-Ex SRP</TableHead>
                            </>
                        )}
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
        const currentValues = strategy?.itemValues || {};
        const oldValue = currentValues[itemId]?.[colId];
        const updated = { ...currentValues, [itemId]: { ...(currentValues[itemId] || {}), [colId]: value } };
        
        updateDoc(strategyRef, { itemValues: updated, lastUpdateAt: serverTimestamp() });
        
        const logRef = collection(firestore, `organisations/${organisationId}/pricingStrategies/${vendor.id}/auditLog`);
        addDoc(logRef, {
            itemId, colId, oldValue: oldValue ?? null, newValue: value, timestamp: serverTimestamp(),
            userId: user?.uid, userName: user?.displayName || user?.email || 'System'
        });
    };

    const toggleRange = (id: string) => setExpandedRanges(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    
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
                <Button 
                    type="button" 
                    onClick={() => setIsFocusMode(!isFocusMode)} 
                    variant="outline" 
                    size="sm" 
                    className="h-10 px-4 font-black uppercase tracking-widest text-[10px] rounded-xl border-2 border-slate-300 bg-white hover:bg-slate-100 text-slate-900"
                >
                    {isFocusMode ? <Minimize2 className="h-4 w-4 mr-2" /> : <Maximize2 className="h-4 w-4 mr-2" />}
                    {isFocusMode ? 'EXIT FOCUS' : 'FOCUS'}
                </Button>
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
                    activeView={activeView}
                    strategy={strategy}
                    onUpdateValue={onUpdateValue}
                    vendor={vendor}
                    organisation={organisation}
                    activeExchangeRate={activeExchangeRate}
                />
            </div>

            <Dialog open={isFocusMode} onOpenChange={setIsFocusMode}>
                <DialogContent className="max-w-[98vw] w-[1600px] h-[95vh] rounded-[2.5rem] p-0 overflow-hidden border-4 border-slate-300 shadow-2xl flex flex-col [&>button]:hidden z-[150] bg-white">
                    <DialogHeader className="sr-only">
                        <DialogTitle>Highfield Strategic Pricing Matrix - Focus Mode</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col h-full bg-background overflow-hidden">
                        <WorkspaceHeader isFocus />
                        <div className="flex-1 min-h-0 bg-white flex flex-col overflow-hidden">
                            <PricingTable 
                                filteredRanges={filteredRanges}
                                expandedRanges={expandedRanges}
                                toggleRange={toggleRange}
                                allModels={allModels}
                                allVariants={allVariants}
                                activeView={activeView}
                                strategy={strategy}
                                onUpdateValue={onUpdateValue}
                                vendor={vendor}
                                organisation={organisation}
                                activeExchangeRate={activeExchangeRate}
                            />
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
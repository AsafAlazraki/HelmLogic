
'use client';

import { useUser } from "@/firebase/auth/use-user";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useCollection } from "@/firebase/firestore/use-collection";
import { useFirestore, useMemoFirebase } from "@/firebase/provider";
import { doc, collection, query, where, getDocs, updateDoc, serverTimestamp, orderBy, addDoc } from "firebase/firestore";
import React, { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Building, Search, Coins, ChevronRight, ShieldAlert, Zap, Maximize2, Minimize2, ArrowRightLeft, Percent, Save, Ship, ChevronDown, CheckCircle2, Star, History, Clock, Link2, MessageSquare, ClipboardList, ShieldCheck, Calculator, Truck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import NextImage from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/currency-utils";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Vendor {
    id: string;
    name: string;
    logoUrl?: string;
    vendorType: string;
    slug?: string;
    currency?: string;
}

interface Organisation {
    id: string;
    name: string;
    roles?: any[];
    tradingCurrency?: string;
    dataWarehouseSubscriptions?: string[];
    permissions?: Record<string, Record<string, boolean>>;
    gstPercentage?: number;
    shortCode?: string;
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
    cost?: number;
}

interface Variant {
    id: string;
    sku: string | null;
    name: string;
    cost?: number;
}

const getSellPrice = (cost: number, marginPercent: number) => {
    const factor = 1 - (marginPercent / 100);
    if (factor <= 0) return cost;
    return cost / factor;
};

const calculateBaseCostAudEx = (itemValues: Record<string, any>, baseCostUsd: number, exchangeRate: number): number => {
    const costOverride = itemValues['base_cost_override'];
    const usdBase = (costOverride !== undefined && costOverride !== '' && costOverride !== null) ? parseFloat(costOverride) : baseCostUsd;
    const discountUsd = parseFloat(itemValues['factory_discount_usd'] || '0');
    const dutyPercent = parseFloat(itemValues['exchange_duty_percent'] || '0');

    const totalUsd = (usdBase || 0) - discountUsd;
    const baseAud = exchangeRate > 0 ? totalUsd / exchangeRate : totalUsd;
    const withDuty = baseAud * (1 + (dutyPercent / 100));
    
    return withDuty;
};

function EditableCell({ value, onChange, placeholder, align = 'center' }: any) {
    const [localValue, setLocalValue] = useState(value || '');
    
    useEffect(() => { setLocalValue(value || ''); }, [value]);
    
    const handleBlur = () => { 
        if (String(localValue) !== String(value || '')) {
            onChange(localValue); 
        }
    };

    return (
        <div className="h-full flex items-center bg-transparent min-h-[40px] pricing-matrix-cell">
            <input 
                className={cn(
                    "h-full w-full bg-transparent border-none text-[11px] outline-none px-2 transition-colors relative z-10",
                    align === 'right' ? "text-right" : "text-center",
                    localValue !== '' ? "text-primary font-black" : "text-slate-900 font-bold"
                )} 
                value={localValue} 
                onChange={e => setLocalValue(e.target.value)} 
                onBlur={handleBlur} 
                placeholder={placeholder || "-"} 
            />
        </div>
    );
}

function PricingRow({ 
    id, name, sku, cost, strategy, onUpdateValue, indent, isOption, vendor, organisation, exchangeRate, rowIndex, activeView 
}: any) {
    const itemValues = strategy?.itemValues?.[id] || {};
    const orgCurrency = organisation?.tradingCurrency || 'AUD';
    const gstRate = (organisation?.gstPercentage || 10) / 100;
    const gstMultiplier = 1 + gstRate;
    const rowBgClass = rowIndex % 2 === 0 ? "bg-white" : "bg-slate-50";

    const baseCostAudEx = calculateBaseCostAudEx(itemValues, cost || 0, exchangeRate);
    const baseCostAudIn = baseCostAudEx * gstMultiplier;

    // 1. Sea Freight (International)
    const seaFreightUsd = parseFloat(itemValues['op_sea_freight_cost_usd'] || '0');
    const seaFreightAudConv = exchangeRate > 0 ? seaFreightUsd / exchangeRate : seaFreightUsd;
    const seaFreightFinalCost = parseFloat(itemValues['op_sea_freight_cost_aud'] || seaFreightAudConv.toFixed(2));
    const seaFreightMargin = parseFloat(itemValues['op_sea_freight_margin_percent'] || '0');
    const seaFreightSell = getSellPrice(seaFreightFinalCost, seaFreightMargin);
    const seaFreightGP = seaFreightSell - seaFreightFinalCost;

    // 2. Road Freight (Domestic)
    const roadFreightCost = parseFloat(itemValues['op_road_freight_cost_aud'] || '0');
    const roadFreightMargin = parseFloat(itemValues['op_road_freight_margin_percent'] || '0');
    const roadFreightSell = getSellPrice(roadFreightCost, roadFreightMargin);
    const roadFreightGP = roadFreightSell - roadFreightCost;

    // 3. Handling
    const handlingCost = parseFloat(itemValues['op_handling_cost_aud'] || '0');
    const handlingMargin = parseFloat(itemValues['op_handling_margin_percent'] || '0');
    const handlingSell = getSellPrice(handlingCost, handlingMargin);
    const handlingGP = handlingSell - handlingCost;

    // 4. Pre-Delivery
    const preDelCost = parseFloat(itemValues['op_predel_cost_aud'] || '0');
    const preDelMargin = parseFloat(itemValues['op_predel_margin_percent'] || '0');
    const preDelSell = getSellPrice(preDelCost, preDelMargin);
    const preDelGP = preDelSell - preDelCost;

    // Baseline Summation
    const totalStrategicLandedEx = baseCostAudEx + (activeView === 'boats' ? (seaFreightSell + roadFreightSell + preDelSell) : 0) + (isOption ? 0 : handlingSell);
    const marginPercent = parseFloat(itemValues['strat_package_margin_percent'] || '0');
    const totalPackageSell = getSellPrice(totalStrategicLandedEx, marginPercent);
    const totalPackageGP = totalPackageSell - totalStrategicLandedEx;

    return (
        <TableRow className={cn("transition-colors group h-[40px]", rowBgClass)}>
            <TableCell className={cn("sticky left-0 z-[80] border-r-2 border-b border-slate-300 shadow-[4px_0_10px_-2px_rgba(0,0,0,0.1)] transition-colors group-hover:bg-primary/5", rowBgClass, indent ? "pl-16" : "px-8")}>
                <div className="flex flex-col min-w-[240px] relative z-10">
                    <span className={cn("font-black text-[11px] uppercase truncate tracking-tight", isOption ? "text-slate-700" : "text-slate-950")}>{name}</span>
                    <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-tighter">{sku || 'NO SKU'}</span>
                </div>
            </TableCell>

            <TableCell className="text-center border-r border-b border-slate-200 bg-white hover:bg-primary/10 relative"><Badge variant="outline" className="font-black text-[8px] h-4 border-slate-200 relative z-10">{(vendor?.currency || 'USD')}</Badge></TableCell>
            <TableCell className="text-center border-r border-b border-slate-200 bg-white text-[10px] font-black text-primary hover:bg-primary/10 relative"><span className="relative z-10">{exchangeRate.toFixed(4)}</span></TableCell>
            <TableCell className="text-center border-r border-b border-slate-200 bg-white hover:bg-primary/10 relative"><Badge variant="outline" className="font-black text-[8px] h-4 border-slate-200 relative z-10">{orgCurrency}</Badge></TableCell>
            <TableCell className="text-center border-r border-b border-slate-200 bg-white text-[10px] font-black text-primary hover:bg-primary/10 relative"><span className="relative z-10">1.0000</span></TableCell>
            <TableCell className="p-0 border-r border-b border-slate-200 hover:bg-primary/10 relative bg-white"><EditableCell value={itemValues['exchange_duty_percent'] || ''} onChange={(val: any) => onUpdateValue(id, 'exchange_duty_percent', val)} /></TableCell>

            <TableCell className="p-0 border-r border-b border-slate-200 hover:bg-primary/10 relative bg-white"><EditableCell value={itemValues['base_cost_override'] || ''} placeholder={cost ? cost.toFixed(2) : "0.00"} onChange={(val: any) => onUpdateValue(id, 'base_cost_override', val)} align="right" /></TableCell>
            <TableCell className="text-right text-[10px] font-black text-slate-900 border-r border-b border-slate-200 px-4 bg-slate-50 hover:bg-primary/10 relative"><span className="relative z-10">{formatCurrency((parseFloat(itemValues['base_cost_override'] || cost || '0')) / (exchangeRate || 1), orgCurrency)}</span></TableCell>
            <TableCell className="p-0 border-r border-b border-slate-200 hover:bg-primary/10 relative bg-white"><EditableCell value={itemValues['factory_discount_usd'] || ''} onChange={(val: any) => onUpdateValue(id, 'factory_discount_usd', val)} align="right" /></TableCell>
            <TableCell className="text-right text-[10px] font-black text-slate-900 border-r border-b border-slate-200 px-4 bg-slate-50 hover:bg-primary/10 relative"><span className="relative z-10">{formatCurrency((parseFloat(itemValues['factory_discount_usd'] || '0')) / (exchangeRate || 1), orgCurrency)}</span></TableCell>
            <TableCell className="text-right text-[10px] font-black text-primary border-r border-b border-slate-200 px-4 bg-primary/5 hover:bg-primary/10 relative"><span className="relative z-10">{formatCurrency(baseCostAudEx, orgCurrency)}</span></TableCell>
            <TableCell className="text-right text-[10px] font-black text-primary border-r border-b border-slate-200 px-4 bg-primary/10 hover:bg-primary/10 relative"><span className="relative z-10">{formatCurrency(baseCostAudIn, orgCurrency)}</span></TableCell>

            {activeView === 'boats' && (
                <React.Fragment>
                    <TableCell className="p-0 border-r border-b border-slate-200 hover:bg-primary/10 relative bg-white"><EditableCell value={itemValues['op_sea_freight_cost_usd'] || ''} onChange={(val: any) => onUpdateValue(id, 'op_sea_freight_cost_usd', val)} align="right" /></TableCell>
                    <TableCell className="text-right text-[10px] font-black text-slate-900 border-r border-b border-slate-200 px-4 bg-slate-50 relative"><span className="relative z-10">{formatCurrency(seaFreightAudConv, orgCurrency)}</span></TableCell>
                    <TableCell className="p-0 border-r border-b border-slate-200 hover:bg-primary/10 relative bg-white"><EditableCell value={itemValues['op_sea_freight_cost_aud'] || seaFreightAudConv.toFixed(2)} onChange={(val: any) => onUpdateValue(id, 'op_sea_freight_cost_aud', val)} align="right" /></TableCell>
                    <TableCell className="p-0 border-r border-b border-slate-200 hover:bg-primary/10 relative bg-white"><EditableCell value={itemValues['op_sea_freight_margin_percent'] || ''} onChange={(val: any) => onUpdateValue(id, 'op_sea_freight_margin_percent', val)} /></TableCell>
                    <TableCell className="text-right text-[10px] font-black text-primary border-r border-b border-slate-200 px-4 bg-primary/5 relative font-black"><span className="relative z-10">{formatCurrency(seaFreightSell, orgCurrency)}</span></TableCell>
                    <TableCell className="text-right text-[10px] font-black text-green-600 border-r border-b border-slate-200 px-4 bg-green-500/5 relative"><span className="relative z-10">{formatCurrency(seaFreightGP, orgCurrency)}</span></TableCell>

                    <TableCell className="p-0 border-r border-b border-slate-200 hover:bg-primary/10 relative bg-white"><EditableCell value={itemValues['op_road_freight_cost_aud'] || ''} onChange={(val: any) => onUpdateValue(id, 'op_road_freight_cost_aud', val)} align="right" /></TableCell>
                    <TableCell className="p-0 border-r border-b border-slate-200 hover:bg-primary/10 relative bg-white"><EditableCell value={itemValues['op_road_freight_margin_percent'] || ''} onChange={(val: any) => onUpdateValue(id, 'op_road_freight_margin_percent', val)} /></TableCell>
                    <TableCell className="text-right text-[10px] font-black text-primary border-r border-b border-slate-200 px-4 bg-primary/5 relative font-black"><span className="relative z-10">{formatCurrency(roadFreightSell, orgCurrency)}</span></TableCell>
                    <TableCell className="text-right text-[10px] font-black text-green-600 border-r border-b border-slate-200 px-4 bg-green-500/5 relative"><span className="relative z-10">{formatCurrency(roadFreightGP, orgCurrency)}</span></TableCell>
                </React.Fragment>
            )}

            <TableCell className="p-0 border-r border-b border-slate-200 hover:bg-primary/10 relative bg-white"><EditableCell value={itemValues['op_handling_cost_aud'] || ''} onChange={(val: any) => onUpdateValue(id, 'op_handling_cost_aud', val)} align="right" /></TableCell>
            <TableCell className="p-0 border-r border-b border-slate-200 hover:bg-primary/10 relative bg-white"><EditableCell value={itemValues['op_handling_margin_percent'] || ''} onChange={(val: any) => onUpdateValue(id, 'op_handling_margin_percent', val)} /></TableCell>
            <TableCell className="text-right text-[10px] font-black text-primary border-r border-b border-slate-200 px-4 bg-primary/5 relative font-black"><span className="relative z-10">{formatCurrency(handlingSell, orgCurrency)}</span></TableCell>
            <TableCell className="text-right text-[10px] font-black text-green-600 border-r border-b border-slate-200 px-4 bg-green-500/5 relative"><span className="relative z-10">{formatCurrency(handlingGP, orgCurrency)}</span></TableCell>

            {activeView === 'boats' && (
                <React.Fragment>
                    <TableCell className="p-0 border-r border-b border-slate-200 hover:bg-primary/10 relative bg-white"><EditableCell value={itemValues['op_predel_cost_aud'] || ''} onChange={(val: any) => onUpdateValue(id, 'op_predel_cost_aud', val)} align="right" /></TableCell>
                    <TableCell className="p-0 border-r border-b border-slate-200 hover:bg-primary/10 relative bg-white"><EditableCell value={itemValues['op_predel_margin_percent'] || ''} onChange={(val: any) => onUpdateValue(id, 'op_predel_margin_percent', val)} /></TableCell>
                    <TableCell className="text-right text-[10px] font-black text-primary border-r border-b border-slate-200 px-4 bg-primary/5 relative font-black"><span className="relative z-10">{formatCurrency(preDelSell, orgCurrency)}</span></TableCell>
                    <TableCell className="text-right text-[10px] font-black text-green-600 border-r border-b border-slate-200 px-4 bg-green-500/5 relative"><span className="relative z-10">{formatCurrency(preDelGP, orgCurrency)}</span></TableCell>
                </React.Fragment>
            )}

            <TableCell className="text-right text-[10px] font-black text-slate-950 border-r-2 border-b border-slate-300 px-4 bg-slate-100 relative"><span className="relative z-10">{formatCurrency(totalStrategicLandedEx, orgCurrency)}</span></TableCell>
            <TableCell className="p-0 border-r border-b border-slate-300 hover:bg-primary/10 relative bg-white"><EditableCell value={itemValues['strat_package_margin_percent'] || ''} onChange={(val: any) => onUpdateValue(id, 'strat_package_margin_percent', val)} /></TableCell>
            <TableCell className="text-right text-[10px] font-black text-green-600 border-r-2 border-b border-slate-300 px-4 bg-green-500/10 relative"><span className="relative z-10">{formatCurrency(totalPackageGP, orgCurrency)}</span></TableCell>

            {activeView === 'boats' ? (
                ['hull_cash', 'hull_trade', 'hull_subdealer', 'hull_subdealer_excl', 'hull_aus_sailing'].map(l => {
                    const sellEx = parseFloat(itemValues[`${l}_price`] || '0');
                    const sellIn = sellEx * gstMultiplier;
                    const gpPercent = sellEx > 0 ? ((sellEx - totalStrategicLandedEx) / sellEx) * 100 : 0;
                    return (
                        <React.Fragment key={l}>
                            <TableCell className="p-0 border-r border-b border-slate-200 hover:bg-primary/10 relative bg-white"><EditableCell value={itemValues[`${l}_price`] || ''} onChange={(val: any) => onUpdateValue(id, `${l}_price`, val)} align="right" /></TableCell>
                            <TableCell className="text-right text-[10px] font-black text-slate-900 border-r border-b border-slate-200 px-4 bg-slate-50 relative"><span className="relative z-10">{formatCurrency(sellIn, orgCurrency)}</span></TableCell>
                            <TableCell className="text-center text-[10px] font-black text-green-600 border-r border-b border-slate-200 bg-green-500/5 relative"><span className="relative z-10">{gpPercent.toFixed(1)}%</span></TableCell>
                        </React.Fragment>
                    );
                })
            ) : (
                <React.Fragment>
                    <TableCell className="p-0 border-r border-b border-slate-200 hover:bg-primary/10 relative bg-white"><EditableCell value={itemValues['hull_cash_price'] || ''} onChange={(val: any) => onUpdateValue(id, 'hull_cash_price', val)} align="right" /></TableCell>
                    {(() => {
                        const sellEx = parseFloat(itemValues['hull_cash_price'] || '0');
                        const sellIn = sellEx * gstMultiplier;
                        const gpPercent = sellEx > 0 ? ((sellEx - totalStrategicLandedEx) / sellEx) * 100 : 0;
                        return (
                            <React.Fragment>
                                <TableCell className="text-right text-[10px] font-black text-slate-900 border-r border-b border-slate-200 px-4 bg-slate-50 relative"><span className="relative z-10">{formatCurrency(sellIn, orgCurrency)}</span></TableCell>
                                <TableCell className="text-center text-[10px] font-black text-green-600 border-r border-b border-slate-200 bg-green-500/5 relative"><span className="relative z-10">{gpPercent.toFixed(1)}%</span></TableCell>
                            </React.Fragment>
                        );
                    })()}
                </React.Fragment>
            )}
            
            {activeView === 'boats' && [
                { id: 'hull_subdealer_srp', label: 'Sub-D SRP' },
                { id: 'hull_subdealer_excl_srp', label: 'Sub-Ex SRP' }
            ].map(l => {
                const sellEx = parseFloat(itemValues[l.id] || '0');
                const sellIn = sellEx * gstMultiplier;
                const gpPercent = sellEx > 0 ? ((sellEx - totalStrategicLandedEx) / sellEx) * 100 : 0;
                return (
                    <React.Fragment key={l.id}>
                        <TableCell className="p-0 border-r border-b border-slate-200 hover:bg-primary/10 relative bg-white"><EditableCell value={itemValues[l.id] || ''} onChange={(val: any) => onUpdateValue(id, l.id, val)} align="right" /></TableCell>
                        <TableCell className="text-right text-[10px] font-black text-slate-900 border-r border-b border-slate-200 px-4 bg-slate-50 relative"><span className="relative z-10">{formatCurrency(sellIn, orgCurrency)}</span></TableCell>
                        <TableCell className="text-center text-[10px] font-black text-green-600 border-r border-b border-slate-200 bg-green-500/5 relative"><span className="relative z-10">{gpPercent.toFixed(1)}%</span></TableCell>
                    </React.Fragment>
                );
            })}
        </TableRow>
    );
}

function PricingTable({ 
    filteredRanges, expandedRanges, toggleRange, allModels, allVariants, activeView, strategy, onUpdateValue, vendor, organisation, activeExchangeRate 
}: any) {
    const isOptions = activeView === 'options';
    const shortCode = (organisation?.shortCode || 'NSM').toUpperCase();
    const exclLabel = "(EXCL. GST)";
    const inclLabel = "(INCL. GST)";

    return (
        <div className="flex-1 w-full overflow-hidden flex flex-col bg-white relative pricing-matrix-container border-t">
            <div className="flex-1 overflow-auto scrollbar-thin">
                <Table className="border-separate border-spacing-0 w-max table-fixed pricing-matrix-table">
                    <TableHeader className="sticky top-0 z-[100]">
                        <TableRow className="hover:bg-transparent h-[52px]">
                            <TableHead rowSpan={2} className="w-[340px] sticky left-0 top-0 z-[120] bg-white border-r-2 border-b-2 border-slate-300 font-black uppercase text-[10px] shadow-[4px_4px_10px_-2px_rgba(0,0,0,0.1)] py-5 px-8 text-slate-950">Series & SKU</TableHead>
                            <TableHead colSpan={5} className="border-r border-b-2 bg-slate-100 text-center border-slate-200 sticky top-0 z-[90] h-[52px] align-middle"><span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">Exchange Rate</span></TableHead>
                            <TableHead colSpan={6} className="border-r border-b-2 bg-slate-100 text-center border-slate-200 sticky top-0 z-[90] h-[52px] align-middle"><span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">{isOptions ? "Base Option Cost" : "Base Hull Cost"}</span></TableHead>
                            {!isOptions && (
                                <React.Fragment>
                                    <TableHead colSpan={6} className="border-r border-b-2 bg-slate-100 text-center border-slate-200 sticky top-0 z-[90] h-[52px] align-middle"><span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">Sea Freight (Intl.)</span></TableHead>
                                    <TableHead colSpan={4} className="border-r border-b-2 bg-slate-100 text-center border-slate-200 sticky top-0 z-[90] h-[52px] align-middle"><span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">Road Freight (Dom.)</span></TableHead>
                                </React.Fragment>
                            )}
                            <TableHead colSpan={4} className="border-r border-b-2 bg-slate-100 text-center border-slate-200 sticky top-0 z-[90] h-[52px] align-middle"><span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">Handling</span></TableHead>
                            {!isOptions && <TableHead colSpan={4} className="border-r border-b-2 bg-slate-100 text-center border-slate-200 sticky top-0 z-[90] h-[52px] align-middle"><span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">Pre-Delivery</span></TableHead>}
                            <TableHead colSpan={3} className="border-r-2 border-b-2 bg-slate-100 text-center border-slate-200 sticky top-0 z-[90] h-[52px] align-middle"><span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">Final Pricing Baseline</span></TableHead>
                            <TableHead colSpan={isOptions ? 3 : 21} className="border-r border-b-2 bg-slate-100 text-center border-slate-200 sticky top-0 z-[90] h-[52px] align-middle"><span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">Audited Price Levels</span></TableHead>
                        </TableRow>
                        <TableRow className="hover:bg-transparent bg-white shadow-sm h-[52px]">
                            <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white w-[60px] sticky top-[52px] z-[90]">From</TableHead>
                            <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white w-[80px] sticky top-[52px] z-[90]">Rate</TableHead>
                            <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white w-[60px] sticky top-[52px] z-[90]">To</TableHead>
                            <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white w-[80px] sticky top-[52px] z-[90]">Rate</TableHead>
                            <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white w-[60px] sticky top-[52px] z-[90]">Duty %</TableHead>
                            <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white w-[100px] sticky top-[52px] z-[90]">Base USD</TableHead>
                            <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white w-[100px] sticky top-[52px] z-[90]">AUD Conv</TableHead>
                            <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white w-[100px] sticky top-[52px] z-[90]">Factory Disc USD</TableHead>
                            <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white w-[100px] sticky top-[52px] z-[90]">Disc AUD</TableHead>
                            <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white font-bold text-primary w-[120px] sticky top-[52px] z-[90]">Landed AUD {exclLabel}</TableHead>
                            <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-slate-50 font-bold text-primary w-[120px] sticky top-[52px] z-[90]">Landed AUD {inclLabel}</TableHead>
                            {!isOptions && (
                                <React.Fragment>
                                    <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white w-[100px] sticky top-[52px] z-[90]">Cost USD</TableHead>
                                    <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white w-[100px] sticky top-[52px] z-[90]">AUD Conv</TableHead>
                                    <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white w-[100px] sticky top-[52px] z-[90]">Cost AUD</TableHead>
                                    <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white w-[80px] sticky top-[52px] z-[90]">Margin %</TableHead>
                                    <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-primary/5 text-primary w-[100px] sticky top-[52px] z-[90]">Sell AUD</TableHead>
                                    <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white w-[100px] sticky top-[52px] z-[90]">GP $</TableHead>
                                    <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white w-[100px] sticky top-[52px] z-[90]">Cost AUD</TableHead>
                                    <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white w-[80px] sticky top-[52px] z-[90]">Margin %</TableHead>
                                    <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-primary/5 text-primary w-[100px] sticky top-[52px] z-[90]">Sell AUD</TableHead>
                                    <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white w-[100px] sticky top-[52px] z-[90]">GP $</TableHead>
                                </React.Fragment>
                            )}
                            <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white w-[100px] sticky top-[52px] z-[90]">Cost AUD</TableHead>
                            <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white w-[80px] sticky top-[52px] z-[90]">Margin %</TableHead>
                            <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-primary/5 text-primary w-[100px] sticky top-[52px] z-[90]">Sell AUD</TableHead>
                            <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white w-[100px] sticky top-[52px] z-[90]">GP $</TableHead>
                            {!isOptions && (
                                <React.Fragment>
                                    <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white w-[100px] sticky top-[52px] z-[90]">Cost AUD</TableHead>
                                    <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white w-[80px] sticky top-[52px] z-[90]">Margin %</TableHead>
                                    <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-primary/5 text-primary w-[100px] sticky top-[52px] z-[90]">Sell AUD</TableHead>
                                    <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white w-[100px] sticky top-[52px] z-[90]">GP $</TableHead>
                                </React.Fragment>
                            )}
                            <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-slate-50 font-bold w-[120px] sticky top-[52px] z-[90]">Final Cost {exclLabel}</TableHead>
                            <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-slate-50 w-[80px] sticky top-[52px] z-[90]">{isOptions ? 'Opt' : 'Hull'} Margin %</TableHead>
                            <TableHead className="border-r-2 border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-slate-50 text-green-600 w-[100px] sticky top-[52px] z-[90]">Total GP $</TableHead>
                            {!isOptions ? (
                                <React.Fragment>
                                    {[
                                        { id: 'cash', label: `${shortCode} SELL PRICE ${exclLabel}` },
                                        { id: 'trade', label: `TRADE PRICE ${exclLabel}` },
                                        { id: 'sub', label: `SUB-D PRICE ${exclLabel}` },
                                        { id: 'subex', label: `SUB-EX PRICE ${exclLabel}` },
                                        { id: 'aus', label: `AUS PRICE ${exclLabel}` }
                                    ].map((level, i) => (
                                        <React.Fragment key={`h-${level.id}-${i}`}>
                                            <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white w-[120px] sticky top-[52px] z-[90]">{level.label}</TableHead>
                                            <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-slate-50 w-[120px] sticky top-[52px] z-[90]">{inclLabel}</TableHead>
                                            <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white w-[60px] sticky top-[52px] z-[90]">GP %</TableHead>
                                        </React.Fragment>
                                    ))}
                                    {[
                                        { id: 'srp1', label: `SUB-D SRP ${exclLabel}` },
                                        { id: 'srp2', label: `SUB-EX SRP ${exclLabel}` }
                                    ].map((level, i) => (
                                        <React.Fragment key={`srp-${level.id}-${i}`}>
                                            <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white w-[120px] sticky top-[52px] z-[90]">{level.label}</TableHead>
                                            <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-slate-50 w-[120px] sticky top-[52px] z-[90]">{inclLabel}</TableHead>
                                            <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white w-[60px] sticky top-[52px] z-[90]">GP %</TableHead>
                                        </React.Fragment>
                                    ))}
                                </React.Fragment>
                            ) : (
                                <React.Fragment>
                                    <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white w-[120px] sticky top-[52px] z-[90]">{`${shortCode} SELL PRICE ${exclLabel}`}</TableHead>
                                    <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-slate-50 w-[120px] sticky top-[52px] z-[90]">{inclLabel}</TableHead>
                                    <TableHead className="border-r border-b-2 border-slate-300 text-center text-[8px] font-black uppercase bg-white w-[60px] sticky top-[52px] z-[90]">GP %</TableHead>
                                </React.Fragment>
                            )}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredRanges.map((range: any) => (
                            <React.Fragment key={range.id}>
                                <TableRow className="bg-slate-100 border-b-2 border-slate-300 cursor-pointer hover:bg-slate-200" onClick={() => toggleRange(range.id)}>
                                    <TableCell className="sticky left-0 z-[80] bg-slate-100 py-4 px-8 font-black uppercase text-[11px] tracking-[0.1em] text-slate-950 border-r-2 border-slate-300 shadow-[4px_0_10px_-2px_rgba(0,0,0,0.1)]">
                                        <div className="flex items-center gap-4 relative z-10">
                                            <ChevronRight className={cn("h-4 w-4 text-primary transition-transform", expandedRanges.includes(range.id) && "rotate-90")} />
                                            <span>{range.name} RANGE</span>
                                        </div>
                                    </TableCell>
                                    <TableCell colSpan={isOptions ? 21 : 55} className="border-b-2 border-slate-300 bg-slate-100 p-0" />
                                </TableRow>
                                {expandedRanges.includes(range.id) && allModels.filter((m: any) => m.rangeId === range.id).map((model: any) => (
                                    <React.Fragment key={model.id}>
                                        <TableRow className="bg-slate-50">
                                            <TableCell className="sticky left-0 z-[80] bg-slate-50 py-3.5 px-10 border-r-2 border-b-2 border-slate-300 shadow-[4px_0_10px_-2px_rgba(0,0,0,0.1)]">
                                                <div className="flex flex-col relative z-10"><span className="font-black text-[11px] uppercase tracking-tight text-slate-950">{model.name}</span><span className="text-[8px] font-black text-primary/90 uppercase">SERIES CODE: {model.modelCode}</span></div>
                                            </TableCell>
                                            <TableCell colSpan={isOptions ? 21 : 55} className="border-b-2 border-slate-300 bg-slate-50" />
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
                            </TableBody>
                        </Table>
                    </div>
                </div>
    );
}

function MatrixContent({ 
    isFocus, 
    activeView, 
    setActiveView, 
    setIsFocusMode, 
    setIsGlobalUpdateOpen, 
    vendor, 
    organisation, 
    filteredRanges, 
    expandedRanges, 
    toggleRange, 
    allModels, 
    allVariants, 
    strategy, 
    onUpdateValue, 
    activeExchangeRate 
}: any) {
    const commonProps = {
        filteredRanges, expandedRanges, toggleRange, allModels, allVariants, activeView, strategy, onUpdateValue, vendor, organisation, activeExchangeRate
    };

    return (
        <div className="flex flex-col h-full bg-white overflow-hidden">
            <div className="flex items-center justify-between gap-4 py-4 px-8 shrink-0 bg-white border-b-2 border-slate-300 relative z-[150]">
                <div className="flex items-center gap-4">
                    <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary shadow-sm border-2 border-primary/20">
                        <Calculator className="h-5 w-5" />
                    </div>
                    <div>
                        <h2 className="text-base font-black uppercase tracking-widest text-slate-950 leading-none">HIGHFIELD PRICING MANAGER</h2>
                        {isFocus && (
                            <div className="flex items-center gap-2 mt-1.5 animate-in slide-in-from-left-2 duration-300">
                                <Badge variant="outline" className="text-[8px] h-4 font-black uppercase bg-primary text-white border-none px-2 shadow-sm">AUDIT MODE</Badge>
                                <Badge variant="outline" className="text-[8px] h-4 font-black uppercase bg-slate-100 text-slate-600 border-2 border-slate-300">{(vendor?.currency || 'USD')} BASE</Badge>
                                <Badge variant="outline" className="text-[8px] h-4 font-black uppercase bg-green-50 text-green-600 border-2 border-green-200">{organisation?.gstPercentage || 10}% GST</Badge>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <Tabs value={activeView} onValueChange={(v: any) => setActiveView(v)}>
                        <TabsList className="bg-slate-100 p-1 h-10 border-2 border-slate-300 rounded-xl">
                            <TabsTrigger value="boats" className="px-6 font-black uppercase text-[9px] tracking-widest data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg">HULL & SKUS</TabsTrigger>
                            <TabsTrigger value="options" className="px-6 font-black uppercase text-[9px] tracking-widest data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg">FACTORY OPTIONS</TabsTrigger>
                        </TabsList>
                    </Tabs>

                    <div className="flex items-center gap-3 border-l-2 border-slate-200 pl-6 h-10">
                        <Button 
                            type="button"
                            variant="default" 
                            size="sm" 
                            className="h-10 px-6 font-black uppercase tracking-widest text-[9px] rounded-xl shadow-lg bg-primary text-white hover:bg-primary/90 transition-all border-none"
                            onClick={() => setIsGlobalUpdateOpen(true)}
                        >
                            <Zap className="h-4 w-4 mr-1.5" />
                            Global Update
                        </Button>
                        {!isFocus ? (
                            <Button 
                                onClick={() => setIsFocusMode(true)}
                                className="h-10 px-6 rounded-xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-primary/20 bg-primary text-white hover:scale-105 transition-all"
                            >
                                <Maximize2 className="h-4 w-4 mr-1.5" />
                                FOCUS MODE
                            </Button>
                        ) : (
                            <Button 
                                type="button" 
                                onClick={() => setIsFocusMode(false)} 
                                variant="outline" 
                                size="sm" 
                                className="h-10 px-4 font-black uppercase tracking-widest text-[10px] rounded-xl border-2 border-slate-300 bg-white hover:bg-slate-100 text-slate-900"
                            >
                                <Minimize2 className="h-4 w-4 mr-1.5" />
                                EXIT FOCUS
                            </Button>
                        )}
                    </div>
                </div>
            </div>
            <PricingTable {...commonProps} />
        </div>
    );
}

function GlobalUpdateDialog({ isOpen, onOpenChange, onApply, activeView }: { isOpen: boolean, onOpenChange: (open: boolean) => void, onApply: (field: string, value: string) => void, activeView: string }) {
    const [field, setField] = useState<string>('exchange_duty_percent');
    const [value, setValue] = useState('');

    const options = [
        { value: 'exchange_duty_percent', label: 'Global Duty %' },
        { value: 'op_sea_freight_margin_percent', label: 'Sea Freight Margin %' },
        { value: 'op_road_freight_margin_percent', label: 'Road Freight Margin %' },
        { value: 'op_handling_margin_percent', label: 'Global Handling Margin %' },
        { value: 'op_predel_margin_percent', label: 'Global Pre-Delivery Margin %' },
        { value: 'strat_package_margin_percent', label: activeView === 'boats' ? 'Global Hull Margin %' : 'Global Option Margin %' },
    ];

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md rounded-[2.5rem] border-4 shadow-2xl p-0 overflow-hidden">
                <DialogHeader className="p-8 border-b bg-muted/5">
                    <DialogTitle className="text-2xl font-black uppercase tracking-tight italic text-primary">Global Update</DialogTitle>
                    <DialogDescription className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">Universal Catalog Adjustment</DialogDescription>
                </DialogHeader>
                <div className="p-8 space-y-6">
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Target Field</Label>
                        <Select value={field} onValueChange={setField}>
                            <SelectTrigger className="h-12 font-black text-xs border-2 rounded-xl bg-background">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border-2">
                                {options.map(o => <SelectItem key={o.value} value={o.value} className="text-[10px] font-bold uppercase py-2.5">{o.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Universal Value (%)</Label>
                        <div className="relative">
                            <Percent className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-primary opacity-40" />
                            <Input 
                                type="number" 
                                placeholder="0.00" 
                                className="pl-12 h-12 font-black text-lg border-2 rounded-xl bg-muted/5 shadow-inner"
                                value={value}
                                onChange={(e) => setValue(e.target.value)}
                            />
                        </div>
                    </div>
                </div>
                <DialogFooter className="p-8 bg-muted/5 border-t gap-3">
                    <DialogClose asChild><Button variant="outline" className="h-12 px-8 rounded-xl font-black uppercase text-[10px] border-2">Cancel</Button></DialogClose>
                    <Button 
                        onClick={() => { onApply(field, value); onOpenChange(false); setValue(''); }} 
                        disabled={!value}
                        className="h-12 px-10 rounded-xl font-black uppercase text-[10px] shadow-xl bg-primary text-white"
                    >
                        <Zap className="h-4 w-4 mr-2" />
                        Confirm Global Sync
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function HighfieldPricingWorkspace({ vendor, organisationId }: { vendor: any, organisationId: string }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    
    const [isFocusMode, setIsFocusMode] = useState(false);
    const [isGlobalUpdateOpen, setIsGlobalUpdateOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedRanges, setExpandedRanges] = useState<string[]>([]);
    const [activeView, setActiveView] = useState<'boats' | 'options'>('boats');

    const rangesQuery = useMemoFirebase(() => query(collection(firestore, `data-warehouse/${vendor.id}/ranges`), orderBy('order')), [firestore, vendor.id]);
    const { data: ranges } = useCollection<Range>(rangesQuery);

    const orgRef = useMemoFirebase(() => doc(firestore, 'organisations', organisationId), [firestore, organisationId]);
    const { data: organisation, loading: orgLoading } = useDoc<Organisation>(orgRef);

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
        if (!strategyRef) return;
        const currentValues = strategy?.itemValues || {};
        const updated = { ...currentValues, [itemId]: { ...(currentValues[itemId] || {}), [colId]: value } };
        updateDoc(strategyRef, { itemValues: updated, lastUpdateAt: serverTimestamp() });
    };

    const handleGlobalUpdate = async (field: string, value: string) => {
        if (!strategyRef) return;
        const currentValues = strategy?.itemValues || {};
        const updatedValues = { ...currentValues };
        
        const itemIds: string[] = [];
        if (activeView === 'boats') {
            allModels.forEach(m => {
                (allVariants[m.id] || []).forEach(v => itemIds.push(v.id));
            });
        } else {
            allModels.forEach(m => {
                (m.optionalFeatures || []).forEach(f => itemIds.push(f.id));
            });
        }

        if (itemIds.length === 0) return;

        itemIds.forEach(id => {
            if (!updatedValues[id]) updatedValues[id] = {};
            updatedValues[id][field] = value;
        });

        await updateDoc(strategyRef, {
            itemValues: updatedValues,
            lastUpdateAt: serverTimestamp()
        });

        toast({ title: "Global Update Executed", description: `Updated ${itemIds.length} items across the entire catalog.` });
    };

    const toggleRange = (id: string) => setExpandedRanges(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    
    const filteredRanges = useMemo(() => {
        if (!ranges) return [];
        if (!searchTerm) return ranges;
        const lower = searchTerm.toLowerCase();
        return ranges.filter(range => range.name.toLowerCase().includes(lower) || allModels.filter(m => m.rangeId === range.id).some(m => m.name.toLowerCase().includes(lower)));
    }, [ranges, searchTerm, allModels]);

    if (loadingModels || strategyLoading || orgLoading) return <div className="flex-1 flex items-center justify-center h-96"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;

    const commonProps = {
        filteredRanges, expandedRanges, toggleRange, allModels, allVariants, activeView, strategy, onUpdateValue, vendor, organisation, activeExchangeRate, setActiveView, setIsFocusMode, setIsGlobalUpdateOpen
    };

    return (
        <div className="flex-1 h-full p-8 overflow-hidden">
            <Card className="h-full rounded-[2.5rem] border-2 shadow-2xl overflow-hidden flex flex-col">
                <MatrixContent {...commonProps} isFocus={false} />
            </Card>

            <Dialog open={isFocusMode} onOpenChange={setIsFocusMode}>
                <DialogContent className="max-w-[98vw] w-[1600px] h-[95vh] rounded-[2.5rem] p-0 overflow-hidden border-4 border-slate-300 shadow-2xl flex flex-col [&>button]:hidden z-[150] bg-white">
                    <DialogHeader className="sr-only">
                        <DialogTitle>Focus Mode - Pricing Audit</DialogTitle>
                        <DialogDescription>Full screen immersive auditing workspace for Highfield pricing strategies.</DialogDescription>
                    </DialogHeader>
                    <MatrixContent {...commonProps} isFocus={true} />
                </DialogContent>
            </Dialog>

            <GlobalUpdateDialog 
                isOpen={isGlobalUpdateOpen} 
                onOpenChange={setIsGlobalUpdateOpen} 
                onApply={handleGlobalUpdate} 
                activeView={activeView}
            />
        </div>
    );
}

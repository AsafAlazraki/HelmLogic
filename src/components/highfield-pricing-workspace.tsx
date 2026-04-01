'use client';

import { useUser } from "@/firebase/auth/use-user";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useCollection } from "@/firebase/firestore/use-collection";
import { useFirestore, useMemoFirebase } from "@/firebase/provider";
import { doc, collection, query, where, getDocs, updateDoc, serverTimestamp, orderBy } from "firebase/firestore";
import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Building, Search, Coins, ChevronRight, ShieldAlert, Zap, Maximize2, Minimize2, ArrowRightLeft, Percent, Save, Ship, ChevronDown, CheckCircle2, Star, History, Clock, Link2, MessageSquare, ClipboardList, ShieldCheck, Calculator, Truck, Upload, Download, Filter, FileSpreadsheet, AlertTriangle, Info } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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

interface Range {
    id: string;
    name: string;
}

interface Organisation {
    id: string;
    gstPercentage?: number;
    tradingCurrency?: string;
    shortCode?: string;
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

// --- STABLE SUB-COMPONENTS (OUTSIDE RENDER TO PREVENT JUMPING) ---

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
    id, name, sku, cost, strategy, onUpdateValue, indent, isOption, vendor, organisation, exchangeRate, rowIndex, activeView, rangeDefaultMargin
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
    // Use item-level margin first, then range default margin, then 0
    const itemMargin = itemValues['strat_package_margin_percent'];
    const marginPercent = parseFloat(itemMargin !== undefined && itemMargin !== '' ? itemMargin : (rangeDefaultMargin || '0'));
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

const OPTION_CATEGORY_ORDER = ['Consoles', 'Seats', 'Rigging', 'Electronics', 'Covers', 'Tops', 'EVA Teak', 'Hardware', 'Accessories'];

function PricingTable({
    filteredRanges, expandedRanges, toggleRange, allModels, allVariants, activeView, strategy, onUpdateValue, vendor, organisation, activeExchangeRate, rangeMargins, onUpdateRangeMargin, searchTerm
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
                        {filteredRanges.map((range: any) => {
                            const rangeDefaultMargin = rangeMargins?.[range.id] || '';
                            return (
                            <React.Fragment key={range.id}>
                                <TableRow className="bg-slate-100 border-b-2 border-slate-300">
                                    <TableCell className="sticky left-0 z-[80] bg-slate-100 py-3 px-8 font-black uppercase text-[11px] tracking-[0.1em] text-slate-950 border-r-2 border-slate-300 shadow-[4px_0_10px_-2px_rgba(0,0,0,0.1)] cursor-pointer" onClick={() => toggleRange(range.id)}>
                                        <div className="flex items-center gap-4 relative z-10">
                                            <ChevronRight className={cn("h-4 w-4 text-primary transition-transform", expandedRanges.includes(range.id) && "rotate-90")} />
                                            <span>{range.name} RANGE</span>
                                        </div>
                                    </TableCell>
                                    {/* Range default margin — shown in the margin column position */}
                                    <TableCell colSpan={isOptions ? 19 : 53} className="border-b-2 border-slate-300 bg-slate-100 p-0" />
                                    <TableCell className="border-b-2 border-slate-300 bg-amber-50 p-0 w-[80px]" title="Range default margin %">
                                        <div className="flex items-center gap-1 px-2 h-full min-h-[40px]">
                                            <span className="text-[8px] font-black text-amber-600 uppercase">RNG%</span>
                                            <input
                                                className="w-full bg-transparent border-none text-[11px] text-center outline-none text-amber-700 font-black"
                                                value={rangeDefaultMargin}
                                                placeholder="-"
                                                onClick={e => e.stopPropagation()}
                                                onChange={e => onUpdateRangeMargin(range.id, e.target.value)}
                                            />
                                        </div>
                                    </TableCell>
                                    <TableCell colSpan={1} className="border-b-2 border-slate-300 bg-slate-100 p-0" />
                                </TableRow>
                                {expandedRanges.includes(range.id) && allModels.filter((m: any) => m.rangeId === range.id).map((model: any) => {
                                    // For options view: sort by category, filter by search
                                    const rawFeatures = model.optionalFeatures || [];
                                    const filteredFeatures = isOptions && searchTerm
                                        ? rawFeatures.filter((f: any) =>
                                            f.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                            f.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                            f.code?.toLowerCase().includes(searchTerm.toLowerCase()))
                                        : rawFeatures;
                                    const sortedFeatures = isOptions ? [...filteredFeatures].sort((a: any, b: any) => {
                                        const ci = (x: any) => { const i = OPTION_CATEGORY_ORDER.indexOf(x.category); return i === -1 ? 99 : i; };
                                        return ci(a) - ci(b) || (a.name || '').localeCompare(b.name || '');
                                    }) : [];

                                    const items = activeView === 'boats' ? (allVariants[model.id] || []) : sortedFeatures;
                                    if (items.length === 0 && isOptions && searchTerm) return null;

                                    return (
                                    <React.Fragment key={model.id}>
                                        <TableRow className="bg-slate-50">
                                            <TableCell className="sticky left-0 z-[80] bg-slate-50 py-3.5 px-10 border-r-2 border-b-2 border-slate-300 shadow-[4px_0_10px_-2px_rgba(0,0,0,0.1)]">
                                                <div className="flex flex-col relative z-10"><span className="font-black text-[11px] uppercase tracking-tight text-slate-950">{model.name}</span><span className="text-[8px] font-black text-primary/90 uppercase">SERIES CODE: {model.modelCode}</span></div>
                                            </TableCell>
                                            <TableCell colSpan={isOptions ? 21 : 55} className="border-b-2 border-slate-300 bg-slate-50" />
                                        </TableRow>
                                        {isOptions ? (() => {
                                            // Render with category sub-headers
                                            let lastCat = '';
                                            return items.flatMap((item: any, idx: number) => {
                                                const rows = [];
                                                if (item.category !== lastCat) {
                                                    lastCat = item.category;
                                                    rows.push(
                                                        <TableRow key={`cat-${model.id}-${item.category}-${idx}`} className="h-[28px]">
                                                            <TableCell className="sticky left-0 z-[80] bg-indigo-50 pl-20 py-1 text-[8px] font-black uppercase tracking-[0.2em] text-indigo-600 border-r-2 border-b border-indigo-100 shadow-[4px_0_10px_-2px_rgba(0,0,0,0.05)]">
                                                                {item.category || 'Other'}
                                                            </TableCell>
                                                            <TableCell colSpan={21} className="border-b border-indigo-100 bg-indigo-50" />
                                                        </TableRow>
                                                    );
                                                }
                                                rows.push(
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
                                                        rangeDefaultMargin={rangeDefaultMargin}
                                                        isOption
                                                        indent
                                                    />
                                                );
                                                return rows;
                                            });
                                        })() : items.map((item: any, idx: number) => (
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
                                                rangeDefaultMargin={rangeDefaultMargin}
                                                indent
                                            />
                                        ))}
                                    </React.Fragment>
                                    );
                                })}
                            </React.Fragment>
                            );
                        })}
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
    setIsPublishOpen,
    onExportHulls,
    onExportOptions,
    onImportHulls,
    onImportOptions,
    vendor,
    organisation,
    filteredRanges,
    expandedRanges,
    toggleRange,
    allModels,
    allVariants,
    strategy,
    onUpdateValue,
    activeExchangeRate,
    rangeMargins,
    onUpdateRangeMargin,
    searchTerm,
    setSearchTerm,
    isPublishing,
}: any) {
    const commonProps = {
        filteredRanges, expandedRanges, toggleRange, allModels, allVariants, activeView, strategy, onUpdateValue, vendor, organisation, activeExchangeRate, rangeMargins, onUpdateRangeMargin, searchTerm
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

                <div className="flex items-center gap-4 flex-1 max-w-xs ml-8">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <Input
                            placeholder="Search models, SKUs, options..."
                            value={searchTerm || ''}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="pl-9 h-9 text-[11px] font-bold border-2 border-slate-200 rounded-xl bg-slate-50"
                        />
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
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-10 px-4 font-black uppercase tracking-widest text-[9px] rounded-xl border-2 border-slate-300 bg-white hover:bg-slate-50"
                                >
                                    <FileSpreadsheet className="h-4 w-4 mr-1.5" />
                                    Export / Import
                                    <ChevronDown className="h-3 w-3 ml-1.5 opacity-50" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 rounded-xl border-2 shadow-xl z-[10000]">
                                <DropdownMenuLabel className="text-[8px] font-black uppercase tracking-widest text-slate-400">Export</DropdownMenuLabel>
                                <DropdownMenuItem onClick={onExportHulls} className="font-bold text-[10px] uppercase cursor-pointer rounded-lg">
                                    <Download className="h-3.5 w-3.5 mr-2 text-primary" />
                                    Hulls &amp; SKUs
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={onExportOptions} className="font-bold text-[10px] uppercase cursor-pointer rounded-lg">
                                    <Download className="h-3.5 w-3.5 mr-2 text-primary" />
                                    Factory Options
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel className="text-[8px] font-black uppercase tracking-widest text-slate-400">Import</DropdownMenuLabel>
                                <DropdownMenuItem onClick={onImportHulls} className="font-bold text-[10px] uppercase cursor-pointer rounded-lg">
                                    <Upload className="h-3.5 w-3.5 mr-2 text-emerald-600" />
                                    Hulls &amp; SKUs
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={onImportOptions} className="font-bold text-[10px] uppercase cursor-pointer rounded-lg">
                                    <Upload className="h-3.5 w-3.5 mr-2 text-emerald-600" />
                                    Factory Options
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                            type="button"
                            variant="default"
                            size="sm"
                            className="h-10 px-4 font-black uppercase tracking-widest text-[9px] rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 border-none shadow-lg"
                            onClick={() => setIsPublishOpen(true)}
                            disabled={isPublishing}
                            title="Publish prices to catalog"
                        >
                            {isPublishing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
                            Publish Prices
                        </Button>
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
            {strategy?.lastUpdateAt && strategy?.lastPublishAt &&
             strategy.lastUpdateAt?.toMillis?.() > strategy.lastPublishAt?.toMillis?.() && (
                <div className="mx-8 mt-2 flex items-center gap-2 px-4 py-2 bg-amber-50 border-2 border-amber-200 rounded-xl">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <p className="text-xs font-bold text-amber-700">
                        Prices have been modified since last publish. Click &quot;Publish Prices&quot; to update quotes.
                    </p>
                </div>
            )}
            {strategy && !strategy.lastPublishAt && (
                <div className="mx-8 mt-2 flex items-center gap-2 px-4 py-2 bg-blue-50 border-2 border-blue-200 rounded-xl">
                    <Info className="h-4 w-4 text-blue-600 shrink-0" />
                    <p className="text-xs font-bold text-blue-700">
                        Prices have never been published. Quotes will use default data warehouse prices.
                    </p>
                </div>
            )}
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

// --- PUBLISH PRICES DIALOG ---

const PRICE_LEVELS = [
    { key: 'hull_cash', label: 'Cash Price' },
    { key: 'hull_trade', label: 'Trade Price' },
    { key: 'hull_subdealer', label: 'Sub-Dealer Price' },
    { key: 'hull_subdealer_excl', label: 'Sub-Dealer Excl Price' },
    { key: 'hull_aus_sailing', label: 'AUS Sailing Price' },
];

function PublishPricesDialog({ isOpen, onOpenChange, onConfirm, isPublishing, strategy, allModels, allVariants }: any) {
    const [selectedLevel, setSelectedLevel] = useState('hull_cash');

    const countPricesSet = useMemo(() => {
        if (!strategy?.itemValues) return 0;
        const key = `${selectedLevel}_price`;
        let count = 0;
        for (const model of (allModels || [])) {
            for (const v of (allVariants?.[model.id] || [])) {
                if (parseFloat(strategy.itemValues[v.id]?.[key] || '0') > 0) count++;
            }
            for (const f of (model.optionalFeatures || [])) {
                if (parseFloat(strategy.itemValues[f.id]?.[key] || '0') > 0) count++;
            }
        }
        return count;
    }, [strategy, selectedLevel, allModels, allVariants]);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md rounded-[2.5rem] border-4 shadow-2xl p-0 overflow-hidden">
                <DialogHeader className="p-8 border-b bg-emerald-50">
                    <DialogTitle className="text-2xl font-black uppercase tracking-tight italic text-emerald-700">Publish Prices</DialogTitle>
                    <DialogDescription className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mt-1">Write selected price level to catalog sell prices</DialogDescription>
                </DialogHeader>
                <div className="p-8 space-y-6">
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Price Level to Publish</Label>
                        <Select value={selectedLevel} onValueChange={setSelectedLevel}>
                            <SelectTrigger className="h-12 font-black text-xs border-2 rounded-xl bg-background">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border-2">
                                {PRICE_LEVELS.map(l => <SelectItem key={l.key} value={l.key} className="text-[10px] font-bold uppercase py-2.5">{l.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="p-4 bg-emerald-50 rounded-xl border-2 border-emerald-200">
                        <p className="text-[11px] font-black text-emerald-700">{countPricesSet} items with prices set will be published to the catalog.</p>
                        <p className="text-[9px] text-emerald-600 mt-1">This updates <code className="bg-emerald-100 px-1 rounded">sellPriceExclGst</code> on each variant and factory option. Quotes will immediately reflect the new prices.</p>
                    </div>
                </div>
                <DialogFooter className="p-8 bg-muted/5 border-t gap-3">
                    <DialogClose asChild><Button variant="outline" className="h-12 px-8 rounded-xl font-black uppercase text-[10px] border-2">Cancel</Button></DialogClose>
                    <Button
                        onClick={() => onConfirm(selectedLevel)}
                        disabled={isPublishing || countPricesSet === 0}
                        className="h-12 px-10 rounded-xl font-black uppercase text-[10px] shadow-xl bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                        {isPublishing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                        Publish {countPricesSet} Prices
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// --- MAIN WORKSPACE ---

export function HighfieldPricingWorkspace({ vendor, organisationId }: { vendor: any, organisationId: string }) {
    const firestore = useFirestore();
    const { toast } = useToast();

    const [isFocusMode, setIsFocusMode] = useState(false);
    const [isGlobalUpdateOpen, setIsGlobalUpdateOpen] = useState(false);
    const [isPublishOpen, setIsPublishOpen] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedRanges, setExpandedRanges] = useState<string[]>([]);
    const [activeView, setActiveView] = useState<'boats' | 'options'>('boats');

    const rangesQuery = useMemoFirebase(() => collection(firestore, `data-warehouse/${vendor.id}/ranges`), [firestore, vendor.id]);
    const { data: ranges } = useCollection<Range>(rangesQuery);

    const orgRef = useMemoFirebase(() => doc(firestore, 'organisations', organisationId), [firestore, organisationId]);
    const { data: organisation, loading: orgLoading } = useDoc<Organisation>(orgRef);

    const ratesQuery = useMemoFirebase(() => collection(firestore, `organisations/${organisationId}/exchangeRates`), [firestore, organisationId]);
    const { data: exchangeRates } = useCollection<any>(ratesQuery);

    const [allModels, setAllModels] = useState<Model[]>([]);
    const [allVariants, setAllVariants] = useState<Record<string, Variant[]>>({});
    const [loadingModels, setLoadingModels] = useState(false);

    const strategyRef = useMemoFirebase(() => doc(firestore, `organisations/${organisationId}/pricingStrategies/${vendor.id}`), [firestore, organisationId, vendor.id]);
    const { data: strategy, isLoading: strategyLoading } = useDoc<any>(strategyRef);

    useEffect(() => {
        const fetchDeepData = async () => {
            if (!ranges || ranges.length === 0) return;
            setLoadingModels(true);
            try {
                const rangeResults = await Promise.all(ranges.map(async (range) => {
                    const mSnap = await getDocs(collection(firestore, `data-warehouse/${vendor.id}/ranges/${range.id}/models`));
                    const models = mSnap.docs.map(mDoc => ({ id: mDoc.id, ...mDoc.data() } as Model));
                    const variantEntries = await Promise.all(mSnap.docs.map(async (mDoc) => {
                        const vSnap = await getDocs(collection(firestore, `data-warehouse/${vendor.id}/ranges/${range.id}/models/${mDoc.id}/variants`));
                        return [mDoc.id, vSnap.docs.map(d => ({ id: d.id, ...d.data() } as Variant))] as const;
                    }));
                    return { models, variantEntries };
                }));
                const models: Model[] = [];
                const variantMap: Record<string, Variant[]> = {};
                for (const result of rangeResults) {
                    models.push(...result.models);
                    for (const [modelId, variants] of result.variantEntries) {
                        variantMap[modelId] = variants;
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
        return ranges.filter(range =>
            range.name.toLowerCase().includes(lower) ||
            allModels.filter(m => m.rangeId === range.id).some(m =>
                m.name.toLowerCase().includes(lower) ||
                (m.optionalFeatures || []).some((f: any) =>
                    f.name?.toLowerCase().includes(lower) ||
                    f.code?.toLowerCase().includes(lower)
                )
            )
        );
    }, [ranges, searchTerm, allModels]);

    // Per-range margin: stored in strategy.rangeMargins
    const rangeMargins: Record<string, string> = strategy?.rangeMargins || {};

    const onUpdateRangeMargin = useCallback(async (rangeId: string, value: string) => {
        if (!strategyRef) return;
        const current = strategy?.rangeMargins || {};
        await updateDoc(strategyRef, {
            rangeMargins: { ...current, [rangeId]: value },
            lastUpdateAt: serverTimestamp(),
        });
    }, [strategyRef, strategy]);

    // Publish prices: write hull_cash_price (or selected level) → sellPriceExclGst on each variant/feature
    const handlePublishPrices = useCallback(async (priceLevel: string) => {
        if (!strategy || !vendor.id || !ranges) return;
        setIsPublishing(true);
        const priceKey = `${priceLevel}_price`;
        const updates: Array<() => Promise<void>> = [];

        for (const model of allModels) {
            // Variants
            for (const variant of (allVariants[model.id] || [])) {
                const price = parseFloat(strategy.itemValues?.[variant.id]?.[priceKey] || '0');
                if (price > 0) {
                    const vRef = doc(firestore, `data-warehouse/${vendor.id}/ranges/${model.rangeId}/models/${model.id}/variants/${variant.id}`);
                    updates.push(() => updateDoc(vRef, { sellPriceExclGst: price }));
                }
            }
            // Optional features (rewrite the array on the model doc)
            const features: any[] = model.optionalFeatures || [];
            let featuresDirty = false;
            const updatedFeatures = features.map((f: any) => {
                const price = parseFloat(strategy.itemValues?.[f.id]?.[priceKey] || '0');
                if (price > 0 && price !== f.sellPriceExclGst) {
                    featuresDirty = true;
                    return { ...f, sellPriceExclGst: price };
                }
                return f;
            });
            if (featuresDirty) {
                const mRef = doc(firestore, `data-warehouse/${vendor.id}/ranges/${model.rangeId}/models/${model.id}`);
                updates.push(() => updateDoc(mRef, { optionalFeatures: updatedFeatures }));
            }
        }

        try {
            // Run in parallel batches of 20
            for (let i = 0; i < updates.length; i += 20) {
                await Promise.all(updates.slice(i, i + 20).map(fn => fn()));
            }
            await updateDoc(strategyRef, { lastPublishAt: serverTimestamp() });
            toast({ title: "Prices Published", description: `${updates.length} catalog items updated with new sell prices.` });
        } catch (e) {
            console.error('Publish failed:', e);
            toast({ title: "Publish Failed", description: String(e), variant: "destructive" });
        } finally {
            setIsPublishing(false);
            setIsPublishOpen(false);
        }
    }, [strategy, vendor.id, ranges, allModels, allVariants, firestore, toast]);

    // Shared calculation helper matching PricingRow logic
    const calcRow = useCallback((cost: number, iv: Record<string, any>, isOption: boolean) => {
        const gstRate = (organisation?.gstPercentage || 10) / 100;
        const gstMul = 1 + gstRate;
        const baseCostAudEx = calculateBaseCostAudEx(iv, cost, activeExchangeRate);
        const baseCostAudIn = baseCostAudEx * gstMul;

        const seaFreightUsd = parseFloat(iv['op_sea_freight_cost_usd'] || '0');
        const seaFreightAudConv = activeExchangeRate > 0 ? seaFreightUsd / activeExchangeRate : seaFreightUsd;
        const seaFreightCostAud = parseFloat(iv['op_sea_freight_cost_aud'] || seaFreightAudConv.toFixed(2));
        const seaFreightMargin = parseFloat(iv['op_sea_freight_margin_percent'] || '0');
        const seaFreightSell = getSellPrice(seaFreightCostAud, seaFreightMargin);
        const seaFreightGP = seaFreightSell - seaFreightCostAud;

        const roadCost = parseFloat(iv['op_road_freight_cost_aud'] || '0');
        const roadMargin = parseFloat(iv['op_road_freight_margin_percent'] || '0');
        const roadSell = getSellPrice(roadCost, roadMargin);
        const roadGP = roadSell - roadCost;

        const handlingCost = parseFloat(iv['op_handling_cost_aud'] || '0');
        const handlingMargin = parseFloat(iv['op_handling_margin_percent'] || '0');
        const handlingSell = getSellPrice(handlingCost, handlingMargin);
        const handlingGP = handlingSell - handlingCost;

        const preDelCost = parseFloat(iv['op_predel_cost_aud'] || '0');
        const preDelMargin = parseFloat(iv['op_predel_margin_percent'] || '0');
        const preDelSell = getSellPrice(preDelCost, preDelMargin);
        const preDelGP = preDelSell - preDelCost;

        const totalLanded = baseCostAudEx + (!isOption ? (seaFreightSell + roadSell + preDelSell) : 0) + (!isOption ? handlingSell : 0);
        const optionLanded = isOption ? baseCostAudEx + handlingSell : totalLanded;
        const finalLanded = isOption ? optionLanded : totalLanded;
        const pkgMargin = parseFloat(iv['strat_package_margin_percent'] || '0');
        const pkgSell = getSellPrice(finalLanded, pkgMargin);
        const pkgGP = pkgSell - finalLanded;

        const priceLevel = (key: string) => {
            const ex = parseFloat(iv[key] || '0');
            const inc = ex * gstMul;
            const gp = ex > 0 ? ((ex - finalLanded) / ex) * 100 : 0;
            return { ex, inc, gp };
        };

        return {
            baseCostAudEx, baseCostAudIn,
            seaFreightUsd, seaFreightAudConv, seaFreightCostAud, seaFreightMargin, seaFreightSell, seaFreightGP,
            roadCost, roadMargin, roadSell, roadGP,
            handlingCost, handlingMargin, handlingSell, handlingGP,
            preDelCost, preDelMargin, preDelSell, preDelGP,
            finalLanded, pkgMargin, pkgGP,
            cash: priceLevel('hull_cash_price'),
            trade: priceLevel('hull_trade_price'),
            subD: priceLevel('hull_subdealer_price'),
            subEx: priceLevel('hull_subdealer_excl_price'),
            aus: priceLevel('hull_aus_sailing_price'),
            subDSrp: priceLevel('hull_subdealer_srp'),
            subExSrp: priceLevel('hull_subdealer_excl_srp'),
            optSell: priceLevel('hull_cash_price'),
        };
    }, [organisation, activeExchangeRate]);

    const downloadCsv = (rows: string[][], filename: string) => {
        const csv = rows.map(r => r.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    const n = (v: number) => isNaN(v) ? '' : v.toFixed(2);
    const pct = (v: number) => isNaN(v) ? '' : v.toFixed(2) + '%';

    // Export Hulls & SKUs
    const exportHullsCsv = useCallback(() => {
        if (!allModels.length) return;
        const headers = [
            '__itemId', 'Range', 'Model', 'SKU', 'Name', 'Material', 'Color',
            // Editable inputs
            'Base Cost USD', 'Factory Discount USD', 'Duty %',
            // Calculated
            'AUD Conv (Base)', 'Disc AUD', 'Landed AUD (Excl GST)', 'Landed AUD (Incl GST)',
            // Sea Freight
            'Sea Freight Cost USD', 'Sea Freight AUD Conv', 'Sea Freight Cost AUD', 'Sea Freight Margin %', 'Sea Freight Sell AUD', 'Sea Freight GP',
            // Road Freight
            'Road Freight Cost AUD', 'Road Freight Margin %', 'Road Freight Sell AUD', 'Road Freight GP',
            // Handling
            'Handling Cost AUD', 'Handling Margin %', 'Handling Sell AUD', 'Handling GP',
            // Pre-Delivery
            'Pre-Del Cost AUD', 'Pre-Del Margin %', 'Pre-Del Sell AUD', 'Pre-Del GP',
            // Baseline + Margin
            'Final Cost (Excl GST)', 'Hull Margin %', 'Total GP',
            // Price Levels
            'Cash Price (Excl)', 'Cash Price (Incl)', 'Cash GP%',
            'Trade Price (Excl)', 'Trade Price (Incl)', 'Trade GP%',
            'Sub-D Price (Excl)', 'Sub-D Price (Incl)', 'Sub-D GP%',
            'Sub-Ex Price (Excl)', 'Sub-Ex Price (Incl)', 'Sub-Ex GP%',
            'AUS Price (Excl)', 'AUS Price (Incl)', 'AUS GP%',
            'Sub-D SRP (Excl)', 'Sub-D SRP (Incl)', 'Sub-D SRP GP%',
            'Sub-Ex SRP (Excl)', 'Sub-Ex SRP (Incl)', 'Sub-Ex SRP GP%',
        ];
        const rows: string[][] = [headers];
        for (const model of allModels) {
            const range = (ranges || []).find((r: any) => r.id === model.rangeId);
            for (const v of (allVariants[model.id] || [])) {
                const iv = strategy?.itemValues?.[v.id] || {};
                const c = calcRow(v.cost || 0, iv, false);
                rows.push([
                    v.id, range?.name || '', model.name, v.sku || '', v.name || '', (v as any).material || '', (v as any).colorCode || '',
                    iv['base_cost_override'] || n(v.cost || 0), iv['factory_discount_usd'] || '', iv['exchange_duty_percent'] || '',
                    n(c.baseCostAudEx / (activeExchangeRate || 1) * activeExchangeRate), // AUD conv ≈ baseCostUsd/rate
                    n(parseFloat(iv['factory_discount_usd'] || '0') / (activeExchangeRate || 1)),
                    n(c.baseCostAudEx), n(c.baseCostAudIn),
                    iv['op_sea_freight_cost_usd'] || '', n(c.seaFreightAudConv), iv['op_sea_freight_cost_aud'] || n(c.seaFreightAudConv), iv['op_sea_freight_margin_percent'] || '', n(c.seaFreightSell), n(c.seaFreightGP),
                    iv['op_road_freight_cost_aud'] || '', iv['op_road_freight_margin_percent'] || '', n(c.roadSell), n(c.roadGP),
                    iv['op_handling_cost_aud'] || '', iv['op_handling_margin_percent'] || '', n(c.handlingSell), n(c.handlingGP),
                    iv['op_predel_cost_aud'] || '', iv['op_predel_margin_percent'] || '', n(c.preDelSell), n(c.preDelGP),
                    n(c.finalLanded), iv['strat_package_margin_percent'] || '', n(c.pkgGP),
                    n(c.cash.ex), n(c.cash.inc), pct(c.cash.gp),
                    n(c.trade.ex), n(c.trade.inc), pct(c.trade.gp),
                    n(c.subD.ex), n(c.subD.inc), pct(c.subD.gp),
                    n(c.subEx.ex), n(c.subEx.inc), pct(c.subEx.gp),
                    n(c.aus.ex), n(c.aus.inc), pct(c.aus.gp),
                    n(c.subDSrp.ex), n(c.subDSrp.inc), pct(c.subDSrp.gp),
                    n(c.subExSrp.ex), n(c.subExSrp.inc), pct(c.subExSrp.gp),
                ]);
            }
        }
        downloadCsv(rows, `highfield-hulls-skus-${new Date().toISOString().slice(0, 10)}.csv`);
    }, [allModels, allVariants, ranges, strategy, organisation, activeExchangeRate, calcRow]);

    // Export Factory Options
    const exportOptionsCsv = useCallback(() => {
        if (!allModels.length) return;
        const headers = [
            '__itemId', 'Range', 'Model', 'Category', 'Code', 'Name',
            'Base Cost USD', 'Factory Discount USD', 'Duty %',
            'AUD Conv (Base)', 'Disc AUD', 'Landed AUD (Excl GST)', 'Landed AUD (Incl GST)',
            'Handling Cost AUD', 'Handling Margin %', 'Handling Sell AUD', 'Handling GP',
            'Final Cost (Excl GST)', 'Option Margin %', 'Total GP',
            'Sell Price (Excl)', 'Sell Price (Incl)', 'Sell GP%',
        ];
        const rows: string[][] = [headers];
        const gstMul = 1 + (organisation?.gstPercentage || 10) / 100;
        for (const model of allModels) {
            const range = (ranges || []).find((r: any) => r.id === model.rangeId);
            for (const f of (model.optionalFeatures || [])) {
                const iv = strategy?.itemValues?.[f.id] || {};
                const c = calcRow(f.cost || 0, iv, true);
                const sellEx = parseFloat(iv['hull_cash_price'] || '0');
                const sellIn = sellEx * gstMul;
                const gpPct = sellEx > 0 ? ((sellEx - c.finalLanded) / sellEx) * 100 : 0;
                rows.push([
                    f.id, range?.name || '', model.name, f.category || '', f.code || '', f.name || '',
                    iv['base_cost_override'] || n(f.cost || 0), iv['factory_discount_usd'] || '', iv['exchange_duty_percent'] || '',
                    n(parseFloat(iv['base_cost_override'] || f.cost || '0') / (activeExchangeRate || 1)),
                    n(parseFloat(iv['factory_discount_usd'] || '0') / (activeExchangeRate || 1)),
                    n(c.baseCostAudEx), n(c.baseCostAudIn),
                    iv['op_handling_cost_aud'] || '', iv['op_handling_margin_percent'] || '', n(c.handlingSell), n(c.handlingGP),
                    n(c.finalLanded), iv['strat_package_margin_percent'] || '', n(c.pkgGP),
                    n(sellEx), n(sellIn), pct(gpPct),
                ]);
            }
        }
        downloadCsv(rows, `highfield-factory-options-${new Date().toISOString().slice(0, 10)}.csv`);
    }, [allModels, ranges, strategy, organisation, activeExchangeRate, calcRow]);

    // Import helpers - parse CSV and restore editable fields to strategy
    const HULL_EDITABLE_COLS = [
        'base_cost_override', 'factory_discount_usd', 'exchange_duty_percent',
        'op_sea_freight_cost_usd', 'op_sea_freight_cost_aud', 'op_sea_freight_margin_percent',
        'op_road_freight_cost_aud', 'op_road_freight_margin_percent',
        'op_handling_cost_aud', 'op_handling_margin_percent',
        'op_predel_cost_aud', 'op_predel_margin_percent',
        'strat_package_margin_percent',
        'hull_cash_price', 'hull_trade_price', 'hull_subdealer_price',
        'hull_subdealer_excl_price', 'hull_aus_sailing_price',
        'hull_subdealer_srp', 'hull_subdealer_excl_srp',
    ];
    const HULL_CSV_TO_FIELD: Record<string, string> = {
        'Base Cost USD': 'base_cost_override',
        'Factory Discount USD': 'factory_discount_usd',
        'Duty %': 'exchange_duty_percent',
        'Sea Freight Cost USD': 'op_sea_freight_cost_usd',
        'Sea Freight Cost AUD': 'op_sea_freight_cost_aud',
        'Sea Freight Margin %': 'op_sea_freight_margin_percent',
        'Road Freight Cost AUD': 'op_road_freight_cost_aud',
        'Road Freight Margin %': 'op_road_freight_margin_percent',
        'Handling Cost AUD': 'op_handling_cost_aud',
        'Handling Margin %': 'op_handling_margin_percent',
        'Pre-Del Cost AUD': 'op_predel_cost_aud',
        'Pre-Del Margin %': 'op_predel_margin_percent',
        'Hull Margin %': 'strat_package_margin_percent',
        'Cash Price (Excl)': 'hull_cash_price',
        'Trade Price (Excl)': 'hull_trade_price',
        'Sub-D Price (Excl)': 'hull_subdealer_price',
        'Sub-Ex Price (Excl)': 'hull_subdealer_excl_price',
        'AUS Price (Excl)': 'hull_aus_sailing_price',
        'Sub-D SRP (Excl)': 'hull_subdealer_srp',
        'Sub-Ex SRP (Excl)': 'hull_subdealer_excl_srp',
    };
    const OPT_CSV_TO_FIELD: Record<string, string> = {
        'Base Cost USD': 'base_cost_override',
        'Factory Discount USD': 'factory_discount_usd',
        'Duty %': 'exchange_duty_percent',
        'Handling Cost AUD': 'op_handling_cost_aud',
        'Handling Margin %': 'op_handling_margin_percent',
        'Option Margin %': 'strat_package_margin_percent',
        'Sell Price (Excl)': 'hull_cash_price',
    };

    const parseCsv = (text: string): { headers: string[]; rows: string[][] } => {
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        const parseRow = (line: string): string[] => {
            const result: string[] = [];
            let inQ = false, cur = '';
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (ch === '"') {
                    if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
                    else inQ = !inQ;
                } else if (ch === ',' && !inQ) {
                    result.push(cur); cur = '';
                } else {
                    cur += ch;
                }
            }
            result.push(cur);
            return result;
        };
        const headers = parseRow(lines[0]);
        const rows = lines.slice(1).map(parseRow);
        return { headers, rows };
    };

    const triggerFileImport = (colMap: Record<string, string>) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv';
        input.onchange = async (e: any) => {
            const file = e.target.files?.[0];
            if (!file || !strategyRef) return;
            const text = await file.text();
            const { headers, rows } = parseCsv(text);
            const idIdx = headers.indexOf('__itemId');
            if (idIdx === -1) {
                toast({ title: 'Import Failed', description: 'CSV must contain __itemId column. Export first, then reimport.', variant: 'destructive' });
                return;
            }
            const currentValues: Record<string, any> = { ...(strategy?.itemValues || {}) };
            let updatedCount = 0;
            for (const row of rows) {
                const itemId = row[idIdx]?.trim();
                if (!itemId) continue;
                const itemPatch: Record<string, any> = {};
                for (const [csvCol, fieldKey] of Object.entries(colMap)) {
                    const colIdx = headers.indexOf(csvCol);
                    if (colIdx === -1) continue;
                    const val = row[colIdx]?.trim();
                    if (val !== undefined && val !== '') itemPatch[fieldKey] = val;
                }
                if (Object.keys(itemPatch).length > 0) {
                    currentValues[itemId] = { ...(currentValues[itemId] || {}), ...itemPatch };
                    updatedCount++;
                }
            }
            await updateDoc(strategyRef, {
                itemValues: currentValues,
                lastUpdateAt: serverTimestamp(),
                lastImportAt: serverTimestamp(),
                lastImportFile: file.name,
                lastImportRows: updatedCount,
            });
            toast({ title: 'Import Complete', description: `${updatedCount} items updated from ${file.name}.` });
        };
        input.click();
    };

    const importHulls = useCallback(() => triggerFileImport(HULL_CSV_TO_FIELD), [strategy, strategyRef, toast]);
    const importOptions = useCallback(() => triggerFileImport(OPT_CSV_TO_FIELD), [strategy, strategyRef, toast]);

    if (loadingModels || strategyLoading || orgLoading) return <div className="flex-1 flex items-center justify-center h-96"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;

    const commonProps = {
        filteredRanges, expandedRanges, toggleRange, allModels, allVariants, activeView, strategy, onUpdateValue, vendor, organisation, activeExchangeRate,
        setActiveView, setIsFocusMode, setIsGlobalUpdateOpen, setIsPublishOpen,
        onExportHulls: exportHullsCsv, onExportOptions: exportOptionsCsv,
        onImportHulls: importHulls, onImportOptions: importOptions,
        rangeMargins, onUpdateRangeMargin, searchTerm, setSearchTerm, isPublishing,
    };

    return (
        <div className="flex-1 h-full p-8 overflow-hidden">
            <Card className="h-full rounded-[2.5rem] border-2 shadow-2xl overflow-hidden flex flex-col">
                <MatrixContent {...commonProps} isFocus={false} />
            </Card>

            {isFocusMode && (
                <div className="fixed inset-0 z-[9999] bg-white flex flex-col shadow-2xl">
                    <MatrixContent {...commonProps} isFocus={true} />
                    <GlobalUpdateDialog
                        isOpen={isGlobalUpdateOpen}
                        onOpenChange={setIsGlobalUpdateOpen}
                        onApply={handleGlobalUpdate}
                    />
                </div>
            )}

            <GlobalUpdateDialog
                isOpen={isGlobalUpdateOpen}
                onOpenChange={setIsGlobalUpdateOpen}
                onApply={handleGlobalUpdate}
                activeView={activeView}
            />

            <PublishPricesDialog
                isOpen={isPublishOpen}
                onOpenChange={setIsPublishOpen}
                onConfirm={handlePublishPrices}
                isPublishing={isPublishing}
                strategy={strategy}
                allModels={allModels}
                allVariants={allVariants}
            />
        </div>
    );
}
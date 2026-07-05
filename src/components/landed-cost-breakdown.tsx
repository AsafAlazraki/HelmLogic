'use client';

/**
 * LandedCostBreakdown — read-only decomposition of an MPF-imported
 * variant landed-cost chain (variant.landedCostChain) plus the audited
 * MPF price ladder (variant.priceLadder + variant.priceIncGst).
 *
 * Rendered from the Highfield Pricing Workspace when a variant carries
 * MPF import data. Pure display — all editing stays on the existing
 * pricing-strategy fields. Gracefully renders nothing if the chain is
 * absent (pre-import state).
 */

import type { ReactNode } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface LandedCostChain {
    currency?: string | null;
    exRate?: number | null;
    duty?: number | null;
    dutyIsRate?: boolean | null;
    baseCost?: number | null;
    factoryDiscounts?: Array<number | null> | null;
    factoryDiscountNote?: string | null;
    charges?: Record<string, number | null> | null;
    otherChgAud?: number | null;
    roadFreight?: number | null;
    landedAUD?: number | null;
    landedComputed?: number | null;
    landedDelta?: number | null;
    landedVerified?: boolean | null;
}

export interface PriceLadderTier {
    incGst?: number | null;
    exGst?: number | null;
}

export interface PriceLadder {
    trade?: PriceLadderTier | null;
    subDealer?: PriceLadderTier | null;
    subExclusive?: PriceLadderTier | null;
    ausSailing?: PriceLadderTier | null;
    warranty?: PriceLadderTier | null;
}

/** Canonical MPF charge order — matches the import contract. */
const CHARGE_ORDER = [
    'Boat Prep',
    'Base Freight',
    'Documentation',
    'Fumigation',
    'Ocean Freight',
    'Fuel Surcharge',
    'Other Charges',
];

const LADDER_TIERS: Array<{ key: keyof PriceLadder; label: string }> = [
    { key: 'trade', label: 'Trade' },
    { key: 'subDealer', label: 'Sub-Dealer' },
    { key: 'subExclusive', label: 'Sub-Dealer Exclusive' },
    { key: 'ausSailing', label: 'AUS Sailing' },
    { key: 'warranty', label: 'Warranty' },
];

function aud(n: number | null | undefined) {
    if (n == null || isNaN(n)) return '—';
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 2 }).format(n);
}

function money(n: number | null | undefined, currency: string) {
    if (n == null || isNaN(n)) return '—';
    try {
        return new Intl.NumberFormat('en-AU', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
    } catch {
        return `${currency} ${n.toFixed(2)}`;
    }
}

function Line({ label, value, muted, strong }: { label: ReactNode; value: ReactNode; muted?: boolean; strong?: boolean }) {
    return (
        <div className="flex items-center justify-between gap-4 py-1">
            <span className={cn('text-[10px] uppercase tracking-wider', strong ? 'font-black text-slate-900' : 'font-bold', muted ? 'text-slate-400' : 'text-slate-600')}>
                {label}
            </span>
            <span className={cn('text-[11px] tabular-nums', strong ? 'font-black text-slate-950' : 'font-bold text-slate-800', muted && 'text-slate-400')}>
                {value}
            </span>
        </div>
    );
}

export function LandedCostBreakdown({
    chain,
    priceLadder,
    priceIncGst,
    deviationFlag,
}: {
    chain: LandedCostChain | null | undefined;
    priceLadder?: PriceLadder | null;
    priceIncGst?: number | null;
    /** variant.mpfSource.formulaDeviationFlag — the import noticed the sheet formula deviated. */
    deviationFlag?: boolean | null;
}) {
    // Graceful fallback — pre-import variants simply render nothing.
    if (!chain) return null;

    const currency = chain.currency || 'USD';
    const exRate = chain.exRate ?? 0;
    const discounts = (chain.factoryDiscounts ?? []).filter((d): d is number => typeof d === 'number' && d !== 0);
    const totalDiscount = discounts.reduce((a, d) => a + d, 0);
    const netSource = (chain.baseCost ?? 0) - totalDiscount;
    const audConv = exRate > 0 ? netSource / exRate : netSource;

    const chargeEntries = CHARGE_ORDER
        .map(name => ({ name, value: chain.charges?.[name] ?? 0 }))
        .filter(c => typeof c.value === 'number' && c.value !== 0);

    const delta = chain.landedDelta ?? 0;
    const hasWarning = Math.abs(delta) > 0.005 || !!deviationFlag;
    const isVerified = !!chain.landedVerified && !hasWarning;

    return (
        <div className="space-y-4">
            {/* Status strip */}
            <div className="flex flex-wrap items-center gap-2">
                {isVerified && (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px] font-black uppercase gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Landed cost verified
                    </Badge>
                )}
                {hasWarning && (
                    <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 text-[9px] font-black uppercase gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {Math.abs(delta) > 0.005
                            ? `Recompute delta ${aud(delta)}`
                            : 'Formula deviation flagged at import'}
                    </Badge>
                )}
                {!isVerified && !hasWarning && (
                    <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 text-[9px] font-black uppercase">
                        Unverified import
                    </Badge>
                )}
            </div>

            {/* Chain decomposition */}
            <div className="rounded-xl border-2 border-slate-200 bg-slate-50/50 px-4 py-3">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary mb-1.5">Cost chain</p>
                <Line label={`Base cost (${currency})`} value={money(chain.baseCost, currency)} />
                {totalDiscount !== 0 && (
                    <Line
                        label={<>Factory discounts{chain.factoryDiscountNote ? ` — ${chain.factoryDiscountNote}` : ''}</>}
                        value={`− ${money(totalDiscount, currency)}`}
                    />
                )}
                <Line label={`÷ Exchange rate (${exRate ? exRate.toFixed(4) : '—'})`} value={aud(audConv)} />
                {(chain.duty ?? 0) !== 0 && (
                    <Line
                        label="Duty"
                        value={chain.dutyIsRate ? `${(((chain.duty ?? 0)) * 100).toFixed(2)}%` : aud(chain.duty)}
                    />
                )}
                {chargeEntries.length === 0 ? (
                    <Line label="Import charges" value="none recorded" muted />
                ) : (
                    chargeEntries.map(c => <Line key={c.name} label={c.name} value={aud(c.value)} />)
                )}
                {(chain.otherChgAud ?? 0) !== 0 && <Line label="Other charges (AUD)" value={aud(chain.otherChgAud)} />}
                {(chain.roadFreight ?? 0) !== 0 && <Line label="Road freight" value={aud(chain.roadFreight)} />}
                <div className="border-t-2 border-slate-300 mt-1.5 pt-1.5">
                    <Line label="= Landed AUD (excl. GST)" value={aud(chain.landedAUD)} strong />
                    {Math.abs(delta) > 0.005 && (
                        <Line label="Recomputed" value={aud(chain.landedComputed)} muted />
                    )}
                </div>
            </div>

            {/* MPF price ladder */}
            {(priceLadder || priceIncGst != null) && (
                <div className="rounded-xl border-2 border-slate-200 bg-white px-4 py-3">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary mb-1.5">MPF price ladder</p>
                    {priceIncGst != null && (
                        <div className="flex items-center justify-between gap-4 py-1">
                            <span className="text-[10px] uppercase tracking-wider font-black text-slate-900">
                                Cash inc GST
                                <Badge variant="outline" className="ml-1.5 bg-primary/10 text-primary border-primary/20 text-[8px] font-black uppercase align-middle">Authoritative</Badge>
                            </span>
                            <span className="text-[11px] tabular-nums font-black text-slate-950">{aud(priceIncGst)}</span>
                        </div>
                    )}
                    {LADDER_TIERS.map(({ key, label }) => {
                        const tier = priceLadder?.[key];
                        if (!tier || (tier.incGst == null && tier.exGst == null)) return null;
                        return (
                            <div key={key} className="flex items-center justify-between gap-4 py-1">
                                <span className="text-[10px] uppercase tracking-wider font-bold text-slate-600">{label}</span>
                                <span className="text-[11px] tabular-nums font-bold text-slate-800">
                                    {aud(tier.incGst)}
                                    {tier.exGst != null && (
                                        <span className="text-[9px] text-slate-400 font-semibold ml-1.5">({aud(tier.exGst)} ex)</span>
                                    )}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

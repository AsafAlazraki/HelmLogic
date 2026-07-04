'use client';

/**
 * nsm-recommended.tsx — NSM Master Price File (MPF) relationship surfaces
 * for the Highfield quote flow.
 *
 * Every section here is DATA-GATED: it only renders when the MPF importer
 * has written the relevant fields (variant.motorMenu / variant.trailerMenu /
 * variant.dealerFitLines / model.standardInclusions / model.depositSchedule /
 * model.leadTimesDays). When the data is absent the quote flow renders
 * exactly as it did before — zero regression pre-import.
 *
 * All matching against live catalog objects (module motor list, trailer
 * assignments, dealerFitSelections) happens in highfield-quote-flow.tsx;
 * these components are presentational.
 */

import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/currency-utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Star,
    Wrench,
    Anchor,
    Gauge,
    Check,
    CheckCircle2,
    Info,
    Truck,
    Banknote,
    Clock,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

/** MPF standardInclusions rows can pack several items into one string
 *  separated by "●" (U+25CF) — split + trim into individual lines.
 *  Gracefully returns [] for missing / non-array input. */
export function splitInclusionEntries(raw: any): string[] {
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    for (const entry of raw) {
        if (entry == null) continue;
        const parts = String(entry).split(/[●•]/g);
        for (const p of parts) {
            const t = p.replace(/\s+/g, ' ').trim();
            if (t) out.push(t);
        }
    }
    return out;
}

/** Section header used by every NSM-recommended block — matches the app's
 *  solid-bar header language with a Star marker + micro source label. */
function NsmSectionHeader({ title }: { title: string }) {
    return (
        <div className="flex items-center justify-between gap-3 flex-wrap bg-slate-900 px-4 sm:px-6 py-3 rounded-2xl shadow-xl w-full min-w-0">
            <div className="flex items-center gap-3 min-w-0">
                <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400 shrink-0" />
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white truncate">{title}</h3>
            </div>
            <span className="text-[8px] font-black uppercase tracking-widest text-white/60 whitespace-nowrap">NSM Master Price File</span>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Step 3 — Motor menu                                                 */
/* ------------------------------------------------------------------ */

export interface NsmMotorMenuEntry {
    slot?: number | null;
    motorName?: string | null;
    riggingKit?: string | null;
    propPartNo?: string | null;
    propDesc?: string | null;
    engineHole?: string | null;
    recommended?: boolean | null;
    /** Resolved motor doc from the module's motor list (display-name match).
     *  null = no match found → the card renders info-only, not selectable. */
    motor: any | null;
}

export function NsmMotorMenuSection({
    entries,
    selectedMotorId,
    onSelect,
    getPrice,
}: {
    entries: NsmMotorMenuEntry[];
    selectedMotorId: string | null;
    onSelect: (entry: NsmMotorMenuEntry) => void;
    getPrice: (motor: any) => number;
}) {
    if (!entries || entries.length === 0) return null;
    const hasExplicitRecommended = entries.some(e => e.recommended === true);
    return (
        <div className="space-y-4 animate-in fade-in duration-700">
            <NsmSectionHeader title="NSM Recommended for this hull" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {entries.map((entry, idx) => {
                    const isRecommended = hasExplicitRecommended ? entry.recommended === true : (entry.slot ?? idx + 1) === 1;
                    const isResolved = !!entry.motor;
                    const isSelected = isResolved && !!selectedMotorId && entry.motor.id === selectedMotorId;
                    const price = isResolved ? getPrice(entry.motor) : 0;
                    return (
                        <button
                            key={`${entry.slot ?? idx}-${entry.motorName ?? idx}`}
                            type="button"
                            disabled={!isResolved}
                            onClick={() => isResolved && onSelect(entry)}
                            className={cn(
                                'relative flex flex-col text-left border-2 rounded-[1.5rem] overflow-hidden transition-all bg-white shadow-lg p-5 gap-3 h-full',
                                isSelected
                                    ? 'bg-primary/5 border-primary shadow-md ring-2 ring-primary/20'
                                    : isResolved
                                        ? 'border-transparent hover:border-primary/30'
                                        : 'border-dashed border-slate-200 opacity-80 cursor-default',
                            )}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-400">Slot {entry.slot ?? idx + 1}</p>
                                    <p className={cn('text-xs font-black uppercase tracking-tight leading-tight mt-0.5', isSelected ? 'text-primary' : 'text-slate-900')}>
                                        {entry.motorName || 'Motor'}
                                    </p>
                                </div>
                                <div className="flex flex-col items-end gap-1 shrink-0">
                                    {isRecommended && (
                                        <Badge className="bg-emerald-500 text-white border-none font-black text-[7px] uppercase h-4 px-1.5 gap-1">
                                            <Star className="h-2 w-2 fill-white" /> Recommended
                                        </Badge>
                                    )}
                                    {isSelected && (
                                        <Badge className="bg-primary text-white border-none font-black text-[7px] uppercase h-4 px-1.5 gap-1">
                                            <Check className="h-2 w-2" /> Selected
                                        </Badge>
                                    )}
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                {entry.riggingKit && (
                                    <div className="flex items-start gap-2">
                                        <Wrench className="h-3 w-3 text-primary/60 shrink-0 mt-0.5" />
                                        <span className="text-[10px] font-bold text-slate-600 leading-tight">{entry.riggingKit}</span>
                                    </div>
                                )}
                                {entry.propDesc && (
                                    <div className="flex items-start gap-2">
                                        <Anchor className="h-3 w-3 text-primary/60 shrink-0 mt-0.5" />
                                        <span className="text-[10px] font-bold text-slate-600 leading-tight">
                                            {entry.propDesc}
                                            {entry.propPartNo && !/supplied with motor/i.test(entry.propPartNo) && (
                                                <span className="text-slate-400"> · {entry.propPartNo}</span>
                                            )}
                                        </span>
                                    </div>
                                )}
                                {entry.engineHole && (
                                    <div className="flex items-start gap-2">
                                        <Gauge className="h-3 w-3 text-primary/60 shrink-0 mt-0.5" />
                                        <span className="text-[10px] font-bold text-slate-600 leading-tight">Engine hole: {entry.engineHole}</span>
                                    </div>
                                )}
                            </div>
                            <div className="mt-auto pt-2 border-t border-slate-100 flex items-center justify-between">
                                {isResolved ? (
                                    <>
                                        <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Excl. GST</span>
                                        <span className={cn('font-black italic text-sm', isSelected ? 'text-primary' : 'text-slate-900')}>
                                            {/* formatCurrency enforces the whole-dollar / 2-dp rule —
                                                bare toLocaleString() can emit 1-or-3-decimal prices. */}
                                            {formatCurrency(price)}
                                        </span>
                                    </>
                                ) : (
                                    <span className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-slate-400">
                                        <Info className="h-3 w-3" /> Not in this module&apos;s motor list
                                    </span>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>
            <div className="flex items-center gap-4 py-2">
                <div className="flex-1 border-t-2 border-dashed border-slate-200" />
                <span className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-300">All compatible motors</span>
                <div className="flex-1 border-t-2 border-dashed border-slate-200" />
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Step 4 — Trailer menu                                               */
/* ------------------------------------------------------------------ */

export interface NsmTrailerMenuEntry {
    slot?: number | null;
    name?: string | null;
    display?: string | null;
    standard?: boolean | null;
    /** Resolved trailer assignment from model.trailerAssignments (name/code
     *  match). null = no match → info-only chip. */
    assignment: any | null;
}

export function NsmTrailerMenuSection({
    entries,
    isEntryActive,
    onSelect,
}: {
    entries: NsmTrailerMenuEntry[];
    isEntryActive: (entry: NsmTrailerMenuEntry) => boolean;
    onSelect: (entry: NsmTrailerMenuEntry) => void;
}) {
    if (!entries || entries.length === 0) return null;
    return (
        <div className="space-y-4 animate-in fade-in duration-700">
            <NsmSectionHeader title="NSM Recommended trailers" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {entries.map((entry, idx) => {
                    const label = entry.name || entry.display || 'Trailer';
                    const isResolved = !!entry.assignment;
                    const isActive = isResolved && isEntryActive(entry);
                    return (
                        <button
                            key={`${entry.slot ?? idx}-${label}`}
                            type="button"
                            disabled={!isResolved}
                            onClick={() => isResolved && onSelect(entry)}
                            className={cn(
                                'relative flex flex-col text-left border-2 rounded-[1.5rem] overflow-hidden transition-all bg-white shadow-lg p-5 gap-3 h-full',
                                isActive
                                    ? 'bg-primary/5 border-primary shadow-md ring-2 ring-primary/20'
                                    : isResolved
                                        ? 'border-transparent hover:border-primary/30'
                                        : 'border-dashed border-slate-200 opacity-80 cursor-default',
                            )}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2.5 min-w-0">
                                    <Truck className={cn('h-4 w-4 shrink-0 mt-0.5', isActive ? 'text-primary' : 'text-slate-400')} />
                                    <p className={cn('text-[11px] font-black uppercase tracking-tight leading-tight', isActive ? 'text-primary' : 'text-slate-900')}>
                                        {label}
                                    </p>
                                </div>
                                <div className="flex flex-col items-end gap-1 shrink-0">
                                    {(entry.standard === true || (entry.slot ?? idx + 1) === 1) && (
                                        <Badge className="bg-emerald-500 text-white border-none font-black text-[7px] uppercase h-4 px-1.5 gap-1">
                                            <Star className="h-2 w-2 fill-white" /> Recommended
                                        </Badge>
                                    )}
                                    {isActive && (
                                        <Badge className="bg-primary text-white border-none font-black text-[7px] uppercase h-4 px-1.5 gap-1">
                                            <Check className="h-2 w-2" /> Selected
                                        </Badge>
                                    )}
                                </div>
                            </div>
                            <div className="mt-auto pt-2 border-t border-slate-100">
                                {isResolved ? (
                                    <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">
                                        Matches assigned trailer {entry.assignment?.code || entry.assignment?.name || ''}
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-slate-400">
                                        <Info className="h-3 w-3" /> Not assigned to this boat yet
                                    </span>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Step 5 — Dealer fit recommendations + rigging kit line              */
/* ------------------------------------------------------------------ */

export interface NsmDealerFitLine {
    name: string;
    /** Matched dealerFitSelections doc (case-insensitive name match).
     *  null = no match → info chip, not selectable. */
    match: { id: string; name: string } | null;
}

export function NsmDealerFitStrip({
    lines,
    selectedIds,
    onToggle,
}: {
    lines: NsmDealerFitLine[];
    selectedIds: string[];
    onToggle: (id: string) => void;
}) {
    if (!lines || lines.length === 0) return null;
    return (
        <div className="space-y-4 animate-in fade-in duration-700">
            <NsmSectionHeader title="Recommended for this boat" />
            <div className="flex flex-wrap gap-2 p-4 rounded-[1.5rem] border-2 border-primary/15 bg-primary/5">
                {lines.map((line, idx) => {
                    if (line.match) {
                        const isSelected = selectedIds.includes(line.match.id);
                        return (
                            <button
                                key={`${idx}-${line.name}`}
                                type="button"
                                onClick={() => onToggle(line.match!.id)}
                                className={cn(
                                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 text-[9px] font-black uppercase tracking-widest transition-all shadow-sm',
                                    isSelected
                                        ? 'bg-primary border-primary text-white'
                                        : 'bg-white border-primary/25 text-primary hover:border-primary',
                                )}
                            >
                                {isSelected ? <CheckCircle2 className="h-3 w-3" /> : <Check className="h-3 w-3 opacity-50" />}
                                {line.match.name}
                            </button>
                        );
                    }
                    return (
                        <span
                            key={`${idx}-${line.name}`}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 border-dashed border-slate-200 bg-white text-[9px] font-black uppercase tracking-widest text-slate-400"
                            title="Not yet configured as a Dealer Fit option — informational only"
                        >
                            <Info className="h-3 w-3" />
                            {line.name}
                        </span>
                    );
                })}
            </div>
        </div>
    );
}

export function NsmRiggingKitLine({
    kitName,
    retailExGst,
}: {
    kitName: string;
    retailExGst: number | null;
}) {
    if (!kitName) return null;
    return (
        <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-3 rounded-2xl border-2 border-primary/15 bg-primary/5 shadow-sm">
            <div className="flex items-center gap-2.5 min-w-0">
                <Wrench className="h-3.5 w-3.5 text-primary shrink-0" />
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-700 truncate">
                    Rigging: <span className="text-primary">{kitName}</span>
                </p>
            </div>
            {retailExGst != null && (
                <span className="text-[10px] font-black text-primary tabular-nums shrink-0">
                    {formatCurrency(retailExGst)} <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">retail ex GST</span>
                </span>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Step 2 — Standard inclusions                                        */
/* ------------------------------------------------------------------ */

export function StandardInclusionsCard({ items }: { items: string[] }) {
    if (!items || items.length === 0) return null;
    return (
        <div className="space-y-4 animate-in fade-in duration-700">
            <div className="flex items-center justify-between gap-3 flex-wrap bg-emerald-600 px-4 sm:px-6 py-3 rounded-2xl shadow-xl w-full min-w-0">
                <div className="flex items-center gap-3">
                    <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Standard Inclusions</h3>
                </div>
                <span className="text-[8px] font-black uppercase tracking-widest text-white/70">{items.length} item{items.length === 1 ? '' : 's'} included</span>
            </div>
            <Card className="rounded-[2rem] border-2 shadow-xl bg-white p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                    {items.map((item, i) => (
                        <div key={i} className="flex items-start gap-2">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                            <span className="text-[10px] font-bold text-slate-700 leading-snug">{item}</span>
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Step 6 — Deposit schedule + lead time                               */
/* ------------------------------------------------------------------ */

const DEPOSIT_STAGES: Array<{ key: string; label: string }> = [
    { key: 'pendingSecurity', label: 'Pending Security' },
    { key: 'confirmedDeal', label: 'Confirmed Deal' },
    { key: 'leavingFactory', label: 'Leaving Factory' },
    { key: 'noticeOfArrival', label: 'Notice of Arrival' },
    { key: 'onHandover', label: 'On Handover' },
];

/** MPF writes stage values as fractions (0.3 = 30%) but defend against a
 *  whole-percent import (30 = 30%). */
function normaliseStageFraction(v: any): number {
    const n = typeof v === 'number' ? v : parseFloat(v);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return n > 1 ? n / 100 : n;
}

export function DepositScheduleCard({
    schedule,
    leadTimesDays,
    totalIncGst,
}: {
    schedule: Record<string, any> | null | undefined;
    leadTimesDays: Record<string, any> | null | undefined;
    totalIncGst: number;
}) {
    const stages = DEPOSIT_STAGES
        .map(s => ({ ...s, fraction: normaliseStageFraction(schedule?.[s.key]) }))
        .filter(s => s.fraction > 0);

    let leadDays: number | null = null;
    if (leadTimesDays && typeof leadTimesDays === 'object') {
        const total = leadTimesDays.estimatedTotal;
        if (typeof total === 'number' && Number.isFinite(total) && total > 0) {
            leadDays = Math.round(total);
        } else {
            const sum = Object.values(leadTimesDays)
                .map(v => (typeof v === 'number' && Number.isFinite(v) ? v : 0))
                .reduce((a, b) => a + b, 0);
            if (sum > 0) leadDays = Math.round(sum);
        }
    }

    if (stages.length === 0 && leadDays == null) return null;

    return (
        <Card className="rounded-[1.5rem] border-2 shadow-lg overflow-hidden">
            <CardHeader className="bg-muted/30 border-b p-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                        <Banknote className="h-4 w-4 text-primary" />
                        <CardTitle className="text-xs font-black uppercase tracking-widest">Deposit Schedule</CardTitle>
                    </div>
                    <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">NSM Master Price File</span>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                {stages.length > 0 && (
                    <div className="divide-y">
                        {stages.map(stage => (
                            <div key={stage.key} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="h-6 w-6 rounded-lg bg-slate-100 flex items-center justify-center">
                                        <span className="text-[8px] font-black text-primary">{Math.round(stage.fraction * 100)}%</span>
                                    </div>
                                    <p className="text-[10px] font-black uppercase tracking-tight text-slate-700">{stage.label}</p>
                                </div>
                                {/* Whole-dollar ceil per the v1.3 inc-GST rounding lesson. */}
                                <p className="text-[10px] font-bold text-slate-600 tabular-nums">${Math.ceil(totalIncGst * stage.fraction).toLocaleString()} <span className="text-[8px] text-slate-400 uppercase">inc GST</span></p>
                            </div>
                        ))}
                    </div>
                )}
                {leadDays != null && (
                    <div className={cn('p-4 flex items-center justify-between bg-primary/5', stages.length > 0 && 'border-t-2 border-primary/20')}>
                        <div className="flex items-center gap-3">
                            <Clock className="h-4 w-4 text-primary" />
                            <p className="text-[10px] font-black uppercase tracking-widest text-primary">Estimated lead time</p>
                        </div>
                        <p className="text-[10px] font-black text-primary">~{leadDays} days</p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

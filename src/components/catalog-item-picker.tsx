'use client';

/**
 * CatalogItemPicker — "Service & Counter Quotes" catalog-line picker
 * (decision.standalone-quotes, 2026-07-03, Asaf).
 *
 * Tabbed picker (Motors / Trailers / Dealer Fit / Rigging Kits) that lets a
 * standalone service/counter quote carry CATALOG items at MPF prices,
 * alongside the existing serviceOperations + serviceParts lines. Mounted in
 * BOTH the create wizard (Parts step) and the ServiceQuoteDetailSheet (next
 * to the engine-schedule picker).
 *
 * Data sources (all live, loaded lazily on first tab activation with the
 * engine-schedule-picker's caught-getDocs pattern — a missing collection or
 * rule degrades to the empty state, never an error boundary):
 *
 *   Motors      data-warehouse/{Motor Brand vendors}/dataSets/{ds}/rows
 *               name = 'Model Name' → 'MODEL' → 'MODEL CODE'; sell =
 *               'NSM Retail' (hull_cash) → 'Store Price' → 'Sell Price';
 *               cost = 'Dealer Buy' → 'Total CTD'
 *   Trailers    data-warehouse/{Trailer Brand vendors}/series/{s}/trailers
 *               (plus the direct /trailers subcollection some vendors use);
 *               sell = sellPriceExclGst, cost = cost
 *   Dealer Fit  organisations/{orgId}/dealerFitSelections
 *               sell = items[0].data['Act Sell'], cost = items[0].data['Act CTD']
 *   Rigging     organisations/{orgId}/riggingKits
 *               sell = sellPriceExclGst, cost = kitCost → dealerCost; when a
 *               kit has installHours, adding it ALSO emits an op-style labour
 *               line "Install: {kit}" (hours + rate mirrored from the kit's
 *               MPF installLabour dollars; fallback rate = the MPF
 *               labourRateExGst constant 130.09)
 *
 * Lines are emitted in the EXACT shapes the service-quote engine already
 * uses, so totals math (GST ceil), lifecycle and the PDF need no changes:
 *   parts → { id, partNumber, name, qty, cost, sellPrice, itemType }
 *   ops   → { id, code, name, hours, rate, sellPrice, cost }  (labour only)
 *
 * Search UX mirrors the MQ-2 pattern: lists larger than 50 rows require
 * ≥2 search characters; the rendered list is always capped at 50 with a
 * refine-your-search hint. All field access is String()-guarded (MPF docs
 * carry numeric cells — see the engine-schedule-picker familyCode crash).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Anchor, Loader2, Plus, Ship, Wrench, Package2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveItemImageUrl } from '@/lib/hero-carousel';

/* ─── Emitted line shapes (match service-quote-flow's wizard lines) ─── */

/** Matches ServiceQuoteLinePart + an itemType tag for display/PDF labels. */
export interface CatalogPartLine {
    id: string;
    partNumber: string;
    name: string;
    qty: number;
    cost: number;
    sellPrice: number;
    /** 'motor' | 'trailer' | 'dealer-fit' | 'rigging-kit' */
    itemType: string;
}

/** Matches ServiceQuoteLineOp (used for rigging-kit install labour). */
export interface CatalogOpLine {
    id: string;
    code: string;
    name: string;
    hours: number;
    rate: number;
    sellPrice: number;
    cost: number;
}

/* ─── Internal result-row shape (one per catalog doc, normalized) ─── */

interface CatalogRow {
    id: string;
    name: string;
    code?: string;
    sell: number;
    cost: number;
    /** Rigging only — install labour hours + MPF labour dollars. */
    installHours?: number;
    installLabour?: number;
    /* ── Motors only (v1.34 motor-package quoting; MPF is source of truth) ── */
    image?: string | null;
    hp?: string | null;
    shaft?: string | null;
    control?: string | null;
    /** The motor row's own MPF install economics (CI–CY band): the
     *  "Install - Sell" figure + the Installation description + labour hrs. */
    installSell?: number;
    installName?: string | null;
    installHrs?: number;
    /** Standard (isStandard) rigging + prop from the motor's
     *  masterAccessories — the MPF package defaults. */
    stdRigging?: { name: string; sell: number; cost: number } | null;
    stdProp?: { name: string; sell: number; cost: number } | null;
}

export type CatalogTabId = 'motors' | 'trailers' | 'dealer-fit' | 'rigging';
type TabId = CatalogTabId;

export function isCatalogTabId(v: any): v is CatalogTabId {
    return v === 'motors' || v === 'trailers' || v === 'dealer-fit' || v === 'rigging';
}

const TABS: Array<{ id: TabId; label: string; icon: any; itemType: string }> = [
    { id: 'motors', label: 'Motors', icon: Anchor, itemType: 'motor' },
    { id: 'trailers', label: 'Trailers', icon: Ship, itemType: 'trailer' },
    { id: 'dealer-fit', label: 'Dealer Fit', icon: Package2, itemType: 'dealer-fit' },
    { id: 'rigging', label: 'Rigging Kits', icon: Wrench, itemType: 'rigging-kit' },
];

// MQ-2 pattern — large lists need ≥2 chars, rendered rows capped at 50.
const RENDER_CAP = 50;
const MIN_SEARCH_CHARS = 2;
/** MPF Rigging Module rateConstants.labourRateExGst — fallback when a kit
 *  has installHours but no installLabour dollars. */
const FALLBACK_LABOUR_RATE = 130.09;

function num(v: any): number {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const p = parseFloat(String(v ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(p) ? p : 0;
}

function currency(n: number | null | undefined) {
    if (n == null || isNaN(n)) return '—';
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n);
}

/* ─── Per-tab loaders (caught getDocs, aggregate-loader pattern) ─── */

async function loadMotors(firestore: any): Promise<CatalogRow[]> {
    const out: CatalogRow[] = [];
    const vendorsSnap = await getDocs(query(collection(firestore, 'data-warehouse'), where('vendorType', '==', 'Motor Brand')));
    for (const v of vendorsSnap.docs) {
        try {
            const dsSnap = await getDocs(collection(firestore, 'data-warehouse', v.id, 'dataSets'));
            const datasets = dsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
            const target = datasets.find(s =>
                String(s.name ?? '').toLowerCase().includes('outboard') ||
                String(s.name ?? '').toLowerCase().includes('motor'),
            ) || datasets[0];
            if (!target) continue;
            const rowsSnap = await getDocs(collection(firestore, 'data-warehouse', v.id, 'dataSets', target.id, 'rows'));
            for (const d of rowsSnap.docs) {
                const r = d.data() as any;
                const code = String(r['MODEL CODE'] ?? r['Part Number'] ?? '').trim();
                // MPF section pseudo-rows ("TWIN RIG OPTIONS - …") carry no
                // code — layout, not motors.
                if (!code) continue;
                const name = String(r['Model Name'] ?? r['MODEL'] ?? r['Model'] ?? r.name ?? '').trim() || d.id;
                // hull_cash = NSM Retail (CLAUDE.md motor priceLevels mapping)
                const sell = num(r['NSM Retail']) || num(r['Store Price']) || num(r['Sell Price']) || num(r.priceLevels?.hull_cash) || num(r.sellPriceExclGst);
                // Total CTD is the MPF's true landed cost (AX band).
                const cost = num(r.cost) || num(r['Total CTD']) || num(r['Dealer Buy']);
                // v1.34 — the MPF package ingredients live on the motor row:
                // install economics + the standard rigging/prop accessories.
                const accs: any[] = Array.isArray(r.masterAccessories) ? r.masterAccessories : [];
                const accPrice = (a: any) => (a.items || []).reduce((s2: number, it: any) => {
                    const dd = it?.data || {};
                    return s2 + (num(dd['Act Sell']) || num(dd.sellPriceExclGst) || num(dd['Store Price']) || num(dd.RRP) || num(dd.Price) || 0);
                }, 0);
                const accCost = (a: any) => (a.items || []).reduce((s2: number, it: any) => {
                    const dd = it?.data || {};
                    return s2 + (num(dd['Act CTD']) || num(dd.cost) || num(dd['Dealer Buy']) || 0);
                }, 0);
                const std = (cat: string) => {
                    const a = accs.find(x => String(x?.category) === cat && (x?.isStandard || x?.standard));
                    return a ? { name: String(a.name || cat), sell: accPrice(a), cost: accCost(a) } : null;
                };
                out.push({
                    id: d.id, name, code: code || undefined, sell, cost,
                    image: resolveItemImageUrl(r, () => true),
                    hp: r['HP Rating'] != null ? String(r['HP Rating']) : null,
                    shaft: r['Shaft Length'] != null ? String(r['Shaft Length']) : (r.Shaft != null ? String(r.Shaft) : null),
                    control: r.Control != null ? String(r.Control) : null,
                    installSell: num(r['Install - Sell']) || num(r['Sales Install']) || 0,
                    installName: r.Installation != null ? String(r.Installation) : null,
                    installHrs: num(r['Labour (Hrs)']) || 0,
                    stdRigging: std('Rigging'),
                    stdProp: std('Propeller'),
                });
            }
        } catch (err) {
            console.warn(`[CatalogItemPicker] motor vendor ${v.id} unavailable (non-fatal)`, err);
        }
    }
    return out;
}

async function loadTrailers(firestore: any): Promise<CatalogRow[]> {
    const out: CatalogRow[] = [];
    const vendorsSnap = await getDocs(query(collection(firestore, 'data-warehouse'), where('vendorType', '==', 'Trailer Brand')));
    for (const v of vendorsSnap.docs) {
        try {
            // Direct /trailers subcollection (some vendors) …
            const direct = await getDocs(collection(firestore, 'data-warehouse', v.id, 'trailers'));
            for (const d of direct.docs) {
                const t = d.data() as any;
                out.push({ id: `${v.id}/${d.id}`, name: String(t.name ?? '').trim() || d.id, code: String(t.code ?? '').trim() || undefined, sell: num(t.sellPriceExclGst), cost: num(t.cost) });
            }
            // … plus the series/{s}/trailers tree (trailer-dashboard pattern).
            const seriesSnap = await getDocs(collection(firestore, 'data-warehouse', v.id, 'series'));
            for (const s of seriesSnap.docs) {
                const trailersSnap = await getDocs(collection(firestore, 'data-warehouse', v.id, 'series', s.id, 'trailers'));
                for (const d of trailersSnap.docs) {
                    const t = d.data() as any;
                    out.push({ id: `${v.id}/${s.id}/${d.id}`, name: String(t.name ?? '').trim() || d.id, code: String(t.code ?? '').trim() || undefined, sell: num(t.sellPriceExclGst), cost: num(t.cost) });
                }
            }
        } catch (err) {
            console.warn(`[CatalogItemPicker] trailer vendor ${v.id} unavailable (non-fatal)`, err);
        }
    }
    return out;
}

async function loadDealerFit(firestore: any, organisationId: string): Promise<CatalogRow[]> {
    const snap = await getDocs(collection(firestore, 'organisations', organisationId, 'dealerFitSelections'));
    return snap.docs.map(d => {
        const s = d.data() as any;
        const data = Array.isArray(s.items) && s.items.length > 0 ? (s.items[0]?.data ?? {}) : {};
        return {
            id: d.id,
            name: String(s.name ?? '').trim() || d.id,
            code: String(data['Part Number'] ?? data['Code'] ?? '').trim() || undefined,
            sell: num(data['Act Sell'] ?? data.sellPriceExclGst),
            cost: num(data['Act CTD'] ?? data.cost),
        };
    });
}

async function loadRiggingKits(firestore: any, organisationId: string): Promise<CatalogRow[]> {
    const snap = await getDocs(collection(firestore, 'organisations', organisationId, 'riggingKits'));
    return snap.docs.map(d => {
        const k = d.data() as any;
        const hours = num(k.installHours ?? k.installHrs);
        return {
            id: d.id,
            name: String(k.name ?? k.description ?? k.desc ?? '').trim() || String(k.partNumber ?? k.partNo ?? d.id),
            code: String(k.partNumber ?? k.partNo ?? '').trim() || undefined,
            sell: num(k.sellPriceExclGst ?? k.retailExGst),
            cost: num(k.kitCost ?? k.kitCtd ?? k.dealerCost),
            installHours: hours > 0 ? hours : undefined,
            installLabour: num(k.installLabour) > 0 ? num(k.installLabour) : undefined,
        };
    });
}

/* ─── Component ─── */

/** One atomic add: the catalog item as a part line, plus (rigging kits with
 *  installHours only) the install-labour op line. Emitting both in a single
 *  callback lets the detail sheet write ONE Firestore patch — two sequential
 *  patches against a stale `quote` snapshot would clobber the totals. */
export interface CatalogAdd {
    part: CatalogPartLine;
    installOp?: CatalogOpLine;
    /** v1.34 motor-package quoting — additional lines that belong to the
     *  same add (std rigging + std prop). Emitted in the SAME callback so
     *  detail-sheet consumers still write ONE Firestore patch. */
    bundleParts?: CatalogPartLine[];
}

export function CatalogItemPicker({
    organisationId,
    disabled,
    onAdd,
    initialTab,
}: {
    organisationId: string;
    disabled?: boolean;
    onAdd: (add: CatalogAdd) => Promise<void> | void;
    /** Deep-link preselection (module entry points pass ?catalogTab=…). */
    initialTab?: string | null;
}) {
    const firestore = useFirestore();
    const [activeTab, setActiveTab] = useState<TabId>(isCatalogTabId(initialTab) ? initialTab : 'motors');
    const [search, setSearch] = useState('');
    const [addingId, setAddingId] = useState<string | null>(null);
    // Per-tab caches: undefined = not loaded yet, null = loading.
    const [cache, setCache] = useState<Partial<Record<TabId, CatalogRow[] | null>>>({});

    const rows = cache[activeTab];
    /** Ref-guarded so the loader fires exactly once per tab even under
     *  StrictMode double-invocation / rapid tab clicks. */
    const kicked = useRef<Set<TabId>>(new Set());

    const loadTab = (tab: TabId) => {
        if (kicked.current.has(tab)) return; // loaded or loading
        kicked.current.add(tab);
        setCache(prev => ({ ...prev, [tab]: null }));
        (async () => {
            let loaded: CatalogRow[] = [];
            try {
                if (tab === 'motors') loaded = await loadMotors(firestore);
                else if (tab === 'trailers') loaded = await loadTrailers(firestore);
                else if (tab === 'dealer-fit') loaded = await loadDealerFit(firestore, organisationId);
                else loaded = await loadRiggingKits(firestore, organisationId);
            } catch (err) {
                // Non-essential read — missing collection/rule = empty state.
                console.warn(`[CatalogItemPicker] ${tab} read unavailable (non-fatal)`, err);
                loaded = [];
            }
            setCache(prev => ({ ...prev, [tab]: loaded }));
        })();
    };

    const activateTab = (tab: TabId) => {
        setActiveTab(tab);
        setSearch('');
        loadTab(tab);
    };

    // Load the initial tab once on mount (default motors; deep links may
    // preselect trailers / dealer-fit / rigging).
    useEffect(() => {
        loadTab(activeTab);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const q = search.trim().toLowerCase();
    const needsSearch = (rows?.length ?? 0) > RENDER_CAP && q.length < MIN_SEARCH_CHARS;
    const matches = useMemo(() => {
        if (!rows || needsSearch) return [];
        if (!q) return rows;
        return rows.filter(r =>
            String(r.name ?? '').toLowerCase().includes(q) ||
            String(r.code ?? '').toLowerCase().includes(q),
        );
    }, [rows, q, needsSearch]);
    const rendered = useMemo(() => matches.slice(0, RENDER_CAP), [matches]);
    const overflow = matches.length - rendered.length;

    const tabMeta = TABS.find(t => t.id === activeTab)!;

    const handleAdd = async (row: CatalogRow, asPackage = false) => {
        setAddingId(row.id);
        try {
            const add: CatalogAdd = {
                part: {
                    id: `${tabMeta.itemType}-${row.id.replace(/\//g, '_')}-${Date.now()}`,
                    partNumber: row.code ?? row.id,
                    name: row.name,
                    qty: 1,
                    cost: row.cost ?? 0,
                    sellPrice: row.sell ?? 0,
                    itemType: tabMeta.itemType,
                },
            };
            // v1.34 — MPF motor package: motor + its own install economics
            // (Install - Sell from the row's CI–CY band) + the standard
            // rigging kit + standard prop from masterAccessories. Exactly
            // how the Motor Module sheet composes a motor quote.
            if (activeTab === 'motors' && asPackage) {
                if (row.installSell && row.installSell > 0) {
                    const hrs = row.installHrs || 0;
                    add.installOp = {
                        id: `motor-install-${row.id}-${Date.now()}`,
                        code: 'INSTALL',
                        name: row.installName ? `Install: ${row.installName}` : `Install: ${row.name}`,
                        hours: hrs,
                        rate: hrs > 0 ? Math.round((row.installSell / hrs) * 100) / 100 : 0,
                        sellPrice: row.installSell,
                        cost: 0,
                    };
                }
                const bundle: CatalogPartLine[] = [];
                if (row.stdRigging && row.stdRigging.sell > 0) {
                    bundle.push({
                        id: `motor-rigging-${row.id}-${Date.now()}`,
                        partNumber: 'RIGGING',
                        name: row.stdRigging.name,
                        qty: 1,
                        cost: row.stdRigging.cost ?? 0,
                        sellPrice: row.stdRigging.sell,
                        itemType: 'rigging-kit',
                    });
                }
                if (row.stdProp && row.stdProp.sell > 0) {
                    bundle.push({
                        id: `motor-prop-${row.id}-${Date.now()}`,
                        partNumber: 'PROP',
                        name: row.stdProp.name,
                        qty: 1,
                        cost: row.stdProp.cost ?? 0,
                        sellPrice: row.stdProp.sell,
                        itemType: 'propeller',
                    });
                }
                if (bundle.length) add.bundleParts = bundle;
            }
            // Rigging kits with install hours also carry the shop-rate labour
            // as a clearly-labelled op-style line (mirrors how wizard op lines
            // carry hours/rate; sell comes from the kit's MPF installLabour).
            if (activeTab === 'rigging' && row.installHours && row.installHours > 0) {
                const hours = row.installHours;
                const labour = row.installLabour ?? Math.round(hours * FALLBACK_LABOUR_RATE * 100) / 100;
                add.installOp = {
                    id: `rigging-install-${row.id}-${Date.now()}`,
                    code: 'INSTALL',
                    name: `Install: ${row.name}`,
                    hours,
                    rate: hours > 0 ? Math.round((labour / hours) * 100) / 100 : 0,
                    sellPrice: labour,
                    cost: 0,
                };
            }
            await onAdd(add);
        } finally {
            setAddingId(null);
        }
    };

    return (
        <section className="rounded-2xl border-2 bg-white p-4 space-y-3">
            <div className="flex items-center gap-2">
                <Anchor className="h-3 w-3 text-amber-600" />
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-700">Catalog items</p>
                <Badge variant="outline" className="text-[8px] font-black uppercase text-slate-400 border-slate-200">Optional</Badge>
            </div>
            <p className="text-[10px] text-muted-foreground">
                Add motors, trailers, dealer-fit options or rigging kits to this quote at catalogue (ex-GST) prices — no boat required.
            </p>

            {/* Tabs */}
            <div className="flex flex-wrap gap-1.5">
                {TABS.map(t => {
                    const Icon = t.icon;
                    const on = t.id === activeTab;
                    return (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => activateTab(t.id)}
                            className={cn(
                                'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition-colors',
                                on ? 'border-primary bg-primary/5 text-primary' : 'border-slate-200 hover:bg-slate-50 text-slate-700',
                            )}
                        >
                            <Icon className="h-3 w-3" />
                            {t.label}
                        </button>
                    );
                })}
            </div>

            {rows === null || rows === undefined ? (
                <div className="flex items-center gap-2 py-3 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span className="text-[10px]">Loading {tabMeta.label.toLowerCase()}…</span>
                </div>
            ) : rows.length === 0 ? (
                <p className="text-[10px] text-muted-foreground italic">
                    No {tabMeta.label.toLowerCase()} in the catalogue yet.
                </p>
            ) : (
                <div className="space-y-2">
                    <Input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder={`Search ${tabMeta.label.toLowerCase()} by name or code…`}
                        className="rounded-xl border-2 h-8 text-xs"
                    />

                    {needsSearch ? (
                        <p className="text-[10px] text-muted-foreground italic text-center py-3">
                            Type at least {MIN_SEARCH_CHARS} characters to search {rows.length.toLocaleString()} {tabMeta.label.toLowerCase()}.
                        </p>
                    ) : rendered.length === 0 ? (
                        <p className="text-[10px] text-muted-foreground italic text-center py-3">
                            No {tabMeta.label.toLowerCase()} match “{search.trim()}”.
                        </p>
                    ) : (
                        <div className="max-h-56 overflow-y-auto divide-y rounded-xl border-2 border-slate-200">
                            {rendered.map(row => {
                                const busy = addingId === row.id;
                                const isMotor = activeTab === 'motors';
                                const pkgBits: string[] = [];
                                if (isMotor) {
                                    if (row.installSell) pkgBits.push(`install ${currency(row.installSell)}`);
                                    if (row.stdRigging?.sell) pkgBits.push(`rigging ${currency(row.stdRigging.sell)}`);
                                    if (row.stdProp?.sell) pkgBits.push(`prop ${currency(row.stdProp.sell)}`);
                                }
                                const pkgTotal = isMotor
                                    ? (row.sell ?? 0) + (row.installSell ?? 0) + (row.stdRigging?.sell ?? 0) + (row.stdProp?.sell ?? 0)
                                    : 0;
                                return (
                                    <div key={row.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                                        {isMotor && (
                                            row.image
                                                ? <img src={row.image} alt="" className="h-9 w-12 object-contain shrink-0 mix-blend-multiply" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                                                : <div className="h-9 w-12 shrink-0 rounded bg-slate-50 border flex items-center justify-center"><Anchor className="h-3.5 w-3.5 text-slate-300" /></div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-semibold truncate">{row.name}</p>
                                            <p className="text-[9px] text-muted-foreground truncate">
                                                {row.code && <span className="font-mono font-bold">{row.code}</span>}
                                                {isMotor && row.hp ? ` · ${row.hp} HP` : ''}
                                                {isMotor && row.shaft ? ` · ${row.shaft}` : ''}
                                                {row.installHours ? `${row.code ? ' · ' : ''}install ${row.installHours}h${row.installLabour ? ` (+${currency(row.installLabour)} labour)` : ''}` : ''}
                                            </p>
                                            {isMotor && pkgBits.length > 0 && (
                                                <p className="text-[9px] text-emerald-700 font-bold truncate" title={pkgBits.join(' + ')}>
                                                    Package: + {pkgBits.join(' + ')}
                                                </p>
                                            )}
                                        </div>
                                        <span className="text-xs font-bold tabular-nums shrink-0">{currency(row.sell)}</span>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            disabled={disabled || busy}
                                            onClick={() => handleAdd(row)}
                                            className="rounded-lg h-7 px-2 text-[10px] font-bold shrink-0"
                                        >
                                            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                                            <span className="ml-1">Add</span>
                                        </Button>
                                        {isMotor && pkgBits.length > 0 && (
                                            <Button
                                                type="button"
                                                size="sm"
                                                disabled={disabled || busy}
                                                onClick={() => handleAdd(row, true)}
                                                className="rounded-lg h-7 px-2 text-[10px] font-bold shrink-0"
                                                title={`Motor + ${pkgBits.join(' + ')} = ${currency(pkgTotal)}`}
                                            >
                                                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                                                <span className="ml-1">Package {currency(pkgTotal)}</span>
                                            </Button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {overflow > 0 && (
                        <p className="text-[10px] text-muted-foreground italic">
                            Showing the first {RENDER_CAP} of {matches.length.toLocaleString()} matches — refine your search.
                        </p>
                    )}
                </div>
            )}
        </section>
    );
}

/* ─── Module entry points (Asaf scope-add, 2026-07-03) ─────────────────
 * "New Quote" affordance for the Trailers / Yamaha Outboards / Fit-Up &
 * Rigging module surfaces. Deep-links into the Service & Counter Quotes
 * create wizard with the matching catalog tab preselected
 * (/modules/{serviceModuleId}?newQuote=1&catalogTab={tab}).
 *
 * The service module id is discovered with a caught one-shot getDocs
 * (modules where moduleType == 'service'); if the org has no service
 * module the button renders nothing — the surface stays untouched.
 * Styled to match the module-hero pill buttons ("Back to Hub"). */

export function CounterQuoteEntryButton({
    tab,
    label,
    className,
}: {
    tab: CatalogTabId;
    label: string;
    className?: string;
}) {
    const firestore = useFirestore();
    const router = useRouter();
    const [serviceModuleId, setServiceModuleId] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const snap = await getDocs(query(collection(firestore, 'modules'), where('moduleType', '==', 'service'), limit(1)));
                if (!cancelled && !snap.empty) setServiceModuleId(snap.docs[0].id);
            } catch (err) {
                // Non-essential read — no service module / missing rule = no button.
                console.warn('[CounterQuoteEntryButton] service-module lookup unavailable (non-fatal)', err);
            }
        })();
        return () => { cancelled = true; };
    }, [firestore]);

    if (!serviceModuleId) return null;

    return (
        <Button
            variant="ghost"
            onClick={() => router.push(`/modules/${serviceModuleId}?newQuote=1&catalogTab=${tab}`)}
            className={cn(
                'h-10 px-6 font-black uppercase tracking-widest text-[10px] bg-white/5 hover:bg-white/10 text-white rounded-full transition-all border border-white/5 shadow-xl flex items-center',
                className,
            )}
        >
            <Plus className="h-4 w-4 mr-2" />
            <span>{label}</span>
        </Button>
    );
}

'use client';

/**
 * RegoPicker — shared picker used by boat + trailer quote flows.
 *
 * Loads every rego module visible to the caller, fans out one listener per
 * Rego Authority vendor's `regoTypes` sub-collection, and renders a single
 * grouped <Select>. On change, emits a frozen snapshot (motor-style) so
 * quote totals never drift when the catalog changes later.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileCheck, X } from 'lucide-react';
import { formatCurrency } from '@/lib/currency-utils';

export interface RegoTypeSnapshot {
    id: string;                    // `${vendorId}/${regoTypeId}` for provenance
    vendorId: string;
    vendorName: string;
    regoTypeId: string;
    name: string;
    sellExclGst: number;
    appliesTo: 'boat' | 'trailer' | 'both';
    description?: string;
    capturedAt: number;
}

interface RegoVendor {
    id: string;
    name: string;
    state?: string;
}

interface RegoType {
    id: string;
    name: string;
    sellExclGst?: number;
    appliesTo?: 'boat' | 'trailer' | 'both';
    description?: string;
    isActive?: boolean;
    /** v1.11 — band rules for auto-association with boats at scale.
     *  Boat bands use minLengthM/maxLengthM (hull length); trailer bands
     *  use minAtmKg/maxAtmKg (aggregate trailer mass). A type matches a
     *  context value when min <= value < max. Empty = no auto-match
     *  (manual pick only). */
    minLengthM?: number;
    maxLengthM?: number;
    minAtmKg?: number;
    maxAtmKg?: number;
}

interface RegoModuleDoc {
    id: string;
    regoVendorIds?: string[];
}

type Option = {
    key: string;              // `${vendorId}/${typeId}`
    vendor: RegoVendor;
    type: RegoType;
};

function VendorTypesLoader({
    vendor,
    onLoaded,
}: {
    vendor: RegoVendor;
    onLoaded: (vendorId: string, types: RegoType[]) => void;
}) {
    const firestore = useFirestore();
    const q = useMemoFirebase(
        () => collection(firestore, `data-warehouse/${vendor.id}/regoTypes`),
        [firestore, vendor.id],
    );
    const { data } = useCollection<RegoType>(q);
    useEffect(() => {
        if (data) onLoaded(vendor.id, data);
    }, [data, vendor.id, onLoaded]);
    return null;
}

export function RegoPicker({
    filter = 'both',
    value,
    onChange,
    label,
    autoMatchLengthM,
    autoMatchAtmKg,
}: {
    filter?: 'boat' | 'trailer' | 'both' | 'any';
    value: RegoTypeSnapshot | null;
    onChange: (snap: RegoTypeSnapshot | null) => void;
    label?: string;
    /** v1.11 — boat hull length (m) for auto-matching a boat rego band. */
    autoMatchLengthM?: number;
    /** v1.11 — trailer ATM (kg) for auto-matching a trailer rego band. */
    autoMatchAtmKg?: number;
}) {
    const firestore = useFirestore();

    const regoModulesQuery = useMemoFirebase(
        () => query(collection(firestore, 'modules'), where('moduleType', '==', 'rego')),
        [firestore],
    );
    const { data: regoModules } = useCollection<RegoModuleDoc>(regoModulesQuery);

    const vendorIds = useMemo(() => {
        const ids = new Set<string>();
        (regoModules || []).forEach(m => (m.regoVendorIds || []).forEach(id => ids.add(id)));
        return Array.from(ids);
    }, [regoModules]);

    const vendorsQuery = useMemoFirebase(() => {
        if (!vendorIds.length) return null;
        return query(
            collection(firestore, 'data-warehouse'),
            where('__name__', 'in', vendorIds.slice(0, 30)),
        );
    }, [firestore, vendorIds]);
    const { data: vendors } = useCollection<RegoVendor>(vendorsQuery);

    // Collect types across all vendors. We use a ref-like map via useState+callback
    // to accumulate without re-rendering each vendor loader.
    const [typesByVendor, setTypesByVendor] = useState<Record<string, RegoType[]>>({});

    const handleVendorTypes = useMemo(() => {
        return (vendorId: string, types: RegoType[]) => {
            setTypesByVendor(prev => {
                // cheap dedupe — same length + same ids → no change
                const existing = prev[vendorId] || [];
                if (
                    existing.length === types.length &&
                    existing.every((t, i) => t.id === types[i]?.id && t.sellExclGst === types[i]?.sellExclGst && t.name === types[i]?.name)
                ) {
                    return prev;
                }
                return { ...prev, [vendorId]: types };
            });
        };
    }, []);

    const options: Option[] = useMemo(() => {
        const list: Option[] = [];
        (vendors || []).forEach(v => {
            const types = typesByVendor[v.id] || [];
            types.forEach(t => {
                if (t.isActive === false) return;
                const applies = t.appliesTo || 'both';
                if (filter !== 'any') {
                    if (filter === 'boat' && applies !== 'boat' && applies !== 'both') return;
                    if (filter === 'trailer' && applies !== 'trailer' && applies !== 'both') return;
                }
                list.push({ key: `${v.id}/${t.id}`, vendor: v, type: t });
            });
        });
        return list;
    }, [vendors, typesByVendor, filter]);

    const grouped = useMemo(() => {
        const g: Record<string, { vendor: RegoVendor; items: Option[] }> = {};
        options.forEach(o => {
            if (!g[o.vendor.id]) g[o.vendor.id] = { vendor: o.vendor, items: [] };
            g[o.vendor.id].items.push(o);
        });
        return Object.values(g).sort((a, b) => a.vendor.name.localeCompare(b.vendor.name));
    }, [options]);

    const selectedKey = value ? value.id : '';

    function snapOf(match: Option): RegoTypeSnapshot {
        return {
            id: match.key,
            vendorId: match.vendor.id,
            vendorName: match.vendor.name,
            regoTypeId: match.type.id,
            name: match.type.name,
            sellExclGst: typeof match.type.sellExclGst === 'number' ? match.type.sellExclGst : 0,
            appliesTo: match.type.appliesTo || 'both',
            description: match.type.description,
            capturedAt: Date.now(),
        };
    }

    function handleChange(key: string) {
        const match = options.find(o => o.key === key);
        if (!match) return;
        onChange(snapOf(match));
    }

    // v1.11 — auto-match a rego band from the boat length / trailer ATM.
    // Fires once per distinct context value (so clearing the selection
    // within the same boat doesn't immediately re-add it, but switching
    // to a different boat / trailer re-applies). Only auto-applies when
    // nothing is currently selected.
    const autoCtxKey = `${filter}|${autoMatchLengthM ?? ''}|${autoMatchAtmKg ?? ''}`;
    const lastAutoCtx = useRef<string>('');
    const [autoApplied, setAutoApplied] = useState(false);
    useEffect(() => {
        if (lastAutoCtx.current !== autoCtxKey) {
            lastAutoCtx.current = autoCtxKey;
            setAutoApplied(false);
        }
    }, [autoCtxKey]);
    useEffect(() => {
        if (value || autoApplied) return;
        const len = autoMatchLengthM;
        const atm = autoMatchAtmKg;
        if (len == null && atm == null) return;
        const hit = options.find(o => {
            const t = o.type;
            if (len != null && t.minLengthM != null && t.maxLengthM != null) {
                if (len >= t.minLengthM && len < t.maxLengthM) return true;
            }
            if (atm != null && t.minAtmKg != null && t.maxAtmKg != null) {
                if (atm >= t.minAtmKg && atm <= t.maxAtmKg) return true;
            }
            return false;
        });
        if (hit) {
            setAutoApplied(true);
            onChange(snapOf(hit));
        }
    }, [options, value, autoApplied, autoMatchLengthM, autoMatchAtmKg]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="space-y-2 min-w-0 w-full">
            {/* Invisible loaders — one per vendor. They push types into state. */}
            {(vendors || []).map(v => (
                <VendorTypesLoader key={v.id} vendor={v} onLoaded={handleVendorTypes} />
            ))}

            {label && (
                <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex-1 min-w-0 truncate">{label}</span>
                    {value && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[9px] font-black uppercase"
                            onClick={() => onChange(null)}
                        >
                            <X className="h-3 w-3 mr-1" /> Clear
                        </Button>
                    )}
                </div>
            )}

            <Select value={selectedKey} onValueChange={handleChange}>
                <SelectTrigger className="h-11 rounded-xl border-2 font-bold">
                    <SelectValue placeholder={options.length === 0 ? 'No rego types configured yet…' : 'Select a registration type…'} />
                </SelectTrigger>
                <SelectContent>
                    {options.length === 0 && (
                        <div className="px-3 py-2 text-[11px] text-slate-400 italic">
                            No active rego types match. Add them under the Rego module.
                        </div>
                    )}
                    {grouped.map(g => (
                        <div key={g.vendor.id}>
                            <div className="px-2 pt-2 pb-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
                                {g.vendor.name}{g.vendor.state ? ` · ${g.vendor.state}` : ''}
                            </div>
                            {g.items.map(o => (
                                <SelectItem key={o.key} value={o.key}>
                                    <span className="flex items-center gap-2">
                                        <span className="truncate">{o.type.name}</span>
                                        {typeof o.type.sellExclGst === 'number' && (
                                            <span className="text-[10px] text-primary font-black">
                                                {formatCurrency(o.type.sellExclGst)}
                                            </span>
                                        )}
                                    </span>
                                </SelectItem>
                            ))}
                        </div>
                    ))}
                </SelectContent>
            </Select>

            {value && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/5 border border-primary/20">
                    <FileCheck className="h-3.5 w-3.5 text-primary" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-primary flex-1 truncate">
                        {value.vendorName} · {value.name}
                    </span>
                    <Badge variant="outline" className="h-5 text-[9px] font-black border-primary/30 text-primary">
                        {formatCurrency(value.sellExclGst)} ex GST
                    </Badge>
                </div>
            )}
        </div>
    );
}

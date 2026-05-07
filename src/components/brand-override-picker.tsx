'use client';

/**
 * Brand Override Picker (v1.7 — story 1.8.1, Phase D).
 *
 * Compact dropdown above the editor that scopes the current edit
 * session to either the org-default block or a specific brand
 * override. The brand list is the union of `mainVendorId` from
 * every module the org has access to (per
 * `organisation.enabledModuleSubscriptions`).
 *
 * Q2 from the spec popup locked this source — modules are the
 * authoritative "what brands does this org sell" set, not quotes.
 */

import { useMemo } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Building2, Globe2 } from 'lucide-react';

interface ModuleDoc {
    id: string;
    name?: string;
    slug?: string;
    mainVendorId?: string | null;
}

export interface Brand {
    vendorId: string;
    /** Display name aggregated from module names that share this vendorId. */
    displayName: string;
}

interface Props {
    enabledModuleSubscriptions: string[] | null | undefined;
    /** null = org-default. Non-null = a specific vendorId override. */
    value: string | null;
    onChange: (vendorId: string | null) => void;
    disabled?: boolean;
}

export const ORG_DEFAULT_VALUE = '__default__';

export function BrandOverridePicker({ enabledModuleSubscriptions, value, onChange, disabled }: Props) {
    const firestore = useFirestore();

    /** Read every module doc the org has access to (cap at 30 per
     *  Firestore `in` limit — see CLAUDE.md "Firestore where(in)
     *  capped at 30" lesson). */
    const moduleIds = (enabledModuleSubscriptions ?? []).slice(0, 30);
    const modulesQuery = useMemoFirebase(
        () => (moduleIds.length > 0
            ? query(collection(firestore, 'modules'), where('__name__', 'in', moduleIds))
            : null),
        [firestore, moduleIds.join('|')],
    );
    const { data: modules } = useCollection<ModuleDoc>(modulesQuery);

    /** Distinct brands derived from the modules' mainVendorId. */
    const brands = useMemo<Brand[]>(() => {
        const byVendorId = new Map<string, string[]>();
        for (const m of modules ?? []) {
            if (!m.mainVendorId) continue;
            const list = byVendorId.get(m.mainVendorId) ?? [];
            list.push(m.name ?? m.slug ?? m.mainVendorId);
            byVendorId.set(m.mainVendorId, list);
        }
        return [...byVendorId.entries()]
            .map(([vendorId, names]) => ({ vendorId, displayName: names.join(' / ') }))
            .sort((a, b) => a.displayName.localeCompare(b.displayName));
    }, [modules]);

    return (
        <Select
            value={value ?? ORG_DEFAULT_VALUE}
            onValueChange={(v) => onChange(v === ORG_DEFAULT_VALUE ? null : v)}
            disabled={disabled}
        >
            <SelectTrigger className="h-9 text-xs">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={ORG_DEFAULT_VALUE} className="text-xs">
                    <span className="inline-flex items-center gap-2">
                        <Globe2 className="h-3.5 w-3.5 text-slate-500" />
                        Org default
                    </span>
                </SelectItem>
                {brands.map(b => (
                    <SelectItem key={b.vendorId} value={b.vendorId} className="text-xs">
                        <span className="inline-flex items-center gap-2">
                            <Building2 className="h-3.5 w-3.5 text-blue-500" />
                            {b.displayName}
                        </span>
                    </SelectItem>
                ))}
                {brands.length === 0 && (
                    <div className="px-2 py-1.5 text-[11px] text-slate-400">
                        No brand modules enabled — enable modules in the Modules tab to author brand overrides.
                    </div>
                )}
            </SelectContent>
        </Select>
    );
}

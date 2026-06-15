'use client';

/**
 * ModuleFitUpTab (v1.14 — Story 9.2.1).
 *
 * Per-vendor-module Fit-up tab. Lists the fit-up items in the org's catalog
 * that include this `moduleId` in their `moduleIds` allowlist + lets the
 * module owner edit inline (name / tier / category / cost / sell) + add new
 * items pre-assigned to this module.
 *
 * Edits write to the SAME `organisations/{orgId}/fitUpItems` docs that the
 * Manage → Fit-Up Catalog admin writes to — there's only one source of
 * truth. Last write wins. Audit field captures who via the existing
 * `logFitUpAuditEvent` helper.
 *
 * Designed to be mounted inside any vendor module workspace as a new tab
 * (Catalog · Pricing · Promotions · Settings · **Fit-up**). One line:
 *   {activeTab === 'fit-up' && <ModuleFitUpTab moduleId={moduleId} organisationId={orgId} />}
 */

import { useMemo } from 'react';
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    query,
    serverTimestamp,
    updateDoc,
    where,
} from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useUser } from '@/firebase/auth/use-user';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Wrench, Plus, Trash2, Loader2 } from 'lucide-react';
import { InlineEditCell } from '@/components/inline-edit-cell';
import { logFitUpAuditEvent, shallowDiff } from '@/lib/fit-up-catalog-audit';
import { cn } from '@/lib/utils';

type Tier = 'simple' | 'medium' | 'complex';

const TIER_TONE: Record<Tier, string> = {
    simple: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    medium: 'bg-amber-50 text-amber-700 border-amber-200',
    complex: 'bg-rose-50 text-rose-700 border-rose-200',
};

interface FitUpItem {
    id: string;
    name: string;
    tier: Tier;
    category?: string | null;
    cost: number;
    sellPrice?: number | null;
    notes?: string | null;
    moduleIds?: string[];
    brandIds?: string[];
    rangeIds?: string[];
    modelIds?: string[];
}

export function ModuleFitUpTab({
    organisationId,
    moduleId,
    moduleName,
}: {
    organisationId: string;
    moduleId: string;
    /** Display name shown in the header — e.g. "Yamaha Outboards" or "Highfield Boats". */
    moduleName?: string;
}) {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();

    /** Only items assigned to this module via the moduleIds allowlist. */
    const itemsQuery = useMemoFirebase(
        () => query(
            collection(firestore, 'organisations', organisationId, 'fitUpItems'),
            where('moduleIds', 'array-contains', moduleId),
        ),
        [firestore, organisationId, moduleId],
    );
    const { data: items, isLoading } = useCollection<FitUpItem>(itemsQuery);

    const sorted = useMemo(() => {
        return [...(items ?? [])].sort((a, b) => {
            const ta = a.tier === 'simple' ? 0 : a.tier === 'medium' ? 1 : 2;
            const tb = b.tier === 'simple' ? 0 : b.tier === 'medium' ? 1 : 2;
            if (ta !== tb) return ta - tb;
            return (a.name ?? '').localeCompare(b.name ?? '');
        });
    }, [items]);

    const tierCounts = useMemo(() => {
        const c = { simple: 0, medium: 0, complex: 0 };
        for (const i of items ?? []) c[i.tier] = (c[i.tier] ?? 0) + 1;
        return c;
    }, [items]);

    const actor = {
        actorUid: user?.uid || 'unknown',
        actorName: user?.displayName || user?.email || 'Someone',
    };

    const patch = async (item: FitUpItem, field: keyof FitUpItem, next: any) => {
        const before = item;
        try {
            await updateDoc(doc(firestore, 'organisations', organisationId, 'fitUpItems', item.id), {
                [field]: next,
                updatedAt: serverTimestamp(),
            });
            void logFitUpAuditEvent(firestore, organisationId, {
                ...actor,
                resource: 'fitUpItem',
                resourceId: item.id,
                resourceName: item.name,
                action: 'updated',
                diff: shallowDiff(before, { ...item, [field]: next }, [field as string]),
            });
            toast({ title: 'Saved' });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: err?.message ?? String(err) });
        }
    };

    const addOne = async () => {
        try {
            const ref = await addDoc(collection(firestore, 'organisations', organisationId, 'fitUpItems'), {
                name: 'New fit-up item',
                tier: 'simple',
                category: null,
                cost: 0,
                sellPrice: 0,
                notes: null,
                moduleIds: [moduleId],
                brandIds: [],
                rangeIds: [],
                modelIds: [],
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            void logFitUpAuditEvent(firestore, organisationId, {
                ...actor,
                resource: 'fitUpItem',
                resourceId: ref.id,
                resourceName: 'New fit-up item',
                action: 'created',
            });
            toast({ title: 'Added' });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Add failed', description: err?.message ?? String(err) });
        }
    };

    const removeOne = async (item: FitUpItem) => {
        try {
            await deleteDoc(doc(firestore, 'organisations', organisationId, 'fitUpItems', item.id));
            void logFitUpAuditEvent(firestore, organisationId, {
                ...actor,
                resource: 'fitUpItem',
                resourceId: item.id,
                resourceName: item.name,
                action: 'deleted',
            });
            toast({ title: 'Removed', description: item.name });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Remove failed', description: err?.message ?? String(err) });
        }
    };

    const cycleTier = (item: FitUpItem) => {
        const next: Tier = item.tier === 'simple' ? 'medium' : item.tier === 'medium' ? 'complex' : 'simple';
        return patch(item, 'tier', next);
    };

    return (
        <Card className="rounded-2xl border-2">
            <CardHeader>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-base font-bold">
                            <Wrench className="h-4 w-4 text-teal-600" />
                            Fit-up — {moduleName ?? 'this module'}
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Items in the org's fit-up catalog scoped to this module. Same docs as Manage → Fit-Up Catalog — last write wins.
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`${TIER_TONE.simple} text-[9px] font-black uppercase`}>simple · {tierCounts.simple}</Badge>
                        <Badge variant="outline" className={`${TIER_TONE.medium} text-[9px] font-black uppercase`}>medium · {tierCounts.medium}</Badge>
                        <Badge variant="outline" className={`${TIER_TONE.complex} text-[9px] font-black uppercase`}>complex · {tierCounts.complex}</Badge>
                        <Button size="sm" onClick={addOne} className="rounded-xl text-xs h-9">
                            <Plus className="h-3.5 w-3.5 mr-1" /> Add item
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex items-center justify-center py-10 text-muted-foreground text-xs">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading fit-up items…
                    </div>
                ) : sorted.length === 0 ? (
                    <div className="text-center py-10 border-2 border-dashed rounded-xl text-muted-foreground">
                        <Wrench className="h-8 w-8 mx-auto opacity-30 mb-2" />
                        <p className="text-xs font-semibold">No fit-up items assigned to this module yet.</p>
                        <p className="text-[10px] mt-1">Click <strong>Add item</strong> to create one — it'll be auto-assigned to this module.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-xl border-2">
                        <table className="w-full text-xs">
                            <thead className="bg-slate-50 border-b-2">
                                <tr>
                                    <th className="px-3 py-2 text-left font-black uppercase tracking-widest text-[10px]">Tier</th>
                                    <th className="px-3 py-2 text-left font-black uppercase tracking-widest text-[10px]">Name</th>
                                    <th className="px-3 py-2 text-left font-black uppercase tracking-widest text-[10px]">Category</th>
                                    <th className="px-3 py-2 text-right font-black uppercase tracking-widest text-[10px]">Cost</th>
                                    <th className="px-3 py-2 text-right font-black uppercase tracking-widest text-[10px]">Sell (ex GST)</th>
                                    <th className="px-3 py-2 w-8"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {sorted.map(item => (
                                    <tr key={item.id} className="border-b last:border-b-0 hover:bg-slate-50">
                                        <td className="px-3 py-2">
                                            <button
                                                type="button"
                                                onClick={() => cycleTier(item)}
                                                className={cn(
                                                    'rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border-2',
                                                    TIER_TONE[item.tier],
                                                )}
                                                title="Click to cycle tier (simple → medium → complex)"
                                            >
                                                {item.tier}
                                            </button>
                                        </td>
                                        <td className="px-3 py-2 font-semibold">
                                            <InlineEditCell type="text" value={item.name} onSave={(v) => patch(item, 'name', v ?? '')} />
                                        </td>
                                        <td className="px-3 py-2">
                                            <InlineEditCell type="text" value={item.category ?? ''} placeholder="(none)" onSave={(v) => patch(item, 'category', v)} />
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            <InlineEditCell
                                                type="currency"
                                                value={item.cost}
                                                validate={(n) => (n != null && (typeof n !== 'number' || n < 0) ? 'Positive number' : null)}
                                                onSave={(v) => patch(item, 'cost', v ?? 0)}
                                            />
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums font-bold">
                                            <InlineEditCell
                                                type="currency"
                                                value={item.sellPrice}
                                                validate={(n) => (n != null && (typeof n !== 'number' || n < 0) ? 'Positive number' : null)}
                                                onSave={(v) => patch(item, 'sellPrice', v)}
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeOne(item)}>
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

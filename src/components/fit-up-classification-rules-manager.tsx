'use client';

/**
 * FitUpClassificationRulesManager (v1.15 — Story 9.3.1).
 *
 * Admin surface for operators to author the rule engine that suggests
 * fit-up tier from a quote context. Each rule has a name, priority, an
 * AND-combined list of conditions, and an output tier.
 *
 * Mounts under Manage → Fit-Up Catalog as a new "Rules" sub-tab (parallel
 * to the existing Items + Packages sub-tabs). Same fitUpCatalogAudit
 * pattern as v1.11.
 */

import { useState } from 'react';
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    serverTimestamp,
    updateDoc,
} from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useUser } from '@/firebase/auth/use-user';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Filter, Plus, Trash2, Save, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    type ClassificationRule,
    type Condition,
    type ClassificationField,
    type ConditionOperator,
    type Tier,
    CONDITION_FIELD_LABEL,
    TIER_LABEL,
} from '@/lib/fit-up-classification';

const FIELDS: ClassificationField[] = ['motorHp', 'boatLengthM', 'boatRange', 'modelCode', 'vendorId'];
const NUMBER_OPS: ConditionOperator[] = ['>=', '>', '<=', '<', '==', '!='];
const STRING_OPS: ConditionOperator[] = ['==', '!=', 'contains', 'startsWith'];
const NUMERIC_FIELDS: Set<ClassificationField> = new Set(['motorHp', 'boatLengthM']);
const TIERS: Tier[] = ['simple', 'medium', 'complex'];
const TIER_TONE: Record<Tier, string> = {
    simple: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    medium: 'bg-amber-50 text-amber-700 border-amber-200',
    complex: 'bg-rose-50 text-rose-700 border-rose-200',
};

export function FitUpClassificationRulesManager({ organisationId }: { organisationId: string }) {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();

    const rulesQuery = useMemoFirebase(
        () => collection(firestore, 'organisations', organisationId, 'fitUpClassificationRules'),
        [firestore, organisationId],
    );
    const { data: rules, isLoading } = useCollection<ClassificationRule>(rulesQuery);

    const [drafts, setDrafts] = useState<Record<string, ClassificationRule>>({});

    const onChange = (id: string, patch: Partial<ClassificationRule>) => {
        setDrafts(d => ({ ...d, [id]: { ...(d[id] ?? (rules ?? []).find(r => r.id === id))!, ...patch } as ClassificationRule }));
    };

    const effective = (r: ClassificationRule) => drafts[r.id] ?? r;
    const isDirty = (r: ClassificationRule) => !!drafts[r.id];

    const addRule = async () => {
        try {
            const newRule: Omit<ClassificationRule, 'id'> = {
                name: 'New rule',
                priority: 0,
                isActive: true,
                conditions: [{ field: 'motorHp', operator: '>=', value: 150 }],
                outputTier: 'complex',
            };
            await addDoc(collection(firestore, 'organisations', organisationId, 'fitUpClassificationRules'), {
                ...newRule,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                createdByName: user?.displayName ?? user?.email ?? 'Someone',
            });
            toast({ title: 'Rule added' });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Add failed', description: err?.message ?? String(err) });
        }
    };

    const save = async (r: ClassificationRule) => {
        const next = effective(r);
        try {
            await updateDoc(doc(firestore, 'organisations', organisationId, 'fitUpClassificationRules', r.id), {
                name: next.name,
                priority: next.priority ?? 0,
                isActive: next.isActive !== false,
                conditions: next.conditions ?? [],
                outputTier: next.outputTier,
                updatedAt: serverTimestamp(),
                updatedByName: user?.displayName ?? user?.email ?? 'Someone',
            });
            setDrafts(d => { const { [r.id]: _, ...rest } = d; return rest; });
            toast({ title: 'Saved' });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: err?.message ?? String(err) });
        }
    };

    const remove = async (r: ClassificationRule) => {
        try {
            await deleteDoc(doc(firestore, 'organisations', organisationId, 'fitUpClassificationRules', r.id));
            toast({ title: 'Rule removed', description: r.name });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Remove failed', description: err?.message ?? String(err) });
        }
    };

    const updateCondition = (rule: ClassificationRule, idx: number, patch: Partial<Condition>) => {
        const cur = effective(rule);
        const conditions = (cur.conditions ?? []).map((c, i) => i === idx ? { ...c, ...patch } : c);
        onChange(rule.id, { conditions });
    };

    const addCondition = (rule: ClassificationRule) => {
        const cur = effective(rule);
        onChange(rule.id, { conditions: [...(cur.conditions ?? []), { field: 'motorHp', operator: '>=', value: 0 }] });
    };

    const removeCondition = (rule: ClassificationRule, idx: number) => {
        const cur = effective(rule);
        onChange(rule.id, { conditions: (cur.conditions ?? []).filter((_, i) => i !== idx) });
    };

    return (
        <Card className="rounded-2xl border-2">
            <CardHeader>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-base font-bold">
                            <Filter className="h-4 w-4 text-violet-600" />
                            Fit-up classification rules
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Operator-authored rules that auto-suggest a fit-up tier from the quote context.
                            Highest priority + most-specific wins. No matching rule = the v1.11 motor-HP heuristic.
                        </CardDescription>
                    </div>
                    <Button size="sm" onClick={addRule} className="rounded-xl">
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add rule
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {isLoading ? (
                    <div className="flex items-center justify-center py-10 text-muted-foreground text-xs">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading rules…
                    </div>
                ) : (rules ?? []).length === 0 ? (
                    <div className="text-center py-10 border-2 border-dashed rounded-xl text-muted-foreground">
                        <Filter className="h-8 w-8 mx-auto opacity-30 mb-2" />
                        <p className="text-xs font-semibold">No classification rules yet.</p>
                        <p className="text-[10px] mt-1">Quotes will use the v1.11 motor-HP heuristic. Click <strong>Add rule</strong> to author the first one.</p>
                    </div>
                ) : (
                    (rules ?? [])
                        .slice()
                        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
                        .map(r => {
                            const e = effective(r);
                            const dirty = isDirty(r);
                            return (
                                <div key={r.id} className={cn('rounded-xl border-2 p-3 bg-white space-y-3', !e.isActive && 'opacity-60', dirty && 'ring-2 ring-amber-300')}>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <Input
                                            value={e.name ?? ''}
                                            onChange={ev => onChange(r.id, { name: ev.target.value })}
                                            placeholder="Rule name"
                                            className="rounded-lg border-2 h-8 text-xs font-bold max-w-xs"
                                        />
                                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Priority</span>
                                        <Input
                                            type="number"
                                            value={e.priority ?? 0}
                                            onChange={ev => onChange(r.id, { priority: Number(ev.target.value) })}
                                            className="rounded-lg border-2 h-8 text-xs w-16 tabular-nums"
                                        />
                                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Output</span>
                                        <Select value={e.outputTier} onValueChange={(v) => onChange(r.id, { outputTier: v as Tier })}>
                                            <SelectTrigger className="rounded-lg border-2 h-8 text-xs w-28">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {TIERS.map(t => <SelectItem key={t} value={t}><Badge variant="outline" className={cn('text-[9px] font-black uppercase', TIER_TONE[t])}>{TIER_LABEL[t]}</Badge></SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                        <Button
                                            size="sm"
                                            variant={e.isActive !== false ? 'default' : 'outline'}
                                            onClick={() => onChange(r.id, { isActive: e.isActive === false })}
                                            className="rounded-lg text-[10px] h-8"
                                        >
                                            {e.isActive !== false ? 'Active' : 'Inactive'}
                                        </Button>
                                        <div className="ml-auto flex items-center gap-2">
                                            {dirty && (
                                                <Button size="sm" onClick={() => save(r)} className="rounded-lg text-[10px] h-8">
                                                    <Save className="h-3 w-3 mr-1" /> Save
                                                </Button>
                                            )}
                                            <Button size="icon" variant="ghost" onClick={() => remove(r)} className="h-8 w-8 text-destructive">
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="space-y-1.5 pl-2 border-l-2 border-violet-200">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-violet-700">
                                            Conditions (all must match)
                                        </p>
                                        {(e.conditions ?? []).map((c, idx) => {
                                            const opOptions = NUMERIC_FIELDS.has(c.field) ? NUMBER_OPS : STRING_OPS;
                                            return (
                                                <div key={idx} className="flex items-center gap-1.5 flex-wrap">
                                                    <Select value={c.field} onValueChange={(v) => updateCondition(r, idx, { field: v as ClassificationField })}>
                                                        <SelectTrigger className="rounded-lg border h-7 text-[11px] w-36">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {FIELDS.map(f => <SelectItem key={f} value={f} className="text-[11px]">{CONDITION_FIELD_LABEL[f]}</SelectItem>)}
                                                        </SelectContent>
                                                    </Select>
                                                    <Select value={c.operator} onValueChange={(v) => updateCondition(r, idx, { operator: v as ConditionOperator })}>
                                                        <SelectTrigger className="rounded-lg border h-7 text-[11px] w-20">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {opOptions.map(op => <SelectItem key={op} value={op} className="text-[11px]">{op}</SelectItem>)}
                                                        </SelectContent>
                                                    </Select>
                                                    <Input
                                                        type={NUMERIC_FIELDS.has(c.field) ? 'number' : 'text'}
                                                        value={c.value as any}
                                                        onChange={ev => updateCondition(r, idx, { value: NUMERIC_FIELDS.has(c.field) ? Number(ev.target.value) : ev.target.value })}
                                                        className="rounded-lg border h-7 text-[11px] w-32 tabular-nums"
                                                    />
                                                    <Button size="icon" variant="ghost" onClick={() => removeCondition(r, idx)} className="h-7 w-7 text-destructive">
                                                        <Trash2 className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            );
                                        })}
                                        <Button size="sm" variant="outline" onClick={() => addCondition(r)} className="rounded-lg text-[10px] h-7">
                                            <Plus className="h-3 w-3 mr-1" /> Condition
                                        </Button>
                                    </div>
                                </div>
                            );
                        })
                )}
            </CardContent>
        </Card>
    );
}

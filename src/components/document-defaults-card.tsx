'use client';

/**
 * DocumentDefaultsCard (v1.11 follow-up).
 *
 * Single org-level config card covering three Submitted-board defaults
 * we now have surfaces for:
 *   - Default deposit (% of contract value, or fixed $ — operator picks)
 *   - Default payment schedule (deposit % + N milestones + final %)
 *   - Quote validity period (days the customer has to accept)
 *
 * Persists under `organisation.documentDefaults`. Lives inside Manage →
 * Document Templates so it sits next to the content blocks the same
 * surface manages.
 *
 * The rest of the app consumes these via a thin selector
 * (resolveDocumentDefaults) so legacy quotes that predate this card
 * still fall back to the previous hard-coded values.
 */

import { useEffect, useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Save, Trash2, FileText, Percent, CalendarDays, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export interface PaymentMilestone {
    label: string;
    percentage: number;
    /** Optional trigger text — when the milestone is invoiceable. */
    triggerNote?: string;
}

export interface DocumentDefaults {
    /** Deposit mode: percentage of contract value, or fixed dollar amount. */
    depositMode?: 'percent' | 'fixed';
    /** When depositMode === 'percent', the % value (e.g. 10 for 10%). */
    depositPercent?: number;
    /** When depositMode === 'fixed', the AUD amount. */
    depositFixedAud?: number;
    /** Quote validity in days from issue date. */
    quoteValidityDays?: number;
    /** Payment milestones (excluding deposit + final). Sum + deposit + final
     *  should equal 100% — surface a warning if it doesn't, but never block. */
    paymentMilestones?: PaymentMilestone[];
    /** Final payment % (the balance due at delivery). */
    finalPercent?: number;
}

interface Props {
    organisationId: string;
    organisation: any; // org doc — read defaults out of organisation.documentDefaults
}

const DEFAULT_VALUES: DocumentDefaults = {
    depositMode: 'percent',
    depositPercent: 10,
    depositFixedAud: 0,
    quoteValidityDays: 30,
    paymentMilestones: [
        { label: 'Stock allocation', percentage: 40, triggerNote: 'On factory build slot confirmation' },
    ],
    finalPercent: 50,
};

export function DocumentDefaultsCard({ organisationId, organisation }: Props) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const stored: DocumentDefaults = organisation?.documentDefaults ?? {};

    const [depositMode, setDepositMode] = useState<'percent' | 'fixed'>(stored.depositMode ?? DEFAULT_VALUES.depositMode!);
    const [depositPercent, setDepositPercent] = useState<string>(String(stored.depositPercent ?? DEFAULT_VALUES.depositPercent));
    const [depositFixed, setDepositFixed] = useState<string>(String(stored.depositFixedAud ?? DEFAULT_VALUES.depositFixedAud));
    const [validityDays, setValidityDays] = useState<string>(String(stored.quoteValidityDays ?? DEFAULT_VALUES.quoteValidityDays));
    const [milestones, setMilestones] = useState<PaymentMilestone[]>(stored.paymentMilestones ?? DEFAULT_VALUES.paymentMilestones!);
    const [finalPercent, setFinalPercent] = useState<string>(String(stored.finalPercent ?? DEFAULT_VALUES.finalPercent));
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const s = organisation?.documentDefaults ?? {};
        setDepositMode(s.depositMode ?? DEFAULT_VALUES.depositMode!);
        setDepositPercent(String(s.depositPercent ?? DEFAULT_VALUES.depositPercent));
        setDepositFixed(String(s.depositFixedAud ?? DEFAULT_VALUES.depositFixedAud));
        setValidityDays(String(s.quoteValidityDays ?? DEFAULT_VALUES.quoteValidityDays));
        setMilestones(s.paymentMilestones ?? DEFAULT_VALUES.paymentMilestones!);
        setFinalPercent(String(s.finalPercent ?? DEFAULT_VALUES.finalPercent));
    }, [organisation?.documentDefaults]);

    const milestoneSum = milestones.reduce((s, m) => s + (Number.isFinite(m.percentage) ? m.percentage : 0), 0);
    const depositPct = depositMode === 'percent' ? parseFloat(depositPercent) || 0 : 0;
    const finalPct = parseFloat(finalPercent) || 0;
    const total = depositMode === 'percent' ? depositPct + milestoneSum + finalPct : milestoneSum + finalPct;
    const balanced = Math.abs(total - 100) < 0.01;

    const addMilestone = () => setMilestones(m => [...m, { label: 'New milestone', percentage: 0 }]);
    const removeMilestone = (i: number) => setMilestones(m => m.filter((_, idx) => idx !== i));
    const updateMilestone = (i: number, patch: Partial<PaymentMilestone>) => {
        setMilestones(m => m.map((row, idx) => idx === i ? { ...row, ...patch } : row));
    };

    const handleSave = async () => {
        const payload: DocumentDefaults = {
            depositMode,
            depositPercent: parseFloat(depositPercent) || 0,
            depositFixedAud: parseFloat(depositFixed) || 0,
            quoteValidityDays: Math.max(1, parseInt(validityDays, 10) || 30),
            paymentMilestones: milestones.map(m => ({
                label: m.label.trim() || 'Milestone',
                percentage: Math.max(0, Math.min(100, Number(m.percentage) || 0)),
                triggerNote: m.triggerNote?.trim() || undefined,
            })),
            finalPercent: parseFloat(finalPercent) || 0,
        };
        setSaving(true);
        try {
            await updateDoc(doc(firestore, 'organisations', organisationId), {
                documentDefaults: payload,
                updatedAt: serverTimestamp(),
            });
            toast({ title: 'Document defaults saved' });
        } catch (err: any) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Save failed', description: err?.message ?? String(err) });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card className="rounded-2xl border-2">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-bold">
                    <FileText className="h-4 w-4" /> Document Defaults
                </CardTitle>
                <CardDescription className="text-xs">
                    Defaults applied to new quotes and contracts. Salespeople can override per-quote where the surface allows.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Deposit */}
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Default deposit</label>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" variant={depositMode === 'percent' ? 'default' : 'outline'} onClick={() => setDepositMode('percent')} className="h-8 rounded-lg text-xs">% of contract</Button>
                        <Button size="sm" variant={depositMode === 'fixed' ? 'default' : 'outline'} onClick={() => setDepositMode('fixed')} className="h-8 rounded-lg text-xs">Fixed $</Button>
                        {depositMode === 'percent' ? (
                            <div className="relative">
                                <Percent className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <Input type="number" min="0" max="100" step="0.5" value={depositPercent} onChange={e => setDepositPercent(e.target.value)} className="h-8 pl-6 w-24 rounded-lg text-xs tabular-nums" />
                            </div>
                        ) : (
                            <div className="relative">
                                <span className="text-xs absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                <Input type="number" min="0" step="100" value={depositFixed} onChange={e => setDepositFixed(e.target.value)} className="h-8 pl-6 w-32 rounded-lg text-xs tabular-nums" />
                            </div>
                        )}
                        <span className="text-[10px] text-muted-foreground">{depositMode === 'percent' ? '% of contract value' : 'AUD per quote'}</span>
                    </div>
                </div>

                {/* Quote validity */}
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Quote validity</label>
                    <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        <Input type="number" min="1" step="1" value={validityDays} onChange={e => setValidityDays(e.target.value)} className="h-8 w-24 rounded-lg text-xs tabular-nums" />
                        <span className="text-xs text-muted-foreground">days from issue date</span>
                    </div>
                </div>

                {/* Payment schedule */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Payment schedule template</label>
                        <Badge variant={balanced ? 'secondary' : 'destructive'} className="text-[9px] font-black uppercase">
                            {balanced ? '100% balanced' : `${total.toFixed(1)}% — adjust to 100%`}
                        </Badge>
                    </div>
                    {depositMode === 'percent' && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
                            <CalendarDays className="h-3.5 w-3.5 text-primary" />
                            <span className="text-xs font-bold">Deposit</span>
                            <span className="text-xs tabular-nums ml-auto">{depositPercent}%</span>
                            <span className="text-[10px] text-muted-foreground italic">Set above</span>
                        </div>
                    )}
                    {milestones.map((m, i) => (
                        <div key={i} className="grid grid-cols-12 gap-2 items-center">
                            <Input value={m.label} onChange={e => updateMilestone(i, { label: e.target.value })} placeholder="Milestone label" className="col-span-4 h-8 rounded-lg text-xs" />
                            <div className="col-span-2 relative">
                                <Percent className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <Input type="number" min="0" max="100" step="0.5" value={m.percentage} onChange={e => updateMilestone(i, { percentage: parseFloat(e.target.value) || 0 })} className="h-8 pl-6 rounded-lg text-xs tabular-nums" />
                            </div>
                            <Input value={m.triggerNote ?? ''} onChange={e => updateMilestone(i, { triggerNote: e.target.value })} placeholder="Trigger note (optional)" className="col-span-5 h-8 rounded-lg text-xs" />
                            <Button variant="ghost" size="icon" onClick={() => removeMilestone(i)} className="col-span-1 h-8 w-8 text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={addMilestone} className="rounded-lg text-xs h-8">
                        <Plus className="h-3 w-3 mr-1" /> Add milestone
                    </Button>
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border">
                        <CalendarDays className="h-3.5 w-3.5 text-slate-700" />
                        <span className="text-xs font-bold">Final balance</span>
                        <div className="ml-auto relative">
                            <Percent className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input type="number" min="0" max="100" step="0.5" value={finalPercent} onChange={e => setFinalPercent(e.target.value)} className="h-8 pl-6 w-24 rounded-lg text-xs tabular-nums" />
                        </div>
                        <span className="text-[10px] text-muted-foreground italic">Due at delivery</span>
                    </div>
                </div>
            </CardContent>
            <CardFooter className="flex justify-end">
                <Button onClick={handleSave} disabled={saving} className="rounded-xl">
                    {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : <><Save className="h-4 w-4 mr-2" /> Save defaults</>}
                </Button>
            </CardFooter>
        </Card>
    );
}

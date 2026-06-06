'use client';

/**
 * CustomerDefaultsCard (v1.11 follow-up).
 *
 * Org-level config for the customer-management surfaces:
 *   - Source dropdown ("how did you hear about us?") — boat show / referral / web / walk-in / repeat / other
 *   - Pipeline stages (the Kanban columns a customer moves through:
 *     lead → contacted → qualified → quoted → contracted → won → delivered)
 *
 * Persists under `organisation.customerDefaults`. The customer creation
 * dialog reads sources from here; the pipeline kanban reads stages.
 * Empty / missing field on the org doc → fall back to the defaults below.
 */

import { useState, useEffect } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Save, Trash2, Users, Workflow } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export interface CustomerDefaults {
    sources?: string[];
    pipelineStages?: string[];
    /** Default valuation rule for trade-ins. */
    tradeInRule?: 'external-appraisal' | 'internal-formula' | 'pending';
}

export const DEFAULT_CUSTOMER_SOURCES = [
    'Boat show', 'Referral', 'Website', 'Walk-in', 'Repeat customer', 'Social media', 'Other',
];

export const DEFAULT_PIPELINE_STAGES = [
    'Lead', 'Contacted', 'Qualified', 'Quoted', 'Contracted', 'Won', 'Delivered',
];

interface Props {
    organisationId: string;
    organisation: any;
}

export function CustomerDefaultsCard({ organisationId, organisation }: Props) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const stored: CustomerDefaults = organisation?.customerDefaults ?? {};

    const [sources, setSources] = useState<string[]>(stored.sources?.length ? stored.sources : DEFAULT_CUSTOMER_SOURCES);
    const [stages, setStages] = useState<string[]>(stored.pipelineStages?.length ? stored.pipelineStages : DEFAULT_PIPELINE_STAGES);
    const [tradeInRule, setTradeInRule] = useState<'external-appraisal' | 'internal-formula' | 'pending'>(stored.tradeInRule ?? 'external-appraisal');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const s = organisation?.customerDefaults ?? {};
        setSources(s.sources?.length ? s.sources : DEFAULT_CUSTOMER_SOURCES);
        setStages(s.pipelineStages?.length ? s.pipelineStages : DEFAULT_PIPELINE_STAGES);
        setTradeInRule(s.tradeInRule ?? 'external-appraisal');
    }, [organisation?.customerDefaults]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await updateDoc(doc(firestore, 'organisations', organisationId), {
                customerDefaults: {
                    sources: sources.map(s => s.trim()).filter(Boolean),
                    pipelineStages: stages.map(s => s.trim()).filter(Boolean),
                    tradeInRule,
                },
                updatedAt: serverTimestamp(),
            });
            toast({ title: 'Customer defaults saved' });
        } catch (err: any) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Save failed', description: err?.message ?? String(err) });
        } finally {
            setSaving(false);
        }
    };

    const updateAt = (list: string[], setList: (l: string[]) => void) => (i: number, v: string) =>
        setList(list.map((x, idx) => idx === i ? v : x));
    const removeAt = (list: string[], setList: (l: string[]) => void) => (i: number) =>
        setList(list.filter((_, idx) => idx !== i));
    const addTo = (list: string[], setList: (l: string[]) => void, placeholder: string) => () =>
        setList([...list, placeholder]);

    return (
        <Card className="rounded-2xl border-2">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-bold">
                    <Users className="h-4 w-4" /> Customer Defaults
                </CardTitle>
                <CardDescription className="text-xs">
                    Drive the customer-create dialog (source dropdown), the Pipeline View Kanban (stages), and trade-in handling.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Customer source options</label>
                        <Badge variant="outline" className="text-[9px]">{sources.length} options</Badge>
                    </div>
                    <div className="space-y-1.5">
                        {sources.map((s, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <Input value={s} onChange={e => updateAt(sources, setSources)(i, e.target.value)} placeholder="Source label" className="h-8 rounded-lg text-xs" />
                                <Button variant="ghost" size="icon" onClick={() => removeAt(sources, setSources)(i)} className="h-8 w-8 text-destructive">
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        ))}
                        <Button variant="outline" size="sm" onClick={addTo(sources, setSources, 'New source')} className="rounded-lg text-xs h-8">
                            <Plus className="h-3 w-3 mr-1" /> Add source
                        </Button>
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Pipeline stages</label>
                        <Badge variant="outline" className="text-[9px]">{stages.length} stages</Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Stages appear as Kanban columns on the customer pipeline view. Lead → won/delivered, left-to-right.</p>
                    <div className="space-y-1.5">
                        {stages.map((s, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <span className="w-6 text-[10px] font-black text-muted-foreground text-center">{i + 1}</span>
                                <Workflow className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <Input value={s} onChange={e => updateAt(stages, setStages)(i, e.target.value)} placeholder="Stage label" className="h-8 rounded-lg text-xs" />
                                <Button variant="ghost" size="icon" onClick={() => removeAt(stages, setStages)(i)} className="h-8 w-8 text-destructive">
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        ))}
                        <Button variant="outline" size="sm" onClick={addTo(stages, setStages, 'New stage')} className="rounded-lg text-xs h-8">
                            <Plus className="h-3 w-3 mr-1" /> Add stage
                        </Button>
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Trade-in valuation</label>
                    <div className="flex flex-wrap gap-2">
                        {[
                            { id: 'external-appraisal', label: 'External appraisal' },
                            { id: 'internal-formula', label: 'Internal formula' },
                            { id: 'pending', label: 'Pending decision' },
                        ].map(opt => (
                            <Button
                                key={opt.id}
                                size="sm"
                                variant={tradeInRule === opt.id ? 'default' : 'outline'}
                                onClick={() => setTradeInRule(opt.id as any)}
                                className="h-8 rounded-lg text-xs"
                            >
                                {opt.label}
                            </Button>
                        ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground">Surfaces the rule choice when a trade-in is recorded against a contract.</p>
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

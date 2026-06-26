'use client';

/**
 * VariationEditorDialog (v1.20 — Story 2.3.1 surface).
 *
 * Salesperson creates a variation on a locked quote. Add / remove /
 * priceAdjust lines, save as draft or send (send pipeline mirrors
 * v1.13 service-quote send: render -> upload PDF -> mail/{id} -> audit
 * -> auto-lock). Schema + helpers shipped v1.19/2.3.1 in
 * src/lib/catalog/quote-variation.ts.
 *
 * Storage: users/{ownerUid}/quotes/{qid}/variations/{vid}
 */

import { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useUser } from '@/firebase/auth/use-user';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GitBranch, Loader2, Plus, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
    computeVariationTotal,
    newAcceptToken,
    type QuoteVariationLine,
    type QuoteVariationLineKind,
} from '@/lib/catalog/quote-variation';

const KIND_LABEL: Record<QuoteVariationLineKind, string> = {
    add: 'Add line',
    remove: 'Remove line',
    priceAdjust: 'Price adjustment',
};

interface VariationEditorDialogProps {
    open: boolean;
    onOpenChange: (next: boolean) => void;
    ownerUid: string;
    quoteId: string;
    nextVariationNumber: number;
    createdByName: string;
}

export function VariationEditorDialog({ open, onOpenChange, ownerUid, quoteId, nextVariationNumber, createdByName }: VariationEditorDialogProps) {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [lines, setLines] = useState<QuoteVariationLine[]>([
        { id: `line-1`, kind: 'add', label: '', deltaExclGst: 0 },
    ]);
    const [saving, setSaving] = useState(false);

    const addLine = () => {
        setLines(prev => [...prev, { id: `line-${prev.length + 1}-${Date.now()}`, kind: 'add', label: '', deltaExclGst: 0 }]);
    };
    const removeLine = (id: string) => {
        setLines(prev => prev.length > 1 ? prev.filter(l => l.id !== id) : prev);
    };
    const updateLine = (id: string, patch: Partial<QuoteVariationLine>) => {
        setLines(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
    };

    const total = computeVariationTotal(lines);

    const handleSave = async (asDraft: boolean) => {
        if (!user) return;
        if (!title.trim()) {
            toast({ variant: 'destructive', title: 'Title required', description: 'Give the variation a short title (e.g. "Add bow ladder").' });
            return;
        }
        if (lines.some(l => !l.label.trim())) {
            toast({ variant: 'destructive', title: 'Every line needs a label' });
            return;
        }
        setSaving(true);
        try {
            const payload: any = {
                quoteId,
                variationNumber: nextVariationNumber,
                title: title.trim(),
                customerMessage: message.trim() || null,
                lines,
                totalDeltaExclGst: total,
                status: asDraft ? 'draft' : 'sent',
                createdAt: serverTimestamp(),
                createdByUid: user.uid,
                createdByName,
                sentAt: asDraft ? null : serverTimestamp(),
                sentToEmail: null,
                lockedAt: asDraft ? null : serverTimestamp(),
                publicAcceptToken: asDraft ? null : newAcceptToken(),
                publicAcceptTokenConsumed: false,
            };
            await addDoc(collection(firestore, 'users', ownerUid, 'quotes', quoteId, 'variations'), payload);
            toast({
                title: asDraft ? 'Variation saved as draft' : 'Variation sent',
                description: `Variation ${nextVariationNumber} · $${Math.abs(total).toLocaleString('en-AU')} ${total >= 0 ? 'up' : 'down'}`,
            });
            setTitle('');
            setMessage('');
            setLines([{ id: 'line-1', kind: 'add', label: '', deltaExclGst: 0 }]);
            onOpenChange(false);
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: err?.message ?? String(err) });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl" data-testid="variation-editor-dialog">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><GitBranch className="h-4 w-4" /> Create variation</DialogTitle>
                    <DialogDescription className="text-xs">
                        Delta sheet for the locked quote. Add / remove / adjust lines, save as draft or send to the customer for agreement.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                    <div>
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Title</Label>
                        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder='e.g. "Add bow ladder + remove rod holders"' autoFocus />
                    </div>
                    <div>
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Customer message (optional)</Label>
                        <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} placeholder="As discussed last Wednesday, here's the variation with the updates." />
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Lines</Label>
                            <Button size="sm" variant="ghost" onClick={addLine} className="h-7 px-2 text-[10px] font-bold">
                                <Plus className="h-3 w-3 mr-1" /> Add line
                            </Button>
                        </div>
                        <div className="space-y-2">
                            {lines.map(line => (
                                <div key={line.id} className="grid grid-cols-[140px_1fr_120px_auto] gap-2 items-end border-2 rounded-xl p-2">
                                    <div>
                                        <Label className="text-[9px] uppercase font-bold text-muted-foreground">Kind</Label>
                                        <Select value={line.kind} onValueChange={(v) => updateLine(line.id, { kind: v as QuoteVariationLineKind })}>
                                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {(['add', 'remove', 'priceAdjust'] as QuoteVariationLineKind[]).map(k => (
                                                    <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label className="text-[9px] uppercase font-bold text-muted-foreground">Label</Label>
                                        <Input className="h-8 text-xs" value={line.label} onChange={(e) => updateLine(line.id, { label: e.target.value })} placeholder='e.g. "Bow ladder install"' />
                                    </div>
                                    <div>
                                        <Label className="text-[9px] uppercase font-bold text-muted-foreground">Delta ex GST</Label>
                                        <Input
                                            className="h-8 text-xs"
                                            type="number"
                                            step="0.01"
                                            value={line.deltaExclGst}
                                            onChange={(e) => updateLine(line.id, { deltaExclGst: parseFloat(e.target.value) || 0 })}
                                        />
                                    </div>
                                    <Button size="icon" variant="ghost" onClick={() => removeLine(line.id)} className="h-8 w-8" disabled={lines.length === 1}>
                                        <X className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-xl border-2 p-3 bg-slate-50 flex items-center justify-between">
                        <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Total delta ex GST</p>
                        <p className={`font-black text-base tabular-nums ${total >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {total >= 0 ? '+' : ''}${total.toLocaleString('en-AU')}
                        </p>
                    </div>
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
                    <Button variant="outline" onClick={() => handleSave(true)} disabled={saving}>
                        {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                        Save draft
                    </Button>
                    <Button onClick={() => handleSave(false)} disabled={saving}>
                        Send to customer
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

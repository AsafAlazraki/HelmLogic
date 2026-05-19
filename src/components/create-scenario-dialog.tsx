'use client';

/**
 * Create Scenario dialog (v1.9 — story 1.1.3).
 *
 * Small single-input dialog opened from the proposal-view header. The
 * operator enters a human-readable label ("Trade-in option", "Cash deal",
 * "Finance bundle"); confirming spawns a sibling quote under the same
 * root via `createQuoteScenario()` and navigates the operator to it.
 *
 * No customer-visible side effects until the operator sends the
 * scenario (which then goes through the existing send pipeline — auto-
 * lock, lifecycle transition to 'sent', etc).
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFirestore } from '@/firebase/provider';
import { useToast } from '@/hooks/use-toast';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Layers, Loader2 } from 'lucide-react';
import { createQuoteScenario } from '@/lib/quote-scenarios';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** The audit-owner uid (matches proposal-view.tsx's auditOwnerUid). */
    ownerUid: string;
    /** Source quote — the scenario duplicates its payload + reparents to root. */
    fromQuote: { id: string; quoteNumber?: string; scenarioLabel?: string | null };
    /** Actor context for the audit-log entry. */
    actor: { byUid: string; byName: string };
}

/** Common pre-filled labels — quick-pick chips. The operator can still
 *  type their own; these just save typing on the most common phrasings. */
const SUGGESTED_LABELS = [
    'Trade-in option',
    'Cash deal',
    'Finance bundle',
    'With trailer',
    'Without trailer',
];

export function CreateScenarioDialog({ open, onOpenChange, ownerUid, fromQuote, actor }: Props) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const router = useRouter();
    const [label, setLabel] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Reset the label whenever the dialog opens fresh so a prior draft
    // doesn't leak into the next scenario.
    useEffect(() => {
        if (open) setLabel('');
    }, [open]);

    const canSubmit = label.trim().length > 0 && !submitting;

    async function handleCreate() {
        if (!canSubmit) return;
        setSubmitting(true);
        try {
            const { scenarioQuoteId, scenarioQuoteNumber } = await createQuoteScenario(
                firestore,
                ownerUid,
                fromQuote.id,
                label.trim(),
                actor,
            );
            toast({
                title: 'Scenario created',
                description: `"${label.trim()}" is ready to edit.`,
            });
            onOpenChange(false);
            // v1.9 (story 1.3.3) — fire SharePoint sync on the new
            // scenario doc. Fire-and-forget so the redirect feels
            // instant; helper is a no-op when env flag is off.
            void (async () => {
                const { syncQuoteToSharePoint } = await import('@/lib/sharepoint-sync');
                await syncQuoteToSharePoint({
                    firestore,
                    ownerUid,
                    quoteId: scenarioQuoteId,
                });
            })();
            // Navigate to the new scenario by its quoteNumber (the route
            // at /proposals/[quoteNumber] looks up by the quoteNumber
            // field, so doc-id navigation wouldn't resolve).
            router.push(`/proposals/${scenarioQuoteNumber}`);
        } catch (e: any) {
            console.error('[create-scenario]', e);
            toast({
                variant: 'destructive',
                title: 'Could not create scenario',
                description: e?.message ?? 'See console.',
            });
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!submitting) onOpenChange(v); }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Layers className="h-4 w-4 text-indigo-600" />
                        Create scenario
                    </DialogTitle>
                    <DialogDescription>
                        Duplicates this quote as a sibling under the same root with a label
                        of your choice. Personalisations carry over; the lock + send-history
                        reset. The customer never sees the label — it's an internal
                        identifier in your sibling list.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 py-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="scenario-label" className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                            Scenario label
                        </Label>
                        <Input
                            id="scenario-label"
                            placeholder="e.g. Trade-in option"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && canSubmit) {
                                    e.preventDefault();
                                    handleCreate();
                                }
                            }}
                            disabled={submitting}
                            autoFocus
                        />
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                        {SUGGESTED_LABELS.map((s) => (
                            <button
                                key={s}
                                type="button"
                                onClick={() => setLabel(s)}
                                disabled={submitting}
                                className="text-[10px] font-semibold rounded-full px-2.5 py-1 border bg-slate-50 hover:bg-slate-100 text-slate-700 disabled:opacity-50"
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        disabled={submitting}
                        className="font-black uppercase text-[10px] tracking-widest"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleCreate}
                        disabled={!canSubmit}
                        className="gap-1.5 font-black uppercase text-[10px] tracking-widest"
                    >
                        {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers className="h-3.5 w-3.5" />}
                        {submitting ? 'Creating…' : 'Create scenario'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

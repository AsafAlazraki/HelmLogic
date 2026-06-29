'use client';

/**
 * CustomerDetailSheet (v1.21 — Story 8.1.2).
 *
 * One sheet that shows everything about a customer: contact details,
 * lifecycle stage, source, primary/secondary buyer, trade-in, and the
 * customer's linked quotes (cross-referenced from the org's quote set).
 *
 * Reads the v1.12 customers/{id} schema (withCustomerDefaults applied)
 * and surfaces the trade-in (v1.21/1.5.5) when present.
 */

import { useMemo, useState } from 'react';
import { collectionGroup, collection, query, where, addDoc, doc, updateDoc, increment, serverTimestamp, orderBy } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useUser } from '@/firebase/auth/use-user';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useMemoFirebase } from '@/firebase/provider';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { User, Mail, Phone, Building, Tag, GitBranch, Repeat, FileText, MessageSquare, Loader2, Send } from 'lucide-react';
import { withCustomerDefaults, type Customer } from '@/lib/customer-types';
import { sortNotesDesc, NOTE_KIND_LABEL, type CustomerNote } from '@/lib/catalog/customer-note';
import { useToast } from '@/hooks/use-toast';

const JOURNEY_STAGES = ['Lead', 'Contacted', 'Qualified', 'Quoted', 'Contracted', 'Won', 'Delivered'];

interface CustomerDetailSheetProps {
    open: boolean;
    onOpenChange: (next: boolean) => void;
    customer: Customer | null;
}

export function CustomerDetailSheet({ open, onOpenChange, customer }: CustomerDetailSheetProps) {
    const firestore = useFirestore();

    const full = useMemo(() => customer ? withCustomerDefaults(customer as any) : null, [customer]);

    // Linked quotes — collection-group query over every user's quotes
    // filtered to this customer id. Quotes denormalise customerId at
    // finalize time.
    const quotesQuery = useMemoFirebase(
        () => full ? query(collectionGroup(firestore, 'quotes'), where('customerId', '==', full.id)) : null,
        [firestore, full?.id],
    );
    // silent: missing collectionGroup rule degrades to "no quotes linked"
    // instead of white-screening (v1.10 denylist lesson).
    const { data: quotes } = useCollection<any>(quotesQuery, { silent: true });

    // v1.24 (Story 1.5.3) — customer notes timeline.
    const { user } = useUser();
    const { toast } = useToast();
    const [noteBody, setNoteBody] = useState('');
    const [savingNote, setSavingNote] = useState(false);
    const notesQuery = useMemoFirebase(
        () => full ? query(collection(firestore, 'customers', full.id, 'notes'), orderBy('createdAt', 'desc')) : null,
        [firestore, full?.id],
    );
    const { data: notes } = useCollection<CustomerNote>(notesQuery, { silent: true });
    const timeline = useMemo(() => sortNotesDesc((notes ?? []) as any), [notes]);

    const addNote = async () => {
        if (!full || !user || !noteBody.trim()) return;
        setSavingNote(true);
        try {
            await addDoc(collection(firestore, 'customers', full.id, 'notes'), {
                customerId: full.id,
                kind: 'note',
                body: noteBody.trim(),
                createdAt: serverTimestamp(),
                createdByUid: user.uid,
                createdByName: user.displayName || user.email || 'Unknown',
            });
            await updateDoc(doc(firestore, 'customers', full.id), { notesCount: increment(1) }).catch(() => {});
            setNoteBody('');
            toast({ title: 'Note added' });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Failed to add note', description: err?.message ?? String(err) });
        } finally {
            setSavingNote(false);
        }
    };

    // v1.24 (Story 8.1.3) — customer journey index (stage position).
    const journeyIdx = full ? JOURNEY_STAGES.indexOf(full.lifecycleStage ?? 'Lead') : -1;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-full sm:max-w-lg overflow-y-auto" data-testid="customer-detail-sheet">
                <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        {full?.name ?? 'Customer'}
                    </SheetTitle>
                    <SheetDescription className="text-xs">
                        Full customer record: contact, lifecycle, buyers, trade-in, and linked quotes.
                    </SheetDescription>
                </SheetHeader>

                {!full ? null : (
                    <div className="space-y-5 mt-4">
                        {/* Lifecycle + source */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <Badge className="text-[10px] font-bold uppercase">
                                <GitBranch className="h-2.5 w-2.5 mr-1" /> {full.lifecycleStage}
                            </Badge>
                            {full.source && (
                                <Badge variant="outline" className="text-[10px] font-bold">
                                    <Tag className="h-2.5 w-2.5 mr-1" /> {full.source}
                                </Badge>
                            )}
                        </div>

                        {/* v1.24 (8.1.3) — customer journey strip */}
                        <div data-testid="customer-journey" className="flex items-center gap-1">
                            {JOURNEY_STAGES.map((s, i) => (
                                <div key={s} className="flex-1 flex flex-col items-center gap-1">
                                    <div className={`h-1.5 w-full rounded-full ${i <= journeyIdx ? 'bg-primary' : 'bg-slate-200'}`} />
                                    <span className={`text-[7px] uppercase tracking-tight font-bold ${i === journeyIdx ? 'text-primary' : 'text-muted-foreground/50'}`}>{s}</span>
                                </div>
                            ))}
                        </div>

                        {/* Contact */}
                        <div className="rounded-2xl border-2 p-4 space-y-2">
                            <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Contact</p>
                            <div className="text-xs space-y-1.5">
                                {full.email && <div className="flex items-center gap-2"><Mail className="h-3 w-3 text-muted-foreground" /> {full.email}</div>}
                                {full.phone && <div className="flex items-center gap-2"><Phone className="h-3 w-3 text-muted-foreground" /> {full.phone}</div>}
                                {full.company && <div className="flex items-center gap-2"><Building className="h-3 w-3 text-muted-foreground" /> {full.company}</div>}
                            </div>
                        </div>

                        {/* Buyers */}
                        {(full.primaryBuyer || full.secondaryBuyer) && (
                            <div className="rounded-2xl border-2 p-4 space-y-2">
                                <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Buyers</p>
                                {full.primaryBuyer && (
                                    <div className="text-xs">
                                        <span className="font-bold">{full.primaryBuyer.name}</span>
                                        <span className="text-muted-foreground"> · primary{full.primaryBuyer.role ? ` · ${full.primaryBuyer.role}` : ''}</span>
                                    </div>
                                )}
                                {full.secondaryBuyer && (
                                    <div className="text-xs">
                                        <span className="font-bold">{full.secondaryBuyer.name}</span>
                                        <span className="text-muted-foreground"> · secondary{full.secondaryBuyer.role ? ` · ${full.secondaryBuyer.role}` : ''}</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Trade-in */}
                        {full.tradeIn && (
                            <div className="rounded-2xl border-2 p-4">
                                <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-1.5">
                                    <Repeat className="h-3 w-3" /> Trade-in
                                </p>
                                <p className="text-xs font-bold mt-1">{full.tradeIn.label ?? full.tradeIn.tradeInId}</p>
                            </div>
                        )}

                        {/* Linked quotes */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-1.5">
                                    <FileText className="h-3 w-3" /> Linked quotes
                                </p>
                                <p className="text-[10px] text-muted-foreground">{(quotes ?? []).length}</p>
                            </div>
                            {(quotes ?? []).length === 0 ? (
                                <p className="text-[11px] text-muted-foreground italic">No quotes linked to this customer yet.</p>
                            ) : (
                                <div className="space-y-1.5">
                                    {(quotes ?? []).map((q: any) => (
                                        <div key={q.id} className="flex items-center justify-between text-xs border-b py-1.5">
                                            <span className="truncate font-bold">{q.quoteNumber ?? q.id?.slice(0, 8)}</span>
                                            <div className="flex items-center gap-2">
                                                {q.lifecycleState && <Badge variant="outline" className="text-[9px]">{q.lifecycleState}</Badge>}
                                                <span className="tabular-nums">${Number(q.financials?.totalInclGst ?? q.totalInclGst ?? 0).toLocaleString('en-AU')}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* v1.24 (1.5.3) — notes timeline */}
                        <div data-testid="customer-notes-timeline">
                            <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-1.5 mb-2">
                                <MessageSquare className="h-3 w-3" /> Notes
                            </p>
                            <div className="flex items-center gap-2 mb-3">
                                <Input
                                    value={noteBody}
                                    onChange={(e) => setNoteBody(e.target.value)}
                                    placeholder="Add a note…"
                                    className="h-9 text-xs"
                                    data-testid="customer-note-input"
                                    onKeyDown={(e) => { if (e.key === 'Enter') addNote(); }}
                                />
                                <Button size="icon" className="h-9 w-9 shrink-0" onClick={addNote} disabled={savingNote || !noteBody.trim()} data-testid="customer-note-save">
                                    {savingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                </Button>
                            </div>
                            {timeline.length === 0 ? (
                                <p className="text-[11px] text-muted-foreground italic">No notes yet.</p>
                            ) : (
                                <div className="space-y-2">
                                    {timeline.map((n: any) => (
                                        <div key={n.id} className="border-l-2 border-primary/30 pl-3 py-1">
                                            <p className="text-xs">{n.body}</p>
                                            <p className="text-[9px] text-muted-foreground mt-0.5">
                                                {NOTE_KIND_LABEL[n.kind as 'note'] ?? n.kind} · {n.createdByName}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}

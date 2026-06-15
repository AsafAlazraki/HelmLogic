'use client';

/**
 * ServiceQuoteDetailSheet (v1.12 — Stories 11.2.2 + 11.2.3, v1.13 — 11.2.4).
 *
 * Drill-down view for a service quote. Opens as a side Sheet from the
 * ServiceQuoteDashboard. Lets the dealer:
 *
 *   - See the full operations + parts breakdown
 *   - Edit the customer / vehicle / notes / estimateType (save on blur)
 *   - Transition the status through the state machine (validated)
 *   - Download the service-quote PDF (Story 11.2.3)
 *   - Send it via email (Story 11.2.4 — gated on NEXT_PUBLIC_EMAIL_SEND_ENABLED;
 *     when disabled, the button shows a tooltip explaining why)
 *
 * Operations + parts edit (add / remove single items) is intentionally
 * minimal — full per-line edit (qty steppers, price overrides on rows)
 * lands in 11.2.x polish stories. The v1.12 + v1.13 contract is
 * view + status lifecycle + PDF + send.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
    addDoc,
    collection,
    doc,
    serverTimestamp,
    updateDoc,
} from 'firebase/firestore';
import { useFirestore, useStorage } from '@/firebase';
import { useUser } from '@/firebase/auth/use-user';
import { uploadFileToStorage } from '@/firebase/storage';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Download, Send, Lock, Loader2, FileText, Wrench, Package, ClipboardCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export type ServiceQuoteStatus = 'draft' | 'sent' | 'accepted' | 'in-progress' | 'complete' | 'cancelled';

/** Status state machine — what each status can transition to. v1.12 (Story 11.2.2) — locked
 *  states (complete / cancelled) have no outgoing transitions; reads-only after that. */
const STATUS_TRANSITIONS: Record<ServiceQuoteStatus, ServiceQuoteStatus[]> = {
    draft:         ['sent', 'cancelled'],
    sent:          ['accepted', 'cancelled', 'draft'],
    accepted:      ['in-progress', 'cancelled'],
    'in-progress': ['complete', 'cancelled'],
    complete:      [],
    cancelled:     [],
};

const STATUS_TONE: Record<ServiceQuoteStatus, string> = {
    draft:         'bg-slate-50 text-slate-700 border-slate-200',
    sent:          'bg-violet-50 text-violet-700 border-violet-200',
    accepted:      'bg-blue-50 text-blue-700 border-blue-200',
    'in-progress': 'bg-amber-50 text-amber-800 border-amber-200',
    complete:      'bg-emerald-50 text-emerald-700 border-emerald-200',
    cancelled:     'bg-rose-50 text-rose-700 border-rose-200',
};

/** v1.12 (Story 11.2.2 AC2) — estimateType selector. Lifted from NSM-Hub's three categories. */
const ESTIMATE_TYPES = ['Installation', 'Insurance', 'Mechanical Estimate'] as const;

interface ServiceQuote {
    id: string;
    customerName: string;
    customerPhone?: string;
    customerEmail?: string;
    vehicle?: string;
    notes?: string | null;
    estimateType?: string | null;
    quoteNumber?: string;
    operations: any[];
    parts: any[];
    status: ServiceQuoteStatus;
    totalSell: number;
    totalCost: number;
    lockedAt?: any;
    lockedReason?: 'sent' | 'manual' | null;
    sentCount?: number;
    lastSentAt?: any;
    createdAt?: any;
    updatedAt?: any;
}

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    organisationId: string;
    quote: ServiceQuote | null;
    organisation?: any;
}

function currency(n: number) {
    return new Intl.NumberFormat('en-AU', {
        style: 'currency', currency: 'AUD', maximumFractionDigits: 0,
    }).format(n);
}

const SEND_ENABLED = process.env.NEXT_PUBLIC_EMAIL_SEND_ENABLED === 'true';

export function ServiceQuoteDetailSheet({ open, onOpenChange, organisationId, quote, organisation }: Props) {
    const firestore = useFirestore();
    const storage = useStorage();
    const { user } = useUser();
    const { toast } = useToast();

    // Local draft state — flushed to Firestore on blur.
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerEmail, setCustomerEmail] = useState('');
    const [vehicle, setVehicle] = useState('');
    const [notes, setNotes] = useState('');
    const [estimateType, setEstimateType] = useState<string>('');
    const [downloading, setDownloading] = useState(false);
    const [sending, setSending] = useState(false);

    // Reset drafts when the open quote changes (CLAUDE.md lesson: keying
    // by quote.id is how we stop drafts leaking across items).
    useEffect(() => {
        if (!quote) return;
        setCustomerName(quote.customerName ?? '');
        setCustomerPhone(quote.customerPhone ?? '');
        setCustomerEmail(quote.customerEmail ?? '');
        setVehicle(quote.vehicle ?? '');
        setNotes(quote.notes ?? '');
        setEstimateType(quote.estimateType ?? '');
    }, [quote?.id]);

    const isLocked = useMemo(() => {
        if (!quote) return false;
        return quote.status === 'complete' || quote.status === 'cancelled' || !!quote.lockedAt;
    }, [quote]);

    const validNextStatuses = useMemo<ServiceQuoteStatus[]>(() => {
        if (!quote) return [];
        return STATUS_TRANSITIONS[quote.status] ?? [];
    }, [quote]);

    const patch = async (fields: Record<string, any>) => {
        if (!quote) return;
        try {
            await updateDoc(doc(firestore, 'organisations', organisationId, 'serviceQuotes', quote.id), {
                ...fields,
                updatedAt: serverTimestamp(),
            });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: err?.message ?? String(err) });
        }
    };

    const handleStatusChange = async (next: ServiceQuoteStatus) => {
        if (!quote) return;
        await patch({ status: next });
        toast({ title: `Status → ${next}` });
        // Audit-log entry (best-effort)
        try {
            await addDoc(collection(firestore, 'organisations', organisationId, 'serviceQuotes', quote.id, 'auditLog'), {
                eventType: 'status-changed',
                fromStatus: quote.status,
                toStatus: next,
                at: serverTimestamp(),
                byUid: user?.uid ?? 'unknown',
                byName: user?.displayName ?? user?.email ?? 'Someone',
            });
        } catch (err) {
            console.warn('audit-log write failed (non-fatal)', err);
        }
    };

    const buildPdfInput = () => {
        if (!quote) return null;
        return {
            id: quote.id,
            quoteNumber: quote.quoteNumber,
            customerName,
            customerPhone,
            customerEmail,
            vehicle,
            notes,
            estimateType,
            operations: (quote.operations || []).map((o: any) => ({
                id: o.id, code: o.code, name: o.name,
                hours: o.hours ?? 0, rate: o.rate ?? 0,
                sellPrice: o.sellPrice ?? 0, cost: o.cost ?? 0,
            })),
            parts: (quote.parts || []).map((p: any) => ({
                id: p.id, partNumber: p.partNumber, name: p.name,
                qty: p.qty ?? 1, sellPrice: p.sellPrice ?? 0, cost: p.cost ?? 0,
            })),
            status: quote.status,
            totalSell: quote.totalSell ?? 0,
            createdAt: quote.createdAt,
        };
    };

    const handleDownload = async () => {
        if (!quote) return;
        setDownloading(true);
        try {
            const { pdf } = await import('@react-pdf/renderer');
            const { ServiceQuotePDFDocument } = await import('@/components/service-quote-pdf');
            const input = buildPdfInput();
            if (!input) throw new Error('no quote');
            const blob = await pdf(<ServiceQuotePDFDocument quote={input} organisation={organisation ?? { name: 'HelmLogic' }} />).toBlob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `service-quote-${quote.quoteNumber ?? quote.id.slice(0, 8)}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 5000);
            toast({ title: 'PDF downloaded' });
        } catch (err: any) {
            console.error(err);
            toast({ variant: 'destructive', title: 'PDF generation failed', description: err?.message ?? String(err) });
        } finally {
            setDownloading(false);
        }
    };

    /** v1.13 (Story 11.2.4) — send service quote via email. Minimal version:
     *  render PDF → upload to Storage → write mail/{id} doc → write sentEmails
     *  audit → if first send, mark lockedReason='sent' + lockedAt + audit log.
     *  Full template/cc/bcc/recipient-edit lives in v1.14 polish. */
    const handleSend = async () => {
        if (!quote) return;
        if (!SEND_ENABLED) {
            toast({ variant: 'destructive', title: 'Email send is disabled', description: 'Flip NEXT_PUBLIC_EMAIL_SEND_ENABLED to true once SMTP is wired.' });
            return;
        }
        if (!customerEmail) {
            toast({ variant: 'destructive', title: 'Recipient required', description: 'Add a customer email above before sending.' });
            return;
        }
        setSending(true);
        try {
            const { pdf } = await import('@react-pdf/renderer');
            const { ServiceQuotePDFDocument } = await import('@/components/service-quote-pdf');
            const input = buildPdfInput();
            if (!input) throw new Error('no quote');
            const blob = await pdf(<ServiceQuotePDFDocument quote={input} organisation={organisation ?? { name: 'HelmLogic' }} />).toBlob();

            // Allocate sentEmails id + upload PDF
            const sentRef = collection(firestore, 'organisations', organisationId, 'serviceQuotes', quote.id, 'sentEmails');
            const sendDocRef = doc(sentRef);
            const sendId = sendDocRef.id;
            const pdfPath = `organisations/${organisationId}/serviceQuotes/${quote.id}/sent/${sendId}.pdf`;
            const pdfFile = new File([blob], `service-quote-${quote.quoteNumber ?? quote.id.slice(0, 8)}.pdf`, { type: 'application/pdf' });
            await uploadFileToStorage(storage, pdfFile, pdfPath);

            // Write mail/{id} doc — Trigger Email extension picks up
            await addDoc(collection(firestore, 'mail'), {
                to: customerEmail,
                message: {
                    subject: `Service quote from ${organisation?.name ?? 'HelmLogic'}`,
                    html: `<p>Hi ${customerName || 'there'},</p><p>Please find your service quote attached.</p><p>Kind regards,<br/>${organisation?.name ?? 'HelmLogic'}</p>`,
                    attachments: [{ path: pdfPath, filename: pdfFile.name }],
                },
                createdAt: serverTimestamp(),
            });

            // Write sentEmails audit
            const isFirstSend = (quote.sentCount ?? 0) === 0;
            await updateDoc(sendDocRef, {
                status: 'queued',
                recipientEmail: customerEmail,
                recipientName: customerName,
                pdfStoragePath: pdfPath,
                sentBy: { uid: user?.uid ?? 'unknown', name: user?.displayName ?? user?.email ?? 'Someone' },
                createdAt: serverTimestamp(),
            }).catch(async () => {
                // Doc didn't exist yet — write via setDoc-equivalent
                await addDoc(collection(firestore, 'organisations', organisationId, 'serviceQuotes', quote.id, 'sentEmails'), {
                    status: 'queued',
                    recipientEmail: customerEmail,
                    recipientName: customerName,
                    pdfStoragePath: pdfPath,
                    sentBy: { uid: user?.uid ?? 'unknown', name: user?.displayName ?? user?.email ?? 'Someone' },
                    createdAt: serverTimestamp(),
                });
            });

            // Patch quote — bump sentCount, lastSentAt, auto-lock on first send
            const patchFields: any = {
                sentCount: (quote.sentCount ?? 0) + 1,
                lastSentAt: serverTimestamp(),
            };
            if (isFirstSend) {
                patchFields.lockedAt = serverTimestamp();
                patchFields.lockedReason = 'sent';
                if (quote.status === 'draft') patchFields.status = 'sent';
            }
            await patch(patchFields);

            // Audit-log
            try {
                await addDoc(collection(firestore, 'organisations', organisationId, 'serviceQuotes', quote.id, 'auditLog'), {
                    eventType: 'sent',
                    sentEmailId: sendId,
                    recipientEmail: customerEmail,
                    at: serverTimestamp(),
                    byUid: user?.uid ?? 'unknown',
                    byName: user?.displayName ?? user?.email ?? 'Someone',
                });
                if (isFirstSend) {
                    await addDoc(collection(firestore, 'organisations', organisationId, 'serviceQuotes', quote.id, 'auditLog'), {
                        eventType: 'locked',
                        lockReason: 'sent',
                        at: serverTimestamp(),
                        byUid: user?.uid ?? 'unknown',
                        byName: user?.displayName ?? user?.email ?? 'Someone',
                    });
                }
            } catch { /* audit is best-effort */ }

            toast({ title: 'Service quote sent', description: `To ${customerEmail}${isFirstSend ? ' · quote locked' : ''}` });
        } catch (err: any) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Send failed', description: err?.message ?? String(err) });
        } finally {
            setSending(false);
        }
    };

    if (!quote) return null;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
                <SheetHeader>
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <SheetTitle className="flex items-center gap-2 text-base">
                                <ClipboardCheck className="h-4 w-4" />
                                Service Quote
                                {isLocked && <Lock className="h-3.5 w-3.5 text-amber-600" />}
                            </SheetTitle>
                            <SheetDescription className="text-[10px]">
                                {quote.quoteNumber ? `#${quote.quoteNumber} · ` : ''}
                                {quote.id.slice(0, 8)}…
                            </SheetDescription>
                        </div>
                        <Badge variant="outline" className={`${STATUS_TONE[quote.status]} text-[9px] font-bold uppercase`}>
                            {quote.status}
                        </Badge>
                    </div>
                </SheetHeader>

                <div className="space-y-5 py-4">
                    {/* ── Status lifecycle ── */}
                    <section className="rounded-2xl border-2 bg-white p-4 space-y-3">
                        <div className="flex items-center gap-2">
                            <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-700">Status</p>
                        </div>
                        {validNextStatuses.length === 0 ? (
                            <p className="text-[11px] text-muted-foreground">
                                <Lock className="h-3 w-3 inline mr-1" />
                                Quote is {quote.status} — no further transitions available.
                            </p>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {validNextStatuses.map(s => (
                                    <Button
                                        key={s}
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleStatusChange(s)}
                                        className="rounded-lg text-[10px] uppercase font-bold tracking-wider h-7"
                                    >
                                        → {s}
                                    </Button>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* ── Customer + Vehicle ── */}
                    <section className="rounded-2xl border-2 bg-white p-4 space-y-3">
                        <div className="flex items-center gap-2">
                            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-700">Customer · Vehicle</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Name</label>
                                <Input value={customerName} disabled={isLocked} onChange={e => setCustomerName(e.target.value)} onBlur={() => patch({ customerName })} className="rounded-xl border-2 h-9 mt-1 font-semibold" />
                            </div>
                            <div>
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Phone</label>
                                <Input value={customerPhone} disabled={isLocked} onChange={e => setCustomerPhone(e.target.value)} onBlur={() => patch({ customerPhone })} className="rounded-xl border-2 h-9 mt-1" />
                            </div>
                            <div className="col-span-2">
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Email</label>
                                <Input value={customerEmail} disabled={isLocked} onChange={e => setCustomerEmail(e.target.value)} onBlur={() => patch({ customerEmail })} type="email" className="rounded-xl border-2 h-9 mt-1" placeholder="Required to send via email" />
                            </div>
                            <div className="col-span-2">
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Vessel · Vehicle</label>
                                <Input value={vehicle} disabled={isLocked} onChange={e => setVehicle(e.target.value)} onBlur={() => patch({ vehicle })} className="rounded-xl border-2 h-9 mt-1" placeholder="e.g. CL380 — 2024 hull #4521" />
                            </div>
                            <div className="col-span-2">
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Estimate type</label>
                                <Select value={estimateType || undefined} onValueChange={v => { setEstimateType(v); patch({ estimateType: v }); }} disabled={isLocked}>
                                    <SelectTrigger className="rounded-xl border-2 h-9 mt-1"><SelectValue placeholder="Pick a type…" /></SelectTrigger>
                                    <SelectContent>
                                        {ESTIMATE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </section>

                    {/* ── Operations ── */}
                    <section className="rounded-2xl border-2 bg-white p-4 space-y-3">
                        <div className="flex items-center gap-2">
                            <Wrench className="h-3 w-3 text-amber-600" />
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-700">Operations · {(quote.operations ?? []).length}</p>
                        </div>
                        {(quote.operations ?? []).length === 0 ? (
                            <p className="text-[10px] text-muted-foreground italic">No operations on this quote.</p>
                        ) : (
                            <div className="space-y-1.5">
                                {(quote.operations ?? []).map((op: any) => (
                                    <div key={op.id} className="flex items-start justify-between gap-3 p-2 rounded-lg bg-slate-50 border">
                                        <div className="min-w-0">
                                            <p className="text-xs font-bold truncate">{op.name}</p>
                                            <p className="text-[10px] text-muted-foreground">
                                                {op.code && `${op.code} · `}{(op.hours ?? 0).toFixed(2)} hrs @ {currency(op.rate ?? 0)}/hr
                                            </p>
                                        </div>
                                        <p className="text-xs font-bold tabular-nums">{currency(op.sellPrice ?? 0)}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* ── Parts ── */}
                    <section className="rounded-2xl border-2 bg-white p-4 space-y-3">
                        <div className="flex items-center gap-2">
                            <Package className="h-3 w-3 text-emerald-600" />
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-700">Parts · {(quote.parts ?? []).length}</p>
                        </div>
                        {(quote.parts ?? []).length === 0 ? (
                            <p className="text-[10px] text-muted-foreground italic">No parts on this quote.</p>
                        ) : (
                            <div className="space-y-1.5">
                                {(quote.parts ?? []).map((p: any) => (
                                    <div key={p.id} className="flex items-start justify-between gap-3 p-2 rounded-lg bg-slate-50 border">
                                        <div className="min-w-0">
                                            <p className="text-xs font-bold truncate">{p.name}{(p.qty ?? 1) > 1 ? ` ×${p.qty}` : ''}</p>
                                            {p.partNumber && <p className="text-[10px] text-muted-foreground">{p.partNumber}</p>}
                                        </div>
                                        <p className="text-xs font-bold tabular-nums">{currency((p.sellPrice ?? 0) * Math.max(1, p.qty ?? 1))}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* ── Notes ── */}
                    <section className="rounded-2xl border-2 bg-white p-4 space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-700">Notes</p>
                        <Textarea
                            value={notes}
                            disabled={isLocked}
                            onChange={e => setNotes(e.target.value)}
                            onBlur={() => patch({ notes })}
                            className="rounded-xl border-2 text-xs"
                            rows={3}
                            placeholder="Internal notes — appears on the customer PDF if entered."
                        />
                    </section>

                    {/* ── Totals + actions ── */}
                    <section className="rounded-2xl border-2 bg-white p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total (excl. GST)</p>
                            <p className="text-lg font-bold italic tabular-nums">{currency(quote.totalSell ?? 0)}</p>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-2 border-t">
                            <Button onClick={handleDownload} disabled={downloading} className="rounded-xl">
                                {downloading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
                                Download PDF
                            </Button>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span>
                                            <Button onClick={handleSend} disabled={sending || !SEND_ENABLED || !customerEmail} variant="outline" className="rounded-xl">
                                                {sending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
                                                Send to customer
                                            </Button>
                                        </span>
                                    </TooltipTrigger>
                                    {(!SEND_ENABLED || !customerEmail) && (
                                        <TooltipContent>
                                            <p className="text-xs">
                                                {!SEND_ENABLED
                                                    ? 'Email send disabled — flip NEXT_PUBLIC_EMAIL_SEND_ENABLED'
                                                    : 'Add a customer email above first'}
                                            </p>
                                        </TooltipContent>
                                    )}
                                </Tooltip>
                            </TooltipProvider>
                        </div>
                    </section>
                </div>
            </SheetContent>
        </Sheet>
    );
}

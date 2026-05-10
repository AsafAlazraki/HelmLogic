'use client';

/**
 * Send Quote Dialog (v1.8 — story 1.2.4.c).
 *
 * Popup-for-confirmations (per CONVENTIONS.md) that the salesperson
 * uses to send a customer-facing PDF quote via email. Pre-fills from
 * the org's default Send Quote template, lets the operator tweak the
 * recipient / cc / bcc / subject / body per-quote, then fires the
 * sendQuoteEmail() pipeline from email-send.ts (1.2.4.a) on confirm.
 *
 * Pipeline (handled inside the dialog):
 *   1. renderQuotePdf() — fresh PDF for the current quote payload
 *   2. Upload PDF to users/{uid}/quotes/{qid}/sent/{sendId}.pdf
 *   3. Write mail/{id} doc (Trigger Email picks up when configured)
 *   4. Write sentEmails/{sendId} audit record
 *   5. Increment quote.sentCount + set lastSentAt
 *   6. Fire auditLog 'sent' event
 *   7. If first send → auto-lock the quote via 1.3.1's lockQuote()
 *      (which also fires auditLog 'locked')
 *
 * Stakeholder-pause: the Send Quote BUTTON on proposal-view is
 * disabled when NEXT_PUBLIC_EMAIL_SEND_ENABLED is not 'true', so
 * this dialog never opens until infra is ready. The dialog itself
 * stays usable for layout / template testing if someone toggles the
 * flag locally.
 */

import { useEffect, useMemo, useState } from 'react';
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
import { Send, Loader2, Paperclip, FileText, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFirestore, useStorage } from '@/firebase/provider';
import { useToast } from '@/hooks/use-toast';
import { FeatureRichTextEditor } from '@/components/feature-rich-text-editor';
import {
    sendQuoteEmail,
    renderMergeFields,
    useEmailTemplates,
    type EmailTemplate,
} from '@/lib/email-send';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    ownerUid: string;
    quote: any;
    organisation: any;
    financials: any;
    senderUid: string;
    senderName: string;
}

export function SendQuoteDialog({
    open, onOpenChange,
    ownerUid, quote, organisation, financials,
    senderUid, senderName,
}: Props) {
    const firestore = useFirestore();
    const storage = useStorage();
    const { toast } = useToast();

    const { data: templates } = useEmailTemplates(quote?.organisationId ?? null, 'send-quote');

    /* ──────────── state ──────────── */

    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
    const [recipient, setRecipient] = useState('');
    const [cc, setCc] = useState('');
    const [bcc, setBcc] = useState('');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [sending, setSending] = useState(false);

    /** Auto-pick the default template on open. */
    useEffect(() => {
        if (!open || !templates || templates.length === 0) return;
        if (selectedTemplateId && templates.find(t => t.id === selectedTemplateId)) return;
        const def = templates.find(t => t.isDefault) ?? templates[0];
        setSelectedTemplateId(def.id);
    }, [open, templates, selectedTemplateId]);

    const selectedTemplate: EmailTemplate | null = useMemo(
        () => templates?.find(t => t.id === selectedTemplateId) ?? null,
        [templates, selectedTemplateId],
    );

    /** Merge-field context for the live preview / pre-fill. */
    const mergeCtx = useMemo(() => ({
        quote, organisation, financials, senderName,
    }), [quote, organisation, financials, senderName]);

    /** Whenever the template OR the quote changes, pre-fill the form
     *  fields with the rendered template + customer details. The user
     *  can edit anything before sending. */
    useEffect(() => {
        if (!open) return;
        // Recipient: defaults to quote.customer.email; never overridden
        // by template (the template lives at org level, recipient is per-
        // customer).
        if (!recipient && quote?.customer?.email) {
            setRecipient(quote.customer.email);
        }
        if (selectedTemplate) {
            setSubject(renderMergeFields(selectedTemplate.subject, mergeCtx));
            setBody(renderMergeFields(selectedTemplate.bodyHtml, mergeCtx));
            setBcc((selectedTemplate.bccEmails ?? []).join(', '));
        }
    }, [open, selectedTemplate?.id, quote?.id]);

    /** Reset form state when dialog closes so the next open starts fresh. */
    useEffect(() => {
        if (!open) {
            setSelectedTemplateId(null);
            setRecipient('');
            setCc('');
            setBcc('');
            setSubject('');
            setBody('');
        }
    }, [open]);

    /* ──────────── send action ──────────── */

    async function handleSend() {
        if (!quote) return;
        if (!recipient.trim()) {
            toast({ variant: 'destructive', title: 'Recipient required', description: 'Add an email address.' });
            return;
        }
        setSending(true);
        try {
            const ccList = cc.split(/[,\n]+/).map(s => s.trim()).filter(s => s.includes('@'));
            const bccList = bcc.split(/[,\n]+/).map(s => s.trim()).filter(s => s.includes('@'));

            const result = await sendQuoteEmail({
                firestore,
                storage,
                ownerUid,
                quote,
                organisation,
                financials,
                template: selectedTemplate,
                recipientEmail: recipient.trim(),
                recipientName: quote.customer?.name,
                cc: ccList,
                bcc: bccList,
                subjectRendered: subject,
                bodyHtmlRendered: body,
                sender: { uid: senderUid, name: senderName },
            });

            if (result.status === 'failed') {
                toast({
                    variant: 'destructive',
                    title: 'Send failed',
                    description: 'See sentEmails record for details.',
                });
            } else {
                toast({
                    title: result.triggeredLock
                        ? `Sent · quote locked at v${quote.version ?? 1}`
                        : 'Quote sent',
                    description: `To ${recipient.trim()}.`,
                });
            }
            onOpenChange(false);
        } catch (e: any) {
            toast({
                variant: 'destructive',
                title: 'Send failed',
                description: e?.message ?? 'See console.',
            });
            console.error('[send-quote-dialog]', e);
        } finally {
            setSending(false);
        }
    }

    /* ──────────── render ──────────── */

    const previewWillLock = !quote?.sentCount || quote.sentCount === 0;
    const noTemplates = (templates?.length ?? 0) === 0;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Send className="h-4 w-4 text-primary" />
                        Send quote to customer
                    </DialogTitle>
                    <DialogDescription>
                        Renders a fresh PDF of the current quote and emails it to the
                        recipient. The PDF + frozen subject/body get stored on the
                        quote for audit.
                    </DialogDescription>
                </DialogHeader>

                {noTemplates ? (
                    <div className="rounded-2xl border-2 border-dashed bg-amber-50 p-6 text-center space-y-2">
                        <FileText className="h-7 w-7 text-amber-600 mx-auto" />
                        <p className="text-sm font-bold text-amber-900">No email templates yet</p>
                        <p className="text-xs text-amber-700 max-w-md mx-auto">
                            Create at least one Send Quote template in <code>/manage</code> → Document Templates → Email
                            before using this dialog. The template defines the subject + body of customer emails.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Template picker */}
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                Template
                            </Label>
                            <select
                                value={selectedTemplateId ?? ''}
                                onChange={(e) => setSelectedTemplateId(e.target.value || null)}
                                className="w-full h-9 px-3 rounded-md border-2 bg-white text-sm"
                            >
                                {(templates ?? []).map(t => (
                                    <option key={t.id} value={t.id}>
                                        {t.isDefault ? '★ ' : ''}{t.subject || '(no subject)'}
                                    </option>
                                ))}
                            </select>
                            <p className="text-[10px] text-slate-400">
                                Pick a template to pre-fill subject + body. Edits below stay scoped to this quote.
                            </p>
                        </div>

                        {/* Recipient + cc + bcc */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    To
                                </Label>
                                <Input
                                    type="email"
                                    value={recipient}
                                    onChange={(e) => setRecipient(e.target.value)}
                                    placeholder="customer@example.com"
                                    className="text-sm"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    Cc (optional, comma-separated)
                                </Label>
                                <Input
                                    value={cc}
                                    onChange={(e) => setCc(e.target.value)}
                                    placeholder="manager@..., ..."
                                    className="text-sm"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                Bcc (optional, comma-separated)
                            </Label>
                            <Input
                                value={bcc}
                                onChange={(e) => setBcc(e.target.value)}
                                placeholder="sales-archive@..."
                                className="text-sm"
                            />
                            {selectedTemplate?.bccEmails && selectedTemplate.bccEmails.length > 0 && (
                                <p className="text-[10px] text-slate-400">
                                    Pre-filled from template default. Edit to override per-quote.
                                </p>
                            )}
                        </div>

                        {/* Subject */}
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                Subject
                            </Label>
                            <Input
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                className="text-sm"
                            />
                        </div>

                        {/* Body */}
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                Body
                            </Label>
                            <FeatureRichTextEditor
                                value={body}
                                onChange={setBody}
                                placeholder="Write the message body. Merge fields like {{customer.name}} have already been filled in."
                                minHeight="200px"
                            />
                            <p className="text-[10px] text-slate-400">
                                Already rendered with this customer&apos;s details. Any further merge tokens
                                you type now will be left as literal text — substitution only happens at the
                                moment the template is loaded.
                            </p>
                        </div>

                        {/* Attachment + lock hint */}
                        <div className="rounded-xl border bg-slate-50 p-3 space-y-2">
                            <p className="text-[11px] text-slate-700 flex items-center gap-1.5">
                                <Paperclip className="h-3.5 w-3.5 text-slate-500" />
                                Attaching: <strong>Quote-{quote?.quoteNumber}-{quote?.modelName ?? 'Proposal'}.pdf</strong>{' '}
                                <span className="text-slate-400">(re-rendered at send)</span>
                            </p>
                            {previewWillLock && (
                                <p className="text-[11px] text-amber-700 flex items-center gap-1.5">
                                    <Lock className="h-3.5 w-3.5" />
                                    First send — this quote will <strong>lock</strong> after delivery.
                                    Future edits require a new version.
                                </p>
                            )}
                        </div>
                    </div>
                )}

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSend}
                        disabled={sending || noTemplates || !recipient.trim()}
                        className={cn('gap-1.5')}
                    >
                        {sending
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Send className="h-3.5 w-3.5" />}
                        {sending ? 'Sending…' : 'Send'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

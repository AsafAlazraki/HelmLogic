/**
 * Email send pipeline (v1.8 — story 1.2.4.a).
 *
 * Schema + types + writer for the customer-PDF Send Quote feature.
 * Pairs with the Firebase Trigger Email extension (Firestore-driven —
 * drop a doc into mail/{id} → extension fires SMTP send via configured
 * provider + verified sender domain). See
 * tasks/ADMIN_TASK_email-trigger-setup.md for the extension wiring.
 *
 * v1.8 STAKEHOLDER PAUSE — code is plumbed end-to-end but the
 * Trigger Email extension is NOT YET CONFIGURED. Stakeholders need to
 * decide:
 *   1. Sender domain (helmlogic.com? quotes@northsidemarine.com.au?
 *      per-salesperson?)
 *   2. Email provider (SendGrid free tier? M365 SMTP? Mailgun?)
 *   3. Cost ownership
 *   4. Reply-to handling
 * Until then, mail/{id} docs sit in Firestore in `delivery: pending`
 * state forever. No emails go out. The Send Quote button uses the
 * NEXT_PUBLIC_EMAIL_SEND_ENABLED env flag to render disabled with a
 * tooltip explaining the pre-flight is incomplete.
 *
 * SCHEMA
 * ──────
 * organisations/{orgId}/emailTemplates/{templateId}
 *   templateType:  'send-quote' | 'send-contract' | 'follow-up'
 *   subject:       string — supports {{merge}} fields
 *   bodyHtml:      string — TipTap-authored, supports {{merge}} fields
 *   fromName:      string
 *   fromEmail?:    string — optional override of extension's default FROM
 *   bccEmails:     string[]
 *   isDefault:     boolean — only one per templateType per org should be default
 *   createdAt, updatedAt, updatedByUid, updatedByName
 *
 * users/{ownerUid}/quotes/{quoteId}/sentEmails/{sendId}
 *   sentAt:           Timestamp
 *   sentByUid:        string
 *   sentByName:       string
 *   recipientEmail:   string
 *   recipientName?:   string
 *   cc:               string[]
 *   bcc:              string[]
 *   templateId:       string (FK; null if ad-hoc)
 *   subjectFrozen:    string — rendered subject at send time
 *   bodyHtmlFrozen:   string — rendered body at send time
 *   pdfStoragePath:   string — Storage path of the attached PDF
 *   status:           'queued' | 'sent' | 'bounced' | 'failed'
 *   triggerEmailId:   string — FK into mail/{id} for delivery tracking
 *   errorMessage?:    string
 *
 * Denormalised on the quote doc:
 *   lastSentAt?:    Timestamp
 *   sentCount?:     number (incremented per send)
 *
 * v1.8 OUT OF SCOPE (deferred to v1.9):
 *   - Email open / click tracking (SendGrid webhooks + Cloud Function)
 *   - Reply-tracking / customer-comment thread
 *   - Scheduled sends ("send tomorrow at 9am")
 *   - Multi-recipient with per-recipient body
 *   - Quote-revoke ("send a no-longer-valid email")
 *   - Server-side render of PDF for system-initiated sends
 */

import {
    addDoc,
    collection,
    doc,
    increment,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    where,
    type Firestore,
    type Timestamp,
} from 'firebase/firestore';
import type { FirebaseStorage } from 'firebase/storage';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { uploadFileToStorage } from '@/firebase/storage';
import { logAuditEvent } from '@/lib/quote-audit-log';
import { lockQuote } from '@/lib/quote-lock';
import { transitionQuoteLifecycle } from '@/lib/quote-lifecycle';
import { renderQuotePdf } from '@/lib/render-quote-pdf';

/* ──────────────────────────────────────────────────────────────────
 * TYPES
 * ────────────────────────────────────────────────────────────────── */

export type EmailTemplateType = 'send-quote' | 'send-contract' | 'follow-up';

export interface EmailTemplate {
    id: string;
    templateType: EmailTemplateType;
    subject: string;
    bodyHtml: string;
    fromName: string;
    fromEmail?: string | null;
    bccEmails: string[];
    isDefault: boolean;
    createdAt?: Timestamp;
    updatedAt?: Timestamp;
    updatedByUid?: string;
    updatedByName?: string;
}

export type SentEmailStatus = 'queued' | 'sent' | 'bounced' | 'failed';

export interface SentEmailRecord {
    id: string;
    sentAt: Timestamp;
    sentByUid: string;
    sentByName: string;
    recipientEmail: string;
    recipientName?: string | null;
    cc: string[];
    bcc: string[];
    templateId: string | null;
    subjectFrozen: string;
    bodyHtmlFrozen: string;
    pdfStoragePath: string;
    status: SentEmailStatus;
    triggerEmailId: string;
    errorMessage?: string | null;
}

/* ──────────────────────────────────────────────────────────────────
 * MERGE FIELDS — picker source for the email-template editor.
 *
 * Each entry: {token} the literal text inserted at cursor + a resolver
 * that turns it into a real value at send time. Keep this list tight —
 * adding tokens here adds a maintenance burden for every template
 * preview. v1.9 candidate: org-custom merge fields.
 * ────────────────────────────────────────────────────────────────── */

export interface MergeFieldDef {
    token: string;           // literal text the operator inserts (e.g. "{{customer.name}}")
    label: string;           // dropdown label in the picker
    example: string;         // what the operator sees in the preview
}

export const MERGE_FIELDS: MergeFieldDef[] = [
    { token: '{{customer.name}}',    label: 'Customer name',    example: 'James Thompson' },
    { token: '{{customer.company}}', label: 'Customer company', example: 'Pacific Bay Charters' },
    { token: '{{quote.quoteNumber}}',label: 'Quote number',     example: 'NSM-2026-0042' },
    { token: '{{quote.modelName}}',  label: 'Boat model',       example: 'Sport 560' },
    { token: '{{quote.total}}',      label: 'Total (incl. GST)',example: '$185,851' },
    { token: '{{salesperson.name}}', label: 'Salesperson',      example: 'Bill Hull' },
];

/**
 * Resolve {{merge}} fields in a subject or body against the live data.
 * Unknown tokens left untouched (the operator can see the typo in the
 * preview pane).
 */
export function renderMergeFields(
    text: string,
    ctx: {
        quote: any;
        organisation: any;
        financials: any;
        senderName: string;
    },
): string {
    if (!text) return text;
    const subs: Record<string, string> = {
        '{{customer.name}}':    ctx.quote?.customer?.name ?? '',
        '{{customer.company}}': ctx.quote?.customer?.company ?? '',
        '{{quote.quoteNumber}}': ctx.quote?.quoteNumber ?? '',
        '{{quote.modelName}}':  ctx.quote?.modelName ?? '',
        '{{quote.total}}':      formatTotalForEmail(ctx.financials),
        '{{salesperson.name}}': ctx.senderName ?? '',
    };
    return text.replace(/\{\{[a-zA-Z0-9._]+\}\}/g, (m) => subs[m] ?? m);
}

function formatTotalForEmail(financials: any): string {
    const v = financials?.totalInclGst ?? 0;
    return new Intl.NumberFormat('en-AU', {
        style: 'currency', currency: 'AUD', maximumFractionDigits: 0,
    }).format(v);
}

/* ──────────────────────────────────────────────────────────────────
 * READERS — template list hooks
 * ────────────────────────────────────────────────────────────────── */

/**
 * Live list of email templates for an org, filtered by templateType.
 * Used by the /manage authoring surface (1.2.4.b) and the SendQuoteDialog
 * picker (1.2.4.c). Returns the same useCollection-shape as other
 * hooks in the codebase.
 */
export function useEmailTemplates(orgId: string | null | undefined, templateType: EmailTemplateType) {
    const firestore = useFirestore();
    const ref = useMemoFirebase(
        () => (orgId
            ? query(
                collection(firestore, 'organisations', orgId, 'emailTemplates'),
                where('templateType', '==', templateType),
                orderBy('isDefault', 'desc'),
                orderBy('updatedAt', 'desc'),
            )
            : null),
        [firestore, orgId, templateType],
    );
    return useCollection<EmailTemplate>(ref);
}

/**
 * Live list of sent-email records for a quote. Newest first. Surfaced
 * inline in the Activity tab as `sent` events with metadata pointer
 * (no separate UI in v1.8 — just available for future consumers).
 */
export function useSentEmails(ownerUid: string | null | undefined, quoteId: string | null | undefined) {
    const firestore = useFirestore();
    const ref = useMemoFirebase(
        () => (ownerUid && quoteId
            ? query(
                collection(firestore, 'users', ownerUid, 'quotes', quoteId, 'sentEmails'),
                orderBy('sentAt', 'desc'),
            )
            : null),
        [firestore, ownerUid, quoteId],
    );
    return useCollection<SentEmailRecord>(ref);
}

/* ──────────────────────────────────────────────────────────────────
 * WRITER — the orchestrator
 *
 * sendQuoteEmail() is the cornerstone of 1.2.4. Called by the Send
 * Quote dialog confirm action (1.2.4.c). End-to-end pipeline:
 *
 *   1. Render PDF via renderQuotePdf() (1.5.0 — single source)
 *   2. Upload PDF to users/{ownerUid}/quotes/{quoteId}/sent/{sendId}.pdf
 *   3. Write mail/{id} doc — Trigger Email extension picks up & sends
 *      (when configured)
 *   4. Write sentEmails/{sendId} audit record with frozen subject/body
 *   5. Increment quote.sentCount + set quote.lastSentAt
 *   6. Fire auditLog 'sent' event (sentEmailId metadata)
 *   7. If first send (sentCount was 0 or undefined), auto-lock via
 *      lockQuote() with reason 'sent' — also fires auditLog 'locked'
 *
 * Best-effort — non-PDF failures (mail write, sentEmails write) flip
 * the sentEmails status to 'failed' with errorMessage but don't roll
 * back the PDF upload. PDF failures throw to the caller.
 * ────────────────────────────────────────────────────────────────── */

export interface SendQuoteEmailOptions {
    firestore: Firestore;
    storage: FirebaseStorage;
    ownerUid: string;
    quote: any;
    organisation: any;
    financials: any;
    template: EmailTemplate | null;
    recipientEmail: string;
    recipientName?: string;
    cc: string[];
    bcc: string[];
    /** Edited subject + body at the moment of send (operator can tweak in dialog). */
    subjectRendered: string;
    bodyHtmlRendered: string;
    sender: { uid: string; name: string };
}

export interface SendQuoteEmailResult {
    sendId: string;
    triggerEmailId: string;
    status: SentEmailStatus;
    pdfStoragePath: string;
    /** True when this send triggered the first-Send auto-lock. */
    triggeredLock: boolean;
}

export async function sendQuoteEmail(opts: SendQuoteEmailOptions): Promise<SendQuoteEmailResult> {
    const {
        firestore, storage, ownerUid,
        quote, organisation, financials,
        template,
        recipientEmail, recipientName,
        cc, bcc,
        subjectRendered, bodyHtmlRendered,
        sender,
    } = opts;

    // 1. Render PDF (throws on failure — let the caller surface).
    const { blob } = await renderQuotePdf({
        firestore, storage,
        quote, organisation, financials,
        documentType: 'quote',
    });

    // 2. Allocate sentEmails doc id BEFORE upload (so PDF path can
    // reference it). Use addDoc-equivalent via doc() + uuid id.
    const sentEmailsRef = collection(firestore, 'users', ownerUid, 'quotes', quote.id, 'sentEmails');
    const sendDocRef = doc(sentEmailsRef);
    const sendId = sendDocRef.id;
    const pdfStoragePath = `users/${ownerUid}/quotes/${quote.id}/sent/${sendId}.pdf`;
    const pdfFile = new File(
        [blob],
        `Quote-${quote.quoteNumber}-${quote.modelName ?? 'Proposal'}.pdf`,
        { type: 'application/pdf' },
    );
    await uploadFileToStorage(storage, pdfFile, pdfStoragePath);

    // 3. Write mail/{id} doc. The Trigger Email extension will fire
    // when configured; until SMTP is wired, the doc sits with no
    // `delivery` field — no harm, no behaviour, picks up automatically
    // when extension activates.
    let triggerEmailId = '';
    let status: SentEmailStatus = 'queued';
    let errorMessage: string | null = null;
    try {
        const mailDocRef = await addDoc(collection(firestore, 'mail'), {
            to: recipientEmail,
            cc: cc.length > 0 ? cc : undefined,
            bcc: bcc.length > 0 ? bcc : undefined,
            message: {
                subject: subjectRendered,
                html: bodyHtmlRendered,
                attachments: [{
                    filename: pdfFile.name,
                    path: pdfStoragePath,
                }],
            },
            // Carried for the extension's optional headers (when supported).
            ...(template?.fromEmail || template?.fromName
                ? { from: template.fromEmail
                    ? `${template.fromName} <${template.fromEmail}>`
                    : template.fromName }
                : {}),
        });
        triggerEmailId = mailDocRef.id;
    } catch (e: any) {
        status = 'failed';
        errorMessage = e?.message ?? 'Failed to queue mail';
    }

    // 4. Write sentEmails audit record.
    await setDoc(sendDocRef, {
        sentAt: serverTimestamp(),
        sentByUid: sender.uid,
        sentByName: sender.name,
        recipientEmail,
        recipientName: recipientName ?? null,
        cc,
        bcc,
        templateId: template?.id ?? null,
        subjectFrozen: subjectRendered,
        bodyHtmlFrozen: bodyHtmlRendered,
        pdfStoragePath,
        status,
        triggerEmailId,
        errorMessage,
    });

    // 5. Denormalise quote-level send counters (best-effort — guarded
    // because a locked quote that's being re-sent only allows the
    // lock-fields whitelist, which includes lastSentAt + sentCount per
    // 1.3.1.a rules).
    const previousSentCount = (typeof quote.sentCount === 'number' ? quote.sentCount : 0);
    try {
        await updateDoc(doc(firestore, 'users', ownerUid, 'quotes', quote.id), {
            lastSentAt: serverTimestamp(),
            sentCount: increment(1),
            updatedAt: serverTimestamp(),
        });
    } catch (e) {
        console.warn('[email-send] denormalisation update failed (non-fatal):', e);
    }

    // 6. AuditLog 'sent' event.
    await logAuditEvent(firestore, ownerUid, quote.id, {
        eventType: 'sent',
        byUid: sender.uid,
        byName: sender.name,
        metadata: { sentEmailId: sendId },
    });

    // 7. First-Send auto-lock (1.3.1 rule: locks once, doesn't re-lock
    // on subsequent sends).
    let triggeredLock = false;
    if (status === 'queued' && previousSentCount === 0 && quote.isLocked !== true) {
        try {
            await lockQuote(firestore, ownerUid, quote.id, 'sent', {
                byUid: sender.uid,
                byName: sender.name,
            });
            triggeredLock = true;
        } catch (e) {
            console.warn('[email-send] auto-lock on first send failed (non-fatal):', e);
        }
    }

    // 8. v1.9 (1.4.1) — Lifecycle transition: Sent. Gated on first send
    // only (same condition as auto-lock) so re-sends never clobber an
    // operator's later transition (e.g. Sent → Accepted, then a re-send
    // shouldn't yank the state back to 'sent'). Idempotent if the quote
    // already reached 'sent' via the manual picker before send.
    if (status === 'queued' && previousSentCount === 0) {
        try {
            await transitionQuoteLifecycle(firestore, ownerUid, quote.id, 'sent', {
                byUid: sender.uid,
                byName: sender.name,
            });
        } catch (e) {
            console.warn('[email-send] lifecycle transition to "sent" failed (non-fatal):', e);
        }
    }

    return { sendId, triggerEmailId, status, pdfStoragePath, triggeredLock };
}

/* ──────────────────────────────────────────────────────────────────
 * ENV FLAG — "is email infra wired yet?"
 *
 * Until stakeholders rule on domain + provider + cost ownership, the
 * Send Quote button shows a disabled state with a tooltip explaining
 * the pre-flight is incomplete. Once the Trigger Email extension is
 * configured in Firebase Console, flip NEXT_PUBLIC_EMAIL_SEND_ENABLED=true
 * in the deploy env — no code change needed.
 *
 * Note: this flag controls the UI only — the underlying pipeline writes
 * to mail/{id} regardless. If the extension is configured but the env
 * flag is false, queued docs still get sent (extension picks them up).
 * The flag is for UX clarity, not a hard guard.
 * ────────────────────────────────────────────────────────────────── */

export function isEmailSendEnabled(): boolean {
    if (typeof process === 'undefined' || !process.env) return false;
    return process.env.NEXT_PUBLIC_EMAIL_SEND_ENABLED === 'true';
}

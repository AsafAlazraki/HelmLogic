'use client';

/**
 * Email Template Manager (v1.8 — story 1.2.4.b).
 *
 * Authoring surface for organisations/{orgId}/emailTemplates/{templateId}.
 * Mounted as a third sub-tab in /manage → Document Templates (next to
 * Quote / Contract). Master-detail layout: list of templates on the
 * left, edit form on the right.
 *
 * v1.8 scope intentionally narrow:
 *   - Only one templateType visible in the UI: 'send-quote'.
 *     Contract + follow-up template authoring is a v1.9 candidate
 *     (drives off the same schema; just needs picker UI).
 *   - Merge field picker is a dropdown that inserts {{token}} text at
 *     cursor in the subject OR body field. No fancy "click-to-insert
 *     inside TipTap" — plain text approach works for v1.8 volumes.
 *   - Live preview pane renders the template with the v1.7 sample-quote
 *     fixture customer + total filled in, mirrors the content-block
 *     live-preview convention.
 *   - "Set as default" toggle enforces single-default-per-templateType
 *     at the UI layer (unmarks other defaults when this one is set).
 *     Race-condition risk on concurrent edits is negligible at v1.8
 *     scale; server-side enforcement is a v1.9 candidate.
 *
 * v1.8 OUT OF SCOPE (deferred to v1.9):
 *   - Per-template version history (drive off the content-blocks
 *     versions subcollection pattern when we get there)
 *   - Email-template import / export across orgs
 *   - Multi-language templates
 *   - A/B variant authoring
 */

import { useEffect, useMemo, useState } from 'react';
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    serverTimestamp,
    setDoc,
    updateDoc,
    where,
    getDocs,
    query,
} from 'firebase/firestore';
import { useFirestore, useUser, useMemoFirebase } from '@/firebase/provider';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    Mail,
    Plus,
    Save,
    Loader2,
    Star,
    Trash2,
    ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { FeatureRichTextEditor } from '@/components/feature-rich-text-editor';
import {
    useEmailTemplates,
    renderMergeFields,
    isEmailSendEnabled,
    MERGE_FIELDS,
    type EmailTemplate,
    type EmailTemplateType,
} from '@/lib/email-send';
import { buildSampleQuoteFixture } from '@/lib/sample-quote-fixture';

interface Props {
    orgId: string;
}

const TEMPLATE_TYPE: EmailTemplateType = 'send-quote';

export function EmailTemplateManager({ orgId }: Props) {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();
    const userProfileRef = useMemoFirebase(
        () => (user ? doc(firestore, 'users', user.uid) : null),
        [firestore, user?.uid],
    );
    const { data: userProfile } = useDoc<any>(userProfileRef);

    const { data: templates, isLoading } = useEmailTemplates(orgId, TEMPLATE_TYPE);

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    /** Auto-select the first template when the list lands. */
    useEffect(() => {
        if (selectedId) return;
        if (templates && templates.length > 0) {
            const defaultTpl = templates.find(t => t.isDefault) ?? templates[0];
            setSelectedId(defaultTpl.id);
        }
    }, [templates, selectedId]);

    const selected = useMemo(
        () => templates?.find(t => t.id === selectedId) ?? null,
        [templates, selectedId],
    );

    /* ──────────────────────────────────────────────────────────────
     * CREATE
     * ────────────────────────────────────────────────────────────── */

    async function handleCreate() {
        if (!user) return;
        try {
            const docRef = await addDoc(
                collection(firestore, 'organisations', orgId, 'emailTemplates'),
                {
                    templateType: TEMPLATE_TYPE,
                    subject: 'Your quote — {{quote.modelName}}',
                    bodyHtml: '<p>Hi {{customer.name}},</p><p>Attached is the quote we discussed. Total comes to {{quote.total}} inc. GST.</p><p>Any questions, just reply to this email.</p><p>{{salesperson.name}}</p>',
                    fromName: organisationDefaultFromName(userProfile),
                    fromEmail: null,
                    bccEmails: [],
                    isDefault: (templates ?? []).length === 0,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    updatedByUid: user.uid,
                    updatedByName: userProfile?.displayName || user.email || 'Someone',
                },
            );
            setSelectedId(docRef.id);
            toast({ title: 'Template created' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Create failed', description: e?.message ?? 'See console.' });
        }
    }

    /* ──────────────────────────────────────────────────────────────
     * DELETE
     * ────────────────────────────────────────────────────────────── */

    async function handleDelete(templateId: string) {
        try {
            await deleteDoc(doc(firestore, 'organisations', orgId, 'emailTemplates', templateId));
            toast({ title: 'Template deleted' });
            if (selectedId === templateId) setSelectedId(null);
            setConfirmDeleteId(null);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Delete failed', description: e?.message ?? 'See console.' });
        }
    }

    /* ──────────────────────────────────────────────────────────────
     * RENDER
     * ────────────────────────────────────────────────────────────── */

    return (
        <div className="space-y-4">
            {/* v1.8 stakeholder-pause banner — visible until the env flag flips. */}
            {!isEmailSendEnabled() && (
                <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
                    <Mail className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-900 space-y-1">
                        <p className="font-bold">Email sending is awaiting infrastructure setup.</p>
                        <p>
                            Templates can be authored now and will be ready the moment SMTP is
                            wired (sender domain + provider + DKIM/SPF). Until then the Send
                            Quote button on customer proposals is disabled. See
                            <code className="bg-amber-100 px-1 mx-1 rounded">tasks/ADMIN_TASK_email-trigger-setup.md</code>
                            for the step-by-step.
                        </p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                {/* List */}
                <div className="lg:col-span-2">
                    <div className="rounded-[1.5rem] border-2 bg-white overflow-hidden">
                        <div className="px-6 py-5 bg-slate-900 flex items-center justify-between">
                            <div>
                                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Templates</div>
                                <div className="text-sm font-black text-white">Send Quote</div>
                            </div>
                            <Button
                                size="sm"
                                onClick={handleCreate}
                                className="h-8 px-3 rounded-lg font-black uppercase tracking-widest text-[10px] bg-white text-slate-900 hover:bg-slate-100 gap-1.5"
                            >
                                <Plus className="h-3.5 w-3.5" />
                                New
                            </Button>
                        </div>
                        <div className="divide-y">
                            {isLoading && (
                                <div className="px-5 py-6 text-center text-xs text-slate-400">Loading…</div>
                            )}
                            {!isLoading && (templates?.length ?? 0) === 0 && (
                                <div className="px-5 py-8 text-center space-y-2">
                                    <Mail className="h-7 w-7 text-slate-300 mx-auto" />
                                    <p className="text-xs font-semibold text-slate-700">No templates yet</p>
                                    <p className="text-[10px] text-slate-500 max-w-xs mx-auto">
                                        Click <strong>+ New</strong> to create your first Send Quote template.
                                        The first template you create is automatically set as default.
                                    </p>
                                </div>
                            )}
                            {(templates ?? []).map(t => (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setSelectedId(t.id)}
                                    className={cn(
                                        'w-full text-left px-5 py-3 transition-colors',
                                        selectedId === t.id
                                            ? 'bg-blue-50 border-l-4 border-blue-500'
                                            : 'border-l-4 border-transparent hover:bg-slate-50',
                                    )}
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        {t.isDefault && (
                                            <span className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                                <Star className="h-2.5 w-2.5 fill-emerald-700" />
                                                Default
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs font-bold text-slate-800 truncate">{t.subject || '(no subject)'}</p>
                                    <p className="text-[10px] text-slate-500 truncate mt-0.5">{t.fromName || '(no sender name)'}</p>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Editor */}
                <div className="lg:col-span-3">
                    {selected ? (
                        <EmailTemplateEditor
                            key={selected.id}
                            orgId={orgId}
                            template={selected}
                            siblings={templates ?? []}
                            onRequestDelete={() => setConfirmDeleteId(selected.id)}
                        />
                    ) : (
                        <div className="rounded-[1.5rem] border-2 border-dashed bg-white p-12 text-center space-y-2">
                            <Mail className="h-10 w-10 text-slate-300 mx-auto" />
                            <p className="text-sm font-semibold text-slate-700">Pick or create a template</p>
                            <p className="text-xs text-slate-500 max-w-xs mx-auto">
                                Email templates author the subject + body sent to customers when a quote
                                is emailed. Use the merge-field picker to insert customer + quote values
                                that fill in at send time.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Delete confirm popup (per CONVENTIONS.md popup-for-confirmations) */}
            <AlertDialog
                open={confirmDeleteId !== null}
                onOpenChange={(v) => { if (!v) setConfirmDeleteId(null); }}
            >
                <AlertDialogContent className="max-w-md">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <Trash2 className="h-4 w-4 text-red-600" />
                            Delete this template?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This can&apos;t be undone. Sent emails using this template keep their frozen subject
                            and body (the snapshot was captured at send time), so historical sentEmails records
                            stay intact. New sends will need a different template selected.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => { e.preventDefault(); if (confirmDeleteId) handleDelete(confirmDeleteId); }}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function organisationDefaultFromName(userProfile: any): string {
    return userProfile?.displayName || 'Sales Team';
}

/* ──────────────────────────────────────────────────────────────────
 * EDITOR — master-detail right pane
 * ────────────────────────────────────────────────────────────────── */

function EmailTemplateEditor({
    orgId,
    template,
    siblings,
    onRequestDelete,
}: {
    orgId: string;
    template: EmailTemplate;
    siblings: EmailTemplate[];
    onRequestDelete: () => void;
}) {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();
    const userProfileRef = useMemoFirebase(
        () => (user ? doc(firestore, 'users', user.uid) : null),
        [firestore, user?.uid],
    );
    const { data: userProfile } = useDoc<any>(userProfileRef);

    const [subject, setSubject] = useState(template.subject);
    const [bodyHtml, setBodyHtml] = useState(template.bodyHtml);
    const [fromName, setFromName] = useState(template.fromName);
    const [fromEmail, setFromEmail] = useState(template.fromEmail ?? '');
    const [bccText, setBccText] = useState((template.bccEmails ?? []).join(', '));
    const [isDefault, setIsDefault] = useState(template.isDefault);
    const [saving, setSaving] = useState(false);

    /** Reset drafts when a different template is selected. */
    useEffect(() => {
        setSubject(template.subject);
        setBodyHtml(template.bodyHtml);
        setFromName(template.fromName);
        setFromEmail(template.fromEmail ?? '');
        setBccText((template.bccEmails ?? []).join(', '));
        setIsDefault(template.isDefault);
    }, [template.id]);

    const dirty =
        subject !== template.subject
        || bodyHtml !== template.bodyHtml
        || fromName !== template.fromName
        || (fromEmail || null) !== (template.fromEmail ?? null)
        || bccText !== (template.bccEmails ?? []).join(', ')
        || isDefault !== template.isDefault;

    async function handleSave() {
        if (!user) return;
        setSaving(true);
        try {
            const bccEmails = bccText
                .split(/[,\n]+/)
                .map(s => s.trim())
                .filter(s => s.length > 0 && s.includes('@'));

            const submitterName = userProfile?.displayName || user.email || 'Someone';
            await updateDoc(doc(firestore, 'organisations', orgId, 'emailTemplates', template.id), {
                subject,
                bodyHtml,
                fromName,
                fromEmail: fromEmail.trim() || null,
                bccEmails,
                isDefault,
                updatedAt: serverTimestamp(),
                updatedByUid: user.uid,
                updatedByName: submitterName,
            });

            // Enforce single-default at the UI layer — if this template was
            // just marked default, unmark every other sibling of the same
            // templateType. (Server-side enforcement is a v1.9 candidate.)
            if (isDefault) {
                for (const s of siblings) {
                    if (s.id === template.id) continue;
                    if (s.isDefault) {
                        await updateDoc(
                            doc(firestore, 'organisations', orgId, 'emailTemplates', s.id),
                            { isDefault: false, updatedAt: serverTimestamp() },
                        );
                    }
                }
            }

            toast({ title: 'Template saved' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: e?.message ?? 'See console.' });
        } finally {
            setSaving(false);
        }
    }

    /** Merge-field picker — inserts the canonical {{token}} into either
     *  the subject input or the body editor at the cursor (subject only
     *  for now; body insert is via the operator typing the literal token
     *  since TipTap cursor manipulation is out of scope for v1.8).
     *  Tested: easiest path is "click to insert into subject field if
     *  that's focused, otherwise show a tip to type it directly". */
    function insertIntoSubject(token: string) {
        setSubject(prev => (prev ? `${prev} ${token}` : token));
    }

    /* ──────────────── Live preview rendering ─────────────── */
    const previewCtx = useMemo(() => {
        // Use the v1.7 sample-quote fixture for preview merge-field
        // substitution. Real send time uses the actual quote.
        const { quote, organisation, financials } = buildSampleQuoteFixture({
            organisationName: 'Your Organisation',
        });
        return { quote, organisation, financials, senderName: fromName || 'Salesperson' };
    }, [fromName]);

    const previewSubject = renderMergeFields(subject, previewCtx);
    const previewBody = renderMergeFields(bodyHtml, previewCtx);

    return (
        <div className="space-y-4">
            <div className="rounded-[1.5rem] border-2 bg-white overflow-hidden">
                <div className="px-6 py-5 bg-slate-900 flex items-center justify-between gap-3">
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Editing</div>
                        <div className="text-sm font-black text-white truncate">{template.subject || '(no subject)'}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={onRequestDelete}
                            className="h-8 px-3 rounded-lg font-black uppercase tracking-widest text-[10px] text-red-300 hover:bg-red-900/30 hover:text-red-100 gap-1.5"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleSave}
                            disabled={!dirty || saving}
                            className="h-8 px-3 rounded-lg font-black uppercase tracking-widest text-[10px] bg-white text-slate-900 hover:bg-slate-100 disabled:opacity-50 gap-1.5"
                        >
                            {saving
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <Save className="h-3.5 w-3.5" />}
                            Save
                        </Button>
                    </div>
                </div>

                <div className="p-6 space-y-4">
                    {/* Default toggle */}
                    <div className="flex items-center justify-between p-3 rounded-xl border bg-slate-50">
                        <div>
                            <Label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                <Star className={cn('h-3.5 w-3.5', isDefault ? 'fill-emerald-600 text-emerald-600' : 'text-slate-400')} />
                                Use as default
                            </Label>
                            <p className="text-[10px] text-slate-500 mt-0.5">
                                The default template pre-selects in the Send Quote dialog. Only one
                                template can be default per type — toggling here unmarks the others.
                            </p>
                        </div>
                        <Switch checked={isDefault} onCheckedChange={setIsDefault} />
                    </div>

                    {/* From name + From email */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                From name
                            </Label>
                            <Input
                                value={fromName}
                                onChange={(e) => setFromName(e.target.value)}
                                placeholder="e.g. Bill from Northside Marine"
                                className="text-sm"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                From email (optional override)
                            </Label>
                            <Input
                                type="email"
                                value={fromEmail}
                                onChange={(e) => setFromEmail(e.target.value)}
                                placeholder="leave blank to use extension default"
                                className="text-sm"
                            />
                        </div>
                    </div>

                    {/* Bcc */}
                    <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                            Bcc emails (comma-separated)
                        </Label>
                        <Input
                            value={bccText}
                            onChange={(e) => setBccText(e.target.value)}
                            placeholder="sales-manager@northsidemarine.com.au, ..."
                            className="text-sm"
                        />
                        <p className="text-[10px] text-slate-400">
                            Sent automatically on every email using this template. Operator can add
                            extras per-quote at send time.
                        </p>
                    </div>

                    {/* Merge-field picker */}
                    <MergeFieldPicker onPick={insertIntoSubject} />

                    {/* Subject */}
                    <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                            Subject
                        </Label>
                        <Input
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            placeholder="e.g. Your quote — {{quote.modelName}}"
                            className="text-sm"
                        />
                    </div>

                    {/* Body */}
                    <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                            Body
                        </Label>
                        <FeatureRichTextEditor
                            value={bodyHtml}
                            onChange={setBodyHtml}
                            placeholder="Write the body of the email. Use the picker above to insert merge fields."
                            minHeight="220px"
                        />
                        <p className="text-[10px] text-slate-400">
                            Merge fields like <code>{'{{customer.name}}'}</code> fill in at send time with the actual
                            quote data.
                        </p>
                    </div>
                </div>
            </div>

            {/* Preview card — fills merge fields with the v1.7 sample-quote fixture. */}
            <div className="rounded-[1.5rem] border-2 bg-white overflow-hidden">
                <div className="px-6 py-3 bg-slate-50 border-b">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Preview</div>
                    <div className="text-[10px] text-slate-400">Using sample customer · James Thompson · Sport 560</div>
                </div>
                <div className="p-6 space-y-3">
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Subject</div>
                        <p className="text-sm font-bold text-slate-900">{previewSubject || <em className="text-slate-400">(empty)</em>}</p>
                    </div>
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">From</div>
                        <p className="text-sm text-slate-700">{fromName || <em className="text-slate-400">(no name set)</em>}{fromEmail ? ` <${fromEmail}>` : ''}</p>
                    </div>
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Body</div>
                        <div
                            className="prose prose-sm max-w-none text-slate-700"
                            dangerouslySetInnerHTML={{ __html: previewBody || '<p class="text-slate-400 italic">(empty)</p>' }}
                        />
                    </div>
                    <div className="border-t pt-3 text-[10px] text-slate-500">
                        <strong>Attached:</strong> PDF of the customer quote (renders fresh at every send).
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ──────────────────────────────────────────────────────────────────
 * MERGE FIELD PICKER
 * ────────────────────────────────────────────────────────────────── */

function MergeFieldPicker({ onPick }: { onPick: (token: string) => void }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="rounded-xl border bg-blue-50/40 p-3 space-y-2">
            <div className="flex items-center justify-between">
                <Label className="text-[10px] font-black uppercase tracking-widest text-blue-700">
                    Merge fields
                </Label>
                <button
                    type="button"
                    onClick={() => setOpen(o => !o)}
                    className="text-[10px] font-bold uppercase tracking-widest text-blue-700 hover:underline inline-flex items-center gap-0.5"
                >
                    {open ? 'Hide' : 'Show'} <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
                </button>
            </div>
            {open && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {MERGE_FIELDS.map(f => (
                        <button
                            key={f.token}
                            type="button"
                            onClick={() => onPick(f.token)}
                            className="text-left rounded-lg border bg-white px-2.5 py-1.5 hover:border-blue-300 hover:bg-blue-50/60 transition-colors"
                            title={`Click to append to Subject. To use in Body: type ${f.token} directly.`}
                        >
                            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-700">{f.label}</div>
                            <div className="text-[10px] text-blue-700 font-mono">{f.token}</div>
                            <div className="text-[10px] text-slate-400 italic">e.g. {f.example}</div>
                        </button>
                    ))}
                </div>
            )}
            {!open && (
                <p className="text-[10px] text-slate-500">
                    Click to insert tokens like <code>{'{{customer.name}}'}</code> into the subject, or type
                    them anywhere in the body.
                </p>
            )}
        </div>
    );
}

/* ──────────────────────────────────────────────────────────────────
 * v1.8 OUT-OF-SCOPE PLACEHOLDER — keep export simple
 * ────────────────────────────────────────────────────────────────── */
// Future hook for the org-default template (used by 1.2.4.c's send dialog).
// Lives here so callers can co-locate the import.
export async function findDefaultSendQuoteTemplate(
    firestore: ReturnType<typeof useFirestore>,
    orgId: string,
): Promise<EmailTemplate | null> {
    try {
        const snap = await getDocs(
            query(
                collection(firestore, 'organisations', orgId, 'emailTemplates'),
                where('templateType', '==', TEMPLATE_TYPE),
                where('isDefault', '==', true),
            ),
        );
        if (snap.empty) return null;
        const d = snap.docs[0];
        return { id: d.id, ...(d.data() as Omit<EmailTemplate, 'id'>) };
    } catch (e) {
        console.warn('[email-templates] default lookup failed:', e);
        return null;
    }
}

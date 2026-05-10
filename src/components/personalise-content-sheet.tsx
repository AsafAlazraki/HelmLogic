'use client';

/**
 * Personalise Content Sheet (story 1.2.3.c).
 *
 * Lets a salesperson override the html / sub-header of any Quote
 * Content Block on a single quote, without touching the org-default
 * authored in the Content Block Manager.
 *
 * Reads:  organisations/{orgId}/contentBlocks  (org defaults + lock flags)
 *         users/{ownerUid}/quotes/{quoteId}/contentOverrides/{blockType}
 * Writes: users/{ownerUid}/quotes/{quoteId}/contentOverrides/{blockType}
 *         + an auditLog entry per save / reset
 *
 * Gating:
 *   - Locked blocks (`isLockedForQuotes === true`) are hidden from
 *     the picker — the resolver short-circuits the override layer
 *     for them too (see resolveContentBlocksForQuote in
 *     src/lib/content-blocks.ts).
 *   - The salesperson-message block uses a different per-user surface
 *     (see SalespersonMessageEditor) and is hidden here too.
 *   - The sheet itself is only mounted when the quote is unlocked
 *     (lock state owns the broader edit gate at proposal-view).
 */

import { useMemo, useState } from 'react';
import {
    collection,
    deleteDoc,
    doc,
    query,
    serverTimestamp,
    setDoc,
    where,
} from 'firebase/firestore';
import { useFirestore, useMemoFirebase, useUser } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useToast } from '@/hooks/use-toast';
import {
    BLOCK_TYPE_HELP,
    BLOCK_TYPE_LABEL,
    BLOCK_TYPE_ORDER,
    blockBelongsTo,
    type BlockType,
    type ContentBlock,
    type ContentOverride,
} from '@/lib/content-blocks';
import { useDoc } from '@/firebase/firestore/use-doc';
import { logAuditEvent } from '@/lib/quote-audit-log';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FeatureRichTextEditor } from '@/components/feature-rich-text-editor';
import {
    ArrowLeft,
    Check,
    Loader2,
    Lock,
    Pencil,
    RotateCcw,
    Save,
    Sparkles,
    X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    orgId: string;
    ownerUid: string;
    quoteId: string;
    /** Optional — only used in audit-log entries so they show "by X" cleanly. */
    actorName?: string | null;
}

export function PersonaliseContentSheet({
    open,
    onOpenChange,
    orgId,
    ownerUid,
    quoteId,
    actorName,
}: Props) {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();

    /** All quote-tagged content blocks for the org. We filter to
     *  documentTypes contains 'quote' client-side because Firestore's
     *  array-contains can't be combined with the legacy ['quote']
     *  fallback that blockBelongsTo() handles. */
    const blocksQuery = useMemoFirebase(
        () => collection(firestore, `organisations/${orgId}/contentBlocks`),
        [firestore, orgId],
    );
    const { data: rawBlocks, loading: blocksLoading } = useCollection<ContentBlock>(blocksQuery);

    /** Sort by PDF render order, drop locked blocks + salesperson-message
     *  (per-user surface, not per-quote). */
    const blocks = useMemo(() => {
        if (!rawBlocks) return null;
        return rawBlocks
            .filter(b => blockBelongsTo(b, 'quote'))
            .filter(b => !b.isLockedForQuotes)
            .filter(b => b.blockType !== 'salesperson-message')
            .sort((a, b) => (BLOCK_TYPE_ORDER[a.blockType] ?? 999) - (BLOCK_TYPE_ORDER[b.blockType] ?? 999));
    }, [rawBlocks]);

    /** All per-quote overrides for this quote — keyed by blockType. We
     *  do one collection read instead of N doc reads. */
    const overridesQuery = useMemoFirebase(
        () => collection(firestore, `users/${ownerUid}/quotes/${quoteId}/contentOverrides`),
        [firestore, ownerUid, quoteId],
    );
    const { data: overrides } = useCollection<ContentOverride>(overridesQuery);
    const overridesByType = useMemo(() => {
        const out: Partial<Record<BlockType, ContentOverride>> = {};
        for (const o of overrides ?? []) {
            out[o.id as BlockType] = o;
        }
        return out;
    }, [overrides]);

    /** Picker view vs. editor view inside the sheet. */
    const [editingBlockType, setEditingBlockType] = useState<BlockType | null>(null);
    const editingBlock = useMemo(
        () => blocks?.find(b => b.blockType === editingBlockType) ?? null,
        [blocks, editingBlockType],
    );
    const editingOverride = editingBlockType ? overridesByType[editingBlockType] : undefined;

    function closeSheet() {
        setEditingBlockType(null);
        onOpenChange(false);
    }

    return (
        <Sheet open={open} onOpenChange={(v) => { if (!v) setEditingBlockType(null); onOpenChange(v); }}>
            <SheetContent className="sm:max-w-2xl p-0 flex flex-col h-full bg-slate-50 border-l-4">
                <SheetHeader className="px-8 py-7 border-b bg-white relative overflow-hidden shrink-0">
                    <div className="absolute top-0 right-0 p-4 opacity-5"><Sparkles className="h-24 w-24" /></div>
                    <Badge variant="outline" className="text-[8px] tracking-widest uppercase font-black w-fit gap-1.5 mb-2">
                        <Sparkles className="h-3 w-3" />Personalise Quote
                    </Badge>
                    <SheetTitle className="text-2xl font-black uppercase italic tracking-tighter leading-none">
                        Customer-facing content
                    </SheetTitle>
                    <SheetDescription className="text-xs text-slate-500 mt-1">
                        Override the sections that appear on the customer PDF for this quote only.
                        Org defaults stay untouched.
                    </SheetDescription>
                </SheetHeader>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-5">
                    {blocksLoading && !blocks && (
                        <div className="flex items-center justify-center py-20 text-slate-400 gap-2 text-xs">
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading sections…
                        </div>
                    )}

                    {/* Picker view */}
                    {!editingBlockType && blocks && (
                        <div className="space-y-2">
                            {blocks.length === 0 && (
                                <div className="rounded-xl border-2 border-dashed bg-white p-8 text-center">
                                    <p className="text-sm text-slate-500">
                                        No personalisable sections.
                                    </p>
                                    <p className="text-[11px] text-slate-400 mt-1">
                                        Either nothing is authored for the Quote PDF yet, or every
                                        section is admin-locked.
                                    </p>
                                </div>
                            )}
                            {blocks.map(b => {
                                const overridden = !!overridesByType[b.blockType];
                                return (
                                    <button
                                        key={b.blockType}
                                        type="button"
                                        onClick={() => setEditingBlockType(b.blockType)}
                                        className={cn(
                                            'w-full flex items-start justify-between gap-3 rounded-xl border-2 bg-white px-4 py-3 text-left',
                                            'hover:border-primary/40 hover:shadow-sm transition-all',
                                            overridden ? 'border-blue-200 bg-blue-50/30' : 'border-slate-200',
                                        )}
                                    >
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-bold text-slate-900">
                                                {BLOCK_TYPE_LABEL[b.blockType]}
                                            </p>
                                            <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                                                {BLOCK_TYPE_HELP[b.blockType]}
                                            </p>
                                        </div>
                                        <div className="shrink-0">
                                            {overridden ? (
                                                <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[9px] font-black uppercase tracking-widest gap-1">
                                                    <Pencil className="h-2.5 w-2.5" />
                                                    Personalised
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                                                    Default
                                                </Badge>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}

                            {/* Footer hint */}
                            <div className="mt-4 rounded-xl bg-amber-50/70 border-2 border-amber-200 p-3 flex items-start gap-2">
                                <Lock className="h-3.5 w-3.5 text-amber-700 mt-0.5 shrink-0" />
                                <p className="text-[11px] text-amber-900 leading-relaxed">
                                    Sections marked <strong>Locked for quotes</strong> in the Content
                                    Block Manager don&apos;t appear here — admins control those.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Editor view */}
                    {editingBlockType && editingBlock && (
                        <PersonaliseBlockEditor
                            key={editingBlockType}
                            orgId={orgId}
                            ownerUid={ownerUid}
                            quoteId={quoteId}
                            block={editingBlock}
                            override={editingOverride}
                            actorName={actorName}
                            actorUid={user?.uid ?? ''}
                            onBack={() => setEditingBlockType(null)}
                            onSaved={() => {
                                toast({ title: 'Section personalised', description: BLOCK_TYPE_LABEL[editingBlock.blockType] });
                                setEditingBlockType(null);
                            }}
                            onReset={() => {
                                toast({ title: 'Reset to default', description: BLOCK_TYPE_LABEL[editingBlock.blockType] });
                                setEditingBlockType(null);
                            }}
                        />
                    )}
                </div>

                {/* Bottom action bar — only on the picker. Editor has its own. */}
                {!editingBlockType && (
                    <div className="px-6 py-4 border-t bg-white shrink-0 flex items-center justify-end">
                        <Button variant="outline" size="sm" onClick={closeSheet} className="gap-1.5">
                            <X className="h-3.5 w-3.5" />
                            Close
                        </Button>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}

/* ──────────────────────────────────────────────────────────────────
 * Editor view (per-block)
 * ────────────────────────────────────────────────────────────────── */

function PersonaliseBlockEditor({
    orgId,
    ownerUid,
    quoteId,
    block,
    override,
    actorName,
    actorUid,
    onBack,
    onSaved,
    onReset,
}: {
    orgId: string;
    ownerUid: string;
    quoteId: string;
    block: ContentBlock;
    override: ContentOverride | undefined;
    actorName: string | null | undefined;
    actorUid: string;
    onBack: () => void;
    onSaved: () => void;
    onReset: () => void;
}) {
    const firestore = useFirestore();
    const { toast } = useToast();

    /** Initial drafts seed from override if present, otherwise org default
     *  so the salesperson sees what they're starting from rather than a
     *  blank canvas. */
    const initialHtml = override?.html?.trim() ? override.html! : (block.html ?? '');
    const initialSubHeader = (override?.subHeader?.trim() ?? block.subHeader?.trim() ?? '') || '';
    const [draftHtml, setDraftHtml] = useState<string>(initialHtml);
    const [draftSubHeader, setDraftSubHeader] = useState<string>(initialSubHeader);
    const [saving, setSaving] = useState(false);
    const [resetting, setResetting] = useState(false);

    async function handleSave() {
        if (!actorUid) {
            toast({ variant: 'destructive', title: 'Not signed in' });
            return;
        }
        setSaving(true);
        try {
            const overrideRef = doc(
                firestore,
                `users/${ownerUid}/quotes/${quoteId}/contentOverrides/${block.blockType}`,
            );
            const subTrimmed = draftSubHeader.trim();
            await setDoc(
                overrideRef,
                {
                    html: draftHtml,
                    subHeader: subTrimmed ? subTrimmed : null,
                    overriddenAt: serverTimestamp(),
                    overriddenByUid: actorUid,
                    overriddenByName: actorName ?? 'Someone',
                },
                { merge: true },
            );
            await logAuditEvent(firestore, ownerUid, quoteId, {
                eventType: 'content-overridden',
                byUid: actorUid,
                byName: actorName ?? 'Someone',
                metadata: { blockType: block.blockType },
            });
            onSaved();
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: e?.message ?? 'See console.' });
            console.error('[personalise-content] save failed', e);
        } finally {
            setSaving(false);
        }
    }

    async function handleReset() {
        if (!override) {
            // Nothing to reset — just go back.
            onBack();
            return;
        }
        setResetting(true);
        try {
            const overrideRef = doc(
                firestore,
                `users/${ownerUid}/quotes/${quoteId}/contentOverrides/${block.blockType}`,
            );
            await deleteDoc(overrideRef);
            await logAuditEvent(firestore, ownerUid, quoteId, {
                eventType: 'content-overridden',
                byUid: actorUid,
                byName: actorName ?? 'Someone',
                metadata: { blockType: block.blockType, note: 'reset to default' },
            });
            onReset();
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Reset failed', description: e?.message ?? 'See console.' });
            console.error('[personalise-content] reset failed', e);
        } finally {
            setResetting(false);
        }
    }

    return (
        <div className="space-y-4">
            {/* Header row with back button */}
            <div className="flex items-center justify-between gap-2">
                <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 -ml-2">
                    <ArrowLeft className="h-3.5 w-3.5" />
                    All sections
                </Button>
                {override && (
                    <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[9px] font-black uppercase tracking-widest gap-1">
                        <Pencil className="h-2.5 w-2.5" />
                        Personalised
                    </Badge>
                )}
            </div>

            <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Section</p>
                <h3 className="text-xl font-black tracking-tight text-slate-900">
                    {BLOCK_TYPE_LABEL[block.blockType]}
                </h3>
                <p className="text-[11px] text-slate-500 mt-1">{BLOCK_TYPE_HELP[block.blockType]}</p>
            </div>

            {/* Sub-header input */}
            <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    PDF sub-header
                </label>
                <input
                    type="text"
                    value={draftSubHeader}
                    onChange={(e) => setDraftSubHeader(e.target.value)}
                    placeholder={block.subHeader ?? 'e.g. OUR PROMISE TO YOU'}
                    maxLength={80}
                    className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300"
                />
                <p className="text-[10px] text-slate-400">
                    Renders under the section title on the customer PDF. Leave blank to use the section default.
                </p>
            </div>

            {/* Rich-text body */}
            <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Body
                </label>
                <FeatureRichTextEditor
                    value={draftHtml}
                    onChange={setDraftHtml}
                    placeholder={`Personalise the ${BLOCK_TYPE_LABEL[block.blockType]} for this customer. The org default is pre-filled — edit as needed.`}
                    imageStoragePathPrefix={`quoteContentOverrides/${ownerUid}/${quoteId}/${block.blockType}/inline-images`}
                />
            </div>

            {/* Action bar */}
            <div className="flex items-center justify-between gap-2 pt-3 border-t">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleReset}
                    disabled={!override || saving || resetting}
                    className="gap-1.5 text-slate-500 hover:text-slate-700"
                    title={override ? 'Remove personalisation — revert to org default' : 'No personalisation to reset'}
                >
                    {resetting
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <RotateCcw className="h-3.5 w-3.5" />}
                    {resetting ? 'Resetting…' : 'Reset to default'}
                </Button>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={onBack} disabled={saving || resetting} className="gap-1.5">
                        <X className="h-3.5 w-3.5" />
                        Cancel
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={saving || resetting} className="gap-1.5">
                        {saving
                            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</>
                            : <><Save className="h-3.5 w-3.5" />Save personalisation</>}
                    </Button>
                </div>
            </div>
        </div>
    );
}

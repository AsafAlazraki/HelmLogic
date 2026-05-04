'use client';

/**
 * Content Block Detail (right panel of the Quote Content Manager).
 *
 * Phase D adds the brand-override picker above the editor. The
 * picker scopes the current edit session to either the org default
 * or a specific brand's override. Reading + writing follow the
 * same source-of-truth as the resolver:
 *   - selectedBrand === null → read/write the parent block doc
 *   - selectedBrand === vendorId → read/write
 *     contentBlocks/{blockId}/brandOverrides/{vendorId}
 *
 * When entering a brand context with no override yet, the editor
 * pre-fills with the org-default content as a starting point. The
 * version history captures both default and brand-override saves
 * with `level: 'default' | brand:{vendorId}` so restore works
 * across both surfaces.
 *
 * Lazy doc creation: blocks the org hasn't authored yet don't
 * have a Firestore parent doc. On the first default save we mint
 * a client-side id and setDoc the parent. Brand-override saves
 * REQUIRE the parent doc to exist — we create the parent first
 * (with empty html) if needed so the override has a parent path.
 */

import { useEffect, useState } from 'react';
import {
    addDoc,
    collection,
    doc,
    serverTimestamp,
    setDoc,
} from 'firebase/firestore';
import { useFirestore, useMemoFirebase, useUser } from '@/firebase/provider';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useToast } from '@/hooks/use-toast';
import {
    BLOCK_TYPE_HELP,
    BLOCK_TYPE_LABEL,
    type BlockType,
    type BrandOverride,
    type ContentBlock,
} from '@/lib/content-blocks';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FeatureRichTextEditor } from '@/components/feature-rich-text-editor';
import { VersionHistoryDrawer } from '@/components/content-block-version-history-drawer';
import { BrandOverridePicker } from '@/components/brand-override-picker';
import {
    Building2,
    CalendarDays,
    FileText,
    Globe2,
    History,
    Loader2,
    Pencil,
    Save,
    User,
    X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
    orgId: string;
    blockType: BlockType;
    block: ContentBlock | undefined;
    enabledModuleSubscriptions: string[] | null | undefined;
}

export function ContentBlockDetail({ orgId, blockType, block, enabledModuleSubscriptions }: Props) {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();

    const userProfileRef = useMemoFirebase(
        () => (user ? doc(firestore, 'users', user.uid) : null),
        [firestore, user?.uid],
    );
    const { data: userProfile } = useDoc<any>(userProfileRef);

    /** null = org-default, vendorId string = editing that brand's override. */
    const [selectedBrand, setSelectedBrand] = useState<string | null>(null);

    /** Subscribe to the brand-override doc when in brand mode + parent block exists. */
    const overrideRef = useMemoFirebase(
        () => (selectedBrand && block?.id
            ? doc(firestore, `organisations/${orgId}/contentBlocks/${block.id}/brandOverrides/${selectedBrand}`)
            : null),
        [firestore, orgId, block?.id, selectedBrand],
    );
    const { data: overrideDoc } = useDoc<BrandOverride>(overrideRef);

    /** Currently displayed html — depends on which surface we're in. */
    const currentHtml = selectedBrand
        ? (overrideDoc?.html ?? block?.html ?? '')
        : (block?.html ?? '');
    const hasContentInCurrentSurface = !!(currentHtml && currentHtml.trim());

    const [editMode, setEditMode] = useState(false);
    const [draftHtml, setDraftHtml] = useState<string>('');
    const [saving, setSaving] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);

    /** Reset edit state when block OR selectedBrand changes — drafts
     *  must not leak across blocks/brands (v1.5 lesson). */
    useEffect(() => {
        setEditMode(false);
        setDraftHtml(currentHtml);
    }, [blockType, block?.id, selectedBrand, currentHtml]);

    const formattedUpdatedAt = (
        selectedBrand
            ? overrideDoc?.updatedAt?.toDate?.().toLocaleString?.()
            : block?.updatedAt?.toDate?.().toLocaleString?.()
    ) ?? null;

    const formattedUpdatedBy = (
        selectedBrand ? overrideDoc?.updatedByName : block?.updatedByName
    ) ?? null;

    function startEdit() {
        setDraftHtml(currentHtml);
        setEditMode(true);
    }

    function cancelEdit() {
        setDraftHtml(currentHtml);
        setEditMode(false);
    }

    async function persist(htmlToSave: string) {
        if (!user) {
            toast({ variant: 'destructive', title: 'Not signed in' });
            return;
        }
        setSaving(true);
        try {
            const submitterName = userProfile?.displayName || userProfile?.email || user.email || 'Someone';

            // Lazy parent-doc creation if needed. Both default + brand
            // saves go through this — brand saves need the parent
            // path to exist for the override subcollection.
            const blockId = block?.id ?? doc(collection(firestore, `organisations/${orgId}/contentBlocks`)).id;
            const blockRef = doc(firestore, `organisations/${orgId}/contentBlocks/${blockId}`);
            if (!block) {
                await setDoc(blockRef, {
                    blockType,
                    html: '',
                    startsOnNewPage: false,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    updatedByUid: user.uid,
                    updatedByName: submitterName,
                });
            }

            if (selectedBrand) {
                // Brand-override save → write to brandOverrides/{vendorId}.
                const overrideDocRef = doc(
                    firestore,
                    `organisations/${orgId}/contentBlocks/${blockId}/brandOverrides/${selectedBrand}`,
                );
                await setDoc(
                    overrideDocRef,
                    {
                        html: htmlToSave,
                        updatedAt: serverTimestamp(),
                        updatedByUid: user.uid,
                        updatedByName: submitterName,
                    },
                    { merge: true },
                );
            } else {
                // Org-default save → update the parent block doc.
                await setDoc(
                    blockRef,
                    {
                        blockType,
                        html: htmlToSave,
                        updatedAt: serverTimestamp(),
                        updatedByUid: user.uid,
                        updatedByName: submitterName,
                        ...(block ? {} : { createdAt: serverTimestamp(), startsOnNewPage: false }),
                    },
                    { merge: true },
                );
            }

            // Append version doc — captures the surface this save targeted.
            await addDoc(collection(firestore, `organisations/${orgId}/contentBlocks/${blockId}/versions`), {
                html: htmlToSave,
                level: selectedBrand ? `brand:${selectedBrand}` : 'default',
                savedAt: serverTimestamp(),
                savedByUid: user.uid,
                savedByName: submitterName,
            });

            toast({
                title: 'Saved',
                description: selectedBrand
                    ? `${BLOCK_TYPE_LABEL[blockType]} (brand: ${selectedBrand})`
                    : BLOCK_TYPE_LABEL[blockType],
            });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: e?.message ?? 'See console.' });
            console.error('[content-blocks] save failed', e);
        } finally {
            setSaving(false);
        }
    }

    async function handleSave() {
        await persist(draftHtml);
        setEditMode(false);
    }

    async function handleRestore(html: string) {
        setDraftHtml(html);
        await persist(html);
        setEditMode(false);
    }

    return (
        <>
            <div className="rounded-xl border bg-white overflow-hidden">
                {/* Header */}
                <div className="px-5 py-4 border-b">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <h3 className="text-base font-semibold text-slate-800">
                                    {BLOCK_TYPE_LABEL[blockType]}
                                </h3>
                                {hasContentInCurrentSurface ? (
                                    <Badge variant="secondary" className="text-[10px] bg-blue-100 text-blue-700 border-blue-200">
                                        Authored
                                    </Badge>
                                ) : (
                                    <Badge variant="outline" className="text-[10px] text-slate-500">
                                        Empty
                                    </Badge>
                                )}
                            </div>
                            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                                {BLOCK_TYPE_HELP[blockType]}
                            </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            {block && (
                                <Button size="sm" variant="ghost" onClick={() => setHistoryOpen(true)} className="gap-1.5">
                                    <History className="h-3.5 w-3.5" />
                                    History
                                </Button>
                            )}
                            {!editMode && (
                                <Button size="sm" variant="outline" onClick={startEdit} className="gap-1.5">
                                    <Pencil className="h-3.5 w-3.5" />
                                    {hasContentInCurrentSurface ? 'Edit' : 'Author'}
                                </Button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Brand-override picker */}
                <div className="px-5 py-3 border-b bg-slate-50/40">
                    <div className="flex items-center gap-3">
                        <span className="text-[11px] font-medium text-slate-600 shrink-0 inline-flex items-center gap-1.5">
                            {selectedBrand ? <Building2 className="h-3 w-3" /> : <Globe2 className="h-3 w-3" />}
                            Editing for
                        </span>
                        <div className="flex-1 max-w-[260px]">
                            <BrandOverridePicker
                                enabledModuleSubscriptions={enabledModuleSubscriptions}
                                value={selectedBrand}
                                onChange={setSelectedBrand}
                                disabled={editMode || saving}
                            />
                        </div>
                        {selectedBrand && !overrideDoc && (
                            <span className="text-[10px] text-slate-500 italic">
                                No override yet — pre-filled with org-default content
                            </span>
                        )}
                    </div>
                </div>

                {/* Metadata strip */}
                {(block || overrideDoc) && !editMode && (
                    <div className="px-5 py-2.5 border-b bg-slate-50/60 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                        {formattedUpdatedAt && (
                            <span className="inline-flex items-center gap-1.5">
                                <CalendarDays className="h-3 w-3" />
                                Updated {formattedUpdatedAt}
                            </span>
                        )}
                        {formattedUpdatedBy && (
                            <span className="inline-flex items-center gap-1.5">
                                <User className="h-3 w-3" />
                                {formattedUpdatedBy}
                            </span>
                        )}
                    </div>
                )}

                {/* Body */}
                <div className="px-5 py-5">
                    {editMode ? (
                        <div className="space-y-4">
                            <FeatureRichTextEditor
                                value={draftHtml}
                                onChange={setDraftHtml}
                                placeholder={selectedBrand
                                    ? `Author the brand-override for ${BLOCK_TYPE_LABEL[blockType]}. This will replace the org-default for quotes whose vendorId matches.`
                                    : `Author the ${BLOCK_TYPE_LABEL[blockType]} content. This is what your customers will read on the proposal PDF.`
                                }
                            />
                            <div className="flex items-center justify-end gap-2 pt-2 border-t">
                                <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={saving} className="gap-1.5">
                                    <X className="h-3.5 w-3.5" />
                                    Cancel
                                </Button>
                                <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
                                    {saving ? (
                                        <>
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            Saving…
                                        </>
                                    ) : (
                                        <>
                                            <Save className="h-3.5 w-3.5" />
                                            Save
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                    ) : hasContentInCurrentSurface ? (
                        <article
                            className={cn(
                                'prose prose-sm max-w-none text-slate-700',
                                '[&_p]:my-2 [&_h2]:text-base [&_h3]:text-sm',
                            )}
                            dangerouslySetInnerHTML={{ __html: currentHtml }}
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400 border-2 border-dashed rounded-lg">
                            <FileText className="h-8 w-8 mb-3" />
                            <p className="text-sm font-medium text-slate-500">No content yet</p>
                            <p className="text-[11px] mt-1 max-w-xs">
                                Click <strong>Author</strong> to write this block. It won&apos;t render on the customer PDF until you save content.
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer hint */}
                <div className="px-5 py-2.5 border-t bg-slate-50/60 text-[10px] text-slate-500 flex items-center gap-1.5">
                    <Pencil className="h-3 w-3" />
                    Versions captured on every save · Brand overrides win at PDF render when quote.vendorId matches
                </div>
            </div>

            <VersionHistoryDrawer
                open={historyOpen}
                onOpenChange={setHistoryOpen}
                orgId={orgId}
                blockId={block?.id ?? null}
                onRestore={handleRestore}
            />
        </>
    );
}

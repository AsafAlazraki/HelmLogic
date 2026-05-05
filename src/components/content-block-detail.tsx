'use client';

/**
 * Content Block Detail (right panel of the Content Block Manager).
 *
 * v1.7 stories shipping in this component:
 *   - 1.8.1 (foundation: editor + version history + brand overrides)
 *   - 1.8.6 — documentTypes multi-select chips (Quote / Contract)
 *   - 1.8.9 — Document Templates aesthetic (NAVY dark banded header,
 *             two-column with side info card, scrollable section)
 *
 * Edit / read-only / brand-override flows unchanged from 1.8.1
 * Phase D — see file history. The 1.8.6 multi-select threads
 * documentTypes into every save (lazy parent-doc creation, brand
 * override saves, version restores).
 */

import { useEffect, useMemo, useState } from 'react';
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
    DOCUMENT_TYPES,
    DOCUMENT_TYPE_LABEL,
    getBlockDocumentTypes,
    type BlockType,
    type BrandOverride,
    type ContentBlock,
    type DocumentType,
} from '@/lib/content-blocks';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FeatureRichTextEditor } from '@/components/feature-rich-text-editor';
import { VersionHistoryDrawer } from '@/components/content-block-version-history-drawer';
import { BrandOverridePicker } from '@/components/brand-override-picker';
import { ContentBlocksPdfPreview } from '@/components/content-blocks-pdf-preview';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Building2,
    CalendarDays,
    Check,
    Eye,
    FileText,
    Globe2,
    History,
    Info,
    Loader2,
    Pencil,
    Save,
    ScrollText,
    User,
    X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
    orgId: string;
    /** Which document type sub-tab is active. New blocks default to this docType. */
    documentType: DocumentType;
    blockType: BlockType;
    block: ContentBlock | undefined;
    /** All blocks for the org — passed through for the live PDF preview pane (1.8.7). */
    allBlocks: ContentBlock[] | null;
    enabledModuleSubscriptions: string[] | null | undefined;
    /** Threaded into the live preview fixture so the cover branding feels real. */
    organisationName: string | null | undefined;
    primaryLogoUrl: string | null | undefined;
    secondaryLogoUrl: string | null | undefined;
}

export function ContentBlockDetail({ orgId, documentType, blockType, block, allBlocks, enabledModuleSubscriptions, organisationName, primaryLogoUrl, secondaryLogoUrl }: Props) {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();

    const userProfileRef = useMemoFirebase(
        () => (user ? doc(firestore, 'users', user.uid) : null),
        [firestore, user?.uid],
    );
    const { data: userProfile } = useDoc<any>(userProfileRef);

    const [selectedBrand, setSelectedBrand] = useState<string | null>(null);

    const overrideRef = useMemoFirebase(
        () => (selectedBrand && block?.id
            ? doc(firestore, `organisations/${orgId}/contentBlocks/${block.id}/brandOverrides/${selectedBrand}`)
            : null),
        [firestore, orgId, block?.id, selectedBrand],
    );
    const { data: overrideDoc } = useDoc<BrandOverride>(overrideRef);

    const currentHtml = selectedBrand
        ? (overrideDoc?.html ?? block?.html ?? '')
        : (block?.html ?? '');
    const hasContentInCurrentSurface = !!(currentHtml && currentHtml.trim());

    /** v1.7 (1.8.6) — documentTypes for this block. Defaults to the
     *  current sub-tab's docType for NEW blocks; reflects existing
     *  field (with legacy ['quote'] fallback) for existing blocks. */
    const initialDocTypes = useMemo<DocumentType[]>(
        () => block ? getBlockDocumentTypes(block) : [documentType],
        [block, documentType],
    );
    const [draftDocTypes, setDraftDocTypes] = useState<DocumentType[]>(initialDocTypes);

    const [editMode, setEditMode] = useState(false);
    const [draftHtml, setDraftHtml] = useState<string>('');
    const [saving, setSaving] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);

    /** Reset edit state on selection change (block / brand / docType-tab). */
    useEffect(() => {
        setEditMode(false);
        setDraftHtml(currentHtml);
        setDraftDocTypes(initialDocTypes);
    }, [blockType, block?.id, selectedBrand, currentHtml, initialDocTypes]);

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
        setDraftDocTypes(initialDocTypes);
        setEditMode(true);
    }

    function cancelEdit() {
        setDraftHtml(currentHtml);
        setDraftDocTypes(initialDocTypes);
        setEditMode(false);
    }

    function toggleDocType(t: DocumentType) {
        setDraftDocTypes(prev => {
            if (prev.includes(t)) {
                // Don't allow zero — at least one document type must be selected.
                if (prev.length === 1) return prev;
                return prev.filter(x => x !== t);
            }
            return [...prev, t];
        });
    }

    async function persist(htmlToSave: string) {
        if (!user) {
            toast({ variant: 'destructive', title: 'Not signed in' });
            return;
        }
        setSaving(true);
        try {
            const submitterName = userProfile?.displayName || userProfile?.email || user.email || 'Someone';
            const blockId = block?.id ?? doc(collection(firestore, `organisations/${orgId}/contentBlocks`)).id;
            const blockRef = doc(firestore, `organisations/${orgId}/contentBlocks/${blockId}`);

            // Determine documentTypes to persist on the parent block doc:
            //   - In default (org) edit mode → use draft selection
            //   - In brand-override mode → keep block's existing types unchanged
            const docTypesForParent = selectedBrand
                ? (block ? getBlockDocumentTypes(block) : [documentType])
                : draftDocTypes;

            if (!block) {
                await setDoc(blockRef, {
                    blockType,
                    html: '',
                    documentTypes: docTypesForParent,
                    startsOnNewPage: false,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    updatedByUid: user.uid,
                    updatedByName: submitterName,
                });
            }

            if (selectedBrand) {
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
                await setDoc(
                    blockRef,
                    {
                        blockType,
                        html: htmlToSave,
                        documentTypes: docTypesForParent,
                        updatedAt: serverTimestamp(),
                        updatedByUid: user.uid,
                        updatedByName: submitterName,
                        ...(block ? {} : { createdAt: serverTimestamp(), startsOnNewPage: false }),
                    },
                    { merge: true },
                );
            }

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
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
            {/* Editor card — 3 cols. NAVY dark band header per the Document Templates aesthetic (1.8.9). */}
            <div className="xl:col-span-3 rounded-[1.5rem] overflow-hidden border-2 shadow-sm bg-white flex flex-col">
                {/* Dark band header */}
                <div className="px-6 py-5 bg-slate-900 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-2xl bg-blue-500/20 flex items-center justify-center shrink-0">
                            <ScrollText className="h-5 w-5 text-blue-300" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-base font-black uppercase tracking-tight text-white truncate">
                                {BLOCK_TYPE_LABEL[blockType]}
                            </h3>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">
                                {hasContentInCurrentSurface ? 'Has content' : 'Empty'} · {DOCUMENT_TYPE_LABEL[documentType]} tab
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {block && (
                            <Button size="sm" variant="ghost" onClick={() => setHistoryOpen(true)} className="gap-1.5 text-white/90 hover:bg-white/10 hover:text-white text-xs">
                                <History className="h-3.5 w-3.5" />
                                History
                            </Button>
                        )}
                        {!editMode && (
                            <Button size="sm" onClick={startEdit} className="gap-1.5 bg-white text-slate-900 hover:bg-slate-100 text-xs">
                                <Pencil className="h-3.5 w-3.5" />
                                {hasContentInCurrentSurface ? 'Edit' : 'Add content'}
                            </Button>
                        )}
                    </div>
                </div>

                {/* Brand-override picker */}
                <div className="px-6 py-3 border-b bg-slate-50/40">
                    <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-[11px] font-medium text-slate-600 shrink-0 inline-flex items-center gap-1.5">
                            {selectedBrand ? <Building2 className="h-3 w-3" /> : <Globe2 className="h-3 w-3" />}
                            Editing for
                        </span>
                        <div className="flex-1 min-w-[200px] max-w-[260px]">
                            <BrandOverridePicker
                                enabledModuleSubscriptions={enabledModuleSubscriptions}
                                value={selectedBrand}
                                onChange={setSelectedBrand}
                                disabled={editMode || saving}
                            />
                        </div>
                        {selectedBrand && !overrideDoc && (
                            <span className="text-[10px] text-slate-500 italic">
                                No override yet — pre-filled with org-default
                            </span>
                        )}
                    </div>
                </div>

                {/* Metadata strip */}
                {(block || overrideDoc) && !editMode && (
                    <div className="px-6 py-2.5 border-b bg-slate-50/60 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
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

                {/* Body — scrollable section per 1.8.9 */}
                <div className="px-6 py-5 max-h-[60vh] overflow-y-auto bg-slate-50/30">
                    {editMode ? (
                        <div className="space-y-4">
                            <FeatureRichTextEditor
                                value={draftHtml}
                                onChange={setDraftHtml}
                                placeholder={selectedBrand
                                    ? `Write the brand-specific version of ${BLOCK_TYPE_LABEL[blockType]}.`
                                    : `Write the ${BLOCK_TYPE_LABEL[blockType]} content. This is what your customers will read on the ${DOCUMENT_TYPE_LABEL[documentType]} PDF.`
                                }
                            />

                            {/* 1.8.6 — documentTypes chip multi-select. Hidden in brand-override
                                mode because doc-type membership is parent-block scope, not per-brand. */}
                            {!selectedBrand && (
                                <div className="space-y-2 pt-1">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                        Appears on
                                    </p>
                                    <div className="flex items-center gap-2">
                                        {DOCUMENT_TYPES.map(t => {
                                            const active = draftDocTypes.includes(t);
                                            return (
                                                <button
                                                    key={t}
                                                    type="button"
                                                    onClick={() => toggleDocType(t)}
                                                    className={cn(
                                                        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 text-xs font-medium transition-colors',
                                                        active
                                                            ? 'bg-blue-50 text-blue-700 border-blue-300'
                                                            : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300',
                                                    )}
                                                >
                                                    {active && <Check className="h-3 w-3" />}
                                                    {DOCUMENT_TYPE_LABEL[t]}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <p className="text-[10px] text-slate-400">
                                        Tag this block for one or both document types. Selected = renders on that PDF.
                                    </p>
                                </div>
                            )}

                            <div className="flex items-center justify-end gap-2 pt-3 border-t">
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
                        <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400 border-2 border-dashed rounded-lg bg-white">
                            <FileText className="h-8 w-8 mb-3" />
                            <p className="text-sm font-medium text-slate-500">No content yet</p>
                            <p className="text-[11px] mt-1 max-w-xs">
                                Click <strong>Add content</strong> to write this block. It won&apos;t render on the customer PDF until you save content.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Right panel — 2 cols. Tabbed: Preview (1.8.7) is primary, Info is secondary. */}
            <div className="xl:col-span-2">
                <Tabs defaultValue="preview" className="space-y-3">
                    <TabsList className="grid grid-cols-2">
                        <TabsTrigger value="preview" className="gap-1.5 text-xs">
                            <Eye className="h-3.5 w-3.5" />
                            PDF Preview
                        </TabsTrigger>
                        <TabsTrigger value="info" className="gap-1.5 text-xs">
                            <Info className="h-3.5 w-3.5" />
                            Info
                        </TabsTrigger>
                    </TabsList>

                    {/* 1.8.7 — Live PDF preview. Renders all 7 sections in their PDF
                        positions using saved Firestore state. Re-renders on Save. */}
                    <TabsContent value="preview">
                        <div className="rounded-[1.5rem] overflow-hidden border-2 shadow-sm bg-white">
                            <div className="px-4 py-3 border-b bg-muted/5">
                                <div className="flex items-center gap-2">
                                    <Eye className="h-3.5 w-3.5 text-blue-600" />
                                    <p className="text-[11px] font-black uppercase tracking-widest">{DOCUMENT_TYPE_LABEL[documentType]} PDF preview</p>
                                </div>
                                <p className="text-[10px] text-slate-500 mt-0.5">All sections in render order. Empty blocks shown as placeholders.</p>
                            </div>
                            <div className="p-3">
                                <ContentBlocksPdfPreview
                                    blocks={allBlocks}
                                    documentType={documentType}
                                    organisationName={organisationName ?? undefined}
                                    primaryLogoUrl={primaryLogoUrl}
                                    secondaryLogoUrl={secondaryLogoUrl}
                                />
                            </div>
                        </div>
                    </TabsContent>

                    {/* About this section + Where this appears (was the default right-side
                        content in pre-1.8.7; now lives behind the Info tab). */}
                    <TabsContent value="info" className="space-y-4">
                        <div className="rounded-[1.5rem] overflow-hidden border-2 shadow-sm bg-white">
                            <div className="px-5 py-4 border-b bg-muted/5">
                                <div className="flex items-center gap-2">
                                    <ScrollText className="h-4 w-4 text-blue-600" />
                                    <p className="text-xs font-black uppercase tracking-widest">About this section</p>
                                </div>
                            </div>
                            <div className="p-5 space-y-3 text-xs text-slate-600 leading-relaxed">
                                <p>{BLOCK_TYPE_HELP[blockType]}</p>
                            </div>
                        </div>

                        <div className="rounded-[1.5rem] overflow-hidden border-2 shadow-sm bg-blue-50/40 border-blue-200">
                            <div className="p-5 space-y-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Where this appears</p>
                                <ul className="space-y-2">
                                    {getBlockDocumentTypes(block).map(t => (
                                        <li key={t} className="flex items-start gap-2">
                                            <Check className="h-3 w-3 text-blue-700 mt-0.5 shrink-0" />
                                            <span className="text-[11px] font-bold text-slate-700">
                                                {DOCUMENT_TYPE_LABEL[t]} PDF — {BLOCK_TYPE_LABEL[blockType]} section
                                            </span>
                                        </li>
                                    ))}
                                    {selectedBrand ? (
                                        <li className="flex items-start gap-2">
                                            <Check className="h-3 w-3 text-blue-700 mt-0.5 shrink-0" />
                                            <span className="text-[11px] font-bold text-slate-700">
                                                Brand override active for <code className="bg-blue-100 rounded px-1">{selectedBrand}</code>
                                            </span>
                                        </li>
                                    ) : (
                                        <li className="flex items-start gap-2">
                                            <Check className="h-3 w-3 text-blue-700 mt-0.5 shrink-0" />
                                            <span className="text-[11px] font-bold text-slate-700">
                                                Org-default content (applies when no brand override matches)
                                            </span>
                                        </li>
                                    )}
                                    {block ? (
                                        <li className="flex items-start gap-2">
                                            <Check className="h-3 w-3 text-blue-700 mt-0.5 shrink-0" />
                                            <span className="text-[11px] font-bold text-slate-700">
                                                Versions captured on every save (restore via History)
                                            </span>
                                        </li>
                                    ) : null}
                                </ul>
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>

                {!editMode && hasContentInCurrentSurface && (
                    <Badge variant="secondary" className="text-[10px] bg-blue-100 text-blue-700 border-blue-200">
                        ✓ Has content — will render on the {DOCUMENT_TYPE_LABEL[documentType]} PDF
                    </Badge>
                )}
            </div>

            <VersionHistoryDrawer
                open={historyOpen}
                onOpenChange={setHistoryOpen}
                orgId={orgId}
                blockId={block?.id ?? null}
                onRestore={handleRestore}
            />
        </div>
    );
}

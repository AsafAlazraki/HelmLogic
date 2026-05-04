'use client';

/**
 * Version History Drawer (v1.7 — story 1.8.1, Phase C).
 *
 * Right-side Sheet that lists every saved version of a content
 * block (default + brand overrides interleaved). Click a row to
 * preview that version's HTML; click "Restore this version" to
 * roll the live block (or current brand override) back to it.
 *
 * Restore is implemented as "save the chosen version's html as
 * the latest version" — no destructive history rewrite. The
 * restored content becomes a new version on top, so undo is
 * always one more click away.
 */

import { useMemo, useState } from 'react';
import {
    collection,
    orderBy,
    query,
} from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowUpFromLine, History, Loader2, Tag, User } from 'lucide-react';
import type { ContentBlockVersion } from '@/lib/content-blocks';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    orgId: string;
    blockId: string | null;
    onRestore: (html: string) => Promise<void>;
}

export function VersionHistoryDrawer({ open, onOpenChange, orgId, blockId, onRestore }: Props) {
    const firestore = useFirestore();

    const versionsRef = useMemoFirebase(
        () => (blockId
            ? query(
                collection(firestore, `organisations/${orgId}/contentBlocks/${blockId}/versions`),
                orderBy('savedAt', 'desc'),
            )
            : null),
        [firestore, orgId, blockId],
    );
    const { data: versions, loading } = useCollection<ContentBlockVersion>(versionsRef);

    const [previewId, setPreviewId] = useState<string | null>(null);
    const [restoring, setRestoring] = useState(false);

    const previewVersion = useMemo(
        () => (versions ?? []).find(v => v.id === previewId) ?? null,
        [versions, previewId],
    );

    async function handleRestore(version: ContentBlockVersion) {
        setRestoring(true);
        try {
            await onRestore(version.html);
            onOpenChange(false);
            setPreviewId(null);
        } finally {
            setRestoring(false);
        }
    }

    return (
        <Sheet open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setPreviewId(null); }}>
            <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col">
                <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                        <History className="h-4 w-4" />
                        Version history
                    </SheetTitle>
                    <SheetDescription>
                        Every save (default content + per-brand overrides) is captured here. Click a version to preview, then restore if you want to roll back.
                    </SheetDescription>
                </SheetHeader>

                <div className="flex-1 min-h-0 grid grid-cols-[260px,1fr] gap-3 mt-4 overflow-hidden">
                    {/* Versions list */}
                    <div className="border rounded-lg overflow-y-auto">
                        {loading ? (
                            <div className="flex items-center justify-center py-8 text-slate-400">
                                <Loader2 className="h-4 w-4 animate-spin" />
                            </div>
                        ) : (versions ?? []).length === 0 ? (
                            <div className="p-4 text-xs text-slate-500 text-center">
                                No saved versions yet. The first save creates an entry here.
                            </div>
                        ) : (
                            <ul className="divide-y">
                                {(versions ?? []).map(v => {
                                    const ts = v.savedAt?.toDate?.();
                                    const tsLabel = ts ? `${ts.toLocaleDateString()} · ${ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '—';
                                    const isPreview = v.id === previewId;
                                    const isBrand = v.level && v.level.startsWith('brand:');
                                    return (
                                        <li key={v.id}>
                                            <button
                                                type="button"
                                                onClick={() => setPreviewId(v.id)}
                                                className={`w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors text-xs ${isPreview ? 'bg-blue-50/60 hover:bg-blue-50/60' : ''}`}
                                            >
                                                <div className="flex items-center gap-1.5 mb-1">
                                                    <User className="h-3 w-3 text-slate-400" />
                                                    <span className="font-medium text-slate-700 truncate">{v.savedByName ?? 'Unknown'}</span>
                                                </div>
                                                <p className="text-[11px] text-slate-500">{tsLabel}</p>
                                                {v.level && (
                                                    <Badge variant="outline" className="mt-1 text-[9px] px-1.5 py-0 h-4">
                                                        <Tag className="h-2.5 w-2.5 mr-1" />
                                                        {isBrand ? `Brand: ${v.level.slice('brand:'.length)}` : 'Default'}
                                                    </Badge>
                                                )}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>

                    {/* Preview pane */}
                    <div className="border rounded-lg overflow-y-auto">
                        {previewVersion ? (
                            <div className="p-4 space-y-4">
                                <article
                                    className="prose prose-sm max-w-none text-slate-700 [&_p]:my-2 [&_h2]:text-base [&_h3]:text-sm"
                                    dangerouslySetInnerHTML={{ __html: previewVersion.html || '<em class="text-slate-400">(empty)</em>' }}
                                />
                                <div className="pt-3 border-t">
                                    <Button
                                        size="sm"
                                        onClick={() => handleRestore(previewVersion)}
                                        disabled={restoring}
                                        className="gap-1.5"
                                    >
                                        {restoring ? (
                                            <>
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                Restoring…
                                            </>
                                        ) : (
                                            <>
                                                <ArrowUpFromLine className="h-3.5 w-3.5" />
                                                Restore this version
                                            </>
                                        )}
                                    </Button>
                                    <p className="text-[11px] text-slate-500 mt-2">
                                        Restoring saves this version&apos;s content as a new entry on top — your current content stays in history.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-full text-xs text-slate-400 p-6 text-center">
                                Select a version on the left to preview its content.
                            </div>
                        )}
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}

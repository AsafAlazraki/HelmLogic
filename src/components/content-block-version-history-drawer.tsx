'use client';

/**
 * Version History Drawer (v1.7 — story 1.8.1, Phase C; v1.8 — story 1.8.3 polish).
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
 *
 * v1.8 (1.8.3) polish:
 *   - Relative timestamp labels ("2 days ago") next to the absolute
 *     date so the list scans faster.
 *   - Compare mode: a Compare toggle in the preview pane swaps the
 *     single preview for a two-column side-by-side (live current
 *     content on the left, selected version on the right) so authors
 *     can see exactly what would change before clicking Restore.
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
import { ArrowUpFromLine, Columns2, History, Loader2, Tag, User } from 'lucide-react';
import type { ContentBlockVersion } from '@/lib/content-blocks';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    orgId: string;
    blockId: string | null;
    /** v1.8 (1.8.3) — live current html of the block so the Compare
     *  view can render "before vs after" without re-fetching. Falls
     *  back gracefully to an empty string. */
    currentHtml?: string | null;
    onRestore: (html: string) => Promise<void>;
}

/** "5 minutes ago", "2 days ago" — coarse buckets only, good enough
 *  for a history-list scan. Returns null for missing dates. */
function relativeTime(ts: Date | null | undefined): string | null {
    if (!ts) return null;
    const diff = Date.now() - ts.getTime();
    if (diff < 0) return 'just now';
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} min ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
    const days = Math.floor(hr / 24);
    if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
    return `${Math.floor(months / 12)} year${Math.floor(months / 12) === 1 ? '' : 's'} ago`;
}

export function VersionHistoryDrawer({ open, onOpenChange, orgId, blockId, currentHtml, onRestore }: Props) {
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
    /** v1.8 (1.8.3) — toggle for side-by-side compare against live current html. */
    const [compareMode, setCompareMode] = useState(false);

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
                                {(versions ?? []).map((v, i) => {
                                    const ts = v.savedAt?.toDate?.();
                                    const tsLabel = ts ? `${ts.toLocaleDateString()} · ${ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '—';
                                    const rel = relativeTime(ts);
                                    const isPreview = v.id === previewId;
                                    const isBrand = v.level && v.level.startsWith('brand:');
                                    const isLatest = i === 0;
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
                                                    {isLatest && (
                                                        <Badge className="ml-auto h-4 text-[8px] px-1.5 bg-emerald-100 text-emerald-700 border-emerald-200">
                                                            Latest
                                                        </Badge>
                                                    )}
                                                </div>
                                                <p className="text-[11px] text-slate-500">{tsLabel}</p>
                                                {rel && (
                                                    <p className="text-[10px] text-slate-400">{rel}</p>
                                                )}
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

                    {/* Preview pane (1.8.3 — adds Compare toggle + side-by-side). */}
                    <div className="border rounded-lg overflow-y-auto">
                        {previewVersion ? (
                            <div className="p-4 space-y-4">
                                {/* Compare toggle. Only meaningful when we have
                                    live current html AND it differs from the
                                    selected version (no point comparing "current
                                    against itself" on the latest entry). */}
                                {currentHtml != null && currentHtml !== previewVersion.html && (
                                    <div className="flex items-center justify-end -mt-1 -mr-1">
                                        <Button
                                            size="sm"
                                            variant={compareMode ? 'default' : 'outline'}
                                            onClick={() => setCompareMode(v => !v)}
                                            className="gap-1.5 h-7 px-2.5 text-[11px]"
                                        >
                                            <Columns2 className="h-3 w-3" />
                                            {compareMode ? 'Hide compare' : 'Compare with current'}
                                        </Button>
                                    </div>
                                )}

                                {compareMode && currentHtml != null ? (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="border rounded-md p-3 bg-emerald-50/40">
                                            <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700 mb-2">Current (live)</p>
                                            <article
                                                className="prose prose-sm max-w-none text-slate-700 [&_p]:my-2 [&_h2]:text-base [&_h3]:text-sm"
                                                dangerouslySetInnerHTML={{ __html: currentHtml || '<em class="text-slate-400">(empty)</em>' }}
                                            />
                                        </div>
                                        <div className="border rounded-md p-3 bg-blue-50/40">
                                            <p className="text-[9px] font-black uppercase tracking-widest text-blue-700 mb-2">Selected version</p>
                                            <article
                                                className="prose prose-sm max-w-none text-slate-700 [&_p]:my-2 [&_h2]:text-base [&_h3]:text-sm"
                                                dangerouslySetInnerHTML={{ __html: previewVersion.html || '<em class="text-slate-400">(empty)</em>' }}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <article
                                        className="prose prose-sm max-w-none text-slate-700 [&_p]:my-2 [&_h2]:text-base [&_h3]:text-sm"
                                        dangerouslySetInnerHTML={{ __html: previewVersion.html || '<em class="text-slate-400">(empty)</em>' }}
                                    />
                                )}

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

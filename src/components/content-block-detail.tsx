'use client';

/**
 * Content Block Detail (right panel of the Quote Content Manager).
 *
 * Phase B: shows the selected block's metadata + read-only HTML
 * preview + an "Edit" button that's disabled until Phase C lands
 * the TipTap editor. Lets the operator verify auto-migration ran
 * correctly before any editing flows are wired.
 *
 * Phase C will replace the Edit button with the actual editor
 * (mounted inline below, save-on-blur + version history drawer).
 *
 * Phase D will add a brand-override picker above the editor.
 */

import { CalendarDays, FileText, Lock, Pencil, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    BLOCK_TYPE_HELP,
    BLOCK_TYPE_LABEL,
    type BlockType,
    type ContentBlock,
} from '@/lib/content-blocks';
import { cn } from '@/lib/utils';

interface Props {
    blockType: BlockType;
    block: ContentBlock | undefined;
}

export function ContentBlockDetail({ blockType, block }: Props) {
    const hasContent = !!(block?.html && block.html.trim());
    const formattedUpdatedAt = block?.updatedAt?.toDate?.().toLocaleString?.() ?? null;

    return (
        <div className="rounded-xl border bg-white overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <h3 className="text-base font-semibold text-slate-800">
                                {BLOCK_TYPE_LABEL[blockType]}
                            </h3>
                            {hasContent ? (
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
                    <Button size="sm" variant="outline" disabled className="gap-1.5 shrink-0">
                        <Lock className="h-3.5 w-3.5" />
                        Edit (Phase C)
                    </Button>
                </div>
            </div>

            {/* Metadata strip */}
            {block && (
                <div className="px-5 py-2.5 border-b bg-slate-50/60 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                    {formattedUpdatedAt && (
                        <span className="inline-flex items-center gap-1.5">
                            <CalendarDays className="h-3 w-3" />
                            Updated {formattedUpdatedAt}
                        </span>
                    )}
                    {block.updatedByName && (
                        <span className="inline-flex items-center gap-1.5">
                            <User className="h-3 w-3" />
                            {block.updatedByName}
                        </span>
                    )}
                </div>
            )}

            {/* Body — read-only HTML preview, or empty-state */}
            <div className="px-5 py-5">
                {hasContent ? (
                    <article
                        className={cn(
                            'prose prose-sm max-w-none text-slate-700',
                            '[&_p]:my-2 [&_h2]:text-base [&_h3]:text-sm',
                        )}
                        dangerouslySetInnerHTML={{ __html: block!.html }}
                    />
                ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400 border-2 border-dashed rounded-lg">
                        <FileText className="h-8 w-8 mb-3" />
                        <p className="text-sm font-medium text-slate-500">No content yet</p>
                        <p className="text-[11px] mt-1 max-w-xs">
                            Phase C will add a TipTap editor here. For now, this block won&apos;t render on the customer PDF.
                        </p>
                    </div>
                )}
            </div>

            {/* Footer hint */}
            <div className="px-5 py-2.5 border-t bg-slate-50/60 text-[10px] text-slate-500 flex items-center gap-1.5">
                <Pencil className="h-3 w-3" />
                Editing wired in Phase C · Per-brand overrides land in Phase D
            </div>
        </div>
    );
}

'use client';

/**
 * Content Block List (left panel of the Quote Content Manager).
 *
 * Renders all 7 fixed block types in PDF order. Each row shows:
 *   - Block name + help-text tooltip
 *   - Status indicator: 🔘 (no doc yet) · ✏️ (has content) · 🎨 (has overrides — Phase D)
 *   - Active state when selected
 *
 * Click a row → parent updates `selectedBlockType` → right panel
 * shows that block's content / editor.
 */

import { CircleDashed, FileEdit, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    BLOCK_TYPES,
    BLOCK_TYPE_LABEL,
    BLOCK_TYPE_HELP,
    type BlockType,
    type ContentBlock,
} from '@/lib/content-blocks';

interface Props {
    selectedBlockType: BlockType;
    onSelect: (t: BlockType) => void;
    blockByType: Map<string, ContentBlock>;
    loading: boolean;
}

export function ContentBlockList({ selectedBlockType, onSelect, blockByType, loading }: Props) {
    return (
        <div className="rounded-xl border bg-white overflow-hidden">
            <div className="px-4 py-3 border-b bg-slate-50">
                <h3 className="text-sm font-semibold text-slate-700">Content Blocks</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">7 sections of the customer-facing PDF</p>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-12 text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                </div>
            ) : (
                <ul className="divide-y">
                    {BLOCK_TYPES.map(t => {
                        const block = blockByType.get(t);
                        const hasContent = !!(block?.html && block.html.trim());
                        const isSelected = t === selectedBlockType;
                        return (
                            <li key={t}>
                                <button
                                    type="button"
                                    onClick={() => onSelect(t)}
                                    className={cn(
                                        'w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-start gap-3',
                                        isSelected && 'bg-blue-50/60 hover:bg-blue-50/60',
                                    )}
                                >
                                    <span className="mt-0.5 shrink-0" aria-hidden>
                                        {hasContent ? (
                                            <FileEdit className="h-3.5 w-3.5 text-blue-600" />
                                        ) : (
                                            <CircleDashed className="h-3.5 w-3.5 text-slate-300" />
                                        )}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className={cn(
                                            'text-sm font-medium truncate',
                                            isSelected ? 'text-blue-900' : 'text-slate-700',
                                        )}>
                                            {BLOCK_TYPE_LABEL[t]}
                                        </p>
                                        <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                                            {hasContent ? 'Customised' : 'Not yet authored'}
                                        </p>
                                    </div>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}

            <div className="px-4 py-2.5 border-t bg-slate-50/60 text-[10px] text-slate-500">
                {BLOCK_TYPES.filter(t => blockByType.get(t)?.html?.trim()).length} of {BLOCK_TYPES.length} authored
            </div>
        </div>
    );
}

'use client';

/**
 * PDF Section List (v1.7 — story 1.8.11).
 *
 * Replaces content-block-list. Master list of EVERY section that
 * appears on the customer PDF — content blocks AND system sections
 * (Cover, Vessel Configuration, Pricing, Signatures). All draggable
 * (except anchored cover + signatures, which show a lock icon).
 *
 * Click behaviour:
 *   - Content row → opens that block in the editor (existing UX)
 *   - System row → click is a no-op; row shows a help tooltip
 *
 * Drag behaviour: @dnd-kit Pointer-sensor with 5px activation
 * distance (matches the v1.5 Kanban / Feature-Tracking patterns
 * for drag-vs-click separation).
 */

import { useMemo } from 'react';
import {
    DndContext,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CircleDashed, FileEdit, GripVertical, Loader2, Lock, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    BLOCK_TYPE_LABEL,
    type BlockType,
    type ContentBlock,
} from '@/lib/content-blocks';
import {
    SYSTEM_SECTION_LABEL,
    isAnchored,
    type PdfStructureSection,
    type SystemSectionKey,
} from '@/lib/pdf-structure';

interface Props {
    sections: PdfStructureSection[];
    selectedBlockType: BlockType;
    onSelectContentBlock: (t: BlockType) => void;
    /** Map blockType → existing doc (or undefined for un-authored). */
    blockByType: Map<string, ContentBlock>;
    onReorder: (sectionId: string, newOrder: number) => void;
    loading: boolean;
}

export function PdfSectionList({
    sections,
    selectedBlockType,
    onSelectContentBlock,
    blockByType,
    onReorder,
    loading,
}: Props) {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    );

    const sortableIds = useMemo(() => sections.map(s => s.id), [sections]);

    function handleDragEnd(e: DragEndEvent) {
        const { active, over } = e;
        if (!over || active.id === over.id) return;
        if (isAnchored(String(active.id))) return; // can't move cover or signatures

        const activeIdx = sections.findIndex(s => s.id === active.id);
        const overIdx = sections.findIndex(s => s.id === over.id);
        if (activeIdx === -1 || overIdx === -1) return;

        // Compute fractional index between the new neighbours.
        // Filter out the moving section to find prev/next at the drop position.
        const without = sections.filter(s => s.id !== active.id);
        const insertAt = overIdx > activeIdx ? overIdx : overIdx;
        // We want the moving item to land at the slot occupied by `over`,
        // so prev = item just before insertAt, next = item at insertAt.
        const prev = without[insertAt - 1] ?? null;
        const next = without[insertAt] ?? null;

        // Skip if dropping next to anchors that would break ordering.
        if (next?.id === 'system:cover-page') return;
        if (prev?.id === 'system:signatures') return;

        const prevOrder = prev?.order ?? null;
        const nextOrder = next?.order ?? null;
        const newOrder =
            prevOrder == null && nextOrder != null ? nextOrder - 10 :
            nextOrder == null && prevOrder != null ? prevOrder + 10 :
            prevOrder != null && nextOrder != null ? (prevOrder + nextOrder) / 2 :
            100;

        onReorder(String(active.id), newOrder);
    }

    return (
        <div className="rounded-xl border bg-white overflow-hidden">
            <div className="px-4 py-3 border-b bg-slate-50">
                <h3 className="text-sm font-semibold text-slate-700">PDF Sections</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Drag to reorder · system rows are anchored visually</p>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-12 text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                </div>
            ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                        <ul className="divide-y">
                            {sections.map(s => (
                                <SectionRow
                                    key={s.id}
                                    section={s}
                                    selectedBlockType={selectedBlockType}
                                    onSelectContentBlock={onSelectContentBlock}
                                    blockByType={blockByType}
                                />
                            ))}
                        </ul>
                    </SortableContext>
                </DndContext>
            )}

            <div className="px-4 py-2.5 border-t bg-slate-50/60 text-[10px] text-slate-500">
                {sections.filter(s => s.type === 'content' && blockByType.get(s.key)?.html?.trim()).length} of 7 content blocks have content · {sections.filter(s => s.type === 'system').length} system sections
            </div>
        </div>
    );
}

/* ──────────────────────────────────────────────────────────────────
 * Row — sortable, content + system variants
 * ────────────────────────────────────────────────────────────────── */

function SectionRow({ section, selectedBlockType, onSelectContentBlock, blockByType }: {
    section: PdfStructureSection;
    selectedBlockType: BlockType;
    onSelectContentBlock: (t: BlockType) => void;
    blockByType: Map<string, ContentBlock>;
}) {
    const anchored = isAnchored(section.id);
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: section.id,
        disabled: anchored,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    if (section.type === 'content') {
        const blockType = section.key as BlockType;
        const block = blockByType.get(blockType);
        const hasContent = !!(block?.html && block.html.trim());
        const isSelected = blockType === selectedBlockType;
        // v1.33 (Bill: "Drag to reorder not working, each section is locked")
        // — the drag listeners used to live ONLY on the 14px grip icon, so
        // grabbing the row body (what everyone naturally does) did nothing
        // and read as locked. Whole row now drags; the 5px activation
        // distance keeps plain clicks opening the editor (v1.5 Kanban
        // pattern).
        return (
            <li ref={setNodeRef} style={style} {...listeners} {...attributes} className={cn('flex items-stretch group', isDragging && 'shadow-lg', !anchored && 'cursor-grab active:cursor-grabbing')}>
                <DragHandle anchored={anchored} listeners={listeners} attributes={attributes} />
                <button
                    type="button"
                    onClick={() => onSelectContentBlock(blockType)}
                    className={cn(
                        'flex-1 text-left px-2 py-3 hover:bg-slate-50 transition-colors flex items-start gap-3',
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
                        <p className={cn('text-sm font-medium truncate', isSelected ? 'text-blue-900' : 'text-slate-700')}>
                            {BLOCK_TYPE_LABEL[blockType]}
                        </p>
                        <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                            {hasContent ? 'Has content' : 'Empty'}
                        </p>
                    </div>
                </button>
            </li>
        );
    }

    // System row — non-clickable, draggable (unless anchored)
    const systemKey = section.key as SystemSectionKey;
    return (
        <li ref={setNodeRef} style={style} {...listeners} {...attributes} className={cn('flex items-stretch bg-slate-50/40', isDragging && 'shadow-lg', !anchored && 'cursor-grab active:cursor-grabbing')}>
            <DragHandle anchored={anchored} listeners={listeners} attributes={attributes} />
            <div className="flex-1 px-2 py-3 flex items-start gap-3">
                <span className="mt-0.5 shrink-0" aria-hidden>
                    <Settings className="h-3.5 w-3.5 text-slate-400" />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-700 truncate flex items-center gap-1.5">
                        {SYSTEM_SECTION_LABEL[systemKey]}
                        {anchored && <Lock className="h-3 w-3 text-slate-400" />}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                        {anchored ? 'System section · anchored position' : 'System section · drag to reorder'}
                    </p>
                </div>
            </div>
        </li>
    );
}

function DragHandle({ anchored, listeners, attributes }: { anchored: boolean; listeners: any; attributes: any }) {
    if (anchored) {
        return (
            <span className="flex items-center justify-center w-6 shrink-0 text-slate-300 cursor-not-allowed" title="Anchored position">
                <Lock className="h-3 w-3" />
            </span>
        );
    }
    return (
        <button
            type="button"
            {...listeners}
            {...attributes}
            className="flex items-center justify-center w-6 shrink-0 text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing"
            aria-label="Drag to reorder"
        >
            <GripVertical className="h-3.5 w-3.5" />
        </button>
    );
}

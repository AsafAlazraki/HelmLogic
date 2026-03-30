'use client';

import { useState, useMemo } from 'react';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useDoc } from '@/firebase/firestore/use-doc';
import {
    collection, doc, addDoc, updateDoc, deleteDoc,
    query, where, serverTimestamp,
} from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import {
    Plus, Trash2, Pencil, ChevronRight, ChevronDown, TableIcon,
    PlusCircle, X, Check, Ship, Package, Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';

interface Column { id: string; header: string; }
interface Row {
    variantId: string;
    modelId: string;
    modelName: string;
    rangeId: string;
    rangeName: string;
    material: string;
    colorName: string;
    colorCode?: string;
    imageUrl?: string;
    cells: Record<string, string>;
}
interface PriceList {
    id: string;
    name: string;
    subDealerIds: string[];
    columns: Column[];
    rows: Row[];
    createdAt?: any;
}

// ─── Boat Picker Dialog ────────────────────────────────────────────────────────

function BoatPickerDialog({
    isOpen,
    onClose,
    vendorId,
    existingVariantIds,
    onAdd,
}: {
    isOpen: boolean;
    onClose: () => void;
    vendorId: string;
    existingVariantIds: Set<string>;
    onAdd: (rows: Omit<Row, 'cells'>[]) => void;
}) {
    const firestore = useFirestore();
    const [selectedRangeId, setSelectedRangeId] = useState<string | null>(null);
    const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
    const [pendingRows, setPendingRows] = useState<Omit<Row, 'cells'>[]>([]);

    const rangesQuery = useMemoFirebase(
        () => vendorId ? collection(firestore, `data-warehouse/${vendorId}/ranges`) : null,
        [firestore, vendorId]
    );
    const { data: ranges } = useCollection<any>(rangesQuery);

    const modelsQuery = useMemoFirebase(
        () => selectedRangeId ? collection(firestore, `data-warehouse/${vendorId}/ranges/${selectedRangeId}/models`) : null,
        [firestore, vendorId, selectedRangeId]
    );
    const { data: models } = useCollection<any>(modelsQuery);

    const variantsQuery = useMemoFirebase(
        () => selectedModelId && selectedRangeId
            ? collection(firestore, `data-warehouse/${vendorId}/ranges/${selectedRangeId}/models/${selectedModelId}/variants`)
            : null,
        [firestore, vendorId, selectedRangeId, selectedModelId]
    );
    const { data: variants } = useCollection<any>(variantsQuery);

    const selectedModel = models?.find((m: any) => m.id === selectedModelId);
    const selectedRange = ranges?.find((r: any) => r.id === selectedRangeId);

    // Select All: add all non-existing variants for the current model
    const selectableVariants = useMemo(() =>
        (variants || []).filter((v: any) => !existingVariantIds.has(v.id)),
    [variants, existingVariantIds]);

    const allSelectableSelected = selectableVariants.length > 0 &&
        selectableVariants.every((v: any) => pendingRows.some(r => r.variantId === v.id));

    const toggleSelectAll = () => {
        if (allSelectableSelected) {
            // Deselect all variants for this model
            const variantIds = new Set(selectableVariants.map((v: any) => v.id));
            setPendingRows(prev => prev.filter(r => !variantIds.has(r.variantId)));
        } else {
            // Add all selectable variants not already pending
            const alreadyPending = new Set(pendingRows.map(r => r.variantId));
            const toAdd = selectableVariants
                .filter((v: any) => !alreadyPending.has(v.id))
                .map((v: any) => ({
                    variantId: v.id,
                    modelId: selectedModelId!,
                    modelName: selectedModel?.name || '',
                    rangeId: selectedRangeId!,
                    rangeName: selectedRange?.name || '',
                    material: v.material || '',
                    colorName: v.colorName || '',
                    colorCode: v.colorCode || '',
                    imageUrl: v.imageUrl || selectedModel?.coverImageUrl || '',
                }));
            setPendingRows(prev => [...prev, ...toAdd]);
        }
    };

    const toggleVariant = (variant: any) => {
        const already = pendingRows.find(r => r.variantId === variant.id);
        if (already) {
            setPendingRows(prev => prev.filter(r => r.variantId !== variant.id));
        } else {
            setPendingRows(prev => [...prev, {
                variantId: variant.id,
                modelId: selectedModelId!,
                modelName: selectedModel?.name || '',
                rangeId: selectedRangeId!,
                rangeName: selectedRange?.name || '',
                material: variant.material || '',
                colorName: variant.colorName || '',
                colorCode: variant.colorCode || '',
                imageUrl: variant.imageUrl || selectedModel?.coverImageUrl || '',
            }]);
        }
    };

    const handleConfirm = () => {
        onAdd(pendingRows);
        setPendingRows([]);
        setSelectedRangeId(null);
        setSelectedModelId(null);
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={v => { if (!v) onClose(); }}>
            <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col gap-0 p-0 overflow-hidden rounded-3xl">
                <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
                    <DialogTitle className="font-black uppercase tracking-tight text-lg">Add Boats to Price List</DialogTitle>
                </DialogHeader>

                <div className="flex flex-1 min-h-0 overflow-hidden">
                    {/* Ranges */}
                    <div className="w-44 border-r overflow-y-auto shrink-0 bg-slate-50">
                        <p className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400 border-b">Range</p>
                        {(ranges || []).map((r: any) => (
                            <button
                                key={r.id}
                                onClick={() => { setSelectedRangeId(r.id); setSelectedModelId(null); }}
                                className={cn(
                                    'w-full text-left px-4 py-2.5 text-[11px] font-bold transition-colors',
                                    selectedRangeId === r.id ? 'bg-primary text-white' : 'hover:bg-slate-100 text-slate-700'
                                )}
                            >
                                {r.name}
                            </button>
                        ))}
                    </div>

                    {/* Models */}
                    <div className="w-48 border-r overflow-y-auto shrink-0">
                        <p className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400 border-b bg-slate-50">Model</p>
                        {selectedRangeId ? (models || []).map((m: any) => (
                            <button
                                key={m.id}
                                onClick={() => setSelectedModelId(m.id)}
                                className={cn(
                                    'w-full text-left px-4 py-2.5 text-[11px] font-bold transition-colors',
                                    selectedModelId === m.id ? 'bg-primary text-white' : 'hover:bg-slate-100 text-slate-700'
                                )}
                            >
                                {m.name}
                            </button>
                        )) : (
                            <p className="px-4 py-4 text-[10px] text-slate-400">Select a range first</p>
                        )}
                    </div>

                    {/* Variants */}
                    <div className="flex-1 overflow-y-auto p-4">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">SKUs — select to add</p>
                            {selectedModelId && selectableVariants.length > 0 && (
                                <button
                                    onClick={toggleSelectAll}
                                    className={cn(
                                        'flex items-center gap-1.5 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors',
                                        allSelectableSelected
                                            ? 'bg-primary/10 text-primary'
                                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                    )}
                                >
                                    {allSelectableSelected ? <Check className="h-3 w-3" /> : <PlusCircle className="h-3 w-3" />}
                                    {allSelectableSelected ? 'Deselect All' : 'Select All'}
                                </button>
                            )}
                        </div>
                        {selectedModelId ? (
                            <div className="grid grid-cols-2 gap-3">
                                {(variants || []).map((v: any) => {
                                    const alreadyInList = existingVariantIds.has(v.id);
                                    const isPending = pendingRows.some(r => r.variantId === v.id);
                                    return (
                                        <button
                                            key={v.id}
                                            disabled={alreadyInList}
                                            onClick={() => toggleVariant(v)}
                                            className={cn(
                                                'relative text-left rounded-2xl border-2 p-3 transition-all',
                                                alreadyInList ? 'opacity-40 cursor-not-allowed bg-slate-50 border-slate-200' :
                                                    isPending ? 'border-primary bg-primary/5 ring-2 ring-primary/20' :
                                                        'border-slate-200 hover:border-primary/30 bg-white cursor-pointer'
                                            )}
                                        >
                                            {v.imageUrl || selectedModel?.coverImageUrl ? (
                                                <div className="relative h-20 w-full rounded-xl overflow-hidden bg-slate-50 mb-2">
                                                    <Image
                                                        src={v.imageUrl || selectedModel?.coverImageUrl}
                                                        alt={v.colorName || ''}
                                                        fill
                                                        className="object-contain p-1"
                                                    />
                                                </div>
                                            ) : (
                                                <div className="h-20 w-full rounded-xl bg-slate-100 flex items-center justify-center mb-2">
                                                    <Ship className="h-8 w-8 text-slate-300" />
                                                </div>
                                            )}
                                            <p className="text-[10px] font-black uppercase text-slate-800">{v.material} · {v.colorName}</p>
                                            <p className="text-[9px] text-slate-400 font-mono mt-0.5">{v.id}</p>
                                            {isPending && (
                                                <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                                                    <Check className="h-3 w-3 text-white" />
                                                </div>
                                            )}
                                            {alreadyInList && (
                                                <div className="absolute top-2 right-2 text-[8px] font-black text-slate-400 uppercase tracking-widest">Added</div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="text-[10px] text-slate-400">Select a model to see SKUs</p>
                        )}
                    </div>
                </div>

                <DialogFooter className="px-6 py-4 border-t shrink-0 flex items-center justify-between">
                    <p className="text-[10px] font-bold text-slate-500">
                        {pendingRows.length > 0 ? `${pendingRows.length} SKU${pendingRows.length > 1 ? 's' : ''} selected` : 'No SKUs selected'}
                    </p>
                    <div className="flex gap-2">
                        <DialogClose asChild>
                            <Button variant="outline" size="sm" className="rounded-xl font-bold text-xs" onClick={onClose}>Cancel</Button>
                        </DialogClose>
                        <Button
                            size="sm"
                            className="rounded-xl font-black text-xs uppercase tracking-widest"
                            disabled={pendingRows.length === 0}
                            onClick={handleConfirm}
                        >
                            Add {pendingRows.length > 0 ? `${pendingRows.length} SKU${pendingRows.length > 1 ? 's' : ''}` : 'SKUs'}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ─── Price List Editor ─────────────────────────────────────────────────────────

function PriceListEditor({
    priceList,
    organisationId,
    vendorId,
    subDealers,
    onBack,
}: {
    priceList: PriceList;
    organisationId: string;
    vendorId: string;
    subDealers: any[];
    onBack: () => void;
}) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isSaving, setIsSaving] = useState(false);
    const [isBoatPickerOpen, setIsBoatPickerOpen] = useState(false);
    const [newColumnHeader, setNewColumnHeader] = useState('');
    const [isAddingColumn, setIsAddingColumn] = useState(false);
    const [editingCell, setEditingCell] = useState<{ rowIdx: number; colId: string } | null>(null);
    const [cellDraft, setCellDraft] = useState('');
    const [filterRange, setFilterRange] = useState<string | 'all'>('all');
    const [filterModel, setFilterModel] = useState<string | 'all'>('all');
    const [filterMaterial, setFilterMaterial] = useState<string | 'all'>('all');
    const [filterColor, setFilterColor] = useState<string | 'all'>('all');
    const [searchQuery, setSearchQuery] = useState('');

    // Local editable state
    const [name, setName] = useState(priceList.name);
    const [selectedSubDealerIds, setSelectedSubDealerIds] = useState<string[]>(priceList.subDealerIds || []);
    const [columns, setColumns] = useState<Column[]>(priceList.columns || []);
    const [rows, setRows] = useState<Row[]>(priceList.rows || []);

    const ref = useMemoFirebase(
        () => doc(firestore, `organisations/${organisationId}/priceLists/${priceList.id}`),
        [firestore, organisationId, priceList.id]
    );

    const save = async (patch: Partial<{ name: string; subDealerIds: string[]; columns: Column[]; rows: Row[] }>) => {
        setIsSaving(true);
        try {
            await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
        } catch {
            toast({ variant: 'destructive', title: 'Save failed' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleNameBlur = () => {
        if (name !== priceList.name) save({ name });
    };

    const toggleSubDealer = (id: string) => {
        const next = selectedSubDealerIds.includes(id)
            ? selectedSubDealerIds.filter(s => s !== id)
            : [...selectedSubDealerIds, id];
        setSelectedSubDealerIds(next);
        save({ subDealerIds: next });
    };

    const addColumn = () => {
        if (!newColumnHeader.trim()) return;
        const newCol: Column = { id: `col_${Date.now()}`, header: newColumnHeader.trim() };
        const next = [...columns, newCol];
        setColumns(next);
        setNewColumnHeader('');
        setIsAddingColumn(false);
        save({ columns: next });
    };

    const deleteColumn = (colId: string) => {
        const nextCols = columns.filter(c => c.id !== colId);
        const nextRows = rows.map(r => {
            const cells = { ...r.cells };
            delete cells[colId];
            return { ...r, cells };
        });
        setColumns(nextCols);
        setRows(nextRows);
        save({ columns: nextCols, rows: nextRows });
    };

    const addRows = (newRows: Omit<Row, 'cells'>[]) => {
        const withCells: Row[] = newRows.map(r => ({
            ...r,
            cells: Object.fromEntries(columns.map(c => [c.id, ''])),
        }));
        const next = [...rows, ...withCells];
        setRows(next);
        save({ rows: next });
    };

    const deleteRow = (variantId: string) => {
        const next = rows.filter(r => r.variantId !== variantId);
        setRows(next);
        save({ rows: next });
    };

    const startEditCell = (rowIdx: number, colId: string) => {
        setEditingCell({ rowIdx, colId });
        setCellDraft(rows[rowIdx].cells[colId] || '');
    };

    const commitCell = () => {
        if (!editingCell) return;
        const next = rows.map((r, i) =>
            i === editingCell.rowIdx
                ? { ...r, cells: { ...r.cells, [editingCell.colId]: cellDraft } }
                : r
        );
        setRows(next);
        setEditingCell(null);
        save({ rows: next });
    };

    const existingVariantIds = useMemo(() => new Set(rows.map(r => r.variantId)), [rows]);

    // Filter & group helpers
    const availableRanges = useMemo(() => [...new Set(rows.map(r => r.rangeName))].sort(), [rows]);
    const availableModels = useMemo(() => {
        const filtered = filterRange === 'all' ? rows : rows.filter(r => r.rangeName === filterRange);
        return [...new Set(filtered.map(r => r.modelName))].sort();
    }, [rows, filterRange]);
    const availableMaterials = useMemo(() => [...new Set(rows.map(r => r.material))].sort(), [rows]);
    const availableColors = useMemo(() => [...new Set(rows.map(r => r.colorCode || r.colorName).filter(Boolean))].sort(), [rows]);

    const filteredRows = useMemo(() => {
        const q = searchQuery.toLowerCase().trim();
        return rows.filter(r => {
            if (filterRange !== 'all' && r.rangeName !== filterRange) return false;
            if (filterModel !== 'all' && r.modelName !== filterModel) return false;
            if (filterMaterial !== 'all' && r.material !== filterMaterial) return false;
            if (filterColor !== 'all' && (r.colorCode || r.colorName) !== filterColor) return false;
            if (q && !r.modelName.toLowerCase().includes(q) && !r.rangeName.toLowerCase().includes(q)
                && !r.material.toLowerCase().includes(q) && !(r.colorCode || '').toLowerCase().includes(q)
                && !r.colorName.toLowerCase().includes(q) && !r.variantId.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [rows, filterRange, filterModel, filterMaterial, filterColor, searchQuery]);

    // Group filtered rows by range → model
    const groupedRows = useMemo(() => {
        const groups: { rangeName: string; models: { modelName: string; rows: { row: Row; originalIdx: number }[] }[] }[] = [];
        const rangeMap = new Map<string, Map<string, { row: Row; originalIdx: number }[]>>();

        filteredRows.forEach(r => {
            const originalIdx = rows.indexOf(r);
            if (!rangeMap.has(r.rangeName)) rangeMap.set(r.rangeName, new Map());
            const modelMap = rangeMap.get(r.rangeName)!;
            if (!modelMap.has(r.modelName)) modelMap.set(r.modelName, []);
            modelMap.get(r.modelName)!.push({ row: r, originalIdx });
        });

        rangeMap.forEach((modelMap, rangeName) => {
            const models: { modelName: string; rows: { row: Row; originalIdx: number }[] }[] = [];
            modelMap.forEach((rows, modelName) => models.push({ modelName, rows }));
            groups.push({ rangeName, models });
        });

        return groups;
    }, [filteredRows, rows]);

    // Sub-dealer price list columns — auto-added when toggled on
    const SUB_DEALER_COLUMNS: Column[] = [
        { id: 'sd_price_incl_gst', header: 'Sub Dealer Price (Incl GST)' },
        { id: 'sd_gross_profit', header: 'Gross Profit' },
        { id: 'sd_sell_incl_gst', header: 'Sell Incl GST' },
    ];
    const SD_COL_IDS = new Set(SUB_DEALER_COLUMNS.map(c => c.id));
    const isSubDealerPriceList = columns.some(c => SD_COL_IDS.has(c.id));

    const toggleSubDealerPriceList = () => {
        if (isSubDealerPriceList) {
            // Remove sub-dealer columns and their cell data
            const nextCols = columns.filter(c => !SD_COL_IDS.has(c.id));
            const nextRows = rows.map(r => {
                const cells = { ...r.cells };
                SUB_DEALER_COLUMNS.forEach(c => delete cells[c.id]);
                return { ...r, cells };
            });
            setColumns(nextCols);
            setRows(nextRows);
            save({ columns: nextCols, rows: nextRows });
        } else {
            // Add sub-dealer columns (skip any that already exist)
            const existingIds = new Set(columns.map(c => c.id));
            const toAdd = SUB_DEALER_COLUMNS.filter(c => !existingIds.has(c.id));
            const nextCols = [...columns, ...toAdd];
            // Initialize empty cells for new columns on existing rows
            const nextRows = rows.map(r => {
                const cells = { ...r.cells };
                toAdd.forEach(c => { if (!(c.id in cells)) cells[c.id] = ''; });
                return { ...r, cells };
            });
            setColumns(nextCols);
            setRows(nextRows);
            save({ columns: nextCols, rows: nextRows });
        }
    };

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Editor Header */}
            <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b bg-white">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onBack}
                        className="h-8 px-3 rounded-xl font-bold text-xs text-slate-500 hover:text-slate-800"
                    >
                        ← All Price Lists
                    </Button>
                    <div className="h-4 w-px bg-slate-200" />
                    <Input
                        value={name}
                        onChange={e => setName(e.target.value)}
                        onBlur={handleNameBlur}
                        className="h-8 font-black text-sm border-0 border-b-2 border-transparent focus-visible:border-primary focus-visible:ring-0 px-1 rounded-none bg-transparent w-64"
                    />
                    {isSaving && <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest animate-pulse">Saving...</span>}
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsBoatPickerOpen(true)}
                        className="h-8 px-4 rounded-xl font-black text-[10px] uppercase tracking-widest"
                    >
                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                        Add Boats
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsAddingColumn(true)}
                        className="h-8 px-4 rounded-xl font-black text-[10px] uppercase tracking-widest"
                    >
                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                        Add Column
                    </Button>
                </div>
            </div>

            <div className="flex flex-1 min-h-0 overflow-hidden">
                {/* Main Table Area */}
                <div className="flex-1 overflow-auto p-6 space-y-4">
                    {rows.length === 0 ? (
                        <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed rounded-3xl text-slate-300 gap-3">
                            <Ship className="h-12 w-12" />
                            <p className="text-sm font-black uppercase tracking-widest">No boats added yet</p>
                            <Button
                                size="sm"
                                onClick={() => setIsBoatPickerOpen(true)}
                                className="mt-2 rounded-xl font-black text-[10px] uppercase tracking-widest"
                            >
                                <Plus className="h-3.5 w-3.5 mr-1.5" />
                                Add Boats
                            </Button>
                        </div>
                    ) : (
                        <>
                        {/* Filter bar */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <Filter className="h-3.5 w-3.5 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="h-7 w-40 px-2.5 text-[10px] font-bold rounded-lg border border-slate-200 bg-white text-slate-700 placeholder:text-slate-300 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                            />
                            <select
                                value={filterRange}
                                onChange={e => { setFilterRange(e.target.value); setFilterModel('all'); }}
                                className="h-7 px-2 text-[10px] font-bold rounded-lg border border-slate-200 bg-white text-slate-700 uppercase tracking-wider"
                            >
                                <option value="all">All Ranges</option>
                                {availableRanges.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                            <select
                                value={filterModel}
                                onChange={e => setFilterModel(e.target.value)}
                                className="h-7 px-2 text-[10px] font-bold rounded-lg border border-slate-200 bg-white text-slate-700 uppercase tracking-wider"
                            >
                                <option value="all">All Models</option>
                                {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                            <select
                                value={filterMaterial}
                                onChange={e => setFilterMaterial(e.target.value)}
                                className="h-7 px-2 text-[10px] font-bold rounded-lg border border-slate-200 bg-white text-slate-700 uppercase tracking-wider"
                            >
                                <option value="all">All Materials</option>
                                {availableMaterials.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                            <select
                                value={filterColor}
                                onChange={e => setFilterColor(e.target.value)}
                                className="h-7 px-2 text-[10px] font-bold rounded-lg border border-slate-200 bg-white text-slate-700 uppercase tracking-wider"
                            >
                                <option value="all">All Colours</option>
                                {availableColors.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <span className="text-[9px] font-bold text-slate-400 ml-1">
                                {filteredRows.length} of {rows.length} SKUs
                            </span>
                        </div>

                        {/* Grouped table */}
                        {groupedRows.map(rangeGroup => (
                            <div key={rangeGroup.rangeName} className="space-y-2">
                                {/* Range header */}
                                <div className="flex items-center gap-2 pt-2">
                                    <div className="h-6 px-3 rounded-lg bg-primary/10 flex items-center">
                                        <span className="text-[9px] font-black uppercase tracking-widest text-primary">{rangeGroup.rangeName}</span>
                                    </div>
                                    <div className="flex-1 h-px bg-slate-100" />
                                </div>

                                {rangeGroup.models.map(modelGroup => (
                                    <div key={modelGroup.modelName} className="overflow-x-auto rounded-xl border border-slate-100">
                                        {/* Model sub-header */}
                                        <div className="bg-slate-50/80 px-4 py-2 border-b border-slate-100 flex items-center gap-2">
                                            <Ship className="h-3 w-3 text-slate-400" />
                                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">{modelGroup.modelName}</span>
                                            <span className="text-[9px] text-slate-400 font-bold">({modelGroup.rows.length} SKU{modelGroup.rows.length !== 1 ? 's' : ''})</span>
                                        </div>
                                        <table className="w-full text-sm border-collapse">
                                            <thead>
                                                <tr className="bg-slate-50/50 border-b border-slate-100">
                                                    <th className="text-left px-4 py-2 text-[8px] font-black uppercase tracking-widest text-slate-400 w-16" />
                                                    <th className="text-left px-4 py-2 text-[8px] font-black uppercase tracking-widest text-slate-400">Material</th>
                                                    <th className="text-left px-4 py-2 text-[8px] font-black uppercase tracking-widest text-slate-400">Colour</th>
                                                    {columns.map(col => (
                                                        <th key={col.id} className="text-left px-4 py-2 text-[8px] font-black uppercase tracking-widest text-slate-400 min-w-[120px]">
                                                            <div className="flex items-center gap-2 group">
                                                                {col.header}
                                                                <button onClick={() => deleteColumn(col.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-opacity">
                                                                    <X className="h-3 w-3" />
                                                                </button>
                                                            </div>
                                                        </th>
                                                    ))}
                                                    {isAddingColumn && (
                                                        <th className="px-4 py-2 min-w-[160px]">
                                                            <div className="flex items-center gap-1">
                                                                <Input autoFocus placeholder="Column header..." value={newColumnHeader} onChange={e => setNewColumnHeader(e.target.value)}
                                                                    onKeyDown={e => { if (e.key === 'Enter') addColumn(); if (e.key === 'Escape') setIsAddingColumn(false); }}
                                                                    className="h-6 text-xs rounded-lg border-primary" />
                                                                <button onClick={addColumn} className="text-primary hover:text-primary/80"><Check className="h-3.5 w-3.5" /></button>
                                                                <button onClick={() => setIsAddingColumn(false)} className="text-slate-400"><X className="h-3.5 w-3.5" /></button>
                                                            </div>
                                                        </th>
                                                    )}
                                                    <th className="w-10" />
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {modelGroup.rows.map(({ row, originalIdx }) => (
                                                    <tr key={row.variantId} className="border-b border-slate-50 hover:bg-slate-50/50 group/row">
                                                        <td className="px-4 py-2">
                                                            {row.imageUrl ? (
                                                                <div className="relative h-10 w-14 rounded-lg overflow-hidden bg-slate-100">
                                                                    <Image src={row.imageUrl} alt="" fill className="object-contain p-1" />
                                                                </div>
                                                            ) : (
                                                                <div className="h-10 w-14 rounded-lg bg-slate-100 flex items-center justify-center">
                                                                    <Ship className="h-4 w-4 text-slate-300" />
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-2 text-xs text-slate-600 font-bold">{row.material}</td>
                                                        <td className="px-4 py-2 text-xs text-slate-500 font-mono uppercase" title={row.colorName}>{row.colorCode || row.colorName}</td>
                                                        {columns.map(col => {
                                                            const isEditing = editingCell?.rowIdx === originalIdx && editingCell?.colId === col.id;
                                                            return (
                                                                <td key={col.id} className="px-2 py-2 min-w-[120px]">
                                                                    {isEditing ? (
                                                                        <Input autoFocus value={cellDraft} onChange={e => setCellDraft(e.target.value)}
                                                                            onBlur={commitCell}
                                                                            onKeyDown={e => { if (e.key === 'Enter') commitCell(); if (e.key === 'Escape') setEditingCell(null); }}
                                                                            className="h-7 text-xs rounded-lg border-primary px-2" />
                                                                    ) : (
                                                                        <button onClick={() => startEditCell(originalIdx, col.id)}
                                                                            className={cn('w-full text-left px-2 py-1 rounded-lg text-xs transition-colors min-h-[28px]',
                                                                                row.cells[col.id] ? 'text-slate-800 font-bold hover:bg-primary/5' : 'text-slate-300 hover:bg-slate-100 hover:text-slate-500')}>
                                                                            {row.cells[col.id] || '—'}
                                                                        </button>
                                                                    )}
                                                                </td>
                                                            );
                                                        })}
                                                        {isAddingColumn && <td />}
                                                        <td className="px-2">
                                                            <button onClick={() => deleteRow(row.variantId)}
                                                                className="opacity-0 group-hover/row:opacity-100 text-slate-300 hover:text-red-400 transition-opacity">
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ))}
                            </div>
                        ))}
                        </>
                    )}
                </div>

                {/* Right sidebar: sub-dealer assignment */}
                <div className="w-64 shrink-0 border-l bg-slate-50/50 overflow-y-auto p-5 space-y-5">
                    {/* Sub-dealer price list toggle */}
                    <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Price List Type</p>
                        <button
                            onClick={toggleSubDealerPriceList}
                            className={cn(
                                'w-full text-left flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-xs font-bold',
                                isSubDealerPriceList
                                    ? 'border-primary bg-primary/5 text-primary'
                                    : 'border-slate-200 bg-white text-slate-600 hover:border-primary/30'
                            )}
                        >
                            <div className={cn(
                                'h-4 w-4 rounded border-2 flex items-center justify-center shrink-0',
                                isSubDealerPriceList ? 'border-primary bg-primary' : 'border-slate-300'
                            )}>
                                {isSubDealerPriceList && <Check className="h-2.5 w-2.5 text-white" />}
                            </div>
                            Sub-Dealers Price List
                        </button>
                        {isSubDealerPriceList && (
                            <p className="text-[9px] text-slate-400 mt-2 px-1 leading-relaxed">
                                Adds pricing columns for sub-dealer distribution. Fill in each row to set dealer pricing.
                            </p>
                        )}
                    </div>

                    <div className="h-px bg-slate-200" />

                    <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Visible To Sub-Dealers</p>
                        {subDealers.length === 0 ? (
                            <p className="text-[10px] text-slate-400">No sub-dealers found</p>
                        ) : subDealers.map((sd: any) => {
                            const isSelected = selectedSubDealerIds.includes(sd.id);
                            return (
                                <button
                                    key={sd.id}
                                    onClick={() => toggleSubDealer(sd.id)}
                                    className={cn(
                                        'w-full text-left flex items-center gap-3 p-3 rounded-xl border-2 mb-2 transition-all text-xs font-bold',
                                        isSelected
                                            ? 'border-primary bg-primary/5 text-primary'
                                            : 'border-slate-200 bg-white text-slate-600 hover:border-primary/30'
                                    )}
                                >
                                    <div className={cn(
                                        'h-4 w-4 rounded border-2 flex items-center justify-center shrink-0',
                                        isSelected ? 'border-primary bg-primary' : 'border-slate-300'
                                    )}>
                                        {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                                    </div>
                                    {sd.name}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            <BoatPickerDialog
                isOpen={isBoatPickerOpen}
                onClose={() => setIsBoatPickerOpen(false)}
                vendorId={vendorId}
                existingVariantIds={existingVariantIds}
                onAdd={addRows}
            />
        </div>
    );
}

// ─── Main Export: Price List Manager ─────────────────────────────────────────

export function PriceListManager({
    organisationId,
    vendorId,
}: {
    organisationId: string;
    vendorId: string;
}) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [activePriceListId, setActivePriceListId] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [newName, setNewName] = useState('');

    const priceListsQuery = useMemoFirebase(
        () => collection(firestore, `organisations/${organisationId}/priceLists`),
        [firestore, organisationId]
    );
    const { data: priceLists } = useCollection<PriceList>(priceListsQuery);

    const subDealersQuery = useMemoFirebase(
        () => query(collection(firestore, 'organisations'), where('parentOrganisationId', '==', organisationId)),
        [firestore, organisationId]
    );
    const { data: subDealers } = useCollection<any>(subDealersQuery);

    const activePriceList = priceLists?.find(pl => pl.id === activePriceListId);

    const createPriceList = async () => {
        if (!newName.trim()) return;
        try {
            const ref = await addDoc(
                collection(firestore, `organisations/${organisationId}/priceLists`),
                {
                    name: newName.trim(),
                    subDealerIds: [],
                    columns: [],
                    rows: [],
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                }
            );
            setNewName('');
            setIsCreating(false);
            setActivePriceListId(ref.id);
        } catch {
            toast({ variant: 'destructive', title: 'Failed to create price list' });
        }
    };

    const deletePriceList = async (id: string) => {
        try {
            await deleteDoc(doc(firestore, `organisations/${organisationId}/priceLists/${id}`));
            if (activePriceListId === id) setActivePriceListId(null);
        } catch {
            toast({ variant: 'destructive', title: 'Failed to delete price list' });
        }
    };

    if (activePriceList) {
        return (
            <PriceListEditor
                priceList={activePriceList}
                organisationId={organisationId}
                vendorId={vendorId}
                subDealers={subDealers || []}
                onBack={() => setActivePriceListId(null)}
            />
        );
    }

    return (
        <div className="p-6 space-y-6 overflow-y-auto h-full">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-black uppercase tracking-tight">Price Lists</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                        Create and manage curated price lists for your sub-dealers
                    </p>
                </div>
                <Button
                    size="sm"
                    onClick={() => setIsCreating(true)}
                    className="h-9 px-5 rounded-xl font-black text-[10px] uppercase tracking-widest"
                >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    New Price List
                </Button>
            </div>

            {/* Create dialog */}
            <Dialog open={isCreating} onOpenChange={setIsCreating}>
                <DialogContent className="max-w-sm rounded-3xl">
                    <DialogHeader>
                        <DialogTitle className="font-black uppercase tracking-tight">Create Price List</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Name</Label>
                        <Input
                            autoFocus
                            placeholder="e.g. 2025 Dealer Price List"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') createPriceList(); }}
                            className="rounded-xl"
                        />
                    </div>
                    <DialogFooter className="gap-2">
                        <DialogClose asChild>
                            <Button variant="outline" size="sm" className="rounded-xl font-bold text-xs">Cancel</Button>
                        </DialogClose>
                        <Button
                            size="sm"
                            onClick={createPriceList}
                            disabled={!newName.trim()}
                            className="rounded-xl font-black text-[10px] uppercase tracking-widest"
                        >
                            Create
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Price list cards */}
            {(!priceLists || priceLists.length === 0) ? (
                <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed rounded-3xl text-slate-300 gap-3">
                    <TableIcon className="h-12 w-12" />
                    <p className="text-sm font-black uppercase tracking-widest">No price lists yet</p>
                    <Button
                        size="sm"
                        onClick={() => setIsCreating(true)}
                        className="mt-2 rounded-xl font-black text-[10px] uppercase tracking-widest"
                    >
                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                        Create your first
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {priceLists.map(pl => (
                        <div
                            key={pl.id}
                            className="group bg-white border-2 rounded-2xl p-5 hover:border-primary/30 hover:shadow-md transition-all cursor-pointer"
                            onClick={() => setActivePriceListId(pl.id)}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="space-y-1 min-w-0">
                                    <p className="font-black text-sm uppercase tracking-tight text-slate-900 truncate">{pl.name}</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                        {pl.rows?.length || 0} SKU{pl.rows?.length !== 1 ? 's' : ''} · {pl.columns?.length || 0} column{pl.columns?.length !== 1 ? 's' : ''}
                                    </p>
                                    {pl.subDealerIds?.length > 0 && (
                                        <p className="text-[9px] text-primary font-bold uppercase tracking-widest">
                                            {pl.subDealerIds.length} sub-dealer{pl.subDealerIds.length !== 1 ? 's' : ''}
                                        </p>
                                    )}
                                </div>
                                <button
                                    onClick={e => { e.stopPropagation(); deletePriceList(pl.id); }}
                                    className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-opacity shrink-0"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                            <div className="flex items-center justify-between mt-4 pt-4 border-t border-dashed border-slate-100">
                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Open</span>
                                <ChevronRight className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

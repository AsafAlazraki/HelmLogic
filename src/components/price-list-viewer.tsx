'use client';

import { useState, useMemo } from 'react';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useDoc } from '@/firebase/firestore/use-doc';
import { collection, doc, query, where } from 'firebase/firestore';
import { Ship, TableIcon, X, Anchor, Ruler, CheckCircle2, ChevronRight, Waves, Filter } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/sheet';

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
}

// ─── Boat Details Panel ──────────────────────────────────────────────────────

function BoatDetailsPanel({
    isOpen,
    onClose,
    row,
    vendorId,
}: {
    isOpen: boolean;
    onClose: () => void;
    row: Row | null;
    vendorId: string;
}) {
    const firestore = useFirestore();

    // Fetch the model document for specifications & features
    const modelRef = useMemoFirebase(() =>
        (row && vendorId && row.rangeId && row.modelId)
            ? doc(firestore, `data-warehouse/${vendorId}/ranges/${row.rangeId}/models/${row.modelId}`)
            : null,
    [firestore, vendorId, row?.rangeId, row?.modelId]);
    const { data: model, isLoading } = useDoc<any>(modelRef);

    const specs = model?.specifications?.otherSpecs || [];
    const standardFeatures = model?.standardFeatures || [];
    const motorConfig = model?.specifications?.motorConfigurations?.[0];
    const engine = motorConfig?.engines?.[0];

    return (
        <Sheet open={isOpen} onOpenChange={v => { if (!v) onClose(); }}>
            <SheetContent className="sm:max-w-lg p-0 flex flex-col h-full bg-white border-l-4 border-primary/10">
                <SheetHeader className="relative overflow-hidden shrink-0">
                    {/* Hero image area */}
                    <div className="relative h-48 bg-gradient-to-br from-slate-100 to-slate-50">
                        {row?.imageUrl ? (
                            <Image src={row.imageUrl} alt={row.modelName} fill className="object-contain p-6" />
                        ) : (
                            <div className="h-full flex items-center justify-center">
                                <Ship className="h-16 w-16 text-slate-200" />
                            </div>
                        )}
                        <div className="absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t from-white to-transparent" />
                    </div>
                    <div className="px-6 pb-5 -mt-4 relative z-10">
                        <div className="flex items-center gap-2 text-[8px] font-black uppercase tracking-[0.3em] text-primary mb-1">
                            <Anchor className="h-3 w-3" />
                            {row?.rangeName}
                        </div>
                        <SheetTitle className="text-2xl font-black uppercase tracking-tighter leading-none text-slate-900">
                            {row?.modelName}
                        </SheetTitle>
                        <SheetDescription className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1.5">
                            {row?.material} · {row?.colorName}
                        </SheetDescription>
                    </div>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="h-8 w-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                        </div>
                    ) : !model ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-300 gap-2">
                            <Ship className="h-10 w-10" />
                            <p className="text-xs font-bold">Model details unavailable</p>
                        </div>
                    ) : (
                        <div className="px-6 pb-8 space-y-6">
                            {/* Technical Specifications */}
                            {specs.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <Ruler className="h-3.5 w-3.5 text-primary" />
                                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Technical Specifications</p>
                                    </div>
                                    <div className="rounded-xl border-2 border-slate-100 overflow-hidden">
                                        {specs.map((spec: any, idx: number) => (
                                            <div
                                                key={spec.id || idx}
                                                className={cn(
                                                    'flex items-center justify-between px-4 py-2.5',
                                                    idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                                                )}
                                            >
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{spec.label}</span>
                                                <span className="text-xs font-black text-slate-800">{spec.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Motor Configuration */}
                            {engine && (
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <Waves className="h-3.5 w-3.5 text-primary" />
                                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Motor Configuration</p>
                                    </div>
                                    <div className="bg-primary/5 border-2 border-primary/10 rounded-xl p-4 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Type</span>
                                            <span className="text-xs font-black text-slate-800">{motorConfig.type}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Power Range</span>
                                            <span className="text-xs font-black text-slate-800">{engine.minHp} – {engine.maxHp} HP</span>
                                        </div>
                                        {engine.recommendedHp > 0 && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Recommended</span>
                                                <span className="text-xs font-black text-primary">{engine.recommendedHp} HP</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Standard Features */}
                            {standardFeatures.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Standard Features</p>
                                    </div>
                                    <div className="space-y-1">
                                        {standardFeatures.map((f: string, idx: number) => (
                                            <div key={idx} className="flex items-start gap-2.5 py-1.5">
                                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                                                <span className="text-xs text-slate-700 leading-relaxed">{f}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Gallery */}
                            {model.galleryImageUrls?.length > 0 && (
                                <div>
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-3">Gallery</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {model.galleryImageUrls.slice(0, 4).map((url: string, idx: number) => (
                                            <div key={idx} className="relative h-28 rounded-xl overflow-hidden bg-slate-100 border-2 border-slate-100">
                                                <Image src={url} alt="" fill className="object-cover" />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}

// ─── Grouped Price List Table (per list) ────────────────────────────────────

function GroupedPriceListTable({ pl, vendorId, onRowClick }: { pl: PriceList; vendorId?: string; onRowClick: (row: Row) => void }) {
    const [filterRange, setFilterRange] = useState<string | 'all'>('all');
    const [filterModel, setFilterModel] = useState<string | 'all'>('all');
    const [filterMaterial, setFilterMaterial] = useState<string | 'all'>('all');
    const [filterColor, setFilterColor] = useState<string | 'all'>('all');
    const [searchQuery, setSearchQuery] = useState('');

    const allRows = pl.rows || [];
    const availableRanges = useMemo(() => [...new Set(allRows.map(r => r.rangeName))].sort(), [allRows]);
    const availableModels = useMemo(() => {
        const filtered = filterRange === 'all' ? allRows : allRows.filter(r => r.rangeName === filterRange);
        return [...new Set(filtered.map(r => r.modelName))].sort();
    }, [allRows, filterRange]);
    const availableMaterials = useMemo(() => [...new Set(allRows.map(r => r.material))].sort(), [allRows]);
    const availableColors = useMemo(() => [...new Set(allRows.map(r => r.colorCode || r.colorName).filter(Boolean))].sort(), [allRows]);

    const filteredRows = useMemo(() => {
        const q = searchQuery.toLowerCase().trim();
        return allRows.filter(r => {
            if (filterRange !== 'all' && r.rangeName !== filterRange) return false;
            if (filterModel !== 'all' && r.modelName !== filterModel) return false;
            if (filterMaterial !== 'all' && r.material !== filterMaterial) return false;
            if (filterColor !== 'all' && (r.colorCode || r.colorName) !== filterColor) return false;
            if (q && !r.modelName.toLowerCase().includes(q) && !r.rangeName.toLowerCase().includes(q)
                && !r.material.toLowerCase().includes(q) && !(r.colorCode || '').toLowerCase().includes(q)
                && !r.colorName.toLowerCase().includes(q) && !r.variantId.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [allRows, filterRange, filterModel, filterMaterial, filterColor, searchQuery]);

    const groupedRows = useMemo(() => {
        const groups: { rangeName: string; models: { modelName: string; rows: Row[] }[] }[] = [];
        const rangeMap = new Map<string, Map<string, Row[]>>();
        filteredRows.forEach(r => {
            if (!rangeMap.has(r.rangeName)) rangeMap.set(r.rangeName, new Map());
            const modelMap = rangeMap.get(r.rangeName)!;
            if (!modelMap.has(r.modelName)) modelMap.set(r.modelName, []);
            modelMap.get(r.modelName)!.push(r);
        });
        rangeMap.forEach((modelMap, rangeName) => {
            const models: { modelName: string; rows: Row[] }[] = [];
            modelMap.forEach((rows, modelName) => models.push({ modelName, rows }));
            groups.push({ rangeName, models });
        });
        return groups;
    }, [filteredRows]);

    if (allRows.length === 0) {
        return (
            <div className="h-24 flex items-center justify-center border-2 border-dashed rounded-2xl text-slate-300 bg-slate-50/50">
                <p className="text-xs font-bold">No boats in this list yet</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
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
                <select value={filterRange} onChange={e => { setFilterRange(e.target.value); setFilterModel('all'); }}
                    className="h-7 px-2 text-[10px] font-bold rounded-lg border border-slate-200 bg-white text-slate-700 uppercase tracking-wider">
                    <option value="all">All Ranges</option>
                    {availableRanges.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <select value={filterModel} onChange={e => setFilterModel(e.target.value)}
                    className="h-7 px-2 text-[10px] font-bold rounded-lg border border-slate-200 bg-white text-slate-700 uppercase tracking-wider">
                    <option value="all">All Models</option>
                    {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <select value={filterMaterial} onChange={e => setFilterMaterial(e.target.value)}
                    className="h-7 px-2 text-[10px] font-bold rounded-lg border border-slate-200 bg-white text-slate-700 uppercase tracking-wider">
                    <option value="all">All Materials</option>
                    {availableMaterials.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <select value={filterColor} onChange={e => setFilterColor(e.target.value)}
                    className="h-7 px-2 text-[10px] font-bold rounded-lg border border-slate-200 bg-white text-slate-700 uppercase tracking-wider">
                    <option value="all">All Colours</option>
                    {availableColors.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <span className="text-[9px] font-bold text-slate-400 ml-1">{filteredRows.length} of {allRows.length} SKUs</span>
            </div>

            {/* Grouped tables */}
            {groupedRows.map(rangeGroup => (
                <div key={rangeGroup.rangeName} className="space-y-3">
                    <div className="flex items-center gap-3 pt-3">
                        <div className="h-7 px-4 rounded-full bg-primary text-white flex items-center shadow-sm">
                            <span className="text-[9px] font-black uppercase tracking-widest">{rangeGroup.rangeName}</span>
                        </div>
                        <div className="flex-1 h-px bg-slate-200" />
                    </div>

                    {rangeGroup.models.map(modelGroup => (
                        <div key={modelGroup.modelName} className="overflow-x-auto rounded-2xl border-2 border-slate-200/80 bg-white shadow-sm">
                            <div className="bg-gradient-to-r from-slate-100 to-slate-50 px-5 py-3 border-b-2 border-slate-200/60 flex items-center gap-2.5">
                                <Ship className="h-3.5 w-3.5 text-primary/60" />
                                <span className="text-[11px] font-black uppercase tracking-wider text-slate-700">{modelGroup.modelName}</span>
                                <span className="text-[9px] text-slate-400 font-bold bg-white px-2 py-0.5 rounded-full border border-slate-200">{modelGroup.rows.length} SKU{modelGroup.rows.length !== 1 ? 's' : ''}</span>
                            </div>
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200/60">
                                        <th className="text-left px-5 py-2.5 text-[8px] font-black uppercase tracking-widest text-slate-400 w-16" />
                                        <th className="text-left px-5 py-2.5 text-[8px] font-black uppercase tracking-widest text-slate-400">Material</th>
                                        <th className="text-left px-5 py-2.5 text-[8px] font-black uppercase tracking-widest text-slate-400">Colour</th>
                                        {(pl.columns || []).map(col => (
                                            <th key={col.id} className="text-right px-5 py-2.5 text-[8px] font-black uppercase tracking-widest text-slate-400 min-w-[140px]">
                                                {col.header}
                                            </th>
                                        ))}
                                        {vendorId && <th className="w-10" />}
                                    </tr>
                                </thead>
                                <tbody>
                                    {modelGroup.rows.map((row, idx) => (
                                        <tr
                                            key={row.variantId}
                                            onClick={() => vendorId ? onRowClick(row) : undefined}
                                            className={cn(
                                                'border-b border-slate-100 transition-colors',
                                                vendorId ? 'cursor-pointer hover:bg-primary/[0.03] group' : '',
                                                idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'
                                            )}
                                        >
                                            <td className="px-5 py-3">
                                                {row.imageUrl ? (
                                                    <div className="relative h-11 w-16 rounded-xl overflow-hidden bg-slate-50 border border-slate-200 shadow-sm group-hover:border-primary/30 transition-colors">
                                                        <Image src={row.imageUrl} alt="" fill className="object-contain p-1.5" />
                                                    </div>
                                                ) : (
                                                    <div className="h-11 w-16 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center">
                                                        <Ship className="h-4 w-4 text-slate-300" />
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-5 py-3">
                                                <span className="inline-flex items-center h-6 px-2.5 rounded-md bg-slate-100 border border-slate-200/60 text-[10px] font-black text-slate-700 uppercase tracking-wider">{row.material}</span>
                                            </td>
                                            <td className="px-5 py-3">
                                                <span className="text-xs font-mono font-bold text-primary/80 uppercase" title={row.colorName}>{row.colorCode || row.colorName}</span>
                                            </td>
                                            {(pl.columns || []).map(col => (
                                                <td key={col.id} className="px-5 py-3 text-right">
                                                    <span className={cn(
                                                        'text-xs tabular-nums',
                                                        row.cells?.[col.id] ? 'font-black text-slate-900' : 'text-slate-300'
                                                    )}>
                                                        {row.cells?.[col.id] || '—'}
                                                    </span>
                                                </td>
                                            ))}
                                            {vendorId && (
                                                <td className="px-3 py-3">
                                                    <ChevronRight className="h-4 w-4 text-slate-200 group-hover:text-primary transition-colors" />
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export function PriceListViewer({
    parentOrganisationId,
    subDealerOrgId,
    vendorId,
}: {
    parentOrganisationId: string;
    subDealerOrgId: string;
    vendorId?: string;
}) {
    const firestore = useFirestore();
    const [selectedRow, setSelectedRow] = useState<Row | null>(null);

    const parentOrgRef = useMemoFirebase(
        () => doc(firestore, 'organisations', parentOrganisationId),
        [firestore, parentOrganisationId]
    );
    const { data: parentOrg } = useDoc<any>(parentOrgRef);

    const priceListsQuery = useMemoFirebase(
        () => query(
            collection(firestore, `organisations/${parentOrganisationId}/priceLists`),
            where('subDealerIds', 'array-contains', subDealerOrgId)
        ),
        [firestore, parentOrganisationId, subDealerOrgId]
    );
    const { data: priceLists, isLoading } = useCollection<PriceList>(priceListsQuery);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="h-8 w-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
        );
    }

    if (!priceLists || priceLists.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-4 p-12">
                <div className="h-24 w-24 rounded-3xl bg-slate-50 flex items-center justify-center">
                    <TableIcon className="h-12 w-12" />
                </div>
                <p className="text-sm font-black uppercase tracking-widest">No price lists available</p>
                <p className="text-[10px] font-bold text-slate-400 max-w-xs text-center leading-relaxed">
                    Contact your distributor for access to pricing information.
                </p>
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto">
            {parentOrg && (
                <div className="bg-white border-b-2 border-slate-100 px-8 py-5">
                    <div className="flex items-center gap-4">
                        {parentOrg.primaryLogoUrl && (
                            <div className="relative h-10 w-28 shrink-0">
                                <Image src={parentOrg.primaryLogoUrl} alt={parentOrg.name} fill className="object-contain object-left" />
                            </div>
                        )}
                        <div className="h-8 w-px bg-slate-200" />
                        <div>
                            <p className="text-xs font-black uppercase tracking-wider text-slate-800">{parentOrg.name}</p>
                            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">Authorised Distributor</p>
                        </div>
                    </div>
                </div>
            )}

            <div className="p-6 md:p-8 space-y-8">
                {priceLists.map(pl => (
                    <div key={pl.id} className="space-y-4">
                        <div>
                            <h2 className="text-lg font-black uppercase tracking-tight text-slate-900">{pl.name}</h2>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                                {pl.rows?.length || 0} model{pl.rows?.length !== 1 ? 's' : ''} · {pl.columns?.length || 0} pricing column{pl.columns?.length !== 1 ? 's' : ''}
                            </p>
                        </div>
                        <GroupedPriceListTable pl={pl} vendorId={vendorId} onRowClick={setSelectedRow} />
                    </div>
                ))}
            </div>

            {vendorId && (
                <BoatDetailsPanel
                    isOpen={!!selectedRow}
                    onClose={() => setSelectedRow(null)}
                    row={selectedRow}
                    vendorId={vendorId}
                />
            )}
        </div>
    );
}

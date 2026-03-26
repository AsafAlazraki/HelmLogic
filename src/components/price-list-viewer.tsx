'use client';

import { useMemo } from 'react';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where } from 'firebase/firestore';
import { Ship, TableIcon } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface Column { id: string; header: string; }
interface Row {
    variantId: string;
    modelId: string;
    modelName: string;
    rangeId: string;
    rangeName: string;
    material: string;
    colorName: string;
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

export function PriceListViewer({
    parentOrganisationId,
    subDealerOrgId,
}: {
    parentOrganisationId: string;
    subDealerOrgId: string;
}) {
    const firestore = useFirestore();

    const priceListsQuery = useMemoFirebase(
        () => query(
            collection(firestore, `organisations/${parentOrganisationId}/priceLists`),
            where('subDealerIds', 'array-contains', subDealerOrgId)
        ),
        [firestore, parentOrganisationId, subDealerOrgId]
    );
    const { data: priceLists, isLoading } = useCollection<PriceList>(priceListsQuery);

    if (isLoading) return null;

    if (!priceLists || priceLists.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed rounded-3xl text-slate-300 gap-3 m-6">
                <TableIcon className="h-12 w-12" />
                <p className="text-sm font-black uppercase tracking-widest">No price lists available</p>
                <p className="text-[10px] font-bold text-slate-400">Contact your distributor for access.</p>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-8 overflow-y-auto h-full">
            {priceLists.map(pl => (
                <div key={pl.id} className="space-y-3">
                    <div>
                        <h2 className="text-lg font-black uppercase tracking-tight text-slate-900">{pl.name}</h2>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                            {pl.rows?.length || 0} model{pl.rows?.length !== 1 ? 's' : ''}
                        </p>
                    </div>

                    {pl.rows?.length > 0 ? (
                        <div className="overflow-x-auto rounded-2xl border-2 border-slate-100">
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 border-b-2 border-slate-100">
                                        <th className="text-left px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-500 w-16">Image</th>
                                        <th className="text-left px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-500">Model</th>
                                        <th className="text-left px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-500">Range</th>
                                        <th className="text-left px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-500">Material</th>
                                        <th className="text-left px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-500">Colour</th>
                                        {(pl.columns || []).map(col => (
                                            <th key={col.id} className="text-left px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-500 min-w-[120px]">
                                                {col.header}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {pl.rows.map(row => (
                                        <tr key={row.variantId} className="border-b border-slate-50 hover:bg-slate-50/50">
                                            <td className="px-4 py-3">
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
                                            <td className="px-4 py-3 font-black text-xs text-slate-800">{row.modelName}</td>
                                            <td className="px-4 py-3 text-xs text-slate-500 font-bold">{row.rangeName}</td>
                                            <td className="px-4 py-3 text-xs text-slate-500">{row.material}</td>
                                            <td className="px-4 py-3 text-xs text-slate-500">{row.colorName}</td>
                                            {(pl.columns || []).map(col => (
                                                <td key={col.id} className="px-4 py-3 text-xs font-bold text-slate-700">
                                                    {row.cells?.[col.id] || '—'}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="h-24 flex items-center justify-center border-2 border-dashed rounded-2xl text-slate-300">
                            <p className="text-xs font-bold">No boats in this list yet</p>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

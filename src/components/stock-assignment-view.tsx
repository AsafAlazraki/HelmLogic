'use client';

import { useState } from 'react';
import { doc, updateDoc, collection, query, where } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Package, Users, ArrowRight, RotateCcw } from 'lucide-react';

interface StockAssignmentViewProps {
    organisation: any;
    subDealers: any[];
    moduleId: string;
    isAdmin: boolean;
    readOnly: boolean;
}

function StatusBadge({ status }: { status?: string }) {
    const isInStock = status?.toLowerCase() === 'in stock';
    return (
        <Badge
            className={
                isInStock
                    ? 'bg-green-100 text-green-700 border-green-200'
                    : 'bg-blue-100 text-blue-700 border-blue-200'
            }
        >
            {status || 'Unknown'}
        </Badge>
    );
}

function MaterialBadge({ material }: { material?: string }) {
    if (!material) return null;
    const isPVC = material.toUpperCase().includes('PVC');
    return (
        <Badge
            className={
                isPVC
                    ? 'bg-red-100 text-red-700 border-red-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
            }
        >
            {material}
        </Badge>
    );
}

function SubDealerStockCard({
    subDealer,
    moduleId,
    parentOrgId,
    readOnly,
}: {
    subDealer: any;
    moduleId: string;
    parentOrgId: string;
    readOnly: boolean;
}) {
    const firestore = useFirestore();

    const sdStockQuery = useMemoFirebase(
        () =>
            query(
                collection(firestore, 'inventory'),
                where('moduleId', '==', moduleId),
                where('organisationId', '==', subDealer.id)
            ),
        [firestore, moduleId, subDealer.id]
    );

    const { data: sdStock } = useCollection<any>(sdStockQuery);

    async function handleRecall(itemId: string) {
        try {
            await updateDoc(doc(firestore, 'inventory', itemId), {
                organisationId: parentOrgId,
            });
            toast({ title: 'Stock recalled' });
        } catch (error) {
            console.error('Recall failed:', error);
            toast({ variant: 'destructive', title: 'Recall failed' });
        }
    }

    const itemCount = sdStock?.length ?? 0;

    return (
        <Card className="border-2 rounded-2xl p-4 bg-white">
            <div className="flex items-center gap-3 mb-1">
                {subDealer.primaryLogoUrl ? (
                    <img
                        src={subDealer.primaryLogoUrl}
                        alt={subDealer.name}
                        className="w-8 h-8 rounded-full object-cover border-2"
                    />
                ) : (
                    <div className="w-8 h-8 rounded-full bg-slate-100 border-2 flex items-center justify-center">
                        <Users className="w-4 h-4 text-slate-400" />
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{subDealer.name}</p>
                </div>
                <Badge variant="secondary" className="text-[10px]">
                    {itemCount} {itemCount === 1 ? 'item' : 'items'}
                </Badge>
            </div>

            {itemCount === 0 ? (
                <p className="text-[10px] text-slate-400 text-center py-3">
                    No stock assigned
                </p>
            ) : (
                <div className="space-y-1.5 mt-3">
                    {sdStock?.map((item: any) => (
                        <div
                            key={item.id}
                            className="flex items-center justify-between p-2 rounded-xl bg-slate-50 text-xs"
                        >
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="font-bold truncate">
                                    {item.name}
                                </span>
                                <span className="font-mono text-[10px] text-primary shrink-0">
                                    {item.stockNumber}
                                </span>
                            </div>
                            {!readOnly && (
                                <button
                                    onClick={() => handleRecall(item.id)}
                                    className="text-[9px] font-black uppercase text-orange-600 hover:bg-orange-50 rounded-lg px-2 h-6 flex items-center gap-1 shrink-0"
                                >
                                    <RotateCcw className="w-3 h-3" />
                                    Recall
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
}

export function StockAssignmentView({
    organisation,
    subDealers,
    moduleId,
    isAdmin,
    readOnly,
}: StockAssignmentViewProps) {
    const firestore = useFirestore();
    const [assigningId, setAssigningId] = useState<string | null>(null);

    const parentStockQuery = useMemoFirebase(() => {
        if (!organisation?.id) return null;
        return query(
            collection(firestore, 'inventory'),
            where('moduleId', '==', moduleId),
            where('organisationId', '==', organisation.id)
        );
    }, [firestore, moduleId, organisation?.id]);

    const { data: parentStock } = useCollection<any>(parentStockQuery);

    async function handleAssign(itemId: string, targetOrgId: string) {
        try {
            await updateDoc(doc(firestore, 'inventory', itemId), {
                organisationId: targetOrgId,
            });
            toast({ title: 'Stock assigned' });
            setAssigningId(null);
        } catch (error) {
            console.error('Assignment failed:', error);
            toast({ variant: 'destructive', title: 'Assignment failed' });
        }
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full overflow-y-auto p-6">
            {/* Left Column: Parent Org Unassigned Stock */}
            <div>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
                    Your Stock
                </h3>

                {!parentStock || parentStock.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                        <Package className="w-10 h-10 mb-2" />
                        <p className="text-xs">No unassigned stock</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {parentStock.map((item: any) => (
                            <Card
                                key={item.id}
                                className="border-2 rounded-2xl p-4 bg-white space-y-2"
                            >
                                <div className="flex items-center justify-between">
                                    <p className="text-xs font-bold">{item.name}</p>
                                    <div className="flex items-center gap-1.5">
                                        <StatusBadge status={item.status} />
                                        <MaterialBadge material={item.material} />
                                    </div>
                                </div>

                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <p className="font-mono text-[10px] text-primary">
                                            {item.stockNumber}
                                        </p>
                                        {item.location && (
                                            <p className="text-[10px] text-slate-400">
                                                {item.location}
                                            </p>
                                        )}
                                    </div>

                                    {!readOnly && subDealers.length > 0 && (
                                        <div className="flex items-center gap-2">
                                            {assigningId === item.id ? (
                                                <Select
                                                    onValueChange={(sdId) =>
                                                        handleAssign(item.id, sdId)
                                                    }
                                                    onOpenChange={(open) => {
                                                        if (!open) setAssigningId(null);
                                                    }}
                                                >
                                                    <SelectTrigger className="rounded-xl border-2 text-[10px] font-black uppercase tracking-widest h-8 px-3 w-[140px]">
                                                        <SelectValue placeholder="Select..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {subDealers.map((sd) => (
                                                            <SelectItem
                                                                key={sd.id}
                                                                value={sd.id}
                                                            >
                                                                {sd.name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            ) : (
                                                <Button
                                                    variant="outline"
                                                    className="rounded-xl border-2 text-[10px] font-black uppercase tracking-widest h-8 px-3"
                                                    onClick={() =>
                                                        setAssigningId(item.id)
                                                    }
                                                >
                                                    Assign
                                                    <ArrowRight className="w-3 h-3 ml-1" />
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {/* Right Column: Sub-Dealer Distribution */}
            <div>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
                    Sub-Dealer Stock
                </h3>

                {!subDealers || subDealers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                        <Users className="w-10 h-10 mb-2" />
                        <p className="text-xs">No sub-dealers configured</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {subDealers.map((sd) => (
                            <SubDealerStockCard
                                key={sd.id}
                                subDealer={sd}
                                moduleId={moduleId}
                                parentOrgId={organisation.id}
                                readOnly={readOnly}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

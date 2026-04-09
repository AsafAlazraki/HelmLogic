'use client';

import { useMemo, useState, useCallback } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { collection, query, where, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowRightLeft, Trash2, Box, CheckCircle2, ChevronUp, ChevronDown, Plus, Pencil, Truck, Shield, Search } from 'lucide-react';
import { StockItemDetail } from '@/components/stock-item-detail';
import { StockItemForm } from '@/components/stock-item-form';
import { MoveToDelivered } from '@/components/move-to-delivered';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from '@/hooks/use-toast';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';
import { Badge } from '@/components/ui/badge';

interface InventoryItem {
    id: string;
    name: string;
    stockNumber: string;
    label: string;
    organisationId: string;
    moduleId: string;
    status: string;
    location: string;
    soldBy: string;
    model: string;
    colour: string;
    serialNumber: string;
    material: string;
    notes: string;
    dateIntoStock: any; // Firestore Timestamp
    photoUrls: string[];
    pdfAttachments: { name: string; url: string; uploadedAt: any }[];
}

interface Organisation {
    id: string;
    name: string;
    parentOrganisationId?: string;
}

type SortKey = 'dateIntoStock' | 'daysInStock' | 'status' | 'location' | 'soldBy' | 'stockNumber' | 'label' | 'model' | 'colour' | 'serialNumber' | 'material' | 'notes';
type SortDir = 'asc' | 'desc';

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
    { key: 'dateIntoStock', label: 'Date into Stock / ETA' },
    { key: 'daysInStock', label: 'Days in Stock', className: 'text-right' },
    { key: 'status', label: 'Status' },
    { key: 'location', label: 'Location' },
    { key: 'soldBy', label: 'Sold By' },
    { key: 'stockNumber', label: 'Stock Number' },
    { key: 'label', label: 'Label' },
    { key: 'model', label: 'Model' },
    { key: 'colour', label: 'Colour' },
    { key: 'serialNumber', label: 'Serial Number' },
    { key: 'material', label: 'Material' },
    { key: 'notes', label: 'Notes' },
];

function toDate(ts: any): Date | null {
    if (!ts) return null;
    if (typeof ts.toDate === 'function') return ts.toDate();
    if (ts instanceof Date) return ts;
    if (typeof ts === 'number') return new Date(ts);
    if (typeof ts === 'string') return new Date(ts);
    return null;
}

function formatDate(ts: any): string {
    const d = toDate(ts);
    if (!d || isNaN(d.getTime())) return '—';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
}

function daysInStock(ts: any): number | null {
    const d = toDate(ts);
    if (!d || isNaN(d.getTime())) return null;
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
}

export function StockList({
    organisation,
    subDealers,
    parentOrg,
    moduleId,
    filterOrgId,
    isAdmin = false,
    locations = [],
    readOnly = false,
    hideHeader = false,
    visibleColumns,
    searchFilter = '',
    statusFilter = '',
    locationFilter = '',
    materialFilter = '',
    onRequestHold,
}: {
    organisation: Organisation | null;
    subDealers: Organisation[];
    parentOrg: Organisation | null;
    moduleId: string;
    filterOrgId: string | 'all' | 'local';
    isAdmin?: boolean;
    locations?: string[];
    readOnly?: boolean;
    hideHeader?: boolean;
    visibleColumns?: string[];
    searchFilter?: string;
    statusFilter?: string;
    locationFilter?: string;
    materialFilter?: string;
    onRequestHold?: (item: InventoryItem) => void;
}) {
    const firestore = useFirestore();
    const [sortKey, setSortKey] = useState<SortKey>('dateIntoStock');
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const [detailItem, setDetailItem] = useState<InventoryItem | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [editItem, setEditItem] = useState<InventoryItem | null>(null);
    const [deliverItem, setDeliverItem] = useState<InventoryItem | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

    const targetOrgIds = useMemo(() => {
        if (!organisation?.id) return [];
        if (filterOrgId === 'local') return [organisation.id];
        if (filterOrgId === 'all') {
            // Firestore 'in' queries support max 30 elements
            const ids = [organisation.id, ...subDealers.map(sd => sd.id)];
            return ids.slice(0, 30);
        }
        if (filterOrgId === 'all-with-parent') {
            // Sub-dealer: show own stock + parent org stock
            const ids = [organisation.id];
            if (parentOrg?.id) ids.push(parentOrg.id);
            return ids;
        }
        return [filterOrgId];
    }, [filterOrgId, organisation, subDealers, parentOrg]);

    const inventoryQuery = useMemoFirebase(() => {
        if (targetOrgIds.length === 0) return null;
        return query(
            collection(firestore, 'inventory'),
            where('moduleId', '==', moduleId),
            where('organisationId', 'in', targetOrgIds)
        );
    }, [firestore, moduleId, targetOrgIds]);

    const { data: inventory, loading } = useCollection<InventoryItem>(inventoryQuery);

    const sortedInventory = useMemo(() => {
        if (!inventory) return [];
        let filtered = [...inventory];

        // Apply search filter
        if (searchFilter) {
            const q = searchFilter.toLowerCase();
            filtered = filtered.filter(item =>
                (item.name || '').toLowerCase().includes(q) ||
                (item.model || '').toLowerCase().includes(q) ||
                (item.stockNumber || '').toLowerCase().includes(q) ||
                (item.serialNumber || '').toLowerCase().includes(q) ||
                (item.colour || '').toLowerCase().includes(q) ||
                (item.label || '').toLowerCase().includes(q) ||
                (item.notes || '').toLowerCase().includes(q) ||
                (item.location || '').toLowerCase().includes(q) ||
                (item.soldBy || '').toLowerCase().includes(q)
            );
        }

        // Apply status filter
        if (statusFilter && statusFilter !== 'all') {
            filtered = filtered.filter(item => item.status === statusFilter);
        }

        // Apply location filter
        if (locationFilter && locationFilter !== 'all') {
            filtered = filtered.filter(item => item.location === locationFilter);
        }

        // Apply material filter
        if (materialFilter && materialFilter !== 'all') {
            filtered = filtered.filter(item => item.material === materialFilter);
        }

        const sorted = filtered.sort((a, b) => {
            let aVal: any;
            let bVal: any;

            if (sortKey === 'daysInStock' || sortKey === 'dateIntoStock') {
                aVal = toDate(a.dateIntoStock)?.getTime() ?? 0;
                bVal = toDate(b.dateIntoStock)?.getTime() ?? 0;
                // For daysInStock, more days = older date, so ascending days = ascending date
            } else {
                aVal = (a[sortKey as keyof InventoryItem] ?? '') as string;
                bVal = (b[sortKey as keyof InventoryItem] ?? '') as string;
                aVal = typeof aVal === 'string' ? aVal.toLowerCase() : aVal;
                bVal = typeof bVal === 'string' ? bVal.toLowerCase() : bVal;
            }

            if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
        return sorted;
    }, [inventory, sortKey, sortDir, searchFilter, statusFilter, locationFilter, materialFilter]);

    const displayColumns = useMemo(() => {
        if (!visibleColumns || visibleColumns.length === 0) return COLUMNS;
        return COLUMNS.filter(col => visibleColumns.includes(col.key));
    }, [visibleColumns]);

    const visibleColumnKeys = useMemo(() => {
        return new Set(displayColumns.map(col => col.key));
    }, [displayColumns]);

    const handleSort = useCallback((key: SortKey) => {
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    }, [sortKey]);

    const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
    const [isAssigning, setIsAssigning] = useState(false);
    const [targetId, setTargetId] = useState<string>('');

    const availableTargets = useMemo(() => {
        const targets = [];
        if (!organisation) return [];
        if (parentOrg) targets.push({ id: parentOrg.id, name: `Parent: ${parentOrg.name}` });
        if (organisation.id !== selectedItem?.organisationId) targets.push({ id: organisation.id, name: `My Org: ${organisation.name}` });
        subDealers.forEach(sd => {
            if (sd.id !== selectedItem?.organisationId) {
                targets.push({ id: sd.id, name: `Sub Dealer: ${sd.name}` });
            }
        });
        return targets;
    }, [organisation, subDealers, parentOrg, selectedItem]);

    const handleAssign = async () => {
        if (!selectedItem || !targetId) return;
        setIsAssigning(true);
        const itemRef = doc(firestore, 'inventory', selectedItem.id);

        updateDoc(itemRef, { organisationId: targetId })
            .then(() => {
                toast({ title: "Stock Assigned" });
                setSelectedItem(null);
            })
            .catch(async (error) => {
                console.error('Failed to assign stock:', error);
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: itemRef.path,
                    operation: 'update',
                    requestResourceData: { organisationId: targetId },
                } satisfies SecurityRuleContext));
            })
            .finally(() => setIsAssigning(false));
    };

    const handleBulkDelete = async () => {
        try {
            for (const id of selectedIds) {
                await deleteDoc(doc(firestore, 'inventory', id));
            }
            toast({ title: `${selectedIds.size} item${selectedIds.size !== 1 ? 's' : ''} deleted` });
            setSelectedIds(new Set());
            setShowBulkDeleteConfirm(false);
        } catch (error) {
            console.error('Bulk delete failed:', error);
            toast({ variant: 'destructive', title: 'Delete failed' });
        }
    };

    const handleDeleteItem = async (itemId: string) => {
        const itemRef = doc(firestore, 'inventory', itemId);
        deleteDoc(itemRef)
            .then(() => {
                toast({ title: "Item deleted." });
            })
            .catch(async (error) => {
                console.error('Failed to delete stock item:', error);
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                    path: itemRef.path,
                    operation: 'delete',
                } satisfies SecurityRuleContext));
            });
    };

    if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {!hideHeader && (
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-black uppercase tracking-widest">Stock Control</h3>
                        <Badge variant="secondary" className="text-[10px] font-black">{inventory?.length ?? 0}</Badge>
                    </div>
                    {!readOnly && (
                        <Button
                            className="rounded-xl text-xs font-black uppercase tracking-widest"
                            size="sm"
                            onClick={() => { setFormOpen(true); setEditItem(null); }}
                        >
                            <Plus className="h-3.5 w-3.5 mr-1.5" />
                            Add Stock Item
                        </Button>
                    )}
                </div>
            )}
            {(!inventory || inventory.length === 0) ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
                    <Box className="h-8 w-8 text-muted-foreground/20" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">No Units in Stock</p>
                </div>
            ) : inventory.length > 0 && sortedInventory.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
                    <Search className="h-8 w-8 text-muted-foreground/20" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">No matching items</p>
                </div>
            ) : (
                <>
                {selectedIds.size > 0 && !readOnly && (
                    <div className="flex items-center justify-between px-4 py-2 bg-red-50 border-2 border-red-200 rounded-xl mb-3">
                        <span className="text-xs font-bold text-red-700">
                            {selectedIds.size} item{selectedIds.size !== 1 ? 's' : ''} selected
                        </span>
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setSelectedIds(new Set())}>Clear</Button>
                            <Button variant="destructive" size="sm" className="rounded-xl text-[10px] font-black uppercase tracking-widest gap-1" onClick={() => setShowBulkDeleteConfirm(true)}>
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete Selected
                            </Button>
                        </div>
                    </div>
                )}
                <div className="flex-1 overflow-hidden rounded-2xl border-2 border-slate-100">
                    <ScrollArea className="h-full">
                        <table className="w-full border-collapse text-xs">
                            <thead className="bg-slate-50">
                                <tr>
                                    {!readOnly && (
                                        <th className="px-3 py-2.5 w-10">
                                            <input
                                                type="checkbox"
                                                checked={sortedInventory.length > 0 && selectedIds.size === sortedInventory.length}
                                                onChange={(e) => {
                                                    if (e.target.checked) setSelectedIds(new Set(sortedInventory.map(i => i.id)));
                                                    else setSelectedIds(new Set());
                                                }}
                                                className="rounded border-2"
                                            />
                                        </th>
                                    )}
                                    {displayColumns.map(col => (
                                        <th
                                            key={col.key}
                                            className={`text-[9px] font-black uppercase tracking-widest text-slate-400 px-3 py-2.5 text-left whitespace-nowrap cursor-pointer select-none hover:text-slate-600 transition-colors ${col.className ?? ''}`}
                                            onClick={() => handleSort(col.key)}
                                        >
                                            <span className="inline-flex items-center gap-1">
                                                {col.label}
                                                {sortKey === col.key && (
                                                    sortDir === 'asc'
                                                        ? <ChevronUp className="h-3 w-3" />
                                                        : <ChevronDown className="h-3 w-3" />
                                                )}
                                            </span>
                                        </th>
                                    ))}
                                    <th className="text-[9px] font-black uppercase tracking-widest text-slate-400 px-3 py-2.5 text-right whitespace-nowrap">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedInventory.map(item => {
                                    const days = daysInStock(item.dateIntoStock);
                                    return (
                                        <tr key={item.id} className="group border-b border-slate-100 hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => setDetailItem(item)}>
                                            {!readOnly && (
                                                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedIds.has(item.id)}
                                                        onChange={() => {
                                                            const next = new Set(selectedIds);
                                                            if (next.has(item.id)) next.delete(item.id);
                                                            else next.add(item.id);
                                                            setSelectedIds(next);
                                                        }}
                                                        className="rounded border-2"
                                                    />
                                                </td>
                                            )}
                                            {/* Date into Stock / ETA */}
                                            {visibleColumnKeys.has('dateIntoStock') && (
                                                <td className="px-3 py-2 whitespace-nowrap">{formatDate(item.dateIntoStock)}</td>
                                            )}

                                            {/* Days in Stock */}
                                            {visibleColumnKeys.has('daysInStock') && (
                                                <td className={`px-3 py-2 text-right whitespace-nowrap ${days !== null && days > 365 ? 'font-bold' : ''}`}>
                                                    {days !== null ? days : '—'}
                                                </td>
                                            )}

                                            {/* Status */}
                                            {visibleColumnKeys.has('status') && (
                                                <td className="px-3 py-2 whitespace-nowrap">
                                                    {item.status === 'In Stock' && <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px] px-2 py-0">In Stock</Badge>}
                                                    {item.status === 'On Order' && <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[10px] px-2 py-0">On Order</Badge>}
                                                    {item.status === 'Pending' && <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 text-[10px] px-2 py-0">Pending</Badge>}
                                                    {item.status === 'In Stock - Sold' && <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-[10px] px-2 py-0">In Stock - Sold</Badge>}
                                                    {item.status === 'On Order - Sold' && <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-[10px] px-2 py-0">On Order - Sold</Badge>}
                                                    {!['In Stock', 'On Order', 'Pending', 'In Stock - Sold', 'On Order - Sold'].includes(item.status) && <span>{item.status ?? '—'}</span>}
                                                </td>
                                            )}

                                            {/* Location */}
                                            {visibleColumnKeys.has('location') && (
                                                <td className="px-3 py-2 whitespace-nowrap">{item.location || '—'}</td>
                                            )}

                                            {/* Sold By */}
                                            {visibleColumnKeys.has('soldBy') && (
                                                <td className="px-3 py-2 whitespace-nowrap">{item.soldBy || '—'}</td>
                                            )}

                                            {/* Stock Number */}
                                            {visibleColumnKeys.has('stockNumber') && (
                                                <td className="px-3 py-2 whitespace-nowrap font-mono text-[10px]">{item.stockNumber || '—'}</td>
                                            )}

                                            {/* Label */}
                                            {visibleColumnKeys.has('label') && (
                                                <td className="px-3 py-2 whitespace-nowrap">{item.label || '—'}</td>
                                            )}

                                            {/* Model */}
                                            {visibleColumnKeys.has('model') && (
                                                <td className="px-3 py-2 whitespace-nowrap">{item.model || '—'}</td>
                                            )}

                                            {/* Colour */}
                                            {visibleColumnKeys.has('colour') && (
                                                <td className="px-3 py-2 whitespace-nowrap">{item.colour || '—'}</td>
                                            )}

                                            {/* Serial Number */}
                                            {visibleColumnKeys.has('serialNumber') && (
                                                <td className="px-3 py-2 whitespace-nowrap font-mono text-[10px]">{item.serialNumber || '—'}</td>
                                            )}

                                            {/* Material */}
                                            {visibleColumnKeys.has('material') && (
                                                <td className="px-3 py-2 whitespace-nowrap">
                                                    {item.material === 'PVC' ? (
                                                        <Badge className="bg-red-500 text-white border-transparent text-[10px] px-2 py-0">PVC</Badge>
                                                    ) : item.material === 'HYP' ? (
                                                        <Badge className="bg-slate-200 text-slate-600 border-transparent text-[10px] px-2 py-0">HYP</Badge>
                                                    ) : (
                                                        <span>{item.material || '—'}</span>
                                                    )}
                                                </td>
                                            )}

                                            {/* Notes */}
                                            {visibleColumnKeys.has('notes') && (
                                                <td className="px-3 py-2">
                                                    <span className="block max-w-[200px] truncate" title={item.notes || ''}>
                                                        {item.notes || '—'}
                                                    </span>
                                                </td>
                                            )}

                                            {/* Actions */}
                                            <td className="px-3 py-2 text-right whitespace-nowrap">
                                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {!readOnly && (
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={(e) => { e.stopPropagation(); setEditItem(item); setFormOpen(true); }} title="Edit">
                                                            <Pencil className="h-3.5 w-3.5" />
                                                        </Button>
                                                    )}
                                                    {!readOnly && (
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-orange-600 hover:bg-orange-50" onClick={(e) => { e.stopPropagation(); setDeliverItem(item); }} title="Move to Delivered">
                                                            <Truck className="h-3.5 w-3.5" />
                                                        </Button>
                                                    )}
                                                    {!readOnly && (
                                                        <Button variant="ghost" size="icon" className="h-6 w-6 rounded-md" onClick={(e) => { e.stopPropagation(); setSelectedItem(item); }} title="Reassign">
                                                            <ArrowRightLeft className="h-3 w-3" />
                                                        </Button>
                                                    )}
                                                    {!readOnly && (
                                                        <Button variant="ghost" size="icon" className="h-6 w-6 rounded-md text-destructive hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(item.id); }} title="Delete">
                                                            <Trash2 className="h-3 w-3" />
                                                        </Button>
                                                    )}
                                                    {readOnly && onRequestHold && (
                                                        <Button variant="outline" size="sm" className="h-7 rounded-lg text-[9px] font-black uppercase tracking-widest px-2 gap-1 border-2 border-primary/30 text-primary hover:bg-primary hover:text-white" onClick={(e) => { e.stopPropagation(); onRequestHold(item); }} title="Request Hold">
                                                            <Shield className="h-3 w-3" />
                                                            Hold
                                                        </Button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </ScrollArea>
                </div>
                </>
            )}

            <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
                <DialogContent className="rounded-3xl border-4 shadow-2xl p-0 overflow-hidden">
                    <DialogHeader className="p-8 bg-muted/5 border-b">
                        <DialogTitle className="text-2xl font-black uppercase tracking-tight">Assign Asset</DialogTitle>
                        <DialogDescription className="text-[10px] font-black uppercase tracking-widest text-primary mt-1">
                            Strategic relocation of unit <strong>{selectedItem?.stockNumber}</strong>
                        </DialogDescription>
                    </DialogHeader>
                    <div className="p-8 space-y-6">
                        <div className="space-y-3">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Destination Organization</Label>
                            <Select value={targetId} onValueChange={setTargetId}>
                                <SelectTrigger className="h-14 rounded-xl border-2 font-black text-sm bg-background px-6">
                                    <SelectValue placeholder="Select target..." />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-2">
                                    {availableTargets.map(target => (
                                        <SelectItem key={target.id} value={target.id} className="font-bold text-[10px] uppercase py-3">{target.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter className="p-8 border-t bg-muted/5 gap-3">
                        <DialogClose asChild><Button variant="outline" className="h-12 px-8 rounded-xl font-black uppercase text-[10px]">Cancel</Button></DialogClose>
                        <Button onClick={handleAssign} disabled={isAssigning || !targetId} className="h-12 px-10 rounded-xl font-black uppercase text-[10px] shadow-xl">
                            {isAssigning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                            Execute
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <StockItemDetail
                item={detailItem}
                onClose={() => setDetailItem(null)}
                readOnly={readOnly}
            />
            <StockItemForm
                open={formOpen}
                onOpenChange={setFormOpen}
                item={editItem}
                moduleId={moduleId}
                organisationId={organisation?.id || ''}
                locations={locations}
                onSaved={() => { setFormOpen(false); setEditItem(null); }}
            />
            <MoveToDelivered
                item={deliverItem}
                open={!!deliverItem}
                onOpenChange={(open) => { if (!open) setDeliverItem(null); }}
                onComplete={() => setDeliverItem(null)}
            />
            <Dialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
                <DialogContent className="rounded-3xl border-4 shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black uppercase tracking-tight">Delete Stock Item</DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground">
                            Are you sure you want to delete this item? This cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                        <DialogClose asChild>
                            <Button variant="outline" className="rounded-xl">Cancel</Button>
                        </DialogClose>
                        <Button variant="destructive" className="rounded-xl font-black uppercase text-[10px]" onClick={() => { handleDeleteItem(deleteConfirmId!); setDeleteConfirmId(null); }}>
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <Dialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
                <DialogContent className="rounded-3xl border-4 shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black uppercase tracking-tight">Delete {selectedIds.size} Items</DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground">
                            Are you sure? This cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                        <DialogClose asChild><Button variant="outline" className="rounded-xl">Cancel</Button></DialogClose>
                        <Button variant="destructive" className="rounded-xl font-black uppercase text-[10px]" onClick={handleBulkDelete}>
                            Delete {selectedIds.size} Item{selectedIds.size !== 1 ? 's' : ''}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

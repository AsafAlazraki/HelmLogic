'use client';

import { useMemo, useState } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, Minus, ChevronUp, ChevronDown, Truck } from 'lucide-react';

interface DeliveredDeal {
    id: string;
    name: string;
    daysInStock: number;
    status: string;
    consignmentWith: string;
    soldBy: string;
    stockNumber: string;
    label: string;
    model: string;
    colour: string;
    serialNumber: string;
    material: string;
    location: string;
    poOrDealNumber: string;
    customerNotes: string;
    deliveryDate: any;
    etaSoldDate: any;
    motor: string;
    motorSerialNumber: string;
    trailer: string;
    invoiced: boolean;
    depositPaid: boolean;
    paidInFull: boolean;
    packageDetails: string;
    invoicedAmount: number;
    isHullOnly: boolean;
    warrantyRegistered: boolean;
    moduleId: string;
    organisationId: string;
    createdAt: any;
    sourceInventoryId: string;
}

interface DeliveredDealsProps {
    organisation: any;
    moduleId: string;
    isAdmin: boolean;
    readOnly?: boolean;
    hideHeader?: boolean;
    compact?: boolean;
}

type SortDirection = 'asc' | 'desc';

function formatDate(value: any): string {
    if (!value) return '—';
    const date = value?.toDate ? value.toDate() : new Date(value);
    if (isNaN(date.getTime())) return '—';
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
}

function formatCurrency(value: number | null | undefined): string {
    if (value == null) return '—';
    return `$${value.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function BooleanCell({ value }: { value: boolean }) {
    return value ? (
        <Check className="h-3.5 w-3.5 text-emerald-500 mx-auto" />
    ) : (
        <Minus className="h-3 w-3 text-slate-300 mx-auto" />
    );
}

function StatusBadge({ status }: { status: string }) {
    const s = (status || '').toLowerCase();
    let variant: 'default' | 'secondary' | 'outline' = 'secondary';
    let className = '';

    if (s === 'delivered') {
        className = 'bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100';
    } else if (s.includes('pending')) {
        className = 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100';
    } else if (s === 'sold') {
        className = 'bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-100';
    }

    return (
        <Badge variant="outline" className={`text-[8px] font-bold whitespace-nowrap ${className}`}>
            {status || '—'}
        </Badge>
    );
}

function MaterialBadge({ material }: { material: string }) {
    const m = (material || '').toUpperCase();
    let className = '';

    if (m === 'PVC') {
        className = 'bg-red-100 text-red-700 border-red-200 hover:bg-red-100';
    } else if (m === 'HYP') {
        className = 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-100';
    }

    return (
        <Badge variant="outline" className={`text-[8px] font-bold ${className}`}>
            {material || '—'}
        </Badge>
    );
}

interface ColumnDef {
    key: string;
    label: string;
    sortKey: keyof DeliveredDeal;
    className?: string;
    headerClassName?: string;
    render: (deal: DeliveredDeal) => React.ReactNode;
}

const ALL_COLUMNS: ColumnDef[] = [
    {
        key: 'daysInStock', label: 'Days', sortKey: 'daysInStock',
        className: 'text-center',
        headerClassName: 'text-center',
        render: (d) => <span className="font-mono text-[10px]">{d.daysInStock ?? '—'}</span>,
    },
    {
        key: 'status', label: 'Status', sortKey: 'status',
        render: (d) => <StatusBadge status={d.status} />,
    },
    {
        key: 'consignmentWith', label: 'Consignment With', sortKey: 'consignmentWith',
        render: (d) => <span className="truncate max-w-[120px] block">{d.consignmentWith || '—'}</span>,
    },
    {
        key: 'soldBy', label: 'Sold By', sortKey: 'soldBy',
        render: (d) => <span>{d.soldBy || '—'}</span>,
    },
    {
        key: 'stockNumber', label: 'Stock #', sortKey: 'stockNumber',
        render: (d) => <span className="font-mono font-bold text-[10px]">{d.stockNumber || '—'}</span>,
    },
    {
        key: 'label', label: 'Label', sortKey: 'label',
        render: (d) => <span>{d.label || '—'}</span>,
    },
    {
        key: 'model', label: 'Model', sortKey: 'model',
        render: (d) => <span className="font-semibold">{d.model || '—'}</span>,
    },
    {
        key: 'colour', label: 'Colour', sortKey: 'colour',
        render: (d) => <span>{d.colour || '—'}</span>,
    },
    {
        key: 'serialNumber', label: 'Serial #', sortKey: 'serialNumber',
        render: (d) => <span className="font-mono text-[10px]">{d.serialNumber || '—'}</span>,
    },
    {
        key: 'material', label: 'Material', sortKey: 'material',
        render: (d) => <MaterialBadge material={d.material} />,
    },
    {
        key: 'location', label: 'Location', sortKey: 'location',
        render: (d) => <span>{d.location || '—'}</span>,
    },
    {
        key: 'poOrDealNumber', label: 'P/O or Deal #', sortKey: 'poOrDealNumber',
        render: (d) => <span className="font-mono text-[10px]">{d.poOrDealNumber || '—'}</span>,
    },
    {
        key: 'customerNotes', label: 'Customer / Notes', sortKey: 'customerNotes',
        render: (d) => (
            <span className="truncate max-w-[150px] block" title={d.customerNotes || ''}>
                {d.customerNotes || '—'}
            </span>
        ),
    },
    {
        key: 'deliveryDate', label: 'Delivery Date', sortKey: 'deliveryDate',
        render: (d) => <span className="whitespace-nowrap">{formatDate(d.deliveryDate)}</span>,
    },
    {
        key: 'etaSoldDate', label: 'ETA / Sold Date', sortKey: 'etaSoldDate',
        render: (d) => <span className="whitespace-nowrap">{formatDate(d.etaSoldDate)}</span>,
    },
    {
        key: 'motor', label: 'Motor', sortKey: 'motor',
        render: (d) => <span>{d.motor || '—'}</span>,
    },
    {
        key: 'motorSerialNumber', label: 'Motor S/N', sortKey: 'motorSerialNumber',
        render: (d) => <span className="font-mono text-[10px]">{d.motorSerialNumber || '—'}</span>,
    },
    {
        key: 'trailer', label: 'Trailer', sortKey: 'trailer',
        render: (d) => <span>{d.trailer || '—'}</span>,
    },
    {
        key: 'invoiced', label: 'Invoiced', sortKey: 'invoiced',
        className: 'text-center',
        headerClassName: 'text-center',
        render: (d) => <BooleanCell value={!!d.invoiced} />,
    },
    {
        key: 'depositPaid', label: 'Deposit', sortKey: 'depositPaid',
        className: 'text-center',
        headerClassName: 'text-center',
        render: (d) => <BooleanCell value={!!d.depositPaid} />,
    },
    {
        key: 'paidInFull', label: 'Paid Full', sortKey: 'paidInFull',
        className: 'text-center',
        headerClassName: 'text-center',
        render: (d) => <BooleanCell value={!!d.paidInFull} />,
    },
    {
        key: 'packageDetails', label: 'Package', sortKey: 'packageDetails',
        render: (d) => (
            <span className="truncate max-w-[120px] block" title={d.packageDetails || ''}>
                {d.packageDetails || '—'}
            </span>
        ),
    },
    {
        key: 'invoicedAmount', label: 'Amount', sortKey: 'invoicedAmount',
        className: 'text-right font-mono',
        headerClassName: 'text-right',
        render: (d) => <span className="font-mono whitespace-nowrap">{formatCurrency(d.invoicedAmount)}</span>,
    },
    {
        key: 'isHullOnly', label: 'Hull Only', sortKey: 'isHullOnly',
        className: 'text-center',
        headerClassName: 'text-center',
        render: (d) => <BooleanCell value={!!d.isHullOnly} />,
    },
    {
        key: 'warrantyRegistered', label: 'Warranty', sortKey: 'warrantyRegistered',
        className: 'text-center',
        headerClassName: 'text-center',
        render: (d) => <BooleanCell value={!!d.warrantyRegistered} />,
    },
];

const COMPACT_KEYS = new Set([
    'stockNumber', 'model', 'colour', 'status', 'customerNotes', 'deliveryDate', 'invoicedAmount',
]);

function getSortValue(deal: DeliveredDeal, key: keyof DeliveredDeal): string | number {
    const val = deal[key];
    if (val == null) return '';
    if (typeof val === 'boolean') return val ? 1 : 0;
    if (typeof val === 'number') return val;
    if (val?.toDate) return val.toDate().getTime();
    if (val instanceof Date) return val.getTime();
    return String(val).toLowerCase();
}

export function DeliveredDeals({
    organisation,
    moduleId,
    isAdmin,
    readOnly = false,
    hideHeader = false,
    compact = false,
}: DeliveredDealsProps) {
    const firestore = useFirestore();

    const dealsQuery = useMemoFirebase(() => {
        if (!organisation?.id) return null;
        return query(
            collection(firestore, 'delivered-deals'),
            where('moduleId', '==', moduleId),
            where('organisationId', '==', organisation.id)
        );
    }, [firestore, moduleId, organisation?.id]);

    const { data: deals, loading } = useCollection<DeliveredDeal>(dealsQuery);

    const [sortKey, setSortKey] = useState<keyof DeliveredDeal>('deliveryDate');
    const [sortDir, setSortDir] = useState<SortDirection>('desc');

    const columns = useMemo(
        () => compact ? ALL_COLUMNS.filter((c) => COMPACT_KEYS.has(c.key)) : ALL_COLUMNS,
        [compact]
    );

    const sortedDeals = useMemo(() => {
        if (!deals) return [];
        return [...deals].sort((a, b) => {
            const aVal = getSortValue(a, sortKey);
            const bVal = getSortValue(b, sortKey);
            if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
    }, [deals, sortKey, sortDir]);

    const handleSort = (key: keyof DeliveredDeal) => {
        if (sortKey === key) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center p-12">
                <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {!hideHeader && (
                <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
                    <Truck className="h-4 w-4 text-slate-400" />
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Delivered Deals
                    </h3>
                    {deals && deals.length > 0 && (
                        <Badge variant="secondary" className="text-[9px] font-bold h-5 px-2">
                            {deals.length}
                        </Badge>
                    )}
                </div>
            )}

            {(!deals || deals.length === 0) ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
                    <Truck className="h-8 w-8 text-muted-foreground/20" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                        No delivered deals yet
                    </p>
                </div>
            ) : (
                <div className="flex-1 overflow-hidden">
                    <div className="overflow-x-auto h-full">
                        <div className="rounded-2xl border-2 border-slate-100 overflow-hidden min-w-max">
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 sticky top-0 z-10">
                                        {columns.map((col) => (
                                            <th
                                                key={col.key}
                                                className={`px-3 py-2.5 text-left text-[9px] font-black uppercase tracking-widest text-slate-400 cursor-pointer select-none hover:text-slate-600 transition-colors whitespace-nowrap ${col.headerClassName || ''}`}
                                                onClick={() => handleSort(col.sortKey)}
                                            >
                                                <span className="inline-flex items-center gap-1">
                                                    {col.label}
                                                    {sortKey === col.sortKey && (
                                                        sortDir === 'asc'
                                                            ? <ChevronUp className="h-3 w-3" />
                                                            : <ChevronDown className="h-3 w-3" />
                                                    )}
                                                </span>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedDeals.map((deal) => (
                                        <tr
                                            key={deal.id}
                                            className="text-xs hover:bg-slate-50/50 border-b border-slate-100 cursor-pointer transition-colors"
                                        >
                                            {columns.map((col) => (
                                                <td
                                                    key={col.key}
                                                    className={`px-3 py-2 whitespace-nowrap ${col.className || ''}`}
                                                >
                                                    {col.render(deal)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

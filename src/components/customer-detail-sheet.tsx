'use client';

/**
 * CustomerDetailSheet (v1.21 — Story 8.1.2).
 *
 * One sheet that shows everything about a customer: contact details,
 * lifecycle stage, source, primary/secondary buyer, trade-in, and the
 * customer's linked quotes (cross-referenced from the org's quote set).
 *
 * Reads the v1.12 customers/{id} schema (withCustomerDefaults applied)
 * and surfaces the trade-in (v1.21/1.5.5) when present.
 */

import { useMemo } from 'react';
import { collectionGroup, query, where } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useMemoFirebase } from '@/firebase/provider';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { User, Mail, Phone, Building, Tag, GitBranch, Repeat, FileText } from 'lucide-react';
import { withCustomerDefaults, type Customer } from '@/lib/customer-types';

interface CustomerDetailSheetProps {
    open: boolean;
    onOpenChange: (next: boolean) => void;
    customer: Customer | null;
}

export function CustomerDetailSheet({ open, onOpenChange, customer }: CustomerDetailSheetProps) {
    const firestore = useFirestore();

    const full = useMemo(() => customer ? withCustomerDefaults(customer as any) : null, [customer]);

    // Linked quotes — collection-group query over every user's quotes
    // filtered to this customer id. Quotes denormalise customerId at
    // finalize time.
    const quotesQuery = useMemoFirebase(
        () => full ? query(collectionGroup(firestore, 'quotes'), where('customerId', '==', full.id)) : null,
        [firestore, full?.id],
    );
    const { data: quotes } = useCollection<any>(quotesQuery);

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-full sm:max-w-lg overflow-y-auto" data-testid="customer-detail-sheet">
                <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        {full?.name ?? 'Customer'}
                    </SheetTitle>
                    <SheetDescription className="text-xs">
                        Full customer record: contact, lifecycle, buyers, trade-in, and linked quotes.
                    </SheetDescription>
                </SheetHeader>

                {!full ? null : (
                    <div className="space-y-5 mt-4">
                        {/* Lifecycle + source */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <Badge className="text-[10px] font-bold uppercase">
                                <GitBranch className="h-2.5 w-2.5 mr-1" /> {full.lifecycleStage}
                            </Badge>
                            {full.source && (
                                <Badge variant="outline" className="text-[10px] font-bold">
                                    <Tag className="h-2.5 w-2.5 mr-1" /> {full.source}
                                </Badge>
                            )}
                        </div>

                        {/* Contact */}
                        <div className="rounded-2xl border-2 p-4 space-y-2">
                            <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Contact</p>
                            <div className="text-xs space-y-1.5">
                                {full.email && <div className="flex items-center gap-2"><Mail className="h-3 w-3 text-muted-foreground" /> {full.email}</div>}
                                {full.phone && <div className="flex items-center gap-2"><Phone className="h-3 w-3 text-muted-foreground" /> {full.phone}</div>}
                                {full.company && <div className="flex items-center gap-2"><Building className="h-3 w-3 text-muted-foreground" /> {full.company}</div>}
                            </div>
                        </div>

                        {/* Buyers */}
                        {(full.primaryBuyer || full.secondaryBuyer) && (
                            <div className="rounded-2xl border-2 p-4 space-y-2">
                                <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Buyers</p>
                                {full.primaryBuyer && (
                                    <div className="text-xs">
                                        <span className="font-bold">{full.primaryBuyer.name}</span>
                                        <span className="text-muted-foreground"> · primary{full.primaryBuyer.role ? ` · ${full.primaryBuyer.role}` : ''}</span>
                                    </div>
                                )}
                                {full.secondaryBuyer && (
                                    <div className="text-xs">
                                        <span className="font-bold">{full.secondaryBuyer.name}</span>
                                        <span className="text-muted-foreground"> · secondary{full.secondaryBuyer.role ? ` · ${full.secondaryBuyer.role}` : ''}</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Trade-in */}
                        {full.tradeIn && (
                            <div className="rounded-2xl border-2 p-4">
                                <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-1.5">
                                    <Repeat className="h-3 w-3" /> Trade-in
                                </p>
                                <p className="text-xs font-bold mt-1">{full.tradeIn.label ?? full.tradeIn.tradeInId}</p>
                            </div>
                        )}

                        {/* Linked quotes */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-1.5">
                                    <FileText className="h-3 w-3" /> Linked quotes
                                </p>
                                <p className="text-[10px] text-muted-foreground">{(quotes ?? []).length}</p>
                            </div>
                            {(quotes ?? []).length === 0 ? (
                                <p className="text-[11px] text-muted-foreground italic">No quotes linked to this customer yet.</p>
                            ) : (
                                <div className="space-y-1.5">
                                    {(quotes ?? []).map((q: any) => (
                                        <div key={q.id} className="flex items-center justify-between text-xs border-b py-1.5">
                                            <span className="truncate font-bold">{q.quoteNumber ?? q.id?.slice(0, 8)}</span>
                                            <div className="flex items-center gap-2">
                                                {q.lifecycleState && <Badge variant="outline" className="text-[9px]">{q.lifecycleState}</Badge>}
                                                <span className="tabular-nums">${Number(q.financials?.totalInclGst ?? q.totalInclGst ?? 0).toLocaleString('en-AU')}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}

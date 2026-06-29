'use client';

/**
 * ContractDetailSheet (v1.20 — Story 2.4.1 + 2.4.2 surface).
 *
 * Opens from the proposal view when quote.contractId is set. Shows:
 *   - Contract reference + state.
 *   - Snapshot line items.
 *   - Subtotal / GST / total.
 *   - List of deposits recorded against this contract (live).
 *   - Record Deposit button that opens RecordDepositDialog.
 *
 * Reads:
 *   users/{uid}/quotes/{qid}/contracts/{cid}                  (one doc)
 *   users/{uid}/quotes/{qid}/contracts/{cid}/deposits/*       (live list)
 */

import { useState, useMemo } from 'react';
import { doc, collection, query, orderBy } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useMemoFirebase } from '@/firebase/provider';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileSignature, Receipt, Loader2 } from 'lucide-react';
import { RecordDepositDialog } from '@/components/record-deposit-dialog';
import { ContractSigningPackButton } from '@/components/contract-signing-pack-button';
import { PAYMENT_METHOD_LABEL, computeDepositTotals } from '@/lib/catalog/deposit';
import { buildPaymentSchedule, applyDepositPaid, outstandingBalance, totalPaid } from '@/lib/catalog/payment-schedule';

interface ContractDetailSheetProps {
    open: boolean;
    onOpenChange: (next: boolean) => void;
    ownerUid: string;
    quoteId: string;
    contractId: string;
    orgShortCode?: string;
}

const STATE_TONE: Record<string, string> = {
    'pending-signature': 'bg-amber-100 text-amber-800 border-amber-300',
    'signed': 'bg-emerald-100 text-emerald-800 border-emerald-300',
    'cancelled': 'bg-rose-100 text-rose-800 border-rose-300',
};

export function ContractDetailSheet({ open, onOpenChange, ownerUid, quoteId, contractId, orgShortCode }: ContractDetailSheetProps) {
    const firestore = useFirestore();
    const [depositOpen, setDepositOpen] = useState(false);

    const contractRef = useMemoFirebase(
        () => doc(firestore, 'users', ownerUid, 'quotes', quoteId, 'contracts', contractId),
        [firestore, ownerUid, quoteId, contractId],
    );
    const { data: contract, isLoading } = useDoc<any>(contractRef);

    const depositsRef = useMemoFirebase(
        () => query(collection(firestore, 'users', ownerUid, 'quotes', quoteId, 'contracts', contractId, 'deposits'), orderBy('createdAt', 'desc')),
        [firestore, ownerUid, quoteId, contractId],
    );
    const { data: deposits } = useCollection<any>(depositsRef);

    // v1.23 (Story 2.4.3) — payment schedule derived from the contract
    // total + org payment-milestone defaults. Deposit line flips paid
    // once any deposit doc exists.
    const schedule = useMemo(() => {
        if (!contract) return [];
        // Org payment-milestone defaults flow in via a later polish pass;
        // for now buildPaymentSchedule applies sensible fallbacks
        // (10% deposit + balance on delivery).
        let lines = buildPaymentSchedule(Number(contract.totalInclGst ?? 0), {});
        if ((deposits ?? []).length > 0) lines = applyDepositPaid(lines, (deposits ?? [])[0]?.createdAt);
        return lines;
    }, [contract, deposits]);

    return (
        <>
            <Sheet open={open} onOpenChange={onOpenChange}>
                <SheetContent className="w-full sm:max-w-lg overflow-y-auto" data-testid="contract-detail-sheet">
                    <SheetHeader>
                        <SheetTitle className="flex items-center gap-2">
                            <FileSignature className="h-4 w-4" />
                            Contract
                        </SheetTitle>
                        <SheetDescription className="text-xs">
                            Snapshot of the quote at convert time. Variations after this point flow through the variations editor.
                        </SheetDescription>
                    </SheetHeader>

                    {isLoading || !contract ? (
                        <div className="flex items-center justify-center py-12 text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            <span className="text-xs">Loading contract…</span>
                        </div>
                    ) : (
                        <div className="space-y-5 mt-4">
                            <div className="rounded-2xl border-2 p-4 bg-slate-50/60 space-y-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <p className="font-mono text-xs font-bold">{contract.contractReference}</p>
                                    <Badge className={`${STATE_TONE[contract.state] ?? ''} text-[10px] font-bold uppercase`}>{contract.state}</Badge>
                                    <div className="ml-auto">
                                        <ContractSigningPackButton
                                            ownerUid={ownerUid}
                                            quoteId={quoteId}
                                            contractId={contractId}
                                            contractReference={contract.contractReference}
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-xs pt-2">
                                    <div>
                                        <p className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground">Subtotal</p>
                                        <p className="font-bold">${Number(contract.subtotalExclGst ?? 0).toLocaleString('en-AU')}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground">GST</p>
                                        <p className="font-bold">${Number(contract.gstAmount ?? 0).toLocaleString('en-AU')}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground">Total inc</p>
                                        <p className="font-black">${Number(contract.totalInclGst ?? 0).toLocaleString('en-AU')}</p>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Snapshot lines</p>
                                    <p className="text-[10px] text-muted-foreground">{(contract.snapshotLines ?? []).length} item(s)</p>
                                </div>
                                <div className="space-y-1.5">
                                    {(contract.snapshotLines ?? []).map((line: any, i: number) => (
                                        <div key={i} className="flex items-center justify-between text-xs border-b py-1.5">
                                            <span className="truncate font-bold">{line.label}</span>
                                            <span className="font-bold tabular-nums">${Number(line.lineTotalExclGst ?? 0).toLocaleString('en-AU')}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Deposits</p>
                                    <Button
                                        size="sm"
                                        onClick={() => setDepositOpen(true)}
                                        className="h-7 px-3 rounded-lg text-[10px] font-bold uppercase tracking-widest"
                                        data-testid="record-deposit-button"
                                    >
                                        <Receipt className="h-3 w-3 mr-1" /> Record deposit
                                    </Button>
                                </div>
                                {(deposits ?? []).length === 0 ? (
                                    <p className="text-[11px] text-muted-foreground italic">No deposits recorded yet.</p>
                                ) : (
                                    <div className="space-y-2">
                                        {(deposits ?? []).map((d: any) => {
                                            const totals = computeDepositTotals(Number(d.amountExclGst ?? 0));
                                            return (
                                                <div key={d.id} className="rounded-xl border-2 p-3 text-xs flex items-center justify-between">
                                                    <div>
                                                        <p className="font-mono text-[10px]">{d.receiptReference}</p>
                                                        <p className="text-[10px] text-muted-foreground">
                                                            {PAYMENT_METHOD_LABEL[d.paymentMethod as 'cash' | 'eft' | 'cheque' | 'card' | 'other'] ?? d.paymentMethod}
                                                            {d.customerReference ? ` · ${d.customerReference}` : ''}
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="font-black">${totals.amountInclGst.toLocaleString('en-AU')}</p>
                                                        <p className="text-[9px] text-muted-foreground">inc GST</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* v1.23 (Story 2.4.3) — Payment schedule. */}
                            <div data-testid="payment-schedule">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Payment schedule</p>
                                    <p className="text-[10px] text-muted-foreground">
                                        ${totalPaid(schedule).toLocaleString('en-AU')} paid · ${outstandingBalance(schedule).toLocaleString('en-AU')} due
                                    </p>
                                </div>
                                <div className="space-y-1.5">
                                    {schedule.map(line => (
                                        <div key={line.key} className="flex items-center justify-between text-xs border-b py-1.5">
                                            <span className="flex items-center gap-2">
                                                <span className={`h-2 w-2 rounded-full ${line.paid ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                                {line.label} <span className="text-muted-foreground">({line.percentage}%)</span>
                                            </span>
                                            <span className="tabular-nums font-bold">${line.amountIncGst.toLocaleString('en-AU')}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </SheetContent>
            </Sheet>
            <RecordDepositDialog
                open={depositOpen}
                onOpenChange={setDepositOpen}
                ownerUid={ownerUid}
                quoteId={quoteId}
                contractId={contractId}
                orgShortCode={orgShortCode}
            />
        </>
    );
}

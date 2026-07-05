'use client';

/**
 * RecordDepositDialog (v1.20 — Story 2.4.2).
 *
 * Operator surface for recording a deposit against a contract. Writes
 * the deposit doc to
 *   users/{ownerUid}/quotes/{qid}/contracts/{cid}/deposits/{depositId}
 * then renders a receipt PDF using the v1.18 pdf-branding.ts tokens
 * (separate component lands when the receipt PDF render is wired).
 *
 * Schema + helpers live in src/lib/catalog/deposit.ts.
 */

import { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useUser } from '@/firebase/auth/use-user';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Receipt } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
    buildReceiptReference,
    computeDepositTotals,
    PAYMENT_METHOD_LABEL,
    type DepositPaymentMethod,
} from '@/lib/catalog/deposit';

export function RecordDepositDialog({
    open,
    onOpenChange,
    ownerUid,
    quoteId,
    contractId,
    orgShortCode,
}: {
    open: boolean;
    onOpenChange: (next: boolean) => void;
    ownerUid: string;
    quoteId: string;
    contractId: string;
    orgShortCode?: string;
}) {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();
    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState<DepositPaymentMethod>('eft');
    const [customerReference, setCustomerReference] = useState('');
    const [paidAt, setPaidAt] = useState<string>(() => new Date().toISOString().slice(0, 10));
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!user) return;
        const amountExclGst = parseFloat(amount);
        if (!Number.isFinite(amountExclGst) || amountExclGst <= 0) {
            toast({ variant: 'destructive', title: 'Invalid amount', description: 'Enter a positive number for the deposit amount.' });
            return;
        }
        const paidDate = new Date(paidAt);
        if (Number.isNaN(paidDate.getTime())) {
            toast({ variant: 'destructive', title: 'Invalid paid date' });
            return;
        }
        setSaving(true);
        try {
            const totals = computeDepositTotals(amountExclGst);
            const ref = buildReceiptReference(orgShortCode ?? 'ORG', paidDate, 1);
            await addDoc(collection(firestore, 'users', ownerUid, 'quotes', quoteId, 'contracts', contractId, 'deposits'), {
                contractId,
                receiptNumber: 1,
                receiptReference: ref,
                amountExclGst: totals.amountExclGst,
                paymentMethod: method,
                customerReference: customerReference.trim() || null,
                paidAt: paidDate,
                receiptPdfUrl: null,
                createdAt: serverTimestamp(),
                createdByUid: user.uid,
                createdByName: user.displayName || user.email || 'Unknown',
            });
            toast({ title: 'Deposit recorded', description: `${ref} · $${totals.amountInclGst.toLocaleString('en-AU')} inc GST` });
            setAmount('');
            setCustomerReference('');
            onOpenChange(false);
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: err?.message ?? String(err) });
        } finally {
            setSaving(false);
        }
    };

    const previewTotals = (() => {
        const n = parseFloat(amount);
        if (!Number.isFinite(n) || n <= 0) return null;
        return computeDepositTotals(n);
    })();

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md" data-testid="record-deposit-dialog">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><Receipt className="h-4 w-4" /> Record deposit</DialogTitle>
                    <DialogDescription className="text-xs">
                        Recorded against the active contract. Receipt PDF generates after save.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <div>
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Amount (ex GST)</Label>
                        <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="5000.00"
                            autoFocus
                        />
                    </div>
                    {previewTotals && (
                        <div className="text-[10px] text-muted-foreground -mt-2">
                            inc GST: <span className="font-bold">${previewTotals.amountInclGst.toLocaleString('en-AU')}</span>
                        </div>
                    )}
                    <div>
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Payment method</Label>
                        <Select value={method} onValueChange={(v) => setMethod(v as DepositPaymentMethod)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {(['cash', 'eft', 'cheque', 'card', 'other'] as DepositPaymentMethod[]).map(m => (
                                    <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Paid on</Label>
                        <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
                    </div>
                    <div>
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Reference (optional)</Label>
                        <Input
                            value={customerReference}
                            onChange={(e) => setCustomerReference(e.target.value)}
                            placeholder="EFT ref, cheque #, card last 4"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
                    <Button onClick={handleSave} disabled={saving || !amount}>
                        {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                        Record deposit
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

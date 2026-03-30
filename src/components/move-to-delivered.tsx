'use client';

import { useState } from 'react';
import { collection, addDoc, deleteDoc, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Truck, Loader2 } from 'lucide-react';

interface MoveToDeliveredProps {
  item: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

export function MoveToDelivered({ item, open, onOpenChange, onComplete }: MoveToDeliveredProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // Deal fields
  const [status, setStatus] = useState('Delivered');
  const [onConsignmentWith, setOnConsignmentWith] = useState('');
  const [soldBy, setSoldBy] = useState(item?.soldBy || '');
  const [dealNumber, setDealNumber] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [etaSoldDate, setEtaSoldDate] = useState('');
  const [motor, setMotor] = useState('');
  const [motorSN, setMotorSN] = useState('');
  const [trailer, setTrailer] = useState('');
  const [packageDetails, setPackageDetails] = useState('');
  const [invoicedAmount, setInvoicedAmount] = useState('');
  const [location, setLocation] = useState(item?.location || '');

  // Boolean toggles
  const [invoiced, setInvoiced] = useState(false);
  const [depositPaid, setDepositPaid] = useState(false);
  const [paidInFull, setPaidInFull] = useState(false);
  const [isHullOnly, setIsHullOnly] = useState(false);
  const [warrantyRegistered, setWarrantyRegistered] = useState(false);

  // Reset form when item changes
  const resetForm = () => {
    setStatus('Delivered');
    setOnConsignmentWith('');
    setSoldBy(item?.soldBy || '');
    setDealNumber('');
    setCustomerNotes('');
    setDeliveryDate('');
    setEtaSoldDate('');
    setMotor('');
    setMotorSN('');
    setTrailer('');
    setPackageDetails('');
    setInvoicedAmount('');
    setLocation(item?.location || '');
    setInvoiced(false);
    setDepositPaid(false);
    setPaidInFull(false);
    setIsHullOnly(false);
    setWarrantyRegistered(false);
  };

  const handleOpenChange = (val: boolean) => {
    if (!val) resetForm();
    onOpenChange(val);
  };

  const handleSubmit = async () => {
    if (!item) return;
    setLoading(true);
    try {
      await addDoc(collection(firestore, 'delivered-deals'), {
        name: item.name || '',
        stockNumber: item.stockNumber || '',
        model: item.model || '',
        colour: item.colour || '',
        serialNumber: item.serialNumber || '',
        material: item.material || '',
        label: item.label || '',
        location,
        status,
        onConsignmentWith,
        soldBy,
        dealNumber,
        customerNotes,
        deliveryDate: deliveryDate ? Timestamp.fromDate(new Date(deliveryDate)) : null,
        etaSoldDate: etaSoldDate ? Timestamp.fromDate(new Date(etaSoldDate)) : null,
        motor,
        motorSN,
        trailer,
        packageDetails,
        invoicedAmount: invoicedAmount ? parseFloat(invoicedAmount) : null,
        invoiced,
        depositPaid,
        paidInFull,
        isHullOnly,
        warrantyRegistered,
        moduleId: item.moduleId || null,
        organisationId: item.organisationId || null,
        sourceInventoryId: item.id,
        dateIntoStock: item.dateIntoStock || null,
        createdAt: serverTimestamp(),
      });

      await deleteDoc(doc(firestore, 'inventory', item.id));

      toast({ title: 'Moved to Delivered Deals' });
      resetForm();
      onOpenChange(false);
      onComplete?.();
    } catch (err) {
      console.error('Failed to move to delivered deals:', err);
      toast({ title: 'Error', description: 'Failed to move item. Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (!item) return null;

  const toggleBtn = (label: string, value: boolean, setter: (v: boolean) => void) => (
    <button
      type="button"
      onClick={() => setter(!value)}
      className={`px-3 py-2 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-colors ${
        value
          ? 'bg-green-100 border-green-300 text-green-700'
          : 'bg-slate-50 border-slate-200 text-slate-400'
      }`}
    >
      {label}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="rounded-3xl border-4 shadow-2xl p-0 overflow-hidden max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader className="p-6 bg-muted/5 border-b">
          <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Move to Delivered Deals
          </DialogTitle>
        </DialogHeader>

        <div className="p-6 space-y-4">
          {/* Pre-filled readonly fields */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Name</Label>
              <Input value={item.name || ''} readOnly className="rounded-xl border-2 bg-muted/30" />
            </div>
            <div>
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Stock Number</Label>
              <Input value={item.stockNumber || ''} readOnly className="rounded-xl border-2 bg-muted/30" />
            </div>
            <div>
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Model</Label>
              <Input value={item.model || ''} readOnly className="rounded-xl border-2 bg-muted/30" />
            </div>
            <div>
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Colour</Label>
              <Input value={item.colour || ''} readOnly className="rounded-xl border-2 bg-muted/30" />
            </div>
            <div>
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Serial Number</Label>
              <Input value={item.serialNumber || ''} readOnly className="rounded-xl border-2 bg-muted/30" />
            </div>
            <div>
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Material</Label>
              <Input value={item.material || ''} readOnly className="rounded-xl border-2 bg-muted/30" />
            </div>
            <div>
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Location</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} className="rounded-xl border-2" />
            </div>
          </div>

          {/* Deal fields */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="rounded-xl border-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Delivered">Delivered</SelectItem>
                  <SelectItem value="Pending Delivery">Pending Delivery</SelectItem>
                  <SelectItem value="Sold">Sold</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">On Consignment With</Label>
              <Input value={onConsignmentWith} onChange={(e) => setOnConsignmentWith(e.target.value)} className="rounded-xl border-2" />
            </div>
            <div>
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sold By</Label>
              <Input value={soldBy} onChange={(e) => setSoldBy(e.target.value)} className="rounded-xl border-2" />
            </div>
            <div>
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">P/O or Deal #</Label>
              <Input value={dealNumber} onChange={(e) => setDealNumber(e.target.value)} className="rounded-xl border-2" />
            </div>
            <div className="col-span-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Customer Name / Notes</Label>
              <Textarea value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} className="rounded-xl border-2" rows={2} />
            </div>
            <div>
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Delivery Date</Label>
              <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className="rounded-xl border-2" />
            </div>
            <div>
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">ETA / Sold Date</Label>
              <Input type="date" value={etaSoldDate} onChange={(e) => setEtaSoldDate(e.target.value)} className="rounded-xl border-2" />
            </div>
            <div>
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Motor</Label>
              <Input value={motor} onChange={(e) => setMotor(e.target.value)} className="rounded-xl border-2" />
            </div>
            <div>
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Motor S/N</Label>
              <Input value={motorSN} onChange={(e) => setMotorSN(e.target.value)} className="rounded-xl border-2" />
            </div>
            <div>
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Trailer</Label>
              <Input value={trailer} onChange={(e) => setTrailer(e.target.value)} className="rounded-xl border-2" />
            </div>
            <div className="col-span-2 md:col-span-3">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Package Details</Label>
              <Textarea value={packageDetails} onChange={(e) => setPackageDetails(e.target.value)} className="rounded-xl border-2" rows={2} />
            </div>
            <div>
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Invoiced Amount</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  type="number"
                  value={invoicedAmount}
                  onChange={(e) => setInvoicedAmount(e.target.value)}
                  className="rounded-xl border-2 pl-7"
                  step="0.01"
                />
              </div>
            </div>
          </div>

          {/* Boolean toggles */}
          <div className="flex flex-wrap gap-2">
            {toggleBtn('Invoiced', invoiced, setInvoiced)}
            {toggleBtn('Deposit Paid', depositPaid, setDepositPaid)}
            {toggleBtn('Paid in Full', paidInFull, setPaidInFull)}
            {toggleBtn('Is Hull Only', isHullOnly, setIsHullOnly)}
            {toggleBtn('Warranty Registered', warrantyRegistered, setWarrantyRegistered)}
          </div>
        </div>

        <DialogFooter className="p-6 border-t bg-muted/5">
          <Button variant="outline" onClick={() => handleOpenChange(false)} className="rounded-xl border-2 font-black uppercase text-[10px] h-12 px-8">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading} className="rounded-xl font-black uppercase text-[10px] h-12 px-8">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Truck className="h-4 w-4 mr-2" />}
            Move to Delivered
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

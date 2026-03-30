'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { collection, doc, addDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useToast } from '@/hooks/use-toast';

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
  dateIntoStock: any;
  photoUrls: string[];
  pdfAttachments: { name: string; url: string; uploadedAt: any }[];
}

interface StockItemFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: InventoryItem | null;
  moduleId: string;
  organisationId: string;
  locations: string[];
  onSaved?: () => void;
}

function generateStockNumber(organisationId: string): string {
  const orgCode = organisationId.substring(0, 3).toUpperCase();
  const timestamp = Date.now().toString().slice(-6);
  return `${orgCode}-S${timestamp}`;
}

function formatTimestampToDateString(timestamp: any): string {
  if (!timestamp) return '';
  if (timestamp.toDate) {
    const d = timestamp.toDate();
    return d.toISOString().split('T')[0];
  }
  if (timestamp instanceof Date) {
    return timestamp.toISOString().split('T')[0];
  }
  return '';
}

export function StockItemForm({
  open,
  onOpenChange,
  item,
  moduleId,
  organisationId,
  locations,
  onSaved,
}: StockItemFormProps) {
  const firestore = useFirestore();
  const { toast } = useToast();

  const isEditMode = !!item;

  const [name, setName] = useState('');
  const [stockNumber, setStockNumber] = useState('');
  const [status, setStatus] = useState('');
  const [material, setMaterial] = useState('');
  const [model, setModel] = useState('');
  const [colour, setColour] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [label, setLabel] = useState('');
  const [location, setLocation] = useState('');
  const [soldBy, setSoldBy] = useState('');
  const [dateIntoStock, setDateIntoStock] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset form when dialog opens or item changes
  useEffect(() => {
    if (open) {
      if (item) {
        setName(item.name || '');
        setStockNumber(item.stockNumber || '');
        setStatus(item.status || '');
        setMaterial(item.material || '');
        setModel(item.model || '');
        setColour(item.colour || '');
        setSerialNumber(item.serialNumber || '');
        setLabel(item.label || '');
        setLocation(item.location || '');
        setSoldBy(item.soldBy || '');
        setDateIntoStock(formatTimestampToDateString(item.dateIntoStock));
        setNotes(item.notes || '');
      } else {
        setName('');
        setStockNumber(generateStockNumber(organisationId));
        setStatus('');
        setMaterial('');
        setModel('');
        setColour('');
        setSerialNumber('');
        setLabel('');
        setLocation('');
        setSoldBy('');
        setDateIntoStock('');
        setNotes('');
      }
    }
  }, [open, item, organisationId]);

  async function handleSave() {
    // Validation
    if (!name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    if (!status) {
      toast({ title: 'Status is required', variant: 'destructive' });
      return;
    }
    if (!dateIntoStock) {
      toast({ title: 'Date into Stock is required', variant: 'destructive' });
      return;
    }

    setSaving(true);

    try {
      const dateTimestamp = Timestamp.fromDate(new Date(dateIntoStock));

      if (isEditMode && item) {
        // Edit mode — don't overwrite photoUrls or pdfAttachments
        const payload = {
          name: name.trim(),
          stockNumber: stockNumber.trim(),
          status,
          material,
          model: model.trim(),
          colour: colour.trim(),
          serialNumber: serialNumber.trim(),
          label: label.trim(),
          location,
          soldBy: soldBy.trim(),
          dateIntoStock: dateTimestamp,
          notes: notes.trim(),
          updatedAt: serverTimestamp(),
        };

        await updateDoc(doc(firestore, 'inventory', item.id), payload);
        toast({ title: 'Stock item updated' });
      } else {
        // Create mode
        const payload = {
          name: name.trim(),
          stockNumber: stockNumber.trim(),
          status,
          material,
          model: model.trim(),
          colour: colour.trim(),
          serialNumber: serialNumber.trim(),
          label: label.trim(),
          location,
          soldBy: soldBy.trim(),
          dateIntoStock: dateTimestamp,
          notes: notes.trim(),
          moduleId,
          organisationId,
          createdAt: serverTimestamp(),
          photoUrls: [],
          pdfAttachments: [],
        };

        await addDoc(collection(firestore, 'inventory'), payload);
        toast({ title: 'Stock item created' });
      }

      onOpenChange(false);
      onSaved?.();
    } catch (error) {
      console.error('Error saving stock item:', error);
      toast({ title: 'Failed to save stock item', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl border-4 shadow-2xl p-0 overflow-hidden max-w-2xl">
        <DialogHeader className="p-8 bg-muted/5 border-b">
          <DialogTitle className="text-2xl font-black uppercase tracking-tight">
            {isEditMode ? 'Edit Stock Item' : 'Add Stock Item'}
          </DialogTitle>
          <DialogDescription className="text-[10px] font-black uppercase tracking-widest text-primary">
            {isEditMode ? 'Update the details for this stock item' : 'Fill in the details to add a new stock item'}
          </DialogDescription>
        </DialogHeader>

        <div className="p-8 space-y-4">
          {/* Row 1: Name + Stock Number */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Name *
              </Label>
              <Input
                className="rounded-xl border-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Item name"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Stock Number
              </Label>
              <Input
                className="rounded-xl border-2"
                value={stockNumber}
                onChange={(e) => setStockNumber(e.target.value)}
                placeholder="Auto-generated"
              />
            </div>
          </div>

          {/* Row 2: Status + Material */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Status *
              </Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="rounded-xl border-2">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="In Stock">In Stock</SelectItem>
                  <SelectItem value="On Order">On Order</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Material
              </Label>
              <Select value={material} onValueChange={setMaterial}>
                <SelectTrigger className="rounded-xl border-2">
                  <SelectValue placeholder="Select material" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HYP">HYP</SelectItem>
                  <SelectItem value="PVC">PVC</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 3: Model + Colour */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Model
              </Label>
              <Input
                className="rounded-xl border-2"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Model"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Colour
              </Label>
              <Input
                className="rounded-xl border-2"
                value={colour}
                onChange={(e) => setColour(e.target.value)}
                placeholder="Colour"
              />
            </div>
          </div>

          {/* Row 4: Serial Number + Label */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Serial Number
              </Label>
              <Input
                className="rounded-xl border-2"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                placeholder="Serial number"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Label
              </Label>
              <Input
                className="rounded-xl border-2"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Label (optional)"
              />
            </div>
          </div>

          {/* Row 5: Location + Sold By */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Location
              </Label>
              <Select value={location} onValueChange={setLocation}>
                <SelectTrigger className="rounded-xl border-2">
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc} value={loc}>
                      {loc}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Sold By
              </Label>
              <Input
                className="rounded-xl border-2"
                value={soldBy}
                onChange={(e) => setSoldBy(e.target.value)}
                placeholder="Sold by (optional)"
              />
            </div>
          </div>

          {/* Row 6: Date into Stock */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Date into Stock / ETA *
              </Label>
              <Input
                className="rounded-xl border-2"
                type="date"
                value={dateIntoStock}
                onChange={(e) => setDateIntoStock(e.target.value)}
              />
            </div>
          </div>

          {/* Full width: Notes */}
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Notes
            </Label>
            <Textarea
              className="rounded-xl border-2"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes..."
            />
          </div>
        </div>

        <DialogFooter className="p-8 border-t bg-muted/5">
          <DialogClose asChild>
            <Button variant="outline" className="h-12 px-8 rounded-xl font-black uppercase text-[10px]">
              Cancel
            </Button>
          </DialogClose>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="h-12 px-10 rounded-xl font-black uppercase text-[10px] shadow-xl"
          >
            {saving ? 'Saving...' : isEditMode ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

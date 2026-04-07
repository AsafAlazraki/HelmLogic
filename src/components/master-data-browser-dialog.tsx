'use client';

import { useState, useMemo, useEffect } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Loader2, Package, X, Plus, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { collection, getDocs } from 'firebase/firestore';

interface Vendor {
  id: string;
  name: string;
  vendorType?: string;
}

interface Organisation {
  id: string;
  dataWarehouseSubscriptions?: string[];
}

interface DealerFitSelection {
  id: string;
  name: string;
  type: 'item' | 'package';
  categoryId: string;
  category?: string;
  items: {
    vendorId: string;
    rowId: string;
    data: any;
  }[];
}

interface StagedItem {
  vendorId: string;
  vendorName: string;
  row: any;
  label: string;
}

function getItemName(item: any): string {
  return item.Description || item.description || item.Name || item.name ||
    item['OPERATION DESCRIPTION'] || item.Accessory || item['Item / Description'] ||
    item['Model Name'] || 'Unknown Item';
}

function getItemCode(item: any): string {
  return item.Code || item.code || item['BLA | Code'] || item['Garmin Part Number'] ||
    item.Part || item['Package Code'] || '';
}

function getItemPrice(item: any): number {
  return parseFloat(item['Act Sell'] || item.Sell || item.sellPriceExclGst ||
    item['RRP (inc GST)'] || item.Retail || item.Trade || item['Base List'] || '0') || 0;
}

function getItemImage(item: any): string {
  return item.imageLink || item['Image Link'] || item.imageUrl || item.image ||
    item.SummaryImage || '';
}

export function MasterDataBrowserDialog({
  isOpen,
  onClose,
  organisation,
  categoryId,
  initialCategory,
  onSave,
  title = "Add Dealer Fit Item",
  description = "Search your master price file",
  initialVendorId,
  initialStagedItems = [],
  allowedVendorIds
}: {
  isOpen: boolean;
  onClose: () => void;
  organisation: Organisation;
  categoryId: string;
  initialCategory?: string;
  onSave: (selection: Omit<DealerFitSelection, 'id'>) => void;
  title?: string;
  description?: string;
  initialVendorId?: string;
  initialStagedItems?: StagedItem[];
  allowedVendorIds?: string[];
}) {
  const firestore = useFirestore();
  const { toast } = useToast();

  const vendorsQuery = useMemoFirebase(() => collection(firestore, 'data-warehouse'), [firestore]);
  const { data: allVendors, loading: vendorsLoading } = useCollection<Vendor>(vendorsQuery);

  const [searchTerm, setSearchTerm] = useState('');
  const [targetCategory, setTargetCategory] = useState(initialCategory || 'Other');
  const [displayName, setDisplayName] = useState('');
  const [stagedItems, setStagedItems] = useState<StagedItem[]>([]);
  const [allItems, setAllItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const subscribedVendors = useMemo(() => {
    if (!allVendors) return [];
    const effectiveAllowedIds = allowedVendorIds || organisation?.dataWarehouseSubscriptions || [];
    return allVendors.filter(v => effectiveAllowedIds.includes(v.id) && v.vendorType !== 'Motor Brand');
  }, [allVendors, organisation?.dataWarehouseSubscriptions, allowedVendorIds]);

  // Reset state on open
  useEffect(() => {
    if (isOpen) {
      if (initialStagedItems.length > 0) setStagedItems(initialStagedItems);
      if (initialCategory) setTargetCategory(initialCategory);
    }
  }, [isOpen, initialStagedItems, initialCategory]);

  // Load all datasets from all subscribed vendors on open
  useEffect(() => {
    if (!isOpen || subscribedVendors.length === 0) return;

    const loadAll = async () => {
      setLoading(true);
      const items: any[] = [];

      try {
        for (const vendor of subscribedVendors) {
          const dsSnap = await getDocs(collection(firestore, `data-warehouse/${vendor.id}/dataSets`));
          for (const ds of dsSnap.docs) {
            const rowsSnap = await getDocs(collection(firestore, `data-warehouse/${vendor.id}/dataSets/${ds.id}/rows`));
            rowsSnap.docs.forEach(d => {
              items.push({
                id: d.id,
                vendorId: vendor.id,
                vendorName: vendor.name,
                dataSetId: ds.id,
                dataSetName: ds.data().name || ds.id,
                ...d.data(),
              });
            });
          }
        }

        setAllItems(items);
      } catch (error) {
        console.error('Failed to load master data:', error);
        toast({ variant: 'destructive', title: 'Failed to load data' });
      } finally {
        setLoading(false);
      }
    };

    loadAll();
  }, [isOpen, subscribedVendors, firestore, toast]);

  // Client-side search
  const filteredItems = useMemo(() => {
    if (!searchTerm || searchTerm.length < 2) return allItems.slice(0, 50);
    const q = searchTerm.toLowerCase();
    return allItems.filter(item => {
      const searchable = Object.values(item)
        .filter(v => typeof v === 'string' || typeof v === 'number')
        .map(v => String(v).toLowerCase())
        .join(' ');
      return searchable.includes(q);
    }).slice(0, 50);
  }, [allItems, searchTerm]);

  const addItem = (item: any) => {
    const label = getItemName(item);
    setStagedItems(prev => [...prev, {
      vendorId: item.vendorId,
      vendorName: item.vendorName,
      row: item,
      label,
    }]);
    toast({ title: 'Item Staged', description: `${label} added.` });
  };

  const removeItem = (index: number) => {
    setStagedItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    if (stagedItems.length === 0) return;

    const isPackage = stagedItems.length > 1;
    if (isPackage && !displayName.trim()) {
      toast({ variant: 'destructive', title: 'Package name required', description: 'Please provide a name for this bundled selection.' });
      return;
    }

    const selection = {
      name: isPackage ? displayName : (displayName || stagedItems[0].label),
      categoryId,
      category: targetCategory,
      type: isPackage ? 'package' as const : 'item' as const,
      items: stagedItems.map(item => ({
        vendorId: item.vendorId,
        rowId: item.row.id,
        data: {
          ...item.row,
          sellPriceExclGst: getItemPrice(item.row),
          imageUrl: getItemImage(item.row),
        },
      })),
    };
    onSave(selection);
    resetState();
  };

  const resetState = () => {
    onClose();
    setTimeout(() => {
      setStagedItems([]);
      setDisplayName('');
      setSearchTerm('');
      setAllItems([]);
    }, 300);
  };

  return (
    <Dialog open={isOpen} onOpenChange={resetState}>
      <DialogContent className="rounded-3xl border-4 shadow-2xl p-0 overflow-hidden max-w-5xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <DialogHeader className="p-6 border-b bg-muted/5 shrink-0">
          <DialogTitle className="text-xl font-black uppercase tracking-tight">{title}</DialogTitle>
          <DialogDescription className="text-[9px] font-black uppercase tracking-widest opacity-60">
            {description}
          </DialogDescription>
        </DialogHeader>

        {/* Search + Controls */}
        <div className="p-4 border-b shrink-0 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, code, or description..."
              className="pl-9 rounded-xl border-2 text-xs h-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Category</Label>
              <Select value={targetCategory} onValueChange={setTargetCategory}>
                <SelectTrigger className="h-9 text-xs font-bold border-2 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={initialCategory || 'Other'}>{initialCategory || 'Other'}</SelectItem>
                  <SelectItem value="Propeller">Propeller</SelectItem>
                  <SelectItem value="Rigging">Rigging</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Display Name</Label>
              <Input
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder={stagedItems.length > 1 ? 'e.g. Premium Rigging Kit' : 'Auto-named for single item'}
                className="h-9 text-xs font-bold border-2 rounded-xl"
                disabled={stagedItems.length === 0}
              />
            </div>
          </div>
        </div>

        {/* Main content: Results + Staged panel */}
        <div className="flex-1 min-h-0 flex">
          {/* Results */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="px-4 pt-3 pb-2 shrink-0">
              <p className="text-[9px] uppercase tracking-widest font-black text-slate-400">
                Results {allItems.length > 0 && `(showing ${filteredItems.length} of ${allItems.length.toLocaleString()})`}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 pt-0 space-y-2">
              {loading || vendorsLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-[9px] font-black uppercase tracking-widest text-primary animate-pulse">
                    Loading all datasets...
                  </p>
                </div>
              ) : filteredItems.length > 0 ? (
                filteredItems.map((item, idx) => (
                  <div
                    key={`${item.id}-${idx}`}
                    className="flex items-center gap-3 p-3 rounded-xl border-2 hover:border-primary/40 transition-all group"
                  >
                    {getItemImage(item) ? (
                      <img src={getItemImage(item)} alt="" className="h-10 w-10 object-contain rounded border-2 shrink-0" />
                    ) : (
                      <div className="h-10 w-10 rounded border-2 border-dashed border-slate-200 flex items-center justify-center shrink-0">
                        <Package className="h-4 w-4 text-slate-300" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold truncate">{getItemName(item)}</p>
                      <div className="flex items-center gap-2">
                        {getItemCode(item) && <span className="text-[9px] font-mono text-slate-400">{getItemCode(item)}</span>}
                        <span className="text-[9px] text-slate-400">&middot; {item.dataSetName}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold text-primary">${getItemPrice(item).toLocaleString()}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => addItem(item)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-20 opacity-30">
                  <Package className="h-12 w-12 mb-4" />
                  <p className="text-[9px] font-black uppercase tracking-widest">
                    {allItems.length === 0 && !loading
                      ? (subscribedVendors.length === 0 ? 'No associated vendors.' : 'No items loaded.')
                      : 'No matching items.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Staged items panel */}
          <div className="w-72 shrink-0 border-l-2 bg-slate-50/50 p-4 flex flex-col">
            <p className="text-[9px] uppercase tracking-widest font-black text-slate-400 mb-3">
              Selected ({stagedItems.length})
            </p>
            <div className="flex-1 overflow-y-auto space-y-2">
              {stagedItems.length > 0 ? (
                stagedItems.map((item, i) => (
                  <div key={`staged-${i}`} className="flex items-center gap-2 p-2 rounded-xl bg-primary/5 border-2 border-primary/20">
                    <span className="text-xs font-semibold flex-1 truncate">{item.label}</span>
                    <span className="text-xs font-mono text-primary">${getItemPrice(item.row).toLocaleString()}</span>
                    <button onClick={() => removeItem(i)} className="text-destructive hover:bg-destructive/10 rounded p-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center flex flex-col items-center gap-2 opacity-20 border-2 border-dashed rounded-xl">
                  <Plus className="h-6 w-6" />
                  <p className="text-[9px] font-black uppercase tracking-widest">Click + to add items</p>
                </div>
              )}
            </div>
            <Button
              onClick={handleSave}
              disabled={stagedItems.length === 0}
              className="mt-3 rounded-xl font-black uppercase text-[10px]"
            >
              Save to {targetCategory || 'Category'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

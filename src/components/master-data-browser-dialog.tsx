
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Loader2, PackagePlus, X, Plus, Table as TableIcon, Search, PlusCircle, CheckCircle2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { ScrollArea } from './ui/scroll-area';
import { collection, query, orderBy } from 'firebase/firestore';
import { cn } from '@/lib/utils';

interface Vendor {
  id: string;
  name: string;
}

interface Organisation {
  id: string;
  dataWarehouseSubscriptions?: string[];
}

interface DataSet {
    id: string;
    name: string;
    rowCount: number;
}

interface DealerFitSelection {
  id: string;
  name: string;
  type: 'item' | 'package';
  categoryId: string;
  category?: string; // Optional display category (e.g. Propeller, Rigging)
  items: {
    vendorId: string;
    rowId: string;
    data: any;
  }[];
}

const MOTOR_ACCESSORY_CATEGORIES = ['Propeller', 'Rigging', 'Other'];

export function MasterDataBrowserDialog({
  isOpen,
  onClose,
  organisation,
  categoryId,
  initialCategory,
  onSave,
  title = "Master Data Browser",
  description = "Select items from your subscribed vendors to build a new selection."
}: {
  isOpen: boolean;
  onClose: () => void;
  organisation: Organisation;
  categoryId: string;
  initialCategory?: string;
  onSave: (selection: Omit<DealerFitSelection, 'id'>) => void;
  title?: string;
  description?: string;
}) {
  const firestore = useFirestore();
  const vendorsQuery = useMemoFirebase(() => collection(firestore, 'data-warehouse'), [firestore]);
  const { data: allVendors, loading: vendorsLoading } = useCollection<Vendor>(vendorsQuery);
  
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [selectedDataSetId, setSelectedDataSetId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [targetCategory, setTargetCategory] = useState(initialCategory || 'Other');
  
  // Update target category when initialCategory changes
  useEffect(() => {
    if (initialCategory) setTargetCategory(initialCategory);
  }, [initialCategory]);

  // Fetch datasets for the selected vendor
  const dataSetsQuery = useMemoFirebase(() => {
    if (!selectedVendorId) return null;
    return query(collection(firestore, 'data-warehouse', selectedVendorId, 'dataSets'), orderBy('name'));
  }, [firestore, selectedVendorId]);
  const { data: dataSets, isLoading: setsLoading } = useCollection<DataSet>(dataSetsQuery);

  // Fetch rows for either the specific dataset or the global master set
  const masterDataQuery = useMemoFirebase(() => {
    if (!selectedVendorId) return null;
    if (selectedDataSetId && selectedDataSetId !== 'master') {
        return collection(firestore, 'data-warehouse', selectedVendorId, 'dataSets', selectedDataSetId, 'rows');
    }
    // Global Master List
    return collection(firestore, 'data-warehouse', selectedVendorId, 'masterDataSet');
  }, [firestore, selectedVendorId, selectedDataSetId]);
  
  const { data: masterData, loading: dataLoading } = useCollection(masterDataQuery);

  const [stagedItems, setStagedItems] = useState<{ vendorId: string; vendorName: string; row: any }[]>([]);
  const [packageName, setPackageName] = useState('');

  const subscribedVendors = useMemo(() => {
    if (!allVendors || !organisation.dataWarehouseSubscriptions) return [];
    return allVendors.filter(v => organisation.dataWarehouseSubscriptions?.includes(v.id));
  }, [allVendors, organisation.dataWarehouseSubscriptions]);

  const filteredData = useMemo(() => {
    if (!masterData) return [];
    if (!searchTerm) return masterData;
    const lower = searchTerm.toLowerCase();
    return masterData.filter(row => 
        Object.values(row).some(val => String(val ?? '').toLowerCase().includes(lower))
    );
  }, [masterData, searchTerm]);

  const headers = useMemo(() => {
    if (!filteredData || filteredData.length === 0) return [];
    const commonKeys = ['Part_Number', 'Description', 'RRP', 'name', 'model', 'price', 'cost', 'Model Name', 'ModelName', 'SKU'];
    const allKeys = Object.keys(filteredData[0]);
    return commonKeys.filter(k => allKeys.includes(k)).concat(allKeys.filter(k => !commonKeys.includes(k) && k !== 'id' && k !== '_ref')).slice(0, 5);
  }, [filteredData]);

  const handleAddItem = (row: any) => {
    const selectedVendor = subscribedVendors.find(v => v.id === selectedVendorId);
    if (selectedVendor) {
      setStagedItems(prev => [...prev, { vendorId: selectedVendor.id, vendorName: selectedVendor.name, row }]);
    }
  };
  
  const handleRemoveItem = (rowIndex: number) => {
    setStagedItems(prev => prev.filter((_, index) => index !== rowIndex));
  };

  const handleSavePackage = () => {
    if (stagedItems.length === 0) {
      toast({ variant: 'destructive', title: 'No items selected' });
      return;
    }
    const isPackage = stagedItems.length > 1;
    if (isPackage && !packageName.trim()) {
        toast({ variant: 'destructive', title: 'Package name required' });
        return;
    }

    const selection = {
      name: isPackage ? packageName : (stagedItems[0].row.Description || stagedItems[0].row.name || stagedItems[0].row['Model Name'] || 'New Item'),
      categoryId,
      category: targetCategory,
      type: isPackage ? 'package' as const : 'item' as const,
      items: stagedItems.map(item => ({
        vendorId: item.vendorId,
        rowId: item.row.id,
        data: item.row,
      })),
    };
    onSave(selection);
    resetState();
  };

  const resetState = () => {
    onClose();
    setTimeout(() => {
        setSelectedVendorId(null);
        setSelectedDataSetId(null);
        setStagedItems([]);
        setPackageName('');
        setSearchTerm('');
    }, 300);
  };

  return (
    <Dialog open={isOpen} onOpenChange={resetState}>
      <DialogContent className="max-w-7xl h-[90vh] flex flex-col p-0 overflow-hidden rounded-xl">
        <DialogHeader className="p-6 border-b bg-muted/10">
          <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
          <DialogDescription className="text-xs font-black uppercase tracking-widest opacity-60">
            {description}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          {/* Left Side: Browser */}
          <div className="flex-1 flex flex-col min-w-0 border-r">
            <div className="p-4 bg-muted/5 border-b space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">1. Select Vendor</Label>
                        <Select onValueChange={(val) => { setSelectedVendorId(val); setSelectedDataSetId(null); }} value={selectedVendorId || ''}>
                            <SelectTrigger className="h-10 font-bold bg-background">
                                <SelectValue placeholder={vendorsLoading ? 'Loading...' : 'Choose a vendor'} />
                            </SelectTrigger>
                            <SelectContent>
                                {subscribedVendors.map(vendor => (
                                    <SelectItem key={vendor.id} value={vendor.id}>{vendor.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {selectedVendorId && (
                        <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">2. Select Data Table (Optional)</Label>
                            <Select onValueChange={setSelectedDataSetId} value={selectedDataSetId || 'master'}>
                                <SelectTrigger className="h-10 font-bold bg-background">
                                    <div className="flex items-center gap-2">
                                        <TableIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                        <SelectValue placeholder="Global Master List" />
                                    </div>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="master">Global Master List (All Items)</SelectItem>
                                    {dataSets?.map(set => (
                                        <SelectItem key={set.id} value={set.id}>{set.name} ({set.rowCount} rows)</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                        placeholder="Search items by name, code or SKU..." 
                        className="pl-9 h-10 font-bold bg-background"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        disabled={!selectedVendorId}
                    />
                </div>
            </div>

            <div className="flex-1 overflow-hidden relative">
                {dataLoading || setsLoading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-20">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : filteredData && filteredData.length > 0 ? (
                    <ScrollArea className="h-full">
                        <Table>
                            <TableHeader className="sticky top-0 bg-secondary z-10 shadow-sm">
                                <TableRow className="hover:bg-transparent">
                                    {headers.map(header => (
                                        <TableHead key={header} className="text-[10px] font-black uppercase tracking-tighter py-3 px-4">
                                            {header.replace(/_/g, ' ')}
                                        </TableHead>
                                    ))}
                                    <TableHead className="text-right w-24 pr-6">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredData.map((row, idx) => (
                                    <TableRow key={row.id || idx} className="hover:bg-primary/5 transition-colors group">
                                        {headers.map(header => (
                                            <TableCell key={header} className="text-[11px] font-medium py-3 px-4 truncate max-w-[200px]">
                                                {String(row[header] ?? '')}
                                            </TableCell>
                                        ))}
                                        <TableCell className="text-right py-3 pr-6">
                                            <Button 
                                                variant="outline" 
                                                size="sm" 
                                                className="h-7 text-[10px] font-black uppercase tracking-widest hover:bg-primary hover:text-primary-foreground"
                                                onClick={() => handleAddItem(row)}
                                            >
                                                <Plus className="h-3 w-3 mr-1" /> Add
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-12 text-center opacity-40">
                        <TableIcon className="h-12 w-12 mb-4" />
                        <p className="text-sm font-bold uppercase tracking-widest">
                            {selectedVendorId ? 'No items found in this list.' : 'Choose a vendor to browse products.'}
                        </p>
                    </div>
                )}
            </div>
          </div>

          {/* Right Side: Staging Area */}
          <div className="w-full md:w-[380px] shrink-0 bg-muted/5 flex flex-col">
            <div className="p-6 border-b bg-background shadow-sm space-y-6">
                <h3 className="font-black text-xs uppercase tracking-widest text-primary flex items-center gap-2">
                    <PackagePlus className="h-4 w-4" />
                    New Selection
                </h3>
                
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Display Category</Label>
                        <Select value={targetCategory} onValueChange={setTargetCategory}>
                            <SelectTrigger className="h-10 font-bold bg-background shadow-inner">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {MOTOR_ACCESSORY_CATEGORIES.map(cat => (
                                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Display Name</Label>
                        <Input 
                            value={packageName}
                            onChange={e => setPackageName(e.target.value)}
                            placeholder={stagedItems.length > 1 ? 'e.g. Premium Rigging Kit' : 'Auto-named for single item'}
                            className="h-10 font-bold bg-background shadow-inner"
                            disabled={stagedItems.length === 0}
                        />
                    </div>
                    
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-tighter pt-2">
                        <span className="text-muted-foreground">Items Staged</span>
                        <div className="h-5 min-w-[20px] rounded-full bg-secondary flex items-center justify-center px-1.5 font-black">{stagedItems.length}</div>
                    </div>
                </div>
            </div>

            <ScrollArea className="flex-1 p-4">
                <div className="space-y-2">
                    {stagedItems.length > 0 ? stagedItems.map((item, index) => (
                        <Card key={`${item.row.id}-${index}`} className="relative border-2 border-transparent hover:border-primary/20 transition-all bg-background shadow-sm overflow-hidden group rounded-lg">
                            <div className="p-3 pr-10">
                                <p className="text-[11px] font-black uppercase leading-tight truncate">
                                    {item.row.Description || item.row.name || item.row['Model Name'] || 'Unnamed Item'}
                                </p>
                                <p className="text-[9px] font-bold text-muted-foreground/60 mt-1 uppercase truncate">{item.vendorName}</p>
                            </div>
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity" 
                                onClick={() => handleRemoveItem(index)}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </Card>
                    )) : (
                        <div className="py-20 text-center flex flex-col items-center gap-3 opacity-20 border-2 border-dashed rounded-xl m-2 bg-muted/5">
                            <PlusCircle className="h-8 w-8" />
                            <p className="text-[10px] font-black uppercase tracking-widest">Select items on the left</p>
                        </div>
                    )}
                </div>
            </ScrollArea>

            <div className="p-6 border-t bg-background mt-auto shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
                <Button 
                    onClick={handleSavePackage} 
                    disabled={stagedItems.length === 0}
                    className="w-full h-11 font-black uppercase tracking-widest shadow-lg rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Apply to {targetCategory}
                </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

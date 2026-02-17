
'use client';

import { useState, useMemo } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
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
import { Loader2, PackagePlus, X, Plus } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { ScrollArea } from './ui/scroll-area';

interface Vendor {
  id: string;
  name: string;
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
  items: {
    vendorId: string;
    rowId: string;
    data: any;
  }[];
}

export function MasterDataBrowserDialog({
  isOpen,
  onClose,
  organisation,
  categoryId,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  organisation: Organisation;
  categoryId: string;
  onSave: (selection: Omit<DealerFitSelection, 'id'>) => void;
}) {
  const { data: allVendors, loading: vendorsLoading } = useCollection<Vendor>('data-warehouse');
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const { data: masterData, loading: dataLoading } = useCollection(
    selectedVendorId ? `data-warehouse/${selectedVendorId}/masterDataSet` : null
  );

  const [stagedItems, setStagedItems] = useState<{ vendorId: string; vendorName: string; row: any }[]>([]);
  const [packageName, setPackageName] = useState('');

  const subscribedVendors = useMemo(() => {
    if (!allVendors || !organisation.dataWarehouseSubscriptions) return [];
    return allVendors.filter(v => organisation.dataWarehouseSubscriptions?.includes(v.id));
  }, [allVendors, organisation.dataWarehouseSubscriptions]);

  const headers = useMemo(() => {
    if (!masterData || masterData.length === 0) return [];
    const commonKeys = ['Part_Number', 'Description', 'RRP', 'name', 'model', 'price', 'cost'];
    const allKeys = Object.keys(masterData[0]);
    return commonKeys.filter(k => allKeys.includes(k)).concat(allKeys.filter(k => !commonKeys.includes(k) && k !== 'id')).slice(0, 4);
  }, [masterData]);

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
      name: isPackage ? packageName : (stagedItems[0].row.Description || stagedItems[0].row.name || 'New Item'),
      categoryId,
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
        setStagedItems([]);
        setPackageName('');
    }, 300);
  };

  return (
    <Dialog open={isOpen} onOpenChange={resetState}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Master Data Browser</DialogTitle>
          <DialogDescription>
            Select items from your subscribed vendors to build a new item or package selection.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-grow min-h-0">
          {/* Left Side: Browser */}
          <div className="md:col-span-2 flex flex-col gap-4">
             <Select onValueChange={setSelectedVendorId} value={selectedVendorId || ''}>
                <SelectTrigger>
                    <SelectValue placeholder={vendorsLoading ? 'Loading vendors...' : 'Select a vendor to browse'} />
                </SelectTrigger>
                <SelectContent>
                    {subscribedVendors.map(vendor => (
                        <SelectItem key={vendor.id} value={vendor.id}>{vendor.name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <div className="flex-grow overflow-auto border rounded-md relative">
                {dataLoading ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                ) : masterData && masterData.length > 0 ? (
                    <ScrollArea className="h-full">
                        <Table>
                            <TableHeader className="sticky top-0 bg-secondary z-10">
                                <TableRow>
                                    {headers.map(header => <TableHead key={header}>{header.replace(/_/g, ' ')}</TableHead>)}
                                    <TableHead className="text-right">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {masterData.map(row => (
                                    <TableRow key={row.id}>
                                        {headers.map(header => (
                                            <TableCell key={header} className="max-w-[200px] truncate">{String(row[header] ?? '')}</TableCell>
                                        ))}
                                        <TableCell className="text-right">
                                            <Button variant="outline" size="sm" onClick={() => handleAddItem(row)}>
                                                <Plus className="h-4 w-4 mr-2" /> Add
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                        <p>{selectedVendorId ? 'No data found for this vendor.' : 'Please select a vendor to browse data.'}</p>
                    </div>
                )}
            </div>
          </div>

          {/* Right Side: Staging Area */}
          <div className="md:col-span-1 flex flex-col gap-4 border-l pl-6">
            <h3 className="font-semibold text-lg">New Selection</h3>
             <div className="space-y-2">
                <Label htmlFor="package-name">Selection Name</Label>
                <Input 
                    id="package-name" 
                    value={packageName}
                    onChange={e => setPackageName(e.target.value)}
                    placeholder={stagedItems.length > 1 ? 'Enter package name...' : 'Auto-generated for single item'}
                    disabled={stagedItems.length <= 1}
                />
            </div>
            <p className="text-sm text-muted-foreground">{stagedItems.length} item(s) selected.</p>
            <ScrollArea className="flex-grow border rounded-md p-2 bg-muted/50">
                {stagedItems.length > 0 ? (
                    <div className="space-y-2">
                        {stagedItems.map((item, index) => (
                            <div key={`${item.row.id}-${index}`} className="flex items-start justify-between bg-background p-2 rounded-sm shadow-sm">
                                <div className="flex-grow">
                                    <p className="text-sm font-medium truncate pr-2">{item.row.Description || item.row.name || 'Unnamed Item'}</p>
                                    <p className="text-xs text-muted-foreground">{item.vendorName}</p>
                                </div>
                                <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={() => handleRemoveItem(index)}>
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                        <p>Add items from the browser.</p>
                    </div>
                )}
            </ScrollArea>
          </div>
        </div>
        
        <DialogFooter>
           <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
          <Button onClick={handleSavePackage} disabled={stagedItems.length === 0}>
              <PackagePlus className="mr-2 h-4 w-4" />
              Create Selection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


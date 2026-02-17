
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
import { Loader2, PackagePlus } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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

  const [selectedRows, setSelectedRows] = useState<any[]>([]);
  const [isPackageNameOpen, setIsPackageNameOpen] = useState(false);
  const [packageName, setPackageName] = useState('');

  const subscribedVendors = useMemo(() => {
    if (!allVendors || !organisation.dataWarehouseSubscriptions) return [];
    return allVendors.filter(v => organisation.dataWarehouseSubscriptions?.includes(v.id));
  }, [allVendors, organisation.dataWarehouseSubscriptions]);

  const headers = useMemo(() => {
    if (!masterData || masterData.length === 0) return [];
    // Prioritize common keys for better display
    const commonKeys = ['Part_Number', 'Description', 'RRP', 'name', 'model', 'price', 'cost'];
    const allKeys = Object.keys(masterData[0]);
    return commonKeys.filter(k => allKeys.includes(k)).concat(allKeys.filter(k => !commonKeys.includes(k) && k !== 'id')).slice(0, 5);
  }, [masterData]);

  const handleRowSelect = (row: any, checked: boolean) => {
    setSelectedRows(prev =>
      checked ? [...prev, row] : prev.filter(r => r.id !== row.id)
    );
  };

  const handleSaveClick = () => {
    if (selectedRows.length === 0) return;

    if (selectedRows.length > 1) {
      setIsPackageNameOpen(true);
    } else {
      const selection = {
        name: selectedRows[0].Description || selectedRows[0].name || 'New Item',
        categoryId,
        type: 'item' as const,
        items: selectedRows.map(row => ({
          vendorId: selectedVendorId!,
          rowId: row.id,
          data: row,
        })),
      };
      onSave(selection);
      resetState();
    }
  };

  const handleConfirmPackage = () => {
    if (!packageName.trim() || selectedRows.length <= 1) return;

    const selection = {
      name: packageName,
      categoryId,
      type: 'package' as const,
      items: selectedRows.map(row => ({
        vendorId: selectedVendorId!,
        rowId: row.id,
        data: row,
      })),
    };
    onSave(selection);
    resetState();
  };

  const resetState = () => {
    onClose();
    setTimeout(() => {
        setSelectedVendorId(null);
        setSelectedRows([]);
        setIsPackageNameOpen(false);
        setPackageName('');
    }, 300); // Delay to allow dialog to close smoothly
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={resetState}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Master Data Browser</DialogTitle>
            <DialogDescription>
              Select items from your subscribed vendors to add to this category.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-4">
             <Select onValueChange={setSelectedVendorId} value={selectedVendorId || ''}>
                <SelectTrigger className="w-[300px]">
                    <SelectValue placeholder={vendorsLoading ? 'Loading vendors...' : 'Select a vendor'} />
                </SelectTrigger>
                <SelectContent>
                    {subscribedVendors.map(vendor => (
                        <SelectItem key={vendor.id} value={vendor.id}>{vendor.name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
          </div>
          <div className="flex-grow overflow-auto border rounded-md relative">
            {dataLoading ? (
                <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin" />
                </div>
            ) : masterData && masterData.length > 0 ? (
                <Table>
                    <TableHeader className="sticky top-0 bg-secondary z-10">
                        <TableRow>
                            <TableHead className="w-12"><Checkbox 
                                onCheckedChange={(checked) => setSelectedRows(checked ? masterData : [])}
                                checked={selectedRows.length > 0 && selectedRows.length === masterData.length}
                            /></TableHead>
                            {headers.map(header => <TableHead key={header}>{header.replace(/_/g, ' ')}</TableHead>)}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {masterData.map(row => (
                            <TableRow key={row.id}>
                                <TableCell>
                                    <Checkbox 
                                        onCheckedChange={(checked) => handleRowSelect(row, !!checked)}
                                        checked={selectedRows.some(r => r.id === row.id)}
                                    />
                                </TableCell>
                                {headers.map(header => (
                                    <TableCell key={header} className="max-w-xs truncate">{String(row[header] ?? '')}</TableCell>
                                ))}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                    <p>{selectedVendorId ? 'No data found for this vendor.' : 'Please select a vendor to browse data.'}</p>
                </div>
            )}
          </div>
          <DialogFooter>
             <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handleSaveClick} disabled={selectedRows.length === 0}>
                Add {selectedRows.length} Selection{selectedRows.length !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isPackageNameOpen} onOpenChange={setIsPackageNameOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Create New Package</DialogTitle>
                <DialogDescription>
                    You've selected multiple items. Please give this package a name.
                </DialogDescription>
            </DialogHeader>
             <div className="py-4 space-y-2">
                <Label htmlFor="package-name">Package Name</Label>
                <Input 
                    id="package-name" 
                    value={packageName}
                    onChange={e => setPackageName(e.target.value)}
                    placeholder="e.g., Garmin Basic Electronics Pack"
                />
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsPackageNameOpen(false)}>Cancel</Button>
                <Button onClick={handleConfirmPackage} disabled={!packageName.trim()}>
                    <PackagePlus className="mr-2 h-4 w-4" />
                    Create Package
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

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
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, PackagePlus, X, Plus, Table as TableIcon, Search, PlusCircle, CheckCircle2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from './ui/scroll-area';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
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

interface StagedItem {
    vendorId: string;
    vendorName: string;
    row: any;
    label: string;
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

/**
 * Utility to find the best display name for a data row based on common spreadsheet keys.
 */
const getItemLabel = (row: any): string => {
    if (!row) return 'Unnamed Item';
    const priorities = [
        'OPERATION DESCRIPTION',
        'ITEM_NAME',
        'Product Name',
        'Model Name',
        'Description',
        'name',
        'DESC',
        'INSTALL TYPE', // Lowest priority as it's often generic like "Supply Only"
    ];
    
    for (const key of priorities) {
        if (row[key] && String(row[key]).trim() !== '') {
            return String(row[key]).trim();
        }
    }
    
    return row.id || 'Unnamed Item';
};

export function MasterDataBrowserDialog({
  isOpen,
  onClose,
  organisation,
  categoryId,
  initialCategory,
  onSave,
  title = "Master Data Browser",
  description = "Select items from your data warehouse to build a new selection.",
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
  
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [selectedDataSetId, setSelectedDataSetId] = useState<string | null>('master'); 
  const [searchTerm, setSearchTerm] = useState('');
  const [targetCategory, setTargetCategory] = useState(initialCategory || 'Other');
  const [stagedItems, setStagedItems] = useState<StagedItem[]>([]);
  const [packageName, setPackageName] = useState('');

  const [aggregateData, setAggregateData] = useState<any[] | null>(null);
  const [isAggregating, setIsAggregating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialVendorId) setSelectedVendorId(initialVendorId);
      if (initialStagedItems.length > 0) setStagedItems(initialStagedItems);
      if (initialCategory) setTargetCategory(initialCategory);
      setSelectedDataSetId('master'); // Default to Global Master List
    }
  }, [isOpen, initialVendorId, initialStagedItems, initialCategory]);

  const subscribedVendors = useMemo(() => {
    if (!allVendors) return [];
    const effectiveAllowedIds = allowedVendorIds || organisation?.dataWarehouseSubscriptions || [];
    return allVendors.filter(v => effectiveAllowedIds.includes(v.id));
  }, [allVendors, organisation?.dataWarehouseSubscriptions, allowedVendorIds]);

  useEffect(() => {
    if (isOpen && subscribedVendors.length === 1 && !selectedVendorId) {
        setSelectedVendorId(subscribedVendors[0].id);
    }
  }, [isOpen, subscribedVendors, selectedVendorId]);

  const dataSetsQuery = useMemoFirebase(() => {
    if (!selectedVendorId) return null;
    return query(collection(firestore, 'data-warehouse', selectedVendorId, 'dataSets'), orderBy('name'));
  }, [firestore, selectedVendorId]);
  const { data: dataSets, isLoading: setsLoading } = useCollection<DataSet>(dataSetsQuery);

  const masterDataQuery = useMemoFirebase(() => {
    if (!selectedVendorId) return null;
    if (selectedDataSetId && selectedDataSetId !== 'master') {
        return collection(firestore, 'data-warehouse', selectedVendorId, 'dataSets', selectedDataSetId, 'rows');
    }
    return collection(firestore, 'data-warehouse', selectedVendorId, 'masterDataSet');
  }, [firestore, selectedVendorId, selectedDataSetId]);
  
  const { data: masterData, loading: dataLoading } = useCollection(masterDataQuery);

  useEffect(() => {
    const fetchAggregate = async () => {
      if (selectedDataSetId === 'master' && selectedVendorId && dataSets && dataSets.length > 0) {
        setIsAggregating(true);
        try {
          const promises = dataSets.map(async (ds) => {
            const snap = await getDocs(collection(firestore, `data-warehouse/${selectedVendorId}/dataSets/${ds.id}/rows`));
            return snap.docs.map(d => ({ id: d.id, ...d.data(), _sourceTable: ds.name }));
          });
          const results = await Promise.all(promises);
          setAggregateData(results.flat());
        } catch (e) {
          console.error("Aggregation failed", e);
        } finally {
          setIsAggregating(false);
        }
      } else {
        setAggregateData(null);
      }
    };
    fetchAggregate();
  }, [selectedDataSetId, selectedVendorId, dataSets, firestore]);

  const displayData = useMemo(() => {
    if (selectedDataSetId === 'master') {
        if (aggregateData && aggregateData.length > 0) return aggregateData;
        return masterData || [];
    }
    return masterData || [];
  }, [selectedDataSetId, aggregateData, masterData]);

  const filteredData = useMemo(() => {
    if (!displayData) return [];
    if (!searchTerm) return displayData;
    const lower = searchTerm.toLowerCase();
    return displayData.filter(row => 
        Object.values(row).some(val => String(val ?? '').toLowerCase().includes(lower))
    );
  }, [displayData, searchTerm]);

  const headers = useMemo(() => {
    if (!filteredData || filteredData.length === 0) return [];
    
    const allKeys = Object.keys(filteredData[0]).filter(k => !k.startsWith('_') && k !== 'id');
    
    const priorityGroups = [
        { keys: ['imageLink', 'Image Link', 'imageUrl', 'image', 'SummaryImage'], label: 'Image' },
        { keys: ['CODE', 'Code', 'Part_Number', 'SKU', 'PartNo', 'PartNumber', 'Part Number', 'ITEM_CODE'], label: 'Code' },
        { keys: ['OPERATION DESCRIPTION', 'ITEM_NAME', 'Product Name', 'Description', 'name', 'INSTALL TYPE', 'DESCRIPTION', 'DESC'], label: 'Description' },
        { keys: ['PARTS', 'RRP', 'price', 'SellPrice', 'Price', 'Retail', 'Trade', 'sellPriceExclGst', 'PRICE', 'UNIT_PRICE', 'TOTAL_CTD'], label: 'Price' }
    ];

    const detectedHeaders: { key: string, label: string }[] = [];
    const matchedKeys = new Set<string>();

    priorityGroups.forEach(group => {
        const key = group.keys.find(k => allKeys.includes(k));
        if (key) {
            detectedHeaders.push({ key, label: group.label });
            matchedKeys.add(key);
        }
    });

    if (selectedDataSetId === 'master' && dataSets && dataSets.length > 0) {
        detectedHeaders.push({ key: '_sourceTable', label: 'Source' });
    }

    allKeys.forEach(k => {
        if (detectedHeaders.length >= 6) return;
        if (matchedKeys.has(k)) return;
        
        const val = filteredData[0][k];
        const isUsefulString = typeof val === 'string' && val.length > 0 && val.length < 50;
        const isNumeric = typeof val === 'number';
        
        if ((isUsefulString || isNumeric)) {
            detectedHeaders.push({ key: k, label: k });
            matchedKeys.add(k);
        }
    });

    return detectedHeaders;
  }, [filteredData, selectedDataSetId, dataSets]);

  const handleAddItem = (row: any) => {
    const vId = selectedVendorId || initialVendorId;
    if (!vId) return;
    
    const selectedVendor = subscribedVendors.find(v => v.id === vId);
    if (selectedVendor) {
      const label = getItemLabel(row);
      setStagedItems(prev => [...prev, { vendorId: selectedVendor.id, vendorName: selectedVendor.name, row, label }]);
      toast({ title: "Item Staged", description: `${label} added.` });
    }
  };
  
  const handleRemoveItem = (rowIndex: number) => {
    setStagedItems(prev => prev.filter((_, index) => index !== rowIndex));
  };

  const handleSavePackage = () => {
    if (stagedItems.length === 0) return;
    
    const isPackage = stagedItems.length > 1;
    if (isPackage && !packageName.trim()) {
        toast({ variant: 'destructive', title: 'Package name required', description: 'Please provide a name for this bundled selection.' });
        return;
    }

    const selection = {
      name: isPackage ? packageName : stagedItems[0].label,
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
        setSelectedDataSetId('master');
        setStagedItems([]);
        setPackageName('');
        setSearchTerm('');
        setAggregateData(null);
    }, 300);
  };

  const formatTableCell = (value: any) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') {
        return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    const strVal = String(value);
    if (/^\d*\.?\d+$/.test(strVal) && strVal.includes('.')) {
        const num = parseFloat(strVal);
        return isNaN(num) ? strVal : num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return strVal;
  };

  return (
    <Dialog open={isOpen} onOpenChange={resetState}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0 overflow-hidden rounded-xl">
        <DialogHeader className="p-6 border-b bg-muted/10">
          <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
          <DialogDescription className="text-xs font-black uppercase tracking-widest opacity-60">
            {description}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          <div className="flex-1 flex flex-col min-w-0 border-r">
            <div className="p-4 bg-muted/5 border-b space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">1. Select Vendor</Label>
                        <Select onValueChange={(val) => { setSelectedVendorId(val); setSelectedDataSetId('master'); setAggregateData(null); }} value={selectedVendorId || ''}>
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
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">2. Data Table</Label>
                            <Select onValueChange={setSelectedDataSetId} value={selectedDataSetId || 'master'}>
                                <SelectTrigger className="h-10 font-bold bg-background">
                                    <div className="flex items-center gap-2">
                                        <TableIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                        <SelectValue placeholder="Global Master List" />
                                    </div>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="master">Global Master List (Aggregated)</SelectItem>
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
                        placeholder="Search items by name, code or description..." 
                        className="pl-9 h-10 font-bold bg-background transition-all focus-visible:ring-primary/20"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        disabled={!selectedVendorId}
                    />
                </div>
            </div>

            <div className="flex-1 overflow-hidden relative">
                {dataLoading || setsLoading || isAggregating ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/50 z-20 gap-3">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        {isAggregating && <p className="text-[10px] font-black uppercase tracking-widest text-primary animate-pulse">Building aggregated catalog...</p>}
                    </div>
                ) : filteredData && filteredData.length > 0 ? (
                    <ScrollArea className="h-full">
                        <Table className="border-collapse table-fixed w-full">
                            <TableHeader className="sticky top-0 bg-secondary z-10 shadow-sm">
                                <TableRow className="hover:bg-transparent">
                                    {headers.map(header => (
                                        <TableHead key={header.key} className={cn(
                                            "text-[10px] font-black uppercase tracking-tighter py-3 px-4",
                                            header.label === 'Image' ? "w-14 text-center" : "",
                                            (header.key === 'sellPriceExclGst' || header.key.toLowerCase().includes('price') || header.key === 'PARTS') ? "text-right" : ""
                                        )}>
                                            {header.label.replace(/_/g, ' ')}
                                        </TableHead>
                                    ))}
                                    <TableHead className="text-right w-24 pr-6">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredData.map((row, idx) => (
                                    <TableRow 
                                        key={row.id || idx} 
                                        className="hover:bg-primary/5 transition-colors group cursor-pointer"
                                        onClick={() => handleAddItem(row)}
                                    >
                                        {headers.map(header => (
                                            <TableCell key={header.key} className={cn(
                                                "text-[11px] font-medium py-3 px-4 truncate",
                                                header.label === 'Image' ? "w-14 p-1" : "",
                                                (header.key === 'sellPriceExclGst' || header.key.toLowerCase().includes('price') || header.key === 'PARTS') ? "text-right font-black" : ""
                                            )}>
                                                {header.label === 'Image' ? (
                                                    row[header.key] ? (
                                                        <img src={row[header.key]} alt="" className="h-10 w-10 object-contain rounded border bg-white mx-auto" />
                                                    ) : null
                                                ) : header.key === '_sourceTable' ? (
                                                    <Badge variant="outline" className="text-[8px] font-black uppercase h-4 px-1 border-primary/20 text-primary">{row[header.key]}</Badge>
                                                ) : (
                                                    formatTableCell(row[header.key])
                                                )}
                                            </TableCell>
                                        ))}
                                        <TableCell className="text-right py-3 pr-6">
                                            <Button 
                                                type="button"
                                                variant="outline" 
                                                size="sm" 
                                                className="h-7 text-[10px] font-black uppercase tracking-widest hover:bg-primary hover:text-primary-foreground transition-all"
                                                onClick={(e) => { e.stopPropagation(); handleAddItem(row); }}
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
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-12 text-center">
                        <div className="opacity-40">
                            <TableIcon className="h-12 w-12 mb-4 mx-auto" />
                            <p className="text-sm font-bold uppercase tracking-widest">
                                {selectedVendorId ? 'No matching items.' : (subscribedVendors.length === 0 ? 'No associated vendors.' : 'Select a vendor to start.')}
                            </p>
                        </div>
                    </div>
                )}
            </div>
          </div>

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
                                <SelectItem value={initialCategory || 'Other'}>{initialCategory || 'Other'}</SelectItem>
                                <SelectItem value="Propeller">Propeller</SelectItem>
                                <SelectItem value="Rigging">Rigging</SelectItem>
                                <SelectItem value="Other">Other</SelectItem>
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
                            <div className="p-3 pr-10 flex items-center gap-3">
                                {(item.row.imageLink || item.row['Image Link'] || item.row.imageUrl || item.row.image || item.row.SummaryImage) && (
                                    <img src={item.row.imageLink || item.row['Image Link'] || item.row.imageUrl || item.row.image || item.row.SummaryImage} alt="" className="h-10 w-10 object-contain rounded border bg-white shrink-0" />
                                )}
                                <div className="min-w-0">
                                    <p className="text-[11px] font-black uppercase leading-tight truncate">
                                        {item.label}
                                    </p>
                                    <p className="text-[9px] font-bold text-muted-foreground/60 mt-1 uppercase truncate">{item.vendorName}</p>
                                </div>
                            </div>
                            <Button 
                                type="button"
                                variant="ghost" 
                                size="icon" 
                                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity" 
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRemoveItem(index); }}
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
                    type="button"
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

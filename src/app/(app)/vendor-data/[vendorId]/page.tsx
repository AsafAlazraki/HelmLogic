'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase/firestore/use-collection';
import { Loader2, Table as TableIcon, LayoutGrid, List, Search, ChevronLeft } from 'lucide-react';
import { BreadcrumbNav, type BreadcrumbPart } from '@/components/breadcrumb-nav';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { useMemo, useState } from 'react';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { collection, query, where, doc } from 'firebase/firestore';
import { JsonDataVisualizer } from '@/components/json-data-visualizer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface Vendor {
    id: string;
    name: string;
    slug?: string;
}

interface DataSet {
    id: string;
    name: string;
    rowCount: number;
}

export default function VendorDataPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const firestore = useFirestore();
  
  const vendorIdParam = params.vendorId as string;
  const setId = searchParams.get('set');

  // 1. Fetch Vendor
  const vendorQueryBySlug = useMemoFirebase(() => {
    if (!vendorIdParam) return null;
    return query(collection(firestore, 'data-warehouse'), where('slug', '==', vendorIdParam));
  }, [firestore, vendorIdParam]);
  
  const { data: vendorsBySlug, loading: slugLoading } = useCollection<Vendor>(vendorQueryBySlug);
  
  const vendorByIdRef = useMemoFirebase(() => 
    vendorIdParam ? doc(firestore, 'data-warehouse', vendorIdParam) : null,
  [firestore, vendorIdParam]);
  
  const { data: vendorById, loading: idLoading } = useDoc<Vendor>(vendorByIdRef);
  const vendor = useMemo(() => vendorsBySlug?.[0] || vendorById, [vendorsBySlug, vendorById]);

  // 2. Fetch Data Set Metadata
  const dataSetRef = useMemoFirebase(() => 
    vendor && setId ? doc(firestore, 'data-warehouse', vendor.id, 'dataSets', setId) : null,
  [firestore, vendor, setId]);
  const { data: dataSet, loading: setMetaLoading } = useDoc<DataSet>(dataSetRef);

  // 3. Fetch Rows
  const rowsQuery = useMemoFirebase(() => {
    if (!vendor || !setId) return null;
    return collection(firestore, 'data-warehouse', vendor.id, 'dataSets', setId, 'rows');
  }, [firestore, vendor, setId]);
  const { data: rows, loading: rowsLoading } = useCollection<any>(rowsQuery);

  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');

  const filteredRows = useMemo(() => {
    if (!rows) return [];
    if (!searchTerm) return rows;
    const lower = searchTerm.toLowerCase();
    return rows.filter(row => 
        Object.values(row).some(val => String(val ?? '').toLowerCase().includes(lower))
    );
  }, [rows, searchTerm]);

  const breadcrumbParts = useMemo((): BreadcrumbPart[] => {
    if (!vendor) return [];
    return [
      { href: '/admin', label: 'Admin' },
      { href: '/data-warehouse', label: 'Data Warehouse' },
      { href: `/data-warehouse/${vendor.slug || vendor.id}`, label: vendor.name },
      { href: '#', label: dataSet?.name || 'Table View' },
    ];
  }, [vendor, dataSet]);
  
  const loading = slugLoading || idLoading || setMetaLoading || rowsLoading;

  if (loading) {
      return (
        <div className="flex h-screen w-full items-center justify-center">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
        </div>
      );
  }

  if (!vendor || !setId) {
      return (
          <Card className="m-6">
              <CardHeader>
                  <CardTitle>Missing Context</CardTitle>
                  <CardDescription>A vendor ID and data set ID are required to view this page.</CardDescription>
              </CardHeader>
              <CardContent>
                  <Button asChild>
                      <Link href="/data-warehouse">Back to Warehouse</Link>
                  </Button>
              </CardContent>
          </Card>
      );
  }

  return (
    <div className="space-y-4 max-w-full min-w-0 flex flex-col h-full">
        <div className="flex items-start justify-between shrink-0">
            <div className="min-w-0">
                <h1 className="text-2xl font-bold truncate">{dataSet?.name || 'Table Viewer'}</h1>
                <BreadcrumbNav parts={breadcrumbParts} />
            </div>
            <Button variant="outline" size="sm" asChild>
                <Link href={`/data-warehouse/${vendor.slug || vendor.id}`}>
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    Back to Vendor
                </Link>
            </Button>
        </div>

        <Card className="flex-1 max-w-full overflow-hidden flex flex-col min-w-0">
            <CardHeader className="border-b bg-muted/30 shrink-0">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Search this table..." 
                            className="pl-9 h-10"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('list')}>
                            <List className="h-4 w-4" />
                        </Button>
                        <Button variant={viewMode === 'card' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('card')}>
                            <LayoutGrid className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0 flex-1 min-w-0 overflow-hidden flex flex-col">
                {filteredRows.length > 0 ? (
                    <div className="flex-1 overflow-auto min-w-0 max-w-full">
                        {viewMode === 'list' ? (
                            <JsonDataVisualizer data={filteredRows} />
                        ) : (
                            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {filteredRows.map((row, i) => (
                                    <Card key={i} className="flex flex-col h-fit">
                                        <CardHeader className="p-4 pb-2">
                                            <CardTitle className="text-sm font-bold truncate">
                                                {row.name || row.Description || row.Part_Number || `Record #${i+1}`}
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="p-4 pt-0 flex-grow">
                                            <div className="space-y-1">
                                                {Object.entries(row).slice(0, 5).map(([k, v]) => k !== 'id' && (
                                                    <div key={k} className="flex justify-between text-[10px]">
                                                        <span className="text-muted-foreground uppercase font-black tracking-tighter shrink-0 mr-2">{k}:</span>
                                                        <span className="font-bold truncate text-right">{String(v)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                        <TableIcon className="h-12 w-12 mb-4 opacity-10" />
                        <p>No records found matching your search.</p>
                    </div>
                )}
            </CardContent>
        </Card>
    </div>
  );
}

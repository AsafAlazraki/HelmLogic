'use client';

import { useParams } from 'next/navigation';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase/firestore/use-collection';
import { Loader2 } from 'lucide-react';
import { BreadcrumbNav, type BreadcrumbPart } from '@/components/breadcrumb-nav';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { useMemo } from 'react';
import { useFirestore } from '@/firebase/provider';
import { collection, query, where } from 'firebase/firestore';

interface Vendor {
    id: string;
    name: string;
    slug?: string;
}

export default function VendorDataPage() {
  const params = useParams();
  const firestore = useFirestore();
  const slugOrId = params.vendorId as string;

  const vendorQueryBySlug = useMemo(() => {
    if (!slugOrId) return null;
    return query(collection(firestore, 'data-warehouse'), where('slug', '==', slugOrId));
  }, [firestore, slugOrId]);
  
  const { data: vendorsBySlug, loading: slugLoading } = useCollection<Vendor>(vendorQueryBySlug);
  const { data: vendorById, loading: idLoading } = useDoc<Vendor>(slugOrId ? `/data-warehouse/${slugOrId}`: null);
  const vendor = useMemo(() => vendorsBySlug?.[0] || vendorById, [vendorsBySlug, vendorById]);
  const vendorLoading = slugLoading || idLoading;

  const breadcrumbParts = useMemo((): BreadcrumbPart[] => {
    if (!vendor) return [];
    return [
      { href: '/dashboard', label: 'Dashboard' },
      { href: `/vendor-data/${vendor.slug || vendor.id}`, label: `${vendor.name} Data` },
    ];
  }, [vendor]);
  
  if (vendorLoading) {
      return (
        <div className="flex h-[400px] w-full items-center justify-center">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
        </div>
      );
  }

  if (!vendor) {
      return (
          <Card>
              <CardHeader>
                  <CardTitle>Vendor Not Found</CardTitle>
              </CardHeader>
              <CardContent>
                  <p>The requested vendor could not be found.</p>
              </CardContent>
          </Card>
      );
  }

  return (
    <div className="space-y-4">
        <div>
            <h1 className="text-2xl font-semibold">{vendor.name} - Data</h1>
            <BreadcrumbNav parts={breadcrumbParts} />
        </div>
        <Card>
            <CardHeader>
                <CardTitle>Vendor Data View</CardTitle>
                <CardDescription>Data from {vendor.name} will be displayed here.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex items-center justify-center h-64 text-muted-foreground border-2 border-dashed rounded-lg">
                    <p>Vendor data view coming soon.</p>
                </div>
            </CardContent>
        </Card>
    </div>
  );
}

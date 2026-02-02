'use client';

import { useParams } from 'next/navigation';
import { useDoc } from '@/firebase/firestore/use-doc';
import { Loader2 } from 'lucide-react';
import { BreadcrumbNav } from '@/components/breadcrumb-nav';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';

interface Vendor {
    id: string;
    name: string;
}

export default function VendorDataPage() {
  const params = useParams();
  const vendorId = params.vendorId as string;

  const { data: vendor, loading: vendorLoading } = useDoc<Vendor>(vendorId ? `/data-warehouse/${vendorId}` : null);
  
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
            <BreadcrumbNav pageTitle={vendor.name} />
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

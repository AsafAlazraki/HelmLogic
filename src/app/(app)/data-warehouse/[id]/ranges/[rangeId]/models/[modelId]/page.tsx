'use client';

import { useParams } from 'next/navigation';
import { useDoc } from '@/firebase/firestore/use-doc';
import { Loader2 } from 'lucide-react';
import { BreadcrumbNav } from '@/components/breadcrumb-nav';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';

interface Model {
    id: string;
    name: string;
}

interface Range {
    id: string;
    name: string;
}

interface Vendor {
    id: string;
    name: string;
}


export default function ModelDetailsPage() {
  const params = useParams();
  const vendorId = params.id as string;
  const rangeId = params.rangeId as string;
  const modelId = params.modelId as string;

  const { data: vendor, loading: vendorLoading } = useDoc<Vendor>(vendorId ? `/data-warehouse/${vendorId}` : null);
  const { data: range, loading: rangeLoading } = useDoc<Range>(vendorId && rangeId ? `/data-warehouse/${vendorId}/ranges/${rangeId}` : null);
  const { data: model, loading: modelLoading } = useDoc<Model>(vendorId && rangeId && modelId ? `/data-warehouse/${vendorId}/ranges/${rangeId}/models/${modelId}` : null);
  
  const loading = vendorLoading || rangeLoading || modelLoading;

  if (loading) {
      return (
        <div className="flex h-[400px] w-full items-center justify-center">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
        </div>
      );
  }

  if (!vendor || !range || !model) {
      return (
          <Card>
              <CardHeader>
                  <CardTitle>Not Found</CardTitle>
              </CardHeader>
              <CardContent>
                  <p>The requested vendor, range or model could not be found.</p>
              </CardContent>
          </Card>
      );
  }

  return (
    <div className="space-y-4">
        <div>
            <h1 className="text-2xl font-semibold">{vendor.name} - {range.name} - {model.name}</h1>
            <BreadcrumbNav pageTitle={model.name} />
        </div>
        <Card>
            <CardHeader>
                <CardTitle>Model Details</CardTitle>
                <CardDescription>Details for the {model.name} model will be displayed here.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex items-center justify-center h-64 text-muted-foreground border-2 border-dashed rounded-lg">
                    <p>Model details view coming soon.</p>
                </div>
            </CardContent>
        </Card>
    </div>
  );
}

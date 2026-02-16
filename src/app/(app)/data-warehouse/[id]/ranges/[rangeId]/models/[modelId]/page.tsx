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
import { HighfieldModelEditor } from '@/components/highfield-model-editor';
import AdminGuard from '@/components/admin-guard';
import { JeanneauModelEditor } from '@/components/jeanneau-model-editor';
import { StacerModelEditor } from '@/components/stacer-model-editor';
import { StabicraftModelEditor } from '@/components/stabicraft-model-editor';
import { SurteesModelEditor } from '@/components/surtees-model-editor';

interface Model {
    id: string;
    name: string;
    slug?: string;
    coverImageUrl?: string;
}

interface Range {
    id: string;
    name: string;
    slug?: string;
}

interface Vendor {
    id: string;
    name: string;
    slug?: string;
}


export default function ModelDetailsPage() {
  const params = useParams();
  const firestore = useFirestore();

  const vendorSlugOrId = params?.id as string | undefined;
  const rangeSlugOrId = params?.rangeId as string | undefined;
  const modelSlugOrId = params?.modelId as string | undefined;

  // Fetch Vendor
  const vendorQueryBySlug = useMemo(() => {
    if (!vendorSlugOrId) return null;
    return query(collection(firestore, 'data-warehouse'), where('slug', '==', vendorSlugOrId));
  }, [firestore, vendorSlugOrId]);
  
  const { data: vendorsBySlug, loading: vendorSlugLoading } = useCollection<Vendor>(vendorQueryBySlug);
  
  const isLikelyAnId = !vendorSlugLoading && (!vendorsBySlug || vendorsBySlug.length === 0);
  const docPath = isLikelyAnId && vendorSlugOrId ? `/data-warehouse/${vendorSlugOrId}` : null;
  const { data: vendorById, loading: vendorIdLoading } = useDoc<Vendor>(docPath);
  
  const vendor = useMemo(() => vendorsBySlug?.[0] || vendorById, [vendorsBySlug, vendorById]);
  const vendorLoading = vendorSlugLoading || vendorIdLoading;
  
  // Fetch Range
  const rangeQueryBySlug = useMemo(() => {
    if (!vendor?.id || !rangeSlugOrId) return null;
    return query(collection(firestore, `data-warehouse/${vendor.id}/ranges`), where('slug', '==', rangeSlugOrId));
  }, [firestore, vendor, rangeSlugOrId]);

  const { data: rangesBySlug, loading: rangeSlugLoading } = useCollection<Range>(rangeQueryBySlug);
  const { data: rangeById, loading: rangeIdLoading } = useDoc<Range>(vendor?.id && rangeSlugOrId ? `/data-warehouse/${vendor.id}/ranges/${rangeSlugOrId}` : null);
  const range = useMemo(() => rangesBySlug?.[0] || rangeById, [rangesBySlug, rangeById]);
  const rangeLoading = rangeSlugLoading || rangeIdLoading;

  // Fetch Model
  const modelQueryBySlug = useMemo(() => {
    if (!vendor?.id || !range?.id || !modelSlugOrId) return null;
    return query(collection(firestore, `data-warehouse/${vendor.id}/ranges/${range.id}/models`), where('slug', '==', modelSlugOrId));
  }, [firestore, vendor, range, modelSlugOrId]);
  
  const { data: modelsBySlug, loading: modelSlugLoading } = useCollection<Model>(modelQueryBySlug);
  const { data: modelById, loading: modelIdLoading } = useDoc<Model>(vendor?.id && range?.id && modelSlugOrId ? `/data-warehouse/${vendor.id}/ranges/${range.id}/models/${modelSlugOrId}` : null);
  const model = useMemo(() => modelsBySlug?.[0] || modelById, [modelsBySlug, modelById]);
  const modelLoading = modelSlugLoading || modelIdLoading;

  const loading = vendorLoading || rangeLoading || modelLoading;

  const breadcrumbParts = useMemo((): BreadcrumbPart[] => {
    if (!vendor || !range || !model) return [];
    return [
      { href: "/admin", label: "Admin" },
      { href: "/data-warehouse", label: "Data Warehouse" },
      { href: `/data-warehouse/${vendor.slug || vendor.id}`, label: vendor.name },
      { href: `/data-warehouse/${vendor.slug || vendor.id}/ranges/${range.slug || range.id}`, label: range.name },
      { href: `/data-warehouse/${vendor.slug || vendor.id}/ranges/${range.slug || range.id}/models/${model.slug || model.id}`, label: model.name },
    ];
  }, [vendor, range, model]);

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

  const modelDocPath = `/data-warehouse/${vendor.id}/ranges/${range.id}/models/${model.id}`;

  return (
    <AdminGuard>
        <div className="space-y-4">
            <div>
                <h1 className="text-2xl font-semibold">{vendor.name} - {range.name} - {model.name}</h1>
                <BreadcrumbNav parts={breadcrumbParts} />
            </div>
            
            {vendor.slug === 'highfield' ? (
                <HighfieldModelEditor model={model} docPath={modelDocPath} vendor={vendor} />
            ) : vendor.slug === 'jeanneau' ? (
                <JeanneauModelEditor model={model} docPath={modelDocPath} />
            ) : vendor.slug === 'stacer' ? (
                <StacerModelEditor model={model} docPath={modelDocPath} vendor={vendor} />
            ) : vendor.slug === 'stabicraft' ? (
                <StabicraftModelEditor model={model} docPath={modelDocPath} vendor={vendor} />
            ) : vendor.slug === 'surtees' ? (
                <SurteesModelEditor model={model} docPath={modelDocPath} />
            ) : (
                <Card>
                    <CardHeader>
                        <CardTitle>Model Details</CardTitle>
                        <CardDescription>Details for the {model.name} model will be displayed here.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-center h-64 text-muted-foreground border-2 border-dashed rounded-lg">
                            <p>Model-specific editor coming soon.</p>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    </AdminGuard>
  );
}

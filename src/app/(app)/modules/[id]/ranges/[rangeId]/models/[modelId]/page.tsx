'use client';

import { useParams } from 'next/navigation';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase/firestore/use-collection';
import { Loader2, ChevronRight } from 'lucide-react';
import { BreadcrumbNav, type BreadcrumbPart } from '@/components/breadcrumb-nav';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { useMemo } from 'react';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { collection, query, where, doc } from 'firebase/firestore';
import { ModelConfigurationEditor } from '@/components/model-configuration-editor';
import { useUser } from '@/firebase/auth/use-user';

interface Model {
    id: string;
    name: string;
    slug?: string;
    coverImageUrl?: string;
    rangeId: string;
    [key: string]: any;
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

interface Module {
    id: string;
    name: string;
}

export default function DirectModelDetailsPage() {
  const params = useParams();
  const firestore = useFirestore();
  const { user } = useUser();

  const vendorSlugOrId = params?.id as string | undefined;
  const rangeSlugOrId = params?.rangeId as string | undefined;
  const modelSlugOrId = params?.modelId as string | undefined;

  // Fetch Vendor
  const vendorQuery = useMemoFirebase(() => {
    if (!vendorSlugOrId) return null;
    return query(collection(firestore, 'data-warehouse'), where('slug', '==', vendorSlugOrId));
  }, [firestore, vendorSlugOrId]);
  
  const { data: vendorsBySlug, loading: vendorSlugLoading } = useCollection<Vendor>(vendorQuery);
  const vendorByIdRef = useMemoFirebase(() => vendorSlugOrId ? doc(firestore, 'data-warehouse', vendorSlugOrId) : null, [firestore, vendorSlugOrId]);
  const { data: vendorById, loading: vendorIdLoading } = useDoc<Vendor>(vendorByIdRef);
  
  const vendor = useMemo(() => vendorsBySlug?.[0] || vendorById, [vendorsBySlug, vendorById]);
  const vendorLoading = vendorSlugLoading || vendorIdLoading;
  
  // Fetch Range
  const rangeQuery = useMemoFirebase(() => {
    if (!vendor?.id || !rangeSlugOrId) return null;
    return query(collection(firestore, `data-warehouse/${vendor.id}/ranges`), where('slug', '==', rangeSlugOrId));
  }, [firestore, vendor, rangeSlugOrId]);

  const { data: rangesBySlug, loading: rangeSlugLoading } = useCollection<Range>(rangeQuery);
  const rangeByIdRef = useMemoFirebase(() => vendor?.id && rangeSlugOrId ? doc(firestore, `data-warehouse/${vendor.id}/ranges`, rangeSlugOrId) : null, [firestore, vendor, rangeSlugOrId]);
  const { data: rangeById, loading: rangeIdLoading } = useDoc<Range>(rangeByIdRef);
  const range = useMemo(() => rangesBySlug?.[0] || rangeById, [rangesBySlug, rangeById]);
  const rangeLoading = rangeSlugLoading || rangeIdLoading;

  // Fetch Model
  const modelQuery = useMemoFirebase(() => {
    if (!vendor?.id || !range?.id || !modelSlugOrId) return null;
    return query(collection(firestore, `data-warehouse/${vendor.id}/ranges/${range.id}/models`), where('slug', '==', modelSlugOrId));
  }, [firestore, vendor, range, modelSlugOrId]);
  
  const { data: modelsBySlug, loading: modelSlugLoading } = useCollection<Model>(modelQuery);
  const modelByIdRef = useMemoFirebase(() => vendor?.id && range?.id && modelSlugOrId ? doc(firestore, `data-warehouse/${vendor.id}/ranges/${range.id}/models`, modelSlugOrId) : null, [firestore, vendor, range, modelSlugOrId]);
  const { data: modelById, loading: modelIdLoading } = useDoc<Model>(modelByIdRef);
  
  // CRITICAL FIX: Favor direct document reference (ID) over slug query to ensure 
  // we are getting the absolute latest data from the listener without query lag.
  const model = useMemo(() => modelById || modelsBySlug?.[0], [modelsBySlug, modelById]);
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
          <Card className="max-w-2xl mx-auto mt-12">
              <CardHeader>
                  <CardTitle>Model Not Found</CardTitle>
              </CardHeader>
              <CardContent>
                  <p className="text-muted-foreground">The requested boat model could not be located in the Data Warehouse.</p>
              </CardContent>
          </Card>
      );
  }

  const modelDocPath = `data-warehouse/${vendor.id}/ranges/${range.id}/models/${model.id}`;

  return (
    <div className="space-y-4">
        <ModelConfigurationEditor 
            model={model} 
            docPath={modelDocPath} 
            vendor={vendor} 
            module={{ id: 'master', name: 'Data Warehouse' }}
            user={user}
            isAdmin={true}
            breadcrumbs={
                <div className="flex items-center text-sm text-muted-foreground">
                    <span>Data Warehouse</span>
                    <ChevronRight className="h-4 w-4 mx-1" />
                    <span>{vendor.name}</span>
                    <ChevronRight className="h-4 w-4 mx-1" />
                    <span className="font-medium text-foreground">{range.name}</span>
                </div>
            }
        />
    </div>
  );
}
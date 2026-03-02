'use client';

import { useParams } from 'next/navigation';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase/firestore/use-collection';
import { Loader2, ChevronRight } from 'lucide-react';
import { BreadcrumbNav, type BreadcrumbPart } from '@/components/breadcrumb-nav';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useMemo } from 'react';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { collection, query, where, doc } from 'firebase/firestore';
import { ModelConfigurationEditor } from '@/components/model-configuration-editor';
import { useUser } from '@/firebase/auth/use-user';

interface Model {
    id: string;
    name: string;
    modelCode?: string;
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

export default function ModelDetailsPage() {
  const params = useParams();
  const firestore = useFirestore();
  const { user } = useUser();

  const vendorSlugOrId = params?.id as string | undefined;
  const rangeSlugOrId = params?.rangeId as string | undefined;
  const modelSlugOrId = params?.modelId as string | undefined;

  // 1. Fetch Vendor
  const vendorQuery = useMemoFirebase(() => {
    if (!vendorSlugOrId) return null;
    return query(collection(firestore, 'data-warehouse'), where('slug', '==', vendorSlugOrId));
  }, [firestore, vendorSlugOrId]);
  const { data: vendorsBySlug } = useCollection<Vendor>(vendorQuery);
  const vendorByIdRef = useMemoFirebase(() => vendorSlugOrId ? doc(firestore, 'data-warehouse', vendorSlugOrId) : null, [firestore, vendorSlugOrId]);
  const { data: vendorById } = useDoc<Vendor>(vendorByIdRef);
  const vendor = useMemo(() => vendorsBySlug?.[0] || vendorById, [vendorsBySlug, vendorById]);
  
  // 2. Fetch Range
  const rangeQuery = useMemoFirebase(() => {
    if (!vendor?.id || !rangeSlugOrId) return null;
    return query(collection(firestore, `data-warehouse/${vendor.id}/ranges`), where('slug', '==', rangeSlugOrId));
  }, [firestore, vendor, rangeSlugOrId]);
  const { data: rangesBySlug } = useCollection<Range>(rangeQuery);
  const rangeByIdRef = useMemoFirebase(() => vendor?.id && rangeSlugOrId ? doc(firestore, 'data-warehouse', vendor.id, 'ranges', rangeSlugOrId) : null, [firestore, vendor?.id, rangeSlugOrId]);
  const { data: rangeById } = useDoc<Range>(rangeByIdRef);
  const range = useMemo(() => rangesBySlug?.[0] || rangeById, [rangesBySlug, rangeById]);

  // 3. Robust Model Resolver
  const modelByIdRef = useMemoFirebase(() => 
    vendor?.id && range?.id && modelSlugOrId ? doc(firestore, 'data-warehouse', vendor.id, 'ranges', range.id, 'models', modelSlugOrId) : null,
  [firestore, vendor?.id, range?.id, modelSlugOrId]);
  const { data: modelById, loading: idLoading } = useDoc<Model>(modelByIdRef);

  const modelQueryBySlug = useMemoFirebase(() => {
    if (!vendor?.id || !range?.id || !modelSlugOrId || (modelById && !idLoading)) return null;
    return query(collection(firestore, `data-warehouse/${vendor.id}/ranges/${range.id}/models`), where('slug', '==', modelSlugOrId));
  }, [firestore, vendor, range, modelSlugOrId, modelById, idLoading]);
  const { data: modelsBySlug, isLoading: slugLoading } = useCollection<Model>(modelQueryBySlug);

  // 4. Final Real-time Sync via Direct Doc Listener
  const resolvedModelId = useMemo(() => modelById?.id || modelsBySlug?.[0]?.id, [modelById, modelsBySlug]);
  const finalModelRef = useMemoFirebase(() => 
    vendor?.id && range?.id && resolvedModelId ? doc(firestore, 'data-warehouse', vendor.id, 'ranges', range.id, 'models', resolvedModelId) : null,
  [firestore, vendor?.id, range?.id, resolvedModelId]);
  const { data: model, isLoading: modelLoading } = useDoc<Model>(finalModelRef);

  const loading = !vendor || !range || modelLoading || idLoading || slugLoading;

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
              <CardHeader><CardTitle>Not Found</CardTitle></CardHeader>
              <CardContent><p>The requested vendor, range or model could not be found.</p></CardContent>
          </Card>
      );
  }

  return (
    <div className="space-y-4">
        <ModelConfigurationEditor 
            model={model} 
            docPath={`data-warehouse/${vendor.id}/ranges/${range.id}/models/${model.id}`} 
            vendor={vendor} 
            module={{ id: 'master', name: 'Data Warehouse' }}
            user={user}
            isAdmin={true}
            isMasterContext={true}
            breadcrumbs={<BreadcrumbNav parts={breadcrumbParts} />}
        />
    </div>
  );
}

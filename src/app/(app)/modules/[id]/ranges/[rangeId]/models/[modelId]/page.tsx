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

export default function DirectModelDetailsPage() {
  const params = useParams();
  const firestore = useFirestore();
  const { user } = useUser();

  const vendorSlugOrId = params?.id as string | undefined;
  const rangeSlugOrId = params?.rangeId as string | undefined;
  const modelSlugOrId = params?.modelId as string | undefined;

  // 1. Resolve User Context
  const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: userProfile, loading: profileLoading } = useDoc<any>(userProfileRef);
  const organisationId = userProfile?.organisationId;

  // 2. Fetch Vendor
  const vendorQuery = useMemoFirebase(() => {
    if (!vendorSlugOrId) return null;
    return query(collection(firestore, 'data-warehouse'), where('slug', '==', vendorSlugOrId));
  }, [firestore, vendorSlugOrId]);
  const { data: vendorsBySlug } = useCollection<Vendor>(vendorQuery);
  const vendorByIdRef = useMemoFirebase(() => vendorSlugOrId ? doc(firestore, 'data-warehouse', vendorSlugOrId) : null, [firestore, vendorSlugOrId]);
  const { data: vendorById } = useDoc<Vendor>(vendorByIdRef);
  const vendor = useMemo(() => vendorsBySlug?.[0] || vendorById, [vendorsBySlug, vendorById]);
  
  // 3. Fetch Range
  const rangeQuery = useMemoFirebase(() => {
    if (!vendor?.id || !rangeSlugOrId) return null;
    return query(collection(firestore, `data-warehouse/${vendor.id}/ranges`), where('slug', '==', rangeSlugOrId));
  }, [firestore, vendor, rangeSlugOrId]);
  const { data: rangesBySlug } = useCollection<Range>(rangeQuery);
  const rangeByIdRef = useMemoFirebase(() => vendor?.id && rangeSlugOrId ? doc(firestore, 'data-warehouse', vendor.id, 'ranges', rangeSlugOrId) : null, [firestore, vendor, rangeSlugOrId]);
  const { data: rangeById } = useDoc<Range>(rangeByIdRef);
  const range = useMemo(() => rangesBySlug?.[0] || rangeById, [rangesBySlug, rangeById]);

  // 4. Resolve Model ID
  const modelByIdRef = useMemoFirebase(() => 
    vendor?.id && range?.id && modelSlugOrId ? doc(firestore, 'data-warehouse', vendor.id, 'ranges', range.id, 'models', modelSlugOrId) : null,
  [firestore, vendor, range, modelSlugOrId]);
  const { data: modelById, loading: idLoading } = useDoc<Model>(modelByIdRef);

  const modelQueryBySlug = useMemoFirebase(() => {
    if (!vendor?.id || !range?.id || !modelSlugOrId || (modelById && !idLoading)) return null;
    return query(collection(firestore, `data-warehouse/${vendor.id}/ranges/${range.id}/models`), where('slug', '==', modelSlugOrId));
  }, [firestore, vendor, range, modelSlugOrId, modelById, idLoading]);
  const { data: modelsBySlug } = useCollection<Model>(modelQueryBySlug);

  const resolvedModelId = useMemo(() => modelById?.id || modelsBySlug?.[0]?.id, [modelById, modelsBySlug]);

  // 5. Real-time Master Data Listener
  const masterModelRef = useMemoFirebase(() => 
    vendor?.id && range?.id && resolvedModelId ? doc(firestore, 'data-warehouse', vendor.id, 'ranges', range.id, 'models', resolvedModelId) : null,
  [firestore, vendor, range, resolvedModelId]);
  const { data: masterModel, isLoading: masterLoading } = useDoc<Model>(masterModelRef);

  // 6. Real-time Organisation Override Listener
  const overrideRef = useMemoFirebase(() => 
    organisationId && resolvedModelId ? doc(firestore, 'organisations', organisationId, 'modelOverrides', resolvedModelId) : null,
  [firestore, organisationId, resolvedModelId]);
  const { data: overrideData, isLoading: overrideLoading } = useDoc<any>(overrideRef);

  // 7. Effective Data Merge
  const effectiveModel = useMemo(() => {
    if (!masterModel) return null;
    if (!overrideData) return masterModel;
    // Merge Master + Override (Organisation changes take precedence)
    return { ...masterModel, ...overrideData };
  }, [masterModel, overrideData]);

  const loading = !vendor || !range || masterLoading || overrideLoading || profileLoading;

  if (loading) {
      return (
        <div className="flex h-[400px] w-full items-center justify-center">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
        </div>
      );
  }

  if (!vendor || !range || !effectiveModel) {
      return (
          <Card className="max-w-2xl mx-auto mt-12">
              <CardHeader><CardTitle>Model Not Found</CardTitle></CardHeader>
              <CardContent><p className="text-muted-foreground">The requested boat model could not be located in the Data Warehouse.</p></CardContent>
          </Card>
      );
  }

  return (
    <div className="space-y-4">
        <ModelConfigurationEditor 
            model={effectiveModel} 
            docPath={`data-warehouse/${vendor.id}/ranges/${range.id}/models/${effectiveModel.id}`} 
            vendor={vendor} 
            module={{ id: 'direct-access', name: 'Product Catalog' }}
            user={user}
            isAdmin={userProfile?.appRole === 'HelmLogic Admin'}
            organisationId={organisationId}
            breadcrumbs={
                <div className="flex items-center text-sm text-muted-foreground">
                    <span>{vendor.name}</span>
                    <ChevronRight className="h-4 w-4 mx-1" />
                    <span className="font-medium text-foreground">{range.name}</span>
                </div>
            }
        />
    </div>
  );
}

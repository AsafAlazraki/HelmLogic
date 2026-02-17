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
import { JeanneauModelEditor } from '@/components/jeanneau-model-editor';
import { StacerModelEditor } from '@/components/stacer-model-editor';
import { StabicraftModelEditor } from '@/components/stabicraft-model-editor';
import { SurteesModelEditor } from '@/components/surtees-model-editor';

interface Model { id: string; name: string; slug?: string; coverImageUrl?: string; rangeId: string; }
interface Range { id: string; name: string; slug?: string; }
interface Vendor { id: string; name: string; slug?: string; }
interface Module { id: string; name: string; slug?: string; mainVendorId: string; }

export default function ModuleModelDetailsPage() {
  const params = useParams();
  const firestore = useFirestore();

  const moduleSlugOrId = params?.id as string | undefined;
  const rangeSlugOrId = params?.rangeId as string | undefined;
  const modelSlugOrId = params?.modelId as string | undefined;

  // Fetch Module
  const moduleQueryBySlug = useMemo(() => {
    if (!moduleSlugOrId) return null;
    return query(collection(firestore, 'modules'), where('slug', '==', moduleSlugOrId));
  }, [firestore, moduleSlugOrId]);
  const { data: modulesBySlug, loading: moduleSlugLoading } = useCollection<Module>(moduleQueryBySlug);
  const { data: moduleById, loading: moduleIdLoading } = useDoc<Module>(moduleSlugOrId ? `/modules/${moduleSlugOrId}` : null);
  const moduleData = useMemo(() => modulesBySlug?.[0] || moduleById, [modulesBySlug, moduleById]);
  const moduleLoading = moduleSlugLoading || moduleIdLoading;

  // Fetch Vendor
  const { data: vendor, loading: vendorLoading } = useDoc<Vendor>(moduleData ? `/data-warehouse/${moduleData.mainVendorId}` : null);
  
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

  const loading = moduleLoading || vendorLoading || rangeLoading || modelLoading;

  const breadcrumbParts = useMemo((): BreadcrumbPart[] => {
    if (!moduleData || !range || !model) return [];
    return [
      { href: "/dashboard", label: "Dashboard" },
      { href: `/modules/${moduleData.slug || moduleData.id}`, label: moduleData.name },
      { href: `/modules/${moduleData.slug || moduleData.id}/ranges/${range.slug || range.id}`, label: range.name },
      { href: `#`, label: model.name },
    ];
  }, [moduleData, range, model]);

  if (loading) return <div className="flex h-[400px] w-full items-center justify-center"><Loader2 className="h-16 w-16 animate-spin text-primary" /></div>;
  if (!vendor || !range || !model || !moduleData) return <Card><CardHeader><CardTitle>Not Found</CardTitle></CardHeader><CardContent><p>The requested module, vendor, range or model could not be found.</p></CardContent></Card>;

  const modelDocPath = `/data-warehouse/${vendor.id}/ranges/${range.id}/models/${model.id}`;

  return (
    <div className="space-y-4">
        <div>
            <h1 className="text-2xl font-semibold">{vendor.name} - {range.name} - {model.name}</h1>
            <BreadcrumbNav parts={breadcrumbParts} />
        </div>
        
        {vendor.slug === 'highfield' ? (
            <HighfieldModelEditor model={model} docPath={modelDocPath} />
        ) : vendor.slug === 'jeanneau' ? (
            <JeanneauModelEditor model={model} docPath={modelDocPath} />
        ) : vendor.slug === 'stacer' ? (
            <StacerModelEditor model={model} docPath={modelDocPath} />
        ) : vendor.slug === 'stabicraft' ? (
            <StabicraftModelEditor model={model} docPath={modelDocPath} />
        ) : vendor.slug === 'surtees' ? (
            <SurteesModelEditor model={model} docPath={modelDocPath} />
        ) : (
            <Card>
                <CardHeader><CardTitle>Model Details</CardTitle><CardDescription>Details for the {model.name} model will be displayed here.</CardDescription></CardHeader>
                <CardContent><div className="flex items-center justify-center h-64 text-muted-foreground border-2 border-dashed rounded-lg"><p>Model-specific editor coming soon.</p></div></CardContent>
            </Card>
        )}
    </div>
  );
}

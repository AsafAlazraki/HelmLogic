'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { Loader2 } from 'lucide-react';
import { BreadcrumbNav, type BreadcrumbPart } from '@/components/breadcrumb-nav';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import AdminGuard from '@/components/admin-guard';
import { HighfieldModelEditor } from '@/components/highfield-model-editor';

interface Model {
    id: string;
    name: string;
    slug?: string;
    [key: string]: any; 
}

interface Range {
    id: string;
    name: string;
    slug?: string;
    vendorId: string;
}

interface Vendor {
    id: string;
    name: string;
    slug?: string;
}

export default function ModelDetailsPage() {
    const params = useParams();
    const vendorSlugOrId = params?.id as string | undefined;
    const rangeSlugOrId = params?.rangeId as string | undefined;
    const modelSlugOrId = params?.modelId as string | undefined;
    const firestore = useFirestore();

    // 1. Fetch Vendor
    const vendorQuery = useMemo(() => {
        if (!vendorSlugOrId) return null;
        return query(collection(firestore, 'data-warehouse'), where('slug', '==', vendorSlugOrId));
    }, [firestore, vendorSlugOrId]);
    
    const { data: vendorsBySlug, loading: slugLoading } = useCollection<Vendor>(vendorQuery);
    const { data: vendorById, loading: idLoading } = useDoc<Vendor>(vendorSlugOrId ? `/data-warehouse/${vendorSlugOrId}` : null);
    
    const vendor = useMemo(() => vendorsBySlug?.[0] || vendorById, [vendorsBySlug, vendorById]);
    const vendorLoading = slugLoading || idLoading;

    // 2. Fetch Range
    const rangeQueryBySlug = useMemo(() => {
        if (!vendor || !rangeSlugOrId) return null;
        return query(collection(firestore, `data-warehouse/${vendor.id}/ranges`), where('slug', '==', rangeSlugOrId));
    }, [firestore, vendor, rangeSlugOrId]);
    
    const { data: rangesBySlug, loading: rangeSlugLoading } = useCollection<Range>(rangeQueryBySlug);
    const { data: rangeById, loading: rangeIdLoading } = useDoc<Range>(vendor && rangeSlugOrId ? `/data-warehouse/${vendor.id}/ranges/${rangeSlugOrId}` : null);
    const range = useMemo(() => rangesBySlug?.[0] || rangeById, [rangesBySlug, rangeById]);
    const rangeLoading = rangeSlugLoading || rangeIdLoading;

    // 3. Fetch Model
    const modelQueryBySlug = useMemo(() => {
        if (!vendor || !range || !modelSlugOrId) return null;
        return query(collection(firestore, `data-warehouse/${vendor.id}/ranges/${range.id}/models`), where('slug', '==', modelSlugOrId));
    }, [firestore, vendor, range, modelSlugOrId]);
    
    const { data: modelsBySlug, loading: modelSlugLoading } = useCollection<Model>(modelQueryBySlug);
    const { data: modelById, loading: modelIdLoading } = useDoc<Model>(vendor && range && modelSlugOrId ? `/data-warehouse/${vendor.id}/ranges/${range.id}/models/${modelSlugOrId}` : null);
    const model = useMemo(() => modelsBySlug?.[0] || modelById, [modelsBySlug, modelById]);
    const modelLoading = modelSlugLoading || modelIdLoading;

    const docPath = useMemo(() => {
        if (!vendor || !range || !model) return '';
        return `/data-warehouse/${vendor.id}/ranges/${range.id}/models/${model.id}`;
    }, [vendor, range, model]);

    const breadcrumbParts = useMemo((): BreadcrumbPart[] => {
        if (!vendor || !range || !model) return [];
        return [
             { label: 'Admin', href: '/admin' },
             { label: 'Data Warehouse', href: '/data-warehouse' },
             { label: vendor.name, href: `/data-warehouse/${vendor.slug || vendor.id}` },
             { label: range.name, href: `/data-warehouse/${vendor.slug || vendor.id}/ranges/${range.slug || range.id}` },
             { label: model.name, href: '#' }
        ];
    }, [vendor, range, model]);

    const loading = vendorLoading || rangeLoading || modelLoading;

    if (loading) {
        return (
            <div className="flex h-[400px] w-full items-center justify-center">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
            </div>
        );
    }
    
    if (!vendor) {
        return (
            <Card>
                <CardHeader><CardTitle>Vendor Not Found</CardTitle></CardHeader>
                <CardContent><p>The requested vendor could not be found.</p></CardContent>
            </Card>
        );
    }

     if (!range) {
        return (
            <Card>
                <CardHeader><CardTitle>Range Not Found</CardTitle></CardHeader>
                <CardContent><p>The requested range could not be found within this vendor's structure.</p></CardContent>
            </Card>
        );
    }

    if (!model) {
        return (
            <Card>
                <CardHeader><CardTitle>Model Not Found</CardTitle></CardHeader>
                <CardContent><p>The requested model could not be found within this range.</p></CardContent>
            </Card>
        );
    }

    const isHighfield = vendor.slug === 'highfield';

    return (
        <AdminGuard>
            <div className="space-y-4">
                <div>
                    <h1 className="text-2xl font-semibold">{model.name}</h1>
                    <BreadcrumbNav parts={breadcrumbParts} />
                </div>
                {isHighfield ? (
                    <HighfieldModelEditor model={model} docPath={docPath} />
                ) : (
                    <Card>
                        <CardHeader>
                            <CardTitle>Model Details</CardTitle>
                            <CardContent>Details for {model.name}, part of the {range?.name} range.</CardContent>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-center h-64 text-muted-foreground border-2 border-dashed rounded-lg">
                                <p>Model configurator for this vendor is coming soon.</p>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </AdminGuard>
    );
}

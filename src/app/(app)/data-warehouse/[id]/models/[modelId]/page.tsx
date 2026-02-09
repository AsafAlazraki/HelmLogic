'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { Loader2 } from 'lucide-react';
import { BreadcrumbNav } from '@/components/breadcrumb-nav';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import AdminGuard from '@/components/admin-guard';

interface Model {
    id: string;
    name: string;
    slug?: string;
}

interface Range {
    id: string;
    name: string;
    slug?: string;
    models: Model[];
}

interface Vendor {
    id: string;
    name: string;
    slug?: string;
    structure?: Range[];
}

export default function ModelDetailsPage() {
    const params = useParams();
    const vendorSlug = params?.id as string | undefined;
    const modelSlug = params?.modelId as string | undefined;
    const firestore = useFirestore();

    const vendorQuery = useMemo(() => {
        if (!vendorSlug) return null;
        return query(collection(firestore, 'data-warehouse'), where('slug', '==', vendorSlug));
    }, [firestore, vendorSlug]);
    
    const { data: vendorsBySlug, loading: slugLoading } = useCollection<Vendor>(vendorQuery);
    
    // Fallback to ID if not found by slug
    const isLikelyAnId = !slugLoading && (!vendorsBySlug || vendorsBySlug.length === 0);
    const docPath = isLikelyAnId && vendorSlug ? `/data-warehouse/${vendorSlug}` : null;
    const { data: vendorById, loading: idLoading } = useDoc<Vendor>(docPath);
    
    const vendor = useMemo(() => vendorsBySlug?.[0] || vendorById, [vendorsBySlug, vendorById]);
    const vendorLoading = slugLoading || idLoading;

    const { model, range } = useMemo(() => {
        if (!vendor?.structure || !modelSlug) return { model: null, range: null };
        for (const r of vendor.structure) {
            // Find by slug first, but fall back to ID for resilience
            const m = (r.models || []).find(m => m.slug === modelSlug || m.id === modelSlug);
            if (m) {
                return { model: m, range: r };
            }
        }
        return { model: null, range: null };
    }, [vendor, modelSlug]);

    const breadcrumbParts = useMemo(() => {
        if (!vendor || !range || !model) return [];
        return [
             { label: 'Admin', href: '/admin' },
             { label: 'Data Warehouse', href: '/data-warehouse' },
             { label: vendor.name, href: `/data-warehouse/${vendor.slug || vendor.id}` },
             { label: range.name, href: `/data-warehouse/${vendor.slug || vendor.id}/ranges/${range.slug || range.id}` },
             { label: model.name, href: '#' }
        ];
    }, [vendor, range, model]);

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
                <CardHeader><CardTitle>Vendor Not Found</CardTitle></CardHeader>
                <CardContent><p>The requested vendor could not be found.</p></CardContent>
            </Card>
        );
    }

    if (!model) {
        return (
            <Card>
                <CardHeader><CardTitle>Model Not Found</CardTitle></CardHeader>
                <CardContent><p>The requested model could not be found within this vendor's structure.</p></CardContent>
            </Card>
        );
    }

    return (
        <AdminGuard>
            <div className="space-y-4">
                <div>
                    <h1 className="text-2xl font-semibold">{model.name}</h1>
                    <BreadcrumbNav parts={breadcrumbParts} />
                </div>
                <Card>
                    <CardHeader>
                        <CardTitle>Model Details</CardTitle>
                        <CardDescription>
                            Details for {model.name}, part of the {range?.name} range.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-center h-64 text-muted-foreground border-2 border-dashed rounded-lg">
                            <p>Model configurator form coming soon.</p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </AdminGuard>
    );
}

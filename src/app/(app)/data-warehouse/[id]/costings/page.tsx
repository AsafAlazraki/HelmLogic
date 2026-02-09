'use client';

import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useFirestore } from '@/firebase/provider';
import { collection, query, where } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { BreadcrumbNav, type BreadcrumbPart } from '@/components/breadcrumb-nav';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { HighfieldCostingsTable } from '@/components/highfield-costings-table';

interface Vendor {
    id: string;
    name: string;
    slug?: string;
}

export default function HighfieldCostingsPage() {
    const params = useParams();
    const firestore = useFirestore();
    const slugOrId = params.id as string;

    const vendorQueryBySlug = useMemo(() => {
        if (!slugOrId) return null;
        return query(collection(firestore, 'data-warehouse'), where('slug', '==', slugOrId));
    }, [firestore, slugOrId]);

    const { data: vendorsBySlug, loading: slugLoading } = useCollection<Vendor>(vendorQueryBySlug);
    const { data: vendorById, loading: idLoading } = useDoc<Vendor>(slugOrId ? `/data-warehouse/${slugOrId}` : null);
    const vendor = useMemo(() => vendorsBySlug?.[0] || vendorById, [vendorsBySlug, vendorById]);
    const vendorLoading = slugLoading || idLoading;

    const breadcrumbParts = useMemo((): BreadcrumbPart[] => {
        if (!vendor) return [];
        return [
            { href: "/admin", label: "Admin" },
            { href: "/data-warehouse", label: "Data Warehouse" },
            { href: `/data-warehouse/${vendor.slug || vendor.id}`, label: vendor.name },
            { href: `/data-warehouse/${vendor.slug || vendor.id}/costings`, label: 'Costings' },
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
                <CardHeader><CardTitle>Vendor not found</CardTitle></CardHeader>
                <CardContent><p>The requested vendor could not be found.</p></CardContent>
            </Card>
        );
    }

    if (vendor.slug !== 'highfield') {
        return (
            <Card>
                <CardHeader><CardTitle>Invalid Page</CardTitle></CardHeader>
                <CardContent><p>This costings page is only available for the Highfield vendor.</p></CardContent>
            </Card>
        )
    }

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-2xl font-semibold">Highfield Costings</h1>
                <BreadcrumbNav parts={breadcrumbParts} />
            </div>
            <HighfieldCostingsTable vendorId={vendor.id} />
        </div>
    )
}

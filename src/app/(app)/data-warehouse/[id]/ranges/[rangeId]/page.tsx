'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { Loader2, LayoutGrid, List, Sailboat, ArrowRight } from 'lucide-react';
import { BreadcrumbNav } from '@/components/breadcrumb-nav';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import AdminGuard from '@/components/admin-guard';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";


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

export default function RangeModelsPage() {
    const params = useParams();
    const vendorSlug = params?.id as string | undefined;
    const rangeSlug = params?.rangeId as string | undefined;
    const firestore = useFirestore();
    const [viewMode, setViewMode] = useState<'card' | 'list'>('card');

    const vendorQuery = useMemo(() => {
        if (!vendorSlug) return null;
        return query(collection(firestore, 'data-warehouse'), where('slug', '==', vendorSlug));
    }, [firestore, vendorSlug]);
    
    const { data: vendorsBySlug, loading: slugLoading } = useCollection<Vendor>(vendorQuery);
    
    const isLikelyAnId = !slugLoading && (!vendorsBySlug || vendorsBySlug.length === 0);
    const docPath = isLikelyAnId && vendorSlug ? `/data-warehouse/${vendorSlug}` : null;
    const { data: vendorById, loading: idLoading } = useDoc<Vendor>(docPath);
    
    const vendor = useMemo(() => vendorsBySlug?.[0] || vendorById, [vendorsBySlug, vendorById]);
    const vendorLoading = slugLoading || idLoading;

    const range = useMemo(() => {
        if (!vendor?.structure || !rangeSlug) return null;
        return vendor.structure.find(r => r.slug === rangeSlug || r.id === rangeSlug);
    }, [vendor, rangeSlug]);

    const models = range?.models || [];

    const breadcrumbParts = useMemo(() => {
        if (!vendor || !range) return [];
        return [
             { label: 'Admin', href: '/admin' },
             { label: 'Data Warehouse', href: '/data-warehouse' },
             { label: vendor.name, href: `/data-warehouse/${vendor.slug || vendor.id}` },
             { label: range.name, href: '#' }
        ];
    }, [vendor, range]);

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

    if (!range) {
        return (
            <Card>
                <CardHeader><CardTitle>Range Not Found</CardTitle></CardHeader>
                <CardContent><p>The requested range could not be found within this vendor's structure.</p></CardContent>
            </Card>
        );
    }

    return (
        <AdminGuard>
            <div className="space-y-4">
                <div>
                    <h1 className="text-2xl font-semibold">{range.name} Models</h1>
                    <BreadcrumbNav parts={breadcrumbParts} />
                </div>
                <div className="flex items-center justify-end gap-2">
                    <Button variant={viewMode === 'card' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('card')}>
                        <LayoutGrid className="h-4 w-4" />
                        <span className="sr-only">Card View</span>
                    </Button>
                    <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('list')}>
                        <List className="h-4 w-4" />
                        <span className="sr-only">List View</span>
                    </Button>
                </div>

                {models.length > 0 ? (
                    <>
                        {viewMode === 'card' ? (
                            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                {models.map((model) => (
                                    <Link href={`/data-warehouse/${vendor.slug || vendor.id}/models/${model.slug || model.id}`} key={model.id} className="group">
                                        <Card className="h-full transition-all duration-300 ease-in-out group-hover:border-primary group-hover:-translate-y-1 group-hover:shadow-xl overflow-hidden">
                                            <div className="h-32 bg-secondary flex items-center justify-center p-4">
                                                <Sailboat className="h-12 w-12 text-muted-foreground" />
                                            </div>
                                            <CardContent className="p-3">
                                                <p className="font-semibold truncate text-center">{model.name}</p>
                                            </CardContent>
                                        </Card>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                             <Card>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Model Name</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {models.map((model) => (
                                            <TableRow key={model.id}>
                                                <TableCell className="font-medium">{model.name}</TableCell>
                                                <TableCell className="text-right">
                                                    <Button asChild variant="ghost" size="sm">
                                                        <Link href={`/data-warehouse/${vendor.slug || vendor.id}/models/${model.slug || model.id}`}>
                                                            View Details
                                                            <ArrowRight className="ml-2 h-4 w-4" />
                                                        </Link>
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </Card>
                        )}
                    </>
                ) : (
                    <Card className="flex flex-col items-center justify-center h-80 border-2 border-dashed">
                        <Sailboat className="h-16 w-16 text-muted-foreground" />
                        <h3 className="mt-4 text-lg font-semibold">No Models in this Range</h3>
                        <p className="mt-2 text-sm text-muted-foreground">Go back to the vendor page to add models to this range.</p>
                        <Button asChild className="mt-6" variant="outline">
                            <Link href={`/data-warehouse/${vendor.slug || vendor.id}`}>Back to Vendor</Link>
                        </Button>
                    </Card>
                )}
            </div>
        </AdminGuard>
    );
}

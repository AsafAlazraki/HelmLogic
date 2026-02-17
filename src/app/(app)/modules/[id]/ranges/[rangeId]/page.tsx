'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { Loader2, LayoutGrid, List, Sailboat } from 'lucide-react';
import { BreadcrumbNav, type BreadcrumbPart } from '@/components/breadcrumb-nav';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import Link from 'next/link';

interface Model {
    id: string;
    name: string;
    slug?: string;
    coverImageUrl?: string;
    order?: number;
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

interface Module {
    id: string;
    name: string;
    slug?: string;
    mainVendorId: string;
}

function ModelCard({ module, range, model }: { module: Module; range: Range; model: Model; }) {
    const moduleSlugOrId = module.slug || module.id;
    const rangeSlugOrId = range.slug || range.id;
    const modelSlugOrId = model.slug || model.id;

    return (
        <Card className="relative group overflow-hidden flex flex-col h-full hover:shadow-xl transition-shadow duration-300">
             <Link href={`/modules/${moduleSlugOrId}/ranges/${rangeSlugOrId}/models/${modelSlugOrId}`} className="block h-full flex flex-col flex-grow">
                <div className="h-52 bg-secondary relative">
                     {model.coverImageUrl ? (
                        <>
                            <Image src={model.coverImageUrl} alt={`${model.name} cover`} fill className="object-cover" />
                        </>
                    ) : (
                        <div className="flex h-full w-full items-center justify-center">
                            <Sailboat className="h-12 w-12 text-muted-foreground" />
                        </div>
                    )}
                </div>
                <CardContent className="p-3 flex-grow flex items-center justify-center">
                    <p className="font-semibold text-center line-clamp-2">{model.name}</p>
                </CardContent>
            </Link>
        </Card>
    );
}

export default function ModuleRangeDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const moduleSlugOrId = params?.id as string | undefined;
    const rangeSlugOrId = params?.rangeId as string | undefined;
    const firestore = useFirestore();
    const [viewMode, setViewMode] = useState<'card' | 'list'>('card');

    // Data fetching logic
    const moduleQueryBySlug = useMemo(() => {
        if (!moduleSlugOrId) return null;
        return query(collection(firestore, 'modules'), where('slug', '==', moduleSlugOrId));
    }, [firestore, moduleSlugOrId]);
    const { data: modulesBySlug, loading: moduleSlugLoading } = useCollection<Module>(moduleQueryBySlug);
    const { data: moduleById, loading: moduleIdLoading } = useDoc<Module>(moduleSlugOrId ? `/modules/${moduleSlugOrId}` : null);
    const moduleData = useMemo(() => modulesBySlug?.[0] || moduleById, [modulesBySlug, moduleById]);
    const moduleLoading = moduleSlugLoading || moduleIdLoading;

    const { data: vendor, loading: vendorLoading } = useDoc<Vendor>(moduleData ? `/data-warehouse/${moduleData.mainVendorId}` : null);
    
    const rangeQueryBySlug = useMemo(() => {
        if (!vendor || !rangeSlugOrId) return null;
        return query(collection(firestore, `data-warehouse/${vendor.id}/ranges`), where('slug', '==', rangeSlugOrId));
    }, [firestore, vendor, rangeSlugOrId]);
    const { data: rangesBySlug, loading: rangeSlugLoading } = useCollection<Range>(rangeQueryBySlug);
    const { data: rangeById, loading: rangeIdLoading } = useDoc<Range>(vendor && rangeSlugOrId ? `/data-warehouse/${vendor.id}/ranges/${rangeSlugOrId}` : null);
    const range = useMemo(() => rangesBySlug?.[0] || rangeById, [rangesBySlug, rangeById]);
    const rangeLoading = rangeSlugLoading || rangeIdLoading;

    const modelsCollectionPath = useMemo(() => {
        if (!vendor || !range) return null;
        return `/data-warehouse/${vendor.id}/ranges/${range.id}/models`;
    }, [vendor, range]);
    const modelsQuery = useMemo(() => {
        if (!modelsCollectionPath) return null;
        return query(collection(firestore, modelsCollectionPath), orderBy('order'));
    }, [firestore, modelsCollectionPath]);
    const { data: sortedModels, loading: modelsLoading } = useCollection<Model>(modelsQuery);
    
    const loading = moduleLoading || vendorLoading || rangeLoading || modelsLoading;

    const breadcrumbParts = useMemo((): BreadcrumbPart[] => {
        if (!moduleData || !range) return [];
        return [
             { label: 'Dashboard', href: '/dashboard' },
             { label: moduleData.name, href: `/modules/${moduleData.slug || moduleData.id}` },
             { label: range.name, href: '#' }
        ];
    }, [moduleData, range]);

    if (loading) return <div className="flex h-[400px] w-full items-center justify-center"><Loader2 className="h-16 w-16 animate-spin text-primary" /></div>;
    if (!moduleData || !vendor || !range) return <Card><CardHeader><CardTitle>Not Found</CardTitle></CardHeader><CardContent><p>The requested module, vendor or range could not be found.</p></CardContent></Card>;

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <div className="flex items-start justify-between">
                        <div>
                            <h1 className="text-2xl font-semibold">Models in {range.name}</h1>
                            <BreadcrumbNav parts={breadcrumbParts} />
                            <CardDescription>Browse the models available in this product range.</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                             <Button variant={viewMode === 'card' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('card')}>
                                <LayoutGrid className="h-4 w-4" />
                                <span className="sr-only">Card View</span>
                            </Button>
                            <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('list')}>
                                <List className="h-4 w-4" />
                                <span className="sr-only">List View</span>
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {sortedModels && sortedModels.length > 0 ? (
                        viewMode === 'card' ? (
                            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                {sortedModels.map((model) => (
                                    <ModelCard key={model.id} module={moduleData} range={range} model={model} />
                                ))}
                            </div>
                        ) : (
                            <Table>
                                <TableHeader><TableRow><TableHead>Model Name</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {sortedModels.map((model) => (
                                        <TableRow key={model.id}>
                                            <TableCell className="font-medium">{model.name}</TableCell>
                                            <TableCell className="text-right">
                                                <Button asChild variant="outline" size="sm">
                                                    <Link href={`/modules/${moduleSlugOrId}/ranges/${rangeSlugOrId}/models/${model.slug || model.id}`}>View Details</Link>
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )
                    ) : (
                        <div className="flex flex-col items-center justify-center h-60 border-2 border-dashed rounded-lg">
                            <Sailboat className="h-16 w-16 text-muted-foreground" />
                            <h3 className="mt-4 text-lg font-semibold">No Models in this Range</h3>
                            <p className="mt-2 text-sm text-muted-foreground">There are no models configured for this product range.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

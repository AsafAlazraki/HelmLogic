'use client';

import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { doc, collection, query, where } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { useMemo } from 'react';
import { HighfieldQuoteFlow } from '@/components/highfield-quote-flow';
import { Button } from '@/components/ui/button';

export default function QuoteFlowPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const firestore = useFirestore();
    const router = useRouter();

    const slugOrId = params.id as string;
    const modelId = params.modelId as string;
    const rangeId = searchParams.get('range');
    const vendorId = searchParams.get('vendor');

    // 1. Fetch Module Context (Handle Slug or ID)
    const moduleQueryBySlug = useMemoFirebase(() => {
        if (!slugOrId) return null;
        return query(collection(firestore, 'modules'), where('slug', '==', slugOrId));
    }, [firestore, slugOrId]);
    const { data: modulesBySlug, loading: slugLoading } = useCollection<any>(moduleQueryBySlug);

    const moduleByIdRef = useMemoFirebase(() => 
        slugOrId ? doc(firestore, 'modules', slugOrId) : null,
    [firestore, slugOrId]);
    const { data: moduleById, loading: idLoading } = useDoc<any>(moduleByIdRef);

    const moduleData = useMemo(() => modulesBySlug?.[0] || moduleById, [modulesBySlug, moduleById]);
    const moduleLoading = slugLoading || idLoading;

    // 2. Fetch Model Details
    const modelRef = useMemoFirebase(() => 
        vendorId && rangeId && modelId ? doc(firestore, `data-warehouse/${vendorId}/ranges/${rangeId}/models`, modelId) : null,
    [firestore, vendorId, rangeId, modelId]);
    const { data: model, loading: modelDetailsLoading } = useDoc<any>(modelRef);

    // 3. Fetch Vendor
    const vendorRef = useMemoFirebase(() => 
        vendorId ? doc(firestore, 'data-warehouse', vendorId) : null,
    [firestore, vendorId]);
    const { data: vendor, loading: vendorLoading } = useDoc<any>(vendorRef);

    // 4. Fetch Range Details
    const rangeRef = useMemoFirebase(() => 
        vendorId && rangeId ? doc(firestore, `data-warehouse/${vendorId}/ranges`, rangeId) : null,
    [firestore, vendorId, rangeId]);
    const { data: range, loading: rangeLoading } = useDoc<any>(rangeRef);

    const loading = moduleLoading || modelDetailsLoading || vendorLoading || rangeLoading;

    if (loading) {
        return (
            <div className="flex h-screen w-full items-center justify-center">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
            </div>
        );
    }

    if (!moduleData || !model || !vendor) {
        return (
            <div className="flex h-screen w-full items-center justify-center flex-col gap-4">
                <p className="text-muted-foreground font-bold">Context Error: Could not locate configuration data.</p>
                <Button variant="outline" onClick={() => router.back()}>Return to Module</Button>
            </div>
        );
    }

    // Highfield Specific Flow
    if (vendor.slug === 'highfield') {
        return (
            <HighfieldQuoteFlow 
                module={moduleData}
                model={model}
                vendor={vendor}
                range={range}
                rangeId={rangeId!}
            />
        );
    }

    // Generic fallback for other brands
    return (
        <div className="p-12 text-center">
            <h2 className="text-2xl font-bold">Quotation Engine</h2>
            <p className="text-muted-foreground mt-2">A specialized quotation flow for {vendor.name} is currently being developed.</p>
            <Button variant="link" onClick={() => router.back()} className="mt-4">Go Back</Button>
        </div>
    );
}

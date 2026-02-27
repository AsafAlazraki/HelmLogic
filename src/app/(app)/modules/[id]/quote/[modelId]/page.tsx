
'use client';

import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { doc, query, collection, where } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { useMemo } from 'react';
import { HighfieldQuoteFlow } from '@/components/highfield-quote-flow';
import { useCollection } from '@/firebase/firestore/use-collection';

export default function QuoteFlowPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const firestore = useFirestore();
    const router = useRouter();

    const moduleId = params.id as string;
    const modelId = params.modelId as string;
    const rangeId = searchParams.get('range');
    const vendorId = searchParams.get('vendor');

    // 1. Fetch Module Context
    const moduleRef = useMemoFirebase(() => doc(firestore, 'modules', moduleId), [firestore, moduleId]);
    const { data: moduleData, loading: moduleLoading } = useDoc<any>(moduleRef);

    // 2. Fetch Model Details
    const modelRef = useMemoFirebase(() => 
        vendorId && rangeId ? doc(firestore, `data-warehouse/${vendorId}/ranges/${rangeId}/models`, modelId) : null,
    [firestore, vendorId, rangeId, modelId]);
    const { data: model, loading: modelLoading } = useDoc<any>(modelRef);

    // 3. Fetch Vendor
    const vendorRef = useMemoFirebase(() => 
        vendorId ? doc(firestore, 'data-warehouse', vendorId) : null,
    [firestore, vendorId]);
    const { data: vendor, loading: vendorLoading } = useDoc<any>(vendorRef);

    const loading = moduleLoading || modelLoading || vendorLoading;

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

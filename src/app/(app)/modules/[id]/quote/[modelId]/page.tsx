'use client';

import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { doc, collection, query, where } from 'firebase/firestore';
import { useMemo } from 'react';
import { HighfieldQuoteFlow } from '@/components/highfield-quote-flow';
import { Button } from '@/components/ui/button';
import { useUser } from '@/firebase/auth/use-user';
import { HelmLogicLoading } from "@/components/helmlogic-loading";

/**
 * Smart merge function for model configuration.
 * Merges the optionalFeatures array by ID to ensure Master additions are visible in Overrides.
 */
function getEffectiveModel(master: any, override: any) {
    if (!master) return null;
    if (!override) return master;

    const merged = { ...master, ...override };
    
    // ID-based merge for optional features to prevent data masking
    if (master.optionalFeatures && Array.isArray(master.optionalFeatures)) {
        const masterFeatures = master.optionalFeatures;
        const overrideFeatures = override.optionalFeatures || [];
        
        const overrideMap = new Map(overrideFeatures.map((f: any) => [f.id, f]));
        
        // Preserve all Master features, applying overrides where they match IDs
        const mergedFeatures = masterFeatures.map((mf: any) => {
            const of = overrideMap.get(mf.id);
            if (of) return { ...mf, ...of };
            return mf;
        });

        // Append features that exist ONLY in the override (custom additions)
        const masterIds = new Set(masterFeatures.map((f: any) => f.id));
        overrideFeatures.forEach((of: any) => {
            if (!masterIds.has(of.id)) {
                mergedFeatures.push(of);
            }
        });

        merged.optionalFeatures = mergedFeatures;
    }

    return merged;
}

export default function QuoteFlowPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const firestore = useFirestore();
    const router = useRouter();
    const { user } = useUser();

    const slugOrId = params.id as string;
    const modelId = params.modelId as string;
    const rangeId = searchParams.get('range');
    const vendorId = searchParams.get('vendor');

    // 1. Resolve User Context for Organisation Overrides
    const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
    const { data: userProfile, loading: profileLoading } = useDoc<any>(userProfileRef);
    const orgId = userProfile?.organisationId;

    // 2. Fetch Module Context
    const moduleQueryBySlug = useMemoFirebase(() => {
        if (!slugOrId) return null;
        return query(collection(firestore, 'modules'), where('slug', '==', slugOrId));
    }, [firestore, slugOrId]);
    const { data: modulesBySlug, isLoading: slugLoading } = useCollection<any>(moduleQueryBySlug);

    const moduleByIdRef = useMemoFirebase(() => 
        slugOrId ? doc(firestore, 'modules', slugOrId) : null,
    [firestore, slugOrId]);

    const { data: moduleById, isLoading: idLoading } = useDoc<any>(moduleByIdRef);

    const moduleData = useMemo(() => modulesBySlug?.[0] || moduleById, [modulesBySlug, moduleById]);
    const moduleLoading = slugLoading || idLoading;

    // 3. Fetch Master Model Details
    const modelRef = useMemoFirebase(() => 
        vendorId && rangeId && modelId ? doc(firestore, `data-warehouse/${vendorId}/ranges/${rangeId}/models`, modelId) : null,
    [firestore, vendorId, rangeId, modelId]);
    const { data: masterModel, isLoading: modelDetailsLoading } = useDoc<any>(modelRef);

    // 4. Fetch Organisation Overrides
    const modelOverrideRef = useMemoFirebase(() => 
        orgId && modelId ? doc(firestore, `organisations/${orgId}/modelOverrides`, modelId) : null,
    [firestore, orgId, modelId]);
    const { data: modelOverride, isLoading: overrideLoading } = useDoc<any>(modelOverrideRef);

    // 5. Merge Data with ID Reconciliation
    const effectiveModel = useMemo(() => {
        return getEffectiveModel(masterModel, modelOverride);
    }, [masterModel, modelOverride]);

    // 6. Fetch Vendor & Range
    const vendorRef = useMemoFirebase(() => 
        vendorId ? doc(firestore, 'data-warehouse', vendorId) : null,
    [firestore, vendorId]);
    const { data: vendor, isLoading: vendorLoading } = useDoc<any>(vendorRef);

    const rangeRef = useMemoFirebase(() => 
        vendorId && rangeId ? doc(firestore, `data-warehouse/${vendorId}/ranges`, rangeId) : null,
    [firestore, vendorId, rangeId]);
    const { data: range, isLoading: rangeLoading } = useDoc<any>(rangeRef);

    const currentMemberOrg = useMemo(() => {
        if (!orgId) return null;
        // In this context, we just need the org basic info for the loader
        return { name: 'Organisation', primaryLogoUrl: userProfile?.organisationLogoUrl || null };
    }, [orgId, userProfile]);

    const loading = moduleLoading || modelDetailsLoading || vendorLoading || rangeLoading || profileLoading || overrideLoading;

    if (loading) {
        return (
            <HelmLogicLoading 
                title={masterModel?.name || 'Loading Precision Build'} 
                organisation={currentMemberOrg as any} 
                label="Initializing Precision Build"
            />
        );
    }

    if (!moduleData || !effectiveModel || !vendor) {
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
                model={effectiveModel}
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

'use client';

import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { doc, collection, collectionGroup, query, where } from 'firebase/firestore';
import { useMemo, Suspense } from 'react';
import { HighfieldQuoteFlow } from '@/components/highfield-quote-flow';
import { Button } from '@/components/ui/button';
import { useUser } from '@/firebase/auth/use-user';
import { HelmLogicLoading } from "@/components/helmlogic-loading";
import { Ship, Zap } from 'lucide-react';

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

function QuoteFlowContent() {
    const params = useParams();
    const searchParams = useSearchParams();
    const firestore = useFirestore();
    const router = useRouter();
    const { user } = useUser();

    const slugOrId = params?.id as string | undefined;
    const modelId = params?.modelId as string | undefined;
    const rangeId = searchParams.get('range');
    const vendorId = searchParams.get('vendor');
    const duplicateQuoteId = searchParams.get('duplicate');

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

    // 6b. Variant probe — MPF gate for non-Highfield boat brands. Any
    // 'Boat Brand' vendor whose model carries at least one variant with a
    // resolvable sell price mounts the same quote flow; brands without
    // priced data keep the "being developed" placeholder.
    const variantProbeQuery = useMemoFirebase(() =>
        vendorId && rangeId && modelId
            ? collection(firestore, `data-warehouse/${vendorId}/ranges/${rangeId}/models/${modelId}/variants`)
            : null,
    [firestore, vendorId, rangeId, modelId]);
    const { data: variantProbe, isLoading: variantProbeLoading } = useCollection<any>(variantProbeQuery);

    const currentMemberOrg = useMemo(() => {
        if (!orgId) return null;
        return { name: 'Organisation', primaryLogoUrl: userProfile?.organisationLogoUrl || null };
    }, [orgId, userProfile]);

    // 7. Duplicate-quote fetch (optional — only when ?duplicate param present)
    // Try own quotes first, then fall back to org-wide collection group lookup
    const duplicateRef = useMemoFirebase(() =>
        (duplicateQuoteId && user) ? doc(firestore, `users/${user.uid}/quotes`, duplicateQuoteId) : null,
    [firestore, duplicateQuoteId, user?.uid]);
    const { data: ownOldQuote, loading: ownDuplicateLoading } = useDoc<any>(duplicateRef);

    const orgDuplicateQuery = useMemoFirebase(() => {
        if (ownOldQuote || ownDuplicateLoading || !duplicateQuoteId || !user) return null;
        const userOrgId = userProfile?.organisationId;
        if (!userOrgId) return null;
        return query(
            collectionGroup(firestore, 'quotes'),
            where('organisationId', '==', userOrgId),
            where('id', '==', duplicateQuoteId)
        );
    }, [firestore, duplicateQuoteId, user, ownOldQuote, ownDuplicateLoading, userProfile?.organisationId]);
    const { data: orgDuplicateList, loading: orgDuplicateLoading } = useCollection<any>(orgDuplicateQuery, { silent: true });

    const oldQuote = ownOldQuote || orgDuplicateList?.[0] || null;
    const duplicateLoading = ownDuplicateLoading || orgDuplicateLoading;

    const initialState = useMemo(() => {
        if (!duplicateQuoteId || !oldQuote) return undefined;
        return {
            material: (oldQuote.variant?.material ?? null) as 'PVC' | 'HYP' | null,
            colorVariantId: oldQuote.variant?.id ?? null,
            selectedOptionIds: (oldQuote.selectedOptions ?? []).map((o: any) => o.id),
            customOptions: oldQuote.customOptions ?? [],
            motorId: oldQuote.motor?.id ?? null,
            selectedMotorObj: oldQuote.motor ?? null,
            selectedMotorAccessoryIds: (oldQuote.motor?.accessories ?? []).map((a: any) => a.id),
            selectedTrailerId: oldQuote.trailer?.id ?? null,
            selectedTrailerOptionIds: (oldQuote.trailer?.options ?? []).map((o: any) => o.id),
            selectedDealerFitIds: (oldQuote.dealerFit ?? []).map((df: any) => df.id).filter(Boolean),
            isRegoSelected: oldQuote.registration?.boatRego ?? false,
            isStickerSelected: oldQuote.registration?.sticker ?? false,
            isTenderToSelected: oldQuote.registration?.tenderTo ?? false,
            isTrailerRegoSelected: oldQuote.registration?.trailerRego ?? false,
        };
    }, [duplicateQuoteId, oldQuote]);

    const loading = moduleLoading || modelDetailsLoading || vendorLoading || rangeLoading || profileLoading || overrideLoading || variantProbeLoading || (!!duplicateQuoteId && duplicateLoading);

    if (loading) {
        return (
            <HelmLogicLoading 
                title={masterModel?.name || 'Loading Precision Build'} 
                organisation={currentMemberOrg as any} 
                label="Initializing Precision Build"
            />
        );
    }

    if (!moduleData || !effectiveModel || !vendor || !modelId) {
        return (
            <div className="flex h-screen w-full items-center justify-center flex-col gap-4 bg-background p-12 text-center">
                <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                    <Ship className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-xl font-black uppercase tracking-tight">Context Error</h2>
                <p className="text-muted-foreground font-bold text-sm max-w-sm">We could not locate the required configuration data for this build. Please return to the module and try again.</p>
                <Button variant="outline" className="mt-4 border-2 font-black uppercase tracking-widest text-[10px] rounded-xl" onClick={() => router.back()}>Return to Module</Button>
            </div>
        );
    }

    // Quote flow — Highfield-native, extended to every MPF-imported boat
    // brand: any vendorType 'Boat Brand' model with ≥1 priced variant
    // (sellPriceExclGst) mounts the same flow. Defensive predicate: models
    // without priced MPF data fall through to the placeholder below.
    const hasPricedVariant = (variantProbe ?? []).some(
        (v: any) => typeof v?.sellPriceExclGst === 'number' && Number.isFinite(v.sellPriceExclGst)
    );
    if (vendor.slug === 'highfield' || (vendor.vendorType === 'Boat Brand' && hasPricedVariant)) {
        return (
            <HighfieldQuoteFlow
                module={moduleData}
                model={effectiveModel}
                vendor={vendor}
                range={range}
                rangeId={rangeId!}
                initialState={initialState}
                /* v1.33 (Bill: Build-A-Boat on the NSM website) — append
                   ?priceMode=public to the URL when embedding: locks
                   pricing to Cash and hides the price-level picker so
                   trade/sub-dealer levels never show to the public. */
                publicPricing={searchParams.get('priceMode') === 'public'}
            />
        );
    }

    // Generic fallback for other brands
    return (
        <div className="flex h-screen w-full items-center justify-center flex-col gap-4 bg-background p-12 text-center">
            <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                <Zap className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-black uppercase tracking-tight italic">Quotation Engine</h2>
            <p className="text-muted-foreground font-bold text-sm max-w-sm mt-2">A specialized quotation flow for {vendor.name} is currently being developed for deployment.</p>
            <Button variant="outline" className="mt-6 border-2 font-black uppercase tracking-widest text-[10px] rounded-xl" onClick={() => router.back()}>Return to Module</Button>
        </div>
    );
}

export default function QuoteFlowPage() {
    return (
        <Suspense fallback={<HelmLogicLoading label="Synchronizing Workspace" />}>
            <QuoteFlowContent />
        </Suspense>
    );
}

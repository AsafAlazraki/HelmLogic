'use client';

/**
 * Real catalog context fetcher (v1.7 — story 1.8.10).
 *
 * Walks the org → modules → vendor → ranges → models → variants
 * chain to find a representative real boat model that the live PDF
 * preview can use as its hero. Returns a RealCatalogContext that
 * buildSampleQuoteFixture merges into its defaults — anything we
 * couldn't resolve falls back to the hardcoded Highfield CL340
 * fixture so the preview always renders something.
 *
 * Strategy:
 *   1. Org's first enabledModuleSubscription
 *   2. modules/{moduleId}.mainVendorId
 *   3. First range under data-warehouse/{vendorId}/ranges
 *   4. First model under that range with a coverImageUrl set
 *      (skip empty models so the preview never lands on a blank
 *      boat). If no model has a cover image, take the first model
 *      regardless.
 *   5. First variant of that model
 *
 * 4 sequential Firestore reads. ~200-500ms typical. Cached per
 * (orgId, moduleSubs) by useMemo so block-list re-renders don't
 * re-fetch.
 */

import { useEffect, useState } from 'react';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    query,
    type Firestore,
} from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import type { RealCatalogContext } from '@/lib/sample-quote-fixture';

interface UseRealCatalogResult {
    catalog: RealCatalogContext | null;
    loading: boolean;
    error: string | null;
}

export function useRealCatalogContext(
    enabledModuleSubscriptions: string[] | null | undefined,
): UseRealCatalogResult {
    const firestore = useFirestore();
    const [state, setState] = useState<UseRealCatalogResult>({
        catalog: null,
        loading: true,
        error: null,
    });

    /** Cache key — when modules change, refetch. */
    const subsKey = (enabledModuleSubscriptions ?? []).join('|');

    useEffect(() => {
        let cancelled = false;
        async function run() {
            setState({ catalog: null, loading: true, error: null });
            try {
                const subs = (enabledModuleSubscriptions ?? []).slice(0, 30);
                if (subs.length === 0) {
                    if (!cancelled) setState({ catalog: null, loading: false, error: 'no-modules' });
                    return;
                }

                const ctx = await fetchCatalogContext(firestore, subs);
                if (!cancelled) setState({ catalog: ctx, loading: false, error: null });
            } catch (e: any) {
                if (!cancelled) setState({ catalog: null, loading: false, error: e?.message ?? 'fetch failed' });
                console.warn('[real-catalog] fetch failed:', e);
            }
        }
        run();
        return () => { cancelled = true; };
    }, [firestore, subsKey]);

    return state;
}

async function fetchCatalogContext(firestore: Firestore, moduleIds: string[]): Promise<RealCatalogContext | null> {
    // Step 1 — find a module with a mainVendorId. Skip non-catalog modules
    //          (per the v1.4 lesson: some modules have mainVendorId: null).
    let pickedModule: { id: string; data: any } | null = null;
    for (const mid of moduleIds) {
        const snap = await getDoc(doc(firestore, 'modules', mid));
        if (!snap.exists()) continue;
        const data = snap.data();
        if (data.mainVendorId) {
            pickedModule = { id: mid, data };
            break;
        }
    }
    if (!pickedModule) return null;

    const vendorId = pickedModule.data.mainVendorId as string;

    // Step 2 — first range under that vendor's data-warehouse.
    const rangesSnap = await getDocs(query(
        collection(firestore, `data-warehouse/${vendorId}/ranges`),
        limit(1),
    ));
    if (rangesSnap.empty) {
        return {
            moduleName: pickedModule.data.name ?? null,
            moduleSlug: pickedModule.data.slug ?? null,
            vendorId,
            vendorName: pickedModule.data.mainVendorName ?? null,
            vendorLogoUrl: pickedModule.data.mainVendorLogoUrl ?? null,
        };
    }
    const rangeDoc = rangesSnap.docs[0];
    const range = rangeDoc.data();

    // Step 3 — find first model with a coverImageUrl. Fetch up to 10
    //          to pick the first non-blank one; fall back to the first
    //          model if none have a cover image.
    const modelsSnap = await getDocs(query(
        collection(firestore, `data-warehouse/${vendorId}/ranges/${rangeDoc.id}/models`),
        limit(10),
    ));
    if (modelsSnap.empty) {
        return {
            moduleName: pickedModule.data.name ?? null,
            moduleSlug: pickedModule.data.slug ?? null,
            vendorId,
            vendorName: pickedModule.data.mainVendorName ?? null,
            vendorLogoUrl: pickedModule.data.mainVendorLogoUrl ?? null,
            rangeId: rangeDoc.id,
            rangeName: range.name ?? null,
            rangeImageUrl: range.imageUrl ?? null,
        };
    }
    const withCover = modelsSnap.docs.find(d => !!d.data().coverImageUrl);
    const modelDoc = withCover ?? modelsSnap.docs[0];
    const model = modelDoc.data();

    // Step 4 — first variant.
    const variantsSnap = await getDocs(query(
        collection(firestore, `data-warehouse/${vendorId}/ranges/${rangeDoc.id}/models/${modelDoc.id}/variants`),
        limit(1),
    ));
    const variantDoc = variantsSnap.empty ? null : variantsSnap.docs[0];
    const variant = variantDoc?.data() ?? null;

    return {
        moduleName: pickedModule.data.name ?? null,
        moduleSlug: pickedModule.data.slug ?? null,
        vendorId,
        vendorName: pickedModule.data.mainVendorName ?? null,
        vendorLogoUrl: pickedModule.data.mainVendorLogoUrl ?? null,
        rangeId: rangeDoc.id,
        rangeName: range.name ?? null,
        rangeImageUrl: range.imageUrl ?? null,
        model: {
            id: modelDoc.id,
            name: model.name ?? model.modelCode ?? 'Sample',
            modelCode: model.modelCode ?? model.name ?? 'Sample',
            coverImageUrl: model.coverImageUrl ?? null,
            specifications: model.specifications ?? null,
            standardFeatures: model.standardFeatures ?? null,
        },
        variant: variantDoc ? {
            id: variantDoc.id,
            name: variant!.name ?? 'Standard',
            sku: variant!.sku ?? null,
            colorName: variant!.colorName ?? null,
            colorCode: variant!.colorCode ?? null,
            material: variant!.material ?? null,
            cost: typeof variant!.cost === 'number' ? variant!.cost : undefined,
            sellPriceExclGst: typeof variant!.sellPriceExclGst === 'number' ? variant!.sellPriceExclGst : undefined,
            imageUrl: variant!.imageUrl ?? null,
        } : null,
    };
}

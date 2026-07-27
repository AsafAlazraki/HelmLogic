'use client';

/**
 * v1.34 — Motor-only FULL quote flow (Asaf: "same quote style as boats,
 * same damn one — skips straight to the motor section").
 *
 * Mounts the SAME HighfieldQuoteFlow the boat brands use, in motorOnly
 * mode: steps Motor → Dealer Fit → Administration → Summary, finalize
 * into the same proposal page + proposal-style PDF (Yamaha-branded
 * motor hero on the cover). Every price is the MPF Motor Module row's
 * own columns — motor price levels, its assigned rigging/prop, its
 * Install - Sell line, its named engine-removal operation.
 *
 * Mounted under the MOTOR module (e.g. Yamaha Outboards): the flow's
 * existing motor-vendor discovery reads module.mainVendorId.
 */

import { useParams, useSearchParams } from 'next/navigation';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { doc, collection, query, where } from 'firebase/firestore';
import { useMemo, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { HighfieldQuoteFlow } from '@/components/highfield-quote-flow';
import { Button } from '@/components/ui/button';
import { useUser } from '@/firebase/auth/use-user';
import { HelmLogicLoading } from '@/components/helmlogic-loading';
import { Ship } from 'lucide-react';

/** The flow expects a boat model; a motor-only quote has none. This
 *  minimal synthetic model satisfies every read the visited steps make
 *  (specs/registration/features guards are all optional-chained). */
const MOTOR_ONLY_MODEL = {
    id: 'motor-only',
    name: 'Motor Quote',
    specifications: {},
    optionalFeatures: [],
    standardFeatures: [],
};

function MotorQuoteContent() {
    const params = useParams();
    const searchParams = useSearchParams();
    const firestore = useFirestore();
    const router = useRouter();
    const { user } = useUser();

    const slugOrId = params?.id as string | undefined;

    // Resolve the module by slug OR id (same pattern as the boat quote page).
    const moduleQueryBySlug = useMemoFirebase(() => {
        if (!slugOrId) return null;
        return query(collection(firestore, 'modules'), where('slug', '==', slugOrId));
    }, [firestore, slugOrId]);
    const { data: modulesBySlug, isLoading: slugLoading } = useCollection<any>(moduleQueryBySlug);

    const moduleByIdRef = useMemoFirebase(
        () => (slugOrId ? doc(firestore, 'modules', slugOrId) : null),
        [firestore, slugOrId],
    );
    const { data: moduleById, isLoading: idLoading } = useDoc<any>(moduleByIdRef);

    const moduleData = useMemo(() => modulesBySlug?.[0] || moduleById, [modulesBySlug, moduleById]);
    const moduleLoading = slugLoading || idLoading;

    // The motor vendor (Yamaha) — branding for the flow + PDF.
    const vendorRef = useMemoFirebase(
        () => (moduleData?.mainVendorId ? doc(firestore, 'data-warehouse', moduleData.mainVendorId) : null),
        [firestore, moduleData?.mainVendorId],
    );
    const { data: vendor, isLoading: vendorLoading } = useDoc<any>(vendorRef);

    // Sub-dealer default price level (mirrors the boat page behaviour of
    // letting the workspace pass one through the URL).
    const defaultPriceLevel = searchParams.get('priceLevel') ?? undefined;

    const loading = moduleLoading || (!!moduleData?.mainVendorId && vendorLoading) || !user;

    if (loading) {
        return <HelmLogicLoading label="Preparing Motor Quote" />;
    }

    if (!moduleData || !vendor || vendor.vendorType !== 'Motor Brand') {
        return (
            <div className="flex h-screen w-full items-center justify-center flex-col gap-4 bg-background p-12 text-center">
                <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                    <Ship className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-xl font-black uppercase tracking-tight">Context Error</h2>
                <p className="text-muted-foreground font-bold text-sm max-w-sm">
                    Motor quotes start from a motor brand module. Please return to the module and try again.
                </p>
                <Button variant="outline" className="mt-4 border-2 font-black uppercase tracking-widest text-[10px] rounded-xl" onClick={() => router.back()}>
                    Return to Module
                </Button>
            </div>
        );
    }

    return (
        <HighfieldQuoteFlow
            module={moduleData}
            model={MOTOR_ONLY_MODEL}
            vendor={vendor}
            rangeId=""
            motorOnly
            defaultPriceLevel={defaultPriceLevel}
        />
    );
}

export default function MotorQuotePage() {
    return (
        <Suspense fallback={<HelmLogicLoading label="Synchronizing Workspace" />}>
            <MotorQuoteContent />
        </Suspense>
    );
}

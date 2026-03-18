'use client';

import { useParams, useRouter } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { useUser } from '@/firebase/auth/use-user';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where } from 'firebase/firestore';
import { HelmLogicLoading } from '@/components/helmlogic-loading';
import { Ship } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProposalView } from '@/components/proposal-view';

// This is a wrapper to lookup a quote by its professional quote number
// and then render the existing proposal view (or a new improved one)

export default function ProfessionalProposalPage() {
    const params = useParams();
    const router = useRouter();
    const firestore = useFirestore();
    const { user, loading: userLoading } = useUser();
    
    const quoteNumber = params?.quoteNumber as string;

    // Use a collection group query or a simple query if we know the parent structure
    // Since quotes are under users/[uid]/quotes, we can query by quoteNumber across all (if we have permissions)
    // or specifically for this user.
    
    const quotesQuery = useMemoFirebase(() => {
        if (!user || !quoteNumber) return null;
        return query(
            collection(firestore, `users/${user.uid}/quotes`),
            where('quoteNumber', '==', quoteNumber)
        );
    }, [firestore, user, quoteNumber]);

    const { data: quotes, loading: quotesLoading } = useCollection<any>(quotesQuery);

    const isLoading = userLoading || quotesLoading;

    if (isLoading) return <HelmLogicLoading label="Retrieving Proposal..." />;

    if (!quotes || quotes.length === 0) {
        return (
            <div className="flex h-screen w-full items-center justify-center flex-col gap-4 bg-background">
                <Ship className="h-12 w-12 text-muted-foreground/20" />
                <p className="font-black uppercase tracking-widest text-muted-foreground">Proposal {quoteNumber} not found</p>
                <Button variant="outline" onClick={() => router.back()} className="border-2 font-black uppercase text-[10px] rounded-xl">Go Back</Button>
            </div>
        );
    }

    const quote = quotes[0];
    const quoteId = quote.id;
    const vendorId = quote.vendorId; // Assuming this is stored or can be derived

    // We can either:
    // 1. Redirect to the old URL (not what user wants)
    // 2. Client-side fetch the same data and render.
    
    // For now, let's redirect to ensure it works, but later we will move the entire content here.
    // Actually, to fix the URL "not showing an appropriate URL", we should stay on this page.
    
    // I will copy the logic from the old page but optimize it.
    return (
        <Suspense fallback={<HelmLogicLoading label="Loading Proposal..." />}>
             <ProposalView quoteNumber={quoteNumber} />
        </Suspense>
    );
}

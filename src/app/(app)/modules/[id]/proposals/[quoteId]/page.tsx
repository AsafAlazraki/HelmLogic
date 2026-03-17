'use client';

import { useParams } from 'next/navigation';
import { Suspense } from 'react';
import { ProposalView } from '@/components/proposal-view';
import { HelmLogicLoading } from '@/components/helmlogic-loading';

export default function LegacyProposalPage() {
    const params = useParams();
    const quoteId = params?.quoteId as string;

    return (
        <Suspense fallback={<HelmLogicLoading label="Loading Proposal..." />}>
            <ProposalView quoteId={quoteId} />
        </Suspense>
    );
}

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase/auth/use-user';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { doc } from 'firebase/firestore';
import { HelmLogicLoading } from '@/components/helmlogic-loading';

export default function DashboardRedirect() {
    const router = useRouter();
    const firestore = useFirestore();
    const { user, loading: userLoading } = useUser();

    const userProfileRef = useMemoFirebase(
        () => user ? doc(firestore, 'users', user.uid) : null,
        [firestore, user]
    );
    const { data: userProfile, loading: profileLoading } = useDoc<any>(userProfileRef);

    const orgRef = useMemoFirebase(
        () => userProfile?.organisationId ? doc(firestore, 'organisations', userProfile.organisationId) : null,
        [firestore, userProfile?.organisationId]
    );
    const { data: org, loading: orgLoading } = useDoc<any>(orgRef);

    const isLoading = userLoading || profileLoading || orgLoading;
    const isAdmin = userProfile?.appRole === 'HelmLogic Admin';

    useEffect(() => {
        if (isLoading) return;
        if (isAdmin) {
            router.replace('/admin');
            return;
        }
        const slug = org?.slug || userProfile?.organisationId;
        if (slug) {
            router.replace(`/${slug}/dashboard`);
        }
    }, [isLoading, isAdmin, org, userProfile, router]);

    return <HelmLogicLoading label="Redirecting..." />;
}

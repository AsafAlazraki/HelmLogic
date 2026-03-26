'use client';

import { useEffect } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useUser } from '@/firebase/auth/use-user';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { doc } from 'firebase/firestore';
import { HelmLogicLoading } from '@/components/helmlogic-loading';

export default function OrgSlugLayout({ children }: { children: React.ReactNode }) {
    const { orgSlug } = useParams<{ orgSlug: string }>();
    const router = useRouter();
    const pathname = usePathname();
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

    useEffect(() => {
        if (isLoading) return;

        const correctSlug = org?.slug || userProfile?.organisationId;
        if (!correctSlug) return;

        // Redirect to correct org slug if URL has the wrong one
        if (orgSlug !== correctSlug) {
            const corrected = pathname.replace(`/${orgSlug}/`, `/${correctSlug}/`);
            router.replace(corrected);
        }
    }, [isLoading, org, userProfile, orgSlug, pathname, router]);

    if (isLoading) return <HelmLogicLoading />;

    return <>{children}</>;
}

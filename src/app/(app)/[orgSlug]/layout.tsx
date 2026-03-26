'use client';

import { useEffect } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useUser } from '@/firebase/auth/use-user';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { doc } from 'firebase/firestore';

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
    const { data: org } = useDoc<any>(orgRef);

    const isLoading = userLoading || profileLoading;

    useEffect(() => {
        if (isLoading || !org) return;
        const correctSlug = org.slug || userProfile?.organisationId;
        if (!correctSlug || orgSlug === correctSlug) return;
        // Silently correct the slug in the URL if it's wrong
        router.replace(pathname.replace(`/${orgSlug}/`, `/${correctSlug}/`));
    }, [isLoading, org, userProfile?.organisationId, orgSlug, pathname, router]);

    // Never block render — children show immediately, slug validation is a background correction
    return <>{children}</>;
}

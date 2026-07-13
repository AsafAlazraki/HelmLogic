'use client';

/**
 * v1.33 (Epic 14 — Usage Reporting) — mounts the telemetry engine once the
 * signed-in user's org resolves, and logs a 'nav' event on every pathname
 * change. Renders nothing; must never block or break the app shell.
 */
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { doc } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { useDoc } from '@/firebase/firestore/use-doc';
import { startTelemetry, stopTelemetry, logNav } from '@/lib/telemetry';

export function TelemetryProvider() {
    const firestore = useFirestore();
    const { user } = useUser();
    const pathname = usePathname();

    const profileRef = useMemoFirebase(
        () => (user ? doc(firestore, 'users', user.uid) : null),
        [firestore, user?.uid],
    );
    const { data: profile } = useDoc<any>(profileRef);
    const orgId = profile?.organisationId;

    useEffect(() => {
        if (!user?.uid || !orgId) return;
        const stop = startTelemetry({
            firestore,
            orgId,
            uid: user.uid,
            name: profile?.displayName || user.displayName || user.email || 'Unknown',
            email: (user.email || '').toLowerCase(),
        });
        return () => { stop(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.uid, orgId]);

    useEffect(() => {
        if (pathname) logNav(pathname);
    }, [pathname]);

    useEffect(() => () => stopTelemetry(), []);

    return null;
}

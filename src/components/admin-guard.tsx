'use client';

import { useUser } from "@/firebase/auth/use-user";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useFirestore, useMemoFirebase } from "@/firebase/provider";
import { doc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { User } from "firebase/auth";

export default function AdminGuard({ children }: { children: React.ReactNode }) {
    const { user, loading: userLoading } = useUser();
    const router = useRouter();

    useEffect(() => {
        if (!userLoading && !user) {
            router.replace('/login');
        }
    }, [user, userLoading, router]);

    if (userLoading) {
        return (
            <div className="flex h-screen w-screen items-center justify-center bg-background">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
            </div>
        );
    }

    if (!user) {
        return null; // Redirecting...
    }

    return <AdminRoleChecker user={user}>{children}</AdminRoleChecker>;
}

function AdminRoleChecker({ user, children }: { user: User, children: React.ReactNode }) {
    const firestore = useFirestore();
    const userProfileRef = useMemoFirebase(() => doc(firestore, 'users', user.uid), [firestore, user.uid]);
    const { data: userProfile, loading: profileLoading } = useDoc<{ appRole: string }>(userProfileRef);
    const router = useRouter();

    useEffect(() => {
        // Only redirect if we HAVE a profile and it's explicitly NOT an admin
        if (!profileLoading && userProfile) {
            if (userProfile.appRole !== 'HelmLogic Admin') {
                router.replace('/dashboard');
            }
        }
        // NOTE: We don't redirect if userProfile is missing yet, to avoid loops 
        // while Firestore document creation/syncing is in progress.
    }, [userProfile, profileLoading, router]);

    // Show loader while we're confirming the role
    if (profileLoading || userProfile?.appRole !== 'HelmLogic Admin') {
        return (
            <div className="flex h-full w-full items-center justify-center min-h-[400px]">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
            </div>
        );
    }

    return <>{children}</>;
}

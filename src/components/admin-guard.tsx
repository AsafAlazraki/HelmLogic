'use client';

import { useUser } from "@/firebase/auth/use-user";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";

export default function AdminGuard({ children }: { children: React.ReactNode }) {
    const { user, loading: userLoading } = useUser();
    const { data: userProfile, loading: profileLoading } = useDoc<{ appRole: string }>(
        user ? `/users/${user.uid}` : null
    );
    const router = useRouter();

    useEffect(() => {
        // Wait until all loading is fully complete before making a decision.
        if (userLoading || profileLoading) {
            return;
        }

        if (!user) {
            router.replace('/login');
            return;
        }

        if (userProfile?.appRole !== 'admin') {
            router.replace('/dashboard');
        }

    }, [user, userProfile, userLoading, profileLoading, router]);

    // While loading user or profile, or if user is not yet an admin, show a spinner.
    if (userLoading || profileLoading || userProfile?.appRole !== 'admin') {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
            </div>
        );
    }
    
    // If all checks pass, render the children.
    return <>{children}</>;
}

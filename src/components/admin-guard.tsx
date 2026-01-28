'use client';

import { useEffect } from 'react';
import { useUser } from "@/firebase/auth/use-user";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function AdminGuard({ children }: { children: React.ReactNode }) {
    const { user, loading: userLoading } = useUser();
    const { data: userProfile, loading: profileLoading } = useDoc<{ appRole: string }>(user ? `/users/${user.uid}` : null);
    const router = useRouter();

    // We are loading if the user is loading, or if we have a user but their profile is still loading.
    const loading = userLoading || (!!user && profileLoading);

    useEffect(() => {
      // Wait until all loading is complete before checking roles and redirecting.
      if (loading) {
        return;
      }

      // If loading is done and the user is not an admin, redirect them.
      if (!user) {
        router.replace('/login');
      } else if (userProfile?.appRole !== 'admin') {
        router.replace('/dashboard');
      }
    }, [user, userProfile, loading, router]);

    // While loading, or if the final user profile is not an admin, show a loading spinner.
    // The useEffect above will handle the actual redirection.
    if (loading || userProfile?.appRole !== 'admin') {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
            </div>
        );
    }

    // If all checks pass, render the protected admin content.
    return <>{children}</>;
}

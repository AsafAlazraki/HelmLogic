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

    const isLoading = userLoading || (user && profileLoading);

    useEffect(() => {
        // Wait until loading is complete before making any decisions.
        if (isLoading) {
            return;
        }

        // If loading is done and there is no user, redirect to login.
        if (!user) {
            router.replace('/login');
            return;
        }

        // If the user exists but is not an admin, redirect to the dashboard.
        if (userProfile?.appRole !== 'admin') {
            router.replace('/dashboard');
        }

    }, [isLoading, user, userProfile, router]);


    // If we are still loading user data, show a spinner.
    if (isLoading) {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
            </div>
        );
    }
    
    // If loading is complete AND the user is an admin, render the content.
    if (user && userProfile?.appRole === 'admin') {
        return <>{children}</>;
    }

    // In all other cases (e.g., about to redirect), show a loading spinner
    // to prevent content from flashing briefly.
    return (
        <div className="flex h-full w-full items-center justify-center">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
        </div>
    );
}

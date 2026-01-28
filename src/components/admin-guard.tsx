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
        // Only perform checks once all data is loaded.
        if (!userLoading && !profileLoading) {
            if (!user) {
                // If there's no user, redirect to login.
                router.replace('/login');
            } else if (userProfile?.appRole !== 'admin') {
                // If the user is not an admin, redirect to the dashboard.
                router.replace('/dashboard');
            }
        }
    }, [user, userProfile, userLoading, profileLoading, router]);

    // While data is loading, show a spinner.
    if (userLoading || profileLoading) {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
            </div>
        );
    }
    
    // If data is loaded and the user is an admin, render the page.
    if (user && userProfile?.appRole === 'admin') {
        return <>{children}</>;
    }

    // In all other cases (e.g., redirection is about to happen), show a spinner
    // to prevent any content from flashing.
    return (
        <div className="flex h-full w-full items-center justify-center">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
        </div>
    );
}

'use client';

import { useUser } from "@/firebase/auth/use-user";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";

export default function AdminGuard({ children }: { children: React.ReactNode }) {
    const { user, loading: userLoading } = useUser();
    const { data: userProfile, loading: profileLoading } = useDoc<{ appRole: string }>(
        user && !userLoading ? `/users/${user.uid}` : null
    );
    const router = useRouter();

    const loading = userLoading || (!!user && profileLoading);

    useEffect(() => {
        if (loading) {
            return; // Don't do anything while loading
        }
        if (!user) {
            router.replace('/login');
        } else if (userProfile?.appRole !== 'admin') {
            router.replace('/dashboard');
        }
    }, [user, userProfile, loading, router]);


    if (loading) {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
            </div>
        );
    }
    
    // If we are not loading and the user is an admin, show the content.
    if (user && userProfile?.appRole === 'admin') {
        return <>{children}</>;
    }

    // Otherwise, show a loading spinner while the redirect is happening.
    // This covers cases where user is null or not an admin after loading is complete.
    return (
        <div className="flex h-full w-full items-center justify-center">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
        </div>
    );
}

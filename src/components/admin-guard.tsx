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

    const isDataSettled = !userLoading && !profileLoading;

    useEffect(() => {
        if (!isDataSettled) {
            return; // Don't do anything until all data is loaded
        }

        // Once loading is complete, check for authorization
        if (!user) {
            router.replace('/login');
        } else if (userProfile?.appRole !== 'HelmLogic Admin') {
            router.replace('/dashboard');
        }
    }, [isDataSettled, user, userProfile, router]);


    // If data is fully loaded and user is authorized, show the content
    if (isDataSettled && user && userProfile?.appRole === 'HelmLogic Admin') {
        return <>{children}</>;
    }

    // Otherwise, show a loading spinner while the useEffect handles the redirect.
    // This prevents any flash of content.
    return (
        <div className="flex h-full w-full items-center justify-center">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
        </div>
    );
}

'use client';

import { useUser } from "@/firebase/auth/use-user";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

export default function AdminGuard({ children }: { children: React.ReactNode }) {
    const { user, loading: userLoading } = useUser();
    const { data: userProfile, loading: profileLoading } = useDoc<{ appRole: string }>(
        user ? `/users/${user.uid}` : null
    );
    const router = useRouter();
    const [isAllowed, setIsAllowed] = useState(false);

    const isLoading = userLoading || (user && profileLoading);

    useEffect(() => {
        // Wait until all loading is fully complete before making a decision.
        if (isLoading) {
            return;
        }

        if (!user) {
            router.replace('/login');
            return;
        }

        if (userProfile?.appRole === 'admin') {
            // Explicitly grant access and trigger a re-render
            setIsAllowed(true);
        } else {
            router.replace('/dashboard');
        }

    }, [user, userProfile, isLoading, router]);

    // If access has been granted, render the content.
    if (isAllowed) {
        return <>{children}</>;
    }

    // Otherwise, show a spinner. This will display during initial load,
    // profile fetching, and during the moments a redirect is happening.
    return (
        <div className="flex h-full w-full items-center justify-center">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
        </div>
    );
}

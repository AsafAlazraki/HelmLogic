'use client';

import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { useUser } from "@/firebase/auth/use-user";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

interface UserProfile {
    appRole?: string;
}

export default function Dashboard() {
    const { user, loading: userLoading } = useUser();
    const { data: userProfile, loading: profileLoading } = useDoc<UserProfile>(user ? `/users/${user.uid}` : null);
    const router = useRouter();

    const isAdmin = userProfile?.appRole === 'HelmLogic Admin';
    const isLoading = userLoading || profileLoading;

    useEffect(() => {
        if (!isLoading && isAdmin) {
            router.replace('/admin');
        }
    }, [isLoading, isAdmin, router]);

    // Show a loader while checking the role or if the user is an admin (and is being redirected).
    if (isLoading || isAdmin) {
        return (
            <div className="flex h-[400px] w-full items-center justify-center">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
            </div>
        );
    }
    
    // For non-admin users, show the dashboard content.
    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-2xl font-semibold">Dashboard</h1>
                <BreadcrumbNav />
            </div>
            <p>Welcome to your dashboard.</p>
        </div>
    );
}

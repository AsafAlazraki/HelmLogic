'use client';

import { useUser } from "@/firebase/auth/use-user";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export default function OrganisationsPage() {
    const { user, loading: userLoading } = useUser();
    const { data: userProfile, loading: profileLoading } = useDoc<{ appRole: string }>(user ? `/users/${user.uid}` : null);
    const router = useRouter();

    const loading = userLoading || profileLoading;

    useEffect(() => {
        if (!loading) {
        if (!user) {
            router.replace('/login');
        } else if (userProfile?.appRole !== 'admin') {
            router.replace('/dashboard');
        }
        }
    }, [user, userProfile, loading, router]);

    if (loading || !user || userProfile?.appRole !== 'admin') {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
            </div>
        );
    }

    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Organisations</h1>
        <p>This is the organisations page.</p>
      </div>
    );
  }

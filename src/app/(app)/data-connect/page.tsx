'use client';

import { useUser } from "@/firebase/auth/use-user";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function DataConnectPage() {
    const { user, loading: userLoading } = useUser();
    const { data: userProfile, loading: profileLoading } = useDoc<{ appRole: string }>(user ? `/users/${user.uid}` : null);
    const router = useRouter();

    const loading = userLoading || profileLoading;

    if (loading) {
      return (
          <div className="flex h-full w-full items-center justify-center">
              <Loader2 className="h-16 w-16 animate-spin text-primary" />
          </div>
      );
    }

    if (!user) {
        router.replace('/login');
        return (
            <div className="flex h-full w-full items-center justify-center">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
            </div>
        );
    }

    if (userProfile?.appRole !== 'admin') {
        router.replace('/dashboard');
        return (
            <div className="flex h-full w-full items-center justify-center">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
            </div>
        );
    }

    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Data Connect</h1>
        <p>This is the data connect page.</p>
      </div>
    );
  }

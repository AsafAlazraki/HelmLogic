'use client';

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import dynamic from "next/dynamic";
import { useUser } from "@/firebase/auth/use-user";
import { useDoc } from "@/firebase/firestore/use-doc";

const UserMenu = dynamic(() => import('@/components/user-menu').then(mod => mod.UserMenu), {
  ssr: false,
  loading: () => <Skeleton className="h-8 w-8 rounded-full" />,
});


export function Header() {
  const { user } = useUser();
  const { data: userProfile, loading } = useDoc<{ appRole: string }>(user ? `/users/${user.uid}` : null);

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b bg-card px-4 sm:px-6">
      <SidebarTrigger className="-ml-[0.375rem]" />
      <div className="flex-1 text-sm text-muted-foreground">
        {user && loading && <span>Checking role...</span>}
        {user && !loading && <span>Role: {userProfile?.appRole || 'General User'}</span>}
      </div>
      <UserMenu />
    </header>
  )
}

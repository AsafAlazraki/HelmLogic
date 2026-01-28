'use client';

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import dynamic from "next/dynamic";

const UserMenu = dynamic(() => import('@/components/user-menu').then(mod => mod.UserMenu), {
  ssr: false,
  loading: () => <Skeleton className="h-8 w-8 rounded-full" />,
});


export function Header() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b bg-card px-4 sm:px-6">
      <SidebarTrigger />
      <div className="flex-1" />
      <UserMenu />
    </header>
  )
}


'use client';

import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { FirebaseClientProvider } from "@/firebase/client-provider";
import dynamic from "next/dynamic";
import { SidebarSkeleton } from "@/components/sidebar-skeleton";
import { useUser } from "@/firebase/auth/use-user";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { ChatBot } from "@/components/chat-bot";
import { Separator } from "@/components/ui/separator";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { cn } from "@/lib/utils";

const AppSidebar = dynamic(
  () => import("@/components/app-sidebar").then((mod) => mod.AppSidebar),
  {
    ssr: false,
    loading: () => <SidebarSkeleton />,
  }
);

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useUser();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  const isModulePage = pathname?.includes('/modules/');
  
  return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="overflow-hidden flex flex-col h-screen max-w-full relative bg-background">
          {/* Tactical Header - Replaces the removed Top Bar for essential navigation */}
          {!isModulePage && (
            <header className="flex h-14 shrink-0 items-center gap-2 px-6 border-b bg-background/50 backdrop-blur-md z-40">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 h-4" />
              <BreadcrumbNav />
            </header>
          )}
          
          <main className={cn(
            "flex-1 overflow-y-auto overflow-x-hidden min-w-0",
            !isModulePage && "p-8"
          )}>
            {isModulePage && (
                <div className="absolute top-10 left-10 z-[50]">
                    <SidebarTrigger className="h-10 w-10 bg-white/10 hover:bg-white/20 border-white/20 text-white shadow-2xl backdrop-blur-md" />
                </div>
            )}
            {children}
          </main>
          <ChatBot />
        </SidebarInset>
      </SidebarProvider>
  )
}

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <FirebaseClientProvider>
      <ProtectedLayout>{children}</ProtectedLayout>
    </FirebaseClientProvider>
  );
}

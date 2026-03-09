
'use client';

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { FirebaseClientProvider } from "@/firebase/client-provider";
import dynamic from "next/dynamic";
import { SidebarSkeleton } from "@/components/sidebar-skeleton";
import { useUser } from "@/firebase/auth/use-user";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { ChatBot } from "@/components/chat-bot";
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
      <SidebarProvider defaultOpen={false}>
        <AppSidebar />
        <SidebarInset className="overflow-hidden flex flex-col h-screen max-w-full relative bg-background">
          <main className={cn(
            "flex-1 min-w-0 min-h-0",
            !isModulePage ? "p-8 overflow-y-auto" : "p-0 overflow-hidden"
          )}>
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

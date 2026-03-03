
'use client';

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { FirebaseClientProvider } from "@/firebase/client-provider";
import dynamic from "next/dynamic";
import { SidebarSkeleton } from "@/components/sidebar-skeleton";
import { useUser } from "@/firebase/auth/use-user";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { ChatBot } from "@/components/chat-bot";

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
  
  return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="overflow-hidden flex flex-col h-screen max-w-full relative">
          <main className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
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

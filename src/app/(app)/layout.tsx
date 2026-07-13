'use client';

import { TelemetryProvider } from '@/components/telemetry-provider';
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { FirebaseClientProvider } from "@/firebase/client-provider";
import dynamic from "next/dynamic";
import { SidebarSkeleton } from "@/components/sidebar-skeleton";
import { useUser } from "@/firebase/auth/use-user";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { HelmLogicLoading } from "@/components/helmlogic-loading";
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
    return <HelmLogicLoading />;
  }

  // Module, Blueprint and Quote pages manage their own full-bleed layout
  // (the Highfield quote flow uses fixed inset-0 and its own ScrollArea, so
  // the parent <main> must not impose padding/scroll). Proposals are the
  // only /modules/* sub-route that still needs the default padded layout.
  const isImmersivePage = (pathname?.includes('/modules/') || pathname?.includes('/blueprint/'))
    && !pathname?.includes('/proposals/');
  
  return (
      <SidebarProvider defaultOpen={false}>
        {/* v1.33 (Epic 14) — usage telemetry: sessions + labeled events. */}
        <TelemetryProvider />
        <AppSidebar />
        <SidebarInset className="overflow-hidden flex flex-col h-screen max-w-full relative bg-background">
          <main className={cn(
            "flex-1 min-w-0 min-h-0",
            !isImmersivePage ? "p-8 overflow-y-auto" : "p-0 overflow-hidden"
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

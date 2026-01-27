import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { Header } from "@/components/header";
import { AppSidebar } from "@/components/app-sidebar";
import FirebaseClientProvider from "@/firebase/client-provider";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <FirebaseClientProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <Header />
          <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </FirebaseClientProvider>
  );
}

'use client';

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { navLinks } from "@/lib/nav-links";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";
import { useUser } from "@/firebase/auth/use-user";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useRouter } from "next/navigation";

export default function AdminPage() {
  const adminLinks = navLinks.find(link => link.label === 'Admin')?.subLinks;
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
      <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
      <p className="text-muted-foreground">Manage your application settings and data from here.</p>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {adminLinks?.map((link) => (
          <Link href={link.href} key={link.href} className="group">
            <Card className="h-full transition-all duration-300 ease-in-out group-hover:border-primary group-hover:-translate-y-1 group-hover:shadow-xl">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg font-medium">{link.label}</CardTitle>
                <link.icon className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center text-sm text-muted-foreground">
                  <span>Go to {link.label}</span>
                  <ArrowRight className="ml-2 h-4 w-4 transform transition-transform group-hover:translate-x-1" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

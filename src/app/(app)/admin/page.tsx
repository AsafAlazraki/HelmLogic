import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { navLinks } from "@/lib/nav-links";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function AdminPage() {
  const adminLinks = navLinks.find(link => link.label === 'Admin')?.subLinks;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
      <p className="text-muted-foreground">Manage your application settings and data from here.</p>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {adminLinks?.map((link) => (
          <Link href={link.href} key={link.href} className="group">
            <Card className="hover:bg-accent transition-colors h-full">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg font-medium text-card-foreground group-hover:text-accent-foreground">{link.label}</CardTitle>
                <link.icon className="h-5 w-5 text-muted-foreground group-hover:text-accent-foreground/75" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center text-sm text-muted-foreground group-hover:text-accent-foreground/75">
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

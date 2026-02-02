import AdminGuard from "@/components/admin-guard";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function ModulesPage() {
  return (
    <AdminGuard>
        <div className="space-y-4">
        <div>
            <h1 className="text-2xl font-semibold">Modules</h1>
            <BreadcrumbNav />
        </div>
        <Card>
            <CardHeader>
            <CardTitle>Application Modules</CardTitle>
            <CardDescription>Manage application modules here.</CardDescription>
            </CardHeader>
            <CardContent>
            <p className="text-muted-foreground">This feature is coming soon.</p>
            </CardContent>
        </Card>
        </div>
    </AdminGuard>
  );
}

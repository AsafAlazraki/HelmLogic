import AdminGuard from "@/components/admin-guard";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function DataStagingPage() {
  return (
    <AdminGuard>
        <div className="space-y-4">
        <div>
            <h1 className="text-2xl font-semibold">Data Staging</h1>
            <BreadcrumbNav />
        </div>
        <Card>
            <CardHeader>
            <CardTitle>Data Staging Area</CardTitle>
            <CardDescription>Prepare and validate data before it enters the data warehouse.</CardDescription>
            </CardHeader>
            <CardContent>
            <p className="text-muted-foreground">This feature is coming soon.</p>
            </CardContent>
        </Card>
        </div>
    </AdminGuard>
  );
}

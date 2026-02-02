import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function SubDealersPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Sub Dealers</h1>
        <BreadcrumbNav />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Sub Dealers Management</CardTitle>
          <CardDescription>Manage your network of sub-dealers here.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">This feature is coming soon.</p>
        </CardContent>
      </Card>
    </div>
  );
}

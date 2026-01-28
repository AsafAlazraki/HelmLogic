import AdminGuard from "@/components/admin-guard";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";

export default function DataManagementPage() {
    return (
      <AdminGuard>
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-semibold">Data Management</h1>
            <BreadcrumbNav />
          </div>
          <p>This is the data management page.</p>
        </div>
      </AdminGuard>
    );
}

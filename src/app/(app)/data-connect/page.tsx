import AdminGuard from "@/components/admin-guard";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";

export default function DataConnectPage() {
    return (
      <AdminGuard>
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-semibold">Data Connect</h1>
            <BreadcrumbNav />
          </div>
          <p>This is the data connect page.</p>
        </div>
      </AdminGuard>
    );
  }

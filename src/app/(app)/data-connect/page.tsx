import AdminGuard from "@/components/admin-guard";

export default function DataConnectPage() {
    return (
      <AdminGuard>
        <div className="space-y-6">
          <h1 className="text-2xl font-semibold">Data Connect</h1>
          <p>This is the data connect page.</p>
        </div>
      </AdminGuard>
    );
  }

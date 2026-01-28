import AdminGuard from "@/components/admin-guard";

export default function DataManagementPage() {
    return (
      <AdminGuard>
        <div className="space-y-6">
          <h1 className="text-2xl font-semibold">Data Management</h1>
          <p>This is the data management page.</p>
        </div>
      </AdminGuard>
    );
}

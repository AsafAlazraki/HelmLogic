import AdminGuard from "@/components/admin-guard";

export default function OrganisationsPage() {
    return (
      <AdminGuard>
        <div className="space-y-6">
          <h1 className="text-2xl font-semibold">Organisations</h1>
          <p>This is the organisations page.</p>
        </div>
      </AdminGuard>
    );
}

import AdminGuard from "@/components/admin-guard";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { AgentTeamDashboard } from "@/components/agent-team-dashboard";

export default function AgentTeamPage() {
  return (
    <AdminGuard>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Agent Team</h1>
          <BreadcrumbNav />
        </div>
        <p className="text-muted-foreground">Monitor and interact with your AI development team</p>
        <AgentTeamDashboard />
      </div>
    </AdminGuard>
  );
}

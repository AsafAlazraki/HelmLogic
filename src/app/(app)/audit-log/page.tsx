'use client';
/** Audit Log Viewer (v2.1 — Story 5.5.5). Full org activity log. */
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { RecentActivityFeed } from "@/components/recent-activity-feed";

export default function AuditLogPage() {
  return (
    <div className="space-y-4" data-testid="audit-log-page">
      <div>
        <h1 className="text-2xl font-semibold">Audit Log</h1>
        <BreadcrumbNav />
      </div>
      {/* Reuses the v1.22 activity feed with a larger window for the
          full audit-log viewer. */}
      <RecentActivityFeed limit={200} />
    </div>
  );
}

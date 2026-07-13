'use client';

import { Card, CardContent } from "@/components/ui/card"
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { Loader2 } from "lucide-react";
import { useUser } from "@/firebase/auth/use-user";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useFirestore, useMemoFirebase } from "@/firebase/provider";
import { doc } from "firebase/firestore";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReportingDashboard } from "@/components/reporting-dashboard";
import { RecentActivityFeed } from "@/components/recent-activity-feed";
import { UsageReportingWorkspace } from "@/components/usage-reporting-workspace";

export default function ReportingPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: userProfile } = useDoc<any>(userProfileRef);
  const organisationId = userProfile?.organisationId;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Reporting</h1>
        <BreadcrumbNav />
      </div>

      {organisationId ? (
        <Tabs defaultValue="business">
          <TabsList>
            <TabsTrigger value="business">Business</TabsTrigger>
            {/* v1.33 (Epic 14) — usage telemetry reports: sessions,
                active-vs-idle time, every click and action, filter +
                search + PDF export. */}
            <TabsTrigger value="usage">Usage &amp; Activity</TabsTrigger>
          </TabsList>
          <TabsContent value="business" className="space-y-4 mt-4">
            {/* v1.21 (Story 8.2.1 + 8.1.4) — Reporting & Analytics dashboard +
                cross-module quotes view. */}
            <ReportingDashboard organisationId={organisationId} />
            {/* v1.22 (Story 1.7.3) — Recent activity feed. */}
            <RecentActivityFeed />
          </TabsContent>
          <TabsContent value="usage" className="mt-4">
            <UsageReportingWorkspace organisationId={organisationId} />
          </TabsContent>
        </Tabs>
      ) : (
        <Card>
          <CardContent className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            <span className="text-xs">Loading reporting…</span>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

'use client';

import { Card, CardContent } from "@/components/ui/card"
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { Loader2 } from "lucide-react";
import { useUser } from "@/firebase/auth/use-user";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useFirestore, useMemoFirebase } from "@/firebase/provider";
import { doc } from "firebase/firestore";
import { UsageReportingWorkspace } from "@/components/usage-reporting-workspace";

/**
 * v1.33 (Epic 14) — Usage & Activity gets its own sidebar page (Asaf:
 * "that is what I want in its own tab"). Sessions, active-vs-idle time,
 * every click / field / page view / error, coverage of what each person
 * has and has NOT touched, per-session traces, filters + PDF export.
 * Separate from /reporting so opening it never pays the Business
 * dashboard's heavy cross-module queries.
 */
export default function UsagePage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: userProfile } = useDoc<any>(userProfileRef);
  const organisationId = userProfile?.organisationId;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Usage &amp; Activity</h1>
        <BreadcrumbNav />
      </div>

      {organisationId ? (
        <UsageReportingWorkspace organisationId={organisationId} />
      ) : (
        <Card>
          <CardContent className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            <span className="text-xs">Loading usage &amp; activity…</span>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

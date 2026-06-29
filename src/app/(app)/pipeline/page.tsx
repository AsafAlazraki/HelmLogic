'use client';

/**
 * Pipeline page (v1.23 — Story 1.7.1).
 */

import { useUser } from "@/firebase/auth/use-user";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useFirestore, useMemoFirebase } from "@/firebase/provider";
import { doc } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { SalesPipelineBoard } from "@/components/sales-pipeline-board";

export default function PipelinePage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: userProfile } = useDoc<any>(userProfileRef);
  const organisationId = userProfile?.organisationId;
  const orgRef = useMemoFirebase(() => organisationId ? doc(firestore, 'organisations', organisationId) : null, [firestore, organisationId]);
  const { data: organisation } = useDoc<any>(orgRef);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Pipeline</h1>
        <BreadcrumbNav />
      </div>
      {organisationId ? (
        <SalesPipelineBoard organisationId={organisationId} organisation={organisation} />
      ) : (
        <Card><CardContent className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /><span className="text-xs">Loading pipeline…</span></CardContent></Card>
      )}
    </div>
  );
}

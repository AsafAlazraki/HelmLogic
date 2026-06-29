'use client';

/**
 * Quote Comparison page (v1.25 — Story 1.1.4).
 */

import { useUser } from "@/firebase/auth/use-user";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useFirestore, useMemoFirebase } from "@/firebase/provider";
import { doc } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { QuoteComparison } from "@/components/quote-comparison";

export default function QuoteComparisonPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: userProfile } = useDoc<any>(userProfileRef);
  const organisationId = userProfile?.organisationId;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Quote Comparison</h1>
        <BreadcrumbNav />
      </div>
      {organisationId ? (
        <QuoteComparison organisationId={organisationId} />
      ) : (
        <Card><CardContent className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /><span className="text-xs">Loading…</span></CardContent></Card>
      )}
    </div>
  );
}

'use client';

/**
 * Customers page (v1.21 — mounts the CustomerList + 8.1.2 detail sheet).
 *
 * CustomerList existed since v1.0 but was never mounted on a route, so
 * the v1.21 Customer Detail Sheet had nowhere to live. This page gives
 * it a home. The full Sales workspace shell (8.1.1) lands in v1.22 and
 * will wrap this list in the workspace nav; for now it's a standalone
 * page so the detail sheet is reachable + testable.
 */

import { useUser } from "@/firebase/auth/use-user";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useFirestore, useMemoFirebase } from "@/firebase/provider";
import { doc } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { CustomerList } from "@/components/customer-list";

export default function CustomersPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: userProfile } = useDoc<any>(userProfileRef);
  const organisationId = userProfile?.organisationId;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Customers</h1>
        <BreadcrumbNav />
      </div>
      {organisationId ? (
        <CustomerList organisationId={organisationId} />
      ) : (
        <Card>
          <CardContent className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            <span className="text-xs">Loading customers…</span>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

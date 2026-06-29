'use client';

/**
 * My Work page (v1.23 — Story 8.1.6).
 *
 * Personal views scoped to the current user: My Quotes / My Customers /
 * My Contracts. Quotes + contracts filter by createdByUid via
 * collectionGroup; customers filter by a createdByUid field where present.
 * All silent so missing collectionGroup rules degrade to empty.
 */

import { useMemo, useState } from "react";
import { collection, collectionGroup, query, where } from "firebase/firestore";
import { useUser } from "@/firebase/auth/use-user";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useFirestore, useMemoFirebase } from "@/firebase/provider";
import { useCollection } from "@/firebase/firestore/use-collection";
import { doc } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { Loader2, FileText, Users, FileSignature } from "lucide-react";

export default function MyWorkPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
  const { data: userProfile } = useDoc<any>(userProfileRef);
  const uid = user?.uid;
  const orgId = userProfile?.organisationId;

  const myQuotesQuery = useMemoFirebase(
    () => uid ? query(collectionGroup(firestore, 'quotes'), where('createdByUid', '==', uid)) : null,
    [firestore, uid],
  );
  const { data: myQuotes } = useCollection<any>(myQuotesQuery, { silent: true });

  const myContractsQuery = useMemoFirebase(
    () => uid ? query(collectionGroup(firestore, 'contracts'), where('createdByUid', '==', uid)) : null,
    [firestore, uid],
  );
  const { data: myContracts } = useCollection<any>(myContractsQuery, { silent: true });

  const myCustomersQuery = useMemoFirebase(
    () => orgId ? query(collection(firestore, 'customers'), where('organisationId', '==', orgId)) : null,
    [firestore, orgId],
  );
  const { data: orgCustomers } = useCollection<any>(myCustomersQuery, { silent: true });
  const myCustomers = useMemo(
    () => (orgCustomers ?? []).filter((c: any) => !c.createdByUid || c.createdByUid === uid),
    [orgCustomers, uid],
  );

  return (
    <div className="space-y-4" data-testid="my-work-page">
      <div>
        <h1 className="text-2xl font-semibold">My Work</h1>
        <BreadcrumbNav />
      </div>
      <Tabs defaultValue="quotes">
        <TabsList>
          <TabsTrigger value="quotes" data-testid="my-quotes-tab"><FileText className="h-3.5 w-3.5 mr-1" /> My Quotes</TabsTrigger>
          <TabsTrigger value="customers" data-testid="my-customers-tab"><Users className="h-3.5 w-3.5 mr-1" /> My Customers</TabsTrigger>
          <TabsTrigger value="contracts" data-testid="my-contracts-tab"><FileSignature className="h-3.5 w-3.5 mr-1" /> My Contracts</TabsTrigger>
        </TabsList>
        <TabsContent value="quotes"><MiniList rows={(myQuotes ?? []).map((q: any) => ({ id: q.id, label: q.quoteNumber ?? q.id?.slice(0,8), meta: q.lifecycleState, value: q.financials?.totalInclGst ?? q.totalInclGst }))} empty="No quotes you created yet." /></TabsContent>
        <TabsContent value="customers"><MiniList rows={(myCustomers ?? []).map((c: any) => ({ id: c.id, label: c.name, meta: c.lifecycleStage, value: undefined }))} empty="No customers assigned to you yet." /></TabsContent>
        <TabsContent value="contracts"><MiniList rows={(myContracts ?? []).map((c: any) => ({ id: c.id, label: c.contractReference ?? c.id?.slice(0,8), meta: c.state, value: c.totalInclGst }))} empty="No contracts you created yet." /></TabsContent>
      </Tabs>
    </div>
  );
}

function MiniList({ rows, empty }: { rows: Array<{ id: string; label: string; meta?: string; value?: number }>; empty: string }) {
  if (rows.length === 0) {
    return <Card><CardContent className="py-10 text-center text-xs text-muted-foreground italic">{empty}</CardContent></Card>;
  }
  return (
    <Card>
      <CardContent className="p-0">
        <div className="divide-y">
          {rows.slice(0, 100).map(r => (
            <div key={r.id} className="flex items-center justify-between px-4 py-2.5 text-xs hover:bg-slate-50">
              <span className="font-bold truncate">{r.label}</span>
              <div className="flex items-center gap-2">
                {r.meta && <Badge variant="outline" className="text-[9px]">{r.meta}</Badge>}
                {r.value != null && <span className="tabular-nums font-bold">${Number(r.value).toLocaleString('en-AU')}</span>}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

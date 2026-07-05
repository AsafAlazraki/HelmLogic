'use client';

/**
 * Contracts page (v1.22 — Story 8.1.5).
 *
 * Cross-module contracts view in the Sales workspace.
 */

import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { ContractsOverview } from "@/components/contracts-overview";

export default function ContractsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Contracts</h1>
        <BreadcrumbNav />
      </div>
      <ContractsOverview />
    </div>
  );
}

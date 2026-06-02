'use client';

/**
 * Boats catalogue page (v1.10 — Story 3.7.2).
 *
 * Top-level surface for the Boats Table read-view. Renders the
 * BoatsTableView component with a heading + breadcrumb scaffold so
 * the page sits comfortably next to the other in-app surfaces.
 */

import { BoatsTableView } from '@/components/boats-table-view';
import { BreadcrumbNav } from '@/components/breadcrumb-nav';

export default function BoatsPage() {
    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-2xl font-semibold">Boats Catalogue</h1>
                <BreadcrumbNav />
            </div>
            <BoatsTableView />
        </div>
    );
}

'use client';

/**
 * Catalog Explorer's TRAILER OPTIONS tab. Used inside ModelConfigurationEditor.
 *
 * v1.4 (day-1 tester feedback): the legacy freeform "Primary Trailer" + "Trailer
 * Sub-Options" cards have been removed. Operators attach trailers from the
 * Trailers module catalog via TrailerAssignmentsSection (which reads/writes
 * `model.trailerAssignments[]`). The legacy `trailerConfig` field on the model
 * doc is left intact for back-compat — the quote flow falls back to it when
 * a model has no assignments.
 */

import { TrailerAssignmentsSection } from '@/components/highfield-model-editor';

export function TrailerOptions(_props: { model: any }) {
    return (
        <div className="space-y-8 animate-in fade-in duration-500 text-left">
            <TrailerAssignmentsSection />
        </div>
    );
}

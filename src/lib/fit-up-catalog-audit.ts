/**
 * v1.11 expansion-2 — Fit-Up catalog audit log.
 *
 * Lightweight append-only log of who edited the fit-up catalog when.
 * Sister to the per-quote audit log (`quote-audit-log.ts`) but scoped at
 * the ORG level: every `fitUpItems` / `fitUpPackages` mutation appends a
 * doc here so org admins can answer "who changed the price on X last
 * week?" without git-blame on Firestore.
 *
 * Path: `/organisations/{orgId}/fitUpCatalogAudit/{eventId}`
 *
 * Shape:
 *   {
 *     at: serverTimestamp(),
 *     actorUid: string,
 *     actorName: string,
 *     resource: 'fitUpItem' | 'fitUpPackage',
 *     resourceId: string,
 *     resourceName: string,
 *     action: 'created' | 'updated' | 'deleted',
 *     // Optional diff for updates — shallow before/after on key fields
 *     // (cost, sellPrice, tier, category, name). Useful for the "what
 *     // changed" preview in the audit drawer.
 *     diff?: Record<string, { from: any; to: any }>,
 *   }
 *
 * The log is fire-and-forget — a failed write here MUST NOT roll back
 * the underlying mutation. Logs are decoration; the catalog itself is
 * the source of truth.
 */

import { addDoc, collection, serverTimestamp, type Firestore } from 'firebase/firestore';

export type FitUpAuditResource = 'fitUpItem' | 'fitUpPackage';
export type FitUpAuditAction = 'created' | 'updated' | 'deleted';

export interface FitUpAuditEvent {
    actorUid: string;
    actorName: string;
    resource: FitUpAuditResource;
    resourceId: string;
    resourceName: string;
    action: FitUpAuditAction;
    diff?: Record<string, { from: any; to: any }>;
}

/** Compute a shallow before/after diff on a list of fields. Skips fields
 *  whose before/after are deep-equal at the JSON level (catches arrays
 *  + plain objects without bringing in a deep-equal dep). */
export function shallowDiff(
    before: Record<string, any> | null | undefined,
    after: Record<string, any> | null | undefined,
    fields: string[],
): Record<string, { from: any; to: any }> {
    const out: Record<string, { from: any; to: any }> = {};
    for (const f of fields) {
        const bv = before?.[f];
        const av = after?.[f];
        if (JSON.stringify(bv) !== JSON.stringify(av)) {
            out[f] = { from: bv ?? null, to: av ?? null };
        }
    }
    return out;
}

export async function logFitUpAuditEvent(
    firestore: Firestore,
    organisationId: string,
    event: FitUpAuditEvent,
): Promise<void> {
    try {
        await addDoc(collection(firestore, 'organisations', organisationId, 'fitUpCatalogAudit'), {
            ...event,
            at: serverTimestamp(),
        });
    } catch (err) {
        // Audit-log write failure must NOT roll back the underlying mutation.
        // Surface in the console; the catalog change still went through.
        console.error('[fit-up-catalog-audit] write failed', err);
    }
}

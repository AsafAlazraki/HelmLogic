/**
 * Customer schema (v1.12 — Story 3.4.1).
 *
 * Shared type for `/customers/{customerId}` documents. The base shape is
 * the v1.0 customer (name + contact + org link); v1.12 adds the lifecycle
 * + CRM fields the new dealer-ops surfaces need. Every new field is
 * optional + defaults applied at read time, so existing docs migrate
 * cleanly without a backfill.
 *
 * Out of scope here:
 *   - The lifecycle-stage automation (state machine triggers / transitions)
 *     — fields are plumbed; the automation lives in 3.4.2 (v1.14 / v1.15).
 *   - Document storage (Firebase Storage paths) — `documents[]` is the
 *     reference list; the upload UI lives in 3.4.3 (later).
 *   - Customer-detail page edits — the `CustomerList` form keeps the v1.0
 *     fields; the expansion lives in the customer-detail surface (3.4.4).
 */

/** Where the customer came from. Sourced from `organisation.customerDefaults.sources`. */
export type CustomerSource = string;

/** Pipeline stage on the Kanban. Sourced from `organisation.customerDefaults.pipelineStages`. */
export type CustomerLifecycleStage = string;

/** Reference to a buyer / contact on a customer. Either the primary buyer or a secondary contact. */
export interface CustomerBuyer {
    name: string;
    email?: string;
    phone?: string;
    /** Free-form role label (e.g. "Spouse", "Business partner"). */
    role?: string;
}

/** Reference to a trade-in document stored elsewhere (`/tradeIns/{id}`). */
export interface CustomerTradeInRef {
    tradeInId: string;
    /** Snapshot label for fast list rendering ("2018 Stessl 480 Edge — $12,000"). */
    label?: string;
}

/** Reference to an attached document in Firebase Storage. */
export interface CustomerDocumentRef {
    /** Storage path under `customers/{id}/documents/`. */
    path: string;
    /** Display name (file name as uploaded). */
    name: string;
    /** Sub-type label ("Driver's License" / "Boat License" / "Insurance"). Free-text. */
    label?: string;
    /** Uploaded timestamp — milliseconds since epoch (or Firestore serverTimestamp on save). */
    uploadedAt?: number;
}

/** Full v1.12 Customer doc. Every v1.12 field is optional so existing docs stay valid. */
export interface Customer {
    id: string;
    organisationId: string;

    // ── v1.0 ──
    name: string;
    email?: string;
    phone?: string;
    company?: string;

    // ── v1.12 (Story 3.4.1) ──
    /** How the customer found us (boat show / referral / web / etc.). */
    source?: CustomerSource;
    /** Where they are in our pipeline (lead / contacted / qualified / quoted / contracted / won / delivered). */
    lifecycleStage?: CustomerLifecycleStage;
    /** Primary buyer (defaults to the customer themselves if absent). */
    primaryBuyer?: CustomerBuyer;
    /** Secondary buyer (e.g. spouse, business partner). */
    secondaryBuyer?: CustomerBuyer;
    /** Trade-in vehicle attached to this customer. */
    tradeIn?: CustomerTradeInRef;
    /** Attached documents (licenses, insurance, photos). */
    documents?: CustomerDocumentRef[];
    /** Denormalised count for fast list-card rendering. */
    notesCount?: number;

    // ── timestamps ──
    createdAt?: { seconds: number; nanoseconds: number };
    updatedAt?: { seconds: number; nanoseconds: number };
}

/** Default values applied at read time. Use this for any reader that wants
 *  every field present even on pre-v1.12 docs. */
export function withCustomerDefaults(raw: Partial<Customer> & { id: string; organisationId: string; name: string }): Customer {
    return {
        ...raw,
        source: raw.source ?? '',
        lifecycleStage: raw.lifecycleStage ?? 'Lead',
        primaryBuyer: raw.primaryBuyer ?? { name: raw.name },
        documents: raw.documents ?? [],
        notesCount: raw.notesCount ?? 0,
    };
}

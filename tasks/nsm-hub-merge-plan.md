# NSM-Hub → HelmLogic — Service Quoting Absorption Plan

> **Scope (locked 2026-05-14):** move **Service Quotes only** from NSM-Hub into HelmLogic — and everything those service quotes depend on (the flow-on effects). Nothing else from NSM-Hub is in scope.
>
> Companion to `tasks/nsm-hub-merge-study.md` (full-repo findings). That study surveyed the whole NSM-Hub platform; this plan is the narrowed, actionable slice.

---

## Decisions locked (2026-05-14)

| Decision | Choice | Rationale |
|---|---|---|
| **Scope** | **Service Quotes only** + their flow-on dependencies | User: "the stuff we need moved is the service quotes — that's it, and all the flow-on effects of that" |
| **Direction** | New **Service Quoting module** inside HelmLogic | HL is the mature production base |
| **Shared schema** | New collections under HL's Firestore (HL's project) | One source of truth |
| **Stack** | Port NSM-Hub's service-quote code DOWN to HL's stack (Next 14 / React 18 / Tailwind 3) | Zero-downtime; additive; no risky HL-wide upgrade |
| **Data migration** | Migrate existing service quotes + the service catalog + referenced customers, with zero HL downtime (additive module, parallel run, cutover) | "Move all existing data, no downtime" |
| **Auth** | Map NSM-Hub creators → HL users so migrated quotes keep correct ownership | One identity system |

### Explicitly OUT of scope (dropped — not moved)

Bookings · Yamaha diagnostics · Insurance quoting · Checklists · Kit approval workflow · External CRM sync · NSM-Hub's Highfield CPQ (catalogue/BMTQuote). None of these move. If any is wanted later, it's a separate initiative.

---

## What a Service Quote is

From NSM-Hub's `types.ts` — the entity we're absorbing:

```
Quote
  userId, user (creator snapshot)
  status: 'Work In Progress' | 'Estimate' | 'Pending' | 'Approved' | 'Complete' | 'Cancelled' | 'Deleted'
  estimateType?: 'Installation' | 'Insurance' | 'Mechanical Estimate'
  customer: Customer                         ← who the work is for
  boat: Boat, motors: Motor[], trailer: Trailer   ← the asset being serviced (free-text)
  operations: Operation[]                    ← the actual work
  createdAt, updatedAt, version, history[]

Operation
  heading, description
  laborRate, laborHours                      ← labor line (rate × hours)
  parts: Part[]                              ← parts on this operation
  customerNotes?

Part
  name, cost, quantity?
```

Core UX (from the blueprint): a **dashboard of quote cards**, a **multi-step create form** (user/ref → customer/boat → operations with dynamic labor+parts cost), a **summary/edit** view, and **service-quote PDF generation**.

This is distinct from HL's existing **boat-sale** quotes (BMT/CPQ). HL sells boats; this quotes **service work** on a customer's existing boat. Different lifecycle, different PDF, different data — a genuinely new HL capability.

---

## Flow-on effects (the "all the flow-on effects of that")

Moving service quotes drags in everything they reference. These ARE the scope:

| # | Flow-on | Why it's required | Treatment |
|---|---|---|---|
| 1 | **Service catalog** (`CatalogueOperation` + `CataloguePart`) | The quote form builds operations by picking from a library of predefined operations + parts. Without it the form has nothing to draw from. **Biggest dependency.** | New `serviceOperations` + `serviceParts` collections; admin-managed; migrated from NSM-Hub |
| 2 | **Customers** | Each quote is for a customer | Reconcile with HL's existing `customers` collection — link + snapshot (don't create a parallel customer set) |
| 3 | **Serviced asset** (boat / motor / trailer) | Quote captures the customer's own boat (make/model/rego/hin/serial) | Embedded free-text on the quote (NOT linked to HL's data-warehouse catalog — it's the customer's existing vessel, not a sale) |
| 4 | **Creator / ownership** | `userId` + `user` on each quote | Map NSM-Hub uids → HL uids during migration so ownership + "my quotes" stays correct |
| 5 | **Service-quote PDF** | Customer deliverable | Port onto HL's `renderQuotePdf` patterns (`@react-pdf`), new service-quote template (labor + parts + totals, brand styling) |
| 6 | **Pricing + margin** | Labor (rate×hours) + parts (cost×qty); quote total; GP/margin | Reuse HL's financial conventions (ex/inc GST, `Math.ceil` inc-GST rounding, margin tracking) |
| 7 | **Status lifecycle** | WIP → Estimate → Pending → Approved → Complete / Cancelled | New service-quote status field; can later reuse HL's audit-log pattern for transitions |

---

## Data model in HL

```
organisations/{orgId}/
  serviceQuotes/{quoteId}        ← the Quote (operations[] embedded)
  serviceOperations/{opId}       ← service catalog: predefined operations (heading/desc/labor)
  serviceParts/{partId}          ← service catalog: predefined parts (name/cost)
customers/{customerId}           ← reconciled with existing HL customers (linked from quotes)
```

- Quotes embed their `operations[]` (matches NSM-Hub; operations are quote-local once added).
- The service catalog (`serviceOperations` / `serviceParts`) is the shared library the create-form picks from + an admin surface to manage it.
- Asset (boat/motor/trailer) embedded on the quote as free-text snapshot.
- Types ported into `src/lib/service-quote.ts` (+ `service-catalog.ts`), normalized to HL conventions (Timestamps, `organisationId` denormalized, audit fields).

---

## Zero-downtime migration — DAILY ACTIVE USE

> ⚠️ **Confirmed 2026-05-14: NSM staff create service quotes every day.** A single bulk-migrate-then-cutover would lose every quote created during the migration window. The migration must keep the two systems in sync until the moment of cutover.

The HL module is **additive** — building it never touches existing HL surfaces, so HL itself has zero downtime by construction. The hard part is **NSM-Hub data continuity** under daily writes. Approach:

1. **Build** the Service Quoting module against HL Firestore (flagged/dark until ready).
2. **Bulk-migrate** — script (Firebase Admin SDK, dual-project) reads `nsm-service-quotation` → transforms → writes HL Firestore. Order: service catalog → customers (reconcile/dedup) → service quotes (remap customer + uid refs). Idempotent, reports counts, re-runnable.
3. **Continuous delta-sync** — because of daily writes, after the bulk pass run a repeating delta-sync (poll `updatedAt > lastSync` on NSM-Hub, upsert into HL by natural key). Keeps HL current with NSM-Hub while both run. Idempotent upsert (never clear-and-replace — the v1.4 import lesson).
4. **Cutover (tight window)** — pick a low-traffic moment: pause new NSM-Hub quote creation (or accept a short read-only window), run a final delta pass, flip NSM staff to HL's module. Because deltas have been flowing continuously, the final pass is tiny and the freeze is minutes, not hours.
   - *Alternative if even a minutes-long freeze is unacceptable:* a **dual-write bridge** — NSM-Hub writes are mirrored to HL in real time (small shim in NSM-Hub, or a Firestore-trigger Cloud Function on the NSM project) so the two are always consistent and cutover is instant. Heavier to build; only do this if the tight-window freeze is rejected.
5. **Verify + decommission** — reconcile counts + spot-check PDFs, confirm no NSM-Hub writes post-cutover, then retire the NSM-Hub service-quote surface.

**Recommendation:** continuous delta-sync + a minutes-long off-hours cutover freeze (step 4 main path). Build the dual-write bridge only if a zero-second cutover is a hard requirement — it roughly doubles the migration-tooling effort.

> 🚨 Pre-flight: a **read service-account for `nsm-service-quotation` Firestore** is required before any migration script runs. (NSM-Hub equivalent of the SharePoint/email admin tasks.)

---

## Roadmap slotting

Service quoting IS dealer-ops (internal operations) — fits the v1.10+ dealer-ops priority. One new epic, sized after a deeper code read:

| Epic (new) | Stories (provisional) | Rough band |
|---|---|---|
| **Epic 11 — Service Quoting** | Service catalog (ops/parts) + admin · Service-quote create form (multi-step) · Dashboard + quote view/edit · Service-quote PDF · Status lifecycle · Customer reconciliation · Migration tooling + cutover | v1.10–v1.12 (interleaved with Fit-Up / Master Catalog at ≤20 pts/release) |

Slots via the same restructure tooling once the stories are seeded.

---

## Flow-on effects to watch (engineering)

1. **Customer reconciliation** — don't create a parallel customer set. Match NSM-Hub customers to HL `customers` (name + phone/email); link quotes to the canonical record; embed a snapshot on the quote like HL boat-quotes do.
2. **uid mapping** — build an NSM-uid → HL-uid table during migration so ownership + creator attribution survive. NSM staff need HL accounts under the Northside Marine org first.
3. **Two quote types in HL** — boat-sale quotes (existing) + service quotes (new). Keep them clearly separate in nav, data, and PDF. Don't let the service-quote lifecycle bleed into the boat-quote lifecycle (1.4.1) or vice-versa.
4. **PDF**: new service-quote template on `@react-pdf`; reuse HL's image-preload + brand-styling patterns from `renderQuotePdf`.
5. **Nav/permissions** — new "Service Quotes" sidebar area + permission gate.
6. **Stack downgrade** — port NSM-Hub's service-hub components down (Tailwind 4→3, React 19→18, `@hello-pangea/dnd`→`@dnd-kit` if any DnD, RHF/zod carry over directly).
7. **GST/margin** — apply HL's inc-GST rounding (`Math.ceil`) + margin conventions to labor + parts totals.

---

## Open questions before sizing

1. **Service-account** for `nsm-service-quotation` read access — who provides it?
2. **Live data volume** — how many service quotes + how big is the service catalog in NSM-Hub today? (Sizes the migration.)
3. ~~**Active daily use**~~ — ✅ CONFIRMED: daily active use. Migration uses continuous delta-sync + tight off-hours cutover (or a dual-write bridge if a zero-second cutover is mandated). See migration section.
4. **Cutover tolerance** — is a minutes-long off-hours read-only freeze acceptable, or is a zero-second cutover (dual-write bridge) required? (Determines migration-tooling effort.)
5. **`estimateType` (Installation / Insurance / Mechanical)** — keep all three as modes of the one service quote? (The "insurance quoting" we dropped may partly live here as just an estimateType — confirm.)
6. **Service catalog ownership** — who maintains the predefined operations/parts library going forward (admin role)?

---

## Final step (deferred — do LAST, once everything is built)

> Per stakeholder (2026-05-14): after the restructure + Epic 11 seeding + the actual Service Quoting build are all done, **ship the whole thing to prod** with comprehensive release notes that articulate the full intensive effort — the multi-release roadmap reshuffle (dealer-ops pivot + Submitted-column drain + capacity bin-packing) AND the NSM-Hub Service Quoting absorption (module rebuild + zero-downtime data migration). This is the closing act of the program, not done now.

---

## Next step

Deeper read of NSM-Hub's `service-hub` + `new-quote` + `quote/[id]` pages + the `form/` and `QuoteView`/`QuoteCard` components to size each story precisely, then seed Epic 11 — Service Quoting into the planning system and slot it via the restructure tooling. No merge code until sizing + the service-account pre-flight are cleared.

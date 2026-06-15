# HelmLogic — Release Notes v1.12.0

**Date:** 2026-06-15
**Branch:** `claude/v1.12-v1.13-push` (joint v1.12 + v1.13 push)
**Theme:** Service Quoting end-to-end — view / edit / status lifecycle / PDF / send + customer schema redesign

This release closes out Epic 11.2 — the Service Quoting flow ships end-to-end. The v1.10 catalog (Operations + Parts) flows into the v1.11 create wizard, which flows into v1.12's detail view + status lifecycle + customer-facing PDF, which flows into v1.13's send-via-email pipeline. One epic, four releases, complete.

---

## Release Stats

| Metric | Value |
|---|---|
| Stories shipped | 3 (11.2.2 · 11.2.3 · 3.4.1) |
| Stories deferred to v1.14 | 1 (11.3.2 — NSM-Hub migration tooling, blocked on service-account) |
| New components | 2 (`service-quote-pdf.tsx` · `service-quote-detail-sheet.tsx`) |
| New libraries | 1 (`customer-types.ts` — shared Customer schema) |
| Modified components | 2 (`service-quote-flow.tsx` · `modules/[id]/page.tsx`) |
| New release-schedule entries | 1 (`'v1.12': { shipped: true }`) |

---

## Story 11.2.2 — Service-quote view/edit + status lifecycle

The v1.11 dashboard let you create a service quote and change its status from a dropdown on the card. v1.12 brings the full drill-down.

### Detail sheet (`src/components/service-quote-detail-sheet.tsx`)

Click any card on the Service Quote Dashboard → side sheet opens with:

- **Customer / Vehicle** section — name, phone, email, vessel, **estimate type** (Installation / Insurance / Mechanical Estimate). Every field saves on blur.
- **Status state machine** — buttons for the next valid transitions (no free-text dropdown that lets you skip stages). Transitions: `draft → sent · cancelled`, `sent → accepted · cancelled · draft`, `accepted → in-progress · cancelled`, `in-progress → complete · cancelled`, `complete · cancelled → locked` (no outgoing transitions).
- **Operations list** — every op with code · hours · rate · sell price.
- **Parts list** — every part with part number · qty · sell price.
- **Notes** — operator-only, save on blur.
- **Totals + actions** — total excl. GST, Download PDF, Send to customer (v1.13).

### Status lifecycle

Locked states (`complete` / `cancelled`) read-only the form fields. The status pill shows the lock icon when locked. Every status change writes an audit-log entry to `organisations/{orgId}/serviceQuotes/{quoteId}/auditLog/{eventId}` with the actor + from-status + to-status — same pattern as the v1.11 per-quote audit log on boat quotes.

---

## Story 11.2.3 — Service-quote PDF

### New surface (`src/components/service-quote-pdf.tsx`)

Customer-facing service-quote PDF rendered on the `@react-pdf` pipeline. Sister doc to `proposal-pdf.tsx` (the boat-quote PDF) but with the service shape: operations (labor) + parts breakdown + totals.

Layout:

- **Header** — org logo / name + ABN + address + phone + email · doc title "SERVICE QUOTE" + quote number + estimate type + date
- **Gold rule** divider for premium feel (matches the boat-quote PDF palette)
- **Customer + Vessel** — two-column meta block
- **Operations** — each op as a card with name + code + hours + rate + sell price
- **Parts** — line list with bullet, name, part number, line total (or INCLUDED for $0)
- **Notes** — operator-set notes panel when present
- **Totals** — Operations subtotal · Parts subtotal · Subtotal Excl. GST · GST · Grand Total Incl. GST (rounded up to whole dollars per v1.3 lesson)
- **Footer** — org name + quote number, repeated on every page

Same deep-navy + gold palette as the boat-quote PDF for visual consistency.

### Download from the detail sheet

The Download PDF button on the detail sheet dynamically imports `@react-pdf/renderer` and `service-quote-pdf.tsx`, renders the doc to a Blob, and triggers a browser download. Dynamic import keeps the bundle code-split — service quotes never load `@react-pdf` until someone hits Download.

---

## Story 3.4.1 — Customer Schema Redesign

### New shared type (`src/lib/customer-types.ts`)

Customer doc schema rebuilt to support the lifecycle / CRM features queued for v1.14+. Every new field is optional + defaults applied at read time, so existing customer docs migrate cleanly without a backfill.

```typescript
interface Customer {
    // v1.0 (unchanged)
    id, organisationId, name, email?, phone?, company?, createdAt?

    // v1.12 (Story 3.4.1)
    source?: CustomerSource;             // boat show / referral / web / etc.
    lifecycleStage?: CustomerLifecycleStage;  // lead → contacted → … → delivered
    primaryBuyer?: CustomerBuyer;        // defaults to the customer themselves
    secondaryBuyer?: CustomerBuyer;      // spouse / business partner
    tradeIn?: CustomerTradeInRef;        // ref to /tradeIns/{id}
    documents?: CustomerDocumentRef[];   // Storage path + label + uploaded date
    notesCount?: number;                 // denormalised for fast list rendering
}
```

`withCustomerDefaults()` helper applies safe defaults to any partial input so readers that want every field present (e.g. the customer-detail page) don't have to keep checking for undefined.

### Out of scope (deferred)

- Lifecycle-stage automation (state machine triggers) — Story 3.4.2, v1.14 / v1.15.
- Document storage upload UI — Story 3.4.3.
- Customer-detail page edits — Story 3.4.4. The existing `CustomerList` form keeps the v1.0 fields; the expansion lives on the customer-detail surface.

---

## v1.12 NOT in scope (deferred to v1.14)

- **11.3.2 — Migration tooling (bulk + delta-sync)** — blocked on the NSM-Hub service-account (`nsm-service-quotation` read access still pending). The migration script is designed but won't run until access clears. Bumped to v1.14.

---

## Files Changed

**New:**
- `src/components/service-quote-pdf.tsx`
- `src/components/service-quote-detail-sheet.tsx`
- `src/lib/customer-types.ts`
- `tasks/RELEASE_NOTES_v1.12.0.md`
- `tasks/USER_GUIDE_v1.12.0.md`

**Modified:**
- `src/lib/release-schedule.ts` — `'v1.12': { shipped: true }` + `FORWARD_RUNWAY_START` bumped 12 → 14
- `src/components/service-quote-flow.tsx` — wires the detail sheet into the dashboard, opens on card click, passes organisation to PDF render
- `src/app/(app)/modules/[id]/page.tsx` — passes `organisation` prop to `ServiceQuoteDashboard`
- `CLAUDE.md` — v1.12 row added to the release state table

---

## What's next

v1.13 ships in the **same merge** as v1.12 — see `RELEASE_NOTES_v1.13.0.md`. Headlines: send-via-email pipeline for service quotes, Trailers catalogue read-view, inline editing on catalogue tables, Pricing Manager feature parity audit.

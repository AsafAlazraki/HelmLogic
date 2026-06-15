# HelmLogic — User Guide v1.12.0

**For:** Org admins · service writers · workshop coordinators
**Companion to:** `RELEASE_NOTES_v1.12.0.md`

v1.12 is the **Service Quoting** release. Operations + Parts catalogues (v1.10) and the create wizard (v1.11) now have a full detail surface with status lifecycle + customer-facing PDF. The send-via-email button lands in v1.13 (same merge).

---

## At a glance

| What you want to do | Where | Section |
|---|---|---|
| Open an existing service quote to view / edit | Service Quote Dashboard → click a card | §1 |
| Change a service quote's status | Detail sheet → Status section → tap the next-stage button | §1.2 |
| Pick the estimate type (Installation / Insurance / Mechanical) | Detail sheet → Customer · Vehicle → Estimate type dropdown | §1.3 |
| Download the customer-facing service-quote PDF | Detail sheet → bottom of the sheet → Download PDF | §2 |
| Record customer source / lifecycle stage / secondary buyer | Customer detail surface (v1.14+) — schema is live now (§3) | §3 |

---

## 1. Service Quote Dashboard — drill-down

The Dashboard you've been using since v1.11 (`Modules → Service Quoting`) is unchanged on the surface. What's new: **click any card** and a side sheet opens with the full detail.

### 1.1 What's in the sheet

- **Status** card at the top — current status as a coloured badge, with buttons for the next valid transitions below
- **Customer · Vehicle** — name, phone, email, vessel, estimate type. Edit any field; saves on blur
- **Operations** — every operation on the quote with code, hours, rate, and sell price
- **Parts** — every part with part number, qty, and sell price
- **Notes** — operator-only text. Saves on blur
- **Totals + actions** — total excl. GST, Download PDF, Send to customer (v1.13)

### 1.2 Status lifecycle

The status state machine is **strict** — the dashboard's "any status" dropdown is replaced with explicit "next stage" buttons in the sheet, so an `accepted` quote can transition to `in-progress` or `cancelled`, but never back to `draft`.

Transitions:

```
draft        → sent · cancelled
sent         → accepted · cancelled · draft
accepted     → in-progress · cancelled
in-progress  → complete · cancelled
complete     → (no outgoing transitions — locked read-only)
cancelled    → (no outgoing transitions — locked read-only)
```

When a quote is in a locked status, the customer / vessel / notes fields read-only. The lock icon shows next to the status badge.

Every status change writes an audit-log entry with the actor's name + the from/to status. Audit lives at `organisations/{orgId}/serviceQuotes/{quoteId}/auditLog/{eventId}`. Same pattern as the v1.11 per-quote audit log.

### 1.3 Estimate type

New in v1.12. Three options:

- **Installation** — quoting an install (e.g. new sounder, new battery system, fit-out)
- **Insurance** — quoting an insurance job
- **Mechanical Estimate** — quoting a mechanical repair

Surfaces on the customer PDF in the header next to the date. Internal use too — filter by type once the dashboard's filter chips include it (v1.14 polish).

---

## 2. Customer-facing service-quote PDF

The **Download PDF** button at the bottom of the detail sheet renders a customer-facing PDF for the current quote and triggers a browser download. The PDF includes:

- **Header** — your org logo / name + ABN + address + phone + email · the words "SERVICE QUOTE" + quote number + estimate type + date
- **Customer + Vessel** — name, phone, email, vessel
- **Operations · Labor** — each operation as a card with name + code + hours × rate
- **Parts** — line-by-line list with line totals (or INCLUDED for $0)
- **Notes** — your operator notes (yes, they appear on the customer PDF — keep it polite)
- **Totals** — Operations subtotal · Parts subtotal · Subtotal Excl. GST · GST · **Grand Total Incl. GST**
- **Footer** — org name + quote number on every page

Filename: `service-quote-{quote-number}.pdf`.

### Send to customer

The Send button next to Download lands in v1.13 (same merge). See `USER_GUIDE_v1.13.0.md` §1.

---

## 3. Customer schema — what's new

v1.12 adds the fields the v1.14+ CRM features need to a customer doc. None of these surfaces yet — the field plumbing is what ships now so the data starts populating from new quotes.

Fields added:

- **source** — how the customer found you (driven by `organisation.customerDefaults.sources`; default options: Boat show / Referral / Website / Walk-in / Repeat customer / Social media / Other)
- **lifecycleStage** — pipeline stage (driven by `organisation.customerDefaults.pipelineStages`; default: Lead → Contacted → Qualified → Quoted → Contracted → Won → Delivered)
- **primaryBuyer** — the main buyer (defaults to the customer themselves)
- **secondaryBuyer** — e.g. spouse, business partner
- **tradeIn** — reference to a trade-in record stored elsewhere
- **documents[]** — attached files (licenses, insurance) — Firebase Storage paths
- **notesCount** — denormalised count for fast list rendering

All optional. Existing customer docs stay valid unchanged.

### What this affects

Today: **nothing in the UI**. The schema is plumbed so the Customer Defaults card you've already used (Manage → Company Details) starts populating these correctly going forward.

Soon (v1.14+):
- A proper customer-detail page that exposes all these fields editable
- Lifecycle stage automation (state machine triggers — change stage on quote events)
- A documents upload UI

If you've recorded any of these manually in a notes field, hold onto that data — the v1.14 customer-detail surface will let you backfill cleanly.

---

## What this release did NOT ship (deferred to v1.14+)

- **NSM-Hub migration tooling (Story 11.3.2)** — designed but blocked on the NSM-Hub service-account. Lands when access clears.
- **Per-line edit on the detail sheet** (qty / price-override per op or part) — v1.12 shows operations + parts read-only on the sheet. Full per-line edit is on the v1.14 polish queue.
- **Send service quote via email** — ships in the SAME merge as v1.12. See `USER_GUIDE_v1.13.0.md` for that one.
- **Customer-detail page** — schema is live; the UI surface that exposes the new fields is v1.14.

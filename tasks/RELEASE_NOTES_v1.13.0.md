# HelmLogic — Release Notes v1.13.0

**Date:** 2026-06-15
**Branch:** `claude/v1.12-v1.13-push` (joint v1.12 + v1.13 push)
**Theme:** Service Quote send-via-email + Catalogue table polish (Trailers + inline editing)

This release ships the back half of the joint v1.12 + v1.13 push. v1.12 handled view / edit / status / PDF; v1.13 plugs the PDF into the email pipeline and finishes the catalogue read-view family with the Trailers table + click-to-edit cells.

---

## Release Stats

| Metric | Value |
|---|---|
| Stories shipped | 5 (11.2.4 · 3.7.4 · 3.7.5 · 3.8.1 · 3.8.2) |
| Stories deferred to v1.14 | 1 (11.3.3 — NSM-Hub cutover, blocked on service-account) |
| New components | 2 (`trailers-table-view.tsx` · `inline-edit-cell.tsx`) |
| Modified components | 2 (`service-quote-detail-sheet.tsx` Send button · `pricing-manager/page.tsx` Trailer Brand route) |
| New docs | 1 (`tasks/PRICING_MANAGER_PARITY_AUDIT.md`) |
| New release-schedule entries | 1 (`'v1.13': { shipped: true }`) |

---

## Story 11.2.4 — Send service quote via email

### What ships

The detail sheet (v1.12) gains a **Send to customer** button next to Download PDF. When clicked it:

1. Renders the service-quote PDF (same pipeline as the Download button)
2. Uploads the PDF to `organisations/{orgId}/serviceQuotes/{quoteId}/sent/{sendId}.pdf` in Firebase Storage
3. Writes a `mail/{id}` doc — the Trigger Email Firebase extension picks this up and dispatches via the configured SMTP
4. Writes an audit row at `organisations/{orgId}/serviceQuotes/{quoteId}/sentEmails/{sendId}` with recipient + sender + PDF path
5. Bumps `quote.sentCount` + sets `quote.lastSentAt`
6. **First-send auto-lock** — on the first successful send, `lockedAt` + `lockedReason: 'sent'` are set + the status flips to `sent` (if currently `draft`). Once locked, the form fields read-only.
7. Writes two audit-log entries: one for the send, one for the lock-on-first-send

### Gates

- **`NEXT_PUBLIC_EMAIL_SEND_ENABLED`** — feature flag (same as v1.8 boat-quote send). The button shows but disables with a tooltip "Email send disabled — flip the env var" when off.
- **Customer email present** — the button disables with a tooltip "Add a customer email above first" if empty.

### What's NOT in v1.13 send

The minimal pipeline ships now. The full polish lands as a v1.14 follow-up:

- Operator-edit recipient / CC / BCC at send time (v1.13 reads from `quote.customerEmail`)
- Template-driven subject / body (v1.13 uses a hard-coded "Service quote from {orgName}" subject + simple HTML body)
- Send-history view on the detail sheet (v1.13 writes the history, doesn't render it yet)

This mirrors how v1.8 boat-quote send shipped (1.2.4 minimal first; 1.2.4 polish later).

---

## Story 3.7.4 — Trailers Table read-view

### New surface (`src/components/trailers-table-view.tsx`)

Final entry in the catalogue read-view family. Sister to BoatsTableView (Story 3.7.2) and MotorsTableView (Story 3.7.3) — every trailer in the catalogue with the pricing + spec columns operators want to scan for anomalies.

Columns:

- **Image** — thumbnail or placeholder
- **Code** · **Name** — model identifiers
- **ATM (kg)** · **Tare (kg)** · **Wheels** — spec primitives
- **Cost** · **Sell (ex GST)** · **Margin** — pricing with band-coloured margin badge (red < 15% / amber < 25% / emerald >= 25%)
- **Rego** — link to the Rego module (state-specific calc happens at quote time from ATM)

Missing required pricing fields render with a rose highlight + AlertCircle icon so the admin spots "cost not set" rows fast. Inactive trailers render at 60% opacity but stay in the table.

A totals badge at the top of the table shows: total count, count priced, count missing pricing.

### Where it surfaces

Wired into `/pricing-manager` (Catalog Manager). When the active vendor's `vendorType === 'Trailer Brand'`, the workspace mounts `<TrailersTableView />`. Slots between the existing Motors Table (Motor Brand) and Boats Table (Boat Brand) routes.

---

## Stories 3.8.1 + 3.8.2 — Inline editing

### New shared component (`src/components/inline-edit-cell.tsx`)

Click-to-edit cell for any table view. Mirrors the spreadsheet pattern operators are used to:

- Click the cell → Input replaces the read view
- Tab / Enter to commit · Esc to cancel
- Save on blur via the supplied `onSave` (returns a promise; caller handles Firestore write + downstream side effects)
- Tiny loader pip while saving · toast on result
- Inline error pill below the input on validation failure (e.g. "Not a number", "Positive number")

Three flavours:

- `type="text"` — string field
- `type="number"` — numeric (validated, parsed, rejects NaN)
- `type="currency"` — numeric + currency rendering

The toast + write itself is the caller's responsibility — the component is pure presentation + state so it can be dropped into any table without coupling to a particular Firestore path.

### Wired into Trailers Table

Editable fields:

- **Name** (text)
- **ATM** + **Tare** (number, positive-validated)
- **Wheels** (text)
- **Cost** + **Sell** (currency, positive-validated)

Writes go to `data-warehouse/{vendorId}/trailers/{trailerId}` directly. Each write toasts a confirmation. The component will be retrofitted into Boats Table + Motors Table in v1.14 polish — kept tight in this PR so 3.8.1 + 3.8.2 ACs land complete on at least one table.

---

## Story 3.7.5 — Pricing Manager feature parity audit

### Output

A checklist at `tasks/PRICING_MANAGER_PARITY_AUDIT.md` that gates Story 3.8.7 (legacy `/pricing-manager` decommission).

Inventory of 10 legacy capabilities mapped to Catalog Manager equivalents:

- 8 marked **Done — wrapped** (existing component, new entry point on Catalog Manager)
- 1 marked **Done — extended** (margin bands extended to Trailers Table)
- 0 marked **Dropped**
- 2 marked **Carried forward — same surface** (Delivered Deals + Stock Management live on module pages, not Catalog Manager landing — no migration needed; decommissioning `/pricing-manager` won't affect them)

Plus 2 net-new capabilities (Catalog Audit panel; per-vendor read views) called out as additions, not parity items.

### Decommission gate

The checklist is the gate for retiring `/pricing-manager` in a future release. Code is ready any time the operator-side checks (bookmark sweep, external docs, telemetry sprint) are done.

---

## v1.13 NOT in scope (deferred to v1.14)

- **11.3.3 — Cutover + verification + decommission** — same NSM-Hub service-account block as 11.3.2 (deferred from v1.12). All NSM-Hub migration work waits on access.

---

## Files Changed

**New:**
- `src/components/trailers-table-view.tsx`
- `src/components/inline-edit-cell.tsx`
- `tasks/PRICING_MANAGER_PARITY_AUDIT.md`
- `tasks/RELEASE_NOTES_v1.13.0.md`
- `tasks/USER_GUIDE_v1.13.0.md`

**Modified:**
- `src/lib/release-schedule.ts` — `'v1.13': { shipped: true }`
- `src/components/service-quote-detail-sheet.tsx` — Send button + email pipeline + first-send auto-lock
- `src/app/(app)/pricing-manager/page.tsx` — Trailer Brand vendors route to `<TrailersTableView />`
- `CLAUDE.md` — v1.13 row added

---

## Required after merge

- **Confirm Firestore rules** allow read+write on the new send-related paths used by the service-quote send button:
  - `organisations/{orgId}/serviceQuotes/{quoteId}/sentEmails/{sendId}` — existing org-doc rules cover this
  - `organisations/{orgId}/serviceQuotes/{quoteId}/auditLog/{eventId}` — already covered
  - `mail/{id}` — already exists from v1.8
  No new rules deployment required.

- **NEXT_PUBLIC_EMAIL_SEND_ENABLED** — confirm the env var is set to `true` in prod (it is per v1.11 release) before announcing the service-quote send button. The button degrades gracefully (tooltip explaining) when off.

- **Story 3.8.7 — legacy /pricing-manager decommission** — gate is the operator-side checklist in `tasks/PRICING_MANAGER_PARITY_AUDIT.md`. Code is ready.

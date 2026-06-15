# HelmLogic — User Guide v1.13.0

**For:** Org admins · service writers · catalogue admins
**Companion to:** `RELEASE_NOTES_v1.13.0.md`

v1.13 is the back half of the joint v1.12 + v1.13 push. v1.12 shipped the Service Quote detail surface + PDF; v1.13 plugs that PDF into the email pipeline and finishes the catalogue read-view family with the Trailers table + click-to-edit cells.

---

## At a glance

| What you want to do | Where | Section |
|---|---|---|
| Send a service quote to a customer via email | Service Quote detail sheet → Send to customer | §1 |
| View every trailer in a brand catalogue with pricing + spec audit | Catalog Manager → pick a Trailer Brand vendor | §2 |
| Edit a trailer's name / ATM / Tare / Wheels / Cost / Sell in-place | Trailers Table → click the cell | §3 |
| Read the Pricing Manager parity audit | `tasks/PRICING_MANAGER_PARITY_AUDIT.md` | §4 |

---

## 1. Send service quote via email

The Send button next to Download PDF on the Service Quote detail sheet (v1.12) is now wired.

### What clicking Send does

1. Renders the service-quote PDF (same content as Download)
2. Uploads it to Firebase Storage under your org
3. Writes a `mail/{id}` doc — the Trigger Email Firebase extension picks this up and dispatches the email via SMTP
4. Writes an audit record at `organisations/{orgId}/serviceQuotes/{quoteId}/sentEmails/{sendId}` with recipient + sender + PDF storage path
5. Bumps `quote.sentCount` + sets `quote.lastSentAt`
6. **On the first send**, the quote auto-locks — `lockedReason: 'sent'` + `lockedAt`. The status flips from `draft` → `sent` if it was draft. Once locked, you can't edit the customer / vessel / notes fields without forking a new version (v1.14+).
7. Two audit-log entries are written: one for the send, one for the auto-lock (if first send)

### Gates

The Send button **disables** with a tooltip in two cases:

- **`NEXT_PUBLIC_EMAIL_SEND_ENABLED` is not `true`** — feature flag for the whole send pipeline. Same flag as the boat-quote send (v1.8). Per your prod config (v1.11), this is already on.
- **No customer email on the quote** — fill in the Email field in the Customer · Vehicle section first.

### What the customer receives

Today (v1.13 minimal):

- **Subject:** `Service quote from {your org name}`
- **Body:** Hi {customer name}, Please find your service quote attached. Kind regards, {org name}
- **Attachment:** the PDF you'd get from Download, named `service-quote-{quote-number}.pdf`

The v1.14 polish ships:

- Operator-edit recipient / CC / BCC at send time
- Template-driven subject + body (same as the v1.8 boat-quote SendQuoteDialog)
- Send-history view inside the detail sheet — see who sent, when, to whom, click to re-download the historical PDF

Until then: if a customer's email needs personalisation beyond the minimal body, use Download PDF + attach it to your own outbound email until v1.14 lands.

---

## 2. Trailers Catalogue read-view

### Where to find it

**Catalog Manager → pick a Trailer Brand vendor row.** The workspace mounts the Trailers Table automatically when the vendor type is Trailer Brand.

### What you see

A search bar at the top, totals badges next to it (e.g. "32 trailers · 28 priced · 4 missing pricing"), then a table:

| Column | What it shows |
|---|---|
| **Image** | Thumbnail or placeholder |
| **Code** | Model code (monospace) |
| **Name** | Model name |
| **ATM (kg)** | Aggregate Trailer Mass |
| **Tare (kg)** | Dry weight |
| **Wheels** | Wheel size |
| **Cost** | Dealer cost (rose highlight when missing) |
| **Sell (ex GST)** | Retail (rose highlight when missing) |
| **Margin** | Auto-calculated; red < 15% · amber < 25% · emerald >= 25% |
| **Rego** | Link to Rego module (state-specific calc happens at quote time from ATM) |

Inactive trailers render at reduced opacity but stay in the list. Search filters by name, code, or supplier.

### Per-state rego — why it's a link not a column

State-specific rego is calculated **at quote time** from the trailer ATM using the v1.4 Rego module. Showing per-state numbers without a target jurisdiction would either be wrong (one state's number labelled as the universal) or noisy (40+ columns one for each state's bands). The Rego column links to the module — go there if you want to see the bands.

---

## 3. Inline editing

### How to use it

Any pricing or spec cell with a hover affordance can be clicked to edit:

1. Click the cell — Input replaces the read view, value pre-selected
2. Type the new value
3. **Tab** or **Enter** to commit · **Esc** to cancel
4. Tiny spinner pip appears while saving · toast confirms on success
5. Validation error (e.g. "Not a number", "Positive number") shows below the input

### What's editable today

On the **Trailers Table** (Story 3.7.4 + 3.8.1 + 3.8.2):

- **Name** (text)
- **ATM** + **Tare** (number, positive-validated)
- **Wheels** (text)
- **Cost** + **Sell** (currency, positive-validated)

Writes go directly to `data-warehouse/{vendorId}/trailers/{trailerId}` — the same path the trailer module editor writes to. No staging / no preview — what you type is what saves.

### Coming next (v1.14)

The InlineEditCell component is generic — same pattern will be retrofitted into:

- **Boats Table** (Story 3.7.2) — pricing + spec editing per variant
- **Motors Table** (Story 3.7.3) — pricing + HP / shaft / control editing

v1.13 ships inline editing on Trailers only to keep the merge tight. Stories 3.8.1 + 3.8.2 require at least one table with inline editing live, which this satisfies. The remaining table retrofits are a v1.14 polish item.

### Permissions

Anyone with catalog-edit access can use inline editing. If your org wants to gate it (e.g. only managers can edit pricing), the `can_override_margin` flag (v1.11) is the existing gate — extending it to inline editing is a v1.14 polish.

---

## 4. Pricing Manager parity audit

This is operator-facing — read it before any conversation about decommissioning the legacy `/pricing-manager` route.

`tasks/PRICING_MANAGER_PARITY_AUDIT.md` is a checklist of every capability the legacy Pricing Manager surface had, mapped to where the equivalent now lives on Catalog Manager.

**Summary:**
- 10 legacy capabilities — all have an equivalent (most wrapped, a few extended, none dropped)
- 2 net-new capabilities (Catalog Audit panel + per-vendor read views) called out as additions
- Decommission of legacy `/pricing-manager` is **code-ready** — gated on operator-side checks (bookmark sweep, telemetry sprint) which are out-of-band of the codebase

If your team is asking "can we retire `/pricing-manager`?", point them at this doc.

---

## What this release did NOT ship (deferred to v1.14+)

- **NSM-Hub cutover (Story 11.3.3)** — same NSM-Hub service-account block as 11.3.2 (deferred from v1.12). All NSM-Hub migration work waits on access.
- **Inline editing on Boats Table + Motors Table** — InlineEditCell component is generic; the retrofit is v1.14 polish.
- **Full Send polish on service quotes** — operator-edit recipient / CC / template / send-history — v1.14.
- **Customer-detail page** — v1.12 schema is live; the UI surface is v1.14.
- **Legacy `/pricing-manager` retirement** — code-ready; gated on operator checks per §4.

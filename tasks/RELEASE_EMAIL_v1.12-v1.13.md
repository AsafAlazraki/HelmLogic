# Release announcement — v1.12 + v1.13 (joint push)

**Subject:** HelmLogic v1.12 + v1.13 are live — Service Quoting end-to-end + Trailers catalogue + inline editing

---

Team,

**HelmLogic v1.12 and v1.13 just shipped to production in a joint merge.** Two releases, eight stories, one PR. The headline is **Service Quoting end-to-end** — Operations + Parts catalogues (v1.10) flow into the create wizard (v1.11), which flows into v1.12's detail view + PDF, which flows into v1.13's send-via-email pipeline. One epic, four releases, complete.

## What's in v1.12

- **Service Quote detail surface** — click any card on the Service Quote Dashboard and a side sheet opens with the full quote: customer / vehicle / estimate type / operations / parts / notes / totals. Edit on blur.
- **Status state machine** — strict transitions (draft → sent → accepted → in-progress → complete; cancel from any active state; complete/cancelled lock read-only). Every status change writes an audit-log entry with the actor + from/to status.
- **Customer-facing service-quote PDF** — Download button on the detail sheet renders a clean PDF (deep navy + gold rule, matches the boat-quote PDF) with operations cards + parts list + GST-inclusive grand total. Dynamically imported so it only loads when you hit Download.
- **Customer schema redesign** — plumbing for the v1.14+ CRM features (source, lifecycle stage, primary/secondary buyer, trade-in ref, documents, notesCount). Existing customer docs migrate cleanly; the UI surfaces for the new fields land in v1.14.

## What's in v1.13

- **Send service quote via email** — Send button next to Download on the detail sheet. Renders PDF → uploads to Storage → writes `mail/{id}` for the Trigger Email extension → audit-log entries → first-send auto-lock. Gated on `NEXT_PUBLIC_EMAIL_SEND_ENABLED` and customer-email-present, with tooltips explaining why the button is disabled when needed.
- **Trailers Catalogue read-view** — the third entry in the catalogue read-view family (Boats + Motors + Trailers). Pick a Trailer Brand vendor on Catalog Manager and you get every trailer in a sortable table: ATM · Tare · Wheels · Cost · Sell · Margin (auto-banded red/amber/emerald) · Rego link. Missing-pricing rows highlight in rose. Search by name / code / supplier.
- **Inline editing** — click any pricing or spec cell on the Trailers Table and an inline input appears. Tab/Enter commits, Esc cancels, save on blur, inline validation, toast per write. Boats Table + Motors Table get the same retrofit in v1.14 polish.
- **Pricing Manager parity audit** — `tasks/PRICING_MANAGER_PARITY_AUDIT.md` is a checklist of every capability the legacy `/pricing-manager` had, mapped to where the equivalent now lives on Catalog Manager. 10 capabilities — all covered (most wrapped, a few extended, none dropped). Gates the future decommission of the legacy URL.

## What's NOT in this push

**NSM-Hub migration tooling (Story 11.3.2) and cutover (Story 11.3.3)** — both blocked on the `nsm-service-quotation` read service-account. Designs live in `tasks/nsm-hub-merge-plan.md`. Both stories have been retargeted from v1.12/v1.13 to v1.14 so the planning surface reflects reality.

## How to try it

- **Service Quotes** — open any service module (Manage → Modules → service-typed module). Create a quote, click the card, drive the state machine, hit Download, hit Send.
- **Trailers Table** — `Catalog Manager` (formerly Pricing Manager) → pick a Trailer Brand row (Redco / Tinka / etc.). Click any cell on the table and try inline editing.
- **Customer schema** — nothing visible yet. The fields are plumbed; the v1.14 customer-detail page is where you'll see them surface.

## Where to find more detail

- Full changelog: `tasks/RELEASE_NOTES_v1.12.0.md` + `tasks/RELEASE_NOTES_v1.13.0.md`
- Operator runbooks: `tasks/USER_GUIDE_v1.12.0.md` + `tasks/USER_GUIDE_v1.13.0.md`
- Parity audit: `tasks/PRICING_MANAGER_PARITY_AUDIT.md`
- In-app: HL → Release Notes + Feature Tracking → How to use

Big push. Have a play and let me know what breaks.

Cheers,
Asaf

---

_Shipped via Pull Request [#41](https://github.com/AsafAlazraki/HelmLogic/pull/41)._

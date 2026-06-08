# Release announcement — v1.11 (Fit-Up Release)

**Subject:** 🚢 HelmLogic v1.11 is live — Fit-Up, the audit trail, and a sharper proposal PDF

**To:** team@northsidemarine.com.au (or your distribution list)
**Cc:** Mark McWilliams, Colin Kean, Bill Hull, Oren Alazraki
**Attachments:** `bm-checklist.pdf` (CL380 sample) · `bm-checklist-sport.pdf` (SP600/SP560 sample)

---

Team,

**HelmLogic v1.11 just shipped to production.** This is the Fit-Up release — the biggest single addition to the quote builder since v1.4 trailers. It also closes out a pre-launch hardening pass driven by Mark's "accurate · audited · beautiful" brief.

Below is what's changed for you. Two sample PDFs are attached so you can see the output before you build your first v1.11 quote.

## 🛠 New on Step 5 — Fit-Up & Rigging

The quote builder now has a proper **Fit-Up & Rigging** section on Step 5 alongside Dealer Fit. Three things to know:

- **Tier package cards** — every quote shows a **SIMPLE** / **MEDIUM** / **COMPLEX** package card with a price. One click adds the bundle. The system suggests a tier based on motor HP (under 50 HP = Simple, 50–150 = Medium, over 150 = Complex), but you can pick any.
- **Per-item controls** — once items are in the panel you can change the quantity, override the price for this quote, or add an operator-only note.
- **Workshop status pill** — every quote with fit-up now has a status pill on the proposal-view header (pending / scheduled / in-progress / complete). This is independent of the sales lifecycle, so workshop can mark a build complete without it forcing the sales side to change state.

The customer PDF still rolls everything up to a single **"Fit-up & Rigging"** line per the product decision — customers don't see every bolt and bracket, just the total.

## 📊 Manage → Fit-Up Catalog (admin)

Org admins can now author the master fit-up catalog directly:

- **Items + Packages** sub-tabs — items have name, tier, cost, sell price, category, customer description, image, and optional assignment scope (modules / brands / ranges / models / variants)
- **Bulk import / export** via CSV — upsert by name, won't clobber operator edits
- **Packages** — name a bundle (e.g. "Coastal Setup") with member items; salesperson clicks one card on Step 5 to add all
- **Add / Edit dialog redesigned** for the launch — four labelled sections (Basics · Customer-facing · Internal · Assignment scope), tier picker as colour-coded pills, image preview at usable size

## 📄 Sharper customer PDF

Two things you'll notice on the proposal PDF:

- **Investment Summary now reads like a real itemised quote** — Standard Inclusions, Factory Options, Motor Accessories, Trailer Options, and Dealer Fit lines indent under their parent (Vessel / Propulsion / Trailer) with a smaller font and an L-tick. The maths is unchanged; it just reads cleanly.
- **Trailer image is back** — was suppressed earlier because some catalog entries had vendor logos slipping through. The new fallback prefers the trailer photo, then the catalog cover, and only falls back to a placeholder if nothing's set.
- **Motor image** — also tries the `SummaryImage` field so motors uploaded via the catalog UI render properly even when the Yamaha CDN blocks the source.

Check the two attached PDFs (Classic CL380 + Sport SP600/SP560) for what the customer sees.

## 🕵️ Auditability — who did what, when

Two unified views answer "who did what when" without anyone needing to look at Firestore:

- **Activity tab** on every proposal — every lifecycle event (created · finalised · sent · locked · forked · discounted · personalised · lifecycle changed · scenario created · fit-up status updated) with actor + timestamp + summary
- **Catalog Audit** on Manage → Catalog Manager → History — chronological feed of every xlsx import AND every Fit-Up item / package add / edit / delete, with field-level diff (rose strike-through = before; green = after)

If a price ever looks wrong on a quote, the audit answers two questions in two clicks: **who set it on the catalog** (Catalog Audit), and **who applied it to the quote** (Activity tab on the proposal).

## ✅ Mark's 8-item checklist — 11/11

The pre-launch pass tested every item on Mark's email end-to-end on two ranges (CL380 + SP600). All 11 ticks green. Headline: proposal sections + customer name placement + no-trailer-on-hull + FFO + motor + rigging + trailer + DFOs + rego (Step 1 picker + PDF) + fit-out tiers.

## 🚧 Not in v1.11 (coming in v1.12)

A few things are in the codebase but parked for the v1.12 headline so they get the attention they deserve:

- **Service-quote flow** (Epic 11.2)
- **Motors Table** catalogue read-view
- **Suggestion Approval Queue**
- **Auto-classification rule engine** (the simple motor-HP heuristic stays for now)

## 📖 Want more detail?

- Operator walk-through: `tasks/USER_GUIDE_v1.11.0.md` (in the repo) — has a §0 happy-path that takes a salesperson through every new surface in order
- Full changelog: `tasks/RELEASE_NOTES_v1.11.0.md`
- Issues / feedback: `/feature-tracking` in the app, or reply to this email

Big release. Have a play and let me know what breaks.

Cheers,
Asaf

---

_Shipped via Pull Request [#40](https://github.com/AsafAlazraki/HelmLogic/pull/40)._

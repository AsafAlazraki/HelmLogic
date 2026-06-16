Subject: HelmLogic — v1.12 → v1.16 shipped tonight (52 stories) + v1.17 already underway this week

Hi team,

Big drop tonight: we shipped **v1.12 through v1.16 as a single joint release** to main — **52 stories across 5 versions**.

## What landed

**v1.12 — Service Quoting end-to-end (3 stories)**
The full service-quote flow now goes view → edit → status-lifecycle → customer-facing PDF, with the new `ServiceQuoteDetailSheet`, strict state machine, and dynamic-loaded `@react-pdf` rendering pipeline. Plus the v1.12 Customer Schema redesign — `source`, `lifecycleStage`, `primaryBuyer`/`secondaryBuyer`, `tradeIn`, `documents[]`, `notesCount` — all backwards-compatible with existing customer docs.

**v1.13 — Send + Catalogue polish (5 stories)**
Send-service-quote-via-email reuses the v1.8 send pipeline (render → upload → mail → audit → auto-lock on first send). New Trailers Table read-view in Catalog Manager. Inline editing wired into the Trailers Table for pricing + spec fields via the new generic `InlineEditCell`. Pricing Manager parity audit documented for the decommission gate.

**v1.14 — Catalogue polish round (7 stories)**
Org-level pricing overrides surface inline on the Trailers Table with a Vendor/Org toggle + OVR badge. Per-vendor imports moved under catalog tabs. Column-header help tooltips on every Motors + Trailers column with one-line spec-domain explanations. Per-tab CSV export on Motors + Trailers. Optional features drill-down editor on the BoatsTable expanded row. Per-module Fit-Up tab + customer-PDF Fit-Up summary line.

**v1.15 — Suggestion audit + Marketing copy + Rule engine (3 stories)**
Crowdsourced Suggestions now write a structured audit log on every approve/reject. Marketing Copy Editor UI on the BoatsTable. **Full fit-up tier auto-classification rule engine** — new `fitUpClassificationRules` collection with admin UI + resolver, replacing the v1.11 motor-HP heuristic.

**v1.16 — Wide polish + 34-ticket backlog drain**
A backlog-sweep release: 21 user-reported polish items shipped as code (Hypalon labelling, inc-GST sub-lines, no-trailer pill, trailer subtotal row, dealer-fit headings + expander + model-specific filter, archive view on Recent Proposals, larger images + logos, Show/Hide option prices, improved Step header, cover-image + marketing-rich editors, motor + dealer-fit compat editors, photo curation, inventory badge). 3 more tickets stale-flipped after we confirmed the code shipped earlier in v1.11. 10 tickets resolved as product decisions or docs — all consolidated in `tasks/v1.16-DECISIONS.md`.

Plus a PDF-quality close-out pass: **blank-page bug killed** (fixed footer no longer spawns a footer-only page), **Investment Summary tightened** for ~50% more rows per page, and **smart-continue mode** for long content blocks so short narrative blocks stay atomic but long ones flow naturally across pages.

## Submitted column drained

22 backlog items were sitting in the Roadmap's Submitted column with no target release. We pulled them all in, **audited each one against "is this a platform feature or an operator concern"**, and spread what's real across the forward releases:

- **v1.18** picked up 3 (catalog polish — Edit Stock Item, Export Data brand→range→model, 2.1.1 Structured Price Sources, Receipt PDF branding).
- **v1.21** picked up 2 (sales-ops / Epic 8.1 — Pending Units, Date-of-creation / order date).
- **v2.0** picked up 5 (launch-prep — training plan, Catalog Manager admin training session, catalog backfill, comms plan, training scheduling per role).
- **v2.2** kept 1 (Shopify API setup).
- **10 dropped**: 4 dupes/garbage + 6 operator concerns / how-to questions that are configuration of the platform we've already built, not platform features for us to build (e.g. "Dealer Fit options are the same on all models" — that's the admin attaching options per model via the dealer-fit compat editor we shipped in v1.16; "How to delete a section in Catalog subsections" — a how-to question, not a feature).

## v1.17 already underway — releasing this week

We're not pausing. **v1.17 is already in build** and is on track to ship before the end of this week. Theme: **"Catalog editing at scale + bug sweep"**. The cycle covers:

- **Data-ops (7 stories)** — multi-row select + bulk price adjustment, paste-from-spreadsheet with diff preview, cross-tab catalog filter, per-vendor importer plug-in registry, internal pricing-derivation layer, boat-trailer compat editor, per-org exchange-rate editor.
- **Bug sweep (5 stories)** — HL save error, RU200KAM $76.82 delta, Trailer Catalog data gap, NSM customer reconciliation, delivered-deals dashboard placement decision.
- **NSM-Hub parallel track (2 conditional)** — 11.3.2 + 11.3.3 ship if Mark unblocks the `nsm-service-quotation` service-account this cycle, otherwise slip to v1.18 without expanding scope.

Plan doc: `tasks/v1.17-plan.md`.

## What stays gated

- Email send still gated on `NEXT_PUBLIC_EMAIL_SEND_ENABLED` — flip after stakeholder approval on sender domain + SendGrid setup.
- SharePoint sync still gated on `NEXT_PUBLIC_SHAREPOINT_ENABLED` — flip after Azure app registration + per-org `sharePointConfig`.
- NSM-Hub migration tooling (11.3.2 / 11.3.3) still blocked on the service-account.

## What I need from you

- **Mark / Ben** — sign-off on the v1.12–v1.16 user-facing surfaces over the next 24 hours so we can roll any escaped issues into v1.17 close-out.
- **Mark** — any update on the `nsm-service-quotation` read service-account? It's now blocked v1.11 → v1.14 → v1.16 → v1.17, and I'd love to land it before it slips a fourth time.
- **Sales team** — please run a real quote through the new PDF (Investment Summary should look noticeably denser, no more blank page 5) and flag anything that reads odd.

Release notes + per-version user guides for every cycle land in `tasks/RELEASE_NOTES_v1.12.0.md` through `RELEASE_NOTES_v1.16.0.md` and `USER_GUIDE_v1.12.0.md` through `USER_GUIDE_v1.16.0.md`. They're rendered into the in-app `/feature-tracking` Release Notes tab too.

## Quick note on tomorrow's meeting

I've got a customer kick-off engagement session running right before tomorrow's catch-up with BFJ. I'll do my best to make it on time — apologies in advance if I'm a couple of minutes late.

Cheers,
Asaf

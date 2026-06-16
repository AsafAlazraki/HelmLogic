# v1.12 + v1.13 + v1.14 + v1.15 + v1.16 — joint release

**33 stories shipped · 2 NSM-Hub stories deferred to v1.17 (still service-account blocked) · 10 v1.16 tickets resolved as decisions / docs · 3 v1.16 tickets confirmed already-shipped in v1.11.**

## What's in

### v1.12 — Service Quoting end-to-end (3 stories)
- **11.2.2** Service-quote view/edit + status lifecycle — new `ServiceQuoteDetailSheet`, strict state machine, `estimateType` selector, save-on-blur, locked-quote gating
- **11.2.3** Service-quote PDF — new `service-quote-pdf.tsx` on the `@react-pdf` pipeline, dynamic-imported from the detail sheet
- **3.4.1** Customer Schema Redesign — shared `Customer` interface with optional `source`, `lifecycleStage`, `primaryBuyer`, `secondaryBuyer`, `tradeIn`, `documents[]`, `notesCount`

### v1.13 — Send + Catalogue polish (5 stories)
- **11.2.4** Send service quote via email — Send button on the detail sheet, render → upload → mail/{id} → audit + auto-lock-on-first-send
- **3.7.4** Trailers Table read-view — new component mounted via Catalog Manager when vendor type is Trailer Brand
- **3.7.5** Pricing Manager parity audit — `tasks/PRICING_MANAGER_PARITY_AUDIT.md`
- **3.8.1 + 3.8.2** Inline edit pricing + spec fields — new generic `InlineEditCell` wired into Trailers Table

### v1.14 — Catalogue polish round (4 stories)
- **3.7.6** Org-level pricing overrides inline on Trailers Table (Vendor / Org toggle + OVR badge)
- **3.7.7** Migrate per-vendor imports under catalog tabs — MotorsTable Import data sheet
- **3.9.1** Optional features editor (drill-down panel per model) on BoatsTable expanded row
- **9.2.1** Fit-up tab on each module page — new `ModuleFitUpTab`, mounted on Yamaha workspace

### v1.15 — Suggestion audit + Marketing copy + Rule engine (3 stories)
- **3.3.1** Crowdsourced Suggestions with Audit — approve/reject writes audit-log to `features/{id}/auditLog`
- **3.4.2** Marketing Copy Editor UI — `MarketingCopyPanel` on BoatsTable
- **9.3.1** Full fit-up tier auto-classification rule engine — new `fitUpClassificationRules` collection + admin UI + resolver

### v1.16 — Wide polish + 34-ticket backlog drain
**21 code-shipped:** E7fCW6Oh + mqXYkQbT (inc-GST + cents), lXRbKtH8 (Hypalon), bvAyUQVR + Qt0VHo4M (larger logos + images), 11E75Jyz (Trailer Spec pricing removed), NWi9EetL (Trailer Subtotal), XydsZkX3 (Show/Hide option prices), VyZ4AonV (Dealer Fit headings), gFQrcADO + ltaY5TPd (Remove quote + Archive), ZidKJczh (Dealer Fit model-specific), Kw1Y2Gww (No trailer pill), rI21WRhH (Dealer fit expander), pcDkqAXa (improved Step header), 3.8.3 + 3.8.4 (Cover image + Marketing rich editor), 3.9.2 + 3.9.3 (Motor + dealer-fit compat), 3.4.3 (Photo Curation), 3.8.1 (inventory badge)

**3 stale-flip:** 9.2.2 (already in v1.11), VDUeX9zQ (trailer image — v1.11 Phase D), e6twmpiT (colour image + material — v1.11 Phase D)

**10 decisions/docs:** 8E5S6tV6, Cl0bRhFo, N29OaRni, 9Y7UnGZJ, hSPmTAy5, uUGUfN38, 3.8.7, PvmKgeuC, RT0OwAM1, 2eTb7FTN — all in `tasks/v1.16-DECISIONS.md`

### PDF polish (committed during v1.16 close-out)
- **Blank page bug fix** — InnerFooter is now `position: absolute` + `fixed`, removing the inline flex-flow that pushed it past the page edge and spawned a footer-only blank page
- **Investment Summary tightening** — reduced row padding, smaller fonts on indented sub-items, ~50% more rows per page
- **Smart-continue mode for content blocks** — short blocks (< 600 chars) stay atomic; long blocks flow naturally across pages (title + first paragraph still together)

## NOT in this push

- **11.3.2 + 11.3.3** NSM-Hub migration tooling — still blocked on `nsm-service-quotation` service-account; deferred to v1.17

## Release flag flips (locally)
- `RELEASE_WINDOWS['v1.12'..'v1.14'].shipped = true` (already in release-schedule.ts)
- v1.15 + v1.16 — will be flipped via a follow-up Firestore script after merge (mirror of `scripts/ship-v112-v113-features.py`)

## Docs

- `tasks/RELEASE_NOTES_v1.12.0.md` + `USER_GUIDE_v1.12.0.md`
- `tasks/RELEASE_NOTES_v1.13.0.md` + `USER_GUIDE_v1.13.0.md`
- `tasks/RELEASE_NOTES_v1.14.0.md` + `USER_GUIDE_v1.14.0.md`
- `tasks/RELEASE_NOTES_v1.15.0.md` + `USER_GUIDE_v1.15.0.md`
- `tasks/RELEASE_NOTES_v1.16.0.md` + `USER_GUIDE_v1.16.0.md`
- `tasks/v1.16-DECISIONS.md` — 10 ticket decisions consolidated
- `tasks/V14-V16_BUILD_TRACKER.md` — live status board
- `tasks/PRICING_MANAGER_PARITY_AUDIT.md` — Decommission gate for legacy `/pricing-manager`

## Test plan (current state)

- [x] Local `npx next build` passes
- [x] Smoke spec self-skipping checks where prereq data isn't on test org
- [ ] Live BM checklist run on dev URL once App Hosting catches up
- [ ] Live v1.14-v1.16 smoke spec on dev URL
- [ ] Fresh CL380 + Sport SP600 PDFs proving v1.16 PDF polish

## Required after merge

- Redeploy `firestore.rules` to prod with the new path: `organisations/{orgId}/fitUpClassificationRules/{ruleId}` allow read/write if isSignedIn
- Flip v1.15 + v1.16 Firestore feature statuses to `shipped` (script lands separately)

https://claude.ai/code/session_01N8htvKjvX1mxB76joJ9QQg

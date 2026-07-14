# HelmLogic — Release Notes v1.33.0

**Date:** 2026-07-14 · **Branch:** `claude/app-overview-wKiZ1` → `main`

## Release Stats

- **Epic 14 — Usage & Activity Reporting shipped end-to-end**: client telemetry engine + two new Firestore collections + a new Reporting tab with filters and PDF export, proven live in production after the rules publish
- **26 submitted-backlog items dispositioned**: 13 closed as shipped-with-evidence (all of Mark's), 12 built this cycle, 1 held for a product ruling
- **11 operator asks built** from the submitted backlog (Bill's list) — quote flow, customer PDF, catalog, rego module
- **The quote flow is now 7 steps**: a dedicated ADMINISTRATION step consolidates rego, warranty, trade-in, delivery, insurance, finance and licence upload
- **1 production rules publish** (telemetry paths + locked-quote soft-delete + `isLocked` hardening), verified live against real quotes after publish
- **Gates**: TypeScript clean · FFR-33 SP560 proof GREEN on the new 7-step flow (**$103,731 exact**, customer PDF re-rendered) · usage-reporting browser smoke green (sessions AND events captured) · 58 files, +1,917/−508 vs v1.32

## 1. Usage & Activity Reporting (Epic 14, story 14.1.1) — own sidebar page

The receipts system: who actually logs in, how long they are genuinely active versus idle with the tab open, and **every tiny thing they do and don't do** — filterable, traceable per session, and exportable. Lives at **`/usage` as its own sidebar item** (management-gated like Settings), deliberately separate from `/reporting` so opening it never pays the Business dashboard's heavy cross-module queries.

### Telemetry engine (`src/lib/telemetry.ts` + `telemetry-provider.tsx`) — extreme capture
- One session doc per app-open at `organisations/{orgId}/activitySessions/{id}` — startedAt / lastSeenAt / activeMs / idleMs. "Active" = tab visible AND pointer/keyboard/scroll input within the last 60s; visible-but-silent time accrues as idle; hidden tabs accrue neither.
- Batched events at `organisations/{orgId}/activityEvents/{id}` across **seven kinds**:
  - `nav` — every route landed (including the fresh-load landing route)
  - `dwell` — every route left: seconds on page + max scroll depth
  - `click` — **every click**, anywhere: interactive elements report their label, dead-zone clicks report the nearest readable text
  - `input` — every form field focused or changed, identified by its label/placeholder/name — **values are never captured** (passwords excluded entirely)
  - `action` — explicit domain events via `logAction()`
  - `visibility` — tab hidden/visible, window focus/blur
  - `error` — uncaught JS errors + unhandled promise rejections, message + source
- 15s flush cadence, 40/batch, flush-on-tab-exit; everything fire-and-forget — a failed telemetry write can never break or slow the app.
- **Test-account tagging**: sessions and events from the shared test login (billh) are stamped `isTestAccount`. When the dedicated test login changes, update `TEST_ACCOUNT_EMAILS` in `telemetry.ts` — history keeps its stamps.
- Fix landed mid-cycle: the landing nav event used to be dropped on every fresh page load (the provider logged it before the org profile resolved); the engine now records the landing route itself at start.

### Reports (`/usage` — Usage & Activity)
- Filters: date range (7/30/90 days — defaults to 7 for a fast first paint), person, event kind, free-text search, and an **Include test accounts** switch (off by default — Bill's testing does not pollute the numbers).
- KPI tiles (active users / sessions / active hours / idle hours / events / **errors seen**), a daily active-vs-idle bar chart, and the **"Who actually uses it"** leaderboard (click a row to focus that person).
- **Top pages** — views + total time-on-page per route, from the dwell stream.
- **Coverage matrix** — people × app areas (Dashboard, Quoting, Customers, Pipeline, Contracts, My Work, Catalog, Reporting, Feature Tracking, Settings…): a green count where they've been, a **red dash where they have never gone** — the "they clearly don't use it" receipt.
- **Session drill-down** — every session with person, start, length, active/idle minutes, event count and device; click one to expand its **full second-by-second trace**.
- **Event explorer** over the raw stream, and **Export PDF** rendering the current filtered view on the same navy/gold @react-pdf pipeline as the customer documents.

### Proof
The browser smoke is its own telemetry subject: it signs in, browses, waits out a flush cycle, then opens `/usage` and asserts its own freshly-captured session AND events render, then exports the PDF. Evidence: `tasks/test-evidence/usage-reporting/`.

## 2. Rules publish (applied to production mid-cycle)

Three changes, published by Asaf and then verified live:
- **`activitySessions` + `activityEvents`** under organisations — telemetry on; deletes admin-only so nobody can scrub their own usage history.
- **`onlySoftDeleteFieldsChanged()`** joins the locked-quote update disjunction — a sent (locked) quote can now be removed from lists (`deletedAt`) and restored, which was Mark's "can't remove a quote from my list".
- **`resource.data.get('isLocked', false)`** hardening — quotes created before the lock feature have no `isLocked` field, and the raw field access ERRORS on missing keys, silently denying legitimate draft updates. The check is now total.

Post-publish verification ran as the normal signed-in user against live rules: soft-delete on a locked quote allowed, restore allowed, content edits still blocked (403), soft-delete mixed with a content edit blocked, lifecycle transitions still allowed, and a real no-`isLocked` quote took a normal update.

## 3. Mark's submitted items — all closed

Every one of Mark's 13 submitted backlog items was either proven already-shipped with evidence or fixed this cycle. The fixes:
- **Quote soft-delete works everywhere** (including sent/locked quotes — rules above), and quote lists filter `deletedAt` consistently (`/modules/[id]/proposals`, `/my-work`).
- **Fit-up tier packages toggle off and are mutually exclusive** — picking Medium releases Simple; clicking an all-on package again clears it.
- **PDF control codes** — the TipTap→PDF converter handles the full inline tag set + numeric/hex HTML entities (zero-width characters dropped), so authored content blocks can't leak raw codes onto the customer PDF.
- **"otherother" category dedupe** — Select options normalise case/whitespace before deduping.
- **No price until the boat is real** — the running price card hides until material + colour resolve to an actual variant, and Step 1 hard-gates on it (destructive toast).
- **Catalog tables scroll properly** — sticky headers + contained scroll on Motors / Boats / Trailers tables.
- **Engine thumbnails render** — motor images resolve through the FFR-30 image chain in the workspace list and config detail; broken images hide instead of leaving voids.
- **Double-GST display fix** — dashboard consumers prefer `finalPriceIncGst`/`totalPriceIncGst` before falling back to ex × 1.1, so display-sheet-v2 quotes read correctly everywhere.

## 4. Bill's submitted items — 11 built

1. **Dealer-fit: remove one item at a time** — per-selection Remove button on the Catalog dealer-fit rows (was Clear All only).
2. **Pre-Rig Information section removed** from the Motor step.
3. **PDF: Factory Options get their own heading** — Standard Inclusions and Factory Options are now split by mini divider headings inside the Investment Summary instead of running together under Base Vessel.
4. **PDF: "Dealer" → the organisation's name** — the customer PDF never says "Dealer": the band reads "Northside Marine Accessories & Preparation", dealer-fit sub-labels carry the org name, and the two sections explain themselves ("accessories supplied & fitted" vs "workshop installation & rigging" — Bill's what's-the-difference question answered on the page).
5. **PDF section drag-to-reorder repaired** — a browser repro proved the drag worked but only on the 14px grip icon; grabbing the row body (what everyone naturally does) did nothing and read as "locked". The whole row now drags; the 5px activation distance keeps plain clicks opening the editor.
6. **Rego sticker pricing in the Rego module** — `costExclGst` on rego types (form + display), a `sticker`/`fee` kind in the Applies To picker, and Bill's four sticker rows seeded on `qld-transport` and verified by read-back: Custom $150/$90 · Standard White $60/$25 · Standard Black $60/$25 · Tender-To $180/$110.
7. **Larger option-card text** — option names 10px → 14px, colour and price up a step (the Four Winns comparison).
8. **Dealer-fit part images** — per-selection image upload (Storage) with the thumbnail shown in the catalog rows and preferred by the quote-flow Step-5 cards (the Garmin head-unit case: MPF rows with no image link).
9. **Factory Configurator on every brand editor** — the configurator (CREATE CATEGORY + per-category option groups) only existed inside the Highfield editor; Stacer / Stabicraft / Surtees / Jeanneau had no optional-features surface at all, so headings like "Paint Options" could not be authored for those brands. Extracted as `FactoryConfiguratorSection` and mounted in all five editors (Jeanneau schema gains `optionalFeatures` so zod doesn't strip authored options).
10. **Rebates & promotions on their own section** — hull/factory rebates render on Step 1 (Hull), Yamaha/motor rebates stay on Step 3, driven by the promotion's source module. Promotions load at flow mount (was Step-3 gated).
11. **Build-A-Boat public pricing lock** — `?priceMode=public` on a quote URL pins pricing to Cash and replaces the price-level picker with a static label, so a website embed never exposes trade/sub-dealer levels.

## 5. The ADMINISTRATION step (quote flow is 7 steps)

Bill's ask verbatim: BOAT BASE — FACTORY OPTIONS — MOTOR — TRAILER — DEALER FIT — **ADMINISTRATION**. New Step 6 (Summary moves to 7) consolidating the paperwork:
- **Registration** — recap chips for boat rego / stickers / tender-to / trailer rego (same live state as Steps 1 & 4, priced there) + new **assigned rego number** fields (boat + trailer).
- **Dealer Services** — the NSM 6 Year Extended Warranty and Direct Debit Service Plan toggles, moved here from the Motor step.
- **Admin & Trade-In** — trade-in description/value, insurance and finance requests, delivery date and timing notes, moved here from the Summary step.
- **Driver's licence upload** — image or PDF to Storage, URL carried on the quote.
- Deposit intentionally stays at Finalize (document defaults own the schedule).

The payload carries the new fields through **both** ends of the pipeline (flow payload and finalize snapshot): `adminDetails.regoNumbers {boat, trailer}` + `adminDetails.driversLicenceUrl`.

All nine quote-flow test specs were updated for the 7-step traversal, and the FFR-33 SP560 proof re-ran GREEN end-to-end on the new flow — **$103,731 exact** on screen and on a freshly rendered customer PDF.

## 6. Catalog Explorer config-tab hotfix (field-reported at release close)

Asaf's dev test found the boat-module Catalog Explorer's **Dealer Fit Options tab rendering only 4 empty demo-category cards** while hundreds of MPF-imported selections (rigging kits, add-on kits, obsolete lists…) exist and drive every quote. Root cause: the v1.31 MPF import wrote selections under `mpf-*` categoryIds that were never added to the category config this tab drew its cards from; the quote flow groups by the selections' own category names, so quoting never broke — the admin view and the quote engine were reading different layers. Data verified intact by direct read-back before any code change.

Fixes, all browser-verified on SP560:
- Category cards are now **derived from the selections themselves** (union with the configured categories) — the surface can no longer disagree with what quoting uses. Name-fallback lookup hardened for any card id without direct hits.
- Row prices resolve through the **same 'Act Sell'-first chain the quote flow charges** (they read $0 before — this view only knew `sellPriceExclGst`).
- **Sections are collapsible** (Asaf's ask): big MPF categories and empty demo categories start closed, header shows count + category total.
- Ordering honours the MPF's own show-on-quote signifiers via the quote flow's `classifySection`: genuine accessory categories first, **MPF-internal / Excel-artifact sections (### markers, OBSOLETE lists, PD packs, rigging pools, workshop ops) last**, each badged "MPF internal · auto-hidden on quotes".
- Motor Options and Trailer Options tabs were probed in the same pass and render correctly (SP560: 4 compatible Yamaha layouts, 2 trailer assignments).

The signifier system itself (what the MPF boat page marks as want-shown vs what exists due to Excel limitations, and where HelmLogic honours each) is documented in `tasks/mpf-boat-page-signifiers.md`.

## 7. Roadmap triage

All 26 items in the Submitted column were dispositioned (`scripts/seed-v133-triage.py`): 13 closed as shipped-with-evidence, 12 targeted and built in this release, 1 held pending a product ruling (splitting Highfield models per console configuration — restructures 85 models, awaiting Asaf). Epic 14 (Usage Reporting) seeded with story 14.1.1.

## Not in v1.33

- **Console-split ruling** (340 / 340 FCT / 340 GT as separate models) — awaiting Asaf's decision; the one submitted item not closed.
- **NSM-Hub migration (11.3.2 / 11.3.3)** — still blocked on the `nsm-service-quotation` read service-account.
- **FFR-33 residuals** — parity battery sections M (every-boat composition inputs, nightly) + N (override drift alarm); PD tier 2/3 picker; grid-picked-motor bundles; NSM's prop-price ruling; the Display Sheet workbook ask (in Mark's follow-up email).
- **New test login** — telemetry keeps tagging billh until Asaf provides the dedicated login (one-line change in `telemetry.ts`).

## Files Changed

58 files vs v1.32 (+1,917/−508). Highlights:
- **New**: `src/lib/telemetry.ts`, `src/components/telemetry-provider.tsx`, `src/components/usage-reporting-workspace.tsx`, `src/components/activity-report-pdf.tsx`, `tests/usage-reporting-smoke.spec.ts`, `tests/pdf-section-drag-repro.spec.ts`, `scripts/seed-v133-triage.py`
- **Quote flow**: `highfield-quote-flow.tsx` (7 steps, Administration, promotions split, price gate, option text, public pricing), `finalize-quote-dialog.tsx` (adminDetails carry-through, double-GST fix)
- **PDF**: `proposal-pdf.tsx` (headings, org-name rename, band subtitles), `pdf-section-list.tsx` (whole-row drag), `tiptap-pdf.tsx` (entity handling)
- **Catalog**: `dealer-fit-options.tsx` (per-item remove + image upload), `highfield-model-editor.tsx` (+ 4 brand editors — shared Factory Configurator), `rego-workspace.tsx` (cost + sticker kinds), catalog table views (sticky headers)
- **Platform**: `firestore.rules` (telemetry + soft-delete + isLocked), `reporting/page.tsx` (tabs), `release-schedule.ts` (v1.33 shipped, runway 33 → 34), 9 quote-flow specs updated for the 7-step flow

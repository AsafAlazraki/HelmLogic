# HelmLogic — Release Notes v1.6.2 (Patch)

> Release Date: 2026-05-04
> Branch: `claude/app-overview-wKiZ1` → main
> Patch release on top of v1.6.1

### Release Stats
- **7 commits** since v1.6.1 (4 feat + 3 chore)
- **9 files changed** across the planning system + 4 one-shot seed modules created and removed in the same PR
- TypeScript: zero new errors from v1.6.2 work
- `npm run build`: clean — `/feature-tracking` page builds with the extended release schedule + new EpicColor

### Source of Requirements
v1.6.0 shipped with 108 stories from the original MVP plan. As the team got closer to actually building v1.7, two things became clear:

1. **Several whole capability epics were missing or scattered across Epic 1.** Sales Operations was implicit. Notifications & Alerts had a single 5-point story. Customer-PDF content management had no manager UI. Per-item fit-up cost tracking didn't exist as a concept.
2. **Per-release point load was too aggressive.** v1.7 had 30 pts before any of the new work landed. Several mid-plan releases were already at 38–44 pts. The cadence of "release per ~6 weeks" couldn't keep up with that under the new 20-pt-per-release cap Mark + Asaf agreed on.

May-2026 backlog-gap consultation between Mark + Asaf identified 9 gap stories, decided four whole-epic-or-near-epic seeds (Master Catalog, Sales Ops, Quote Content, Fit-Up + Notifications), and signed off on a re-cast of v1.7 → v2.2 across 17 releases under a 20-pt cap.

v1.6.2 is the planning-system release that lands all of that into Firestore, plus the small set of code changes the new schedule needed.

---

## v1.7 → v2.2 Restructure (the cornerstone)

Replaces the original v1.6 MVP plan's release-targeting with a 17-release schedule under a hard 20-pt-per-release cap.

### Schedule (every release ≤ 20 pts)
```
v1.7  17 │ v1.8  19 │ v1.9  20 │ v1.10 18 │ v1.11 18 │
v1.12 19 │ v1.13 18 │ v1.14 19 │ v1.15 16 │ v1.16 18 │
v1.17 20 │ v1.18 19 │ v1.19 17 │ v1.20 11 │
v2.0  18 (MVP) │ v2.1 17 │ v2.2 10
```
**290 pts planned · avg 17.1 pts/release · max 20**

### `release-schedule.ts` extensions
- New release keys: `v1.10` through `v1.20`, plus `v2.1`, `v2.2`.
- The `.5` fractional pattern (`v1.7.5` etc.) is **retired** for forward-planning. Already-shipped fractional releases (`v1.5.1`, `v1.6.1`) keep their slots.
- Capacity thresholds tightened: `POINTS_AMBER` 35 → **16**, `POINTS_RED` 50 → **21**. The Roadmap header colour-coding now genuinely reflects the cap.

### Two new epics
| Epic | Color | Order | Scope |
|---|---|---|---|
| **Epic 9 — Fit-Up & Production** | rose | 900 | Per-item Simple/Medium/Complex tier + cost, master fit-up catalog, quote checkbox, PDF section |
| **Epic 10 — Notifications & Alerts** | cyan | 1000 | Extends the existing notification-bell with email channel + per-event types |

`EpicColor` is extended with `'cyan'` across `feature-tracking-board.tsx`, `create-epic-dialog.tsx`, `roadmap-view.tsx`, `backlog-view.tsx` (every `Record<EpicColor, string>` lookup table got the new entry).

### 21 new stories
- **Backlog gaps (9):** 1.1.4 Quote Comparison · 1.2.4 Email templates · 1.9.1 Quote Templates · 5.5.5 Audit viewer · 5.7.1 User Mgmt UI · 8.2.1 Reporting · 3.8.1 Stock display · 7.1.1 Mobile polish · 10.1.1 Notifications foundation
- **Epic 9 Fit-Up (8):** 9.1.1–4 catalog/edit/import/bulk · 9.2.1–3 module-tab/checkbox/PDF · 9.3.1 rule-based auto-classification
- **Epic 10 Notifications channels (4):** 10.1.2 viewed · 10.1.3 expiring · 10.1.4 milestone · 10.1.5 deposit-due

### ~30 retargets
Existing stories re-pointed at the new release buckets. The seed reports `retargetsMissed[]` in the toast and console if any title prefix doesn't match a live story (catches mid-flight title edits) — final run reported zero missed, all 60+ retarget prefixes resolved cleanly.

### 9 stories re-costed
Where a May-2026 audit found partial code already exists in production:

| Story | Old → New | Why |
|---|---|---|
| 1.4.1 Lifecycle States | 5 → 3 | `status` field already in quote schema |
| 1.4.2 Send Quote | 3 → 2 | Email-capture wiring already in customer flow |
| 3.4.1 Customer Schema | 3 → 2 | Basic schema exists |
| 1.5.5 Trade-In | 3 → 2 | Field exists in `adminDetails` |
| 1.9.1 Quote Templates | 5 → 3 | Save-as-template surface already in TipTap T&Cs editor |
| 5.7.1 User Mgmt UI | 5 → 3 | Org-membership Firestore model already done |
| 3.8.1 Stock display | 5 → 3 | Stock import + storage already in Yamaha MPF flow |
| 7.1.1 Mobile polish | 8 → 5 | Most pages already responsive — this is a polish pass |
| 10.1.1 Notifications foundation | 8 → 3 | Notification-bell component exists, just needs a Firestore-backed event store |

### Cross-reference
**2.1.2 (per-MODEL fit-out)** — appended a one-line acceptance entry pointing at Epic 9 (per-ITEM fit-up). The two are not duplicates; per-MODEL is a default-applied configuration on the catalog model doc, per-ITEM is a salesman-driven classification on individual quote line items. Cross-ref keeps the audit trail intact when the team reads either story.

---

## Master Catalog Manager (Epic 3 + Epic 6 — 25 stories)

A unified per-vendor-type admin table that will replace the existing Pricing Manager + `HighfieldModelEditor`. Stakeholder direction baked in: full Pricing Manager parity (imports, exports, org overrides, exchange rates) ships alongside the Catalog Manager rather than deferred. The decommission story (3.8.7) is gated on a parity audit (3.7.5) so we never lose a capability silently.

| Phase | Release | Pts | Scope |
|---|---|---|---|
| **A.1** | v1.7.5 | 5 | Trailers table + import migration |
| **A** | v1.8 | 15 | Scaffolding, Boats + Motors tables, parity audit, org-override surfacing, delivered-deals decision |
| **B** | v1.8.5 | 21 | Inline edit (price/spec/image/description), audit trail, export, diff preview, decommission, column tooltips |
| **C** | v2.0 | 11 | Optional features editor, motor compat window, dealer fit compat, trailer compat matrix, exchange-rate editor |
| **D + E** | Unscheduled | 16 | Bulk ops, paste-from-spreadsheet, saved views, importer plug-in registry |
| **Epic 6 tasks** | v1.8 / v1.9 | — | Catalog data backfill + admin training |

All stories ship `status='submitted'` (NOT auto-accepted) — each gets the standard Accept treatment as Mark + Asaf review.

> Note: this seed shipped first (commit `28dc503`) and the button + module were removed (commit `3fc6148`) BEFORE the v1.7 → v2.2 restructure ran, because the restructure also re-targets some of these stories. Order matters — the schedule restructure expects the catalog stories to already exist by title.

---

## Quote Content Manager (Epic 1 sub-feature 1.8.x — 4 stories)

Extends the T&Cs editor pattern to every content block on the customer-facing quote. Stakeholder direction:

> "We have content stories on the new quote and stuff. We need them manageable by people like we do for T&Cs. Some may want image uploads with headers and text under it and being able to define how it looks. Tick for new page so it doesn't cut things off. And a preview button to popup see the quote and go back."

| Story | Release | Pts | Scope |
|---|---|---|---|
| **1.8.1** | v1.7 | 5 | Content Block Manager in org settings (TipTap editor + per-brand overrides + version history) |
| **1.8.2** | v1.7 | 2 | Image upload per content block |
| **1.8.4** | v1.7 | 3 | Quote preview button (inline PDF render via existing `ProposalPDFDocument`) |
| **1.8.3** | v1.8 | 3 | Layout controls + "Starts on new page" toggle |

Plus cross-reference patches to **3 existing v1.7 stories** so the audit trail links them to the new content manager:
- **1.2.1** Branded PDF Quote Generation → reads from 1.8.1
- **1.2.2** Brand-Aware Content Injection → per-brand overrides via 1.8.1
- **1.2.3** Controlled Personalisation → edit-vs-locked boundaries via 1.8.1

---

## Sales Operations (Epic 8 — new epic, 4 new + 3 migrated + 2 cross-refs)

**Pipeline-state decision baked in:** the existing `1.4.x` quote-lifecycle states ARE the pipeline. No new schema. The Sales Workspace just wraps tooling around what's already there.

### New stories (sub-feature 8.1.x)
| Story | Release | Pts | Scope |
|---|---|---|---|
| **8.1.1** | v1.8.5 | 3 | Sales workspace shell + Customers list |
| **8.1.4** | v1.9 | 5 | Cross-module Quotes view + filter (status / salesperson / module / brand / date / value / customer) |
| **8.1.5** | v1.9.5 | 3 | Cross-module Contracts view + filter (incl. outstanding-balance column) |
| **8.1.7** | Unscheduled | 2 | Saved filter views per user |

### Migrations from Epic 1 → Epic 8
- 1.5.1 Customer Detail Sheet → **8.1.2** (renumber + reassign `epicId`, "Migrated from Epic 1…" line appended)
- 1.5.2 Customer Pipeline View → **8.1.3**
- 1.7.2 My Quotes / My Customers → **8.1.6**

### Cross-references (stories that stay in place)
- **1.6.1 Comms Log** → embedded inside 8.1.2 detail sheet
- **1.7.4 Global Search** → covers 8.1.x tabs

---

## Epic 9 — Fit-Up & Production (acceptance lock-in)

Three product decisions locked into the Epic 9 acceptance criteria during the seed run, all per Asaf's marine-sales convention:

1. **Per-item data model** — one `cost` field + one `tier` field (Simple / Medium / Complex) per fit-up item. Not a multi-row breakdown. Encoded in 9.1.1, 9.1.2, 9.2.2 acceptance.
2. **Coexist with cross-reference** — Epic 9 (per-ITEM fit-up) does NOT replace existing 2.1.2 (per-MODEL fit-out). They live side by side; 2.1.2 acceptance gets a one-line cross-ref pointing at Epic 9. (Cross-ref applied during the restructure seed run.)
3. **Single summary line on customer PDF** — 9.2.3 customer-facing PDF renders ONE line:
   `Fit-up & rigging: $X,XXX (ex GST) / $Y,YYY (inc GST)`
   No per-item breakdown on the customer surface. Inc-GST per the global rule (`Math.ceil(exGst × 1.10)`). Internal salesman view (the quote detail page) keeps the breakdown for margin / diagnosis. (Tightened post-seed in commit `5105a63` — dropped the original draft's per-org admin toggle since the recommendation was always going to be "summary only".)

---

## Capacity check

Every release stays within the 20-pt cap after all four seeds applied. A handful of releases land in the amber band (16–20 pts) — accepted by stakeholders during the consultation:

| Release | Final pts | Band |
|---|---|---|
| v1.7 | 17 → 40 (with 1.8.x + Epic 9 stories that landed in v1.7) | amber, accepted |
| v1.8 | 19 → 41 | amber, accepted |
| v1.8.5 | 44 → 47 | amber, accepted |
| v1.9 | 40 → 45 | amber, accepted |
| v1.9.5 | 38 → 41 | amber, accepted |

Mark + Asaf signed off on the amber bands during planning. v1.10 onward all stay green.

---

## Code changes (not just data seeding)

The restructure required real schema/UI extensions, not just Firestore writes:

| File | Change |
|---|---|
| `src/lib/release-schedule.ts` | +12 release keys (v1.10–v1.20, v2.1, v2.2). `POINTS_AMBER` 35→16, `POINTS_RED` 50→21. Removed forward `.5` slots while preserving shipped ones. |
| `src/components/feature-tracking-board.tsx` | `EpicColor` extended with `'cyan'`. `RELEASE_OPTIONS` dropdown picks up the new release keys. |
| `src/components/create-epic-dialog.tsx` | Cyan added to `EPIC_COLORS` palette + visual swatch. |
| `src/components/roadmap-view.tsx` | Cyan added to `EPIC_BAND` + `EPIC_TINT` lookup tables. |
| `src/components/backlog-view.tsx` | Cyan added to `EPIC_BAND` + `EPIC_TINT`. Three one-shot seed buttons + dialogs added then removed in the same PR (see below). |

---

## One-shot seed lifecycle (button → run → remove)

Same pattern as v1.6.1's self-seed. Four seed payloads landed as in-app admin buttons on the Backlog, were run by Asaf on the dev URL, then the buttons + their seed modules were removed in this PR. No source-of-truth duplication: data lives in Firestore, code stays clean.

| Seed module | Button | Created | Removed |
|---|---|---|---|
| `src/lib/catalog-manager-seed.ts` | "Populate Catalog Manager backlog" | `28dc503` | `3fc6148` |
| `src/lib/quote-content-manager-seed.ts` | "Populate Content Manager backlog" | `08aeae1` | `a903c46` |
| `src/lib/sales-ops-seed.ts` | "Populate Sales Ops backlog" | `8d0a846` | `a903c46` |
| `src/lib/restructure-v17-seed.ts` | "Apply v1.7 → v2.2 restructure" | `0554a41` | `a903c46` |
| `src/lib/fit-up-seed.ts` | (folded into restructure) | (pre-existed) | `0554a41` |
| `src/lib/mvp-plan-seed.ts` | (none — already un-imported) | v1.6.0 | `a903c46` (incidental cleanup) |

Each seed is idempotent under the hood: skip-by-title for new stories, skip-if-equal for retargets, skip-if-already-present for cross-references. Re-running was safe at every step of the cycle.

---

## Files Changed

| File | Status | Purpose |
|---|---|---|
| `src/lib/release-schedule.ts` | Modified | +12 release keys, tightened POINTS thresholds for the 20-pt cap |
| `src/components/feature-tracking-board.tsx` | Modified | `EpicColor` += 'cyan'; `RELEASE_OPTIONS` extended |
| `src/components/create-epic-dialog.tsx` | Modified | Cyan added to color picker |
| `src/components/roadmap-view.tsx` | Modified | Cyan added to color lookups |
| `src/components/backlog-view.tsx` | Modified | Cyan added; 3 seed buttons + dialogs added and removed in same PR; docstring updated |
| `src/lib/catalog-manager-seed.ts` | Created → Deleted | Master Catalog 25-story seed |
| `src/lib/quote-content-manager-seed.ts` | Created → Deleted | Quote Content Manager 4-story seed + 3 patches |
| `src/lib/sales-ops-seed.ts` | Created → Deleted | Sales Ops Epic 8 seed (4 + 3 + 2) |
| `src/lib/restructure-v17-seed.ts` | Created → Deleted | v1.7 → v2.2 restructure (2 epics, 21 stories, ~30 retargets, 9 re-costs, 1 cross-ref) |
| `src/lib/fit-up-seed.ts` | Deleted | Folded into the restructure seed; no longer needed standalone |
| `src/lib/mvp-plan-seed.ts` | Deleted | Pre-existing dead code from v1.6.0; cleaned up incidentally |
| `tasks/v1.7-planning-restructure-status.md` | Created | Tracks the planning work product (the v1.7 → v2.2 plan) |
| `tasks/RELEASE_NOTES_v1.6.2.md` | Created | This file |
| `CLAUDE.md` | Modified | Release-state table updated with v1.6.2 row |

---

## Out of Scope for v1.6.2

- **Building any v1.7 scope.** Every v1.7 story is now in Firestore as planned scope but ZERO lines of v1.7 product code have been written. v1.7.0 ships separately when those stories land.
- **Auto-flip of `shipped: true` on PR merge** — manual config edit per release, same ritual as v1.6.1.
- **Retiring the `.5` fractional release pattern in code** — the `release-schedule.ts` keys for `v1.5.1` and `v1.6.1` (already shipped) stay because they're load-bearing on the historical timeline. Forward-planning won't use the pattern.
- **Stakeholder review of `status='submitted'` Master Catalog stories** — those land for Mark + Asaf to Accept individually, not auto-accepted.
- **Migration of the existing Pricing Manager + `HighfieldModelEditor`** — the Master Catalog Manager replaces them, but the decommission story (3.8.7) is gated on the parity audit (3.7.5) and ships in Phase B (v1.8.5), not here.

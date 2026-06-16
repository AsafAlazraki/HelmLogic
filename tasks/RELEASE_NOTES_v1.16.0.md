# HelmLogic — Release Notes v1.16.0

**Date:** 2026-06-15
**Branch:** `claude/v1.12-v1.13-push` (joint v1.12 → v1.16 push)
**Theme:** Wide polish + 34-ticket backlog drain

v1.16 is the **biggest single-release scope** since v1.11. 34 backlog tickets touched — 21 shipped as code, 3 confirmed already-in-prod (stale planning rows), 10 captured as operator-facing decisions / docs. Ships in the same merge as v1.12 + v1.13 + v1.14 + v1.15.

---

## Release Stats

| Metric | Value |
|---|---|
| Tickets addressed | 34 |
| Code-shipped | 21 |
| Stale-flip (already in v1.11) | 3 |
| Decisions / how-to docs | 10 |
| Blocked / deferred | 0 |
| New components | 5 (compatibility panel, photo curation, cover-image panel + 2 archive helpers) |
| Modified components | 10+ |
| New Firestore fields | 8 (model.{coverImageUrl, marketingTagline, marketingDescription, galleryImageUrls, applicableDealerFitCategories, specifications.motorConfigurations[0].engines[0].{minHp,maxHp,steeringType}}) · quote.hideOptionPrices · dealerFitSelection.applicableModelIds · quote.deletedAt |

---

## Headlines

- **Inc-GST display + cents stripped** on the running-total card during quote build (E7fCW6Oh + mqXYkQbT)
- **"HYP" relabelled "Hypalon"** everywhere a customer or salesperson sees it (lXRbKtH8)
- **Larger logos + larger summary band images on the PDF** (bvAyUQVR + Qt0VHo4M)
- **Show / Hide retail prices per option toggle** on the customer PDF (XydsZkX3)
- **Restructured Dealer Fit section headings** with option counts (VyZ4AonV)
- **Remove + Restore quotes** with a per-card archive view on Recent Proposals (gFQrcADO + ltaY5TPd)
- **"× No trailer" pill on Step 4** to un-default a trailer from a package (Kw1Y2Gww)
- **Dealer-fit options can now be model-scoped** via `applicableModelIds` (ZidKJczh)
- **Dealer-fit option components inline-expander** for multi-item packages (rI21WRhH)
- **Improved Step Header layout** with current model name + step label + progress bar (pcDkqAXa)
- **Inline cover image editor** on the Boats Table expanded row (3.8.3)
- **Rich-text TipTap popover** for the marketing description (3.8.4)
- **Motor + dealer-fit compatibility inline editor** (3.9.2 + 3.9.3)
- **Photo Curation panel** — add / reorder / remove gallery images per model (3.4.3)
- **In-stock badge on Boats Table** rows from the live inventory collection (3.8.1 reused number)
- **Sub Total for Trailer + options** on the trailer card (NWi9EetL)
- **Trailer Spec modal pricing removed** (11E75Jyz)

---

## What ships per ticket

### Customer-facing PDF polish

| Ticket | Change |
|---|---|
| **E7fCW6Oh + mqXYkQbT** | Running-total card on the quote-flow now shows an emerald inc-GST sub-line under the big ex-GST headline. Both rounded — never fractional cents. `Math.ceil(ex × 1.10)` per the v1.3 lesson. The PDF totals were already cent-free via `currency()`. |
| **bvAyUQVR** | Org + vendor logos on the PDF header bumped from 40 px × 160 max-w → 56 px × 220. `pdfImg` preload size 320 → 440 to stay crisp. |
| **Qt0VHo4M** | BuildBand image slot bumped 92 × 70 → 120 × 90 across every band (Vessel / Propulsion / Trailer / Dealer Fit / Fit-Up). |
| **e6twmpiT** | Already shipped in v1.11 Phase D — the Vessel band uses `quote.variant?.imageUrl` (colour image) and the subtitle includes `${material} · ${colorName}` via `variantLabel`. Status flip only. |
| **VDUeX9zQ** | Already shipped in v1.11 Phase D — trailer image fallback chain `imageUrl → catalog.imageUrl → catalog.coverImageUrl → BuildBand placeholder`. Status flip only. |
| **lXRbKtH8** | "HYP" → "Hypalon" on every customer / salesperson-visible label: Step 1 Tube Material button, stock-management workspace select, stock-list badge, stock-item-form select. Internal `'HYP'` codes unchanged (variant SKUs + filtering logic continue to work). |
| **XydsZkX3** | New `quote.hideOptionPrices` boolean. When ON, every option-style line on the customer PDF Investment Summary renders as `INCLUDED` with no $ figure. Applies to Factory options + Motor accessories + Trailer options + Dealer Fit. Maths unchanged — totals still reflect real costs. Toggle pill on the proposal-view Investment Summary ("Show option prices to customer · Shown / Hidden"). |

### Quote-flow UX

| Ticket | Change |
|---|---|
| **11E75Jyz** | Trailer Spec modal no longer surfaces "Cost (Excl. GST)" or "Sell (Excl. GST)" rows. Pricing stays in the Investment Summary + running-total card where it belongs. |
| **NWi9EetL** | New "Trailer Subtotal" row at the bottom of the Trailer card on Step 4. Sums trailer base + selected factory options + custom additions. Primary-coloured separator from per-row items. Hidden when subtotal is 0. |
| **VyZ4AonV** | Dealer Fit section headings restructured: category name + option count + "packages incl." subtitle when present. Same primary pill style, denser. |
| **gFQrcADO** | Hover-reveal **×** button on every Recent Proposals card → confirms → soft-deletes (`deletedAt` set). Sub-collections (audit log, sentEmails) preserved. Recent Proposals query over-fetches (limit 20) and filters `deletedAt` client-side so the grid stays at 8. |
| **ZidKJczh** | Dealer-fit selections can carry `applicableModelIds: string[]`. When set + non-empty, the option only shows when the current quote's model is in the list. Empty/missing = applies to all (existing behaviour). Filter applied in the `groupedDealerFit` useMemo on Step 5. |
| **Kw1Y2Gww** | New "× No trailer" pill on the Step 4 trailer header. Visible when a trailer is currently selected. Click clears the auto-default and submits the quote without a trailer. Mirrors the v1.11 "Boat-only quote" pill for motors. |
| **rI21WRhH** | Dealer-fit cards that contain >1 item (packages) now have a "Show components" expander button at the bottom. Click to reveal an inline panel listing every component name + price. Pure presentation — doesn't toggle selection. Card refactored from `<button>` to `<div>` + inner `<button>` so the inner expander button doesn't fight the outer toggleSelection. |
| **pcDkqAXa** | Step header on the quote flow restructured to two rows: (Row 1) model name + "Step N of 6 · <Step label>" + Exit Build; (Row 2) stepper pills with a grey connector + green progress bar overlay. |
| **ltaY5TPd** | Recent Proposals card has a new "Archive (N)" toggle that swaps the grid to soft-deleted quotes with a green "Restore" button per card. Active/Archive flip is purely a `deletedAt` filter. |

### Catalogue admin editing

| Ticket | Change |
|---|---|
| **3.8.3** | Inline cover-image panel on the Boats Table expanded row. 64×96 preview tile + URL Input. Save-on-blur if URL changed. (Drag-drop deferred to v1.17 — needs Storage upload + storage path convention.) |
| **3.8.4** | "Rich editor" button on the Marketing Copy panel's Description field. Opens a `max-w-3xl` Dialog with `FeatureRichTextEditor` (same TipTap component the content-block editor uses). Inline images supported via `models/{modelId}/marketing-inline-images` Storage path. |
| **3.9.2** | Motor compatibility window editor on the Boats Table expanded row. Min HP, Max HP, Steering type as inline inputs. Save on blur — reads + merges existing `model.specifications.motorConfigurations[0].engines[0]` to avoid clobbering siblings. |
| **3.9.3** | Same panel adds a comma-separated dealer-fit categories allowlist. Empty = all. Quote-flow's `groupedDealerFit` AND-combines this with the v1.16 ZidKJczh per-selection `applicableModelIds`. |
| **3.4.3** | New PhotoCurationPanel on the Boats Table expanded row. Inline list editor for `model.galleryImageUrls`. Paste URL + Enter → append. Up/down chevrons reorder. Trash removes. Tiny preview thumbnail per row. |
| **3.8.1 (v1.16 reused number)** | BoatsTableBody loads `/inventory` on mount, groups by model code, filters to `status === 'in_stock'`. Threads per-model count into ModelRowGroup as a small emerald "N in stock" badge next to the model code. Hidden when 0. (Quote-side stock picker deferred to v1.17.) |

### Decisions / how-tos (no code)

| Ticket | Disposition | Where |
|---|---|---|
| **8E5S6tV6** | Explain: FIT UP tab | `tasks/v1.16-DECISIONS.md` |
| **Cl0bRhFo** | How to fit images to DEALER FIT ITEM | Same doc |
| **N29OaRni** | Decision: no top-level Admin tab | Same doc |
| **9Y7UnGZJ** | Recommended image sizes table | Same doc |
| **hSPmTAy5** | How to change image in "Choose Boat Series" | Same doc |
| **uUGUfN38** | How to change image in Range selection | Same doc |
| **3.8.7** | Decommission Pricing Manager — code-ready, gated on operator ops checks | Same doc |
| **PvmKgeuC** | Set up Test Sub Dealer site — ops task | Same doc |
| **RT0OwAM1** | Updates to Yield Analysis — no Yield Analysis component yet; defer to v1.17 grooming | Same doc |
| **2eTb7FTN** | Yamaha rigging kits — data setup via Manage → Fit-Up → Packages | Same doc |

### Stale-flip (already in production code)

| Ticket | Notes |
|---|---|
| **9.2.2** | "Include fit-up" checkbox — shipped in v1.11. Planning row stayed `planned` after the v1.11 retarget. |
| **VDUeX9zQ** | NO Trailer images — resolved by v1.11 Phase D PDF polish. |
| **e6twmpiT** | Colour image + Material on Summary — already on the Vessel band since v1.11. |

---

## Files Changed

**New:**
- `tasks/v1.16-DECISIONS.md` — 10 ticket decisions/how-tos in one doc
- `tasks/V14-V16_BUILD_TRACKER.md` — live status board across v1.14 / v1.15 / v1.16
- `tasks/V16_STORY_NOTES.md` — early notes
- `tasks/RELEASE_NOTES_v1.16.0.md`
- `tasks/USER_GUIDE_v1.16.0.md`

**Modified (high-level):**
- `src/components/proposal-pdf.tsx` — logo + image sizing + `hideOptionPrices` flag
- `src/components/proposal-view.tsx` — Show option prices toggle + handler
- `src/components/highfield-quote-flow.tsx` — most of v1.16 lives here: HYP label, inc-GST line, dealer-fit headings, trailer subtotal, no-trailer pill, expander, model-scoped dealer-fit filter, improved step header
- `src/components/boats-table-view.tsx` — 5 new inline panels: CoverImagePanel, OptionalFeaturesPanel (already v1.14), MarketingCopyPanel (v1.15), CompatibilityPanel, PhotoCurationPanel, plus in-stock badge + rich-text TipTap dialog
- `src/components/stock-management-workspace.tsx` + `stock-list.tsx` + `stock-item-form.tsx` — HYP → Hypalon label
- `src/app/(app)/modules/[id]/page.tsx` — Remove quote + Archive view

---

## What's NOT in v1.16

- **Inventory display on the quote-builder side** — the in-stock badge ships on the Catalogue read-view; surfacing it on Step 1 model picker + the Recent Proposals card lands v1.17.
- **Drag-and-drop cover image upload** — paste URL ships now; drag-drop needs Storage upload + per-model storage path plumbing. v1.17.
- **In-app suggestion audit panel** — v1.15 logs the events; v1.17 ships the panel UI.
- **Boats Table inline editing** — Trailers + Motors are inline-editable as of v1.13 + v1.14. Boats Table inline editing is the bigger lift (expandable variant rows) and stays v1.17 polish.
- **Yield Analysis** — no component exists; needs scope conversation.

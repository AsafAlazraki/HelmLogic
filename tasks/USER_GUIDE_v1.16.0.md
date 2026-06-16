# HelmLogic — User Guide v1.16.0

**For:** Salespeople · catalogue admins · ops triage · everyone
**Companion to:** `RELEASE_NOTES_v1.16.0.md`

v1.16 is the **widest** release in the joint v1.12 → v1.16 push. 21 code-shipped changes touch the quote flow, the customer PDF, the boats catalogue admin, and the Recent Proposals card. None of it changes how the existing flows work — every change is additive or polish.

---

## At a glance

| What you want to do | Where | Section |
|---|---|---|
| See the inc-GST price during build | Quote flow → running-total card | §1 |
| Hide option prices from the customer PDF | Proposal view → Investment Summary → Show option prices pill | §1 |
| Build a quote with no trailer | Quote flow → Step 4 → "× No trailer" pill | §2 |
| See what's inside a dealer-fit package before adding | Quote flow → Step 5 → "Show components" expander | §2 |
| Restrict a dealer-fit option to specific models | Manage → Dealer Fit → set `applicableModelIds` | §2 |
| Remove a quote from Recent Proposals | Modules → Recent Proposals → hover a card → × | §3 |
| Bring back a removed quote | Modules → Recent Proposals → Archive (N) → Restore | §3 |
| Edit a model's cover image | Catalog Manager → Boat Brand → expand row → Cover Image | §4 |
| Author marketing copy with formatting | Catalog Manager → expand row → Marketing Copy → Rich editor | §4 |
| Set min/max HP for a boat model | Catalog Manager → expand row → Compatibility | §4 |
| Limit dealer-fit categories for a model | Same panel → Dealer-fit categories CSV | §4 |
| Manage gallery photos per model | Catalog Manager → expand row → Photo Gallery | §4 |
| See in-stock count per model | Catalog Manager → Boats Table → model row | §4 |
| Look up image-size recommendations | `tasks/v1.16-DECISIONS.md` § 9Y7UnGZJ | §5 |

---

## 1. PDF + customer-facing surface

### Inc-GST sub-line during build

The running-total card on the quote flow now shows the inc-GST price as a small emerald sub-line under the big ex-GST headline. Rounded up to whole dollars per the v1.3 lesson (`Math.ceil(ex × 1.10)`). The big headline stays ex-GST so the salesperson + customer see the same "package pricing" they always have.

### Larger logos + larger images on the PDF

- Org + vendor logos at the top of the PDF are now 56 px tall × 220 max-width (was 40 × 160).
- BuildBand image slots (Vessel, Propulsion, Trailer, Dealer Fit, Fit-Up) are 120 × 90 (was 92 × 70).

### Show / Hide option prices

Toggle on the proposal-view **Investment Summary** panel:

- **"Show option prices to customer"** → **Shown** (default) renders the dollar amount per Factory Option / Trailer Option / Motor Accessory / Dealer Fit row on the PDF.
- Click it once → **Hidden**. Every option row renders as **INCLUDED** with no $ figure. The totals at the bottom (Net + GST + Grand Total) stay accurate — only per-row presentation changes.

Useful when a customer wants to see the package price without itemising what each option costs.

### Material label cleanup

"HYP" now displays as "Hypalon" everywhere a customer or salesperson sees it. Internal codes still use `'HYP'` so existing variant SKUs + filtering logic keep working.

### Trailer images + colour image — already there

Bothan the trailer image (when uploaded) and the boat colour image + material name are already on the Vessel/Trailer bands as of v1.11. v1.16 confirms these stale planning rows.

---

## 2. Quote flow polish

### "× No trailer" pill (Step 4)

When a model has a default trailer assignment, the trailer auto-loads when you reach Step 4. If you want to build a boat-only quote for a customer who's not buying the trailer, look for the small white "× No trailer" pill in the top-right of the Trailer Base header. Click it to clear.

Mirrors the "Boat-only quote" pill for motors that's been there since v1.11.

### Dealer Fit component expander (Step 5)

Dealer-fit cards that contain more than one item (packages) now have a "Show components" button at the bottom of the card. Click to reveal an inline panel listing every component with its name + price. Click Hide to collapse.

Pure presentation — clicking the expander doesn't add the package to the quote. Useful for "what's in this package?" without committing.

### Dealer Fit headings restructured

Each Dealer Fit category heading on Step 5 now shows the category name + option count + a "packages incl." subtitle when the category mixes single items and multi-component packages. Same primary-coloured pill, just denser.

### Dealer Fit options can be model-specific

When a dealer-fit selection has `applicableModelIds` set (admin field), it only shows on quotes for those models. Empty or unset = applies to all (existing behaviour). Useful for model-specific options like "CL380 mounting bracket".

### Trailer Spec modal — pricing removed

The "Trailer Specs" modal (accessed via the small **Trailer Specs** button on the running-total bar) no longer surfaces Cost or Sell rows. Pricing stays in the Investment Summary + running-total card where the operator already sees it. The spec sheet is for dimensions / wheels / ATM / etc.

### Trailer Subtotal row

The Trailer card on Step 4 now ends with a "Trailer Subtotal" row showing the sum of trailer base + selected factory options + custom additions. Excludes rego (rego has its own card). Hidden when no trailer is selected.

### Improved Step header

The header bar across the top of the quote flow now has two rows:

- **Row 1:** model name (primary colour) + "Step N of 6 · <Step label>" + Exit Build
- **Row 2:** stepper pills + a connector line + a green progress bar showing how far through the build you are

Lets you see at a glance which build you're in and how close to done.

---

## 3. Recent Proposals — Remove + Archive

### Remove a quote

Hover any card on the **Recent Proposals** grid on the module dashboard. A small × button appears in the top-right. Click → confirms → **soft-deletes** the quote.

The quote isn't actually deleted from Firestore. Its `deletedAt` field is set, the doc + sub-collections (audit log, sentEmails) stay intact, and it disappears from the Recent Proposals grid. You can restore it later (see below).

### Archive view + Restore

Next to the "New Quote" button is a new **Archive (N)** toggle. Click it:

- The card title flips to "Archived Proposals"
- The grid swaps to soft-deleted quotes
- The per-card hover X is replaced with an emerald **Restore** button
- The New Quote button hides (you're triaging, not creating)

Click Restore on any card → `deletedAt` is cleared → the quote rejoins the active list.

Click **← Active** to switch back.

The archive counter on the toggle is visible from both views so you know how many archived items exist.

---

## 4. Boats Catalogue — inline editors

When you expand any model row on **Catalog Manager → Boat Brand vendor**, a stack of dashed-border panels appears below the variants list. v1.16 adds five new panels:

### Cover Image panel (v1.16 / 3.8.3)

- 64×96 preview thumbnail of the current cover image
- URL input — paste a new image URL, then Tab/click-away to save
- If the URL fails to load, the preview hides automatically (graceful fallback)
- Drag-drop upload lands in v1.17

### Marketing Copy panel (v1.15 + v1.16 / 3.4.2 + 3.8.4)

- **Tagline** — single-line headline shown on the PDF cover
- **Description** — multi-line body. Plain text in the inline textarea
- **Rich editor** button — opens a modal Dialog with full TipTap formatting (headings, bold, italic, lists, links, inline images). Saved images land in `models/{modelId}/marketing-inline-images` on Storage
- Both fields use draft + Save/Discard (not save-on-blur) to avoid Firestore thrashing on multi-line typing

### Compatibility panel (v1.16 / 3.9.2 + 3.9.3)

Three inline fields for the motor compatibility window:

- **Min HP** (number)
- **Max HP** (number)
- **Steering** (free text — "Tiller" / "Remote" / etc.)

Save on blur. Writes to `model.specifications.motorConfigurations[0].engines[0]` — reads + merges existing config so you don't clobber sibling fields.

Plus a single CSV field for dealer-fit categories that should show on this model:

- **Dealer-fit categories (comma-separated; empty = all)** — e.g. `Safety Gear, Electronics, Trim`

When set, the dealer-fit picker on Step 5 only shows categories in this list for this model.

### Photo Gallery panel (v1.16 / 3.4.3)

Curate the additional photos that appear in the Step 1 carousel during quote build (alongside the cover image, variant image, motor + trailer photos).

- Paste a URL + Enter (or click Add) → appends to the gallery
- Up / down chevrons → reorder
- Trash icon → remove
- Tiny 40×56 thumbnail next to each URL for quick visual sanity

### In-stock badge on model rows

Each row on the Boats Table now shows a small emerald "**N in stock**" badge next to the model code when there are matching inventory items with `status: 'in_stock'`. Hidden when 0.

Live from `/inventory` — updates as stock items are added / sold / moved between locations.

---

## 5. Image sizing + decisions

The file `tasks/v1.16-DECISIONS.md` consolidates the 10 v1.16 tickets that are decisions or operator how-tos rather than code changes:

- **§ 8E5S6tV6** — How the per-module Fit-up tab differs from the master catalog
- **§ Cl0bRhFo** — How to set images on Dealer Fit items
- **§ N29OaRni** — Why there's no separate "Admin" tab
- **§ 9Y7UnGZJ** — Recommended image sizes table (cover, variant, motor, trailer, dealer-fit, fit-up, logos)
- **§ hSPmTAy5 + uUGUfN38** — How to change Boat Series + Range selection images
- **§ 3.8.7** — Why legacy `/pricing-manager` is code-ready to retire but waiting on operator ops
- **§ PvmKgeuC** — How to spin up a test sub-dealer site
- **§ RT0OwAM1** — Why Yield Analysis is deferred to v1.17 scope conversation
- **§ 2eTb7FTN** — How to set up Yamaha rigging kits as Fit-Up Packages

Open it when an operator asks "how do I X?".

---

## What this release did NOT ship (deferred to v1.17)

- **Stock picker on the quote builder** (Step 1) — the badge ships on the catalogue read-view; the picker is v1.17
- **Drag-and-drop cover image upload** — paste URL ships now; drag-drop is v1.17
- **In-app Suggestion Audit panel** — v1.15 captures the events; v1.17 ships the panel
- **Boats Table inline editing** (variant prices + names) — Trailers + Motors are inline-editable already; Boats has expandable variant rows and is bigger work. v1.17.
- **Yield Analysis** — needs scope conversation; held for v1.17 grooming.
- **Legacy `/pricing-manager` decommission** — code-ready (parity audit complete); gated on operator ops checks.

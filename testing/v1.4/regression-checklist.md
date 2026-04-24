# v1.4 — Regression Checklist

Existing behaviour that must still work after v1.4. Run this after
[`test-cases.md`](./test-cases.md) Sections A–I pass. Time budget: ~30 minutes.

Log any failure as a **Severity: High** bug in `bugs-found.md` and flag it to
engineering immediately — regressions block release.

---

## R1. Existing modules still open

| Module type | URL pattern | Expected |
|---|---|---|
| Catalog (Highfield Boats) | `/modules/M1Yf3R9igpJDxJnOVr6f` | Opens with Ranges tab, Pricing Manager, Settings, etc. |
| Motor Brand (Yamaha) | `/modules/{yamahaModuleId}` | Opens `YamahaMotorWorkspace` |
| Master Price File | `/modules/{mpfModuleId}` | Opens `MasterPriceFileWorkspace` |
| Used Boats | `/modules/{usedBoatsModuleId}` | Opens its placeholder (unchanged) |
| Website Listings | `/modules/{websiteListingsModuleId}` | Opens its placeholder (unchanged) |

- [ ] All five module types above still open without runtime errors.
- [ ] None of them accidentally route to `TrailersWorkspace` or `RegoWorkspace`.

---

## R2. Highfield quote flow — non-v1.4 paths

Start a quote on a Highfield model where you will NOT use Pick-from-Catalog
and NOT use the rego module dropdowns.

- [ ] Step 1 (Variant) — material + colour selectors work.
- [ ] Step 2 (Colour + Registration) — legacy 12-month rego toggle adds the model's `registration.price12Months` to the total. Sticker + Tender-To toggles also work.
- [ ] Step 3 (Motor) — motor hero card, price levels, Prop Comes Standard toggle (default OFF), motor dealer fit section all render.
- [ ] Step 4 (Trailer) — model's default `trailerConfig` renders in the Trailer Base card. Legacy 12-month trailer rego toggle works. "Additional Factory Trailer Notes/Options" block works.
- [ ] Step 5 (Dealer Fit) — global + boat + motor categories all appear.
- [ ] Step 6 (Promotions) — active promotions auto-tick.
- [ ] Step 7 (Summary) — all selections roll into the total.
- [ ] Finalize — quote saves to Firestore. `trailer.catalog` and both `*RegoSnapshot` fields are absent (or null) — not empty strings, not `{}`.

---

## R3. Proposals + PDFs

- [ ] Open `/modules/{id}/proposals` for the Highfield module — list renders.
- [ ] Open a pre-v1.4 finalized quote's proposal page. PDF renders without crashing on missing `trailer.catalog`, missing `trailer.cost`, or missing `catalog.specifications`. Falls back to legacy single-line trailer render (image + name + price, no subtitle, no specs strip).
- [ ] Open a v1.4-finalized quote that picked a trailer from the catalog. Trailer block renders image + name + **`BRAND · CODE` subtitle** + **specs strip** (boat size / length / ATM / tare / wheel size / winch — only fields present on the snapshot).
- [ ] **Inc GST** rounding: every item's inc-GST value = `Math.ceil(exGst × 1.1)`. No stray `.5` or `.99` in whole-dollar rows.
- [ ] Trailer margin: the saved quote's `trailer.cost` is set for v1.4 quotes with a catalog pick; dealer audit panels that compute trailer margin show real values, not 100%.

---

## R4. Dealer Fit (non-trailer sources)

- [ ] Global categories from `dealerFitCategories` collection still appear in the quote flow.
- [ ] Boat module's `moduleDealerFitCategories` still appear.
- [ ] Motor module's `motorDealerFitCategories` (on the boat module doc) still appear.
- [ ] All four sources dedupe by case-insensitive name.
- [ ] Non-admin org-scoping: `organisation.dealerFitCategories` filter still applies to global categories; module-level categories remain visible.

---

## R5. Admin pages

- [ ] `/admin/dealer-fit-options` — global dealer-fit items list still renders.
- [ ] `/data-warehouse` — 7 vendor types filter correctly. No crashes on any card click.
- [ ] `/organisations/{orgId}` — sub-dealers, exchange rates, model overrides all still render for Northside Marine.
- [ ] `/modules` grid — all module types show their correct kicker + icon (Highfield, Yamaha, MPF, Trailers, Rego, Used Boats, Website Listings).

---

## R6. Data Warehouse browsing

- [ ] Open Highfield (`data-warehouse/LafOLpLb6QIFE856TiD4`). Ranges, models, variants all still list.
- [ ] Open Yamaha. Motor configurations list still works.
- [ ] Open a trailer brand (e.g. REDCO/TINKA). Series + trailer sub-collections render (this is v1.4 new content, but rendering it from the Data Warehouse list must not crash).

---

## R7. Cover image refresh

- [ ] `ModelsGrid` (and similar list components) merge `organisations/{orgId}/modelOverrides` — any cover-image override you've set appears immediately, not just on detail pages.

---

## R8. Automated critical-path smoke

```bash
npm run test:e2e:smoke
```

- [ ] `tests/critical-paths.spec.ts` passes end-to-end.
- [ ] No newly-failing specs from earlier releases (v1.0–v1.3 smoke tests).

---

## R9a. Imports — upsert preserves untouched rows (v1.4 remediation)

- [ ] Yamaha MPF "Replace Data" — partial upload leaves rows not in the file intact. Toast shows `N updated · M created · K skipped (no key)`.
- [ ] Sam Allen Save — same upsert behaviour.
- [ ] Explicit Clear button still wipes the dataset (not replaced by import).
- [ ] delivered-deals-import and stock-import unchanged from prior releases — both already dedupe.

---

## R9b. Trailer edit surfaces (v1.4 remediation)

- [ ] Admin: upload + paste URL + remove trailer image (detail sheet) persists to `data-warehouse/{vendor}/series/{s}/trailers/{t}.imageUrl`.
- [ ] Admin: save trailer field edits (basic / specs / features / factory options) persists. No lost data on refresh.
- [ ] Admin: save module image in Settings → `modules/{id}.logoUrl` updates; `/modules` list reflects immediately.
- [ ] Non-admin: none of the above edit affordances are visible.

---

## R9c. Trailer assignment on boat model round-trips (day-1 fix, commit 3502153)

Regression guard for the "poof" bug — the form previously didn't
persist `trailerAssignments` back into its defaultValues, so reloads
showed empty despite Firestore having the data.

- [ ] Open any Highfield model (CL260 is easiest) in either the Catalog Explorer TRAILER OPTIONS tab or the Highfield model editor.
- [ ] Use the TrailerAssignmentsSection → Assign a trailer from catalog → pick one → confirm it appears in the list with the DEFAULT badge.
- [ ] Save the model.
- [ ] **Close the editor entirely and re-open it.** The assignment must still be visible. (Pre-fix bug: it vanished.)
- [ ] Firestore (optional): `data-warehouse/.../models/{modelId}.trailerAssignments` has the array with at least one entry.

## R9d. Auto-loaded trailer honours pricing-manager override (day-1 audit fix, commit 3f3b07e)

Regression guard for the override-bypass bug — prior to this fix,
only manual catalog-picker trailer selection merged org overrides;
auto-loaded assigned trailers used the raw source price.

- [ ] Open Trailer Pricing Manager. Pick any trailer assigned as a default on a boat model. Override its Sell price (e.g. from `$9,722` to `$10,500`). Publish.
- [ ] Start a new Highfield quote on that boat model. Let Step 4 auto-load the default trailer.
- [ ] **Step 4 trailer tile must show $10,500, not $9,722.** The quote total reflects the override.
- [ ] Clear the override in the Pricing Manager. Re-open a fresh quote. Trailer price reverts to source ($9,722).

## R9e. Missing assigned trailer is surfaced (day-1 audit fix, commit 3f3b07e)

- [ ] On a boat model with a trailer assignment, manually delete the assigned trailer's Firestore doc at `data-warehouse/{vendor}/series/{s}/trailers/{id}` OR remove the trailer's brand from the Trailer module's `trailerBrandVendorIds` so the aggregator can't find it.
- [ ] Start a quote on that boat → quote loads but a destructive toast appears: `Assigned trailer missing — update the boat model's Trailer Options`.
- [ ] Quote Step 4 has nothing selected. Totals exclude trailer. No silent failure.

## R9f. Sub-dealer trailer override inherits from parent (audit fix, commit bd3773a)

Regression guard for the sub-dealer parent-walk-up bug. Pre-fix:
sub-dealers couldn't see parent-org trailer overrides on their quotes.

- [ ] Sign in as a parent-org admin (Bill / Northside). Open Trailer Pricing Manager. Override a trailer's Sell price. Publish.
- [ ] Sign out. Sign in as a sub-dealer of Northside.
- [ ] Start a Highfield quote on a boat with that trailer assigned as default.
- [ ] **Sub-dealer's quote MUST show the override price**, not the source. (Pre-fix: sub-dealer saw source.)
- [ ] As the sub-dealer, set a different override on the same trailer in their own pricing manager. Re-quote → sub-dealer's own override wins over the parent's.

## R9g. Saved quote carries pricingSource flag (audit fix, commit bd3773a)

- [ ] Finalize a quote with a trailer where the price came from an override. In Firestore: `users/{uid}/quotes/{quoteId}.trailer.catalog.pricingSource` should be `'override'`, and `sourceSellPriceExclGst` should be the pre-override price.
- [ ] Finalize another quote where the trailer price came straight from the catalog (no override active). `pricingSource` should be `'source'`, `sourceSellPriceExclGst` matches `sellPriceExclGst`.

## R10. Login + auth

- [ ] Bill Hull can log in.
- [ ] A non-admin user (if provisioned) can log in and sees restricted UI (hidden Override, hidden Add/Edit in Rego workspace, etc.).
- [ ] Logout + re-login clears all quote drafts.

---

## Sign-off

Record regression result in [`test-results.md`](./test-results.md) at the
"Regression" heading. All R-items must be Pass before the release verdict
can be Pass.

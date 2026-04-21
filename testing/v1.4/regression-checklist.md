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
- [ ] Open a pre-v1.4 finalized quote's proposal page. PDF renders without crashing on missing `trailer.catalog` or `*RegoSnapshot`.
- [ ] Open a v1.4 finalized quote's proposal page (from Section G.4 or H.9). Trailer image + code + name + price match the snapshot. Rego lines show the snapshot vendor + type + price.
- [ ] **Inc GST** rounding: every item's inc-GST value = `Math.ceil(exGst × 1.1)`. No stray `.5` or `.99` in whole-dollar rows.

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

## R9. Login + auth

- [ ] Bill Hull can log in.
- [ ] A non-admin user (if provisioned) can log in and sees restricted UI (hidden Override, hidden Add/Edit in Rego workspace, etc.).
- [ ] Logout + re-login clears all quote drafts.

---

## Sign-off

Record regression result in [`test-results.md`](./test-results.md) at the
"Regression" heading. All R-items must be Pass before the release verdict
can be Pass.

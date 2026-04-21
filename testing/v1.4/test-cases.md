# v1.4 — Test Cases

Work through this file **top to bottom**. Sections depend on earlier sections
for fixtures. Record each result in [`test-results.md`](./test-results.md) as
Pass / Fail / Gotcha / Skip per the legend in `test-plan.md` §7.

> **Before you start:** complete the pre-flight data check in `test-plan.md` §4.
> If that fails, don't run this file — stop and report.

---

## Section A — Vendor types (Data Warehouse)

**What this covers:** the new `Trailer Brand` + `Rego Authority` vendor types
are selectable, filterable, and excluded from the MPF browser.

**Files in scope:** `src/app/(app)/data-warehouse/page.tsx`,
`src/app/(app)/data-warehouse/add/page.tsx`,
`src/components/master-data-browser-dialog.tsx`, `src/docs/backend.json`.

### A.1 — Data Warehouse list page (`/data-warehouse`)
- [ ] Filter dropdown contains `Rego Authority` and `Trailer Brand`.
- [ ] Filter order is: Boat → Motor → Trailer → Rego → Electronics Brand → Electronics Supplier → Parts Wholesaler → MPF → Other.
- [ ] Selecting `Rego Authority` filters the list and each surviving card shows the `FileCheck` (tick-document) badge icon.
- [ ] Selecting `Trailer Brand` filters the list and each surviving card shows the `Truck` badge icon.
- [ ] With no matching vendors, the list shows the empty state (no crashes, no spinner stuck forever).

### A.2 — Data Warehouse add page (`/data-warehouse/add`)
- [ ] Vendor Type dropdown shows **9 options** including both new types.
- [ ] Create a new vendor with `vendorType: 'Rego Authority'`, name "QLD Transport", state QLD, currency AUD.
  - [ ] Save succeeds; toast "Vendor created".
  - [ ] Firestore doc at `data-warehouse/{newId}` has `vendorType: 'Rego Authority'`. **Note the new ID — you'll need it in Section B and D.**
- [ ] Create a second test Trailer Brand vendor (e.g. "Test Trailers") — this is NOT required for later tests; just confirm the flow works.

### A.3 — MPF (Dealer Fit) browser
- [ ] Open any boat module → Settings → add a new dealer-fit selection via the browser dialog.
- [ ] Vendor list **does not** include any Rego Authority, Trailer Brand, or Motor Brand vendors.
- [ ] MPF + Parts Wholesaler vendors **do** appear.

**Known gotchas:** typos in `vendorType` break filters — see
`known-gotchas.md#vendor-type-case-sensitive`.

---

## Section B — Module types (`/modules/add`)

**What this covers:** creating `trailers` and `rego` modules end-to-end, including
filtered vendor pickers and conditional field visibility.

**Fixture to create in this section:**
- Rego module wired to your Section A.2 "QLD Transport" vendor.

### B.1 — Module Type dropdown
- [ ] `/modules/add` Module Type dropdown lists **7 options**: Catalog, Used Boats, Website Listings, Master Price File, Motor Brand, **Trailers**, **Rego (Registration Authority)**.

### B.2 — Trailers module type
- [ ] Select **Trailers**:
  - [ ] "Main Vendor" field hides.
  - [ ] "Associated Vendors" label becomes **"Trailer Brands"**.
  - [ ] List shows only `Trailer Brand` vendors.
  - [ ] If no Trailer Brand vendors existed, a "No matching vendors…" placeholder would show (N/A here since you already have 7).
- [ ] Do **not** create a new Trailers module — the existing `modules/trailers-module` is already live and wired to 6 brand vendors. Creating a duplicate would confuse later sections.

### B.3 — Rego module type — **create this fixture**
- [ ] Select **Rego (Registration Authority)**:
  - [ ] "Main Vendor" field hides.
  - [ ] "Associated Vendors" label becomes **"Rego Authorities"**.
  - [ ] List shows only `Rego Authority` vendors.
- [ ] Name the module "Registration" (or similar), tick your QLD Transport vendor, save.
- [ ] Firestore doc at `modules/{newId}` has `moduleType: 'rego'`, `mainVendorId: null`, `regoVendorIds: ['{qld-transport-id}']`. **Note the new rego module ID for Sections D + G.**

### B.4 — Switching back
- [ ] Change Module Type back to **Catalog**. Main Vendor re-appears; Associated Vendors shows the full vendor list.
- [ ] Navigate away without saving — no orphan doc created.

---

## Section C — Trailers workspace — Catalog tab

**Prereq:** live seed (already done) + `modules/trailers-module` (already exists).

### C.1 — Workspace shell
- [ ] `/modules` list shows the Trailers module card with a blue truck icon.
- [ ] Click in → URL becomes `/modules/trailers-module?trailerTab=catalog` (or similar).
- [ ] Full-width blue header banner renders with "TRAILERS" caption + module name.
- [ ] Three tabs render: **Catalog** (active), **Pricing Manager**, **Settings**.
- [ ] Refresh the page — Catalog tab is still active (URL sync).

### C.2 — Catalog rendering
- [ ] Brand sections render with their own header + truck icon + short code.
- [ ] Each series shows as a titled block with a count badge.
- [ ] Trailer cards show: image (or truck fallback), code, name, boat-size / length / ATM badges, `Sell ex GST` price, optional "N factory options" count.
- [ ] Cards without `imageUrl` show the truck-icon fallback (don't 404).

### C.3 — Detail sheet
- [ ] Click any trailer card → right-side detail sheet opens.
- [ ] Sheet sections: Specifications grid, Features list, Factory Options (with prices), Pricing Waterfall summary (Dealer → Nett → Freight → Landed → PD → Total Nett CTD → RRP → Sell).
- [ ] If the source row has a rego hint, a footer shows it (e.g. "Small Trailers - Up to 1.02t · $166").
- [ ] Close sheet via X or clicking outside — grid state preserved.

### C.4 — Search + filter
- [ ] Type `RE12` into the search input. Only matching trailers render; empty series are hidden.
- [ ] Clear search — full grid restored.
- [ ] If ≥2 brands visible, a brand filter dropdown appears. Pick one brand — other brands hide.
- [ ] Reset brand filter to "All brands" — full grid restored.

### C.5 — Inactive / obsolete
- [ ] Obsolete brand is NOT in the module's `trailerBrandVendorIds`, so it does **not** appear in the catalog by default. Confirm.
- [ ] If you add it via Settings (temporary), its trailers render at 60% opacity with a red "Inactive" badge. Remove it again after checking.

### C.6 — Empty state
- [ ] Temporarily uncheck every brand in Settings → return to Catalog.
- [ ] Shows a single card "No trailer brands selected — head to Settings…".
- [ ] Re-tick all 6 brands before moving on.

**Known gotchas:**
- The catalog spins up one Firestore listener per series (~46 total). High but under limits.
- External image hotlinking means some images may load slower than native-CDN ones; that's expected.

---

## Section D — Rego workspace

**Prereqs:** Section A.2 Rego Authority vendor + Section B.3 Rego module.

### D.1 — Rego module shell
- [ ] `/modules` lists your "Registration" module with `REGO` kicker.
- [ ] Open it → blue banner renders; two tabs: **Rego Types** (default), **Settings**.
- [ ] Switching tabs updates URL (`?regoTab=types` / `?regoTab=settings`); refresh restores the active tab.

### D.2 — Types tab CRUD
- [ ] Each assigned Rego Authority vendor renders as a card with an "Add Type" button.
- [ ] Non-admins: the Add/Edit/Delete buttons are hidden. (Skip if no non-admin user.)
- [ ] Click **Add Type**. Fill in:
  - Name: `Small Trailers - Up to 1.02t`
  - Sell Ex GST: `151`
  - Applies To: `Trailer`
  - Description: (leave blank)
  - Active: on
- [ ] Save → row appears instantly; toast "Rego type created".
- [ ] Firestore doc at `data-warehouse/{qldVendorId}/regoTypes/{newId}` has the saved fields.
- [ ] Add a second type: `Boat Rego — 12 months`, `Sell Ex GST: 520`, `Applies To: Boat`.
- [ ] Edit the first type: change price to `155`. Save → row updates.
- [ ] Toggle the first type's **Active** off. Row renders dashed / reduced opacity. Toggle back on.
- [ ] Delete the SECOND type. Confirm deletion; row disappears; Firestore doc removed.

### D.3 — Settings tab
- [ ] Settings tab lists every `Rego Authority` vendor with a checkbox.
- [ ] Un-tick your QLD Transport vendor → toast + Firestore doc updates `regoVendorIds` to `[]`.
- [ ] Re-tick → Firestore reverts. (Fixture restored.)

### D.4 — Empty state
- [ ] Open the Rego module with NO vendors ticked. Types tab shows "No Rego Authorities assigned — head to Settings".

**Known gotchas:**
- Rego types are not yet state-filtered (the picker shows all states' types). Design doc §10 follow-up.

---

## Section E — Trailers workspace — Pricing Manager + overrides

**Prereq:** Section C catalog renders.

**Fixture to create in this section:**
- 1× org-level override on trailer `RE1213` at **$14,500** for Section H.

### E.1 — Waterfall rendering
- [ ] Click **Pricing Manager** tab.
- [ ] Each brand section renders with collapsed trailer rows.
- [ ] Click a row — waterfall expands in 2 columns (md+).
- [ ] Column-code badges (`AN`, `AO`, `AP`, `AQ`, `AR`, `AS`, `BD`, `BO`, `BP`, `BQ`, `BS`, `BT`, `BU`, `BV`, `BW`) appear next to each row as tiny monotype badges.
- [ ] Markup % renders as `12.5%`; all other rows format as currency with a `$` prefix.
- [ ] If `pricingDetail.pdParts[]` is non-empty, a sub-list renders under the waterfall with part name + cost per row.

### E.2 — Search
- [ ] Type `RE12` in the Pricing Manager search → only matching trailer rows survive; empty series + brands are hidden.
- [ ] Clear search — full list restored.

### E.3 — Missing-waterfall safety
- [ ] Find a trailer without `pricingDetail` (rare — may not exist in the seed). If present, it shows "No pricing waterfall imported" and Override is still available on the top-level `sellPriceExclGst`.

### E.4 — Override — create
- [ ] As admin, click **Override** on trailer `RE1213`.
- [ ] Dialog shows the source sell price.
- [ ] Enter `14500`, note: `Pilot — dealer discount for test`.
- [ ] Save → row now shows "Org Override" amber badge, amber-coloured `$14,500.00`, source price with strikethrough.
- [ ] Firestore doc at `organisations/{orgId}/trailerOverrides/RE1213` has the expected fields (`sellPriceExclGst: 14500`, `note`, `overrideAt`, `trailerId`, `brandVendorId`, `seriesId`).

### E.5 — Override — persistence + reload
- [ ] Reload the page. Override still shows in amber, strikethrough source intact.
- [ ] Close the tab, reopen, navigate back. Override still there.

### E.6 — Override — reset
- [ ] Click **Override** on `RE1213` again → dialog shows current override value.
- [ ] Click **Reset to source** → confirm → badge disappears, amber styling gone, row returns to source price.
- [ ] Firestore doc at `organisations/{orgId}/trailerOverrides/RE1213` is **deleted**.

### E.7 — Override — validation
- [ ] Try to save an override with empty input → validation error ("Required").
- [ ] Try `-100` → rejected (must be ≥ 0).
- [ ] Try `abc` → rejected (numeric only).

### E.8 — Non-admin behaviour
- [ ] Sign in as a non-admin (if available). Open the Trailers module → Pricing Manager.
- [ ] Rows still render + expand.
- [ ] **Override button is NOT visible** anywhere.

### E.9 — Re-create the fixture for Section H
- [ ] Re-apply the override: `RE1213` at `14500`. Do NOT reset it — Section H depends on this.

---

## Section F — Trailers workspace — Settings

### F.1 — Trailer Brands multi-select
- [ ] Settings tab shows a "Trailer Brands" section listing every `Trailer Brand` vendor with a checkbox.
- [ ] Uncheck one brand → toast "Saved"; `modules/trailers-module.trailerBrandVendorIds` in Firestore is one shorter; Catalog reflects the change immediately after tab-switch.
- [ ] Re-tick the brand — restored.

### F.2 — Trailer Dealer Fit Categories manager
- [ ] Add a category "Spare Wheel Kit". Row appears; Firestore doc updates `trailerDealerFitCategories`.
- [ ] Edit / rename / delete all work with toast feedback.
- [ ] **Note:** this is a dead write — see `known-gotchas.md#trailer-dealerfit-dead-write`. The quote flow reads `trailerDealerFitCategories` from the BOAT module, not this one. Don't log it as a bug.

### F.3 — Role assignment
- [ ] Brand Captain + Module Manager pickers render (existing `ModuleRoleAssignment` behaviour).
- [ ] Assigning a user saves; toast confirms; Firestore `modules/trailers-module.brandCaptainId` / `moduleManagerId` updates.

### F.4 — Non-admin behaviour
- [ ] As non-admin, checkboxes + inputs are disabled. Add/edit buttons hidden.

---

## Section G — Highfield quote flow — Rego pickers

**Prereq:** Section D Rego module + 1 active Boat rego type + 1 active Trailer rego type.

### G.1 — Boat rego picker
- [ ] Start a Highfield quote on any model (e.g. CL260).
- [ ] Advance to Step 2 (Colour + material). Select any material/colour.
- [ ] Registration block appears; a dropdown labelled **"Boat Registration (Rego Module)"** renders **above** the legacy "12 Months Registration (legacy)" toggle.
- [ ] Dropdown lists every active rego type where `appliesTo ∈ {'boat', 'both'}`, grouped by vendor name.
- [ ] Pick the Boat rego type (e.g. "Boat Rego — 12 months", $520). Legacy toggle hides; a chip shows `{Vendor} · {Name} · $520`.
- [ ] Total at the bottom of the flow increases by `520` (verify against the price shown pre-pick).
- [ ] Stickers + Tender-To decal cards still render and still add to the total when ticked.
- [ ] Click **Clear** on the chip → legacy toggle reappears; total reverts.

### G.2 — Boat rego — no rego module configured
- [ ] Temporarily archive / hide the Rego module (or sign into an env with none). The dropdown shows "No rego types configured yet…" and is disabled.
- [ ] Legacy toggle + price still work exactly as pre-v1.4.

### G.3 — Trailer rego picker
- [ ] Advance the same quote to Step 4 (Trailer).
- [ ] A dropdown **"Trailer Registration (Rego Module)"** renders, listing types where `appliesTo ∈ {'trailer', 'both'}`.
- [ ] Pick the trailer rego type (e.g. `Small Trailers - Up to 1.02t`, $155).
- [ ] Legacy trailer-rego toggle hides; total adds `155`.
- [ ] Clear → reverts.

### G.4 — Finalize with rego snapshots
- [ ] With a boat rego + trailer rego picked, finalize the quote.
- [ ] Open the saved quote doc (`users/{uid}/quotes/{qid}` or the proposals list):
  - [ ] `registration.boatRegoSnapshot = { id, vendorId, vendorName, regoTypeId, name, sellExclGst, appliesTo, capturedAt }`.
  - [ ] `registration.trailerRegoSnapshot` populated similarly.
  - [ ] Legacy `boatRego`, `boatRegoPrice`, `trailerRego`, `trailerRegoPrice` still present (backwards-compat).

### G.5 — Duplicate a rego-snapshotted quote
- [ ] Duplicate the finalized quote.
- [ ] Pickers show the original picks re-hydrated; total matches the original.

---

## Section H — Highfield quote flow — Trailer picker + snapshot + finalize

**Prereq:** Section E.9 override on `RE1213` at $14,500 is active.

### H.1 — Open the picker
- [ ] Start a Highfield quote. Advance to Step 4 (Trailer).
- [ ] A **"Pick from Catalog"** button renders inside the Trailer Base header strip.
- [ ] Click → Dialog titled "Trailer Catalog" opens with a search input and brand-grouped list.
- [ ] Brands listed match `modules/trailers-module.trailerBrandVendorIds` (6 brands).

### H.2 — Search in the picker
- [ ] Type `RE12` in the dialog search. Trailers filter to matches; empty series hide.
- [ ] Clear search — full list restored.

### H.3 — Override merge into picker
- [ ] Find `RE1213` in the picker.
- [ ] Price displays as **$14,500** (amber, "Org Price" label) — NOT the source price.
- [ ] Other trailers continue to show their source price in the default style.

### H.4 — Pick `RE1213`
- [ ] Click the row. Dialog closes. Trailer Base card updates:
  - [ ] Image, code, name, and `sellPriceExclGst` all match `RE1213`.
  - [ ] A provenance chip renders below: "From REDCO/TINKA — {series-name}".
- [ ] Total at the bottom of the flow reflects `14500` for the trailer portion.

### H.5 — Trailer hardware
- [ ] If `RE1213` has `optionalFeatures`, a "Trailer Hardware" section renders with those as selectable options.
- [ ] Toggle one on. Total increases by that option's price.
- [ ] Toggle off — total decreases.

### H.6 — Price levels
- [ ] If the org has non-default price levels (Trade, Sub-dealer, Boating Alliance), switch price level. Trailer price updates.
- [ ] If the snapshot has no `priceLevels`, the price falls back to `sellPriceExclGst`. Confirm no crash.

### H.7 — Clear the trailer snapshot
- [ ] Click **Clear** on the provenance chip → Trailer Base reverts to the model's default `trailerConfig` (or empty state if no default).
- [ ] Selected hardware options reset.
- [ ] Total recalculates.

### H.8 — Model with no default trailer
- [ ] On a Highfield model where `trailerConfig === undefined`, the empty-state message renders initially.
- [ ] After picking from catalog, Trailer Base populates.
- [ ] Clear → empty state returns.

### H.9 — Finalize with a catalog-picked trailer
- [ ] Re-pick `RE1213`. Finalize the quote.
- [ ] Open the saved quote doc. Verify:
  - [ ] `trailer.name`, `trailer.sellPriceExclGst: 14500`, `trailer.imageUrl` match the snapshot.
  - [ ] `trailer.catalog = { brandVendorId, brandName, seriesId, seriesName, trailerId, code, capturedAt }`.
- [ ] Proposal PDF (from `/modules/{id}/proposals/{quoteId}`) shows the correct trailer details.

### H.10 — Price-drift protection
- [ ] While the above quote is finalized, change the `RE1213` override to **$15,500**.
- [ ] Re-open the finalized quote / its proposal — price still shows **$14,500** (snapshot frozen).
- [ ] Start a NEW quote, pick `RE1213` again → new snapshot captures `$15,500`.
- [ ] Reset override to `$14,500` for the rest of testing.

### H.11 — Duplicate a catalog-trailer quote
- [ ] Duplicate the finalized quote. Trailer Base re-hydrates with the original snapshot + provenance chip.
- [ ] Total matches the original.

### H.12 — Regression (models without catalog pick)
- [ ] On a model with a `trailerConfig` but no catalog pick, finalize as-is. Quote payload's `trailer.catalog` is `null`.
- [ ] Proposal renders with model-default trailer details.
- [ ] Custom trailer additions (the "Additional Factory Trailer Notes/Options" block) still work.

---

## Section I — Dealer Fit four-source merge

### I.1 — Setup
- [ ] Open Highfield Boats module → Settings tab.
- [ ] Confirm THREE dealer-fit category managers are visible: **Boat**, **Motor**, **Trailer**.

### I.2 — Configure one category per source
- [ ] Under **Boat** manager → add `"Electronics"`.
- [ ] Under **Motor** manager → add `"Prop Package"`.
- [ ] Under **Trailer** manager → add `"Spare Wheel"`.
- [ ] Each saves independently + persists on reload.

### I.3 — Merge in quote flow
- [ ] Open a Highfield quote → advance to the Dealer Fit step.
- [ ] All four category sources render in ONE list, de-duped by case-insensitive name (global wins on collision).
- [ ] Add a selection under `"Spare Wheel"` — in Firestore, doc saves with `category: "Spare Wheel"`, `categoryId: "trailer-Spare Wheel"`.
- [ ] Refresh the page — selection re-appears under the same tile.

### I.4 — Name-based rebinding
- [ ] Rename `"Spare Wheel"` → `"Spare Wheel Kit"` in the Trailer manager.
- [ ] The existing selection in the quote still shows `category: "Spare Wheel"` and **does not rebind** to the renamed category. Expected behaviour; document for support.

### I.5 — Cleanup
- [ ] Remove the test categories you added.

---

## Section J — Regression

Run through [`regression-checklist.md`](./regression-checklist.md). This
covers existing functionality (Highfield boats, Yamaha motors, MPF, dealer
fit, proposals, PDFs) to prove v1.4 didn't break anything.

---

## Section K — Automated smoke suite

### K.1 — Run the suite
```bash
npx playwright test tests/v1.4-trailers.spec.ts --project=chromium
```

### K.2 — Expected results
- [ ] 5 tests total.
- [ ] Against the live Dev env, most should **pass** (since v1.4 data is seeded).
- [ ] A skipped test is OK when the bench lacks a fixture; a **failed** test means a v1.4 regression — log a bug.
- [ ] No test should error with an uncaught exception.

### K.3 — Known behaviour
- Specs are read-only. They do not save, finalize, or mutate any Firestore doc.
- `networkidle` never fires with Firebase websockets — all waits use `domcontentloaded` + explicit selectors.
- If you see a `test.skip()` banner in the report, check `test-results.md` and decide whether the skip reason is acceptable.

---

## Sign-off

When every checkbox above is Pass / Skip / Gotcha, record your sign-off in
[`test-results.md`](./test-results.md) at the bottom of the file.

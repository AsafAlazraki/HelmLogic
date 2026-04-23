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

## Section C — Trailers workspace — Dashboard tab (default)

> **Renamed from "Catalog" in v1.4 remediation (2026-04-22).** Legacy bookmark
> `?trailerTab=catalog` is auto-remapped to `dashboard` — do NOT log the rename as a bug.

**Prereq:** live seed (already done) + `modules/trailers-module` (already exists).

### C.1 — Workspace shell
- [ ] `/modules` list shows the Trailers module card (uses `modules/{id}.logoUrl` — falls back to truck icon).
- [ ] Click in → URL is `/modules/trailers-module` with no tab param, or `?trailerTab=dashboard` after any navigation.
- [ ] Three tabs render: **Dashboard** (active by default), **Pricing Manager**, **Settings**.
- [ ] Refresh the page with each tab active — URL persistence restores the same tab.
- [ ] Legacy URL `?trailerTab=catalog` lands on the Dashboard tab (backwards-compat remap).

### C.2 — Dashboard rendering
- [ ] Orange gradient banner at the top with module name + aggregate stats: "N trailers · M brands · K series" + pills for Total / Active / Brands.
- [ ] Below the banner: search input, brand filter dropdown (if ≥2 brands), size-range dropdown, sort dropdown, **Cards/Table view toggle** (far right).
- [ ] Dashboard in **Cards mode** groups trailers by **boat size range**: `Under 4m`, `4–5m`, `5–6m`, `6–7m`, `7m+`, `Unknown`. Each group has a layers-icon header + count badge. Empty groups are hidden.
- [ ] Each card shows: image (or truck fallback), code, small-caps name, brand · series line, badges for `Xm boat` / `Ym length` / `Z ATM`, orange `Sell ex GST` price, optional "N factory option(s)" count.
- [ ] Cards without `imageUrl` show the truck-icon fallback (don't 404).

### C.3 — Cards / Table view toggle (v1.4 remediation)
- [ ] Click the **Table** icon (right of the sort dropdown). Grid switches to a single table.
- [ ] Table columns: thumbnail, Code (sortable), Name, Brand · Series, Boat (sortable), Length, ATM, Sell ex GST (sortable, right-aligned), Status (Active / Inactive badge).
- [ ] URL gains `?trailerView=table`. Refresh the page — table view is restored.
- [ ] Click **Cards** icon to go back. URL `trailerView` param is dropped.
- [ ] Clicking any row / card opens the same detail sheet (see C.4).

### C.4 — Detail sheet + admin edit surfaces (v1.4 remediation)
- [ ] Click any trailer card or table row → right-side detail sheet opens.
- [ ] Sheet sections: image at top, Specifications grid, Features list, Factory Options (with prices), Pricing Waterfall summary (Dealer → Nett → Freight → Landed → PD → Total Nett CTD → RRP → Sell).
- [ ] If the source row has a rego hint, a footer shows it labelled **"Rego hint (info only):"** (e.g. "Rego hint (info only): Small Trailers - Up to 1.02t · $166"). This is informational — do NOT log as a quote-pricing bug (see `known-gotchas.md`).
- [ ] As an **admin** user: an **Edit** button appears in the top-right of the sheet.
- [ ] As an admin, three image controls appear below the image: **Replace/Upload**, **Paste URL**, **Remove** (only when an image exists).
  - [ ] Click Upload → pick a local PNG → image replaces within 2s, toast "Image updated".
  - [ ] Click Paste URL → paste a public https URL → Save → image updates, toast.
  - [ ] Click Remove → image clears, truck fallback renders, toast "Image removed".
- [ ] Click **Edit** → detail sheet switches to form mode with sticky Save/Cancel bar at the top.
- [ ] Form sections: **Basic Info** (Code, Name, Supplier, Active toggle), **Specifications** (Boat size, Length, Tare, ATM, Wheel size, Winch, Between guards, Plug), **Features** (add/remove), **Factory Options** (add/remove, each has Name + Description + Cost + Sell).
- [ ] Edit a spec field → Save → sheet returns to read-only, value reflected immediately on card and in the detail.
- [ ] Cancel from edit mode → no changes persisted.
- [ ] As a **non-admin**: no Edit button, no image edit buttons. Only read-only view.
- [ ] Close sheet via X or clicking outside — grid/table state preserved.

### C.5 — Search + filter
- [ ] Type `RE12` into the search input. Only matching trailers render; empty boat-size groups are hidden.
- [ ] Search now matches **supplier + feature text** too (v1.4 remediation) — try a feature keyword like `kayak` to confirm.
- [ ] Clear search — full grid restored.
- [ ] If ≥2 brands visible, a brand filter dropdown appears. Pick one brand — other brands hide.
- [ ] Pick a boat-size range → group-view switches to flat-grid view for just that range.
- [ ] **Clear** button appears when any filter is active; clicking resets all three filters.

### C.6 — Inactive / obsolete
- [ ] Obsolete brand is NOT in the module's `trailerBrandVendorIds`, so it does **not** appear in the dashboard by default. Confirm.
- [ ] If you add it via Settings (temporary), its trailers render at 60% opacity with a red "Inactive" badge. Remove it again after checking.

### C.7 — Empty state
- [ ] Temporarily uncheck every brand in Settings → return to Dashboard.
- [ ] Shows a single card "No trailer brands selected — head to Settings…".
- [ ] Re-tick all 6 brands before moving on.

**Known gotchas:**
- The dashboard aggregates via a single `getDocs` loop per vendor (no live subscription). Refresh to pull in changes made by another session during the test.
- External image hotlinking means some images may load slower than native-CDN ones; that's expected.
- Search is case-insensitive across code, name, brand, series, supplier, features.

---

## Section C+ — Trailer settings: Module Image editor (v1.4 remediation)

### C+.1 — Module Image card
- [ ] Navigate to Trailers → Settings.
- [ ] **Module Image** is the top card on the Settings tab.
- [ ] As an admin: Replace/Upload, Paste URL, Remove buttons (only the Remove button shows when a logo is present).
- [ ] Upload a file → the preview updates within 2s → toast "Module image updated".
- [ ] Refresh `/modules` — the module card in the list now shows the new logo.
- [ ] Remove → preview clears → `/modules` list falls back to the icon.
- [ ] As a non-admin: "Admin role required to edit the module image." — no buttons.

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

## Section J+ — Imports upsert by natural key (v1.4 remediation)

### J+.1 — Yamaha Master Price File
- [ ] Open any Yamaha MPF dataset, note a row you'll keep untouched (e.g. row with Part Number `X-123`, current `Price` = 500).
- [ ] Edit one cell on that row in-app (change `Price` to 555) → Save.
- [ ] Export the current dataset.
- [ ] Open the exported xlsx, delete row `X-123` entirely, change a different row's price, save.
- [ ] Re-import the modified xlsx using "Replace Data".
- [ ] Toast reports `N updated · M created · K skipped (no key)`.
- [ ] Row `X-123` **still exists in Firestore** with your `555` edit intact (it wasn't in the upload).
- [ ] The row you changed in the xlsx shows the new price.

### J+.2 — Sam Allen uploader
- [ ] Same pattern on the Sam Allen data uploader (Master Price List or Bulk MPL).
- [ ] Upload a partial xlsx. Confirm unrelated rows survive and toast reports counts.
- [ ] Use the explicit **Clear** button (not Save) when you actually want to wipe the dataset.

**Known gotcha:** `import-upserts-nothing-is-deleted` in `known-gotchas.md`. Row preservation is the correct behaviour, not a bug.

---

## Section J++ — Trailer data on boat quote sheet (v1.4 remediation)

Confirms that a trailer picked from the catalog carries through to the proposal PDF with the same detail as the motor.

### J++.1 — Pick a trailer with full data
- [ ] Open a fresh Highfield quote (any CL/SP/RU model that has a trailer step).
- [ ] Advance to the Trailer step → click **Pick from Catalog**.
- [ ] Pick any trailer that has: image, `sellPriceExclGst`, `cost`, `specifications.boatSizeMtr`, `specifications.atmKg`.
- [ ] Back in the quote, confirm the trailer line shows the sell price ex GST.

### J++.2 — Finalize + saved payload
- [ ] Finalize the quote (do not change the trailer from catalog to freeform).
- [ ] Open the saved quote's Firestore doc (Admin → raw) OR re-open the quote.
- [ ] `quote.trailer.cost` should be set to the trailer's cost value (not 0 / missing).
- [ ] `quote.trailer.catalog.specifications` should contain boat size, ATM, etc.
- [ ] `quote.trailer.catalog.code` and `.brandName` should be set.

### J++.3 — Proposal PDF
- [ ] Generate the proposal PDF from the finalized quote.
- [ ] Locate the **Trailer Package** block in the PDF.
- [ ] Below the trailer name (small caps), a subtitle in the form `BRAND · CODE` renders (e.g. `REDCO/TINKA · RE12`).
- [ ] Below the full trailer row, a specs strip renders with dot-separated entries: `Boat 4.5m · Length 5.8m · ATM 1200kg · Tare 480kg · Wheels 13" · Winch Manual` (values depend on the trailer).
- [ ] Fields that are absent from the catalog are simply not printed — no "null" or "undefined" leakage.

### J++.4 — Legacy quote fallback
- [ ] Open an older quote (pre-v1.4) that used the freeform trailer name (no catalog pick).
- [ ] PDF renders the legacy single-line `image + name + price`, no specs strip, no subtitle. That's correct — don't log as a bug.

### J++.5 — Rego is not auto-driven by trailer hint
- [ ] Pick a trailer that has a `regoTypeHint` (e.g. "NSW 12-month · $785").
- [ ] The dashboard detail sheet shows "Rego hint (info only):" — this does NOT flow into the quote totals.
- [ ] Confirm the quote's trailer rego is driven by either the Rego module pick OR the `isTrailerRegoSelected` toggle (legacy). Trailer's own hint is deliberately informational.

---

## Section L — Trailer Pricing Manager — Highfield-style uplift (in progress)

> **Status:** being rolled out in stages on `claude/app-overview-wKiZ1`.
> Each subsection is added in the same commit that ships the matching stage.
> Stages build on each other — run earlier subsections before a later stage
> lands, and the Sell override flow must continue to work after every stage.

### L.1 — Stage 1a: widen override schema (invisible infrastructure)

Nothing visible changed. These are regression checks to confirm the
existing Sell override pathway still works after the schema widen.

- [ ] Trailers → Pricing Manager tab loads without the "Something went wrong" card.
- [ ] An existing Sell override from before the deploy still displays as amber with its source price struck-through.
- [ ] Creating a new Sell override on a fresh row: click Sell cell → type `9999` → press Enter → toast "Override saved" → cell goes amber.
- [ ] Refresh the page — the override persists.
- [ ] Expand the row → click "Reset override" → toast "Override cleared" → cell returns to source price, no strikethrough.
- [ ] Highfield quote flow → Trailer step → "Pick from Catalog" → the overridden trailer shows the override price (amber badge / "Org Price" label) — confirming the catalog picker still resolves overrides via the legacy `sellPriceExclGst` top-level field.

### L.2 — Stage 1b: `EditableCell` replaces `SellCell` (same UX)

Pure refactor — the Sell cell should behave identically to before.
This is the substrate stages 1c–1d will reuse.

- [ ] Every behaviour in L.1 still works (run the full L.1 list once).
- [ ] Click Sell cell, leave the input blank, press Enter → toast "Override cleared" → cell reverts to source.
- [ ] Click Sell cell, type a value identical to the source price, press Enter → toast "Override cleared" (matching source treated as a reset).
- [ ] Click Sell cell, press Escape mid-edit → input closes without a toast, value unchanged.
- [ ] As a **non-admin** user: clicking the Sell cell does NOT open an editor. Hover does not show a pointer cursor.
- [ ] On a trailer with no pricing waterfall (`pricingDetail` empty), Sell editing still works — the source sell price comes from `sellPriceExclGst` on the trailer doc.

### L.3 — Stage 1c: visible row cells editable (Dealer, Nett, Landed, Total PD, CTD, MU%, RRP, Sell)

New capability: every numeric column in the main row is now click-to-edit, not just Sell. The header subtitle reflects this ("Click any numeric cell to set an org override").

- [ ] Pick any trailer with a full waterfall (most Dunbier / GFAB / Mackay rows).
- [ ] Click the **Dealer** cell → type a new price → Enter. Toast "Override saved · dealer → $X". Cell goes amber, source price strikes through below.
- [ ] Click the **Nett** cell → override it to a non-source value. Amber display. Source value strikes through.
- [ ] Click the **Landed** cell → override. Same pattern.
- [ ] Click the **Total PD** cell → override. Same pattern.
- [ ] Click the **CTD** (Total Nett CTD) cell → override. Same pattern.
- [ ] Click the **MU%** cell → type `27.5` → Enter. Cell shows `27.5%` in amber, strikethrough shows the source percentage. Step is 0.1 (percent format).
- [ ] Click the **RRP** cell → override. Same pattern.
- [ ] Click the **Sell** cell → override. Same pattern (already covered by L.2).
- [ ] Reloading the page, all overrides on all columns persist.
- [ ] Multiple columns overridden on the same row: expand the row → waterfall panel shows the effective values including every override. Clicking "Reset override" in the panel clears ALL overrides on that row (whole-doc delete).
- [ ] Resetting a single column via "blank-then-Enter": type nothing → Enter. Toast "Override cleared · {field} reverted to source". Only that field reverts; other overrides on the same row stay in place.
- [ ] Resetting the last single override on a row via blank-Enter drops the whole override doc from Firestore (no `trailerOverrides/{id}` doc left behind — can be verified via Firestore console).
- [ ] **Back-compat check:** any override created before this stage still shows as amber on Sell column; editing it through the new UI migrates it to the new `pricingDetail.sell` shape transparently. The catalog picker in the quote flow still sees the override (it reads top-level `sellPriceExclGst` which is mirrored on Sell writes).
- [ ] Non-admin: none of the numeric cells open an edit input on click. Hover doesn't show a pointer cursor.

### L.4 — Stage 1d: waterfall expansion rows editable

Every row inside the expanded waterfall panel is now click-to-edit.
Full cost-component audit editing, matching the depth Highfield
offers. Fields not in EDITABLE_KEYS (e.g. the grossProfit row) stay
read-only in case they need derivation logic later.

- [ ] Expand any trailer with a full waterfall. The rows you see are: Dealer, Discount, Settlement, Nett Price, Freight, Landed, PD ($), Sundry, Detailing, Total PD, Total Nett CTD, Markup %, Gross Profit, RRP, Sell (ex GST).
- [ ] Click the **Discount** row's value → type a number → Enter. Toast "Override saved · discount → $X". Value turns amber, source strikes through.
- [ ] Click the **Settlement** row → override. Same pattern.
- [ ] Click the **Freight** row → override. Same pattern.
- [ ] Click the **PD ($)** row → override. Same pattern.
- [ ] Click the **Sundry** row → override. Same pattern.
- [ ] Click the **Detailing** row → override. Same pattern.
- [ ] Summary strip at the top: **Source sell** stays at the imported xlsx value; **Effective sell** flips amber whenever there's an override on ANY field (not just Sell).
- [ ] "Reset all overrides on this row" button appears in the summary strip when any override is set. Clicking it clears every override in one go.
- [ ] Override a field that was empty in the source xlsx (e.g. a trailer with no Discount imported): the override value renders in amber, no strikethrough (source is "—"). Blank-then-Enter clears the override and the row disappears again.
- [ ] Orphan overrides (fields overridden that don't exist in the source) still show as a waterfall row inside the panel so operators can find + clear them.
- [ ] Non-admin user: every row value renders read-only. No click-to-edit cursor on any row.

### L.5 — Stage 1e: Brand → Series → Trailer tree layout

Biggest visible change in Chunk 1. Flat 449-row table is now grouped
hierarchically: the brand name becomes a section banner, each series
inside it gets a sub-header, and trailer rows sit indented below.
Every group is independently collapsible.

- [ ] First load: every brand expanded, every series expanded. Visually it's the same rows as before, just with banner rows above each group.
- [ ] Brand header row renders as a darker-grey banner spanning every column. Text: `DUNBIER TRAILERS · 5 series · 65 trailers` (counts should match what you see below).
- [ ] Series header row renders as a lighter-grey banner, indented further, with `Bow Rider Series  · 14 trailers`.
- [ ] Click a brand banner → the entire brand collapses (both series banners and their trailer rows disappear). Chevron flips right → down accordingly.
- [ ] Click a series banner → only that series collapses; sibling series in the same brand stay expanded.
- [ ] Brand chevron icon: right-pointing when collapsed, down-pointing when expanded. Same for series.
- [ ] **Expand all** button: restores everything to fully expanded.
- [ ] **Collapse all** button: collapses every brand banner (series state within is preserved but hidden).
- [ ] Row counter (leftmost numeric column): still counts 1..N across visible trailer rows, ignoring banners. So hiding a brand via collapse doesn't leave gaps in the counter.
- [ ] Brand and Series columns on trailer rows render in muted grey (since the banner already shows that context).
- [ ] Expand a trailer's waterfall (chevron on its own row): the waterfall panel still opens inside the series group, does not break layout.
- [ ] Search across brands (e.g. search `SRW5`): only brands with matching rows render their banners. Empty brands drop out entirely.
- [ ] Brand filter dropdown narrows to one brand: only that brand's banner renders.
- [ ] Sticky behaviour: the top-of-table column headers stay pinned when scrolling. The left-side Expand and # columns stay pinned when scrolling horizontally.
- [ ] Non-admin: every banner is still clickable for collapse/expand; cell values stay read-only.

---

## Section K — Automated smoke suite

### K.1 — Run the suite
```bash
npx playwright test tests/v1.4-trailers.spec.ts --project=chromium
```

### K.2 — Expected results
- [ ] **7 tests total** (v1.4 remediation added Dashboard + view-toggle + detail-sheet specs).
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

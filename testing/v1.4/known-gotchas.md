# v1.4 — Known Gotchas

Behaviours that look weird but are **intentional**. Do NOT log these as bugs.
Each entry explains why the behaviour exists. If a tester genuinely disagrees
with one of these decisions, raise it with engineering as a design question,
not a bug.

---

## Trailers

### `trailer-df-not-auto-ticked-per-trailer`
When a trailer is selected on a quote, its Dealer Fit items do **NOT** auto-tick on Step 5 of the quote flow — the operator must tick them manually. Motors have `masterAccessories[].isStandard` which DOES auto-tick, but the trailer equivalent (`trailer.defaultDealerFitSelectionIds[]`) was explicitly deferred to v1.5.

**Why:** the per-trailer DF auto-tick mechanism was scoped out of v1.4. Adding the schema + detail-sheet picker + quote-flow merge is a contained v1.5 unit of work. For v1.4, trailers follow the v1.3 behaviour: DF is selected at quote time from the module-level categories pool (now including categories pulled through from linked associated modules).

### `trailer-override-now-flows-on-auto-load`
**This was a bug, now fixed.** Before commit `3f3b07e` (2026-04-23): a pricing-manager override on a trailer was ignored if the trailer was auto-loaded onto a quote via the boat model's default `trailerAssignments`. Only the manual catalog-picker path merged overrides. Fixed: quote flow now subscribes to `organisations/{orgId}/trailerOverrides` and applies `sellPriceExclGst` + `pricingDetail` overrides inside `loadAssignmentSnapshot`.

**Why it matters to testers:** if you set a trailer override, Publish, and then start a quote on a boat that has that trailer as its default assignment, the quote trailer price should equal the override (not the source price). Previously it silently used source. This is now the correct behaviour — if you see the source price on an auto-loaded assignment, that's a regression, log it.

### `trailer-doc-missing-toast`
Added in commit `3f3b07e`: if a boat model has a trailer assignment whose Firestore doc has been deleted (or the trailer's brand has been un-assigned from the Trailer module), the quote flow shows a destructive toast `Assigned trailer missing — update the boat model's Trailer Options` instead of silently dropping the trailer from the quote totals. Operators should treat this as a signal to fix the model's Trailer Options.

### `sub-dealer-inherits-parent-trailer-overrides`
Added in commit `bd3773a`: when a sub-dealer (org with `parentOrganisationId` set) opens the quote flow, the trailer override merge now subscribes to BOTH the sub-dealer's own `organisations/{subId}/trailerOverrides` AND the parent org's `organisations/{parentId}/trailerOverrides`. Sub-dealer overrides win on conflicts. Pattern: parent org sets a trailer override → all its sub-dealers inherit unless a sub-dealer has set its own override on the same trailer. Mirrors how motor pricing inherits via `defaultPriceLevel`.

**To verify:** sign in as a sub-dealer, start a quote on a boat with a trailer assigned. The trailer's price should reflect any override set on the parent org's pricing manager.

### `quote-trailer-pricing-source-flag`
Added in commit `bd3773a`: every saved trailer on a quote (`quote.trailer.catalog`) now carries `pricingSource: 'source' | 'override'` and `sourceSellPriceExclGst` (the catalog price BEFORE any override). Dealer-audit reports can subtract `sourceSellPriceExclGst` from `sellPriceExclGst` to compute the override delta. **Legacy quotes** (saved before this commit) won't have these fields; treat absent as `'source'`.

### `trailer-rego-hint-is-info-only`
The trailer detail sheet in the dashboard shows a **"Rego hint (info only)"** line at the bottom of the Pricing Summary (e.g. `Rego hint (info only): NSW 12-month · $785`). That value comes from the source xlsx import (`pricingDetail.regoTypeHint` / `regoDollarsHint`). It is **NOT** added to the quote total.

**Why:** rego is state-specific and dealer-specific. The Rego module (v1.4) is the authoritative source — operators attach a `Rego Authority` vendor + a Rego Type to each quote. The trailer doc's hint is just the note the operator made on the source sheet when the xlsx was built — it may reference a different state entirely. Auto-applying it would cross-state silently. Legacy fallback if the Rego module isn't configured: `model.registration.trailerPrice12Months` on the boat model, gated by the `isTrailerRegoSelected` toggle on the quote. Do NOT log "trailer rego hint is $785 but quote shows $0" as a bug.

---

### `trailer-pdf-specs-only-for-picked-trailers`
The proposal PDF renders the trailer with a `BRAND · CODE` subtitle and a specs strip (boat size / length / ATM / tare / wheel size / winch) **only when** the quote has a frozen `catalog` snapshot — i.e. the user clicked "Pick from Catalog" and chose a trailer from the dashboard. Quotes built with the legacy freeform trailer name (no catalog pick) still render as single image + name + price.

**Why:** the specs live on the trailer catalog doc; legacy flow never captured them. We fall back to the simple rendering rather than leaving a blank strip.

---

### `import-upserts-nothing-is-deleted`
Both the Yamaha Master Price File import ("Replace Data") and the Sam Allen uploader **upsert** by natural key. A row in the upload with a matching key **updates** the existing Firestore doc; a new row **creates** one; a row already in Firestore but NOT in the upload is **left untouched**. Toast shows `N updated · M created · K skipped (no key)`.

**Why:** testers (and operators) often reported "I uploaded a fresh xlsx and all my edits are gone". Clear-and-replace was the cause. To fully clear a dataset, use the explicit Clear button, then re-import.

**How to test "row preservation"**: note an existing row, upload an xlsx that doesn't include it, confirm the row survives. This is the correct behaviour now.

---

### `trailer-dealerfit-dead-write`
The **Trailers workspace Settings tab has a "Trailer Dealer Fit Categories"
manager** that writes to `modules/{trailersModuleId}.trailerDealerFitCategories[]`.
The Highfield quote flow does NOT read from there — it reads
`trailerDealerFitCategories` from the **boat module** doc.

**Why:** dealer fit is always configured in the context of the boat being
quoted, mirroring how motor dealer fit works. The Trailers workspace manager
exists for UX symmetry but has no effect on the quote flow in v1.4. Engineering
is aware; see `.agents/evolution.md`.

**To configure trailer dealer-fit categories for a live quote** → go to the
Highfield (boat) module → Settings → Trailer Dealer Fit Categories manager.

---

### `obsolete-brand-hidden-by-default`
The `Obsolete Trailers` brand vendor exists in Firestore (seeded with 27
inactive trailers) but is **not** in the trailers module's
`trailerBrandVendorIds`. It will NOT appear in the Catalog or Picker unless
an admin explicitly ticks it in Settings.

**Why:** the Obsolete vendor preserves discontinued trailers so historical
quotes still resolve, but we don't want them cluttering new quote builds.

---

### `trailer-id-unique-per-vendor-not-global`
If two brands (theoretically) had a trailer with the same code, the importer
would slug them identically per-vendor but not globally. In practice this
doesn't happen — trailer codes are naturally unique across the source xlsx.
Overrides are keyed by trailer ID only (not brand/series), so if a duplicate
ever appears, both would get the same override.

---

### `trailer-snapshot-freezes-price`
Once a user picks a trailer in the quote flow, the price is **frozen** into
the quote. Later changes to the source xlsx, re-imports, or org overrides do
NOT retroactively change that quote. Open a new quote to pick up new pricing.

**Why:** dealer contracts quote a specific number. Silently changing a
finalized quote's price would be a compliance risk.

---

### `pricing-manager-export-not-supported`
The Pricing Manager has no Export / CSV / print option. Admins can read the
waterfall in the UI but there's no "download as spreadsheet" feature yet.

**Why:** not in scope for v1.4. Deferred per design doc §10.

---

## Rego

### `rego-state-filter-deferred`
The Boat / Trailer rego pickers list **every active rego type** from every
Rego Authority vendor assigned to the module, regardless of the user's state.
If you configure QLD Transport + VicRoads + NSW RMS under one module, the
dropdown shows ALL of them.

**Why:** state filtering (`vendor.state === userProfile.state`) is deferred
to a follow-up. For the pilot (Northside Marine = QLD only), one rego
authority is sufficient.

---

### `rego-types-global-scope`
The picker queries `modules where moduleType == 'rego'` **globally** — not
scoped to the user's org. On a multi-tenant dev env, types from OTHER orgs'
rego modules may appear.

**Why:** mirrors how trailer modules are discovered. Not a bug in production
(one rego module per org is the expected deployment).

---

### `legacy-rego-toggles-preserved`
The legacy "12 Months Registration" toggle + "12 Months Trailer Rego" toggle
still exist on the quote flow. They're hidden when a rego snapshot is active
but remain for quotes where no rego module is configured.

**Why:** full backwards compatibility. Pre-v1.4 quotes and unconfigured
environments keep working.

---

## Dealer Fit

### `name-based-category-rebinding`
Module-level dealer-fit category selections are keyed by category **name**,
not ID. Renaming a category orphans its existing selections — they still
show with the old category name and don't migrate to the renamed category.

**Why:** synthetic IDs (`motor-<name>`, `trailer-<name>`, `module-<name>`)
are computed from names, so a rename produces a new ID. Keep names stable
post-quote.

**Workaround:** selections with the old name remain visible and usable. Only
NEW selections will go under the renamed category.

---

### `global-wins-on-duplicate-name`
If a global dealer-fit category and a module-level one share a case-insensitive
name, the **global** one wins the merge. The module-level one is suppressed.

**Why:** global categories are org-wide taxonomy; module-level categories are
org-local overrides meant to add to — not duplicate — the global set.

---

## Quote flow

### `legacy-quotes-no-catalog-field`
Quotes finalized before v1.4 have no `trailer.catalog` field. Proposal
renderers handle `trailer.catalog === null` gracefully via optional chaining.

**Why:** migration of historical quotes is deferred per design doc §10.

---

### `duplicate-rehydrates-snapshots`
Duplicating a v1.4 quote rehydrates the trailer + rego snapshots exactly as
they were at finalize time, even if the catalog or rego type has since
changed.

**Why:** the snapshot IS the source of truth post-finalize. Duplicates start
from the frozen state so the new quote has a stable baseline.

---

## Data warehouse / vendor types

### `vendor-type-case-sensitive`
Vendor types are stored as verbatim strings (`"Rego Authority"`, not
`"rego authority"` or `"rego_authority"`). Typos break filters, dropdowns,
and picker eligibility.

**Why:** no normalization layer — the enum is literal. Always pick from the
dropdown, never type it manually into Firestore.

---

### `image-hotlinking-requires-native-img`
Trailer `imageUrl`s point to external CDNs (`mayfairmarine.com.au`, etc.).
Some CDNs enforce anti-hotlink protection that breaks Next.js's `<Image>`
optimization proxy. The UI uses native `<img>` tags everywhere for these.

**Why:** project-wide rule (see `CLAUDE.md`). Don't "fix" this by swapping to
`<Image>` — you'll break image loading.

---

## Automation / tests

### `networkidle-never-fires`
Firebase websockets keep the network marked "active" indefinitely. Playwright
specs use `waitForLoadState('domcontentloaded')` + explicit selector waits,
never `networkidle`.

**Why:** structural with Firebase. Don't try to "fix" it — you'll get flaky
30-second timeouts.

---

### `test-skip-vs-test-fail`
The v1.4 Playwright suite uses `test.skip()` when a required fixture doesn't
exist (no trailers module, no rego module, etc.). A skipped test is **not a
bug** — it means your env lacks that fixture. A **failed** test (not skipped)
is the one that indicates a regression.

---

## Importer / seed

### `empty-slug-row-skipped`
One row in the source xlsx (row 613) has a trailer code of `"."` which slugs
to an empty string. The importer skips it with a warning. Count reduces by 1.

**Why:** Firestore rejects doc paths with a trailing `/`. Skipping is safer
than attempting a malformed write.

---

### `idempotent-seed-slug-collisions`
If two trailers have the same code within the same series, the second write
merges into the first (Firestore `{ merge: true }` semantics). Post-seed,
Firestore has **449 unique docs** from **454 parsed rows** — 5 were merged.

**Why:** idempotent by design. Re-running the seed will never create
duplicates.

---

Questions about any of these? Ping engineering. **Don't log them as bugs.**

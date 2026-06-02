# HelmLogic — Session Handover Document
> **Read `tasks/START_HERE.md` FIRST.** This file is deep technical context.
> Give this file to a new Claude session along with the CLAUDE.md file.
> Updated: 2026-04-23 PM (v1.4 trailers + rego + Pricing Manager uplift + 17-item day-1 remediation fully shipped on `claude/app-overview-wKiZ1` — awaiting user green-light for PR)

---

## Release Status at a Glance

| Release | Date | Status | Branch |
|---|---|---|---|
| v1.0 | 2026-03-31 | ✅ Shipped | main |
| v1.1 | 2026-04-01 | ✅ Shipped | main |
| v1.2.0 | 2026-04-10 | ✅ Shipped | main |
| v1.2.1 | 2026-04-10 | ✅ Shipped (patch) | main |
| v1.3.0 | 2026-04-17 | ✅ Shipped | main |
| v1.3.1 | 2026-04-17 | ✅ Shipped (same-day hotfix) | main |
| v1.4 | 2026-04-23 | ✅ Shipped | main |
| v1.5 / v1.5.1 | 2026-04-25 | ✅ Shipped | main |
| v1.6 / v1.6.1 / v1.6.2 | 2026-04-27 | ✅ Shipped | main |
| v1.7 | 2026-05-04 | ✅ Shipped | main |
| v1.8 | 2026-05-11 | ✅ Shipped | main |
| v1.9 | 2026-05-12 | ✅ Shipped (PR #35) | main |
| v1.9.5 | 2026-05-14 | ✅ Shipped (PR #36) | main |
| **v1.10** | **2026-06-02 (in flight)** | 🛠️ **Building on branch — Phase A bug pass done (b516d4e), Phase B Fit-Up admin done (full 9.1.x), Phase C Service Quoting foundation next** | `claude/app-overview-wKiZ1` |

> **v1.9.5 = planning + groundwork + hotfix** (fractional, like v1.5.1/v1.6.1). Roadmap reshuffled to dealer-ops priority (157 stories re-targeted, Submitted drained, sequential v1.10–v1.40 runway); Epic 11 Service Quoting seeded as backlog (NSM-Hub absorption — PLANNED, not built); clickable release-detail popups; emailTemplates Create-Proposal crash (CODE fix — SendQuoteDialog subscribed to templates unconditionally; not a rules issue). **The actual dealer-ops + Service Quoting BUILD starts at v1.10.**

> **v1.10 in progress** — three phases on one dev branch: (A) prod-bug pass (4 fixes, shipped b516d4e); (B) Fit-Up admin — full 9.1.x scope (schema + add/edit/delete + CSV import/export via xlsx + bulk markup/retier/delete) on new `Manage → Fit-Up Catalog` tab; (C) Service Quoting catalogue — Epic 11.1.1 + 11.1.2 (labor-code + parts collections + admin UI with sub-tabs, CRUD, CSV in/out, bulk operations) on new `Manage → Service Catalog` tab. NOT in v1.10: Epic 11.2.x service-quote flow (create form / dashboard / PDF / lifecycle = v1.11+); Epic 11.3.x customer reconciliation + NSM-Hub migration (deferred — needs service-account access); module x3 + parts x1 stories from original v1.10 plan (retargeting to v1.11 — specific stories to be selected at v1.11 kickoff); quote-flow fit-up integration (Epic 9.2 = v1.16+); auto-classification (9.3.1 = v2.2). Plans: `tasks/nsm-hub-merge-study.md` + `tasks/nsm-hub-merge-plan.md` + `tasks/v1.10-restructure-plan.md`.

**v1.10 new Firestore surface (Phase B — Fit-Up admin):**
- `organisations/{orgId}/fitUpItems/{itemId}` — org-level master catalog of fit-up items. Schema: `{ name, tier: 'simple'|'medium'|'complex', cost: number, sellPrice?: number|null, notes?: string|null, createdAt, updatedAt }`. Reads + writes signed-in (UI-layer org-admin gate via `can_access_settings`). Quote-flow integration is Epic 9.2 (v1.16+).
- New components: `src/components/fit-up-catalog-manager.tsx` (FitUpCatalogManager + FitUpItemEditor + BulkActionDialog) + one-shot `src/components/v110-retarget-button.tsx`.
- CSV import: detects `name` column from multiple aliases, normalises tier with first-letter detection, upserts by name (case-insensitive). Toast: `N updated · M created · K skipped (no name)`.
- Bulk actions (require selection): apply markup % (overwrites sellPrice = cost × (1 + pct/100)), change tier, delete. All gated by confirm dialog with explicit overwrite-warning copy.

**v1.10 new Firestore surface (Phase C — Service Quoting catalogue):**
- `organisations/{orgId}/serviceOperations/{opId}` — labor-code catalog. Schema: `{ code, name, flatRateHours: number, hourlyRate: number, cost?: number|null, sellPrice?: number|null, notes?: string|null, createdAt, updatedAt }`. **Sell-price derivation**: `flatRateHours × hourlyRate` unless `sellPrice` is explicitly set (override). Natural key = `code` (UPPERCASE on import match). Bulk markup applies to `hourlyRate` (not sellPrice override) — keeps the derivation transparent.
- `organisations/{orgId}/serviceParts/{partId}` — parts catalog. Schema: `{ partNumber, name, cost: number, sellPrice?: number|null, stockLevel?: number|null, notes?: string|null, createdAt, updatedAt }`. Natural key = `partNumber` (UPPERCASE on import match). Bulk markup overwrites `sellPrice = cost × (1 + pct/100)` (same pattern as fit-up).
- New components: `src/components/service-catalog-manager.tsx` (ServiceCatalogManager + ServiceOperationsTab + ServicePartsTab + ServiceOperationEditor + ServicePartEditor + OperationBulkDialog + PartBulkDialog). Mirrors the Fit-Up pattern but two-tabbed for Operations vs. Parts.
- `/manage` tab list: bumped to 8/9 (Company Details, Users & Permissions, Document Templates, Integrations, Margins, Modules, **Fit-Up Catalog**, **Service Catalog**, +Sub Dealers).
- Both new tabs lazy-mount via the controlled-Tabs gating from `ef16825` — a missing rule on `fitUpItems`, `serviceOperations`, or `serviceParts` only impacts that tab, not the page.

**v1.10 NOT shipped (deferred):**
- Service-quote flow itself (Epic 11.2.x — create form / dashboard / PDF / lifecycle): deferred to v1.11+. Catalogue is the foundation; quote consumption is the next phase.
- Customer reconciliation + NSM-Hub data migration (Epic 11.3.x): deferred — needs the `nsm-service-quotation` service-account pre-flight.
- Module x3 + parts x1 stories from the original v1.10 restructure plan: retargeting to v1.11 (specific stories TBD at v1.11 kickoff — the planning workbench will surface them).

> **Note**: this table was backfilled at v1.9 from a stale v1.4-era state. Canonical release state lives in **`CLAUDE.md`** top-of-file table; per-release detail lives in **`tasks/RELEASE_NOTES_vX.Y.Z.md`**.

**Scoreboard (v1.9 as of 2026-05-12):** 10 commits since v1.8 ship · 25 files changed · +~4100 / −350 lines · `npm run build` clean · TS pre-existing only / 0 new.

**Current work**: v1.9 Quote-lifecycle wrap-up — Compatibility Rules (1.1.2), Inline PDF Preview (1.8.4), Lifecycle State Machine (1.4.1), Multiple Quote Scenarios (1.1.3), SharePoint Quote Storage (1.3.3). Build plan at `tasks/v1.9-build-plan.md`, release notes at `tasks/RELEASE_NOTES_v1.9.0.md`, admin task at `tasks/ADMIN_TASK_sharepoint-setup.md`.

**Key v1.9 concepts for new sessions:**
- `users/{ownerUid}/quotes/{quoteId}.lifecycleState` (1.4.1) — `'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected' | 'lost' | 'expired'`. Orthogonal to existing `status` (`'proposal' | 'stock'`); see `src/lib/quote-lifecycle.ts`.
- `users/{ownerUid}/quotes/{quoteId}.scenarioLabel` (1.1.3) — sibling-scenario marker. Family root has no label; scenarios share `parentQuoteId === root.id`. See `src/lib/quote-scenarios.ts`.
- `users/{ownerUid}/quotes/{quoteId}.sharePoint{SyncedAt,Path,WebUrl}` (1.3.3) — set by the SharePoint sync orchestrator after a successful Graph upload. Rule whitelist (`onlySharePointFieldsChanged()`) allows these on locked quotes.
- `modules/{moduleId}/compatibilityRules/{ruleId}` (1.1.2) — feature × feature compat rules per module. Engineering authors direct to Firestore for v1.9; admin UI deferred to v1.10+.
- `organisations/{orgId}/sharePointConfig/{configId}` (1.3.3) — per-org SharePoint integration config. Doc id is `default` (multi-site is v1.10+). Public identifiers only (`tenantId`, `clientId`, `siteId`, `folderPath` + `enabled` toggle). Client secret lives in Firebase App Hosting env (`SHAREPOINT_CLIENT_SECRET`), never in Firestore.
- New API route `src/app/api/sharepoint-sync/route.ts` — Node runtime, Microsoft Graph proxy. Server-side OAuth client-credentials + folder walk + PDF upload. Trusts the calling client in v1.9 (Firebase ID-token verification is a v1.10 hardening task).
- 5 sync hooks at: `finalize-quote-dialog.tsx`, `email-send.ts` (post-lock + lifecycle-Sent), `create-scenario-dialog.tsx`, `proposal-view.tsx#handleForkConfirm`, `proposal-view.tsx#handleLifecycleTransition` (terminal states only). All fire-and-forget, best-effort, env-flag-gated.
- New `Integrations` tab in `/manage` → hosts `SharePointConfigEditor`. Grid-cols bumped 5→6 (or 6→7 with subDealersEnabled).
- Env vars: `NEXT_PUBLIC_SHAREPOINT_ENABLED` (UI gate, public) + `SHAREPOINT_CLIENT_SECRET` (backend only, Firebase App Hosting env).
- Rules helpers added: `onlyLifecycleFieldsChanged()` + `onlySharePointFieldsChanged()`. Both OR'd into the quote-update rule alongside the v1.8 `onlyLockFieldsChanged()` so a locked quote accepts lifecycle + sync writes (sales journey continues + post-send sync stamps tracking fields).

**Key v1.4 concepts for new sessions:**
- `modules/{id}.associatedModuleIds[]` — a module can link other modules; the Trailer Catalog Picker + DealerFitOptions + quote flow all respect the link.
- `model.trailerAssignments[]` — per-boat-model trailer assignments. Quote flow Step 4 auto-selects the default (`isDefault: true`) assignment; clicking a tile switches it; untick to clear.
- `organisations/{orgId}/trailerOverrides/{trailerId}` — per-org override of `sellPriceExclGst` + any `pricingDetail` field. Picker + auto-loader both merge these (audit fix `3f3b07e`). For sub-dealer quotes, the auto-loader ALSO subscribes to the parent org's overrides and merges them in, sub-dealer winning on conflicts (commit `bd3773a`).
- `TrailerSnapshot.pricingSource` (v1.4) — `'source' | 'override'`. Set on every snapshot path. Surfaced on saved `quote.trailer.catalog.pricingSource` + `sourceSellPriceExclGst` so dealer-audit reports can compute the override delta forever without re-resolving overrides.
- Pricing Manager staged-publish buffer — `dirty: Map<trailerId, StagedPatch>` in `trailer-pricing-workspace.tsx`. Every edit (inline, waterfall, bulk reset, Global Update) is staged locally until the operator clicks Publish.
- `ModuleSettingsPanel` in `module-settings-panel.tsx` — single source of truth for every module's Settings tab card set.

---

## What Is HelmLogic?

HelmLogic is a marine dealer management SaaS platform. It lets boat brands (vendors) distribute boat data to dealerships (organisations), who can then build quotes, manage inventory, run pricing, distribute sub-dealer price lists, and manage stock logistics. Think of it like a CRM + quoting + pricing + stock management tool for the marine industry.

**Primary client in app**: Northside Marine (orgId: `AcFZVEFA5UDJG2hyetWT`) — a Highfield Boats dealer.

---

## Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Firebase — Firestore (DB), Auth, Storage
- **Deployment**: Firebase App Hosting (`studio--studio-2290360004-3b963.us-central1.hosted.app`)
- **Firebase Project**: `studio-2290360004-3b963`
- **Dev Branch**: `claude/app-overview-wKiZ1` — all active development lands here. Auto-deploys to the dev URL via Firebase App Hosting.
- **Main Branch**: `main` — production. Merge from `claude/app-overview-wKiZ1` when ready.
- **Stale branch — do not use**: `origin/Dev`. An earlier session pushed v1.4 work there by mistake; the April 2026 rescue rebased everything back onto `claude/app-overview-wKiZ1`. Never push to `origin/Dev` and never create a local `Dev` branch tracking it — both fork history. See CLAUDE.md → Key Branch for the push-safety rule.
- **Map Library**: Leaflet + OpenStreetMap (no API key needed, replaced Google Maps)

---

## Firestore Data Hierarchy

```
data-warehouse/{vendorId}/
  ranges/{rangeId}/
    models/{modelId}/
      variants/{variantId}      <- SKU: material + color + sellPriceExclGst

modules/{moduleId}              <- Org's access point to a vendor
  Fields: stockLocations[], stockVisibleToSubDealers, subDealerVisibleColumns[],
          moduleDealerFitCategories[], motorDealerFitCategories[],
          trailerDealerFitCategories[],   <- v1.4
          trailerBrandVendorIds[],        <- v1.4 (on trailers modules)
          regoVendorIds[],                <- v1.4 (on rego modules)
          brandCaptainUserId, brandCaptainUserName,
          moduleManagerUserId, moduleManagerUserName,
          moduleType, mainVendorId, associatedVendorIds[], coverImageUrl

# v1.4 trailers data
data-warehouse/{trailerBrandVendorId}/         <- vendorType: 'Trailer Brand'
  series/{seriesId}/
    trailers/{trailerId}        <- code, name, imageUrl, sellPriceExclGst,
                                    specifications{}, pricingDetail{} (full
                                    Dealer→Nett→CTD→Sell waterfall),
                                    optionalFeatures[], leadTimes{}, supplier

# v1.4 rego data
data-warehouse/{regoVendorId}/                 <- vendorType: 'Rego Authority'
  regoTypes/{regoTypeId}        <- name, sellExclGst,
                                    appliesTo: 'boat'|'trailer'|'both',
                                    description?, isActive?

organisations/{orgId}/
  modelOverrides/{modelId}      <- Org-specific pricing overrides (boats)
  trailerOverrides/{trailerId}  <- v1.4 org-specific sell overrides (trailers)
  dealerFitSelections/
  exchangeRates/{currencyCode}
  priceLists/{priceListId}      <- Sub-dealer price lists
  priceLevelDefinitions/
  productPrices/

users/{userId}/
  quotes/{quoteId}/
    service_items/{itemId}
  notifications/{notifId}
  routes/{routeId}

inventory/{itemId}              <- Stock items (In Stock / On Order)
  Fields: name, stockNumber, label, status, location, soldBy, model, colour,
          serialNumber, material, notes, dateIntoStock, photoUrls[],
          pdfAttachments[], organisationId, moduleId, modelId, rangeId,
          coverImageUrl, variantImageUrl

delivered-deals/{dealId}        <- Delivered/sold boats
  Fields: all inventory fields + consignmentWith, poOrDealNumber, customerNotes,
          deliveryDate, etaSoldDate, motor, motorSerialNumber, trailer,
          invoiced, depositPaid, paidInFull, packageDetails, invoicedAmount,
          isHullOnly, warrantyRegistered, sourceInventoryId

holdRequests/{requestId}        <- Sub-dealer hold requests
  Fields: inventoryItemId, moduleId, inventorySnapshot{}, requestingOrganisationId,
          requestingOrganisationName, requestedByUserId, parentOrganisationId,
          customerId, customerName, status (pending/accepted/rejected),
          resolvedByUserId, rejectionReason, createdAt

customers/{customerId}          <- Customer records (org-scoped)
  Fields: name, email, phone, company, address, notes, organisationId,
          createdByUserId, createdByUserName

# v1.5 feature tracking data (board is shared across all signed-in users)
features/{featureId}            <- Feature request / bug / improvement
  Fields: title, description (HTML), type, status, priority, targetRelease,
          tags[], voteIds[], order (fractional-index for drag-drop),
          acceptanceCriteria[], imageUrls[], commentCount, submitterId,
          submitterName, createdAt, updatedAt
  comments/{commentId}          <- Threaded discussion
    Fields: body, authorId, authorName, createdAt
```

---

## Key IDs (Hard-Coded References)

| Thing | ID |
|---|---|
| Highfield vendor | `LafOLpLb6QIFE856TiD4` |
| Highfield module | `M1Yf3R9igpJDxJnOVr6f` |
| Northside Marine org | `AcFZVEFA5UDJG2hyetWT` |
| Range — Classic | `qo7IePnRzJxjrYyLWhTn` |
| Range — Roll-Up | `EqcKQ51svI1I2Q5poFdl` |
| Range — Ultra-Light | `QsGZuVwutEr5yyMkp97j` |
| Range — Sport | `nQ2LE50z9Tbf2uss0Ote` |
| Range — Adventure | `sEzdrM2fZsrOKA3ACrJp` |
| Range — Patrol | `vfXxDuMpChteKncb7LnG` |
| Range — Coaster | `coaster` |

---

## Pricing Architecture

### Data Flow: Pricing Manager → Quotes
```
Pricing Workspace edits → organisations/{orgId}/pricingStrategies/{vendorId}
    (stores: itemValues with all cost components + price levels)
    ↓
Publish Prices (manual action, publishes ALL levels at once)
    ↓
Writes to data-warehouse variants:
    - sellPriceExclGst (from hull_cash / org shortCode column)
    - priceLevels: { hull_cash, hull_trade, hull_subdealer, ... }
    - activePriceLevel: 'hull_cash'
    ↓
Quote Builder reads sellPriceExclGst OR priceLevels[selectedLevel]
    - Default level: hull_cash (org's shortCode sell price)
    - Sub-dealers: use module's subDealerDefaultPriceLevel
    - Price level selector dropdown in quote builder
    ↓
Finalize saves ALL prices as snapshot (prices locked at save time)
```

### Price Levels (hardcoded)
- `hull_cash` — Cash Price (displayed as "{ORG_SHORTCODE} SELL PRICE")
- `hull_trade` — Trade Price
- `hull_subdealer` — Sub-Dealer Price
- `hull_subdealer_excl` — Sub-Dealer Excl Price
- `hull_aus_sailing` — AUS Sailing Price

### Quote Price Locking
- `buildQuotePayload()` snapshots ALL `sellPriceExclGst` values at save time
- Proposal view reads from saved quote data, NOT live variants
- Pricing changes don't affect existing quotes
- `priceLevelUsed` saved on every finalized quote for audit trail

---

## Module Types

- `catalog` (default) — boat brand catalog with pricing, quoting, stock management
- `motor-brand` — motor catalog with accessories, pricing, promotions (Yamaha)
- `master-price-file` — editable data tables with Excel import/export
- `used-boats` — placeholder module with cover image, coming-soon cards
- `website-listings` — placeholder module with cover image, coming-soon cards
- `trailers` (**v1.4**) — multi-brand trailer catalog with full pricing waterfall + org-level overrides. Workspace: `src/components/trailers-workspace.tsx`. Data: `data-warehouse/{brandVendorId}/series/{seriesId}/trailers/{trailerId}`. Picker: `TrailerCatalogPicker` used by the Highfield quote flow trailer step.
- `rego` (**v1.4**) — shared registration-type catalog for boats + trailers. Workspace: `src/components/rego-workspace.tsx`. Data: `data-warehouse/{regoVendorId}/regoTypes/{regoTypeId}`. Picker: `RegoPicker` used by the boat + trailer rego steps.

Non-catalog modules have `mainVendorId: null` — code must check before creating Firestore doc refs.

---

## Vendor Types

Values stored as strings on `data-warehouse/{vendorId}.vendorType`. Full list maintained in four places (keep in sync):

1. `vendorTypes` array in `src/app/(app)/data-warehouse/page.tsx`
2. `getVendorTypeIcon` switch in the same file
3. `SelectItem` list in `src/app/(app)/data-warehouse/add/page.tsx`
4. `enum` in `src/docs/backend.json`

Current values:
- `Boat Brand` (e.g., Highfield)
- `Motor Brand` (e.g., Yamaha)
- `Trailer Brand` (**v1.4**) — REDCO, TINKA, STACER, DUNBIER, MACKAY, GFAB, NSM CUSTOM
- `Rego Authority` (**v1.4**) — state-by-state registration price catalog (QLD, NSW, VIC…)
- `Electronics Brand`, `Electronics Supplier`, `Parts Wholesaler`, `Master Price File`, `Other`

The MPF browser (`src/components/master-data-browser-dialog.tsx`) excludes vendors with `vendorType` in `{Motor Brand, Trailer Brand, Rego Authority}` because those vendors are catalog/picker-only — they don't sell parts.

---

## Yamaha Motor Module

- `YamahaMotorWorkspace` renders for motor-brand modules
- Tabs: Catalog (motor card grid), Pricing Manager (reuses MasterPriceFileWorkspace), Promotions, Settings
- Motors loaded from `data-warehouse/{vendorId}/dataSets/{motorDataSet}/rows`
- Motor detail Sheet shows specs, image, accessories by category
- Motor specs snapshot saved on quotes: hpRating, shaftLength, control, starting, tiltTrim, fuelTank, prop, warranty

---

## Promotions System

- Stored at `modules/{moduleId}/promotions/{promoId}`
- Types: fixed-amount, per-hp, percentage, category-discount
- appliesTo: motor, rigging, propeller, all-accessories, total
- Image + PDF uploads to Firebase Storage
- Quote display toggles: showOnQuote, showImageOnQuote, showPdfOnQuote
- Active/inactive with audit changelog array
- Currently used in Yamaha workspace Promotions tab

---

## Master Price File

- Vendor in `data-warehouse` with `vendorType: 'Internal'`
- Each dataset at `data-warehouse/{vendorId}/dataSets/{name}/rows/{id}`
- In-app Excel import: each sheet → separate dataset
- Editable inline cells, export (xlsx/csv), search
- Image column auto-detection (imageLink, Image Link, imageUrl)
- Connected to Highfield dealer fit via Master Data Browser (associate MPF as vendor in module settings)

---

## Stock Statuses

- Pending (yellow) — awaiting processing
- On Order (blue) — ordered from supplier
- In Stock (green) — available in warehouse
- In Stock - Sold (purple) — in stock, sold to customer (requires customer)
- On Order - Sold (orange) — on order, sold to customer (requires customer)

---

## Console-Seat Pairing

- Consoles with `associatedSeatId` auto-select paired seat
- Locked seats can't be toggled off while console is selected
- Switching consoles swaps seats automatically
- Seat category hidden when no console selected

---

## Antigravity Skills

1,356 skills installed at `~/.claude/skills/` from antigravity-awesome-skills repo.
Key skills: production-code-audit, code-reviewer, nextjs-best-practices, firebase, typescript-expert, agent-orchestrator, acceptance-orchestrator, parallel-agents.

---

## Motor Dealer Fit Architecture

- **`motorDealerFitCategories`** is stored on the **boat module** (`modules/{moduleId}`), NOT on the motor module
  - Rationale: motor dealer fit items are configured in the context of the boat being quoted, not the motor vendor
- `ModuleDealerFitManager` accepts a `fieldName` prop — pass `"moduleDealerFitCategories"` for standard dealer fit or `"motorDealerFitCategories"` for motor dealer fit
- Motor dealer fit categories appear in quote step 3 with blue-themed headers (distinct from standard dealer fit)

### DealerFitOptions Category Merging

`DealerFitOptions` component (`src/components/dealer-fit-options.tsx`) merges categories from THREE sources:
1. **Global categories** — from `dealerFitCategories` Firestore collection (admin-managed via `/modules/dealer-fit-options` page)
2. **Module-level categories** — from `module.moduleDealerFitCategories[]` (boat dealer fit)
3. **Motor dealer fit categories** — from `module.motorDealerFitCategories[]` (motor dealer fit)

Synthetic category IDs are prefixed `module-` or `motor-` for module-level categories. Selections are matched by category name (case-insensitive) for these synthetic categories.

### Prop Comes Standard

- Optional boolean toggle (`propComesStandard`) in quote flow — default OFF
- User opts in when the motor's prop is included at no extra cost
- Auto-set to OFF when user selects a different propeller from dealer fit or accessories
- Tracked on the quote so proposals and PDFs reflect whether prop was included or purchased separately
- NOT auto-enabled — this is explicitly opt-in behavior

### Motor Module Settings Tab

- Associated vendors list (editable)
- Dealer fit categories via `ModuleDealerFitManager` with `fieldName="moduleDealerFitCategories"`
- Motor dealer fit categories via `ModuleDealerFitManager` with `fieldName="motorDealerFitCategories"`
- Role assignment: Brand Captain + Module Manager

---

## Master Data Browser (Dealer Fit Item Selection)

- Simplified UX: single search bar searches across ALL MPF datasets at once
- Results as cards with image, name, code, source dataset, price
- One-click [+] to add items, right panel for staged items
- No vendor/dataset dropdowns — auto-loads all associated vendor data
- Motor Brand vendors filtered out (Yamaha won't appear in dealer fit)
- `ModuleDealerFitManager` is the ONLY card for dealer fit categories (org-level toggling removed)
- Component: `/src/components/master-data-browser-dialog.tsx`

---

## Module Page Architecture (Critical — Most Complex File)

`/src/app/(app)/modules/[id]/page.tsx` — The central module workspace. ~1400 lines.

### Structure:
1. **Master Price File module** — if `moduleType === 'master-price-file'`, renders `MasterPriceFileWorkspace` (editable data tables)
2. **Motor Brand module** — if `moduleType === 'motor-brand'` OR vendor `vendorType === 'Motor Brand'`, renders `YamahaMotorWorkspace` (catalog + pricing + promotions)
3. **Placeholder modules** — if `moduleType` is `used-boats` or `website-listings`, renders placeholder view with cover image
4. **Sub-dealer early return** — if `isSubDealer`, renders Dashboard, Stock Management, Quotes (if enabled), Price List tabs
5. **Parent org view** — full tabs: Dashboard, Catalog, Stock Management, Pricing, Settings

### Sub-dealer view:
- Dashboard: stats + parent stock card + own stock card + price list access + info panel
- Stock Management: `StockManagementWorkspace` with `isSubDealer=true`, `readOnly=true`
- Price List: `PriceListViewer` showing shared price lists

### Parent org Stock Management tab:
- Renders `StockManagementWorkspace` which has sub-tabs:
  - Stock Boats (filtered to In Stock)
  - On Order (filtered to On Order)
  - Delivered Deals
  - Hold Requests (accept/reject dashboard)
  - Map View (Leaflet)
  - Assignments (sub-dealer stock distribution)

### Pricing tab:
- Sub-tabs: Pricing Matrix (`HighfieldPricingWorkspace`) + Price Lists (`PriceListManager`)

### Settings tab:
- `OrganisationModuleConfig` — full module settings
- `StockLocationManager` — locations + sub-dealer sharing
- `ModuleDealerFitManager` — per-module categories
- `ModuleRoleAssignment` — Brand Captain + Module Manager

### Key variables:
- `isSubDealer = !!currentMemberOrg?.parentOrganisationId`
- `userPermissions` computed from `userProfile.organisationRole` + `organisation.permissions`
- `isAdmin` = HelmLogic Admin role
- `activeTab` state controls main tabs
- `dashboardStockCounts` from inventory query

---

## Permissions System

Defined in `manage-organisation-page.tsx`:
```
can_access_module, can_access_pricing_manager, can_create_quotes,
can_edit_boat_data, can_view_subdealers, can_access_price_book,
can_access_settings, can_manage_stock, can_view_stock
```

Stored as `organisations/{orgId}.permissions.{roleId}.{permissionKey}: boolean`
User's role: `users/{userId}.organisationRole` (role ID string)

---

## Agent Team Setup

- `.claude/agents/scrum-master.md` — Task coordinator
- `.claude/agents/developer.md` — Code builder (spawned with worktree isolation)
- `.claude/agents/test-lead.md` — Code reviewer
- `.claude/settings.json` — Agent teams enabled + permissions

### Workflow:
1. User gives task to Scrum Master (main Claude session)
2. Scrum Master breaks down into developer tasks
3. Developers spawned in parallel with `isolation: "worktree"`
4. Test Lead reviews merged work
5. Push to dev (`claude/app-overview-wKiZ1`) for deployment
6. Push to main for production release

---

## Firestore Security Rules

Rules must be **manually deployed** — paste into Firebase Console > Firestore > Rules.
Current rules file: `/firestore.rules`

Key collections and access:
- `modules` — read/write for all signed-in users
- `inventory`, `vessels`, `delivered-deals`, `holdRequests`, `customers` — read/write signed-in
- `organisations` — read signed-in, write admin or org member
- `users` — owner, admin, or same-org member

---

## Style Guide (UI Conventions)

- Font sizes: `text-[9px]` for labels, `text-[10px]` for small uppercase, `text-xs` for body
- Labels: `uppercase tracking-widest font-black text-slate-400`
- Buttons: `rounded-xl` for small, `rounded-2xl` for medium
- Borders: `border-2` (not `border`)
- Dialogs: `rounded-3xl border-4 shadow-2xl`
- Tables: `rounded-2xl border-2 border-slate-100` container
- Status badges: green (In Stock/Delivered), blue (On Order/Pending), orange (Sold)
- Material badges: red (PVC), grey (HYP)
- Toasts: `toast({ title })` success, `toast({ variant: 'destructive', title })` error
- Always `console.error(error)` in catch blocks before toasts

---

## Common Gotchas & Lessons

| Situation | Rule |
|---|---|
| Firestore `orderBy('field')` | Silently excludes docs without that field. Use unordered queries for models/variants. |
| Firestore rules not working | Rules must be manually deployed. App Hosting only deploys code. |
| `useMemo` for Firestore refs | Must use `useMemoFirebase` not `useMemo` — prevents infinite re-render loops. |
| Vendor ID in data-warehouse | Always use `LafOLpLb6QIFE856TiD4`, never `highfield` (slug). |
| `updateDoc` with `undefined` | Firestore throws. Always use `\|\| null` or `\|\| ''` fallbacks. |
| Radix Tabs with two contexts | Use a SINGLE `<Tabs>` wrapping both `<TabsList>` and `<TabsContent>`. Two separate `<Tabs>` causes empty content. |
| TabsContent with absolute positioning | Use `absolute inset-0` with `data-[state=inactive]:hidden` for proper tab panel sizing. |
| Firestore `in` query limit | Max 30 elements. Slice arrays before using `where('field', 'in', arr)`. |
| Sub-dealer stock visibility | Use `filterOrgId="all-with-parent"` to show parent + own stock. |
| Stock table `readOnly` | Controlled by `!isAdmin && !userPermissions.can_manage_stock`. Hides checkboxes, edit, delete, assign buttons. |
| Import duplicates | Use multi-field fingerprinting (stockNumber + serialNumber + model+colour+label combo). |
| Motor dealer fit categories location | Store `motorDealerFitCategories` on the BOAT module, not the motor module — dealer fit is in the context of the boat being quoted. |
| DealerFitOptions category sources | Must merge global + module + motor categories — three sources, not just one. |
| `propComesStandard` default | Default OFF (opt-in). Do NOT auto-enable — user explicitly toggles when applicable. |
| Next.js `<Image>` external URLs | Breaks with Cloudflare anti-hotlinking CDNs — always use native `<img>` for external URLs. |
| Post-refactor variable cleanup | After renaming/removing variables, search codebase for ALL old references — stale refs cause ReferenceErrors at runtime. |
| Worktree merges can lose code | Always diff against original before taking worktree version in conflict resolution. |
| `mainVendorId: null` | Non-catalog modules crash Firestore `doc()`. Always check `moduleData?.mainVendorId` before creating ref. |
| LFS blocks worktrees | Use `git config lfs.fetchexclude "*"` or `git lfs install --skip-smudge` to skip LFS downloads. |
| `ProposalPDFDocument` needs `financials` | Use `buildQuoteFinancials()` from `src/lib/quote-financials.ts`. Missing prop causes silent PDF crash. |
| `setValue` in react-hook-form | Must pass `{ shouldDirty: true }` or form resets wipe the value on re-render. |
| Removing JSX elements | Must remove ENTIRE element (opening + closing tags + content). Orphaned tags break webpack build. |
| Select-all with filters | Must operate on filtered/sorted results, not total dataset. |
| Filter persistence across views | Reset all filters (search, status, location, material) when switching workspace tabs. |
| Promotion type change | Clear ALL amount fields (fixedAmount, perHpAmount, percentage) to null when type changes — prevents stale data. |

---

## v1.2 Release Status — SHIPPED

- **Released**: 2026-04-10
- **Stats**: 87 commits, 65 files changed, 4,423 lines of new code
- **QA**: Full surface test (30+ cases) — ALL PASS
- **Static analysis**: Clean — 688 icon usages verified, zero undefined variable references
- **Firestore rules**: Deployed
- **Merged**: `claude/app-overview-wKiZ1` → `main`
- **v1.3 branch**: `claude/v1.3-dev` — 12 client requirements, separate from v1.2

---

## v1.2.1 "Pricing Precision" — SHIPPED

- **QA**: 7/7 tests passing
- **Released**: 2026-04-10
- **Focus**: Client pricing feedback — GST rounding, motor Trade Price for sub-dealers, dealer fit Act Sell field
- **Key changes**:
  - Inc GST rounded UP to whole dollars (`Math.ceil`) per item row
  - Motor `priceLevels` object built from Yamaha columns (NSM Retail → hull_cash, Trade Price → hull_trade/hull_subdealer, etc.)
  - Motor hero card and grid cards use `getPriceForLevel()` (not hardcoded sellPriceExclGst)
  - `resolvePrice()` in finalize dialog snapshots price-level-resolved values
  - Dealer audit section in stock detail panel (cost/sell/margin breakdown)

---

## v1.3.0 — SHIPPED 2026-04-17

- **20+ commits** on dev, merged to main
- **13 client requirements** addressed + customer feedback fixes + 3 critical bugs caught in static analysis
- **Key features**: PDF upload per section, Engine/Trailer Specs buttons, Pre-Rig display, Yamaha rebate auto-apply, NSM Extended Warranty + Service Plan, Trailer enhancements (custom options + dealer fit), Admin/Trade-In section, multi-engine HP badges, currency format (whole dollars no .00)
- **Customer fixes**: Photo save in catalog grid (modelOverrides merge), stock column order (Model first), Pending sub-tab, interactive location dropdown
- **Pre-release static fixes**: stock-item-detail null safety, inventory-list and customer-list Firestore `in` 30-element slicing
- **New testing infrastructure**: Playwright suite (63 tests), `testing/` folder with per-release subfolders, full handbook rewrite for new QA hire

### Same-day hotfix v1.3.1 (2026-04-17) — Loading overlay stuck on refresh
- **Severity**: prod down for any user refreshing on a module URL with `?range=` / `?model=` params
- **Root cause**: my v1.3 refresh persistence stripped `view=ranges` as a "default" but kept `model=X`. On refresh, view defaulted to 'ranges' while selectedModelId was restored — the loading overlay fired on `masterModelLoading` regardless of view and froze the UI
- **Fix** (commits `be870f6` → main `3333246`):
  1. View inferred from deepest URL param: `?model=X` → `'bmt'`, `?range=X` → `'models'`
  2. Loading overlay now scoped to `view === 'bmt'` — ranges/models views can't be blocked by model data they don't render
- **Why Playwright missed it**: the refresh tests reloaded within seconds of opening the editor so `?view=bmt` was explicitly in the URL. The partial-param case (URL normalized to `?range=X&model=Y` only) wasn't covered
- **Permanent lessons** (in CLAUDE.md + evolution.md):
  - Loading overlays MUST be scoped to the view that consumes the data
  - URL persistence that strips defaults WILL produce partial param combos — init must infer from deepest param
  - Every URL-synced state needs refresh tests for every param combo

### Eve-of-release hotfixes (2026-04-16)
- **Update Config now unblockable** — `highfieldModelSchema` rewritten with `optional().nullable().default()` on every field + `.passthrough()`. `model-configuration-editor.tsx` got an `onValidationError` handler that walks the nested errors object to log the deepest failing path, then calls `onSubmit(form.getValues())` directly so the save still happens. Validation is a safety net only.
- **Replace cover image button** — switched from shadcn `<Input type="file">` in `<label>` to native `<input type="file" hidden>` + Button onClick triggering `nextElementSibling.click()`. Resets `e.target.value = ''` after upload so the same file can re-upload.
- **Refresh restores page state** — `activeTab` / `view` / `selectedRangeId` / `selectedModelId` on `modules/[id]/page.tsx` now sync to URL search params (`?tab=`, `?view=`, `?range=`, `?model=`) via `window.history.replaceState`. Same pattern applied to `yamaha-motor-workspace.tsx` (`?motorTab=`) and `stock-management-workspace.tsx` (`?stockView=`).

---

## v1.4 Trailers Module — READY ON BRANCH (2026-04-22)

- **Status**: All v1.4 work shipped on `claude/app-overview-wKiZ1`. Awaiting draft PR → main.
- **Design doc**: `tasks/v1.4-trailers-module-design.md`
- **Live status**: `tasks/v1.4-trailers-module-status.md`
- **Release notes**: `tasks/RELEASE_NOTES_v1.4.md`
- **Summary**: One `trailers` module type, many trailer brand vendors. Mirrors Yamaha motor workspace pattern. Each boat model gets `trailerAssignments[]` — per-model trailer list with pre-configured dealer fit. Quote Step 4 reads assignments instead of single `trailerConfig`, via `TrailerCatalogPicker` + `effectiveTrailerConfig` shadow memo.

### What's on the Branch Today
- **`trailers-workspace.tsx`** — Dashboard (default) / Pricing Manager / Settings tabs. URL-synced via `?trailerTab=`. Legacy `catalog` value remaps to `dashboard`.
- **`trailer-dashboard.tsx`** — Yamaha-style dashboard (~1,350 lines). Aggregate loader across selected trailer-brand vendors (flat `getDocs`, not `useCollection`, so brand list can grow/shrink without conditional hooks). Boat-size-range grouping, cards/table view toggle (`?trailerView=`), search across code/name/brand/series/supplier/features, admin-only image + field editors inline in the detail sheet.
- **`module-image-editor.tsx`** — reusable `logoUrl` editor card; drop-in for any module's Settings tab. Currently wired into Trailers.
- **`trailer-catalog-picker.tsx`** — shared picker dialog used by the Highfield quote flow; subscribes to org `trailerOverrides`; emits a frozen `TrailerSnapshot` on select.
- **Pricing workspace** — full waterfall per trailer with xlsx column codes, per-org overrides at `organisations/{orgId}/trailerOverrides/{trailerId}`.
- **Rego module** (`rego-workspace.tsx`) — Types + Settings tabs. `data-warehouse/{regoVendorId}/regoTypes/{id}` docs with `appliesTo: 'boat' | 'trailer' | 'both'`. Authoritative over trailer pricingDetail `regoTypeHint` fields.
- **Imports** — Yamaha MPF and Sam Allen uploaders converted from clear-and-replace to upsert-by-natural-key. Detected key candidates: Part Number → Model Code → Model ID → SKU → Code → ID → Model → Model Name → first column fallback. Operators can partial-import without wiping unrelated rows.

### Trailer-on-Boat-Quote Integration (verified 2026-04-22)
- `quote.trailer.cost` persisted (mirrors motor's `costPrice`). Trailer margin visible in saved quotes.
- `quote.trailer.catalog.specifications` snapshot at pick-time → proposal PDF renders specs strip (boat size / length / ATM / tare / wheel size / winch) plus `BRAND · CODE` subtitle.
- `DealerFitOptions` four-source merge includes `trailerDealerFitCategories`. Trailer dealer-fit step is gated on trailer selection in `highfield-quote-flow.tsx`.
- Rego on trailer: Rego module snapshot > legacy `isTrailerRegoSelected` + `model.registration.trailerPrice12Months`. `pricingDetail.regoTypeHint` / `regoDollarsHint` are informational only (xlsx import notes) and deliberately NOT auto-applied — they'd cross-state silently.

---

## v1.6.1 Patch — shipped-release lock + v1.6 self-seed — SHIPPED (2026-04-27)

- **Status**: PR #30 merged to main 2026-04-27. Release notes at `tasks/RELEASE_NOTES_v1.6.1.md`.
- **What it adds**: New `shipped?: boolean` flag on `RELEASE_WINDOWS` in `src/lib/release-schedule.ts` + `isReleaseShipped(releaseKey)` helper. v1.6 marked shipped. Drives a coordinated read-only treatment everywhere a feature surfaces:
  - Roadmap header: emerald background + "Shipped" pill + lock icon (replaces capacity colour-coding for that column)
  - Roadmap cells: emerald wash; `useDroppable({ disabled: true })`; `onDragEnd` rejects shipped-source/target moves with a destructive toast
  - Roadmap chips: `useDraggable({ disabled: true })`; emerald border + lock icon on the status line
  - Backlog row pill: emerald + lock icon when targetRelease is shipped
  - Detail sheet (`FeatureDetailBody`): emerald lock banner + every scope input disabled (status / type / priority / epic / points / release / title / description / accept / archive). Comments + voting + tags stay live.
- **`disabled?: boolean` prop** added to `ReleasePicker`, `EpicPicker`, `PointsPicker` so the lock can be threaded down without rebuilding each picker. shadcn `<Select disabled>` propagates correctly.
- **v1.6 self-seed (one-shot, removed)**: A "Populate v1.6 stories" admin button on the Backlog seeded 13 stories representing the v1.6 work — under a new **Platform & Tooling** epic (id `platform-tooling`, indigo, order 700) — all `status: shipped`, `targetRelease: v1.6`, auto-accepted by the runner. 40 pts total. After the seed ran successfully on dev, the button + `src/lib/v16-self-seed.ts` were stripped (commit `9dcfd9d`). The seeded data is now the source of truth.
- **Ritual for future ships**: when a release merges to main, set `shipped: true` on its `RELEASE_WINDOWS` entry. That's the only flag — every visual + behavioural lock follows automatically.

## v1.6 Planning System — SHIPPED (2026-04-27)

- **Status**: PR #29 merged to main 2026-04-27. Release notes at `tasks/RELEASE_NOTES_v1.6.0.md`.
- **What it adds**: 3 new tabs on `/feature-tracking` (Backlog, Roadmap, Release Notes — Backlog is the new default). New `epics/{id}` Firestore collection. 7 new optional fields on `features/{id}` (epicId, points, deletedAt, deletedBy, acceptedAt, acceptedBy, acceptedByName). Per-story Accept button. 8-bucket release schedule (v1.6 / v1.7 / v1.7.5 / v1.8 / v1.8.5 / v1.9 / v1.9.5 / v2.0). 108 features seeded (6 epics × 22 features + 41 expansion + 14 content + 16 decisions + 16 ops).
- **New components**: `feature-tracking-view.tsx` (tab switcher), `backlog-view.tsx`, `roadmap-view.tsx`, `create-epic-dialog.tsx`, `mvp-plan-seed.ts` (seed payload + sync functions). `feature-tracking-board.tsx` extended with epic chips, points badges, Accept UI, soft delete + Archive view.
- **Sub-dealer gate**: `/feature-tracking` blocked for sub-dealer org users (sidebar hidden + page-level gate). The Firestore rule for `epics/` and `features/` left at "any signed-in user" because the v1.5.1 isSubDealer rule had a bug that denied the parent dealer admin.
- **Capacity colour-coding** thresholds: POINTS_AMBER=35, POINTS_RED=50. Each release ≤40 pts per stakeholder guidance.
- **Email integration parked** — Trigger Email extension installed but SMTP config throws. Once unblocked, @-mentions in comments + customer email notifications go on the roadmap.
- **Revolution explicitly out of scope** for the active plan. Stakeholder direction. 3 Revolution-specific stories were deleted from the seed payload.

## v1.5 Feature Tracking — ON BRANCH (2026-04-24)

- **Status**: All 7 build stages shipped on `claude/app-overview-wKiZ1`.
- **Design doc**: `tasks/v1.5-feature-tracking-design.md`
- **Live status**: `tasks/v1.5-feature-tracking-status.md`
- **Summary**: New `/feature-tracking` route. Team-wide Kanban (5 columns: Submitted → Under Review → Planned → In Progress → Shipped). Every signed-in user can create, vote, comment, drag, and delete. Fully open Firestore rules per spec.

### What's on the Branch Today
- **`src/components/feature-tracking-board.tsx`** — single file, ~1,600 lines. Hosts FeatureTrackingBoard (DndContext + DragOverlay + optimistic reorder state), ColumnView (per-column sort mode + useDroppable), FeatureCard (useSortable + click-to-open + live vote), CreateFeatureDialog (TipTap + image upload + acceptance criteria + tags), FeatureDetailSheet / FeatureDetailBody (live comments subscription, metadata editors, description edit flow, delete).
- **`src/components/feature-rich-text-editor.tsx`** — TipTap wrapper (StarterKit + Placeholder + Link). Toolbar: H2/H3, bold, italic, bullet/numbered lists, link, undo/redo. Exports `FeatureRichTextEditor` + `FeatureDescriptionView` (read-only render for the detail sheet).
- **`src/components/feature-image-uploader.tsx`** — multi-file upload to `features/{featureId}/` in Firebase Storage, plus paste-URL mode. Max 10 images.
- **`src/app/(app)/feature-tracking/page.tsx`** — thin route.
- **`src/lib/nav-links.ts`** — Lightbulb entry between Pricing Manager and Settings.
- **`firestore.rules`** — `match /features/{id}` and nested `comments` subcollection, both fully open to signed-in users.

### Patterns worth remembering
- **Fractional-index reorder** for drag-drop: `newOrder = (prev.order + next.order) / 2`, or `±10` at edges. No bulk renumber; concurrent drags don't fight.
- **Optimistic drag UI** via a board-level `optimistic: Record<id, { status, order }>` overlay that's cleared once the Firestore snapshot catches up or rolled back on write failure.
- **Drag vs click coexist** via `PointerSensor({ activationConstraint: { distance: 5 } })`. A plain click opens the detail sheet; moving 5px starts a drag.
- **Client-side doc ID before save** — `doc(collection(firestore, 'features')).id` in the create dialog so the image uploader has a path to write to before the feature doc exists.
- **Per-column sort disables drag** when non-manual — otherwise a drop would stomp `order` and the sort criterion would snap it back visually.
- **commentCount denorm** — card badge reads `feature.commentCount`; add/delete comment also calls `increment(±1)` on the parent doc so we don't subscribe to the subcollection from the card.

---

## Git Workflow

- **Dev branch**: `claude/app-overview-wKiZ1` — auto-deploys via Firebase App Hosting
- **Main branch**: `main` — production, merge from dev
- **Feature branches**: spawned for isolated work, merged to dev
- Push: `git push -u origin <branch>` with retry on 403 (2s, 4s, 8s, 16s)
- Always create new commits, never amend
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`

## Deployment Workflow

1. Commit to `claude/app-overview-wKiZ1` → Firebase App Hosting auto-deploys dev
2. Manually verify on dev URL
3. Run full Playwright smoke: `npm run test:e2e:smoke`
4. When green, merge to `main`: `git checkout main && git merge claude/app-overview-wKiZ1 && git push origin main`
5. Firebase deploys main → prod
6. Verify on prod URL immediately
7. Manually deploy Firestore rules if changed (Firebase Console → Firestore → Rules, paste from `firestore.rules`)

## Hotfix Workflow (same-day prod fix, per v1.3.1)

1. Fix on dev branch, commit with `fix(vX.Y.Z): ...` message
2. Confirm test passes locally
3. Merge to main immediately: `git checkout main && git merge claude/app-overview-wKiZ1 && git push origin main`
4. Post-mortem in release notes: `tasks/RELEASE_NOTES_vX.Y.Z.md`
5. Add regression tests (the class that should have caught it, not just the exact case)
6. Update `CLAUDE.md` "Known Lessons" + `.agents/evolution.md`

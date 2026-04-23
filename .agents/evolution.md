# HelmLogic AI Evolution Context

This file serves as the persistent memory and reasoning log for the HelmLogic development agents. It is updated after every significant change to ensure continuity and logic transfer between sessions.

## Project DNA
- **Framework**: Next.js (App Router)
- **Database/Backend**: Firebase Firestore & Storage
- **UI Library**: Radix UI + Tailwind CSS (shadcn/ui)
- **Map**: Leaflet + OpenStreetMap (no API key)
- **Core Entities**: Data Warehouse, Modules, Organisations, Inventory, Quotes, Promotions
- **Skills Library**: 1,356 antigravity skills installed at `~/.claude/skills/`

## Architectural Logic & Philosophy

### 1. Data Integrity (The "Inconsistency Guard" Pattern)
The Data Warehouse often contains partial rows or missing fields. Always implement robust fallbacks. Never assume a field exists.

### 2. Robust Firestore Payloads (Critical)
Firestore `setDoc()` and `addDoc()` calls fail if ANY field contains `undefined`. Always use `|| null`, `|| ''`, `|| 0` fallbacks.

### 3. Module Type System
Modules have a `moduleType` field that controls rendering:
- `catalog` (default) — boat brand with full pricing, quoting, stock management
- `motor-brand` — motor catalog with accessories, pricing, promotions (detected by `vendorType === 'Motor Brand'` OR `moduleType === 'motor-brand'`)
- `master-price-file` — editable data tables with Excel import/export
- `used-boats` / `website-listings` — placeholder modules with cover image

Non-catalog modules have `mainVendorId: null` — ALWAYS check before creating Firestore doc refs.

### 4. Stock Management Architecture
- `inventory/{itemId}`: Single collection for In Stock, On Order, Pending, and Sold items (differentiated by `status`)
- `delivered-deals/{dealId}`: Separate collection for completed deals
- `holdRequests/{requestId}`: Sub-dealer → parent org workflow
- `customers/{customerId}`: Org-scoped customer records
- Status values: Pending, On Order, In Stock, In Stock - Sold, On Order - Sold
- Sold statuses require customer attachment

### 5. Pricing Architecture
- Pricing workspace calculates costs → freight → margins → final prices
- Publish writes ALL price levels to variants: `sellPriceExclGst` (from hull_cash) + `priceLevels` object
- Quote builder reads `priceLevels[selectedLevel]` with fallback to `sellPriceExclGst`
- Default price level: `hull_cash` (org's shortCode column)
- Prices are LOCKED at quote save time — proposals read from saved data

### 6. Promotions System
- `modules/{moduleId}/promotions/{promoId}` — per-module promotions/rebates
- Types: fixed-amount, per-hp, percentage, category-discount
- Image + PDF attachments with quote display toggles
- Active/inactive with audit changelog
- Currently used in Yamaha motor workspace

### 7. Master Price File
- Vendor in data-warehouse with datasets containing supplier price lists
- In-app Excel import: each sheet becomes a dataset
- Editable tables with inline cell editing
- Image column auto-detection
- Linked to Highfield dealer fit options via Master Data Browser

### 8. Module Page Architecture (Critical — Most Complex File ~1400 lines)
`/src/app/(app)/modules/[id]/page.tsx` has multiple early returns:
1. Non-catalog module (master-price-file) → MasterPriceFileWorkspace
2. Motor brand module → YamahaMotorWorkspace  
3. Placeholder modules (used-boats, website-listings) → placeholder view
4. Sub-dealer → separate tabbed view
5. Parent org → full tabs (Dashboard, Catalog, Stock, Pricing, Settings)

### 9. Radix Tabs Gotcha
MUST use a SINGLE `<Tabs>` component wrapping both `<TabsList>` and `<TabsContent>`. Use `absolute inset-0` positioning for tab panels with `data-[state=inactive]:hidden`.

### 10. Agent Team Development
- Spawn developer agents with `isolation: "worktree"` for parallel work
- LFS causes worktree creation failures — use `git config lfs.fetchexclude "*"` to skip
- Always diff against original before resolving merge conflicts
- Check imported components exist before pushing (placeholder stubs if needed)
- Build verify (`npm run build`) before every push to dev/main

## Session History

### Session: April 23, 2026 — v1.4 Pricing-Manager Uplift + Day-1 Tester Remediation
- **Context**: v1.4 had shipped to `claude/app-overview-wKiZ1` but day-1 testing surfaced a backlog of UX gaps and missing functionality. Single long session covering two distinct workstreams.
- **Workstream 1 — Pricing Manager Highfield-style uplift (8 stages)**: rebuilt the trailer pricing manager to match Highfield's depth. Stage 1a widened the override schema (`pricingDetail: Partial<Record<key, number>>`) without UI changes. Stage 1b swapped the single-purpose SellCell for a generic EditableCell. Stage 1c extended inline editing to every visible numeric column. Stage 1d made the waterfall expansion rows editable. Stage 1e grouped rows into a Brand→Series→Trailer tree with collapse/expand + Expand All / Collapse All. Stage 2a added multi-select with tri-state banner checkboxes + a bulk-reset action bar. Stage 2b added a Global Update dialog (Set to / + Amount / − Amount / + % / − % across selected or filtered). Stage 2c refactored every edit path into a local staged buffer + Publish / Discard buttons matching Highfield's mental model.
- **Workstream 2 — Day-1 tester remediation (15 issues)**: polish (banner colour uniformity, padding), admin gate dropped for v1.4 editing so dealer-admins can edit, reusable `<ModuleSettingsPanel>` brings every module's Settings tab to parity (Module Image + Associated Vendors + Associated Modules + DF Categories + Sub Dealers + Module Roles), new `associatedModuleIds[]` concept threaded through trailer catalog picker + DealerFitOptions 5-source merge + critical quote-flow Step 5 trailer DF merge (commit `0b83ead`), per-boat-model trailer assignments (commit `0cf9300`, both Highfield model editor + Catalog Explorer TRAILER OPTIONS tab) with auto-pre-select on quote, DealerFitOptions in trailer detail sheet (Yamaha pattern), quote-flow Step 4 redesign (tiles-only, no catalog browse, click to switch), Catalog Explorer cleanup (legacy freeform cards removed), broken-image carousel fix, Trailer Specs modal match Engine Specs style, poof bug (trailerAssignments missing from form defaultValues).
- **Key bugs caught**:
  1. **Step 5 DF merge** — the quote flow had its own `trailerModuleCategories` memo that bypassed the Stage B.2 DealerFitOptions merge. Linking the Trailer module via Associated Modules gave you catalog narrowing + boat-step DF merge but NOT the dedicated trailer DF step in Step 5. Fix: parallel the merge in the quote flow's memos.
  2. **Trailer assignment "poof"** — form's `getSafeDefaultValues` didn't include `trailerAssignments`, so `useFieldArray` initialised empty on reload even when Firestore had the data. Save worked, reload didn't. Fix: add the field to defaultValues.
  3. **Broken Build Preview tile** — carousel always pushed a 'boat' slide with `url: model.coverImageUrl || ''`, so missing cover images rendered a broken-img placeholder. Fix: only push slides when URL is truthy.
- **Permanent learnings**:
  - React Hook Form `useFieldArray` initializes from `defaultValues`, not from the underlying source directly. If a field is added to the schema but not threaded into `getSafeDefaultValues`, the form will silently show empty on reload even when Firestore has the data.
  - When two code paths read the same config field (e.g. trailer DF categories), merging in one path does NOT automatically flow through to the other. The quote flow and DealerFitOptions both read trailer DF, from different memo chains. Fix both or neither.
  - shadcn Sheet's built-in close X is absolute-positioned at `top-4 right-4`. Any secondary button in the header row must reserve ≥32px right-margin (`mr-8`) to avoid overlap.
  - Next.js `<Image>` with `url: ''` renders as alt-text ("Build Preview"). Always guard slide arrays to skip empty URLs — `if (url) slides.push(...)`.
- **Release stats at session end**: 66 commits on the branch since divergence from `main`, 65 files changed, +11,411 / −817 lines. All tester-facing test cases in `testing/v1.4/test-cases.md` updated with Section M (15 subsections tracking every day-1 fix) + M.9 critical end-to-end walkthrough.

### Session: April 22, 2026 — v1.4 QA Remediation + Trailer-Quote Parity
- **Context**: The v1.4 Trailers + Rego ship from the April 20 session left a handful of operator-ergonomics gaps the client flagged during QA. This session broke the remediation into 8 small chunks and fixed them sequentially, then verified and closed three additional gaps the quote-flow review surfaced on the trailer-on-boat-quote path.
- **Shipped** (all on `claude/app-overview-wKiZ1`, zero new TypeScript errors, full Playwright suite still parses at 70 tests):
  1. **Chunk 4** — Yamaha-style trailer dashboard (`src/components/trailer-dashboard.tsx`, ~1,350 lines). Replaced the card-grid "Catalog" tab with a banner + boat-size-range grouping (analogue of motor HP ranges) + aggregate stats. Tab URL param migrated from `catalog` → `dashboard` with legacy remap.
  2. **Chunk 5a** — Admin-only trailer image editor (upload / paste URL / remove) inline in the detail sheet. Writes to the master catalog doc; in-memory state mirrors via `(id, vendorId)` tuple patching.
  3. **Chunk 5b** — Reusable `ModuleImageEditor` card wired into Trailers Settings as the first item; drop-in for any module workspace.
  4. **Chunk 5c** — Admin-only trailer model editor (basic / specs / features / factory options) inline in the detail sheet. Sticky save bar; pricing waterfall stays in the Pricing Manager.
  5. **Chunk 3** — Yamaha MPF and Sam Allen uploaders converted from clear-and-replace to upsert-by-natural-key (Part Number → Model Code → SKU → Code → ID → Model → Model Name → first column fallback). Toast reports `N updated · M created · K skipped (no key)`.
  6. **Chunk 6** — Dashboard cards/table view toggle with URL persistence (`?trailerView=table`) + broader search (now matches supplier + feature text).
  7. **Chunk 7** — Playwright smoke extended to 7 trailer specs: default-tab rename to Dashboard, view-toggle + URL assertion, Settings module-image editor, detail-sheet edit affordance.
  8. **Chunk 8a-c** — Trailer-on-boat-quote parity. Sub-agent review found three gaps: trailer `cost` captured in snapshot but dropped at finalize, trailer `specifications` never rendered on the proposal PDF, and `pricingDetail.regoTypeHint` never consulted in the quote. Fixes: persist `cost` alongside motor's `costPrice`; snapshot `specifications` onto `quote.trailer.catalog` and render a `BRAND · CODE` subtitle + specs strip (boat size / length / ATM / tare / wheel size / winch) on the PDF trailer block; explicitly document that rego hints are informational-only (the Rego module is authoritative) and label them "info only" in the dashboard.
- **Permanent learnings added to CLAUDE.md**:
  - Imports must upsert by natural key — clear-and-replace destroys operator edits on any row not in the partial upload. Detect the key column with a priority list of canonical names, fall back to the first column, toast what happened.
  - Aggregate flat-list loaders across a dynamic vendor set must use `getDocs` not `useCollection` — conditional React hooks are illegal, and vendor lists shrink/grow with brand filters.
  - Pick-time snapshots must include every field the downstream renderer will need — the finalize payload can drop snapshot fields silently, breaking PDF rendering without any type error. Check the PDF template against the snapshot shape when extending either.
  - State-specific / jurisdictional data (rego pricing, tax tiers) must NOT auto-populate from catalog import hints. Catalog hints are xlsx operator notes — they're not state-aware. Authoritative systems (the Rego module) must drive these values; hints stay informational and must be labelled as such at the render site with an in-code comment explaining why.
- **Files touched**: `src/components/trailer-dashboard.tsx` (new), `src/components/module-image-editor.tsx` (new), `src/components/trailers-workspace.tsx`, `src/components/master-price-file-workspace.tsx`, `src/components/sam-allen-uploader.tsx`, `src/components/finalize-quote-dialog.tsx`, `src/components/proposal-pdf.tsx`, `tests/v1.4-trailers.spec.ts`, plus a full doc sweep (CODEBASE_MAP, status, release notes, SESSION_HANDOVER, this file, START_HERE, CLAUDE.md).

### Session: April 21, 2026 — v1.4 Branch Rescue + LFS Drop
- **Context**: v1.4 Trailers + Rego + testing-docs-restructure work had been committed to a local branch named `Dev` and pushed to `origin/Dev` over multiple sessions. User pointed out `origin/Dev` is not the real dev branch — `claude/app-overview-wKiZ1` is. 19 commits had to be moved across without losing work.
- **What happened**:
  1. Local `Dev` was behind `origin/claude/app-overview-wKiZ1` by 6 commits (bootstrap docs, v1.3.1 fix, Playwright cert trust, spec quality upgrades) and ahead by 19 (all of v1.4). Branches had genuinely diverged.
  2. Rebase onto `origin/claude/app-overview-wKiZ1` failed mid-flight because the LFS backend returned HTTP 502 while trying to smudge the 6.6 MB `Trailer Module.xlsx` source file. `git rebase --abort` also failed for the same reason.
  3. Escape hatch: `git config --local filter.lfs.smudge "git-lfs smudge --skip -- %f"` + matching `filter.lfs.process` override let checkout skip LFS entirely. `git reset --hard` cleared the half-done rebase, then the rebase was retried cleanly.
  4. Three conflict points resolved during rebase — `.agents/evolution.md`, `tasks/SESSION_HANDOVER.md` (twice), `testing/README.md`. All three were "both sides added distinct content" — resolved by keeping both.
  5. Push still failed: LFS 502 persisted across 4 retries with exponential backoff (2s/4s/8s/16s). Root cause was that the `.xlsx` LFS commit from earlier in v1.4 couldn't be re-verified against the broken batch endpoint.
  6. Realisation (user prompt): the xlsx was a source artifact. The seed script had already imported 449 trailers to Firestore; the xlsx had zero operational value. Dropped it with `git rebase --onto 546d410^ 546d410 claude/app-overview-wKiZ1`, leaving the FINDINGS.md that captured the schema decisions. Push went through immediately.
  7. Local `Dev` deleted, local branch now `claude/app-overview-wKiZ1` tracking origin. `origin/Dev` left alone on remote (per user).
- **Permanent learnings added to CLAUDE.md**:
  - Canonical dev branch is `claude/app-overview-wKiZ1` — never push to or create a `Dev` branch. Confirm `git rev-parse --abbrev-ref HEAD` before every push.
  - Don't commit vendor source spreadsheets (`.xlsx`/`.xls`) — import to Firestore, keep a FINDINGS.md beside the seed, gitignore the source. The xlsx becomes dead weight and blocks pushes when LFS is flaky.
  - LFS smudge failures block rebase and checkout too, not just clone. `filter.lfs.smudge --skip` via `git config --local` is the escape hatch. If a dead LFS commit is already in history, drop it with `git rebase --onto <commit>^ <commit> <branch>`.
- **Files touched**: `CLAUDE.md`, `tasks/SESSION_HANDOVER.md`, `.agents/evolution.md` (this file), `.gitignore`. No app code changed.

### Session: April 17, 2026 — v1.3.1 Production Hotfix (Loading Overlay Stuck)
- **Severity**: PROD DOWN. Users refreshing on a module page with `?range=X&model=Y` in the URL (my v1.3 refresh persistence) got stuck behind the "Initializing Precision Build" overlay indefinitely. Module workspace totally unusable.
- **Root cause**: Three bugs converged in one spot:
  1. My URL-sync effect stripped `view=ranges` as a "default" value but kept `model=X` in the URL.
  2. On refresh, `useState` init restored `selectedModelId` from URL but `view` defaulted to `'ranges'`.
  3. The loading overlay condition was `{isTransitioning || masterModelLoading || overrideLoading}` — it didn't care which view was active, so the Firestore model query (triggered by the restored `selectedModelId`) blocked the UI even though `view='ranges'` didn't need that data.
- **Fix** (be870f6, merged to main at 3333246):
  1. Infer `view` from deeper URL params: `?model=X` → `view='bmt'`, `?range=X` → `view='models'`. Refresh now lands user in the same nesting they left.
  2. Scope the loading overlay to `view === 'bmt'`. Ranges/models views don't need model data so their loading states can't block the UI.
- **Why my test suite missed it**: `HF-2d` in `hotfixes-v1.3.spec.ts` refreshed IMMEDIATELY after opening the editor, so `?view=bmt` was still in the URL. The partial-param case (user refreshes later when URL has been normalized) wasn't covered. Need refresh-regression tests for every URL param combo, not just the happy-path snapshot.
- **Permanent learnings added**:
  - Loading overlays MUST be scoped to the view that consumes the data, never at page root keyed on a global flag
  - URL persistence that strips "defaults" WILL produce partial-param refresh states — every state init must infer missing values inferentially from the deepest params present
  - Every URL-synced state needs a refresh-regression test for every param combo
- **Files**: `src/app/(app)/modules/[id]/page.tsx`

### Session: March 31, 2026 — v1.0.0 Release
Complete stock management system, delivered deals, hold requests, sub-dealer experience, permissions, agent team infrastructure.

### Session: April 1, 2026 — v1.1.0 Release
Pricing overhaul (universal publish, price level selector), quote-to-stock with PDF, sub-dealer quoting, placeholder module types, proposal images.

### Session: April 2-4, 2026 — v1.2.0 Development
- Enhanced stock creation (location, status, customer for sold)
- New statuses (Pending, In Stock - Sold, On Order - Sold)
- Console-seat auto-pairing in quote builder
- Wide stock detail panel with mini proposal view
- PDF generation fix (missing financials prop)
- Master Price File module with in-app Excel import, editable tables, multi-dataset tabs
- Yamaha motor workspace (catalog, pricing with import/export, promotions)
- Motor specs on proposals/PDF
- Promotions system with images, PDFs, audit log, quote toggles
- Module rename/delete, module types (catalog, motor-brand, master-price-file, used-boats, website-listings)
- Dealer fit: simplified data browser (search all, one-click add), removed duplicate categories card, Clear All
- Associated vendors editable on existing modules
- Code audit: fixed stale promo fields, filtered empty states, select-all bugs, validation
- Catalog image replacement fix
- 1,356 antigravity skills installed
- Data browser: motor brand vendors filtered out of dealer fit

### Session: April 9, 2026 — Motor UX Overhaul & Dealer Fit
- Motor step 3 UX redesign: hero card on selection, grid hides, "Choose Another Motor" button to re-select
- Prop Comes Standard toggle (green, optional, default OFF — user opts in per motor) — auto-OFF when propeller selected from dealer fit
- Motor dealer fit categories (`motorDealerFitCategories`) stored per-boat-module, not per-motor-module — architectural decision for quote context
- Motor dealer fit shown in step 3 with blue-themed category headers
- `ModuleDealerFitManager` made configurable with `fieldName` prop for reuse across standard and motor dealer fit
- Yamaha motor card names fixed to use MODEL field
- Yamaha Settings tab now renders full settings (associated vendors, dealer fit categories, role assignment)

### Session: April 9, 2026 — v1.2.0 QA & Release Prep
- Full QA pass: 15 test cases, 12 PASS / 2 FAIL / 1 SKIP
- **FIXED TC-09**: Proposal view crash — `orgQuoteList is not defined` (stale variable refs from refactor)
- **FIXED TC-03**: Classic range broken images — switched remaining Next.js `<Image>` to native `<img>` for external CDN images
- v1.3 backlog documented (12 client requirements on separate branch `claude/v1.3-dev`)
- Playwright e2e tests set up but impractical for deployed site testing from CLI environment
- Release documentation finalized
- All tests now passing — ready for Friday main push pending Asaf approval

### Session: April 9, 2026 — Dealer Fit Gap Fix & Documentation Audit
- `DealerFitOptions` component updated to merge categories from three sources: global collection + module-level + motor-level
- Synthetic category IDs (`module-*`, `motor-*`) for module-level categories, matched by name for selections
- Confirmed `propComesStandard` is opt-in (default OFF), auto-OFF on propeller selection — not auto-enabled
- Image onError fallback pattern: Ship placeholder icon from Lucide replaces broken image icons across cards
- CL380 family data fix applied via `scripts/update-cl380-specs.py`
- Comprehensive v1.2 documentation audit across all four doc files
- **FIXED**: Missing `Layers` Lucide import in `dealer-fit-options.tsx` — crashed all dealer fit saves with ReferenceError
- **FIXED**: Duplicate category dropdown text ("RiggingRigging") — hardcoded SelectItems overlapped with `initialCategory` prop
- **FIXED**: Motor options crash — `config.type` undefined caused `.replace()` error
- Dealer fit options added inside motor detail side panel (same Master Data Browser as Highfield)
- Full surface QA test (30+ cases) — ALL PASS
- Static analysis: 688 icon usages verified across 113 files, zero undefined variable references
- **v1.2.0 shipped to production** — 87 commits, 65 files, 4,423 lines of new code

### Session: April 10, 2026 — v1.2.1 "Pricing Precision" Hotfix
- Client feedback triggered pricing accuracy overhaul
- **Inc GST rounding**: all values rounded UP to whole dollars via Math.ceil() per item row
- **Motor priceLevels**: Yamaha motors now have priceLevels object built from data columns (NSM Retail, Trade Price, Commercial, Boating Alliance)
- **Sub-dealer motor pricing**: sub-dealers automatically get Trade Price via their defaultPriceLevel
- **Hero card fix**: motor hero/grid cards used hardcoded sellPriceExclGst — replaced with getPriceForLevel()
- **Finalize payload**: resolvePrice() snapshots price-level-resolved values for motor, accessories, dealer fit
- **Dealer audit section**: new panel in stock detail with cost/sell/margin breakdown
- **getPriceForLevel expanded**: added Act Sell, Store Price, NSM Retail, Sell Price to fallback chain
- **QA**: 7/7 tests passing (motor accessories "static across levels" confirmed as expected behavior — MPF items have single price column)
- **Files**: 5 changed — pricing workspace, quote flow, finalize dialog, quote-financials, stock detail

### Session: April 16, 2026 — v1.3 Eve-of-Release Hotfixes
- **Update Config silently failing** — root cause was `form.handleSubmit(onSubmit)` swallowing Zod errors when no `onError` is passed AND the `highfieldModelSchema` having required fields (`motorConfigSchema.type` enum, `optionalFeatureSchema.id`/`name`, `documents[].id/name/url`) that legacy Firestore data didn't satisfy.
  - Fix: rewrote schema to be fully permissive — every nested field `optional().nullable().default()`, every object `.passthrough()`. Schema is now a safety net only.
  - Fix: added `onValidationError` that walks the nested errors object to log the deepest failing path, then calls `onSubmit(form.getValues())` directly. Validation can NEVER block a save again.
- **Replace cover image button did nothing** — shadcn `<Input type="file">` wrapped in `<label>` broke the input binding; Button had `pointer-events-none`. Switched to native `<input type="file" hidden>` + `Button onClick={(e) => (e.currentTarget.nextElementSibling)?.click()}`. Added `e.target.value = ''` reset so same file can re-upload.
- **Refresh redirects to dashboard / loses tab** — root cause was `activeTab`/`view`/`selectedRangeId`/`selectedModelId` lived in component state only, lost on refresh.
  - Fix: synced all four to URL search params via `window.history.replaceState` (no extra render). State initialised from `window.location.search` in `useState` initialiser. Same pattern applied to yamaha-motor-workspace (`?motorTab=`) and stock-management-workspace (`?stockView=`).
- **Files**: `highfield-model-editor.tsx`, `model-configuration-editor.tsx`, `app/(app)/modules/[id]/page.tsx`, `yamaha-motor-workspace.tsx`, `stock-management-workspace.tsx`

### Session: April 13-15, 2026 — v1.3 Major Release
- 13 client requirements addressed across the quote builder, stock management, and module settings
- **Quote builder additions**: PDF upload per section, Engine/Trailer Specs buttons, Pre-Rig Information display, NSM Extended Warranty + Direct Debit Service Plan toggles, Yamaha rebate auto-apply with date filtering, Trailer enhancements (custom notes + dealer fit), Admin & Trade-In card on Step 6
- **Label changes**: Features → Standard Features, Custom Tactical Additions → Additional Factory Boat Notes/Options
- **Settings**: Trailer Dealer Fit Categories card added, DealerFitOptions now merges FOUR category sources (global + module + motor + trailer)
- **Multi-engine HP fix**: `getMotorHp` parses "2 × 300" correctly, badges display "2 × 300 HP"
- **Currency format**: Whole-dollar values display without ".00" decimals
- **Customer fixes from dev feedback**: Photo save (modelOverrides merge in catalog grid), stock column order (Model first), Pending sub-tab, interactive location dropdown
- **Pre-release static analysis caught 3 critical bugs**: stock-item-detail null safety on Cost Breakdown, inventory-list and customer-list Firestore `in` query 30-element limits
- **Testing infrastructure overhaul**: Playwright E2E suite (46 tests across 6 spec files), `testing/` folder structure with per-release subfolders, full handbook rewrite for new QA hire (~42KB, 11 parts), bug report and test case templates
- **Coordination pattern that worked**: parallel agents for independent features failed when they touched the same file (highfield-quote-flow.tsx). Sequential agents worked well. Lesson: parallelize only when files are truly independent.
- **v1.4 design started**: `tasks/v1.4-trailers-module-design.md` — multi-brand Trailers module with per-boat-model trailer assignments mirroring the Motor Options pattern
- **Files changed**: ~10 components + tests + docs

## Key Lessons Learned
- `mainVendorId: null` crashes Firestore `doc()` — always check
- Sell AUD columns need "(EXCL. GST)" and "(INCL. GST)" labels
- Universal publish is better UX than asking users to choose
- Default price level should be `hull_cash` (org's shortCode column)
- `coverImageUrl` on module doc is separate from vendor `logoUrl`
- Quote prices ARE locked at save time via `buildQuotePayload()`
- `ProposalPDFDocument` needs `financials` prop — use `buildQuoteFinancials()`
- Removing JSX elements must remove ENTIRE element (opening + closing tags)
- `setValue` in react-hook-form needs `{ shouldDirty: true }` to prevent reset
- LFS blocks worktree creation — disable smudge filter
- Firestore `in` queries max 30 elements — slice arrays
- Sub-dealer `filterOrgId="all-with-parent"` shows parent + own stock
- `readOnly` prop gates all CRUD UI — controlled by permissions
- Import duplicate checking needs multi-field fingerprinting
- Select-all should operate on FILTERED results, not total
- Reset all filters when switching workspace views
- Master Data Browser: `isAggregating` state must be cleared when switching away from Global Master List
- Motor Brand vendors must be excluded from dealer fit vendor list
- MasterPriceFileWorkspace is reusable — Yamaha pricing tab renders it pointed at Yamaha vendor
- Per-module dealer fit categories (ModuleDealerFitManager) is the single source of truth — org-level category toggling was removed
- Next.js `<Image>` blocks external CDN images (Cloudflare anti-hotlinking) — ALWAYS use native `<img>` for external URLs
- After refactoring variable names, search codebase for ALL old references — stale refs cause ReferenceErrors at runtime
- Manual QA (cowork agents) more effective than Playwright for deployed site testing when env can't reach the site
- Motor dealer fit categories belong on the BOAT module, not the motor module — dealer fit is configured in the context of the boat being quoted
- `ModuleDealerFitManager` should accept a `fieldName` prop for reuse — don't duplicate the component for different category fields
- `DealerFitOptions` must merge categories from THREE sources (global + module + motor) — missing any source causes categories to not appear for selection creation
- `propComesStandard` is opt-in (default OFF), NOT auto-enabled — user explicitly toggles when the motor's prop is included
- Image onError fallback: use Lucide `Ship` icon as placeholder for broken external images across all card components
- After refactoring, always search for ALL old variable references — stale refs (like `orgQuoteList`) cause ReferenceErrors at runtime
- Firestore `where('field', 'in', arr)` caps at 30 elements — always `.slice(0, 30)` arrays of org IDs / sub-dealer IDs before querying
- Optional chaining guards must extend through to property access — `obj?.x > 0` followed by `obj.x.toLocaleString()` will crash if obj is null. Use `obj?.x?.toLocaleString() ?? '0'` consistently
- ModelsGrid (and any catalog list view) must merge `organisations/{orgId}/modelOverrides` with master `data-warehouse/.../models` data, otherwise saved org-level changes (cover images, etc.) appear to "not save"
- Parallel sub-agents editing the same large file (e.g., `highfield-quote-flow.tsx`) overwrite each other via stash conflicts — run them sequentially when touching the same file
- Playwright `text=Dashboard` selectors collide with hidden sidebar nav links — always use `getByRole('tab', { name: 'Dashboard' })` for tab navigation
- Playwright `waitForLoadState('networkidle')` never resolves with Firebase — use `waitForLoadState('domcontentloaded')` and explicit element waits
- `form.handleSubmit(onSubmit)` swallows validation errors silently when no `onError` handler is passed — always pass a second `onError`. For critical persistence flows, the `onError` should call `onSubmit(form.getValues())` so legacy data can never gate a save
- Schemas validating LEGACY Firestore data must be fully permissive — every nested field `optional().nullable().default()`, every object `.passthrough()`. Strict enums and required ids on legacy fields cause silent save failures
- shadcn `<Input type="file">` wrapped in `<label>` doesn't fire — the Input wrapper div breaks the binding. Use native `<input type="file" hidden>` + `Button onClick` triggering `nextElementSibling.click()`. Always reset `e.target.value = ''` after upload so the same file can be re-selected
- UI state that the user expects to survive a refresh (active tab, view mode, selected entity) must sync to URL search params via `window.history.replaceState`. Initialise state from `window.location.search` in the `useState` initialiser. Component-only state evaporates on F5
- Loading overlays MUST be scoped to the view that actually consumes the data — never gate an overlay on a global loading flag at page root. `{isLoading && <Overlay/>}` at the top of a multi-view page will block views that don't need the data. Use `{view === 'bmt' && modelLoading && <Overlay/>}` so a URL-restored state in a different view doesn't deadlock the UI. This rule is born from v1.3.1 — refresh with `?model=X` loaded model data while `view='ranges'`, the root-level overlay froze the whole module page
- URL persistence that strips "default" values WILL produce partial param combos on refresh (e.g. you strip `view=ranges` but `model=X` stays). Every `useState` init must INFER missing state from the deepest params present — `?model=X` implies `view='bmt'`, `?range=X` implies `view='models'`. Don't assume all params come back together
- Every URL-synced state needs a refresh-regression test for every param combo, not just the happy path. Test: no params, each param alone, pairs, triples. Happy-path-only tests missed the v1.3.1 bug because `?view=bmt` was always in the URL during the test; real users trigger the partial-param case by refreshing after the URL was normalized
- **Vendor types (as of v1.4 design)**: `Boat Brand`, `Motor Brand`, `Trailer Brand`, `Rego Authority`, `Electronics Brand`, `Electronics Supplier`, `Parts Wholesaler`, `Master Price File`, `Other`. When adding a new vendor type, update: (1) `vendorTypes` array in `src/app/(app)/data-warehouse/page.tsx`, (2) `getVendorTypeIcon` switch in the same file, (3) `SelectItem`s in `src/app/(app)/data-warehouse/add/page.tsx`, (4) `enum` in `src/docs/backend.json`, (5) the `catalogVendorTypes` filter in `src/components/master-data-browser-dialog.tsx` if the new type does NOT sell parts/accessories (the MPF browser excludes these).
- **Snapshot-on-select pattern (v1.4)**: quote flows capture a frozen snapshot of catalog data at pick-time so totals never drift when the catalog is edited later. Used for motors, trailers (`TrailerSnapshot`), and rego types (`RegoTypeSnapshot`). Always include a `capturedAt: Date.now()` timestamp for audit. Snapshots include vendor/series provenance so the picker can re-hydrate selection on duplicate-quote.
- **Shadow memo pattern (v1.4)**: when a new data source needs to transparently substitute a legacy field across many call sites (e.g. `catalogTrailerSnapshot` shadowing `model.trailerConfig`), use a `useMemo` that returns the shadow shape when the new source is set, else the legacy field. A project-wide `replace_all` with a unique literal marker (`model["trailerConfig" /* KEEP-LITERAL */]`) lets you swap references without breaking the memo body.
- **Four-source dealer fit merge (v1.4)**: `DealerFitOptions` now merges global + `moduleDealerFitCategories[]` + `motorDealerFitCategories[]` + `trailerDealerFitCategories[]`. Synthetic IDs (`module-<name>`, `motor-<name>`, `trailer-<name>`) are looked up by category name in `selectionsByCategory`. Missing the name-based lookup orphans selections.
- **Org-level overrides pattern (v1.4)**: `organisations/{orgId}/trailerOverrides/{trailerId}` mirrors the `modelOverrides` collection. The picker subscribes once and passes a `Record<trailerId, sellPriceExclGst>` map down to every trailer card. Overrides are applied to the snapshot at pick-time so they flow into finalised quotes.
- **Nested loader components**: when Firestore lacks a collection-group index for a path like `data-warehouse/{brandId}/series/{seriesId}/trailers`, render one nested `useCollection` loader per brand and per series (e.g. `BrandTrailersLoader` → `SeriesTrailersLoader`). Each loader's query path is stable via its own `useMemoFirebase`. Avoid fetching all trailers with a single collection-group query.
- **URL-synced tabs per workspace**: follow the `?trailerTab=…` / `?regoTab=…` pattern — read from `window.location.search` in the `useState` initialiser, write with `window.history.replaceState` in a `useEffect`. A refresh must land the user on the same tab.
- **Aggregate flat-list loaders use `getDocs`, not `useCollection`** (v1.4 remediation): when the vendor/brand set is dynamic (e.g. the trailer dashboard merges across every selected trailer brand), you can't call `useCollection` in a loop — React forbids conditional hooks. Use a single `useEffect` that calls `getDocs` per vendor on mount + on a stable `vendorKey` (`vendors.map(v => v.id).sort().join('|')`). Accept the trade-off that you lose live subscription — Firestore-auto-updates are worth less than the correctness of a dynamic list.
- **Imports must upsert by natural key** (v1.4 remediation): clear-and-replace destroys operator edits on any row not in the partial upload. Detect the key column via priority list (`partnumber`, `partno`, `part`, `modelcode`, `modelid`, `sku`, `code`, `id`, `model`, `modelname`) with normalise `(s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')`, fall back to the first column. Build `existingByKey: Map<string, string>` from existing docs, then chunk through the parsed rows in 500-row `writeBatch` commits using `b.update(doc(ref, existingId), row)` vs `b.set(newRef, row)`. Toast `N updated · M created · K skipped (no key)`.
- **Pick-time snapshots must include EVERY field the downstream renderer will need** (v1.4 remediation): the finalize payload can silently drop snapshot fields without any TypeScript error, breaking PDF rendering. When extending a snapshot OR a proposal/PDF component, check the other end of the pipeline. The trailer-on-boat-quote review caught `cost` dropped at finalize + `specifications` never added to `quote.trailer.catalog` → specs invisible on PDF.
- **Jurisdictional data must come from authoritative catalogs, not import hints** (v1.4 remediation): rego, tax, registration — anything state-specific/dealer-specific — has to be driven by a deliberate catalog system (v1.4 Rego module) with a legacy fallback (`model.registration.trailerPrice12Months`). Import-time hints on catalog docs (`pricingDetail.regoTypeHint`, `regoDollarsHint`) are operator notes from source xlsx — NOT state-aware pricing. Auto-applying them would cross-state silently. Label them "info only" in the UI and leave an in-code comment explaining why they don't feed the quote, so future sessions don't accidentally wire them in.
- **Admin-gating flows through prop threading, not branching high up** (v1.4 remediation): when only admins can edit a surface, pass `isAdmin` down through the component tree and gate at the deepest point (`TrailersWorkspace` → `TrailerDashboard` → `TrailerDetailSheet` → `TrailerImageEditor` / `TrailerEditForm`). Branching at the top of a big component produces two near-duplicate trees and drifts over time.

## How to Proceed (For Future Agents)
- **Read tasks/SESSION_HANDOVER.md** first for complete technical context
- **Check CLAUDE.md** for workflow rules
- **The module page is fragile** (~1400 lines) — always read fully before editing
- **Test with Bill Hull** (billh@nsmarine.com.au) — parent org user, role ID `bfffa6bd-6f7b-4822-a008-8e7214012f3f`
- **Test sub-dealers** via organisations with `parentOrganisationId` set
- **Firestore rules**: always provide full ruleset for user to paste in Firebase Console
- **Build verify** before every push: `npm run build`
- **Update this file** after significant changes
- **Use antigravity skills** for code review and quality checks

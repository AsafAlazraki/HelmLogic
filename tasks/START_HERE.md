# HelmLogic — Complete Session Bootstrap

> **NEW SESSION? Read this entire file before touching anything.**
> This is the complete brain dump. Every critical fact, lesson, ID, pattern, and gotcha lives here.
> If you only read one file, make it this one.
> Last updated: 2026-04-19 (v1.3.1 in prod, v1.4 Trailers in build)

---

## What Is HelmLogic?

Marine dealer management SaaS. Boat brands (vendors) push catalog + pricing data to dealerships (organisations). Dealerships build quotes, manage stock, distribute sub-dealer price lists, track deliveries.

**Primary client**: Northside Marine — a Highfield Boats dealer (inflatable boats).
**Primary user**: Bill Hull `billh@nsmarine.com.au` / `Bill2026!` — Managing Director, Northside Marine.

---

## Tech Stack

- **Frontend**: Next.js 14 App Router, TypeScript, Tailwind CSS, shadcn/ui (Radix primitives)
- **Backend**: Firebase — Firestore (DB), Auth, Storage
- **Deployment**: Firebase App Hosting — auto-deploys on push to dev branch
- **Firebase Project ID**: `studio-2290360004-3b963`
- **Map**: Leaflet + OpenStreetMap (no API key — replaced Google Maps)
- **PDF**: React-PDF (`@react-pdf/renderer`)
- **Forms**: React Hook Form + Zod (`@hookform/resolvers/zod`)
- **Skills**: 1,356 antigravity skills at `~/.claude/skills/`

---

## URLs & Branches

| Env | URL | Branch | Purpose |
|---|---|---|---|
| Dev | `https://dev--studio-2290360004-3b963.asia-southeast1.hosted.app/` | `claude/app-overview-wKiZ1` | Auto-deploys on push. Test here first. |
| Prod | `https://studio--studio-2290360004-3b963.us-central1.hosted.app/` | `main` | Production. Smoke test after every merge. |

**Always push to `claude/app-overview-wKiZ1`.** Never push directly to main without explicit user approval.

---

## Release History

| Release | Date | Status | What Shipped |
|---|---|---|---|
| v1.0 | 2026-03-31 | ✅ Prod | Stock management, delivered deals, hold requests, sub-dealer experience, permissions |
| v1.1 | 2026-04-01 | ✅ Prod | Pricing overhaul, universal publish, price level selector, sub-dealer quoting |
| v1.2.0 | 2026-04-10 | ✅ Prod | Yamaha motor workspace, promotions, MPF module, enhanced stock, PDF generation |
| v1.2.1 | 2026-04-10 | ✅ Prod | GST rounding Math.ceil, motor priceLevels, dealer audit panel |
| v1.3.0 | 2026-04-17 | ✅ Prod | PDF per section, specs buttons, Yamaha rebate auto-apply, trailer enhancements, Playwright suite (63 tests) |
| v1.3.1 | 2026-04-17 | ✅ Prod | **Same-day hotfix**: loading overlay stuck on refresh — scoped overlay to view='bmt', infer view from deepest URL param |
| **v1.4** | TBD | 🏗️ Building | **Trailers Module** — see below. Blocked on Excel file. |

**Current work**: v1.4 Trailers Module. Design doc: `tasks/v1.4-trailers-module-design.md`. Live status: `tasks/v1.4-trailers-module-status.md`.

**Blocker**: User has `C:\Users\AsafA\Downloads\Trailer Module.xlsx` — needs to be dropped into `/home/user/HelmLogic/data-import/Trailer Module.xlsx` before implementation starts.

---

## Firestore Data Hierarchy

```
data-warehouse/{vendorId}/                   ← brand catalogs (boats, motors, trailers)
  ranges/{rangeId}/
    models/{modelId}/                        ← boat spec + trailerAssignments[] + motorOverrides
      variants/{variantId}                   ← SKU: material × color, has sellPriceExclGst + priceLevels{}

modules/{moduleId}                           ← org's access point to a vendor
  moduleType: 'catalog' | 'motor-brand' | 'master-price-file' | 'used-boats' | 'website-listings' | 'trailers'
  mainVendorId: string | null               ← NULL for non-catalog modules — ALWAYS check before doc()
  associatedVendorIds: string[]
  moduleDealerFitCategories: string[]        ← boat dealer fit category names
  motorDealerFitCategories: string[]         ← motor dealer fit (stored on BOAT module, not motor module)
  trailerBrandVendorIds: string[]            ← v1.4 NEW — trailer brand vendor IDs
  stockLocations: string[]
  promotions/{promoId}                       ← per-module promotions (Yamaha only currently)

organisations/{orgId}/
  modelOverrides/{modelId}                   ← per-org pricing + photo overrides (merged into catalog views)
  dealerFitSelections/{selectionId}
  exchangeRates/{currencyCode}               ← USD→AUD: /organisations/{orgId}/exchangeRates/USD
  priceLists/{priceListId}                   ← sub-dealer price lists
  pricingStrategies/{vendorId}               ← pricing workspace working data

inventory/{itemId}                           ← stock (Pending / On Order / In Stock / Sold)
delivered-deals/{dealId}                     ← completed sales
holdRequests/{requestId}                     ← sub-dealer → parent org hold requests
customers/{customerId}                       ← org-scoped customer records
users/{userId}/quotes/{quoteId}             ← user-scoped quotes
```

---

## Critical Hard-Coded IDs

| Thing | ID |
|---|---|
| **Highfield vendor** | `LafOLpLb6QIFE856TiD4` ← use this ALWAYS, never the slug `highfield` |
| **Highfield module** | `M1Yf3R9igpJDxJnOVr6f` |
| **Northside Marine org** | `AcFZVEFA5UDJG2hyetWT` |
| Range — Classic | `qo7IePnRzJxjrYyLWhTn` |
| Range — Roll-Up | `EqcKQ51svI1I2Q5poFdl` |
| Range — Ultra-Light | `QsGZuVwutEr5yyMkp97j` |
| Range — Sport | `nQ2LE50z9Tbf2uss0Ote` |
| Range — Adventure | `sEzdrM2fZsrOKA3ACrJp` |
| Range — Patrol | `vfXxDuMpChteKncb7LnG` |
| Range — Coaster | `coaster` |

---

## Module Types & Routing

`src/app/(app)/modules/[id]/page.tsx` (~1400 lines) checks `moduleType` in this order:

1. `master-price-file` → `MasterPriceFileWorkspace`
2. `motor-brand` OR vendorType `Motor Brand` → `YamahaMotorWorkspace`
3. `used-boats` / `website-listings` → placeholder view
4. `trailers` → `TrailersWorkspace` (**v1.4, not built yet**)
5. `isSubDealer` → sub-dealer tabs (Dashboard, Stock, Price List)
6. Parent org → full tabs (Dashboard, Catalog, Stock, Pricing, Settings)

**Non-catalog modules always have `mainVendorId: null`** — never call `doc(db, 'data-warehouse', null, ...)`, always guard first.

---

## Pricing Architecture

```
Pricing Workspace → organisations/{orgId}/pricingStrategies/{vendorId}
  ↓ Publish (manual)
Writes to data-warehouse variants:
  sellPriceExclGst = hull_cash price (org's shortCode column)
  priceLevels: { hull_cash, hull_trade, hull_subdealer, hull_subdealer_excl, hull_aus_sailing }
  ↓
Quote Builder reads priceLevels[selectedLevel] (default: hull_cash)
Sub-dealers auto-get hull_trade via subDealerDefaultPriceLevel
  ↓
Finalize: buildQuotePayload() LOCKS all prices as snapshot
Proposals read from saved quote, NOT live variants
```

**NEVER hardcode `sellPriceExclGst` on cards/heroes.** Always use `getPriceForLevel()` from `src/lib/currency-utils.ts`. This bug hit motors in v1.2.1 and will hit trailers if ignored.

**Inc GST = `Math.ceil(exGst * 1.1)`** — rounds UP to whole dollars per item row. Never `Math.round`.

---

## Highfield Boat Data Structure

- **Range** = model series (e.g. Classic = `CL`, Sport = `SP`, Roll-Up = `RU`)
- **Model** = specific boat (`CL340`) — holds specs, optional features, motor compatibility, `trailerAssignments[]`
- **Variant** = SKU (`CL340-GREY-HYP`) — one per material × color combo
- Models do NOT have an `order` field — **never use `orderBy('order')`** on models/variants; it silently excludes all docs without that field
- Motor compatibility: `specifications.motorConfigurations[0].engines[0].minHp/maxHp` + `steeringType`
- Highfield factory prices in USD → converted via `organisations/{orgId}/exchangeRates/USD`

---

## v1.4 Trailers Module — Design Summary

Full design doc: `tasks/v1.4-trailers-module-design.md`. Live status: `tasks/v1.4-trailers-module-status.md`.

**Decisions locked (don't re-litigate):**
- One `trailers` module, many vendor brands (Mackay, Dunbier, Easytow, etc.)
- New vendorType `Trailer Brand` (alongside Boat Brand / Motor Brand / Internal)
- New moduleType `trailers`
- Full price levels (hull_cash, hull_trade, hull_subdealer, hull_subdealer_excl, hull_aus_sailing)
- NO Promotions tab
- Per-boat-model `trailerAssignments[]` with pre-configured dealer fit (mirrors Motor Options pattern)
- Quote Step 4 reads assignments, default pre-selected, one trailer per quote
- Dealer fit lives on Trailers module's own `moduleDealerFitCategories`
- Excel import per brand (same as MPF import)

**Pattern to follow**: `YamahaMotorWorkspace` is the reference implementation. Mirror it exactly, minus Promotions tab.

**New files needed:**
- `src/components/trailers-workspace.tsx`
- `src/components/trailer-detail-sheet.tsx`
- `src/components/trailer-browser-dialog.tsx`
- `src/components/trailer-options-editor.tsx`
- `src/components/trailer-assignment-dealer-fit-picker.tsx`
- `tests/trailers-module.spec.ts`

**Modified files:**
- `src/app/(app)/modules/[id]/page.tsx` — route `trailers` moduleType
- `src/app/(app)/modules/add/page.tsx` — add Trailers option
- `src/components/highfield-quote-flow.tsx` — Step 4 reads trailerAssignments
- `src/components/highfield-model-editor.tsx` — Trailer Options tab
- `src/components/model-configuration-editor.tsx` — wire trailer-options-editor
- `src/components/finalize-quote-dialog.tsx` — trailer brand snapshot
- `src/components/dealer-fit-options.tsx` — trailers module categories

---

## The Most Critical File

**`src/app/(app)/modules/[id]/page.tsx`** — ~1400 lines. Do not edit without reading the whole file first.

### v1.3.1 Hotfix patterns baked in (DO NOT REVERT):

```tsx
// View inferred from deepest URL param — ?model implies bmt, ?range implies models
const [view, setView] = useState<'ranges' | 'models' | 'bmt'>(() => {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('view');
    if (v === 'models' || v === 'bmt' || v === 'ranges') return v;
    if (params.get('model')) return 'bmt';
    if (params.get('range')) return 'models';
  }
  return 'ranges';
});

// Loading overlay SCOPED to view='bmt' — never blocks ranges/models views
{(isTransitioning || (view === 'bmt' && (masterModelLoading || overrideLoading))) && (
  <HelmLogicLoading ... />
)}
```

URL state synced via `window.history.replaceState`:
- `modules/[id]/page.tsx`: `?tab=`, `?view=`, `?range=`, `?model=`
- `yamaha-motor-workspace.tsx`: `?motorTab=`
- `stock-management-workspace.tsx`: `?stockView=`
- **v1.4 add**: `?trailerBrand=`, `?trailerTab=` on TrailersWorkspace

---

## The Non-Negotiable Rules (Lessons Learned the Hard Way)

### Firebase / Firestore

| Rule | Why |
|---|---|
| `vendorId = LafOLpLb6QIFE856TiD4` NEVER `highfield` | Slug is URL-only, Firestore path uses real ID |
| Never `orderBy('order')` on models/variants | Silently excludes all docs without the field |
| Never `doc(db, path, null)` | Crashes. Always check `mainVendorId` before creating refs |
| `where('field', 'in', arr)` — slice to 30 max | Firestore hard cap. Use `.slice(0, 30)` |
| `updateDoc` with `undefined` values | Firestore throws. Always `|| null` or `|| ''` fallbacks |
| Rules not working? | Must be manually deployed in Firebase Console. App Hosting only deploys code. |
| `useMemo` for Firestore refs | Use `useMemoFirebase` instead — prevents infinite re-render loops |
| Catalog list views MUST merge `modelOverrides` | Otherwise org-level photo/price saves appear to vanish |

### React / Next.js

| Rule | Why |
|---|---|
| Use native `<img>` for external URLs | Next.js `<Image>` breaks Cloudflare CDN anti-hotlinking |
| Radix Tabs: ONE `<Tabs>` wrapping both `<TabsList>` and `<TabsContent>` | Two separate `<Tabs>` = empty content panels |
| `TabsContent`: `absolute inset-0 data-[state=inactive]:hidden` | Correct sizing for tab panels |
| `setValue` needs `{ shouldDirty: true }` | Without it, form resets wipe the value on re-render |
| Removing JSX: remove ENTIRE element inc closing tag | Orphaned tags break webpack build |
| After renaming variables, grep for ALL old refs | Stale refs = ReferenceError at runtime (e.g. `orgQuoteList`) |
| Lucide icons MUST be imported | Using without import = ReferenceError at runtime |

### Forms / Validation

| Rule | Why |
|---|---|
| Zod schemas for legacy Firestore data: every field `optional().nullable().default()`, every object `.passthrough()` | Legacy docs predate schemas. Strict validation silently blocks saves. |
| Always pass `onError` to `form.handleSubmit()` | Without it, validation errors are swallowed silently |
| `onError` should call `onSubmit(form.getValues())` anyway | Validation is a SAFETY NET, not a gatekeeper. A save must never be blocked. |

### Loading Overlays (v1.3.1 Lesson — PROD OUTAGE)

**NEVER** do this at page root:
```tsx
{isLoading && <LoadingOverlay />}  // ← WRONG — blocks views that don't need this data
```

**ALWAYS** scope to the view that consumes the data:
```tsx
{view === 'bmt' && modelLoading && <LoadingOverlay />}  // ← CORRECT
```

### URL State Persistence

When you sync UI state to URL, stripping "default" values (e.g. `view=ranges`) produces partial param combos on refresh. You MUST infer missing state from whatever params ARE present:
- `?model=X` present → infer `view='bmt'`
- `?range=X` present (no model) → infer `view='models'`
- nothing → default `view='ranges'`

Every URL-synced state needs refresh tests for: no params, each param alone, pairs, full set, wrong order, invalid values.

### Testing

- **Never `test.skip()`** — silent skips are how bugs reach prod. Fail loudly.
- **Every save action must assert a toast** — use `waitForToast(page)` from `tests/helpers/utils.ts`
- **Persistence > visibility** — save → reload → re-read beats "element is visible"
- **Use `openTab()` not `click()`** — asserts `data-state="active"` so you know the tab switched
- **Use `getByRole('tab')` not `text=Dashboard`** — sidebar nav links share text, cause timeouts
- **`waitForLoadState('networkidle')` never resolves with Firebase** — use `domcontentloaded` + explicit waits
- **`ignoreHTTPSErrors: true`** in `playwright.config.ts` — sandboxed CI can't verify Firebase certs

### Dealer Fit

- `DealerFitOptions` merges THREE category sources: global collection + `moduleDealerFitCategories` + `motorDealerFitCategories`
- `motorDealerFitCategories` stored on the **BOAT module**, not the motor module (context = boat being quoted)
- `ModuleDealerFitManager` accepts `fieldName` prop — reuse for standard / motor / trailer categories
- Motor Brand vendors filtered OUT of Master Data Browser dealer fit
- `propComesStandard` = **opt-in, default OFF** — never auto-enable

### Pricing

- `getPriceForLevel()` is the ONLY correct way to display price on cards/heroes/grids
- `resolvePrice()` in finalize dialog snapshots price-level-resolved values (not raw `sellPriceExclGst`)
- Motor `priceLevels` built from columns: NSM Retail→hull_cash, Trade Price→hull_trade/hull_subdealer
- Dealer fit items use `Act Sell` (actual sell) and `Act CTD` (actual cost to dealer) as primary price fields

### Style Conventions

- Font: `text-[9px]` labels, `text-[10px]` small uppercase, `text-xs` body
- Labels: `uppercase tracking-widest font-black text-slate-400`
- Buttons: `rounded-xl` small, `rounded-2xl` medium
- Borders: `border-2` (not `border`)
- Dialogs: `rounded-3xl border-4 shadow-2xl`
- Toasts: `toast({ title })` success, `toast({ variant: 'destructive', title })` error
- Always `console.error(error)` in catch before toast

### Agent / Worktree

- Parallel agents editing the same file WILL overwrite each other — edit sequentially
- Always diff against original before resolving worktree merge conflicts
- LFS blocks worktrees — use `git config lfs.fetchexclude "*"` to skip

---

## Subsystem Reference

### Quote Builder (6 Steps)
`src/components/highfield-quote-flow.tsx` — most actively edited file.

1. Variant (hull + color/material)
2. Motor selection (assigned motors from `model.motorOverrides`)
3. Dealer Fit (global + module + motor categories)
4. Trailer (v1.3: single `trailerConfig`; v1.4: `model.trailerAssignments[]`)
5. Accessories
6. Review / Trade-in / Finance

Motor hero card appears after selection, "Choose Another Motor" resets. Pre-configured dealer fit auto-ticks for assigned motors.

**v1.4 Step 4 rewrite**: reads `model.trailerAssignments[]`, default pre-selected, hero card mirrors motor pattern, pre-configured DF auto-ticks, "Choose Another Trailer" button.

### Stock Management
`src/components/stock-management-workspace.tsx`

Statuses: Pending (yellow) → On Order (blue) → In Stock (green) → In Stock - Sold (purple) / On Order - Sold (orange) → Delivered Deal

Sub-tabs: Stock Boats, On Order, Delivered Deals, Hold Requests, Map View, Assignments
URL sync: `?stockView=`

### Yamaha Motor Workspace (reference pattern for Trailers)
`src/components/yamaha-motor-workspace.tsx`

Tabs: Catalog / Pricing Manager / Promotions / Settings
Motors at: `data-warehouse/{vendorId}/dataSets/{motorDataSet}/rows`
Pricing: reuses `MasterPriceFileWorkspace` scoped to Yamaha vendor
URL sync: `?motorTab=`
**Trailers workspace will mirror this exactly, minus Promotions tab.**

### Master Price File
`src/components/master-price-file-workspace.tsx`

Vendor `vendorType: 'Internal'`, datasets at `data-warehouse/{vendorId}/dataSets/{name}/rows/{id}`
In-app Excel import: each sheet → separate dataset
Editable inline cells, export xlsx/csv, search, image column auto-detection
**Reused as the Pricing Manager tab in both Yamaha and (v1.4) Trailers workspaces.**

### Promotions (Yamaha only)
`src/components/module-promotions.tsx`

At `modules/{moduleId}/promotions/{promoId}`. Types: fixed-amount, per-hp, percentage, category-discount.
Auto-apply in quote when active + within date range. Active/inactive with audit changelog.

### Permissions
`organisations/{orgId}.permissions.{roleId}.{permissionKey}: boolean`
`users/{userId}.organisationRole` = roleId string

Keys: `can_access_module`, `can_access_pricing_manager`, `can_create_quotes`, `can_edit_boat_data`, `can_view_subdealers`, `can_access_price_book`, `can_access_settings`, `can_manage_stock`, `can_view_stock`

`isSubDealer = !!currentMemberOrg?.parentOrganisationId`

### Firestore Security Rules
**Manually deployed** — Firebase Console → Firestore → Rules → paste from `firestore.rules`.
App Hosting ONLY deploys code, never rules. Rules changes must always be manual.

### Console-Seat Pairing
Consoles with `associatedSeatId` auto-select paired seat. Seat category hidden when no console selected. Switching console swaps seat automatically.

---

## Testing Quick Reference

```bash
npm run test:e2e              # full suite ~2-5 min
npm run test:e2e:smoke        # critical paths ~30s (run before every prod merge)
npx playwright test -g "name" # single test
npx playwright show-report    # HTML report with screenshots + traces
```

63 tests, 8 spec files. Key files:
- `tests/critical-paths.spec.ts` — must pass for any deploy
- `tests/hotfixes-v1.3.spec.ts` — regression for v1.3 + v1.3.1 URL partial-param bugs
- `tests/persistence.spec.ts` — save → reload → re-read roundtrips (catches silent save failures)
- `tests/helpers/utils.ts` — `waitForToast`, `reloadAndAssert`, `openTab`, `assertNoCrash`, `openFirstModelEditor`

---

## Git Workflow

```bash
# Dev (always):
git push -u origin claude/app-overview-wKiZ1

# Production merge:
git checkout main
git merge claude/app-overview-wKiZ1
git push origin main
git checkout claude/app-overview-wKiZ1

# Hotfix (straight to main, then add regression tests):
git checkout main
git merge claude/app-overview-wKiZ1
git push origin main
```

- Always new commits, never amend
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`
- Retry push on 403: 2s, 4s, 8s, 16s backoff
- Firestore rules: deploy manually after any `firestore.rules` change

---

## File Index (most important files)

| File | Purpose |
|---|---|
| `src/app/(app)/modules/[id]/page.tsx` | ★ Central workspace, ~1400 lines, most complex |
| `src/components/highfield-quote-flow.tsx` | ★ 6-step quote wizard, most actively edited |
| `src/components/yamaha-motor-workspace.tsx` | ★ Reference pattern for Trailers workspace |
| `src/components/master-price-file-workspace.tsx` | Reusable editable data tables + Excel import |
| `src/components/highfield-model-editor.tsx` | Boat model editor (Overview, Variants, Optional Features, Motor Options) |
| `src/components/model-configuration-editor.tsx` | Zod form for boat model config — schema MUST be permissive |
| `src/components/dealer-fit-options.tsx` | Merges 3 category sources (global + module + motor) |
| `src/components/module-dealer-fit-manager.tsx` | Per-module category CRUD, `fieldName` prop |
| `src/components/master-data-browser-dialog.tsx` | Search all MPF datasets → add dealer fit items |
| `src/components/stock-management-workspace.tsx` | Stock sub-tabs + URL sync |
| `src/components/finalize-quote-dialog.tsx` | Locks all prices as snapshot at save time |
| `src/components/proposal-view.tsx` / `proposal-pdf.tsx` | Reads from saved quote, NOT live variants |
| `src/lib/quote-financials.ts` | `buildQuoteFinancials()` — MUST be passed to ProposalPDFDocument |
| `src/lib/currency-utils.ts` | `getPriceForLevel()`, `resolvePrice()`, `formatCurrency()` |
| `tests/helpers/utils.ts` | Shared Playwright helpers |
| `firestore.rules` | Security rules — manually deployed |
| `tasks/v1.4-trailers-module-design.md` | Full v1.4 design |
| `tasks/v1.4-trailers-module-status.md` | Live implementation state |
| `.agents/evolution.md` | Session history + architectural reasoning |
| `tasks/SESSION_HANDOVER.md` | Deep technical context (read after this file) |
| `CLAUDE.md` | Workflow rules + full known lessons list |

---

## When You're Stuck

1. Search `CLAUDE.md` "Known Lessons" — most gotchas are documented there
2. Search `.agents/evolution.md` — the session where this pattern first appeared is documented
3. **Read the whole file before editing** — especially `modules/[id]/page.tsx`
4. **Ask the user for UX decisions** — never guess on product choices
5. **Bug fix process**: add regression test → understand root cause → fix → verify
6. **Before marking done**: does it survive a page refresh? Does the toast confirm? Does Firestore actually have the data?

---

## Documentation Map (read these after this file)

| File | Read When |
|---|---|
| `CLAUDE.md` | Full workflow rules, complete lessons list (the bible) |
| `tasks/SESSION_HANDOVER.md` | Need deep technical context on any subsystem |
| `tasks/CODEBASE_MAP.md` | Need to find where something lives |
| `.agents/evolution.md` | Need to understand WHY a decision was made |
| `tasks/v1.4-trailers-module-status.md` | Working on v1.4 Trailers |
| `tasks/v1.4-trailers-module-design.md` | Full v1.4 design details |
| `testing/HANDBOOK.md` | Doing QA work |
| `testing/README.md` | Test quality rules |
| `tasks/RELEASE_NOTES_v1.3.md` + `v1.3.1.md` | What changed in the last releases |

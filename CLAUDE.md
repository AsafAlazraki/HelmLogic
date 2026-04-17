# HelmLogic — CLAUDE.md

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update tasks/lessons.md with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Explain changes: high-level summary at each step
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

---

## Task Management

- **Plan First**: Write plan to tasks/todo.md with checkable items
- **Plan Check**: In before starting implementation
- **Track Progress**: Mark items complete as you go
- **Verify Plan**: High-level summary at each step
- **Document Results**: Add review section to tasks/todo.md
- **Capture Lessons**: Update tasks/lessons.md after corrections
- **On Every Release (dev or main)**: Update `.agents/evolution.md` with new patterns/lessons learned, and update `tasks/SESSION_HANDOVER.md` with any new Firestore collections, component changes, or architectural decisions
- **Release Notes Format**: Every `RELEASE_NOTES_vX.Y.Z.md` file must follow the same layout — title, date/branch header, Release Stats, feature sections with sub-sections, Files Changed at the end. **NO release checklists** — release notes describe what shipped, not what's pending.

---

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Only touch what's necessary. No side effects with new bugs.

---

## HelmLogic-Specific Context

### Tech Stack
- Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- Firebase (Firestore, Auth, Storage) via custom hooks
- Deployed via Firebase App Hosting

### Firestore Data Hierarchy
```
data-warehouse/{vendorId}/
  ranges/{rangeId}/
    models/{modelId}/
      variants/{variantId}     ← SKU-level (material + color + price)
modules/{moduleId}             ← Org access point to a vendor
  moduleDealerFitCategories[]  ← Boat dealer fit category names
  motorDealerFitCategories[]   ← Motor dealer fit category names (on BOAT module, not motor module)
  modules/{moduleId}/promotions/{promoId}  ← Per-module promotions
organisations/{orgId}/
  modelOverrides/{modelId}     ← Org-specific pricing overrides
  dealerFitSelections/
  exchangeRates/{currencyCode}
users/{userId}/quotes/{quoteId}
```

### Highfield Boat Structure
- **Vendor ID**: `LafOLpLb6QIFE856TiD4` (slug: `highfield`, vendorType: `Boat Brand`, currency: `USD`)
- **Range IDs** (under vendor `LafOLpLb6QIFE856TiD4`):
  - Classic: `qo7IePnRzJxjrYyLWhTn` | Roll-Up: `EqcKQ51svI1I2Q5poFdl` | Ultra-Light: `QsGZuVwutEr5yyMkp97j`
  - Sport: `nQ2LE50z9Tbf2uss0Ote` | Adventure: `sEzdrM2fZsrOKA3ACrJp` | Patrol: `vfXxDuMpChteKncb7LnG` | Coaster: `coaster`
- **Module ID**: `M1Yf3R9igpJDxJnOVr6f` (Highfield Boats module, linked to vendor `LafOLpLb6QIFE856TiD4`)
- **Northside Marine org**: `AcFZVEFA5UDJG2hyetWT`
- **Range** = model series/code prefix (e.g., `CL` = Classic, `SP` = Sport, `RU` = Roll-Up, `AL` = Adventure, `PA` = Patrol)
- **Model** = specific boat (e.g., `CL260`) — holds specs, optional features, trailer config, registration costs
- **Variant** = SKU (e.g., CL260-GREY-HYP) — one per material × color combo, each has `sellPriceExclGst`
- Optional features with `applicableVariantIds` restrict which SKUs can use a given feature
- Motor compatibility driven by `specifications.motorConfigurations[0].engines[0].minHp/maxHp` + `steeringType`
- Model documents do NOT have an `order` field — do NOT use `orderBy('order')` on model/variant queries; use `collection()` without ordering instead

### Seed Scripts
- `scripts/seed-highfield.py` — original script (writes to wrong vendor path `data-warehouse/highfield`, do not use)
- `scripts/reseed-correct-vendor.py` — correct script targeting vendor `LafOLpLb6QIFE856TiD4`
- Data files: `/tmp/highfield_structured.json`, `/tmp/highfield_equipment_map.json`

### Pricing Rules
- All prices stored as `sellPriceExclGst` (exclusive of GST)
- Highfield factory prices are in USD — use org exchange rate (`/organisations/{orgId}/exchangeRates/USD`) to convert to AUD sell price
- GST (10%) applied at finalization only
- `cost` field stores buy price for margin tracking

### Key Branch
- Development branch: `claude/app-overview-wKiZ1`
- Always push to this branch

### Known Lessons
- **Verify data is actually visible before telling user it's there** — always query Firestore to confirm docs exist at the correct path
- **`orderBy('field')` in Firestore silently excludes docs without that field** — seeded docs often don't have `order`; use unordered collection queries
- **Vendor ID matters**: app reads from `data-warehouse/LafOLpLb6QIFE856TiD4`, not `data-warehouse/highfield`
- **Module page passes vendorId + rangeId to model editors** — always pass both props to `HighfieldModelEditor` (and others)
- **Motor dealer fit categories belong on the boat module** — `motorDealerFitCategories` field on `modules/{moduleId}`, not on the motor module. Dealer fit is configured in the context of the boat being quoted
- **DealerFitOptions merges THREE category sources** — global (`dealerFitCategories` collection) + module-level (`moduleDealerFitCategories`) + motor-level (`motorDealerFitCategories`)
- **`propComesStandard` is opt-in, default OFF** — do NOT auto-enable. User explicitly toggles when the motor prop is included
- **Next.js `<Image>` breaks external CDN images** — Cloudflare anti-hotlinking blocks the optimization proxy. Always use native `<img>` for external URLs
- **After refactoring, search for ALL old variable references** — stale refs cause ReferenceErrors at runtime (e.g., `orgQuoteList` after rename)
- **`ProposalPDFDocument` needs `financials` prop** — use `buildQuoteFinancials()` from `src/lib/quote-financials.ts`
- **Non-catalog modules have `mainVendorId: null`** — always check before creating Firestore doc refs
- **Always verify Lucide icon imports** — using an icon in JSX without importing it causes a ReferenceError at runtime (e.g., `Layers is not defined`). Search for the icon name in the import line before using it.
- **Don't hardcode Select options that overlap with props** — if a dropdown receives `initialCategory` as a prop, don't also hardcode the same values as SelectItems (causes duplicate display bugs)
- **Inc GST must be rounded UP to whole dollars** — use `Math.ceil(exGst * gstMultiplier)`. Applied per item row in pricing workspace and on totals in proposals/PDFs.
- **Motor pricing uses priceLevels object** — built from Yamaha columns: hull_cash→NSM Retail, hull_trade/hull_subdealer→Trade Price, hull_commercial→Commercial Price, hull_boating_alliance→Boating Alliance Price
- **Price display must use getPriceForLevel(), never hardcoded sellPriceExclGst** — applies to hero cards, grid cards, accessories, dealer fit. Hardcoded prices don't respond to price level selector.
- **Dealer fit items use Act Sell for pricing** — MPF data uses 'Act Sell' (actual sell) and 'Act CTD' (actual cost to dealer) as the primary price/cost fields
- **Finalize payload must resolve prices through the selected price level** — use resolvePrice() not raw sellPriceExclGst, otherwise sub-dealer quotes snapshot retail prices instead of trade prices
- **Firestore `where('field', 'in', arr)` capped at 30 elements** — always `.slice(0, 30)` arrays of org IDs / sub-dealer IDs / variant IDs before querying
- **Optional chaining must extend to property access** — `obj?.x > 0` followed by `obj.x.toLocaleString()` will crash if obj is null. Be consistent: `obj?.x?.toLocaleString() ?? '0'`
- **Catalog list views must merge modelOverrides** — ModelsGrid (and similar list components) reading from `data-warehouse/.../models` must also merge `organisations/{orgId}/modelOverrides` so saved org-level changes (cover images, etc.) appear immediately
- **Multi-engine HP parsing** — Yamaha HP Rating field "2 × 300" must extract per-engine HP (300), not raw `parseFloat()` (which returns 2). Use `getMotorHp()` helper.
- **Currency display** — `formatCurrency` auto-detects whole-dollar values and omits decimals (e.g., `$39,815` not `$39,815.00`). Fractional values still show 2 decimals.
- **Parallel agents on the same file overwrite each other** — when multiple sub-agents need to edit a large component file (e.g., `highfield-quote-flow.tsx`), run them sequentially. Stash conflicts cause silent loss of work.
- **Playwright tab selectors** — use `getByRole('tab', { name: '...' })` not `text=Dashboard`. Sidebar nav links share the same text and are hidden, causing timeouts.
- **Playwright `networkidle` doesn't work with Firebase** — websockets keep the network "active" forever. Use `waitForLoadState('domcontentloaded')` plus explicit `waitForSelector(...)` calls.
- **`form.handleSubmit(onSubmit)` swallows validation errors silently** — always pass a second `onError` handler. Even better: in this app, the second handler should attempt the save anyway via `onSubmit(form.getValues())` so legacy data can never block a save. Validation is a safety net, not a gatekeeper.
- **Schemas for legacy Firestore data must be fully permissive** — every nested field `optional().nullable().default()`, every object `.passthrough()`. Saved docs predate current schema versions and WILL have missing/null fields. Strict enums on legacy fields cause silent save failures.
- **shadcn `<Input type="file">` + `<label>` doesn't fire** — the Input wrapper div breaks the label-for-input binding. Use a native `<input type="file" hidden>` and trigger it via `Button onClick={(e) => (e.currentTarget.nextElementSibling as HTMLInputElement)?.click()}`. Also reset `e.target.value = ''` after upload so the same file can be re-selected.
- **Refresh must restore page state** — `activeTab`, `view`, `selectedRangeId`, `selectedModelId` and similar UI state must sync to URL search params via `window.history.replaceState` so a browser refresh lands the user back where they were. Read state from `window.location.search` in the `useState` initialiser.
- **Loading overlays MUST be scoped to the view that actually consumes the data** — never `{isLoading && <Overlay/>}` at the page root. A global loading flag tied to URL-restored state will block the UI in views that don't even need that data. Use `{view === 'bmt' && (modelLoading || overrideLoading) && <Overlay/>}`. This caused v1.3.1 prod hotfix — refresh with `?model=X` loaded model data while view was still 'ranges', overlay blocked entire page.
- **URL persistence must handle PARTIAL param combos** — when you strip "default" values from the URL (e.g. delete `view=ranges`), a refresh produces a subset of the original params. If `selectedModelId` is in URL but `view` was stripped, state rehydrates inconsistently. Rules: (1) on `useState` init, INFER missing values from the deeper params present — `?model=X` implies `view='bmt'`, `?range=X` implies `view='models'`. (2) Never gate critical rendering decisions on a single URL param in isolation.
- **Every URL-synced state needs a refresh-regression test for every param combo** — not just "refresh after happy path". Test: refresh with no params, each param alone, pairs, triples. A test that only covers the case where all params are present will miss the bug where the user refreshes mid-transition and only half the params are there.

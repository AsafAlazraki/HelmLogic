# HelmLogic — CLAUDE.md

> **NEW SESSION? Read `tasks/START_HERE.md` FIRST.**
> It gives you the full context bootstrap: release state, current work, required reading order.
> Then come back here for workflow rules.

---

## Current State (2026-04-22)

| Release | Status |
|---|---|
| v1.0 → v1.3.1 | ✅ Shipped to production |
| v1.4 Trailers + Rego | 🚢 Shipped on `claude/app-overview-wKiZ1` — draft PR pending. See `tasks/v1.4-trailers-module-status.md` |

**Active dev branch**: `claude/app-overview-wKiZ1` (auto-deploys to dev URL)

---

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
- **Development branch: `claude/app-overview-wKiZ1`** — this is the ONLY active dev branch.
- Always push here. Do not push to, create, or re-invent a branch called `Dev` / `dev` / `develop` — an old `origin/Dev` exists but is stale and must not be used.
- Before any `git push`: confirm `git rev-parse --abbrev-ref HEAD` is `claude/app-overview-wKiZ1`. If you're on a different local branch for any reason, use `git push origin <local>:claude/app-overview-wKiZ1` — never invent a new remote branch name.
- If a session handover or older doc refers to "branch Dev", treat that as a stale artifact — the canonical branch is still `claude/app-overview-wKiZ1`.

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
- **The canonical dev branch is `claude/app-overview-wKiZ1` — never push to a different branch name** — an old `origin/Dev` exists on the remote but is stale; pushing there (or creating a local `Dev` branch that tracks it) silently forks history and forces a rebase rescue later. Before every push run `git rev-parse --abbrev-ref HEAD` and confirm the name. If the local branch name doesn't match the remote, use the explicit refspec form `git push origin <local>:claude/app-overview-wKiZ1` — do not let a new remote branch get auto-created.
- **Don't commit vendor source spreadsheets (`.xlsx`, `.xls`) to the repo** — source data exists to be imported into Firestore by a seed script, and once imported the canonical copy is the database. The spreadsheet becomes dead weight: it bloats the repo, tempts Git LFS (6.6 MB Trailer Module xlsx is what kicked this off), and blocks pushes whenever the LFS backend is flaky. Pattern: keep the xlsx out of git, write a FINDINGS.md beside the seed script capturing schema decisions, and let Firestore be the source of truth. `tasks/*-source/*.xlsx` is gitignored for this reason.
- **Git LFS smudge failures block rebase and checkout, not just clone** — when the LFS backend returns 502 (as it did during the April 2026 branch rescue), any checkout that would materialize an LFS-tracked file fails — including the intermediate checkouts git performs during `rebase`. Workaround: `git config --local filter.lfs.smudge "git-lfs smudge --skip -- %f"` + `filter.lfs.process "git-lfs filter-process --skip"` before the rebase, then restore after. But the real fix is rule above — don't commit the source file in the first place. If a dead LFS commit is already in history and blocking a push, drop it with `git rebase --onto <commit>^ <commit> <branch>` (the LFS object stays on the remote, but nothing in the new history references it).
- **Imports must upsert by natural key, never clear-and-replace** (v1.4 remediation) — every data-import surface (Yamaha MPF, Sam Allen, delivered-deals, stock, trailer pricing) detects a key column from a priority list (Part Number → Model Code → Model ID → SKU → Code → ID → Model → Model Name → first column) and patches existing rows / creates new ones / leaves untouched rows alone. Clear-and-replace destroys operator edits on every partial upload. Always toast `N updated · M created · K skipped (no key)`.
- **Aggregate flat-list loaders use `getDocs`, not `useCollection`** (v1.4 remediation) — when the vendor/brand set is dynamic (trailer dashboard aggregates across every selected trailer brand), calling `useCollection` per vendor violates React's rules-of-hooks. Use a single `useEffect` that calls `getDocs` per vendor on mount + on a stable `vendorKey` (`vendors.map(v => v.id).sort().join('|')`). Trade live subscription for the correctness of a dynamic list.
- **Pick-time snapshots must include every field the downstream renderer needs** (v1.4 remediation) — the finalize payload can silently drop snapshot fields without any TypeScript error, breaking PDF rendering. When extending a `TrailerSnapshot` / `MotorSnapshot` OR a proposal/PDF component, check BOTH ends of the pipeline. The v1.4 trailer review caught `cost` dropped at finalize and `specifications` never added to `quote.trailer.catalog` → specs invisible on PDF.
- **Jurisdictional data comes from authoritative catalogs, not import hints** (v1.4 remediation) — rego, tax, registration, anything state-specific must be driven by a deliberate catalog system (v1.4 Rego module) with a named-legacy fallback (e.g. `model.registration.trailerPrice12Months`). Import-time hints on catalog docs (`pricingDetail.regoTypeHint`, `regoDollarsHint`) are operator notes, NOT state-aware pricing — auto-applying them would cross-state silently. Label them "info only" in the UI and leave an in-code comment at the render site explaining why they don't feed the quote flow.
- **Admin-gating flows through prop threading, not top-level branching** (v1.4 remediation) — pass `isAdmin` down through the component tree and gate at the deepest point (`TrailersWorkspace` → `TrailerDashboard` → `TrailerDetailSheet` → `TrailerImageEditor` / `TrailerEditForm`). Branching at the top of a big component produces two near-duplicate trees that drift over time.

---

## Documentation Index

All docs live in `tasks/` and `.agents/`. Read in this order when starting a session:

1. **`tasks/START_HERE.md`** — Bootstrap. Release state, current work, required reading order.
2. **`CLAUDE.md`** (this file) — Workflow rules, core principles, known lessons.
3. **`tasks/SESSION_HANDOVER.md`** — Deep technical context: data hierarchy, IDs, every subsystem.
4. **`.agents/evolution.md`** — Session history + architectural "why we do X".
5. **`tasks/CODEBASE_MAP.md`** — File index: what lives where.
6. **`tasks/RELEASE_NOTES_vX.Y.Z.md`** — Per-release changelog (v1.0, v1.1, v1.2, v1.2.1, v1.3, v1.3.1).
7. **`tasks/v1.4-trailers-module-status.md`** — Live state of current work.
8. **`tasks/v1.4-trailers-module-design.md`** — Design doc for current release.
9. **`testing/README.md`** + **`testing/HANDBOOK.md`** — Test philosophy, quality rules, QA onboarding.

**Whenever you ship a release** (dev or main):
- Append session entry to `.agents/evolution.md`
- Update `tasks/SESSION_HANDOVER.md` release table
- Update release status in this file's header table
- Update `tasks/v1.X-*-status.md` if applicable
- Create `tasks/RELEASE_NOTES_vX.Y.Z.md` (follow the layout — no pending-work checklists)

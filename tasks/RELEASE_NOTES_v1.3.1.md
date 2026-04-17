# HelmLogic — Release Notes v1.3.1
> Release Date: 2026-04-17
> Branch: claude/app-overview-wKiZ1 → main
> Patch hotfix on top of v1.3.0 (same-day)

### Release Stats
- **1 critical bug fix** — production hotfix shipped the same day as v1.3.0
- **1 file changed** — `src/app/(app)/modules/[id]/page.tsx`
- Zero new features; this release purely restores module workspace functionality

### Source of Hotfix
v1.3.0 shipped the morning of 2026-04-17. Shortly after, users refreshing on a module page URL like `/northside-marine/modules/highfield?range=X&model=Y` were stuck indefinitely behind the "Initializing Precision Build" loading overlay. The module workspace was unusable after any refresh that had model/range in the URL.

---

## Bug Fixes

### Module Workspace Stuck on Refresh (Critical)

- **Bug**: Refreshing on any module URL with `?range=X&model=Y` in the query string left the entire module page frozen behind the "Initializing Precision Build" animation. The CL340 loading card displayed indefinitely, progress bar stuck.
- **Root Cause**: Three v1.3.0 changes converged in one spot:
  1. The URL-sync effect stripped `view=ranges` as a "default" value but kept `model=X` in the URL. On refresh the URL had a partial param set.
  2. `useState` init restored `selectedModelId` from URL but `view` defaulted to `'ranges'` — an inconsistent state the component was never designed to handle.
  3. The loading overlay fired on `{isTransitioning || masterModelLoading || overrideLoading}` without regard for which view was active. The restored `selectedModelId` triggered a Firestore model query whose loading state blocked the whole page — even though `view='ranges'` didn't need that data.
- **Fix** (two parts):
  1. **Infer view from URL param depth.** The `useState` initialiser for `view` now reads: if `?view=` is explicit, use it. Otherwise, if `?model=` is present, default to `'bmt'`. If only `?range=` is present, default to `'models'`. Refresh now lands the user in the same nesting they left.
  2. **Scope the loading overlay to the view that consumes the data.** Overlay condition changed from `{isTransitioning || masterModelLoading || overrideLoading}` to `{isTransitioning || (view === 'bmt' && (masterModelLoading || overrideLoading))}`. Ranges/models views no longer block on model data they don't render.
- **File**: `src/app/(app)/modules/[id]/page.tsx` (commit `be870f6`, merged to main as `3333246`)

---

## Postmortem — Why Testing Missed This

The v1.3 Playwright suite (`tests/hotfixes-v1.3.spec.ts` / `tests/persistence.spec.ts`) included refresh-roundtrip tests for tabs, views, and model editor — and all 12 of those tests passed. So why wasn't this caught?

1. **Tests refreshed immediately after opening the editor**, before the URL was normalized. When `HF-2d` (`Opened model editor survives a refresh`) triggered `page.reload()`, the URL still had `?view=bmt` explicitly because the reload happened within ~3s of navigating — before the browser back/forward cache or user interaction had a chance to normalize the URL to just `?range=X&model=Y`.

2. **Happy-path bias.** The tests covered "user navigates → refreshes → still there" but not the partial-param combinations that arise from URL normalization or a user typing/bookmarking a URL manually.

3. **No test for "refresh with only a subset of the state params."** Which is the exact case real users hit.

### New Testing Rules (added to testing/README.md + CLAUDE.md)

1. **Loading overlays must be scoped** to the view/state that actually consumes the data, never to a global loading flag at page root.
2. **URL persistence that strips "default" values WILL produce partial param combos on refresh** — every `useState` initialiser must infer missing state inferentially from the deepest params present.
3. **Every URL-synced state needs refresh-regression tests for every param combo** — not just the happy path. Test: no params, each param alone, every pair, every triple.

### Regression Tests Added

- `tests/hotfixes-v1.3.spec.ts`:
  - `HF-URL-partial-range-only` — refresh with only `?range=X` lands in models view without overlay stuck
  - `HF-URL-partial-model-only` — refresh with `?range=X&model=Y` (no `view=`) lands in bmt view without overlay stuck
  - `HF-URL-bmt-bad-model` — refresh with `?view=bmt&model=INVALID` doesn't stick on overlay (useDoc clears isLoading for missing docs)

---

## Files Changed
- `src/app/(app)/modules/[id]/page.tsx` — view inference from URL params + overlay scoped to view='bmt'
- `tests/hotfixes-v1.3.spec.ts` — three new regression tests for partial-URL-param refreshes
- `CLAUDE.md` — 3 new lessons (scoped overlays, partial URL params, refresh-regression test coverage)
- `.agents/evolution.md` — v1.3.1 session entry + 3 new key lessons
- `tasks/SESSION_HANDOVER.md` — v1.3.1 subsection under release status
- `testing/README.md` — new testing quality rule on URL partial-param coverage

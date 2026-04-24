# START HERE — New Session Bootstrap

> **You are a Claude agent joining the HelmLogic project mid-flight.**
> Read this file FIRST. Then read the files listed in order. Do not skip any.
> Last updated: 2026-04-23 EOD — v1.4 Trailers + Rego + Pricing Manager Highfield-style uplift + 19-item day-1 remediation + sibling-bug audit fixes fully on branch. 70 commits, +11,594 / −825 lines. `npm run build` clean. Awaiting user green-light for PR.

---

## 30-Second Project Summary

**HelmLogic** is a marine dealer management SaaS (Next.js 14 + Firebase).
Boat brands → dealerships. Dealerships build quotes, manage stock, distribute sub-dealer price lists.

- **Live URL**: `https://studio--studio-2290360004-3b963.us-central1.hosted.app/`
- **Dev URL**: `https://dev--studio-2290360004-3b963.asia-southeast1.hosted.app/`
- **Dev branch**: `claude/app-overview-wKiZ1` → auto-deploys
- **Main branch**: `main` → production
- **Primary customer in-app**: Northside Marine (orgId `AcFZVEFA5UDJG2hyetWT`) — a Highfield Boats dealer
- **Primary test user**: Bill Hull `billh@nsmarine.com.au` / `Bill2026!`
- **Today's date**: 2026-04-22
- **Current release state**: **v1.4 Trailers + Rego fully on dev branch, draft PR pending**. v1.3.1 is the most recent in-production release (2026-04-17 same-day hotfix).

---

## Required Reading Order (each builds on the last)

| # | File | Why |
|---|------|-----|
| 1 | `CLAUDE.md` (repo root) | Workflow rules, core principles, lessons — HARD RULES you MUST follow |
| 2 | `tasks/SESSION_HANDOVER.md` | Full technical context: data hierarchy, IDs, architecture, every subsystem |
| 3 | `.agents/evolution.md` | Project history + "why we do X" — every release + key lessons |
| 4 | `tasks/CODEBASE_MAP.md` | File-by-file index: what lives where |
| 5 | `testing/README.md` | Test philosophy + quality rules (NEVER skip a broken test, etc.) |
| 6 | `tasks/RELEASE_NOTES_v1.3.md` + `v1.3.1.md` | Most recent changes — what's in prod |
| 7 | `tasks/v1.4-trailers-module-status.md` | Current work state (what's next) |
| 8 | `tasks/v1.4-trailers-module-design.md` | Design doc for the next release |

**Also skim** `tasks/v1.3-backlog.md` (what v1.3 addressed), and `testing/HANDBOOK.md` if you're doing QA work.

---

## Current Active Work — v1.4 Trailers + Rego

**Status**: Everything the v1.4 design called for is shipped on `claude/app-overview-wKiZ1`. Awaiting draft PR → main. No blockers.

**What's shipped**:
- Trailer + Rego module types, `Trailer Brand` + `Rego Authority` vendor types
- Trailer workspace with **Dashboard** (Yamaha-style, boat-size-range grouping, cards/table toggle) / Pricing Manager (waterfall with org overrides) / Settings (module image editor + brand picker + dealer fit + roles)
- Admin edit surfaces inside the trailer detail sheet — image upload/paste-URL/remove + basic/specs/features/factory-options editor
- Rego workspace with Types + Settings tabs
- Highfield quote flow fully integrated: trailer catalog picker → `TrailerSnapshot` → finalize payload → proposal PDF now renders **brand · code subtitle + specs strip** (boat size / length / ATM / tare / wheel size / winch) and persists `cost` for margin
- Four-source dealer-fit merge (global + boat module + motor module + trailer module)
- Upsert-by-natural-key on every import surface (Yamaha MPF, Sam Allen, delivered deals, stock, trailer pricing). No more clear-and-replace destroying operator edits.
- 7-test Playwright smoke suite for v1.4 (dashboard, view toggle, pricing, settings, detail sheet, Rego, quote trailer step)

**See `tasks/v1.4-trailers-module-status.md` for the per-chunk commit table, files touched, and post-merge follow-ups.**
**See `tasks/RELEASE_NOTES_v1.4.md` for the customer-facing change summary.**

---

## The Five Rules That Will Keep You Out of Trouble

1. **Plan mode for ANY non-trivial task.** 3+ steps or architectural decisions → plan first.
2. **Loading overlays MUST be scoped to the view that consumes the data.** Never `{isLoading && <Overlay/>}` at page root. v1.3.1 was a prod outage caused by this exact bug.
3. **URL-synced state must INFER missing values from deepest params present.** `?model=X` implies `view='bmt'`. Tests must cover every param combo, not just happy path.
4. **Zod schemas for legacy Firestore data must be fully permissive.** Every field `optional().nullable().default()`, every object `.passthrough()`. Validation is a safety net, never a gatekeeper.
5. **Never `test.skip()` a broken feature.** Silent skips are how bugs reach prod. If a selector can't find something, fail loudly.

---

## Firestore Data Hierarchy (memorize this)

```
data-warehouse/{vendorId}/              ← boat/motor/trailer brand catalogs
  ranges/{rangeId}/models/{modelId}/variants/{variantId}
modules/{moduleId}                      ← org access point to a vendor
organisations/{orgId}/                  ← dealership
  modelOverrides/{modelId}              ← per-org pricing/photo overrides
inventory/{itemId}                      ← stock items
delivered-deals/{dealId}                ← completed sales
users/{userId}/quotes/{quoteId}         ← user-scoped quotes
```

**Critical IDs** (full list in SESSION_HANDOVER.md):
- Highfield vendor: `LafOLpLb6QIFE856TiD4`
- Highfield module: `M1Yf3R9igpJDxJnOVr6f`
- Northside Marine org: `AcFZVEFA5UDJG2hyetWT`

---

## Git Workflow

```bash
# Always push to dev for auto-deploy:
git push -u origin claude/app-overview-wKiZ1

# After QA green-lights, merge to main for production:
git checkout main && git merge claude/app-overview-wKiZ1 && git push origin main
git checkout claude/app-overview-wKiZ1
```

**Always create new commits.** Never amend. Never force-push without explicit permission.

---

## Testing

```bash
npm run test:e2e              # full Playwright suite (~2-5 min)
npm run test:e2e:smoke        # critical path only (~30s)
npx playwright test -g "name" # single test by name
npx playwright show-report    # last HTML report w/ screenshots
```

70 tests across 9 spec files (v1.4 added `v1.4-trailers.spec.ts`, 7 specs). See `tests/helpers/utils.ts` for shared helpers (`waitForToast`, `reloadAndAssert`, `openTab`, `assertNoCrash`).

---

## When You're Stuck

1. Check `CLAUDE.md` "Known Lessons" section — chances are it's a documented gotcha
2. Check `.agents/evolution.md` for prior similar problems
3. Read the full file before editing (`modules/[id]/page.tsx` is ~1400 lines)
4. Ask the user rather than guess — especially about ambiguous UX decisions
5. When fixing a bug: add the regression test FIRST, then fix

---

## Key Gotchas (Top 10)

1. **`vendorId` is `LafOLpLb6QIFE856TiD4`, never `highfield`** — the slug is for URLs only
2. **`orderBy('order')` silently excludes docs without that field** — use unordered queries for models/variants
3. **`mainVendorId: null` crashes `doc()`** — always check before creating Firestore refs (non-catalog modules have null)
4. **Next.js `<Image>` breaks external CDN URLs** — use native `<img>` for external
5. **`useMemo` for Firestore refs causes infinite loops** — use `useMemoFirebase` instead
6. **Firestore `where('field', 'in', arr)` capped at 30** — slice first
7. **shadcn `<Input type="file">` in `<label>` doesn't fire** — use native `<input hidden>` + Button onClick trick
8. **`form.handleSubmit(onSubmit)` swallows errors silently** — always pass `onError` that calls `onSubmit(form.getValues())`
9. **Inc GST must `Math.ceil()` to whole dollars** per item row (v1.2.1 rule)
10. **Non-catalog modules have `mainVendorId: null`** — always check before `doc()` calls

---

## Agent Instructions

- **Subagents** for parallel research/exploration — protects main context window
- **One task per subagent** — keep them focused
- **NEVER parallel-edit the same file** — sequential only, or worktree conflicts will silently lose work
- **Mark todos complete IMMEDIATELY** — don't batch
- **Verify before "done"** — a passing build is not a passing feature

---

**End of bootstrap. Proceed to `CLAUDE.md`.**

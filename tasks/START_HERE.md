# START HERE — New Session Bootstrap

> **You are a Claude agent joining the HelmLogic project mid-flight.**
> Read this file FIRST. Then read the files listed in order. Do not skip any.
> Last updated: 2026-04-19 (post v1.3.1 hotfix, beginning v1.4 Trailers)

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
- **Today's date**: 2026-04-19
- **Current release state**: **v1.3.1 SHIPPED** (2026-04-17) — same-day hotfix merged to main. Now beginning **v1.4 Trailers Module**.

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

## Current Active Work — v1.4 Trailers Module

**Status**: Design approved, implementation pending data import.

**Blocker**: Need the user's Trailer Module Excel file dropped into `data-import/Trailer Module.xlsx`. User has it locally at `C:\Users\AsafA\Downloads\Trailer Module.xlsx` but the sandbox can't reach Windows paths.

**Design summary** (full doc: `tasks/v1.4-trailers-module-design.md`):
- One `trailers` module type, many trailer brand vendors (Mackay, Dunbier, Easytow, etc.)
- Mirrors Yamaha motor workspace pattern (Catalog / Pricing Manager / Settings — no Promotions tab)
- Each boat model gets a `trailerAssignments[]` field assigning specific trailers + pre-set dealer fit
- New "Trailer Options" tab in boat model editor (parallel to Motor Options)
- Quote Step 4 reads `model.trailerAssignments[]` instead of single `trailerConfig`

**See `tasks/v1.4-trailers-module-status.md` for the live implementation state.**

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

63 tests across 8 spec files. See `tests/helpers/utils.ts` for shared helpers (`waitForToast`, `reloadAndAssert`, `openTab`, `assertNoCrash`).

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

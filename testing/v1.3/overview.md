# v1.3 — Overview (Archive)

Released 2026-04-15. 20+ commits. Sourced from the April 4 NSM client feedback
round (13 items) plus photo-save and stock-UX polish.

---

## What shipped

### Quote Builder
- **"Features" button** → **"Standard Features"**.
- **"Custom Tactical Additions"** → **"Additional Factory Boat Notes/Options"** (Step 2).
- **Trailer Dealer Fit section** on Step 4 (amber theme) — renders items from `trailerDealerFitCategories[]` on the module doc. First appearance of the per-category source list that v1.4 extends to four sources.
- Pre-rig information display on the motor step.
- NSM extended warranty + service plan toggles in motor step.
- Promotions auto-apply — active promotions auto-tick in the quote builder.
- Engine specs + trailer specs dialogs in the quote builder.

### Module Settings
- New `trailerDealerFitCategories[]` field on the module doc.
- `ModuleDealerFitManager` reused with `fieldName="trailerDealerFitCategories"` in the boat module Settings tab.
- Dealer Fit merge now includes module-level trailer categories as the 4th source. (Before v1.3, merge had 3 sources; v1.4 formalises this as four.)

### Stock + Photo fixes
- Photo save bug fixed (multi-photo uploads no longer clobber each other).
- Stock column order tuned to match NSM workflow.
- Pending tab added on the stock list.
- Location-change UX fixed (no more phantom duplicate rows).

### Infrastructure
- Static analysis pass; 3 critical pre-release bugs caught and fixed before ship.
- Mobile responsiveness audit across main pages.

---

## Why it matters for later testers

- The `trailerDealerFitCategories[]` field **on the boat module** was introduced here. v1.4's "four-source merge" is literally this plus a rename. If a v1.4 trailer dealer-fit test fails, the baseline check is "did v1.3's Step 4 trailer dealer-fit render correctly?" — same code path.
- v1.3 is when `Math.ceil` Inc GST rounding became a hard expectation on every screen. If you see it elsewhere and it looks wrong, that's a regression not a v1.3 scope change.

---

## Handoff to v1.4

The v1.3 release notes include a "Looking Ahead" section previewing v1.4's
Trailers Module design. That design doc (`tasks/v1.4-trailers-module-design.md`)
was finalised on the v1.3 branch before v1.4 implementation began.

---

Full engineering changelog → [`release-notes.md`](./release-notes.md).

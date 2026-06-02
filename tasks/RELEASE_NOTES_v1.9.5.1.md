# HelmLogic — Release Notes v1.9.5.1

**Date:** 2026-06-02
**Branch:** `claude/app-overview-wKiZ1`
**Type:** Patch on the v1.9.5 line (prod-bug pass + Epic 9 first slice)

---

## Release Stats

| Metric | Value |
|---|---|
| Theme | Prod-bug pass + Fit-Up groundwork |
| Stories shipped | 2 (9.1.1 + 9.1.2) + 4 production bugs |
| New Firestore collections | 1 (`organisations/{orgId}/fitUpItems`) |
| New firestore.rules paths | 1 |
| New components | 2 (`FitUpCatalogManager`, `V1951RetargetButton` — one-shot) |
| Modified components | 2 (`manage-organisation-page`, plus the 4 bug-fix touches inherited from b516d4e) |
| Release-schedule entries | +1 (`v1.9.5.1`) |

---

## 1. Production Bug Pass

Four bugs surfaced from operator reports — landed on dev as commit `b516d4e` and are now rolled into v1.9.5.1.

### 1.1 Cover letter restored on the customer PDF

**Symptom:** The salesperson cover letter ("salesperson-message" content block) stopped appearing on Proposal PDFs after a recent change to `renderQuotePdf`.

**Root cause:** `renderQuotePdf` (the single-source PDF pipeline introduced in v1.8 story 1.5.0) never fetched the `SalespersonProfile` doc. `ProposalPDFDocument` hard-gates the salesperson-message block on `salespersonProfile` being present — when it was always null, the block silently disappeared. The content block resolver was working correctly; the upstream data was missing.

**Fix (`src/lib/render-quote-pdf.ts`):**
- Added `getDoc(doc(firestore, 'organisations', orgId, 'salesTeam', quote.createdByUid))` to the parallel `Promise.all`.
- Keyed by `quote.createdByUid` (not the current user) — a PDF rendered by anyone must still show the salesperson assigned to that quote.
- Profile URLs (`photoUrl` + any inline images in `messageHtml`) flow through the existing image-preload pipeline.
- Dev-only canary: if a salesperson-message block resolves with non-empty HTML but `salespersonProfile.messageHtml` is empty/missing, `console.warn` fires so this class of silent-drop bug screams instead of lurking.

### 1.2 Dealer-fit option names no longer render blank

**Symptom:** Some dealer-fit line items on proposals showed an empty name field with only the dollar amount visible.

**Root cause:** The pick-time snapshot stored under `quote.dealerFit[*].name` had been built from a narrow field-name fallback chain (`['Description', 'Item', 'Name']`). MPF / vendor-feed imports use a much wider set: `Part Description`, `PART DESCRIPTION`, `Long Description`, `partName`, `Title`, `Heading`, etc. Legacy quotes already in the wild had blank names.

**Fix (defence in depth):**
- `src/components/finalize-quote-dialog.tsx` — widened the fallback chain at snapshot time. Also added a `code` field (Part Number / SKU / nsmCode / factoryCode fallback) so downstream renderers always have *something* to show.
- `src/components/proposal-pdf.tsx` — render-side defence: `{item.name || item.code || 'Dealer Fit Item'}`.
- `src/components/proposal-view.tsx` — same render-side defence on the on-screen list at line ~1101.

This is the "two ends of the pipeline" lesson from the v1.4 trailer review — fixing only the snapshot would have left legacy quotes broken forever; fixing only the renderer would silently mask the snapshot drift on every new quote.

### 1.3 Locked-quote discount save no longer phantom-succeeds

**Symptom:** On a locked quote, clicking Save Discount appeared to succeed (no error toast) but the change wasn't applied — refreshing the page showed the old value.

**Root cause:** `handleSaveDiscount` in `src/components/proposal-view.tsx` wrote directly to Firestore without checking `quote.isLocked`. The firestore.rules `onlyLockFieldsChanged()` whitelist blocked the write at the rules layer, but the failure was caught + silently swallowed by the global error emitter rather than surfaced.

**Fix:** Added an explicit `if (quote.isLocked === true) { toast destructive "Quote is locked"; return; }` guard *before* the `updateDoc` call. Operators now get an immediate honest "Quote is locked — Create v2 to change discount" toast.

### 1.4 Stock-import duplicate-stock-number race

**Symptom:** Bulk stock imports could create duplicate `stockNumber` values when two operators imported within the same millisecond, or when an import row had a blank stock-number cell and got auto-assigned by `Date.now()`.

**Root cause:** The fallback `IMP-${Date.now().toString().slice(-6)}` is millisecond-precise — two concurrent imports collide.

**Fix (`src/components/stock-import.tsx` line 280):** Switched to `IMP-${Date.now().toString(36).slice(-6)}-${Math.random().toString(36).slice(2,6)}`. Base-36 encoding + 4 random chars makes a collision in any realistic window vanishingly unlikely.

---

## 2. Fit-Up Groundwork (Epic 9.1.1 + 9.1.2)

**Goal:** Pull the schema + admin slice of the Fit-Up epic forward from v1.10–13 so dealer-admins can begin populating their fit-up library while v1.10 (Service Quoting) ships in parallel.

### 2.1 Master Fit-Up Catalog (Story 9.1.1)

**New Firestore collection:** `organisations/{orgId}/fitUpItems/{itemId}`

**Schema:**
```ts
interface FitUpItem {
    name: string;
    tier: 'simple' | 'medium' | 'complex';   // effort/complexity
    cost: number;                             // what it costs the dealer
    sellPrice?: number | null;                // optional override; absent = derive from margin (future)
    notes?: string | null;                    // operator-only notes
    createdAt: Timestamp;
    updatedAt: Timestamp;
}
```

**Design notes:**
- Per-org (each dealer's own master catalog), mirroring `dealerFitSelections`.
- Tier is a hard enum — keeps Epic 9.3.1 (auto-classification) tractable.
- `sellPrice` is nullable on purpose: until margin tooling lands, operators may want to set sell prices manually; afterwards, blank `sellPrice` lets the system derive from a margin rule.
- `notes` are operator-internal — they will *not* surface on customer PDFs (per Story 9.2.3 — single summary line on the customer PDF, no itemised breakdown).

**firestore.rules:** New `match /fitUpItems/{itemId} { allow read, write: if isSignedIn(); }` inside the existing `organisations/{orgId}` block. UI-layer org-admin gate enforced via `/manage`'s `can_access_settings` permission, matching the rest of the org subcollection pattern.

### 2.2 Fit-Up Item Editor (Story 9.1.2)

**New component:** `src/components/fit-up-catalog-manager.tsx`

**Surface:** New "Fit-Up Catalog" tab in **Manage Organisation** (`/manage`). Visible to operators with `can_access_settings`.

**Capabilities:**
- Add / Edit / Delete items via the side dialog.
- Tier filter chips at the top with counts (All / Simple / Medium / Complex).
- Each row shows tier badge, name, optional notes, cost + sell-price-if-set.
- Validation: name required (trimmed), cost ≥ 0, sell price ≥ 0 if provided.

### 2.3 Not in v1.9.5.1 (explicit non-goals)

| Story | Title | When | Why deferred |
|---|---|---|---|
| 9.1.3 | Import/Export Fit-Up Data | Unscheduled | Bulk CSV import is a follow-on quality-of-life; the catalog is small enough to hand-author for early dealers. |
| 9.1.4 | Bulk Update + Global Markup Tools | Unscheduled | Margin tooling depends on cross-org margin strategy (v1.20+); ship after that lands. |
| 9.2.1 | Fit-Up Module Tab | v1.16–2.0 | Quote-flow integration — separate epic slice, intentionally deferred. |
| 9.2.2 | Fit-Up Checkbox + Selection | v1.16–2.0 | Same. |
| 9.2.3 | Customer PDF Summary Line | v1.16–2.0 | Same. |
| 9.3.1 | Rule-Based Auto-Classification | v2.2 | Depends on 9.1.x + 9.2.x being live. |

---

## 3. Flow-On Effects

### 3.1 Firestore feature stories retargeted

A one-shot **"Apply v1.9.5.1 retarget"** button lives at the top of the new **Manage → Fit-Up Catalog** tab. Clicking it once (post-deploy) walks the `features` collection and updates:
- `9.1.1 — Master Fit-Up Catalog` → `targetRelease: 'v1.9.5.1'`, `status: 'shipped'`
- `9.1.2 — Fit-Up Item Editor` → `targetRelease: 'v1.9.5.1'`, `status: 'shipped'`

The button is idempotent — re-clicking is a no-op. The follow-up cleanup commit (per CONVENTIONS.md one-shot lifecycle) removes the button + its `v1951-retarget-button.tsx` file.

### 3.2 Cross-story dependency graph

The remaining Epic 9 stories (9.1.3, 9.1.4, 9.2.1, 9.2.2, 9.2.3, 9.3.1) reference 9.1.1 + 9.1.2 in their `dependsOn` / acceptance text. Those refs are now **healthier** — the dependencies have shipped *earlier* than originally planned, so any future retarget of the dependents is guaranteed to land on or after a shipped dependency. The `dependency-validation.ts` `compareReleases` check inserts `v1.9.5.1` into the canonical order after `v1.9.5` and before `v1.10`, so order-violation checks remain correct.

### 3.3 Release schedule

`src/lib/release-schedule.ts` — added `'v1.9.5.1': { shipped: true }` immediately after the existing `v1.9.5` entry. The roadmap renders v1.9.5 + v1.9.5.1 as adjacent shipped pills, then resumes the unshipped v1.10 → v1.40 runway via `buildV1MinorReleases()` (unchanged).

### 3.4 In-app Release Notes tab

The in-app `/feature-tracking` Release Notes tab (Server Component, reads `tasks/RELEASE_NOTES_*.md` at build time via `loadReleaseNotes`) picks up this file automatically on the next deploy. Same for the paired user guide.

### 3.5 Capacity reshuffle

9.1.1 + 9.1.2 had previously been bucketed somewhere inside the v1.10–v1.13 capacity packing. Their slots are now free. No active re-pack needed — the runway has buffer; the `Auto-Apply` bin-packer (when next run) will simply not re-target them since they're already shipped.

---

## 4. Process notes

- **One-shot lifecycle:** This release ships *with* a one-shot button (`V1951RetargetButton`). Per CONVENTIONS.md, a follow-up cleanup commit on the same dev branch removes the button + the file before the dev → main PR is opened. If you're reading these notes and the button still exists in the codebase, the cleanup commit is pending.
- **Bug-pass discipline:** Two agent-flagged "bugs" were verified as false positives and *not* fixed (personalisation lock-guard — `contentOverrides` subcollection has its own independent `allow read, write` rule and doesn't inherit parent lock; content-block-import "silent skip" — the toast at line 222 already reports skipped counts). Lesson captured in `.agents/evolution.md`.
- **Save error + import error** — two further bugs from the operator report are awaiting concrete repros from the user. They are *not* included in v1.9.5.1.
- **RU200KAM $76.82 delta** — deferred to v1.11, needs real-quote + MPF-row repro.
- **Trailer Catalog missing models** — data re-import (not code), out of scope for v1.9.5.1.

---

## Files Changed

**Code (new):**
- `src/components/fit-up-catalog-manager.tsx`
- `src/components/v1951-retarget-button.tsx`

**Code (modified):**
- `src/components/manage-organisation-page.tsx` — new "Fit-Up Catalog" tab; mounts the catalog manager + one-shot retarget button
- `src/lib/render-quote-pdf.ts` — salespersonProfile fetch + image-preload coverage + dev-only canary (cover letter fix)
- `src/components/finalize-quote-dialog.tsx` — widened dealer-fit name fallback chain + `code` field
- `src/components/proposal-pdf.tsx` — render-side defence on dealer-fit names
- `src/components/proposal-view.tsx` — render-side defence on dealer-fit names + locked-quote discount guard
- `src/components/stock-import.tsx` — base-36 + random suffix for fallback stockNumber

**Rules:**
- `firestore.rules` — `organisations/{orgId}/fitUpItems/{itemId}` allow read, write: if isSignedIn()

**Config:**
- `src/lib/release-schedule.ts` — `'v1.9.5.1': { shipped: true }`

**Docs:**
- `tasks/RELEASE_NOTES_v1.9.5.1.md` (this file)
- `tasks/USER_GUIDE_v1.9.5.1.md`
- `CLAUDE.md` — release-state table updated
- `tasks/SESSION_HANDOVER.md` — new `fitUpItems` collection documented
- `.agents/evolution.md` — session entry + bug-pass discipline lesson

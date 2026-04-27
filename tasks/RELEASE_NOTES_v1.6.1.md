# HelmLogic — Release Notes v1.6.1 (Patch)

> Release Date: 2026-04-27
> Branch: `claude/app-overview-wKiZ1` → main
> Patch release on top of v1.6.0

### Release Stats
- **2 commits** since v1.6.0 (1 feat + 1 chore)
- **4 files changed**: `src/lib/release-schedule.ts`, `src/components/backlog-view.tsx`, `src/components/feature-tracking-board.tsx`, `src/components/roadmap-view.tsx`
- TypeScript: zero new errors from v1.6.1 work
- `npm run build`: clean — `/feature-tracking` 153 kB

### Source of Requirements
Stakeholder feedback the day v1.6.0 shipped:

> "1.6 here is empty. and when finished the thing should show as green or something like that to signify that the release is done and that it shouldn't be editable anymore"

Two problems wrapped together: (1) the v1.6 release column on the Roadmap was empty because we hadn't seeded its own work into itself, and (2) shipped releases looked the same as in-flight ones — no visual cue that they were locked, no actual lock on the data.

---

## Shipped-release Lock UX (the v1.6.1 cornerstone)

A release marked `shipped: true` in `RELEASE_WINDOWS` now drives a coordinated set of "this is locked" treatments across every surface that touches a feature.

### `RELEASE_WINDOWS` extension
```ts
export interface ReleaseWindow {
    isMVP?: boolean;
    shipped?: boolean;  // NEW
}
```
Plus `isReleaseShipped(releaseKey)` helper. Flipping the flag is the only step needed when a future release ships — every visual + behavioural lock follows automatically.

### Roadmap header
- Emerald wash on the column header (replaces capacity colour-coding for that column).
- Emerald **"Shipped"** pill with a checkmark next to the release label.
- Lock icon in the points/items row.

### Roadmap cells
- Emerald background tint on every cell in a shipped column.
- `useDroppable({ disabled: true })` so the blue hover-ring never appears on a shipped cell.
- `onDragEnd` defensively rejects shipped-source and shipped-target moves with a destructive toast (`"v1.6 has shipped — Stories from a shipped release are locked and can't be moved."`).

### Roadmap chips
- Chips in shipped releases are not draggable (`useDraggable({ disabled: true })`).
- Emerald border + emerald-tinted background.
- Lock icon on the status line.
- Tooltip clarifies: `"<title> — shipped (read-only) · click to view"`.
- Click still opens the detail sheet (which renders read-only).

### Backlog row
- Release pill renders **emerald + lock icon** when the targetRelease is shipped (was: indigo).
- Tooltip: `"v1.6 shipped — read-only"`.

### Detail sheet (the deepest lock)
- Emerald **"Shipped in v1.6 — read-only"** banner above the metadata grid.
- Every scope input disabled: status / type / priority / epic / points / target release / title / description / accept / revoke / archive.
- Comments + voting + tags stay live — those are running history, not scope changes.
- The footer shows a `"Locked — shipped in v1.6"` chip in place of the Archive button.

### Picker plumbing
Added an optional `disabled?: boolean` prop to `ReleasePicker`, `EpicPicker`, `PointsPicker` so the lock can be threaded down without rebuilding each component. shadcn's `<Select disabled={...}>` propagates correctly.

---

## v1.6 Self-Seed (one-shot, then removed)

The Platform & Tooling epic + 13 v1.6 work stories are now permanent records under v1.6 in the Roadmap, populated via a one-shot admin button on the Backlog. The button shipped with v1.6.1 (commit `ebffbc4`), the seed ran successfully, and the button was then removed (commit `9dcfd9d`) along with `src/lib/v16-self-seed.ts`. The data lives in Firestore as the source of truth.

### What was seeded
- 1 new epic: **Platform & Tooling** (indigo, order 700) for internal HelmLogic infrastructure work.
- 13 stories, all `status: shipped`, `targetRelease: v1.6`, auto-accepted by the seed runner (Asaf):
  - v1.6.1 — Epics as a first-class concept (5 pts)
  - v1.6.2 — Story points (Fibonacci 1/2/3/5/8) (2 pts)
  - v1.6.3 — Backlog tab (collapsible epic groups) (5 pts)
  - v1.6.4 — Roadmap tab (epic × release grid) (8 pts)
  - v1.6.5 — Drag-and-drop chips on Roadmap (3 pts)
  - v1.6.6 — Filter bar + click-epic-to-solo on Roadmap (2 pts)
  - v1.6.7 — Per-story Accept button (2 pts)
  - v1.6.8 — Soft delete + Archive view + Restore (2 pts)
  - v1.6.9 — Type system extension (3 → 6 types) (1 pt)
  - v1.6.10 — "Half" releases (v1.7.5 / v1.8.5 / v1.9.5) (1 pt)
  - v1.6.11 — No date labels on Roadmap (1 pt)
  - v1.6.12 — Sub-dealer gate on /feature-tracking (2 pts)
  - v1.6.13 — MVP plan seeded (108 stories) (6 pts)

Total: **40 pts** — right at the cap, an honest signal of v1.6's lift.

### Why an in-app button + immediate removal
Same pattern as the v1.6.0 MVP plan seeder: HelmLogic ships via App Hosting with no local dev env, so a one-shot admin button is cheaper than spinning up a CLI script + service-account key. Idempotent under the hood (skipped by title) so accidental re-clicks were a no-op. After the user confirmed v1.6 looked right on dev, the button + seed module were stripped to keep the product surface clean.

---

## Files Changed

| File | Status | Purpose |
|---|---|---|
| `src/lib/release-schedule.ts` | Modified | Added `shipped?: boolean` to `ReleaseWindow`, set on v1.6, added `isReleaseShipped()` helper |
| `src/components/feature-tracking-board.tsx` | Modified | Lock banner + disabled inputs in `FeatureDetailBody`; `disabled` prop on `ReleasePicker` / `EpicPicker` / `PointsPicker` |
| `src/components/roadmap-view.tsx` | Modified | Emerald header + cells + chips + drop-blocking + drag-blocking on shipped releases |
| `src/components/backlog-view.tsx` | Modified | Emerald release pill on shipped-release rows |
| `src/lib/v16-self-seed.ts` | Created → Deleted | One-shot seed payload; lived for the duration of the seed run, then removed |

---

## Out of Scope for v1.6.1

- Auto-flip of `shipped: true` on PR merge (manual config edit for now — ritual is a 1-line change in `release-schedule.ts` per release).
- Per-story override to allow editing a shipped story (not needed yet — comments cover correction-of-record use cases).
- Audit trail of any unlock event (would matter if we add an unlock affordance later).

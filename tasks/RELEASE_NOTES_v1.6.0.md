# HelmLogic — Release Notes v1.6.0

> Release Date: 2026-04-27
> Branch: `claude/app-overview-wKiZ1` → main
> Major release since v1.5.1

### Release Stats
- **39 commits** since divergence from `main`
- **6 new components** + 2 new lib modules + 1 new in-app route surface
- **3 new top-level Feature Tracking tabs**: Backlog, Roadmap, plus the existing Board and Release Notes
- **1 new top-level Firestore collection**: `epics/{epicId}` (with the existing `features/{featureId}` getting 7 new optional fields)
- **108 features** seeded into the live MVP plan, distributed across 6 epics and 7 release columns
- TypeScript: zero new errors from v1.6 work
- `npm run build`: clean — `/feature-tracking` 149 kB

### Source of Requirements
Stakeholder MVP brief delivered post-v1.5 ship — full document of "what HelmLogic must do to be useful, credible, and extensible." Five capability epics covering guided configuration, pricing accuracy, data sustainability, promotions, and security. v1.6 ships the **planning system** to organise that work + seed the entire MVP backlog into HelmLogic itself, dogfood-style.

---

## Planning System (the v1.6 cornerstone)

A new product surface inside Feature Tracking: organise work by epic, see it on a Roadmap, run a Backlog list. Tabs reorder to: **Backlog | Board | Roadmap | Release Notes**.

### Epics — first-class data model
- New collection `epics/{id}` with `title`, `shortLabel`, `description`, `color` (7-key palette: blue / amber / violet / emerald / rose / indigo / slate), `order`, `status`.
- Features gain an optional `epicId` field linking to an epic.
- Soft-delete added to features: `deletedAt` + `deletedBy` fields, deleted features hidden from Board/Roadmap/Backlog, restorable from the Archive view on the Board.

### Story points
- New optional `points` field on features (Fibonacci 1 / 2 / 3 / 5 / 8 picker).
- Renders as a pill on every card / chip / row.
- Backlog epic header sums points for the whole epic.
- Roadmap header sums points for each release column with capacity colour-coding (amber ≥ 35 pts, red ≥ 50 pts).

### Backlog tab (default)
- Collapsible epic groups, sorted in-progress → planned → submitted → shipped, then alphabetically.
- Per-epic header: count of features, accepted tally (`5 / 22`), total points.
- Per-feature row: type icon, title, priority chip, release pill, points badge or "?" if unestimated.
- Inline `+` button per epic header to "Add story under this epic" — opens the Create Feature dialog with the epic pre-filled.
- "+ New Epic" button opens a small dedicated epic-create dialog.

### Roadmap tab
- 8 release columns: v1.6 / v1.7 / v1.7.5 / v1.8 / v1.8.5 / v1.9 / v1.9.5 / v2.0 + Backlog (Unscheduled).
- Y-axis: epic swim lanes, color-banded.
- Cells: compact feature chips (type icon, title, priority dot, points / "?" badge, status text).
- Header per release shows points sum + item count + capacity-overload icon.
- Footer shows release totals row.
- Filter bar at top: multi-select chips for epics + releases. Clear filters link.
- Click an epic swim-lane label to "solo" it (filter to that epic only).
- Drag-and-drop chips between cells: updates `epicId` and `targetRelease` in one operation. Optimistic overlay so the chip moves instantly. Toast warning when dropping into an over-capacity release.

### "Half" releases
- Intermediate buckets v1.7.5 / v1.8.5 / v1.9.5 added so themed work can be split into ~25-40 pt buckets without forcing one giant release.

### No date labels on the Roadmap
- Stripped per stakeholder feedback: visible date ranges implied a fixed timeline / commitment we don't want to make. Releases are aspirational, not promises. Dates removed from the data model entirely.

---

## Story Acceptance

Stakeholder sign-off per story.

- New optional fields on features: `acceptedAt`, `acceptedBy`, `acceptedByName` (display name snapshotted at accept time).
- **Detail Sheet**: emerald banded callout with "Accepted by [name] · [date]" + Revoke button when accepted; "Not yet accepted" with green Accept button when not.
- **Backlog feature row**: tiny "Accepted" pill with checkmark when accepted, tooltip showing accepter + date.
- **Backlog epic header**: tally pill `5 / 22` (turns emerald when 100% accepted) so progress is visible at a glance.

---

## Sub-dealer Page Gate

`/feature-tracking` is internal-only.

- Sidebar entry hidden when the user's organisation has `parentOrganisationId` set.
- Page-level guard on `feature-tracking-view.tsx` shows a "Not available for sub-dealer accounts" panel if a sub-dealer reaches the route via direct URL.
- Spec called for sub-dealer isolation; this is the most defensive surface to start.

---

## Type System Extension

Features now have 6 type values (was 3): **feature** ✨, **bug** 🐛, **improvement** 🔧, **content** 📄, **decision** ⚖️, **task** 📋. The new types let us track non-code work (content the business has to write, decisions to be made, ops activities like training and migration) on the same board as code stories. Each type renders with a distinct icon + colour everywhere a card/chip/row is shown.

---

## MVP Plan Seeded into HelmLogic

In-app `seedMvpPlan()` function generates 6 Epics + 108 Features that match the full stakeholder MVP spec. Includes:

- 22 user-story features from the original MVP brief
- 41 lifecycle / CRM / commercial-integrity expansion features (quote lifecycle states, customer 360, contract conversion, deposit recording, payment schedules, variations, dashboards, admin UIs)
- 14 content deliverables (proposal copy, T&Cs, payment plan text, receipt branding, etc)
- 16 decisions (margin thresholds, fit-out tier pricing, pipeline stages, override authorities, etc)
- 16 ops activities (training plan, customer migration, AD setup, photo audit, legal review, etc)

Final capacity per release (all under the 40-pt "honest signal" cap):
| Release | Pts | Items |
|---|---:|---:|
| v1.7 | 30 | 22 |
| v1.7.5 | 34 | 10 |
| v1.8 | 23 | 13 |
| v1.8.5 | 23 | 7 |
| v1.9 | 40 | 15 |
| v1.9.5 | 38 | 10 |
| v2.0 | 29 | 8 |

(Plus 23 items in Unscheduled for post-MVP.)

---

## Source-of-Truth Audit

Every story in the seeded plan was audited to verify HelmLogic-as-master-record alignment. Findings:

- 4 wording tweaks applied to clarify HelmLogic ownership (2.1.1 pricing imports, 2.4.6 tax invoice, 3.1.1 imports, customer migration task).
- 2 new stories added to close gaps:
  - **3.6.1 Inbound Import Idempotency** (improvement, v1.9, 2 pts) — codifies the v1.4 lesson that all importers should upsert by natural key.
  - **5.6.1 Customer Data Export / right-to-port** (feature, Unscheduled, 3 pts) — Australian Privacy Principle 12 compliance.
- All Revolution-specific stories removed from the active scope (Revolution integration is parked).

---

## Visual Polish + Bug Fixes

- Banner padding tightened so columns stretch to screen edges.
- Per-column scroll on the Kanban so columns don't grow with content.
- Bigger / clearer chips on the Roadmap with priority dot + points badge + status text.
- Roadmap column header now shows "X pts · N items" instead of just points (Mark's bug — null-point columns no longer read as empty).
- shadcn `<ScrollArea>` swapped for native `feature-scroll` overflow div with always-visible scrollbar (better UX for the dialogs and the Backlog body).

---

## Out of Scope for v1.6

- @-mentions in comments (parked — depends on email integration, currently blocked on SMTP config debug)
- Email integration end-to-end (Trigger Email extension installed but SMTP config is throwing `Cannot read properties of undefined (reading 'sendMail')` — parked for later debug)
- Roadmap "Today" pill (no dates, so no concept of an active release column)
- Multi-tenant Roadmap (one shared roadmap for the org; per-team views deferred)

---

## Files Changed (Key Components)

| File | Status | Purpose |
|---|---|---|
| `src/components/feature-tracking-view.tsx` | New | Top-level tab switcher (Backlog / Board / Roadmap / Release Notes), URL-synced |
| `src/components/backlog-view.tsx` | New | Collapsible epic-grouped backlog with per-epic add-story button + accepted tally |
| `src/components/roadmap-view.tsx` | New | Swim-lane × release timeline with filter bar, click-to-solo, drag-and-drop, capacity colour-coding |
| `src/components/create-epic-dialog.tsx` | New | Single-purpose New Epic dialog |
| `src/components/feature-tracking-board.tsx` | Modified | Extended FeatureType enum (6 types), epicId/points/accepted/deleted fields, Accept button + display, soft-delete + Archive view, board cards updated |
| `src/lib/release-schedule.ts` | Modified | 8-bucket release schedule (added v1.7.5/8.5/9.5), date labels stripped, capacity thresholds bumped to 35 amber / 50 red |
| `src/lib/mvp-plan-seed.ts` | New | 6 Epics + 108 Features seeded for the full MVP plan |
| `firestore.rules` | Modified | Added `epics/{id}` + `mail/{id}` collection rules |
| `tasks/v1.6-planning-system-design.md` | New | Locked design doc |
| `tasks/v1.6-source-of-truth-audit.md` | New | Audit findings on HelmLogic-as-system-of-record alignment |

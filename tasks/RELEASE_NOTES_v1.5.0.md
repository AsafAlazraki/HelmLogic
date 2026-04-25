# HelmLogic — Release Notes v1.5.0

> Release Date: 2026-04-25
> Branch: `claude/app-overview-wKiZ1` → main (PR #26)
> Major release since v1.4.0

### Release Stats
- **11 commits** since divergence from `main`
- **18 files changed** · **+3,492 / −7 lines** (~3.5K net new code)
- **1 new top-level page**: `/feature-tracking` (sidebar entry between Pricing Manager and Settings)
- **3 new components**: `feature-tracking-board.tsx` (~1,800 lines, hosts board + create dialog + detail sheet), `feature-rich-text-editor.tsx` (TipTap), `feature-image-uploader.tsx` (multi-file upload to Firebase Storage)
- **2 new helper components**: `feature-tracking-view.tsx` (tab switcher), `release-notes-view.tsx` (timeline reader)
- **1 new server-side loader**: `release-notes-loader.ts` reads `tasks/RELEASE_NOTES_*.md` at request time and renders to HTML via `marked`
- **9 new dependencies**: `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder`, `@tiptap/extension-image`, `@tiptap/extension-link`, `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, plus `marked` for the release notes loader
- **1 new Firestore collection**: `features/{featureId}` plus its `comments/{commentId}` subcollection
- Build clean — `/feature-tracking` 139 kB
- TypeScript: 84 pre-existing errors, **zero new** from v1.5 work

### Source of Requirements
A casual line dropped into chat — "1.5 is going to be a new page on the application inside the nav menu… called Feature Tracking… visible to everyone… every feature should have an image upload, multiple if need… text box to put things in and description, think very agile". Across four rounds of clarifying popups it firmed up into: rich text + multi-image submissions, per-column drag-drop reorder + status change, voting, comments, fully open permissions for any signed-in user. Borrowed the `acceptanceCriteria: string[]` pattern from `OrenAlazraki/act-ai-platform`'s public Task model.

---

## New Top-Level Page

### `/feature-tracking`

Two tabs at the top: **Board** and **Release Notes**. Tab state is URL-synced (`?view=notes`) so a refresh lands the user on the same view.

- **Board tab** — live Kanban for active feature work.
- **Release Notes tab** — historical release log auto-generated from the `RELEASE_NOTES_*.md` files in this repo.

Sidebar entry uses the `Lightbulb` icon, slotted between Pricing Manager and Settings.

---

## Kanban Board

Five columns, fully open to any signed-in user — no roles, no approval gates.

| Column | Accent |
| --- | --- |
| Submitted | slate |
| Under Review | amber |
| Planned | blue |
| In Progress | violet |
| Shipped | emerald |

Cards show: title with type icon (✨ feature / 🐛 bug / 🔧 improvement), priority badge (5 levels), target release pill, up to 3 tags + overflow count, vote count, comment count, submitter name.

### Drag and drop

`@dnd-kit/core` + `@dnd-kit/sortable`.

- Single `DndContext` wraps all 5 columns — cards can move between.
- `PointerSensor` with `activationConstraint: { distance: 5 }` so a plain click on a card opens the detail sheet, while a 5px move starts a drag. Drag and click coexist on the same surface.
- Each column body is a drop target so empty columns accept drops.
- **Fractional-index reorder**: on drop, `newOrder = (prevNeighbour.order + nextNeighbour.order) / 2` (or ±10 at an edge). No bulk renumber, no Firestore write storm, concurrent drags don't fight.
- **Optimistic UI**: dropped card renders in its new position immediately via a board-level `Record<id, { status, order }>` overlay. Cleared once the live snapshot catches up, rolled back on write failure (toast).

### Per-column sort toggle

Each column has its own sort mode (board-level state, per-column):

- **Manual** (default) — by `order` ASC. Drag enabled.
- **Most votes** — by `voteIds.length` DESC. Drag disabled.
- **Newest first** — by `createdAt` DESC. Drag disabled.

Drag is auto-disabled in non-manual modes (cursor flips grab → pointer) so a drop can't write `order` only to have the active sort criterion snap the card back.

---

## Create Feature Dialog

Single dialog with rich-text description + multi-image upload + Agile-style acceptance criteria + tags + preset target release.

- **Title** — 3-char minimum (validation on Submit button enabled state).
- **Type** — Feature / Bug / Improvement.
- **Priority** — Critical / High / Medium / Low / Nice to have.
- **Description** — TipTap editor with H2/H3, bold, italic, bullet list, numbered list, link (with edit/remove), undo/redo. Stored as HTML.
- **Acceptance Criteria** — folded into the same section as Description, under a subtle "how will we know it's done?" subheading. Add via Enter key, remove via X button. Stored as `string[]`.
- **Tags** — chip input, Enter or comma to add. Lowercased.
- **Target Release** — preset Select with v1.5 → v2.0 + Unscheduled. Legacy free-text values (e.g. a feature saved under "v1.4" before this refactor) are preserved as a "(current)" item at the top.
- **Images** — multi-file upload to Firebase Storage at `features/{featureId}/...`, plus paste-URL mode. Max 10 images.

### Client-side doc IDs unlock pre-save uploads

The dialog generates the feature ID client-side via `doc(collection(firestore, 'features')).id` so the image uploader has a `features/{featureId}/` Storage path before the feature doc is saved. Sidesteps the chicken-and-egg of "upload needs ID" vs "ID only exists after `setDoc`".

---

## Detail Sheet

Right-side `Sheet` (480px+) opens on card click. Keyed by `feature.id` so local drafts (title, description) reset between features.

- **Header** — inline-editable title, type icon, current column badge, submitter line.
- **Status / Type / Priority** — three Selects, save on change.
- **Target Release** — same `<ReleasePicker>` as the create dialog.
- **Vote button** — `arrayUnion(uid)` / `arrayRemove(uid)` on `voteIds`. Live count.
- **Description** — read-only `FeatureDescriptionView` by default; **Edit** button flips to TipTap editor + Save / Cancel. Local draft + explicit Save avoids per-keystroke Firestore writes.
- **Acceptance criteria** — folded into the Description section. Live add/remove (no draft, atomic ops).
- **Tags** — chip editor, live add/remove.
- **Images** — `FeatureImageUploader`, live add/remove.
- **Comments** — live subscription to `features/{id}/comments` ordered by `createdAt`. Cmd/Ctrl+Enter posts. Each comment has author + timestamp + delete button.
- **Footer** — Delete (with confirm dialog) and Close.

### `commentCount` denorm

Card badge reads `feature.commentCount`, not the subcollection size, so a card never has to subscribe to its own `comments` subcollection. `addDoc` to the subcollection plus `updateDoc(parent, { commentCount: increment(1) })`. `-1` on delete.

---

## Release Notes Tab

Server-side loader + two-pane timeline reader. Renders every `tasks/RELEASE_NOTES_*.md` file in the repo (currently v1 → v1.4 plus this file once it lands).

- Page is a **Server Component**: reads files at request time, parses with `marked`, passes parsed `{ version, title, date, html }[]` as props to the Client View. Heavy markdown→HTML runs once at build, not in the browser.
- **Sidebar** — gradient banner, lists every release with date, highlights the version currently in view via a scroll listener that picks the block closest to the top of the article pane. Click a version to smooth-scroll there.
- **Article pane** — full release notes with Tailwind typography overrides for H1/H2/H3, lists, bold, code, pre, tables, blockquotes, hr, links. The newest release gets a "Latest" badge.
- **Empty state** — friendly panel explaining that release notes appear automatically when a `RELEASE_NOTES_vX.Y.Z.md` file is dropped in `tasks/`.

---

## Data Model

### `features/{featureId}`

```
title:              string  (≥3 chars on submit)
description:        string  (HTML from TipTap)
type:               'feature' | 'bug' | 'improvement'
status:             'submitted' | 'under-review' | 'planned' | 'in-progress' | 'shipped'
priority:           'critical' | 'high' | 'medium' | 'low' | 'nice-to-have'
targetRelease:      string | null   (preset list — see RELEASE_OPTIONS)
tags:               string[]        (lowercased)
voteIds:            string[]        (user uids — one vote per user)
order:              number          (fractional index within column for drag-drop)
acceptanceCriteria: string[]        (Agile-style bullets)
imageUrls:          string[]        (max 10; features/{id}/... in Storage)
commentCount:       number          (denorm for card badge)
submitterId:        string
submitterName:      string          (resolved at create time from user profile)
createdAt:          Timestamp (serverTimestamp)
updatedAt:          Timestamp (serverTimestamp)
```

### `features/{featureId}/comments/{commentId}`

```
body:        string
authorId:    string
authorName:  string  (resolved from user profile at post time)
createdAt:   Timestamp (serverTimestamp)
```

---

## Security Rules

Fully open to any signed-in user:

```
match /features/{featureId} {
  allow read, write: if isSignedIn();
  match /comments/{commentId} {
    allow read, write: if isSignedIn();
  }
}
```

Spec called for "every signed-in user can do every action — no roles, no approval gates" so there's deliberately no ownership check. Anyone can edit, move, delete, or re-tag anyone's feature. Reverting to a stricter model later is a one-rule swap.

---

## Visual Polish

- Custom `feature-scroll` utility class in `globals.css` — 10px track, slate-300 rounded thumb that darkens on hover, `scrollbar-gutter: stable`. Applied to the create dialog body, detail sheet body, every Kanban column body, and both panes of the release-notes view. Replaces shadcn `<ScrollArea>` (which hides its thumb until hover) wherever a scrollbar should be evident.
- Per-column scroll on the Kanban: outer wrapper switches to `lg:overflow-hidden` on large screens so the page doesn't grow with the tallest column. Each column body scrolls internally. On smaller (stacked) layouts we fall back to page-level `overflow-y-auto`.
- Grid uses `lg:auto-rows-fr` so the single-row 5-column layout actually stretches to the flex-1 height (without it, `auto` rows hug content height and `lg:h-full` on a column has nothing to bite).

---

## Out of Scope for v1.5

These are deliberately deferred. Capture in v1.6 design if demand surfaces:

- Email / Slack notifications on new features or comments
- @-mention autocomplete in comments
- Search and filter bar (tag filter, text search across titles)
- "My features" view
- GitHub issue sync
- Roadmap / timeline view that buckets features by `targetRelease` (the Release Notes tab is for shipped releases only)
- Permission model — roll back from "everyone can do everything" to a reviewer/submitter split if the free-for-all gets messy in practice
- localStorage persistence for per-column sort

---

## Files Changed (Key Components)

| File | Status | Purpose |
| --- | --- | --- |
| `src/app/(app)/feature-tracking/page.tsx` | Created | Server Component — calls the release-notes loader, renders `<FeatureTrackingView>` with parsed notes as props |
| `src/components/feature-tracking-view.tsx` | Created | Client tab switcher: Board / Release Notes, URL-synced via `?view=` |
| `src/components/feature-tracking-board.tsx` | Created | ~1,800-line component: board, columns, cards, create dialog, detail sheet, drag-drop, optimistic state, vote, comments |
| `src/components/feature-rich-text-editor.tsx` | Created | TipTap wrapper (StarterKit + Placeholder + Link). Exports `FeatureRichTextEditor` + `FeatureDescriptionView` for read-only |
| `src/components/feature-image-uploader.tsx` | Created | Multi-file upload to `features/{featureId}/` in Firebase Storage + paste-URL mode |
| `src/components/release-notes-view.tsx` | Created | Two-pane timeline reader for the historical release notes |
| `src/lib/release-notes-loader.ts` | Created | Server-only `loadReleaseNotes()` — reads `tasks/RELEASE_NOTES_*.md`, parses with `marked`, returns `{ version, title, date, html }[]` newest-first |
| `src/lib/nav-links.ts` | Modified | Added Feature Tracking entry between Pricing Manager and Settings |
| `firestore.rules` | Modified | Added `features/{id}` + `comments` subcollection rules (signed-in users) |
| `src/app/globals.css` | Modified | New `.feature-scroll` utility class |
| `package.json` | Modified | Added 9 new deps (TipTap × 6, dnd-kit × 3) plus `marked` |
| `tasks/v1.5-feature-tracking-design.md` | Created | Locked design — data model, security, UI architecture, drag, dependencies, out-of-scope |
| `tasks/v1.5-feature-tracking-status.md` | Created | Live status, stage inventory, 30 tester cases, known gotchas |
| `CLAUDE.md` | Modified | Release-state table updated, 8 new v1.5 lessons appended |
| `tasks/SESSION_HANDOVER.md` | Modified | Features collection added to Firestore Hierarchy; new v1.5 section |
| `tasks/CODEBASE_MAP.md` | Modified | New `/feature-tracking` route + Feature Tracking component sub-section |
| `.agents/evolution.md` | Modified | v1.5 session block with 11 patterns worth remembering |

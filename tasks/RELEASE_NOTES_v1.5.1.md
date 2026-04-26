# HelmLogic — Release Notes v1.5.1 (Hotfix)

> Release Date: 2026-04-25
> Branch: `claude/app-overview-wKiZ1` → main
> Hotfix release on top of v1.5.0

### Release Stats
- **1 commit** (data-loss bugfix) + docs
- **2 files changed** in code: `src/components/feature-tracking-board.tsx` (+8/−2 in the create dialog), one new release-notes markdown file
- TypeScript: 84 pre-existing errors, zero new
- `npm run build`: clean — `/feature-tracking` 139 kB unchanged

### Source of Requirements
Client report: *"every time I save one a previous one disappears. This is now happened three times. I have lost two that I've uploaded to the system."* Real data loss for a real user — promoted to a same-day hotfix.

---

## The Bug

`CreateFeatureDialog` generated its client-side Firestore doc ID once via `useState(() => doc(collection(firestore, 'features')).id)`. The dialog is mounted at the page level (always rendered, controlled by an `open` prop), so the `useState` initializer runs **once per page load**. Every submit in that session reused the same ID, so each `setDoc(features/{sameId}, ...)` **overwrote the previously saved feature at that path**.

From the client's perspective:

1. Open dialog, save feature A → stored at `features/X`.
2. Open dialog again, save feature B → stored at `features/X`, **overwriting A**.
3. Refresh page → new `useState` initializer runs, fresh id Y generated.
4. Save feature C → stored at `features/Y`. Now there are 2 docs (B + C) and the user thinks they've created 3.
5. Save feature D in the same session → stored at `features/Y`, overwriting C.

The "limit of 3" the client described matches the survival rate of features whose creation happened to be the LAST submit in a refresh cycle.

---

## The Fix

Regenerate the client-side feature ID every time the dialog opens, via a `useEffect` keyed on `open`:

```ts
const [featureId, setFeatureId] = useState(
    () => doc(collection(firestore, 'features')).id,
);
useEffect(() => {
    if (open) {
        setFeatureId(doc(collection(firestore, 'features')).id);
    }
}, [open, firestore]);
```

- First open: useState seed already gave us a fresh id; effect regenerates once (no harm — Firestore IDs are cheap, no network round-trip).
- After a successful submit: dialog closes via `onOpenChange(false)`. Form state is reset by the existing `reset()` call.
- Next open: effect runs, brand-new id is in place before the user types or uploads anything.

The image uploader still has a stable path (`features/{featureId}/...`) for the entire duration of one open ↔ close cycle, so pre-save uploads continue to work as designed.

---

## Aftermath / Recovery

The two lost features the client reported can't be recovered — `setDoc` replaced the doc atomically and there's no soft-delete. Going forward:

- Fix is live as soon as App Hosting redeploys main (~5 minutes after merge).
- Client should retry the submissions that disappeared. They will land cleanly under fresh ids.
- No data migration needed for existing features — every doc in the collection has a unique id; only the *next-write target* was buggy, and that's now fresh per dialog open.

---

## New Lesson (added to CLAUDE.md)

> **Client-side doc IDs in long-lived dialogs must regenerate per-open** (v1.5.1 hotfix) — `useState(() => doc(...).id)` runs once per component mount, and a dialog mounted at the page level has the same mount lifetime as the page. If you `setDoc({sameId}, ...)` on every submit, you overwrite. Always pair the `useState` seed with a `useEffect(() => { if (open) regenerate(); }, [open])` so each open starts with a fresh id. Caught the same day v1.5 went to prod when a client reported features disappearing after each save.

---

## Files Changed

| File | Change |
| --- | --- |
| `src/components/feature-tracking-board.tsx` | `CreateFeatureDialog` — added `useEffect` that regenerates `featureId` on `open` toggle. Also extended the doc-comment to explain the bug + fix so future-me catches the pattern when reading. |
| `CLAUDE.md` | Release-state table flips v1.5 → v1.5.1. Added a named "Known Lessons" entry (see above). |
| `tasks/v1.5-feature-tracking-status.md` | Phase line records the v1.5.1 hotfix. |
| `tasks/RELEASE_NOTES_v1.5.1.md` | This file. Picks up automatically in the in-app Release Notes tab on next deploy. |
| `.agents/evolution.md` | v1.5 session block extended with the hotfix entry. |

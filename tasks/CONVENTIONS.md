# HelmLogic — Conventions

> Cross-cutting standards every release inherits. Add an entry here when
> a v1.X learning becomes a "way of working" — story-level acceptance
> lines should reference this doc rather than re-spelling each rule.
>
> **First written:** v1.8 kickoff (collapsing the v1.7 retrospective
> lessons into a living conventions doc).

---

## UX

### Popups for confirmations + decisions-with-tradeoffs

Every destructive action, every retarget, every "this is irreversible"
moment ships as an `AlertDialog` (shadcn). No inline confirmations. No
silent auto-actions. No browser `confirm()`.

Examples in v1.7:
- Polish-review seed buttons: `AlertDialog` with explicit Yes / Cancel
- Finalize v1.7 release seed: `AlertDialog` with explicit summary

Examples coming in v1.8:
- 6.4.1: retarget-with-broken-deps → `AlertDialog` with Override-with-reason
- 1.3.1: edit-locked-quote → `AlertDialog` with Create-v2 / Cancel
- 1.2.4: send-quote → `AlertDialog` with editable subject/body before Send
- 1.8.8: import preview → `AlertDialog` with per-block conflict resolution

(Salesperson preference; reminded 3x in v1.7.)

---

## Rendering

### Image-preload pattern

Every image referenced by a customer-facing PDF MUST be pre-fetched
through `src/lib/image-preload.ts` → data URL → passed to `@react-pdf`.
Cross-origin URLs route through `src/app/api/image-proxy/route.ts`
host-allow-list. Do NOT pass raw URLs to `@react-pdf <Image>`.

(v1.7 round-9 / round-11 — `@react-pdf` iframe internal fetch is CORS-
blocked by Firebase Storage and external CDNs. The proxy bypasses.)

### Live preview pattern

The 1.8.7 live PDF preview pattern:
- 1500ms debounce on inputs
- `useMemo` on the doc tree (so the iframe only regenerates when actual
  inputs settle)
- Cover image pre-fetched as data URL (round-4 lag fix)
- Focus mode (`Maximize2` button → full-viewport overlay; ESC closes)
- Only ONE `PDFViewer` instance rendered at a time

Don't re-invent the wheel for any future preview.

### Server-side fetch for cross-origin assets

Anything cross-origin (Firebase Storage, vendor CDN, SharePoint) goes
through `/api/image-proxy` host-allow-list, never directly to the
client / `@react-pdf`. The proxy adds browser-style User-Agent +
Referer for CDNs that hot-link-protect (Yamaha CDN), and short-
circuits known-private origins (SharePoint /sites/) with a clear
error.

---

## Data

### Imports must upsert by natural key, never clear-and-replace

Every data-import surface (Yamaha MPF, Sam Allen, delivered-deals,
stock, trailer pricing, content-block import) detects a key column
from a priority list and patches existing rows / creates new ones /
leaves untouched rows alone. Clear-and-replace destroys operator edits.

Always toast `N updated · M created · K skipped (no key)`.

(v1.4 remediation lesson — see CLAUDE.md.)

---

## Process

### Cross-story dependency convention

Every cross-story reference uses one of three canonical prefixes:

| Prefix | Meaning | Example |
|---|---|---|
| `DEPENDS ON 1.8.1` | **Hard dep** — this story can't function correctly without the referenced story shipped first. Regex-matched by `scripts/validate-features.ts`. | `DEPENDS ON 1.8.1 — Quote Content Block Manager` |
| `RELATED:` | Soft reference. The other story is conceptually adjacent but this one ships independently. | `RELATED: 1.2.3 controlled personalisation extends this resolver path` |
| `See also:` | Documentation pointer. Used for navigation, not dependency. | `See also: tasks/USER_GUIDE_v1.7.0.md §Image authoring` |

**Format rules for `DEPENDS ON`:**
- Exact spelling: `DEPENDS ON ` (capitalised, single space) followed by the version number
- Version number format: `\d+\.\d+\.\d+` (e.g. `1.8.1`, `6.4.3`, `2.1.5`)
- No trailing comma, no parentheses around the number, no list ("DEPENDS ON 1.8.1, 1.2.4" is wrong — write two separate lines)
- One dep per acceptance-criteria line

**Why strict:** the `dependsOn[]` schema (story 6.4.1) and the pre-merge regex check (story 6.4.2) both rely on the canonical form. Drift breaks tooling.

(v1.6.2 audit lesson — caught 2 critical / 2 high / 3 medium / 4 low cross-release dep violations the manual way.)

### One-shot seed lifecycle

When a release includes Firestore data changes (seeding stories,
retargeting releases, marking shipped, etc.):

1. **Commit N**: build seed module (`src/lib/<release>-<purpose>-seed.ts`) + green button on Backlog (or relevant admin surface) wired to it
2. **User clicks the button** — toast confirms the work
3. **Commit N+1** (same dev cycle): remove module + button + any
   newly-imported icons / shadcn components that became unused

Don't keep planning seeds alive across cycles. Don't try to update a
single button's behaviour across multiple seed runs — write a new seed
module + new button each time.

(v1.6.2 process learning. Followed in v1.7 finalize, v1.8 planning.)

### `🚨 DEPLOY RULES` banner

Every commit that modifies `firestore.rules` MUST be announced to the
operator with a "🚨 DEPLOY RULES" message including the full updated
rules file to paste into Firebase Console. Firebase App Hosting does
NOT auto-deploy storage / firestore rules — manual paste required.

Skipped twice in v1.7 → operator got "Missing or insufficient
permissions" runtime errors → operator angry. Don't.

### Diagnostic-first when bugs are unclear

For "X visible in editor, missing in render"-class bugs (or any
"works in one context, fails in another" pattern): ship the visible
diagnostic surface BEFORE the speculative fix.

A diagnostic that shows the operator (and the engineer) what's
actually happening to each piece of data saves rounds of wrong-tree-
chasing. v1.7 spent rounds 5–9 on wrong root-cause theories (no
width / SVG detection / text-wrap / HTML-entity decode / CORS-side
preload) before round-10's diagnostic panel revealed the actual issue
(server-side proxy needed). 5+ rounds wasted; round-10's diagnostic
should have been round-5.

### Living stories

When new acceptance criteria are discovered mid-build, the story's
`acceptanceCriteria[]` array gets the new line **in the same commit
as the code change**. Not at end-of-cycle in a polish-review seed.

The polish-review seed pattern (v1.7) is acceptable AS A FALLBACK
when stories have already drifted, but the goal is for stories to
already-be-current at end-of-cycle so the finalize seed only marks
shipped.

### Don't expand release scope mid-cycle

- First round of bug-fix feedback after build-complete: ship in
  current release.
- Second round of "would be nice" feedback: defer to vX.Y.Z+1 unless
  trivial.
- Third round: hard line — open a new status doc for the next
  release.

The CLAUDE.md "Demand Elegance (Balanced)" rule covers the spirit.
Be willing to push back at round 3.

(v1.7 retrospective: 20-pt-planned shipped ~30 pts because we kept
saying "yes" to round-2 / round-3 / round-N feedback.)

---

## Release process

### Release notes are part of the release

`tasks/RELEASE_NOTES_vX.Y.Z.md` MUST be on the dev branch BEFORE the
dev → main PR opens. The in-app `/feature-tracking` Release Notes
tab is build-baked from these markdown files via
`src/lib/release-notes-loader.ts`.

A release that merges to main without its release notes file ships
prod with the in-app timeline missing that version. There's no runtime
fallback because the markdown lives in the deployed bundle, not
Firestore.

(v1.5 incident: PR #26 merged without `RELEASE_NOTES_v1.5.0.md`,
prod went out blank for v1.5, follow-up docs PR required.)

### Pair RELEASE_NOTES + USER_GUIDE every release

v1.7 onward: every minor release + every user-UX patch ships a paired
`tasks/RELEASE_NOTES_vX.Y.Z.md` AND `tasks/USER_GUIDE_vX.Y.Z.md`. Both
rendered in-app via the loader. The loader auto-pairs them by version
string (no code change needed when a new release lands — just drop
the file).

The user guide answers "I'm an operator — what do I do with this
release?" The release notes answer "what was built since last release?"
Different audiences, both required for user-UX patches.

---

## Editor

### TipTap is the rich-text engine

All rich-text authoring (content blocks, salesperson messages, future
email templates) uses the v1.7 TipTap stack:
- `@tiptap/react` + `@tiptap/starter-kit`
- `@tiptap/extension-placeholder`
- `@tiptap/extension-link`
- `@tiptap/extension-image` (extended with `ResizableImage` for
  width/align/wrap support)

Don't introduce a second editor. Reuse `<FeatureRichTextEditor>` with
the appropriate `imageStoragePathPrefix` per surface.

### JPG / PNG only for inline images

`@react-pdf <Image>` supports JPEG and PNG only. SVG / WebP / GIF
silently fail to render on the customer PDF.

`<FeatureRichTextEditor>` enforces this at upload via
`accept="image/jpeg,image/jpg,image/png"` + `file.type` validation.
`tiptap-pdf.tsx` shows an amber placeholder for legacy unsupported
images on the customer PDF.

(v1.7 round-6 lesson.)

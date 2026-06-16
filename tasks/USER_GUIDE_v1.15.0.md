# HelmLogic — User Guide v1.15.0

**For:** Org admins · catalogue admins · ops triage
**Companion to:** `RELEASE_NOTES_v1.15.0.md`

v1.15 is the middle slice of the joint v1.12 → v1.16 push. It ships entirely in the same merge as v1.12 (Service Quote detail + PDF), v1.13 (Send email + Trailers Table + inline editing), v1.14 (Catalogue polish), and v1.16 (the big v1.16 sweep).

---

## At a glance

| What you want to do | Where | Section |
|---|---|---|
| See who approved / rejected a user suggestion + when | `features/{id}/auditLog` in Firestore (or wait for v1.17 in-app audit panel) | §1 |
| Write a marketing tagline + description for a boat model | Catalog Manager → Boat Brand → click a row → Marketing Copy panel | §2 |
| Author fit-up tier rules (e.g. "Patrol ≥250 HP → Complex") | Manage → Fit-Up Catalog → Rules tab | §3 |

---

## 1. Suggestion audit — what changed

If you've used the Suggestion Approval Queue at `/suggestions` since v1.11, the workflow looks identical:

- List of every user-submitted feature with `status: 'submitted'`
- **Approve** button → moves to `under-review` (visible on the public Roadmap)
- **Reject** button → soft-deletes (hides from board but doesn't lose the data)

What v1.15 adds is a **per-feature audit log** entry on every approve / reject. The log captures **who** (uid + display name) and **when** (server timestamp) for every state transition.

### Where to see it (today)

The audit lives at `features/{featureId}/auditLog` in Firestore. There's no in-app panel for it yet — the v1.17 release will add a Suggestion Audit drawer to the queue UI so triage decisions are visible to the whole admin team.

### Why it matters

If a salesperson submits a feature request and it gets rejected, you can trace the decision back to a named admin + timestamp. Useful when revisiting old requests ("we said no in March; let's revisit").

---

## 2. Marketing Copy editor — boats

### How to use it

1. Open **Catalog Manager** (sidebar — note the URL is still `/pricing-manager`).
2. Pick a **Boat Brand** vendor row.
3. Find the model you want to author copy for and click anywhere on its row to expand it.
4. Below the variants list, you'll see a dashed-border **Marketing Copy** panel with two fields:
   - **Tagline** — short headline (one line, 120 char max). Shown on the proposal PDF cover (v1.16+).
   - **Description** — multi-line body copy. Shown under the tagline on the cover.
5. Type your edits. An **"unsaved"** amber badge appears in the top-right of the panel the moment you start typing.
6. Click **Save** to persist. **Discard** reverts to the last-saved values.

### Save behaviour

This panel uses **draft + Save** (not save-on-blur) — the Description is multi-line free text so an every-keystroke autosave would hammer Firestore. The dirty indicator is your reminder to save before clicking away.

### Where the copy lands

Today (v1.15) the copy is **captured + editable but not yet rendered on the PDF cover**. The cover render wiring lands in v1.16. The data is captured ahead of time so you can author + edit copy without waiting for the PDF surface.

(v1.16 also ships a **rich-text** editor — click the small **Rich editor** button next to the Description label to open a TipTap popover with formatting, lists, links, and inline images.)

---

## 3. Fit-up tier classification rules

### What changed

v1.11 shipped a built-in **motor-HP heuristic** that auto-suggests a fit-up tier from the engine size: under 50 HP → Simple, 50-150 → Medium, over 150 → Complex.

v1.15 adds an **operator-authored rule engine** that runs **before** the heuristic. Author rules that fit your dealership's reality (different cut-offs for Patrol vs Classic, anything Highfield ≥250 HP is automatically Complex, etc.) and the heuristic only kicks in when nothing else matches.

### Resolution chain (most-specific wins)

1. Catalog-level explicit `boatComplexity` set on the boat — wins over everything (operator override)
2. Active classification rule (v1.15) with conditions all matching the quote context
3. Motor-HP heuristic (v1.11 fallback)

### Author a rule

1. Open **Manage → Fit-Up Catalog**.
2. Click the new **Rules** tab (next to Items + Packages).
3. Click **Add rule**. A new card appears with one default condition (`Motor HP ≥ 150 → Complex`).
4. Edit the rule:
   - **Name** — e.g. "Patrol ≥250 HP → Complex"
   - **Priority** — higher wins ties (default 0)
   - **Output** — Simple / Medium / Complex pill
   - **Active / Inactive** — toggle without delete
   - **Conditions** — AND-combined. Pick a field, operator, value.
5. Click **Save** when the unsaved-changes ring appears.

### Field types

| Field | Type | Notes |
|---|---|---|
| Motor HP | number | The motor's HP rating (sum if multi-engine) |
| Boat length (m) | number | Hull length in metres |
| Boat range | string | e.g. "Patrol", "Sport", "Classic" |
| Model code | string | e.g. "CL380", "SP600" |
| Vendor | string | The boat-brand vendor id |

### Operators

- **Numeric:** `>=` · `>` · `<=` · `<` · `==` · `!=`
- **String:** `==` · `!=` · `contains` · `startsWith` (all case-insensitive)

### What happens at quote time

When a salesperson lands on Step 5 (Dealer Fit + Fit-Up), the Suggested tier pill at the top of the picker reflects whatever your rules say. Rule resolution is live — flip a rule from active → inactive while a quote is in flight and the next render will pick up the change.

---

## What this release did NOT ship (deferred to v1.16 or v1.17)

- **In-app suggestion audit panel** — v1.17. Today the audit is queryable from Firestore only.
- **Marketing copy → PDF cover render** — v1.16 ships the wiring (cover read from `model.marketingTagline` + `model.marketingDescription`).
- **Marketing copy rich-text editor** — v1.16 ships it in the same panel (Story 3.8.4).

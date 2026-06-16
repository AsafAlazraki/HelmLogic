# HelmLogic — Release Notes v1.15.0

**Date:** 2026-06-15
**Branch:** `claude/v1.12-v1.13-push` (joint v1.12 → v1.16 push)
**Theme:** Suggestion audit · Marketing copy · Full fit-up rule engine

v1.15 closes out three middle-priority stories that were waiting on the higher-priority Service Quoting (v1.12 + v1.13) and Catalogue polish (v1.14) work to land. It ships entirely in the same merge as v1.12 + v1.13 + v1.14 + v1.16.

---

## Release Stats

| Metric | Value |
|---|---|
| Stories shipped | 3 (3.3.1 · 3.4.2 · 9.3.1) |
| Stories deferred | 0 |
| New components | 2 (`fit-up-classification-rules-manager.tsx` + `MarketingCopyPanel` inside `boats-table-view.tsx`) |
| New libraries | 1 (`fit-up-classification.ts`) |
| New Firestore collections | 1 (`organisations/{orgId}/fitUpClassificationRules`) |
| New firestore.rules paths | 1 (`fitUpClassificationRules`) |
| New audit-log event types | 2 (`suggestion-approved` · `suggestion-rejected` on `features/{id}/auditLog`) |

---

## Story 3.3.1 — Crowdsourced Suggestions with Audit

### What was already there

- **v1.5** — Public Feature Tracking surface (`/feature-tracking`) with a Submit form that writes to `features/{id}` with `status: 'submitted'`.
- **v1.11** — Suggestion Approval Queue at `/suggestions` (Story 3.5.1) that lists every submitted feature for HelmLogic Admin triage. Approve → `status: 'under-review'`. Reject → `deletedAt` soft-delete.

### What v1.15 adds

The approve/reject lifecycle now writes an audit-log entry. Per-feature audit lives at:

```
features/{featureId}/auditLog/{eventId}
{
  eventType: 'suggestion-approved' | 'suggestion-rejected'
  at: Timestamp
  byUid: string
  byName: string
  metadata: { fromStatus, toStatus, title }
}
```

Fire-and-forget — a failed audit write never rolls back the underlying state change. Same pattern as the v1.8 per-quote audit log.

Completes the "with Audit" half of the story name. The submission → triage → outcome chain is now fully traceable.

---

## Story 3.4.2 — Marketing Copy Editor UI

### New surface

When you expand any model row on the Boats Catalogue table view (Catalog Manager → Boat Brand vendor → click a row), a new **Marketing Copy** panel appears under the variants list. It exposes:

- **Tagline** — short headline (single line, 120 char cap). Persisted to `model.marketingTagline`.
- **Description** — multi-line free text. Persisted to `model.marketingDescription`. Save-on-Save pattern (not save-on-blur) because multi-line free-text + every-keystroke Firestore writes don't play well.

Both fields render with a **draft + dirty + Save/Discard** flow — an "unsaved" amber badge appears alongside the Save button the moment you start typing.

### What it feeds

The PDF cover wiring lands as a v1.16 follow-up — for v1.15 the schema is captured + editable so operators can author copy now, ready for the cover surface.

(v1.16 also ships a rich-text TipTap editor for the Description via the "Rich editor" button — see `RELEASE_NOTES_v1.16.0.md` Story 3.8.4.)

---

## Story 9.3.1 — Rule-based fit-up tier auto-classification (full engine)

### What was there

v1.11 shipped a **simplified take** on Story 9.3.1: a motor-HP heuristic where motors ≥150 HP suggest Complex, 50–150 suggest Medium, and <50 suggest Simple. The full operator-authored rule engine was held at v2.2 until v1.15.

### What v1.15 ships

A complete classification rule engine.

**Schema** — new collection `organisations/{orgId}/fitUpClassificationRules`:

```typescript
ClassificationRule {
  name: string                    // human label e.g. "Patrol ≥250 HP → Complex"
  priority: number                // higher wins ties; default 0
  isActive: boolean               // off-switch without delete
  conditions: Condition[]         // ALL must match (AND semantics)
  outputTier: 'simple' | 'medium' | 'complex'
}

Condition {
  field: 'motorHp' | 'boatLengthM' | 'boatRange' | 'modelCode' | 'vendorId'
  operator:
    // for numeric fields:  '>=' | '>' | '<=' | '<' | '==' | '!='
    // for string fields:   '==' | '!=' | 'contains' | 'startsWith'
  value: number | string
}
```

**Resolver** — `src/lib/fit-up-classification.ts` exports `resolveClassification(rules, ctx)`:

1. Filter to active rules
2. Sort by `priority` desc, then `conditions.length` desc (most-specific wins tiebreak)
3. Return the first rule whose conditions all match the QuoteContext
4. If nothing matches, fall back to the v1.11 motor-HP heuristic

**Resolution chain** in `FitUpQuoteSelector`:

1. Catalog-level explicit `boatComplexity` (boat-level override, non-`auto`)
2. Operator-authored classification rules (this story)
3. v1.11 motor-HP heuristic (fallback)

Orgs with no rules see zero regression. Orgs that author rules get explicit deterministic control.

**Admin UI** — new tab on `Manage → Fit-Up Catalog → Rules` (parallel to the existing Items + Packages tabs). Per-rule editor with:

- Name input
- Priority numeric input
- Output tier dropdown (Simple / Medium / Complex pill)
- Active toggle
- Conditions list — add / remove / edit, field-aware operators, type-aware value input
- Save / dirty indicator per rule
- Trash to delete

---

## Required after merge

- **Redeploy `firestore.rules`** to prod. New path needed in published rules:
  ```
  match /organisations/{orgId}/fitUpClassificationRules/{ruleId} {
    allow read, write: if isSignedIn();
  }
  ```

The local `firestore.rules` file has this added; paste-publish from there to Firebase Console.

---

## Files Changed

**New:**
- `src/lib/fit-up-classification.ts`
- `src/components/fit-up-classification-rules-manager.tsx`
- `tasks/RELEASE_NOTES_v1.15.0.md`
- `tasks/USER_GUIDE_v1.15.0.md`

**Modified:**
- `src/components/suggestion-approval-queue.tsx` — audit log writes
- `src/components/fit-up-catalog-manager.tsx` — new Rules sub-tab
- `src/components/fit-up-quote-selector.tsx` — subscribe to rules + resolver
- `src/components/boats-table-view.tsx` — MarketingCopyPanel on expanded row
- `firestore.rules` — `fitUpClassificationRules` allow read/write rule

---

## What's NOT in v1.15

Nothing deferred — the three stories are complete. Marketing copy → PDF cover wiring lands in v1.16 (Story 3.8.4 ships the rich-text editor; the cover render comes after the rest of the v1.16 polish).

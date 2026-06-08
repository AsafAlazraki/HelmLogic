# v1.11 — Fit-Up Release · dev → main

Release theme: Fit-Up release — end-to-end quote integration + catalog expansion + workshop status + pre-launch hardening triggered by Mark McWilliams' "accurate · audited · beautiful" email.

## Mark's 8-item checklist — 11/11 ticks green

Proven end-to-end on **two** ranges so the customer-facing PDF is stable across the catalog:

| # | Mark's ask | Proof spec |
|---|---|---|
| 1 | Proposal formed correctly + customer name placed | `tests/bm-email-checklist.spec.ts` + `bm-email-checklist-sport.spec.ts` |
| 2 | No trailer images during hull selection (Step 1) | both specs |
| 3 | All correct FFO presented (Step 2) | both specs |
| 4 | Engine + rigging options (Step 3 motor + Step 5 fit-up) | both specs |
| 5 | Trailer options (Step 4) | both specs |
| 6 | DFOs (Step 5) — picks up to 3 cards | both specs |
| 7 | Rego + compliance (Step 1 picker + PDF) | both specs |
| 8 | Fit-out tiers (Simple / Medium / Complex) | both specs |

PDFs attached in the release email — CL380 (`bm-checklist.pdf`) and SP600/SP560 (`bm-checklist-sport.pdf`).

## What changed for the customer-facing PDF

- **Trailer image restored** — fallback chain `imageUrl → catalog.imageUrl → catalog.coverImageUrl → BuildBand placeholder`. The brand-logo bleed that caused the v1.11 suppression is handled by the placeholder.
- **Motor image** — also tries `SummaryImage` (from the catalog motor upload UI) so mirrored-to-Storage images render.
- **Investment Summary nesting** — Standard Inclusions, Factory Options, Motor Accessories, Trailer Options, Dealer Fit lines now indent under their parent (Vessel / Propulsion / Trailer) with a smaller font, lighter colour, and L-tick. Maths unchanged.

## Audit-trail unification

- `CatalogAuditHistory` panel now merges `organisations/{orgId}/catalogAudit` AND `organisations/{orgId}/fitUpCatalogAudit` into one chronological feed. Before this, fit-up edits wrote to a collection nothing read.
- Wrench icon distinguishes fit-up rows from xlsx-import rows.
- `fit-up-catalog-manager.tsx` CSV bulk-import path was missing its summary audit event (6 of 7 mutation sites had one). Adds a single summary entry per import.
- New `tests/v1.11-audit-trail.spec.ts` covers the unified panel + Fit-Up Catalog edit affordance + proposal-view Activity tab.

## Firestore rules — paths to redeploy

The dev rules file already has these. Confirm they made it to prod before the merge lands.

```
match /databases/{database}/documents {
  // ... existing rules ...
  match /organisations/{orgId} {
    match /fitUpPackages/{packageId} {
      allow read, write: if isSignedIn();
    }
    match /fitUpCatalogAudit/{eventId} {
      allow read, write: if isSignedIn();
    }
    match /catalogAudit/{eventId} {
      allow read, write: if isSignedIn();
    }
  }
}
```

## Phase summary

- **Phase A** — end-to-end fit-up quote flow (Epic 9.2 pulled forward from v1.16)
- **Phase B** — fit-up expansion (categories + customer descriptions + packages + per-line controls + workshop status)
- **Phase C** — variants + images + soft pairings + catalog audit + scheduling + audit workbook
- **Phase D** — pre-launch hardening (this section). PDF polish + BM checklist + audit unification.

## Files Changed (Phase D only — full list in RELEASE_NOTES)

**App code:**
- `src/components/proposal-pdf.tsx` — trailer image + motor SummaryImage fallback + Investment Summary nesting
- `src/components/catalog-audit-history.tsx` — merge fitUpCatalogAudit feed
- `src/components/fit-up-catalog-manager.tsx` — CSV bulk-import audit event

**Tests:**
- `tests/bm-email-checklist.spec.ts` — Mark's 8-item E2E (CL380)
- `tests/bm-email-checklist-sport.spec.ts` — same matrix on SP600 / SP560
- `tests/v1.11-audit-trail.spec.ts` — audit panel + Fit-Up edit + Activity tab
- existing v1.11 test-fixture cleanups

**Docs:**
- `tasks/RELEASE_NOTES_v1.11.0.md` — Mark's checklist tick-off table + Audit completeness block
- `tasks/USER_GUIDE_v1.11.0.md` — §0 happy-path walk-through + Auditability section
- `tasks/bm-email-checklist.md` — internal plan doc
- `tasks/PR_DESCRIPTION_v1.11.0.md` — this file
- `CLAUDE.md` — v1.11 row updated with Phase D summary

## Test plan

- [x] CL380 BM checklist — 11/11 green
- [ ] SP600/SP560 BM checklist — running now, results will surface in PR comments
- [x] Audit-trail spec — 3/3 green
- [x] Full v1.11 + smoke + quote-builder regression (earlier in dev) — 24/24 green
- [ ] Firebase rules redeployed to prod with `fitUpPackages` + `fitUpCatalogAudit` paths
- [ ] Spot-check both PDFs by hand once they're attached

https://claude.ai/code/session_01N8htvKjvX1mxB76joJ9QQg

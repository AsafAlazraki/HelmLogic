# v1.19 — Pricing discipline + variations foundation

**Date**: 2026-06-23
**Branch**: `claude/app-overview-wKiZ1` → `main`
**Theme**: Tighten the pricing layer. Make low-margin quotes visible to a GM before they go out. Bring fit-out pricing under per-model control. Lay the schema + rules foundation for post-contract quote variations.

## Release Stats

- **3 stories code-shipped, 1 schema-only foundation** (Phase A pricing + variations groundwork).
- **1 retarget**: 8.2.1 Reporting & Analytics Dashboard slipped v1.19 → v1.20 (different problem area, dilutes the pricing focus).
- **3 NSM-Hub stories** still service-account-blocked, carries to v1.20.
- **34/34 ticks** across `tests/v1.19-everything.spec.ts`.

## Phase A — Pricing discipline

### 2.2.1 Margin Threshold Enforcement + GM Override
- New `src/lib/catalog/margin-gate.ts`. `evaluateMarginGate({ marginPct, marginThresholdPct, hasOverridePermission })` returns `{ status: 'pass' | 'warn' | 'fail', requiresOverride, canProceed }`. Default threshold 15%, configurable per org via `organisation.marginThresholdPct`. Warn band is 5pts above threshold.
- Wired into `finalize-quote-dialog.tsx::handleFinalize`. Below-threshold quotes route through a new margin-override dialog (`data-testid='margin-override-dialog'`). Operators with `can_override_margin` permission get the dialog with a required reason field (min 6 chars). Operators without the permission see a destructive toast and finalize blocks.
- Audit-event payload (`MarginOverrideAuditEvent`) defined for the v1.20 reporting story to consume.

### 2.1.2 Model-Specific Fit-Out Pricing (Basic / Moderate / Complex)
- New `src/lib/catalog/fit-out-pricing.ts`. `FitOutTier`, `FitOutPricingMap`, `resolveFitOutPrice(model, tier)`, `hasFitOutPricing(model)`.
- Each boat model can declare optional 3-tier package prices (`model.fitOutPricing.basic / .moderate / .complex`, ex GST). When set, the resolver returns the explicit number; when not set, returns null and the caller falls back to summed-item behaviour (v1.18 default).
- Admin UI on HighfieldModelEditor: three Input[type=number] fields wired under the existing Fit-Up Complexity card with a separator + 'Package pricing (ex GST)' label. Empty input writes null.
- Quote-flow consumption ships separately in v1.20 — this cycle is schema + admin surface only.

### 2.3.1 Quote Variations (foundation only)
- New `src/lib/catalog/quote-variation.ts`. Full schema definitions: `QuoteVariation` interface with status machine (`draft → sent → accepted | rejected | draft`, with `accepted` + `rejected` terminal), line shape (`add | remove | priceAdjust`), audit fields, public-accept token, customer signature fields from 2.6.3.
- Helpers: `computeVariationTotal(lines)`, `canTransitionVariationStatus(from, to)`, `newAcceptToken()`.
- **New Firestore path**: `users/{uid}/quotes/{qid}/variations/{vid}`. `firestore.rules` updated. `tests/firestore-rules-deployed.spec.ts` extended with a `USER_QUOTE_SUBPATHS` probe so any rules-deploy slip surfaces in dev before customers do.
- Variation editor UI + customer accept page + variation PDF render slip to v1.20 to keep this cycle focused. Schema + rules + helpers ship now so v1.20 layers UI cheaply.

### 2.6.3 Customer Agreement on Variation (schema only)
- Customer signature fields baked into the `QuoteVariation` schema in 2.3.1 (`acceptedAt`, `acceptedByName`, `acceptedSignatureDataUrl`, `acceptedIp`, `acceptedUserAgent`).
- Public-accept page + signature pad UI lands v1.20.

## Held / Deferred

- **8.2.1 Reporting & Analytics Dashboard** retargeted v1.19 → v1.20. Different problem area; the pricing-discipline focus stays cleaner without it.
- **2.3.1 / 2.6.3 UI surfaces** slip to v1.20 (foundation ships now, UI on top).
- **11.3.1 + 11.3.2 + 11.3.3** NSM-Hub trio carries to v1.20. Still service-account-blocked.

## What's NOT in v1.19

- Customer pipeline + My Customers / My Quotes (Epic 8.1, v1.21+).
- Mobile-responsive polish (v2.2).
- Live Shopify integration (research-only v1.18; v1.21+ kickoff target).
- Reporting & Analytics Dashboard (8.2.1 retargeted to v1.20).
- Variation editor + customer accept page (v1.20).
- Receipt PDF rendering (lib lands v1.18, deposit receipt UI v1.20).
- Contract Signing Pack Generation (v1.20).
- Boat hull pricing migration to derive-pricing (broader sweep v1.20+).

## Files Changed

### New
- `src/lib/catalog/margin-gate.ts`
- `src/lib/catalog/fit-out-pricing.ts`
- `src/lib/catalog/quote-variation.ts`
- `tasks/v1.19-plan.md`
- `tasks/RELEASE_NOTES_v1.19.0.md`
- `tasks/USER_GUIDE_v1.19.0.md`
- `tests/v1.19-everything.spec.ts`
- `scripts/ship-v119-features.py`

### Updated
- `src/components/finalize-quote-dialog.tsx` (2.2.1 gate wiring + override dialog)
- `src/components/highfield-model-editor.tsx` (2.1.2 schema + admin fields)
- `firestore.rules` (variations subcollection)
- `tests/firestore-rules-deployed.spec.ts` (variations regression probe)
- `src/lib/release-schedule.ts` (v1.19 flag flip)

## Required after merge

- **Publish firestore.rules to prod** (new `variations` rule). Re-run `tests/firestore-rules-deployed.spec.ts` against prod to confirm the path lists green. Same lesson as the v1.15 fitUpClassificationRules deploy slip — don't skip the rules publish.
- Run `scripts/ship-v119-features.py` to flip Phase A stories to `status: shipped` + retarget 8.2.1 to v1.20.
- Flip `RELEASE_WINDOWS['v1.19'].shipped = true` (already in the release-schedule.ts commit).
- `FORWARD_RUNWAY_START` bump 19 → 20.

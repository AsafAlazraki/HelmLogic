# v1.18 — Catalog polish + first customer-facing surface + Shopify spike

**Date**: 2026-06-23
**Branch**: `claude/app-overview-wKiZ1` → `main`
**Theme**: Round out catalog editing with the polish items that make the v1.17 toolkit feel finished. Land the first customer-facing surface (boat-quote send via email, stale-flipped from v1.8). Half-day Shopify research deliverable.

## Release Stats

- **6 Phase A stories shipped** (catalog polish + 1.4.2 stale-flip).
- **1 Phase C spike** (Shopify exploration, doc + code stubs, no production paths).
- **3 NSM-Hub stories** carry to v1.19, still service-account-blocked.
- **2 retargets** out of the original v1.18 slate (1.3.2 → v1.20, 2.3.1 → v1.19, both too big for this cycle).
- **50/50 ticks** across `tests/v1.18-everything.spec.ts`.

## Phase A — Catalog polish

### 3.10.4 Saved filter views per user
Pin a cross-tab catalog search query and recall it with one click. Saved pins live as an array field on the user profile doc (`users/{uid}.savedCatalogFilters`), no new Firestore collection so no rules redeploy needed. Chip row above the search input with a `Save "<query>"` button when the search has a value. Per-user, not per-org.

### 2.1.1 Structured Price Sources
Canonical `resolvePriceLevel(item, level)` exported from `src/lib/catalog/derive-pricing.ts`. Motors + finalize payload migrated. `highfield-quote-flow.tsx::getPriceForLevel` and `finalize-quote-dialog.tsx::resolvePrice` are now one-line delegates so every read site lands on the same fallback chain (`PRICE_FALLBACK_FIELDS`: sellPriceExclGst → Act Sell → Sell Price → Store Price → NSM Retail → PARTS → RRP → Price → Retail → Trade). Boats / fit-up / service-quote stay on their own patterns this cycle.

### Edit Stock Item
Inline edit on the StockList rows. Click Stock Number, Location, or Label to edit, blur to save (via new `patchStockItem` helper writing straight to `inventory/{id}`). `readOnly` mode unchanged. Status column still renders as a Badge for now. Foundation for v1.21 Pending Units.

### Export Data — brand → range → model
New `Export hierarchy` button on Catalog Manager. Walks every subscribed Boat Brand vendor's ranges + models and produces one flat CSV: Brand, Range, Model Code, Model Name, Length, Beam, Tube, Max HP, Min HP, Capacity, Cost, Sell, Margin, Has Cover, Updated. Filename `catalog-hierarchy-YYYY-MM-DD.csv`. Companion to v1.14's per-tab CSV exports.

### Receipt PDF branding
New `src/lib/pdf-branding.ts` with `PdfBrandingTokens` + `DEFAULT_PDF_BRANDING` (byte-identical to the pre-v1.18 constants in `proposal-pdf.tsx`) + `resolveBranding(organisation)` that merges per-org overrides on `organisation.pdfBranding`. `proposal-pdf.tsx` migrated to read every palette constant from the shared lib. Foundation for v1.20 deposit-receipt PDF and v1.19 org-level branding overrides.

### 1.4.2 Send Quote Action (stale-flip)
Boat-side Send Quote dialog + button + pipeline was already shipped in v1.8 (story 1.2.4.c). v1.18 flips the planning status and adds a regression test pinning every wiring point: `renderQuotePdf` step, `sendQuoteEmail` pipeline, `sentEmails` audit, `lockedAt` auto-lock on first send, `NEXT_PUBLIC_EMAIL_SEND_ENABLED` gating. Gated send remains the default; flip the flag once stakeholder sign-off on sender domain + SendGrid lands.

## Phase C — Shopify spike

Research deliverable, no production code shipped.

- `tasks/shopify-exploration-notes.md` covers auth options (custom-app vs OAuth, recommend custom-app for first cut), GraphQL Admin API surface, three integration directions (catalog push HL → Shopify, stock pull Shopify → HL, order intake Shopify → HL), risk + open questions, and a proposed v1.21+ five-story slate (10.1.1 auth setup, 10.1.2 catalog push, 10.1.3 stock pull, 10.1.4 order intake, 10.1.5 health dashboard).
- `src/lib/shopify/types.ts`, `client.ts`, `sync-direction.ts` — code stubs ready for a real dev-store key. Not wired into any production path.
- Spike is timeboxed and parked. Conversation with operators on the open questions (Shopify SKU naming vs HL stock numbers, currency model, location mapping, customer dedup, order scope) gates v1.21 kickoff.

## Held / Deferred

- **11.3.1 + 11.3.2 + 11.3.3** NSM-Hub trio carries from v1.17 → v1.19. Still service-account-blocked. Conditional ship if Mark unblocks during v1.19.
- **1.3.2 Contract Signing Pack Generation** retargeted v1.18 → v1.20 (needs the v1.18 PDF branding lib + the v1.20 deposit-receipt PDF before contract pack can layer on top).
- **2.3.1 Quote Variations (post-contract)** retargeted v1.18 → v1.19 (needs the v1.18 `derive-pricing` 2.1.1 work to lock in first).

## What's NOT in v1.18

- Customer pipeline + My Customers / My Quotes (Epic 8.1, v1.21+).
- Margin threshold enforcement (Epic 2.2.1, v1.19).
- Mobile-responsive polish (v2.2).
- NSM-Hub migration tooling (still blocked, v1.19 conditional).
- Live Shopify integration (research-only this cycle, v1.21+ kickoff target).

## Files Changed

### New
- `src/components/saved-filters-bar.tsx`
- `src/components/catalog-hierarchy-export.tsx`
- `src/lib/pdf-branding.ts`
- `src/lib/shopify/types.ts`
- `src/lib/shopify/client.ts`
- `src/lib/shopify/sync-direction.ts`
- `tasks/v1.18-plan.md`
- `tasks/shopify-exploration-notes.md`
- `tasks/RELEASE_NOTES_v1.18.0.md`
- `tasks/USER_GUIDE_v1.18.0.md`
- `tests/v1.18-everything.spec.ts`
- `scripts/ship-v118-features.py`

### Updated
- `src/lib/catalog/derive-pricing.ts` (2.1.1 resolvePriceLevel + PRICE_FALLBACK_FIELDS)
- `src/components/highfield-quote-flow.tsx` (2.1.1 delegate)
- `src/components/finalize-quote-dialog.tsx` (2.1.1 delegate)
- `src/components/stock-list.tsx` (Edit Stock Item inline-edit wiring)
- `src/components/proposal-pdf.tsx` (palette via DEFAULT_PDF_BRANDING)
- `src/app/(app)/pricing-manager/page.tsx` (SavedFiltersBar + CatalogHierarchyExport mounts)
- `src/lib/release-schedule.ts` (v1.18 flag flip)

## Required after merge

- Run `scripts/ship-v118-features.py` (lands separately) to flip the 6 Phase A stories to `status: shipped` + 1 stale-flip (1.4.2) + retarget 1.3.2 to v1.20 + 2.3.1 to v1.19 in Firestore.
- Flip `RELEASE_WINDOWS['v1.18'].shipped = true` (already in the release-schedule.ts commit).
- `FORWARD_RUNWAY_START` bump 18 → 19.
- No new Firestore paths in v1.18, so the `tests/firestore-rules-deployed.spec.ts` regression test continues to be the gate (and stays green).

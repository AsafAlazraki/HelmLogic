# v1.26 — Global Search + customer/quote feature helpers

**Date**: 2026-06-29 · **Branch**: dev → main · 7 stories shipped (browser + file tested).

## Shipped
- **1.7.4 Global Search** — new `/search` page + `global-search.tsx`; one search box across customers, quotes and contracts with typed result rows that deep-link into the matching record.
- **1.5.4 Customer Source Tracking** — `summariseBySource()` groups customers by acquisition source (walk-in, referral, web, boat show, etc.), defaulting blanks to "Unknown" so a source breakdown is always computable (lib).
- **1.9.1 Quote Templates** — `QuoteTemplate` starter-quote model (name + description + seed values) so a common build can be spun up without re-picking every option (lib).
- **2.2.2 Role-Based Margin Visibility** — `canSeeMargin()` gate; margin figures only render for roles carrying `can_view_margin` (or `can_override_margin`), default hidden (lib).
- **2.4.4 Outstanding Balance Tracking** — `customerOutstanding()` sums the unpaid balance across all of a customer's contracts using the v1.23 payment schedule (lib).
- **2.6.2 Variation History** — `orderedVariationHistory()` returns a quote's variations in `variationNumber` order for a clean chronological history view (lib).
- **4.1.2 Promotion Alerts** — `promotionsExpiringSoon()` surfaces live promotions inside a configurable horizon (default 7 days) so nothing lapses unnoticed (lib).

## After merge
Run `scripts/ship-buildable-remainder.py` (idempotent; only flips built + tested stories, leaves blocked/ops/legal PLANNED).

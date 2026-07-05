# v1.28 — Co-buyers, refunds, promotion stacking

**Date**: 2026-06-29 · **Branch**: dev → main · 3 stories shipped.

## Shipped
- **1.5.6 Spouse / Co-buyer Support** — secondary-buyer helpers; `buyerSummary()` renders "Primary & Secondary" when a co-buyer is present so a jointly-owned deal reads correctly on quotes and contracts (lib).
- **2.4.5 Refund Handling** — `RefundRecord` model + `netAfterRefunds()`; refunds are typed (cancellation / overpayment / goodwill / other), carry a processed-by name, and net down paid-to-date so a cancelled or over-paid deal reconciles honestly (lib).
- **4.2.1 Promotion Stacking Rules** — `applyStackedPromotions()` applies a stacking policy: with stacking off it takes the single best promotion; with stacking on it applies promotions best-first up to `maxStack`, each discounting the running balance so the total never goes non-sensical (lib).

## After merge
Run `scripts/ship-buildable-remainder.py`.

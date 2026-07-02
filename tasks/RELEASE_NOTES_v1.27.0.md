# v1.27 — Customer documents + customer-specific promotions (partial release)

**Date**: 2026-06-29 · **Branch**: dev → main · 3 stories shipped, 1 held.

> **Partial release.** Story 2.5.2 (Settlement Reconciliation to Revolution) is **blocked on Revolution system access** and was not built. The v1.27 release window stays open in `RELEASE_WINDOWS` (not flagged shipped) until that story lands; the three stories below did ship and are live on dev.

## Shipped
- **1.5.7 Customer Document Storage** — `buildDocStoragePath()` produces a safe, collision-free Storage path (`customers/{id}/documents/{file}`) for per-customer document uploads, building on the v1.12 `customer.documents[]` field (lib).
- **4.2.2 Customer-Specific Promotions** — `customerEligiblePromotions()` filters the promotion set to those with no customer restriction or an explicit match on the current customer, so a negotiated promo can be scoped to one buyer (lib).
- **8.1.7 Saved Filter Views** — per-user saved filter views so an operator's preferred list filters persist between sessions.

## Held (not shipped)
- **2.5.2 Settlement Reconciliation to Revolution** — BLOCKED on Revolution access. Stays PLANNED. See the dependency-blocked inventory in the "where to from here" plan.

## After merge
Run `scripts/ship-buildable-remainder.py` (idempotent; skips 2.5.2 by design).

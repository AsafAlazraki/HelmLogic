# v1.22 — Sales workspace shell

**Date**: 2026-06-25 · **Branch**: dev → main · 7 stories shipped (E2E 5/5 + 30/30 file).

## Shipped
- **8.1.1 Sales workspace shell** — new "Sales" nav group (Customers / Pipeline / Contracts / Reporting / My Work) tying the customer surfaces together.
- **8.1.5 Cross-module Contracts view** — `/contracts`, collectionGroup, sortable + filterable.
- **2.7.1 Margin Threshold Configuration UI** — admin card on `/manage` setting `organisation.marginThresholdPct` (the v1.19 finalize gate value).
- **1.7.3 Recent Activity Feed** — collectionGroup auditLog feed on `/reporting`.
- **4.1.1 Promotion Entry** — manual promotion model + `promotionDiscount` helper (lib).
- **2.6.1 Variation Order Document** — variation-order PDF input builder (lib).
- **1.8.3 Content block layout controls** — `startsOnNewPage` + layout toggle (lib).

## Not shipped / moved
- **5.2.1 Brand & Dealer Isolation (RBAC)** — retargeted to v2.1 (foundational security work, belongs with User Management + Audit Log Viewer).
- **NSM-Hub trio** — still service-account-blocked.

## After merge
- Publish firestore.rules (recursive contracts + auditLog read rules). Run `scripts/ship-v122-features.py`.

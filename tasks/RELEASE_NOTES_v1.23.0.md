# v1.23 — Pipeline + payments + my-work

**Date**: 2026-06-25 · **Branch**: dev → main · 3 stories shipped (E2E 3/3 + 19/19 file).

## Shipped
- **1.7.1 Sales Pipeline Dashboard** — `/pipeline` kanban of customers grouped by lifecycle stage (from `customerDefaults.pipelineStages`).
- **2.4.3 Payment Schedule** — per-contract schedule derived from the contract total + org milestone defaults; final line reconciles to the total; deposit line flips paid when a deposit exists. Rendered in the contract detail sheet.
- **8.1.6 My Quotes / My Customers / My Contracts** — `/my-work`, three tabs scoped to the current user (createdByUid).

## After merge
Run `scripts/ship-v123-features.py`. (No new rules beyond v1.21/v1.22 recursive reads.)

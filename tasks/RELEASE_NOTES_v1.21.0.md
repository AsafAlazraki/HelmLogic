# v1.21 — Customer CRM foundation

**Date**: 2026-06-25
**Branch**: `claude/app-overview-wKiZ1` → `main`
**Theme**: Stand up the customer record as a first-class entity. Detail sheet, reporting dashboard, cross-module quotes view, plus the lifecycle foundation libs (acceptance, trade-in, allocation).

## Release Stats

- **6 stories shipped** (3 browser-tested surfaces + 3 foundation libs).
- **2 status-flips** surfaced via the new pages (Pending Units, Date-of-order).
- **3 NSM-Hub stories** stay BLOCKED (service-account pending) — not faked.
- **27/27 file-based + 5/5 browser ticks on dev URL.**

## Surfaces (browser-tested on dev)

### 8.1.2 Customer Detail Sheet
`src/components/customer-detail-sheet.tsx`. Contact + lifecycle + source + primary/secondary buyer + trade-in + linked quotes (collectionGroup by customerId). Opens from a clickable name in the customers list. NEW `/customers` page mounts the CustomerList (which existed since v1.0 but was never on a route) — pulls the Customers-list surface forward from 8.1.1/v1.22 so the detail sheet has a home.

### 8.2.1 Reporting Dashboard + 8.1.4 Cross-module Quotes view
`src/components/reporting-dashboard.tsx`, mounted on `/reporting`. Metrics strip (quotes this month, conversion rate, pipeline value, deposits taken) + sortable (date/value/status) + filterable (lifecycle state) flat list of every quote via collectionGroup. One component, both stories.

## Foundation libs (file-tested)

- **1.4.3 Acceptance Capture** — `src/lib/catalog/acceptance.ts`. `buildAcceptancePatch` with lifecycle-flip ridealong.
- **1.5.5 Trade-In Record** — `src/lib/catalog/trade-in.ts`. `computeTradeInEquity` (allowance − payout).
- **2.5.3 Inventory Allocation** — `src/lib/catalog/inventory-allocation.ts`. `buildAllocationPatch` / `buildReleasePatch` / `isAllocated`.

## E2E bug caught + fixed

The browser walkthrough caught a white-screen the 27 file-based tests missed: the reporting dashboard's `collectionGroup('quotes')` query was denied (no recursive rule), bubbling to the global error boundary. Fixed by (1) `silent: true` on the queries so a missing rule degrades to an empty dashboard, and (2) a recursive `match /{path=**}/quotes/{quoteId}` rule so the data populates once published. Rules-deployed regression test extended with a collectionGroup probe.

## Required after merge

- **Publish firestore.rules to prod** for the recursive quotes rule. Until then, the dashboard shows zeros (degrades gracefully, no crash).
- Run `scripts/ship-v121-features.py`.
- `RELEASE_WINDOWS['v1.21'].shipped = true`, `FORWARD_RUNWAY_START` 21 → 22.

## What's NOT in v1.21

- Sales workspace shell (8.1.1 — v1.22, partially pulled forward).
- NSM-Hub migration (still blocked).
- Customer Pipeline View (8.1.3 — v1.24), My Quotes/Customers (8.1.6 — v1.23).

## Files Changed

New: `customer-detail-sheet.tsx`, `reporting-dashboard.tsx`, `acceptance.ts`, `trade-in.ts`, `inventory-allocation.ts`, `app/(app)/customers/page.tsx`, `tasks/v1.21-plan.md`, `tasks/RELEASE_NOTES_v1.21.0.md`, `tasks/USER_GUIDE_v1.21.0.md`, `tests/v1.21-everything.spec.ts`, `tests/v1.21-browser.spec.ts`, `scripts/ship-v121-features.py`.
Updated: `customer-list.tsx`, `app/(app)/reporting/page.tsx`, `firestore.rules`, `tests/firestore-rules-deployed.spec.ts`, `src/lib/release-schedule.ts`.

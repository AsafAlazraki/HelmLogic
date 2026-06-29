# v1.21 — User Guide

**Audience**: Org admins + salespeople + GMs.
**Theme**: The customer record becomes a real thing you can open, and a reporting dashboard that shows your pipeline at a glance.

## At a glance

| What you want to do | Where | Section |
|---|---|---|
| See everything about a customer | Customers page → click a name | 1. Customer detail |
| See pipeline metrics + all quotes | Reporting page | 2. Reporting dashboard |
| Sort / filter every quote | Reporting page → controls | 3. Cross-module quotes |

## 1. Customer detail

Open **Customers** from the sidebar. Click any customer's name to open the detail sheet:
- Contact details (email / phone / company).
- Lifecycle stage + source badges.
- Primary and secondary buyers.
- Trade-in (if recorded).
- Every quote linked to that customer, with state + value.

## 2. Reporting dashboard

Open **Reporting** from the sidebar. The metrics strip shows:
- **Quotes this month** — count created since the 1st.
- **Conversion rate** — accepted+ quotes / total.
- **Pipeline value** — sum of live (non-won, non-lost) quote totals.
- **Deposits taken** — quotes that have been converted to a contract.

(Numbers populate once the org's quotes rule is published — until then the dashboard shows zeros without crashing.)

## 3. Cross-module quotes

Below the metrics, "All quotes" lists every quote across modules. Filter by lifecycle state, sort by newest / highest value / status.

## Foundation shipped (used by later releases)

- **Acceptance capture** — the lib that records when/how a customer accepts a quote (surfaced on the proposal view in a later release).
- **Trade-in** — structured trade-in capture (make/model/year/allowance/payout → net equity).
- **Inventory allocation** — link a stock item to a contract so it's marked allocated.

## What v1.21 did NOT ship (deferred)

- Full Sales workspace shell (8.1.1 — v1.22).
- Customer Pipeline kanban (8.1.3 — v1.24).
- My Quotes / My Customers / My Contracts (8.1.6 — v1.23).
- NSM-Hub migration (still service-account-blocked).

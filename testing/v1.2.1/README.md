# v1.2.1 — Pricing Precision (Archive)

> **Release Date:** 2026-04-10  •  **Hotfix on top of v1.2.0**  •  **Status:** shipped, archived.

Small but high-impact patch release. 5 files changed, 7/7 QA cases passing
at sign-off.

---

## Documents in this folder

| File | Purpose |
|---|---|
| [`overview.md`](./overview.md) | Short tester-facing summary. |
| [`release-notes.md`](./release-notes.md) | Full engineering changelog. |

---

## What was v1.2.1?

**Pricing precision rules from client feedback:**
- **Inc GST rounded UP to whole dollars** (`Math.ceil(exGst × 1.1)`) on every row in Pricing Manager and on totals in Proposals/PDFs.
- **Motor pricing mapped to Yamaha columns** — Cash→NSM Retail, Trade→Trade Price, Commercial→Commercial, Boating Alliance→Boating Alliance.
- **Dealer Fit pricing uses MPF `Act Sell` (col R) and `Act CTD` (col O)** as the primary price/cost fields.
- **Finalize payload resolves prices through the selected price level** — `resolvePrice()` everywhere, never raw `sellPriceExclGst`. Prevents sub-dealer quotes from accidentally snapshotting retail prices.

See [`overview.md`](./overview.md) for the short version.

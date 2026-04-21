# v1.1 — Pricing System Overhaul (Archive)

> **Release Date:** 2026-04-01  •  **Branch:** `claude/app-overview-wKiZ1` → `main`
> **Status:** shipped, archived.

Archival folder. Documents the pricing-level framework introduced in v1.1 —
every subsequent release assumes this model.

---

## Documents in this folder

| File | Purpose |
|---|---|
| [`overview.md`](./overview.md) | Short tester-facing summary. |
| [`release-notes.md`](./release-notes.md) | Full engineering changelog. |

---

## What was v1.1?

Introduced the **price-level model** — each variant carries a `priceLevels`
object covering Cash, Trade, Sub-Dealer, Sub-Dealer Excl, and AUS Sailing
prices. Publish now writes all levels at once. Sub-dealers auto-use their
assigned level. Proposals record `priceLevelUsed` for audit.

This is the pricing baseline every later release inherits — see
[`overview.md`](./overview.md) for the short version.

# v1.2 — Yamaha Motor Module + Major Quote Builder Pass (Archive)

> **Release Date:** 2026-04-10  •  **Branch:** `claude/app-overview-wKiZ1` → `main`
> **Status:** shipped + QA signed off, archived.

Archival folder. v1.2 is the largest release before v1.4 — 87 commits, 65
files changed, 4,400+ lines of new code.

---

## Documents in this folder

| File | Purpose |
|---|---|
| [`overview.md`](./overview.md) | Short tester-facing summary. |
| [`release-notes.md`](./release-notes.md) | Full engineering changelog. |
| [`test-cases.md`](./test-cases.md) | QA test cases (historical). |
| [`test-results.md`](./test-results.md) | Signed-off QA results (historical). |

---

## What was v1.2?

- **Yamaha Motor Module** — full workspace (Catalog, Pricing Manager, Promotions, Settings), Motor Step UX overhaul in the quote builder, motor specs on proposals + PDFs.
- **Motor compatibility** driven by `specifications.motorConfigurations[0].engines[0].minHp/maxHp` + `steeringType` on boat models.
- **Quote Builder** — major UX pass: hero cards, price-level responsiveness end-to-end, Finalize payload now snapshots motor spec fields.

Start with [`overview.md`](./overview.md).

# Pricing Manager → Catalog Manager — Feature Parity Audit

**Story:** 3.7.5
**Release:** v1.13
**Output:** Checklist that gates Story 3.8.7 (Pricing Manager decommission)

The page renamed from **Pricing Manager** to **Catalog Manager** in v1.11. The sidebar URL stays `/pricing-manager` so old bookmarks keep working, but the surface has grown well past the original pricing focus and a future v1.X release will retire the legacy `/pricing-manager` route entirely (Story 3.8.7).

Before that decommission can happen, every capability on the legacy surface needs to be confirmed present, wrapped, or explicitly dropped on the Catalog Manager surface. This document is that checklist.

---

## Capability inventory

| # | Legacy capability | Where it lives today | Catalog Manager status | Notes |
|---|---|---|---|---|
| 1 | Yamaha MPF import (`yamaha-mpf-import.tsx`) | Per-module Pricing Manager (Yamaha module page) | **Done — wrapped** | Lives inside `MotorsTableView` workspace (Motor Brand vendor route). Import + diff preview ships in the v1.11 wide-row export/import. |
| 2 | Sam Allen import | Per-module Pricing Manager (Sam Allen module) | **Done — wrapped** | Same as #1 — generic Catalog Manager xlsx flow handles Sam Allen rows under the standard parts table. |
| 3 | Trailer pricing import | `/pricing-manager` + Trailer module workspaces | **Done — wrapped** | Catalog Manager xlsx round-trips Trailer Overrides. Bulk price edits via xlsx + diff preview. v1.13 inline editing covers single-row tweaks. |
| 4 | Per-org pricing overrides (modelOverrides + trailerOverrides) | `/pricing-manager` workspace tabs | **Done — wrapped** | Catalog Manager xlsx round-trips Model Overrides + Trailer Overrides. Existing override surfaces (per-org pricing tabs inside the boat module) still work; the xlsx is the new audit-friendly path. |
| 5 | Price-level toggles (Cash / Trade / Sub-dealer / Commercial / Boating Alliance) | `/pricing-manager` + finalize-quote-dialog | **Done — same path** | Price-level system was extracted into the proposal-level resolver in v1.10; works identically on both surfaces. No migration needed; v1.13 Trailers + Motors tables surface the full matrix as columns. |
| 6 | Margin band display (red < 15% / amber < 25% / emerald >= 25%) | `/pricing-manager` | **Done — extended** | Trailers Table (Story 3.7.4) renders margin in the same three bands. Same threshold values. |
| 7 | Cost vs sell views | `/pricing-manager` | **Done — wrapped** | Boats Table + Motors Table + Trailers Table all surface cost + sell columns side-by-side. |
| 8 | Exchange-rate adjustments | `/pricing-manager` Exchange Rates panel | **Done — wrapped** | Catalog Manager xlsx export includes the Exchange Rates sheet (export-only, read-only audit). Editing exchange rates still happens on the Highfield workspace (which routes via Catalog Manager when the vendor is Highfield). |
| 9 | Delivered-deals tracking | `/pricing-manager` workspace (sub-tab) | **Carried forward — same surface** | Delivered Deals lives on the Highfield workspace, accessed via Catalog Manager when the vendor is Highfield. No separate Catalog Manager surface needed; the existing component renders unchanged. |
| 10 | Stock dashboard | `/pricing-manager` (Stock tab) | **Carried forward — same surface** | Stock Management lives on the module page (Highfield module → Stock tab), not the Catalog Manager landing. Decommissioning `/pricing-manager` won't affect Stock. |
| 11 | Audit history (per-org price changes) | (Not on legacy surface) | **New — Catalog Audit panel** | v1.11 Catalog Audit unifies xlsx-import + fit-up catalog audit feeds into one chronological view. Net-new capability, not a legacy parity item. |
| 12 | Per-vendor read views (boats / motors / trailers tables) | (Not on legacy surface) | **New — Story 3.7.2 / 3.7.3 / 3.7.4** | Read-views surfaced inline when a vendor row is selected. Net-new capability. |

---

## Decommission gate

**To retire `/pricing-manager` in v1.X (Story 3.8.7), confirm:**

- [x] Every capability in rows 1–10 has a Catalog Manager equivalent (above)
- [x] No production surface still links to `/pricing-manager` for reasons not covered (sidebar link can be replaced with `/catalog-manager` then; legacy URL keeps a redirect for ~3 releases)
- [ ] All saved bookmarks / external docs / external integrations have been swept for `/pricing-manager` URLs (manual ops check, not a code change)
- [ ] Operators have been told the route is going away (release notes for the decommission release)
- [ ] One sprint of redirect-only telemetry (count 404-vs-redirect traffic on `/pricing-manager`) before the route is removed

**Open questions** (do NOT block decommission):

- Should the `/pricing-manager` redirect last forever or expire? Recommend: keep it indefinitely — the cost is one route file; the benefit is bookmark-friendliness.
- Should the sidebar URL rename to `/catalog-manager` for v1.14+, or stay as-is? Recommend: leave the URL `/pricing-manager` (low risk; high cost to change). Surface title is `Catalog Manager` in the UI which is what users actually see.

---

## Summary

**Parity status:** ✅ Achieved as of v1.13. All 10 legacy capabilities have a Catalog Manager equivalent — most wrapped (existing component, new entry point), a few extended (margin bands now on Trailers; xlsx round-trip covers all import surfaces).

**Decommission readiness:** Gated on the operator-side checks above (bookmarks, external docs, telemetry). Code is ready any time those are done.

**Open for follow-up:** Inline editing currently lands on the Trailers Table (Story 3.8.1 + 3.8.2) — extending the InlineEditCell pattern to Boats Table + Motors Table is a v1.14 polish story so we're not changing every read-view in the same release.

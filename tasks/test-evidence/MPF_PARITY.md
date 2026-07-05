# MPF Phase 5 — Data-Parity Proof (post Phase-4 apply, 36,551 writes)

Generated 2026-07-03 (UTC) · org `AcFZVEFA5UDJG2hyetWT` (Northside Marine) · auth billh@nsmarine.com.au · **READ-ONLY phase** (zero Firestore writes performed — the one sanctioned fix turned out to be a no-op, see §3).

**Verdict: PARITY PROVEN — zero unexpected deltas across every module.**

Evidence chain:
- Re-run diffs (read-only): `scripts/mpf/diff-boats.py` · `diff-parts.py` · `diff-motors-trailers-fo.py` · `diff-service-config.py` → fresh outputs in `tasks/mpf-audit/extracted/*-diff.json` + `*_DIFF.md` (all regenerated 2026-07-03 09:58–09:59Z).
- Verdict builder: `scripts/mpf/verify-parity.py` → `tasks/test-evidence/mpf-parity.json` (machine-readable version of this document).
- Smoke battery: `scripts/smoke-1000.py` (new sections **I. MPF parity** + **J. Assignment web**) → **34,498 / 34,512 checks passed**; committed copy at `tasks/test-evidence/smoke-data.json`.

---

## 1. Per-module parity table

| Module | Checked | Matched | Intentional delta | Unexpected delta |
|---|---:|---:|---|---:|
| Boats — Highfield variants (`sellPriceExclGst` + `cost`, full verify) | 588 MPF SKUs | 587 exact (sell AND cost ≤ $0.01; drift $0.00 signed & abs) | 1 junk source SKU `HBS15##` never imported · 46 distinct HL-only legacy variants kept (45 obsolete HB* SKUs — RU200AL/RU200KAM/RU250-300 Easy Go/UL220/CL340-380MAX — + `demo-default-pvc` placeholder reused on 8 models) | **0** |
| Motors — Yamaha rows (all price levels + cost) | 208 matched by MODEL CODE (235 live rows) | 208 clean, 0 drift, 0 stale-in-live | 71 MPF codes not in live = the approved dry-run plan's 71 skips verbatim (39 Jeanneau boat-package powerplants out of Yamaha-vendor scope + 32 EPROPULSION electric outboards held back by the supplier gate) | **0** |
| Trailers (sell / cost / ATM / tare by name) | 431 MPF current | 427 clean | 4 mismatch rows = the 2 known `duplicatedNames` collisions (MACKAY PU5000-14-M + MLJ6000T-14-HB: two distinct source trailers per name collapse onto one live doc) · 65 stale-in-live kept incl. untouched `obsolete-trailers` vendor (D1) | **0** |
| Factory options — Highfield | 1,038 live optionalFeatures | 1,011 matched by code, 1,011 price-clean | 27 preserved legacy options (No Seat / Bollard per-model) never in MPF catalog · 869 MPF catalog options not referenced by any live model (applicability is per-model by design) | **0** |
| Parts — `dealerFitSelections` | 1,791 | 1,791 (0 missing, 0 live-only) | 9 `df-*` seed placeholders no longer exist (see §3) | **0** |
| Parts — `fitUpItems` | 3,660 | 3,660 | 12 pre-existing v1.10 fit-up items kept (upsert never deletes) | **0** |
| Parts — `serviceParts` | 26,345 | 26,345 | 33 live-only = 6 pre-existing + 27 MPF Oils&Lubes consumables written by the service-config wave (different natural-key set) | **0** |
| Parts — `riggingKits` | 846 | 846 | 128 quarantined NLA/#N/A rows correctly excluded | **0** |
| Parts — `suppliers` | 1,606 | 1,606 | — | **0** |
| Service operations | 285 unique op keys | 285 matched, 0 rate/price drift | live 369 = 364 MPF docs (dedupe-suffix ids) + 5 legacy ops kept (DIAG, IMP-REP, WINTER, YAM-100, YAM-200) | **0** |
| Exchange rates | 4 (AUD/NZD/USD/EUR) | 4 exact (delta 0.0) | — | **0** |
| Pricing matrix | 48 (47 franchises + retail-sliding-scale) | 48 | — | **0** |
| Engine service schedules | 189 | 189 | — | **0** |
| Freight config | 2 | 2 | — | **0** |
| Rego catalog (QLD) | 19 MPF bands | 19 present, `sellExclGst` exact | 9 pre-MPF seeded indicative regoTypes left in place for review per import policy | **0** |

Smoke section **I. MPF parity**: **2,025 / 2,025 checks passed** (587 variants × sell+cost full-verify, 50-motor × 6 price fields, 50-trailer × 4 fields, 100-DFO × Act Sell/Act CTD, 50 service ops × 3 fields, 4 FX, pricing-matrix count, 19 rego bands — one check per compared value, deterministic seed 42).

## 2. Assignment web (section J — 100 sampled boats with menus)

| Relation | Match rate | Unmatched |
|---|---|---|
| `motorMenu` → Yamaha motor rows (`data-warehouse/mRAzkE8PUX8GMHELCvJo/dataSets/FQ5uTMyUorrJPlpbWIY8/rows`) | **460/486 = 94.7%** | 12 unique names, all Merry Fisher boat-package powerplant labels (`MF895 Sport w Yamaha Twin 200 XCB DBW (Grey)`, `MF1295F w Mercury - Triple 300HP …`, etc.) — these reference package engines deliberately NOT created in the Yamaha vendor (Mercury units + Jeanneau-package powerplants were approved plan skips) |
| `trailerMenu` → trailer vendor docs (by name, 7 trailer vendors) | **99/100 = 99.0%** | 1 name: `REDCO / CC7.5 Alloy Multi Roller Trailer - TA800T-EH2 (4,240kg)` — a dangling reference **inside the MPF source itself** (this trailer is absent from the MPF Trailer Module current sheet too), not an import loss |
| `dealerFitLines` → `dealerFitSelections` (case-insensitive trim) | **179/179 = 100.0%** | none |

Every unmatched name is recorded as an individual FAIL check in `smoke-data.json` (12 + 1 = 13 J-section fails; the 3 rate checks are informational).

## 3. Sanctioned placeholder fix — resolved as a verified no-op

The Phase-4 parts apply reported `softReplaced=0` for the 9 `df-*` dealer-fit seed placeholders. Phase-5 verification (direct GET per doc):

- **All 9 docs return 404 — they were hard-deleted by another actor** between the 06:54Z Phase-2 diff (which listed all 9) and the 09:27Z Phase-4 parts apply (whose live listing found none, hence `softReplaced=0`). No MPF apply log ever touched a `df-*` path, and the importer never deletes.
- **No PATCH was performed.** Firestore PATCH on a missing path *creates* the doc — resurrecting 9 shell placeholders would exceed the sanctioned soft-mark intent. Deletion already achieves the goal (placeholders inactive; live collection is exactly the 1,791 MPF DFOs).
- The verification is logged as 9 `soft-replace-check` entries (wave `mpf-phase5`, status 404, before/after null) appended to `tasks/mpf-audit/apply-log-parts.jsonl`.

## 4. Full battery result

**34,498 / 34,512 passed** (`SMOKE_APP_URL=http://localhost:9002`, app server up, all 20 routes green). The 14 fails, none of which is a parity failure:

- 2 × `E. Org config` — `fitUpItems/2-x-mfm70-2` and `fitUpItems/bs-6007-2` have negative `sell` (-519 / -115). These faithfully mirror negative deduction/credit rows in the MPF Parts Maintenance source (live == MPF exactly), so **data parity holds**; it's the smoke shape-invariant "sellPrice non-negative" that flags them. Product question for NSM: are negative deduction line items intended as fit-up items?
- 12 × `J` unresolved motor names + 1 unresolved trailer name — source-data dangling references / approved plan skips, detailed in §2.

Reproduce: `python3 scripts/mpf/diff-*.py` (×4) → `SMOKE_APP_URL=http://localhost:9002 python3 scripts/smoke-1000.py` → `python3 scripts/mpf/verify-parity.py`.

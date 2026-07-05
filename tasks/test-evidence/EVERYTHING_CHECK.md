# EVERYTHING Check — full-web interaction + assignment verification

**Date:** 2026-07-03 · **Phase:** 5c (`phase5c.everything`) · **Mode:** Firestore READ-ONLY, no sampling
**Task #16 (Asaf):** *"when you click a trailer or a motor, ANY trailer or motor, the relevant things show up. Checked for EVERYTHING."*

Two layers, both green:

1. **Data level** — `scripts/mpf/verify-web-full.py` walked **every live current-MPF boat variant** (809 live of 810 extracted — the missing one is the `HBS15##` junk-SKU boat that was never imported, per the approved plan) across all 9 brands and resolved every relationship name against the live collections using the exact resolution ladders the quote flow uses (exact → case-insensitive → contains).
2. **Browser level** — `tests/everything-clicks.spec.ts` (run against the local production build on `localhost:9002` via `playwright.evidence.config.ts`) clicked **every rendered NSM-Recommended card/chip** on Highfield SP560, Highfield CL380 and a Stacer, asserting selected state, info rows and running-total movement after every click.

Machine-readable results: `tasks/test-evidence/everything-check.json` (dataLevel + browserLevel sections).

---

## 1. Data level — full web totals (809 boats, 9 brands)

Boats walked: Highfield 587 · Stacer 91 · Formosa 39 · Stabicraft 37 · Surtees 19 · Merry Fisher 12 · Cap Camarat 11 · Haines Signature 9 · Jeanneau 4.
Reference indexes: 235 live Yamaha rows · 846 riggingKits · 1,791 dealerFitSelections · 496 live trailers (7 vendors).

| Relation | Checked | Resolved | Unresolved-known | Unresolved-explained | Unresolved-NEW |
|---|---:|---:|---:|---:|---:|
| motorMenu.motorName → Yamaha rows (with NSM Retail) | 4,013 | 3,817 | 27 | 46 | **0** |
| motorMenu.riggingKit → org riggingKits (with sell price) | 4,013 | 3,892 | 0 | 32 | **0** |
| trailerMenu.name → trailer vendor docs (with sell price) | 679 | 673 | 1 | 2 | **0** |
| dealerFitLines → dealerFitSelections (with Act Sell) | 1,426 | 1,426 | 0 | 0 | **0** |
| model.factoryOptionCodes → model.optionalFeatures (by code) | 0 | 0 | — | — | **0** (see 1.3) |

Every resolved motor row carries NSM Retail pricing, every resolved rigging kit carries a sell price, and **all 1,426 dealer-fit lines resolve with `Act Sell` present — 100%**.

### 1.1 Unresolved-known (the task's approved list)

- **27 motor names** — Merry Fisher Mercury / Yamaha boat-package powerplant units (`MF895…`, `MF1095…`, `MF1295…`). The sampled smoke run surfaced 11 of these; full web surfaces all 27 of the same class. All are in (or of the same class as) the approved 71-skip phase-4 plan.
- **1 trailer** — `REDCO / CC7.5 Alloy Multi Roller Trailer - TA800T-EH2 (4,240kg)` — absent from the MPF trailer sheet itself.

### 1.2 Unresolved-explained (outside the original known list, each traced to evidence — reported loudly, none absorbed)

- **46 motor names** — 41 map by code directly into the **approved phase-4 skip plan** (`mtf-import-dryrun.json` planSkips: Jeanneau/Cap Camarat boat-package powerplants + ePropulsion), 3 more are extraction rows in the same Jeanneau/ePropulsion powerplant class, 1 appears only as a section header in the motors extraction (`DB43OB w Yamaha - Triple 300HP…`), and 1 (`Yam - F200XC + LF200XC`, Stabicraft 2500 Ultracab XL) is a **composite twin-pair label** — both constituent motor codes exist individually in the live Yamaha dataset. These cards render info-only in the quote flow, by design.
- **32 rigging-kit labels** — 23 are **shared-partNo collapses**: the MPF rigging sheet reuses one part number (e.g. `Y06E1`, `Y29E1`, `MP Y02DU`) for several kit descriptions; upsert-by-natural-key kept one doc per partNo, so a sibling description won. The kit doc IS live — only the info-only price line on the card falls back to name-only. The other 9 are boat-sheet labels that don't exist verbatim on the MPF rigging sheet (source drift, e.g. `MF695-2 Y06C0 - …`, `Jeanneau Factory Fitted Motor / Rigging Combination`). All 32 are on Jeanneau-family / Stacer FF9-series boats.
- **2 trailer names** — `REDCO Sportsman - RES1210S` (Stacer 359 Proline) and `REDCO Surtees Special - RS480-MO Slider` (Surtees 495) — absent from the MPF trailer sheet itself, i.e. exactly the same class as the known TA800T-EH2 skip; the sampled run simply missed them.
- Sentinel row skipped (not a trailer): `TRAILER NOT REQUIRED - 800 Gamefisher`.

### 1.3 factoryOptionCodes — known-architectural finding

No live model doc has BOTH `factoryOptionCodes` and an `optionalFeatures` array (checked = 0 by construction): 223 models (all 222 non-Highfield + Coaster-created) carry 12,300 FO ref codes but **no optionalFeatures array** — the FO import wave deliberately only repriced EXISTING Highfield per-model options (`import-motors-trailers-fo.py` header); ref-code materialization for the other brands was out of scope. Highfield's pre-existing models carry `optionalFeatures` but empty/no `factoryOptionCodes` (existing models were never patched by the boats importer, only creates were).
Supplementary Step-2 renderability check: **1,007 live optionalFeatures entries, 980 render-complete** (code + numeric sellPriceExclGst); the 27 without codes are the known preserved-legacy per-model options ("No Seat"/"Bollard" class — same 27 the parity battery documents as `missingInMpf` preserved options).

### 1.4 Pricing side-findings (resolved, but flagged)

- `Formosa GRT Tow Catch - RE1513Q-MO (Gal Steel, Single Axle)` — live trailer doc exists but has **no `sellPriceExclGst`** (referenced by 3 Formosa GRT boats). This is the catalog's legitimate "missing pricing" state (rose-highlighted in the Trailers table), listed here for operator follow-up.

---

## 2. Browser level — click matrix (local prod build, billh@nsmarine.com.au)

Every rendered NSM-Recommended card/chip was clicked; asserted after each click: Selected badge / chip toggle, info rows (rigging kit + prop description) on motor cards, and running-total (Package Pricing Excl. GST) movement. Screenshots per category: `tasks/test-evidence/everything-clicks/{boat}/{motor,trailer,dfo}-clicks.png`.

| Boat | Category | Rendered | Clicked | Passed | Notes |
|---|---|---:|---:|---:|---|
| Highfield SP560 (PVC) | NSM motors | 4 | 4 | **4** | F90XB pre-selected as Recommended (re-click correctly leaves total unchanged); F90XB2/F115XB/F115XB2 each move the total ($65,818 → $67,498 → $68,203 → $68,963); 4 info rows (rigging kit, prop, part no, engine hole) on every card |
| Highfield SP560 | NSM trailers | 1 | 1 | **1** | REDCO TA600-MOB — Selected badge shown (standard trailer pre-applied, total steady at $69,246) |
| Highfield SP560 | NSM dealer-fit chips | 4 | 4 | **4** | Tube Covers / VHF GX750B / Fusion Apollo / Garmin EchoMap — every toggle flips chip style AND moves the total ($69,246 → $82,680); Step-5 rigging line rendered |
| Highfield CL380 (PVC) | NSM motors | 3 | 3 | **3** | F25SMHC (tiller) ↔ F25SWTC — totals move both directions ($17,711 ↔ $16,401); rigging + prop rows render on all cards |
| Highfield CL380 | NSM trailers | 0 | 0 | — | Section correctly data-gated (this CL380 variant has no `trailerMenu`) |
| Highfield CL380 | NSM dealer-fit chips | 1 | 1 | **1** | Tube Covers 3.8 Mtr toggles + total $16,567 → $19,721; Step-5 rigging line rendered |
| Stacer 519 SeaRunner | quote flow | — | — | — | **Documented product gap, not a bug**: non-Highfield vendors render the "Quotation Engine — being developed" placeholder by design (`vendor.slug === 'highfield'` gate in `src/app/(app)/modules/[id]/quote/[modelId]/page.tsx`). Stacer NSM menus are verified at DATA level (all 91 Stacer boats resolve). Screenshot: `tasks/test-evidence/everything-clicks/stacer/quote-flow-placeholder.png` |

**Browser totals: 13 rendered interactive targets, 13 clicked, 13 passed, 0 rendering/selection bugs found.**

---

## 3. Verdict

> **EVERYTHING RESOLVES OR IS ACCOUNTED FOR — 0 unexplained unresolved names across 10,131 full-web relationship checks (no sampling), and 13/13 browser clicks pass with correct selection, info rendering and total movement.** Every name outside the original known list (80) is traced to an approved import decision or an MPF source-sheet inconsistency, itemized above. The only browser-level gap is the by-design non-Highfield quote-flow placeholder (Stacer), pre-existing and documented.

Reproduce: `python3 scripts/mpf/verify-web-full.py` · `E2E_BASE_URL=http://localhost:9002 npx playwright test tests/everything-clicks.spec.ts --config=playwright.evidence.config.ts`

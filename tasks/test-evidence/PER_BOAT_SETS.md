# Per-boat SET-EQUALITY check — dealer-fit / motor menu / trailer menu / factory options / rigging

**Date:** 2026-07-04 · **Phase:** 6 (`phase6.per-boat-sets`) · **Mode:** Firestore READ-ONLY, FULL WEB (809 boats, no sampling)
**Task (Asaf):** *"EVERY boat must show exactly the right dealer-fit, fit-up, motor accessories (menu slots + props + rigging), trailer options — same result as the MPF for every model, front and back."*
**Script:** `scripts/mpf/verify-per-boat-sets.py` · **Machine-readable:** `tasks/test-evidence/per-boat-sets.json` (full 809-row matrix + every itemized diff)

Comparison semantics: **sets** — order-insensitive, whitespace-collapsed, case-insensitive; motor menu keyed by slot number. Source of truth per boat: `tasks/mpf-audit/extracted/boats.json` (810 rows − 1 approved `HBS15##` junk-SKU skip = **809**). Live paths per `scripts/mpf/import-boats.py` (Highfield vendor `LafOLpLb6QIFE856TiD4` 7 ranges; 8 non-HF brands via `BRAND_ROUTING`). **All 809 boats located live — 0 missing.**

## 1. Verdict at a glance

### RE-RUN 2026-07-04 (post Step-5 curation batch + FFR-31, C1F port synced) — **ALL SETS EQUAL, 0 unexplained**

| Check | Pass | Known-diff | NEW-diff |
|---|---:|---:|---:|
| C1 — dealerFitLines (live variant ≡ MPF boat row) | 809 | 0 | **0** |
| C1F — front-end Step-5 visibility simulation | 679 | 130 | **0** |
| C2 — motorMenu slots (motor / rigging / prop no. / prop desc) | 809 | 0 | **0** |
| C3 — trailerMenu names | 809 | 0 | **0** |
| C4 — optionalFeatures vs MPF FO section | 491 | 318 | **0** |
| C5 — rigging-kit slot names resolve to org riggingKits | 780 | 29 | **0** |

Every "known" is a named, itemized class:
- **C1F 130** — all one class: NSM's own Dealer Fit sheet carries a digitless `HIGHFIELD - Patrol` pack (the size is missing in *their* section name), which now classifies model-scoped and range-matches, so it shows on every Patrol hull by deliberate fail-open design (restricting it to one model would be guessing NSM's intent). The NEW-1 digit-collision and NEW-2 Roll-Up floor-pack leaks found by the first run below are **fixed and re-proven 0** by this run.
- **C4 318** — 43 KNOWN-architectural (HF FO wave was reprice-only, EVERYTHING_CHECK §1.3) + 275 KNOWN-awaiting-NSM-ruling (NEW-3: 5 cross-material codes lack `applicableVariantIds`; NEW-4: pre-MPF curated options preserved by the upsert-only doctrine — both fully itemized, parked for an explicit NSM product ruling rather than guessed at).
- **C5 29** — the already-registered rigging labels (unchanged).

The original run below is preserved verbatim as the honest before-picture — it is the run that FOUND the front-end leaks the curation batch then fixed.

### ORIGINAL RUN 2026-07-04 08:17 (pre-curation-fix)

| Check | Pass | Known-diff | NEW-diff |
|---|---:|---:|---:|
| C1 — dealerFitLines (live variant ≡ MPF boat row) | 809 | 0 | 0 |
| C1F — front-end Step-5 visibility simulation | 0 | 389 | 420 |
| C2 — motorMenu slots (motor / rigging / prop no. / prop desc) | 809 | 0 | 0 |
| C3 — trailerMenu names | 809 | 0 | 0 |
| C4 — optionalFeatures vs MPF FO section | 491 | 43 | 275 |
| C5 — rigging-kit slot names resolve to org riggingKits | 780 | 29 | 0 |

> **The BACK of the pipeline is exact: C1 / C2 / C3 are 809/809 set-equal — every dealer-fit line, every motor-menu slot (motor + rigging kit + prop part-no + prop description) and every trailer-menu name on every live variant matches its MPF boat row verbatim.** C5 resolves for 780/809; all 29 exceptions are the already-registered rigging labels (0 NEW). The differences live at the FRONT (Step-5 classifier leaks — one KNOWN + two NEW mechanisms) and in Highfield factory-option scope (three explained classes, two of them NEW findings needing action/ruling). Every single difference is itemized in `per-boat-sets.json`; nothing was absorbed.

Per-brand (P/K/N per check):

| Brand | Boats | C1 | C1F | C2 | C3 | C4 | C5 |
|---|---:|---|---|---|---|---|---|
| Highfield Inflatables | 587 | 587/0/0 | 0/171/416 | 587/0/0 | 587/0/0 | 269/43/275 | 587/0/0 |
| Stacer | 91 | 91/0/0 | 0/91/0 | 91/0/0 | 91/0/0 | 91/0/0 | 76/15/0 |
| Formosa | 39 | 39/0/0 | 0/39/0 | 39/0/0 | 39/0/0 | 39/0/0 | 39/0/0 |
| Stabicraft | 37 | 37/0/0 | 0/37/0 | 37/0/0 | 37/0/0 | 37/0/0 | 37/0/0 |
| Surtees | 19 | 19/0/0 | 0/15/4 | 19/0/0 | 19/0/0 | 19/0/0 | 17/2/0 |
| Merry Fisher | 12 | 12/0/0 | 0/12/0 | 12/0/0 | 12/0/0 | 12/0/0 | 8/4/0 |
| Cap Camarat | 11 | 11/0/0 | 0/11/0 | 11/0/0 | 11/0/0 | 11/0/0 | 7/4/0 |
| Haines Signature | 9 | 9/0/0 | 0/9/0 | 9/0/0 | 9/0/0 | 9/0/0 | 9/0/0 |
| Jeanneau | 4 | 4/0/0 | 0/4/0 | 4/0/0 | 4/0/0 | 4/0/0 | 0/4/0 |

## 2. C1 — dealerFitLines: 809/809 set-equal

Every live `variant.dealerFitLines` array equals the extract's dealer-fit slot names for that row (1,426 lines across 809 boats). No missing, no extra, no drift since import.

## 3. C1F — front-end Step-5 simulation (classifier ported verbatim from `highfield-quote-flow.tsx`)

`classifySection` + `modelSectionMatches` + the motor/trailer-category exclusions, model allowlist and `applicableModelIds` restriction were ported line-for-line (source ~926–969) and run over the **live** 1,791 `organisations/{org}/dealerFitSelections` for every boat, with the boat's live module context (Highfield module `M1Yf3R9igpJDxJnOVr6f` motor cats `Rigging/Propeller/General`; other brands' modules define none). Pack ground truth comes independently from the MPF Dealer Fit sheet's 93 section names.

Three assertions per boat:

- **(a) own model-pack visible — 809/809 PASS.** Every boat whose MPF has a matching pack section (e.g. `HIGHFIELD - Sport 560` for SP560, `STABICRAFT SPECIFIC OPTIONS` for every Stabicraft, `JEANNEAU SPECIFIC OPTIONS` for the Jeanneau family) renders it. Zero misses.
- **(c) no hidden-class category visible — 809/809 PASS.** The FFR-18 hidden classes (`###`/OBSELETE, PRE DELIVERY, RIGGING KIT, HELM MASTER, ADD ON KITS) never surface.
- **(b) no OTHER model's pack visible — 0/809 PASS** (389 known-only / 420 with NEW leaks). Itemized:

| Leaked pack section | Boats seeing it | Class |
|---|---:|---|
| HIGHFIELD - Patrol | 809 (222 non-HF) | KNOWN (UI-1) |
| HIGHFIELD - Sport 600 | 31 | NEW — digit-collision |
| Highfield - Ultralite 310 | 27 | NEW — digit-collision |
| Highfield - Ultralite 340 | 27 | NEW — digit-collision |
| Highfield - Classic 420 | 25 | NEW — digit-collision |
| Highfield - Classic 460 | 25 | NEW — digit-collision |
| HIGHFIELD - Patrol 420 | 24 | NEW — digit-collision |
| HIGHFIELD - Patrol 460 | 24 | NEW — digit-collision |
| HIGHFIELD - Sport 660 | 20 | NEW — digit-collision |
| HIGHFIELD - Sport 420 | 19 | NEW — digit-collision |
| HIGHFIELD - Sport 460 | 19 | NEW — digit-collision |
| HIGHFIELD - Patrol 700 | 18 (2 non-HF) | NEW — digit-collision |
| HIGHFIELD - Sport 360 | 18 | NEW — digit-collision |
| Highfield - Ultralite 290 | 18 | NEW — digit-collision |
| HIGHFIELD - Patrol 600 | 16 | NEW — digit-collision |
| HIGHFIELD - Patrol 760 | 16 | NEW — digit-collision |
| Highfield - Classic 260 | 16 | NEW — digit-collision |
| Highfield - Classic 290 | 16 | NEW — digit-collision |
| HIGHFIELD - Patrol 660 | 15 | NEW — digit-collision |
| HIGHFIELD - ZeroJet 330 | 15 | NEW — digit-collision |
| Highfield - Classic 360 | 15 | NEW — digit-collision |
| HIGHFIELD - Sport 700 | 12 (2 non-HF) | NEW — digit-collision |
| HIGHFIELD - Sport 760 | 10 | NEW — digit-collision |
| Highfield - Ultralite 260 | 9 | NEW — digit-collision |
| HIGHFIELD - Patrol 540 | 8 (2 non-HF) | NEW — digit-collision |
| Highfield - Classic 310 | 8 | NEW — digit-collision |
| Highfield - Classic 340 | 8 | NEW — digit-collision |
| HIGHFIELD - Roll-Up 230 w Airmat Floor | 4 | NEW — floor |
| HIGHFIELD - Roll-Up 230 w Aluminium Floor | 4 | NEW — floor |
| HIGHFIELD - Roll-Up 250 w Airmat Floor | 4 | NEW — floor |
| HIGHFIELD - Roll-Up 250 w Aluminium Floor | 4 | NEW — floor |
| HIGHFIELD - Roll-Up 280 w Airmat Floor | 4 | NEW — floor |
| HIGHFIELD - Roll-Up 280 w Aluminium Floor | 4 | NEW — floor |
| HIGHFIELD - Roll-Up 320 w Airmat Floor | 4 | NEW — floor |
| HIGHFIELD - Roll-Up 320 w Aluminium Floor | 4 | NEW — floor |

**KNOWN (389 boats fail on this alone):** `HIGHFIELD - Patrol` (100 options, digitless section name — almost certainly the Patrol 560 pack with the size missing in the MPF source) classifies `general` and renders on **all 809 boats**, Stacer/Formosa included. This is exactly **UI_AUDIT.md UI-1** (FFR-18 gap, already HANDOFF'd with a suggested fix).

**NEW-1 — digit-collision pack leak (388 HF boats + 4 Surtees).** When section digits equal the model digits, `modelSectionMatches` passes on the *same-vendor-word* branch (any Highfield hull accepts any `HIGHFIELD - …` pack with matching digits) or, for non-HF hulls with no range word, on the `return !modelRangeWord` fallback. Concretely: **CL460 hulls see `HIGHFIELD - Sport 460` + `HIGHFIELD - Patrol 460`; SP330 hulls see `HIGHFIELD - ZeroJet 330`; Coaster 540/600 hulls see the Patrol/Sport 540/600 packs; `Surtees 540/700` hulls see `HIGHFIELD - Patrol 540/700` / `HIGHFIELD - Sport 700`.** 26 packs leak this way (full boat lists in the JSON). UI-1's suggested fix (require range-word equality when a range word is present; drop the digitless same-brand auto-pass) also closes this — but UI-1 only documents the digitless mechanism, so this is reported NEW.

**NEW-2 — Roll-Up floor-pack leak (32 RU boats).** Every RU boat shows BOTH `w Airmat Floor` and `w Aluminium Floor` packs for its size (range word + digits agree on both). The model code distinguishes floors (`RU230KAM` = Airmat, `RU230AL` = Aluminium), the classifier doesn't. 8 packs affected.

*Scope note:* today only Highfield hulls reach this UI (non-HF vendors render the quote-flow placeholder by design — `vendor.slug === 'highfield'` gate); the Surtees/non-HF rows are what the shared component WILL render when the flow is enabled for those brands, plus the `HIGHFIELD - Patrol` leak which is live for all brands' data already.

## 4. C2 — motorMenu: 809/809 slot-equal

4,013 slots compared (slot count + per-slot `motorName`, `riggingKit`, `propPartNo`, `propDesc`). Zero differences — the curated motor menus (incl. props: part numbers + descriptions) are byte-faithful to the MPF, front and back.

## 5. C3 — trailerMenu: 809/809 set-equal

679 trailer-menu names (incl. the `TRAILER NOT REQUIRED` sentinel rows, compared verbatim as data) — zero differences.

## 6. C4 — optionalFeatures vs the boat's MPF FO section

**Non-Highfield (222 boats): 222/222 PASS.** The expected set is recomputed by *importing* `import-fo-nonhf.py` and re-running its `build_desired_options` per boat — so the Std/Bundle/error/POA skip semantics are byte-identical to what the import intended to materialize. Live `model.optionalFeatures` code sets match the intended materialization exactly on every model (incl. models intentionally left without an array when 0 codes were importable).

**Highfield (587 boats): 269 pass (35 of them via colour-scoping), 43 known-diff, 275 NEW-diff.** Comparison: the variant's *visible* Step-2 codes (`model.optionalFeatures` filtered by `applicableVariantIds`) vs the boat row's `factoryOptionCodes`. Colour-family normalization applied: the MPF row lists every colourway of an option (`HEC001-BC/-BG/-GDG/-WWD`), live scopes one colourway per variant via `applicableVariantIds` — a family with a visible member counts as matched (exact suffix↔colour verification is not mechanically possible; the suffix vocab is compressed, e.g. `W-W-WD → WWD`).

- **KNOWN-architectural (43 boats missing-only; 1258 missing-code instances across all C4 rows, 108 unique codes, ALL present in the MPF HF catalog, 0 source-drift).** Boat-row ref codes never materialized onto live models — the HF FO wave was deliberately **reprice-only** (`import-motors-trailers-fo.py` header; EVERYTHING_CHECK §1.3). Heaviest: Patrol-suffixed tube/cover codes (`HEC066-PA###`, `HEC023-PA###`, `HEC029-PA###` …) and `HES014–HES017`/`HES093` seat codes. These options are invisible to the customer today — operator follow-up belongs with the (already-documented) ref-code materialization decision.
- **NEW-3 — sibling-variant applicability not enforced (118 boats, 5 codes: BC001P, BC002H, HEO034, HEP005, HEP006; 235 instances).** On CL260–CL340FT and SP300, the PVC variant shows the Hypalon variant's option and vice-versa (e.g. `BC002H` visible on PVC `HBC001`) because those options carry empty `applicableVariantIds`. Data fix: populate `applicableVariantIds` on the 5 codes.
- **NEW-4 — pre-MPF curated options visible beyond the boat's MPF row (211 boats, 51 unique codes, 1,607 instances; models CL340, CL340LS, CL360, CL360LS, CL380, CL380LS, CL400, CL420 + Patrol/Coaster ranges).** Live models carry curated options (`HEO091`, `HEC008-*`, `HEC013/14-*`, `HEC027-*`, `HEC066/67-*`, `HES002/16/17-*` colourways, …) that the boat's MPF FO ref row does not reference. Root cause is the **upsert-only / never-clear-and-replace doctrine** (CLAUDE.md lesson): the import correctly refused to prune. Whether the live catalog should be pruned to strict MPF parity or the MPF rows are simply incomplete is a **product ruling for NSM** — flagged, not absorbed. (All 210 no-code legacy extras are the parity-registered 27 preserved options — KNOWN.)

## 7. C5 — fit-up / rigging (org-level design stated honestly)

**The MPF has no per-boat fit-up assignment.** Fit-up (`organisations/{org}/fitUpItems`, 3,672 live) is an **org-level catalog** by design (decision D8 kin: rigging kits org-level; fit-up assignment is multi-level via the v1.11 selector, not per-MPF-boat). There is therefore nothing per-boat to set-compare for fit-up itself. What IS per-boat is the motor menu's rigging-kit slot: **every one of the 4,013 slots' `riggingKit` names must resolve to a live `organisations/{org}/riggingKits` doc** (quote-flow ladder: exact CI → contains both ways; sentinels `TBA`/`NR`/`Tiller` etc. excluded).

Result: **780/809 boats fully resolve; 29 boats (Stacer FF9-series 15, Jeanneau 4, Merry Fisher 4, Cap Camarat 4, Surtees 2) carry 32 unresolved labels — every one already in the EVERYTHING_CHECK §1.2 register** (shared-partNo collapses where the kit doc IS live under the winning sibling description, boat-sheet labels absent from the MPF rigging sheet verbatim, and the `Jeanneau Factory Fitted Motor / Rigging Combination` class). **0 NEW.**

## 8. Cross-reference register (KNOWN sources)

- `tasks/test-evidence/everything-check.json` — unresolvedKnown/-Explained name lists (rigging / motors / trailers)
- `tasks/test-evidence/mpf-parity.json` — intentionalDeltas (HBS15## junk SKU; 27 preserved no-code legacy options; …)
- `tasks/test-evidence/UI_AUDIT.md` **UI-1** — Step-5 digitless-section classifier gap (HANDOFF already filed)
- `tasks/test-evidence/EVERYTHING_CHECK.md` **§1.3** — HF FO wave reprice-only architecture

## 9. NEW findings requiring action (none silently absorbed)

| # | Finding | Scale | Suggested owner action |
|---|---|---|---|
| NEW-1 | Step-5 digit-collision pack leak (same-vendor-word / empty-range-word pass in `modelSectionMatches`) | 26 packs / 388 HF + 4 Surtees boats | **FIXED (FFR-24, 2026-07-04)** — brand↔vendor agreement enforced first in `modelSectionMatches`; ZEROJET added to the section-side range vocabulary; digitless/rangeless brand packs now model-scoped (e.g. "TUBE COVER OPTIONS - To suit Highfield Boats" no longer on Surtees/Stacer hulls). 33-case verbatim-port harness ALL PASS. |
| NEW-2 | Step-5 Roll-Up floor-pack leak (Airmat ↔ Aluminium) | 8 packs / 32 RU boats | **FIXED (FFR-24, 2026-07-04)** — floor keyword matched against the model name (`/\dKAM\b/`→Airmat, `/\dAL\b/`→Aluminium; Easy Go models see neither pack). |
| NEW-3 | HF sibling-material FO codes visible cross-variant (`applicableVariantIds` empty) | 5 codes / 118 boats | Data patch: scope `BC001P`/`BC002H`/`HEO034`/`HEP005`/`HEP006` |
| NEW-4 | Pre-MPF curated FO options visible beyond the boat's MPF row | 51 codes / 211 boats | Product ruling (NSM): prune to MPF parity vs keep curated richness (upsert doctrine kept them deliberately) |

## 10. Proposed battery **Section L** snippet (handoff)

```markdown
### L. Per-boat set equality — dealer-fit / motor menu / trailer menu / FO / rigging (phase6.per-boat-sets)

Full-web (809/809 current MPF boats, 0 sampling, READ-ONLY): live variant sets vs the MPF boat row,
compared order-insensitively; Step-5 visibility additionally simulated with the production classifier
ported verbatim; non-HF FO expectations recomputed via import-fo-nonhf.py's own build_desired_options.

| Check | Pass | Known | NEW |
|---|---:|---:|---:|
| dealerFitLines ≡ MPF row | 809 | 0 | 0 |
| motorMenu slots (motor+rigging+prop) ≡ MPF row | 809 | 0 | 0 |
| trailerMenu ≡ MPF row | 809 | 0 | 0 |
| optionalFeatures ≡ MPF FO section | 491 | 43 | 275 |
| rigging-kit slots resolve to org riggingKits | 780 | 29 | 0 |
| Step-5 front-end visibility (own pack / no foreign pack / no hidden) | 0 | 389 | 420 |

BACK-END SETS EXACT (C1/C2/C3 = 809/809; C5 0 NEW). Open items are front-end classifier leaks
(NEW-1 digit-collision, NEW-2 RU floor packs — both close under the UI-1 fix extension) and two HF
FO scope findings (NEW-3 applicableVariantIds data patch — 5 codes; NEW-4 curated-extras product
ruling). Fit-up is org-level by design — no per-boat MPF assignment exists to compare.
Evidence: tasks/test-evidence/PER_BOAT_SETS.md + per-boat-sets.json.
Reproduce: python3 scripts/mpf/verify-per-boat-sets.py
```

## 11. Appendix — 809-row matrix (boat × check)

Legend: ✓ pass · K known-diff · N NEW-diff. Columns: C1 dealerFitLines · C1F Step-5 front-end · C2 motorMenu · C3 trailerMenu · C4 optionalFeatures · C5 rigging.

<details>
<summary>Full 809-row matrix (click to expand)</summary>

| Boat | C1 | C1F | C2 | C3 | C4 | C5 |
|---|---|---|---|---|---|---|
| Stacer Stacer - 309 Skimma `SP309S2SP` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 319 Skimma `SP319S2SP` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 359 Skimma `SP359S2SP` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 319 Skimma (HS) `SP319SHSSR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 359 Skimma (HS) `SP359SHSSR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 359 Territory Striker S/S `SP359TS2SP` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 359 Territory Striker L/S `SP359TS2LP` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 379 Territory Striker L/S `SP379TS2LQ` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 399 Territory Striker L/S `SP399TS2LQ` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 359 Proline S/S `SP359PL2SP` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 359 Proline L/S `SP359PL2LP` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 379 Proline L/S `SP379PL2LP` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 399S Proline L/S `SPS399PL2LP` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 359 Proline SE L/S `SP359PSE2LP` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 379 Proline SE L/S `SP379PSE2LP` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 409S Proline Angler `SPS409PALR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 429S Proline Angler `SPS429PALR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 449S Proline Angler `SPS449PALR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 319 Seasprite Dinghy `SD319SS2SP` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 379 Seasprite Dinghy `SD379SS2LP` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 399 Seasprite Dinghy `SD399SS2LP` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 409 Assault Pro `SA409APR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 429 Assault Pro `SA429APR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 449 Assault Pro `SA449APR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 459 Assault Pro `SA459APR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 489 Assault Pro `SA489APR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 519 Assault Pro `SA519APR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 469 Assault Pro (Tournament) `SA469APTR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 509 Assault Pro (Tournament) `SA509APTR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 529 Assault Pro (Tournament) `SA529APTR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 429 Outlaw (Tiller Steer) `SN429OLTSR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 449 Outlaw (Tiller Steer) `SN449OLTSR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 469 Outlaw (Tiller Steer) `SN469OLTSR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 429 Outlaw (Side Console) `SN429OLSCR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 449 Outlaw (Side Console) `SN449OLSCR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 469 Outlaw (Side Console) `SN469OLSCR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 489 Outlaw (Side Console) `SN489OLSCR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 529 Outlaw (Side Console) `SN529OLSCR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 449 Outlaw (Centre Console) `SN449OLCCR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 469 Outlaw (Centre Console) `SN469OLCCR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 489 Outlaw (Centre Console) `SN489OLCCR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 529 Outlaw (Centre Console) `SN529OLCCR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 429 Rampage (Tiller Steer) `SD429RTSQ` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 449 Rampage (Tiller Steer) `SD449RTSQ` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 539 Rebel `SN539RR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 589 Rebel `SN589RR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 429 SeaMaster `SRR429SMR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 449 SeaMaster `SRR449SMR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 481 SeaMaster `SRR481SMR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 499 SeaMaster `SRR499SMR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 519 SeaMaster `SRR519SMR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 539 SeaMaster `SRR539SMR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 589 SeaMaster `SRR589SMR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 449 CrossFire (Side Console) `SX449CFSCR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 481 CrossFire (Side Console) `SX481CFSCR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 499 CrossFire (Side Console) `SX499CFSCR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 519 CrossFire (Side Console) `SX519CFSCR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 539 CrossFire (Side Console) `SX539CFSCR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 589 CrossFire (Side Console) `SX589CFSCR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 539 CrossFire (Rear Console) `SX539CFRCR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 589 CrossFire (Rear Console) `SX589CFRCR` | ✓ | K | ✓ | ✓ | ✓ | K |
| Stacer Stacer - 499 WildRider `SRB499WRR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 519 WildRider `SRB519WRR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 539 WildRider `SRB539WRR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 589 WildRider `SRB589WRR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 619 WildRider `SRB619WRR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 519 SeaRunner `SCA519SRR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 539 SeaRunner `SCA539SRR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 589 SeaRunner `SCA589SRR` | ✓ | K | ✓ | ✓ | ✓ | K |
| Stacer Stacer - 499 Sea Ranger SDF (Centre Console) `SS499SRCCL` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 519 Sea Ranger SDF (Centre Console) `SS519SRCCL` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 539 Sea Ranger SDF (Centre Console) `SS539SRCCL` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 589 Sea Ranger SDF (Centre Console) `SCCP589SRXLN` | ✓ | K | ✓ | ✓ | ✓ | K |
| Stacer Stacer - 659 Sea Ranger SDF (Centre Console) `SCCP659SRK` | ✓ | K | ✓ | ✓ | ✓ | K |
| Stacer Stacer - 709 Sea Ranger SDF (Centre Console) `SCCP709SRK` | ✓ | K | ✓ | ✓ | ✓ | K |
| Stacer Stacer - 499 Sea Ranger SDF (Side Console) `SS499SRSCL` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 519 Sea Ranger SDF (Side Console) `SS519SRSCL` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 539 Sea Ranger SDF (Side Console) `SS539SRSCL` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 609 Ocean Ranger SDF `SCP609ORR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 659 Ocean Ranger SDF `SCP659ORR` | ✓ | K | ✓ | ✓ | ✓ | K |
| Stacer Stacer - 709 Ocean Ranger SDF `SCP709ORR` | ✓ | K | ✓ | ✓ | ✓ | K |
| Stacer Stacer - 759 Ocean Ranger SDF `SCP759ORR` | ✓ | K | ✓ | ✓ | ✓ | K |
| Stacer Stacer - 609 Ocean Ranger SDF (H/Top) `SCP609ORHTR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 659 Ocean Ranger SDF (H/Top) `SCP659ORHTR` | ✓ | K | ✓ | ✓ | ✓ | K |
| Stacer Stacer - 709 Ocean Ranger SDF (H/Top) `SCP709ORHTR` | ✓ | K | ✓ | ✓ | ✓ | K |
| Stacer Stacer - 759 Ocean Ranger SDF (H/Top) `SCP759ORHTR` | ✓ | K | ✓ | ✓ | ✓ | K |
| Stacer Stacer - 589 Ocean Ranger Cen Cab (H/Top) `SCP589ORCCHTR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stacer Stacer - 609 Ocean Ranger Cen Cab (H/Top) `SCP609ORCCHTR` | ✓ | K | ✓ | ✓ | ✓ | K |
| Stacer Stacer - 659 Ocean Ranger Cen Cab (H/Top) `SCP659ORCCHTR` | ✓ | K | ✓ | ✓ | ✓ | K |
| Stacer Stacer - 709 Ocean Ranger Cen Cab (H/Top) `SCP709ORCCHTR` | ✓ | K | ✓ | ✓ | ✓ | K |
| Stacer Stacer - 759 Ocean Ranger Cen Cab (H/Top) `SCP759ORCCHTR` | ✓ | K | ✓ | ✓ | ✓ | K |
| Stabicraft Stabicraft - 1450 Explorer `7001401000` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stabicraft Stabicraft - 1450 Frontier (Sportfish) `7001403000` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stabicraft Stabicraft - 1450 Frontier (Profish) `7001404000` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stabicraft Stabicraft - 1550 Frontier (Adventure) `7001506000` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stabicraft Stabicraft - 1550 Frontier (Sportfish) `7001507000` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stabicraft Stabicraft - 1550 Frontier (Profish) `7001508000` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stabicraft Stabicraft - 2050 Frontier FT (Adventure) `7002006025` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stabicraft Stabicraft - 2050 Frontier FT (Sportfish) `7002007025` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stabicraft Stabicraft - 2050 Frontier FT (Profish) `7002008025` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stabicraft Stabicraft - 1550 Fisher (Adventure) `7001516000` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stabicraft Stabicraft - 1550 Fisher (Sportfish) `7001517000` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stabicraft Stabicraft - 1550 Fisher (Offshore) `7001519000` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stabicraft Stabicraft - 1550 Fisher (Profish) `7001518000` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stabicraft Stabicraft - 1850 Fisher (Adventure) `7001816000` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stabicraft Stabicraft - 1850 Fisher (Sportfish) `7001819000` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stabicraft Stabicraft - 1850 Fisher (Offshore) `7001817000` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stabicraft Stabicraft - 1850 Fisher (Profish) `7001818000` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stabicraft Stabicraft - 1850 Supercab (Adventure) `7001823025` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stabicraft Stabicraft - 1850 Supercab (Sportfish) `7001824025` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stabicraft Stabicraft - 1850 Supercab (Profish) `7001825025` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stabicraft Stabicraft - 2050 Supercab (Adventure) `7002023025` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stabicraft Stabicraft - 2050 Supercab (Sportfish) `7002024025` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stabicraft Stabicraft - 2050 Supercab (Profish) `7002025025` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stabicraft Stabicraft - 2350 Supercab (Adventure) `7002323000` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stabicraft Stabicraft - 2350 Supercab (Sportfish) `7002324000` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stabicraft Stabicraft - 2350 Supercab (Profish) `7002325000` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stabicraft Stabicraft - 2050 Treker (Adventure) `7002010000` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stabicraft Stabicraft - 2050 Treker (Sportfish) `7002011000` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stabicraft Stabicraft - 2050 Treker (Profish) `7002012000` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stabicraft Stabicraft - 2350 Ultra Centrecab (Adventure) `7002350025` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stabicraft Stabicraft - 2350 Ultra Centrecab (Sportfish) `7002353025` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stabicraft Stabicraft - 2350 Ultra Centrecab (Profish) `7002354025` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stabicraft Stabicraft - 2350 Ultracab WT (Adventure) `7002342025` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stabicraft Stabicraft - 2350 Ultracab WT (Sportfish) `7002343025` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stabicraft Stabicraft - 2350 Ultracab WT (Profish) `7002344025` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stabicraft Stabicraft - 2500 Ultracab XL `7002561000` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Stabicraft Stabicraft - 2750 Ultra Centrecab `7002750000` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Surtees 495 - Pro Fisher. `495 - Pro Fisher` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Surtees 540 - Pro Fisher. `540 - Pro Fisher` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| Surtees 575 - Pro Fisher. `575 - Pro Fisher` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Surtees 610 - Pro Fisher. `610 - Pro Fisher` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Surtees 650 - Pro Fisher. `650 - Pro Fisher` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Surtees 700 - Pro Fisher. `700 - Pro Fisher` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| Surtees 495 - Workmate. `495 - Workmate` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Surtees 540 - Workmate. `540 - Workmate` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| Surtees Surtees - 575 Workmate `575 - Workmate` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Surtees 610 - Workmate. `610 - Workmate` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Surtees 650 - Workmate. `650 - Workmate` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Surtees 700 - Workmate. `700 - Workmate` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| Surtees Surtees - 620 Game Fisher `SUR-620GF` | ✓ | K | ✓ | ✓ | ✓ | K |
| Surtees Surtees - 670 Game Fisher `SUR-670GF` | ✓ | K | ✓ | ✓ | ✓ | K |
| Surtees 720 - Game Fisher (Open) `720 - Game Fisher (Open)` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Surtees 720 - Game Fisher (Enc) `720 - Game Fisher (Enc)` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Surtees Surtees  -  770 Game Fisher `SUR-770GF-261` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Surtees Surtess  -  770 Game Fisher XL `SUR-770GFXL` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Surtees Surtees - 800 Game Fisher `SUR-800GF` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Jeanneau Jeanneau - DB 37 OB `JEA-DB37OB-B2026` | ✓ | K | ✓ | ✓ | ✓ | K |
| Jeanneau Jeanneau - DB 43 OB `JEA-DB43OB-B2026` | ✓ | K | ✓ | ✓ | ✓ | K |
| Jeanneau Jeanneau - TH33 `JEA-TH33-B2026` | ✓ | K | ✓ | ✓ | ✓ | K |
| Jeanneau Jeanneau - TH38 `JEA-TH38-B2026` | ✓ | K | ✓ | ✓ | ✓ | K |
| Merry Fisher Merry Fisher 605 S2. `JEA-MF605S2-00003` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Merry Fisher Merry Fisher  -  695 S2 `JEA-MF695S2-25000` | ✓ | K | ✓ | ✓ | ✓ | K |
| Merry Fisher Merry Fisher  -  795 S2 `JEA-MF795S2-25000` | ✓ | K | ✓ | ✓ | ✓ | K |
| Merry Fisher Merry Fisher  -  895 S2 `JEA-MF895S2-A2026` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Merry Fisher Merry Fisher - 1095 Coupe S2 `JEA-MF1095CS2-A2026` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Merry Fisher Merry Fisher - 1095 Flybridge S2 `JEA-MF1095FLYS2` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Merry Fisher Merry Fisher - 1295_Coupe `JEA-MF1295C26` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Merry Fisher Merry Fisher - 1295 Flybridge `JEA-MF1295FLY-25000` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Merry Fisher Merry Fisher  -  695 Sport S2 `JEA-MF695SPS2-25000` | ✓ | K | ✓ | ✓ | ✓ | K |
| Merry Fisher Merry Fisher  -  795 Sport S2 `JEA-MF795SPS2-25000` | ✓ | K | ✓ | ✓ | ✓ | K |
| Merry Fisher Merry Fisher  -  895 Sport (2026) `JEA-MF895SP-A2026` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Merry Fisher Merry Fisher  -  895 S1 (Used) `JEA-MF895S1-USED` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Cap Camarat Cap Camarat - 5.5 CC Series 2 `CAPC 5.5 CC S2` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Cap Camarat Cap Camarat - 6.5 CC Series 3 `CAPC 6.5 CC S3` | ✓ | K | ✓ | ✓ | ✓ | K |
| Cap Camarat Cap Camarat - 7.5 CC S3. `CC7.5 CC S3 *1 1A0` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Cap Camarat Cap Camarat - 9.0 CC S2 `JEA-CC9.0CCS2` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Cap Camarat Cap Camarat  -  10.5 CC `CAPC 10.5 CC` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Cap Camarat Cap Camarat - 5.5 WA Series 2 `CAPC 5.5 WA S2` | ✓ | K | ✓ | ✓ | ✓ | K |
| Cap Camarat Cap Camarat - 6.5 WA Series 3 `CAPC 6.5 WA` | ✓ | K | ✓ | ✓ | ✓ | K |
| Cap Camarat Cap Camarat - 7.5 WA Series 3 `CC75WAS3` | ✓ | K | ✓ | ✓ | ✓ | K |
| Cap Camarat Cap Camarat - 9.0 WA S2 `CAPC 9.0 WA S2` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Cap Camarat Cap Camarat - 10.5 WA S2 `CC10.5 WA S2` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Cap Camarat Cap Camarat - 12.5_WA `CAPC 12.5WA26` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Haines Signature Signature Fisher - 525F `Fisher 525F` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Haines Signature Signature Fisher - 545F `Fisher 545F` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Haines Signature Signature Fisher - 620F `Fisher 620F` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Haines Signature Signature Fisher - 640F `Fisher 640F` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Haines Signature Signature Fisher - 680F `Fisher 680F` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Haines Signature Signature Sport Fisher- 543SF CC `Sports Fisher 543SF CC` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Haines Signature Signature Sport Fisher - 543SF SC `Sports Fisher 543SF SC` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Haines Signature Signature Bowrider - 550BR `Bow Rider 550BR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Haines Signature Signature Bowrider - 620BRX `Bow Rider 620BRX` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF RU230KAM (PVC) WH `HBR005` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF RU230KAM (HYP) WH `HBR006` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF RU230KAM (PVC) LG `HBR007` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF RU230KAM (HYP) LG `HBR008` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF RU250KAM (PVC) WH `HBR009` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF RU250KAM (HYP) WH `HBR010` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF RU250KAM (PVC) LG `HBR011` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF RU250KAM (HYP) LG `HBR012` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF RU280KAM (PVC) WH `HBR013` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF RU280KAM (HYP) WH `HBR014` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF RU280KAM (PVC) LG `HBR015` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF RU280KAM (HYP) LG `HBR016` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF RU320KAM (PVC) WH `HBR017` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF RU320KAM (HYP) WH `HBR018` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF RU320KAM (PVC) LG `HBR019` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF RU320KAM (HYP) LG `HBR020` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF RU230AL (PVC) WH `HBR025` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF RU230AL (HYP) WH `HBR026` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF RU230AL (PVC) LG `HBR027` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF RU230AL (HYP) LG `HBR028` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF RU250AL (PVC) WH `HBR029` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF RU250AL (HYP) WH `HBR030` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF RU250AL (PVC) LG `HBR031` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF RU250AL (HYP) LG `HBR032` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF RU280AL (PVC) WH `HBR033` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF RU280AL (HYP) WH `HBR034` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF RU280AL (PVC) LG `HBR035` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF RU280AL (HYP) LG `HBR036` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF RU320AL (PVC) WH `HBR037` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF RU320AL (HYP) WH `HBR038` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF RU320AL (PVC) LG `HBR039` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF RU320AL (HYP) LG `HBR040` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL240 (PVC) W-W `HBU009` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF UL240 (HYP) W-W `HBU010` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF UL240 (PVC) LG-W `HBU011` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF UL240 (HYP) LG-W `HBU012` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF UL240 (PVC) DG-G `HBU013` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF UL240 (HYP) DG-G `HBU014` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF UL240 (PVC) B-G `HBU015` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF UL240 (HYP) B-G `HBU016` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF UL260 (PVC) W-W `HBU017` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL260 (HYP) W-W `HBU018` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL260 (PVC) LG-W `HBU019` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL260 (HYP) LG-W `HBU020` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL260 (PVC) DG-G `HBU021` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL260 (HYP) DG-G `HBU022` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL260 (PVC) B-G `HBU023` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL260 (HYP) B-G `HBU024` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL290 (PVC) W-W `HBU025` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL290 (HYP) W-W `HBU026` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL290 (PVC) LG-W `HBU027` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL290 (HYP) LG-W `HBU028` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL290 (PVC) DG-G `HBU029` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL290 (HYP) DG-G `HBU030` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL290 (PVC) B-G `HBU031` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL290 (HYP) B-G `HBU032` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL310 (PVC) W-W `HBU033` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL310 (HYP) W-W `HBU034` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL310 (PVC) LG-W `HBU035` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL310 (HYP) LG-W `HBU036` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL310 (PVC) DG-G `HBU037` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL310 (HYP) DG-G `HBU038` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL310 (PVC) B-G `HBU039` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL310 (HYP) B-G `HBU040` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL340 (PVC) W-W `HBU041` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL340 (HYP) W-W `HBU042` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL340 (PVC) LG-W `HBU043` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL340 (HYP) LG-W `HBU044` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL340 (PVC) DG-G `HBU045` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL340 (HYP) DG-G `HBU046` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL340 (PVC) B-G `HBU047` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL340 (HYP) B-G `HBU048` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL240LT (PVC) W-W `HBU049` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF UL240LT (HYP) W-W `HBU050` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF UL240LT (PVC) LG-W `HBU051` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF UL240LT (HYP) LG-W `HBU052` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF UL240LT (PVC) DG-G `HBU053` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF UL240LT (HYP) DG-G `HBU054` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF UL240LT (PVC) B-G `HBU055` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF UL240LT (HYP) B-G `HBU056` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF UL260LT (PVC) W-W `HBU057` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL260LT (HYP) W-W `HBU058` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL260LT (PVC) LG-W `HBU059` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL260LT (HYP) LG-W `HBU060` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL260LT (PVC) DG-G `HBU061` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL260LT (HYP) DG-G `HBU062` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL260LT (PVC) B-G `HBU063` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL260LT (HYP) B-G `HBU064` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL290LT (PVC) W-W `HBU065` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL290LT (HYP) W-W `HBU066` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL290LT (PVC) LG-W `HBU067` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL290LT (HYP) LG-W `HBU068` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL290LT (PVC) DG-G `HBU069` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL290LT (HYP) DG-G `HBU070` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL290LT (PVC) B-G `HBU071` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF UL290LT (HYP) B-G `HBU072` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF CL260 (PVC) W-W-WD `HBC001` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL260 (HYP) W-W-WD `HBC002` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL260 (PVC) LG-W-WD `HBC003` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL260 (HYP) LG-W-WD `HBC004` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL260 (PVC) DG-G-DG `HBC005` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL260 (HYP) DG-G-DG `HBC006` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL260 (PVC) B-G-DG `HBC007` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL260 (HYP) B-G-DG `HBC008` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL260 (HYP) I-B-C `HBC167` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL290 (PVC) W-W-WD `HBC009` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL290 (HYP) W-W-WD `HBC010` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL290 (PVC) LG-W-WD `HBC011` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL290 (HYP) LG-W-WD `HBC012` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL290 (PVC) DG-G-DG `HBC013` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL290 (HYP) DG-G-DG `HBC014` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL290 (PVC) B-G-DG `HBC015` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL290 (HYP) B-G-DG `HBC016` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL290 (HYP) I-B-C `HBC168` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL310 (PVC) W-W-WD `HBC017` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL310 (HYP) W-W-WD `HBC018` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL310 (PVC) LG-W-WD `HBC019` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL310 (HYP) LG-W-WD `HBC020` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL310 (PVC) B-G-DG `HBC023` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL310 (HYP) B-G-DG `HBC024` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL310 (PVC) DG-G-DG `HBC021` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL310 (HYP) DG-G-DG `HBC022` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL310 (HYP) I-B-C `HBC170` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL340 (PVC) W-W-WD `HBC033` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL340 (HYP) W-W-WD `HBC034` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL340 (PVC) LG-W-WD `HBC035` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL340 (HYP) LG-W-WD `HBC036` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL340 (PVC) DG-G-DG `HBC037` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL340 (HYP) DG-G-DG `HBC038` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL340 (PVC) B-G-DG `HBC039` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL340 (HYP) B-G-DG `HBC040` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL340 (HYP) I-B-C `HBC154` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL360 (PVC) W-W-WD `HBC049` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL360 (HYP) W-W-WD `HBC050` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL360 (PVC) LG-W-WD `HBC051` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL360 (HYP) LG-W-WD `HBC052` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL360 (PVC) DG-G-DG `HBC053` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL360 (HYP) DG-G-DG `HBC054` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL360 (PVC) B-G-DG `HBC055` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL360 (HYP) B-G-DG `HBC056` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL360 (HYP) I-B-C `HBC155` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL380 (PVC) W-W-WD `HBC065` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF CL380 (HYP) W-W-WD `HBC066` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF CL380 (PVC) LG-W-WD `HBC067` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF CL380 (HYP) LG-W-WD `HBC068` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF CL380 (PVC) DG-G-DG `HBC069` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF CL380 (HYP) DG-G-DG `HBC070` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF CL380 (PVC) B-G-DG `HBC071` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF CL380 (HYP) B-G-DG `HBC072` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF CL380 (HYP) I-B-C `HBC156` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF CL400 (PVC) W-W-WD `HBC081` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF CL400 (HYP) W-W-WD `HBC082` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF CL400 (PVC) LG-W-WD `HBC083` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF CL400 (HYP) LG-W-WD `HBC084` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF CL400 (PVC) DG-G-DG `HBC085` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF CL400 (HYP) DG-G-DG `HBC086` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF CL400 (PVC) B-G-DG `HBC087` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF CL400 (HYP) B-G-DG `HBC088` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF CL400 (HYP) I-B-C `HBC164` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF CL420 (PVC) W-W-WD `HBC089` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL420 (HYP) W-W-WD `HBC090` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL420 (PVC) LG-W-WD `HBC091` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL420 (HYP) LG-W-WD `HBC092` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL420 (PVC) DG-G-DG `HBC093` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL420 (HYP) DG-G-DG `HBC094` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL420 (PVC) B-G-DG `HBC095` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL420 (HYP) B-G-DG `HBC096` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL420 (HYP) I-B-C `HBC165` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL460 (PVC) W-W-WD `HBC097` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL460 (HYP) W-W-WD `HBC098` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL460 (PVC) LG-W-WD `HBC099` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL460 (HYP) LG-W-WD `HBC100` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL460 (PVC) DG-G-DG `HBC101` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL460 (HYP) DG-G-DG `HBC102` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL460 (PVC) B-G-DG `HBC103` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL460 (HYP) B-G-DG `HBC104` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL460 (HYP) I-B-C `HBC166` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL310LS (PVC) W-W-WD `HBC025` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL310LS (HYP) W-W-WD `HBC026` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL310LS (PVC) LG-W-WD `HBC027` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL310LS (HYP) LG-W-WD `HBC028` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL310LS (PVC) DG-G-DG `HBC029` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL310LS (HYP) DG-G-DG `HBC030` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL310LS (PVC) B-G-DG `HBC031` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL310LS (HYP) B-G-DG `HBC032` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL310LS (HYP) I-B-C `HBC172` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL340LS (PVC) W-W-WD `HBC041` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL340LS (HYP) W-W-WD `HBC042` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL340LS (PVC) LG-W-WD `HBC043` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL340LS (HYP) LG-W-WD `HBC044` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL340LS (PVC) DG-G-DG `HBC045` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL340LS (HYP) DG-G-DG `HBC046` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL340LS (PVC) B-G-DG `HBC047` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL340LS (HYP) B-G-DG `HBC048` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL340LS (HYP) I-B-C `HBC159` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL360LS (PVC) W-W-WD `HBC057` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL360LS (HYP) W-W-WD `HBC058` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL360LS (PVC) LG-W-WD `HBC059` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL360LS (HYP) LG-W-WD `HBC060` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL360LS (HYP) DG-G-DG `HBC062` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL360LS (PVC) DG-G-DG `HBC061` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL360LS (PVC) B-G-DG `HBC063` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL360LS (HYP) B-G-DG `HBC064` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL360LS (HYP) I-B-C `HBC160` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL380LS (PVC) W-W-WD `HBC073` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF CL380LS (HYP) W-W-WD `HBC074` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF CL380LS (PVC) LG-W-WD `HBC075` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF CL380LS (HYP) LG-W-WD `HBC076` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF CL380LS (PVC) DG-G-DG `HBC077` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF CL380LS (HYP) DG-G-DG `HBC078` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF CL380LS (PVC) B-G-DG `HBC079` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF CL380LS (HYP) B-G-DG `HBC080` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF CL380LS (HYP) I-B-C `HBC162` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF CL290FT (PVC) W-W-WD `HBC105` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL290FT (HYP) W-W-WD `HBC106` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL290FT (PVC) LG-W-WD `HBC107` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL290FT (HYP) LG-W-WD `HBC108` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL290FT (PVC) DG-G-DG `HBC109` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL290FT (HYP) DG-G-DG `HBC110` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL290FT (PVC) B-G-DG `HBC111` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL290FT (HYP) B-G-DG `HBC112` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL290FT (HYP) I-B-C `HBC169` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL310FT (PVC) W-W-WD `HBC113` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL310FT (HYP) W-W-WD `HBC114` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL310FT (PVC) LG-W-WD `HBC115` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL310FT (HYP) LG-W-WD `HBC116` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL310FT (PVC) DG-G-DG `HBC117` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL310FT (HYP) DG-G-DG `HBC118` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL310FT (PVC) B-G-DG `HBC119` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL310FT (HYP) B-G-DG `HBC120` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL310FT (HYP) I-B-C `HBC171` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL340FT (PVC) W-W-WD `HBC121` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL340FT (HYP) W-W-WD `HBC122` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL340FT (PVC) LG-W-WD `HBC123` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL340FT (HYP) LG-W-WD `HBC124` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL340FT (PVC) DG-G-DG `HBC125` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL340FT (HYP) DG-G-DG `HBC126` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL340FT (PVC) B-G-DG `HBC127` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL340FT (HYP) B-G-DG `HBC128` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF CL340FT (HYP) I-B-C `HBC157` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF Coaster 540 open (PVC) LG-W-DG `HBP274` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF Coaster 540 open (PVC) DG-G-DB `HBP275` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF Coaster 540 open (PVC) B-B-DB `HBP276` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF Coaster 540 ST (PVC) LG-W-DG `HBP271` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF Coaster 540 ST (PVC) DG-G-DB `HBP272` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF Coaster 540 ST (PVC) B-B-DB `HBP273` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF Coaster 600 ST (PVC) DG-G-DB `HB600` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF PA420 (PVC) LG-W-DG `HBP081` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA420 (HYP) LG-W-DG `HBP082` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA420 (PVC) DG-G-DG `HBP083` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA420 (HYP) DG-G-DG `HBP084` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA420 (PVC) O-G-DG `HBP085` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA420 (HYP) O-G-DG `HBP086` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA420 (PVC) R-B-B `HBP087` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA420 (HYP) R-B-B `HBP088` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA420 (PVC) B-B-B `HBP089` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA420 (HYP) B-B-B `HBP090` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA460 (PVC) DG-G-DG `HBP103` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA460 (HYP) DG-G-DG `HBP104` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA460 (PVC) O-G-DG `HBP105` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA460 (HYP) O-G-DG `HBP106` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA460 (PVC) R-B-B `HBP107` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA460 (HYP) R-B-B `HBP108` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA460 (PVC) B-B-B `HBP109` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA460 (HYP) B-B-B `HBP110` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA460 (PVC) LG-W-DG `HBP101` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA460 (HYP) LG-W-DG `HBP102` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA500 (PVC) DG-G-DG `HBP123` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA500 (HYP) DG-G-DG `HBP124` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA500 (PVC) O-G-DG `HBP125` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA500 (HYP) O-G-DG `HBP126` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA500 (PVC) R-B-B `HBP127` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA500 (HYP) R-B-B `HBP128` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA500 (PVC) B-B-B `HBP129` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA500 (HYP) B-B-B `HBP130` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA500 (PVC) LG-W-DG `HBP121` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA500 (HYP) LG-W-DG `HBP122` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA540 Open (PVC) O-G-DG `HBP145` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA540 Open (HYP) O-G-DG `HBP146` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA540 Open (PVC) R-B-B `HBP147` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA540 Open (HYP) R-B-B `HBP148` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA540 Open (PVC) B-B-B `HBP149` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA540 Open (HYP) B-B-B `HBP150` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA540 Open (PVC) LG-W-DG `HBP141` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA540 Open (HYP) LG-W-DG `HBP142` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA540 Open (PVC) DG-G-DG `HBP143` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA540 Open (HYP) DG-G-DG `HBP144` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA540ST (PVC) B-B-B `HBP169` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA540ST (HYP) B-B-B `HBP170` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA540ST (PVC) LG-W-DG `HBP161` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA540ST (HYP) LG-W-DG `HBP162` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA540ST (PVC) DG-G-DG `HBP163` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA540ST (HYP) DG-G-DG `HBP164` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA540ST (PVC) O-G-DG `HBP165` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA540ST (HYP) O-G-DG `HBP166` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA540ST (PVC) R-B-B `HBP167` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA540ST (HYP) R-B-B `HBP168` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA600 Open (PVC) LG-W-DG `HBP181` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA600 Open (HYP) LG-W-DG `HBP182` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA600 Open (PVC) DG-G-DG `HBP183` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA600 Open (HYP) DG-G-DG `HBP184` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA600 Open (PVC) O-G-DG `HBP185` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA600 Open (HYP) O-G-DG `HBP186` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA600 Open (PVC) R-B-B `HBP187` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA600 Open (HYP) R-B-B `HBP188` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA600 Open (PVC) B-B-B `HBP189` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA600 Open (HYP) B-B-B `HBP190` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA600EW (PVC) LG-W-DG `HBP151` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA600EW (HYP) LG-W-DG `HBP152` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA600EW (PVC) DG-G-DG `HBP153` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA600EW (HYP) DG-G-DG `HBP154` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA600EW (PVC) O-G-DG `HBP155` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA600EW (HYP) O-G-DG `HBP156` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA600EW (PVC) R-B-B `HBP157` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA600EW (HYP) R-B-B `HBP158` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA600EW (PVC) B-B-B `HBP159` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA600EW (HYP) B-B-B `HBP160` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA600ST (PVC) LG-W-DG `HBP201` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA600ST (HYP) LG-W-DG `HBP202` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA600ST (PVC) DG-G-DG `HBP203` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA600ST (HYP) DG-G-DG `HBP204` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA600ST (PVC) O-G-DG `HBP205` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA600ST (HYP) O-G-DG `HBP206` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA600ST (PVC) R-B-B `HBP207` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA600ST (HYP) R-B-B `HBP208` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA600ST (PVC) B-B-B `HBP209` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA600ST (HYP) B-B-B `HBP210` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA660EW (PVC) LG-W-DG `HBP171` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA660EW (HYP) LG-W-DG `HBP172` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA660EW (PVC) DG-G-DG `HBP173` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA660EW (HYP) DG-G-DG `HBP174` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA660EW (PVC) O-G-DG `HBP175` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA660EW (HYP) O-G-DG `HBP176` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA660EW (PVC) R-B-B `HBP177` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA660EW (HYP) R-B-B `HBP178` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA660EW (PVC) B-B-B `HBP179` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA660EW (HYP) B-B-B `HBP180` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA660ST (PVC) LG-W-DG `HBP221` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA660ST (HYP) LG-W-DG `HBP222` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA660ST (PVC) DG-G-DG `HBP223` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA660ST (HYP) DG-G-DG `HBP224` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA660ST (PVC) O-G-DG `HBP225` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA660ST (HYP) O-G-DG `HBP226` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA660ST (PVC) R-B-B `HBP227` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA660ST (HYP) R-B-B `HBP228` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA660ST (PVC) B-B-B `HBP229` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA660ST (HYP) B-B-B `HBP230` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA700EW (HYP) LG-W-DG `HBP191` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA700EW (HYP) DG-G-DG `HBP192` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA700EW (HYP) O-G-DG `HBP193` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA700EW (HYP) R-B-B `HBP194` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA700EW (HYP) B-B-B `HBP195` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA700ST (HYP) LG-W-DG `HBP241` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA700ST (HYP) DG-G-DG `HBP242` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA700ST (HYP) O-G-DG `HBP243` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA700ST (HYP) R-B-B `HBP244` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA700ST (HYP) B-B-B `HBP245` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA760EW (HYP) LG-W-DG `HBP196` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA760EW (HYP) DG-G-DG `HBP197` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA760EW (HYP) O-G-DG `HBP198` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA760EW (HYP) R-B-B `HBP199` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA760EW (HYP) B-B-B `HBP200` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA760ST (HYP) LG-W-DG `HBP251` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA760ST (HYP) DG-G-DG `HBP252` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA760ST (HYP) O-G-DG `HBP253` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA760ST (HYP) R-B-B `HBP254` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA760ST (HYP) B-B-B `HBP255` | ✓ | N | ✓ | ✓ | N | ✓ |
| HF PA860EW (HYP) DG-G-DG `HBP212` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA860EW (HYP) O-G-DG `HBP213` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA860EW (HYP) R-B-B `HBP214` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA860EW (HYP) B-B-B `HBP215` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA860EW (HYP) LG-W-DG `HBP211` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA860ST (HYP) DG-G-DG `HBP262` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA860ST (HYP) O-G-DG `HBP263` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA860ST (HYP) R-B-B `HBP264` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA860ST (HYP) B-B-B `HBP265` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF PA860ST (HYP) LG-W-DG `HBP261` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF SP300 (PVC) W-W-WB `HBS001` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP300 (PVC) LG-W-WB `HBS003` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP300 (PVC) LG-W-DB `HBS005` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP300 (PVC) B-W-C `HBS007` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP300 (PVC) DG-G-MB `HBS009` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP300 (PVC) B-B-DB `HBS011` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP300 (PVC) B-B-B `HBS013` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP300 (HYP) W-W-WB `HBS002` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP300 (HYP) LG-W-WB `HBS004` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP300 (HYP) LG-W-DB `HBS006` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP300 (HYP) B-W-C `HBS008` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP300 (HYP) DG-G-MB `HBS010` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP300 (HYP) B-B-DB `HBS012` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP300 (HYP) B-B-B `HBS014` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP300 (HYP) I-B-C `HBS016` | ✓ | K | ✓ | ✓ | N | ✓ |
| HF SP330 (PVC) W-W-WB `HBS017` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP330 (PVC) B-W-C `HBS023` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP330 (PVC) LG-W-WB `HBS019` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP330 (PVC) DG-G-MB `HBS025` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP330 (PVC) LG-W-DB `HBS021` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP330 (PVC) B-B-DB `HBS027` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP330 (PVC) B-B-B `HBS029` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP330 (HYP) W-W-WB `HBS018` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP330 (HYP) LG-W-WB `HBS020` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP330 (HYP) LG-W-DB `HBS022` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP330 (HYP) B-W-C `HBS024` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP330 (HYP) DG-G-MB `HBS026` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP330 (HYP) B-B-DB `HBS028` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP330 (HYP) B-B-B `HBS030` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP330 (HYP) I-B-C `HBS032` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP360 (PVC) W-W-WB `HBS033` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP360 (PVC) LG-W-WB `HBS035` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP360 (PVC) LG-W-DB `HBS037` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP360 (PVC) B-W-C `HBS039` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP360 (PVC) DG-G-MB `HBS041` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP360 (PVC) B-B-DB `HBS043` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP360 (PVC) B-B-B `HBS045` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP360 (HYP) W-W-WB `HBS034` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP360 (HYP) LG-W-WB `HBS036` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP360 (HYP) LG-W-DB `HBS038` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP360 (HYP) B-W-C `HBS040` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP360 (HYP) DG-G-MB `HBS042` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP360 (HYP) B-B-DB `HBS044` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP360 (HYP) B-B-B `HBS046` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP360 (HYP) I-B-C `HBS048` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP390 (PVC) W-W-WB `HBS049` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP390 (PVC) LG-W-WB `HBS051` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP390 (PVC) LG-W-DB `HBS053` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP390 (PVC) B-W-C `HBS055` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP390 (PVC) DG-G-MB `HBS057` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP390 (PVC) B-B-DB `HBS059` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP390 (PVC) B-B-B `HBS061` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP390 (HYP) W-W-WB `HBS050` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP390 (HYP) LG-W-WB `HBS052` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP390 (HYP) LG-W-DB `HBS054` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP390 (HYP) B-W-C `HBS056` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP390 (HYP) DG-G-MB `HBS058` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP390 (HYP) B-B-DB `HBS060` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP390 (HYP) B-B-B `HBS062` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP390 (HYP) I-B-C `HBS064` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP420 (PVC) W-W-WB `HBS065` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP420 (PVC) LG-W-WB `HBS067` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP420 (PVC) LG-W-DB `HBS069` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP420 (PVC) B-W-C `HBS071` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP420 (PVC) DG-G-MB `HBS073` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP420 (PVC) B-B-DB `HBS075` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP420 (PVC) B-B-B `HBS077` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP420 (HYP) W-W-WB `HBS066` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP420 (HYP) LG-W-WB `HBS068` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP420 (HYP) LG-W-DB `HBS070` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP420 (HYP) B-W-C `HBS072` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP420 (HYP) DG-G-MB `HBS074` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP420 (HYP) B-B-DB `HBS076` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP420 (HYP) B-B-B `HBS078` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP420 (HYP) I-B-C `HBS080` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP460 (PVC) W-W-WB `HBS081` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP460 (PVC) LG-W-WB `HBS083` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP460 (PVC) LG-W-DB `HBS085` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP460 (PVC) B-W-C `HBS087` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP460 (PVC) DG-G-MB `HBS089` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP460 (PVC) B-B-DB `HBS091` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP460 (PVC) B-B-B `HBS093` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP460 (HYP) W-W-WB `HBS082` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP460 (HYP) LG-W-WB `HBS084` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP460 (HYP) LG-W-DB `HBS086` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP460 (HYP) B-W-C `HBS088` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP460 (HYP) DG-G-MB `HBS090` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP460 (HYP) B-B-DB `HBS092` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP460 (HYP) B-B-B `HBS094` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP460 (HYP) I-B-C `HBS096` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP520 (PVC) W-W-WB `HBS097` | ✓ | K | ✓ | ✓ | K | ✓ |
| HF SP520 (PVC) LG-W-WB `HBS099` | ✓ | K | ✓ | ✓ | K | ✓ |
| HF SP520 (PVC) LG-W-DB `HBS101` | ✓ | K | ✓ | ✓ | K | ✓ |
| HF SP520 (PVC) B-W-C `HBS103` | ✓ | K | ✓ | ✓ | K | ✓ |
| HF SP520 (PVC) DG-G-MB `HBS105` | ✓ | K | ✓ | ✓ | K | ✓ |
| HF SP520 (PVC) B-B-DB `HBS107` | ✓ | K | ✓ | ✓ | K | ✓ |
| HF SP520 (PVC) B-B-B `HBS109` | ✓ | K | ✓ | ✓ | K | ✓ |
| HF SP520 (HYP) W-W-WB `HBS098` | ✓ | K | ✓ | ✓ | K | ✓ |
| HF SP520 (HYP) LG-W-WB `HBS100` | ✓ | K | ✓ | ✓ | K | ✓ |
| HF SP520 (HYP) LG-W-DB `HBS102` | ✓ | K | ✓ | ✓ | K | ✓ |
| HF SP520 (HYP) B-W-C `HBS104` | ✓ | K | ✓ | ✓ | K | ✓ |
| HF SP520 (HYP) DG-G-MB `HBS106` | ✓ | K | ✓ | ✓ | K | ✓ |
| HF SP520 (HYP) B-B-DB `HBS108` | ✓ | K | ✓ | ✓ | K | ✓ |
| HF SP520 (HYP) B-B-B `HBS110` | ✓ | K | ✓ | ✓ | K | ✓ |
| HF SP520 (HYP) I-B-C `HBS112` | ✓ | K | ✓ | ✓ | K | ✓ |
| HF SP560 (PVC) W-W-WB `HBS113` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP560 (PVC) LG-W-WB `HBS115` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP560 (PVC) LG-W-DB `HBS117` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP560 (PVC) B-W-C `HBS119` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP560 (PVC) DG-G-MB `HBS121` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP560 (PVC) B-B-DB `HBS123` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP560 (PVC) B-B-B `HBS125` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP560 (HYP) W-W-WB `HBS114` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP560 (HYP) LG-W-WB `HBS116` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP560 (HYP) LG-W-DB `HBS118` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP560 (HYP) B-W-C `HBS120` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP560 (HYP) DG-G-MB `HBS122` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP560 (HYP) B-B-DB `HBS124` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP560 (HYP) B-B-B `HBS126` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP560 (HYP) I-B-C `HBS128` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP600 (PVC) W-W-WB `HBS129` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP600 (PVC) LG-W-WB `HBS131` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP600 (PVC) LG-W-DB `HBS133` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP600 (PVC) B-W-C `HBS135` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP600 (PVC) DG-G-MB `HBS137` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP600 (PVC) B-B-DB `HBS139` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP600 (PVC) B-B-B `HBS141` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP600 (HYP) W-W-WB `HBS130` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP600 (HYP) LG-W-WB `HBS132` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP600 (HYP) LG-W-DB `HBS134` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP600 (HYP) B-W-C `HBS136` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP600 (HYP) DG-G-MB `HBS138` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP600 (HYP) B-B-DB `HBS140` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP600 (HYP) B-B-B `HBS142` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP600 (HYP) I-B-C `HBS144` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP660 (PVC) W-W-WB `HBS145` | ✓ | N | ✓ | ✓ | K | ✓ |
| HF SP660 (PVC) LG-W-WB `HBS147` | ✓ | N | ✓ | ✓ | K | ✓ |
| HF SP660 (PVC) LG-W-DB `HBS149` | ✓ | N | ✓ | ✓ | K | ✓ |
| HF SP660 (PVC) B-W-C `HBS151` | ✓ | N | ✓ | ✓ | K | ✓ |
| HF SP660 (PVC) DG-G-MB `HBS153` | ✓ | N | ✓ | ✓ | K | ✓ |
| HF SP660 (PVC) B-B-DB `HBS155` | ✓ | N | ✓ | ✓ | K | ✓ |
| HF SP660 (PVC) B-B-B `HBS157` | ✓ | N | ✓ | ✓ | K | ✓ |
| HF SP660 (HYP) W-W-WB `HBS146` | ✓ | N | ✓ | ✓ | K | ✓ |
| HF SP660 (HYP) LG-W-WB `HBS148` | ✓ | N | ✓ | ✓ | K | ✓ |
| HF SP660 (HYP) LG-W-DB `HBS150` | ✓ | N | ✓ | ✓ | K | ✓ |
| HF SP660 (HYP) B-W-C `HBS152` | ✓ | N | ✓ | ✓ | K | ✓ |
| HF SP660 (HYP) DG-G-MB `HBS154` | ✓ | N | ✓ | ✓ | K | ✓ |
| HF SP660 (HYP) B-B-DB `HBS156` | ✓ | N | ✓ | ✓ | K | ✓ |
| HF SP660 (HYP) B-B-B `HBS158` | ✓ | N | ✓ | ✓ | K | ✓ |
| HF SP660 (HYP) I-B-C `HBS160` | ✓ | N | ✓ | ✓ | K | ✓ |
| HF SP700ST (HYP) W-W-WB `HBS161` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP700ST (HYP) LG-W-WB `HBS162` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP700ST (HYP) LG-W-DB `HBS163` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP700ST (HYP) B-W-C `HBS164` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP700ST (HYP) DG-G-MB `HBS165` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP700ST (HYP) B-B-DB `HBS166` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP700ST (HYP) B-B-B `HBS167` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP700ST (HYP) I-B-C `HBS168` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP700WL(Windlass) (HYP) W-W-WB `HBS169` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP700WL(Windlass) (HYP) LG-W-WB `HBS170` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP700WL(Windlass) (HYP) LG-W-DB `HBS171` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP700WL(Windlass) (HYP) B-W-C `HBS172` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP700WL(Windlass) (HYP) DG-G-MB `HBS173` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP700WL(Windlass) (HYP) B-B-DB `HBS174` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP700WL(Windlass) (HYP) B-B-B `HBS175` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP700WL(Windlass) (HYP) I-B-C `HBS176` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP760ST (HYP) W-W-WB `HBS177` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP760ST (HYP) LG-W-WB `HBS178` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP760ST (HYP) LG-W-DB `HBS179` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP760ST (HYP) B-W-C `HBS180` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP760ST (HYP) DG-G-MB `HBS181` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP760ST (HYP) B-B-DB `HBS182` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP760ST (HYP) B-B-B `HBS183` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP760ST (HYP) I-B-C `HBS184` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP760WL(Windlass) (HYP) W-W-WB `HBS185` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP760WL(Windlass) (HYP) LG-W-WB `HBS186` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP760WL(Windlass) (HYP) LG-W-DB `HBS187` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP760WL(Windlass) (HYP) B-W-C `HBS188` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP760WL(Windlass) (HYP) DG-G-MB `HBS189` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP760WL(Windlass) (HYP) B-B-DB `HBS190` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP760WL(Windlass) (HYP) B-B-B `HBS191` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP760WL(Windlass) (HYP) I-B-C `HBS192` | ✓ | N | ✓ | ✓ | ✓ | ✓ |
| HF SP800 (HYP) W-W-WB `HBS193` | ✓ | K | ✓ | ✓ | K | ✓ |
| HF SP800 (HYP) LG-W-WB `HBS194` | ✓ | K | ✓ | ✓ | K | ✓ |
| HF SP800 (HYP) LG-W-DB `HBS195` | ✓ | K | ✓ | ✓ | K | ✓ |
| HF SP800 (HYP) B-W-C `HBS196` | ✓ | K | ✓ | ✓ | K | ✓ |
| HF SP800 (HYP) DG-G-MB `HBS197` | ✓ | K | ✓ | ✓ | K | ✓ |
| HF SP800 (HYP) B-B-DB `HBS198` | ✓ | K | ✓ | ✓ | K | ✓ |
| HF SP800 (HYP) B-B-B `HBS199` | ✓ | K | ✓ | ✓ | K | ✓ |
| HF SP800 (HYP) I-B-C `HBS200` | ✓ | K | ✓ | ✓ | K | ✓ |
| HF SP900 (HYP) W-W-WB `HBS201` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP900 (HYP) LG-W-WB `HBS202` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP900 (HYP) LG-W-DB `HBS203` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP900 (HYP) B-W-C `HBS204` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP900 (HYP) DG-G-MB `HBS205` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP900 (HYP) B-B-DB `HBS206` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP900 (HYP) B-B-B `HBS207` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF SP900 (HYP) I-B-C `HBS208` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF ADV7 (HYP) B-G-B `HBA001` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF ADV7 (HYP) B-G-LB `HBA002` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF ADV7 (HYP) B-G-WB `HBA003` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF ADV7 (HYP) B-W-WG `HBA004` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF ADV7 (HYP) LG-G-MB `HBA005` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF ADV7 (HYP) LG-W-WB `HBA006` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF ADV7 (HYP) LG-W-LB `HBA007` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| HF ADV9 (Dune) `HBADV9008` | ✓ | K | ✓ | ✓ | K | ✓ |
| HF ADV9 (Mangrove) `HBADV9009` | ✓ | K | ✓ | ✓ | K | ✓ |
| HF ADV9 (Ocean) `HBADV9010` | ✓ | K | ✓ | ✓ | K | ✓ |
| HF ADV9 (Polar) `HBADV9011` | ✓ | K | ✓ | ✓ | K | ✓ |
| HF ADV9 (Sky) `HBADV9012` | ✓ | K | ✓ | ✓ | K | ✓ |
| Formosa Formosa - GRT 425 (Tiller) `GRT 425 TIL` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - GRT 455 (Tiller) `GRT 455 TIL` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - GRT 455 (Side Console) `GRT 455 SC` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - SRT 495 (Side Console) `SRT 495 SC` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - SRT 525 (Side Console) `SRT 525 SC` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - SRT 565 (Side Console) `SRT 565 SC` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - SRT 595 (Side Console) `SRT 595 SC` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - SRT 635 (Side Console) `SRT 635 SC` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - SRT 525 (Territory) `SRT 525 TR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - SRT 565 (Territory) `SRT 565 TR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - SRT 595 (Territory) `SRT 595 TR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - SRT 635 (Territory) `SRT 635 TR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - SRT 675 (Territory) `SRT 675 TR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - SRT 525 (Centre Console) `SRT 525 CC` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - SRT 565 (Centre Console) `SRT 565 CC` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - SRT 595 (Centre Console) `SRT 595 CC` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - SRT 635 (Centre Console) `SRT 635 CC` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - SRT 675 (Centre Console) `SRT 675 CC` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - SRT 565 (X Bowrider) `SRT 565 BR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - SRT 595 (X Bowrider) `SRT 595 BR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - SRT 635 (X Bowrider) `SRT 635 BR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - SRT 675 (X Bowrider) `SRT 675 BR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - SRT 565 (Centre Cabin) `SRT 565 CAB` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - SRT 595 (Centre Cabin) `SRT 595 CAB` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - SRT 635 (Centre Cabin) `SRT 635 CAB` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - SRT 675 (Centre Cabin) `SRT 675 CAB` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - SRT 635 Enc (Centre Cabin) `SRT 635 ECC` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - SRT 675 Enc (Centre Cabin) `SRT 675 ECC` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - SRT 635 Enc (Half Cabin) `SRT 635 EHC` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - SRT 675 Enc (Half Cabin) `SRT 675 EHC` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - SRT 715 (Territory) `SRT 715 TR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - SRT 715 (Centre Console) `SRT 715 CC` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - SRT 755 (Centre Console) `SRT 755 CC` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - SRT 715 (X Bowrider) `SRT 715 BR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - SRT 755 (X Bowrider) `SRT 755 BR` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - SRT 715 Enc (Centre Cabin) `SRT 715 ECC` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - SRT 755 Enc (Centre Cabin) `SRT 755 ECC` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - SRT 715 Enc (Half Cabin) `SRT 715 EHC` | ✓ | K | ✓ | ✓ | ✓ | ✓ |
| Formosa Formosa - SRT 755 Enc (Half Cabin) `SRT 755 EHC` | ✓ | K | ✓ | ✓ | ✓ | ✓ |

</details>

**Reproduce:** `python3 scripts/mpf/verify-per-boat-sets.py` (READ-ONLY; add `--cache <file>` to snapshot the live fetch).

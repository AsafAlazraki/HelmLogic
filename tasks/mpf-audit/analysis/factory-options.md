# Factory Options Module.xlsx — Evidence-Grade Analysis

**File**: `tasks/mpf-source/Factory Options Module.xlsx` (5.9 MB) · 4 sheets · analyzed 2026-07-03 with openpyxl 3.1.5 `read_only=True, data_only=True` (strictly no writes).
**Companion evidence**: `motor-trailer-fo.evidence.json` in this directory.

---

## Sheet inventory & real extents

| Sheet | State | Declared max row | Real extent | Purpose |
|---|---|---|---|---|
| Factory Options Module | visible | 25,150 | last non-empty row **25,102**; 25,000 non-empty rows; **19,171 option rows carrying a code**; **706 boat-model sections** | Master per-boat-model factory-options price list, all brands |
| Dropdowns | hidden | 2,206 | **2,206** — ⚠️ contains a **>200-row data island gap** (col S: rows 1–768 labour-estimate ops, then rows 769–2,206 electronic-install ops; col AA rows 1–768 per-model bimini list) | Option-description lookup lists |
| Stabicraft | hidden | 1 | **EMPTY (A1:A1)** — vestigial per-brand source sheet, cleared when Stabicraft re-keyed (see headline anomaly) | — |
| Stacer | hidden | 753 | 753 rows; 596 Stacer option rows | Per-brand source list, same layout as the main sheet, flat MU 0.291 |

## Main-sheet structure (how 25k rows are organized)

- **Row 1 = headers**: `C NSM Code · D Description · E Factory Code · F Matrix · G Base Price · H Misc · I CTD · J MU · K GP · L Sell · N Service Operation · O Image Link` (+ unheaded calc col P).
- **Per-brand banners in col C** (`STACER FACTORY OPTIONS`, …) with localized sub-headers (`Landed CTD`, `MU %`).
- **Col A = boat-model section header** (706 of them: `309 Skimma` … `SRT 675 EHC`). Under each header:
  - **Row 1 of the section = the hull itself** (NSM code + base price + sell, e.g. `SP309S2SP  309 Skimma  $1,367 → sell $1,840`; for Merry Fisher the hull row is `JEA-MF605S2-00003  Merry Fisher 605 S2  €22,391.60 → $53,880`).
  - Following rows = **that model's available factory options**; `.` rows are separators. So the file is *per-boat-model option lists*, not a flat option catalog — the same option code (e.g. `VWRAP01`) repeats under every model it applies to, sometimes with different prices.
- **`OBSOLETE OPTIONS` meta-section starts row 19,068** — the last ~6,000 rows are retired options, still code-addressable.

### Matrix (brand) row counts

Stacer 3,821 · Stabicraft 3,070 · Merry Fisher 2,744 · Haines Signature 1,815 · Formosa 1,792 · Surtees 1,548 · Highfield Inflatables 1,428 · Mackay Trailers 96 · Redco/Tinka Trailers 82 · GFab 27 · Dunbier Trailers 46 (+8 rows of literal `Matrix`/`MATRIX` header noise; ~2,600 code rows have an **empty Matrix cell** — brand only inferable from the section banner above).

**Note**: trailer-brand factory options live in this module too, duplicating the Factory Option quads inside `Trailer Module.xlsx` — two candidate sources of truth for trailer options.

## Option codes & keys

- **Natural key = col C `NSM Code`** (== col E `Factory Code` for most brands). Per-brand formats: Stacer mnemonics (`BIM35PL`), Stabicraft **10-digit numeric** (`7552323012`), Highfield `HIG-{range}-{seq}` (`HIG-ADV9-0101`), Jeanneau/Merry Fisher `JEA-MF605S2-{seq}`, Stacer SE bundles `SEOL429SC-{nn}`, obsolete Stabicraft legacy `STB-2100SC.101` (dot) and `STB-2350SCADV-101` (hyphen).
- Because options repeat per model section, **(model section, NSM Code) is the true composite key**, not NSM Code alone.

## Pricing & currency

- Chain: `G Base Price (+ H Misc: Ex Rate / WS Charges) → I CTD → J MU → K GP → L Sell` (Sell rounded to nearest $10).
- **Currency is per-brand, embedded in the math, not labelled per-row**:
  - **Highfield: Base Price is USD** — observed `CTD = USD / 0.70` (5,780 → 8,257.14); matches HelmLogic's USD-vendor + org exchange-rate model.
  - **Merry Fisher / Jeanneau: Base Price is EUR** — observed `CTD = EUR × 1.75` (22,391.60 → 39,185.30); banner `B2026 Base w 1.5% Load (Euro)`.
  - All other brands AUD. Header remnants `USD`, `Dealer Price` appear as stray strings in G.
- **Sell column semantics** (string values): numeric = paid option; **`Std` (142 rows) = standard inclusion**; **`Bundle` (347 rows) = only purchasable inside a pack** (e.g. Stacer SE `SEOL429SC-xx` members); `POA` (1); `0`/`$ -` = no-charge; **`#N/A` (33) / `#VALUE!` (5) = stale cached formula errors**. Base Price adds 155 `#N/A` + `TBC`/`-` strings.

## Standard inclusions vs paid options

Paid options carry a numeric Sell. Standard inclusions appear two ways: (1) `Sell = Std` rows here; (2) the **Boat Module's own `STANDARD FACTORY INCLUSIONS - 01..NN` columns** (free-text descriptions, no codes) — the Boat Module is the operative source for what shows on a proposal as standard; this module's `Std` rows are the pricing-side mirror. Bundles: `Bundle` rows are members whose price is inside a pack row (e.g. `COMFORT PACK`).

## How the Boat Module's "Factory Options - NN" columns relate (HEADLINE FINDING)

- Boat Module has **`Factory Options - 01..150`** (+ `Additional Factory Options`) storing FO **codes**, `.` for empty slots. ⚠️ Header `Factory Options - MU` (a 29% markup cell) shares the prefix — column harvesting must anchor on trailing digits.
- **Resolution check** (Boat Module refs joined against this module's col C, active vs OBSOLETE sections):

| Boat (Boat Module row) | refs | resolve in ACTIVE section | resolve ONLY in OBSOLETE | missing |
|---|---|---|---|---|
| 2350 - Supercab Adventure (r1814, verified in live xlsx) | 73 | **12** | **61** | 0 |
| 2350 - Supercab Sportfish | 57 | **0** | **57** | 0 |
| 2050 - Treker (Adventure) | 51 | **0** | **50** | 1 (`STB-2050TREAD-219`) |

- Interpretation: the FO Module **re-keyed Stabicraft options to 10-digit factory codes** in its active sections (e.g. section `2350 Supercab (Adv)` rows 7165+, all numeric codes) and moved the old `STB-…` keyed rows into `OBSOLETE OPTIONS`; the **Boat Module was only partially migrated** and still points overwhelmingly at obsolete-section rows. The empty hidden `Stabicraft` sheet is the vestige of the old source. Any importer joining Boat → FO must (a) index the OBSOLETE section too, and (b) build a legacy-key crosswalk (obsolete row's Description/Factory Code ↔ active numeric row) — otherwise the join loses ~80–100% of Stabicraft options per boat.

## HelmLogic mapping proposal

Target: `data-warehouse/{vendorId}/ranges/{rangeId}/models/{modelId}` → `optionalFeatures` (with `applicableVariantIds`), per the Highfield precedent.

| MPF | HelmLogic | Confidence |
|---|---|---|
| Col A section = boat model | `models/{modelId}` grouping (join to Boat Module `Model Code` by name — note naming drift: `2350 - Supercab Adventure` vs `2350 Supercab (Adv)`) | MEDIUM — needs a name-normalization map |
| Section first row (hull) | model base price (Highfield analog: variant `sellPriceExclGst` before options) | MEDIUM-HIGH |
| Option rows (code, D description, L Sell) | `optionalFeatures[]` `{code, name, sellPriceExclGst}` | HIGH structure / MEDIUM price basis |
| `Sell = Std` rows | `standardInclusions` (v1.11 PDF nests these under the Vessel line) | HIGH |
| `Sell = Bundle` + pack rows | option packages (pack row priced, members zero-priced linked) | MEDIUM |
| F Matrix (or section-banner brand) | vendor routing (Highfield → `LafOLpLb6QIFE856TiD4` etc.) | HIGH |
| G Base Price + brand currency | vendor-currency cost (`Highfield USD` matches existing org exchange-rate flow; Merry Fisher needs a EUR rate doc) | HIGH for Highfield, MEDIUM for EUR brands |
| O Image Link | feature `imageUrl` (SharePoint links require auth — likely dead for app rendering; Stabicraft portal links public) | LOW for SharePoint URLs |
| N Service Operation | fit labour linkage (candidate for `serviceOperations`/fit-up costing) | LOW-MEDIUM — sparse (1,023 rows), semantics unconfirmed |
| OBSOLETE section | import flagged `obsolete: true` (needed to decode Boat Module refs), never shown in pickers | HIGH that it's needed for the crosswalk |

### Open questions
1. **Is `L Sell` ex-GST or inc-GST?** Rounded to $10; if inc-GST, divide by 1.1 before storing `sellPriceExclGst`, then re-apply `Math.ceil` at display per the v1.3 lesson. Needs NSM confirmation.
2. `applicableVariantIds`: options repeat per model section — model-scoped import is natural; is variant-level restriction (material/colour) ever encoded here? (Not observed; likely Boat-Module-side.)
3. Resolve the **Stabicraft legacy-key crosswalk** (headline anomaly) before wiring Boat → FO joins.
4. Trailer options dual-source (here vs Trailer Module quads) — which wins?
5. 38 cached `#N/A`/`#VALUE!` Sell cells and 155 `#N/A` Base Price cells need operator repricing — import as `missing pricing` (rose-highlight pattern from the catalog views), not zero.

## Anomalies (this file)

1. **Boat→FO references resolve into OBSOLETE OPTIONS** for Stabicraft (see table above) — the module's biggest data-integrity risk.
2. **Data island in hidden Dropdowns** — a >200-row gap before rows 769–2,206; early-stop scanners undercount (this audit's first pass reported 768 until a full scan found 2,206).
3. **Cached formula errors frozen into values**: 155 `#N/A` Base Price, 33 `#N/A` + 5 `#VALUE!` Sell.
4. **Empty hidden `Stabicraft` sheet** (vestigial) vs populated hidden `Stacer` sheet — inconsistent per-brand source retention.
5. **~2,600 option rows with empty Matrix** + 8 rows of literal `Matrix`/`MATRIX` text in the Matrix column.
6. **Currency implicit per brand** (USD ÷0.70, EUR ×1.75 baked into CTD) with stray `USD`/date/edition strings (`ED.24.02 (Updated 18.07.24)`, `As at 2.02.26`) sitting in the Base Price column as banner remnants.
7. Header prefix collision: Boat Module `Factory Options - MU` vs `Factory Options - NN` ref columns.
8. Section-name drift between Boat Module (`2350 - Supercab Adventure`) and FO Module (`2350 Supercab (Adv)`) — no shared model code in the FO section header (the hull row's NSM code, e.g. `7002323000`, IS the Boat Module `Model Code` — use that for the join, not the name).

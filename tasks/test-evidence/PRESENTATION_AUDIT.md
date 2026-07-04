# Presentation Relevance Audit — FFR-18 class hunt

**Date:** 2026-07-04 · **Auditor:** data-audit agent (read-only + one sanctioned patch class) · **Identity:** billh@nsmarine.com.au (operator test user) · **Org:** AcFZVEFA5UDJG2hyetWT

**The class (from FFR-18):** *faithful MPF import ≠ faithful presentation.* Data can be parity-exact against the Master Price File and still render as jibberish on customer-facing surfaces (### OBSELETE headings, other models' packs, workshop sections on Step-5 dealer-fit). This audit re-ran the FFR-18 classifier and hunted the same class across **every rendering-relevant collection**.

- **Tooling:** `scripts/mpf/audit-presentation.py` (repeatable; writes `tasks/test-evidence/presentation-audit.json`)
- **Permanent regression checks:** `scripts/smoke-1000.py` **section K "Presentation relevance"** (new)
- **Sanctioned patch log:** `tasks/mpf-audit/apply-log-presentation.jsonl`
- **Result:** 323 findings — **104 high · 209 medium · 10 low** — 2 sanctioned data patches applied, everything else findings + handoffs. **No src/** edits made by this audit.**

---

## Surface-by-surface results

### 1. dealerFitSelections (1,791 docs · 93 categories) — FFR-18 re-verification + 4 classifier escapes

Classifier re-run (exact port of `groupedDealerFit`/`classifySection` in `src/components/highfield-quote-flow.tsx`): **21 hidden · 50 model · 22 general**. All ###/OBSELETE/PRE DELIVERY/RIGGING KIT sections correctly classify `hidden`; no visible option has a negative Act Sell or ### name. The FFR-18 fix holds for its original targets.

**But 4 sections escape into `general` (always visible on every boat of every brand):**

| Severity | Category | Problem |
|---|---|---|
| **HIGH** | `HIGHFIELD - Patrol` | Brand+range section **without model digits** evades the `model` bucket (regex requires `\d{3}`) → its **100 options** render on every Stacer, Stabicraft, Formosa… quote. Same FFR-18 symptom, different spelling. |
| MEDIUM | `ENGINE REMOVALS` | Workshop operation, 16 items, renders as a Step-5 customer heading |
| MEDIUM | `SURVEYING SUBLETS` | Workshop operation, 2 items |
| LOW | `MPF – Uncategorised` | Import fallback bucket renders verbatim as a heading, 21 items |

**Handoff (main-owned file):** `src/components/highfield-quote-flow.tsx` `classifySection` (~line 926) — suggested fixes: (a) brand-word + range-word with **no** digits → `'model'` (matched via `modelRangeWord`), (b) add `REMOVAL`/`SUBLET`/`SURVEYING` to the hidden list, (c) map `MPF – Uncategorised` to a friendlier label or hide.

### 2. fitUpItems (3,672 docs) — 2 sanctioned patches applied + 2 handoffs

- **PATCHED (sanctioned, logged):** the 2 known MPF deduction lines got `{hidden: true, hiddenReason: 'MPF deduction line — not directly sellable'}` — before/after in `tasks/mpf-audit/apply-log-presentation.jsonl`:
  - `2-x-mfm70-2` — "CREDIT - Batteries (2 x MFM70)", sellPrice **-519**
  - `bs-6007-2` — "CREDIT - Battery Switch - Dual (Blue Sea)", sellPrice **-115**
  - **MPF fidelity note:** sellPrice values kept verbatim (-519 / -115) — parity with the MPF is preserved; only visibility changed.
  - **⚠️ Handoff:** `src/components/fit-up-quote-selector.tsx` does **not** filter on `hidden` today (no `item.hidden` check in the `moduleFiltered`/`filtered` memos, ~lines 351–390) and neither does `src/components/catalog-item-picker.tsx` (counter quotes). Suggested fix: `.filter(i => !i.hidden)` at load/filter time in both, and a "Hidden" badge in `fit-up-catalog-manager.tsx` so admins can still see/unhide them.
- **Handoff (junk names, 2):** `000-15406-001-nb-obsolete` — 'Simrad NSS Evo3S - 12" Display ###' and `hfi-rollbar-l` — 'Roll Bar - SP520 ###' (trailing `###` markers visible in the picker; also note the first item's part-number suffix literally says *obsolete*). Either strip the marker from `name` (NSM-ask: confirm obsolete status first) or hide.
- Workshop-noise categories (PD*/PICKUP/DELIVERY/###): **0** — the category set is clean. Empty names: 0. Negative sells now visible: **0** (post-patch, verified by re-run).

### 3. Model optionalFeatures (307 models: 85 Highfield + 222 non-HF) — 111 findings

- **95 negative-price options (HIGH):** 89 on Stabicraft models, 6 on Haines Signature (e.g. `7002750000` "No Hydraulic Steering (Fitted or Supplied)" **-$4,480**; "Delete GT51UHD-TM Transducer" **-$754**). These are *real MPF factory delete-credits* — MPF-faithful, but Step 2 currently renders them as ordinary priced options. **Handoff (product decision + UI):** render negative options as "Credit/Delete" lines (ui-audit agent's surface), or hide behind an admin toggle. Do **not** zero them — the money math is correct.
- **4 MPF-artifact names/categories (HIGH), all Merry Fisher:** 'Swimming Platforms with Teak **### NLA ###**' (3 models) and category '**PREVIOUS VERSION OPTIONS (NLA)**' (JEA-MF1095CS2-A2026). Worse, on 3 models the *category field holds continuation-note text* ('- Requires the Cockpit Sun Awning Option', '- Storage for Fishing Rods', '- Not compatible w Gas Stove…') which renders as an option-group heading. **NSM-ask** (their MPF carries the NLA rows) + **handoff** for a name-sanitiser at render or import time.
- **12 duplicate option names within a model (MEDIUM):** 6 Stacer, 6 Stabicraft (e.g. 'Deluxe Rear Lounge & Backrest - 499 Seamaster' ×2 on SRR499SMR) — duplicate rows in the MPF FO sheets; picker shows the same option twice. **NSM-ask + handoff** (dedupe by name at render).
- Absurd prices (>$500k): 0. Zero-price non-standard options: 1,437 — counted, **not** findings (legit 'no-charge' MPF semantics per import-fo-nonhf.py D-decisions).

### 4. Yamaha motor rows (235 docs) — CLEAN

- Duplicate display names visible in pickers/NSM-Recommended resolver: **0** (the feared 51 rig/campaign dup codes were collapsed by the upsert-by-MODEL-CODE import — the live dataset has no display-name collisions at all).
- motorMenu-referenced rows (216 distinct menu names) missing numeric NSM Retail: **0**.

### 5. Trailer docs (496 across 7 vendors) — 4 findings

- **2 sentinel rows imported as real trailers (HIGH):** `mackay-trailers/.../trailer-not-required` ('TRAILER NOT REQUIRED') and `trailer-not-required-800-gamefisher` — the extractor skipped exact 'TRAILER NOT REQUIRED' but the suffixed variant slipped through and **is on the 800 Gamefisher's trailer menu** as a selectable $0 trailer card. **Handoff:** either delete the two docs (data) or teach the menu resolver/card to render a "No trailer required" state.
- **Formosa GRT Tow Catch - RE1513Q-MO (HIGH):** `sellPriceExclGst == 0` (MPF carries no price) while referenced by **3 boats' menus** (GRT 425 TIL, GRT 455 TIL, GRT 455 SC). Per scope decision: **NOT hidden** — recorded as **NSM-ask** (price the RE1513Q-MO row in the MPF) + **handoff** for a menu-card "price on application / price-absent" state instead of "$0".
- Missing (null) sellPriceExclGst: 0. Junk-marker names: 0.

### 6. standardInclusions (on model docs) — 175 findings, one dominant class

- **168 render-wall models (MEDIUM):** inclusions where a single array entry is a >200-char wall (up to 655 chars) — whole MPF inclusion cells jammed into one string (91 Stacer, 29 Formosa, 20 Stabicraft, 9 Haines, 9 Cap Camarat, 5 Surtees, 4 Jeanneau, 1 Highfield). Renders as an unreadable paragraph wherever inclusions list.
- **1 residual-bullet model (LOW):** Highfield/ADV9 ('● Non Skid Deck   ● Hypalon Tube …' — bullets *inside* one string, same wall).
- **6 duplicate-line models (LOW).** Empty strings: 0 (extractor filtered them).
- **Handoff:** split-at-import (` - `/`●`/multi-space delimiters) via a small remediation script, or a render-time splitter in the inclusions component. Import-side split is the elegant fix; needs a sanctioned follow-up (not applied — not in this audit's patch sanction).

### 7. depositSchedule + leadTimesDays — CLEAN

Every model with a schedule sums to 100% (fraction 1.0 or percent 100 form), no negative stages; no lead time <0 or >365 days. **0 findings.**

### 8. regoTypes (28 docs, qld-transport) — CLEAN

No junk/empty labels, no negative sells, 'Not Required' rows carry $0. **0 findings.**

### 9. serviceOperations (369) / serviceParts (26,378) / engineServiceSchedules (189) / riggingKits (846)

- **Negative sells: 0 across all four** — the rigging quarantine held.
- serviceOperations / engineServiceSchedules / riggingKits junk names: **0**. No ###-marker section labels anywhere.
- **serviceParts: 145 junk-marker names (MEDIUM, 25 exemplars recorded)** — e.g. `9ho-06193-zw5-020` '**### NLA ###** HE PUMP KIT,IMPELL', 'S/S NLA 9/22', 'WINCH STRAP 6M X 50MM  NLA 24'. These reach the service-quote part picker + counter quotes. **NSM-ask** (their parts drop carries NLA annotations) + **handoff**: strip/flag `NLA` markers at import, or filter/badge in `catalog-item-picker.tsx` + service-quote part search. Not patched — 145 rows is a policy call (NLA parts may still be quotable from remaining stock).

### 10. pdChecklists — dormant, safe

`grep -r pdChecklist src/` → **zero consumers**. The variant-level `pdChecklists` (mpdc/dpdc boilerplate, imported by design) renders nowhere customer-facing. **Verdict: dormant, safe.** Re-audit for boilerplate-wall risk before any consumer ships (noted in `presentation-audit.json`).

---

## Patches applied (sanctioned only)

| Path | Patch | Log |
|---|---|---|
| `organisations/{org}/fitUpItems/2-x-mfm70-2` | `hidden: true`, `hiddenReason: 'MPF deduction line — not directly sellable'` | apply-log-presentation.jsonl (before/after) |
| `organisations/{org}/fitUpItems/bs-6007-2` | same | same |

Re-run of the audit post-patch verifies `negativeSellVisible: 0`.

## Handoff register (code fixes — NOT made by this audit)

| # | File | Fix |
|---|---|---|
| H1 | `src/components/highfield-quote-flow.tsx` (**main-owned**) `classifySection` ~L926 | brand+range-word no-digits → `model`; add REMOVALS/SUBLETS/SURVEYING to hidden; relabel/hide `MPF – Uncategorised` |
| H2 | `src/components/fit-up-quote-selector.tsx` ~L351–390 + `src/components/catalog-item-picker.tsx` fitUp tab | filter `!item.hidden`; admin "Hidden" badge in `fit-up-catalog-manager.tsx` |
| H3 | Step-2 options renderer (ui-audit) | negative-price optionalFeatures render as "Credit/Delete" lines; dedupe duplicate option names per model |
| H4 | trailer menu card (ui-audit) | price-absent state for $0/priceless menu trailers; "No trailer required" state for sentinel rows (or delete the 2 sentinel docs) |
| H5 | inclusions renderer or import remediation | split >200-char standardInclusions walls (168 models) on `●`/` - `/multi-space |
| H6 | service part pickers (`catalog-item-picker.tsx`, service-quote flows) | strip/badge `NLA`-marked serviceParts (145 rows) |

## NSM asks

1. Price the **Formosa GRT Tow Catch RE1513Q-MO** trailer row (currently $0, on 3 boats' menus).
2. Confirm status of the 2 `###`-marked fitUpItems (Simrad NSS Evo3S 12" / Roll Bar SP520) — obsolete or sellable?
3. Merry Fisher FO sheet: remove/flag `### NLA ###` rows + fix category cells holding continuation-note text.
4. Stacer/Stabicraft FO sheets: duplicate option rows (12 models).
5. Parts drop: 145 parts carry `NLA` annotations inside the description field.

## Permanent regression coverage

`scripts/smoke-1000.py` **section K** now pins: noise categories never visible-classified + escape budget ≤4 (shrink-only) · no visible negative-price dealer-fit/fitUp lines (negatives must be `hidden:true`) · optionalFeatures junk ≤4, credits ≤95, no >$500k · deposit sums valid + lead times sane · motor dup-display-name-with-different-price budget **0** + menu rows must have NSM Retail · trailer sentinel ≤2 + $0-menu ≤2 + junk 0 · rego labels sane · service/rigging negative sells 0, junk budgets (serviceParts ≤150, others 0). Budgets shrink as handoffs land; they must never grow.

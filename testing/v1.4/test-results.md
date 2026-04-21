# v1.4 — Test Results

Running log for the v1.4 QA pass. Fill in as you work through
[`test-cases.md`](./test-cases.md) and
[`regression-checklist.md`](./regression-checklist.md).

---

## Session meta

| Field | Value |
|---|---|
| Tester | _(your name)_ |
| Start date | _(YYYY-MM-DD)_ |
| End date | _(YYYY-MM-DD)_ |
| Build tested | Dev branch @ _(commit sha)_ |
| Environment | Dev / Prod / Local |
| Test user | billh@nsmarine.com.au |

---

## Legend

- ✅ Pass — matched expected.
- ❌ Fail — log under "Bugs" below; reference the bug ID (e.g. `BUG-001`).
- ⚠️ Gotcha — matches an entry in `known-gotchas.md`. Note the entry key.
- ⏭️ Skip — couldn't run. State why (missing fixture / blocked by prior failure / non-applicable env).

---

## Sections A–K (from `test-cases.md`)

| Section | Description | Result | Notes / Bug IDs |
|---|---|---|---|
| A | Vendor types (Data Warehouse) | ⏳ | |
| A.1 | List page filters | ⏳ | |
| A.2 | Add page — create Rego Authority vendor | ⏳ | |
| A.3 | MPF browser excludes catalog vendor types | ⏳ | |
| B | Module types (`/modules/add`) | ⏳ | |
| B.1 | Dropdown lists 7 options | ⏳ | |
| B.2 | Trailers module type UI | ⏳ | |
| B.3 | Rego module type — create fixture | ⏳ | |
| B.4 | Switching back to Catalog | ⏳ | |
| C | Trailers workspace — Catalog | ⏳ | |
| C.1 | Workspace shell + URL sync | ⏳ | |
| C.2 | Catalog rendering | ⏳ | |
| C.3 | Detail sheet | ⏳ | |
| C.4 | Search + filter | ⏳ | |
| C.5 | Inactive / obsolete | ⏳ | |
| C.6 | Empty state | ⏳ | |
| D | Rego workspace | ⏳ | |
| D.1 | Shell + tab URL sync | ⏳ | |
| D.2 | Types tab CRUD | ⏳ | |
| D.3 | Settings tab | ⏳ | |
| D.4 | Empty state | ⏳ | |
| E | Trailers — Pricing Manager + overrides | ⏳ | |
| E.1 | Waterfall rendering | ⏳ | |
| E.2 | Search | ⏳ | |
| E.3 | Missing-waterfall safety | ⏳ | |
| E.4 | Override — create | ⏳ | |
| E.5 | Override — persistence | ⏳ | |
| E.6 | Override — reset | ⏳ | |
| E.7 | Override — validation | ⏳ | |
| E.8 | Non-admin behaviour | ⏳ | |
| E.9 | Fixture re-applied for Section H | ⏳ | |
| F | Trailers — Settings | ⏳ | |
| F.1 | Brands multi-select | ⏳ | |
| F.2 | Dealer Fit Categories (dead write, expected gotcha) | ⏳ | |
| F.3 | Role assignment | ⏳ | |
| F.4 | Non-admin | ⏳ | |
| G | Quote flow — Rego pickers | ⏳ | |
| G.1 | Boat rego picker | ⏳ | |
| G.2 | Boat rego — no module configured | ⏳ | |
| G.3 | Trailer rego picker | ⏳ | |
| G.4 | Finalize with snapshots | ⏳ | |
| G.5 | Duplicate re-hydrates | ⏳ | |
| H | Quote flow — Trailer picker + finalize | ⏳ | |
| H.1 | Picker opens | ⏳ | |
| H.2 | Search | ⏳ | |
| H.3 | Override merge into picker | ⏳ | |
| H.4 | Pick RE1213 | ⏳ | |
| H.5 | Trailer hardware | ⏳ | |
| H.6 | Price levels | ⏳ | |
| H.7 | Clear snapshot | ⏳ | |
| H.8 | Model with no default trailer | ⏳ | |
| H.9 | Finalize with catalog-picked trailer | ⏳ | |
| H.10 | Price-drift protection | ⏳ | |
| H.11 | Duplicate rehydrates | ⏳ | |
| H.12 | Regression — no catalog pick | ⏳ | |
| I | Dealer Fit four-source merge | ⏳ | |
| I.1 | Three managers visible | ⏳ | |
| I.2 | Configure one category per source | ⏳ | |
| I.3 | Merge in quote flow | ⏳ | |
| I.4 | Name-based rebinding (expected gotcha) | ⏳ | |
| I.5 | Cleanup | ⏳ | |
| K | Automated smoke | ⏳ | |
| K.1 | Suite runs | ⏳ | |
| K.2 | Results interpretation | ⏳ | |

---

## Regression (from `regression-checklist.md`)

| Item | Description | Result | Notes / Bug IDs |
|---|---|---|---|
| R1 | Existing modules still open | ⏳ | |
| R2 | Highfield quote flow — non-v1.4 paths | ⏳ | |
| R3 | Proposals + PDFs | ⏳ | |
| R4 | Dealer Fit (non-trailer sources) | ⏳ | |
| R5 | Admin pages | ⏳ | |
| R6 | Data Warehouse browsing | ⏳ | |
| R7 | Cover image refresh | ⏳ | |
| R8 | Automated critical-path smoke | ⏳ | |
| R9 | Login + auth | ⏳ | |

---

## Bugs logged

See [`bugs-found.md`](./bugs-found.md) for details. Summary:

| Bug ID | Severity | Summary | Status |
|---|---|---|---|
| _(none yet)_ | | | |

---

## Sign-off

| Field | Value |
|---|---|
| Verdict | Pass / Conditional Pass / Fail |
| Conditions (if Conditional) | _(list)_ |
| Blocking bugs | _(list bug IDs)_ |
| Signed off by | _(tester name)_ |
| Date | _(YYYY-MM-DD)_ |

**Conditional Pass** is acceptable if all logged bugs are Severity ≤ Low and
engineering has acknowledged them in a GitHub issue.

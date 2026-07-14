# MPF Boat Module — the "what to show on quotes" signifier system

**Date:** 2026-07-14 · investigated on Asaf's report: *"on MPF there are
signifiers of what they actually want shown on the quotes… some things they
absolutely want shown and some are just there because of Excel limitations."*

## The finding

The Boat Module sheet carries BOTH layers on every boat row, and they are
distinguishable:

### 1. WANT-SHOWN signifiers (per boat, columns on the boat's own row)

| Signifier | Columns | What it means | Where HelmLogic honours it |
|---|---|---|---|
| **Curated motor menu** | 13 fixed slots (motor + rigging kit + prop + engine hole each) | The motors NSM actually offers on THIS boat; slot 1 = the recommended package | Quote Step 3 "NSM Recommended" menu (primary since v1.31; HP-range filter is only the fallback), FFR-33 composition prices the slot's rigging kit + prop |
| **Curated trailer menu** | 10 fixed slots | The trailers they quote with this boat | Step 4 trailer assignment default + menu |
| **Curated dealer-fit lines** | 42 fixed slots (cols 402–443) | The dealer-fit items they want OFFERED on this boat's quote | Step 5 `NsmDealerFitStrip` — rendered as recommended toggles above the full pool |
| **Standard inclusions** | text block | Must appear on the customer document | PDF Investment Summary "Standard Inclusions" (indented, INCLUDED) |
| **Deposit schedule + lead times** | cols 446–457 | Payment/timing terms to show | `DepositScheduleCard` on the Summary step |
| **PD tier (hrs + sell)** | cols 274, 517–555 | Pre-delivery & installation belongs in the package price | FFR-33: auto-composed + PDF "Pre-Delivery & Installation" line |

### 2. EXCEL-LIMITATION artifacts (structure, not intent)

| Artifact | Why it exists in Excel | How HelmLogic treats it |
|---|---|---|
| `NR -` prefixed slot entries | The 13/10/42 slot grids are FIXED WIDTH — unused slots must hold something | Skipped at extraction (`NR_PREFIXES`) — never imported |
| `### OBSELETE MODEL LIST ###` + OBSOLETE sections | One flat sheet must hold current AND dead rows for old dropdown references | `classifySection() → 'hidden'`: quote Step 5 hides them; catalog admin now sorts them LAST with an "MPF internal · auto-hidden on quotes" badge |
| Rigging-kit / Helm-Master / Add-On-Kit / Pre-Delivery sections in the dealer-fit pool | Excel needs ONE dropdown source, so composition ingredients live beside customer accessories | `'hidden'` on Step 5 pickers — but their DATA still prices the motor bundle (FFR-33 slot composition) |
| Workshop sections (Engine Removal, Surveying Sublet) | Same single-pool limitation | `'workshop'` class — hidden from new-boat quotes, revealable via "Show all" |
| Brand divider rows re-defining headers, `Motor Quote Module` / `Trailer Quote Module` pseudo-rows, phantom columns past col 678 | Sheet layout mechanics | Extraction boundaries — never imported as data |
| Display-name string joins via hidden Dropdowns sheets | Excel has no foreign keys | Imported as typed ID references, validated at import |

## The one gap found today (and closed)

The Catalog Explorer → Dealer Fit admin view (fixed earlier today to show the
MPF selections) sorted categories alphabetically — which put
`### OBSELETE MODEL LIST ###` at the very top, exactly the artifact NSM never
wants prominent. The admin view now uses the SAME `classifySection` the quote
flow uses: genuine accessory categories (populated first) → empty configured
categories → MPF-internal sections last, each tagged **"MPF internal ·
auto-hidden on quotes"** so an operator understands why the quote pickers
don't offer them.

## Standing questions for NSM (existing asks, unchanged)

- The **Display Sheet workbook** itself (their quoting tool) — would let us
  copy, rather than infer, the package composition (asked in Mark's follow-up).
- The 29 motor-menu-vs-HP-column contradictions and 4 dead/unpriced trailer
  refs already logged in the v1.31 close-out — those are rows where their own
  signifiers disagree with their own data.

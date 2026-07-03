# BOATS — MPF vs HelmLogic reconciliation (Phase 2, read-only)

Generated 2026-07-03T10:01:12.097200+00:00 from `tasks/mpf-audit/extracted/boats.json` against live Firestore (`data-warehouse/LafOLpLb6QIFE856TiD4`: 7 ranges, 85 models, 640 variants).

## Headline counts (588 Highfield MPF SKUs)

| Bucket | Count |
|---|---|
| Exact match (sell AND cost within $0.01) | 587 |
| — sell matches (MPF cash ÷ 1.1 == HL sellPriceExclGst) | 587 |
| — cost matches (MPF landed AUD == HL cost) | 587 |
| Price mismatch (sell or cost off) | 0 |
| Missing in HelmLogic | 1 |
| HL-only variants not in MPF current set | 53 |

## Price drift

- Sell (MPF cash ÷ 1.1 vs HL `sellPriceExclGst`): signed **$0.00**, absolute **$0.00**
- Cost (MPF Landed Hull Cost vs HL `cost`): signed **$0.00**, absolute **$0.00**

Positive delta = MPF is higher than HelmLogic.

## 20 worst offenders by |sell Δ| + |cost Δ|

| SKU | Model | MPF cash exGst | HL sellPriceExclGst | Sell Δ | MPF landed | HL cost | Cost Δ |
|---|---|---|---|---|---|---|---|

## Missing in HelmLogic

| SKU | Name | Range | Model found in HL? |
|---|---|---|---|
| HBS15## | Highfield - SP660 (HYP) DG-G-WB | Sport | yes — variant missing |

## HL-only variants (live, not in MPF current section)

| Variant | Model | Range | Note |
|---|---|---|---|
| HBR021 | RU200AL | Roll-Up | likely OBSOLETE-section SKU or manual add |
| HBR022 | RU200AL | Roll-Up | likely OBSOLETE-section SKU or manual add |
| HBR023 | RU200AL | Roll-Up | likely OBSOLETE-section SKU or manual add |
| HBR024 | RU200AL | Roll-Up | likely OBSOLETE-section SKU or manual add |
| HBR001 | RU200KAM | Roll-Up | likely OBSOLETE-section SKU or manual add |
| HBR002 | RU200KAM | Roll-Up | likely OBSOLETE-section SKU or manual add |
| HBR003 | RU200KAM | Roll-Up | likely OBSOLETE-section SKU or manual add |
| HBR004 | RU200KAM | Roll-Up | likely OBSOLETE-section SKU or manual add |
| HBR041 | RU250 Easy Go | Roll-Up | likely OBSOLETE-section SKU or manual add |
| HBR042 | RU300 Easy Go | Roll-Up | likely OBSOLETE-section SKU or manual add |
| HBU001 | UL220 | Ultralite | likely OBSOLETE-section SKU or manual add |
| HBU002 | UL220 | Ultralite | likely OBSOLETE-section SKU or manual add |
| HBU003 | UL220 | Ultralite | likely OBSOLETE-section SKU or manual add |
| HBU004 | UL220 | Ultralite | likely OBSOLETE-section SKU or manual add |
| HBU005 | UL220 | Ultralite | likely OBSOLETE-section SKU or manual add |
| HBU006 | UL220 | Ultralite | likely OBSOLETE-section SKU or manual add |
| HBU007 | UL220 | Ultralite | likely OBSOLETE-section SKU or manual add |
| HBU008 | UL220 | Ultralite | likely OBSOLETE-section SKU or manual add |
| demo-default-pvc | SP700 | Sport | placeholder/demo |
| demo-default-pvc | SP760 | Sport | placeholder/demo |
| HBC129 | CL340MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC130 | CL340MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC131 | CL340MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC132 | CL340MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC133 | CL340MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC134 | CL340MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC135 | CL340MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC136 | CL340MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC158 | CL340MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC137 | CL360MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC138 | CL360MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC139 | CL360MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC140 | CL360MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC141 | CL360MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC142 | CL360MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC143 | CL360MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC144 | CL360MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC161 | CL360MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC145 | CL380MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC146 | CL380MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC147 | CL380MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC148 | CL380MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC149 | CL380MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC150 | CL380MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC151 | CL380MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC152 | CL380MAX | Classic | likely OBSOLETE-section SKU or manual add |
| HBC163 | CL380MAX | Classic | likely OBSOLETE-section SKU or manual add |
| demo-default-pvc | PA540 | Patrol | placeholder/demo |
| demo-default-pvc | PA600 | Patrol | placeholder/demo |
| demo-default-pvc | PA660 | Patrol | placeholder/demo |
| demo-default-pvc | PA700 | Patrol | placeholder/demo |
| demo-default-pvc | PA760 | Patrol | placeholder/demo |
| demo-default-pvc | PA860 | Patrol | placeholder/demo |

## Non-Highfield brands (no HL counterpart expected yet — D4 creates vendors at import)

| Brand | Current boats |
|---|---|
| Cap Camarat | 11 |
| Formosa | 39 |
| Haines Signature | 9 |
| Jeanneau | 4 |
| Merry Fisher | 12 |
| Stabicraft | 37 |
| Stacer | 91 |
| Surtees | 19 |

Total non-Highfield current boats: **222**

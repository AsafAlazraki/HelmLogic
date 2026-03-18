# Highfield Boats — Data Import Review Document

> **Generated for review before Firestore population.**
> Please review and confirm before running the population script.

## Summary

- **Ranges**: 7
- **Models**: 76
- **Variants/SKUs**: 627
- **Equipment Items**: 956

## Firestore Data Hierarchy

```
data-warehouse/{highfield-vendor-id}/
  ranges/{range-id}/
    models/{model-id}/
      variants/{variant-id}
```

- **Vendor ID**: `highfield` (to be confirmed)
- **Range prices stored as**: USD factory price in `sellPriceExclGst` field
- **Equipment items** → stored as `optionalFeatures[]` on the parent model

---

## Range & Model Structure

### Adventure Range (`ADV` prefix)

> Highfield Adventure series — fully-equipped open offshore RIBs with premium factory-fitted consoles, T-tops and electronics packages for serious offshore work.

**Slug**: `adventure`  
**Models**: 1

#### ADV7

| Field | Value |
|---|---|
| Model ID (slug) | `adv7` |
| Total Variants | 7 |
| Factory Price (USD) | $23,527.00 |

**Standard Equipment (included in base price):**
- "? ADV7 console

**Equipment Sheet Items (13 matched):**
- [Console] ADV7 console (`HEC197`) — USD $4,415.00
- [Electronics Package] EP for ADV7 console (`HEE050`) — USD $896.00
- [Electronics Package] EP for ADV7 (`HEE021`) — USD $627.00
- [Roll Bar & Ladder] Roll bar for ADV7 (`HER127`) — USD $378.00
- [Seat] ADV7 seat (`HES092`) — USD $3,996.00
- [Spare Parts] Shower kit for ADV7 (`HEP102`) — USD $446.00
- [Spare Parts] Sundeck for ADV7 (`HEP101`) — USD $671.00
- [Spare Parts] Table for ADV7 (`HEP099`) — USD $632.00
- [Spare Parts] Windlass for ADV7 (`HEP098`) — USD $2,102.00
- [Spare Parts] Fridge for ADV7 (`HEP097`) — USD $1,452.00
- [Spare Parts] Hydraulic steering system for ADV7 (`HEP096`) — USD $1,832.00
- [Spare Parts] Sunshade for ADV7 (`HEP094`) — USD $931.00
- [Top] Fabric T Top for ADV7CST (`HET055`) — USD $2,113.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBA001` | HYP | B-G-B | $23,527.00 |
| `HBA002` | HYP | B-G-LB | $23,527.00 |
| `HBA003` | HYP | B-G-WB | $23,527.00 |
| `HBA004` | HYP | B-W-WG | $23,527.00 |
| `HBA005` | HYP | LG-G-MB | $23,527.00 |
| `HBA006` | HYP | LG-W-WB | $23,527.00 |
| `HBA007` | HYP | LG-W-LB | $23,527.00 |

</details>

### Classic Range (`CL` prefix)

> Highfield Classic series — compact, versatile aluminium-floored RIBs built for coastal fishing, family outings and boat-to-shore transport. Available in HYP (Hypalon/CSM) and PVC tube options.

**Slug**: `classic`  
**Models**: 19

#### CL260

| Field | Value |
|---|---|
| Model ID (slug) | `cl260` |
| Total Variants | 9 |
| HYP Variants | 5 SKUs |
| PVC Variants | 4 SKUs |
| Factory Price Range (USD) | $1,557.00 – $2,634.00 |

**Standard Equipment (included in base price):**
- "? EVA teak for  CL260

**Equipment Sheet Items (5 matched):**
- [Cover] Boat cover for CL260 (`HEO026`) — USD $209.00
- [EVA Teak] EVA teak for  CL260 (`HEF 016`) — USD $173.00
- [EVA Teak] EVA teak for  CL260 (`HEF 016-GB`) — USD $173.00
- [Spare Parts] Highfield logo HYP 422*90mm(For CL260-380?UL310/340?UL240LT-UL290LT) (`LH422H`) — USD $14.00
- [Spare Parts] Highfield logo PVC 422*90mm(For CL260-380?UL310/340?UL240LT-UL290LT) (`LH422P`) — USD $8.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBC004` | HYP | LG-W-WD | $2,313.00 |
| `HBC006` | HYP | DG-G-DG | $2,313.00 |
| `HBC008` | HYP | B-G-DG | $2,634.00 |
| `HBC001` | PVC | W-W-WD | $1,557.00 |
| `HBC003` | PVC | LG-W-WD | $1,557.00 |
| `HBC005` | PVC | DG-G-DG | $1,557.00 |
| `HBC007` | PVC | B-G-DG | $1,557.00 |
| `HBC167` | HYP | I-B-C | $2,634.00 |
| `HBC002` | HYP | W-W-WD | $2,634.00 |

</details>

#### CL290

| Field | Value |
|---|---|
| Model ID (slug) | `cl290` |
| Total Variants | 9 |
| HYP Variants | 5 SKUs |
| PVC Variants | 4 SKUs |
| Factory Price Range (USD) | $1,678.00 – $2,986.00 |

**Standard Equipment (included in base price):**
- "? EVA teak for  CL290

**Equipment Sheet Items (3 matched):**
- [Cover] Boat cover for CL290 (`HEO027`) — USD $225.00
- [EVA Teak] EVA teak for  CL290 (`HEF 017`) — USD $220.00
- [EVA Teak] EVA teak for  CL290 (`HEF 017-GB`) — USD $220.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBC016` | HYP | B-G-DG | $2,986.00 |
| `HBC168` | HYP | I-B-C | $2,986.00 |
| `HBC009` | PVC | W-W-WD | $1,678.00 |
| `HBC010` | HYP | W-W-WD | $2,986.00 |
| `HBC011` | PVC | LG-W-WD | $1,678.00 |
| `HBC012` | HYP | LG-W-WD | $2,529.00 |
| `HBC013` | PVC | DG-G-DG | $1,678.00 |
| `HBC014` | HYP | DG-G-DG | $2,529.00 |
| `HBC015` | PVC | B-G-DG | $1,678.00 |

</details>

#### CL290FT

| Field | Value |
|---|---|
| Model ID (slug) | `cl290ft` |
| Total Variants | 9 |
| HYP Variants | 5 SKUs |
| PVC Variants | 4 SKUs |
| Factory Price Range (USD) | $1,992.00 – $3,299.00 |

**Standard Equipment (included in base price):**
- "? EVA teak for  CL290

**Equipment Sheet Items (3 matched):**
- [Cover] Boat cover for CL290 (`HEO027`) — USD $225.00
- [EVA Teak] EVA teak for  CL290 (`HEF 017`) — USD $220.00
- [EVA Teak] EVA teak for  CL290 (`HEF 017-GB`) — USD $220.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBC110` | HYP | DG-G-DG | $2,842.00 |
| `HBC112` | HYP | B-G-DG | $3,299.00 |
| `HBC169` | HYP | I-B-C | $3,299.00 |
| `HBC105` | PVC | W-W-WD | $1,992.00 |
| `HBC107` | PVC | LG-W-WD | $1,992.00 |
| `HBC109` | PVC | DG-G-DG | $1,992.00 |
| `HBC111` | PVC | B-G-DG | $1,992.00 |
| `HBC106` | HYP | W-W-WD | $3,299.00 |
| `HBC108` | HYP | LG-W-WD | $2,842.00 |

</details>

#### CL310

| Field | Value |
|---|---|
| Model ID (slug) | `cl310` |
| Total Variants | 9 |
| HYP Variants | 5 SKUs |
| PVC Variants | 4 SKUs |
| Factory Price Range (USD) | $1,886.00 – $3,284.00 |

**Standard Equipment (included in base price):**
- "? EVA teak for  CL310

**Equipment Sheet Items (3 matched):**
- [Cover] Boat cover for CL310 (`HEO028`) — USD $260.00
- [EVA Teak] EVA teak for  CL310 (`HEF 018`) — USD $273.00
- [EVA Teak] EVA teak for  CL310 (`HEF 018-GB`) — USD $273.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBC022` | HYP | DG-G-DG | $2,826.00 |
| `HBC023` | PVC | B-G-DG | $1,886.00 |
| `HBC024` | HYP | B-G-DG | $3,284.00 |
| `HBC170` | HYP | I-B-C | $3,284.00 |
| `HBC017` | PVC | W-W-WD | $1,886.00 |
| `HBC018` | HYP | W-W-WD | $3,284.00 |
| `HBC019` | PVC | LG-W-WD | $1,886.00 |
| `HBC020` | HYP | LG-W-WD | $2,826.00 |
| `HBC021` | PVC | DG-G-DG | $1,886.00 |

</details>

#### CL310FT

| Field | Value |
|---|---|
| Model ID (slug) | `cl310ft` |
| Total Variants | 9 |
| HYP Variants | 5 SKUs |
| PVC Variants | 4 SKUs |
| Factory Price Range (USD) | $2,200.00 – $3,597.00 |

**Standard Equipment (included in base price):**
- "? EVA teak for  CL310

**Equipment Sheet Items (3 matched):**
- [Cover] Boat cover for CL310 (`HEO028`) — USD $260.00
- [EVA Teak] EVA teak for  CL310 (`HEF 018`) — USD $273.00
- [EVA Teak] EVA teak for  CL310 (`HEF 018-GB`) — USD $273.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBC113` | PVC | W-W-WD | $2,200.00 |
| `HBC115` | PVC | LG-W-WD | $2,200.00 |
| `HBC117` | PVC | DG-G-DG | $2,200.00 |
| `HBC119` | PVC | B-G-DG | $2,200.00 |
| `HBC114` | HYP | W-W-WD | $3,597.00 |
| `HBC116` | HYP | LG-W-WD | $3,140.00 |
| `HBC118` | HYP | DG-G-DG | $3,140.00 |
| `HBC120` | HYP | B-G-DG | $3,597.00 |
| `HBC171` | HYP | I-B-C | $3,597.00 |

</details>

#### CL310LS

| Field | Value |
|---|---|
| Model ID (slug) | `cl310ls` |
| Total Variants | 9 |
| HYP Variants | 5 SKUs |
| PVC Variants | 4 SKUs |
| Factory Price Range (USD) | $1,886.00 – $3,284.00 |

**Standard Equipment (included in base price):**
- "? EVA teak for  CL310

**Equipment Sheet Items (3 matched):**
- [Cover] Boat cover for CL310 (`HEO028`) — USD $260.00
- [EVA Teak] EVA teak for  CL310 (`HEF 018`) — USD $273.00
- [EVA Teak] EVA teak for  CL310 (`HEF 018-GB`) — USD $273.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBC029` | PVC | DG-G-DG | $1,886.00 |
| `HBC030` | HYP | DG-G-DG | $2,826.00 |
| `HBC031` | PVC | B-G-DG | $1,886.00 |
| `HBC032` | HYP | B-G-DG | $3,284.00 |
| `HBC172` | HYP | I-B-C | $3,284.00 |
| `HBC025` | PVC | W-W-WD | $1,886.00 |
| `HBC027` | PVC | LG-W-WD | $1,886.00 |
| `HBC026` | HYP | W-W-WD | $3,284.00 |
| `HBC028` | HYP | LG-W-WD | $2,826.00 |

</details>

#### CL340

| Field | Value |
|---|---|
| Model ID (slug) | `cl340` |
| Total Variants | 9 |
| HYP Variants | 5 SKUs |
| PVC Variants | 4 SKUs |
| Factory Price Range (USD) | $2,185.00 – $3,533.00 |

**Standard Equipment (included in base price):**
- "? EVA teak for  CL340

**Equipment Sheet Items (3 matched):**
- [Cover] Boat cover for CL340 (`HEO029`) — USD $321.00
- [EVA Teak] EVA teak for  CL340 (`HEF 019-GB`) — USD $248.00
- [EVA Teak] EVA teak for  CL340 (`HEF 019`) — USD $248.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBC033` | PVC | W-W-WD | $2,185.00 |
| `HBC034` | HYP | W-W-WD | $3,533.00 |
| `HBC035` | PVC | LG-W-WD | $2,185.00 |
| `HBC036` | HYP | LG-W-WD | $3,533.00 |
| `HBC037` | PVC | DG-G-DG | $2,185.00 |
| `HBC038` | HYP | DG-G-DG | $3,533.00 |
| `HBC039` | PVC | B-G-DG | $2,185.00 |
| `HBC040` | HYP | B-G-DG | $3,533.00 |
| `HBC154` | HYP | I-B-C | $3,533.00 |

</details>

#### CL340FT

| Field | Value |
|---|---|
| Model ID (slug) | `cl340ft` |
| Total Variants | 9 |
| HYP Variants | 5 SKUs |
| PVC Variants | 4 SKUs |
| Factory Price Range (USD) | $2,497.00 – $3,845.00 |

**Standard Equipment (included in base price):**
- "? EVA teak for  CL340

**Equipment Sheet Items (3 matched):**
- [Cover] Boat cover for CL340 (`HEO029`) — USD $321.00
- [EVA Teak] EVA teak for  CL340 (`HEF 019-GB`) — USD $248.00
- [EVA Teak] EVA teak for  CL340 (`HEF 019`) — USD $248.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBC122` | HYP | W-W-WD | $3,845.00 |
| `HBC124` | HYP | LG-W-WD | $3,845.00 |
| `HBC126` | HYP | DG-G-DG | $3,845.00 |
| `HBC128` | HYP | B-G-DG | $3,845.00 |
| `HBC157` | HYP | I-B-C | $3,845.00 |
| `HBC121` | PVC | W-W-WD | $2,497.00 |
| `HBC123` | PVC | LG-W-WD | $2,497.00 |
| `HBC125` | PVC | DG-G-DG | $2,497.00 |
| `HBC127` | PVC | B-G-DG | $2,497.00 |

</details>

#### CL340LS

| Field | Value |
|---|---|
| Model ID (slug) | `cl340ls` |
| Total Variants | 9 |
| HYP Variants | 5 SKUs |
| PVC Variants | 4 SKUs |
| Factory Price Range (USD) | $2,185.00 – $3,533.00 |

**Standard Equipment (included in base price):**
- "? EVA teak for  CL340

**Equipment Sheet Items (3 matched):**
- [Cover] Boat cover for CL340 (`HEO029`) — USD $321.00
- [EVA Teak] EVA teak for  CL340 (`HEF 019-GB`) — USD $248.00
- [EVA Teak] EVA teak for  CL340 (`HEF 019`) — USD $248.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBC041` | PVC | W-W-WD | $2,185.00 |
| `HBC042` | HYP | W-W-WD | $3,533.00 |
| `HBC043` | PVC | LG-W-WD | $2,185.00 |
| `HBC044` | HYP | LG-W-WD | $3,533.00 |
| `HBC045` | PVC | DG-G-DG | $2,185.00 |
| `HBC046` | HYP | DG-G-DG | $3,533.00 |
| `HBC047` | PVC | B-G-DG | $2,185.00 |
| `HBC048` | HYP | B-G-DG | $3,533.00 |
| `HBC159` | HYP | I-B-C | $3,533.00 |

</details>

#### CL340MAX

| Field | Value |
|---|---|
| Model ID (slug) | `cl340max` |
| Total Variants | 9 |
| HYP Variants | 5 SKUs |
| PVC Variants | 4 SKUs |
| Factory Price Range (USD) | $2,185.00 – $3,533.00 |

**Optional Factory Extras (from boats sheet):**
- [Console] "? FCT8 with EP & Steering system & Carbon dash — USD $1,386.00

**Equipment Sheet Items (3 matched):**
- [Cover] Boat cover for CL340 (`HEO029`) — USD $321.00
- [EVA Teak] EVA teak for  CL340 (`HEF 019-GB`) — USD $248.00
- [EVA Teak] EVA teak for  CL340 (`HEF 019`) — USD $248.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBC129` | PVC | W-W-WD | $2,185.00 |
| `HBC130` | HYP | W-W-WD | $3,533.00 |
| `HBC131` | PVC | LG-W-WD | $2,185.00 |
| `HBC132` | HYP | LG-W-WD | $3,533.00 |
| `HBC133` | PVC | DG-G-DG | $2,185.00 |
| `HBC134` | HYP | DG-G-DG | $3,533.00 |
| `HBC135` | PVC | B-G-DG | $2,185.00 |
| `HBC136` | HYP | B-G-DG | $3,533.00 |
| `HBC158` | HYP | I-B-C | $3,533.00 |

</details>

#### CL360

| Field | Value |
|---|---|
| Model ID (slug) | `cl360` |
| Total Variants | 9 |
| HYP Variants | 5 SKUs |
| PVC Variants | 4 SKUs |
| Factory Price Range (USD) | $2,378.00 – $3,855.00 |

**Standard Equipment (included in base price):**
- "? EVA teak for  CL360

**Equipment Sheet Items (3 matched):**
- [Cover] Boat cover for CL360 (`HEO030`) — USD $354.00
- [EVA Teak] EVA teak for  CL360 (`HEF 020`) — USD $265.00
- [EVA Teak] EVA teak for  CL360 (`HEF 020-GB`) — USD $265.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBC155` | HYP | I-B-C | $3,855.00 |
| `HBC049` | PVC | W-W-WD | $2,378.00 |
| `HBC050` | HYP | W-W-WD | $3,855.00 |
| `HBC051` | PVC | LG-W-WD | $2,378.00 |
| `HBC052` | HYP | LG-W-WD | $3,855.00 |
| `HBC053` | PVC | DG-G-DG | $2,378.00 |
| `HBC054` | HYP | DG-G-DG | $3,855.00 |
| `HBC055` | PVC | B-G-DG | $2,378.00 |
| `HBC056` | HYP | B-G-DG | $3,855.00 |

</details>

#### CL360LS

| Field | Value |
|---|---|
| Model ID (slug) | `cl360ls` |
| Total Variants | 9 |
| HYP Variants | 5 SKUs |
| PVC Variants | 4 SKUs |
| Factory Price Range (USD) | $2,378.00 – $3,855.00 |

**Standard Equipment (included in base price):**
- "? EVA teak for  CL360

**Equipment Sheet Items (3 matched):**
- [Cover] Boat cover for CL360 (`HEO030`) — USD $354.00
- [EVA Teak] EVA teak for  CL360 (`HEF 020`) — USD $265.00
- [EVA Teak] EVA teak for  CL360 (`HEF 020-GB`) — USD $265.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBC059` | PVC | LG-W-WD | $2,378.00 |
| `HBC060` | HYP | LG-W-WD | $3,855.00 |
| `HBC063` | PVC | B-G-DG | $2,378.00 |
| `HBC061` | PVC | DG-G-DG | $2,378.00 |
| `HBC064` | HYP | B-G-DG | $3,855.00 |
| `HBC062` | HYP | DG-G-DG | $3,855.00 |
| `HBC160` | HYP | I-B-C | $3,855.00 |
| `HBC057` | PVC | W-W-WD | $2,378.00 |
| `HBC058` | HYP | W-W-WD | $3,855.00 |

</details>

#### CL360MAX

| Field | Value |
|---|---|
| Model ID (slug) | `cl360max` |
| Total Variants | 9 |
| HYP Variants | 5 SKUs |
| PVC Variants | 4 SKUs |
| Factory Price Range (USD) | $2,378.00 – $3,855.00 |

**Optional Factory Extras (from boats sheet):**
- [Console] "? FCT8 with EP & Steering system & Carbon dash — USD $1,386.00

**Equipment Sheet Items (3 matched):**
- [Cover] Boat cover for CL360 (`HEO030`) — USD $354.00
- [EVA Teak] EVA teak for  CL360 (`HEF 020`) — USD $265.00
- [EVA Teak] EVA teak for  CL360 (`HEF 020-GB`) — USD $265.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBC137` | PVC | W-W-WD | $2,378.00 |
| `HBC138` | HYP | W-W-WD | $3,855.00 |
| `HBC139` | PVC | LG-W-WD | $2,378.00 |
| `HBC140` | HYP | LG-W-WD | $3,855.00 |
| `HBC141` | PVC | DG-G-DG | $2,378.00 |
| `HBC142` | HYP | DG-G-DG | $3,855.00 |
| `HBC143` | PVC | B-G-DG | $2,378.00 |
| `HBC144` | HYP | B-G-DG | $3,855.00 |
| `HBC161` | HYP | I-B-C | $3,855.00 |

</details>

#### CL380

| Field | Value |
|---|---|
| Model ID (slug) | `cl380` |
| Total Variants | 9 |
| HYP Variants | 5 SKUs |
| PVC Variants | 4 SKUs |
| Factory Price Range (USD) | $2,570.00 – $4,190.00 |

**Standard Equipment (included in base price):**
- "? EVA teak for  CL380

**Equipment Sheet Items (3 matched):**
- [Cover] Boat cover for CL380 (`HEO031`) — USD $369.00
- [EVA Teak] EVA teak for  CL380 (`HEF 021`) — USD $289.00
- [EVA Teak] EVA teak for  CL380 (`HEF 021-GB`) — USD $289.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBC065` | PVC | W-W-WD | $2,570.00 |
| `HBC066` | HYP | W-W-WD | $4,190.00 |
| `HBC067` | PVC | LG-W-WD | $2,570.00 |
| `HBC068` | HYP | LG-W-WD | $4,190.00 |
| `HBC069` | PVC | DG-G-DG | $2,570.00 |
| `HBC070` | HYP | DG-G-DG | $4,190.00 |
| `HBC071` | PVC | B-G-DG | $2,570.00 |
| `HBC072` | HYP | B-G-DG | $4,190.00 |
| `HBC156` | HYP | I-B-C | $4,190.00 |

</details>

#### CL380LS

| Field | Value |
|---|---|
| Model ID (slug) | `cl380ls` |
| Total Variants | 9 |
| HYP Variants | 5 SKUs |
| PVC Variants | 4 SKUs |
| Factory Price Range (USD) | $2,570.00 – $4,190.00 |

**Standard Equipment (included in base price):**
- "? EVA teak for  CL380

**Equipment Sheet Items (3 matched):**
- [Cover] Boat cover for CL380 (`HEO031`) — USD $369.00
- [EVA Teak] EVA teak for  CL380 (`HEF 021`) — USD $289.00
- [EVA Teak] EVA teak for  CL380 (`HEF 021-GB`) — USD $289.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBC073` | PVC | W-W-WD | $2,570.00 |
| `HBC074` | HYP | W-W-WD | $4,190.00 |
| `HBC075` | PVC | LG-W-WD | $2,570.00 |
| `HBC076` | HYP | LG-W-WD | $4,190.00 |
| `HBC077` | PVC | DG-G-DG | $2,570.00 |
| `HBC078` | HYP | DG-G-DG | $4,190.00 |
| `HBC079` | PVC | B-G-DG | $2,570.00 |
| `HBC080` | HYP | B-G-DG | $4,190.00 |
| `HBC162` | HYP | I-B-C | $4,190.00 |

</details>

#### CL380MAX

| Field | Value |
|---|---|
| Model ID (slug) | `cl380max` |
| Total Variants | 9 |
| HYP Variants | 5 SKUs |
| PVC Variants | 4 SKUs |
| Factory Price Range (USD) | $2,570.00 – $4,190.00 |

**Optional Factory Extras (from boats sheet):**
- [Console] "? FCT8 with EP & Steering system & Carbon dash — USD $1,386.00

**Equipment Sheet Items (3 matched):**
- [Cover] Boat cover for CL380 (`HEO031`) — USD $369.00
- [EVA Teak] EVA teak for  CL380 (`HEF 021`) — USD $289.00
- [EVA Teak] EVA teak for  CL380 (`HEF 021-GB`) — USD $289.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBC147` | PVC | LG-W-WD | $2,570.00 |
| `HBC148` | HYP | LG-W-WD | $4,190.00 |
| `HBC149` | PVC | DG-G-DG | $2,570.00 |
| `HBC150` | HYP | DG-G-DG | $4,190.00 |
| `HBC151` | PVC | B-G-DG | $2,570.00 |
| `HBC152` | HYP | B-G-DG | $4,190.00 |
| `HBC163` | HYP | I-B-C | $4,190.00 |
| `HBC145` | PVC | W-W-WD | $2,570.00 |
| `HBC146` | HYP | W-W-WD | $4,190.00 |

</details>

#### CL400

| Field | Value |
|---|---|
| Model ID (slug) | `cl400` |
| Total Variants | 9 |
| HYP Variants | 5 SKUs |
| PVC Variants | 4 SKUs |
| Factory Price Range (USD) | $4,472.00 – $6,118.00 |

**Standard Equipment (included in base price):**
- "? EVA teak for  CL400

**Equipment Sheet Items (5 matched):**
- [Cover] Boat cover for CL400 (`HEO011`) — USD $406.00
- [EVA Teak] EVA teak for  CL400 (`HEF 038`) — USD $333.00
- [EVA Teak] EVA teak for  CL400 (`HEF 038-GB`) — USD $333.00
- [Electronics Package] EP for CL400 (`HEO024`) — USD $339.00
- [Roll Bar & Ladder] Roll bar for CL400 (`HER107`) — USD $330.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBC087` | PVC | B-G-DG | $4,472.00 |
| `HBC088` | HYP | B-G-DG | $6,118.00 |
| `HBC164` | HYP | I-B-C | $6,118.00 |
| `HBC081` | PVC | W-W-WD | $4,472.00 |
| `HBC082` | HYP | W-W-WD | $6,118.00 |
| `HBC083` | PVC | LG-W-WD | $4,472.00 |
| `HBC084` | HYP | LG-W-WD | $6,118.00 |
| `HBC085` | PVC | DG-G-DG | $4,472.00 |
| `HBC086` | HYP | DG-G-DG | $6,118.00 |

</details>

#### CL420

| Field | Value |
|---|---|
| Model ID (slug) | `cl420` |
| Total Variants | 9 |
| HYP Variants | 5 SKUs |
| PVC Variants | 4 SKUs |
| Factory Price Range (USD) | $5,073.00 – $6,799.00 |

**Standard Equipment (included in base price):**
- "? Anti-skid decking for  PA420

**Equipment Sheet Items (9 matched):**
- [Cover] Boat cover for CL420 (`HEO032`) — USD $443.00
- [EVA Teak] EVA teak for  CL420 (`HEF 022`) — USD $385.00
- [EVA Teak] EVA teak for  CL420 (`HEF 022-GB`) — USD $385.00
- [Electronics Package] EP for CL420 (`HEO023`) — USD $339.00
- [Roll Bar & Ladder] Roll bar for CL420 (`HER108`) — USD $306.00
- [Roll Bar & Ladder] Roll bar for CL420 (`HER001-W`) — USD $306.00
- [Roll Bar & Ladder] Roll bar for CL420 (`HER001-G`) — USD $306.00
- [Roll Bar & Ladder] Roll bar for CL420 (`HER001-B`) — USD $306.00
- [Spare Parts] Mechanical steering for CL420 (`HEP085`) — USD $166.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBC089` | PVC | W-W-WD | $5,073.00 |
| `HBC090` | HYP | W-W-WD | $6,799.00 |
| `HBC091` | PVC | LG-W-WD | $5,073.00 |
| `HBC092` | HYP | LG-W-WD | $6,799.00 |
| `HBC093` | PVC | DG-G-DG | $5,073.00 |
| `HBC094` | HYP | DG-G-DG | $6,799.00 |
| `HBC095` | PVC | B-G-DG | $5,073.00 |
| `HBC096` | HYP | B-G-DG | $6,799.00 |
| `HBC165` | HYP | I-B-C | $6,799.00 |

</details>

#### CL460

| Field | Value |
|---|---|
| Model ID (slug) | `cl460` |
| Total Variants | 9 |
| HYP Variants | 5 SKUs |
| PVC Variants | 4 SKUs |
| Factory Price Range (USD) | $5,482.00 – $7,682.00 |

**Standard Equipment (included in base price):**
- "? EVA teak for  CL460

**Equipment Sheet Items (8 matched):**
- [Cover] Boat cover for CL460 (`HEO033`) — USD $443.00
- [EVA Teak] EVA teak for  CL460 (`HEF 023`) — USD $450.00
- [EVA Teak] EVA teak for  CL460 (`HEF 023-GB`) — USD $450.00
- [Electronics Package] EP for CL460 (`HEO000`) — USD $339.00
- [Roll Bar & Ladder] Roll bar for CL460 (`HER109`) — USD $306.00
- [Roll Bar & Ladder] Roll bar for CL460 (`HER002-G`) — USD $306.00
- [Roll Bar & Ladder] Roll bar for CL460 (`HER002-W`) — USD $306.00
- [Roll Bar & Ladder] Roll bar for CL460 (`HER002-B`) — USD $306.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBC101` | PVC | DG-G-DG | $5,482.00 |
| `HBC102` | HYP | DG-G-DG | $7,682.00 |
| `HBC103` | PVC | B-G-DG | $5,482.00 |
| `HBC104` | HYP | B-G-DG | $7,682.00 |
| `HBC166` | HYP | I-B-C | $7,682.00 |
| `HBC097` | PVC | W-W-WD | $5,482.00 |
| `HBC098` | HYP | W-W-WD | $7,682.00 |
| `HBC099` | PVC | LG-W-WD | $5,482.00 |
| `HBC100` | HYP | LG-W-WD | $7,682.00 |

</details>

### Coaster Range (`Coaster` prefix)

> Highfield Coaster series — rigid fibreglass hull with inflatable collar, bridging the gap between a RIB and a traditional fibreglass boat.

**Slug**: `coaster`  
**Models**: 3

#### Coaster 540 ST

| Field | Value |
|---|---|
| Model ID (slug) | `coaster-540-st` |
| Total Variants | 3 |
| HYP Variants | 0 SKUs |
| PVC Variants | 3 SKUs |
| Factory Price (USD) | $8,233.00 |

**Standard Equipment (included in base price):**
- "? SUS700 for Coaster with EP

**Equipment Sheet Items (2 matched):**
- [Electronics Package] EP for Coaster 540 Open (`HEO058`) — USD $346.00
- [Spare Parts] Mechanical steering system for Coaster 540 (`HEP109`) — USD $166.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBP271` | PVC | LG-W-DG | $8,233.00 |
| `HBP272` | PVC | DG-G-DB | $8,233.00 |
| `HBP273` | PVC | B-B-DB | $8,233.00 |

</details>

#### Coaster 540 open

| Field | Value |
|---|---|
| Model ID (slug) | `coaster-540-open` |
| Total Variants | 3 |
| HYP Variants | 0 SKUs |
| PVC Variants | 3 SKUs |
| Factory Price (USD) | $7,235.00 |

**Standard Equipment (included in base price):**
- "? FS700 for Coaster

**Equipment Sheet Items (2 matched):**
- [Electronics Package] EP for Coaster 540 Open (`HEO058`) — USD $346.00
- [Spare Parts] Mechanical steering system for Coaster 540 (`HEP109`) — USD $166.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBP274` | PVC | LG-W-DG | $7,235.00 |
| `HBP275` | PVC | DG-G-DB | $7,235.00 |
| `HBP276` | PVC | B-B-DB | $7,235.00 |

</details>

#### Coaster 600 ST

| Field | Value |
|---|---|
| Model ID (slug) | `coaster-600-st` |
| Total Variants | 1 |
| HYP Variants | 0 SKUs |
| PVC Variants | 1 SKUs |
| Factory Price (USD) | $11,807.00 |

**Standard Equipment (included in base price):**
- "? SUS700 for Coaster with EP

**Equipment Sheet Items (1 matched):**
- [Spare Parts] Mechanical steering system for Coaster 600 (`HEO060`) — USD $179.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HB600` | PVC | DG-G-DB | $11,807.00 |

</details>

### Patrol Range (`PA` prefix)

> Highfield Patrol series — heavy-duty commercial-grade RIBs built for professional use: search and rescue, military, patrol and workboat applications.

**Slug**: `patrol`  
**Models**: 16

#### PA420

| Field | Value |
|---|---|
| Model ID (slug) | `pa420` |
| Total Variants | 10 |
| HYP Variants | 5 SKUs |
| PVC Variants | 5 SKUs |
| Factory Price Range (USD) | $4,919.00 – $7,288.00 |

**Standard Equipment (included in base price):**
- "? Anti-skid decking for  PA420

**Equipment Sheet Items (18 matched):**
- [EVA Teak] Anti-skid decking for  PA420 (`HEF 007`) — USD $385.00
- [EVA Teak] Anti-skid decking for  PA420 (`HEF 007-G`) — USD $385.00
- [EVA Teak] Anti-skid decking for  PA420 (`HEF 007-B`) — USD $385.00
- [Electronics Package] EP for PA420 (`HEE015`) — USD $339.00
- [Roll Bar & Ladder] Roll bar for PA420 (`HER012`) — USD $306.00
- [Roll Bar & Ladder] Roll bar for PA420 (`HER012-W`) — USD $306.00
- [Roll Bar & Ladder] Roll bar for PA420 (`HER012-G`) — USD $306.00
- [Roll Bar & Ladder] Roll bar for PA420 (`HER012-B`) — USD $306.00
- [Roll Bar & Ladder] Transom ladder for PA420 (`HEL010`) — USD $129.00
- [Spare Parts] Highfield logo  PVC 600*100MM(For PA420-500) (`LH600P`) — USD $57.00
- [Spare Parts] Highfield logo  HYP 600*100MM(For PA420-500) (`LH600H`) — USD $107.00
- [Spare Parts] AL bow step for PA420 (`HEO082`) — USD $155.00
- [Spare Parts] Mechanical steering for PA420 (`HEO079`) — USD $153.00
- [Tow Post] Rear tow post for PA420 (`HET050`) — USD $417.00
- [Tow Post] Tow post for PA420-460 (`HEP019`) — USD $417.00
- [Tow Post] Tow post for PA420-460 (`HEP019-W`) — USD $417.00
- [Tow Post] Tow post for PA420-460 (`HEP019-G`) — USD $417.00
- [Tow Post] Tow post for PA420-460 (`HEP019-B`) — USD $417.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBP081` | PVC | LG-W-DG | $4,919.00 |
| `HBP082` | HYP | LG-W-DG | $6,646.00 |
| `HBP083` | PVC | DG-G-DG | $4,919.00 |
| `HBP084` | HYP | DG-G-DG | $6,646.00 |
| `HBP085` | PVC | O-G-DG | $5,335.00 |
| `HBP086` | HYP | O-G-DG | $7,288.00 |
| `HBP087` | PVC | R-B-B | $5,335.00 |
| `HBP088` | HYP | R-B-B | $7,288.00 |
| `HBP089` | PVC | B-B-B | $4,919.00 |
| `HBP090` | HYP | B-B-B | $6,646.00 |

</details>

#### PA460

| Field | Value |
|---|---|
| Model ID (slug) | `pa460` |
| Total Variants | 10 |
| HYP Variants | 5 SKUs |
| PVC Variants | 5 SKUs |
| Factory Price Range (USD) | $5,330.00 – $7,530.00 |

**Standard Equipment (included in base price):**
- "? Anti-skid decking for  PA460

**Equipment Sheet Items (12 matched):**
- [EVA Teak] Anti-skid decking for  PA460 (`HEF 008`) — USD $450.00
- [EVA Teak] Anti-skid decking for  PA460 (`HEF 008-G`) — USD $450.00
- [EVA Teak] Anti-skid decking for  PA460 (`HEF 008-B`) — USD $450.00
- [Electronics Package] EP for PA460 (`HEE038`) — USD $339.00
- [Roll Bar & Ladder] Roll bar for PA460 (`HER013`) — USD $306.00
- [Roll Bar & Ladder] Roll bar for PA460 (`HER013-W`) — USD $306.00
- [Roll Bar & Ladder] Roll bar for PA460 (`HER013-G`) — USD $306.00
- [Roll Bar & Ladder] Roll bar for PA460 (`HER013-B`) — USD $306.00
- [Roll Bar & Ladder] Transom ladder for PA460 (`HEL001`) — USD $129.00
- [Spare Parts] Mechanical steering for PA460 (`HEP084`) — USD $166.00
- [Spare Parts] AL bow step for PA460 (`HEO083`) — USD $155.00
- [Tow Post] Rear tow post for PA460 (`HET051`) — USD $417.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBP103` | PVC | DG-G-DG | $5,330.00 |
| `HBP104` | HYP | DG-G-DG | $7,530.00 |
| `HBP105` | PVC | O-G-DG | $5,330.00 |
| `HBP106` | HYP | O-G-DG | $7,530.00 |
| `HBP107` | PVC | R-B-B | $5,330.00 |
| `HBP108` | HYP | R-B-B | $7,530.00 |
| `HBP109` | PVC | B-B-B | $5,330.00 |
| `HBP110` | HYP | B-B-B | $7,530.00 |
| `HBP101` | PVC | LG-W-DG | $5,330.00 |
| `HBP102` | HYP | LG-W-DG | $7,530.00 |

</details>

#### PA500

| Field | Value |
|---|---|
| Model ID (slug) | `pa500` |
| Total Variants | 10 |
| HYP Variants | 5 SKUs |
| PVC Variants | 5 SKUs |
| Factory Price Range (USD) | $7,071.00 – $9,616.00 |

**Standard Equipment (included in base price):**
- "? Anti-skid decking for  PA500

**Equipment Sheet Items (16 matched):**
- [EVA Teak] Anti-skid decking for  PA500 (`HEF 009`) — USD $514.00
- [EVA Teak] Anti-skid decking for  PA500 (`HEF 009-G`) — USD $514.00
- [EVA Teak] Anti-skid decking for  PA500 (`HEF 009-B`) — USD $514.00
- [Electronics Package] EP for PA500 (`HEE016`) — USD $346.00
- [Roll Bar & Ladder] Roll bar for PA500 (`HER014`) — USD $354.00
- [Roll Bar & Ladder] Roll bar for PA500 (`HER014-W`) — USD $354.00
- [Roll Bar & Ladder] Roll bar for PA500 (`HER014-G`) — USD $354.00
- [Roll Bar & Ladder] Roll bar for PA500 (`HER014-B`) — USD $354.00
- [Roll Bar & Ladder] Transom ladder for PA500 (`HEL002`) — USD $129.00
- [Spare Parts] Mechanical steering for PA500 (`HEP086`) — USD $166.00
- [Spare Parts] AL bow step for PA500 (`HEO084`) — USD $142.00
- [Tow Post] Rear tow post for PA500 (`HET052`) — USD $486.00
- [Tow Post] Tow post for PA500 (`HEP020`) — USD $486.00
- [Tow Post] Tow post for PA500 (`HEP020-W`) — USD $486.00
- [Tow Post] Tow post for PA500 (`HEP020-G`) — USD $486.00
- [Tow Post] Tow post for PA500 (`HEP020-B`) — USD $486.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBP122` | HYP | LG-W-DG | $9,616.00 |
| `HBP123` | PVC | DG-G-DG | $7,071.00 |
| `HBP124` | HYP | DG-G-DG | $9,616.00 |
| `HBP125` | PVC | O-G-DG | $7,071.00 |
| `HBP126` | HYP | O-G-DG | $9,616.00 |
| `HBP127` | PVC | R-B-B | $7,071.00 |
| `HBP128` | HYP | R-B-B | $9,616.00 |
| `HBP129` | PVC | B-B-B | $7,071.00 |
| `HBP130` | HYP | B-B-B | $9,616.00 |
| `HBP121` | PVC | LG-W-DG | $7,071.00 |

</details>

#### PA540 open

| Field | Value |
|---|---|
| Model ID (slug) | `pa540-open` |
| Total Variants | 10 |
| HYP Variants | 5 SKUs |
| PVC Variants | 5 SKUs |
| Factory Price Range (USD) | $7,545.00 – $10,418.00 |

**Standard Equipment (included in base price):**
- "? Anti-skid decking for  PA540 PA600

**Equipment Sheet Items (15 matched):**
- [Cover] Harbor cover for PA540 (PA540 SUS900+FS900 ) (`HEO104`) — USD $237.00
- [EVA Teak] Anti-skid decking for  PA540 PA600 (`HEF 010`) — USD $579.00
- [EVA Teak] Anti-skid decking for  PA540 PA600 (`HEF 010-G`) — USD $579.00
- [EVA Teak] Anti-skid decking for  PA540 PA600 (`HEF 010-B`) — USD $579.00
- [Electronics Package] EP for PA540 (`HEE039`) — USD $346.00
- [Roll Bar & Ladder] Roll bar for PA540 (`HER015`) — USD $385.00
- [Roll Bar & Ladder] Roll bar for PA540 (`HER015-W`) — USD $385.00
- [Roll Bar & Ladder] Roll bar for PA540 (`HER015-G`) — USD $385.00
- [Roll Bar & Ladder] Roll bar for PA540 (`HER015-B`) — USD $385.00
- [Roll Bar & Ladder] Transom ladder for PA540 (`HEL003`) — USD $129.00
- [Spare Parts] Bollard for PA540 (`HEP092`) — USD $90.00
- [Spare Parts] Highfield logo  PVC 900*150MM(For PA540-PA700) (`LH900P`) — USD $74.00
- [Spare Parts] Highfield logo  HYP 900*150MM(For PA540-PA700) (`LH900H`) — USD $155.00
- [Spare Parts] AL bow step for PA540 (`HEO085`) — USD $142.00
- [Spare Parts] Mechanical steering for PA540 (`HEO080`) — USD $166.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBP144` | HYP | DG-G-DG | $10,418.00 |
| `HBP145` | PVC | O-G-DG | $7,545.00 |
| `HBP146` | HYP | O-G-DG | $10,418.00 |
| `HBP147` | PVC | R-B-B | $7,545.00 |
| `HBP148` | HYP | R-B-B | $10,418.00 |
| `HBP149` | PVC | B-B-B | $7,545.00 |
| `HBP150` | HYP | B-B-B | $10,418.00 |
| `HBP141` | PVC | LG-W-DG | $7,545.00 |
| `HBP142` | HYP | LG-W-DG | $10,418.00 |
| `HBP143` | PVC | DG-G-DG | $7,545.00 |

</details>

#### PA540ST

| Field | Value |
|---|---|
| Model ID (slug) | `pa540st` |
| Total Variants | 10 |
| HYP Variants | 5 SKUs |
| PVC Variants | 5 SKUs |
| Factory Price Range (USD) | $8,741.00 – $12,124.00 |

**Standard Equipment (included in base price):**
- "? Anti-skid decking for  PA540 PA600

**Equipment Sheet Items (15 matched):**
- [Cover] Harbor cover for PA540 (PA540 SUS900+FS900 ) (`HEO104`) — USD $237.00
- [EVA Teak] Anti-skid decking for  PA540 PA600 (`HEF 010`) — USD $579.00
- [EVA Teak] Anti-skid decking for  PA540 PA600 (`HEF 010-G`) — USD $579.00
- [EVA Teak] Anti-skid decking for  PA540 PA600 (`HEF 010-B`) — USD $579.00
- [Electronics Package] EP for PA540 (`HEE039`) — USD $346.00
- [Roll Bar & Ladder] Roll bar for PA540 (`HER015`) — USD $385.00
- [Roll Bar & Ladder] Roll bar for PA540 (`HER015-W`) — USD $385.00
- [Roll Bar & Ladder] Roll bar for PA540 (`HER015-G`) — USD $385.00
- [Roll Bar & Ladder] Roll bar for PA540 (`HER015-B`) — USD $385.00
- [Roll Bar & Ladder] Transom ladder for PA540 (`HEL003`) — USD $129.00
- [Spare Parts] Bollard for PA540 (`HEP092`) — USD $90.00
- [Spare Parts] Highfield logo  PVC 900*150MM(For PA540-PA700) (`LH900P`) — USD $74.00
- [Spare Parts] Highfield logo  HYP 900*150MM(For PA540-PA700) (`LH900H`) — USD $155.00
- [Spare Parts] AL bow step for PA540 (`HEO085`) — USD $142.00
- [Spare Parts] Mechanical steering for PA540 (`HEO080`) — USD $166.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBP169` | PVC | B-B-B | $8,741.00 |
| `HBP170` | HYP | B-B-B | $12,124.00 |
| `HBP161` | PVC | LG-W-DG | $8,741.00 |
| `HBP162` | HYP | LG-W-DG | $12,124.00 |
| `HBP163` | PVC | DG-G-DG | $8,741.00 |
| `HBP164` | HYP | DG-G-DG | $12,124.00 |
| `HBP165` | PVC | O-G-DG | $8,741.00 |
| `HBP166` | HYP | O-G-DG | $12,124.00 |
| `HBP167` | PVC | R-B-B | $8,741.00 |
| `HBP168` | HYP | R-B-B | $12,124.00 |

</details>

#### PA600 open

| Field | Value |
|---|---|
| Model ID (slug) | `pa600-open` |
| Total Variants | 10 |
| HYP Variants | 5 SKUs |
| PVC Variants | 5 SKUs |
| Factory Price Range (USD) | $10,426.00 – $14,555.00 |

**Standard Equipment (included in base price):**
- "? Anti-skid decking for  PA600

**Equipment Sheet Items (18 matched):**
- [Cover] Harbor cover for PA600 (SUS970+FS900 ) (`HEO041`) — USD $313.00
- [EVA Teak] Anti-skid decking for  PA600 (`HEF 011`) — USD $802.00
- [EVA Teak] Anti-skid decking for  PA600 (`HEF 011-G`) — USD $802.00
- [EVA Teak] Anti-skid decking for  PA600 (`HEF 011-B`) — USD $802.00
- [EVA Teak] Anti-skid decking for  PA540 PA600 (`HEF 010`) — USD $579.00
- [EVA Teak] Anti-skid decking for  PA540 PA600 (`HEF 010-G`) — USD $579.00
- [EVA Teak] Anti-skid decking for  PA540 PA600 (`HEF 010-B`) — USD $579.00
- [Electronics Package] EP for PA600 (`HEE017`) — USD $441.00
- [Roll Bar & Ladder] Roll bar for PA600 (`HER016`) — USD $385.00
- [Roll Bar & Ladder] Roll bar with ladder for PA600 (`HER021`) — USD $918.00
- [Roll Bar & Ladder] Roll bar with ladder for PA600 (`HER021-G`) — USD $918.00
- [Roll Bar & Ladder] Roll bar with ladder for PA600 (`HER021-B`) — USD $918.00
- [Roll Bar & Ladder] Roll bar with ladder for PA600 (`HER021-W`) — USD $918.00
- [Roll Bar & Ladder] Roll bar for PA600 (`HER016-W`) — USD $385.00
- [Roll Bar & Ladder] Roll bar for PA600 (`HER016-G`) — USD $385.00
- [Roll Bar & Ladder] Roll bar for PA600 (`HER016-B`) — USD $385.00
- [Roll Bar & Ladder] Transom ladder for PA600 (`HEL004`) — USD $129.00
- [Spare Parts] AL bow step for PA600 (`HEO086`) — USD $155.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBP190` | HYP | B-B-B | $14,555.00 |
| `HBP181` | PVC | LG-W-DG | $10,426.00 |
| `HBP182` | HYP | LG-W-DG | $14,555.00 |
| `HBP183` | PVC | DG-G-DG | $10,426.00 |
| `HBP184` | HYP | DG-G-DG | $14,555.00 |
| `HBP185` | PVC | O-G-DG | $10,426.00 |
| `HBP186` | HYP | O-G-DG | $14,555.00 |
| `HBP187` | PVC | R-B-B | $10,426.00 |
| `HBP188` | HYP | R-B-B | $14,555.00 |
| `HBP189` | PVC | B-B-B | $10,426.00 |

</details>

#### PA600EW

| Field | Value |
|---|---|
| Model ID (slug) | `pa600ew` |
| Total Variants | 10 |
| HYP Variants | 5 SKUs |
| PVC Variants | 5 SKUs |
| Factory Price Range (USD) | $11,807.00 – $16,054.00 |

**Standard Equipment (included in base price):**
- "? Anti-skid decking for  PA600

**Equipment Sheet Items (18 matched):**
- [Cover] Harbor cover for PA600 (SUS970+FS900 ) (`HEO041`) — USD $313.00
- [EVA Teak] Anti-skid decking for  PA600 (`HEF 011`) — USD $802.00
- [EVA Teak] Anti-skid decking for  PA600 (`HEF 011-G`) — USD $802.00
- [EVA Teak] Anti-skid decking for  PA600 (`HEF 011-B`) — USD $802.00
- [EVA Teak] Anti-skid decking for  PA540 PA600 (`HEF 010`) — USD $579.00
- [EVA Teak] Anti-skid decking for  PA540 PA600 (`HEF 010-G`) — USD $579.00
- [EVA Teak] Anti-skid decking for  PA540 PA600 (`HEF 010-B`) — USD $579.00
- [Electronics Package] EP for PA600 (`HEE017`) — USD $441.00
- [Roll Bar & Ladder] Roll bar for PA600 (`HER016`) — USD $385.00
- [Roll Bar & Ladder] Roll bar with ladder for PA600 (`HER021`) — USD $918.00
- [Roll Bar & Ladder] Roll bar with ladder for PA600 (`HER021-G`) — USD $918.00
- [Roll Bar & Ladder] Roll bar with ladder for PA600 (`HER021-B`) — USD $918.00
- [Roll Bar & Ladder] Roll bar with ladder for PA600 (`HER021-W`) — USD $918.00
- [Roll Bar & Ladder] Roll bar for PA600 (`HER016-W`) — USD $385.00
- [Roll Bar & Ladder] Roll bar for PA600 (`HER016-G`) — USD $385.00
- [Roll Bar & Ladder] Roll bar for PA600 (`HER016-B`) — USD $385.00
- [Roll Bar & Ladder] Transom ladder for PA600 (`HEL004`) — USD $129.00
- [Spare Parts] AL bow step for PA600 (`HEO086`) — USD $155.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBP160` | HYP | B-B-B | $16,054.00 |
| `HBP151` | PVC | LG-W-DG | $11,807.00 |
| `HBP152` | HYP | LG-W-DG | $16,054.00 |
| `HBP153` | PVC | DG-G-DG | $11,807.00 |
| `HBP154` | HYP | DG-G-DG | $16,054.00 |
| `HBP155` | PVC | O-G-DG | $11,807.00 |
| `HBP156` | HYP | O-G-DG | $16,054.00 |
| `HBP157` | PVC | R-B-B | $11,807.00 |
| `HBP158` | HYP | R-B-B | $16,054.00 |
| `HBP159` | PVC | B-B-B | $11,807.00 |

</details>

#### PA600ST

| Field | Value |
|---|---|
| Model ID (slug) | `pa600st` |
| Total Variants | 10 |
| HYP Variants | 5 SKUs |
| PVC Variants | 5 SKUs |
| Factory Price Range (USD) | $11,807.00 – $16,054.00 |

**Standard Equipment (included in base price):**
- "? Anti-skid decking for  PA600

**Equipment Sheet Items (18 matched):**
- [Cover] Harbor cover for PA600 (SUS970+FS900 ) (`HEO041`) — USD $313.00
- [EVA Teak] Anti-skid decking for  PA600 (`HEF 011`) — USD $802.00
- [EVA Teak] Anti-skid decking for  PA600 (`HEF 011-G`) — USD $802.00
- [EVA Teak] Anti-skid decking for  PA600 (`HEF 011-B`) — USD $802.00
- [EVA Teak] Anti-skid decking for  PA540 PA600 (`HEF 010`) — USD $579.00
- [EVA Teak] Anti-skid decking for  PA540 PA600 (`HEF 010-G`) — USD $579.00
- [EVA Teak] Anti-skid decking for  PA540 PA600 (`HEF 010-B`) — USD $579.00
- [Electronics Package] EP for PA600 (`HEE017`) — USD $441.00
- [Roll Bar & Ladder] Roll bar for PA600 (`HER016`) — USD $385.00
- [Roll Bar & Ladder] Roll bar with ladder for PA600 (`HER021`) — USD $918.00
- [Roll Bar & Ladder] Roll bar with ladder for PA600 (`HER021-G`) — USD $918.00
- [Roll Bar & Ladder] Roll bar with ladder for PA600 (`HER021-B`) — USD $918.00
- [Roll Bar & Ladder] Roll bar with ladder for PA600 (`HER021-W`) — USD $918.00
- [Roll Bar & Ladder] Roll bar for PA600 (`HER016-W`) — USD $385.00
- [Roll Bar & Ladder] Roll bar for PA600 (`HER016-G`) — USD $385.00
- [Roll Bar & Ladder] Roll bar for PA600 (`HER016-B`) — USD $385.00
- [Roll Bar & Ladder] Transom ladder for PA600 (`HEL004`) — USD $129.00
- [Spare Parts] AL bow step for PA600 (`HEO086`) — USD $155.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBP201` | PVC | LG-W-DG | $11,807.00 |
| `HBP202` | HYP | LG-W-DG | $16,054.00 |
| `HBP203` | PVC | DG-G-DG | $11,807.00 |
| `HBP204` | HYP | DG-G-DG | $16,054.00 |
| `HBP205` | PVC | O-G-DG | $11,807.00 |
| `HBP206` | HYP | O-G-DG | $16,054.00 |
| `HBP207` | PVC | R-B-B | $11,807.00 |
| `HBP208` | HYP | R-B-B | $16,054.00 |
| `HBP209` | PVC | B-B-B | $11,807.00 |
| `HBP210` | HYP | B-B-B | $16,054.00 |

</details>

#### PA660EW

| Field | Value |
|---|---|
| Model ID (slug) | `pa660ew` |
| Total Variants | 10 |
| HYP Variants | 5 SKUs |
| PVC Variants | 5 SKUs |
| Factory Price Range (USD) | $15,536.00 – $19,604.00 |

**Standard Equipment (included in base price):**
- "? Anti-skid decking for  PA660

**Equipment Sheet Items (19 matched):**
- [Cover] Harbor cover for PA660 (SUS900+BOL950 ) (`HEO103`) — USD $237.00
- [EVA Teak] Anti-skid decking for  PA660 (`HEF 012`) — USD $802.00
- [EVA Teak] Anti-skid decking for  PA660 (`HEF 012-G`) — USD $802.00
- [EVA Teak] Anti-skid decking for  PA660 (`HEF 012-B`) — USD $802.00
- [Electronics Package] EP for PA660 (`HEE040`) — USD $441.00
- [Roll Bar & Ladder] Roll bar for PA660 (`HER017`) — USD $385.00
- [Roll Bar & Ladder] Roll bar with ladder for PA660 (`HER022`) — USD $918.00
- [Roll Bar & Ladder] Roll bar with ladder for PA660 (`HER022-G`) — USD $918.00
- [Roll Bar & Ladder] Roll bar with ladder for PA660 (`HER022-B`) — USD $918.00
- [Roll Bar & Ladder] Roll bar with ladder for PA660 (`HER022-W`) — USD $918.00
- [Roll Bar & Ladder] Roll bar for PA660 (`HER017-W`) — USD $385.00
- [Roll Bar & Ladder] Roll bar for PA660 (`HER017-G`) — USD $385.00
- [Roll Bar & Ladder] Roll bar for PA660 (`HER017-B`) — USD $385.00
- [Roll Bar & Ladder] Transom ladder for PA660 (`HEL005`) — USD $129.00
- [Spare Parts] AL bow step for PA660 (`HEO087`) — USD $155.00
- [Spare Parts] Bollard for PA660 (`HEO081`) — USD $92.00
- [Spare Parts] Flag holder(For PA660/760/860) (`HEP007B`) — USD $143.00
- [Spare Parts] Flag holder(For PA660/760/860) (`HEP007W`) — USD $143.00
- [Spare Parts] Flag holder(For PA660/760/860) (`HEP007G`) — USD $143.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBP171` | PVC | LG-W-DG | $15,536.00 |
| `HBP172` | HYP | LG-W-DG | $19,604.00 |
| `HBP173` | PVC | DG-G-DG | $15,536.00 |
| `HBP174` | HYP | DG-G-DG | $19,604.00 |
| `HBP175` | PVC | O-G-DG | $15,536.00 |
| `HBP176` | HYP | O-G-DG | $19,604.00 |
| `HBP177` | PVC | R-B-B | $15,536.00 |
| `HBP178` | HYP | R-B-B | $19,604.00 |
| `HBP179` | PVC | B-B-B | $15,536.00 |
| `HBP180` | HYP | B-B-B | $19,604.00 |

</details>

#### PA660ST

| Field | Value |
|---|---|
| Model ID (slug) | `pa660st` |
| Total Variants | 10 |
| HYP Variants | 5 SKUs |
| PVC Variants | 5 SKUs |
| Factory Price Range (USD) | $15,536.00 – $19,604.00 |

**Standard Equipment (included in base price):**
- "? Anti-skid decking for  PA660

**Equipment Sheet Items (19 matched):**
- [Cover] Harbor cover for PA660 (SUS900+BOL950 ) (`HEO103`) — USD $237.00
- [EVA Teak] Anti-skid decking for  PA660 (`HEF 012`) — USD $802.00
- [EVA Teak] Anti-skid decking for  PA660 (`HEF 012-G`) — USD $802.00
- [EVA Teak] Anti-skid decking for  PA660 (`HEF 012-B`) — USD $802.00
- [Electronics Package] EP for PA660 (`HEE040`) — USD $441.00
- [Roll Bar & Ladder] Roll bar for PA660 (`HER017`) — USD $385.00
- [Roll Bar & Ladder] Roll bar with ladder for PA660 (`HER022`) — USD $918.00
- [Roll Bar & Ladder] Roll bar with ladder for PA660 (`HER022-G`) — USD $918.00
- [Roll Bar & Ladder] Roll bar with ladder for PA660 (`HER022-B`) — USD $918.00
- [Roll Bar & Ladder] Roll bar with ladder for PA660 (`HER022-W`) — USD $918.00
- [Roll Bar & Ladder] Roll bar for PA660 (`HER017-W`) — USD $385.00
- [Roll Bar & Ladder] Roll bar for PA660 (`HER017-G`) — USD $385.00
- [Roll Bar & Ladder] Roll bar for PA660 (`HER017-B`) — USD $385.00
- [Roll Bar & Ladder] Transom ladder for PA660 (`HEL005`) — USD $129.00
- [Spare Parts] AL bow step for PA660 (`HEO087`) — USD $155.00
- [Spare Parts] Bollard for PA660 (`HEO081`) — USD $92.00
- [Spare Parts] Flag holder(For PA660/760/860) (`HEP007B`) — USD $143.00
- [Spare Parts] Flag holder(For PA660/760/860) (`HEP007W`) — USD $143.00
- [Spare Parts] Flag holder(For PA660/760/860) (`HEP007G`) — USD $143.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBP221` | PVC | LG-W-DG | $15,536.00 |
| `HBP222` | HYP | LG-W-DG | $19,604.00 |
| `HBP223` | PVC | DG-G-DG | $15,536.00 |
| `HBP224` | HYP | DG-G-DG | $19,604.00 |
| `HBP225` | PVC | O-G-DG | $15,536.00 |
| `HBP226` | HYP | O-G-DG | $19,604.00 |
| `HBP227` | PVC | R-B-B | $15,536.00 |
| `HBP228` | HYP | R-B-B | $19,604.00 |
| `HBP229` | PVC | B-B-B | $15,536.00 |
| `HBP230` | HYP | B-B-B | $19,604.00 |

</details>

#### PA700EW

| Field | Value |
|---|---|
| Model ID (slug) | `pa700ew` |
| Total Variants | 5 |
| Factory Price (USD) | $21,323.00 |

**Standard Equipment (included in base price):**
- "? Anti-skid decking for  PA700

**Equipment Sheet Items (16 matched):**
- [EVA Teak] Anti-skid decking for  PA700 (`HEF 013`) — USD $884.00
- [EVA Teak] Anti-skid decking for  PA700 (`HEF 013-G`) — USD $884.00
- [EVA Teak] Anti-skid decking for  PA700 (`HEF 013-B`) — USD $884.00
- [Electronics Package] EP for PA700 (`HEE041`) — USD $638.00
- [Roll Bar & Ladder] Roll bar for PA700 (`HER018`) — USD $451.00
- [Roll Bar & Ladder] Roll bar with ladder for PA700 (`HER023`) — USD $993.00
- [Roll Bar & Ladder] Roll bar with ladder for PA700 (`HER023-G`) — USD $993.00
- [Roll Bar & Ladder] Roll bar with ladder for PA700 (`HER023-B`) — USD $993.00
- [Roll Bar & Ladder] Roll bar with ladder for PA700 (`HER023-W`) — USD $993.00
- [Roll Bar & Ladder] Roll bar for PA700 (`HER018-W`) — USD $451.00
- [Roll Bar & Ladder] Roll bar for PA700 (`HER018-G`) — USD $451.00
- [Roll Bar & Ladder] Roll bar for PA700 (`HER018-B`) — USD $451.00
- [Roll Bar & Ladder] Transom ladder for PA700 (`HEL006`) — USD $137.00
- [Spare Parts] Highfield logo  PVC 900*150MM(For PA540-PA700) (`LH900P`) — USD $74.00
- [Spare Parts] Highfield logo  HYP 900*150MM(For PA540-PA700) (`LH900H`) — USD $155.00
- [Spare Parts] AL bow step for PA700 (`HEO088`) — USD $163.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBP191` | HYP | LG-W-DG | $21,323.00 |
| `HBP192` | HYP | DG-G-DG | $21,323.00 |
| `HBP193` | HYP | O-G-DG | $21,323.00 |
| `HBP194` | HYP | R-B-B | $21,323.00 |
| `HBP195` | HYP | B-B-B | $21,323.00 |

</details>

#### PA700ST

| Field | Value |
|---|---|
| Model ID (slug) | `pa700st` |
| Total Variants | 5 |
| Factory Price (USD) | $21,323.00 |

**Standard Equipment (included in base price):**
- "? Anti-skid decking for  PA700

**Equipment Sheet Items (16 matched):**
- [EVA Teak] Anti-skid decking for  PA700 (`HEF 013`) — USD $884.00
- [EVA Teak] Anti-skid decking for  PA700 (`HEF 013-G`) — USD $884.00
- [EVA Teak] Anti-skid decking for  PA700 (`HEF 013-B`) — USD $884.00
- [Electronics Package] EP for PA700 (`HEE041`) — USD $638.00
- [Roll Bar & Ladder] Roll bar for PA700 (`HER018`) — USD $451.00
- [Roll Bar & Ladder] Roll bar with ladder for PA700 (`HER023`) — USD $993.00
- [Roll Bar & Ladder] Roll bar with ladder for PA700 (`HER023-G`) — USD $993.00
- [Roll Bar & Ladder] Roll bar with ladder for PA700 (`HER023-B`) — USD $993.00
- [Roll Bar & Ladder] Roll bar with ladder for PA700 (`HER023-W`) — USD $993.00
- [Roll Bar & Ladder] Roll bar for PA700 (`HER018-W`) — USD $451.00
- [Roll Bar & Ladder] Roll bar for PA700 (`HER018-G`) — USD $451.00
- [Roll Bar & Ladder] Roll bar for PA700 (`HER018-B`) — USD $451.00
- [Roll Bar & Ladder] Transom ladder for PA700 (`HEL006`) — USD $137.00
- [Spare Parts] Highfield logo  PVC 900*150MM(For PA540-PA700) (`LH900P`) — USD $74.00
- [Spare Parts] Highfield logo  HYP 900*150MM(For PA540-PA700) (`LH900H`) — USD $155.00
- [Spare Parts] AL bow step for PA700 (`HEO088`) — USD $163.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBP241` | HYP | LG-W-DG | $21,323.00 |
| `HBP242` | HYP | DG-G-DG | $21,323.00 |
| `HBP243` | HYP | O-G-DG | $21,323.00 |
| `HBP244` | HYP | R-B-B | $21,323.00 |
| `HBP245` | HYP | B-B-B | $21,323.00 |

</details>

#### PA760EW

| Field | Value |
|---|---|
| Model ID (slug) | `pa760ew` |
| Total Variants | 5 |
| Factory Price (USD) | $23,403.00 |

**Standard Equipment (included in base price):**
- "? Anti-skid decking for  PA760

**Equipment Sheet Items (23 matched):**
- [EVA Teak] Anti-skid decking for  PA760 (`HEF 014`) — USD $1,365.00
- [EVA Teak] Anti-skid decking for  PA760 (`HEF 014-G`) — USD $1,365.00
- [EVA Teak] Anti-skid decking for  PA760 (`HEF 014-B`) — USD $1,365.00
- [Electronics Package] EP for PA760 (`HEE018`) — USD $638.00
- [Roll Bar & Ladder] Roll bar for PA760 (`HER019`) — USD $451.00
- [Roll Bar & Ladder] Roll bar with ladder for PA760 (`HER024`) — USD $993.00
- [Roll Bar & Ladder] Roll bar with ladder & engine protector for PA760 (`HER026`) — USD $1,203.00
- [Roll Bar & Ladder] Roll bar with ladder for PA760 (`HER024-G`) — USD $993.00
- [Roll Bar & Ladder] Roll bar with ladder for PA760 (`HER024-B`) — USD $993.00
- [Roll Bar & Ladder] Roll bar with ladder for PA760 (`HER024-W`) — USD $993.00
- [Roll Bar & Ladder] Roll bar for PA760 (`HER019-W`) — USD $451.00
- [Roll Bar & Ladder] Roll bar for PA760 (`HER019-G`) — USD $451.00
- [Roll Bar & Ladder] Roll bar for PA760 (`HER019-B`) — USD $451.00
- [Roll Bar & Ladder] Roll bar with ladder & engine protector for PA760 (`HER026-B`) — USD $1,203.00
- [Roll Bar & Ladder] Roll bar with ladder & engine protector for PA760 (`HER026-G`) — USD $1,203.00
- [Roll Bar & Ladder] Roll bar with ladder & engine protector for PA760 (`HER026-W`) — USD $1,203.00
- [Roll Bar & Ladder] Transom ladder for PA760 (`HEL007`) — USD $137.00
- [Spare Parts] Highfield logo  HYP 900*150MM(For PA760) (`LH901H`) — USD $176.00
- [Spare Parts] AL bow step for PA760 (`HEO089`) — USD $163.00
- [Top] T TOP XL for PA760  SU/SUS970 (`HET056-W`) — USD $3,185.00
- [Top] T TOP XL for PA760  SU/SUS970 (`HET056-G`) — USD $3,185.00
- [Top] T TOP XL for PA760  SU/SUS970 (`HET056-B`) — USD $3,185.00
- [Top] T TOP XL for PA760  SU/SUS970 (`HET056`) — USD $3,185.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBP196` | HYP | LG-W-DG | $23,403.00 |
| `HBP197` | HYP | DG-G-DG | $23,403.00 |
| `HBP198` | HYP | O-G-DG | $23,403.00 |
| `HBP199` | HYP | R-B-B | $23,403.00 |
| `HBP200` | HYP | B-B-B | $23,403.00 |

</details>

#### PA760ST

| Field | Value |
|---|---|
| Model ID (slug) | `pa760st` |
| Total Variants | 5 |
| Factory Price (USD) | $23,403.00 |

**Standard Equipment (included in base price):**
- "? Anti-skid decking for  PA760

**Equipment Sheet Items (23 matched):**
- [EVA Teak] Anti-skid decking for  PA760 (`HEF 014`) — USD $1,365.00
- [EVA Teak] Anti-skid decking for  PA760 (`HEF 014-G`) — USD $1,365.00
- [EVA Teak] Anti-skid decking for  PA760 (`HEF 014-B`) — USD $1,365.00
- [Electronics Package] EP for PA760 (`HEE018`) — USD $638.00
- [Roll Bar & Ladder] Roll bar for PA760 (`HER019`) — USD $451.00
- [Roll Bar & Ladder] Roll bar with ladder for PA760 (`HER024`) — USD $993.00
- [Roll Bar & Ladder] Roll bar with ladder & engine protector for PA760 (`HER026`) — USD $1,203.00
- [Roll Bar & Ladder] Roll bar with ladder for PA760 (`HER024-G`) — USD $993.00
- [Roll Bar & Ladder] Roll bar with ladder for PA760 (`HER024-B`) — USD $993.00
- [Roll Bar & Ladder] Roll bar with ladder for PA760 (`HER024-W`) — USD $993.00
- [Roll Bar & Ladder] Roll bar for PA760 (`HER019-W`) — USD $451.00
- [Roll Bar & Ladder] Roll bar for PA760 (`HER019-G`) — USD $451.00
- [Roll Bar & Ladder] Roll bar for PA760 (`HER019-B`) — USD $451.00
- [Roll Bar & Ladder] Roll bar with ladder & engine protector for PA760 (`HER026-B`) — USD $1,203.00
- [Roll Bar & Ladder] Roll bar with ladder & engine protector for PA760 (`HER026-G`) — USD $1,203.00
- [Roll Bar & Ladder] Roll bar with ladder & engine protector for PA760 (`HER026-W`) — USD $1,203.00
- [Roll Bar & Ladder] Transom ladder for PA760 (`HEL007`) — USD $137.00
- [Spare Parts] Highfield logo  HYP 900*150MM(For PA760) (`LH901H`) — USD $176.00
- [Spare Parts] AL bow step for PA760 (`HEO089`) — USD $163.00
- [Top] T TOP XL for PA760  SU/SUS970 (`HET056-W`) — USD $3,185.00
- [Top] T TOP XL for PA760  SU/SUS970 (`HET056-G`) — USD $3,185.00
- [Top] T TOP XL for PA760  SU/SUS970 (`HET056-B`) — USD $3,185.00
- [Top] T TOP XL for PA760  SU/SUS970 (`HET056`) — USD $3,185.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBP251` | HYP | LG-W-DG | $23,403.00 |
| `HBP252` | HYP | DG-G-DG | $23,403.00 |
| `HBP253` | HYP | O-G-DG | $23,403.00 |
| `HBP254` | HYP | R-B-B | $23,403.00 |
| `HBP255` | HYP | B-B-B | $23,403.00 |

</details>

#### PA860EW

| Field | Value |
|---|---|
| Model ID (slug) | `pa860ew` |
| Total Variants | 5 |
| Factory Price (USD) | $31,138.00 |

**Standard Equipment (included in base price):**
- "? Anti-skid decking  for  PA860

**Equipment Sheet Items (22 matched):**
- [EVA Teak] Anti-skid decking for  PA860 (`HEF 015`) — USD $1,645.00
- [EVA Teak] Anti-skid decking for  PA860 (`HEF 015-G`) — USD $1,645.00
- [EVA Teak] Anti-skid decking for  PA860 (`HEF 015-B`) — USD $1,645.00
- [Electronics Package] EP for PA860 (`HEE019`) — USD $732.00
- [Roll Bar & Ladder] Roll bar for PA860 (`HER020`) — USD $467.00
- [Roll Bar & Ladder] Roll bar with ladder for PA860 (`HER025`) — USD $1,070.00
- [Roll Bar & Ladder] Roll bar with ladder & engine protector for PA860 (`HER027`) — USD $1,414.00
- [Roll Bar & Ladder] Roll bar with ladder for PA860 (`HER025-G`) — USD $1,070.00
- [Roll Bar & Ladder] Roll bar with ladder for PA860 (`HER025-B`) — USD $1,070.00
- [Roll Bar & Ladder] Roll bar with ladder for PA860 (`HER025-W`) — USD $1,070.00
- [Roll Bar & Ladder] Roll bar for PA860 (`HER020-W`) — USD $467.00
- [Roll Bar & Ladder] Roll bar for PA860 (`HER020-G`) — USD $467.00
- [Roll Bar & Ladder] Roll bar for PA860 (`HER020-B`) — USD $467.00
- [Roll Bar & Ladder] Roll bar with ladder & engine protector for PA860 (`HER027-B`) — USD $1,414.00
- [Roll Bar & Ladder] Roll bar with ladder & engine protector for PA860 (`HER027-G`) — USD $1,414.00
- [Roll Bar & Ladder] Roll bar with ladder & engine protector for PA860 (`HER027-W`) — USD $1,414.00
- [Roll Bar & Ladder] Transom ladder for PA860 (`HEL008`) — USD $137.00
- [Spare Parts] AL bow step for PA860 (`HEO090`) — USD $163.00
- [Top] T TOP XXL for PA860  SU/SUS970 (`HET060-W`) — USD $3,658.00
- [Top] T TOP XXL for PA860  SU/SUS970 (`HET060-G`) — USD $3,658.00
- [Top] T TOP XXL for PA860  SU/SUS970 (`HET060-B`) — USD $3,658.00
- [Top] T TOP XXL for PA860  SU/SUS970 (`HET060`) — USD $3,658.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBP212` | HYP | DG-G-DG | $31,138.00 |
| `HBP213` | HYP | O-G-DG | $31,138.00 |
| `HBP214` | HYP | R-B-B | $31,138.00 |
| `HBP215` | HYP | B-B-B | $31,138.00 |
| `HBP211` | HYP | LG-W-DG | $31,138.00 |

</details>

#### PA860ST

| Field | Value |
|---|---|
| Model ID (slug) | `pa860st` |
| Total Variants | 5 |
| Factory Price (USD) | $31,138.00 |

**Standard Equipment (included in base price):**
- "? Anti-skid decking  for  PA860

**Equipment Sheet Items (22 matched):**
- [EVA Teak] Anti-skid decking for  PA860 (`HEF 015`) — USD $1,645.00
- [EVA Teak] Anti-skid decking for  PA860 (`HEF 015-G`) — USD $1,645.00
- [EVA Teak] Anti-skid decking for  PA860 (`HEF 015-B`) — USD $1,645.00
- [Electronics Package] EP for PA860 (`HEE019`) — USD $732.00
- [Roll Bar & Ladder] Roll bar for PA860 (`HER020`) — USD $467.00
- [Roll Bar & Ladder] Roll bar with ladder for PA860 (`HER025`) — USD $1,070.00
- [Roll Bar & Ladder] Roll bar with ladder & engine protector for PA860 (`HER027`) — USD $1,414.00
- [Roll Bar & Ladder] Roll bar with ladder for PA860 (`HER025-G`) — USD $1,070.00
- [Roll Bar & Ladder] Roll bar with ladder for PA860 (`HER025-B`) — USD $1,070.00
- [Roll Bar & Ladder] Roll bar with ladder for PA860 (`HER025-W`) — USD $1,070.00
- [Roll Bar & Ladder] Roll bar for PA860 (`HER020-W`) — USD $467.00
- [Roll Bar & Ladder] Roll bar for PA860 (`HER020-G`) — USD $467.00
- [Roll Bar & Ladder] Roll bar for PA860 (`HER020-B`) — USD $467.00
- [Roll Bar & Ladder] Roll bar with ladder & engine protector for PA860 (`HER027-B`) — USD $1,414.00
- [Roll Bar & Ladder] Roll bar with ladder & engine protector for PA860 (`HER027-G`) — USD $1,414.00
- [Roll Bar & Ladder] Roll bar with ladder & engine protector for PA860 (`HER027-W`) — USD $1,414.00
- [Roll Bar & Ladder] Transom ladder for PA860 (`HEL008`) — USD $137.00
- [Spare Parts] AL bow step for PA860 (`HEO090`) — USD $163.00
- [Top] T TOP XXL for PA860  SU/SUS970 (`HET060-W`) — USD $3,658.00
- [Top] T TOP XXL for PA860  SU/SUS970 (`HET060-G`) — USD $3,658.00
- [Top] T TOP XXL for PA860  SU/SUS970 (`HET060-B`) — USD $3,658.00
- [Top] T TOP XXL for PA860  SU/SUS970 (`HET060`) — USD $3,658.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBP262` | HYP | DG-G-DG | $31,138.00 |
| `HBP263` | HYP | O-G-DG | $31,138.00 |
| `HBP264` | HYP | R-B-B | $31,138.00 |
| `HBP265` | HYP | B-B-B | $31,138.00 |
| `HBP261` | HYP | LG-W-DG | $31,138.00 |

</details>

### Roll-Up Range (`RU` prefix)

> Highfield Roll-Up series — lightweight, portable inflatable tenders that fold flat for easy stowage. Available in Aluminium and Kamachi (fibreglass) floor variants.

**Slug**: `roll-up`  
**Models**: 12

#### RU200AL

| Field | Value |
|---|---|
| Model ID (slug) | `ru200al` |
| Total Variants | 4 |
| HYP Variants | 2 SKUs |
| PVC Variants | 2 SKUs |
| Factory Price Range (USD) | $666.00 – $1,604.00 |

**Equipment Sheet Items (1 matched):**
- [Spare Parts] RU200 KAM AIR MAT (`HEP064`) — USD $73.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBR021` | PVC | WH | $666.00 |
| `HBR022` | HYP | WH | $1,604.00 |
| `HBR023` | PVC | LG | $666.00 |
| `HBR024` | HYP | LG | $1,283.00 |

</details>

#### RU200KAM

| Field | Value |
|---|---|
| Model ID (slug) | `ru200kam` |
| Total Variants | 4 |
| HYP Variants | 2 SKUs |
| PVC Variants | 2 SKUs |
| Factory Price Range (USD) | $642.00 – $1,625.00 |

**Standard Equipment (included in base price):**
- Plastic seat 74cm

**Equipment Sheet Items (1 matched):**
- [Spare Parts] RU200 KAM AIR MAT (`HEP064`) — USD $73.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBR001` | PVC | WH | $642.00 |
| `HBR002` | HYP | WH | $1,625.00 |
| `HBR003` | PVC | LG | $642.00 |
| `HBR004` | HYP | LG | $1,304.00 |

</details>

#### RU230AL

| Field | Value |
|---|---|
| Model ID (slug) | `ru230al` |
| Total Variants | 4 |
| HYP Variants | 2 SKUs |
| PVC Variants | 2 SKUs |
| Factory Price Range (USD) | $714.00 – $1,634.00 |

**Standard Equipment (included in base price):**
- Plastic seat 74cm

**Equipment Sheet Items (1 matched):**
- [Spare Parts] RU230 KAM AIR MAT (`HEP065`) — USD $78.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBR025` | PVC | WH | $714.00 |
| `HBR026` | HYP | WH | $1,634.00 |
| `HBR027` | PVC | LG | $714.00 |
| `HBR028` | HYP | LG | $1,313.00 |

</details>

#### RU230KAM

| Field | Value |
|---|---|
| Model ID (slug) | `ru230kam` |
| Total Variants | 4 |
| HYP Variants | 2 SKUs |
| PVC Variants | 2 SKUs |
| Factory Price Range (USD) | $698.00 – $1,702.00 |

**Standard Equipment (included in base price):**
- Plastic seat 74cm

**Equipment Sheet Items (1 matched):**
- [Spare Parts] RU230 KAM AIR MAT (`HEP065`) — USD $78.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBR008` | HYP | LG | $1,381.00 |
| `HBR005` | PVC | WH | $698.00 |
| `HBR006` | HYP | WH | $1,702.00 |
| `HBR007` | PVC | LG | $698.00 |

</details>

#### RU250 Easy Go

| Field | Value |
|---|---|
| Model ID (slug) | `ru250-easy-go` |
| Total Variants | 1 |
| HYP Variants | 0 SKUs |
| PVC Variants | 1 SKUs |
| Factory Price (USD) | $931.00 |

**Equipment Sheet Items (1 matched):**
- [Spare Parts] RU250 KAM AIR MAT (`HEP067`) — USD $87.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBR041` | PVC | LG | $931.00 |

</details>

#### RU250AL

| Field | Value |
|---|---|
| Model ID (slug) | `ru250al` |
| Total Variants | 4 |
| HYP Variants | 2 SKUs |
| PVC Variants | 2 SKUs |
| Factory Price Range (USD) | $835.00 – $1,920.00 |

**Standard Equipment (included in base price):**
- Plastic seat 74cm

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBR029` | PVC | WH | $835.00 |
| `HBR030` | HYP | WH | $1,920.00 |
| `HBR031` | PVC | LG | $835.00 |
| `HBR032` | HYP | LG | $1,599.00 |

</details>

#### RU250KAM

| Field | Value |
|---|---|
| Model ID (slug) | `ru250kam` |
| Total Variants | 4 |
| HYP Variants | 2 SKUs |
| PVC Variants | 2 SKUs |
| Factory Price Range (USD) | $794.00 – $1,936.00 |

**Standard Equipment (included in base price):**
- Plastic seat 74cm

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBR009` | PVC | WH | $794.00 |
| `HBR010` | HYP | WH | $1,936.00 |
| `HBR011` | PVC | LG | $794.00 |
| `HBR012` | HYP | LG | $1,615.00 |

</details>

#### RU280AL

| Field | Value |
|---|---|
| Model ID (slug) | `ru280al` |
| Total Variants | 4 |
| HYP Variants | 2 SKUs |
| PVC Variants | 2 SKUs |
| Factory Price Range (USD) | $875.00 – $2,131.00 |

**Standard Equipment (included in base price):**
- Plastic seat 74cm

**Equipment Sheet Items (1 matched):**
- [Spare Parts] RU280 KAM AIR MAT (`HEP068`) — USD $95.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBR033` | PVC | WH | $875.00 |
| `HBR034` | HYP | WH | $2,131.00 |
| `HBR035` | PVC | LG | $875.00 |
| `HBR036` | HYP | LG | $1,673.00 |

</details>

#### RU280KAM

| Field | Value |
|---|---|
| Model ID (slug) | `ru280kam` |
| Total Variants | 4 |
| HYP Variants | 2 SKUs |
| PVC Variants | 2 SKUs |
| Factory Price Range (USD) | $850.00 – $2,146.00 |

**Standard Equipment (included in base price):**
- Plastic seat 74cm

**Equipment Sheet Items (1 matched):**
- [Spare Parts] RU280 KAM AIR MAT (`HEP068`) — USD $95.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBR016` | HYP | LG | $1,689.00 |
| `HBR013` | PVC | WH | $850.00 |
| `HBR014` | HYP | WH | $2,146.00 |
| `HBR015` | PVC | LG | $850.00 |

</details>

#### RU300 Easy Go

| Field | Value |
|---|---|
| Model ID (slug) | `ru300-easy-go` |
| Total Variants | 1 |
| HYP Variants | 0 SKUs |
| PVC Variants | 1 SKUs |
| Factory Price (USD) | $1,066.00 |

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBR042` | PVC | LG | $1,066.00 |

</details>

#### RU320AL

| Field | Value |
|---|---|
| Model ID (slug) | `ru320al` |
| Total Variants | 4 |
| HYP Variants | 2 SKUs |
| PVC Variants | 2 SKUs |
| Factory Price Range (USD) | $1,004.00 – $2,249.00 |

**Standard Equipment (included in base price):**
- Plastic seat 84cm

**Equipment Sheet Items (1 matched):**
- [Spare Parts] RU320 KAM AIR MAT (`HEP069`) — USD $104.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBR037` | PVC | WH | $1,004.00 |
| `HBR038` | HYP | WH | $2,249.00 |
| `HBR039` | PVC | LG | $1,004.00 |
| `HBR040` | HYP | LG | $1,791.00 |

</details>

#### RU320KAM

| Field | Value |
|---|---|
| Model ID (slug) | `ru320kam` |
| Total Variants | 4 |
| HYP Variants | 2 SKUs |
| PVC Variants | 2 SKUs |
| Factory Price Range (USD) | $979.00 – $2,265.00 |

**Standard Equipment (included in base price):**
- Plastic seat 84cm

**Equipment Sheet Items (1 matched):**
- [Spare Parts] RU320 KAM AIR MAT (`HEP069`) — USD $104.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBR017` | PVC | WH | $979.00 |
| `HBR020` | HYP | LG | $1,807.00 |
| `HBR018` | HYP | WH | $2,265.00 |
| `HBR019` | PVC | LG | $979.00 |

</details>

### Sport Range (`SP` prefix)

> Highfield Sport series — performance-focused RIBs with console configurations, designed for recreational boating, watersports and offshore day runs.

**Slug**: `sport`  
**Models**: 16

#### SP300

| Field | Value |
|---|---|
| Model ID (slug) | `sp300` |
| Total Variants | 15 |
| HYP Variants | 8 SKUs |
| PVC Variants | 7 SKUs |
| Factory Price Range (USD) | $3,501.00 – $5,296.00 |

**Standard Equipment (included in base price):**
- "? Nano console with EP

**Equipment Sheet Items (5 matched):**
- [Cover] Boat cover for SP300 (`HEO034`) — USD $377.00
- [EVA Teak] EVA teak for SP300 (`HEF 024`) — USD $168.00
- [EVA Teak] EVA teak for SP300 (`HEF 024-BG`) — USD $168.00
- [EVA Teak] EVA teak for SP300 (`HEF 024-GB`) — USD $168.00
- [Electronics Package] EP for SP300 (`HEE002`) — USD $338.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBS016` | HYP | I-B-C | $5,296.00 |
| `HBS001` | PVC | W-W-WB | $3,501.00 |
| `HBS003` | PVC | LG-W-WB | $3,501.00 |
| `HBS005` | PVC | LG-W-DB | $3,501.00 |
| `HBS007` | PVC | B-W-C | $3,501.00 |
| `HBS009` | PVC | DG-G-MB | $3,501.00 |
| `HBS011` | PVC | B-B-DB | $3,501.00 |
| `HBS013` | PVC | B-B-B | $3,501.00 |
| `HBS002` | HYP | W-W-WB | $5,296.00 |
| `HBS004` | HYP | LG-W-WB | $4,839.00 |
| `HBS006` | HYP | LG-W-DB | $4,839.00 |
| `HBS008` | HYP | B-W-C | $5,296.00 |
| `HBS010` | HYP | DG-G-MB | $5,296.00 |
| `HBS012` | HYP | B-B-DB | $5,296.00 |
| `HBS014` | HYP | B-B-B | $5,296.00 |

</details>

#### SP330

| Field | Value |
|---|---|
| Model ID (slug) | `sp330` |
| Total Variants | 15 |
| HYP Variants | 8 SKUs |
| PVC Variants | 7 SKUs |
| Factory Price Range (USD) | $3,909.00 – $5,353.00 |

**Standard Equipment (included in base price):**
- "? Mini SD with side seat with EP

**Equipment Sheet Items (11 matched):**
- [Cover] Boat cover for SP330 (`HEO035`) — USD $377.00
- [EVA Teak] EVA teak for SP330 (`HEF 025`) — USD $192.00
- [EVA Teak] EVA teak for SP330 (`HEF 025-BG`) — USD $192.00
- [EVA Teak] EVA teak for SP330 (`HEF 025-GB`) — USD $192.00
- [Electronics Package] EP for SP330-390 (`HEE003`) — USD $338.00
- [Spare Parts] Mechanical steering system for SP330-360 (`HEO077`) — USD $153.00
- [Spare Parts] Sundeck for SP330 (`HEO071`) — USD $306.00
- [Tow Post] Tow post for SP330-460 (`HET041`) — USD $215.00
- [Tow Post] Tow post for SP330-460 (`HEP017-W`) — USD $215.00
- [Tow Post] Tow post for SP330-460 (`HEP017-B`) — USD $215.00
- [Tow Post] Tow post for SP330-460 (`HEP017-G`) — USD $215.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBS017` | PVC | W-W-WB | $3,909.00 |
| `HBS023` | PVC | B-W-C | $3,909.00 |
| `HBS019` | PVC | LG-W-WB | $3,909.00 |
| `HBS025` | PVC | DG-G-MB | $3,909.00 |
| `HBS021` | PVC | LG-W-DB | $3,909.00 |
| `HBS027` | PVC | B-B-DB | $3,909.00 |
| `HBS029` | PVC | B-B-B | $3,909.00 |
| `HBS018` | HYP | W-W-WB | $5,353.00 |
| `HBS020` | HYP | LG-W-WB | $5,353.00 |
| `HBS022` | HYP | LG-W-DB | $5,353.00 |
| `HBS024` | HYP | B-W-C | $5,353.00 |
| `HBS026` | HYP | DG-G-MB | $5,353.00 |
| `HBS028` | HYP | B-B-DB | $5,353.00 |
| `HBS030` | HYP | B-B-B | $5,353.00 |
| `HBS032` | HYP | I-B-C | $5,353.00 |

</details>

#### SP360

| Field | Value |
|---|---|
| Model ID (slug) | `sp360` |
| Total Variants | 15 |
| HYP Variants | 8 SKUs |
| PVC Variants | 7 SKUs |
| Factory Price Range (USD) | $4,326.00 – $5,875.00 |

**Standard Equipment (included in base price):**
- "? Mini SD with side seat with EP

**Equipment Sheet Items (6 matched):**
- [Cover] Harbor cover for SP360?MINISD WSS+rear seat COVER? (`HEO105`) — USD $146.00
- [Cover] Boat cover for SP360 (`HEO036`) — USD $416.00
- [EVA Teak] EVA teak for SP360 (`HEF 026`) — USD $199.00
- [EVA Teak] EVA teak for SP360 (`HEF 026-BG`) — USD $199.00
- [EVA Teak] EVA teak for SP360 (`HEF 026-GB`) — USD $199.00
- [Spare Parts] Sundeck for SP360 (`HEO072`) — USD $306.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBS037` | PVC | LG-W-DB | $4,326.00 |
| `HBS039` | PVC | B-W-C | $4,326.00 |
| `HBS041` | PVC | DG-G-MB | $4,326.00 |
| `HBS043` | PVC | B-B-DB | $4,326.00 |
| `HBS045` | PVC | B-B-B | $4,326.00 |
| `HBS034` | HYP | W-W-WB | $5,875.00 |
| `HBS036` | HYP | LG-W-WB | $5,875.00 |
| `HBS038` | HYP | LG-W-DB | $5,875.00 |
| `HBS040` | HYP | B-W-C | $5,875.00 |
| `HBS042` | HYP | DG-G-MB | $5,875.00 |
| `HBS044` | HYP | B-B-DB | $5,875.00 |
| `HBS046` | HYP | B-B-B | $5,875.00 |
| `HBS048` | HYP | I-B-C | $5,875.00 |
| `HBS033` | PVC | W-W-WB | $4,326.00 |
| `HBS035` | PVC | LG-W-WB | $4,326.00 |

</details>

#### SP390

| Field | Value |
|---|---|
| Model ID (slug) | `sp390` |
| Total Variants | 15 |
| HYP Variants | 8 SKUs |
| PVC Variants | 7 SKUs |
| Factory Price Range (USD) | $6,295.00 – $7,803.00 |

**Standard Equipment (included in base price):**
- "?  SDS500 with EP & Steering system & Carbon dash

**Equipment Sheet Items (14 matched):**
- [Cover] Boat cover for SP390 (`HEO037`) — USD $468.00
- [EVA Teak] EVA teak for SP390 (`HEF 027`) — USD $209.00
- [EVA Teak] EVA teak for SP390 (`HEF 027-BG`) — USD $209.00
- [EVA Teak] EVA teak for SP390 (`HEF 027-GB`) — USD $209.00
- [Roll Bar & Ladder] Roll bar for SP390 (`HER003`) — USD $354.00
- [Roll Bar & Ladder] Forward arch for SP390 (`HET001`) — USD $1,196.00
- [Roll Bar & Ladder] Roll bar for SP390 (`HER003-W`) — USD $354.00
- [Roll Bar & Ladder] Roll bar for SP390 (`HER003-G`) — USD $354.00
- [Roll Bar & Ladder] Roll bar for SP390 (`HER003-B`) — USD $354.00
- [Roll Bar & Ladder] Forward arch for SP390 (`HET001-G`) — USD $1,196.00
- [Roll Bar & Ladder] Forward arch for SP390 (`HET001-W`) — USD $1,196.00
- [Roll Bar & Ladder] Forward arch for SP390 (`HET001-B`) — USD $1,196.00
- [Spare Parts] Sundeck for SP390 (`HEO073`) — USD $382.00
- [Spare Parts] Mechanical steering system for SP390 (`HEO066`) — USD $166.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBS055` | PVC | B-W-C | $6,295.00 |
| `HBS057` | PVC | DG-G-MB | $6,295.00 |
| `HBS059` | PVC | B-B-DB | $6,295.00 |
| `HBS061` | PVC | B-B-B | $6,295.00 |
| `HBS050` | HYP | W-W-WB | $7,803.00 |
| `HBS052` | HYP | LG-W-WB | $7,803.00 |
| `HBS054` | HYP | LG-W-DB | $7,803.00 |
| `HBS056` | HYP | B-W-C | $7,803.00 |
| `HBS058` | HYP | DG-G-MB | $7,803.00 |
| `HBS060` | HYP | B-B-DB | $7,803.00 |
| `HBS062` | HYP | B-B-B | $7,803.00 |
| `HBS064` | HYP | I-B-C | $7,803.00 |
| `HBS049` | PVC | W-W-WB | $6,295.00 |
| `HBS051` | PVC | LG-W-WB | $6,295.00 |
| `HBS053` | PVC | LG-W-DB | $6,295.00 |

</details>

#### SP420

| Field | Value |
|---|---|
| Model ID (slug) | `sp420` |
| Total Variants | 15 |
| HYP Variants | 8 SKUs |
| PVC Variants | 7 SKUs |
| Factory Price Range (USD) | $6,534.00 – $8,178.00 |

**Standard Equipment (included in base price):**
- "?  SDS500 with EP & Steering system & Carbon dash

**Equipment Sheet Items (16 matched):**
- [Cover] Harbor cover for SP420&SP460 (SDS500+rear seat cover) (`HEO106`) — USD $139.00
- [Cover] Boat cover for SP420 (`HEO038`) — USD $488.00
- [EVA Teak] EVA teak for SP420 (`HEF 028`) — USD $225.00
- [EVA Teak] EVA teak for SP420 (`HEF 028-BG`) — USD $225.00
- [EVA Teak] EVA teak for SP420 (`HEF 028-GB`) — USD $225.00
- [Electronics Package] EP for SP420-460 (`HEE004`) — USD $342.00
- [Roll Bar & Ladder] Roll bar for SP420 (`HER004`) — USD $354.00
- [Roll Bar & Ladder] Forward arch for SP420 (`HET002`) — USD $1,196.00
- [Roll Bar & Ladder] Roll bar for SP420 (`HER004-W`) — USD $354.00
- [Roll Bar & Ladder] Roll bar for SP420 (`HER004-G`) — USD $354.00
- [Roll Bar & Ladder] Roll bar for SP420 (`HER004-B`) — USD $354.00
- [Roll Bar & Ladder] Forward arch for SP420 (`HET002-G`) — USD $1,196.00
- [Roll Bar & Ladder] Forward arch for SP420 (`HET002-W`) — USD $1,196.00
- [Roll Bar & Ladder] Forward arch for SP420 (`HET002-B`) — USD $1,196.00
- [Spare Parts] Mechanical steering system for SP420-460 (`HEO078`) — USD $166.00
- [Spare Parts] Sundeck for SP420 (`HEO074`) — USD $382.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBS073` | PVC | DG-G-MB | $6,534.00 |
| `HBS075` | PVC | B-B-DB | $6,534.00 |
| `HBS077` | PVC | B-B-B | $6,534.00 |
| `HBS066` | HYP | W-W-WB | $8,178.00 |
| `HBS068` | HYP | LG-W-WB | $8,178.00 |
| `HBS070` | HYP | LG-W-DB | $8,178.00 |
| `HBS072` | HYP | B-W-C | $8,178.00 |
| `HBS074` | HYP | DG-G-MB | $8,178.00 |
| `HBS076` | HYP | B-B-DB | $8,178.00 |
| `HBS078` | HYP | B-B-B | $8,178.00 |
| `HBS080` | HYP | I-B-C | $8,178.00 |
| `HBS065` | PVC | W-W-WB | $6,534.00 |
| `HBS067` | PVC | LG-W-WB | $6,534.00 |
| `HBS069` | PVC | LG-W-DB | $6,534.00 |
| `HBS071` | PVC | B-W-C | $6,534.00 |

</details>

#### SP460

| Field | Value |
|---|---|
| Model ID (slug) | `sp460` |
| Total Variants | 15 |
| HYP Variants | 8 SKUs |
| PVC Variants | 7 SKUs |
| Factory Price Range (USD) | $7,129.00 – $9,391.00 |

**Standard Equipment (included in base price):**
- "?  SDS500 with EP & Steering system & Carbon dash

**Equipment Sheet Items (14 matched):**
- [Cover] Harbor cover for SP420&SP460 (SDS500+rear seat cover) (`HEO106`) — USD $139.00
- [Cover] Boat cover for SP460 (`HEO039`) — USD $501.00
- [EVA Teak] EVA teak for SP460 (`HEF 029`) — USD $338.00
- [EVA Teak] EVA teak for SP460 (`HEF 029-BG`) — USD $338.00
- [EVA Teak] EVA teak for SP460 (`HEF 029-GB`) — USD $338.00
- [Roll Bar & Ladder] Forward arch for SP460 (`HET003`) — USD $1,196.00
- [Roll Bar & Ladder] Roll bar for SP460 (`HER005`) — USD $354.00
- [Roll Bar & Ladder] Roll bar for SP460 (`HER005-W`) — USD $354.00
- [Roll Bar & Ladder] Roll bar for SP460 (`HER005-G`) — USD $354.00
- [Roll Bar & Ladder] Roll bar for SP460 (`HER005-B`) — USD $354.00
- [Roll Bar & Ladder] Forward arch for SP460 (`HET003-G`) — USD $1,196.00
- [Roll Bar & Ladder] Forward arch for SP460 (`HET003-W`) — USD $1,196.00
- [Roll Bar & Ladder] Forward arch for SP460 (`HET003-B`) — USD $1,196.00
- [Spare Parts] Sundeck for SP460 (`HEO070`) — USD $382.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBS091` | PVC | B-B-DB | $7,129.00 |
| `HBS093` | PVC | B-B-B | $7,129.00 |
| `HBS082` | HYP | W-W-WB | $9,391.00 |
| `HBS084` | HYP | LG-W-WB | $9,391.00 |
| `HBS086` | HYP | LG-W-DB | $9,391.00 |
| `HBS088` | HYP | B-W-C | $9,391.00 |
| `HBS090` | HYP | DG-G-MB | $9,391.00 |
| `HBS092` | HYP | B-B-DB | $9,391.00 |
| `HBS094` | HYP | B-B-B | $9,391.00 |
| `HBS096` | HYP | I-B-C | $9,391.00 |
| `HBS081` | PVC | W-W-WB | $7,129.00 |
| `HBS083` | PVC | LG-W-WB | $7,129.00 |
| `HBS085` | PVC | LG-W-DB | $7,129.00 |
| `HBS087` | PVC | B-W-C | $7,129.00 |
| `HBS089` | PVC | DG-G-MB | $7,129.00 |

</details>

#### SP520

| Field | Value |
|---|---|
| Model ID (slug) | `sp520` |
| Total Variants | 15 |
| HYP Variants | 8 SKUs |
| PVC Variants | 7 SKUs |
| Factory Price Range (USD) | $10,006.00 – $11,981.00 |

**Standard Equipment (included in base price):**
- "? SDS600 with EP

**Equipment Sheet Items (18 matched):**
- [Cover] Boat cover for SP520 (`HEO040`) — USD $780.00
- [EVA Teak] EVA teak for SP520 (`HEF 030`) — USD $420.00
- [EVA Teak] EVA teak for SP520 (`HEF 030-BG`) — USD $420.00
- [EVA Teak] EVA teak for SP520 (`HEF 030-GB`) — USD $420.00
- [Electronics Package] EP for SP520 (`HEE005`) — USD $381.00
- [Roll Bar & Ladder] Roll bar for SP520 (`HER006`) — USD $359.00
- [Roll Bar & Ladder] Forward arch for SP520 (`HET004`) — USD $1,196.00
- [Roll Bar & Ladder] Roll bar for SP520 (`HER006-B`) — USD $359.00
- [Roll Bar & Ladder] Forward arch for SP520 (`HET004-G`) — USD $1,196.00
- [Roll Bar & Ladder] Forward arch for SP520 (`HET004-W`) — USD $1,196.00
- [Roll Bar & Ladder] Forward arch for SP520 (`HET004-B`) — USD $1,196.00
- [Spare Parts] Ladder for SP520 platform (`HEP107`) — USD $112.00
- [Spare Parts] Sundeck for SP520 (`HEO075`) — USD $428.00
- [Spare Parts] Mechanical steering system for SP520 (`HEO068`) — USD $166.00
- [Tow Post] Tow post for SP520-560 (`HET045`) — USD $581.00
- [Tow Post] Tow post for SP520-560 (`HEP018-W`) — USD $581.00
- [Tow Post] Tow post for SP520-560 (`HEP018-G`) — USD $581.00
- [Tow Post] Tow post for SP520-560 (`HEP018-B`) — USD $581.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBS109` | PVC | B-B-B | $10,006.00 |
| `HBS098` | HYP | W-W-WB | $11,981.00 |
| `HBS100` | HYP | LG-W-WB | $11,981.00 |
| `HBS102` | HYP | LG-W-DB | $11,981.00 |
| `HBS104` | HYP | B-W-C | $11,981.00 |
| `HBS106` | HYP | DG-G-MB | $11,981.00 |
| `HBS108` | HYP | B-B-DB | $11,981.00 |
| `HBS110` | HYP | B-B-B | $11,981.00 |
| `HBS112` | HYP | I-B-C | $11,981.00 |
| `HBS097` | PVC | W-W-WB | $10,006.00 |
| `HBS099` | PVC | LG-W-WB | $10,006.00 |
| `HBS101` | PVC | LG-W-DB | $10,006.00 |
| `HBS103` | PVC | B-W-C | $10,006.00 |
| `HBS105` | PVC | DG-G-MB | $10,006.00 |
| `HBS107` | PVC | B-B-DB | $10,006.00 |

</details>

#### SP560

| Field | Value |
|---|---|
| Model ID (slug) | `sp560` |
| Total Variants | 15 |
| HYP Variants | 8 SKUs |
| PVC Variants | 7 SKUs |
| Factory Price Range (USD) | $10,353.00 – $13,114.00 |

**Standard Equipment (included in base price):**
- "? SUS750 with EP

**Equipment Sheet Items (12 matched):**
- [Cover] Boat cover for SP560 (`HEC196`) — USD $780.00
- [Cover] Harbor cover for SP560(SUS750+BOL850  cover) (`HEO107`) — USD $321.00
- [EVA Teak] EVA teak for SP560 (`HEF 031`) — USD $475.00
- [EVA Teak] EVA teak for SP560 (`HEF 031-BG`) — USD $475.00
- [EVA Teak] EVA teak for SP560 (`HEF 031-GB`) — USD $475.00
- [Electronics Package] EP for SP560 (`HEE006`) — USD $376.00
- [Roll Bar & Ladder] Roll bar for SP560 (`HER007`) — USD $385.00
- [Roll Bar & Ladder] Roll bar for SP560 (`HER007-W`) — USD $385.00
- [Roll Bar & Ladder] Roll bar for SP560 (`HER007-G`) — USD $385.00
- [Roll Bar & Ladder] Roll bar for SP560 (`HER007-B`) — USD $385.00
- [Spare Parts] Ladder for SP560-SP760 platform (`HEP106`) — USD $112.00
- [Spare Parts] Stern shade for  SP560 (`HET008`) — USD $247.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBS128` | HYP | I-B-C | $13,114.00 |
| `HBS113` | PVC | W-W-WB | $10,353.00 |
| `HBS115` | PVC | LG-W-WB | $10,353.00 |
| `HBS117` | PVC | LG-W-DB | $10,353.00 |
| `HBS119` | PVC | B-W-C | $10,353.00 |
| `HBS121` | PVC | DG-G-MB | $10,353.00 |
| `HBS123` | PVC | B-B-DB | $10,353.00 |
| `HBS125` | PVC | B-B-B | $10,353.00 |
| `HBS114` | HYP | W-W-WB | $13,114.00 |
| `HBS116` | HYP | LG-W-WB | $13,114.00 |
| `HBS118` | HYP | LG-W-DB | $13,114.00 |
| `HBS120` | HYP | B-W-C | $13,114.00 |
| `HBS122` | HYP | DG-G-MB | $13,114.00 |
| `HBS124` | HYP | B-B-DB | $13,114.00 |
| `HBS126` | HYP | B-B-B | $13,114.00 |

</details>

#### SP600

| Field | Value |
|---|---|
| Model ID (slug) | `sp600` |
| Total Variants | 15 |
| HYP Variants | 8 SKUs |
| PVC Variants | 7 SKUs |
| Factory Price Range (USD) | $14,451.00 – $18,261.00 |

**Standard Equipment (included in base price):**
- "? SUS950 with EP

**Equipment Sheet Items (10 matched):**
- [Cover] Harbor cover for SP600&SP660(SUS950+BOL950 COVER) (`HEO108`) — USD $355.00
- [EVA Teak] EVA teak for SP600 (`HEF 032`) — USD $802.00
- [EVA Teak] EVA teak for SP600 (`HEF 032-BG`) — USD $802.00
- [EVA Teak] EVA teak for SP600 (`HEF 032-GB`) — USD $802.00
- [Electronics Package] EP for SP600 (`HEE007`) — USD $376.00
- [Roll Bar & Ladder] Roll bar for SP600 (`HER008`) — USD $385.00
- [Roll Bar & Ladder] Roll bar for SP600 (`HER008-W`) — USD $385.00
- [Roll Bar & Ladder] Roll bar for SP600 (`HER008-G`) — USD $385.00
- [Roll Bar & Ladder] Roll bar for SP600 (`HER008-B`) — USD $385.00
- [Spare Parts] Stern shade for  SP600 (`HET009`) — USD $247.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBS129` | PVC | W-W-WB | $14,451.00 |
| `HBS131` | PVC | LG-W-WB | $14,451.00 |
| `HBS133` | PVC | LG-W-DB | $14,451.00 |
| `HBS135` | PVC | B-W-C | $14,451.00 |
| `HBS137` | PVC | DG-G-MB | $14,451.00 |
| `HBS139` | PVC | B-B-DB | $14,451.00 |
| `HBS141` | PVC | B-B-B | $14,451.00 |
| `HBS130` | HYP | W-W-WB | $18,261.00 |
| `HBS132` | HYP | LG-W-WB | $18,261.00 |
| `HBS134` | HYP | LG-W-DB | $18,261.00 |
| `HBS136` | HYP | B-W-C | $18,261.00 |
| `HBS138` | HYP | DG-G-MB | $18,261.00 |
| `HBS140` | HYP | B-B-DB | $18,261.00 |
| `HBS142` | HYP | B-B-B | $18,261.00 |
| `HBS144` | HYP | I-B-C | $18,261.00 |

</details>

#### SP660

| Field | Value |
|---|---|
| Model ID (slug) | `sp660` |
| Total Variants | 15 |
| HYP Variants | 8 SKUs |
| PVC Variants | 7 SKUs |
| Factory Price Range (USD) | $18,218.00 – $22,342.00 |

**Standard Equipment (included in base price):**
- "? SUS950 with EP

**Equipment Sheet Items (10 matched):**
- [Cover] Harbor cover for SP600&SP660(SUS950+BOL950 COVER) (`HEO108`) — USD $355.00
- [EVA Teak] EVA teak for SP660 (`HEF 033`) — USD $802.00
- [EVA Teak] EVA teak for SP660 (`HEF 033-BG`) — USD $802.00
- [EVA Teak] EVA teak for SP660 (`HEF 033-GB`) — USD $802.00
- [Electronics Package] EP for SP660 (`HEO076`) — USD $376.00
- [Roll Bar & Ladder] Roll bar for SP660 (`HER009`) — USD $385.00
- [Roll Bar & Ladder] Roll bar for SP660 (`HER009-W`) — USD $385.00
- [Roll Bar & Ladder] Roll bar for SP660 (`HER009-G`) — USD $385.00
- [Roll Bar & Ladder] Roll bar for SP660 (`HER009-B`) — USD $385.00
- [Spare Parts] Stern shade for  SP660 (`HET010`) — USD $267.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBS145` | PVC | W-W-WB | $18,218.00 |
| `HBS147` | PVC | LG-W-WB | $18,218.00 |
| `HBS149` | PVC | LG-W-DB | $18,218.00 |
| `HBS151` | PVC | B-W-C | $18,218.00 |
| `HBS153` | PVC | DG-G-MB | $18,218.00 |
| `HBS155` | PVC | B-B-DB | $18,218.00 |
| `HBS157` | PVC | B-B-B | $18,218.00 |
| `HBS146` | HYP | W-W-WB | $22,342.00 |
| `HBS148` | HYP | LG-W-WB | $22,342.00 |
| `HBS150` | HYP | LG-W-DB | $22,342.00 |
| `HBS152` | HYP | B-W-C | $22,342.00 |
| `HBS154` | HYP | DG-G-MB | $22,342.00 |
| `HBS156` | HYP | B-B-DB | $22,342.00 |
| `HBS158` | HYP | B-B-B | $22,342.00 |
| `HBS160` | HYP | I-B-C | $22,342.00 |

</details>

#### SP700ST

| Field | Value |
|---|---|
| Model ID (slug) | `sp700st` |
| Total Variants | 8 |
| Factory Price (USD) | $24,799.00 |

**Standard Equipment (included in base price):**
- "? SUS950 with EP

**Equipment Sheet Items (16 matched):**
- [Cover] Harbor cover for SP700(SUS950+BOL950 COVER) (`HEO109`) — USD $355.00
- [EVA Teak] EVA teak for SP700 (`HEF 034`) — USD $884.00
- [EVA Teak] EVA teak for SP700 (`HEF 034-BG`) — USD $884.00
- [EVA Teak] EVA teak for SP700 (`HEF 034-GB`) — USD $884.00
- [Electronics Package] EP for SP700WL (`HEO064`) — USD $540.00
- [Electronics Package] EP for SP700ST (`HEO061`) — USD $376.00
- [Roll Bar & Ladder] Roll bar for SP700WL (`HER115-G`) — USD $451.00
- [Roll Bar & Ladder] Roll bar for SP700WL (`HER115-W`) — USD $451.00
- [Roll Bar & Ladder] Roll bar for SP700WL (`HER115-B`) — USD $451.00
- [Roll Bar & Ladder] Roll bar for SP700WL (`HER115`) — USD $451.00
- [Roll Bar & Ladder] Roll bar for SP700ST (`HER010`) — USD $451.00
- [Roll Bar & Ladder] Roll bar for SP700ST (`HER010-W`) — USD $451.00
- [Roll Bar & Ladder] Roll bar for SP700ST (`HER010-G`) — USD $451.00
- [Roll Bar & Ladder] Roll bar for SP700ST (`HER010-B`) — USD $451.00
- [Spare Parts] Bow roller for SP700WL-SP760WL windlass (`HEP108`) — USD $30.00
- [Spare Parts] Stern shade for  SP700 (`HET011`) — USD $267.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBS161` | HYP | W-W-WB | $24,799.00 |
| `HBS162` | HYP | LG-W-WB | $24,799.00 |
| `HBS163` | HYP | LG-W-DB | $24,799.00 |
| `HBS164` | HYP | B-W-C | $24,799.00 |
| `HBS165` | HYP | DG-G-MB | $24,799.00 |
| `HBS166` | HYP | B-B-DB | $24,799.00 |
| `HBS167` | HYP | B-B-B | $24,799.00 |
| `HBS168` | HYP | I-B-C | $24,799.00 |

</details>

#### SP700WL(Windlass)

| Field | Value |
|---|---|
| Model ID (slug) | `sp700wl(windlass)` |
| Total Variants | 8 |
| Factory Price (USD) | $28,037.00 |

**Standard Equipment (included in base price):**
- "? SUS950 with EP

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBS175` | HYP | B-B-B | $28,037.00 |
| `HBS176` | HYP | I-B-C | $28,037.00 |
| `HBS169` | HYP | W-W-WB | $28,037.00 |
| `HBS170` | HYP | LG-W-WB | $28,037.00 |
| `HBS171` | HYP | LG-W-DB | $28,037.00 |
| `HBS172` | HYP | B-W-C | $28,037.00 |
| `HBS173` | HYP | DG-G-MB | $28,037.00 |
| `HBS174` | HYP | B-B-DB | $28,037.00 |

</details>

#### SP760ST

| Field | Value |
|---|---|
| Model ID (slug) | `sp760st` |
| Total Variants | 8 |
| Factory Price (USD) | $27,164.00 |

**Standard Equipment (included in base price):**
- "? SUS950 with EP

**Equipment Sheet Items (17 matched):**
- [Cover] Harbor cover for SP760(SUS950+BOL950RS COVER) (`HEO110`) — USD $355.00
- [EVA Teak] EVA teak for SP760 (`HEF 035`) — USD $1,365.00
- [EVA Teak] EVA teak for SP760 (`HEF 035-BG`) — USD $1,365.00
- [EVA Teak] EVA teak for SP760 (`HEF 035-GB`) — USD $1,365.00
- [Electronics Package] EP for SP760WL (`HEO063`) — USD $540.00
- [Electronics Package] EP for SP760ST (`HEO062`) — USD $376.00
- [Roll Bar & Ladder] Roll bar for SP760WL (`HER111-G`) — USD $451.00
- [Roll Bar & Ladder] Roll bar for SP760WL (`HER111-W`) — USD $451.00
- [Roll Bar & Ladder] Roll bar for SP760WL (`HER111-B`) — USD $451.00
- [Roll Bar & Ladder] Roll bar for SP760WL (`HER111`) — USD $451.00
- [Roll Bar & Ladder] Roll bar for SP760ST (`HER011`) — USD $451.00
- [Roll Bar & Ladder] Roll bar for SP760ST (`HER011-W`) — USD $451.00
- [Roll Bar & Ladder] Roll bar for SP760ST (`HER011-G`) — USD $451.00
- [Roll Bar & Ladder] Roll bar for SP760ST (`HER011-B`) — USD $451.00
- [Spare Parts] Bow roller for SP700WL-SP760WL windlass (`HEP108`) — USD $30.00
- [Spare Parts] Ladder for SP560-SP760 platform (`HEP106`) — USD $112.00
- [Spare Parts] Stern shade for  SP760 (`HET012`) — USD $267.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBS177` | HYP | W-W-WB | $27,164.00 |
| `HBS178` | HYP | LG-W-WB | $27,164.00 |
| `HBS179` | HYP | LG-W-DB | $27,164.00 |
| `HBS180` | HYP | B-W-C | $27,164.00 |
| `HBS181` | HYP | DG-G-MB | $27,164.00 |
| `HBS182` | HYP | B-B-DB | $27,164.00 |
| `HBS183` | HYP | B-B-B | $27,164.00 |
| `HBS184` | HYP | I-B-C | $27,164.00 |

</details>

#### SP760WL(Windlass)

| Field | Value |
|---|---|
| Model ID (slug) | `sp760wl(windlass)` |
| Total Variants | 8 |
| Factory Price (USD) | $29,223.00 |

**Standard Equipment (included in base price):**
- "? SUS950 with EP

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBS192` | HYP | I-B-C | $29,223.00 |
| `HBS185` | HYP | W-W-WB | $29,223.00 |
| `HBS186` | HYP | LG-W-WB | $29,223.00 |
| `HBS187` | HYP | LG-W-DB | $29,223.00 |
| `HBS188` | HYP | B-W-C | $29,223.00 |
| `HBS189` | HYP | DG-G-MB | $29,223.00 |
| `HBS190` | HYP | B-B-DB | $29,223.00 |
| `HBS191` | HYP | B-B-B | $29,223.00 |

</details>

#### SP800

| Field | Value |
|---|---|
| Model ID (slug) | `sp800` |
| Total Variants | 8 |
| Factory Price (USD) | $32,898.00 |

**Standard Equipment (included in base price):**
- "? SUS950 with EP

**Equipment Sheet Items (5 matched):**
- [EVA Teak] EVA teak for SP800 (`HEF 036`) — USD $1,820.00
- [EVA Teak] EVA teak for SP800 (`HEF 036-BG`) — USD $1,820.00
- [EVA Teak] EVA teak for SP800 (`HEF 036-GB`) — USD $1,820.00
- [Electronics Package] EP for SP800 (`HEO065`) — USD $735.00
- [Spare Parts] Stern shade for  SP800 (`HET013`) — USD $763.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBS193` | HYP | W-W-WB | $32,898.00 |
| `HBS194` | HYP | LG-W-WB | $32,898.00 |
| `HBS195` | HYP | LG-W-DB | $32,898.00 |
| `HBS196` | HYP | B-W-C | $32,898.00 |
| `HBS197` | HYP | DG-G-MB | $32,898.00 |
| `HBS198` | HYP | B-B-DB | $32,898.00 |
| `HBS199` | HYP | B-B-B | $32,898.00 |
| `HBS200` | HYP | I-B-C | $32,898.00 |

</details>

#### SP900

| Field | Value |
|---|---|
| Model ID (slug) | `sp900` |
| Total Variants | 8 |
| Factory Price (USD) | $37,904.00 |

**Standard Equipment (included in base price):**
- "? SUS1100 with EP

**Equipment Sheet Items (5 matched):**
- [EVA Teak] EVA teak for SP900 (`HEF 037`) — USD $1,950.00
- [EVA Teak] EVA teak for SP900 (`HEF 037-BG`) — USD $1,950.00
- [EVA Teak] EVA teak for SP900 (`HEF 037-GB`) — USD $1,950.00
- [Electronics Package] EP for SP900 (`HEO067`) — USD $844.00
- [Spare Parts] Stern shade for  SP900 (`HET014`) — USD $763.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBS208` | HYP | I-B-C | $37,904.00 |
| `HBS201` | HYP | W-W-WB | $37,904.00 |
| `HBS202` | HYP | LG-W-WB | $37,904.00 |
| `HBS203` | HYP | LG-W-DB | $37,904.00 |
| `HBS204` | HYP | B-W-C | $37,904.00 |
| `HBS205` | HYP | DG-G-MB | $37,904.00 |
| `HBS206` | HYP | B-B-DB | $37,904.00 |
| `HBS207` | HYP | B-B-B | $37,904.00 |

</details>

### Ultra-Light Range (`UL` prefix)

> Highfield Ultra-Light series — the lightest aluminium-floored RIBs in the range, perfect as yacht tenders. Available in Standard (ST) and Long Transom (LT) versions.

**Slug**: `ultra-light`  
**Models**: 9

#### UL220

| Field | Value |
|---|---|
| Model ID (slug) | `ul220` |
| Total Variants | 8 |
| HYP Variants | 4 SKUs |
| PVC Variants | 4 SKUs |
| Factory Price Range (USD) | $1,086.00 – $1,942.00 |

**Standard Equipment (included in base price):**
- "? EVA teak for  UL220

**Equipment Sheet Items (4 matched):**
- [Cover] Boat cover for UL220 (`HEO056`) — USD $192.00
- [EVA Teak] EVA teak for  UL220 (`HEF 001`) — USD $121.00
- [Spare Parts] Highfield logo  HYP 380*81mm(For RU200/230?UL220ST/240ST/260ST/290ST) (`LH380H`) — USD $10.00
- [Spare Parts] Highfield logo PVC 380*81mm(For RU200/230?UL220ST/240ST/260ST/290ST) (`LH380P`) — USD $5.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBU004` | HYP | LG-W | $1,621.00 |
| `HBU005` | PVC | DG-G | $1,086.00 |
| `HBU006` | HYP | DG-G | $1,621.00 |
| `HBU007` | PVC | B-G | $1,086.00 |
| `HBU008` | HYP | B-G | $1,942.00 |
| `HBU001` | PVC | W-W | $1,086.00 |
| `HBU002` | HYP | W-W | $1,942.00 |
| `HBU003` | PVC | LG-W | $1,086.00 |

</details>

#### UL240

| Field | Value |
|---|---|
| Model ID (slug) | `ul240` |
| Total Variants | 8 |
| HYP Variants | 4 SKUs |
| PVC Variants | 4 SKUs |
| Factory Price Range (USD) | $1,132.00 – $2,111.00 |

**Standard Equipment (included in base price):**
- "? EVA teak for  UL240

**Equipment Sheet Items (4 matched):**
- [Cover] Boat cover for UL240 (`HEO018`) — USD $192.00
- [EVA Teak] EVA teak for  UL240 (`HEF 002`) — USD $121.00
- [Spare Parts] Highfield logo HYP 422*90mm(For CL260-380?UL310/340?UL240LT-UL290LT) (`LH422H`) — USD $14.00
- [Spare Parts] Highfield logo PVC 422*90mm(For CL260-380?UL310/340?UL240LT-UL290LT) (`LH422P`) — USD $8.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBU009` | PVC | W-W | $1,132.00 |
| `HBU010` | HYP | W-W | $2,111.00 |
| `HBU011` | PVC | LG-W | $1,132.00 |
| `HBU012` | HYP | LG-W | $1,790.00 |
| `HBU013` | PVC | DG-G | $1,132.00 |
| `HBU014` | HYP | DG-G | $1,790.00 |
| `HBU015` | PVC | B-G | $1,132.00 |
| `HBU016` | HYP | B-G | $2,111.00 |

</details>

#### UL240LT

| Field | Value |
|---|---|
| Model ID (slug) | `ul240lt` |
| Total Variants | 8 |
| HYP Variants | 4 SKUs |
| PVC Variants | 4 SKUs |
| Factory Price Range (USD) | $1,132.00 – $2,111.00 |

**Standard Equipment (included in base price):**
- "? EVA teak for  UL240

**Equipment Sheet Items (2 matched):**
- [Spare Parts] Highfield logo HYP 422*90mm(For CL260-380?UL310/340?UL240LT-UL290LT) (`LH422H`) — USD $14.00
- [Spare Parts] Highfield logo PVC 422*90mm(For CL260-380?UL310/340?UL240LT-UL290LT) (`LH422P`) — USD $8.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBU056` | HYP | B-G | $2,111.00 |
| `HBU049` | PVC | W-W | $1,132.00 |
| `HBU050` | HYP | W-W | $2,111.00 |
| `HBU051` | PVC | LG-W | $1,132.00 |
| `HBU052` | HYP | LG-W | $1,790.00 |
| `HBU053` | PVC | DG-G | $1,132.00 |
| `HBU054` | HYP | DG-G | $1,790.00 |
| `HBU055` | PVC | B-G | $1,132.00 |

</details>

#### UL260

| Field | Value |
|---|---|
| Model ID (slug) | `ul260` |
| Total Variants | 8 |
| HYP Variants | 4 SKUs |
| PVC Variants | 4 SKUs |
| Factory Price Range (USD) | $1,188.00 – $2,288.00 |

**Standard Equipment (included in base price):**
- "? EVA teak for  UL260

**Equipment Sheet Items (2 matched):**
- [Cover] Boat cover for UL260 (`HEO019`) — USD $209.00
- [EVA Teak] EVA teak for  UL260 (`HEF 003`) — USD $152.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBU024` | HYP | B-G | $2,288.00 |
| `HBU017` | PVC | W-W | $1,188.00 |
| `HBU018` | HYP | W-W | $2,288.00 |
| `HBU019` | PVC | LG-W | $1,188.00 |
| `HBU020` | HYP | LG-W | $1,967.00 |
| `HBU021` | PVC | DG-G | $1,188.00 |
| `HBU022` | HYP | DG-G | $1,967.00 |
| `HBU023` | PVC | B-G | $1,188.00 |

</details>

#### UL260LT

| Field | Value |
|---|---|
| Model ID (slug) | `ul260lt` |
| Total Variants | 8 |
| HYP Variants | 4 SKUs |
| PVC Variants | 4 SKUs |
| Factory Price Range (USD) | $1,188.00 – $2,288.00 |

**Standard Equipment (included in base price):**
- "? EVA teak for  UL260

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBU057` | PVC | W-W | $1,188.00 |
| `HBU058` | HYP | W-W | $2,288.00 |
| `HBU059` | PVC | LG-W | $1,188.00 |
| `HBU060` | HYP | LG-W | $1,967.00 |
| `HBU061` | PVC | DG-G | $1,188.00 |
| `HBU062` | HYP | DG-G | $1,967.00 |
| `HBU063` | PVC | B-G | $1,188.00 |
| `HBU064` | HYP | B-G | $2,288.00 |

</details>

#### UL290

| Field | Value |
|---|---|
| Model ID (slug) | `ul290` |
| Total Variants | 8 |
| HYP Variants | 4 SKUs |
| PVC Variants | 4 SKUs |
| Factory Price Range (USD) | $1,301.00 – $2,626.00 |

**Standard Equipment (included in base price):**
- "? EVA teak for  UL290

**Equipment Sheet Items (4 matched):**
- [Cover] Boat cover for UL290 (`HEO020`) — USD $225.00
- [EVA Teak] EVA teak for  UL290 (`HEF 004`) — USD $152.00
- [Spare Parts] Highfield logo HYP 422*90mm(For CL260-380?UL310/340?UL240LT-UL290LT) (`LH422H`) — USD $14.00
- [Spare Parts] Highfield logo PVC 422*90mm(For CL260-380?UL310/340?UL240LT-UL290LT) (`LH422P`) — USD $8.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBU025` | PVC | W-W | $1,301.00 |
| `HBU026` | HYP | W-W | $2,626.00 |
| `HBU027` | PVC | LG-W | $1,301.00 |
| `HBU028` | HYP | LG-W | $2,168.00 |
| `HBU029` | PVC | DG-G | $1,301.00 |
| `HBU030` | HYP | DG-G | $2,168.00 |
| `HBU031` | PVC | B-G | $1,301.00 |
| `HBU032` | HYP | B-G | $2,626.00 |

</details>

#### UL290LT

| Field | Value |
|---|---|
| Model ID (slug) | `ul290lt` |
| Total Variants | 8 |
| HYP Variants | 4 SKUs |
| PVC Variants | 4 SKUs |
| Factory Price Range (USD) | $1,301.00 – $2,626.00 |

**Standard Equipment (included in base price):**
- "? EVA teak for  UL290

**Equipment Sheet Items (2 matched):**
- [Spare Parts] Highfield logo HYP 422*90mm(For CL260-380?UL310/340?UL240LT-UL290LT) (`LH422H`) — USD $14.00
- [Spare Parts] Highfield logo PVC 422*90mm(For CL260-380?UL310/340?UL240LT-UL290LT) (`LH422P`) — USD $8.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBU072` | HYP | B-G | $2,626.00 |
| `HBU065` | PVC | W-W | $1,301.00 |
| `HBU066` | HYP | W-W | $2,626.00 |
| `HBU067` | PVC | LG-W | $1,301.00 |
| `HBU068` | HYP | LG-W | $2,168.00 |
| `HBU069` | PVC | DG-G | $1,301.00 |
| `HBU070` | HYP | DG-G | $2,168.00 |
| `HBU071` | PVC | B-G | $1,301.00 |

</details>

#### UL310

| Field | Value |
|---|---|
| Model ID (slug) | `ul310` |
| Total Variants | 8 |
| HYP Variants | 4 SKUs |
| PVC Variants | 4 SKUs |
| Factory Price Range (USD) | $1,548.00 – $2,898.00 |

**Standard Equipment (included in base price):**
- "? EVA teak for  UL310

**Equipment Sheet Items (4 matched):**
- [Cover] Boat cover for UL310 (`HEO021`) — USD $241.00
- [EVA Teak] EVA teak for  UL310 (`HEF 005`) — USD $182.00
- [Spare Parts] Highfield logo HYP 422*90mm(For CL260-380?UL310/340?UL240LT-UL290LT) (`LH422H`) — USD $14.00
- [Spare Parts] Highfield logo PVC 422*90mm(For CL260-380?UL310/340?UL240LT-UL290LT) (`LH422P`) — USD $8.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBU040` | HYP | B-G | $2,898.00 |
| `HBU033` | PVC | W-W | $1,548.00 |
| `HBU034` | HYP | W-W | $2,898.00 |
| `HBU035` | PVC | LG-W | $1,548.00 |
| `HBU036` | HYP | LG-W | $2,440.00 |
| `HBU037` | PVC | DG-G | $1,548.00 |
| `HBU038` | HYP | DG-G | $2,440.00 |
| `HBU039` | PVC | B-G | $1,548.00 |

</details>

#### UL340

| Field | Value |
|---|---|
| Model ID (slug) | `ul340` |
| Total Variants | 8 |
| HYP Variants | 4 SKUs |
| PVC Variants | 4 SKUs |
| Factory Price Range (USD) | $1,719.00 – $3,050.00 |

**Standard Equipment (included in base price):**
- "? EVA teak for  UL340

**Equipment Sheet Items (2 matched):**
- [Cover] Boat cover for UL340 (`HEO022`) — USD $321.00
- [EVA Teak] EVA teak for  UL340 (`HEF 006`) — USD $182.00

<details><summary>View all SKUs</summary>

| SKU | Material | Color | Factory Price (USD) |
|---|---|---|---|
| `HBU041` | PVC | W-W | $1,719.00 |
| `HBU042` | HYP | W-W | $3,050.00 |
| `HBU043` | PVC | LG-W | $1,719.00 |
| `HBU044` | HYP | LG-W | $3,050.00 |
| `HBU045` | PVC | DG-G | $1,719.00 |
| `HBU046` | HYP | DG-G | $3,050.00 |
| `HBU047` | PVC | B-G | $1,719.00 |
| `HBU048` | HYP | B-G | $3,050.00 |

</details>

---

## Equipment Sheet Summary

Total items: **956** across the following categories:

### B-B (1 items)

| SKU | Name | Color | Price (USD) |
|---|---|---|---|
| `HEC067-BB` | "SUS900 with EP | " | - |

### B-C (1 items)

| SKU | Name | Color | Price (USD) |
|---|---|---|---|
| `HEC067-BC` | "SUS900 with EP | " | - |

### Console (211 items)

| SKU | Name | Color | Price (USD) |
|---|---|---|---|
| `HEC208` | SDS600 with EP |  | $1,300.00 |
| `HEC223-WDG` | SU770 with EP(twin engine) | W-DG | $2,376.00 |
| `HEC223-GDG` | SU770 with EP(twin engine) | G-DG | $2,376.00 |
| `HEC223-BB` | SU770 with EP(twin engine) | B-B | $2,376.00 |
| `HEC223` | SU770 with EP(twin engine) |  | $2,376.00 |
| `HEC222-WDG` | SUS770 with EP(twin engine) | W-DG | $2,506.00 |
| `HEC222-GDG` | SUS770 with EP(twin engine) | G-DG | $2,506.00 |
| `HEC222-BB` | SUS770 with EP(twin engine) | B-B | $2,506.00 |
| `HEC222` | SUS770 with EP(twin engine) |  | $2,506.00 |
| `HEC204` | SDS600 with EP | B-DB | $1,300.00 |
| `HEC203` | SDS600 with EP | G-MB | $1,300.00 |
| `HEC202` | SDS600 with EP | W-C | $1,300.00 |
| `HEC201` | SDS600 with EP | W-DB | $1,300.00 |
| `HEC200` | SDS600 with EP | W-WB | $1,300.00 |
| `HEC199` | SDS600 with EP | B-C | $1,300.00 |
| `HEC198` | SDS600 with EP | B-B | $1,300.00 |
| `HEC197` | ADV7 console |  | $4,415.00 |
| `HEC188-WWB` | SUS950 with FRP Top with EP | W-WB | $4,094.00 |
| `HEC188-WDB` | SUS950 with FRP Top with EP | W-DB | $4,094.00 |
| `HEC188-WC` | SUS950 with FRP Top with EP | W-C | $4,094.00 |
| `HEC188-GMB` | SUS950 with FRP Top with EP | G-MB | $4,094.00 |
| `HEC188-BDB` | SUS950 with FRP Top with EP | B-DB | $4,094.00 |
| `HEC188-BC` | SUS950 with FRP Top with EP | B-C | $4,094.00 |
| `HEC188-BB` | SUS950 with FRP Top with EP | B-B | $4,094.00 |
| `HEC188` | SUS950 with FRP Top with EP |  | $4,094.00 |
| `HEO100-W` | Hard top 1100 with EP | W-DG | $5,961.00 |
| `HEO100-G` | Hard top 1100 with EP | G-DG | $5,961.00 |
| `HEO100-B` | Hard top 1100 with EP | B-B | $5,961.00 |
| `HEO099-W` | Hard top 1000 with EP | White | $5,087.00 |
| `HEO099-G` | Hard top 1000 with EP | Grey | $5,087.00 |
| *... and 181 more ...* | | | |

### Cover (47 items)

| SKU | Name | Color | Price (USD) |
|---|---|---|---|
| `HEC196` | Boat cover for SP560 |  | $780.00 |
| `HEO011` | Boat cover for CL400 |  | $406.00 |
| `HEO60` | Console cover for Sus970 |  | $172.00 |
| `HEO110` | Harbor cover for SP760(SUS950+BOL950RS COVER) |  | $355.00 |
| `HEO109` | Harbor cover for SP700(SUS950+BOL950 COVER) |  | $355.00 |
| `HEO108` | Harbor cover for SP600&SP660(SUS950+BOL950 COVER) |  | $355.00 |
| `HEO107` | Harbor cover for SP560(SUS750+BOL850  cover) |  | $321.00 |
| `HEO106` | Harbor cover for SP420&SP460 (SDS500+rear seat cover) |  | $139.00 |
| `HEO105` | Harbor cover for SP360?MINISD WSS+rear seat COVER? |  | $146.00 |
| `HEO104` | Harbor cover for PA540 (PA540 SUS900+FS900 ) |  | $237.00 |
| `HEO103` | Harbor cover for PA660 (SUS900+BOL950 ) |  | $237.00 |
| `HEO102` | Console cover for GT Console |  | $543.00 |
| `HEO101` | Console cover for CL jockey |  | $192.00 |
| `HEO041` | Harbor cover for PA600 (SUS970+FS900 ) |  | $313.00 |
| `HEO040` | Boat cover for SP520 |  | $780.00 |
| `HEO039` | Boat cover for SP460 |  | $501.00 |
| `HEO038` | Boat cover for SP420 |  | $488.00 |
| `HEO037` | Boat cover for SP390 |  | $468.00 |
| `HEO036` | Boat cover for SP360 |  | $416.00 |
| `HEO035` | Boat cover for SP330 |  | $377.00 |
| `HEO034` | Boat cover for SP300 |  | $377.00 |
| `HEO022` | Boat cover for UL340 |  | $321.00 |
| `HEO021` | Boat cover for UL310 |  | $241.00 |
| `HEO020` | Boat cover for UL290 |  | $225.00 |
| `HEO019` | Boat cover for UL260 |  | $209.00 |
| `HEO018` | Boat cover for UL240 |  | $192.00 |
| `HEO056` | Boat cover for UL220 |  | $192.00 |
| `HEO053` | Seat cover for Suspension Seat |  | $90.00 |
| `HEO052` | Seat cover for BOL950 |  | $78.00 |
| `HEO051` | Seat cover for BOL900 |  | $69.00 |
| *... and 17 more ...* | | | |

### EVA Teak (94 items)

| SKU | Name | Color | Price (USD) |
|---|---|---|---|
| `HEF 038` | EVA teak for  CL400 |  | $333.00 |
| `HEF 038-GB` | EVA teak for  CL400 | Grey+Black | $333.00 |
| `HEF 015` | Anti-skid decking for  PA860 |  | $1,645.00 |
| `HEF 015-G` | Anti-skid decking for  PA860 | Grey | $1,645.00 |
| `HEF 015-B` | Anti-skid decking for  PA860 | Black | $1,645.00 |
| `HEF 014` | Anti-skid decking for  PA760 |  | $1,365.00 |
| `HEF 014-G` | Anti-skid decking for  PA760 | Grey | $1,365.00 |
| `HEF 014-B` | Anti-skid decking for  PA760 | Black | $1,365.00 |
| `HEF 013` | Anti-skid decking for  PA700 |  | $884.00 |
| `HEF 013-G` | Anti-skid decking for  PA700 | Grey | $884.00 |
| `HEF 013-B` | Anti-skid decking for  PA700 | Black | $884.00 |
| `HEF 012` | Anti-skid decking for  PA660 |  | $802.00 |
| `HEF 012-G` | Anti-skid decking for  PA660 | Grey | $802.00 |
| `HEF 012-B` | Anti-skid decking for  PA660 | Black | $802.00 |
| `HEF 011` | Anti-skid decking for  PA600 |  | $802.00 |
| `HEF 011-G` | Anti-skid decking for  PA600 | Grey | $802.00 |
| `HEF 011-B` | Anti-skid decking for  PA600 | Black | $802.00 |
| `HEF 010` | Anti-skid decking for  PA540 PA600 |  | $579.00 |
| `HEF 010-G` | Anti-skid decking for  PA540 PA600 | Grey | $579.00 |
| `HEF 010-B` | Anti-skid decking for  PA540 PA600 | Black | $579.00 |
| `HEF 009` | Anti-skid decking for  PA500 |  | $514.00 |
| `HEF 009-G` | Anti-skid decking for  PA500 | Grey | $514.00 |
| `HEF 009-B` | Anti-skid decking for  PA500 | Black | $514.00 |
| `HEF 008` | Anti-skid decking for  PA460 |  | $450.00 |
| `HEF 008-G` | Anti-skid decking for  PA460 | Grey | $450.00 |
| `HEF 008-B` | Anti-skid decking for  PA460 | Black | $450.00 |
| `HEF 037` | EVA teak for SP900 |  | $1,950.00 |
| `HEF 037-BG` | EVA teak for SP900 | Black+Grey | $1,950.00 |
| `HEF 037-GB` | EVA teak for SP900 | Grey+Black | $1,950.00 |
| `HEF 036` | EVA teak for SP800 |  | $1,820.00 |
| *... and 64 more ...* | | | |

### Electronics Package (34 items)

| SKU | Name | Color | Price (USD) |
|---|---|---|---|
| `HEE022` | EP for BOL950SP |  | $91.00 |
| `HEE023` | EP for BOL950RS |  | $91.00 |
| `HEE050` | EP for ADV7 console |  | $896.00 |
| `HEE021` | EP for ADV7 |  | $627.00 |
| `HEE020` | EP for SUS700 |  | $417.00 |
| `HEE037` | EP for SUS970 (T.E.) |  | $742.00 |
| `HEE036` | EP for SUS970 (S.E.) |  | $612.00 |
| `HEE041` | EP for PA700 |  | $638.00 |
| `HEE040` | EP for PA660 |  | $441.00 |
| `HEE039` | EP for PA540 |  | $346.00 |
| `HEE038` | EP for PA460 |  | $339.00 |
| `HEE017` | EP for PA600 |  | $441.00 |
| `HEE016` | EP for PA500 |  | $346.00 |
| `HEE015` | EP for PA420 |  | $339.00 |
| `HEE018` | EP for PA760 |  | $638.00 |
| `HEE019` | EP for PA860 |  | $732.00 |
| `HEO076` | EP for SP660 |  | $376.00 |
| `HEE007` | EP for SP600 |  | $376.00 |
| `HEE006` | EP for SP560 |  | $376.00 |
| `HEE005` | EP for SP520 |  | $381.00 |
| `HEE004` | EP for SP420-460 |  | $342.00 |
| `HEO067` | EP for SP900 |  | $844.00 |
| `HEE003` | EP for SP330-390 |  | $338.00 |
| `HEO065` | EP for SP800 |  | $735.00 |
| `HEO064` | EP for SP700WL |  | $540.00 |
| `HEE002` | EP for SP300 |  | $338.00 |
| `HEO063` | EP for SP760WL |  | $540.00 |
| `HEO062` | EP for SP760ST |  | $376.00 |
| `HEO061` | EP for SP700ST |  | $376.00 |
| `HEO059` | EP for coaster 540 ST |  | $346.00 |
| *... and 4 more ...* | | | |

### G-DG (1 items)

| SKU | Name | Color | Price (USD) |
|---|---|---|---|
| `HEC067-GDG` | "SUS900 with EP | " | - |

### Roll Bar & Ladder (150 items)

| SKU | Name | Color | Price (USD) |
|---|---|---|---|
| `HER127` | Roll bar for ADV7 |  | $378.00 |
| `HER015-CS-G` | Roll bar for coaster  ST | Grey | $385.00 |
| `HER015-CS-B` | Roll bar for coaster  ST | Black | $385.00 |
| `HER015-CS-W` | Roll bar for coaster  ST | White | $385.00 |
| `HER014-CS-W` | Roll bar for Coaster  Open | White | $385.00 |
| `HER014-CS-G` | Roll bar for Coaster  Open | Grey | $385.00 |
| `HER014-CS-B` | Roll bar for Coaster  Open | Black | $385.00 |
| `HER115-G` | Roll bar for SP700WL | Grey | $451.00 |
| `HER115-W` | Roll bar for SP700WL | White | $451.00 |
| `HER115-B` | Roll bar for SP700WL | Black | $451.00 |
| `HER115` | Roll bar for SP700WL |  | $451.00 |
| `HER111-G` | Roll bar for SP760WL | Grey | $451.00 |
| `HER111-W` | Roll bar for SP760WL | White | $451.00 |
| `HER111-B` | Roll bar for SP760WL | Black | $451.00 |
| `HER111` | Roll bar for SP760WL |  | $451.00 |
| `HER109` | Roll bar for CL460 |  | $306.00 |
| `HER108` | Roll bar for CL420 |  | $306.00 |
| `HER107` | Roll bar for CL400 |  | $330.00 |
| `HER015` | Roll bar for PA540 |  | $385.00 |
| `HER014` | Roll bar for PA500 |  | $354.00 |
| `HER013` | Roll bar for PA460 |  | $306.00 |
| `HER020` | Roll bar for PA860 |  | $467.00 |
| `HER019` | Roll bar for PA760 |  | $451.00 |
| `HER018` | Roll bar for PA700 |  | $451.00 |
| `HER017` | Roll bar for PA660 |  | $385.00 |
| `HER016` | Roll bar for PA600 |  | $385.00 |
| `HER012` | Roll bar for PA420 |  | $306.00 |
| `HER021` | Roll bar with ladder for PA600 |  | $918.00 |
| `HER022` | Roll bar with ladder for PA660 |  | $918.00 |
| `HER023` | Roll bar with ladder for PA700 |  | $993.00 |
| *... and 120 more ...* | | | |

### Seat (96 items)

| SKU | Name | Color | Price (USD) |
|---|---|---|---|
| `HES093-W` | Single jockey with front handle | W-DG | $616.00 |
| `HES093-G` | Single jockey with front handle | G-DG | $616.00 |
| `HES093-B` | Single jockey with front handle | B-B | $616.00 |
| `HES093` | Single jockey with front handle |  | $616.00 |
| `HES092` | ADV7 seat |  | $3,996.00 |
| `HES013-WWB` | RST1200 | W-WB | $948.00 |
| `HES013-WDG` | RST1200 | W-DG | $948.00 |
| `HES013-WDB` | RST1200 | W-DB | $948.00 |
| `HES013-WC` | RST1200 | W-C | $948.00 |
| `HES013-GMB` | RST1200 | G-MB | $948.00 |
| `HES014CS-GDB` | FS700 for Coaster | G-DB | $514.00 |
| `HES014CS-BDB` | FS700 for Coaster | B-DB | $514.00 |
| `HES006-WWB` | BOL1100 with fridge & sink | W-WB | $5,515.00 |
| `HES006-WDB` | BOL1100 with fridge & sink | W-DB | $5,515.00 |
| `HES006-WC` | BOL1100 with fridge & sink | W-C | $5,515.00 |
| `HES006-GMB` | BOL1100 with fridge & sink | G-MB | $5,515.00 |
| `HES005-WWB` | BOL950RS with fridge-EP | W-WB | $3,821.00 |
| `HES005-WDB` | BOL950RS with fridge-EP | W-DB | $3,821.00 |
| `HES005-WC` | BOL950RS with fridge-EP | W-C | $3,821.00 |
| `HES005-GMB` | BOL950RS with fridge-EP | G-MB | $3,821.00 |
| `HES004-WWB` | BOL950SP with EP | W-WB | $1,368.00 |
| `HES004-WDB` | BOL950SP with EP | W-DB | $1,368.00 |
| `HES004-WC` | BOL950SP with EP | W-C | $1,368.00 |
| `HES004-GMB` | BOL950SP with EP | G-MB | $1,368.00 |
| `HES003-WWB` | BOL850 with EP | W-WB | $1,192.00 |
| `HES003-WDG` | BOL850 with EP | W-DG | $1,192.00 |
| `HES003-WDB` | BOL850 with EP | W-DB | $1,192.00 |
| `HES003-WC` | BOL850 with EP | W-C | $1,192.00 |
| `HES003-GMB` | BOL850 with EP | G-MB | $1,192.00 |
| `HES014CS` | FS700 for Coaster |  | $514.00 |
| *... and 66 more ...* | | | |

### Spare Parts (263 items)

| SKU | Name | Color | Price (USD) |
|---|---|---|---|
| `HEP111` | Stainless steel cleat |  | $25.00 |
| `HEP110` | Zinc anode |  | $10.00 |
| `HEP109` | Mechanical steering system for Coaster 540 |  | $166.00 |
| `HEP108` | Bow roller for SP700WL-SP760WL windlass |  | $30.00 |
| `HEP107` | Ladder for SP520 platform |  | $112.00 |
| `HEP106` | Ladder for SP560-SP760 platform |  | $112.00 |
| `HEP105` | Pop up cleat |  | $29.00 |
| `HEP104` | Hydraulic steering system & steering wheel |  | $1,019.00 |
| `HEP103` | Bow cushion |  | $104.00 |
| `HEP102` | Shower kit for ADV7 |  | $446.00 |
| `HEP101` | Sundeck for ADV7 |  | $671.00 |
| `HEP100` | Marine toilet |  | $1,430.00 |
| `HEP099` | Table for ADV7 |  | $632.00 |
| `HEP098` | Windlass for ADV7 |  | $2,102.00 |
| `HEP097` | Fridge for ADV7 |  | $1,452.00 |
| `HEP096` | Hydraulic steering system for ADV7 |  | $1,832.00 |
| `HEP095` | Portable toilet |  | $189.00 |
| `HEP094` | Sunshade for ADV7 |  | $931.00 |
| `HEP093` | Courtesy light |  | $7.00 |
| `HEP092` | Bollard for PA540 |  | $90.00 |
| `F866H-C` | Fabric hypalon ORCA866(per LM) | Carbon | $161.00 |
| `HEP091` | Carbon dash for Mini SD |  | $56.00 |
| `HEP090` | Carbon dash for SDS |  | $56.00 |
| `HEP086` | Mechanical steering for PA500 |  | $166.00 |
| `HEP085` | Mechanical steering for CL420 |  | $166.00 |
| `HEP084` | Mechanical steering for PA460 |  | $166.00 |
| `HEP083` | Round D-ring (HYP) 7*52 |  | $4.00 |
| `HEP082` | Round D-ring (PVC) 6*33 |  | $1.00 |
| `HEP081` | Round D-ring (HYP) 6*33 |  | $3.00 |
| `HEP080` | Plastic clip black for FCT8 anchor light |  | $4.00 |
| *... and 233 more ...* | | | |

### Top (36 items)

| SKU | Name | Color | Price (USD) |
|---|---|---|---|
| `HET060-W` | T TOP XXL for PA860  SU/SUS970 | White | $3,658.00 |
| `HET060-G` | T TOP XXL for PA860  SU/SUS970 | Grey | $3,658.00 |
| `HET060-B` | T TOP XXL for PA860  SU/SUS970 | Black | $3,658.00 |
| `HET060` | T TOP XXL for PA860  SU/SUS970 |  | $3,658.00 |
| `HET056-W` | T TOP XL for PA760  SU/SUS970 | White | $3,185.00 |
| `HET056-G` | T TOP XL for PA760  SU/SUS970 | Grey | $3,185.00 |
| `HET056-B` | T TOP XL for PA760  SU/SUS970 | Black | $3,185.00 |
| `HET056` | T TOP XL for PA760  SU/SUS970 |  | $3,185.00 |
| `HET055` | Fabric T Top for ADV7CST |  | $2,113.00 |
| `HEP087-W` | FRP Top for SUS950 | White | $1,694.00 |
| `HEP087-G` | FRP Top for SUS950 | Grey | $1,694.00 |
| `HEP087-B` | FRP Top for SUS950 | Black | $1,694.00 |
| `HEP087` | FRP Top for SUS950 |  | $1,694.00 |
| `HEO095` | FRP Top for SUS1100 |  | $1,775.00 |
| `HEO094` | Fabric T Top for SUS1100 |  | $2,022.00 |
| `HET020` | Fabric t top for SUS970 |  | $1,690.00 |
| `HET021` | Fabric T Top for SUS770 |  | $1,242.00 |
| `HET005` | Fabric T Top for SUS750 |  | $1,073.00 |
| `HET006` | FRP S top for SUS950 |  | $1,287.00 |
| `HET007` | FRP L top for SUS950 |  | $1,694.00 |
| `HET020-G` | Fabric t top for SUS970 | Grey | $1,690.00 |
| `HET020-W` | Fabric t top for SUS970 | White | $1,690.00 |
| `HET020-B` | Fabric t top for SUS970 | Black | $1,690.00 |
| `HET021-G` | Fabric T Top for SUS770 | Grey | $1,242.00 |
| `HET021-W` | Fabric T Top for SUS770 | White | $1,242.00 |
| `HET021-B` | Fabric T Top for SUS770 | Black | $1,242.00 |
| `HET007-G` | FRP L top for SUS950 | B-C | $1,694.00 |
| `HET007-W` | FRP L top for SUS950 | B-DB | $1,694.00 |
| `HET007-B` | FRP L top for SUS950 | B-B | $1,694.00 |
| `HET057` | Fabric T Top for SUS700 |  | $1,242.00 |
| *... and 6 more ...* | | | |

### Tow Post (20 items)

| SKU | Name | Color | Price (USD) |
|---|---|---|---|
| `HET052` | Rear tow post for PA500 |  | $486.00 |
| `HET051` | Rear tow post for PA460 |  | $417.00 |
| `HET050` | Rear tow post for PA420 |  | $417.00 |
| `HET049` | Rear tow post |  | $260.00 |
| `HEP020` | Tow post for PA500 |  | $486.00 |
| `HEP019` | Tow post for PA420-460 |  | $417.00 |
| `HET045` | Tow post for SP520-560 |  | $581.00 |
| `HET041` | Tow post for SP330-460 |  | $215.00 |
| `HEP017-W` | Tow post for SP330-460 | White | $215.00 |
| `HEP017-B` | Tow post for SP330-460 | Black | $215.00 |
| `HEP017-G` | Tow post for SP330-460 | Grey | $215.00 |
| `HEP020-W` | Tow post for PA500 | White | $486.00 |
| `HEP020-G` | Tow post for PA500 | Grey | $486.00 |
| `HEP020-B` | Tow post for PA500 | Black | $486.00 |
| `HEP018-W` | Tow post for SP520-560 | White | $581.00 |
| `HEP018-G` | Tow post for SP520-560 | Grey | $581.00 |
| `HEP018-B` | Tow post for SP520-560 | Black | $581.00 |
| `HEP019-W` | Tow post for PA420-460 | White | $417.00 |
| `HEP019-G` | Tow post for PA420-460 | Grey | $417.00 |
| `HEP019-B` | Tow post for PA420-460 | Black | $417.00 |

### W-C (1 items)

| SKU | Name | Color | Price (USD) |
|---|---|---|---|
| `HEC067-WC` | "SUS900 with EP | " | - |

### W-DG (1 items)

| SKU | Name | Color | Price (USD) |
|---|---|---|---|
| `HEC067-WDG` | "SUS900 with EP | " | - |

---

## Proposed Firestore Structure Notes

### Key Decisions Required:

1. **Vendor ID**: What is the Highfield vendor document ID? (e.g. `highfield`, `highfield-boats`)
2. **Sub-models**: CL340, CL340FT, CL340LS, CL340MAX — are these separate HelmLogic *models*, or should they be a single model with sub-variant groupings?
   - Recommendation: Keep as separate models since they have different hull configurations
3. **Pricing**: Factory prices are in USD. The `sellPriceExclGst` field will store USD factory price (the Pricing Manager converts to AUD)
4. **Images**: To be sourced from highfield-boats.com and added separately (web research in progress)
5. **Motor HP ranges**: Specs TBC from web research — needed for the motor selector filter

### Color Code Legend:

| Code | Meaning |
|---|---|
| W | White |
| B | Black |
| G | Grey |
| DG | Dark Grey |
| LG | Light Grey |
| LB | Light Blue |
| WB | White/Blue |
| WD | Wood |
| MB | Military Black |
| I | Inflatable only (no rigid floor?) |
| C | Carbon |

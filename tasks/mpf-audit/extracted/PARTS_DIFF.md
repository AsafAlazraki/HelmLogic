# MPF Phase-2 PARTS diff — extracted vs live Firestore

Generated: 2026-07-03T06:54:10.831667+00:00 · org `AcFZVEFA5UDJG2hyetWT` (Northside Marine) · **read-only** (no writes performed)
Auth: billh@nsmarine.com.au via Firestore REST. Extracted inputs: `tasks/mpf-audit/extracted/*.json`.

## Headline

The live org has essentially **none of the MPF parts-side data**: 9 dealer-fit docs
(all `df-*` seed placeholders), 12 fitUpItems, 6 serviceParts,
and the `riggingKits` / `suppliers` collections do not exist yet (as expected).

| Dataset | Target collection | Extracted | Live | Matched | Missing in live | Live-only |
|---|---|---:|---:|---:|---:|---:|
| Dealer Fit Options | `dealerFitSelections` | 1791 | 9 | 0 | 1791 | 9 |
| Parts Maintenance | `fitUpItems` | 3660 | 12 | 0 | 3660 | 12 |
| Parts Data Drop (inventory) | `serviceParts` | 26345 | 6 | 0 | 26345 | 6 |
| Rigging Kits | `riggingKits` (new) | 846 | 0 | 0 | 846 | 0 |
| Suppliers | `suppliers` (new) | 1606 | 0 | 0 | 1606 | 0 |

Notes:
- Extracted counts are distinct doc ids (slugs). Rigging additionally quarantines 128 NLA / #N/A rows (in `rigging-kits.json.quarantined`, excluded above).
- `dealerFitSelections` live-only docs are the 9 seed placeholders: `df-electronic-packages-garmin-gpsmap-package`, `df-electronic-packages-lowrance-sounder-combo`, `df-electronic-packages-vhf- -aerial-package`, `df-general-engine-flush-kit`, `df-general-fuel-water-separator`, `df-propeller-spare-alloy-propeller`, `df-propeller-stainless-propeller`, `df-rigging-hydraulic-steering-kit`, `df-rigging-single-engine-rigging-kit`.
  Import plan: soft-replace (patch `seedPlaceholder: true, superseded: true`), never delete.
- Import policy is upsert-by-natural-key (CLAUDE.md rule) — nothing here is clear-and-replace.

## Per-collection detail

### dealerFitSelections
Live sample (placeholders):
```json
{
 "df-electronic-packages-garmin-gpsmap-package": {
  "name": "Garmin GPSMAP Package",
  "category": "Electronic Packages",
  "categoryId": "module-Electronic Packages",
  "type": "item"
 },
 "df-electronic-packages-lowrance-sounder-combo": {
  "name": "Lowrance Sounder Combo",
  "category": "Electronic Packages",
  "categoryId": "module-Electronic Packages",
  "type": "item"
 },
 "df-electronic-packages-vhf- -aerial-package": {
  "name": "VHF + Aerial Package",
  "category": "Electronic Packages",
  "categoryId": "module-Electronic Packages",
  "type": "item"
 },
 "df-general-engine-flush-kit": {
  "name": "Engine Flush Kit",
  "category": "General",
  "categoryId": "motor-General",
  "type": "item"
 },
 "df-general-fuel-water-separator": {
  "name": "Fuel Water Separator",
  "category": "General",
  "categoryId": "motor-General",
  "type": "item"
 },
 "df-propeller-spare-alloy-propeller": {
  "name": "Spare Alloy Propeller",
  "category": "Propeller",
  "categoryId": "motor-Propeller",
  "type": "item"
 },
 "df-propeller-stainless-propeller": {
  "name": "Stainless Propeller",
  "category": "Propeller",
  "categoryId": "motor-Propeller",
  "type": "item"
 },
 "df-rigging-hydraulic-steering-kit": {
  "name": "Hydraulic Steering Kit",
  "category": "Rigging",
  "categoryId": "motor-Rigging",
  "type": "item"
 },
 "df-rigging-single-engine-rigging-kit": {
  "name": "Single Engine Rigging Kit",
  "category": "Rigging",
  "categoryId": "motor-Rigging",
  "type": "item"
 }
}
```

### riggingKits / suppliers
riggingKits collection exists: **False** · suppliers collection exists: **False**
(Firestore has no empty-collection concept — "does not exist" = zero documents listed. List HTTP status: riggingKits 403, suppliers 403.)
⚠️ **Blocker for Phase-4 apply**: the listing returned HTTP 403 — firestore.rules has no match blocks for `organisations/{orgId}/riggingKits` or `organisations/{orgId}/suppliers` yet. Rules must be extended (full-ruleset paste per CLAUDE.md lesson) before import --apply can write these collections.

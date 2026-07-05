# MPF Phase-2 PARTS diff — extracted vs live Firestore

Generated: 2026-07-03T09:59:29.535150+00:00 · org `AcFZVEFA5UDJG2hyetWT` (Northside Marine) · **read-only** (no writes performed)
Auth: billh@nsmarine.com.au via Firestore REST. Extracted inputs: `tasks/mpf-audit/extracted/*.json`.

## Headline

The live org has essentially **none of the MPF parts-side data**: 1791 dealer-fit docs
(all `df-*` seed placeholders), 3672 fitUpItems, 26378 serviceParts,
and the `riggingKits` / `suppliers` collections EXIST — unexpected.

| Dataset | Target collection | Extracted | Live | Matched | Missing in live | Live-only |
|---|---|---:|---:|---:|---:|---:|
| Dealer Fit Options | `dealerFitSelections` | 1791 | 1791 | 1791 | 0 | 0 |
| Parts Maintenance | `fitUpItems` | 3660 | 3672 | 3660 | 0 | 12 |
| Parts Data Drop (inventory) | `serviceParts` | 26345 | 26378 | 26345 | 0 | 33 |
| Rigging Kits | `riggingKits` (new) | 846 | 846 | 846 | 0 | 0 |
| Suppliers | `suppliers` (new) | 1606 | 1606 | 1606 | 0 | 0 |

Notes:
- Extracted counts are distinct doc ids (slugs). Rigging additionally quarantines 128 NLA / #N/A rows (in `rigging-kits.json.quarantined`, excluded above).
- `dealerFitSelections` live-only docs are the 0 seed placeholders: .
  Import plan: soft-replace (patch `seedPlaceholder: true, superseded: true`), never delete.
- Import policy is upsert-by-natural-key (CLAUDE.md rule) — nothing here is clear-and-replace.

## Per-collection detail

### dealerFitSelections
Live sample (placeholders):
```json
{
 "0": {
  "name": "HIGHFIELD - Sport 800",
  "category": "HIGHFIELD - Sport 760",
  "categoryId": "mpf-highfield-sport-760",
  "type": "item"
 },
 "6gr-762ho-762s0-1e": {
  "name": "Add On Kit - Bolt On Digital Electric Steering | Tilt Helm | Single Engine",
  "category": "ADD ON KITS - DES & Helm Master",
  "categoryId": "mpf-add-on-kits-des-helm-master",
  "type": "item"
 },
 "6gr-762ho-762s0-2e": {
  "name": "Add On Kit - Bolt On Digital Electric Steering | Tilt Helm | Twin Engine",
  "category": "ADD ON KITS - DES & Helm Master",
  "categoryId": "mpf-add-on-kits-des-helm-master",
  "type": "item"
 },
 "6x3-0000l-15-05": {
  "name": "Mech Rigging Kit - 6X3 Concealed Mount (No Gauges), 5m Harness, 15' Cables & Filter",
  "category": "MECHANICAL RIGGING KITS (F75 to F350HP)",
  "categoryId": "mpf-mechanical-rigging-kits-f75-to-f350hp",
  "type": "item"
 },
 "6x3-0000s-ls-08-05": {
  "name": "Mech Rigging Kit - 6X3 Concealed (Left Hand) Mount (No Gauges) w 8' Cables & Fuel Filter (up to 70HP)",
  "category": "MECHANICAL RIGGING KITS (Up to 70HP)",
  "categoryId": "mpf-mechanical-rigging-kits-up-to-70hp",
  "type": "item"
 },
 "6x3-0000s-ls-10-05": {
  "name": "Mech Rigging Kit - 6X3 Concealed (Left Hand) Mount (No Gauges) w 10' Cables & Fuel Filter (up to 70HP)",
  "category": "MECHANICAL RIGGING KITS (Up to 70HP)",
  "categoryId": "mpf-mechanical-rigging-kits-up-to-70hp",
  "type": "item"
 },
 "6x3-0000s-ls-11-05": {
  "name": "Mech Rigging Kit - 6X3 Concealed (Left Hand) Mount (No Gauges) w 11' Cables & Fuel Filter (up to 70HP)",
  "category": "MECHANICAL RIGGING KITS (Up to 70HP)",
  "categoryId": "mpf-mechanical-rigging-kits-up-to-70hp",
  "type": "item"
 },
 "6x3-0000s-ls-13-05": {
  "name": "Mech Rigging Kit - 6X3 Concealed (Left Hand) Mount (No Gauges) w 13' Cables & Fuel Filter (up to 70HP)",
  "category": "MECHANICAL RIGGING KITS (Up to 70HP)",
  "categoryId": "mpf-mechanical-rigging-kits-up-to-70hp",
  "type": "item"
 },
 "6x3-6y52l-15-06": {
  "name": "Mech Rigging Kit - 6X3 Concealed Mount w 6Y5 2 Gauges, 6m Harness, 15' Cables & Filter",
  "category": "MECHANICAL RIGGING KITS (F75 to F350HP)",
  "categoryId": "mpf-mechanical-rigging-kits-f75-to-f350hp",
  "type": "item"
 },
 "6x3-6y52l-ls-14-05": {
  "name": "Mech Rigging Kit - 6X3 Concealed (Left Hand) Mount w 6Y5 2 Gauges, 5m Harness, 14' Cables & Filter",
  "category": "MECHANICAL RIGGING KITS - 6X3 Concealed (Left Hand Mounts)",
  "categoryId": "mpf-mechanical-rigging-kits-6x3-concealed-left-hand-mounts",
  "type": "item"
 },
 "6x3-6y52l-ls-15-05": {
  "name": "Mech Rigging Kit - 6X3 Concealed (Left Hand) Mount w 6Y5 2 Gauges, 5m Harness, 15' Cables & Filter",
  "category": "MECHANICAL RIGGING KITS - 6X3 Concealed (Left Hand Mounts)",
  "categoryId": "mpf-mechanical-rigging-kits-6x3-concealed-left-hand-mounts",
  "type": "item"
 },
 "6x3-6y52l-ls-25-08": {
  "name": "Mech Rigging Kit - 6X3 Concealed (Left Hand) Mount w 6Y5 2 Gauges, 8m Harness, 25' Cables & Filter",
  "category": "MECHANICAL RIGGING KITS - 6X3 Concealed (Left Hand Mounts)",
  "categoryId": "mpf-mechanical-rigging-kits-6x3-concealed-left-hand-mounts",
  "type": "item"
 }
}
```

### riggingKits / suppliers
riggingKits collection exists: **True** · suppliers collection exists: **True**
(Firestore has no empty-collection concept — "does not exist" = zero documents listed. List HTTP status: riggingKits 200, suppliers 200.)


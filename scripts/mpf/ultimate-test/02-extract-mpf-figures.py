#!/usr/bin/env python3
"""Phase 6 Ultimate Test — step 2: extract THE FIGURES from the MPF.

Reads the SP560 (PVC) W-W-WB boat row (HBS113, sheet row 829) from:
  a) the LibreOffice-RECALCULATED copy (/tmp/ultimate/recalc/Boat Module.xlsx)
  b) the as-saved cached copy            (/tmp/ultimate/Boat Module.xlsx)
and the component prices from the sibling module copies (as-saved values —
those sheets carry values, not live formulas, for the cells we need).

Interpretation (documented in ULTIMATE_TEST.md): the MPF has NO interactive
quote sheet — a quote IS the boat row plus display-name joins into sibling
modules. Components priced:
  boat hull package  -> Boat Module row 829, Hull Only Pricing "Cash" col 460 (QR829), inc GST
  motor (slot 1)     -> Motor Module 'Motor Library', Yamaha - F90XB, NSM Retail
  rigging kit        -> Rigging Module row for the slot-1 rigging kit name
  propeller          -> Parts Module 'Parts Maintenance', 6FP-45943-00
  trailer            -> Trailer Module row TA600-MOB (SP560)
  dealer fit x2      -> Parts Module 'Dealer Fit Module' Act Sell
  rego               -> Registration Module: boat band 4.51-6.0m + trailer >1.021t

Output: /tmp/ultimate/mpf-figures.json
READ-ONLY on every workbook.
"""
import openpyxl, json, os, sys

UD = "/tmp/ultimate"
ROW = 829  # HBS113 Highfield - SP560 (PVC) W-W-WB

# Boat Module column indices (1-based) per boat-module.evidence.json column_map
COLS = {
    "name": 3, "modelCode": 4, "matrix": 5,
    "regoBand": 299, "regoDecals": 300,
    "minHp": 308, "maxHp": 309, "shaft": 310, "engConfig": 311,
    "motor1": 312, "rig1": 313, "prop1No": 314, "prop1Desc": 315,
    "stdTrailer": 390,
    "df1": 402, "df2": 403, "df3": 404, "df4": 405,
    "landedHullCost": 259,
    "hullCash": 460, "hullCashGp": 461, "hullTrade": 462, "hullSubDealer": 464,
    "hullSubExcl": 466, "hullAusSailing": 468, "hullWarranty": 470,
}

def read_boat_row(path):
    # keep_links=False: LibreOffice rewrites externalLink XML in a way
    # openpyxl's parser rejects; we only need cell values, not link defs.
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True, keep_links=False)
    ws = wb["Boat Module"]
    row = next(ws.iter_rows(min_row=ROW, max_row=ROW, max_col=480))
    vals = {k: row[c - 1].value for k, c in COLS.items()}
    wb.close()
    return vals

def cell_lookup(path, sheet, key_col_letter, key, want_cols, max_row=30000, key_transform=None):
    """Scan sheet for a row whose key_col == key; return dict of wanted cells."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[sheet]
    hit = None
    for row in ws.iter_rows(min_row=1, max_row=max_row):
        cell = row[openpyxl.utils.column_index_from_string(key_col_letter) - 1] if len(row) >= openpyxl.utils.column_index_from_string(key_col_letter) else None
        v = cell.value if cell else None
        if key_transform and v is not None:
            v = key_transform(v)
        if v == key:
            hit = {name: (row[c - 1].value if len(row) >= c else None) for name, c in want_cols.items()}
            hit["_row"] = row[0].row
            break
    wb.close()
    return hit

def main():
    recalc_path = f"{UD}/recalc/Boat Module.xlsx"
    saved_path = f"{UD}/Boat Module.xlsx"
    mode = "recalculated (LibreOffice --convert-to xlsx)"
    if os.path.exists(recalc_path):
        boat = read_boat_row(recalc_path)
        if boat.get("modelCode") != "HBS113":
            print(f"WARN: recalc row {ROW} modelCode={boat.get('modelCode')} != HBS113; falling back", file=sys.stderr)
            boat = read_boat_row(saved_path); mode = "as-saved cached values (recalc row mismatch)"
    else:
        boat = read_boat_row(saved_path)
        mode = "as-saved cached values (LibreOffice recalc unavailable)"
    saved = read_boat_row(saved_path)
    drift = {k: {"saved": saved[k], "recalc": boat[k]} for k in COLS if saved[k] != boat[k]}

    out = {"mode": mode, "sheetRow": ROW, "boatRow": boat, "recalcVsSavedDrift": drift, "components": {}}
    print(json.dumps({"mode": mode, "drift": drift}, indent=1, default=str))
    print(json.dumps(boat, indent=1, default=str))
    with open(f"{UD}/mpf-figures.boatrow.json", "w") as f:
        json.dump(out, f, indent=1, default=str)

if __name__ == "__main__":
    main()

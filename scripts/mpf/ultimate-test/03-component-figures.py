#!/usr/bin/env python3
"""Phase 6 Ultimate Test — step 3: component prices from the sibling modules.

For each component of the SP560 quote, reads the price from the LibreOffice-
RECALCULATED module copy when available (/tmp/ultimate/recalc/), else the
as-saved copy (/tmp/ultimate/) — mode recorded per component.

Components (keys come from Boat Module row 829, see 02-extract output):
  motor    Yamaha - F90XB              -> Motor Library col C match, NSM Retail col BC(55)
  rigging  Mech Rigging Kit - 6X3 ...  -> Rigging Kits description match, Total Sell col
  prop     6FP-45943-00                -> Parts Maintenance code match, Sell + Sell inc Install
  trailer  REDCO Custom / Highfield SP560 Aluminium - TA600-MOB -> Trailer Module col C, Sell BW(75), Rego $ BZ(78)
  dealerFit GME-GX750BPK1 + IBC-TCPVC - 5.6 Mtr -> Dealer Fit Module, Act Sell (header-scanned)
  rego     boat band '4.51m to 6.0m' + trailer 'Large Trailers - Over 1.021t' -> Registration Costs

Output: /tmp/ultimate/mpf-figures.components.json
"""
import openpyxl, json, os

UD = "/tmp/ultimate"

def wbpath(name):
    r = f"{UD}/recalc/{name}"
    if os.path.exists(r):
        return r, "recalculated"
    return f"{UD}/{name}", "as-saved"

def load(path):
    return openpyxl.load_workbook(path, read_only=True, data_only=True, keep_links=False)

def scan_col(ws, col_idx, key, max_row=30000, strip=True):
    for row in ws.iter_rows(min_col=col_idx, max_col=col_idx, max_row=max_row):
        v = row[0].value
        if isinstance(v, str) and strip:
            v = v.strip()
        if v == key:
            return row[0].row
    return None

def cells(ws, r, cols):
    out = {}
    for name, c in cols.items():
        out[name] = ws.cell(row=r, column=c).value
    return out

def find_header(ws, texts, max_row=6, max_col=400):
    """Return {text: col} for header cells matching any of texts."""
    hits = {}
    for row in ws.iter_rows(min_row=1, max_row=max_row, max_col=max_col):
        for c in row:
            if isinstance(c.value, str):
                t = c.value.strip()
                if t in texts and t not in hits:
                    hits[t] = (c.row, c.column)
    return hits

result = {}

# --- Motor: Yamaha - F90XB (Remote mech, first occurrence in Four Stroke Models) ---
path, mode = wbpath("Motor Module.xlsx")
wb = load(path); ws = wb["Motor Library"]
r = 82  # evidence sourceRow for the remote F90XB
row_vals = cells(ws, r, {"display": 3, "model": 4, "hp": 5, "shaft": 6, "steering": 10, "nsmRetail": 55})
assert row_vals["display"].strip() == "Yamaha - F90XB", row_vals
result["motor"] = {**{k: v for k, v in row_vals.items()}, "row": r, "mode": mode, "file": "Motor Module.xlsx#Motor Library", "priceCol": "BC NSM Retail"}
wb.close()

# --- Trailer: REDCO Custom / Highfield SP560 Aluminium - TA600-MOB ---
path, mode = wbpath("Trailer Module.xlsx")
wb = load(path); ws = wb["Trailer Module"]
r = scan_col(ws, 3, "REDCO Custom / Highfield SP560 Aluminium - TA600-MOB", max_row=1000)
row_vals = cells(ws, r, {"name": 3, "code": 5, "cost": 71, "rrp": 74, "sell": 75, "regoType": 77, "regoDollars": 78, "sellIncRego": 79})
result["trailer"] = {**row_vals, "row": r, "mode": mode, "file": "Trailer Module.xlsx#Trailer Module",
                     "colCheck": "BS73?; verify header alignment below"}
# header check for the money cols (BS-CA band): grab row-1 headers at those cols
hdrs = {c: ws.cell(row=1, column=c).value for c in (71, 72, 73, 74, 75, 76, 77, 78, 79)}
result["trailer"]["headerRow1"] = {str(k): v for k, v in hdrs.items()}
wb.close()

# --- Rigging kit ---
path, mode = wbpath("Rigging Module.xlsx")
wb = load(path); ws = wb["Rigging Kits"]
key = "Mech Rigging Kit - 6X3 Concealed (Left Hand) Mount w 6Y5 2 Gauges, 5m Harness, 15' Cables & Filter"
# description column: find it by scanning row for the key around evidence sourceRow 382
rr = None; desc_col = None
for row in ws.iter_rows(min_row=1, max_row=1200, max_col=70):
    for c in row:
        if isinstance(c.value, str) and c.value.strip() == key:
            rr, desc_col = c.row, c.column
            break
    if rr: break
hd = {ws.cell(row=hr, column=c).value: c for hr in (1, 2, 3) for c in range(1, 66) if ws.cell(row=hr, column=c).value}
result["rigging"] = {"row": rr, "descCol": desc_col, "mode": mode, "file": "Rigging Module.xlsx#Rigging Kits",
                     "headers": {str(k)[:40]: v for k, v in hd.items()}}
if rr:
    result["rigging"]["rowDump"] = {str(c): ws.cell(row=rr, column=c).value for c in range(1, 40) if ws.cell(row=rr, column=c).value is not None}
wb.close()

# --- Prop + Dealer Fit (Parts Module) ---
path, mode = wbpath("Parts Module.xlsx")
wb = load(path)
ws = wb["Parts Maintenance"]
r = scan_col(ws, 3, "6FP-45943-00", max_row=5000)
hd = {ws.cell(row=2, column=c).value: c for c in range(1, 60) if ws.cell(row=2, column=c).value}
result["prop"] = {"row": r, "mode": mode, "file": "Parts Module.xlsx#Parts Maintenance",
                  "headersRow2": {str(k)[:36]: v for k, v in hd.items()},
                  "rowDump": {str(c): ws.cell(row=r, column=c).value for c in range(1, 40) if r and ws.cell(row=r, column=c).value is not None}}

ws = wb["Dealer Fit Module"]
hd = find_header(ws, {"Act Sell", "Act CTD", "DFO Code", "Dealer Fit Option"}, max_row=4, max_col=60)
result["dealerFitHeaders"] = {k: list(v) for k, v in hd.items()}
for label, key in (("tubeCovers", "IBC-TCPVC - 5.6 Mtr"), ("vhf", "GME-GX750BPK1")):
    rr = None
    for col in (2, 3, 4, 1):
        rr = scan_col(ws, col, key, max_row=3000)
        if rr:
            break
    d = {}
    if rr:
        d = {str(c): ws.cell(row=rr, column=c).value for c in range(1, 40) if ws.cell(row=rr, column=c).value is not None}
    result[label] = {"row": rr, "keyCol": col if rr else None, "mode": mode, "file": "Parts Module.xlsx#Dealer Fit Module", "rowDump": d}
wb.close()

# --- Rego ---
path, mode = wbpath("Registration Module.xlsx")
wb = load(path); ws = wb["Registration Costs"]
dump = {}
for ridx, row in enumerate(ws.iter_rows(min_row=1, max_row=34, max_col=11), 1):
    vals = [c.value for c in row]
    if any(v is not None for v in vals):
        dump[str(ridx)] = vals
result["rego"] = {"mode": mode, "file": "Registration Module.xlsx#Registration Costs", "sheetDump": dump}
wb.close()

with open(f"{UD}/mpf-figures.components.json", "w") as f:
    json.dump(result, f, indent=1, default=str)
print(json.dumps(result, indent=1, default=str))

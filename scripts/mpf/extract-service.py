#!/usr/bin/env python3
"""MPF Phase 2 — Service Module extraction (STRICTLY READ-ONLY on sources).

Reads tasks/mpf-source/Service Module.xlsx (openpyxl read_only, data_only)
and writes normalized JSON to tasks/mpf-audit/extracted/:

  service-operations.json        366 coded ops (Operation Codes rows 8-504)
  engine-service-schedules.json  189 engines x 11 intervals + 5yr plan + parts BOM
  labour-rates.json              hourly-rate card incl. per-brand warranty rates
  service-consumables.json       Oils & Lubes -> serviceParts shape

Exclusions (listed in each file's meta):
  - Operation Codes orphan legacy block rows 1143-1163 (stale $124.36 basis, Sell<CTD)
  - zero-priced non-coded sentinel rows ("Installation Not Required", "Supply Only", ...)
  - Std Service Schedules rows with identity but no pricing (e.g. row 280 Z200) are
    KEPT with intervals=[] and flagged legacyNoPricing=true.
"""
import json, os, datetime, re
from openpyxl import load_workbook

SRC = "tasks/mpf-source/Service Module.xlsx"
OUT = "tasks/mpf-audit/extracted"
os.makedirs(OUT, exist_ok=True)

NBSP = "\xa0"
RETAIL_INC_GST = 159.0
INTERNAL_EX_GST = 130.0909090909091  # 143.10 / 1.1


def clean(v):
    if v is None:
        return None
    if isinstance(v, str):
        s = v.replace(NBSP, " ").strip()
        return s or None
    return v


def num(v):
    v = clean(v)
    if v is None or v == "":
        return None
    try:
        return round(float(v), 4)
    except (TypeError, ValueError):
        return None


def r2(v):
    return None if v is None else round(v, 2)


wb = load_workbook(SRC, read_only=True, data_only=True)

# ───────────────────────── Operation Codes ─────────────────────────
ws = wb["Operation Codes"]
ops, sentinels_excluded, orphans_excluded = [], [], []
section = None
code_counts = {}
for i, row in enumerate(ws.iter_rows(min_row=7, max_row=1170, max_col=21, values_only=True), 7):
    name = clean(row[2])          # col 3 Operation / Option
    code = clean(row[3])          # col 4 Op Code
    if name is None and code is None:
        continue
    hrs = num(row[4])
    sell = num(row[18])
    uncoded = code is None
    if uncoded:
        # Section title, zero-priced sentinel, or a real PRICED op missing its code.
        pricing = [num(x) for x in row[4:19]]
        if any(p not in (None, 0) for p in pricing):
            code = None  # real op, no code — falls through with syntheticKey below
        elif any(p == 0 for p in pricing):
            sentinels_excluded.append({"row": i, "name": name, "reason": "zero-priced sentinel, no op code"})
            continue
        else:
            if name != ".":  # '.' rows are blank section separators — keep prior section
                section = name
            continue
    if i >= 1100:  # orphan legacy block (actual coded rows 1144-1165, after a ~640-row gap)
        orphans_excluded.append({
            "row": i, "opCode": code, "name": name,
            "totalCtd": num(row[10]), "sell": sell,
            "reason": "orphan legacy block — stale $124.36/hr basis, Sell < CTD, superseded by DFO-ELE section rows 158-196",
        })
        continue
    key = code if code is not None else "UNCODED " + re.sub(r"[^A-Za-z0-9]+", "-", name).strip("-").upper()[:40]
    code_counts[key] = code_counts.get(key, 0) + 1
    total_ctd = num(row[10])
    op = {
        "opCode": code,
        "uncoded": code is None,                 # 15 real priced ops have no Op Code in source
        "syntheticKey": None if code is not None else key,
        "opCodeDedupeIndex": code_counts[key],   # 1 for unique codes; >1 for shared codes (Sublet x7, Factory x6, truncated DFO_* families)
        "section": section,
        "description": name,
        "labourHrs": hrs,
        "labourRate": {"retailIncGst": RETAIL_INC_GST, "internalExGst": r2(INTERNAL_EX_GST)},
        "labourCostExGst": r2(num(row[5])),
        "sundries": {
            "cost": [num(row[6]), num(row[7]), num(row[8])],
            "sell": [num(row[14]), num(row[15]), num(row[16])],
        },
        "sublets": {"cost": num(row[9]), "sell": num(row[17])},
        "totalCtd": r2(total_ctd),
        "labourSellIncGst": num(row[13]),
        "sellIncGst": sell,
        "sellExGst": r2(sell / 1.1) if sell is not None else None,
        "procedure": clean(row[20]),
        "sourceRow": i,
    }
    ops.append(op)

dupes = {c: n for c, n in code_counts.items() if n > 1}
out = {
    "meta": {
        "source": SRC, "sheet": "Operation Codes",
        "extractedUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "count": len(ops),
        "rateConstants": {"labourCostBasisExGst": 130.0909, "labourSellIncGst": 159.0,
                          "sundrySellMultipliers": [1, 0.9, 0.8], "subletMarkup": 0.15},
        "gstNote": "sellIncGst is the sheet's Sell column (labour priced at $159 inc GST); sellExGst = sellIncGst / 1.1",
        "countNote": "phase-1 audit figure of 366 = 349 in-range coded rows + 17 orphan-block rows; the clean catalog is 349 coded + 15 priced-but-uncoded real ops = 364. Truncated codes (DFO_, DFO-TRA-, DFO-LON, DFO-GEN, Factory) are the literal cached values in the source (formula-built codes that lost their suffix) — non-unique, disambiguated via opCodeDedupeIndex.",
        "duplicateOpCodes": dupes,
        "exclusions": {
            "orphanLegacyRows1143_1163": orphans_excluded,
            "sentinelRows": sentinels_excluded,
        },
    },
    "operations": ops,
}
with open(f"{OUT}/service-operations.json", "w") as f:
    json.dump(out, f, indent=1)
print(f"service-operations.json: {len(ops)} ops, {len(orphans_excluded)} orphans excluded, "
      f"{len(sentinels_excluded)} sentinels excluded, {len(dupes)} duplicate codes {dupes}")

# ───────────────────── Std Service Schedules ─────────────────────
ws = wb["Std Service Schedules"]
INTERVALS = [20, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]
# interval col starts: 9,12,15,...,39 (1-indexed); tuple (CTD, Sell, TimeAllow)

# Build BOM block map from row 3 headers, cols 64..260
hdr_rows = list(ws.iter_rows(min_row=3, max_row=3, max_col=260, values_only=True))[0]
FIELD_HDRS = {"description", "qty", "ctd", "sell", "labour (hrs)", "qty w filter", "code", "type"}
blocks = []  # (blockName, startCol0, fieldCols {label: col0})
c = 63  # 0-indexed col 64
while c < 260:
    h = clean(hdr_rows[c])
    if h and h.lower() not in FIELD_HDRS:
        fields = {}
        c2 = c + 1
        while c2 < 260:
            h2 = clean(hdr_rows[c2])
            if h2 is None:
                # blank spacer ends a block only if the next header starts a new block
                nxt = clean(hdr_rows[c2 + 1]) if c2 + 1 < 260 else None
                if nxt and nxt.lower() not in FIELD_HDRS:
                    break
                c2 += 1
                continue
            if h2.lower() not in FIELD_HDRS:
                break
            fields[h2.lower()] = c2
            c2 += 1
        blocks.append((h, c, fields))
        c = c2
    else:
        c += 1

engines, no_pricing = [], []
for i, row in enumerate(ws.iter_rows(min_row=4, max_row=280, max_col=260, values_only=True), 4):
    model = clean(row[2])
    if model is None:
        continue
    intervals = []
    for k, hours in enumerate(INTERVALS):
        base = 8 + k * 3  # 0-indexed CTD col
        ctd, sell, hrs = num(row[base]), num(row[base + 1]), num(row[base + 2])
        if ctd is None and sell is None and hrs is None:
            continue
        intervals.append({"intervalHours": hours, "ctd": r2(ctd), "sell": sell, "flatHrs": hrs})
    bom = []
    for bname, bstart, bfields in blocks:
        part = clean(row[bstart])
        if part is None:
            continue
        entry = {
            "block": bname,
            "partNumber": None if str(part).strip().lower() == "not required" else str(part),
            "notRequired": str(part).strip().lower() == "not required",
            "description": clean(row[bfields["description"]]) if "description" in bfields else None,
            "qty": num(row[bfields["qty"]]) if "qty" in bfields else None,
            "ctd": r2(num(row[bfields["ctd"]])) if "ctd" in bfields else None,
            "sell": r2(num(row[bfields["sell"]])) if "sell" in bfields else None,
        }
        if "labour (hrs)" in bfields:
            entry["labourHrs"] = num(row[bfields["labour (hrs)"]])
        bom.append(entry)
    eng = {
        "engineModel": model,
        "familyCode": clean(row[3]),
        "cylinders": num(row[5]),
        "yearModel": num(row[6]),
        "intervals": intervals,
        "fiveYearPlan": {
            "ctd": r2(num(row[42])), "gp": r2(num(row[43])), "margin": num(row[44]),
            "sell": num(row[45]), "repayments60": r2(num(row[46])),
            "inflationAssumption": 0.025,
        },
        "gearOil": {"type": clean(row[48]), "code": clean(row[49]), "qty": num(row[50]),
                    "ctd": r2(num(row[51])), "sell": num(row[52])},
        "engineOil": {"type": clean(row[54]), "qtyWithFilter": num(row[55]),
                      "ctd": r2(num(row[56])), "sell": num(row[57])},
        "sundries": {"code": clean(row[59]), "ctd": r2(num(row[60])), "sell": num(row[61])},
        "partsBom": bom,
        "legacyNoPricing": len(intervals) == 0,
        "sourceRow": i,
    }
    if eng["legacyNoPricing"]:
        no_pricing.append({"row": i, "engineModel": model})
    engines.append(eng)

out = {
    "meta": {
        "source": SRC, "sheet": "Std Service Schedules",
        "extractedUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "count": len(engines), "intervals": INTERVALS,
        "bomBlocks": [b[0] for b in blocks],
        "phantomDimensionNote": "sheet reports max_row=63073 but data ends at row 280 (bound-scanned)",
        "rowsWithIdentityButNoPricing": no_pricing,
        "labourHoursNote": "Time Allow. per interval follows the NSM Engine Service Labour matrix (Schedule Notes), by cylinder count — deliberately deviates from Yamaha suggested hours",
    },
    "engines": engines,
}
with open(f"{OUT}/engine-service-schedules.json", "w") as f:
    json.dump(out, f, indent=1)
print(f"engine-service-schedules.json: {len(engines)} engines, {len(blocks)} BOM blocks, "
      f"{len(no_pricing)} identity-only rows")

# ───────────────────────── Labour Rates ─────────────────────────
ws = wb["Labour Rates"]
rates = []
for i, row in enumerate(ws.iter_rows(min_row=9, max_row=63, max_col=8, values_only=True), 9):
    desc, code = clean(row[2]), clean(row[3])
    if desc is None or code is None:
        continue
    rates.append({
        "description": desc, "code": code,
        "actualCostPerHr": num(row[4]),
        "rateExGst": r2(num(row[6])), "rateIncGst": r2(num(row[7])),
        "isWarrantyRate": desc.lower().startswith("warranty"),
        "brand": desc.split(" - ", 1)[1] if desc.lower().startswith("warranty - ") else None,
        "sourceRow": i,
    })
out = {
    "meta": {
        "source": SRC, "sheet": "Labour Rates",
        "extractedUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "count": len(rates),
        "caveat": "code 'PD' appears twice (Pre Delivery retail 159 inc vs Internal - Pre Delivery 143.10 inc) — rate depends on context, not code alone",
    },
    "rates": rates,
}
with open(f"{OUT}/labour-rates.json", "w") as f:
    json.dump(out, f, indent=1)
print(f"labour-rates.json: {len(rates)} rates ({sum(1 for r in rates if r['isWarrantyRate'])} warranty)")

# ───────────────────────── Oils and Lubes ─────────────────────────
ws = wb["Oils and Lubes"]
parts = []
BAND = re.compile(r"^(LUBE|SUND)\d$")
for i, row in enumerate(ws.iter_rows(min_row=9, max_row=50, max_col=12, values_only=True), 9):
    typ = clean(row[2])
    if typ is None:
        continue
    notes, partno = clean(row[3]), clean(row[4])
    ctd, sell = num(row[7]), num(row[10])
    banded = bool(BAND.match(typ))
    parts.append({
        # serviceParts shape: partNumber, name, cost, sellPrice, stockLevel, notes
        "partNumber": partno or typ,          # LUBE/SUND/10W30 rows have no Yamaha part no — code doubles as key
        "name": typ if partno else (f"{typ} ({notes})" if notes else typ),
        "cost": r2(ctd),
        "sellPrice": sell,
        "stockLevel": None,
        "notes": " | ".join(x for x in [notes, f"unit: {clean(row[6])}" if clean(row[6]) else None,
                                        f"serv cost: {num(row[5])}" if num(row[5]) is not None else None] if x) or None,
        "unit": clean(row[6]),
        "servCost": num(row[5]),
        "isBandedCode": banded,
        "hpBand": notes if banded else None,
        "sourceRow": i,
    })
out = {
    "meta": {
        "source": SRC, "sheet": "Oils and Lubes",
        "extractedUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "count": len(parts),
        "note": "LUBE1-8 = gear-oil price bands by HP; SUND1-7 = sundry bands by HP — referenced by Std Service Schedules gearOil.code / sundries.code",
    },
    "parts": parts,
}
with open(f"{OUT}/service-consumables.json", "w") as f:
    json.dump(out, f, indent=1)
print(f"service-consumables.json: {len(parts)} consumables "
      f"({sum(1 for p in parts if p['isBandedCode'])} banded LUBE/SUND codes)")

wb.close()

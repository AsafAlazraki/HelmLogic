#!/usr/bin/env python3
"""Phase 2 (boats) — MPF 'Boat Module.xlsx' extractor.

STRICTLY READ-ONLY on the source workbook (openpyxl read_only=True, data_only=True).
Drives from the evidence map in tasks/mpf-audit/analysis/boat-module.evidence.json:
  - real columns end at 678 (col 678 = 'END' marker); everything beyond is phantom
  - header rows 1-3 (row 2 = check-code row), data from row 4
  - brand divider rows repeat the full header (Model Code cell holds literal 'Model Code')
    and RE-DEFINE spec-column labels (cols 7-21) + parts of the cost chain (251-257) per brand
  - OBSOLETE section starts at the divider whose col-1 marker begins with 'OBSOLETE'
    (documented row 1005) — current boats only (D1: 810 rows)
  - pseudo rows 'Motor Quote Module' / 'Trailer Quote Module' are quoting entry points, not boats

Output: tasks/mpf-audit/extracted/boats.json
"""
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "tasks" / "mpf-source" / "Boat Module.xlsx"
OUT = ROOT / "tasks" / "mpf-audit" / "extracted" / "boats.json"

MAX_COL = 678  # END marker col — bound scan
SHEET = "Boat Module"

# Divider col-1 marker -> canonical brand name (evidence: 9 dividers, Stacer opens the sheet)
BRAND_MARKERS = {
    "STACER": "Stacer",
    "STABICRAFT": "Stabicraft",
    "SURTEES": "Surtees",
    "JEANNEAU": "Jeanneau",
    "MERRY FISHER": "Merry Fisher",
    "CAP CAMARAT": "Cap Camarat",
    "HAINES SIGNATURE": "Haines Signature",
    "HAINES": "Haines Signature",
    "HIGHFIELD": "Highfield Inflatables",
    "HIGHFIELD INFLATABLES": "Highfield Inflatables",
    "FORMOSA": "Formosa",
    "YAMAHA": "__pseudo_yamaha__",
    "ADMINISTRATION": "__pseudo_admin__",
}
PSEUDO_MODEL_CODES = {"Motor Quote Module", "Trailer Quote Module"}

# Highfield range derivation from model-code prefix (task spec)
RANGE_BY_PREFIX = {
    "CL": "Classic", "SP": "Sport", "RU": "Roll-Up", "UL": "Ultra-Light",
    "AL": "Adventure", "PA": "Patrol", "CO": "Coaster",
}
MODEL_TOKEN_RE = re.compile(r"\b(CL|SP|RU|UL|AL|PA|CO)\s?(\d{2,4}[A-Z]*)\b")
MATERIAL_RE = re.compile(r"\b(PVC|HYP|HYPALON|ORCA)\b", re.I)
COLOR_RE = re.compile(r"\b([A-Z]{1,3}(?:-[A-Z]{1,3}){1,4})\b")

NR_PREFIXES = ("NR -", "NR-")


def is_empty(v):
    return v is None or (isinstance(v, str) and v.strip() in ("", "."))


def s(v):
    """Cell -> clean string or None."""
    if is_empty(v):
        return None
    return str(v).strip()


def num(v):
    """Cell -> float or None (rejects '#VALUE!' and other junk strings)."""
    if v is None:
        return None
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return float(v)
    t = str(v).strip().replace(",", "").replace("$", "")
    if not t or t.startswith("#"):
        return None
    try:
        return float(t)
    except ValueError:
        return None


MATERIALS = {"PVC", "HYP", "HYPALON", "ORCA"}


def parse_highfield_name(boat_name):
    """Split a Highfield display name into (model, material, colorCode).

    Observed shapes:
      'Highfield - CL380 (HYP) W-W-WD'            -> ('CL380', 'HYP', 'W-W-WD')
      'Highfield - Coaster 540 open (PVC) LG-W-DG' -> ('Coaster 540 open', 'PVC', 'LG-W-DG')
      'Highfield - ADV9 (Dune)'                    -> ('ADV9', None, 'Dune')
    """
    if not boat_name:
        return None, None, None
    t = re.sub(r"^Highfield\s*-\s*", "", boat_name.strip(), flags=re.I).strip()
    material = None
    color = None
    parens = list(re.finditer(r"\(([^)]+)\)", t))
    mat_m = next((p for p in parens if p.group(1).strip().upper() in MATERIALS), None)
    m = mat_m or (parens[0] if parens else None)
    if m:
        inner = m.group(1).strip()
        if mat_m:
            material = "HYP" if inner.upper() == "HYPALON" else inner.upper()
        else:
            color = inner  # colourway name, e.g. ADV9 '(Dune)'
        model = t[: m.start()].strip(" -")  # keeps 'SP700WL(Windlass)' intact when the material paren is used
        tail = t[m.end():].strip(" -")
        if tail and color is None:
            color = tail
    else:
        # no parenthesis — try trailing dash-code as colour
        cm = COLOR_RE.search(t.upper())
        model = t
        if cm and cm.group(1) not in MATERIALS:
            color = cm.group(1)
            model = t[: cm.start()].strip(" -")
    return (model or None), material, color


def highfield_range(model):
    """Derive HelmLogic range from the parsed Highfield model string."""
    if not model:
        return None
    u = model.upper()
    if u.startswith("COASTER") or u.startswith("CO"):
        if u.startswith("COASTER"):
            return "Coaster"
    if u.startswith("ADV"):
        return "Adventure"
    return RANGE_BY_PREFIX.get(u[:2])


def main():
    if not SRC.exists():
        sys.exit(f"source not found: {SRC}")

    wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
    ws = wb[SHEET]

    boats = []
    brand = "Stacer"  # sheet opens with Stacer (row-3 header carries the STACER marker)
    spec_labels = {}   # col -> label, redefined by each brand divider
    cost_labels = {}   # col -> label for the 243-259 chain
    divider_rows = []
    unknown_markers = []
    parse_failures = []
    landed_mismatches = 0
    stopped_at = None

    for row_idx, row in enumerate(
        ws.iter_rows(min_row=1, max_row=2301, max_col=MAX_COL, values_only=True), start=1
    ):
        def c(col):  # 1-based column accessor into this row tuple
            return row[col - 1]

        model_code = s(c(4))

        # header rows 1-2; row 3 is the repeated header that also opens the Stacer section
        if row_idx <= 3:
            if row_idx == 3:
                spec_labels = {i: s(c(i)) for i in range(7, 22)}
                cost_labels = {i: s(c(i)) for i in range(243, 260)}
            continue

        # brand divider rows come in two shapes (verified in-sheet):
        #  (a) full repeated header row — Model Code cell holds the literal 'Model Code'
        #  (b) sparse marker row — Model Code empty, brand marker in col 1 and/or col 3
        #      (YAMAHA @949, Administration @951, FORMOSA @955, OBSOLETE @1005)
        marker = s(c(1)) or (s(c(3)) if model_code in (None, "Model Code") else None) or ""
        key = marker.upper().strip()
        if model_code in (None, "Model Code") and (key in BRAND_MARKERS or key.startswith("OBSOLETE")):
            if key.startswith("OBSOLETE"):
                stopped_at = row_idx
                break  # D1: current boats only
            brand = BRAND_MARKERS[key]
            # a full divider row redefines spec + cost-chain labels for its section
            spec_labels = {i: s(c(i)) or spec_labels.get(i) for i in range(7, 22)}
            cost_labels = {i: s(c(i)) or cost_labels.get(i) for i in range(243, 260)}
            divider_rows.append({"row": row_idx, "marker": marker, "brand": brand})
            continue
        if model_code == "Model Code":
            unknown_markers.append({"row": row_idx, "marker": marker})
            continue

        if model_code is None or model_code in PSEUDO_MODEL_CODES:
            continue
        if brand.startswith("__pseudo"):
            continue  # any stray rows inside the Yamaha/Administration pseudo sections

        boat_name = s(c(3))

        # ---- identity / Highfield model-variant split ----
        rec = {
            "sourceRow": row_idx,
            "modelCode": model_code,
            "brand": brand,
            "name": boat_name,
            "matrix": s(c(5)),
            "imageLink": s(c(6)),
        }
        if brand == "Highfield Inflatables":
            model, material, color = parse_highfield_name(boat_name)
            rng = highfield_range(model)
            rec["highfield"] = {
                "model": model, "material": material, "colorCode": color, "range": rng,
            }
            rec["range"] = rng
            if model is None or rng is None:
                parse_failures.append({"row": row_idx, "modelCode": model_code, "name": boat_name})

        # ---- specs (brand-dependent labels from the governing divider row) ----
        specs = {}
        for i in range(7, 22):
            v = s(c(i))
            if v is not None:
                specs[spec_labels.get(i) or f"col{i}"] = v
        rec["specs"] = specs

        # ---- landed-cost chain ----
        currency = s(c(243)) or "AUD"
        ex_rate = num(c(244)) or 1.0
        duty = num(c(245)) or 0.0
        base_cost = num(c(247)) or 0.0
        fd1 = num(c(248)) or 0.0
        fd2 = num(c(249)) or 0.0
        fd2_note = None if num(c(249)) is not None else s(c(249))
        charges = {}
        charges_sum = 0.0
        for i in range(250, 257):  # brand-labelled factory-currency charge columns
            v = num(c(i)) or 0.0
            charges[cost_labels.get(i) or f"col{i}"] = v
            charges_sum += v
        other_chg_aud = num(c(257)) or 0.0
        road_freight = num(c(258)) or 0.0
        landed_cell = num(c(259))
        # Duty semantics (verified on Jeanneau/Merry Fisher/Cap Camarat rows): values in
        # (0,1) are a RATE that feeds the brand's 'Stamp Duty' charge column — already in
        # the additive chain — not an additive dollar amount. Only duty >= 1 is additive
        # (never observed; kept for safety).
        duty_is_rate = 0 < duty < 1
        duty_additive = 0.0 if duty_is_rate else duty
        landed_computed = (base_cost + fd1 + fd2 + charges_sum) / ex_rate + duty_additive \
            + other_chg_aud + road_freight
        landed_delta = None if landed_cell is None else round(landed_computed - landed_cell, 4)
        landed_ok = landed_cell is not None and abs(landed_delta) <= 0.01
        if not landed_ok:
            landed_mismatches += 1
        rec["landedCostChain"] = {
            "currency": currency, "exRate": ex_rate, "duty": duty,
            "dutyIsRate": duty_is_rate, "baseCost": base_cost,
            "factoryDiscounts": [fd1, fd2], "factoryDiscountNote": fd2_note,
            "charges": charges, "otherChgAud": other_chg_aud, "roadFreight": road_freight,
            "landedAUD": landed_cell, "landedComputed": round(landed_computed, 4),
            "landedDelta": landed_delta, "landedVerified": landed_ok,
        }

        # ---- markups (Price Matrix copies) ----
        ho_mu = num(c(266))
        rec["markups"] = {
            "hoMu": ho_mu, "bmtMu": num(c(267)), "factoryOptionsMu": num(c(268)),
            "dealerFitMu": num(c(269)), "adminLoad": num(c(270)), "warrantyAdj": num(c(271)),
        }

        # ---- sell ladder (all inc GST; D2: NSM inc-GST cash is authoritative) ----
        cash = num(c(460))
        ladder_inc = {
            "cashIncGst": cash, "tradeIncGst": num(c(462)), "subDealerIncGst": num(c(464)),
            "subExclusiveIncGst": num(c(466)), "ausSailingIncGst": num(c(468)),
            "warrantyIncGst": num(c(470)),
        }
        ladder_ex = {
            k.replace("IncGst", "ExGst"): (round(v / 1.1, 2) if v is not None else None)
            for k, v in ladder_inc.items()
        }
        deviation = None
        if cash is not None and landed_cell is not None and ho_mu is not None:
            expected = landed_cell * (1 + ho_mu) * 1.1
            deviation = round(cash - expected, 2)
        rec["sellLadder"] = {
            **ladder_inc, **ladder_ex,
            "gpPctCash": num(c(461)),
            "formulaExpectedCashIncGst": (round(expected, 2) if deviation is not None else None),
            "formulaDeviation": deviation,
            "formulaDeviationFlag": bool(deviation is not None and abs(deviation) > 1.0),
        }

        # ---- standard inclusions (SFI-01..51) ----
        rec["standardInclusions"] = [s(c(i)) for i in range(24, 75) if s(c(i))]

        # ---- factory option codes (FO-01..165) ----
        rec["factoryOptionCodes"] = [s(c(i)) for i in range(77, 242) if s(c(i))]

        # ---- motor envelope + curated motor menu (13 slots; NR sentinels skipped) ----
        rec["motorEnvelope"] = {
            "minHp": s(c(308)), "maxHp": s(c(309)),
            "shaft": s(c(310)), "engConfiguration": s(c(311)),
        }
        menu = []
        slots = [(1, 312)] + [(n, 318 + 6 * (n - 2)) for n in range(2, 14)]
        for slot_n, base in slots:
            name = s(c(base))
            if not name or name.upper().startswith(NR_PREFIXES):
                continue
            menu.append({
                "slot": slot_n,
                "motorName": name,
                "riggingKit": s(c(base + 1)),
                "propPartNo": s(c(base + 2)),
                "propDesc": s(c(base + 3)),
                "engineHole": s(c(base + 4)),
                "recommended": slot_n == 1,
            })
        rec["motorMenu"] = menu

        # ---- trailer menu (10 slots; TRAILER NOT REQUIRED skipped) ----
        trailers = []
        for i in range(390, 400):
            v = s(c(i))
            if v and v.upper() != "TRAILER NOT REQUIRED":
                trailers.append({"slot": i - 389, "name": v, "standard": i == 390})
        rec["trailerMenu"] = trailers

        # ---- dealer-fit lines (01..42) ----
        rec["dealerFitLines"] = [s(c(i)) for i in range(402, 444) if s(c(i))]

        # ---- MPDC / DPDC checklist text ----
        rec["pdChecklists"] = {
            "mpdc": [s(c(i)) for i in range(559, 609) if s(c(i))],
            "dpdc": [s(c(i)) for i in range(611, 641) if s(c(i))],
        }

        # ---- deposit schedule ----
        rec["depositSchedule"] = {
            "pendingSecurity": num(c(446)), "confirmedDeal": num(c(447)),
            "leavingFactory": num(c(448)), "noticeOfArrival": num(c(449)),
            "onHandover": num(c(450)),
        }

        # ---- factory lead times (days) ----
        rec["leadTimesDays"] = {
            "lockout": num(c(453)), "build": num(c(454)), "completion": num(c(455)),
            "shipping": num(c(456)), "estimatedTotal": num(c(457)),
        }

        # ---- registration + safety (context for later phases) ----
        rec["registration"] = {"lengthBand": s(c(299)), "decals": s(c(300))}
        rec["safety"] = {
            "adults": num(c(302)), "gearClass": s(c(303)), "pfdQty": num(c(304)),
            "pfdType": s(c(305)), "anchorKit": s(c(306)),
        }

        boats.append(rec)

    wb.close()

    by_brand = {}
    for b in boats:
        by_brand[b["brand"]] = by_brand.get(b["brand"], 0) + 1

    meta = {
        "source": str(SRC.relative_to(ROOT)),
        "extractedAt": datetime.now(timezone.utc).isoformat(),
        "sheet": SHEET,
        "boundScan": {"maxCol": MAX_COL, "obsoleteDividerRow": stopped_at},
        "counts": {
            "currentBoats": len(boats),
            "byBrand": by_brand,
            "landedCostVerified": len(boats) - landed_mismatches,
            "landedCostMismatches": landed_mismatches,
            "formulaDeviationFlags": sum(
                1 for b in boats if b["sellLadder"]["formulaDeviationFlag"]),
            "highfieldParseFailures": len(parse_failures),
        },
        "dividerRows": divider_rows,
        "unknownBrandMarkers": unknown_markers,
        "highfieldParseFailures": parse_failures,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"meta": meta, "boats": boats}, indent=1))
    print(json.dumps(meta["counts"], indent=2))
    print("dividers:", [(d["row"], d["marker"]) for d in divider_rows])
    print("unknown markers:", unknown_markers)
    print(f"stopped at OBSOLETE divider row {stopped_at}")
    print(f"wrote {OUT} ({OUT.stat().st_size/1e6:.1f} MB)")


if __name__ == "__main__":
    main()

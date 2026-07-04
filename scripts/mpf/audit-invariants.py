#!/usr/bin/env python3
"""Financial-invariants audit — READ-ONLY against Firestore (no writes, ever).

Walks every LIVE current-MPF boat variant (Highfield's 7 ranges under vendor
LafOLpLb6QIFE856TiD4 + the 8 routed brands per scripts/mpf/import-boats.py
BRAND_ROUTING) and checks, per variant:

  I1  incGst/exGst consistency — priceIncGst is the hand-rounded authoritative
      figure (D2); sellPriceExclGst must equal priceIncGst / 1.1 within 1c.
      Same check applied to every priceLadder tier (inc vs ex).
  I2  ladder ordering sanity — subDealer.exGst <= trade.exGst <= cash exGst.
      Violations are CLASSIFIED (which pair inverted, by how much), not assumed
      to be data corruption: the MPF may legitimately price a tier above cash.
  I3  landedCostChain internal sum — components recompute to landedAUD within
      1c. Uses the chain's own landedComputed/landedDelta fields when present;
      recomputes otherwise (same formula as extract-boats.py, incl. the
      duty-is-rate rule).
  I4  margin sanity — cost <= sellPriceExclGst; negative-margin variants listed.
  I5  motorMenu slot vs model.motorEnvelope — each menu motor resolved to a live
      Yamaha row (quote-flow resolution ladder), HP Rating parsed ('2 x 300'
      style -> per-engine HP per the getMotorHp() lesson), then checked against
      the model's motorEnvelope minHp..maxHp. A mismatch = quote-flow filter
      conflict (recommended card shown but the HP filter would exclude it).
  I6  depositSchedule stages sum to 100% / 1.0 (both bases accepted).
  I7  trailerMenu entries reference live trailer docs that carry a positive
      sellPriceExclGst (7 trailer vendors, quote-flow name-resolution ladder).

Org-level:
  I8  serviceOperations — sellPrice present OR derivable (flatRateHours x
      hourlyRate). Flags where NEITHER holds. Also (informational) counts where
      an explicit sellPrice deviates from hours x rate — MPF sell is
      authoritative, so those are classified, not violations.
  I9  riggingKits — totalSellInstalledExclGst vs recompute
      sellPriceExclGst + installLabour + installAdditionalParts + installSundry
      within 1c.

Outputs:
  tasks/test-evidence/invariants-audit.json   (machine-readable, every violation)
  (INVARIANTS_AUDIT.md is authored from this JSON — see tasks/test-evidence/)

Usage: python3 scripts/mpf/audit-invariants.py
"""
import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _fs  # Firestore REST helpers — READ-ONLY usage (list_docs only)

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "tasks", "test-evidence", "invariants-audit.json")
ORG = "AcFZVEFA5UDJG2hyetWT"

HF_VENDOR = "LafOLpLb6QIFE856TiD4"
HF_RANGES = {
    "Classic": "qo7IePnRzJxjrYyLWhTn", "Roll-Up": "EqcKQ51svI1I2Q5poFdl",
    "Ultra-Light": "QsGZuVwutEr5yyMkp97j", "Sport": "nQ2LE50z9Tbf2uss0Ote",
    "Adventure": "sEzdrM2fZsrOKA3ACrJp", "Patrol": "vfXxDuMpChteKncb7LnG",
    "Coaster": "coaster",
}
# Mirrors scripts/mpf/import-boats.py BRAND_ROUTING (brand -> vendor/range).
BRAND_ROUTING = {
    "Stacer": ("LWgHuGoKfUBeKZ8eWnEi", "mpf-catalog"),
    "Stabicraft": ("0cUm736tE9ON2WFLRHD0", "mpf-catalog"),
    "Surtees": ("gLAi5eHYiZDgrvjDUaos", "mpf-catalog"),
    "Haines Signature": ("DJ5GVMzLaNWNcOlRqzJV", "mpf-catalog"),
    "Jeanneau": ("lwGHoqdqNPuSZYYQAgG7", "jeanneau-mpf"),
    "Merry Fisher": ("lwGHoqdqNPuSZYYQAgG7", "merry-fisher"),
    "Cap Camarat": ("lwGHoqdqNPuSZYYQAgG7", "cap-camarat"),
    "Formosa": ("formosa", "mpf-catalog"),
}
YAMAHA_ROWS = "data-warehouse/mRAzkE8PUX8GMHELCvJo/dataSets/FQ5uTMyUorrJPlpbWIY8/rows"
TRAILER_VENDORS = ["dunbier-trailers", "dunbier-haines-bmt", "gfab-trailers",
                   "mackay-trailers", "redco-tinka-trailers", "stacer-trailers",
                   "obsolete-trailers"]

TOL = 0.0105  # "within 1c" with float slack


def norm(s):
    return re.sub(r"\s+", " ", str(s or "")).strip().lower()


def numeric(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def num_or_none(v):
    """Coerce a possibly-string numeric field ('300', '9.9') to float."""
    if numeric(v):
        return float(v)
    if isinstance(v, str):
        m = re.match(r"^\s*\$?\s*(\d+(?:[.,]\d+)?)\s*(?:hp)?\s*$", v, re.I)
        if m:
            return float(m.group(1).replace(",", ""))
    return None


def parse_hp(raw):
    """HP Rating incl multi-engine strings: '2 x 300' -> per-engine 300
    (getMotorHp() lesson: NEVER raw parseFloat, which returns 2)."""
    if numeric(raw):
        return float(raw), 1
    s = str(raw or "").strip()
    if not s:
        return None, None
    m = re.match(r"^(\d+)\s*[x×X]\s*(\d+(?:\.\d+)?)$", s)
    if m:
        return float(m.group(2)), int(m.group(1))
    m = re.match(r"^(\d+(?:\.\d+)?)$", s)
    if m:
        return float(m.group(1)), 1
    return None, None  # 'Electric' etc.


# ------------------------------------------------------------- reference data

def build_motor_index():
    rows = _fs.list_docs(YAMAHA_ROWS)
    exact, scan = {}, []
    for r in rows:
        code = str(r.get("MODEL CODE") or "").strip()
        names = set()
        for k in ("MODEL", "DESCRIPTION", "Model", "Description"):
            v = r.get(k)
            if isinstance(v, str) and v.strip():
                names.add(v)
        if code:
            names.add(code)
            names.add(f"Yamaha - {code}")
        for n in names:
            exact.setdefault(norm(n), r)
        disp = r.get("MODEL") or (f"Yamaha - {code}" if code else None)
        if disp:
            scan.append((norm(disp), r))
    return rows, exact, scan


def resolve_motor(name, exact, scan):
    """Quote-flow resolvedMotorMenu ladder: exact CI -> contains on the model
    part after ' - '."""
    target = norm(name)
    if not target:
        return None
    if target in exact:
        return exact[target]
    model_part = (target.split(" - ")[-1] or target).strip()
    if not model_part:
        return None
    for disp, row in scan:
        if model_part in disp:
            return row
    return None


def load_trailers():
    out = []
    for tv in TRAILER_VENDORS:
        for s in _fs.list_docs(f"data-warehouse/{tv}/series"):
            for t in _fs.list_docs(f"data-warehouse/{tv}/series/{s['_id']}/trailers"):
                t["_vendor"] = tv
                out.append(t)
    return [(norm(t.get("name")), t) for t in out if norm(t.get("name"))]


def resolve_by_label(target_raw, labelled):
    t = norm(target_raw)
    if not t:
        return None
    for lbl, d in labelled:
        if lbl == t:
            return d
    for lbl, d in labelled:
        if lbl and (t in lbl or lbl in t):
            return d
    return None


# ---------------------------------------------------------------- boat walk

def walk_boats():
    boats = []

    def hf_range(item):
        rname, rid = item
        out = []
        for m in _fs.list_docs(f"data-warehouse/{HF_VENDOR}/ranges/{rid}/models"):
            for v in _fs.list_docs(
                    f"data-warehouse/{HF_VENDOR}/ranges/{rid}/models/{m['_id']}/variants"):
                if not v.get("mpfSource"):
                    continue  # legacy/demo variant — not a current MPF boat
                out.append({"brand": "Highfield", "range": rname, "model": m,
                            "variant": v,
                            "label": f"Highfield {m.get('name') or m['_id']}/{v['_id']}"})
        return out

    def brand_walk(item):
        brand, (vid, rid) = item
        out = []
        for m in _fs.list_docs(f"data-warehouse/{vid}/ranges/{rid}/models"):
            for v in _fs.list_docs(
                    f"data-warehouse/{vid}/ranges/{rid}/models/{m['_id']}/variants"):
                if not v.get("mpfSource"):
                    continue
                out.append({"brand": brand, "range": rid, "model": m, "variant": v,
                            "label": f"{brand} {m.get('name') or m['_id']}/{v['_id']}"})
        return out

    with ThreadPoolExecutor(max_workers=8) as ex:
        for chunk in ex.map(hf_range, HF_RANGES.items()):
            boats.extend(chunk)
        for chunk in ex.map(brand_walk, BRAND_ROUTING.items()):
            boats.extend(chunk)
    return boats


# ---------------------------------------------------------------- invariants

class Inv:
    def __init__(self, name, desc):
        self.name, self.desc = name, desc
        self.checked = 0
        self.skipped = 0          # not applicable (nulls / sentinels)
        self.violations = []      # [{id, ...values}]
        self.classified = []      # legit-but-notable, kept out of the violation count

    def summary(self):
        return {"invariant": self.name, "description": self.desc,
                "checked": self.checked, "skipped": self.skipped,
                "violationCount": len(self.violations),
                "classifiedCount": len(self.classified),
                "violations": self.violations, "classified": self.classified}


def r2(x):
    return None if x is None else round(x, 2)


def main():
    print("=== financial-invariants audit (READ-ONLY) ===")
    _fs.token()

    print("loading reference indexes ...")
    yam_rows, yam_exact, yam_scan = build_motor_index()
    trailers_labelled = load_trailers()
    service_ops = _fs.list_docs(f"organisations/{ORG}/serviceOperations")
    rigging_kits = _fs.list_docs(f"organisations/{ORG}/riggingKits")
    print(f"  yamahaRows={len(yam_rows)} liveTrailers={len(trailers_labelled)} "
          f"serviceOperations={len(service_ops)} riggingKits={len(rigging_kits)}")

    print("walking live current-MPF boat variants ...")
    boats = walk_boats()
    by_brand = {}
    for b in boats:
        by_brand[b["brand"]] = by_brand.get(b["brand"], 0) + 1
    print(f"  variants walked: {len(boats)}  {by_brand}")

    i1 = Inv("I1.incExGst", "sellPriceExclGst == priceIncGst/1.1 (1c); ladder tiers ex == inc/1.1 (1c)")
    i2 = Inv("I2.ladderOrder", "subDealer.exGst <= trade.exGst <= cash exGst (classified, not assumed corrupt)")
    i3 = Inv("I3.landedChain", "landedCostChain components recompute to landedAUD within 1c")
    i4 = Inv("I4.margin", "cost <= sellPriceExclGst (negative-margin variants)")
    i5 = Inv("I5.motorEnvelope", "motorMenu motor HP within model.motorEnvelope minHp..maxHp")
    i6 = Inv("I6.depositSchedule", "deposit stages sum to 100% / 1.0")
    i7 = Inv("I7.trailerMenu", "trailerMenu names resolve to live trailers with positive sellPriceExclGst")
    i8 = Inv("I8.serviceOps", "serviceOperations sellPrice present or derivable (flatRateHours x hourlyRate)")
    i9 = Inv("I9.riggingKits", "riggingKits totalSellInstalledExclGst == sell + labour + addl parts + sundry (1c)")

    seen_models = set()
    for b in boats:
        v, m, label = b["variant"], b["model"], b["label"]
        vid = v.get("_path")

        # ---------------- I1: inc/ex GST ----------------
        inc, ex = v.get("priceIncGst"), v.get("sellPriceExclGst")
        if numeric(inc) and numeric(ex):
            i1.checked += 1
            expect_ex = round(inc / 1.1, 2)
            if abs(ex - expect_ex) > TOL:
                i1.violations.append({"id": vid, "field": "cash", "priceIncGst": inc,
                                      "sellPriceExclGst": ex, "expectedExGst": expect_ex,
                                      "delta": r2(ex - expect_ex)})
        elif inc is None and ex is None:
            i1.skipped += 1
        else:
            i1.checked += 1
            i1.classified.append({"id": vid, "field": "cash",
                                  "note": "one-sided (inc xor ex present)",
                                  "priceIncGst": inc, "sellPriceExclGst": ex})
        ladder = v.get("priceLadder") or {}
        for tier, pair in ladder.items():
            if not isinstance(pair, dict):
                continue
            tinc, tex = pair.get("incGst"), pair.get("exGst")
            if numeric(tinc) and numeric(tex):
                i1.checked += 1
                expect_ex = round(tinc / 1.1, 2)
                if abs(tex - expect_ex) > TOL:
                    i1.violations.append({"id": vid, "field": f"ladder.{tier}",
                                          "incGst": tinc, "exGst": tex,
                                          "expectedExGst": expect_ex,
                                          "delta": r2(tex - expect_ex)})
            else:
                i1.skipped += 1

        # ---------------- I2: ladder ordering ----------------
        sub_ex = (ladder.get("subDealer") or {}).get("exGst")
        trade_ex = (ladder.get("trade") or {}).get("exGst")
        cash_ex = ex
        if numeric(sub_ex) and numeric(trade_ex) and numeric(cash_ex):
            i5_applicable = True
            i2.checked += 1
            problems = []
            if sub_ex > trade_ex + TOL:
                problems.append({"pair": "subDealer>trade", "delta": r2(sub_ex - trade_ex)})
            if trade_ex > cash_ex + TOL:
                problems.append({"pair": "trade>cash", "delta": r2(trade_ex - cash_ex)})
            if problems:
                i2.violations.append({"id": vid, "subDealerExGst": sub_ex,
                                      "tradeExGst": trade_ex, "cashExGst": cash_ex,
                                      "inversions": problems,
                                      "classification": "MPF ladder as-imported — "
                                      "verify against source before treating as corruption"})
        else:
            i2.skipped += 1

        # ---------------- I3: landed chain ----------------
        chain = v.get("landedCostChain") or {}
        landed = chain.get("landedAUD")
        if not chain or not numeric(landed):
            i3.skipped += 1
        else:
            i3.checked += 1
            delta = chain.get("landedDelta")
            computed = chain.get("landedComputed")
            if not numeric(delta):
                # recompute (extract-boats.py formula incl duty-is-rate rule)
                ex_rate = chain.get("exRate") or 1.0
                duty = chain.get("duty") or 0.0
                duty_add = 0.0 if 0 < duty < 1 else duty
                fds = chain.get("factoryDiscounts") or [0, 0]
                charges = sum(x for x in (chain.get("charges") or {}).values()
                              if numeric(x))
                computed = ((chain.get("baseCost") or 0.0)
                            + sum(x for x in fds if numeric(x)) + charges) / ex_rate \
                    + duty_add + (chain.get("otherChgAud") or 0.0) \
                    + (chain.get("roadFreight") or 0.0)
                delta = computed - landed
            if abs(delta) > TOL:
                i3.violations.append({"id": vid, "landedAUD": landed,
                                      "landedComputed": r2(computed),
                                      "delta": r2(delta),
                                      "currency": chain.get("currency"),
                                      "verifiedFlag": chain.get("landedVerified")})

        # ---------------- I4: margin ----------------
        cost = v.get("cost")
        if numeric(cost) and numeric(ex):
            i4.checked += 1
            if cost > ex + TOL:
                i4.violations.append({"id": vid, "cost": cost,
                                      "sellPriceExclGst": ex,
                                      "marginAUD": r2(ex - cost)})
        else:
            i4.skipped += 1

        # ---------------- I5: motor menu vs envelope ----------------
        env = (m.get("motorEnvelope") or {})
        min_hp = num_or_none(env.get("minHp"))
        max_hp = num_or_none(env.get("maxHp"))
        for e in (v.get("motorMenu") or []):
            if not isinstance(e, dict):
                continue
            nm = str(e.get("motorName") or "").strip()
            if not nm:
                continue
            if min_hp is None and max_hp is None:
                i5.skipped += 1
                continue
            row = resolve_motor(nm, yam_exact, yam_scan)
            if row is None:
                i5.skipped += 1  # resolution misses covered by everything-check
                continue
            hp, engines = parse_hp(row.get("HP Rating"))
            if hp is None:
                i5.classified.append({"id": vid, "slot": e.get("slot"),
                                      "motorName": nm,
                                      "hpRating": row.get("HP Rating"),
                                      "note": "HP unparseable (electric/blank)"})
                continue
            i5.checked += 1
            lo = min_hp if min_hp is not None else float("-inf")
            hi = max_hp if max_hp is not None else float("inf")
            if not (lo - 1e-9 <= hp <= hi + 1e-9):
                i5.violations.append({"id": vid, "slot": e.get("slot"),
                                      "recommended": bool(e.get("recommended")),
                                      "motorName": nm, "perEngineHp": hp,
                                      "engines": engines,
                                      "envelopeMinHp": min_hp, "envelopeMaxHp": max_hp,
                                      "impact": "card shown in menu but quote-flow "
                                      "HP filter would exclude"})

        # ---------------- I6: deposit schedule (per unique model) ----------------
        if m["_path"] not in seen_models:
            seen_models.add(m["_path"])
            ds = m.get("depositSchedule") or {}
            vals = [x for x in ds.values() if numeric(x)]
            if not vals:
                i6.skipped += 1
            else:
                i6.checked += 1
                total = sum(vals)
                ok = abs(total - 1.0) <= 0.005 or abs(total - 100.0) <= 0.5
                if not ok:
                    i6.violations.append({"id": m["_path"], "stages": ds,
                                          "sum": r2(total),
                                          "stagesPresent": len(vals),
                                          "stagesNull": len(ds) - len(vals)})

        # ---------------- I7: trailer menu ----------------
        for e in (v.get("trailerMenu") or []):
            if not isinstance(e, dict):
                continue
            nm = str(e.get("name") or "").strip()
            if not nm or re.match(r"^(trailer\s+not\s+required|not\s+required|no\s+trailer)",
                                  norm(nm)):
                i7.skipped += 1
                continue
            i7.checked += 1
            t = resolve_by_label(nm, trailers_labelled)
            if t is None:
                i7.violations.append({"id": vid, "slot": e.get("slot"), "name": nm,
                                      "problem": "unresolved — no live trailer doc"})
            elif not (numeric(t.get("sellPriceExclGst")) and t["sellPriceExclGst"] > 0):
                i7.violations.append({"id": vid, "slot": e.get("slot"), "name": nm,
                                      "resolvedTo": t.get("_path"),
                                      "sellPriceExclGst": t.get("sellPriceExclGst"),
                                      "problem": "resolved but no positive sellPriceExclGst"})

    # ---------------- I8: serviceOperations ----------------
    for op in service_ops:
        i8.checked += 1
        sell = op.get("sellPrice")
        hrs, rate = op.get("flatRateHours"), op.get("hourlyRate")
        derivable = numeric(hrs) and numeric(rate) and hrs > 0 and rate > 0
        if not numeric(sell) and not derivable:
            i8.violations.append({"id": op["_id"], "code": op.get("code"),
                                  "sellPrice": sell, "flatRateHours": hrs,
                                  "hourlyRate": rate,
                                  "problem": "neither explicit sellPrice nor derivable"})
        elif numeric(sell) and derivable and abs(sell - hrs * rate) > TOL:
            i8.classified.append({"id": op["_id"], "code": op.get("code"),
                                  "sellPrice": sell, "hoursXrate": r2(hrs * rate),
                                  "delta": r2(sell - hrs * rate),
                                  "note": "explicit MPF sell overrides hours x rate "
                                  "(authoritative — informational only)"})

    # ---------------- I9: riggingKits ----------------
    for k in rigging_kits:
        total = k.get("totalSellInstalledExclGst")
        sell = k.get("sellPriceExclGst")
        parts = [k.get("installLabour"), k.get("installAdditionalParts"),
                 k.get("installSundry")]
        if not numeric(total):
            i9.skipped += 1
            continue
        i9.checked += 1
        recomputed = (sell if numeric(sell) else 0.0) + \
            sum(x for x in parts if numeric(x))
        if abs(recomputed - total) > TOL:
            i9.violations.append({"id": k["_id"],
                                  "description": k.get("description"),
                                  "totalSellInstalledExclGst": total,
                                  "recomputed": r2(recomputed),
                                  "delta": r2(recomputed - total),
                                  "sellPriceExclGst": sell,
                                  "installLabour": k.get("installLabour"),
                                  "installAdditionalParts": k.get("installAdditionalParts"),
                                  "installSundry": k.get("installSundry")})

    invs = [i1, i2, i3, i4, i5, i6, i7, i8, i9]
    report = {
        "meta": {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "script": "scripts/mpf/audit-invariants.py",
            "mode": "READ-ONLY",
            "org": ORG,
            "variantsWalked": len(boats),
            "variantsByBrand": by_brand,
            "uniqueModels": len(seen_models),
            "referenceIndexes": {"yamahaRows": len(yam_rows),
                                 "liveTrailers": len(trailers_labelled),
                                 "serviceOperations": len(service_ops),
                                 "riggingKits": len(rigging_kits)},
            "tolerance": "1c (0.0105 float slack)",
        },
        "invariants": [x.summary() for x in invs],
    }
    with open(OUT, "w") as f:
        json.dump(report, f, indent=2, default=str)

    print(f"\nwrote {OUT}\n")
    for x in invs:
        print(f"  {x.name:<20} checked={x.checked:<6} violations={len(x.violations):<5} "
              f"classified={len(x.classified):<4} skipped={x.skipped}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

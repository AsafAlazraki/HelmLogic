#!/usr/bin/env python3
"""Phase 2 (boats) — READ-ONLY reconciliation of extracted MPF boats vs live HelmLogic Firestore.

Matches the 588 Highfield SKUs (modelCode, e.g. HBC066) against live variant docs
(variant doc id == SKU) under data-warehouse/LafOLpLb6QIFE856TiD4/ranges/*/models/*/variants.
Never writes anything.

Outputs:
  tasks/mpf-audit/extracted/boats-diff.json
  tasks/mpf-audit/extracted/BOATS_DIFF.md
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
BOATS = ROOT / "tasks" / "mpf-audit" / "extracted" / "boats.json"
OUT_JSON = ROOT / "tasks" / "mpf-audit" / "extracted" / "boats-diff.json"
OUT_MD = ROOT / "tasks" / "mpf-audit" / "extracted" / "BOATS_DIFF.md"

PROJECT = "studio-2290360004-3b963"
API_KEY = "AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY"
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
HF_VENDOR = "LafOLpLb6QIFE856TiD4"
EMAIL, PASSWORD = "billh@nsmarine.com.au", "Bill2026!"

PRICE_TOL = 0.01  # dollars — anything beyond this is a mismatch


def sign_in():
    r = requests.post(
        f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}",
        json={"email": EMAIL, "password": PASSWORD, "returnSecureToken": True}, timeout=30)
    r.raise_for_status()
    return r.json()["idToken"]


def fv(v):
    for t in ("stringValue", "doubleValue", "booleanValue"):
        if t in v:
            return v[t]
    if "integerValue" in v:
        return int(v["integerValue"])
    if "arrayValue" in v:
        return [fv(x) for x in v["arrayValue"].get("values", [])]
    if "mapValue" in v:
        return {k: fv(x) for k, x in v["mapValue"].get("fields", {}).items()}
    return None


def fields(doc):
    return {k: fv(x) for k, x in doc.get("fields", {}).items()}


def list_all(headers, path):
    docs, token = [], None
    while True:
        url = f"{BASE}/{path}?pageSize=300" + (f"&pageToken={token}" if token else "")
        r = requests.get(url, headers=headers, timeout=60)
        r.raise_for_status()
        j = r.json()
        docs += j.get("documents", [])
        token = j.get("nextPageToken")
        if not token:
            return docs


def main():
    data = json.loads(BOATS.read_text())
    boats = data["boats"]
    hf_boats = [b for b in boats if b["brand"] == "Highfield Inflatables"]
    other_boats = [b for b in boats if b["brand"] != "Highfield Inflatables"]

    H = {"Authorization": f"Bearer {sign_in()}"}

    # ---- walk live Highfield catalog ----
    all_variants = []    # every live variant doc (ids can repeat across models, e.g. demo-default-pvc)
    sku_index = {}       # variant doc id (== SKU for HB* codes) -> record
    live_models = {}     # normalized modelCode -> record
    ranges = list_all(H, f"data-warehouse/{HF_VENDOR}/ranges")
    print(f"live ranges: {len(ranges)}")
    for rg in ranges:
        rid = rg["name"].split("/")[-1]
        rname = fields(rg).get("name", rid)
        for md in list_all(H, f"data-warehouse/{HF_VENDOR}/ranges/{rid}/models"):
            mid = md["name"].split("/")[-1]
            mf = fields(md)
            mcode = mf.get("modelCode") or mf.get("name") or mid
            live_models[str(mcode).replace(" ", "").upper()] = {
                "rangeId": rid, "range": rname, "modelId": mid,
                "modelCode": mcode, "name": mf.get("name"),
            }
            for vd in list_all(H, f"data-warehouse/{HF_VENDOR}/ranges/{rid}/models/{mid}/variants"):
                vid = vd["name"].split("/")[-1]
                vf = fields(vd)
                rec = {
                    "sku": vf.get("sku") or vid, "variantId": vid,
                    "rangeId": rid, "range": rname, "modelId": mid, "modelCode": mcode,
                    "sellPriceExclGst": vf.get("sellPriceExclGst"),
                    "cost": vf.get("cost"),
                    "material": vf.get("material"),
                }
                all_variants.append(rec)
                sku_index.setdefault(vid, rec)
    print(f"live models: {len(live_models)} | live variants: {len(all_variants)}")

    # ---- reconcile Highfield SKUs ----
    per_boat = []
    exact, mismatch, missing = [], [], []
    sell_exact = cost_exact = 0
    sell_drift_signed = sell_drift_abs = cost_drift_signed = cost_drift_abs = 0.0
    matched_skus = set()
    for b in hf_boats:
        sku = b["modelCode"]
        hf = b.get("highfield", {})
        model_norm = (hf.get("model") or "").replace(" ", "").upper()
        model_hit = live_models.get(model_norm)
        lv = sku_index.get(sku)
        row = {
            "modelCode": sku, "name": b["name"], "model": hf.get("model"),
            "range": hf.get("range"), "sourceRow": b["sourceRow"],
            "mpfCashIncGst": b["sellLadder"]["cashIncGst"],
            "mpfCashExGst": b["sellLadder"]["cashExGst"],
            "mpfLandedAUD": b["landedCostChain"]["landedAUD"],
            "modelFoundInHL": bool(model_hit),
            "modelPath": (f"ranges/{model_hit['rangeId']}/models/{model_hit['modelId']}"
                          if model_hit else None),
        }
        if lv is None:
            row["status"] = "missing_in_hl"
            missing.append(row)
        else:
            matched_skus.add(sku)
            sell_d = None
            cost_d = None
            if row["mpfCashExGst"] is not None and lv["sellPriceExclGst"] is not None:
                sell_d = round(row["mpfCashExGst"] - float(lv["sellPriceExclGst"]), 2)
            if row["mpfLandedAUD"] is not None and lv["cost"] is not None:
                cost_d = round(row["mpfLandedAUD"] - float(lv["cost"]), 2)
            row.update({
                "hlPath": f"ranges/{lv['rangeId']}/models/{lv['modelId']}/variants/{lv['variantId']}",
                "hlSellPriceExclGst": lv["sellPriceExclGst"],
                "hlCost": lv["cost"],
                "sellDelta": sell_d,   # MPF-derived exGst cash − HL sellPriceExclGst
                "costDelta": cost_d,   # MPF landed AUD − HL cost
            })
            sell_ok = sell_d is not None and abs(sell_d) <= PRICE_TOL
            cost_ok = cost_d is not None and abs(cost_d) <= PRICE_TOL
            if sell_d is not None:
                sell_drift_signed += sell_d
                sell_drift_abs += abs(sell_d)
                sell_exact += 1 if sell_ok else 0
            if cost_d is not None:
                cost_drift_signed += cost_d
                cost_drift_abs += abs(cost_d)
                cost_exact += 1 if cost_ok else 0
            row["sellMatches"] = sell_ok
            row["costMatches"] = cost_ok
            row["status"] = "exact_match" if (sell_ok and cost_ok) else "price_mismatch"
            (exact if (sell_ok and cost_ok) else mismatch).append(row)
        per_boat.append(row)

    hl_only = [v for v in all_variants if v["variantId"] not in matched_skus]
    worst = sorted(
        mismatch,
        key=lambda r: abs(r.get("sellDelta") or 0) + abs(r.get("costDelta") or 0),
        reverse=True)[:20]

    summary = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": str(BOATS.relative_to(ROOT)),
        "live": {"vendor": HF_VENDOR, "ranges": len(ranges),
                 "models": len(live_models), "variants": len(all_variants)},
        "highfield": {
            "mpfSkus": len(hf_boats),
            "exactMatch": len(exact),
            "priceMismatch": len(mismatch),
            "sellExact": sell_exact,
            "costExact": cost_exact,
            "missingInHL": len(missing),
            "hlOnlyVariants": len(hl_only),
            "sellDriftSigned": round(sell_drift_signed, 2),
            "sellDriftAbs": round(sell_drift_abs, 2),
            "costDriftSigned": round(cost_drift_signed, 2),
            "costDriftAbs": round(cost_drift_abs, 2),
        },
        "nonHighfield": {
            "boats": len(other_boats),
            "byBrand": {},
            "note": "no HelmLogic counterpart expected yet (D4 vendors created at import)",
        },
    }
    for b in other_boats:
        summary["nonHighfield"]["byBrand"][b["brand"]] = \
            summary["nonHighfield"]["byBrand"].get(b["brand"], 0) + 1

    OUT_JSON.write_text(json.dumps({
        "summary": summary,
        "worst20BySellDelta": worst,
        "missingInHL": missing,
        "hlOnlyVariants": hl_only,
        "perBoat": per_boat,
    }, indent=1))

    # ---- human summary ----
    hs = summary["highfield"]
    lines = [
        "# BOATS — MPF vs HelmLogic reconciliation (Phase 2, read-only)",
        "",
        f"Generated {summary['generatedAt']} from `{summary['source']}` against live Firestore "
        f"(`data-warehouse/{HF_VENDOR}`: {summary['live']['ranges']} ranges, "
        f"{summary['live']['models']} models, {summary['live']['variants']} variants).",
        "",
        "## Headline counts (588 Highfield MPF SKUs)",
        "",
        "| Bucket | Count |",
        "|---|---|",
        f"| Exact match (sell AND cost within ${PRICE_TOL}) | {hs['exactMatch']} |",
        f"| — sell matches (MPF cash ÷ 1.1 == HL sellPriceExclGst) | {hs['sellExact']} |",
        f"| — cost matches (MPF landed AUD == HL cost) | {hs['costExact']} |",
        f"| Price mismatch (sell or cost off) | {hs['priceMismatch']} |",
        f"| Missing in HelmLogic | {hs['missingInHL']} |",
        f"| HL-only variants not in MPF current set | {hs['hlOnlyVariants']} |",
        "",
        "## Price drift",
        "",
        f"- Sell (MPF cash ÷ 1.1 vs HL `sellPriceExclGst`): signed **${hs['sellDriftSigned']:,.2f}**, "
        f"absolute **${hs['sellDriftAbs']:,.2f}**",
        f"- Cost (MPF Landed Hull Cost vs HL `cost`): signed **${hs['costDriftSigned']:,.2f}**, "
        f"absolute **${hs['costDriftAbs']:,.2f}**",
        "",
        "Positive delta = MPF is higher than HelmLogic.",
        "",
        "## 20 worst offenders by |sell Δ| + |cost Δ|",
        "",
        "| SKU | Model | MPF cash exGst | HL sellPriceExclGst | Sell Δ | MPF landed | HL cost | Cost Δ |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for r in worst:
        lines.append(
            f"| {r['modelCode']} | {r['model']} | {r['mpfCashExGst']:,.2f} | "
            f"{(r['hlSellPriceExclGst'] if r['hlSellPriceExclGst'] is not None else float('nan')):,.2f} | "
            f"{r['sellDelta']:,.2f} | "
            f"{(r['mpfLandedAUD'] or 0):,.2f} | {(r['hlCost'] if r['hlCost'] is not None else 0):,.2f} | "
            f"{(r['costDelta'] if r['costDelta'] is not None else 0):,.2f} |")
    lines += ["", "## Missing in HelmLogic", ""]
    if missing:
        lines.append("| SKU | Name | Range | Model found in HL? |")
        lines.append("|---|---|---|---|")
        for r in missing:
            lines.append(f"| {r['modelCode']} | {r['name']} | {r['range']} | "
                         f"{'yes — variant missing' if r['modelFoundInHL'] else 'no — model missing too'} |")
    else:
        lines.append("None — every MPF current Highfield SKU exists as a live variant.")
    lines += ["", "## HL-only variants (live, not in MPF current section)", ""]
    if hl_only:
        lines.append("| Variant | Model | Range | Note |")
        lines.append("|---|---|---|---|")
        for v in hl_only:
            s = v["variantId"]
            note = "placeholder/demo" if "demo" in s.lower() or "-STD" in s else \
                "likely OBSOLETE-section SKU or manual add"
            lines.append(f"| {s} | {v['modelCode']} | {v['range']} | {note} |")
    else:
        lines.append("None.")
    lines += [
        "",
        "## Non-Highfield brands (no HL counterpart expected yet — D4 creates vendors at import)",
        "",
        "| Brand | Current boats |",
        "|---|---|",
    ]
    for brand, n in sorted(summary["nonHighfield"]["byBrand"].items()):
        lines.append(f"| {brand} | {n} |")
    lines += ["", f"Total non-Highfield current boats: **{summary['nonHighfield']['boats']}**", ""]
    OUT_MD.write_text("\n".join(lines))

    print(json.dumps(summary["highfield"], indent=2))
    print("non-Highfield:", summary["nonHighfield"]["byBrand"])
    print(f"wrote {OUT_JSON}\nwrote {OUT_MD}")


if __name__ == "__main__":
    main()

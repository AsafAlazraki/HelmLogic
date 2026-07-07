#!/usr/bin/env python3
"""
FFR-33 Phase 1 — blast-radius audit of the org modelOverrides layer (READ-ONLY).

Mark's SP560 test (2026-07-07) proved the quote flow's override-merge layer
was shadowing migrated MPF prices with PRE-MIGRATION values (Stern Shade
$247 override vs $630 MPF catalog). The migration wrote the catalog and never
swept `organisations/{org}/modelOverrides/*`; the app renders catalog+override
with the override winning.

This audit walks EVERY override doc for the org and diffs, against the
catalog model it shadows:
  - optionalFeatures[]: same-name features with a DIFFERENT price/cost
  - model-level sellPriceExclGst / cost
  - variantOverrides: any price-bearing field differing from catalog variants

Output: tasks/test-evidence/override-staleness.json (full itemization)
        + console summary. Zero writes.
"""
import json, os, sys, re
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "mpf"))
import _fs  # noqa: E402

ORG = "AcFZVEFA5UDJG2hyetWT"
HF = "LafOLpLb6QIFE856TiD4"
HF_RANGES = {
    "Classic": "qo7IePnRzJxjrYyLWhTn", "Roll-Up": "EqcKQ51svI1I2Q5poFdl",
    "Ultra-Light": "QsGZuVwutEr5yyMkp97j", "Sport": "nQ2LE50z9Tbf2uss0Ote",
    "Adventure": "sEzdrM2fZsrOKA3ACrJp", "Patrol": "vfXxDuMpChteKncb7LnG",
    "Coaster": "coaster",
}
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "tasks", "test-evidence", "override-staleness.json")


def norm_name(s):
    return re.sub(r"\s+", " ", str(s or "")).strip().lower()


def price_of(f):
    for k in ("sellPriceExclGst", "price"):
        v = f.get(k)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            return float(v)
    return None


def main():
    # Catalog index: modelId -> model doc (all HF ranges; overrides are keyed by modelId)
    catalog = {}
    for rname, rid in HF_RANGES.items():
        for m in _fs.list_docs(f"data-warehouse/{HF}/ranges/{rid}/models"):
            catalog[m["_id"]] = (rname, m)

    overrides = _fs.list_docs(f"organisations/{ORG}/modelOverrides")
    findings = []
    models_with_shadowed_prices = 0
    total_price_shadows = 0

    for ov in overrides:
        mid = ov["_id"]
        entry = {"modelId": mid, "hasCatalogModel": mid in catalog,
                 "overrideKeys": sorted(k for k in ov if not k.startswith("_")),
                 "foPriceShadows": [], "modelPriceShadow": None,
                 "variantShadowKeys": []}
        if mid not in catalog:
            entry["note"] = "override for a model not in the Highfield catalog walk (other vendor or deleted model)"
            findings.append(entry)
            continue
        rname, cat = catalog[mid]
        entry["range"] = rname

        # --- optionalFeatures price shadowing ---
        cat_fo = {norm_name(f.get("name")): f for f in (cat.get("optionalFeatures") or []) if isinstance(f, dict)}
        for f in (ov.get("optionalFeatures") or []):
            if not isinstance(f, dict):
                continue
            key = norm_name(f.get("name"))
            cf = cat_fo.get(key)
            if not cf:
                entry["foPriceShadows"].append({
                    "name": f.get("name"), "overridePrice": price_of(f),
                    "catalogPrice": None, "class": "override-only feature (no catalog counterpart)"})
                continue
            po, pc = price_of(f), price_of(cf)
            if po is not None and pc is not None and abs(po - pc) > 0.005:
                entry["foPriceShadows"].append({
                    "name": f.get("name"), "overridePrice": po, "catalogPrice": pc,
                    "deltaExGst": round(po - pc, 2), "class": "PRICE SHADOWED"})

        # --- model-level price shadowing ---
        for k in ("sellPriceExclGst", "cost"):
            vo, vc = ov.get(k), cat.get(k)
            if isinstance(vo, (int, float)) and isinstance(vc, (int, float)) and abs(vo - vc) > 0.005:
                entry["modelPriceShadow"] = entry["modelPriceShadow"] or {}
                entry["modelPriceShadow"][k] = {"override": vo, "catalog": vc}

        # --- variantOverrides shadowing ---
        vov = ov.get("variantOverrides")
        if isinstance(vov, dict) and vov:
            cat_variants = {v["_id"]: v for v in _fs.list_docs(
                f"data-warehouse/{HF}/ranges/{HF_RANGES[rname]}/models/{mid}/variants")}
            for vid, vdata in vov.items():
                if not isinstance(vdata, dict):
                    continue
                cv = cat_variants.get(vid) or {}
                for k in ("sellPriceExclGst", "priceIncGst", "cost"):
                    a, b = vdata.get(k), cv.get(k)
                    if isinstance(a, (int, float)) and isinstance(b, (int, float)) and abs(a - b) > 0.005:
                        entry["variantShadowKeys"].append(
                            {"variant": vid, "field": k, "override": a, "catalog": b})

        shadows = len([x for x in entry["foPriceShadows"] if x.get("class") == "PRICE SHADOWED"]) \
            + (1 if entry["modelPriceShadow"] else 0) + len(entry["variantShadowKeys"])
        if shadows:
            models_with_shadowed_prices += 1
            total_price_shadows += shadows
        findings.append(entry)

    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "mode": "READ-ONLY",
        "org": ORG,
        "overrideDocs": len(overrides),
        "modelsWithShadowedPrices": models_with_shadowed_prices,
        "totalPriceShadows": total_price_shadows,
        "findings": findings,
    }
    json.dump(report, open(OUT, "w"), indent=1)
    print(f"override docs: {len(overrides)}")
    print(f"models with shadowed prices: {models_with_shadowed_prices}")
    print(f"total shadowed price fields: {total_price_shadows}")
    for e in findings:
        n = len([x for x in e["foPriceShadows"] if x.get("class") == "PRICE SHADOWED"])
        if n or e["modelPriceShadow"] or e["variantShadowKeys"]:
            print(f"  {e.get('range','?')}/{e['modelId']}: {n} FO shadows"
                  f"{' + model-price shadow' if e['modelPriceShadow'] else ''}"
                  f"{' + ' + str(len(e['variantShadowKeys'])) + ' variant shadows' if e['variantShadowKeys'] else ''}")
    print(f"\nwrote {OUT}")


if __name__ == "__main__":
    main()

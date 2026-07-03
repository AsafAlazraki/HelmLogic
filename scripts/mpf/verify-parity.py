#!/usr/bin/env python3
"""MPF Phase 5 — parity verdict builder (READ-ONLY against Firestore).

Consumes the freshly re-run Phase-2 diff outputs (run the four diff scripts
first — diff-boats.py / diff-parts.py / diff-motors-trailers-fo.py /
diff-service-config.py), verifies the 9 df-* dealer-fit seed placeholders'
live state (GET only), folds in the smoke battery's section I/J results when
test-results/smoke-data.json is present, and categorizes every remaining
delta as INTENTIONAL (known, documented) or UNEXPECTED (must be zero).

Writes tasks/test-evidence/mpf-parity.json. No Firestore writes.

Usage: python3 scripts/mpf/verify-parity.py
"""
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _fs  # read-only usage: get_doc only

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EXT = os.path.join(ROOT, "tasks", "mpf-audit", "extracted")
OUT = os.path.join(ROOT, "tasks", "test-evidence", "mpf-parity.json")
ORG = "AcFZVEFA5UDJG2hyetWT"

DF_PLACEHOLDER_IDS = [
    "df-electronic-packages-garmin-gpsmap-package",
    "df-electronic-packages-lowrance-sounder-combo",
    "df-electronic-packages-vhf- -aerial-package",
    "df-general-engine-flush-kit",
    "df-general-fuel-water-separator",
    "df-propeller-spare-alloy-propeller",
    "df-propeller-stainless-propeller",
    "df-rigging-hydraulic-steering-kit",
    "df-rigging-single-engine-rigging-kit",
]


def load(name):
    with open(os.path.join(EXT, name)) as f:
        return json.load(f)


def main():
    boats = load("boats-diff.json")
    parts = load("parts-diff.json")
    mtf = load("mtf-diff.json")
    svc = load("service-config-diff.json")["sections"]

    modules = {}
    unexpected = []  # every entry here is a parity failure

    # ---------------- BOATS ----------------
    hs = boats["summary"]["highfield"]
    hl_only_ids = sorted({v["variantId"] for v in boats["hlOnlyVariants"]})
    missing_codes = [m["modelCode"] for m in boats["missingInHL"]]
    boats_unexpected = hs["priceMismatch"] \
        + len([c for c in missing_codes if c != "HBS15##"])
    if boats_unexpected:
        unexpected.append({"module": "boats", "detail": {
            "priceMismatch": hs["priceMismatch"],
            "missingInHL": [c for c in missing_codes if c != "HBS15##"]}})
    modules["boats (Highfield variants)"] = {
        "checked": hs["mpfSkus"],
        "matched": hs["exactMatch"],
        "sellDriftAbs": hs["sellDriftAbs"], "costDriftAbs": hs["costDriftAbs"],
        "intentionalDeltas": {
            "junkSourceSkuSkipped": [c for c in missing_codes if c == "HBS15##"],
            "hlOnlyLegacyVariantsKept": {
                "distinct": len(hl_only_ids),
                "note": "45 legacy HB* variants (RU200AL/RU200KAM/RU250-300 Easy Go/"
                        "UL220/CL340-380MAX obsolete SKUs) + demo-default-pvc "
                        "placeholder reused on 8 models — deliberately preserved, "
                        "never in MPF current section",
            },
        },
        "unexpectedDeltas": boats_unexpected,
    }

    # ---------------- MOTORS ----------------
    m = mtf["motors"]
    motors_unexpected = m["priceMismatches"] + m["staleInLive"]["count"]
    # 71 missing-in-live were in the APPROVED phase-4 dry-run plan as skips:
    # 39 Jeanneau boat-package powerplants (out of Yamaha vendor scope) +
    # 32 EPROPULSION electric outboards (skipped by the supplier gate).
    if motors_unexpected:
        unexpected.append({"module": "motors", "detail": {
            "priceMismatches": m["priceMismatches"],
            "staleInLive": m["staleInLive"]["codes"]}})
    modules["motors (Yamaha rows)"] = {
        "checked": m["matchedByCode"],
        "matched": m["matchedClean"],
        "liveRows": m["liveRows"],
        "intentionalDeltas": {
            "plannedSkipsNotInLive": {
                "count": m["missingInLive"]["count"],
                "breakdown": "39 Jeanneau boat-package powerplants + 32 EPROPULSION "
                             "electric outboards — both skip groups present verbatim "
                             "in the approved mtf-import-dryrun.json plan (71 skips)",
            },
        },
        "unexpectedDeltas": motors_unexpected,
    }

    # ---------------- TRAILERS ----------------
    t = mtf["trailers"]
    dup_names = {"MACKAY MLJ Series Trailer - MLJ6000T-14-HB",
                 "MACKAY PU Series Trailer - PU5000-14-M"}
    dup_mismatches = [x for x in t["mismatches"] if x["name"] in dup_names]
    real_mismatches = [x for x in t["mismatches"] if x["name"] not in dup_names]
    trailers_unexpected = len(real_mismatches) + t["missingInLive"]["count"]
    if trailers_unexpected:
        unexpected.append({"module": "trailers", "detail": {
            "mismatches": real_mismatches,
            "missingInLive": t["missingInLive"]["trailers"]}})
    modules["trailers"] = {
        "checked": t["matchedByName"],
        "matched": t["matchedClean"],
        "intentionalDeltas": {
            "duplicateSourceNameCollision": {
                "rows": len(dup_mismatches), "names": sorted(dup_names),
                "note": "MPF source has 2 distinct trailers per name; upsert-by-name "
                        "collapses each pair onto one live doc, so the other source "
                        "row diffs — recorded in trailers.json duplicatedNames",
            },
            "staleInLiveKept": {
                "count": t["staleInLive"]["count"],
                "note": "live trailers absent from MPF current sheet (incl. the "
                        "obsolete-trailers vendor, untouched per decision D1)",
            },
        },
        "unexpectedDeltas": trailers_unexpected,
    }

    # ---------------- FACTORY OPTIONS ----------------
    f = mtf["factoryOptions"]["totals"]
    fo_unexpected = f["priceMismatch"]
    if fo_unexpected:
        unexpected.append({"module": "factoryOptions",
                           "detail": {"priceMismatch": f["priceMismatch"]}})
    modules["factoryOptions (Highfield)"] = {
        "checked": f["liveOptions"],
        "matched": f["priceMatch"],
        "intentionalDeltas": {
            "preservedLegacyOptions": {
                "count": f["missingInMpf"],
                "note": "27 live codes absent from the MPF Highfield catalog "
                        "(No Seat / Bollard per-model options) — deliberately "
                        "preserved, never repriced",
            },
            "mpfCatalogOptionsUnreferenced": mtf["factoryOptions"][
                "mpfOptionsNotReferencedByAnyLiveModel"],
        },
        "unexpectedDeltas": fo_unexpected,
    }

    # ---------------- PARTS (5 collections) ----------------
    parts_map = {
        "dealerFitSelections": {"intentionalLiveOnly": 0,
                                "note": "9 df-* seed placeholders no longer exist (hard-deleted "
                                        "pre-apply by another actor; verified 404 in Phase 5)"},
        "fitUpItems": {"intentionalLiveOnly": 12,
                       "note": "12 pre-existing v1.10 fit-up items kept (upsert never deletes)"},
        "serviceParts": {"intentionalLiveOnly": 33,
                         "note": "6 pre-existing serviceParts + 27 MPF Oils&Lubes consumables "
                                 "written by the service-config wave (different natural key set)"},
        "riggingKits": {"intentionalLiveOnly": 0,
                        "note": "128 quarantined NLA/#N/A rows correctly excluded from import"},
        "suppliers": {"intentionalLiveOnly": 0, "note": ""},
    }
    for coll, meta in parts_map.items():
        p = parts[coll]
        unexpected_live_only = p["liveOnly"] - meta["intentionalLiveOnly"]
        coll_unexpected = p["missingInLive"] + max(0, unexpected_live_only)
        if coll_unexpected:
            unexpected.append({"module": f"parts.{coll}", "detail": {
                "missingInLive": p["missingInLive"],
                "liveOnlyBeyondIntentional": unexpected_live_only,
                "liveOnlyIds": p.get("liveOnlyIds", [])[:20]}})
        modules[f"parts.{coll}"] = {
            "checked": p["extracted"], "matched": p["matched"],
            "live": p["live"],
            "intentionalDeltas": {"liveOnlyKept": meta["intentionalLiveOnly"],
                                  "note": meta["note"]},
            "unexpectedDeltas": coll_unexpected,
        }

    # ---------------- SERVICE / CONFIG ----------------
    so = svc["serviceOperations"]
    so_unexpected = len(so["rateDrift"]) + so["inMpfNotLive"]
    if so_unexpected:
        unexpected.append({"module": "serviceOperations", "detail": {
            "rateDrift": so["rateDrift"], "inMpfNotLive": so["inMpfNotLiveSample"]}})
    modules["serviceOperations"] = {
        "checked": so["extractedUniqueKeys"], "matched": so["matchedByCode"],
        "live": so["liveCount"],
        "intentionalDeltas": {
            "legacyOpsKept": so["inLiveNotMpf"],
            "note": "live 369 = 364 MPF ops (285 unique keys + dedupe-suffix "
                    "doc ids) + 5 legacy ops preserved",
        },
        "unexpectedDeltas": so_unexpected,
    }
    fx_rows = svc["exchangeRates"]["comparison"]
    fx_bad = [r for r in fx_rows if not r["liveDoc"] or (r["delta"] not in (None, 0))]
    if fx_bad:
        unexpected.append({"module": "exchangeRates", "detail": fx_bad})
    modules["exchangeRates"] = {"checked": len(fx_rows),
                                "matched": len(fx_rows) - len(fx_bad),
                                "intentionalDeltas": {}, "unexpectedDeltas": len(fx_bad)}
    pm_live = svc["pricingMatrix"]["liveCount"]
    pm_ok = pm_live == 48  # 47 franchise rows + retail-sliding-scale
    if not pm_ok:
        unexpected.append({"module": "pricingMatrix", "detail": {"liveCount": pm_live}})
    modules["pricingMatrix"] = {"checked": 48, "matched": pm_live if pm_ok else 0,
                                "intentionalDeltas": {}, "unexpectedDeltas": 0 if pm_ok else 1}
    modules["engineServiceSchedules"] = {
        "checked": 189, "matched": svc["engineServiceSchedules"]["liveCount"],
        "intentionalDeltas": {},
        "unexpectedDeltas": 0 if svc["engineServiceSchedules"]["liveCount"] == 189 else 1}
    modules["freightConfig"] = {
        "checked": 2, "matched": svc["freightConfig"]["liveCount"],
        "intentionalDeltas": {},
        "unexpectedDeltas": 0 if svc["freightConfig"]["liveCount"] == 2 else 1}
    rego_types = svc["regoCatalog"]["byVendor"]["qld-transport"]["types"]
    mpf_bands = [t for t in rego_types if t["_id"].startswith("mpf-")]
    rego_ok = len(mpf_bands) == 19
    if not rego_ok:
        unexpected.append({"module": "regoCatalog",
                           "detail": {"mpfBandsLive": len(mpf_bands), "expected": 19}})
    modules["regoCatalog (QLD)"] = {
        "checked": 19, "matched": len(mpf_bands),
        "intentionalDeltas": {
            "seededIndicativeTypesKept": len(rego_types) - len(mpf_bands),
            "note": "pre-MPF seeded indicative regoTypes left in place for review "
                    "per import policy (flag, don't delete)"},
        "unexpectedDeltas": 0 if rego_ok else 1}

    # ---------------- df-* placeholder fix verification (GET only) ----------------
    placeholder_state = {}
    for pid in DF_PLACEHOLDER_IDS:
        d = _fs.get_doc(f"organisations/{ORG}/dealerFitSelections/{pid}")
        placeholder_state[pid] = ("404-not-found" if d is None else
                                  {"superseded": d.get("superseded"),
                                   "seedPlaceholder": d.get("seedPlaceholder")})
    all_gone = all(v == "404-not-found" for v in placeholder_state.values())
    resurrected = [k for k, v in placeholder_state.items()
                   if isinstance(v, dict) and v.get("superseded") is not True]
    if resurrected:
        unexpected.append({"module": "dealerFit.placeholders",
                           "detail": {"activeUnsuperseded": resurrected}})

    # ---------------- smoke section I/J results (if present) ----------------
    smoke = {}
    smoke_path = os.path.join(ROOT, "test-results", "smoke-data.json")
    if os.path.exists(smoke_path):
        sd = json.load(open(smoke_path))
        for sec in ("I. MPF parity", "J. Assignment web"):
            cs = [c for c in sd["checks"] if c["section"] == sec]
            smoke[sec] = {"total": len(cs), "passed": sum(1 for c in cs if c["ok"]),
                          "failed": [{"name": c["name"], "detail": c["detail"]}
                                     for c in cs if not c["ok"]][:60]}
        smoke["batteryTotal"] = {"total": sd["total"], "passed": sd["passed"],
                                 "failed": sd["failed"]}
        smoke["matchRates"] = {
            c["name"]: c["detail"] for c in sd["checks"]
            if c["section"] == "J. Assignment web" and c["name"].endswith("match rate")}

    out = {
        "generatedUtc": datetime.now(timezone.utc).isoformat(),
        "phase": "mpf-phase5-parity",
        "mode": "READ-ONLY (no Firestore writes)",
        "diffInputs": {
            "boats-diff.json": boats["summary"]["generatedAt"],
            "parts-diff.json": parts["generatedAt"],
            "mtf-diff.json": mtf["generatedAt"],
            "service-config-diff.json": json.load(
                open(os.path.join(EXT, "service-config-diff.json")))["generatedUtc"],
        },
        "modules": modules,
        "unexpectedDeltas": unexpected,
        "verdict": "PARITY PROVEN — zero unexpected deltas" if not unexpected
                   else f"PARITY FAILED — {len(unexpected)} unexpected delta group(s)",
        "placeholderFix": {
            "sanctioned": "patch 9 df-* docs with seedPlaceholder/superseded if still active",
            "found": placeholder_state,
            "action": ("NO WRITE — all 9 docs hard-deleted (404) by another actor between the "
                       "06:54Z phase-2 diff and the 09:27Z phase-4 parts apply; PATCH would "
                       "CREATE new shell docs, exceeding the sanctioned soft-mark intent. "
                       "Deletion already achieves the goal (placeholders inactive). "
                       "Verification logged to tasks/mpf-audit/apply-log-parts.jsonl "
                       "(9 soft-replace-check entries)." if all_gone else
                       "see activeUnsuperseded in unexpectedDeltas"),
        },
        "smoke": smoke,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as fh:
        json.dump(out, fh, indent=1)
    print(f"wrote {os.path.relpath(OUT, ROOT)}")
    print(out["verdict"])
    for u in unexpected:
        print("  UNEXPECTED:", json.dumps(u)[:300])


if __name__ == "__main__":
    main()

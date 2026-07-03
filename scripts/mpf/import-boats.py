#!/usr/bin/env python3
"""Phase 2/4 (boats) — idempotent upsert-by-modelCode importer, MPF -> HelmLogic Firestore.

DEFAULT IS DRY-RUN (no writes). Pass --apply to actually write.

Rules honoured:
  - Upsert by natural key (modelCode / SKU). NEVER clear-and-replace (CLAUDE.md lesson).
  - Field-level PATCH with updateMask — untouched fields on existing docs survive.
  - Highfield boats land on the EXISTING vendor/range/model/variant paths
    (vendor LafOLpLb6QIFE856TiD4; variant doc id == SKU, e.g. HBC066).
  - D2: NSM inc-GST cash price is authoritative -> sellPriceExclGst = cash / 1.1 (2dp),
    priceIncGst stores the hand-rounded inc-GST figure verbatim.
  - Variant cost = MPF Landed Hull Cost (AUD); full chain kept in landedCostChain.
  - D4: 8 non-Highfield brands get NEW vendor docs (deterministic id = lowercase slug,
    vendorType 'Boat Brand'), one 'All Models' range, one model + one variant per boat.
  - Every write logs a before/after JSON line to tasks/mpf-audit/apply-log-boats.jsonl
    (dry-run plans go to apply-log-boats.dryrun.jsonl instead).
"""
import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
BOATS = ROOT / "tasks" / "mpf-audit" / "extracted" / "boats.json"
APPLY_LOG = ROOT / "tasks" / "mpf-audit" / "apply-log-boats.jsonl"
DRYRUN_LOG = ROOT / "tasks" / "mpf-audit" / "apply-log-boats.dryrun.jsonl"

PROJECT = "studio-2290360004-3b963"
API_KEY = "AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY"
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
EMAIL, PASSWORD = "billh@nsmarine.com.au", "Bill2026!"

HF_VENDOR = "LafOLpLb6QIFE856TiD4"
HF_RANGE_IDS = {
    "Classic": "qo7IePnRzJxjrYyLWhTn",
    "Roll-Up": "EqcKQ51svI1I2Q5poFdl",
    "Ultra-Light": "QsGZuVwutEr5yyMkp97j",
    "Sport": "nQ2LE50z9Tbf2uss0Ote",
    "Adventure": "sEzdrM2fZsrOKA3ACrJp",
    "Patrol": "vfXxDuMpChteKncb7LnG",
    "Coaster": "coaster",
}
NEW_BRAND_SLUGS = {
    "Stacer": "stacer",
    "Stabicraft": "stabicraft",
    "Surtees": "surtees",
    "Jeanneau": "jeanneau",
    "Merry Fisher": "merry-fisher",
    "Cap Camarat": "cap-camarat",
    "Haines Signature": "haines-signature",
    "Formosa": "formosa",
}


def slugify(s):
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", s.lower())).strip("-")


def sign_in():
    r = requests.post(
        f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}",
        json={"email": EMAIL, "password": PASSWORD, "returnSecureToken": True}, timeout=30)
    r.raise_for_status()
    return r.json()["idToken"]


# ---------- Firestore value codecs ----------

def enc(v):
    if v is None:
        return {"nullValue": None}
    if isinstance(v, bool):
        return {"booleanValue": v}
    if isinstance(v, int):
        return {"integerValue": str(v)}
    if isinstance(v, float):
        return {"doubleValue": v}
    if isinstance(v, str):
        return {"stringValue": v}
    if isinstance(v, list):
        return {"arrayValue": {"values": [enc(x) for x in v]}}
    if isinstance(v, dict):
        return {"mapValue": {"fields": {k: enc(x) for k, x in v.items()}}}
    raise TypeError(f"unencodable: {type(v)}")


def dec(v):
    for t in ("stringValue", "booleanValue", "doubleValue"):
        if t in v:
            return v[t]
    if "integerValue" in v:
        return int(v["integerValue"])
    if "arrayValue" in v:
        return [dec(x) for x in v["arrayValue"].get("values", [])]
    if "mapValue" in v:
        return {k: dec(x) for k, x in v["mapValue"].get("fields", {}).items()}
    return None


def doc_fields(doc):
    return {k: dec(x) for k, x in doc.get("fields", {}).items()}


class Store:
    """Read (always) / write (only with --apply) wrapper with before/after logging."""

    def __init__(self, headers, apply_mode):
        self.h = headers
        self.apply = apply_mode
        self.log_path = APPLY_LOG if apply_mode else DRYRUN_LOG
        self.log_f = open(self.log_path, "a")
        self.ops = {"create": 0, "update": 0, "skip_unchanged": 0}

    def get(self, path):
        r = requests.get(f"{BASE}/{path}", headers=self.h, timeout=60)
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return doc_fields(r.json())

    def list_all(self, path):
        docs, token = [], None
        while True:
            url = f"{BASE}/{path}?pageSize=300" + (f"&pageToken={token}" if token else "")
            r = requests.get(url, headers=self.h, timeout=60)
            if r.status_code == 404:
                return []
            r.raise_for_status()
            j = r.json()
            docs += j.get("documents", [])
            token = j.get("nextPageToken")
            if not token:
                return docs

    def upsert(self, path, fields, before=None):
        """PATCH only the given fields (updateMask) — creates the doc if missing."""
        if before is None:
            before = self.get(path)
        # skip when every intended field already holds the intended value
        if before is not None and all(before.get(k) == v for k, v in fields.items()):
            self.ops["skip_unchanged"] += 1
            return "skip_unchanged"
        op = "update" if before is not None else "create"
        entry = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "action": "phase4.boats.write" if self.apply else "phase2.boats.dryrun",
            "op": op, "path": path, "dryRun": not self.apply,
            "fields": sorted(fields.keys()),
            "before": {k: before.get(k) for k in fields} if before else None,
            "after": fields,
        }
        if self.apply:
            mask = "&".join(f"updateMask.fieldPaths={requests.utils.quote(k)}" for k in fields)
            r = requests.patch(f"{BASE}/{path}?{mask}", headers=self.h,
                               json={"fields": {k: enc(v) for k, v in fields.items()}},
                               timeout=60)
            r.raise_for_status()
        self.log_f.write(json.dumps(entry, default=str) + "\n")
        self.ops[op] += 1
        return op


# ---------- payload builders ----------

def variant_payload(b, extracted_at, src):
    sl = b["sellLadder"]
    cash_inc = sl["cashIncGst"]
    payload = {
        "sku": b["modelCode"],
        "cost": b["landedCostChain"]["landedAUD"],
        "priceIncGst": cash_inc,
        "priceLadder": {
            "trade": {"incGst": sl["tradeIncGst"], "exGst": sl["tradeExGst"]},
            "subDealer": {"incGst": sl["subDealerIncGst"], "exGst": sl["subDealerExGst"]},
            "subExclusive": {"incGst": sl["subExclusiveIncGst"], "exGst": sl["subExclusiveExGst"]},
            "ausSailing": {"incGst": sl["ausSailingIncGst"], "exGst": sl["ausSailingExGst"]},
            "warranty": {"incGst": sl["warrantyIncGst"], "exGst": sl["warrantyExGst"]},
        },
        "landedCostChain": b["landedCostChain"],
        "motorMenu": b["motorMenu"],
        "trailerMenu": b["trailerMenu"],
        "dealerFitLines": b["dealerFitLines"],
        "pdChecklists": b["pdChecklists"],
        "mpfSource": {"file": src, "row": b["sourceRow"], "extractedAt": extracted_at,
                      "formulaDeviation": sl["formulaDeviation"],
                      "formulaDeviationFlag": sl["formulaDeviationFlag"]},
    }
    if cash_inc is not None:
        payload["sellPriceExclGst"] = sl["cashExGst"]  # D2: derived from authoritative inc-GST
    return payload


def model_payload(b, extracted_at, src):
    return {
        "name": (b.get("highfield") or {}).get("model") or b["name"],
        "modelCode": (b.get("highfield") or {}).get("model") or b["modelCode"],
        "specs": b["specs"],
        "imageUrl": b["imageLink"],
        "standardInclusions": b["standardInclusions"],
        "factoryOptionCodes": b["factoryOptionCodes"],
        "motorEnvelope": b["motorEnvelope"],
        "depositSchedule": b["depositSchedule"],
        "leadTimesDays": b["leadTimesDays"],
        "registration": b["registration"],
        "safety": b["safety"],
        "mpfSource": {"file": src, "row": b["sourceRow"], "extractedAt": extracted_at},
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true",
                    help="actually write to Firestore (default: dry-run)")
    args = ap.parse_args()

    data = json.loads(BOATS.read_text())
    boats = data["boats"]
    extracted_at = data["meta"]["extractedAt"]
    src = data["meta"]["source"]

    store = Store({"Authorization": f"Bearer {sign_in()}"}, args.apply)
    mode = "APPLY" if args.apply else "DRY-RUN"
    print(f"=== import-boats {mode} — {len(boats)} extracted boats ===")

    warnings = []
    summary = {"mode": mode, "highfield": {}, "newVendors": {}}

    # ================= Highfield =================
    hf_boats = [b for b in boats if b["brand"] == "Highfield Inflatables"]
    # index live models per range + variants per model (one listing pass)
    live_model_ids = {}   # (rangeId, normalizedModelCode) -> modelId
    live_variant_paths = {}  # sku -> full variant path
    for rname, rid in HF_RANGE_IDS.items():
        for md in store.list_all(f"data-warehouse/{HF_VENDOR}/ranges/{rid}/models"):
            mid = md["name"].split("/")[-1]
            mf = doc_fields(md)
            mcode = str(mf.get("modelCode") or mf.get("name") or mid)
            live_model_ids[(rid, mcode.replace(" ", "").upper())] = mid
            for vd in store.list_all(
                    f"data-warehouse/{HF_VENDOR}/ranges/{rid}/models/{mid}/variants"):
                vid = vd["name"].split("/")[-1]
                live_variant_paths.setdefault(
                    vid,
                    (f"data-warehouse/{HF_VENDOR}/ranges/{rid}/models/{mid}/variants/{vid}",
                     doc_fields(vd)))

    hf_stats = {"variantUpdates": 0, "variantCreates": 0, "modelCreates": 0,
                "skipUnchanged": 0, "skippedNoRange": 0}
    for b in hf_boats:
        hf = b["highfield"]
        rng = hf.get("range")
        model = hf.get("model")
        if not rng or rng not in HF_RANGE_IDS or not model:
            warnings.append(f"Highfield {b['modelCode']}: unresolvable range/model "
                            f"({rng}/{model}) — skipped")
            hf_stats["skippedNoRange"] += 1
            continue
        rid = HF_RANGE_IDS[rng]
        sku = b["modelCode"]
        if "#" in sku:
            warnings.append(f"Highfield SKU '{sku}' ({b['name']}) is a junk placeholder code "
                            f"in the MPF — skipped (report to NSM)")
            hf_stats["skippedNoRange"] += 1
            continue

        mkey = (rid, model.replace(" ", "").upper())
        mid = live_model_ids.get(mkey)
        if mid is None:
            # model missing in HL — create it once (deterministic slug id), then the variant
            mid = slugify(model)
            op = store.upsert(f"data-warehouse/{HF_VENDOR}/ranges/{rid}/models/{mid}",
                              model_payload(b, extracted_at, src))
            if op == "create":
                hf_stats["modelCreates"] += 1
            live_model_ids[mkey] = mid

        vpath, vbefore = live_variant_paths.get(sku, (
            f"data-warehouse/{HF_VENDOR}/ranges/{rid}/models/{mid}/variants/{sku}", None))
        payload = variant_payload(b, extracted_at, src)
        if vbefore is None:
            payload.update({
                "name": b["name"], "material": hf.get("material"),
                "colorCode": hf.get("colorCode"),
            })
        op = store.upsert(vpath, payload, before=vbefore)
        if op == "create":
            hf_stats["variantCreates"] += 1
        elif op == "update":
            hf_stats["variantUpdates"] += 1
        else:
            hf_stats["skipUnchanged"] += 1
    summary["highfield"] = hf_stats

    # ================= New brand vendors (D4) =================
    for brand, slug in NEW_BRAND_SLUGS.items():
        bb = [b for b in boats if b["brand"] == brand]
        if not bb:
            continue
        currencies = [b["landedCostChain"]["currency"] for b in bb]
        currency = max(set(currencies), key=currencies.count)
        stats = {"vendorCreate": 0, "rangeCreate": 0, "modelCreates": 0,
                 "variantCreates": 0, "modelUpdates": 0, "variantUpdates": 0,
                 "skipUnchanged": 0}

        vpath = f"data-warehouse/{slug}"
        op = store.upsert(vpath, {
            "name": brand, "slug": slug, "vendorType": "Boat Brand",
            "currency": currency,
            "mpfSource": {"file": src, "extractedAt": extracted_at},
        })
        stats["vendorCreate"] += 1 if op == "create" else 0

        rpath = f"{vpath}/ranges/all"
        op = store.upsert(rpath, {"name": "All Models",
                                  "mpfSource": {"file": src, "extractedAt": extracted_at}})
        stats["rangeCreate"] += 1 if op == "create" else 0

        seen_codes = set()
        for b in bb:
            code = b["modelCode"]
            if code in seen_codes:
                warnings.append(f"{brand}: duplicate current modelCode '{code}' "
                                f"(row {b['sourceRow']}) — second row skipped")
                continue
            seen_codes.add(code)
            mid = slugify(code)
            mpath = f"{rpath}/models/{mid}"
            mp = model_payload(b, extracted_at, src)
            mp["name"] = b["name"]
            mp["modelCode"] = code
            op = store.upsert(mpath, mp)
            if op == "create":
                stats["modelCreates"] += 1
            elif op == "update":
                stats["modelUpdates"] += 1
            else:
                stats["skipUnchanged"] += 1

            vp = variant_payload(b, extracted_at, src)
            vp["name"] = b["name"]
            op = store.upsert(f"{mpath}/variants/{mid}", vp)
            if op == "create":
                stats["variantCreates"] += 1
            elif op == "update":
                stats["variantUpdates"] += 1
            else:
                stats["skipUnchanged"] += 1
        summary["newVendors"][brand] = stats

    store.log_f.close()
    summary["opsTotal"] = store.ops
    summary["warnings"] = warnings
    print(json.dumps(summary, indent=2))
    print(f"\nplan/write log: {store.log_path}")
    if not args.apply:
        print("DRY-RUN complete — nothing was written. Re-run with --apply to execute.")


if __name__ == "__main__":
    main()

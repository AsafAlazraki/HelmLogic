#!/usr/bin/env python3
"""MPF Phase 2/4 — idempotent upsert of Service/Pricing/Rego/FX/Freight config.

DEFAULT: DRY-RUN (no writes). Pass --apply to write.
Every apply writes a before/after entry to tasks/mpf-audit/apply-log-service.jsonl.

Targets (org AcFZVEFA5UDJG2hyetWT unless --org=):
  organisations/{org}/serviceOperations/{opKeySlug}       upsert by opCode (dedupe-suffixed for shared codes)
  organisations/{org}/serviceParts/{partNumberSlug}       upsert by partNumber (Oils & Lubes consumables)
  organisations/{org}/engineServiceSchedules/{modelSlug}  NEW collection, one doc per engine model
  organisations/{org}/pricingMatrix/{franchiseSlug}       NEW collection, one doc per Price Matrix row
  organisations/{org}/pricingMatrix/retail-sliding-scale  the band-margin scale doc
  organisations/{org}/exchangeRates/{USD,NZD,EUR,AUD}     rate field (divisor convention, matches live)
  data-warehouse/qld-transport/regoTypes/{mpf-*}          MPF QLD bands (source-tagged doc IDs; seeded
                                                          indicative types left in place for review)
  organisations/{org}/freightConfig/{vendorKey}           NEW collection, per-vendor $/lm + buffer

Idempotency: doc IDs are deterministic slugs of the natural key; re-running
--apply patches the same docs. Unchanged docs are skipped (field-level compare).

NOTE: pricingMatrix / engineServiceSchedules / freightConfig have no
firestore.rules match yet — a rules deploy must precede --apply.
"""
import json, os, re, sys, datetime, requests

PROJECT = "studio-2290360004-3b963"
API_KEY = "AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY"
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
EXT = "tasks/mpf-audit/extracted"
LOG = "tasks/mpf-audit/apply-log-service.jsonl"
APPLY = "--apply" in sys.argv
ORG = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--org=")), "AcFZVEFA5UDJG2hyetWT")
REGO_VENDOR = "qld-transport"
NOW = datetime.datetime.now(datetime.timezone.utc).isoformat()
SOURCE_TAG = "mpf-2026-07"   # provenance stamp on every imported doc

tok = requests.post(
    f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}",
    json={"email": "billh@nsmarine.com.au", "password": "Bill2026!", "returnSecureToken": True},
    timeout=20).json()
if "idToken" not in tok:
    raise SystemExit(f"auth failed: {tok.get('error', {}).get('message')}")
H = {"Authorization": f"Bearer {tok['idToken']}", "Content-Type": "application/json"}


def slug(s):
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9.]+", "-", str(s).lower())).strip("-")


def to_fs(v):
    if isinstance(v, bool): return {"booleanValue": v}
    if isinstance(v, int): return {"integerValue": str(v)}
    if isinstance(v, float): return {"doubleValue": v}
    if isinstance(v, str): return {"stringValue": v}
    if isinstance(v, list): return {"arrayValue": {"values": [to_fs(x) for x in v]}}
    if isinstance(v, dict): return {"mapValue": {"fields": {k: to_fs(x) for k, x in v.items()}}}
    if v is None: return {"nullValue": None}
    raise ValueError(f"unsupported {type(v)}")


def from_fs(f):
    for k, v in f.items():
        if k == "integerValue": return int(v)
        if k == "arrayValue": return [from_fs(x) for x in v.get("values", [])]
        if k == "mapValue": return {kk: from_fs(vv) for kk, vv in v.get("fields", {}).items()}
        if k == "nullValue": return None
        return v
    return None


def get_doc(path):
    r = requests.get(f"{BASE}/{path}", headers=H, timeout=25)
    if r.status_code == 200:
        return {k: from_fs(v) for k, v in r.json().get("fields", {}).items()}
    return None


def log_entry(entry):
    with open(LOG, "a") as f:
        f.write(json.dumps(entry) + "\n")


stats = {"created": 0, "updated": 0, "unchanged": 0, "failed": 0, "dryPlanned": 0}


def changed_fields(before, data):
    if before is None:
        return None  # create
    diffs = {}
    for k, v in data.items():
        if k in ("importedAt",):
            continue
        b = before.get(k)
        if isinstance(v, float) and isinstance(b, (int, float)):
            if abs(float(b) - v) > 1e-6:
                diffs[k] = {"before": b, "after": v}
        elif b != v:
            diffs[k] = {"before": b, "after": v}
    return diffs


def upsert(path, data, kind):
    data = {**data, "importSource": SOURCE_TAG, "importedAt": NOW}
    before = get_doc(path)
    diffs = changed_fields(before, data)
    if before is not None and diffs == {}:
        stats["unchanged"] += 1
        return "unchanged"
    action = "create" if before is None else "update"
    if not APPLY:
        stats["dryPlanned"] += 1
        return f"DRY-{action}" + (f" ({len(diffs)} fields)" if diffs else "")
    body = {"fields": {k: to_fs(v) for k, v in data.items()}}
    r = requests.patch(f"{BASE}/{path}", headers=H, json=body, timeout=30)
    ok = r.status_code == 200
    log_entry({"ts": datetime.datetime.now(datetime.timezone.utc).isoformat(),
               "action": "phase2.service.apply", "kind": kind, "path": path,
               "op": action, "status": r.status_code,
               "before": before, "after": data if ok else None,
               "error": None if ok else " ".join(r.text.split())[:200]})
    if ok:
        stats["created" if action == "create" else "updated"] += 1
    else:
        stats["failed"] += 1
    return f"{action} {'ok' if ok else 'FAILED ' + str(r.status_code)}"


def load(name):
    return json.load(open(f"{EXT}/{name}"))


print(f"=== {'APPLY' if APPLY else 'DRY-RUN'} | org={ORG} | source tag {SOURCE_TAG} ===\n")
plan = []

# ── 1. serviceOperations ──────────────────────────────────────────
ops = load("service-operations.json")["operations"]
seen = {}
for o in ops:
    key = o["opCode"] or o["syntheticKey"]
    seen[key] = seen.get(key, 0) + 1
    doc_id = slug(key) + (f"-{seen[key]}" if seen[key] > 1 else "")
    sell_ex = o["sellExGst"]
    data = {
        "code": key,
        "name": o["description"],
        "flatRateHours": o["labourHrs"] or 0.0,
        # HelmLogic serviceOperations convention: hourlyRate ex GST (MPF retail 159 inc -> 144.55 ex)
        "hourlyRate": 144.55,
        "cost": o["totalCtd"],
        "sellPrice": sell_ex,          # ex GST, per HelmLogic sellPriceExclGst convention
        "notes": " | ".join(x for x in [
            f"MPF section: {o['section']}" if o["section"] else None,
            "uncoded in MPF source (synthetic key)" if o["uncoded"] else None,
            f"shared op code, instance {o['opCodeDedupeIndex']}" if o["opCodeDedupeIndex"] > 1 else None,
            f"sell inc GST {o['sellIncGst']}" if o["sellIncGst"] is not None else None,
        ] if x) or None,
        "category": o["section"],
        "procedure": o["procedure"],
        "mpfSourceRow": o["sourceRow"],
    }
    plan.append((f"organisations/{ORG}/serviceOperations/{doc_id}", data, "serviceOperation"))

# ── 2. serviceParts (consumables) ─────────────────────────────────
for p in load("service-consumables.json")["parts"]:
    doc_id = slug(p["partNumber"])
    data = {
        "partNumber": p["partNumber"], "name": p["name"],
        "cost": p["cost"] if p["cost"] is not None else 0.0,
        "sellPrice": p["sellPrice"], "stockLevel": None,
        "notes": p["notes"], "unit": p["unit"],
        "isBandedCode": p["isBandedCode"], "hpBand": p["hpBand"],
        "mpfSourceRow": p["sourceRow"],
    }
    plan.append((f"organisations/{ORG}/serviceParts/{doc_id}", data, "servicePart"))

# ── 3. engineServiceSchedules (NEW) ───────────────────────────────
for e in load("engine-service-schedules.json")["engines"]:
    doc_id = slug(e["engineModel"])
    data = {
        "engineModel": e["engineModel"], "familyCode": e["familyCode"],
        "cylinders": e["cylinders"], "yearModel": e["yearModel"],
        "intervals": e["intervals"], "fiveYearPlan": e["fiveYearPlan"],
        "gearOil": e["gearOil"], "engineOil": e["engineOil"],
        "sundries": e["sundries"], "partsBom": e["partsBom"],
        "legacyNoPricing": e["legacyNoPricing"], "mpfSourceRow": e["sourceRow"],
    }
    plan.append((f"organisations/{ORG}/engineServiceSchedules/{doc_id}", data, "engineServiceSchedule"))

# ── 4. pricingMatrix (NEW) ────────────────────────────────────────
pm = load("pricing-matrix.json")
fr_seen = {}
for fr in pm["franchises"]:
    base_id = slug(f"{fr['franchiseCode']}-{fr['brand']}")
    fr_seen[base_id] = fr_seen.get(base_id, 0) + 1
    doc_id = base_id + (f"-{fr_seen[base_id]}" if fr_seen[base_id] > 1 else "")
    data = {k: fr[k] for k in ("brand", "franchiseCode", "region", "buyCurrency", "reviewed",
                               "ctdLoad", "other", "subDealerDiscount", "tradeDiscount",
                               "sellMarkup", "factoryOptionsMarkup", "dealerFitMarkup",
                               "warrantyAllowance", "adminLoad", "isRrp", "notes")}
    data["discountConvention"] = "trade/subDealer are discounts OFF retail; negative = charged above base"
    plan.append((f"organisations/{ORG}/pricingMatrix/{doc_id}", data, "pricingMatrixRow"))
plan.append((f"organisations/{ORG}/pricingMatrix/retail-sliding-scale", {
    "kind": "retailSlidingScale",
    "bands": pm["retailSlidingScale"],
    "notes": "margin by retail price band for parts pricing (Price Matrix rows 62-69)",
}, "pricingMatrixScale"))

# ── 5. exchangeRates ──────────────────────────────────────────────
for r in load("exchange-rates.json")["rates"]:
    data = {"code": r["code"], "rate": r["rate"],
            "reviewDate": r["reviewDate"], "notes": r["notes"],
            "convention": "divisor: AUD = foreign / rate"}
    plan.append((f"organisations/{ORG}/exchangeRates/{r['code']}", data, "exchangeRate"))

# ── 6. rego catalog (found path: data-warehouse/{vendor}/regoTypes) ──
for it in load("rego-catalog.json")["items"]:
    doc_id = "mpf-" + slug((it["revCode"] or it["name"]))
    data = {
        "name": it["name"], "state": "QLD",
        "appliesTo": it["appliesTo"],
        "sellExclGst": it["sell"],           # rego fees are GST-free; field name follows existing regoTypes schema
        "ctd": it["ctd"], "revCode": it["revCode"],
        "group": it["group"], "concession": it["concession"],
        "isActive": True, "asAt": "2025-07-01",
        "description": f"MPF Registration Module ({it['group']}) — authoritative NSM price as at 1/7/25. GST-free; SELL = CTD rounded up.",
    }
    if "minLengthM" in it:
        data["minLengthM"], data["maxLengthM"] = it["minLengthM"], it["maxLengthM"]
    if "minWeightT" in it:
        data["minAtmKg"] = int(it["minWeightT"] * 1000)
        data["maxAtmKg"] = int(it["maxWeightT"] * 1000)
    plan.append((f"data-warehouse/{REGO_VENDOR}/regoTypes/{doc_id}", data, "regoType"))

# ── 7. freightConfig (NEW) ────────────────────────────────────────
for v in load("freight-config.json")["vendors"]:
    data = {
        "vendorKey": v["vendorKey"], "supplier": v["supplier"],
        "quoteDate": v["quoteDate"], "shipmentRef": v["shipmentRef"],
        "originNote": v["originNote"],
        "currency": v["seafreight"]["currency"], "exRate": v["seafreight"]["exRate"],
        "perLinearMetreAud": v["perLinearMetreAud"],
        "bufferPct": v["bufferPct"],
        "seafreightCtdAud": v["seafreightCtdAud"],
        "estimateTotalAud": v["estimateTotalAud"],
        "localChargesSubtotalAud": v["localChargesSubtotalAud"],
        "sampleContainerLinearMetres": v["sampleContainerLinearMetres"],
        "localCharges": v["localCharges"],
    }
    plan.append((f"organisations/{ORG}/freightConfig/{v['vendorKey']}", data, "freightConfig"))

# ── execute ───────────────────────────────────────────────────────
by_kind = {}
for path, data, kind in plan:
    result = upsert(path, data, kind)
    by_kind.setdefault(kind, {}).setdefault(result.split(" (")[0], 0)
    by_kind[kind][result.split(" (")[0]] += 1

print(f"{'kind':26} {'results'}")
for kind, res in by_kind.items():
    print(f"{kind:26} {res}")
print(f"\nTotals: {stats}")
if not APPLY:
    print("\nDRY-RUN — nothing written. Re-run with --apply after (1) diff review sign-off "
          "and (2) firestore.rules deploy for pricingMatrix / engineServiceSchedules / freightConfig.")

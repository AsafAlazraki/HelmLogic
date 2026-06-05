#!/usr/bin/env python3
"""
Pair up Highfield boats for end-to-end quoting.

For every Highfield model, ONLY where missing, adds:
  - a default colour variant (so colour selection works)
  - a motorConfigurations HP range (so Yamaha motors match)
  - a default trailerAssignment -> a real Dunbier trailer (so a trailer
    auto-loads on the quote)

Existing data is never overwritten (merge + missing-only). Default is
DRY-RUN (no writes). Pass --apply to write.

Auth: anonymous idToken (same path the repo's seed scripts use).
Usage: python3 scripts/pair-highfield-quote-data.py [--apply]
"""
import requests, sys

PROJECT = "studio-2290360004-3b963"
API_KEY = "AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY"
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
BOAT_VENDOR = "LafOLpLb6QIFE856TiD4"
APPLY = "--apply" in sys.argv

# Real Dunbier trailer to pair as the default (confirmed to exist).
PAIR_TRAILER = {
    "brandVendorId": "dunbier-trailers",
    "seriesId": "alloy-centre-line-series",
    "trailerId": "9047a",
    "code": "9047A",
    "name": "DUNBIER Alloy Centre Line - ACL 5M-13BH (1,450kg)",
}

tok = requests.post(
    f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={API_KEY}",
    json={"returnSecureToken": True}, timeout=15).json()["idToken"]
H = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def val(v):
    for k in ("stringValue", "booleanValue"):
        if k in v: return v[k]
    if "integerValue" in v: return int(v["integerValue"])
    if "doubleValue" in v: return v["doubleValue"]
    if "arrayValue" in v: return [val(x) for x in v["arrayValue"].get("values", [])]
    if "mapValue" in v: return {k: val(x) for k, x in v["mapValue"].get("fields", {}).items()}
    if "nullValue" in v: return None
    return v

def flds(d): return {k: val(x) for k, x in d.get("fields", {}).items()}

def to_fs(v):
    if isinstance(v, bool): return {"booleanValue": v}
    if isinstance(v, int): return {"integerValue": str(v)}
    if isinstance(v, float): return {"doubleValue": v}
    if isinstance(v, str): return {"stringValue": v}
    if isinstance(v, list): return {"arrayValue": {"values": [to_fs(x) for x in v]}}
    if isinstance(v, dict): return {"mapValue": {"fields": {k: to_fs(x) for k, x in v.items()}}}
    if v is None: return {"nullValue": None}
    raise ValueError(v)

def lst(p, n=300):
    r = requests.get(f"{BASE}/{p}?pageSize={n}", headers=H, timeout=25)
    return r.json().get("documents", []) if r.status_code == 200 else []

def patch(path, data, mask_fields):
    if not APPLY:
        return "DRY"
    mask = "&".join(f"updateMask.fieldPaths={m}" for m in mask_fields)
    url = f"{BASE}/{path}?{mask}"
    r = requests.patch(url, headers=H, json={"fields": {k: to_fs(v) for k, v in data.items()}}, timeout=25)
    return r.status_code

MOTOR_CFG = [{"type": "Single", "engines": [{"label": "Single Engine", "minHp": 40, "maxHp": 350, "recommendedHp": 150}]}]
TRAILER_ASSIGN = [{"isDefault": True, **PAIR_TRAILER}]

variants_add = motorcfg_add = trailer_add = 0
seen = 0
actions = []

for rg in lst(f"data-warehouse/{BOAT_VENDOR}/ranges"):
    rid = rg["name"].split("/")[-1]
    rname = flds(rg).get("name", rid)
    for md in lst(f"data-warehouse/{BOAT_VENDOR}/ranges/{rid}/models"):
        seen += 1
        mid = md["name"].split("/")[-1]
        mf = flds(md)
        code = mf.get("modelCode", mid)
        mpath = f"data-warehouse/{BOAT_VENDOR}/ranges/{rid}/models/{mid}"
        todo = []

        # variant
        variants = lst(f"{mpath}/variants", 2)
        if not variants:
            base = mf.get("sellPriceExclGst") or 30000
            vdata = {"sku": f"{code}-STD", "name": f"{mf.get('name', code)} - Standard",
                     "material": "PVC", "colorCode": "STD", "colorName": "Standard",
                     "cost": round(base * 0.7), "sellPriceExclGst": base,
                     "imageUrl": mf.get("coverImageUrl") or ""}
            r = patch(f"{mpath}/variants/demo-default-pvc", vdata, list(vdata.keys()))
            variants_add += 1; todo.append(f"variant({r})")

        # motor config
        spec = mf.get("specifications") or {}
        mcfg = spec.get("motorConfigurations") if isinstance(spec, dict) else None
        if not mcfg:
            r = patch(mpath, {"specifications": {"motorConfigurations": MOTOR_CFG}}, ["specifications.motorConfigurations"])
            motorcfg_add += 1; todo.append(f"motorcfg({r})")

        # trailer assignment
        if not mf.get("trailerAssignments"):
            r = patch(mpath, {"trailerAssignments": TRAILER_ASSIGN}, ["trailerAssignments"])
            trailer_add += 1; todo.append(f"trailer({r})")

        if todo:
            actions.append(f"  [{rname}] {code}: {', '.join(todo)}")

mode = "APPLIED" if APPLY else "DRY-RUN (no writes)"
print(f"=== {mode} ===")
print(f"Models seen: {seen}")
print(f"Variants to add:   {variants_add}")
print(f"Motor configs add: {motorcfg_add}")
print(f"Trailer assigns:   {trailer_add}")
print(f"Pairing trailer:   {PAIR_TRAILER['code']} — {PAIR_TRAILER['name']}\n")
print("First 25 model actions:")
print("\n".join(actions[:25]))
if not APPLY:
    print("\n(no changes written — re-run with --apply to commit)")

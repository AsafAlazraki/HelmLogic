#!/usr/bin/env python3
"""
Pair up Highfield boats for end-to-end quoting (size-matched, rigid only).

For every RIGID Highfield model (skips Roll-Up + Ultra-Light inflatables),
ONLY where missing, adds:
  - a default colour variant
  - a motorConfigurations HP range (so Yamaha motors match)
  - a SIZE-MATCHED Dunbier alloy trailerAssignment (boat length parsed
    from the model code -> smallest trailer >= that length)

Existing data is never overwritten. Default DRY-RUN; --apply to write.
Auth: anonymous idToken (same path the repo's seed scripts use).
"""
import requests, sys, re

PROJECT = "studio-2290360004-3b963"
API_KEY = "AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY"
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
BOAT_VENDOR = "LafOLpLb6QIFE856TiD4"
TRAILER_VENDOR = "dunbier-trailers"
APPLY = "--apply" in sys.argv

# Inflatable ranges that don't get trailers.
SKIP_TRAILER_RANGES = {"Roll-Up", "Ultra-Light", "Ultralite"}

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

def patch(path, data, mask):
    if not APPLY: return "DRY"
    url = f"{BASE}/{path}?" + "&".join(f"updateMask.fieldPaths={m}" for m in mask)
    return requests.patch(url, headers=H, json={"fields": {k: to_fs(v) for k, v in data.items()}}, timeout=25).status_code

def parse_size(code, name):
    for s in (str(code or ""), str(name or "")):
        m = re.search(r'(\d\.\d)', s) or re.search(r'\b(\d)M\b', s, re.I)
        if m: return float(m.group(1))
    return None

def boat_len(code):
    m = re.search(r'(\d{3})', str(code or ""))
    return int(m.group(1)) / 100 if m else None

# ── Build size-matched Dunbier alloy trailer candidates ─────────────
candidates = []
for s in lst(f"data-warehouse/{TRAILER_VENDOR}/series", 20):
    sid = s["name"].split("/")[-1]
    if "fibreglass" in sid:  # Highfield are alloy RIBs
        continue
    for t in lst(f"data-warehouse/{TRAILER_VENDOR}/series/{sid}/trailers", 50):
        tid = t["name"].split("/")[-1]; tf = flds(t)
        sz = parse_size(tf.get("code"), tf.get("name"))
        if sz is None: continue
        candidates.append({"seriesId": sid, "trailerId": tid, "code": tf.get("code", ""),
                           "name": tf.get("name", ""), "size": sz, "sell": tf.get("sellPriceExclGst", 0)})
candidates.sort(key=lambda c: (c["size"], c["sell"]))
print(f"Trailer candidates (alloy, sized): {len(candidates)}  [{candidates[0]['size']}m–{candidates[-1]['size']}m]\n")

def match_trailer(length):
    if length is None: length = 5.3
    fits = [c for c in candidates if c["size"] >= length - 0.05]
    return (min(fits, key=lambda c: (c["size"], c["sell"])) if fits
            else max(candidates, key=lambda c: c["size"]))

MOTOR_CFG = [{"type": "Single", "engines": [{"label": "Single Engine", "minHp": 40, "maxHp": 350, "recommendedHp": 150}]}]

variants_add = motorcfg_add = trailer_add = skipped_inflatable = 0
seen = 0; rows = []

for rg in lst(f"data-warehouse/{BOAT_VENDOR}/ranges"):
    rid = rg["name"].split("/")[-1]
    rname = flds(rg).get("name", rid)
    is_inflatable = rname in SKIP_TRAILER_RANGES
    for md in lst(f"data-warehouse/{BOAT_VENDOR}/ranges/{rid}/models"):
        seen += 1
        mid = md["name"].split("/")[-1]; mf = flds(md)
        code = mf.get("modelCode", mid)
        mpath = f"data-warehouse/{BOAT_VENDOR}/ranges/{rid}/models/{mid}"
        todo = []

        variants = lst(f"{mpath}/variants", 2)
        if not variants:
            base = mf.get("sellPriceExclGst") or 30000
            vdata = {"sku": f"{code}-STD", "name": f"{mf.get('name', code)} - Standard", "material": "PVC",
                     "colorCode": "STD", "colorName": "Standard", "cost": round(base * 0.7),
                     "sellPriceExclGst": base, "imageUrl": mf.get("coverImageUrl") or ""}
            patch(f"{mpath}/variants/demo-default-pvc", vdata, list(vdata.keys()))
            variants_add += 1; todo.append("variant")

        spec = mf.get("specifications") or {}
        if not (isinstance(spec, dict) and spec.get("motorConfigurations")):
            patch(mpath, {"specifications": {"motorConfigurations": MOTOR_CFG}}, ["specifications.motorConfigurations"])
            motorcfg_add += 1; todo.append("motorcfg")

        if not mf.get("trailerAssignments"):
            if is_inflatable:
                skipped_inflatable += 1
            else:
                L = boat_len(code)
                tr = match_trailer(L)
                assign = [{"isDefault": True, "brandVendorId": TRAILER_VENDOR, "seriesId": tr["seriesId"],
                           "trailerId": tr["trailerId"], "code": tr["code"], "name": tr["name"]}]
                patch(mpath, {"trailerAssignments": assign}, ["trailerAssignments"])
                trailer_add += 1
                todo.append(f"trailer[{L or '?'}m->{tr['size']}m {tr['code']} ${tr['sell']}]")

        if todo:
            rows.append(f"  [{rname}] {code}: {', '.join(todo)}")

print(f"=== {'APPLIED' if APPLY else 'DRY-RUN (no writes)'} ===")
print(f"Models: {seen} | variants+{variants_add} | motorcfg+{motorcfg_add} | trailers+{trailer_add} | inflatable-skipped {skipped_inflatable}\n")
for r in rows: print(r)
if not APPLY: print("\n(no writes — re-run with --apply)")

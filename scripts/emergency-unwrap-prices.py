#!/usr/bin/env python3
"""Emergency price-unwrap script (prod 2026-06-16 incident).

What happened: scripts/repair-console-seat-pairing.py's original val()
helper didn't handle doubleValue typed-values. When it read the
optionalFeatures array and rewrote it, every cost / sellPriceExclGst
field on every console feature on the 28 models it touched ended up
double-wrapped:

  before: cost: 1386
  after:  cost: { mapValue: { fields: { doubleValue: 1386 } } }

The UI rendered '$[object Object]' instead of '$1,386'.

Fix: walk every Highfield model, find any field on any optionalFeature
that's a single-key dict containing only 'doubleValue' or 'integerValue',
and unwrap it back to the primitive. Also recurses one level into nested
dicts (priceLevels etc.) for the same pattern.

Idempotent. Re-run safely.

Lessons captured in scripts/repair-console-seat-pairing.py's val()
docstring so this bug pattern is harder to repeat.
"""
import requests
PROJECT = "studio-2290360004-3b963"
API_KEY = "AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY"
VENDOR = "LafOLpLb6QIFE856TiD4"

tok = requests.post(
    f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={API_KEY}",
    json={"returnSecureToken": True}, timeout=15).json()["idToken"]
H = {"Authorization": f"Bearer {tok}"}
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"

def val(v):
    if "stringValue" in v: return v["stringValue"]
    if "integerValue" in v: return int(v["integerValue"])
    if "doubleValue" in v: return float(v["doubleValue"])
    if "booleanValue" in v: return v["booleanValue"]
    if "nullValue" in v: return None
    if "timestampValue" in v: return v["timestampValue"]
    if "arrayValue" in v: return [val(x) for x in v["arrayValue"].get("values", [])]
    if "mapValue" in v: return {k: val(x) for k, x in v["mapValue"].get("fields", {}).items()}
    return v

def encode(v):
    if isinstance(v, bool): return {"booleanValue": v}
    if isinstance(v, int): return {"integerValue": str(v)}
    if isinstance(v, float):
        if v == int(v): return {"integerValue": str(int(v))}
        return {"doubleValue": v}
    if v is None: return {"nullValue": None}
    if isinstance(v, str): return {"stringValue": v}
    if isinstance(v, list): return {"arrayValue": {"values": [encode(x) for x in v]}}
    if isinstance(v, dict): return {"mapValue": {"fields": {k: encode(x) for k, x in v.items()}}}
    return {"stringValue": str(v)}

def unwrap_if_typed(value):
    if isinstance(value, dict) and len(value) == 1:
        k = next(iter(value))
        if k in ("doubleValue", "integerValue"):
            inner = value[k]
            try: return float(inner) if k == "doubleValue" else int(inner)
            except (TypeError, ValueError): return value
    return value

ranges_resp = requests.get(f"{BASE}/data-warehouse/{VENDOR}/ranges", headers=H, timeout=20).json()
total_fixed_fields = 0
models_touched = 0

for rng in ranges_resp.get("documents", []):
    rid = rng["name"].rsplit("/", 1)[1]
    rname = rng.get("fields", {}).get("name", {}).get("stringValue", rid)

    models_resp = requests.get(f"{BASE}/data-warehouse/{VENDOR}/ranges/{rid}/models", headers=H, timeout=20).json()
    for doc in models_resp.get("documents", []):
        mid = doc["name"].rsplit("/", 1)[1]
        fields = doc.get("fields", {})
        code = fields.get("modelCode", {}).get("stringValue", mid)

        opt_field = fields.get("optionalFeatures")
        if not opt_field: continue
        optional = val(opt_field)
        if not isinstance(optional, list): continue

        fixed_here = 0
        for feat in optional:
            if not isinstance(feat, dict): continue
            for k in list(feat.keys()):
                original = feat[k]
                unwrapped = unwrap_if_typed(original)
                if unwrapped is not original:
                    feat[k] = unwrapped
                    fixed_here += 1
                if isinstance(feat[k], dict):
                    for kk in list(feat[k].keys()):
                        nested_original = feat[k][kk]
                        nested_unwrapped = unwrap_if_typed(nested_original)
                        if nested_unwrapped is not nested_original:
                            feat[k][kk] = nested_unwrapped
                            fixed_here += 1

        if fixed_here > 0:
            url = f"{BASE}/data-warehouse/{VENDOR}/ranges/{rid}/models/{mid}?updateMask.fieldPaths=optionalFeatures"
            rsp = requests.patch(url, json={"fields": {"optionalFeatures": encode(optional)}}, headers=H, timeout=20)
            if rsp.status_code != 200:
                print(f"!! FAIL {code}: {rsp.status_code} {rsp.text[:300]}")
            else:
                print(f"[{rname:>14s} / {code:>10s}]  {fixed_here} field(s) unwrapped")
                total_fixed_fields += fixed_here
                models_touched += 1

print(f"\n=== Done ===")
print(f"  Models touched:        {models_touched}")
print(f"  Fields unwrapped:      {total_fixed_fields}")

#!/usr/bin/env python3
"""Flip every v1.12 + v1.13 feature row in Firestore to status='shipped'.

Two stories stay 'planned' (NSM-Hub work blocked on the service-account):
  - 11.3.2 — Migration tooling (bulk + delta-sync)
  - 11.3.3 — Cutover + verification + decommission

Run after the v1.12+v1.13 dev → main PR merges. Idempotent; safe to re-run.
"""
import requests, sys

PROJECT = "studio-2290360004-3b963"
API_KEY = "AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY"

tok = requests.post(
    f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={API_KEY}",
    json={"returnSecureToken": True}, timeout=15).json()["idToken"]
H = {"Authorization": f"Bearer {tok}"}
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"

def val(v):
    if "stringValue" in v: return v["stringValue"]
    if "integerValue" in v: return int(v["integerValue"])
    if "booleanValue" in v: return v["booleanValue"]
    if "arrayValue" in v: return [val(x) for x in v["arrayValue"].get("values", [])]
    if "nullValue" in v: return None
    return v
def fields(doc): return {k: val(x) for k, x in doc.get("fields", {}).items()}

DEFER = {
    # NSM-Hub work — service account still pending
    "11.3.2": "v1.14",
    "11.3.3": "v1.14",
}

# Pull all features
url = f"{BASE}:runQuery"
body = {"structuredQuery": {"from": [{"collectionId": "features"}], "limit": 300}}
rows = requests.post(url, json=body, headers=H, timeout=30).json()

ship_ids = []
defer_ids = []
for row in rows:
    if "document" not in row: continue
    doc = row["document"]
    f = fields(doc)
    tr = f.get("targetRelease")
    title = f.get("title", "")
    fid = doc["name"].rsplit("/", 1)[1]
    if tr not in ("v1.12", "v1.13"): continue

    # Defer NSM-Hub work?
    deferred = False
    for code, dest in DEFER.items():
        if title.startswith(code + " ") or title.startswith(code + " —"):
            defer_ids.append((fid, title, tr, dest))
            deferred = True
            break
    if not deferred:
        ship_ids.append((fid, title, tr))

print(f"\n{'='*68}\nWill SHIP {len(ship_ids)} feature(s) to status='shipped':\n{'='*68}")
for fid, title, tr in ship_ids:
    print(f"  [{tr}] {title[:80]}")

print(f"\n{'='*68}\nWill DEFER {len(defer_ids)} feature(s) (NSM-Hub blocked):\n{'='*68}")
for fid, title, tr, dest in defer_ids:
    print(f"  [{tr} → {dest}] {title[:80]}")

if "--dry" in sys.argv:
    print("\nDry run — nothing written. Re-run without --dry to apply.")
    sys.exit(0)

print("\nApplying patches…")
ok = 0
fail = 0

def patch_doc(fid: str, fields_map: dict):
    global ok, fail
    url = f"{BASE}/features/{fid}"
    # Build updateMask query
    mask_keys = list(fields_map.keys())
    qs = "&".join(f"updateMask.fieldPaths={k}" for k in mask_keys)
    pf = {}
    for k, v in fields_map.items():
        if isinstance(v, str):
            pf[k] = {"stringValue": v}
        elif v is None:
            pf[k] = {"nullValue": None}
        elif isinstance(v, bool):
            pf[k] = {"booleanValue": v}
        elif isinstance(v, (int, float)):
            pf[k] = {"integerValue": str(int(v))} if isinstance(v, int) else {"doubleValue": v}
    r = requests.patch(f"{url}?{qs}", json={"fields": pf}, headers=H, timeout=20)
    if r.status_code == 200:
        ok += 1
        return True
    else:
        fail += 1
        print(f"  FAIL {fid}: {r.status_code} {r.text[:120]}")
        return False

for fid, title, tr in ship_ids:
    patch_doc(fid, {"status": "shipped"})

for fid, title, tr, dest in defer_ids:
    patch_doc(fid, {"targetRelease": dest})

print(f"\nDone: {ok} patched, {fail} failed")

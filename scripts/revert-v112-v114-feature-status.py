#!/usr/bin/env python3
"""Revert the v1.12 + v1.13 + v1.14 Firestore feature-status flips.

Undoes:
  - 8 features set to status='shipped' by ship-v112-v113-features.py
  - 2 features set to targetRelease='v1.14' by ship-v112-v113-features.py
    (these were originally targeted at v1.12 + v1.13)
  - 3 features set to status='shipped' by ship-v114-features.py
  - 4 features set to targetRelease='v1.15' by ship-v114-features.py
    (these were originally targeted at v1.14)

Run with --dry to preview.
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
    if "nullValue" in v: return None
    return v
def fields(doc): return {k: val(x) for k, x in doc.get("fields", {}).items()}

# Features that were SHIPPED in this push — revert status to 'planned'
SHIPPED_PREFIXES = {
    "v1.12": ("11.2.2 ", "11.2.3 ", "3.4.1 "),
    "v1.13": ("11.2.4 ", "3.7.4 ", "3.7.5 ", "3.8.1 ", "3.8.2 "),
    "v1.14": ("3.8.6 ", "3.8.8 ", "9.2.3 "),
}

# Features that were DEFERRED in this push — revert targetRelease back to their original window
REVERT_TARGETS = {
    # ship-v112-v113-features.py defaulted these from their original window to v1.14
    "11.3.2 ": "v1.12",
    "11.3.3 ": "v1.13",
    # ship-v114-features.py defaulted these from v1.14 to v1.15
    "3.7.6 ": "v1.14",
    "3.7.7 ": "v1.14",
    "3.9.1 ": "v1.14",
    "9.2.1 ": "v1.14",
}

url = f"{BASE}:runQuery"
body = {"structuredQuery": {"from": [{"collectionId": "features"}], "limit": 300}}
rows = requests.post(url, json=body, headers=H, timeout=30).json()

revert_status = []  # (fid, title, from_status, to_status)
revert_target  = []  # (fid, title, from_release, to_release)

for row in rows:
    if "document" not in row: continue
    doc = row["document"]
    f = fields(doc)
    fid = doc["name"].rsplit("/", 1)[1]
    title = f.get("title", "")
    cur_status = f.get("status")
    cur_target = f.get("targetRelease")

    # Check status revert
    for release, prefixes in SHIPPED_PREFIXES.items():
        if any(title.startswith(p) for p in prefixes) and cur_status == "shipped":
            revert_status.append((fid, title, cur_status, "planned"))
            break

    # Check target-release revert
    for prefix, original in REVERT_TARGETS.items():
        if title.startswith(prefix) and cur_target in ("v1.14", "v1.15"):
            revert_target.append((fid, title, cur_target, original))
            break

print(f"\n=== Status revert: {len(revert_status)} features back to 'planned' ===")
for fid, title, fs, ts in revert_status:
    print(f"  [{fs} → {ts}] {title[:80]}")

print(f"\n=== Target-release revert: {len(revert_target)} features ===")
for fid, title, fr, tr in revert_target:
    print(f"  [{fr} → {tr}] {title[:80]}")

if "--dry" in sys.argv:
    print("\nDry run — re-run without --dry to apply.")
    sys.exit(0)

def patch(fid, m):
    qs = "&".join(f"updateMask.fieldPaths={k}" for k in m.keys())
    pf = {k: {"stringValue": v} for k, v in m.items() if isinstance(v, str)}
    r = requests.patch(f"{BASE}/features/{fid}?{qs}", json={"fields": pf}, headers=H, timeout=20)
    return r.status_code == 200, r

ok, fail = 0, 0
for fid, _, _, _ in revert_status:
    s, r = patch(fid, {"status": "planned"})
    (ok := ok + 1) if s else (fail := fail + 1, print(f"  FAIL status {fid}: {r.status_code} {r.text[:120]}"))
for fid, _, _, dest in revert_target:
    s, r = patch(fid, {"targetRelease": dest})
    (ok := ok + 1) if s else (fail := fail + 1, print(f"  FAIL target {fid}: {r.status_code} {r.text[:120]}"))

print(f"\nDone: {ok} patched, {fail} failed")

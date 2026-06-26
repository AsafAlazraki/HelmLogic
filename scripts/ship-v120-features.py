#!/usr/bin/env python3
"""Flip the v1.20 Phase A stories to status='shipped' in Firestore.

Phase A — code-shipped:
  - 1.3.2 — Contract Signing Pack Generation
  - 1.4.4 — Quote Validity / Expiry
  - 2.3.1 — Quote Variations (editor + send pipeline; schema v1.19)
  - 2.4.1 — Convert Quote -> Contract
  - 2.4.2 — Deposit Recording (with receipt PDF)
  - 2.6.3 — Customer Agreement on Variation (public accept page; schema v1.19)

Retargets out of v1.20:
  - 8.2.1 — Reporting & Analytics Dashboard  -> v1.21
  - 5.2.1 — Brand & Dealer Isolation (RBAC)  -> v1.22

NSM-Hub trio carries to v1.21:
  - 11.3.1 / 11.3.2 / 11.3.3
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
    if "doubleValue" in v: return float(v["doubleValue"])
    if "booleanValue" in v: return v["booleanValue"]
    if "nullValue" in v: return None
    return v

SHIP_PREFIXES = ("1.3.2 ", "1.4.4 ", "2.3.1 ", "2.4.1 ", "2.4.2 ", "2.6.3 ")
DEFER_TO_V121 = ("8.2.1 ", "11.3.1 ", "11.3.2 ", "11.3.3 ")
DEFER_TO_V122 = ("5.2.1 ",)

rows = requests.post(
    f"{BASE}:runQuery",
    json={"structuredQuery": {"from": [{"collectionId": "features"}], "limit": 500}},
    headers=H, timeout=30,
).json()

ships, defers_121, defers_122, hold = [], [], [], []
for row in rows:
    if "document" not in row: continue
    doc = row["document"]
    f = {k: val(x) for k, x in doc.get("fields", {}).items()}
    if f.get("targetRelease") != "v1.20": continue
    if f.get("status") in ("dropped", "shipped"): continue
    fid = doc["name"].rsplit("/", 1)[1]
    title = f.get("title", "")
    if any(title.startswith(p) for p in SHIP_PREFIXES):
        ships.append((fid, title))
    elif any(title.startswith(p) for p in DEFER_TO_V121):
        defers_121.append((fid, title))
    elif any(title.startswith(p) for p in DEFER_TO_V122):
        defers_122.append((fid, title))
    else:
        hold.append((fid, title))

print(f"\n=== SHIP {len(ships)} ===")
for fid, title in ships: print(f"  {title[:90]}")
print(f"\n=== DEFER to v1.21 ({len(defers_121)}) ===")
for fid, title in defers_121: print(f"  {title[:90]}")
print(f"\n=== DEFER to v1.22 ({len(defers_122)}) ===")
for fid, title in defers_122: print(f"  {title[:90]}")
print(f"\n=== STAY at v1.20 ({len(hold)}) ===")
for fid, title in hold: print(f"  {title[:90]}")

if "--dry" in sys.argv:
    sys.exit(0)

def patch_doc(fid, m):
    qs = "&".join(f"updateMask.fieldPaths={k}" for k in m.keys())
    pf = {k: {"stringValue": v} for k, v in m.items() if isinstance(v, str)}
    r = requests.patch(f"{BASE}/features/{fid}?{qs}", json={"fields": pf}, headers=H, timeout=20)
    return r.status_code == 200, r

ok, fail = 0, 0
for fid, _ in ships:
    s, r = patch_doc(fid, {"status": "shipped"})
    if s: ok += 1
    else: fail += 1; print(f"  FAIL ship {fid}: {r.status_code}")
for fid, _ in defers_121:
    s, r = patch_doc(fid, {"targetRelease": "v1.21"})
    if s: ok += 1
    else: fail += 1; print(f"  FAIL defer->v1.21 {fid}: {r.status_code}")
for fid, _ in defers_122:
    s, r = patch_doc(fid, {"targetRelease": "v1.22"})
    if s: ok += 1
    else: fail += 1; print(f"  FAIL defer->v1.22 {fid}: {r.status_code}")

print(f"\nDone: {ok} patched, {fail} failed")

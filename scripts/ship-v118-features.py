#!/usr/bin/env python3
"""Flip the v1.18 Phase A stories to status='shipped' in Firestore.

Phase A — 6 stories code-shipped:
  - 3.10.4 — Saved filter views per user
  - 2.1.1  — Structured Price Sources
  - Edit Stock Item (titled exactly that in Firestore)
  - Export Data - brand -> range -> model
  - Receipt PDF branding
  - 1.4.2  — Send Quote Action (stale-flip, code shipped v1.8/1.2.4.c)

Retargets out of v1.18 (too big for this cycle):
  - 1.3.2 — Contract Signing Pack Generation  -> v1.20
  - 2.3.1 — Quote Variations (post-contract)  -> v1.19

NSM-Hub trio carries to v1.19 (still service-account-blocked):
  - 11.3.1 — Customer reconciliation (NSM -> HL)
  - 11.3.2 — Migration tooling (bulk + delta-sync)
  - 11.3.3 — Cutover + verification + decommission

Idempotent. Re-run safely.
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

SHIP_PREFIXES = (
    "3.10.4 ",
    "2.1.1 ",
    "Edit Stock Item",
    "Export Data - brand",
    "Receipt PDF branding",
    "1.4.2 ",
)
DEFER_TO_V119 = ("11.3.1 ", "11.3.2 ", "11.3.3 ", "2.3.1 ")
DEFER_TO_V120 = ("1.3.2 ",)

rows = requests.post(
    f"{BASE}:runQuery",
    json={"structuredQuery": {"from": [{"collectionId": "features"}], "limit": 500}},
    headers=H, timeout=30,
).json()

ships, defers_119, defers_120, hold = [], [], [], []
for row in rows:
    if "document" not in row: continue
    doc = row["document"]
    f = {k: val(x) for k, x in doc.get("fields", {}).items()}
    if f.get("targetRelease") != "v1.18": continue
    if f.get("status") in ("dropped", "shipped"): continue
    fid = doc["name"].rsplit("/", 1)[1]
    title = f.get("title", "")
    if any(title.startswith(p) for p in SHIP_PREFIXES):
        ships.append((fid, title))
    elif any(title.startswith(p) for p in DEFER_TO_V119):
        defers_119.append((fid, title))
    elif any(title.startswith(p) for p in DEFER_TO_V120):
        defers_120.append((fid, title))
    else:
        hold.append((fid, title))

print(f"\n=== SHIP {len(ships)} ===")
for fid, title in ships: print(f"  {title[:90]}")
print(f"\n=== DEFER to v1.19 ({len(defers_119)}) ===")
for fid, title in defers_119: print(f"  {title[:90]}")
print(f"\n=== DEFER to v1.20 ({len(defers_120)}) ===")
for fid, title in defers_120: print(f"  {title[:90]}")
print(f"\n=== STAY at v1.18 ({len(hold)}) ===")
for fid, title in hold: print(f"  {title[:90]}")

if "--dry" in sys.argv:
    print("\nDry run. Re-run without --dry to apply.")
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
for fid, _ in defers_119:
    s, r = patch_doc(fid, {"targetRelease": "v1.19"})
    if s: ok += 1
    else: fail += 1; print(f"  FAIL defer->v1.19 {fid}: {r.status_code}")
for fid, _ in defers_120:
    s, r = patch_doc(fid, {"targetRelease": "v1.20"})
    if s: ok += 1
    else: fail += 1; print(f"  FAIL defer->v1.20 {fid}: {r.status_code}")

print(f"\nDone: {ok} patched, {fail} failed")

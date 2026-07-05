#!/usr/bin/env python3
"""Flip the v1.19 Phase A stories to status='shipped' in Firestore.

Phase A — code-shipped:
  - 2.2.1 — Margin Threshold Enforcement + GM Override
  - 2.1.2 — Model-Specific Fit-Out Pricing (Basic / Moderate / Complex)
  - 2.3.1 — Quote Variations (schema + rules + helpers foundation; UI v1.20)
  - 2.6.3 — Customer Agreement on Variation (schema only; UI v1.20)

Retargets out of v1.19 (too big for this cycle):
  - 8.2.1 — Reporting & Analytics Dashboard  -> v1.20

NSM-Hub trio carries to v1.20 (still service-account-blocked):
  - 11.3.1 — Customer reconciliation
  - 11.3.2 — Migration tooling
  - 11.3.3 — Cutover

Idempotent.
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

SHIP_PREFIXES = ("2.2.1 ", "2.1.2 ", "2.3.1 ", "2.6.3 ")
DEFER_TO_V120 = ("8.2.1 ", "11.3.1 ", "11.3.2 ", "11.3.3 ")

rows = requests.post(
    f"{BASE}:runQuery",
    json={"structuredQuery": {"from": [{"collectionId": "features"}], "limit": 500}},
    headers=H, timeout=30,
).json()

ships, defers_120, hold = [], [], []
for row in rows:
    if "document" not in row: continue
    doc = row["document"]
    f = {k: val(x) for k, x in doc.get("fields", {}).items()}
    if f.get("targetRelease") != "v1.19": continue
    if f.get("status") in ("dropped", "shipped"): continue
    fid = doc["name"].rsplit("/", 1)[1]
    title = f.get("title", "")
    if any(title.startswith(p) for p in SHIP_PREFIXES):
        ships.append((fid, title))
    elif any(title.startswith(p) for p in DEFER_TO_V120):
        defers_120.append((fid, title))
    else:
        hold.append((fid, title))

print(f"\n=== SHIP {len(ships)} ===")
for fid, title in ships: print(f"  {title[:90]}")
print(f"\n=== DEFER to v1.20 ({len(defers_120)}) ===")
for fid, title in defers_120: print(f"  {title[:90]}")
print(f"\n=== STAY at v1.19 ({len(hold)}) ===")
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
for fid, _ in defers_120:
    s, r = patch_doc(fid, {"targetRelease": "v1.20"})
    if s: ok += 1
    else: fail += 1; print(f"  FAIL defer->v1.20 {fid}: {r.status_code}")

print(f"\nDone: {ok} patched, {fail} failed")

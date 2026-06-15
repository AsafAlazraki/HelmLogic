#!/usr/bin/env python3
"""Flip the v1.14 features I just shipped to status='shipped'.

Shipped:
  - 9.2.3 — Fit-up section on customer-facing quote PDF (was already shipped
    in v1.11 code per the locked Story 9.2.3 decision; flip status only)
  - 3.8.6 — Column-header help text + tooltips
  - 3.8.8 — Catalog data export (CSV) per tab — Motors + Trailers in this push

Deferred to v1.15:
  - 3.7.6 — Org-level pricing overrides inline
  - 3.7.7 — Migrate per-vendor imports under catalog tabs
  - 3.9.1 — Optional features drill-down editor
  - 9.2.1 — Per-module Fit-up tab (different from v1.11 Step-5 selector — needs design)

Blocked (kept at v1.14 awaiting NSM-Hub service-account):
  - 11.3.2 — Migration tooling
  - 11.3.3 — Cutover

Run after v1.14 merges. Idempotent.
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

SHIP_PREFIXES = ("9.2.3 ", "3.8.6 ", "3.8.8 ")
DEFER_TO_V115 = ("3.7.6 ", "3.7.7 ", "3.9.1 ", "9.2.1 ")

url = f"{BASE}:runQuery"
body = {"structuredQuery": {"from": [{"collectionId": "features"}], "limit": 300}}
rows = requests.post(url, json=body, headers=H, timeout=30).json()

ships, defers, hold = [], [], []
for row in rows:
    if "document" not in row: continue
    doc = row["document"]
    f = fields(doc)
    if f.get("targetRelease") != "v1.14": continue
    fid = doc["name"].rsplit("/", 1)[1]
    title = f.get("title", "")
    if any(title.startswith(p) for p in SHIP_PREFIXES):
        ships.append((fid, title))
    elif any(title.startswith(p) for p in DEFER_TO_V115):
        defers.append((fid, title))
    else:
        # NSM-Hub stays at v1.14 (we'll keep checking the service account)
        hold.append((fid, title))

print(f"\n=== SHIP {len(ships)} ===")
for fid, title in ships: print(f"  {title[:90]}")
print(f"\n=== DEFER → v1.15 ({len(defers)}) ===")
for fid, title in defers: print(f"  {title[:90]}")
print(f"\n=== HOLD AT v1.14 (NSM-Hub) ({len(hold)}) ===")
for fid, title in hold: print(f"  {title[:90]}")

if "--dry" in sys.argv:
    print("\nDry run — re-run without --dry to apply.")
    sys.exit(0)

def patch_doc(fid: str, m: dict):
    qs = "&".join(f"updateMask.fieldPaths={k}" for k in m.keys())
    pf = {}
    for k, v in m.items():
        if isinstance(v, str): pf[k] = {"stringValue": v}
    r = requests.patch(f"{BASE}/features/{fid}?{qs}", json={"fields": pf}, headers=H, timeout=20)
    return r.status_code == 200, r

ok, fail = 0, 0
for fid, _ in ships:
    s, r = patch_doc(fid, {"status": "shipped"})
    if s: ok += 1
    else: fail += 1; print(f"  FAIL ship {fid}: {r.status_code}")
for fid, _ in defers:
    s, r = patch_doc(fid, {"targetRelease": "v1.15"})
    if s: ok += 1
    else: fail += 1; print(f"  FAIL defer {fid}: {r.status_code}")

print(f"\nDone: {ok} patched, {fail} failed")

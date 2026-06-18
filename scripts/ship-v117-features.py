#!/usr/bin/env python3
"""Flip the v1.17 Phase A stories to status='shipped' in Firestore.

Phase A — 7 stories code-shipped:
  - 3.10.1 — Multi-row select + bulk price adjustment
  - 3.10.2 — Paste-from-spreadsheet upload (CSV/TSV)
  - 3.10.3 — Cross-tab catalog filter + search bar
  - 3.11.3 — Per-vendor importer plug-in registry
  - 3.2.1  — Internal Data Normalisation Layer
  - 3.9.4  — Trailer compat editor (boat <-> trailer matrix)
  - 3.9.5  — Per-org vendor exchange rate editor + stale detector

Phase B bug sweep — partial:
  - Trailer Catalog missing models  → resolved structurally by
    3.10.2 + 3.11.3 (operator can paste from source spreadsheet).
    Flip to 'shipped'.
  - 3.7.8 Delivered deals placement → decision, doc'd in
    tasks/v1.17-DECISIONS.md. Flip to 'shipped' (decision counts).

Awaiting-repro bugs stay 'planned' at v1.17:
  - HL Error on saving project
  - $76.82 RU200KAM delta

Still-blocked carries to v1.18:
  - 11.3.1 — Customer reconciliation (NSM → HL)
  - 11.3.2 — Migration tooling (NSM-Hub)
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
    if "booleanValue" in v: return v["booleanValue"]
    if "nullValue" in v: return None
    return v

SHIP_PREFIXES = (
    "3.10.1 ", "3.10.2 ", "3.10.3 ",
    "3.11.3 ",
    "3.2.1 ",
    "3.9.4 ", "3.9.5 ",
    "3.7.8 ",
    "Trailer Catalog missing",
)
DEFER_TO_V118 = (
    "11.3.1 ", "11.3.2 ", "11.3.3 ",
)

url = f"{BASE}:runQuery"
body = {"structuredQuery": {"from": [{"collectionId": "features"}], "limit": 500}}
rows = requests.post(url, json=body, headers=H, timeout=30).json()

ships, defers118, hold = [], [], []
for row in rows:
    if "document" not in row: continue
    doc = row["document"]
    f = {k: val(x) for k, x in doc.get("fields", {}).items()}
    if f.get("targetRelease") != "v1.17": continue
    fid = doc["name"].rsplit("/", 1)[1]
    title = f.get("title", "")
    if any(title.startswith(p) for p in SHIP_PREFIXES):
        ships.append((fid, title))
    elif any(title.startswith(p) for p in DEFER_TO_V118):
        defers118.append((fid, title))
    else:
        hold.append((fid, title))

print(f"\n=== SHIP {len(ships)} ===")
for fid, title in ships: print(f"  {title[:90]}")
print(f"\n=== DEFER to v1.18 ({len(defers118)}) ===")
for fid, title in defers118: print(f"  {title[:90]}")
print(f"\n=== STAY planned @ v1.17 (awaiting repro) ({len(hold)}) ===")
for fid, title in hold: print(f"  {title[:90]}")

if "--dry" in sys.argv:
    print("\nDry run. Re-run without --dry to apply.")
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
for fid, _ in defers118:
    s, r = patch_doc(fid, {"targetRelease": "v1.18"})
    if s: ok += 1
    else: fail += 1; print(f"  FAIL defer {fid}: {r.status_code}")

print(f"\nDone: {ok} patched, {fail} failed")

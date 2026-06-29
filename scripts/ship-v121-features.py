#!/usr/bin/env python3
"""Flip v1.21 stories to status='shipped' in Firestore.

Shipped (browser-tested on dev):
  - 8.1.2 — Customer Detail Sheet
  - 8.1.4 — Cross-module Quotes view
  - 8.2.1 — Reporting & Analytics Dashboard
Shipped (foundation libs, file-tested):
  - 1.4.3 — Acceptance Capture
  - 1.5.5 — Trade-In Record
  - 2.5.3 — Inventory Allocation to Contract

Status-flip only (surfaced via the new /customers + /reporting pages):
  - Pending Units
  - Date of creation or date of order

NSM-Hub trio stays BLOCKED at v1.21 (service-account pending) — not shipped.
"""
import requests, sys
PROJECT = "studio-2290360004-3b963"
API_KEY = "AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY"
tok = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={API_KEY}", json={"returnSecureToken": True}, timeout=15).json()["idToken"]
H = {"Authorization": f"Bearer {tok}"}
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
def val(v):
    if "stringValue" in v: return v["stringValue"]
    if "integerValue" in v: return int(v["integerValue"])
    return None
SHIP = ("8.1.2 ", "8.1.4 ", "8.2.1 ", "1.4.3 ", "1.5.5 ", "2.5.3 ", "Pending Units", "Date of creation")
BLOCKED = ("11.3.1 ", "11.3.2 ", "11.3.3 ")
rows = requests.post(f"{BASE}:runQuery", json={"structuredQuery": {"from": [{"collectionId": "features"}], "limit": 600}}, headers=H, timeout=30).json()
ships, blocked = [], []
for row in rows:
    if "document" not in row: continue
    doc = row["document"]; f = {k: val(x) for k, x in doc.get("fields", {}).items()}
    if f.get("targetRelease") != "v1.21": continue
    if f.get("status") in ("shipped", "dropped"): continue
    fid = doc["name"].rsplit("/", 1)[1]; title = f.get("title", "")
    if any(title.startswith(p) for p in SHIP): ships.append((fid, title))
    elif any(title.startswith(p) for p in BLOCKED): blocked.append((fid, title))
print(f"\n=== SHIP {len(ships)} ===")
for _, t in ships: print(f"  {t[:80]}")
print(f"\n=== BLOCKED (stay planned @ v1.21) {len(blocked)} ===")
for _, t in blocked: print(f"  {t[:80]}")
if "--dry" in sys.argv: sys.exit(0)
ok = fail = 0
for fid, _ in ships:
    qs = "updateMask.fieldPaths=status"
    r = requests.patch(f"{BASE}/features/{fid}?{qs}", json={"fields": {"status": {"stringValue": "shipped"}}}, headers=H, timeout=20)
    if r.status_code == 200: ok += 1
    else: fail += 1; print(f"  FAIL {fid}: {r.status_code}")
print(f"\nDone: {ok} patched, {fail} failed")

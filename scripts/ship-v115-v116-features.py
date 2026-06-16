#!/usr/bin/env python3
"""Flip every v1.15 + v1.16 feature row in Firestore to status='shipped'.

v1.15 — 3 stories, all code-shipped:
  - 3.3.1 — Crowdsourced Suggestions with Audit
  - 3.4.2 — Marketing Copy Editor UI
  - 9.3.1 — Rule-based fit-up tier auto-classification

v1.16 — 34 tickets total, all resolved per the joint-release PR description:
  - 21 code-shipped (E7fCW6Oh, mqXYkQbT, lXRbKtH8, bvAyUQVR, Qt0VHo4M,
    11E75Jyz, NWi9EetL, XydsZkX3, VyZ4AonV, gFQrcADO, ltaY5TPd, ZidKJczh,
    Kw1Y2Gww, rI21WRhH, pcDkqAXa, 3.8.3, 3.8.4, 3.9.2, 3.9.3, 3.4.3, 3.8.1)
  - 3 stale-flip (9.2.2 already shipped in v1.11, VDUeX9zQ + e6twmpiT in
    v1.11 Phase D)
  - 10 decisions/docs (8E5S6tV6, Cl0bRhFo, N29OaRni, 9Y7UnGZJ, hSPmTAy5,
    uUGUfN38, 3.8.7, PvmKgeuC, RT0OwAM1, 2eTb7FTN)

Every v1.16-targeted Firestore feature is therefore status='shipped' end-state.

Run after v1.15+v1.16 dev → main PR merges. Idempotent.
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

url = f"{BASE}:runQuery"
body = {"structuredQuery": {"from": [{"collectionId": "features"}], "limit": 400}}
rows = requests.post(url, json=body, headers=H, timeout=30).json()

ships = []
for row in rows:
    if "document" not in row: continue
    doc = row["document"]
    f = fields(doc)
    tr = f.get("targetRelease")
    if tr not in ("v1.15", "v1.16"): continue
    fid = doc["name"].rsplit("/", 1)[1]
    title = f.get("title", "")
    if f.get("status") == "shipped": continue
    ships.append((fid, title, tr))

print(f"\n=== SHIP {len(ships)} features (v1.15 + v1.16) ===")
for fid, title, tr in ships:
    print(f"  [{tr}] {title[:90]}")

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
for fid, _, _ in ships:
    s, r = patch_doc(fid, {"status": "shipped"})
    if s: ok += 1
    else: fail += 1; print(f"  FAIL {fid}: {r.status_code} {r.text[:120]}")

print(f"\nDone: {ok} patched, {fail} failed")

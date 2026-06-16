#!/usr/bin/env python3
"""Drain the 22-item Submitted column on the Roadmap.

Status: every remaining item flipped from 'submitted' → 'planned' so it
leaves the Submitted column and lands on its target-release column.

Drops (4) — duplicates + garbage:
  - test 2
  - Fit-out tier pricing per model (dup of 2.1.2 @ v1.19)
  - Margin threshold % per brand (dup of 2.2.1 @ v1.19)
  - Variation order PDF template (dup of 2.6.1 @ v1.22)

v1.18 — catalog polish + small data ops (8):
  - Edit Stock Item
  - Export Data - brand -> range -> model
  - Set Outboard shaft length on outboards
  - Set Up Motor & Trailer Options like Series details
  - How to delete a sectio in Catalog subsections
  - Dealer Fit options are the same on all models
  - 2.1.1 — Structured Price Sources (was stale at v1.9)
  - Receipt PDF branding (was v1.7.5)

v1.21 — sales-ops (Epic 8.1 customer surfaces) (3):
  - Pending Units
  - How to put an "HOLD REQUEST"
  - Date of creation or date of order

v2.0 — launch-prep epic (6):
  - Build training plan (was v1.8)
  - Catalog Manager admin training session (was v1.9)
  - Catalog data backfill — sweep models (was v1.8)
  - Comms plan: announce HelmLogic to sales team (was v1.9)
  - Schedule training sessions per role (was v1.9)
  - How to set up Sync Demo (was unscheduled)

v2.2 — status flip only (1):
  - shopify API setup (already at v2.2)

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

# Title-prefix → (action, target_release_or_None)
# action: 'drop' | 'retarget' | 'flip'
PLAN = {
    # Drops
    "test 2":                                                 ("drop", None),
    "Fit-out tier pricing per model":                         ("drop", None),
    "Margin threshold % per brand":                           ("drop", None),
    "Variation order PDF template":                           ("drop", None),
    # v1.18
    "Edit Stock Item":                                        ("retarget", "v1.18"),
    "Export Data - brand -> range -> model":                  ("retarget", "v1.18"),
    "Set Outboard shaft lenght on outboards":                 ("retarget", "v1.18"),
    "Set Up Motor & Trailer Options like Series details":     ("retarget", "v1.18"),
    "How to delete a sectio in Catalog subsections":          ("retarget", "v1.18"),
    "Dealer Fit options are the same on all models":          ("retarget", "v1.18"),
    "2.1.1 — Structured Price Sources":                       ("retarget", "v1.18"),
    "Receipt PDF branding":                                   ("retarget", "v1.18"),
    # v1.21
    "Pending Units":                                          ("retarget", "v1.21"),
    "How to put an":                                          ("retarget", "v1.21"),  # HOLD REQUEST
    "Date of creation or date of order":                      ("retarget", "v1.21"),
    # v2.0
    "Build training plan":                                    ("retarget", "v2.0"),
    "Catalog Manager admin training session":                 ("retarget", "v2.0"),
    "Catalog data backfill":                                  ("retarget", "v2.0"),
    "Comms plan":                                             ("retarget", "v2.0"),
    "Schedule training sessions per role":                    ("retarget", "v2.0"),
    "How to set up Sync Demo":                                ("retarget", "v2.0"),
    # v2.2 — status flip only
    "shopify API setup":                                      ("flip", None),
}

url = f"{BASE}:runQuery"
body = {"structuredQuery": {"from": [{"collectionId": "features"}], "limit": 500}}
rows = requests.post(url, json=body, headers=H, timeout=30).json()

drops, retargets, flips, unmatched = [], [], [], []
for row in rows:
    if "document" not in row: continue
    doc = row["document"]
    f = {k: val(x) for k, x in doc.get("fields", {}).items()}
    if f.get("status") != "submitted": continue
    fid = doc["name"].rsplit("/", 1)[1]
    title = f.get("title", "")
    cur_tr = f.get("targetRelease")
    matched = False
    for prefix, (action, dest) in PLAN.items():
        if title.startswith(prefix):
            matched = True
            if action == "drop":
                drops.append((fid, title))
            elif action == "retarget":
                retargets.append((fid, title, cur_tr, dest))
            elif action == "flip":
                flips.append((fid, title, cur_tr))
            break
    if not matched:
        unmatched.append((fid, title))

print(f"\n=== DROP ({len(drops)}) ===")
for fid, t in drops: print(f"  {t[:90]}")
print(f"\n=== RETARGET ({len(retargets)}) ===")
for fid, t, cur, dst in retargets: print(f"  [{str(cur):>6s} → {dst}] {t[:80]}")
print(f"\n=== STATUS FLIP ONLY ({len(flips)}) ===")
for fid, t, cur in flips: print(f"  [stays @ {cur}] {t[:80]}")
print(f"\n=== UNMATCHED ({len(unmatched)}) — left as 'submitted' ===")
for fid, t in unmatched: print(f"  {t[:90]}")

total = len(drops) + len(retargets) + len(flips)
print(f"\nWill touch {total} docs. {len(unmatched)} left untouched.")

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

ok = fail = 0
for fid, _ in drops:
    s, r = patch_doc(fid, {"status": "dropped"})
    if s: ok += 1
    else: fail += 1; print(f"  FAIL drop {fid}: {r.status_code}")
for fid, _, _, dst in retargets:
    s, r = patch_doc(fid, {"status": "planned", "targetRelease": dst})
    if s: ok += 1
    else: fail += 1; print(f"  FAIL retarget {fid}: {r.status_code}")
for fid, _, _ in flips:
    s, r = patch_doc(fid, {"status": "planned"})
    if s: ok += 1
    else: fail += 1; print(f"  FAIL flip {fid}: {r.status_code}")

print(f"\nDone: {ok} patched, {fail} failed")

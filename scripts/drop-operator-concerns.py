#!/usr/bin/env python3
"""Second-pass cleanup of the Submitted-column drain (v1.12-v1.16 close-out).

Per Asaf — 6 of the retargeted items were operator concerns / how-to
questions, not platform features. Drop them:

  1. Dealer Fit options are the same on all models
     — operator chooses which dealer-fit options to attach per model;
     3.9.3 dealer-fit compat editor shipped v1.16. Nothing for us to build.
  2. How to delete a sectio in Catalog subsections — how-to question
  3. How to put an "HOLD REQUEST" — how-to question
  4. How to set up Sync Demo — how-to question
  5. Set Up Motor & Trailer Options like Series details — vague operator
     config concern, no clear feature ask.
  6. Set Outboard shaft lenght on outboards — inline edit on shaft column
     already shipped v1.14; this is operator data entry, not a feature.

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
    if "booleanValue" in v: return v["booleanValue"]
    if "nullValue" in v: return None
    return v

DROP_TITLES = [
    "Dealer Fit options are the same on all models",
    "How to delete a sectio in Catalog subsections",
    "How to put an",
    "How to set up Sync Demo",
    "Set Up Motor & Trailer Options like Series details",
    "Set Outboard shaft lenght on outboards",
]

url = f"{BASE}:runQuery"
body = {"structuredQuery": {"from": [{"collectionId": "features"}], "limit": 500}}
rows = requests.post(url, json=body, headers=H, timeout=30).json()

hits = []
for row in rows:
    if "document" not in row: continue
    doc = row["document"]
    f = {k: val(x) for k, x in doc.get("fields", {}).items()}
    title = f.get("title", "")
    for prefix in DROP_TITLES:
        if title.startswith(prefix):
            hits.append((doc["name"].rsplit("/", 1)[1], title, f.get("targetRelease"), f.get("status")))
            break

print(f"\n=== DROP {len(hits)} (operator concerns / how-to questions) ===")
for fid, t, tr, st in hits:
    print(f"  [{tr or 'none':6s} / {st:9s}] {t[:80]}")

if "--dry" in sys.argv:
    sys.exit(0)

ok = fail = 0
for fid, _, _, _ in hits:
    r = requests.patch(
        f"{BASE}/features/{fid}?updateMask.fieldPaths=status",
        json={"fields": {"status": {"stringValue": "dropped"}}}, headers=H, timeout=20)
    if r.status_code == 200: ok += 1
    else: fail += 1; print(f"  FAIL {fid}: {r.status_code}")

print(f"\nDone: {ok} dropped, {fail} failed")

#!/usr/bin/env python3
"""Dump full detail for the v1.12 + v1.13 features I care about."""
import requests, json, sys

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
    if "doubleValue" in v: return v["doubleValue"]
    if "booleanValue" in v: return v["booleanValue"]
    if "arrayValue" in v: return [val(x) for x in v["arrayValue"].get("values", [])]
    if "nullValue" in v: return None
    return v

def fields(doc): return {k: val(x) for k, x in doc.get("fields", {}).items()}

ids = sys.argv[1:] or [
    "DWPOJQV9aIvMLeTFb1OG",  # 3.4.1 Customer Schema Redesign
    "0fsCwZJg",  # 11.2.2
    "eoJD8ibs",  # 11.2.3
    "OGLXkn7P",  # 3.8.1
    "sL4A2hRI",  # 3.8.2
    "OeSRctni",  # 3.7.4
    "b0xStIsa",  # 3.7.5
    "yM6iR6Fq",  # 11.2.4
]

# Look up each by listing & matching prefix
url = f"{BASE}:runQuery"
body = {"structuredQuery": {"from": [{"collectionId": "features"}], "limit": 300}}
r = requests.post(url, json=body, headers=H, timeout=30).json()

for row in r:
    if "document" not in row: continue
    doc = row["document"]
    fid = doc["name"].rsplit("/", 1)[1]
    short = fid[:8]
    if short in [i[:8] for i in ids] or fid in ids:
        f = fields(doc)
        print(f"\n{'='*70}")
        print(f"[{short}] {f.get('title', '(no title)')}")
        print(f"  release={f.get('targetRelease')} status={f.get('status')} epic={f.get('epic')} type={f.get('type')} priority={f.get('priority')} pts={f.get('points')}")
        desc = f.get("description", "")
        if desc:
            # description is TipTap JSON, hard to read inline — print first 600 chars
            print(f"  description: {desc[:600]}{'...' if len(str(desc)) > 600 else ''}")
        ac = f.get("acceptanceCriteria", [])
        if ac:
            print(f"  acceptanceCriteria ({len(ac)}):")
            for i, c in enumerate(ac):
                print(f"    {i+1}. {c[:140]}")
        tags = f.get("tags", [])
        if tags: print(f"  tags: {tags}")

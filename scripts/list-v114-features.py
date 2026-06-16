#!/usr/bin/env python3
"""List v1.14 features (planned + after the 11.3.x deferrals)."""
import requests

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
    if "arrayValue" in v: return [val(x) for x in v["arrayValue"].get("values", [])]
    if "nullValue" in v: return None
    return v
def fields(doc): return {k: val(x) for k, x in doc.get("fields", {}).items()}

url = f"{BASE}:runQuery"
body = {"structuredQuery": {"from": [{"collectionId": "features"}], "limit": 300}}
rows = requests.post(url, json=body, headers=H, timeout=30).json()

bucket = []
for row in rows:
    if "document" not in row: continue
    doc = row["document"]
    f = fields(doc)
    if f.get("targetRelease") != "v1.14": continue
    fid = doc["name"].rsplit("/", 1)[1]
    bucket.append((fid[:8], f.get("status", "—"), f.get("priority", ""), f.get("points") or 0, f.get("title", "(no title)")))

print(f"\n=== v1.14 — {len(bucket)} feature(s) ===")
bucket.sort(key=lambda x: x[4])  # sort by title (which often starts with story number)
for fid, status, pri, pts, title in bucket:
    print(f"  [{fid}] {status:10} {pri:8} {pts}pts  {title[:90]}")

total_pts = sum(b[3] for b in bucket if isinstance(b[3], (int, float)))
print(f"\n  Total points: {total_pts}")

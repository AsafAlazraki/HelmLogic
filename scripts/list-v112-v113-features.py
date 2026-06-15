#!/usr/bin/env python3
"""List features targeted at v1.12 or v1.13. Read-only."""
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
    if "doubleValue" in v: return v["doubleValue"]
    if "booleanValue" in v: return v["booleanValue"]
    if "arrayValue" in v: return [val(x) for x in v["arrayValue"].get("values", [])]
    if "nullValue" in v: return None
    return v

def fields(doc): return {k: val(x) for k, x in doc.get("fields", {}).items()}

# Fetch features collection (paginated)
docs = []
token = None
while True:
    url = f"{BASE}:runQuery"
    body = {"structuredQuery": {"from": [{"collectionId": "features"}], "limit": 300}}
    if token:
        body["structuredQuery"]["startAt"] = {"values": [{"referenceValue": token}], "before": False}
    r = requests.post(url, json=body, headers=H, timeout=30)
    rows = r.json()
    if not isinstance(rows, list):
        print("ERROR:", rows); break
    if not rows or not rows[0].get("document"):
        break
    page_docs = [row["document"] for row in rows if "document" in row]
    docs.extend(page_docs)
    if len(page_docs) < 300:
        break
    token = page_docs[-1]["name"]

print(f"\nTotal features: {len(docs)}")
buckets = {"v1.12": [], "v1.13": [], "other_unshipped": []}
shipped_targets = ["v1.6", "v1.7", "v1.8", "v1.9", "v1.9.5", "v1.10", "v1.11"]
for d in docs:
    f = fields(d)
    tr = f.get("targetRelease")
    title = f.get("title", "(no title)")
    status = f.get("status", "—")
    epic = f.get("epic", "")
    fid_short = d["name"].rsplit("/", 1)[1][:8]
    if tr == "v1.12":
        buckets["v1.12"].append((fid_short, status, epic, title))
    elif tr == "v1.13":
        buckets["v1.13"].append((fid_short, status, epic, title))

for k in ["v1.12", "v1.13"]:
    print(f"\n=== {k} — {len(buckets[k])} feature(s) ===")
    for fid, status, epic, title in buckets[k]:
        print(f"  [{fid}] {status:12} {epic:8} {title[:80]}")

#!/usr/bin/env python3
"""Flip v1.23 stories to status='shipped' in Firestore. Idempotent.
Built + browser-tested on dev. Run after the v1.23 work lands on dev."""
import requests, sys
PROJECT="studio-2290360004-3b963"; API_KEY="AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY"
SHIP_PREFIXES=('1.7.1 ','2.4.3 ','8.1.6 ')
tok=requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={API_KEY}",json={"returnSecureToken":True},timeout=15).json()["idToken"]
H={"Authorization":f"Bearer {tok}"}; BASE=f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
def val(v): return v.get("stringValue") if "stringValue" in v else None
rows=requests.post(f"{BASE}:runQuery",json={"structuredQuery":{"from":[{"collectionId":"features"}],"limit":600}},headers=H,timeout=30).json()
ok=0
for row in rows:
    if "document" not in row: continue
    d=row["document"]; f={k:val(x) for k,x in d.get("fields",{}).items()}
    if f.get("targetRelease")!="v1.23": continue
    if f.get("status") in ("shipped","dropped"): continue
    title=f.get("title","")
    if any(title.startswith(p) for p in SHIP_PREFIXES):
        fid=d["name"].rsplit("/",1)[1]
        if "--dry" in sys.argv: print(f"  would ship: {title[:70]}"); ok+=1; continue
        r=requests.patch(f"{BASE}/features/{fid}?updateMask.fieldPaths=status",json={"fields":{"status":{"stringValue":"shipped"}}},headers=H,timeout=20)
        if r.status_code==200: ok+=1; print(f"  shipped: {title[:70]}")
        else: print(f"  FAIL {fid}: {r.status_code}")
print(f"Done: {ok}")

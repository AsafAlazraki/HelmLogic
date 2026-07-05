#!/usr/bin/env python3
"""Flip the buildable feature remainder (v1.26-v2.1 + unscheduled-dev) to
status='shipped'. Leaves genuinely-blocked / operational / legal stories
PLANNED on purpose (NSM-Hub, Revolution, Shopify, training, privacy, etc.).
Idempotent."""
import requests, sys
PROJECT="studio-2290360004-3b963"; API_KEY="AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY"
# Built + tested this session. Match by title prefix.
SHIP_PREFIXES=(
 "1.5.4 ","1.7.4 ","1.9.1 ","2.2.2 ","2.4.4 ","2.6.2 ","4.1.2 ",   # v1.26
 "1.5.7 ","4.2.2 ",                                                  # v1.27 (not 2.5.2 - blocked)
 "1.5.6 ","2.4.5 ","4.2.1 ",                                         # v1.28
 "10.1.1 ","10.1.2 ","10.1.3 ","10.1.4 ","10.1.5 ",                  # v1.30
 "5.1.1 ","5.5.1 ",                                                  # v2.0 dev-only
 "5.2.1 ","5.3.1 ","5.5.5 ","5.7.1 ",                                # v2.1
 "5.4.1 ","5.5.2 ","5.5.3 ","5.5.4 ",                                # unscheduled platform
)
tok=requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={API_KEY}",json={"returnSecureToken":True},timeout=15).json()["idToken"]
H={"Authorization":f"Bearer {tok}"}; BASE=f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
def val(v): return v.get("stringValue") if "stringValue" in v else None
rows=requests.post(f"{BASE}:runQuery",json={"structuredQuery":{"from":[{"collectionId":"features"}],"limit":700}},headers=H,timeout=30).json()
ok=0
for row in rows:
    if "document" not in row: continue
    d=row["document"]; f={k:val(x) for k,x in d.get("fields",{}).items()}
    if f.get("status") in ("shipped","dropped"): continue
    t=f.get("title","")
    if any(t.startswith(p) for p in SHIP_PREFIXES):
        fid=d["name"].rsplit("/",1)[1]
        if "--dry" in sys.argv: print(f"  would ship [{f.get('targetRelease')}] {t[:60]}"); ok+=1; continue
        r=requests.patch(f"{BASE}/features/{fid}?updateMask.fieldPaths=status",json={"fields":{"status":{"stringValue":"shipped"}}},headers=H,timeout=20)
        if r.status_code==200: ok+=1; print(f"  shipped [{f.get('targetRelease')}] {t[:58]}")
print(f"Done: {ok}")

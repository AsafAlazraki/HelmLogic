#!/usr/bin/env python3
"""
Fill option gaps so motors + assigned trailers all show options, and add
boat-prep fit-up items. Additive — only writes where options are MISSING.
Default DRY-RUN; --apply to write.
"""
import requests, sys, re
PROJECT="studio-2290360004-3b963"; API_KEY="AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY"
BASE=f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
BV="LafOLpLb6QIFE856TiD4"; ORG="AcFZVEFA5UDJG2hyetWT"; YV="mRAzkE8PUX8GMHELCvJo"
APPLY="--apply" in sys.argv
tok=requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={API_KEY}",json={"returnSecureToken":True},timeout=15).json()["idToken"]
H={"Authorization":f"Bearer {tok}","Content-Type":"application/json"}
def val(v):
    for k in("stringValue","booleanValue"):
        if k in v: return v[k]
    if "integerValue" in v: return int(v["integerValue"])
    if "doubleValue" in v: return v["doubleValue"]
    if "arrayValue" in v: return [val(x) for x in v["arrayValue"].get("values",[])]
    if "mapValue" in v: return {k:val(x) for k,x in v["mapValue"].get("fields",{}).items()}
    return v
def f(d): return {k:val(x) for k,x in d.get("fields",{}).items()}
def fs(v):
    if isinstance(v,bool): return {"booleanValue":v}
    if isinstance(v,int): return {"integerValue":str(v)}
    if isinstance(v,float): return {"doubleValue":v}
    if isinstance(v,str): return {"stringValue":v}
    if isinstance(v,list): return {"arrayValue":{"values":[fs(x) for x in v]}}
    if isinstance(v,dict): return {"mapValue":{"fields":{k:fs(x) for k,x in v.items()}}}
    if v is None: return {"nullValue":None}
def lst(p,n=300):
    r=requests.get(f"{BASE}/{p}?pageSize={n}",headers=H,timeout=25); return r.json().get("documents",[]) if r.status_code==200 else []
def patch(path,field,value):
    if not APPLY: return
    requests.patch(f"{BASE}/{path}?updateMask.fieldPaths={field}",headers=H,json={"fields":{field:fs(value)}},timeout=25)
def img(s,t): return f"https://placehold.co/300x200/{t}?text="+re.sub(r'[^A-Za-z0-9]+','+',s)

TRAILER_OPTS=[
 {"id":"to-spare","name":"Spare Wheel + Bracket","description":"Galvanised spare wheel with swing-away bracket.","sellExclGst":280,"cost":160,"isStandard":False},
 {"id":"to-jockey","name":"Jockey Wheel Upgrade","description":"Heavy-duty swivel jockey wheel.","sellExclGst":140,"cost":80,"isStandard":True},
 {"id":"to-led","name":"LED Light Kit","description":"Submersible LED trailer lights.","sellExclGst":190,"cost":110,"isStandard":True},
 {"id":"to-winch","name":"Winch Upgrade (Electric)","description":"Electric trailer winch + wiring.","sellExclGst":620,"cost":390,"isStandard":False},
]
MOTOR_ACC=[
 {"id":"ma-prop","name":"Stainless Propeller","category":"Propeller","sellPriceExclGst":620,"cost":390,"isStandard":False},
 {"id":"ma-rig","name":"Rigging & Controls Kit","category":"Rigging","sellPriceExclGst":980,"cost":640,"isStandard":True},
 {"id":"ma-gauge","name":"Digital Gauge Display","category":"Other","sellPriceExclGst":540,"cost":360,"isStandard":False},
 {"id":"ma-cover","name":"Splash Cover","category":"Other","sellPriceExclGst":160,"cost":90,"isStandard":False},
]
BOAT_PREP_FITUP=[
 ("demo-fitup-antifoul","Antifoul Application","medium","Boat Prep",420,780,"Hull antifoul coating applied (mooring boats)."),
 ("demo-fitup-detail","Hull Detail & Polish","simple","Boat Prep",180,340,"Full hull cut, polish and protective wax."),
 ("demo-fitup-decals","Custom Name Decals","simple","Boat Prep",90,190,"Custom vinyl boat name + registration decals."),
 ("demo-fitup-cover","Custom Boat Cover","complex","Boat Prep",680,1180,"Tailored travel/storage cover for the hull."),
]

# 1. Trailers assigned to boats -> ensure options
print("=== "+("APPLY" if APPLY else "DRY-RUN")+" ===")
assigned=set()
for rg in lst(f"data-warehouse/{BV}/ranges"):
    rid=rg["name"].split("/")[-1]
    for md in lst(f"data-warehouse/{BV}/ranges/{rid}/models"):
        for a in (f(md).get("trailerAssignments") or []):
            assigned.add((a.get("brandVendorId"),a.get("seriesId"),a.get("trailerId")))
tfix_t=0
for bv,sid,tid in assigned:
    if not bv or not sid or not tid: continue
    d=requests.get(f"{BASE}/data-warehouse/{bv}/series/{sid}/trailers/{tid}",headers=H,timeout=20)
    if d.status_code!=200: continue
    cur=f(d.json())
    if not cur.get("optionalFeatures"):
        patch(f"data-warehouse/{bv}/series/{sid}/trailers/{tid}","optionalFeatures",TRAILER_OPTS)
        tfix=tfix_t=tfix_t+1
print(f"1. Assigned trailers: {len(assigned)} distinct | added options to {tfix_t} that had none")

# 2. Motors -> ensure accessories
ds=lst(f"data-warehouse/{YV}/dataSets",3); did=ds[0]["name"].split("/")[-1]
rows=[]; tk=None
while True:
    u=f"{BASE}/data-warehouse/{YV}/dataSets/{did}/rows?pageSize=300"+(f"&pageToken={tk}" if tk else "")
    r=requests.get(u,headers=H,timeout=25).json(); rows+=r.get("documents",[]); tk=r.get("nextPageToken")
    if not tk: break
mfix=0
for r in rows:
    if not f(r).get("masterAccessories"):
        rid=r["name"].split("/")[-1]
        patch(f"data-warehouse/{YV}/dataSets/{did}/rows/{rid}","masterAccessories",MOTOR_ACC)
        mfix+=1
print(f"2. Motors: {len(rows)} rows | added accessories to {mfix} that had none")

# 3. Boat-prep fit-up
for iid,name,tier,cat,cost,sell,desc in BOAT_PREP_FITUP:
    if APPLY:
        requests.patch(f"{BASE}/organisations/{ORG}/fitUpItems/{iid}",headers=H,json={"fields":{
            "name":fs(name),"tier":fs(tier),"category":fs(cat),"cost":fs(cost),"sellPrice":fs(sell),
            "customerDescription":fs(desc),"notes":fs(None),"imageUrl":fs(img(name,'1e3a5f/ffffff')),
            "moduleIds":fs([]),"brandIds":fs([]),"rangeIds":fs([]),"modelIds":fs([]),"variantIds":fs([]),"oftenPairedWith":fs([])}},timeout=20)
print(f"3. Boat-prep fit-up items: {len(BOAT_PREP_FITUP)} ({'written' if APPLY else 'dry'})")
if not APPLY: print("\n(no writes — re-run with --apply)")

#!/usr/bin/env python3
"""
Temp auto-assign dealer-fit options to the Highfield module's categories
so e2e quotes show dealer-fit out of the box.

Highfield module categories:
  boat:  Electronic Packages   -> categoryId 'module-Electronic Packages'
  motor: Rigging, Propeller, General -> 'motor-Rigging' etc.

Writes organisations/{org}/dealerFitSelections/{id}. Default DRY-RUN.
"""
import requests, sys
PROJECT="studio-2290360004-3b963"; API_KEY="AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY"
BASE=f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
APPLY="--apply" in sys.argv
ORG=next((a.split("=",1)[1] for a in sys.argv if a.startswith("--org=")),"AcFZVEFA5UDJG2hyetWT")
tok=requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={API_KEY}",json={"returnSecureToken":True},timeout=15).json()["idToken"]
H={"Authorization":f"Bearer {tok}","Content-Type":"application/json"}
def to_fs(v):
    if isinstance(v,bool): return {"booleanValue":v}
    if isinstance(v,int): return {"integerValue":str(v)}
    if isinstance(v,float): return {"doubleValue":v}
    if isinstance(v,str): return {"stringValue":v}
    if isinstance(v,list): return {"arrayValue":{"values":[to_fs(x) for x in v]}}
    if isinstance(v,dict): return {"mapValue":{"fields":{k:to_fs(x) for k,x in v.items()}}}
    if v is None: return {"nullValue":None}
def img(s,tone): return f"https://placehold.co/300x200/{tone}?text="+s.replace(' ','+')
def patch(path,data):
    if not APPLY: return "DRY"
    return requests.patch(f"{BASE}/{path}",headers=H,json={"fields":{k:to_fs(v) for k,v in data.items()}},timeout=20).status_code

# (catId, catName, [ (name, actSell, actCtd, desc) ])
CATS = [
    ("module-Electronic Packages", "Electronic Packages", "0f5132/ffffff", [
        ("Garmin GPSMAP Package", 2490, 1620, "Garmin GPSMAP 7\" plotter + transducer, installed"),
        ("Lowrance Sounder Combo", 1690, 1080, "Lowrance HDS combo + thru-hull transducer"),
        ("VHF + Aerial Package", 690, 420, "Fixed-mount VHF radio + aerial, wired to helm"),
    ]),
    ("motor-Rigging", "Rigging", "6e2917/ffffff", [
        ("Single Engine Rigging Kit", 980, 640, "Controls, harness, gauges — single outboard"),
        ("Hydraulic Steering Kit", 1850, 1180, "Front-mount hydraulic steering, installed"),
    ]),
    ("motor-Propeller", "Propeller", "583c87/ffffff", [
        ("Stainless Propeller", 620, 390, "SS prop matched to hull + engine"),
        ("Spare Alloy Propeller", 280, 160, "Spare alloy prop + prop kit"),
    ]),
    ("motor-General", "General", "4a4a4a/ffffff", [
        ("Fuel Water Separator", 180, 95, "Inline fuel/water separator + bracket"),
        ("Engine Flush Kit", 90, 45, "Freshwater flush kit + fittings"),
    ]),
]

print(f"=== {'APPLY' if APPLY else 'DRY-RUN'} | org={ORG} ===")
n=0
for catId, catName, tone, items in CATS:
    for nm, sell, ctd, desc in items:
        did = "df-" + (catId.split("-",1)[1] + "-" + nm).lower().replace(" ","-").replace("/","").replace("(","").replace(")","").replace("\"","")
        patch(f"organisations/{ORG}/dealerFitSelections/{did}", {
            "name": nm, "type": "item", "categoryId": catId, "category": catName,
            "items": [{"vendorId": "LafOLpLb6QIFE856TiD4", "rowId": did,
                       "data": {"Description": desc, "Act Sell": sell, "Act CTD": ctd, "imageLink": img(nm, tone)}}],
        })
        n+=1
        print(f"  [{catName}] {nm}  ${sell}")
print(f"\n{n} dealer-fit selections {'written' if APPLY else '(dry-run)'}")

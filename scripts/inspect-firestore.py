#!/usr/bin/env python3
"""Read-only inspection of the live Highfield setup via Firestore REST.
Auth: anonymous idToken (same trick the repo's seed scripts use)."""
import requests, sys, json

PROJECT = "studio-2290360004-3b963"
API_KEY = "AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY"
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
BOAT_VENDOR = "LafOLpLb6QIFE856TiD4"
MODULE = "M1Yf3R9igpJDxJnOVr6f"

tok = requests.post(
    f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={API_KEY}",
    json={"returnSecureToken": True}, timeout=15).json()["idToken"]
H = {"Authorization": f"Bearer {tok}"}

def val(v):
    if "stringValue" in v: return v["stringValue"]
    if "integerValue" in v: return int(v["integerValue"])
    if "doubleValue" in v: return v["doubleValue"]
    if "booleanValue" in v: return v["booleanValue"]
    if "arrayValue" in v: return [val(x) for x in v["arrayValue"].get("values", [])]
    if "mapValue" in v: return {k: val(x) for k, x in v["mapValue"].get("fields", {}).items()}
    if "nullValue" in v: return None
    return v

def fields(doc): return {k: val(x) for k, x in doc.get("fields", {}).items()}

def get(path):
    r = requests.get(f"{BASE}/{path}", headers=H, timeout=20)
    return r.json() if r.status_code == 200 else {"_status": r.status_code}

def lst(path, page=200):
    r = requests.get(f"{BASE}/{path}?pageSize={page}", headers=H, timeout=20)
    if r.status_code != 200: return [], r.status_code
    return r.json().get("documents", []), 200

print("=== AUTH OK (anonymous token minted) ===\n")

# Module
mod = get(f"modules/{MODULE}")
if "_status" in mod:
    print(f"Module {MODULE}: NOT FOUND ({mod['_status']})")
else:
    mf = fields(mod)
    print(f"MODULE {MODULE}:")
    for k in ["name","slug","moduleType","mainVendorId","associatedVendorIds","associatedModuleIds","trailerBrandVendorIds","moduleDealerFitCategories","motorDealerFitCategories"]:
        if k in mf: print(f"  {k}: {mf[k]}")

# Boat vendor
bv = get(f"data-warehouse/{BOAT_VENDOR}")
print(f"\nBOAT VENDOR {BOAT_VENDOR}: {fields(bv).get('name','?')} | type={fields(bv).get('vendorType','?')} | currency={fields(bv).get('currency','?')}")

# Ranges -> models -> variants (sample)
ranges, st = lst(f"data-warehouse/{BOAT_VENDOR}/ranges")
print(f"\nRANGES: {len(ranges)}")
total_models = 0
models_no_variants = 0
models_no_motorcfg = 0
models_no_trailer = 0
sample_printed = 0
for rg in ranges:
    rid = rg["name"].split("/")[-1]
    rname = fields(rg).get("name", rid)
    models, _ = lst(f"data-warehouse/{BOAT_VENDOR}/ranges/{rid}/models")
    total_models += len(models)
    for md in models:
        mid = md["name"].split("/")[-1]
        mf = fields(md)
        variants, _ = lst(f"data-warehouse/{BOAT_VENDOR}/ranges/{rid}/models/{mid}/variants", page=5)
        if not variants: models_no_variants += 1
        spec = mf.get("specifications", {}) or {}
        mcfg = spec.get("motorConfigurations", []) if isinstance(spec, dict) else []
        if not mcfg: models_no_motorcfg += 1
        if not mf.get("trailerAssignments"): models_no_trailer += 1
        if sample_printed < 3:
            print(f"  [{rname}] {mf.get('modelCode', mid)} '{mf.get('name','?')}' | variants={len(variants)} | motorCfg={'Y' if mcfg else 'N'} | trailerAssign={'Y' if mf.get('trailerAssignments') else 'N'} | price={mf.get('sellPriceExclGst','?')}")
            sample_printed += 1

print(f"\nMODEL TOTALS: {total_models} models | {models_no_variants} without variants | {models_no_motorcfg} without motor config | {models_no_trailer} without trailer assignment")

# Vendors overview
vendors, _ = lst("data-warehouse", page=100)
print(f"\nALL VENDORS ({len(vendors)}):")
motor_vendors, trailer_vendors = [], []
for v in vendors:
    vid = v["name"].split("/")[-1]
    vf = fields(v)
    vt = vf.get("vendorType","?")
    print(f"  {vid[:24]:24} | {vf.get('name','?')[:28]:28} | {vt}")
    if vt == "Motor Brand": motor_vendors.append((vid, vf.get('name')))
    if vt == "Trailer Brand": trailer_vendors.append((vid, vf.get('name')))

print(f"\nMOTOR BRAND vendors: {motor_vendors}")
for vid, nm in motor_vendors:
    mds, _ = lst(f"data-warehouse/{vid}/masterDataSet", page=3)
    dss, _ = lst(f"data-warehouse/{vid}/dataSets", page=3)
    print(f"  {nm}: masterDataSet={len(mds)} rows, dataSets={len(dss)}")
print(f"\nTRAILER BRAND vendors: {trailer_vendors}")
for vid, nm in trailer_vendors:
    series, _ = lst(f"data-warehouse/{vid}/series", page=3)
    print(f"  {nm}: series={len(series)}")

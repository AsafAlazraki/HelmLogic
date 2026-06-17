#!/usr/bin/env python3
"""Hotfix — repair the Highfield console -> seat pairing across every model.

Bug discovered prod 2026-06-16. Multiple Highfield console features point
their associatedSeatId at the white/wood-dark (wwd) variant of the seat
regardless of which colourway the console itself is in. When the operator
picks a non-WWD console, the WWD seat is filtered out by the variant-compat
gate in highfield-quote-flow.tsx (associatedSkus check) and the Seats
category renders empty.

Fix: for every model, walk every console feature, derive its colour
suffix from the feature id ('feat-...-{colour}'), and point
associatedSeatId at the matching-colour seat. If no matching-colour seat
exists, keep whatever was there (and the new code-side fallback in
lockedSeatId will resolve via name-prefix matching).

Idempotent. Re-running on already-correct data is a no-op.
"""
import requests
PROJECT = "studio-2290360004-3b963"
API_KEY = "AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY"
VENDOR = "LafOLpLb6QIFE856TiD4"  # Highfield

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
    if "arrayValue" in v: return [val(x) for x in v["arrayValue"].get("values", [])]
    if "mapValue" in v: return {k: val(x) for k, x in v["mapValue"].get("fields", {}).items()}
    return v

def encode(v):
    if isinstance(v, bool): return {"booleanValue": v}
    if isinstance(v, int): return {"integerValue": str(v)}
    if isinstance(v, float): return {"doubleValue": v}
    if v is None: return {"nullValue": None}
    if isinstance(v, str): return {"stringValue": v}
    if isinstance(v, list): return {"arrayValue": {"values": [encode(x) for x in v]}}
    if isinstance(v, dict): return {"mapValue": {"fields": {k: encode(x) for k, x in v.items()}}}
    return {"stringValue": str(v)}

# Walk every range under Highfield
ranges_resp = requests.get(f"{BASE}/data-warehouse/{VENDOR}/ranges", headers=H, timeout=20).json()
total_models = 0
total_consoles_fixed = 0

for rng in ranges_resp.get("documents", []):
    rid = rng["name"].rsplit("/", 1)[1]
    rname = val(rng.get("fields", {}).get("name", {})) or rid

    models_resp = requests.get(f"{BASE}/data-warehouse/{VENDOR}/ranges/{rid}/models", headers=H, timeout=20).json()
    for doc in models_resp.get("documents", []):
        mid = doc["name"].rsplit("/", 1)[1]
        f = {k: val(x) for k, x in doc.get("fields", {}).items()}
        code = f.get("modelCode", "?")
        total_models += 1

        optional = f.get("optionalFeatures") or []
        if not isinstance(optional, list): continue

        # Build a map: colour suffix -> seat id (for seats in this model)
        seats_by_colour = {}
        for feat in optional:
            if not isinstance(feat, dict): continue
            if feat.get("category") != "Seats": continue
            fid = feat.get("id", "")
            if "-" not in fid: continue
            suffix = fid.rsplit("-", 1)[-1].lower()
            seats_by_colour[suffix] = fid

        if not seats_by_colour:
            continue  # no seats configured, nothing to repair

        changed_here = 0
        for feat in optional:
            if not isinstance(feat, dict): continue
            if feat.get("category") != "Consoles": continue
            fid = feat.get("id", "")
            if "-" not in fid: continue
            suffix = fid.rsplit("-", 1)[-1].lower()
            target_seat = seats_by_colour.get(suffix)
            if not target_seat:
                continue  # no matching-colour seat; leave for code-side fallback
            if feat.get("associatedSeatId") == target_seat:
                continue
            old = feat.get("associatedSeatId")
            feat["associatedSeatId"] = target_seat
            print(f"  [{rname:>14s} / {code:>8s}] {fid:42s}  {str(old):35s}  ->  {target_seat}")
            changed_here += 1

        if changed_here > 0:
            url = f"{BASE}/data-warehouse/{VENDOR}/ranges/{rid}/models/{mid}?updateMask.fieldPaths=optionalFeatures"
            rsp = requests.patch(url, json={"fields": {"optionalFeatures": encode(optional)}}, headers=H, timeout=20)
            if rsp.status_code != 200:
                print(f"  !! FAILED to write {code}: {rsp.status_code} {rsp.text[:200]}")
            else:
                total_consoles_fixed += changed_here

print(f"\n=== Done ===")
print(f"  Models scanned: {total_models}")
print(f"  Consoles repaired: {total_consoles_fixed}")

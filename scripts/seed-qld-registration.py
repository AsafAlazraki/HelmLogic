#!/usr/bin/env python3
"""
Seed a realistic Queensland registration catalogue into the existing
rego-module infrastructure (moduleType 'rego' + Rego Authority vendor +
regoTypes), with length/ATM BAND RULES so it can auto-associate with
boats at scale.

QLD structure (indicative, editable in the Rego module):
  Boats (Maritime Safety Queensland) — annual fee by HULL LENGTH band.
  Trailers (TMR) — annual fee by ATM band (registration + traffic
  improvement fee; trailers don't carry CTP in QLD).

Creates:
  data-warehouse/qld-transport               (Rego Authority, state QLD)
  data-warehouse/qld-transport/regoTypes/*   (5 boat bands + 4 trailer bands)
  modules/qld-rego-module                     (moduleType 'rego')
  + adds module to the org's enabledModuleSubscriptions

Default DRY-RUN; --apply to write. Auth: anonymous idToken.
"""
import requests, sys

PROJECT = "studio-2290360004-3b963"
API_KEY = "AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY"
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
APPLY = "--apply" in sys.argv
VENDOR = "qld-transport"
MODULE = "qld-rego-module"
HIGHFIELD_MODULE = "M1Yf3R9igpJDxJnOVr6f"
# Org to subscribe (Northside Marine). Override with --org=<id>.
ORG = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--org=")), "AcFZVEFA5UDJG2hyetWT")

tok = requests.post(
    f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={API_KEY}",
    json={"returnSecureToken": True}, timeout=15).json()["idToken"]
H = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}

def to_fs(v):
    if isinstance(v, bool): return {"booleanValue": v}
    if isinstance(v, int): return {"integerValue": str(v)}
    if isinstance(v, float): return {"doubleValue": v}
    if isinstance(v, str): return {"stringValue": v}
    if isinstance(v, list): return {"arrayValue": {"values": [to_fs(x) for x in v]}}
    if isinstance(v, dict): return {"mapValue": {"fields": {k: to_fs(x) for k, x in v.items()}}}
    if v is None: return {"nullValue": None}
    raise ValueError(v)

def patch(path, data, arrayunion=None):
    if not APPLY: return "DRY"
    body = {"fields": {k: to_fs(v) for k, v in data.items()}}
    url = f"{BASE}/{path}"
    r = requests.patch(url, headers=H, json=body, timeout=25)
    return r.status_code

# ── QLD boat registration — by hull length band (annual) ─────────────
BOAT_BANDS = [
    ("Recreational Vessel — up to 4.5m",   122, 0.0,  4.5),
    ("Recreational Vessel — 4.5m to 8m",   163, 4.5,  8.0),
    ("Recreational Vessel — 8m to 10m",    245, 8.0,  10.0),
    ("Recreational Vessel — 10m to 15m",   408, 10.0, 15.0),
    ("Recreational Vessel — over 15m",     610, 15.0, 99.0),
]
# ── QLD trailer registration — by ATM band (annual; rego + TIF) ──────
TRAILER_BANDS = [
    ("Boat Trailer — up to 750kg ATM",      95, 0,    750),
    ("Boat Trailer — 751 to 1500kg ATM",   165, 751,  1500),
    ("Boat Trailer — 1501 to 2500kg ATM",  245, 1501, 2500),
    ("Boat Trailer — 2501 to 4500kg ATM",  335, 2501, 4500),
]

print(f"=== {'APPLY' if APPLY else 'DRY-RUN'} | org={ORG} ===\n")

# Vendor
patch(f"data-warehouse/{VENDOR}", {
    "name": "Queensland Transport (MSQ + TMR)", "slug": "qld-transport",
    "vendorType": "Rego Authority", "state": "QLD", "currency": "AUD",
    "description": "Maritime Safety Queensland (vessels) + TMR (trailers). Indicative QLD rates — edit in the Rego module.",
})
print(f"vendor {VENDOR}: Queensland Transport (MSQ + TMR)")

# Boat rego types
for name, fee, lo, hi in BOAT_BANDS:
    tid = "boat-" + name.lower().replace("recreational vessel — ", "").replace(" ", "-").replace(".", "")
    patch(f"data-warehouse/{VENDOR}/regoTypes/{tid}", {
        "name": name, "sellExclGst": fee, "appliesTo": "boat",
        "minLengthM": lo, "maxLengthM": hi, "isActive": True,
        "description": f"QLD recreational vessel registration (annual). Auto-applies to boats {lo}m–{hi}m hull length.",
    })
    print(f"  boat  [{lo:>4}-{hi:<4}m] ${fee:<4} {name}")

# Trailer rego types
for name, fee, lo, hi in TRAILER_BANDS:
    tid = "trailer-" + str(lo) + "-" + str(hi)
    patch(f"data-warehouse/{VENDOR}/regoTypes/{tid}", {
        "name": name, "sellExclGst": fee, "appliesTo": "trailer",
        "minAtmKg": lo, "maxAtmKg": hi, "isActive": True,
        "description": f"QLD trailer registration incl. traffic improvement fee (annual). Auto-applies to trailers {lo}–{hi}kg ATM. No CTP on trailers in QLD.",
    })
    print(f"  trail [{lo:>4}-{hi:<4}kg] ${fee:<4} {name}")

# Rego module
patch(f"modules/{MODULE}", {
    "name": "QLD Registration", "slug": "qld-registration", "moduleType": "rego",
    "regoVendorIds": [VENDOR], "associatedModuleIds": [HIGHFIELD_MODULE],
    "description": "Queensland boat + trailer registration. Auto-matches by boat length / trailer ATM.",
    "isActive": True,
})
print(f"\nmodule {MODULE}: QLD Registration (rego) -> vendor {VENDOR}, assoc Highfield")

# Subscribe org (so it shows on dashboard + is manageable)
if APPLY:
    # arrayUnion via REST transform isn't available on PATCH; read+merge.
    cur = requests.get(f"{BASE}/organisations/{ORG}", headers=H, timeout=20)
    subs = []
    if cur.status_code == 200:
        af = cur.json().get("fields", {}).get("enabledModuleSubscriptions", {}).get("arrayValue", {}).get("values", [])
        subs = [x.get("stringValue") for x in af if x.get("stringValue")]
    if MODULE not in subs:
        subs.append(MODULE)
    requests.patch(f"{BASE}/organisations/{ORG}?updateMask.fieldPaths=enabledModuleSubscriptions",
                   headers=H, json={"fields": {"enabledModuleSubscriptions": to_fs(subs)}}, timeout=20)
    print(f"org {ORG}: enabledModuleSubscriptions += {MODULE} (now {len(subs)} modules)")

if not APPLY:
    print("\n(no writes — re-run with --apply)")

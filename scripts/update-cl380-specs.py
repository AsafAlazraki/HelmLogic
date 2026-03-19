#!/usr/bin/env python3
"""
Update CL380 model in Firestore with real specs and standard features
sourced from highfieldboats.com (boatspecialists.com product listing).

Only updates: standardFeatures + specifications (preserves motorConfigurations if present).
"""

import json
import sys
import time
import requests

PROJECT_ID = "studio-2290360004-3b963"
API_KEY    = "AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY"
BASE       = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents"

VENDOR_ID = "LafOLpLb6QIFE856TiD4"
RANGE_ID  = "qo7IePnRzJxjrYyLWhTn"  # Classic range
MODEL_ID  = "cl380"

# ── Data sourced from highfieldboats.com / boatspecialists.com ────────────────

STANDARD_FEATURES = [
    "High tensile chromated & powder coated aluminium hull",
    "ORCA® Hypalon / Valmex® PVC tubes (material dependent on variant)",
    "Flush mount non-return valves",
    "3 independent air chambers",
    "Anti-slip EVA foam deck",
    "Bow locker (accommodates 6-gallon / 23L fuel tank)",
    "Self-draining cockpit",
    "Integrated transom supports",
    "Removable bench seat",
    "Lifting points and towing eyes",
    "Tow bridle points",
    "Heavy duty rubbing strake",
    "Full length keel guard",
    "Tank strap kit",
    "Padded under-seat bag",
    "Highfield dry bag",
    "Foot pump",
    "Oars",
    "Repair kit",
    "Bilge pump attachment point",
]

OTHER_SPECS = [
    {"id": "s-ol",  "label": "Overall Length",   "value": "3800mm / 12'6\""},
    {"id": "s-ob",  "label": "Overall Beam",      "value": "1700mm / 5'7\""},
    {"id": "s-il",  "label": "Internal Length",   "value": "2240mm / 7'4\""},
    {"id": "s-td",  "label": "Tube Diameter",     "value": "505mm / 17\""},
    {"id": "s-bld", "label": "Bow Locker Depth",  "value": "680mm / 2'2\""},
    {"id": "s-tw",  "label": "Transom Width",     "value": "1089mm / 3'6\""},
    {"id": "s-kh",  "label": "Keel Height",       "value": "560mm / 1'10\""},
    {"id": "s-dr",  "label": "Deadrise",          "value": "15°"},
    {"id": "s-dw",  "label": "Dry Weight",        "value": "119 kg / 262 lbs"},
    {"id": "s-mp",  "label": "Max Payload",       "value": "637 kg / 1404 lbs"},
    {"id": "s-pc",  "label": "Persons Capacity",  "value": "7"},
    {"id": "s-mhp", "label": "Max Power",         "value": "30 HP / 22.38 kW"},
    {"id": "s-rhp", "label": "Recommended Power", "value": "25 HP long shaft"},
    {"id": "s-ac",  "label": "Air Chambers",      "value": "3"},
    {"id": "s-sh",  "label": "Shaft Type",        "value": "Short shaft 440mm / 17\""},
    {"id": "s-hull","label": "Hull Material",     "value": "5-series marine grade aluminium alloy"},
]

MOTOR_CONFIGURATIONS = [
    {
        "type": "Single",
        "engines": [
            {
                "label": "Primary",
                "minHp": 15,
                "maxHp": 30,
                "recommendedHp": 25,
            }
        ]
    }
]


# ── Firestore helpers ─────────────────────────────────────────────────────────

def to_fs_val(val):
    if val is None:
        return {"nullValue": None}
    if isinstance(val, bool):
        return {"booleanValue": val}
    if isinstance(val, (int, float)):
        return {"doubleValue": float(val)}
    if isinstance(val, str):
        return {"stringValue": val}
    if isinstance(val, list):
        return {"arrayValue": {"values": [to_fs_val(v) for v in val]}}
    if isinstance(val, dict):
        return {"mapValue": {"fields": {k: to_fs_val(v) for k, v in val.items() if v is not None}}}
    return {"stringValue": str(val)}


def get_token():
    r = requests.post(
        f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={API_KEY}",
        json={"returnSecureToken": True}, timeout=15)
    r.raise_for_status()
    return r.json()["idToken"]


def patch_fields(path: str, token: str, fields_data: dict, mask_paths: list[str]):
    """PATCH specific fields only — other fields on the doc are preserved."""
    url = BASE + "/" + path
    mask_qs = "&".join(f"updateMask.fieldPaths={p}" for p in mask_paths)
    url = url + "?" + mask_qs
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    body = {"fields": {k: to_fs_val(v) for k, v in fields_data.items()}}
    for attempt in range(3):
        r = requests.patch(url, headers=headers, json=body, timeout=20)
        if r.status_code == 200:
            return True, r.json()
        elif r.status_code == 401:
            token = get_token()
            headers["Authorization"] = f"Bearer {token}"
        else:
            print(f"  [attempt {attempt+1}] HTTP {r.status_code}: {r.text[:200]}")
            if attempt < 2:
                time.sleep(2 ** attempt)
    return False, None


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    dry = "--dry-run" in sys.argv
    print(f"{'[DRY RUN] ' if dry else ''}Updating CL380 specs in Firestore...")

    model_path = f"data-warehouse/{VENDOR_ID}/ranges/{RANGE_ID}/models/{MODEL_ID}"

    update_data = {
        "standardFeatures": STANDARD_FEATURES,
        "specifications": {
            "otherSpecs": OTHER_SPECS,
            "motorConfigurations": MOTOR_CONFIGURATIONS,
        },
    }

    mask_paths = ["standardFeatures", "specifications"]

    if dry:
        print("\nWould update path:", model_path)
        print("standardFeatures:", json.dumps(STANDARD_FEATURES, indent=2))
        print("specifications.otherSpecs:", json.dumps(OTHER_SPECS, indent=2))
        print("specifications.motorConfigurations:", json.dumps(MOTOR_CONFIGURATIONS, indent=2))
        return

    token = get_token()
    ok, result = patch_fields(model_path, token, update_data, mask_paths)
    if ok:
        print(f"✓ Updated {model_path}")
        print(f"  standardFeatures: {len(STANDARD_FEATURES)} items")
        print(f"  otherSpecs: {len(OTHER_SPECS)} items")
        print(f"  motorConfigurations: {len(MOTOR_CONFIGURATIONS)} configuration(s)")
    else:
        print(f"✗ Failed to update {model_path}")
        sys.exit(1)


if __name__ == "__main__":
    main()

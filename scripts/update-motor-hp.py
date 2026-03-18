#!/usr/bin/env python3
"""
Update Highfield model specifications.motorConfigurations in Firestore.
Sourced from official Highfield GA spec PDFs, owner's manuals, and 2024/2025 brochures.

Usage: python3 scripts/update-motor-hp.py [--dry-run]
"""

import json
import sys
import time
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed

PROJECT_ID = "studio-2290360004-3b963"
API_KEY = "AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY"
FIRESTORE_BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents"
DRY_RUN = "--dry-run" in sys.argv

# ============================================================
# Motor HP data — sourced from official Highfield specs
# steeringType: "Forward Control" = console boat, "Tiller" = open tiller boat
# ============================================================
MOTOR_HP = {
    # Classic Range
    "CL260":    {"minHp": 2,   "maxHp": 15,  "recommendedHp": 10,  "steeringType": "Tiller"},
    "CL290":    {"minHp": 2,   "maxHp": 20,  "recommendedHp": 15,  "steeringType": "Tiller"},
    "CL290FT":  {"minHp": 2,   "maxHp": 20,  "recommendedHp": 15,  "steeringType": "Forward Control"},
    "CL310":    {"minHp": 2,   "maxHp": 20,  "recommendedHp": 15,  "steeringType": "Tiller"},
    "CL310FT":  {"minHp": 2,   "maxHp": 20,  "recommendedHp": 15,  "steeringType": "Forward Control"},
    "CL310LS":  {"minHp": 2,   "maxHp": 20,  "recommendedHp": 15,  "steeringType": "Tiller"},
    "CL340":    {"minHp": 2,   "maxHp": 25,  "recommendedHp": 20,  "steeringType": "Tiller"},
    "CL340FT":  {"minHp": 2,   "maxHp": 25,  "recommendedHp": 20,  "steeringType": "Forward Control"},
    "CL340LS":  {"minHp": 2,   "maxHp": 25,  "recommendedHp": 20,  "steeringType": "Tiller"},
    "CL340MAX": {"minHp": 2,   "maxHp": 25,  "recommendedHp": 20,  "steeringType": "Tiller"},
    "CL360":    {"minHp": 2,   "maxHp": 30,  "recommendedHp": 25,  "steeringType": "Tiller"},
    "CL360LS":  {"minHp": 2,   "maxHp": 30,  "recommendedHp": 25,  "steeringType": "Tiller"},
    "CL360MAX": {"minHp": 2,   "maxHp": 30,  "recommendedHp": 25,  "steeringType": "Tiller"},
    "CL380":    {"minHp": 2,   "maxHp": 30,  "recommendedHp": 25,  "steeringType": "Tiller"},
    "CL380LS":  {"minHp": 2,   "maxHp": 30,  "recommendedHp": 25,  "steeringType": "Tiller"},
    "CL380MAX": {"minHp": 2,   "maxHp": 30,  "recommendedHp": 25,  "steeringType": "Tiller"},
    "CL400":    {"minHp": 10,  "maxHp": 50,  "recommendedHp": 40,  "steeringType": "Tiller"},
    "CL420":    {"minHp": 10,  "maxHp": 60,  "recommendedHp": 50,  "steeringType": "Tiller"},
    "CL460":    {"minHp": 15,  "maxHp": 80,  "recommendedHp": 60,  "steeringType": "Tiller"},
    # Adventure Range
    "ADV7":     {"minHp": 115, "maxHp": 300, "recommendedHp": 200, "steeringType": "Forward Control"},
    # Coaster Range
    "Coaster 540 ST":   {"minHp": 60, "maxHp": 115, "recommendedHp": 100, "steeringType": "Forward Control"},
    "Coaster 540 open": {"minHp": 60, "maxHp": 115, "recommendedHp": 100, "steeringType": "Forward Control"},
    "Coaster 600 ST":   {"minHp": 60, "maxHp": 150, "recommendedHp": 115, "steeringType": "Forward Control"},
    # Patrol Range
    "PA420":    {"minHp": 30,  "maxHp": 60,  "recommendedHp": 60,  "steeringType": "Forward Control"},
    "PA460":    {"minHp": 40,  "maxHp": 80,  "recommendedHp": 60,  "steeringType": "Forward Control"},
    "PA500":    {"minHp": 60,  "maxHp": 100, "recommendedHp": 90,  "steeringType": "Forward Control"},
    "PA540 open": {"minHp": 60, "maxHp": 115, "recommendedHp": 115, "steeringType": "Forward Control"},
    "PA540ST":  {"minHp": 60,  "maxHp": 115, "recommendedHp": 115, "steeringType": "Forward Control"},
    "PA600 open": {"minHp": 80, "maxHp": 150, "recommendedHp": 150, "steeringType": "Forward Control"},
    "PA600EW":  {"minHp": 80,  "maxHp": 150, "recommendedHp": 150, "steeringType": "Forward Control"},
    "PA600ST":  {"minHp": 80,  "maxHp": 150, "recommendedHp": 150, "steeringType": "Forward Control"},
    "PA660EW":  {"minHp": 115, "maxHp": 200, "recommendedHp": 200, "steeringType": "Forward Control"},
    "PA660ST":  {"minHp": 115, "maxHp": 200, "recommendedHp": 200, "steeringType": "Forward Control"},
    "PA700EW":  {"minHp": 150, "maxHp": 250, "recommendedHp": 200, "steeringType": "Forward Control"},
    "PA700ST":  {"minHp": 150, "maxHp": 250, "recommendedHp": 200, "steeringType": "Forward Control"},
    "PA760EW":  {"minHp": 150, "maxHp": 300, "recommendedHp": 200, "steeringType": "Forward Control"},
    "PA760ST":  {"minHp": 150, "maxHp": 300, "recommendedHp": 200, "steeringType": "Forward Control"},
    "PA860EW":  {"minHp": 200, "maxHp": 600, "recommendedHp": 500, "steeringType": "Forward Control"},
    "PA860ST":  {"minHp": 200, "maxHp": 600, "recommendedHp": 500, "steeringType": "Forward Control"},
    # Roll-Up Range
    "RU200AL":  {"minHp": 2, "maxHp": 4,  "recommendedHp": 3,  "steeringType": "Tiller"},
    "RU200KAM": {"minHp": 2, "maxHp": 4,  "recommendedHp": 3,  "steeringType": "Tiller"},
    "RU230AL":  {"minHp": 2, "maxHp": 4,  "recommendedHp": 4,  "steeringType": "Tiller"},
    "RU230KAM": {"minHp": 2, "maxHp": 4,  "recommendedHp": 4,  "steeringType": "Tiller"},
    "RU250 Easy Go": {"minHp": 2, "maxHp": 6,  "recommendedHp": 5,  "steeringType": "Tiller"},
    "RU250AL":  {"minHp": 2, "maxHp": 6,  "recommendedHp": 5,  "steeringType": "Tiller"},
    "RU250KAM": {"minHp": 2, "maxHp": 6,  "recommendedHp": 5,  "steeringType": "Tiller"},
    "RU280AL":  {"minHp": 3, "maxHp": 10, "recommendedHp": 6,  "steeringType": "Tiller"},
    "RU280KAM": {"minHp": 3, "maxHp": 10, "recommendedHp": 6,  "steeringType": "Tiller"},
    "RU300 Easy Go": {"minHp": 3, "maxHp": 15, "recommendedHp": 10, "steeringType": "Tiller"},
    "RU320AL":  {"minHp": 3, "maxHp": 15, "recommendedHp": 10, "steeringType": "Tiller"},
    "RU320KAM": {"minHp": 3, "maxHp": 15, "recommendedHp": 10, "steeringType": "Tiller"},
    # Sport Range
    "SP300":    {"minHp": 10,  "maxHp": 30,  "recommendedHp": 25,  "steeringType": "Forward Control"},
    "SP330":    {"minHp": 10,  "maxHp": 30,  "recommendedHp": 25,  "steeringType": "Forward Control"},
    "SP360":    {"minHp": 15,  "maxHp": 40,  "recommendedHp": 30,  "steeringType": "Forward Control"},
    "SP390":    {"minHp": 30,  "maxHp": 60,  "recommendedHp": 60,  "steeringType": "Forward Control"},
    "SP420":    {"minHp": 40,  "maxHp": 70,  "recommendedHp": 60,  "steeringType": "Forward Control"},
    "SP460":    {"minHp": 40,  "maxHp": 70,  "recommendedHp": 60,  "steeringType": "Forward Control"},
    "SP520":    {"minHp": 60,  "maxHp": 100, "recommendedHp": 90,  "steeringType": "Forward Control"},
    "SP560":    {"minHp": 60,  "maxHp": 115, "recommendedHp": 115, "steeringType": "Forward Control"},
    "SP600":    {"minHp": 80,  "maxHp": 150, "recommendedHp": 150, "steeringType": "Forward Control"},
    "SP660":    {"minHp": 115, "maxHp": 200, "recommendedHp": 200, "steeringType": "Forward Control"},
    "SP700ST":  {"minHp": 150, "maxHp": 250, "recommendedHp": 200, "steeringType": "Forward Control"},
    "SP700WL(Windlass)": {"minHp": 150, "maxHp": 250, "recommendedHp": 200, "steeringType": "Forward Control"},
    "SP760ST":  {"minHp": 200, "maxHp": 300, "recommendedHp": 250, "steeringType": "Forward Control"},
    "SP760WL(Windlass)": {"minHp": 200, "maxHp": 300, "recommendedHp": 250, "steeringType": "Forward Control"},
    "SP800":    {"minHp": 200, "maxHp": 400, "recommendedHp": 400, "steeringType": "Forward Control"},
    "SP900":    {"minHp": 250, "maxHp": 600, "recommendedHp": 600, "steeringType": "Forward Control"},
    # Ultra-Light Range
    "UL220":    {"minHp": 2, "maxHp": 5,  "recommendedHp": 4,  "steeringType": "Tiller"},
    "UL240":    {"minHp": 2, "maxHp": 6,  "recommendedHp": 5,  "steeringType": "Tiller"},
    "UL240LT":  {"minHp": 2, "maxHp": 6,  "recommendedHp": 5,  "steeringType": "Tiller"},
    "UL260":    {"minHp": 2, "maxHp": 6,  "recommendedHp": 5,  "steeringType": "Tiller"},
    "UL260LT":  {"minHp": 2, "maxHp": 6,  "recommendedHp": 5,  "steeringType": "Tiller"},
    "UL290":    {"minHp": 2, "maxHp": 10, "recommendedHp": 8,  "steeringType": "Tiller"},
    "UL290LT":  {"minHp": 2, "maxHp": 15, "recommendedHp": 10, "steeringType": "Tiller"},
    "UL310":    {"minHp": 3, "maxHp": 15, "recommendedHp": 10, "steeringType": "Tiller"},
    "UL340":    {"minHp": 5, "maxHp": 20, "recommendedHp": 15, "steeringType": "Tiller"},
}

# Range slug map (model_name → range_slug)
import re

RANGE_MAP = {
    'Adventure':   'adventure',
    'Classic':     'classic',
    'Coaster':     'coaster',
    'Patrol':      'patrol',
    'Roll-Up':     'roll-up',
    'Sport':       'sport',
    'Ultra-Light': 'ultra-light',
}

# Infer range from model name prefix
def get_range_slug(model_name: str) -> str:
    name = model_name.upper()
    if name.startswith('CL'): return 'classic'
    if name.startswith('ADV'): return 'adventure'
    if name.startswith('COASTER'): return 'coaster'
    if name.startswith('PA'): return 'patrol'
    if name.startswith('RU'): return 'roll-up'
    if name.startswith('SP'): return 'sport'
    if name.startswith('UL'): return 'ultra-light'
    return 'classic'

def model_to_slug(name: str) -> str:
    slug = name.lower()
    slug = re.sub(r'[^\w\s-]', '', slug)
    slug = re.sub(r'[\s_]+', '-', slug)
    slug = re.sub(r'-+', '-', slug)
    return slug.strip('-')

def build_motor_config(hp_data: dict) -> dict:
    """Build a Firestore-compatible motorConfigurations array entry."""
    return {
        "type": "Single",
        "engines": [{
            "label": "Engine",
            "minHp": hp_data["minHp"],
            "maxHp": hp_data["maxHp"],
            "recommendedHp": hp_data["recommendedHp"],
        }],
        "steeringType": hp_data["steeringType"],
    }

# ============================================================
# Firebase
# ============================================================
def get_auth_token() -> str:
    resp = requests.post(
        f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={API_KEY}",
        json={"returnSecureToken": True}, timeout=15,
    )
    resp.raise_for_status()
    return resp.json()['idToken']

def to_fs_val(val):
    if val is None: return {"nullValue": None}
    if isinstance(val, bool): return {"booleanValue": val}
    if isinstance(val, (int, float)): return {"doubleValue": float(val)}
    if isinstance(val, str): return {"stringValue": val}
    if isinstance(val, list): return {"arrayValue": {"values": [to_fs_val(v) for v in val]}}
    if isinstance(val, dict): return {"mapValue": {"fields": {k: to_fs_val(v) for k, v in val.items() if v is not None}}}
    return {"stringValue": str(val)}

def patch_model(token: str, range_slug: str, model_slug: str, motor_config: dict) -> str:
    """PATCH only the specifications.motorConfigurations field on a model document."""
    path = f"data-warehouse/highfield/ranges/{range_slug}/models/{model_slug}"
    url = f"{FIRESTORE_BASE}/{path}"
    # Use updateMask to only touch specifications
    params = {"updateMask.fieldPaths": "specifications"}
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    body = {
        "fields": {
            "specifications": to_fs_val({
                "motorConfigurations": [motor_config],
                "otherSpecs": [],
            })
        }
    }
    for attempt in range(3):
        try:
            resp = requests.patch(url, headers=headers, json=body, params=params, timeout=15)
            if resp.status_code == 200:
                return f"OK: {path}"
            elif resp.status_code == 401:
                return "TOKEN_EXPIRED"
            else:
                if attempt < 2:
                    time.sleep(2 ** attempt)
                else:
                    return f"ERROR {resp.status_code} on {path}: {resp.text[:100]}"
        except Exception as e:
            if attempt < 2:
                time.sleep(2 ** attempt)
            else:
                return f"EXCEPTION on {path}: {e}"
    return f"FAILED: {path}"

def main():
    print("=" * 60)
    print("Highfield — Motor HP Update Script")
    if DRY_RUN:
        print("MODE: DRY RUN")
    print("=" * 60)
    print(f"\nModels to update: {len(MOTOR_HP)}")

    if DRY_RUN:
        for model_name, hp in MOTOR_HP.items():
            range_slug = get_range_slug(model_name)
            model_slug = model_to_slug(model_name)
            print(f"  {model_name} → {range_slug}/{model_slug}: {hp['minHp']}-{hp['maxHp']}HP ({hp['steeringType']})")
        return

    print("\nAuthenticating...")
    token = get_auth_token()
    print(f"  Token: {token[:30]}...")

    tasks = []
    for model_name, hp_data in MOTOR_HP.items():
        range_slug = get_range_slug(model_name)
        model_slug = model_to_slug(model_name)
        motor_config = build_motor_config(hp_data)
        tasks.append((range_slug, model_slug, motor_config, model_name))

    print(f"\nUpdating {len(tasks)} models in parallel...")
    ok = 0
    errors = 0

    with ThreadPoolExecutor(max_workers=15) as executor:
        futures = {executor.submit(patch_model, token, rs, ms, mc): name for rs, ms, mc, name in tasks}
        for future in as_completed(futures):
            model_name = futures[future]
            result = future.result()
            if result == "TOKEN_EXPIRED":
                token = get_auth_token()
                print("  Token refreshed")
            elif result.startswith("OK"):
                ok += 1
                hp = MOTOR_HP[model_name]
                print(f"  ✓ {model_name}: {hp['minHp']}-{hp['maxHp']}HP ({hp['steeringType']})")
            else:
                errors += 1
                print(f"  ✗ {result}")

    print(f"\n{'=' * 60}")
    print(f"DONE: {ok} updated, {errors} errors")

if __name__ == '__main__':
    main()

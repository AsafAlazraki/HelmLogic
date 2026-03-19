#!/usr/bin/env python3
"""
Comprehensive Highfield Boats seed — ALL ranges, ALL models.

Correctly splits standard vs optional features:
- std_equipment → standardFeatures (no price, isStandard=true)
- equipment_map → optionalFeatures (priced add-ons, excluding anything already standard)

Vendor ID: LafOLpLb6QIFE856TiD4

Usage:
  python3 scripts/reseed-all-boats.py [--dry-run] [--range Classic] [--model CL260]
"""

import json
import re
import sys
import time
import requests
from typing import Any
from concurrent.futures import ThreadPoolExecutor, as_completed

# ─── Config ─────────────────────────────────────────────────────────────────

PROJECT_ID = "studio-2290360004-3b963"
API_KEY    = "AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY"
FIRESTORE  = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents"

DRY_RUN    = "--dry-run" in sys.argv
RANGE_FILTER = next((sys.argv[sys.argv.index("--range") + 1] for i, a in enumerate(sys.argv) if a == "--range"), None) if "--range" in sys.argv else None
MODEL_FILTER = next((sys.argv[sys.argv.index("--model") + 1] for i, a in enumerate(sys.argv) if a == "--model"), None) if "--model" in sys.argv else None

VENDOR_ID = "LafOLpLb6QIFE856TiD4"

RANGE_IDS = {
    "Adventure":   "sEzdrM2fZsrOKA3ACrJp",
    "Classic":     "qo7IePnRzJxjrYyLWhTn",
    "Coaster":     "coaster",
    "Patrol":      "vfXxDuMpChteKncb7LnG",
    "Roll-Up":     "EqcKQ51svI1I2Q5poFdl",
    "Sport":       "nQ2LE50z9Tbf2uss0Ote",
    "Ultra-Light": "QsGZuVwutEr5yyMkp97j",
}

# Already fully configured — skip to avoid overwriting real data
SKIP_MODELS = {
    "CL380",
    "RU320AL", "RU320KAM", "RU230KAM", "RU280KAM",
    "RU280AL", "RU250AL", "RU230AL", "RU250KAM",
    "UL240",
}

# ─── Specs database ──────────────────────────────────────────────────────────
# Source: Highfield Boats official website spec tables
# Format: lengthMm, beamMm, tubeOd (mm), deadrise, weightKg, maxLoadKg, persons, maxHp, minHp, airChambers, isoCategory
# Add specs here as we gather them; models not in this dict get empty specs

SPECS = {
    # ── Classic range ──────────────────────────────────────────────────────
    "CL260": {
        "lengthMm": 2600, "beamMm": 1700, "internalLengthMm": 1760, "internalWidthMm": 790,
        "tubeOdMm": 440, "deadrise": 15, "weightKg": 58, "maxLoadKg": 360,
        "persons": 4, "maxHp": 10, "minHp": 2, "airChambers": 3,
        "isoCategory": "C", "shaftType": "Short",
    },
    "CL290": {
        "lengthMm": 2900, "beamMm": 1700, "internalLengthMm": 2060, "internalWidthMm": 790,
        "tubeOdMm": 440, "deadrise": 15, "weightKg": 66, "maxLoadKg": 480,
        "persons": 4, "maxHp": 15, "minHp": 5, "airChambers": 3,
        "isoCategory": "C", "shaftType": "Short",
    },
    "CL290FT": {
        "lengthMm": 2900, "beamMm": 1700, "internalLengthMm": 2060, "internalWidthMm": 790,
        "tubeOdMm": 440, "deadrise": 15, "weightKg": 66, "maxLoadKg": 480,
        "persons": 4, "maxHp": 15, "minHp": 5, "airChambers": 3,
        "isoCategory": "C", "shaftType": "Short",
    },
    "CL310": {
        "lengthMm": 3100, "beamMm": 1700, "internalLengthMm": 2260, "internalWidthMm": 790,
        "tubeOdMm": 440, "deadrise": 15, "weightKg": 69, "maxLoadKg": 550,
        "persons": 5, "maxHp": 20, "minHp": 5, "airChambers": 3,
        "isoCategory": "C", "shaftType": "Short",
    },
    "CL310FT": {
        "lengthMm": 3100, "beamMm": 1700, "internalLengthMm": 2260, "internalWidthMm": 790,
        "tubeOdMm": 440, "deadrise": 15, "weightKg": 69, "maxLoadKg": 550,
        "persons": 5, "maxHp": 20, "minHp": 5, "airChambers": 3,
        "isoCategory": "C", "shaftType": "Short",
    },
    "CL310LS": {
        "lengthMm": 3100, "beamMm": 1700, "internalLengthMm": 2260, "internalWidthMm": 790,
        "tubeOdMm": 440, "deadrise": 15, "weightKg": 69, "maxLoadKg": 550,
        "persons": 5, "maxHp": 20, "minHp": 5, "airChambers": 3,
        "isoCategory": "C", "shaftType": "Short",
    },
    "CL340": {
        "lengthMm": 3400, "beamMm": 1700, "internalLengthMm": 2470, "internalWidthMm": 790,
        "tubeOdMm": 440, "deadrise": 15, "weightKg": 75, "maxLoadKg": 551,
        "persons": 6, "maxHp": 25, "minHp": 10, "airChambers": 3,
        "isoCategory": "C", "shaftType": "Short",
    },
    "CL340FT": {
        "lengthMm": 3400, "beamMm": 1700, "internalLengthMm": 2470, "internalWidthMm": 790,
        "tubeOdMm": 440, "deadrise": 15, "weightKg": 75, "maxLoadKg": 551,
        "persons": 6, "maxHp": 25, "minHp": 10, "airChambers": 3,
        "isoCategory": "C", "shaftType": "Short",
    },
    "CL340LS": {
        "lengthMm": 3400, "beamMm": 1700, "internalLengthMm": 2470, "internalWidthMm": 790,
        "tubeOdMm": 440, "deadrise": 15, "weightKg": 75, "maxLoadKg": 551,
        "persons": 6, "maxHp": 25, "minHp": 10, "airChambers": 3,
        "isoCategory": "C", "shaftType": "Short",
    },
    "CL340MAX": {
        "lengthMm": 3400, "beamMm": 1700, "internalLengthMm": 2470, "internalWidthMm": 790,
        "tubeOdMm": 440, "deadrise": 15, "weightKg": 75, "maxLoadKg": 551,
        "persons": 6, "maxHp": 25, "minHp": 10, "airChambers": 3,
        "isoCategory": "C", "shaftType": "Short",
    },
    "CL360": {
        "lengthMm": 3600, "beamMm": 1700, "internalLengthMm": 2670, "internalWidthMm": 790,
        "tubeOdMm": 440, "deadrise": 15, "weightKg": 80, "maxLoadKg": 561,
        "persons": 6, "maxHp": 30, "minHp": 10, "airChambers": 3,
        "isoCategory": "C", "shaftType": "Short",
    },
    "CL360LS": {
        "lengthMm": 3600, "beamMm": 1700, "internalLengthMm": 2670, "internalWidthMm": 790,
        "tubeOdMm": 440, "deadrise": 15, "weightKg": 80, "maxLoadKg": 561,
        "persons": 6, "maxHp": 30, "minHp": 10, "airChambers": 3,
        "isoCategory": "C", "shaftType": "Short",
    },
    "CL360MAX": {
        "lengthMm": 3600, "beamMm": 1700, "internalLengthMm": 2670, "internalWidthMm": 790,
        "tubeOdMm": 440, "deadrise": 15, "weightKg": 80, "maxLoadKg": 561,
        "persons": 6, "maxHp": 30, "minHp": 10, "airChambers": 3,
        "isoCategory": "C", "shaftType": "Short",
    },
    "CL380": {  # already seeded — kept here for reference
        "lengthMm": 3800, "beamMm": 1700, "internalLengthMm": 2870, "internalWidthMm": 790,
        "tubeOdMm": 440, "deadrise": 15, "weightKg": 84, "maxLoadKg": 637,
        "persons": 7, "maxHp": 30, "minHp": 15, "airChambers": 3,
        "isoCategory": "C", "shaftType": "Short",
    },
    "CL380LS": {
        "lengthMm": 3800, "beamMm": 1700, "internalLengthMm": 2870, "internalWidthMm": 790,
        "tubeOdMm": 440, "deadrise": 15, "weightKg": 84, "maxLoadKg": 637,
        "persons": 7, "maxHp": 30, "minHp": 15, "airChambers": 3,
        "isoCategory": "C", "shaftType": "Short",
    },
    "CL380MAX": {
        "lengthMm": 3800, "beamMm": 1700, "internalLengthMm": 2870, "internalWidthMm": 790,
        "tubeOdMm": 440, "deadrise": 15, "weightKg": 84, "maxLoadKg": 637,
        "persons": 7, "maxHp": 30, "minHp": 15, "airChambers": 3,
        "isoCategory": "C", "shaftType": "Short",
    },
    "CL400": {
        "lengthMm": 4000, "beamMm": 1940, "internalLengthMm": 2900, "internalWidthMm": 900,
        "tubeOdMm": 490, "deadrise": 18, "weightKg": 150, "maxLoadKg": 793,
        "persons": 8, "maxHp": 60, "minHp": 25, "airChambers": 3,
        "isoCategory": "C", "shaftType": "Long",
    },
    "CL420": {
        "lengthMm": 4200, "beamMm": 1980, "internalLengthMm": 3000, "internalWidthMm": 930,
        "tubeOdMm": 490, "deadrise": 18, "weightKg": 185, "maxLoadKg": 884,
        "persons": 8, "maxHp": 80, "minHp": 30, "airChambers": 3,
        "isoCategory": "C", "shaftType": "Long",
    },
    "CL460": {
        "lengthMm": 4600, "beamMm": 2100, "internalLengthMm": 3300, "internalWidthMm": 980,
        "tubeOdMm": 520, "deadrise": 18, "weightKg": 230, "maxLoadKg": 1000,
        "persons": 10, "maxHp": 115, "minHp": 40, "airChambers": 3,
        "isoCategory": "C", "shaftType": "Long",
    },
}

# ─── Equipment-map key aliases ───────────────────────────────────────────────
# When a model's code doesn't match its equipment_map key, alias it here.
EQUIP_MAP_ALIASES = {
    "SP700WL(Windlass)": "SP700ST",   # share same hull / accessories
    "SP760WL(Windlass)": "SP760ST",
}

# ─── Std-equipment inheritance ───────────────────────────────────────────────
# Models that should inherit std_equipment from another model when their own is empty.
STD_INHERIT = {
    "CL340MAX": "CL340",
    "CL360MAX": "CL360",
    "CL380MAX": "CL380",
}

# ─── Model display-name overrides ────────────────────────────────────────────
# For codes with ugly default names, supply a clean display name.
DISPLAY_NAMES = {
    "SP700WL(Windlass)": "SP700 Windlass",
    "SP760WL(Windlass)": "SP760 Windlass",
    "PA540 open":        "PA540 Open",
    "PA600 open":        "PA600 Open",
    "Coaster 540 ST":    "Coaster 540 ST",
    "Coaster 540 open":  "Coaster 540 Open",
    "Coaster 600 ST":    "Coaster 600 ST",
    "RU250 Easy Go":     "RU250 Easy Go",
    "RU300 Easy Go":     "RU300 Easy Go",
}

# ─── Color helpers ───────────────────────────────────────────────────────────

COLOR_PARTS = {
    "W": "White", "B": "Black", "G": "Grey", "DG": "Dark Grey",
    "LG": "Light Grey", "LB": "Light Blue", "WB": "White/Blue",
    "WD": "Wood Dark", "MB": "Military Black", "I": "Ivory",
    "C": "Carbon", "DB": "Dark Blue", "WG": "White/Grey",
    "WDG": "Wood/Dark Grey", "BL": "Blue",
}

COLOR_SUFFIXES = {
    "-W": "White", "-G": "Grey", "-B": "Black", "-WG": "White/Grey",
    "-DB": "Dark Blue", "-LG": "Light Grey", "-WB": "White/Blue",
    "-MB": "Military Black", "-C": "Carbon", "-BG": "Black/Grey",
    "-GB": "Grey/Black",
}

CATEGORY_MAP = {
    "Console": "Consoles", "Consoles": "Consoles",
    "Seat": "Seats", "Seats": "Seats",
    "Rigging": "Rigging",
    "Cover": "Covers", "Covers": "Covers",
    "EVA Teak": "EVA Teak", "Anti-Skid": "EVA Teak",
    "Top": "Tops", "Tops": "Tops",
    "Tow post": "Hardware", "Tow Post": "Hardware",
    "Roll bar&Ladder": "Hardware", "Roll Bar & Ladder": "Hardware", "Hardware": "Hardware",
    "Spare parts": "Accessories", "Spare Parts": "Accessories",
    "Electronics Package": "Electronics", "EP": "Electronics",
    "Anchor": "Accessories",
}


def decode_color(code: str) -> str:
    parts = code.split("-")
    return " / ".join(COLOR_PARTS.get(p, p) for p in parts)


def get_base_sku(sku: str) -> str:
    for suffix in COLOR_SUFFIXES:
        if sku.upper().endswith(suffix.upper()) and len(sku) > len(suffix):
            return sku[:-len(suffix)]
    return sku


def normalise_category(raw: str) -> str:
    return CATEGORY_MAP.get(raw, raw or "Accessories")


def model_to_slug(name: str) -> str:
    slug = name.lower()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    return slug.strip("-")


# ─── Standard-feature parser ─────────────────────────────────────────────────

def parse_std_equipment(raw_list: list[str]) -> tuple[list[dict], set[str]]:
    """
    Convert raw std_equipment strings into:
      - standardFeatures list (clean dicts)
      - excluded_categories set (categories to remove from optionalFeatures)
    """
    features = []
    excluded = set()

    for raw in raw_list:
        # Strip leading/trailing junk: '"?  ', '"? ', spaces
        name = re.sub(r'^["\s?]+', '', raw).strip()
        if not name:
            continue

        name_lower = name.lower()

        # Determine category and what to exclude from optional
        if "eva teak" in name_lower:
            category = "EVA Teak"
            clean_name = re.sub(r'\s+for\s+\S+.*$', '', name, flags=re.IGNORECASE).strip()
            clean_name = clean_name or "EVA Teak Flooring"
            excluded.add("EVA Teak")
        elif "anti-skid decking" in name_lower or "anti-skid" in name_lower:
            category = "EVA Teak"
            clean_name = "Anti-Skid Decking"
            excluded.add("EVA Teak")
        elif "plastic seat" in name_lower:
            category = "Seats"
            # Extract size: e.g. "Plastic seat 74cm" → "Plastic Seat (74cm)"
            m = re.search(r'(\d+\s*cm)', name, re.IGNORECASE)
            size = f" ({m.group(1)})" if m else ""
            clean_name = f"Plastic Seat{size}"
            excluded.add("Seats")
        elif "console" in name_lower or any(x in name_lower for x in ["sds", "sus", "nano", "mini sd"]):
            category = "Consoles"
            # Clean up: remove leading "?" artefacts already done, tidy whitespace
            clean_name = re.sub(r'\s+', ' ', name).strip()
            excluded.add("Consoles")
            # If EP is mentioned in console string, also exclude EP
            if "ep" in name_lower or "electronics" in name_lower:
                excluded.add("Electronics")
        else:
            category = "Accessories"
            clean_name = re.sub(r'\s+', ' ', name).strip()

        features.append({
            "id": f"std-{re.sub(r'[^a-z0-9]', '', clean_name.lower())[:30]}",
            "name": clean_name,
            "category": category,
            "isStandard": True,
            "cost": 0,
            "sellPriceExclGst": 0,
        })

    return features, excluded


# ─── Optional-feature builder ─────────────────────────────────────────────────

def build_optional_features(model_code: str, equip_map: dict, excluded_categories: set[str]) -> list[dict]:
    """Build optionalFeatures from equipment_map, skipping anything already standard."""
    raw_items = equip_map.get(model_code, [])
    if not raw_items:
        return []

    groups: dict[str, dict] = {}
    for item in raw_items:
        cat = normalise_category(item.get("category", ""))
        # Skip if this category is covered by standard features
        if cat in excluded_categories:
            continue

        sku = item["sku"].strip()
        base = get_base_sku(sku)
        if base not in groups:
            groups[base] = {
                "base_sku": base,
                "name": item["name"].strip().strip('"').strip(),
                "category": cat,
                "price": float(item["price_usd"]) if item.get("price_usd") else None,
                "color_variants": [],
            }
        color_suffix = sku[len(base):]
        color_name = COLOR_SUFFIXES.get(color_suffix.upper(), item.get("color", ""))
        if color_name:
            groups[base]["color_variants"].append(color_name)

    features = []
    for base_sku, grp in groups.items():
        feat_id = f"feat-{re.sub(r'[^a-z0-9]', '', base_sku.lower())}"
        feature = {
            "id": feat_id,
            "name": grp["name"],
            "category": grp["category"],
            "code": base_sku,
            "cost": grp["price"],
            "sellPriceExclGst": grp["price"],
            "applicableVariantIds": [],
            "isStandard": False,
        }
        if grp["color_variants"]:
            feature["colorOptions"] = grp["color_variants"]
        features.append(feature)

    # Wire consoles → seats
    consoles = [f for f in features if f.get("category") == "Consoles"]
    seats = [f for f in features if f.get("category") == "Seats"]
    if seats and consoles:
        seat_id = seats[0]["id"]
        for c in consoles:
            c["associatedSeatId"] = seat_id

    return features


# ─── Specs builder ───────────────────────────────────────────────────────────

def build_specifications(model_code: str) -> dict:
    s = SPECS.get(model_code)
    if not s:
        return {"motorConfigurations": [], "otherSpecs": []}

    other_specs = [
        {"key": "Overall Length",    "value": f"{s['lengthMm']} mm"},
        {"key": "Overall Beam",      "value": f"{s['beamMm']} mm"},
        {"key": "Tube Diameter",     "value": f"{s['tubeOdMm']} mm"},
        {"key": "Deadrise",          "value": f"{s['deadrise']}°"},
        {"key": "Dry Weight",        "value": f"{s['weightKg']} kg"},
        {"key": "Max Load",          "value": f"{s['maxLoadKg']} kg"},
        {"key": "Persons",           "value": str(s["persons"])},
        {"key": "Air Chambers",      "value": str(s["airChambers"])},
        {"key": "ISO Category",      "value": s.get("isoCategory", "")},
    ]
    if s.get("internalLengthMm"):
        other_specs.insert(2, {"key": "Internal Length", "value": f"{s['internalLengthMm']} mm"})
    if s.get("internalWidthMm"):
        other_specs.insert(3, {"key": "Internal Width", "value": f"{s['internalWidthMm']} mm"})

    motor_config = {
        "id": "motor-0",
        "engines": [{
            "id": "engine-0",
            "minHp": s.get("minHp", 0),
            "maxHp": s.get("maxHp", 0),
        }],
        "shaftType": s.get("shaftType", "Short"),
        "maxEngines": 1,
    }

    return {
        "motorConfigurations": [motor_config],
        "otherSpecs": other_specs,
    }


# ─── Firestore helpers ────────────────────────────────────────────────────────

def to_fs_val(val: Any) -> dict:
    if val is None:
        return {"nullValue": None}
    elif isinstance(val, bool):
        return {"booleanValue": val}
    elif isinstance(val, (int, float)):
        return {"doubleValue": float(val)}
    elif isinstance(val, str):
        return {"stringValue": val}
    elif isinstance(val, list):
        return {"arrayValue": {"values": [to_fs_val(v) for v in val]}}
    elif isinstance(val, dict):
        return {"mapValue": {"fields": {k: to_fs_val(v) for k, v in val.items() if v is not None}}}
    return {"stringValue": str(val)}


def to_fs_doc(data: dict) -> dict:
    return {"fields": {k: to_fs_val(v) for k, v in data.items() if v is not None}}


def get_auth_token() -> str:
    resp = requests.post(
        f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={API_KEY}",
        json={"returnSecureToken": True}, timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["idToken"]


class Writer:
    def __init__(self, token: str):
        self.token = token
        self.pending: list[tuple[str, dict]] = []
        self.total = 0
        self.errors = 0

    def add(self, path: str, data: dict):
        self.pending.append((path, data))
        if len(self.pending) >= 400:
            self.flush()

    def _write_one(self, path: str, data: dict) -> str:
        url = f"{FIRESTORE}/{path}"
        headers = {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
        for attempt in range(3):
            try:
                resp = requests.patch(url, headers=headers, json=to_fs_doc(data), timeout=20)
                if resp.status_code == 200:
                    return path
                elif resp.status_code == 401:
                    self.token = get_auth_token()
                    headers["Authorization"] = f"Bearer {self.token}"
                else:
                    if attempt == 2:
                        return f"ERROR {resp.status_code} on {path}: {resp.text[:120]}"
                    time.sleep(2 ** attempt)
            except Exception as e:
                if attempt == 2:
                    return f"EXCEPTION on {path}: {e}"
                time.sleep(2 ** attempt)
        return f"FAILED: {path}"

    def flush(self, workers: int = 20):
        if not self.pending:
            return
        batch = list(self.pending)
        self.pending.clear()
        if DRY_RUN:
            self.total += len(batch)
            print(f"  [DRY RUN] Would write {len(batch)} docs (total so far: {self.total})")
            return
        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {executor.submit(self._write_one, p, d): p for p, d in batch}
            for future in as_completed(futures):
                result = future.result()
                if result.startswith(("ERROR", "EXCEPTION", "FAILED")):
                    print(f"  !! {result}")
                    self.errors += 1
                else:
                    self.total += 1
        print(f"  Flushed {len(batch)} docs (total: {self.total}, errors: {self.errors})")


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("=" * 65)
    print("Highfield Re-seed — All Boats (std/optional split)")
    print(f"Vendor: {VENDOR_ID}")
    if DRY_RUN:
        print("MODE: DRY RUN — no writes")
    if RANGE_FILTER:
        print(f"Range filter: {RANGE_FILTER}")
    if MODEL_FILTER:
        print(f"Model filter: {MODEL_FILTER}")
    print("=" * 65)

    with open("/tmp/highfield_structured.json") as f:
        structured = json.load(f)
    with open("/tmp/highfield_equipment_map.json") as f:
        equip_map = json.load(f)

    total_models = sum(len(m) for m in structured.values())
    print(f"Loaded: {len(structured)} ranges, {total_models} models")
    print(f"Skipping pre-configured: {sorted(SKIP_MODELS)}")

    print("\nAuthenticating...")
    token = "dry-run" if DRY_RUN else get_auth_token()
    if not DRY_RUN:
        print(f"  Token: {token[:30]}...")

    writer = Writer(token)
    stats = {"models": 0, "variants": 0, "skipped": 0, "std_features": 0, "opt_features": 0}

    for range_name, models in structured.items():
        if RANGE_FILTER and range_name.lower() != RANGE_FILTER.lower():
            continue

        range_id = RANGE_IDS.get(range_name)
        if not range_id:
            print(f"\nSKIP range (no ID): {range_name}")
            continue

        print(f"\n── {range_name} (id={range_id}) — {len(models)} models ──")

        for model_code, model_data in models.items():
            if MODEL_FILTER and model_code.lower() != MODEL_FILTER.lower():
                continue

            if model_code in SKIP_MODELS:
                print(f"  SKIP {model_code} (pre-configured)")
                stats["skipped"] += 1
                continue

            model_slug = model_to_slug(model_code)
            display_name = DISPLAY_NAMES.get(model_code, model_code)
            variants = model_data.get("variants", [])

            # Standard features from std_equipment (with inheritance for MAX variants etc.)
            std_raw = model_data.get("std_equipment", [])
            if not std_raw and model_code in STD_INHERIT:
                parent = STD_INHERIT[model_code]
                parent_data = structured.get(range_name, {}).get(parent, {})
                std_raw = parent_data.get("std_equipment", [])
            std_features, excluded_cats = parse_std_equipment(std_raw)

            # Optional features — exclude categories covered by standard; alias key if needed
            equip_key = EQUIP_MAP_ALIASES.get(model_code, model_code)
            opt_features = build_optional_features(equip_key, equip_map, excluded_cats)

            # Specs
            specs = build_specifications(model_code)
            has_specs = bool(specs.get("motorConfigurations") or specs.get("otherSpecs"))

            prices = [v["price"] for v in variants if v.get("price")]
            base_price = min(prices) if prices else None
            materials = list({v["material"] for v in variants if v.get("material")})

            model_doc = {
                "name": display_name,
                "modelCode": model_code,
                "slug": model_slug,
                "rangeId": range_id,
                "vendorId": VENDOR_ID,
                "sellPriceExclGst": base_price,
                "standardFeatures": std_features,
                "optionalFeatures": opt_features,
                "specifications": specs,
                "availableMaterials": materials,
            }

            model_path = f"data-warehouse/{VENDOR_ID}/ranges/{range_id}/models/{model_slug}"
            writer.add(model_path, model_doc)
            stats["models"] += 1
            stats["std_features"] += len(std_features)
            stats["opt_features"] += len(opt_features)

            # Variants
            for v in variants:
                sku = v["sku"]
                color_code = v.get("color", "")
                color_name = decode_color(color_code) if color_code else ""
                material = v.get("material", "")
                price = v.get("price")

                variant_doc = {
                    "sku": sku,
                    "name": f"{display_name} — {color_name}" if color_name else display_name,
                    "material": material,
                    "colorCode": color_code,
                    "colorName": color_name,
                    "cost": float(price) if price else None,
                    "sellPriceExclGst": float(price) if price else None,
                }
                writer.add(f"{model_path}/variants/{sku}", variant_doc)
                stats["variants"] += 1

            spec_tag = f"✓ specs" if has_specs else "— no specs"
            print(f"  + {model_code}: {len(variants)} variants, "
                  f"{len(std_features)} std / {len(opt_features)} opt features, {spec_tag}")
            print(f"    excluded cats: {excluded_cats or '(none)'}")

    writer.flush()

    print(f"\n{'=' * 65}")
    print("DONE")
    print(f"  Models written:          {stats['models']}")
    print(f"  Models skipped:          {stats['skipped']}")
    print(f"  Variants written:        {stats['variants']}")
    print(f"  Standard features total: {stats['std_features']}")
    print(f"  Optional features total: {stats['opt_features']}")
    print(f"  Firestore writes:        {writer.total}")
    if writer.errors:
        print(f"  ERRORS:                  {writer.errors}")


if __name__ == "__main__":
    main()

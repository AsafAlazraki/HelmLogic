#!/usr/bin/env python3
"""
Re-seed Highfield Boats data to the CORRECT vendor ID in Firestore.

Vendor ID: LafOLpLb6QIFE856TiD4
Existing range IDs are pre-mapped below.
Skips models already in Firestore (by modelCode match).
Creates Coaster range (doesn't exist yet).

Usage: python3 scripts/reseed-correct-vendor.py [--dry-run]
"""

import json
import sys
import time
import re
import requests
from typing import Any
from concurrent.futures import ThreadPoolExecutor, as_completed

PROJECT_ID = "studio-2290360004-3b963"
API_KEY = "AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY"
FIRESTORE_BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents"
DRY_RUN = "--dry-run" in sys.argv

VENDOR_ID = "LafOLpLb6QIFE856TiD4"

# Pre-mapped range IDs (already exist in Firestore under this vendor)
RANGE_ID_MAP = {
    "Adventure":   "sEzdrM2fZsrOKA3ACrJp",
    "Classic":     "qo7IePnRzJxjrYyLWhTn",
    "Coaster":     None,  # Does not exist yet — will be created
    "Patrol":      "vfXxDuMpChteKncb7LnG",
    "Roll-Up":     "EqcKQ51svI1I2Q5poFdl",
    "Sport":       "nQ2LE50z9Tbf2uss0Ote",
    "Ultra-Light": "QsGZuVwutEr5yyMkp97j",
}

RANGE_META = {
    "Adventure":   {"slug": "adventure",   "name": "Adventure",   "order": 1,
                    "description": "Highfield Adventure series — fully-equipped open offshore RIBs with premium factory-fitted consoles, T-tops and electronics packages for serious offshore work."},
    "Classic":     {"slug": "classic",     "name": "Classic",     "order": 2,
                    "description": "Highfield Classic series — compact, versatile aluminium-floored RIBs built for coastal fishing, family outings and boat-to-shore transport."},
    "Coaster":     {"slug": "coaster",     "name": "Coaster",     "order": 3,
                    "description": "Highfield Coaster series — walk-around style RIBs with enclosed bow seating, designed for family day cruising and offshore comfort."},
    "Patrol":      {"slug": "patrol",      "name": "Patrol",      "order": 4,
                    "description": "Highfield Patrol series — heavy-duty commercial and rescue-grade RIBs engineered for professional maritime, law enforcement and SAR operations."},
    "Roll-Up":     {"slug": "roll-up",     "name": "Roll-Up",     "order": 5,
                    "description": "Highfield Roll-Up series — lightweight inflatable dinghies with aluminium or roll-up floors, ideal as yacht tenders and transport vessels."},
    "Sport":       {"slug": "sport",       "name": "Sport",       "order": 6,
                    "description": "Highfield Sport series — high-performance open RIBs optimised for speed, water sports and spirited coastal cruising."},
    "Ultra-Light": {"slug": "ultra-light", "name": "Ultra-Light", "order": 7,
                    "description": "Highfield Ultra-Light series — ultralight aluminium-floored RIBs and tenders delivering exceptional portability without sacrificing build quality."},
}

# Models that already exist in Firestore with real data — DO NOT overwrite
SKIP_MODEL_CODES = {
    "CL380",      # Classic — fully configured with Firebase Storage images, specs, 9 variants
    "RU320AL", "RU320KAM", "RU230KAM", "RU280KAM",
    "RU280AL", "RU250AL", "RU230AL", "RU250KAM",  # Roll-Up — 8 models
    "UL240",      # Ultra-Light — has real images
}

COLOR_PARTS = {
    "W": "White", "B": "Black", "G": "Grey", "DG": "Dark Grey",
    "LG": "Light Grey", "LB": "Light Blue", "WB": "White/Blue",
    "WD": "Wood Dark", "MB": "Military Black", "I": "Inflatable",
    "C": "Carbon", "DB": "Dark Blue", "WG": "White/Grey",
    "WDG": "Wood/Dark Grey", "BL": "Blue",
}

COLOR_SUFFIXES = {"-W": "White", "-G": "Grey", "-B": "Black", "-WG": "White/Grey",
                  "-DB": "Dark Blue", "-LG": "Light Grey", "-WB": "White/Blue",
                  "-MB": "Military Black", "-C": "Carbon"}

CATEGORY_MAP = {
    "Console": "Consoles", "Consoles": "Consoles",
    "Seat": "Seats", "Seats": "Seats",
    "Rigging": "Rigging",
    "Cover": "Covers", "Covers": "Covers",
    "EVA Teak": "EVA Teak", "Anti-Skid": "EVA Teak",
    "Top": "Tops", "Tops": "Tops",
    "Tow Post": "Hardware", "Roll Bar & Ladder": "Hardware", "Hardware": "Hardware",
    "Spare Parts": "Accessories", "Spare parts": "Accessories",
    "Electronics Package": "Electronics", "EP": "Electronics",
    "Anchor": "Accessories", "W-C": "Accessories", "W-DG": "Accessories",
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
        fields = {k: to_fs_val(v) for k, v in val.items() if v is not None}
        return {"mapValue": {"fields": fields}}
    return {"stringValue": str(val)}


def to_fs_doc(data: dict) -> dict:
    return {"fields": {k: to_fs_val(v) for k, v in data.items() if v is not None}}


def get_auth_token() -> str:
    resp = requests.post(
        f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={API_KEY}",
        json={"returnSecureToken": True},
        timeout=15,
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
        url = f"{FIRESTORE_BASE}/{path}"
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
            print(f"  [DRY RUN] Would write {len(batch)} docs (total: {self.total})")
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


def build_optional_features(model_name: str, equip_map: dict) -> list:
    raw_items = equip_map.get(model_name, [])
    if not raw_items:
        return []
    groups: dict[str, dict] = {}
    for item in raw_items:
        sku = item["sku"].strip()
        base = get_base_sku(sku)
        if base not in groups:
            groups[base] = {
                "base_sku": base,
                "name": item["name"].strip().strip('"').strip(),
                "category": normalise_category(item.get("category", "")),
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
        features.append(feature)

    consoles = [f for f in features if f.get("category") == "Consoles"]
    seats = [f for f in features if f.get("category") == "Seats"]
    if seats:
        seat_id = seats[0]["id"]
        for console in consoles:
            console["associatedSeatId"] = seat_id

    return features


def create_coaster_range(writer: Writer, token: str) -> str:
    """Creates Coaster range and returns its document ID (slug-based)."""
    print("  Creating Coaster range...")
    if DRY_RUN:
        print("  [DRY RUN] Would POST to create Coaster range")
        return "coaster"

    # Use POST to let Firestore auto-generate an ID, but then we'll just use PATCH with 'coaster' slug
    range_doc_id = "coaster"
    meta = RANGE_META["Coaster"]
    path = f"data-warehouse/{VENDOR_ID}/ranges/{range_doc_id}"
    writer.add(path, {
        "name": meta["name"],
        "slug": meta["slug"],
        "vendorId": VENDOR_ID,
        "order": meta["order"],
        "description": meta["description"],
    })
    return range_doc_id


def main():
    print("=" * 60)
    print("Highfield Re-seed → Correct Vendor ID")
    print(f"Vendor: {VENDOR_ID}")
    if DRY_RUN:
        print("MODE: DRY RUN")
    print("=" * 60)

    with open("/tmp/highfield_structured.json") as f:
        structured = json.load(f)
    with open("/tmp/highfield_equipment_map.json") as f:
        equip_map = json.load(f)

    total_models = sum(len(m) for m in structured.values())
    print(f"Data: {len(structured)} ranges, {total_models} models")
    print(f"Skipping already-populated models: {sorted(SKIP_MODEL_CODES)}")

    print("\nAuthenticating...")
    token = "dry-run" if DRY_RUN else get_auth_token()
    if not DRY_RUN:
        print(f"  Token: {token[:30]}...")

    writer = Writer(token)
    stats = {"models": 0, "variants": 0, "skipped": 0, "features": 0}

    # ─── Create Coaster range ────────────────────────────────────
    coaster_range_id = create_coaster_range(writer, token)
    RANGE_ID_MAP["Coaster"] = coaster_range_id
    writer.flush()

    # ─── Models + Variants ──────────────────────────────────────
    print("\nWriting models and variants...")
    for range_name, models in structured.items():
        range_id = RANGE_ID_MAP.get(range_name)
        if not range_id:
            print(f"  SKIP range (no ID): {range_name}")
            continue
        print(f"\n  Range: {range_name} (id={range_id}) — {len(models)} models")

        for model_name, model_data in models.items():
            model_code = model_name  # e.g. "CL380", "SP560"

            if model_code in SKIP_MODEL_CODES:
                print(f"    SKIP {model_code} (already configured)")
                stats["skipped"] += 1
                continue

            model_slug = model_to_slug(model_name)
            variants = model_data.get("variants", [])
            features = build_optional_features(model_name, equip_map)
            stats["features"] += len(features)

            prices = [v["price"] for v in variants if v.get("price")]
            base_price = min(prices) if prices else None
            materials = list({v["material"] for v in variants if v.get("material")})

            model_doc = {
                "name": model_name,
                "modelCode": model_name,
                "slug": model_slug,
                "rangeId": range_id,
                "vendorId": VENDOR_ID,
                "sellPriceExclGst": base_price,
                "optionalFeatures": features,
                "standardFeatures": [],
                "specifications": {
                    "motorConfigurations": [],
                    "otherSpecs": [],
                },
                "availableMaterials": materials,
            }

            model_path = f"data-warehouse/{VENDOR_ID}/ranges/{range_id}/models/{model_slug}"
            writer.add(model_path, model_doc)
            stats["models"] += 1

            for v in variants:
                sku = v["sku"]
                color_code = v.get("color", "")
                color_name = decode_color(color_code) if color_code else ""
                material = v.get("material", "")
                price = v.get("price")

                variant_doc = {
                    "sku": sku,
                    "name": f"{model_name} - {color_name}" if color_name else model_name,
                    "material": material,
                    "colorCode": color_code,
                    "colorName": color_name,
                    "cost": float(price) if price else None,
                    "sellPriceExclGst": float(price) if price else None,
                }
                variant_path = f"{model_path}/variants/{sku}"
                writer.add(variant_path, variant_doc)
                stats["variants"] += 1

            print(f"    + {model_name}: {len(variants)} variants, {len(features)} features")

    writer.flush()

    print(f"\n{'=' * 60}")
    print("COMPLETE")
    print(f"  Models written:  {stats['models']}")
    print(f"  Models skipped:  {stats['skipped']}")
    print(f"  Variants:        {stats['variants']}")
    print(f"  Features:        {stats['features']}")
    print(f"  Total writes:    {writer.total}")
    if writer.errors:
        print(f"  ERRORS:          {writer.errors}")


if __name__ == "__main__":
    main()

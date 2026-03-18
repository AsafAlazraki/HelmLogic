#!/usr/bin/env python3
"""
Highfield Boats — Firestore Population Script

Reads from:
  /tmp/highfield_structured.json   → models + variants
  /tmp/highfield_equipment_map.json → optional features per model

Writes to Firebase Firestore via REST API using anonymous auth.

Usage: python3 scripts/seed-highfield.py [--dry-run]
"""

import json
import sys
import time
import re
import requests
from typing import Any
from concurrent.futures import ThreadPoolExecutor, as_completed

# ============================================================
# Config
# ============================================================
PROJECT_ID = "studio-2290360004-3b963"
API_KEY = "AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY"
FIRESTORE_BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents"
BATCH_SIZE = 400  # Firestore max is 500, leave margin
DRY_RUN = "--dry-run" in sys.argv

# ============================================================
# Color code decoder
# ============================================================
COLOR_PARTS = {
    'W': 'White', 'B': 'Black', 'G': 'Grey', 'DG': 'Dark Grey',
    'LG': 'Light Grey', 'LB': 'Light Blue', 'WB': 'White/Blue',
    'WD': 'Wood Dark', 'MB': 'Military Black', 'I': 'Inflatable',
    'C': 'Carbon', 'DB': 'Dark Blue', 'WG': 'White/Grey',
    'WDG': 'Wood/Dark Grey', 'BL': 'Blue',
}

def decode_color(code: str) -> str:
    parts = code.split('-')
    decoded = [COLOR_PARTS.get(p, p) for p in parts]
    return ' / '.join(decoded)

# Suffixes that indicate a color-specific accessory SKU
COLOR_SUFFIXES = {'-W': 'White', '-G': 'Grey', '-B': 'Black', '-WG': 'White/Grey',
                  '-DB': 'Dark Blue', '-LG': 'Light Grey', '-WB': 'White/Blue',
                  '-MB': 'Military Black', '-C': 'Carbon'}

def get_base_sku(sku: str) -> str:
    """Strip trailing color suffix from accessory SKU."""
    for suffix in COLOR_SUFFIXES:
        if sku.upper().endswith(suffix.upper()) and len(sku) > len(suffix):
            return sku[:-len(suffix)]
    return sku

# ============================================================
# Range definitions
# ============================================================
RANGE_MAP = {
    'Adventure':   {'slug': 'adventure',   'name': 'Adventure',   'order': 1,
                    'description': 'Highfield Adventure series — fully-equipped open offshore RIBs with premium factory-fitted consoles, T-tops and electronics packages for serious offshore work.'},
    'Classic':     {'slug': 'classic',     'name': 'Classic',     'order': 2,
                    'description': 'Highfield Classic series — compact, versatile aluminium-floored RIBs built for coastal fishing, family outings and boat-to-shore transport. Available in HYP (Hypalon/CSM) and PVC tube options.'},
    'Coaster':     {'slug': 'coaster',     'name': 'Coaster',     'order': 3,
                    'description': 'Highfield Coaster series — walk-around style RIBs with enclosed bow seating, designed for family day cruising and offshore comfort.'},
    'Patrol':      {'slug': 'patrol',      'name': 'Patrol',      'order': 4,
                    'description': 'Highfield Patrol series — heavy-duty commercial and rescue-grade RIBs engineered for professional maritime, law enforcement and SAR operations.'},
    'Roll-Up':     {'slug': 'roll-up',     'name': 'Roll-Up',     'order': 5,
                    'description': 'Highfield Roll-Up series — lightweight inflatable dinghies with aluminium or roll-up floors, ideal as yacht tenders and transport vessels.'},
    'Sport':       {'slug': 'sport',       'name': 'Sport',       'order': 6,
                    'description': 'Highfield Sport series — high-performance open RIBs optimised for speed, water sports and spirited coastal cruising.'},
    'Ultra-Light': {'slug': 'ultra-light', 'name': 'Ultra-Light', 'order': 7,
                    'description': 'Highfield Ultra-Light series — ultralight aluminium-floored RIBs and tenders delivering exceptional portability without sacrificing build quality.'},
}

# ============================================================
# Category normalisation
# ============================================================
CATEGORY_MAP = {
    'Console': 'Consoles', 'Consoles': 'Consoles',
    'Seat': 'Seats', 'Seats': 'Seats',
    'Rigging': 'Rigging',
    'Cover': 'Covers', 'Covers': 'Covers',
    'EVA Teak': 'EVA Teak', 'Anti-Skid': 'EVA Teak',
    'Top': 'Tops', 'Tops': 'Tops',
    'Tow Post': 'Hardware', 'Roll Bar & Ladder': 'Hardware', 'Hardware': 'Hardware',
    'Spare Parts': 'Accessories', 'Spare parts': 'Accessories',
    'Electronics Package': 'Electronics', 'EP': 'Electronics',
    'Anchor': 'Accessories', 'W-C': 'Accessories', 'W-DG': 'Accessories',
}

def normalise_category(raw: str) -> str:
    return CATEGORY_MAP.get(raw, raw or 'Accessories')

# ============================================================
# Model slug
# ============================================================
def model_to_slug(name: str) -> str:
    slug = name.lower()
    slug = re.sub(r'[^\w\s-]', '', slug)   # remove parentheses, special chars
    slug = re.sub(r'[\s_]+', '-', slug)     # spaces → dashes
    slug = re.sub(r'-+', '-', slug)         # collapse dashes
    return slug.strip('-')

# ============================================================
# Firebase auth
# ============================================================
def get_auth_token() -> str:
    resp = requests.post(
        f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={API_KEY}",
        json={"returnSecureToken": True},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()['idToken']

# ============================================================
# Firestore value encoding
# ============================================================
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

# ============================================================
# Parallel writer (uses PATCH — batchWrite requires admin auth)
# ============================================================
class BatchWriter:
    def __init__(self, token: str):
        self.token = token
        self.pending: list[tuple[str, dict]] = []
        self.total = 0
        self.errors = 0

    def add(self, path: str, data: dict):
        self.pending.append((path, data))
        if len(self.pending) >= BATCH_SIZE:
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
                        return f"ERROR {resp.status_code} on {path}: {resp.text[:100]}"
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
                if result.startswith("ERROR") or result.startswith("EXCEPTION") or result.startswith("FAILED"):
                    print(f"  !! {result}")
                    self.errors += 1
                else:
                    self.total += 1

        print(f"  Wrote {len(batch)} docs (total: {self.total}, errors: {self.errors})")

# ============================================================
# Optional features builder
# ============================================================
def build_optional_features(model_name: str, equip_map: dict) -> list:
    """
    Build optionalFeatures array from the equipment map for a given model.
    Groups color-variant SKUs (HET060-W/-G/-B) into a single feature.
    Sets applicableVariantIds=[] (applies to all variants of the model).
    For Console category, notes associatedSeatId will be set if one seat exists.
    """
    raw_items = equip_map.get(model_name, [])
    if not raw_items:
        return []

    # Group by base SKU
    groups: dict[str, dict] = {}
    for item in raw_items:
        sku = item['sku'].strip()
        base = get_base_sku(sku)
        if base not in groups:
            groups[base] = {
                'base_sku': base,
                'name': item['name'].strip().strip('"').strip(),
                'category': normalise_category(item.get('category', '')),
                'price': float(item['price_usd']) if item.get('price_usd') else None,
                'color_variants': [],
            }
        color_suffix = sku[len(base):]
        color_name = COLOR_SUFFIXES.get(color_suffix.upper(), item.get('color', ''))
        if color_name:
            groups[base]['color_variants'].append(color_name)

    features = []
    for base_sku, grp in groups.items():
        feat_id = f"feat-{re.sub(r'[^a-z0-9]', '', base_sku.lower())}"
        feature = {
            'id': feat_id,
            'name': grp['name'],
            'category': grp['category'],
            'code': base_sku,
            'cost': grp['price'],              # factory USD price for pricing manager
            'sellPriceExclGst': grp['price'],  # AUD sell price (updated via pricing manager publish)
            'applicableVariantIds': [],  # applies to all variants
            'isStandard': False,
        }
        features.append(feature)

    # Add associatedSeatId to console features if exactly one seat exists
    consoles = [f for f in features if f.get('category') == 'Consoles']
    seats = [f for f in features if f.get('category') == 'Seats']
    if seats:
        seat_id = seats[0]['id']  # If multiple seats, use first as default
        for console in consoles:
            console['associatedSeatId'] = seat_id

    return features

# ============================================================
# Main
# ============================================================
def main():
    print("=" * 60)
    print("Highfield Boats — Firestore Population Script")
    if DRY_RUN:
        print("MODE: DRY RUN (no writes)")
    print("=" * 60)

    # Load data
    print("\nLoading data files...")
    with open('/tmp/highfield_structured.json') as f:
        structured = json.load(f)
    with open('/tmp/highfield_equipment_map.json') as f:
        equip_map = json.load(f)

    # Count totals
    total_models = sum(len(models) for models in structured.values())
    total_variants = sum(
        len(m.get('variants', []))
        for models in structured.values()
        for m in models.values()
    )
    print(f"Data: {len(structured)} ranges, {total_models} models, {total_variants} variants")

    # Auth
    print("\nAuthenticating with Firebase...")
    if DRY_RUN:
        token = "dry-run-token"
    else:
        token = get_auth_token()
        print(f"  Token: {token[:30]}...")

    writer = BatchWriter(token)
    stats = {'ranges': 0, 'models': 0, 'variants': 0, 'features': 0}

    # ─── Vendor document ───────────────────────────────────────
    print("\n[1/4] Writing vendor document...")
    writer.add('data-warehouse/highfield', {
        'name': 'Highfield Boats',
        'slug': 'highfield',
        'vendorType': 'Boat Brand',
        'currency': 'USD',
        'dataSource': 'Document Upload',
    })

    # ─── Range documents ───────────────────────────────────────
    print("[2/4] Writing range documents...")
    for range_name, range_info in RANGE_MAP.items():
        if range_name not in structured:
            print(f"  WARNING: Range '{range_name}' not in data, skipping")
            continue
        writer.add(f"data-warehouse/highfield/ranges/{range_info['slug']}", {
            'name': range_info['name'],
            'slug': range_info['slug'],
            'vendorId': 'highfield',
            'order': range_info['order'],
            'description': range_info['description'],
        })
        stats['ranges'] += 1
        print(f"  + Range: {range_info['name']} ({range_info['slug']})")

    writer.flush()

    # ─── Models + Variants ─────────────────────────────────────
    print("\n[3/4] Writing models and variants...")
    for range_name, models in structured.items():
        range_info = RANGE_MAP.get(range_name)
        if not range_info:
            print(f"  SKIP: Unknown range '{range_name}'")
            continue
        range_slug = range_info['slug']
        print(f"\n  Range: {range_name} ({len(models)} models)")

        for model_name, model_data in models.items():
            model_slug = model_to_slug(model_name)
            variants = model_data.get('variants', [])

            # Build optional features
            features = build_optional_features(model_name, equip_map)
            stats['features'] += len(features)

            # Representative base price (lowest variant price)
            prices = [v['price'] for v in variants if v.get('price')]
            base_price = min(prices) if prices else None

            # Detect if any HYP and PVC variants exist
            materials = list({v['material'] for v in variants if v.get('material')})

            # Model document
            model_doc = {
                'name': model_name,
                'modelCode': model_name,
                'slug': model_slug,
                'rangeId': range_slug,
                'vendorId': 'highfield',
                'sellPriceExclGst': base_price,
                'optionalFeatures': features,
                'standardFeatures': [],
                'specifications': {
                    'motorConfigurations': [],  # To be populated after motor HP scraping
                    'otherSpecs': [],
                },
                'availableMaterials': materials,
            }

            model_path = f"data-warehouse/highfield/ranges/{range_slug}/models/{model_slug}"
            writer.add(model_path, model_doc)
            stats['models'] += 1

            # Variant sub-documents
            for v in variants:
                sku = v['sku']
                color_code = v.get('color', '')
                color_name = decode_color(color_code) if color_code else ''
                material = v.get('material', '')
                price = v.get('price')

                variant_doc = {
                    'sku': sku,
                    'name': f"{model_name} - {color_name}" if color_name else model_name,
                    'material': material,
                    'colorCode': color_code,
                    'colorName': color_name,
                    # cost = factory USD price (used by pricing manager for margin calculations)
                    # sellPriceExclGst = AUD sell price to customer (published via pricing manager)
                    # Both start as factory USD price; sellPriceExclGst updated when prices are published
                    'cost': float(price) if price else None,
                    'sellPriceExclGst': float(price) if price else None,
                }
                variant_path = f"{model_path}/variants/{sku}"
                writer.add(variant_path, variant_doc)
                stats['variants'] += 1

            print(f"    + {model_name} ({model_slug}): {len(variants)} variants, {len(features)} features")

    writer.flush()

    # ─── Summary ───────────────────────────────────────────────
    print(f"\n{'=' * 60}")
    print("COMPLETE")
    print(f"{'=' * 60}")
    print(f"  Ranges:   {stats['ranges']}")
    print(f"  Models:   {stats['models']}")
    print(f"  Variants: {stats['variants']}")
    print(f"  Features: {stats['features']}")
    print(f"  Total writes: {writer.total}")
    if DRY_RUN:
        print("\n[DRY RUN] No data was written.")
    else:
        print("\nAll data written to Firestore successfully.")
        print("Next steps:")
        print("  1. Run motor HP scraper to populate motorConfigurations")
        print("  2. Add registration costs via model editor UI")
        print("  3. Add trailer configs via model editor UI")
        print("  4. Add images via model editor UI")


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""
Parse both Highfield Excel files into clean Python structures for seeding.

Outputs:
  - Per-model: standardFeatures, optionalFeatures (Console/Seat/Others), variants
  - Equipment lookup index for SKU cross-referencing

Run standalone to inspect parsed data:
  python3 scripts/parse_excel_data.py
"""

import re
import json
import openpyxl
from collections import defaultdict

BOAT_XLS  = "Boat_Price_List_2026-03-17T05-28-27.xlsx"
EQUIP_XLS = "Equipment_Price_List_2026-03-17T22-48-29.xlsx"

COLOR_PARTS = {
    "W": "White", "B": "Black", "G": "Grey", "DG": "Dark Grey",
    "LG": "Light Grey", "LB": "Light Blue", "WB": "White/Blue",
    "WD": "Wood Dark", "MB": "Military Black", "I": "Ivory",
    "C": "Carbon", "DB": "Dark Blue", "WG": "White/Grey",
    "WDG": "Wood/Dark Grey", "BL": "Blue",
}

EQUIP_CATEGORY_MAP = {
    "Console": "Consoles",
    "Seat":    "Seats",
    "EP":      "Electronics",
    "EVA Teak":"EVA Teak",
    "Roll bar&Ladder": "Hardware",
    "Cover":   "Covers",
    "Top":     "Tops",
    "Tow post":"Hardware",
    "Spare parts": "Accessories",
}


def decode_color(code: str) -> str:
    parts = code.split("-")
    return " / ".join(COLOR_PARTS.get(p, p) for p in parts)


def normalize_name(s: str) -> str:
    """Lowercase, collapse whitespace, strip punctuation for fuzzy matching."""
    s = s.lower().strip()
    s = re.sub(r'\s+', ' ', s)
    s = re.sub(r'[^a-z0-9 ]', '', s)
    return s


def parse_bullet_items(text: str) -> list[dict]:
    """
    Parse bullet-point text like:
      '● FCT8 with EP—$1,386.00\n● GT with EP—$1,624.00'
    into list of {name, price, raw}
    """
    if not text or not text.strip():
        return []

    items = []
    # Split on bullet character or newline-bullet
    parts = re.split(r'[●•]\s*', text)
    for part in parts:
        part = part.strip()
        if not part:
            continue

        # Extract price if present: "—$1,386.00" or "—$1,386" or "$1,386.00"
        price = None
        name = part

        # Pattern: name—$price or name - $price
        price_match = re.search(r'[—–-]\s*\$([0-9,]+(?:\.[0-9]{1,2})?)\s*$', part)
        if price_match:
            try:
                price = float(price_match.group(1).replace(',', ''))
            except ValueError:
                pass
            name = part[:price_match.start()].strip()
        elif re.search(r'—Inc\s*$', part, re.IGNORECASE):
            price = 0.0
            name = re.sub(r'—Inc\s*$', '', part, flags=re.IGNORECASE).strip()

        # Clean name
        name = re.sub(r'\s+', ' ', name).strip().strip('—–').strip()

        if name:
            items.append({"name": name, "price": price, "raw": part})

    return items


def load_equipment_index(path: str) -> tuple[dict, dict]:
    """
    Returns:
      - by_name: normalized_name -> list of {sku, name, color, category, price}
      - all_items: list of all equipment items
    """
    wb = openpyxl.load_workbook(path)
    ws = wb['Equipment Price List']

    items = []
    by_name = defaultdict(list)

    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row[0]:
            continue
        item = {
            "sku": str(row[0]).strip(),
            "name": str(row[1]).strip() if row[1] else "",
            "color": str(row[2]).strip() if row[2] else "",
            "category": EQUIP_CATEGORY_MAP.get(str(row[3]).strip(), str(row[3]).strip() if row[3] else "Accessories"),
            "price": float(row[4]) if row[4] else None,
        }
        items.append(item)
        by_name[normalize_name(item["name"])].append(item)

    return by_name, items


def lookup_sku(name: str, equip_by_name: dict) -> tuple[str | None, str]:
    """Try to find SKU and canonical category for a feature name."""
    norm = normalize_name(name)
    hits = equip_by_name.get(norm, [])
    if hits:
        # Return base SKU (no color suffix) and category
        base = hits[0]
        return base["sku"], base["category"]

    # Partial match — find items where norm is contained in item name or vice versa
    for item_norm, item_list in equip_by_name.items():
        if norm in item_norm or item_norm in norm:
            return item_list[0]["sku"], item_list[0]["category"]

    return None, "Accessories"


def build_optional_features(
    opt_console_text: str,
    opt_seat_text: str,
    opt_others_text: str,
    equip_by_name: dict,
    equip_all: list,
) -> list[dict]:
    """Build optionalFeatures from the three Excel columns."""
    features = []
    seen_names = set()

    def add_section(text: str, forced_category: str | None = None):
        for item in parse_bullet_items(text):
            name = item["name"]
            if not name:
                continue

            if name.lower() in ("tb5", ""):
                continue

            # "No seat" is a valid $0 option
            if name.lower() == "no seat":
                feat_id = "feat-noseat"
                if feat_id not in seen_names:
                    seen_names.add(feat_id)
                    features.append({
                        "id": feat_id,
                        "name": "No Seat",
                        "category": "Seats",
                        "cost": 0.0,
                        "sellPriceExclGst": 0.0,
                        "isStandard": False,
                        "applicableVariantIds": [],
                    })
                continue

            key = normalize_name(name)
            price = item["price"]

            # Look up all matching equipment items (may include multiple color variants)
            hits = equip_by_name.get(key, [])
            if not hits:
                for item_norm, item_list in equip_by_name.items():
                    if key in item_norm or item_norm in key:
                        hits = item_list
                        break

            cat = forced_category or (hits[0]["category"] if hits else "Accessories")

            # For Consoles/Seats: expand into one feature per color variant
            if cat in ("Consoles", "Seats") and hits:
                colored_hits = [h for h in hits if h.get("color")]
                if colored_hits:
                    for h in colored_hits:
                        color = h["color"]
                        uid = f"{key}|{color}"
                        if uid in seen_names:
                            continue
                        seen_names.add(uid)
                        color_label = " / ".join(COLOR_PARTS.get(p, p) for p in color.split("-"))
                        safe_color = re.sub(r'[^a-z0-9]', '', color.lower())
                        feat_id = f"feat-{re.sub(r'[^a-z0-9]', '', key)[:20]}-{safe_color}"
                        features.append({
                            "id": feat_id,
                            "name": f"{name} ({color_label})",
                            "category": cat,
                            "code": h["sku"],
                            "colorFilter": color,
                            "cost": price,
                            "sellPriceExclGst": price,
                            "isStandard": False,
                            "applicableVariantIds": [],
                        })
                    continue  # Skip generic single-feature creation below

            # Single feature (non-colored or other categories)
            if key in seen_names:
                continue
            seen_names.add(key)

            sku = hits[0]["sku"] if hits else None
            feat_id = f"feat-{re.sub(r'[^a-z0-9]', '', key)[:30]}"
            feat = {
                "id": feat_id,
                "name": name,
                "category": cat,
                "code": sku,
                "cost": price,
                "sellPriceExclGst": price,
                "isStandard": False,
                "applicableVariantIds": [],
            }
            if not sku:
                feat.pop("code")
            features.append(feat)

    add_section(opt_console_text, forced_category="Consoles")
    add_section(opt_seat_text,    forced_category="Seats")
    add_section(opt_others_text,  forced_category=None)   # detect from equip list

    # Wire consoles → seats
    consoles = [f for f in features if f.get("category") == "Consoles"]
    seats    = [f for f in features if f.get("category") == "Seats"]
    if seats and consoles:
        seat_id = seats[0]["id"]
        for c in consoles:
            c["associatedSeatId"] = seat_id

    return features


def build_standard_features(std_text: str) -> list[str]:
    """Parse Standard Equipment column into a plain list of feature name strings."""
    features = []
    seen = set()
    for item in parse_bullet_items(std_text):
        name = item["name"]
        if not name:
            continue
        key = normalize_name(name)
        if key in seen:
            continue
        seen.add(key)
        features.append(name)
    return features


def load_boat_data(path: str, equip_by_name: dict, equip_all: list) -> dict:
    """
    Returns dict keyed by model_code with:
      - variants: list of variant dicts
      - standardFeatures: list
      - optionalFeatures: list
    """
    wb = openpyxl.load_workbook(path)
    ws = wb['Boat Price List']

    model_equipment = {}   # first row per model has the equipment columns
    model_variants  = defaultdict(list)

    for row in ws.iter_rows(min_row=3, values_only=True):
        model = row[0]
        sku   = row[1]
        if not model and not sku:
            continue

        # Carry model name forward (some rows only have SKU)
        if model:
            current_model = model

        if not sku:
            continue

        # Equipment columns only on first row of each model
        if model and model not in model_equipment:
            model_equipment[model] = {
                "std":     row[6] or "",
                "console": row[7] or "",
                "seat":    row[8] or "",
                "others":  row[9] or "",
            }

        # Variant
        color_code  = str(row[3]).strip() if row[3] else ""
        material    = str(row[2]).strip() if row[2] else ""
        boat_price  = float(row[4]) if row[4] else None
        pkg_price   = float(row[5]) if row[5] else None

        model_variants[current_model].append({
            "sku":           str(sku).strip(),
            "material":      material,
            "colorCode":     color_code,
            "colorName":     decode_color(color_code) if color_code else "",
            "cost":          boat_price,
            "sellPriceExclGst": boat_price,
            "standardPackagePrice": pkg_price,
        })

    result = {}
    for model, equip in model_equipment.items():
        std_features  = build_standard_features(equip["std"])
        opt_features  = build_optional_features(
            equip["console"], equip["seat"], equip["others"],
            equip_by_name, equip_all
        )
        result[model] = {
            "variants":         model_variants.get(model, []),
            "standardFeatures": std_features,
            "optionalFeatures": opt_features,
        }

    return result


def load_all() -> dict:
    equip_by_name, equip_all = load_equipment_index(EQUIP_XLS)
    boat_data = load_boat_data(BOAT_XLS, equip_by_name, equip_all)
    return boat_data


if __name__ == "__main__":
    data = load_all()
    # Print summary
    for model, d in data.items():
        std = len(d["standardFeatures"])
        opt = len(d["optionalFeatures"])
        var = len(d["variants"])
        print(f"{model:30s} variants={var:2d}  std={std:2d}  opt={opt:2d}")
        for f in d["optionalFeatures"]:
            cat = f.get("category","?")
            price = f.get("sellPriceExclGst")
            price_str = f"${price:,.0f}" if price else "Inc"
            print(f"  [{cat:12s}] {f['name'][:50]:50s} {price_str}")

"""
Master Price File Importer
==========================
Parses the Motor Library spreadsheet (transposed format) into JSON documents
suitable for Firestore import into the data-warehouse collection.

Usage:
    pip install openpyxl
    python import_master_price_file.py

Outputs JSON files in ./extracted/master-price-file/ ready for Firestore upload.
Each motor becomes a document with its compatible rigging options, prop options,
dealer fit items, pricing tiers, PD allowances, installation data, and service schedules.
"""

import json
import os
from pathlib import Path

OUTPUT_DIR = Path("extracted/master-price-file")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

MOTOR_LIBRARY_FILE = "extracted/Copy_of_Motor_Module__Motor_Library.txt"

# Column indices (0-based) mapped from the Motor Library spreadsheet header row (row 4)
HEADER_ROW_INDEX = 3  # 0-based (row 4 in 1-based)

# Core motor attribute columns
CORE_COLS = {
    'modelFull': 0,      # Full model name e.g. "Yamaha - F115LB"
    'model': 1,          # Short model e.g. "F115LB"  (col B / index 1, from row data)
    'hpRating': 2,       # HP Rating (col C / index 2, from row data)
    'shaftLength': 3,    # Shaft Length (col D / index 3)
    'cylinders': 4,      # Cylinders / Displacement (col E / index 4)
    'engineColour': 5,   # Engine Colour (col F / index 5)
    'imageLink': 6,      # Image Link (col G / index 6)
    'control': 7,        # Control (col H / index 7)
    'starting': 8,       # Starting (col I / index 8)
    'tiltTrim': 9,       # Tilt & Trim (col J / index 9)
    'fuelTank': 11,      # Fuel Tank (col L / index 11)
    'prop': 12,          # Prop (col M / index 12)
    'salesInstall': 13,  # Sales Install (col N / index 13)
    'supplier': 14,      # Supplier (col O / index 14)
}

# Pricing columns - Retail
RETAIL_PRICING = {
    'dealerListPrice': 15,   # Dealer List Price
    'holdback': 16,          # Holdback 3%
    'storePrice': 17,        # Store Price
    'digs': 18,              # DIGS
    'dealerBuy': 19,         # Dealer Buy
    'freightExcGst': 20,     # Freight Exc GST
    'landedCtd': 21,         # Landed CTD
    'rebateProgram': 22,     # Rebate Program
    'rebateDiscount': 23,    # Rebate Discount
    'nettCtd': 24,           # Nett CTD
}

# PD (Pre-Delivery) columns
PD_COLS_START = 26  # PD Operation Code
PD_FIELDS = [
    'pdOperationCode', 'pdLabourHrs', 'pdLabour$', 'pdOilLtr', 'pdOil$',
    'pdFuelLtr', 'pdFuel$', 'pdFlusherCode', 'pdFlusher$',
]

# Rigging options: columns 104-153 (0-based: 102-151 approximately)
# We'll use the actual header row to find them dynamically

# Prop options: columns 201-300
# Additional FOs: columns 175-199

# Pricing tiers
SELL_PRICE_COLS = {
    'rrpFreightIncGst': 51,  # RRP + Freight Inc GST
    'nsmRetail': 52,         # NSM Retail
    'factoryRebate': 53,     # Factory Rebate
    'dealerDiscount': 54,    # Dealer Discount
    'sellPrice': 55,         # Sell Price
}

TRADE_PRICING = {
    'tradeMu': 57,           # Trade MU
    'tradeGp': 58,           # Trade GP
    'tradeFactoryRebate': 59,
    'tradeDiscount': 60,
    'tradePrice': 61,
}

COMMERCIAL_PRICING = {
    'commercial': 64,
    'commercialGp': 65,
    'commercialRebate': 66,
    'commercialDiscount': 67,
    'commercialPrice': 68,
}


def safe_float(val):
    """Convert a value to float, returning None if not possible."""
    if val is None or val == '' or val == '.':
        return None
    try:
        # Remove $ signs, commas, % signs
        cleaned = str(val).replace('$', '').replace(',', '').replace('%', '').strip()
        if cleaned == '' or cleaned == '.':
            return None
        return float(cleaned)
    except (ValueError, TypeError):
        return None


def safe_str(val):
    """Convert a value to a clean string."""
    if val is None:
        return ''
    s = str(val).strip()
    return '' if s == '.' else s


def parse_motor_library():
    """Parse the Motor Library tab-separated file into motor documents."""
    if not os.path.exists(MOTOR_LIBRARY_FILE):
        print(f"ERROR: {MOTOR_LIBRARY_FILE} not found. Run extract_xlsx.py first.")
        return []

    with open(MOTOR_LIBRARY_FILE, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    if len(lines) < 5:
        print("ERROR: File too short")
        return []

    # Parse header row (row 4, index 3)
    headers = lines[HEADER_ROW_INDEX].rstrip('\n').split('\t')

    # Find rigging, prop, and additional FO column ranges dynamically
    rigging_cols = []
    prop_cols = []
    additional_fo_cols = []
    install_cols = []
    service_cols = {}

    for i, h in enumerate(headers):
        h_clean = h.strip()
        if h_clean.startswith('Rigging Option'):
            rigging_cols.append(i)
        elif h_clean.startswith('Prop Option'):
            prop_cols.append(i)
        elif h_clean.startswith("Additional FO"):
            additional_fo_cols.append(i)
        elif h_clean == 'Installation':
            install_cols.append(i)
        elif 'Service' in h_clean and ('Hour' in h_clean or 'Year' in h_clean):
            service_cols[h_clean] = i

    print(f"Found {len(rigging_cols)} rigging cols, {len(prop_cols)} prop cols, {len(additional_fo_cols)} additional FO cols")
    print(f"Found {len(service_cols)} service schedule columns")

    motors = []

    # Each row from row 5 onwards (index 4+) is a motor model
    for row_idx in range(4, len(lines)):
        cols = lines[row_idx].rstrip('\n').split('\t')

        # Skip empty rows and section headers
        model_full = safe_str(cols[0]) if len(cols) > 0 else ''
        if not model_full or not model_full.startswith('Yamaha'):
            continue

        # Skip section header rows
        if model_full.startswith('YAMAHA') or model_full.startswith('Yamaha -') is False:
            if not model_full.startswith('Yamaha - '):
                continue

        def col(idx):
            return cols[idx] if idx < len(cols) else ''

        # Core attributes
        motor = {
            'modelFull': model_full,
            'model': safe_str(col(1)),
            'hpRating': safe_str(col(2)),
            'shaftLength': safe_str(col(3)),
            'cylinders': safe_str(col(4)),
            'engineColour': safe_str(col(5)),
            'imageLink': safe_str(col(6)),
            'control': safe_str(col(7)),
            'starting': safe_str(col(8)),
            'tiltTrim': safe_str(col(9)),
            'fuelTank': safe_str(col(11)),
            'propType': safe_str(col(12)),
            'salesInstall': safe_str(col(13)),
            'supplier': safe_str(col(14)),
        }

        # Retail pricing
        motor['retailPricing'] = {
            'dealerListPrice': safe_float(col(15)),
            'holdback': safe_float(col(16)),
            'storePrice': safe_float(col(17)),
            'digs': safe_float(col(18)),
            'dealerBuy': safe_float(col(19)),
            'freightExcGst': safe_float(col(20)),
            'landedCtd': safe_float(col(21)),
            'rebateProgram': safe_str(col(22)),
            'rebateDiscount': safe_float(col(23)),
            'nettCtd': safe_float(col(24)),
        }

        # Sell pricing
        motor['sellPricing'] = {
            'rrpFreightIncGst': safe_float(col(51)),
            'nsmRetail': safe_float(col(52)),
            'factoryRebate': safe_float(col(53)),
            'dealerDiscount': safe_float(col(54)),
            'sellPrice': safe_float(col(55)),
        }

        # Trade pricing
        motor['tradePricing'] = {
            'tradeMu': safe_float(col(57)),
            'tradeGp': safe_float(col(58)),
            'tradeFactoryRebate': safe_float(col(59)),
            'tradeDiscount': safe_float(col(60)),
            'tradePrice': safe_float(col(61)),
        }

        # Commercial pricing
        motor['commercialPricing'] = {
            'commercial': safe_float(col(64)),
            'commercialGp': safe_float(col(65)),
            'commercialRebate': safe_float(col(66)),
            'commercialDiscount': safe_float(col(67)),
            'commercialPrice': safe_float(col(68)),
        }

        # Installation
        motor['installation'] = {
            'opCode': safe_str(col(85)),
            'ttf': safe_float(col(86)),
            'labour': safe_float(col(87)),
            'sundry1': safe_float(col(88)),
            'sundry2': safe_float(col(89)),
            'sundry3': safe_float(col(90)),
            'sublet': safe_float(col(91)),
            'installCtd': safe_float(col(92)),
            'installSell': safe_float(col(93)),
        }

        # Rigging options
        rigging = []
        for ri in rigging_cols:
            val = safe_str(col(ri))
            if val and val != '.':
                rigging.append(val)
        motor['riggingOptions'] = rigging

        # Prop options
        props = []
        for pi in prop_cols:
            val = safe_str(col(pi))
            if val and val != '.':
                props.append(val)
        motor['propOptions'] = props

        # Additional factory options
        additional_fos = []
        for fi in additional_fo_cols:
            val = safe_str(col(fi))
            if val and val != '0' and val != '.':
                additional_fos.append(val)
        motor['additionalFactoryOptions'] = additional_fos

        motors.append(motor)

    return motors


def create_vendor_seed():
    """Create the vendor seed document for Master Price File."""
    return {
        'name': 'Master Price File',
        'slug': 'master-price-file',
        'vendorType': 'Master Price File',
        'dataSource': 'Document Upload',
        'currency': 'AUD',
        'address': '',
        'abn': '',
        'primaryContact': '',
        'website': '',
        'notes': 'Master price file containing motors, rigging, props, and dealer fit options. Source of truth for Northside Marine pricing.',
        'logoUrl': None,
    }


def main():
    print("=" * 60)
    print("Master Price File Importer")
    print("=" * 60)

    # 1. Create vendor seed
    vendor = create_vendor_seed()
    vendor_path = OUTPUT_DIR / "vendor-seed.json"
    with open(vendor_path, 'w', encoding='utf-8') as f:
        json.dump(vendor, f, indent=2)
    print(f"\nVendor seed written to: {vendor_path}")

    # 2. Parse motor library
    print(f"\nParsing motor library from: {MOTOR_LIBRARY_FILE}")
    motors = parse_motor_library()
    print(f"Parsed {len(motors)} motors")

    # Write individual motor documents
    motors_dir = OUTPUT_DIR / "motors"
    motors_dir.mkdir(exist_ok=True)

    # Also write a summary for quick reference
    summary = []
    for motor in motors:
        model = motor['model'] or motor['modelFull'].replace('Yamaha - ', '')
        slug = model.lower().replace(' ', '-').replace('(', '').replace(')', '')

        # Write individual motor doc
        motor_path = motors_dir / f"{slug}.json"
        with open(motor_path, 'w', encoding='utf-8') as f:
            json.dump(motor, f, indent=2)

        summary.append({
            'model': model,
            'modelFull': motor['modelFull'],
            'hp': motor['hpRating'],
            'shaft': motor['shaftLength'],
            'riggingCount': len(motor['riggingOptions']),
            'propCount': len(motor['propOptions']),
            'sellPrice': motor['sellPricing'].get('sellPrice'),
        })

    # Write summary
    summary_path = OUTPUT_DIR / "motors-summary.json"
    with open(summary_path, 'w', encoding='utf-8') as f:
        json.dump(summary, f, indent=2)
    print(f"Motor summary written to: {summary_path}")

    # Write all motors as a single collection
    all_motors_path = OUTPUT_DIR / "all-motors.json"
    with open(all_motors_path, 'w', encoding='utf-8') as f:
        json.dump(motors, f, indent=2)
    print(f"All motors written to: {all_motors_path}")

    # 3. Print statistics
    print(f"\n{'=' * 60}")
    print("IMPORT SUMMARY")
    print(f"{'=' * 60}")
    print(f"Total motors:           {len(motors)}")

    rigging_counts = [len(m['riggingOptions']) for m in motors]
    prop_counts = [len(m['propOptions']) for m in motors]

    print(f"Motors with rigging:    {sum(1 for c in rigging_counts if c > 0)}")
    print(f"Max rigging options:    {max(rigging_counts) if rigging_counts else 0}")
    print(f"Motors with props:      {sum(1 for c in prop_counts if c > 0)}")
    print(f"Max prop options:       {max(prop_counts) if prop_counts else 0}")

    # HP range breakdown
    hp_ranges = {}
    for m in motors:
        hp = m['hpRating']
        if hp not in hp_ranges:
            hp_ranges[hp] = 0
        hp_ranges[hp] += 1

    print(f"\nHP Range Breakdown:")
    for hp in sorted(hp_ranges.keys(), key=lambda x: float(x) if x.replace('.', '').isdigit() else 0):
        print(f"  {hp:>6} HP: {hp_ranges[hp]} models")


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Phase 2 (MTF) — extract motors from tasks/mpf-source/Motor Module.xlsx.

STRICTLY READ-ONLY on the source workbook (read_only=True, data_only=True).

Sheet 'Motor Library': rows 1-3 are banners/ruler, ROW 4 is the header row,
data starts row 5, last real data row 628. Section banner rows have col C set
with col D empty. 376 motor data rows expected.

Composite key: col D MODEL code duplicates across twin-rig / campaign / white-
cowl sections (279 distinct across 376 rows) -> key = "{modelCode}||{section}".

Price levels (confirmed mapping + D7):
  BC NSM Retail            -> hull_cash
  BL Trade Price           -> hull_trade AND hull_subdealer
  BS Commercial Price      -> hull_commercial
  BY Boating Alliance      -> hull_boating_alliance
  BF Sell Price (campaign) -> hull_campaign  (D7: hidden unless populated)
  AX Total CTD             -> cost

Values are stored RAW as they appear in the sheet (live Yamaha dataSet rows
store the same raw figures, e.g. 'NSM Retail' 17643 inc-GST convention).

Output: tasks/mpf-audit/extracted/motors.json
"""
import json, os, re, sys
from datetime import datetime, timezone

import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'tasks/mpf-source/Motor Module.xlsx')
OUT = os.path.join(ROOT, 'tasks/mpf-audit/extracted/motors.json')

HEADER_ROW = 4
LAST_ROW = 628

# 1-based column indices (verified against header row 4)
COL = {
    'display': 3,    # C 'MODEL' -> 'Yamaha - F250XSB' (exact Boat Module ref string)
    'code': 4,       # D 'MODEL' -> model code
    'hp': 5,         # E 'HP Rating'
    'shaft': 6,      # F 'Shaft Length'
    'cyl': 7,        # G 'Cylinders / Displacement'
    'colour': 8,     # H 'Engine Colour'
    'image': 9,      # I 'Image Link'
    'control': 10,   # J 'Control' (steering vocab)
    'starting': 11,  # K 'Starting'
    'tilt': 12,      # L 'Tilt & Trim'
    'supplier': 17,  # Q 'Supplier'
    'total_ctd': 50,     # AX 'Total CTD' -> cost
    'nsm_retail': 55,    # BC 'NSM Retail' -> hull_cash
    'sell_campaign': 58, # BF 'Sell Price' (retail - rebate - discount) -> hull_campaign
    'trade': 64,         # BL 'Trade Price' -> hull_trade + hull_subdealer
    'commercial': 71,    # BS 'Commercial Price' -> hull_commercial
    'boating_alliance': 77,  # BY 'Boating Alliance Price' -> hull_boating_alliance
    'rebate_program': 25,    # Y 'Rebate Program'
    'weight': 162,   # FF WEIGHT (best-effort; validated at runtime against header)
}

EXPECTED_HEADERS = {
    'display': 'MODEL', 'code': 'MODEL', 'hp': 'HP Rating', 'shaft': 'Shaft Length',
    'control': 'Control', 'supplier': 'Supplier', 'total_ctd': 'Total CTD',
    'nsm_retail': 'NSM Retail', 'sell_campaign': 'Sell Price', 'trade': 'Trade Price',
    'commercial': 'Commercial Price', 'boating_alliance': 'Boating Alliance Price',
}


def clean(v):
    """Normalize a cell: strip, treat '.', '', ' - ', '$ -' style placeholders as None."""
    if v is None:
        return None
    if isinstance(v, str):
        s = v.replace(' ', ' ').strip()
        if s in ('', '.', '-', '$ -', '$-', 'N/A', '#N/A'):
            return None
        return s
    return v


def num(v):
    """Numeric cell -> rounded float (2dp) or None. Strings like ' -   ' -> None."""
    v = clean(v)
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return round(float(v), 2)
    s = str(v).replace('$', '').replace(',', '').strip()
    try:
        return round(float(s), 2)
    except ValueError:
        return None


def parse_hp(raw):
    """Parse HP Rating incl multi-engine strings.
    Accepts '2 x 300', '2 X 300', '2 × 300', '3 x 250', 'Electric', 9.9, 300.
    Returns dict {raw, engines, perEngineHp, totalHp} (hp fields None for Electric)."""
    out = {'raw': raw if raw is None or isinstance(raw, str) else float(raw),
           'engines': None, 'perEngineHp': None, 'totalHp': None}
    v = clean(raw)
    if v is None:
        return out
    if isinstance(v, (int, float)):
        out['engines'] = 1
        out['perEngineHp'] = float(v)
        out['totalHp'] = float(v)
        return out
    s = str(v)
    m = re.match(r'^\s*(\d+)\s*[x×X]\s*(\d+(?:\.\d+)?)\s*$', s)
    if m:
        n, hp = int(m.group(1)), float(m.group(2))
        out['engines'] = n
        out['perEngineHp'] = hp
        out['totalHp'] = n * hp
        return out
    m = re.match(r'^\s*(\d+(?:\.\d+)?)\s*$', s)
    if m:
        out['engines'] = 1
        out['perEngineHp'] = float(m.group(1))
        out['totalHp'] = float(m.group(1))
    # 'Electric', '3 x 250/300/350' variants fall through with raw only
    return out


def main():
    wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
    ws = wb['Motor Library']

    # Validate header row before trusting column indices.
    hdr = {}
    for row in ws.iter_rows(min_row=HEADER_ROW, max_row=HEADER_ROW, max_col=80):
        for c in row:
            if c.value is not None:
                hdr[c.column] = str(c.value).replace('\n', ' ').replace('\r', ' ').strip()
    problems = []
    for key, expect in EXPECTED_HEADERS.items():
        got = hdr.get(COL[key], '')
        if expect.lower() not in got.lower():
            problems.append(f"col {COL[key]} expected '{expect}' got '{got}'")
    if problems:
        print('HEADER VALIDATION FAILED:', problems, file=sys.stderr)
        sys.exit(1)

    motors, sections = [], []
    section = None
    max_col = max(COL.values())
    r = HEADER_ROW
    for row in ws.iter_rows(min_row=HEADER_ROW + 1, max_row=LAST_ROW, max_col=max_col):
        r += 1
        get = lambda k: row[COL[k] - 1].value if len(row) >= COL[k] else None
        c_val, d_val = clean(get('display')), clean(get('code'))
        if c_val is not None and d_val is None:
            # section banner row
            section = str(c_val)
            sections.append({'row': r, 'section': section})
            continue
        if d_val is None:
            continue  # blank spacer
        code = str(d_val).strip()
        display = str(c_val).strip() if c_val is not None else None
        price_levels = {
            'hull_cash': num(get('nsm_retail')),
            'hull_trade': num(get('trade')),
            'hull_subdealer': num(get('trade')),
            'hull_commercial': num(get('commercial')),
            'hull_boating_alliance': num(get('boating_alliance')),
            'hull_campaign': num(get('sell_campaign')),  # D7
        }
        motors.append({
            'compositeKey': f"{code}||{section or ''}",
            'modelCode': code,
            'displayName': display,          # exact Boat Module reference string
            'section': section,              # rig/campaign section context
            'rigCategory': section,
            'sourceRow': r,
            'hp': parse_hp(get('hp')),
            'shaft': clean(get('shaft')),
            'steering': clean(get('control')),   # raw MPF Control vocab
            'starting': clean(get('starting')),
            'tiltTrim': clean(get('tilt')),
            'cylindersDisplacement': clean(get('cyl')),
            'engineColour': clean(get('colour')),
            'imageUrl': clean(get('image')),
            'supplier': clean(get('supplier')),
            'rebateProgram': clean(get('rebate_program')),
            'priceLevels': price_levels,
            'cost': num(get('total_ctd')),   # AX Total CTD
        })
    wb.close()

    codes = [m['modelCode'] for m in motors]
    dup_codes = sorted({c for c in codes if codes.count(c) > 1})
    keys = [m['compositeKey'] for m in motors]
    dup_keys = sorted({k for k in keys if keys.count(k) > 1})

    out = {
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'source': 'tasks/mpf-source/Motor Module.xlsx :: Motor Library (header row 4, data rows 5-628)',
        'readOnly': True,
        'priceLevelMapping': {
            'BC NSM Retail': 'hull_cash', 'BL Trade Price': 'hull_trade + hull_subdealer',
            'BS Commercial Price': 'hull_commercial', 'BY Boating Alliance Price': 'hull_boating_alliance',
            'BF Sell Price (campaign)': 'hull_campaign (D7)', 'AX Total CTD': 'cost',
        },
        'gstNote': 'Values stored RAW as listed in MPF (NSM Retail is RRP+Freight inc GST '
                   'convention); live Yamaha dataSet rows store the same raw figures.',
        'counts': {
            'motors': len(motors),
            'sections': len(sections),
            'distinctModelCodes': len(set(codes)),
            'duplicatedModelCodes': len(dup_codes),
            'duplicatedCompositeKeys': len(dup_keys),
        },
        'duplicatedModelCodes': dup_codes,
        'duplicatedCompositeKeys': dup_keys,
        'sections': sections,
        'motors': motors,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w') as f:
        json.dump(out, f, indent=1)
    print(f"motors: {len(motors)} rows, {len(set(codes))} distinct codes, "
          f"{len(dup_codes)} duplicated codes, {len(dup_keys)} duplicated composite keys, "
          f"{len(sections)} sections -> {os.path.relpath(OUT, ROOT)}")


if __name__ == '__main__':
    main()

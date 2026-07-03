#!/usr/bin/env python3
"""Phase 2 (MTF) — extract trailers from tasks/mpf-source/Trailer Module.xlsx.

STRICTLY READ-ONLY on the source workbook (read_only=True, data_only=True).

Sheet 'Trailer Module': row 1 = headers, row 3 = column-number ruler (inside
the data range — skipped), col A = brand/series banner rows, spacer rows hold
single-space strings. OBSOLETE section rows 654-695 EXCLUDED per D1
(current-only). 470 current trailer rows expected.

Pricing: BS Total Nett CTD -> cost; BW Sell -> sellExGst following the live
convention (existing importer stores BW raw as sellPriceExclGst — verified on
live doc DUNBIER ACL 5M-13BH: sell 6340 == BW raw). GST basis of BW remains an
NSM open question; raw value also kept as sellRaw.

Rego (BY/BZ) is a QLD-only flat two-band table keyed on ATM — extracted as
regoBand INFO ONLY per the v1.4 lesson; must never feed quote pricing.

Output: tasks/mpf-audit/extracted/trailers.json
"""
import json, os, sys
from datetime import datetime, timezone

import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'tasks/mpf-source/Trailer Module.xlsx')
OUT = os.path.join(ROOT, 'tasks/mpf-audit/extracted/trailers.json')

HEADER_ROW = 1
RULER_ROW = 3
OBSOLETE_FROM = 654  # 'OBSOLETE' banner row — everything from here excluded (D1)
LAST_ROW = 695

COL = {
    'banner': 1,        # A brand/series banner
    'name': 3,          # C 'Brand / Make / Model' (natural key, Boat Module ref string)
    'supplier': 4,      # D 'Supplier'
    'code': 5,          # E 'Code' (supplier SKU, 14 dups -> composite key w/ name)
    'longDesc': 6,      # F 'Long Description'
    'image': 7,         # G 'Image Link'
    'boatSize': 8,      # H 'Boat Size (Mtr)' (mixed types)
    'wheels': 9,        # I 'Wheel Size'
    'tare': 10,         # J 'Tare (Kg)'
    'atm': 11,          # K 'ATM (KG)'
    'cost': 71,         # BS 'Total Nett CTD'
    'rrp': 74,          # BV 'RRP'
    'sell': 75,         # BW 'Sell'
    'regoType': 77,     # BY 'Rego Type'
    'regoDollars': 78,  # BZ 'Rego ($)'
}

EXPECTED_HEADERS = {
    'name': 'Brand / Make / Model', 'supplier': 'Supplier', 'code': 'Code',
    'wheels': 'Wheel Size', 'tare': 'Tare', 'atm': 'ATM',
    'cost': 'Total Nett CTD', 'sell': 'Sell', 'regoType': 'Rego Type',
}

# Brand banner (top-level) -> HelmLogic Trailer-Brand vendor id
BANNER_TO_BRAND = [
    ('DUNBIER / HAINES', ('DUNBIER / HAINES BMT', 'dunbier-haines-bmt')),
    ('DUNBIER', ('DUNBIER', 'dunbier-trailers')),
    ('REDCO', ('REDCO / TINKA', 'redco-tinka-trailers')),
    ('TINKA', ('REDCO / TINKA', 'redco-tinka-trailers')),
    ('GFAB', ('GFAB', 'gfab-trailers')),
    ('STACER', ('STACER', 'stacer-trailers')),
    ('MACKAY', ('MACKAY', 'mackay-trailers')),
]


def clean(v):
    if v is None:
        return None
    if isinstance(v, str):
        s = v.replace('\xa0', ' ').strip()
        if s in ('', '.', '-'):
            return None
        return s
    return v


def num(v):
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


def main():
    wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
    ws = wb['Trailer Module']

    hdr = {}
    for row in ws.iter_rows(min_row=HEADER_ROW, max_row=HEADER_ROW, max_col=80):
        for c in row:
            if c.value is not None:
                hdr[c.column] = str(c.value).replace('\n', ' ').strip()
    problems = [f"col {COL[k]} expected '{e}' got '{hdr.get(COL[k], '')}'"
                for k, e in EXPECTED_HEADERS.items()
                if e.lower() not in str(hdr.get(COL[k], '')).lower()]
    if problems:
        print('HEADER VALIDATION FAILED:', problems, file=sys.stderr)
        sys.exit(1)

    trailers, banners, skipped_no_supplier = [], [], []
    brand, brand_vendor, series = None, None, None
    obsolete_hit = None
    max_col = max(COL.values())
    r = HEADER_ROW
    for row in ws.iter_rows(min_row=HEADER_ROW + 1, max_row=LAST_ROW, max_col=max_col):
        r += 1
        if r == RULER_ROW:
            continue
        get = lambda k: row[COL[k] - 1].value if len(row) >= COL[k] else None
        banner = clean(get('banner'))
        if banner is not None:
            btxt = str(banner).upper()
            if btxt.startswith('OBSOLETE'):
                obsolete_hit = r
            if obsolete_hit is None:
                banners.append({'row': r, 'banner': str(banner)})
                mapped = next((v for pfx, v in BANNER_TO_BRAND if btxt.startswith(pfx)), None)
                if mapped:
                    brand, brand_vendor = mapped
                    series = str(banner)
                else:
                    # sub-series banner under the current brand
                    series = str(banner)
            continue
        if obsolete_hit is not None and r >= OBSOLETE_FROM:
            continue  # D1: current-only — skip obsolete tail entirely
        name = clean(get('name'))
        if name is None:
            continue  # spacer (incl. single-space strings)
        supplier = clean(get('supplier'))
        if supplier is None:
            # Not a trailer row: col-C-only sub-banners ('GFAB - Surtees Series
            # (as at ...)') and the TRAILER NOT REQUIRED sentinel rows. The
            # evidence definition of a trailer row is col C + col D supplier.
            skipped_no_supplier.append({'row': r, 'name': str(name)})
            continue
        code = clean(get('code'))
        trailers.append({
            'name': str(name),                      # display key (Boat Module ref string)
            'code': str(code) if code is not None else None,
            'compositeKey': f"{supplier}||{code or ''}||{name}",
            'brand': brand,
            'brandVendorId': brand_vendor,
            'series': series,
            'supplier': supplier,
            'longDescription': clean(get('longDesc')),
            'imageUrl': clean(get('image')),
            'boatSizeRaw': clean(get('boatSize')),
            'wheels': clean(get('wheels')),
            'tare': num(get('tare')),
            'atm': num(get('atm')),
            'cost': num(get('cost')),               # BS Total Nett CTD
            'sellExGst': num(get('sell')),          # BW Sell, raw (live convention)
            'sellRaw': num(get('sell')),
            'rrp': num(get('rrp')),
            'regoBand': {                           # INFO ONLY (v1.4 lesson)
                'type': clean(get('regoType')),
                'dollars': num(get('regoDollars')),
                'infoOnly': True,
            },
            'sourceRow': r,
        })
    wb.close()

    if obsolete_hit != OBSOLETE_FROM:
        print(f"WARNING: OBSOLETE banner found at row {obsolete_hit}, expected {OBSOLETE_FROM}",
              file=sys.stderr)

    names = [t['name'] for t in trailers]
    dup_names = sorted({n for n in names if names.count(n) > 1})
    codes = [t['code'] for t in trailers if t['code']]
    dup_codes = sorted({c for c in codes if codes.count(c) > 1})

    out = {
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'source': 'tasks/mpf-source/Trailer Module.xlsx :: Trailer Module '
                  f'(header row 1, ruler row 3 skipped, obsolete rows {obsolete_hit}-{LAST_ROW} excluded per D1)',
        'readOnly': True,
        'gstNote': 'sellExGst = BW Sell RAW, matching the live importer convention '
                   '(live trailer docs store BW raw as sellPriceExclGst). BW GST basis '
                   'remains an NSM open question — flagged, not silently normalized.',
        'regoNote': 'regoBand is QLD flat 2-band ($166 <=1.02t / $283 >1.021t) — INFO ONLY, '
                    'state rego computed at quote time from ATM via Rego module (v1.4 lesson).',
        'counts': {
            'trailers': len(trailers),
            'banners': len(banners),
            'distinctNames': len(set(names)),
            'duplicatedNames': len(dup_names),
            'duplicatedCodes': len(dup_codes),
            'byBrand': {b: sum(1 for t in trailers if t['brand'] == b)
                        for b in sorted({t['brand'] for t in trailers if t['brand']})},
            'unmappedBrand': sum(1 for t in trailers if not t['brand']),
            'skippedNoSupplier': len(skipped_no_supplier),
            'reconciliation': '470 evidence rows = current(C+D) + 39 obsolete-tail rows excluded per D1',
        },
        'skippedNoSupplier': skipped_no_supplier,
        'duplicatedNames': dup_names,
        'duplicatedCodes': dup_codes,
        'banners': banners,
        'trailers': trailers,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w') as f:
        json.dump(out, f, indent=1)
    print(f"trailers: {len(trailers)} current rows ({out['counts']['byBrand']}, "
          f"unmapped {out['counts']['unmappedBrand']}), {len(dup_names)} dup names, "
          f"{len(dup_codes)} dup codes -> {os.path.relpath(OUT, ROOT)}")


if __name__ == '__main__':
    main()

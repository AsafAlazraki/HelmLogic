#!/usr/bin/env python3
"""Phase 2 (MTF) — extract factory options from Factory Options Module.xlsx.

STRICTLY READ-ONLY on the source workbook (read_only=True, data_only=True).

Sheet 'Factory Options Module' (25,102 real rows):
  Row 1 = headers (C NSM Code, D Description, E Factory Code, F Matrix,
  G Base Price, H Misc, I CTD, J MU, K GP, L Sell, N Service Op, O Image).
  Col A = boat-model section headers (705 in active region); each section's
  FIRST row is the hull itself (NSM code == Boat Module Model Code — the
  verified D6 join key). '.' rows = separators. Brand banners re-state header
  strings ('Matrix' in col F).
  HIGHFIELD region (rows 14454-15785) is a FLAT brand accessory catalog
  (HE*/BC*/HIG- codes, applicability encoded per-code) — emitted as a
  brand-flat section, not per-boat.
  OBSOLETE OPTIONS meta-section starts row 19,068 — EXCLUDED per D1, EXCEPT
  Stabicraft rows which are retained (flagged obsolete) because the Boat
  Module's Stabicraft FO refs still point at them (D6 corrected join +
  stabicraft-bug-evidence emitted from Boat Module refs vs active/obsolete).

Currency normalization (recorded per option):
  Highfield: Base Price USD, CTD = USD / 0.70 -> costAud from col I.
  Merry Fisher / Jeanneau / Cap Camarat: Base Price EUR, CTD = EUR x 1.75.
  All other brands AUD (costAud = col I CTD).

Sell semantics: numeric -> 'priced'; 'Std' -> standard inclusion; 'Bundle' ->
pack member; 'POA'; 0/'$ -' -> 'no-charge'; cached '#N/A'/'#VALUE!' errors ->
QUARANTINED (listed, never import). GST basis of Sell unverified — stored raw.

Output: tasks/mpf-audit/extracted/factory-options.json
"""
import json, os, re, sys
from datetime import datetime, timezone

import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'tasks/mpf-source/Factory Options Module.xlsx')
BOAT_SRC = os.path.join(ROOT, 'tasks/mpf-source/Boat Module.xlsx')
OUT = os.path.join(ROOT, 'tasks/mpf-audit/extracted/factory-options.json')

LAST_ROW = 25102
OBSOLETE_ROW = 19068
HIGHFIELD_BANNER_ROW = 14454

ERROR_STRINGS = {'#N/A', '#VALUE!', '#REF!', '#DIV/0!', '#NAME?'}

EUR_BRANDS = ('merry fisher', 'jeanneau', 'cap camarat')


def clean(v):
    if v is None:
        return None
    if isinstance(v, str):
        s = v.replace('\xa0', ' ').strip()
        if s in ('', '.'):
            return None
        return s
    return v


def is_error(v):
    return isinstance(v, str) and v.strip() in ERROR_STRINGS


def num(v):
    v = clean(v)
    if v is None or is_error(v):
        return None
    if isinstance(v, (int, float)):
        return round(float(v), 2)
    s = str(v).replace('$', '').replace(',', '').strip()
    try:
        return round(float(s), 2)
    except ValueError:
        return None


def sell_semantics(raw):
    v = clean(raw)
    if v is None:
        return None, None
    if is_error(v):
        return None, 'error'
    if isinstance(v, (int, float)):
        return (round(float(v), 2), 'priced') if float(v) != 0 else (0.0, 'no-charge')
    s = str(v)
    if s.lower() == 'std':
        return None, 'Std'
    if s.lower() == 'bundle':
        return None, 'Bundle'
    if s.upper() == 'POA':
        return None, 'POA'
    n = num(s)
    if n is not None:
        return (n, 'priced') if n != 0 else (0.0, 'no-charge')
    return None, 'unparsed'


def currency_for(matrix, brand_context):
    b = (matrix or brand_context or '').lower()
    if 'highfield' in b:
        return 'USD', 'CTD = USD / 0.70'
    if any(e in b for e in EUR_BRANDS):
        return 'EUR', 'CTD = EUR x 1.75'
    return 'AUD', None


def extract_fo():
    wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
    ws = wb['Factory Options Module']

    hdr = {c.column: str(c.value).strip() for row in ws.iter_rows(min_row=1, max_row=1, max_col=15)
           for c in row if c.value is not None}
    expect = {3: 'NSM Code', 4: 'Description', 5: 'Factory Code', 6: 'Matrix',
              7: 'Base Price', 9: 'CTD', 12: 'Sell'}
    problems = [f"col {k} expected '{v}' got '{hdr.get(k)}'" for k, v in expect.items()
                if v.lower() not in str(hdr.get(k, '')).lower()]
    if problems:
        print('HEADER VALIDATION FAILED:', problems, file=sys.stderr)
        sys.exit(1)

    sections = []            # per-boat sections keyed by hull NSM code
    highfield_flat = []      # HIGHFIELD brand-flat catalog options
    obsolete_stabicraft = [] # obsolete-region Stabicraft rows (crosswalk only)
    obsolete_codes = set()   # ALL obsolete-region codes (for bug-evidence resolution)
    quarantine = []          # cached formula-error cells — listed, never imported
    brand_banners = []

    cur = None               # current active section dict
    brand_context = None     # last brand banner text
    in_highfield = False
    category = None

    def close_section():
        nonlocal cur
        if cur is not None:
            sections.append(cur)
            cur = None

    rn = 1
    for row in ws.iter_rows(min_row=2, max_row=LAST_ROW, max_col=15):
        rn += 1
        a = clean(row[0].value)
        c = clean(row[2].value)
        d = clean(row[3].value)
        e = clean(row[4].value)
        f = clean(row[5].value)
        g_raw = row[6].value
        i_raw = row[8].value
        l_raw = row[11].value
        svc = clean(row[13].value) if len(row) >= 14 else None
        img = clean(row[14].value) if len(row) >= 15 else None

        in_obsolete = rn >= OBSOLETE_ROW
        if rn == HIGHFIELD_BANNER_ROW:
            in_highfield = True
        if in_highfield and a is not None and rn > HIGHFIELD_BANNER_ROW:
            in_highfield = False  # next col-A section header ends the HF region

        # Brand banner rows: col F holds the literal header 'Matrix' (or col C
        # ends with 'FACTORY OPTIONS').
        if (f == 'Matrix') or (c and str(c).upper().endswith('FACTORY OPTIONS')):
            brand_context = str(a or c)
            brand_banners.append({'row': rn, 'banner': brand_context})
            if not in_obsolete and not in_highfield:
                close_section()
            category = None
            continue

        if in_obsolete:
            if c is None:
                continue
            code = str(c)
            obsolete_codes.add(code)
            is_stab = (f and 'stabi' in str(f).lower()) or code.startswith('STB')
            if is_stab:
                sell, sem = sell_semantics(l_raw)
                if sem == 'error' or is_error(g_raw):
                    quarantine.append({'row': rn, 'code': code, 'desc': d, 'region': 'obsolete-stabicraft',
                                       'basePriceRaw': str(g_raw), 'sellRaw': str(l_raw)})
                obsolete_stabicraft.append({
                    'row': rn, 'code': code, 'desc': d, 'factoryCode': e, 'matrix': f,
                    'sellRaw': l_raw if isinstance(l_raw, (int, float, str)) else None,
                    'sellExGst': sell, 'sellSemantics': sem, 'obsolete': True,
                })
            continue

        # ---- active region ----
        if a is not None and not in_highfield:
            # new boat-model section; its own row is the hull row
            close_section()
            cur = {
                'sectionName': str(a), 'startRow': rn, 'brandContext': brand_context,
                'hullNsmCode': str(c) if c is not None else None,   # == Boat Module Model Code (D6 join)
                'hullDesc': d, 'matrix': f,
                'hullBasePriceRaw': g_raw if isinstance(g_raw, (int, float)) else clean(g_raw),
                'hullCtd': num(i_raw), 'hullSell': num(l_raw),
                'options': [],
            }
            category = None
            continue

        if c is None:
            continue  # separator

        code = str(c)
        # Category header rows: code present but no factory code, no base price,
        # no sell (e.g. 'PAINTWORK OPTIONS').
        if e is None and num(g_raw) is None and clean(l_raw) is None and d is not None:
            category = str(d)
            continue

        errors = []
        if is_error(g_raw):
            errors.append(('basePrice', str(g_raw).strip()))
        if is_error(l_raw):
            errors.append(('sell', str(l_raw).strip()))
        sell, sem = sell_semantics(l_raw)
        matrix = f
        currency, norm = currency_for(matrix, brand_context if in_highfield else
                                      (cur or {}).get('matrix') or brand_context)
        opt = {
            'row': rn, 'code': code, 'factoryCode': e, 'desc': d,
            'matrix': matrix, 'category': category,
            'basePriceRaw': g_raw if isinstance(g_raw, (int, float)) else clean(g_raw),
            'currency': currency, 'currencyNormalization': norm,
            'costAud': num(i_raw),   # col I CTD — already AUD (currency math baked in)
            'sellRaw': l_raw if isinstance(l_raw, (int, float, str)) else None,
            'sellExGst': sell,       # raw Sell; GST basis unverified (open question)
            'sellSemantics': sem,
            'serviceOperation': svc, 'imageUrl': img,
            'active': True,
        }
        if errors:
            quarantine.append({'row': rn, 'code': code, 'desc': d,
                               'region': 'highfield-flat' if in_highfield else
                                         (cur or {}).get('sectionName', '(no section)'),
                               'errors': [f"{fld}={val}" for fld, val in errors],
                               'basePriceRaw': str(g_raw), 'sellRaw': str(l_raw)})
            opt['quarantined'] = True   # listed but NEVER imported
        if in_highfield:
            highfield_flat.append(opt)
        elif cur is not None:
            cur['options'].append(opt)
        # rows before any section (shouldn't happen) are dropped silently
    close_section()
    wb.close()

    return sections, highfield_flat, obsolete_stabicraft, obsolete_codes, quarantine, brand_banners


def stabicraft_bug_evidence(sections, obsolete_codes):
    """D6: per current Stabicraft boat, resolve its Boat Module FO refs against
    the FO Module's ACTIVE sections (join: FO hull NSM code == Boat Module
    Model Code) vs the OBSOLETE section. Emits per-boat counts proving the
    partial re-key bug (their data bug, documented for NSM)."""
    wb = openpyxl.load_workbook(BOAT_SRC, read_only=True, data_only=True)
    ws = wb['Boat Module']

    # Boat Module: row 1 headers; identity col 3 BOAT, col 4 Model Code,
    # col 5 Matrix; Factory Options refs FO-01..165 at cols 77-241 (block 6);
    # current rows 4-1004 (>=1005 = obsolete models).
    active_by_hull = {}
    active_codes = set()
    for s in sections:
        if s.get('hullNsmCode'):
            active_by_hull[str(s['hullNsmCode'])] = {o['code'] for o in s['options']}
        for o in s['options']:
            active_codes.add(o['code'])

    boats = []
    rn = 0
    for row in ws.iter_rows(min_row=4, max_row=1004, max_col=241):
        rn = row[0].row if hasattr(row[0], 'row') else rn + 1
        matrix = row[4].value if len(row) >= 5 else None
        if matrix is None or 'stabi' not in str(matrix).lower():
            continue
        name = clean(row[2].value)
        model_code = clean(row[3].value)
        if model_code is None or str(model_code) == 'Model Code':
            continue
        refs = []
        for c in row[76:241]:
            v = clean(c.value)
            if v is None:
                continue
            s = str(v)
            if s.endswith('%') or re.fullmatch(r'0\.\d+', s):
                continue  # 'Factory Options - MU' style noise
            refs.append(s)
        own_active = active_by_hull.get(str(model_code), set())
        in_own, in_active_other, in_obsolete_only, missing = [], [], [], []
        for code in refs:
            if code in own_active:
                in_own.append(code)
            elif code in active_codes:
                in_active_other.append(code)
            elif code in obsolete_codes:
                in_obsolete_only.append(code)
            else:
                missing.append(code)
        boats.append({
            'boat': str(name), 'modelCode': str(model_code),
            'hullSectionFound': str(model_code) in active_by_hull,
            'foRefs': len(refs),
            'resolveInOwnActiveSection': len(in_own),
            'resolveInOtherActiveSection': len(in_active_other),
            'resolveOnlyInObsolete': len(in_obsolete_only),
            'missingEverywhere': len(missing),
            'missingCodes': missing[:10],
        })
    wb.close()

    totals = {
        'currentStabicraftBoats': len(boats),
        'totalFoRefs': sum(b['foRefs'] for b in boats),
        'resolveInOwnActiveSection': sum(b['resolveInOwnActiveSection'] for b in boats),
        'resolveInOtherActiveSection': sum(b['resolveInOtherActiveSection'] for b in boats),
        'resolveOnlyInObsolete': sum(b['resolveOnlyInObsolete'] for b in boats),
        'missingEverywhere': sum(b['missingEverywhere'] for b in boats),
    }
    return {
        'finding': 'NSM DATA BUG (theirs): the FO Module re-keyed Stabicraft options to '
                   '10-digit factory codes in its active sections and moved the old STB-* '
                   'rows to OBSOLETE OPTIONS, but the Boat Module FO ref columns were only '
                   'partially migrated — most Stabicraft boat rows still reference '
                   'obsolete-section codes. CORRECT import (D6): take each boat\'s options '
                   'from the ACTIVE section joined via FO hull-row NSM code == Boat Module '
                   'Model Code; keep obsolete STB-*/legacy rows only as a crosswalk.',
        'joinRule': 'FO section hull-row NSM code == Boat Module Model Code (verified)',
        'totals': totals,
        'perBoat': boats,
    }


def main():
    sections, hf_flat, obs_stab, obsolete_codes, quarantine, brand_banners = extract_fo()
    bug = stabicraft_bug_evidence(sections, obsolete_codes)

    n_opts = sum(len(s['options']) for s in sections)
    importable = [o for s in sections for o in s['options'] if not o.get('quarantined')] + \
                 [o for o in hf_flat if not o.get('quarantined')]
    sem_counts = {}
    for o in ([o for s in sections for o in s['options']] + hf_flat):
        sem_counts[o['sellSemantics'] or 'none'] = sem_counts.get(o['sellSemantics'] or 'none', 0) + 1

    by_model = {s['hullNsmCode'] or f"(row {s['startRow']}) {s['sectionName']}":
                {'sectionName': s['sectionName'], 'brand': s['matrix'] or s['brandContext'],
                 'options': len(s['options'])} for s in sections}

    out = {
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'source': 'tasks/mpf-source/Factory Options Module.xlsx :: Factory Options Module '
                  '(header row 1, active rows 2-19067, OBSOLETE from 19068 excluded per D1 '
                  'EXCEPT Stabicraft crosswalk rows per D6)',
        'readOnly': True,
        'gstNote': 'sellExGst = col L Sell RAW (rounded-to-$10 catalog price); GST basis '
                   'unverified with NSM — flagged, not silently normalized.',
        'currencyNote': 'costAud = col I CTD (currency math already baked in by MPF: '
                        'Highfield USD/0.70, Merry Fisher+Jeanneau EUR x1.75 — recorded '
                        'per option as currency + currencyNormalization).',
        'counts': {
            'boatSections': len(sections),
            'sectionOptions': n_opts,
            'highfieldFlatOptions': len(hf_flat),
            'totalActiveOptionRows': n_opts + len(hf_flat),
            'importableOptions': len(importable),
            'quarantinedCells': len(quarantine),
            'obsoleteStabicraftRows': len(obs_stab),
            'obsoleteRegionCodes': len(obsolete_codes),
            'sellSemantics': sem_counts,
        },
        'sectionsByModelCode': by_model,
        'sections': sections,
        'highfieldFlatCatalog': {
            'note': 'HIGHFIELD region (rows 14454-15785) is a flat brand accessory catalog '
                    '(HE*/HIG- codes); per-model applicability comes from the Boat Module '
                    'FO ref columns, not from sections.',
            'options': hf_flat,
        },
        'stabicraftBugEvidence': bug,
        'obsoleteStabicraftCrosswalk': {
            'note': 'Obsolete-region Stabicraft rows retained ONLY to decode legacy Boat '
                    'Module refs (D6). Flagged obsolete:true — never shown in pickers, '
                    'never imported as active options.',
            'rows': obs_stab,
        },
        'quarantine': {
            'note': 'Cached formula-error cells (#N/A / #VALUE!) frozen into values — '
                    'listed here, NEVER imported. Operator repricing needed (rose-highlight '
                    '"missing pricing" pattern, not zero).',
            'cells': quarantine,
        },
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w') as f:
        json.dump(out, f, indent=1)
    c = out['counts']
    print(f"factory-options: {c['boatSections']} boat sections, {c['sectionOptions']} section "
          f"options + {c['highfieldFlatOptions']} Highfield flat = {c['totalActiveOptionRows']} "
          f"active option rows; quarantined {c['quarantinedCells']}; obsolete Stabicraft "
          f"crosswalk {c['obsoleteStabicraftRows']}; semantics {c['sellSemantics']}")
    t = bug['totals']
    print(f"stabicraft-bug: {t['currentStabicraftBoats']} boats, {t['totalFoRefs']} FO refs -> "
          f"own-active {t['resolveInOwnActiveSection']}, other-active {t['resolveInOtherActiveSection']}, "
          f"obsolete-only {t['resolveOnlyInObsolete']}, missing {t['missingEverywhere']}")


if __name__ == '__main__':
    main()

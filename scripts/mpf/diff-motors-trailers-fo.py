#!/usr/bin/env python3
"""Phase 2 (MTF) — READ-ONLY diff of extracted MPF data vs live HelmLogic Firestore.

Compares:
  1. motors.json vs Yamaha vendor dataSet rows
     (data-warehouse/mRAzkE8PUX8GMHELCvJo/dataSets/FQ5uTMyUorrJPlpbWIY8/rows,
      match by MODEL CODE; each price level + cost, $ deltas)
  2. trailers.json vs Trailer-Brand vendor docs
     (data-warehouse/{vendorId}/series/{seriesId}/trailers, match by name)
  3. factory-options.json Highfield flat catalog vs live Highfield model
     optionalFeatures (match by option code per model; live models under
     data-warehouse/LafOLpLb6QIFE856TiD4/ranges/{rangeId}/models)

NO WRITES of any kind. Outputs:
  tasks/mpf-audit/extracted/MTF_DIFF.md
  tasks/mpf-audit/extracted/mtf-diff.json
"""
import json, os, sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _fs  # Firestore REST helpers (read-only usage here)

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EXT = os.path.join(ROOT, 'tasks/mpf-audit/extracted')

YAMAHA_VENDOR = 'mRAzkE8PUX8GMHELCvJo'
YAMAHA_DATASET = 'FQ5uTMyUorrJPlpbWIY8'
HIGHFIELD_VENDOR = 'LafOLpLb6QIFE856TiD4'
HIGHFIELD_RANGES = {
    'Classic': 'qo7IePnRzJxjrYyLWhTn', 'Roll-Up': 'EqcKQ51svI1I2Q5poFdl',
    'Ultra-Light': 'QsGZuVwutEr5yyMkp97j', 'Sport': 'nQ2LE50z9Tbf2uss0Ote',
    'Adventure': 'sEzdrM2fZsrOKA3ACrJp', 'Patrol': 'vfXxDuMpChteKncb7LnG',
    'Coaster': 'coaster',
}
TRAILER_VENDORS = ['dunbier-trailers', 'dunbier-haines-bmt', 'gfab-trailers',
                   'mackay-trailers', 'redco-tinka-trailers', 'stacer-trailers',
                   'obsolete-trailers']

# live Yamaha row field  ->  extracted priceLevels key (or 'cost')
MOTOR_FIELD_MAP = [
    ('NSM Retail', 'hull_cash'),
    ('Trade Price', 'hull_trade'),
    ('Commercial Price', 'hull_commercial'),
    ('Boating Alliance Price', 'hull_boating_alliance'),
    ('Sell Price', 'hull_campaign'),
    ('Total CTD', 'cost'),
]

TOL = 0.01


def load(name):
    with open(os.path.join(EXT, name)) as f:
        return json.load(f)


def n2(v):
    try:
        return round(float(v), 2)
    except (TypeError, ValueError):
        return None


def delta(live, mpf):
    if live is None and mpf is None:
        return None
    if live is None or mpf is None:
        return {'live': live, 'mpf': mpf, 'delta': None}
    d = round(mpf - live, 2)
    return {'live': live, 'mpf': mpf, 'delta': d} if abs(d) > TOL else None


def pick_primary_motors(motors):
    """One extracted row per model code: prefer primary catalog sections
    (display 'Yamaha - {code}', non-Powerplants section), earliest row."""
    by_code = {}
    def score(m):
        s = (m.get('section') or '')
        primary_display = (m.get('displayName') or '').strip() == f"Yamaha - {m['modelCode']}"
        powerplant = s.lower().startswith('powerplants') or ' w ' in s.lower()
        return (0 if primary_display else 1, 1 if powerplant else 0, m['sourceRow'])
    for m in motors:
        k = m['modelCode']
        if k not in by_code or score(m) < score(by_code[k]):
            by_code[k] = m
    return by_code


def diff_motors():
    mx = load('motors.json')
    primary = pick_primary_motors(mx['motors'])
    live_rows = _fs.list_docs(f'data-warehouse/{YAMAHA_VENDOR}/dataSets/{YAMAHA_DATASET}/rows')
    live_by_code = {}
    for r in live_rows:
        code = str(r.get('MODEL CODE') or '').strip()
        if code:
            live_by_code[code] = r

    matched, mismatched, drifts = 0, [], []
    for code, live in sorted(live_by_code.items()):
        m = primary.get(code)
        if m is None:
            continue
        fields = {}
        for live_f, ext_f in MOTOR_FIELD_MAP:
            lv = n2(live.get(live_f))
            mv = m['cost'] if ext_f == 'cost' else m['priceLevels'].get(ext_f)
            d = delta(lv, mv)
            if d:
                fields[f'{live_f} -> {ext_f}'] = d
        matched += 1
        if fields:
            worst = max((abs(v['delta']) for v in fields.values() if v['delta'] is not None),
                        default=0)
            mismatched.append({'modelCode': code, 'displayName': m['displayName'],
                               'maxAbsDelta': worst, 'fields': fields})
    mismatched.sort(key=lambda x: -x['maxAbsDelta'])

    missing_in_live = sorted(set(primary) - set(live_by_code))
    stale_in_live = sorted(set(live_by_code) - set(primary))
    return {
        'liveRows': len(live_rows), 'extractedPrimaryCodes': len(primary),
        'matchedByCode': matched,
        'matchedClean': matched - len(mismatched),
        'priceMismatches': len(mismatched),
        'missingInLive': {'count': len(missing_in_live), 'codes': missing_in_live},
        'staleInLive': {'count': len(stale_in_live), 'codes': stale_in_live},
        'mismatches': mismatched,
    }


def diff_trailers():
    tx = load('trailers.json')
    live = []
    for vid in TRAILER_VENDORS:
        for s in _fs.list_docs(f'data-warehouse/{vid}/series'):
            for t in _fs.list_docs(f'data-warehouse/{vid}/series/{s["_id"]}/trailers'):
                t['_vendor'] = vid
                t['_series'] = s.get('name') or s['_id']
                live.append(t)
    live_by_name = {str(t.get('name') or '').strip(): t for t in live}

    matched, mismatched = 0, []
    unmatched_mpf = []
    for t in tx['trailers']:
        lt = live_by_name.get(t['name'].strip())
        if lt is None:
            unmatched_mpf.append({'name': t['name'], 'code': t['code'], 'brand': t['brand']})
            continue
        matched += 1
        spec = lt.get('specifications') or {}
        fields = {}
        for label, lv, mv in [
            ('sellPriceExclGst', n2(lt.get('sellPriceExclGst')), t['sellExGst']),
            ('cost', n2(lt.get('cost')), t['cost']),
            ('atmKg', n2(spec.get('atmKg')), t['atm']),
            ('tareKg', n2(spec.get('tareKg')), t['tare']),
        ]:
            d = delta(lv, mv)
            if d:
                fields[label] = d
        if fields:
            worst = max((abs(v['delta']) for v in fields.values() if v['delta'] is not None),
                        default=0)
            mismatched.append({'name': t['name'], 'code': t['code'],
                               'vendor': lt['_vendor'], 'maxAbsDelta': worst, 'fields': fields})
    mismatched.sort(key=lambda x: -x['maxAbsDelta'])
    mpf_names = {t['name'].strip() for t in tx['trailers']}
    stale_live = [{'name': n, 'vendor': t['_vendor'],
                   'isActive': t.get('isActive')}
                  for n, t in sorted(live_by_name.items()) if n not in mpf_names]
    return {
        'liveTrailers': len(live), 'extractedCurrent': len(tx['trailers']),
        'matchedByName': matched,
        'matchedClean': matched - len(mismatched),
        'fieldMismatches': len(mismatched),
        'missingInLive': {'count': len(unmatched_mpf), 'trailers': unmatched_mpf},
        'staleInLive': {'count': len(stale_live), 'trailers': stale_live},
        'mismatches': mismatched,
    }


def diff_factory_options():
    fx = load('factory-options.json')
    catalog = {}
    for o in fx['highfieldFlatCatalog']['options']:
        if o.get('quarantined'):
            continue
        catalog[str(o['code']).upper()] = o

    per_model, totals = [], {'liveOptions': 0, 'matchedByCode': 0, 'priceMatch': 0,
                             'priceMismatch': 0, 'missingInMpf': 0}
    live_codes_seen = set()
    for range_name, rid in HIGHFIELD_RANGES.items():
        for m in _fs.list_docs(f'data-warehouse/{HIGHFIELD_VENDOR}/ranges/{rid}/models'):
            ofs = m.get('optionalFeatures') or []
            if not ofs:
                continue
            rec = {'range': range_name, 'model': m['_id'], 'name': m.get('name'),
                   'liveOptions': len(ofs), 'matched': 0, 'priceMatch': 0,
                   'priceMismatch': 0, 'missingInMpf': 0, 'mismatches': []}
            for of in ofs:
                totals['liveOptions'] += 1
                code = str(of.get('code') or '').strip().upper()
                mpf = catalog.get(code) if code else None
                if mpf is None:
                    rec['missingInMpf'] += 1
                    totals['missingInMpf'] += 1
                    rec.setdefault('missingCodes', []).append(of.get('code') or of.get('name'))
                    continue
                live_codes_seen.add(code)
                rec['matched'] += 1
                totals['matchedByCode'] += 1
                lv = n2(of.get('sellPriceExclGst'))
                mv = mpf.get('sellExGst')
                mv_ex = None if mv is None else round(mv / 1.1, 2)
                if lv is not None and mv is not None and (
                        abs(lv - mv) <= TOL or abs(lv - mv_ex) <= 0.5):
                    rec['priceMatch'] += 1
                    totals['priceMatch'] += 1
                else:
                    rec['priceMismatch'] += 1
                    totals['priceMismatch'] += 1
                    rec['mismatches'].append({
                        'code': of.get('code'), 'name': of.get('name'),
                        'liveSellExGst': lv, 'mpfSellRaw': mv, 'mpfSellDiv1.1': mv_ex,
                        'mpfCostAud': mpf.get('costAud'), 'liveCost': n2(of.get('cost')),
                    })
            per_model.append(rec)

    unreferenced = len([c for c in catalog if c not in live_codes_seen])
    return {
        'scope': 'Highfield only — MPF Highfield flat catalog (HE*/HIG- codes) vs live '
                 'model optionalFeatures. Other brands have no live models yet (D4 pending).',
        'mpfHighfieldCatalogOptions': len(catalog),
        'totals': totals,
        'mpfOptionsNotReferencedByAnyLiveModel': unreferenced,
        'perModel': per_model,
    }


def write_md(diff):
    m, t, f = diff['motors'], diff['trailers'], diff['factoryOptions']
    lines = []
    w = lines.append
    w('# MTF Diff — MPF extraction vs live HelmLogic (READ-ONLY)')
    w('')
    w(f"Generated {diff['generatedAt']} · Phase 2 (motors / trailers / factory options)")
    w('')
    w('## Headline')
    w('')
    w(f"- **Motors**: {m['matchedByCode']} of {m['liveRows']} live Yamaha rows matched by "
      f"model code; **{m['priceMismatches']} rows with price/cost drift**; "
      f"{m['missingInLive']['count']} MPF codes missing in live; "
      f"{m['staleInLive']['count']} live codes not in current MPF.")
    w(f"- **Trailers**: {t['matchedByName']} of {t['extractedCurrent']} current MPF trailers "
      f"matched to {t['liveTrailers']} live docs by name; **{t['fieldMismatches']} with "
      f"field drift**; {t['missingInLive']['count']} MPF trailers missing in live; "
      f"{t['staleInLive']['count']} live trailers not in current MPF (incl. obsolete vendor).")
    w(f"- **Factory options (Highfield)**: {f['totals']['liveOptions']} live optionalFeatures "
      f"across models — {f['totals']['matchedByCode']} matched by code "
      f"({f['totals']['priceMatch']} price-clean, {f['totals']['priceMismatch']} price "
      f"mismatch), {f['totals']['missingInMpf']} live codes absent from the MPF Highfield "
      f"catalog. MPF catalog holds {f['mpfHighfieldCatalogOptions']} active options "
      f"({f['mpfOptionsNotReferencedByAnyLiveModel']} not referenced by any live model).")
    w('- **RU200KAM**: not present in Motor/Trailer/FO modules — the RU200KAM $76.82 drift '
      'is a Highfield hull/variant price (Boat Module scope, lands in the phase-2 BOATS diff).')
    w('')
    w('## Motors — biggest price drifts (top 25)')
    w('')
    w('| Model code | Field | Live | MPF | Δ |')
    w('|---|---|---:|---:|---:|')
    shown = 0
    for row in m['mismatches']:
        for fld, v in row['fields'].items():
            if v['delta'] is None:
                continue
            w(f"| {row['modelCode']} | {fld} | {v['live']} | {v['mpf']} | {v['delta']:+.2f} |")
            shown += 1
            if shown >= 25:
                break
        if shown >= 25:
            break
    w('')
    w(f"Motors missing in live ({m['missingInLive']['count']}): "
      + ', '.join(m['missingInLive']['codes'][:40])
      + (' …' if m['missingInLive']['count'] > 40 else ''))
    w('')
    w(f"Live codes not in current MPF ({m['staleInLive']['count']}): "
      + ', '.join(m['staleInLive']['codes'][:40])
      + (' …' if m['staleInLive']['count'] > 40 else ''))
    w('')
    w('## Trailers — biggest drifts (top 25)')
    w('')
    w('| Trailer | Field | Live | MPF | Δ |')
    w('|---|---|---:|---:|---:|')
    shown = 0
    for row in t['mismatches']:
        for fld, v in row['fields'].items():
            if v['delta'] is None:
                continue
            w(f"| {row['name'][:60]} | {fld} | {v['live']} | {v['mpf']} | {v['delta']:+.2f} |")
            shown += 1
            if shown >= 25:
                break
        if shown >= 25:
            break
    w('')
    w(f"MPF trailers missing in live ({t['missingInLive']['count']}): "
      + '; '.join(x['name'] for x in t['missingInLive']['trailers'][:20])
      + (' …' if t['missingInLive']['count'] > 20 else ''))
    w('')
    w('## Factory options (Highfield) — per-model summary')
    w('')
    w('| Model | Live OFs | Matched | Price OK | Price drift | Missing in MPF |')
    w('|---|---:|---:|---:|---:|---:|')
    for rec in f['perModel']:
        w(f"| {rec['model']} | {rec['liveOptions']} | {rec['matched']} | {rec['priceMatch']} "
          f"| {rec['priceMismatch']} | {rec['missingInMpf']} |")
    w('')
    w('Full detail (every field delta, every code) in `mtf-diff.json`.')
    w('')
    with open(os.path.join(EXT, 'MTF_DIFF.md'), 'w') as fh:
        fh.write('\n'.join(lines))


def main():
    diff = {
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'readOnly': True,
        'motors': diff_motors(),
        'trailers': diff_trailers(),
        'factoryOptions': diff_factory_options(),
    }
    with open(os.path.join(EXT, 'mtf-diff.json'), 'w') as fh:
        json.dump(diff, fh, indent=1)
    write_md(diff)
    m, t, f = diff['motors'], diff['trailers'], diff['factoryOptions']
    print(f"motors: matched {m['matchedByCode']}/{m['liveRows']} live rows, "
          f"{m['priceMismatches']} drifted, missing-in-live {m['missingInLive']['count']}, "
          f"stale-in-live {m['staleInLive']['count']}")
    if m['mismatches']:
        top = m['mismatches'][0]
        print(f"  top motor drift: {top['modelCode']} maxΔ ${top['maxAbsDelta']:.2f}")
    print(f"trailers: matched {t['matchedByName']}/{t['extractedCurrent']} MPF rows, "
          f"{t['fieldMismatches']} drifted, missing-in-live {t['missingInLive']['count']}, "
          f"stale-in-live {t['staleInLive']['count']}")
    if t['mismatches']:
        top = t['mismatches'][0]
        print(f"  top trailer drift: {top['name'][:50]} maxΔ ${top['maxAbsDelta']:.2f}")
    print(f"factory-options: live {f['totals']['liveOptions']} OFs, matched "
          f"{f['totals']['matchedByCode']}, price-clean {f['totals']['priceMatch']}, "
          f"mismatch {f['totals']['priceMismatch']}, missing-in-MPF {f['totals']['missingInMpf']}")
    print(f"-> {os.path.relpath(os.path.join(EXT, 'MTF_DIFF.md'), ROOT)} + mtf-diff.json")


if __name__ == '__main__':
    main()

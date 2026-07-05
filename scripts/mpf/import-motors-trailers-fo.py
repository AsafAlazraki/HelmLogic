#!/usr/bin/env python3
"""Phase 2/4 (MTF) — idempotent upsert of extracted motors / trailers / factory
options into live HelmLogic Firestore.

DEFAULT IS DRY-RUN. Nothing is written unless --apply is passed explicitly.

  python3 scripts/mpf/import-motors-trailers-fo.py            # dry-run (plan only)
  python3 scripts/mpf/import-motors-trailers-fo.py --apply    # writes (Phase 4 only)

Rules (per CLAUDE.md + D1/D6/D7):
  - Upsert by natural key. NEVER clear-and-replace, NEVER delete.
  - Motors -> data-warehouse/mRAzkE8PUX8GMHELCvJo/dataSets/FQ5uTMyUorrJPlpbWIY8/rows
      match by MODEL CODE (every live doc sharing the code is patched);
      patch flat price fields + priceLevels{...incl hull_campaign per D7} + cost;
      create rows only for primary Yamaha/EPROPULSION codes (Jeanneau/boat-package
      powerplants are out of Yamaha-vendor scope -> skipped with reason).
  - Trailers -> data-warehouse/{brandVendorId}/series/{seriesId}/trailers
      match by name across the vendor's series; patch cost / sellPriceExclGst /
      specifications.{atmKg,tareKg,wheelSize} / pricingDetail rego hints (info
      only); create missing trailers under a name-matched (or new) series doc.
      The obsolete-trailers vendor is never touched (D1).
  - Factory options -> Highfield model optionalFeatures (per-model array merge):
      ONLY updates existing options matched by code against the MPF Highfield
      flat catalog (price/cost refresh). applicableVariantIds and every other
      curated field are preserved verbatim. New options are NOT added here —
      per-model applicability comes from Boat Module FO ref columns (boats
      phase). Quarantined (#N/A / #VALUE!) options are never imported.

Every applied write logs before/after to tasks/mpf-audit/apply-log-mtf.jsonl.
Dry-run writes the full plan to tasks/mpf-audit/extracted/mtf-import-dryrun.json.

OPEN QUESTION carried into the plan (flagged, not silently resolved): GST basis
of MPF Sell columns. Convention followed = live raw-value convention (motors:
live rows already store raw MPF figures; trailers: live sellPriceExclGst == BW
raw). Highfield FO sell uses MPF catalog Sell raw + costAud — the live values
are demonstrably stale USD-as-AUD pass-throughs.
"""
import argparse, json, os, sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _fs

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EXT = os.path.join(ROOT, 'tasks/mpf-audit/extracted')
APPLY_LOG = os.path.join(ROOT, 'tasks/mpf-audit/apply-log-mtf.jsonl')
DRYRUN_OUT = os.path.join(EXT, 'mtf-import-dryrun.json')

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
                   'mackay-trailers', 'redco-tinka-trailers', 'stacer-trailers']
TOL = 0.01


def load(name):
    with open(os.path.join(EXT, name)) as f:
        return json.load(f)


def log_apply(entry):
    entry['ts'] = datetime.now(timezone.utc).isoformat()
    with open(APPLY_LOG, 'a') as f:
        f.write(json.dumps(entry, default=str) + '\n')


def n2(v):
    try:
        return round(float(v), 2)
    except (TypeError, ValueError):
        return None


def changed(live_val, new_val):
    a, b = n2(live_val), n2(new_val)
    if isinstance(live_val, str) or isinstance(new_val, str):
        if a is None or b is None:
            return str(live_val or '') != str(new_val or '')
    if a is None and b is None:
        return False
    if a is None or b is None:
        return True
    return abs(a - b) > TOL


def pick_primary_motors(motors):
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


def plan_motors(apply):
    mx = load('motors.json')
    primary = pick_primary_motors(mx['motors'])
    live_rows = _fs.list_docs(f'data-warehouse/{YAMAHA_VENDOR}/dataSets/{YAMAHA_DATASET}/rows')
    live_by_code = {}
    for r in live_rows:
        code = str(r.get('MODEL CODE') or '').strip()
        if code:
            live_by_code.setdefault(code, []).append(r)

    updates, creates, skips = [], [], []
    for code, m in sorted(primary.items()):
        pl = m['priceLevels']
        new_fields = {
            'NSM Retail': pl['hull_cash'], 'Trade Price': pl['hull_trade'],
            'Commercial Price': pl['hull_commercial'],
            'Boating Alliance Price': pl['hull_boating_alliance'],
            'Sell Price': pl['hull_campaign'], 'Total CTD': m['cost'],
            'priceLevels': {k: v for k, v in pl.items() if v is not None},
            'cost': m['cost'],
        }
        new_fields = {k: v for k, v in new_fields.items() if v is not None}
        if code in live_by_code:
            for live in live_by_code[code]:
                flat_checks = {k: v for k, v in new_fields.items()
                               if k not in ('priceLevels',)}
                diff = {k: {'before': live.get(k), 'after': v}
                        for k, v in flat_checks.items() if changed(live.get(k), v)}
                live_pl = live.get('priceLevels') or {}
                pl_diff = {k: {'before': live_pl.get(k), 'after': v}
                           for k, v in new_fields.get('priceLevels', {}).items()
                           if changed(live_pl.get(k), v)}
                if not diff and not pl_diff:
                    continue
                updates.append({'path': live['_path'], 'modelCode': code,
                                'fields': new_fields, 'diff': diff,
                                'priceLevelsDiff': pl_diff})
        else:
            supplier = (m.get('supplier') or '').upper()
            if supplier not in ('YAMAHA', 'EPROPULSION'):
                skips.append({'modelCode': code, 'supplier': m.get('supplier'),
                              'reason': 'boat-package powerplant — out of Yamaha vendor scope'})
                continue
            create_fields = dict(new_fields)
            create_fields.update({
                'MODEL': m['displayName'], 'MODEL CODE': code,
                'HP Rating': m['hp']['raw'], 'Shaft Length': m.get('shaft'),
                'Control': m.get('steering'), 'Starting': m.get('starting'),
                'Tilt & Trim': m.get('tiltTrim'),
                'Cylinders / Displacement': m.get('cylindersDisplacement'),
                'Engine Colour': m.get('engineColour'),
                'SummaryImage': m.get('imageUrl'),
                'importedFrom': 'MPF Motor Module.xlsx (phase2.mtf)',
                'mpfSection': m.get('section'),
            })
            create_fields = {k: v for k, v in create_fields.items() if v is not None}
            creates.append({'collection': f'data-warehouse/{YAMAHA_VENDOR}/dataSets/{YAMAHA_DATASET}/rows',
                            'modelCode': code, 'fields': create_fields})

    if apply:
        for u in updates:
            before = _fs.get_doc(u['path'])
            _fs.patch_doc(u['path'], u['fields'])
            after = _fs.get_doc(u['path'])
            log_apply({'action': 'motors.update', 'path': u['path'],
                       'modelCode': u['modelCode'], 'before': before, 'after': after})
        for cdef in creates:
            res = _fs.create_doc(cdef['collection'], cdef['fields'])
            log_apply({'action': 'motors.create', 'path': res['name'].split('/documents/')[1],
                       'modelCode': cdef['modelCode'], 'before': None, 'after': cdef['fields']})
    return {'updates': len(updates), 'creates': len(creates), 'skips': len(skips),
            'unchanged': len(primary) - len({u['modelCode'] for u in updates})
                         - len(creates) - len(skips),
            'planUpdates': updates, 'planCreates': creates, 'planSkips': skips}


def plan_trailers(apply):
    tx = load('trailers.json')
    live_index, series_index = {}, {}
    for vid in TRAILER_VENDORS:
        series_index[vid] = {}
        for s in _fs.list_docs(f'data-warehouse/{vid}/series'):
            series_index[vid][str(s.get('name') or s['_id']).strip().upper()] = s['_id']
            for t in _fs.list_docs(f'data-warehouse/{vid}/series/{s["_id"]}/trailers'):
                live_index[str(t.get('name') or '').strip()] = t

    updates, creates, skips = [], [], []
    for t in tx['trailers']:
        if not t.get('brandVendorId'):
            skips.append({'name': t['name'], 'reason': 'no vendor mapping'})
            continue
        lt = live_index.get(t['name'].strip())
        upd = {
            'cost': t['cost'], 'sellPriceExclGst': t['sellExGst'],
            'specifications.atmKg': t['atm'], 'specifications.tareKg': t['tare'],
            'specifications.wheelSize': t['wheels'],
            'pricingDetail.regoTypeHint': (t.get('regoBand') or {}).get('type'),
            'pricingDetail.regoDollarsHint': (t.get('regoBand') or {}).get('dollars'),
        }
        upd = {k: v for k, v in upd.items() if v is not None}
        if lt is not None:
            spec = lt.get('specifications') or {}
            pd = lt.get('pricingDetail') or {}
            cur = {'cost': lt.get('cost'), 'sellPriceExclGst': lt.get('sellPriceExclGst'),
                   'specifications.atmKg': spec.get('atmKg'),
                   'specifications.tareKg': spec.get('tareKg'),
                   'specifications.wheelSize': spec.get('wheelSize'),
                   'pricingDetail.regoTypeHint': pd.get('regoTypeHint'),
                   'pricingDetail.regoDollarsHint': pd.get('regoDollarsHint')}
            diff = {k: {'before': cur.get(k), 'after': v} for k, v in upd.items()
                    if changed(cur.get(k), v)}
            if not diff:
                continue
            updates.append({'path': lt['_path'], 'name': t['name'],
                            'updates': {k: v for k, v in upd.items() if k in diff},
                            'diff': diff})
        else:
            series_key = str(t.get('series') or 'GENERAL').strip().upper()
            series_id = series_index[t['brandVendorId']].get(series_key)
            creates.append({
                'vendor': t['brandVendorId'], 'seriesName': t.get('series') or 'GENERAL',
                'seriesId': series_id,  # None -> create series doc first on apply
                'name': t['name'],
                'fields': {
                    'name': t['name'], 'code': t.get('code'), 'supplier': t.get('supplier'),
                    'imageUrl': t.get('imageUrl'), 'isActive': True,
                    'cost': t['cost'], 'sellPriceExclGst': t['sellExGst'],
                    'specifications': {k: v for k, v in {
                        'atmKg': t['atm'], 'tareKg': t['tare'], 'wheelSize': t['wheels'],
                    }.items() if v is not None},
                    'pricingDetail': {k: v for k, v in {
                        'regoTypeHint': (t.get('regoBand') or {}).get('type'),
                        'regoDollarsHint': (t.get('regoBand') or {}).get('dollars'),
                        'sell': t.get('sellRaw'), 'rrp': t.get('rrp'),
                        'totalNettCtd': t.get('cost'),
                    }.items() if v is not None},
                    'importedFrom': 'MPF Trailer Module.xlsx (phase2.mtf)',
                    'sourceRow': t['sourceRow'],
                },
            })

    if apply:
        for u in updates:
            before = _fs.get_doc(u['path'])
            nested, mask = _fs.nested_from_dotted(u['updates'])
            _fs.patch_doc(u['path'], nested, update_mask=mask)
            after = _fs.get_doc(u['path'])
            log_apply({'action': 'trailers.update', 'path': u['path'],
                       'name': u['name'], 'before': before, 'after': after})
        for cdef in creates:
            sid = cdef['seriesId']
            if sid is None:
                res = _fs.create_doc(f"data-warehouse/{cdef['vendor']}/series",
                                     {'name': cdef['seriesName']})
                sid = res['name'].rsplit('/', 1)[-1]
                log_apply({'action': 'trailers.createSeries',
                           'path': res['name'].split('/documents/')[1],
                           'before': None, 'after': {'name': cdef['seriesName']}})
            fields = {k: v for k, v in cdef['fields'].items() if v is not None}
            res = _fs.create_doc(f"data-warehouse/{cdef['vendor']}/series/{sid}/trailers", fields)
            log_apply({'action': 'trailers.create',
                       'path': res['name'].split('/documents/')[1],
                       'name': cdef['name'], 'before': None, 'after': fields})
    return {'updates': len(updates), 'creates': len(creates), 'skips': len(skips),
            'unchanged': len(tx['trailers']) - len(updates) - len(creates) - len(skips),
            'planUpdates': updates, 'planCreates': creates, 'planSkips': skips}


def plan_factory_options(apply):
    fx = load('factory-options.json')
    catalog = {str(o['code']).upper(): o
               for o in fx['highfieldFlatCatalog']['options'] if not o.get('quarantined')}

    updates, untouched_models = [], 0
    for range_name, rid in HIGHFIELD_RANGES.items():
        for m in _fs.list_docs(f'data-warehouse/{HIGHFIELD_VENDOR}/ranges/{rid}/models'):
            ofs = m.get('optionalFeatures') or []
            if not ofs:
                continue
            new_ofs, model_diffs = [], []
            for of in ofs:
                code = str(of.get('code') or '').strip().upper()
                mpf = catalog.get(code) if code else None
                merged = dict(of)  # preserve id/category/isStandard/applicableVariantIds/...
                if mpf is not None:
                    diffs = {}
                    if mpf.get('sellExGst') is not None and changed(of.get('sellPriceExclGst'),
                                                                    mpf['sellExGst']):
                        diffs['sellPriceExclGst'] = {'before': of.get('sellPriceExclGst'),
                                                     'after': mpf['sellExGst']}
                        merged['sellPriceExclGst'] = mpf['sellExGst']
                    if mpf.get('costAud') is not None and changed(of.get('cost'), mpf['costAud']):
                        diffs['cost'] = {'before': of.get('cost'), 'after': mpf['costAud']}
                        merged['cost'] = mpf['costAud']
                    if diffs:
                        model_diffs.append({'code': of.get('code'), 'name': of.get('name'),
                                            'diffs': diffs})
                new_ofs.append(merged)
            if model_diffs:
                updates.append({'path': m['_path'], 'model': m['_id'], 'range': range_name,
                                'optionsTouched': len(model_diffs),
                                'optionsPreserved': len(ofs) - len(model_diffs),
                                'newOptionalFeatures': new_ofs, 'diff': model_diffs})
            else:
                untouched_models += 1

    if apply:
        for u in updates:
            before = _fs.get_doc(u['path'])
            _fs.patch_doc(u['path'], {'optionalFeatures': u['newOptionalFeatures']},
                          update_mask=['optionalFeatures'])
            after = _fs.get_doc(u['path'])
            log_apply({'action': 'factoryOptions.updateModel', 'path': u['path'],
                       'model': u['model'],
                       'before': {'optionalFeatures': before.get('optionalFeatures')},
                       'after': {'optionalFeatures': after.get('optionalFeatures')}})
    return {'modelsToUpdate': len(updates), 'modelsUnchanged': untouched_models,
            'optionsTouched': sum(u['optionsTouched'] for u in updates),
            'optionsPreserved': sum(u['optionsPreserved'] for u in updates),
            'note': 'price/cost refresh of EXISTING per-model options only; '
                    'applicableVariantIds + curated fields preserved; no adds, no deletes; '
                    'GST basis of MPF Sell unverified (open question, values used raw)',
            'planUpdates': updates}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true',
                    help='actually write to Firestore (Phase 4). Default: dry-run.')
    args = ap.parse_args()

    if args.apply:
        print('*** APPLY MODE — writing to live Firestore, logging to apply-log-mtf.jsonl ***')
        log_apply({'action': 'phase2.mtf.apply.start'})
    else:
        print('DRY-RUN (no writes). Pass --apply to execute.')

    motors = plan_motors(args.apply)
    trailers = plan_trailers(args.apply)
    fo = plan_factory_options(args.apply)

    summary = {
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'mode': 'apply' if args.apply else 'dry-run',
        'motors': {k: v for k, v in motors.items() if not k.startswith('plan')},
        'trailers': {k: v for k, v in trailers.items() if not k.startswith('plan')},
        'factoryOptions': {k: v for k, v in fo.items() if not k.startswith('plan')},
    }
    if not args.apply:
        with open(DRYRUN_OUT, 'w') as f:
            json.dump({'summary': summary, 'motors': motors, 'trailers': trailers,
                       'factoryOptions': fo}, f, indent=1, default=str)
    else:
        log_apply({'action': 'phase2.mtf.apply.complete', 'summary': summary})

    print(json.dumps(summary, indent=1))
    if not args.apply:
        print(f"full plan -> {os.path.relpath(DRYRUN_OUT, ROOT)}")


if __name__ == '__main__':
    main()

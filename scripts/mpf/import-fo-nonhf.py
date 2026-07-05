#!/usr/bin/env python3
"""Phase 5b (all-brands quotable) — materialize optionalFeatures onto the
non-Highfield MPF boat models from the extracted factory-options catalogue.

WHY: the boats wave wrote `factoryOptionCodes` (bare code lists) onto every
non-HF model, and the MTF wave only REPRICED existing Highfield
optionalFeatures — it never created per-model option arrays for the other
brands. Result: 223 non-HF models hold codes with no consumer, so Step 2 of
the quote flow renders empty. This importer builds each model's
`optionalFeatures` array from tasks/mpf-audit/extracted/factory-options.json
(section keyed by hullNsmCode == model modelCode), shaped to MATCH the live
Highfield option shape:

    { id, code, name, category, cost, sellPriceExclGst, isStandard,
      applicableVariantIds: [] }

Semantics (active rows only):
  - priced     -> sellPriceExclGst = sellExGst (AUD catalog sell, already
                  currency-normalized upstream), cost = costAud when numeric
  - no-charge  -> sellPriceExclGst = 0
  - Std        -> isStandard = True, sellPriceExclGst = 0 (standard-inclusion
                  semantics — renders as a $0 line, consistent with HF)
  - Bundle / error / POA / none / unparsed -> skipped (no importable price;
    'error' rows are frozen #N/A cells, 'unparsed' rows are header artifacts)

Idempotent upsert-by-code (CLAUDE.md lesson — never clear-and-replace):
existing options matched by code keep every curated field and only have
price/cost/isStandard refreshed; unmatched existing options are preserved
verbatim; new codes are appended. Re-runs converge to zero writes.

DEFAULT IS DRY-RUN. Nothing is written unless --apply is passed.

  python3 scripts/mpf/import-fo-nonhf.py            # dry-run (plan only)
  python3 scripts/mpf/import-fo-nonhf.py --apply    # writes + readback verify

Every applied write logs before/after to tasks/mpf-audit/apply-log-fo-nonhf.jsonl.
"""
import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _fs

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FO_JSON = os.path.join(ROOT, 'tasks/mpf-audit/extracted/factory-options.json')
APPLY_LOG = os.path.join(ROOT, 'tasks/mpf-audit/apply-log-fo-nonhf.jsonl')

# Non-HF MPF landing ranges (mirror of import-boats.py BRAND_ROUTING).
NONHF_RANGES = [
    ('Stacer',           'LWgHuGoKfUBeKZ8eWnEi', 'mpf-catalog'),
    ('Stabicraft',       '0cUm736tE9ON2WFLRHD0', 'mpf-catalog'),
    ('Surtees',          'gLAi5eHYiZDgrvjDUaos', 'mpf-catalog'),
    ('Haines Signature', 'DJ5GVMzLaNWNcOlRqzJV', 'mpf-catalog'),
    ('Jeanneau (MPF)',   'lwGHoqdqNPuSZYYQAgG7', 'jeanneau-mpf'),
    ('Merry Fisher',     'lwGHoqdqNPuSZYYQAgG7', 'merry-fisher'),
    ('Cap Camarat',      'lwGHoqdqNPuSZYYQAgG7', 'cap-camarat'),
    ('Formosa',          'formosa',              'mpf-catalog'),
]

IMPORTABLE_SEMANTICS = {'priced', 'no-charge', 'Std'}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def log_apply(entry):
    entry = {'ts': now_iso(), **entry}
    with open(APPLY_LOG, 'a') as f:
        f.write(json.dumps(entry, default=str) + '\n')


def alnum(s):
    return re.sub(r'[^a-z0-9]', '', str(s).lower())


def importable(o):
    """Row usable as an optionalFeature? Returns skip-reason or None."""
    if not o.get('active'):
        return 'inactive'
    if not str(o.get('code') or '').strip() or not str(o.get('desc') or '').strip():
        return 'no-code-or-desc'
    if o.get('sellSemantics') not in IMPORTABLE_SEMANTICS:
        return f"semantics:{o.get('sellSemantics')}"
    return None


def to_feature(o, used_ids):
    """MPF option row -> HF-shaped optionalFeature."""
    desc = str(o['desc']).strip()
    code = str(o['code']).strip()
    sell = o.get('sellExGst')
    sell = round(float(sell), 2) if isinstance(sell, (int, float)) else 0.0
    feat = {
        'code': code,
        'name': desc,
        'category': (o.get('category') or 'Other').strip() or 'Other',
        'sellPriceExclGst': sell,
        'isStandard': o.get('sellSemantics') == 'Std',
        'applicableVariantIds': [],
    }
    cost = o.get('costAud')
    if isinstance(cost, (int, float)):
        feat['cost'] = round(float(cost), 2)
    fid = 'feat-' + alnum(desc)
    if fid in used_ids:
        fid = fid + '-' + alnum(code)
    used_ids.add(fid)
    feat['id'] = fid
    return feat


def build_desired_options(model_codes, own_section, global_catalog, warnings, ctx):
    """Resolve a model's factoryOptionCodes list against its own MPF section
    first (per-hull pricing is authoritative), then the global code catalog
    (8 of 7,142 codes are price-ambiguous globally — most-frequent price
    wins there, with a warning). Returns (options, skipped_by_reason)."""
    own = {}
    for o in (own_section.get('options') if own_section else None) or []:
        c = str(o.get('code') or '').strip().upper()
        if c and c not in own:
            own[c] = o
    out, skipped = [], {}
    used_ids, used_codes = set(), set()

    def skip(reason):
        skipped[reason] = skipped.get(reason, 0) + 1

    for raw in model_codes:
        code = str(raw or '').strip()
        cu = code.upper()
        if not code:
            skip('empty-code')
            continue
        if cu in used_codes:
            skip('duplicate-code')
            continue
        o = own.get(cu)
        if o is None:
            rows = [r for r in global_catalog.get(cu, []) if importable(r) is None]
            if not rows:
                # importable nowhere — record why (or that it's unknown entirely)
                any_rows = global_catalog.get(cu, [])
                skip(importable(any_rows[0]) if any_rows else 'code-not-in-mpf')
                continue
            prices = [r.get('sellExGst') for r in rows]
            if len(set(prices)) > 1:
                best = max(set(prices), key=prices.count)
                o = next(r for r in rows if r.get('sellExGst') == best)
                warnings.append(f"{ctx}: code {code} is price-ambiguous globally "
                                f"({sorted(set(prices))}) — most-frequent "
                                f"{best} used")
            else:
                o = rows[0]
        else:
            reason = importable(o)
            if reason is not None:
                skip(reason)
                continue
        used_codes.add(cu)
        out.append(to_feature(o, used_ids))
    return out, skipped


def merge_options(existing, desired):
    """Upsert desired into existing by code (case-insensitive). Existing
    curated fields survive; only price/cost/isStandard refresh. Returns
    (merged, n_updated, n_created, n_preserved, changed)."""
    existing = existing or []
    by_code = {}
    for i, e in enumerate(existing):
        c = str(e.get('code') or '').strip().upper()
        if c and c not in by_code:
            by_code[c] = i
    merged = [dict(e) for e in existing]
    n_upd = n_new = 0
    changed = False
    for d in desired:
        idx = by_code.get(d['code'].upper())
        if idx is None:
            merged.append(d)
            n_new += 1
            changed = True
            continue
        tgt = merged[idx]
        diff = False
        for k in ('sellPriceExclGst', 'isStandard') + (('cost',) if 'cost' in d else ()):
            if tgt.get(k) != d[k]:
                tgt[k] = d[k]
                diff = True
        if diff:
            n_upd += 1
            changed = True
    n_preserved = len(existing) - n_upd
    return merged, n_upd, n_new, n_preserved, changed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true',
                    help='actually write to Firestore. Default: dry-run.')
    args = ap.parse_args()

    fx = json.load(open(FO_JSON))
    sections = {s['hullNsmCode']: s for s in fx['sections'] if s.get('hullNsmCode')}
    # Global code catalog — the Boat Module workbook references brand-wide
    # option codes per boat (cols 77-242), many of which live in OTHER
    # hulls' FO sections. Only 8/7,142 codes are price-ambiguous globally.
    global_catalog = {}
    for s in fx['sections']:
        for o in s.get('options') or []:
            c = str(o.get('code') or '').strip().upper()
            if c:
                global_catalog.setdefault(c, []).append(o)

    mode = 'APPLY' if args.apply else 'DRY-RUN'
    print(f'=== import-fo-nonhf {mode} — {len(sections)} MPF sections, '
          f'{len(global_catalog)} distinct option codes loaded ===')
    if args.apply:
        log_apply({'action': 'phase5b.fo-nonhf.apply.start'})

    warnings, plans = [], []
    totals = {'modelsScanned': 0, 'modelsWithCodes': 0, 'modelsToWrite': 0,
              'modelsAlreadyConverged': 0, 'modelsNoSection': 0,
              'optionsCreated': 0, 'optionsUpdated': 0, 'optionsPreserved': 0}
    skipped_totals = {}

    for brand, vendor_id, range_id in NONHF_RANGES:
        path = f'data-warehouse/{vendor_id}/ranges/{range_id}/models'
        models = _fs.list_docs(path)
        for m in models:
            totals['modelsScanned'] += 1
            codes = m.get('factoryOptionCodes') or []
            if not codes:
                continue
            totals['modelsWithCodes'] += 1
            mcode = str(m.get('modelCode') or '').strip()
            sec = sections.get(mcode)
            if sec is None:
                totals['modelsNoSection'] += 1
            desired, skipped = build_desired_options(
                codes, sec, global_catalog, warnings, f'{brand} {m["_id"]}')
            for k, v in skipped.items():
                skipped_totals[k] = skipped_totals.get(k, 0) + v
            resolved = {d['code'].upper() for d in desired}
            missing = [c for c in codes if str(c).upper() not in resolved]
            if desired and len(missing) == len(codes):
                warnings.append(f'{brand} {m["_id"]}: NONE of its factoryOptionCodes '
                                f'resolved — check extraction')
            if not desired:
                warnings.append(f'{brand} {m["_id"]}: 0 importable options from '
                                f'{len(codes)} codes — left untouched')
                continue
            merged, n_upd, n_new, n_pres, changed = merge_options(
                m.get('optionalFeatures'), desired)
            if not changed:
                totals['modelsAlreadyConverged'] += 1
                continue
            totals['modelsToWrite'] += 1
            totals['optionsCreated'] += n_new
            totals['optionsUpdated'] += n_upd
            totals['optionsPreserved'] += n_pres
            plans.append({'brand': brand, 'path': m['_path'], 'model': m['_id'],
                          'modelCode': mcode, 'created': n_new, 'updated': n_upd,
                          'preserved': n_pres,
                          'codesUnresolved': missing,
                          'newOptionalFeatures': merged})

    print(json.dumps({k: v for k, v in totals.items()}, indent=2))
    print('skipped option rows (per reason, across planned sections):',
          json.dumps(skipped_totals))
    if warnings:
        print(f'--- {len(warnings)} warnings ---')
        for w in warnings[:20]:
            print('  !', w)
        if len(warnings) > 20:
            print(f'  ... and {len(warnings) - 20} more')

    if not args.apply:
        preview = [{k: p[k] for k in ('brand', 'model', 'modelCode', 'created',
                                      'updated', 'preserved')} for p in plans[:10]]
        print('plan preview (first 10):', json.dumps(preview, indent=1))
        print('DRY-RUN complete — nothing written. Re-run with --apply to write.')
        return

    applied = 0
    for p in plans:
        before = _fs.get_doc(p['path'])
        _fs.patch_doc(p['path'], {'optionalFeatures': p['newOptionalFeatures']},
                      update_mask=['optionalFeatures'])
        after = _fs.get_doc(p['path'])
        log_apply({'action': 'phase5b.fo-nonhf.updateModel', 'path': p['path'],
                   'brand': p['brand'], 'model': p['model'],
                   'created': p['created'], 'updated': p['updated'],
                   'preserved': p['preserved'],
                   'before': {'optionalFeatures': before.get('optionalFeatures')},
                   'after': {'optionalFeatures': after.get('optionalFeatures')}})
        applied += 1
        if applied % 25 == 0:
            print(f'  ... {applied}/{len(plans)} models written')
    log_apply({'action': 'phase5b.fo-nonhf.apply.done', 'modelsWritten': applied,
               'totals': totals})
    print(f'APPLY complete — {applied} models written.')

    # Readback verification on 3 models spread across brands
    verify = []
    seen_brands = set()
    for p in plans:
        if p['brand'] in seen_brands:
            continue
        seen_brands.add(p['brand'])
        verify.append(p)
        if len(verify) == 3:
            break
    for p in verify:
        doc = _fs.get_doc(p['path'])
        ofs = doc.get('optionalFeatures') or []
        priced = [f for f in ofs if isinstance(f.get('sellPriceExclGst'), (int, float))]
        print(f"VERIFY {p['brand']} {p['model']}: {len(ofs)} optionalFeatures on doc, "
              f"{len(priced)} priced, sample={json.dumps(ofs[0], default=str)[:180]}")


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""v1.33 release close-out — flip the 13 built v1.33 stories to shipped.

All 13 features targeted at v1.33 were built and browser-verified this
cycle (Epic 14 Usage Reporting + Bill's submitted-backlog asks). The
13 shipped-with-evidence triage flips (Mark's items) were already
applied by seed-v133-triage.py; the console-split item awaiting Asaf's
ruling is NOT targeted at v1.33 and is untouched.

Run:  python3 scripts/ship-v133-features.py         (applies + reads back)
"""
import sys, requests
sys.path.insert(0, 'scripts/mpf')
import _fs  # token()

PROJECT = 'studio-2290360004-3b963'
BASE = f'https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents'

SHIP = {
    # id: short label (for the log)
    '35eP01EvzSL5YiOV9dv3': 'ADMINISTRATION step in quote flow',
    '5q3kmCWKF9YHMdpBbmS7': 'Factory Configurator extra headings (all brands)',
    'ArUUrcz2CMKEMzI6UGaA': 'PDF: Factory Options own heading',
    'JKanSmkR2QDWaysQhyva': 'PDF section drag-to-reorder (whole-row drag)',
    'LbF3E1CMtWUwMBvc12ud': 'Pre-Rig Information section removed',
    'bPM7gxliygd4KzJk7ivp': 'Build-A-Boat public pricing lock',
    'dHxKMd3ABxynQCAbTuN3': 'Dealer-fit: remove one item at a time',
    'f1DqGKkueKrB8sxzpk7V': 'PDF: Dealer -> org name + section clarification',
    'jlff6tn8W8dfSa17glyW': 'Dealer-fit part image upload',
    'nRO3OTtVJnrEZFQxaPpE': 'Rego sticker pricing (data + cost field)',
    'otK3w8efkh1n3u76pC3g': 'Rebates/promotions per quote section',
    'v133-14-1-1':          '14.1.1 Usage & Activity Reporting',
    'xN3iJHkgXoGKXSZJSl2Y': 'Larger option-card text',
}

def main():
    t = _fs.token()
    ok = 0
    for fid, label in SHIP.items():
        r = requests.patch(
            f'{BASE}/features/{fid}?updateMask.fieldPaths=status&updateMask.fieldPaths=shippedRelease',
            headers={'Authorization': f'Bearer {t}'},
            json={'fields': {
                'status': {'stringValue': 'shipped'},
                'shippedRelease': {'stringValue': 'v1.33'},
            }})
        print(f"{'OK ' if r.status_code == 200 else 'ERR'} {fid} — {label} ({r.status_code})")
        ok += (r.status_code == 200)
    print(f'\napplied {ok}/{len(SHIP)}')

    # Read back: no non-shipped v1.33 stories may remain.
    r = requests.post(f'{BASE}:runQuery', headers={'Authorization': f'Bearer {t}'}, json={'structuredQuery': {
        'from': [{'collectionId': 'features'}],
        'where': {'fieldFilter': {'field': {'fieldPath': 'targetRelease'}, 'op': 'EQUAL', 'value': {'stringValue': 'v1.33'}}},
        'limit': 100}})
    r.raise_for_status()
    remaining = []
    for row in r.json():
        d = row.get('document')
        if not d:
            continue
        f = d['fields']
        st = f.get('status', {}).get('stringValue', '')
        if st != 'shipped':
            remaining.append((d['name'].split('/')[-1], st, f.get('title', {}).get('stringValue', '')))
    if remaining:
        print('STILL NOT SHIPPED at v1.33:')
        for x in remaining:
            print('  ', x)
        sys.exit(1)
    print('read-back: every v1.33-targeted story is shipped ✓')

if __name__ == '__main__':
    main()

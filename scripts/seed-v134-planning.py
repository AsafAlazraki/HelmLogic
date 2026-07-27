#!/usr/bin/env python3
"""v1.34 planning catch-up (Asaf: "have we updated roadmap AND ALL OTHER
COLLATERAL... realistic storypoints against everything").

Three jobs, all against the live `features` collection:

1. SEED the v1.34 stories for the work actually built this cycle (house
   precedent: a completed dev release flips its planning rows to
   `shipped` with targetRelease set — same as ship-v112/v114 scripts).
2. RETARGET 3.10.5 (image pipeline) v1.34 → v1.35 with an honest
   progress note — the 122-image browser harvest shipped, the
   find/fetch/review pipeline UI did not.
3. BACKFILL realistic story points on every live story missing them
   (type-based defaults + explicit overrides for the planned backlog).

DRY-RUN by default; --apply writes. Log: tasks/mpf-audit/apply-log-v134-planning.jsonl
"""
import json, os, sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mpf'))
import _fs  # noqa: E402

LOG = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   'tasks', 'mpf-audit', 'apply-log-v134-planning.jsonl')
NOW = datetime.now(timezone.utc).isoformat()

# ── 1. The v1.34 stories (what actually shipped to dev this cycle) ──
# epicId keys: guided-configuration, promotions, data-management,
# platform-tooling, YJBAT5KvPnN4BNdQwFKY (Service Quoting), testing-evidence.
V134_STORIES = [
    dict(title='Catalog Manager Motors tab — repoint to MPF dataset rows (source-of-truth fix)',
         epicId='data-management', type='improvement', points=5, priority='high',
         description='<p>The Motors table read the empty /parts collection while quotes priced 228 MPF rows (the v1.33 dealer-fit split-brain, again). Repointed to the exact dataset rows the quote flow prices from; dual-world accessors; every inline edit writes all field mirrors (NSM Retail + priceLevels.hull_cash + sellPriceExclGst).</p>',
         acceptanceCriteria=['228/228 motors render with real MPF prices (browser-proven)', 'Sell edit updates every consumer without forking']),
    dict(title='Motor & repower counter quotes — package composed from each MPF row’s own columns',
         epicId='YJBAT5KvPnN4BNdQwFKY', type='feature', points=8, priority='high',
         description='<p>Motors tab in the counter-quote picker: photo, HP/shaft/control, one-click Package (motor + std rigging + std prop + the row’s own Install - Sell line; repower adds the named Engine Removals charge). Motor quotes run a focused 3-step wizard (Customer → Motor → Review) with trade-in and balance payable.</p>',
         acceptanceCriteria=['Package button composes dollar-for-dollar from the row’s columns', 'Repower captures trade-in; review shows balance payable']),
    dict(title='Branded motor-quote PDF + Motor Quote document type (admin content control)',
         epicId='YJBAT5KvPnN4BNdQwFKY', type='feature', points=5, priority='high',
         description='<p>Yamaha-styled motor-quote PDF (hero photo, ordered spec grid, honest inc-GST money, trade-in + balance band) with its own ‘Motor Quote’ document type in Manage → Document Templates.</p>',
         acceptanceCriteria=['Download renders branded PDF with real motor photo', 'Admin blocks author independently of boat quotes']),
    dict(title='Motor catalogue UX pixel pass — audit findings fixed',
         epicId='platform-tooling', type='improvement', points=5, priority='medium',
         description='<p>36-agent pixel audit over the motor surfaces; 16 confirmed findings fixed (module-page loading gate, HP cell wrap, skeleton loaders, copy unification, orphan counters, dialog titles); 9 lows deferred with rationale; F130XA HP contradiction escalated to NSM.</p>',
         acceptanceCriteria=['tasks/motor-module-map.md carries the full findings ledger']),
    dict(title='Grid-motor bundles — menu-matching grid picks adopt the slot composition',
         epicId='guided-configuration', type='improvement', points=3, priority='high',
         description='<p>Picking a motor from the grid that IS one of the hull’s curated menu motors now adopts that slot, so rigging + prop composition prices identically no matter which surface the motor was picked from. FFR-33 held at $103,731 exact.</p>',
         acceptanceCriteria=['FFR-33 re-proven after change']),
    dict(title='Motor compatibility fields derived from the MPF’s own columns',
         epicId='data-management', type='improvement', points=2, priority='medium',
         description='<p>steeringType derived from Control on 213 rows; HP Rating derived from MODEL CODE grammar on 10 rows (hpDerivedFromCode provenance). Genuine MPF cells always win; re-imports overwrite.</p>',
         acceptanceCriteria=['223 patches applied + logged + read back']),
    dict(title='Motor image harvest — 122 Incapsula-walled Yamaha images mirrored to Storage',
         epicId='data-management', type='task', points=3, priority='medium',
         description='<p>Server fetch + weserv both blocked; a real Chromium session through the TLS bridge passes the challenge. 122/122 CDN images fetched in-browser, mirrored to mpf-mirror/motors/, rows patched. Census after: 153 on Storage, 0 CDN, 82 truly imageless (NSM asset ask).</p>',
         acceptanceCriteria=['Motor photos render in quote flow + PDFs without CDN dependency']),
    dict(title='Motors CSV round-trip — 17-column export + upsert-by-part-number import',
         epicId='data-management', type='feature', points=3, priority='medium',
         description='<p>Export emits specs, details and every price level from one column registry; import parses the same file, upserts by Part Number (MODEL CODE), patches only changed cells through the same field mirrors, creates unknown parts, never erases from blanks.</p>',
         acceptanceCriteria=['Toast: N updated · M created · K unchanged · K skipped']),
    dict(title='Define-everything motor editor sheet in the Catalog Manager',
         epicId='data-management', type='feature', points=3, priority='medium',
         description='<p>Click any Part # → full editor: identity, all MPF specs, every price level, install economics, accessory package with comes-standard toggles. Save on blur through the shared mirrors.</p>',
         acceptanceCriteria=['Live save round-trip browser-proven (edit → Saved → restore → read back)']),
    dict(title='Yamaha Rebates — per-SKU temporary rebate prices (MPF campaign mechanism)',
         epicId='promotions', type='feature', points=8, priority='high',
         description='<p>Rebates manager on the motor module (Promotions tab renamed): create rebate (name, photo, offer link, timer), SKU search with per-SKU rebate prices + %-off bulk, End-now + expiry sweep, full audit changeLog. Modelled on the MPF’s own Rebate Program / Rebate Discount / campaign Sell Price columns; active rebates stamp their MPF rows so every surface sees them join-free. Vendor-scoped storage — no rules deploy needed.</p>',
         acceptanceCriteria=['Full lifecycle browser-proven: create → quote → sales history → end → prices restored', 'A SKU can only ride one rebate at a time']),
    dict(title='Rebates on every selling surface — bands, slashed prices, PDF banners, sales history',
         epicId='promotions', type='feature', points=5, priority='high',
         description='<p>Red rebate band on the Motor step (photo, saving, offer link), slashed prices on menu/grid/hero cards and the counter picker, red ‘Factory rebate applied / You save’ banner + was-price on both customer PDFs, finalize snapshots rebate provenance and records the deal under the rebate (motor, customer, quote, deal total). Past Rebates keeps it all browsable.</p>',
         acceptanceCriteria=['Boat + motor deals both appear under the rebate’s sales history']),
    dict(title='Motor-only FULL quote flow — the boat engine entering at Motor',
         epicId='guided-configuration', type='feature', points=13, priority='high',
         description='<p>New Motor Quote opens the SAME full-screen proposal flow as boats in motorOnly mode: Motor → Dealer Fit → Administration → Summary, whole-catalogue search, per-row package composition (price levels + Install - Sell + named Engine Removals + std rigging/prop), inc-GST Display-Sheet convention, finalize into the same proposal page + proposal-style PDF with the Yamaha-branded motor hero cover. Popup wizard demoted to counter sales.</p>',
         acceptanceCriteria=['End-to-end browser walk green (flow → proposal → PDF)', 'FFR-33 unchanged at $103,731 after the change']),
    dict(title='Admin PDF structure drives rendered documents + motor-quote content set',
         epicId='platform-tooling', type='improvement', points=3, priority='medium',
         description='<p>renderQuotePdf now honours the admin-ordered pdfStructure for the RENDERED document (was preview-only) and auto-upgrades motor proposals to the ‘motor-quote’ content set — a ‘Why Yamaha’ block can live on every motor proposal and never on a boat quote.</p>',
         acceptanceCriteria=['Manage → Document Templates ordering changes the downloaded PDF']),
    dict(title='Evidence packs — quote-flow step shots, rebate lifecycle, motor-only walk',
         epicId='testing-evidence', type='task', points=2, priority='medium',
         description='<p>Dedicated Playwright specs capture every step of the boat flow, the motor flows, and the full rebate lifecycle as reviewable evidence under tasks/test-evidence/v1.34/.</p>',
         acceptanceCriteria=['Specs re-runnable on any build; screenshots + PDFs committed']),
]

# ── 3. Point overrides for specific planned/unscheduled stories ──
POINT_OVERRIDES = {
    'Add extra models to Highfield series': 3,
    'Refund policy': 2,
    '$76.82 price difference on RU200KAM between MPF & HL': 2,
    'Revolution integration architecture call': 2,
    'Salesperson territory / customer assignment rules': 5,
    'Privacy policy update': 1,
    'Office 365 SMTP debug — get email working': 3,
    'Which Australian states do we operate in?': 1,
    'Email signature standard': 1,
    'E-signature provider choice': 2,
    'HL Error on saving project': 3,
    'Insurance review': 1,
    'Cooling-off legal text per state': 2,
    'Email templates (quote sent / variation / payment reminder)': 3,
    'Tax invoice template': 3,
    'Privacy disclosure text': 1,
    'Migration cutoff date decision': 1,
    'Pull existing quote/contract data from Revolution': 8,
    'Catalog data backfill — sweep models for missing required cols': 5,
    'Pull existing customer list from current CRM': 5,
    'Build training plan': 2,
    'Catalog Manager admin training session': 2,
    'Decommission old tool / parallel run plan': 3,
    'Schedule training sessions per role': 1,
    'Comms plan: announce HelmLogic to sales team': 1,
    'shopify API setup': 5,
}
# Retro-estimate defaults by type for historical rows missing points.
TYPE_DEFAULT = {'bug': 2, 'improvement': 3, 'feature': 5, 'content': 1, 'decision': 1, 'task': 2}


def main():
    apply = '--apply' in sys.argv
    feats = _fs.list_docs('features')
    live = [f for f in feats if not f.get('deletedAt')]
    log = open(LOG, 'a')

    def wlog(kind, ref, note):
        log.write(json.dumps({'at': NOW, 'kind': kind, 'ref': ref, 'note': note}) + '\n')

    # 1. Seed v1.34 stories
    existing_titles = {str(f.get('title')) for f in live}
    to_seed = [s for s in V134_STORIES if s['title'] not in existing_titles]
    print(f"v1.34 stories to seed: {len(to_seed)} (of {len(V134_STORIES)}; rest already exist)")
    for i, s in enumerate(to_seed):
        body = {
            **s,
            'status': 'shipped',
            'targetRelease': 'v1.34',
            'submitterId': None,
            'submitterName': 'HelmLogic Engineering',
            'tags': ['v1.34', 'motor-module'],
            'voteIds': [], 'imageUrls': [], 'commentCount': 0,
            'order': (i + 1) * 10,
            'deletedAt': None, 'deletedBy': None,
            'createdAt': NOW, 'updatedAt': NOW,
        }
        print(f"  + [{s['points']}pt/{s['epicId']}] {s['title'][:80]}")
        if apply:
            rid = _fs.create_doc('features', body)
            wlog('seed', rid, s['title'])

    # 2. Retarget 3.10.5 with honest progress note
    for f in live:
        if str(f.get('title', '')).startswith('3.10.5'):
            print(f"\nretarget: {f['title'][:70]} v1.34 -> v1.35")
            if apply:
                _fs.patch_doc(f['_path'], {
                    'targetRelease': 'v1.35',
                    'triageNote': 'v1.34 progress: 122 Incapsula-walled Yamaha CDN images harvested via real-browser TLS-bridge session and mirrored to Storage (rows patched; 82 truly imageless remain — NSM asset ask). The find/fetch/review pipeline UI is the remaining scope.',
                    'updatedAt': NOW,
                }, update_mask=['targetRelease', 'triageNote', 'updatedAt'])
                wlog('retarget', f['_path'], '3.10.5 -> v1.35')

    # 3. Points backfill
    patched = 0
    for f in live:
        pts = f.get('points')
        if isinstance(pts, (int, float)) and pts:
            continue
        title = str(f.get('title', ''))
        new_pts = POINT_OVERRIDES.get(title) or TYPE_DEFAULT.get(str(f.get('type')), 2)
        patched += 1
        if apply:
            _fs.patch_doc(f['_path'], {'points': new_pts, 'updatedAt': NOW},
                          update_mask=['points', 'updatedAt'])
            wlog('points', f['_path'], f'{title[:60]} -> {new_pts}')
    print(f"\npoints backfilled on {patched} stories "
          f"({len(POINT_OVERRIDES)} explicit overrides, rest type defaults: {TYPE_DEFAULT})")

    if not apply:
        print('\nDRY-RUN — re-run with --apply to write.')
        return
    # Read-back verification
    feats2 = _fs.list_docs('features')
    live2 = [f for f in feats2 if not f.get('deletedAt')]
    v34 = [f for f in live2 if str(f.get('targetRelease')) == 'v1.34']
    nop = [f for f in live2 if not (isinstance(f.get('points'), (int, float)) and f.get('points'))]
    print(f"\nREAD-BACK: v1.34 stories = {len(v34)} "
          f"(shipped: {sum(1 for f in v34 if f.get('status') == 'shipped')}, "
          f"total points: {sum(f.get('points') or 0 for f in v34)}) · "
          f"live stories still without points = {len(nop)}")


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""MPF Phase-2 PARTS diff — STRICTLY READ-ONLY against live Firestore.

Compares the extracted datasets (tasks/mpf-audit/extracted/*.json) with the live
Northside Marine org (AcFZVEFA5UDJG2hyetWT):

  dealer-fit.json        vs organisations/{org}/dealerFitSelections
  parts-maintenance.json vs organisations/{org}/fitUpItems
  parts-inventory.json   vs organisations/{org}/serviceParts
  rigging-kits.json      vs organisations/{org}/riggingKits   (expected: not created yet)
  suppliers.json         vs organisations/{org}/suppliers     (expected: not created yet)

Outputs tasks/mpf-audit/extracted/parts-diff.json + PARTS_DIFF.md. No writes.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import (EXTRACT_DIR, FS_BASE, ORG_ID, REPO, fs_fields, list_collection,
                     load_dataset, now_iso, sign_in, slug)

import requests


def match_dealer_fit(extracted_rows, live):
    """Live docs may be seeded placeholders (df-*) or MPF-slugged ids."""
    ext_ids = {r["docId"]: r for r in extracted_rows}
    placeholders = sorted([lid for lid in live if lid.startswith("df-")])
    matched = sorted(set(ext_ids) & set(live))
    live_only = sorted(set(live) - set(ext_ids))
    missing = sorted(set(ext_ids) - set(live))
    return {
        "extracted": len(ext_ids),
        "live": len(live),
        "matched": len(matched),
        "missingInLive": len(missing),
        "liveOnly": len(live_only),
        "liveOnlyIds": live_only,
        "seedPlaceholders": placeholders,
        "matchedIds": matched,
    }


def simple_match(ext_ids, live):
    matched = sorted(set(ext_ids) & set(live))
    live_only = sorted(set(live) - set(ext_ids))
    return {
        "extracted": len(ext_ids),
        "live": len(live),
        "matched": len(matched),
        "missingInLive": len(ext_ids) - len(matched),
        "liveOnly": len(live_only),
        "liveOnlyIds": live_only[:50],
        "matchedIds": matched[:50],
    }


def main():
    print(f"=== MPF Phase-2 PARTS diff (READ-ONLY) | org={ORG_ID} ===")
    tok = sign_in()
    print(f"auth OK ({now_iso()})")
    session = requests.Session()
    headers = {"Authorization": f"Bearer {tok}"}

    live = {}
    statuses = {}
    for coll in ["dealerFitSelections", "fitUpItems", "serviceParts", "riggingKits", "suppliers"]:
        docs, st = list_collection(session, headers, f"organisations/{ORG_ID}/{coll}")
        live[coll] = docs
        statuses[coll] = st
        print(f"  live {coll}: {len(docs)} docs (HTTP {st})")

    dfo = load_dataset("dealer-fit.json")
    pm = load_dataset("parts-maintenance.json")
    inv = load_dataset("parts-inventory.json")
    rk = load_dataset("rigging-kits.json")
    sup = load_dataset("suppliers.json")

    diff = {
        "generatedAt": now_iso(),
        "org": ORG_ID,
        "readOnly": True,
        "liveHttpStatus": statuses,
        "dealerFitSelections": match_dealer_fit(dfo["rows"], live["dealerFitSelections"]),
        "fitUpItems": simple_match({r["docId"] for r in pm["rows"]}, live["fitUpItems"]),
        "serviceParts": simple_match({r["docId"] for r in inv["rows"]}, live["serviceParts"]),
        "riggingKits": {
            **simple_match({r["docId"] for r in rk["rows"]}, live["riggingKits"]),
            "collectionExists": len(live["riggingKits"]) > 0,
            "quarantinedExcluded": len(rk.get("quarantined", [])),
        },
        "suppliers": {
            **simple_match({r["docId"] for r in sup["rows"]}, live["suppliers"]),
            "collectionExists": len(live["suppliers"]) > 0,
        },
    }
    # sample of live dealerFitSelections for the report
    diff["dealerFitSelections"]["liveSample"] = {
        lid: {k: f.get(k) for k in ("name", "category", "categoryId", "type")}
        for lid, f in sorted(live["dealerFitSelections"].items())[:12]
    }

    out_json = os.path.join(EXTRACT_DIR, "parts-diff.json")
    with open(out_json, "w") as f:
        json.dump(diff, f, indent=1, default=str)
    print(f"\nwrote {os.path.relpath(out_json, REPO)}")

    d = diff
    md = f"""# MPF Phase-2 PARTS diff — extracted vs live Firestore

Generated: {d['generatedAt']} · org `{ORG_ID}` (Northside Marine) · **read-only** (no writes performed)
Auth: billh@nsmarine.com.au via Firestore REST. Extracted inputs: `tasks/mpf-audit/extracted/*.json`.

## Headline

The live org has essentially **none of the MPF parts-side data**: {d['dealerFitSelections']['live']} dealer-fit docs
(all `df-*` seed placeholders), {d['fitUpItems']['live']} fitUpItems, {d['serviceParts']['live']} serviceParts,
and the `riggingKits` / `suppliers` collections {"EXIST — unexpected" if (d['riggingKits']['collectionExists'] or d['suppliers']['collectionExists']) else "do not exist yet (as expected)"}.

| Dataset | Target collection | Extracted | Live | Matched | Missing in live | Live-only |
|---|---|---:|---:|---:|---:|---:|
| Dealer Fit Options | `dealerFitSelections` | {d['dealerFitSelections']['extracted']} | {d['dealerFitSelections']['live']} | {d['dealerFitSelections']['matched']} | {d['dealerFitSelections']['missingInLive']} | {d['dealerFitSelections']['liveOnly']} |
| Parts Maintenance | `fitUpItems` | {d['fitUpItems']['extracted']} | {d['fitUpItems']['live']} | {d['fitUpItems']['matched']} | {d['fitUpItems']['missingInLive']} | {d['fitUpItems']['liveOnly']} |
| Parts Data Drop (inventory) | `serviceParts` | {d['serviceParts']['extracted']} | {d['serviceParts']['live']} | {d['serviceParts']['matched']} | {d['serviceParts']['missingInLive']} | {d['serviceParts']['liveOnly']} |
| Rigging Kits | `riggingKits` (new) | {d['riggingKits']['extracted']} | {d['riggingKits']['live']} | {d['riggingKits']['matched']} | {d['riggingKits']['missingInLive']} | {d['riggingKits']['liveOnly']} |
| Suppliers | `suppliers` (new) | {d['suppliers']['extracted']} | {d['suppliers']['live']} | {d['suppliers']['matched']} | {d['suppliers']['missingInLive']} | {d['suppliers']['liveOnly']} |

Notes:
- Extracted counts are distinct doc ids (slugs). Rigging additionally quarantines {d['riggingKits']['quarantinedExcluded']} NLA / #N/A rows (in `rigging-kits.json.quarantined`, excluded above).
- `dealerFitSelections` live-only docs are the {len(d['dealerFitSelections']['seedPlaceholders'])} seed placeholders: {', '.join('`'+x+'`' for x in d['dealerFitSelections']['seedPlaceholders'])}.
  Import plan: soft-replace (patch `seedPlaceholder: true, superseded: true`), never delete.
- Import policy is upsert-by-natural-key (CLAUDE.md rule) — nothing here is clear-and-replace.

## Per-collection detail

### dealerFitSelections
Live sample (placeholders):
```json
{json.dumps(d['dealerFitSelections']['liveSample'], indent=1)}
```

### riggingKits / suppliers
riggingKits collection exists: **{d['riggingKits']['collectionExists']}** · suppliers collection exists: **{d['suppliers']['collectionExists']}**
(Firestore has no empty-collection concept — "does not exist" = zero documents listed. List HTTP status: riggingKits {statuses['riggingKits']}, suppliers {statuses['suppliers']}.)
{"⚠️ **Blocker for Phase-4 apply**: the listing returned HTTP 403 — firestore.rules has no match blocks for `organisations/{orgId}/riggingKits` or `organisations/{orgId}/suppliers` yet. Rules must be extended (full-ruleset paste per CLAUDE.md lesson) before import --apply can write these collections." if statuses['riggingKits'] == 403 or statuses['suppliers'] == 403 else ""}
"""
    out_md = os.path.join(EXTRACT_DIR, "PARTS_DIFF.md")
    with open(out_md, "w") as f:
        f.write(md)
    print(f"wrote {os.path.relpath(out_md, REPO)}")

    for k in ("dealerFitSelections", "fitUpItems", "serviceParts", "riggingKits", "suppliers"):
        v = diff[k]
        print(f"  {k}: extracted={v['extracted']} live={v['live']} matched={v['matched']} missing={v['missingInLive']} liveOnly={v['liveOnly']}")
    return diff


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""v1.34 — derive the two compatibility fields the quote flow filters on,
from the MPF's OWN columns (no invented data; both re-derivable and both
safely overwritten by any future MPF import):

1. steeringType — the tiller/forward-control compat check reads
   `steeringType`, which was typed on only 11 of 235 rows while the raw
   MPF `Control` column exists on 224. Mapping (motor-module.md vocab):
   'Tiller handle*' -> 'Tiller'; every other non-empty Control value
   (Remote mech, DEC*, Mech*, DBW, SBW, In Box - 703 Remote) ->
   'Forward Control'. Rows already carrying a steeringType keep it.

2. HP Rating — 17 real motors have an empty/unparseable HP Rating cell
   (F200LC, XF425 family, …) making them invisible to the HP filter.
   Their own MODEL CODE embeds the HP (F200LC -> 200, XF425USA -> 425,
   T60LC -> 60, F9.9JMHB -> 9.9). Derived values are stamped with
   `hpDerivedFromCode: true` provenance; genuine MPF cells always win.

DRY-RUN by default; --apply writes. Log: apply-log-motor-compat.jsonl.
"""
import json, os, re, sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _fs  # noqa: E402

VENDOR = "mRAzkE8PUX8GMHELCvJo"
DS = "FQ5uTMyUorrJPlpbWIY8"
ROWS = f"data-warehouse/{VENDOR}/dataSets/{DS}/rows"
LOG = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                   "tasks", "mpf-audit", "apply-log-motor-compat.jsonl")

# Model-code HP grammar: letters prefix, then the HP digits (decimal ok),
# then shaft/variant letters. XF/LF/F/T/VF prefixes all conform.
CODE_HP_RE = re.compile(r"^[A-Z]{1,3}(\d{1,3}(?:\.\d)?)[A-Z]")


def parse_hp_ok(v):
    if v is None:
        return False
    s = str(v).strip()
    if not s:
        return False
    return bool(re.search(r"\d", s)) and not s.lower() == "electric"


def main():
    apply = "--apply" in sys.argv
    rows = _fs.list_docs(ROWS)
    print(f"{len(rows)} rows loaded · mode: {'APPLY' if apply else 'DRY-RUN'}")
    steering_patches, hp_patches, skipped = [], [], []

    for r in rows:
        rid = r["_id"]
        code = str(r.get("MODEL CODE") or "").strip()
        if not code:
            continue  # section pseudo-rows

        # -- steeringType from Control --
        control = str(r.get("Control") or "").strip()
        if not r.get("steeringType") and control:
            derived = "Tiller" if control.lower().startswith("tiller") else "Forward Control"
            steering_patches.append((rid, code, control, derived))

        # -- HP Rating from MODEL CODE --
        if not parse_hp_ok(r.get("HP Rating")):
            m = CODE_HP_RE.match(code.upper())
            if m:
                hp = m.group(1)
                hp_patches.append((rid, code, str(r.get("HP Rating")), hp))
            else:
                skipped.append((rid, code, str(r.get("HP Rating"))))

    print(f"steeringType to derive: {len(steering_patches)}")
    print(f"HP Rating to derive:    {len(hp_patches)}")
    for rid, code, old, hp in hp_patches:
        print(f"   {code}: '{old}' -> {hp}")
    if skipped:
        print(f"unparseable codes SKIPPED ({len(skipped)}):", [s[1] for s in skipped])

    if not apply:
        print("\nDRY-RUN — re-run with --apply to write.")
        return

    n = 0
    with open(LOG, "a") as log:
        for rid, code, control, derived in steering_patches:
            _fs.patch_doc(f"{ROWS}/{rid}", {"steeringType": derived},
                          update_mask=["steeringType"])
            log.write(json.dumps({"at": datetime.now(timezone.utc).isoformat(), "row": rid,
                                  "code": code, "field": "steeringType",
                                  "from": None, "to": derived, "basis": f"Control='{control}'"}) + "\n")
            n += 1
        for rid, code, old, hp in hp_patches:
            _fs.patch_doc(f"{ROWS}/{rid}",
                          {"HP Rating": hp, "hpDerivedFromCode": True},
                          update_mask=["HP Rating", "hpDerivedFromCode"])
            log.write(json.dumps({"at": datetime.now(timezone.utc).isoformat(), "row": rid,
                                  "code": code, "field": "HP Rating",
                                  "from": old, "to": hp, "basis": "MODEL CODE grammar"}) + "\n")
            n += 1
    print(f"\nAPPLIED {n} patches — read back a sample:")
    for rid, code, *_ in (steering_patches[:2] + hp_patches[:2]):
        d = _fs.get_doc(f"{ROWS}/{rid}")
        print("  ", code, "| steeringType:", d.get("steeringType"), "| HP:", d.get("HP Rating"))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""v1.34 — ingest the Motor Module workbook's per-motor OPTION BANDS
(Asaf: "that stuff all exists in MPF data so should be auto assigned").

The Motor Library sheet carries, per motor row, assignment bands the
v1.31 import never flattened:
  - Rigging Option 01-50   (cols 104-153)  — org riggingKits names
  - Named accessory slots  (cols 154-158)  — FLUSHER / COWL COVER /
      MOTOR SUPPORT / FUEL FILTER / TILT LIMIT SWITCH (parts names)
  - Additional FO's 01-25  (cols 175-199)
  - Prop Option Default + 02-100 (cols 201-300) — parts names; col 201
      is the motor's DEFAULT prop ("Supplied with Motor" band)

This script parses data-import/extracted/Copy_of_Motor_Module__Motor_Library.txt
and writes ONE `mpfOptionBands` map per live MPF motor row (matched by
MODEL CODE), with counts + provenance. Excel filler grammar ('.', '0',
'') is dropped. Idempotent: re-runs overwrite the map; a fresh MPF
re-ingest can safely replace it.

DRY-RUN by default; --apply writes. Log: apply-log-motor-option-bands.jsonl
"""
import json, os, re, sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _fs  # noqa: E402

VENDOR = "mRAzkE8PUX8GMHELCvJo"
DS = "FQ5uTMyUorrJPlpbWIY8"
ROWS = f"data-warehouse/{VENDOR}/dataSets/{DS}/rows"
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SHEET = os.path.join(ROOT, "data-import", "extracted", "Copy_of_Motor_Module__Motor_Library.txt")
LOG = os.path.join(ROOT, "tasks", "mpf-audit", "apply-log-motor-option-bands.jsonl")

NAMED_SLOTS = {154: "flusher", 155: "cowlCover", 156: "motorSupport",
               157: "fuelFilter", 158: "tiltLimitSwitch"}


def is_filler(v):
    s = str(v or "").strip()
    return s in ("", ".", "0", "-", "n/a", "N/A")


def clean_list(row, lo, hi):
    out = []
    for j in range(lo, hi):
        v = row[j].strip() if j < len(row) else ""
        if not is_filler(v) and v not in out:
            out.append(re.sub(r"\s+", " ", v))
    return out


def main():
    apply = "--apply" in sys.argv
    sheet_rows = [l.rstrip("\n").split("\t") for l in open(SHEET, encoding="utf-8")]
    # Duplicate MODEL CODEs exist (e.g. F90XB standard + Tiller share a
    # code) — key primarily by the full MODEL name; keep a code index for
    # rows whose code is unambiguous.
    bands_by_model = {}
    code_rows = {}
    bands_by_code = {}
    for r in sheet_rows[4:]:
        code = (r[3].strip() if len(r) > 3 else "")
        model_name = re.sub(r"\s+", " ", (r[2].strip() if len(r) > 2 else ""))
        if not code or code.lower() in ("model",):
            continue
        rigging = clean_list(r, 104, 154)
        named = {}
        for j, key in NAMED_SLOTS.items():
            v = r[j].strip() if j < len(r) else ""
            if not is_filler(v):
                named[key] = re.sub(r"\s+", " ", v)
        fos = clean_list(r, 175, 200)
        props = clean_list(r, 201, 301)
        default_prop = None
        if len(r) > 201 and not is_filler(r[201]):
            default_prop = re.sub(r"\s+", " ", r[201].strip())
        if rigging or named or fos or props:
            band = {
                "riggingOptions": rigging,
                "propOptions": props,
                "defaultProp": default_prop,
                "additionalFOs": fos,
                "namedAccessories": named,
                "source": "Motor Module workbook · Motor Library option bands",
                "ingestedAt": datetime.now(timezone.utc).isoformat(),
            }
            bands_by_model[model_name.upper()] = band
            code_rows.setdefault(code.upper(), []).append(band)
    # Code index only where the code is unambiguous.
    bands_by_code = {c: lst[0] for c, lst in code_rows.items() if len(lst) == 1}
    dup_codes = sorted(c for c, lst in code_rows.items() if len(lst) > 1)
    print(f"workbook motors with option bands: {len(bands_by_model)} "
          f"({len(dup_codes)} duplicate codes resolved by MODEL name: {dup_codes[:6]})")
    tot = lambda k: sum(len(b[k]) for b in bands_by_model.values())
    print(f"  rigging options: {tot('riggingOptions')} · prop options: {tot('propOptions')} · "
          f"additional FOs: {tot('additionalFOs')} · named slots: {sum(len(b['namedAccessories']) for b in bands_by_model.values())}")

    live = _fs.list_docs(ROWS)
    matched, unmatched_rows, patched = 0, [], 0
    with open(LOG, "a") as log:
        for row in live:
            code = str(row.get("MODEL CODE") or row.get("Part Number") or "").strip().upper()
            if not code:
                continue
            model_name = re.sub(r"\s+", " ", str(row.get("MODEL") or row.get("Model Name") or "").strip()).upper()
            band = bands_by_model.get(model_name) or bands_by_code.get(code)
            if band is None:
                unmatched_rows.append(f"{code} ({model_name[:40]})")
                continue
            matched += 1
            if apply:
                _fs.patch_doc(row["_path"], {"mpfOptionBands": band}, update_mask=["mpfOptionBands"])
                log.write(json.dumps({"at": band["ingestedAt"], "row": row["_id"], "code": code,
                                      "rigging": len(band["riggingOptions"]),
                                      "props": len(band["propOptions"]),
                                      "fos": len(band["additionalFOs"])}) + "\n")
                patched += 1
    print(f"live rows matched: {matched} · live rows without workbook bands: {len(unmatched_rows)}")
    if unmatched_rows[:10]:
        print("  unmatched sample:", unmatched_rows[:10])
    if not apply:
        print("\nDRY-RUN — re-run with --apply to write.")
        return
    print(f"APPLIED mpfOptionBands to {patched} rows — read back F90XB:")
    f90 = next(r for r in _fs.list_docs(ROWS) if str(r.get("MODEL CODE")) == "F90XB")
    b = f90.get("mpfOptionBands") or {}
    print(f"  rigging {len(b.get('riggingOptions', []))} · props {len(b.get('propOptions', []))} "
          f"· defaultProp: {b.get('defaultProp')}")


if __name__ == "__main__":
    main()

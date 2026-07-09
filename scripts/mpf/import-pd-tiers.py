#!/usr/bin/env python3
"""
FFR-33 step 1 — import the per-boat PD (pre-delivery) tier machinery from the
Boat Module onto every live variant, so HelmLogic can compose packages exactly
like NSM's Display Sheet.

Source (Boat Module.xlsx, per boat row — see
tasks/mpf-audit/analysis/display-sheet-composition.md):
  - Three PD tiers as (Est Hrs, Sell inc GST) trios in the col 516-550 block
    (Est Hrs at 517/529/541; Sell inc GST at 525/537/549; CTD at 522/534/546).
  - Motor labour block cols 551-555: Motor PD Labour hrs, Motor Install Labour
    hrs, Rigging Kit Labour hrs, Total Engine Labour Allowance hrs.
  - Boat PD hrs at col 274.

Written to each live variant doc (joined by variant.mpfSource.row) as:
  pdTiers: [ { tier: 1|2|3, estHrs, totalCtd, sellIncGst } x up-to-3 ]
  pdLabour: { boatPdHrs, motorPdHrs, motorInstallHrs, riggingKitHrs, totalEngineHrs }

SNAPSHOT rule: sells are stored verbatim (heterogeneous rounding in the MPF —
never recompute). DRY-RUN by default; --apply writes with updateMask limited
to pdTiers + pdLabour. Log: tasks/mpf-audit/apply-log-pd-tiers.jsonl.
"""
import json, os, sys, time, warnings

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _fs  # noqa: E402

warnings.filterwarnings("ignore")
import openpyxl  # noqa: E402

APPLY = "--apply" in sys.argv
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
XLSX = os.path.join(ROOT, "tasks", "mpf-source", "Boat Module.xlsx")
LOG = os.path.join(ROOT, "tasks", "mpf-audit", "apply-log-pd-tiers.jsonl")

HF = "LafOLpLb6QIFE856TiD4"
HF_RANGES = {
    "Classic": "qo7IePnRzJxjrYyLWhTn", "Roll-Up": "EqcKQ51svI1I2Q5poFdl",
    "Ultra-Light": "QsGZuVwutEr5yyMkp97j", "Sport": "nQ2LE50z9Tbf2uss0Ote",
    "Adventure": "sEzdrM2fZsrOKA3ACrJp", "Patrol": "vfXxDuMpChteKncb7LnG",
    "Coaster": "coaster",
}
BRAND_ROUTING = {
    "Stacer": ("LWgHuGoKfUBeKZ8eWnEi", "mpf-catalog"),
    "Stabicraft": ("0cUm736tE9ON2WFLRHD0", "mpf-catalog"),
    "Surtees": ("gLAi5eHYiZDgrvjDUaos", "mpf-catalog"),
    "Haines Signature": ("DJ5GVMzLaNWNcOlRqzJV", "mpf-catalog"),
    "Jeanneau": ("lwGHoqdqNPuSZYYQAgG7", "jeanneau-mpf"),
    "Merry Fisher": ("lwGHoqdqNPuSZYYQAgG7", "merry-fisher"),
    "Cap Camarat": ("lwGHoqdqNPuSZYYQAgG7", "cap-camarat"),
    "Formosa": ("formosa", "mpf-catalog"),
}

# 0-indexed columns (verified on row 838 + display-sheet-composition.md)
TIERS = [  # (estHrs, totalCtd, sellIncGst)
    (517, 522, 525),
    (529, 534, 537),
    (541, 546, 549),
]
MOTOR_LABOUR = {"motorPdHrs": 551, "motorInstallHrs": 552,
                "riggingKitHrs": 553, "totalEngineHrs": 555}
BOAT_PD_HRS = 274


def num(v):
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def main():
    wb = openpyxl.load_workbook(XLSX, data_only=True, read_only=True)
    ws = wb["Boat Module"]
    by_row = {}
    for rn, row in enumerate(ws.iter_rows(values_only=True), 1):
        tiers = []
        for t, (h, c, s) in enumerate(TIERS, 1):
            hrs, ctd, sell = (num(row[i]) if i < len(row) else None for i in (h, c, s))
            if sell and sell > 0:
                tiers.append({"tier": t, "estHrs": hrs, "totalCtd": ctd, "sellIncGst": sell})
        labour = {k: num(row[i]) if i < len(row) else None for k, i in MOTOR_LABOUR.items()}
        labour["boatPdHrs"] = num(row[BOAT_PD_HRS]) if BOAT_PD_HRS < len(row) else None
        if tiers or any(v for v in labour.values()):
            by_row[rn] = {"pdTiers": tiers, "pdLabour": labour}
    print(f"source rows with PD data: {len(by_row)}")

    targets = []
    def walk(vendor, rid):
        for m in _fs.list_docs(f"data-warehouse/{vendor}/ranges/{rid}/models"):
            for v in _fs.list_docs(f"data-warehouse/{vendor}/ranges/{rid}/models/{m['_id']}/variants"):
                src = v.get("mpfSource") or {}
                rn = src.get("row")
                if isinstance(rn, (int, float)) and int(rn) in by_row:
                    targets.append((f"data-warehouse/{vendor}/ranges/{rid}/models/{m['_id']}/variants/{v['_id']}",
                                    int(rn), v.get("pdTiers")))
    for rname, rid in HF_RANGES.items():
        walk(HF, rid)
    for b, (vendor, rid) in BRAND_ROUTING.items():
        walk(vendor, rid)
    print(f"live variants matched to PD rows: {len(targets)}")

    wrote = 0
    log_lines = []
    for path, rn, existing in targets:
        payload = by_row[rn]
        if existing == payload["pdTiers"]:
            continue
        wrote += 1
        if APPLY:
            _fs.patch_doc(path, payload, update_mask=["pdTiers", "pdLabour"])
            log_lines.append(json.dumps({
                "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "class": "pd-tiers-import", "path": path, "sourceRow": rn,
                "tiers": payload["pdTiers"], "status": 200}))
    if APPLY and log_lines:
        with open(LOG, "a") as fh:
            fh.write("\n".join(log_lines) + "\n")
    print(f"{'APPLIED' if APPLY else 'DRY-RUN'}: {wrote} variant PD payloads")

    if APPLY:
        # spot read-back: SP560 HYP LG-W-WB (source row 838)
        for path, rn, _ in targets:
            if rn == 838:
                d = _fs.get_doc(path)
                print("read-back row 838:", path.split('/')[-1], json.dumps(d.get("pdTiers"))[:160])
                break


if __name__ == "__main__":
    main()

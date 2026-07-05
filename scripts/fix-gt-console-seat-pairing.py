#!/usr/bin/env python3
"""
FFR-32 (Asaf field bug, 2026-07-05): selecting a GT console on a Highfield
offered (and auto-charged) an RS7 seat. Product ruling: the GT console
includes the FCT (fibreglass console tank) as standard — there is NO seat
choice with a GT.

Root cause: the pre-MPF console-seat pairing hotfix (main `712ec71`)
blanket-paired every Highfield console with an RS7 seat via
`associatedSeatId`, GT included. The quote flow honors that field verbatim:
console select pushes the paired seat id (and its price) onto the quote.

Fix (data): for every Highfield model, every `optionalFeatures[]` entry with
category 'Consoles' whose name starts with 'GT' gets
  - associatedSeatId  -> None   (flow then hides the Seats category)
  - seatsIncludedNote -> 'FCT comes standard with this console — seating included'
    (rendered by the seats panel in place of the generic no-seat line)

DRY-RUN by default; --apply writes. Every write logged before/after to
tasks/mpf-audit/apply-log-gt-console.jsonl. updateMask limited to
`optionalFeatures`.
"""
import json, os, sys, time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "mpf"))
import _fs  # noqa: E402

APPLY = "--apply" in sys.argv
HF = "LafOLpLb6QIFE856TiD4"
RANGES = {
    "Classic": "qo7IePnRzJxjrYyLWhTn", "Roll-Up": "EqcKQ51svI1I2Q5poFdl",
    "Ultra-Light": "QsGZuVwutEr5yyMkp97j", "Sport": "nQ2LE50z9Tbf2uss0Ote",
    "Adventure": "sEzdrM2fZsrOKA3ACrJp", "Patrol": "vfXxDuMpChteKncb7LnG",
    "Coaster": "coaster",
}
NOTE = "FCT comes standard with this console — seating included"
LOG = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "tasks", "mpf-audit", "apply-log-gt-console.jsonl")


def is_gt_console(f):
    if (f.get("category") or "") != "Consoles":
        return False
    return str(f.get("name") or "").strip().upper().startswith("GT")


def main():
    patched_models = 0
    patched_feats = 0
    log_lines = []
    for rname, rid in RANGES.items():
        for m in _fs.list_docs(f"data-warehouse/{HF}/ranges/{rid}/models"):
            feats = m.get("optionalFeatures")
            if not isinstance(feats, list):
                continue
            changes = []
            new_feats = []
            for f in feats:
                if isinstance(f, dict) and is_gt_console(f) and (
                        f.get("associatedSeatId") or f.get("seatsIncludedNote") != NOTE):
                    before = {"id": f.get("id"), "name": f.get("name"),
                              "associatedSeatId": f.get("associatedSeatId")}
                    nf = dict(f)
                    nf["associatedSeatId"] = None
                    nf["seatsIncludedNote"] = NOTE
                    new_feats.append(nf)
                    changes.append({"before": before,
                                    "after": {"associatedSeatId": None,
                                              "seatsIncludedNote": NOTE}})
                else:
                    new_feats.append(f)
            if not changes:
                continue
            patched_models += 1
            patched_feats += len(changes)
            path = f"data-warehouse/{HF}/ranges/{rid}/models/{m['_id']}"
            print(f"{'PATCH' if APPLY else 'DRY-RUN'} {rname}/{m['_id']}: "
                  f"{len(changes)} GT console(s) unpaired "
                  f"({', '.join(str(c['before']['associatedSeatId']) for c in changes)})")
            if APPLY:
                _fs.patch_doc(path, {"optionalFeatures": new_feats},
                              update_mask=["optionalFeatures"])
                log_lines.append(json.dumps({
                    "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "class": "gt-console-seat-unpair", "path": path,
                    "changes": changes, "status": 200}))
    if APPLY and log_lines:
        with open(LOG, "a") as fh:
            fh.write("\n".join(log_lines) + "\n")
    print(f"\n{'APPLIED' if APPLY else 'DRY-RUN'}: {patched_feats} GT console "
          f"feature(s) across {patched_models} model(s)")

    if APPLY:
        print("\nread-back verification:")
        bad = 0
        for rname, rid in RANGES.items():
            for m in _fs.list_docs(f"data-warehouse/{HF}/ranges/{rid}/models"):
                for f in (m.get("optionalFeatures") or []):
                    if isinstance(f, dict) and is_gt_console(f):
                        ok = f.get("associatedSeatId") is None and f.get("seatsIncludedNote") == NOTE
                        if not ok:
                            bad += 1
                            print("  STILL WRONG:", rname, m["_id"], f.get("id"))
        print(f"  GT consoles still mispaired: {bad}")


if __name__ == "__main__":
    main()

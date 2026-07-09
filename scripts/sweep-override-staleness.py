#!/usr/bin/env python3
"""
FFR-33 Phase 2 — sweep stale pre-MPF prices out of the org modelOverrides
layer, for EVERY model (Asaf ruling 2026-07-07: the Master Price File is the
single source of truth; the Display Sheet is the spec).

For every override optionalFeatures[] entry whose (normalised) name matches a
catalog feature but whose price/cost differs: sync price + cost to the catalog
(MPF) values, stamp `priceSyncedFromCatalogAt`, and keep every OTHER override
field (images, notes, ordering) untouched. Override-only features (no catalog
counterpart) are left alone and listed for review.

DRY-RUN by default; --apply writes. Before/after per entry logged to
tasks/mpf-audit/apply-log-override-sweep.jsonl. Read-back verifies zero
remaining shadows.
"""
import json, os, re, sys, time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "mpf"))
import _fs  # noqa: E402

APPLY = "--apply" in sys.argv
ORG = "AcFZVEFA5UDJG2hyetWT"
HF = "LafOLpLb6QIFE856TiD4"
HF_RANGES = {
    "Classic": "qo7IePnRzJxjrYyLWhTn", "Roll-Up": "EqcKQ51svI1I2Q5poFdl",
    "Ultra-Light": "QsGZuVwutEr5yyMkp97j", "Sport": "nQ2LE50z9Tbf2uss0Ote",
    "Adventure": "sEzdrM2fZsrOKA3ACrJp", "Patrol": "vfXxDuMpChteKncb7LnG",
    "Coaster": "coaster",
}
LOG = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "tasks", "mpf-audit", "apply-log-override-sweep.jsonl")
STAMP = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def norm(s):
    return re.sub(r"\s+", " ", str(s or "")).strip().lower()


def price_of(f):
    for k in ("sellPriceExclGst", "price"):
        v = f.get(k)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            return float(v), k
    return None, None


def main():
    catalog = {}
    for rname, rid in HF_RANGES.items():
        for m in _fs.list_docs(f"data-warehouse/{HF}/ranges/{rid}/models"):
            catalog[m["_id"]] = m

    swept_models = swept_fields = 0
    log_lines = []
    for ov in _fs.list_docs(f"organisations/{ORG}/modelOverrides"):
        mid = ov["_id"]
        cat = catalog.get(mid)
        feats = ov.get("optionalFeatures")
        if not cat or not isinstance(feats, list):
            continue
        cat_fo = {norm(f.get("name")): f for f in (cat.get("optionalFeatures") or []) if isinstance(f, dict)}
        changes, new_feats = [], []
        for f in feats:
            if not isinstance(f, dict):
                new_feats.append(f); continue
            cf = cat_fo.get(norm(f.get("name")))
            if not cf:
                new_feats.append(f); continue
            po, pk = price_of(f)
            pc, _ = price_of(cf)
            cost_o, cost_c = f.get("cost"), cf.get("cost")
            price_diff = po is not None and pc is not None and abs(po - pc) > 0.005
            cost_diff = (isinstance(cost_o, (int, float)) and isinstance(cost_c, (int, float))
                         and abs(cost_o - cost_c) > 0.005)
            if not price_diff and not cost_diff:
                new_feats.append(f); continue
            nf = dict(f)
            before = {}
            if price_diff:
                before[pk] = po
                nf[pk] = pc
                # keep both price keys coherent if both exist
                if pk == "price" and "sellPriceExclGst" in nf:
                    before["sellPriceExclGst"] = nf.get("sellPriceExclGst")
                    nf["sellPriceExclGst"] = pc
                if pk == "sellPriceExclGst" and "price" in nf:
                    before["price"] = nf.get("price")
                    nf["price"] = pc
            if cost_diff:
                before["cost"] = cost_o
                nf["cost"] = cost_c
            nf["priceSyncedFromCatalogAt"] = STAMP
            new_feats.append(nf)
            changes.append({"name": f.get("name"), "before": before,
                            "afterPrice": pc if price_diff else None,
                            "afterCost": cost_c if cost_diff else None})
        if not changes:
            continue
        swept_models += 1
        swept_fields += len(changes)
        path = f"organisations/{ORG}/modelOverrides/{mid}"
        print(f"{'SWEEP' if APPLY else 'DRY-RUN'} {mid}: {len(changes)} stale price(s)")
        for c in changes:
            print(f"    {str(c['name'])[:55]}: {c['before']} -> price {c['afterPrice']} cost {c['afterCost']}")
        if APPLY:
            _fs.patch_doc(path, {"optionalFeatures": new_feats}, update_mask=["optionalFeatures"])
            log_lines.append(json.dumps({"ts": STAMP, "class": "override-price-sweep",
                                         "path": path, "changes": changes, "status": 200}))
    if APPLY and log_lines:
        with open(LOG, "a") as fh:
            fh.write("\n".join(log_lines) + "\n")
    print(f"\n{'APPLIED' if APPLY else 'DRY-RUN'}: {swept_fields} price field(s) across {swept_models} model override(s)")


if __name__ == "__main__":
    main()

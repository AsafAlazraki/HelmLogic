#!/usr/bin/env python3
"""MPF Phase-2 PARTS importer — idempotent upsert, DEFAULT DRY-RUN.

    python3 scripts/mpf/import-parts.py                 # dry-run (no writes, prints plan)
    python3 scripts/mpf/import-parts.py --apply         # writes (Phase-4 only, after approval)
    python3 scripts/mpf/import-parts.py --only=suppliers,riggingKits

Targets (org AcFZVEFA5UDJG2hyetWT / Northside Marine):
  dealer-fit.json         -> organisations/{org}/dealerFitSelections/{slug(trimmed DFO key)}
  parts-maintenance.json  -> organisations/{org}/fitUpItems/{slug(composite code)}
  parts-inventory.json    -> organisations/{org}/serviceParts/{slug(franchise-part)}
  rigging-kits.json       -> organisations/{org}/riggingKits/{slug(partNo)}     (NEW, D8 org-level)
  suppliers.json          -> organisations/{org}/suppliers/{slug(supplierId)}   (NEW)

Safety rules (per CLAUDE.md import lesson + phase-2 brief):
- NEVER clear-and-replace. Upsert by natural key only: PATCH with an updateMask
  restricted to the managed fields, so operator-added fields survive untouched.
- Existing df-* seed placeholders in dealerFitSelections are SOFT-REPLACED:
  patched with seedPlaceholder:true + superseded:true (never deleted).
- Quarantined rigging rows (NLA / #N/A) are NOT imported.
- Every write (apply mode) logs before/after to tasks/mpf-audit/apply-log-parts.jsonl.
- Duplicate doc-ids within a dataset: first occurrence wins; later ones are reported,
  not silently overwritten.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import (APPLY_LOG, FS_BASE, ORG_ID, REPO, append_audit, list_collection,
                     load_dataset, now_iso, sign_in, slug, to_fs)

import requests

APPLY = "--apply" in sys.argv
ONLY = next((a.split("=", 1)[1].split(",") for a in sys.argv if a.startswith("--only=")), None)
WAVE = "mpf-phase2.parts"


def provenance(source, row, key):
    return {"wave": WAVE, "source": source, "sourceRow": row, "sourceKey": key, "importedAt": now_iso()}


# ------------------------------------------------------------------ payload builders

def build_dealer_fit(row):
    section = row["section"] or "MPF – Uncategorised"
    return {
        "name": row["name"],
        "type": "item",
        "code": row["key"],
        "category": section,
        "categoryId": "mpf-" + (slug(row["section"]) if row["section"] else "uncategorised"),
        "items": [{
            "rowId": row["docId"],
            "vendorId": None,  # org-level parts source (Parts Module), not a catalog vendor
            "data": {
                "Description": row["longDescription"] or row["name"],
                "Act Sell": row["actSell"],
                "Act CTD": row["actCtd"],
                "Image Link": row["imageLink"],
            },
        }],
        "components": [
            {k: c.get(k) for k in ("slot", "name", "code", "ctd", "sell", "labHrs")}
            for c in row["components"][:30]
        ],
        "imageLink": row["imageLink"],
        "longDescription": row["longDescription"],
        "totalLabHrs": row["totalLabHrs"],
        "rebate": row["rebate"],
        "mpfImport": provenance("Parts Module.xlsx#Dealer Fit Module", row["sourceRow"], row["key"]),
    }


def derive_tier(row):
    """FitUpItem tier ('simple'|'medium'|'complex') from install type + hours."""
    it = (row.get("installType") or "").lower()
    hrs = row.get("installHrs") or 0
    if "supply only" in it or hrs <= 0.5:
        return "simple"
    if hrs <= 2:
        return "medium"
    return "complex"


def build_fit_up_item(row):
    return {
        "name": row["desc"] or row["supplierDesc"] or row["code"],
        "partNumber": row["code"],
        "tier": derive_tier(row),
        "category": row["section"],
        "cost": row["ctd"],
        "sellPrice": row["sell"],
        "notes": row["supplierDesc"],
        "supplierId": row["supplier"],
        "installType": row["installType"],
        "installHours": row["installHrs"],
        "labourDollars": row["labourDollars"],
        "totalCostIncInstall": row["totalCtd"],
        "sellIncInstall": row["sellIncInstall"],
        "operationCode": row["opCode"],
        "operationDescription": row["opDesc"],
        "mpfImport": provenance("Parts Module.xlsx#Parts Maintenance", row["sourceRow"], row["compositeKey"]),
    }


def build_service_part(row):
    return {
        "partNumber": row["part"],
        "name": row["desc"] or row["part"],
        "franchise": row["franchise"],
        "cost": row["cost"],
        "sellPrice": row["retailExGst"],       # ex GST, derived from 'Retail+ GST'
        "listExGst": row["list"],
        "retailIncGst": row["retailIncGst"],
        "stockLevel": row["stockOH"],
        "bin": row["bin"],
        "gstNormalized": row["gstNormalized"],
        "mpfImport": provenance("Parts Module.xlsx#Parts Data Drop", row["sourceRow"], row["key"]),
    }


def build_rigging_kit(row):
    return {
        "partNumber": row["partNo"],
        "description": row["description"],
        "section": row["section"],
        "build": row["build"],
        "status": row["status"],
        "dealerCost": row["dealerCost"],
        "freight": row["freight"],
        "kitCost": row["kitCtd"],
        "sellPriceExclGst": row["retailExGst"],
        "tradePriceExclGst": row["tradeExGst"],
        "subDealerPriceExclGst": row["subDealerExGst"],
        "installHours": row["installHrs"],
        "installLabour": row["installLabour"],
        "installAdditionalParts": row["installAdditionalParts"],
        "installSundry": row["installSundry"],
        "totalCostInstalled": row["totalCtd"],
        "totalSellInstalledExclGst": row["totalSellExGst"],
        "totalTradeInstalledExclGst": row["totalTradeExGst"],
        "totalSubDealerInstalledExclGst": row["totalSubDealerExGst"],
        "components": row["components"],
        "inclusionFlags": row["inclusionFlags"],
        "dealerCost2022": row["dealerCost2022"],
        "mpfImport": provenance("Rigging Module.xlsx#Rigging Kits", row["sourceRow"], row["partNoRaw"]),
    }


def build_supplier(row):
    return {
        "supplierId": row["supplierId"],
        "name": row["name"],
        "address": row["address"],
        "phone": row["phone"],
        "mobile": row["mobile"],
        "email": row["email"],
        "contact": row["contact"],
        "abn": row["abn"],
        "acn": row["acn"],
        "paymentTerms": row["paymentTerms"],
        "paymentType": row["paymentType"],
        "creditLimit": row["creditLimit"],
        "dmsConfig": row["dmsConfig"],
        "mpfImport": provenance("Supplier Module.xlsx#Sheet1", row["sourceRow"], row["supplierId"]),
    }


# ------------------------------------------------------------------ upsert engine

def log_write(entry):
    with open(APPLY_LOG, "a") as f:
        f.write(json.dumps(entry, default=str) + "\n")


def managed_equal(payload, live):
    """Compare managed fields only (ignore importedAt provenance timestamp churn)."""
    for k, v in payload.items():
        if k == "mpfImport":
            continue
        if live.get(k) != v:
            return False
    return True


def patch_doc(session, headers, path, payload):
    mask = "&".join(f"updateMask.fieldPaths={requests.utils.quote(k, safe='')}" for k in payload)
    url = f"{FS_BASE}/{path}?{mask}"
    r = session.patch(url, headers=headers, json={"fields": {k: to_fs(v) for k, v in payload.items()}}, timeout=60)
    return r.status_code, (None if r.status_code == 200 else r.text[:300])


def upsert_dataset(session, headers, label, coll, rows, builder, id_field="docId",
                   soft_replace_ids=None):
    live, st = list_collection(session, headers, f"organisations/{ORG_ID}/{coll}")
    plan = {"collection": coll, "listStatus": st, "live": len(live), "create": 0, "update": 0,
            "unchanged": 0, "dupSkipped": 0, "errors": 0, "softReplaced": 0}
    if st == 403:
        plan["warning"] = "list returned 403 — rules do not cover this path yet; apply would fail"
    seen_ids = set()
    dup_ids = []
    for row in rows:
        doc_id = row[id_field]
        if doc_id in seen_ids:
            plan["dupSkipped"] += 1
            dup_ids.append(doc_id)
            continue
        seen_ids.add(doc_id)
        payload = builder(row)
        before = live.get(doc_id)
        if before is None:
            action = "create"
        elif managed_equal(payload, before):
            action = "unchanged"
        else:
            action = "update"
        plan[action] += 1
        if APPLY and action in ("create", "update"):
            path = f"organisations/{ORG_ID}/{coll}/{doc_id}"
            code, err = patch_doc(session, headers, path, payload)
            if code != 200:
                plan["errors"] += 1
            log_write({"ts": now_iso(), "wave": WAVE, "action": action, "path": path,
                       "status": code, "error": err, "before": before, "after": payload})

    # soft-replacement of seed placeholders (dealerFitSelections df-* docs)
    if soft_replace_ids:
        plan["softReplaceIds"] = sorted(soft_replace_ids)
        for pid in sorted(soft_replace_ids):
            before = live.get(pid)
            if before is None:
                continue
            if before.get("superseded") is True:
                continue
            plan["softReplaced"] += 1
            if APPLY:
                payload = {"seedPlaceholder": True, "superseded": True,
                           "supersededAt": now_iso(), "supersededBy": WAVE}
                path = f"organisations/{ORG_ID}/{coll}/{pid}"
                code, err = patch_doc(session, headers, path, payload)
                if code != 200:
                    plan["errors"] += 1
                log_write({"ts": now_iso(), "wave": WAVE, "action": "soft-replace", "path": path,
                           "status": code, "error": err, "before": before, "after": payload})

    if dup_ids:
        plan["dupIds"] = sorted(set(dup_ids))[:30]
    mode = "APPLY" if APPLY else "dry-run"
    print(f"  [{mode}] {label} -> {coll}: create={plan['create']} update={plan['update']} "
          f"unchanged={plan['unchanged']} dupSkipped={plan['dupSkipped']} "
          f"softReplace={plan['softReplaced']} errors={plan['errors']}"
          + (f"  ⚠️ {plan.get('warning')}" if plan.get("warning") else ""))
    return plan


def main():
    print(f"=== MPF Phase-2 PARTS import | {'APPLY (writing!)' if APPLY else 'DRY-RUN (no writes)'} | org={ORG_ID} ===")
    tok = sign_in()
    session = requests.Session()
    headers = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}

    dfo = load_dataset("dealer-fit.json")
    pm = load_dataset("parts-maintenance.json")
    inv = load_dataset("parts-inventory.json")
    rk = load_dataset("rigging-kits.json")
    sup = load_dataset("suppliers.json")

    datasets = {
        "dealerFitSelections": lambda: upsert_dataset(
            session, headers, "Dealer Fit Options", "dealerFitSelections", dfo["rows"],
            build_dealer_fit,
            soft_replace_ids=[i for i in
                              list_collection(session, headers, f"organisations/{ORG_ID}/dealerFitSelections")[0]
                              if i.startswith("df-")]),
        "fitUpItems": lambda: upsert_dataset(
            session, headers, "Parts Maintenance", "fitUpItems", pm["rows"], build_fit_up_item),
        "serviceParts": lambda: upsert_dataset(
            session, headers, "Parts Data Drop (inventory)", "serviceParts", inv["rows"], build_service_part),
        "riggingKits": lambda: upsert_dataset(
            session, headers, "Rigging Kits", "riggingKits", rk["rows"], build_rigging_kit),
        "suppliers": lambda: upsert_dataset(
            session, headers, "Suppliers", "suppliers", sup["rows"], build_supplier),
    }

    plans = {}
    for name, fn in datasets.items():
        if ONLY and name not in ONLY:
            continue
        plans[name] = fn()

    print(f"\nquarantined rigging rows NOT imported: {len(rk.get('quarantined', []))}")
    total = {k: sum(p.get(k, 0) for p in plans.values()) for k in ("create", "update", "unchanged", "dupSkipped", "softReplaced", "errors")}
    print(f"totals: {total}")
    if not APPLY:
        print("\nDRY-RUN complete — no writes performed. Re-run with --apply for Phase 4 (after approval).")
    return plans, total


if __name__ == "__main__":
    main()

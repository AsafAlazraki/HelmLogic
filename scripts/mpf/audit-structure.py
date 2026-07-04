#!/usr/bin/env python3
"""Structural-consistency audit — READ-ONLY.

Five hunt classes:
  1. RULES COVERAGE  — every Firestore path referenced in src/ cross-checked
     against firestore.rules match blocks (the v1.9/v1.15 403 incident class).
     Static analysis + live empirical probes for collectionGroup queries.
  2. MODULE INTEGRITY — modules.mainVendorId resolves; every priced Boat Brand
     vendor has an org-facing module; nav-links routes all exist as pages.
  3. TYPE CONSISTENCY — sample 50 docs per major collection; price-bearing
     fields that are strings; createdAt/date field type mixtures.
  4. ORPHANS — models with zero variants; variants under nameless models;
     dealerFitSelections with empty items[]; engineServiceSchedules with
     empty intervals.
  5. DUPLICATE DISPLAY IDENTITY — within each picker-feeding collection,
     duplicate display names with differing prices.

Writes tasks/test-evidence/structure-audit.json and prints a summary.
Never writes to Firestore (only :runQuery / GET list / GET doc).

Usage:  python3 scripts/mpf/audit-structure.py
"""
import collections
import concurrent.futures
import datetime
import json
import os
import re
import sys
import urllib.error
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _fs  # noqa: E402  (shared read helpers; we only use read paths)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "src")
RULES_FILE = os.path.join(ROOT, "firestore.rules")
OUT_JSON = os.path.join(ROOT, "tasks", "test-evidence", "structure-audit.json")

NSM_ORG = "AcFZVEFA5UDJG2hyetWT"

# ---------------------------------------------------------------------------
# Raw Firestore read helpers (we need RAW value envelopes for type checks)
# ---------------------------------------------------------------------------

def list_raw(path, page_size=300):
    """List raw document envelopes (fields keep stringValue/doubleValue tags)."""
    docs, page_token = [], None
    while True:
        url = f"{_fs.BASE}/{urllib.parse.quote(path)}?pageSize={page_size}"
        if page_token:
            url += f"&pageToken={page_token}"
        res = _fs._req(url)
        docs.extend(res.get("documents", []))
        page_token = res.get("nextPageToken")
        if not page_token:
            break
    return docs


def run_query_raw(parent_rel, collection_id, select=None, limit=None,
                  all_descendants=False, where=None):
    """Scoped structured query returning raw docs. parent_rel '' = root."""
    sq = {"from": [{"collectionId": collection_id,
                    "allDescendants": all_descendants}]}
    if select:
        sq["select"] = {"fields": [{"fieldPath": f} for f in select]}
    if limit:
        sq["limit"] = limit
    if where:
        sq["where"] = where
    url = f"{_fs.BASE}{parent_rel}:runQuery"
    res = _fs._req(url, method="POST", body={"structuredQuery": sq})
    return [r["document"] for r in res if "document" in r]


def rel_path(raw_doc):
    return raw_doc["name"].split("/documents/")[1]


def decoded(raw_doc):
    return _fs.decode_doc(raw_doc)


# ---------------------------------------------------------------------------
# CLASS 1 — RULES COVERAGE
# ---------------------------------------------------------------------------

WRITE_FN_RE = re.compile(r"\b(addDoc|setDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\b")


def extract_code_refs():
    """Collect (path_segments, is_collection, writes, file:line) from src/."""
    refs = {}
    cg_refs = {}
    tmpl_re = re.compile(r"(collection|doc)\(\s*(?:firestore|db)\s*,\s*`([^`]+)`")
    single_re = re.compile(r"(collection|doc)\(\s*(?:firestore|db)\s*,\s*'([^']+)'((?:\s*,\s*(?:'[^']*'|[A-Za-z_$][\w$.\[\]?!]*))*)")
    arg_re = re.compile(r"'([^']*)'|([A-Za-z_$][\w$.\[\]?!]*)")
    cg_re = re.compile(r"collectionGroup\(\s*(?:firestore|db)?\s*,?\s*'([^']+)'")
    for dirpath, _dirs, files in os.walk(SRC):
        for fn in files:
            if not fn.endswith((".ts", ".tsx")):
                continue
            fp = os.path.join(dirpath, fn)
            rel = os.path.relpath(fp, ROOT)
            try:
                lines = open(fp, encoding="utf-8").read().splitlines()
            except OSError:
                continue
            for i, line in enumerate(lines, 1):
                ctx = " ".join(lines[max(0, i - 2):i + 1])  # write-call heuristic window
                writes = bool(WRITE_FN_RE.search(ctx))
                for m in cg_re.finditer(line):
                    cg_refs.setdefault(m.group(1), []).append(f"{rel}:{i}")
                for m in tmpl_re.finditer(line):
                    kind, path = m.group(1), m.group(2)
                    segs = [("*" if "${" in s else s) for s in path.split("/") if s]
                    _add_ref(refs, segs, kind, writes, f"{rel}:{i}")
                for m in single_re.finditer(line):
                    kind = m.group(1)
                    segs = [m.group(2)]
                    for am in arg_re.finditer(m.group(3) or ""):
                        segs.append(am.group(1) if am.group(1) is not None else "*")
                    if "${" in segs[0]:  # template already handled
                        continue
                    _add_ref(refs, [("*" if s == "*" or "${" in s else s) for s in segs],
                             kind, writes, f"{rel}:{i}")
    return refs, cg_refs


def _add_ref(refs, segs, kind, writes, where):
    # collection() paths have odd seg counts; doc() even — but callers often
    # build doc(collection) chains; normalise to the COLLECTION path.
    if kind == "doc" and len(segs) % 2 == 0:
        segs = segs[:-1]
    if kind == "collection" and len(segs) % 2 == 0:
        segs = segs[:-1]  # collection ref built with trailing doc id — trim
    if not segs:
        return
    key = "/".join(segs)
    ent = refs.setdefault(key, {"segments": segs, "writes": False, "sites": []})
    ent["writes"] = ent["writes"] or writes
    if len(ent["sites"]) < 6:
        ent["sites"].append(where + (" [w]" if writes else ""))


def parse_rules():
    """Parse firestore.rules into (segments, [(ops, cond)]) rule entries."""
    text = re.sub(r"//[^\n]*", "", open(RULES_FILE, encoding="utf-8").read())
    token_re = re.compile(
        r"match\s+(\S+)\s*\{|allow\s+([^:;{]+):\s*if\s+(.*?);|[{}]", re.S)
    ctx, rules = [], []
    for m in token_re.finditer(text):
        tok = m.group(0)
        if tok.startswith("match"):
            ctx.append([s for s in m.group(1).split("/") if s])
        elif tok.startswith("allow"):
            path = [s for frame in ctx for s in frame]
            # strip the /databases/{database}/documents prefix
            if path[:3] == ["databases", "{database}", "documents"]:
                path = path[3:]
            ops = [o.strip() for o in m.group(2).split(",")]
            cond = " ".join(m.group(3).split())
            rules.append({"segments": path, "ops": ops, "cond": cond,
                          "adminOnly": "isAdmin()" in cond and "isSignedIn" not in cond
                          and "isOwner" not in cond})
        elif tok == "{":
            ctx.append([])
        else:
            if ctx:
                ctx.pop()
    return rules


def _seg_match(rule_segs, path_segs):
    """Can rule pattern match doc path? '{x}'=1 seg, '{x=**}'>=1 seg, code '*'
    matches anything."""
    if not rule_segs:
        return not path_segs
    r = rule_segs[0]
    if r.startswith("{") and r.endswith("=**}"):
        for k in range(1, len(path_segs) + 1):
            if _seg_match(rule_segs[1:], path_segs[k:]):
                return True
        return False
    if not path_segs:
        return False
    if r.startswith("{") or path_segs[0] == "*" or r == path_segs[0]:
        return _seg_match(rule_segs[1:], path_segs[1:])
    return False


def audit_rules_coverage():
    refs, cg_refs = extract_code_refs()
    rules = parse_rules()
    non_admin_rules = [r for r in rules if not r["adminOnly"]]
    findings = {"unruledPaths": [], "writeGaps": [], "collectionGroupGaps": [],
                "rulesWithoutCode": [], "crossUserWriteConflicts": []}

    for key, ent in sorted(refs.items()):
        doc_path = ent["segments"] + ["*"]
        matches = [r for r in non_admin_rules if _seg_match(r["segments"], doc_path)]
        if not matches:
            findings["unruledPaths"].append({
                "path": key, "writes": ent["writes"], "sites": ent["sites"]})
            continue
        can_write = any(any(o in ("write", "create", "update", "delete") for o in r["ops"])
                        for r in matches)
        if ent["writes"] and not can_write:
            # writable only via owner-scoped or recursive read-only rules
            findings["writeGaps"].append({
                "path": key, "sites": ent["sites"],
                "matchedRules": ["/".join(r["segments"]) + " " + ",".join(r["ops"])
                                 for r in matches]})

    # collectionGroup queries need a /{path=**}/X/{id} style rule
    for cid, sites in sorted(cg_refs.items()):
        ok = any(r["segments"] and r["segments"][0].endswith("=**}")
                 and len(r["segments"]) == 3 and r["segments"][1] == cid
                 and any(o in ("read", "get", "list") for o in r["ops"])
                 for r in non_admin_rules)
        probe = None
        try:
            run_query_raw("", cid, limit=1, all_descendants=True)
            probe = "OK"
        except urllib.error.HTTPError as e:
            probe = f"HTTP {e.code}"
        if not ok or probe != "OK":
            findings["collectionGroupGaps"].append(
                {"collectionId": cid, "ruleFound": ok, "liveProbe": probe,
                 "sites": sites})
        else:
            findings.setdefault("collectionGroupOk", []).append(
                {"collectionId": cid, "liveProbe": probe})

    # rules present but never referenced from src (informational).
    # Compare each rule's literal collection segments against code refs.
    all_code_segs = {s for ent in refs.values() for s in ent["segments"] if s != "*"}
    for r in non_admin_rules:
        segs = r["segments"]
        if not segs or segs[0].startswith("{"):
            continue
        literal_cols = [s for i, s in enumerate(segs) if i % 2 == 0 and not s.startswith("{")]
        if literal_cols and literal_cols[-1] not in all_code_segs and \
                segs[0] not in ("clients", "vessel_models", "roles_admin"):
            findings["rulesWithoutCode"].append("/".join(segs))
    findings["rulesWithoutCode"] = sorted(set(findings["rulesWithoutCode"]))

    # cross-user notification writes vs isOwner rule (specific known class)
    for key, ent in refs.items():
        if ent["segments"][:1] == ["users"] and "notifications" in ent["segments"] and ent["writes"]:
            findings["crossUserWriteConflicts"].append({
                "path": key, "sites": ent["sites"],
                "rule": "users/{userId}/notifications requires isOwner(userId) || isAdmin() — "
                        "writing another user's notifications 403s for non-admins"})
    return findings, refs, cg_refs


# ---------------------------------------------------------------------------
# CLASS 2 — MODULE INTEGRITY
# ---------------------------------------------------------------------------

def audit_nav_routes():
    nav = open(os.path.join(SRC, "lib", "nav-links.ts"), encoding="utf-8").read()
    hrefs = sorted(set(re.findall(r"href:\s*'([^']+)'", nav)))
    missing = [h for h in hrefs
               if not os.path.exists(os.path.join(SRC, "app", "(app)", h.lstrip("/"), "page.tsx"))]
    return {"navHrefs": hrefs, "missingPages": missing}


def walk_boat_catalog(vendors):
    """vendor -> ranges -> models -> variants (raw). Returns per-brand tree."""
    boat_vendors = [v for v in vendors if v.get("vendorType") == "Boat Brand"]
    tree = {}
    jobs = []
    for v in boat_vendors:
        ranges = _fs.list_docs(f"data-warehouse/{v['_id']}/ranges")
        tree[v["_id"]] = {"name": v.get("name"), "ranges": {}}
        for r in ranges:
            tree[v["_id"]]["ranges"][r["_id"]] = {"name": r.get("name"), "models": {}}
            jobs.append((v["_id"], r["_id"]))

    def load_models(job):
        vid, rid = job
        models = list_raw(f"data-warehouse/{vid}/ranges/{rid}/models")
        return vid, rid, models

    model_jobs = []
    with concurrent.futures.ThreadPoolExecutor(8) as ex:
        for vid, rid, models in ex.map(load_models, jobs):
            for mraw in models:
                md = decoded(mraw)
                tree[vid]["ranges"][rid]["models"][md["_id"]] = {
                    "name": md.get("name"), "raw": mraw, "variants": []}
                model_jobs.append((vid, rid, md["_id"]))

    def load_variants(job):
        vid, rid, mid = job
        return vid, rid, mid, list_raw(
            f"data-warehouse/{vid}/ranges/{rid}/models/{mid}/variants")

    with concurrent.futures.ThreadPoolExecutor(8) as ex:
        for vid, rid, mid, variants in ex.map(load_variants, model_jobs):
            tree[vid]["ranges"][rid]["models"][mid]["variants"] = variants
    return tree


def audit_module_integrity(vendors, modules, tree):
    vendor_ids = {v["_id"] for v in vendors}
    findings = {"danglingMainVendorId": [], "pricedBrandsWithoutModule": [],
                "duplicateModuleNames": [], "nav": audit_nav_routes()}
    for m in modules:
        mv = m.get("mainVendorId")
        if mv and mv not in vendor_ids:
            findings["danglingMainVendorId"].append(
                {"moduleId": m["_id"], "name": m.get("name"), "mainVendorId": mv})
    moduled_vendors = {m.get("mainVendorId") for m in modules if m.get("mainVendorId")}
    for vid, node in tree.items():
        priced = 0
        for r in node["ranges"].values():
            for mo in r["models"].values():
                for vraw in mo["variants"]:
                    v = decoded(vraw)
                    if isinstance(v.get("sellPriceExclGst"), (int, float)) and v["sellPriceExclGst"] > 0:
                        priced += 1
        if priced and vid not in moduled_vendors:
            findings["pricedBrandsWithoutModule"].append(
                {"vendorId": vid, "name": node["name"], "pricedVariants": priced})
        node["_pricedVariants"] = priced
    name_groups = collections.defaultdict(list)
    for m in modules:
        name_groups[(m.get("name") or "").strip().lower()].append(
            {"moduleId": m["_id"], "name": m.get("name"),
             "moduleType": m.get("moduleType"), "mainVendorId": m.get("mainVendorId")})
    for nm, grp in name_groups.items():
        if nm and len(grp) > 1:
            findings["duplicateModuleNames"].append(grp)
    return findings


# ---------------------------------------------------------------------------
# CLASS 3 — TYPE CONSISTENCY
# ---------------------------------------------------------------------------

PRICE_KEY_RE = re.compile(
    r"(?i)(price|cost|sell|ctd|retail|rrp|margin|labour|labor|amount|freight|"
    r"hourlyrate|total|deposit|rebate|trade|dealerbuy)")
DATE_KEY_RE = re.compile(r"(?i)(createdat|updatedat|importedat|lastsentat|"
                         r"lockedat|date$|dateat$|^at$|timestamp)")
NUMERIC_STR_RE = re.compile(r"^\s*\$?\s*-?[\d,]+(\.\d+)?\s*$")


def scan_raw_value(prefix, val, price_hits, date_hits):
    if "mapValue" in val:
        for k, v in (val["mapValue"].get("fields") or {}).items():
            scan_raw_value(f"{prefix}.{k}" if prefix else k, v, price_hits, date_hits)
    elif "arrayValue" in val:
        for i, v in enumerate((val["arrayValue"].get("values") or [])[:5]):
            scan_raw_value(f"{prefix}[{i}]", v, price_hits, date_hits)
    else:
        leaf = prefix.rsplit(".", 1)[-1].split("[")[0]
        kind = next(iter(val.keys()))
        if PRICE_KEY_RE.search(leaf) and kind == "stringValue":
            sval = val["stringValue"]
            if NUMERIC_STR_RE.match(sval) or sval.upper() in ("POA", "TBA", "N/A"):
                price_hits.append((prefix, sval))
        if DATE_KEY_RE.search(leaf):
            date_hits.append((leaf, kind))


def audit_type_consistency(tree):
    samples = {}
    # variants: spread sample across brands
    var_sample = []
    for vid, node in tree.items():
        per_brand = 0
        for r in node["ranges"].values():
            for mo in r["models"].values():
                for vraw in mo["variants"]:
                    if per_brand < 8:
                        var_sample.append(vraw)
                        per_brand += 1
    samples["variants (data-warehouse/*/ranges/*/models/*/variants)"] = var_sample[:50]

    org_rel = f"/organisations/{NSM_ORG}"
    for col in ["dealerFitSelections", "fitUpItems", "serviceParts",
                "riggingKits", "serviceOperations", "engineServiceSchedules"]:
        samples[f"organisations/{{org}}/{col}"] = run_query_raw(org_rel, col, limit=50)

    # motor rows: yamaha dataSets rows
    motor_rows = []
    yam = "mRAzkE8PUX8GMHELCvJo"
    for ds in _fs.list_docs(f"data-warehouse/{yam}/dataSets"):
        if len(motor_rows) >= 50:
            break
        motor_rows.extend(list_raw(f"data-warehouse/{yam}/dataSets/{ds['_id']}/rows")[:25])
    samples["motor rows (data-warehouse/yamaha/dataSets/*/rows)"] = motor_rows[:50]

    report = {}
    for col, docs in samples.items():
        price_hits, date_field_kinds = [], collections.defaultdict(collections.Counter)
        for d in docs:
            ph, dh = [], []
            for k, v in (d.get("fields") or {}).items():
                scan_raw_value(k, v, ph, dh)
            for p, sval in ph:
                price_hits.append({"doc": rel_path(d), "field": p, "value": sval})
            for leaf, kind in dh:
                date_field_kinds[leaf][kind] += 1
        mixtures = {f: dict(c) for f, c in date_field_kinds.items() if len(c) > 1}
        non_ts = {f: dict(c) for f, c in date_field_kinds.items()
                  if "timestampValue" not in c}
        report[col] = {
            "sampled": len(docs),
            "stringPriceFields": price_hits[:25],
            "stringPriceCount": len(price_hits),
            "dateFieldTypeMixtures": mixtures,
            "dateFieldsNeverTimestamp": non_ts,
        }
    return report


# ---------------------------------------------------------------------------
# CLASS 4 — ORPHANS
# ---------------------------------------------------------------------------

def audit_orphans(tree):
    findings = {"modelsWithZeroVariants": [], "variantsUnderNamelessModels": [],
                "dealerFitSelectionsEmptyItems": [],
                "engineServiceSchedulesEmptyIntervals": {"legacyNoPricing": 0,
                                                          "unexplained": []}}
    for vid, node in tree.items():
        for rid, r in node["ranges"].items():
            for mid, mo in r["models"].items():
                if not mo["variants"]:
                    findings["modelsWithZeroVariants"].append(
                        {"brand": node["name"], "path": f"data-warehouse/{vid}/ranges/{rid}/models/{mid}",
                         "modelName": mo["name"]})
                if not (mo["name"] or "").strip() and mo["variants"]:
                    findings["variantsUnderNamelessModels"].append(
                        {"brand": node["name"],
                         "path": f"data-warehouse/{vid}/ranges/{rid}/models/{mid}",
                         "variantCount": len(mo["variants"])})

    org_rel = f"/organisations/{NSM_ORG}"
    dfs = run_query_raw(org_rel, "dealerFitSelections", select=["name", "type", "items"])
    for d in dfs:
        dd = decoded(d)
        items = dd.get("items")
        if isinstance(items, list) and len(items) == 0 or items is None:
            findings["dealerFitSelectionsEmptyItems"].append(
                {"id": dd["_id"], "name": dd.get("name"), "type": dd.get("type"),
                 "items": "missing" if items is None else "empty"})

    ess = run_query_raw(org_rel, "engineServiceSchedules",
                        select=["engineModel", "intervals", "legacyNoPricing"])
    for d in ess:
        dd = decoded(d)
        if not dd.get("intervals"):
            if dd.get("legacyNoPricing"):
                findings["engineServiceSchedulesEmptyIntervals"]["legacyNoPricing"] += 1
            else:
                findings["engineServiceSchedulesEmptyIntervals"]["unexplained"].append(
                    {"id": dd["_id"], "engineModel": dd.get("engineModel")})
    findings["dealerFitSelectionsTotal"] = len(dfs)
    findings["engineServiceSchedulesTotal"] = len(ess)
    return findings


# ---------------------------------------------------------------------------
# CLASS 5 — DUPLICATE DISPLAY IDENTITY
# ---------------------------------------------------------------------------

def dup_groups(rows, name_key, price_key, id_key="_id"):
    """rows: decoded dicts. Returns groups sharing a display name where prices
    differ."""
    groups = collections.defaultdict(list)
    for r in rows:
        nm = (str(r.get(name_key) or "")).strip().lower()
        if nm:
            groups[nm].append(r)
    out = []
    for nm, grp in groups.items():
        if len(grp) < 2:
            continue
        prices = {json.dumps(g.get(price_key)) for g in grp}
        if len(prices) > 1:
            out.append({"name": grp[0].get(name_key),
                        "count": len(grp),
                        "entries": [{"id": g.get(id_key), "price": g.get(price_key)}
                                    for g in grp[:8]]})
    return sorted(out, key=lambda g: -g["count"])


def audit_duplicates(tree, vendors):
    org_rel = f"/organisations/{NSM_ORG}"
    findings = {}

    fit = [decoded(d) for d in run_query_raw(org_rel, "fitUpItems",
                                             select=["name", "sellPrice", "partNumber"])]
    findings["fitUpItems.byName"] = dup_groups(fit, "name", "sellPrice")

    ops = [decoded(d) for d in run_query_raw(org_rel, "serviceOperations",
                                             select=["code", "name", "sellPrice"])]
    findings["serviceOperations.byName"] = dup_groups(ops, "name", "sellPrice")
    code_groups = collections.defaultdict(list)
    for o in ops:
        if o.get("code"):
            code_groups[o["code"]].append(o)
    findings["serviceOperations.duplicateCodes"] = [
        {"code": c, "count": len(g)} for c, g in code_groups.items() if len(g) > 1]

    parts = [decoded(d) for d in run_query_raw(org_rel, "serviceParts",
                                               select=["partNumber", "name", "sellPrice"])]
    pn_groups = collections.defaultdict(list)
    for p in parts:
        if p.get("partNumber"):
            pn_groups[str(p["partNumber"]).strip().upper()].append(p)
    findings["serviceParts.duplicatePartNumbers"] = sorted(
        ({"partNumber": c, "count": len(g),
          "prices": sorted({json.dumps(x.get("sellPrice")) for x in g})}
         for c, g in pn_groups.items() if len(g) > 1), key=lambda x: -x["count"])[:40]
    findings["serviceParts.duplicatePartNumberCount"] = sum(
        1 for g in pn_groups.values() if len(g) > 1)
    findings["serviceParts.byNameDiffPrice"] = dup_groups(parts, "name", "sellPrice")[:40]
    findings["serviceParts.byNameDiffPriceCount"] = len(dup_groups(parts, "name", "sellPrice"))
    findings["serviceParts.total"] = len(parts)

    kits = [decoded(d) for d in run_query_raw(org_rel, "riggingKits",
                                              select=["partNumber", "description", "sellPriceExclGst"])]
    findings["riggingKits.byPartNumber"] = [
        {"partNumber": c, "count": len(g)} for c, g in
        _group(kits, "partNumber").items() if len(g) > 1][:20]

    dfs = [decoded(d) for d in run_query_raw(org_rel, "dealerFitSelections",
                                             select=["name", "type", "items"])]
    def dfs_price(d):
        items = d.get("items") or []
        if items and isinstance(items[0], dict):
            data = items[0].get("data") or {}
            return data.get("Act Sell")
        return None
    for d in dfs:
        d["_actSell"] = dfs_price(d)
    dfs_items = [d for d in dfs if d.get("type") != "category"]
    findings["dealerFitSelections.byNameDiffPrice"] = dup_groups(
        dfs_items, "name", "_actSell")[:40]
    findings["dealerFitSelections.byNameDiffPriceCount"] = len(
        dup_groups(dfs_items, "name", "_actSell"))

    # motors — Yamaha rows across dataSets (picker shows model name)
    yam = "mRAzkE8PUX8GMHELCvJo"
    motor_rows = []
    for ds in _fs.list_docs(f"data-warehouse/{yam}/dataSets"):
        for r in _fs.list_docs(f"data-warehouse/{yam}/dataSets/{ds['_id']}/rows"):
            r["_dataSet"] = ds.get("name") or ds["_id"]
            motor_rows.append(r)
    # picker display = 'MODEL' (e.g. 'Yamaha - LF300XCB'); price = hull_cash
    name_key = "MODEL" if any("MODEL" in r for r in motor_rows) else "name"
    for r in motor_rows:
        pl = r.get("priceLevels") or {}
        r["_retail"] = pl.get("hull_cash") if isinstance(pl, dict) else None
        if r.get("_retail") is None:
            r["_retail"] = r.get("Sell Price") or r.get("sellPriceExclGst")
    findings["motors.total"] = len(motor_rows)
    findings["motors.byNameDiffPrice"] = dup_groups(motor_rows, name_key, "_retail")[:60]
    findings["motors.byNameDiffPriceCount"] = len(dup_groups(motor_rows, name_key, "_retail"))

    # trailers — across every Trailer Brand vendor (series + direct)
    trailer_rows = []
    for v in vendors:
        if v.get("vendorType") != "Trailer Brand":
            continue
        for s in _fs.list_docs(f"data-warehouse/{v['_id']}/series"):
            for t in _fs.list_docs(f"data-warehouse/{v['_id']}/series/{s['_id']}/trailers"):
                t["_vendor"] = v.get("name")
                trailer_rows.append(t)
        try:
            for t in _fs.list_docs(f"data-warehouse/{v['_id']}/trailers"):
                t["_vendor"] = v.get("name")
                trailer_rows.append(t)
        except urllib.error.HTTPError:
            pass
    findings["trailers.total"] = len(trailer_rows)
    findings["trailers.byNameDiffPrice"] = dup_groups(trailer_rows, "name", "sellPriceExclGst")[:40]
    findings["trailers.byNameDiffPriceCount"] = len(
        dup_groups(trailer_rows, "name", "sellPriceExclGst"))

    # boat variants — duplicate display identity within the same model.
    # The Build Configuration card shows name + material, so the true
    # user-visible identity is (name, material); name-only dups where the
    # material differs are legitimate (PVC vs HYP price ladder).
    dup_variants = []
    for vid, node in tree.items():
        for rid, r in node["ranges"].items():
            for mid, mo in r["models"].items():
                vs = [decoded(x) for x in mo["variants"]]
                for v in vs:
                    v["_display"] = f"{v.get('name') or ''} [{v.get('material') or ''}]"
                for g in dup_groups(vs, "_display", "sellPriceExclGst"):
                    g["model"] = f"{node['name']}/{mo['name']}"
                    dup_variants.append(g)
    findings["variants.sameModelByDisplayDiffPrice"] = dup_variants[:40]
    findings["variants.sameModelByDisplayDiffPriceCount"] = len(dup_variants)
    return findings


def _group(rows, key):
    g = collections.defaultdict(list)
    for r in rows:
        if r.get(key):
            g[str(r[key]).strip().upper()].append(r)
    return g


# ---------------------------------------------------------------------------

def main():
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    print("== CLASS 1: rules coverage ==")
    rules_findings, refs, cg_refs = audit_rules_coverage()
    print(f"  code paths: {len(refs)} | collectionGroup ids: {len(cg_refs)}")
    print(f"  unruled: {len(rules_findings['unruledPaths'])} | write gaps: "
          f"{len(rules_findings['writeGaps'])} | cg gaps: "
          f"{len(rules_findings['collectionGroupGaps'])}")

    print("== CLASS 2: module integrity (walking boat catalog...) ==")
    vendors = _fs.list_docs("data-warehouse")
    modules = _fs.list_docs("modules")
    tree = walk_boat_catalog(vendors)
    mod_findings = audit_module_integrity(vendors, modules, tree)
    n_models = sum(len(r["models"]) for n in tree.values() for r in n["ranges"].values())
    n_vars = sum(len(m["variants"]) for n in tree.values()
                 for r in n["ranges"].values() for m in r["models"].values())
    print(f"  vendors {len(vendors)} | modules {len(modules)} | boat models "
          f"{n_models} | variants {n_vars}")

    print("== CLASS 3: type consistency ==")
    type_findings = audit_type_consistency(tree)

    print("== CLASS 4: orphans ==")
    orphan_findings = audit_orphans(tree)

    print("== CLASS 5: duplicate display identity ==")
    dup_findings = audit_duplicates(tree, vendors)

    report = {
        "startedAt": started,
        "finishedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "auditAccount": _fs.EMAIL,
        "readOnly": True,
        "stats": {"vendors": len(vendors), "modules": len(modules),
                  "boatModels": n_models, "boatVariants": n_vars,
                  "codePaths": len(refs)},
        "class1_rulesCoverage": rules_findings,
        "class2_moduleIntegrity": {k: v for k, v in mod_findings.items()},
        "class3_typeConsistency": type_findings,
        "class4_orphans": orphan_findings,
        "class5_duplicates": dup_findings,
    }
    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=1, default=str)
    print(f"\nwrote {OUT_JSON}")

    # console summary
    print("\n===== SUMMARY =====")
    print(f"C1 unruled paths: {[u['path'] for u in rules_findings['unruledPaths']]}")
    print(f"C1 write gaps: {[u['path'] for u in rules_findings['writeGaps']]}")
    print(f"C1 cg gaps: {[(u['collectionId'], u['liveProbe']) for u in rules_findings['collectionGroupGaps']]}")
    print(f"C1 cross-user writes: {[u['path'] for u in rules_findings['crossUserWriteConflicts']]}")
    print(f"C2 dangling mainVendorId: {mod_findings['danglingMainVendorId']}")
    print(f"C2 priced brands w/o module: {mod_findings['pricedBrandsWithoutModule']}")
    print(f"C2 dup module names: {mod_findings['duplicateModuleNames']}")
    print(f"C2 nav missing pages: {mod_findings['nav']['missingPages']}")
    for col, r in type_findings.items():
        if r["stringPriceCount"] or r["dateFieldTypeMixtures"]:
            print(f"C3 {col}: stringPrices={r['stringPriceCount']} "
                  f"dateMixtures={list(r['dateFieldTypeMixtures'])} "
                  f"neverTs={list(r['dateFieldsNeverTimestamp'])}")
    print(f"C4 zero-variant models: {len(orphan_findings['modelsWithZeroVariants'])}")
    print(f"C4 nameless-model variants: {len(orphan_findings['variantsUnderNamelessModels'])}")
    print(f"C4 empty-items DFS: {len(orphan_findings['dealerFitSelectionsEmptyItems'])}"
          f" / {orphan_findings['dealerFitSelectionsTotal']}")
    print(f"C4 empty-interval ESS: legacy={orphan_findings['engineServiceSchedulesEmptyIntervals']['legacyNoPricing']}"
          f" unexplained={len(orphan_findings['engineServiceSchedulesEmptyIntervals']['unexplained'])}"
          f" / {orphan_findings['engineServiceSchedulesTotal']}")
    for k in ["motors.byNameDiffPriceCount", "trailers.byNameDiffPriceCount",
              "serviceParts.duplicatePartNumberCount", "serviceParts.byNameDiffPriceCount",
              "dealerFitSelections.byNameDiffPriceCount",
              "variants.sameModelByNameDiffPriceCount"]:
        print(f"C5 {k}: {dup_findings.get(k)}")
    print(f"C5 fitUpItems dup-name groups: {len(dup_findings['fitUpItems.byName'])}")
    print(f"C5 serviceOperations dup-name groups: {len(dup_findings['serviceOperations.byName'])}"
          f" dup-codes: {len(dup_findings['serviceOperations.duplicateCodes'])}")


if __name__ == "__main__":
    main()

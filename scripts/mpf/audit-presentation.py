#!/usr/bin/env python3
"""FFR-18 class-hunt — "faithful MPF import != faithful presentation".

The FFR-18 field report proved that data imported verbatim from the MPF can be
PARITY-CORRECT yet render as jibberish on customer-facing surfaces (### OBSELETE
headings, other models' packs, workshop sections on Step 5 dealer-fit). This
script hunts the same class across EVERY rendering-relevant collection:

  1. dealerFitSelections   — re-run the Step-5 classifier over all categories
  2. fitUpItems            — workshop noise / negative sells / junk names
  3. model optionalFeatures— MPF artifacts, bad prices, dup names (HF + non-HF)
  4. Yamaha motor rows     — dup display names w/ different prices; menu rows
                             missing NSM Retail
  5. trailer docs          — missing sellPriceExclGst, junk names
  6. standardInclusions    — empties, bullets, dupes, render walls (>200 chars)
  7. depositSchedule/leadTimesDays — sums != 100%, negatives, absurd lead times
  8. regoTypes             — label sanity
  9. service* + riggingKits— MPF artifact names, negative sells, junk sections
 10. pdChecklists          — dormant-consumer confirmation (code grep is manual)

READ-ONLY by default. --apply-sanctioned applies the ONE sanctioned patch class:
fitUpItems with negative sellPrice get {hidden: true, hiddenReason} (a customer
-facing picker must never offer negative-price MPF deduction lines). Before/
after logged to tasks/mpf-audit/apply-log-presentation.jsonl. Everything else
is a finding + handoff — this script never edits src/**.

  python3 scripts/mpf/audit-presentation.py                     # audit only
  python3 scripts/mpf/audit-presentation.py --apply-sanctioned  # + fitUp patch

Output: tasks/test-evidence/presentation-audit.json
"""
import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _fs

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_JSON = os.path.join(ROOT, "tasks/test-evidence/presentation-audit.json")
APPLY_LOG = os.path.join(ROOT, "tasks/mpf-audit/apply-log-presentation.jsonl")
EXTRACTED = os.path.join(ROOT, "tasks/mpf-audit/extracted")

ORG = "AcFZVEFA5UDJG2hyetWT"
HF_VENDOR = "LafOLpLb6QIFE856TiD4"
HF_RANGE_IDS = ["qo7IePnRzJxjrYyLWhTn", "EqcKQ51svI1I2Q5poFdl", "QsGZuVwutEr5yyMkp97j",
                "nQ2LE50z9Tbf2uss0Ote", "sEzdrM2fZsrOKA3ACrJp", "vfXxDuMpChteKncb7LnG", "coaster"]
NONHF_RANGES = [  # mirror of import-boats.py BRAND_ROUTING landing ranges
    ("Stacer", "LWgHuGoKfUBeKZ8eWnEi", "mpf-catalog"),
    ("Stabicraft", "0cUm736tE9ON2WFLRHD0", "mpf-catalog"),
    ("Surtees", "gLAi5eHYiZDgrvjDUaos", "mpf-catalog"),
    ("Haines Signature", "DJ5GVMzLaNWNcOlRqzJV", "mpf-catalog"),
    ("Jeanneau (MPF)", "lwGHoqdqNPuSZYYQAgG7", "jeanneau-mpf"),
    ("Merry Fisher", "lwGHoqdqNPuSZYYQAgG7", "merry-fisher"),
    ("Cap Camarat", "lwGHoqdqNPuSZYYQAgG7", "cap-camarat"),
    ("Formosa", "formosa", "mpf-catalog"),
]
YAMAHA_ROWS = "data-warehouse/mRAzkE8PUX8GMHELCvJo/dataSets/FQ5uTMyUorrJPlpbWIY8/rows"
TRAILER_VENDORS = ["dunbier-trailers", "dunbier-haines-bmt", "gfab-trailers",
                   "mackay-trailers", "redco-tinka-trailers", "stacer-trailers",
                   "obsolete-trailers"]

JUNK_MARKERS = ("###", "#N/A", "#REF", "!ERROR", " NLA", "(NLA")
JUNK_RE = re.compile(r"(###|#N/A|#REF|\bNLA\b|\bPOA\b|\bERROR\b)", re.I)

findings = []


def finding(surface, severity, ident, issue, disposition, detail=None):
    findings.append({"surface": surface, "severity": severity, "id": ident,
                     "issue": issue, "disposition": disposition,
                     "detail": detail or {}})


# ---------------------------------------------------------------------------
# Faithful python port of highfield-quote-flow.tsx classifySection (FFR-18)
# ---------------------------------------------------------------------------
BRAND_WORDS_RE = re.compile(r"(HIGHFIELD|STACER|STABICRAFT|SURTEES|JEANNEAU|FORMOSA|HAINES)")


def classify_section(raw):
    c = (raw or "").upper()
    if c.startswith("###") or "OBSELETE" in c or "OBSOLETE" in c:
        return "hidden"
    if "PRE DELIVERY" in c or "PRE-DELIVERY" in c:
        return "hidden"
    if "RIGGING KIT" in c or "HELM MASTER" in c or "ADD ON KITS" in c:
        return "hidden"
    if BRAND_WORDS_RE.search(c) and re.search(r"\d{3}", c):
        return "model"
    if "SPECIFIC OPTIONS" in c:
        return "model"
    return "general"


# noise words that must NEVER appear in a category the classifier lets
# through as 'general' (workshop ops, dead lists, internal admin)
GENERAL_NOISE_RE = re.compile(
    r"(###|#N/A|\bNLA\b|\bOBS\b|DISCONTINU|SUPERSEDED|WORKSHOP|PICK ?UP|"
    r"\bPD\d|\bPRE.?DEL|DELIVERY ONLY|INTERNAL USE|DO NOT USE|\bDNU\b)", re.I)


def num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply-sanctioned", action="store_true",
                    help="apply the sanctioned fitUpItems negative-sell hide patch")
    args = ap.parse_args()
    started = datetime.now(timezone.utc).isoformat()
    counts = {}

    # ====================== 1. dealerFitSelections ==========================
    dfs = _fs.list_docs(f"organisations/{ORG}/dealerFitSelections")
    cats = {}
    for d in dfs:
        cats.setdefault(str(d.get("category") or "Gear"), []).append(d)
    klass = {c: classify_section(c) for c in cats}
    buckets = {"hidden": [], "model": [], "general": []}
    for c, k in klass.items():
        buckets[k].append(c)
    counts["dealerFitSelections"] = {
        "docs": len(dfs), "categories": len(cats),
        "hidden": len(buckets["hidden"]), "model": len(buckets["model"]),
        "general": len(buckets["general"])}
    for c in buckets["general"]:
        m = GENERAL_NOISE_RE.search(c)
        if m:
            finding("dealerFitSelections", "high", c,
                    f"category classifies 'general' (always visible on Step 5) but contains noise marker '{m.group(0)}'",
                    "handoff", {"items": len(cats[c])})
    # item-level junk inside VISIBLE (general) categories
    for c in buckets["general"]:
        for d in cats[c]:
            nm = str(d.get("name") or "")
            if JUNK_RE.search(nm):
                finding("dealerFitSelections", "medium", d["_id"],
                        f"visible option name contains MPF artifact: '{nm[:80]}' (category '{c}')",
                        "handoff")
            data = ((d.get("items") or [{}])[0] or {}).get("data") or {}
            sell = num(data.get("Act Sell"))
            if sell is not None and sell < 0:
                finding("dealerFitSelections", "high", d["_id"],
                        f"visible option '{nm[:60]}' has NEGATIVE Act Sell {sell} (category '{c}')",
                        "handoff")
    # model-classified sections that match no live boat = invisible everywhere (info)
    counts["dealerFitSelections"]["modelSections"] = sorted(buckets["model"])
    counts["dealerFitSelections"]["hiddenSections"] = sorted(buckets["hidden"])
    counts["dealerFitSelections"]["generalSections"] = sorted(buckets["general"])

    # ====================== 2. fitUpItems ====================================
    fit = _fs.list_docs(f"organisations/{ORG}/fitUpItems")
    counts["fitUpItems"] = {"docs": len(fit)}
    neg_sell = []
    for d in fit:
        nm = str(d.get("name") or "").strip()
        cat = str(d.get("category") or "")
        sell = num(d.get("sellPrice"))
        if not nm:
            finding("fitUpItems", "medium", d["_id"], "empty/blank item name", "handoff",
                    {"partNumber": d.get("partNumber")})
        elif JUNK_RE.search(nm):
            finding("fitUpItems", "medium", d["_id"],
                    f"item name contains MPF artifact: '{nm[:80]}'", "handoff")
        m = GENERAL_NOISE_RE.search(cat) or (re.search(r"^PD\b|PICKUP|PICK UP|DELIVERY", cat, re.I))
        if m and not d.get("hidden"):
            finding("fitUpItems", "high", d["_id"],
                    f"workshop-noise category '{cat}' would render as a picker group heading (item '{nm[:50]}')",
                    "handoff")
        if sell is not None and sell < 0 and not d.get("hidden"):
            neg_sell.append(d)
    counts["fitUpItems"]["negativeSellVisible"] = len(neg_sell)
    for d in neg_sell:
        finding("fitUpItems", "high", d["_id"],
                f"NEGATIVE sellPrice {d.get('sellPrice')} on '{str(d.get('name'))[:60]}' — "
                "customer-facing picker must not offer deduction lines",
                "patched" if args.apply_sanctioned else "patch-pending",
                {"sellPrice": d.get("sellPrice"), "category": d.get("category")})
    if args.apply_sanctioned and neg_sell:
        with open(APPLY_LOG, "a") as lg:
            lg.write(json.dumps({"ts": datetime.now(timezone.utc).isoformat(),
                                 "action": "presentation.fitup-negative-sell-hide.start",
                                 "count": len(neg_sell)}) + "\n")
            for d in neg_sell:
                patch = {"hidden": True,
                         "hiddenReason": "MPF deduction line — not directly sellable"}
                before = {k: d.get(k) for k in ("name", "sellPrice", "category", "hidden", "hiddenReason")}
                _fs.patch_doc(d["_path"], patch)
                after = _fs.get_doc(d["_path"])
                lg.write(json.dumps({
                    "ts": datetime.now(timezone.utc).isoformat(),
                    "path": d["_path"], "patch": patch, "before": before,
                    "after": {k: after.get(k) for k in ("name", "sellPrice", "category", "hidden", "hiddenReason")},
                }) + "\n")
            lg.write(json.dumps({"ts": datetime.now(timezone.utc).isoformat(),
                                 "action": "presentation.fitup-negative-sell-hide.done"}) + "\n")

    # ============ 3./6./7. model docs: optionalFeatures + inclusions + terms =
    models = []  # (brand, path, decoded doc)
    for rid in HF_RANGE_IDS:
        for m in _fs.list_docs(f"data-warehouse/{HF_VENDOR}/ranges/{rid}/models"):
            models.append(("Highfield", m))
    for brand, vid, rid in NONHF_RANGES:
        for m in _fs.list_docs(f"data-warehouse/{vid}/ranges/{rid}/models"):
            models.append((brand, m))
    counts["models"] = {"total": len(models),
                        "highfield": sum(1 for b, _ in models if b == "Highfield")}
    of_stats = {"models": 0, "options": 0, "zeroNonStd": 0}
    for brand, m in models:
        mid = f"{brand}/{m.get('modelCode') or m.get('name') or m['_id']}"
        ofs = m.get("optionalFeatures") or []
        if ofs:
            of_stats["models"] += 1
            of_stats["options"] += len(ofs)
        seen = {}
        for o in ofs:
            if not isinstance(o, dict):
                continue
            nm, cat = str(o.get("name") or ""), str(o.get("category") or "")
            price = num(o.get("sellPriceExclGst"))
            if JUNK_RE.search(nm) or JUNK_RE.search(cat):
                finding("optionalFeatures", "high", mid,
                        f"option name/category has MPF artifact: '{nm[:70]}' / '{cat[:40]}'", "handoff")
            if price is not None:
                if price < 0:
                    finding("optionalFeatures", "high", mid,
                            f"NEGATIVE option price {price} on '{nm[:60]}'", "handoff")
                elif price > 500_000:
                    finding("optionalFeatures", "high", mid,
                            f"absurd option price {price} on '{nm[:60]}'", "handoff")
                elif price == 0 and not o.get("isStandard"):
                    of_stats["zeroNonStd"] += 1  # legit 'no-charge' semantics — counted, not a finding
            key = nm.strip().lower()
            if key:
                seen[key] = seen.get(key, 0) + 1
        dups = {k: v for k, v in seen.items() if v > 1}
        if dups:
            worst = max(dups, key=dups.get)
            finding("optionalFeatures", "medium", mid,
                    f"{len(dups)} duplicate option name(s) within model (worst '{worst[:60]}' x{dups[worst]})",
                    "handoff", {"dups": {k: v for k, v in sorted(dups.items())[:10]}})
        # ---- 6. standardInclusions ----
        inc = m.get("standardInclusions") or []
        empties = sum(1 for s in inc if not str(s or "").strip())
        bullets = [s for s in inc if isinstance(s, str) and ("●" in s or "•" in s)]
        walls = [s for s in inc if isinstance(s, str) and len(s) > 200]
        norm = [str(s).strip().lower() for s in inc if str(s or "").strip()]
        inc_dups = len(norm) - len(set(norm))
        if empties:
            finding("standardInclusions", "low", mid, f"{empties} empty inclusion string(s)", "handoff")
        for s in bullets:
            finding("standardInclusions", "low", mid, f"residual bullet char in inclusion: '{s[:60]}'", "handoff")
        for s in walls:
            finding("standardInclusions", "medium", mid,
                    f"inclusion is a {len(s)}-char render wall: '{s[:80]}…'", "handoff")
        if inc_dups:
            finding("standardInclusions", "low", mid, f"{inc_dups} duplicate inclusion line(s)", "handoff",
                    {"dups": sorted({x for x in norm if norm.count(x) > 1})[:5]})
        # ---- 7. depositSchedule + leadTimesDays ----
        ds = m.get("depositSchedule") or {}
        stages = {k: num(v) for k, v in ds.items() if num(v) is not None}
        if stages:
            total = sum(stages.values())
            neg = {k: v for k, v in stages.items() if v < 0}
            if neg:
                finding("depositSchedule", "high", mid, f"negative stage(s): {neg}", "handoff")
            # valid = fraction-sum 1.0 or percent-sum 100
            if not (abs(total - 1.0) < 0.005 or abs(total - 100.0) < 0.5):
                finding("depositSchedule", "medium", mid,
                        f"stage sum {round(total, 4)} != 100% (stages: {stages})", "handoff")
        lt = m.get("leadTimesDays") or {}
        for k, v in lt.items():
            v = num(v)
            if v is not None and (v < 0 or v > 365):
                finding("leadTimesDays", "medium", mid, f"absurd lead time {k}={v} days", "handoff")

    # ====================== 4. Yamaha motor rows =============================
    rows = _fs.list_docs(YAMAHA_ROWS)
    counts["motorRows"] = {"docs": len(rows)}

    def display_name(r):  # highfield-quote-flow.tsx getMotorDisplayName order
        for k in ("MODEL", "Model Name", "MODEL CODE", "Model", "name"):
            v = r.get(k)
            if isinstance(v, str) and v.strip():
                return v.strip()
        return r["_id"]

    by_disp = {}
    for r in rows:
        by_disp.setdefault(display_name(r).lower(), []).append(r)
    dup_same, dup_diff = 0, []
    for dn, group in by_disp.items():
        if len(group) < 2:
            continue
        retails = {num(g.get("NSM Retail")) for g in group}
        if len(retails) > 1:
            dup_diff.append((dn, sorted((str(x) for x in retails))))
        else:
            dup_same += 1
    counts["motorRows"].update({"dupDisplayNames": dup_same + len(dup_diff),
                                "dupDisplayNamesDiffPrice": len(dup_diff)})
    for dn, retails in sorted(dup_diff):
        finding("motors", "high", dn,
                f"duplicate display name resolves order-dependently in pickers/NSM-Recommended with DIFFERENT NSM Retail values: {retails}",
                "handoff")
    # motorMenu-referenced rows missing NSM Retail (menus from extracted boats.json — parity-proven source)
    boats_ext = json.load(open(os.path.join(EXTRACTED, "boats.json")))["boats"]

    def resolve_motor(nm):  # port of findMotor (exact → ci → contains-model-part)
        t = re.sub(r"\s+", " ", str(nm or "")).strip()
        if not t:
            return None
        tl = t.lower()
        if tl in by_disp:
            return by_disp[tl][0]
        part = t.split(" - ")[-1].strip().lower()
        for dn, g in by_disp.items():
            if part and part in dn:
                return g[0]
        return None

    menu_missing_retail, menu_names = set(), set()
    for b in boats_ext:
        for e in (b.get("motorMenu") or []):
            nm = (e.get("motorName") or "").strip()
            if nm:
                menu_names.add(nm)
    for nm in sorted(menu_names):
        r = resolve_motor(nm)
        if r is not None and num(r.get("NSM Retail")) is None:
            menu_missing_retail.add(nm)
            finding("motors", "high", nm,
                    f"motorMenu-referenced row '{display_name(r)}' has no numeric NSM Retail "
                    "(menu card would show no price / fall back wrong)", "handoff")
    counts["motorRows"]["menuNames"] = len(menu_names)
    counts["motorRows"]["menuMissingRetail"] = len(menu_missing_retail)

    # ====================== 5. trailer docs ==================================
    tcount, tmissing = 0, []
    for tv in TRAILER_VENDORS:
        for sd in _fs.list_docs(f"data-warehouse/{tv}/series"):
            for t in _fs.list_docs(f"data-warehouse/{tv}/series/{sd['_id']}/trailers"):
                tcount += 1
                nm = str(t.get("name") or "")
                if JUNK_RE.search(nm) or not nm.strip():
                    finding("trailers", "medium", t["_path"],
                            f"junk/empty trailer name: '{nm[:70]}'", "handoff")
                if num(t.get("sellPriceExclGst")) is None and tv != "obsolete-trailers":
                    tmissing.append((tv, nm))
                    finding("trailers", "high", t["_path"],
                            f"'{nm[:60]}' has no sellPriceExclGst — menu card renders price-less",
                            "nsm-ask+handoff")
    counts["trailers"] = {"docs": tcount, "missingSell": len(tmissing)}

    # ====================== 8. regoTypes =====================================
    rego = _fs.list_docs("data-warehouse/qld-transport/regoTypes")
    counts["regoTypes"] = {"docs": len(rego)}
    for d in rego:
        label = str(d.get("name") or d.get("label") or "")
        sell = num(d.get("sellExclGst")) if num(d.get("sellExclGst")) is not None else num(d.get("sellPriceExclGst"))
        if JUNK_RE.search(label) or not label.strip():
            finding("regoTypes", "medium", d["_id"], f"junk/empty rego label: '{label[:60]}'", "handoff")
        if re.search(r"not required", label, re.I) and sell not in (0, None):
            finding("regoTypes", "medium", d["_id"],
                    f"'Not Required' rego row carries non-zero sell {sell}", "handoff")
        if sell is not None and sell < 0:
            finding("regoTypes", "high", d["_id"], f"negative rego sell {sell} ('{label[:40]}')", "handoff")

    # ====== 9. serviceOperations / serviceParts / schedules / riggingKits ====
    for coll, name_keys, sell_keys in (
            ("serviceOperations", ("name", "description", "code"), ("sellPrice",)),
            ("serviceParts", ("name", "partNumber"), ("sellPrice",)),
            ("engineServiceSchedules", ("name", "engine", "model"), ("sellPrice", "totalSell")),
            ("riggingKits", ("description", "partNumber"), ("sellPriceExclGst",))):
        docs = _fs.list_docs(f"organisations/{ORG}/{coll}")
        neg = 0
        junk = 0
        for d in docs:
            nm = next((str(d.get(k)) for k in name_keys if str(d.get(k) or "").strip()), "")
            if JUNK_RE.search(nm):
                junk += 1
                if junk <= 25:
                    finding(coll, "medium", d["_id"], f"name has MPF artifact: '{nm[:80]}'", "handoff")
            sec = str(d.get("section") or "")
            if sec and (sec.startswith("###") or GENERAL_NOISE_RE.search(sec)):
                finding(coll, "medium", d["_id"],
                        f"section label '{sec[:60]}' would render as an inappropriate picker group heading",
                        "handoff")
            for sk in sell_keys:
                v = num(d.get(sk))
                if v is not None and v < 0:
                    neg += 1
                    finding(coll, "high", d["_id"], f"NEGATIVE {sk} {v} on '{nm[:60]}'", "handoff")
        counts[coll] = {"docs": len(docs), "negativeSell": neg, "junkNames": junk}

    # ====================== 10. pdChecklists =================================
    # Consumer check is a repo grep (done by the auditor): src/** has ZERO
    # pdChecklists consumers as of this audit → dormant, safe. Recorded here
    # so the evidence file carries the conclusion.
    counts["pdChecklists"] = {
        "consumersInSrc": 0,
        "verdict": "dormant, safe — variant.pdChecklists (mpdc/dpdc) rendered nowhere; "
                   "re-audit for boilerplate-wall risk before any consumer ships"}

    # ====================== write ============================================
    sev = {"high": 0, "medium": 0, "low": 0}
    for f in findings:
        sev[f["severity"]] += 1
    out = {
        "meta": {"startedUtc": started,
                 "finishedUtc": datetime.now(timezone.utc).isoformat(),
                 "identity": "billh@nsmarine.com.au (operator test user)",
                 "org": ORG, "mode": "apply-sanctioned" if args.apply_sanctioned else "audit-only",
                 "reproduce": "python3 scripts/mpf/audit-presentation.py"},
        "counts": counts,
        "severity": sev,
        "findings": findings,
    }
    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    json.dump(out, open(OUT_JSON, "w"), indent=1)
    print(f"presentation audit: {len(findings)} findings "
          f"(high={sev['high']} medium={sev['medium']} low={sev['low']})")
    print(json.dumps(counts, indent=1)[:4000])
    by_surface = {}
    for f in findings:
        by_surface.setdefault(f["surface"], []).append(f)
    for s, fs_ in sorted(by_surface.items()):
        print(f"  {s}: {len(fs_)} — e.g. [{fs_[0]['severity']}] {fs_[0]['id']}: {fs_[0]['issue'][:110]}")


if __name__ == "__main__":
    main()

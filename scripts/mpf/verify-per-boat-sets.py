#!/usr/bin/env python3
"""Per-boat SET-EQUALITY verification (READ-ONLY against Firestore).

Task (Asaf): EVERY boat must show exactly the right dealer-fit, fit-up,
motor accessories (menu slots + props + rigging) and trailer options —
the same result as the MPF for every model, front and back.

For EVERY current MPF boat (tasks/mpf-audit/extracted/boats.json, 809 after
the approved HBS15## junk-SKU skip) this script compares, as SETS
(order-insensitive, whitespace-collapsed, case-insensitive):

  C1  dealerFitLines   — live variant.dealerFitLines  ≡  extract dealer-fit
                         slot names for that boat row.
  C1F front-end Step-5  — simulates the EXACT groupedDealerFit classifier
                         from src/components/highfield-quote-flow.tsx
                         (classifySection + modelSectionMatches, ported
                         verbatim) over the LIVE org dealerFitSelections and
                         asserts (a) the boat's own MPF model-pack section is
                         visible, (b) NO other model's pack is visible,
                         (c) no hidden-class category is visible.
  C2  motorMenu        — live slots ≡ extract: slot count + per-slot
                         motorName / riggingKit / propPartNo / propDesc.
  C3  trailerMenu      — live names ≡ extract names.
  C4  optionalFeatures — HF: the variant's VISIBLE Step-2 option codes
                         (model.optionalFeatures filtered by
                         applicableVariantIds) vs the boat row's
                         factoryOptionCodes (subset + extras itemized).
                         Non-HF: live model.optionalFeatures code set + count
                         vs the set import-fo-nonhf.py INTENDED to
                         materialize (its build_desired_options is imported
                         and re-run — Std/Bundle/error/POA skip semantics are
                         therefore byte-identical to the import).
  C5  fit-up / rigging — the MPF has NO per-boat fit-up assignment (fit-up is
                         an org-level catalog); instead every motorMenu
                         slot's riggingKit name must resolve to a live
                         organisations/{org}/riggingKits doc (quote-flow
                         resolution ladder: exact CI -> contains both ways).

Every set difference is itemized (boat, check, missing/extra values) and
cross-referenced against the approved-skip register
(tasks/test-evidence/everything-check.json known/explained lists,
tasks/test-evidence/mpf-parity.json intentionalDeltas,
tasks/test-evidence/UI_AUDIT.md UI-1) — split KNOWN vs NEW.

Outputs:
  tasks/test-evidence/per-boat-sets.json  (809-row matrix + itemized diffs)
  (companion narrative: tasks/test-evidence/PER_BOAT_SETS.md — hand-written)

NO Firestore writes. Usage:
  python3 scripts/mpf/verify-per-boat-sets.py [--cache FILE]
  (--cache saves/reuses the live snapshot for offline re-analysis)
"""
import argparse
import importlib.util
import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _fs  # noqa: E402  (read-only usage: list_docs / get_doc)

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EXT = os.path.join(ROOT, "tasks", "mpf-audit", "extracted")
EVID = os.path.join(ROOT, "tasks", "test-evidence")
OUT = os.path.join(EVID, "per-boat-sets.json")
ORG = "AcFZVEFA5UDJG2hyetWT"

HF_VENDOR = "LafOLpLb6QIFE856TiD4"
HF_RANGES = {
    "Classic": "qo7IePnRzJxjrYyLWhTn", "Roll-Up": "EqcKQ51svI1I2Q5poFdl",
    "Ultra-Light": "QsGZuVwutEr5yyMkp97j", "Sport": "nQ2LE50z9Tbf2uss0Ote",
    "Adventure": "sEzdrM2fZsrOKA3ACrJp", "Patrol": "vfXxDuMpChteKncb7LnG",
    "Coaster": "coaster",
}
# Mirrors scripts/mpf/import-boats.py BRAND_ROUTING.
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
# vendorId -> module doc id (mainVendorId linkage, checked live 2026-07-04)
VENDOR_MODULE = {
    HF_VENDOR: "M1Yf3R9igpJDxJnOVr6f",
    "LWgHuGoKfUBeKZ8eWnEi": "I0dGRbh39uhNJ3gotEb0",
    "0cUm736tE9ON2WFLRHD0": "xt4zMPPE97QfT28owE1O",
    "gLAi5eHYiZDgrvjDUaos": "thEt3NhC1ApvB0Eqfv80",
    "DJ5GVMzLaNWNcOlRqzJV": "eKfpwpuYl0EAlAxIMPtG",
    "lwGHoqdqNPuSZYYQAgG7": "stSNN8JsuhFKQ7kjLnBb",
    "formosa": "formosa-module",
}

RIG_SENTINELS = {"tba", "nr", "n/a", "none", "tiller", "no rigging"}


def norm(s):
    """Whitespace-collapse + trim + lower — the quote flow's normalizer."""
    return re.sub(r"\s+", " ", str(s or "")).strip().lower()


def load_json(path):
    with open(path) as f:
        return json.load(f)


def slugify(s):
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", str(s).lower())).strip("-")


def load_fo_nonhf_module():
    """Import scripts/mpf/import-fo-nonhf.py so C4 (non-HF) reuses its EXACT
    build_desired_options / importable skip semantics."""
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "import-fo-nonhf.py")
    spec = importlib.util.spec_from_file_location("import_fo_nonhf", p)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# --------------------------------------------------------------- live snapshot

def fetch_live():
    _fs.token()
    snap = {"hf": {}, "brands": {}, "dfs": [], "kits": [], "modules": {}, "vendors": {}}

    def hf_range(item):
        rname, rid = item
        out = []
        for m in _fs.list_docs(f"data-warehouse/{HF_VENDOR}/ranges/{rid}/models"):
            vs = _fs.list_docs(
                f"data-warehouse/{HF_VENDOR}/ranges/{rid}/models/{m['_id']}/variants")
            out.append((rname, m, vs))
        return out

    def brand_walk(item):
        brand, (vid, rid) = item
        out = []
        for m in _fs.list_docs(f"data-warehouse/{vid}/ranges/{rid}/models"):
            vs = _fs.list_docs(
                f"data-warehouse/{vid}/ranges/{rid}/models/{m['_id']}/variants")
            out.append((brand, m, vs))
        return out

    print("fetching live boats (9 brands, threaded) ...")
    with ThreadPoolExecutor(max_workers=8) as ex:
        for chunk in ex.map(hf_range, HF_RANGES.items()):
            for rname, m, vs in chunk:
                snap["hf"].setdefault(rname, []).append({"model": m, "variants": vs})
        for chunk in ex.map(brand_walk, BRAND_ROUTING.items()):
            for brand, m, vs in chunk:
                snap["brands"].setdefault(brand, []).append({"model": m, "variants": vs})

    print("fetching org dealerFitSelections + riggingKits + modules + vendors ...")
    snap["dfs"] = _fs.list_docs(f"organisations/{ORG}/dealerFitSelections")
    snap["kits"] = _fs.list_docs(f"organisations/{ORG}/riggingKits")
    for mod in _fs.list_docs("modules"):
        snap["modules"][mod["_id"]] = mod
    for vid in set([HF_VENDOR] + [v for v, _ in BRAND_ROUTING.values()]):
        snap["vendors"][vid] = _fs.get_doc(f"data-warehouse/{vid}") or {}
    return snap


# ------------------------------------------- front-end classifier (ported TSX)

RANGE_WORDS = {"CL": "CLASSIC", "SP": "SPORT", "RU": "ROLL", "UL": "ULTRAL",
               "PA": "PATROL", "AL": "ADVENTURE", "AD": "ADVENTURE", "CO": "COASTER"}


def classify_section(raw):
    """Port of classifySection (highfield-quote-flow.tsx ~926)."""
    c = str(raw).upper()
    if c.startswith("###") or "OBSELETE" in c or "OBSOLETE" in c:
        return "hidden"
    if "PRE DELIVERY" in c or "PRE-DELIVERY" in c:
        return "hidden"
    if "RIGGING KIT" in c or "HELM MASTER" in c or "ADD ON KITS" in c:
        return "hidden"
    if re.search(r"(HIGHFIELD|STACER|STABICRAFT|SURTEES|JEANNEAU|FORMOSA|HAINES)", c) \
            and re.search(r"\d{3}", c):
        return "model"
    if "SPECIFIC OPTIONS" in c:
        return "model"
    return "general"


def model_section_matches(raw, model_digits, model_range_word, vendor_first_word):
    """Port of modelSectionMatches (highfield-quote-flow.tsx ~935)."""
    c = str(raw).upper()
    m = re.search(r"(\d{3,4})", c)
    sec_digits = m.group(1) if m else ""
    if sec_digits and model_digits and sec_digits == model_digits:
        if model_range_word and model_range_word in c:
            return True
        if vendor_first_word and vendor_first_word in c:
            return True
        return not model_range_word
    if not sec_digits and vendor_first_word and vendor_first_word in c:
        return True
    return False


def simulate_step5_categories(dfs, model_doc, vendor_name, motor_cats, trailer_cats):
    """Return the set of dealer-fit categories the boat's Step 5 renders,
    replicating groupedDealerFit over the live dealerFitSelections."""
    motor_l = {norm(c) for c in motor_cats}
    trailer_l = {norm(c) for c in trailer_cats}
    model_id = model_doc["_id"]
    allow = model_doc.get("applicableDealerFitCategories")
    allow_l = [norm(c) for c in allow] if isinstance(allow, list) else []
    model_name = str(model_doc.get("name") or "")
    m = re.search(r"(\d{3,4})", model_name)
    model_digits = m.group(1) if m else ""
    model_range_word = RANGE_WORDS.get(model_name[:2].upper(), "")
    vendor_first = str(vendor_name or "").upper().split(" ")[0] if vendor_name else ""

    visible = set()
    for sel in dfs:
        cat = sel.get("category") or "Gear"
        cl = norm(cat)
        if cl in motor_l or cl in trailer_l:
            continue
        klass = classify_section(cat)
        if klass == "hidden":
            continue
        if klass == "model" and not model_section_matches(
                cat, model_digits, model_range_word, vendor_first):
            continue
        if allow_l and cl not in allow_l:
            continue
        restricted = sel.get("applicableModelIds")
        if isinstance(restricted, list) and restricted and model_id not in restricted:
            continue
        visible.add(cat)
    return visible


# ------------------------------------------ MPF ground truth: pack descriptors

HF_RANGE_TOKEN = {  # extract range -> section range token
    "Classic": "CLASSIC", "Roll-Up": "ROLL-UP", "Ultra-Light": "ULTRALITE",
    "Sport": "SPORT", "Patrol": "PATROL", "Adventure": "ADVENTURE",
    "Coaster": "COASTER",
}
HF_PACK_RE = re.compile(
    r"^HIGHFIELD\s*-\s*(ROLL-UP|ULTRALITE|CLASSIC|SPORT|PATROL|ZEROJET|ADVENTURE|COASTER)"
    r"(?:\s+(\d{3,4}))?", re.I)
BRAND_PACK_RE = re.compile(r"^(STABICRAFT|JEANNEAU)\s+SPECIFIC OPTIONS$", re.I)


def build_pack_registry(dealer_fit_sections):
    """From the MPF Dealer Fit sheet's 93 section names, derive which are
    model/brand option packs (independent ground truth for assertion b)."""
    packs = {}  # section name -> descriptor
    for s in dealer_fit_sections:
        name = s.get("name") or ""
        m = HF_PACK_RE.match(name.strip())
        if m:
            token = m.group(1).upper()
            packs[name] = {"kind": "hf-model", "rangeToken": token,
                           "digits": m.group(2) or None,
                           # Roll-Up floor discrimination
                           "floor": ("AIRMAT" if "AIRMAT" in name.upper() else
                                     "ALUMINIUM" if "ALUMINIUM" in name.upper() else None)}
            continue
        b = BRAND_PACK_RE.match(name.strip())
        if b:
            packs[name] = {"kind": "brand", "brand": b.group(1).upper()}
    return packs


def own_packs_for_boat(boat, packs):
    """Which MPF pack sections legitimately belong to this boat?"""
    own = set()
    brand = boat["brand"]
    if brand == "Highfield Inflatables":
        hf = boat.get("highfield") or {}
        rng = HF_RANGE_TOKEN.get(hf.get("range") or "", "")
        model = str(hf.get("model") or "")
        m = re.search(r"(\d{3,4})", model)
        digits = m.group(1) if m else None
        floor = ("AIRMAT" if "KAM" in model.upper() else
                 "ALUMINIUM" if re.search(r"\d(AL)\b|AL$", model.upper()) else None)
        for name, d in packs.items():
            if d["kind"] != "hf-model":
                continue
            if d["digits"] is None or digits is None:
                continue
            if d["digits"] != digits or d["rangeToken"] != rng:
                continue
            # Roll-Up floor packs: only the boat's own floor variant is "own"
            if d.get("floor") and floor and d["floor"] != floor:
                continue
            own.add(name)
    else:
        fam = "JEANNEAU" if brand in ("Jeanneau", "Merry Fisher", "Cap Camarat") \
            else brand.upper().split(" ")[0]
        for name, d in packs.items():
            if d["kind"] == "brand" and d["brand"] == fam:
                own.add(name)
    return own


# ------------------------------------------------------------------ known lists

def build_known_register():
    ec = load_json(os.path.join(EVID, "everything-check.json"))
    rels = ec.get("dataLevel", {}).get("relations", {})

    def names(rel_key):
        r = rels.get(rel_key, {})
        out = {}
        for bucket in ("unresolvedKnown", "unresolvedExplained"):
            for nm, e in (r.get(bucket) or {}).items():
                out[norm(nm)] = f"{bucket}: {(e or {}).get('reason') or 'task known list'}"
        return out

    parity = load_json(os.path.join(EVID, "mpf-parity.json"))
    return {
        "rigging": names("motorMenu.riggingKit -> org riggingKits (with sell price)"),
        "motors": names("motorMenu.motorName -> Yamaha rows (with NSM Retail)"),
        "trailers": names("trailerMenu.name -> trailer vendor docs (with sell price)"),
        "paritySkips": {"junkSku": ["HBS15##"]},
        "parityMeta": parity.get("verdict"),
    }


# --------------------------------------------------------------------- checks

def set_diff(expected, actual):
    """Both are dicts norm->original. Returns (missing_originals, extra_originals)."""
    missing = [expected[k] for k in expected if k not in actual]
    extra = [actual[k] for k in actual if k not in expected]
    return sorted(missing), sorted(extra)


def to_name_map(names):
    return {norm(n): str(n).strip() for n in names if norm(n)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", help="save/reuse the live snapshot JSON (dev aid)")
    args = ap.parse_args()

    print("=== per-boat SET-EQUALITY verification (READ-ONLY) ===")
    data = load_json(os.path.join(EXT, "boats.json"))
    boats = [b for b in data["boats"] if "#" not in b["modelCode"]]
    skipped_junk = [b["modelCode"] for b in data["boats"] if "#" in b["modelCode"]]
    print(f"extract boats: {len(data['boats'])} -> {len(boats)} current "
          f"(approved junk-SKU skips: {skipped_junk})")

    if args.cache and os.path.exists(args.cache):
        print(f"loading live snapshot from cache {args.cache}")
        snap = load_json(args.cache)
    else:
        snap = fetch_live()
        if args.cache:
            with open(args.cache, "w") as f:
                json.dump(snap, f)
            print(f"live snapshot cached to {args.cache}")

    dfs = snap["dfs"]
    kits = snap["kits"]
    kits_labelled = [(norm(k.get("name") or k.get("desc") or k.get("description")), k)
                     for k in kits
                     if norm(k.get("name") or k.get("desc") or k.get("description"))]

    def resolve_kit(nm):
        t = norm(nm)
        for lbl, d in kits_labelled:
            if lbl == t:
                return d
        for lbl, d in kits_labelled:
            if lbl and (t in lbl or lbl in t):
                return d
        return None

    # live variant index
    hf_variants = {}   # sku -> (range, model_doc, variant_doc)
    for rname, entries in snap["hf"].items():
        for e in entries:
            for v in e["variants"]:
                hf_variants.setdefault(v["_id"], (rname, e["model"], v))
    brand_models = {}  # (brand, slug) -> (model_doc, {vid: variant})
    for brand, entries in snap["brands"].items():
        for e in entries:
            brand_models[(brand, e["model"]["_id"])] = (
                e["model"], {v["_id"]: v for v in e["variants"]})

    # FO expectation machinery
    fo_mod = load_fo_nonhf_module()
    fx = load_json(os.path.join(EXT, "factory-options.json"))
    sections = {s["hullNsmCode"]: s for s in fx["sections"] if s.get("hullNsmCode")}
    global_catalog = {}
    for s in fx["sections"]:
        for o in s.get("options") or []:
            c = str(o.get("code") or "").strip().upper()
            if c:
                global_catalog.setdefault(c, []).append(o)
    hf_catalog_codes = {str(o.get("code") or "").strip().upper()
                        for o in ((fx.get("highfieldFlatCatalog") or {}).get("options") or [])
                        if str(o.get("code") or "").strip()}
    # union of extract FO codes per HF model (for extra-classification)
    hf_model_code_union = {}
    for b in boats:
        if b["brand"] == "Highfield Inflatables":
            mkey = (b.get("highfield") or {}).get("model")
            hf_model_code_union.setdefault(mkey, set()).update(
                str(c).strip().upper() for c in b["factoryOptionCodes"])

    df_sections = load_json(os.path.join(EXT, "dealer-fit.json"))["sections"]
    packs = build_pack_registry(df_sections)
    known = build_known_register()
    known_rig = known["rigging"]

    live_df_categories = {}
    for d in dfs:
        live_df_categories.setdefault(d.get("category") or "Gear", 0)
        live_df_categories[d.get("category") or "Gear"] += 1

    matrix = []
    diffs = []            # itemized set differences
    totals = {c: {"pass": 0, "knownDiff": 0, "newDiff": 0}
              for c in ("C1_dealerFitLines", "C1F_step5_frontend", "C2_motorMenu",
                        "C3_trailerMenu", "C4_optionalFeatures", "C5_riggingResolve")}
    fe_leak_rollup = {}   # leaked pack -> {boats, class}
    missing_live = []

    for b in boats:
        brand = b["brand"]
        label = f"{brand} {b['name']} [{b['modelCode']}]"
        row = {"boat": label, "brand": brand, "modelCode": b["modelCode"]}

        # ---- locate live docs (import-boats.py routing) ----
        if brand == "Highfield Inflatables":
            hit = hf_variants.get(b["modelCode"])
            if not hit:
                missing_live.append(label)
                row.update({k: "MISSING-LIVE" for k in totals})
                matrix.append(row)
                continue
            rname, model_doc, variant = hit
            vendor_id = HF_VENDOR
        else:
            vid, rid = BRAND_ROUTING[brand]
            slug = slugify(b["modelCode"])
            hit = brand_models.get((brand, slug))
            if not hit or slug not in hit[1]:
                missing_live.append(label)
                row.update({k: "MISSING-LIVE" for k in totals})
                matrix.append(row)
                continue
            model_doc, vmap = hit
            variant = vmap[slug]
            vendor_id = vid

        def record(check, status, missing=None, extra=None, note=None, klass=None):
            totals[check]["pass" if status == "pass" else
                          "knownDiff" if status == "known" else "newDiff"] += 1
            row[check] = {"pass": "P", "known": "K", "new": "N"}[status]
            if status != "pass":
                diffs.append({"boat": label, "check": check, "class": klass or status,
                              "missing": missing or [], "extra": extra or [],
                              "note": note})

        # ---- C1: dealerFitLines set equality ----
        exp = to_name_map(b.get("dealerFitLines") or [])
        act = to_name_map(variant.get("dealerFitLines") or [])
        miss, extra = set_diff(exp, act)
        record("C1_dealerFitLines", "pass" if not miss and not extra else "new",
               miss, extra)

        # ---- C1F: front-end Step-5 simulation ----
        vendor_name = (snap["vendors"].get(vendor_id) or {}).get("name") or ""
        mod_doc = snap["modules"].get(VENDOR_MODULE.get(vendor_id, ""), {}) or {}
        motor_cats = mod_doc.get("motorDealerFitCategories") or []
        trailer_cats = mod_doc.get("trailerDealerFitCategories") or []
        # merge linked modules' categories (quote-flow mergeCatsFromLinked)
        for lid in (mod_doc.get("associatedModuleIds") or []):
            lm = snap["modules"].get(lid) or {}
            motor_cats = list(motor_cats) + (lm.get("motorDealerFitCategories") or [])
            trailer_cats = list(trailer_cats) + (lm.get("trailerDealerFitCategories") or [])
        visible = simulate_step5_categories(dfs, model_doc, vendor_name,
                                            motor_cats, trailer_cats)
        own = own_packs_for_boat(b, packs)
        own_live = {p for p in own if p in live_df_categories}
        fe_missing = sorted(own_live - visible)                      # (a)
        pack_names = set(packs.keys())
        fe_leaks = sorted((visible & pack_names) - own)              # (b)
        fe_hidden = sorted(c for c in visible if classify_section(c) == "hidden")  # (c)
        if not fe_missing and not fe_leaks and not fe_hidden:
            record("C1F_step5_frontend", "pass")
        else:
            # classification: digitless HF pack leak == UI-1 (KNOWN);
            # digit-collision / cross-range / floor leaks == NEW.
            leak_classes = set()
            for p in fe_leaks:
                d = packs[p]
                if d["kind"] == "hf-model" and d["digits"] is None:
                    kl = "KNOWN (UI-1: digitless section classified general)"
                elif d["kind"] == "hf-model" and d.get("floor"):
                    kl = "NEW (Roll-Up floor pack leak: sibling floor visible)"
                else:
                    kl = "NEW (digit-collision leak: modelSectionMatches vendor-word pass)"
                leak_classes.add(kl)
                fe_leak_rollup.setdefault(p, {"class": kl, "boats": []})["boats"].append(label)
            status = "known" if leak_classes and all(
                k.startswith("KNOWN") for k in leak_classes) and not fe_missing \
                and not fe_hidden else "new"
            record("C1F_step5_frontend", status,
                   missing=[f"own pack not visible: {p}" for p in fe_missing],
                   extra=[f"leaked pack visible: {p} — {packs[p]}" for p in fe_leaks]
                         + [f"hidden-class visible: {c}" for c in fe_hidden],
                   klass="; ".join(sorted(leak_classes)) or "frontend",
                   note=f"visibleCategories={len(visible)}")

        # ---- C2: motorMenu slot equality ----
        def slots(menu):
            out = {}
            for e in (menu or []):
                if isinstance(e, dict):
                    out[e.get("slot")] = {f: norm(e.get(f)) for f in
                                          ("motorName", "riggingKit", "propPartNo", "propDesc")}
            return out
        es, ls = slots(b.get("motorMenu")), slots(variant.get("motorMenu"))
        mm_diffs = []
        for s in sorted(set(es) - set(ls)):
            mm_diffs.append(f"slot {s} missing live ({b['motorMenu'][0].get('motorName') if b.get('motorMenu') else ''})")
        for s in sorted(set(ls) - set(es)):
            mm_diffs.append(f"slot {s} extra in live")
        for s in sorted(set(es) & set(ls)):
            for f in es[s]:
                if es[s][f] != ls[s][f]:
                    mm_diffs.append(f"slot {s} {f}: extract='{es[s][f]}' live='{ls[s][f]}'")
        record("C2_motorMenu", "pass" if not mm_diffs else "new",
               missing=mm_diffs, note=f"slots extract={len(es)} live={len(ls)}")

        # ---- C3: trailerMenu name set equality ----
        exp = to_name_map([e.get("name") for e in (b.get("trailerMenu") or [])
                           if isinstance(e, dict)])
        act = to_name_map([e.get("name") or e.get("display")
                           for e in (variant.get("trailerMenu") or [])
                           if isinstance(e, dict)])
        miss, extra = set_diff(exp, act)
        record("C3_trailerMenu", "pass" if not miss and not extra else "new", miss, extra)

        # ---- C4: optionalFeatures ----
        ofs = model_doc.get("optionalFeatures") or []
        if brand == "Highfield Inflatables":
            sku = b["modelCode"]
            visible_codes = {}
            for o in ofs:
                if not isinstance(o, dict):
                    continue
                app = o.get("applicableVariantIds")
                if isinstance(app, list) and app and sku not in app:
                    continue
                c = str(o.get("code") or "").strip()
                visible_codes[c.upper() if c else f"<no-code:{o.get('name')}>"] = \
                    c or f"<no-code: {o.get('name')}>"
            exp_codes = {str(c).strip().upper(): str(c).strip()
                         for c in b["factoryOptionCodes"] if str(c).strip()}
            vis_keys = set(visible_codes)

            def fam(code):
                """Colour-family base: strip a trailing -<1-4 letter> colour
                suffix (HEC001-BC / HES016-GDG -> HEC001 / HES016). The MPF
                boat row lists EVERY colourway of an option; the live model
                colour-scopes them per variant via applicableVariantIds."""
                m = re.match(r"^(.+)-([A-Z]{1,4})$", code)
                return m.group(1) if m else code

            vis_fams = {fam(k) for k in vis_keys if not k.startswith("<")}
            exp_fams = {fam(k) for k in exp_codes}
            boat_colour = re.sub(r"[^A-Z0-9]", "",
                                 str((b.get("highfield") or {}).get("colorCode") or "").upper())

            miss_raw = [exp_codes[k] for k in exp_codes if k not in vis_keys]
            # colour-scoped: another member of the same family IS visible
            miss_suffixed = sorted(c for c in miss_raw if fam(c.upper()) in vis_fams)
            miss = sorted(c for c in miss_raw if fam(c.upper()) not in vis_fams)
            extra_all = [visible_codes[k] for k in vis_keys if k not in exp_codes]
            extra_suffix = sorted(e for e in extra_all if not e.startswith("<no-code")
                                  and fam(e.upper()) in exp_fams)
            # colourway guard: the visible family member should be the boat's
            # own colourway (suffix == colour code letters) or the bare base.
            wrong_colour = []
            if boat_colour:
                for c in set(fam(x.upper()) for x in miss_suffixed):
                    members = [k for k in vis_keys
                               if not k.startswith("<") and fam(k) == c]
                    if not any(k == c or k.endswith("-" + boat_colour) for k in members):
                        wrong_colour.append(
                            f"{c}: visible colourway(s) {sorted(members)} do not "
                            f"include the boat's own colour {boat_colour}")
            rest = [e for e in extra_all if e not in extra_suffix]
            # classify remaining extras
            extra_legacy = [e for e in rest if e.startswith("<no-code")]
            model_union = hf_model_code_union.get((b.get("highfield") or {}).get("model"), set())

            def in_union(code):
                cu = code.upper()
                return cu in model_union or any(cu.startswith(u + "-") for u in model_union)

            extra_sibling = [e for e in rest if not e.startswith("<no-code") and in_union(e)]
            extra_catalog = [e for e in rest if not e.startswith("<no-code")
                             and not in_union(e) and e.upper() in hf_catalog_codes]
            extra_curated = [e for e in rest if not e.startswith("<no-code")
                             and not in_union(e) and e.upper() not in hf_catalog_codes]
            miss_arch = [c for c in miss if c.upper() in hf_catalog_codes]
            miss_drift = [c for c in miss if c.upper() not in hf_catalog_codes]
            new_buckets = extra_sibling or extra_catalog or wrong_colour
            note = (f"colourScopedFamilies={len(miss_suffixed)} "
                    f"(boat-row colourway codes scoped per-variant by "
                    f"applicableVariantIds: {miss_suffixed[:6]}"
                    f"{'…' if len(miss_suffixed) > 6 else ''})"
                    if miss_suffixed else None)
            if not miss and not rest and not wrong_colour:
                record("C4_optionalFeatures", "pass")
                if note:  # representation delta only — matched, but keep the evidence
                    diffs.append({"boat": label, "check": "C4_optionalFeatures",
                                  "class": "MATCH-with-colour-scoping",
                                  "missing": [], "extra": [], "note": note})
            elif not new_buckets:
                record("C4_optionalFeatures", "known",
                       missing=[f"{c} (in MPF HF catalog; reprice-only FO wave never "
                                f"materialized boat-row codes)" for c in miss_arch]
                               + [f"{c} (boat-row ref code absent from the MPF FO "
                                  f"catalog itself — source drift)" for c in miss_drift],
                       extra=[f"{e} (legacy no-code option, preserved)" for e in extra_legacy]
                             + [f"{e} (pre-MPF curated live option, not in MPF catalog)"
                                for e in extra_curated],
                       klass="KNOWN-architectural (HF FO wave = reprice-only; "
                             "EVERYTHING_CHECK §1.3)", note=note)
            else:
                record("C4_optionalFeatures", "new",
                       missing=[f"{c} (in MPF HF catalog)" for c in miss_arch]
                               + [f"{c} (NOT in MPF HF catalog)" for c in miss_drift]
                               + [f"WRONG-COLOURWAY {w}" for w in wrong_colour],
                       extra=[f"{e} (sibling-variant code visible — applicableVariantIds "
                              f"not enforced)" for e in extra_sibling]
                             + [f"{e} (MPF catalog option visible but not on this "
                                f"boat's MPF row)" for e in extra_catalog]
                             + [f"{e} (legacy no-code option, preserved)" for e in extra_legacy]
                             + [f"{e} (pre-MPF curated live option)" for e in extra_curated],
                       klass="NEW (sibling-variant applicability)" if not (extra_catalog or wrong_colour)
                             else "NEW (catalog overshow / colourway)", note=note)
        else:
            mcode = str(model_doc.get("modelCode") or "").strip()
            desired, _sk = fo_mod.build_desired_options(
                b["factoryOptionCodes"], sections.get(mcode), global_catalog, [], label)
            exp_codes = {d["code"].upper(): d["code"] for d in desired}
            act_codes = {}
            for o in ofs:
                if isinstance(o, dict) and str(o.get("code") or "").strip():
                    act_codes[str(o["code"]).strip().upper()] = str(o["code"]).strip()
            miss, extra = set_diff(exp_codes, act_codes)
            cnt_note = f"expectedMaterialized={len(desired)} live={len(ofs)}"
            record("C4_optionalFeatures", "pass" if not miss and not extra else "new",
                   miss, extra, note=cnt_note)

        # ---- C5: rigging kits resolve (org-level fit-up design) ----
        rig_missing_new, rig_missing_known = [], []
        for e in (b.get("motorMenu") or []):
            nm = str((e or {}).get("riggingKit") or "").strip()
            if not nm or norm(nm) in RIG_SENTINELS:
                continue
            if resolve_kit(nm) is None:
                if norm(nm) in known_rig:
                    rig_missing_known.append(f"{nm} — {known_rig[norm(nm)][:80]}")
                else:
                    rig_missing_new.append(nm)
        if not rig_missing_new and not rig_missing_known:
            record("C5_riggingResolve", "pass")
        elif not rig_missing_new:
            record("C5_riggingResolve", "known", missing=rig_missing_known,
                   klass="KNOWN (everything-check rigging register)")
        else:
            record("C5_riggingResolve", "new",
                   missing=rig_missing_new + rig_missing_known)

        matrix.append(row)

    # ------------------------------------------------------------- report
    out = {
        "generatedUtc": datetime.now(timezone.utc).isoformat(),
        "phase": "phase6.per-boat-sets",
        "mode": "READ-ONLY (no Firestore writes), FULL WEB (809 boats, no sampling)",
        "boats": {"extracted": len(data["boats"]), "verified": len(boats),
                  "approvedJunkSkip": skipped_junk, "missingLive": missing_live},
        "comparisonSemantics": "sets — order-insensitive, whitespace-collapsed, "
                               "case-insensitive; motor menu keyed by slot",
        "checks": {
            "C1_dealerFitLines": "live variant.dealerFitLines ≡ extract boat-row slot names",
            "C1F_step5_frontend": "groupedDealerFit classifier simulation over live "
                                  "dealerFitSelections: own pack visible / no foreign pack / "
                                  "no hidden class",
            "C2_motorMenu": "slot count + per-slot motorName/riggingKit/propPartNo/propDesc",
            "C3_trailerMenu": "live trailerMenu names ≡ extract names",
            "C4_optionalFeatures": "HF: variant-visible option codes vs boat-row "
                                   "factoryOptionCodes; non-HF: live model optionalFeatures "
                                   "vs import-fo-nonhf.py intended materialization",
            "C5_riggingResolve": "every motorMenu slot riggingKit resolves to live org "
                                 "riggingKits (fit-up itself is org-level by design — no "
                                 "per-boat fit-up assignment exists in the MPF)",
        },
        "totals": totals,
        "frontendLeakRollup": {
            p: {"class": v["class"], "boatCount": len(v["boats"]),
                "nonHighfieldBoatCount": sum(1 for x in v["boats"]
                                             if not x.startswith("Highfield")),
                "boats": v["boats"][:12]}
            for p, v in sorted(fe_leak_rollup.items())},
        "diffs": diffs,
        "matrix": matrix,
        "knownRegisterSources": [
            "tasks/test-evidence/everything-check.json (unresolvedKnown/-Explained)",
            "tasks/test-evidence/mpf-parity.json (intentionalDeltas)",
            "tasks/test-evidence/UI_AUDIT.md UI-1 (Step-5 classifier gap, HANDOFF)",
            "tasks/test-evidence/EVERYTHING_CHECK.md §1.3 (HF FO reprice-only architecture)",
        ],
    }
    os.makedirs(EVID, exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(out, f, indent=1)
    print(f"\nwrote {os.path.relpath(OUT, ROOT)}")
    for c, t in totals.items():
        print(f"  {c}: pass={t['pass']} known={t['knownDiff']} NEW={t['newDiff']}")
    if missing_live:
        print(f"  MISSING LIVE: {missing_live}")
    new_total = sum(t["newDiff"] for t in totals.values())
    print("VERDICT:", "ALL SETS EQUAL (or accounted for)" if new_total == 0 else
          f"{new_total} boat×check cells carry NEW differences — see diffs")


if __name__ == "__main__":
    main()

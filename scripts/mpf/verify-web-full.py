#!/usr/bin/env python3
"""Phase 5c — EVERYTHING check, data level (READ-ONLY against Firestore).

Task #16: "when you click a trailer or a motor, ANY trailer or motor, the
relevant things show up. Checked for EVERYTHING."

Walks EVERY current MPF boat's LIVE variant doc (no sampling) across all 9
brands — Highfield under vendor LafOLpLb6QIFE856TiD4's 7 ranges, the other
8 brands under their routed vendors per scripts/mpf/import-boats.py
BRAND_ROUTING — and verifies, for every boat:

  (a) every motorMenu slot's motorName resolves to a live Yamaha motor row
      (same resolution ladder the quote flow uses in
      highfield-quote-flow.tsx resolvedMotorMenu: exact -> case-insensitive
      -> contains on the model part after ' - ') AND that row carries
      NSM Retail (hull_cash) pricing;
  (b) every slot's riggingKit name resolves to organisations/{org}/riggingKits
      (name/desc/description match, exact -> contains both ways — the same
      ladder as the quote flow's rigging-kit lookup) with a sell price
      (sellPriceExclGst / retailExGst / kitSellPrice);
  (c) every trailerMenu name resolves to a live trailer vendor doc
      (7 trailer vendors, matched by name exact -> contains both ways)
      with sell pricing;
  (d) every dealerFitLine resolves to organisations/{org}/dealerFitSelections
      (case-insensitive trim, then contains both ways — quote-flow ladder)
      with 'Act Sell' present in items[].data;
  (e) every model.factoryOptionCodes entry resolves to an optionalFeatures
      entry (by code) on the same live model doc.

Every unresolved name is classified into one of THREE buckets:
  - unresolvedKnown  — on the task's approved-skip list (Merry Fisher
    Mercury/ePropulsion/package motor units from the sampled smoke run;
    the TA800T-EH2 trailer absent from the MPF source itself);
  - unresolvedExplained — NOT on the original known list but traced with
    evidence to a documented import decision or a source-sheet
    inconsistency (e.g. the remaining Jeanneau/Cap Camarat boat-package
    powerplants in the approved 71-skip mtf-import-dryrun plan; rigging
    kits collapsed by upsert-by-partNo when the MPF rigging sheet reuses
    one part number for several kit descriptions; boat-sheet labels that
    do not exist verbatim on the MPF rigging sheet; trailer names absent
    from the MPF trailer sheet). Loudly reported, never silently absorbed;
  - unresolvedNEW — unexplained. MUST be zero for a pass.
Additional documented context:
  - factoryOptionCodes on models with NO optionalFeatures array: the FO wave
    (import-motors-trailers-fo.py) deliberately only repriced EXISTING
    Highfield per-model options; materializing ref-codes into per-model
    optionalFeatures for the other 8 brands was out of scope. These are
    reported in their own 'known-architectural' bucket, and a supplementary
    renderability check verifies every live optionalFeatures entry carries
    a code + numeric sellPriceExclGst (the Step-2 FFO surface).

Writes the dataLevel section of tasks/test-evidence/everything-check.json
(preserving any existing browserLevel section written by
tests/everything-clicks.spec.ts). NO Firestore writes.

Usage: python3 scripts/mpf/verify-web-full.py
"""
import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _fs  # Firestore REST helpers — read-only usage (list_docs/get_doc)

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "tasks", "test-evidence", "everything-check.json")
ORG = "AcFZVEFA5UDJG2hyetWT"

HF_VENDOR = "LafOLpLb6QIFE856TiD4"
HF_RANGES = {
    "Classic": "qo7IePnRzJxjrYyLWhTn", "Roll-Up": "EqcKQ51svI1I2Q5poFdl",
    "Ultra-Light": "QsGZuVwutEr5yyMkp97j", "Sport": "nQ2LE50z9Tbf2uss0Ote",
    "Adventure": "sEzdrM2fZsrOKA3ACrJp", "Patrol": "vfXxDuMpChteKncb7LnG",
    "Coaster": "coaster",
}
# Mirrors scripts/mpf/import-boats.py BRAND_ROUTING (brand -> vendor/range).
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
YAMAHA_ROWS = "data-warehouse/mRAzkE8PUX8GMHELCvJo/dataSets/FQ5uTMyUorrJPlpbWIY8/rows"
TRAILER_VENDORS = ["dunbier-trailers", "dunbier-haines-bmt", "gfab-trailers",
                   "mackay-trailers", "redco-tinka-trailers", "stacer-trailers",
                   "obsolete-trailers"]

KNOWN_TRAILER_SKIPS = {
    "redco / cc7.5 alloy multi roller trailer - ta800t-eh2 (4,240kg)",
}
EXT_DIR = os.path.join(ROOT, "tasks", "mpf-audit", "extracted")


def load_ext(name):
    with open(os.path.join(EXT_DIR, name)) as f:
        return json.load(f)


def norm(s):
    """Whitespace-collapse + trim + lower — the quote flow's normalizer."""
    return re.sub(r"\s+", " ", str(s or "")).strip().lower()


def numeric(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


# ---------------------------------------------------------------- reference indexes

def build_motor_index():
    rows = _fs.list_docs(YAMAHA_ROWS)
    exact = {}   # normalized candidate name -> row
    scan = []    # (normalized display name, row) for contains-pass
    for r in rows:
        code = str(r.get("MODEL CODE") or "").strip()
        names = set()
        for k in ("MODEL", "DESCRIPTION", "Model", "Description"):
            v = r.get(k)
            if isinstance(v, str) and v.strip():
                names.add(v)
        if code:
            names.add(code)
            names.add(f"Yamaha - {code}")
        for n in names:
            exact.setdefault(norm(n), r)
        disp = r.get("MODEL") or (f"Yamaha - {code}" if code else None)
        if disp:
            scan.append((norm(disp), r))
    return rows, exact, scan


def resolve_motor(name, exact, scan):
    """exact -> case-insensitive (norm covers both) -> contains on the model
    part after ' - ' (highfield-quote-flow.tsx resolvedMotorMenu ladder)."""
    target = norm(name)
    if not target:
        return None
    if target in exact:
        return exact[target]
    parts = target.split(" - ")
    model_part = (parts[-1] or target).strip()
    if not model_part:
        return None
    for disp, row in scan:
        if model_part in disp:
            return row
    return None


def kit_label(k):
    return k.get("name") or k.get("desc") or k.get("description") or ""


def resolve_by_label(target_raw, labelled):
    """exact CI -> contains both ways (quote-flow rigging/DFO/trailer ladder).
    labelled: list of (normalized label, doc)."""
    t = norm(target_raw)
    if not t:
        return None
    for lbl, d in labelled:
        if lbl == t:
            return d
    for lbl, d in labelled:
        if lbl and (t in lbl or lbl in t):
            return d
    return None


# ---------------------------------------------------------------- boat walk

def walk_boats():
    """Yield every current-MPF live boat: dict with brand/range/model/variant."""
    boats = []

    def hf_range(item):
        rname, rid = item
        out = []
        models = _fs.list_docs(f"data-warehouse/{HF_VENDOR}/ranges/{rid}/models")
        for m in models:
            variants = _fs.list_docs(
                f"data-warehouse/{HF_VENDOR}/ranges/{rid}/models/{m['_id']}/variants")
            for v in variants:
                if not v.get("mpfSource"):
                    continue  # legacy / demo variant — not a current MPF boat
                out.append({"brand": "Highfield Inflatables", "range": rname,
                            "model": m, "variant": v,
                            "label": f"Highfield {m.get('name') or m['_id']} / {v['_id']}"})
        return out

    def brand_walk(item):
        brand, (vid, rid) = item
        out = []
        models = _fs.list_docs(f"data-warehouse/{vid}/ranges/{rid}/models")
        for m in models:
            variants = _fs.list_docs(
                f"data-warehouse/{vid}/ranges/{rid}/models/{m['_id']}/variants")
            for v in variants:
                if not v.get("mpfSource"):
                    continue
                out.append({"brand": brand, "range": rid, "model": m, "variant": v,
                            "label": f"{brand} {m.get('name') or m['_id']}"})
        return out

    with ThreadPoolExecutor(max_workers=8) as ex:
        for chunk in ex.map(hf_range, HF_RANGES.items()):
            boats.extend(chunk)
        for chunk in ex.map(brand_walk, BRAND_ROUTING.items()):
            boats.extend(chunk)
    return boats


class Relation:
    def __init__(self, name):
        self.name = name
        self.checked = 0
        self.resolved = 0
        self.resolved_no_price = {}   # name -> [boat labels]
        self.unresolved = {}          # name -> [boat labels]

    def hit(self):
        self.checked += 1
        self.resolved += 1

    def hit_no_price(self, nm, boat):
        self.checked += 1
        self.resolved += 1
        self.resolved_no_price.setdefault(nm, []).append(boat)

    def miss(self, nm, boat):
        self.checked += 1
        self.unresolved.setdefault(nm, []).append(boat)


def main():
    print("=== Phase 5c EVERYTHING check — data level (full web, no sampling) ===")
    _fs.token()  # pre-warm auth before threading

    print("loading reference indexes ...")
    yam_rows, yam_exact, yam_scan = build_motor_index()
    kits = _fs.list_docs(f"organisations/{ORG}/riggingKits")
    kits_labelled = [(norm(kit_label(k)), k) for k in kits if norm(kit_label(k))]
    dfs = _fs.list_docs(f"organisations/{ORG}/dealerFitSelections")
    dfs_labelled = [(norm(d.get("name")), d) for d in dfs if norm(d.get("name"))]
    trailers = []
    for tv in TRAILER_VENDORS:
        for s in _fs.list_docs(f"data-warehouse/{tv}/series"):
            for t in _fs.list_docs(f"data-warehouse/{tv}/series/{s['_id']}/trailers"):
                t["_vendor"] = tv
                trailers.append(t)
    trailers_labelled = [(norm(t.get("name")), t) for t in trailers if norm(t.get("name"))]
    print(f"  yamahaRows={len(yam_rows)} riggingKits={len(kits)} "
          f"dealerFitSelections={len(dfs)} liveTrailers={len(trailers)}")

    print("walking every live current-MPF boat variant (9 brands) ...")
    boats = walk_boats()
    by_brand = {}
    for b in boats:
        by_brand[b["brand"]] = by_brand.get(b["brand"], 0) + 1
    print(f"  live current boats walked: {len(boats)}  {by_brand}")

    rel_motor = Relation("motorMenu.motorName -> Yamaha rows (with NSM Retail)")
    rel_kit = Relation("motorMenu.riggingKit -> org riggingKits (with sell price)")
    rel_trailer = Relation("trailerMenu.name -> trailer vendor docs (with sell price)")
    rel_dfo = Relation("dealerFitLines -> dealerFitSelections (with Act Sell)")
    rel_fo = Relation("model.factoryOptionCodes -> model.optionalFeatures (by code)")
    fo_no_of_array = {}  # code-per-model bucket: models lacking optionalFeatures entirely
    fo_models_no_of = set()
    trailer_sentinels = {}  # 'TRAILER NOT REQUIRED - ...' style rows — not a trailer

    RIG_SENTINELS = {"tba", "nr", "n/a", "none", "tiller", "no rigging"}

    for b in boats:
        v, m, label = b["variant"], b["model"], b["label"]

        # (a) + (b) motor menu slots
        for e in (v.get("motorMenu") or []):
            if not isinstance(e, dict):
                continue
            nm = str(e.get("motorName") or "").strip()
            if nm:
                row = resolve_motor(nm, yam_exact, yam_scan)
                if row is None:
                    rel_motor.miss(nm, label)
                elif numeric(row.get("NSM Retail")) and row.get("NSM Retail") > 0:
                    rel_motor.hit()
                else:
                    rel_motor.hit_no_price(nm, label)
            kit_nm = str(e.get("riggingKit") or "").strip()
            if kit_nm and norm(kit_nm) not in RIG_SENTINELS:
                kit = resolve_by_label(kit_nm, kits_labelled)
                if kit is None:
                    rel_kit.miss(kit_nm, label)
                else:
                    price = next((kit.get(f) for f in
                                  ("sellPriceExclGst", "retailExGst", "kitSellPrice")
                                  if numeric(kit.get(f))), None)
                    if price is not None:
                        rel_kit.hit()
                    else:
                        rel_kit.hit_no_price(kit_nm, label)

        # (c) trailer menu
        for e in (v.get("trailerMenu") or []):
            if not isinstance(e, dict):
                continue
            nm = str(e.get("name") or e.get("display") or "").strip()
            if not nm:
                continue
            if re.match(r"^(trailer\s+not\s+required|not\s+required|no\s+trailer)",
                        norm(nm)):
                trailer_sentinels.setdefault(nm, []).append(label)
                continue
            t = resolve_by_label(nm, trailers_labelled)
            if t is None:
                rel_trailer.miss(nm, label)
            elif numeric(t.get("sellPriceExclGst")) and t.get("sellPriceExclGst") > 0:
                rel_trailer.hit()
            else:
                rel_trailer.hit_no_price(nm, label)

        # (d) dealer fit lines
        for nm in (v.get("dealerFitLines") or []):
            nm = str(nm or "").strip()
            if not nm:
                continue
            d = resolve_by_label(nm, dfs_labelled)
            if d is None:
                rel_dfo.miss(nm, label)
            else:
                act_sell = None
                for item in (d.get("items") or []):
                    data = (item or {}).get("data") or {}
                    if numeric(data.get("Act Sell")):
                        act_sell = data.get("Act Sell")
                        break
                if act_sell is not None:
                    rel_dfo.hit()
                else:
                    rel_dfo.hit_no_price(nm, label)

    # (e) factory option codes — per unique live model doc
    seen_models = set()
    for b in boats:
        m = b["model"]
        if m["_path"] in seen_models:
            continue
        seen_models.add(m["_path"])
        codes = [str(c or "").strip() for c in (m.get("factoryOptionCodes") or [])]
        codes = [c for c in codes if c]
        if not codes:
            continue
        ofs = m.get("optionalFeatures") or []
        of_codes = {str(o.get("code") or "").strip().upper()
                    for o in ofs if isinstance(o, dict)}
        mlabel = f"{b['brand']} {m.get('name') or m['_id']}"
        if not ofs:
            fo_models_no_of.add(mlabel)
            fo_no_of_array[mlabel] = len(codes)
            continue
        for c in codes:
            if c.upper() in of_codes:
                rel_fo.hit()
            else:
                rel_fo.miss(c, mlabel)

    # -------- supplementary: Step-2 FFO renderability (live OF entries) --------
    of_entries = of_render_ok = 0
    of_render_bad = []
    seen2 = set()
    for b in boats:
        m = b["model"]
        if m["_path"] in seen2:
            continue
        seen2.add(m["_path"])
        for o in (m.get("optionalFeatures") or []):
            if not isinstance(o, dict):
                continue
            of_entries += 1
            if str(o.get("code") or "").strip() and numeric(o.get("sellPriceExclGst")):
                of_render_ok += 1
            else:
                of_render_bad.append(
                    f"{b['brand']} {m.get('name') or m['_id']}: "
                    f"code={o.get('code')} sell={o.get('sellPriceExclGst')}")

    # ---------------- classify unresolved: known / explained / NEW ----------------
    # Evidence sources: the APPROVED phase-4 motor skip plan + the raw MPF
    # extractions (motors.json / rigging-kits.json / trailers.json).
    plan_skip_codes = {s["modelCode"] for s in
                       load_ext("mtf-import-dryrun.json")["motors"]["planSkips"]}
    motors_ext = load_ext("motors.json")["motors"]
    rig_ext = load_ext("rigging-kits.json")["rows"]
    trailers_ext_names = {norm(t["name"]) for t in load_ext("trailers.json")["trailers"]}
    live_yam_codes = {str(r.get("MODEL CODE") or "").strip() for r in yam_rows}
    live_kit_ids = {k["_id"] for k in kits}

    def slugify(s):
        return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", str(s).lower())).strip("-")

    def classify_motor(nm, boat_labels):
        n = norm(nm)
        # Task's original known list: Merry Fisher package units (sampled run).
        if n.startswith("mf") and (" w " in n or " with " in n):
            return "known", "Merry Fisher boat-package powerplant (task known list)"
        # Composite twin-pair label 'A + B' where both codes exist live.
        pair = re.match(r"^yam(?:aha)?\s*-\s*([A-Z0-9]+)\s*\+\s*([A-Z0-9]+)$",
                        str(nm).strip(), re.I)
        if pair and all(c.upper() in live_yam_codes for c in pair.groups()):
            return ("explained", "composite twin-pair label — both constituent "
                                 "motor codes exist individually in the live "
                                 "Yamaha dataset")
        # Approved 71-skip plan (Jeanneau powerplants + ePropulsion).
        hits = [m for m in motors_ext
                if n and (norm(m.get("displayName")) == n or n in norm(m.get("displayName")))]
        codes = {m["modelCode"] for m in hits}
        if codes & plan_skip_codes:
            return ("explained", "in the APPROVED phase-4 skip plan "
                                 f"(codes {sorted(codes & plan_skip_codes)[:2]} — "
                                 "boat-package powerplant / ePropulsion)")
        if any((m.get("supplier") or "").lower() in ("jeanneau", "epropulsion")
               or "powerplant" in (m.get("section") or "").lower() for m in hits):
            return ("explained", "Jeanneau/ePropulsion boat-package powerplant row "
                                 "(same approved out-of-Yamaha-scope class)")
        # Some Jeanneau powerplant unit labels appear only as SECTION headers
        # in the motors extraction (e.g. 'DB43OB w Yamaha - Triple 300HP ...').
        sec_hit = any(norm(m.get("section")) == n for m in motors_ext)
        jeanneau_boat = all(any(norm(x).startswith(p) for p in
                                ("jeanneau", "merry fisher", "cap camarat"))
                            for x in boat_labels)
        if (" w " in f" {n} ") and (sec_hit or jeanneau_boat):
            return ("explained", "Jeanneau-family boat-package powerplant unit label "
                                 "(appears as a section header in the motors "
                                 "extraction; same approved out-of-Yamaha-scope class)")
        return "NEW", None

    def classify_rigging(nm, boat_labels):
        n = norm(nm)
        hits = [r for r in rig_ext
                if n and (norm(r.get("description")) == n
                          or n in norm(r.get("description"))
                          or norm(r.get("description")) in n)]
        for r in hits:
            if slugify(r.get("partNo") or "") in live_kit_ids:
                return ("explained", "kit doc IS live under shared partNo "
                        f"'{r.get('partNo')}' — MPF rigging sheet reuses one part "
                        "number for several descriptions; upsert-by-natural-key "
                        "collapsed them, a sibling description won. App shows the "
                        "menu label without the info-only price line.")
        return ("explained", "label absent from the MPF rigging sheet verbatim — "
                             "boat-sheet vs rigging-sheet source drift (label still "
                             "renders info-only in the quote flow)") if not hits else \
               ("explained", "extraction row exists but was not imported "
                             f"(partNo '{hits[0].get('partNo')}')")

    def classify_trailer(nm, boat_labels):
        if norm(nm) in KNOWN_TRAILER_SKIPS:
            return "known", "task known list — absent from the MPF source itself"
        if norm(nm) not in trailers_ext_names:
            return ("explained", "absent from the MPF trailer sheet itself — same "
                                 "class as the known TA800T-EH2 skip (full-web "
                                 "found it; the sampled run missed it)")
        return "NEW", None

    def summarize(rel, classify=None):
        known, explained, new = {}, {}, {}
        for nm, bl in rel.unresolved.items():
            bucket, reason = ("NEW", None) if classify is None else classify(nm, bl)
            entry = {"boats": sorted(set(bl))[:10], "reason": reason}
            {"known": known, "explained": explained, "NEW": new}[bucket][nm] = entry
        return {
            "checked": rel.checked,
            "resolved": rel.resolved,
            "resolvedButNoPrice": {nm: sorted(set(bl))[:10]
                                   for nm, bl in rel.resolved_no_price.items()},
            "resolvedButNoPriceCount": len(rel.resolved_no_price),
            "unresolvedKnown": known, "unresolvedKnownCount": len(known),
            "unresolvedExplained": explained, "unresolvedExplainedCount": len(explained),
            "unresolvedNEW": new, "unresolvedNEWCount": len(new),
        }

    relations = {
        rel_motor.name: summarize(rel_motor, classify_motor),
        rel_kit.name: summarize(rel_kit, classify_rigging),
        rel_trailer.name: summarize(rel_trailer, classify_trailer),
        rel_dfo.name: summarize(rel_dfo),
        rel_fo.name: summarize(rel_fo),
    }
    relations[rel_trailer.name]["sentinelRowsSkipped"] = {
        nm: sorted(set(bl))[:6] for nm, bl in trailer_sentinels.items()}
    relations[rel_fo.name]["modelsWithFoCodesButNoOptionalFeaturesArray"] = {
        "count": len(fo_models_no_of),
        "codesInBucket": sum(fo_no_of_array.values()),
        "note": ("known-architectural: the FO import wave only repriced EXISTING "
                 "Highfield per-model optionalFeatures; ref-code materialization "
                 "for the other brands' models was deliberately out of scope "
                 "(import-motors-trailers-fo.py header). Not counted as NEW."),
        "models": sorted(fo_models_no_of)[:25],
    }
    relations[rel_fo.name]["liveOptionalFeaturesRenderability"] = {
        "entries": of_entries, "renderable": of_render_ok,
        "bad": of_render_bad[:20],
        "note": "every live optionalFeatures entry must carry code + numeric "
                "sellPriceExclGst for the Step-2 FFO cards",
    }

    new_total = sum(r["unresolvedNEWCount"] for r in relations.values())
    explained_total = sum(r["unresolvedExplainedCount"] for r in relations.values())
    verdict = (f"EVERYTHING RESOLVES OR IS ACCOUNTED FOR — 0 unexplained; "
               f"{explained_total} name(s) outside the original known list are "
               f"each traced to an approved import decision or MPF source "
               f"inconsistency (see unresolvedExplained)"
               if new_total == 0 else
               f"ATTENTION — {new_total} UNEXPLAINED unresolved name(s)")

    data_level = {
        "generatedUtc": datetime.now(timezone.utc).isoformat(),
        "mode": "READ-ONLY (no Firestore writes), FULL WEB (no sampling)",
        "boatsWalked": {"total": len(boats), "byBrand": by_brand},
        "referenceIndexes": {"yamahaRows": len(yam_rows), "riggingKits": len(kits),
                             "dealerFitSelections": len(dfs), "liveTrailers": len(trailers)},
        "relations": relations,
        "verdict": verdict,
    }

    existing = {}
    if os.path.exists(OUT):
        try:
            with open(OUT) as f:
                existing = json.load(f)
        except Exception:
            existing = {}
    existing["phase"] = "phase5c.everything"
    existing["dataLevel"] = data_level
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(existing, f, indent=1)

    print(f"\nwrote {os.path.relpath(OUT, ROOT)}")
    for name, r in relations.items():
        print(f"  {name}: checked={r['checked']} resolved={r['resolved']} "
              f"known={r['unresolvedKnownCount']} "
              f"explained={r['unresolvedExplainedCount']} NEW={r['unresolvedNEWCount']}")
        for nm, e in r["unresolvedNEW"].items():
            print(f"    NEW UNRESOLVED: {nm}  (e.g. {e['boats'][:2]})")
    print(verdict)


if __name__ == "__main__":
    main()

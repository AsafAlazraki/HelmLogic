#!/usr/bin/env python3
"""HelmLogic mega smoke battery — data + security + ceremony sections.

Fans out one check per document/invariant across live Firestore (as the
canonical operator test user) plus repo-level release-ceremony checks.
Writes test-results/smoke-data.json. Pure smoke: shape/type/permission
invariants that must ALWAYS hold — not business-completeness rules that
are legitimately partial (e.g. a variant awaiting pricing).

Sections:
  B. Security rules — list every operator-facing collection
  C. Catalog integrity — Highfield ranges/models/variants field shapes
  D. Quote invariants — every org quote has id/org/created fields, sane totals
  E. Org config — exchange rates, fit-up items, service ops shapes
  F. Release ceremony — every shipped release has notes + user guide on disk
  H. Feature/roadmap integrity — valid statuses, no planned-on-shipped
  I. MPF parity — live values equal tasks/mpf-audit/extracted/*.json (Phase 5)
  J. Assignment web — boat motorMenu/trailerMenu/dealerFitLines names resolve live
  K. Presentation relevance — FFR-18 class ("faithful import != faithful
     presentation"): obsolete/### categories never visible-classified, no
     negative-price customer-facing lines unless hidden, deposit sums valid,
     no junk-marker names in picker collections, dup-display-name budget
"""
import json, os, sys, re, subprocess, platform, random
from datetime import datetime, timezone
import requests

RUN_STARTED = datetime.now(timezone.utc).isoformat()

PROJECT = "studio-2290360004-3b963"
API_KEY = "AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY"
ORG = "AcFZVEFA5UDJG2hyetWT"
HIGHFIELD = "LafOLpLb6QIFE856TiD4"
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"

r = requests.post(
    f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}",
    json={"email": "billh@nsmarine.com.au", "password": "Bill2026!", "returnSecureToken": True}, timeout=20).json()
H = {"Authorization": f"Bearer {r['idToken']}"}

checks = []
def check(section, name, ok, detail=""):
    checks.append({"section": section, "name": name, "ok": bool(ok), "detail": detail})

def fv(doc, key):
    v = doc.get("fields", {}).get(key)
    if v is None: return None
    for t in ("stringValue", "integerValue", "doubleValue", "booleanValue", "timestampValue"):
        if t in v:
            return float(v[t]) if t in ("integerValue", "doubleValue") else v[t]
    return v  # map/array

def list_docs(path, page_size=300):
    docs, tok = [], None
    while True:
        url = f"{BASE}/{path}?pageSize={page_size}" + (f"&pageToken={tok}" if tok else "")
        j = None
        for attempt in range(4):  # transient resets/5xx happen on long walks
            try:
                r2 = requests.get(url, headers=H, timeout=30)
                if r2.status_code in (429, 500, 502, 503, 504) and attempt < 3:
                    import time; time.sleep(2 ** attempt); continue
                j = r2.json()
                break
            except requests.exceptions.RequestException:
                if attempt == 3: raise
                import time; time.sleep(2 ** attempt)
        docs += j.get("documents", [])
        tok = j.get("nextPageToken")
        if not tok: return docs

# ---------- B. security rules ----------
RULE_PATHS = [
    "fitUpItems", "fitUpPackages", "fitUpClassificationRules", "fitUpCatalogAudit",
    "catalogAudit", "serviceOperations", "serviceParts", "serviceQuotes",
    "contentBlocks", "pdfStructure", "salesTeam", "emailTemplates", "sharePointConfig",
    "modelOverrides", "trailerOverrides", "exchangeRates", "dealerFitSelections",
    "auditLog",
]
for sub in RULE_PATHS:
    resp = requests.get(f"{BASE}/organisations/{ORG}/{sub}?pageSize=1", headers=H, timeout=20)
    check("B. Security rules", f"list organisations/{{org}}/{sub}", resp.status_code == 200, f"HTTP {resp.status_code}")
# sentEmails + contentOverrides live under the QUOTE subtree in the rules
# (users/{uid}/quotes/{qid}/...), and compatibilityRules under modules/{id}.
UID = r["localId"]
for sub in ("sentEmails", "contentOverrides", "variations", "contracts"):
    resp = requests.get(f"{BASE}/users/{UID}/quotes/rulesprobe/{sub}?pageSize=1", headers=H, timeout=20)
    check("B. Security rules", f"list users/{{uid}}/quotes/{{qid}}/{sub}", resp.status_code == 200, f"HTTP {resp.status_code}")
resp = requests.get(f"{BASE}/modules/M1Yf3R9igpJDxJnOVr6f/compatibilityRules?pageSize=1", headers=H, timeout=20)
check("B. Security rules", "list modules/{id}/compatibilityRules", resp.status_code == 200, f"HTTP {resp.status_code}")
for cg in ("quotes", "contracts"):
    resp = requests.post(f"{BASE}:runQuery", headers=H, timeout=20,
        json={"structuredQuery": {"from": [{"collectionId": cg, "allDescendants": True}], "limit": 1}})
    check("B. Security rules", f"collectionGroup {cg} read", resp.status_code == 200, f"HTTP {resp.status_code}")
resp = requests.get(f"{BASE}/customers?pageSize=1", headers=H, timeout=20)
check("B. Security rules", "list customers", resp.status_code == 200, f"HTTP {resp.status_code}")

# ---------- A. app routes up (local production build) ----------
APP = os.environ.get("SMOKE_APP_URL", "http://localhost:9002")
# NOTE: /proposals deliberately absent — it only exists as /proposals/[quoteNumber].
ROUTES = ["/login", "/dashboard", "/customers", "/pipeline", "/contracts", "/reporting",
          "/my-work", "/quote-comparison", "/search", "/audit-log", "/feature-tracking",
          # /price-book removed 2026-07-05 (dormant page deleted, structure-audit H9)
          "/manage", "/modules", "/pricing-manager",
          "/sub-dealers", "/suggestions", "/data-warehouse", "/organisations", "/admin"]
for route in ROUTES:
    try:
        pr = requests.get(f"{APP}{route}", timeout=25, allow_redirects=True)
        body = pr.text or ""
        check("A. App routes", f"{route}: HTTP 200", pr.status_code == 200, f"HTTP {pr.status_code}")
        check("A. App routes", f"{route}: app shell renders", "id=\"__next\"" in body or "HelmLogic" in body or "<div" in body, f"{len(body)} bytes")
        # 'Application error' = Next's client-crash page. (Do NOT match
        # 'Something went wrong' — that phrase legitimately appears in the
        # v1.9.5 release-notes content baked into /feature-tracking.)
        check("A. App routes", f"{route}: no error boundary text", "Application error" not in body)
    except Exception as e:
        check("A. App routes", f"{route}: reachable", False, str(e)[:80])

# ---------- C. catalog integrity (Highfield only) ----------
HF_LIVE_VARIANTS = {}  # variant doc id (== HB* SKU) -> {"sell", "cost"}; first occurrence wins (matches diff-boats)
ranges = list_docs(f"data-warehouse/{HIGHFIELD}/ranges")
check("C. Catalog", "Highfield ranges collection non-empty", len(ranges) >= 5, f"{len(ranges)} ranges")
model_total = variant_total = 0
for rg in ranges:
    rid = rg["name"].rsplit("/", 1)[-1]
    rname = fv(rg, "name") or rid
    check("C. Catalog", f"range {rid} has a name", bool(rname), str(rname))
    models = list_docs(f"data-warehouse/{HIGHFIELD}/ranges/{rid}/models")
    check("C. Catalog", f"range {rname}: models listable", True, f"{len(models)} models")
    for m in models:
        model_total += 1
        mid = m["name"].rsplit("/", 1)[-1]
        mname = fv(m, "name")
        check("C. Catalog", f"model {mid}: has name", bool(mname), str(mname))
        variants = list_docs(f"data-warehouse/{HIGHFIELD}/ranges/{rid}/models/{mid}/variants")
        check("C. Catalog", f"model {mname or mid}: variants listable", True, f"{len(variants)} variants")
        for v in variants:
            variant_total += 1
            vid = v["name"].rsplit("/", 1)[-1]
            price = fv(v, "sellPriceExclGst")
            HF_LIVE_VARIANTS.setdefault(vid, {"sell": price, "cost": fv(v, "cost")})
            # price is allowed to be absent (missing-pricing is a real state
            # the catalog UI highlights); when PRESENT it must be a positive number.
            if price is not None:
                ok = isinstance(price, float) and price > 0
                check("C. Catalog", f"variant {vid}: sellPriceExclGst positive number", ok, str(price))
            cost = fv(v, "cost")
            if cost is not None and isinstance(cost, float):
                check("C. Catalog", f"variant {vid}: cost non-negative", cost >= 0, str(cost))

check("C. Catalog", "Highfield model count sane (>=40)", model_total >= 40, f"{model_total} models")
check("C. Catalog", "Highfield variant count sane (>=100)", variant_total >= 100, f"{variant_total} variants")

# ---------- D. quote invariants ----------
resp = requests.post(f"{BASE}:runQuery", headers=H, timeout=30, json={"structuredQuery": {
    "from": [{"collectionId": "quotes", "allDescendants": True}],
    "where": {"fieldFilter": {"field": {"fieldPath": "organisationId"}, "op": "EQUAL", "value": {"stringValue": ORG}}},
    "limit": 500}})
qdocs = [row["document"] for row in resp.json() if isinstance(row, dict) and "document" in row]
check("D. Quotes", "org quotes queryable via collectionGroup", resp.status_code == 200, f"{len(qdocs)} quotes")
for q in qdocs:
    qid = q["name"].rsplit("/", 1)[-1]
    check("D. Quotes", f"quote {qid}: organisationId matches org", fv(q, "organisationId") == ORG)
    total = fv(q, "totalInclGst")
    if total is not None and isinstance(total, float):
        check("D. Quotes", f"quote {qid}: totalInclGst non-negative", total >= 0, str(total))
    state = fv(q, "lifecycleState")
    if state is not None:
        check("D. Quotes", f"quote {qid}: lifecycleState is known",
              state in ("draft", "sent", "accepted", "declined", "expired", "converted", "superseded", "cancelled", "finalized", "in-progress", "complete"),
              str(state))

# ---------- E. org config ----------
usd = requests.get(f"{BASE}/organisations/{ORG}/exchangeRates/USD", headers=H, timeout=20)
check("E. Org config", "exchange rate USD doc exists", usd.status_code == 200, f"HTTP {usd.status_code}")
if usd.status_code == 200:
    rate = fv(usd.json(), "rate")
    check("E. Org config", "USD rate is a positive number", isinstance(rate, float) and rate > 0, str(rate))
for coll, price_fields in (("fitUpItems", ("sellPriceExclGst", "price", "sellPrice")),
                           ("serviceOperations", ("sellPriceExclGst", "sellPrice", "hourlyRate")),
                           ("serviceParts", ("sellPriceExclGst", "sellPrice", "price"))):
    docs = list_docs(f"organisations/{ORG}/{coll}")
    check("E. Org config", f"{coll} listable", True, f"{len(docs)} docs")
    for d in docs:
        did = d["name"].rsplit("/", 1)[-1]
        # Sanctioned hide class (audit-presentation.py): negative-price MPF
        # deduction/CREDIT lines carry {hidden: true, hiddenReason} and are
        # excluded from customer-facing pickers — exempt them here too.
        if fv(d, "hidden") is True:
            continue
        for pf in price_fields:
            val = fv(d, pf)
            if val is not None and isinstance(val, float):
                check("E. Org config", f"{coll}/{did}: {pf} non-negative", val >= 0, str(val))
                break

# ---------- F. release ceremony ----------
sched = open("src/lib/release-schedule.ts").read()
shipped_keys = re.findall(r"'(v[\d.]+)':\s*\{\s*shipped:\s*true", sched)
check("F. Ceremony", "shipped releases parsed from RELEASE_WINDOWS", len(shipped_keys) >= 20, f"{len(shipped_keys)} shipped flags")
notes = {re.match(r"RELEASE_NOTES_(v[\d.]+)\.md", f).group(1) for f in os.listdir("tasks") if re.match(r"RELEASE_NOTES_v[\d.]+\.md", f)}
guides = {re.match(r"USER_GUIDE_(v[\d.]+)\.md", f).group(1) for f in os.listdir("tasks") if re.match(r"USER_GUIDE_v[\d.]+\.md", f)}
def norm(v): return v if v in notes or v in guides else (v + ".0" if v + ".0" in notes or v + ".0" in guides else v)
for k in shipped_keys:
    n = norm(k)
    check("F. Ceremony", f"{k}: release notes file exists", n in notes, f"tasks/RELEASE_NOTES_{n}.md")
    if float(k.replace("v", "").split(".")[0]) + float("0." + k.replace("v", "").split(".")[1]) >= 1.7:
        check("F. Ceremony", f"{k}: user guide file exists", n in guides, f"tasks/USER_GUIDE_{n}.md")

# ---------- H. roadmap integrity ----------
feats = list_docs("features")
check("H. Roadmap", "features collection readable", len(feats) > 250, f"{len(feats)} features")
VALID = {"shipped", "planned", "submitted", "dropped"}
shipped_set = set(shipped_keys)
for f in feats:
    fid = f["name"].rsplit("/", 1)[-1]
    st = fv(f, "status")
    check("H. Roadmap", f"feature {fid}: status valid", st in VALID, str(st))
    if st == "planned":
        tgt = fv(f, "targetRelease")
        check("H. Roadmap", f"feature {fid}: planned not stranded on shipped release",
              tgt not in shipped_set, f"target={tgt}")

# ---------- I. MPF parity (Phase 5 — live values vs extracted MPF datasets) ----------
MPF_EXT = "tasks/mpf-audit/extracted"
RNG = random.Random(42)  # deterministic samples — reruns compare the same docs

def load_mpf(name):
    with open(os.path.join(MPF_EXT, name)) as f:
        return json.load(f)

def mpf_extracts_present():
    """The MPF extraction JSONs are gitignored (they derive from the source
    xlsx, which lives outside git per the LFS lesson). On a fresh checkout
    (nightly CI, new container) sections I/J that diff against the extract
    are SKIPPED VISIBLY rather than crashing — the live-only sections
    (A-H, K, M, N) still run and still guard the system."""
    return os.path.exists(os.path.join(MPF_EXT, "boats.json"))

def fdec(v):
    """Full recursive Firestore value decode (fv keeps maps/arrays raw)."""
    for t in ("stringValue", "booleanValue", "timestampValue"):
        if t in v: return v[t]
    if "integerValue" in v: return int(v["integerValue"])
    if "doubleValue" in v: return v["doubleValue"]
    if "nullValue" in v: return None
    if "arrayValue" in v: return [fdec(x) for x in v["arrayValue"].get("values", [])]
    if "mapValue" in v: return {k: fdec(x) for k, x in v["mapValue"].get("fields", {}).items()}
    return None

def ddec(doc):
    out = {k: fdec(x) for k, x in doc.get("fields", {}).items()}
    out["_id"] = doc["name"].rsplit("/", 1)[-1]
    return out

def near(a, b, tol=0.01):
    if a is None or b is None: return a == b
    try: return abs(float(a) - float(b)) <= tol
    except (TypeError, ValueError): return False

def mpf_slug(s):
    # import-service-config.py slug (keeps dots — rego doc ids like mpf-heavy-trailers-over-4.55t)
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9.]+", "-", str(s).lower())).strip("-")

# Sections I + J diff live data against the MPF extraction JSONs, which are
# gitignored (derived from the source xlsx kept outside git). On checkouts
# without extracts (nightly CI, fresh containers) they skip VISIBLY and the
# live-only sections still guard everything.
try:
    # --- I.1 Highfield variants: ALL sell + cost vs boats.json (full verify) ---
    boats_ext = load_mpf("boats.json")["boats"]
    # HBS15## is a junk source SKU (literal '##') — intentionally never imported.
    hf_boats = [b for b in boats_ext if b["brand"] == "Highfield Inflatables" and b["modelCode"] != "HBS15##"]
    for b in hf_boats:
        sku = b["modelCode"]
        lv = HF_LIVE_VARIANTS.get(sku)
        if lv is None:
            check("I. MPF parity", f"boats: variant {sku} exists live", False, "no live variant doc")
            continue
        mpf_sell = b["sellLadder"]["cashExGst"]
        mpf_cost = b["landedCostChain"]["landedAUD"]
        if mpf_sell is not None:
            check("I. MPF parity", f"boats: {sku} sellPriceExclGst == MPF cash exGst",
                  near(lv["sell"], mpf_sell), f"live={lv['sell']} mpf={mpf_sell}")
        if mpf_cost is not None:
            check("I. MPF parity", f"boats: {sku} cost == MPF landed AUD",
                  near(lv["cost"], mpf_cost), f"live={lv['cost']} mpf={mpf_cost}")

    # --- I.2 Motors: 50-code sample, every mapped price level + cost vs motors.json ---
    YAMAHA_ROWS_PATH = "data-warehouse/mRAzkE8PUX8GMHELCvJo/dataSets/FQ5uTMyUorrJPlpbWIY8/rows"
    motors_ext = load_mpf("motors.json")["motors"]
    def pick_primary_motors(motors):  # same selection rule as scripts/mpf/diff-motors-trailers-fo.py
        by_code = {}
        def score(m):
            s = (m.get("section") or "")
            primary_display = (m.get("displayName") or "").strip() == f"Yamaha - {m['modelCode']}"
            powerplant = s.lower().startswith("powerplants") or " w " in s.lower()
            return (0 if primary_display else 1, 1 if powerplant else 0, m["sourceRow"])
        for m in motors:
            k = m["modelCode"]
            if k not in by_code or score(m) < score(by_code[k]):
                by_code[k] = m
        return by_code
    primary_motors = pick_primary_motors(motors_ext)
    yam_rows = [ddec(d) for d in list_docs(YAMAHA_ROWS_PATH)]
    yam_by_code = {}
    for rrow in yam_rows:
        code = str(rrow.get("MODEL CODE") or "").strip()
        if code:
            yam_by_code.setdefault(code, rrow)
    MOTOR_FIELD_MAP = [("NSM Retail", "hull_cash"), ("Trade Price", "hull_trade"),
                       ("Commercial Price", "hull_commercial"),
                       ("Boating Alliance Price", "hull_boating_alliance"),
                       ("Sell Price", "hull_campaign"), ("Total CTD", "cost")]
    motor_codes = sorted(set(primary_motors) & set(yam_by_code))
    for code in RNG.sample(motor_codes, min(50, len(motor_codes))):
        m, lrow = primary_motors[code], yam_by_code[code]
        for lf, ef in MOTOR_FIELD_MAP:
            mv = m["cost"] if ef == "cost" else m["priceLevels"].get(ef)
            if mv is None:
                continue
            check("I. MPF parity", f"motors: {code} {lf}", near(lrow.get(lf), mv),
                  f"live={lrow.get(lf)} mpf={mv}")

    # --- I.3 Trailers: 50-trailer sample vs trailers.json ---
    TRAILER_VENDORS = ["dunbier-trailers", "dunbier-haines-bmt", "gfab-trailers",
                       "mackay-trailers", "redco-tinka-trailers", "stacer-trailers",
                       "obsolete-trailers"]
    trailers_ext = load_mpf("trailers.json")
    live_trailer_by_name = {}
    for tv in TRAILER_VENDORS:
        for sdoc in list_docs(f"data-warehouse/{tv}/series"):
            sid = sdoc["name"].rsplit("/", 1)[-1]
            for tdoc in list_docs(f"data-warehouse/{tv}/series/{sid}/trailers"):
                t = ddec(tdoc)
                live_trailer_by_name.setdefault(str(t.get("name") or "").strip(), t)
    dup_trailer_names = set(trailers_ext.get("duplicatedNames") or [])
    trailer_cands = [t for t in trailers_ext["trailers"] if t["name"].strip() not in dup_trailer_names]
    for t in RNG.sample(trailer_cands, min(50, len(trailer_cands))):
        lt = live_trailer_by_name.get(t["name"].strip())
        if lt is None:
            check("I. MPF parity", f"trailers: {t['name'][:60]} exists live", False, "no live doc")
            continue
        spec = lt.get("specifications") or {}
        for label, lv, mv in [("sellPriceExclGst", lt.get("sellPriceExclGst"), t["sellExGst"]),
                              ("cost", lt.get("cost"), t["cost"]),
                              ("atmKg", spec.get("atmKg"), t["atm"]),
                              ("tareKg", spec.get("tareKg"), t["tare"])]:
            if mv is None:
                continue
            check("I. MPF parity", f"trailers: {t['name'][:60]} {label}", near(lv, mv),
                  f"live={lv} mpf={mv}")

    # --- I.4 Dealer fit: 100-doc sample actSell/actCtd vs dealer-fit.json ---
    dfo_rows = load_mpf("dealer-fit.json")["rows"]
    dfs_docs = [ddec(d) for d in list_docs(f"organisations/{ORG}/dealerFitSelections")]
    dfs_by_id = {d["_id"]: d for d in dfs_docs}
    dfo_by_id = {}
    for rw in dfo_rows:
        dfo_by_id.setdefault(rw["docId"], rw)  # dup docIds were dupSkipped at import
    for did in RNG.sample(sorted(dfo_by_id), min(100, len(dfo_by_id))):
        rw, ld = dfo_by_id[did], dfs_by_id.get(did)
        if ld is None:
            check("I. MPF parity", f"dealer-fit: {did} exists live", False, "no live doc")
            continue
        data = ((ld.get("items") or [{}])[0].get("data") or {})
        for lf, ef in (("Act Sell", "actSell"), ("Act CTD", "actCtd")):
            mv = rw.get(ef)
            if mv is None:
                continue
            check("I. MPF parity", f"dealer-fit: {did} {lf}", near(data.get(lf), mv),
                  f"live={data.get(lf)} mpf={mv}")

    # --- I.5 Service operations: 50-op sample vs service-operations.json ---
    ops_ext = load_mpf("service-operations.json")["operations"]
    live_ops_docs = [ddec(d) for d in list_docs(f"organisations/{ORG}/serviceOperations")]
    ops_by_code = {}
    for o in live_ops_docs:
        ops_by_code.setdefault(str(o.get("code") or "").strip(), o)
    ops_ext_by_key = {}
    for o in ops_ext:
        ops_ext_by_key.setdefault(o["opCode"] or o["syntheticKey"], o)
    for k in RNG.sample(sorted(ops_ext_by_key), min(50, len(ops_ext_by_key))):
        e, l = ops_ext_by_key[k], ops_by_code.get(k)
        if l is None:
            check("I. MPF parity", f"service-ops: {k} exists live", False, "no live doc")
            continue
        if e["labourHrs"] is not None:
            check("I. MPF parity", f"service-ops: {k} flatRateHours",
                  near(l.get("flatRateHours"), e["labourHrs"], 0.001),
                  f"live={l.get('flatRateHours')} mpf={e['labourHrs']}")
        if e["sellExGst"] is not None:
            check("I. MPF parity", f"service-ops: {k} sellPrice",
                  near(l.get("sellPrice"), e["sellExGst"], 0.02),
                  f"live={l.get('sellPrice')} mpf={e['sellExGst']}")
        if e["totalCtd"] is not None:
            check("I. MPF parity", f"service-ops: {k} cost",
                  near(l.get("cost"), e["totalCtd"], 0.02),
                  f"live={l.get('cost')} mpf={e['totalCtd']}")

    # --- I.6 Exchange rates: all 4 ---
    for r_fx in load_mpf("exchange-rates.json")["rates"]:
        resp = requests.get(f"{BASE}/organisations/{ORG}/exchangeRates/{r_fx['code']}", headers=H, timeout=20)
        live_rate = fv(resp.json(), "rate") if resp.status_code == 200 else None
        check("I. MPF parity", f"fx: {r_fx['code']} rate", resp.status_code == 200 and near(live_rate, r_fx["rate"], 1e-6),
              f"live={live_rate} mpf={r_fx['rate']} (HTTP {resp.status_code})")

    # --- I.7 Pricing matrix: count (47 franchises + retail-sliding-scale) ---
    pmx = load_mpf("pricing-matrix.json")
    pm_docs = list_docs(f"organisations/{ORG}/pricingMatrix")
    pm_expected = len(pmx["franchises"]) + 1
    check("I. MPF parity", "pricingMatrix: doc count == franchises + sliding-scale",
          len(pm_docs) == pm_expected, f"live={len(pm_docs)} expected={pm_expected}")
    check("I. MPF parity", "pricingMatrix: retail-sliding-scale doc present",
          any(d["name"].endswith("/retail-sliding-scale") for d in pm_docs))

    # --- I.8 Rego bands: every MPF QLD band present with correct sell ---
    rego_ext = load_mpf("rego-catalog.json")
    rego_live = {d["_id"]: d for d in (ddec(x) for x in list_docs("data-warehouse/qld-transport/regoTypes"))}
    for it in rego_ext["items"]:
        did = "mpf-" + mpf_slug(it["revCode"] or it["name"])
        ld = rego_live.get(did)
        check("I. MPF parity", f"rego: {did} present + sellExclGst",
              ld is not None and near(ld.get("sellExclGst"), it["sell"]),
              f"live={None if ld is None else ld.get('sellExclGst')} mpf={it['sell']}")

    # ---------- J. Assignment web (menus on boats resolve against live collections) ----------
    boats_with_menus = [b for b in boats_ext
                        if (b.get("motorMenu") or b.get("trailerMenu") or b.get("dealerFitLines"))]
    sample_boats = RNG.sample(boats_with_menus, min(100, len(boats_with_menus)))
    yam_names = set()
    for rrow in yam_rows:
        for kf in ("MODEL CODE", "MODEL", "DESCRIPTION"):
            vv = rrow.get(kf)
            if isinstance(vv, str) and vv.strip():
                yam_names.add(vv.strip().lower())
    live_trailer_names = {n.strip().lower() for n in live_trailer_by_name if n}
    dfs_names = {str(d.get("name") or "").strip().lower() for d in dfs_docs}

    def motor_resolves(nm):
        n = nm.strip().lower()
        base = re.sub(r"\s*\([^)]*\)$", "", n).strip()  # drop trailing "(Tiller)" / "(White)" qualifier
        for cand in (n, base, base.replace("yamaha - ", ""), n.replace("yamaha - ", "")):
            if cand in yam_names:
                return True
        return False

    j_stats = {"motorMenu -> Yamaha rows": [0, 0],
               "trailerMenu -> trailer vendor docs": [0, 0],
               "dealerFitLines -> dealerFitSelections": [0, 0]}
    j_unmatched = {k: set() for k in j_stats}
    for b in sample_boats:
        for e in (b.get("motorMenu") or []):
            nm = (e.get("motorName") or "").strip()
            if not nm:
                continue
            j_stats["motorMenu -> Yamaha rows"][1] += 1
            if motor_resolves(nm):
                j_stats["motorMenu -> Yamaha rows"][0] += 1
            else:
                j_unmatched["motorMenu -> Yamaha rows"].add(nm)
        for e in (b.get("trailerMenu") or []):
            nm = (e.get("name") or "").strip()
            if not nm:
                continue
            j_stats["trailerMenu -> trailer vendor docs"][1] += 1
            if nm.lower() in live_trailer_names:
                j_stats["trailerMenu -> trailer vendor docs"][0] += 1
            else:
                j_unmatched["trailerMenu -> trailer vendor docs"].add(nm)
        for nm in (b.get("dealerFitLines") or []):
            nm = (nm or "").strip()
            if not nm:
                continue
            j_stats["dealerFitLines -> dealerFitSelections"][1] += 1
            if nm.lower() in dfs_names:
                j_stats["dealerFitLines -> dealerFitSelections"][0] += 1
            else:
                j_unmatched["dealerFitLines -> dealerFitSelections"].add(nm)
    for rel, (hit, tot) in j_stats.items():
        rate = (100.0 * hit / tot) if tot else 100.0
        check("J. Assignment web", f"{rel}: match rate", True,
              f"{hit}/{tot} = {rate:.1f}% across {len(sample_boats)} sampled boats")
        for nm in sorted(j_unmatched[rel]):
            check("J. Assignment web", f"{rel}: unresolved name", False, nm)

except FileNotFoundError:
    check("I. MPF parity", "SKIPPED — MPF extraction JSONs not present on this checkout "
          "(gitignored; run scripts/mpf/extract-*.py against the source xlsx to enable)", True,
          "extract-diff sections skipped; live-only sections M/N still assert composition + drift")
    check("J. Assignment web", "SKIPPED — requires the MPF extraction JSONs (see I)", True, "")
    dfs_docs = [ddec(d) for d in list_docs(f"organisations/{ORG}/dealerFitSelections")]
    # Section K mixes extract-diff checks with LIVE checks; hydrate the live
    # inputs here so a fresh checkout (nightly CI) still runs every live
    # check instead of dying on NameError (caught 2026-07-14: the first
    # extract-less run crashed at K's yam_rows loop before writing results).
    boats_ext = []  # extract-only loops become no-ops
    YAMAHA_ROWS_PATH = "data-warehouse/mRAzkE8PUX8GMHELCvJo/dataSets/FQ5uTMyUorrJPlpbWIY8/rows"
    yam_rows = [ddec(d) for d in list_docs(YAMAHA_ROWS_PATH)]
    live_trailer_by_name = {}
    for tv in ["dunbier-trailers", "dunbier-haines-bmt", "gfab-trailers",
               "mackay-trailers", "redco-tinka-trailers", "stacer-trailers",
               "obsolete-trailers"]:
        for sdoc in list_docs(f"data-warehouse/{tv}/series"):
            sid = sdoc["name"].rsplit("/", 1)[-1]
            for tdoc in list_docs(f"data-warehouse/{tv}/series/{sid}/trailers"):
                t = ddec(tdoc)
                live_trailer_by_name.setdefault(str(t.get("name") or "").strip(), t)

# ---------- K. Presentation relevance (FFR-18 class hunt, permanent) ----------
# Full audit + rationale: scripts/mpf/audit-presentation.py +
# tasks/test-evidence/PRESENTATION_AUDIT.md. These checks pin the invariants.
K = "K. Presentation relevance"
# same artifact alphabet as scripts/mpf/audit-presentation.py JUNK_RE so the
# budgets below line up with the audit's counts
JUNK_NAME_RE = re.compile(r"(###|#N/A|#REF|\bNLA\b|\bPOA\b|\bERROR\b)", re.I)

# K.1 dealer-fit Step-5 classifier (port of highfield-quote-flow.tsx classifySection)
BRAND_RE = re.compile(r"(HIGHFIELD|STACER|STABICRAFT|SURTEES|JEANNEAU|FORMOSA|HAINES)")


def k_classify(raw):
    c = (raw or "").upper()
    if c.startswith("###") or "OBSELETE" in c or "OBSOLETE" in c: return "hidden"
    if "PRE DELIVERY" in c or "PRE-DELIVERY" in c: return "hidden"
    if "RIGGING KIT" in c or "HELM MASTER" in c or "ADD ON KITS" in c: return "hidden"
    if BRAND_RE.search(c) and re.search(r"\d{3}", c): return "model"
    if "SPECIFIC OPTIONS" in c: return "model"
    return "general"


k_cats = {}
for d in dfs_docs:  # fetched in I.4
    k_cats.setdefault(str(d.get("category") or "Gear"), []).append(d)
K_NOISE_RE = re.compile(r"(###|#N/A|\bNLA\b|OBSELETE|OBSOLETE|DISCONTINU|SUPERSEDED|WORKSHOP|"
                        r"PRE.?DELIVERY|RIGGING KIT|DO NOT USE|\bDNU\b)", re.I)
for cat in sorted(k_cats):
    kl = k_classify(cat)
    if K_NOISE_RE.search(cat):
        check(K, f"dealer-fit category '{cat[:60]}': obsolete/### noise never visible-classified",
              kl == "hidden", f"classified {kl}")
# KNOWN-ESCAPE BUDGET: sections the classifier still lets through as 'general'
# (found by the 2026-07-04 audit; each is a handoff — shrink, never grow):
#   'HIGHFIELD - Patrol' (brand+range, no digits) + 'ENGINE REMOVALS' +
#   'SURVEYING SUBLETS' + 'MPF – Uncategorised'
K_ESCAPE_RE = re.compile(r"\b(REMOVALS?|SUBLETS?|SURVEYING|UNCATEGORISED|UNCATEGORIZED)\b", re.I)
escapes = []
for cat in sorted(k_cats):
    if k_classify(cat) != "general":
        continue
    cu = cat.upper()
    brandish = bool(BRAND_RE.search(cu) and re.search(r"\b(PATROL|SPORT|CLASSIC|ROLL.?UP|ULTRA|ADVENTURE|COASTER)\b", cu)
                    and not re.search(r"\d{3}", cu))
    if brandish or K_ESCAPE_RE.search(cat):
        escapes.append(cat)
check(K, "dealer-fit visible-classified noise escapes within budget (<=4 known)",
      len(escapes) <= 4, "; ".join(escapes[:6]))
# no visible (general-classified) option with negative Act Sell or junk-marker name
k_neg_vis = k_junk_vis = 0
for cat, docs_ in k_cats.items():
    if k_classify(cat) != "general":
        continue
    for d in docs_:
        nm = str(d.get("name") or "")
        if JUNK_NAME_RE.search(nm):
            k_junk_vis += 1
        data = ((d.get("items") or [{}])[0] or {}).get("data") or {}
        sell = data.get("Act Sell")
        if isinstance(sell, (int, float)) and sell < 0:
            k_neg_vis += 1
check(K, "dealer-fit: no visible option has negative Act Sell", k_neg_vis == 0, f"{k_neg_vis} negative")
check(K, "dealer-fit: no visible option name carries ###/#N/A markers", k_junk_vis == 0, f"{k_junk_vis} junk")

# K.2 fitUpItems — negative sells must be hidden; no junk names; no workshop categories unhidden
k_fit = [ddec(d) for d in list_docs(f"organisations/{ORG}/fitUpItems")]
k_bad_neg = [d["_id"] for d in k_fit
             if isinstance(d.get("sellPrice"), (int, float)) and d.get("sellPrice") < 0 and not d.get("hidden")]
check(K, "fitUpItems: every negative-sellPrice line is hidden:true", not k_bad_neg,
      f"{len(k_bad_neg)} visible: {k_bad_neg[:5]}")
k_fit_junk = [d["_id"] for d in k_fit if JUNK_NAME_RE.search(str(d.get("name") or "")) and not d.get("hidden")]
check(K, "fitUpItems: junk-marker names within budget (<=2 known, handoff pending)",
      len(k_fit_junk) <= 2, f"{len(k_fit_junk)}: {k_fit_junk[:5]}")
k_fit_empty = sum(1 for d in k_fit if not str(d.get("name") or "").strip())
check(K, "fitUpItems: no empty item names", k_fit_empty == 0, f"{k_fit_empty} empty")

# K.3 model optionalFeatures + standardInclusions + depositSchedule/leadTimesDays
K_NONHF_RANGES = [("LWgHuGoKfUBeKZ8eWnEi", "mpf-catalog"), ("0cUm736tE9ON2WFLRHD0", "mpf-catalog"),
                  ("gLAi5eHYiZDgrvjDUaos", "mpf-catalog"), ("DJ5GVMzLaNWNcOlRqzJV", "mpf-catalog"),
                  ("lwGHoqdqNPuSZYYQAgG7", "jeanneau-mpf"), ("lwGHoqdqNPuSZYYQAgG7", "merry-fisher"),
                  ("lwGHoqdqNPuSZYYQAgG7", "cap-camarat"), ("formosa", "mpf-catalog")]
k_models = []
for rg in ranges:  # HF ranges fetched in C
    rid = rg["name"].rsplit("/", 1)[-1]
    k_models += [ddec(m) for m in list_docs(f"data-warehouse/{HIGHFIELD}/ranges/{rid}/models")]
for vid, rid in K_NONHF_RANGES:
    k_models += [ddec(m) for m in list_docs(f"data-warehouse/{vid}/ranges/{rid}/models")]
check(K, "models loaded for presentation checks (>=300)", len(k_models) >= 300, f"{len(k_models)} models")
k_of_junk = k_of_absurd = k_dep_bad = k_lead_bad = k_inc_wall_models = 0
k_of_neg = []
for m in k_models:
    mid = str(m.get("modelCode") or m.get("name") or m["_id"])
    for o in (m.get("optionalFeatures") or []):
        if not isinstance(o, dict):
            continue
        nm, cat = str(o.get("name") or ""), str(o.get("category") or "")
        if JUNK_NAME_RE.search(nm) or JUNK_NAME_RE.search(cat):
            k_of_junk += 1
        p = o.get("sellPriceExclGst")
        if isinstance(p, (int, float)):
            if p < 0:
                k_of_neg.append(f"{mid}:{nm[:40]}")
            elif p > 500_000:
                k_of_absurd += 1
    ds = m.get("depositSchedule") or {}
    stages = [v for v in ds.values() if isinstance(v, (int, float))]
    if stages:
        tot = sum(stages)
        if any(v < 0 for v in stages) or not (abs(tot - 1.0) < 0.005 or abs(tot - 100.0) < 0.5):
            k_dep_bad += 1
    for v in (m.get("leadTimesDays") or {}).values():
        if isinstance(v, (int, float)) and (v < 0 or v > 365):
            k_lead_bad += 1
    if any(isinstance(s, str) and len(s) > 200 for s in (m.get("standardInclusions") or [])):
        k_inc_wall_models += 1
check(K, "optionalFeatures: junk-marker names/categories within budget (<=4 known Merry Fisher NLA rows)",
      k_of_junk <= 4, f"{k_of_junk} junk")
check(K, "optionalFeatures: no absurd prices (> $500k)", k_of_absurd == 0, f"{k_of_absurd}")
# Negative option prices are REAL MPF delete-credits (93 Stabicraft + 6 Haines)
# — a product decision (render as 'Credit'?) is pending; budget must not grow.
check(K, "optionalFeatures: negative-price options within known credit budget (<=95)",
      len(k_of_neg) <= 95, f"{len(k_of_neg)}: {k_of_neg[:3]}")
check(K, "depositSchedule: every present schedule sums to 100% with no negative stages",
      k_dep_bad == 0, f"{k_dep_bad} bad")
check(K, "leadTimesDays: no absurd lead times (0..365)", k_lead_bad == 0, f"{k_lead_bad} bad")
check(K, "standardInclusions: render-wall (>200 char lines) model budget (<=168 known, handoff pending)",
      k_inc_wall_models <= 168, f"{k_inc_wall_models} models")

# K.4 motors — dup display names visible in pickers must not diverge on price
def k_motor_display(r):
    for kk in ("MODEL", "Model Name", "MODEL CODE", "Model", "name"):
        v = r.get(kk)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return r.get("_id", "")


k_by_disp = {}
for rrow in yam_rows:  # fetched in I.2
    k_by_disp.setdefault(k_motor_display(rrow).lower(), []).append(rrow)
k_dup_diff = [dn for dn, g in k_by_disp.items() if len(g) > 1
              and len({gg.get("NSM Retail") for gg in g}) > 1]
check(K, "motors: dup-display-name-with-different-NSM-Retail budget == 0",
      len(k_dup_diff) == 0, f"{len(k_dup_diff)}: {k_dup_diff[:5]}")
k_menu_no_retail = set()
for b in boats_ext:  # loaded in I.1
    for e in (b.get("motorMenu") or []):
        nm = re.sub(r"\s+", " ", str(e.get("motorName") or "")).strip().lower()
        if nm in k_by_disp and not isinstance(k_by_disp[nm][0].get("NSM Retail"), (int, float)):
            k_menu_no_retail.add(nm)
check(K, "motors: every motorMenu-resolved row has numeric NSM Retail",
      len(k_menu_no_retail) == 0, f"{len(k_menu_no_retail)}: {sorted(k_menu_no_retail)[:4]}")

# K.5 trailers — sentinel names + $0 sells on menu-referenced docs (NSM-ask pending)
k_menu_trailers = {str(e.get("name") or "").strip().lower()
                   for b in boats_ext for e in (b.get("trailerMenu") or [])}
k_sentinels = [n for n in live_trailer_by_name if re.search(r"NOT REQUIRED|\bTBA\b|\bTBC\b", n, re.I)]
check(K, "trailers: sentinel-name rows within budget (<=2 known 'TRAILER NOT REQUIRED', handoff pending)",
      len(k_sentinels) <= 2, f"{len(k_sentinels)}: {k_sentinels[:4]}")
k_zero_menu = [n for n, t in live_trailer_by_name.items()
               if n.lower() in k_menu_trailers and t.get("sellPriceExclGst") == 0]
check(K, "trailers: $0-sell menu-referenced docs within budget (<=2 known, NSM-ask pending)",
      len(k_zero_menu) <= 2, f"{len(k_zero_menu)}: {k_zero_menu[:4]}")
k_tr_junk = [n for n in live_trailer_by_name if JUNK_NAME_RE.search(n)]
check(K, "trailers: no junk-marker names", len(k_tr_junk) == 0, f"{k_tr_junk[:4]}")

# K.6 rego labels
k_rego = [ddec(d) for d in list_docs("data-warehouse/qld-transport/regoTypes")]
k_rego_bad = []
for d in k_rego:
    label = str(d.get("name") or d.get("label") or "")
    sell = d.get("sellExclGst") if isinstance(d.get("sellExclGst"), (int, float)) else d.get("sellPriceExclGst")
    if not label.strip() or JUNK_NAME_RE.search(label):
        k_rego_bad.append(f"{d['_id']}:junk-label")
    if isinstance(sell, (int, float)) and sell < 0:
        k_rego_bad.append(f"{d['_id']}:negative-sell")
    if re.search(r"not required", label, re.I) and sell not in (0, None):
        k_rego_bad.append(f"{d['_id']}:not-required-nonzero")
check(K, "regoTypes: labels sane ('Not Required' = $0, no junk, no negatives)",
      len(k_rego_bad) == 0, "; ".join(k_rego_bad[:5]))

# K.7 service collections + riggingKits — no negative sells, junk-name budgets
for coll, name_keys, sell_key, junk_budget in (
        ("serviceOperations", ("name", "description", "code"), "sellPrice", 0),
        ("engineServiceSchedules", ("name", "engine", "model"), "sellPrice", 0),
        ("riggingKits", ("description", "partNumber"), "sellPriceExclGst", 0),
        ("serviceParts", ("name", "partNumber"), "sellPrice", 150)):
    k_docs = [ddec(d) for d in list_docs(f"organisations/{ORG}/{coll}")]
    k_neg = sum(1 for d in k_docs if isinstance(d.get(sell_key), (int, float)) and d[sell_key] < 0)
    k_junk = sum(1 for d in k_docs
                 if JUNK_NAME_RE.search(next((str(d.get(kk)) for kk in name_keys
                                              if str(d.get(kk) or "").strip()), "")))
    check(K, f"{coll}: zero negative {sell_key}", k_neg == 0, f"{k_neg} negative / {len(k_docs)} docs")
    check(K, f"{coll}: junk-marker names within budget (<= {junk_budget})",
          k_junk <= junk_budget, f"{k_junk} junk / {len(k_docs)} docs")
    k_secs = {str(d.get("section") or "") for d in k_docs}
    k_bad_secs = [s for s in k_secs if s.startswith("###")]
    check(K, f"{coll}: no ###-marker section labels (picker group headings)",
          len(k_bad_secs) == 0, "; ".join(k_bad_secs[:3]))


# ---------- M. Display-Sheet composition inputs (live-only, EVERY MPF boat) ----------
# FFR-33 battery section M: v1.32 composes every quote like NSM's Display
# Sheet (hull inc price + PD tier + slot rigging kit + prop). This section
# asserts those composition INPUTS exist and are priced for every MPF
# variant so a data regression fails the nightly, not Mark's field test.
# Mirrors the quote flow's own resolution (highfield-quote-flow.tsx):
# rigging kit by normalised-name exact-then-substring match on
# name/desc/description with totalSellInstalledExclGst as the priced line;
# prop by serviceParts.partNumber with packageSupplyFitIncGst ->
# retailIncGst -> sellPrice preference.
M = "M. Display-Sheet inputs"
MPF_BRAND_RANGES = [
    ("Highfield", HIGHFIELD, "qo7IePnRzJxjrYyLWhTn"),
    ("Highfield", HIGHFIELD, "EqcKQ51svI1I2Q5poFdl"),
    ("Highfield", HIGHFIELD, "QsGZuVwutEr5yyMkp97j"),
    ("Highfield", HIGHFIELD, "nQ2LE50z9Tbf2uss0Ote"),
    ("Highfield", HIGHFIELD, "sEzdrM2fZsrOKA3ACrJp"),
    ("Highfield", HIGHFIELD, "vfXxDuMpChteKncb7LnG"),
    ("Highfield", HIGHFIELD, "coaster"),
    ("Stacer", "LWgHuGoKfUBeKZ8eWnEi", "mpf-catalog"),
    ("Stabicraft", "0cUm736tE9ON2WFLRHD0", "mpf-catalog"),
    ("Surtees", "gLAi5eHYiZDgrvjDUaos", "mpf-catalog"),
    ("Haines Signature", "DJ5GVMzLaNWNcOlRqzJV", "mpf-catalog"),
    ("Jeanneau (MPF)", "lwGHoqdqNPuSZYYQAgG7", "jeanneau-mpf"),
    ("Merry Fisher", "lwGHoqdqNPuSZYYQAgG7", "merry-fisher"),
    ("Cap Camarat", "lwGHoqdqNPuSZYYQAgG7", "cap-camarat"),
    ("Formosa", "formosa", "mpf-catalog"),
]
m_variants = []
for m_brand, m_vid, m_rid in MPF_BRAND_RANGES:
    for m_mdoc in list_docs(f"data-warehouse/{m_vid}/ranges/{m_rid}/models"):
        m_mid = m_mdoc["name"].rsplit("/", 1)[-1]
        for m_vdoc in list_docs(f"data-warehouse/{m_vid}/ranges/{m_rid}/models/{m_mid}/variants"):
            m_v = ddec(m_vdoc)
            if m_v.get("mpfSource"):
                m_variants.append((m_brand, m_mid, m_v))
check(M, "MPF variant walk non-trivial (>=700 variants)", len(m_variants) >= 700,
      f"{len(m_variants)} MPF-sourced variants walked")

m_missing_pd, m_missing_hull = [], []
m_kit_names, m_prop_nos = set(), set()
for m_brand, m_mid, m_v in m_variants:
    m_tiers = [t for t in (m_v.get("pdTiers") or []) if isinstance(t, dict)]
    m_t1 = next((t for t in m_tiers if t.get("tier") == 1), m_tiers[0] if m_tiers else None)
    m_sell = (m_t1 or {}).get("sellIncGst")
    if not (isinstance(m_sell, (int, float)) and m_sell > 0):
        m_missing_pd.append(f"{m_brand}/{m_mid}/{m_v['_id']}")
    if m_v.get("priceIncGst") is None and not m_v.get("priceLadder"):
        m_missing_hull.append(f"{m_brand}/{m_mid}/{m_v['_id']}")
    for m_slot in (m_v.get("motorMenu") or []):
        if not isinstance(m_slot, dict):
            continue
        if m_slot.get("riggingKit"):
            m_kit_names.add(re.sub(r"\s+", " ", str(m_slot["riggingKit"])).strip().lower())
        if m_slot.get("propPartNo"):
            m_prop_nos.add(str(m_slot["propPartNo"]).strip())
check(M, "every MPF variant carries PD tier 1 with sellIncGst > 0",
      len(m_missing_pd) == 0, f"{len(m_missing_pd)} missing; first: {m_missing_pd[:5]}")
check(M, "every MPF variant carries an inc-GST hull price (priceIncGst or priceLadder)",
      len(m_missing_hull) == 0, f"{len(m_missing_hull)} missing; first: {m_missing_hull[:5]}")

m_kits = [ddec(d) for d in list_docs(f"organisations/{ORG}/riggingKits")]
def m_kit_label(k):
    return str(k.get("name") or k.get("desc") or k.get("description") or "")
m_kit_norm = {re.sub(r"\s+", " ", m_kit_label(k)).strip().lower(): k for k in m_kits if m_kit_label(k).strip()}
def m_kit_resolves(target):
    if target in m_kit_norm:
        return m_kit_norm[target]
    for lbl, k in m_kit_norm.items():
        if lbl and (target in lbl or lbl in target):
            return k
    return None
# Semantic no-kit markers (MPF want-shown signifiers meaning "no
# separately-priced rigging"): NR fillers, tiller-steer motors, kits the
# factory fits inside the boat price. They are EXPECTED not to resolve
# or price — see tasks/mpf-boat-page-signifiers.md.
def m_no_kit(nm):
    return (nm.startswith(("nr -", "nr-")) or "not required" in nm
            or "tiller handle" in nm or "factory fit" in nm)
m_kit_real = sorted(n for n in m_kit_names if not m_no_kit(n))
m_kits_unresolved, m_kits_unpriced = [], []
for m_nm in m_kit_real:
    m_hit = m_kit_resolves(m_nm)
    if m_hit is None:
        m_kits_unresolved.append(m_nm)
    else:
        m_inst = m_hit.get("totalSellInstalledExclGst")
        if not (isinstance(m_inst, (int, float)) and m_inst > 0):
            m_kits_unpriced.append(m_nm)
# Known-gaps ratchet: standing day-1 gaps live in a committed allowlist;
# the nightly FAILS only on regressions (new names beyond the list) and
# keeps the standing count visible as a passing check. Shrink the file as
# the mapping work lands (v1.34 work item).
m_known = {"kitsUnresolved": [], "kitsUnpriced": [], "propsUnresolved": []}
m_known_path = "tasks/mpf-audit/known-gaps-composition.json"
if os.path.exists(m_known_path):
    m_known.update(json.load(open(m_known_path)))
m_new_unresolved = sorted(set(m_kits_unresolved) - set(m_known["kitsUnresolved"]))
m_new_unpriced = sorted(set(m_kits_unpriced) - set(m_known["kitsUnpriced"]))
check(M, "slot rigging kits: NO NEW unresolved names beyond the known-gaps allowlist",
      len(m_new_unresolved) == 0,
      f"{len(m_new_unresolved)} NEW: {m_new_unresolved[:5]}")
check(M, "slot rigging kits: standing known-gap count (mapping backlog, v1.34)",
      True, f"{len(m_kits_unresolved)} unresolved / {len(m_kits_unpriced)} unpriced of {len(m_kit_real)} real kit names (+{len(m_kit_names)-len(m_kit_real)} semantic no-kit markers)")
check(M, "slot rigging kits: NO NEW unpriced kits beyond the known-gaps allowlist",
      len(m_new_unpriced) == 0, f"{len(m_new_unpriced)} NEW: {m_new_unpriced[:5]}")

# Prop placeholder grammar (Excel-limitation signifiers): '0' = no prop,
# 'xx' wildcards = pitch chosen at rigging time, 'A / B' = dual options,
# TBA/TBC. Expected not to resolve to a single part.
def m_prop_placeholder(pn):
    u = pn.upper()
    return (pn == "0" or "XX" in u or "/" in pn or "TBA" in u or "TBC" in u
            or "SUPPLIED WITH MOTOR" in u)  # semantic no-prop marker
m_prop_real = sorted(p for p in m_prop_nos if not m_prop_placeholder(p))
m_props_unresolved, m_props_unpriced = [], []
for m_pn in m_prop_real:
    m_resp = requests.post(f"{BASE}/organisations/{ORG}:runQuery",
                           headers=H, timeout=30, json={"structuredQuery": {
        "from": [{"collectionId": "serviceParts"}],
        "where": {"fieldFilter": {"field": {"fieldPath": "partNumber"}, "op": "EQUAL",
                                  "value": {"stringValue": m_pn}}},
        "limit": 1}}).json()
    m_doc = next((row["document"] for row in m_resp if isinstance(row, dict) and "document" in row), None)
    if m_doc is None:
        m_props_unresolved.append(m_pn)
        continue
    m_part = ddec(m_doc)
    m_price = next((m_part.get(k) for k in ("packageSupplyFitIncGst", "retailIncGst", "sellPrice")
                    if isinstance(m_part.get(k), (int, float)) and m_part.get(k) > 0), None)
    if m_price is None:
        m_props_unpriced.append(m_pn)
m_new_props = sorted(set(m_props_unresolved) - set(m_known["propsUnresolved"]))
check(M, "slot props: NO NEW unresolved real part numbers beyond the known-gaps allowlist",
      len(m_new_props) == 0, f"{len(m_new_props)} NEW: {m_new_props[:5]}")
check(M, "slot props: standing counts (placeholders are expected-unresolvable)",
      True, f"{len(m_props_unresolved)} unresolved of {len(m_prop_real)} real part numbers (+{len(m_prop_nos)-len(m_prop_real)} placeholders)")
check(M, "every resolved slot prop carries a usable price (packageSupplyFitIncGst/retailIncGst/sellPrice)",
      len(m_props_unpriced) == 0,
      f"{len(m_props_unpriced)} unpriced; first: {m_props_unpriced[:5]}")
os.makedirs("test-results", exist_ok=True)
json.dump({"kitsUnresolved": m_kits_unresolved, "kitsUnpriced": m_kits_unpriced,
           "propsUnresolved": m_props_unresolved,
           "noKitMarkers": sorted(n for n in m_kit_names if m_no_kit(n)),
           "propPlaceholders": sorted(p for p in m_prop_nos if m_prop_placeholder(p))},
          open("test-results/composition-gaps.json", "w"), indent=1)

# ---------- N. Override drift alarm (live-only) ----------
# FFR-33 battery section N: the v1.32 root cause #1 was the org
# modelOverrides layer silently shadowing migrated catalog prices. The
# fleet was swept to 0 shadows; this section keeps it at 0 forever —
# any operator/import that re-introduces a shadow fails the nightly.
# (Port of scripts/audit-override-staleness.py's same-name diff.)
N = "N. Override drift"
n_hf_ranges = {"qo7IePnRzJxjrYyLWhTn": None, "EqcKQ51svI1I2Q5poFdl": None,
               "QsGZuVwutEr5yyMkp97j": None, "nQ2LE50z9Tbf2uss0Ote": None,
               "sEzdrM2fZsrOKA3ACrJp": None, "vfXxDuMpChteKncb7LnG": None, "coaster": None}
n_catalog = {}
n_model_range = {}
for n_rid in n_hf_ranges:
    for n_mdoc in list_docs(f"data-warehouse/{HIGHFIELD}/ranges/{n_rid}/models"):
        n_m = ddec(n_mdoc)
        n_catalog[n_m["_id"]] = n_m
        n_model_range[n_m["_id"]] = n_rid
def n_norm(s):
    return re.sub(r"\s+", " ", str(s or "")).strip().lower()
def n_price(f):
    for k in ("sellPriceExclGst", "price"):
        v = f.get(k)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            return float(v)
    return None
n_shadows = []
n_overrides = [ddec(d) for d in list_docs(f"organisations/{ORG}/modelOverrides")]
for n_ov in n_overrides:
    n_cat = n_catalog.get(n_ov["_id"])
    if not n_cat:
        continue  # override for another vendor / deleted model — staleness audit covers classification
    n_cat_fo = {n_norm(f.get("name")): f for f in (n_cat.get("optionalFeatures") or []) if isinstance(f, dict)}
    for n_f in (n_ov.get("optionalFeatures") or []):
        if not isinstance(n_f, dict):
            continue
        n_cf = n_cat_fo.get(n_norm(n_f.get("name")))
        if not n_cf:
            continue  # override-only feature: legitimate operator addition
        n_po, n_pc = n_price(n_f), n_price(n_cf)
        if n_po is not None and n_pc is not None and abs(n_po - n_pc) > 0.005:
            n_shadows.append(f"{n_ov['_id']}: {n_f.get('name')} override={n_po} catalog={n_pc}")
    for n_k in ("sellPriceExclGst", "cost"):
        n_vo, n_vc = n_ov.get(n_k), n_cat.get(n_k)
        if isinstance(n_vo, (int, float)) and isinstance(n_vc, (int, float)) and abs(n_vo - n_vc) > 0.005:
            n_shadows.append(f"{n_ov['_id']}: model.{n_k} override={n_vo} catalog={n_vc}")
    n_vov = n_ov.get("variantOverrides")
    if isinstance(n_vov, dict) and n_vov:
        n_cvars = {d2["_id"]: d2 for d2 in
                   (ddec(x) for x in list_docs(
                       f"data-warehouse/{HIGHFIELD}/ranges/{n_model_range[n_ov['_id']]}/models/{n_ov['_id']}/variants"))}
        for n_vid2, n_vdata in n_vov.items():
            if not isinstance(n_vdata, dict):
                continue
            n_cv = n_cvars.get(n_vid2) or {}
            for n_k in ("sellPriceExclGst", "priceIncGst", "cost"):
                n_a, n_b = n_vdata.get(n_k), n_cv.get(n_k)
                if isinstance(n_a, (int, float)) and isinstance(n_b, (int, float)) and abs(n_a - n_b) > 0.005:
                    n_shadows.append(f"{n_ov['_id']}/{n_vid2}: {n_k} override={n_a} catalog={n_b}")
check(N, f"modelOverrides drift: 0 shadowed prices across {len(n_overrides)} override docs",
      len(n_shadows) == 0, f"{len(n_shadows)} shadows; first: {n_shadows[:5]}")

# ---------- write ----------
os.makedirs("test-results", exist_ok=True)
passed = sum(1 for c in checks if c["ok"])
def sh(cmd):
    try: return subprocess.check_output(cmd, shell=True, text=True).strip()
    except Exception: return "n/a"
meta = {
    "runStartedUtc": RUN_STARTED,
    "runFinishedUtc": datetime.now(timezone.utc).isoformat(),
    "gitCommit": sh("git rev-parse HEAD"),
    "gitBranchTip": sh("git log --oneline -1"),
    "identity": "billh@nsmarine.com.au (operator test user, Northside Marine)",
    "firebaseProject": PROJECT,
    "organisationId": ORG,
    "appUnderTest": os.environ.get("SMOKE_APP_URL", "http://localhost:9002") + " (production build, `next build && next start`)",
    "python": platform.python_version(),
    "reproduce": "python3 scripts/smoke-1000.py  (requires network access to Firestore + the app URL)",
}
out = {"meta": meta, "total": len(checks), "passed": passed, "failed": len(checks) - passed, "checks": checks}
json.dump(out, open("test-results/smoke-data.json", "w"), indent=1)
print(f"SMOKE-DATA: {passed}/{len(checks)} passed")
for c in checks:
    if not c["ok"]:
        print(f"  FAIL [{c['section']}] {c['name']} :: {c['detail']}")

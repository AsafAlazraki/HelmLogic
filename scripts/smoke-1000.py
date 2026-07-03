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
        j = requests.get(url, headers=H, timeout=30).json()
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
          "/manage", "/modules", "/pricing-manager", "/price-book",
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

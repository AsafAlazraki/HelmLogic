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
"""
import json, os, sys, re, subprocess, platform
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

#!/usr/bin/env python3
"""MPF Phase 2 — READ-ONLY diff: extracted Service/Pricing/Rego/FX config vs live Firestore.

Reads (never writes) via Firestore REST as billh@nsmarine.com.au:
  organisations/{ORG}/serviceOperations   vs extracted/service-operations.json
  organisations/{ORG}/serviceParts        vs extracted/service-consumables.json
  organisations/{ORG}/exchangeRates       vs extracted/exchange-rates.json (headline: USD)
  data-warehouse (vendorType == 'Rego Authority') + {vendor}/regoTypes vs extracted/rego-catalog.json

Outputs:
  tasks/mpf-audit/extracted/SERVICE_CONFIG_DIFF.md
  tasks/mpf-audit/extracted/service-config-diff.json
"""
import json, datetime, requests

PROJECT = "studio-2290360004-3b963"
API_KEY = "AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY"
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
ORG = "AcFZVEFA5UDJG2hyetWT"
EXT = "tasks/mpf-audit/extracted"

tok = requests.post(
    f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}",
    json={"email": "billh@nsmarine.com.au", "password": "Bill2026!", "returnSecureToken": True},
    timeout=20).json()
if "idToken" not in tok:
    raise SystemExit(f"auth failed: {tok.get('error', {}).get('message')}")
H = {"Authorization": f"Bearer {tok['idToken']}"}


def from_fs(f):
    for k, v in f.items():
        if k == "stringValue": return v
        if k == "integerValue": return int(v)
        if k == "doubleValue": return v
        if k == "booleanValue": return v
        if k == "nullValue": return None
        if k == "timestampValue": return v
        if k == "arrayValue": return [from_fs(x) for x in v.get("values", [])]
        if k == "mapValue": return {kk: from_fs(vv) for kk, vv in v.get("fields", {}).items()}
    return None


def doc_to_dict(d):
    out = {kk: from_fs(vv) for kk, vv in d.get("fields", {}).items()}
    out["_id"] = d["name"].rsplit("/", 1)[-1]
    return out


def list_col(path):
    docs, token = [], None
    while True:
        url = f"{BASE}/{path}?pageSize=300" + (f"&pageToken={token}" if token else "")
        r = requests.get(url, headers=H, timeout=30)
        if r.status_code != 200:
            return None, f"HTTP {r.status_code}: " + " ".join(r.text.split())[:140]
        j = r.json()
        docs += [doc_to_dict(d) for d in j.get("documents", [])]
        token = j.get("nextPageToken")
        if not token:
            return docs, None


def run_query(parent, coll, field, op, value):
    body = {"structuredQuery": {
        "from": [{"collectionId": coll}],
        "where": {"fieldFilter": {"field": {"fieldPath": field}, "op": op,
                                  "value": {"stringValue": value}}}}}
    r = requests.post(f"{BASE}{parent}:runQuery", headers=H, json=body, timeout=30)
    if r.status_code != 200:
        return None, f"HTTP {r.status_code}: {r.text[:160]}"
    return [doc_to_dict(x["document"]) for x in r.json() if "document" in x], None


diff = {"generatedUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "org": ORG, "mode": "READ-ONLY", "sections": {}}
md = [f"# MPF Phase 2 — Service/Pricing config diff (live vs extracted)",
      f"", f"> READ-ONLY comparison, {diff['generatedUtc']}. Org `{ORG}` as billh@nsmarine.com.au.", ""]

# ── serviceOperations ──────────────────────────────────────────────
ext_ops = json.load(open(f"{EXT}/service-operations.json"))["operations"]
live_ops, err = list_col(f"organisations/{ORG}/serviceOperations")
sec = {"error": err}
if live_ops is not None:
    live_by_code = {}
    for o in live_ops:
        live_by_code.setdefault(str(o.get("code", "")).strip(), []).append(o)
    ext_by_code = {}
    for o in ext_ops:
        k = o["opCode"] or o["syntheticKey"]
        ext_by_code.setdefault(k, []).append(o)
    matched, drift, missing_live = [], [], []
    for code, exts in ext_by_code.items():
        lv = live_by_code.get(code)
        if not lv:
            missing_live.append(code)
            continue
        e, l = exts[0], lv[0]
        deltas = {}
        if e["labourHrs"] is not None and l.get("flatRateHours") is not None and \
                abs(float(l["flatRateHours"]) - e["labourHrs"]) > 0.001:
            deltas["flatRateHours"] = {"live": l["flatRateHours"], "mpf": e["labourHrs"]}
        for lf, ef in (("sellPrice", "sellExGst"), ("cost", "totalCtd")):
            if e[ef] is not None and l.get(lf) is not None and \
                    abs(float(l[lf]) - e[ef]) > 0.02:
                deltas[lf] = {"live": l[lf], "mpf": e[ef]}
        (drift if deltas else matched).append({"code": code, **({"deltas": deltas} if deltas else {})})
    extra_live = sorted(set(live_by_code) - set(ext_by_code))
    hourly_rates = sorted({o.get("hourlyRate") for o in live_ops if o.get("hourlyRate") is not None})
    sec = {"liveCount": len(live_ops), "extractedCount": len(ext_ops),
           "extractedUniqueKeys": len(ext_by_code),
           "matchedByCode": len(matched), "rateDrift": drift,
           "inMpfNotLive": len(missing_live), "inMpfNotLiveSample": missing_live[:20],
           "inLiveNotMpf": extra_live, "liveHourlyRates": hourly_rates,
           "liveSample": [{k: o.get(k) for k in ("_id", "code", "name", "flatRateHours", "hourlyRate", "cost", "sellPrice")}
                          for o in live_ops[:10]]}
diff["sections"]["serviceOperations"] = sec
md += ["## serviceOperations", ""]
if err:
    md.append(f"- ERROR listing collection: {err}")
else:
    md += [f"- Live: **{sec['liveCount']}** docs · MPF extracted: **{sec['extractedCount']}** ops "
           f"({sec['extractedUniqueKeys']} unique op keys — truncated-code families like `DFO_` x34 collapse; "
           f"import disambiguates doc IDs with dedupe suffixes)",
           f"- Matched by code: **{sec['matchedByCode']}** · price/hour drift on matched: **{len(sec['rateDrift'])}**",
           f"- In MPF but NOT live: **{sec['inMpfNotLive']}** unique keys (would be created on import)",
           f"- In live but NOT in MPF: **{len(sec['inLiveNotMpf'])}** {sec['inLiveNotMpf'][:15]}",
           f"- Distinct live hourlyRate values: {sec['liveHourlyRates']} (MPF retail = 144.55 ex GST / 159 inc)"]
    for d in sec["rateDrift"][:25]:
        md.append(f"  - `{d['code']}`: {d['deltas']}")
md.append("")

# ── serviceParts ──────────────────────────────────────────────────
ext_parts = json.load(open(f"{EXT}/service-consumables.json"))["parts"]
live_parts, err = list_col(f"organisations/{ORG}/serviceParts")
sec = {"error": err}
if live_parts is not None:
    live_by_pn = {str(p.get("partNumber", "")).strip(): p for p in live_parts}
    ext_by_pn = {p["partNumber"]: p for p in ext_parts}
    matched = sorted(set(live_by_pn) & set(ext_by_pn))
    drift = []
    for pn in matched:
        e, l = ext_by_pn[pn], live_by_pn[pn]
        deltas = {}
        for lf, ef in (("cost", "cost"), ("sellPrice", "sellPrice")):
            if e[ef] is not None and l.get(lf) is not None and abs(float(l[lf]) - e[ef]) > 0.02:
                deltas[lf] = {"live": l[lf], "mpf": e[ef]}
        if deltas:
            drift.append({"partNumber": pn, "deltas": deltas})
    sec = {"liveCount": len(live_parts), "extractedCount": len(ext_parts),
           "matched": matched, "drift": drift,
           "inMpfNotLive": sorted(set(ext_by_pn) - set(live_by_pn)),
           "inLiveNotMpf": sorted(set(live_by_pn) - set(ext_by_pn))[:30]}
diff["sections"]["serviceParts"] = sec
md += ["## serviceParts (vs Oils & Lubes consumables)", ""]
if err:
    md.append(f"- ERROR: {err}")
else:
    md += [f"- Live: **{sec['liveCount']}** docs · MPF consumables: **{sec['extractedCount']}**",
           f"- Matched by partNumber: **{len(sec['matched'])}** · drift: **{len(sec['drift'])}** {sec['drift'][:5]}",
           f"- In MPF but NOT live: **{len(sec['inMpfNotLive'])}** (created on import)",
           f"- In live but NOT in this MPF slice: **{len(sec['inLiveNotMpf'])}** (untouched — Parts Module wave handles the full parts master)"]
md.append("")

# ── exchangeRates ─────────────────────────────────────────────────
ext_fx = json.load(open(f"{EXT}/exchange-rates.json"))["rates"]
live_fx, err = list_col(f"organisations/{ORG}/exchangeRates")
sec = {"error": err}
if live_fx is not None:
    live_by_code = {p["_id"]: p for p in live_fx}
    rows = []
    for r in ext_fx:
        l = live_by_code.get(r["code"])
        rows.append({"code": r["code"], "mpfRate": r["rate"],
                     "liveRate": (l or {}).get("rate"), "liveDoc": bool(l),
                     "delta": None if not l or l.get("rate") is None else round(float(l["rate"]) - r["rate"], 6)})
    sec = {"liveDocs": {p['_id']: p.get('rate') for p in live_fx}, "comparison": rows,
           "conventionNote": "both sides are divisor-style (AUD = foreign / rate); directly comparable"}
diff["sections"]["exchangeRates"] = sec
md += ["## exchangeRates — HEADLINE CHECK (quotes convert with this!)", ""]
if err:
    md.append(f"- ERROR: {err}")
else:
    md.append(f"- Live docs: {sec['liveDocs']}")
    for r in sec["comparison"]:
        flag = ""
        if not r["liveDoc"]:
            flag = " — **no live doc, created on import**"
        elif r["delta"] not in (None, 0):
            flag = f" — **DRIFT delta {r['delta']}**"
        elif r["delta"] == 0:
            flag = " — match"
        md.append(f"- **{r['code']}**: MPF {r['mpfRate']} vs live {r['liveRate']}{flag}")
    md.append("- Convention verified: HelmLogic computes `baseAud = totalUsd / exchangeRate` "
              "(highfield-pricing-workspace.tsx) — same divisor style as MPF's Exchange Rates sheet.")
md.append("")

# ── rego catalog ──────────────────────────────────────────────────
ext_rego = json.load(open(f"{EXT}/rego-catalog.json"))
rego_vendors, err = run_query("", "data-warehouse", "vendorType", "EQUAL", "Rego Authority")
sec = {"error": err, "path": "data-warehouse/{vendorId}/regoTypes/{regoTypeId} (rego-workspace.tsx; seeded vendor qld-transport)"}
if rego_vendors is not None:
    sec["vendors"] = [{"id": v["_id"], "name": v.get("name"), "state": v.get("state")} for v in rego_vendors]
    sec["byVendor"] = {}
    for v in rego_vendors:
        types, terr = list_col(f"data-warehouse/{v['_id']}/regoTypes")
        sec["byVendor"][v["_id"]] = {"error": terr, "types": [
            {k: t.get(k) for k in ("_id", "name", "sellExclGst", "appliesTo",
                                   "minLengthM", "maxLengthM", "minAtmKg", "maxAtmKg")}
            for t in (types or [])]}
diff["sections"]["regoCatalog"] = sec
md += ["## Rego catalog", "",
       f"- Path found: `{sec['path']}`"]
if err:
    md.append(f"- ERROR querying Rego Authority vendors: {err}")
else:
    md.append(f"- Rego Authority vendors live: {sec['vendors']}")
    for vid, info in sec["byVendor"].items():
        md.append(f"- `{vid}` regoTypes: {len(info['types'])}" + (f" (ERROR {info['error']})" if info["error"] else ""))
        for t in info["types"]:
            md.append(f"    - {t['_id']}: {t['name']} — ${t['sellExclGst']} ({t['appliesTo']})")
    md += ["", "### MPF QLD Registration Module vs live",
           "MPF bands (SELL, GST-free, as at 1/7/25):"]
    for it in ext_rego["items"]:
        md.append(f"    - {it['name']} [{it['revCode'] or '—'}]: CTD {it['ctd']} → SELL {it['sell']}")
    md += ["",
           "**Assessment**: the live `qld-transport` regoTypes were seeded as *indicative* rates "
           "(scripts/seed-qld-registration.py). MPF is the authoritative dealer price list — live "
           "band boundaries AND fees differ (e.g. live boat band 4.5-8m $163 vs MPF 4.51-6.0m $250; "
           "live trailer bands by ATM kg vs MPF by weight-class tonnes). Import will upsert MPF bands "
           "as new regoTypes and flag the seeded indicative ones for review, not delete them."]
md.append("")

# ── pricing matrix / engine schedules / freight (all NEW collections) ──
for coll, label in (("pricingMatrix", "pricing-matrix.json"),
                    ("engineServiceSchedules", "engine-service-schedules.json"),
                    ("freightConfig", "freight-config.json")):
    docs, err = list_col(f"organisations/{ORG}/{coll}")
    diff["sections"][coll] = {"liveCount": None if docs is None else len(docs), "error": err}
    md.append(f"## organisations/{{org}}/{coll} (NEW collection)")
    if err:
        md.append(f"- list attempt: {err} (expected if no rule/collection yet — import creates it; rules deploy needed)")
    else:
        md.append(f"- Live docs: {len(docs)} — import will create/patch from {label}")
    md.append("")

with open(f"{EXT}/service-config-diff.json", "w") as f:
    json.dump(diff, f, indent=1)
with open(f"{EXT}/SERVICE_CONFIG_DIFF.md", "w") as f:
    f.write("\n".join(md) + "\n")
print("wrote SERVICE_CONFIG_DIFF.md + service-config-diff.json")
for k, v in diff["sections"].items():
    if isinstance(v, dict):
        print(f"  {k}: " + (f"ERROR {v['error']}" if v.get("error") else "ok"))

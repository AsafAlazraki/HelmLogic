#!/usr/bin/env python3
"""
Seed the v1.31 MPF-migration + testing-overhaul release onto the Roadmap.

Creates TWO epics and 14 shipped stories, all targetRelease 'v1.31':

  Epic 12 — Master Price File Migration  (epics/mpf-migration, 9 stories 12.x)
  Epic 13 — Testing & Evidence Overhaul  (epics/testing-evidence, 5 stories 13.x)

Numbering checked against live Firestore 2026-07-03: existing story prefixes
run 1.x–11.x (Epic 11 = Service Quoting), so 12 + 13 are the next free epic
numbers. Zero existing '12.*'/'13.*' titles, zero existing v1.31 stories.

Idempotent by stable doc ids (PATCH replaces the full doc each run).
Default DRY-RUN; pass --apply to write. Reads back counts after apply.

Evidence sources: tasks/mpf-audit/MAPPING.md + AUDIT_LOG.jsonl,
tasks/test-evidence/MPF_PARITY.md + fail-fix-retest.json +
image-remediation.md, git log 36e776f..HEAD.
"""
import requests, sys, time

PROJECT = "studio-2290360004-3b963"
API_KEY = "AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY"
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
APPLY = "--apply" in sys.argv

auth = requests.post(
    f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}",
    json={"email": "billh@nsmarine.com.au", "password": "Bill2026!", "returnSecureToken": True},
    timeout=15,
).json()
if "idToken" not in auth:
    print("AUTH FAILED:", auth.get("error", {}).get("message", auth)); sys.exit(1)
H = {"Authorization": f"Bearer {auth['idToken']}", "Content-Type": "application/json"}
NOW = {"timestampValue": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}


def fs(v):
    if isinstance(v, bool): return {"booleanValue": v}
    if isinstance(v, int): return {"integerValue": str(v)}
    if isinstance(v, float): return {"doubleValue": v}
    if isinstance(v, str): return {"stringValue": v}
    if isinstance(v, list): return {"arrayValue": {"values": [fs(x) for x in v]}}
    if v is None: return {"nullValue": None}
    if isinstance(v, dict) and set(v.keys()) & {
        "stringValue", "integerValue", "doubleValue", "booleanValue",
        "timestampValue", "arrayValue", "nullValue",
    }:
        return v
    raise TypeError(f"unhandled value: {v!r}")


def put(path, data):
    if not APPLY:
        return "DRY"
    r = requests.patch(f"{BASE}/{path}", headers=H,
                       json={"fields": {k: fs(v) for k, v in data.items()}}, timeout=30)
    if r.status_code != 200:
        print(f"  FAIL {path}: {r.status_code} {r.text[:200]}"); sys.exit(1)
    return r.status_code


# ---------------------------------------------------------------- Epics ----
# Existing epic orders run 50..1100 (Epic 11 Service Quoting = 1100).
put("epics/mpf-migration", {
    "title": "Master Price File Migration",
    "shortLabel": "MPF Migration",
    "description": "Epic 12 — NSM's 17-workbook Master Price File migrated 1:1 into HelmLogic: boats, motors, trailers, factory options, parts, rigging, suppliers, service + pricing config, images. Content matches the MPF exactly; form upgraded (typed refs, explicit FX, ex-GST base, audit trail).",
    "color": "amber", "order": 1200, "status": "done",
    "createdAt": NOW, "updatedAt": NOW,
})
print("epic mpf-migration (Epic 12 — Master Price File Migration)")

put("epics/testing-evidence", {
    "title": "Testing & Evidence Overhaul",
    "shortLabel": "Testing & Evidence",
    "description": "Epic 13 — the testing system rebuilt around evidence: money-math unit suite, CI gate + nightly synthetic, visual regression via the sandbox TLS bridge, the 34,512-check MPF parity battery, and the fail-fix-retest ledger proving failures get fixed, never ignored.",
    "color": "cyan", "order": 1300, "status": "done",
    "createdAt": NOW, "updatedAt": NOW,
})
print("epic testing-evidence (Epic 13 — Testing & Evidence Overhaul)")


# -------------------------------------------------------------- Stories ----
def story(did, title, desc, epic, pts, typ, order, ac):
    put(f"features/{did}", {
        "title": title, "description": desc, "type": typ, "status": "shipped",
        "priority": "high", "targetRelease": "v1.31", "epicId": epic,
        "points": pts, "order": order, "voteIds": [], "tags": ["v1.31"],
        "submitterId": None, "submitterName": "v1.31 MPF migration cycle",
        "acceptanceCriteria": ac, "createdAt": NOW, "updatedAt": NOW,
    })
    print(f"  story {did}: {title[:78]}")


E12, E13 = "mpf-migration", "testing-evidence"

story("v131-12-1-1",
    "12.1.1 MPF ingestion + 17-workbook deep analysis",
    "Received NSM's Master Price File and decoded all 17 workbooks in 4 parallel analysis groups: the 678-real-column Boat Module matrix (2,003 boats, 29 blocks), the 21-sheet Parts family, Motors/Trailers/Factory Options, and Service + Price Matrix + 7 small modules. Found and defused phantom Excel dimensions (a sheet claiming 1,048,576 rows for 645 real; a Dropdowns sheet with a 200+ row data-island gap) — importers scan to proven data boundaries. Per-workbook analysis in tasks/mpf-audit/analysis/*, machine evidence in *.evidence.json, every step in AUDIT_LOG.jsonl.",
    E12, 5, "task", 1201,
    ["All 17 workbooks inventoried + decoded with per-sheet real bounds",
     "Phantom-dimension and data-island traps documented and neutralised in extractors",
     "Analysis docs + evidence JSON committed under tasks/mpf-audit/"]),

story("v131-12-1-2",
    "12.1.2 Master mapping + D1-D10 decision register",
    "Phase 1 synthesis (tasks/mpf-audit/MAPPING.md): every workbook mapped to its HelmLogic destination, 10 schema flexes specified (riggingKits, suppliers, supplierPriceLists, pricingMatrix, per-boat assignment menus, landed-cost chain, hull_campaign price level, obsolete flag...), plus systemic form upgrades — display-name string joins become validated ID references, mixed GST bases normalise to ex-GST with per-row conversion records, hardcoded FX becomes explicit exchangeRates, 193 cached #N/A/#VALUE! cells quarantined. Ten open decisions (D1-D10) put to Asaf; all recommendations accepted and logged before any write.",
    E12, 3, "task", 1202,
    ["MAPPING.md maps all 17 workbooks with confidence ratings",
     "D1-D10 rulings logged in AUDIT_LOG.jsonl before Phase 3/4 applies",
     "NSM data bugs documented for report-back (Stabicraft FO join break, Sell<CTD legacy ops, dup codes)"]),

story("v131-12-2-1",
    "12.2.1 Boats migration — 9 brands, 810 boats, landed cost, menus",
    "The Boat Module's 810 current boats imported across 9 brands with zero-duplicate vendor routing (5/8 vendors pre-existed, MF + CC nest as Jeanneau ranges, only Formosa net-new). Each boat carries its full landed-cost chain (base cost, factory charges, FX, duty, freight legs), inc-GST price ladder per D2, and curated per-boat menus — 13-slot motor menu, 10-slot trailer menu, 42 dealer-fit lines — as data on the variant. 1042/1042 writes applied after the transient-reset retry fix. Parity: 587/588 Highfield SKUs exact on sell AND cost (the 1 miss is a junk source SKU never imported).",
    E12, 8, "task", 1203,
    ["1042/1042 boat writes applied, 0 errors (apply-log-boats.jsonl)",
     "588 Highfield MPF SKUs verified against live variants — zero unexpected deltas",
     "Landed-cost chain + price ladder + motor/trailer/dealer-fit menus present per boat"]),

story("v131-12-2-2",
    "12.2.2 Motors / trailers / factory options — price levels + hull_campaign, 1,011 FO reprices",
    "Motor wave maps MPF price columns onto the priceLevels object (NSM Retail, Trade, Commercial, Boating Alliance, Total CTD as cost) plus the new hull_campaign level per D7 for campaign-discounted retail. Trailer wave lands 431 current trailers across the trailer-brand vendors. Factory-options wave reprices 1,011 live Highfield optionalFeatures by option code — fixing the systemic live-data break the diff exposed (USD-as-AUD prices with cost==sell). 608 writes applied after the updateMask backtick fix for spaced field names.",
    E12, 5, "task", 1204,
    ["208 Yamaha rows parity-clean on every price level; 71 skips match the approved plan verbatim",
     "1,011 factory options matched + price-clean by option code",
     "hull_campaign price level live, hidden unless populated"]),

story("v131-12-2-3",
    "12.2.3 Parts wave — 1,791 DFO / 3,660 fitUp / 26,345 serviceParts / 846 rigging / 1,606 suppliers",
    "The big-volume wave: 1,791 dealerFitSelections (the literal origin of the Act Sell / Act CTD convention), 3,660 fitUpItems with install hours + op-code linkage, 26,345 serviceParts DMS inventory rows keyed Franchise+Part, 846 riggingKits (128 NLA/#N/A rows correctly quarantined), and 1,606 suppliers with ABN/terms/credit. Run with 12-worker parallel writes + 401 token auto-refresh for the 34k-doc marathon. Every write logged to apply-log-parts.jsonl; upsert-by-natural-key throughout, never clear-and-replace.",
    E12, 8, "task", 1205,
    ["All five collections at exact expected counts, 0 missing / 0 unexpected live-only",
     "Pre-existing v1.10 items preserved (upsert never deletes)",
     "Quarantined rows excluded and reported, not imported as prices"]),

story("v131-12-2-4",
    "12.2.4 Service + pricing config — 364 ops, 189 schedules, pricing matrix, QLD rego, freight",
    "The org pricing brain: 364 service operations (flat-rate op codes, dedupe-suffixed ids, Sell<CTD legacy rows excluded), 189 engineServiceSchedules (per-engine 11-interval service price matrix + parts BOM), the 48-row pricingMatrix (47 franchise margin rows + retail sliding scale), 19 QLD rego bands wrapped state-explicit per the v1.4 lesson, per-vendor freightConfig feeding boat landed cost, and 4 exchange rates made explicit (replacing FX hardcoded inside MPF formulas). 653/653 writes, 0 failures, USD parity verified on the dry-run.",
    E12, 5, "task", 1206,
    ["653/653 service/config writes applied (apply-log-service.jsonl)",
     "285 unique op keys parity-clean, 0 rate/price drift",
     "pricingMatrix 48/48, schedules 189/189, freight 2/2, FX 4/4 exact"]),

story("v131-12-3-1",
    "12.3.1 Quote flow — NSM Recommended wiring (curated menus live)",
    "The relationship web becomes product: new nsm-recommended.tsx surfaces render the MPF's curated per-boat menus inside the Highfield quote flow — recommended motors (motorMenu), trailers (trailerMenu), dealer-fit lines, standard inclusions, deposit schedule and lead times. Curated menu is primary, the HP-range filter stays as fallback per D3. Every section is DATA-GATED: renders only when the importer wrote the fields, so pre-import quotes render exactly as before — zero regression.",
    E12, 5, "feature", 1207,
    ["NSM Recommended sections live on Steps of the Highfield quote flow",
     "Assignment web verified: motorMenu 94.7% / trailerMenu 99% / dealerFitLines 100% resolvable (all misses are source-data dangling refs or approved skips)",
     "Absent MPF data renders the pre-migration flow unchanged"]),

story("v131-12-3-2",
    "12.3.2 MPF Data admin tab + landed-cost breakdown + service schedule picker",
    "Operator surfaces for the new collections: a new Manage -> MPF Data section hosting managers for rigging kits, suppliers, supplier price lists, pricing matrix, engine service schedules and freight config; the pricing workspace gains a per-boat LandedCostBreakdown (chain rendered line by line, cost tagged '(landed)' when it equals MPF landed AUD, formula-deviation flag surfaced); the service-quote flow gains an engine service-schedule picker so a service quote can pull a priced interval straight from the 189 imported schedules.",
    E12, 5, "feature", 1208,
    ["Manage -> MPF Data tab mounts all six collection managers",
     "Landed-cost breakdown renders the full chain with landed-verification tag",
     "Engine schedule picker wired into the service-quote detail sheet"]),

story("v131-12-4-1",
    "12.4.1 Image audit + remediation — 1,056 doc patches, Storage mirror",
    "Three-layer image integrity pass: 579 unique catalog image URLs probed and classified (NSM-WAF 403, Yamaha Incapsula, SharePoint auth wall, dead links). 171 fetchable-but-blocked images mirrored to Firebase Storage under mpf-mirror/ and re-probed 200 image/*; 1,056 doc patches applied (896 dealerFitSelections + 31 motors + 129 boatModels) logged in apply-log-images.jsonl. Unfetchable classes documented as the NSM ask-list (Yamaha assets, SharePoint exports, refreshed Stacer links). Idempotent: mirrored docs skipped on re-run.",
    E12, 5, "task", 1209,
    ["171/171 mirrored Storage URLs verified 200 image/* after patching",
     "1,056 patch entries logged; boatModels 129/129 patched + retested",
     "FFR-15 GREEN; NSM ask-list documented in image-remediation.md"]),

# ---- Epic 13 — Testing & Evidence Overhaul --------------------------------
story("v131-13-1-1",
    "13.1.1 Money-math unit suite — 460 tests, 3 real bugs found + fixed",
    "First real unit-test suite (vitest) over the money paths: quote-financials, landed-cost, payment-schedule, promotions, stacking/refunds, v1.26 helpers — 460 tests. The suite earned its keep immediately by pinning 3 real production defects, all fixed properly: over-discount drove totals negative (now clamped to subtotal), cost:0 was falsy-swallowed by || (now ?? so zero-cost lines price honestly), and the payment schedule could float below zero (now floored). FFR-8 GREEN 460/460.",
    E13, 5, "improvement", 1301,
    ["460/460 unit tests green (tests/unit/*)",
     "3 money-math defects fixed in product code, not test code",
     "Suite runs in CI as the unit leg of the gate"]),

story("v131-13-1-2",
    "13.1.2 CI gate + nightly synthetic",
    "GitHub Actions CI (.github/workflows/ci.yml): a gate job on every dev push + PR into main (typecheck -> unit tests -> build hard gate) and a nightly synthetic job that builds, boots the prod server, runs the smoke-1000 battery against it, gates on the parsed pass/fail counts, uploads the evidence JSON as an artifact, and commits a dated history row back to tasks/test-evidence/history/.",
    E13, 3, "improvement", 1302,
    ["Gate job blocks merges on build failure; unit leg active",
     "Nightly synthetic archives evidence + appends HISTORY.md rows automatically",
     "93 pre-existing TypeScript errors fixed to make typecheck meaningful (FFR-7)"]),

story("v131-13-1-3",
    "13.1.3 Visual regression suite + sandbox TLS bridge",
    "Screenshot-baseline visual regression for the core screens (tests/visual/core-screens.spec.ts) plus the piece that makes any browser testing possible in the sandbox: tls-bridge.mjs, a local bridge that carries Chromium's traffic through the agent proxy's TLS handshake — Chromium flags alone don't survive it (FFR-6). playwright.visual + playwright.evidence configs route through the bridge with localhost bypass.",
    E13, 3, "improvement", 1303,
    ["Visual baselines committed under tests/visual/__screenshots__",
     "TLS bridge documented + reused by evidence/browser suites",
     "FFR-6 corrected in the ledger (bridge, not flags, is the fix)"]),

story("v131-13-2-1",
    "13.2.1 MPF parity battery — sections I/J, 34,512 checks",
    "smoke-1000 grew two sections: I. MPF parity (2,025 deterministic checks — 587 Highfield variants full-verify on sell+cost, sampled motors x 6 price fields, trailers x 4, DFOs x Act Sell/Act CTD, service ops, FX, pricing-matrix, rego bands) and J. Assignment web (menu references resolved against live catalog docs). Full battery: 34,498/34,512 passed with every one of the 14 fails individually explained (source-data dangling refs, approved plan skips, 2 negative-sell MPF source rows). Verdict: PARITY PROVEN — zero unexpected deltas across every module.",
    E13, 5, "improvement", 1304,
    ["34,498/34,512 checks passed; 14 fails all explained, none a parity failure",
     "Four read-only diff scripts regenerated fresh evidence before verdict",
     "MPF_PARITY.md + mpf-parity.json committed as the machine-readable proof"]),

story("v131-13-2-2",
    "13.2.2 Fail-fix-retest ledger + grand evidence report",
    "The ledger (tasks/test-evidence/fail-fix-retest.json) records every failure hit during the cycle — FFR-1 through FFR-16 — each with root cause, class (test-bug / product-fix / migration-fix / data-fix / environment-fix), the fixing commit and the green re-test. A suite that is only ever green proves nothing; the ledger proves failures get fixed and re-proven. Capped by the grand MPF migration evidence report: 12 sections, 17/18 live data sources, embedded screenshots, the full before/after story.",
    E13, 3, "improvement", 1305,
    ["FFR-1..FFR-16 all closed or explicitly dispositioned (FFR-16 solo re-run queued)",
     "Every fix cites its commit + green retest evidence",
     "Evidence report committed with live-data source counts + screenshots"]),

# ------------------------------------------------------------- Readback ----
if APPLY:
    rows = requests.post(f"{BASE}:runQuery", headers=H, timeout=60, json={
        "structuredQuery": {"from": [{"collectionId": "features"}], "limit": 2000}}).json()
    v131 = []
    for row in rows:
        if "document" not in row: continue
        f = row["document"].get("fields", {})
        if f.get("targetRelease", {}).get("stringValue") == "v1.31":
            v131.append((f.get("title", {}).get("stringValue", ""),
                         f.get("status", {}).get("stringValue", ""),
                         f.get("epicId", {}).get("stringValue", "")))
    print(f"\nREADBACK: {len(v131)} features with targetRelease=v1.31")
    for t, s, e in sorted(v131): print(f"  [{s}] ({e}) {t[:70]}")
    for eid in ("mpf-migration", "testing-evidence"):
        r = requests.get(f"{BASE}/epics/{eid}", headers=H, timeout=20)
        print(f"epics/{eid}: HTTP {r.status_code} — {r.json().get('fields', {}).get('title', {}).get('stringValue', '?')}" )
else:
    print("\nDRY-RUN complete (no writes). Re-run with --apply to seed.")

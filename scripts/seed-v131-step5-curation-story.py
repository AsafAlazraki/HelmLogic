#!/usr/bin/env python3
"""
v1.31 addendum — seed Story 12.4.2 (Step-5 curation engine) onto the Roadmap.

Follows the scripts/seed-v131-mpf-release.py pattern: idempotent by stable
doc id (PATCH replaces the doc each run), DRY-RUN by default, --apply to
write, read-back after apply.

Context: Asaf's 2026-07-04 field audit of quote-flow Step 5 found
data-consistent but product-senseless presentation (8 identical per-SKU
model-pack cards, F300 cowl covers on 15-30hp tenders, 7m tube covers on a
3.8m hull, workshop job-card sub-items, jarring MPF supplier headings,
NSM-logo images on most dealer-fit cards). Fixed by the Step-5 curation
engine (src/lib/step5-curation.ts) + a sanctioned 763-doc image data patch.
Evidence: tests/unit/step5-curation.test.ts (67 tests incl. the FFR-24
33-case classifier harness), tasks/test-evidence/fail-fix-retest.json
FFR-25..27, tasks/mpf-audit/apply-log-images.jsonl (class dfo-logo-mirror).
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
        print(f"  DRY {path}")
        return
    r = requests.patch(f"{BASE}/{path}", headers=H,
                       json={"fields": {k: fs(v) for k, v in data.items()}}, timeout=30)
    if r.status_code != 200:
        print(f"  FAIL {path}: {r.status_code} {r.text[:200]}"); sys.exit(1)
    print(f"  OK   {path}")


put("features/v131-12-4-2", {
    "title": "12.4.2 Step-5 curation engine — relevance rules, search, image hygiene",
    "description": (
        "Field-audit fix (Asaf, 2026-07-04): Step 5 dealer-fit was data-consistent but "
        "product-senseless. New pure curation engine (src/lib/step5-curation.ts) applied by "
        "the quote flow: (1) per-SKU model-pack dedupe — one Boat Pack card matching the "
        "ACTIVE hull variant instead of 8 identical material x colour rows (primary match: MPF "
        "part code embeds the variant SKU, 9HI_HBC 065_PD <-> HBC065; name-parse fallback); "
        "(2) NAMED item relevance rules, all fail-open and operator-bypassable: R-SUBITEM "
        "(Supply & Install job-card sub-items), R-NEWBOAT (engine removals stay in "
        "counter/service quotes), R-HP (HP-scoped items must overlap the model motor "
        "envelope), R-LEN (metre-scoped items within +/-0.4m of hull length, component "
        "dimensions like '1.8mtr Aerial' exempt), R-MATERIAL (PVC vs Hypalon follows the "
        "active variant), R-CONFIG (tiller kits only on tiller-steer boats), R-SIZE-TV/RADAR/"
        "UWLIGHT/EREEL (big-ticket gear gated on documented hull-length thresholds 7.0/6.0/"
        "5.0/6.0m); (3) keyword section routing — OUTBOARD/TILLER/PROP sections render under "
        "MOTOR dealer fit, TRAILER ACCESSOR/SETUP under TRAILER dealer fit; (4) display-name "
        "prettifier for the 93 MPF section headings (MAJESTIC TV OPTIONS -> 'TV & "
        "Entertainment') with the raw heading kept in a title attr; (5) Step-5 toolbar: "
        "debounced search + category filter chips + 'Show all items' escape hatch (narrowing "
        "never hard-blocks a sale; selected items never hide); (6) title-top consistent card "
        "layout — image area only exists when a real image resolves — plus responsive grid "
        "(xl:3 / 2xl:4 columns); (7) sanctioned data patch: 763 dealerFitSelections docs "
        "pointed at mpf-mirror files that were actually the WAF-served NSM logo (md5-verified "
        "visually) — 1,525 imageLink / items[].data['Image Link'] fields nulled, logged to "
        "apply-log-images.jsonl class dfo-logo-mirror, post-patch scan of all 1,791 docs "
        "shows 0 logo refs remaining. Live effect on a CL380: Boat Pack 8->1 cards, Tube "
        "Covers 60->6, 18 workshop rows + 20 job-card sub-items + radar/TV/underwater-light "
        "big-ticket rows hidden, 15 rows routed to motor/trailer steps."
    ),
    "type": "improvement", "status": "shipped",
    "priority": "high", "targetRelease": "v1.31", "epicId": "mpf-migration",
    "points": 5, "order": 1210, "voteIds": [], "tags": ["v1.31"],
    "submitterId": None, "submitterName": "v1.31 MPF migration cycle",
    "acceptanceCriteria": [
        "FFR-24 33-case classifier harness ported to vitest against the real module — ALL PASS",
        "One harness suite per named relevance rule (R-SUBITEM/R-NEWBOAT/R-HP/R-LEN/R-MATERIAL/R-CONFIG/R-SIZE-*), routing, dedupe, prettifier — 67 tests green (33 legacy + 34 new)",
        "763-doc logo-image data patch applied + re-scanned: 0 logo refs remain in dealerFitSelections",
        "Every hidden item stays reachable via Step-5 search + Show-all escape hatch",
        "typecheck 0; unit suite green; browser spot-check queued behind the fleet walk",
    ],
    "createdAt": NOW, "updatedAt": NOW,
})

# Read-back
if APPLY:
    r = requests.get(f"{BASE}/features/v131-12-4-2", headers=H, timeout=30)
    f = r.json().get("fields", {})
    print("\nREADBACK:", f.get("title", {}).get("stringValue"),
          "| status:", f.get("status", {}).get("stringValue"),
          "| targetRelease:", f.get("targetRelease", {}).get("stringValue"),
          "| epicId:", f.get("epicId", {}).get("stringValue"))
else:
    print("\nDRY-RUN complete. Re-run with --apply to write.")

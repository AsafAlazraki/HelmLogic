#!/usr/bin/env python3
"""
v1.31 close-out — seed 3 Roadmap stories so the board reflects ALL work done
plus the newly-planned image pipeline (Asaf, 2026-07-05).

  11.2.5 (shipped, v1.31)  Counter Quotes — standalone catalog quoting.
                           Built under decision.standalone-quotes; was only
                           narrated inside MODULE_QUOTES.md until now.
  13.2.3 (shipped, v1.31)  Adversarial audit wave — the hunt (UI / structure /
                           financial invariants + fleet walk + 809-boat web).
  3.10.5 (planned, v1.32)  Product-image acquisition pipeline — Asaf ruling
                           2026-07-05: possible, wanted, NOT now.

Idempotent by stable doc id (PATCH replaces). DRY-RUN by default; --apply to
write; read-back after apply. Same auth pattern as seed-v131-mpf-release.py.
"""
import requests, sys, time

PROJECT = "studio-2290360004-3b963"
API_KEY = "AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY"
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
APPLY = "--apply" in sys.argv

NOW = "2026-07-05T08:00:00Z"

STORIES = [
    {
        "id": "v131-11-2-5",
        "title": "11.2.5 Counter Quotes — standalone catalog quoting (motors / trailers / dealer fit / rigging)",
        "epicId": "YJBAT5KvPnN4BNdQwFKY",  # Service Quoting (NSM-Hub absorption)
        "status": "shipped",
        "targetRelease": "v1.31",
        "type": "feature",
        "priority": "high",
        "points": 5,
        "order": 1310,
        "tags": ["v1.31"],
        "description": (
            "Asaf's decision.standalone-quotes built: Service Quoting extended into "
            "Service & Counter Quotes so a standalone quote (no boat) can carry catalog "
            "items at MPF prices. New tabbed CatalogItemPicker (Motors / Trailers / "
            "Dealer Fit / Rigging Kits) mounted under the wizard's Parts step and on the "
            "detail sheet; 'New Motor/Trailer/Rigging Quote' hero pills on the matching "
            "modules deep-link via ?newQuote=1&catalogTab=…. This is the surface the "
            "motor-quoting focus (Bill + Asaf, 2026-07-05) builds on."
        ),
        "acceptanceCriteria": [
            "Motor priced at hull_cash (NSM Retail) exactly as the Yamaha row states",
            "Rigging kit + dealer-fit lines land at MPF Act Sell to the cent",
            "PDF grand total obeys the GST-ceil rule — browser-proven $23,201 = ceil(21,091.36 × 1.1) (tests/counter-quote.spec.ts, 2/2 green)",
            "Module hero pills open the wizard with the right catalog tab preselected",
        ],
        "submitterName": "v1.31 MPF migration cycle",
    },
    {
        "id": "v131-13-2-3",
        "title": "13.2.3 Adversarial audit wave — UI / structure / financial invariants + full-fleet walk + 809-boat relation web",
        "epicId": "testing-evidence",
        "status": "shipped",
        "targetRelease": "v1.31",
        "type": "improvement",
        "priority": "high",
        "points": 8,
        "order": 1311,
        "tags": ["v1.31"],
        "description": (
            "After parity was proven we attacked our own result: full Highfield fleet "
            "walk (85 models / 640 variants / 32,816 on-screen price asserts, all green), "
            "per-boat relation web across all 809 imported boats (ALL SETS EQUAL, 0 "
            "unexplained), and three adversarial audits — interface (UI-1…11), structure "
            "(74 code paths vs deployed rules, live-probed as a real non-admin), financial "
            "invariants (9 invariants, every flag verified against the MPF source workbook "
            "cell-by-cell). Ledger FFR-17…31; real fixes shipped for the hero carousel "
            "(FFR-30) and R-HP twin-engine scaling (FFR-31); zero data patches needed."
        ),
        "acceptanceCriteria": [
            "UI_AUDIT.md / STRUCTURE_AUDIT.md / INVARIANTS_AUDIT.md all closed with per-flag dispositions",
            "PER_BOAT_SETS.md re-run post-fix: 0 unexplained across 809 boats",
            "highfield-walk/results.json: 85/85 models green",
            "fail-fix-retest.json carries FFR-17…31 with green re-tests",
        ],
        "submitterName": "v1.31 MPF migration cycle",
    },
    {
        "id": "v132-3-10-5",
        "title": "3.10.5 Product-image acquisition pipeline — find, fetch, review, mirror",
        "epicId": "data-management",
        "status": "planned",
        "targetRelease": "v1.32",
        "type": "feature",
        "priority": "medium",
        "points": 5,
        "order": 1312,
        "tags": ["v1.32", "images"],
        "description": (
            "Asaf ruling 2026-07-05 (not now, planned): most dealer-fit / fit-up / parts "
            "cards have no image because NSM's own file never carried a real product shot "
            "(1,526 of 1,792 links served the NSM logo and were deliberately nulled in the "
            "v1.31 image remediation). Build a pipeline that closes the gap: (1) derive a "
            "search identity per item — part number first (HELLA / Lowrance / Garmin / "
            "Jabsco SKUs are in the names), name fallback; (2) query manufacturer / "
            "supplier product pages via an image-search API; (3) download candidates and "
            "mirror to Storage mpf-mirror/ (same pattern as the v1.31 remediation, immune "
            "to upstream firewalls); (4) HUMAN REVIEW queue before any doc patch — reuse "
            "the suggestion-approval pattern; a wrong image is worse than none; (5) apply "
            "approved images via updateMask patches with the standard before/after audit "
            "log. RELATED: submitted items 'No Engine Thumbnails' and 'How to add images "
            "dealer fit parts - Garmin head unit' are both satisfied by this story."
        ),
        "acceptanceCriteria": [
            "Part-number-first matching; generic names (e.g. 'SAFETY GEAR…') are skipped, never guessed",
            "Every candidate image goes through an operator review queue before it touches a doc",
            "Approved images serve from Firebase Storage, not hotlinks; audit log per patch",
            "Coverage report before/after per collection (dealerFitSelections / fitUpItems / serviceParts / motors)",
        ],
        "submitterName": "Asaf + Bill weekend direction",
    },
]


def fsval(v):
    if isinstance(v, bool):
        return {"booleanValue": v}
    if isinstance(v, int):
        return {"integerValue": str(v)}
    if isinstance(v, str):
        return {"stringValue": v}
    if isinstance(v, list):
        return {"arrayValue": {"values": [fsval(x) for x in v]}}
    raise TypeError(type(v))


def main():
    auth = requests.post(
        f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}",
        json={"email": "billh@nsmarine.com.au", "password": "Bill2026!", "returnSecureToken": True},
        timeout=15,
    ).json()
    if "idToken" not in auth:
        print("AUTH FAILED:", auth.get("error", {}).get("message"))
        sys.exit(1)
    hdrs = {"Authorization": f"Bearer {auth['idToken']}"}

    for s in STORIES:
        doc_id = s["id"]
        fields = {k: fsval(v) for k, v in s.items() if k != "id"}
        fields["createdAt"] = fsval(NOW)
        fields["updatedAt"] = fsval(NOW)
        fields["voteIds"] = {"arrayValue": {}}
        fields["submitterId"] = {"nullValue": None}
        if not APPLY:
            print(f"DRY-RUN would write features/{doc_id}: {s['title'][:70]}")
            continue
        r = requests.patch(f"{BASE}/features/{doc_id}", headers=hdrs,
                           json={"fields": fields}, timeout=20)
        print(f"{'OK' if r.ok else 'FAIL ' + str(r.status_code)}  features/{doc_id}  {s['title'][:60]}")
        if not r.ok:
            print(r.text[:300]); sys.exit(1)
        time.sleep(0.3)

    if APPLY:
        print("\nread-back:")
        for s in STORIES:
            r = requests.get(f"{BASE}/features/{s['id']}", headers=hdrs, timeout=15).json()
            f = r.get("fields", {})
            print(" ", s["id"], "->", f.get("status", {}).get("stringValue"),
                  f.get("targetRelease", {}).get("stringValue"),
                  f.get("title", {}).get("stringValue", "")[:55])


if __name__ == "__main__":
    main()

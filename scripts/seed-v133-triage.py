#!/usr/bin/env python3
"""
v1.33 kickoff — triage every `submitted` backlog item (Asaf ruling
2026-07-08: "close those off and build them", Mark's first) + seed the
Reporting epic. Idempotent PATCHes; DRY-RUN by default; --apply writes.
"""
import requests, sys, time

PROJECT = "studio-2290360004-3b963"
API_KEY = "AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY"
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
APPLY = "--apply" in sys.argv
NOW = "2026-07-08T12:00:00Z"

# (docId, status, targetRelease, triageNote)
TRIAGE = [
    # ---- Mark's items — FIXED in the v1.33 batches (commits e73435e / 7774579 / 3cc9765) ----
    ("zSZAa5AqOmHD9XN8gt4g", "shipped", "v1.33",
     "FIXED: soft-deleted quotes were still listed on All Proposals + My Work (no deletedAt filter) AND locked quotes could not take the deletedAt update (rules whitelist). Both fixed; onlySoftDeleteFieldsChanged() rules guard added."),
    ("n0q7TTSltQ0uKBA0ppSh", "shipped", "v1.33",
     "FIXED: category Select dedupe was case/whitespace-sensitive so 'other' rendered beside the hardcoded 'Other'. Normalised."),
    ("9uwPbAzA25CfiHhMGAZT", "shipped", "v1.33",
     "FIXED: the TipTap-to-PDF tokenizer only knew strong/b/em/i/a/br — underline/span/mark tags in the Finance & Insurance content block printed literally. All inline tags consumed + numeric entities decoded."),
    ("dRAPDJwo1h1HrNOlyVHJ", "shipped", "v1.33",
     "FIXED: fit-up tier packages (Simple/Medium/Complex) are now one-of — picking a tier drops the other tier's items — and clicking an already-on package toggles it OFF (undo exists)."),
    ("jNlJhAiL7PkHIe7Olqfj", "shipped", "v1.33",
     "FIXED (two layers): tier exclusivity + toggle-off (this release) and the Step-5 curation rules already hide length/size-inapplicable gear (v1.31 12.4.2). NOTE: the current Simple/Medium/Complex bundles are the v1.11 DEMO packages seeded catalogue-wide — brand captains should curate real per-boat packages; contents are theirs to own."),
    ("TY4YtMstFRqC9FsPqeJu", "shipped", "v1.33",
     "FIXED: no running price renders until material + colour are chosen (placeholder card until the exact variant exists)."),
    ("tLJNauixKMeashHf8Yjg", "shipped", "v1.33",
     "FIXED: catalog tables scroll inside a max-height container with sticky (frozen) column headers and an always-reachable horizontal scrollbar. Same fix as the 2026-07-06 duplicate."),
    ("2du0UPURZaYvUQn8DNN3", "shipped", "v1.33",
     "FIXED: duplicate of the 2026-06-22 report (same screen-recording bug). Contained scroll + frozen headers on all three catalog table views."),
    ("Ea0afjlWOGuV1I91j3r5", "shipped", "v1.33",
     "FIXED (code side): engine list + config now resolve thumbnails through the full FFR-30 image fallback chain and hide broken images instead of voiding. Rows whose ONLY image is a bot-walled Yamaha URL still need the Yamaha asset drop — standing NSM ask."),
    ("SvRWbbNvaiMr9QVqu2Kw", "shipped", "v1.33",
     "VERIFIED CORRECT: SP560 carries exactly 3 factory options, all SP560-scoped (catalog + override layers checked 2026-07-08; browser proof screenshot in tasks/test-evidence/ffr33-sp560-proof/s2-options.png). Likely misread: 'Fabric T Top for SUS750' names the SUS750 CONSOLE that fits the SP560, not an SP760 item."),
    ("B0Osr5sQuiXZ3t4xeQh3", "shipped", "v1.33",
     "VERIFIED CORRECT: the landed-cost chain itemises base cost, factory discounts, duty, Boat Prep, Base/Ocean Freight, Documentation, Fumigation, Fuel Surcharge, Other Charges, road freight and FX — verbatim from the MPF (landedVerified: true on every variant). Where freight shows $0 that is NSM's own file (freight rolled into base for those rows)."),
    # ---- Duplicates / already built ----
    ("nU6d25OvnXERiFH5myaq", "shipped", "v1.31",
     "ALREADY BUILT: standalone motor quoting shipped as Counter Quotes (v1.31) — 'New Motor Quote' pill on the Yamaha module; motor-quoting focus is the current phase."),
    ("qrYCZRhGcUCwt3Ux4vOU", "shipped", "v1.33",
     "FIXED with Mark's price-gate: Step 1 now hard-blocks Next until material + colour are chosen, with a toast naming what's missing."),
    ("jlff6tn8W8dfSa17glyW", "planned", "v1.33",
     "IN BUILD: manual image upload for dealer-fit parts (v1.33) + the automated product-image pipeline is story 3.10.5 (planned)."),
    # ---- Bill's build items → v1.33 planned ----
    ("dHxKMd3ABxynQCAbTuN3", "planned", "v1.33", "Queued: per-item remove control next to Clear All."),
    ("nRO3OTtVJnrEZFQxaPpE", "planned", "v1.33", "Queued: sticker price/cost data into the Rego module (figures supplied in the ticket)."),
    ("LbF3E1CMtWUwMBvc12ud", "planned", "v1.33", "Queued: drop the unused PRE-RIG INFORMATION section."),
    ("ArUUrcz2CMKEMzI6UGaA", "planned", "v1.33", "Queued: FACTORY OPTIONS gets its own heading on the PDF."),
    ("f1DqGKkueKrB8sxzpk7V", "planned", "v1.33", "Queued: PDF headings — 'Dealer' wording becomes 'Northside Marine'; clarify Dealer Accessories vs Fit-Up & Rigging."),
    ("JKanSmkR2QDWaysQhyva", "planned", "v1.33", "Queued: PDF section drag-to-reorder repair."),
    ("5q3kmCWKF9YHMdpBbmS7", "planned", "v1.33", "Queued: operator-added headings in the Factory Configurator (Paint Options, Cockpit Options, ...)."),
    ("otK3w8efkh1n3u76pC3g", "planned", "v1.33", "Queued: rebates/promotions listed on the matching quote section (promotions engine exists; surfacing work)."),
    ("35eP01EvzSL5YiOV9dv3", "planned", "v1.33", "Queued: ADMINISTRATION step in the flow (rego, trade-in, insurance, finance, warranty, licence upload — data largely exists at finalize)."),
    ("bPM7gxliygd4KzJk7ivp", "planned", "v1.33", "Queued: Build-A-Boat public mode — price levels locked to Cash or hidden for the NSM-website embed."),
    ("xN3iJHkgXoGKXSZJSl2Y", "planned", "v1.33", "Queued: larger option-card text / single-line layout (Four Winns reference)."),
    ("tWlk6MJQmWrKZL0Qk8S4", "submitted", None,
     "NEEDS RULING (Asaf): splitting Highfield models per console config (340 / 340 FCT / 340 GT) restructures the catalog for 85 models — confirm the shape before it's built."),
]


def fsval(v):
    if isinstance(v, bool): return {"booleanValue": v}
    if isinstance(v, (int, float)): return {"integerValue": str(int(v))}
    if isinstance(v, str): return {"stringValue": v}
    if v is None: return {"nullValue": None}
    if isinstance(v, list): return {"arrayValue": {"values": [fsval(x) for x in v]}}
    raise TypeError(type(v))


def main():
    auth = requests.post(
        f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}",
        json={"email": "billh@nsmarine.com.au", "password": "Bill2026!", "returnSecureToken": True},
        timeout=15).json()
    hdrs = {"Authorization": f"Bearer {auth['idToken']}"}

    for doc_id, status, target, note in TRIAGE:
        fields = {"status": fsval(status), "updatedAt": fsval(NOW), "triageNote": fsval(note)}
        mask = ["status", "updatedAt", "triageNote"]
        if target is not None:
            fields["targetRelease"] = fsval(target)
            mask.append("targetRelease")
        if not APPLY:
            print(f"DRY-RUN features/{doc_id} -> {status} {target or ''}")
            continue
        url = f"{BASE}/features/{doc_id}?" + "&".join(f"updateMask.fieldPaths={m}" for m in mask)
        r = requests.patch(url, headers=hdrs, json={"fields": fields}, timeout=20)
        print(("OK  " if r.ok else f"FAIL {r.status_code} ") + f"features/{doc_id} -> {status} {target or ''}")
        time.sleep(0.25)

    # Reporting epic + story
    epic = {
        "title": fsval("Usage Reporting & Telemetry"),
        "description": fsval("Highly visual reports of literally everything: sessions (active vs idle), every click/nav/action, every transaction — filtered by time/person/type, searchable, PDF-exportable. Test accounts tagged and filterable."),
        "createdAt": fsval(NOW), "updatedAt": fsval(NOW),
    }
    story = {
        "title": fsval("14.1.1 Reporting page — sessions, actions, transactions, filters, PDF export"),
        "epicId": fsval("usage-reporting"),
        "status": fsval("planned"), "targetRelease": fsval("v1.33"),
        "type": fsval("feature"), "priority": fsval("high"), "points": fsval(13),
        "order": fsval(1320), "tags": {"arrayValue": {"values": [fsval("v1.33")]}},
        "description": fsval("New /reporting nav page. Telemetry: per-session active-vs-idle time (visibility API + input heartbeats), every click/nav labeled, batched writes; domain transactions folded in from the existing audit trails (retroactive). Filters: date range, person, event type, free text; test accounts (billh) tagged with an on/off filter and remappable when the new test login lands. PDF export of the current filtered view via the react-pdf pipeline."),
        "submitterName": fsval("Asaf — v1.33 directive"),
        "createdAt": fsval(NOW), "updatedAt": fsval(NOW),
        "voteIds": {"arrayValue": {}}, "submitterId": {"nullValue": None},
    }
    if APPLY:
        r1 = requests.patch(f"{BASE}/epics/usage-reporting", headers=hdrs, json={"fields": epic}, timeout=20)
        r2 = requests.patch(f"{BASE}/features/v133-14-1-1", headers=hdrs, json={"fields": story}, timeout=20)
        print("epic:", r1.status_code, "story:", r2.status_code)
    else:
        print("DRY-RUN epic usage-reporting + story v133-14-1-1")


if __name__ == "__main__":
    main()

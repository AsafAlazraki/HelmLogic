#!/usr/bin/env python3
"""Roadmap hygiene — move the 6 PLANNED stories that were stranded on
already-shipped release columns (v1.10 / v1.17 / v1.21) off those green
columns so the Roadmap reads true.

A planned story sitting inside a shipped release reads as "we shipped a
release with unfinished work in it", which isn't the case: these are
either externally blocked or awaiting a repro, and one is a dead card.

Actions (idempotent, matched by title prefix):
  - Epic 11.3 NSM-Hub migration (11.3.1 / 11.3.2 / 11.3.3), stranded on
    v1.21 -> targetRelease 'Unscheduled'. Blocked on the NSM-Hub read
    service-account; not schedulable until that access lands.
  - Two awaiting-repro bugs stranded on v1.17 -> 'Unscheduled'. Can't be
    scheduled without a reproduction.
  - "Test level of proposals -" stranded on v1.10 -> status 'dropped'.
    A dead placeholder card (soft-delete per CLAUDE.md).

Does NOT touch:
  - The 13 Unscheduled ops/legal/decision items (correctly parked).
  - The 12 future-release planned items (correctly targeted forward).
  - The 18 Submitted field-feedback items (await product triage; assigning
    releases is a stakeholder call, not an automated one).
"""
import requests, sys

PROJECT = "studio-2290360004-3b963"
API_KEY = "AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY"

# title-prefix -> action
TO_UNSCHEDULE = (
    "11.3.1 ", "11.3.2 ", "11.3.3 ",                     # NSM-Hub, blocked on service-account
    "$76.82 price difference on RU200KAM",               # awaiting repro
    "HL Error on saving project",                        # awaiting repro
)
TO_DROP = (
    "Test level of proposals",                           # dead placeholder card
)

tok = requests.post(
    f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={API_KEY}",
    json={"returnSecureToken": True}, timeout=15,
).json()["idToken"]
H = {"Authorization": f"Bearer {tok}"}
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
dry = "--dry" in sys.argv


def sval(v):
    return v.get("stringValue") if isinstance(v, dict) else None


rows = requests.post(
    f"{BASE}:runQuery",
    json={"structuredQuery": {"from": [{"collectionId": "features"}], "limit": 700}},
    headers=H, timeout=30,
).json()

moved = dropped = 0
for row in rows:
    if "document" not in row:
        continue
    d = row["document"]
    f = {k: sval(x) for k, x in d.get("fields", {}).items()}
    t = f.get("title", "") or ""
    fid = d["name"].rsplit("/", 1)[1]

    if any(t.startswith(p) for p in TO_UNSCHEDULE):
        if f.get("targetRelease") == "Unscheduled":
            continue
        if dry:
            print(f"  would UNSCHEDULE [{f.get('targetRelease')}] {t[:60]}"); moved += 1; continue
        r = requests.patch(
            f"{BASE}/features/{fid}?updateMask.fieldPaths=targetRelease",
            json={"fields": {"targetRelease": {"stringValue": "Unscheduled"}}},
            headers=H, timeout=20,
        )
        if r.status_code == 200:
            moved += 1; print(f"  unscheduled [{f.get('targetRelease')}] {t[:58]}")

    elif any(t.startswith(p) for p in TO_DROP):
        if f.get("status") == "dropped":
            continue
        if dry:
            print(f"  would DROP [{f.get('targetRelease')}] {t[:60]}"); dropped += 1; continue
        r = requests.patch(
            f"{BASE}/features/{fid}?updateMask.fieldPaths=status",
            json={"fields": {"status": {"stringValue": "dropped"}}},
            headers=H, timeout=20,
        )
        if r.status_code == 200:
            dropped += 1; print(f"  dropped [{f.get('targetRelease')}] {t[:58]}")

print(f"Done: {moved} unscheduled, {dropped} dropped")
